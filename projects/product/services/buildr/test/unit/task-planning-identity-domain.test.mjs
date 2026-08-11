import assert from 'node:assert/strict';
import test from 'node:test';

import { createTaskPlanningIdentity } from '../../src/domain/task-planning-identity/task-planning-identity.mjs';

const proposal = `# Demo

## Why

Need one stable target.

## What Changes

- Resolve planning semantics.

## Capabilities

- task-planning-identity

## Impact

- Internal workflow only.
`;

const design = `# Design

## Context

Review receives an opaque identity.

## Goals / Non-Goals

Keep one identity authority.

## Decisions

Use a closed projection.

## Risks / Trade-offs

Unknown structures block.
`;

const tasks = `## Work

- [ ] Implement resolver
- [x] Prove invariants
`;

const spec = `## ADDED Requirements

### Requirement: Resolver is deterministic
The resolver MUST preserve semantic identity.

#### Scenario: Equivalent input
- **WHEN** execution facts change
- **THEN** identity stays equal
`;

function input(overrides = {}) {
  return {
    task: {
      intent: 'Resolve current planning semantics.',
      scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }] },
      ...overrides.task,
    },
    changes: overrides.changes || [{ project: 'product', change: 'demo', proposal, design, tasks, specs: [{ capability: 'demo-capability', content: spec }] }],
  };
}

test('checkbox、换行、尾随空白和Change读取顺序不改变planning identity', () => {
  const first = createTaskPlanningIdentity(input({
    changes: [
      { project: 'product', change: 'zeta', proposal, design, tasks, specs: [{ capability: 'z-capability', content: spec }] },
      { project: 'product', change: 'alpha', proposal, design, tasks, specs: [{ capability: 'a-capability', content: spec }] },
    ],
  }));
  const noisyTasks = tasks.replaceAll('[ ]', '[x]').replaceAll('\n', '\r\n').replace('Implement resolver', 'Implement resolver   ');
  const second = createTaskPlanningIdentity(input({
    changes: [
      { project: 'product', change: 'alpha', proposal, design, tasks: noisyTasks, specs: [{ capability: 'a-capability', content: spec }] },
      { project: 'product', change: 'zeta', proposal, design, tasks: noisyTasks, specs: [{ capability: 'z-capability', content: spec }] },
    ],
  }));
  assert.equal(second.target.identity, first.target.identity);
  assert.deepEqual(second.planningNodes.map((node) => node.id), [...second.planningNodes.map((node) => node.id)].sort());
});

test('Task intent、spec、task text、decision与risk语义变化改变aggregate identity', () => {
  const baseline = createTaskPlanningIdentity(input()).target.identity;
  const variants = [
    input({ task: { intent: 'Resolve a different planning scope.' } }),
    input({ changes: [{ project: 'product', change: 'demo', proposal, design, tasks, specs: [{ capability: 'demo-capability', content: spec.replace('stays equal', 'must change') }] }] }),
    input({ changes: [{ project: 'product', change: 'demo', proposal, design, tasks: tasks.replace('Implement resolver', 'Implement a different resolver'), specs: [{ capability: 'demo-capability', content: spec }] }] }),
    input({ changes: [{ project: 'product', change: 'demo', proposal, design: design.replace('Use a closed projection.', 'Use an explicit semantic AST.'), tasks, specs: [{ capability: 'demo-capability', content: spec }] }] }),
    input({ changes: [{ project: 'product', change: 'demo', proposal, design: design.replace('Unknown structures block.', 'Unknown structures use raw digests.'), tasks, specs: [{ capability: 'demo-capability', content: spec }] }] }),
  ];
  for (const variant of variants) assert.notEqual(createTaskPlanningIdentity(variant).target.identity, baseline);
});

test('缺失Change或unsupported artifact结构fail closed', () => {
  assert.throws(() => createTaskPlanningIdentity(input({ changes: [] })), (error) => error.code === 'task_planning_identity_change_missing');
  assert.throws(() => createTaskPlanningIdentity(input({ changes: [{ project: 'product', change: 'demo', proposal, design: '# Design\n', tasks, specs: [{ capability: 'demo', content: spec }] }] })), (error) => error.code === 'task_planning_identity_structure_unsupported');
  assert.throws(() => createTaskPlanningIdentity(input({ changes: [{ project: 'product', change: 'demo', proposal, design, tasks: '## Work\n\nNo checkbox.\n', specs: [{ capability: 'demo', content: spec }] }] })), (error) => error.code === 'task_planning_identity_structure_unsupported');
  assert.throws(() => createTaskPlanningIdentity(input({ changes: [{ project: 'product', change: 'demo', proposal, design, tasks, specs: [{ capability: 'demo', content: '### Requirement: Incomplete\n' }] }] })), (error) => error.code === 'task_planning_identity_structure_unsupported');
  assert.throws(() => createTaskPlanningIdentity(input({ changes: [{ project: 'product', change: 'demo', proposal, design, tasks, specs: [{ capability: 'demo', content: `${spec}\n#### Scenario: Missing then\n- **WHEN** used again\n` }] }] })), (error) => error.code === 'task_planning_identity_structure_unsupported');
});
