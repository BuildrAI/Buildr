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
  selectReleaseCommit,
} from '../../tools/release/release-selection.mjs';

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

test('freeze is idempotent and prevents later selection; abandon remains explicit', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2', baseline: data.baseline });
  const frozen = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(frozen.status, 'passed', JSON.stringify(frozen));
  assert.equal(frozen.freeze.state, 'frozen');
  const repeated = freezeReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(repeated.status, 'passed');
  assert.deepEqual(repeated.effects, []);
  const blocked = selectReleaseCommit({ repo: data.repo, version: '0.1.0-rc.2', source: data.sourceA });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.effects.length, 0);
  assert.match(blocked.diagnostic.message, /frozen/);
  const abandoned = abandonReleaseSelection({ repo: data.repo, version: '0.1.0-rc.2' });
  assert.equal(abandoned.status, 'passed');
  assert.equal(abandoned.abandon.state, 'abandoned');
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

test('cleanup is local-only, explicit and refuses remote-tracking release refs', (t) => {
  const data = fixture();
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5', baseline: data.baseline });
  const missingConfirmation = cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5' });
  assert.equal(missingConfirmation.status, 'blocked');
  assert.equal(missingConfirmation.effects.length, 0);
  git(data.repo, 'checkout', 'dev');
  const cleaned = cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.5', confirm: true });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.equal(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/release-0.1.0-rc.5'], { cwd: data.repo }).status, 1);
  createReleaseSelection({ repo: data.repo, version: '0.1.0-rc.6', baseline: data.baseline });
  git(data.repo, 'checkout', 'dev');
  git(data.repo, 'push', 'origin', 'release-0.1.0-rc.6:release-0.1.0-rc.6');
  git(data.repo, 'fetch', 'origin');
  const remoteBlocked = cleanupReleaseSelection({ repo: data.repo, version: '0.1.0-rc.6', confirm: true });
  assert.equal(remoteBlocked.status, 'blocked');
  assert.match(remoteBlocked.diagnostic.message, /remote release ref/i);
  assert.equal(remoteBlocked.effects.length, 0);
});
