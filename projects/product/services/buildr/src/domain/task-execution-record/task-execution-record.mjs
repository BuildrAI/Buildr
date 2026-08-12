import crypto from 'node:crypto';

import { isTaskRecordId } from '../task-record/task-record.mjs';

export const TASK_EXECUTION_RECORD_SCHEMA = 'buildr.task-execution-record/v1';
export const TASK_EXECUTION_RECORD_REDACTION_VERSION = 'buildr.task-execution-record-redaction/v1';
export const TASK_EXECUTION_RECORD_OWNER_KINDS = Object.freeze({
  'task-verification': Object.freeze(['verification-execution']),
  'task-finish': Object.freeze(['finish-diagnostics']),
});
export const TASK_EXECUTION_RECORD_OUTCOMES = Object.freeze(['running', 'passed', 'failed', 'blocked', 'cancelled']);
export const TASK_EXECUTION_RECORD_LIFECYCLES = Object.freeze(['open', 'retained', 'cleanup_pending', 'cleaned', 'attention']);
export const TASK_EXECUTION_RECORD_RESOLUTIONS = Object.freeze(['not-required', 'pending', 'acknowledged', 'recovered']);
export const TASK_EXECUTION_RECORD_BODY_STATUSES = Object.freeze(['staging', 'available', 'cleaned']);
export const TASK_EXECUTION_RECORD_QUOTA_STATUSES = Object.freeze(['reserved', 'charged', 'released']);
export const TASK_EXECUTION_RECORD_LIMITS = Object.freeze({
  fileBytes: 4 * 1024 * 1024,
  recordBytes: 16 * 1024 * 1024,
  taskOwnerBytes: 256 * 1024 * 1024,
  workspaceBytes: 2 * 1024 * 1024 * 1024,
});
export const TASK_EXECUTION_RECORD_RETENTION = Object.freeze({
  passedDays: 7,
  failureDays: 30,
  passedRecentCount: 3,
  tombstoneDays: 90,
  tombstoneRecentCount: 20,
});
export const TASK_EXECUTION_RECORD_GC_LIMITS = Object.freeze({
  defaultBatch: 100,
  maximumBatch: 500,
});

const TERMINAL_OUTCOMES = new Set(['passed', 'failed', 'blocked', 'cancelled']);
const FAILURE_OUTCOMES = new Set(['failed', 'blocked', 'cancelled']);
const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const RECORD_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;
const RELATIVE_LOCATOR = /^\.buildr\/local\/task-execution-records\/[a-z0-9-]+\/[a-z0-9][a-z0-9-]{0,127}\/$/u;

export function taskExecutionRecordError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  error.nextAction = nextAction;
  error.taskExecutionRecordBusiness = true;
  return error;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskExecutionRecordError('task_execution_record_value_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function closed(value, allowed, field) {
  for (const name of Object.keys(value)) {
    if (!allowed.has(name)) throw taskExecutionRecordError('task_execution_record_field_forbidden', `${field} 不支持字段：${name}。`, 400, { field: `${field}.${name}` });
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw taskExecutionRecordError('task_execution_record_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  const normalized = value.trim();
  if (/\r|\n/u.test(normalized)) throw taskExecutionRecordError('task_execution_record_field_invalid', `${field} 不能包含换行。`, 400, { field });
  return normalized;
}

function oneOf(value, values, field) {
  if (!values.includes(value)) throw taskExecutionRecordError('task_execution_record_field_invalid', `${field} 不受支持：${value}。`, 400, { field, value });
  return value;
}

function timestamp(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw taskExecutionRecordError('task_execution_record_timestamp_invalid', `${field} 必须是ISO时间。`, 400, { field });
  return value;
}

function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw taskExecutionRecordError('task_execution_record_size_invalid', `${field} 必须是非负安全整数。`, 400, { field });
  return value;
}

function nullableText(value, field) {
  return value === null || value === undefined ? null : text(value, field);
}

function nullableDigest(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !DIGEST.test(value)) throw taskExecutionRecordError('task_execution_record_digest_invalid', `${field} 必须是sha256 digest。`, 400, { field });
  return value;
}

function recordIdentity(value, field = 'recordId') {
  const normalized = text(value, field);
  if (!RECORD_ID.test(normalized)) throw taskExecutionRecordError('task_execution_record_identity_invalid', `${field} 必须是小写安全标识。`, 400, { field });
  return normalized;
}

function taskIdentity(value) {
  const normalized = text(value, 'taskId');
  if (!isTaskRecordId(normalized)) throw taskExecutionRecordError('task_execution_record_identity_invalid', 'taskId 必须符合正式 Task ID 契约。', 400, { field: 'taskId' });
  return normalized;
}

function addDays(iso, days) {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

function assertState(record) {
  const open = record.lifecycleStatus === 'open';
  const terminalBody = ['retained', 'cleanup_pending', 'attention'].includes(record.lifecycleStatus);
  const cleaned = record.lifecycleStatus === 'cleaned';
  if (open && !(record.outcome === 'running'
    && record.bodyStatus === 'staging'
    && record.quotaStatus === 'reserved'
    && record.resolutionStatus === 'not-required'
    && record.body.locator === null
    && record.body.digest === null
    && record.body.storedSizeBytes === 0
    && record.body.originalSizeBytes === 0
    && record.body.truncated === false
    && record.body.reservedSizeBytes === TASK_EXECUTION_RECORD_LIMITS.recordBytes
    && record.retention.retainUntil === null
    && record.timestamps.sealedAt === null
    && record.timestamps.cleanupStartedAt === null
    && record.timestamps.cleanedAt === null
    && record.cleanupCode === null)) {
    throw taskExecutionRecordError('task_execution_record_state_invalid', 'open record状态组合不合法。', 409);
  }
  if (terminalBody && !(TERMINAL_OUTCOMES.has(record.outcome)
    && record.bodyStatus === 'available'
    && record.quotaStatus === 'charged'
    && record.body.locator !== null
    && record.body.digest !== null
    && record.body.storedSizeBytes <= TASK_EXECUTION_RECORD_LIMITS.recordBytes
    && record.body.reservedSizeBytes === 0
    && record.retention.retainUntil !== null
    && record.timestamps.sealedAt !== null
    && record.timestamps.cleanedAt === null
    && record.cleanupCode === null)) {
    throw taskExecutionRecordError('task_execution_record_state_invalid', `${record.lifecycleStatus} record状态组合不合法。`, 409);
  }
  if (record.lifecycleStatus === 'cleanup_pending' && record.timestamps.cleanupStartedAt === null) {
    throw taskExecutionRecordError('task_execution_record_state_invalid', 'cleanup_pending必须包含cleanupStartedAt。', 409);
  }
  if (record.lifecycleStatus !== 'cleanup_pending' && record.timestamps.cleanupStartedAt !== null) {
    throw taskExecutionRecordError('task_execution_record_state_invalid', '只有cleanup_pending可以包含cleanupStartedAt。', 409);
  }
  if (cleaned && !(TERMINAL_OUTCOMES.has(record.outcome)
    && record.bodyStatus === 'cleaned'
    && record.quotaStatus === 'released'
    && record.body.locator === null
    && record.body.digest !== null
    && record.body.reservedSizeBytes === 0
    && record.retention.retainUntil !== null
    && record.timestamps.sealedAt !== null
    && record.timestamps.cleanedAt !== null
    && record.cleanupCode !== null)) {
    throw taskExecutionRecordError('task_execution_record_state_invalid', 'cleaned record状态组合不合法。', 409);
  }
  if (record.outcome === 'passed' && record.resolutionStatus !== 'not-required') {
    throw taskExecutionRecordError('task_execution_record_resolution_invalid', 'passed record的resolution必须是not-required。', 409);
  }
  if (FAILURE_OUTCOMES.has(record.outcome) && !['pending', 'acknowledged', 'recovered'].includes(record.resolutionStatus)) {
    throw taskExecutionRecordError('task_execution_record_resolution_invalid', '失败类record必须保存pending、acknowledged或recovered resolution。', 409);
  }
  if (record.resolutionStatus === 'pending' && record.timestamps.resolvedAt !== null) {
    throw taskExecutionRecordError('task_execution_record_resolution_invalid', 'pending resolution不能包含resolvedAt。', 409);
  }
  if (['acknowledged', 'recovered'].includes(record.resolutionStatus) && record.timestamps.resolvedAt === null) {
    throw taskExecutionRecordError('task_execution_record_resolution_invalid', '已处置resolution必须包含resolvedAt。', 409);
  }
  if (record.resolutionStatus === 'not-required' && record.timestamps.resolvedAt !== null) {
    throw taskExecutionRecordError('task_execution_record_resolution_invalid', 'not-required resolution不能包含resolvedAt。', 409);
  }
  return record;
}

export function normalizeTaskExecutionRecord(value, { expectedTaskId = null, expectedRecordId = null } = {}) {
  const record = object(value, 'record');
  closed(record, new Set([
    'schemaVersion', 'recordId', 'taskId', 'owner', 'kind', 'runIdentity', 'targetIdentity', 'producer',
    'outcome', 'lifecycleStatus', 'resolutionStatus', 'bodyStatus', 'quotaStatus', 'body', 'retention', 'timestamps', 'cleanupCode',
  ]), 'record');
  if (record.schemaVersion !== TASK_EXECUTION_RECORD_SCHEMA) throw taskExecutionRecordError('task_execution_record_schema_unsupported', `schemaVersion必须是${TASK_EXECUTION_RECORD_SCHEMA}。`, 409, { actual: record.schemaVersion });
  const recordId = recordIdentity(record.recordId);
  const taskId = taskIdentity(record.taskId);
  if (expectedTaskId && taskId !== expectedTaskId) throw taskExecutionRecordError('task_execution_record_task_identity_mismatch', `Task identity不一致：${expectedTaskId} != ${taskId}。`, 409, { expectedTaskId, taskId });
  if (expectedRecordId && recordId !== expectedRecordId) throw taskExecutionRecordError('task_execution_record_identity_mismatch', `record identity不一致：${expectedRecordId} != ${recordId}。`, 409, { expectedRecordId, recordId });
  const owner = oneOf(record.owner, Object.keys(TASK_EXECUTION_RECORD_OWNER_KINDS), 'owner');
  const kind = oneOf(record.kind, TASK_EXECUTION_RECORD_OWNER_KINDS[owner], 'kind');
  const body = object(record.body, 'body');
  closed(body, new Set(['locator', 'digest', 'storedSizeBytes', 'originalSizeBytes', 'truncated', 'redactionVersion', 'reservedSizeBytes']), 'body');
  const locator = nullableText(body.locator, 'body.locator');
  if (locator && !RELATIVE_LOCATOR.test(locator)) throw taskExecutionRecordError('task_execution_record_locator_invalid', 'body.locator必须是受限Workspace相对目录。', 400, { field: 'body.locator' });
  const retention = object(record.retention, 'retention');
  closed(retention, new Set(['retainUntil']), 'retention');
  const timestamps = object(record.timestamps, 'timestamps');
  closed(timestamps, new Set(['openedAt', 'sealedAt', 'resolvedAt', 'cleanupStartedAt', 'cleanedAt', 'updatedAt']), 'timestamps');
  const normalized = {
    schemaVersion: TASK_EXECUTION_RECORD_SCHEMA,
    recordId,
    taskId,
    owner,
    kind,
    runIdentity: text(record.runIdentity, 'runIdentity'),
    targetIdentity: text(record.targetIdentity, 'targetIdentity'),
    producer: text(record.producer, 'producer'),
    outcome: oneOf(record.outcome, TASK_EXECUTION_RECORD_OUTCOMES, 'outcome'),
    lifecycleStatus: oneOf(record.lifecycleStatus, TASK_EXECUTION_RECORD_LIFECYCLES, 'lifecycleStatus'),
    resolutionStatus: oneOf(record.resolutionStatus, TASK_EXECUTION_RECORD_RESOLUTIONS, 'resolutionStatus'),
    bodyStatus: oneOf(record.bodyStatus, TASK_EXECUTION_RECORD_BODY_STATUSES, 'bodyStatus'),
    quotaStatus: oneOf(record.quotaStatus, TASK_EXECUTION_RECORD_QUOTA_STATUSES, 'quotaStatus'),
    body: {
      locator,
      digest: nullableDigest(body.digest, 'body.digest'),
      storedSizeBytes: integer(body.storedSizeBytes, 'body.storedSizeBytes'),
      originalSizeBytes: integer(body.originalSizeBytes, 'body.originalSizeBytes'),
      truncated: body.truncated === true,
      redactionVersion: text(body.redactionVersion, 'body.redactionVersion'),
      reservedSizeBytes: integer(body.reservedSizeBytes, 'body.reservedSizeBytes'),
    },
    retention: { retainUntil: timestamp(retention.retainUntil, 'retention.retainUntil', { nullable: true }) },
    timestamps: {
      openedAt: timestamp(timestamps.openedAt, 'timestamps.openedAt'),
      sealedAt: timestamp(timestamps.sealedAt, 'timestamps.sealedAt', { nullable: true }),
      resolvedAt: timestamp(timestamps.resolvedAt, 'timestamps.resolvedAt', { nullable: true }),
      cleanupStartedAt: timestamp(timestamps.cleanupStartedAt, 'timestamps.cleanupStartedAt', { nullable: true }),
      cleanedAt: timestamp(timestamps.cleanedAt, 'timestamps.cleanedAt', { nullable: true }),
      updatedAt: timestamp(timestamps.updatedAt, 'timestamps.updatedAt'),
    },
    cleanupCode: nullableText(record.cleanupCode, 'cleanupCode'),
  };
  if (typeof body.truncated !== 'boolean') throw taskExecutionRecordError('task_execution_record_field_invalid', 'body.truncated必须是boolean。', 400, { field: 'body.truncated' });
  if (normalized.body.redactionVersion !== TASK_EXECUTION_RECORD_REDACTION_VERSION) throw taskExecutionRecordError('task_execution_record_redaction_version_invalid', `redactionVersion必须是${TASK_EXECUTION_RECORD_REDACTION_VERSION}。`, 409);
  return assertState(normalized);
}

export function createOpenTaskExecutionRecord({ recordId = `task-exec-${crypto.randomUUID()}`, taskId, owner, kind, runIdentity, targetIdentity, producer, openedAt = new Date().toISOString() }) {
  return normalizeTaskExecutionRecord({
    schemaVersion: TASK_EXECUTION_RECORD_SCHEMA,
    recordId,
    taskId,
    owner,
    kind,
    runIdentity,
    targetIdentity,
    producer,
    outcome: 'running',
    lifecycleStatus: 'open',
    resolutionStatus: 'not-required',
    bodyStatus: 'staging',
    quotaStatus: 'reserved',
    body: {
      locator: null,
      digest: null,
      storedSizeBytes: 0,
      originalSizeBytes: 0,
      truncated: false,
      redactionVersion: TASK_EXECUTION_RECORD_REDACTION_VERSION,
      reservedSizeBytes: TASK_EXECUTION_RECORD_LIMITS.recordBytes,
    },
    retention: { retainUntil: null },
    timestamps: { openedAt, sealedAt: null, resolvedAt: null, cleanupStartedAt: null, cleanedAt: null, updatedAt: openedAt },
    cleanupCode: null,
  });
}

export function sealTaskExecutionRecord(record, body, outcome, sealedAt = new Date().toISOString(), { attention = false } = {}) {
  const current = normalizeTaskExecutionRecord(record);
  if (current.lifecycleStatus !== 'open') throw taskExecutionRecordError('task_execution_record_not_open', `只有open record可以seal：${current.recordId}。`, 409, { lifecycleStatus: current.lifecycleStatus });
  if (!TERMINAL_OUTCOMES.has(outcome)) throw taskExecutionRecordError('task_execution_record_outcome_not_terminal', 'seal outcome必须是terminal。', 400, { outcome });
  const days = outcome === 'passed' ? TASK_EXECUTION_RECORD_RETENTION.passedDays : TASK_EXECUTION_RECORD_RETENTION.failureDays;
  return normalizeTaskExecutionRecord({
    ...current,
    outcome,
    lifecycleStatus: attention ? 'attention' : 'retained',
    resolutionStatus: outcome === 'passed' ? 'not-required' : 'pending',
    bodyStatus: 'available',
    quotaStatus: 'charged',
    body: { ...body, redactionVersion: TASK_EXECUTION_RECORD_REDACTION_VERSION, reservedSizeBytes: 0 },
    retention: { retainUntil: addDays(sealedAt, days) },
    timestamps: { ...current.timestamps, sealedAt, updatedAt: sealedAt },
  });
}

export function resolveTaskExecutionRecord(record, resolutionStatus, resolvedAt = new Date().toISOString()) {
  const current = normalizeTaskExecutionRecord(record);
  if (!FAILURE_OUTCOMES.has(current.outcome)) throw taskExecutionRecordError('task_execution_record_resolution_not_required', '只有失败类record需要resolution。', 409, { outcome: current.outcome });
  if (!['retained', 'attention'].includes(current.lifecycleStatus)) throw taskExecutionRecordError('task_execution_record_resolution_not_allowed', '只有retained或attention failure record可以更新resolution。', 409, { lifecycleStatus: current.lifecycleStatus });
  if (!['acknowledged', 'recovered'].includes(resolutionStatus)) throw taskExecutionRecordError('task_execution_record_resolution_invalid', 'resolution只接受acknowledged或recovered。', 400, { resolutionStatus });
  return normalizeTaskExecutionRecord({
    ...current,
    resolutionStatus,
    timestamps: { ...current.timestamps, resolvedAt, updatedAt: resolvedAt },
  });
}

export function recoverTaskExecutionRecordAttention(record, recoveredAt = new Date().toISOString()) {
  const current = normalizeTaskExecutionRecord(record);
  if (current.lifecycleStatus !== 'attention') throw taskExecutionRecordError('task_execution_record_not_attention', '只有attention record可以恢复为retained。', 409, { lifecycleStatus: current.lifecycleStatus });
  return normalizeTaskExecutionRecord({
    ...current,
    lifecycleStatus: 'retained',
    timestamps: { ...current.timestamps, updatedAt: recoveredAt },
  });
}

export function evaluateTaskExecutionRecordCleanup(record, { now = new Date().toISOString(), recentRank = null } = {}) {
  const current = normalizeTaskExecutionRecord(record);
  const reasons = [];
  if (current.lifecycleStatus !== 'retained') reasons.push(current.lifecycleStatus === 'attention' ? 'attention-requires-owner-action' : 'record-not-retained');
  if (current.retention.retainUntil && Date.parse(now) < Date.parse(current.retention.retainUntil)) reasons.push('retention-time-protected');
  if (current.outcome === 'passed' && Number.isInteger(recentRank) && recentRank <= TASK_EXECUTION_RECORD_RETENTION.passedRecentCount) reasons.push('recent-count-protected');
  if (FAILURE_OUTCOMES.has(current.outcome) && !['acknowledged', 'recovered'].includes(current.resolutionStatus)) reasons.push('resolution-pending');
  return { eligible: reasons.length === 0, reasons };
}

export function evaluateTaskExecutionRecordTombstonePurge(record, { now = new Date().toISOString(), recentRank = null } = {}) {
  const current = normalizeTaskExecutionRecord(record);
  const reasons = [];
  if (current.lifecycleStatus !== 'cleaned') reasons.push('record-not-cleaned');
  if (!current.timestamps.cleanedAt) reasons.push('cleaned-at-missing');
  else {
    const retainUntil = addDays(current.timestamps.cleanedAt, TASK_EXECUTION_RECORD_RETENTION.tombstoneDays);
    if (Date.parse(now) < Date.parse(retainUntil)) reasons.push('tombstone-time-protected');
  }
  if (!Number.isInteger(recentRank)) reasons.push('tombstone-recent-rank-unknown');
  else if (recentRank <= TASK_EXECUTION_RECORD_RETENTION.tombstoneRecentCount) reasons.push('tombstone-recent-count-protected');
  return { eligible: reasons.length === 0, reasons };
}

export function beginTaskExecutionRecordCleanup(record, cleanupStartedAt = new Date().toISOString()) {
  const current = normalizeTaskExecutionRecord(record);
  if (current.lifecycleStatus !== 'retained') throw taskExecutionRecordError('task_execution_record_cleanup_not_ready', '只有eligible retained record可以进入cleanup_pending。', 409, { lifecycleStatus: current.lifecycleStatus });
  return normalizeTaskExecutionRecord({
    ...current,
    lifecycleStatus: 'cleanup_pending',
    timestamps: { ...current.timestamps, cleanupStartedAt, updatedAt: cleanupStartedAt },
  });
}

export function completeTaskExecutionRecordCleanup(record, cleanupCode, cleanedAt = new Date().toISOString()) {
  const current = normalizeTaskExecutionRecord(record);
  if (current.lifecycleStatus !== 'cleanup_pending') throw taskExecutionRecordError('task_execution_record_cleanup_not_pending', 'record尚未进入cleanup_pending。', 409, { lifecycleStatus: current.lifecycleStatus });
  return normalizeTaskExecutionRecord({
    ...current,
    lifecycleStatus: 'cleaned',
    bodyStatus: 'cleaned',
    quotaStatus: 'released',
    body: { ...current.body, locator: null, reservedSizeBytes: 0 },
    timestamps: { ...current.timestamps, cleanupStartedAt: null, cleanedAt, updatedAt: cleanedAt },
    cleanupCode: text(cleanupCode, 'cleanupCode'),
  });
}
