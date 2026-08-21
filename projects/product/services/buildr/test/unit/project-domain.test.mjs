import assert from 'node:assert/strict';
import test from 'node:test';

import { createProject, createProjectSource, isProjectCode, isProjectId } from '../../src/workspace/domain/project.mjs';

const PROJECT_ID = 'd15bde2c-9aab-4ed8-bf43-28a5372ca407';
const WORKSPACE_ID = 'f2f40b71-2382-5906-82bd-76a7927b59f3';

test('Project Domain 使用 UUID、workspaceId、code 与 workspace source', () => {
  const project = createProject({
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    code: 'product',
    name: ' Buildr 产品 ',
    description: ' 产品实现 ',
    source: { type: 'workspace', path: 'projects/product' },
  });
  assert.deepEqual(project, {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    code: 'product',
    name: 'Buildr 产品',
    description: '产品实现',
    source: { type: 'workspace', path: 'projects/product' },
  });
  assert.equal(isProjectId(project.id), true);
  assert.equal(isProjectCode(project.code), true);
  assert.throws(() => createProject({ ...project, id: 'project' }), /id must be a UUID/);
  assert.throws(() => createProject({ ...project, workspaceId: 'workspace' }), /workspaceId must be a UUID/);
  assert.throws(() => createProject({ ...project, code: '../product' }), /code must contain/);
  assert.throws(() => createProject({ ...project, source: { type: 'workspace', path: '/tmp/product' } }), /must be projects\/product/);
});

test('ProjectSource Git 值对象要求稳定声明且禁止 workspace Git 字段', () => {
  assert.deepEqual(createProjectSource({
    type: 'git',
    path: 'projects/demo',
    git: { url: 'https://example.com/demo.git', remote: 'origin', integrationBranch: 'dev' },
  }, 'demo'), {
    type: 'git',
    path: 'projects/demo',
    git: { url: 'https://example.com/demo.git', remote: 'origin', integrationBranch: 'dev' },
  });
  assert.throws(() => createProjectSource({ type: 'git', path: 'projects/demo', git: { url: '', remote: 'origin', integrationBranch: 'dev' } }, 'demo'), /git.url/);
  assert.throws(() => createProjectSource({ type: 'workspace', path: 'projects/demo', git: {} }, 'demo'), /only supported/);
});
