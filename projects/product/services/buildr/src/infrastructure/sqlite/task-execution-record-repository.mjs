import {
  TASK_EXECUTION_RECORD_GC_LIMITS,
  TASK_EXECUTION_RECORD_LIMITS,
  TASK_EXECUTION_RECORD_RETENTION,
  normalizeTaskExecutionRecord,
  taskExecutionRecordError,
} from '../../domain/task-execution-record/task-execution-record.mjs';

function locator(recordId) { return `workspace-sqlite:task-execution-record/${recordId}`; }

function asError(error, operation, details = {}) {
  if (error.taskExecutionRecordBusiness) return error;
  if (error.structuredStoreBusiness) return taskExecutionRecordError(error.code, error.message, error.status, { ...error.details, ...details }, error.nextAction);
  return taskExecutionRecordError('task_execution_record_repository_failed', `Task Execution Record ${operation}失败：${error.message}`, 500, details, '保留Workspace SQLite与record body现场并运行Buildr Doctor。');
}

function rowToRecord(row) {
  return normalizeTaskExecutionRecord({
    schemaVersion: row.schema_version,
    recordId: row.record_id,
    taskId: row.task_id,
    owner: row.owner,
    kind: row.kind,
    runIdentity: row.run_identity,
    invocationIdentity: row.invocation_identity,
    targetIdentity: row.target_identity,
    producer: row.producer,
    outcome: row.outcome,
    lifecycleStatus: row.lifecycle_status,
    resolutionStatus: row.resolution_status,
    bodyStatus: row.body_status,
    quotaStatus: row.quota_status,
    body: {
      locator: row.body_locator,
      digest: row.body_digest,
      storedSizeBytes: row.stored_size_bytes,
      originalSizeBytes: row.original_size_bytes,
      truncated: row.truncated === 1,
      redactionVersion: row.redaction_version,
      reservedSizeBytes: row.reserved_size_bytes,
    },
    retention: { retainUntil: row.retain_until },
    timestamps: {
      openedAt: row.opened_at,
      sealedAt: row.sealed_at,
      resolvedAt: row.resolved_at,
      cleanupStartedAt: row.cleanup_started_at,
      cleanedAt: row.cleaned_at,
      updatedAt: row.updated_at,
    },
    cleanupCode: row.cleanup_code,
  });
}

const SELECT = `SELECT record_id, schema_version, task_id, owner, kind, run_identity, invocation_identity, target_identity, producer,
  outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest,
  stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until,
  opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at
  FROM task_execution_records`;

function persisted(root, record) {
  return { root, file: locator(record.recordId), record };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameOpenIdentity(left, right) {
  return left.taskId === right.taskId
    && left.owner === right.owner
    && left.kind === right.kind
    && left.runIdentity === right.runIdentity
    && left.invocationIdentity === right.invocationIdentity
    && left.targetIdentity === right.targetIdentity
    && left.producer === right.producer;
}

function insert(database, record) {
  database.prepare(`INSERT INTO task_execution_records(
    record_id, schema_version, task_id, owner, kind, run_identity, invocation_identity, target_identity, producer,
    outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest,
    stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until,
    opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.recordId, record.schemaVersion, record.taskId, record.owner, record.kind, record.runIdentity, record.invocationIdentity, record.targetIdentity, record.producer,
    record.outcome, record.lifecycleStatus, record.resolutionStatus, record.bodyStatus, record.quotaStatus, record.body.locator, record.body.digest,
    record.body.storedSizeBytes, record.body.originalSizeBytes, record.body.truncated ? 1 : 0, record.body.redactionVersion, record.body.reservedSizeBytes,
    record.retention.retainUntil, record.timestamps.openedAt, record.timestamps.sealedAt, record.timestamps.resolvedAt,
    record.timestamps.cleanupStartedAt, record.timestamps.cleanedAt, record.cleanupCode, record.timestamps.updatedAt,
  );
}

function quotaCharge(database, where = '', params = []) {
  const row = database.prepare(`SELECT COALESCE(SUM(CASE quota_status
    WHEN 'reserved' THEN reserved_size_bytes
    WHEN 'charged' THEN stored_size_bytes
    ELSE 0 END), 0) AS bytes
    FROM task_execution_records ${where}`).get(...params);
  return Number(row.bytes);
}

export function registerTaskExecutionRecordRepository(runtime) {
  function readTaskExecutionRecordPersistence(targetRoot, recordId, { optional = false } = {}) {
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(targetRoot, { writable: false });
      if (!opened.present) {
        if (optional) return null;
        throw taskExecutionRecordError('task_execution_record_not_found', `Task Execution Record不存在：${recordId}。`, 404, { recordId });
      }
      const row = opened.database.prepare(`${SELECT} WHERE record_id = ?`).get(recordId);
      if (!row) {
        if (optional) return null;
        throw taskExecutionRecordError('task_execution_record_not_found', `Task Execution Record不存在：${recordId}。`, 404, { recordId });
      }
      const record = rowToRecord(row);
      runtime.readTaskRecordPersistence(opened.root, record.taskId);
      return persisted(opened.root, record);
    } catch (error) { throw asError(error, '读取', { recordId }); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function listTaskExecutionRecordPersistence(targetRoot, taskId, { owner = null, kind = null } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      if (!opened.present) return [];
      const clauses = ['task_id = ?'];
      const params = [taskId];
      if (owner) { clauses.push('owner = ?'); params.push(owner); }
      if (kind) { clauses.push('kind = ?'); params.push(kind); }
      return opened.database.prepare(`${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY opened_at DESC, record_id`).all(...params).map((row) => persisted(task.root, rowToRecord(row)));
    } catch (error) { throw asError(error, '列表', { taskId }); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function openTaskExecutionRecordPersistence(targetRoot, value, { allowDuplicateActive = false } = {}) {
    const record = normalizeTaskExecutionRecord(value);
    const task = runtime.readTaskRecordPersistence(targetRoot, record.taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true, writerRole: 'retained-task-state' });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const existingRow = database.prepare(`${SELECT} WHERE task_id = ? AND owner = ? AND kind = ? AND run_identity = ?`).get(record.taskId, record.owner, record.kind, record.runIdentity);
      if (existingRow) {
        const existing = rowToRecord(existingRow);
        if (!sameOpenIdentity(existing, record)) throw taskExecutionRecordError('task_execution_record_open_conflict', '相同Task/owner/kind/run identity已绑定不同record facts。', 409, { recordId: existing.recordId });
        database.exec('COMMIT');
        return { ...persisted(task.root, existing), created: false, existingActive: false };
      }
      if (!allowDuplicateActive && record.invocationIdentity) {
        const activeRow = database.prepare(`${SELECT} WHERE task_id = ? AND owner = ? AND kind = ? AND invocation_identity = ? AND lifecycle_status = 'open' ORDER BY opened_at, record_id LIMIT 1`).get(record.taskId, record.owner, record.kind, record.invocationIdentity);
        if (activeRow) {
          const active = rowToRecord(activeRow);
          database.exec('COMMIT');
          return { ...persisted(task.root, active), created: false, existingActive: true };
        }
      }
      const taskOwnerBytes = quotaCharge(database, "WHERE task_id = ? AND owner = ? AND quota_status IN ('reserved', 'charged')", [record.taskId, record.owner]);
      const workspaceBytes = quotaCharge(database, "WHERE quota_status IN ('reserved', 'charged')");
      if (taskOwnerBytes + record.body.reservedSizeBytes > TASK_EXECUTION_RECORD_LIMITS.taskOwnerBytes) {
        throw taskExecutionRecordError('task_execution_record_task_owner_quota_exhausted', 'Task/owner execution record配额不足，producer execution未启动。', 409, { taskId: record.taskId, owner: record.owner, chargedBytes: taskOwnerBytes, requestedBytes: record.body.reservedSizeBytes, limitBytes: TASK_EXECUTION_RECORD_LIMITS.taskOwnerBytes }, '先由Task Execution Record Application清理eligible records或处置失败record。');
      }
      if (workspaceBytes + record.body.reservedSizeBytes > TASK_EXECUTION_RECORD_LIMITS.workspaceBytes) {
        throw taskExecutionRecordError('task_execution_record_workspace_quota_exhausted', 'Workspace execution record配额不足，producer execution未启动。', 409, { chargedBytes: workspaceBytes, requestedBytes: record.body.reservedSizeBytes, limitBytes: TASK_EXECUTION_RECORD_LIMITS.workspaceBytes }, '先由Task Execution Record Application清理eligible records或处置失败record。');
      }
      insert(database, record);
      const written = rowToRecord(database.prepare(`${SELECT} WHERE record_id = ?`).get(record.recordId));
      database.exec('COMMIT');
      return { ...persisted(task.root, written), created: true, existingActive: false };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, 'open', { taskId: record.taskId, recordId: record.recordId, rollback: { status: 'restored' } });
    } finally { try { opened?.database?.close(); } catch {} }
  }

  function replaceTaskExecutionRecordPersistence(targetRoot, previousValue, nextValue) {
    const previous = normalizeTaskExecutionRecord(previousValue);
    const next = normalizeTaskExecutionRecord(nextValue, { expectedTaskId: previous.taskId, expectedRecordId: previous.recordId });
    const task = runtime.readTaskRecordPersistence(targetRoot, previous.taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true, writerRole: 'retained-task-state' });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const currentRow = database.prepare(`${SELECT} WHERE record_id = ?`).get(previous.recordId);
      if (!currentRow) throw taskExecutionRecordError('task_execution_record_not_found', `Task Execution Record不存在：${previous.recordId}。`, 404, { recordId: previous.recordId });
      const current = rowToRecord(currentRow);
      if (!same(current, previous)) throw taskExecutionRecordError('task_execution_record_conflict', 'Task Execution Record current已变化，请刷新后重试。', 409, { recordId: previous.recordId, lifecycleStatus: current.lifecycleStatus, updatedAt: current.timestamps.updatedAt });
      database.prepare('DELETE FROM task_execution_records WHERE record_id = ?').run(previous.recordId);
      insert(database, next);
      const written = rowToRecord(database.prepare(`${SELECT} WHERE record_id = ?`).get(next.recordId));
      database.exec('COMMIT');
      return persisted(task.root, written);
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, '状态替换', { taskId: previous.taskId, recordId: previous.recordId, rollback: { status: 'restored' } });
    } finally { try { opened?.database?.close(); } catch {} }
  }

  function taskExecutionRecordRecentRank(targetRoot, record) {
    const normalized = normalizeTaskExecutionRecord(record);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(targetRoot, { writable: false });
      if (!opened.present || !normalized.timestamps.sealedAt) return null;
      const rows = opened.database.prepare(`SELECT record_id FROM task_execution_records
        WHERE task_id = ? AND owner = ? AND kind = ? AND outcome = ? AND sealed_at IS NOT NULL
        ORDER BY sealed_at DESC, record_id`).all(normalized.taskId, normalized.owner, normalized.kind, normalized.outcome);
      const index = rows.findIndex((row) => row.record_id === normalized.recordId);
      return index === -1 ? null : index + 1;
    } catch (error) { throw asError(error, '最近记录查询', { recordId: normalized.recordId }); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function listTaskExecutionRecordGcCandidates(targetRoot, { now = new Date().toISOString(), limit = TASK_EXECUTION_RECORD_GC_LIMITS.defaultBatch } = {}) {
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(targetRoot, { writable: false });
      if (!opened.present) return { root: opened.root, scanned: 0, eligible: 0, candidates: [] };
      const cutoff = new Date(Date.parse(now) - TASK_EXECUTION_RECORD_RETENTION.tombstoneDays * 24 * 60 * 60 * 1000).toISOString();
      const scanned = Number(opened.database.prepare('SELECT COUNT(*) AS count FROM task_execution_records').get().count);
      const rows = opened.database.prepare(`WITH ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY task_id, owner, kind, outcome
            ORDER BY sealed_at DESC, record_id
          ) AS outcome_rank,
          ROW_NUMBER() OVER (
            PARTITION BY task_id, owner, kind, lifecycle_status
            ORDER BY cleaned_at DESC, record_id
          ) AS tombstone_rank
        FROM task_execution_records
      ), eligible AS (
        SELECT *, CASE lifecycle_status
          WHEN 'cleanup_pending' THEN 'cleanup'
          WHEN 'retained' THEN 'cleanup'
          ELSE 'purge'
        END AS gc_action,
        CASE lifecycle_status
          WHEN 'cleanup_pending' THEN 0
          WHEN 'retained' THEN 1
          ELSE 2
        END AS gc_priority,
        CASE lifecycle_status
          WHEN 'cleanup_pending' THEN cleanup_started_at
          WHEN 'retained' THEN retain_until
          ELSE cleaned_at
        END AS gc_order
        FROM ranked
        WHERE lifecycle_status = 'cleanup_pending'
          OR (lifecycle_status = 'retained' AND retain_until <= ? AND (
            (outcome = 'passed' AND outcome_rank > ?)
            OR (outcome IN ('failed', 'blocked', 'cancelled') AND resolution_status IN ('acknowledged', 'recovered'))
          ))
          OR (lifecycle_status = 'cleaned' AND cleaned_at <= ? AND tombstone_rank > ?)
      )
      SELECT *, COUNT(*) OVER () AS eligible_count
      FROM eligible
      ORDER BY gc_priority, gc_order, record_id
      LIMIT ?`).all(
        now,
        TASK_EXECUTION_RECORD_RETENTION.passedRecentCount,
        cutoff,
        TASK_EXECUTION_RECORD_RETENTION.tombstoneRecentCount,
        limit,
      );
      return {
        root: opened.root,
        scanned,
        eligible: rows.length ? Number(rows[0].eligible_count) : 0,
        candidates: rows.map((row) => ({
          action: row.gc_action,
          recentRank: row.lifecycle_status === 'cleaned' ? Number(row.tombstone_rank) : Number(row.outcome_rank),
          persisted: persisted(opened.root, rowToRecord(row)),
        })),
      };
    } catch (error) { throw asError(error, 'GC候选查询', { limit }); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function deleteTaskExecutionRecordTombstonePersistence(targetRoot, expectedValue) {
    const expected = normalizeTaskExecutionRecord(expectedValue);
    if (expected.lifecycleStatus !== 'cleaned') throw taskExecutionRecordError('task_execution_record_tombstone_required', '只有cleaned tombstone可以删除metadata。', 409, { recordId: expected.recordId });
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(targetRoot, { writable: true, writerRole: 'retained-task-state' });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const row = database.prepare(`${SELECT} WHERE record_id = ?`).get(expected.recordId);
      if (!row) {
        database.exec('COMMIT');
        return { root: opened.root, recordId: expected.recordId, deleted: false, status: 'absent' };
      }
      const current = rowToRecord(row);
      if (!same(current, expected)) throw taskExecutionRecordError('task_execution_record_conflict', 'Task Execution Record current已变化，请刷新后重试。', 409, { recordId: expected.recordId, lifecycleStatus: current.lifecycleStatus, updatedAt: current.timestamps.updatedAt });
      const result = database.prepare('DELETE FROM task_execution_records WHERE record_id = ?').run(expected.recordId);
      database.exec('COMMIT');
      return { root: opened.root, recordId: expected.recordId, deleted: result.changes === 1, status: result.changes === 1 ? 'deleted' : 'absent' };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, 'tombstone删除', { recordId: expected.recordId, rollback: { status: 'restored' } });
    } finally { try { opened?.database?.close(); } catch {} }
  }

  Object.assign(runtime, {
    readTaskExecutionRecordPersistence,
    listTaskExecutionRecordPersistence,
    openTaskExecutionRecordPersistence,
    replaceTaskExecutionRecordPersistence,
    taskExecutionRecordRecentRank,
    listTaskExecutionRecordGcCandidates,
    deleteTaskExecutionRecordTombstonePersistence,
  });
  return runtime;
}
