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

function options(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.push(value);
  }
  return values;
}

const args = process.argv.slice(2);
const action = args[0];
const taskId = option(args, '--task');
const targetRoot = option(args, '--target');
if (!['list', 'inspect', 'record', 'handle'].includes(action) || !targetRoot || (action !== 'list' && !taskId)) {
  console.error('Internal usage: node task-retrospective-driver.mjs list --target <canonical-workspace> [--status <pending|handled|no-action|all>] [--task <task-id> ...] [--limit <count>] [--include-report]\n       node task-retrospective-driver.mjs <inspect|record|handle> --task <task-id> --target <canonical-workspace> [--report-markdown <text>] [--status <pending|handled|no-action> --note <text> --expected-current-digest <digest>]');
  process.exit(2);
}

try {
  const runtime = createRuntime();
  const output = action === 'list'
    ? runtime.listTaskRetrospectives(targetRoot, {
        status: option(args, '--status'),
        taskIds: options(args, '--task'),
        limit: option(args, '--limit') === undefined ? undefined : Number(option(args, '--limit')),
        includeReport: args.includes('--include-report'),
      })
    : action === 'inspect'
      ? runtime.inspectTaskRetrospective(targetRoot, taskId)
    : action === 'record'
      ? runtime.recordTaskRetrospective(targetRoot, taskId, { reportMarkdown: option(args, '--report-markdown') })
      : runtime.handleTaskRetrospective(targetRoot, taskId, {
          status: option(args, '--status'),
          note: option(args, '--note'),
          expectedCurrentDigest: option(args, '--expected-current-digest'),
        });
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
