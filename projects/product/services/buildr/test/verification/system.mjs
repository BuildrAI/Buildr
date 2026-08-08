#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import {
  prepareTaskLifecycleSystemContext,
  TASK_LIFECYCLE_CONTEXT_ENV,
} from '../helpers/task-lifecycle-system-context.mjs';
import { resolveVerificationWorkerBudget } from './worker-budget.mjs';

const productRoot = path.resolve(import.meta.dirname, '../..');
const systemRoot = path.join(productRoot, 'test', 'system');
const fileTimingReporter = path.join(import.meta.dirname, 'system-file-timing-reporter.mjs');
const startFirst = [
  'worktree-create.test.mjs',
  'task-record-product.test.mjs',
  'public-json-contracts.test.mjs',
  'task-review-product.test.mjs',
  'task-record-change-resolver.test.mjs',
  'task-record-local-app.test.mjs',
  'task-verification-product.test.mjs',
  'workspace-product.test.mjs',
];
const startRank = new Map(startFirst.map((name, index) => [name, index]));
const excludedFromGeneral = new Set(['local-app-http.test.mjs']);
const fileNames = fs.readdirSync(systemRoot)
  .filter((name) => name.endsWith('.test.mjs') && !excludedFromGeneral.has(name))
  .sort((left, right) => (startRank.get(left) ?? startFirst.length) - (startRank.get(right) ?? startFirst.length) || left.localeCompare(right));

for (const name of startFirst) {
  if (!fileNames.includes(name)) throw new Error(`Unknown start-first System owner: ${name}.`);
}
const files = fileNames.map((name) => path.join(systemRoot, name));

if (files.length === 0) throw new Error(`No System tests found in ${systemRoot}.`);
const workerBudget = resolveVerificationWorkerBudget({ env: process.env, fallback: 14, maximum: files.length, label: 'System suite' });

const context = prepareTaskLifecycleSystemContext();
process.stderr.write(`[buildr-system-context] status=ready id=${context.marker.contextId} identity=${context.marker.identity} setupApplicationOperations=${context.marker.setup.applicationOperations} setupDurationMs=${context.marker.setup.durationMs} workerBudget=${workerBudget}\n`);

let result = null;
let cleanupError = null;
try {
  result = spawnSync(process.execPath, [
    '--test',
    `--test-concurrency=${workerBudget}`,
    '--test-reporter=dot',
    '--test-reporter-destination=stdout',
    `--test-reporter=${fileTimingReporter}`,
    '--test-reporter-destination=stderr',
    ...files,
  ], {
    cwd: productRoot,
    stdio: 'inherit',
    env: { ...process.env, [TASK_LIFECYCLE_CONTEXT_ENV]: context.contextRoot },
  });
} finally {
  try {
    const cleanup = context.cleanup();
    process.stderr.write(`[buildr-system-context] status=${cleanup.status} id=${context.marker.contextId} identity=${cleanup.identity}\n`);
  } catch (error) {
    cleanupError = error;
    process.stderr.write(`[buildr-system-context] status=failed id=${context.marker.contextId} code=${error.code || 'cleanup_failed'} message=${error.message}\n`);
  }
}

if (!result) throw cleanupError || new Error('System test runner did not return a process result.');
if (result.error) throw result.error;
if (cleanupError && result.status === 0) throw cleanupError;
if (result.status !== 0) {
  process.stderr.write(`[buildr-system-tests] node:test failed: exitCode=${result.status ?? 'none'} signal=${result.signal ?? 'none'} files=${files.length}\n`);
  process.exitCode = result.status ?? 1;
}
