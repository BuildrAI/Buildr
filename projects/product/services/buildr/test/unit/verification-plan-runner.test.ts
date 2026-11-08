import assert from 'node:assert/strict';
import test from 'node:test';
import { executePlan, localExecutionStep, reusedExecutionStep, prepareVerificationReuse } from '../verification/plan-runner.ts';
import { resolveVerificationExecutionProfile, verificationSteps } from '../verification/registry.ts';
import { runVerificationDag } from '../verification/dag-scheduler.ts';

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

test('local lifecycle IO isolation admits independent work without expanding worker grants', async () => {
  const profile = resolveVerificationExecutionProfile('local');
  const protectedIds = ['agent-integration-startup', 'integration-archify', 'agent-integration'];
  const ids = [...protectedIds, 'agent-integration-native'];
  const definitions = ids.map(id => verificationSteps.find((check: any) => check.id === id));
  const active = new Set<string>(); let independentOverlap = false;
  const input = options(async check => {
    const original = definitions.find(value => value.id === check.id);
    assert.equal(check.resourceDemand.workers, original.resourceDemand.workers);
    active.add(check.id);
    assert.ok(protectedIds.filter(id=>active.has(id)).length<=1, 'IO-sensitive lifecycles must not compete');
    independentOverlap ||= active.has('agent-integration-native') && active.size > 1;
    await new Promise<void>(resolve => setImmediate(resolve));
    active.delete(check.id);
    return {status:'passed',exitCode:0,durationMs:1};
  });
  const result = await runVerificationDag({steps:definitions.map(check=>localExecutionStep(check,profile,profile.limits))},
    {concurrency:profile.limits,executionProfile:profile,execute:input.executorFactory()});
  assert.equal(result.every((value:any)=>value.status==='passed'),true); assert.equal(independentOverlap,true);
  const writer = verificationSteps.find((check:any)=>check.id==='integration');
  assert.equal(localExecutionStep(writer,profile,profile.limits).concurrencyClass,'exclusive');
  assert.equal(localExecutionStep(definitions[0],{id:'ci'},profile.limits),definitions[0]);
  const limited = {...profile.limits,capacities:{...profile.limits.capacities,workspaceIo:1}};
  assert.equal(localExecutionStep(definitions[0],profile,limited).resourceDemand.workspaceIo,1);
  assert.equal(localExecutionStep(definitions[0],profile,2).resourceDemand.workspaceIo,2);
});

test('independent conversation and storage owners share the existing IO capacity with distinct file membership', async () => {
  const profile = resolveVerificationExecutionProfile('local');
  const ids = ['agent-integration','agent-integration-conversations'];
  const definitions = ids.map(id=>verificationSteps.find((check:any)=>check.id===id));
  const active = new Set<string>(); let overlap = false;
  const input = options(async check=>{
    active.add(check.id); overlap ||= ids.every(id=>active.has(id));
    await new Promise<void>(resolve=>setImmediate(resolve));active.delete(check.id);
    return {status:'passed',exitCode:0,durationMs:1};
  });
  const result=await runVerificationDag({steps:definitions.map(check=>localExecutionStep(check,profile,profile.limits))},
    {concurrency:profile.limits,executionProfile:profile,execute:input.executorFactory()});
  assert.equal(result.every((value:any)=>value.status==='passed'),true);assert.equal(overlap,true);
  const [storage,conversations]=definitions;
  assert.equal(storage.resourceDemand.workers+conversations.resourceDemand.workers,3);
  assert.equal(storage.executor.discoveredFiles.includes('../buildr-agent/test/integration/conversations.test.ts'),false);
  assert.deepEqual(conversations.executor.discoveredFiles,['../buildr-agent/test/integration/conversations.test.ts']);
});


test('a cached two-browser owner executes without browser or IO reservation', async () => {
  const definition = verificationSteps.find((check: any) => check.id === 'e2e-browser:agent-conversations');
  const cached = reusedExecutionStep(definition);
  assert.deepEqual(cached.resources, []);
  assert.deepEqual(cached.resourceUnits, {});
  const results = await runVerificationDag({ steps: [cached] }, {
    concurrency: { global: 1, classes: { default: 1 }, resources: {}, capacities: { workers: 1, processes: 1 } },
    resourceCoordinator: { acquire: () => assert.fail('cached results do not acquire child leases') },
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 0 }),
  });
  assert.equal(results[0].status, 'passed');
});
