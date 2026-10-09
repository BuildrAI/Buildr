import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReleaseContext, releaseContextIdentity } from '../../tools/release/release-readiness.ts';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';
import { createPackagePublicationEvidence, createPackageReleaseContext, validatePackageOwnerPublication, validatePackagePublicationEvidence, validatePackageReleaseContext } from '../../tools/release/release-package-evidence.ts';
import { normalizeReleaseTargets } from '../../tools/release/release-targets.ts';
import { createReleaseExecutionBinding } from '../../tools/release/release-execution-binding.ts';
import { cleanupReleaseSelection, createReleaseSelection, freezeReleaseSelection, selectReleaseCommit } from '../../tools/release/release-selection.ts';

const hash = (value: string) => value.repeat(40);
const digest = (value: string) => 'sha256-' + value.repeat(64);
const repository = 'BuildrAI/Buildr';
const clone = (value: any) => structuredClone(value);
function fixture(packages = 'dsh-plugin', actual: any = {}): any {
  const targets = actual.targets ?? normalizeReleaseTargets({ packages,
    ...(packages.includes('buildr') ? { version: '0.1.0-rc.41' } : {}),
    ...(packages.includes('dsh-plugin') ? { pluginVersion: '0.1.0-rc.7' } : {}) });
  const selection = actual.selection ?? { selectionId: targets.selectionId, version: targets.versions.buildr ?? null, targets,
    identity: digest('1'), status: 'frozen', releaseHead: hash('b'), releaseTree: hash('d'), generation: 3 };
  const convergence = actual.convergence ?? { mainCommit: hash('c'), mainTree: selection.releaseTree, devCommit: hash('f'),
    pluginTree: hash('e'), mergeParents: [hash('a'), selection.releaseHead] };
  const artifact = (name: string, digit: string): any => ({ origin: 'candidate', packageName: name === 'buildr' ? '@buildr-ai/buildr' : '@buildr-ai/buildr-dsh-plugin',
    version: targets.versions[name], integrity: 'sha512-' + Buffer.alloc(64, Number(digit)).toString('base64'), artifactSha256: digit.repeat(64),
    compatibility: { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [] },
    sourceCommit: name === 'buildr' ? selection.releaseHead : convergence.mainCommit });
  const owned: any = {};
  if (targets.packages.includes('buildr')) {
    const main = artifact('buildr', '1');
    const ownerContext = createReleaseContext({ selection: { ...selection, branch: 'release-' + targets.selectionId },
      release: { version: main.version, sourceCommit: selection.releaseHead, sourceTree: selection.releaseTree },
      convergence: { mainCommit: convergence.mainCommit, mainTree: convergence.mainTree, devCommit: convergence.devCommit, mergeParents: convergence.mergeParents },
      artifact: { integrity: main.integrity, sha256: main.artifactSha256, sourceCommit: main.sourceCommit },
      node: { authority: 'projects/product/.node-version', version: '24.15.0', executionIdentity: digest('2') } });
    owned.buildr = { artifact: main, ownerContext };
  }
  if (targets.packages.includes('dsh-plugin')) {
    const plugin = artifact('dsh-plugin', '2');
    owned['dsh-plugin'] = { artifact: plugin, prepareRunId: 11, prepareRunAttempt: 1, candidate: {
      schemaVersion: 'buildr.dsh-plugin-release-candidate/v1', packageName: plugin.packageName, version: plugin.version,
      integrity: plugin.integrity, sha256: plugin.artifactSha256, sourceCommit: convergence.mainCommit, sourceTree: convergence.pluginTree } };
  }
  const input = { targets, selection, convergence, packages: owned, compatibility: { status: 'passed', targets, publicationOrder: [...targets.packages] } };
  const context = createPackageReleaseContext(input);
  const publications: any = {};
  for (const name of targets.packages) {
    const candidate = owned[name], runId = name === 'buildr' ? 21 : 22, workflow = name === 'buildr' ? 'publish.yml' : 'publish-dsh-plugin.yml';
    const run = { id: runId, repository: { full_name: repository }, path: '.github/workflows/' + workflow, event: 'workflow_dispatch', head_branch: 'main',
      head_sha: convergence.mainCommit, status: 'completed', conclusion: 'success', run_attempt: 1 };
    const ownerEvidence = name === 'buildr' ? createReleaseTransactionEvidence({ context: candidate.ownerContext, outcome: 'passed',
      publish: { repository, workflow: run.path, runId, runAttempt: 1, runUrl: `https://github.com/${repository}/actions/runs/${runId}`, headSha: convergence.mainCommit },
      publicFacts: { version: candidate.artifact.version, tagCommit: convergence.mainCommit, registryPublished: true, registryIntegrity: candidate.artifact.integrity,
        registrySmoke: 'passed', githubRelease: `https://github.com/${repository}/releases/tag/v${candidate.artifact.version}` }, observedAt: '2026-10-09T00:00:00.000Z' })
      : { schemaVersion: 'buildr.dsh-plugin-publication/v1', status: 'passed', attempted: true, action: 'published', registry: 'present', publishedObserved: true,
        packageName: candidate.artifact.packageName, version: candidate.artifact.version, integrity: candidate.artifact.integrity, sha256: candidate.artifact.artifactSha256,
        sourceCommit: convergence.mainCommit, sourceTree: convergence.pluginTree, observedAt: '2026-10-09T00:00:00.000Z',
        request: { workflowRef: `${repository}/.github/workflows/publish-dsh-plugin.yml@refs/heads/main`, runId, runAttempt: 1 } };
    publications[name] = { registryArtifact: { ...candidate.artifact, origin: 'registry' }, run, ownerEvidence };
  }
  return { input, context, publications };
}
function updateOwnerContext(input: any, mutate: (value: any) => void): void {
  const { schemaVersion: _schema, identity: _identity, ...value } = input.packages.buildr.ownerContext;
  mutate(value); input.packages.buildr.ownerContext = createReleaseContext(value);
}

test('plugin-only, main-only and joint contexts keep exact independent versions and their package owners', () => {
  for (const packages of ['dsh-plugin', 'buildr', 'buildr,dsh-plugin']) {
    const data = fixture(packages), evidence = createPackagePublicationEvidence({ context: data.context, publications: data.publications });
    assert.equal(validatePackageReleaseContext(data.context).identity, data.context.identity);
    assert.equal(validatePackagePublicationEvidence(evidence).identity, evidence.identity);
    assert.deepEqual(Object.keys(evidence.publications), data.context.targets.packages);
  }
  const plugin = fixture().context;
  assert.equal(plugin.selection.version, null); assert.equal(plugin.packages.buildr, undefined);
  assert.equal(plugin.packages['dsh-plugin'].artifact.version, '0.1.0-rc.7');
  const joint = fixture('buildr,dsh-plugin').context;
  assert.equal(joint.selection.version, '0.1.0-rc.41'); assert.notEqual(joint.packages.buildr.artifact.version, joint.packages['dsh-plugin'].artifact.version);
});

test('package context retains the frozen plugin preparation peer for every later Candidate readback', () => {
  const joint = fixture('buildr,dsh-plugin').input;
  joint.packages['dsh-plugin'].buildrPeer = clone(joint.packages.buildr.artifact);
  const context = createPackageReleaseContext(joint);
  assert.deepEqual(context.packages['dsh-plugin'].buildrPeer, joint.packages.buildr.artifact);
  assert.equal(validatePackageReleaseContext(context).identity, context.identity);
  assert.notEqual(context.packages['dsh-plugin'].buildrPeer.sourceCommit, context.convergence.mainCommit);
  const wrong = clone(joint); wrong.packages['dsh-plugin'].buildrPeer.sourceCommit = context.convergence.mainCommit;
  assert.throws(() => createPackageReleaseContext(wrong), /preparation peer/);
  const independent = fixture().input;
  independent.packages['dsh-plugin'].buildrPeer = { ...clone(joint.packages.buildr.artifact), origin: 'registry' };
  delete independent.packages['dsh-plugin'].buildrPeer.sourceCommit;
  assert.deepEqual(createPackageReleaseContext(independent).packages['dsh-plugin'].buildrPeer, independent.packages['dsh-plugin'].buildrPeer);
  independent.packages['dsh-plugin'].buildrPeer.origin = 'candidate';
  independent.packages['dsh-plugin'].buildrPeer.sourceCommit = joint.selection.releaseHead;
  assert.throws(() => createPackageReleaseContext(independent), /preparation peer/);
});

test('frozen context tampering invalidates the original identity instead of silently rebinding it', () => {
  const context = fixture('buildr,dsh-plugin').context;
  const mutations = [
    (value: any) => { value.selection.generation++; }, (value: any) => { value.selection.identity = digest('9'); },
    (value: any) => { value.selection.releaseHead = hash('9'); }, (value: any) => { value.selection.releaseTree = hash('9'); },
    (value: any) => { value.targets.versions['dsh-plugin'] = '0.1.0-rc.8'; }, (value: any) => { value.selection.selectionId = 'other-release'; },
    (value: any) => { value.convergence.mainCommit = hash('9'); }, (value: any) => { value.compatibility.publicationOrder.reverse(); },
  ];
  for (const mutate of mutations) { const changed = clone(context); mutate(changed); assert.throws(() => validatePackageReleaseContext(changed)); }
});

test('context creation rejects missing owners, unsafe order, mismatched preparation and changed bytes', () => {
  const mutations = [
    (value: any) => { delete value.packages.buildr; }, (value: any) => { value.compatibility.publicationOrder = ['buildr', 'buildr']; },
    (value: any) => { value.compatibility.status = 'blocked'; }, (value: any) => { value.selection.status = 'ready'; },
    (value: any) => { value.convergence.mainTree = hash('9'); }, (value: any) => { value.convergence.mergeParents = [value.selection.releaseHead]; },
    (value: any) => { value.packages['dsh-plugin'].prepareRunAttempt = 2; }, (value: any) => { value.packages['dsh-plugin'].candidate.sourceCommit = hash('9'); },
    (value: any) => { value.packages['dsh-plugin'].candidate.sourceTree = hash('9'); }, (value: any) => { value.packages.buildr.artifact.artifactSha256 = '9'.repeat(64); },
    (value: any) => { value.packages['dsh-plugin'].artifact.integrity = 'sha512-' + Buffer.alloc(64, 9).toString('base64'); },
  ];
  for (const mutate of mutations) { const changed = clone(fixture('buildr,dsh-plugin').input); mutate(changed); assert.throws(() => createPackageReleaseContext(changed)); }
});

test('context creation requires its exact main version and source plus the same frozen owner projection', async t => {
  const mutations: Array<[string, (value: any) => void]> = [
    ['plugin-only has no main version', value => { value.selection.version = '0.1.0-rc.99'; }],
    ['main artifact source', value => { value.packages.buildr.artifact.sourceCommit = hash('9'); }],
    ['owner frozen head', value => updateOwnerContext(value, owner => { owner.selection.releaseHead = hash('9'); })],
    ['owner frozen tree', value => updateOwnerContext(value, owner => { owner.selection.releaseTree = hash('9'); })],
    ['owner frozen generation', value => updateOwnerContext(value, owner => { owner.selection.generation++; })],
    ['owner frozen status', value => updateOwnerContext(value, owner => { owner.selection.status = 'ready'; })],
  ];
  for (const [name, mutate] of mutations) await t.test(name, () => {
    const changed = clone(fixture(name.startsWith('plugin') ? 'dsh-plugin' : 'buildr,dsh-plugin').input);
    mutate(changed); assert.throws(() => createPackageReleaseContext(changed));
  });
});

test('every selected package needs matching registry bytes and a successful exact workflow before aggregate evidence', () => {
  const data = fixture('buildr,dsh-plugin');
  for (const name of ['buildr', 'dsh-plugin']) {
    const missing = clone(data.publications); delete missing[name];
    assert.throws(() => createPackagePublicationEvidence({ context: data.context, publications: missing }));
    for (const mutate of [
      (value: any) => { value.registryArtifact.origin = 'candidate'; }, (value: any) => { value.registryArtifact.artifactSha256 = '9'.repeat(64); },
      (value: any) => { value.run.head_sha = hash('9'); }, (value: any) => { value.run.head_branch = 'dev'; },
      (value: any) => { value.run.conclusion = 'failure'; }, (value: any) => { value.run.repository.full_name = 'Other/Buildr'; },
      (value: any) => { value.run.path = '.github/workflows/verify.yml'; }, (value: any) => { value.run.status = 'in_progress'; },
    ]) {
      const changed = clone(data.publications); mutate(changed[name]);
      assert.throws(() => createPackagePublicationEvidence({ context: data.context, publications: changed }));
    }
  }
});

test('plugin owner journal binds original request, workflow, source, version and exact bytes', () => {
  const data = fixture();
  for (const mutate of [
    (value: any) => { value.ownerEvidence.status = 'blocked'; }, (value: any) => { value.ownerEvidence.registry = 'unknown'; },
    (value: any) => { value.ownerEvidence.publishedObserved = false; }, (value: any) => { value.ownerEvidence.packageName = '@buildr-ai/buildr'; },
    (value: any) => { value.ownerEvidence.version = '0.1.0-rc.8'; }, (value: any) => { value.ownerEvidence.sha256 = '9'.repeat(64); },
    (value: any) => { value.ownerEvidence.sourceCommit = hash('9'); }, (value: any) => { value.ownerEvidence.sourceTree = hash('9'); },
    (value: any) => { value.ownerEvidence.request.runId = 99; }, (value: any) => { value.ownerEvidence.request.runAttempt = 2; },
    (value: any) => { value.ownerEvidence.request.workflowRef = `${repository}/.github/workflows/publish.yml@refs/heads/main`; },
    (value: any) => { value.run.run_attempt = 2; },
  ]) {
    const changed = clone(data.publications['dsh-plugin']); mutate(changed);
    assert.throws(() => validatePackageOwnerPublication(data.context, 'dsh-plugin', changed));
  }
  const recovered = clone(data.publications['dsh-plugin']); recovered.ownerEvidence.request.runId = 20; recovered.recoveryRunId = 20;
  assert.equal(validatePackageOwnerPublication(data.context, 'dsh-plugin', recovered).ownerEvidence.request.runId, 20);
});

test('recovery must keep a positive integer original journal request identity', () => {
  const data = fixture();
  for (const invalid of [-1, 0, '20', 1.5]) {
    const changed = clone(data.publications['dsh-plugin']); changed.ownerEvidence.request.runId = invalid; changed.recoveryRunId = invalid;
    assert.throws(() => validatePackageOwnerPublication(data.context, 'dsh-plugin', changed));
  }
});

test('main owner requires its original context plus registry smoke, tag and GitHub Release readbacks', () => {
  const data = fixture('buildr,dsh-plugin');
  for (const mutate of [
    (value: any) => { value.release.registryPublished = false; }, (value: any) => { value.release.registrySmoke = 'unknown'; },
    (value: any) => { value.release.githubRelease = null; }, (value: any) => { value.publish.runId = 99; },
    (value: any) => { value.context = fixture('buildr').context.packages.buildr.ownerContext; },
  ]) {
    const changed = clone(data.publications); mutate(changed.buildr.ownerEvidence);
    assert.throws(() => createPackagePublicationEvidence({ context: data.context, publications: changed }));
  }
});

test('individually valid main owner evidence must still bind the same repository and registry SRI', async t => {
  const data = fixture('buildr,dsh-plugin');
  for (const field of ['repository', 'registryIntegrity']) await t.test(field, () => {
    const changed = clone(data.publications), original = changed.buildr.ownerEvidence;
    changed.buildr.ownerEvidence = createReleaseTransactionEvidence({ context: original.context, outcome: 'passed',
      publish: { ...original.publish, ...(field === 'repository' ? { repository: 'Other/Buildr' } : {}) },
      publicFacts: { version: original.release.npmVersion, tagCommit: original.release.tagCommit, registryPublished: true,
        registryIntegrity: field === 'registryIntegrity' ? 'sha512-' + Buffer.alloc(64, 9).toString('base64') : original.release.registryIntegrity,
        registrySmoke: 'passed', githubRelease: original.release.githubRelease }, observedAt: original.observedAt });
    assert.throws(() => createPackagePublicationEvidence({ context: data.context, publications: changed }));
  });
});

test('aggregate evidence rejects omitted targets, modified owner journals and credential-shaped fields', () => {
  const data = fixture('buildr,dsh-plugin'), evidence = createPackagePublicationEvidence({ context: data.context, publications: data.publications });
  for (const mutate of [
    (value: any) => { delete value.publications['dsh-plugin']; }, (value: any) => { value.publications['dsh-plugin'].ownerEvidence.observedAt = '2026-10-10'; },
    (value: any) => { value.context.selection.generation++; }, (value: any) => { value.status = 'blocked'; },
  ]) { const changed = clone(evidence); mutate(changed); assert.throws(() => validatePackagePublicationEvidence(changed)); }
  const changed = clone(data.publications); changed['dsh-plugin'].ownerEvidence.authorization = 'redacted-test-marker';
  assert.throws(() => createPackagePublicationEvidence({ context: data.context, publications: changed }), /credentials/);
});

function git(repo: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}

test('joint cleanup preserves all refs until both package owners are proven, then removes only its own family', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-joint-publication-cleanup-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const retained = path.join(root, 'retained'); fs.mkdirSync(retained);
  git(retained, 'init', '-b', 'dev'); git(retained, 'config', 'user.name', 'Buildr Test'); git(retained, 'config', 'user.email', 'buildr@example.com');
  fs.writeFileSync(path.join(retained, 'product.txt'), 'baseline'); git(retained, 'add', '.'); git(retained, 'commit', '-m', 'baseline');
  const baseline = git(retained, 'rev-parse', 'HEAD'); fs.writeFileSync(path.join(retained, 'product.txt'), 'selected'); git(retained, 'commit', '-am', 'selected dev content');
  const source = git(retained, 'rev-parse', 'HEAD'), targets = fixture('buildr,dsh-plugin').context.targets;
  const repo = path.join(root, 'task'), branch = 'codex/release-' + targets.selectionId, taskId = 'release-' + targets.selectionId;
  git(retained, 'worktree', 'add', '-b', branch, repo, baseline);
  const providerEvidence = path.join(root, 'provider.json');
  fs.writeFileSync(providerEvidence, JSON.stringify({ schemaVersion: 'buildr.git-worktree-evidence/v1', taskId, status: 'ready', branch,
    repositories: [{ selector: 'workspace', checkoutPath: repo, branch, state: 'ready' }] }));
  const binding = () => createReleaseExecutionBinding({ version: targets.versions.buildr, selectionId: targets.selectionId, repo, workspaceRoot: retained,
    task: { taskId, status: 'active' }, worktreeResult: { taskId, status: 'ready', evidencePath: providerEvidence,
      repositories: [{ selector: 'workspace', checkoutPath: repo, branch, head: git(repo, 'rev-parse', 'HEAD'), state: 'ready' }] } });
  const options = { version: targets.versions.buildr, selectionId: targets.selectionId, targets, repo, devRef: 'dev' };
  assert.equal(createReleaseSelection({ ...options, baseline, executionBinding: binding() }).status, 'passed');
  assert.equal(selectReleaseCommit({ ...options, source, executionBinding: binding() }).status, 'passed');
  const frozen = freezeReleaseSelection({ ...options, executionBinding: binding() }); assert.equal(frozen.status, 'passed');
  const selection = { selectionId: targets.selectionId, version: targets.versions.buildr, targets, identity: frozen.selectionIdentity,
    status: 'frozen', releaseHead: frozen.releaseHead, releaseTree: frozen.releaseTree, generation: frozen.generation };
  const data = fixture('buildr,dsh-plugin', { targets, selection });
  const before = git(repo, 'show-ref'), publications = clone(data.publications); delete publications['dsh-plugin'];
  const incompleteValue = { schemaVersion: 'buildr.package-publication-evidence/v1', status: 'passed', context: data.context, publications };
  const incomplete = { ...incompleteValue, identity: releaseContextIdentity(incompleteValue) };
  const blocked = cleanupReleaseSelection({ ...options, confirm: true, publicationEvidence: incomplete });
  assert.equal(blocked.status, 'blocked'); assert.deepEqual(blocked.effects, []); assert.equal(git(repo, 'show-ref'), before);
  git(repo, 'update-ref', 'refs/buildr/release/other-release/baseline', baseline);
  const publicationEvidence = createPackagePublicationEvidence({ context: data.context, publications: data.publications });
  const result = cleanupReleaseSelection({ ...options, confirm: true, publicationEvidence });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(git(repo, 'for-each-ref', '--format=%(refname)', `refs/buildr/release/${targets.selectionId}/`), '');
  assert.equal(git(repo, 'rev-parse', 'refs/buildr/release/other-release/baseline'), baseline);
  assert.equal(cleanupReleaseSelection({ ...options, confirm: true, publicationEvidence }).action, 'already-cleaned');
});
