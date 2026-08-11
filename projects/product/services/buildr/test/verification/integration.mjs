#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { resolveVerificationWorkerBudget } from './worker-budget.mjs';

const productRoot = path.resolve(import.meta.dirname, '../..');
const integrationRoot = path.join(productRoot, 'test', 'integration');
const excludedFromGeneral = new Set([
  'task-development-application.test.mjs',
  'task-finish-delivery-remote.test.mjs',
  'task-finish-retained-activation.test.mjs',
  'task-finish-retained-cleanup.test.mjs',
  'task-finish-run.test.mjs',
]);

function parseArgs(args) {
  if (args.length === 2 && args[0] === '--suite' && args[1] === 'general') return 'general';
  throw new Error('Usage: node test/verification/integration.mjs --suite general');
}

const suite = parseArgs(process.argv.slice(2));
const files = fs.readdirSync(integrationRoot)
  .filter((name) => name.endsWith('.test.mjs') && !excludedFromGeneral.has(name))
  .sort()
  .map((name) => path.join(integrationRoot, name))
  .map((file) => process.platform === 'win32' ? pathToFileURL(file).href : file);

if (suite !== 'general' || files.length === 0) throw new Error('Integration general suite has no test files.');
const workerBudget = resolveVerificationWorkerBudget({ env: process.env, fallback: 6, maximum: files.length, label: 'Integration general suite' });
process.stderr.write(`[buildr-integration-suite] suite=${suite} files=${files.length} workerBudget=${workerBudget}\n`);
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${workerBudget}`, ...files], { cwd: productRoot, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
