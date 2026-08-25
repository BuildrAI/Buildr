import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProjectVerification } from '../../src/verification/application/project-verification-diagnostics.mjs';
import { createVerificationPlan, createVerificationRequest } from '../../src/verification/domain/verification-plan.mjs';
import { VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS } from '../../src/verification/domain/verification-deadline.mjs';

function declaration(invocation = {}) {
  return {
    schemaVersion: 'buildr.project-verification/v3',
    resources: [],
    capabilities: [{
      id: 'demo', scope: { project: 'demo', services: [] }, proves: ['demo'], evidence: ['unit'], usableFor: ['task-delivery'],
      discovery: { sources: ['src/**'] }, invocation: { full: { kind: 'command', argv: ['node', 'test.mjs'], cwd: '.', ...invocation } },
      resourceClaims: [],
    }],
  };
}

test('v3 command timeout defaults into normalized declaration and Plan identity', () => {
  const normalized = normalizeProjectVerification(declaration(), { projectCode: 'demo', services: [] });
  assert.equal(normalized.capabilities[0].invocation.full.timeoutMs, VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS);
  const request = createVerificationRequest({ project: 'demo', target: { kind: 'task-delivery', identity: 'target' }, selection: { scope: 'full' }, declarations: [{ project: 'demo', identity: 'sha256-declaration' }] });
  const plan = createVerificationPlan({ request, declaration: normalized });
  assert.equal(plan.executionUnits[0].invocation.timeoutMs, VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS);
});

test('v3 command timeout rejects values outside the closed range', () => {
  assert.throws(() => normalizeProjectVerification(declaration({ timeoutMs: 999 }), { projectCode: 'demo', services: [] }), /timeoutMs/);
  assert.throws(() => normalizeProjectVerification(declaration({ timeoutMs: 1_800_001 }), { projectCode: 'demo', services: [] }), /timeoutMs/);
});
