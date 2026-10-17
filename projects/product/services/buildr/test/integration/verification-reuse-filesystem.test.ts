import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { collectVerificationReuseSnapshot, collectVerificationReuseBundle, createVerificationReuseIdentity, createVerificationReuseStore, createVerificationPlanReuse, inspectVerificationReusePlan, reusedVerificationResult, validateVerificationReuseRecord } from '../verification/verification-reuse.ts';
import { executePlan } from '../verification/plan-runner.ts';
import { runVerificationStep } from '../verification/timing/parallel-runner.ts';
import { createVerificationExecutor } from '../verification/executor.ts';

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = path.join(root, 'projects/product/services/buildr');
  fs.mkdirSync(path.join(productRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(productRoot, 'src/check.ts'), 'export const value = 1;\n');
  const runGit = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  runGit('init', '--initial-branch=main'); runGit('add', '.');
  runGit('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'source');
  const env = { ...process.env, BUILDR_VERIFICATION_REUSE_DIR: path.join(root, '.cache') };
  // Cache storage is owned runtime state, outside the observed source inventory.
  fs.writeFileSync(path.join(root, '.git/info/exclude'), '.cache/\n');
  const step = { id: 'source-fixture', executor: { type: 'node', file: 'check.ts' }, reuse: { scope: 'backend' as const } };
  const options = { productRoot, env, steps: [step] };
  const observe = () => collectVerificationReuseSnapshot(options);
  return { root, productRoot, step, options, observe };
}
const passed = { status: 'passed', exitCode: 0, durationMs: 12, childOutcome: 'passed', childExitCode: 0, childSignal: null, processCleanup: { status: 'clean' } };

for (const cleanup of ['clean', 'failed', 'unknown']) test(`interrupted source exports completed checks only with confirmed ${cleanup} child cleanup`, async t => {
  const f = fixture(t);
  const steps = ['completed', 'in-flight', 'pending'].map(id => ({ ...f.step, id, dependsOn: [], contexts: [] }));
  const cancellation = new AbortController(), executed: string[] = [];
  const output = path.join(f.root, '.cache', 'partial.json');
  const plan = { status: 'ready', paths: [], steps };
  const options = { ...f.options, steps, concurrency: 1, runId: 'partial-source-original',
    executorFactory: () => async (step: any) => {
      executed.push(step.id);
      if (step.id === 'in-flight') {
        cancellation.abort();
        return { status: 'cancelled', exitCode: 130, childOutcome: 'unknown', childExitCode: null, childSignal: 'SIGTERM', durationMs: 1,
          ...(cleanup === 'unknown' ? {} : { processCleanup: { status: cleanup } }) };
      }
      return { ...passed };
    } };
  const interrupted = await executePlan(plan, { ...options, signal: cancellation.signal, reuse: { output } });
  assert.equal(interrupted.passed, false);
  assert.equal(interrupted.cleanupClean, cleanup === 'clean');
  assert.deepEqual(executed, ['completed', 'in-flight']);
  const bundle = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(bundle.records.map((record: any) => record.identity.stepId), cleanup === 'clean' ? ['completed'] : []);
  if (cleanup === 'clean') {
    const origin = bundle.records[0].origin;
    assert.equal(origin.runId, 'partial-source-original');
    executed.length = 0;
    const resumed = await executePlan(plan, { ...options, runId: 'partial-source-resume', executorFactory: () => async (step: any) => { executed.push(step.id); return { ...passed }; } });
    assert.equal(resumed.passed, true);
    assert.deepEqual(executed, ['in-flight', 'pending']);
    assert.deepEqual(resumed.sourceBundle.records.find((record: any) => record.identity.stepId === 'completed').origin, origin);
  }
});

test('verification children cannot overwrite parent preparation evidence through inherited output paths', async t => {
  const f = fixture(t), output = path.join(f.root, '.cache', 'parent-preparation.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '{"durationMs":17000}\n');
  const file = path.join(f.productRoot, 'inspect-environment.mjs');
  fs.writeFileSync(file, `import fs from 'node:fs';
if (process.env.BUILDR_CANDIDATE_PREPARATION_OUTPUT) fs.writeFileSync(process.env.BUILDR_CANDIDATE_PREPARATION_OUTPUT, '{}');
process.stdout.write(JSON.stringify({ output: process.env.BUILDR_CANDIDATE_PREPARATION_OUTPUT ?? null, id: process.env.BUILDR_CANDIDATE_PREPARATION_ID ?? null, profile: process.env.BUILDR_VERIFICATION_PROFILE, worker: process.env.BUILDR_VERIFICATION_WORKER_BUDGET }));\n`);
  const env = { ...f.options.env, BUILDR_CANDIDATE_PREPARATION_OUTPUT: output, BUILDR_CANDIDATE_PREPARATION_ID: 'parent', BUILDR_VERIFICATION_PROFILE: 'ci-workspace-limited' };
  const execute = createVerificationExecutor({ productRoot: f.productRoot, env, minimumNodeVersion: null });
  const result = await execute({ id: 'receipt-isolation', executor: { type: 'node', file: 'inspect-environment.mjs' } }, { resourceGrant: { workers: 2 } });
  assert.equal(result.status, 'passed', result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { output: null, id: null, profile: 'ci-workspace-limited', worker: '2' });
  assert.equal(fs.readFileSync(output, 'utf8'), '{"durationMs":17000}\n');
  assert.equal(env.BUILDR_CANDIDATE_PREPARATION_OUTPUT, output);
});

test('reviewed runtime proof partitions unrelated tests while binding its real test and tool imports', t => {
  const f = fixture(t);
  const write = (name: string, value: string) => { const file = path.join(f.productRoot, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  write('test/integration/selected.test.ts', "import '../../tools/release/selected.ts';\n");
  write('tools/release/selected.ts', 'export const value = 1;\n');
  const step = { ...f.step, executor: { type: 'node-test', files: ['test/integration/selected.test.ts'] }, reuse: { scope: 'runtime' as const, inputMode: 'runtime-check' as const } };
  const observe = () => collectVerificationReuseSnapshot({ ...f.options, steps: [step] });
  const key = () => createVerificationReuseIdentity(step, observe())!.key;
  const original = key();
  assert.equal(observe().stepInputs![step.id]!.fallback, false);
  write('test/integration/unrelated.test.ts', 'throw new Error("unrelated");\n');
  write('tools/release/unrelated.ts', 'export const unrelated = true;\n');
  assert.equal(key(), original);
  execFileSync('git', ['-C', f.root, 'branch', 'unrelated-task']);
  assert.equal(key(), original);
  for (const name of ['src/check.ts', 'test/integration/selected.test.ts', 'tools/release/selected.ts', 'test/helpers/common.ts']) {
    const file = path.join(f.productRoot, name), previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
    write(name, (previous?.toString() ?? '') + '// actual input changed\n');
    assert.notEqual(key(), original, name);
    if (previous) fs.writeFileSync(file, previous); else fs.rmSync(file);
  }
});

test('runtime discovery binds added, changed and deleted assertions to local reuse', t => {
  const f = fixture(t);
  for (const family of ['integration', 'system']) {
    const runner = path.join(f.productRoot, `test/verification/${family}.ts`);
    const selected = path.join(f.productRoot, `test/${family}/selected.test.ts`);
    fs.mkdirSync(path.dirname(runner), { recursive: true });
    fs.mkdirSync(path.dirname(selected), { recursive: true });
    fs.writeFileSync(runner, "import fs from 'node:fs'; fs.readdirSync('test');\n");
    fs.writeFileSync(selected, '// original assertion\n');
    const step = { ...f.step, executor: { type: 'node', file: `test/verification/${family}.ts` }, reuse: { scope: 'runtime' as const, inputMode: 'runtime-check' as const } };
    const key = () => createVerificationReuseIdentity(step, collectVerificationReuseSnapshot({ ...f.options, steps: [step] }))!.key;
    const original = key();
    fs.writeFileSync(selected, '// changed assertion\n'); assert.notEqual(key(), original);
    fs.writeFileSync(selected, '// original assertion\n'); assert.equal(key(), original);
    const added = path.join(path.dirname(selected), 'added.test.ts');
    fs.writeFileSync(added, '// new assertion\n'); assert.notEqual(key(), original);
    fs.rmSync(added); assert.equal(key(), original);
    fs.rmSync(selected); assert.notEqual(key(), original);
  }
});

test('computed test imports retain a conservative scope instead of inventing dependency coverage', t => {
  const f = fixture(t), file = path.join(f.productRoot, 'test/check.ts');
  fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, 'const modulePath = process.env.TEST_MODULE; await import(modulePath);\n');
  const step = { ...f.step, executor: { type: 'node', file: 'test/check.ts' }, reuse: { scope: 'runtime' as const, inputMode: 'runtime-check' as const } };
  const observe = () => collectVerificationReuseSnapshot({ ...f.options, steps: [step] });
  const first = observe(); assert.equal(first.stepInputs![step.id]!.fallback, true);
  fs.writeFileSync(path.join(f.productRoot, 'test/unknown.ts'), 'new dependency');
  assert.notEqual(createVerificationReuseIdentity(step, observe())!.key, createVerificationReuseIdentity(step, first)!.key);
});

test('node test runner arguments are recipe inputs rather than invisible child test paths', t => {
  const f = fixture(t), directory = path.join(f.productRoot, 'test'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'runner.ts'), '// child runner\n');
  fs.writeFileSync(path.join(directory, 'selected.test.ts'), '// original test\n');
  const step = { ...f.step, executor: { type: 'node', file: 'test/runner.ts', args: ['test/selected.test.ts'] }, reuse: { scope: 'runtime' as const, inputMode: 'runtime-check' as const } };
  const observe = () => collectVerificationReuseSnapshot({ ...f.options, steps: [step] });
  const key = createVerificationReuseIdentity(step, observe())!.key;
  fs.appendFileSync(path.join(directory, 'selected.test.ts'), '// changed assertion\n');
  assert.notEqual(createVerificationReuseIdentity(step, observe())!.key, key);
});

test('result policy changes preserve independent checks while assertions and execution machinery remain inputs', t => {
  const f = fixture(t);
  const write = (file: string, content: string) => { const target = path.join(f.productRoot, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  write('test/selected.test.ts', '// independent assertion\n');
  write('test/consumer.test.ts', "import './verification/verification-reuse.ts';\n");
  write('test/verification/verification-reuse.ts', 'export const policy = 1;\n');
  const selected = { ...f.step, executor: { type: 'node-test', files: ['test/selected.test.ts'] } };
  const consumer = { ...selected, id: 'policy-consumer', executor: { type: 'node-test', files: ['test/consumer.test.ts'] } };
  const options = { ...f.options, steps: [selected, consumer] };
  const observe = () => collectVerificationReuseSnapshot(options);
  const before = observe();
  const key = (step: typeof selected) => createVerificationReuseIdentity(step, observe())!.key;
  const original = key(selected), consumerOriginal = key(consumer);
  const store = createVerificationReuseStore({ ...options, snapshot: before });
  store.stage(selected, passed, origin(before.sourceCommit));
  assert.equal(store.commit(observe(), true).records.length, 1);
  write('test/verification/verification-reuse.ts', 'export const policy = 2;\n');
  write('test/unrelated.test.ts', '// independent other suite\n');
  assert.equal(key(selected), original);
  assert.notEqual(key(consumer), consumerOriginal);
  assert.ok(createVerificationReuseStore({ ...options, snapshot: observe(), readOnly: true }).lookup(selected));
  write('test/selected.test.ts', '// changed assertion\n');
  assert.notEqual(key(selected), original);
  write('test/selected.test.ts', '// independent assertion\n');
  write('test/verification/executor.ts', '// changed execution machinery\n');
  assert.notEqual(key(selected), original);
});

test('old complete proof is authenticated from Git, retained unchanged and cannot bypass a newer failure', async t => {
  const f = fixture(t);
  const write = (file: string, content: string) => { const target = path.join(f.productRoot, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  const runGit = (...args: string[]) => execFileSync('git', ['-C', f.root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  write('test/selected.test.ts', '// independent assertion\n');
  write('test/verification/verification-reuse.ts', 'export const policy = 1;\n');
  runGit('add', '.'); runGit('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'complete proof source');
  const step = { ...f.step, executor: { type: 'node-test', files: ['test/selected.test.ts'] }, dependsOn: [], contexts: [] };
  const options = { ...f.options, steps: [step] };
  const observe = () => collectVerificationReuseSnapshot(options);
  const before = observe(), legacy = { ...before, proofInputs: undefined };
  const store = createVerificationReuseStore({ ...options, snapshot: legacy });
  store.stage(step, passed, origin(before.sourceCommit));
  const old = store.commit(legacy, true).records[0]!;
  const original = JSON.stringify(old);
  write('test/verification/verification-reuse.ts', 'export const policy = 2;\n');
  write('test/unrelated.test.ts', '// unrelated repair\n');
  assert.equal(validateVerificationReuseRecord(old, { ...options, snapshot: observe(), step }), true);
  assert.deepEqual(createVerificationReuseStore({ ...options, snapshot: observe(), readOnly: true }).lookup(step), old);
  let executed = 0;
  const plan = { status: 'ready', scope: { mode: 'explicit' }, paths: [], steps: [step] };
  const result = await executePlan(plan, { ...options, executorFactory: () => async () => { executed++; return { ...passed }; } });
  assert.equal(result.passed, true); assert.equal(executed, 0);
  assert.equal(JSON.stringify(result.sourceBundle.records[0]), original, 'reuse preserves the actual execution record');
  const wrongOrigin = { ...old, origin: { ...old.origin, sourceCommit: 'b'.repeat(40) } };
  assert.equal(validateVerificationReuseRecord(wrongOrigin, { ...options, snapshot: observe(), step }), false);
  write('test/selected.test.ts', '// actual assertion changed\n');
  assert.equal(validateVerificationReuseRecord(old, { ...options, snapshot: observe(), step }), false);
  write('test/selected.test.ts', '// independent assertion\n');
  const failure = createVerificationReuseStore({ ...options, snapshot: observe() });
  failure.stage(step, { ...passed, status: 'failed', exitCode: 1, childOutcome: 'failed', childExitCode: 1 }, origin(before.sourceCommit));
  write('test/verification/verification-reuse.ts', 'export const policy = 3;\n');
  assert.equal(createVerificationReuseStore({ ...options, snapshot: observe(), imports: [{ schemaVersion: 'buildr.verification-source-bundle/v1', records: [old] }], readOnly: true }).lookup(step), null);
});
function origin(sourceCommit: string) { return { kind: 'local' as const, runId: 'source-fixture', sourceCommit, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }; }

test('reuse planning is read-only, explains input and recipe misses and removes reused work from its estimate', t => {
  const f = fixture(t), step = { ...f.step, testing: { targetDurationMs: 1200 }, dependsOn: [] };
  const plan = { steps: [step] };
  const missing = inspectVerificationReusePlan(plan, f.options);
  assert.equal(fs.existsSync(f.options.env.BUILDR_VERIFICATION_REUSE_DIR), false);
  assert.deepEqual(missing.steps[0].reasons, ['no-matching-result']);
  assert.equal(missing.estimate.remainingWorkMs, 1200);
  const snapshot = f.observe(), store = createVerificationReuseStore({ ...f.options, snapshot });
  store.stage(step, passed, origin(snapshot.sourceCommit)); store.commit(f.observe(), true);
  const reused = inspectVerificationReusePlan(plan, f.options);
  assert.equal(reused.estimate.remainingWorkMs, 0); assert.equal(reused.estimate.reusedOriginalMs, 12);
  assert.equal(reused.steps[0].origin.runId, 'source-fixture');
  const changed = inspectVerificationReusePlan({ steps: [{ ...step, executor: { ...step.executor, args: ['--different'] } }] }, f.options);
  assert.deepEqual(changed.steps[0].reasons, ['check-recipe-changed']);
  assert.deepEqual(inspectVerificationReusePlan(plan, { ...f.options, force: true }).steps[0].reasons, ['explicit-force']);
  assert.ok(createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).lookup(step), 'planning force never revokes a valid result');
  fs.appendFileSync(path.join(f.productRoot, 'src/check.ts'), '// change\n');
  assert.deepEqual(inspectVerificationReusePlan(plan, f.options).steps[0].reasons, ['product-input-changed']);
});

test('local source cache starts empty, persists atomic success and invalidates old green after forced failure', t => {
  const f = fixture(t), snapshot = f.observe();
  assert.deepEqual(collectVerificationReuseBundle({ ...f.options, snapshot }).records, []);
  const store = createVerificationReuseStore({ ...f.options, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  const bundle = store.commit(f.observe(), true);
  assert.equal(bundle.records.length, 1);
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).lookup(f.step)?.result.durationMs, 12);
  assert.equal(collectVerificationReuseBundle({ ...f.options, snapshot: f.observe() }).records.length, 1);
  store.stage(f.step, { status: 'blocked', blockedBy: 'another-check' }, origin(snapshot.sourceCommit));
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).lookup(f.step)?.result.durationMs, 12);
  store.stage(f.step, { ...passed, status: 'failed', childOutcome: 'failed', childExitCode: 1, exitCode: 1 }, origin(snapshot.sourceCommit));
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe(), imports: [bundle] }).lookup(f.step), null);
});
test('source scopes include plugin workflows while backend checks ignore unrelated workflow and OpenSpec changes', t => {
  const f = fixture(t), before = f.observe(), key = createVerificationReuseIdentity(f.step, before)!.key;
  const tasks = path.join(f.root, 'projects/product/openspec/changes/example/tasks.md');
  fs.mkdirSync(path.dirname(tasks), { recursive: true }); fs.writeFileSync(tasks, '- [x] completed\n');
  assert.equal(createVerificationReuseIdentity(f.step, f.observe())!.key, key);
  const pluginStep = { ...f.step, reuse: { scope: 'plugin' as const } };
  const pluginKey = createVerificationReuseIdentity(pluginStep, f.observe())!.key;
  const workflow = path.join(f.root, '.github/workflows/publish-dsh-plugin.yml');
  fs.mkdirSync(path.dirname(workflow), { recursive: true }); fs.writeFileSync(workflow, 'name: changed plugin publication\n');
  const changedWorkflow = f.observe();
  assert.notEqual(createVerificationReuseIdentity(pluginStep, changedWorkflow)!.key, pluginKey);
  assert.equal(createVerificationReuseIdentity(f.step, changedWorkflow)!.key, key);
  fs.mkdirSync(path.join(f.productRoot, 'node_modules'), { recursive: true }); fs.writeFileSync(path.join(f.productRoot, 'node_modules/dependency.js'), 'changed');
  assert.notEqual(createVerificationReuseIdentity(f.step, f.observe())!.key, key);
  const outside = path.join(f.root, 'external.txt'); fs.writeFileSync(outside, 'value');
  fs.symlinkSync(path.join(os.tmpdir(), 'missing-buildr-source-link'), path.join(f.productRoot, 'src/external'));
  assert.equal(createVerificationReuseIdentity(f.step, f.observe()), null);
  assert.equal(validateVerificationReuseRecord({}, { ...f.options, snapshot: before, step: f.step }), false);
});
test('input drift or dirty cleanup never persists success; portable imports preserve original runner environment', t => {
  const f = fixture(t), snapshot = f.observe(), store = createVerificationReuseStore({ ...f.options, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  assert.equal(store.commit(f.observe(), false).records.length, 0);
  const clean = createVerificationReuseStore({ ...f.options, snapshot: f.observe() });
  clean.stage(f.step, passed, origin(snapshot.sourceCommit));
  const bundle = clean.commit(f.observe(), true);
  assert.equal(bundle.records.length, 1);
  const changedEnvironment = { ...f.observe(), environment: { ...snapshot.environment, arch: snapshot.environment.arch === 'arm64' ? 'x64' : 'arm64' } };
  const strict = createVerificationReuseStore({ ...f.options, snapshot: changedEnvironment, imports: [bundle] });
  assert.equal(strict.lookup(f.step), null);
  const portable = createVerificationReuseStore({ ...f.options, snapshot: changedEnvironment, imports: [bundle], portableImports: true });
  assert.equal(portable.lookup(f.step)?.environment.arch, snapshot.environment.arch);
  clean.stage(f.step, passed, origin(snapshot.sourceCommit));
  fs.appendFileSync(path.join(f.productRoot, 'src/check.ts'), '// changed during execution\n');
  assert.equal(clean.commit(f.observe(), true).records.length, 0);
  assert.equal(collectVerificationReuseBundle({ ...f.options, snapshot: f.observe() }).records.length, 0);
});

test('runtime proof survives Product governance edits and archival while audits and source changes remain bound', t => {
  const f = fixture(t), runtime = { ...f.step, reuse: { scope: 'runtime' as const } }, audit = { ...f.step, reuse: { scope: 'repository' as const } };
  const write = (relative: string, value: string) => { const file = path.join(f.root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  write('projects/product/openspec/changes/example/tasks.md', '- [ ] pending\n');
  const before = f.observe(), key = createVerificationReuseIdentity(runtime, before)!.key;
  write('projects/product/openspec/changes/example/tasks.md', '- [x] done\n');
  write('projects/product/knowledge/review.md', '# recorded result\n'); write('projects/product/tasks/example/brief.md', '# updated task\n');
  fs.mkdirSync(path.join(f.root, 'projects/product/openspec/changes/archive'), { recursive: true });
  fs.renameSync(path.join(f.root, 'projects/product/openspec/changes/example'), path.join(f.root, 'projects/product/openspec/changes/archive/completed'));
  const metadata = f.observe();
  assert.equal(createVerificationReuseIdentity(runtime, metadata)!.key, key);
  assert.notEqual(createVerificationReuseIdentity(audit, metadata)!.key, createVerificationReuseIdentity(audit, before)!.key);
  for (const relative of ['.github/workflows/verify.yml', 'CHANGELOG.md', 'unknown-input.txt', 'projects/product/services/buildr/src/check.ts']) {
    write(relative, 'changed actual source input\n');
    assert.notEqual(createVerificationReuseIdentity(runtime, f.observe())!.key, key, relative);
    fs.rmSync(path.join(f.root, relative));
  }
});

test('a later failure cannot be resurrected by an earlier staged success or a previously selected cache hit', t => {
  const f = fixture(t), snapshot = f.observe();
  const first = createVerificationReuseStore({ ...f.options, snapshot }), failure = createVerificationReuseStore({ ...f.options, snapshot });
  first.stage(f.step, passed, { ...origin(snapshot.sourceCommit), finishedAt: '2099-01-01T00:00:00.000Z' });
  failure.stage(f.step, { ...passed, status: 'failed', exitCode: 1 }, origin(snapshot.sourceCommit));
  assert.equal(first.commit(f.observe(), true).records.length, 0, 'late cleanup cannot publish an older execution over a newer failure');
  const fresh = createVerificationReuseStore({ ...f.options, snapshot: f.observe() });
  fresh.stage(f.step, passed, origin(snapshot.sourceCommit));
  const bundle = fresh.commit(f.observe(), true);
  assert.equal(bundle.records.length, 1);
  const plan = { steps: [f.step] }, reuse = createVerificationPlanReuse(plan, { ...f.options, runId: 'current' });
  assert.equal(reuse.hits.size, 1);
  const selected = reusedVerificationResult(bundle.records[0]);
  const later = createVerificationReuseStore({ ...f.options, snapshot: f.observe() });
  later.invalidate(bundle.records[0].identity);
  assert.equal(reuse.finish([{ ...selected, id: f.step.id }], true).records.length, 0);
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe(), imports: [bundle], portableImports: true }).lookup(f.step), null);
  assert.equal(collectVerificationReuseBundle({ ...f.options, snapshot: f.observe() }).records.length, 0);
});

test('default cache loss does not deny an actual passed check and drift preserves an earlier timeout fact', t => {
  const f = fixture(t), unavailable = path.join(f.root, 'cache-is-a-file'); fs.writeFileSync(unavailable, 'occupied');
  const options = { ...f.options, env: { ...f.options.env, BUILDR_VERIFICATION_REUSE_DIR: unavailable } };
  const store = createVerificationReuseStore({ ...options, snapshot: collectVerificationReuseSnapshot(options) });
  store.stage(f.step, passed, origin(f.observe().sourceCommit));
  assert.equal(store.commit(collectVerificationReuseSnapshot(options), true).records.length, 1);
  const reuse = createVerificationPlanReuse({ steps: [f.step] }, f.options);
  fs.appendFileSync(path.join(f.productRoot, 'src/check.ts'), '// input drift\n');
  const timedOut = { ...passed, id: f.step.id, status: 'timed-out', exitCode: 124, childOutcome: 'unknown', failureCode: 'capability-timeout' };
  reuse.finish([timedOut], true);
  assert.equal(timedOut.status, 'timed-out'); assert.equal(timedOut.exitCode, 124); assert.equal(timedOut.failureCode, 'capability-timeout');
  assert.ok((timedOut as any).failureFacts.some((fact: any) => fact.code === 'verification-reuse-input-drift'));
  const drift = (timedOut as any).failureFacts.find((fact: any) => fact.code === 'verification-reuse-input-drift');
  assert.deepEqual(drift.changes.map((change: any) => change.field), ['contentIdentity']);
  assert.match(drift.changes[0].before, /^sha256-[a-f0-9]{64}$/u);
  assert.notEqual(drift.changes[0].before, drift.changes[0].after);
  assert.equal(drift.cleanupClean, true);
});

test('comparison reuse ignores unrelated refs but records real base drift and rejects a missing base', t => {
  const f = fixture(t);
  const runGit = (...args: string[]) => execFileSync('git', ['-C', f.root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  runGit('branch', 'comparison-base');
  const step = { ...f.step, reuse: { scope: 'backend' as const, git: 'comparison' as const } };
  const options = { ...f.options, steps: [step], env: { ...f.options.env, BUILDR_VERIFICATION_BASE: 'comparison-base' } };
  const observe = () => collectVerificationReuseSnapshot(options);
  const before = observe(), original = createVerificationReuseIdentity(step, before)!;
  const proof = createVerificationPlanReuse({ steps: [step] }, options);
  const extra = runGit('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'unrelated history');
  runGit('branch', 'unrelated', extra);
  const unrelated = observe();
  assert.notEqual(unrelated.gitIdentity, before.gitIdentity);
  assert.deepEqual(createVerificationReuseIdentity(step, unrelated), original);
  const successful = { ...passed, id: step.id };
  assert.equal(proof.finish([successful], true).records.length, 1);
  assert.equal(successful.status, 'passed');

  const messages: string[] = [];
  const changed = createVerificationPlanReuse({ steps: [step] }, { ...options, stream: { write: (text: string) => messages.push(text) } });
  runGit('update-ref', 'refs/heads/comparison-base', extra);
  const result: any = { ...passed, id: step.id };
  assert.equal(changed.finish([result], true).records.length, 0);
  assert.equal(result.failureCode, 'verification-reuse-input-drift');
  const fact = result.failureFacts.find((item: any) => item.code === result.failureCode);
  assert.deepEqual(fact.changes.map((item: any) => item.field), ['gitIdentity']);
  assert.equal(fact.git.before.base, before.sourceCommit);
  assert.equal(fact.git.after.base, extra);
  assert.equal(fact.git.before.baseRef, 'comparison-base');
  assert.ok(messages.some(text => text.includes(extra) && text.includes('gitIdentity')));
  runGit('branch', '-D', 'comparison-base');
  assert.equal(observe().gitComparison, null);
  assert.equal(createVerificationReuseIdentity(step, observe()), null);
});

test('unclean result disposal reports cleanup failure rather than inventing an input change', t => {
  const f = fixture(t), reuse = createVerificationPlanReuse({ steps: [f.step] }, f.options);
  const result: any = { ...passed, id: f.step.id };
  assert.equal(reuse.finish([result], false).records.length, 0);
  assert.equal(result.failureCode, 'verification-reuse-cleanup-failed');
  assert.deepEqual(result.failureFacts[0].changes, []);
  assert.equal(result.failureFacts[0].cleanupClean, false);
});

test('unclean current disposal preserves an original reused proof and withholds only the new success', t => {
  const f = fixture(t), snapshot = f.observe(), store = createVerificationReuseStore({ ...f.options, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  const original = store.commit(f.observe(), true).records[0];
  const fresh = { ...f.step, id: 'fresh-source-fixture' };
  const reuse = createVerificationPlanReuse({ steps: [f.step, fresh] }, f.options);
  const selected: any = reusedVerificationResult(original), executed: any = { ...passed, id: fresh.id };
  const bundle = reuse.finish([selected, executed], false);
  assert.deepEqual(bundle.records, [original], 'current cleanup cannot rewrite the origin or revoke a prior clean execution');
  assert.equal(selected.status, 'passed'); assert.equal(selected.failureCode, undefined);
  assert.deepEqual(selected.sourceRecord, original);
  assert.equal(executed.failureCode, 'verification-reuse-cleanup-failed');
  assert.deepEqual(createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).lookup(f.step), original);
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe(), steps: [fresh] }).lookup(fresh), null);
});

for (const change of ['input-drift', 'revoked']) test(`unclean disposal still rejects a reused proof after ${change}`, t => {
  const f = fixture(t), snapshot = f.observe(), store = createVerificationReuseStore({ ...f.options, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  const original = store.commit(f.observe(), true).records[0];
  const reuse = createVerificationPlanReuse({ steps: [f.step] }, f.options), selected: any = reusedVerificationResult(original);
  if (change === 'input-drift') fs.appendFileSync(path.join(f.productRoot, 'src/check.ts'), '// current input changed\n');
  else createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).invalidate(original.identity);
  assert.equal(reuse.finish([selected], false).records.length, 0);
  assert.equal(selected.status, 'failed');
  assert.equal(selected.failureCode, change === 'input-drift' ? 'verification-reuse-input-drift' : 'verification-reuse-superseded');
});

test('only the fresh staged record survives unavailable cache and an observed invalidation still revokes it', t => {
  const f = fixture(t), unavailable = path.join(f.root, 'cache-is-a-file'); fs.writeFileSync(unavailable, 'occupied');
  const options = { ...f.options, env: { ...f.options.env, BUILDR_VERIFICATION_REUSE_DIR: unavailable } };
  const snapshot = collectVerificationReuseSnapshot(options), store = createVerificationReuseStore({ ...options, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  const record = store.commit(collectVerificationReuseSnapshot(options), true).records[0];
  assert.ok(record); assert.equal(store.cacheAvailable(), false); assert.equal(store.isCurrent(record), false);
  assert.equal(store.isCurrentFresh(record), true);
  assert.equal(store.isCurrentFresh(structuredClone(record)), false, 'an old import cannot claim this execution');
  store.invalidate(record.identity);
  assert.equal(store.isCurrentFresh(record), false, 'known new invalidation remains authoritative without cache access');
});

test('executePlan automatically skips a second executor call and forced failure revokes its old result', async t => {
  const f = fixture(t); let calls = 0, fail = false, grants = 0;
  const plan = { status: 'ready', scope: { mode: 'full' }, paths: [], steps: [{ ...f.step, dependsOn: [], contexts: [], resourceClaims: ['owned-test-resource'] }] };
  const options = { ...f.options, runId: 'plan-fixture', concurrency: 1, resourceCoordinator: { root: path.join(f.root, 'resources'),
    async acquire() { grants++; return { waitDurationMs: 0, claims: [], async release() { return []; } }; } },
    executorFactory: () => async () => { calls++; return fail ? { ...passed, status: 'failed', exitCode: 1, childOutcome: 'failed', childExitCode: 1 } : { ...passed }; } };
  const first = await executePlan(plan, options);
  assert.equal(first.passed, true); assert.equal(first.sourceBundle.records.length, 1);
  const next = await executePlan(plan, options);
  assert.equal(grants, 2, 'a fully reused plan acquires neither the full-plan lease nor per-check resources');
  assert.equal(calls, 1); assert.equal(next.results[0].disposition, 'reused'); assert.equal(next.results[0].durationMs, 0);
  fail = true;
  const forced = await executePlan(plan, { ...options, reuse: { force: true } });
  assert.equal(forced.passed, false); assert.equal(calls, 2);
  await executePlan(plan, options);
  assert.equal(calls, 3);
});

for (const failure of ['context-cleanup', 'full-plan-release']) test(`executePlan ${failure} failure preserves prior reused success for the next run`, async t => {
  const f = fixture(t), oldStep = { ...f.step, dependsOn: [], contexts: [] };
  const newStep = { ...oldStep, id: 'new-source-fixture' };
  let calls = 0, releases = 0;
  const options = { ...f.options, runId: 'cleanup-fixture', concurrency: 1,
    resourceCoordinator: { root: path.join(f.root, 'resources'), async acquire() {
      return { waitDurationMs: 0, async release() { releases++; return []; } };
    } },
    executorFactory: () => async () => { calls++; return { ...passed }; },
  };
  const seeded = await executePlan({ status: 'ready', paths: [], steps: [oldStep] }, options);
  const original = seeded.sourceBundle.records[0];
  const plan = { status: 'ready', scope: { mode: 'full' }, paths: [], steps: [oldStep, newStep] };
  const completed: any[] = [];
  const failing = { ...options, onComplete: (result: any) => completed.push(result),
    ...(failure === 'context-cleanup' ? { contextPoolFactory: () => ({
      prepareAll: () => [], environment: () => ({}), events: () => [],
      cleanup() { throw new Error('injected current context cleanup failure'); },
    }) } : { resourceCoordinator: { ...options.resourceCoordinator, async acquire() {
      return { waitDurationMs: 0, async release() { releases++; return [{ status: 'failed' }]; } };
    } } }),
  };
  await assert.rejects(executePlan(plan, failing), failure === 'context-cleanup' ? /injected current context cleanup failure/u : /Failed to release/u);
  assert.equal(completed.find(result => result.id === oldStep.id).status, 'passed');
  assert.equal(completed.find(result => result.id === oldStep.id).disposition, 'reused');
  assert.deepEqual(createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).lookup(oldStep), original);
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe(), steps: [newStep] }).lookup(newStep), null);
  const resumed = await executePlan(plan, options);
  assert.equal(resumed.passed, true);
  assert.equal(resumed.results.find((result: any) => result.id === oldStep.id).disposition, 'reused');
  assert.equal(calls, 3, 'the original check executes once; only the failed run\'s new check repeats');
  assert.equal(releases, 2);
});

test('custom inner worker grants execute without reusing or exporting a registered-profile proof', async t => {
  const f = fixture(t); let calls = 0;
  const plan = { status: 'ready', paths: [], steps: [{ ...f.step, dependsOn: [], contexts: [], resourceDemand: { workers: 1, processes: 1 } }] };
  const options = { ...f.options, runId: 'worker-profile-fixture', concurrency: 2,
    resourceCoordinator: { root: path.join(f.root, 'resources') },
    executorFactory: () => async () => { calls++; return { ...passed }; } };
  const registered = await executePlan(plan, options);
  assert.equal(registered.sourceBundle.records.length, 1);
  const custom = { ...options, executionProfile: { id: 'local', limits: { innerConcurrency: { [f.step.id]: 2 } } } };
  const execution = await executePlan(plan, custom);
  assert.equal(execution.passed, true);
  assert.equal(calls, 2, 'a different actual worker grant cannot consume the previous registered proof');
  assert.equal(execution.sourceBundle.records.length, 0, 'unregistered execution conditions cannot become portable evidence');
  assert.deepEqual(execution.reusePlan.steps[0].reasons, ['custom-worker-budget-requires-fresh-proof']);
  const current = await executePlan(plan, options);
  assert.equal(current.results[0].disposition, 'reused', 'custom execution does not revoke the independent registered result');
  assert.equal(calls, 2);
});

test('a corrupt invalidation marker rejects old success and imports until a fresh execution replaces it', t => {
  const f = fixture(t), snapshot = f.observe(), store = createVerificationReuseStore({ ...f.options, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  const bundle = store.commit(f.observe(), true), record = bundle.records[0];
  fs.writeFileSync(path.join(store.directory, `${record.identity.key}.json.invalid`), '{broken');
  const damaged = createVerificationReuseStore({ ...f.options, snapshot: f.observe(), imports: [bundle], portableImports: true });
  assert.equal(damaged.lookup(f.step), null); assert.equal(damaged.isCurrent(record), false);
  assert.equal(collectVerificationReuseBundle({ ...f.options, snapshot: f.observe() }).records.length, 0);
  damaged.stage(f.step, passed, origin(snapshot.sourceCommit));
  assert.equal(damaged.commit(f.observe(), true).records.length, 1);
  assert.equal(createVerificationReuseStore({ ...f.options, snapshot: f.observe() }).lookup(f.step)?.result.status, 'passed');
});

test('a changed real verification network mode cannot reuse the local offline result', t => {
  const f = fixture(t), offline = { ...f.options, env: { ...f.options.env, BUILDR_VERIFICATION_NETWORK_MODE: 'offline' } };
  const snapshot = collectVerificationReuseSnapshot(offline), store = createVerificationReuseStore({ ...offline, snapshot });
  store.stage(f.step, passed, origin(snapshot.sourceCommit));
  const bundle = store.commit(collectVerificationReuseSnapshot(offline), true);
  assert.equal(bundle.records.length, 1);
  assert.equal(createVerificationReuseStore({ ...offline, snapshot: collectVerificationReuseSnapshot(offline) }).lookup(f.step)?.result.status, 'passed');
  const online = { ...offline, env: { ...offline.env, BUILDR_VERIFICATION_NETWORK_MODE: 'online' } };
  const changed = collectVerificationReuseSnapshot(online);
  assert.notEqual(changed.environment.variablesIdentity, snapshot.environment.variablesIdentity);
  assert.equal(createVerificationReuseStore({ ...online, snapshot: changed, imports: [bundle] }).lookup(f.step), null);
});

test('a real subset success cannot skip a failing full check or another subset or base', async t => {
  const f = fixture(t), file = path.join(f.productRoot, 'check.mjs');
  fs.writeFileSync(file, "import fs from 'node:fs'; const selected=JSON.parse(process.env.BUILDR_CHANGED_PATHS_JSON||'[]'); for(const file of selected.length?selected:['good.txt','bad.txt']) if(fs.readFileSync(file,'utf8')!=='ok') process.exit(23);\n");
  fs.writeFileSync(path.join(f.productRoot, 'good.txt'), 'ok'); fs.writeFileSync(path.join(f.productRoot, 'bad.txt'), 'broken');
  const step = { ...f.step, executor: { type: 'node', file: 'check.mjs' }, reuse: { scope: 'backend' as const, inputs: ['BUILDR_CHANGED_PATHS_JSON', 'BUILDR_VERIFICATION_BASE'] } };
  const env = { ...f.options.env, BUILDR_CHANGED_PATHS_JSON: '["good.txt"]', BUILDR_VERIFICATION_BASE: 'base-one' };
  const options = { ...f.options, env, steps: [step] }, snapshot = collectVerificationReuseSnapshot(options);
  const store = createVerificationReuseStore({ ...options, snapshot });
  const result = await runVerificationStep({ name: step.id, command: process.execPath, args: [file], cwd: f.productRoot, env });
  assert.equal(result.status, 'passed'); store.stage(step, result, origin(snapshot.sourceCommit));
  const bundle = store.commit(collectVerificationReuseSnapshot(options), true); assert.equal(bundle.records.length, 1);
  assert.equal(JSON.stringify(snapshot.inputIdentities ?? {}).includes('good.txt'), false, 'only digests of selector values may be retained');
  assert.equal(createVerificationReuseStore({ ...options, snapshot: collectVerificationReuseSnapshot(options) }).lookup(step)?.result.status, 'passed');
  for (const changed of [{ BUILDR_CHANGED_PATHS_JSON: '' }, { BUILDR_CHANGED_PATHS_JSON: '["bad.txt"]' }, { BUILDR_VERIFICATION_BASE: 'base-two' }]) {
    const current = { ...options, env: { ...env, ...changed } }, after = collectVerificationReuseSnapshot(current);
    assert.equal(createVerificationReuseStore({ ...current, snapshot: after, imports: [bundle], portableImports: true }).lookup(step), null);
    assert.equal(validateVerificationReuseRecord(bundle.records[0], { ...current, snapshot: after, step }), false);
    assert.deepEqual(createVerificationReuseIdentity(f.step, after), createVerificationReuseIdentity(f.step, snapshot));
  }
  const full = await runVerificationStep({ name: step.id, command: process.execPath, args: [file], cwd: f.productRoot, env: { ...env, BUILDR_CHANGED_PATHS_JSON: '' } });
  assert.equal(full.status, 'failed'); assert.equal(full.childExitCode, 23);
});
