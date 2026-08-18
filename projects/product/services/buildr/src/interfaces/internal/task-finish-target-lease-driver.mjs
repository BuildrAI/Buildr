#!/usr/bin/env node

import process from 'node:process';
import { createRuntime } from '../../application/compose-runtime.mjs';

const RESULT_SCHEMA = 'buildr.task-finish-target-lease-driver-result/v1';

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function usage() {
  return 'Internal usage: node task-finish-target-lease-driver.mjs <acquire|refresh|release> --task <task-id> --run <run-id> --target-identity <remote:branch> --target <canonical-workspace> [--lease-token <token>] [--duration-ms <milliseconds>]';
}

const args = process.argv.slice(2);
const action = args[0];
const taskId = option(args, '--task');
const runId = option(args, '--run');
const targetIdentity = option(args, '--target-identity');
const targetRoot = option(args, '--target');
const leaseToken = option(args, '--lease-token');
const durationValue = option(args, '--duration-ms');
const leaseDurationMs = durationValue === undefined ? 15 * 60_000 : Number(durationValue);

if (!['acquire', 'refresh', 'release'].includes(action) || !taskId || !runId || !targetIdentity || !targetRoot || (action === 'release' && !leaseToken)) {
  console.error(usage());
  process.exit(2);
}

try {
  const runtime = createRuntime();
  if (action === 'release') {
    const released = runtime.releaseTaskFinishTargetLease(targetRoot, {
      token: leaseToken,
      value: { targetIdentity },
    });
    console.log(JSON.stringify({
      schemaVersion: RESULT_SCHEMA,
      operation: action,
      status: 'passed',
      taskId,
      runId,
      targetIdentity,
      released: released.released,
    }, null, 2));
  } else {
    const lease = runtime.acquireTaskFinishCurrentTargetLease(targetRoot, { taskId, runId, targetIdentity, leaseDurationMs });
    const blocked = lease.blocked === true;
    console.log(JSON.stringify({
      schemaVersion: RESULT_SCHEMA,
      operation: action,
      status: blocked ? 'blocked' : 'passed',
      taskId,
      runId,
      targetIdentity,
      lease: blocked ? null : { token: lease.token, expiresAt: lease.value.expiresAt },
      existing: blocked ? lease.existing : null,
    }, null, 2));
    if (blocked) process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: RESULT_SCHEMA,
    operation: action || null,
    status: 'blocked',
    taskId: taskId || null,
    runId: runId || null,
    targetIdentity: targetIdentity || null,
    diagnostic: { code: error.code || 'task_finish_target_lease_driver_failed', message: error.message, details: error.details || null },
  }, null, 2));
  process.exitCode = 1;
}
