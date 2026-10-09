import assert from 'node:assert/strict';
import test from 'node:test';
import {branchSwitchImpact, branchSwitchFailure} from '../src/features/code/source-control-branches.ts';

const main = {worktreeId: 'main', name: 'main', isMain: true, location: '/repo', branch: 'dev', status: 'ready'};
const linked = {worktreeId: 'linked', name: 'task', isMain: false, location: '/repo/.worktrees/task', branch: 'main', status: 'ready'};
const repository = {worktrees: [main, linked]};
const branch = (name, extra = {}) => ({ref: 'refs/heads/' + name, name, kind: 'local', hash: 'a'.repeat(40), upstream: null, worktreeId: null, worktreeLocation: null, current: false, localBranch: null, ...extra});
const remote = (name, extra = {}) => branch(name, {ref: 'refs/remotes/' + name, kind: 'remote', remote: name.split('/')[0], ...extra});

test('远程独有项使用完整末段名称；同名不同远程不能猜测本地跟踪关系', () => {
  const review = remote('origin/feature/review');
  assert.deepEqual(branchSwitchImpact(repository, main, [review], review), {localName: 'feature/review', same: false, occupied: undefined, blockedReason: '', needsLocalName: false, createTracking: true});
  const collision = branch('feature/review', {upstream: 'upstream/feature/review'});
  const impact = branchSwitchImpact(repository, main, [review, collision], review);
  assert.equal(impact.needsLocalName, true);
  assert.equal(impact.createTracking, true);
  assert.equal(impact.same, false);
});

test('正确跟踪项使用其真实本地名称和占用位置，不从远程名称或提交推断', () => {
  const tracked = {ref: 'refs/heads/my-main', name: 'my-main', hash: 'b'.repeat(40), upstream: 'origin/main', worktreeId: 'linked', worktreeLocation: linked.location};
  const entry = remote('origin/main', {localBranch: tracked});
  const impact = branchSwitchImpact(repository, main, [entry], entry);
  assert.equal(impact.localName, 'my-main');
  assert.equal(impact.createTracking, false);
  assert.equal(impact.occupied, linked);
  assert.equal(impact.same, false);
  assert.equal(branchSwitchImpact(repository, linked, [entry], entry).same, true);
});

test('清单截断仍表达已观察的占用，而非把不可枚举的位置当作空闲', () => {
  const entry = branch('busy', {worktreeId: 'not-in-current-catalog', worktreeLocation: '/repo/.worktrees/busy'});
  const impact = branchSwitchImpact(repository, main, [entry], entry);
  assert.equal(impact.occupied.worktreeId, 'not-in-current-catalog');
  assert.equal(impact.occupied.location, '/repo/.worktrees/busy');
});

test('切换冲突呈现服务器的真实受影响路径，普通失败不会伪造文件冲突', () => {
  const error = Object.assign(new Error('当前内容阻止切换'), {details: {affectedFiles: ['same.ts', 8, 'untracked.txt'], current: {branch: 'dev'}, effects: {switched: false}}});
  assert.deepEqual(branchSwitchFailure(error), {message: '当前内容阻止切换', affectedFiles: ['same.ts', 'untracked.txt']});
  assert.deepEqual(branchSwitchFailure(new Error('目标已改变')), {message: '目标已改变', affectedFiles: []});
});

test('部分写入与无法重读的失败保留真实效果，不表达为零写入', () => {
  const error = Object.assign(new Error('后续核对失败'), {details: {current: {branch: 'feature/review'}, effects: {switched: true, createdLocalBranch: 'feature/review'}}});
  assert.equal(branchSwitchFailure(error).message, '后续核对失败 已建立本地分支 feature/review。 当前位置已切换到 feature/review。');
  const unknown = Object.assign(new Error('当前状态不可读取'), {details: {resultUnconfirmed: true}});
  assert.match(branchSwitchFailure(unknown).message, /当前效果尚未确认/);
});
