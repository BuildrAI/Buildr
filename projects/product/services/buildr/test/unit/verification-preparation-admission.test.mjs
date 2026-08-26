import assert from 'node:assert/strict';
import test from 'node:test';

import { verificationCapabilityIdentity, verificationPreparationAdmission } from '../../src/verification/infrastructure/preparation-admission.mjs';

function capability() {
  return {
    id: 'product.browser-smoke',
    scope: { project: 'product', services: ['buildr', 'buildr-web'] },
    invocation: { kind: 'command', argv: ['npm', 'run', 'test:browser:changed'], cwd: 'services/buildr' },
    environment: { requires: ['node'], preparation: [{ project: 'product', service: 'buildr-web', recipe: 'buildr-web.npm-ci' }] },
    effects: { writes: [], externalSystems: [], authorization: 'implicit' },
    resourceClaims: ['browser'],
  };
}

function buildrCapability() {
  return {
    id: 'product.verification', scope: { project: 'product', services: [] },
    invocation: { kind: 'provider', provider: 'buildr.product-verification/v1' },
    environment: { requires: ['node'], preparation: [{ project: 'product', service: 'buildr', recipe: 'buildr.npm-ci' }] },
    effects: { writes: [], externalSystems: [], authorization: 'implicit' }, resourceClaims: [],
  };
}

function context(recipeStatus = 'ready') {
  const selected = capability();
  return {
    taskId: 'demo',
    preparationPlan: { identity: 'sha256-plan', projects: [{ project: 'product', source: { kind: 'project-declaration', identity: 'sha256-preparation' }, scopes: [{ selector: 'project:product', disposition: 'not-applicable', reason: 'none', recipes: [] }] }], capabilityPreparation: [{ capability: selected.id, capabilityIdentity: verificationCapabilityIdentity(selected), project: 'product', selector: 'service:product/buildr-web', recipe: { id: 'buildr-web.npm-ci' } }] },
    receiptIdentity: 'sha256-receipt',
    runtimeInvocation: { kind: 'node', executable: '/runtime/node', version: 'v24', identity: 'sha256-node', searchPrefix: '/runtime', source: 'stable-controller' },
    preparationRecipes: recipeStatus === 'missing' ? [] : [{ scope: 'service:product/buildr-web', recipe: 'buildr-web.npm-ci', status: recipeStatus, identity: 'sha256-recipe', preparedIdentity: 'sha256-recipe', diagnostic: null }],
  };
}

test('preparation admission绑定capability、Plan、Receipt和runtime identity', () => {
  const result = verificationPreparationAdmission({ projectCode: 'product', declarationIdentity: 'sha256-verification', selectedCapabilities: [capability()], context: context() });
  assert.equal(result.status, 'ready');
  assert.equal(result.gaps.length, 0);
  assert.equal(result.binding.planIdentity, 'sha256-plan');
  assert.equal(result.binding.receiptIdentity, 'sha256-receipt');
  assert.ok(result.binding.runtimeInvocationIdentity.startsWith('sha256-'));
});

test('preparation gap只生成Task Environment恢复输入并声明安全降级边界', () => {
  const result = verificationPreparationAdmission({ projectCode: 'product', declarationIdentity: 'sha256-verification', selectedCapabilities: [capability()], context: context('missing') });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.gaps.map((gap) => [gap.category, gap.owner, gap.recoverable]), [['preparation', 'task-environment', true]]);
  assert.equal(result.recovery.changesTaskScope, false);
  assert.deepEqual(result.recovery.blocks, ['formal-verification-execution', 'formal-verification-result', 'completion-claim']);
  assert.deepEqual(result.recovery.doesNotBlock, ['unrelated-development', 'read-only-investigation', 'bounded-informal-checks']);
  assert.deepEqual(result.recovery.planRequest.auxiliaryPreparation.map((item) => item.selector), ['service:product/buildr-web']);
});

test('preparation recovery冻结全部selected requirements而非missing subset', () => {
  const browser = capability();
  const product = buildrCapability();
  const current = context();
  current.preparationPlan.capabilityPreparation.push({
    capability: product.id,
    capabilityIdentity: verificationCapabilityIdentity(product),
    project: 'product', selector: 'service:product/buildr', recipe: { id: 'buildr.npm-ci' },
  });
  current.preparationRecipes.push({ scope: 'service:product/buildr', recipe: 'buildr.npm-ci', status: 'missing', identity: null, preparedIdentity: null, diagnostic: 'missing' });
  const result = verificationPreparationAdmission({ projectCode: 'product', declarationIdentity: 'sha256-verification', selectedCapabilities: [browser, product], context: current });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.gaps.map((gap) => gap.recipe), ['buildr.npm-ci']);
  assert.deepEqual(result.recovery.planRequest.auxiliaryPreparation.map((item) => item.recipe), ['buildr-web.npm-ci', 'buildr.npm-ci']);
  assert.deepEqual(result.recovery.planRequest.projects, [{
    project: 'product', source: { kind: 'project-declaration', identity: 'sha256-preparation' },
    scopes: [{ selector: 'project:product', disposition: 'not-applicable', reason: 'none' }],
  }]);
});

test('没有Formal Task Environment时不把admission扩展成通用工作许可', () => {
  const result = verificationPreparationAdmission({ projectCode: 'product', declarationIdentity: 'sha256-verification', selectedCapabilities: [capability()], context: null });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.gaps, []);
  assert.equal(result.recovery, null);
});
