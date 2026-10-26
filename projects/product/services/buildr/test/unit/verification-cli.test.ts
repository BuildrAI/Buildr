import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAvailability, parseVerificationArguments, planVerification, verificationCoverageEntry } from '../verification/cli.ts';
import { verificationSteps } from '../verification/registry.ts';

test('explicit verification accepts repeated check requests without requiring a task or base', () => {
  const request = parseVerificationArguments(['related', '--check', 'unit', '--check', 'frontend-logic', '--check', 'unit', '--plan']);
  assert.deepEqual(request.checks, ['unit', 'frontend-logic']);
  const plan = planVerification(request);
  assert.equal(plan.selection, 'explicit');
  assert.deepEqual(plan.steps.map((step: any) => step.id).sort(), ['frontend-logic', 'unit']);
});

test('related verification adds explicit requirements to the actual changed-path selection', () => {
  const plan = planVerification(parseVerificationArguments(['related', '--base', 'fixed-base', '--check', 'agent-unit']), {
    collectChanged: () => ({ paths: ['services/buildr-web/src/api/client.ts'], base: 'fixed-base' }),
  });
  assert.equal(plan.base, 'fixed-base');
  assert.equal(plan.selection, 'related-plus-explicit');
  assert.ok(plan.steps.some((step: any) => step.id === 'agent-unit'));
  assert.ok(plan.steps.some((step: any) => step.id === 'frontend-logic'));
});

test('push check cannot be narrowed by an explicit selection and includes all four services', () => {
  const plan = planVerification(parseVerificationArguments(['check', '--check', 'unit']));
  const actual = new Set(plan.steps.map((step: any) => step.id));
  for (const step of verificationSteps) {
    if (step.target === 'source' && ['Static', 'Unit'].includes(step.testing.executionBoundary) && step.selection !== 'explicit-only') assert.ok(actual.has(step.id), step.id);
  }
  for (const id of ['unit', 'frontend-logic', 'agent-unit', 'plugin-unit']) assert.ok(actual.has(id), id);
});

test('unknown checks preserve independently executable selections and report the gap', () => {
  const plan = planVerification(parseVerificationArguments(['related', '--check', 'unit', '--check', 'does-not-exist']));
  assert.ok(plan.steps.some((step: any) => step.id === 'unit'));
  assert.equal(plan.status, 'incomplete');
  assert.ok(plan.gaps.some((gap: any) => gap.code === 'unknown-check' && gap.checkId === 'does-not-exist'));
});

test('missing explicit inputs and another operating system remain visible unverified gaps', () => {
  const gaps = checkAvailability({ id: 'native-check', requiredEnvironment: ['EXACT_SDK'], platforms: ['win32'] }, {}, 'darwin');
  assert.deepEqual(gaps.map((gap: any) => gap.code), ['required-environment-missing', 'different-platform-required']);
});

test('verification arguments reject ambiguous scopes and unknown switches', () => {
  assert.throws(() => parseVerificationArguments(['related']), /requires --base/);
  assert.throws(() => parseVerificationArguments(['unit', '--base', 'main']), /--base/);
  assert.throws(() => parseVerificationArguments(['related', '--base', 'a', '--base', 'b']), /only be supplied once/);
  assert.throws(() => parseVerificationArguments(['check', '--check']), /requires a value/);
  assert.throws(() => parseVerificationArguments(['check', '--unknown']), /Unknown verification option/);
});

test('a preparation failure carries no executed check or operating-system proof', () => {
  const step = { id: 'page', target: 'source', testing: { executionBoundary: 'E2E' }, availability: 'ready' };
  const blocked = verificationCoverageEntry(step, { status: 'blocked', exitCode: 1 }, 'darwin');
  assert.equal(blocked.availability, 'unavailable');
  assert.equal(blocked.disposition, 'not-run');
  assert.equal(blocked.proofPlatform, null);
  assert.equal(blocked.exitCode, null);
  const reused = verificationCoverageEntry(step, { status: 'passed', exitCode: 0, reusedFrom: { environment: { platform: 'win32' } } }, 'darwin');
  assert.equal(reused.disposition, 'reused');
  assert.equal(reused.proofPlatform, 'win32');
});


test('full Integration explains supplementary Host Node coverage while explicit selection remains available', () => {
  const full = planVerification(parseVerificationArguments(['integration', '--plan']));
  assert.equal(full.steps.some((step: any) => step.id === 'host-node-boundaries'), false);
  assert.match(full.selectionExclusions.find((step: any) => step.id === 'host-node-boundaries').reason, /Host Node versions/);
  for (const owner of ['integration-runtime', 'integration-data-store']) assert.ok(full.steps.some((step: any) => step.id === owner), owner);
  const explicit = planVerification(parseVerificationArguments(['related', '--check', 'host-node-boundaries', '--plan']));
  assert.ok(explicit.steps.some((step: any) => step.id === 'host-node-boundaries'));
});
