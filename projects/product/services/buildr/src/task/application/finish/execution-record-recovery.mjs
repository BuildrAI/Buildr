import fs from 'node:fs';
import path from 'node:path';

import { taskExecutionRecordError } from '../../domain/task-execution-record.mjs';
import { TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA } from './diagnostics-evidence.mjs';
import {
  TASK_FINISH_EXECUTION_RECORD_KIND,
  TASK_FINISH_EXECUTION_RECORD_OWNER,
  TASK_FINISH_EXECUTION_RECORD_PRODUCER,
} from './execution-record.mjs';

const EVIDENCE_FILES = Object.freeze(['diagnostics.json', 'stderr.txt', 'stdout.txt', 'summary.json', 'timeline.json']);
const PHASES = Object.freeze(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
const PHASE_INDEX = new Map(PHASES.map((phase, index) => [phase, index]));
const TERMINAL_PHASE_STATUSES = new Set(['passed', 'blocked', 'failed', 'not-applicable']);
const FINISH_OUTCOMES = Object.freeze({ complete: 'passed', blocked: 'blocked', cleanup_pending: 'blocked', failed: 'failed' });
const RECOVERY_SUMMARY_SCHEMA = 'buildr.task-finish-execution-record-recovery-summary/v1';
const RECOVERY_TIMELINE_SCHEMA = 'buildr.task-finish-execution-record-recovery-timeline/v1';
const RECOVERY_DIAGNOSTICS_SCHEMA = 'buildr.task-finish-execution-record-recovery-diagnostics/v1';

function blocked(code, message, details = undefined) {
  return taskExecutionRecordError(code, message, 409, details, '保留open record与该invocation的Task Finish diagnostics；修正matching evidence后重试。');
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function same(left, right, field) {
  if (left !== right) throw blocked('task_execution_record_recovery_identity_mismatch', `Task Finish recovery的${field}与record或Finish authority不一致。`, { field });
}

function parseJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw blocked('task_execution_record_recovery_evidence_invalid', `Task Finish recovery的${label}不是合法JSON。`, { file: path.basename(file) }); }
}

function exactRecoveryPath(workspaceRoot, record) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const directory = path.join(root, '.buildr', 'transient', 'task-finish', 'diagnostics', record.runIdentity);
  return { root, directory, summaryPath: path.join(directory, 'summary.json') };
}

function assertOwner(record) {
  if (record.owner !== TASK_FINISH_EXECUTION_RECORD_OWNER
    || record.kind !== TASK_FINISH_EXECUTION_RECORD_KIND
    || record.producer !== TASK_FINISH_EXECUTION_RECORD_PRODUCER) {
    throw taskExecutionRecordError(
      'task_execution_record_recovery_owner_unsupported',
      'Task Finish recover只支持registered Task Finish diagnostics producer的Execution Record。',
      409,
      { owner: record.owner, kind: record.kind, producer: record.producer },
    );
  }
}

function ownedEvidenceBoundary(summaryPath, workspaceRoot, record, { allowAbsent = false } = {}) {
  assertOwner(record);
  const expected = exactRecoveryPath(workspaceRoot, record);
  const resolvedSummary = path.resolve(summaryPath);
  if (resolvedSummary !== expected.summaryPath) {
    throw blocked('task_execution_record_recovery_boundary_invalid', 'Recovery summary不属于该record的精确Task Finish diagnostics boundary。');
  }
  if (!fs.existsSync(expected.directory) || !fs.existsSync(expected.summaryPath)) {
    if (allowAbsent && !fs.existsSync(expected.directory) && !fs.existsSync(expected.summaryPath)) return { ...expected, absent: true };
    throw blocked('task_execution_record_recovery_summary_missing', 'Task Finish recovery summary不存在。');
  }
  const directoryStat = fs.lstatSync(expected.directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || fs.realpathSync(expected.directory) !== expected.directory) {
    throw blocked('task_execution_record_recovery_boundary_invalid', 'Task Finish diagnostics boundary不是canonical普通目录。');
  }
  const entries = fs.readdirSync(expected.directory).sort();
  if (entries.length !== EVIDENCE_FILES.length || entries.some((entry, index) => entry !== EVIDENCE_FILES[index])) {
    throw blocked('task_execution_record_recovery_evidence_set_invalid', 'Task Finish diagnostics必须包含且仅包含registered producer的五个evidence文件。', { entries });
  }
  for (const name of EVIDENCE_FILES) {
    const stat = fs.lstatSync(path.join(expected.directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw blocked('task_execution_record_recovery_boundary_invalid', `Task Finish diagnostics文件不是普通文件：${name}。`, { file: name });
  }
  return { ...expected, absent: false };
}

function validatePhaseResults(summary, timeline, diagnostics) {
  if (!Array.isArray(summary.phaseResults)) throw blocked('task_execution_record_recovery_phases_invalid', 'Task Finish recovery summary缺少phaseResults。');
  let previousIndex = -1;
  const failures = [];
  for (const phase of summary.phaseResults) {
    const phaseIndex = PHASE_INDEX.get(phase?.id);
    if (phaseIndex === undefined || phaseIndex <= previousIndex) throw blocked('task_execution_record_recovery_phases_invalid', 'Task Finish recovery phases不是唯一且有序的Finish phases。');
    previousIndex = phaseIndex;
    if (!TERMINAL_PHASE_STATUSES.has(phase.status) || !Number.isInteger(phase.attempt) || phase.attempt < 1) {
      throw blocked('task_execution_record_recovery_phases_invalid', `Task Finish recovery phase不是合法terminal result：${phase.id}。`, { phase: phase.id });
    }
    if (!validTimestamp(phase.startedAt) || !validTimestamp(phase.completedAt) || Date.parse(phase.completedAt) < Date.parse(phase.startedAt)
      || !Number.isSafeInteger(phase.durationMs) || phase.durationMs < 0) {
      throw blocked('task_execution_record_recovery_timing_invalid', `Task Finish recovery phase缺少合法timing：${phase.id}。`, { phase: phase.id });
    }
    const terminalFailure = ['blocked', 'failed'].includes(phase.status);
    if (terminalFailure !== Boolean(phase.failure)) throw blocked('task_execution_record_recovery_failure_invalid', `Task Finish recovery phase failure与status不一致：${phase.id}。`, { phase: phase.id });
    if (phase.failure) failures.push(phase.failure);
    const started = timeline.events.some((event) => event.milestone === 'phase-started' && event.phase === phase.id && event.at === phase.startedAt);
    const finished = timeline.events.some((event) => event.milestone === 'phase-finished' && event.phase === phase.id && event.status === phase.status && event.at === phase.completedAt);
    if (!started || !finished) throw blocked('task_execution_record_recovery_timeline_mismatch', `Task Finish recovery timeline没有matching phase checkpoints：${phase.id}。`, { phase: phase.id });
  }
  if (JSON.stringify(diagnostics.failures) !== JSON.stringify(failures)) {
    throw blocked('task_execution_record_recovery_failure_mismatch', 'Task Finish recovery diagnostics与phase failures不一致。');
  }
  return summary.phaseResults.at(-1) || null;
}

function validateTimeline(summary, timeline) {
  if (!Array.isArray(timeline.events) || timeline.events.length < 2) throw blocked('task_execution_record_recovery_timeline_invalid', 'Task Finish recovery timeline不完整。');
  const allowedMilestones = new Set(['record-opened', 'run-opened', 'phase-started', 'phase-finished', 'finish-stopped']);
  let previousAt = Date.parse(summary.startedAt);
  for (const event of timeline.events) {
    if (!allowedMilestones.has(event?.milestone) || !validTimestamp(event.at) || Date.parse(event.at) < previousAt) {
      throw blocked('task_execution_record_recovery_timeline_invalid', 'Task Finish recovery timeline包含非法或逆序event。');
    }
    if (['phase-started', 'phase-finished'].includes(event.milestone) !== PHASE_INDEX.has(event.phase)) {
      throw blocked('task_execution_record_recovery_timeline_invalid', 'Task Finish recovery timeline的phase binding不合法。');
    }
    previousAt = Date.parse(event.at);
  }
  if (timeline.events[0].milestone !== 'record-opened' || timeline.events[0].at !== summary.startedAt
    || timeline.events.filter((event) => event.milestone === 'record-opened').length !== 1
    || timeline.events.filter((event) => event.milestone === 'run-opened').length !== 1) {
    throw blocked('task_execution_record_recovery_timeline_invalid', 'Task Finish recovery timeline缺少唯一的record/run open checkpoints。');
  }
}

function terminalEvidence(summary, timeline, lastPhase) {
  const stopped = timeline.events.filter((event) => event.milestone === 'finish-stopped');
  if (stopped.length > 1) throw blocked('task_execution_record_recovery_terminal_invalid', 'Task Finish recovery evidence包含多个finish-stopped terminal。');
  if (stopped.length === 1) {
    const terminal = stopped[0];
    if (timeline.events.at(-1) !== terminal || !Object.hasOwn(FINISH_OUTCOMES, terminal.status)) {
      throw blocked('task_execution_record_recovery_terminal_invalid', 'Task Finish recovery finish-stopped不是受支持的最终checkpoint。');
    }
    if (!validTimestamp(summary.finishedAt) || summary.finishedAt !== terminal.at) {
      throw blocked('task_execution_record_recovery_timing_invalid', 'Task Finish recovery finishedAt与finish-stopped不一致。');
    }
    if (terminal.status === 'complete' && summary.phaseResults.some((phase) => !['passed', 'not-applicable'].includes(phase.status))) {
      throw blocked('task_execution_record_recovery_terminal_invalid', 'complete Finish recovery evidence包含未通过phase。');
    }
    return { outcome: FINISH_OUTCOMES[terminal.status], finishedAt: terminal.at, source: 'finish-stopped', finishStatus: terminal.status };
  }
  if (summary.finishedAt !== null || !lastPhase || !['blocked', 'failed'].includes(lastPhase.status)) {
    throw blocked('task_execution_record_recovery_terminal_incomplete', 'Task Finish recovery没有可证明的terminal checkpoint。');
  }
  const finalEvent = timeline.events.at(-1);
  if (finalEvent.milestone !== 'phase-finished' || finalEvent.phase !== lastPhase.id || finalEvent.status !== lastPhase.status || finalEvent.at !== lastPhase.completedAt) {
    throw blocked('task_execution_record_recovery_terminal_incomplete', 'Task Finish中断证据没有以matching failed/blocked phase checkpoint结束。');
  }
  return { outcome: lastPhase.status, finishedAt: lastPhase.completedAt, source: 'terminal-phase', finishStatus: null };
}

function validateAssociation(association, summary, record) {
  if (!association) throw blocked('task_execution_record_recovery_finish_run_missing', 'Task Finish recovery找不到matching current或terminal Finish run。', { finishRunId: summary.finishRunId });
  same(association.runId, summary.finishRunId, 'finishRunId');
  same(association.taskId, record.taskId, 'Task identity');
  same(association.targetIdentity, record.targetIdentity, 'Content Target identity');
  if (association.invocationCount != null && (!Number.isInteger(association.invocationCount) || summary.invocationOrdinal > association.invocationCount)) {
    throw blocked('task_execution_record_recovery_invocation_invalid', 'Task Finish recovery invocation ordinal超过Finish authority。', { invocationOrdinal: summary.invocationOrdinal });
  }
}

function lifecycle(boundary, record) {
  return {
    schemaVersion: TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA,
    invocationId: record.runIdentity,
    workspaceRoot: boundary.root,
    evidenceRetention: 'transient',
    cleanupStatus: 'retained',
    cleanupReference: boundary.directory,
    summaryPath: boundary.summaryPath,
  };
}

function recoveryFiles({ summary, timeline, diagnostics, stdout, stderr, record, association, terminal }) {
  const durationMs = Math.max(0, Date.parse(terminal.finishedAt) - Date.parse(summary.startedAt));
  return [
    {
      name: 'summary.json',
      content: {
        schemaVersion: RECOVERY_SUMMARY_SCHEMA,
        recovery: 'terminal-evidence',
        recordId: record.recordId,
        taskId: record.taskId,
        invocationId: record.runIdentity,
        finishRunId: summary.finishRunId,
        invocationOrdinal: summary.invocationOrdinal,
        targetIdentity: record.targetIdentity,
        outcome: terminal.outcome,
        finishStatus: terminal.finishStatus,
        phases: summary.phaseResults,
        durationMs,
        timingSource: terminal.source === 'finish-stopped' ? 'producer-finish-stopped' : 'producer-terminal-phase',
        startedAt: summary.startedAt,
        finishedAt: terminal.finishedAt,
        source: { schemaVersion: summary.schemaVersion, terminalEvidence: terminal.source, finishAuthority: association.source },
      },
    },
    { name: 'stdout.txt', content: stdout },
    { name: 'stderr.txt', content: stderr },
    {
      name: 'timeline.json',
      content: {
        schemaVersion: RECOVERY_TIMELINE_SCHEMA,
        invocationId: record.runIdentity,
        finishRunId: summary.finishRunId,
        sourceSchemaVersion: timeline.schemaVersion,
        events: timeline.events,
      },
    },
    {
      name: 'diagnostics.json',
      content: {
        schemaVersion: RECOVERY_DIAGNOSTICS_SCHEMA,
        invocationId: record.runIdentity,
        finishRunId: summary.finishRunId,
        outcome: terminal.outcome,
        sourceSchemaVersion: diagnostics.schemaVersion,
        failures: diagnostics.failures,
        diagnostic: terminal.source === 'terminal-phase'
          ? { code: 'task-finish.execution-interrupted-after-terminal-phase', message: 'Producer在写入terminal phase checkpoint后、写入finish-stopped前中断。' }
          : null,
      },
    },
  ];
}

export function loadTaskFinishExecutionRecordRecovery(summaryPath, record, options = {}) {
  const boundary = ownedEvidenceBoundary(summaryPath, options.workspaceRoot, record);
  const summary = parseJson(boundary.summaryPath, 'summary.json');
  const timeline = parseJson(path.join(boundary.directory, 'timeline.json'), 'timeline.json');
  const diagnostics = parseJson(path.join(boundary.directory, 'diagnostics.json'), 'diagnostics.json');
  const stdout = fs.readFileSync(path.join(boundary.directory, 'stdout.txt'), 'utf8');
  const stderr = fs.readFileSync(path.join(boundary.directory, 'stderr.txt'), 'utf8');
  if (summary.schemaVersion !== TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA
    || timeline.schemaVersion !== TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA
    || diagnostics.schemaVersion !== TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA) {
    throw blocked('task_execution_record_recovery_summary_schema_invalid', `Task Finish recovery evidence必须是${TASK_FINISH_DIAGNOSTICS_EVIDENCE_SCHEMA}。`);
  }
  same(summary.invocationId, record.runIdentity, 'invocationId');
  same(timeline.invocationId, record.runIdentity, 'timeline invocationId');
  same(diagnostics.invocationId, record.runIdentity, 'diagnostics invocationId');
  if (typeof summary.finishRunId !== 'string' || !summary.finishRunId || !Number.isInteger(summary.invocationOrdinal) || summary.invocationOrdinal < 1) {
    throw blocked('task_execution_record_recovery_finish_identity_invalid', 'Task Finish recovery summary缺少合法Finish run与invocation ordinal。');
  }
  if (!validTimestamp(summary.startedAt)) throw blocked('task_execution_record_recovery_timing_invalid', 'Task Finish recovery summary缺少合法startedAt。');
  if (!Array.isArray(diagnostics.failures)) throw blocked('task_execution_record_recovery_failure_invalid', 'Task Finish recovery diagnostics缺少failures。');
  validateTimeline(summary, timeline);
  const lastPhase = validatePhaseResults(summary, timeline, diagnostics);
  const terminal = terminalEvidence(summary, timeline, lastPhase);
  const association = options.loadFinishAssociation?.(summary.finishRunId) || null;
  validateAssociation(association, summary, record);
  return {
    summary: lifecycle(boundary, record),
    outcome: terminal.outcome,
    files: recoveryFiles({ summary, timeline, diagnostics, stdout, stderr, record, association, terminal }),
    boundary,
    association,
  };
}

export function loadRetainedTaskFinishExecutionRecordRecovery(summaryPath, persisted, options = {}) {
  const record = persisted.record;
  const boundary = ownedEvidenceBoundary(summaryPath, options.workspaceRoot, record, { allowAbsent: true });
  if (!boundary.absent) return null;
  if (record.lifecycleStatus !== 'retained' || record.bodyStatus !== 'available') {
    throw blocked('task_execution_record_recovery_summary_missing', 'Task Finish recovery summary不存在，且record不是已恢复的retained record。');
  }
  const published = options.verifyBody?.(persisted.root, record);
  const file = published?.files?.find((item) => item.name === 'summary.json');
  let summary;
  try { summary = JSON.parse(file?.content?.toString('utf8') || ''); }
  catch { throw blocked('task_execution_record_recovery_retained_body_invalid', 'Retained Task Finish recovery正文不可验证。'); }
  if (summary.schemaVersion !== RECOVERY_SUMMARY_SCHEMA || summary.recovery !== 'terminal-evidence') {
    throw blocked('task_execution_record_recovery_summary_missing', 'Task Finish recovery summary已不存在，且record不是由该受控recovery形成。');
  }
  same(summary.recordId, record.recordId, 'recordId');
  same(summary.taskId, record.taskId, 'taskId');
  same(summary.invocationId, record.runIdentity, 'invocationId');
  same(summary.targetIdentity, record.targetIdentity, 'targetIdentity');
  same(summary.outcome, record.outcome, 'outcome');
  const association = options.loadFinishAssociation?.(summary.finishRunId) || null;
  validateAssociation(association, summary, record);
  return { summary: lifecycle(boundary, record), boundary, association };
}
