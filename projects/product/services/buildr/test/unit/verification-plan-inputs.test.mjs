import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeVerificationChangedPaths } from '../../src/verification/application/verification-application.mjs';
import {
  assertVerificationPlanDocument,
  createVerificationPlan,
  createVerificationPlanResult,
  createVerificationRequest,
} from '../../src/verification/domain/verification-plan.mjs';

const workspaceRoot = '/workspace';
const projectRoot = '/workspace/projects/product';
const projectRoots = [
  { project: 'product', root: projectRoot },
  { project: 'another', root: '/workspace/projects/another' },
  { project: 'attached', root: '/external/attached' },
];

test('Workspace与Project相对changed paths规范化为同一canonical集合', () => {
  const projectRelative = normalizeVerificationChangedPaths({
    changedPaths: ['services/buildr/src/example.mjs'], workspaceRoot, projectRoot, projectCode: 'product', projectRoots,
  });
  const workspaceRelative = normalizeVerificationChangedPaths({
    changedPaths: ['projects\\product\\services\\buildr\\src\\example.mjs'], workspaceRoot, projectRoot, projectCode: 'product', projectRoots,
  });
  assert.deepEqual(projectRelative, ['services/buildr/src/example.mjs']);
  assert.deepEqual(workspaceRelative, projectRelative);
});

test('changed path规范化不依赖文件存在并拒绝越界或其他Project', () => {
  assert.deepEqual(normalizeVerificationChangedPaths({
    changedPaths: ['projects/product/deleted/file.mjs'], workspaceRoot, projectRoot, projectCode: 'product', projectRoots,
  }), ['deleted/file.mjs']);
  assert.deepEqual(normalizeVerificationChangedPaths({
    changedPaths: ['src/index.mjs'], workspaceRoot, projectRoot: '/external/attached', projectCode: 'attached', projectRoots,
  }), ['src/index.mjs']);
  assert.throws(() => normalizeVerificationChangedPaths({
    changedPaths: ['projects/another/src/index.mjs'], workspaceRoot, projectRoot, projectCode: 'product', projectRoots,
  }), (error) => error.code === 'verification.changed_path_project_mismatch' && error.details.registeredProjectRoot === 'projects/product');
  assert.throws(() => normalizeVerificationChangedPaths({
    changedPaths: ['../outside.mjs'], workspaceRoot, projectRoot, projectCode: 'product', projectRoots,
  }), (error) => error.code === 'verification.changed_path_invalid');
  assert.throws(() => normalizeVerificationChangedPaths({
    changedPaths: ['/workspace/projects/product/src/index.mjs'], workspaceRoot, projectRoot, projectCode: 'product', projectRoots,
  }), (error) => error.code === 'verification.changed_path_invalid');
});

function rawPlan() {
  const declaration = {
    schemaVersion: 'buildr.project-verification/v3', resources: [], capabilities: [{
      id: 'demo', scope: { project: 'demo', services: [] }, proves: ['demo'], evidence: ['unit'], usableFor: ['task-delivery'],
      discovery: { sources: ['src/**'] }, invocation: { affected: { kind: 'command', argv: ['node', 'test.mjs'], cwd: '.' }, full: { kind: 'command', argv: ['node', 'test.mjs'], cwd: '.' } },
      environment: { requires: [] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' }, resourceClaims: [],
    }],
  };
  const request = createVerificationRequest({ project: 'demo', target: { kind: 'task-delivery', identity: 'target' }, selection: { scope: 'affected' }, changedPaths: ['src/index.mjs'], declarations: [{ project: 'demo', identity: 'sha256-declaration' }] });
  return createVerificationPlan({ request, declaration });
}

test('Plan result envelope保持raw Plan并由同一reader兼容消费', () => {
  const plan = rawPlan();
  const result = createVerificationPlanResult({
    plan,
    preparation: {
      status: 'action-required', identity: 'sha256-closure',
      requirements: [{ capability: 'demo', project: 'demo', selector: 'project:demo', recipe: 'demo.prepare' }],
      planRequest: { schemaVersion: 'buildr.task-environment-plan-request/v1', projects: [], auxiliaryPreparation: [] },
    },
  });
  assert.equal(result.schemaVersion, 'buildr.verification-plan-result/v1');
  assert.equal(assertVerificationPlanDocument(plan).plan.identity, plan.identity);
  assert.equal(assertVerificationPlanDocument(result).plan.identity, plan.identity);
  assert.equal(assertVerificationPlanDocument(result).result.preparation.status, 'action-required');
  assert.throws(() => assertVerificationPlanDocument({ ...result, status: 'blocked' }), /identity|closed/u);
});
