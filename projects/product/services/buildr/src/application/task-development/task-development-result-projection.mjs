function compactCurrent(development) {
  if (!development) return null;
  const receipt = development.receipt;
  const applicability = development.applicability;
  const currentHandoff = applicability.handoff === 'current' ? receipt.handoffs.at(-1) || null : null;
  return {
    receiptDigest: development.receiptDigest,
    observedAt: development.observedAt,
    status: applicability.status,
    axes: {
      taskContext: applicability.taskContext,
      planning: applicability.planning,
      contentTarget: applicability.contentTarget,
      policy: applicability.policy,
      candidate: applicability.candidate,
      handoff: applicability.handoff,
    },
    identities: {
      taskContext: receipt.taskContext.identity,
      planning: receipt.planning.identity,
      planningTarget: receipt.planning.targetIdentity,
      contentTarget: receipt.contentTarget?.identity || null,
      policy: receipt.verificationPolicy?.identity || null,
      candidate: receipt.candidate?.identity || null,
      handoff: currentHandoff?.identity || null,
    },
    candidateGeneration: receipt.candidate?.generation || receipt.generation,
    gates: applicability.gates,
    decision: receipt.decision ? { outcome: receipt.decision.outcome, candidateIdentity: receipt.decision.candidateIdentity } : null,
    reasons: applicability.reasons,
  };
}

export function compactTaskDevelopmentOperationResult(result) {
  if (!result || result.schemaVersion !== 'buildr.task-development-operation-result/v1') throw new Error('Task Development compact projection requires an operation result v1.');
  return {
    schemaVersion: 'buildr.task-development-driver-compact/v1',
    operation: result.operation,
    status: result.status,
    taskId: result.taskId,
    current: compactCurrent(result.development),
    next: result.next,
    diagnostic: result.diagnostic,
    effects: result.effects,
    nextActions: result.nextActions,
  };
}
