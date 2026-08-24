#!/usr/bin/env node

import process from 'node:process';
import { createRuntime } from '../../../bootstrap/runtime.mjs';

const RESULT_SCHEMA = 'buildr.task-finish-maintenance-driver-result/v1';

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

const args = process.argv.slice(2);
const taskId = option(args, '--task');
const runId = option(args, '--run');
const targetRoot = option(args, '--target');
const resultJson = option(args, '--self-bootstrap-result-json');

if (!taskId || !runId || !targetRoot || !resultJson) {
  console.error('Internal usage: node task-finish-maintenance-driver.mjs --task <task-id> --run <run-id> --target <canonical-workspace> --self-bootstrap-result-json <json>');
  process.exit(2);
}

try {
  const runtime = createRuntime();
  const refreshed = runtime.refreshTaskFinishMaintenance(targetRoot, taskId, { runId, selfBootstrapResult: JSON.parse(resultJson) });
  console.log(JSON.stringify({ schemaVersion: RESULT_SCHEMA, operation: 'maintenance', status: refreshed.status, taskId, runId, maintenance: refreshed.maintenance || null }, null, 2));
  if (refreshed.status !== 'refreshed') process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: RESULT_SCHEMA, operation: 'maintenance', status: 'blocked', taskId: taskId || null, runId: runId || null, maintenance: null, diagnostic: { code: error.code || 'task_finish_maintenance_driver_failed', message: error.message, details: error.details || null } }, null, 2));
  process.exitCode = 1;
}
