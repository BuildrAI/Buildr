#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.mjs';
import { resolveNodeTestFiles } from './test-files.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

try {
  const files = resolveNodeTestFiles(productRoot, process.argv.slice(2), 'managed node-test glob');
  const result = spawnCommandSync(process.execPath, ['--test', ...files], { cwd: productRoot, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
