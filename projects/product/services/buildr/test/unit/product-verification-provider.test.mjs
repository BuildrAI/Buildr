import assert from 'node:assert/strict';

import { createProductVerificationProvider } from '../../src/verification/application/product-verification-provider.mjs';
import { assertVerificationPlan, createVerificationPlan, createVerificationRequest } from '../../src/verification/domain/verification-plan.mjs';
import { createVerificationPlan as createInternalPlan, createVerificationSelectionAudit } from '../verification/planner.mjs';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const test = createBuildrApplicationTest('unit-product-verification-provider');
const declaration = {
  schemaVersion: 'buildr.project-verification/v3', resources: [], capabilities: [{
    id: 'product.verification', title: 'Product verification', scope: { project: 'product', services: [] },
    proves: ['Buildr Product evidence'], evidence: ['system'], usableFor: ['task-delivery', 'product-candidate', 'published-release'], discovery: { sources: ['**'] },
    invocation: { affected: { kind: 'provider', provider: 'buildr.product-verification/v1' }, full: { kind: 'provider', provider: 'buildr.product-verification/v1' } },
    environment: { requires: ['node'] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' }, resourceClaims: [],
  }],
};
function request(targetKind, scope, changedPaths = []) {
  return createVerificationRequest({ project: 'product', target: { kind: targetKind, identity: `target:${targetKind}` }, selection: { scope }, changedPaths, declarations: [{ project: 'product', identity: 'sha256-declaration' }] });
}
function provider(identity = 'sha256-provider-one') {
  return createProductVerificationProvider({ providerIdentity: identity, createInternalPlan, createSelectionAudit: createVerificationSelectionAudit });
}

test('Product affected provider投射direct选择但不泄漏内部DAG或Context', () => {
  const plan = createVerificationPlan({ request: request('task-delivery', 'affected', ['src/verification/domain/verification-plan.mjs']), declaration, provider: provider().plan });
  assert.equal(plan.status, 'ready');
  assert.ok(plan.selectedItems.some((item) => item.selection.kind === 'direct'));
  assert.doesNotMatch(JSON.stringify(plan), /dependsOn|contexts|budgetMs|executor|testing|profiles/);
  assert.ok(plan.executionUnits.every((unit) => unit.invocation.provider === 'buildr.product-verification/v1'));
});

test('Product provider把内部依赖扩张投射为parent reason', () => {
  const dependencyProvider = createProductVerificationProvider({
    providerIdentity: 'sha256-provider-dependency',
    createInternalPlan: () => ({ status: 'ready', steps: [{ id: 'application-payload-release', resources: [], testing: { executionBoundary: 'System', proves: 'payload' } }, { id: 'candidate-tarball', resources: [], testing: { executionBoundary: 'System', proves: 'candidate' }, dependsOn: [] }] }),
    createSelectionAudit: () => ({ stepSelections: [{ stepId: 'application-payload-release', publicOutcome: 'payload', triggers: [{ kind: 'direct-owner', path: 'src/example.mjs' }] }, { stepId: 'candidate-tarball', publicOutcome: 'candidate', triggers: [{ kind: 'dependency-closure', parentStepId: 'application-payload-release' }] }] }),
  });
  const plan = createVerificationPlan({ request: request('task-delivery', 'affected', ['src/example.mjs']), declaration, provider: dependencyProvider.plan });
  const dependency = plan.selectedItems.find((item) => item.selection.kind === 'dependency');
  assert.equal(dependency.id, 'candidate-tarball');
  assert.equal(dependency.selection.parent, 'application-payload-release');
});

test('Product full、Candidate与Published Release保持不同Request对象与选择理由', () => {
  const full = createVerificationPlan({ request: request('task-delivery', 'full'), declaration, provider: provider().plan });
  const candidate = createVerificationPlan({ request: request('product-candidate', 'full'), declaration, provider: provider().plan });
  const release = createVerificationPlan({ request: request('published-release', 'release-only'), declaration, provider: provider().plan });
  assert.notEqual(full.identity, candidate.identity);
  assert.notEqual(candidate.identity, release.identity);
  assert.ok(candidate.selectedItems.some((item) => item.id === 'candidate-tarball'));
  assert.ok(release.selectedItems.every((item) => item.selection.reasonCode === 'published-release'));
});

test('owner gap保持blocked且provider identity漂移使旧Plan stale', () => {
  const plan = createVerificationPlan({ request: request('task-delivery', 'affected', ['unknown-owner.file']), declaration, provider: provider().plan });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.coverageGaps[0].code, 'verification-owner-gap');
  assert.throws(() => assertVerificationPlan(plan, { providerIdentity: 'sha256-provider-two' }), /provider identity is stale/);
});
