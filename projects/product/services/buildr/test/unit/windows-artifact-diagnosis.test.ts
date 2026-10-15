import assert from 'node:assert/strict';
import test from 'node:test';
import { createWindowsArtifactDiagnosisPlan, runWindowsArtifactDiagnosis, validateWindowsArtifactDiagnosis, WINDOWS_ARTIFACT_DIAGNOSIS_SCHEMA, WINDOWS_ARTIFACT_DIAGNOSIS_STEPS, WINDOWS_DIAGNOSIS_SCENARIOS } from '../verification/release/windows-artifact-diagnosis.ts';
import { createCandidateCiShardPlan } from '../verification/planner.ts';

const oldSource = 'a'.repeat(40), checkSource = 'b'.repeat(40), tree = 'c'.repeat(40);
const env = { DIAGNOSTIC_CANDIDATE_RUN_ID: '38780998205', DIAGNOSTIC_CANDIDATE_SOURCE: oldSource,
  EXPECTED_SOURCE_TREE: tree, DIAGNOSTIC_RUN_JSON: '/run.json', DIAGNOSTIC_ARTIFACT_DIR: '/old-package', DIAGNOSTIC_OUTPUT: '/diagnosis',
  GITHUB_REPOSITORY: 'BuildrAI/Buildr', GITHUB_SHA: checkSource };
const run = { id: 38780998205, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/verify.yml', event: 'workflow_dispatch', head_sha: oldSource };
const facts = { head: checkSource, tree, dirty: false, changedPaths: ['projects/product/services/buildr/test/verification/runtime/adapter-parity.ts',
  'projects/product/services/buildr/tools/verification/candidate-environment.ts', '.github/workflows/verify.yml', 'projects/product/knowledge/docs/flows/open-source-release.md',
  'projects/product/knowledge/docs/architecture/verification-framework.md'] };
const artifact = { tarball: '/old-package/original.tgz', metadataPath: '/old-package/npm-pack.json', manifestPath: '/old-package/release-artifact.json',
  identity: { sourceCommit: oldSource, sha256: 'd'.repeat(64) } };
const result = (id: string) => ({ id, status: 'passed', exitCode: 0, durationMs: 1, childOutcome: 'passed', childExitCode: 0, childSignal: null });

test('Windows original-package diagnosis binds original run and current check source independently', () => {
  assert.doesNotThrow(() => validateWindowsArtifactDiagnosis(env, run, facts));
  for (const changed of [{ id: 1 }, { repository: { full_name: 'foreign/repository' } }, { path: '.github/workflows/publish.yml' },
    { event: 'pull_request' }, { head_sha: checkSource }]) {
    assert.throws(() => validateWindowsArtifactDiagnosis(env, { ...run, ...changed }, facts), /diagnosis-run-/u);
  }
  for (const changed of [{ head: oldSource }, { tree: oldSource }, { dirty: true }]) {
    assert.throws(() => validateWindowsArtifactDiagnosis(env, run, { ...facts, ...changed }), /diagnosis-check/u);
  }
  assert.throws(() => validateWindowsArtifactDiagnosis({ ...env, DIAGNOSTIC_CANDIDATE_SOURCE: 'HEAD' }, run, facts), /diagnosis-run-source/u);
  assert.throws(() => validateWindowsArtifactDiagnosis({ ...env, EXPECTED_SOURCE_TREE: 'HEAD' }, run, facts), /diagnosis-check-tree/u);
});

test('borrowing original package bytes rejects every changed production or unrelated governance input', () => {
  for (const file of ['src/main.ts', 'resources/workspace/AGENTS.md', 'bin/buildr.mjs', 'package.json', 'package-lock.json', 'README.md']) {
    assert.throws(() => validateWindowsArtifactDiagnosis(env, run, { ...facts, changedPaths: [`projects/product/services/buildr/${file}`] }), /diagnosis-production-input-changed/u);
  }
  for (const file of ['CHANGELOG.md', 'projects/product/knowledge/docs/overview.md', 'projects/product/services/buildr-web/src/main.ts', '.github/workflows/publish.yml']) {
    assert.throws(() => validateWindowsArtifactDiagnosis(env, run, { ...facts, changedPaths: [file] }), /diagnosis-production-input-changed/u);
  }
});

test('diagnosis retains exactly the three original recipes without producer or unrelated lifecycle checks', () => {
  const plan = createWindowsArtifactDiagnosisPlan(), original = createCandidateCiShardPlan('runtime-windows', { externalArtifact: true });
  assert.deepEqual(plan.steps.map((step: any) => step.id).sort(), [...WINDOWS_ARTIFACT_DIAGNOSIS_STEPS].sort());
  assert.equal(plan.steps.some((step: any) => ['candidate-tarball', 'system-runtime-recovery', 'npm-launcher-candidate'].includes(step.id)), false);
  for (const step of plan.steps) assert.deepEqual(step, original.steps.find((item: any) => item.id === step.id));
  assert.throws(() => createWindowsArtifactDiagnosisPlan('toString'), /diagnosis-unknown-scenario/u);
});

test('diagnosis reads back original bytes and executes only the Windows plan with caching disabled', async () => {
  const saved: any[] = [];
  const summary = await runWindowsArtifactDiagnosis({ env, productRoot: '/repo/projects/product/services/buildr' }, {
    platform: 'win32', readRun: file => { assert.equal(file, '/run.json'); return run; }, readGitFacts: () => facts,
    readArtifact: (directory, source) => { assert.equal(directory, '/old-package'); assert.equal(source, oldSource); return artifact; },
    writeSummary: (_directory, value) => saved.push(structuredClone(value)),
    execute: async (plan, options) => {
      assert.equal(options.reuse, false); assert.equal(options.executionProfile.id, 'ci-workspace-limited');
      assert.equal(options.concurrency, options.executionProfile.limits);
      assert.equal(options.env.BUILDR_CANDIDATE_TARBALL, artifact.tarball);
      assert.equal(options.env.BUILDR_CANDIDATE_RELEASE_MANIFEST, artifact.manifestPath);
      assert.equal(options.env.BUILDR_VERIFICATION_NETWORK_MODE, 'offline');
      const results = plan.steps.map((step: any) => ({ ...result(step.id), stdout: 'private-output', env: { SECRET: 'private-env' }, sourceRecord: { forged: true },
        phases: [{ scope: 'consumer', id: 'installed', status: 'passed', durationMs: 1, stdout: 'private-phase' }] }));
      options.onComplete(results[0]); return { passed: true, results };
    },
  });
  assert.equal(summary.status, 'passed'); assert.equal(summary.schemaVersion, WINDOWS_ARTIFACT_DIAGNOSIS_SCHEMA); assert.equal(summary.aggregateEligible, false);
  assert.equal(summary.checkSourceCommit, checkSource); assert.equal(summary.checkSourceTree, tree);
  assert.equal(summary.artifactSourceCommit, oldSource); assert.equal(summary.artifactSha256, artifact.identity.sha256); assert.equal(summary.originalCandidateRunId, env.DIAGNOSTIC_CANDIDATE_RUN_ID);
  assert.equal(summary.results.length, 3); assert.equal(saved[1].results.length, 1); assert.equal(saved.at(-1).status, 'passed');
  assert.equal(summary.artifactConsumed, true); assert.equal(summary.artifactConsumerSelected, true);
  for (const key of ['cpuCount', 'availableParallelism', 'totalMem', 'startFreeMem', 'endFreeMem']) assert.equal(Number.isInteger(summary.host[key]), true, key);
  assert.equal(summary.host.nodeVersion, process.versions.node); assert.equal(summary.executionProfile.id, 'ci-workspace-limited');
  assert.doesNotMatch(JSON.stringify(summary), /private-|forged|sourceRecord/u);
});

test('package-consumer diagnosis executes and summarizes only the unchanged original package consumer', async () => {
  const scenario = 'package-consumer-windows', plan = createWindowsArtifactDiagnosisPlan(scenario);
  const original = createCandidateCiShardPlan('runtime-windows', { externalArtifact: true });
  assert.deepEqual(plan.steps.map((step: any) => step.id), ['release-tarball-smoke']);
  assert.deepEqual(plan.steps[0], original.steps.find((step: any) => step.id === 'release-tarball-smoke'));
  const saved: any[] = []; let executions = 0;
  const summary = await runWindowsArtifactDiagnosis({ env: { ...env, DIAGNOSTIC_SCENARIO: scenario } }, {
    platform: 'win32', readRun: () => run, readGitFacts: () => facts, readArtifact: () => artifact,
    writeSummary: (_directory, value) => saved.push(structuredClone(value)),
    execute: async (selected, options) => {
      executions++; assert.deepEqual(selected.steps, plan.steps); assert.equal(options.reuse, false);
      assert.equal(options.env.BUILDR_CANDIDATE_TARBALL, artifact.tarball);
      const results = selected.steps.map((step: any) => result(step.id));
      options.onComplete(results[0]); return { passed: true, results };
    },
  });
  assert.equal(executions, 1); assert.equal(summary.status, 'passed'); assert.equal(summary.scenario, scenario);
  assert.equal(summary.artifactConsumed, true); assert.equal(summary.aggregateEligible, false);
  assert.equal(summary.checkSourceCommit, checkSource); assert.equal(summary.artifactSourceCommit, oldSource);
  assert.deepEqual(summary.results.map((item: any) => item.id), ['release-tarball-smoke']);
  assert.ok(saved.every(value => value.results.length <= 1));
  assert.deepEqual(saved.at(-1).results, summary.results);
});

test('source-only diagnoses select only their failed owner and never pass artifact inputs to it', async () => {
  for (const [scenario, definition] of Object.entries(WINDOWS_DIAGNOSIS_SCENARIOS).filter(([, value]) => !value.artifactConsumer)) {
    const plan = createWindowsArtifactDiagnosisPlan(scenario), original = createCandidateCiShardPlan(definition.shard, { externalArtifact: true });
    assert.deepEqual(plan.steps.map((step: any) => step.id).sort(), [...definition.stepIds].sort());
    assert.equal(plan.steps.some((step: any) => step.executor.type === 'candidate-artifact' || step.executor.consumesArtifact), false);
    for (const selected of plan.steps) assert.deepEqual(selected, original.steps.find((step: any) => step.id === selected.id));
    const summary = await runWindowsArtifactDiagnosis({ env: { ...env, DIAGNOSTIC_SCENARIO: scenario, BUILDR_CANDIDATE_TARBALL: '/inherited.tgz', BUILDR_RELEASE_ARTIFACT_MANIFEST: '/inherited.json' } }, {
      platform: 'win32', readRun: () => run, readGitFacts: () => facts, readArtifact: () => artifact, writeSummary: () => {},
      execute: async (selected, options) => {
        for (const key of ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST', 'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC']) assert.equal(options.env[key], undefined, key);
        return { passed: true, results: selected.steps.map((step: any) => result(step.id)) };
      },
    });
    assert.equal(summary.status, 'passed'); assert.equal(summary.scenario, scenario);
    assert.equal(summary.artifactConsumed, false); assert.equal(summary.artifactConsumerSelected, false);
    assert.equal(summary.artifactSourceCommit, oldSource);
  }
});

test('nested-lifecycle diagnosis retains one original owner and explicitly masks inherited package inputs', async () => {
  const scenario = 'nested-lifecycle-windows', plan = createWindowsArtifactDiagnosisPlan(scenario);
  const original = createCandidateCiShardPlan('task-worktree-recovery-windows', { externalArtifact: false });
  assert.deepEqual(plan.steps.map((step: any) => step.id), ['system-nested-git-isolation']);
  assert.deepEqual(plan.steps[0], original.steps.find((step: any) => step.id === 'system-nested-git-isolation'));
  let executions = 0;
  const summary = await runWindowsArtifactDiagnosis({ env: { ...env, DIAGNOSTIC_SCENARIO: scenario } }, {
    platform: 'win32', readRun: () => run, readGitFacts: () => facts, readArtifact: () => artifact, writeSummary: () => {},
    execute: async (selected, options) => {
      executions++; assert.deepEqual(selected.steps, plan.steps); assert.equal(options.reuse, false);
      for (const key of ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST', 'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC']) {
        assert.equal(Object.hasOwn(options.env, key), true, key); assert.equal(options.env[key], undefined, key);
      }
      const results = selected.steps.map((step: any) => result(step.id));
      options.onComplete(results[0]); return { passed: true, results };
    },
  });
  assert.equal(executions, 1); assert.equal(summary.status, 'passed'); assert.equal(summary.scenario, scenario);
  assert.equal(summary.artifactConsumed, false); assert.equal(summary.artifactConsumerSelected, false);
  assert.deepEqual(summary.results.map((item: any) => item.id), ['system-nested-git-isolation']);
});

test('non-Windows, artifact readback, failed checks and exceptions always save a failed independent summary', async () => {
  for (const failure of ['platform', 'artifact', 'artifact-source', 'assertion', 'exception', 'incomplete', 'validation', 'source-drift', 'scenario', 'run-json']) {
    const saved: any[] = []; let executed = 0, sourceReads = 0;
    const summary = await runWindowsArtifactDiagnosis({ env: failure === 'scenario' ? { ...env, DIAGNOSTIC_SCENARIO: 'all' } : env }, {
      platform: failure === 'platform' ? 'linux' : 'win32', readRun: () => { if (failure === 'run-json') throw new SyntaxError('invalid run JSON'); return run; },
      readGitFacts: () => { sourceReads++; return failure === 'validation' || failure === 'source-drift' && sourceReads > 1 ? { ...facts, changedPaths: ['CHANGELOG.md'] } : facts; },
      readArtifact: () => { if (failure === 'artifact') throw new Error('original bytes corrupt'); return failure === 'artifact-source' ? { ...artifact, identity: { ...artifact.identity, sourceCommit: checkSource } } : artifact; },
      writeSummary: (_directory, value) => saved.push(structuredClone(value)),
      execute: async (plan, options) => {
        executed++; const results = plan.steps.map((step: any) => result(step.id)); options.onComplete(results[0]);
        if (failure === 'exception') throw new Error('private-exception');
        if (failure === 'incomplete') return { passed: true, results: results.slice(0, 1) };
        if (failure === 'source-drift') return { passed: true, results };
        results[1].status = 'failed'; results[1].exitCode = 1; return { passed: false, results };
      },
    });
    assert.equal(summary.status, 'failed', failure); assert.equal(saved.at(-1).status, 'failed', failure);
    assert.equal(executed, ['platform', 'artifact', 'artifact-source', 'validation', 'scenario', 'run-json'].includes(failure) ? 0 : 1);
    if (failure === 'exception') assert.equal(summary.results.length, 1, 'completed checks survive a later framework exception');
    assert.equal(summary.aggregateEligible, false); assert.doesNotMatch(JSON.stringify(summary), /private-exception/u);
  }
});
