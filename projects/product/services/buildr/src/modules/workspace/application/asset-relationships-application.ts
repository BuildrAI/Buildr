import { readRepositoryLocalConfig } from '../infrastructure/repository-local-config.ts';
import crypto from 'node:crypto';
import { spawnSync } from '../../../infrastructure/process.ts';
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
        const source = { ...repository.source, type: repository.source.git ? 'git' : 'workspace', path: service.modulePath ? path.posix.join(repository.source.path, service.modulePath) : repository.source.path };
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
      let present = false;
      try { present = fs.statSync(location).isDirectory(); } catch { /* Missing code is local. */ }
      if (repository.source.type === 'workspace' && repository.source.path !== '.') diagnostics.push({ code: 'repository_root_unverified', message: `代码库 ${repository.code} 尚未核对真实 Git 根目录，可显式规范化登记。`, objectId: repository.id });
      return { ...repository, location, ...(present ? {} : { available: false }), present, observed: null };

    });
    for (const s of r.catalog.services) if (!repositories.some(repository => repository.id === s.repositoryId)) diagnostics.push({ code: 'service_repository_missing', message: `服务 ${s.code} 的代码库引用缺失。`, objectId: s.id });
    return { schemaVersion: 'buildr.asset-catalog/v1', revision: r.revision, migrationRequired: r.migrationRequired, ...r.catalog, repositories, diagnostics };
  }
  function listCatalogServices(root: string) {
    const c = assetCatalog(root);
    return { revision: c.revision, migrationRequired: c.migrationRequired, services: c.services.map(s => ({ ...s,
      projects: c.projects.filter(p => p.serviceIds.includes(s.id)).map(p => ({ id: p.id, code: p.code, name: p.name })),
      repository: c.repositories.filter(r => r.id === s.repositoryId).map(r => ({ id: r.id, code: r.code, name: r.name }))[0] || null,
    })) };
  }
  function listCatalogRepositories(root: string) {
    const c = assetCatalog(root);
    return { revision: c.revision, migrationRequired: c.migrationRequired, repositories: c.repositories.map(r => ({ ...r,
      serviceCount: c.services.filter(s => s.repositoryId === r.id).length,
    })) };
  }
  function gitRoot(location: string): string {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: location, encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0 || !result.stdout.trim()) throw assetError('repository_not_git', '目录不是 Git 仓库，请选择真实仓库根目录。');
    return fs.realpathSync(result.stdout.trim());
  }
  function catalogRepositoryLocalConfig(root: string, id: string) {
    const record = read(root);
    const repository = record.catalog.repositories.find(r => r.id === id || r.code === id);
    if (!repository) throw assetError('repository_not_found', '代码库不存在。', 404);
    return { revision: record.revision, id: repository.id, ...readRepositoryLocalConfig(resolveSourceRoot(root, repository.source), repository.source.git?.remote) };
  }
  function catalogRepositoryStatus(root: string, id: string) {
    const c = read(root);
    const repository = c.catalog.repositories.find(r => r.id === id || r.code === id);
    if (!repository) throw assetError('repository_not_found', '代码库不存在。', 404);
    const location = resolveSourceRoot(root, repository.source);
    const remote = repository.source.git?.remote || 'origin';
    const observation = { ...runtime.observeProjectGit(location, remote), remote };
    let actualRoot: string | null = null;
    try { actualRoot = gitRoot(location); } catch { /* reported as unavailable */ }
    const validRoot = actualRoot !== null && actualRoot === fs.realpathSync(location);
    const identityConflict = Boolean(repository.source.git && (!observation.remoteUrl || !runtime.sameGitIdentity(observation.remoteUrl, repository.source.git.url)));
    const moduleIssues: string[] = [];
    if (validRoot) for (const service of c.catalog.services.filter(s => s.repositoryId === repository.id)) {
      const module = path.join(location, service.modulePath);
      if (!fs.existsSync(module) || !fs.statSync(module).isDirectory()) moduleIssues.push(`${service.name}：模块目录 ${service.modulePath || '.'} 尚未准备`);
      else { const actual = fs.realpathSync(module); if (actual !== actualRoot && !actual.startsWith(actualRoot! + path.sep)) moduleIssues.push(`${service.name}：模块目录超出代码库范围`); }
    }
    const issues = [!validRoot ? '目录不是独立 Git 仓库根目录，或本地代码缺失。' : null,
      identityConflict ? `远端 ${remote} 的实际地址与声明不一致，需要对齐。` : null, ...moduleIssues].filter((issue): issue is string => Boolean(issue));
    return { revision: c.revision, id: repository.id, available: validRoot && !identityConflict,
      alignment: issues.length ? 'pending' : 'ready', observed: observation, diagnostic: issues.join('；') || null };
  }

  function repositoryLocationKey(root: string, repository: AssetCatalog['repositories'][number]) {
    const location = resolveSourceRoot(root, repository.source);
    return fs.existsSync(location) ? fs.realpathSync(location) : path.resolve(location);
  }
  function repositoryFromDraft(root: string, workspaceId: string, raw: any, allowUnaligned = false) {
    object(raw, ['code', 'name', 'description', 'url', 'remote', 'integrationBranch', 'path'], '代码库');
    const locationPath = typeof raw.path === 'string' ? raw.path.trim() || `repositories/${raw.code}` : raw.path || `repositories/${raw.code}`;
    const attached = path.isAbsolute(locationPath);
    const source = { type: 'git', path: locationPath, ...(attached ? { root: 'attached' } : {}),
      ...(raw.url ? { git: { url: raw.url, remote: raw.remote || 'origin', integrationBranch: raw.integrationBranch } } : raw.integrationBranch ? { integrationBranch: raw.integrationBranch } : {}) };
    const repository = createRepositoryInstance({ id: crypto.randomUUID(), workspaceId, code: raw.code, name: raw.name || raw.code, description: raw.description || '', source });
    const location = resolveSourceRoot(root, repository.source);
    if (!attached) {
      let ancestor = location;
      while (!fs.existsSync(ancestor)) {
        try { if (fs.lstatSync(ancestor).isSymbolicLink()) throw assetError('repository_path_invalid', '目录包含不可解析的符号链接。'); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
        const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
      }
      const real = fs.realpathSync(ancestor), workspace = fs.realpathSync(root);
      if (real !== workspace && !real.startsWith(workspace + path.sep)) throw assetError('repository_path_invalid', '目录链接超出工作空间，请使用明确的外部绝对路径登记。');
    }
    if (fs.existsSync(location)) {
      const real = fs.realpathSync(location), workspace = fs.realpathSync(root);
      if (!attached && real !== workspace && !real.startsWith(workspace + path.sep)) throw assetError('repository_path_invalid', '目录链接超出工作空间，请使用明确的外部绝对路径登记。');
      if (gitRoot(location) !== fs.realpathSync(location)) throw assetError('repository_not_root', '请选择 Git 仓库根目录，子目录应填写到服务的模块目录。');
      if (repository.source.git && !allowUnaligned) {
        const observed = runtime.observeProjectGit(location, repository.source.git.remote);
        if (!observed.remoteUrl || !runtime.sameGitIdentity(observed.remoteUrl, repository.source.git.url)) throw assetError('repository_identity_conflict', '实际远端与声明不一致。', 409);
      }
    } else if (!allowUnaligned && (!raw.url || attached)) throw assetError('repository_not_git', '已有代码库目录不存在；准备新代码需要明确 Git 地址和集成分支。');
    return repository;
  }
  function normalizeCatalogRepositories(root: string, input: any) {
    object(input, ['revision'], '规范化代码库');
    return mutate(root, input.revision, 'assets.repositories.normalize', catalog => {
      const roots = new Map<string, any>();
      const replacements = new Map<string, { id: string; prefix: string }>();
      const next: AssetCatalog['repositories'] = [];
      // Existing Git declarations keep their identity; never merge different checkouts by remote URL.
      for (const r of catalog.repositories.filter(r => r.source.type === 'git')) {
        const location = resolveSourceRoot(root, r.source);
        next.push(r);
        try { if (fs.existsSync(location) && gitRoot(location) === fs.realpathSync(location)) roots.set(fs.realpathSync(location), r); } catch { /* Unrelated broken Git declarations do not block workspace-source normalization. */ }
      }
      for (const r of catalog.repositories.filter(r => r.source.type === 'workspace')) {
        const location = resolveSourceRoot(root, r.source), actual = gitRoot(location);
        let retained = roots.get(actual);
        if (!retained) {
          const relative = path.relative(fs.realpathSync(root), actual).split(path.sep).join('/') || '.';
          const attached = relative === '..' || relative.startsWith('../');
          retained = createRepositoryInstance({ ...r, source: { type: 'git', path: attached ? actual : relative, ...(attached ? { root: 'attached' } : {}) } });
          roots.set(actual, retained); next.push(retained);
        }
        replacements.set(r.id, { id: retained.id, prefix: path.relative(actual, fs.realpathSync(location)).split(path.sep).join('/') });
      }
      catalog.repositories = next;
      catalog.services = catalog.services.map(s => {
        const replacement = replacements.get(s.repositoryId);
        return replacement ? createBusinessService({ ...s, repositoryId: replacement.id, modulePath: path.posix.join(replacement.prefix, s.modulePath) === '.' ? '' : path.posix.join(replacement.prefix, s.modulePath) }) : s;
      });
    });
  }
  function deleteCatalogAsset(root: string, kind: string, id: string, input: any) {
    object(input, ['revision'], '删除登记');
    if (!['project', 'service'].includes(kind)) throw assetError('asset_kind_invalid', '仅支持删除项目和服务登记。');
    return mutate(root, input.revision, `assets.${kind}.delete`, catalog => {
      const collection = kind === 'project' ? catalog.projects : catalog.services;
      const item = collection.find(x => x.id === id || x.code === id);
      if (!item) throw assetError('asset_not_found', '对象不存在。', 404);
      if (kind === 'project') catalog.projects = catalog.projects.filter(p => p.id !== item.id);
      else {
        catalog.services = catalog.services.filter(s => s.id !== item.id);
        catalog.projects = catalog.projects.map(p => ({ ...p, serviceIds: p.serviceIds.filter(s => s !== item.id) }));
      }
    });
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
    const { revision, ...draft } = input;
    return mutate(root, revision, 'assets.repository.create', (catalog, workspaceId) => {
      const repository = repositoryFromDraft(root, workspaceId, draft);
      if (catalog.repositories.some(r => repositoryLocationKey(root, r) === repositoryLocationKey(root, repository))) throw assetError('repository_duplicate_path', '该目录已登记为代码库，请复用已有代码库。', 409);
      catalog.repositories.push(repository);
    });
  }
  function addService(root: string, catalog: AssetCatalog, workspaceId: string, raw: any) {
    object(raw, ['code', 'name', 'description', 'type', 'repositoryId', 'modulePath', 'repository'], '新增服务');
    if (raw.repository && raw.repositoryId) throw assetError('service_repository_ambiguous', '请选择已有代码库或新增代码库，不能同时提供。');
    let repositoryId = raw.repositoryId;
    if (raw.repository) {
      const repository = repositoryFromDraft(root, workspaceId, raw.repository);
      if (catalog.repositories.some(r => repositoryLocationKey(root, r) === repositoryLocationKey(root, repository))) throw assetError('repository_duplicate_path', '该目录已登记为代码库，请复用已有代码库。', 409);
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
      const service = addService(root, catalog, workspaceId, input.service);
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
      for (const raw of input.newServices ?? []) serviceIds.push(addService(root, catalog, workspaceId, raw).id);
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
      for (const raw of input.newServices ?? []) project.serviceIds.push(addService(root, catalog, workspaceId, raw).id);
      preserveProjectReferences(catalog, project);
    });
  }
  function updateCatalogAsset(root: string, kind: string, id: string, input: any) {
    object(input, kind === 'service' ? ['revision', 'name', 'description', 'type', 'repositoryId', 'modulePath', 'repository'] : kind === 'repository' ? ['revision', 'name', 'description', 'url', 'remote', 'integrationBranch', 'path'] : ['revision', 'name', 'description'], '修改对象');
    return mutate(root, input.revision, `assets.${kind}.update`, catalog => {
      if (!['project', 'service', 'repository'].includes(kind)) throw assetError('asset_kind_invalid', '未知对象类型。');
      const collection = kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories;
      const index = collection.findIndex(item => item.id === id || item.code === id);
      if (index < 0) throw assetError('asset_not_found', '对象不存在。', 404);
      if (kind === 'repository' && ['url', 'remote', 'integrationBranch', 'path'].some(key => Object.hasOwn(input, key))) {
        const existing = catalog.repositories[index];
        for (const key of ['name', 'description', 'url', 'remote', 'integrationBranch', 'path']) if (Object.hasOwn(input, key) && typeof input[key] !== 'string') throw assetError('asset_input_invalid', `${key} 必须是字符串。`);
        if (!existing.source.git && input.url === undefined && input.remote) throw assetError('repository_remote_url_required', '请同时提供 Git 地址以声明远端名称。');
        if (input.name !== undefined && !input.name.trim()) throw assetError('asset_field_required', '请填写名称。');
        if (input.path !== undefined && (typeof input.path !== 'string' || !input.path.trim())) throw assetError('asset_field_required', '请填写仓库目录。');
        const replacement = repositoryFromDraft(root, existing.workspaceId, {
          code: existing.code, name: input.name ?? existing.name, description: input.description ?? existing.description,
          path: input.path ?? existing.source.path, url: input.url ?? existing.source.git?.url ?? '',
          remote: input.remote ?? existing.source.git?.remote ?? 'origin',
          integrationBranch: input.integrationBranch ?? existing.source.integrationBranch ?? existing.source.git?.integrationBranch ?? '',
        }, true);
        const location = resolveSourceRoot(root, replacement.source);
        if (catalog.repositories.some(r => r.id !== existing.id && repositoryLocationKey(root, r) === repositoryLocationKey(root, replacement))) throw assetError('repository_duplicate_path', '该目录已登记为代码库，请复用已有代码库。', 409);
        // Module declarations stay relative to the new root. Never move their files as part of saving.
        if (fs.existsSync(location)) for (const service of catalog.services.filter(s => s.repositoryId === existing.id)) {
          let module = path.join(location, service.modulePath);
          while (!fs.existsSync(module) && module !== location) module = path.dirname(module);
          const actual = fs.realpathSync(module), base = fs.realpathSync(location);
          if (actual !== base && !actual.startsWith(base + path.sep)) throw assetError('service_module_path_forbidden', `服务 ${service.name} 的模块目录超出代码库范围。`);
        }
        catalog.repositories[index] = createRepositoryInstance({ ...replacement, id: existing.id });
        return;
      }
      const { revision: _revision, repository: repositoryDraft, ...patch } = input;
      if (kind === 'service' && repositoryDraft !== undefined) {
        if (Object.hasOwn(input, 'repositoryId')) throw assetError('service_repository_ambiguous', '请选择已有代码库或新增代码库，不能同时提供。');
        const repository = repositoryFromDraft(root, catalog.services[index].workspaceId, repositoryDraft);
        if (catalog.repositories.some(r => repositoryLocationKey(root, r) === repositoryLocationKey(root, repository))) throw assetError('repository_duplicate_path', '该目录已登记为代码库，请复用已有代码库。', 409);
        catalog.repositories.push(repository);
        patch.repositoryId = repository.id;
      }
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
    return { prompt: [`对齐代码库声明：${r.name}（${r.code}）`, `声明：${JSON.stringify(r.source)}`, '读取当前 repositories/manifest.yml，核对稳定身份、最新版本、来源、集成分支和实际目录。', '先只读检查 Git 根目录、实际远端与服务模块；列明声明和实际的差异。声明保存不代表已执行远端改写、切换分支、克隆或搬迁。', '集成分支是后续工作的目标，不要求当前分支与之相同；仅因当前分支不同不得自动切换。', '远端或目录需要对齐时先提出具体动作与影响，在相应授权内执行；保留原目录、未提交改动和全部服务引用。', '已登记但代码缺失时，验证远端分支后准备至声明的实际目录；附接目录不由此动作搬迁或重建。', '代码库必须对应真实 Git 根目录；工作空间根使用 .，服务子目录用 modulePath；先读取独立 /services、/repositories 列表，状态按单个代码库读取。', '删除项目或服务只移除登记和关系，保留代码、文件与历史任务；提交前读取最新 revision 并说明影响。', '目录已存在时核对仓库来源和工作状态，不覆盖、不丢弃修改、不隐式切换分支。', '来源信息缺失时先查明，不猜测 Git 地址或分支。准备失败仅报告相关代码库问题，不撤销项目与服务关系。', '为具体任务建立隔离工作位置，读取明确项目、服务和实际代码目录的适用规则。'].join('\n'), copiedMeansPrepared: false };
  }
  Object.assign(runtime, { catalogRepositoryLocalConfig, listCatalogServices, listCatalogRepositories, catalogRepositoryStatus, normalizeCatalogRepositories, deleteCatalogAsset, readGlobalServiceRegistry, catalogServiceDocument, assetCatalog, migrateAssetCatalog, createCatalogRepository, createCatalogService, createCatalogProject, updateProjectServices, updateCatalogAsset, repositoryPreparePrompt });
  return runtime;
}
