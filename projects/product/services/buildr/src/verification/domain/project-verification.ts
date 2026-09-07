import YAML from 'yaml';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ROOT_FIELDS = new Set(['schemaVersion', 'testing']);
const TESTING_FIELDS = new Set(['id', 'title', 'scope', 'purpose', 'sourcePaths', 'testRoots', 'full', 'selection', 'requirements']);
const SCOPE_FIELDS = new Set(['project', 'services']);
const FULL_FIELDS = new Set(['kind', 'argv', 'cwd', 'instructions']);
const RELATIVE = /^(?!\/|[A-Za-z]:[\\/])(?!.*(?:^|\/)\.\.(?:\/|$)).+$/;

const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function unknown(value: Record<string, any>, allowed: Set<string>, label: string, errors: string[]) { for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${label}.${key} is not supported.`); }
function text(value: unknown, label: string, errors: string[]) { if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string.`); }
function texts(value: unknown, label: string, errors: string[], { minimum = 0, paths = false } = {}) {
  if (!Array.isArray(value) || value.length < minimum) { errors.push(`${label} must be an array with at least ${minimum} item(s).`); return; }
  value.forEach((item, index) => { text(item, `${label}[${index}]`, errors); if (paths && typeof item === 'string' && !RELATIVE.test(item)) errors.push(`${label}[${index}] must be a safe relative path or glob.`); });
}

export function parseProjectVerification(content: string, label = 'verification.yml') { try { return YAML.parse(content); } catch (error: any) { const failure = new Error(`${label} cannot be parsed: ${error.message}`) as Error & Record<string, unknown>; failure.code = 'verification.declaration_invalid'; throw failure; } }

export function validateProjectVerification(value: any, context: { projectCode?: string; services?: string[] } = {}) {
  const errors: string[] = []; if (!object(value)) return ['verification.yml must be a YAML mapping.']; unknown(value, ROOT_FIELDS, 'verification', errors);
  if (value.schemaVersion !== 'buildr.project-verification/v4') errors.push('verification.schemaVersion must be buildr.project-verification/v4.');
  if (!Array.isArray(value.testing)) errors.push('verification.testing must be an array.');
  const ids = new Set<string>(); const knownServices = new Set(context.services || []);
  for (const [index, item] of (Array.isArray(value.testing) ? value.testing : []).entries()) {
    const label = `verification.testing[${index}]`; if (!object(item)) { errors.push(`${label} must be an object.`); continue; } unknown(item, TESTING_FIELDS, label, errors);
    if (!ID.test(item.id || '')) errors.push(`${label}.id is invalid.`); else if (ids.has(item.id)) errors.push(`${label}.id is duplicated.`); else ids.add(item.id);
    text(item.title, `${label}.title`, errors); text(item.purpose, `${label}.purpose`, errors); texts(item.sourcePaths, `${label}.sourcePaths`, errors, { minimum: 1, paths: true }); texts(item.testRoots, `${label}.testRoots`, errors, { minimum: 1, paths: true }); texts(item.requirements || [], `${label}.requirements`, errors);
    if (!object(item.scope)) errors.push(`${label}.scope must be an object.`); else { unknown(item.scope, SCOPE_FIELDS, `${label}.scope`, errors); text(item.scope.project, `${label}.scope.project`, errors); if (context.projectCode && item.scope.project !== context.projectCode) errors.push(`${label}.scope.project must equal ${context.projectCode}.`); texts(item.scope.services || [], `${label}.scope.services`, errors); for (const service of item.scope.services || []) if (context.services && !knownServices.has(service)) errors.push(`${label}.scope.services references unknown Service ${service}.`); }
    if (!object(item.full)) errors.push(`${label}.full must be an object.`); else { unknown(item.full, FULL_FIELDS, `${label}.full`, errors); if (!['command', 'agent'].includes(item.full.kind)) errors.push(`${label}.full.kind must be command or agent.`); if (item.full.kind === 'command') { texts(item.full.argv, `${label}.full.argv`, errors, { minimum: 1 }); const cwd = item.full.cwd ?? '.'; if (typeof cwd !== 'string' || !RELATIVE.test(cwd)) errors.push(`${label}.full.cwd must be a safe relative path.`); if (item.full.instructions !== undefined) errors.push(`${label}.full.instructions is only supported for agent.`); } else { texts(item.full.instructions, `${label}.full.instructions`, errors, { minimum: 1 }); if (item.full.argv !== undefined || item.full.cwd !== undefined) errors.push(`${label}.full agent does not accept argv/cwd.`); } }
    if (item.selection !== undefined) texts(item.selection, `${label}.selection`, errors, { minimum: 1 });
  }
  return errors;
}

export function normalizeProjectVerification(value: any, context: { projectCode?: string; services?: string[] } = {}) {
  const errors = validateProjectVerification(value, context); if (errors.length) { const error = new Error(`Project verification declaration is invalid:\n- ${errors.join('\n- ')}`) as Error & Record<string, unknown>; Object.assign(error, { code: 'verification.declaration_invalid', errors }); throw error; }
  return { schemaVersion: 'buildr.project-verification/v4', testing: value.testing.map((item: any) => ({ id: item.id, title: item.title.trim(), scope: { project: item.scope.project, services: [...(item.scope.services || [])] }, purpose: item.purpose.trim(), sourcePaths: [...item.sourcePaths], testRoots: [...item.testRoots], full: item.full.kind === 'command' ? { kind: 'command', argv: [...item.full.argv], cwd: item.full.cwd || '.' } : { kind: 'agent', instructions: [...item.full.instructions] }, ...(item.selection ? { selection: [...item.selection] } : {}), requirements: [...(item.requirements || [])] })) };
}
