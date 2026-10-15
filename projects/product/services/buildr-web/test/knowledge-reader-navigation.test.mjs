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

test('两篇说明承载各自内嵌图，目录与计数只保留说明且图名路径检索和过滤可达', () => {
  const items = [
    { ...artifacts[0], id: 'first', objects: ['system'] },
    { ...artifacts[0], id: 'second', title: '生成说明', objects: ['system'] },
    { ...artifacts[2], id: 'structure', title: '接入关系图', path: 'diagrams/structure.html', objects: ['system'] },
    { ...artifacts[2], id: 'sequence', title: '提交说明时序', path: 'diagrams/sequence.html', objects: ['system'] },
  ];
  const relations = [
    { from: 'first', to: 'structure', kind: 'contains' },
    { from: 'second', to: 'sequence', kind: 'contains' },
  ];
  const before = JSON.stringify({ items, relations });
  const tree = topicReadingTree(topics, items, relations);
  assert.deepEqual(targets(tree), ['first', 'second']);
  assert.equal(readingNodeCount(tree), 2);
  assert.deepEqual(targets(filterReadingTree(tree, '接入关系', 'all')), ['first']);
  assert.deepEqual(targets(filterReadingTree(tree, 'diagrams/sequence.html', 'diagrams')), ['second']);
  assert.deepEqual(targets(filterReadingTree(tree, '', 'diagrams')), ['first', 'second']);
  assert.deepEqual(targets(filterReadingTree(tree, '', 'documents')), ['first', 'second']);
  assert.equal(JSON.stringify({ items, relations }), before, '不改写原成果及包含关系');
  assert.deepEqual(targets(topicReadingTree(topics, items)), ['first', 'second', 'structure', 'sequence'], '旧索引无关系保留原导航');
});

test('图仅在同组有承载说明时合并，多主题、独立图和未归属图仍可发现', () => {
  const items = [
    { ...artifacts[0], id: 'first', objects: ['system'] },
    { ...artifacts[0], id: 'second', title: '另一篇说明', objects: ['system'] },
    { ...artifacts[2], id: 'shared', objects: ['system', 'data'] },
    { ...artifacts[2], id: 'standalone', objects: ['system'] },
    { ...artifacts[2], id: 'unassigned', objects: [] },
  ];
  const relations = [
    { from: 'first', to: 'shared', kind: 'contains' },
    { from: 'second', to: 'shared', kind: 'contains' },
    { from: 'first', to: 'unassigned', kind: 'contains' },
    { from: 'missing', to: 'standalone', kind: 'contains' },
    { from: 'first', to: 'standalone', kind: 'explains' },
    { from: 'standalone', to: 'first', kind: 'contains' },
  ];
  const tree = topicReadingTree(topics, items, relations);
  assert.deepEqual(targets(tree), ['first', 'second', 'standalone', 'shared', 'unassigned']);
  assert.deepEqual(readingAncestors(tree, { kind: 'artifact', id: 'shared' }), ['topic:system', 'topic:data']);
  assert.equal(readingNodeCount(tree), 5);
  const unassignedHost = { ...items[0], id: 'loose-document', objects: [] };
  const unassignedTree = topicReadingTree(topics, [...items, unassignedHost], [...relations, { from: unassignedHost.id, to: 'unassigned', kind: 'contains' }]);
  assert.deepEqual(targets(unassignedTree).slice(-1), [unassignedHost.id]);
  assert.ok(!targets(unassignedTree).includes('unassigned'), '未归属组也只合并其自身承载的图');
});

test('文档目录按已登记说明关联内嵌图检索，不新增图或不存在文档入口', () => {
  const host = { ...artifacts[0], id: 'host' };
  const relations = [{ from: host.id, to: 'diagram', kind: 'contains' }];
  const doc = (id, artifactId) => ({ id, artifactId, title: id, summary: '', path: `${id}.md`, sectionId: 'architecture', supplementary: false });
  const data = {
    entryDocumentId: null,
    sections: [{ id: 'architecture', title: '架构', summary: '', count: 2 }],
    documents: [doc('guide', host.id), doc('ordinary', null)],
  };
  const tree = documentReadingTree(data, [...artifacts, host], relations);
  assert.equal(readingNodeCount(tree), 2);
  assert.deepEqual(targets(filterReadingTree(tree, '数据关系', 'all')), [host.id]);
  assert.deepEqual(targets(filterReadingTree(tree, 'diagrams/data.html', 'diagrams')), [host.id]);
  assert.deepEqual(targets(filterReadingTree(tree, '', 'diagrams')), [host.id]);
  assert.equal(readingNodeCount(documentReadingTree({ ...data, documents: [data.documents[1]] }, [...artifacts, host], relations)), 1);
  assert.deepEqual(filterReadingTree(documentReadingTree(data, [...artifacts, host]), '', 'diagrams'), [], '旧关系不从路径猜嵌图');
});

test('文章内嵌图与普通链接地图共用承载入口，两种类型检索与计数不重复', () => {
  const host = { ...artifacts[0], id: 'host', objects: ['system'] };
  const diagram = { ...artifacts[2], objects: ['system'] };
  const map = { ...artifacts[1], objects: ['system'] };
  const relations = [
    { from: host.id, to: diagram.id, kind: 'contains' },
    { from: host.id, to: map.id, kind: 'guides' },
  ];
  const tree = topicReadingTree(topics, [host, diagram, map], relations);
  assert.deepEqual(targets(tree), [host.id]);
  assert.equal(readingNodeCount(tree), 1);
  for (const [query, type] of [['数据关系', 'diagrams'], ['maps/data.md', 'maps'], ['', 'documents']]) {
    assert.deepEqual(targets(filterReadingTree(tree, query, type)), [host.id]);
  }
  assert.deepEqual(tree[1].children[0].embeddedTypes, ['diagrams', 'maps']);
  assert.deepEqual(targets(topicReadingTree(topics, [host, diagram, map])), [host.id, diagram.id, map.id], '旧索引保留独立成果而不猜普通链接');
});

test('文章到地图再到内嵌图的真实链传递检索，多主题仅图或地图仍可达', () => {
  const host = { ...artifacts[0], id: 'host', objects: ['system'] };
  const map = { ...artifacts[1], objects: ['system', 'data'] };
  const diagram = { ...artifacts[2], objects: ['system', 'overview'] };
  const relations = [
    { from: host.id, to: map.id, kind: 'guides' },
    { from: map.id, to: diagram.id, kind: 'contains' },
  ];
  const tree = topicReadingTree(topics, [host, map, diagram], relations);
  assert.deepEqual(targets(tree), [diagram.id, host.id, map.id]);
  assert.equal(readingNodeCount(tree), 3);
  assert.deepEqual(targets(tree[1].children), [host.id, map.id], '本主题合并到文章，子主题地图保留自身入口');
  assert.deepEqual(targets(filterReadingTree(tree, 'diagrams/data.html', 'diagrams')), [diagram.id, host.id, map.id]);
  assert.deepEqual(targets(filterReadingTree(tree, 'maps/data.md', 'maps')), [host.id, map.id]);
  assert.deepEqual(readingAncestors(tree, { kind: 'artifact', id: map.id }), ['topic:system', 'topic:data']);
});

test('不合法关系、自引用和地图互引不吞掉独立图与地图，术语文章可承载', () => {
  const host = { ...artifacts[3], objects: ['system'] };
  const map = { ...artifacts[1], objects: ['system'] };
  const secondMap = { ...map, id: 'second-map' };
  const diagram = { ...artifacts[2], objects: ['system'] };
  const invalid = [
    { from: host.id, to: host.id, kind: 'contains' },
    { from: map.id, to: map.id, kind: 'contains' },
    { from: map.id, to: secondMap.id, kind: 'contains' },
    { from: secondMap.id, to: map.id, kind: 'contains' },
    { from: map.id, to: diagram.id, kind: 'guides' },
    { from: diagram.id, to: map.id, kind: 'contains' },
    { from: host.id, to: map.id, kind: 'explains' },
    { from: 'missing', to: diagram.id, kind: 'guides' },
  ];
  assert.deepEqual(targets(topicReadingTree(topics, [host, map, secondMap, diagram], invalid)), [host.id, map.id, secondMap.id, diagram.id]);
  const valid = [...invalid, { from: host.id, to: map.id, kind: 'contains' }, { from: host.id, to: diagram.id, kind: 'guides' }];
  const tree = topicReadingTree(topics, [host, map, secondMap, diagram], valid);
  assert.deepEqual(targets(tree), [host.id, secondMap.id]);
  assert.deepEqual(targets(filterReadingTree(tree, '数据关系', 'diagrams')), [host.id]);
});

test('文档目录为文章补齐图地图别名，同时保留实际地图Markdown文件', () => {
  const host = { ...artifacts[0], id: 'host' };
  const relations = [{ from: host.id, to: 'map', kind: 'guides' }, { from: 'map', to: 'diagram', kind: 'contains' }];
  const doc = (id, artifactId) => ({ id, artifactId, title: id, summary: '', path: `${id}.md`, sectionId: 'architecture', supplementary: false });
  const data = { entryDocumentId: null, sections: [{ id: 'architecture', title: '架构', summary: '', count: 3 }], documents: [doc('guide', host.id), { ...doc('map-file', 'map'), path: artifacts[1].path }, doc('ordinary', null)] };
  const tree = documentReadingTree(data, [...artifacts, host], relations);
  assert.equal(readingNodeCount(tree), 3);
  assert.deepEqual(targets(filterReadingTree(tree, 'maps/data.md', 'maps')), [host.id, 'map']);
  assert.deepEqual(targets(filterReadingTree(tree, '数据关系', 'diagrams')), [host.id, 'map']);
  assert.deepEqual(targets(tree), [host.id, 'map']);
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
