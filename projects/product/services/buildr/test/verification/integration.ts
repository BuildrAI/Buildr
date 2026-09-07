#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { resolveVerificationWorkerBudget } from './worker-budget.ts';
import { INTEGRATION_GENERAL_EXCLUDED_FILES } from './registry.ts';

const productRoot: any = path.resolve(import.meta.dirname, '../..');
const integrationRoot: any = path.join(productRoot, 'test', 'integration');
const excludedFromGeneral: any = new Set(INTEGRATION_GENERAL_EXCLUDED_FILES.map((file: any) => path.basename(file)));

function parseArgs(args: any): any  {
  if (args.length === 2 && args[0] === '--suite' && args[1] === 'general') return 'general';
  throw new Error('Usage: node test/verification/integration.ts --suite general');
}

const suite: any = parseArgs(process.argv.slice(2));
const files: any = fs.readdirSync(integrationRoot)
  .filter((name: any) => name.endsWith('.test.ts') && !excludedFromGeneral.has(name))
  .sort()
  .map((name: any) => `./test/integration/${name}`);

if (suite !== 'general' || files.length === 0) throw new Error('Integration general suite has no test files.');
const workerBudget: any = resolveVerificationWorkerBudget({ env: process.env, fallback: 6, maximum: files.length, label: 'Integration general suite' });
process.stderr.write(`[buildr-integration-suite] suite=${suite} files=${files.length} workerBudget=${workerBudget}\n`);
const result: any = spawnSync(process.execPath, ['--test', `--test-concurrency=${workerBudget}`, '--test-reporter=dot', ...files], { cwd: productRoot, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
