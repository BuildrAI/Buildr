import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSourceRoot } from '../../workspace/domain/source-root.mjs';
import { taskRecordEffectiveProjectCodes } from '../domain/task-record.ts';
import { normalizeTaskVerificationCheck, normalizeTaskVerificationGap, normalizeTaskVerificationReport, taskVerificationError } from '../domain/task-verification.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';

const digest = (value: Buffer | string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
function assertInput(input: any, allowed: Set<string>, label: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskVerificationError('task_verification_input_invalid', `${label} 必须是对象。`);
  for (const field of Object.keys(input)) if (!allowed.has(field)) throw taskVerificationError('task_verification_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
}
function relative(root: string, file: string) { return path.relative(root, file).split(path.sep).join('/'); }
function portableDiagnostic(root: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(root).join('<workspace>').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function registerTaskVerificationApplication(runtime: any) {
  function observeDeclarations(task: any) {
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
  function applicability(report: any, contentIdentity: string | undefined, declarations: any[]) {
    const reasons: any[] = [];
    const contentStatus = contentIdentity === undefined ? 'unknown' : report.content.identity === contentIdentity ? 'current' : 'stale';
    if (contentStatus === 'stale') reasons.push({ code: 'content-version-changed', message: `${report.content.identity} -> ${contentIdentity}` });
    const expected = new Map(report.declarations.map((item: any) => [item.project, item])); const actual = new Map(declarations.map((item: any) => [item.project, item]));
    for (const [project, declaration] of expected) { const observed: any = actual.get(project); if (!observed || observed.path !== (declaration as any).path || observed.identity !== (declaration as any).identity || observed.status !== ((declaration as any).status ?? 'ready')) reasons.push({ code: 'declaration-changed', message: `Project ${project} 的测试地图已变化。` }); }
    for (const project of actual.keys()) if (!expected.has(project)) reasons.push({ code: 'project-scope-added', message: `Task 新增 Project：${project}` });
    const declarationStatus = reasons.some((item) => ['declaration-changed', 'project-scope-added'].includes(item.code)) ? 'stale' : 'current';
    return { status: contentStatus === 'stale' || declarationStatus === 'stale' ? 'stale' : contentStatus === 'current' ? 'current' : 'unknown', content: { status: contentStatus }, declarations: { status: declarationStatus }, reasons };
  }
  function declarationReferences(declarations: any[]) {
    return declarations.map(({ project, path: declarationPath, identity, status, summary }) => ({ project, path: declarationPath, identity, status, ...(summary ? { summary } : {}) }));
  }
  function normalizeCallerChecks(value: unknown) {
    if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', 'checks 必须是数组。');
    return value.map((item: any, index: number) => {
      if (item && typeof item === 'object' && !Array.isArray(item) && Object.hasOwn(item, 'mapStatus')) throw taskVerificationError('task_verification_field_forbidden', `checks[${index}].mapStatus 由 Application 派生，caller 不能提交。`, 400, { field: `checks[${index}].mapStatus` });
      return normalizeTaskVerificationCheck(item, index);
    });
  }
  function normalizeCallerGaps(value: unknown) {
    if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', 'gaps 必须是数组。');
    return value.map(normalizeTaskVerificationGap);
  }
  function bindChecks(task: any, declarations: any[], checks: any[]) {
    const effectiveProjects = new Set(taskRecordEffectiveProjectCodes(task.record));
    const projectScope = new Set([...(task.record.scope?.projects || []), ...(task.record.changes || []).map((item: any) => item.project)]);
    const serviceScope = new Set((task.record.scope?.services || []).map((item: any) => `${item.project}/${item.service}`));
    const declarationByProject = new Map(declarations.map((item: any) => [item.project, item]));
    return checks.map((check: any, index: number) => {
      if (!effectiveProjects.has(check.project)) throw taskVerificationError('task_verification_check_scope_mismatch', `checks[${index}].project 不属于当前 Task：${check.project}。`, 409, { field: `checks[${index}].project`, project: check.project });
      if (check.service && !projectScope.has(check.project) && !serviceScope.has(`${check.project}/${check.service}`)) throw taskVerificationError('task_verification_check_scope_mismatch', `checks[${index}].service 不属于当前 Task：${check.project}/${check.service}。`, 409, { field: `checks[${index}].service`, project: check.project, service: check.service });
      const observed: any = declarationByProject.get(check.project);
      if (!observed || observed.status !== 'ready') return { ...check, mapStatus: 'map-unavailable' };
      const testing = observed.declaration.testing.find((item: any) => item.id === check.testing);
      if (!testing) throw taskVerificationError('task_verification_testing_not_declared', `Project ${check.project} 的测试地图未声明 ${check.testing}。`, 409, { field: `checks[${index}].testing`, project: check.project, testing: check.testing });
      const familyServices = new Set(testing.scope.services || []);
      if (check.service && familyServices.size && !familyServices.has(check.service)) throw taskVerificationError('task_verification_testing_scope_mismatch', `${check.project}/${check.testing} 不覆盖 Service ${check.service}。`, 409, { field: `checks[${index}].service`, project: check.project, service: check.service, testing: check.testing });
      if (!check.service && !projectScope.has(check.project) && familyServices.size) {
        const related = [...familyServices].some((service) => serviceScope.has(`${check.project}/${service}`));
        if (!related) throw taskVerificationError('task_verification_testing_scope_mismatch', `${check.project}/${check.testing} 不覆盖当前 Task 的 Service scope。`, 409, { field: `checks[${index}].testing`, project: check.project, testing: check.testing });
      }
      return { ...check, mapStatus: 'declared' };
    });
  }
  function appendDeclarationGaps(declarations: any[], gaps: any[]) {
    const result = [...gaps];
    for (const declaration of declarations.filter((item: any) => item.status !== 'ready')) {
      if (result.some((gap: any) => gap.project === declaration.project && gap.testing === 'project-testing-map')) continue;
      result.push({ testing: 'project-testing-map', project: declaration.project, reason: declaration.status === 'absent' ? 'Project 测试地图不存在。' : `Project 测试地图无效：${declaration.summary}` });
    }
    return result;
  }
  function slot(task: any, contentIdentity: string | undefined) {
    const persisted = runtime.readTaskVerificationReportPersistence(task.root, task.record.taskId, { optional: true });
    if (!persisted) return { path: runtime.taskVerificationReportPath(task.root, task.record.taskId), present: false, report: null, reportDigest: null, applicability: null };
    const value = applicability(persisted.report, contentIdentity, observeDeclarations(task));
    return { path: persisted.file, present: true, report: persisted.report, reportDigest: persisted.reportDigest, applicability: value, observedAt: persisted.observedAt };
  }
  function result(operation: string, status: string, taskId: string, reportSlot: any, effects: any[] = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult, { operation, status, taskId, slot: reportSlot, diagnostic: null, effects, nextActions: [] });
  }
  function inspectTaskVerification(targetRoot: string, taskId: string, input: any = {}) {
    assertInput(input, new Set(['contentIdentity']), 'Task Verification inspect'); const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    return result('inspect', 'inspected', taskId, slot(task, input.contentIdentity));
  }
  function recordTaskVerification(targetRoot: string, taskId: string, input: any) {
    assertInput(input, new Set(['contentIdentity', 'contentSummary', 'checks', 'gaps', 'conclusion']), 'Task Verification record');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') throw taskVerificationError('task_verification_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能记录新的验证报告。`, 409, { status: task.record.status });
    const observedDeclarations = observeDeclarations(task);
    const checks = bindChecks(task, observedDeclarations, normalizeCallerChecks(input.checks));
    const gaps = appendDeclarationGaps(observedDeclarations, normalizeCallerGaps(input.gaps));
    const report = normalizeTaskVerificationReport({ schemaVersion: 'buildr.task-verification-report/v1', taskId, scope: task.record.scope, content: { identity: input.contentIdentity, summary: input.contentSummary }, declarations: declarationReferences(observedDeclarations), checks, gaps, conclusion: input.conclusion, completedAt: new Date().toISOString() }, { expectedTaskId: taskId });
    const written = runtime.writeTaskVerificationReportPersistence(task.root, report);
    return result('record', 'recorded', taskId, slot(task, report.content.identity), [{ type: written.created ? 'created' : 'updated', path: written.file }]);
  }
  const inspectTaskVerificationView = (targetRoot: string, taskId: string) => inspectTaskVerification(targetRoot, taskId);
  Object.assign(runtime, { inspectTaskVerification, inspectTaskVerificationView, recordTaskVerification });
  return runtime;
}
