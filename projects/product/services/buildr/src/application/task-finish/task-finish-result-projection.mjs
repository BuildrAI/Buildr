import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

const DETAILS = new Set(['compact', 'full']);
const PHASES = new Set(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
const PATH_KEYS = new Set(['path', 'file', 'relativePath']);
const PATH_LIST_KEYS = new Set(['paths', 'conflictPaths', 'unrelatedPaths']);

function compactProjectionError(message, details = null) {
  const error = new Error(message);
  Object.assign(error, {
    code: 'task_finish.compact_projection_invalid',
    usage: 'buildr help task finish inspect',
    nextAction: 'buildr help task finish inspect',
  });
  if (details) error.details = details;
  return error;
}

function portablePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  if (normalized.split('/').includes('..')) return null;
  return normalized;
}

function conflictPaths(value, output = [], seen = new Set()) {
  if (output.length >= 20 || value == null || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) conflictPaths(item, output, seen);
    return output;
  }
  for (const [key, item] of Object.entries(value)) {
    const candidates = PATH_LIST_KEYS.has(key) && Array.isArray(item) ? item : PATH_KEYS.has(key) ? [item] : [];
    for (const candidate of candidates) {
      const path = portablePath(candidate);
      if (path && !output.includes(path) && output.length < 20) output.push(path);
    }
    conflictPaths(item, output, seen);
  }
  return output;
}

function currentPhase(result) {
  if (PHASES.has(result.primaryFailure?.phase)) return result.primaryFailure.phase;
  const active = (result.phases || []).find((phase) => ['running', 'blocked', 'failed'].includes(phase?.status));
  if (PHASES.has(active?.id)) return active.id;
  const pending = (result.phases || []).find((phase) => phase?.status === 'pending');
  if (PHASES.has(pending?.id)) return pending.id;
  return null;
}

function identity(result) {
  const source = result.resolvedContext || {};
  const taskId = source.task?.taskId || result.identity?.task || null;
  return {
    taskId,
    handoffIdentity: source.handoff?.identity || result.handoff?.identity || result.identity?.handoffIdentity || null,
    candidate: {
      identity: source.candidate?.identity || result.candidate?.identity || result.identity?.candidateIdentity || null,
      generation: source.candidate?.generation || result.candidate?.generation || result.identity?.candidateGeneration || null,
      contentTargetIdentity: source.candidate?.contentTargetIdentity || result.candidate?.contentTargetIdentity || result.identity?.contentTargetIdentity || null,
    },
    agent: source.delivery?.agent || result.identity?.agent || null,
    targetBranch: source.delivery?.targetBranch || result.identity?.targetBranch || null,
    remote: source.delivery?.remote || result.identity?.remote || null,
  };
}

function failure(value) {
  if (!value) return null;
  return {
    phase: PHASES.has(value.phase) ? value.phase : null,
    origin: value.origin || null,
    operation: value.operation || null,
    check: value.check || null,
    failureClass: value.failureClass || null,
    code: value.code || null,
    status: value.status || null,
    exitCode: Number.isInteger(value.exitCode) ? value.exitCode : null,
    message: value.message || null,
    diagnosticIdentity: value.diagnostic?.digest || null,
    conflictPaths: conflictPaths({ findings: value.findings, diagnostic: value.diagnostic }),
  };
}

function resume(value) {
  if (!value) return null;
  return {
    phase: PHASES.has(value.phase) ? value.phase : null,
    token: value.token || null,
    generatedAt: value.generatedAt || null,
    carrierIdentity: value.carrierIdentity || null,
  };
}

function phases(value) {
  return (value || []).filter((phase) => PHASES.has(phase?.id)).map((phase) => ({
    id: phase.id,
    status: phase.status || null,
    attempts: Number.isInteger(phase.attempts) ? phase.attempts : 0,
    durationMs: Math.round(phase.durationMs || 0),
  }));
}

function refs(result) {
  const carrier = result.carrier || {};
  const delivery = result.delivery || {};
  const completion = result.completion || {};
  return {
    carrierIdentity: carrier.identity || completion.carrierIdentity || null,
    deliveryBaselineRef: carrier.deliveryBaseline?.head || null,
    expectedTargetRef: delivery.expectedTargetRef || carrier.expectedTargetRef || null,
    observedTargetRef: delivery.observedTargetRef || null,
    carrierRef: delivery.carrierRef || carrier.head || completion.carrierRef || null,
    remoteAfterRef: delivery.remoteAfterRef || null,
    finalRemoteRef: delivery.finalRemoteRef || completion.finalRemoteRef || null,
  };
}

function delivery(value) {
  if (!value) return null;
  return {
    status: value.status || null,
    targetDisposition: value.targetDisposition || null,
    containment: value.containment ? {
      status: value.containment.status || null,
      identity: value.containment.identity || null,
      code: value.containment.code || null,
    } : null,
    activation: value.activation ? {
      status: value.activation.status || null,
      planIdentity: value.activation.plan?.identity || null,
      doctorCode: value.activation.doctorCode || null,
    } : null,
    retainedDoctor: value.retainedDoctor || null,
  };
}

function completion(value) {
  if (!value) return null;
  return {
    status: value.status || null,
    carrierIdentity: value.carrierIdentity || null,
    taskContributionIdentity: value.taskContributionIdentity || null,
    cleanup: value.cleanup ? {
      status: value.cleanup.status || null,
      completedAt: value.cleanup.completedAt || null,
    } : null,
    preparedAt: value.preparedAt || null,
    completedAt: value.completedAt || null,
  };
}

function executionRecord(value) {
  if (!value) return null;
  return {
    status: value.status || null,
    recordId: value.recordId || null,
    outcome: value.outcome || null,
    lifecycleStatus: value.lifecycleStatus || null,
    body: value.body ? {
      digest: value.body.digest || null,
      storedSizeBytes: value.body.storedSizeBytes || 0,
      originalSizeBytes: value.body.originalSizeBytes || 0,
      truncated: value.body.truncated === true,
    } : null,
    transientCleanup: value.transientCleanup ? {
      status: value.transientCleanup.status || null,
      code: value.transientCleanup.code || null,
    } : null,
    diagnostic: value.diagnostic ? {
      code: value.diagnostic.code || null,
      message: value.diagnostic.message || null,
    } : null,
    nextActions: Array.isArray(value.nextActions) ? [...value.nextActions] : [],
  };
}

function deliveryAdaptation(value) {
  if (!value) return null;
  const hints = value.preparationHints || {};
  return {
    expectedCommitMessage: typeof value.expectedCommitMessage === 'string' ? value.expectedCommitMessage : null,
    preparationHints: {
      schemaVersion: hints.schemaVersion || null,
      steps: (hints.steps || []).map((step) => ({
        id: step.id || null,
        scope: step.scope || null,
        recipe: step.recipe || null,
        cwd: portablePath(step.cwd),
        executable: portablePath(step.executable),
        args: Array.isArray(step.args) ? step.args.filter((arg) => typeof arg === 'string') : [],
        timeoutMs: Number.isInteger(step.timeoutMs) ? step.timeoutMs : null,
        outputs: (step.outputs || []).map((output) => ({ path: portablePath(output.path), kind: output.kind || null })).filter((output) => output.path),
      })).filter((step) => step.cwd && step.executable),
      unavailable: (hints.unavailable || []).map((item) => ({ id: item.id || null, reason: item.reason || null })),
    },
  };
}

export function compactTaskFinishResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw compactProjectionError('Task Finish compact projection requires a canonical Result.');
  if (result.schemaVersion !== PUBLIC_JSON_SCHEMAS.taskFinishResult) throw compactProjectionError('Task Finish compact projection requires the canonical v2 Result.', { schemaVersion: result.schemaVersion || null });
  const compactIdentity = identity(result);
  if (!compactIdentity.taskId || !compactIdentity.handoffIdentity || !compactIdentity.candidate.identity || !compactIdentity.candidate.generation || !compactIdentity.candidate.contentTargetIdentity || !result.status) {
    throw compactProjectionError('Task Finish canonical Result is missing required compact identity or status facts.', { runId: result.runId || null });
  }
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskFinishCompactResult, {
    detail: 'compact',
    runId: result.runId || null,
    identity: compactIdentity,
    status: result.status,
    currentPhase: currentPhase(result),
    deliveryCommit: result.deliveryCommit ? {
      subject: result.deliveryCommit.subject || null,
      identity: result.deliveryCommit.identity || null,
    } : null,
    phases: phases(result.phases),
    primaryFailure: failure(result.primaryFailure),
    resume: resume(result.resume),
    nextWorkflow: result.nextWorkflow || null,
    nextAction: result.nextAction || null,
    reuseMode: result.reuseMode || null,
    deliveryAdaptation: deliveryAdaptation(result.deliveryAdaptation),
    refs: refs(result),
    delivery: delivery(result.delivery),
    completion: completion(result.completion),
    occupancy: result.occupancy ? {
      status: result.occupancy.status || null,
      releasedAt: result.occupancy.releasedAt || null,
    } : null,
    bootstrapRecovery: result.bootstrapRecovery ? {
      identity: result.bootstrapRecovery.identity || null,
      mode: result.bootstrapRecovery.mode || null,
      retainedSourceCommit: result.bootstrapRecovery.retainedSourceCommit || null,
      sourceCommit: result.bootstrapRecovery.sourceCommit || null,
      sourceTree: result.bootstrapRecovery.sourceTree || null,
      executorDigest: result.bootstrapRecovery.executorDigest || null,
      originalFailure: result.bootstrapRecovery.originalAttempt?.primaryFailure ? {
        phase: result.bootstrapRecovery.originalAttempt.primaryFailure.phase || null,
        origin: result.bootstrapRecovery.originalAttempt.primaryFailure.origin || null,
        code: result.bootstrapRecovery.originalAttempt.primaryFailure.code || null,
      } : null,
      capsuleRevocation: result.bootstrapRecovery.capsule?.revocation?.status || null,
    } : null,
    metrics: result.metrics ? {
      canonicalCliInvocations: result.metrics.canonicalCliInvocations || 0,
      agentProviderCompletions: result.metrics.agentProviderCompletions || 0,
      manualRecoveryManifests: result.metrics.manualRecoveryManifests || 0,
      bootstrapRecoveryExecutions: result.metrics.bootstrapRecoveryExecutions || 0,
      formalVerificationExecutions: result.metrics.formalVerificationExecutions || 0,
      productCommandObservations: result.metrics.productCommandObservations || 0,
      productExecutionMs: result.metrics.productExecutionMs || 0,
      wallClockMs: result.metrics.wallClockMs || 0,
      coverage: result.metrics.coverage || null,
    } : null,
    timing: {
      createdAt: result.createdAt || null,
      updatedAt: result.updatedAt || null,
      completedAt: result.completedAt || null,
    },
    executionRecord: executionRecord(result.executionRecord),
  });
}

export function projectTaskFinishResult(result, detail = 'compact') {
  if (!DETAILS.has(detail)) throw compactProjectionError(`Unsupported Task Finish detail: ${detail}`);
  return detail === 'full' ? result : compactTaskFinishResult(result);
}
