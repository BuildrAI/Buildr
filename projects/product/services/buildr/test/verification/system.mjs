#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const productRoot = path.resolve(import.meta.dirname, '../..');
const systemRoot = path.join(productRoot, 'test', 'system');
const files = fs.readdirSync(systemRoot)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(systemRoot, name));

if (files.length === 0) throw new Error(`No System tests found in ${systemRoot}.`);

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=14', ...files], {
  cwd: productRoot,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(`[buildr-system-tests] node:test failed: exitCode=${result.status ?? 'none'} signal=${result.signal ?? 'none'} files=${files.length}\n`);
  process.exitCode = result.status ?? 1;
}
