import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExecutionCapacity } from '../verification/execution-capacity.ts';
import { resolveVerificationExecutionProfile, VERIFICATION_EXECUTION_PROFILES } from '../verification/registry.ts';

const base = VERIFICATION_EXECUTION_PROFILES.local;
const machine = (parallelism: number, memoryGiB: number) => ({ parallelism, memoryBytes: memoryGiB * 1024 ** 3 });

test('initial admission scales relevant capacities together and preserves correctness locks', () => {
  const low = resolveExecutionCapacity(base, { automatic: true, env: {}, machine: machine(2, 4) });
  const high = resolveExecutionCapacity(base, { automatic: true, env: {}, machine: machine(15, 64) });
  assert.equal(low.limits.global, 1);
  assert.equal(high.limits.global, 3, 'four outer groups starved real browser, native-agent and handoff checks');
  assert.equal(high.limits.classes['workspace-heavy'], 3, 'four heavy groups starved real browser and handoff checks');
  assert.equal(high.limits.resources['browser-runtime'], 2, 'the conversation journey owns both browser slots');
  assert.equal(high.limits.capacities.workspaceIo, 4);
  assert.ok(low.limits.capacities.workers >= 4);
  assert.equal(low.limits.resources['browser-runtime'], 2, 'one existing group needs two browser workers');
  assert.equal(high.limits.resources['app-runtime'], base.resources['app-runtime']);
  assert.equal(high.limits.resources['agent-process-tests'], base.resources['agent-process-tests']);
  assert.deepEqual(high.limits.innerConcurrency, base.innerConcurrency);
  assert.equal(high.capacityObservation.parallelism, 15);
  assert.equal(high.capacityObservation.workspaceHeavyLimit, 3);
  assert.equal(high.capacityObservation.initialWidth, 3);
  assert.equal(base.resources['browser-runtime'], 2, 'base profile is not mutated');
});

test('memory constrains automatic admission and fixed profiles ignore machine sizing', () => {
  assert.equal(resolveExecutionCapacity(base, { automatic: true, env: {}, machine: machine(32, 8) }).limits.global, 2);
  assert.equal(resolveExecutionCapacity(base, { env: {}, machine: machine(1, 1) }).limits, base);
  assert.equal(resolveVerificationExecutionProfile(undefined, { CI: 'true' }).id, 'ci');
  assert.equal(resolveVerificationExecutionProfile('local', {}).limits, base);
  assert.equal(resolveVerificationExecutionProfile(undefined, {}).id, 'local-auto');
});

test('explicit jobs change real outer resource capacities and reject invalid input before execution', () => {
  const configured = resolveExecutionCapacity(base, { automatic: true, env: { BUILDR_VERIFICATION_JOBS: '3' }, machine: machine(15, 64) });
  assert.equal(configured.capacityPolicy, 'explicit-jobs');
  assert.equal(configured.limits.global, 3);
  assert.equal(configured.limits.classes['workspace-heavy'], 3);
  assert.equal(configured.limits.resources['browser-runtime'], 2);
  assert.equal(configured.limits.capacities.workspaceIo, 4, 'three admitted groups retain two-slot heavy I/O overlap');
  assert.equal(configured.capacityObservation.requestedJobs, 3);
  for (const value of ['', '0', '-1', '1.5', 'abc', '9007199254740992']) {
    assert.throws(() => resolveExecutionCapacity(base, { env: { BUILDR_VERIFICATION_JOBS: value }, machine: machine(15, 64) }), /safe positive integer/);
  }
});
