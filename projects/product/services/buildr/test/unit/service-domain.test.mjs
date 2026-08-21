import assert from 'node:assert/strict';
import test from 'node:test';

import { createService, createServiceSource } from '../../src/workspace/domain/service.mjs';

const ID = 'bc098bd6-08a2-4e8b-883c-3ef5b188a86d';
const WORKSPACE_ID = 'f2f40b71-2382-5906-82bd-76a7927b59f3';
const PROJECT_ID = 'd15bde2c-9aab-4ed8-bf43-28a5372ca407';

test('Service Domain 保存父 UUID、业务字段和文件系统定位', () => {
  const service = createService({ id: ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product', code: 'api', name: ' API ', description: ' 服务 ', type: 'backend', source: { type: 'workspace', path: 'projects/product/services/api' } });
  assert.equal(service.name, 'API');
  assert.equal(service.projectId, PROJECT_ID);
  assert.equal(service.source.path, 'projects/product/services/api');
  assert.throws(() => createService({ ...service, projectCode: 'product', projectId: 'project' }), /projectId must be a UUID/);
  assert.throws(() => createService({ ...service, projectCode: 'product', code: '../api' }), /code must contain/);
});

test('ServiceSource Git 值对象保存稳定声明而非观察态', () => {
  assert.deepEqual(createServiceSource({ type: 'git', path: 'projects/product/services/api', git: { url: 'https://example.com/api.git', remote: 'origin', integrationBranch: 'dev' } }, 'product', 'api'), { type: 'git', path: 'projects/product/services/api', git: { url: 'https://example.com/api.git', remote: 'origin', integrationBranch: 'dev' } });
  assert.throws(() => createServiceSource({ type: 'workspace', path: 'services/api' }, 'product', 'api'), /must be projects\/product\/services\/api/);
});
