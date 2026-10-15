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
  for (const workers of [1, 2, 3]) {
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
  assert.equal(peak, 3);
  for (const value of ['0', '-1', '1.5', 'many', '4']) {
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
    const actualLeaf = fs.readFileSync(leafPath, 'utf8');
    // Controlled old failure: the leaf ignores a one-worker grant and starts two workers.
    fs.writeFileSync(leafPath, actualLeaf.replace('`--test-concurrency=${budget}`', "'--test-concurrency=2'"));
    const ignoredGrant = await execute({ ...frontend, timeoutMs: 30_000 }, { resourceGrant: { workers: 1, processes: 1 } });
    assert.equal(ignoredGrant.status, 'passed', ignoredGrant.stderr);
    assert.match(ignoredGrant.stdout, /observedConcurrentTestWorkers:2/u);
    fs.writeFileSync(leafPath, actualLeaf);
    for (const workers of [1, 2]) {
      const result = await execute({ ...frontend, timeoutMs: 30_000 }, { resourceGrant: { workers, processes: workers } });
      assert.equal(result.status, 'passed', result.stderr);
      assert.match(result.stdout, /tests 2/u, result.stderr);
      const observed = [...result.stdout.matchAll(/observedConcurrentTestWorkers:(\d+)/gu)].map(match => Number(match[1]));
      assert.equal(observed.length, 2, result.stdout);
      assert.equal(Math.max(...observed), workers, result.stdout);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
