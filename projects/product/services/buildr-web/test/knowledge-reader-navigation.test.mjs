import assert from 'node:assert/strict';
import test from 'node:test';
import { documentReadingTree, filterReadingTree, readingAncestors, readingNodeCount, topicReadingTree } from '../src/features/knowledge/knowledge-reader-navigation.ts';

const topics = [
  { id: 'overview', title: '整体认识', summary: '业务目标', parent: null },
  { id: 'system', title: '系统组成', summary: '协作与职责', parent: null },
  { id: 'data', title: '数据设计', summary: '存储边界', parent: 'system' },
];
const artifacts = [
  { id: 'intro', title: '产品介绍', kind: 'document', path: 'docs/intro.md', objects: ['overview'] },
  { id: 'map', title: '实现定位', kind: 'code-map', path: 'maps/data.md', objects: ['system', 'data'] },
  { id: 'diagram', title: '数据关系', kind: 'diagram', path: 'diagrams/data.html', objects: ['data'] },
  { id: 'terms', title: '核心术语', kind: 'terms', path: 'docs/terms.md', objects: [] },
];
const targets = nodes => nodes.flatMap(node => [...(node.target?.kind === 'artifact' ? [node.target.id] : []), ...targets(node.children)]);

test('完整元数据形成主题与未归属目录，多主题入口不复制身份计数', () => {
  const tree = topicReadingTree(topics, artifacts);
  assert.deepEqual(tree.map(node => node.key), ['topic:overview', 'topic:system', 'unassigned']);
  assert.equal(readingNodeCount(tree), 4);
  assert.equal(targets(tree).filter(id => id === 'map').length, 2);
  assert.deepEqual(readingAncestors(tree, { kind: 'artifact', id: 'diagram' }), ['topic:system', 'topic:data']);
  const many = Array.from({ length: 45 }, (_, index) => ({ ...artifacts[0], id: `item-${index}`, objects: [] }));
  assert.equal(readingNodeCount(topicReadingTree([], many)), 45);
  assert.ok(targets(topicReadingTree([], many)).includes('item-44'));
});

test('检索保留祖先，跨标题与主题说明按空白分词AND，类型过滤不修改完整树', () => {
  const tree = topicReadingTree(topics, artifacts), before = JSON.stringify(tree);
  const filtered = filterReadingTree(tree, '存储 关系', 'all');
  assert.deepEqual(targets(filtered), ['diagram']);
  assert.equal(filtered[0].key, 'topic:system');
  assert.equal(filtered[0].children[0].key, 'topic:data');
  assert.deepEqual(targets(filterReadingTree(tree, '协作', 'diagrams')), ['diagram']);
  assert.deepEqual(targets(filterReadingTree(tree, '核心', 'documents')), ['terms']);
  assert.equal(readingNodeCount(filterReadingTree(tree, '', 'maps')), 1);
  assert.equal(JSON.stringify(tree), before);
  assert.deepEqual(filterReadingTree(tree, '无匹配', 'all'), []);
  assert.deepEqual(filterReadingTree(tree, '', 'all'), tree);
});

test('文档入口从章节移到顶层仍唯一计数，补充材料可匹配且保留章节', () => {
  const doc = (id, values = {}) => ({ id, title: id, summary: '', path: `${id}.md`, sectionId: 'start', supplementary: false, artifactId: null, location: 'scope', group: '项目', workspacePath: null, ...values });
  const data = {
    entryDocumentId: 'manual', sections: [{ id: 'start', title: '入门', summary: '开始使用', count: 3 }],
    documents: [doc('manual', { title: '使用与开发手册', supplementary: true }), doc('guide'), doc('impl', { title: '实现依据', supplementary: true, artifactId: 'map' })],
  };
  const tree = documentReadingTree(data, artifacts);
  assert.equal(tree[0].key, 'document:manual');
  assert.equal(tree[0].target.id, 'manual');
  assert.equal(readingNodeCount(tree), 3);
  assert.equal(readingNodeCount(tree[1].children), 2);
  assert.equal(JSON.stringify(tree).split('"key":"document:manual"').length - 1, 1);
  const filtered = filterReadingTree(tree, '依据', 'maps');
  assert.equal(filtered[0].key, 'section:start');
  assert.equal(filtered[0].children[0].key, 'supplementary:start');
  assert.equal(filtered[0].children[0].children[0].documentId, 'impl');
  assert.equal(readingNodeCount(filtered), 1);
  assert.equal(documentReadingTree({ ...data, entryDocumentId: null }, artifacts)[0].key, 'section:start');
  assert.deepEqual(documentReadingTree(null, artifacts), []);
});

test('损坏父子关系仍有界且不隐藏主题，未知选择不伪造祖先', () => {
  const cyclic = [{ ...topics[0], parent: 'system' }, { ...topics[1], parent: 'overview' }, topics[2]];
  const tree = topicReadingTree(cyclic, artifacts);
  assert.equal(readingNodeCount(tree), 4);
  assert.deepEqual(readingAncestors(tree, { kind: 'artifact', id: 'absent' }), []);
});

test('类型和关键词结果默认展开但仍能手动收起，不污染完整目录的展开状态', async () => {
  const { readingBranchOpen, toggleReadingBranch } = await import('../src/features/knowledge/knowledge-reader-navigation.ts');
  const base = { query: '', filter: 'all', expanded: { 'topic:system': false, 'topic:overview': true } };
  assert.equal(readingBranchOpen(base, 'topic:system'), false);
  const filtered = { ...base, filter: 'maps' };
  assert.equal(readingBranchOpen(filtered, 'topic:system'), true);
  const closed = toggleReadingBranch(filtered, 'topic:system');
  assert.equal(readingBranchOpen(closed, 'topic:system'), false);
  assert.deepEqual(closed.expanded, base.expanded);
  assert.equal(readingBranchOpen(toggleReadingBranch(closed, 'topic:system'), 'topic:system'), true);
  const searched = { ...closed, query: '关系', filter: 'all' };
  assert.equal(readingBranchOpen(searched, 'topic:system'), true, '新的检索结果独立自动展开');
  const searchClosed = toggleReadingBranch(searched, 'topic:system');
  assert.equal(readingBranchOpen(searchClosed, 'topic:system'), false);
  assert.equal(readingBranchOpen({ ...searchClosed, query: '', filter: 'maps' }, 'topic:system'), false, '返回之前的类型过滤保留手动状态');
  const clear = { ...searchClosed, query: '', filter: 'all' };
  assert.equal(readingBranchOpen(clear, 'topic:system'), false);
  assert.equal(readingBranchOpen(clear, 'topic:overview'), true, '清除过滤恢复完整目录原展开');
  assert.deepEqual(base, { query: '', filter: 'all', expanded: { 'topic:system': false, 'topic:overview': true } });
});

test('只对手动调整的过滤保留有界状态，查询规范化不制造重复历史', async () => {
  const { readingBranchOpen, toggleReadingBranch } = await import('../src/features/knowledge/knowledge-reader-navigation.ts');
  let preferences = { query: ' NODE   Runtime ', filter: 'all', expanded: {} };
  preferences = toggleReadingBranch(preferences, 'section:tests');
  assert.equal(readingBranchOpen({ ...preferences, query: 'node runtime' }, 'section:tests'), false);
  for (let index = 0; index < 25; index++) preferences = toggleReadingBranch({ ...preferences, query: String(index) }, 'section:tests');
  assert.equal(Object.keys(preferences.filteredExpanded).length, 16);
  assert.equal(readingBranchOpen(preferences, 'section:tests'), false);
});
