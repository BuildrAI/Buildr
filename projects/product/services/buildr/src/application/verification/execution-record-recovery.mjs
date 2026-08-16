import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { taskExecutionRecordError } from '../../domain/task-execution-record/task-execution-record.mjs';
import {
  VERIFICATION_EXECUTION_RECORD_KIND,
  VERIFICATION_EXECUTION_RECORD_OWNER,
  VERIFICATION_EXECUTION_RECORD_PRODUCER,
  createVerificationExecutionRecordFiles,
  verificationExecutionRecordOutcome,
} from './execution-record.mjs';
import { VERIFICATION_EVIDENCE_LIFECYCLE_SCHEMA } from './evidence-lifecycle.mjs';

const EXECUTION_SCHEMA = 'buildr.verification-execution/v1';
const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const TERMINAL_CHECK_STATUSES = new Set(['passed', 'failed']);

function blocked(code, message, details = undefined) {
  return taskExecutionRecordError(code, message, 409, details, '保留open record与transient evidence；修正matching summary后重试，或请求用户明确授权unknown outcome。');
}

function ownedSummaryBoundary(summaryPath, temporaryRoot = os.tmpdir()) {
  const resolvedSummary = path.resolve(summaryPath);
  const directory = path.dirname(resolvedSummary);
  const root = path.resolve(temporaryRoot);
  const relative = path.relative(root, directory);
  const safe = Boolean(relative)
    && !relative.startsWith('..')
    && !path.isAbsolute(relative)
    && path.basename(directory).startsWith('buildr-verification-run-')
    && path.basename(resolvedSummary) === 'summary.json';
  if (!safe) throw blocked('task_execution_record_recovery_boundary_invalid', 'Recovery summary不属于Buildr Verification owned transient boundary。');
  if (!fs.existsSync(directory) || !fs.existsSync(resolvedSummary)) throw blocked('task_execution_record_recovery_summary_missing', 'Recovery summary不存在。');
  const directoryStat = fs.lstatSync(directory);
  const summaryStat = fs.lstatSync(resolvedSummary);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || !summaryStat.isFile() || summaryStat.isSymbolicLink()) {
    throw blocked('task_execution_record_recovery_boundary_invalid', 'Recovery summary boundary不是受支持的普通目录与文件。');
  }
  return { directory, summaryPath: resolvedSummary };
}

function parseSummary(summaryPath) {
  try { return JSON.parse(fs.readFileSync(summaryPath, 'utf8')); }
  catch { throw blocked('task_execution_record_recovery_summary_invalid', 'Recovery summary不是合法JSON。'); }
}

function same(left, right, field) {
  if (left !== right) throw blocked('task_execution_record_recovery_identity_mismatch', `Recovery summary的${field}与record不一致。`, { field });
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function recoveryContext(summary) {
  return {
    taskId: summary.environment.taskId,
    scopes: (summary.environment.scopes || []).map((scope) => ({
      selector: scope.selector,
      runtime: { identity: null },
      cli: { identity: scope.sourceIdentity || null },
      preparation: { identity: null },
      projection: { identity: scope.projectionIdentity || null },
    })),
  };
}

export function loadVerificationExecutionRecordRecovery(summaryPath, record, options = {}) {
  if (record.owner !== VERIFICATION_EXECUTION_RECORD_OWNER || record.kind !== VERIFICATION_EXECUTION_RECORD_KIND || record.producer !== VERIFICATION_EXECUTION_RECORD_PRODUCER) {
    throw taskExecutionRecordError('task_execution_record_recovery_owner_unsupported', 'recover只支持registered Verification producer的Execution Record。', 409, { owner: record.owner, kind: record.kind, producer: record.producer });
  }
  const boundary = ownedSummaryBoundary(summaryPath, options.temporaryRoot);
  const summary = parseSummary(boundary.summaryPath);
  if (summary.schemaVersion !== EXECUTION_SCHEMA) throw blocked('task_execution_record_recovery_summary_schema_invalid', `Recovery summary必须是${EXECUTION_SCHEMA}。`);
  const lifecycle = summary.evidenceLifecycle;
  if (lifecycle?.schemaVersion !== VERIFICATION_EVIDENCE_LIFECYCLE_SCHEMA
    || lifecycle.evidenceRetention !== 'transient'
    || lifecycle.cleanupStatus !== 'retained'
    || path.resolve(lifecycle.cleanupReference || '') !== boundary.directory
    || path.resolve(lifecycle.summaryPath || '') !== boundary.summaryPath) {
    throw blocked('task_execution_record_recovery_lifecycle_invalid', 'Recovery summary未绑定matching retained transient lifecycle。');
  }
  same(summary.environment?.taskId, record.taskId, 'taskId');
  same(summary.runId || summary.run?.id, record.runIdentity, 'runIdentity');
  same(lifecycle.runId, record.runIdentity, 'evidence runIdentity');
  same(summary.invocationIdentity, record.invocationIdentity, 'invocationIdentity');
  same(summary.target?.identity, record.targetIdentity, 'targetIdentity');
  same(summary.executionRecord?.recordId, record.recordId, 'recordId');
  if (summary.executionRecord?.lifecycleStatus !== 'open') throw blocked('task_execution_record_recovery_summary_not_open', 'Recovery summary没有证明seal前的open record状态。');
  if (!DIGEST.test(summary.executionIdentity || '')) throw blocked('task_execution_record_recovery_execution_identity_invalid', 'Recovery summary缺少完整execution identity。');
  if (typeof summary.project?.code !== 'string' || typeof summary.project?.root !== 'string'
    || typeof summary.declaration?.path !== 'string' || !DIGEST.test(summary.declaration?.identity || '')) {
    throw blocked('task_execution_record_recovery_context_invalid', 'Recovery summary缺少完整Project/declaration facts。');
  }
  if (!validTimestamp(summary.startedAt) || !validTimestamp(summary.finishedAt) || Date.parse(summary.finishedAt) < Date.parse(summary.startedAt)) {
    throw blocked('task_execution_record_recovery_timing_invalid', 'Recovery summary缺少合法startedAt/finishedAt终态时间。');
  }
  if (!Number.isSafeInteger(summary.durationMs) || summary.durationMs < 0) throw blocked('task_execution_record_recovery_timing_invalid', 'Recovery summary缺少合法durationMs。');
  if (!Array.isArray(summary.checks) || !summary.checks.length || summary.checks.some((check) => !TERMINAL_CHECK_STATUSES.has(check.status))) {
    throw blocked('task_execution_record_recovery_checks_incomplete', 'Recovery summary没有完整terminal capability checks。');
  }
  const selected = summary.selectedCapabilities;
  if (!Array.isArray(selected) || selected.length !== summary.checks.length
    || selected.some((capability, index) => capability?.id !== summary.checks[index]?.id)) {
    throw blocked('task_execution_record_recovery_checks_mismatch', 'Recovery summary的selected capabilities与checks不一致。');
  }
  const passed = summary.target?.stable === true && summary.checks.every((check) => check.status === 'passed');
  const outcome = verificationExecutionRecordOutcome({ passed, checks: summary.checks });
  same(summary.executionRecord?.outcome, outcome, 'outcome');
  if (path.resolve(summary.evidenceReference || '') !== boundary.summaryPath) throw blocked('task_execution_record_recovery_lifecycle_invalid', 'Recovery summary的evidence reference与owned summary不一致。');

  const files = createVerificationExecutionRecordFiles({
    runId: record.runIdentity,
    executionIdentity: summary.executionIdentity,
    invocationIdentity: record.invocationIdentity,
    context: recoveryContext(summary),
    targetRoot: summary.project.root,
    targetIdentity: record.targetIdentity,
    targetStable: summary.target.stable,
    targetDrift: summary.target.drift || null,
    before: null,
    after: summary.target.observation || null,
    projectCode: summary.project.code,
    declarationPath: summary.declaration.path,
    declarationIdentity: summary.declaration.identity,
    selectedCapabilities: selected,
    authorizedCapabilities: summary.authorization?.capabilities || [],
    authorizedResources: summary.authorization?.resources || [],
    checks: summary.checks,
    outcome,
    durationMs: summary.durationMs,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
  });
  return { summary, outcome, files, boundary };
}

export function createAuthorizedUnknownExecutionRecordFiles(record, acknowledgedAt = new Date().toISOString()) {
  const summary = {
    schemaVersion: 'buildr.verification-execution-record-recovery-summary/v1',
    recovery: 'authorized-unknown',
    recordId: record.recordId,
    taskId: record.taskId,
    runId: record.runIdentity,
    invocationIdentity: record.invocationIdentity,
    targetIdentity: record.targetIdentity,
    outcome: 'unknown',
    acknowledgedAt,
  };
  return [
    { name: 'summary.json', content: summary },
    { name: 'stdout.txt', content: '' },
    { name: 'stderr.txt', content: '' },
    { name: 'timeline.json', content: { schemaVersion: 'buildr.verification-execution-record-recovery-timeline/v1', runId: record.runIdentity, events: [{ phase: 'recovery', status: 'unknown-acknowledged', at: acknowledgedAt }] } },
    { name: 'diagnostics.json', content: { schemaVersion: 'buildr.verification-execution-record-recovery-diagnostics/v1', runId: record.runIdentity, failures: [], diagnostic: { code: 'verification.execution_outcome_unknown', message: '原Verification producer终态不可证明；用户已授权保留unknown outcome并解除invocation阻塞。' } } },
  ];
}
