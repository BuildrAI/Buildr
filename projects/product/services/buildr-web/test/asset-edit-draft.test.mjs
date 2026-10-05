import assert from 'node:assert/strict';
import test from 'node:test';
import { assetEditDraft } from '../src/features/workspace/components/asset-edit-draft.ts';

test('recovery reads the exact catalog identity and complete editable service/source fields', () => {
  const catalog = { projects: [{ id: 'p1', name: '项目', description: '目标' }], services: [{ id: 's1', name: '服务', description: '职责', repositoryId: 'r1', modulePath: 'src' }], repositories: [{ id: 'r1', name: '代码库', description: '来源', source: { path: '/repo', integrationBranch: 'dev', git: { url: 'https://example.com/repo.git', remote: 'upstream' } } }] };
  assert.equal(assetEditDraft(catalog, 'project', 'p1').name, '项目');
  assert.equal(assetEditDraft(catalog, 'service', 's1').repositoryId, 'r1');
  assert.equal(assetEditDraft(catalog, 'service', 's1').modulePath, 'src');
  const repository = assetEditDraft(catalog, 'repository', 'r1');
  assert.deepEqual([repository.path, repository.url, repository.remote, repository.integrationBranch], ['/repo', 'https://example.com/repo.git', 'upstream', 'dev']);
  assert.equal(assetEditDraft(catalog, 'project', 's1'), null);
  assert.equal(assetEditDraft(catalog, 'repository', 'removed'), null);
});
