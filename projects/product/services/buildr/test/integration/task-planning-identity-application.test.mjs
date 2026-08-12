import assert from 'node:assert/strict';
import test from 'node:test';

import { registerTaskPlanningIdentityApplication } from '../../src/application/task-planning-identity/task-planning-identity-application.mjs';

const proposal = '# Demo\n\n## Why\n\nWhy.\n\n## What Changes\n\nChange.\n\n## Capabilities\n\nCapability.\n\n## Impact\n\nImpact.\n';
const design = '# Design\n\n## Context\n\nContext.\n\n## Goals / Non-Goals\n\nGoals.\n\n## Decisions\n\nDecision.\n\n## Risks / Trade-offs\n\nRisk.\n';
const tasks = '## Work\n\n- [ ] Deliver.\n';
const spec = '## ADDED Requirements\n\n### Requirement: Demo\nDemo MUST work.\n\n#### Scenario: Works\n- **WHEN** used\n- **THEN** it works\n';

function resolvedChange(reference, lifecycle = 'active') {
  return {
    availability: 'available',
    reference,
    workingCopy: {
      provenance: lifecycle === 'active' ? 'task-environment-candidate' : 'retained-archive',
      root: lifecycle === 'active' ? '/candidate/product' : '/retained/product',
      change: {
        code: reference.change,
        lifecycle,
        project: { code: reference.project },
        updatedAt: lifecycle === 'active' ? '2026-08-11T00:00:00.000Z' : '2026-08-12T00:00:00.000Z',
        progress: lifecycle === 'active' ? { completed: 0, total: 1 } : { completed: 1, total: 1 },
        artifacts: {
          proposal: { exists: true, path: `${lifecycle}/proposal.md`, content: proposal },
          design: { exists: true, path: `${lifecycle}/design.md`, content: design },
          tasks: { exists: true, path: `${lifecycle}/tasks.md`, content: lifecycle === 'active' ? tasks : tasks.replace('[ ]', '[x]') },
          specs: [{ exists: true, capability: 'demo', path: `${lifecycle}/specs/demo/spec.md`, content: spec }],
        },
      },
    },
  };
}

function fixture(references = [{ project: 'product', change: 'demo' }]) {
  let lifecycle = 'active';
  let resolutions = 0;
  let writes = 0;
  const runtime = {
    inspectTaskRecord: () => ({ record: { taskId: 'demo-task', intent: 'Resolve planning identity.', scope: { projects: ['product'], services: [] }, changes: references } }),
    resolveTaskScopedChange: (_root, taskId, reference, options) => {
      assert.equal(taskId, 'demo-task');
      assert.deepEqual(options, { includeContent: true });
      resolutions += 1;
      return resolvedChange(reference, lifecycle);
    },
    writeTaskRecordPersistence: () => { writes += 1; },
  };
  registerTaskPlanningIdentityApplication(runtime);
  return { runtime, archive: () => { lifecycle = 'archived'; }, counts: () => ({ resolutions, writes }) };
}

test('Application聚合全部Change且active/archive、path、time、progress和checkbox变化不改变target', () => {
  const current = fixture([{ project: 'product', change: 'zeta' }, { project: 'product', change: 'alpha' }]);
  const active = current.runtime.inspectTaskPlanningIdentity('/workspace', 'demo-task');
  current.archive();
  const archived = current.runtime.inspectTaskPlanningIdentity('/workspace', 'demo-task');
  assert.equal(active.status, 'resolved');
  assert.equal(archived.target.identity, active.target.identity);
  assert.equal(active.semanticProjection.changeCount, 2);
  assert.deepEqual(active.effects, []);
  assert.deepEqual(current.counts(), { resolutions: 4, writes: 0 });
});

test('Application对unavailable或missing artifact返回空target与唯一next action', () => {
  const unavailable = fixture();
  unavailable.runtime.resolveTaskScopedChange = (_root, _taskId, reference) => ({ availability: 'unavailable', reference, diagnostic: { code: 'task_change_unavailable' } });
  const blocked = unavailable.runtime.inspectTaskPlanningIdentity('/workspace', 'demo-task');
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.target, null);
  assert.equal(blocked.semanticProjection, null);
  assert.deepEqual(blocked.planningNodes, []);
  assert.equal(blocked.nextActions.length, 1);

  const missing = fixture();
  missing.runtime.resolveTaskScopedChange = (_root, _taskId, reference) => {
    const resolution = resolvedChange(reference);
    resolution.workingCopy.change.artifacts.design.exists = false;
    delete resolution.workingCopy.change.artifacts.design.content;
    return resolution;
  };
  assert.equal(missing.runtime.inspectTaskPlanningIdentity('/workspace', 'demo-task').diagnostic.code, 'task_planning_identity_artifact_missing');

  const retainedActive = fixture();
  retainedActive.runtime.resolveTaskScopedChange = (_root, _taskId, reference) => {
    const resolution = resolvedChange(reference);
    resolution.workingCopy.provenance = 'retained-active';
    return resolution;
  };
  assert.equal(retainedActive.runtime.inspectTaskPlanningIdentity('/workspace', 'demo-task').diagnostic.code, 'task_planning_identity_change_authority_unavailable');
});
