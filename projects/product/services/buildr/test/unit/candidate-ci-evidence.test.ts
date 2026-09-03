import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCandidateCiEvidence,
  candidateCiRegistryIdentity,
  createCandidateCiCheckpoint,
  createCandidateCiEvidence,
} from '../verification/candidate-ci-evidence.ts';
import { createCandidateCiShardPlan, createVerificationPlan, validateCandidateCiCoverage } from '../verification/planner.ts';
import {
  CANDIDATE_CI_HOST_NODE_TUPLES,
  CANDIDATE_CI_SHARDS,
  CORE_MACOS_SHARDS,
  CORE_MACOS_STEP_IDS,
  verificationSteps,
} from '../verification/registry.ts';

const sourceCommit: any = 'a'.repeat(40);
const artifact: any = {
  filename: 'buildr.tgz',
  size: 1,
  sha256: 'b'.repeat(64),
  integrity: 'sha512-ZmFrZQ==',
  applicationPayloadDigest: `sha256-${'c'.repeat(64)}`,
  sourceCommit,
};

function passedEvidence(workflow: any = null): any  {
  const registryIdentity: any = candidateCiRegistryIdentity();
  const shards: any = CANDIDATE_CI_SHARDS.map((shard: any) => createCandidateCiEvidence({
    kind: 'shard',
    id: shard.id,
    platform: shard.runner === 'macos' ? 'darwin' : 'win32',
    workflow: workflow ? { ...workflow } : null,
    sourceCommit,
    registryIdentity,
    artifact: shard.requiresArtifact || shard.producesArtifact ? artifact : null,
    primaryStepIds: shard.stepIds,
    startedAt: '2026-08-13T00:00:00.000Z',
    finishedAt: '2026-08-13T00:00:01.000Z',
    durationMs: 1000,
    status: 'passed',
    results: shard.stepIds.map((id: any) => ({ id, status: 'passed', exitCode: 0, durationMs: 1 })),
  }));
  const hosts: any = CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => createCandidateCiEvidence({
    kind: 'host-node',
    id: tuple.id,
    platform: tuple.runner === 'macos' ? 'darwin' : 'win32',
    workflow: workflow ? { ...workflow } : null,
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
  const local: any = createVerificationPlan({ profiles: ['candidate'] }).steps.map((item: any) => item.id).sort();
  const distributed: any = [...new Set(CANDIDATE_CI_SHARDS.flatMap((item: any) => item.stepIds))].sort();
  assert.deepEqual(distributed, local);
  const corePlans: any = CORE_MACOS_SHARDS.map((shard: any) => createCandidateCiShardPlan(shard.id, { externalArtifact: true }));
  assert.ok(corePlans.every((plan: any) => !plan.steps.some((item: any) => item.id === 'candidate-tarball')));
  assert.ok(corePlans.some((plan: any) => plan.steps.some((item: any) => item.id === 'release-tarball-smoke')));
  assert.ok(corePlans.every((plan: any) => plan.steps.every((item: any) => !item.dependsOn.includes('candidate-tarball'))));
  const coreOwners: any = CORE_MACOS_SHARDS.flatMap((shard: any) => shard.stepIds);
  assert.deepEqual([...coreOwners].sort(), [...CORE_MACOS_STEP_IDS].sort());
  assert.equal(new Set(coreOwners).size, coreOwners.length);
  assert.ok(verificationSteps.filter((item: any) => item.profiles.includes('candidate')).every((item: any) => Number.isInteger(item.timeoutMs) && item.timeoutMs > 0 && item.timeoutMs <= 360_000));
});

test('Windows lifecycle owners are partitioned into bounded semantic shards', () => {
  const shardIds: any[] = [
    'workspace-lifecycle-windows',
    'task-worktree-recovery-windows',
    'task-concurrent-windows',
  ];
  const shards: any = CANDIDATE_CI_SHARDS.filter((shard: any) => shardIds.includes(shard.id));
  assert.deepEqual(shards.map((shard: any) => ({ id: shard.id, stepIds: shard.stepIds })), [
    {
      id: 'workspace-lifecycle-windows',
      stepIds: ['system-workspace-lifecycle', 'workspace-lifecycle'],
    },
    {
      id: 'task-worktree-recovery-windows',
      stepIds: ['system-task-lifecycle', 'system-worktree-lifecycle', 'openspec-convergence-recovery'],
    },
    { id: 'task-concurrent-windows', stepIds: ['concurrent-task-acceptance'] },
  ]);
  const owners: any = shards.flatMap((shard: any) => shard.stepIds);
  assert.equal(new Set(owners).size, owners.length);
});

test('Candidate CI coverage fails closed for unowned and duplicated steps', () => {
  const withoutUnit: any = CANDIDATE_CI_SHARDS.map((item: any) => item.id === 'preflight-macos' ? { ...item, stepIds: item.stepIds.filter((id: any) => id !== 'unit') } : item);
  assert.ok(validateCandidateCiCoverage(verificationSteps, withoutUnit).findings.some((item: any) => item.step === 'unit' && item.code === 'candidate_step_unowned'));
  const duplicated: any = CANDIDATE_CI_SHARDS.map((item: any) => item.id === 'core-cli-contract-macos' ? { ...item, stepIds: [...item.stepIds, 'unit'] } : item);
  assert.ok(validateCandidateCiCoverage(verificationSteps, duplicated).findings.some((item: any) => item.step === 'unit' && item.code === 'candidate_step_duplicated'));
});

test('Candidate aggregate accepts one current complete evidence set', () => {
  const result: any = aggregateCandidateCiEvidence(passedEvidence(), sourceCommit);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.findings, []);
  assert.equal(result.evidenceIds.length, CANDIDATE_CI_SHARDS.length + CANDIDATE_CI_HOST_NODE_TUPLES.length);
  assert.deepEqual(result.artifact, artifact);
});

test('Candidate aggregate accepts mixed attempts from the same workflow run', () => {
  const runId: any = '32807422982';
  const complete: any = passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' });
  const retriedId: any = 'core-package-runtime-release-macos';
  complete.find((item: any) => item.id === retriedId).workflow.runAttempt = '2';
  const result: any = aggregateCandidateCiEvidence(complete, sourceCommit, { runId, runAttempt: '2', job: 'candidate-gate' });
  assert.equal(result.status, 'passed');
  assert.equal(result.workflow.runId, runId);
  assert.equal(result.workflow.aggregateAttempt, 2);
  assert.deepEqual(result.workflow.evidenceAttempts.find((item: any) => item.id === retriedId), { id: retriedId, runAttempt: 2 });
  assert.ok(result.workflow.evidenceAttempts.some((item: any) => item.runAttempt === 1));
});

test('Candidate aggregate rejects cross-run and future-attempt evidence', () => {
  const runId: any = '32807422982';
  const crossRun: any = passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' });
  crossRun[0].workflow.runId = '32807924791';
  assert.ok(aggregateCandidateCiEvidence(crossRun, sourceCommit, { runId, runAttempt: '2' }).findings.some((item: any) => item.code === 'workflow-run-mismatch'));

  const future: any = passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' });
  future[0].workflow.runAttempt = '3';
  assert.ok(aggregateCandidateCiEvidence(future, sourceCommit, { runId, runAttempt: '2' }).findings.some((item: any) => item.code === 'workflow-attempt-future'));
  assert.ok(aggregateCandidateCiEvidence(passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' }), sourceCommit, { runId, runAttempt: null }).findings.some((item: any) => item.code === 'workflow-aggregate-attempt-invalid'));
});

test('Candidate shard evidence retains bounded failure diagnostics', () => {
  const evidence: any = createCandidateCiEvidence({
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
  const checkpoint: any = createCandidateCiCheckpoint({
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
  const aggregate: any = aggregateCandidateCiEvidence([checkpoint], sourceCommit);
  assert.equal(aggregate.status, 'failed');
  assert.ok(aggregate.findings.some((item: any) => item.code === 'schema-invalid'));
  assert.ok(aggregate.findings.some((item: any) => item.code === 'evidence-missing'));
});

test('Candidate aggregate rejects missing, duplicate, failed and stale evidence', () => {
  const complete: any = passedEvidence();
  const missing: any = aggregateCandidateCiEvidence(complete.slice(1), sourceCommit);
  assert.ok(missing.findings.some((item: any) => item.code === 'evidence-missing' && item.id === 'preflight-macos'));

  const duplicate: any = aggregateCandidateCiEvidence([...complete, complete[0]], sourceCommit);
  assert.ok(duplicate.findings.some((item: any) => item.code === 'duplicate-evidence'));

  const failed: any = structuredClone(complete);
  failed[0].status = 'failed';
  assert.ok(aggregateCandidateCiEvidence(failed, sourceCommit).findings.some((item: any) => item.code === 'result-not-passed'));

  const stale: any = structuredClone(complete);
  stale[0].sourceCommit = 'd'.repeat(40);
  assert.ok(aggregateCandidateCiEvidence(stale, sourceCommit).findings.some((item: any) => item.code === 'source-mismatch'));
});
