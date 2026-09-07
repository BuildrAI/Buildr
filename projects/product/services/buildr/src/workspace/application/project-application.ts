import path from 'node:path';
import type { ServiceRepository } from '../persistence/service-manifest-repository.ts';
import type { ProjectRepository } from '../persistence/project-manifest-repository.ts';
import type { WorkspaceSourceFilesystem } from '../infrastructure/workspace-source-filesystem.ts';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.ts';

import { createProject } from '../domain/project.ts';
import { attachedSource, defaultAssetDescription, sourceIdentity, sourceOwnership, sourceRootKind } from '../domain/source-root.ts';
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

export type ProjectApplicationRuntime = {
  serviceRepository: ServiceRepository;
  projectRepository: ProjectRepository;
  sourceFiles: WorkspaceSourceFilesystem;
  inspectAttachedGitRoot(rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string): { rootPath: string; url: string; integrationBranch: string };
  cloneSourceRepository(repo: string, destination: string, branch?: string | null): void;
  assertName(value: string, label: string): void;
  assertGitBranch(value: string | null): void;
  readPackageManifest(): any;
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
  ensureGitBoundaries(targetRoot: string, items: any[]): string[];
  crypto: { randomUUID(): string };
  getWorkspace(targetRoot: string): any;
};

export function projectError(code: any, message: any, status: any = 400, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

const PROJECT_DOCUMENTS = new Set(['README.md', 'AGENTS.md']);

function assertObject(input: any, code: any, message: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw projectError(code, message);
}

export function compareProjectGit(project: any, observed: any, sameGitIdentity: any) {
  if (project.source.type !== 'git') return { status: 'not-applicable', findings: [] };
  if (!observed?.available) return { status: 'unavailable', findings: [{ status: 'warning', code: 'project.git_observation_unavailable', message: '无法读取 Project Git 实际状态。' }] };
  const findings: any[] = [];
  if (!observed.repository) findings.push({ status: 'error', code: 'project.git_repository_missing', message: 'Project path 不是可读取的 Git repository。' });
  if (observed.repository && !observed.remoteUrl) findings.push({ status: 'error', code: 'project.git_remote_missing', message: `声明的 Git remote ${project.source.git.remote} 不存在。` });
  if (observed.remoteUrl && !sameGitIdentity(observed.remoteUrl, project.source.git.url)) {
    findings.push({ status: 'error', code: 'project.git_remote_conflict', message: 'Project Git remote URL 与 Domain 声明不一致。', details: { declared: project.source.git.url, observed: observed.remoteUrl } });
  }
  if (observed.currentBranch && observed.currentBranch !== project.source.git.integrationBranch) {
    findings.push({ status: 'warning', code: 'project.git_branch_drift', message: `当前分支 ${observed.currentBranch} 不同于 integration branch ${project.source.git.integrationBranch}。` });
  }
  if (observed.dirty === true) findings.push({ status: 'warning', code: 'project.git_dirty', message: 'Project Git worktree 有未提交变化。' });
  if ((observed.ahead || 0) > 0 || (observed.behind || 0) > 0) {
    findings.push({ status: 'info', code: 'project.git_upstream_drift', message: `当前分支相对 upstream ahead ${observed.ahead ?? '?'} / behind ${observed.behind ?? '?'}。` });
  }
  return { status: findings.some((finding: any) => finding.status === 'error') ? 'error' : findings.length ? 'drift' : 'aligned', findings };
}

export function registerProjectApplication(runtime: ProjectApplicationRuntime) {
  // 读取：登记、列表、详情和文档。
  function readProjectRegistryRecord(targetRoot: any) {
    let workspace;
    let persistence;
    try {
      workspace = runtime.getWorkspace(targetRoot);
      const workspaceId = workspace.workspace.id;
      if (!workspaceId) throw projectError('project_workspace_migration_required', 'Workspace metadata 需要先完成 identity 迁移。', 409);
      persistence = runtime.projectRepository.readProjectRegistryPersistence(targetRoot, { workspaceId });
    } catch (error: any) {
      if (error.code) throw error;
      throw projectError('project_registry_invalid', error.message, 409, { path: 'projects/manifest.yml' });
    }
    return { ...persistence, workspace, projects: persistence.registry.entities };
  }

  function publicRegistry(record: any) {
    return {
      schemaVersion: record.registry.schemaVersion,
      revision: record.revision,
      migrationRequired: record.registry.migrationRequired,
      projects: Object.values(record.projects),
      nextActions: record.registry.migrationRequired
        ? ['请让 Agent 运行 canonical buildr sync <agent>，完成 Project registry v2 安全迁移后再修改。']
        : [],
    };
  }

  function listProjects(targetRoot: any) {
    return publicRegistry(readProjectRegistryRecord(targetRoot));
  }

  function projectDetail(targetRoot: any, code: any) {
    const record = readProjectRegistryRecord(targetRoot);
    const project = record.projects[code];
    if (!project) throw projectError('project_not_found', `Project 不存在：${code}。`, 404);
    let observed: any = null;
    let comparison: any = { status: 'not-applicable', findings: [] };
    const projectRoot = runtime.sourceFiles.resolveRoot(record.root, project.source);
    if (project.source.type === 'git') {
      observed = runtime.observeProjectGit(projectRoot, project.source.git.remote);
      comparison = compareProjectGit(project, observed, runtime.sameGitIdentity);
    }
    return {
      schemaVersion: record.registry.schemaVersion,
      revision: record.revision,
      migrationRequired: record.registry.migrationRequired,
      project,
      sourceLocation: { root: sourceRootKind(project.source), path: projectRoot, ownership: sourceOwnership(project.source), identity: sourceIdentity(project.id, project.source) },
      observed,
      comparison,
      nextActions: publicRegistry(record).nextActions,
    };
  }

  function projectDocument(targetRoot: string, code: string, documentPath: unknown) {
    const record = readProjectRegistryRecord(targetRoot);
    const entity = record.projects[code];
    if (!entity) throw projectError('project_not_found', `Project 不存在：${code}。`, 404);
    const document = runtime.sourceFiles.readDocument(runtime.sourceFiles.resolveRoot(record.root, entity.source), documentPath, 'project', projectError);
    return { schemaVersion: 'buildr.project-document/v1', projectCode: code, ...document, entry: PROJECT_DOCUMENTS.has(document.path) };
  }

  // 变更：迁移和元数据更新。
  function migrateProjectRegistry(targetRoot: any) {
    const before = readProjectRegistryRecord(targetRoot);
    if (!before.registry.migrationRequired) return { ...publicRegistry(before), changed: [] };
    const workspaceId = before.workspace.workspace.id;
    const migrated = Object.values(before.projects).map((legacy: any) => {
      let source = legacy.source;
      if (source.type === 'git') {
        const observed = runtime.observeProjectGit(runtime.sourceFiles.resolveRoot(before.root, source), source.git.remote);
        const url = source.git.url || observed.remoteUrl;
        const integrationBranch = source.git.integrationBranch || observed.currentBranch;
        source = { ...source, git: { ...source.git, url, integrationBranch } };
      }
      return createProject({ ...legacy, id: runtime.crypto.randomUUID(), workspaceId, source });
    });
    return runtime.withWorkspaceMutation(before.root, 'project.registry.migrate', [before.manifestPath], () => {
      const current = readProjectRegistryRecord(before.root);
      if (current.revision !== before.revision) throw projectError('project_migration_changed', 'Project registry 在迁移预检后发生变化，请重新执行。', 409);
      runtime.projectRepository.writeProjectRegistry(current.manifestPath, migrated);
      const result = readProjectRegistryRecord(before.root);
      if (result.registry.migrationRequired) throw new Error('Project registry migration did not produce canonical v2 data.');
      return { ...publicRegistry(result), changed: ['projects/manifest.yml'] };
    });
  }

  function projectMigrationPlan(targetRoot: any) {
    const record = readProjectRegistryRecord(targetRoot);
    return {
      required: record.registry.migrationRequired,
      affectedPaths: [record.manifestPath],
      signature: JSON.stringify({ revision: record.revision, schemaVersion: record.registry.schemaVersion }),
    };
  }

  function updateProjectMetadata(targetRoot: any, code: any, input: any) {
    assertObject(input, 'project_update_invalid', 'Project 修改请求必须是对象。');
    const allowed = new Set(['revision', 'name', 'description']);
    for (const field of Object.keys(input)) {
      if (!allowed.has(field)) throw projectError('project_update_field_forbidden', `Project 字段不可修改：${field}。`);
    }
    if (typeof input.revision !== 'string' || !input.revision) throw projectError('project_revision_required', 'Project 修改请求必须包含当前 registry revision。');
    if (input.name === undefined && input.description === undefined) throw projectError('project_update_empty', '至少修改 name 或 description。');
    const manifestPath = runtime.projectRepository.projectsManifestPath(targetRoot);
    return runtime.withWorkspaceMutation(targetRoot, `project.metadata.update:${code}`, [manifestPath], () => {
      const current = readProjectRegistryRecord(targetRoot);
      if (current.registry.migrationRequired) throw projectError('project_migration_required', 'Project registry 需要先迁移，当前页面只读。', 409);
      if (current.revision !== input.revision) throw projectError('project_revision_conflict', 'Project registry 已被其他操作修改，请刷新后重新判断。', 409, { currentRevision: current.revision });
      const existing = current.projects[code];
      if (!existing) throw projectError('project_not_found', `Project 不存在：${code}。`, 404);
      const updated = createProject({
        ...existing,
        name: input.name === undefined ? existing.name : input.name,
        description: input.description === undefined ? existing.description : input.description,
      });
      runtime.projectRepository.writeProjectRegistry(current.manifestPath, { ...current.projects, [code]: updated });
      return projectDetail(targetRoot, code);
    });
  }

  // 指令生成：只读，不创建或修改登记。
  function generateProjectCreatePrompt(input: any) {
    assertObject(input, 'project_prompt_invalid', 'Project prompt 请求必须是对象。');
    const allowed = new Set(['code', 'name', 'description', 'sourceType', 'gitUrl', 'remote', 'integrationBranch']);
    for (const field of Object.keys(input)) {
      if (!allowed.has(field)) throw projectError('project_prompt_field_forbidden', `Project prompt 不支持字段：${field}。`);
    }
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const sourceType = input.sourceType === 'git' ? 'git' : 'workspace';
    if (!name) throw projectError('project_prompt_name_required', '请填写项目名称。');
    if (!description) throw projectError('project_prompt_description_required', '请填写项目说明。');
    const sourceLines = sourceType === 'git'
      ? [
        '来源类型：独立 Git 仓库',
        `Git URL：${String(input.gitUrl || '').trim() || '<尚未提供，请先询问>'}`,
        `远端名称：${String(input.remote || '').trim() || 'origin'}`,
        `集成分支：${String(input.integrationBranch || '').trim() || '<尚未提供，请先解析远端默认分支或询问>'}`,
      ]
      : ['来源类型：当前工作空间（跟随根目录 Git）'];
    return {
      prompt: [
        '请在当前 Buildr 工作空间中创建一个项目。',
        '',
        `代码：${code || '<尚未提供，请根据名称和现有资产提出候选并确认>'}`,
        `名称：${name}`,
        `说明：${description}`,
        ...sourceLines,
        ...(code ? [`物化路径：projects/${code}`] : ['物化路径：尚未确定；先确认 code 后再计算。']),
        '',
        '执行要求：',
        '1. 先读取并遵循当前可用的 Buildr Skill，确认当前工作空间身份与写入授权。',
        '2. 核对或提出项目代码、物化路径和根目录/嵌套 Git 所有权；不得创建外部目录链接。',
        sourceType === 'git'
          ? '3. 在任何写入前核对 Git 地址、远端名称、集成分支与既有目录/登记身份；不得盲目 checkout、stash 或 relink。'
          : '3. 确认该项目应跟随根目录 Git，不要写入项目级集成分支。',
        '4. 使用 canonical buildr project create 完成创建或幂等修复。',
        `5. 创建成功后，${declarationIntakeNextAction({ trigger: 'project-registered', project: code || '<confirmed-project-code>' })}`,
        '6. 完成后运行适用的 doctor，说明项目范围、实际路径、Git 状态和仍需处理的问题。',
      ].join('\n'),
      copiedMeansCreated: false,
    };
  }

  // 创建/附接：应用确定顺序与事务范围，技术对象执行物化。
  function createProjectAsset(input: ProjectCreationInput) {
    const { targetRoot, project, repoRef, attachRef, remote, integrationBranch } = input;
    runtime.assertName(project, 'Project');
    runtime.assertGitBranch(integrationBranch);
    if (repoRef && attachRef) throw new Error('--repo and --attach are mutually exclusive.');
    const attachment = attachRef ? attachedSource(runtime.inspectAttachedGitRoot(attachRef, targetRoot, remote, integrationBranch, 'Project'), remote) : null;
    const registryRecord = readProjectRegistryRecord(targetRoot);
    if (registryRecord.registry.migrationRequired) throw new Error('Project registry needs migration before project create. Run canonical buildr sync <agent> first.');
    const existingEntry = registryRecord.projects[project] || null;
    const projectRoot = attachment?.rootPath || path.join(targetRoot, 'projects', project);
    const created: string[] = [];
    const changed: string[] = [];

    if (attachment) {
      for (const [otherCode, other] of Object.entries(registryRecord.projects)) {
        if (otherCode === project) continue;
        let otherRoot;
        try { otherRoot = runtime.sourceFiles.realpath(runtime.resolveProjectRoot(targetRoot, other)); } catch { continue; }
        if (sameFilesystemPath(otherRoot, attachment.rootPath)) throw new Error(`Project attached root is already registered by project:${otherCode}.`);
      }
    }

    const name = input.name ?? existingEntry?.name ?? project;
    const description = input.description ?? existingEntry?.description ?? defaultAssetDescription('Project', project);
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
    if (attachment && existingEntry && (existingEntry.source.root !== 'attached' || !sameFilesystemPath(runtime.sourceFiles.realpath(existingEntry.source.path), attachment.rootPath))) throw new Error(`Project registry identity conflicts for ${project}: existing source is not the requested attached root.`);

    const affected = attachment ? [registryRecord.manifestPath] : [projectRoot, registryRecord.manifestPath, path.join(targetRoot, '.gitignore')];
    return runtime.withWorkspaceMutation(targetRoot, `project.create:${project}`, affected, () => {
      return runtime.sourceFiles.withStaging(projectRoot, (staging) => {
        if (repoRef && !runtime.existsDirectory(projectRoot)) {
          runtime.cloneSourceRepository(repoRef, staging);
          runtime.sourceFiles.publish(staging, projectRoot);
        }
        if (attachment) {
          const entity = createProject({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspace.workspace.id, code: project, name, description, source: attachment.source });
          runtime.projectRepository.writeProjectRegistry(registryRecord.manifestPath, { ...registryRecord.projects, [project]: entity });
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
        const entity = createProject({ id: existingEntry?.id || runtime.crypto.randomUUID(), workspaceId: registryRecord.workspace.workspace.id, code: project, name, description, source });
        const serviceRegistryPath = runtime.serviceRepository.servicesManifestPath(projectRoot);
        const serviceRegistryExists = runtime.sourceFiles.exists(serviceRegistryPath);
        if (serviceRegistryExists) runtime.serviceRepository.validateServiceRegistryFile(serviceRegistryPath, { workspaceId: registryRecord.workspace.workspace.id, projectId: entity.id, projectCode: project });
        runtime.projectRepository.writeProjectRegistry(registryRecord.manifestPath, { ...registryRecord.projects, [project]: entity });
        if (!serviceRegistryExists) {
          runtime.serviceRepository.writeServiceRegistry(serviceRegistryPath, entity.id, {}, project);
          created.push(path.relative(targetRoot, serviceRegistryPath).split(path.sep).join('/'));
        }
        changed.push(path.relative(targetRoot, registryRecord.manifestPath).split(path.sep).join('/'));
        changed.push(...runtime.ensureGitBoundaries(targetRoot, [{ type: 'project', project, assetRoot: projectRoot }]));
        return { operation: 'create', project, targetRoot, created, changed, nextActions: [declarationIntakeNextAction({ trigger: 'project-registered', project })] };
      });
    });
  }

  Object.assign(runtime, {
    createProjectAsset,
    readProjectRegistryRecord,
    listProjects,
    projectDetail,
    projectDocument,
    projectMigrationPlan,
    migrateProjectRegistry,
    updateProjectMetadata,
    generateProjectCreatePrompt,
  });
  return runtime;
}
