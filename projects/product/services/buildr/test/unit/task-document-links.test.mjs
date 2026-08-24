import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTaskDocumentReference } from '../../../buildr-web/src/lib/taskDocumentLinks.ts';

const projects = [
  { code: 'product', name: 'Buildr Product', source: { path: 'projects/product' } },
  { code: 'nested', name: 'Nested Product', source: { path: 'projects/product/nested' } },
  { code: 'root', name: 'Workspace Root', source: { path: '.' } },
  { code: 'other', name: 'Other Project', source: { path: 'projects/other' } },
];

test('Task 文档引用使用已登记 Project source.path 解析 Workspace 相对路径', () => {
  assert.deepEqual(
    resolveTaskDocumentReference(
      'projects/product/docs/architecture/service-architecture.md',
      { projects: ['product'], services: [] },
      projects,
    ),
    {
      projectCode: 'product',
      projectName: 'Buildr Product',
      projectSourcePath: 'projects/product',
      documentPath: 'docs/architecture/service-architecture.md',
      workspacePath: 'projects/product/docs/architecture/service-architecture.md',
      resolution: 'resolved',
    },
  );
});

test('Service scope 也授权其所属 Project，且选择最长登记路径', () => {
  const reference = resolveTaskDocumentReference(
    'projects/product/nested/docs/guide.md',
    { projects: [], services: [{ project: 'product', service: 'buildr' }, { project: 'nested', service: 'web' }] },
    projects,
  );
  assert.equal(reference?.projectCode, 'nested');
  assert.equal(reference?.documentPath, 'docs/guide.md');
});

test('Workspace 根 Project 可以打开任务范围内的 Markdown 文档', () => {
  const reference = resolveTaskDocumentReference(
    'README.md',
    { projects: ['root'], services: [] },
    projects,
  );
  assert.equal(reference?.projectCode, 'root');
  assert.equal(reference?.documentPath, 'README.md');
});

test('Task 文档引用拒绝越界、非 Markdown 和未授权 Project', () => {
  const scope = { projects: ['product'], services: [] };
  for (const href of [
    '../secret.md',
    'projects/product/../other/secret.md',
    'projects/product/%2e%2e/other/secret.md',
    '/projects/product/docs/guide.md',
    'file:///projects/product/docs/guide.md',
    'projects/product/docs/guide.txt',
    'projects/other/docs/guide.md',
  ]) {
    assert.equal(resolveTaskDocumentReference(href, scope, projects), null, href);
  }
});
