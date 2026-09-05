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

export function sourceIdentity(entityId: any, source: any) {
  const declaration = source?.type === 'git'
    ? { root: sourceRootKind(source), url: source.git?.url || null, remote: source.git?.remote || null, integrationBranch: source.git?.integrationBranch || null }
    : { root: sourceRootKind(source), path: source?.path || null };
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify({ entityId, declaration })).digest('hex')}`;
}

export function sourceOwnership(source: any) {
  return sourceRootKind(source) === SOURCE_ROOT_ATTACHED ? 'external' : 'workspace-managed';
}

/** 创建默认文案与附接来源形状，由领域调用方决定何时使用。 */
export function defaultAssetDescription(kind: 'Project' | 'Service', id: string) {
  return `TODO: 补充 ${kind} ${id} 的用途说明。`;
}

export function attachedSource(root: { rootPath: string; url: string; integrationBranch: string }, remote: string) {
  return { rootPath: root.rootPath, source: { type: 'git' as const, root: 'attached' as const, path: root.rootPath,
    git: { url: root.url, remote, integrationBranch: root.integrationBranch } } };
}
