import assert from 'node:assert/strict';
import test from 'node:test';

import { verificationEvidenceIdentityMaterial } from '../../src/application/verification/verification-application.mjs';

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
  return verificationEvidenceIdentityMaterial({
    project: 'product',
    policy: 'sha256-policy',
    level: 'candidate',
    context: environmentContext,
    workspaceNodeIdentity: { digest: 'sha256-node' },
    candidates: [{ selector: 'workspace', fingerprint: 'sha256-candidate-m1' }],
    checks: [{ id: 'product.candidate', status: 'passed', exitCode: 0 }],
  });
}

test('retained controller hash is not part of Verification evidence applicability identity', () => {
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
