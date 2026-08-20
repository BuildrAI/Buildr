import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCandidateCiEvidence,
  candidateCiRegistryIdentity,
  createCandidateCiCheckpoint,
  createCandidateCiEvidence,
} from '../verification/candidate-ci-evidence.mjs';
import { createCandidateCiShardPlan, createVerificationPlan, validateCandidateCiCoverage } from '../verification/planner.mjs';
import {
  CANDIDATE_CI_HOST_NODE_TUPLES,
  CANDIDATE_CI_SHARDS,
  CORE_MACOS_SHARDS,
  CORE_MACOS_STEP_IDS,
  verificationSteps,
} from '../verification/registry.mjs';

const sourceCommit = 'a'.repeat(40);
const artifact = {
  filename: 'buildr.tgz',
  size: 1,
  sha256: 'b'.repeat(64),
  integrity: 'sha512-ZmFrZQ==',
  applicationPayloadDigest: `sha256-${'c'.repeat(64)}`,
  sourceCommit,
};

function passedEvidence() {
  const registryIdentity = candidateCiRegistryIdentity();
  const shards = CANDIDATE_CI_SHARDS.map((shard) => createCandidateCiEvidence({
    kind: 'shard',
    id: shard.id,
    platform: shard.runner === 'macos' ? 'darwin' : 'win32',
    sourceCommit,
    registryIdentity,
    artifact: shard.requiresArtifact || shard.producesArtifact ? artifact : null,
    primaryStepIds: shard.stepIds,
    startedAt: '2026-08-13T00:00:00.000Z',
    finishedAt: '2026-08-13T00:00:01.000Z',
    durationMs: 1000,
    status: 'passed',
    results: shard.stepIds.map((id) => ({ id, status: 'passed', exitCode: 0, durationMs: 1 })),
  }));
  const hosts = CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple) => createCandidateCiEvidence({
    kind: 'host-node',
    id: tuple.id,
    platform: tuple.runner === 'macos' ? 'darwin' : 'win32',
    sourceCommit,
    registryIdentity,
    artifact,
    requestedNode: tuple.requestedNode,
    primaryStepIds: [],
    startedAt: '2026-08-13T00:00:00.000Z',
    finishedAt: '2026-08-13T00:00:01.000Z',
    durationMs: 1000,
    status: 'passed',
    results: [{ id: 'host-node-compatibility', status: 'passed', exitCode: 0, durationMs: 1 }],
  }));
  return [...shards, ...hosts];
}

test('Candidate CI coverage is a closed projection of the full local Candidate', () => {
  assert.deepEqual(validateCandidateCiCoverage(), { ok: true, findings: [] });
  const local = createVerificationPlan({ profiles: ['candidate'] }).steps.map((item) => item.id).sort();
  const distributed = [...new Set(CANDIDATE_CI_SHARDS.flatMap((item) => item.stepIds))].sort();
  assert.deepEqual(distributed, local);
  const corePlans = CORE_MACOS_SHARDS.map((shard) => createCandidateCiShardPlan(shard.id, { externalArtifact: true }));
  assert.ok(corePlans.every((plan) => !plan.steps.some((item) => item.id === 'candidate-tarball')));
  assert.ok(corePlans.some((plan) => plan.steps.some((item) => item.id === 'release-tarball-smoke')));
  assert.ok(corePlans.every((plan) => plan.steps.every((item) => !item.dependsOn.includes('candidate-tarball'))));
  const coreOwners = CORE_MACOS_SHARDS.flatMap((shard) => shard.stepIds);
  assert.deepEqual([...coreOwners].sort(), [...CORE_MACOS_STEP_IDS].sort());
  assert.equal(new Set(coreOwners).size, coreOwners.length);
  assert.ok(verificationSteps.filter((item) => item.profiles.includes('candidate')).every((item) => Number.isInteger(item.timeoutMs) && item.timeoutMs > 0 && item.timeoutMs <= 360_000));
});

test('Windows lifecycle owners are partitioned into bounded semantic shards', () => {
  const shardIds = [
    'workspace-lifecycle-windows',
    'task-worktree-recovery-windows',
    'task-finish-windows',
    'task-development-windows',
  ];
  const shards = CANDIDATE_CI_SHARDS.filter((shard) => shardIds.includes(shard.id));
  assert.deepEqual(shards.map((shard) => ({ id: shard.id, stepIds: shard.stepIds })), [
    {
      id: 'workspace-lifecycle-windows',
      stepIds: ['system-workspace-lifecycle', 'workspace-lifecycle'],
    },
    {
      id: 'task-worktree-recovery-windows',
      stepIds: ['system-task-lifecycle', 'system-worktree-lifecycle', 'openspec-convergence-recovery'],
    },
    {
      id: 'task-finish-windows',
      stepIds: ['system-task-finish', 'system-task-finish-cli'],
    },
    {
      id: 'task-development-windows',
      stepIds: ['integration-task-development', 'concurrent-task-acceptance'],
    },
  ]);
  const owners = shards.flatMap((shard) => shard.stepIds);
  assert.equal(new Set(owners).size, owners.length);
});

test('Candidate CI coverage fails closed for unowned and duplicated steps', () => {
  const withoutUnit = CANDIDATE_CI_SHARDS.map((item) => item.id === 'preflight-macos' ? { ...item, stepIds: item.stepIds.filter((id) => id !== 'unit') } : item);
  assert.ok(validateCandidateCiCoverage(verificationSteps, withoutUnit).findings.some((item) => item.step === 'unit' && item.code === 'candidate_step_unowned'));
  const duplicated = CANDIDATE_CI_SHARDS.map((item) => item.id === 'core-cli-contract-macos' ? { ...item, stepIds: [...item.stepIds, 'unit'] } : item);
  assert.ok(validateCandidateCiCoverage(verificationSteps, duplicated).findings.some((item) => item.step === 'unit' && item.code === 'candidate_step_duplicated'));
});

test('Candidate aggregate accepts one current complete evidence set', () => {
  const result = aggregateCandidateCiEvidence(passedEvidence(), sourceCommit);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.findings, []);
  assert.equal(result.evidenceIds.length, CANDIDATE_CI_SHARDS.length + CANDIDATE_CI_HOST_NODE_TUPLES.length);
  assert.deepEqual(result.artifact, artifact);
});

test('Candidate shard evidence retains bounded failure diagnostics', () => {
  const evidence = createCandidateCiEvidence({
    kind: 'shard', id: 'runtime-windows', platform: 'win32', sourceCommit,
    registryIdentity: candidateCiRegistryIdentity(), artifact,
    primaryStepIds: ['release-tarball-smoke'],
    startedAt: '2026-08-13T00:00:00.000Z', finishedAt: '2026-08-13T00:00:01.000Z', durationMs: 1000,
    status: 'failed',
    results: [{
      id: 'release-tarball-smoke', status: 'failed', exitCode: 1, durationMs: 1000,
      failureCode: 'process-close-timeout',
      processCleanup: { status: 'failed', ownership: 'runner-observed-lineage' },
      stdoutPath: 'C:\\runner\\release.stdout.log', stderrPath: 'C:\\runner\\release.stderr.log',
    }],
  });
  assert.deepEqual(evidence.results[0], {
    id: 'release-tarball-smoke', status: 'failed', exitCode: 1, durationMs: 1000,
    queueDurationMs: null, phases: [], failureCode: 'process-close-timeout',
    processCleanup: { status: 'failed', ownership: 'runner-observed-lineage' },
    diagnostics: { stdoutFile: 'release.stdout.log', stderrFile: 'release.stderr.log' },
  });
});

test('Candidate checkpoint retains completed evidence but is never aggregate eligible', () => {
  const checkpoint = createCandidateCiCheckpoint({
    id: 'core-task-lifecycle-macos',
    sourceCommit,
    registryIdentity: candidateCiRegistryIdentity(),
    artifact,
    expectedStepIds: ['integration', 'integration-task-finish-delivery'],
    completedResults: [{
      id: 'integration', status: 'passed', exitCode: 0, durationMs: 10,
      process: { pid: 123, processGroupId: 123 },
      stdoutPath: '/tmp/integration.stdout.log', stderrPath: '/tmp/integration.stderr.log',
      diagnosticDigests: { stdout: `sha256-${'d'.repeat(64)}`, stderr: `sha256-${'e'.repeat(64)}` },
    }],
    startedAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:01.000Z',
    status: 'running',
  });
  assert.equal(checkpoint.schemaVersion, 'buildr.candidate-ci-checkpoint/v1');
  assert.equal(checkpoint.aggregateEligible, false);
  assert.deepEqual(checkpoint.completedStepIds, ['integration']);
  assert.deepEqual(checkpoint.completedResults[0].process, { pid: 123, processGroupId: 123 });
  assert.equal(checkpoint.completedResults[0].diagnostics.stdoutDigest, `sha256-${'d'.repeat(64)}`);
  const aggregate = aggregateCandidateCiEvidence([checkpoint], sourceCommit);
  assert.equal(aggregate.status, 'failed');
  assert.ok(aggregate.findings.some((item) => item.code === 'schema-invalid'));
  assert.ok(aggregate.findings.some((item) => item.code === 'evidence-missing'));
});

test('Candidate aggregate rejects missing, duplicate, failed and stale evidence', () => {
  const complete = passedEvidence();
  const missing = aggregateCandidateCiEvidence(complete.slice(1), sourceCommit);
  assert.ok(missing.findings.some((item) => item.code === 'evidence-missing' && item.id === 'preflight-macos'));

  const duplicate = aggregateCandidateCiEvidence([...complete, complete[0]], sourceCommit);
  assert.ok(duplicate.findings.some((item) => item.code === 'duplicate-evidence'));

  const failed = structuredClone(complete);
  failed[0].status = 'failed';
  assert.ok(aggregateCandidateCiEvidence(failed, sourceCommit).findings.some((item) => item.code === 'result-not-passed'));

  const stale = structuredClone(complete);
  stale[0].sourceCommit = 'd'.repeat(40);
  assert.ok(aggregateCandidateCiEvidence(stale, sourceCommit).findings.some((item) => item.code === 'source-mismatch'));
});
