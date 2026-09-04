import crypto from 'node:crypto';
import { transactionDatabase, type TransactionContext } from '../../infrastructure/sqlite/transaction.ts';
import { normalizeTaskVerificationReport, taskVerificationError, type TaskVerificationReport } from '../domain/task-verification.ts';
const locator = (taskId: string) => `workspace-sqlite:task-verification/${taskId}`;
const digest = (value: string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

type SqlRow = Record<string, unknown>;
type SqlStatement = { get(...parameters: unknown[]): SqlRow | undefined; run(...parameters: unknown[]): unknown };
type SqlDatabase = { prepare(sql: string): SqlStatement; exec(sql: string): unknown; close(): void };
type StructuredStore = { present: boolean; database: SqlDatabase };
type VerificationPersistence = {
  root: string; file: string; report: TaskVerificationReport; reportDigest: string;
  observedAt: string; created?: boolean;
};
export type TaskVerificationRepositoryRuntime = {
  assertCanonicalStructuredWorkspace(targetRoot: string): string;
  openWorkspaceStructuredStore(targetRoot: string, options: { writable: boolean }): StructuredStore;
  taskVerificationSerialize?: (report: TaskVerificationReport) => string;
  taskVerificationReportPath?: (targetRoot: string, taskId: string) => string;
  readTaskVerificationReportPersistence?: (targetRoot: string, taskId: string, options?: { optional?: boolean }) => VerificationPersistence | null;
  writeTaskVerificationReportPersistence?: (targetRoot: string, report: TaskVerificationReport, options: { expectedReportDigest: string }, transaction: TransactionContext) => VerificationPersistence & { created: boolean };
  renderTaskVerificationReport?: typeof renderTaskVerificationReport;
};

function errorFields(error: unknown): { message: string; code?: string; taskVerificationBusiness?: boolean; structuredStoreBusiness?: boolean } {
  if (!(error instanceof Error)) return { message: String(error) };
  return { message: error.message, ...Object.fromEntries(Object.entries(error)) };
}
function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Task Verification query field is invalid: ${field}`);
  return value;
}
function decode(serialized: string, taskId: string): TaskVerificationReport { return normalizeTaskVerificationReport(JSON.parse(serialized), { expectedTaskId: taskId }); }
export function renderTaskVerificationReport(report: TaskVerificationReport): string { return JSON.stringify(normalizeTaskVerificationReport(report, { expectedTaskId: report.taskId })); }

export function registerTaskVerificationRepository<T extends TaskVerificationRepositoryRuntime>(runtime: T): T & Required<Pick<TaskVerificationRepositoryRuntime, 'taskVerificationReportPath' | 'readTaskVerificationReportPersistence' | 'writeTaskVerificationReportPersistence' | 'renderTaskVerificationReport'>> {
  function taskVerificationReportPath(targetRoot: string, taskId: string) { runtime.assertCanonicalStructuredWorkspace(targetRoot); return locator(taskId); }
  function readTaskVerificationReportPersistence(targetRoot: string, taskId: string, { optional = true }: { optional?: boolean } = {}): VerificationPersistence | null {
    const root = runtime.assertCanonicalStructuredWorkspace(targetRoot); let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      const row = opened.present ? opened.database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_verification_current WHERE task_id = ?').get(taskId) : null;
      if (!row) { if (optional) return null; throw taskVerificationError('task_verification_not_found', `Task Verification Report 不存在：${taskId}。`, 404); }
      const serialized = stringColumn(row, 'result_json');
      const report = decode(serialized, taskId);
      const observedAt = stringColumn(row, 'updated_at');
      if (stringColumn(row, 'target_identity') !== report.content.identity || stringColumn(row, 'outcome') !== report.conclusion.outcome || observedAt !== report.completedAt) throw taskVerificationError('task_verification_query_fields_inconsistent', 'Task Verification Report 查询字段不一致。', 409, { taskId });
      return { root, file: locator(taskId), report, reportDigest: digest(serialized), observedAt };
    } catch (error: unknown) { const failure = errorFields(error); if (failure.taskVerificationBusiness || failure.structuredStoreBusiness) throw error; throw taskVerificationError('task_verification_read_failed', `Task Verification Report 读取失败：${failure.message}`, 500, { taskId }); }
    finally { try { opened?.database?.close(); } catch {} }
  }
  function writeTaskVerificationReportPersistence(targetRoot: string, value: TaskVerificationReport, { expectedReportDigest }: { expectedReportDigest: string }, transaction: TransactionContext): VerificationPersistence & { created: boolean } {
    const report = normalizeTaskVerificationReport(value); const root = runtime.assertCanonicalStructuredWorkspace(targetRoot);
    let stage = 'serialization';
    try {
      const serialized = (runtime.taskVerificationSerialize || renderTaskVerificationReport)(report);
      decode(serialized, report.taskId);
      const database = transactionDatabase(transaction); stage = 'current-read';
      const existing = database.prepare('SELECT result_json FROM task_verification_current WHERE task_id = ?').get(report.taskId);
      if (existing) decode(stringColumn(existing, 'result_json'), report.taskId);
      const currentReportDigest = existing ? digest(stringColumn(existing, 'result_json')) : 'absent';
      if (expectedReportDigest !== currentReportDigest) throw taskVerificationError('task_verification_current_conflict', 'Task Verification current 已变化，拒绝覆盖。', 409, { taskId: report.taskId, expectedReportDigest, currentReportDigest }, '重新inspect真实报告和当前内容后决定是否重做或替换。');
      stage = 'mutation';
      database.prepare(`INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET result_json = excluded.result_json, target_identity = excluded.target_identity, outcome = excluded.outcome, updated_at = excluded.updated_at`).run(report.taskId, serialized, report.content.identity, report.conclusion.outcome, report.completedAt);
      stage = 'post-read';
      const row = database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_verification_current WHERE task_id = ?').get(report.taskId);
      if (!row) throw new Error('post-read missing');
      const writtenSerialized = stringColumn(row, 'result_json');
      const written = decode(writtenSerialized, report.taskId);
      if (writtenSerialized !== serialized || stringColumn(row, 'target_identity') !== written.content.identity || stringColumn(row, 'outcome') !== written.conclusion.outcome || stringColumn(row, 'updated_at') !== written.completedAt) throw new Error('post-read mismatch');
      return { root, file: locator(report.taskId), report: written, reportDigest: digest(writtenSerialized), observedAt: written.completedAt, created: !existing };
    } catch (error: unknown) { const failure = errorFields(error); if (failure.taskVerificationBusiness || failure.structuredStoreBusiness) throw error; throw taskVerificationError('task_verification_write_failed', `Task Verification Report 写入失败：${failure.message}`, 500, { taskId: report.taskId, stage, rollback: { status: 'restored' } }); }
  }
  return Object.assign(runtime, { taskVerificationReportPath, readTaskVerificationReportPersistence, writeTaskVerificationReportPersistence, renderTaskVerificationReport });
}
