import crypto from 'node:crypto';
import fs from 'node:fs';

const RUN_LOCATOR = 'workspace-sqlite:task-finish-run';
const COMPLETION_LOCATOR = 'workspace-sqlite:task-finish-completion';
const LEASE_LOCATOR = 'workspace-sqlite:task-finish-target-lease';
const CURRENT_SCHEMA = 'buildr.task-finish-current/v1';
const PHASE_IDS = Object.freeze(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
const PHASE_STATUSES = new Set(['pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable']);
const RUN_STATUSES = new Set(['active', 'blocked', 'failed', 'complete', 'cleanup_pending']);
const CURRENT_COLUMNS = Object.freeze([
  'task_id', 'run_id', 'schema_version', 'status', 'identity_digest', 'current_phase',
  'handoff_identity', 'candidate_identity', 'candidate_generation', 'content_target_identity',
  'target_branch', 'target_remote', 'carrier_identity',
  'association_handoff_identity', 'association_candidate_identity', 'association_candidate_generation',
  'planning_gate_target_identity', 'completion_gate_target_identity', 'verification_gate_target_identity',
  'primary_failure_phase', 'primary_failure_operation', 'primary_failure_class', 'primary_failure_code',
  'primary_failure_status', 'primary_failure_exit_code', 'primary_failure_diagnostic_digest',
  'resume_phase', 'resume_token', 'cleanup_status',
  'lease_target_identity', 'lease_token', 'lease_expires_at',
  'phases_json', 'payload_json', 'created_at', 'updated_at', 'completed_at',
]);

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function error(code, message, status = 409, details = undefined, nextAction = undefined) {
  const failure = new Error(message);
  Object.assign(failure, { code, status, details, nextAction, taskFinishBusiness: true });
  return failure;
}

function timestamp(value = Date.now()) { return new Date(value).toISOString(); }
function runLocator(runId) { return `${RUN_LOCATOR}/${runId}`; }
function completionLocator(taskId) { return `${COMPLETION_LOCATOR}/${taskId}`; }
function leaseLocator(targetIdentity) { return `${LEASE_LOCATOR}/${targetIdentity}`; }

function assertPhases(phases) {
  if (!Array.isArray(phases) || phases.length !== PHASE_IDS.length) throw error('task_finish_run_phase_model_invalid', 'Task Finish run 必须包含五个 phase。');
  phases.forEach((phase, index) => {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase) || phase.id !== PHASE_IDS[index]) throw error('task_finish_run_phase_model_invalid', `Task Finish phase 顺序不合法：${phase?.id || '<missing>'}。`);
    if (!PHASE_STATUSES.has(phase.status)) throw error('task_finish_run_phase_status_invalid', `Task Finish phase status 不支持：${phase.status || '<missing>'}。`);
    if (!Number.isInteger(phase.attempts) || phase.attempts < 0) throw error('task_finish_run_phase_attempts_invalid', `Task Finish phase attempts 不合法：${phase.id}。`);
  });
  return clone(phases);
}

function assertRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw error('task_finish_run_invalid', 'Task Finish current run 必须是对象。');
  if (run.schemaVersion !== 'buildr.task-finish-run/v2') throw error('task_finish_run_schema_invalid', `Task Finish run schema 不支持：${run.schemaVersion || '<missing>'}。`);
  if (typeof run.runId !== 'string' || !run.runId) throw error('task_finish_run_identity_invalid', 'Task Finish run 缺少 runId。');
  if (typeof run.identity?.task !== 'string' || !run.identity.task) throw error('task_finish_run_identity_invalid', 'Task Finish run 缺少 Task identity。');
  if (!RUN_STATUSES.has(run.status)) throw error('task_finish_run_status_invalid', `Task Finish run status 不支持：${run.status || '<missing>'}。`);
  const normalized = clone(run);
  normalized.phases = assertPhases(normalized.phases);
  return normalized;
}

function compactPhase(phase) {
  return {
    id: phase.id,
    status: phase.status,
    attempts: phase.attempts,
    startedAt: phase.startedAt,
    completedAt: phase.completedAt,
    durationMs: phase.durationMs,
    inputIdentity: phase.inputIdentity,
    outputIdentity: phase.outputIdentity,
    failure: clone(phase.failure),
  };
}

function compactResult(result) {
  return {
    ...clone(result),
    carrier: result?.carrier ? {
      identity: result.carrier.identity || null,
      kind: result.carrier.kind || null,
      head: result.carrier.head || null,
      tree: result.carrier.tree || null,
      expectedTargetRef: result.carrier.expectedTargetRef || null,
      targetRef: result.carrier.targetRef || null,
      changedPaths: Array.isArray(result.carrier.changedPaths) ? result.carrier.changedPaths.slice(0, 500) : [],
    } : null,
    phases: Array.isArray(result?.phases) ? result.phases.map(compactPhase) : [],
  };
}

function open(runtime, targetRoot, writable) {
  return runtime.openWorkspaceStructuredStore(targetRoot, {
    writable,
    allowPendingRead: !writable,
    writerRole: writable ? 'task-finish-retained' : null,
  });
}

function close(opened) { try { opened?.database?.close(); } catch {} }

function hasTable(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function readCurrentRow(database, { taskId = null, runId = null } = {}) {
  if (!hasTable(database, 'task_finish_current')) return null;
  if (taskId) return database.prepare('SELECT * FROM task_finish_current WHERE task_id = ?').get(taskId) || null;
  if (runId) return database.prepare('SELECT * FROM task_finish_current WHERE run_id = ?').get(runId) || null;
  throw error('task_finish_query_invalid', 'Task Finish current 查询必须提供 taskId 或 runId。', 400);
}

function currentPhase(run) {
  return run.resume?.phase
    || run.phases.find((phase) => ['running', 'blocked', 'failed'].includes(phase.status))?.id
    || run.phases.find((phase) => phase.status === 'pending')?.id
    || 'cleanup';
}

function gateTarget(gate) { return gate?.targetIdentity || null; }
function diagnosticDigest(failure) { return failure?.diagnostic?.digest || (typeof failure?.diagnostic === 'string' && failure.diagnostic.startsWith('sha256-') ? failure.diagnostic : null); }

function runDetail(run) {
  const detail = clone(run);
  delete detail.phases;
  return detail;
}

function completionDetail(completion) {
  const detail = clone(completion);
  if (detail?.result) delete detail.result.phases;
  return detail;
}

function associationValues(completion) {
  const association = completion?.association || null;
  return {
    association_handoff_identity: association?.handoffIdentity || null,
    association_candidate_identity: association?.candidateIdentity || null,
    association_candidate_generation: association?.candidateGeneration || null,
    planning_gate_target_identity: gateTarget(association?.gates?.planning),
    completion_gate_target_identity: gateTarget(association?.gates?.completion),
    verification_gate_target_identity: gateTarget(association?.gates?.verification),
  };
}

function currentRecord(run, { preparedCompletion = null, lease = null } = {}) {
  const normalized = assertRun(run);
  const failure = normalized.primaryFailure || null;
  return {
    task_id: normalized.identity.task,
    run_id: normalized.runId,
    schema_version: CURRENT_SCHEMA,
    status: normalized.status,
    identity_digest: normalized.identityDigest || digest(normalized.identity),
    current_phase: currentPhase(normalized),
    handoff_identity: normalized.identity.handoffIdentity,
    candidate_identity: normalized.identity.candidateIdentity,
    candidate_generation: normalized.identity.candidateGeneration,
    content_target_identity: normalized.identity.contentTargetIdentity,
    target_branch: normalized.identity.targetBranch,
    target_remote: normalized.identity.remote || null,
    carrier_identity: normalized.deliveryCarrier?.identity || preparedCompletion?.carrierIdentity || null,
    ...associationValues(preparedCompletion),
    primary_failure_phase: failure?.phase || null,
    primary_failure_operation: failure?.operation || failure?.check || null,
    primary_failure_class: failure?.failureClass || null,
    primary_failure_code: failure?.code || null,
    primary_failure_status: failure?.status || null,
    primary_failure_exit_code: Number.isInteger(failure?.exitCode) ? failure.exitCode : null,
    primary_failure_diagnostic_digest: diagnosticDigest(failure),
    resume_phase: normalized.resume?.phase || null,
    resume_token: normalized.resume?.token || null,
    cleanup_status: preparedCompletion?.cleanup?.status || normalized.completion?.cleanup?.status || null,
    lease_target_identity: lease?.targetIdentity || null,
    lease_token: lease?.token || null,
    lease_expires_at: lease?.expiresAt || null,
    phases_json: JSON.stringify(normalized.phases),
    payload_json: JSON.stringify({ kind: 'run', run: runDetail(normalized), preparedCompletion: clone(preparedCompletion) }),
    created_at: normalized.createdAt || normalized.updatedAt || timestamp(),
    updated_at: normalized.updatedAt || timestamp(),
    completed_at: normalized.completedAt || null,
  };
}

function terminalRecord(run, result, completion) {
  const normalized = assertRun(run);
  const storedResult = compactResult(result);
  const fullCompletion = {
    ...(clone(completion) || {}),
    task: normalized.identity.task,
    runId: normalized.runId,
    handoffIdentity: completion?.handoffIdentity || normalized.identity.handoffIdentity,
    candidateIdentity: completion?.candidateIdentity || normalized.identity.candidateIdentity,
    candidateGeneration: completion?.candidateGeneration || normalized.identity.candidateGeneration,
    contentTargetIdentity: completion?.contentTargetIdentity || normalized.identity.contentTargetIdentity,
    targetBranch: completion?.targetBranch || normalized.identity.targetBranch,
    carrierIdentity: completion?.carrierIdentity || normalized.deliveryCarrier?.identity || storedResult.carrier?.identity || null,
    status: 'complete',
    result: storedResult,
    completedAt: result?.completedAt || timestamp(),
  };
  const phases = assertPhases(storedResult.phases);
  return {
    record: {
      task_id: normalized.identity.task,
      run_id: normalized.runId,
      schema_version: CURRENT_SCHEMA,
      status: 'complete',
      identity_digest: normalized.identityDigest || digest(normalized.identity),
      current_phase: 'cleanup',
      handoff_identity: normalized.identity.handoffIdentity,
      candidate_identity: normalized.identity.candidateIdentity,
      candidate_generation: normalized.identity.candidateGeneration,
      content_target_identity: normalized.identity.contentTargetIdentity,
      target_branch: normalized.identity.targetBranch,
      target_remote: normalized.identity.remote || null,
      carrier_identity: normalized.deliveryCarrier?.identity || fullCompletion.carrierIdentity || null,
      ...associationValues(fullCompletion),
      primary_failure_phase: null,
      primary_failure_operation: null,
      primary_failure_class: null,
      primary_failure_code: null,
      primary_failure_status: null,
      primary_failure_exit_code: null,
      primary_failure_diagnostic_digest: null,
      resume_phase: null,
      resume_token: null,
      cleanup_status: fullCompletion.cleanup?.status || normalized.completion?.cleanup?.status || null,
      lease_target_identity: null,
      lease_token: null,
      lease_expires_at: null,
      phases_json: JSON.stringify(phases),
      payload_json: JSON.stringify({ kind: 'terminal', identityDigest: normalized.identityDigest || digest(normalized.identity), completion: completionDetail(fullCompletion) }),
      created_at: normalized.createdAt || fullCompletion.completedAt,
      updated_at: timestamp(),
      completed_at: fullCompletion.completedAt,
    },
    completion: fullCompletion,
  };
}

function writeCurrentRow(database, record) {
  const updates = CURRENT_COLUMNS.filter((column) => column !== 'task_id').map((column) => `${column} = excluded.${column}`).join(', ');
  database.prepare(`INSERT INTO task_finish_current(${CURRENT_COLUMNS.join(', ')}) VALUES (${CURRENT_COLUMNS.map(() => '?').join(', ')}) ON CONFLICT(task_id) DO UPDATE SET ${updates}`)
    .run(...CURRENT_COLUMNS.map((column) => record[column] ?? null));
  return readCurrentRow(database, { taskId: record.task_id });
}

function decodeRow(row) {
  if (!row) return null;
  if (row.schema_version !== CURRENT_SCHEMA) throw error('task_finish_current_schema_invalid', `Task Finish current schema 不支持：${row.schema_version || '<missing>'}。`);
  const phases = assertPhases(JSON.parse(row.phases_json));
  const payload = JSON.parse(row.payload_json);
  if (payload.kind === 'run') {
    const run = assertRun({ ...payload.run, phases });
    if (run.identity.task !== row.task_id || run.runId !== row.run_id || run.status !== row.status || currentPhase(run) !== row.current_phase) throw error('task_finish_current_payload_mismatch', 'Task Finish current普通列与run payload不一致。', 500, { taskId: row.task_id, runId: row.run_id });
    assertQueryFields(row, currentRecord(run, { preparedCompletion: payload.preparedCompletion || null, lease: leaseFromRow(row) }));
    return { kind: 'run', run, preparedCompletion: payload.preparedCompletion || null, phases };
  }
  if (payload.kind === 'terminal') {
    const completion = clone(payload.completion);
    completion.result = { ...(completion.result || {}), phases };
    if (row.status !== 'complete' || completion.task !== row.task_id || completion.runId !== row.run_id || completion.status !== 'complete') throw error('task_finish_terminal_payload_mismatch', 'Task Finish terminal普通列与payload不一致。', 500, { taskId: row.task_id, runId: row.run_id });
    const expected = terminalQueryFields(completion);
    expected.identity_digest = payload.identityDigest || expected.identity_digest || row.identity_digest;
    assertQueryFields(row, expected);
    return { kind: 'terminal', completion, phases };
  }
  throw error('task_finish_current_payload_invalid', `Task Finish current payload kind不支持：${payload.kind || '<missing>'}。`, 500);
}

function leaseFromRow(row) {
  return row?.lease_target_identity ? { targetIdentity: row.lease_target_identity, token: row.lease_token, expiresAt: row.lease_expires_at } : null;
}

const QUERY_FIELDS = Object.freeze([
  'identity_digest', 'status', 'current_phase',
  'handoff_identity', 'candidate_identity', 'candidate_generation', 'content_target_identity',
  'target_branch', 'target_remote', 'carrier_identity',
  'association_handoff_identity', 'association_candidate_identity', 'association_candidate_generation',
  'planning_gate_target_identity', 'completion_gate_target_identity', 'verification_gate_target_identity',
  'primary_failure_phase', 'primary_failure_operation', 'primary_failure_class', 'primary_failure_code',
  'primary_failure_status', 'primary_failure_exit_code', 'primary_failure_diagnostic_digest',
  'resume_phase', 'resume_token', 'cleanup_status',
]);

function assertQueryFields(row, expected) {
  const mismatches = QUERY_FIELDS.filter((field) => (row[field] ?? null) !== (expected[field] ?? null));
  if (mismatches.length) throw error('task_finish_current_query_fields_mismatch', `Task Finish current普通列与payload不一致：${mismatches.join(', ')}。`, 500, { taskId: row.task_id, runId: row.run_id, mismatches });
}

function terminalQueryFields(completion) {
  const result = completion.result || {};
  return {
    identity_digest: result.identity ? digest(result.identity) : null,
    status: 'complete',
    current_phase: 'cleanup',
    handoff_identity: completion.handoffIdentity,
    candidate_identity: completion.candidateIdentity,
    candidate_generation: completion.candidateGeneration,
    content_target_identity: completion.contentTargetIdentity,
    target_branch: completion.targetBranch,
    target_remote: result.identity?.remote || null,
    carrier_identity: completion.carrierIdentity || result.carrier?.identity || null,
    ...associationValues(completion),
    primary_failure_phase: null,
    primary_failure_operation: null,
    primary_failure_class: null,
    primary_failure_code: null,
    primary_failure_status: null,
    primary_failure_exit_code: null,
    primary_failure_diagnostic_digest: null,
    resume_phase: null,
    resume_token: null,
    cleanup_status: completion.cleanup?.status || result.completion?.cleanup?.status || null,
  };
}

export function registerTaskFinishRepository(runtime) {
  function taskFinishRunPath(targetRoot, runId) {
    runtime.assertCanonicalTaskWorkspace(targetRoot);
    return runLocator(runId);
  }

  function taskFinishCompletionPath(targetRoot, taskId) {
    runtime.assertCanonicalTaskWorkspace(targetRoot);
    return completionLocator(taskId);
  }

  function readTaskFinishRunPersistence(targetRoot, { taskId = null, runId = null } = {}, { optional = true } = {}) {
    let opened;
    try {
      opened = open(runtime, targetRoot, false);
      const row = opened.present ? readCurrentRow(opened.database, { taskId, runId }) : null;
      const decoded = row ? decodeRow(row) : null;
      if (!decoded || decoded.kind !== 'run') {
        if (optional) return null;
        throw error('task_finish_run_not_found', `Task Finish current run 不存在：${taskId || runId}。`, 404, { taskId, runId });
      }
      const serialized = JSON.stringify(decoded.run);
      return { root: opened.root, file: runLocator(row.run_id), content: serialized, runDigest: digest(serialized), run: decoded.run };
    } catch (cause) {
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_run_read_failed', `Task Finish current run 读取失败：${cause.message}`, 500, { taskId, runId });
    } finally { close(opened); }
  }

  function writeTaskFinishRunPersistence(targetRoot, run) {
    const normalized = assertRun(run);
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const existing = readCurrentRow(database, { taskId: normalized.identity.task });
      if (existing && existing.run_id !== normalized.runId) throw error('task_finish_current_conflict', `Task 已有另一个 current Finish run：${existing.run_id}。`, 409, { taskId: normalized.identity.task, currentRunId: existing.run_id, requestedRunId: normalized.runId });
      const decoded = existing ? decodeRow(existing) : null;
      if (decoded?.kind === 'terminal') throw error('task_finish_current_terminal_conflict', `Task 已有terminal Finish state：${existing.run_id}。`, 409, { taskId: normalized.identity.task, runId: existing.run_id });
      const row = writeCurrentRow(database, currentRecord(normalized, { preparedCompletion: decoded?.preparedCompletion || null, lease: leaseFromRow(existing) }));
      const written = decodeRow(row);
      database.exec('COMMIT');
      const serialized = JSON.stringify(written.run);
      return { root: opened.root, file: runLocator(row.run_id), content: serialized, runDigest: digest(serialized), run: written.run, created: !existing };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_run_write_failed', `Task Finish current run 写入失败：${cause.message}`, 500, { taskId: normalized.identity.task });
    } finally { close(opened); }
  }

  function discardFailedTaskFinishRunPersistence(targetRoot, { taskId, runId }) {
    if (!taskId || !runId) throw error('task_finish_run_identity_invalid', 'discard failed Finish run requires taskId and runId.');
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = readCurrentRow(database, { taskId });
      if (!current) { database.exec('COMMIT'); return { discarded: false, taskId, runId }; }
      if (current.run_id !== runId) throw error('task_finish_current_conflict', `Task 当前 Finish run 不是待替换 run：${current.run_id}。`, 409, { taskId, currentRunId: current.run_id, requestedRunId: runId });
      if (current.status !== 'failed' || decodeRow(current).kind !== 'run') throw error('task_finish_run_not_replaceable', `只有failed current run可以被新的Development handoff替换：${current.status}。`, 409, { taskId, runId, status: current.status });
      database.prepare('DELETE FROM task_finish_current WHERE task_id = ? AND run_id = ?').run(taskId, runId);
      database.exec('COMMIT');
      return { discarded: true, taskId, runId };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_run_discard_failed', `failed Task Finish run 清理失败：${cause.message}`, 500, { taskId, runId });
    } finally { close(opened); }
  }

  function readTaskFinishCompletionPersistence(targetRoot, { taskId = null, runId = null } = {}, { optional = true } = {}) {
    let opened;
    try {
      opened = open(runtime, targetRoot, false);
      const row = opened.present ? readCurrentRow(opened.database, { taskId, runId }) : null;
      const decoded = row ? decodeRow(row) : null;
      const completion = decoded?.kind === 'terminal' ? decoded.completion : decoded?.preparedCompletion || null;
      if (!completion) {
        if (optional) return null;
        throw error('task_finish_completion_not_found', `Task Finish completion 不存在：${taskId || runId}。`, 404, { taskId, runId });
      }
      const serialized = JSON.stringify(completion);
      return { root: opened.root, file: completionLocator(row.task_id), content: serialized, resultDigest: digest(serialized), completion, status: decoded.kind === 'terminal' ? 'complete' : 'cleanup_pending', runId: row.run_id };
    } catch (cause) {
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_completion_read_failed', `Task Finish completion 读取失败：${cause.message}`, 500, { taskId, runId });
    } finally { close(opened); }
  }

  function writeTaskFinishCompletionPersistence(targetRoot, { taskId, runId, result, status = 'complete' }) {
    if (!taskId || !runId) throw error('task_finish_completion_identity_invalid', 'Task Finish completion requires taskId and runId.', 400);
    if (!['complete', 'cleanup_pending'].includes(status)) throw error('task_finish_completion_status_invalid', `Task Finish completion status 不支持：${status}。`, 400);
    const completion = clone(result);
    if (completion?.task !== taskId || completion?.runId !== runId) throw error('task_finish_completion_identity_invalid', 'Task Finish completion identity与current run不一致。', 409, { taskId, runId });
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = readCurrentRow(database, { taskId });
      const decoded = current ? decodeRow(current) : null;
      if (!current || decoded?.kind !== 'run' || current.run_id !== runId) throw error('task_finish_current_conflict', 'Task Finish prepared completion缺少matching current run。', 409, { taskId, runId, currentRunId: current?.run_id || null });
      const row = writeCurrentRow(database, currentRecord(decoded.run, { preparedCompletion: completion, lease: leaseFromRow(current) }));
      const written = decodeRow(row).preparedCompletion;
      database.exec('COMMIT');
      const serialized = JSON.stringify(written);
      return { root: opened.root, file: completionLocator(taskId), content: serialized, resultDigest: digest(serialized), completion: written, status, runId };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_completion_write_failed', `Task Finish completion 写入失败：${cause.message}`, 500, { taskId, runId });
    } finally { close(opened); }
  }

  function finalizeTaskFinishPersistence(targetRoot, { run, result, completion = null }) {
    const normalized = assertRun(run);
    const terminal = terminalRecord(normalized, result, completion);
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = readCurrentRow(database, { taskId: normalized.identity.task });
      if (current && current.run_id !== normalized.runId) throw error('task_finish_current_conflict', 'Task Finish terminal state与current run不一致。', 409, { taskId: normalized.identity.task, runId: normalized.runId, currentRunId: current.run_id });
      const row = writeCurrentRow(database, terminal.record);
      const written = decodeRow(row);
      database.exec('COMMIT');
      const serialized = JSON.stringify(written.completion);
      return { root: opened.root, file: completionLocator(normalized.identity.task), content: serialized, resultDigest: digest(serialized), completion: written.completion, status: 'complete', runId: normalized.runId };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_finalize_failed', `Task Finish terminal persistence finalize 失败：${cause.message}`, 500, { taskId: normalized.identity.task, runId: normalized.runId });
    } finally { close(opened); }
  }

  function acquireTaskFinishTargetLease(targetRoot, { run, targetIdentity, clock = Date.now }) {
    const normalized = assertRun(run);
    if (!targetIdentity || typeof targetIdentity !== 'string') throw error('task_finish_target_identity_invalid', 'Task Finish target lease requires target identity.', 400);
    const currentTime = clock();
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const owner = database.prepare('SELECT * FROM task_finish_current WHERE lease_target_identity = ?').get(targetIdentity) || null;
      const requested = readCurrentRow(database, { taskId: normalized.identity.task });
      if (!requested || requested.run_id !== normalized.runId || decodeRow(requested).kind !== 'run') throw error('task_finish_current_conflict', 'Target lease requires matching current Finish run。', 409, { taskId: normalized.identity.task, runId: normalized.runId });
      if (owner && owner.run_id !== normalized.runId) {
        const expired = Date.parse(owner.lease_expires_at) <= currentTime;
        if (!expired || owner.status !== 'failed') {
          database.exec('ROLLBACK');
          return { blocked: true, locator: leaseLocator(targetIdentity), existing: { taskId: owner.task_id, runId: owner.run_id, targetIdentity, expiresAt: owner.lease_expires_at, expired } };
        }
        database.prepare('UPDATE task_finish_current SET lease_target_identity = NULL, lease_token = NULL, lease_expires_at = NULL WHERE task_id = ? AND run_id = ? AND lease_token = ?').run(owner.task_id, owner.run_id, owner.lease_token);
      }
      const token = requested.lease_target_identity === targetIdentity && requested.lease_token ? requested.lease_token : crypto.randomUUID();
      const expiresAt = timestamp(currentTime + 60_000);
      const changed = database.prepare('UPDATE task_finish_current SET lease_target_identity = ?, lease_token = ?, lease_expires_at = ?, updated_at = ? WHERE task_id = ? AND run_id = ?').run(targetIdentity, token, expiresAt, timestamp(currentTime), normalized.identity.task, normalized.runId);
      if (changed.changes !== 1) throw error('task_finish_target_lease_failed', 'Task Finish target lease owner更新失败。', 409, { taskId: normalized.identity.task, runId: normalized.runId });
      database.exec('COMMIT');
      return { storage: 'sqlite', locator: leaseLocator(targetIdentity), token, value: { schemaVersion: 'buildr.task-finish-target-lease/v1', targetIdentity, runId: normalized.runId, task: normalized.identity.task, targetBranch: normalized.identity.targetBranch, token, expiresAt } };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_target_lease_failed', `Task Finish target lease 操作失败：${cause.message}`, 500, { targetIdentity, runId: normalized.runId });
    } finally { close(opened); }
  }

  function releaseTaskFinishTargetLease(targetRoot, lease) {
    if (!lease?.token || !lease?.value?.targetIdentity) return { released: false };
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const changed = database.prepare('UPDATE task_finish_current SET lease_target_identity = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ? WHERE lease_target_identity = ? AND lease_token = ?').run(timestamp(), lease.value.targetIdentity, lease.token);
      database.exec('COMMIT');
      return { released: changed.changes === 1 };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_target_lease_release_failed', `Task Finish target lease release 失败：${cause.message}`, 500, { targetIdentity: lease.value.targetIdentity });
    } finally { close(opened); }
  }

  function readTaskFinishResultsPersistence(targetRoot, taskId) {
    const completion = readTaskFinishCompletionPersistence(targetRoot, { taskId }, { optional: true });
    if (!completion || completion.status !== 'complete') return { taskId, results: [], diagnostics: [] };
    return { taskId, results: completion.completion?.result ? [{ result: completion.completion.result, completion: completion.completion }] : [], diagnostics: [] };
  }

  function inspectTaskFinishPersistence(targetRoot) {
    let opened;
    if (!fs.existsSync(runtime.workspaceStructuredStorePath(targetRoot))) return { status: 'uninitialized', current: [], leases: [] };
    try {
      opened = open(runtime, targetRoot, false);
      if (!hasTable(opened.database, 'task_finish_current')) return { status: 'migration-required', current: [], leases: [] };
      const rows = opened.database.prepare('SELECT task_id AS taskId, run_id AS runId, status, current_phase AS currentPhase, updated_at AS updatedAt, completed_at AS completedAt, lease_target_identity AS leaseTargetIdentity, lease_token AS leaseToken, lease_expires_at AS leaseExpiresAt FROM task_finish_current ORDER BY updated_at DESC').all();
      const nowValue = Date.now();
      const leases = rows.filter((item) => item.leaseTargetIdentity).map((item) => ({ taskId: item.taskId, runId: item.runId, targetIdentity: item.leaseTargetIdentity, expiresAt: item.leaseExpiresAt, expired: Date.parse(item.leaseExpiresAt) <= nowValue }));
      return { status: leases.some((item) => item.expired) ? 'attention' : 'healthy', current: rows.map(({ leaseToken: _leaseToken, ...item }) => item), leases };
    } finally { close(opened); }
  }

  Object.assign(runtime, {
    taskFinishRunPath,
    taskFinishCompletionPath,
    readTaskFinishRunPersistence,
    writeTaskFinishRunPersistence,
    discardFailedTaskFinishRunPersistence,
    readTaskFinishCompletionPersistence,
    writeTaskFinishCompletionPersistence,
    finalizeTaskFinishPersistence,
    acquireTaskFinishTargetLease,
    releaseTaskFinishTargetLease,
    readTaskFinishResultsPersistence,
    inspectTaskFinishPersistence,
  });
  return runtime;
}
