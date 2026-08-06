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
    const reviews = runtime.inspectTaskReview(targetRoot, taskId);
    const verification = runtime.inspectTaskVerification(targetRoot, taskId);
    const projection = baseProjection(task, development, reviews, verification);
    if (task.status === 'active') return projection;
    if (task.status === 'abandoned') return { ...projection, status: 'abandoned' };
    if (task.result?.noChange === true) return { ...projection, status: 'completed-no-change' };
    const lifecycle = runtime.inspectTaskLifecycleReadModel?.(targetRoot, taskId);
    const finish = lifecycle?.model?.finish;
    if (!finish || finish.status !== 'delivered' || !finish.association) {
      return { ...projection, status: 'completed-unproven', diagnostics: [{ code: 'task_delivery_summary_missing', message: 'Task 已完成，但 SQLite lifecycle read model 没有匹配成功 Finish summary。' }] };
    }
    const selectedHandoff = receipt?.handoffs?.find((item) => item.identity === finish.association.handoffIdentity) || null;
    const cleanupSummary = finish.cleanup?.environment?.latest?.cleanup || finish.cleanup?.latest?.cleanup || {};
    const terminal = {
      status: 'delivered',
      completedAt: finish.completedAt,
      finalRemoteRef: finish.finalRemoteRef,
      targetBranch: finish.targetBranch,
      remote: finish.remote,
      cleanup: { status: finish.cleanup?.status || 'unknown', completedAt: cleanupSummary.completedAt || null, summary: cleanupSummary.summary || null },
      reuseMode: finish.reuseMode,
      semanticEquivalence: finish.equivalence?.semanticEquivalence || finish.semanticEquivalence || null,
      runId: finish.runId,
    };
    return {
      ...projection,
      status: 'delivered',
      delivered: true,
      delivery: terminal,
      snapshot: { taskContext: receipt?.taskContext || null, planning: receipt?.planning || null, contentTarget: receipt?.contentTarget || null, verificationPolicy: receipt?.verificationPolicy || null, candidate: selectedHandoff?.candidate || null, handoff: selectedHandoff, decision: selectedHandoff?.decision || null },
      associations: {
        planning: finish.association.gates?.planning || null,
        completion: finish.association.gates?.completion || null,
        verification: finish.association.gates?.verification || null,
      },
      diagnostics: finish.diagnostics || [],
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
