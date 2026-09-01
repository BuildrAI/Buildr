export const TASK_VERIFICATION_REPORT_SCHEMA = 'buildr.task-verification-report/v1';
export const TASK_VERIFICATION_OUTCOMES = Object.freeze(['passed', 'not-passed', 'incomplete'] as const);

const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/;

export function taskVerificationError(code: string, message: string, status = 400, details: unknown = undefined, nextAction: string | undefined = undefined) {
  const error = new Error(message) as Error & Record<string, unknown>;
  Object.assign(error, { code, status, taskVerificationBusiness: true });
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  return error;
}

function object(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', `${field} 必须是对象。`, 400, { field });
  return value as Record<string, any>;
}

function closed(value: Record<string, any>, allowed: Set<string>, field: string) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw taskVerificationError('task_verification_field_forbidden', `${field ? `${field}.` : ''}${key} 不受支持。`, 400, { field: field ? `${field}.${key}` : key });
}

function text(value: unknown, field: string, portable = false): string {
  if (typeof value !== 'string' || !value.trim()) throw taskVerificationError('task_verification_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  const normalized = value.trim();
  if (portable && ABSOLUTE_PATH.test(normalized)) throw taskVerificationError('task_verification_reference_not_portable', `${field} 不能使用本机绝对路径。`, 400, { field });
  return normalized;
}

function texts(value: unknown, field: string, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum) throw taskVerificationError('task_verification_field_invalid', `${field} 必须是至少 ${minimum} 项的数组。`, 400, { field });
  return value.map((item, index) => text(item, `${field}[${index}]`, true));
}

function timestamp(value: unknown, field: string): string {
  const normalized = text(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw taskVerificationError('task_verification_timestamp_invalid', `${field} 必须是 ISO 时间。`, 400, { field });
  return normalized;
}

function normalizeDeclaration(value: unknown, index: number) {
  const field = `declarations[${index}]`; const item = object(value, field);
  closed(item, new Set(['project', 'path', 'identity', 'status', 'summary']), field);
  const status = item.status ?? 'ready';
  if (!['ready', 'absent', 'invalid'].includes(status)) throw taskVerificationError('task_verification_declaration_status_invalid', `${field}.status 不受支持。`, 400, { field: `${field}.status` });
  return {
    project: text(item.project, `${field}.project`, true), path: text(item.path, `${field}.path`, true), identity: text(item.identity, `${field}.identity`), status,
    ...(item.summary == null ? {} : { summary: text(item.summary, `${field}.summary`, true) }),
  };
}

function normalizeScope(value: unknown) {
  const scope = object(value, 'scope'); closed(scope, new Set(['projects', 'services']), 'scope');
  const projects = texts(scope.projects, 'scope.projects').sort((left, right) => left.localeCompare(right));
  if (new Set(projects).size !== projects.length) throw taskVerificationError('task_verification_scope_duplicate', 'scope.projects 不能重复。', 400);
  if (!Array.isArray(scope.services)) throw taskVerificationError('task_verification_field_invalid', 'scope.services 必须是数组。', 400);
  const services = scope.services.map((value: unknown, index: number) => {
    const field = `scope.services[${index}]`; const item = object(value, field); closed(item, new Set(['project', 'service']), field);
    return { project: text(item.project, `${field}.project`, true), service: text(item.service, `${field}.service`, true) };
  }).sort((left: any, right: any) => `${left.project}/${left.service}`.localeCompare(`${right.project}/${right.service}`));
  if (new Set(services.map((item: any) => `${item.project}/${item.service}`)).size !== services.length) throw taskVerificationError('task_verification_scope_duplicate', 'scope.services 不能重复。', 400);
  return { projects, services };
}

export function normalizeTaskVerificationCheck(value: unknown, index: number) {
  const field = `checks[${index}]`; const item = object(value, field);
  closed(item, new Set(['id', 'project', 'service', 'testing', 'selection', 'targets', 'source', 'outcome', 'summary', 'durationMs', 'mapStatus']), field);
  if (!['focus', 'task-related', 'full', 'legacy'].includes(item.selection)) throw taskVerificationError('task_verification_selection_invalid', `${field}.selection 不受支持。`, 400, { field: `${field}.selection` });
  if (!['command', 'agent', 'legacy'].includes(item.source)) throw taskVerificationError('task_verification_source_invalid', `${field}.source 不受支持。`, 400, { field: `${field}.source` });
  if (!['passed', 'failed'].includes(item.outcome)) throw taskVerificationError('task_verification_check_outcome_invalid', `${field}.outcome 必须是 passed 或 failed。`, 400, { field: `${field}.outcome` });
  const mapStatus = item.mapStatus ?? 'declared';
  if (!['declared', 'map-unavailable'].includes(mapStatus)) throw taskVerificationError('task_verification_check_map_status_invalid', `${field}.mapStatus 不受支持。`, 400, { field: `${field}.mapStatus` });
  if (item.durationMs !== undefined && (!Number.isInteger(item.durationMs) || item.durationMs < 0)) throw taskVerificationError('task_verification_duration_invalid', `${field}.durationMs 必须是非负整数。`, 400, { field: `${field}.durationMs` });
  return {
    id: text(item.id, `${field}.id`, true), project: text(item.project, `${field}.project`, true),
    ...(item.service == null ? {} : { service: text(item.service, `${field}.service`, true) }),
    testing: text(item.testing, `${field}.testing`, true), selection: item.selection,
    targets: texts(item.targets, `${field}.targets`, 1), source: item.source, outcome: item.outcome,
    summary: text(item.summary, `${field}.summary`, true), mapStatus,
    ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
  };
}

export function normalizeTaskVerificationGap(value: unknown, index: number) {
  const field = `gaps[${index}]`; const item = object(value, field);
  closed(item, new Set(['testing', 'reason', 'project', 'service']), field);
  return {
    testing: text(item.testing, `${field}.testing`, true),
    reason: text(item.reason, `${field}.reason`, true),
    ...(item.project == null ? {} : { project: text(item.project, `${field}.project`, true) }),
    ...(item.service == null ? {} : { service: text(item.service, `${field}.service`, true) }),
  };
}

export function normalizeTaskVerificationReport(value: unknown, { expectedTaskId = null }: { expectedTaskId?: string | null } = {}) {
  const report = object(value, 'Task Verification Report');
  closed(report, new Set(['schemaVersion', 'taskId', 'scope', 'content', 'declarations', 'checks', 'gaps', 'conclusion', 'completedAt']), '');
  if (report.schemaVersion !== TASK_VERIFICATION_REPORT_SCHEMA) throw taskVerificationError('task_verification_schema_unsupported', `schemaVersion 必须是 ${TASK_VERIFICATION_REPORT_SCHEMA}。`, 409);
  const taskId = text(report.taskId, 'taskId');
  if (expectedTaskId && taskId !== expectedTaskId) throw taskVerificationError('task_verification_task_identity_mismatch', `Task ID 不匹配：${expectedTaskId} != ${taskId}。`, 409);
  const content = object(report.content, 'content'); closed(content, new Set(['identity', 'summary']), 'content');
  const scope = normalizeScope(report.scope);
  const declarations = Array.isArray(report.declarations) ? report.declarations.map(normalizeDeclaration) : (() => { throw taskVerificationError('task_verification_field_invalid', 'declarations 必须是数组。'); })();
  const checks = Array.isArray(report.checks) ? report.checks.map(normalizeTaskVerificationCheck) : (() => { throw taskVerificationError('task_verification_field_invalid', 'checks 必须是数组。'); })();
  const gaps = Array.isArray(report.gaps) ? report.gaps.map(normalizeTaskVerificationGap) : (() => { throw taskVerificationError('task_verification_field_invalid', 'gaps 必须是数组。'); })();
  if (!checks.length && !gaps.length) throw taskVerificationError('task_verification_report_empty', '验证报告至少需要一项实际检查或未覆盖说明。', 400);
  const conclusion = object(report.conclusion, 'conclusion'); closed(conclusion, new Set(['outcome', 'summary']), 'conclusion');
  if (!(TASK_VERIFICATION_OUTCOMES as readonly string[]).includes(conclusion.outcome)) throw taskVerificationError('task_verification_conclusion_invalid', 'conclusion.outcome 不受支持。', 400);
  const failed = checks.some((item) => item.outcome === 'failed');
  if (conclusion.outcome === 'passed' && (!checks.length || failed)) throw taskVerificationError('task_verification_conclusion_inconsistent', 'passed 结论至少需要一项实际检查且所有检查均通过。', 400);
  if (conclusion.outcome === 'not-passed' && !failed) throw taskVerificationError('task_verification_conclusion_inconsistent', 'not-passed 结论至少需要一项 failed 检查。', 400);
  if (conclusion.outcome === 'incomplete' && (failed || !gaps.length)) throw taskVerificationError('task_verification_conclusion_inconsistent', 'incomplete 结论不能包含 failed 检查，且至少需要一项未覆盖说明。', 400);
  return {
    schemaVersion: TASK_VERIFICATION_REPORT_SCHEMA, taskId, scope,
    content: { identity: text(content.identity, 'content.identity', true), summary: text(content.summary, 'content.summary', true) },
    declarations, checks, gaps,
    conclusion: { outcome: conclusion.outcome, summary: text(conclusion.summary, 'conclusion.summary', true) },
    completedAt: timestamp(report.completedAt, 'completedAt'),
  };
}
