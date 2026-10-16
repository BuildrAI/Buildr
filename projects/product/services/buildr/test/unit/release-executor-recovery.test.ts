import assert from 'node:assert/strict';
import test from 'node:test';
import { createReleaseContext, validateReleaseContext } from '../../tools/release/release-readiness.ts';
import { releaseExecutionCommit, validateReleaseExecutorRecovery } from '../../tools/release/release-executor-recovery.ts';
import { createReleaseTransactionEvidence, validateReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';
import { verifyReleaseExecutorPullRequest } from '../../tools/release/release-executor-admission.ts';
import { readHostedPluginNoWriteProof } from '../../tools/release/plugin-hosted-release.ts';

const sha = (letter: string) => letter.repeat(40);
const digest = (letter: string) => `sha256-${letter.repeat(64)}`;
function original() {
  return createReleaseContext({ release: { version: '1.2.3', sourceCommit: sha('a'), sourceTree: sha('b') },
    convergence: { mainCommit: sha('c'), mainTree: sha('b'), devCommit: sha('d') } });
}
function recovered() {
  const context = original();
  const { schemaVersion: _schema, identity: _identity, ...input } = context;
  return createReleaseContext({ ...input, executorRecovery: { schemaVersion: 'buildr.release-executor-recovery/v1', sourceCommit: sha('e'), sourceTree: sha('f'),
    workflowDigest: digest('1'), originalContextIdentity: context.identity, previousRunId: 42, previousRunAttempt: 2, previousEvidenceIdentity: digest('2') } });
}

test('legacy context projection omits recovery and retains its exact original identity', () => {
  const context = original();
  assert.equal(Object.hasOwn(context, 'executorRecovery'), false);
  assert.deepEqual(validateReleaseContext(context), context);
  assert.equal(validateReleaseExecutorRecovery(context), null);
  assert.equal(releaseExecutionCommit(context), sha('c'));
  assert.equal(context.identity, 'sha256-7fbdee9685e4469f6dff2ff5a9879a473cebdbe239eaf719c8df2522525489f0');
});

test('recovery changes only execution identity and rejects any altered original context', () => {
  const context = recovered();
  assert.equal(releaseExecutionCommit(context), sha('e'));
  assert.equal(context.convergence.mainCommit, sha('c'));
  assert.equal(context.release.sourceCommit, sha('a'));
  assert.notEqual(context.identity, original().identity);
  for (const alter of [
    (value: any) => { value.release.sourceCommit = sha('9'); },
    (value: any) => { value.convergence.mainCommit = sha('9'); },
    (value: any) => { value.executorRecovery.previousRunAttempt = 0; },
    (value: any) => { value.executorRecovery.extra = true; },
    (value: any) => { value.executorRecovery = null; },
    (value: any) => { value.executorRecovery.sourceCommit = sha('c'); },
  ]) {
    const value = structuredClone(context); alter(value);
    assert.throws(() => validateReleaseContext(value));
  }
});

test('publication evidence binds the real execution head while preserving the original tag target', () => {
  const context = recovered();
  const input = { context, publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId: 43, runAttempt: 1,
    runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/43', headSha: sha('e') }, outcome: 'passed',
    publicFacts: { version: '1.2.3', tagCommit: sha('c'), registryPublished: true, registryIntegrity: 'sha512-test', registrySmoke: 'passed', githubRelease: 'https://github.com/BuildrAI/Buildr/releases/tag/v1.2.3' } };
  const evidence = createReleaseTransactionEvidence(input);
  assert.deepEqual(validateReleaseTransactionEvidence(evidence), evidence);
  assert.equal(evidence.aggregateEligible, false);
  assert.equal(evidence.publish.headSha, sha('e'));
  assert.equal(evidence.release.tagCommit, sha('c'));
  assert.throws(() => createReleaseTransactionEvidence({ ...input, publish: { ...input.publish, headSha: sha('c') } }), /Publish run head/);
  assert.throws(() => createReleaseTransactionEvidence({ ...input, publicFacts: { ...input.publicFacts, tagCommit: sha('e') } }), /tag at/);
});

function pluginAdmissionFixture(): any {
  const repository = 'BuildrAI/Buildr', source = sha('a'), sourceTree = sha('b'), execution = sha('d'), head = sha('e');
  const event = { pull_request: { body: 'Original plugin publication run ID: 123', base: { ref: 'main', sha: execution },
    head: { ref: 'codex/release-executor-plugin-oidc', sha: head, repo: { full_name: repository } } } };
  const run = { id: 123, run_attempt: 1, repository: { full_name: repository }, event: 'workflow_dispatch', path: '.github/workflows/publish-dsh-plugin.yml',
    head_branch: 'main', head_sha: execution, display_title: 'DSH publish 0.1.0-rc.2', status: 'completed', conclusion: 'failure' };
  const journal = { schemaVersion: 'buildr.dsh-plugin-publication/v1', packageName: '@buildr-ai/buildr-dsh-plugin', version: '0.1.0-rc.2',
    sourceCommit: source, sourceTree, sha256: '1'.repeat(64), integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`,
    attempted: false, publishedObserved: false, status: 'blocked', action: 'blocked', registry: 'absent', observedAt: '2026-10-16T02:55:10.544Z',
    request: { runId: 123, runAttempt: 1, workflowRef: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main' }, code: 'plugin-oidc-authority-mismatch' };
  const reads: string[][] = [], paths = ['projects/product/services/dsh-plugin/tools/trusted-publish.ts'];
  const git = (args: string[]) => {
    reads.push(args);
    if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? head : args[1] === 'origin/main' ? execution
      : args[1] === `${source}:projects/product/services/dsh-plugin` ? sourceTree : sha('f');
    if (args[0] === 'show') return args[1].endsWith(':projects/product/services/dsh-plugin/package.json')
      ? JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin-source', private: true, version: journal.version }) : 'publisher workflow\n';
    if (args[0] === 'merge-base') return args.includes('--is-ancestor') ? '' : source;
    if (args[0] === 'diff') return `${paths.join('\0')}\0`;
    if (args[0] === 'ls-tree') return `100644 blob ${sha('1')}\t${args.at(-1)}\n`;
    return assert.fail(`unexpected admission Git read ${args.join(' ')}`);
  };
  const dependencies = { git, readRun: async () => run, readPluginJournal: async (options: any) => {
    assert.equal(options.runId, run.id); assert.equal(options.version, journal.version); return journal;
  }, readPluginNoWriteProof: async () => { throw new Error('No official skipped-upload proof'); },
  recoveryDependencies: { execute: (_command: string, args: string[]) => ({ status: 0, stdout: git(args) }) } };
  return { event, run, journal, dependencies, reads, paths, source, sourceTree, execution, head, repository };
}

test('plugin repair admission binds the authentic unattempted run and preserves source independently of the old executor', async () => {
  const f = pluginAdmissionFixture();
  const result = await verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies);
  assert.equal(result.status, 'passed'); assert.equal(result.kind, 'plugin-publisher-repair-admission'); assert.equal(result.aggregateEligible, false);
  assert.equal(result.originalRunId, 123); assert.equal(result.originalSourceCommit, f.source);
  assert.equal(result.originalExecutionCommit, f.execution); assert.equal(result.executionCommit, f.head);
  assert.equal(result.packageVersion, f.journal.version);
  assert.ok(f.reads.some((args: string[]) => args[0] === 'diff' && args.includes(f.source) && args.includes(f.head)));
  assert.ok(f.reads.some((args: string[]) => args[0] === 'diff' && args.includes(f.execution) && args.includes(f.head)));
  assert.equal(result.candidateRunId, undefined, 'admission cannot pretend to be a new package Candidate');
});

function noWriteAdmissionFixture(): any {
  const f = pluginAdmissionFixture(), calls: string[][] = [];
  const jobs = { total_count: 1, jobs: [{ id: 700, run_id: f.run.id, head_sha: f.execution, name: 'publish', status: 'completed', conclusion: 'failure', steps: [
    { number: 1, name: 'Verify candidate run and complete publication history', status: 'completed', conclusion: 'failure' },
    { number: 2, name: 'Publish immutable plugin', status: 'completed', conclusion: 'skipped' },
  ] }] };
  f.dependencies.readPluginJournal = async () => { throw new Error('No publication.json exists before the upload step'); };
  delete f.dependencies.readPluginNoWriteProof;
  f.dependencies.pluginDependencies = { execute: (command: string, args: string[]) => {
    assert.equal(command, 'gh'); assert.equal(args[0], 'api'); calls.push(args);
    return { status: 0, stdout: JSON.stringify(args[1].includes('/jobs?') ? jobs : f.run) };
  } };
  return { ...f, jobs, calls };
}

test('plugin PR admission uses official skipped-upload jobs without inventing a package source or publication journal', async () => {
  const f = noWriteAdmissionFixture();
  const result = await verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies);
  assert.equal(result.status, 'passed'); assert.equal(result.kind, 'plugin-pre-upload-repair-admission'); assert.equal(result.aggregateEligible, false);
  assert.equal(result.originalRunId, f.run.id); assert.equal(result.originalExecutionCommit, f.execution); assert.equal(result.executionCommit, f.head);
  assert.equal(result.packageVersion, f.journal.version); assert.match(result.noWriteProofIdentity, /^sha256-[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(result, 'originalSourceCommit'), false); assert.equal(Object.hasOwn(result, 'candidateRunId'), false);
  assert.equal(Object.hasOwn(result, 'journal'), false);
  assert.deepEqual(f.calls.map((args: string[]) => args[1]), [`repos/BuildrAI/Buildr/actions/runs/${f.run.id}`,
    `repos/BuildrAI/Buildr/actions/runs/${f.run.id}/attempts/1/jobs?per_page=100`]);
  const comparisons = f.reads.filter((args: string[]) => args[0] === 'diff');
  assert.equal(comparisons.length, 1); assert.ok(comparisons[0].includes(f.execution)); assert.ok(comparisons[0].includes(f.head));
});

test('pre-upload admission rejects incomplete, executed or mismatched official job proof and source changes', async t => {
  const cases: Array<[string, (f: any) => void]> = [
    ['incomplete jobs page', f => { f.jobs.total_count++; }],
    ['missing jobs', f => { f.jobs.total_count = 0; f.jobs.jobs = []; }],
    ['active job', f => { f.jobs.jobs[0].status = 'in_progress'; }],
    ['wrong job run', f => { f.jobs.jobs[0].run_id++; }],
    ['wrong job head', f => { f.jobs.jobs[0].head_sha = sha('9'); }],
    ['wrong publish job', f => { f.jobs.jobs[0].name = 'other'; }],
    ['missing upload step', f => { f.jobs.jobs[0].steps.pop(); }],
    ['upload executed successfully', f => { f.jobs.jobs[0].steps[1].conclusion = 'success'; }],
    ['upload attempted and failed', f => { f.jobs.jobs[0].steps[1].conclusion = 'failure'; }],
    ['upload unknown', f => { f.jobs.jobs[0].steps[1].conclusion = 'unknown'; }],
    ['upload unfinished', f => { f.jobs.jobs[0].steps[1].status = 'in_progress'; }],
    ['duplicate upload step', f => { f.jobs.jobs[0].steps.push({ ...f.jobs.jobs[0].steps[1], number: 3 }); }],
    ['different job has an upload step', f => { f.jobs.total_count++; f.jobs.jobs.push({ ...f.jobs.jobs[0], id: 701, name: 'other',
      steps: [{ ...f.jobs.jobs[0].steps[1], conclusion: 'success' }] }); }],
    ['new version', f => { const read = f.dependencies.git; f.dependencies.git = (args: string[]) => args[0] === 'show' && args[1].endsWith('/package.json')
      ? JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin-source', private: true, version: '0.1.0-rc.3' }) : read(args); }],
    ['payload change', f => { f.paths.push('projects/product/services/dsh-plugin/src/index.ts'); }],
    ['lock change', f => { f.paths.push('projects/product/services/dsh-plugin/package-lock.json'); }],
    ['unknown jobs API', f => { f.dependencies.pluginDependencies.execute = () => ({ status: 1, stderr: 'unavailable' }); }],
    ['tampered proof', f => { f.dependencies.readPluginNoWriteProof = (options: any, dependencies: any) => ({ ...readHostedPluginNoWriteProof(options, dependencies), identity: digest('9') }); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = noWriteAdmissionFixture(); mutate(f);
    await assert.rejects(() => verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies));
  });
  const f = pluginAdmissionFixture(); f.journal.attempted = true;
  f.dependencies.readPluginNoWriteProof = () => assert.fail('an existing attempted journal cannot fall back to another no-write proof');
  await assert.rejects(() => verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies));
});


test('plugin repair admission rejects unknown, attempted, mismatched or ambiguous original requests', async t => {
  const cases: Array<[string, (f: any) => void]> = [
    ['active run', f => { f.run.status = 'in_progress'; }],
    ['successful run', f => { f.run.conclusion = 'success'; }],
    ['cancelled run', f => { f.run.conclusion = 'cancelled'; }],
    ['wrong run', f => { f.run.id++; }],
    ['second attempt', f => { f.run.run_attempt = 2; }],
    ['wrong repository', f => { f.run.repository.full_name = 'other/repository'; }],
    ['wrong workflow', f => { f.run.path = '.github/workflows/verify.yml'; }],
    ['wrong event', f => { f.run.event = 'pull_request'; }],
    ['wrong branch', f => { f.run.head_branch = 'dev'; }],
    ['wrong executor', f => { f.run.head_sha = sha('9'); }],
    ['wrong version title', f => { f.run.display_title = 'DSH prepare 0.1.0-rc.2'; }],
    ['attempted write', f => { f.journal.attempted = true; }],
    ['public bytes observed', f => { f.journal.publishedObserved = true; }],
    ['unknown registry', f => { f.journal.registry = 'unknown'; }],
    ['present registry', f => { f.journal.registry = 'present'; }],
    ['running journal', f => { f.journal.status = 'running'; }],
    ['publishing journal', f => { f.journal.action = 'publishing'; }],
    ['different failure', f => { f.journal.code = 'plugin-current-buildr-incompatible'; }],
    ['wrong journal run', f => { f.journal.request.runId++; }],
    ['wrong journal attempt', f => { f.journal.request.runAttempt++; }],
    ['wrong journal workflow', f => { f.journal.request.workflowRef = 'BuildrAI/Buildr/.github/workflows/verify.yml@refs/heads/main'; }],
    ['wrong package', f => { f.journal.packageName = '@buildr-ai/buildr'; }],
    ['invalid hash', f => { f.journal.sha256 = 'bad'; }],
    ['invalid integrity', f => { f.journal.integrity = 'sha512-bad'; }],
    ['unknown journal fields', f => { f.journal.extra = 'unverified'; }],
    ['wrong source tree', f => { f.journal.sourceTree = sha('9'); }],
    ['duplicate plugin marker', f => { f.event.pull_request.body += '\nOriginal plugin publication run ID: 123'; }],
    ['mixed main and plugin markers', f => { f.event.pull_request.body += '\nOriginal publication run ID: 456'; }],
    ['unsafe run number', f => { f.event.pull_request.body = 'Original plugin publication run ID: 99999999999999999999'; }],
    ['fork head', f => { f.event.pull_request.head.repo.full_name = 'other/repository'; }],
    ['stale main base', f => { const read = f.dependencies.git; f.dependencies.git = (args: string[]) => args[1] === 'origin/main' ? sha('9') : read(args); }],
    ['wrong checkout', f => { const read = f.dependencies.git; f.dependencies.git = (args: string[]) => args[1] === 'HEAD' ? sha('9') : read(args); }],
    ['source version drift', f => { const read = f.dependencies.git; f.dependencies.git = (args: string[]) => args[1]?.endsWith('/package.json')
      ? JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin-source', private: true, version: '0.1.0-rc.3' }) : read(args); }],
    ['unrelated source ancestry', f => { const execute = f.dependencies.recoveryDependencies.execute; f.dependencies.recoveryDependencies.execute = (command: string, args: string[]) =>
      args[0] === 'merge-base' && args.includes(f.source) ? { status: 1, stderr: '' } : execute(command, args); }],
    ['unknown official API', f => { f.dependencies.readRun = async () => { throw new Error('API unavailable'); }; }],
    ['missing original journal', f => { f.dependencies.readPluginJournal = async () => { throw new Error('Expected one publication.json'); }; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = pluginAdmissionFixture(); mutate(f);
    await assert.rejects(() => verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies));
  });
});

test('plugin admission retains exact tool ownership and rejects payload, version, lock and SDK changes', async () => {
  for (const file of ['projects/product/services/dsh-plugin/package.json', 'projects/product/services/dsh-plugin/package-lock.json',
    'projects/product/services/dsh-plugin/src/index.ts', 'projects/product/services/dsh-plugin/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch',
    'projects/product/services/buildr/src/cli.ts', 'projects/product/services/buildr/package-lock.json']) {
    const f = pluginAdmissionFixture(); f.paths.push(file);
    await assert.rejects(() => verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies), /outside the explicit release-tool paths/u);
  }
  const f = pluginAdmissionFixture(), execute = f.dependencies.recoveryDependencies.execute;
  f.dependencies.recoveryDependencies.execute = (command: string, args: string[]) => args[0] === 'ls-tree'
    ? { status: 0, stdout: `120000 blob ${sha('1')}\t${args.at(-1)}\n` } : execute(command, args);
  await assert.rejects(() => verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies), /regular release-tool files/u);
});

test('main failed-publisher admission retains its original marker and original Candidate semantics', async () => {
  const f = pluginAdmissionFixture();
  f.event.pull_request.body = 'Original publication run ID: 456';
  const context = createReleaseContext({ release: { version: '1.2.3', sourceCommit: sha('a'), sourceTree: sha('b') },
    convergence: { mainCommit: sha('c'), mainTree: sha('b') }, candidate: { runId: 90 } });
  const evidence = createReleaseTransactionEvidence({ context, outcome: 'failed',
    publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId: 456, runAttempt: 2,
      headSha: sha('c'), runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/456' }, publicFacts: { version: '1.2.3' } });
  const git = f.dependencies.git;
  f.dependencies.git = (args: string[]) => args[0] === 'merge-base' && !args.includes('--is-ancestor') ? sha('c') : git(args);
  f.dependencies.inspect = async () => ({ status: 'failed', evidence });
  f.dependencies.readRun = () => assert.fail('a main marker must keep its original main inspection');
  f.dependencies.readPluginJournal = () => assert.fail('a main marker cannot read plugin journals');
  const result = await verifyReleaseExecutorPullRequest(f.event, f.repository, '/fixture', f.dependencies);
  assert.equal(result.status, 'passed'); assert.equal(result.kind, 'publisher-repair-admission'); assert.equal(result.originalRunId, 456);
  assert.equal(result.originalSourceCommit, sha('c')); assert.equal(result.candidateRunId, 90);
});
