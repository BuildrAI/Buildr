import path from 'node:path';
import type { ServiceRepository } from '../persistence/service-manifest-repository.ts';
import type { WorkspaceSourceFilesystem } from '../infrastructure/workspace-source-filesystem.ts';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.ts';
import type { ProjectCreationInput } from './project-application.ts';

import { createService } from '../domain/service.ts';
import { attachedSource, defaultAssetDescription, sourceIdentity, sourceOwnership, sourceRootKind } from '../domain/source-root.ts';
import { declarationIntakeNextAction } from '../../infrastructure/contracts/declaration-intake.ts';

const declarationIntakeAction: any = declarationIntakeNextAction;

// 创建输入与普通元数据修改共享同一应用对象。
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

export type ServiceApplicationRuntime = {
  serviceRepository: ServiceRepository;
  sourceFiles: WorkspaceSourceFilesystem;
  inspectAttachedGitRoot(rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string): { rootPath: string; url: string; integrationBranch: string };
  cloneSourceRepository(repo: string, destination: string, branch?: string | null): void;
  assertName(value: string, label: string): void;
  assertGitBranch(value: string | null): void;
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
  ensureGitBoundaries(targetRoot: string, items: any[]): string[];
  createProjectAsset(input: ProjectCreationInput): any;
  crypto: { randomUUID(): string };
  observeProjectGit(root: string, remote: string): any;
};

export function serviceError(code: any, message: any, status: any = 400, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

const SERVICE_DOCUMENTS = new Set(['README.md', 'AGENTS.md']);

function assertObject(input: any, code: any, message: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw serviceError(code, message);
}

export function compareServiceGit(service: any, observed: any, sameGitIdentity: any) {
  if (service.source.type !== 'git') return { status: 'not-applicable', findings: [] };
  if (!observed?.available) return { status: 'unavailable', findings: [{ status: 'warning', code: 'service.git_observation_unavailable', message: '无法读取 Service Git 实际状态。' }] };
  const findings: any[] = [];
  if (!observed.repository) findings.push({ status: 'error', code: 'service.git_repository_missing', message: 'Service path 不是可读取的 Git repository。' });
  if (observed.repository && !observed.remoteUrl) findings.push({ status: 'error', code: 'service.git_remote_missing', message: `声明的 Git remote ${service.source.git.remote} 不存在。` });
  if (observed.remoteUrl && !sameGitIdentity(observed.remoteUrl, service.source.git.url)) findings.push({ status: 'error', code: 'service.git_remote_conflict', message: 'Service Git remote URL 与 Domain 声明不一致。', details: { declared: service.source.git.url, observed: observed.remoteUrl } });
  if (observed.currentBranch && observed.currentBranch !== service.source.git.integrationBranch) findings.push({ status: 'warning', code: 'service.git_branch_drift', message: `当前分支 ${observed.currentBranch} 不同于 integration branch ${service.source.git.integrationBranch}。` });
  if (observed.dirty === true) findings.push({ status: 'warning', code: 'service.git_dirty', message: 'Service Git worktree 有未提交变化。' });
  if ((observed.ahead || 0) > 0 || (observed.behind || 0) > 0) findings.push({ status: 'info', code: 'service.git_upstream_drift', message: `当前分支相对 upstream ahead ${observed.ahead ?? '?'} / behind ${observed.behind ?? '?'}。` });
  return { status: findings.some((finding: any) => finding.status === 'error') ? 'error' : findings.length ? 'drift' : 'aligned', findings };
}

export function registerServiceApplication(runtime: ServiceApplicationRuntime) {
  function parentRecord(targetRoot: any, projectCode: any) {
    const projects = runtime.readProjectRegistryRecord(targetRoot);
    if (projects.registry.migrationRequired) throw serviceError('service_project_migration_required', 'Project registry 需要先迁移，才能使用 Service Domain。', 409);
    const project = projects.projects[projectCode];
    if (!project) throw serviceError('service_project_not_found', `Project 不存在：${projectCode}。`, 404);
    return { projects, project, workspaceId: projects.workspace.workspace.id };
  }

  // 读取：登记、列表、详情和文档。
  function readServiceRegistryRecord(targetRoot: any, projectCode: any) {
    try {
      const parent = parentRecord(targetRoot, projectCode);
      const persistence = runtime.serviceRepository.readServiceRegistryPersistence(targetRoot, parent.project, parent.workspaceId);
      return { ...persistence, ...parent, services: persistence.registry.entities };
    } catch (error: any) {
      if (error.code) throw error;
      throw serviceError('service_registry_invalid', error.message, 409, { projectCode, path: `projects/${projectCode}/services/manifest.yml` });
    }
  }

  function publicRegistry(record: any) {
    return {
      project: record.project,
      schemaVersion: record.registry.schemaVersion,
      revision: record.revision,
      migrationRequired: record.registry.migrationRequired,
      services: Object.values(record.services),
      nextActions: record.registry.migrationRequired ? ['请让 Agent 运行 canonical buildr sync <agent>，完成 Service registry v2 安全迁移后再修改。'] : [],
    };
  }

  function listServices(targetRoot: any, projectCode: any) {
    return publicRegistry(readServiceRegistryRecord(targetRoot, projectCode));
  }

  function serviceDetail(targetRoot: any, projectCode: any, code: any) {
    const record = readServiceRegistryRecord(targetRoot, projectCode);
    const service = record.services[code];
    if (!service) throw serviceError('service_not_found', `Service 不存在：${projectCode}/${code}。`, 404);
    let observed: any = null;
    let comparison: any = { status: 'not-applicable', findings: [] };
    const serviceRoot = runtime.sourceFiles.resolveRoot(record.root, service.source);
    if (service.source.type === 'git') {
      observed = runtime.observeProjectGit(serviceRoot, service.source.git.remote);
      comparison = compareServiceGit(service, observed, runtime.sameGitIdentity);
    }
    return { project: record.project, schemaVersion: record.registry.schemaVersion, revision: record.revision, migrationRequired: record.registry.migrationRequired, service, sourceLocation: { root: sourceRootKind(service.source), path: serviceRoot, ownership: sourceOwnership(service.source), identity: sourceIdentity(service.id, service.source) }, observed, comparison, nextActions: publicRegistry(record).nextActions };
  }

  function serviceDocument(targetRoot: string, projectCode: string, code: string, documentPath: unknown) {
    const record = readServiceRegistryRecord(targetRoot, projectCode);
    const entity = record.services[code];
    if (!entity) throw serviceError('service_not_found', `Service 不存在：${projectCode}/${code}。`, 404);
    const document = runtime.sourceFiles.readDocument(runtime.sourceFiles.resolveRoot(record.root, entity.source), documentPath, 'service', serviceError);
    return { schemaVersion: 'buildr.service-document/v1', projectCode, serviceCode: code, ...document, entry: SERVICE_DOCUMENTS.has(document.path) };
  }

  // 变更：迁移和元数据更新。
  function migrateServiceRegistry(targetRoot: any, projectCode: any) {
    const before = readServiceRegistryRecord(targetRoot, projectCode);
    if (!before.registry.migrationRequired) return { ...publicRegistry(before), changed: [] };
    const migrated = Object.values(before.services).map((legacy: any) => {
      let source = legacy.source;
      if (source.type === 'git') {
        const observed = runtime.observeProjectGit(runtime.sourceFiles.resolveRoot(before.root, source), source.git.remote);
        source = { ...source, git: { ...source.git, url: source.git.url || observed.remoteUrl, integrationBranch: source.git.integrationBranch || observed.currentBranch } };
      }
      return createService({ ...legacy, id: runtime.crypto.randomUUID(), workspaceId: before.workspaceId, projectId: before.project.id, projectCode, source });
    });
    return runtime.withWorkspaceMutation(before.root, `service.registry.migrate:${projectCode}`, [before.manifestPath], () => {
      const current = readServiceRegistryRecord(before.root, projectCode);
      if (current.revision !== before.revision) throw serviceError('service_migration_changed', 'Service registry 在迁移预检后发生变化，请重新执行。', 409);
      runtime.serviceRepository.writeServiceRegistry(current.manifestPath, current.project.id, migrated, projectCode);
      const result = readServiceRegistryRecord(before.root, projectCode);
      if (result.registry.migrationRequired) throw new Error('Service registry migration did not produce canonical v2 data.');
      return { ...publicRegistry(result), changed: [`projects/${projectCode}/services/manifest.yml`] };
    });
  }

  function serviceMigrationPlan(targetRoot: any, projectCode: any) {
    const record = readServiceRegistryRecord(targetRoot, projectCode);
    return { required: record.registry.migrationRequired, affectedPaths: [record.manifestPath], signature: JSON.stringify({ revision: record.revision, schemaVersion: record.registry.schemaVersion, projectId: record.project.id }) };
  }

  function updateServiceMetadata(targetRoot: any, projectCode: any, code: any, input: any) {
    assertObject(input, 'service_update_invalid', 'Service 修改请求必须是对象。');
    const allowed = new Set(['revision', 'name', 'description', 'type']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw serviceError('service_update_field_forbidden', `Service 字段不可修改：${field}。`);
    if (typeof input.revision !== 'string' || !input.revision) throw serviceError('service_revision_required', 'Service 修改请求必须包含当前 registry revision。');
    if (input.name === undefined && input.description === undefined && input.type === undefined) throw serviceError('service_update_empty', '至少修改 name、description 或 type。');
    const parent = parentRecord(targetRoot, projectCode);
    const manifestPath = runtime.serviceRepository.serviceDomainManifestPath(targetRoot, parent.project);
    return runtime.withWorkspaceMutation(targetRoot, `service.metadata.update:${projectCode}/${code}`, [manifestPath], () => {
      const current = readServiceRegistryRecord(targetRoot, projectCode);
      if (current.registry.migrationRequired) throw serviceError('service_migration_required', 'Service registry 需要先迁移，当前页面只读。', 409);
      if (current.revision !== input.revision) throw serviceError('service_revision_conflict', 'Service registry 已被其他操作修改，请刷新后重新判断。', 409, { currentRevision: current.revision });
      const existing = current.services[code];
      if (!existing) throw serviceError('service_not_found', `Service 不存在：${projectCode}/${code}。`, 404);
      const updated = createService({ ...existing, projectCode, name: input.name ?? existing.name, description: input.description ?? existing.description, type: input.type ?? existing.type });
      runtime.serviceRepository.writeServiceRegistry(current.manifestPath, current.project.id, { ...current.services, [code]: updated }, projectCode);
      return serviceDetail(targetRoot, projectCode, code);
    });
  }

  // 指令生成：只读，不创建或修改登记。
  function generateServiceCreatePrompt(targetRoot: any, input: any) {
    if (input === undefined) {
      input = targetRoot;
      targetRoot = null;
    }
    assertObject(input, 'service_prompt_invalid', 'Service prompt 请求必须是对象。');
    const allowed = new Set(['projectCode', 'code', 'name', 'description', 'type', 'sourceType', 'localPath', 'gitUrl', 'remote', 'integrationBranch']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw serviceError('service_prompt_field_forbidden', `Service prompt 不支持字段：${field}。`);
    const projectCode = String(input.projectCode || '').trim();
    const code = String(input.code || '').trim();
    const name = String(input.name || '').trim();
    const description = String(input.description || '').trim();
    const type = String(input.type || '').trim();
    if (!projectCode || !name || !description) throw serviceError('service_prompt_fields_required', '请填写所属项目、名称和用途。');
    let project: any = null;
    if (targetRoot) project = parentRecord(targetRoot, projectCode).project;
    const sourceType = input.sourceType === 'git' ? 'git' : 'local';
    const ref = sourceType === 'git' ? String(input.gitUrl || '').trim() || '<尚未提供 Git URL>' : String(input.localPath || '').trim() || '<尚未提供本地路径>';
    const options: string[] = [`--name ${JSON.stringify(name)}`, `--description ${JSON.stringify(description)}`];
    if (type) options.push(`--type ${JSON.stringify(type)}`);
    if (sourceType === 'git') options.push(`--remote ${JSON.stringify(String(input.remote || '').trim() || 'origin')}`, `--integration-branch ${JSON.stringify(String(input.integrationBranch || '').trim() || '<请先解析远端 HEAD 或询问>')}`);
    return {
      prompt: ['请在当前 Buildr 工作空间中创建或接入一个服务。', '', `所属项目：${project ? `${project.name}（${project.code}）` : projectCode}`, `代码：${code || '<尚未提供，请根据名称、来源和现有资产提出候选并确认>'}`, `名称：${name}`, `用途：${description}`, `类型：${type || '<尚未提供，请由 Agent 根据真实资产提出候选>'}`, `来源：${sourceType === 'git' ? 'Git 仓库' : '本地路径'}`, `来源引用：${ref}`, ...(code ? [`物化路径：projects/${projectCode}/services/${code}`] : ['物化路径：尚未确定；先确认代码后再计算。']), '', '执行要求：', '1. 读取并遵循 Buildr Skill，核对工作空间与所属项目身份。', '2. 先确认该项目是否确实需要代码仓、应用、模块或可执行资产；不需要时可直接保持项目范围工作。', '3. 在写入前核对来源、目标目录和嵌套 Git 所有权，不保留工作空间外部本地路径。', sourceType === 'git' ? '4. 核对 Git 地址、远端名称、集成分支与既有仓库/元数据身份，不盲目 checkout 或 stash。' : '4. 校验本地来源可访问且目标不存在，不创建外部目录链接。', code ? `5. 使用标准命令 buildr service create ${projectCode}/${code} ${JSON.stringify(ref)} ${options.join(' ')} 完成创建。` : '5. 补齐必要代码、类型和来源声明后，再使用标准 buildr service create；不要猜测缺失信息。', `6. 创建成功后，${declarationIntakeAction({ trigger: 'service-registered', project: projectCode, services: [code || '<confirmed-service-code>'] })}`, '7. 完成后运行适用 doctor，说明服务范围、实际路径、Git 状态和剩余问题。'].join('\n'),
      copiedMeansCreated: false,
    };
  }

  // 创建/附接：应用确定顺序与事务范围，技术对象执行物化。
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
    const attachment = attachRef ? attachedSource(runtime.inspectAttachedGitRoot(attachRef, targetRoot, remote, integrationBranch, 'Service'), remote) : null;
    const gitSource = Boolean(attachment) || Boolean(repoRef && runtime.isGitUrl(repoRef));
    const registryRecord = runtime.readServiceRegistryRecord(targetRoot, project);
    if (registryRecord.registry.migrationRequired) throw new Error('Service registry needs migration before service create. Run canonical buildr sync <agent> first.');
    const existingEntry = registryRecord.services[service] || null;

    if (attachment) {
      for (const [otherCode, other] of Object.entries(registryRecord.services)) {
        if (otherCode === service) continue;
        let otherRoot;
        try { otherRoot = runtime.sourceFiles.realpath(runtime.resolveServiceRoot(targetRoot, other)); } catch { continue; }
        if (sameFilesystemPath(otherRoot, attachment.rootPath)) throw new Error(`Service attached root is already registered by service:${project}/${otherCode}.`);
      }
      for (const [projectCode, registeredProject] of Object.entries(projectsRecord.projects)) {
        let otherRoot;
        try { otherRoot = runtime.sourceFiles.realpath(runtime.resolveProjectRoot(targetRoot, registeredProject)); } catch { continue; }
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
    if (!gitSource && !runtime.sourceFiles.exists(localPath!)) throw new Error(`Local service source path does not exist: ${repoRef}`);
    if (!gitSource && runtime.sourceFiles.exists(servicePath)) throw new Error(`Service target already exists: projects/${project}/services/${service}`);
    if (attachment && existingEntry && (existingEntry.source.root !== 'attached' || !sameFilesystemPath(runtime.sourceFiles.realpath(existingEntry.source.path), attachment.rootPath))) throw new Error(`Service metadata identity conflicts for ${project}/${service}: existing source is not the requested attached root.`);

    const affected = attachment ? [registryRecord.manifestPath] : [servicePath, registryRecord.manifestPath, path.join(projectRoot, '.gitignore'), path.join(targetRoot, '.gitignore')];
    const result = runtime.withWorkspaceMutation(targetRoot, `service.create:${project}/${service}`, affected, () => {
      runtime.ensureDirectory(servicesRoot);
      return runtime.sourceFiles.withStaging(servicePath, (staging) => {
        if (attachment) {
          const entity = createService({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspaceId, projectId: registryRecord.project.id, projectCode: project, code: service, name: input.name || existingEntry?.name || service, description: input.description || existingEntry?.description || defaultAssetDescription('Service', service), type: input.type || existingEntry?.type || 'service', source: attachment.source });
          runtime.serviceRepository.writeServiceRegistry(registryRecord.manifestPath, registryRecord.project.id, { ...registryRecord.services, [service]: entity }, project);
          changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
        } else {
          if (!runtime.sourceFiles.exists(servicePath)) {
            if (gitSource) {
              runtime.cloneSourceRepository(repoRef!, staging, requestedBranch);
            } else runtime.sourceFiles.copy(localPath!, staging);
            runtime.sourceFiles.publish(staging, servicePath);
          }
          const actualKind = runtime.inferRepoKind(servicePath);
          const actualUrl = actualKind === 'git' ? (gitSource ? repoRef : runtime.readGitRemote(servicePath, remote)) : null;
          const declaredGit = actualKind === 'git' && Boolean(actualUrl);
          const branch = declaredGit ? (requestedBranch || runtime.gitDefaultBranch(servicePath, remote) || runtime.gitCurrentBranch(servicePath)) : null;
          const source = declaredGit
            ? { type: 'git', path: `projects/${project}/services/${service}`, git: { url: actualUrl, remote, integrationBranch: branch } }
            : { type: 'workspace', path: `projects/${project}/services/${service}` };
          const entity = createService({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspaceId, projectId: registryRecord.project.id, projectCode: project, code: service, name: input.name || existingEntry?.name || service, description: input.description || existingEntry?.description || defaultAssetDescription('Service', service), type: input.type || existingEntry?.type || 'service', source });
          runtime.serviceRepository.writeServiceRegistry(registryRecord.manifestPath, registryRecord.project.id, { ...registryRecord.services, [service]: entity }, project);
          changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
          changed.push(...runtime.ensureGitBoundaries(targetRoot, [{ type: 'service', project, service, assetRoot: servicePath }]));
        }
        return {
          ...serviceDetail(targetRoot, project, service),
          changed,
          nextActions: [declarationIntakeNextAction({ trigger: 'service-registered', project, services: [service] })],
          projectResult,
          warning: input.rulesSource ? 'Warning: --rules is deprecated. Service AGENTS.md is treated as the service rule asset and is not recorded in services/manifest.yml.' : null,
        };
      });
    });
    return result;
  }

  Object.assign(runtime, { createServiceAsset, readServiceRegistryRecord, listServices, serviceDetail, serviceDocument, serviceMigrationPlan, migrateServiceRegistry, updateServiceMetadata, generateServiceCreatePrompt });
  return runtime;
}
