const SCHEMA_VERSION = 'buildr.task-lifecycle-read-model/v1';

function now() { return new Date().toISOString(); }

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function taskSnapshot(record) {
  return {
    status: record.status,
    result: clone(record.result),
    recordDigest: record.recordDigest || null,
    updatedAt: record.updatedAt,
    observedAt: now(),
    source: 'task-record-application',
  };
}

function emptyModel(taskId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    taskId,
    updatedAt: now(),
    task: null,
    environment: null,
    development: null,
    reviews: { planning: null, completion: null },
    verification: null,
    finish: null,
    diagnostics: [],
  };
}

function slotSummary(slot, observedAt, source) {
  if (!slot) return null;
  const result = slot.result || null;
  return {
    present: Boolean(slot.present),
    resultDigest: slot.resultDigest || null,
    targetIdentity: result?.targetIdentity || result?.target?.identity || null,
    outcome: result?.conclusion?.outcome || null,
    applicability: clone(slot.applicability),
    observedAt,
    source,
  };
}

export function registerTaskLifecycleReadModelApplication(runtime) {
  function project(targetRoot, taskId, patch) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    return runtime.updateTaskLifecyclePersistence(task.root, task.record.taskId, (current) => {
      const base = current || emptyModel(task.record.taskId);
      const next = typeof patch === 'function' ? patch(base, task.record) : { ...base, ...clone(patch) };
      return { ...next, schemaVersion: SCHEMA_VERSION, taskId: task.record.taskId, task: next.task || taskSnapshot(task.record), updatedAt: now() };
    });
  }

  function projectTaskRecord(targetRoot, recordOrTaskId) {
    const task = typeof recordOrTaskId === 'string'
      ? runtime.readTaskRecordPersistence(targetRoot, recordOrTaskId).record
      : recordOrTaskId;
    if (!task?.taskId) throw new Error('Task lifecycle projection requires a Task Record.');
    return project(targetRoot, task.taskId, (current) => ({ ...current, task: taskSnapshot(task) }));
  }

  function projectTaskDevelopment(targetRoot, taskId, { persistence, applicability }) {
    return project(targetRoot, taskId, (current) => ({
      ...current,
      development: {
        receiptDigest: persistence?.receiptDigest || null,
        applicability: clone(applicability),
        observedAt: now(),
        source: 'task-development-application',
      },
    }));
  }

  function projectTaskReview(targetRoot, taskId, slots) {
    const observedAt = now();
    return project(targetRoot, taskId, (current) => ({
      ...current,
      reviews: {
        planning: slotSummary(slots?.planning, observedAt, 'task-review-application'),
        completion: slotSummary(slots?.completion, observedAt, 'task-review-application'),
      },
    }));
  }

  function projectTaskVerification(targetRoot, taskId, slot) {
    return project(targetRoot, taskId, (current) => ({
      ...current,
      verification: slotSummary(slot, now(), 'task-verification-application'),
    }));
  }

  function projectTaskEnvironment(targetRoot, taskId, environment) {
    return project(targetRoot, taskId, (current) => ({
      ...current,
      environment: { ...clone(environment), observedAt: environment?.observedAt || now(), projectionSource: 'task-environment-application' },
    }));
  }

  function projectTaskFinish(targetRoot, taskId, finish) {
    return project(targetRoot, taskId, (current) => ({
      ...current,
      finish: { ...clone(finish), observedAt: finish?.observedAt || now(), source: 'task-finish-application' },
    }));
  }

  function inspectTaskLifecycleReadModel(targetRoot, taskId) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const persistence = runtime.readTaskLifecyclePersistence(task.root, task.record.taskId, { optional: true });
    return {
      schemaVersion: 'buildr.task-lifecycle-read-model-inspect/v1',
      taskId: task.record.taskId,
      present: Boolean(persistence),
      model: persistence?.model || null,
      modelDigest: persistence?.modelDigest || null,
      path: persistence?.file || runtime.taskLifecycleReadModelPath(task.root, task.record.taskId),
    };
  }

  Object.assign(runtime, {
    projectTaskRecord,
    projectTaskDevelopment,
    projectTaskReview,
    projectTaskVerification,
    projectTaskEnvironment,
    projectTaskFinish,
    inspectTaskLifecycleReadModel,
  });
  return runtime;
}
