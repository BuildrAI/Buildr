import { isWorkspaceId } from '../domain/workspace.ts';
import process from 'node:process';
import { WORKSPACE_DESCRIPTION_TODO } from '../persistence/workspace-manifest-repository.ts';
import { declarationIntakeNextAction } from '../../infrastructure/contracts/declaration-intake.ts';

const declarationIntakeAction: any = declarationIntakeNextAction;

export type WorkspaceQueryApplicationRuntime = {
  readWorkspacePersistence(targetRoot: string): any;
  readWorkspaceRegistryPersistence(): any;
  existsDirectory(directory: string): boolean;
  listProjects(targetRoot: string): any;
  listServices(targetRoot: string, projectCode: string): any;
  projectDetail(targetRoot: string, projectCode: string): any;
  serviceDetail(targetRoot: string, projectCode: string, serviceCode: string): any;
  addDoctorFinding(result: any, severity: string, code: string, message: string, details?: any): void;
};

function workspaceError(code: any, message: any, status: any = 400, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

export function resolveWorkspaceIdentity(workspaceId: any, skillsWorkspaceId: any, generateId: any = () => null) {
  if (workspaceId !== null && workspaceId !== undefined && !isWorkspaceId(workspaceId)) {
    throw workspaceError('workspace_identity_invalid', '.buildr/workspace.yml.id 必须是 UUID。', 409, { path: '.buildr/workspace.yml' });
  }
  if (skillsWorkspaceId !== null && skillsWorkspaceId !== undefined && !isWorkspaceId(skillsWorkspaceId)) {
    throw workspaceError('workspace_identity_invalid', 'skills/manifest.yml.workspaceId 必须是 UUID。', 409, { path: 'skills/manifest.yml' });
  }
  if (workspaceId && skillsWorkspaceId && workspaceId !== skillsWorkspaceId) {
    throw workspaceError(
      'workspace_identity_conflict',
      `Workspace identity 冲突：.buildr/workspace.yml.id=${workspaceId}，skills/manifest.yml.workspaceId=${skillsWorkspaceId}。`,
      409,
      { workspaceId, skillsWorkspaceId },
    );
  }
  return workspaceId || skillsWorkspaceId || generateId();
}

export function registerWorkspaceQueryApplication(runtime: WorkspaceQueryApplicationRuntime) {
  function readWorkspaceRecord(targetRoot: any) {
    let persistence;
    try {
      persistence = runtime.readWorkspacePersistence(targetRoot);
    } catch (error: any) {
      if (error.code) throw error;
      throw workspaceError('workspace_metadata_invalid', error.message, 409, { path: '.buildr/workspace.yml' });
    }
    const persistedWorkspaceId = persistence.metadata.canonical ? persistence.metadata.workspace.id : null;
    const workspaceId = resolveWorkspaceIdentity(persistedWorkspaceId, persistence.skills.workspaceId);
    const migrationRequired = persistence.metadata.migrationRequired
      || !persistence.skills.workspaceId
      || persistence.skills.workspaceId !== persistedWorkspaceId;
    return {
      ...persistence,
      migrationRequired,
      workspace: {
        id: persistedWorkspaceId || persistence.skills.workspaceId || null,
        name: persistence.metadata.workspace.name,
        description: persistence.metadata.workspace.description,
      },
      resolvedWorkspaceId: workspaceId,
    };
  }

  function publicWorkspace(record: any) {
    return {
      workspace: record.workspace,
      rootPath: record.root,
      schemaVersion: record.metadata.schemaVersion,
      revision: record.revision,
      migrationRequired: record.migrationRequired,
      compatibility: record.metadata.compatibility,
      nextActions: record.migrationRequired
        ? ['请让 Agent 运行 canonical buildr sync <agent>，完成 Workspace metadata 安全迁移后再修改。']
        : [],
    };
  }

  function getWorkspace(targetRoot: any) {
    return publicWorkspace(readWorkspaceRecord(targetRoot));
  }

  function workspaceRegistryEntry(root: any) {
    try {
      const record = readWorkspaceRecord(root);
      if (!record.workspace.id) {
        return { rootPath: root, status: 'migration_required', workspace: record.workspace, migrationRequired: true };
      }
      return { rootPath: root, status: 'ready', workspace: record.workspace, migrationRequired: record.migrationRequired };
    } catch (error: any) {
      return {
        rootPath: root,
        status: runtime.existsDirectory(root) ? 'invalid' : 'unavailable',
        workspace: null,
        error: { code: error.code || 'workspace_unavailable', message: error.message },
      };
    }
  }

  function listRegisteredWorkspaces() {
    const persistence = runtime.readWorkspaceRegistryPersistence();
    const entries = persistence.registry.roots.map(workspaceRegistryEntry);
    const identities = new Map();
    for (const entry of entries) {
      if (!entry.workspace?.id) continue;
      const peers = identities.get(entry.workspace.id) || [];
      peers.push(entry);
      identities.set(entry.workspace.id, peers);
    }
    for (const peers of identities.values()) {
      if (peers.length < 2) continue;
      for (const entry of peers) entry.status = 'identity_conflict';
    }
    const lastOpened = entries.find((entry: any) => entry.rootPath === persistence.registry.lastOpenedRoot) || null;
    return { schemaVersion: persistence.registry.schemaVersion, revision: persistence.revision, workspaces: entries, lastOpenedWorkspaceId: lastOpened?.workspace?.id || null };
  }

  function workspaceMigrationPlan(targetRoot: any) {
    const record = readWorkspaceRecord(targetRoot);
    return {
      required: record.migrationRequired,
      affectedPaths: [record.metadataPath, record.skillsPath],
      signature: JSON.stringify({
        metadataRevision: record.revision,
        workspaceId: record.metadata.canonical ? record.metadata.workspace.id : null,
        skillsWorkspaceId: record.skills.workspaceId,
        nodeVersion: record.workspace.runtime?.node?.version || null,
      }),
    };
  }

  function generateWorkspaceCreatePrompt(input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw workspaceError('workspace_prompt_invalid', 'Workspace prompt 请求必须是对象。');
    }
    const allowed = new Set(['name', 'description', 'targetPath']);
    for (const field of Object.keys(input)) {
      if (!allowed.has(field)) {
        throw workspaceError('workspace_prompt_field_forbidden', `Workspace prompt 不支持字段：${field}。`);
      }
    }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const targetPath = typeof input.targetPath === 'string' ? input.targetPath.trim() : '';
    if (!name) throw workspaceError('workspace_prompt_name_required', '请填写 Workspace 名称。');
    if (!description) throw workspaceError('workspace_prompt_description_required', '请填写 Workspace 说明。');
    const targetInstruction = targetPath
      ? `目标位置：${targetPath}\n请先核对该目录、Git 边界和写入授权。`
      : '目标位置尚未指定。请先向我确认目标目录，不要自行猜测路径。';
    return {
      prompt: [
        '请为我创建一个新的 Buildr Workspace。',
        '',
        `名称：${name}`,
        `说明：${description}`,
        targetInstruction,
        '',
        '执行要求：',
        '1. 先读取并遵循当前可用的 Buildr Skill。',
        '2. 检查目标目录是否已有内容、是否由 Git 管理，以及我是否已授权必要写入。',
        '3. 如 profile、Agent runtime 或其他必要信息不明确，先向我确认，不要猜测。',
        '4. 使用 canonical Buildr CLI 完成 init；需要 runtime 时再执行对应 sync。',
        '5. 完成后运行适用的 doctor，并说明真实创建结果、变更文件和仍需处理的问题。',
      ].join('\n'),
      copiedMeansCreated: false,
    };
  }

  function recoveryPrompt(rootPath: any, kind: any) {
    const action = kind === 'migration_required'
      ? '检查 Workspace metadata、确认正确 identity 后执行 canonical buildr sync <agent>'
      : '检查该目录是否应作为 Buildr Workspace 初始化，并在获得授权后执行 canonical buildr init --agent <agent>';
    return [
      '请帮我处理一个通过 Buildr Web 选择的本机目录。',
      '',
      `候选位置：${rootPath}`,
      `当前情况：${kind === 'migration_required' ? '目录需要迁移或修复，尚未登记。' : '目录尚不是可登记的 Buildr Workspace。'}`,
      '',
      '执行要求：',
      '1. 先核对目录、Git 边界、权限和其中已有内容；不要猜测或覆盖 identity。',
      `2. ${action}。`,
      '3. 运行适用 doctor，确认真实结果后再建议我回到 Buildr Web 登记。',
    ].join('\n');
  }

  function getWorkspaceGettingStarted(targetRoot: any, input: any = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw workspaceError('workspace_getting_started_invalid', '开始页请求必须是对象。');
    for (const field of Object.keys(input)) {
      throw workspaceError('workspace_getting_started_field_forbidden', `开始页不支持字段：${field}。`);
    }
    const workspace = getWorkspace(targetRoot);
    let projects;
    try {
      projects = runtime.listProjects(targetRoot);
    } catch (error: any) {
      return {
        workspace,
        phase: 'degraded',
        completeness: 'partial',
        projects: [],
        services: [],
        primaryAction: { type: 'repair', prompt: recoveryPrompt(workspace.rootPath, 'migration_required') },
        diagnostics: [{ code: error.code || 'project_registry_unavailable', message: error.message }],
      };
    }
    const projectOptions = projects.projects.map((project: any) => ({ id: project.id, code: project.code, name: project.name, description: project.description }));
    if (workspace.migrationRequired || projects.migrationRequired) {
      return {
        workspace,
        phase: 'degraded',
        completeness: 'partial',
        projects: projectOptions,
        services: [],
        primaryAction: { type: 'repair', prompt: recoveryPrompt(workspace.rootPath, 'migration_required') },
        diagnostics: [...(workspace.nextActions || []), ...(projects.nextActions || [])],
      };
    }
    if (!projectOptions.length) {
      return {
        workspace,
        phase: 'project-empty',
        completeness: 'complete',
        projects: [],
        services: [],
        primaryAction: { type: 'project-create' },
        diagnostics: [],
      };
    }
    const services: any[] = [];
    const diagnostics: any[] = [];
    let incomplete = false;
    for (const project of projectOptions) {
      try {
        const serviceRegistry = runtime.listServices(targetRoot, project.code);
        if (serviceRegistry.migrationRequired) {
          incomplete = true;
          diagnostics.push(...(serviceRegistry.nextActions || []));
          continue;
        }
        services.push(...serviceRegistry.services.map((service: any) => ({
          id: service.id,
          code: service.code,
          name: service.name,
          description: service.description,
          type: service.type,
          projectCode: project.code,
        })));
      } catch (error: any) {
        incomplete = true;
        diagnostics.push({ code: error.code || 'service_registry_unavailable', message: error.message });
      }
    }
    return {
      workspace,
      phase: incomplete ? 'degraded' : services.length ? 'ready' : 'service-empty',
      completeness: incomplete ? 'partial' : 'complete',
      projects: projectOptions,
      services,
      primaryAction: incomplete ? { type: 'repair', prompt: recoveryPrompt(workspace.rootPath, 'migration_required') } : { type: 'start-work', serviceOptional: !services.length },
      diagnostics,
    };
  }

  function generateStartWorkPrompt(targetRoot: any, input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw workspaceError('workspace_start_work_invalid', '开始工作请求必须是对象。');
    const allowed = new Set(['projectCode', 'serviceCode', 'goal']);
    for (const field of Object.keys(input)) if (!allowed.has(field)) throw workspaceError('workspace_start_work_field_forbidden', `开始工作不支持字段：${field}。`);
    const projectCode = typeof input.projectCode === 'string' ? input.projectCode.trim() : '';
    const serviceCode = typeof input.serviceCode === 'string' ? input.serviceCode.trim() : '';
    const goal = typeof input.goal === 'string' ? input.goal.trim() : '';
    if (!projectCode || !goal) throw workspaceError('workspace_start_work_fields_required', '请选择项目并填写要完成的工作。');
    const workspace = getWorkspace(targetRoot);
    const project = runtime.projectDetail(targetRoot, projectCode).project;
    let service: any = null;
    if (serviceCode) service = runtime.serviceDetail(targetRoot, projectCode, serviceCode).service;
    return {
      prompt: [
        '请在以下 Buildr 工作范围内开始推进一项真实工作。',
        '',
        `工作空间：${workspace.workspace.name}（${workspace.workspace.id}）`,
        `项目：${project.name}（${project.code}）`,
        ...(service ? [`服务：${service.name}（${service.code}）`] : ['服务：本次不限定；如不需要代码仓或可执行资产，可保持项目范围。']),
        `目标：${goal}`,
        '',
        '执行要求：',
        '1. 先读取当前工作空间、项目与可选服务范围的适用工作资产。',
        `2. ${declarationIntakeAction({ trigger: 'first-task-scope', project: project.code, services: service ? [service.code] : [] })}`,
        '3. 只在必要时询问范围、业务判断或授权；不要根据排序猜测其他项目或服务。',
        '4. 根据任务性质推进理解、设计、实现和验证，并按当前项目规则报告结果。',
      ].join('\n'),
      copiedMeansStarted: false,
    };
  }

  function diagnoseWorkspaceMetadata(result: any, targetRoot: any) {
    try {
      const workspace = getWorkspace(targetRoot);
      result.workspace.metadata = workspace;
      if (workspace.migrationRequired) {
        runtime.addDoctorFinding(result, 'warning', 'workspace.metadata_migration_required', 'Workspace metadata 需要迁移为 canonical schema。', {
          path: '.buildr/workspace.yml',
          suggestion: '运行 canonical buildr sync <agent> 完成事务迁移。',
          userActionRequired: true,
        });
      }
      if (workspace.workspace.description === WORKSPACE_DESCRIPTION_TODO) {
        runtime.addDoctorFinding(result, 'warning', 'workspace.description_todo', 'Workspace 说明仍是待补全内容。', {
          path: '.buildr/workspace.yml',
          suggestion: '通过 buildr web 或 Agent 补充 Workspace 的管理范围和用途。',
          userActionRequired: true,
        });
      }
    } catch (error: any) {
      runtime.addDoctorFinding(result, 'error', error.code || 'workspace_metadata_invalid', error.message, {
        path: error.details?.path || '.buildr/workspace.yml',
        details: error.details,
        suggestion: error.code === 'workspace_identity_conflict'
          ? '核对两处 identity 的来源，确认正确 UUID 后再由 Agent 修复；Buildr 不会自动选择。'
          : '修复 Workspace metadata 后重新运行 doctor。',
        userActionRequired: true,
      });
    }
  }

  Object.assign(runtime, {
    readWorkspaceRecord,
    publicWorkspace,
    workspaceRegistryEntry,
    recoveryPrompt,
    getWorkspace,
    listRegisteredWorkspaces,
    workspaceMigrationPlan,
    generateWorkspaceCreatePrompt,
    getWorkspaceGettingStarted,
    generateStartWorkPrompt,
    diagnoseWorkspaceMetadata,
  });
  return runtime;
}
