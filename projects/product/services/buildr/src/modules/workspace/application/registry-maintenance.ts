import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RegistryAssets = {
  repairProjectBaseline(targetRoot: string, projectCode: string, changed: string[]): void;
  convergeSkillsManifestSchema(targetRoot: string, scopeRoot: string, changed: string[]): void;
};

export interface RegistryMaintenanceDependencies {
  createProjectEntity(...args: any[]): any;
  createServiceEntity(...args: any[]): any;
  defaultAssetDescription(...args: any[]): any;
  ensureDirectory(...args: any[]): any;
  ensureGitBoundaries(...args: any[]): any;
  existsDirectory(...args: any[]): any;
  existsFile(...args: any[]): any;
  gitDefaultBranch(...args: any[]): any;
  inferRepoKind(...args: any[]): any;
  isPlainObject(...args: any[]): any;
  observeProjectGit(...args: any[]): any;
  parseServicesManifest(...args: any[]): any;
  parseServicesManifestYaml(...args: any[]): any;
  parseServicesYaml(...args: any[]): any;
  projectsManifestPath(...args: any[]): any;
  readGitRemote(...args: any[]): any;
  readProjectRegistryRecord(...args: any[]): any;
  renderProjectsManifest(...args: any[]): any;
  renderServicesDomainManifest(...args: any[]): any;
  servicesManifestPath(...args: any[]): any;
  toPosixRelative(...args: any[]): any;
  writeProjectRegistry(...args: any[]): any;
  writeServiceRegistry(...args: any[]): any;
}

export function createRegistryMaintenance(runtime: RegistryMaintenanceDependencies) {
  const readGitRemote = (...args: any[]) => runtime.readGitRemote(...args);
  const isPlainObject = (...args: any[]) => runtime.isPlainObject(...args);
  const gitDefaultBranch = (...args: any[]) => runtime.gitDefaultBranch(...args);
  const defaultAssetDescription = (...args: any[]) => runtime.defaultAssetDescription(...args);
  const inferRepoKind = (...args: any[]) => runtime.inferRepoKind(...args);
  const existsDirectory = (...args: any[]) => runtime.existsDirectory(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);
  const parseServicesYaml = (...args: any[]) => runtime.parseServicesYaml(...args);
  const parseServicesManifestYaml = (...args: any[]) => runtime.parseServicesManifestYaml(...args);
  const servicesManifestPath = (...args: any[]) => runtime.servicesManifestPath(...args);
  const ensureDirectory = (...args: any[]) => runtime.ensureDirectory(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const projectsManifestPath = (...args: any[]) => runtime.projectsManifestPath(...args);
  const ensureGitBoundaries = (...args: any[]) => runtime.ensureGitBoundaries(...args);
  function isValidAssetId(value: any): any  {
    return typeof value === 'string' && value !== '.' && value !== '..' && !/[\x00-\x1f\x7f]/.test(value) && /^[A-Za-z0-9._-]+$/.test(value);
  }
  function listManagedDirectories(parent: any): any  {
    if (!existsDirectory(parent)) return [];
    return fs.readdirSync(parent)
      .filter((entry: any) => isValidAssetId(entry) && existsDirectory(path.join(parent, entry)))
      .sort();
  }


  function normalizeServiceEntry(serviceName: any, entry: any = {}, serviceRoot: any = null): any  {
    const rawRepo = isPlainObject(entry.repo) ? entry.repo : {};
    const kind = rawRepo.kind === 'git' || rawRepo.kind === 'local'
      ? (rawRepo.url || (serviceRoot && inferRepoKind(serviceRoot) === 'git') ? 'git' : 'workspace')
      : ['workspace', 'git'].includes(rawRepo.kind) ? rawRepo.kind : serviceRoot ? inferRepoKind(serviceRoot) : 'workspace';
    const repo: any = { kind };
    if (kind === 'git') {
      if (rawRepo.url) repo.url = rawRepo.url;
      if (rawRepo.remote) repo.remote = rawRepo.remote;
      if (rawRepo.defaultBranch) repo.defaultBranch = rawRepo.defaultBranch;
      if (rawRepo.branch) repo.branch = rawRepo.branch;
      if (!repo.remote && serviceRoot && existsDirectory(path.join(serviceRoot, '.git'))) repo.remote = 'origin';
      if (!repo.defaultBranch && serviceRoot && existsDirectory(path.join(serviceRoot, '.git'))) repo.defaultBranch = gitDefaultBranch(serviceRoot);
      if (!repo.url && serviceRoot && existsDirectory(path.join(serviceRoot, '.git'))) {
        const url = readGitRemote(serviceRoot, repo.remote || 'origin');
        if (url) repo.url = url;
      }
    }
    return {
      title: typeof entry.title === 'string' && entry.title ? entry.title : serviceName,
      description: typeof entry.description === 'string' && entry.description ? entry.description : defaultAssetDescription('Service', serviceName),
      type: typeof entry.type === 'string' && entry.type ? entry.type : 'service',
      path: `services/${serviceName}`,
      repo,
    };
  }
  function convergeServiceManifest(targetRoot: any, project: any, workspaceId: any, changed: any): any  {
    const projectName = project.code;
    const projectRoot = path.join(targetRoot, 'projects', projectName);
    const servicesRoot = path.join(projectRoot, 'services');
    const manifestFile = servicesManifestPath(projectRoot);
    const legacyFile = path.join(projectRoot, 'services.yml');
    let legacy: any = null;
    let entities: Record<string, any> = {};

    ensureDirectory(servicesRoot);
    if (!existsFile(manifestFile) && existsFile(legacyFile)) {
      const legacyServices = parseServicesYaml(fs.readFileSync(legacyFile, 'utf8'));
      legacy = { schemaVersion: 'buildr.services/v1', project: projectName, services: {} };
      for (const [serviceName, service] of Object.entries(legacyServices)) {
        legacy.services[serviceName] = normalizeServiceEntry(serviceName, service, path.join(servicesRoot, serviceName));
      }
    } else if (existsFile(manifestFile)) {
      const content = fs.readFileSync(manifestFile, 'utf8');
      const raw = parseServicesManifestYaml(content);
      if (raw.schemaVersion === 'buildr.services/v2') {
        entities = Object.fromEntries(Object.entries(runtime.parseServicesManifest(content, { projectCode: projectName }).entities).map(([code, service]: any) => [code, runtime.createServiceEntity({ ...service, workspaceId, projectId: project.id, projectCode: projectName })]));
      } else legacy = raw;
    } else {
      legacy = { schemaVersion: 'buildr.services/v1', project: projectName, services: {} };
    }

    if (legacy) {
      for (const [serviceName, service] of Object.entries(legacy.services || {})) {
        const normalized = normalizeServiceEntry(serviceName, service, path.join(servicesRoot, serviceName));
        const sourcePath = `projects/${projectName}/services/${serviceName}`;
        const source = normalized.repo.kind === 'git'
          ? { type: 'git', path: sourcePath, git: { url: normalized.repo.url || '', remote: normalized.repo.remote || 'origin', integrationBranch: normalized.repo.branch || normalized.repo.defaultBranch || '' } }
          : { type: 'workspace', path: sourcePath };
        entities[serviceName] = runtime.createServiceEntity({ id: crypto.randomUUID(), workspaceId, projectId: project.id, projectCode: projectName, code: serviceName, name: normalized.title, description: normalized.description, type: normalized.type, source });
      }
    }

    for (const serviceName of listManagedDirectories(servicesRoot)) {
      if (entities[serviceName]) continue;
      const serviceRoot = path.join(servicesRoot, serviceName);
      const git = runtime.observeProjectGit(serviceRoot, 'origin');
      const source = git.repository
        ? { type: 'git', path: `projects/${projectName}/services/${serviceName}`, git: { url: git.remoteUrl || '', remote: 'origin', integrationBranch: git.currentBranch || '' } }
        : { type: 'workspace', path: `projects/${projectName}/services/${serviceName}` };
      entities[serviceName] = runtime.createServiceEntity({ id: crypto.randomUUID(), workspaceId, projectId: project.id, projectCode: projectName, code: serviceName, name: serviceName, description: defaultAssetDescription('Service', serviceName), type: 'service', source });
    }

    const nextContent = runtime.renderServicesDomainManifest(project.id, entities);
    if (!existsFile(manifestFile) || fs.readFileSync(manifestFile, 'utf8') !== nextContent) {
      runtime.writeServiceRegistry(manifestFile, project.id, entities);
      changed.push(toPosixRelative(targetRoot, manifestFile));
    }
    if (existsFile(legacyFile)) {
      fs.rmSync(legacyFile, { force: true });
      changed.push(toPosixRelative(targetRoot, legacyFile));
    }
    return { schemaVersion: 'buildr.services/v2', projectId: project.id, services: entities };
  }
  function convergeRegistryManifests(targetRoot: string, assets: RegistryAssets): any  {
    const changed: any[] = [];
    const legacyProjectsFile = path.join(targetRoot, 'projects.yml');
    if (existsFile(legacyProjectsFile)) {
      fs.rmSync(legacyProjectsFile, { force: true });
      changed.push('projects.yml');
    }

    ensureDirectory(path.join(targetRoot, 'projects'));
    const record = runtime.readProjectRegistryRecord(targetRoot);
    if (record.registry.migrationRequired) throw new Error('Project registry migration must complete before registry convergence.');
    const projects: any = { ...record.projects };

    const projectNames = listManagedDirectories(path.join(targetRoot, 'projects'));
    for (const projectName of projectNames) {
      const projectRoot = path.join(targetRoot, 'projects', projectName);
      if (!projects[projectName]) {
        const git = runtime.observeProjectGit(projectRoot, 'origin');
        const source = git.repository
          ? {
            type: 'git',
            path: `projects/${projectName}`,
            git: {
              url: git.remoteUrl,
              remote: 'origin',
              integrationBranch: git.currentBranch,
            },
          }
          : { type: 'workspace', path: `projects/${projectName}` };
        projects[projectName] = runtime.createProjectEntity({
          id: crypto.randomUUID(),
          workspaceId: record.workspace.workspace.id,
          code: projectName,
          name: projectName,
          description: defaultAssetDescription('Project', projectName),
          source,
        });
      }
    }
    const nextContent = runtime.renderProjectsManifest(projects);
    const registryFile = projectsManifestPath(targetRoot);
    if (!existsFile(registryFile) || fs.readFileSync(registryFile, 'utf8') !== nextContent) {
      runtime.writeProjectRegistry(registryFile, projects);
      changed.push(toPosixRelative(targetRoot, registryFile));
    }

    for (const projectName of projectNames) {
      assets.repairProjectBaseline(targetRoot, projectName, changed);
      const servicesFile = servicesManifestPath(path.join(targetRoot, 'projects', projectName));
      if (!existsFile(servicesFile) && !existsFile(path.join(targetRoot, 'projects', projectName, 'services.yml'))) {
        runtime.writeServiceRegistry(servicesFile, projects[projectName].id, {});
        changed.push(toPosixRelative(targetRoot, servicesFile));
      }
      convergeServiceManifest(targetRoot, projects[projectName], record.workspace.workspace.id, changed);
    }

    assets.convergeSkillsManifestSchema(targetRoot, targetRoot, changed);

    const boundaryItems: any[] = [];
    for (const projectName of Object.keys(projects)) {
      const projectRoot = path.join(targetRoot, 'projects', projectName);
      boundaryItems.push({ type: 'project', project: projectName, assetRoot: projectRoot });
      const servicesRoot = path.join(projectRoot, 'services');
      for (const serviceName of listManagedDirectories(servicesRoot)) {
        boundaryItems.push({ type: 'service', project: projectName, service: serviceName, assetRoot: path.join(servicesRoot, serviceName) });
      }
    }
    changed.push(...ensureGitBoundaries(targetRoot, boundaryItems));
    return [...new Set(changed)];
  }

  return Object.freeze({ convergeRegistryManifests });
}
