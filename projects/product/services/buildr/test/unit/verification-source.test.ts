import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createSourceVerificationPlan, parseSourceArgs, prepareSourceVerificationEnvironment, sourceOnlyVerificationSteps, sourceVerificationPreparation, sourceVerificationCancellation } from '../verification/source.ts';
import { createPlatformArtifactVerificationPlan, createPlatformSourceVerificationPlan, validateCandidateCiCoverage, validateVerificationRegistry } from '../verification/planner.ts';
import { CANDIDATE_CI_SHARDS, verificationSteps } from '../verification/registry.ts';

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]] as const) test(`source ${signal} requests graceful cancellation and releases its signal listeners`, () => {
  const signals = new EventEmitter();
  const cancellation = sourceVerificationCancellation(signals as any);
  assert.equal(cancellation.signal.aborted, false);
  signals.emit(signal);
  assert.equal(cancellation.signal.aborted, true);
  assert.equal(cancellation.signal.reason, signal);
  assert.equal(cancellation.exitCode(), exitCode);
  cancellation.dispose();
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('source flags keep plan-only output, force and portable export explicit', () => {
  assert.deepEqual(parseSourceArgs([]), { help: false, json: false, force: false, scope: 'all', output: null });
  assert.deepEqual(parseSourceArgs(['--json', '--force', '--output', '/tmp/source.json']), { help: false, json: true, force: true, scope: 'all', output: '/tmp/source.json' });
  assert.equal(parseSourceArgs(['--scope', 'common']).scope, 'common');
  assert.equal(parseSourceArgs(['--scope', 'platform']).scope, 'platform');
  for (const args of [['--scope'], ['--scope', 'windows'], ['--scope', 'common', '--scope', 'platform'], ['--output'], ['--output', '--force'], ['--unknown'], ['unit'], ['--help', '--json'], ['--output', 'one', '--output', 'two']]) assert.throws(() => parseSourceArgs(args));
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

test('macOS source combines common checks with its native source proof and excludes all final-package checks', () => {
  const plan = createSourceVerificationPlan('darwin');
  const ids = plan.steps.map((step: any) => step.id);
  assert.equal(plan.status, 'ready');
  assert.equal(ids.includes('application-payload-release'), false);
  assert.ok(ids.includes('npm-launcher-candidate'));
  assert.ok(ids.includes('integration-candidate-release-effects'));
  assert.ok(ids.includes('frontend-logic'));
  for (const id of ['system-app-process', 'system-runtime-recovery', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-nested-git-isolation', 'system-workspace-lifecycle', 'workspace-lifecycle', 'runtime-adapter-parity', 'concurrent-task-acceptance', 'integration-openspec']) assert.ok(ids.includes(id), id);
  for (const id of ['candidate-tarball', 'artifact-browser-core', 'open-source-candidate', 'cli-package-parity', 'release-tarball-smoke', 'openspec-contract-fixtures', 'openspec-convergence-recovery']) assert.equal(ids.includes(id), false, id);
  assert.ok(plan.steps.every((step: any) => step.executor.type !== 'candidate-artifact' && !step.executor.consumesArtifact));
  assert.ok(plan.steps.every((step: any) => step.dependsOn.every((id: string) => ids.includes(id))));
});

test('common source coverage is identical on Windows and macOS and native proof is independent', () => {
  const ids = (platform: string, scope: 'all' | 'common' | 'platform') => createSourceVerificationPlan(platform, { scope }).steps.map((step: any) => step.id);
  const common = ids('darwin', 'common');
  assert.deepEqual(ids('win32', 'common'), common, 'the development machine does not define another product suite');
  for (const id of ['unit', 'component', 'integration', 'frontend-logic', 'system-app-process', 'workspace-lifecycle', 'npm-launcher-candidate']) assert.ok(common.includes(id), id);
  assert.deepEqual(ids('darwin', 'platform'), ['system-macos-platform']);
  assert.deepEqual(ids('win32', 'platform'), ['system-windows-platform']);
  for (const [platform, native] of [['darwin', 'system-macos-platform'], ['win32', 'system-windows-platform']]) {
    const plan = createSourceVerificationPlan(platform, { scope: 'platform' });
    assert.deepEqual(plan.admissionStepIds, [], 'a missing OS proof must not start the common fast suite again');
    assert.deepEqual([...ids(platform, 'all')].sort(), [...common, native].sort());
  }
  assert.equal(createSourceVerificationPlan('unsupported').status, 'blocked');
});

test('platform source and original-package plans cannot execute each other or rebuild the original', () => {
  for (const [runner, native] of [['macos', 'system-macos-platform'], ['windows', 'system-windows-platform']]) {
    const source = createPlatformSourceVerificationPlan({ runner });
    const artifact = createPlatformArtifactVerificationPlan({ runner });
    assert.deepEqual(source.steps.map((step: any) => step.id), [native]);
    assert.deepEqual(artifact.steps.map((step: any) => step.id), ['release-tarball-smoke']);
    assert.equal(artifact.requiresArtifact, true);
    assert.ok(artifact.steps.every((step: any) => step.executor.consumesArtifact && step.executor.type !== 'candidate-artifact' && step.dependsOn.length === 0));
    assert.deepEqual(source.admissionStepIds, []);
    assert.deepEqual(artifact.admissionStepIds, []);
  }
  assert.throws(() => createPlatformSourceVerificationPlan({ runner: 'unknown' }));
});

test('candidate groups separate common original-package tests from native launchers using explicit scope', () => {
  const common = CANDIDATE_CI_SHARDS.find((shard: any) => shard.id === 'core-package-runtime-release-macos');
  assert.deepEqual(common.platformScope, { kind: 'common', runners: [] });
  assert.deepEqual(common.stepIds, ['application-payload-release', 'open-source-candidate', 'cli-package-parity']);
  for (const runner of ['macos', 'windows']) {
    const native = CANDIDATE_CI_SHARDS.find((shard: any) => shard.id === `runtime-${runner}`);
    assert.deepEqual(native.platformScope, { kind: 'platform', runners: [runner] });
    assert.deepEqual(native.stepIds, ['release-tarball-smoke']);
  }
  const movedCommon = CANDIDATE_CI_SHARDS.map((shard: any) => shard.id === common.id ? { ...shard, runner: 'windows' } : shard);
  assert.equal(validateCandidateCiCoverage(verificationSteps, movedCommon).ok, true, 'a common check may run once on the Windows developer machine');
  const concealed = CANDIDATE_CI_SHARDS.map((shard: any) => shard.id === 'runtime-windows' ? { ...shard, platformScope: { kind: 'common', runners: [] } } : shard);
  assert.ok(validateCandidateCiCoverage(verificationSteps, concealed).findings.some((item: any) => item.code === 'candidate_platform_check_in_common_shard'));
  const invalid = verificationSteps.map((step: any) => step.id === 'system-macos-platform' ? { ...step, platformScope: { kind: 'platform', runners: ['unknown'] } } : step);
  assert.ok(validateVerificationRegistry(invalid).findings.some((item: any) => item.code === 'invalid_platform_scope'));
});

test('source preparation follows actual missing checks without preparing reused runtime checks', () => {
  const plan = { steps: [{ id: 'typecheck' }, { id: 'frontend-logic' }, { id: 'system-app-process' }] };
  const reuse = (execute: string[]) => ({ steps: plan.steps.map(step => ({ id: step.id, disposition: execute.includes(step.id) ? 'execute' : 'reuse' })) });
  assert.deepEqual(sourceVerificationPreparation(plan, reuse(['typecheck'])), { profile: 'base', stepIds: ['typecheck'] });
  assert.equal(sourceVerificationPreparation(plan, reuse(['frontend-logic'])).profile, 'frontend');
  assert.equal(sourceVerificationPreparation(plan, reuse(['system-app-process'])).profile, 'source-runtime');
  assert.deepEqual(sourceVerificationPreparation(plan, reuse([])), { profile: null, stepIds: [] });
  assert.equal(sourceVerificationPreparation({ steps: [{ id: 'unregistered' }] }, { steps: [] }).profile, 'source-runtime', 'unknown requirements remain conservative');
});

test('source preparation observes reuse first and preserves valid preparation receipts', () => {
  const plan = { steps: [{ id: 'typecheck' }, { id: 'system-app-process' }] };
  const events: string[] = [];
  const reuse = { steps: [{ id: 'typecheck', disposition: 'execute' }, { id: 'system-app-process', disposition: 'reuse' }] };
  const result = prepareSourceVerificationEnvironment(plan, { force: false }, {
    inspectReuse: () => { events.push('inspect'); return reuse; },
    prepareEnvironment: (options: any) => {
      events.push(options.profile);
      assert.equal(options.reusePrepared, true);
      assert.equal(options.preparationReuseOptions.force, false);
      return { status: 'passed', profile: options.profile };
    },
  });
  assert.deepEqual(events, ['inspect', 'base', 'inspect'], 'a fresh typecheck must not prepare frontend dependencies or build Web');
  assert.equal(result.reuse, reuse);
  assert.equal(result.preparations.length, 1);
});

test('dependency preparation rechecks misses and expands only to newly required environments', () => {
  const plan = { steps: [{ id: 'typecheck' }, { id: 'system-app-process' }] };
  const events: string[] = [];
  let observations = 0;
  const result = prepareSourceVerificationEnvironment(plan, { force: false }, {
    inspectReuse: () => {
      events.push('inspect'); observations++;
      return { steps: [{ id: 'typecheck', disposition: 'execute' }, { id: 'system-app-process', disposition: observations > 1 ? 'execute' : 'reuse' }] };
    },
    prepareEnvironment: (options: any) => { events.push(options.profile); return { profile: options.profile }; },
  });
  assert.deepEqual(events, ['inspect', 'base', 'inspect', 'source-runtime', 'inspect']);
  assert.equal(result.preparation.profile, 'source-runtime');
  assert.deepEqual(result.preparation.stepIds, ['typecheck', 'system-app-process']);
});

test('a fully reusable source plan needs no preparation and force still reaches the preparation owner', () => {
  const plan = { steps: [{ id: 'component' }] };
  const reusable = prepareSourceVerificationEnvironment(plan, {}, {
    inspectReuse: () => ({ steps: [{ id: 'component', disposition: 'reuse' }] }),
    prepareEnvironment: () => assert.fail('a complete applicable proof needs no preparation'),
  });
  assert.deepEqual(reusable.preparations, []);
  let preparations = 0;
  prepareSourceVerificationEnvironment(plan, { force: true }, {
    inspectReuse: () => ({ steps: [{ id: 'component', disposition: 'execute' }] }),
    prepareEnvironment: (options: any) => { preparations++; assert.equal(options.preparationReuseOptions.force, true); return {}; },
  });
  assert.equal(preparations, 1);
});

test('environment force prepares runtime checks even when their ordinary source results are reusable', () => {
  const plan = { steps: [{ id: 'typecheck' }, { id: 'system-app-process' }] };
  const env = { BUILDR_VERIFICATION_FORCE: '1' };
  const prepared: string[] = [];
  const result = prepareSourceVerificationEnvironment(plan, { force: false, env }, {
    inspectReuse: (_plan: any, options: any) => ({ steps: plan.steps.map(step => ({ id: step.id,
      disposition: options.force || step.id === 'typecheck' ? 'execute' : 'reuse' })) }),
    prepareEnvironment: (options: any) => {
      prepared.push(options.profile);
      assert.equal(options.preparationReuseOptions.force, true);
      return {};
    },
  });
  assert.deepEqual(prepared, ['source-runtime']);
  assert.deepEqual(result.preparation.stepIds, ['typecheck', 'system-app-process']);
  assert.deepEqual(env, { BUILDR_VERIFICATION_FORCE: '1' });
});
