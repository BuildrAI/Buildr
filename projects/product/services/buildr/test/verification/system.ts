#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { createTestContextPool } from '../context/runtime.ts';
import { TEST_CONTEXT_PROVIDERS, TASK_LIFECYCLE_CONTEXT_KEY } from '../context/registry.ts';
import { TASK_LIFECYCLE_CONTEXT_ENV } from '../helpers/task-lifecycle-system-context.ts';
import { SYSTEM_SUITES, validateSystemSuiteRegistry } from './system-suites.ts';
import { resolveVerificationWorkerBudget } from './worker-budget.ts';

const productRoot: any = path.resolve(import.meta.dirname, '../..');
const systemRoot: any = path.join(productRoot, 'test', 'system');
const reporter: any = path.join(import.meta.dirname, 'system-file-timing-reporter.ts');
const reporterSpecifier: any = process.platform === 'win32' ? pathToFileURL(reporter).href : reporter;

function parseArgs(args: any): any  {
  const result: any = { owner: null };
  for (let index: any = 0; index < args.length; index += 1) {
    if (args[index] === '--owner' && args[index + 1]) result.owner = args[++index];
    else throw new Error(`Unknown System runner option: ${args[index]}`);
  }
  return result;
}

const request: any = parseArgs(process.argv.slice(2));
const discovered: any = fs.readdirSync(systemRoot)
  .filter((name: any) => /\.test\.(?:mjs|ts)$/.test(name))
  .map((name: any) => `test/system/${name}`)
  .sort();
const validation: any = validateSystemSuiteRegistry(discovered);
if (!validation.ok) throw new Error(`Invalid System suite registry:\n${validation.findings.map((finding: any) => JSON.stringify(finding)).join('\n')}`);

const selectedSuites: any = request.owner ? SYSTEM_SUITES.filter((suite: any) => suite.id === request.owner) : SYSTEM_SUITES;
if (selectedSuites.length === 0) throw new Error(`Unknown System owner: ${request.owner}`);
const files: any = selectedSuites.flatMap((suite: any) => suite.files).map((file: any) => `./${file}`);
const fallback: any = request.owner ? selectedSuites[0].innerConcurrency : 8;
const workerBudget: any = resolveVerificationWorkerBudget({ env: process.env, fallback, maximum: files.length, label: request.owner || 'System suite' });
const contextKeys: any[] = [...new Set(selectedSuites.flatMap((suite: any) => suite.contexts ?? []))];
const contextPool: any = createTestContextPool({ providers: TEST_CONTEXT_PROVIDERS, env: process.env });
const contexts: any = contextPool.prepareAll(contextKeys);
for (const context of contexts) {
  process.stderr.write(`[buildr-test-context] status=${context.owned ? 'prepared' : 'reused'} id=${context.provider.key} identity=${context.marker.identity} owner=${request.owner || 'all'} prepareDurationMs=${context.prepareDurationMs} workerBudget=${workerBudget}\n`);
}
const contextEnvironment: any = contextPool.environment();
const taskContext: any = contexts.find((context: any) => context.provider.key === TASK_LIFECYCLE_CONTEXT_KEY);

let result: any = null;
let cleanupError: any = null;
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
    const cleanup: any = contextPool.cleanup();
    for (const context of contexts) process.stderr.write(`[buildr-test-context] status=${cleanup.status} id=${context.provider.key} identity=${context.marker.identity} owner=${request.owner || 'all'}\n`);
  } catch (error: any) {
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
