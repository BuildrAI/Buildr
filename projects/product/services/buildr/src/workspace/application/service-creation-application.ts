import fs from 'node:fs';
import path from 'node:path';

import { execFileSync } from '../../infrastructure/process.ts';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.ts';
import { createService as createServiceEntity } from '../domain/service.ts';
import { declarationIntakeNextAction } from '../../infrastructure/contracts/declaration-intake.ts';
import type { ProjectCreationInput } from './project-creation-application.ts';

export type ServiceCreationInput = {
  targetRoot: string;
  project: string;
  service: string;
  repoRef: string | null;
  attachRef: string | null;
  name: string | null;
  description: string | null;
  type: string | null;
  rulesSource: string | null;
  integrationBranch: string | null;
  remote: string;
  remoteExplicit: boolean;
  json: boolean;
};

export type ServiceCreationRuntime = {
  assertName(value: string, label: string): void;
  assertGitBranch(value: string | null): void;
  attachedGitSource(rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string): any;
  isGitUrl(value: string): boolean;
  existsDirectory(directory: string): boolean;
  readProjectRegistryRecord(targetRoot: string): any;
  resolveProjectRoot(targetRoot: string, project: any): string;
  resolveServiceRoot(targetRoot: string, service: any): string;
  readServiceRegistryRecord(targetRoot: string, projectCode: string): any;
  readGitRemote(root: string, remote: string): string | null;
  sameGitIdentity(left: string, right: string): boolean;
  gitCurrentBranch(root: string): string;
  gitDefaultBranch(root: string, remote?: string): string;
  inferRepoKind(root: string): 'git' | 'workspace';
  withWorkspaceMutation(root: string, operation: string, affected: string[], action: () => any): any;
  ensureDirectory(directory: string): void;
  writeServiceRegistry(file: string, projectId: string, services: any, projectCode?: string): void;
  ensureGitBoundaries(targetRoot: string, items: any[]): string[];
  defaultAssetDescription(kind: 'Service', id: string): string;
  serviceDetail(targetRoot: string, projectCode: string, serviceCode: string): any;
  createProjectAsset(input: ProjectCreationInput): any;
  crypto: { randomUUID(): string };
};

export function registerServiceCreationApplication(runtime: ServiceCreationRuntime) {
  function createServiceAsset(input: ServiceCreationInput) {
    const { targetRoot, project, service, repoRef, attachRef, remote, integrationBranch } = input;
    runtime.assertName(project, 'Project');
    runtime.assertName(service, 'Service');
    runtime.assertGitBranch(integrationBranch);
    if (!repoRef && !attachRef) throw new Error('Missing repo ref or --attach path');
    if (repoRef && attachRef) throw new Error('repo-ref and --attach are mutually exclusive.');

    let projectsRecord = runtime.readProjectRegistryRecord(targetRoot);
    let parentProject = projectsRecord.projects[project];
    let projectResult = null;
    if (!parentProject) {
      projectResult = runtime.createProjectAsset({
        targetRoot, project, repoRef: null, attachRef: null, name: null, description: null,
        remote: 'origin', remoteExplicit: false, integrationBranch: null,
      });
      projectsRecord = runtime.readProjectRegistryRecord(targetRoot);
      parentProject = projectsRecord.projects[project];
    }
    const projectRoot = runtime.resolveProjectRoot(targetRoot, parentProject);
    const servicesRoot = path.join(projectRoot, 'services');
    const servicePath = path.join(servicesRoot, service);
    const changed: string[] = [];
    const attachment = attachRef ? runtime.attachedGitSource(attachRef, targetRoot, remote, integrationBranch, 'Service') : null;
    const gitSource = Boolean(attachment) || Boolean(repoRef && runtime.isGitUrl(repoRef));
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
    if (integrationBranch && !gitSource) throw new Error('--integration-branch is only supported for Git Service sources.');
    if (!gitSource && input.remoteExplicit) throw new Error('--remote is only supported for Git Service sources.');
    if (integrationBranch && existingEntry?.source?.git?.integrationBranch && existingEntry.source.git.integrationBranch !== integrationBranch) throw new Error(`Service integration branch conflicts for ${project}/${service}: requested ${integrationBranch}, recorded ${existingEntry.source.git.integrationBranch}.`);
    const requestedBranch = integrationBranch || existingEntry?.source?.git?.integrationBranch || null;
    if (gitSource && !attachment && runtime.existsDirectory(servicePath)) {
      if (!runtime.existsDirectory(path.join(servicePath, '.git'))) throw new Error(`Service Git target exists but is not a Git repository: projects/${project}/services/${service}`);
      const actualUrl = runtime.readGitRemote(servicePath, remote);
      if (!actualUrl || !runtime.sameGitIdentity(actualUrl, repoRef || '')) throw new Error(`Service repo identity conflicts for ${project}/${service}: expected ${repoRef}, actual ${actualUrl || '<missing origin>'}.`);
      if (existingEntry?.source?.type && existingEntry.source.type !== 'git') throw new Error(`Service metadata identity conflicts for ${project}/${service}: existing source.type is ${existingEntry.source.type}, requested git.`);
      if (existingEntry?.source?.git?.url && !runtime.sameGitIdentity(existingEntry.source.git.url, repoRef || '')) throw new Error(`Service metadata URL conflicts for ${project}/${service}: expected ${repoRef}, recorded ${existingEntry.source.git.url}.`);
      const actualBranch = runtime.gitCurrentBranch(servicePath);
      if (requestedBranch && actualBranch !== requestedBranch) throw new Error(`Service branch conflicts for ${project}/${service}: expected ${requestedBranch}, actual ${actualBranch}.`);
    }
    const localPath = gitSource ? null : path.resolve(repoRef || '');
    if (!gitSource && !fs.existsSync(localPath!)) throw new Error(`Local service source path does not exist: ${repoRef}`);
    if (!gitSource && fs.existsSync(servicePath)) throw new Error(`Service target already exists: projects/${project}/services/${service}`);
    if (attachment && existingEntry && (existingEntry.source.root !== 'attached' || !sameFilesystemPath(fs.realpathSync(existingEntry.source.path), attachment.rootPath))) throw new Error(`Service metadata identity conflicts for ${project}/${service}: existing source is not the requested attached root.`);

    const affected = attachment ? [registryRecord.manifestPath] : [servicePath, registryRecord.manifestPath, path.join(projectRoot, '.gitignore'), path.join(targetRoot, '.gitignore')];
    const result = runtime.withWorkspaceMutation(targetRoot, `service.create:${project}/${service}`, affected, () => {
      runtime.ensureDirectory(servicesRoot);
      const staging = path.join(servicesRoot, `.${service}.buildr-stage-${runtime.crypto.randomUUID()}`);
      try {
        if (attachment) {
          const entity = createServiceEntity({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspaceId, projectId: registryRecord.project.id, projectCode: project, code: service, name: input.name || existingEntry?.name || service, description: input.description || existingEntry?.description || runtime.defaultAssetDescription('Service', service), type: input.type || existingEntry?.type || 'service', source: attachment.source });
          runtime.writeServiceRegistry(registryRecord.manifestPath, registryRecord.project.id, { ...registryRecord.services, [service]: entity }, project);
          changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
        } else {
          if (!fs.existsSync(servicePath)) {
            if (gitSource) {
              const cloneArgs = ['clone'];
              if (requestedBranch) cloneArgs.push('--branch', requestedBranch, '--single-branch');
              cloneArgs.push(repoRef!, staging);
              execFileSync('git', cloneArgs, { stdio: 'inherit' });
            } else fs.cpSync(localPath!, staging, { recursive: true });
            fs.renameSync(staging, servicePath);
          }
          const actualKind = runtime.inferRepoKind(servicePath);
          const actualUrl = actualKind === 'git' ? (gitSource ? repoRef : runtime.readGitRemote(servicePath, remote)) : null;
          const declaredGit = actualKind === 'git' && Boolean(actualUrl);
          const branch = declaredGit ? (requestedBranch || runtime.gitDefaultBranch(servicePath, remote) || runtime.gitCurrentBranch(servicePath)) : null;
          const source = declaredGit
            ? { type: 'git', path: `projects/${project}/services/${service}`, git: { url: actualUrl, remote, integrationBranch: branch } }
            : { type: 'workspace', path: `projects/${project}/services/${service}` };
          const entity = createServiceEntity({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspaceId, projectId: registryRecord.project.id, projectCode: project, code: service, name: input.name || existingEntry?.name || service, description: input.description || existingEntry?.description || runtime.defaultAssetDescription('Service', service), type: input.type || existingEntry?.type || 'service', source });
          runtime.writeServiceRegistry(registryRecord.manifestPath, registryRecord.project.id, { ...registryRecord.services, [service]: entity }, project);
          changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
          changed.push(...runtime.ensureGitBoundaries(targetRoot, [{ type: 'service', project, service, assetRoot: servicePath }]));
        }
        return {
          ...runtime.serviceDetail(targetRoot, project, service),
          changed,
          nextActions: [declarationIntakeNextAction({ trigger: 'service-registered', project, services: [service] })],
          projectResult,
          warning: input.rulesSource ? 'Warning: --rules is deprecated. Service AGENTS.md is treated as the service rule asset and is not recorded in services/manifest.yml.' : null,
        };
      } finally {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      }
    });
    return result;
  }

  return Object.assign(runtime, { createServiceAsset });
}
