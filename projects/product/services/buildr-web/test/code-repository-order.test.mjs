import assert from 'node:assert/strict';
import test from 'node:test';
import { codeRepositoryIsWorkspace, orderCodeRepositories } from '../src/features/code/code-repository-order.ts';

const repository = (code, location, name = code) => ({id: code, code, name, location});

test('工作空间根仓库按真实登记目录识别，兼容分隔符与大小写平台差异', () => {
  assert.equal(codeRepositoryIsWorkspace(repository('workspace', '/work/jixian'), '/work/jixian/'), true);
  assert.equal(codeRepositoryIsWorkspace(repository('workspace', 'C:\\Work\\Jixian\\'), 'c:\\work\\jixian'), true);
  assert.equal(codeRepositoryIsWorkspace(repository('workspace', '\\\\Server\\Share\\Jixian'), '//server/share/jixian'), true);
  assert.equal(codeRepositoryIsWorkspace(repository('other', '/work/jixian-service'), '/work/jixian'), false);
  assert.equal(codeRepositoryIsWorkspace(repository('unknown', ''), '/work/jixian'), false);
  assert.equal(codeRepositoryIsWorkspace(repository('unknown', '/work/jixian')), false);
});

test('资源管理器先列出工作空间根仓库，其余按编码排序且不修改输入', () => {
  const repositories = [
    repository('web', '/work/web', 'Web 前端'),
    repository('workspace', '/work/jixian', '集鲜工作空间'),
    repository('api', '/work/api', 'API 服务'),
    repository('fe-10', '/work/fe-10'),
    repository('fe-2', '/work/fe-2'),
  ];
  const before = structuredClone(repositories);
  assert.deepEqual(orderCodeRepositories(repositories, '/work/jixian').map(item => item.code),
    ['workspace', 'api', 'fe-2', 'fe-10', 'web']);
  assert.deepEqual(repositories, before);
});

test('源代码管理把有改动仓库放在工作空间之后、其余代码库之前', () => {
  const repositories = [
    repository('zeta', '/work/zeta'),
    repository('workspace', '/work/jixian'),
    repository('beta', '/work/beta'),
    repository('alpha', '/work/alpha'),
  ];
  const changed = new Set(['zeta', 'alpha']);
  assert.deepEqual(orderCodeRepositories(repositories, '/work/jixian', item => changed.has(item.code)).map(item => item.code),
    ['workspace', 'alpha', 'zeta', 'beta']);
  changed.add('workspace');
  assert.equal(orderCodeRepositories(repositories, '/work/jixian', item => changed.has(item.code))[0].code, 'workspace');
});
