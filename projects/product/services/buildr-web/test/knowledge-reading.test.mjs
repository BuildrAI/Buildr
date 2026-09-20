import assert from 'node:assert/strict';
import test from 'node:test';
import { completeKnowledgeArtifacts, completeKnowledgeSource } from '../src/features/knowledge/knowledge-reading.ts';

const article = { id: 'article', path: 'knowledge/docs/topic.md', title: '说明', kind: 'document', content: '![技术图](../archify/diagram.html)\n![代码地图](../code-map/map.md)', objects: [], sources: [] };
const diagram = { id: 'diagram', path: 'knowledge/archify/diagram.html', title: '技术图', kind: 'diagram', content: null, objects: [], sources: [] };
const map = { id: 'map', path: 'knowledge/code-map/map.md', title: '代码地图', kind: 'code-map', content: '# 文件关系', objects: [], sources: [] };
const index = { artifacts: [article, diagram, map], objects: [], sources: [] };
const response = (artifacts, extra = {}) => ({ revision: 'current-index', index, observations: [], artifacts, ...extra });

test('单成果读取补齐登记的技术图和地图，并保留来源观察', async () => {
  const calls = [];
  const result = await completeKnowledgeArtifacts(response([article]), async id => {
    calls.push(id);
    return response([id === 'diagram' ? diagram : map], { observations: [{ id: `${id}-source`, status: 'aligned' }] });
  });
  assert.deepEqual(new Set(calls), new Set(['diagram', 'map']));
  assert.deepEqual(result.data.artifacts.map(item => item.id), ['article', 'diagram', 'map']);
  assert.deepEqual(result.data.observations.map(item => item.id), ['diagram-source', 'map-source']);
  assert.deepEqual(result.errors, []);
});

test('补读仅限文内登记成果，普通链接和范围外引用不触发读取', async () => {
  const content = '[来源](../../README.md)\n![未知](../archify/missing.html)\n![越界](../../../../secret.md)\n![外部](https://example.test/figure.svg)';
  const result = await completeKnowledgeArtifacts(response([{ ...article, content }]), async () => { assert.fail('不应读取任意引用路径'); });
  assert.equal(result.data.artifacts.length, 1);
  assert.equal(result.data.artifacts[0].content, content);
});

test('递归嵌入去重并终止循环，单项失败保留其他成果', async () => {
  const linkedMap = { ...map, content: '![同一说明](../docs/topic.md)\n![同一图](../archify/diagram.html)' };
  const calls = [];
  const result = await completeKnowledgeArtifacts(response([article]), async id => {
    calls.push(id);
    if (id === 'diagram') throw new Error('图示暂不可读');
    return response([linkedMap]);
  });
  assert.deepEqual(new Set(calls), new Set(['diagram', 'map']));
  assert.equal(calls.length, 2);
  assert.deepEqual(result.data.artifacts.map(item => item.id), ['article', 'map']);
  assert.match(result.errors[0], /技术图.*暂时无法读取/);
});

test('关联读取期间索引变化时保留已读内容并提示刷新，不混入其他版本', async () => {
  const result = await completeKnowledgeArtifacts(response([{ ...article, content: '![图](../archify/diagram.html)' }]), async () => response([diagram], { revision: 'new-index' }));
  assert.deepEqual(result.data.artifacts.map(item => item.id), ['article']);
  assert.match(result.errors[0], /阅读关联已变化.*刷新/);
});

const projectScope = { kind: 'project', id: 'project-id', code: 'product', directory: '/workspace/projects/product', codeRoot: '/workspace/projects/product' };
const sourceMeta = { id: 'file-explanation', title: '正文来源', kind: 'code', path: article.path };
const sourceBody = { id: sourceMeta.id, kind: 'code', path: article.path, content: article.content, digest: 'source-body', diagnostic: null, status: 'unreviewed', location: { kind: 'project', id: 'project-id', root: projectScope.directory } };
const sourceResponse = (extra = {}) => response([], { scope: projectScope, index: { ...index, sources: [sourceMeta] }, observations: [sourceBody], ...extra });

test('sources响应没有成果仍从真实Markdown正文补读，元数据观察不覆盖已读原文', async () => {
  const calls = [];
  const result = await completeKnowledgeSource(sourceResponse(), sourceMeta.id,
    async () => assert.fail('同范围来源无需重读索引'),
    async (scope, id) => {
      calls.push([scope, id]);
      return response([id === 'diagram' ? diagram : map], { observations: [{ ...sourceBody, content: null }] });
    });
  assert.deepEqual(calls.map(([, id]) => id), ['diagram', 'map']);
  assert.ok(calls.every(([scope]) => scope.kind === 'project' && scope.id === projectScope.id));
  assert.equal(result.reading.artifact.content, article.content);
  assert.equal(result.reading.data.observations[0].content, article.content);
  assert.deepEqual(result.reading.data.artifacts.map(item => item.id), ['diagram', 'map']);
});

test('项目引用服务Markdown源时使用观察到的服务范围，不混用同路径项目成果', async () => {
  const serviceScope = { kind: 'service', id: 'service-id', code: 'api', directory: '/workspace/services/api', codeRoot: '/workspace/repositories/api' };
  const serviceDiagram = { ...diagram, id: 'service-diagram' };
  const source = { ...sourceBody, content: '![服务图](../archify/diagram.html)', location: { kind: 'service', id: serviceScope.id, root: serviceScope.directory } };
  const calls = [];
  const result = await completeKnowledgeSource(sourceResponse({ observations: [source] }), sourceMeta.id,
    async scope => { calls.push(['scope', scope]); return response([], { scope: serviceScope, index: { ...index, artifacts: [serviceDiagram] }, revision: 'service-revision' }); },
    async (scope, id) => { calls.push(['artifact', scope, id]); return response([serviceDiagram], { revision: 'service-revision' }); });
  assert.deepEqual(calls, [['scope', { kind: 'service', id: 'service-id' }], ['artifact', { kind: 'service', id: 'service-id' }, 'service-diagram']]);
  assert.deepEqual(result.reading.scope, { kind: 'service', id: 'service-id' });
  assert.deepEqual(result.reading.data.artifacts.map(item => item.id), ['service-diagram']);
});

test('服务代码根与知识目录分离时，不把代码相对链接误认成治理目录成果', async () => {
  const scope = { kind: 'service', id: 'service-id', code: 'api', directory: '/workspace/services/api', codeRoot: '/workspace/repositories/api' };
  const localCode = { id: 'code-guide', title: '实现指引', kind: 'code', path: 'guides/reference.md', link: 'an-alias/reference.md' };
  const wrongRoot = { id: 'governance-guide', title: '同路径治理说明', kind: 'evidence', path: localCode.path };
  const wrongScope = { id: 'other-service', title: '同路径其他服务', kind: 'code', path: localCode.path, scope: { kind: 'service', id: 'another' } };
  const source = { ...sourceBody, path: 'README.md', content: '[说明](guides/reference.md)\n![图](knowledge/archify/diagram.html)', location: { kind: 'service', id: scope.id, root: scope.codeRoot } };
  const result = await completeKnowledgeSource(sourceResponse({ scope, index: { ...index, sources: [sourceMeta, localCode, wrongRoot, wrongScope] }, observations: [source] }), sourceMeta.id,
    async () => assert.fail('同范围不应换索引'), async () => assert.fail('不得读取另一根目录中的同路径图'));
  assert.equal(result.reading.data.index.artifacts.length, 0);
  assert.deepEqual(result.reading.data.index.sources.map(item => item.id), [sourceMeta.id, 'code-guide']);
  assert.equal(result.reading.data.index.sources.find(item => item.id === 'code-guide').link, localCode.path);
});

test('技能具体参考文件保留真实正文，只解析同一技能内已登记路径', async () => {
  const guide = { id: 'architecture-guide', title: '建设指引', kind: 'skill', skillId: 'knowledge', path: 'references/architecture.md', link: 'services/buildr/skills/knowledge/references/architecture.md' };
  const sibling = { ...guide, id: 'guide-next', path: 'references/next.md' };
  const unrelated = { ...sibling, id: 'other-skill', skillId: 'other' };
  const content = '# 具体建设指引\n\n[下一份参考](next.md)';
  const result = await completeKnowledgeSource(sourceResponse({ index: { ...index, sources: [guide, sibling, unrelated] }, observations: [{ ...sourceBody, id: guide.id, kind: 'skill', path: guide.path, content, location: undefined, skill: { id: 'knowledge', enabled: true, sourcePath: 'skills/knowledge' } }] }), guide.id,
    async () => assert.fail('技能参考不借用项目根目录'), async () => assert.fail('不应读取项目成果'));
  assert.equal(result.reading.artifact.path, 'references/architecture.md');
  assert.equal(result.reading.artifact.content, content);
  assert.deepEqual(result.reading.data.index.sources.map(item => [item.id, item.link]), [['architecture-guide', guide.path], ['guide-next', sibling.path]]);
});

test('普通代码仍只读，未知观察位置不借父级索引解释相对路径', async () => {
  const unavailable = async () => assert.fail('不得补读未证明的范围');
  const code = await completeKnowledgeSource(sourceResponse({ observations: [{ ...sourceBody, path: 'src/main.ts', content: 'const example = "![图](../diagram.html)";' }] }), sourceMeta.id, unavailable, unavailable);
  assert.equal(code.reading, null);
  const outside = await completeKnowledgeSource(sourceResponse({ observations: [{ ...sourceBody, location: { ...sourceBody.location, root: '/another/root' } }] }), sourceMeta.id, unavailable, unavailable);
  assert.equal(outside.reading, null);
  assert.match(outside.errors[0], /不在当前已登记阅读范围/);
});
