const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Service.${field} must be a non-empty string.`);
  return value.trim();
}

export function isServiceId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isServiceCode(value) {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

export function createServiceSource(source, projectCode, code) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Service.source must be an object.');
  const type = requiredText(source.type, 'source.type');
  if (!['workspace', 'git'].includes(type)) throw new Error('Service.source.type must be workspace or git.');
  const expectedPath = `projects/${projectCode}/services/${code}`;
  const sourcePath = requiredText(source.path, 'source.path');
  if (sourcePath !== expectedPath) throw new Error(`Service.source.path must be ${expectedPath}.`);
  if (type === 'workspace') {
    if (source.git !== undefined) throw new Error('Service.source.git is only supported for git sources.');
    return Object.freeze({ type, path: sourcePath });
  }
  if (!source.git || typeof source.git !== 'object' || Array.isArray(source.git)) throw new Error('Service.source.git is required for git sources.');
  return Object.freeze({
    type,
    path: sourcePath,
    git: Object.freeze({
      url: requiredText(source.git.url, 'source.git.url'),
      remote: requiredText(source.git.remote, 'source.git.remote'),
      integrationBranch: requiredText(source.git.integrationBranch, 'source.git.integrationBranch'),
    }),
  });
}

export function createService({ id, workspaceId, projectId, projectCode, code, name, description, type, source }) {
  if (!isServiceId(id)) throw new Error('Service.id must be a UUID.');
  if (!isServiceId(workspaceId)) throw new Error('Service.workspaceId must be a UUID.');
  if (!isServiceId(projectId)) throw new Error('Service.projectId must be a UUID.');
  if (!isServiceCode(projectCode)) throw new Error('Service.projectCode must be a valid code.');
  if (!isServiceCode(code)) throw new Error('Service.code must contain only letters, digits, dots, underscores, or dashes.');
  const canonicalCode = code.trim();
  return Object.freeze({
    id,
    workspaceId,
    projectId,
    code: canonicalCode,
    name: requiredText(name, 'name'),
    description: requiredText(description, 'description'),
    type: requiredText(type, 'type'),
    source: createServiceSource(source, projectCode.trim(), canonicalCode),
  });
}
