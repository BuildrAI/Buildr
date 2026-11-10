import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createVerificationReuseIdentity, createVerificationReuseStore,
  type VerificationReuseSnapshot, type VerificationReuseStep, type VerificationReuseRecord } from '../verification/verification-reuse.ts';
import { createCandidateRoundExecution } from '../verification/candidate-round.ts';
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

test('real Node files recover inside a candidate group and shared source changes invalidate every file', async t => {
  const { spawnSync } = await import('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-files-real-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = path.join(root, 'projects/product/services/buildr');
  const write = (file: string, text: string) => { const target = path.join(productRoot, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
  write('package.json', '{"type":"module"}\n');
  write('.gitignore', 'node_modules/\nbuild/\n');
  write('node_modules/fixture/package.json', '{"name":"fixture","version":"1.0.0"}');
  write('src/shared.ts', 'export const value = 1;\n');
  write('test/integration/a.test.ts', "import test from 'node:test'; import assert from 'node:assert/strict'; import { value } from '../../src/shared.ts'; test('a', () => assert.equal(value, 1));\n");
  const testB = (expected: number) => `import test from 'node:test'; import assert from 'node:assert/strict'; import { value } from '../../src/shared.ts'; test('b', () => assert.equal(value, ${expected}));\n`;
  write('test/integration/b.test.ts', testB(2));
  for (const args of [['init', '--initial-branch=main'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture']]) {
    const git = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(git.status, 0, git.stderr);
  }
  const plan = { status: 'ready', paths: [], steps: [{ id: 'fixture-files', name: 'Real files', dependsOn: [], contexts: [],
    executor: { type: 'node-test', files: ['test/integration/*.test.ts'] }, platformScope: { kind: 'common' },
    reuse: { scope: 'backend', inputMode: 'runtime-check' }, timeoutMs: 10_000 }] };
  const options = { productRoot, projectRoot: path.resolve(productRoot, '../..'), reuse: false, runId: 'first-real',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    diagnosticsDirectory: path.join(productRoot, 'build/diagnostics'), round: { roundId: 'real', output: path.join(productRoot, 'build/round.json') } };
  const first = await executePlan(plan, options);
  assert.equal(first.passed, false);
  assert.equal(first.results[0].roundFiles.length, 1, first.results[0].stderr);
  write('test/integration/b.test.ts', testB(1));
  const second = await executePlan(plan, { ...options, runId: 'repair-real' });
  assert.equal(second.passed, true, JSON.stringify(second.results));
  assert.equal(second.results[0].executedFiles, 1); assert.equal(second.results[0].reusedFiles, 1);
  assert.equal(second.results[0].roundFiles[0].origin.runId, 'first-real');
  write('src/shared.ts', 'export const value = 2;\n');
  const third = await executePlan(plan, { ...options, runId: 'changed-shared' });
  assert.equal(third.passed, false);
  assert.equal(third.results[0].executedFiles, 2); assert.equal(third.results[0].reusedFiles, 0);
  assert.equal(third.results[0].roundFiles.length, 0);
  assert.ok(third.timings.preparationMs >= 0 && third.timings.executionMs >= 0 && third.timings.reuseFinalizationMs >= 0);
});

test('round file coverage adopts only matching complete files and retains original provenance', async t => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'round-file-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.test.ts'), 'a');
  fs.writeFileSync(path.join(root, 'b.test.ts'), 'b');
  const sha = `sha256-${'a'.repeat(64)}`;
  const step = { id: 'group', executor: { type: 'node-test', files: ['*.test.ts'] }, reuse: { scope: 'backend', inputMode: 'runtime-check' }, platformScope: { kind: 'common' } };
  let changed = new Set<string>();
  const dependencies = { collectSnapshot: ({ steps }: any) => ({
    environment: { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node,
      variablesIdentity: sha, tools: { 'backend-dependencies': sha } },
    stepInputs: Object.fromEntries(steps.map((file: any) => [file.id, { contentIdentity: changed.has(file.id) ? `sha256-${'b'.repeat(64)}` : sha, recipeIdentity: sha }])),
  }) };
  const plan = { steps: [step] };
  const output = path.join(root, 'round.json');
  const options = { productRoot: root, round: { roundId: 'files', output }, runId: 'first' };
  const event = (file: string, status = 'passed') => '[buildr-integration-progress] ' + JSON.stringify({ entryFile: file, status, durationMs: 3 }) + '\n';
  const child = (stderr: string, status = 'passed', extra = {}) => ({ status, exitCode: status === 'passed' ? 0 : 1, durationMs: 10, stderr, childSignal: null, processCleanup: { status: 'clean' }, ...extra });
  const first = createCandidateRoundExecution(plan, options, dependencies);
  const result = await first.executeFiles(step, async () => child(event('a.test.ts') + event('b.test.ts', 'failed'), 'failed'), {});
  result.id = step.id;
  const log = first.finish([result], true);
  assert.equal(log.records[0].result.roundFiles.length, 1);
  const original = structuredClone(log.records[0].result.roundFiles[0]);
  const next = createCandidateRoundExecution(plan, { ...options, runId: 'second' }, dependencies);
  const calls: string[][] = [];
  const repaired = await next.executeFiles(step, async (selected: any) => { calls.push(selected.executor.files); return child(event('b.test.ts')); }, {});
  repaired.id = step.id;
  assert.deepEqual(calls, [['b.test.ts']]);
  assert.equal(repaired.reusedFiles, 1);
  const complete = next.finish([repaired], true);
  assert.deepEqual(complete.records[0].result.roundFiles[0], original);
  assert.equal(complete.records[0].result.status, 'passed');
  assert.equal(createCandidateRoundExecution(plan, options, dependencies).hits.has('group'), true);
  // New discovery cannot inherit the parent's old group success.
  fs.writeFileSync(path.join(root, 'c.test.ts'), 'c');
  const added = createCandidateRoundExecution(plan, options, dependencies);
  assert.equal(added.hits.has('group'), false);
  await added.executeFiles(step, async (selected: any) => { assert.deepEqual(selected.executor.files, ['c.test.ts']); return child(event('c.test.ts')); }, {});
  changed = new Set(['group:a.test.ts', 'group:b.test.ts', 'group:c.test.ts']);
  const invalid = createCandidateRoundExecution(plan, options, dependencies);
  await invalid.executeFiles(step, async (selected: any) => { assert.equal(selected.executor.files.length, 3); return child(''); }, {});
  changed.clear();
  const explicit = createCandidateRoundExecution(plan, { ...options, round: { ...options.round, invalidStepIds: ['group'] } }, dependencies);
  await explicit.executeFiles(step, async (selected: any) => { assert.equal(selected.executor.files.length, 3); return child(''); }, {});
  const drift = createCandidateRoundExecution(plan, options, dependencies);
  const drifting = await drift.executeFiles(step, async () => {
    changed = new Set(['group:a.test.ts', 'group:b.test.ts', 'group:c.test.ts']);
    return child(event('c.test.ts'));
  }, {});
  drifting.id = step.id;
  assert.equal(drift.finish([drifting], true).records[0].result.roundFiles.length, 0, 'input drift revokes file applicability, including prior files');
  changed.clear(); fs.writeFileSync(output, JSON.stringify(complete));
  const controller = new AbortController();
  const interrupted = createCandidateRoundExecution(plan, { ...options, signal: controller.signal }, dependencies);
  const interruptedResult = await interrupted.executeFiles(step, async () => { controller.abort(); return child(event('c.test.ts')); }, {});
  interruptedResult.id = step.id;
  assert.equal(interrupted.finish([interruptedResult], true).records[0].result.roundFiles.length, 2, 'cancellation cannot preserve new file passes');
  fs.writeFileSync(output, JSON.stringify(complete));
  for (const [stderr, clean, extra] of [[event('c.test.ts'), false, {}], [event('c.test.ts'), true, { childSignal: 'SIGTERM' }], ['', true, {}], [event('c.test.ts') + event('c.test.ts'), true, {}]] as any[]) {
    const execution = createCandidateRoundExecution(plan, options, dependencies);
    const incomplete = await execution.executeFiles(step, async () => child(stderr, 'passed', extra), {});
    incomplete.id = step.id;
    const saved = execution.finish([incomplete], clean);
    assert.equal(saved.records[0].result.roundFiles.length, 2);
    assert.equal(saved.records[0].result.status, 'failed');
    // Restore the completed a/b record for the next independent case.
    fs.writeFileSync(output, JSON.stringify(complete));
  }
});
