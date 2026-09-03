import fs from 'node:fs';
import path from 'node:path';

import { createProject } from '../domain/project.ts';
import { resolveSourceRoot, sourceIdentity, sourceOwnership, sourceRootKind } from '../domain/source-root.ts';
import { declarationIntakeNextAction } from '../../infrastructure/contracts/declaration-intake.ts';

export function projectError(code: any, message: any, status: any = 400, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

const PROJECT_DOCUMENTS = new Set(['README.md', 'AGENTS.md']);

function inside(parent: any, child: any) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function normalizeProjectDocumentPath(documentPath: any) {
  const raw = typeof documentPath === 'string' ? documentPath.trim() : '';
  if (!raw) throw projectError('project_document_not_allowed', '不支持读取项目文档：<empty>。', 400);
  if (raw.includes('\0') || raw.includes('\\') || path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw projectError('project_document_path_forbidden', '项目文档路径越界。', 400);
  }
  const posix = raw.replace(/\\/g, '/');
  const normalized = path.posix.normalize(posix);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw projectError('project_document_path_forbidden', '项目文档路径越界。', 400);
  }
  if (normalized.split('/').some((segment: any) => segment === '' || segment === '.' || segment === '..')) {
    throw projectError('project_document_path_forbidden', '项目文档路径越界。', 400);
  }
  if (!normalized.endsWith('.md')) {
    throw projectError('project_document_not_allowed', `不支持读取项目文档：${normalized}。`, 400);
  }
  return normalized;
}

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

export function registerProjectApplication(runtime: any) {
  function readProjectRegistryRecord(targetRoot: any) {
    let workspace;
    let persistence;
    try {
      workspace = runtime.getWorkspace(targetRoot);
      const workspaceId = workspace.workspace.id;
      if (!workspaceId) throw projectError('project_workspace_migration_required', 'Workspace metadata 需要先完成 identity 迁移。', 409);
      persistence = runtime.readProjectRegistryPersistence(targetRoot, { workspaceId });
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
    const projectRoot = resolveSourceRoot(record.root, project.source);
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

  function projectDocument(targetRoot: any, code: any, documentPath: any) {
    const relativePath = normalizeProjectDocumentPath(documentPath);
    const record = readProjectRegistryRecord(targetRoot);
    const project = record.projects[code];
    if (!project) throw projectError('project_not_found', `Project 不存在：${code}。`, 404);
    const projectRoot = resolveSourceRoot(record.root, project.source);
    const filePath = path.resolve(projectRoot, relativePath);
    if (!inside(projectRoot, filePath)) {
      throw projectError('project_document_path_forbidden', '项目文档路径越界。', 400);
    }
    let exists = false;
    try {
      exists = fs.statSync(filePath).isFile();
    } catch {
      exists = false;
    }
    return {
      schemaVersion: 'buildr.project-document/v1',
      projectCode: code,
      path: relativePath,
      name: path.posix.basename(relativePath),
      entry: PROJECT_DOCUMENTS.has(relativePath),
      exists,
      content: exists ? fs.readFileSync(filePath, 'utf8') : null,
    };
  }

  function migrateProjectRegistry(targetRoot: any) {
    const before = readProjectRegistryRecord(targetRoot);
    if (!before.registry.migrationRequired) return { ...publicRegistry(before), changed: [] };
    const workspaceId = before.workspace.workspace.id;
    const migrated = Object.values(before.projects).map((legacy: any) => {
      let source = legacy.source;
      if (source.type === 'git') {
        const observed = runtime.observeProjectGit(resolveSourceRoot(before.root, source), source.git.remote);
        const url = source.git.url || observed.remoteUrl;
        const integrationBranch = source.git.integrationBranch || observed.currentBranch;
        source = { ...source, git: { ...source.git, url, integrationBranch } };
      }
      return createProject({ ...legacy, id: runtime.crypto.randomUUID(), workspaceId, source });
    });
    return runtime.withWorkspaceMutation(before.root, 'project.registry.migrate', [before.manifestPath], () => {
      const current = readProjectRegistryRecord(before.root);
      if (current.revision !== before.revision) throw projectError('project_migration_changed', 'Project registry 在迁移预检后发生变化，请重新执行。', 409);
      runtime.writeProjectRegistry(current.manifestPath, migrated);
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
    const manifestPath = runtime.projectsManifestPath(targetRoot);
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
      runtime.writeProjectRegistry(current.manifestPath, { ...current.projects, [code]: updated });
      return projectDetail(targetRoot, code);
    });
  }

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

  Object.assign(runtime, {
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
