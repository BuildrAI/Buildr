#!/usr/bin/env node

import process from 'node:process';
import { createRuntime } from '../../application/compose-runtime.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

const args = process.argv.slice(2);
const action = args[0];
const taskId = option(args, '--task');
const targetRoot = option(args, '--target');

if (action !== 'inspect' || !taskId || !targetRoot) {
  console.error('Internal usage: node task-planning-identity-driver.mjs inspect --task <task-id> --target <canonical-workspace>');
  process.exit(2);
}

try {
  const result = createRuntime().inspectTaskPlanningIdentity(targetRoot, taskId);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'blocked') process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'buildr.task-planning-identity-driver-error/v1',
    operation: 'inspect',
    status: 'blocked',
    taskId,
    diagnostic: { code: error.code || 'task_planning_identity_driver_failed', message: error.message, details: error.details },
    effects: [],
    nextActions: [error.nextAction || '检查driver参数与Buildr runtime composition后重试。'],
  }, null, 2));
  process.exitCode = 1;
}
