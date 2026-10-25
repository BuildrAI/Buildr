import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { resolveVerificationWorkerBudget } from '../../test/verification/worker-budget.ts';

/** Execute exactly the service-owned file selection supplied by the project catalogue. */
const selectors = process.argv.slice(2);
if (selectors.length === 0) throw new Error('Provide at least one service-relative test selector.');
const files = [...new Set(selectors.flatMap(selector => fs.globSync(selector, { cwd: process.cwd() })))].sort();
if (files.length === 0) throw new Error(`No tests matched: ${selectors.join(', ')}`);
const workers = Math.min(files.length, resolveVerificationWorkerBudget({ fallback: 1, maximum: Number.MAX_SAFE_INTEGER, label: 'Service tests' }));
const args = ['--test', `--test-concurrency=${workers}`, ...files.map(file => path.resolve(file))];
const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
