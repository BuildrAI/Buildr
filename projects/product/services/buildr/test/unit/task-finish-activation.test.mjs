import assert from 'node:assert/strict';
import test from 'node:test';

import { planRetainedTaskFinishActivation } from '../../src/application/task-finish/task-finish-activation.mjs';

test('Workspace root runtime sources select render-runtime', () => {
  const plan = planRetainedTaskFinishActivation({
    agent: 'codex',
    changedPaths: ['skills/example/SKILL.md', 'rules/example.md', 'projects/product/services/buildr/package/manifest.yml'],
  });
  assert.equal(plan.mode, 'render-runtime');
  assert.deepEqual(plan.matchedPaths, ['rules/example.md', 'skills/example/SKILL.md']);
  assert.equal(plan.gitEffect, 'forbidden');
  assert.match(plan.identity, /^sha256-/);
});

test('Project and ordinary code changes select none regardless of Task scope', () => {
  const plan = planRetainedTaskFinishActivation({
    workspaceRoot: '/ignored',
    agent: 'codex',
    task: { scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }] } },
    changedPaths: [
      'projects/product/task-finish.yml',
      'projects/product/services/buildr/package/manifest.yml',
      'projects/product/services/buildr/package/targets/workspace/skills/buildr/task-finish/SKILL.md',
    ],
  });
  assert.equal(plan.mode, 'none');
  assert.deepEqual(plan.matchedPaths, []);
  assert.equal(JSON.stringify(plan).includes('sync-workspace'), false);
});
