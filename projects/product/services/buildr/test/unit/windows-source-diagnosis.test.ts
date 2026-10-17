import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateCiShardPlan } from '../verification/planner.ts';
import { createWindowsSourceDiagnosisPlan, runWindowsSourceDiagnosis, validateWindowsSourceDiagnosis,
  WINDOWS_SOURCE_DIAGNOSIS_SCHEMA, WINDOWS_SOURCE_DIAGNOSIS_SCENARIO } from '../verification/release/windows-source-diagnosis.ts';

const source = 'b'.repeat(40), tree = 'c'.repeat(40);
const env = { DIAGNOSTIC_SCENARIO: WINDOWS_SOURCE_DIAGNOSIS_SCENARIO, DIAGNOSTIC_OUTPUT: '/diagnosis',
  GITHUB_SHA: source, EXPECTED_SOURCE_TREE: tree };
const facts = { head: source, tree, dirty: false };
const packageKeys = ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST',
  'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC'];
const result = () => ({ id: 'system-app-process', status: 'passed', exitCode: 0, childOutcome: 'passed', childExitCode: 0,
  childSignal: null, durationMs: 12_345, processCleanup: { status: 'clean' } });

test('source diagnosis accepts only full exact clean source identities and its closed scenario', () => {
  assert.doesNotThrow(() => validateWindowsSourceDiagnosis(env, facts));
  assert.doesNotThrow(() => validateWindowsSourceDiagnosis({ ...env, GITHUB_SHA: 'a'.repeat(64), EXPECTED_SOURCE_TREE: 'd'.repeat(64) },
    { head: 'a'.repeat(64), tree: 'd'.repeat(64), dirty: false }));
  for (const value of ['', 'HEAD', source.slice(0, 12), source.toUpperCase(), 'a'.repeat(41)]) {
    assert.throws(() => validateWindowsSourceDiagnosis({ ...env, GITHUB_SHA: value }, { ...facts, head: value }), /diagnosis-check-source-mismatch/u);
    assert.throws(() => validateWindowsSourceDiagnosis({ ...env, EXPECTED_SOURCE_TREE: value }, { ...facts, tree: value }), /diagnosis-check-tree-mismatch/u);
  }
  for (const changed of [{ head: 'a'.repeat(40) }, { tree: 'a'.repeat(40) }, { dirty: true }]) {
    assert.throws(() => validateWindowsSourceDiagnosis(env, { ...facts, ...changed }), /diagnosis-check/u);
  }
  for (const scenario of [undefined, '', 'runtime-windows', 'package-consumer-windows', 'all', 'toString']) {
    assert.throws(() => validateWindowsSourceDiagnosis({ ...env, DIAGNOSTIC_SCENARIO: scenario }, facts), /diagnosis-unknown-scenario/u);
  }
});

test('source diagnosis keeps the one registered owner recipe and its original budget without any package owner', () => {
  const plan = createWindowsSourceDiagnosisPlan(WINDOWS_SOURCE_DIAGNOSIS_SCENARIO);
  const original = createCandidateCiShardPlan('runtime-source-macos', { externalArtifact: false });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.primaryStepIds, ['system-app-process']);
  assert.deepEqual(plan.steps, original.steps.filter((step: any) => step.id === 'system-app-process'));
  assert.equal(plan.steps[0].timeoutMs, 360_000);
  assert.equal(plan.steps.some((step: any) => step.executor.type === 'candidate-artifact' || step.executor.consumesArtifact), false);
  for (const scenario of ['runtime-windows', 'all', 'toString']) assert.throws(() => createWindowsSourceDiagnosisPlan(scenario), /diagnosis-unknown-scenario/u);
});

test('Windows file diagnosis selects only its native source owner and cannot count as a complete candidate', async () => {
  const nativeEnv = { ...env, DIAGNOSTIC_SCENARIO: 'readonly-files-windows' };
  assert.doesNotThrow(() => validateWindowsSourceDiagnosis(nativeEnv, facts));
  const plan = createWindowsSourceDiagnosisPlan(nativeEnv.DIAGNOSTIC_SCENARIO);
  assert.deepEqual(plan.primaryStepIds, ['system-windows-platform']);
  assert.deepEqual(plan.steps.map((step: any) => step.id), ['system-windows-platform']);
  assert.ok(plan.steps.every((step: any) => !step.executor.consumesArtifact && step.executor.type !== 'candidate-artifact'));
  const summary = await runWindowsSourceDiagnosis({ env: nativeEnv }, {
    platform: 'win32', readGitFacts: () => facts, writeSummary: () => {},
    execute: async (_plan, options) => {
      assert.equal(options.reuse, false);
      const completed = { ...result(), id: 'system-windows-platform' };
      options.onComplete(completed);
      return { passed: true, results: [completed] };
    },
  });
  assert.equal(summary.status, 'passed');
  assert.equal(summary.aggregateEligible, false);
});

test('fresh source diagnosis masks every inherited package input and retains actual projected execution facts', async () => {
  const saved: any[] = []; let sourceReads = 0;
  const summary = await runWindowsSourceDiagnosis({ env: { ...env, ...Object.fromEntries(packageKeys.map(key => [key, '/private-old-package'])),
    DIAGNOSTIC_CANDIDATE_RUN_ID: 'not-read', DIAGNOSTIC_CANDIDATE_SOURCE: 'not-read', DIAGNOSTIC_RUN_JSON: '/never-read', DIAGNOSTIC_ARTIFACT_DIR: '/never-read' },
    productRoot: '/repo/projects/product/services/buildr' }, {
    platform: 'win32', readGitFacts: () => { sourceReads++; return facts; },
    writeSummary: (_directory, value) => saved.push(structuredClone(value)),
    execute: async (plan, options) => {
      assert.deepEqual(plan.steps.map((step: any) => step.id), ['system-app-process']);
      assert.equal(options.reuse, false); assert.equal(options.executionProfile.id, 'ci-workspace-limited');
      assert.equal(options.concurrency, options.executionProfile.limits); assert.equal(Object.hasOwn(options, 'artifactDirectory'), false);
      for (const key of packageKeys) {
        assert.equal(Object.hasOwn(options.env, key), true, key); assert.equal(options.env[key], undefined, key);
        assert.equal(({ [key]: '/inherited', ...options.env })[key], undefined, 'executor merge cannot revive inherited package');
      }
      assert.equal(options.env.BUILDR_VERIFICATION_NETWORK_MODE, 'offline');
      const completed = { ...result(), stdout: 'private-output', sourceRecord: { forged: true }, env: { secret: 'private-env' },
        phases: [{ scope: 'preview', id: 'start-second', status: 'passed', durationMs: 777, output: 'private-phase' }] };
      options.onComplete(completed); return { passed: true, results: [completed] };
    },
  });
  assert.equal(sourceReads, 2); assert.equal(summary.schemaVersion, WINDOWS_SOURCE_DIAGNOSIS_SCHEMA);
  assert.equal(summary.status, 'passed'); assert.equal(summary.aggregateEligible, false); assert.equal(summary.sourceCommit, source); assert.equal(summary.sourceTree, tree);
  assert.equal(summary.results[0].durationMs, 12_345); assert.equal(summary.results[0].phases[0].durationMs, 777);
  assert.equal(saved[0].status, 'running'); assert.equal(saved[1].results.length, 1); assert.equal(saved.at(-1).status, 'passed');
  assert.ok(Number.isInteger(summary.durationMs) && summary.durationMs >= 0);
  assert.equal(summary.host.nodeVersion, process.versions.node); assert.equal(summary.executionProfile.id, 'ci-workspace-limited');
  for (const key of ['originalCandidateRunId', 'artifactSourceCommit', 'artifactSha256']) assert.equal(Object.hasOwn(summary, key), false);
  assert.doesNotMatch(JSON.stringify(summary), /private-|forged|sourceRecord|not-read|never-read/u);
});

test('invalid platform or source refuses execution and saves an independent failed summary', async () => {
  for (const failure of ['platform', 'head', 'tree', 'dirty', 'scenario', 'git-read']) {
    const saved: any[] = []; let executions = 0;
    const summary = await runWindowsSourceDiagnosis({ env: failure === 'scenario' ? { ...env, DIAGNOSTIC_SCENARIO: 'all' } : env }, {
      platform: failure === 'platform' ? 'linux' : 'win32',
      readGitFacts: () => { if (failure === 'git-read') throw new Error('private-git-output');
        return { ...facts, ...(failure === 'head' ? { head: 'a'.repeat(40) } : {}), ...(failure === 'tree' ? { tree: 'a'.repeat(40) } : {}), dirty: failure === 'dirty' }; },
      writeSummary: (_directory, value) => saved.push(structuredClone(value)), execute: async () => { executions++; return { passed: true, results: [] }; },
    });
    assert.equal(executions, 0, failure); assert.equal(summary.status, 'failed', failure); assert.equal(saved.at(-1).status, 'failed', failure);
    assert.equal(summary.failure.stage, 'validation'); assert.equal(summary.aggregateEligible, false);
    assert.doesNotMatch(JSON.stringify(summary), /private-git-output/u);
  }
});

test('source readback runs after failed execution and retains completed facts on failure or drift', async () => {
  for (const failure of ['assertion', 'exception', 'incomplete', 'head-drift', 'tree-drift', 'dirty-drift', 'readback']) {
    const saved: any[] = []; let sourceReads = 0;
    const summary = await runWindowsSourceDiagnosis({ env }, {
      platform: 'win32', readGitFacts: () => { sourceReads++;
        if (sourceReads === 1) return facts;
        if (failure === 'readback') throw new Error('private-readback');
        return { ...facts, ...(failure === 'head-drift' ? { head: 'a'.repeat(40) } : {}),
          ...(failure === 'tree-drift' ? { tree: 'a'.repeat(40) } : {}), dirty: failure === 'dirty-drift' };
      },
      writeSummary: (_directory, value) => saved.push(structuredClone(value)), execute: async (_plan, options) => {
        if (failure === 'incomplete') return { passed: true, results: [] };
        const completed = failure === 'assertion' ? { ...result(), status: 'failed', exitCode: 1 } : result();
        options.onComplete(completed);
        if (failure === 'exception') throw new Error('private-exception');
        return { passed: failure !== 'assertion', results: [completed] };
      },
    });
    assert.equal(sourceReads, 2, failure); assert.equal(summary.status, 'failed', failure); assert.equal(saved.at(-1).status, 'failed', failure);
    assert.equal(summary.results.length, failure === 'incomplete' ? 0 : 1, failure); assert.equal(summary.aggregateEligible, false);
    if (['head-drift', 'tree-drift', 'dirty-drift', 'readback'].includes(failure)) assert.equal(summary.failure.stage, 'source-readback', failure);
    if (failure === 'exception') assert.equal(summary.failure.stage, 'execution');
    assert.doesNotMatch(JSON.stringify(summary), /private-readback|private-exception/u);
  }
});
