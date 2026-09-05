import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSourceRoot } from '../../workspace/module.ts';
import { taskRecordEffectiveProjectCodes } from './task-validation.ts';
import { normalizeTaskVerificationCheck, normalizeTaskVerificationGap, normalizeTaskVerificationReport, taskVerificationError, type TaskVerificationCheck, type TaskVerificationDeclarationReference, type TaskVerificationGap, type TaskVerificationReport } from '../domain/task-verification.ts';
import type { TaskPersistence } from './task-dto.ts';
import type { TaskVerificationRepositoryRuntime } from '../persistence/task-verification-repository.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import type { TransactionContext } from '../../infrastructure/sqlite/transaction.ts';

const digest = (value: Buffer | string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
type ProjectSource = Parameters<typeof resolveSourceRoot>[1];
type ProjectVerificationMap = { testing: Array<{ id: string; scope?: { services?: string[] } }> };
type ObservedDeclaration = TaskVerificationDeclarationReference & { declaration: ProjectVerificationMap | null };
type VerificationApplicability = {
  status: 'current' | 'stale' | 'unknown'; content: { status: 'current' | 'stale' | 'unknown' };
  declarations: { status: 'current' | 'stale' }; reasons: Array<{ code: string; message: string }>;
};
type VerificationSlot = {
  path: string; present: boolean; report: TaskVerificationReport | null; reportDigest: string | null;
  applicability: VerificationApplicability | null; observedAt?: string;
};
export type VerificationApplicationRuntime = Omit<TaskVerificationRepositoryRuntime, 'readTask'> & {
  readTask(targetRoot: string, taskId: string): TaskPersistence;
  runWorkspaceTransaction<T>(targetRoot: string, action: (context: TransactionContext) => T): T;
  readProjectRegistryPersistence(targetRoot: string): { registry: { projects: Record<string, { source: ProjectSource; workspaceId?: string }> } };
  readServiceRegistryPersistence?(targetRoot: string, project: { source: ProjectSource; workspaceId?: string }, workspaceId?: string): { registry?: { services?: Record<string, unknown> } };
  parseProjectVerification(content: string, source: string): unknown;
  validateProjectVerification(declaration: unknown, input: { projectCode: string; services: string[] }): string[];
  normalizeProjectVerification(declaration: unknown, input: { projectCode: string; services: string[] }): ProjectVerificationMap;
  prepareTask(targetRoot: string, taskId: string): TaskPersistence;
  inspectTaskVerification?: (targetRoot: string, taskId: string, input?: unknown) => unknown;
  inspectTaskVerificationView?: (targetRoot: string, taskId: string) => unknown;
  recordTaskVerification?: (targetRoot: string, taskId: string, input: unknown) => unknown;
};

function assertInput(input: unknown, allowed: ReadonlySet<string>, label: string): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskVerificationError('task_verification_input_invalid', `${label} 必须是对象。`);
  for (const field of Object.keys(input)) if (!allowed.has(field)) throw taskVerificationError('task_verification_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
}
function relative(root: string, file: string) { return path.relative(root, file).split(path.sep).join('/'); }
function portableDiagnostic(root: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(root).join('<workspace>').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function registerTaskVerificationApplication<T extends VerificationApplicationRuntime>(runtime: T): T {
  function observeDeclarations(task: TaskPersistence): ObservedDeclaration[] {
    const projects = taskRecordEffectiveProjectCodes(task.record); if (!projects.length) return [];
    const registry = runtime.readProjectRegistryPersistence(task.root).registry.projects;
    return projects.map((projectCode: string) => {
      const project = registry[projectCode];
      if (!project) throw taskVerificationError('task_verification_project_not_found', `Project 未登记：${projectCode}。`, 409, { project: projectCode });
      const projectRoot = resolveSourceRoot(task.root, project.source); const file = path.join(projectRoot, 'verification.yml');
      if (!fs.existsSync(file)) return { project: projectCode, path: relative(task.root, file), identity: 'absent', status: 'absent', summary: 'Project 测试地图不存在。', declaration: null };
      const content = fs.readFileSync(file); let declaration;
      try { declaration = runtime.parseProjectVerification(content.toString('utf8'), relative(task.root, file)); }
      catch (error) { return { project: projectCode, path: relative(task.root, file), identity: digest(content), status: 'invalid', summary: portableDiagnostic(task.root, error), declaration: null }; }
      const services = Object.keys(runtime.readServiceRegistryPersistence?.(task.root, project, project.workspaceId)?.registry?.services || {});
      const errors = runtime.validateProjectVerification(declaration, { projectCode, services });
      if (errors.length) return { project: projectCode, path: relative(task.root, file), identity: digest(content), status: 'invalid', summary: errors.join('; ').slice(0, 500), declaration: null };
      return { project: projectCode, path: relative(task.root, file), identity: digest(content), status: 'ready', declaration: runtime.normalizeProjectVerification(declaration, { projectCode, services }) };
    });
  }
  function applicability(report: TaskVerificationReport, contentIdentity: string | undefined, declarations: ObservedDeclaration[]): VerificationApplicability {
    const reasons: Array<{ code: string; message: string }> = [];
    const contentStatus = contentIdentity === undefined ? 'unknown' : report.content.identity === contentIdentity ? 'current' : 'stale';
    if (contentStatus === 'stale') reasons.push({ code: 'content-version-changed', message: `${report.content.identity} -> ${contentIdentity}` });
    const expected = new Map(report.declarations.map((item) => [item.project, item])); const actual = new Map(declarations.map((item) => [item.project, item]));
    for (const [project, declaration] of expected) { const observed = actual.get(project); if (!observed || observed.path !== declaration.path || observed.identity !== declaration.identity || observed.status !== declaration.status) reasons.push({ code: 'declaration-changed', message: `Project ${project} 的测试地图已变化。` }); }
    for (const project of actual.keys()) if (!expected.has(project)) reasons.push({ code: 'project-scope-added', message: `Task 新增 Project：${project}` });
    const declarationStatus: 'current' | 'stale' = reasons.some((item) => ['declaration-changed', 'project-scope-added'].includes(item.code)) ? 'stale' : 'current';
    return { status: contentStatus === 'stale' || declarationStatus === 'stale' ? 'stale' : contentStatus === 'current' ? 'current' : 'unknown', content: { status: contentStatus }, declarations: { status: declarationStatus }, reasons };
  }
  function declarationReferences(declarations: ObservedDeclaration[]): TaskVerificationDeclarationReference[] {
    return declarations.map(({ project, path: declarationPath, identity, status, summary }) => ({ project, path: declarationPath, identity, status, ...(summary ? { summary } : {}) }));
  }
  function normalizeCallerChecks(value: unknown) {
    if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', 'checks 必须是数组。');
    return value.map((item: unknown, index: number) => {
      if (item && typeof item === 'object' && !Array.isArray(item) && Object.hasOwn(item, 'mapStatus')) throw taskVerificationError('task_verification_field_forbidden', `checks[${index}].mapStatus 由 Application 派生，caller 不能提交。`, 400, { field: `checks[${index}].mapStatus` });
      return normalizeTaskVerificationCheck(item, index);
    });
  }
  function normalizeCallerGaps(value: unknown) {
    if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', 'gaps 必须是数组。');
    return value.map(normalizeTaskVerificationGap);
  }
  function bindChecks(task: TaskPersistence, declarations: ObservedDeclaration[], checks: TaskVerificationCheck[]): TaskVerificationCheck[] {
    const effectiveProjects = new Set(taskRecordEffectiveProjectCodes(task.record));
    const projectScope = new Set([...task.record.scope.projects, ...task.record.changes.map((item) => item.project)]);
    const serviceScope = new Set(task.record.scope.services.map((item) => `${item.project}/${item.service}`));
    const declarationByProject = new Map(declarations.map((item) => [item.project, item]));
    return checks.map((check, index) => {
      if (!effectiveProjects.has(check.project)) throw taskVerificationError('task_verification_check_scope_mismatch', `checks[${index}].project 不属于当前 Task：${check.project}。`, 409, { field: `checks[${index}].project`, project: check.project });
      if (check.service && !projectScope.has(check.project) && !serviceScope.has(`${check.project}/${check.service}`)) throw taskVerificationError('task_verification_check_scope_mismatch', `checks[${index}].service 不属于当前 Task：${check.project}/${check.service}。`, 409, { field: `checks[${index}].service`, project: check.project, service: check.service });
      const observed = declarationByProject.get(check.project);
      if (!observed || observed.status !== 'ready' || !observed.declaration) return { ...check, mapStatus: 'map-unavailable' };
      const testing = observed.declaration.testing.find((item) => item.id === check.testing);
      if (!testing) throw taskVerificationError('task_verification_testing_not_declared', `Project ${check.project} 的测试地图未声明 ${check.testing}。`, 409, { field: `checks[${index}].testing`, project: check.project, testing: check.testing });
      const familyServices = new Set(testing.scope?.services || []);
      if (check.service && familyServices.size && !familyServices.has(check.service)) throw taskVerificationError('task_verification_testing_scope_mismatch', `${check.project}/${check.testing} 不覆盖 Service ${check.service}。`, 409, { field: `checks[${index}].service`, project: check.project, service: check.service, testing: check.testing });
      if (!check.service && !projectScope.has(check.project) && familyServices.size) {
        const related = [...familyServices].some((service) => serviceScope.has(`${check.project}/${service}`));
        if (!related) throw taskVerificationError('task_verification_testing_scope_mismatch', `${check.project}/${check.testing} 不覆盖当前 Task 的 Service scope。`, 409, { field: `checks[${index}].testing`, project: check.project, testing: check.testing });
      }
      return { ...check, mapStatus: 'declared' };
    });
  }
  function appendDeclarationGaps(declarations: ObservedDeclaration[], gaps: TaskVerificationGap[]): TaskVerificationGap[] {
    const result = [...gaps];
    for (const declaration of declarations.filter((item) => item.status !== 'ready')) {
      if (result.some((gap) => gap.project === declaration.project && gap.testing === 'project-testing-map')) continue;
      result.push({ testing: 'project-testing-map', project: declaration.project, reason: declaration.status === 'absent' ? 'Project 测试地图不存在。' : `Project 测试地图无效：${declaration.summary}` });
    }
    return result;
  }
  function slot(task: TaskPersistence, contentIdentity: string | undefined): VerificationSlot {
    if (!runtime.readTaskVerificationReportPersistence || !runtime.taskVerificationReportPath) throw new Error('Task Verification Repository ports are unavailable.');
    const persisted = runtime.readTaskVerificationReportPersistence(task.root, task.record.taskId, { optional: true });
    if (!persisted) return { path: runtime.taskVerificationReportPath(task.root, task.record.taskId), present: false, report: null, reportDigest: null, applicability: null };
    const value = applicability(persisted.report, contentIdentity, observeDeclarations(task));
    return { path: persisted.file, present: true, report: persisted.report, reportDigest: persisted.reportDigest, applicability: value, observedAt: persisted.observedAt };
  }
  function result(operation: 'inspect' | 'record', status: 'inspected' | 'recorded', taskId: string, reportSlot: VerificationSlot, effects: Array<{ type: string; path: string }> = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult, { operation, status, taskId, slot: reportSlot, diagnostic: null, effects, nextActions: [] });
  }
  function inspectTaskVerification(targetRoot: string, taskId: string, input: unknown = {}) {
    assertInput(input, new Set(['contentIdentity']), 'Task Verification inspect'); const task = runtime.readTask(targetRoot, taskId);
    const contentIdentity = typeof input.contentIdentity === 'string' ? input.contentIdentity : undefined;
    return result('inspect', 'inspected', taskId, slot(task, contentIdentity));
  }
  function recordTaskVerification(targetRoot: string, taskId: string, input: unknown) {
    assertInput(input, new Set(['contentIdentity', 'contentSummary', 'checks', 'gaps', 'conclusion', 'expectedReportDigest']), 'Task Verification record');
    const task = runtime.prepareTask(targetRoot, taskId);
    if (task.record.status !== 'active') throw taskVerificationError('task_verification_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能记录新的验证报告。`, 409, { status: task.record.status });
    const observedDeclarations = observeDeclarations(task);
    const checks = bindChecks(task, observedDeclarations, normalizeCallerChecks(input.checks));
    const gaps = appendDeclarationGaps(observedDeclarations, normalizeCallerGaps(input.gaps));
    const report = normalizeTaskVerificationReport({ schemaVersion: 'buildr.task-verification-report/v1', taskId, scope: task.record.scope, content: { identity: input.contentIdentity, summary: input.contentSummary }, declarations: declarationReferences(observedDeclarations), checks, gaps, conclusion: input.conclusion, completedAt: new Date().toISOString() }, { expectedTaskId: taskId });
    const expectedReportDigest = typeof input.expectedReportDigest === 'string' ? input.expectedReportDigest.trim() : '';
    if (expectedReportDigest !== 'absent' && !/^sha256-[a-f0-9]{64}$/u.test(expectedReportDigest)) throw taskVerificationError('task_verification_expected_digest_invalid', 'expectedReportDigest 必须是 absent 或 sha256 digest。', 400, { field: 'expectedReportDigest' });
    if (!runtime.writeTaskVerificationReportPersistence) throw new Error('Task Verification write port is unavailable.');
    let written;
    try {
      written = runtime.runWorkspaceTransaction(task.root, (transaction) => runtime.writeTaskVerificationReportPersistence!(task.root, report, { expectedReportDigest }, transaction));
    } catch (error) {
      if (error instanceof Error && 'taskVerificationBusiness' in error && error.taskVerificationBusiness === true) throw error;
      throw taskVerificationError('task_verification_write_failed', `Task Verification Report 写入失败：${error instanceof Error ? error.message : String(error)}`, 500, { taskId, stage: 'commit', rollback: { status: 'restored' } });
    }
    return result('record', 'recorded', taskId, slot(task, report.content.identity), [{ type: written.created ? 'created' : 'updated', path: written.file }]);
  }
  const inspectTaskVerificationView = (targetRoot: string, taskId: string) => inspectTaskVerification(targetRoot, taskId);
  return Object.assign(runtime, { inspectTaskVerification, inspectTaskVerificationView, recordTaskVerification });
}
