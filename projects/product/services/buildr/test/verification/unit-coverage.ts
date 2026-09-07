#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function optionValue(args: any, name: any): any  {
  const index: any = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}

export function summarizeLcov(content: any): any  {
  const files: any[] = [];
  let current: any = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('SF:')) current = { path: line.slice(3), lines: [], functions: [], branches: [] };
    else if (!current) continue;
    else if (line.startsWith('DA:')) {
      const [, hits]: any = line.slice(3).split(',');
      current.lines.push(Number(hits));
    } else if (line.startsWith('FNDA:')) {
      const [hits]: any = line.slice(5).split(',');
      current.functions.push(Number(hits));
    } else if (line.startsWith('BRDA:')) {
      const [, , , hits]: any = line.slice(5).split(',');
      current.branches.push(hits === '-' ? 0 : Number(hits));
    } else if (line === 'end_of_record') {
      if (current.path.startsWith('src/')) files.push(current);
      current = null;
    }
  }

  const metric: any = (field: any) => {
    const values: any = files.flatMap((file: any) => file[field]);
    const covered: any = values.filter((hits: any) => hits > 0).length;
    return { covered, total: values.length, percent: values.length === 0 ? 100 : Number(((covered / values.length) * 100).toFixed(2)) };
  };
  return {
    schemaVersion: 'buildr.unit-coverage/v1',
    scope: 'test/unit/*.test.ts',
    files: files.map((file: any) => file.path).sort(),
    lines: metric('lines'),
    branches: metric('branches'),
    functions: metric('functions'),
  };
}

export function runUnitCoverage(args: any = process.argv.slice(2)): any  {
  if (args.includes('--help')) {
    process.stdout.write('Usage: npm run coverage:unit -- [--summary <path>]\n');
    return 0;
  }
  const unknown: any = args.filter((arg: any, index: any) => arg !== '--summary' && args[index - 1] !== '--summary');
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);

  const temporaryRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-unit-coverage-'));
  const lcovPath: any = path.join(temporaryRoot, 'unit.lcov');
  try {
    const testFiles: any = fs.readdirSync(path.join(productRoot, 'test', 'unit'))
      .filter((name: any) => name.endsWith('.test.ts'))
      .sort()
      .map((name: any) => `test/unit/${name}`);
    const result: any = spawnSync(process.execPath, [
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

    const summary: any = summarizeLcov(fs.readFileSync(lcovPath, 'utf8'));
    const summaryPath: any = optionValue(args, '--summary');
    if (summaryPath) {
      const absolute: any = path.resolve(productRoot, summaryPath);
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
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
