import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  abandonReleaseSelection,
  cleanupReleaseSelection,
  createReleaseSelection,
  freezeReleaseSelection,
  inspectReleaseSelection,
  reconcileReleaseSelectionWithMain,
  reopenReleaseSelection,
  selectReleaseCommit,
} from '../../tools/release/release-selection.mjs';

const RELEASE_SELECTION_CLI = path.resolve(import.meta.dirname, '../../tools/release/release-selection.mjs');

function git(repo, ...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-selection-'));
  const remote = path.join(root, 'remote.git');
  git(root, 'init', '--bare', remote);
  git(root, 'clone', remote, 'repo');
  const repo = path.join(root, 'repo');
  git(repo, 'checkout', '-b', 'dev');
  git(repo, 'config', 'user.name', 'Buildr Test');
  git(repo, 'config', 'user.email', 'buildr@example.com');
  fs.writeFileSync(path.join(repo, 'selection.txt'), 'baseline\n');
  git(repo, 'add', 'selection.txt');
  git(repo, 'commit', '-m', 'baseline');
  const baseline = git(repo, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, 'selection.txt'), 'feature-a\n');
  git(repo, 'commit', '-am', 'feature A');
  const sourceA = git(repo, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, 'second.txt'), 'feature-b\n');
  git(repo, 'add', 'second.txt');
  git(repo, 'commit', '-m', 'feature B');
  const sourceB = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-u', 'origin', 'dev');
  return { root, repo, remote, baseline, sourceA, sourceB };
}

test('release selection creates from exact dev baseline and reconstructs ordered -x provenance', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));

  const created = createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.1', baseline: data.baseline, devRef: 'dev' });
  assert.equal(created.status, 'passed', JSON.stringify(created));
  assert.equal(created.generation, 0);
  assert.equal(created.releaseHead, data.baseline);
  assert.equal(created.effects.some((effect) => effect.type === 'branch-created'), true);

  const selected = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.1', source: data.sourceA, devRef: 'dev' });
  assert.equal(selected.status, 'passed', JSON.stringify(selected));
  assert.equal(selected.generation, 1);
  assert.equal(selected.selectionChain[0].sourceDevCommit, data.sourceA);
  assert.equal(selected.selectionChain[0].resultReleaseCommit, selected.releaseHead);
  assert.deepEqual(selected.selectionChain[0].changedPaths, ['selection.txt']);

  const beforeDevAdvance = selected.releaseHead;
  git(data.repo, 'checkout', 'dev');
  fs.writeFileSync(path.join(data.repo, 'third.txt'), 'unselected\n');
  git(data.repo, 'add', 'third.txt');
  git(data.repo, 'commit', '-m', 'unselected dev content');
  git(data.repo, 'checkout', 'release-0.1.0-rc.1');
  const inspected = inspectReleaseSelection({ repo: data.repo, version: '0.1.0-rc.1', devRef: 'dev' });
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.releaseHead, beforeDevAdvance, 'dev advance must not mutate release');
  assert.equal(inspected.generation, 1);
  assert.equal(inspected.selectionIdentity.startsWith('sha256-'), true);
});

test('selection update fails closed when the caller workspace is not the release target', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));

  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.8', baseline: data.baseline, devRef: 'dev' });
  const releaseHeadBefore = git(data.repo, 'rev-parse', 'refs/heads/release-0.1.0-rc.8');
  git(data.repo, 'checkout', 'dev');
  const devHeadBefore = git(data.repo, 'rev-parse', 'HEAD');

  const blocked = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.8', source: data.sourceA, devRef: 'dev' });

  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'release_selection_target_mismatch');
  assert.deepEqual(blocked.effects, []);
  assert.equal(blocked.diagnostic.details.expectedBranch, 'release-0.1.0-rc.8');
  assert.equal(blocked.diagnostic.details.actualBranch, 'dev');
  assert.equal(git(data.repo, 'rev-parse', 'HEAD'), devHeadBefore);
  assert.equal(git(data.repo, 'rev-parse', 'refs/heads/release-0.1.0-rc.8'), releaseHeadBefore);
});

test('freeze is idempotent, direct update stays blocked, and explicit reopen allows a new generation', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2', baseline: data.baseline });
  const frozen = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(frozen.status, 'passed', JSON.stringify(frozen));
  assert.equal(frozen.freeze.state, 'frozen');
  assert.deepEqual(frozen.freezeHistory.map(({ generation, commit, state }) => ({ generation, commit, state })), [{ generation: 0, commit: data.baseline, state: 'valid' }]);
  const repeated = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(repeated.status, 'passed');
  assert.deepEqual(repeated.effects, []);
  const blocked = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.2', source: data.sourceA });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.effects.length, 0);
  assert.match(blocked.diagnostic.message, /frozen/);
  const missingConfirmation = reopenReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2', reason: 'Candidate failed.' });
  assert.equal(missingConfirmation.status, 'blocked');
  const missingReason = reopenReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2', confirm: true });
  assert.equal(missingReason.status, 'blocked');
  const reopenedCli = spawnSync(process.execPath, [RELEASE_SELECTION_CLI, 'reopen', '--repo', data.repo, '--version', '0.1.0-rc.2', '--confirm', '--reason', 'Candidate failed before publication.'], { cwd: data.repo, encoding: 'utf8' });
  assert.equal(reopenedCli.status, 0, reopenedCli.stderr || reopenedCli.stdout);
  const reopened = JSON.parse(reopenedCli.stdout);
  assert.equal(reopened.status, 'passed', JSON.stringify(reopened));
  assert.equal(reopened.freeze.state, 'open');
  assert.equal(reopened.freezeHistory[0].commit, data.baseline);
  assert.equal(reopened.effects[0].reason, 'Candidate failed before publication.');
  const selected = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.2', source: data.sourceA });
  assert.equal(selected.status, 'passed', JSON.stringify(selected));
  assert.equal(selected.generation, 1);
  const refrozen = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(refrozen.status, 'passed', JSON.stringify(refrozen));
  assert.deepEqual(refrozen.freezeHistory.map((entry) => entry.generation), [0, 1]);
  assert.equal(refrozen.freezeHistory[1].commit, refrozen.releaseHead);
  const abandoned = abandonReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(abandoned.status, 'passed');
  assert.equal(abandoned.abandon.state, 'abandoned');
});

test('reopen migrates a legacy frozen ref and fails closed when immutable history drifts', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.7', baseline: data.baseline });
  git(data.repo, 'update-ref', 'refs/buildr/release/0.1.0-rc.7/frozen', data.baseline);
  const legacy = inspectReleaseSelection({ repo: data.repo, version: '0.1.0-rc.7' });
  assert.equal(legacy.status, 'frozen');
  assert.deepEqual(legacy.freezeHistory, []);
  const reopened = reopenReleaseSelection({ repo: data.repo, version: '0.1.0-rc.7', confirm: true, reason: 'Legacy Candidate failed.' });
  assert.equal(reopened.status, 'passed', JSON.stringify(reopened));
  assert.equal(reopened.freezeHistory[0].commit, data.baseline);
  const refrozen = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.7' });
  assert.equal(refrozen.status, 'passed', JSON.stringify(refrozen));
  git(data.repo, 'update-ref', 'refs/buildr/release/0.1.0-rc.7/freezes/0', data.sourceA, data.baseline);
  const drifted = inspectReleaseSelection({ repo: data.repo, version: '0.1.0-rc.7' });
  assert.equal(drifted.status, 'blocked');
  assert.equal(drifted.integrity.code, 'freeze_history_invalid');
  const blocked = reopenReleaseSelection({ repo: data.repo, version: '0.1.0-rc.7', confirm: true, reason: 'Must not bypass drift.' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.effects.length, 0);
});

test('selection fails closed for baseline drift, dirty worktree and a real cherry-pick conflict', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const unrelated = git(data.repo, 'checkout', '-b', 'unrelated', data.baseline);
  void unrelated;
  fs.writeFileSync(path.join(data.repo, 'unrelated.txt'), 'outside dev\n');
  git(data.repo, 'add', 'unrelated.txt');
  git(data.repo, 'commit', '-m', 'unrelated');
  const unrelatedHead = git(data.repo, 'rev-parse', 'HEAD');
  const drifted = createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.3', baseline: unrelatedHead, devRef: 'dev' });
  assert.equal(drifted.status, 'blocked');
  assert.equal(drifted.effects.length, 0);
  git(data.repo, 'checkout', 'dev');
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.3', baseline: data.baseline, devRef: 'dev' });
  fs.writeFileSync(path.join(data.repo, 'dirty.txt'), 'not committed\n');
  const dirty = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.3', source: data.sourceA, devRef: 'dev' });
  assert.equal(dirty.status, 'blocked');
  assert.equal(dirty.effects.length, 0);
  fs.rmSync(path.join(data.repo, 'dirty.txt'));
  git(data.repo, 'checkout', 'dev');
  git(data.repo, 'checkout', '-b', 'release-conflict', data.baseline);
  fs.writeFileSync(path.join(data.repo, 'selection.txt'), 'local conflicting content\n');
  git(data.repo, 'commit', '-am', `local release change\n\n(cherry picked from commit ${data.sourceB})`);
  git(data.repo, 'checkout', 'dev');
  // The release branch is recreated under the expected name from the same conflicting local state.
  git(data.repo, 'branch', '-f', 'release-0.1.0-rc.4', 'release-conflict');
  git(data.repo, 'checkout', 'release-0.1.0-rc.4');
  git(data.repo, 'update-ref', `refs/buildr/release/0.1.0-rc.4/baseline`, data.baseline);
  const conflict = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.4', source: data.sourceA, devRef: 'dev' });
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.diagnostic.code, 'release_selection_conflict');
  assert.deepEqual(conflict.effects, []);
  assert.equal(conflict.conflict.recovery, 'git cherry-pick --abort');
  git(data.repo, 'cherry-pick', '--abort');
});

test('main reconciliation creates a new frozen generation with explicit parents and is idempotent', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.9', baseline: data.baseline, devRef: 'dev' });
  selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.9', source: data.sourceA, devRef: 'dev' });
  const frozen = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.9', devRef: 'dev' });
  git(data.repo, 'branch', 'main', data.baseline);
  git(data.repo, 'checkout', 'main');
  fs.writeFileSync(path.join(data.repo, 'main-only.txt'), 'main change\n');
  git(data.repo, 'add', 'main-only.txt');
  git(data.repo, 'commit', '-m', 'main-only change');
  const mainCommit = git(data.repo, 'rev-parse', 'HEAD');
  git(data.repo, 'push', 'origin', 'main');
  git(data.repo, 'checkout', 'release-0.1.0-rc.9');

  const reconciled = reconcileReleaseSelectionWithMain({ repo: data.repo, version: '0.1.0-rc.9', devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'Resolve the current main ancestry before release PR.' });
  assert.equal(reconciled.status, 'passed', JSON.stringify(reconciled));
  assert.equal(reconciled.action, 'reconciled');
  assert.equal(reconciled.generation, 2);
  assert.equal(reconciled.freezeHistory.at(-1).generation, 2);
  const entry = reconciled.reconciliationChain[0];
  assert.equal(entry.mainParent, mainCommit);
  assert.equal(entry.releaseParent, frozen.releaseHead);
  assert.equal(entry.resultReleaseCommit, reconciled.releaseHead);
  assert.equal(entry.parents.includes(mainCommit), true);
  assert.equal(entry.parents.includes(frozen.releaseHead), true);
  assert.match(entry.reconciliationIdentity, /^sha256-[a-f0-9]{64}$/u);
  assert.equal(git(data.repo, 'show', '-s', '--format=%B', reconciled.releaseHead).includes(`Buildr-Main-Reconciliation-Main: ${mainCommit}`), true);

  const repeated = reconcileReleaseSelectionWithMain({ repo: data.repo, version: '0.1.0-rc.9', devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'Same reconciliation readback.' });
  assert.equal(repeated.status, 'passed');
  assert.equal(repeated.action, 'already-converged');
  assert.deepEqual(repeated.effects, []);
  assert.equal(repeated.releaseHead, reconciled.releaseHead);
});

test('main reconciliation leaves a real conflict for explicit resolution and does not commit it', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.10', baseline: data.baseline, devRef: 'dev' });
  selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.10', source: data.sourceA, devRef: 'dev' });
  const frozen = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.10', devRef: 'dev' });
  git(data.repo, 'branch', 'main', data.baseline);
  git(data.repo, 'checkout', 'main');
  fs.writeFileSync(path.join(data.repo, 'selection.txt'), 'main conflicting content\n');
  git(data.repo, 'commit', '-am', 'main conflicting change');
  const mainCommit = git(data.repo, 'rev-parse', 'HEAD');
  git(data.repo, 'push', 'origin', 'main');
  git(data.repo, 'checkout', 'release-0.1.0-rc.10');

  const blocked = reconcileReleaseSelectionWithMain({ repo: data.repo, version: '0.1.0-rc.10', devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'Expose conflict for review.' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'release_main_reconciliation_conflict');
  assert.deepEqual(blocked.effects, []);
  assert.equal(blocked.conflict.mainParent, mainCommit);
  assert.deepEqual(blocked.conflict.conflictPaths, ['selection.txt']);
  assert.equal(git(data.repo, 'rev-parse', 'HEAD'), frozen.releaseHead);
  git(data.repo, 'merge', '--abort');
  assert.equal(inspectReleaseSelection({ repo: data.repo, version: '0.1.0-rc.10', devRef: 'dev' }).status, 'frozen');
});

test('cleanup is local-only, explicit and ignores retained remote-tracking release projections', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5', baseline: data.baseline });
  freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5' });
  const missingConfirmation = cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5' });
  assert.equal(missingConfirmation.status, 'blocked');
  assert.equal(missingConfirmation.effects.length, 0);
  git(data.repo, 'checkout', 'dev');
  const cleaned = cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5', confirm: true });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.equal(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/release-0.1.0-rc.5'], { cwd: data.repo }).status, 1);
  assert.equal(spawnSync('git', ['for-each-ref', '--format=%(refname)', 'refs/buildr/release/0.1.0-rc.5/'], { cwd: data.repo, encoding: 'utf8' }).stdout.trim(), '');
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.6', baseline: data.baseline });
  git(data.repo, 'checkout', 'dev');
  git(data.repo, 'push', 'origin', 'release-0.1.0-rc.6:release-0.1.0-rc.6');
  git(data.repo, 'fetch', 'origin');
  const remoteRetained = cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.6', confirm: true });
  assert.equal(remoteRetained.status, 'passed', JSON.stringify(remoteRetained));
  assert.equal(git(data.repo, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.6').startsWith(data.baseline), true);
  assert.equal(cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.6', confirm: true }).action, 'already-cleaned');
});
