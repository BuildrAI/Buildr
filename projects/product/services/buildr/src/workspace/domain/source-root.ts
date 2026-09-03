import crypto from 'node:crypto';
import path from 'node:path';

export const SOURCE_ROOT_MANAGED = 'managed';
export const SOURCE_ROOT_ATTACHED = 'attached';

export function sourceRootKind(source: any) {
  return source?.root === SOURCE_ROOT_ATTACHED ? SOURCE_ROOT_ATTACHED : SOURCE_ROOT_MANAGED;
}

export function normalizeSourceLocation(source: any, expectedManagedPath: any, label: any) {
  const root = source?.root ?? SOURCE_ROOT_MANAGED;
  if (![SOURCE_ROOT_MANAGED, SOURCE_ROOT_ATTACHED].includes(root)) throw new Error(`${label}.root must be managed or attached.`);
  if (typeof source?.path !== 'string' || !source.path.trim()) throw new Error(`${label}.path must be a non-empty string.`);
  const sourcePath = source.path.trim();
  if (root === SOURCE_ROOT_MANAGED) {
    if (sourcePath !== expectedManagedPath) throw new Error(`${label}.path must be ${expectedManagedPath}.`);
    return { root, path: sourcePath };
  }
  if (source.type !== 'git') throw new Error(`${label}.root attached requires a git source.`);
  if (!path.isAbsolute(sourcePath) || path.normalize(sourcePath) !== sourcePath) throw new Error(`${label}.path must be a normalized absolute path for an attached root.`);
  return { root, path: sourcePath };
}

export function resolveSourceRoot(workspaceRoot: any, source: any) {
  return sourceRootKind(source) === SOURCE_ROOT_ATTACHED ? source.path : path.resolve(workspaceRoot, source.path);
}

export function sourceIdentity(entityId: any, source: any) {
  const declaration = source?.type === 'git'
    ? { root: sourceRootKind(source), url: source.git?.url || null, remote: source.git?.remote || null, integrationBranch: source.git?.integrationBranch || null }
    : { root: sourceRootKind(source), path: source?.path || null };
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify({ entityId, declaration })).digest('hex')}`;
}

export function sourceOwnership(source: any) {
  return sourceRootKind(source) === SOURCE_ROOT_ATTACHED ? 'external' : 'workspace-managed';
}
