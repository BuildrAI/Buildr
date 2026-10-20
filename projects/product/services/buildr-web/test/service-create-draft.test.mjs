import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceCreateDraft, serviceCreatePayload } from '../src/features/service/components/service-create-draft.ts';

const base = { name: ' 原奶小程序供应商端 ', code: 'fe-milk-supplier-miniprogram', description: '', type: 'service', directoryMode: 'create', projectCode: 'milk' };

test('repositoryId 已选：只携带 repositoryId + modulePath，剥离目录语义', () => {
  const payload = serviceCreatePayload({ ...base, repositoryId: 'repo-1', modulePath: '  ' }, { newRepository: false, repository: {} });
  assert.equal(payload.repositoryId, 'repo-1');
  assert.equal(payload.modulePath, '');
  assert.equal(payload.directoryMode, undefined);
  assert.equal(payload.directoryPath, undefined);
  assert.equal(payload.directoryObservation, undefined);
  assert.equal(payload.projectCode, undefined);
  assert.equal(payload.repository, undefined);
  assert.equal(payload.name, '原奶小程序供应商端');
});

test('repositoryId 已选：模块路径保留库内相对路径', () => {
  const payload = serviceCreatePayload({ ...base, repositoryId: 'repo-1', modulePath: ' packages/app ' }, { newRepository: false, repository: {} });
  assert.equal(payload.modulePath, 'packages/app');
});

test('内联新增代码库：携带 repository 草稿且不带 modulePath 与目录语义', () => {
  const repository = { code: 'fe-milk-supplier-miniprogram', url: 'git@example.com:x.git', integrationBranch: 'qa' };
  const payload = serviceCreatePayload({ ...base, repositoryId: 'stale', directoryPath: 'projects/milk/services/x', directoryObservation: 'obs' }, { newRepository: true, repository });
  assert.deepEqual(payload.repository, repository);
  assert.equal(payload.repositoryId, undefined);
  assert.equal(payload.modulePath, undefined);
  assert.equal(payload.directoryMode, undefined);
  assert.equal(payload.directoryPath, undefined);
  assert.equal(payload.directoryObservation, undefined);
  assert.equal(payload.projectCode, undefined);
});

test('代码库留空：维持目录模式与项目语义', () => {
  const payload = serviceCreatePayload({ ...base, directoryMode: 'existing', directoryPath: 'projects/milk/services/x', directoryObservation: 'obs' }, { newRepository: false, repository: {}, projectCode: 'milk' });
  assert.equal(payload.directoryMode, 'existing');
  assert.equal(payload.directoryPath, 'projects/milk/services/x');
  assert.equal(payload.directoryObservation, 'obs');
  assert.equal(payload.projectCode, 'milk');
  assert.equal(payload.modulePath, undefined);
  assert.equal(payload.repository, undefined);
});

test('取消草稿：归一输入但保留隐藏区域选择', () => {
  const draft = serviceCreateDraft({ ...base, repositoryId: 'repo-1', modulePath: 'x', name: ' 服务 ' }, { newRepository: false, repository: {}, projectCode: 'milk' });
  assert.equal(draft.name, '服务');
  assert.equal(draft.repositoryId, 'repo-1');
  assert.equal(draft.directoryMode, 'create');
  assert.equal(draft.projectCode, 'milk');
});
