#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { createOwnedArtifactStaging, inventoryGeneratedArtifact } from '../build/generated-artifacts.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config: any = path.join(serviceRoot, 'tsconfig.test-context.json');
const target: any = path.join(serviceRoot, 'package/targets/test-context');
const tsc: any = path.join(serviceRoot, 'node_modules/typescript/bin/tsc');

function runCompiler(outDir: any): any  {
  const result: any = spawnSync(process.execPath, [tsc, '--project', config, '--outDir', outDir], {
    cwd: serviceRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const error: Error & Record<string, any> = new Error(`test_context_build_failed: ${(result.stderr || result.stdout || '').trim()}`);
    error.code = 'test_context_build_failed';
    throw error;
  }
}

export function buildTestContext(outDir: any = target): any  {
  const resolved: any = path.resolve(outDir);
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
  runCompiler(resolved);
  return { root: resolved, files: inventoryGeneratedArtifact(resolved) };
}

function main(): any  {
  const operation: any = process.argv[2] ?? 'check';
  if (!['generate', 'check'].includes(operation)) throw new Error(`Unknown Test Context build operation: ${operation}`);
  const outputIndex: any = process.argv.indexOf('--output');
  const output: any = outputIndex === -1 ? target : process.argv[outputIndex + 1];
  if (!output || output.startsWith('--')) throw new Error('--output requires a directory.');
  if (operation === 'generate') {
    const result: any = buildTestContext(output);
    process.stdout.write(`Generated ${result.files.length} Test Context runtime files at ${result.root}.\n`);
    return;
  }
  const left: any = createOwnedArtifactStaging(os.tmpdir(), 'buildr-test-context-left-');
  const right: any = createOwnedArtifactStaging(os.tmpdir(), 'buildr-test-context-right-');
  try {
    const expected: any = buildTestContext(path.join(left.root, 'output')).files;
    const repeated: any = buildTestContext(path.join(right.root, 'output')).files;
    if (JSON.stringify(expected) !== JSON.stringify(repeated)) throw new Error('test_context_generation_nondeterministic');
    const actual: any = inventoryGeneratedArtifact(output);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const actualMap: any = new Map(actual.map((item: any) => [item.path, item.sha256]));
      const expectedMap: any = new Map(expected.map((item: any) => [item.path, item.sha256]));
      const drift: any = [...new Set([...actualMap.keys(), ...expectedMap.keys()])].sort().filter((file: any) => actualMap.get(file) !== expectedMap.get(file));
      throw new Error(`test_context_projection_drift: ${drift.join(', ') || 'generated inventory mismatch'}`);
    }
    process.stdout.write(`Test Context runtime projection is current (${actual.length} files).\n`);
  } finally {
    left.cleanup();
    right.cleanup();
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
