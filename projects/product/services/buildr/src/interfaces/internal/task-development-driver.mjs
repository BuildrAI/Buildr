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

function input(args) {
  const raw = option(args, '--input-json', '{}');
  let value;
  try { value = JSON.parse(raw); } catch (error) { throw new Error(`Invalid --input-json: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('--input-json must be a JSON object.');
  return value;
}

const args = process.argv.slice(2);
const action = args[0];
const taskId = option(args, '--task');
const targetRoot = option(args, '--target');

if (!['inspect', 'begin', 'planning', 'observe', 'policy', 'gate', 'freeze', 'decide', 'handoff', 'carrier'].includes(action) || !taskId || !targetRoot) {
  console.error('Internal usage: node task-development-driver.mjs <inspect|begin|planning|observe|policy|gate|freeze|decide|handoff|carrier> --task <task-id> --target <canonical-workspace> [--input-json <json>]');
  process.exit(2);
}

try {
  const runtime = createRuntime();
  const payload = input(args);
  const operations = {
    inspect: () => runtime.inspectTaskDevelopment(targetRoot, taskId),
    begin: () => runtime.beginTaskDevelopment(targetRoot, taskId, payload),
    planning: () => runtime.recordTaskDevelopmentPlanning(targetRoot, taskId, payload),
    observe: () => runtime.observeTaskDevelopment(targetRoot, taskId, payload),
    policy: () => runtime.recordTaskDevelopmentPolicy(targetRoot, taskId, payload),
    gate: () => runtime.recordTaskDevelopmentGate(targetRoot, taskId, payload),
    freeze: () => runtime.freezeTaskDevelopmentCandidate(targetRoot, taskId, payload),
    decide: () => runtime.decideTaskDevelopment(targetRoot, taskId, payload),
    handoff: () => runtime.createTaskDevelopmentHandoff(targetRoot, taskId, payload),
    carrier: () => runtime.assertTaskDevelopmentCarrier(targetRoot, taskId, payload),
  };
  console.log(JSON.stringify(operations[action](), null, 2));
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'buildr.task-development-driver-error/v1',
    status: 'blocked',
    diagnostic: { code: error.code || 'task_development_driver_failed', message: error.message, details: error.details },
    nextActions: error.nextAction ? [error.nextAction] : [],
  }, null, 2));
  process.exitCode = 1;
}
