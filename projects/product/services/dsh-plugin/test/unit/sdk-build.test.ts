import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findReusableSourceSdk } from '../../tools/prepare-source-sdk.ts';
import { buildKind, planBuildCleanup, type BuildEntry } from '../../tools/sdk-build.ts';

test('owned build artifacts classify by prefix and never claim unrelated names', () => {
  assert.equal(buildKind('dsh-release-sdk-pnpm-store'), 'dependency-store');
  assert.equal(buildKind('dsh-source-sdk-1I5ZQd'), 'source-sdk');
  assert.equal(buildKind('dsh-release-sdk-OpzzjE'), 'release-sdk');
  assert.equal(buildKind('dsh-plugin-checks-uf6Tkw'), 'check-output');
  assert.equal(buildKind('dsh-plugin-compile-fbNHQK'), 'compile-stage');
  for (const name of ['node_modules', 'dsh-source-sdk', 'notes', '.git']) assert.equal(buildKind(name), 'other', name);
});

test('cleanup keeps the newest entry of every kind and reports the rest', () => {
  const entries: BuildEntry[] = [
    { name: 'dsh-source-sdk-old', kind: buildKind('dsh-source-sdk-old'), mtimeMs: 1 },
    { name: 'dsh-source-sdk-new', kind: buildKind('dsh-source-sdk-new'), mtimeMs: 3 },
    { name: 'dsh-release-sdk-old', kind: buildKind('dsh-release-sdk-old'), mtimeMs: 2 },
    { name: 'dsh-release-sdk-new', kind: buildKind('dsh-release-sdk-new'), mtimeMs: 4 },
    { name: 'dsh-release-sdk-pnpm-store', kind: buildKind('dsh-release-sdk-pnpm-store'), mtimeMs: 0 },
    { name: 'notes', kind: buildKind('notes'), mtimeMs: 5 },
  ];
  const plan = planBuildCleanup(entries, 1);
  assert.deepEqual(plan.keep, ['dsh-release-sdk-new', 'dsh-release-sdk-pnpm-store', 'dsh-source-sdk-new']);
  assert.deepEqual(plan.remove, ['dsh-release-sdk-old', 'dsh-source-sdk-old']);
  assert.deepEqual(plan.unattributed, ['notes']);
  assert.equal(plan.remove.includes('dsh-release-sdk-pnpm-store'), false, 'the only dependency store stays until a newer one exists');
  assert.deepEqual(planBuildCleanup(entries, 2).remove, []);
  assert.deepEqual(planBuildCleanup(entries, 0).remove, ['dsh-release-sdk-new', 'dsh-release-sdk-old', 'dsh-release-sdk-pnpm-store', 'dsh-source-sdk-new', 'dsh-source-sdk-old']);
  assert.throws(() => planBuildCleanup(entries, -1));
  assert.throws(() => planBuildCleanup(entries, 0.5));
});

test('an empty build root reuses nothing instead of failing preparation', () => {
  const serviceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sdk-reuse-'));
  fs.mkdirSync(path.join(serviceRoot, 'build'));
  const manifest = path.resolve(import.meta.dirname, '../../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json');
  try {
    assert.equal(findReusableSourceSdk(manifest, serviceRoot), undefined);
  } finally {
    fs.rmSync(serviceRoot, { recursive: true, force: true });
  }
});
