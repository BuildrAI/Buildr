#!/usr/bin/env node

import process from 'node:process';
import { performance } from 'node:perf_hooks';

const moduleLoadStartedAt = performance.now();
const { createRuntime } = await import('../../application/compose-runtime.mjs');
const moduleLoadMs = performance.now() - moduleLoadStartedAt;

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
  const compositionStartedAt = performance.now();
  const runtime = createRuntime();
  const compositionMs = performance.now() - compositionStartedAt;
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
  const applicationStartedAt = performance.now();
  const result = operations[action]();
  const applicationMs = performance.now() - applicationStartedAt;
  const serializationStartedAt = performance.now();
  const serialized = JSON.stringify(result, null, 2);
  const serializationMs = performance.now() - serializationStartedAt;
  if (args.includes('--profile')) {
    const timing = {
      moduleLoadMs,
      compositionMs,
      applicationMs,
      serializationMs,
      totalMs: moduleLoadMs + compositionMs + applicationMs + serializationMs,
    };
    console.log(JSON.stringify({ schemaVersion: 'buildr.task-development-driver-profile/v1', action, result, timing }, null, 2));
  } else {
    console.log(serialized);
  }
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'buildr.task-development-driver-error/v1',
    status: 'blocked',
    diagnostic: { code: error.code || 'task_development_driver_failed', message: error.message, details: error.details },
    nextActions: error.nextAction ? [error.nextAction] : [],
  }, null, 2));
  process.exitCode = 1;
}
