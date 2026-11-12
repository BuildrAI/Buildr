import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { verificationSteps } from '../verification/registry.ts';
import { checkAvailability, parseVerificationArguments, planVerification, verificationCoverageEntry, withVerificationSignals } from '../verification/cli.ts';

test('automatic related CLI caps final execution but retains deferred candidates; explicit tags bypass the budget', () => {
  const options = { collectChanged: () => ({ paths: ['services/buildr-agent/src/index.ts'], base: 'fixture-base' }) };
  const automatic = planVerification(parseVerificationArguments(['related', '--base', 'fixture-base', '--plan']), options);
  assert.ok(automatic.steps.length <= 10);
  assert.equal(automatic.selection, 'daily-targeted');
  assert.ok(automatic.selectionBudget.candidateCount > automatic.steps.length);
  assert.equal(automatic.selectionBudget.deferred.length + automatic.steps.length, automatic.selectionBudget.candidateCount);
  for (const step of automatic.steps) for (const id of step.dependsOn) {
    assert.ok(automatic.steps.some((candidate: any) => candidate.id === id), `${step.id}: ${id}`);
  }
  const explicit = planVerification(parseVerificationArguments(['related', '--base', 'fixture-base', '--tag', 'recovery', '--plan']), options);
  assert.equal(explicit.selectionBudget, undefined);
  assert.ok(explicit.steps.length > 10);
});

test('verification interruption retains its first signal and releases handlers after evidence or failure', async () => {
  for (const fails of [false, true]) {
    const owner = new EventEmitter();
    const existing = () => {};
    owner.on('SIGINT', existing);
    const run = withVerificationSignals(async signal => {
      owner.emit('SIGTERM');
      owner.emit('SIGINT');
      assert.equal(signal.aborted, true);
      assert.equal(signal.reason, 'SIGTERM');
      await Promise.resolve();
      assert.equal(owner.listenerCount('SIGTERM'), 1, 'handler stays installed during finalization');
      if (fails) throw new Error('evidence-write-failed');
      return 'evidence-saved';
    }, owner);
    if (fails) await assert.rejects(run, /evidence-write-failed/);
    else assert.equal(await run, 'evidence-saved');
    assert.deepEqual(owner.listeners('SIGINT'), [existing]);
    assert.equal(owner.listenerCount('SIGTERM'), 0);
  }
});

test('repair accepts cancellation evidence and keeps independent successes', async () => {
  const { readFailedVerificationGroups } = await import('../verification/failed-groups.ts');
  assert.deepEqual(readFailedVerificationGroups('unused', { coverage: { selected: [
    { id: 'done', status: 'passed' }, { id: 'stopped', status: 'cancelled' }, { id: 'pending', status: 'blocked' },
  ] } }), ['stopped', 'pending']);
});

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

test('focused browser success cannot erase an incompletely proven group on repair',async()=>{
  const {readFailedVerificationGroups}=await import('../verification/failed-groups.ts');
  const step={id:'e2e-browser:agent-conversations',target:'source',testing:{executionBoundary:'E2E'},availability:'ready'};
  const focused=verificationCoverageEntry(step,{status:'passed',exitCode:0},'darwin',{BUILDR_AGENT_JOURNEY_PART:'history',BUILDR_AGENT_SCENARIO_FOCUS:'history/fill-viewport'});
  assert.equal(focused.scope,'focused');assert.deepEqual(readFailedVerificationGroups('unused',{steps:[focused]}),[step.id]);
  const complete=verificationCoverageEntry(step,{status:'passed',exitCode:0},'darwin',{});
  assert.deepEqual(readFailedVerificationGroups('unused',{steps:[complete]}),[]);
});


test('system selection is the exact union of complete Integration and E2E plans', () => {
  const plans = ['integration', 'e2e', 'system'].map(mode => planVerification(parseVerificationArguments([mode, '--plan']), { env: { CI: 'true' } }));
  const expected = [...new Set(plans.slice(0, 2).flatMap(plan => plan.steps.map((step: any) => step.id)))].sort();
  const actual = plans[2].steps.map((step: any) => step.id);
  assert.deepEqual([...actual].sort(), expected);
  assert.equal(actual.length, new Set(actual).size);
  assert.equal(plans[2].selection, 'full');
  assert.equal(plans[2].executionProfile.id, 'ci');
});
