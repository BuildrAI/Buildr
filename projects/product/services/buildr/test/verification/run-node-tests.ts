#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { resolveNodeTestFiles } from './test-files.ts';
import { resolveVerificationWorkerBudget } from './worker-budget.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

try {
  const files: any = resolveNodeTestFiles(productRoot, process.argv.slice(2), 'managed node-test glob');
  const workerBudget = resolveVerificationWorkerBudget({ env: process.env, fallback: 2, maximum: files.length, label: 'Managed Node test suite' });
  const diagnostics = process.env.BUILDR_DIAGNOSTICS_OUTPUT;
  const reporters: string[] = [];
  if (diagnostics) {
    fs.mkdirSync(diagnostics, { recursive: true });
    reporters.push('--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', `--test-reporter-destination=${path.join(diagnostics, `node-tests-${process.pid}.tap`)}`);
  }
  process.stderr.write(`[managed-node-tests] files=${files.length} workerBudget=${workerBudget}\n`);
  const result: any = spawnCommandSync(process.execPath, ['--test', `--test-concurrency=${workerBudget}`, ...reporters, ...files], { cwd: productRoot, stdio: 'inherit' });
  if (result.error || result.status !== 0) process.stderr.write(`${JSON.stringify({ phase: 'node-test-process', exitCode: result.status, signal: result.signal, error: result.error?.message })}\n`);
  process.exitCode = result.status ?? 1;
} catch (error: any) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
