import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createExactNodeExecutionEnvironment } from '../../../src/infrastructure/process.ts';
import { loadCandidatePackageAdapter } from '../package-adapter.ts';
import { runPackageSmoke } from './package-smoke.ts';

// Invoked by the existing isolated-workspace runner; never emits release proof.
const isolatedRoot = process.env.BUILDR_SMOKE_ROOT;
assert.ok(isolatedRoot && process.env.BUILDR_SMOKE_WORKSPACE_ROOT, 'Use the isolated workspace runner');
const productRoot = path.resolve(import.meta.dirname, '../../..');
const exact = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, requireNpm: true, minimumVersion: '24.15.0' });
const artifactDirectory = path.join(isolatedRoot, 'development-package');
const started = performance.now();
const adapter = await loadCandidatePackageAdapter();
await adapter.create(productRoot, artifactDirectory, { npmExecutable: exact.npmExecutable! });
console.log(`[development-package-smoke] build-and-pack ${Math.round(performance.now() - started)}ms`);
const report = await runPackageSmoke({ artifactDirectory, output: path.join(isolatedRoot, 'package-smoke.json'), development: true });
console.log(JSON.stringify(report));
process.exitCode = report.status === 'passed' ? 0 : 1;
