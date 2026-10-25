import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createVerificationExecutor } from '../verification/executor.ts';
import { verificationSteps } from '../verification/registry.ts';
import { mapParityWorkspaces } from '../verification/runtime/adapter-parity.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const frontend = verificationSteps.find((step: any) => step.id === 'frontend-logic');

test('runtime parity workspaces obey outer worker grants while retaining every scenario', async () => {
  const scenarios = [0, 1, 2, 3, 4, 5, 6];
  for (const workers of [1, 2]) {
    let active = 0, peak = 0;
    const result = await mapParityWorkspaces(scenarios, async scenario => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      active--; return scenario;
    }, { BUILDR_VERIFICATION_WORKER_BUDGET: String(workers) });
    assert.deepEqual(result, scenarios);
    assert.equal(active, 0); assert.equal(peak, workers);
  }
});

test('runtime parity retains its standalone limit and rejects invalid grants before scheduling work', async () => {
  let active = 0, peak = 0, calls = 0;
  await mapParityWorkspaces([0, 1, 2, 3], async () => {
    active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => setImmediate(resolve)); active--;
  }, {});
  assert.equal(peak, 2);
  for (const value of ['0', '-1', '1.5', 'many', '3', '4']) {
    assert.throws(() => mapParityWorkspaces([0], () => { calls++; }, { BUILDR_VERIFICATION_WORKER_BUDGET: value }), /worker budget/u);
  }
  assert.equal(calls, 0);
});

test('frontend real leaf obeys one- and two-worker grants without dropping either test file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-frontend-worker-grant-'));
  try {
    const backendRoot = path.join(root, 'buildr');
    const webRoot = path.join(root, 'buildr-web');
    fs.mkdirSync(backendRoot);
    fs.mkdirSync(path.join(webRoot, 'tools'), { recursive: true });
    fs.mkdirSync(path.join(webRoot, 'test'));
    fs.copyFileSync(path.join(serviceRoot, '../buildr-web/tools/run-logic-tests.mjs'), path.join(webRoot, 'tools/run-logic-tests.mjs'));
    for (const file of ['first', 'second']) {
      fs.writeFileSync(path.join(webRoot, 'test', `${file}.test.mjs`), `import test from 'node:test';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport {setTimeout} from 'node:timers/promises';\ntest('${file} leaf', async () => {\nconst active=path.join(import.meta.dirname,'active');fs.mkdirSync(active,{recursive:true});\nconst marker=path.join(active,'${file}');fs.writeFileSync(marker,'active');\nconsole.log('observedConcurrentTestWorkers:'+fs.readdirSync(active).length);\nawait setTimeout(250);fs.rmSync(marker);\n});\n`);
    }
    // A nested Node test runner must be a new process, not inherit node:test's internal child marker.
    const execute = createVerificationExecutor({ productRoot: backendRoot, minimumNodeVersion: '24.15.0', env: { NODE_TEST_CONTEXT: undefined } });
    const leafPath = path.join(webRoot, 'tools/run-logic-tests.mjs');
    const fixtureStep = { ...frontend, preparations: [], serviceRoot: webRoot,
      executor: { ...frontend.executor, args: [leafPath], cwd: webRoot } };
    const actualLeaf = fs.readFileSync(leafPath, 'utf8');
    // Controlled old failure: the leaf ignores a one-worker grant and starts two workers.
    fs.writeFileSync(leafPath, actualLeaf.replace('`--test-concurrency=${budget}`', "'--test-concurrency=2'"));
    const ignoredGrant = await execute({ ...fixtureStep, timeoutMs: 30_000 }, { resourceGrant: { workers: 1, processes: 1 } });
    assert.equal(ignoredGrant.status, 'passed', ignoredGrant.stderr);
    assert.match(ignoredGrant.stdout, /observedConcurrentTestWorkers:2/u);
    fs.writeFileSync(leafPath, actualLeaf);
    for (const workers of [1, 2]) {
      const result = await execute({ ...fixtureStep, timeoutMs: 30_000 }, { resourceGrant: { workers, processes: workers } });
      assert.equal(result.status, 'passed', result.stderr);
      assert.match(result.stdout, /tests 2/u, result.stderr);
      const observed = [...result.stdout.matchAll(/observedConcurrentTestWorkers:(\d+)/gu)].map(match => Number(match[1]));
      assert.equal(observed.length, 2, result.stdout);
      assert.equal(Math.max(...observed), workers, result.stdout);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the real complete unit executor obeys granted workers without an unbounded npm test child', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-unit-worker-grant-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'test/unit'), { recursive: true });
  fs.copyFileSync(path.join(serviceRoot, 'test/register-development-entry.ts'), path.join(root, 'test/register-development-entry.ts'));
  fs.mkdirSync(path.join(root, 'tools/development'), { recursive: true });
  fs.copyFileSync(path.join(serviceRoot, 'tools/development/isolated-workspace-state.ts'), path.join(root, 'tools/development/isolated-workspace-state.ts'));
  for (const file of ['tools/testing/run-service-tests.ts', 'test/verification/worker-budget.ts']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(serviceRoot, file), path.join(root, file));
  }
  for (const name of ['first', 'second']) {
    fs.writeFileSync(path.join(root, 'test/unit', `${name}.test.ts`), `import test from 'node:test';
import fs from 'node:fs'; import path from 'node:path';
test('${name} controlled leaf', async () => {
  const markers=path.join(import.meta.dirname,'active'); fs.mkdirSync(markers,{recursive:true});
  const own=path.join(markers,'${name}'); fs.writeFileSync(own,'active');
  console.log('observedConcurrentTestWorkers:'+fs.readdirSync(markers).length);
  try { await new Promise(resolve=>setTimeout(resolve,250)); } finally { fs.rmSync(own); }
});
`);
  }
  const registered = verificationSteps.find((step: any) => step.id === 'unit');
  // Keep the real command and selectors, but bind them to this controlled service.
  const unit = { ...registered, preparations: [], serviceRoot: root,
    executor: { ...registered.executor, cwd: root } };
  const execute = createVerificationExecutor({ productRoot: root, minimumNodeVersion: '24.15.0', env: { NODE_TEST_CONTEXT: undefined } });
  for (const workers of [1, 2]) {
    const result = await execute({ ...unit, timeoutMs: 30_000 }, { resourceGrant: { workers, processes: workers } });
    assert.equal(result.status, 'passed', result.stderr);
    assert.match(result.stdout, /tests 2/u);
    const observed = [...result.stdout.matchAll(/observedConcurrentTestWorkers:(\d+)/gu)].map(match => Number(match[1]));
    assert.equal(observed.length, 2, result.stdout);
    assert.equal(Math.max(...observed), workers, result.stdout);
  }
});

test('parallel parity child processes retain private application, resources and temporary state', async () => {
  const { ParityVerificationHarness } = await import('../verification/runtime/adapter-parity.ts');
  const { ensurePackageResources } = await import('../../src/infrastructure/product-resources/shared-resources.ts');
  ensurePackageResources();
  const harness = new ParityVerificationHarness();
  try {
    const seed = harness.createTemporaryDirectory('buildr-parity-isolation-seed-');
    fs.writeFileSync(path.join(seed, 'seed.txt'), 'immutable seed');
    const child = path.join(seed, 'child.mjs');
    fs.writeFileSync(child, `import fs from 'node:fs'; import path from 'node:path';
const env=process.env; fs.mkdirSync(env.BUILDR_APP_DATA_DIR,{recursive:true});
const marker=path.join(env.BUILDR_APP_DATA_DIR,'marker'); const previous=fs.existsSync(marker);
fs.writeFileSync(marker,'private'); fs.writeFileSync(path.join(env.BUILDR_PRODUCT_DATA_DIR,'resources','private-marker'),'private');
console.log(JSON.stringify({app:env.BUILDR_APP_DATA_DIR,product:env.BUILDR_PRODUCT_DATA_DIR,tmp:env.TMPDIR,previous}));`);
    const childHarness = new ParityVerificationHarness({ buildr: child });
    try {
      const workspaces = [0, 1].map(index => childHarness.cloneWorkspace(seed, `buildr-parity-isolation-${index}-`));
      const outputs = await Promise.all(workspaces.map(workspace => childHarness.runAsync(['--target', workspace])));
      const states = outputs.map(output => JSON.parse(output.stdout));
      for (const field of ['app', 'product', 'tmp']) assert.notEqual(states[0][field], states[1][field]);
      assert.deepEqual(states.map(state => state.previous), [false, false]);
      assert.equal(JSON.parse(childHarness.run(['--target', workspaces[0]]).stdout).previous, true);
      fs.rmSync(path.join(states[0].product, 'resources', 'private-marker'));
      assert.ok(fs.existsSync(path.join(states[1].product, 'resources', 'private-marker')));
      assert.equal(fs.readFileSync(path.join(seed, 'seed.txt'), 'utf8'), 'immutable seed');
      assert.equal(childHarness.peakCommands, 2);
    } finally { childHarness.cleanup(); }
  } finally { harness.cleanup(); }
});
