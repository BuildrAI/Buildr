import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceVerificationPlan, parseSourceArgs, sourceOnlyVerificationSteps } from '../verification/source.ts';

test('source flags keep plan-only output, force and portable export explicit', () => {
  assert.deepEqual(parseSourceArgs([]), { help: false, json: false, force: false, output: null });
  assert.deepEqual(parseSourceArgs(['--json', '--force', '--output', '/tmp/source.json']), { help: false, json: true, force: true, output: '/tmp/source.json' });
  for (const args of [['--output'], ['--output', '--force'], ['--unknown'], ['unit'], ['--help', '--json'], ['--output', 'one', '--output', 'two']]) assert.throws(() => parseSourceArgs(args));
});

test('source selection removes artifact creation, consumption and all transitive dependants', () => {
  const node = (id: string, dependsOn: string[] = [], executor: any = { type: 'node' }) => ({ id, dependsOn, executor });
  const result = sourceOnlyVerificationSteps([
    node('source'), node('archive', [], { type: 'candidate-artifact' }), node('consumer', [], { type: 'node', consumesArtifact: true }),
    node('indirect', ['archive']), node('later', ['indirect']), node('missing', ['undeclared']), node('valid', ['source']),
  ]);
  assert.deepEqual(result.steps.map(step => step.id), ['source', 'valid']);
  assert.deepEqual(result.excludedStepIds, ['archive', 'consumer', 'indirect', 'later', 'missing']);
});

test('macOS source includes source nodes from mixed artifact shards and excludes actual final-package checks', () => {
  const plan = createSourceVerificationPlan('darwin');
  const ids = plan.steps.map((step: any) => step.id);
  assert.equal(plan.status, 'ready');
  assert.equal(ids.includes('application-payload-release'), false);
  assert.ok(ids.includes('npm-launcher-candidate'));
  assert.ok(ids.includes('integration-candidate-release-effects'));
  assert.ok(ids.includes('frontend-logic'));
  for (const id of ['system-app-process', 'system-runtime-recovery', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-nested-git-isolation', 'system-workspace-lifecycle', 'workspace-lifecycle', 'runtime-adapter-parity', 'concurrent-task-acceptance', 'openspec-convergence-recovery']) assert.ok(ids.includes(id), id);
  for (const id of ['candidate-tarball', 'artifact-browser-core', 'open-source-candidate', 'cli-package-parity', 'release-tarball-smoke']) assert.equal(ids.includes(id), false, id);
  assert.ok(plan.steps.every((step: any) => step.executor.type !== 'candidate-artifact' && !step.executor.consumesArtifact));
  assert.ok(plan.steps.every((step: any) => step.dependsOn.every((id: string) => ids.includes(id))));
});

test('Windows source preserves its declared coverage without claiming a macOS source proof', () => {
  const plan = createSourceVerificationPlan('win32');
  const ids = plan.steps.map((step: any) => step.id);
  assert.equal(plan.runner, 'windows');
  assert.ok(ids.includes('system-windows-platform'));
  for (const id of ['system-app-process', 'workspace-lifecycle', 'npm-launcher-candidate']) assert.equal(ids.includes(id), false, id);
  assert.equal(ids.includes('frontend-logic'), false);
  assert.equal(ids.includes('release-tarball-smoke'), false);
  assert.equal(createSourceVerificationPlan('unsupported').status, 'blocked');
});
