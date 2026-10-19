import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCandidateCiEvidence,
  candidateCiRegistryIdentity,
  candidateCiTiming,
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
const sourceTree: any = 'f'.repeat(40);
const candidateContext: any = { purpose: 'candidate', sourceCommit, sourceTree, rehearsalIdentity: null };
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
    sourceTree,
    purpose: 'candidate',
    registryIdentity,
    artifact: shard.requiresArtifact || shard.producesArtifact ? artifact : null,
    primaryStepIds: shard.stepIds,
    startedAt: '2026-08-13T00:00:00.000Z',
    finishedAt: '2026-08-13T00:00:01.000Z',
    durationMs: 1000,
    status: 'passed',
    results: shard.stepIds.map((id: any) => ({ id, status: 'passed', exitCode: 0, durationMs: 1, phases: id === 'artifact-browser-core' ? ['artifact-unpack', 'artifact-verify', 'browser:core', 'artifact-cleanup'].map(id => ({ scope: 'candidate-browser-core', id, status: 'passed', durationMs: 1 })) : [] })),
  }));
  const hosts: any = CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => createCandidateCiEvidence({
    kind: 'host-node',
    id: tuple.id,
    platform: tuple.runner === 'macos' ? 'darwin' : tuple.runner === 'windows' ? 'win32' : 'linux',
    workflow: workflow ? { ...workflow } : null,
    sourceCommit,
    sourceTree,
    purpose: 'candidate',
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

test('formal repair aggregate keeps original package identity and requires each carried proof to validate', () => {
  const workflow = { runId: '52', runAttempt: '1' }, evidence = passedEvidence(workflow);
  const context = { ...candidateContext, verificationSource: 'e'.repeat(40), sourceBinding: { identity: 'binding' } };
  for (const item of evidence) { item.verificationSource = context.verificationSource; item.sourceBinding = context.sourceBinding; }
  const carried = evidence.find((item: any) => item.id === 'artifact-browser-macos').results[0];
  carried.disposition = 'reused'; carried.candidateProof = { originalRunId: '42' };
  const valid = aggregateCandidateCiEvidence(evidence, context, workflow, { validateCandidateProof: (result: any, id: string) => result === carried && id === 'artifact-browser-macos' });
  assert.equal(valid.status, 'passed'); assert.equal(valid.artifact.sourceCommit, sourceCommit);
  assert.equal(valid.verificationSource, context.verificationSource);
  assert.equal(aggregateCandidateCiEvidence(evidence, context, workflow).status, 'failed');
  carried.phases = [];
  const incomplete = aggregateCandidateCiEvidence(evidence, context, workflow, { validateCandidateProof: () => true });
  assert.ok(incomplete.findings.some((finding: any) => finding.code === 'browser-phase-missing'));
});

test('host and child process success cannot be manufactured from an empty or contradictory passed wrapper', () => {
  const evidence = passedEvidence();
  evidence.find((item: any) => item.kind === 'host-node').results = [];
  assert.ok(aggregateCandidateCiEvidence(evidence, candidateContext).findings.some((finding: any) => finding.code === 'host-node-result-missing'));
  const other = passedEvidence(); other[0].results[0].childExitCode = 1;
  assert.ok(aggregateCandidateCiEvidence(other, candidateContext).findings.some((finding: any) => finding.code === 'result-not-passed'));
});

test('Candidate CI coverage is a closed projection of the full local Candidate', () => {
  assert.deepEqual(validateCandidateCiCoverage(), { ok: true, findings: [] });
  const local: any = createVerificationPlan({ profiles: ['candidate'] }).steps.map((item: any) => item.id).sort();
  const distributed: any = [...new Set(CANDIDATE_CI_SHARDS.flatMap((item: any) => item.stepIds))].sort();
  assert.deepEqual(distributed, local);
  const corePlans: any = CORE_MACOS_SHARDS.map((shard: any) => createCandidateCiShardPlan(shard.id, { externalArtifact: true }));
  assert.ok(corePlans.every((plan: any) => !plan.steps.some((item: any) => item.id === 'candidate-tarball')));
  assert.ok(corePlans.every((plan: any) => !plan.steps.some((item: any) => item.id === 'release-tarball-smoke')));
  assert.ok(createCandidateCiShardPlan('runtime-macos', { externalArtifact: true }).steps.some((item: any) => item.id === 'release-tarball-smoke'));
  assert.ok(corePlans.every((plan: any) => plan.steps.every((item: any) => !item.dependsOn.includes('candidate-tarball'))));
  const coreOwners: any = CORE_MACOS_SHARDS.flatMap((shard: any) => shard.stepIds);
  assert.deepEqual([...coreOwners].sort(), [...CORE_MACOS_STEP_IDS].sort());
  assert.equal(new Set(coreOwners).size, coreOwners.length);
  assert.ok(verificationSteps.filter((item: any) => item.profiles.includes('candidate')).every((item: any) => Number.isInteger(item.timeoutMs) && item.timeoutMs > 0 && item.timeoutMs <= 360_000));
});

test('new Candidate host coverage is exactly macOS and Windows and rejects Linux relabeling', () => {
  assert.deepEqual(CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => tuple.id), [
    'host-minimum-macos', 'host-minimum-windows',
  ]);
  const linux = { id: 'host-minimum-linux', runner: 'linux', requestedNode: '24.15.0', expectation: 'minimum' };
  assert.ok(validateCandidateCiCoverage(verificationSteps, CANDIDATE_CI_SHARDS, [...CANDIDATE_CI_HOST_NODE_TUPLES, linux])
    .findings.some((finding: any) => finding.step === linux.id && finding.code === 'candidate_host_tuple_invalid'));
  const changed = passedEvidence();
  changed.find((item: any) => item.id === 'host-minimum-macos').runner.os = 'linux';
  assert.ok(aggregateCandidateCiEvidence(changed, candidateContext).findings.some((finding: any) => finding.code === 'runner-mismatch'));
});


test('Generic lifecycle owners retain complete source coverage on one primary platform', () => {
  const shardIds: any[] = [
    'workspace-lifecycle-macos',
    'task-worktree-recovery-macos',
    'task-concurrent-macos',
  ];
  const shards: any = CANDIDATE_CI_SHARDS.filter((shard: any) => shardIds.includes(shard.id));
  assert.deepEqual(shards.map((shard: any) => ({ id: shard.id, stepIds: shard.stepIds })), [
    {
      id: 'workspace-lifecycle-macos',
      stepIds: ['system-workspace-lifecycle', 'workspace-lifecycle'],
    },
    {
      id: 'task-worktree-recovery-macos',
      stepIds: ['system-task-lifecycle', 'system-worktree-lifecycle', 'system-nested-git-isolation'],
    },
    { id: 'task-concurrent-macos', stepIds: ['concurrent-task-acceptance'] },
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

test('Candidate rejects platform checks in a common owner and source checks hidden in artifact jobs', () => {
  const windows = CANDIDATE_CI_SHARDS.map((shard: any) => shard.id === 'platform-boundaries-windows'
    ? { ...shard, platformScope: { kind: 'common', runners: [] } } : shard);
  assert.ok(validateCandidateCiCoverage(verificationSteps, windows).findings.some((item: any) => item.code === 'candidate_platform_check_in_common_shard'));
  const mixed = CANDIDATE_CI_SHARDS.map((shard: any) => shard.id === 'core-runtime-source-macos' ? { ...shard, requiresArtifact: true } : shard);
  assert.ok(validateCandidateCiCoverage(verificationSteps, mixed).findings.some((item: any) => item.code === 'candidate_source_in_artifact_shard'));
});

test('only the explicitly deferred original-package nodes can yield incomplete and cannot satisfy release coverage', async () => {
  const { assertReleaseConsumptionCoverage } = await import('../verification/release/release-consumption.ts');
  const deferredIds = ['runtime-macos', 'host-minimum-macos'];
  const evidence = passedEvidence().filter((item: any) => !deferredIds.includes(item.id));
  const awaiting = aggregateCandidateCiEvidence(evidence, candidateContext, null, { deferredIds });
  assert.equal(awaiting.status, 'incomplete');
  assert.deepEqual(awaiting.deferredIds, [...deferredIds].sort());
  assert.throws(() => assertReleaseConsumptionCoverage(awaiting, candidateContext, artifact), /passed Candidate/);
  assert.equal(aggregateCandidateCiEvidence(evidence.slice(1), candidateContext, null, { deferredIds }).status, 'failed');
  evidence[0].status = 'failed';
  assert.equal(aggregateCandidateCiEvidence(evidence, candidateContext, null, { deferredIds }).status, 'failed');
  assert.equal(aggregateCandidateCiEvidence(passedEvidence(), candidateContext, null, { deferredIds }).status, 'passed');
});

test('release coverage adopts complete prior results without a whole-list recipe gate and still rejects missing checks or different bytes', async () => {
  const { assertReleaseConsumptionCoverage } = await import('../verification/release/release-consumption.ts');
  const aggregate = aggregateCandidateCiEvidence(passedEvidence(), candidateContext);
  aggregate.consumptionIdentity = 'sha256-2fc8b0b1a666e3fb619d88a8550271e5bae1323d25a3165d431409e079f075b7';
  aggregate.evidenceIds.push('host-current-macos', 'host-current-windows');
  assert.doesNotThrow(() => assertReleaseConsumptionCoverage(aggregate, candidateContext, artifact));
  delete aggregate.consumptionIdentity;
  assert.doesNotThrow(() => assertReleaseConsumptionCoverage(aggregate, candidateContext, artifact));
  const missing = { ...aggregate, evidenceIds: aggregate.evidenceIds.filter((id: string) => id !== 'host-minimum-windows') };
  assert.throws(() => assertReleaseConsumptionCoverage(missing, candidateContext, artifact), /missing release check host-node/);
  assert.throws(() => assertReleaseConsumptionCoverage(aggregate, { ...candidateContext, sourceCommit: 'e'.repeat(40) }, artifact), /exact source/);
  assert.throws(() => assertReleaseConsumptionCoverage(aggregate, candidateContext, { ...artifact, sha256: 'd'.repeat(64) }), /artifact sha256 mismatches/);
});

test('aggregate revalidates local artifact records and never turns them into source or remote execution claims', () => {
  const complete = passedEvidence({ runId: '52', runAttempt: '1' });
  const owner = complete.find((item: any) => item.id === 'runtime-macos');
  const original = structuredClone(owner); original.workflow = null;
  owner.results[0].disposition = 'reused'; owner.results[0].artifactRecord = original;
  assert.equal(aggregateCandidateCiEvidence(complete, candidateContext, { runId: '52', runAttempt: '1' }).status, 'failed');
  const accepted = aggregateCandidateCiEvidence(complete, candidateContext, { runId: '52', runAttempt: '1' }, {
    validateArtifactRecord(record: any, id: string, expected: any, stepId: string) {
      return record === original && id === owner.id && expected.sha256 === artifact.sha256 && stepId === owner.results[0].id;
    },
  });
  assert.equal(accepted.status, 'passed');
  assert.equal(owner.results[0].artifactRecord.workflow, null);
});

test('aggregate authenticates a reused child of a failed local group by its exact step', () => {
  const complete = passedEvidence({ runId: '52', runAttempt: '1' });
  const owner = complete.find((item: any) => item.id === 'core-package-runtime-release-macos');
  const original = structuredClone(owner); original.workflow = null; original.status = 'failed'; original.cleanupClean = true;
  original.results[2].status = 'failed'; original.results[2].exitCode = 1;
  for (const result of owner.results.slice(0, 2)) { result.disposition = 'reused'; result.artifactRecord = original; }
  const seen: string[] = [];
  const options = { validateArtifactRecord(record: any, id: string, expected: any, stepId: string) {
    seen.push(stepId);
    return record === original && id === owner.id && expected.sha256 === artifact.sha256
      && original.results.some((result: any) => result.id === stepId && result.status === 'passed' && result.exitCode === 0);
  } };
  assert.equal(aggregateCandidateCiEvidence(complete, candidateContext, { runId: '52', runAttempt: '1' }, options).status, 'passed');
  assert.deepEqual(seen, owner.primaryStepIds.slice(0, 2));
  owner.results[2].disposition = 'reused'; owner.results[2].artifactRecord = original;
  assert.equal(aggregateCandidateCiEvidence(complete, candidateContext, { runId: '52', runAttempt: '1' }, options).status, 'failed');
});

test('Candidate aggregate accepts one current complete evidence set', () => {
  const result: any = aggregateCandidateCiEvidence(passedEvidence(), candidateContext);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.findings, []);
  assert.equal(result.evidenceIds.length, CANDIDATE_CI_SHARDS.length + CANDIDATE_CI_HOST_NODE_TUPLES.length);
  assert.deepEqual(result.artifact, artifact);
});

test('Candidate aggregate rechecks reused source records and retains independent failure facts', () => {
  const complete = passedEvidence();
  const shard = complete.find((item: any) => item.id === 'preflight-macos');
  const result = shard.results[0];
  result.disposition = 'reused';
  result.reusedFrom = { runId: 'local-source-1', sourceCommit: 'c'.repeat(40) };
  result.sourceRecord = { identity: { stepId: result.id, key: `sha256-${'a'.repeat(64)}` } };
  assert.ok(aggregateCandidateCiEvidence(complete, candidateContext).findings.some((item: any) => item.code === 'source-reuse-invalid'));
  const checked: any[] = [];
  const accepted = aggregateCandidateCiEvidence(complete, candidateContext, null, {
    validateSourceRecord(record: any, stepId: string, runner: string) { checked.push({ record, stepId, runner }); return true; },
  });
  assert.equal(accepted.status, 'passed');
  assert.deepEqual(checked, [{ record: result.sourceRecord, stepId: result.id, runner: 'macos' }]);
  const projected = createCandidateCiEvidence({ ...shard, results: [{ ...result, childExitCode: 7, childSignal: null, childOutcome: 'failed', failureFacts: [{ kind: 'assertion', code: 'ERR_ASSERTION' }, { kind: 'timeout', scope: 'capability' }] }] });
  assert.equal(projected.results[0].childExitCode, 7);
  assert.equal(projected.results[0].failureFacts.length, 2);
});

test('Candidate aggregate preserves fresh Windows execution when its optional future reuse record is not portable', () => {
  const workflow = { runId: '38797032896', runAttempt: '1' };
  const complete = passedEvidence(workflow);
  const shard = complete.find((item: any) => item.id === 'platform-boundaries-windows');
  for (const id of ['system-windows-platform']) {
    const result = shard.results.find((item: any) => item.id === id);
    result.durationMs = 12_345;
    result.sourceRecord = { identity: { stepId: id, key: `sha256-${'a'.repeat(64)}` } };
  }
  let checked = 0;
  const accepted = aggregateCandidateCiEvidence(complete, candidateContext, workflow, {
    validateSourceRecord() { checked++; return false; },
  });
  assert.equal(accepted.status, 'passed');
  assert.deepEqual(accepted.findings, []);
  assert.equal(checked, 0, 'fresh same-run results do not use the optional future reuse proof');
  assert.equal(shard.results.find((item: any) => item.id === 'system-windows-platform').durationMs, 12_345);
});

test('Candidate aggregate still rejects an invalid or missing record for explicitly reused results', () => {
  for (const hasRecord of [true, false]) {
    const complete = passedEvidence();
    const result = complete.find((item: any) => item.id === 'platform-boundaries-windows').results.find((item: any) => item.id === 'system-windows-platform');
    result.disposition = 'reused';
    if (hasRecord) result.sourceRecord = { identity: { stepId: result.id, key: `sha256-${'a'.repeat(64)}` } };
    const rejected = aggregateCandidateCiEvidence(complete, candidateContext, null, { validateSourceRecord: () => !hasRecord });
    assert.equal(rejected.status, 'failed');
    assert.ok(rejected.findings.some((item: any) => item.code === 'source-reuse-invalid' && item.id === 'platform-boundaries-windows' && item.detail === result.id));
  }
});

test('an optional source record cannot bypass fresh Browser phase coverage or failed phases', () => {
  for (const failure of ['missing', 'failed']) {
    const complete = passedEvidence();
    const result = complete.find((item: any) => item.id === 'artifact-browser-macos').results.find((item: any) => item.id === 'artifact-browser-core');
    result.sourceRecord = { identity: { stepId: result.id, key: `sha256-${'a'.repeat(64)}` } };
    if (failure === 'missing') result.phases = [];
    else result.phases.find((phase: any) => phase.id === 'browser:core').status = 'failed';
    const rejected = aggregateCandidateCiEvidence(complete, candidateContext, null, { validateSourceRecord: () => true });
    assert.equal(rejected.status, 'failed', failure);
    assert.ok(rejected.findings.some((item: any) => item.code === (failure === 'missing' ? 'browser-phase-missing' : 'browser-phase-not-passed')), failure);
  }
});

test('Candidate aggregate accepts mixed attempts from the same workflow run', () => {
  const runId: any = '32807422982';
  const complete: any = passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' });
  const retriedId: any = 'core-package-runtime-release-macos';
  complete.find((item: any) => item.id === retriedId).workflow.runAttempt = '2';
  const result: any = aggregateCandidateCiEvidence(complete, candidateContext, { runId, runAttempt: '2', job: 'candidate-gate' });
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
  assert.ok(aggregateCandidateCiEvidence(crossRun, candidateContext, { runId, runAttempt: '2' }).findings.some((item: any) => item.code === 'workflow-run-mismatch'));

  const future: any = passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' });
  future[0].workflow.runAttempt = '3';
  assert.ok(aggregateCandidateCiEvidence(future, candidateContext, { runId, runAttempt: '2' }).findings.some((item: any) => item.code === 'workflow-attempt-future'));
  assert.ok(aggregateCandidateCiEvidence(passedEvidence({ runId, runAttempt: '1', job: 'candidate-shard' }), candidateContext, { runId, runAttempt: null }).findings.some((item: any) => item.code === 'workflow-aggregate-attempt-invalid'));
});

test('Candidate shard evidence retains bounded failure diagnostics', () => {
  const evidence: any = createCandidateCiEvidence({
    kind: 'shard', id: 'runtime-windows', platform: 'win32', sourceCommit, sourceTree, purpose: 'candidate',
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

test('Candidate timing retains execution ownership facts and binds preparation to the exact observation', () => {
  const original = passedEvidence({ runId: '52', runAttempt: '2' }).find((item: any) => item.id === 'preflight-macos');
  const contextLifecycle = { contexts: [{ provider: 'runtime', owned: true, prepareDurationMs: 100 }], events: [{ operation: 'cleanup', status: 'cleaned' }] };
  const fullPlanCoordination = { waitDurationMs: 70, release: [{ status: 'released' }] };
  const evidence = createCandidateCiEvidence({ ...original, platform: 'darwin', contextLifecycle, fullPlanCoordination,
    results: [{ id: 'typecheck', status: 'passed', exitCode: 0, durationMs: 300, queueDurationMs: 80,
      queuedAt: original.startedAt, startedAt: original.startedAt, finishedAt: original.finishedAt,
      resourceCoordination: { waitDurationMs: 50 }, phases: [{ scope: 'check', id: 'assertions', durationMs: 200, status: 'passed' }] }] });
  assert.deepEqual(evidence.contextLifecycle, contextLifecycle);
  assert.deepEqual(evidence.fullPlanCoordination, fullPlanCoordination);
  assert.equal(evidence.results[0].resourceCoordination.waitDurationMs, 50);
  assert.equal(evidence.results[0].queuedAt, original.startedAt);
  const preparation = { schemaVersion: 'buildr.candidate-environment-preparation/v1', id: evidence.id, sourceCommit,
    workflow: { runId: '52', runAttempt: 2 }, status: 'failed', profile: 'base', durationMs: 400,
    operations: [{ id: 'buildr-dependencies', status: 'failed', disposition: 'executed', durationMs: 350 }] };
  const timing = candidateCiTiming([evidence], [preparation, { ...preparation, workflow: { runId: '52', runAttempt: 1 } }]);
  assert.equal(timing.checks[0].preparation.elapsedMs, 400);
  assert.equal(timing.checks[0].preparation.operations[0].elapsedMs, 350);
  assert.equal(timing.checks[0].preparation.status, 'failed', 'diagnostics preserve failure without rewriting the successful check');
  assert.equal(timing.checks[0].results[0].queueDurationMs, 80);
  assert.deepEqual(timing.checks[0].contextLifecycle, contextLifecycle);
  assert.equal(timing.platformQueueDurationMs, null);
  assert.equal(timing.agentDurationMs, null);
  assert.equal(timing.durationSemantics, 'per-observation-not-additive');
  assert.equal('totalDurationMs' in timing, false, 'parallel and nested observations must not be added');
  for (const stale of [{ ...preparation, sourceCommit: 'e'.repeat(40) }, { ...preparation, workflow: { runId: '53', runAttempt: 2 } }, { ...preparation, workflow: { runId: '52', runAttempt: 1 } }]) {
    assert.equal(candidateCiTiming([evidence], [stale]).checks[0].preparation.elapsedMs, null);
  }
  assert.equal(candidateCiTiming([evidence], [preparation, preparation]).checks[0].preparation.reason, 'preparation-record-ambiguous');
  const verificationSource = 'd'.repeat(40);
  const repaired = { ...evidence, verificationSource };
  assert.equal(candidateCiTiming([repaired], [preparation]).checks[0].preparation.status, 'unknown', 'product-source preparation cannot stand in for the verification checkout');
  assert.equal(candidateCiTiming([repaired], [{ ...preparation, sourceCommit: verificationSource }]).checks[0].preparation.elapsedMs, 400);
});

test('Candidate timing separates reused origin phases and costs from current work and preserves unknown costs', () => {
  const [evidence] = passedEvidence({ runId: '52', runAttempt: '1' });
  evidence.results = [{ id: 'artifact-browser-core', status: 'passed', durationMs: 0, disposition: 'reused',
    queueDurationMs: 30, resourceCoordination: { waitDurationMs: 20 }, phases: [{ id: 'browser:core', durationMs: 700 }],
    reusedFrom: { runId: '42', durationMs: 900 } }, { id: 'unknown-cost', status: 'failed' }];
  const timing = candidateCiTiming([evidence]);
  assert.equal(timing.checks[0].elapsedMs, 1000);
  assert.equal(timing.checks[0].results[0].elapsedMs, 0);
  assert.equal(timing.checks[0].results[0].reusedFrom.durationMs, 900);
  assert.equal(timing.checks[0].results[0].queueDurationMs, null);
  assert.equal(timing.checks[0].results[0].resourceCoordination, null);
  assert.deepEqual(timing.checks[0].results[0].phases, []);
  assert.equal(timing.checks[0].results[0].originPhases[0].durationMs, 700);
  assert.equal(timing.checks[0].results[1].elapsedMs, null);
  assert.equal(timing.checks[0].preparation.status, 'unknown');
  const aggregate = aggregateCandidateCiEvidence(passedEvidence(), candidateContext, null, { preparations: [] });
  assert.equal(aggregate.status, 'passed', 'missing timing does not revoke complete check evidence');
});

test('Candidate checkpoint retains completed evidence but is never aggregate eligible', () => {
  const checkpoint: any = createCandidateCiCheckpoint({
    id: 'core-task-lifecycle-macos',
    sourceCommit,
    sourceTree,
    purpose: 'candidate',
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
  assert.equal(checkpoint.schemaVersion, 'buildr.candidate-ci-checkpoint/v2');
  assert.equal(checkpoint.aggregateEligible, false);
  assert.deepEqual(checkpoint.completedStepIds, ['integration']);
  assert.deepEqual(checkpoint.completedResults[0].process, { pid: 123, processGroupId: 123 });
  assert.equal(checkpoint.completedResults[0].diagnostics.stdoutDigest, `sha256-${'d'.repeat(64)}`);
  const aggregate: any = aggregateCandidateCiEvidence([checkpoint], candidateContext);
  assert.equal(aggregate.status, 'failed');
  assert.ok(aggregate.findings.some((item: any) => item.code === 'schema-invalid'));
  assert.ok(aggregate.findings.some((item: any) => item.code === 'evidence-missing'));
});

test('Candidate aggregate rejects missing, duplicate, failed and stale evidence', () => {
  const complete: any = passedEvidence();
  const missing: any = aggregateCandidateCiEvidence(complete.filter((item: any) => item.id !== 'preflight-macos'), candidateContext);
  assert.ok(missing.findings.some((item: any) => item.code === 'evidence-missing' && item.id === 'preflight-macos'));

  const duplicate: any = aggregateCandidateCiEvidence([...complete, complete[0]], candidateContext);
  assert.ok(duplicate.findings.some((item: any) => item.code === 'duplicate-evidence'));

  const failed: any = structuredClone(complete);
  failed[0].status = 'failed';
  assert.ok(aggregateCandidateCiEvidence(failed, candidateContext).findings.some((item: any) => item.code === 'result-not-passed'));

  const stale: any = structuredClone(complete);
  stale[0].sourceCommit = 'd'.repeat(40);
  assert.ok(aggregateCandidateCiEvidence(stale, candidateContext).findings.some((item: any) => item.code === 'source-mismatch'));
});

test('Release rehearsal evidence is bound to purpose, tree and rehearsal identity', () => {
  const rehearsalIdentity: any = `sha256-${'9'.repeat(64)}`;
  const evidence: any = passedEvidence().map((item: any) => ({ ...item, purpose: 'release-rehearsal', rehearsalIdentity }));
  const result: any = aggregateCandidateCiEvidence(evidence, { purpose: 'release-rehearsal', sourceCommit, sourceTree, rehearsalIdentity });
  assert.equal(result.status, 'passed');
  assert.equal(result.purpose, 'release-rehearsal');
  assert.equal(result.sourceTree, sourceTree);
  assert.equal(result.rehearsalIdentity, rehearsalIdentity);
  const drifted: any = structuredClone(evidence);
  drifted[0].sourceTree = 'e'.repeat(40);
  assert.ok(aggregateCandidateCiEvidence(drifted, { purpose: 'release-rehearsal', sourceCommit, sourceTree, rehearsalIdentity }).findings.some((item: any) => item.code === 'source-tree-mismatch'));
});

test('Candidate has one independent owner for the complete frontend logic suite', () => {
  const shard = CANDIDATE_CI_SHARDS.find((item: any) => item.id === 'frontend-logic-macos');
  assert.deepEqual(shard.stepIds, ['frontend-logic']);
  assert.equal(shard.requiresArtifact, false);
  const plan = createCandidateCiShardPlan(shard.id);
  assert.deepEqual(plan.steps.map((item: any) => item.id), ['frontend-logic']);
  const withoutFrontend = passedEvidence().filter((item: any) => item.id !== shard.id);
  assert.ok(aggregateCandidateCiEvidence(withoutFrontend, candidateContext).findings.some((item: any) => item.id === shard.id && item.code === 'evidence-missing'));
});

test('Candidate rejects missing, incomplete, failed and mismatched artifact Browser core evidence', () => {
  const id = 'artifact-browser-macos';
  const missing = aggregateCandidateCiEvidence(passedEvidence().filter((item: any) => item.id !== id), candidateContext);
  assert.ok(missing.findings.some((item: any) => item.code === 'evidence-missing' && item.id === id));
  for (const [code, mutate] of [
    ['primary-result-missing', (item: any) => { item.results = []; }],
    ['browser-phase-missing', (item: any) => { item.results[0].phases = []; }],
    ['result-not-passed', (item: any) => { item.status = 'failed'; }],
    ['artifact-identity-mismatch', (item: any) => { item.artifact = { ...item.artifact, sha256: 'e'.repeat(64) }; }],
  ] as const) {
    const evidence = passedEvidence();
    mutate(evidence.find((item: any) => item.id === id));
    assert.ok(aggregateCandidateCiEvidence(evidence, candidateContext).findings.some((item: any) => item.code === code), code);
  }
});

test('Candidate Browser requires exactly one passed unpack, verification, journey and cleanup phase', () => {
  for (const phaseId of ['artifact-unpack', 'artifact-verify', 'browser:core', 'artifact-cleanup']) {
    for (const mode of ['missing', 'failed', 'duplicate']) {
      const evidence = passedEvidence();
      const step = evidence.find((item: any) => item.id === 'artifact-browser-macos').results[0];
      if (mode === 'missing') step.phases = step.phases.filter((phase: any) => phase.id !== phaseId);
      else if (mode === 'failed') step.phases.find((phase: any) => phase.id === phaseId).status = 'failed';
      else step.phases.push({ ...step.phases.find((phase: any) => phase.id === phaseId) });
      const code = mode === 'failed' ? 'browser-phase-not-passed' : `browser-phase-${mode}`;
      assert.ok(aggregateCandidateCiEvidence(evidence, candidateContext).findings.some((item: any) => item.code === code && item.detail === phaseId), `${phaseId}/${mode}`);
    }
  }
});
