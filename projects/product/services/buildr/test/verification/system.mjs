#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  prepareTaskLifecycleSystemContext,
  TASK_LIFECYCLE_CONTEXT_ENV,
} from '../helpers/task-lifecycle-system-context.mjs';
import { SYSTEM_SUITES, validateSystemSuiteRegistry } from './system-suites.mjs';
import { resolveVerificationWorkerBudget } from './worker-budget.mjs';

const productRoot = path.resolve(import.meta.dirname, '../..');
const systemRoot = path.join(productRoot, 'test', 'system');
const reporter = path.join(import.meta.dirname, 'system-file-timing-reporter.mjs');
const reporterSpecifier = process.platform === 'win32' ? pathToFileURL(reporter).href : reporter;

function parseArgs(args) {
  const result = { owner: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--owner' && args[index + 1]) result.owner = args[++index];
    else throw new Error(`Unknown System runner option: ${args[index]}`);
  }
  return result;
}

const request = parseArgs(process.argv.slice(2));
const discovered = fs.readdirSync(systemRoot)
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `test/system/${name}`)
  .sort();
const validation = validateSystemSuiteRegistry(discovered);
if (!validation.ok) throw new Error(`Invalid System suite registry:\n${validation.findings.map((finding) => JSON.stringify(finding)).join('\n')}`);

const selectedSuites = request.owner ? SYSTEM_SUITES.filter((suite) => suite.id === request.owner) : SYSTEM_SUITES;
if (selectedSuites.length === 0) throw new Error(`Unknown System owner: ${request.owner}`);
const files = selectedSuites.flatMap((suite) => suite.files).map((file) => `./${file}`);
const fallback = request.owner ? selectedSuites[0].innerConcurrency : 8;
const workerBudget = resolveVerificationWorkerBudget({ env: process.env, fallback, maximum: files.length, label: request.owner || 'System suite' });
const context = prepareTaskLifecycleSystemContext();
process.stderr.write(`[buildr-system-context] status=ready id=${context.marker.contextId} identity=${context.marker.identity} owner=${request.owner || 'all'} setupApplicationOperations=${context.marker.setup.applicationOperations} setupDurationMs=${context.marker.setup.durationMs} workerBudget=${workerBudget}\n`);

let result = null;
let cleanupError = null;
try {
  result = spawnSync(process.execPath, [
    '--test',
    `--test-concurrency=${workerBudget}`,
    '--test-reporter=dot',
    '--test-reporter-destination=stdout',
    `--test-reporter=${reporterSpecifier}`,
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
    process.stderr.write(`[buildr-system-context] status=${cleanup.status} id=${context.marker.contextId} identity=${cleanup.identity} owner=${request.owner || 'all'}\n`);
  } catch (error) {
    cleanupError = error;
    process.stderr.write(`[buildr-system-context] status=failed id=${context.marker.contextId} code=${error.code || 'cleanup_failed'} message=${error.message}\n`);
  }
}

if (!result) throw cleanupError || new Error('System test runner did not return a process result.');
if (result.error) throw result.error;
if (cleanupError && result.status === 0) throw cleanupError;
if (result.status !== 0) {
  process.stderr.write(`[buildr-system-tests] node:test failed: exitCode=${result.status ?? 'none'} signal=${result.signal ?? 'none'} owner=${request.owner || 'all'} files=${files.length}\n`);
  process.exitCode = result.status ?? 1;
}
