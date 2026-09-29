import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeDocumentSections, linkedKnowledgeDocument } from '../src/features/knowledge/knowledge-documents.ts';

const documents = [
  { id: 'readme', title: '项目入口', path: 'README.md', location: 'scope', group: '当前项目', artifactId: null, sectionId: 'start', summary: '认识产品定位', supplementary: false },
  { id: 'guide', title: '使用指南', path: 'knowledge/docs/guide.md', location: 'scope', group: '当前项目', artifactId: null, sectionId: 'start', summary: '安装并开始工作', supplementary: false },
  { id: 'system', title: '系统组成', path: 'knowledge/docs/system.md', location: 'scope', group: '当前项目', artifactId: 'system', sectionId: 'system', summary: '了解模块协作', supplementary: false },
  { id: 'service', title: '服务入口', path: 'README.md', location: 'service:api:code', group: '服务 API', artifactId: null, sectionId: 'system', summary: '实现目录定位', supplementary: true },
  { id: 'workspace', title: '工作空间入口', path: 'README.md', location: 'workspace', group: '工作空间', artifactId: null, sectionId: 'unorganized', summary: '', supplementary: false },
];
const sections = [
  { id: 'start', title: '了解与上手', summary: '从这里开始使用产品', count: 2 },
  { id: 'system', title: '系统与数据', summary: '理解架构', count: 2 },
  { id: 'unorganized', title: '其他文档', summary: '尚未编排', count: 1 },
];

test('读者章节保留编排顺序并区分主读与补充，未编排文件仍可见', () => {
  const groups = knowledgeDocumentSections(documents, sections);
  assert.deepEqual(groups.map(section => section.id), ['start', 'system', 'unorganized']);
  assert.equal(groups.reduce((sum, section) => sum + section.count, 0), 5);
  assert.deepEqual(groups[0].documents.map(document => document.id), ['readme', 'guide']);
  assert.deepEqual(groups[1].documents.map(document => document.id), ['system']);
  assert.deepEqual(groups[1].supplementary.map(document => document.id), ['service']);
  const fallback = knowledgeDocumentSections(documents, []);
  assert.equal(fallback[0].id, 'unorganized');
  assert.equal(fallback[0].count, 5);
});

test('搜索覆盖章节、标题、简介、补充材料与兼容路径，结果保留阅读顺序', () => {
  assert.deepEqual(knowledgeDocumentSections(documents, sections, '上手')[0].documents.map(document => document.id), ['readme', 'guide']);
  assert.deepEqual(knowledgeDocumentSections(documents, sections, '架构')[0].supplementary.map(document => document.id), ['service']);
  assert.equal(knowledgeDocumentSections(documents, sections, '安装')[0].documents[0].id, 'guide');
  const supplemental = knowledgeDocumentSections(documents, sections, '实现目录');
  assert.equal(supplemental[0].count, 1);
  assert.equal(supplemental[0].documents.length, 0);
  assert.equal(supplemental[0].supplementary[0].id, 'service');
  assert.equal(knowledgeDocumentSections(documents, sections, 'knowledge/DOCS').reduce((sum, section) => sum + section.count, 0), 2);
  assert.deepEqual(knowledgeDocumentSections(documents, sections, '不存在'), []);
});

test('相对链接只匹配同一位置的已发现文件，保留已有成果身份', () => {
  assert.equal(linkedKnowledgeDocument(documents, documents[1], '../../README.md'), documents[0]);
  assert.equal(linkedKnowledgeDocument(documents, documents[1], './system.md#结构').artifactId, 'system');
  assert.equal(linkedKnowledgeDocument(documents, documents[3], 'README.md'), documents[3]);
  for (const href of ['../../../README.md', '/README.md', 'file:///README.md', 'https://example.com', '..\\README.md', '%2fREADME.md', 'missing.md']) {
    assert.equal(linkedKnowledgeDocument(documents, documents[1], href), undefined, href);
  }
});

test('工作空间入口能链接已发现的项目文档，仍不开放任意文件读取', () => {
  const shared = { ...documents[4], path: 'docs/README.md', workspacePath: 'docs/README.md' };
  const guide = { ...documents[1], workspacePath: 'projects/product/knowledge/docs/guide.md' };
  const scopeReadme = { ...documents[0], workspacePath: 'projects/product/README.md' };
  const known = [shared, guide, scopeReadme];
  assert.equal(linkedKnowledgeDocument(known, shared, '../projects/product/knowledge/docs/guide.md'), guide);
  assert.equal(linkedKnowledgeDocument(known, guide, '../../../../docs/README.md'), shared);
  assert.equal(linkedKnowledgeDocument(known, guide, '../../README.md'), scopeReadme);
  assert.equal(linkedKnowledgeDocument(known, shared, '../projects/other/private.md'), undefined);
  assert.equal(linkedKnowledgeDocument(known, shared, '../../outside.md'), undefined);
  assert.equal(linkedKnowledgeDocument(known, { ...shared, workspacePath: null }, '../projects/product/knowledge/docs/guide.md'), undefined);
});
