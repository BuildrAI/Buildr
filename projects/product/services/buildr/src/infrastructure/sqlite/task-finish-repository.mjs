import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RUN_LOCATOR = 'workspace-sqlite:task-finish-run';
const COMPLETION_LOCATOR = 'workspace-sqlite:task-finish-completion';
const LEASE_LOCATOR = 'workspace-sqlite:task-finish-target-lease';

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

function assertRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw error('task_finish_run_invalid', 'Task Finish current run 必须是对象。');
  if (run.schemaVersion !== 'buildr.task-finish-run/v2') throw error('task_finish_run_schema_invalid', `Task Finish run schema 不支持：${run.schemaVersion || '<missing>'}。`);
  if (typeof run.runId !== 'string' || !run.runId) throw error('task_finish_run_identity_invalid', 'Task Finish run 缺少 runId。');
  if (typeof run.identity?.task !== 'string' || !run.identity.task) throw error('task_finish_run_identity_invalid', 'Task Finish run 缺少 Task identity。');
  if (!['active', 'blocked', 'failed', 'complete', 'cleanup_pending'].includes(run.status)) throw error('task_finish_run_status_invalid', `Task Finish run status 不支持：${run.status || '<missing>'}。`);
  if (!Array.isArray(run.phases) || run.phases.length !== 5) throw error('task_finish_run_phase_model_invalid', 'Task Finish run 必须包含五个 phase。');
  return clone(run);
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

function legacyRoot(targetRoot) { return path.join(path.resolve(targetRoot), '.buildr', 'task-finish'); }

function safeLegacyDirectory(root, name) {
  const directory = path.join(root, name);
  if (!fs.existsSync(directory)) return { directory, files: [], diagnostics: [] };
  const diagnostics = [];
  let stat;
  try { stat = fs.lstatSync(directory); } catch (cause) { return { directory, files: [], diagnostics: [{ code: 'legacy_stat_failed', path: directory, message: cause.message }] }; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return { directory, files: [], diagnostics: [{ code: 'legacy_path_unsafe', path: directory, message: 'legacy Finish directory must be a real directory.' }] };
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    let child;
    try { child = fs.lstatSync(file); } catch (cause) { diagnostics.push({ code: 'legacy_stat_failed', path: file, message: cause.message }); continue; }
    if (child.isSymbolicLink() || !child.isFile() || !entry.name.endsWith('.json')) {
      diagnostics.push({ code: 'legacy_path_unsafe', path: file, message: 'legacy Finish residue is not a regular JSON file.' });
      continue;
    }
    files.push(file);
  }
  return { directory, files, diagnostics };
}

function legacyObservation(targetRoot) {
  const root = legacyRoot(targetRoot);
  const runs = safeLegacyDirectory(root, 'runs');
  const completed = safeLegacyDirectory(root, 'completed');
  const files = [...runs.files, ...completed.files];
  return { root, runs, completed, files, diagnostics: [...runs.diagnostics, ...completed.diagnostics], present: files.length > 0 || fs.existsSync(root) };
}

function legacyResult(run, completion) {
  if (completion.result && typeof completion.result === 'object') return compactResult(completion.result);
  return compactResult({
    schemaVersion: 'buildr.task-finish-result/v2',
    runId: run.runId,
    status: 'complete',
    identity: run.identity,
    handoff: { identity: completion.handoffIdentity },
    candidate: { identity: completion.candidateIdentity, generation: completion.candidateGeneration, contentTargetIdentity: completion.contentTargetIdentity },
    carrier: run.deliveryCarrier,
    phases: run.phases,
    primaryFailure: null,
    resume: null,
    nextWorkflow: null,
    nextAction: null,
    equivalence: run.equivalence,
    delivery: run.delivery,
    completion,
    metrics: { canonicalCliInvocations: run.invocations || 0, agentProviderCompletions: 0, manualRecoveryManifests: 0, formalVerificationExecutions: 0, productCommandObservations: 0, productExecutionMs: 0, wallClockMs: 0, coverage: 'product-complete' },
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: completion.completedAt,
  });
}

function validateLegacyPair(run, completion, runFile, completionFile) {
  if (run?.schemaVersion !== 'buildr.task-finish-run/v2' || run?.status !== 'complete' || run?.completion?.status !== 'complete') throw error('legacy_cutover_not_terminal', 'legacy Finish run 不是可复核的 complete 终态。', 409, { runFile, completionFile });
  if (completion?.schemaVersion !== 'buildr.task-finish-completion/v1' || completion?.status !== 'complete') throw error('legacy_cutover_not_terminal', 'legacy Finish completion 不是可复核的 complete 终态。', 409, { runFile, completionFile });
  if (completion.runId !== run.runId || completion.task !== run.identity?.task) throw error('legacy_cutover_identity_conflict', 'legacy Finish run 与 completion identity 不匹配。', 409, { runFile, completionFile });
  for (const [left, right, label] of [[run.identity.handoffIdentity, completion.handoffIdentity, 'handoff'], [run.identity.candidateIdentity, completion.candidateIdentity, 'candidate'], [run.identity.candidateGeneration, completion.candidateGeneration, 'candidate generation'], [run.identity.contentTargetIdentity, completion.contentTargetIdentity, 'content target'], [run.deliveryCarrier?.identity, completion.carrierIdentity, 'carrier']]) if (left !== right) throw error('legacy_cutover_identity_conflict', `legacy Finish ${label} identity 不匹配。`, 409, { runFile, completionFile, label });
  if (typeof completion.completedAt !== 'string' || Number.isNaN(Date.parse(completion.completedAt))) throw error('legacy_cutover_completion_invalid', 'legacy Finish completion completedAt 无效。', 409, { runFile, completionFile });
}

function readRunRow(database, { taskId = null, runId = null } = {}) {
  if (!hasTable(database, 'task_finish_runs')) return null;
  if (taskId) return database.prepare('SELECT task_id AS taskId, run_id AS runId, run_json AS runJson FROM task_finish_runs WHERE task_id = ?').get(taskId) || null;
  if (runId) return database.prepare('SELECT task_id AS taskId, run_id AS runId, run_json AS runJson FROM task_finish_runs WHERE run_id = ?').get(runId) || null;
  throw error('task_finish_query_invalid', 'Task Finish current run 查询必须提供 taskId 或 runId。', 400);
}

function readCompletionRow(database, { taskId = null, runId = null } = {}) {
  if (!hasTable(database, 'task_finish_completions')) return null;
  if (taskId) return database.prepare('SELECT task_id AS taskId, run_id AS runId, status, result_json AS resultJson, completed_at AS completedAt, updated_at AS updatedAt FROM task_finish_completions WHERE task_id = ?').get(taskId) || null;
  if (runId) return database.prepare('SELECT task_id AS taskId, run_id AS runId, status, result_json AS resultJson, completed_at AS completedAt, updated_at AS updatedAt FROM task_finish_completions WHERE run_id = ?').get(runId) || null;
  throw error('task_finish_query_invalid', 'Task Finish completion 查询必须提供 taskId 或 runId。', 400);
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
      if (!opened.present) {
        if (optional) return null;
        throw error('task_finish_run_not_found', `Task Finish current run 不存在：${taskId || runId}。`, 404, { taskId, runId });
      }
      const row = readRunRow(opened.database, { taskId, runId });
      if (!row) {
        if (optional) return null;
        throw error('task_finish_run_not_found', `Task Finish current run 不存在：${taskId || runId}。`, 404, { taskId, runId });
      }
      const run = assertRun(JSON.parse(row.runJson));
      return { root: opened.root, file: runLocator(row.runId), content: row.runJson, runDigest: digest(row.runJson), run };
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
      const serialized = JSON.stringify(normalized);
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT run_id AS runId FROM task_finish_runs WHERE task_id = ?').get(normalized.identity.task);
      if (current && current.runId !== normalized.runId) throw error('task_finish_current_conflict', `Task 已有另一个 current Finish run：${current.runId}。`, 409, { taskId: normalized.identity.task, currentRunId: current.runId, requestedRunId: normalized.runId });
      database.prepare(`INSERT INTO task_finish_runs(task_id, run_id, status, identity_digest, run_json, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET run_id = excluded.run_id, status = excluded.status, identity_digest = excluded.identity_digest, run_json = excluded.run_json, updated_at = excluded.updated_at, completed_at = excluded.completed_at`)
        .run(normalized.identity.task, normalized.runId, normalized.status, normalized.identityDigest || digest(normalized.identity), serialized, normalized.updatedAt || timestamp(), normalized.completedAt || null);
      const row = database.prepare('SELECT run_id AS runId, run_json AS runJson FROM task_finish_runs WHERE task_id = ?').get(normalized.identity.task);
      const written = assertRun(JSON.parse(row.runJson));
      database.exec('COMMIT');
      return { root: opened.root, file: runLocator(row.runId), content: row.runJson, runDigest: digest(row.runJson), run: written, created: !current };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_run_write_failed', `Task Finish current run 写入失败：${cause.message}`, 500, { taskId: normalized.identity.task });
    } finally { close(opened); }
  }

  function discardFailedTaskFinishRunPersistence(targetRoot, { taskId, runId }) {
    if (typeof taskId !== 'string' || !taskId || typeof runId !== 'string' || !runId) throw error('task_finish_run_identity_invalid', 'discard failed Finish run requires taskId and runId.');
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT run_id AS runId, status FROM task_finish_runs WHERE task_id = ?').get(taskId);
      if (!current) {
        database.exec('COMMIT');
        return { discarded: false, taskId, runId };
      }
      if (current.runId !== runId) throw error('task_finish_current_conflict', `Task 当前 Finish run 不是待替换 run：${current.runId}。`, 409, { taskId, currentRunId: current.runId, requestedRunId: runId });
      if (current.status !== 'failed') throw error('task_finish_run_not_replaceable', `只有 failed Finish run 可以被新的 Development handoff 替换：${current.status}。`, 409, { taskId, runId, status: current.status });
      database.prepare('DELETE FROM task_finish_runs WHERE task_id = ? AND run_id = ?').run(taskId, runId);
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
      if (!opened.present) {
        if (optional) return null;
        throw error('task_finish_completion_not_found', `Task Finish terminal completion 不存在：${taskId || runId}。`, 404, { taskId, runId });
      }
      const row = readCompletionRow(opened.database, { taskId, runId });
      if (!row) {
        if (optional) return null;
        throw error('task_finish_completion_not_found', `Task Finish terminal completion 不存在：${taskId || runId}。`, 404, { taskId, runId });
      }
      const result = JSON.parse(row.resultJson);
      return { root: opened.root, file: completionLocator(row.taskId), content: row.resultJson, resultDigest: digest(row.resultJson), completion: result, status: row.status, runId: row.runId };
    } catch (cause) {
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_completion_read_failed', `Task Finish terminal completion 读取失败：${cause.message}`, 500, { taskId, runId });
    } finally { close(opened); }
  }

  function writeTaskFinishCompletionPersistence(targetRoot, { taskId, runId, result, status = 'complete' }) {
    if (typeof taskId !== 'string' || !taskId || typeof runId !== 'string' || !runId) throw error('task_finish_completion_identity_invalid', 'Task Finish completion requires taskId and runId.', 400);
    if (!['complete', 'cleanup_pending'].includes(status)) throw error('task_finish_completion_status_invalid', `Task Finish completion status 不支持：${status}。`, 400);
    const serialized = JSON.stringify(clone(result));
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      database.prepare(`INSERT INTO task_finish_completions(task_id, run_id, status, result_json, completed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET run_id = excluded.run_id, status = excluded.status, result_json = excluded.result_json, completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
        .run(taskId, runId, status, serialized, result?.completedAt || null, timestamp());
      const row = readCompletionRow(database, { taskId });
      database.exec('COMMIT');
      return { root: opened.root, file: completionLocator(taskId), content: row.resultJson, resultDigest: digest(row.resultJson), completion: JSON.parse(row.resultJson), status: row.status, runId: row.runId };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_completion_write_failed', `Task Finish terminal completion 写入失败：${cause.message}`, 500, { taskId, runId });
    } finally { close(opened); }
  }

  function finalizeTaskFinishPersistence(targetRoot, { run, result, completion = null }) {
    const normalized = assertRun(run);
    const storedResult = compactResult(result);
    const fullCompletion = { ...(clone(completion) || {}), task: normalized.identity.task, runId: normalized.runId, status: 'complete', result: storedResult, completedAt: result?.completedAt || timestamp() };
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      database.prepare(`INSERT INTO task_finish_completions(task_id, run_id, status, result_json, completed_at, updated_at)
        VALUES (?, ?, 'complete', ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET run_id = excluded.run_id, status = excluded.status, result_json = excluded.result_json, completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
        .run(normalized.identity.task, normalized.runId, JSON.stringify(fullCompletion), fullCompletion.completedAt, timestamp());
      database.prepare('DELETE FROM task_finish_target_leases WHERE run_id = ?').run(normalized.runId);
      database.prepare('DELETE FROM task_finish_transient_artifacts WHERE run_id = ?').run(normalized.runId);
      database.prepare('DELETE FROM task_finish_runs WHERE task_id = ? AND run_id = ?').run(normalized.identity.task, normalized.runId);
      const row = readCompletionRow(database, { taskId: normalized.identity.task });
      database.exec('COMMIT');
      return { root: opened.root, file: completionLocator(normalized.identity.task), content: row.resultJson, resultDigest: digest(row.resultJson), completion: JSON.parse(row.resultJson), status: row.status, runId: row.runId };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_finalize_failed', `Task Finish terminal persistence finalize 失败：${cause.message}`, 500, { taskId: normalized.identity.task, runId: normalized.runId });
    } finally { close(opened); }
  }

  function acquireTaskFinishTargetLease(targetRoot, { run, targetIdentity, clock = Date.now }) {
    if (!targetIdentity || typeof targetIdentity !== 'string') throw error('task_finish_target_identity_invalid', 'Task Finish target lease requires target identity.', 400);
    const currentTime = clock();
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const existing = database.prepare('SELECT target_identity AS targetIdentity, run_id AS runId, task_id AS taskId, token, acquired_at AS acquiredAt, expires_at AS expiresAt, heartbeat_at AS heartbeatAt FROM task_finish_target_leases WHERE target_identity = ?').get(targetIdentity);
      if (existing && Date.parse(existing.expiresAt) > currentTime && existing.runId !== run.runId) {
        database.exec('ROLLBACK');
        return { blocked: true, locator: leaseLocator(targetIdentity), existing };
      }
      const token = existing?.runId === run.runId ? existing.token : crypto.randomUUID();
      const acquiredAt = existing?.runId === run.runId ? existing.acquiredAt : timestamp(currentTime);
      const value = { schemaVersion: 'buildr.task-finish-target-lease/v1', targetIdentity, runId: run.runId, task: run.identity.task, targetBranch: run.identity.targetBranch, token, acquiredAt, expiresAt: timestamp(currentTime + 60_000), heartbeatAt: timestamp(currentTime) };
      database.prepare(`INSERT INTO task_finish_target_leases(target_identity, run_id, task_id, token, acquired_at, expires_at, heartbeat_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(target_identity) DO UPDATE SET run_id = excluded.run_id, task_id = excluded.task_id, token = excluded.token, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at, heartbeat_at = excluded.heartbeat_at`)
        .run(targetIdentity, run.runId, run.identity.task, token, value.acquiredAt, value.expiresAt, value.heartbeatAt);
      database.exec('COMMIT');
      return { storage: 'sqlite', locator: leaseLocator(targetIdentity), token, value };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_target_lease_failed', `Task Finish target lease 操作失败：${cause.message}`, 500, { targetIdentity, runId: run.runId });
    } finally { close(opened); }
  }

  function releaseTaskFinishTargetLease(targetRoot, lease) {
    if (!lease?.token || !lease?.value?.targetIdentity) return;
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      database.prepare('DELETE FROM task_finish_target_leases WHERE target_identity = ? AND token = ?').run(lease.value.targetIdentity, lease.token);
      database.exec('COMMIT');
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_target_lease_release_failed', `Task Finish target lease release 失败：${cause.message}`, 500, { targetIdentity: lease.value.targetIdentity });
    } finally { close(opened); }
  }

  function readTaskFinishResultsPersistence(targetRoot, taskId) {
    const completion = readTaskFinishCompletionPersistence(targetRoot, { taskId }, { optional: true });
    if (!completion) return { taskId, results: [], diagnostics: [] };
    return { taskId, results: completion.completion?.result ? [{ result: completion.completion.result, completion: completion.completion }] : [], diagnostics: [] };
  }

  function registerTaskFinishTransientArtifactPersistence(targetRoot, { runId, artifactId, kind, relativeLocator, sizeBytes = 0, sha256: checksum, retentionStatus = 'retained' }) {
    if (!runId || !artifactId || !kind || !relativeLocator || !checksum || !Number.isInteger(sizeBytes) || sizeBytes < 0) throw error('task_finish_artifact_invalid', 'Task Finish transient artifact metadata 不完整。', 400);
    const locator = String(relativeLocator);
    const target = path.resolve(path.resolve(targetRoot), locator);
    const allowedRoot = path.resolve(path.resolve(targetRoot), '.buildr', 'transient', 'task-finish', runId);
    if (path.isAbsolute(locator) || (target !== allowedRoot && !target.startsWith(`${allowedRoot}${path.sep}`))) throw error('task_finish_artifact_path_escape', 'Task Finish transient artifact locator 越界。', 409, { runId, relativeLocator });
    if (!['retained', 'cleanup_pending', 'cleaned'].includes(retentionStatus)) throw error('task_finish_artifact_status_invalid', `Task Finish transient artifact retention status 不支持：${retentionStatus}。`, 400);
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      database.prepare(`INSERT INTO task_finish_transient_artifacts(artifact_id, run_id, kind, relative_locator, size_bytes, sha256, retention_status, cleanup_code, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(artifact_id) DO UPDATE SET kind = excluded.kind, relative_locator = excluded.relative_locator, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, retention_status = excluded.retention_status, updated_at = excluded.updated_at`)
        .run(artifactId, runId, kind, locator, sizeBytes, checksum, retentionStatus, timestamp());
      const row = database.prepare('SELECT artifact_id AS artifactId, run_id AS runId, kind, relative_locator AS relativeLocator, size_bytes AS sizeBytes, sha256, retention_status AS retentionStatus, cleanup_code AS cleanupCode FROM task_finish_transient_artifacts WHERE artifact_id = ?').get(artifactId);
      database.exec('COMMIT');
      return row;
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_artifact_write_failed', `Task Finish transient artifact 登记失败：${cause.message}`, 500, { runId, artifactId });
    } finally { close(opened); }
  }

  function updateTaskFinishTransientArtifactPersistence(targetRoot, { artifactId, retentionStatus, cleanupCode = null }) {
    if (!artifactId || !['retained', 'cleanup_pending', 'cleaned'].includes(retentionStatus)) throw error('task_finish_artifact_status_invalid', 'Task Finish transient artifact 更新参数无效。', 400);
    let opened;
    try {
      opened = open(runtime, targetRoot, true);
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      database.prepare('UPDATE task_finish_transient_artifacts SET retention_status = ?, cleanup_code = ?, updated_at = ? WHERE artifact_id = ?').run(retentionStatus, cleanupCode, timestamp(), artifactId);
      const row = database.prepare('SELECT artifact_id AS artifactId, run_id AS runId, kind, relative_locator AS relativeLocator, size_bytes AS sizeBytes, sha256, retention_status AS retentionStatus, cleanup_code AS cleanupCode FROM task_finish_transient_artifacts WHERE artifact_id = ?').get(artifactId);
      database.exec('COMMIT');
      return row || null;
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskFinishBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_finish_artifact_update_failed', `Task Finish transient artifact 更新失败：${cause.message}`, 500, { artifactId });
    } finally { close(opened); }
  }

  function cutoverLegacyTaskFinishStore(targetRoot) {
    const observation = legacyObservation(targetRoot);
    if (!observation.present) return { status: 'not-applicable', imported: [], diagnostics: [], residue: [] };
    const diagnostics = [...observation.diagnostics];
    const imported = [];
    const completionFiles = observation.completed.files;
    for (const completionFile of completionFiles) {
      const runId = path.basename(completionFile, '.json');
      const runFile = path.join(observation.runs.directory, `${runId}.json`);
      if (!observation.runs.files.includes(runFile)) {
        diagnostics.push({ code: 'legacy_cutover_pair_missing', path: completionFile, message: 'legacy completion 缺少匹配 run；不导入。' });
        continue;
      }
      let run;
      let completion;
      try {
        run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
        completion = JSON.parse(fs.readFileSync(completionFile, 'utf8'));
        validateLegacyPair(run, completion, runFile, completionFile);
      } catch (cause) {
        diagnostics.push({ code: cause.code || 'legacy_cutover_invalid', path: completionFile, message: cause.message });
        continue;
      }
      let opened;
      try {
        opened = open(runtime, targetRoot, true);
        const database = opened.database;
        database.exec('BEGIN IMMEDIATE');
        const taskRow = database.prepare('SELECT task_id AS taskId FROM tasks WHERE task_id = ?').get(run.identity.task);
        if (!taskRow) throw error('legacy_cutover_task_missing', `legacy Finish Task 不存在：${run.identity.task}。`, 409, { completionFile });
        const current = database.prepare('SELECT run_id AS runId FROM task_finish_runs WHERE task_id = ?').get(run.identity.task);
        if (current) throw error('legacy_cutover_current_conflict', '当前 SQLite Finish run 已存在；不导入 legacy completion。', 409, { taskId: run.identity.task, currentRunId: current.runId });
        const result = legacyResult(run, completion);
        const serialized = JSON.stringify({ ...completion, task: run.identity.task, runId: run.runId, status: 'complete', result });
        const existing = database.prepare('SELECT run_id AS runId, result_json AS resultJson FROM task_finish_completions WHERE task_id = ?').get(run.identity.task);
        if (existing && (existing.runId !== run.runId || existing.resultJson !== serialized)) throw error('legacy_cutover_completion_conflict', 'SQLite 已存在不同 Finish terminal completion。', 409, { taskId: run.identity.task, existingRunId: existing.runId });
        database.prepare(`INSERT INTO task_finish_completions(task_id, run_id, status, result_json, completed_at, updated_at)
          VALUES (?, ?, 'complete', ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET run_id = excluded.run_id, status = excluded.status, result_json = excluded.result_json, completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
          .run(run.identity.task, run.runId, serialized, completion.completedAt, timestamp());
        const written = database.prepare('SELECT result_json AS resultJson FROM task_finish_completions WHERE task_id = ?').get(run.identity.task);
        if (written?.resultJson !== serialized) throw error('legacy_cutover_write_verify_failed', 'legacy Finish completion 写后读取不一致。', 500, { taskId: run.identity.task });
        database.exec('COMMIT');
        imported.push({ taskId: run.identity.task, runId: run.runId });
      } catch (cause) {
        try { opened?.database?.exec('ROLLBACK'); } catch {}
        diagnostics.push({ code: cause.code || 'legacy_cutover_write_failed', path: completionFile, message: cause.message });
        continue;
      } finally { close(opened); }
      try {
        fs.unlinkSync(completionFile);
        fs.unlinkSync(runFile);
      } catch (cause) {
        diagnostics.push({ code: 'legacy_cleanup_pending', path: completionFile, message: cause.message });
      }
    }
    const residue = legacyObservation(targetRoot).files;
    return { status: diagnostics.length || residue.length ? 'blocked' : imported.length ? 'complete' : 'not-applicable', imported, diagnostics, residue };
  }

  function inspectTaskFinishPersistence(targetRoot) {
    const legacy = legacyObservation(targetRoot);
    let opened;
    if (!fs.existsSync(runtime.workspaceStructuredStorePath(targetRoot))) {
      return { status: legacy.present ? 'legacy-residue' : 'uninitialized', current: [], completions: [], leases: [], artifacts: [], legacy: { present: legacy.present, residue: legacy.files.map((file) => path.relative(path.resolve(targetRoot), file).split(path.sep).join('/')), diagnostics: legacy.diagnostics } };
    }
    try {
      opened = open(runtime, targetRoot, false);
      const database = opened.database;
      const current = database.prepare('SELECT task_id AS taskId, run_id AS runId, status, updated_at AS updatedAt FROM task_finish_runs ORDER BY updated_at DESC').all();
      const completions = database.prepare('SELECT task_id AS taskId, run_id AS runId, status, updated_at AS updatedAt FROM task_finish_completions ORDER BY updated_at DESC').all();
      const nowValue = Date.now();
      const leases = database.prepare('SELECT target_identity AS targetIdentity, run_id AS runId, task_id AS taskId, token, expires_at AS expiresAt, heartbeat_at AS heartbeatAt FROM task_finish_target_leases').all().map((item) => ({ ...item, expired: Date.parse(item.expiresAt) <= nowValue }));
      const artifacts = database.prepare('SELECT artifact_id AS artifactId, run_id AS runId, kind, relative_locator AS relativeLocator, size_bytes AS sizeBytes, sha256, retention_status AS retentionStatus, cleanup_code AS cleanupCode FROM task_finish_transient_artifacts').all().map((item) => {
        const locator = String(item.relativeLocator || '');
        const target = path.resolve(opened.root, locator);
        const allowedRoot = path.resolve(opened.root, '.buildr', 'transient', 'task-finish', item.runId);
        const escaped = path.isAbsolute(locator) || (target !== allowedRoot && !target.startsWith(`${allowedRoot}${path.sep}`));
        let present = false;
        try { present = fs.lstatSync(target).isFile(); } catch {}
        return { ...item, present, escaped };
      });
      const invalidArtifacts = artifacts.filter((item) => item.escaped || (item.retentionStatus !== 'cleaned' && !item.present));
      return { status: leases.some((item) => item.expired) || invalidArtifacts.length || legacy.present ? 'attention' : 'healthy', current, completions, leases, artifacts, invalidArtifacts, legacy: { present: legacy.present, residue: legacy.files.map((file) => path.relative(opened.root, file).split(path.sep).join('/')), diagnostics: legacy.diagnostics } };
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
    registerTaskFinishTransientArtifactPersistence,
    updateTaskFinishTransientArtifactPersistence,
    cutoverLegacyTaskFinishStore,
    inspectTaskFinishPersistence,
  });
  return runtime;
}
