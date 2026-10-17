import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  assertFrozenCandidateCheckout, candidateDeferredArtifactIds, candidateDependencyInputsIdentity, createCandidateDeferredPlan,
  readCandidateArtifactImports, readCandidateDeferredPlan,
} from '../verification/candidate-artifact-reuse.ts';
import { resolveCandidateExecutionContext } from '../verification/candidate-ci-evidence.ts';

const hash = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const context = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), purpose: 'candidate' };
const descriptor = { id: 'runtime-macos', kind: 'shard', runner: 'macos', requiresArtifact: true,
  platformScope: { kind: 'platform', runners: ['macos'] }, steps: [{ id: 'release-tarball-smoke' }] };

test('artifact directory import reads original evidence and does not adopt aggregate claims', t => {
  const original = { schemaVersion: 'buildr.candidate-ci-evidence/v2', kind: 'shard', id: 'runtime-macos',
    ...context, workflow: null, artifact: { sourceCommit: context.sourceCommit, sha256: 'c'.repeat(64) } };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'candidate-ci-evidence-local.json'), JSON.stringify(original));
  fs.writeFileSync(path.join(root, 'candidate-ci-aggregate.json'), JSON.stringify({ status: 'passed' }));
  assert.deepEqual(readCandidateArtifactImports(root), [original]);
});

test('deferred plan contains common and the local platform only and remains bound to source and workflow', t => {
  const descriptors = [descriptor, { ...descriptor, id: 'runtime-windows', runner: 'windows' },
    { ...descriptor, id: 'common', platformScope: { kind: 'common', runners: [] } },
    { ...descriptor, id: 'producer', producesArtifact: true }];
  assert.deepEqual(candidateDeferredArtifactIds(descriptors, 'macos'), ['common', 'runtime-macos']);
  assert.deepEqual(candidateDeferredArtifactIds(descriptors, 'windows'), ['common', 'runtime-windows']);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-deferred-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workflow = { runId: '42', runAttempt: '1' }, registryIdentity = hash('registry');
  const plan = createCandidateDeferredPlan({ ...context, registryIdentity, workflow, localRunner: 'macos', deferredIds: ['runtime-macos'] });
  fs.writeFileSync(path.join(root, 'candidate-ci-deferred-plan.json'), JSON.stringify(plan));
  assert.deepEqual(readCandidateDeferredPlan(root, context, registryIdentity, workflow), ['runtime-macos']);
  assert.deepEqual(readCandidateDeferredPlan(root, context, registryIdentity, { ...workflow, runAttempt: '2' }, descriptors), ['runtime-macos']);
  assert.throws(() => readCandidateDeferredPlan(root, context, registryIdentity, { ...workflow, runId: '43' }), /controlled execution/);
  assert.throws(() => readCandidateDeferredPlan(root, context, registryIdentity, { ...workflow, runAttempt: '0' }), /controlled execution/);
  const bad = createCandidateDeferredPlan({ ...context, registryIdentity, workflow, localRunner: 'macos', deferredIds: ['runtime-windows'] });
  fs.writeFileSync(path.join(root, 'candidate-ci-deferred-plan.json'), JSON.stringify(bad));
  assert.throws(() => readCandidateDeferredPlan(root, context, registryIdentity, workflow, descriptors), /controlled execution/);
});

test('dependency source identity normalizes checkout aliases and local proof rejects dirty or changed source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-frozen-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'), service = path.join(repo, 'projects/product/services/buildr');
  fs.mkdirSync(service, { recursive: true });
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '--initial-branch=main']);
  fs.writeFileSync(path.join(service, 'package.json'), '{"version":"1.0.0"}\n');
  fs.writeFileSync(path.join(service, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture']);
  const source = git(['rev-parse', 'HEAD']);
  const alias = path.join(root, 'repo-alias'); fs.symlinkSync(repo, alias, 'dir');
  assert.equal(candidateDependencyInputsIdentity(fs.realpathSync(service), source, 'host'), candidateDependencyInputsIdentity(path.join(alias, 'projects/product/services/buildr'), source, 'host'));
  assert.doesNotThrow(() => assertFrozenCandidateCheckout(service, source));
  fs.writeFileSync(path.join(service, 'package.json'), '{"version":"2.0.0"}\n');
  assert.throws(() => assertFrozenCandidateCheckout(service, source), /clean frozen checkout/);
  git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'changed']);
  assert.throws(() => assertFrozenCandidateCheckout(service, source), /exact frozen source/);
});

test('local test-only repair binds its original package without assuming a GitHub identity', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-local-repair-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const service = path.join(repo, 'projects/product/services/buildr');
  fs.mkdirSync(path.join(service, 'test'), { recursive: true });
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (message: string) => { git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', message]); return git(['rev-parse', 'HEAD']); };
  git(['init', '--initial-branch=main']);
  fs.writeFileSync(path.join(service, 'package.json'), '{"version":"1.0.0"}\n');
  const product = commit('product');
  fs.writeFileSync(path.join(service, 'test', 'parity.ts'), 'export const repaired = true;\n');
  const verification = commit('test-only repair');
  const env = { BUILDR_CANDIDATE_PRODUCT_SOURCE: product };
  const local = resolveCandidateExecutionContext(service, verification, env);
  assert.equal(local.sourceCommit, product); assert.equal(local.verificationSource, verification);
  assert.equal(local.sourceBinding.productSource, product); assert.equal(local.sourceBinding.verificationSource, verification);
  for (const identity of [{ GITHUB_RUN_ID: '52' }, { GITHUB_JOB: 'candidate' }, { GITHUB_SHA: product }, { GITHUB_EVENT_NAME: 'pull_request' }]) {
    assert.throws(() => resolveCandidateExecutionContext(service, verification, { ...env, ...identity }), /without GitHub identity/);
  }
  assert.equal(resolveCandidateExecutionContext(service, verification, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }).sourceCommit, product);
  fs.writeFileSync(path.join(service, 'package.json'), '{"version":"2.0.0"}\n');
  const changed = commit('product changed');
  assert.throws(() => resolveCandidateExecutionContext(service, changed, env), /build inputs changed/);
});
