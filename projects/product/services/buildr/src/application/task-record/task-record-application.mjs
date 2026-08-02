import path from 'node:path';

import { normalizeTaskRecord, taskRecordError } from '../../domain/task-record/task-record.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

const QUALIFIED_PATTERN = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

function assertObject(input, label = 'Task Record action input') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskRecordError('task_record_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input, fields, label = 'Task Record action') {
  assertObject(input, label);
  for (const field of Object.keys(input)) {
    if (!fields.has(field)) throw taskRecordError('task_record_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw taskRecordError('task_record_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  return value.trim();
}

function array(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  return value;
}

function qualified(value, field, secondField) {
  if (typeof value === 'string') {
    const match = value.match(QUALIFIED_PATTERN);
    if (!match) throw taskRecordError('task_record_reference_invalid', `${field} 必须使用 project/${secondField}。`, 400, { field, value });
    return { project: match[1], [secondField]: match[2] };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskRecordError('task_record_reference_invalid', `${field} 必须是限定引用。`, 400, { field });
  return { project: value.project, [secondField]: value[secondField] };
}

function referenceKey(value, secondField) {
  return `${value.project}/${value[secondField]}`;
}

function uniqueInput(values, key, field) {
  const seen = new Set();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) throw taskRecordError('task_record_reference_duplicate', `${field} 包含重复操作：${identity}。`, 409, { field, identity });
    seen.add(identity);
  }
  return values;
}

function nowIso() {
  return new Date().toISOString();
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function readModel(persistence, changeReferences = []) {
  return { path: persistence.file, record: persistence.record, recordDigest: persistence.recordDigest, changeReferences };
}

function effect(type, root, file) {
  return { type, path: relative(root, file) };
}

export function registerTaskRecordApplication(runtime) {
  function validateScopeReferences(targetRoot, record) {
    const projects = runtime.readProjectRegistryRecord(targetRoot);
    if (projects.registry.migrationRequired) throw taskRecordError('task_record_project_registry_migration_required', 'Project registry 需要先完成 canonical 迁移。', 409, undefined, '先运行 canonical buildr sync <agent>。');
    const requiredProjects = new Set([
      ...record.scope.projects,
      ...record.scope.services.map((item) => item.project),
      ...record.changes.map((item) => item.project),
    ]);
    for (const projectCode of requiredProjects) {
      if (!projects.projects[projectCode]) throw taskRecordError('task_record_project_not_found', `Project 不存在：${projectCode}。`, 409, { project: projectCode }, '修正 Task scope 或先登记 Project。');
    }
    const serviceRecords = new Map();
    for (const service of record.scope.services) {
      if (!serviceRecords.has(service.project)) serviceRecords.set(service.project, runtime.readServiceRegistryRecord(targetRoot, service.project));
      if (!serviceRecords.get(service.project).services[service.service]) {
        throw taskRecordError('task_record_service_not_found', `Service 不存在：${service.project}/${service.service}。`, 409, service, '修正 Task scope 或先登记 Service。');
      }
    }
    return record;
  }

  function resolveChangeReferences(targetRoot, taskId, changes, options = {}) {
    return changes.map((change) => {
      try {
        return runtime.resolveTaskScopedChange(targetRoot, taskId, change, options);
      } catch (error) {
        return {
          schemaVersion: 'buildr.task-scoped-change-reference/v1', taskId, reference: change, availability: 'unavailable', workingCopy: null, retainedBaseline: null,
          diagnostic: { code: error.code || 'task_change_unavailable', message: error.message, details: error.details },
        };
      }
    });
  }

  function assertChangeReferencesAvailable(targetRoot, taskId, changes, options = {}) {
    const resolutions = resolveChangeReferences(targetRoot, taskId, changes, options);
    const unavailable = resolutions.find((item) => item.availability !== 'available');
    if (unavailable) throw taskRecordError('task_record_change_not_found', `OpenSpec Change 不存在或当前不可解析：${unavailable.reference.project}/${unavailable.reference.change}。`, 409, unavailable, '修正 Change 引用，或先在该 Task Environment/retained Project 中创建对应 Change。');
    return resolutions;
  }

  function readCurrent(targetRoot, taskId) {
    const persistence = runtime.readTaskRecordPersistence(targetRoot, taskId);
    validateScopeReferences(persistence.root, persistence.record);
    return persistence;
  }

  function result(operation, status, persistence, effects = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordResult, {
      operation,
      status,
      taskId: persistence.record.taskId,
      path: persistence.file,
      record: persistence.record,
      recordDigest: persistence.recordDigest,
      changeReferences: resolveChangeReferences(persistence.root, persistence.record.taskId, persistence.record.changes),
      diagnostic: null,
      effects,
      nextActions: [],
    });
  }

  function assertExpectedDigest(current, expectedRecordDigest) {
    if (expectedRecordDigest === undefined) return;
    if (typeof expectedRecordDigest !== 'string' || !expectedRecordDigest) throw taskRecordError('task_record_digest_required', 'expectedRecordDigest 必须是非空字符串。', 400, { field: 'expectedRecordDigest' });
    if (expectedRecordDigest !== current.recordDigest) {
      throw taskRecordError('task_record_conflict', 'Task Record 已被其他操作修改，请刷新后重新判断。', 409, { currentRecordDigest: current.recordDigest }, '刷新 Task 详情并基于最新内容重新提交。');
    }
  }

  function listTaskRecords(targetRoot) {
    const persistence = runtime.listTaskRecordPersistence(targetRoot);
    const tasks = [];
    const diagnostics = [...persistence.diagnostics];
    for (const record of persistence.records) {
      try {
        validateScopeReferences(persistence.root, record.record);
        tasks.push(readModel(record, resolveChangeReferences(persistence.root, record.record.taskId, record.record.changes)));
      } catch (error) {
        diagnostics.push({ taskId: record.record.taskId, code: error.code || 'task_record_invalid', message: error.message, details: error.details });
      }
    }
    tasks.sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt) || a.record.taskId.localeCompare(b.record.taskId));
    return { schemaVersion: 'buildr.task-record-list/v1', tasks, diagnostics };
  }

  function inspectTaskRecord(targetRoot, taskId) {
    return result('inspect', 'inspected', readCurrent(targetRoot, taskId));
  }

  function createTaskRecord(targetRoot, input) {
    assertFields(input, new Set(['taskId', 'title', 'intent', 'projects', 'services', 'changes']), 'Task create');
    const taskId = text(input.taskId, 'taskId');
    const timestamp = nowIso();
    const record = normalizeTaskRecord({
      schemaVersion: 'buildr.task-record/v1',
      taskId,
      title: text(input.title, 'title'),
      intent: text(input.intent, 'intent'),
      scope: {
        projects: array(input.projects, 'projects'),
        services: array(input.services, 'services').map((item, index) => qualified(item, `services[${index}]`, 'service')),
      },
      changes: array(input.changes, 'changes').map((item, index) => qualified(item, `changes[${index}]`, 'change')),
      status: 'active', result: null, createdAt: timestamp, updatedAt: timestamp,
    }, { expectedTaskId: taskId });
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    validateScopeReferences(root, record);
    assertChangeReferencesAvailable(root, taskId, record.changes, { allowMissingTask: true });
    try {
      const written = runtime.createTaskRecordPersistence(root, record);
      return result('create', 'created', written, [effect('created', root, written.file)]);
    } catch (error) {
      if (error.taskRecordBusiness) throw error;
      throw taskRecordError('task_record_write_failed', `Task Record 创建失败：${error.message}`, 500, { taskId }, '保留现场并检查 filesystem/doctor 诊断后重试。');
    }
  }

  function normalizedUpdate(input) {
    assertFields(input, new Set(['expectedRecordDigest', 'title', 'intent', 'addProjects', 'removeProjects', 'addServices', 'removeServices', 'addChanges', 'removeChanges']), 'Task update');
    const operations = {
      ...(input.title === undefined ? {} : { title: text(input.title, 'title') }),
      ...(input.intent === undefined ? {} : { intent: text(input.intent, 'intent') }),
      addProjects: uniqueInput(array(input.addProjects, 'addProjects').map((item) => text(item, 'addProjects')), (item) => item, 'addProjects'),
      removeProjects: uniqueInput(array(input.removeProjects, 'removeProjects').map((item) => text(item, 'removeProjects')), (item) => item, 'removeProjects'),
      addServices: uniqueInput(array(input.addServices, 'addServices').map((item, index) => qualified(item, `addServices[${index}]`, 'service')), (item) => referenceKey(item, 'service'), 'addServices'),
      removeServices: uniqueInput(array(input.removeServices, 'removeServices').map((item, index) => qualified(item, `removeServices[${index}]`, 'service')), (item) => referenceKey(item, 'service'), 'removeServices'),
      addChanges: uniqueInput(array(input.addChanges, 'addChanges').map((item, index) => qualified(item, `addChanges[${index}]`, 'change')), (item) => referenceKey(item, 'change'), 'addChanges'),
      removeChanges: uniqueInput(array(input.removeChanges, 'removeChanges').map((item, index) => qualified(item, `removeChanges[${index}]`, 'change')), (item) => referenceKey(item, 'change'), 'removeChanges'),
    };
    const hasMutation = operations.title !== undefined || operations.intent !== undefined
      || ['addProjects', 'removeProjects', 'addServices', 'removeServices', 'addChanges', 'removeChanges'].some((field) => operations[field].length);
    if (!hasMutation) throw taskRecordError('task_record_update_empty', 'Task update 至少需要一个明确 mutation。', 400, undefined, '提供 title/intent setter 或 scope/change add/remove 操作。');
    for (const [addField, removeField, key] of [['addProjects', 'removeProjects', (item) => item], ['addServices', 'removeServices', (item) => referenceKey(item, 'service')], ['addChanges', 'removeChanges', (item) => referenceKey(item, 'change')]]) {
      const removed = new Set(operations[removeField].map(key));
      const conflict = operations[addField].map(key).find((item) => removed.has(item));
      if (conflict) throw taskRecordError('task_record_update_conflict', `同一引用不能同时新增和移除：${conflict}。`, 400, { identity: conflict });
    }
    return { operations, expectedRecordDigest: input.expectedRecordDigest };
  }

  function applyCollection(current, additions, removals, key, label) {
    const values = [...current];
    const index = new Map(values.map((item) => [key(item), item]));
    for (const item of additions) {
      const identity = key(item);
      if (index.has(identity)) throw taskRecordError('task_record_reference_duplicate', `${label} 已包含：${identity}。`, 409, { identity }, '移除重复 add 操作或先 inspect 当前记录。');
      index.set(identity, item); values.push(item);
    }
    for (const item of removals) {
      const identity = key(item);
      if (!index.has(identity)) throw taskRecordError('task_record_reference_missing', `${label} 不包含：${identity}。`, 409, { identity }, '先 inspect 当前记录，再提交存在的 remove 操作。');
      index.delete(identity);
      const at = values.findIndex((candidate) => key(candidate) === identity);
      values.splice(at, 1);
    }
    return values;
  }

  function mutate(targetRoot, taskId, operation, input, build, addedChanges = []) {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    try {
      const current = readCurrent(root, taskId);
      assertExpectedDigest(current, input.expectedRecordDigest);
      if (current.record.status !== 'active') throw taskRecordError('task_record_terminal', `Task ${taskId} 已是 ${current.record.status}，不能再次修改或结束。`, 409, { status: current.record.status }, `运行 buildr task inspect ${taskId} 查看终态结果。`);
      const candidate = normalizeTaskRecord(build(current.record), { expectedTaskId: taskId });
      validateScopeReferences(root, candidate);
      assertChangeReferencesAvailable(root, taskId, addedChanges);
      const same = JSON.stringify({ ...candidate, updatedAt: current.record.updatedAt }) === JSON.stringify(current.record);
      if (same) return result(operation, operation === 'update' ? 'updated' : operation === 'complete' ? 'completed' : 'abandoned', current, []);
      const written = runtime.writeTaskRecordPersistence(root, { ...candidate, updatedAt: nowIso() });
      return result(operation, operation === 'update' ? 'updated' : operation === 'complete' ? 'completed' : 'abandoned', written, [effect('updated', root, written.file)]);
    } catch (error) {
      if (error.taskRecordBusiness) throw error;
      throw taskRecordError('task_record_write_failed', `Task Record ${operation} 失败：${error.message}`, 500, { taskId }, '保留现场并检查 filesystem/doctor 诊断后重试。');
    }
  }

  function updateTaskRecord(targetRoot, taskId, input) {
    const { operations, expectedRecordDigest } = normalizedUpdate(input);
    return mutate(targetRoot, taskId, 'update', { expectedRecordDigest }, (current) => ({
      ...current,
      ...(operations.title === undefined ? {} : { title: operations.title }),
      ...(operations.intent === undefined ? {} : { intent: operations.intent }),
      scope: {
        projects: applyCollection(current.scope.projects, operations.addProjects, operations.removeProjects, (item) => item, 'Project scope'),
        services: applyCollection(current.scope.services, operations.addServices, operations.removeServices, (item) => referenceKey(item, 'service'), 'Service scope'),
      },
      changes: applyCollection(current.changes, operations.addChanges, operations.removeChanges, (item) => referenceKey(item, 'change'), 'Change references'),
    }), operations.addChanges);
  }

  function completeTaskRecord(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedRecordDigest', 'summary', 'noChange']), 'Task complete');
    if (typeof input.noChange !== 'boolean') throw taskRecordError('task_record_no_change_required', 'complete 必须明确提供 noChange boolean。', 400, { field: 'noChange' });
    const summary = text(input.summary, 'summary');
    return mutate(targetRoot, taskId, 'complete', input, (current) => ({ ...current, status: 'completed', result: { summary, noChange: input.noChange } }));
  }

  function abandonTaskRecord(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedRecordDigest', 'reason']), 'Task abandon');
    const summary = text(input.reason, 'reason');
    return mutate(targetRoot, taskId, 'abandon', input, (current) => ({ ...current, status: 'abandoned', result: { summary } }));
  }

  Object.assign(runtime, { listTaskRecords, inspectTaskRecord, createTaskRecord, updateTaskRecord, completeTaskRecord, abandonTaskRecord });
  return runtime;
}
