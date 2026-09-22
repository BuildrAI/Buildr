import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeEntryObject, knowledgeReadingTopics, knowledgeSelectedTopic, knowledgeTopicArtifacts, knowledgeTopicTrail } from '../src/features/knowledge/knowledge-topics.ts';

const topics = [
  { id: 'overview', title: '整体认识', summary: '目标与边界', parent: null },
  { id: 'task', title: '任务协作', summary: '关键过程', parent: null },
  { id: 'closeout', title: '收尾与交付', summary: '交付结果', parent: 'task' },
  { id: 'cleanup', title: '清理', summary: '交付之后', parent: 'closeout' },
];
const navigation = { entryObject: 'overview', topics };

test('正文读到新的主题关系后目录使用同一次读取，不继续混入旧导航', () => {
  const current = { objects: [
    { id: 'overview', title: '新的总览', summary: '最新结构' },
    { id: 'task', title: '任务协作', summary: '关系调整', parent: 'overview' },
    { id: 'new-topic', title: '新增主题', summary: '新内容', parent: 'task' },
  ] };
  const result = knowledgeReadingTopics(current, topics);
  assert.deepEqual(result.map(topic => topic.id), ['overview', 'task', 'new-topic']);
  assert.equal(result[0].title, '新的总览');
  assert.equal(result[0].parent, null);
  assert.deepEqual(knowledgeTopicTrail(result, 'new-topic').map(topic => topic.id), ['overview', 'task', 'new-topic']);
  assert.equal(knowledgeReadingTopics(undefined, topics), topics, '尚未读取正文时使用轻量导航');
  assert.deepEqual(knowledgeReadingTopics(null, topics), [], '已确认索引被删除时不能复活旧主题');
  assert.deepEqual(knowledgeReadingTopics({ objects: [] }, topics), [], '当前已空不能回落旧主题');
  assert.equal(topics[0].title, '整体认识');
});

test('首次进入按显式entryObject阅读，默认documents入口一致，未声明时不猜第一篇', () => {
  for (const query of ['', 'view=documents', 'fromProject=parent&view=documents']) {
    assert.equal(knowledgeEntryObject(new URLSearchParams(query), navigation), 'overview');
  }
  assert.equal(knowledgeEntryObject(new URLSearchParams(), { ...navigation, entryObject: null }), null);
  assert.equal(knowledgeEntryObject(new URLSearchParams(), { ...navigation, entryObject: 'missing' }), null);
});

test('全部资料和既有定位优先，返回或搜索时不会跳回默认主题', () => {
  for (const query of ['browse=all', 'browse=all&view=documents', 'object=task', 'artifact=diagram', 'reading=map', 'q=', 'q=协作', 'view=diagrams', 'view=maps', 'view=unknown']) {
    assert.equal(knowledgeEntryObject(new URLSearchParams(query), navigation), null, query);
  }
  const fromHome = new URLSearchParams();
  fromHome.set('object', knowledgeEntryObject(fromHome, navigation));
  assert.equal(knowledgeEntryObject(fromHome, navigation), null, '一次默认替换后不重复导航');
});

test('主题祖先来自parent而非条目页码，深层链和未知主题都能有界处理', () => {
  assert.deepEqual(knowledgeTopicTrail(topics, 'cleanup').map(topic => topic.id), ['task', 'closeout', 'cleanup']);
  assert.deepEqual(knowledgeTopicTrail(topics, 'overview').map(topic => topic.id), ['overview']);
  assert.deepEqual(knowledgeTopicTrail(topics, 'missing'), []);
  assert.deepEqual(knowledgeTopicTrail(topics, null), []);
  const cyclic = [{ ...topics[1], parent: 'closeout' }, topics[2]];
  assert.equal(knowledgeTopicTrail(cyclic, 'task').length, 2, '防止异常元数据无限回溯');
});

test('单一归属成果可定位主题，多主题成果不擅自选择，已有主题优先', () => {
  assert.equal(knowledgeSelectedTopic(topics, 'task', ['task', 'closeout']), 'task');
  assert.equal(knowledgeSelectedTopic(topics, null, ['closeout']), 'closeout');
  assert.equal(knowledgeSelectedTopic(topics, null, ['task', 'closeout']), null);
  assert.equal(knowledgeSelectedTopic(topics, 'missing', ['unknown']), null);
  assert.equal(knowledgeSelectedTopic(topics), null);
});

test('同主题的三类阅读共享原成果身份，术语与说明归入同类', () => {
  const artifacts = [
    { id: 'doc', kind: 'document', path: 'docs/topic.md' },
    { id: 'diagram', kind: 'diagram', path: 'diagrams/topic.html' },
    { id: 'map', kind: 'code-map', path: 'maps/topic.md' },
    { id: 'terms', kind: 'terms', path: 'docs/glossary.md' },
  ];
  for (const [category, position] of [['documents', 0], ['diagrams', 1], ['maps', 2]]) {
    const selected = knowledgeTopicArtifacts(artifacts, category);
    assert.deepEqual(selected, category === 'documents' ? [artifacts[0], artifacts[3]] : [artifacts[position]]);
    assert.equal(selected[0], artifacts[position]);
  }
  assert.deepEqual(knowledgeTopicArtifacts([artifacts[1]], 'documents'), [], '只有图的主题不伪造说明');
  assert.equal(artifacts.length, 4);
});

test('只有术语成果的旧主题仍可从说明页阅读，不需要第四个分类', () => {
  const terms = { id: 'terms', kind: 'terms', content: '# 术语\n\n当前项目的概念。' };
  assert.deepEqual(knowledgeTopicArtifacts([terms], 'documents'), [terms]);
  assert.deepEqual(knowledgeTopicArtifacts([terms], 'diagrams'), []);
  assert.deepEqual(knowledgeTopicArtifacts([terms], 'maps'), []);
});
