import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from '../../../infrastructure/process.mjs';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.mjs';
import YAML from 'yaml';
import { createProject as createProjectEntity } from '../../domain/project.ts';
import { createService as createServiceEntity } from '../../domain/service.ts';
import { declarationIntakeNextAction } from '../../../infrastructure/contracts/declaration-intake.mjs';
import { parseProjectsManifest, renderProjectsManifest } from '../../persistence/project-manifest-repository.ts';

const declarationIntakeAction: any = declarationIntakeNextAction;

export function registerWorkspaceCliAdapter(runtime: any) {
  const readGitRemote = (...args: any[]) => runtime.readGitRemote(...args);
  const gitignoreLines = (...args: any[]) => runtime.gitignoreLines(...args);
  const isPlainObject = (...args: any[]) => runtime.isPlainObject(...args);
  const assertNoUnknownOptions = (...args: any[]) => runtime.assertNoUnknownOptions(...args);
  const positionalArgs = (...args: any[]) => runtime.positionalArgs(...args);
  const readPackageManifest = (...args: any[]) => runtime.readPackageManifest(...args);
  const parseManifestFileEntry = (...args: any[]) => runtime.parseManifestFileEntry(...args);
  const isValidAssetId = (...args: any[]) => runtime.isValidAssetId(...args);
  const assertName = (...args: any[]) => runtime.assertName(...args);
  const renderSkillsManifestYaml = (...args: any[]) => runtime.renderSkillsManifestYaml(...args);
  const renderProjectCapabilitiesYaml = (...args: any[]) => runtime.renderProjectCapabilitiesYaml(...args);
  const renderProjectCommandsYaml = (...args: any[]) => runtime.renderProjectCommandsYaml(...args);
  const optionValue = (...args: any[]) => runtime.optionValue(...args);
  const ensureDirectory = (...args: any[]) => runtime.ensureDirectory(...args);
  const atomicWriteFile = (...args: any[]) => runtime.atomicWriteFile(...args);
  const parseYamlDocument = (...args: any[]) => runtime.parseYamlDocument(...args);
  const sameGitIdentity = (...args: any[]) => runtime.sameGitIdentity(...args);
  const withWorkspaceMutation = (...args: any[]) => runtime.withWorkspaceMutation(...args);
  const writeIfMissing = (...args: any[]) => runtime.writeIfMissing(...args);
  const writeMappedFileIfMissing = (...args: any[]) => runtime.writeMappedFileIfMissing(...args);
  const appendGitignoreEntries = (...args: any[]) => runtime.appendGitignoreEntries(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args: any[]) => runtime.existsDirectory(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);

  function parseProjectRef(ref: any) {
    const parts = ref.split('/').filter(Boolean);
    if (parts.length === 1) {
      assertName(parts[0], 'Project');
      return { project: parts[0] };
    }
    throw new Error(`Project ref must be <project>. Organization-prefixed refs are not supported: ${ref}`);
  }

  function parseServiceRef(ref: any) {
    const parts = ref.split('/').filter(Boolean);
    if (parts.length === 2) {
      assertName(parts[0], 'Project');
      assertName(parts[1], 'Service');
      return { project: parts[0], service: parts[1] };
    }
    throw new Error(`Service ref must be <project>/<service>. Organization-prefixed refs are not supported: ${ref}`);
  }

  function isGitUrl(value: any) {
    return /^(https?:\/\/|ssh:\/\/|git@)/.test(value) || /\.git$/.test(value);
  }

  function isProjectGitUrl(value: any) {
    return /^(https?:\/\/|ssh:\/\/|git@|file:\/\/)/.test(value);
  }

  function quoteYaml(value: any) {
    if (Array.isArray(value)) return JSON.stringify(value.map((item: any) => String(item)));
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return JSON.stringify(String(value));
  }

  function parseYamlValue(value: any) {
    const document = YAML.parseDocument(value, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(`Invalid YAML value: ${value} (${document.errors.map((error: any) => error.message).join('; ')})`);
    return document.toJS();
  }

  function parseServicesYaml(content: any) {
    const parsed = parseYamlDocument(content, 'legacy services.yml');
    return isPlainObject(parsed.services) ? parsed.services : parsed;
  }

  function parseServicesManifestYaml(content: any) {
    const manifest = parseYamlDocument(content, 'services/manifest.yml');
    if (!isPlainObject(manifest.services)) manifest.services = {};
    return manifest;
  }

  function parseProjectsYaml(content: any) {
    const registry = parseYamlDocument(content, 'projects/manifest.yml');
    if (!isPlainObject(registry.projects)) registry.projects = {};
    return registry;
  }

  function renderProjectsYaml(registry: any) {
    if (registry.schemaVersion === 'buildr.projects/v2') return renderProjectsManifest(registry.projects || {});
    const projects = registry.projects || {};
    const names = Object.keys(projects).sort();
    const lines = ['schemaVersion: buildr.projects/v1'];
    if (names.length === 0) {
      lines.push('projects: {}');
      return `${lines.join('\n')}\n`;
    }

    lines.push('projects:');
    for (const name of names) {
      const project = projects[name];
      lines.push(`  ${name}:`);
      for (const key of ['title', 'description', 'path']) {
        if (project[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(project[key])}`);
      }
      if (project.repo) {
        lines.push('    repo:');
        for (const key of ['kind', 'url', 'remote', 'defaultBranch']) {
          if (project.repo[key] !== undefined) lines.push(`      ${key}: ${quoteYaml(project.repo[key])}`);
        }
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function validateProjectsRegistry(registry: any) {
    if (registry?.schemaVersion === 'buildr.projects/v2') {
      try {
        parseProjectsManifest(YAML.stringify(registry));
        return [];
      } catch (error: any) {
        return [error.message];
      }
    }
    const errors: any[] = [];
    if (String(registry.schemaVersion) !== 'buildr.projects/v1') {
      errors.push('projects/manifest.yml schemaVersion must be buildr.projects/v1.');
    }
    if (!isPlainObject(registry.projects)) {
      errors.push('projects/manifest.yml projects must be an object.');
      return errors;
    }

    for (const [projectName, project] of Object.entries(registry.projects as Record<string, any>)) {
      const label = `projects.${projectName}`;
      if (!isValidAssetId(projectName)) {
        errors.push(`${label} key must contain only letters, digits, dots, underscores, or dashes.`);
      }
      if (!isPlainObject(project)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      const allowedKeys = new Set(['title', 'description', 'path', 'repo']);
      for (const key of Object.keys(project)) {
        if (!allowedKeys.has(key)) errors.push(`${label}.${key} is not a supported projects/manifest.yml field.`);
      }
      if (!project.title || typeof project.title !== 'string') {
        errors.push(`${label}.title is required.`);
      }
      if (!project.description || typeof project.description !== 'string') {
        errors.push(`${label}.description is required.`);
      }
      if (project.path !== `projects/${projectName}`) {
        errors.push(`${label}.path must be projects/${projectName}.`);
      }
      if (!isPlainObject(project.repo)) {
        errors.push(`${label}.repo is required.`);
        continue;
      }
      const allowedRepoKeys = new Set(['kind', 'url', 'remote', 'defaultBranch']);
      for (const key of Object.keys(project.repo)) {
        if (!allowedRepoKeys.has(key)) errors.push(`${label}.repo.${key} is not a supported repo field.`);
      }
      if (!['workspace', 'git'].includes(project.repo.kind)) {
        errors.push(`${label}.repo.kind must be workspace or git.`);
      }
      if (project.repo.kind === 'workspace') {
        for (const key of ['url', 'remote', 'defaultBranch']) {
          if (project.repo[key] !== undefined) errors.push(`${label}.repo.${key} is only supported for git-managed Projects.`);
        }
      }
      if (project.repo.kind === 'git') {
        if (project.repo.url !== undefined && typeof project.repo.url !== 'string') errors.push(`${label}.repo.url must be a string when provided.`);
        if (project.repo.remote !== undefined && typeof project.repo.remote !== 'string') errors.push(`${label}.repo.remote must be a string when provided.`);
        if (project.repo.defaultBranch !== undefined && typeof project.repo.defaultBranch !== 'string') errors.push(`${label}.repo.defaultBranch must be a string when provided.`);
      }
    }

    return errors;
  }

  function renderServicesManifestYaml(manifest: any) {
    if (manifest.schemaVersion === 'buildr.services/v2') return runtime.renderServicesDomainManifest(manifest.projectId, manifest.services || {});
    const services = manifest.services || {};
    const names = Object.keys(services).sort();
    const lines = ['schemaVersion: buildr.services/v1', `project: ${quoteYaml(manifest.project)}`];
    if (names.length === 0) {
      lines.push('services: {}');
      return `${lines.join('\n')}\n`;
    }

    lines.push('services:');
    for (const name of names) {
      const service = services[name];
      lines.push(`  ${name}:`);
      for (const key of ['title', 'description', 'type', 'path']) {
        if (service[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(service[key])}`);
      }
      if (service.repo) {
        lines.push('    repo:');
        for (const key of ['kind', 'url', 'remote', 'defaultBranch', 'branch']) {
          if (service.repo[key] !== undefined) lines.push(`      ${key}: ${quoteYaml(service.repo[key])}`);
        }
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function validateServicesManifest(manifest: any, expectedProject: any) {
    if (manifest?.schemaVersion === 'buildr.services/v2') {
      try {
        runtime.parseServicesManifest(YAML.stringify(manifest), { projectCode: expectedProject });
        return [];
      } catch (error: any) {
        return [error.message];
      }
    }
    const errors: any[] = [];
    if (manifest.schemaVersion !== 'buildr.services/v1') {
      errors.push('services/manifest.yml schemaVersion must be buildr.services/v1.');
    }
    if (manifest.project !== expectedProject) {
      errors.push(`services/manifest.yml project must be ${expectedProject}.`);
    }
    if (!isPlainObject(manifest.services)) {
      errors.push('services/manifest.yml services must be an object.');
      return errors;
    }
    for (const [serviceName, service] of Object.entries(manifest.services as Record<string, any>)) {
      const label = `services.${serviceName}`;
      if (!isValidAssetId(serviceName)) {
        errors.push(`${label} key must contain only letters, digits, dots, underscores, or dashes.`);
      }
      if (!isPlainObject(service)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      const allowedKeys = new Set(['title', 'description', 'type', 'path', 'repo']);
      for (const key of Object.keys(service)) {
        if (!allowedKeys.has(key)) errors.push(`${label}.${key} is not a supported services/manifest.yml field.`);
      }
      if (!service.title || typeof service.title !== 'string') errors.push(`${label}.title is required.`);
      if (!service.description || typeof service.description !== 'string') errors.push(`${label}.description is required.`);
      if (!service.type || typeof service.type !== 'string') errors.push(`${label}.type is required.`);
      if (service.path !== `services/${serviceName}`) errors.push(`${label}.path must be services/${serviceName}.`);
      if (!isPlainObject(service.repo)) {
        errors.push(`${label}.repo is required.`);
        continue;
      }
      const allowedRepoKeys = new Set(['kind', 'url', 'remote', 'defaultBranch', 'branch']);
      for (const key of Object.keys(service.repo)) {
        if (!allowedRepoKeys.has(key)) errors.push(`${label}.repo.${key} is not a supported repo field.`);
      }
      if (!['workspace', 'git'].includes(service.repo.kind)) errors.push(`${label}.repo.kind must be workspace or git.`);
      if (service.repo.kind === 'workspace') {
        for (const key of ['url', 'remote', 'defaultBranch', 'branch']) {
          if (service.repo[key] !== undefined) errors.push(`${label}.repo.${key} is only supported for git-managed Services.`);
        }
      }
      if (service.repo.kind === 'git') {
        if (service.repo.url !== undefined && typeof service.repo.url !== 'string') errors.push(`${label}.repo.url must be a string when provided.`);
        if (service.repo.remote !== undefined && typeof service.repo.remote !== 'string') errors.push(`${label}.repo.remote must be a string when provided.`);
        if (service.repo.defaultBranch !== undefined && typeof service.repo.defaultBranch !== 'string') errors.push(`${label}.repo.defaultBranch must be a string when provided.`);
        if (service.repo.branch !== undefined && (typeof service.repo.branch !== 'string' || !service.repo.branch)) errors.push(`${label}.repo.branch must be a non-empty string when provided.`);
      }
    }
    return errors;
  }

  function readProjectsRegistryForWrite(targetRoot: any) {
    const file = projectsManifestPath(targetRoot);
    if (!existsFile(file)) return { schemaVersion: 'buildr.projects/v1', projects: {} };
    const registry = parseProjectsYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateProjectsRegistry(registry)
      .filter((message: any) => !message.endsWith('.title is required.'))
      .filter((message: any) => !message.endsWith('.description is required.'));
    if (errors.length > 0) {
      throw new Error(`projects/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    }
    return registry;
  }

  function writeProjectsRegistry(targetRoot: any, registry: any) {
    const file = projectsManifestPath(targetRoot);
    atomicWriteFile(file, renderProjectsYaml(registry));
    return file;
  }

  function projectsManifestPath(targetRoot: any) {
    return path.join(targetRoot, 'projects', 'manifest.yml');
  }

  function servicesManifestPath(projectRoot: any) {
    return path.join(projectRoot, 'services', 'manifest.yml');
  }

  function readServicesManifestForWrite(projectRoot: any, projectName: any) {
    const file = servicesManifestPath(projectRoot);
    if (!existsFile(file)) return { schemaVersion: 'buildr.services/v1', project: projectName, services: {} };
    const manifest = parseServicesManifestYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateServicesManifest(manifest, projectName)
      .filter((message: any) => !message.endsWith('.title is required.'))
      .filter((message: any) => !message.endsWith('.description is required.'))
      .filter((message: any) => !message.endsWith('.type is required.'));
    if (errors.length > 0) {
      throw new Error(`services/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    }
    return manifest;
  }

  function writeServicesManifest(projectRoot: any, manifest: any) {
    const file = servicesManifestPath(projectRoot);
    atomicWriteFile(file, renderServicesManifestYaml(manifest));
    return file;
  }

  function updateServicesManifest(projectRoot: any, projectName: any, serviceName: any, metadata: any) {
    const manifest = readServicesManifestForWrite(projectRoot, projectName);
    manifest.schemaVersion = 'buildr.services/v1';
    manifest.project = projectName;
    manifest.services[serviceName] = metadata;
    return writeServicesManifest(projectRoot, manifest);
  }

  function gitOutput(args: any, cwd: any) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }

  function gitCurrentBranch(repoPath: any) {
    try {
      const branch = gitOutput(['symbolic-ref', '--short', 'HEAD'], repoPath);
      return branch || 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  function gitDefaultBranch(repoPath: any, remote: any = 'origin') {
    const remoteUrl = readGitRemote(repoPath, remote);
    if (remoteUrl) {
      const result = spawnSync('git', ['ls-remote', '--symref', remoteUrl, 'HEAD'], {
        cwd: repoPath,
        encoding: 'utf8',
        timeout: 30000,
      });
      if (result.status === 0) {
        const match = result.stdout.match(/^ref:\s+refs\/heads\/(.+)\s+HEAD$/m);
        if (match) return match[1];
      }
    }
    try {
      const reference = gitOutput(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`], repoPath);
      return reference.startsWith(`${remote}/`) ? reference.slice(remote.length + 1) : reference;
    } catch {
      return gitCurrentBranch(repoPath);
    }
  }

  function pathInside(parent: any, child: any) {
    const relative = path.relative(parent, child);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  }

  function attachedGitSource(rawPath: any, targetRoot: any, remote: any, integrationBranch: any, label: any) {
    const requested = path.resolve(rawPath);
    if (!path.isAbsolute(rawPath) || path.normalize(rawPath) !== rawPath) throw new Error(`${label} --attach must be a normalized absolute path.`);
    if (!existsDirectory(requested)) throw new Error(`${label} attached root does not exist: ${rawPath}`);
    const actual = fs.realpathSync(requested);
    const workspace = fs.realpathSync(targetRoot);
    if (pathInside(workspace, actual) || pathInside(actual, workspace)) throw new Error(`${label} attached root must be external to and must not contain the canonical Workspace.`);
    let topLevel;
    try { topLevel = fs.realpathSync(gitOutput(['rev-parse', '--show-toplevel'], actual)); }
    catch { throw new Error(`${label} attached root is not a Git repository: ${rawPath}`); }
    if (!sameFilesystemPath(topLevel, actual)) throw new Error(`${label} attached root must be the independent Git top-level: ${rawPath}`);
    const url = readGitRemote(actual, remote);
    if (!url) throw new Error(`${label} attached root is missing declared remote ${remote}: ${rawPath}`);
    const branch = integrationBranch || gitDefaultBranch(actual, remote) || gitCurrentBranch(actual);
    assertGitBranch(branch);
    return { rootPath: actual, source: { type: 'git', root: 'attached', path: actual, git: { url, remote, integrationBranch: branch } } };
  }

  function assertGitBranch(value: any) {
    if (!value) return;
    const result = spawnSync('git', ['check-ref-format', '--branch', value], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Invalid Git branch: ${value}`);
  }

  function defaultAssetDescription(kind: any, id: any) {
    return `TODO: 补充 ${kind} ${id} 的用途说明。`;
  }

  function inferRepoKind(assetRoot: any) {
    return existsDirectory(path.join(assetRoot, '.git')) ? 'git' : 'workspace';
  }

  function ensureIgnoreEntry(repoRoot: any, pattern: any) {
    const changed = appendGitignoreEntries(path.join(repoRoot, '.gitignore'), [pattern]);
    return changed ? toPosixRelative(process.cwd(), path.join(repoRoot, '.gitignore')) : null;
  }

  function gitBoundaryFor(targetRoot: any, item: any) {
    if (!existsDirectory(path.join(item.assetRoot, '.git'))) return null;
    const projectRoot = path.join(targetRoot, 'projects', item.project);
    if (item.type === 'project') {
      if (existsDirectory(path.join(targetRoot, '.git'))) {
        return { repoRoot: targetRoot, pattern: `/projects/${item.project}/` };
      }
      return null;
    }
    if (existsDirectory(path.join(projectRoot, '.git'))) {
      return { repoRoot: projectRoot, pattern: `/services/${item.service}/` };
    }
    if (existsDirectory(path.join(targetRoot, '.git'))) {
      return { repoRoot: targetRoot, pattern: `/projects/${item.project}/services/${item.service}/` };
    }
    return null;
  }

  function ensureGitBoundaries(targetRoot: any, items: any) {
    const changed: any[] = [];
    for (const item of items) {
      const boundary = gitBoundaryFor(targetRoot, item);
      if (!boundary) continue;
      const updated = ensureIgnoreEntry(boundary.repoRoot, boundary.pattern);
      if (updated) changed.push(toPosixRelative(targetRoot, path.join(boundary.repoRoot, '.gitignore')));
    }
    return [...new Set(changed)];
  }

  function gitBoundaryIgnored(boundary: any) {
    if (!boundary) return true;
    const lines = gitignoreLines(boundary.repoRoot);
    return lines.includes(boundary.pattern);
  }

  function trackWrite(targetRoot: any, file: any, content: any, created: any) {
    if (writeIfMissing(file, content)) {
      created.push(path.relative(targetRoot, file).split(path.sep).join('/'));
    }
  }

  function printResult(title: any, targetRoot: any, created: any, changed: any = [], nextActions: any = []) {
    console.log(title);
    if (created.length > 0) {
      console.log('Created:');
      for (const file of created) console.log(`  ${file}`);
    }
    if (changed.length > 0) {
      console.log('Updated:');
      for (const file of changed) console.log(`  ${file}`);
    }
    for (const action of nextActions) console.log(`Next: ${action}`);
  }

  function displayScope(scope: any) {
    return scope === '.' ? 'root (.)' : scope;
  }

  function createProject(args: any) {
    const allowedFlags = new Set(['--target', '--repo', '--attach', '--name', '--title', '--description', '--remote', '--integration-branch']);
    assertNoUnknownOptions(args, allowedFlags);
    const ref = positionalArgs(args)[0];
    if (!ref) throw new Error('Missing project ref');
    const { project } = parseProjectRef(ref);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const repoRef = optionValue(args, '--repo', null);
    const attachRef = optionValue(args, '--attach', null);
    const nameOption = optionValue(args, '--name', optionValue(args, '--title', null));
    const descriptionOption = optionValue(args, '--description', null);
    const remoteOption = optionValue(args, '--remote', 'origin');
    const integrationBranchOption = optionValue(args, '--integration-branch', null);
    assertGitBranch(integrationBranchOption);
    if (repoRef && attachRef) throw new Error('--repo and --attach are mutually exclusive.');
    const attachment = attachRef ? attachedGitSource(attachRef, targetRoot, remoteOption, integrationBranchOption, 'Project') : null;
    const projectRoot = attachment?.rootPath || path.join(targetRoot, 'projects', project);
    const created: any[] = [];
    const changed: any[] = [];
    const manifest = readPackageManifest();
    const registryRecord = runtime.readProjectRegistryRecord(targetRoot);
    if (registryRecord.registry.migrationRequired) {
      throw new Error('Project registry needs migration before project create. Run canonical buildr sync <agent> first.');
    }
    const existingEntry = registryRecord.projects[project] || null;
    if (attachment) {
      for (const [otherCode, other] of Object.entries(registryRecord.projects)) {
        if (otherCode === project) continue;
        let otherRoot;
        try { otherRoot = fs.realpathSync(runtime.resolveProjectRoot(targetRoot, other)); } catch { continue; }
        if (sameFilesystemPath(otherRoot, attachment.rootPath)) throw new Error(`Project attached root is already registered by project:${otherCode}.`);
      }
    }
    const name = nameOption ?? existingEntry?.name ?? project;
    const description = descriptionOption ?? existingEntry?.description ?? defaultAssetDescription('Project', project);

    if (repoRef && !isProjectGitUrl(repoRef)) {
      throw new Error(`Project --repo only supports Git URLs. Project assets must be materialized under projects/${project}; external local Project links are not supported.`);
    }
    const existingGit = existsDirectory(projectRoot) ? runtime.observeProjectGit(projectRoot, remoteOption) : null;
    if (repoRef && existsDirectory(projectRoot) && !existingGit?.repository) {
      throw new Error(`Project repo target exists but is not a Git repository: projects/${project}`);
    }
    if (repoRef && existsDirectory(projectRoot)) {
      const actualUrl = readGitRemote(projectRoot, remoteOption);
      if (!actualUrl || !sameGitIdentity(actualUrl, repoRef)) {
        throw new Error(`Project repo identity conflicts for ${project}: expected ${repoRef}, actual ${actualUrl || '<missing origin>'}. Buildr will not relink an existing Project.`);
      }
      if (existingEntry?.source?.type && existingEntry.source.type !== 'git') {
        throw new Error(`Project registry identity conflicts for ${project}: existing source.type is ${existingEntry.source.type}, requested git.`);
      }
      if (existingEntry?.source?.git?.url && !sameGitIdentity(existingEntry.source.git.url, repoRef)) {
        throw new Error(`Project registry URL conflicts for ${project}: expected ${repoRef}, recorded ${existingEntry.source.git.url}.`);
      }
    }
    if (!repoRef && existingEntry?.source?.type === 'git' && !existingGit?.repository) {
      throw new Error(`Project registry expects a Git repo but materialized Project is not Git-managed: ${project}`);
    }
    if (!repoRef && (integrationBranchOption || optionValue(args, '--remote', null))) {
      throw new Error('--remote and --integration-branch are only supported for Git Project sources.');
    }

    if (attachment && existingEntry && (existingEntry.source.root !== 'attached' || !sameFilesystemPath(fs.realpathSync(existingEntry.source.path), attachment.rootPath))) {
      throw new Error(`Project registry identity conflicts for ${project}: existing source is not the requested attached root.`);
    }
    const affected = attachment ? [projectsManifestPath(targetRoot)] : [projectRoot, projectsManifestPath(targetRoot), path.join(targetRoot, '.gitignore')];
    return withWorkspaceMutation(targetRoot, `project.create:${project}`, affected, () => {
      const staging = path.join(path.dirname(projectRoot), `.${project}.buildr-stage-${crypto.randomUUID()}`);
      try {
        if (!attachment && repoRef && !existsDirectory(projectRoot)) {
          execFileSync('git', ['clone', repoRef, staging], { stdio: 'inherit' });
          fs.renameSync(staging, projectRoot);
        }
        if (attachment) {
          const entity = createProjectEntity({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspace.workspace.id, code: project, name, description, source: attachment.source });
          runtime.writeProjectRegistry(registryRecord.manifestPath, { ...registryRecord.projects, [project]: entity });
          changed.push(toPosixRelative(targetRoot, registryRecord.manifestPath));
          printResult(`Attached project ${project}`, targetRoot, [], changed, [declarationIntakeNextAction({ trigger: 'project-registered', project })]);
          return;
        }
        ensureDirectory(projectRoot);
        for (const relativeDir of manifest.projectDirectories) ensureDirectory(path.join(projectRoot, relativeDir));
        const variables = { project };
        for (const rawEntry of manifest.projectFiles) {
          const entry = parseManifestFileEntry(rawEntry, 'projectFiles');
          writeMappedFileIfMissing(targetRoot, projectRoot, entry, variables, created);
        }
        trackWrite(targetRoot, path.join(projectRoot, 'capabilities.yml'), renderProjectCapabilitiesYaml(), created);
        trackWrite(targetRoot, path.join(projectRoot, 'commands.yml'), renderProjectCommandsYaml(), created);
        const source = repoRef
          ? {
            type: 'git',
            path: `projects/${project}`,
            git: {
              url: repoRef,
              remote: remoteOption,
              integrationBranch: integrationBranchOption || existingEntry?.source?.git?.integrationBranch || gitDefaultBranch(projectRoot, remoteOption),
            },
          }
          : existingEntry?.source?.type === 'git'
            ? existingEntry.source
            : { type: 'workspace', path: `projects/${project}` };
        const entity = createProjectEntity({
          id: existingEntry?.id || runtime.crypto.randomUUID(),
          workspaceId: registryRecord.workspace.workspace.id,
          code: project,
          name,
          description,
          source,
        });
        const serviceRegistryPath = servicesManifestPath(projectRoot);
        const serviceRegistryExists = existsFile(serviceRegistryPath);
        if (serviceRegistryExists) {
          runtime.parseServicesManifest(fs.readFileSync(serviceRegistryPath, 'utf8'), {
            workspaceId: registryRecord.workspace.workspace.id,
            projectId: entity.id,
            projectCode: project,
          });
        }
        runtime.writeProjectRegistry(registryRecord.manifestPath, { ...registryRecord.projects, [project]: entity });
        if (!serviceRegistryExists) {
          runtime.writeServiceRegistry(serviceRegistryPath, entity.id, {}, project);
          created.push(toPosixRelative(targetRoot, serviceRegistryPath));
        }
        const registryPath = registryRecord.manifestPath;
        changed.push(toPosixRelative(targetRoot, registryPath));
        changed.push(...ensureGitBoundaries(targetRoot, [{ type: 'project', project, assetRoot: projectRoot }]));
        printResult(`Created project ${project}`, targetRoot, created, changed, [declarationIntakeNextAction({ trigger: 'project-registered', project })]);
      } finally {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      }
    });
  }

  function createService(args: any) {
    assertNoUnknownOptions(args, new Set(['--target', '--attach', '--name', '--title', '--description', '--type', '--rules', '--branch', '--integration-branch', '--remote', '--json']), new Set(['--json']));
    const positional = positionalArgs(args);
    const ref = positional[0];
    const repoRef = positional[1];
    if (!ref) throw new Error('Missing service ref');
    const attachRef = optionValue(args, '--attach', null);
    if (!repoRef && !attachRef) throw new Error('Missing repo ref or --attach path');
    if (repoRef && attachRef) throw new Error('repo-ref and --attach are mutually exclusive.');

    const { project, service } = parseServiceRef(ref);
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const nameInput = optionValue(args, '--name', optionValue(args, '--title', null));
    const descriptionInput = optionValue(args, '--description', null);
    const serviceType = optionValue(args, '--type', null);
    const rulesSource = optionValue(args, '--rules', null);
    const branchInput = optionValue(args, '--integration-branch', optionValue(args, '--branch', null));
    const remoteInput = optionValue(args, '--remote', 'origin');
    const jsonOutput = args.includes('--json');
    assertGitBranch(branchInput);
    const projectsRecord = runtime.readProjectRegistryRecord(targetRoot);
    const parentProject = projectsRecord.projects[project];
    const projectRoot = parentProject ? runtime.resolveProjectRoot(targetRoot, parentProject) : path.join(targetRoot, 'projects', project);
    const servicesRoot = path.join(projectRoot, 'services');
    const servicePath = path.join(servicesRoot, service);
    const changed: any[] = [];

    if (!fs.existsSync(projectRoot)) {
      createProject([project, '--target', targetRoot]);
    }

    const attachment = attachRef ? attachedGitSource(attachRef, targetRoot, remoteInput, branchInput, 'Service') : null;
    const gitSource = Boolean(attachment) || isGitUrl(repoRef);
    const registryRecord = runtime.readServiceRegistryRecord(targetRoot, project);
    if (registryRecord.registry.migrationRequired) throw new Error('Service registry needs migration before service create. Run canonical buildr sync <agent> first.');
    const existingEntry = registryRecord.services[service] || null;
    if (attachment) {
      for (const [otherCode, other] of Object.entries(registryRecord.services)) {
        if (otherCode === service) continue;
        let otherRoot;
        try { otherRoot = fs.realpathSync(runtime.resolveServiceRoot(targetRoot, other)); } catch { continue; }
        if (sameFilesystemPath(otherRoot, attachment.rootPath)) throw new Error(`Service attached root is already registered by service:${project}/${otherCode}.`);
      }
      for (const [projectCode, registeredProject] of Object.entries(projectsRecord.projects)) {
        let otherRoot;
        try { otherRoot = fs.realpathSync(runtime.resolveProjectRoot(targetRoot, registeredProject)); } catch { continue; }
        if (sameFilesystemPath(otherRoot, attachment.rootPath)) throw new Error(`Service attached root is already registered by project:${projectCode}.`);
      }
    }
    if (branchInput && !gitSource) throw new Error('--integration-branch is only supported for Git Service sources.');
    if (!gitSource && optionValue(args, '--remote', null)) throw new Error('--remote is only supported for Git Service sources.');
    if (branchInput && existingEntry?.source?.git?.integrationBranch && existingEntry.source.git.integrationBranch !== branchInput) {
      throw new Error(`Service integration branch conflicts for ${project}/${service}: requested ${branchInput}, recorded ${existingEntry.source.git.integrationBranch}.`);
    }
    const requestedBranch = branchInput || existingEntry?.source?.git?.integrationBranch || null;
    if (gitSource && !attachment && existsDirectory(servicePath)) {
      if (!existsDirectory(path.join(servicePath, '.git'))) throw new Error(`Service Git target exists but is not a Git repository: projects/${project}/services/${service}`);
      const actualUrl = readGitRemote(servicePath, remoteInput);
      if (!actualUrl || !sameGitIdentity(actualUrl, repoRef)) throw new Error(`Service repo identity conflicts for ${project}/${service}: expected ${repoRef}, actual ${actualUrl || '<missing origin>'}.`);
      if (existingEntry?.source?.type && existingEntry.source.type !== 'git') throw new Error(`Service metadata identity conflicts for ${project}/${service}: existing source.type is ${existingEntry.source.type}, requested git.`);
      if (existingEntry?.source?.git?.url && !sameGitIdentity(existingEntry.source.git.url, repoRef)) throw new Error(`Service metadata URL conflicts for ${project}/${service}: expected ${repoRef}, recorded ${existingEntry.source.git.url}.`);
      const actualBranch = gitCurrentBranch(servicePath);
      if (requestedBranch && actualBranch !== requestedBranch) throw new Error(`Service branch conflicts for ${project}/${service}: expected ${requestedBranch}, actual ${actualBranch}.`);
    }
    const localPath: any = gitSource ? null : path.resolve(repoRef);
    if (!gitSource && !fs.existsSync(localPath)) throw new Error(`Local service source path does not exist: ${repoRef}`);
    if (!gitSource && fs.existsSync(servicePath)) throw new Error(`Service target already exists: projects/${project}/services/${service}`);

    if (attachment && existingEntry && (existingEntry.source.root !== 'attached' || !sameFilesystemPath(fs.realpathSync(existingEntry.source.path), attachment.rootPath))) throw new Error(`Service metadata identity conflicts for ${project}/${service}: existing source is not the requested attached root.`);
    const affected = attachment ? [servicesManifestPath(projectRoot)] : [servicePath, servicesManifestPath(projectRoot), path.join(projectRoot, '.gitignore'), path.join(targetRoot, '.gitignore')];
    return withWorkspaceMutation(targetRoot, `service.create:${project}/${service}`, affected, () => {
      ensureDirectory(servicesRoot);
      const staging = path.join(servicesRoot, `.${service}.buildr-stage-${crypto.randomUUID()}`);
      try {
        if (attachment) {
          const entity = createServiceEntity({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspaceId, projectId: registryRecord.project.id, projectCode: project, code: service, name: nameInput || existingEntry?.name || service, description: descriptionInput || existingEntry?.description || defaultAssetDescription('Service', service), type: serviceType || existingEntry?.type || 'service', source: attachment.source });
          runtime.writeServiceRegistry(registryRecord.manifestPath, registryRecord.project.id, { ...registryRecord.services, [service]: entity }, project);
          changed.push(toPosixRelative(targetRoot, registryRecord.manifestPath));
          const nextActions: any[] = [declarationIntakeAction({ trigger: 'service-registered', project, services: [service] })];
          if (jsonOutput) console.log(JSON.stringify({ ...runtime.serviceDetail(targetRoot, project, service), changed, nextActions }, null, 2));
          else printResult(`Attached service ${project}/${service}`, targetRoot, [], changed, nextActions);
          return;
        }
        if (!fs.existsSync(servicePath)) {
          if (gitSource) {
            const cloneArgs = ['clone'];
            if (requestedBranch) cloneArgs.push('--branch', requestedBranch, '--single-branch');
            cloneArgs.push(repoRef, staging);
            execFileSync('git', cloneArgs, { stdio: 'inherit' });
          }
          else fs.cpSync(localPath, staging, { recursive: true });
          fs.renameSync(staging, servicePath);
        }
        const actualKind = inferRepoKind(servicePath);
        const actualRemote = gitSource ? remoteInput : 'origin';
        const actualUrl = actualKind === 'git' ? (gitSource ? repoRef : readGitRemote(servicePath, actualRemote)) : null;
        const declaredGit = actualKind === 'git' && Boolean(actualUrl);
        const integrationBranch = declaredGit ? (requestedBranch || gitDefaultBranch(servicePath, actualRemote) || gitCurrentBranch(servicePath)) : null;
        const source = declaredGit
          ? { type: 'git', path: `projects/${project}/services/${service}`, git: { url: actualUrl, remote: actualRemote, integrationBranch } }
          : { type: 'workspace', path: `projects/${project}/services/${service}` };
        const entity = createServiceEntity({
          id: existingEntry?.id || runtime.crypto.randomUUID(),
          workspaceId: registryRecord.workspaceId,
          projectId: registryRecord.project.id,
          projectCode: project,
          code: service,
          name: nameInput || existingEntry?.name || service,
          description: descriptionInput || existingEntry?.description || defaultAssetDescription('Service', service),
          type: serviceType || existingEntry?.type || 'service',
          source,
        });
        if (rulesSource) console.error('Warning: --rules is deprecated. Service AGENTS.md is treated as the service rule asset and is not recorded in services/manifest.yml.');
        runtime.writeServiceRegistry(registryRecord.manifestPath, registryRecord.project.id, { ...registryRecord.services, [service]: entity }, project);
        const metadataPath = registryRecord.manifestPath;
        changed.push(path.relative(targetRoot, metadataPath).split(path.sep).join('/'));
        for (const file of ensureGitBoundaries(targetRoot, [{ type: 'service', project, service, assetRoot: servicePath }])) changed.push(file);
        const nextActions: any[] = [declarationIntakeAction({ trigger: 'service-registered', project, services: [service] })];
        if (jsonOutput) console.log(JSON.stringify({ ...runtime.serviceDetail(targetRoot, project, service), changed, nextActions }, null, 2));
        else printResult(`Created service ${project}/${service}`, targetRoot, [], changed, nextActions);
      } finally {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      }
    });
  }

  Object.assign(runtime, { parseProjectRef, parseServiceRef, isGitUrl, isProjectGitUrl, quoteYaml, parseYamlValue, parseServicesYaml, parseServicesManifestYaml, parseProjectsYaml, renderProjectsYaml, validateProjectsRegistry, renderServicesManifestYaml, validateServicesManifest, readProjectsRegistryForWrite, writeProjectsRegistry, projectsManifestPath, servicesManifestPath, readServicesManifestForWrite, writeServicesManifest, updateServicesManifest, gitOutput, gitCurrentBranch, gitDefaultBranch, assertGitBranch, defaultAssetDescription, inferRepoKind, ensureIgnoreEntry, gitBoundaryFor, ensureGitBoundaries, gitBoundaryIgnored, trackWrite, printResult, displayScope, createProject, createService });
  return runtime;
}
