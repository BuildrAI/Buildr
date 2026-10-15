import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { collectVerificationReuseSnapshot, collectVerificationReuseBundle, createVerificationReuseIdentity, createVerificationReuseStore, createVerificationPlanReuse, reusedVerificationResult, validateVerificationReuseRecord } from '../verification/verification-reuse.ts';
import { executePlan } from '../verification/plan-runner.ts';

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
function origin(sourceCommit: string) { return { kind: 'local' as const, runId: 'source-fixture', sourceCommit, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }; }

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
  const f = fixture(t); let calls = 0, fail = false;
  const plan = { status: 'ready', paths: [], steps: [{ ...f.step, dependsOn: [], contexts: [] }] };
  const options = { ...f.options, runId: 'plan-fixture', concurrency: 1, resourceCoordinator: { root: path.join(f.root, 'resources') },
    executorFactory: () => async () => { calls++; return fail ? { ...passed, status: 'failed', exitCode: 1, childOutcome: 'failed', childExitCode: 1 } : { ...passed }; } };
  const first = await executePlan(plan, options);
  assert.equal(first.passed, true); assert.equal(first.sourceBundle.records.length, 1);
  const next = await executePlan(plan, options);
  assert.equal(calls, 1); assert.equal(next.results[0].disposition, 'reused'); assert.equal(next.results[0].durationMs, 0);
  fail = true;
  const forced = await executePlan(plan, { ...options, reuse: { force: true } });
  assert.equal(forced.passed, false); assert.equal(calls, 2);
  await executePlan(plan, options);
  assert.equal(calls, 3);
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
