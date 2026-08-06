const SCHEMA_VERSION = 'buildr.task-lifecycle-read-model/v1';
const TERMINAL_ASSOCIATION_SCHEMA = 'buildr.task-terminal-delivery-associations/v1';

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

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} 必须是非空字符串。`), { code: 'task_terminal_association_invalid', status: 400, details: { field } });
  return value.trim();
}

function terminalGate(value, field) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${field} 必须是对象或 null。`), { code: 'task_terminal_association_invalid', status: 400, details: { field } });
  const status = requiredText(value.status, `${field}.status`);
  if (status === 'gate-disposition') {
    const disposition = requiredText(value.disposition, `${field}.disposition`);
    const targetIdentity = disposition === 'not-applicable' && value.targetIdentity == null
      ? null
      : requiredText(value.targetIdentity, `${field}.targetIdentity`);
    return {
      status,
      disposition,
      targetIdentity,
      summary: requiredText(value.summary, `${field}.summary`),
      source: requiredText(value.source, `${field}.source`),
    };
  }
  const targetIdentity = requiredText(value.targetIdentity, `${field}.targetIdentity`);
  if (!['adopted-at-delivery', 'verified-at-delivery'].includes(status)) throw Object.assign(new Error(`${field}.status 不受支持：${status}。`), { code: 'task_terminal_association_invalid', status: 400, details: { field: `${field}.status`, value: status } });
  return {
    status,
    targetIdentity,
    resultDigest: requiredText(value.resultDigest, `${field}.resultDigest`),
    outcome: requiredText(value.outcome, `${field}.outcome`),
  };
}

function terminalAssociation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Delivered Finish projection 必须包含 terminal association。'), { code: 'task_terminal_association_required', status: 400 });
  if (value.schemaVersion !== TERMINAL_ASSOCIATION_SCHEMA) throw Object.assign(new Error(`Terminal association schema 不受支持：${value.schemaVersion || '<missing>'}。`), { code: 'task_terminal_association_schema_invalid', status: 400 });
  return {
    schemaVersion: TERMINAL_ASSOCIATION_SCHEMA,
    handoffIdentity: requiredText(value.handoffIdentity, 'association.handoffIdentity'),
    candidateIdentity: requiredText(value.candidateIdentity, 'association.candidateIdentity'),
    candidateGeneration: Number.isInteger(value.candidateGeneration) && value.candidateGeneration > 0 ? value.candidateGeneration : (() => { throw Object.assign(new Error('association.candidateGeneration 必须是正整数。'), { code: 'task_terminal_association_invalid', status: 400, details: { field: 'association.candidateGeneration' } }); })(),
    gates: {
      planning: terminalGate(value.gates?.planning, 'association.gates.planning'),
      completion: terminalGate(value.gates?.completion, 'association.gates.completion'),
      verification: terminalGate(value.gates?.verification, 'association.gates.verification'),
    },
    observedAt: value.observedAt && !Number.isNaN(Date.parse(value.observedAt)) ? value.observedAt : now(),
    source: 'task-finish-application',
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
    const normalized = clone(finish);
    if (normalized?.status === 'delivered') normalized.association = terminalAssociation(normalized.association);
    return project(targetRoot, taskId, (current) => ({
      ...current,
      finish: { ...normalized, observedAt: normalized?.observedAt || now(), source: 'task-finish-application' },
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
