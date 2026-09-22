import assert from 'node:assert/strict';
import test from 'node:test';
import { canInitializeKnowledge, knowledgeInitializationContext } from '../src/features/knowledge/knowledge-initialize.ts';

const navigation = {
  scope: { kind: 'project', id: 'project-id', title: '订单项目', directory: '/workspace/projects/orders' },
  revision: null, entryObject: null, artifactCount: 0, topics: [], diagnostics: [],
};
const state = (patch = {}) => ({ data: navigation, loading: false, error: '', ...patch });

test('仅成功读取全范围零成果才引导首建，已有主题结构仍可补充内容', () => {
  assert.equal(canInitializeKnowledge(state()), true);
  assert.equal(canInitializeKnowledge(state({ data: { ...navigation, revision: 'existing-index', topics: [{ id: 'overview', title: '整体认识', parent: null, summary: '已有规划' }] } })), true);
  for (const kind of ['project', 'service']) assert.equal(canInitializeKnowledge(state({ data: { ...navigation, scope: { ...navigation.scope, kind } } })), true);
});

test('加载、错误、未知总数和有成果的空分类或零搜索均不能冒充首次空知识', () => {
  assert.equal(canInitializeKnowledge(state({ loading: true })), false);
  assert.equal(canInitializeKnowledge(state({ error: '导航读取失败' })), false);
  assert.equal(canInitializeKnowledge(state({ data: null })), false);
  for (const artifactCount of [undefined, null, '0', -1, 1, 40]) {
    assert.equal(canInitializeKnowledge(state({ data: { ...navigation, artifactCount } })), false);
  }
  // Whole-scope counts remain authoritative even if the selected category/query matches nothing.
  assert.equal(canInitializeKnowledge(state({ data: { ...navigation, artifactCount: 2 }, matchingCount: 0, query: '无匹配', category: 'documents' })), false);
});

test('首建接续自动携带真实范围、观察版本和已有主题，不修改来源数据', () => {
  const data = { ...navigation, revision: 'r2', topics: [{ id: 'overview', title: '已有总览', parent: null, summary: '应复用' }] };
  const before = structuredClone(data);
  const context = knowledgeInitializationContext(data, '/workspaces/w/knowledge/project/orders');
  assert.equal(context.mode, 'initialize');
  assert.deepEqual(context.scope, data.scope);
  assert.equal(context.indexRevision, 'r2');
  assert.deepEqual(context.topics, data.topics);
  assert.equal(context.artifactCount, 0);
  assert.equal(context.readingPath, '/workspaces/w/knowledge/project/orders');
  assert.deepEqual(data, before);
});

test('同范围正文已观察到不同版本时抑制旧零成果引导，不从裁剪的来源索引推断总数', () => {
  const empty = state({ data: { ...navigation, revision: 'r1' } });
  const current = { scope: navigation.scope, revision: 'r2', index: { artifacts: [] } };
  assert.equal(canInitializeKnowledge(empty, current), false, '来源索引可能经过裁剪，版本不一致就不能复用旧首建观察');
  assert.equal(canInitializeKnowledge(empty, null, { ...current, matchingCount: 3 }), false, '全部资料的新目录观察同样阻止旧零成果引导');
  assert.equal(canInitializeKnowledge(empty, { ...current, revision: 'r1' }), true);
  assert.equal(canInitializeKnowledge(empty, { ...current, revision: null }), false);
  assert.equal(canInitializeKnowledge(state(), { ...current, revision: null }), true);
  assert.equal(canInitializeKnowledge(empty, { ...current, scope: { ...navigation.scope, id: 'different-scope' } }), true, '其他范围观察不替代当前范围的导航');
});
