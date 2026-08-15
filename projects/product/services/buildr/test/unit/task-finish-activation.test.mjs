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

test('self-bootstrap Skill与Component精确源路径由通用Finish render-runtime处理', () => {
  const changedPaths = [
    'skills/buildr-self-bootstrap-sync/SKILL.md',
    'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs',
    'components/workspace/buildr-self-bootstrap/component.yml',
    'components/workspace/buildr-self-bootstrap/contributions/task-finish-post-finish.md',
  ];
  const plan = planRetainedTaskFinishActivation({ agent: 'codex', changedPaths });

  assert.equal(plan.mode, 'render-runtime');
  assert.deepEqual(plan.matchedPaths, [...changedPaths].sort());
  assert.equal(plan.gitEffect, 'forbidden');
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
