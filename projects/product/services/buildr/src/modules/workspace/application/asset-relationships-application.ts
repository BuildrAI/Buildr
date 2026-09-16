import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createProject } from '../domain/project.ts';
import { assetError, createBusinessService, createRepositoryInstance, object, relativeAssetPath, validateAssetCatalog, type AssetCatalog } from '../domain/asset-relationships.ts';
import { CATALOG_FILES, assertCatalogFile, readAssetCatalog, renderAssetCatalog } from '../persistence/asset-catalog-repository.ts';
import { resolveSourceRoot } from '../infrastructure/workspace-source-filesystem.ts';

/** Business relationships own catalog changes; Git materialization remains a separate explicit action. */
export function registerAssetRelationshipsApplication(runtime: Record<string, any>) {
  function readGlobalServiceRegistry(root: string, project: any, workspaceId: string) {
      const record = readAssetCatalog(root, workspaceId);
      const parent = record.catalog.projects.find(p => p.id === project.id || p.code === project.code);
      const entities: Record<string, any> = {};
      for (const service of record.catalog.services) {
        // Historical aliases remain resolvable even after a relationship is removed.
        const alias = service.legacyRefs?.find(ref => ref.startsWith(`${project.code}/`));
        if (!parent?.serviceIds.includes(service.id) && !alias) continue;
        const repository = record.catalog.repositories.find(r => r.id === service.repositoryId);
        if (!repository) continue;
        const code = alias?.split('/')[1] || service.code;
        const source = { ...repository.source, path: service.modulePath ? path.posix.join(repository.source.path, service.modulePath) : repository.source.path };
        entities[code] = { ...service, code, projectId: project.id, source, repositorySource: repository.source, related: Boolean(parent?.serviceIds.includes(service.id)) };
      }
      return { root, manifestPath: path.join(root, 'services', 'manifest.yml'), content: record.observed['services/manifest.yml']!, revision: record.revision, registry: { canonical: true, migrationRequired: false, schemaVersion: 'buildr.services/v3', services: entities, entities, document: {} } };
  }
  function read(root: string) {
    const record = runtime.readProjectRegistryRecord(root);
    const workspaceId = record.workspace.workspace.id;
    return { ...readAssetCatalog(root, workspaceId), workspaceId };
  }
  function assetCatalog(root: string) {
    const r = read(root);
    const diagnostics: { code: string; message: string; objectId: string }[] = [];
    for (const p of r.catalog.projects) for (const id of p.serviceIds) if (!r.catalog.services.some(s => s.id === id)) diagnostics.push({ code: 'project_service_missing', message: `项目 ${p.code} 的服务引用缺失。`, objectId: p.id });
    const repositories = r.catalog.repositories.map(repository => {
      const location = resolveSourceRoot(root, repository.source);
      let observation: any = null;
      if (repository.source.type === 'git') observation = runtime.observeProjectGit(location, repository.source.git!.remote);
      let present = false;
      try { present = fs.statSync(location).isDirectory(); } catch { /* Missing code remains a local diagnostic. */ }
      const identityConflict = present && repository.source.type === 'git' && (!observation?.repository || !observation.remoteUrl || !runtime.sameGitIdentity(observation.remoteUrl, repository.source.git!.url));
      if (identityConflict) diagnostics.push({ code: 'repository_identity_conflict', message: `代码库 ${repository.code} 的实际来源与声明不一致。`, objectId: repository.id });
      return { ...repository, location, available: present && !identityConflict, observed: observation };
    });
    for (const s of r.catalog.services) if (!repositories.some(repository => repository.id === s.repositoryId)) diagnostics.push({ code: 'service_repository_missing', message: `服务 ${s.code} 的代码库引用缺失。`, objectId: s.id });
    return { schemaVersion: 'buildr.asset-catalog/v1', revision: r.revision, migrationRequired: r.migrationRequired, ...r.catalog, repositories, diagnostics };
  }
  function mutate(root: string, revision: unknown, operation: string, change: (catalog: AssetCatalog, workspaceId: string) => void, migration = false) {
    if (typeof revision !== 'string' || !revision) throw assetError('asset_revision_required', '请提供当前清单版本。');
    const before = read(root);
    if (before.revision !== revision) throw assetError('asset_revision_conflict', '内容已被其他操作修改，请重新读取后核对。', 409);
    if (before.migrationRequired && !migration) throw assetError('asset_migration_required', '请先显式迁移旧服务登记，再修改全局关系。', 409);
    const next = structuredClone(before.catalog);
    change(next, before.workspaceId);
    validateAssetCatalog(next, before.workspaceId, migration ? undefined : before.catalog);
    const content = renderAssetCatalog(next);
    const newProjects = next.projects.filter(p => !before.catalog.projects.some(old => old.id === p.id));
    const newServices = next.services.filter(s => !before.catalog.services.some(old => old.id === s.id));
    const roots = [...newProjects.map(p => `projects/${p.code}`), ...newServices.map(s => `services/${s.code}`)];
    for (const relative of roots) {
      assertCatalogFile(root, relative);
      if (fs.existsSync(path.join(root, relative))) throw assetError('asset_directory_occupied', `目录已存在，不能覆盖：${relative}。`, 409);
    }
    const files = [...CATALOG_FILES.map(file => path.join(root, file)), ...roots.map(relative => path.join(root, relative))];
    for (const file of CATALOG_FILES) assertCatalogFile(root, file);
    return runtime.withWorkspaceMutation(root, operation, files, () => {
      if (read(root).revision !== revision) throw assetError('asset_revision_conflict', '保存前清单已变化，请重新核对。', 409);
      for (const project of newProjects) {
        const destination = path.join(root, 'projects', project.code);
        const manifest = runtime.readPackageManifest();
        for (const directory of manifest.projectDirectories) if (directory !== 'services') runtime.ensureDirectory(path.join(destination, directory));
        for (const entry of manifest.projectFiles) {
          const parsed = runtime.parseManifestFileEntry(entry, 'projectFiles');
          if (String(parsed.target || parsed.path || '').includes('services/manifest.yml')) continue;
          runtime.writeMappedFileIfMissing(root, destination, parsed, { project: project.code }, []);
        }
        runtime.trackWrite(root, path.join(destination, 'capabilities.yml'), runtime.renderProjectCapabilitiesYaml(), []);
        runtime.trackWrite(root, path.join(destination, 'commands.yml'), runtime.renderProjectCommandsYaml(), []);
      }
      for (const service of newServices) runtime.atomicWriteFile(path.join(root, 'services', service.code, 'AGENTS.md'), `# ${service.name}\n\n服务（Service）：${service.code}。代码库实例（Repository Instance）：${service.repositoryId}。\n按任务明确选择项目（Project）上下文，并读取被引用代码库目录中的适用规则。\n`);
      for (const file of CATALOG_FILES) { assertCatalogFile(root, file); runtime.atomicWriteFile(path.join(root, file), content[file]); }
      return assetCatalog(root);
    });
  }
  function migrateAssetCatalog(root: string, input: any) {
    object(input, ['revision', 'codeMappings'], '迁移');
    return mutate(root, input.revision, 'assets.catalog.migrate', catalog => {
      if (input.codeMappings !== undefined) {
        if (!input.codeMappings || typeof input.codeMappings !== 'object' || Array.isArray(input.codeMappings)) throw assetError('migration_mapping_invalid', '改名映射必须是对象。');
        for (const [reference, code] of Object.entries(input.codeMappings)) {
          const service = catalog.services.find(s => s.legacyRefs?.includes(reference));
          if (!service) throw assetError('migration_mapping_invalid', `旧服务定位不存在：${reference}。`);
          const replacement = createBusinessService({ ...service, code });
          catalog.services = catalog.services.map(s => s.id === service.id ? replacement : s);
          catalog.repositories = catalog.repositories.map(r => r.id === service.repositoryId ? createRepositoryInstance({ ...r, code }) : r);
        }
      }
    }, true);
  }
  function createCatalogRepository(root: string, input: any) {
    object(input, ['revision', 'code', 'name', 'description', 'url', 'remote', 'integrationBranch'], '新增代码库');
    return mutate(root, input.revision, 'assets.repository.create', (catalog, workspaceId) => {
      const source = { type: 'git', path: `repositories/${input.code}`, git: { url: input.url, remote: input.remote || 'origin', integrationBranch: input.integrationBranch } };
      catalog.repositories.push(createRepositoryInstance({ id: crypto.randomUUID(), workspaceId, code: input.code, name: input.name || input.code, description: input.description || '', source }));
    });
  }
  function addService(catalog: AssetCatalog, workspaceId: string, raw: any) {
    object(raw, ['code', 'name', 'description', 'type', 'repositoryId', 'modulePath', 'repository'], '新增服务');
    if (raw.repository && raw.repositoryId) throw assetError('service_repository_ambiguous', '请选择已有代码库或新增代码库，不能同时提供。');
    let repositoryId = raw.repositoryId;
    if (raw.repository) {
      object(raw.repository, ['code', 'name', 'description', 'url', 'remote', 'integrationBranch'], '新增代码库');
      const r = raw.repository;
      const repository = createRepositoryInstance({ id: crypto.randomUUID(), workspaceId, code: r.code, name: r.name || r.code, description: r.description || '', source: { type: 'git', path: `repositories/${r.code}`, git: { url: r.url, remote: r.remote || 'origin', integrationBranch: r.integrationBranch } } });
      catalog.repositories.push(repository); repositoryId = repository.id;
    }
    const service = createBusinessService({ id: crypto.randomUUID(), workspaceId, code: raw.code, name: raw.name, description: raw.description || '', type: raw.type || 'service', repositoryId, modulePath: raw.modulePath || '' });
    catalog.services.push(service);
    return service;
  }
  function preserveProjectReferences(catalog: AssetCatalog, project: AssetCatalog['projects'][number]) {
    catalog.services = catalog.services.map(service => project.serviceIds.includes(service.id)
      ? createBusinessService({ ...service, legacyRefs: [...new Set([...(service.legacyRefs || []), `${project.code}/${service.code}`])] }) : service);
  }
  function createCatalogService(root: string, input: any) {
    object(input, ['revision', 'service', 'projectId'], '新增服务');
    return mutate(root, input.revision, 'assets.service.create', (catalog, workspaceId) => {
      const service = addService(catalog, workspaceId, input.service);
      if (input.projectId) {
        const project = catalog.projects.find(p => p.id === input.projectId);
        if (!project) throw assetError('project_not_found', '项目不存在。', 404);
        project.serviceIds.push(service.id);
        preserveProjectReferences(catalog, project);
      }
    });
  }
  function createCatalogProject(root: string, input: any) {
    object(input, ['revision', 'code', 'name', 'description', 'serviceIds', 'newServices'], '新增项目');
    return mutate(root, input.revision, 'assets.project.create', (catalog, workspaceId) => {
      const project = createProject({ id: crypto.randomUUID(), workspaceId, code: input.code, name: input.name, description: input.description || `项目 ${input.name}`, source: { type: 'workspace', path: `projects/${input.code}` }, serviceIds: input.serviceIds ?? [] });
      if (input.newServices !== undefined && !Array.isArray(input.newServices)) throw assetError('asset_input_invalid', '新增服务必须为数组。');
      const serviceIds = [...(project.serviceIds ?? [])];
      for (const raw of input.newServices ?? []) serviceIds.push(addService(catalog, workspaceId, raw).id);
      const linkedProject = { ...project, serviceIds };
      catalog.projects.push(linkedProject);
      preserveProjectReferences(catalog, linkedProject);
    });
  }
  function updateProjectServices(root: string, id: string, input: any) {
    object(input, ['revision', 'serviceIds', 'newServices'], '项目服务关联');
    return mutate(root, input.revision, 'assets.project.services', (catalog, workspaceId) => {
      const project = catalog.projects.find(p => p.id === id || p.code === id);
      if (!project) throw assetError('project_not_found', '项目不存在。', 404);
      if (!Array.isArray(input.serviceIds)) throw assetError('project_services_invalid', '请选择服务集合。');
      project.serviceIds = [...input.serviceIds];
      if (input.newServices !== undefined && !Array.isArray(input.newServices)) throw assetError('asset_input_invalid', '新增服务必须为数组。');
      for (const raw of input.newServices ?? []) project.serviceIds.push(addService(catalog, workspaceId, raw).id);
      preserveProjectReferences(catalog, project);
    });
  }
  function updateCatalogAsset(root: string, kind: string, id: string, input: any) {
    object(input, kind === 'service' ? ['revision', 'name', 'description', 'type', 'repositoryId', 'modulePath'] : ['revision', 'name', 'description'], '修改对象');
    return mutate(root, input.revision, `assets.${kind}.update`, catalog => {
      if (!['project', 'service', 'repository'].includes(kind)) throw assetError('asset_kind_invalid', '未知对象类型。');
      const collection = kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories;
      const index = collection.findIndex(item => item.id === id || item.code === id);
      if (index < 0) throw assetError('asset_not_found', '对象不存在。', 404);
      const { revision: _revision, ...patch } = input;
      const updated = { ...collection[index], ...patch };
      (collection as any[])[index] = kind === 'project' ? createProject(updated as any) : kind === 'service' ? createBusinessService(updated) : createRepositoryInstance(updated);
    });
  }
  function catalogServiceDocument(root: string, id: string, documentPath: string) {
    const catalog = read(root).catalog;
    const service = catalog.services.find(s => s.id === id || s.code === id);
    if (!service) throw assetError('service_not_found', '服务不存在。', 404);
    const repository = catalog.repositories.find(r => r.id === service.repositoryId);
    if (!repository) throw assetError('repository_not_found', '服务的代码库引用缺失。', 404);
    documentPath = relativeAssetPath(documentPath, '文档路径');
    const ownRoot = path.join(root, 'services', service.code);
    const codeRoot = path.join(resolveSourceRoot(root, repository.source), service.modulePath);
    const ownFile = path.join(ownRoot, documentPath);
    const documentRoot = fs.existsSync(ownFile) ? ownRoot : codeRoot;
    const file = path.join(documentRoot, documentPath);
    if (fs.existsSync(file)) { const base = fs.realpathSync(documentRoot), actual = fs.realpathSync(file); if (!actual.startsWith(base + path.sep)) throw assetError('service_document_path_forbidden', '文档链接超出服务或代码库范围。'); }
    const result = runtime.sourceFiles.readDocument(documentRoot, documentPath, 'service', assetError);
    return { schemaVersion: 'buildr.service-document/v1', ...result, entry: ['AGENTS.md', 'README.md'].includes(result.path) };
  }
  function repositoryPreparePrompt(root: string, id: string) {
    const r = read(root).catalog.repositories.find(item => item.id === id || item.code === id);
    if (!r) throw assetError('repository_not_found', '代码库不存在。', 404);
    return { prompt: [`准备代码库：${r.name}（${r.code}）`, `声明：${JSON.stringify(r.source)}`, '读取当前 repositories/manifest.yml，核对稳定身份、来源、集成分支和实际目录。', '已登记但代码缺失时，验证远端分支后准备至声明的 repositories/ 目录；附接目录不由此动作搬迁或重建。', '目录已存在时核对仓库来源和工作状态，不覆盖、不丢弃修改、不隐式切换分支。', '来源信息缺失时先查明，不猜测 Git 地址或分支。准备失败仅报告相关代码库问题，不撤销项目与服务关系。', '为具体任务建立隔离工作位置，读取明确项目、服务和实际代码目录的适用规则。'].join('\n'), copiedMeansPrepared: false };
  }
  Object.assign(runtime, { readGlobalServiceRegistry, catalogServiceDocument, assetCatalog, migrateAssetCatalog, createCatalogRepository, createCatalogService, createCatalogProject, updateProjectServices, updateCatalogAsset, repositoryPreparePrompt });
  return runtime;
}
