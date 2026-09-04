import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { execFileSync } from '../../infrastructure/process.ts';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.ts';
import { createProject as createProjectEntity } from '../domain/project.ts';
import { declarationIntakeNextAction } from '../../infrastructure/contracts/declaration-intake.ts';

export type ProjectCreationInput = {
  targetRoot: string;
  project: string;
  repoRef: string | null;
  attachRef: string | null;
  name: string | null;
  description: string | null;
  remote: string;
  remoteExplicit: boolean;
  integrationBranch: string | null;
};

export type ProjectCreationRuntime = {
  assertName(value: string, label: string): void;
  assertGitBranch(value: string | null): void;
  attachedGitSource(rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string): any;
  readPackageManifest(): any;
  readProjectRegistryRecord(targetRoot: string): any;
  resolveProjectRoot(targetRoot: string, project: any): string;
  readGitRemote(root: string, remote: string): string | null;
  sameGitIdentity(left: string, right: string): boolean;
  isProjectGitUrl(value: string): boolean;
  existsDirectory(directory: string): boolean;
  observeProjectGit(root: string, remote: string): any;
  withWorkspaceMutation(root: string, operation: string, affected: string[], action: () => any): any;
  parseManifestFileEntry(entry: any, field: string): any;
  writeMappedFileIfMissing(targetRoot: string, destinationRoot: string, entry: any, variables: any, created: string[]): void;
  ensureDirectory(directory: string): void;
  trackWrite(targetRoot: string, file: string, content: string, created: string[]): void;
  renderProjectCapabilitiesYaml(): string;
  renderProjectCommandsYaml(): string;
  gitDefaultBranch(root: string, remote?: string): string;
  parseServicesManifest(content: string, options: any): any;
  writeProjectRegistry(file: string, projects: any): void;
  writeServiceRegistry(file: string, projectId: string, services: any, projectCode?: string): void;
  servicesManifestPath(projectRoot: string): string;
  ensureGitBoundaries(targetRoot: string, items: any[]): string[];
  defaultAssetDescription(kind: 'Project', id: string): string;
  crypto: { randomUUID(): string };
};

export function registerProjectCreationApplication(runtime: ProjectCreationRuntime) {
  function createProjectAsset(input: ProjectCreationInput) {
    const { targetRoot, project, repoRef, attachRef, remote, integrationBranch } = input;
    runtime.assertName(project, 'Project');
    runtime.assertGitBranch(integrationBranch);
    if (repoRef && attachRef) throw new Error('--repo and --attach are mutually exclusive.');
    const attachment = attachRef ? runtime.attachedGitSource(attachRef, targetRoot, remote, integrationBranch, 'Project') : null;
    const registryRecord = runtime.readProjectRegistryRecord(targetRoot);
    if (registryRecord.registry.migrationRequired) throw new Error('Project registry needs migration before project create. Run canonical buildr sync <agent> first.');
    const existingEntry = registryRecord.projects[project] || null;
    const projectRoot = attachment?.rootPath || path.join(targetRoot, 'projects', project);
    const created: string[] = [];
    const changed: string[] = [];

    if (attachment) {
      for (const [otherCode, other] of Object.entries(registryRecord.projects)) {
        if (otherCode === project) continue;
        let otherRoot;
        try { otherRoot = fs.realpathSync(runtime.resolveProjectRoot(targetRoot, other)); } catch { continue; }
        if (sameFilesystemPath(otherRoot, attachment.rootPath)) throw new Error(`Project attached root is already registered by project:${otherCode}.`);
      }
    }

    const name = input.name ?? existingEntry?.name ?? project;
    const description = input.description ?? existingEntry?.description ?? runtime.defaultAssetDescription('Project', project);
    if (repoRef && !runtime.isProjectGitUrl(repoRef)) throw new Error(`Project --repo only supports Git URLs. Project assets must be materialized under projects/${project}; external local Project links are not supported.`);
    const existingGit = runtime.existsDirectory(projectRoot) ? runtime.observeProjectGit(projectRoot, remote) : null;
    if (repoRef && runtime.existsDirectory(projectRoot) && !existingGit?.repository) throw new Error(`Project repo target exists but is not a Git repository: projects/${project}`);
    if (repoRef && runtime.existsDirectory(projectRoot)) {
      const actualUrl = runtime.readGitRemote(projectRoot, remote);
      if (!actualUrl || !runtime.sameGitIdentity(actualUrl, repoRef)) throw new Error(`Project repo identity conflicts for ${project}: expected ${repoRef}, actual ${actualUrl || '<missing origin>'}. Buildr will not relink an existing Project.`);
      if (existingEntry?.source?.type && existingEntry.source.type !== 'git') throw new Error(`Project registry identity conflicts for ${project}: existing source.type is ${existingEntry.source.type}, requested git.`);
      if (existingEntry?.source?.git?.url && !runtime.sameGitIdentity(existingEntry.source.git.url, repoRef)) throw new Error(`Project registry URL conflicts for ${project}: expected ${repoRef}, recorded ${existingEntry.source.git.url}.`);
    }
    if (!repoRef && existingEntry?.source?.type === 'git' && !existingGit?.repository) throw new Error(`Project registry expects a Git repo but materialized Project is not Git-managed: ${project}`);
    if (!repoRef && (integrationBranch || input.remoteExplicit)) throw new Error('--remote and --integration-branch are only supported for Git Project sources.');
    if (attachment && existingEntry && (existingEntry.source.root !== 'attached' || !sameFilesystemPath(fs.realpathSync(existingEntry.source.path), attachment.rootPath))) throw new Error(`Project registry identity conflicts for ${project}: existing source is not the requested attached root.`);

    const affected = attachment ? [registryRecord.manifestPath] : [projectRoot, registryRecord.manifestPath, path.join(targetRoot, '.gitignore')];
    return runtime.withWorkspaceMutation(targetRoot, `project.create:${project}`, affected, () => {
      const staging = path.join(path.dirname(projectRoot), `.${project}.buildr-stage-${crypto.randomUUID()}`);
      try {
        if (repoRef && !runtime.existsDirectory(projectRoot)) {
          execFileSync('git', ['clone', repoRef, staging], { stdio: 'inherit' });
          fs.renameSync(staging, projectRoot);
        }
        if (attachment) {
          const entity = createProjectEntity({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspace.workspace.id, code: project, name, description, source: attachment.source });
          runtime.writeProjectRegistry(registryRecord.manifestPath, { ...registryRecord.projects, [project]: entity });
          changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
          return { operation: 'attach', project, targetRoot, created, changed, nextActions: [declarationIntakeNextAction({ trigger: 'project-registered', project })] };
        }
        runtime.ensureDirectory(projectRoot);
        const manifest = runtime.readPackageManifest();
        for (const relativeDir of manifest.projectDirectories) runtime.ensureDirectory(path.join(projectRoot, relativeDir));
        for (const rawEntry of manifest.projectFiles) runtime.writeMappedFileIfMissing(targetRoot, projectRoot, runtime.parseManifestFileEntry(rawEntry, 'projectFiles'), { project }, created);
        runtime.trackWrite(targetRoot, path.join(projectRoot, 'capabilities.yml'), runtime.renderProjectCapabilitiesYaml(), created);
        runtime.trackWrite(targetRoot, path.join(projectRoot, 'commands.yml'), runtime.renderProjectCommandsYaml(), created);
        const source = repoRef
          ? { type: 'git', path: `projects/${project}`, git: { url: repoRef, remote, integrationBranch: integrationBranch || existingEntry?.source?.git?.integrationBranch || runtime.gitDefaultBranch(projectRoot, remote) } }
          : existingEntry?.source?.type === 'git' ? existingEntry.source : { type: 'workspace', path: `projects/${project}` };
        const entity = createProjectEntity({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspace.workspace.id, code: project, name, description, source });
        const serviceRegistryPath = runtime.servicesManifestPath(projectRoot);
        const serviceRegistryExists = fs.existsSync(serviceRegistryPath);
        if (serviceRegistryExists) runtime.parseServicesManifest(fs.readFileSync(serviceRegistryPath, 'utf8'), { workspaceId: registryRecord.workspace.workspace.id, projectId: entity.id, projectCode: project });
        runtime.writeProjectRegistry(registryRecord.manifestPath, { ...registryRecord.projects, [project]: entity });
        if (!serviceRegistryExists) {
          runtime.writeServiceRegistry(serviceRegistryPath, entity.id, {}, project);
          created.push(path.relative(targetRoot, serviceRegistryPath).split(path.sep).join('/'));
        }
        changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
        changed.push(...runtime.ensureGitBoundaries(targetRoot, [{ type: 'project', project, assetRoot: projectRoot }]));
        return { operation: 'create', project, targetRoot, created, changed, nextActions: [declarationIntakeNextAction({ trigger: 'project-registered', project })] };
      } finally {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      }
    });
  }

  return Object.assign(runtime, { createProjectAsset });
}
