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
  function terminalDeliverySection(targetRoot, taskId, { taskRecord = null, development = null } = {}) {
    const task = taskRecord || runtime.inspectTaskRecord(targetRoot, taskId).record;
    const base = {
      schemaVersion: 'buildr.task-terminal-delivery/v1',
      taskId: task.taskId,
      taskStatus: task.status,
      status: task.status === 'active' ? 'active' : task.status,
      delivered: false,
      delivery: null,
      snapshot: development?.development?.receipt || null,
      associations: { planning: null, completion: null, verification: null },
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
    const lifecycle = runtime.inspectTaskLifecycleReadModel?.(targetRoot, taskId);
    const finish = lifecycle?.model?.finish;
    const terminalResult = typeof runtime.inspectTaskFinishReadModel === 'function'
      ? (finishReadModel.state === 'terminal' ? finishReadModel.result : null)
      : finish;
    if (!finish || finish.status !== 'delivered' || !finish.association || !terminalResult) {
      return { ...base, status: 'completed-unproven', diagnostics: [{ code: 'task_delivery_summary_missing', message: 'Task 已完成，但 SQLite lifecycle read model 没有匹配成功 Finish summary。' }] };
    }
    const cleanupSummary = finish.cleanup?.environment?.latest?.cleanup || finish.cleanup?.latest?.cleanup || {};
    const receipt = development?.development?.receipt;
    const selectedHandoff = receipt?.handoffs?.find((item) => item.identity === finish.association.handoffIdentity) || null;
    return {
      ...base,
      status: 'delivered',
      delivered: true,
      delivery: {
        completedAt: terminalResult.completedAt || finish.completedAt,
        finalRemoteRef: terminalResult.delivery?.finalRemoteRef || finish.finalRemoteRef,
        targetBranch: terminalResult.identity?.targetBranch || finish.targetBranch,
        remote: terminalResult.identity?.remote || finish.remote,
        cleanup: { status: finish.cleanup?.status || 'unknown', completedAt: cleanupSummary.completedAt || null, summary: cleanupSummary.summary || null },
        reuseMode: terminalResult.reuseMode || finish.reuseMode,
        semanticEquivalence: terminalResult.equivalence?.semanticEquivalence || finish.equivalence?.semanticEquivalence || finish.semanticEquivalence || null,
        runId: terminalResult.runId || finish.runId,
      },
      associations: {
        planning: finish.association.gates?.planning || null,
        completion: finish.association.gates?.completion || null,
        verification: finish.association.gates?.verification || null,
      },
      snapshot: receipt ? { taskContext: receipt.taskContext || null, planning: receipt.planning || null, contentTarget: receipt.contentTarget || null, verificationPolicy: receipt.verificationPolicy || null, candidate: selectedHandoff?.candidate || null, handoff: selectedHandoff, decision: selectedHandoff?.decision || null } : null,
      diagnostics: finish.diagnostics || [],
    };
  }

  function inspectTaskTerminalDelivery(targetRoot, taskId) {
    const taskResult = runtime.inspectTaskRecord(targetRoot, taskId);
    const task = taskResult.record;
    const development = runtime.inspectTaskDevelopment(targetRoot, taskId);
    const receipt = development.development?.receipt;
    const reviews = runtime.inspectTaskReview(targetRoot, taskId);
    const verification = runtime.inspectTaskVerification(targetRoot, taskId);
    const projection = baseProjection(task, development, reviews, verification);
    const terminal = terminalDeliverySection(targetRoot, taskId, { taskRecord: task, development });
    if (terminal.status !== 'delivered') return { ...projection, ...terminal };
    const finish = runtime.inspectTaskLifecycleReadModel(targetRoot, taskId).model.finish;
    const selectedHandoff = receipt?.handoffs?.find((item) => item.identity === finish.association.handoffIdentity) || null;
    return {
      ...projection,
      ...terminal,
      snapshot: { taskContext: receipt?.taskContext || null, planning: receipt?.planning || null, contentTarget: receipt?.contentTarget || null, verificationPolicy: receipt?.verificationPolicy || null, candidate: selectedHandoff?.candidate || null, handoff: selectedHandoff, decision: selectedHandoff?.decision || null },
    };
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
