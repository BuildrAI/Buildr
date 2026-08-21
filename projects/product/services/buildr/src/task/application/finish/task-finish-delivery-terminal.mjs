export function completeTaskDeliveryTerminal(runtime, root, taskId) {
  if (typeof runtime.completeTaskRecordFromFinish !== 'function') {
    const error = new Error('Task Record Application delivery completion entry is unavailable.');
    Object.assign(error, { code: 'task-finish.task-record-completion-unavailable' });
    throw error;
  }
  const result = runtime.completeTaskRecordFromFinish(root, taskId);
  if (result.status !== 'completed' || result.record?.status !== 'completed' || result.record?.result?.noChange !== false) {
    const error = new Error('Task Record Application did not confirm a delivered completed Task.');
    Object.assign(error, { code: 'task-finish.task-record-completion-invalid', details: result });
    throw error;
  }
  return result;
}
