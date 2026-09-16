import path from 'node:path';
import { isProjectCode, isProjectId } from './project.ts';

export type RepositoryInstance = Readonly<{
  id: string; workspaceId: string; code: string; name: string; description: string;
  source: { type: 'workspace' | 'git'; path: string; root?: 'attached'; git?: { url: string; remote: string; integrationBranch: string } };
}>;
export type BusinessService = Readonly<{
  id: string; workspaceId: string; code: string; name: string; description: string; type: string;
  repositoryId: string; modulePath: string; legacyRefs?: string[];
}>;
export type RelationshipProject = { id: string; workspaceId: string; code: string; name: string; description: string; source: any; serviceIds: string[] };
export type AssetCatalog = { projects: RelationshipProject[]; services: BusinessService[]; repositories: RepositoryInstance[] };

export function assetError(code: string, message: string, status = 400): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}
export function object(value: any, allowed: string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw assetError('asset_input_invalid', `${label} 必须是对象。`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw assetError('asset_field_forbidden', `${label} 不支持字段 ${key}。`);
}
function text(value: unknown, label: string, optional = false): string {
  if (typeof value !== 'string' || (!optional && !value.trim())) throw assetError('asset_field_required', `请填写 ${label}。`);
  return value.trim();
}
function identity(input: any) {
  if (!isProjectId(input.id) || !isProjectId(input.workspaceId)) throw assetError('asset_identity_invalid', '对象与工作空间标识必须是 UUID。');
  if (!isProjectCode(input.code)) throw assetError('asset_code_invalid', '标识仅支持字母、数字、点、下划线与短横线。');
  return { id: input.id, workspaceId: input.workspaceId, code: input.code, name: text(input.name, '名称'), description: text(input.description ?? '', '说明', true) };
}
export function relativeAssetPath(value: unknown, label: string, allowEmpty = false): string {
  const raw = text(value, label, allowEmpty);
  if (allowEmpty && !raw) return '';
  if (!raw || raw === '.' || raw.includes('\0') || raw.includes('\\') || path.posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.split('/').includes('..') || path.posix.normalize(raw) !== raw) throw assetError('asset_path_invalid', `${label} 必须是范围内的规范相对路径。`);
  return raw;
}
export function createRepositoryInstance(input: any): RepositoryInstance {
  object(input, ['id', 'workspaceId', 'code', 'name', 'description', 'source'], '代码库');
  const base = identity(input);
  object(input.source, ['type', 'path', 'root', 'git'], '代码库来源');
  const s = input.source;
  if (!['workspace', 'git'].includes(s.type)) throw assetError('repository_source_invalid', '来源必须是 workspace 或 git。');
  if (s.root !== undefined && s.root !== 'attached') throw assetError('repository_source_invalid', '未知的代码库位置类型。');
  const sourcePath = s.root === 'attached' ? text(s.path, '附接目录') : relativeAssetPath(s.path, '代码库路径');
  if (s.root === 'attached' && (!path.isAbsolute(sourcePath) || path.normalize(sourcePath) !== sourcePath || s.type !== 'git')) throw assetError('repository_path_invalid', '附接来源必须是具有规范绝对路径的 Git 代码库。');
  if (s.type === 'workspace') {
    if (s.git) throw assetError('repository_source_invalid', '工作空间源码不能声明独立 Git 来源。');
    return Object.freeze({ ...base, source: { type: 'workspace' as const, path: sourcePath } });
  }
  object(s.git, ['url', 'remote', 'integrationBranch'], 'Git 来源');
  const git = { url: text(s.git.url, 'Git 地址'), remote: text(s.git.remote, '远端名称'), integrationBranch: text(s.git.integrationBranch, '集成分支') };
  if (/\s|\0/.test(git.url) || git.url.startsWith('-')) throw assetError('repository_url_invalid', 'Git 地址无效。');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(git.remote)) throw assetError('repository_remote_invalid', '远端名称无效。');
  if (/\s|\.\.|[~^:?*\[\\]|@\{|\/\/|^[-/]|[./]$|\.lock$/.test(git.integrationBranch) || git.integrationBranch === '@') throw assetError('repository_branch_invalid', '集成分支名称无效。');
  return Object.freeze({ ...base, source: { type: 'git' as const, path: sourcePath, ...(s.root ? { root: s.root } : {}), git } });
}
export function createBusinessService(input: any): BusinessService {
  object(input, ['id', 'workspaceId', 'code', 'name', 'description', 'type', 'repositoryId', 'modulePath', 'legacyRefs'], '服务');
  const base = identity(input);
  if (!isProjectId(input.repositoryId)) throw assetError('service_repository_required', '服务必须引用一个代码库实例。');
  const modulePath = relativeAssetPath(input.modulePath ?? '', '模块目录', true);
  if (input.legacyRefs !== undefined && (!Array.isArray(input.legacyRefs) || input.legacyRefs.some((ref: any) => typeof ref !== 'string' || ref.split('/').length !== 2 || !ref.split('/').every(isProjectCode)))) throw assetError('service_legacy_ref_invalid', '旧服务定位无效。');
  return Object.freeze({ ...base, type: text(input.type ?? 'service', '类型'), repositoryId: input.repositoryId, modulePath, ...(input.legacyRefs?.length ? { legacyRefs: [...input.legacyRefs] } : {}) });
}
export function validateAssetCatalog(catalog: AssetCatalog, workspaceId: string, baseline?: AssetCatalog): void {
  for (const [label, entries] of [['项目', catalog.projects], ['服务', catalog.services], ['代码库', catalog.repositories]] as const) {
    const ids = new Set<string>(), codes = new Set<string>();
    for (const entry of entries) {
      if (entry.workspaceId !== workspaceId || !isProjectId(entry.id)) throw assetError('asset_workspace_conflict', `${label}身份或工作空间不匹配。`);
      if (ids.has(entry.id) || codes.has(entry.code)) throw assetError('asset_duplicate', `${label}标识重复：${entry.code}。`, 409);
      ids.add(entry.id); codes.add(entry.code);
    }
  }
  for (const service of catalog.services) if (!catalog.repositories.some(r => r.id === service.repositoryId) && !baseline?.services.some(old => old.id === service.id && old.repositoryId === service.repositoryId)) throw assetError('service_repository_missing', `服务 ${service.code} 引用了不存在的代码库。`, 409);
  for (const project of catalog.projects) {
    if (!Array.isArray(project.serviceIds) || project.serviceIds.some(id => !isProjectId(id)) || new Set(project.serviceIds).size !== project.serviceIds.length) throw assetError('project_services_invalid', '项目服务引用必须是不重复的稳定标识集合。');
    for (const id of project.serviceIds) if (!catalog.services.some(s => s.id === id) && !baseline?.projects.find(old => old.id === project.id)?.serviceIds.includes(id)) throw assetError('project_service_missing', `项目 ${project.code} 引用了不存在的服务。`, 409);
  }
  const aliases = new Set<string>();
  for (const service of catalog.services) for (const alias of service.legacyRefs ?? []) {
    if (aliases.has(alias)) throw assetError('service_legacy_ref_conflict', `旧服务定位重复：${alias}。`, 409);
    aliases.add(alias);
  }
}
