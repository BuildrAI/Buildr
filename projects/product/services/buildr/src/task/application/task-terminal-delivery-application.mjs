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
    maintenance: null,
    diagnostics: [],
    development,
    reviews,
    verification,
  };
}

function deliveredGate(gate, type) {
  if (!gate) return null;
  if (gate.disposition) return { status: 'gate-disposition', disposition: gate.disposition, targetIdentity: gate.targetIdentity ?? null, summary: gate.summary, source: gate.source };
  return { status: type === 'verification' ? 'verified-at-delivery' : 'adopted-at-delivery', targetIdentity: gate.targetIdentity, resultDigest: gate.resultDigest, outcome: gate.outcome };
}

function associationMatches(association, handoff) {
  if (!association || !handoff) return false;
  if (association.handoffIdentity !== handoff.identity || association.candidateIdentity !== handoff.candidate?.identity || association.candidateGeneration !== handoff.candidate?.generation) return false;
  return JSON.stringify(association.gates || {}) === JSON.stringify({
    planning: deliveredGate(handoff.gates?.planning, 'planning'),
    completion: deliveredGate(handoff.gates?.completion, 'completion'),
    verification: deliveredGate(handoff.gates?.verification, 'verification'),
  });
}

export function registerTaskTerminalDeliveryApplication(runtime) {
  function terminalDeliverySection(targetRoot, taskId, { taskRecord = null, development = null } = {}) {
    const task = taskRecord || runtime.inspectTaskRecord(targetRoot, taskId).record;
    const developmentReadModel = development || runtime.inspectTaskDevelopment(targetRoot, taskId);
    const base = {
      schemaVersion: 'buildr.task-terminal-delivery/v1',
      taskId: task.taskId,
      taskStatus: task.status,
      status: task.status === 'active' ? 'active' : task.status,
      delivered: false,
      delivery: null,
      snapshot: developmentReadModel?.development?.receipt || null,
      associations: { planning: null, completion: null, verification: null },
      maintenance: null,
      diagnostics: [],
    };
    const finishReadModel = runtime.inspectTaskFinishReadModel?.({ root: targetRoot, taskId }) || { state: 'none', result: null, diagnostics: [] };
    if (task.status === 'active') {
      if (finishReadModel.state === 'current') {
        const status = finishReadModel.result?.status === 'cleanup_pending' ? 'cleanup-pending' : finishReadModel.result?.status || 'finishing';
        return { ...base, status, delivery: { runId: finishReadModel.result?.runId || null, phase: finishReadModel.result?.resume?.phase || finishReadModel.result?.phases?.find((item) => ['running', 'blocked', 'failed'].includes(item.status))?.id || null, nextAction: finishReadModel.result?.nextAction || finishReadModel.result?.nextWorkflow || null }, diagnostics: finishReadModel.diagnostics || [] };
      }
      return base;
    }
    if (task.status === 'abandoned') return { ...base, status: 'abandoned' };
    if (task.result?.noChange === true) return { ...base, status: 'completed-no-change' };
    const terminalResult = ['terminal', 'current'].includes(finishReadModel.state) ? finishReadModel.result : null;
    const completion = ['terminal', 'current'].includes(finishReadModel.state) ? finishReadModel.completion : null;
    const association = completion?.association || null;
    const receipt = developmentReadModel?.development?.receipt;
    const selectedHandoff = receipt?.handoffs?.find((item) => item.identity === association?.handoffIdentity) || null;
    if (!terminalResult || !completion || !association || !associationMatches(association, selectedHandoff)) {
      return { ...base, status: 'completed-unproven', diagnostics: [{ code: 'task_finish_completion_association_missing_or_mismatched', message: 'Task 已完成，但SQLite Finish completion没有与Development handoff匹配的terminal association。' }] };
    }
    const cleanupSummary = completion.cleanup?.environment?.latest?.cleanup || completion.cleanup?.latest?.cleanup || completion.cleanup || {};
    const cleanupStatus = completion.cleanup?.status || (finishReadModel.state === 'terminal' ? 'cleaned' : 'pending');
    const maintenance = {
      delivery: 'delivered',
      activation: completion.maintenance?.activation
        || (terminalResult.delivery?.activation?.status === 'passed' ? 'passed' : terminalResult.delivery?.activation?.status === 'attention' ? 'attention' : 'not-applicable'),
      environmentCleanup: completion.maintenance?.environmentCleanup
        || (cleanupStatus === 'cleaned' ? 'cleaned' : cleanupStatus === 'pending' ? 'pending' : 'attention'),
      diagnostics: completion.maintenance?.diagnostics || terminalResult.executionRecord?.status || 'not-opened',
    };
    return {
      ...base,
      status: 'delivered',
      delivered: true,
      delivery: {
        completedAt: completion.completedAt || terminalResult.completedAt,
        finalRemoteRef: completion.finalRemoteRef || terminalResult.delivery?.finalRemoteRef || null,
        targetBranch: completion.targetBranch || terminalResult.identity?.targetBranch || null,
        remote: terminalResult.identity?.remote || null,
        cleanup: { status: cleanupStatus, completedAt: cleanupSummary.completedAt || null, summary: cleanupSummary.summary || null },
        reuseMode: terminalResult.reuseMode || terminalResult.equivalence?.reuseMode || null,
        semanticEquivalence: terminalResult.equivalence?.semanticEquivalence || null,
        runId: completion.runId || terminalResult.runId,
      },
      associations: {
        planning: association.gates?.planning || null,
        completion: association.gates?.completion || null,
        verification: association.gates?.verification || null,
      },
      maintenance,
      snapshot: receipt ? { taskContext: receipt.taskContext || null, planning: receipt.planning || null, contentTarget: receipt.contentTarget || null, verificationPolicy: receipt.verificationPolicy || null, candidate: selectedHandoff?.candidate || null, handoff: selectedHandoff, decision: selectedHandoff?.decision || null } : null,
      diagnostics: finishReadModel.diagnostics || [],
    };
  }

  function inspectTaskTerminalDelivery(targetRoot, taskId) {
    const taskResult = runtime.inspectTaskRecord(targetRoot, taskId);
    const task = taskResult.record;
    const development = runtime.inspectTaskDevelopment(targetRoot, taskId);
    const reviews = runtime.inspectTaskReview(targetRoot, taskId);
    const verification = runtime.inspectTaskVerification(targetRoot, taskId);
    const projection = baseProjection(task, development, reviews, verification);
    const terminal = terminalDeliverySection(targetRoot, taskId, { taskRecord: task, development });
    return { ...projection, ...terminal };
  }

  function inspectTaskDevelopmentView(targetRoot, taskId) {
    const development = runtime.inspectTaskDevelopment(targetRoot, taskId);
    const terminal = terminalDeliverySection(targetRoot, taskId, { development });
    return { ...development, terminal };
  }
  function inspectTaskReviewView(targetRoot, taskId) {
    const reviews = runtime.inspectTaskReview(targetRoot, taskId);
    const terminal = terminalDeliverySection(targetRoot, taskId);
    return { ...reviews, terminal };
  }
  function inspectTaskVerificationView(targetRoot, taskId) {
    const verification = runtime.inspectTaskVerification(targetRoot, taskId);
    const terminal = terminalDeliverySection(targetRoot, taskId);
    return { ...verification, terminal };
  }
  Object.assign(runtime, { inspectTaskTerminalDelivery, inspectTaskDevelopmentView, inspectTaskReviewView, inspectTaskVerificationView });
  return runtime;
}
