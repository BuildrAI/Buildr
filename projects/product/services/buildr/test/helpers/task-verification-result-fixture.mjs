import crypto from 'node:crypto';

import { createVerificationExecutionRecordFiles } from '../../src/verification/infrastructure/execution-record.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function recordVerificationResultFromEvidence(runtime, root, taskId, input) {
  const development = runtime.inspectTaskDevelopment?.(root, taskId)?.development?.receipt;
  const candidate = input.candidate || development?.candidate || {
    identity: digest({ taskId, target: input.targetIdentity }),
    generation: 1,
    contentTargetIdentity: input.targetIdentity,
  };
  const observations = runtime.observeTaskVerificationDeclarations(root, taskId, input.declarationRoot);
  if (observations.length === 0) {
    return runtime.recordTaskVerification(root, taskId, {
      candidateIdentity: candidate.identity,
      candidateGeneration: candidate.generation,
      targetIdentity: input.targetIdentity,
      targetSummary: input.targetSummary,
      capabilities: [],
      coverageGaps: input.coverageGaps,
      conclusion: input.conclusion,
      declarationRoot: input.declarationRoot,
    });
  }
  const records = [];
  const requestIdentity = input.requestIdentity || digest({ taskId, candidate, target: input.targetIdentity });
  const planIdentity = input.planIdentity || digest({ requestIdentity, capabilities: input.capabilities.map((item) => `${item.project}/${item.capability}`).sort() });
  for (const observation of observations) {
    const selected = input.capabilities.filter((item) => item.project === observation.project);
    if (!selected.length) continue;
    const runIdentity = `fixture-${taskId}-${observation.project}-${crypto.randomBytes(6).toString('hex')}`;
    const invocationIdentity = digest({ taskId, candidate, project: observation.project, declaration: observation.identity, selected: selected.map((item) => item.capability) });
    const opened = runtime.openTaskExecutionRecord(root, taskId, {
      owner: 'task-verification', kind: 'verification-execution', runIdentity, invocationIdentity,
      targetIdentity: input.targetIdentity, producer: 'buildr.verification-command-runner/v1', allowDuplicateInvocation: true,
    });
    const checks = selected.map((item) => ({
      id: item.capability,
      title: item.facts[0],
      status: item.outcome,
      exitCode: item.outcome === 'passed' ? 0 : 1,
      signal: null,
      durationMs: 1,
      queuedAt: '2026-08-22T00:00:00.000Z',
      startedAt: '2026-08-22T00:00:00.001Z',
      finishedAt: '2026-08-22T00:00:00.002Z',
      queueDurationMs: 1,
      resourceCoordination: null,
    }));
    runtime.sealTaskExecutionRecord(root, opened.record.recordId, {
      outcome: checks.every((item) => item.status === 'passed') ? 'passed' : 'failed',
      files: createVerificationExecutionRecordFiles({
        runId: runIdentity, invocationIdentity, context: { taskId, scopes: [] }, candidate,
        requestIdentity, planIdentity,
        executionUnitIdentities: selected.map((item) => `${observation.project}/${item.capability}:full`),
        targetRoot: root, targetIdentity: input.targetIdentity, targetStable: true, targetDrift: null,
        before: null, after: null, projectCode: observation.project,
        declarationPath: `${root}/${observation.path}`, declarationIdentity: observation.identity,
        selectedCapabilities: selected.map((item) => ({ id: item.capability, scope: { project: observation.project, services: [] }, evidence: ['unit'], proves: item.facts, selectedScope: 'full', resourceClaims: [] })),
        authorizedCapabilities: [], authorizedResources: [], checks,
        outcome: checks.every((item) => item.status === 'passed') ? 'passed' : 'failed', durationMs: 1,
        startedAt: '2026-08-22T00:00:00.001Z', finishedAt: '2026-08-22T00:00:00.002Z',
      }),
    });
    records.push(opened.record.recordId);
  }
  if (input.reconcile === false) return { records, candidate };
  return runtime.reconcileTaskVerification(root, taskId, {
    candidateIdentity: candidate.identity,
    candidateGeneration: candidate.generation,
    targetIdentity: input.targetIdentity,
    targetSummary: input.targetSummary,
    recordIds: records,
    coverageGaps: input.coverageGaps,
    declarationRoot: input.declarationRoot,
  });
}
