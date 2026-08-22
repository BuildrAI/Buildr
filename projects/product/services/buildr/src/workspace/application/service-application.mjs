import fs from 'node:fs';
import path from 'node:path';

import { createService } from '../domain/service.mjs';
import { declarationIntakeNextAction } from '../../infrastructure/contracts/declaration-intake.mjs';

export function serviceError(code, message, status = 400, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

const SERVICE_DOCUMENTS = new Set(['README.md', 'AGENTS.md']);

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function normalizeServiceDocumentPath(documentPath) {
  const raw = typeof documentPath === 'string' ? documentPath.trim() : '';
  if (!raw) throw serviceError('service_document_not_allowed', '不支持读取服务文档：<empty>。', 400);
  if (raw.includes('\0') || raw.includes('\\') || path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw serviceError('service_document_path_forbidden', '服务文档路径越界。', 400);
  }
  const posix = raw.replace(/\\/g, '/');
  const normalized = path.posix.normalize(posix);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw serviceError('service_document_path_forbidden', '服务文档路径越界。', 400);
  }
  if (normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw serviceError('service_document_path_forbidden', '服务文档路径越界。', 400);
  }
  if (!normalized.endsWith('.md')) {
    throw serviceError('service_document_not_allowed', `不支持读取服务文档：${normalized}。`, 400);
  }
  return normalized;
}

function assertObject(input, code, message) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw serviceError(code, message);
}

export function compareServiceGit(service, observed, sameGitIdentity) {
  if (service.source.type !== 'git') return { status: 'not-applicable', findings: [] };
  if (!observed?.available) return { status: 'unavailable', findings: [{ status: 'warning', code: 'service.git_observation_unavailable', message: '无法读取 Service Git 实际状态。' }] };
  const findings = [];
  if (!observed.repository) findings.push({ status: 'error', code: 'service.git_repository_missing', message: 'Service path 不是可读取的 Git repository。' });
  if (observed.repository && !observed.remoteUrl) findings.push({ status: 'error', code: 'service.git_remote_missing', message: `声明的 Git remote ${service.source.git.remote} 不存在。` });
  if (observed.remoteUrl && !sameGitIdentity(observed.remoteUrl, service.source.git.url)) findings.push({ status: 'error', code: 'service.git_remote_conflict', message: 'Service Git remote URL 与 Domain 声明不一致。', details: { declared: service.source.git.url, observed: observed.remoteUrl } });
  if (observed.currentBranch && observed.currentBranch !== service.source.git.integrationBranch) findings.push({ status: 'warning', code: 'service.git_branch_drift', message: `当前分支 ${observed.currentBranch} 不同于 integration branch ${service.source.git.integrationBranch}。` });
  if (observed.dirty === true) findings.push({ status: 'warning', code: 'service.git_dirty', message: 'Service Git worktree 有未提交变化。' });
  if ((observed.ahead || 0) > 0 || (observed.behind || 0) > 0) findings.push({ status: 'info', code: 'service.git_upstream_drift', message: `当前分支相对 upstream ahead ${observed.ahead ?? '?'} / behind ${observed.behind ?? '?'}。` });
  return { status: findings.some((finding) => finding.status === 'error') ? 'error' : findings.length ? 'drift' : 'aligned', findings };
}

export function registerServiceApplication(runtime) {
  function parentRecord(targetRoot, projectCode) {
    const projects = runtime.readProjectRegistryRecord(targetRoot);
    if (projects.registry.migrationRequired) throw serviceError('service_project_migration_required', 'Project registry 需要先迁移，才能使用 Service Domain。', 409);
    const project = projects.projects[projectCode];
    if (!project) throw serviceError('service_project_not_found', `Project 不存在：${projectCode}。`, 404);
    return { projects, project, workspaceId: projects.workspace.workspace.id };
  }

  function readServiceRegistryRecord(targetRoot, projectCode) {
    try {
      const parent = parentRecord(targetRoot, projectCode);
      const persistence = runtime.readServiceRegistryPersistence(targetRoot, parent.project, parent.workspaceId);
      return { ...persistence, ...parent, services: persistence.registry.entities };
    } catch (error) {
      if (error.code) throw error;
      throw serviceError('service_registry_invalid', error.message, 409, { projectCode, path: `projects/${projectCode}/services/manifest.yml` });
    }
  }

  function publicRegistry(record) {
    return {
      project: record.project,
      schemaVersion: record.registry.schemaVersion,
      revision: record.revision,
      migrationRequired: record.registry.migrationRequired,
      services: Object.values(record.services),
      nextActions: record.registry.migrationRequired ? ['请让 Agent 运行 canonical buildr sync <agent>，完成 Service registry v2 安全迁移后再修改。'] : [],
    };
  }

  function listServices(targetRoot, projectCode) {
    return publicRegistry(readServiceRegistryRecord(targetRoot, projectCode));
  }

  function serviceDetail(targetRoot, projectCode, code) {
    const record = readServiceRegistryRecord(targetRoot, projectCode);
    const service = record.services[code];
    if (!service) throw serviceError('service_not_found', `Service 不存在：${projectCode}/${code}。`, 404);
    let observed = null;
    let comparison = { status: 'not-applicable', findings: [] };
    if (service.source.type === 'git') {
      observed = runtime.observeProjectGit(path.join(record.root, service.source.path), service.source.git.remote);
      comparison = compareServiceGit(service, observed, runtime.sameGitIdentity);
    }
    return { project: record.project, schemaVersion: record.registry.schemaVersion, revision: record.revision, migrationRequired: record.registry.migrationRequired, service, observed, comparison, nextActions: publicRegistry(record).nextActions };
  }

  function serviceDocument(targetRoot, projectCode, code, documentPath) {
    const relativePath = normalizeServiceDocumentPath(documentPath);
    const record = readServiceRegistryRecord(targetRoot, projectCode);
    const service = record.services[code];
    if (!service) throw serviceError('service_not_found', `Service 不存在：${projectCode}/${code}。`, 404);
    const serviceRoot = path.resolve(record.root, service.source.path);
    const filePath = path.resolve(serviceRoot, relativePath);
    if (!inside(serviceRoot, filePath)) {
      throw serviceError('service_document_path_forbidden', '服务文档路径越界。', 400);
    }
    let exists = false;
    try {
      exists = fs.statSync(filePath).isFile();
    } catch {
      exists = false;
    }
    return {
      schemaVersion: 'buildr.service-document/v1',
      projectCode,
      serviceCode: code,
      path: relativePath,
      name: path.posix.basename(relativePath),
      entry: SERVICE_DOCUMENTS.has(relativePath),
      exists,
      content: exists ? fs.readFileSync(filePath, 'utf8') : null,
    };
  }

  function migrateServiceRegistry(targetRoot, projectCode) {
    const before = readServiceRegistryRecord(targetRoot, projectCode);
    if (!before.registry.migrationRequired) return { ...publicRegistry(before), changed: [] };
    const migrated = Object.values(before.services).map((legacy) => {
      let source = legacy.source;
      if (source.type === 'git') {
        const observed = runtime.observeProjectGit(path.join(before.root, source.path), source.git.remote);
        source = { ...source, git: { ...source.git, url: source.git.url || observed.remoteUrl, integrationBranch: source.git.integrationBranch || observed.currentBranch } };
      }
      return createService({ ...legacy, id: runtime.crypto.randomUUID(), workspaceId: before.workspaceId, projectId: before.project.id, projectCode, source });
    });
    return runtime.withWorkspaceMutation(before.root, `service.registry.migrate:${projectCode}`, [before.manifestPath], () => {
      const current = readServiceRegistryRecord(before.root, projectCode);
      if (current.revision !== before.revision) throw serviceError('service_migration_changed', 'Service registry 在迁移预检后发生变化，请重新执行。', 409);
      runtime.writeServiceRegistry(current.manifestPath, current.project.id, migrated);
      const result = readServiceRegistryRecord(before.root, projectCode);
      if (result.registry.migrationRequired) throw new Error('Service registry migration did not produce canonical v2 data.');
      return { ...publicRegistry(result), changed: [`projects/${projectCode}/services/manifest.yml`] };
    });
  }

  function serviceMigrationPlan(targetRoot, projectCode) {
    const record = readServiceRegistryRecord(targetRoot, projectCode);
    return { required: record.registry.migrationRequired, affectedPaths: [record.manifestPath], signature: JSON.stringify({ revision: record.revision, schemaVersion: record.registry.schemaVersion, projectId: record.project.id }) };
  }

  function updateServiceMetadata(targetRoot, projectCode, code, input) {
    assertObject(input, 'service_update_invalid', 'Service 修改请求必须是对象。');
    const allowed = new Set(['revision', 'name', 'description', 'type']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw serviceError('service_update_field_forbidden', `Service 字段不可修改：${field}。`);
    if (typeof input.revision !== 'string' || !input.revision) throw serviceError('service_revision_required', 'Service 修改请求必须包含当前 registry revision。');
    if (input.name === undefined && input.description === undefined && input.type === undefined) throw serviceError('service_update_empty', '至少修改 name、description 或 type。');
    const manifestPath = runtime.serviceDomainManifestPath(targetRoot, projectCode);
    return runtime.withWorkspaceMutation(targetRoot, `service.metadata.update:${projectCode}/${code}`, [manifestPath], () => {
      const current = readServiceRegistryRecord(targetRoot, projectCode);
      if (current.registry.migrationRequired) throw serviceError('service_migration_required', 'Service registry 需要先迁移，当前页面只读。', 409);
      if (current.revision !== input.revision) throw serviceError('service_revision_conflict', 'Service registry 已被其他操作修改，请刷新后重新判断。', 409, { currentRevision: current.revision });
      const existing = current.services[code];
      if (!existing) throw serviceError('service_not_found', `Service 不存在：${projectCode}/${code}。`, 404);
      const updated = createService({ ...existing, projectCode, name: input.name ?? existing.name, description: input.description ?? existing.description, type: input.type ?? existing.type });
      runtime.writeServiceRegistry(current.manifestPath, current.project.id, { ...current.services, [code]: updated });
      return serviceDetail(targetRoot, projectCode, code);
    });
  }

  function generateServiceCreatePrompt(targetRoot, input) {
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
    let project = null;
    if (targetRoot) project = parentRecord(targetRoot, projectCode).project;
    const sourceType = input.sourceType === 'git' ? 'git' : 'local';
    const ref = sourceType === 'git' ? String(input.gitUrl || '').trim() || '<尚未提供 Git URL>' : String(input.localPath || '').trim() || '<尚未提供本地路径>';
    const options = [`--name ${JSON.stringify(name)}`, `--description ${JSON.stringify(description)}`];
    if (type) options.push(`--type ${JSON.stringify(type)}`);
    if (sourceType === 'git') options.push(`--remote ${JSON.stringify(String(input.remote || '').trim() || 'origin')}`, `--integration-branch ${JSON.stringify(String(input.integrationBranch || '').trim() || '<请先解析远端 HEAD 或询问>')}`);
    return {
      prompt: ['请在当前 Buildr 工作空间中创建或接入一个服务。', '', `所属项目：${project ? `${project.name}（${project.code}）` : projectCode}`, `代码：${code || '<尚未提供，请根据名称、来源和现有资产提出候选并确认>'}`, `名称：${name}`, `用途：${description}`, `类型：${type || '<尚未提供，请由 Agent 根据真实资产提出候选>'}`, `来源：${sourceType === 'git' ? 'Git 仓库' : '本地路径'}`, `来源引用：${ref}`, ...(code ? [`物化路径：projects/${projectCode}/services/${code}`] : ['物化路径：尚未确定；先确认代码后再计算。']), '', '执行要求：', '1. 读取并遵循 Buildr Skill，核对工作空间与所属项目身份。', '2. 先确认该项目是否确实需要代码仓、应用、模块或可执行资产；不需要时可直接保持项目范围工作。', '3. 在写入前核对来源、目标目录和嵌套 Git 所有权，不保留工作空间外部本地路径。', sourceType === 'git' ? '4. 核对 Git 地址、远端名称、集成分支与既有仓库/元数据身份，不盲目 checkout 或 stash。' : '4. 校验本地来源可访问且目标不存在，不创建外部目录链接。', code ? `5. 使用标准命令 buildr service create ${projectCode}/${code} ${JSON.stringify(ref)} ${options.join(' ')} 完成创建。` : '5. 补齐必要代码、类型和来源声明后，再使用标准 buildr service create；不要猜测缺失信息。', `6. 创建成功后，${declarationIntakeNextAction({ trigger: 'service-registered', project: projectCode, services: [code || '<confirmed-service-code>'] })}`, '7. 完成后运行适用 doctor，说明服务范围、实际路径、Git 状态和剩余问题。'].join('\n'),
      copiedMeansCreated: false,
    };
  }

  Object.assign(runtime, { readServiceRegistryRecord, listServices, serviceDetail, serviceDocument, serviceMigrationPlan, migrateServiceRegistry, updateServiceMetadata, generateServiceCreatePrompt });
  return runtime;
}
