import {
  TASK_EXECUTION_RECORD_GC_LIMITS,
  TASK_EXECUTION_RECORD_OWNER_KINDS,
  acknowledgeUnknownTaskExecutionRecord,
  beginTaskExecutionRecordCleanup,
  completeTaskExecutionRecordCleanup,
  createOpenTaskExecutionRecord,
  evaluateTaskExecutionRecordCleanup,
  evaluateTaskExecutionRecordTombstonePurge,
  recoverTaskExecutionRecordAttention,
  resolveTaskExecutionRecord,
  sealTaskExecutionRecord,
  updateTaskExecutionRecordProgress,
  taskExecutionRecordError,
} from '../domain/task-execution-record.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';
import { cleanupTaskFinishDiagnosticsEvidence } from '../../task/application/finish/diagnostics-evidence.mjs';
import {
  loadRetainedTaskFinishExecutionRecordRecovery,
  loadTaskFinishExecutionRecordRecovery,
} from '../../task/application/finish/execution-record-recovery.mjs';

const PUBLIC_VIEWS = Object.freeze({
  all: null,
  verification: 'task-verification',
  finish: 'task-finish',
});

function assertInput(input, allowed, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskExecutionRecordError('task_execution_record_input_invalid', `${label}必须是对象。`);
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) throw taskExecutionRecordError('task_execution_record_field_forbidden', `${label}不支持字段：${field}。`, 400, { field });
  }
}

function result(operation, status, persisted, effects = []) {
  return {
    schemaVersion: 'buildr.task-execution-record-operation-result/v1',
    operation,
    status,
    taskId: persisted.record.taskId,
    record: persisted.record,
    locator: persisted.file,
    effects,
    diagnostic: null,
    nextActions: [],
  };
}

function portableBody(record, { files = null, diagnostic = null } = {}) {
  return {
    status: record.bodyStatus,
    available: record.bodyStatus === 'available' && diagnostic === null,
    digest: record.body.digest,
    storedSizeBytes: record.body.storedSizeBytes,
    originalSizeBytes: record.body.originalSizeBytes,
    truncated: record.body.truncated,
    redactionVersion: record.body.redactionVersion,
    files,
    diagnostic,
  };
}

function portableRecord(record, body = portableBody(record), { includeOpenProgress = false } = {}) {
  return {
    recordId: record.recordId,
    taskId: record.taskId,
    owner: record.owner,
    kind: record.kind,
    runIdentity: record.runIdentity,
    invocationIdentity: record.invocationIdentity,
    targetIdentity: record.targetIdentity,
    producer: record.producer,
    outcome: record.outcome,
    lifecycleStatus: record.lifecycleStatus,
    resolutionStatus: record.resolutionStatus,
    body,
    retention: { retainUntil: record.retention.retainUntil },
    timestamps: { ...record.timestamps },
    cleanupCode: record.cleanupCode,
    ...(includeOpenProgress && record.lifecycleStatus === 'open' && record.currentProgress ? { openLocalProgress: record.currentProgress } : {}),
  };
}

function publicView(value = 'all') {
  if (typeof value !== 'string' || !Object.hasOwn(PUBLIC_VIEWS, value)) {
    throw taskExecutionRecordError('task_execution_record_view_invalid', `execution record view不受支持：${String(value)}。`, 400, { view: value });
  }
  return value;
}

function sameTask(record, taskId) {
  if (record.taskId !== taskId) {
    throw taskExecutionRecordError('task_execution_record_not_found', `Task ${taskId} 中不存在该Execution Record。`, 404, { taskId });
  }
  return record;
}

function safeBodyDiagnostic(error) {
  return { code: error?.code || 'task_execution_record_body_unavailable', message: 'Execution Record正文当前不可验证或不可读取。' };
}

function gcInput(input) {
  assertInput(input, new Set(['dryRun', 'limit']), 'Task Execution Record GC');
  if (input.dryRun !== undefined && typeof input.dryRun !== 'boolean') throw taskExecutionRecordError('task_execution_record_gc_dry_run_invalid', 'dryRun必须是boolean。', 400, { field: 'dryRun' });
  const limit = input.limit ?? TASK_EXECUTION_RECORD_GC_LIMITS.defaultBatch;
  if (!Number.isInteger(limit) || limit < 1 || limit > TASK_EXECUTION_RECORD_GC_LIMITS.maximumBatch) {
    throw taskExecutionRecordError('task_execution_record_gc_limit_invalid', `limit必须是1..${TASK_EXECUTION_RECORD_GC_LIMITS.maximumBatch}整数。`, 400, { field: 'limit', limit });
  }
  return { dryRun: input.dryRun === true, limit };
}

function portableGcDiagnostic(error, status) {
  const conflict = ['task_execution_record_conflict', 'task_execution_record_not_found', 'task_execution_record_cleanup_not_eligible'].includes(error.code);
  return {
    code: error.code || 'task_execution_record_gc_action_failed',
    message: conflict || status === 'skipped'
      ? 'Record current 已变化，本次 GC action 已跳过。'
      : 'Record GC action 失败；现场已保留，请通过 Task Execution Record authority 检查。',
  };
}

function recoveryResult(status, mode, persisted, { cleanup = null, diagnostic = null, effects = [], nextActions = [] } = {}) {
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskExecutionRecordRecoverResult, {
    operation: 'recover',
    status,
    mode,
    taskId: persisted.record.taskId,
    recordId: persisted.record.recordId,
    record: portableRecord(persisted.record),
    transientCleanup: cleanup ? { status: cleanup.status, code: cleanup.code } : null,
    diagnostic,
    effects,
    nextActions,
  });
}

export function registerTaskExecutionRecordApplication(runtime) {
  const cleanupVerificationEvidence = (...args) => runtime.cleanupVerificationEvidence(...args);
  const createAuthorizedUnknownExecutionRecordFiles = (...args) => runtime.createAuthorizedUnknownExecutionRecordFiles(...args);
  const loadVerificationExecutionRecordRecovery = (...args) => runtime.loadVerificationExecutionRecordRecovery(...args);
  function loadTaskFinishAssociation(targetRoot, runId) {
    try {
      const current = runtime.readTaskFinishRunPersistence(targetRoot, { runId }, { optional: true });
      if (current?.run) {
        return {
          source: 'current',
          runId: current.run.runId,
          taskId: current.run.identity?.task || null,
          targetIdentity: current.run.identity?.contentTargetIdentity || null,
          invocationCount: current.run.invocations,
        };
      }
      const terminal = runtime.readTaskFinishCompletionPersistence(targetRoot, { runId }, { optional: true });
      if (!terminal?.completion) return null;
      const completion = terminal.completion;
      const terminalInvocationCount = completion.result?.metrics?.canonicalCliInvocations;
      return {
        source: terminal.status === 'complete' ? 'terminal-completion' : 'prepared-completion',
        runId: completion.runId || terminal.runId,
        taskId: completion.task || completion.result?.identity?.task || null,
        targetIdentity: completion.contentTargetIdentity || completion.result?.candidate?.contentTargetIdentity || null,
        invocationCount: Number.isInteger(terminalInvocationCount) ? terminalInvocationCount : null,
      };
    } catch (error) {
      if (error?.taskExecutionRecordBusiness) throw error;
      throw taskExecutionRecordError(
        'task_execution_record_recovery_finish_authority_unavailable',
        'Task Finish current/terminal authority当前不可验证；未修改Execution Record或Finish state。',
        409,
        { finishRunId: runId, cause: error?.code || null },
        '保留open record与diagnostics，恢复matching retained controller后重试。',
      );
    }
  }

  function openTaskExecutionRecord(targetRoot, taskId, input) {
    assertInput(input, new Set(['owner', 'kind', 'runIdentity', 'invocationIdentity', 'targetIdentity', 'producer', 'allowDuplicateInvocation']), 'Task Execution Record open');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') throw taskExecutionRecordError('task_execution_record_task_terminal', `Task ${taskId} 已是${task.record.status}，不能open新的执行记录。`, 409, { status: task.record.status });
    if (input.allowDuplicateInvocation !== undefined && typeof input.allowDuplicateInvocation !== 'boolean') throw taskExecutionRecordError('task_execution_record_allow_duplicate_invocation_invalid', 'allowDuplicateInvocation必须是boolean。', 400);
    const { allowDuplicateInvocation = false, ...recordInput } = input;
    const draft = createOpenTaskExecutionRecord({ taskId: task.record.taskId, ...recordInput });
    const persisted = runtime.openTaskExecutionRecordPersistence(task.root, draft, { allowDuplicateInvocation });
    const status = persisted.existingActive
      ? 'existing-active'
      : persisted.existingTerminal
        ? 'existing-terminal'
        : persisted.created
          ? 'opened'
          : 'reused';
    return result('open', status, persisted, [{ type: status, path: persisted.file }]);
  }

  function inspectTaskExecutionRecord(targetRoot, recordId) {
    return result('inspect', 'inspected', runtime.readTaskExecutionRecordPersistence(targetRoot, recordId));
  }

  function listTaskExecutionRecords(targetRoot, taskId, input = {}) {
    assertInput(input, new Set(['owner', 'kind']), 'Task Execution Record list');
    if (input.owner !== undefined && !Object.hasOwn(TASK_EXECUTION_RECORD_OWNER_KINDS, input.owner)) throw taskExecutionRecordError('task_execution_record_owner_invalid', `owner不受支持：${input.owner}。`, 400, { owner: input.owner });
    if (input.kind !== undefined) {
      if (!input.owner) throw taskExecutionRecordError('task_execution_record_kind_requires_owner', '按kind筛选时必须同时提供owner。', 400, { kind: input.kind });
      if (!TASK_EXECUTION_RECORD_OWNER_KINDS[input.owner].includes(input.kind)) throw taskExecutionRecordError('task_execution_record_kind_invalid', `kind不属于owner：${input.kind}。`, 400, { owner: input.owner, kind: input.kind });
    }
    const records = runtime.listTaskExecutionRecordPersistence(targetRoot, taskId, input);
    return {
      schemaVersion: 'buildr.task-execution-record-list-result/v1',
      operation: 'list',
      status: 'listed',
      taskId,
      records: records.map((item) => item.record),
      diagnostic: null,
      nextActions: [],
    };
  }

  function listTaskExecutionRecordView(targetRoot, taskId, input = {}) {
    assertInput(input, new Set(['view']), 'Task Execution Record public list');
    const view = publicView(input.view ?? 'all');
    const records = runtime.listTaskExecutionRecordPersistence(targetRoot, taskId, PUBLIC_VIEWS[view] ? { owner: PUBLIC_VIEWS[view] } : {});
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskExecutionRecordListView, {
      taskId,
      view,
      observedAt: new Date().toISOString(),
      records: records.map((item) => portableRecord(item.record)),
      diagnostic: null,
      nextActions: [],
    });
  }

  function inspectTaskExecutionRecordView(targetRoot, taskId, recordId) {
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    const record = sameTask(persisted.record, taskId);
    let body = portableBody(record);
    if (record.bodyStatus === 'available') {
      try {
        const inspected = runtime.inspectTaskExecutionRecordBody(persisted.root, record);
        body = portableBody(record, {
          files: inspected.files.map((file) => ({
            name: file.name,
            format: file.format,
            digest: file.digest,
            storedSizeBytes: file.storedSizeBytes,
            originalSizeBytes: file.originalSizeBytes,
            truncated: file.truncated,
          })),
        });
      } catch (error) {
        body = portableBody(record, { files: [], diagnostic: safeBodyDiagnostic(error) });
      }
    }
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskExecutionRecordDetailView, { taskId, record: portableRecord(record, body, { includeOpenProgress: true }), diagnostic: null });
  }

  function inspectTaskExecutionRecordCompactView(targetRoot, taskId, recordId) {
    const detail = inspectTaskExecutionRecordView(targetRoot, taskId, recordId);
    const record = detail.record;
    let execution = { status: 'unavailable', reason: record.lifecycleStatus === 'open' ? 'record-open' : `body-${record.body.status}` };
    if (record.owner === 'task-verification' && record.kind === 'verification-execution' && record.body.available) {
      try {
        const summary = JSON.parse(readTaskExecutionRecordBodyFileView(targetRoot, taskId, recordId, 'summary.json').file.content);
        const diagnostics = JSON.parse(readTaskExecutionRecordBodyFileView(targetRoot, taskId, recordId, 'diagnostics.json').file.content);
        execution = summary.schemaVersion === 'buildr.verification-execution-record-recovery-summary/v1'
          ? { status: 'unknown', reason: 'authorized-unknown', outcome: 'unknown', acknowledgedAt: summary.acknowledgedAt, failures: [], diagnostic: diagnostics.diagnostic }
          : {
            status: 'available',
            outcome: summary.outcome,
            durationMs: summary.durationMs,
            timingSource: summary.timingSource,
            startedAt: summary.startedAt,
            finishedAt: summary.finishedAt,
            project: summary.project,
            target: summary.target,
            declaration: summary.declaration,
            selectedCapabilities: summary.selectedCapabilities,
            failures: diagnostics.failures,
            diagnostic: diagnostics.diagnostic,
          };
      } catch (error) {
        execution = { status: 'unavailable', reason: 'body-integrity-failed', diagnostic: safeBodyDiagnostic(error) };
      }
    }
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskExecutionRecordInspectResult, { taskId, record, execution, diagnostic: null, nextActions: [] });
  }

  function readTaskExecutionRecordBodyFileView(targetRoot, taskId, recordId, filename) {
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    const record = sameTask(persisted.record, taskId);
    if (record.bodyStatus !== 'available') {
      throw taskExecutionRecordError('task_execution_record_body_unavailable', `Execution Record正文状态为${record.bodyStatus}。`, record.bodyStatus === 'cleaned' ? 410 : 409, { recordId, bodyStatus: record.bodyStatus });
    }
    let file;
    try {
      file = runtime.readTaskExecutionRecordBodyFile(persisted.root, record, filename);
    } catch (error) {
      if (['task_execution_record_body_name_forbidden', 'task_execution_record_body_file_not_found'].includes(error?.code)) throw error;
      throw taskExecutionRecordError(error?.code || 'task_execution_record_body_unavailable', 'Execution Record正文完整性校验失败，未返回任何内容。', Number.isInteger(error?.status) ? error.status : 409, { recordId, filename });
    }
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskExecutionRecordBodyFile, { taskId, recordId, file, diagnostic: null });
  }

  function sealTaskExecutionRecordOperation(targetRoot, recordId, input) {
    assertInput(input, new Set(['outcome', 'files']), 'Task Execution Record seal');
    if (input.outcome === 'unknown') throw taskExecutionRecordError('task_execution_record_unknown_requires_authorization', 'unknown outcome只能通过受控recover授权路径写入。', 409);
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    const current = persisted.record;
    if (current.lifecycleStatus !== 'open') {
      if (current.outcome === input.outcome && current.lifecycleStatus === 'retained') return result('seal', 'reused', persisted);
      if (current.outcome === input.outcome && current.lifecycleStatus === 'attention') {
        runtime.verifyTaskExecutionRecordBody(persisted.root, current);
        const recovered = runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, recoverTaskExecutionRecordAttention(current));
        return result('seal', 'recovered', recovered, [{ type: 'verified', path: current.body.locator }, { type: 'updated', path: recovered.file }]);
      }
      throw taskExecutionRecordError('task_execution_record_not_open', `record ${recordId} 已是${current.lifecycleStatus}。`, 409, { lifecycleStatus: current.lifecycleStatus });
    }
    const body = runtime.publishTaskExecutionRecordBody(persisted.root, current, input.files);
    const sealedAt = new Date().toISOString();
    const next = sealTaskExecutionRecord(current, body, input.outcome, sealedAt);
    try {
      const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, next);
      return result('seal', 'sealed', written, [{ type: 'published', path: body.locator }, { type: 'updated', path: written.file }]);
    } catch (error) {
      try {
        const attention = sealTaskExecutionRecord(current, body, input.outcome, sealedAt, { attention: true });
        runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, attention);
      } catch {}
      throw error;
    }
  }

  function updateTaskExecutionRecordProgressOperation(targetRoot, recordId, input) {
    assertInput(input, new Set(['runIdentity', 'invocationIdentity', 'producer', 'progress']), 'Task Execution Record progress');
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    const current = persisted.record;
    if (current.runIdentity !== input.runIdentity || current.invocationIdentity !== (input.invocationIdentity ?? null) || current.producer !== input.producer) {
      throw taskExecutionRecordError('task_execution_record_progress_identity_mismatch', 'Progress writer identity与record不一致。', 409, { recordId });
    }
    const next = updateTaskExecutionRecordProgress(current, input.progress);
    const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, next);
    return result('progress', 'updated', written, [{ type: 'updated', path: written.file }]);
  }

  function recoverTaskExecutionRecord(targetRoot, taskId, recordId, input = {}) {
    assertInput(input, new Set(['summaryPath', 'authorizeUnknownOutcome']), 'Task Execution Record recover');
    if (input.summaryPath !== undefined && (typeof input.summaryPath !== 'string' || !input.summaryPath.trim())) throw taskExecutionRecordError('task_execution_record_recovery_summary_invalid', 'summaryPath必须是非空字符串。', 400);
    if (input.authorizeUnknownOutcome !== undefined && typeof input.authorizeUnknownOutcome !== 'boolean') throw taskExecutionRecordError('task_execution_record_recovery_authorization_invalid', 'authorizeUnknownOutcome必须是boolean。', 400);
    if (input.summaryPath && input.authorizeUnknownOutcome) throw taskExecutionRecordError('task_execution_record_recovery_mode_conflict', 'summary与unknown outcome授权不能同时使用。', 400);
    let persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    sameTask(persisted.record, taskId);
    const record = persisted.record;
    const verificationOwner = record.owner === 'task-verification' && record.kind === 'verification-execution';
    const finishOwner = record.owner === 'task-finish' && record.kind === 'finish-diagnostics';
    if (!verificationOwner && !finishOwner) throw taskExecutionRecordError('task_execution_record_recovery_owner_unsupported', 'recover不支持该Execution Record owner/kind。', 409, { owner: record.owner, kind: record.kind });

    if (input.summaryPath) {
      if (verificationOwner) {
        const recovery = loadVerificationExecutionRecordRecovery(input.summaryPath, record);
        const sealed = sealTaskExecutionRecordOperation(persisted.root, recordId, { outcome: recovery.outcome, files: recovery.files });
        const cleanup = cleanupVerificationEvidence(recovery.summary, { removePath: runtime.removePath });
        return recoveryResult('recovered', 'terminal-evidence', sealed, {
          cleanup,
          effects: [
            { type: sealed.status === 'reused' ? 'reused' : 'sealed', recordId },
            { type: cleanup.ok ? 'transient-cleaned' : 'transient-retained', recordId },
          ],
          diagnostic: cleanup.ok ? null : { code: cleanup.code, message: cleanup.message },
          nextActions: cleanup.ok ? [] : ['Execution Record已恢复；检查transient cleanup diagnostic后只清理该owned evidence。'],
        });
      }
      const recoveryOptions = {
        workspaceRoot: persisted.root,
        loadFinishAssociation: (runId) => loadTaskFinishAssociation(persisted.root, runId),
        verifyBody: runtime.verifyTaskExecutionRecordBody,
      };
      const retained = loadRetainedTaskFinishExecutionRecordRecovery(input.summaryPath, persisted, recoveryOptions);
      if (retained) {
        const cleanup = cleanupTaskFinishDiagnosticsEvidence(retained.summary, { removePath: runtime.removePath });
        return recoveryResult('recovered', 'terminal-evidence', persisted, {
          cleanup,
          effects: [
            { type: 'reused', recordId },
            { type: cleanup.ok ? 'transient-cleaned' : 'transient-retained', recordId },
          ],
          diagnostic: cleanup.ok ? null : { code: cleanup.code, message: cleanup.message },
          nextActions: cleanup.ok ? [] : ['Execution Record已恢复；检查Task Finish diagnostics cleanup diagnostic后重试同一summary。'],
        });
      }
      const recovery = loadTaskFinishExecutionRecordRecovery(input.summaryPath, record, recoveryOptions);
      const sealed = sealTaskExecutionRecordOperation(persisted.root, recordId, { outcome: recovery.outcome, files: recovery.files });
      runtime.verifyTaskExecutionRecordBody(persisted.root, sealed.record);
      const cleanup = cleanupTaskFinishDiagnosticsEvidence(recovery.summary, { removePath: runtime.removePath });
      return recoveryResult('recovered', 'terminal-evidence', sealed, {
        cleanup,
        effects: [
          { type: sealed.status === 'reused' ? 'reused' : 'sealed', recordId },
          { type: cleanup.ok ? 'transient-cleaned' : 'transient-retained', recordId },
        ],
        diagnostic: cleanup.ok ? null : { code: cleanup.code, message: cleanup.message },
        nextActions: cleanup.ok ? [] : ['Execution Record已恢复；检查Task Finish diagnostics cleanup diagnostic后重试同一summary。'],
      });
    }

    if (finishOwner) {
      throw taskExecutionRecordError(
        input.authorizeUnknownOutcome ? 'task_execution_record_recovery_authorization_unsupported' : 'task_execution_record_recovery_summary_required',
        input.authorizeUnknownOutcome
          ? 'Task Finish recovery不接受unknown outcome授权；必须由matching diagnostics证明terminal outcome。'
          : 'Task Finish recovery必须提供该record的matching diagnostics summary。',
        409,
        { owner: record.owner, kind: record.kind },
        '传入该invocation精确diagnostics目录中的summary.json；无可证明terminal evidence时保留open record。',
      );
    }

    if (!input.authorizeUnknownOutcome) {
      return recoveryResult('authorization-required', 'unknown-unconfirmed', persisted, {
        diagnostic: { code: 'task_execution_record_recovery_authorization_required', message: '没有可验证terminal summary；Buildr不能判断原Verification outcome。' },
        nextActions: ['仅在用户接受原结果未知、原record将终结且仍存活producer的后续seal可能失败时，传--authorize-unknown-outcome。'],
      });
    }
    if (record.lifecycleStatus !== 'open') {
      if (record.outcome === 'unknown') return recoveryResult('attention', 'authorized-unknown', persisted, { nextActions: ['该record仍不是Verification Result；后续普通invocation可以重新执行。'] });
      throw taskExecutionRecordError('task_execution_record_not_open', `record ${recordId} 已是${record.lifecycleStatus}/${record.outcome}。`, 409, { lifecycleStatus: record.lifecycleStatus, outcome: record.outcome });
    }
    const acknowledgedAt = new Date().toISOString();
    const body = runtime.publishTaskExecutionRecordBody(persisted.root, record, createAuthorizedUnknownExecutionRecordFiles(record, acknowledgedAt));
    const next = acknowledgeUnknownTaskExecutionRecord(record, body, acknowledgedAt);
    persisted = runtime.replaceTaskExecutionRecordPersistence(persisted.root, record, next);
    return recoveryResult('attention', 'authorized-unknown', persisted, {
      effects: [{ type: 'unknown-acknowledged', recordId }],
      diagnostic: { code: 'verification.execution_outcome_unknown', message: '原Verification outcome不可证明，已按用户授权保留unknown终态。' },
      nextActions: ['该record不是Verification Result；后续普通invocation可以重新执行。'],
    });
  }

  function resolveTaskExecutionRecordOperation(targetRoot, recordId, input) {
    assertInput(input, new Set(['resolutionStatus']), 'Task Execution Record resolve');
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    if (persisted.record.resolutionStatus === input.resolutionStatus) return result('resolve', 'reused', persisted);
    const next = resolveTaskExecutionRecord(persisted.record, input.resolutionStatus);
    const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, persisted.record, next);
    return result('resolve', 'resolved', written, [{ type: 'updated', path: written.file }]);
  }

  function cleanupTaskExecutionRecord(targetRoot, recordId) {
    let persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    if (persisted.record.lifecycleStatus === 'cleaned') return result('cleanup', 'reused', persisted);
    if (persisted.record.lifecycleStatus === 'retained') {
      const recentRank = runtime.taskExecutionRecordRecentRank(persisted.root, persisted.record);
      const eligibility = evaluateTaskExecutionRecordCleanup(persisted.record, { recentRank });
      if (!eligibility.eligible) throw taskExecutionRecordError('task_execution_record_cleanup_not_eligible', 'Task Execution Record尚不满足cleanup条件。', 409, { recordId, reasons: eligibility.reasons }, '等待固定retention到期、完成失败处置，或保留最近成功记录。');
      persisted = runtime.replaceTaskExecutionRecordPersistence(persisted.root, persisted.record, beginTaskExecutionRecordCleanup(persisted.record));
    }
    if (persisted.record.lifecycleStatus !== 'cleanup_pending') throw taskExecutionRecordError('task_execution_record_cleanup_not_pending', `record ${recordId} 不能cleanup：${persisted.record.lifecycleStatus}。`, 409, { lifecycleStatus: persisted.record.lifecycleStatus });
    const removed = runtime.cleanupTaskExecutionRecordBody(persisted.root, persisted.record);
    const cleaned = completeTaskExecutionRecordCleanup(persisted.record, removed.removed ? 'body-removed' : 'body-already-absent');
    const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, persisted.record, cleaned);
    return result('cleanup', 'cleaned', written, [{ type: removed.removed ? 'deleted' : 'absent', path: removed.locator }, { type: 'updated', path: written.file }]);
  }

  function gcTaskExecutionRecords(targetRoot, input = {}) {
    const options = gcInput(input);
    const observedAt = new Date().toISOString();
    const selection = runtime.listTaskExecutionRecordGcCandidates(targetRoot, { now: observedAt, limit: options.limit });
    const records = [];
    let cleaned = 0;
    let purged = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of selection.candidates) {
      const record = candidate.persisted.record;
      const base = { recordId: record.recordId, taskId: record.taskId, owner: record.owner, kind: record.kind, action: candidate.action };
      const eligibility = candidate.action === 'purge'
        ? evaluateTaskExecutionRecordTombstonePurge(record, { now: observedAt, recentRank: candidate.recentRank })
        : record.lifecycleStatus === 'cleanup_pending'
          ? { eligible: true, reasons: [] }
          : evaluateTaskExecutionRecordCleanup(record, { now: observedAt, recentRank: candidate.recentRank });
      if (!eligibility.eligible) {
        skipped += 1;
        records.push({ ...base, status: 'skipped', diagnostic: { code: 'task_execution_record_gc_candidate_stale', message: 'Record 不再满足本次 GC action 条件。' } });
        continue;
      }
      if (options.dryRun) {
        records.push({ ...base, status: 'eligible', diagnostic: null });
        continue;
      }
      try {
        if (candidate.action === 'cleanup') {
          cleanupTaskExecutionRecord(selection.root, record.recordId);
          cleaned += 1;
          records.push({ ...base, status: 'cleaned', diagnostic: null });
        } else {
          const deleted = runtime.deleteTaskExecutionRecordTombstonePersistence(selection.root, record);
          if (!deleted.deleted) {
            skipped += 1;
            records.push({ ...base, status: 'skipped', diagnostic: { code: 'task_execution_record_tombstone_absent', message: 'Tombstone 已由其他 GC 删除。' } });
          } else {
            purged += 1;
            records.push({ ...base, status: 'purged', diagnostic: null });
          }
        }
      } catch (error) {
        const isSkipped = ['task_execution_record_conflict', 'task_execution_record_not_found', 'task_execution_record_cleanup_not_eligible'].includes(error.code);
        if (isSkipped) skipped += 1;
        else failed += 1;
        records.push({ ...base, status: isSkipped ? 'skipped' : 'failed', diagnostic: portableGcDiagnostic(error, isSkipped ? 'skipped' : 'failed') });
      }
    }
    const status = options.dryRun ? 'planned' : failed ? (cleaned || purged || skipped ? 'partial' : 'failed') : 'completed';
    return {
      schemaVersion: 'buildr.task-execution-record-gc-result/v1',
      operation: 'gc',
      status,
      mode: options.dryRun ? 'dry-run' : 'run',
      limit: options.limit,
      observedAt,
      counts: {
        scanned: selection.scanned,
        eligible: selection.eligible,
        selected: selection.candidates.length,
        cleaned,
        purged,
        skipped,
        failed,
      },
      records,
      diagnostic: failed ? { code: 'task_execution_record_gc_partial_failure', message: '部分 ExecRecord GC action 未完成，其他 action 已保留各自结果。' } : null,
      nextActions: failed ? ['检查 failed record 的 portable diagnostic；GC 不会自动处置、修复或扫描正文。'] : [],
    };
  }

  Object.assign(runtime, {
    openTaskExecutionRecord,
    inspectTaskExecutionRecord,
    listTaskExecutionRecords,
    listTaskExecutionRecordView,
    inspectTaskExecutionRecordView,
    inspectTaskExecutionRecordCompactView,
    readTaskExecutionRecordBodyFileView,
    sealTaskExecutionRecord: sealTaskExecutionRecordOperation,
    updateTaskExecutionRecordProgress: updateTaskExecutionRecordProgressOperation,
    resolveTaskExecutionRecord: resolveTaskExecutionRecordOperation,
    cleanupTaskExecutionRecord,
    gcTaskExecutionRecords,
    recoverTaskExecutionRecord,
  });
  return runtime;
}
