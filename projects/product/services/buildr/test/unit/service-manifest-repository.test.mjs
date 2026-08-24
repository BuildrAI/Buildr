import assert from 'node:assert/strict';
import test from 'node:test';

import { SERVICES_SCHEMA_V1, SERVICES_SCHEMA_V2, parseServicesManifest, renderServicesDomainManifest, serviceManifestRevision } from '../../src/workspace/persistence/service-manifest-repository.mjs';

const ID = 'bc098bd6-08a2-4e8b-883c-3ef5b188a86d';
const WORKSPACE_ID = 'f2f40b71-2382-5906-82bd-76a7927b59f3';
const PROJECT_ID = 'd15bde2c-9aab-4ed8-bf43-28a5372ca407';

test('canonical Service manifest v2 round trip 使用封闭 schema', () => {
  const content = renderServicesDomainManifest(PROJECT_ID, { api: { id: ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product', code: 'api', name: 'API', description: '接口服务', type: 'backend', source: { type: 'git', path: 'projects/product/services/api', git: { url: 'https://example.com/api.git', remote: 'origin', integrationBranch: 'dev' } } } });
  const parsed = parseServicesManifest(content, { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product' });
  assert.equal(parsed.schemaVersion, SERVICES_SCHEMA_V2);
  assert.equal(parsed.entities.api.source.git.integrationBranch, 'dev');
  assert.match(serviceManifestRevision(content), /^sha256-[0-9a-f]{64}$/);
  assert.throws(() => parseServicesManifest(content.replace('type: backend', 'type: backend\n    status: active'), { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product' }), /status is not a supported/);
});

test('canonical Service manifest round trip保留Attached Root', () => {
  const content = renderServicesDomainManifest(PROJECT_ID, { api: { id: ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product', code: 'api', name: 'API', description: '接口服务', type: 'backend', source: { type: 'git', root: 'attached', path: '/repos/api', git: { url: 'https://example.com/api.git', remote: 'origin', integrationBranch: 'dev' } } } }, 'product');
  assert.match(content, /root: attached/);
  assert.equal(parseServicesManifest(content, { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product' }).entities.api.source.path, '/repos/api');
});

test('v1 Service manifest compatibility 优先迁移 branch intent', () => {
  const content = [`schemaVersion: ${SERVICES_SCHEMA_V1}`, 'project: product', 'services:', '  api:', '    title: API', '    description: 接口服务', '    type: backend', '    path: services/api', '    repo:', '      kind: git', '      url: https://example.com/api.git', '      remote: origin', '      defaultBranch: main', '      branch: dev', ''].join('\n');
  const parsed = parseServicesManifest(content, { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, projectCode: 'product' });
  assert.equal(parsed.migrationRequired, true);
  assert.equal(parsed.entities.api.id, null);
  assert.equal(parsed.entities.api.source.git.integrationBranch, 'dev');
  assert.equal(parsed.entities.api.source.path, 'projects/product/services/api');
});
