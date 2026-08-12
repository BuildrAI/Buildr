import assert from 'node:assert/strict';
import test from 'node:test';

import { compareServiceGit, registerServiceApplication } from '../../src/application/service/service-application.mjs';

const service = { source: { type: 'git', git: { url: 'https://example.com/api.git', remote: 'origin', integrationBranch: 'dev' } } };

test('Service Git comparison 将当前分支与 integration branch 分离', () => {
  const result = compareServiceGit(service, { available: true, repository: true, remoteUrl: 'https://example.com/api.git', currentBranch: 'tasks/x', dirty: true, ahead: 1, behind: 0 }, (a, b) => a === b);
  assert.equal(result.status, 'drift');
  assert.deepEqual(result.findings.map((item) => item.code), ['service.git_branch_drift', 'service.git_dirty', 'service.git_upstream_drift']);
});

test('Service metadata update 使用白名单和 revision', () => {
  const writes = [];
  let entity = { id: 'bc098bd6-08a2-4e8b-883c-3ef5b188a86d', workspaceId: 'f2f40b71-2382-5906-82bd-76a7927b59f3', projectId: 'd15bde2c-9aab-4ed8-bf43-28a5372ca407', code: 'api', name: 'API', description: '接口', type: 'backend', source: { type: 'workspace', path: 'projects/product/services/api' } };
  const runtime = {
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, workspace: { workspace: { id: entity.workspaceId } }, projects: { product: { id: entity.projectId, code: 'product' } } }),
    readServiceRegistryPersistence: () => ({ root: '/tmp/ws', manifestPath: '/tmp/ws/projects/product/services/manifest.yml', revision: 'r1', registry: { schemaVersion: 'buildr.services/v2', migrationRequired: false, entities: { api: entity } } }),
    serviceDomainManifestPath: () => '/tmp/ws/projects/product/services/manifest.yml',
    withWorkspaceMutation: (_root, _name, _paths, work) => work(),
    writeServiceRegistry: (_file, _projectId, services) => { writes.push(services); entity = services.api; },
    observeProjectGit: () => null,
    sameGitIdentity: (a, b) => a === b,
  };
  registerServiceApplication(runtime);
  const result = runtime.updateServiceMetadata('/tmp/ws', 'product', 'api', { revision: 'r1', name: 'Public API' });
  assert.equal(result.service.name, 'Public API');
  assert.equal(writes.length, 1);
  assert.throws(() => runtime.updateServiceMetadata('/tmp/ws', 'product', 'api', { revision: 'r1', code: 'other' }), /不可修改/);
});
