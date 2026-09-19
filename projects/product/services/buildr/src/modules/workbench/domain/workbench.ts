const text = { type: 'string', minLength: 1, maxLength: 300, pattern: '\\S' };
const href = { ...text, maxLength: 1500 };
const closed = (properties: any, required: string[] = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
export const WORKBENCH_INPUT_DEFINITIONS = {
  WorkbenchPreferencePutRequest: closed({ label: text, href }, []),
  WorkbenchVisitRequest: closed({ kind: { enum: ['task', 'project', 'knowledge', 'article', 'skill', 'service', 'repository'] }, key: text, label: text, href }, ['key', 'label', 'href']),
  WorkbenchQuery: closed({ project: text, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, []),
};
export function workbenchError(code: string, message: string, status = 400): Error { return Object.assign(new Error(message), { code, status }); }
function invalid(field: string): never { throw workbenchError('workbench_input_invalid', `工作台字段无效：${field}。`); }
export function validateWorkbenchInput(name: keyof typeof WORKBENCH_INPUT_DEFINITIONS, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('input');
  const input = value as Record<string, unknown>;
  const definition = WORKBENCH_INPUT_DEFINITIONS[name];
  for (const field of Object.keys(input)) {
    if (!Object.hasOwn(definition.properties, field)) invalid(field);
    const rule = definition.properties[field];
    const text = input[field];
    if (typeof text !== 'string' || !text.trim() || (rule.maxLength && text.length > rule.maxLength) || (rule.enum && !rule.enum.includes(text))) invalid(field);
  }
  for (const field of definition.required) if (!Object.hasOwn(input, field)) invalid(field);
  if (name === 'WorkbenchQuery' && input.date !== undefined) {
    const date = String(input.date);
    const instant = new Date(`${date}T12:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) invalid('date');
  }
}
const kinds = new Set(['pinned-task', 'planned-task', 'followed-project', 'saved-resource', 'recent-resource']);
export function validatePreferenceIdentity(kind: string, key: string): void {
  if (!kinds.has(kind) || !key || key.length > 300 || key !== key.trim() || /[\u0000-\u001f]/.test(key)) throw workbenchError('workbench_preference_invalid', '偏好类型或对象身份无效。');
}
export function validateResourceHref(href: string, workspaceId: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(href); } catch { throw workbenchError('workbench_resource_invalid', '资源地址编码无效。'); }
  if (!href.startsWith(`/workspaces/${workspaceId}/`) || /[\\\u0000-\u0020]/.test(decoded) || decoded.includes('..') || decoded.includes('://') || decoded.includes('//')) throw workbenchError('workbench_resource_forbidden', '资源必须是当前工作空间内的已支持页面。');
  const url = new URL(href, 'http://buildr.local');
  const suffix = url.pathname.slice(`/workspaces/${workspaceId}`.length);
  const code = '[A-Za-z0-9%][A-Za-z0-9%._-]*';
  const route = new RegExp(`^/(?:overview|activity|settings|tasks(?:/${code}(?:/changes/${code}/${code})?)?|projects(?:/${code})?|services(?:/${code}(?:/${code})?)?|repositories(?:/${code})?|skills(?:/${code})?|articles(?:/${code})?|knowledge/(?:project|service)/${code})/?$`);
  if (!route.test(suffix) || ['root', 'target', 'path', 'workspaceId'].some((key) => url.searchParams.has(key))) throw workbenchError('workbench_resource_forbidden', '资源地址不属于可收藏的站内页面。');
  return href;
}
