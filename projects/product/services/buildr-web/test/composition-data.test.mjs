import assert from 'node:assert/strict';
import test from 'node:test';
import { retainComposition, compositionWithReferences, matchesCompositionQuery } from '../src/features/workspace/components/composition-data.ts';
const complete = { projects: 'complete', services: 'complete', repositories: 'complete' };
const before = { projects: [{ id: 'p', code: 'p', name: '项目', serviceIds: ['s'] }], services: [{ id: 's', code: 's', name: '服务', repositoryId: 'r' }], repositories: [{ id: 'r', code: 'r', name: '代码库' }], sources: complete };
test('局部读取失败保留已知对象，成功重读后接受删除和更新', () => {
  const partial = { ...before, services: [], repositories: [], sources: { ...complete, services: 'partial', repositories: 'unavailable' } };
  const retained = retainComposition(before, partial);
  assert.equal(retained.services.length, 1);
  assert.equal(retained.repositories.length, 1);
  assert.equal(retained.sources.repositories, 'unavailable');
  const recovered = retainComposition(retained, { ...partial, sources: complete });
  assert.equal(recovered.services.length, 0);
  assert.equal(recovered.repositories.length, 0);
  assert.deepEqual(before.sources, complete);
});
test('更新以稳定身份替换而不重复，多方引用目标只显示一次', () => {
  const next = { ...before, services: [{ ...before.services[0], name: '新名称' }], sources: { ...complete, services: 'partial' } };
  assert.deepEqual(retainComposition(before, next).services, next.services);
  const result = compositionWithReferences({ ...before, projects: [...before.projects, { id: 'q', code: 'q', name: '项目二', serviceIds: ['s'] }] });
  assert.equal(result.services.length, 1);
  assert.equal(result.repositories.length, 1);
});
test('引用对象不可读时保留禁用占位，不把未知关系当作空列表', () => {
  const services = compositionWithReferences({ ...before, services: [] }).services;
  assert.equal(services.length, 1);
  assert.equal(services[0].id, 's');
  assert.equal(services[0].unavailable, true);
  const repositories = compositionWithReferences({ ...before, repositories: [] }).repositories;
  assert.equal(repositories[0].id, 'r');
  assert.equal(repositories[0].unavailable, true);
});
test('组成搜索可按部分文字和多个不连续词匹配任一对象字段', () => {
  const project = { id: 'p', code: 'buildr-product', name: 'Buildr 产品', description: '工作空间治理' };
  const service = { id: 's', code: 'buildr-backend', name: 'Buildr 后端', description: '命令行与运行时' };
  const repository = { id: 'r', code: 'source-main', name: 'Buildr 源码库', description: 'Git 位置' };
  assert.equal(matchesCompositionQuery(project, '产品 治理'), true);
  assert.equal(matchesCompositionQuery(service, '  BACK 运行  '), true);
  assert.equal(matchesCompositionQuery(repository, '源码 Git'), true);
  assert.equal(matchesCompositionQuery(project, '后端'), false);
});
