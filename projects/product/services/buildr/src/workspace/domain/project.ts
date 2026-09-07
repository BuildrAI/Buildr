import { normalizeSourceLocation, SOURCE_ROOT_ATTACHED } from './source-root.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type WorkspaceProjectSource = { type: 'workspace'; path: string };
export type GitProjectSource = { type: 'git'; root?: 'attached'; path: string; git: { url: string; remote: string; integrationBranch: string } };
export type ProjectSource = WorkspaceProjectSource | GitProjectSource;
export type ProjectInput = { id: string; workspaceId: string; code: string; name: string; description: string; source: any };
export type Project = Readonly<Omit<ProjectInput, 'source'> & { source: ProjectSource }>;

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Project.${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isProjectCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

export function createProjectSource(source: any, code: string): ProjectSource {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Project.source must be an object.');
  }
  const type = requiredText(source.type, 'source.type');
  if (!['workspace', 'git'].includes(type)) {
    throw new Error('Project.source.type must be workspace or git.');
  }
  const location = normalizeSourceLocation(source, `projects/${code}`, 'Project.source');
  const sourcePath = location.path;
  if (type === 'workspace') {
    if (source.git !== undefined) throw new Error('Project.source.git is only supported for git sources.');
    return Object.freeze({ type: 'workspace', path: sourcePath });
  }
  if (!source.git || typeof source.git !== 'object' || Array.isArray(source.git)) {
    throw new Error('Project.source.git is required for git sources.');
  }
  const git = Object.freeze({
    url: requiredText(source.git.url, 'source.git.url'),
    remote: requiredText(source.git.remote, 'source.git.remote'),
    integrationBranch: requiredText(source.git.integrationBranch, 'source.git.integrationBranch'),
  });
  return Object.freeze({ type: 'git', ...(location.root === SOURCE_ROOT_ATTACHED ? { root: SOURCE_ROOT_ATTACHED } : {}), path: sourcePath, git });
}

export function createProject({ id, workspaceId, code, name, description, source }: ProjectInput): Project {
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
