import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createProjectVerificationPlan } from '../../src/application/verification/project-plan.mjs';
import { runVerificationDag } from '../../src/application/verification/dag-scheduler.mjs';
import { createVerificationResourceCoordinator } from '../../src/application/verification/resource-coordinator.mjs';

function capability(id, overrides = {}) {
  return {
    id,
    title: id,
    command: { argv: ['node', '-e', ''], cwd: '.' },
    maturity: 'stable',
    stages: ['candidate'],
    enforcement: { candidate: 'required' },
    resourceClaims: [],
    dependsOn: [],
    supersedes: [],
    ...overrides,
  };
}

test('Project plan expands dependencies and applies explicit supersedes', () => {
  const declaration = { capabilities: [
    capability('lint'),
    capability('suite', { dependsOn: ['lint'], supersedes: ['legacy'] }),
    capability('legacy'),
  ] };
  const plan = createProjectVerificationPlan(declaration, { level: 'candidate' });
  assert.deepEqual(plan.steps.map((step) => step.id), ['lint', 'suite']);
  assert.deepEqual(plan.superseded, [{ capability: 'legacy', by: 'suite' }]);
  assert.deepEqual(plan.uncoveredRequired, []);
});

test('DAG overlaps independent checks and blocks failed dependants', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-dag-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createVerificationResourceCoordinator({ root, resources: [], owner: { taskId: 'task', environmentId: 'env', runId: 'run' } });
  let active = 0;
  let maximum = 0;
  const result = await runVerificationDag({ steps: [capability('a'), capability('b'), capability('after', { dependsOn: ['a'] })] }, {
    concurrency: 2,
    resourceCoordinator: coordinator,
    execute: async (step) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { status: step.id === 'a' ? 'failed' : 'passed', exitCode: step.id === 'a' ? 1 : 0, signal: null, durationMs: 10, stdout: '', stderr: '' };
    },
  });
  assert.equal(maximum, 2);
  assert.equal(result.find((entry) => entry.id === 'after').status, 'blocked');
});
