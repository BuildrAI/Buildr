import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { preparePackageRelease, continuePackageRelease, evaluateObservedPackagePlan, validatePluginRecovery } from '../../tools/release/package-release-operation.ts';
import { normalizeReleaseTargets, evaluateReleasePlan } from '../../tools/release/release-targets.ts';
import { createReleaseContext } from '../../tools/release/release-readiness.ts';
import { createPackageReleaseContext } from '../../tools/release/release-package-evidence.ts';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';
import { runReleaseOperation } from '../../tools/release/release-orchestration-runner.ts';
import { spawnSync } from 'node:child_process';
import { checkPublicationCompatibility } from '../../tools/release/release-publication.ts';
import { runPluginHostedOperation } from '../../tools/release/plugin-hosted-release.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';

const hash = (digit: string) => digit.repeat(40), digest = (digit: string) => `sha256-${digit.repeat(64)}`;
const declaration = { schemaVersion: 'buildr.package-compatibility/v1', provides: ['buildr.web-protocol/v1'], requires: [] };
function artifact(name: string, origin = 'candidate', version = name === 'buildr' ? '0.2.0' : '0.1.0', sourceCommit = hash('b')): any {
  return { origin, packageName: name === 'buildr' ? '@buildr-ai/buildr' : '@buildr-ai/buildr-dsh-plugin', version,
    integrity: `sha512-${Buffer.alloc(64, name === 'buildr' ? 1 : 2).toString('base64')}`, artifactSha256: (name === 'buildr' ? '1' : '2').repeat(64),
    compatibility: name === 'buildr' ? structuredClone(declaration) : { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [
      { packageName: '@buildr-ai/buildr', feature: 'entry', required: true, versions: { minInclusive: '0.0.0', maxExclusive: '1.0.0', includePrerelease: true }, contracts: ['buildr.web-protocol/v1'] },
    ] }, ...(origin === 'candidate' ? { sourceCommit } : {}) };
}
function fixture(packages = 'dsh-plugin', buildrVersion = '0.2.0'): any {
  const targets = normalizeReleaseTargets({ packages, ...(packages.includes('buildr') ? { version: buildrVersion } : {}), ...(packages.includes('dsh-plugin') ? { pluginVersion: '0.1.0' } : {}) });
  const selection = { selectionId: targets.selectionId, version: targets.versions.buildr ?? null, targets, status: 'frozen', identity: digest('a'),
    selectionIdentity: digest('a'), releaseHead: hash('b'), releaseTree: hash('d'), generation: 1 };
  const convergence = { mainCommit: hash('c'), mainTree: selection.releaseTree, devCommit: hash('f'), mergeParents: [hash('e'), selection.releaseHead], pluginTree: hash('a') };
  const { selectionIdentity: _selectionIdentity, ...contextSelection } = selection;
  const owned: any = {}, published: any = {
    buildr: { status: 'present', artifact: artifact('buildr', 'registry', '0.1.0') }, 'dsh-plugin': { status: 'absent', packageName: '@buildr-ai/buildr-dsh-plugin' },
  };
  const candidates: any = {};
  for (const name of targets.packages) {
    const item = artifact(name, 'candidate', targets.versions[name], name === 'buildr' ? selection.releaseHead : convergence.mainCommit);
    candidates[name] = item;
    if (name === 'buildr') owned[name] = { artifact: item, ownerContext: createReleaseContext({ selection: contextSelection,
      release: { version: item.version, sourceCommit: selection.releaseHead, sourceTree: selection.releaseTree }, artifact: { sha256: item.artifactSha256, integrity: item.integrity },
      convergence: { mainCommit: convergence.mainCommit, mainTree: convergence.mainTree, devCommit: convergence.devCommit, mergeParents: convergence.mergeParents }, node: { authority: 'projects/product/.node-version', version: '24.15.0', executionIdentity: digest('d') } }) };
    else owned[name] = { artifact: item, prepareRunId: 100, prepareRunAttempt: 1, buildrPeer: targets.packages.includes('buildr') ? artifact('buildr', 'candidate', buildrVersion) : published.buildr.artifact,
      candidate: { schemaVersion: 'buildr.dsh-plugin-release-candidate/v1', packageName: item.packageName, version: item.version, sourceCommit: convergence.mainCommit,
        sourceTree: convergence.pluginTree, sha256: item.artifactSha256, integrity: item.integrity } };
  }
  const context = createPackageReleaseContext({ targets, selection: contextSelection, convergence, packages: owned,
    compatibility: evaluateReleasePlan({ targets, candidates, published }) });
  const state: any = { targets, context, workspace: '/fixture', executionRoot: '/fixture', sources: [], supportTasks: [], candidate: { runId: 90, sourceCommit: selection.releaseHead },
    preparationPeer: published.buildr.artifact, transactions: owned.buildr ? { buildr: { releaseContext: owned.buildr.ownerContext } } : {}, packagePublications: {} };
  const run = (name: string, id: number, conclusion = 'success') => ({ id, repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', path: `.github/workflows/${name === 'buildr' ? 'publish.yml' : 'publish-dsh-plugin.yml'}`,
    head_branch: 'main', head_sha: convergence.mainCommit, status: 'completed', conclusion, run_attempt: 1 });
  const journal = (id: number, status = 'passed') => ({ ...owned['dsh-plugin'].candidate,
    schemaVersion: 'buildr.dsh-plugin-publication/v1', status, attempted: true, publishedObserved: true, registry: 'present',
    request: { runId: id, runAttempt: 1, workflowRef: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main' } });
  const mainEvidence = (id: number) => createReleaseTransactionEvidence({ context: owned.buildr.ownerContext, outcome: 'passed',
    publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId: id, runAttempt: 1, headSha: convergence.mainCommit, runUrl: `https://github.com/BuildrAI/Buildr/actions/runs/${id}` },
    publicFacts: { version: targets.versions.buildr, tagCommit: convergence.mainCommit, registryPublished: true, registryIntegrity: owned.buildr.artifact.integrity,
      registrySmoke: 'passed', githubRelease: `https://github.com/BuildrAI/Buildr/releases/tag/v${targets.versions.buildr}` } });
  let saved = 0;
  const scope: any = { state, workspace: '/fixture', effects: [], save: () => { saved++; }, execute: () => assert.fail('unexpected real command'),
    git: (args: string[]) => args[0] === 'fetch' ? '' : args[1] === 'origin/main' ? convergence.mainCommit : args[1] === 'origin/dev' ? convergence.devCommit
      : args[0] === 'rev-list' ? [convergence.mainCommit, ...convergence.mergeParents].join(' ') : args[1]?.endsWith(':projects/product/services/dsh-plugin') ? convergence.pluginTree : convergence.mainTree,
    gh: () => assert.fail('unexpected GitHub call'), readRun: (id: number) => run('buildr', id) };
  let cleanups = 0, dispatches = 0, recoveryJournalId: number | null = null;
  const dependencies: any = {
    observePublishedPackageArtifact: async (name: string, options: any = {}) => options.version === targets.versions[name] && state.packagePublications[name]?.runId
      ? { observation: { status: 'present', artifact: { ...owned[name].artifact, origin: 'registry' } }, bytes: Buffer.from(name) }
      : { observation: published[name], ...(published[name].status === 'present' ? { bytes: Buffer.from(name) } : {}) },
    readCandidateEvidence: () => ({ packageArtifact: owned.buildr.artifact, tarballBytes: Buffer.from('buildr') }),
    readHostedPluginCandidate: () => ({ artifact: owned['dsh-plugin'].artifact, tarballBytes: Buffer.from('plugin'), candidate: owned['dsh-plugin'].candidate }),
    runHostedReleaseTransaction: async (_input: any, deps: any) => { dispatches++; deps.onDispatchIntent({ releaseId: 'one' }); deps.onDispatchObserved({ runId: 201 }); return { status: 'running', github: { runId: 201 } }; },
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidence: mainEvidence(201) }),
    runPluginHostedOperation: (input: any, deps: any) => {
      if (!input.pointer.requested) { dispatches++; input.pointer.requested = true; input.pointer.runId = input.pointer.recoveryRunId ? 203 : 202; deps.onPointer(); return { status: 'running', run: run('dsh-plugin', input.pointer.runId) }; }
      return { status: 'passed', run: run('dsh-plugin', input.pointer.runId), journal: journal(recoveryJournalId ?? input.pointer.runId) };
    },
    reconcilePublishedReleaseWithDev: () => ({ status: 'passed' }), closeoutReleaseGitResources: () => { cleanups++; return { status: 'passed' }; },
    runtime: { inspectTask: () => ({ record: { status: 'completed' } }) }, resolveRetainedController: () => ({}),
    invokeRetainedController: (_controller: any, args: string[]) => ({ status: args[0] === 'worktree' ? 'cleaned' : 'ready' }),
  };
  return { targets, selection, context, owned, state, published, candidates, scope, dependencies, run, journal,
    counts: () => ({ dispatches, cleanups, saved }), setRecoveryJournalId: (value: number) => { recoveryJournalId = value; } };
}

test('plugin-only preparation does not create a main transaction or require a new main version', async () => {
  const f = fixture();
  delete f.state.context;
  f.dependencies.runHostedReleaseTransaction = () => assert.fail('unselected main transaction');
  f.dependencies.runPluginHostedOperation = (input: any) => {
    assert.equal(input.peer.origin, 'registry'); assert.equal(input.peer.version, '0.1.0');
    return { status: 'passed', run: { id: 100, run_attempt: 1 }, artifact: f.owned['dsh-plugin'].artifact,
      candidate: f.owned['dsh-plugin'].candidate, verification: { peer: input.peer }, tarballBytes: Buffer.from('plugin') };
  };
  const result = await preparePackageRelease({ repo: '/fixture', mainCommit: hash('c'), selection: f.selection }, f.scope, f.dependencies);
  assert.equal(result.status, 'awaiting-publication-authorization'); assert.equal(result.context.selection.version, null);
  assert.equal(result.context.packages.buildr, undefined); assert.equal(f.state.transactions.buildr, undefined);
});

test('a new frozen selection archives a verified failed plugin preparation before requesting its new exact source', async () => {
  const f = fixture(), saved: any[] = [], calls: string[] = [];
  const previous = { requested: true, version: '0.1.0', sourceCommit: hash('e'), runId: 800,
    sourceCandidate: { runId: 89, commit: hash('9'), selectionIdentity: digest('8') } };
  f.state.pluginPreparation = structuredClone(previous);
  f.scope.save = () => saved.push(structuredClone(f.state));
  let lists = 0;
  f.scope.execute = (command: string, args: string[]) => {
    assert.equal(command, 'gh'); calls.push(args.slice(0, 2).join(' '));
    if (args[0] === 'api') {
      const old = args[1].endsWith('/800');
      return { status: 0, stdout: JSON.stringify({ ...f.run('dsh-plugin', old ? 800 : 801, old ? 'failure' : null),
        display_title: 'DSH prepare 0.1.0', head_sha: old ? previous.sourceCommit : hash('c'), status: old ? 'completed' : 'in_progress' }) };
    }
    if (args[0] === 'run') return { status: 0, stdout: JSON.stringify(lists++ === 0 ? [] : [{ databaseId: 801, displayTitle: 'DSH prepare 0.1.0', headSha: hash('c') }]) };
    assert.deepEqual(args.slice(0, 2), ['workflow', 'run']);
    assert.ok(args.includes(`source_commit=${f.selection.releaseHead}`));
    assert.ok(args.includes(`selection_identity=${f.selection.selectionIdentity}`));
    assert.deepEqual(saved.at(-1).pluginPreparationHistory[0].pointer, previous, 'the original complete request is saved before a new dispatch');
    return { status: 0, stdout: '' };
  };
  f.dependencies.runPluginHostedOperation = runPluginHostedOperation;
  const result = await preparePackageRelease({ repo: '/fixture', mainCommit: hash('c'), selection: f.selection }, f.scope, f.dependencies);
  assert.equal(result.status, 'plugin-preparation-running');
  assert.deepEqual(f.state.pluginPreparationHistory[0].pointer, previous);
  assert.equal(f.state.pluginPreparationHistory[0].failure.runId, 800);
  assert.equal(f.state.pluginPreparationHistory[0].failure.conclusion, 'failure');
  assert.equal(f.state.pluginPreparation.runId, 801); assert.equal(f.state.pluginPreparation.sourceCommit, hash('c'));
  assert.deepEqual(f.state.pluginPreparation.sourceCandidate, { runId: 90, commit: f.selection.releaseHead, selectionIdentity: f.selection.selectionIdentity });
  assert.equal(calls.filter(call => call === 'workflow run').length, 1);
  assert.equal(f.scope.effects.filter((effect: any) => effect.type === 'plugin-failed-preparation-replaced').length, 1);
});

test('publication authority or any recorded publication request prevents replacing the plugin prepare pointer', async () => {
  for (const publication of [
    { publicationAuthorization: { contextIdentity: digest('9') } }, { publication: { requested: true, runId: null } },
    { publicationEvidence: { status: 'passed' } }, { packagePublications: { buildr: { requested: true, runId: null } } },
    { packagePublications: { 'dsh-plugin': { requested: false, runId: 900 } } },
    { packagePublications: { 'dsh-plugin': { evidence: { status: 'passed' } } } },
  ]) {
    const f = fixture();
    const previous = { requested: true, version: '0.1.0', sourceCommit: hash('e'), runId: 800,
      sourceCandidate: { runId: 89, commit: hash('9'), selectionIdentity: digest('8') } };
    f.state.pluginPreparation = structuredClone(previous); Object.assign(f.state, publication);
    f.dependencies.runPluginHostedOperation = () => assert.fail('a publication-owned operation cannot start a new preparation');
    await assert.rejects(() => preparePackageRelease({ repo: '/fixture', mainCommit: hash('c'), selection: f.selection }, f.scope, f.dependencies), /no publication authorization or request/u);
    assert.deepEqual(f.state.pluginPreparation, previous); assert.equal(f.state.pluginPreparationHistory, undefined);
    assert.deepEqual(f.scope.effects, []); assert.equal(f.counts().saved, 0);
  }
});

test('a lost new dispatch preserves the observed failed original request and its history before returning unknown', async () => {
  const f = fixture(), saved: any[] = [];
  const previous = { requested: true, version: '0.1.0', sourceCommit: hash('e'), runId: null,
    sourceCandidate: { runId: 89, commit: hash('9'), selectionIdentity: digest('8') } };
  f.state.pluginPreparation = structuredClone(previous); f.scope.save = () => saved.push(structuredClone(f.state));
  let lists = 0, dispatches = 0;
  f.scope.execute = (command: string, args: string[]) => {
    assert.equal(command, 'gh');
    if (args[0] === 'run') return { status: 0, stdout: JSON.stringify(lists++ === 0
      ? [{ databaseId: 800, displayTitle: 'DSH prepare 0.1.0', headSha: previous.sourceCommit }] : []) };
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify({ ...f.run('dsh-plugin', 800, 'failure'), display_title: 'DSH prepare 0.1.0', head_sha: previous.sourceCommit }) };
    assert.deepEqual(args.slice(0, 2), ['workflow', 'run']); dispatches++;
    assert.deepEqual(saved.at(-1).pluginPreparationHistory[0].pointer, { ...previous, runId: 800 });
    return { status: 1, stderr: 'lost response' };
  };
  f.dependencies.runPluginHostedOperation = runPluginHostedOperation;
  const result = await preparePackageRelease({ repo: '/fixture', mainCommit: hash('c'), selection: f.selection }, f.scope, f.dependencies);
  assert.equal(result.status, 'plugin-preparation-dispatch-unconfirmed'); assert.equal(dispatches, 1);
  assert.deepEqual(f.state.pluginPreparationHistory[0].pointer, { ...previous, runId: 800 });
  assert.equal(f.state.pluginPreparationHistory[0].failure.conclusion, 'failure');
  assert.equal(f.state.pluginPreparation.runId, null); assert.equal(f.state.pluginPreparation.requested, true);
  assert.equal(f.state.pluginPreparation.sourceCommit, hash('c'));
});

test('plugin-only continuation binds authorization, original bytes and all owner readback before cleanup', async () => {
  const f = fixture();
  assert.equal((await continuePackageRelease({ action: 'publish' }, f.scope, f.dependencies)).status, 'authorization-required');
  assert.deepEqual(f.counts(), { dispatches: 0, cleanups: 0, saved: 0 });
  const first = await continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies);
  assert.equal(first.status, 'publication-running'); assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().cleanups, 0);
  const resumed = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(resumed.status, 'passed'); assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().cleanups, 1);
  assert.equal(f.state.publicationEvidence.publications.buildr, undefined);
});

test('joint continuation preserves successful first owner and cleans only after both original targets', async () => {
  const f = fixture('buildr,dsh-plugin');
  assert.deepEqual(f.context.compatibility.publicationOrder, ['buildr', 'dsh-plugin']);
  await continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies);
  assert.equal(f.counts().dispatches, 1);
  const second = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(second.package, 'dsh-plugin'); assert.equal(f.state.packagePublications.buildr.status, 'passed');
  assert.equal(f.counts().dispatches, 2); assert.equal(f.counts().cleanups, 0);
  const final = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(final.status, 'passed'); assert.equal(f.counts().dispatches, 2); assert.equal(f.counts().cleanups, 1);
});

test('after main publication the plugin observes the frozen peer channel without changing its prepared package', async () => {
  for (const [version, distTag] of [['0.2.0-rc.1', 'next'], ['0.2.0', 'latest']]) {
    const f = fixture('buildr,dsh-plugin', version), observations: any[] = [], pluginInputs: any[] = [];
    const observe = f.dependencies.observePublishedPackageArtifact, publish = f.dependencies.runPluginHostedOperation;
    f.dependencies.observePublishedPackageArtifact = async (name: string, options: any) => {
      observations.push({ name, ...options });
      return name === 'buildr' && options.distTag ? { observation: { status: 'present', artifact: { ...f.owned.buildr.artifact, origin: 'registry' } }, bytes: Buffer.from('buildr') }
        : observe(name, options);
    };
    f.dependencies.runPluginHostedOperation = (input: any, dependencies: any) => { pluginInputs.push(input); return publish(input, dependencies); };
    await continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies);
    assert.equal(observations.some(value => value.distTag), false, 'prepublication observations retain their original policy');
    const next = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
    assert.equal(next.package, 'dsh-plugin'); assert.equal(next.status, 'publication-running');
    assert.deepEqual(observations.filter(value => value.distTag), [{ name: 'buildr', distTag }]);
    assert.equal(pluginInputs[0].candidateRunId, 100); assert.equal(pluginInputs[0].sourceCommit, f.context.convergence.mainCommit);
    assert.equal(pluginInputs[0].originalSourceCommit, f.context.convergence.mainCommit);
  }
});

test('lost main dispatch response refuses ambiguous matching runs without adopting or repeating publication', async () => {
  const f = fixture('buildr');
  f.state.publicationAuthorization = { contextIdentity: f.context.identity };
  f.state.packagePublications.buildr = { contextIdentity: f.context.identity, requested: true, releaseId: 'one', runId: null };
  f.scope.gh = () => JSON.stringify([201, 202].map(databaseId => ({ databaseId, displayTitle: 'Release 0.2.0 (one)', headSha: f.context.convergence.mainCommit })));
  f.scope.readRun = () => assert.fail('an ambiguous request cannot adopt either run');
  const result = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(result.status, 'publication-dispatch-ambiguous');
  assert.equal(f.state.packagePublications.buildr.runId, null);
  assert.equal(f.counts().dispatches, 0); assert.equal(f.counts().cleanups, 0); assert.equal(f.counts().saved, 0);
});

function failedPublicationFixture(): any {
  const f = fixture('buildr,dsh-plugin'), executionCommit = hash('9');
  const oldRun = { ...f.run('buildr', 201, 'failure'), run_attempt: 2 };
  const failedEvidence = (publicFacts: any = {}) => createReleaseTransactionEvidence({ context: f.owned.buildr.ownerContext, outcome: 'failed',
    publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId: 201, runAttempt: 2,
      headSha: f.context.convergence.mainCommit, runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/201' },
    publicFacts: { version: f.targets.versions.buildr, tagCommit: f.context.convergence.mainCommit, registryPublished: false,
      registryObservation: 'absent', effects: [{ type: 'tag-reused', state: 'confirmed' }], ...publicFacts } });
  const evidence = failedEvidence(), saved: any[] = [], dispatches: any[] = [];
  f.state.publicationAuthorization = { contextIdentity: f.context.identity, cleanupPolicy: 'delete-owned-release-branches/v2' };
  f.state.packagePublications.buildr = { contextIdentity: f.context.identity, requested: true, runId: 201, releaseId: 'original', retryRequested: true };
  f.scope.save = () => saved.push(structuredClone(f.state));
  f.scope.readRun = (id: number) => id === 201 ? oldRun : { ...f.run('buildr', id), head_sha: executionCommit, status: 'in_progress', conclusion: null };
  f.scope.gh = (args: string[]) => {
    if (args[0] === 'run' && args[1] === 'view') return 'deterministic compatibility failure';
    assert.deepEqual(args.slice(0, 2), ['run', 'list']);
    return JSON.stringify([{ databaseId: 202, displayTitle: 'Release 0.2.0 (recovery)', headSha: executionCommit }]);
  };
  const git = f.scope.git;
  f.scope.git = (args: string[]) => args[0] === 'rev-parse' && args[1] === 'origin/main' ? executionCommit : git(args);
  f.scope.execute = (command: string, args: string[]) => {
    assert.equal(command, 'git');
    if (args[0] === 'merge-base') return { status: 0, stdout: '' };
    if (args[0] === 'rev-parse') return { status: 0, stdout: hash('8') };
    if (args[0] === 'show') return { status: 0, stdout: 'publisher on macOS\n' };
    if (args[0] === 'diff') return { status: 0, stdout: 'projects/product/services/buildr/tools/release/package-release-operation.ts\0' };
    if (args[0] === 'ls-tree') return { status: 0, stdout: `100644 blob ${hash('a')}\t${args.at(-1)}\n` };
    return assert.fail(`unexpected recovery command ${args.join(' ')}`);
  };
  f.dependencies.inspectHostedReleaseTransaction = async () => ({ status: 'failed', evidence });
  f.dependencies.observeUnpublishedRelease = async () => ({ facts: { npm: { state: 'absent' }, githubRelease: { state: 'absent' } }, activeRuns: [] });
  f.dependencies.inspectReleaseTag = () => ({ status: 'ready', action: 'reuse', observed: { targetCommit: f.context.convergence.mainCommit } });
  f.dependencies.runHostedReleaseTransaction = async (input: any, dependencies: any) => {
    assert.equal(input.releaseContext.convergence.mainCommit, f.context.convergence.mainCommit);
    assert.equal(input.sourceCommit, executionCommit);
    assert.equal(input.candidateBase, f.selection.releaseHead);
    assert.equal(input.candidateTree, f.selection.releaseTree);
    assert.equal(dependencies.candidateEvidence.packageArtifact, f.owned.buildr.artifact);
    if (input.action === 'readiness') return { status: 'ready', context: input.releaseContext };
    dispatches.push(input);
    assert.equal(saved.at(-1).publicationRecoveryHistory[0].pointer.runId, 201, 'original request must be saved before dispatch');
    dependencies.onDispatchIntent({ releaseId: 'recovery' });
    return { status: 'unknown' };
  };
  return { ...f, oldRun, evidence, failedEvidence, executionCommit, saved, dispatches };
}

test('failed original publication stays blocked until explicit recovery preserves history and dispatches the original bytes once', async () => {
  const f = failedPublicationFixture(), oldState = structuredClone(f.state);
  const before = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(before.status, 'diagnosis-required');
  assert.deepEqual(f.state, oldState); assert.equal(f.dispatches.length, 0);
  const recovered = await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies);
  assert.equal(recovered.status, 'publication-unknown'); assert.equal(f.dispatches.length, 1);
  const history = f.state.publicationRecoveryHistory[0];
  assert.deepEqual(history.context, oldState.context); assert.deepEqual(history.transaction, oldState.transactions.buildr);
  assert.deepEqual(history.pointer, oldState.packagePublications.buildr); assert.deepEqual(history.authorization, oldState.publicationAuthorization);
  assert.deepEqual(history.run, f.oldRun); assert.deepEqual(history.evidence, f.evidence);
  assert.deepEqual(f.state.context.targets, oldState.context.targets); assert.deepEqual(f.state.context.selection, oldState.context.selection);
  assert.deepEqual(f.state.context.convergence, oldState.context.convergence); assert.deepEqual(f.state.context.compatibility, oldState.context.compatibility);
  assert.deepEqual(f.state.context.packages['dsh-plugin'], oldState.context.packages['dsh-plugin']);
  assert.deepEqual(f.state.context.packages.buildr.artifact, oldState.context.packages.buildr.artifact);
  assert.notEqual(f.state.context.identity, oldState.context.identity);
  assert.equal(f.state.context.packages.buildr.ownerContext.executorRecovery.previousEvidenceIdentity, f.evidence.identity);
  assert.equal(f.state.publicationAuthorization.contextIdentity, f.state.context.identity);
  assert.equal(f.state.publicationAuthorization.previousContextIdentity, oldState.context.identity);
  assert.equal(f.state.packagePublications.buildr.requested, true); assert.equal(f.state.packagePublications.buildr.runId, null);
  const resumed = await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies);
  assert.equal(resumed.status, 'publication-running'); assert.equal(f.state.packagePublications.buildr.runId, 202);
  assert.equal(f.dispatches.length, 1); assert.equal(f.state.publicationRecoveryHistory.length, 1);
});

test('executor recovery preserves the complete old request for unsafe or unknown observations', async t => {
  const cases: Array<[string, (f: any) => void]> = [
    ['no run ID', f => { f.state.packagePublications.buildr.runId = null; }],
    ['first attempt', f => { f.oldRun.run_attempt = 1; }],
    ['active', f => { f.oldRun.status = 'in_progress'; }],
    ['success', f => { f.oldRun.conclusion = 'success'; }],
    ['cancelled', f => { f.oldRun.conclusion = 'cancelled'; }],
    ['timeout', f => { f.oldRun.conclusion = 'timed_out'; }],
    ['wrong source', f => { f.oldRun.head_sha = hash('6'); }],
    ['wrong workflow', f => { f.oldRun.path = '.github/workflows/verify.yml'; }],
    ['stale journal', f => { f.oldRun.run_attempt = 3; }],
    ['unknown journal', f => { f.dependencies.inspectHostedReleaseTransaction = async () => ({ status: 'unknown', evidence: f.evidence }); }],
    ['possible npm effect', f => { f.dependencies.inspectHostedReleaseTransaction = async () => ({ status: 'failed', evidence: f.failedEvidence({ effects: [{ type: 'npm-publish', state: 'unknown' }] }) }); }],
    ['published registry', f => { f.dependencies.inspectHostedReleaseTransaction = async () => ({ status: 'failed', evidence: f.failedEvidence({ registryPublished: true, registryObservation: 'present' }) }); }],
    ['unknown registry', f => { f.dependencies.observeUnpublishedRelease = async () => ({ facts: { npm: { state: 'unknown' }, githubRelease: { state: 'absent' } }, activeRuns: [] }); }],
    ['current publication active', f => { f.dependencies.observeUnpublishedRelease = async () => ({ facts: { npm: { state: 'absent' }, githubRelease: { state: 'absent' } }, activeRuns: [{ id: 300 }] }); }],
    ['tag drift', f => { f.dependencies.inspectReleaseTag = () => ({ status: 'ready', action: 'reuse', observed: { targetCommit: hash('6') } }); }],
    ['plugin request exists', f => { f.state.packagePublications['dsh-plugin'] = { requested: true, runId: null }; }],
    ['wrong authorization', f => { f.state.publicationAuthorization.contextIdentity = digest('9'); }],
    ['readiness blocked', f => { f.dependencies.runHostedReleaseTransaction = async () => ({ status: 'blocked' }); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = failedPublicationFixture(); mutate(f); const original = structuredClone(f.state);
    const result = await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies);
    assert.equal(result.status, 'publication-recovery-blocked'); assert.deepEqual(f.state, original);
    assert.equal(f.saved.length, 0); assert.equal(f.dispatches.length, 0); assert.deepEqual(f.scope.effects, []);
  });
  for (const options of [{ action: 'resume', recoverPublication: true }, { action: 'publish', authorized: true, recoverPublication: true }]) {
    const f = failedPublicationFixture(), original = structuredClone(f.state);
    assert.equal((await continuePackageRelease(options, f.scope, f.dependencies)).status, 'authorization-required');
    assert.deepEqual(f.state, original); assert.equal(f.saved.length, 0);
  }
});

test('publication recovery rejects unreadable evidence, changed bytes and non-tool executor changes without state writes', async () => {
  for (const mutate of [
    (f: any) => { f.scope.readRun = () => { throw new Error('API unavailable'); }; },
    (f: any) => { f.dependencies.inspectHostedReleaseTransaction = async () => ({ status: 'unknown' }); },
    (f: any) => { f.dependencies.readCandidateEvidence = () => ({ packageArtifact: { ...f.owned.buildr.artifact, artifactSha256: '9'.repeat(64) } }); },
    (f: any) => { const execute = f.scope.execute; f.scope.execute = (command: string, args: string[]) => args[0] === 'diff'
      ? { status: 0, stdout: 'projects/product/services/buildr/src/cli.ts\0' } : execute(command, args); },
    (f: any) => { const read = f.scope.git; let mainReads = 0; f.scope.git = (args: string[]) => args[1] === 'origin/main' && ++mainReads > 1 ? hash('7') : read(args); },
  ]) {
    const f = failedPublicationFixture(); mutate(f); const original = structuredClone(f.state);
    let result: any;
    try { result = await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies); }
    catch (error) { assert.ok(error instanceof Error); }
    if (result) assert.equal(result.status, 'publication-recovery-blocked');
    assert.deepEqual(f.state, original); assert.equal(f.saved.length, 0); assert.equal(f.dispatches.length, 0);
  }
});

test('frozen byte/context drift and unknown peer block only the next public action', async () => {
  const f = fixture();
  f.dependencies.readHostedPluginCandidate = () => ({ artifact: { ...f.owned['dsh-plugin'].artifact, artifactSha256: '9'.repeat(64) } });
  await assert.rejects(() => continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies), /bytes changed/u);
  assert.equal(f.counts().dispatches, 0);
  f.dependencies.readHostedPluginCandidate = () => ({ artifact: f.owned['dsh-plugin'].artifact, tarballBytes: Buffer.from('plugin') });
  f.published.buildr = { status: 'unknown', packageName: '@buildr-ai/buildr' };
  assert.equal((await continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies)).status, 'compatibility-blocked');
  assert.equal(f.counts().dispatches, 0);
  f.state.packagePublications['dsh-plugin'] = { requested: true, runId: 202, contextIdentity: digest('9') };
  await assert.rejects(() => continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies), /different frozen context/u);
});

test('attempted plugin with exact public bytes uses one bound recovery request, never repeats its publication', async () => {
  const f = fixture();
  await continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies);
  const original = f.dependencies.runPluginHostedOperation;
  f.dependencies.runPluginHostedOperation = (input: any, deps: any) => input.pointer.runId === 202
    ? { status: 'blocked', run: f.run('dsh-plugin', 202, 'failure'), journal: f.journal(202) } : original(input, deps);
  f.setRecoveryJournalId(202);
  const recovered = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(recovered.status, 'publication-running'); assert.equal(f.counts().dispatches, 2);
  assert.equal(f.state.packagePublications['dsh-plugin'].recoveryRunId, 202);
  assert.deepEqual(f.state.packagePublications['dsh-plugin'].previousRunIds, [202]);
  assert.equal((await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies)).status, 'passed');
  assert.equal(f.counts().dispatches, 2);
});

test('unknown journal/public state cannot authorize a recovery; failed actual legacy proof remains local', async () => {
  const f = fixture();
  assert.throws(() => validatePluginRecovery(f.context, { run: f.run('dsh-plugin', 202, 'failure'), journal: { ...f.journal(202), attempted: false } }, { ...f.owned['dsh-plugin'].artifact, origin: 'registry' }));
  const old = artifact('buildr', 'registry', '0.1.0'); old.compatibility = null;
  const consumer = artifact('dsh-plugin'); consumer.compatibility = null;
  const result = await evaluateObservedPackagePlan(f.targets, { 'dsh-plugin': { artifact: consumer, bytes: Buffer.from('plugin') } },
    { buildr: { observation: { status: 'present', artifact: old }, bytes: Buffer.from('main') }, 'dsh-plugin': { observation: f.published['dsh-plugin'] } }, { verifyBuildrPluginPair: () => { throw new Error('Local installation unavailable'); } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.pairDiagnostics[0].stage, 'pair-verification');
  assert.equal(result.pairDiagnostics[0].message, 'Local installation unavailable');
});

test('blocked child execution retains its original stage and code without changing a passing release context', async () => {
  const targets = normalizeReleaseTargets({ version: '0.2.0' }), main = artifact('buildr'), old = artifact('dsh-plugin', 'registry');
  old.compatibility = null;
  const candidates = { buildr: { artifact: main, bytes: Buffer.from('main') } };
  const counterparts = { 'dsh-plugin': { observation: { status: 'present', artifact: old }, bytes: Buffer.from('plugin') } };
  const proof = (status: 'unknown' | 'passed') => ({ status: status === 'passed' ? 'passed' : 'blocked', diagnostic: 'pair-runtime-unavailable',
    execution: { stage: 'provider-install', code: 'isolated-npm-operation-failed', errorCode: 'ETIMEDOUT', exitCode: null },
    legacyPairEvidence: { schemaVersion: 'buildr.package-pair-evidence/v1', consumer: old, provider: main,
      features: [{ feature: 'entry', required: true, status }], evidenceSha256: 'a'.repeat(64) } });
  const blocked = await evaluateObservedPackagePlan(targets, candidates, counterparts, { verifyBuildrPluginPair: () => proof('unknown') });
  assert.equal(blocked.status, 'blocked'); assert.equal(blocked.checks[0].features[0].status, 'unknown');
  assert.equal(blocked.pairDiagnostics[0].code, 'isolated-npm-operation-failed');
  assert.equal(blocked.pairDiagnostics[0].errorCode, 'ETIMEDOUT');
  assert.equal(blocked.pairDiagnostics[0].consumer.version, old.version);
  const passed = await evaluateObservedPackagePlan(targets, candidates, counterparts, { verifyBuildrPluginPair: () => proof('passed') });
  assert.equal(passed.status, 'passed'); assert.equal(passed.pairDiagnostics, undefined);
});

test('new default operations bind targets; an existing selection ID cannot change versions', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-operation-default-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-b', 'dev'], { cwd: root }).status, 0);
  const metadata = path.join(root, 'projects/product/services/buildr/package.json'); fs.mkdirSync(path.dirname(metadata), { recursive: true });
  fs.writeFileSync(metadata, JSON.stringify({ version: '0.2.0', buildrCompatibility: declaration }));
  const noEffects = { execute: () => assert.fail('same ID conflict must be rejected before any command') };
  const result = await runReleaseOperation({ action: 'publish', version: '0.2.0', workspace: root }, noEffects);
  assert.equal(result.status, 'preparation-required'); assert.equal(result.selectionId, '0.2.0');
  const file = path.join(root, '.git/buildr/release-operations/0.2.0.json');
  fs.writeFileSync(file, JSON.stringify({ workspace: root, version: '0.2.0', targets: normalizeReleaseTargets({ version: '0.2.0' }), sources: [] }));
  await assert.rejects(() => runReleaseOperation({ action: 'publish', version: '0.3.0', selectionId: '0.2.0', workspace: root }, noEffects), /identity conflicts/u);
});

test('protected main owner rechecks actual final archive against the peer observed after approval', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publication-current-peer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owned = await createReleaseArtifactFixture(root, hash('b'));
  const context = { release: { version: owned.manifest.version } };
  let observations = 0;
  const absent = await checkPublicationCompatibility({ context, artifact: owned }, { observePublishedPackageArtifact: async () => {
    observations++; return { observation: { status: 'absent', packageName: '@buildr-ai/buildr-dsh-plugin' } };
  } });
  assert.equal(absent.status, 'passed'); assert.equal(observations, 1);
  const movedPlugin = artifact('dsh-plugin', 'registry'); movedPlugin.compatibility.requires[0].contracts = ['buildr.future-protocol/v1'];
  const blocked = await checkPublicationCompatibility({ context, artifact: owned }, { observePublishedPackageArtifact: async () => {
    observations++; return { observation: { status: 'present', artifact: movedPlugin } };
  } });
  assert.equal(blocked.status, 'blocked'); assert.equal(observations, 2);
});

test('old records cannot add a declared package write through prepare, publish, resume or failed-run retry', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-legacy-contract-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-b', 'dev'], { cwd: root }).status, 0);
  const f = fixture('buildr'), metadata = path.join(root, 'projects/product/services/buildr/package.json');
  fs.mkdirSync(path.dirname(metadata), { recursive: true }); fs.writeFileSync(metadata, JSON.stringify({ version: '0.2.0', buildrCompatibility: declaration }));
  const { schemaVersion: _schema, identity: _identity, ...input } = f.owned.buildr.ownerContext;
  delete input.selection.targets; delete input.selection.selectionId;
  const context = createReleaseContext(input), file = path.join(root, '.git/buildr/release-operations/0.2.0.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const state: any = { schemaVersion: 'buildr.release-operation-input/v1', version: '0.2.0', workspace: root, sources: [], context,
    candidate: { runId: 90 }, transaction: { candidateRunId: 90 }, publication: null };
  for (const action of ['prepare', 'publish', 'resume']) {
    fs.writeFileSync(file, JSON.stringify(state));
    const value = await runReleaseOperation({ action, version: '0.2.0', workspace: root, authorized: true }, { execute: () => assert.fail('no fresh legacy writes or remote calls') });
    assert.equal(value.status, 'preparation-required', JSON.stringify(value));
  }
  state.publication = { requested: true, runId: 201, contextIdentity: context.identity }; fs.writeFileSync(file, JSON.stringify(state));
  const calls: string[][] = [];
  const blocked = await runReleaseOperation({ action: 'resume', version: '0.2.0', workspace: root }, {
    candidateDependencies: { candidateEvidence: { packageArtifact: f.owned.buildr.artifact, tarballBytes: Buffer.from('original') } },
    packageDependencies: { observePublishedPackageArtifact: async (name: string) => ({ observation: { status: 'unknown', packageName: name === 'buildr' ? '@buildr-ai/buildr' : '@buildr-ai/buildr-dsh-plugin' } }) },
    execute: (command: string, args: string[]) => {
      assert.equal(command, 'gh'); calls.push(args);
      if (args[0] === 'api') return { status: 0, stdout: JSON.stringify(f.run('buildr', 201, 'failure')) };
      if (args[0] === 'run' && args[1] === 'view') return { status: 0, stdout: 'ECONNRESET during remote request' };
      assert.fail('compatibility blocked a new retry before any public request');
    },
  });
  assert.equal(blocked.status, 'compatibility-blocked', JSON.stringify(blocked));
  assert.equal(calls.some(args => args[1] === 'rerun'), false);
});

function unattemptedPluginFixture(): any {
  const f = failedPublicationFixture(), executionCommit = hash('7'), mainExecution = hash('9');
  const originalOwner = f.context.packages.buildr.ownerContext;
  const { schemaVersion: _schema, identity: _identity, ...ownerInput } = originalOwner;
  const ownerContext = createReleaseContext({ ...ownerInput, executorRecovery: {
    schemaVersion: 'buildr.release-executor-recovery/v1', sourceCommit: mainExecution, sourceTree: hash('8'), workflowDigest: digest('8'),
    originalContextIdentity: originalOwner.identity, previousRunId: 199, previousRunAttempt: 2, previousEvidenceIdentity: digest('7') } });
  f.state.context = createPackageReleaseContext({ ...f.context, packages: { ...f.context.packages, buildr: { ...f.owned.buildr, ownerContext } } });
  const context = f.state.context;
  const mainRun = { ...f.run('buildr', 201), head_sha: mainExecution };
  const mainEvidence = createReleaseTransactionEvidence({ context: ownerContext, outcome: 'passed',
    publish: { repository: 'BuildrAI/Buildr', workflow: mainRun.path, runId: 201, runAttempt: 1, headSha: mainExecution, runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/201' },
    publicFacts: { version: f.targets.versions.buildr, tagCommit: context.convergence.mainCommit, registryPublished: true,
      registryIntegrity: f.owned.buildr.artifact.integrity, registrySmoke: 'passed', githubRelease: 'https://github.com/BuildrAI/Buildr/releases/tag/v0.2.0' } });
  const mainPublication = { registryArtifact: { ...f.owned.buildr.artifact, origin: 'registry' }, run: mainRun, ownerEvidence: mainEvidence };
  f.state.packagePublications = {
    buildr: { contextIdentity: context.identity, requested: true, runId: 201, status: 'passed', evidence: mainPublication },
    'dsh-plugin': { contextIdentity: context.identity, requested: true, runId: 202, version: f.targets.versions['dsh-plugin'], sourceCommit: mainExecution },
  };
  f.state.publicationAuthorization.contextIdentity = context.identity;
  const oldRun = { ...f.run('dsh-plugin', 202, 'failure'), head_sha: mainExecution };
  const journal: any = { ...f.journal(202, 'blocked'), action: 'blocked', code: 'plugin-oidc-authority-mismatch', attempted: false, publishedObserved: false, registry: 'absent' };
  f.scope.readRun = (id: number) => id === 201 ? mainRun : oldRun;
  f.scope.gh = () => JSON.stringify({ total_count: 1, workflow_runs: [oldRun] });
  f.scope.git = (args: string[]) => args[0] === 'fetch' ? '' : args[1] === 'origin/main' ? executionCommit : hash('8');
  f.dependencies.inspectHostedReleaseTransaction = async () => ({ status: 'passed', evidence: mainEvidence });
  f.dependencies.runHostedReleaseTransaction = () => assert.fail('completed main package must never be dispatched again');
  const observe = f.dependencies.observePublishedPackageArtifact;
  f.dependencies.observePublishedPackageArtifact = (name: string, options: any) => name === 'dsh-plugin'
    ? { observation: { status: 'absent', packageName: '@buildr-ai/buildr-dsh-plugin' } } : observe(name, options);
  const requests: any[] = [];
  f.dependencies.runPluginHostedOperation = (input: any, deps: any) => {
    if (input.sourceCommit === mainExecution) return { status: 'blocked', run: oldRun, journal };
    assert.equal(input.sourceCommit, executionCommit); assert.equal(input.originalSourceCommit, context.convergence.mainCommit);
    assert.equal(input.candidateRunId, 100);
    if (!input.pointer.requested) {
      assert.equal(f.saved.at(-1).pluginPublicationRecoveryHistory[0].pointer.runId, 202, 'history is durable before the new request');
      requests.push(input); Object.assign(input.pointer, { requested: true, runId: null, sourceCommit: executionCommit, version: input.version }); deps.onPointer();
    }
    return { status: 'dispatch-unconfirmed' };
  };
  return { ...f, executionCommit, mainExecution, originalContext: context, oldRun, journal, requests };
}

test('unattempted plugin executor recovery preserves published main E1 evidence and original bytes while dispatching E2 only once', async () => {
  const f = unattemptedPluginFixture(), before = structuredClone(f.state);
  const result = await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies);
  assert.equal(result.status, 'publication-dispatch-unconfirmed'); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.state.context.packages.buildr, before.context.packages.buildr);
  assert.deepEqual(f.state.packagePublications.buildr.evidence, before.packagePublications.buildr.evidence);
  assert.equal(f.state.packagePublications.buildr.runId, 201);
  assert.equal(f.state.packagePublications.buildr.contextIdentity, f.state.context.identity);
  const { executorRecovery, ...plugin } = f.state.context.packages['dsh-plugin'];
  assert.deepEqual(plugin, before.context.packages['dsh-plugin']);
  assert.equal(executorRecovery.sourceCommit, f.executionCommit); assert.equal(executorRecovery.originalContextIdentity, before.context.identity);
  assert.deepEqual(f.state.pluginPublicationRecoveryHistory[0].context, before.context);
  assert.deepEqual(f.state.pluginPublicationRecoveryHistory[0].pointer, before.packagePublications['dsh-plugin']);
  assert.deepEqual(f.state.pluginPublicationRecoveryHistory[0].journal, f.journal);
  assert.equal((await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies)).status, 'publication-dispatch-unconfirmed');
  assert.equal(f.requests.length, 1); assert.equal(f.state.pluginPublicationRecoveryHistory.length, 1);
  f.dependencies.runPluginHostedOperation = (input: any) => {
    assert.equal(input.sourceCommit, f.executionCommit); assert.equal(input.pointer.requested, true);
    input.pointer.runId = 203;
    return { status: 'passed', run: { ...f.run('dsh-plugin', 203), head_sha: f.executionCommit }, journal: { ...f.journal, status: 'passed', attempted: true, publishedObserved: true, registry: 'present', request: { ...f.journal.request, runId: 203 } } };
  };
  const observe = f.dependencies.observePublishedPackageArtifact;
  f.dependencies.observePublishedPackageArtifact = (name: string, options: any) => name === 'dsh-plugin'
    ? { observation: { status: 'present', artifact: { ...f.owned['dsh-plugin'].artifact, origin: 'registry' } }, bytes: Buffer.from('plugin') }
    : observe(name, options);
  assert.equal((await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies)).status, 'passed');
  assert.equal((await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies)).status, 'passed');
  assert.equal(f.requests.length, 1); assert.equal(f.state.pluginPublicationRecoveryHistory.length, 1);
  assert.deepEqual(f.state.packagePublications.buildr.evidence, before.packagePublications.buildr.evidence);
});

test('plugin executor replacement rejects attempted, unknown, active, drifted or already public requests before changing state', async t => {
  const cases: Array<[string, (f: any) => void]> = [
    ['attempted', f => { f.journal.attempted = true; }],
    ['missing attempted', f => { delete f.journal.attempted; }],
    ['different failure', f => { f.journal.code = 'npm-publication-unconfirmed'; }],
    ['unknown public effect', f => { f.journal.publishedObserved = true; }],
    ['wrong journal bytes', f => { f.journal.sha256 = '9'.repeat(64); }],
    ['wrong source', f => { f.oldRun.head_sha = hash('6'); }],
    ['active original', f => { f.oldRun.status = 'waiting'; }],
    ['unknown journal', f => { f.dependencies.runPluginHostedOperation = () => ({ status: 'readback-required' }); }],
    ['unknown registry', f => { f.dependencies.observePublishedPackageArtifact = async () => ({ observation: { status: 'unknown' } }); }],
    ['public registry', f => { f.dependencies.observePublishedPackageArtifact = async () => ({ observation: { status: 'present' } }); }],
    ...['queued', 'waiting', 'in_progress', 'pending', 'requested'].map(status => [`other ${status}`, (f: any) => {
      f.scope.gh = () => JSON.stringify({ total_count: 2, workflow_runs: [f.oldRun, { display_title: 'DSH publish 0.1.0', status }] });
    }] as [string, (f: any) => void]),
    ['unknown history', f => { f.scope.gh = () => JSON.stringify({ total_count: 101, workflow_runs: [f.oldRun] }); }],
    ['same executor', f => { f.scope.git = (args: string[]) => args[0] === 'fetch' ? '' : f.mainExecution; }],
    ['runtime changed', f => { const run = f.scope.execute; f.scope.execute = (command: string, args: string[], options: any) => args[0] === 'diff'
      ? { status: 0, stdout: 'projects/product/services/buildr/src/server.ts\0' } : run(command, args, options); }],
    ['missing main proof', f => { delete f.state.packagePublications.buildr.evidence; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = unattemptedPluginFixture(); mutate(f); const before = structuredClone(f.state);
    let result: any;
    try { result = await continuePackageRelease({ action: 'resume', authorized: true, recoverPublication: true }, f.scope, f.dependencies); }
    catch (error) { assert.ok(error instanceof Error); }
    if (result) assert.equal(result.status, 'publication-recovery-blocked');
    assert.deepEqual(f.state, before); assert.equal(f.saved.length, 0); assert.equal(f.requests.length, 0);
  });
});

test('release closeout consumes the unique runner not-applicable result without invoking a second Doctor', async () => {
  const f = fixture(); let calls = 0;
  f.dependencies.selfBootstrapCloseout = async (input: any) => {
    calls++; assert.equal(input.workspace, f.scope.workspace); assert.equal(input.context.identity, f.context.identity);
    assert.equal(input.evidence.status, 'passed'); assert.equal(f.counts().cleanups, 1);
    return { status: 'not-applicable', reason: 'No self-bootstrap inputs changed.' };
  };
  f.dependencies.invokeRetainedController = (_controller: any, args: string[]) => {
    assert.notEqual(args[0], 'doctor', 'only the unique runner may perform the final Doctor');
    return { status: 'cleaned' };
  };
  await continuePackageRelease({ action: 'publish', authorized: true }, f.scope, f.dependencies);
  const result = await continuePackageRelease({ action: 'resume' }, f.scope, f.dependencies);
  assert.equal(result.status, 'passed'); assert.equal(result.outcomes.activation, 'not-applicable'); assert.equal(calls, 1);
  assert.equal(f.state.closeout.outcomes.activation, 'not-applicable');
});
