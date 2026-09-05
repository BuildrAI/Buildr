import type { RegistryRepository } from '../persistence/workspace-registry-repository.ts';
import type { WorkspaceRepository } from '../persistence/workspace-manifest-repository.ts';
import { createWorkspace, isWorkspaceId } from '../domain/workspace.ts';
import { WORKSPACE_DESCRIPTION_TODO } from '../persistence/workspace-manifest-repository.ts';

export type WorkspaceCommandApplicationRuntime = { registryRepository: RegistryRepository; workspaceRepository: WorkspaceRepository;
  path: { resolve(value: string): string };
  crypto: { randomUUID(): string };
  assertInitializedBuildrWorkspace(root: string): void;
  listRegisteredWorkspaces(): any;
  readWorkspaceRecord(targetRoot: string): any;
  publicWorkspace(record: any): any;
  workspaceRegistryEntry(root: string): any;
  recoveryPrompt(rootPath: string, kind: string): string;
  canonicalWorkspaceManagementIdentity(root: string): any;
  withWorkspaceManagementClaim(root: string, operation: () => any): any;
  releaseWorkspaceManagementClaim(root: string, workspaceId: string): boolean;
  withWorkspaceMutation(root: string, operation: string, affectedPaths: string[], action: () => any): any;
  renderSkillsManifestYaml(input: any): string;
  atomicWriteFile(file: string, content: string): void;
  existsDirectory(directory: string): boolean;
  registerLocalWorkspace(input: any): any;
};

function workspaceError(code: any, message: any, status: any = 400, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

export function ensureRegisteredTarget(runtime: WorkspaceCommandApplicationRuntime, targetRoot: string | null) {
  if (!targetRoot) return null;
  const root = runtime.path.resolve(targetRoot);
  runtime.assertInitializedBuildrWorkspace(root);
  let registry = runtime.listRegisteredWorkspaces();
  const existing = registry.workspaces.find((entry: any) => entry.rootPath === root);
  if (!existing) registry = runtime.registerLocalWorkspace({ rootPath: root, revision: registry.revision });
  const entry = registry.workspaces.find((item: any) => item.rootPath === root);
  return entry?.workspace?.id || null;
}

export function registerWorkspaceCommandApplication(runtime: WorkspaceCommandApplicationRuntime) {
  const createWorkspaceId = () => runtime.crypto.randomUUID();

  function registerLocalWorkspace(input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw workspaceError('workspace_registry_input_invalid', 'Workspace 登记请求必须是对象。');
    for (const field of Object.keys(input)) {
      if (!new Set(['rootPath', 'revision', 'open']).has(field)) throw workspaceError('workspace_registry_field_forbidden', `Workspace 登记不支持字段：${field}。`);
    }
    if (typeof input.rootPath !== 'string' || !input.rootPath.trim()) throw workspaceError('workspace_registry_root_required', '请选择 Workspace 目录。');
    const root = runtime.path.resolve(input.rootPath);
    try { runtime.canonicalWorkspaceManagementIdentity(root); }
    catch (error: any) { throw workspaceError(error.code || 'workspace_registry_root_invalid', `无法登记 Workspace：${error.message}`, 409, error.details); }
    let candidate;
    try { candidate = runtime.readWorkspaceRecord(root); } catch (error: any) {
      throw workspaceError(error.code || 'workspace_registry_root_invalid', `无法登记 Workspace：${error.message}`, 409, { rootPath: root });
    }
    if (!candidate.workspace.id) throw workspaceError('workspace_registry_migration_required', '该 Workspace 需要先完成 canonical metadata 迁移。', 409, { rootPath: root });
    runtime.withWorkspaceManagementClaim(root, () => {
      runtime.registryRepository.withWorkspaceRegistryMutation(input.revision, (current: any) => {
        const roots = current.roots;
        if (!roots.includes(root)) {
          for (const existingRoot of roots) {
            const existing = runtime.workspaceRegistryEntry(existingRoot);
            if (existing.workspace?.id === candidate.workspace.id) {
              throw workspaceError('workspace_registry_identity_conflict', '同一 Workspace identity 已登记在另一个目录。', 409, {
                workspaceId: candidate.workspace.id,
                existingRoot,
                candidateRoot: root,
              });
            }
          }
        }
        return {
          ...current,
          roots: roots.includes(root) ? roots : [...roots, root],
          lastOpenedRoot: input.open === false ? current.lastOpenedRoot : root,
        };
      });
    });
    return runtime.listRegisteredWorkspaces();
  }

  function removeRegisteredWorkspace(input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw workspaceError('workspace_registry_input_invalid', 'Workspace 移除请求必须是对象。');
    for (const field of Object.keys(input)) {
      if (!new Set(['workspaceId', 'rootPath', 'revision']).has(field)) throw workspaceError('workspace_registry_field_forbidden', `Workspace 移除不支持字段：${field}。`);
    }
    if (input.workspaceId === undefined && input.rootPath === undefined) throw workspaceError('workspace_registry_identity_invalid', 'Workspace 移除请求必须指定 workspaceId 或已登记 rootPath。');
    if (input.workspaceId !== undefined && !isWorkspaceId(input.workspaceId)) throw workspaceError('workspace_registry_identity_invalid', 'Workspace id 必须是 UUID。');
    const requestedRoot = input.rootPath === undefined ? null : runtime.path.resolve(input.rootPath);
    let removed: any = null;
    runtime.registryRepository.withWorkspaceRegistryMutation(input.revision, (current: any) => {
      const matches = current.roots.filter((root: any) => requestedRoot ? root === requestedRoot : runtime.workspaceRegistryEntry(root).workspace?.id === input.workspaceId);
      if (!matches.length) throw workspaceError('workspace_registry_not_found', 'Workspace 未登记。', 404);
      if (matches.length > 1) throw workspaceError('workspace_registry_identity_conflict', '同一 Workspace identity 对应多个目录，请按已登记 rootPath 移除。', 409);
      const entry = runtime.workspaceRegistryEntry(matches[0]);
      removed = { rootPath: matches[0], workspaceId: entry.workspace?.id || input.workspaceId || null };
      return {
        ...current,
        roots: current.roots.filter((root: any) => root !== matches[0]),
        lastOpenedRoot: current.lastOpenedRoot === matches[0] ? null : current.lastOpenedRoot,
      };
    });
    if (removed?.workspaceId) {
      try { runtime.releaseWorkspaceManagementClaim(removed.rootPath, removed.workspaceId); } catch { /* registry removal remains safe; uncertain claim is retained fail-closed */ }
    }
    return runtime.listRegisteredWorkspaces();
  }

  function resolveRegisteredWorkspace(workspaceId: any, { touch = false }: any = {}) {
    if (!isWorkspaceId(workspaceId)) throw workspaceError('workspace_registry_identity_invalid', 'Workspace id 必须是 UUID。');
    const persistence = runtime.registryRepository.readWorkspaceRegistryPersistence();
    const matches = persistence.registry.roots.filter((root: any) => runtime.workspaceRegistryEntry(root).workspace?.id === workspaceId);
    if (!matches.length) throw workspaceError('workspace_registry_not_found', 'Workspace 未登记或当前不可用。', 404);
    if (matches.length > 1) throw workspaceError('workspace_registry_identity_conflict', '同一 Workspace identity 对应多个已登记目录。', 409);
    const current = runtime.readWorkspaceRecord(matches[0]);
    if (current.workspace.id !== workspaceId) throw workspaceError('workspace_registry_identity_mismatch', '已登记路径中的 Workspace identity 已变化。', 409);
    if (touch && persistence.registry.lastOpenedRoot !== matches[0]) {
      try {
        runtime.registryRepository.withWorkspaceRegistryMutation(persistence.revision, (currentRegistry: any) => ({ ...currentRegistry, lastOpenedRoot: currentRegistry.roots.includes(matches[0]) ? matches[0] : currentRegistry.lastOpenedRoot }));
      } catch (error: any) {
        if (error.code !== 'workspace_registry_revision_conflict') throw error;
      }
    }
    return { rootPath: matches[0], workspace: runtime.publicWorkspace(current) };
  }

  function migrateWorkspaceMetadata(targetRoot: any) {
    const before = runtime.readWorkspaceRecord(targetRoot);
    const workspaceId = before.resolvedWorkspaceId || createWorkspaceId();
    return runtime.withWorkspaceMutation(before.root, 'workspace.metadata.migrate', [before.metadataPath, before.skillsPath], () => {
      const current = runtime.readWorkspaceRecord(before.root);
      if (current.resolvedWorkspaceId && current.resolvedWorkspaceId !== workspaceId) {
        throw workspaceError('workspace_migration_changed', 'Workspace identity 在迁移预检后发生变化，请重新执行。', 409);
      }
      const workspace = createWorkspace({
        id: workspaceId,
        name: current.workspace.name,
        description: current.workspace.description || WORKSPACE_DESCRIPTION_TODO,
      });
      const metadataContent = runtime.workspaceRepository.renderWorkspaceManifest({ workspace, compatibility: current.metadata.compatibility });
      const skillsContent = runtime.renderSkillsManifestYaml({
        ...current.skills,
        workspaceId,
        skills: current.skills.skills || [],
      });
      const changed: any[] = [];
      if (current.metadataContent !== metadataContent) {
        runtime.workspaceRepository.writeWorkspaceManifest(current.metadataPath, metadataContent);
        changed.push('.buildr/workspace.yml');
      }
      if (current.skillsContent !== skillsContent) {
        runtime.atomicWriteFile(current.skillsPath, skillsContent);
        changed.push('skills/manifest.yml');
      }
      const result = runtime.readWorkspaceRecord(before.root);
      if (result.migrationRequired) throw new Error('Workspace metadata migration did not produce a canonical identity.');
      return { ...runtime.publicWorkspace(result), changed };
    });
  }

  function updateWorkspaceMetadata(targetRoot: any, input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw workspaceError('workspace_update_invalid', 'Workspace 修改请求必须是对象。');
    const allowed = new Set(['revision', 'name', 'description']);
    for (const field of Object.keys(input)) {
      if (!allowed.has(field)) throw workspaceError('workspace_update_field_forbidden', `Workspace 字段不可修改：${field}。`);
    }
    if (typeof input.revision !== 'string' || !input.revision) throw workspaceError('workspace_revision_required', 'Workspace 修改请求必须包含当前 revision。');
    if (input.name === undefined && input.description === undefined) throw workspaceError('workspace_update_empty', '至少修改 name 或 description。');
    const metadataPath = runtime.workspaceRepository.workspaceMetadataPath(targetRoot);
    return runtime.withWorkspaceMutation(targetRoot, 'workspace.metadata.update', [metadataPath], () => {
      const current = runtime.readWorkspaceRecord(targetRoot);
      if (current.migrationRequired) throw workspaceError('workspace_migration_required', 'Workspace metadata 需要先迁移，当前页面只读。', 409);
      if (current.revision !== input.revision) {
        throw workspaceError('workspace_revision_conflict', 'Workspace 文件已被其他操作修改，请刷新后重新判断。', 409, { currentRevision: current.revision });
      }
      const workspace = createWorkspace({
        id: current.workspace.id,
        name: input.name === undefined ? current.workspace.name : input.name,
        description: input.description === undefined ? current.workspace.description : input.description,
      });
      runtime.workspaceRepository.writeWorkspaceManifest(current.metadataPath, runtime.workspaceRepository.renderWorkspaceManifest({ workspace, compatibility: current.metadata.compatibility }));
      return runtime.publicWorkspace(runtime.readWorkspaceRecord(targetRoot));
    });
  }

  function inspectLocalWorkspaceCandidate(rootPath: any, revision: any) {
    const root = runtime.path.resolve(rootPath);
    try {
      const candidate = runtime.readWorkspaceRecord(root);
      if (!candidate.workspace.id || candidate.migrationRequired) {
        return {
          status: 'migration_required', rootPath: root, workspace: candidate.workspace,
          message: '该目录需要先由 Agent 完成 Workspace metadata 迁移或修复，尚未登记。',
          prompt: runtime.recoveryPrompt(root, 'migration_required'),
        };
      }
      return { status: 'canonical', rootPath: root, registry: registerLocalWorkspace({ rootPath: root, revision }) };
    } catch (error: any) {
      if (error.code === 'workspace_identity_conflict') return { status: 'identity_conflict', rootPath: root, message: error.message };
      if (!runtime.existsDirectory(root)) return { status: 'unavailable', rootPath: root, message: '该目录当前不可读取或已经不存在。' };
      return {
        status: 'uninitialized', rootPath: root,
        message: '该目录尚不是可登记的 Buildr Workspace，或其 metadata 无法读取。',
        prompt: runtime.recoveryPrompt(root, 'uninitialized'),
      };
    }
  }

  return Object.assign(runtime, {
    createWorkspaceId,
    registerLocalWorkspace,
    removeRegisteredWorkspace,
    resolveRegisteredWorkspace,
    migrateWorkspaceMetadata,
    updateWorkspaceMetadata,
    inspectLocalWorkspaceCandidate,
  });
}
