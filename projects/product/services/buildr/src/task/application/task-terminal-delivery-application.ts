// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
function base(task) {
  return {
    schemaVersion: 'buildr.task-terminal-delivery/v1',
    taskId: task.taskId,
    taskStatus: task.status,
    status: task.status === 'active' ? 'active' : task.status,
    delivered: false,
    delivery: null,
    maintenance: null,
    diagnostics: [],
  };
}

function cleanupFacts(completion, finishState) {
  const cleanup = completion?.cleanup?.environment?.latest?.cleanup
    || completion?.cleanup?.latest?.cleanup
    || completion?.cleanup
    || {};
  const status = completion?.cleanup?.status || (finishState === 'terminal' ? 'cleaned' : 'pending');
  return { status, completedAt: cleanup.completedAt || null, summary: cleanup.summary || null };
}

export function registerTaskTerminalDeliveryApplication(runtime) {
  function inspectTaskTerminalDelivery(targetRoot, taskId) {
    const task = runtime.inspectTaskRecord(targetRoot, taskId).record;
    const result = base(task);
    let finish;
    try {
      finish = runtime.inspectTaskFinishReadModel?.({ root: targetRoot, taskId }) || { state: 'none', result: null, completion: null, diagnostics: [] };
    } catch (error) {
      if (task.status !== 'completed') throw error;
      return { ...result, status: task.result?.noChange ? 'completed-no-change' : 'completed', diagnostics: [{ owner: 'task-finish-history', code: error.code || 'task_finish_history_unavailable', message: error.message }] };
    }

    if (task.status === 'active') {
      if (finish.state !== 'current') return result;
      return {
        ...result,
        delivery: {
          runId: finish.result?.runId || null,
          phase: finish.result?.resume?.phase || finish.result?.phases?.find((item) => ['running', 'blocked', 'failed'].includes(item.status))?.id || null,
        },
        diagnostics: finish.diagnostics || [],
      };
    }
    if (task.status === 'abandoned') return { ...result, status: 'abandoned' };
    if (task.result?.noChange === true) return { ...result, status: 'completed-no-change' };

    const historicalResult = ['terminal', 'current'].includes(finish.state) ? finish.result : null;
    const completion = ['terminal', 'current'].includes(finish.state) ? finish.completion : null;
    if (!historicalResult || !completion) {
      return { ...result, status: 'completed', diagnostics: finish.diagnostics || [] };
    }

    const cleanup = cleanupFacts(completion, finish.state);
    const maintenance = {
      delivery: 'delivered',
      activation: completion.maintenance?.activation
        || (historicalResult.delivery?.activation?.status === 'passed' ? 'passed' : historicalResult.delivery?.activation?.status === 'attention' ? 'attention' : 'not-applicable'),
      environmentCleanup: completion.maintenance?.environmentCleanup
        || (cleanup.status === 'cleaned' ? 'cleaned' : cleanup.status === 'pending' ? 'pending' : 'attention'),
      diagnostics: completion.maintenance?.diagnostics || 'not-applicable',
    };
    return {
      ...result,
      status: 'delivered',
      delivered: true,
      delivery: {
        completedAt: completion.completedAt || historicalResult.completedAt,
        finalRemoteRef: completion.finalRemoteRef || historicalResult.delivery?.finalRemoteRef || null,
        targetBranch: completion.targetBranch || historicalResult.identity?.targetBranch || null,
        remote: historicalResult.identity?.remote || null,
        cleanup,
        runId: completion.runId || historicalResult.runId,
      },
      maintenance,
      diagnostics: finish.diagnostics || [],
    };
  }

  Object.assign(runtime, { inspectTaskTerminalDelivery });
  return runtime;
}
