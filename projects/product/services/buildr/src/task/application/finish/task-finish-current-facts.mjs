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

function availableCapabilities({ readiness, result, blockers, repositories, recovery }) {
  const handoffCurrent = Boolean(readiness?.handoff || result?.identity?.handoffIdentity);
  const carrierOwned = repositories.some((repository) => repository.carrier?.owned);
  const runStatus = result?.status || null;
  const entryReady = readiness ? readiness.ready === true : handoffCurrent;
  const staleCurrentRun = Boolean(recovery && (recovery.mismatches || []).length > 0);
  const capabilities = [
    capability('finish-run', 'task-finish', entryReady && !staleCurrentRun ? 'available' : 'blocked', staleCurrentRun
      ? [{ code: 'task_finish.current_run_identity_conflict', summary: 'A different-identity current Finish run must be resolved before starting another run.' }]
      : flattenedGaps(readiness)),
    capability('finish-reconcile', 'task-finish', handoffCurrent ? 'available' : 'blocked', handoffCurrent ? [] : blockers),
    capability('git-operations', 'git-operations', handoffCurrent ? 'available' : 'blocked', handoffCurrent ? [] : blockers),
    capability('task-development', 'task-development', 'available'),
    capability('cleanup-carrier', 'task-finish', carrierOwned ? 'conditional' : 'not-applicable', carrierOwned ? [{ code: 'task_finish.carrier_cleanup_qualification_required', summary: 'Product必须重新证明run/carrier ownership、path containment与无未交付内容。' }] : []),
    capability('retire-run', 'task-finish', ['blocked', 'failed'].includes(runStatus) ? 'conditional' : 'not-applicable', ['blocked', 'failed'].includes(runStatus) ? [{ code: 'task_finish.run_retirement_qualification_required', summary: 'Product必须重新证明remote containment、delivery前无副作用、topology与carrier cleanup资格。' }] : []),
    capability('abandon-task', 'task-manager', 'available'),
  ];
  capabilities.splice(1, 0, {
    ...capability('finish-rollover', 'task-finish', recovery?.eligible ? 'available' : 'not-applicable', recovery?.eligible ? [] : (recovery?.blockers || []).map((code) => ({ code: `task_finish.rollover.${code}`, summary: `Safe stale-run rollover requires ${code}.` }))),
    recoveryToken: recovery?.eligible ? recovery.recoveryToken : null,
    qualificationIdentity: recovery?.qualificationIdentity || null,
    usage: 'buildr task finish rollover --task <task-id> --recovery-token <token> --commit-message <message>',
  });
  return capabilities;
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
    recovery: recovery ? {
      disposition: recovery.eligible ? 'stale-run-retirable' : staleRecovery ? 'stale-run-preserved' : 'same-run-current',
      eligible: recovery.eligible === true,
      qualificationIdentity: recovery.qualificationIdentity || null,
      recoveryToken: recovery.eligible ? recovery.recoveryToken : null,
      blockers: (recovery.blockers || []).map((code) => ({ code: `task_finish.rollover.${code}`, summary: `Safe stale-run rollover requires ${code}.` })),
      carrierDisposability: (recovery.carrierDisposability || []).map((item) => ({ selector: item.selector, status: item.status, code: item.code || null })),
    } : null,
    blockers,
    requiredPrerequisites: requiredPrerequisites(blockers),
    availableCapabilities: availableCapabilities({ readiness, result, blockers, repositories, recovery }),
    compatibilityHint: result?.nextAction || result?.nextWorkflow || readiness?.nextWorkflow || null,
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
