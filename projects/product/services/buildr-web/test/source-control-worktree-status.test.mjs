import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceControlWorktreeStatus} from '../src/features/code/source-control-worktree-status.ts';

const worktree = (overrides = {}) => ({status:'clean', upstream:'origin/dev', ahead:0, behind:0, fileCount:0, ...overrides});

test('the combined check requires both known zero quantities and an observed tracking branch', () => {
  const clean = sourceControlWorktreeStatus(worktree());
  assert.equal(clean.clean, true);
  assert.deepEqual(clean.counts, []);
  assert.equal(clean.remoteLabel, '未推送 0 个提交，落后远程跟踪记录 0 个提交');
  assert.equal(clean.fileLabel, '没有未提交文件');
  for (const overrides of [{ahead:1}, {behind:2}, {fileCount:3}, {ahead:null}, {behind:null}, {fileCount:null}, {upstream:null}, {upstream:undefined}]) {
    assert.equal(sourceControlWorktreeStatus(worktree(overrides)).clean, false, JSON.stringify(overrides));
  }
});

test('nonzero observed quantities remain exact while zero directions take no inline space', () => {
  assert.deepEqual(sourceControlWorktreeStatus(worktree({ahead:2, fileCount:123})).counts, [{kind:'ahead', count:2}, {kind:'files', count:123}]);
  assert.deepEqual(sourceControlWorktreeStatus(worktree({behind:12})).counts, [{kind:'behind', count:12}]);
  const partial = sourceControlWorktreeStatus(worktree({status:'partial', ahead:123, behind:45, fileCount:321}));
  assert.deepEqual(partial.counts, [{kind:'ahead', count:123}, {kind:'behind', count:45}, {kind:'files', count:321}]);
  assert.equal(partial.remoteLabel, '未推送 123 个提交，落后远程跟踪记录 45 个提交');
  assert.equal(partial.fileLabel, '321 个未提交文件');
});

test('untracked and unknown observations stay distinct from zero and preserve known file quantities', () => {
  const untracked = sourceControlWorktreeStatus(worktree({upstream:null, ahead:null, behind:null, fileCount:14}));
  assert.equal(untracked.remoteState, 'untracked');
  assert.equal(untracked.remoteLabel, '未跟踪远程分支');
  assert.deepEqual(untracked.counts, [{kind:'files', count:14}]);
  const unknown = sourceControlWorktreeStatus(worktree({status:'partial', ahead:null, behind:null, fileCount:null}));
  assert.equal(unknown.remoteState, 'unknown');
  assert.equal(unknown.fileState, 'unknown');
  assert.deepEqual(unknown.counts, []);
  assert.equal(sourceControlWorktreeStatus(worktree({upstream:undefined})).remoteState, 'unknown');
});

test('an unavailable or absent checkout cannot present residual quantities as current facts', () => {
  for (const input of [undefined, worktree({status:'offline', ahead:2, behind:3, fileCount:14})]) {
    const status = sourceControlWorktreeStatus(input);
    assert.equal(status.remoteState, 'unavailable');
    assert.equal(status.fileState, 'unavailable');
    assert.equal(status.clean, false);
    assert.deepEqual(status.counts, []);
    assert.match(status.remoteLabel, /不可读取/);
    assert.match(status.fileLabel, /不可读取/);
  }
});
