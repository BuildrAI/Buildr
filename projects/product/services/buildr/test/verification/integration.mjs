#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { resolveVerificationWorkerBudget } from './worker-budget.mjs';
import { INTEGRATION_GENERAL_EXCLUDED_FILES } from './registry.mjs';

const productRoot = path.resolve(import.meta.dirname, '../..');
const integrationRoot = path.join(productRoot, 'test', 'integration');
const excludedFromGeneral = new Set(INTEGRATION_GENERAL_EXCLUDED_FILES.map((file) => path.basename(file)));

function parseArgs(args) {
  if (args.length === 2 && args[0] === '--suite' && args[1] === 'general') return 'general';
  throw new Error('Usage: node test/verification/integration.mjs --suite general');
}

const suite = parseArgs(process.argv.slice(2));
const files = fs.readdirSync(integrationRoot)
  .filter((name) => name.endsWith('.test.mjs') && !excludedFromGeneral.has(name))
  .sort()
  .map((name) => `./test/integration/${name}`);

if (suite !== 'general' || files.length === 0) throw new Error('Integration general suite has no test files.');
const workerBudget = resolveVerificationWorkerBudget({ env: process.env, fallback: 6, maximum: files.length, label: 'Integration general suite' });
process.stderr.write(`[buildr-integration-suite] suite=${suite} files=${files.length} workerBudget=${workerBudget}\n`);
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${workerBudget}`, '--test-reporter=dot', ...files], { cwd: productRoot, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
