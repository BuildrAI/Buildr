import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createVerificationReuseIdentity, createVerificationReuseStore,
  type VerificationReuseSnapshot, type VerificationReuseStep, type VerificationReuseRecord } from '../verification/verification-reuse.ts';
import { executePlan } from '../verification/plan-runner.ts';

const sha = `sha256-${'a'.repeat(64)}` as const;
const step: VerificationReuseStep = { id: 'fixture-check', executor: { type: 'node', file: 'check.ts' }, reuse: { scope: 'backend' }, dependsOn: [] };
const snapshot: VerificationReuseSnapshot = { productRoot: '/one/checkout', repositoryRoot: '/one', sourceCommit: 'a'.repeat(40), gitIdentity: sha,
  contentIdentities: { backend: sha, 'platform-backend': sha, web: sha, product: sha, repository: sha, plugin: sha, runtime: sha },
  environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0', tools: { 'backend-dependencies': sha }, variablesIdentity: sha } };
function record(): VerificationReuseRecord {
  const identity = createVerificationReuseIdentity(step, snapshot)!;
  return { schemaVersion: 'buildr.verification-source-result/v1', identity, identityAfter: identity.key, cleanup: 'clean', environment: snapshot.environment,
    origin: { kind: 'local', runId: 'source-fixture-1', sourceCommit: snapshot.sourceCommit, startedAt: '2026-10-15T00:00:00.000Z', finishedAt: '2026-10-15T00:00:01.000Z' },
    result: { id: step.id, status: 'passed', exitCode: 0, durationMs: 1000, childOutcome: 'passed', childExitCode: 0, childSignal: null } };
}

test('partial common shards adopt the original other-OS source record while platform checks and revocations stay strict', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-common-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = record();
  const windows = { ...snapshot, environment: { ...snapshot.environment, platform: 'win32', arch: 'x64' } };
  const common = { ...step, platformScope: { kind: 'common', runners: [] } };
  const bundle = { schemaVersion: 'buildr.verification-source-bundle/v1' as const, records: [original] };
  const store = createVerificationReuseStore({ productRoot: '/unused', steps: [common], snapshot: windows,
    env: { BUILDR_VERIFICATION_REUSE_DIR: path.join(root, 'common') }, imports: [bundle], portableImports: true });
  assert.equal(store.lookup(common), original);
  assert.equal(store.lookup(common)?.environment.platform, 'darwin');
  assert.equal(store.lookup(common)?.identity.key, original.identity.key);
  const platform = { ...step, platformScope: { kind: 'platform', runners: ['macos'] } };
  const strict = createVerificationReuseStore({ productRoot: '/unused', steps: [platform], snapshot: windows,
    env: { BUILDR_VERIFICATION_REUSE_DIR: path.join(root, 'platform') }, imports: [bundle], portableImports: true });
  assert.equal(strict.lookup(platform), null);
  const local = createVerificationReuseStore({ productRoot: '/unused', steps: [common], snapshot: windows,
    env: { BUILDR_VERIFICATION_REUSE_DIR: path.join(root, 'local') }, imports: [bundle] });
  assert.equal(local.lookup(common), null);
  store.invalidate(createVerificationReuseIdentity(common, windows)!);
  assert.equal(store.lookup(common), null, 'a local failed generation also revokes imported common proof');
});

test('candidate round runs all groups initially and retries only failures after source and environment edits', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-round-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const emptyPlan = (mode: any): any => ({ scope: { mode }, steps: [], paths: [], delegated: [] });
  const coordinator = (events: any): any => ({
    root: '/verification-coordination',
    async acquire(resources: any, options: any): Promise<any> {
      events.push(['acquire', resources, options]);
      return {
        waitDurationMs: 17,
        async release(): Promise<any> {
          events.push(['release', resources]);
          return resources.map((resource: any) => ({ resource, slot: 0, status: 'released' }));
        },
      };
    },
  });
  const plan = { ...emptyPlan('affected'), runner: process.platform, steps: ['success', 'failure', 'independent'].map(id => ({ id, name: id, dependsOn: [], contexts: [], platformScope: { kind: 'common' } })) };
  const calls: string[] = []; let fail = true;
  const options = { productRoot: process.cwd(), resourceCoordinator: coordinator([]), reuse: false,
    round: { roundId: 'first', output: path.join(root, 'round.json') },
    executorFactory: () => async (step: any) => { calls.push(step.id); const passed = step.id !== 'failure' || !fail; return { id: step.id, status: passed ? 'passed' : 'failed', exitCode: passed ? 0 : 1, durationMs: 1 }; } };
  const first = await executePlan(plan, options);
  assert.equal(first.passed, false); assert.deepEqual([...calls].sort(), ['failure', 'independent', 'success']);
  const original = JSON.parse(JSON.stringify(first.sourceBundle.records.find((record: any) => record.identity.stepId === 'success')));
  fs.writeFileSync(path.join(root, 'source.ts'), 'changed source, assertions and dependencies\n');
  fail = false; calls.length = 0;
  const second = await executePlan({ ...plan, steps: plan.steps.map((step: { id: string; dependsOn: string[]; contexts: string[]; platformScope: { kind: string } }) => ({ ...step, executor: { type: 'changed-recipe' } })) }, { ...options, env: { NODE_OPTIONS: 'changed-environment' } });
  assert.equal(second.passed, true); assert.deepEqual(calls, ['failure']);
  assert.deepEqual(second.sourceBundle.records.find((record: any) => record.identity.stepId === 'success'), original);
  calls.length = 0;
  await executePlan(plan, { ...options, round: { roundId: 'next', output: path.join(root, 'next.json') } });
  assert.equal(calls.length, 3);
});
