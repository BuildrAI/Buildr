const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Project.${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function isProjectId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isProjectCode(value) {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

export function createProjectSource(source, code) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Project.source must be an object.');
  }
  const type = requiredText(source.type, 'source.type');
  if (!['workspace', 'git'].includes(type)) {
    throw new Error('Project.source.type must be workspace or git.');
  }
  const expectedPath = `projects/${code}`;
  const sourcePath = requiredText(source.path, 'source.path');
  if (sourcePath !== expectedPath) {
    throw new Error(`Project.source.path must be ${expectedPath}.`);
  }
  if (type === 'workspace') {
    if (source.git !== undefined) throw new Error('Project.source.git is only supported for git sources.');
    return Object.freeze({ type, path: sourcePath });
  }
  if (!source.git || typeof source.git !== 'object' || Array.isArray(source.git)) {
    throw new Error('Project.source.git is required for git sources.');
  }
  const git = Object.freeze({
    url: requiredText(source.git.url, 'source.git.url'),
    remote: requiredText(source.git.remote, 'source.git.remote'),
    integrationBranch: requiredText(source.git.integrationBranch, 'source.git.integrationBranch'),
  });
  return Object.freeze({ type, path: sourcePath, git });
}

export function createProject({ id, workspaceId, code, name, description, source }) {
  if (!isProjectId(id)) throw new Error('Project.id must be a UUID.');
  if (!isProjectId(workspaceId)) throw new Error('Project.workspaceId must be a UUID.');
  if (!isProjectCode(code)) throw new Error('Project.code must contain only letters, digits, dots, underscores, or dashes.');
  const canonicalCode = code.trim();
  return Object.freeze({
    id,
    workspaceId,
    code: canonicalCode,
    name: requiredText(name, 'name'),
    description: requiredText(description, 'description'),
    source: createProjectSource(source, canonicalCode),
  });
}
