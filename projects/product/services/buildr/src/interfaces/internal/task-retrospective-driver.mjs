#!/usr/bin/env node

import process from 'node:process';
import { createRuntime } from '../../application/compose-runtime.mjs';

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

const args = process.argv.slice(2);
const action = args[0];
const taskId = option(args, '--task');
const targetRoot = option(args, '--target');
if (!['inspect', 'record'].includes(action) || !taskId || !targetRoot) {
  console.error('Internal usage: node task-retrospective-driver.mjs <inspect|record> --task <task-id> --target <canonical-workspace> [--report-markdown <text>]');
  process.exit(2);
}

try {
  const runtime = createRuntime();
  const output = action === 'inspect'
    ? runtime.inspectTaskRetrospective(targetRoot, taskId)
    : runtime.recordTaskRetrospective(targetRoot, taskId, { reportMarkdown: option(args, '--report-markdown') });
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'buildr.task-retrospective-driver-error/v1',
    status: 'blocked',
    diagnostic: { code: error.code || 'task_retrospective_driver_failed', message: error.message, details: error.details },
    nextActions: error.nextAction ? [error.nextAction] : [],
  }, null, 2));
  process.exitCode = 1;
}
