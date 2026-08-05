function finishMatchesHandoff(entry, handoff) {
  const finish = entry.result;
  const completion = entry.completion;
  const delivery = finish.delivery;
  const equivalence = finish.equivalence;
  const cleanup = finish.completion?.cleanup;
  const identitiesMatch = finish.status === 'complete'
    && finish.completion?.status === 'complete'
    && finish.identity.task === cleanup?.taskId
    && finish.handoff.identity === handoff.identity
    && finish.candidate.identity === handoff.candidate.identity
    && finish.candidate.generation === handoff.candidate.generation
    && finish.candidate.contentTargetIdentity === handoff.candidate.contentTargetIdentity
    && completion.handoffIdentity === handoff.identity
    && completion.candidateIdentity === handoff.candidate.identity
    && completion.candidateGeneration === handoff.candidate.generation
    && completion.contentTargetIdentity === handoff.candidate.contentTargetIdentity;
  const carrierEquivalent = equivalence?.status === 'equivalent'
    && ['deterministic-reuse', 'agent-reviewed-delivery-adaptation'].includes(equivalence.reuseMode)
    && equivalence.handoffIdentity === handoff.identity
    && equivalence.candidateIdentity === handoff.candidate.identity
    && equivalence.candidateGeneration === handoff.candidate.generation
    && equivalence.contentTargetIdentity === handoff.candidate.contentTargetIdentity
    && equivalence.carrierIdentity === finish.carrier?.identity
    && finish.carrier?.identity === completion.carrierIdentity;
  const remoteReadback = delivery?.status === 'delivered'
    && Boolean(delivery.finalRemoteRef)
    && delivery.finalRemoteRef === delivery.remoteAfterRef
    && delivery.finalRemoteRef === delivery.carrierRef
    && delivery.finalRemoteRef === completion.carrierRef;
  const activated = delivery?.activation?.status === 'passed'
    && delivery.retainedDoctor === 'passed'
    && ['passed', 'not-applicable'].includes(delivery.runtimeInstall)
    && ['passed', 'not-applicable'].includes(delivery.localAppDelivery);
  const cleaned = cleanup?.operation === 'cleanup' && cleanup.status === 'cleaned' && cleanup.environment?.status === 'cleaned'
    && cleanup.environment?.latest?.cleanup?.status === 'cleaned';
  return identitiesMatch && carrierEquivalent && remoteReadback && activated && cleaned;
}

function associateReview(slot, gate, delivered) {
  if (!delivered || !gate) return null;
  if (gate.disposition) return { status: 'gate-disposition', disposition: gate.disposition, targetIdentity: gate.targetIdentity, summary: gate.summary, source: gate.source };
  const matches = slot?.present && slot.resultDigest === gate.resultDigest && slot.result.targetIdentity === gate.targetIdentity && slot.result.conclusion.outcome === gate.outcome;
  return { status: matches ? 'adopted-at-delivery' : 'unproven', targetIdentity: gate.targetIdentity, resultDigest: gate.resultDigest, outcome: gate.outcome };
}

function associateVerification(slot, gate, delivered) {
  if (!delivered || !gate) return null;
  if (gate.disposition) return { status: 'gate-disposition', disposition: gate.disposition, targetIdentity: gate.targetIdentity, summary: gate.summary, source: gate.source };
  const matches = slot?.present && slot.resultDigest === gate.resultDigest && slot.result.target.identity === gate.targetIdentity && slot.result.conclusion.outcome === gate.outcome;
  return { status: matches ? 'verified-at-delivery' : 'unproven', targetIdentity: gate.targetIdentity, resultDigest: gate.resultDigest, outcome: gate.outcome };
}

function baseProjection(task, development, reviews, verification) {
  return {
    schemaVersion: 'buildr.task-terminal-delivery/v1',
    taskId: task.taskId,
    taskStatus: task.status,
    status: task.status === 'active' ? 'active' : task.status,
    delivered: false,
    delivery: null,
    snapshot: development.development?.receipt || null,
    associations: { planning: null, completion: null, verification: null },
    diagnostics: [],
    development,
    reviews,
    verification,
  };
}

export function registerTaskTerminalDeliveryApplication(runtime) {
  function inspectTaskTerminalDelivery(targetRoot, taskId) {
    const taskResult = runtime.inspectTaskRecord(targetRoot, taskId);
    const task = taskResult.record;
    const development = runtime.inspectTaskDevelopment(targetRoot, taskId);
    const receipt = development.development?.receipt;
    const liveApplicability = development.development?.applicability;
    const liveObservable = task.status === 'active' && Boolean(liveApplicability) && liveApplicability.status !== 'unknown';
    const reviews = runtime.inspectTaskReview(targetRoot, taskId, liveObservable ? {
      ...(liveApplicability.planning === 'current' && receipt?.planning?.targetIdentity ? { planningTargetIdentity: receipt.planning.targetIdentity } : {}),
      ...(liveApplicability.candidate === 'current' && receipt?.candidate?.identity ? { completionTargetIdentity: receipt.candidate.identity } : {}),
    } : {});
    const verification = runtime.inspectTaskVerification(targetRoot, taskId, liveObservable && liveApplicability.contentTarget === 'current' && receipt?.contentTarget?.identity ? { targetIdentity: receipt.contentTarget.identity } : {});
    const projection = baseProjection(task, development, reviews, verification);
    if (task.status === 'active') return projection;
    if (task.status === 'abandoned') return { ...projection, status: 'abandoned' };
    if (task.result?.noChange === true) return { ...projection, status: 'completed-no-change' };
    const handoffs = receipt?.handoffs || [];
    if (!handoffs.length) return { ...projection, status: 'completed-unproven', diagnostics: [{ code: 'task_delivery_handoff_missing', message: 'Task 已完成，但没有 immutable Development handoff。' }] };
    const queried = runtime.readTaskFinishResults({ root: targetRoot, taskId });
    let selected = null;
    let selectedHandoff = null;
    for (const entry of queried.results) {
      const handoff = handoffs.find((item) => item.identity === entry.result.handoff.identity);
      if (handoff && finishMatchesHandoff(entry, handoff)) { selected = entry; selectedHandoff = handoff; break; }
    }
    if (!selected) {
      const diagnostics = [...queried.diagnostics];
      if (queried.results.length) diagnostics.push({ code: 'task_delivery_identity_unproven', message: 'Finish Result 存在，但与当前 Task 的 immutable handoff/Candidate/Content Target 或交付完成事实不匹配。' });
      return { ...projection, status: diagnostics.some((item) => item.code === 'task_finish_completion_invalid') ? 'unavailable' : 'completed-unproven', diagnostics };
    }
    const finish = selected.result;
    const terminal = {
      status: 'delivered',
      completedAt: finish.completedAt,
      finalRemoteRef: finish.delivery.finalRemoteRef,
      targetBranch: finish.identity.targetBranch,
      remote: finish.identity.remote,
      cleanup: { status: finish.completion.cleanup.status, completedAt: finish.completion.cleanup.environment.latest.cleanup.completedAt, summary: finish.completion.cleanup.environment.latest.cleanup.summary },
      reuseMode: finish.reuseMode,
      semanticEquivalence: finish.equivalence.semanticEquivalence,
      runId: finish.runId,
    };
    return {
      ...projection,
      status: 'delivered',
      delivered: true,
      delivery: terminal,
      snapshot: { taskContext: receipt.taskContext, planning: receipt.planning, contentTarget: receipt.contentTarget, verificationPolicy: receipt.verificationPolicy, candidate: selectedHandoff.candidate, handoff: selectedHandoff, decision: selectedHandoff.decision },
      associations: {
        planning: associateReview(reviews.slots.planning, selectedHandoff.gates.planning, true),
        completion: associateReview(reviews.slots.completion, selectedHandoff.gates.completion, true),
        verification: associateVerification(verification.slot, selectedHandoff.gates.verification, true),
      },
      diagnostics: queried.diagnostics,
    };
  }

  function inspectTaskDevelopmentView(targetRoot, taskId) {
    const projection = inspectTaskTerminalDelivery(targetRoot, taskId);
    return { ...projection.development, terminal: projection };
  }
  function inspectTaskReviewView(targetRoot, taskId) {
    const projection = inspectTaskTerminalDelivery(targetRoot, taskId);
    return { ...projection.reviews, terminal: projection };
  }
  function inspectTaskVerificationView(targetRoot, taskId) {
    const projection = inspectTaskTerminalDelivery(targetRoot, taskId);
    return { ...projection.verification, terminal: projection };
  }
  Object.assign(runtime, { inspectTaskTerminalDelivery, inspectTaskDevelopmentView, inspectTaskReviewView, inspectTaskVerificationView });
  return runtime;
}
