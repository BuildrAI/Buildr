import assert from 'node:assert/strict';
import test from 'node:test';
import { assetEditDraft } from '../src/features/workspace/components/asset-edit-draft.ts';

test('recovery reads the exact catalog identity and complete editable service/source fields', () => {
  const catalog = { projects: [{ id: 'p1', code: 'demo', name: '项目', description: '目标', serviceIds: ['s1'] }], services: [{ id: 's1', code: 'api', name: '服务', description: '职责', repositoryId: 'r1', modulePath: 'src' }], repositories: [{ id: 'r1', code: 'repo', name: '代码库', description: '来源', source: { path: '/repo', integrationBranch: 'dev', git: { url: 'https://example.com/repo.git', remote: 'upstream' } } }] };
  assert.equal(assetEditDraft(catalog, 'project', 'p1').name, '项目');
  assert.equal(assetEditDraft(catalog, 'project', 'p1').code, 'demo');
  assert.deepEqual(assetEditDraft(catalog, 'project', 'p1').serviceIds, ['s1']);
  assert.equal(assetEditDraft(catalog, 'service', 's1').repositoryId, 'r1');
  assert.equal(assetEditDraft(catalog, 'service', 's1').modulePath, 'src');
  assert.equal(assetEditDraft(catalog, 'service', 's1').code, 'api');
  assert.deepEqual(assetEditDraft(catalog, 'service', 's1').projectIds, ['p1']);
  const repository = assetEditDraft(catalog, 'repository', 'r1');
  assert.deepEqual([repository.path, repository.url, repository.remote, repository.integrationBranch], ['/repo', 'https://example.com/repo.git', 'upstream', 'dev']);
  assert.deepEqual(repository.serviceIds, ['s1']);
  assert.equal(assetEditDraft(catalog, 'project', 's1'), null);
  assert.equal(assetEditDraft(catalog, 'repository', 'removed'), null);
});

test('service edit draft reads every linked project', () => {
  const catalog = {
    projects: [
      { id: 'p1', code: 'demo', name: '项目一', description: '目标一', serviceIds: ['s1'] },
      { id: 'p2', code: 'shared', name: '项目二', description: '目标二', serviceIds: ['s1'] },
    ],
    services: [{ id: 's1', code: 'api', name: '服务', description: '职责', repositoryId: 'r1', modulePath: 'src' }],
    repositories: [{ id: 'r1', code: 'repo', name: '代码库', description: '来源', source: { path: '/repo' } }],
  };
  assert.deepEqual(assetEditDraft(catalog, 'service', 's1').projectIds, ['p1', 'p2']);
});
