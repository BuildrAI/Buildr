import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(import.meta.dirname, '..');

export function logicTestWorkerBudget(value = process.env.BUILDR_VERIFICATION_WORKER_BUDGET) {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/u.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error('Buildr Web logic tests require a positive integer worker budget.');
  }
  return Number(value);
}

export function logicTestArguments(root = serviceRoot, budget = logicTestWorkerBudget()) {
  const files = fs.readdirSync(path.join(root, 'test')).filter(file => file.endsWith('.test.mjs')).sort();
  if (files.length === 0) throw new Error('Buildr Web logic test suite is empty.');
  return ['--test', `--test-concurrency=${budget}`, ...files.map(file => path.join(root, 'test', file))];
}

let invokedAsMain = false;
try { invokedAsMain = Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch {}
if (invokedAsMain) {
  try {
    const result = spawnSync(process.execPath, logicTestArguments(), { cwd: serviceRoot, env: process.env, stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
