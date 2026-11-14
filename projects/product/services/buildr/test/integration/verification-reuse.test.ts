import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectVerificationReuseSnapshot, createVerificationReuseIdentity, createVerificationReuseStore,
  type VerificationReuseSnapshot, type VerificationReuseStep, type VerificationReuseRecord } from '../verification/verification-reuse.ts';
import { createCandidateRoundExecution } from '../verification/candidate-round.ts';
import { executePlan } from '../verification/plan-runner.ts';
import { verificationSteps } from '../verification/registry.ts';
import { collectVerificationSourceInputs } from '../verification/verification-source-inputs.ts';
import { execFileSync } from 'node:child_process';

test('proof collection reads only needed dependency trees while preserving identities and byte drift detection', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-proof-dependencies-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = path.join(root, 'projects/product/services/buildr');
  const write = (file: string, bytes: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
  write(path.join(root, '.gitignore'), 'node_modules/\n');
  write(path.join(service, 'check.ts'), 'export const check = true;\n');
  const dependencies = ['buildr', 'buildr-web', 'dsh-plugin'].map(name => path.join(root, 'projects/product/services', name, 'node_modules/proof-fixture/index.js'));
  for (const file of dependencies) write(file, 'export const value = 1;\n');
  execFileSync('git', ['init', '--initial-branch=dev', root], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'], { stdio: 'ignore' });
  const backend: VerificationReuseStep = { id: 'backend-proof', executor: { type: 'node', file: 'check.ts' }, reuse: { scope: 'backend' } };
  const web = { ...backend, id: 'web-proof', reuse: { scope: 'web' as const } };
  const plugin = { ...backend, id: 'plugin-proof', reuse: { scope: 'plugin' as const } };
  const collect = (steps: VerificationReuseStep[]) => collectVerificationReuseSnapshot({ productRoot: service, steps });
  const full = collect([backend, web, plugin]);
  const read = fs.readFileSync;
  const forbidden = new Set(dependencies.slice(1));
  const unrelatedReads: string[] = [];
  const spy = t.mock.method(fs, 'readFileSync', ((file: any, ...args: any[]) => {
    if (forbidden.has(String(file))) unrelatedReads.push(String(file));
    return Reflect.apply(read, fs, [file, ...args]);
  }) as typeof fs.readFileSync);
  const narrow = collect([backend]);
  spy.mock.restore();
  assert.deepEqual(unrelatedReads, [], 'unrelated dependency bytes must not be read');
  assert.deepEqual(createVerificationReuseIdentity(backend, narrow), createVerificationReuseIdentity(backend, full));
  write(dependencies[1]!, 'export const value = 2;\n');
  const changedWeb = collect([backend, web]);
  assert.deepEqual(createVerificationReuseIdentity(backend, changedWeb), createVerificationReuseIdentity(backend, narrow));
  assert.notEqual(createVerificationReuseIdentity(web, changedWeb)?.key, createVerificationReuseIdentity(web, full)?.key);
  const before = fs.statSync(dependencies[0]!);
  write(dependencies[0]!, 'export const value = 2;\n');
  fs.utimesSync(dependencies[0]!, before.atime, before.mtime);
  assert.notEqual(createVerificationReuseIdentity(backend, collect([backend]))?.key, createVerificationReuseIdentity(backend, narrow)?.key,
    'same-sized dependency edits with restored timestamps still invalidate proof');
  const explicit = { ...backend, reuse: { scope: 'backend' as const, tools: ['web-dependencies'] } };
  assert.equal(collect([explicit]).environment.tools['web-dependencies'], changedWeb.environment.tools['web-dependencies']);
});

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

test('browser selectors compute fallback-free reuse proofs and agent test edits stay isolated across split groups', t => {
  const productRoot = path.resolve(import.meta.dirname, '../..');
  const repositoryRoot = path.resolve(productRoot, '../../../..');
  const browserSteps = verificationSteps.filter((item: any) => item.id.startsWith('e2e-browser:'));
  assert.equal(browserSteps.length, 14);
  for (const item of browserSteps) assert.deepEqual(item.reuse, { scope: 'web', releaseNotes: false });
  const storageStep = verificationSteps.find((item: any) => item.id === 'agent-integration-storage-runtime');
  const conversationsStep = verificationSteps.find((item: any) => item.id === 'agent-integration-conversations');
  const shellStep = browserSteps.find((item: any) => item.id === 'e2e-browser:shell');
  assert.ok(storageStep && conversationsStep && shellStep);

  const realInputs = collectVerificationSourceInputs(repositoryRoot, productRoot, [...browserSteps, storageStep, conversationsStep]);
  for (const item of browserSteps) {
    const proof = realInputs.proofInputs[item.id];
    assert.equal(proof.fallback, false, `${item.id} must resolve without fallback`);
    assert.deepEqual(proof.unresolved, [], `${item.id} must have no unresolved inputs`);
  }
  const realSnapshot = collectVerificationReuseSnapshot({ productRoot, steps: browserSteps });
  for (const item of browserSteps) {
    assert.ok(createVerificationReuseIdentity(item, realSnapshot)?.key, `${item.id} must compute a reuse identity`);
  }

  const fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-split-reuse-')));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const write = (rel: string, text: string) => {
    const target = path.join(fixtureRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write('.gitignore', 'node_modules/\nbuild/\n');
  write('projects/product/services/buildr/package.json', '{"type":"module"}\n');
  write('projects/product/services/buildr/node_modules/fixture/package.json', '{"name":"fixture","version":"1.0.0"}');
  write('projects/product/services/buildr/tools/testing/run-service-tests.ts', 'export const runner = true;\n');
  write('projects/product/services/buildr/test/verification/worker-budget.ts', 'export const budget = 1;\n');
  write('projects/product/services/buildr/tools/development/run-isolated-workspace-check.ts', 'export const isolated = true;\n');
  write('projects/product/services/buildr/test/verification/browser-selector-dispatcher.ts', 'export const dispatch = true;\n');
  write('projects/product/services/buildr/test/e2e/buildr-web-browser.test.ts', 'export const webTest = true;\n');
  write('projects/product/services/buildr-web/package.json', '{"type":"module"}\n');
  write('projects/product/services/buildr-web/node_modules/fixture/package.json', '{"name":"fixture","version":"1.0.0"}');
  write('projects/product/services/buildr-agent/package.json', '{"type":"module"}\n');
  write('projects/product/services/buildr-agent/tools/testing/run-integration.ts', 'export const run = true;\n');
  write('projects/product/services/buildr-agent/test/integration/conversations.test.ts', 'export const v = 1;\n');
  write('projects/product/services/buildr-agent/test/integration/storage-lifecycle.test.ts', 'export const v = 1;\n');
  execFileSync('git', ['init', '--initial-branch=dev', fixtureRoot], { stdio: 'ignore' });
  execFileSync('git', ['-C', fixtureRoot, 'add', '.']);
  execFileSync('git', ['-C', fixtureRoot, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'base'], { stdio: 'ignore' });

  const serviceRoot = path.join(fixtureRoot, 'projects/product/services/buildr');
  const agentFixtureRoot = path.join(fixtureRoot, 'projects/product/services/buildr-agent');
  const subset = [
    { ...conversationsStep, executor: { ...conversationsStep.executor, cwd: agentFixtureRoot, discoveredFiles: ['../buildr-agent/test/integration/conversations.test.ts'] }, platforms: undefined },
    { ...storageStep, executor: { ...storageStep.executor, cwd: agentFixtureRoot, discoveredFiles: ['../buildr-agent/test/integration/storage-lifecycle.test.ts'] }, platforms: undefined },
    { ...shellStep, platforms: undefined },
  ];
  const before = collectVerificationReuseSnapshot({ productRoot: serviceRoot, steps: subset });
  assert.equal(before.proofInputs![subset[0].id].fallback, false);
  assert.equal(before.proofInputs![subset[1].id].fallback, false);
  assert.equal(before.proofInputs![subset[2].id].fallback, false);
  const beforeConv = createVerificationReuseIdentity(subset[0], before)!.key;
  const beforeStorage = createVerificationReuseIdentity(subset[1], before)!.key;
  const beforeShell = createVerificationReuseIdentity(subset[2], before)!.key;

  write('projects/product/services/buildr-agent/test/integration/conversations.test.ts', 'export const v = 2;\n');
  const after = collectVerificationReuseSnapshot({ productRoot: serviceRoot, steps: subset });
  assert.notEqual(createVerificationReuseIdentity(subset[0], after)!.key, beforeConv);
  assert.equal(createVerificationReuseIdentity(subset[1], after)!.key, beforeStorage);
  assert.equal(createVerificationReuseIdentity(subset[2], after)!.key, beforeShell);
});

test('bundled browser execution persists reuse records for covered members and invalidates both on failure', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-bundle-reuse-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const serviceRoot = path.join(root, 'projects/product/services/buildr');
  const reuseDir = path.join(root, 'reuse-cache');
  const write = (rel: string, text: string) => {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write('.gitignore', 'node_modules/\nbuild/\n');
  write('projects/product/services/buildr/package.json', '{"type":"module"}\n');
  write('projects/product/services/buildr/node_modules/fixture/package.json', '{"name":"fixture","version":"1.0.0"}');
  write('projects/product/services/buildr/tools/development/run-isolated-workspace-check.ts', 'export const isolated = true;\n');
  write('projects/product/services/buildr/test/verification/browser-selector-dispatcher.ts', 'export const dispatch = true;\n');
  write('projects/product/services/buildr/test/e2e/buildr-web-browser.test.ts', 'export const webTest = true;\n');
  write('projects/product/services/buildr-web/package.json', '{"type":"module"}\n');
  write('projects/product/services/buildr-web/node_modules/fixture/package.json', '{"name":"fixture","version":"1.0.0"}');
  execFileSync('git', ['init', '--initial-branch=dev', root], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'base'], { stdio: 'ignore' });

  const makeStep = (selector: string) => ({
    id: `e2e-browser:${selector}`,
    name: `Browser journey: ${selector}`,
    browserSelector: selector,
    browserBundle: 'workbench-surface',
    target: 'source',
    dependsOn: [],
    contexts: [],
    platformScope: { kind: 'common' },
    concurrencyClass: 'workspace-heavy',
    resourceDemand: { workers: 1, processes: 1 },
    executor: { type: 'node', file: 'test/verification/browser-selector-dispatcher.ts', args: ['--selector', selector, '--run'] },
    reuse: { scope: 'web', releaseNotes: false },
    testing: { executionBoundary: 'E2E' },
  });
  const shellStep = makeStep('shell');
  const workbenchStep = makeStep('workbench');

  const coordinator = () => ({
    root: path.join(root, 'coord'),
    acquire: async () => ({ claims: [], release: async () => [] }),
    releaseAll: () => [],
  });
  const baseEnv = { BUILDR_VERIFICATION_REUSE_DIR: reuseDir, BUILDR_AGENT_PREPARED_RUNTIME_REUSE: '0' };
  const calls: string[][] = [];
  let shouldPass = false;
  const executorFactory = () => async (step: any) => {
    calls.push(step.browserSelectors ?? [step.browserSelector]);
    return {
      status: shouldPass ? 'passed' : 'failed',
      exitCode: shouldPass ? 0 : 1,
      childOutcome: shouldPass ? 'passed' : 'failed',
      childExitCode: shouldPass ? 0 : 1,
      childSignal: null,
      durationMs: 25,
      stdout: '',
      stderr: '',
      processCleanup: { status: 'clean' },
      startedAt: '2026-08-13T00:00:00.000Z',
      finishedAt: '2026-08-13T00:00:00.025Z',
    };
  };

  const failedRun = await executePlan({ steps: [shellStep, workbenchStep] }, {
    productRoot: serviceRoot,
    env: baseEnv,
    reuse: {},
    resourceCoordinator: coordinator(),
    executorFactory,
  });
  assert.equal(failedRun.passed, false);
  assert.deepEqual(calls, [['shell', 'workbench']]);
  assert.equal(failedRun.sourceBundle.records.length, 0, 'failed representative must not persist reuse records');

  calls.length = 0;
  shouldPass = true;
  const passedRun = await executePlan({ steps: [shellStep, workbenchStep] }, {
    productRoot: serviceRoot,
    env: baseEnv,
    reuse: {},
    resourceCoordinator: coordinator(),
    executorFactory,
  });
  assert.equal(passedRun.passed, true);
  assert.deepEqual(calls, [['shell', 'workbench']]);
  assert.deepEqual(passedRun.sourceBundle.records.map((item: any) => item.identity.stepId).sort(), ['e2e-browser:shell', 'e2e-browser:workbench']);
  assert.equal(passedRun.results.find((item: any) => item.id === 'e2e-browser:workbench').sourceRecord?.result.durationSource, 'parent-run-upper-bound');

  calls.length = 0;
  const reusedMemberRun = await executePlan({ steps: [workbenchStep] }, {
    productRoot: serviceRoot,
    env: baseEnv,
    reuse: {},
    resourceCoordinator: coordinator(),
    executorFactory,
  });
  assert.equal(reusedMemberRun.passed, true);
  assert.equal(calls.length, 0, 'covered member must reuse persisted record without re-executing');
  assert.equal(reusedMemberRun.results[0].disposition, 'reused');

  calls.length = 0;
  shouldPass = false;
  const forcedFailure = await executePlan({ steps: [shellStep, workbenchStep] }, {
    productRoot: serviceRoot,
    env: baseEnv,
    reuse: { force: true },
    resourceCoordinator: coordinator(),
    executorFactory,
  });
  assert.equal(forcedFailure.passed, false);
  assert.equal(forcedFailure.sourceBundle.records.length, 0);

  calls.length = 0;
  shouldPass = true;
  const afterFailure = await executePlan({ steps: [workbenchStep] }, {
    productRoot: serviceRoot,
    env: baseEnv,
    reuse: {},
    resourceCoordinator: coordinator(),
    executorFactory,
  });
  assert.equal(afterFailure.passed, true);
  assert.deepEqual(calls, [['workbench']], 'failed representative must keep covered member invalidated');
});
