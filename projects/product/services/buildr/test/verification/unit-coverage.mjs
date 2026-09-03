#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}

export function summarizeLcov(content) {
  const files = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('SF:')) current = { path: line.slice(3), lines: [], functions: [], branches: [] };
    else if (!current) continue;
    else if (line.startsWith('DA:')) {
      const [, hits] = line.slice(3).split(',');
      current.lines.push(Number(hits));
    } else if (line.startsWith('FNDA:')) {
      const [hits] = line.slice(5).split(',');
      current.functions.push(Number(hits));
    } else if (line.startsWith('BRDA:')) {
      const [, , , hits] = line.slice(5).split(',');
      current.branches.push(hits === '-' ? 0 : Number(hits));
    } else if (line === 'end_of_record') {
      if (current.path.startsWith('src/')) files.push(current);
      current = null;
    }
  }

  const metric = (field) => {
    const values = files.flatMap((file) => file[field]);
    const covered = values.filter((hits) => hits > 0).length;
    return { covered, total: values.length, percent: values.length === 0 ? 100 : Number(((covered / values.length) * 100).toFixed(2)) };
  };
  return {
    schemaVersion: 'buildr.unit-coverage/v1',
    scope: 'test/unit/*.test.mjs',
    files: files.map((file) => file.path).sort(),
    lines: metric('lines'),
    branches: metric('branches'),
    functions: metric('functions'),
  };
}

export function runUnitCoverage(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    process.stdout.write('Usage: npm run coverage:unit -- [--summary <path>]\n');
    return 0;
  }
  const unknown = args.filter((arg, index) => arg !== '--summary' && args[index - 1] !== '--summary');
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-unit-coverage-'));
  const lcovPath = path.join(temporaryRoot, 'unit.lcov');
  try {
    const testFiles = fs.readdirSync(path.join(productRoot, 'test', 'unit'))
      .filter((name) => name.endsWith('.test.mjs'))
      .sort()
      .map((name) => `test/unit/${name}`);
    const result = spawnSync(process.execPath, [
      '--experimental-test-coverage',
      '--test',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=lcov',
      `--test-reporter-destination=${lcovPath}`,
      ...testFiles,
    ], { cwd: productRoot, encoding: 'utf8' });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) return result.status ?? 1;

    const summary = summarizeLcov(fs.readFileSync(lcovPath, 'utf8'));
    const summaryPath = optionValue(args, '--summary');
    if (summaryPath) {
      const absolute = path.resolve(productRoot, summaryPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, `${JSON.stringify(summary, null, 2)}\n`);
      process.stdout.write(`Unit coverage summary: ${absolute}\n`);
    }
    process.stdout.write(`Unit coverage: lines ${summary.lines.percent}% | branches ${summary.branches.percent}% | functions ${summary.functions.percent}%\n`);
    return 0;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = runUnitCoverage();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
