import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCandidateResumeScope, createCandidateRoundExecution, emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';
import { createVerificationReuseIdentity } from '../verification/verification-reuse.ts';

function record(id: string): any {
  return roundResult({ id, status: 'passed', exitCode: 0, durationMs: 1 }, 'round',
    { kind: 'local', runId: 'run', sourceCommit: 'source', startedAt: '2026-10-20T00:00:00.000Z', finishedAt: '2026-10-20T00:00:00.001Z' },
    { platform: 'darwin', arch: 'arm64', nodeVersion: '24.15.0' });
}

test('explicit invalidation executes only the selected steps while retaining other passed records', () => {
  const imports = { ...emptyCandidateRound('round'), records: [record('unit'), record('native')] };
  const execution = createCandidateRoundExecution({ runner: 'darwin', steps: [
    { id: 'unit', platformScope: { kind: 'common' } },
    { id: 'native', platformScope: { kind: 'common' } },
  ] }, { productRoot: process.cwd(), round: { roundId: 'round', imports, invalidStepIds: ['unit'] } }, { sourceHead: () => 'source' });
  assert.equal(execution.hits.has('unit'), false);
  assert.equal(execution.hits.has('native'), true);
  assert.deepEqual(execution.explanation.steps.find((step: any) => step.id === 'unit').reasons, ['source-inputs-changed']);
  assert.equal(execution.explanation.estimate.executedCount, 1);
  assert.equal(execution.explanation.estimate.reusedCount, 1);
});

test('candidate round reuses a passed check when changed source is outside its ownership', () => {
  const step = {
    id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' as const },
    executor: { type: 'node', file: 'test/verification/example.ts' },
  };
  const environment = { platform: 'darwin', arch: 'arm64', nodeVersion: process.versions.node,
    variablesIdentity: `sha256-${'1'.repeat(64)}`, tools: { 'backend-dependencies': `sha256-${'2'.repeat(64)}`,
      'web-dependencies': `sha256-${'3'.repeat(64)}` } };
  const oldSnapshot: any = { productRoot: process.cwd(), repositoryRoot: process.cwd(), sourceCommit: 'source',
    contentIdentities: { repository: `sha256-${'4'.repeat(64)}`, backend: `sha256-${'5'.repeat(64)}`,
      'platform-backend': `sha256-${'6'.repeat(64)}`, web: `sha256-${'7'.repeat(64)}`, plugin: `sha256-${'8'.repeat(64)}`,
      product: `sha256-${'9'.repeat(64)}`, runtime: `sha256-${'a'.repeat(64)}` }, environment };
  const previous = createVerificationReuseIdentity(step, oldSnapshot)!;
  const record = roundResult({ id: step.id, status: 'passed', exitCode: 0, durationMs: 1, inputIdentity: previous },
    'round', { kind: 'local', runId: 'run', sourceCommit: 'source', startedAt: '2026-10-20T00:00:00.000Z',
      finishedAt: '2026-10-20T00:00:00.001Z' }, { platform: 'darwin', arch: 'arm64', nodeVersion: process.versions.node });
  const imports = { ...emptyCandidateRound('round'), records: [record] };
  const currentSnapshot = { ...oldSnapshot, contentIdentities: { ...oldSnapshot.contentIdentities,
    repository: `sha256-${'b'.repeat(64)}` } };
  const execute = (changed: string[]) => createCandidateRoundExecution({ runner: 'darwin', steps: [step] },
    { productRoot: process.cwd(), round: { roundId: 'round', imports } },
    { collectSnapshot: () => currentSnapshot, changedPaths: () => changed });

  assert.equal(execute(['projects/product/services/buildr/src/modules/code/application/example.ts']).hits.has(step.id), true);
  assert.equal(execute(['projects/product/services/buildr/src/modules/connection-skills/application/example.ts']).hits.has(step.id), false);
  const strict = (committed: any) => createCandidateRoundExecution({ runner: 'darwin', steps: [step] },
    { productRoot: process.cwd(), round: { roundId: 'round', imports, strictInputs: true } }, {
      sourceHead: () => 'next', changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'],
      collectSnapshot: () => ({ ...currentSnapshot, historicalInputs: (commit: string) => commit === 'source' ? oldSnapshot : committed }),
    });
  if (process.platform === environment.platform && process.arch === environment.arch) {
    assert.equal(strict(currentSnapshot).hits.has(step.id), true);
    assert.equal(strict(oldSnapshot).hits.has(step.id), false);
  }
});

test('user-selected scope executes selected checks and retains other passed records without fresh identity', () => {
  const step = (id: string) => ({
    id, platformScope: { kind: 'common' as const }, reuse: { scope: 'repository' as const },
    executor: { type: 'node', file: `test/verification/${id}.ts` },
  });
  const imports = { ...emptyCandidateRound('round'), records: [record('selected'), record('retained')] };
  const execution = createCandidateRoundExecution({ runner: 'darwin', steps: [step('selected'), step('retained')] },
    { productRoot: process.cwd(), round: { roundId: 'round', imports, invalidStepIds: ['selected'], selectedStepIds: ['selected'] } },
    { collectSnapshot: () => null, changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'] });
  assert.equal(execution.hits.has('selected'), false);
  assert.equal(execution.hits.has('retained'), true);
  assert.deepEqual(execution.explanation.steps.find((item: any) => item.id === 'selected').reasons, ['source-inputs-changed']);
  assert.deepEqual(execution.explanation.steps.find((item: any) => item.id === 'retained').reasons, ['retained-by-user-instruction']);
  const log = execution.finish([{ id: 'selected', status: 'passed', exitCode: 0, durationMs: 1, startedAt: '2026-10-20T00:00:00.000Z',
    finishedAt: '2026-10-20T00:00:00.001Z', childOutcome: 'passed', childExitCode: 0, childSignal: null, processCleanup: { status: 'clean' } }], true);
  assert.equal(log.records.find((item: any) => item.identity.stepId === 'retained').result.retainedByUserInstruction, true);
});

for (const failedFirst of [false, true]) test(failedFirst ? 'strict continuation runs only the failed file' : 'strict continuation runs only the changed file', async () => {
  const step = { id: 'group', inputs: ['test/**'], executor: { type: 'node-test', files: ['test/a.ts', 'test/b.ts'] },
    platformScope: { kind: 'native' }, reuse: { scope: 'repository' } };
  const plan = { steps: [step] };
  const prior = emptyCandidateRound('round');
  const files = step.executor.files.map(file => ({ ...step, id: `${step.id}:${file}`, executor: { ...step.executor, files: [file] } }));
  const before = { group: 'head-1', 'group:test/a.ts': 'a-1', 'group:test/b.ts': 'b-1' } as Record<string, string>;
  const after = { ...before, group: 'head-2', 'group:test/b.ts': 'b-2' };
  const create = (log: any, head: string, keys: Record<string, string>) => createCandidateRoundExecution(plan,
    { productRoot: process.cwd(), round: { roundId: 'round', imports: log, strictInputs: true } },
    { sourceHead: () => head, changedPaths: () => ['projects/product/services/buildr/test/b.ts'],
      fileSteps: () => files, inputsFor: ({ id }: any) => ({ stepId: id, key: keys[id], contentIdentity: keys[id], recipeIdentity: 'recipe', environmentIdentity: 'env' }) });
  const invoked: string[][] = [];
  const executor = async (check: any) => {
    invoked.push(check.executor.files);
    const failed = failedFirst && invoked.length === 1;
    return { id: step.id, status: failed ? 'failed' : 'passed', exitCode: failed ? 1 : 0, childSignal: null, processCleanup: { status: 'clean' }, durationMs: 1,
      stderr: check.executor.files.map((entryFile: string) => '[buildr-integration-progress] ' + JSON.stringify({ entryFile, status: failed && entryFile === 'test/b.ts' ? 'failed' : 'passed', durationMs: 1 })).join('\n') };
  };
  const first = create(prior, 'head-1', before);
  const firstLog = first.finish([await first.executeFiles(step, executor, {})], true);
  const repair = create(firstLog, failedFirst ? 'head-1' : 'head-2', failedFirst ? before : after);
  assert.equal(repair.fullRerun, false);
  assert.deepEqual(repair.explanation.steps[0].files, { reuse: 1, execute: 1 });
  const repairedLog = repair.finish([await repair.executeFiles(step, executor, {})], true);
  assert.deepEqual(invoked, [step.executor.files, ['test/b.ts']]);
  const repeated = create(repairedLog, failedFirst ? 'head-1' : 'head-2', failedFirst ? before : after);
  assert.equal(repeated.explanation.estimate.executedCount, 0);
  assert.ok(repeated.hits.has(step.id));
});

test('continuation with no usable baseline reports full rerun before starting an executor', async () => {
  const { executePlan } = await import('../verification/plan-runner.ts');
  const plan = { steps: [{ id: 'unit' }, { id: 'integration' }] };
  let called = false;
  await assert.rejects(executePlan(plan, { productRoot: process.cwd(),
    executorFactory: () => { called = true; throw new Error('executor must not be created'); },
    round: { roundId: 'round', resume: true, protectResume: true } }), /candidate-full-rerun-required.*全部 2 项/u);
  assert.equal(called, false);
  const options = { productRoot: process.cwd() };
  assert.doesNotThrow(() => assertCandidateResumeScope(createCandidateRoundExecution(plan,
    { ...options, round: { roundId: 'first' } }).explanation));
  assert.doesNotThrow(() => assertCandidateResumeScope(createCandidateRoundExecution(plan,
    { ...options, force: true, round: { roundId: 'round', resume: true, allowFullRerun: true } }).explanation));
});
