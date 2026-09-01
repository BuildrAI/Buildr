import crypto from 'node:crypto';
import { normalizeTaskVerificationReport, taskVerificationError } from '../domain/task-verification.ts';

const locator = (taskId: string) => `workspace-sqlite:task-verification/${taskId}`;
const digest = (value: string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

function decode(serialized: string, taskId: string) { return normalizeTaskVerificationReport(JSON.parse(serialized), { expectedTaskId: taskId }); }
export function renderTaskVerificationReport(report: any) { return JSON.stringify(normalizeTaskVerificationReport(report, { expectedTaskId: report?.taskId })); }

export function registerTaskVerificationRepository(runtime: any) {
  function taskVerificationReportPath(targetRoot: string, taskId: string) { runtime.assertCanonicalTaskWorkspace(targetRoot); return locator(taskId); }
  function readTaskVerificationReportPersistence(targetRoot: string, taskId: string, { optional = true } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId); let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.present ? opened.database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_verification_current WHERE task_id = ?').get(taskId) : null;
      if (!row) { if (optional) return null; throw taskVerificationError('task_verification_not_found', `Task Verification Report 不存在：${taskId}。`, 404); }
      const report = decode(row.result_json, taskId);
      if (row.target_identity !== report.content.identity || row.outcome !== report.conclusion.outcome || row.updated_at !== report.completedAt) throw taskVerificationError('task_verification_query_fields_inconsistent', 'Task Verification Report 查询字段不一致。', 409, { taskId });
      return { root: task.root, file: locator(taskId), report, reportDigest: digest(row.result_json), observedAt: row.updated_at };
    } catch (error: any) { if (error.taskVerificationBusiness || error.structuredStoreBusiness) throw error; throw taskVerificationError('task_verification_read_failed', `Task Verification Report 读取失败：${error.message}`, 500, { taskId }); }
    finally { try { opened?.database?.close(); } catch {} }
  }
  function writeTaskVerificationReportPersistence(targetRoot: string, value: any) {
    const report = normalizeTaskVerificationReport(value); const task = runtime.readTaskRecordPersistence(targetRoot, report.taskId); let opened;
    try {
      const serialized = (runtime.taskVerificationSerialize || renderTaskVerificationReport)(report);
      decode(serialized, report.taskId);
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true }); opened.database.exec('BEGIN IMMEDIATE');
      const existing = opened.database.prepare('SELECT 1 FROM task_verification_current WHERE task_id = ?').get(report.taskId);
      opened.database.prepare(`INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET result_json = excluded.result_json, target_identity = excluded.target_identity, outcome = excluded.outcome, updated_at = excluded.updated_at`).run(report.taskId, serialized, report.content.identity, report.conclusion.outcome, report.completedAt);
      const row = opened.database.prepare('SELECT result_json FROM task_verification_current WHERE task_id = ?').get(report.taskId);
      if (!row || row.result_json !== serialized) throw new Error('post-read mismatch');
      opened.database.exec('COMMIT');
      return { root: task.root, file: locator(report.taskId), report, reportDigest: digest(serialized), observedAt: report.completedAt, created: !existing };
    } catch (error: any) { try { opened?.database?.exec('ROLLBACK'); } catch {} if (error.taskVerificationBusiness || error.structuredStoreBusiness) throw error; throw taskVerificationError('task_verification_write_failed', `Task Verification Report 写入失败：${error.message}`, 500, { taskId: report.taskId, rollback: { status: 'restored' } }); }
    finally { try { opened?.database?.close(); } catch {} }
  }
  Object.assign(runtime, { taskVerificationReportPath, readTaskVerificationReportPersistence, writeTaskVerificationReportPersistence, renderTaskVerificationReport });
  return runtime;
}
