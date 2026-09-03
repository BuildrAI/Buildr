#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { createOwnedArtifactStaging, inventoryGeneratedArtifact } from '../build/generated-artifacts.ts';

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
    const error = new Error(`test_context_build_failed: ${(result.stderr || result.stdout || '').trim()}`);
    error.code = 'test_context_build_failed';
    throw error;
  }
}

export function buildTestContext(outDir = target) {
  const resolved = path.resolve(outDir);
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
  runCompiler(resolved);
  return { root: resolved, files: inventoryGeneratedArtifact(resolved) };
}

function main() {
  const operation = process.argv[2] ?? 'check';
  if (!['generate', 'check'].includes(operation)) throw new Error(`Unknown Test Context build operation: ${operation}`);
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex === -1 ? target : process.argv[outputIndex + 1];
  if (!output || output.startsWith('--')) throw new Error('--output requires a directory.');
  if (operation === 'generate') {
    const result = buildTestContext(output);
    process.stdout.write(`Generated ${result.files.length} Test Context runtime files at ${result.root}.\n`);
    return;
  }
  const left = createOwnedArtifactStaging(os.tmpdir(), 'buildr-test-context-left-');
  const right = createOwnedArtifactStaging(os.tmpdir(), 'buildr-test-context-right-');
  try {
    const expected = buildTestContext(path.join(left.root, 'output')).files;
    const repeated = buildTestContext(path.join(right.root, 'output')).files;
    if (JSON.stringify(expected) !== JSON.stringify(repeated)) throw new Error('test_context_generation_nondeterministic');
    const actual = inventoryGeneratedArtifact(output);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const actualMap = new Map(actual.map((item) => [item.path, item.sha256]));
      const expectedMap = new Map(expected.map((item) => [item.path, item.sha256]));
      const drift = [...new Set([...actualMap.keys(), ...expectedMap.keys()])].sort().filter((file) => actualMap.get(file) !== expectedMap.get(file));
      throw new Error(`test_context_projection_drift: ${drift.join(', ') || 'generated inventory mismatch'}`);
    }
    process.stdout.write(`Test Context runtime projection is current (${actual.length} files).\n`);
  } finally {
    left.cleanup();
    right.cleanup();
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
