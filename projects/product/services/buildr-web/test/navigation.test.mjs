import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationState } from '../src/app/navigation.ts';

test('task change and article deep links stay within the workbench', () => {
  for (const path of ['tasks/id/changes/product/change', 'articles/article']) {
    assert.equal(navigationState(`/workspaces/w/${path}`, '', 'w').area, 'workbench');
  }
});
test('service edit deep links and service filters resolve their project', () => {
  assert.deepEqual(navigationState('/workspaces/w/services/a%20b/api/edit', '', 'w'), {
    area: 'workspace', resource: 'services', projectCode: 'a b', serviceCode: 'api',
  });
  assert.equal(navigationState('/workspaces/w/services', '?project=demo', 'w').projectCode, 'demo');
  assert.equal(navigationState('/workspaces/w/skills', '', 'w').projectCode, null);
});
test('a different workspace path never retains a previous selected project', () => {
  assert.equal(navigationState('/workspaces/old/projects/demo', '', 'new').projectCode, null);
});
