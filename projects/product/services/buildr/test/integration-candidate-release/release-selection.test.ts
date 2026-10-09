import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { createReleaseExecutionBinding, validateReleaseExecutionBinding } from '../../tools/release/release-execution-binding.ts';
import { abandonReleaseSelection, cleanupReleaseSelection, createReleaseSelection, freezeReleaseSelection, inspectReleaseSelection, inspectReleaseSelectionCleanup, reconcileReleaseSelectionWithMain, releaseSelectionKey, reopenReleaseSelection, selectionIdentity, selectReleaseCommit } from '../../tools/release/release-selection.ts';
import { normalizeReleaseTargets } from '../../tools/release/release-targets.ts';
import { createPackagePublicationEvidence, createPackageReleaseContext } from '../../tools/release/release-package-evidence.ts';

const digest: any = (value: any) => `sha256-${String(value).padStart(64, '0')}`;

function git(repo: any, ...args: any[]): any  {
  const result: any = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

let baseTemplate: any = null;
const templateRoots: string[] = [];
after(() => { for (const root of templateRoots) fs.rmSync(root, { recursive: true, force: true }); });

function frozenBaseTemplate(): any {
  if (baseTemplate) return baseTemplate;
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-selection-base-'));
  templateRoots.push(root);
  const remote: any = path.join(root, 'remote.git');
  git(root, 'init', '--bare', remote);
  git(root, 'clone', remote, 'seed');
  const seed: any = path.join(root, 'seed');
  git(seed, 'checkout', '-b', 'dev');
  git(seed, 'config', 'user.name', 'Buildr Test');
  git(seed, 'config', 'user.email', 'buildr@example.com');
  fs.mkdirSync(path.join(seed, 'projects/product'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects/product/version.txt'), 'baseline\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'baseline');
  const baseline: any = git(seed, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(seed, 'projects/product/version.txt'), 'dev selected\n');
  git(seed, 'commit', '-am', 'selected dev content');
  const source: any = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'push', '-u', 'origin', 'dev');
  baseTemplate = { root, remote, baseline, source };
  return baseTemplate;
}

function fixture(version: any, targets?: any): any  {
  const selectionId = targets?.selectionId;
  const key = releaseSelectionKey({ version, selectionId });
  const template: any = frozenBaseTemplate();
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-selection-'));
  const remote: any = path.join(root, 'remote.git');
  // Copy only the frozen bare graph. Every case owns its objects, refs and
  // actual clone; no linked-worktree, selection or provider state is reused.
  fs.cpSync(template.remote, remote, { recursive: true, errorOnExist: true, force: false });
  git(root, 'clone', '--branch', 'dev', remote, 'retained');
  const retained: any = path.join(root, 'retained');
  git(retained, 'config', 'user.name', 'Buildr Test');
  git(retained, 'config', 'user.email', 'buildr@example.com');
  const source: any = git(retained, 'rev-parse', 'HEAD');
  const baseline: any = git(retained, 'rev-parse', 'HEAD^');
  assert.equal(source, template.source); assert.equal(baseline, template.baseline);
  const repo: any = path.join(root, 'task-worktree');
  const taskBranch: any = `codex/release-${key}`;
  git(retained, 'worktree', 'add', '-b', taskBranch, repo, baseline);
  git(repo, 'config', 'user.name', 'Buildr Test');
  git(repo, 'config', 'user.email', 'buildr@example.com');
  const providerEvidence: any = path.join(root, 'provider.json');
  fs.writeFileSync(providerEvidence, `${JSON.stringify({
    schemaVersion: 'buildr.git-worktree-evidence/v1', taskId: `release-${key}`, workspaceRoot: retained, branch: taskBranch,
    planDigest: digest('1'), status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: repo, branch: taskBranch }], effects: [], updatedAt: '2026-08-28T00:00:00.000Z',
  }, null, 2)}\n`);
  const task: any = { taskId: `release-${key}`, status: 'active' };
  const binding: any = () => {
    const head: any = git(repo, 'rev-parse', 'HEAD');
    const repository: any = { selector: 'workspace', checkoutPath: repo, branch: taskBranch, head, state: 'ready' };
    return createReleaseExecutionBinding({ version, selectionId, task, workspaceRoot: retained, repo, worktreeResult: { status: 'ready', taskId: task.taskId, evidencePath: providerEvidence, repositories: [repository] } });
  };
  return { root, retained, repo, version, selectionId, targets, key, baseline, source, binding };
}

const selectionOptions = (data: any) => ({ repo: data.repo, version: data.version, selectionId: data.selectionId, targets: data.targets, devRef: 'dev' });
const create: any = (data: any) => createReleaseSelection({ ...selectionOptions(data), baseline: data.baseline, executionBinding: data.binding() });
const select: any = (data: any) => selectReleaseCommit({ ...selectionOptions(data), source: data.source, executionBinding: data.binding() });
const freeze: any = (data: any) => freezeReleaseSelection({ ...selectionOptions(data), executionBinding: data.binding() });

test('selection mutates only the bound Task branch and formal release ref', (t: any) => {
  const data: any = fixture('0.1.0-rc.1'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(create(data).status, 'passed');
  const selected: any = select(data);
  assert.equal(selected.status, 'passed', JSON.stringify(selected));
  assert.equal(git(data.repo, 'branch', '--show-current'), 'codex/release-0.1.0-rc.1');
  assert.equal(git(data.repo, 'rev-parse', 'HEAD'), selected.releaseHead);
  assert.equal(git(data.repo, 'rev-parse', 'release-0.1.0-rc.1'), selected.releaseHead);
  assert.equal(selected.selectionChain[0].sourceDevCommit, data.source);
  assert.equal(freeze(data).freeze.state, 'frozen');
});

test('retained primary worktree and stale binding fail before mutation', (t: any) => {
  const data: any = fixture('0.1.0-rc.2'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const binding: any = data.binding();
  const retainedBranch: any = git(data.retained, 'branch', '--show-current');
  const wrongRoot: any = createReleaseSelection({ repo: data.retained, version: data.version, baseline: data.baseline, devRef: 'dev', executionBinding: binding });
  assert.equal(wrongRoot.status, 'blocked');
  assert.equal(git(data.retained, 'branch', '--show-current'), retainedBranch);
  assert.equal(createReleaseSelection({ repo: data.repo, version: data.version, baseline: data.baseline, devRef: 'dev', executionBinding: binding }).status, 'passed');
  fs.writeFileSync(path.join(data.repo, 'local.txt'), 'advance\n'); git(data.repo, 'add', 'local.txt'); git(data.repo, 'commit', '-m', 'advance bound checkout');
  const stale: any = freezeReleaseSelection({ repo: data.repo, version: data.version, devRef: 'dev', executionBinding: binding });
  assert.equal(stale.status, 'blocked');
  assert.match(stale.diagnostic.message, /drifted/);
});

test('main-only product content blocks reconciliation with zero Git writes', (t: any) => {
  const data: any = fixture('0.1.0-rc.3'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen: any = freeze(data);
  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/main-only.txt'), 'not delivered to dev\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'main-only product content'); git(data.retained, 'push', 'origin', 'main');
  const before: any = git(data.repo, 'rev-parse', 'HEAD');
  const blocked: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'pre-Candidate convergence', executionBinding: data.binding() });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'release_main_coverage_incomplete');
  assert.deepEqual(blocked.diagnostic.details.uncoveredPaths, ['projects/product/main-only.txt']);
  assert.equal(git(data.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(inspectReleaseSelection({ repo: data.repo, version: data.version, devRef: 'dev' }).releaseHead, frozen.releaseHead);
});

test('main coverage recognizes renamed and transient dev paths from commit provenance', (t: any) => {
  const data: any = fixture('0.1.0-rc.31'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(data.retained, 'projects/product/transient.txt'), 'temporary\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'add transient product path');
  fs.rmSync(path.join(data.retained, 'projects/product/transient.txt'));
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'remove transient product path');
  git(data.retained, 'mv', 'projects/product/version.txt', 'projects/product/version-renamed.txt');
  git(data.retained, 'commit', '-m', 'rename product path');
  const devBaseline: any = git(data.retained, 'rev-parse', 'HEAD');
  git(data.retained, 'push', 'origin', 'dev');
  git(data.repo, 'reset', '--hard', devBaseline);
  assert.equal(createReleaseSelection({ repo: data.repo, version: data.version, baseline: devBaseline, devRef: 'dev', executionBinding: data.binding() }).status, 'passed');
  const frozen: any = freeze(data);

  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/main-history-only.txt'), 'temporary main history\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'add transient main history path');
  fs.rmSync(path.join(data.retained, 'projects/product/main-history-only.txt'));
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'remove transient main history path');
  fs.writeFileSync(path.join(data.retained, 'projects/product/version.txt'), 'main value\n');
  fs.writeFileSync(path.join(data.retained, 'projects/product/transient.txt'), 'main value\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'main changes paths already covered by dev history');
  const mainCommit: any = git(data.retained, 'rev-parse', 'HEAD'); git(data.retained, 'push', 'origin', 'main');

  const reconciled: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'pre-Candidate convergence', executionBinding: data.binding() });
  assert.equal(reconciled.status, 'passed', JSON.stringify(reconciled));
  assert.equal(reconciled.releaseTree, frozen.releaseTree);
  assert.deepEqual(git(data.repo, 'rev-list', '--parents', '-n', '1', reconciled.releaseHead).split(' ').slice(1), [frozen.releaseHead, mainCommit]);
});

test('covered main history creates a two-parent commit without changing the release tree', (t: any) => {
  const data: any = fixture('0.1.0-rc.4'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen: any = freeze(data);
  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/version.txt'), 'older published value\n');
  git(data.retained, 'commit', '-am', 'published main value');
  const mainCommit: any = git(data.retained, 'rev-parse', 'HEAD'); git(data.retained, 'push', 'origin', 'main');
  const reconciled: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'pre-Candidate convergence', executionBinding: data.binding() });
  assert.equal(reconciled.status, 'passed', JSON.stringify(reconciled));
  assert.equal(reconciled.releaseTree, frozen.releaseTree);
  assert.equal(git(data.repo, 'rev-parse', 'HEAD^{tree}'), frozen.releaseTree);
  assert.deepEqual(git(data.repo, 'rev-list', '--parents', '-n', '1', reconciled.releaseHead).split(' ').slice(1), [frozen.releaseHead, mainCommit]);
  assert.deepEqual(reconciled.reconciliationChain[0].changedPaths, []);
  assert.match(reconciled.reconciliationChain[0].coverageIdentity, /^sha256-/u);
  const repeated: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'same inputs', executionBinding: data.binding() });
  assert.equal(repeated.action, 'already-converged'); assert.deepEqual(repeated.effects, []);

  git(data.retained, 'checkout', 'dev');
  fs.writeFileSync(path.join(data.retained, 'projects/product/followup.txt'), 'Candidate follow-up\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'Candidate follow-up');
  const followup: any = git(data.retained, 'rev-parse', 'HEAD');
  const reopened: any = reopenReleaseSelection({ repo: data.repo, version: data.version, confirm: true, reason: 'Candidate follow-up.', executionBinding: data.binding() });
  assert.equal(reopened.status, 'passed');
  assert.equal(selectReleaseCommit({ repo: data.repo, version: data.version, source: followup, devRef: 'dev', executionBinding: data.binding() }).status, 'passed');
  freeze(data);
  const resumed: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'main is already covered', executionBinding: data.binding() });
  assert.equal(resumed.action, 'already-converged');
  assert.equal(resumed.releaseHead, git(data.repo, 'rev-parse', 'HEAD'));
  assert.deepEqual(resumed.effects, []);
});

test('reopen preserves old freeze history and forms a new generation', (t: any) => {
  const data: any = fixture('0.1.0-rc.5'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); freeze(data);
  const reopened: any = reopenReleaseSelection({ repo: data.repo, version: data.version, confirm: true, reason: 'Candidate predates final convergence.', executionBinding: data.binding() });
  assert.equal(reopened.status, 'passed'); assert.equal(reopened.freeze.state, 'open'); assert.equal(reopened.freezeHistory[0].commit, data.baseline);
  assert.equal(select(data).status, 'passed');
  assert.deepEqual(freeze(data).freezeHistory.map((entry: any) => entry.generation), [0, 1]);
});

test('legacy version-only refs, selection digest and binding digest retain the exact prior payload', (t: any) => {
  const data = fixture('0.1.0-rc.61'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const binding = data.binding(), { identity, ...unsigned } = binding;
  assert.deepEqual(Object.keys(unsigned), ['schemaVersion', 'version', 'taskId', 'workspaceRoot', 'executionRoot', 'branch', 'head', 'providerEvidence', 'providerIdentity']);
  assert.equal(identity, 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'));
  const created = create(data);
  assert.equal(created.status, 'passed');
  assert.equal(created.selectionId, undefined);
  assert.equal(git(data.repo, 'for-each-ref', '--format=%(refname)', `refs/buildr/release/${data.version}/targets`), '');
  const oldPayload = { schemaVersion: 'buildr.release-selection/v1', version: created.version, branch: created.branch, devBaseline: created.devBaseline,
    releaseHead: created.releaseHead, releaseTree: created.releaseTree, generation: created.generation, selectionChain: created.selectionChain,
    reconciliationChain: created.reconciliationChain, freeze: created.freeze, freezeHistory: created.freezeHistory, abandon: created.abandon };
  assert.equal(selectionIdentity(created), 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(oldPayload)).digest('hex'));
  const targets = normalizeReleaseTargets({ version: data.version });
  const before = git(data.repo, 'show-ref');
  assert.equal(inspectReleaseSelection({ ...selectionOptions(data), selectionId: data.version, targets }).status, 'ready');
  assert.equal(createReleaseSelection({ ...selectionOptions(data), selectionId: data.version, targets, baseline: data.baseline, executionBinding: binding }).status, 'blocked');
  assert.equal(git(data.repo, 'show-ref'), before);
});

test('plugin-only selection keeps a null main version through all local lifecycle refs', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: '0.1.0-rc.62' });
  const data = fixture(undefined, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const binding = data.binding();
  assert.equal(binding.version, null); assert.equal(binding.selectionId, targets.selectionId);
  assert.equal(validateReleaseExecutionBinding(binding, { repo: data.repo }).identity, binding.identity);
  const created = create(data);
  assert.equal(created.status, 'passed', JSON.stringify(created)); assert.equal(created.version, null);
  assert.deepEqual(JSON.parse(git(data.repo, 'cat-file', 'blob', `refs/buildr/release/${data.key}/targets`)), targets);
  const object = created.targetsRefObject;
  assert.equal(select(data).status, 'passed');
  const frozen = freeze(data);
  assert.equal(frozen.version, null); assert.equal(frozen.freeze.state, 'frozen');
  assert.equal(git(data.repo, 'rev-parse', `refs/buildr/release/${data.key}/freezes/1`), frozen.releaseHead);
  assert.equal(reopenReleaseSelection({ ...selectionOptions(data), confirm: true, reason: 'new plugin candidate', executionBinding: data.binding() }).status, 'passed');
  assert.equal(freeze(data).status, 'passed');
  assert.equal(abandonReleaseSelection({ ...selectionOptions(data), executionBinding: data.binding() }).status, 'passed');
  const inspected = inspectReleaseSelection({ ...selectionOptions(data) });
  assert.equal(inspected.status, 'abandoned'); assert.equal(inspected.targetsRefObject, object);
  const cleaned = cleanupReleaseSelection({ ...selectionOptions(data), confirm: true, executionBinding: data.binding() });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned)); assert.equal(cleaned.version, null);
  assert.equal(cleaned.selectionId, data.key);
  assert.equal(git(data.repo, 'for-each-ref', '--format=%(refname)', `refs/buildr/release/${data.key}/`), '');
  assert.equal(cleanupReleaseSelection({ ...selectionOptions(data), confirm: true, executionBinding: data.binding() }).action, 'already-cleaned');
});

test('joint targets cannot be rebound, read through a version key, or moved into the legacy namespace', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'buildr,dsh-plugin', version: '0.1.0-rc.63', pluginVersion: '0.1.0-rc.7' });
  const data = fixture(targets.versions.buildr, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(create(data).status, 'passed'); select(data); freeze(data);
  const before = git(data.repo, 'show-ref');
  const wrong = normalizeReleaseTargets({ packages: 'buildr,dsh-plugin', version: targets.versions.buildr, pluginVersion: '0.1.0-rc.8', selectionId: data.key });
  for (const operation of [inspectReleaseSelection, freezeReleaseSelection, reopenReleaseSelection]) {
    const result = operation({ ...selectionOptions(data), targets: wrong, confirm: true, reason: 'must not rebind', executionBinding: data.binding() });
    assert.equal(result.status, 'blocked'); assert.deepEqual(result.effects, []);
  }
  assert.equal(inspectReleaseSelection({ repo: data.repo, version: data.version, devRef: 'dev' }).status, 'blocked');
  assert.equal(git(data.repo, 'show-ref'), before);
  const unsafeTargets = { ...targets, selectionId: data.version };
  const legacyData = fixture(data.version, unsafeTargets); t.after(() => fs.rmSync(legacyData.root, { recursive: true, force: true }));
  assert.equal(create(legacyData).status, 'blocked');
  assert.equal(createReleaseSelection({ ...selectionOptions(legacyData), selectionId: undefined, baseline: legacyData.baseline, executionBinding: legacyData.binding() }).status, 'blocked');
  assert.equal(git(legacyData.repo, 'for-each-ref', '--format=%(refname)', 'refs/buildr/release/'), '');
});

test('missing or wrong-type target authority and mismatched execution IDs block before mutation', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: '0.1.0-rc.64' });
  const data = fixture(undefined, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(create(data).status, 'passed');
  const mismatch = freezeReleaseSelection({ ...selectionOptions(data), selectionId: 'another-plugin', executionBinding: data.binding() });
  assert.equal(mismatch.status, 'blocked'); assert.match(mismatch.diagnostic.message, /selectionId/); assert.deepEqual(mismatch.effects, []);
  const ref = `refs/buildr/release/${data.key}/targets`, original = git(data.repo, 'rev-parse', ref);
  git(data.repo, 'update-ref', '-d', ref);
  assert.equal(inspectReleaseSelection(selectionOptions(data)).status, 'blocked');
  assert.equal(freeze(data).status, 'blocked');
  git(data.repo, 'update-ref', ref, data.baseline);
  assert.equal(inspectReleaseSelection(selectionOptions(data)).status, 'blocked');
  assert.equal(freeze(data).status, 'blocked');
  git(data.repo, 'update-ref', ref, original);
  assert.equal(freeze(data).status, 'passed');
  const invalidBinding = { ...data.binding(), selectionId: 'other-plugin' };
  assert.throws(() => validateReleaseExecutionBinding(invalidBinding, { repo: data.repo }), /identity/);
  for (const selectionId of ['../main', 'unsafe/name', 'bad..id', 'bad.lock', 'Upper', 'bad+id', 'bad-']) assert.throws(() => releaseSelectionKey({ selectionId }));
});

test('target ref compare-and-swap rejects drift after inspection before freeze refs are written', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: '0.1.0-rc.66' });
  const data = fixture(undefined, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(create(data).status, 'passed');
  const ref = `refs/buildr/release/${data.key}/targets`;
  let drifted = false;
  const result = freezeReleaseSelection({ ...selectionOptions(data), executionBinding: data.binding() }, {
    execute(command: string, args: string[], options: any) {
      if (!drifted && args[0] === 'update-ref' && options.input?.includes(`verify ${ref}`)) {
        drifted = true;
        git(data.repo, 'update-ref', ref, data.baseline);
      }
      return spawnSync(command, args, { ...options, encoding: 'utf8' });
    },
  });
  assert.equal(result.status, 'blocked'); assert.equal(drifted, true);
  assert.equal(git(data.repo, 'for-each-ref', '--format=%(refname)', `refs/buildr/release/${data.key}/frozen`), '');
  assert.equal(git(data.repo, 'for-each-ref', '--format=%(refname)', `refs/buildr/release/${data.key}/freezes`), '');
});

test('joint main reconciliation retains one target object and freezes the new generation under its selectionId', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'buildr,dsh-plugin', version: '0.1.0-rc.67', pluginVersion: '0.1.0-rc.9' });
  const data = fixture(targets.versions.buildr, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen = freeze(data);
  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/version.txt'), 'previous main value\n');
  git(data.retained, 'commit', '-am', 'covered main content'); git(data.retained, 'push', 'origin', 'main');
  const result = reconcileReleaseSelectionWithMain({ ...selectionOptions(data), mainRef: 'origin/main', confirm: true, reason: 'exact joint source',
    executionBinding: data.binding() });
  assert.equal(result.status, 'passed', JSON.stringify(result)); assert.equal(result.version, targets.versions.buildr);
  assert.equal(result.selectionId, data.key); assert.deepEqual(result.targets, targets); assert.equal(result.targetsRefObject, frozen.targetsRefObject);
  assert.equal(result.releaseTree, frozen.releaseTree); assert.equal(result.generation, frozen.generation + 1);
  assert.equal(git(data.repo, 'rev-parse', `refs/buildr/release/${data.key}/freezes/${result.generation}`), result.releaseHead);
  assert.notEqual(result.selectionIdentity, frozen.selectionIdentity);
  assert.equal(reopenReleaseSelection({ ...selectionOptions(data), confirm: true, reason: 'joint follow-up', executionBinding: data.binding() }).status, 'passed');
  assert.equal(freeze(data).status, 'passed');
});

test('plugin-only main reconciliation still blocks uncovered main product content without writes', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: '0.1.0-rc.68' });
  const data = fixture(undefined, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen = freeze(data);
  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/main-only.txt'), 'still requires dev provenance\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'main-only product content'); git(data.retained, 'push', 'origin', 'main');
  const before = git(data.repo, 'show-ref');
  const result = reconcileReleaseSelectionWithMain({ ...selectionOptions(data), mainRef: 'origin/main', confirm: true, reason: 'plugin-only does not bypass coverage',
    executionBinding: data.binding() });
  assert.equal(result.status, 'blocked'); assert.equal(result.diagnostic.code, 'release_main_coverage_incomplete'); assert.equal(result.version, null);
  assert.deepEqual(result.effects, []); assert.equal(git(data.repo, 'show-ref'), before);
  assert.equal(inspectReleaseSelection(selectionOptions(data)).selectionIdentity, frozen.selectionIdentity);
});

function pluginPublication(data: any, frozen: any): any {
  const artifact = { packageName: '@buildr-ai/buildr-dsh-plugin', version: data.targets.versions['dsh-plugin'], integrity: 'sha512-' + Buffer.alloc(64, 2).toString('base64'),
    artifactSha256: '2'.repeat(64), origin: 'candidate', compatibility: { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [] },
    sourceCommit: frozen.releaseHead, sourceTree: frozen.releaseTree };
  const candidate = { schemaVersion: 'buildr.dsh-plugin-release-candidate/v1', packageName: artifact.packageName, version: artifact.version,
    integrity: artifact.integrity, sha256: artifact.artifactSha256, sourceCommit: frozen.releaseHead, sourceTree: frozen.releaseTree };
  const context = createPackageReleaseContext({ targets: data.targets, selection: { selectionId: data.key, version: null, targets: data.targets,
    identity: frozen.selectionIdentity, status: 'frozen', releaseHead: frozen.releaseHead, releaseTree: frozen.releaseTree, generation: frozen.generation },
    convergence: { mainCommit: frozen.releaseHead, mainTree: frozen.releaseTree, devCommit: data.source, pluginTree: frozen.releaseTree, mergeParents: [data.baseline, frozen.releaseHead] },
    compatibility: { status: 'passed', targets: data.targets, publicationOrder: ['dsh-plugin'] },
    packages: { 'dsh-plugin': { artifact, candidate, prepareRunId: 11, prepareRunAttempt: 1 } } });
  return createPackagePublicationEvidence({ context, publications: { 'dsh-plugin': { registryArtifact: { ...artifact, origin: 'registry' },
    run: { repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_sha: frozen.releaseHead,
      head_branch: 'main', path: '.github/workflows/publish-dsh-plugin.yml', id: 12, run_attempt: 1 },
    ownerEvidence: { schemaVersion: 'buildr.dsh-plugin-publication/v1', status: 'passed', registry: 'present', publishedObserved: true,
      packageName: artifact.packageName, version: artifact.version, integrity: artifact.integrity, sha256: artifact.artifactSha256,
      sourceCommit: frozen.releaseHead, sourceTree: frozen.releaseTree, request: { workflowRef: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main', runId: 12, runAttempt: 1 } } } } });
}

test('package publication cleanup requires complete evidence for the current frozen targets and generation', (t: any) => {
  const targets = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: '0.1.0-rc.65' });
  const data = fixture(undefined, targets); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen = freeze(data), publicationEvidence = pluginPublication(data, frozen);
  const options = { ...selectionOptions(data), publicationEvidence };
  assert.equal(inspectReleaseSelectionCleanup(options).status, 'ready');
  const incomplete = { ...publicationEvidence, publications: {} };
  assert.equal(cleanupReleaseSelection({ ...options, publicationEvidence: incomplete, confirm: true }).status, 'blocked');
  assert.equal(inspectReleaseSelectionCleanup({ ...options, selectionId: 'other-plugin' }).status, 'blocked');
  assert.equal(reopenReleaseSelection({ ...selectionOptions(data), confirm: true, reason: 'invalidate prior package evidence', executionBinding: data.binding() }).status, 'passed');
  assert.equal(cleanupReleaseSelection({ ...options, confirm: true }).status, 'blocked');
  assert.equal(freeze(data).status, 'passed');
  const cleaned = cleanupReleaseSelection({ ...options, confirm: true });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.equal(cleanupReleaseSelection({ ...options, confirm: true }).action, 'already-cleaned');
});
