import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeProjectDocumentReturn, projectDocumentRoot, readProjectDocumentReturn, withProjectDocumentReturn } from '../src/features/project/project-document-navigation.ts';

const readme = { path: 'knowledge/docs/architecture/verification-framework.md', history: ['README.md', 'knowledge/docs/index.md', 'knowledge/docs/architecture/verification-framework.md'] };
const agents = { path: 'rules/review.md', history: ['AGENTS.md', 'rules/review.md'] };
const navigation = (overrides = {}) => ({ returnId: 'return-1', projectCode: 'product', ref: 'readme', ...readme, positions: { readme, agents }, ...overrides });

test('Explorer 刷新后返回保留原 location state、当前叶文档与两处资料的位置，正文不进入载荷', () => {
  const state = { resourceViews: { active: 'project:product' }, custom: { retained: true }, projectDocumentReturn: { stale: true } };
  const source = navigation({ content: 'DO NOT STORE', positions: { readme: { ...readme, content: 'DO NOT STORE' }, agents } });
  const serialized = JSON.parse(JSON.stringify(withProjectDocumentReturn(state, source)));
  assert.deepEqual(serialized.resourceViews, state.resourceViews);
  assert.deepEqual(serialized.custom, state.custom);
  assert.deepEqual(readProjectDocumentReturn(serialized, 'product'), navigation());
  assert.equal(JSON.stringify(serialized).includes('DO NOT STORE'), false);
  assert.equal(projectDocumentRoot('readme'), 'README.md');
  assert.equal(projectDocumentRoot('agents'), 'AGENTS.md');
  // Opening the returned active ref restores the side pane; switching refs can restore each history independently.
  assert.equal(readProjectDocumentReturn(serialized, 'product').ref, 'readme');
  assert.deepEqual(readProjectDocumentReturn(serialized, 'product').positions.agents, agents);
});

test('每次返回只消费一次，保留 state 的普通导航不重放旧 leaf，冷页面仍可恢复', () => {
  const state = withProjectDocumentReturn({ retained: true }, navigation());
  const consumed = new Set();
  assert.deepEqual(consumeProjectDocumentReturn(state, 'product', consumed), navigation());
  assert.equal(consumeProjectDocumentReturn({ ...state }, 'product', consumed), null);
  assert.deepEqual(consumeProjectDocumentReturn(state, 'product', new Set()), navigation());
  const second = withProjectDocumentReturn(state, navigation({ returnId: 'return-2', ref: 'agents', ...agents }));
  assert.equal(consumeProjectDocumentReturn(second, 'product', consumed).ref, 'agents');
});

test('返回目标仅为同项目的规范相对 .md 文件；越界、协议、非法历史与其他资料身份拒绝', () => {
  const valid = withProjectDocumentReturn(null, navigation());
  assert.equal(readProjectDocumentReturn(valid, 'other'), null);
  for (const path of ['/README.md', '../README.md', 'docs/../../README.md', './README.md', 'docs//guide.md', 'docs\\guide.md', 'https://example.com/guide.md', 'file:guide.md', '.git/guide.md', 'docs/guide.txt', 'docs/guide.md\u0000']) {
    const malformed = { projectDocumentReturn: navigation({ path, history: ['README.md', path], positions: {} }) };
    assert.equal(readProjectDocumentReturn(malformed, 'product'), null, path);
  }
  for (const overrides of [
    { ref: 'knowledge' }, { returnId: '' }, { history: ['AGENTS.md', readme.path] },
    { history: ['README.md', 'other.md'] }, { positions: { readme, unknown: agents } },
    { positions: { readme, agents: { path: agents.path, history: ['README.md', agents.path] } } },
  ]) assert.equal(readProjectDocumentReturn({ projectDocumentReturn: navigation(overrides) }, 'product'), null);
  assert.deepEqual(withProjectDocumentReturn({ retained: true, projectDocumentReturn: 'stale' }, navigation({ path: '../outside.md' })), { retained: true });
});

test('只恢复返回时仍打开的资料，当前资料的位置取最新值且导航数组不共享引用', () => {
  const source = navigation({ history: [...readme.history], positions: { readme: { path: 'README.md', history: ['README.md'] } } });
  const state = withProjectDocumentReturn(null, source);
  const restored = readProjectDocumentReturn(state, 'product');
  assert.deepEqual(Object.keys(restored.positions), ['readme']);
  assert.deepEqual(restored.positions.readme, readme);
  source.history.push('late.md');
  assert.deepEqual(readProjectDocumentReturn(state, 'product').history, readme.history);
});
