import assert from 'node:assert/strict';
import test from 'node:test';

import { verificationExecutionIdentityMaterial } from '../../src/verification/application/verification-application.mjs';

function context(controllerIdentity) {
  return {
    taskId: 'task-a',
    workspaceRoot: '/workspace',
    environmentRoot: '/workspace/.worktrees/task-a',
    controller: { identity: controllerIdentity },
    scopes: [{
      selector: 'workspace',
      executionRoot: '/workspace/.worktrees/task-a',
      runtime: { identity: 'runtime-m1' },
      cli: { identity: 'candidate-cli-m1' },
      dependencies: { identity: 'dependencies-m1' },
      projection: { identity: 'projection-m1' },
    }],
  };
}

function material(environmentContext) {
  return verificationExecutionIdentityMaterial({
    project: 'product',
    declaration: 'sha256-declaration',
    target: 'target-one',
    context: environmentContext,
    observation: { fingerprint: 'sha256-content' },
    checks: [{ id: 'product.candidate', status: 'passed', exitCode: 0 }],
  });
}

test('retained controller hash 不进入 transient Verification execution identity', () => {
  const m1 = material(context('sha256-controller-m1'));
  const m2 = material(context('sha256-controller-m2'));
  assert.deepEqual(m2, m1);
  assert.equal(JSON.stringify(m1).includes('controller'), false);

  const changedProjection = context('sha256-controller-m2');
  changedProjection.scopes[0].projection.identity = 'projection-m2';
  assert.notDeepEqual(material(changedProjection), m1);

  const changedDependencies = context('sha256-controller-m2');
  changedDependencies.scopes[0].dependencies.identity = 'dependencies-m2';
  assert.notDeepEqual(material(changedDependencies), m1);
});
