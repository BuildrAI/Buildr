#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { INTEGRATION_GENERAL_EXCLUDED_FILES, INTEGRATION_PRIMARY_SLICES } from './registry.ts';
import { auditNodeTestFileOwnership } from './test-files.ts';

const productRoot: any = path.resolve(import.meta.dirname, '../..');

export function runIntegrationSuite({ suite, inventory, run = spawnSync }: any): number {
  if (!['general', 'all'].includes(suite)) throw new Error('Usage: node test/verification/integration.ts --suite <general|all>');
  const files = inventory ?? fs.readdirSync(path.join(productRoot, 'test/integration'))
    .filter(file => file.endsWith('.test.ts')).map(file => `test/integration/${file}`);
  const sourceFiles = files.filter((file: string) => !INTEGRATION_GENERAL_EXCLUDED_FILES.includes(file)).sort();
  const claims = suite === 'all'
    ? [...INTEGRATION_PRIMARY_SLICES, { id: 'artifact-fixtures', files: INTEGRATION_GENERAL_EXCLUDED_FILES }]
    : INTEGRATION_PRIMARY_SLICES;
  const coverage = auditNodeTestFileOwnership(suite === 'all' ? files : sourceFiles, claims);
  if (!coverage.ok) throw new Error(`Integration suite ownership is incomplete: ${JSON.stringify(coverage.findings)}`);
  // All source owners share the normal scheduler, including the exclusive DTO
  // build boundary. Artifact fixtures start only after every source owner passes.
  const sourceResult = run(process.execPath, [path.join(import.meta.dirname, 'focus.ts'), ...INTEGRATION_PRIMARY_SLICES.map((slice: any) => slice.id)], {
    cwd: productRoot, stdio: 'inherit', env: process.env,
  });
  if (sourceResult.error) throw sourceResult.error;
  if (sourceResult.status !== 0) return sourceResult.status ?? 1;
  if (suite === 'general') return 0;
  const artifactResult = run(process.execPath, [path.join(import.meta.dirname, 'run-node-tests.ts'), ...INTEGRATION_GENERAL_EXCLUDED_FILES], {
    cwd: productRoot, stdio: 'inherit', env: process.env,
  });
  if (artifactResult.error) throw artifactResult.error;
  return artifactResult.status ?? 1;
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--suite') throw new Error('Usage: node test/verification/integration.ts --suite <general|all>');
  process.exitCode = runIntegrationSuite({ suite: args[1] });
}
