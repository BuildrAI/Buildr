import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { parseProjectsManifest, renderProjectsManifest } from './project-manifest-repository.ts';
import { parseServicesManifest } from './service-manifest-repository.ts';
import { assetError, createBusinessService, createRepositoryInstance, object, type AssetCatalog } from '../domain/asset-relationships.ts';

export const CATALOG_FILES = ['projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml'] as const;
function stableId(value: string): string {
  const hex = crypto.createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5'; hex[16] = 'a'; const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
function parse(content: string, file: string): any {
  const doc = YAML.parseDocument(content, { uniqueKeys: true });
  if (doc.errors.length) throw assetError('asset_manifest_invalid', `${file}: ${doc.errors[0].message}`, 409);
  return doc.toJS();
}
export function assertCatalogFile(root: string, file: string): void {
  const base = fs.realpathSync(root), candidate = path.resolve(root, file);
  if (!candidate.startsWith(`${path.resolve(root)}${path.sep}`)) throw assetError('asset_path_invalid', '清单路径越界。');
  let current = candidate;
  while (current !== path.resolve(root)) {
    if (fs.existsSync(current) || (() => { try { return fs.lstatSync(current).isSymbolicLink(); } catch { return false; } })()) {
      if (fs.lstatSync(current).isSymbolicLink()) throw assetError('asset_symlink_forbidden', `清单路径包含符号链接：${file}。`, 409);
      const actual = fs.realpathSync(current);
      if (actual !== base && !actual.startsWith(`${base}${path.sep}`)) throw assetError('asset_path_invalid', '清单路径越界。');
    }
    current = path.dirname(current);
  }
}
export function readAssetCatalog(root: string, workspaceId: string) {
  const observed: Record<string, string | null> = {};
  const read = (file: string) => {
    assertCatalogFile(root, file);
    const absolute = path.join(root, file);
    const content = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
    observed[file] = content;
    return content;
  };
  const projectsContent = read(CATALOG_FILES[0]);
  if (!projectsContent) throw assetError('project_registry_missing', '项目清单不存在。', 409);
  const projectsRegistry = parseProjectsManifest(projectsContent, { workspaceId });
  if (projectsRegistry.migrationRequired) throw assetError('project_migration_required', '请先完成旧项目清单的标准迁移。', 409);
  const projects = Object.values(projectsRegistry.entities) as any[];
  const serviceContent = read(CATALOG_FILES[1]), repositoryContent = read(CATALOG_FILES[2]);
  const catalog: AssetCatalog = { projects: projects.map(p => ({ ...p, serviceIds: p.serviceIds ?? [] })), services: [], repositories: [] };
  const migrationRequired = serviceContent === null && repositoryContent === null;
  if (!migrationRequired) {
    if (!serviceContent || !repositoryContent) throw assetError('asset_registry_incomplete', '全局服务与代码库清单不完整，请恢复清单事务。', 409);
    const services = parse(serviceContent, CATALOG_FILES[1]), repositories = parse(repositoryContent, CATALOG_FILES[2]);
    object(services, ['schemaVersion', 'services'], '服务清单');
    object(repositories, ['schemaVersion', 'repositories'], '代码库清单');
    if (services.schemaVersion !== 'buildr.services/v3' || repositories.schemaVersion !== 'buildr.repositories/v1') throw assetError('asset_schema_unsupported', '不支持的全局清单版本。', 409);
    for (const [label, entries] of [['services', services.services], ['repositories', repositories.repositories]]) if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw assetError('asset_manifest_invalid', `${label} 必须是对象集合。`, 409);
    for (const [code, input] of Object.entries(services.services)) {
      const entity = createBusinessService(input);
      if (entity.code !== code || entity.workspaceId !== workspaceId) throw assetError('asset_identity_invalid', '服务清单代码或工作空间不匹配。', 409);
      catalog.services.push(entity);
    }
    for (const [code, input] of Object.entries(repositories.repositories)) {
      const entity = createRepositoryInstance(input);
      if (entity.code !== code || entity.workspaceId !== workspaceId) throw assetError('asset_identity_invalid', '代码库清单代码或工作空间不匹配。', 409);
      catalog.repositories.push(entity);
    }
  } else {
    // Read-only legacy projection. Deterministic repository identities survive repeated preview.
    for (const project of catalog.projects) {
      const projectRoot = project.source.root === 'attached' ? project.source.path : path.resolve(root, project.source.path);
      const file = path.join(projectRoot, 'services', 'manifest.yml');
      // Attached projects may live outside the workspace; reads do not acquire ownership.
      const relative = path.relative(root, file);
      const content = project.source.root === 'attached' ? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null) : read(relative);
      if (project.source.root === 'attached') observed[file] = content;
      if (!content) continue;
      const legacy = parseServicesManifest(content, { workspaceId, projectId: project.id, projectCode: project.code });
      if (legacy.migrationRequired) throw assetError('service_migration_required', `请先迁移 ${project.code} 的旧服务清单。`, 409);
      for (const service of Object.values(legacy.entities) as any[]) {
        const repositoryId = stableId(`${workspaceId}:repository:${service.id}`);
        catalog.repositories.push(createRepositoryInstance({ id: repositoryId, workspaceId, code: service.code, name: service.name, description: service.description, source: service.source }));
        catalog.services.push(createBusinessService({ id: service.id, workspaceId, code: service.code, name: service.name, description: service.description, type: service.type, repositoryId, modulePath: '', legacyRefs: [`${project.code}/${service.code}`] }));
        project.serviceIds.push(service.id);
      }
    }
  }
  const revision = `sha256-${crypto.createHash('sha256').update(JSON.stringify(observed)).digest('hex')}`;
  return { catalog, revision, migrationRequired, observed };
}
export function renderAssetCatalog(catalog: AssetCatalog): Record<string, string> {
  return {
    'projects/manifest.yml': renderProjectsManifest(catalog.projects),
    'services/manifest.yml': YAML.stringify({ schemaVersion: 'buildr.services/v3', services: Object.fromEntries(catalog.services.map(s => [s.code, s])) }),
    'repositories/manifest.yml': YAML.stringify({ schemaVersion: 'buildr.repositories/v1', repositories: Object.fromEntries(catalog.repositories.map(r => [r.code, r])) }),
  };
}
