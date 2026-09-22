import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationState } from '../src/app/navigation.ts';

test('daily overview and task deep links stay within the workbench', () => {
  for (const path of ['overview', 'activity', 'tasks/id/changes/product/change']) {
    assert.equal(navigationState(`/workspaces/w/${path}`, '', 'w').area, 'workbench');
  }
});
test('articles belong to workspace and the default route is overview', () => {
  assert.equal(navigationState('/workspaces/w/articles/article', '', 'w').area, 'workspace');
  assert.equal(navigationState('/workspaces/w/', '', 'w').resource, 'overview');
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
