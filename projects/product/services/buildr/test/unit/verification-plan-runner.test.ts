import assert from 'node:assert/strict';
import test from 'node:test';
import { executePlan, prepareVerificationReuse } from '../verification/plan-runner.ts';

test('owned dependency preparation precedes the environment proof and leaves cached checks untouched', async () => {
  let version = 0;
  const prepared: string[][] = [];
  const result = await prepareVerificationReuse({ steps: [step('cold'), step('cached')] }, async checks => {
    prepared.push(checks.map(check => check.id)); version++;
  }, () => ({ hits: new Map([['cached', {}]]), version }));
  assert.equal(result.version, 1);
  assert.deepEqual(prepared, [['cold']]);
});

test('preparation changing a dependency also prepares checks whose cached proof becomes stale', async () => {
  let version = 0;
  const prepared: string[][] = [];
  const result = await prepareVerificationReuse({ steps: [step('cold'), step('newly-fresh')] }, async checks => {
    prepared.push(checks.map(check => check.id)); version++;
  }, () => ({ hits: new Map(version === 0 ? [['newly-fresh', {}]] : []), version }));
  assert.equal(result.version, 2);
  assert.deepEqual(prepared, [['cold'], ['newly-fresh']]);
});

const step = (id: string, dependsOn: string[] = []) => ({ id, name: id, dependsOn, contexts: [], resources: [], concurrencyClass: 'default' });
function options(execute: (check: any) => Promise<any>) {
  const events: string[] = [];
  return {
    events, productRoot: process.cwd(),
    concurrency: { global: 2, classes: { default: 2 }, resources: {}, innerConcurrency: {} },
    resourceCoordinator: { root: '/fixture-coordination', acquire: () => assert.fail('Resource-free checks must not acquire a project-wide lease.') },
    contextPoolFactory: () => ({ prepareAll: () => [], environment: () => ({}), cleanup: () => { events.push('cleaned'); return { status: 'cleaned', events: [] }; }, events: () => [] }),
    executorFactory: () => execute,
    stream: { write() {} }, errorStream: { write() {} },
  };
}

for (const mode of ['affected', 'full']) test(`${mode} empty selection performs no check or synthetic lease`, async () => {
  const input = options(async () => assert.fail('An empty selection has no executor calls.'));
  const result = await executePlan({ scope: { mode }, steps: [], paths: [], delegated: [] }, input);
  assert.equal(result.passed, true);
  assert.deepEqual(result.results, []);
  assert.deepEqual(input.events, ['cleaned']);
});

test('full source selection executes independent checks without a project-wide lock', async () => {
  const calls: string[] = [];
  const input = options(async check => { calls.push(check.id); return { status: 'passed', exitCode: 0, durationMs: 0 }; });
  const result = await executePlan({ scope: { mode: 'full' }, steps: [step('first'), step('second')], paths: [], delegated: [] }, input);
  assert.equal(result.passed, true);
  assert.deepEqual(calls.sort(), ['first', 'second']);
  assert.deepEqual(input.events, ['cleaned']);
});

test('a failed check preserves independent results and blocks only its dependent check', async () => {
  const calls: string[] = [];
  const input = options(async check => { calls.push(check.id); return { status: check.id === 'failed' ? 'failed' : 'passed', exitCode: check.id === 'failed' ? 1 : 0, durationMs: 0 }; });
  const result = await executePlan({ scope: { mode: 'full' }, steps: [step('failed'), step('independent'), step('dependent', ['failed'])], paths: [], delegated: [] }, input);
  assert.equal(result.passed, false);
  assert.deepEqual(calls.sort(), ['failed', 'independent']);
  assert.equal(result.results.find((value: any) => value.id === 'dependent').status, 'blocked');
  assert.equal(result.results.find((value: any) => value.id === 'independent').status, 'passed');
  assert.deepEqual(input.events, ['cleaned']);
});
