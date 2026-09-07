#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { resolveNodeTestFiles } from './test-files.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

try {
  const files: any = resolveNodeTestFiles(productRoot, process.argv.slice(2), 'managed node-test glob');
  const result: any = spawnCommandSync(process.execPath, ['--test', ...files], { cwd: productRoot, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} catch (error: any) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
