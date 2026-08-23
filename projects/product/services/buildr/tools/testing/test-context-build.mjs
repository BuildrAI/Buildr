#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = path.join(serviceRoot, 'tsconfig.test-context.json');
const target = path.join(serviceRoot, 'package/targets/test-context');
const tsc = path.join(serviceRoot, 'node_modules/typescript/bin/tsc');

function runCompiler(outDir) {
  const result = spawnSync(process.execPath, [tsc, '--project', config, '--outDir', outDir], {
    cwd: serviceRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

function inventory(root, relative = '') {
  const current = relative ? path.join(root, relative) : root;
  if (!fs.statSync(current, { throwIfNoEntry: false })?.isDirectory()) return [];
  return fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const child = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) return inventory(root, child);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`test_context_projection_invalid: unsupported generated entry ${child}`);
    const bytes = fs.readFileSync(path.join(root, child));
    return [{ path: child.split(path.sep).join('/'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
  });
}

const operation = process.argv[2] ?? 'check';
if (!['generate', 'check'].includes(operation)) throw new Error(`Unknown Test Context build operation: ${operation}`);

if (operation === 'generate') {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  runCompiler(target);
  process.stdout.write(`Generated ${inventory(target).length} Test Context runtime files.\n`);
} else {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-test-context-check-'));
  try {
    runCompiler(temporaryRoot);
    const expected = inventory(temporaryRoot);
    const actual = inventory(target);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const actualMap = new Map(actual.map((item) => [item.path, item.sha256]));
      const expectedMap = new Map(expected.map((item) => [item.path, item.sha256]));
      const drift = [...new Set([...actualMap.keys(), ...expectedMap.keys()])].sort().filter((file) => actualMap.get(file) !== expectedMap.get(file));
      throw new Error(`test_context_projection_drift: ${drift.join(', ') || 'generated inventory mismatch'}`);
    }
    process.stdout.write(`Test Context runtime projection is current (${actual.length} files).\n`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
