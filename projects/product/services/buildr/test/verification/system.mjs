#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { createTestContextPool } from '../context/runtime.mjs';
import { TEST_CONTEXT_PROVIDERS, TASK_LIFECYCLE_CONTEXT_KEY } from '../context/registry.mjs';
import { TASK_LIFECYCLE_CONTEXT_ENV } from '../helpers/task-lifecycle-system-context.mjs';
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
  .filter((name) => /\.test\.(?:mjs|ts)$/.test(name))
  .map((name) => `test/system/${name}`)
  .sort();
const validation = validateSystemSuiteRegistry(discovered);
if (!validation.ok) throw new Error(`Invalid System suite registry:\n${validation.findings.map((finding) => JSON.stringify(finding)).join('\n')}`);

const selectedSuites = request.owner ? SYSTEM_SUITES.filter((suite) => suite.id === request.owner) : SYSTEM_SUITES;
if (selectedSuites.length === 0) throw new Error(`Unknown System owner: ${request.owner}`);
const files = selectedSuites.flatMap((suite) => suite.files).map((file) => `./${file}`);
const fallback = request.owner ? selectedSuites[0].innerConcurrency : 8;
const workerBudget = resolveVerificationWorkerBudget({ env: process.env, fallback, maximum: files.length, label: request.owner || 'System suite' });
const contextKeys = [...new Set(selectedSuites.flatMap((suite) => suite.contexts ?? []))];
const contextPool = createTestContextPool({ providers: TEST_CONTEXT_PROVIDERS, env: process.env });
const contexts = contextPool.prepareAll(contextKeys);
for (const context of contexts) {
  process.stderr.write(`[buildr-test-context] status=${context.owned ? 'prepared' : 'reused'} id=${context.provider.key} identity=${context.marker.identity} owner=${request.owner || 'all'} prepareDurationMs=${context.prepareDurationMs} workerBudget=${workerBudget}\n`);
}
const contextEnvironment = contextPool.environment();
const taskContext = contexts.find((context) => context.provider.key === TASK_LIFECYCLE_CONTEXT_KEY);

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
    env: {
      ...process.env,
      ...contextEnvironment,
      ...(taskContext ? { [TASK_LIFECYCLE_CONTEXT_ENV]: taskContext.contextRoot } : {}),
    },
  });
} finally {
  try {
    const cleanup = contextPool.cleanup();
    for (const context of contexts) process.stderr.write(`[buildr-test-context] status=${cleanup.status} id=${context.provider.key} identity=${context.marker.identity} owner=${request.owner || 'all'}\n`);
  } catch (error) {
    cleanupError = error;
    process.stderr.write(`[buildr-test-context] status=failed code=${error.code || 'cleanup_failed'} message=${error.message}\n`);
  }
}

if (!result) throw cleanupError || new Error('System test runner did not return a process result.');
if (result.error) throw result.error;
if (cleanupError && result.status === 0) throw cleanupError;
if (result.status !== 0) {
  process.stderr.write(`[buildr-system-tests] node:test failed: exitCode=${result.status ?? 'none'} signal=${result.signal ?? 'none'} owner=${request.owner || 'all'} files=${files.length}\n`);
  process.exitCode = result.status ?? 1;
}
