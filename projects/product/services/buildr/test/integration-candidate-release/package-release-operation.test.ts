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
function fixture(packages = 'dsh-plugin'): any {
  const targets = normalizeReleaseTargets({ packages, ...(packages.includes('buildr') ? { version: '0.2.0' } : {}), ...(packages.includes('dsh-plugin') ? { pluginVersion: '0.1.0' } : {}) });
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
    else owned[name] = { artifact: item, prepareRunId: 100, prepareRunAttempt: 1, buildrPeer: targets.packages.includes('buildr') ? artifact('buildr') : published.buildr.artifact,
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
