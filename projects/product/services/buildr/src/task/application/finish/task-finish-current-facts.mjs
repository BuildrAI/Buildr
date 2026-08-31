function repositoryFacts(result, readiness) {
  const plans = readiness?.identityParts?.repositories || result?.identity?.repositories || [];
  const states = result?.repositories || [];
  return plans.map((plan) => {
    const state = states.find((item) => item.selector === plan.selector) || null;
    const delivery = state?.delivery || null;
    return {
      selector: plan.selector,
      sourcePath: plan.sourcePath || '.',
      disposition: plan.disposition,
      reason: plan.reason || null,
      environmentBranch: plan.environmentBranch || null,
      targetBranch: plan.targetBranch || null,
      remote: plan.remote || null,
      taskContributionIdentity: state?.taskContribution?.identity || plan.taskContribution?.identity || null,
      carrier: state?.deliveryCarrier ? {
        identity: state.deliveryCarrier.identity || null,
        status: state.deliveryCarrier.status || null,
        owned: true,
        pathCoverage: state.deliveryCarrier.pathCoverage ? { identity: state.deliveryCarrier.pathCoverage.identity || null, counts: state.deliveryCarrier.pathCoverage.counts || null } : null,
      } : null,
      remoteContainment: delivery ? {
        status: delivery.status || 'unknown',
        targetDisposition: delivery.targetDisposition || null,
        observedTargetRef: delivery.finalRemoteRef || delivery.remoteAfterRef || delivery.observedTargetRef || null,
        proofStatus: delivery.containment?.status || (delivery.status === 'delivered' ? 'contained' : null),
        pathCoverageIdentity: delivery.pathCoverageIdentity || state?.deliveryCarrier?.pathCoverage?.identity || null,
      } : { status: 'unobserved', targetDisposition: null, observedTargetRef: null, proofStatus: null, pathCoverageIdentity: null },
      cleanupProof: state?.cleanupProof ? { status: 'available' } : null,
    };
  });
}

function flattenedGaps(readiness) {
  return Object.entries(readiness?.gaps || {}).flatMap(([module, values]) => (values || []).map((item) => ({
    source: 'entry-readiness',
    module,
    code: item.code,
    message: item.message,
    selector: item.selector || null,
  })));
}

function resultBlockers(result) {
  const blockers = [];
  if (result?.primaryFailure) blockers.push({
    source: 'finish-run',
    module: 'finish',
    code: result.primaryFailure.code || 'task_finish.unknown_blocker',
    message: result.primaryFailure.message || 'Task Finish is blocked by an unclassified current fact.',
    selector: result.primaryFailure.findings?.[0]?.selector || null,
  });
  return blockers;
}

function requiredPrerequisites(blockers) {
  return blockers
    .filter((item) => item.module === 'development' || item.module === 'environment')
    .map((item) => ({
      owner: item.module === 'development' ? 'task-development' : 'task-environment',
      code: item.code,
      summary: item.message,
    }));
}

function capability(id, owner, status, prerequisites = []) {
  return { id, owner, status, prerequisites };
}

function maintenanceFacts(value) {
  if (!value) return null;
  return {
    delivery: value.delivery || null,
    activation: value.activation || null,
    environmentCleanup: value.environmentCleanup || null,
    diagnostics: value.diagnostics || null,
  };
}

function occupancyFacts(value) {
  if (!value) return null;
  return {
    status: value.status || null,
    releasedAt: value.releasedAt || null,
    previousCarrierIdentity: value.previousCarrierIdentity || null,
    cleanup: value.cleanup ? {
      status: value.cleanup.status || null,
      repositories: (value.cleanup.repositories || []).map((repository) => ({
        selector: repository.selector || null,
        status: repository.status || null,
        carrierIdentity: repository.carrierIdentity || null,
      })),
    } : null,
  };
}

export function projectTaskFinishCurrentFacts({ taskId, operation = 'inspect', readiness = null, result = null, diagnostics = [], recovery = null }) {
  const repositories = repositoryFacts(result, readiness);
  const staleRecovery = Boolean(recovery && (recovery.mismatches || []).length > 0);
  const recoveryBlockers = staleRecovery && !recovery.eligible ? (recovery.blockers || []).map((code) => ({
    source: 'finish-recovery', module: 'finish', code: `task_finish.rollover.${code}`, message: `Safe stale-run rollover could not prove ${code}.`, selector: null,
  })) : [];
  const blockers = [...flattenedGaps(readiness), ...resultBlockers(result), ...(diagnostics || []).map((item) => ({
    source: 'finish-read-model', module: 'finish', code: item.code || 'task_finish.read_diagnostic', message: item.message || 'Task Finish read diagnostic.', selector: null,
  })), ...recoveryBlockers];
  const maintenance = maintenanceFacts(result?.maintenance || result?.completion?.maintenance || null);
  const sideEffects = {
    carrierOwned: repositories.some((repository) => repository.carrier?.owned),
    deliveryRecorded: repositories.some((repository) => repository.remoteContainment.status === 'delivered'),
    activationRecorded: Boolean(maintenance?.activation && maintenance.activation !== 'not-applicable'),
    cleanupRecorded: Boolean(maintenance?.environmentCleanup && !['pending', 'not-applicable'].includes(maintenance.environmentCleanup)),
    diagnosticsRecorded: Boolean(maintenance?.diagnostics && maintenance.diagnostics !== 'not-opened'),
  };
  return {
    schemaVersion: 'buildr.task-finish-current-facts/v1',
    taskId,
    operation,
    source: 'task-finish-application',
    identity: {
      handoffIdentity: readiness?.identityParts?.handoffIdentity || result?.identity?.handoffIdentity || null,
      candidateIdentity: readiness?.identityParts?.candidateIdentity || result?.identity?.candidateIdentity || null,
      candidateGeneration: readiness?.identityParts?.candidateGeneration ?? result?.identity?.candidateGeneration ?? null,
      contentTargetIdentity: readiness?.identityParts?.contentTargetIdentity || result?.identity?.contentTargetIdentity || null,
      repositorySetIdentity: readiness?.identityParts?.repositorySetIdentity || result?.identity?.repositorySetIdentity || result?.repositorySetIdentity || null,
      runId: result?.runId || null,
    },
    applicability: {
      handoff: readiness ? (readiness.handoff ? 'current' : 'missing') : (result?.identity?.handoffIdentity ? 'observed' : 'unknown'),
      finish: result ? (result.status || 'observed') : 'none',
    },
    repositories,
    ownership: {
      runId: result?.runId || null,
      occupancy: occupancyFacts(result?.occupancy || null),
      carrierOwned: sideEffects.carrierOwned,
    },
    sideEffects,
    maintenance,
    recovery: null,
    blockers,
    requiredPrerequisites: [],
    availableCapabilities: [],
    compatibilityHint: null,
  };
}

export function withTaskFinishCurrentFacts(payload, options = {}) {
  return {
    ...payload,
    currentFacts: projectTaskFinishCurrentFacts({
      taskId: options.taskId || payload?.identity?.task || payload?.taskId || null,
      operation: options.operation || payload?.operation || 'inspect',
      readiness: options.readiness || null,
      result: options.result || payload,
      diagnostics: options.diagnostics || [],
      recovery: options.recovery || null,
    }),
  };
}
