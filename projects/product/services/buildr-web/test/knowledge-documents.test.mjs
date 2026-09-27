import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeDocumentTree, linkedKnowledgeDocument } from '../src/features/knowledge/knowledge-documents.ts';

const documents = [
  { id: 'readme', title: '项目入口', path: 'README.md', location: 'scope', group: '当前项目', artifactId: null },
  { id: 'guide', title: '使用指南', path: 'knowledge/docs/guide.md', location: 'scope', group: '当前项目', artifactId: null },
  { id: 'system', title: '系统组成', path: 'knowledge/docs/system.md', location: 'scope', group: '当前项目', artifactId: 'system' },
  { id: 'service', title: '服务入口', path: 'README.md', location: 'service:api:code', group: '服务 API', artifactId: null },
  { id: 'workspace', title: '工作空间入口', path: 'README.md', location: 'workspace', group: '工作空间', artifactId: null },
];

test('目录按真实位置区分同名文件，子目录计数与匹配文件一致', () => {
  const tree = knowledgeDocumentTree(documents);
  assert.equal(tree[0].key, 'scope', '当前项目在前，公共说明随后；保留已解析范围的顺序');
  assert.equal(tree.reduce((sum, node) => sum + node.count, 0), 5);
  const project = tree.find(node => node.key === 'scope');
  assert.equal(project.count, 3);
  assert.equal(project.children.find(node => node.title === 'knowledge').count, 2);
  const filtered = knowledgeDocumentTree(documents, '使用指南');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].count, 1);
  assert.equal(knowledgeDocumentTree(documents, 'knowledge/DOCS').reduce((sum, node) => sum + node.count, 0), 2);
  assert.deepEqual(knowledgeDocumentTree(documents, '不存在'), []);
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
