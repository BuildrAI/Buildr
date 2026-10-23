import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { productDataRoot } from '../../../infrastructure/filesystem/product-data-root.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { isConfirmedMissingPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';

export const WORKSPACE_REGISTRY_SCHEMA = 'buildr.local-workspace-registry/v1';

type ProductIdentity = Record<string, any>;
type WebProfile = { dataRoot: string } & Record<string, any>;
type WorkspaceRegistry = {
  schemaVersion: typeof WORKSPACE_REGISTRY_SCHEMA;
  roots: string[];
  lastOpenedRoot: string | null;
};

export type WorkspaceRegistryRepositoryRuntime = {
  atomicWriteJson(file: string, value: unknown): void;
  ensureDirectory(directory: string): void;
};

export type WorkspaceRegistryRepositoryOptions = {
  productIdentity?: ProductIdentity;
  readProductIdentity?: () => ProductIdentity;
  resolveWebProfile?: (identity: ProductIdentity, options: WorkspaceRegistryRepositoryOptions) => WebProfile;
  webProfile?: WebProfile;
  /** 预览实例读取的共享 Profile 登记文件；null 表示本实例登记列表不合并共享条目。 */
  sharedRegistryFile?: string | null;
};

function registryRevision(content: any) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function buildrWebDataRoot({ respectOverride = true }: any = {}) {
  if (respectOverride && process.env.BUILDR_APP_DATA_DIR) return path.resolve(process.env.BUILDR_APP_DATA_DIR);
  return productDataRoot({ respectOverride: false });
}

function emptyRegistry(): WorkspaceRegistry {
  return { schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [], lastOpenedRoot: null };
}

function canonicalRegistry(value: any, label: any): WorkspaceRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  for (const field of Object.keys(value)) {
    if (!new Set(['schemaVersion', 'roots', 'lastOpenedRoot']).has(field)) throw new Error(`${label}.${field} is not supported.`);
  }
  if (value.schemaVersion !== WORKSPACE_REGISTRY_SCHEMA) throw new Error(`${label}.schemaVersion must be ${WORKSPACE_REGISTRY_SCHEMA}.`);
  if (!Array.isArray(value.roots) || value.roots.some((root: any) => typeof root !== 'string' || !path.isAbsolute(root))) {
    throw new Error(`${label}.roots must contain absolute paths.`);
  }
  const roots = [...new Set<string>(value.roots.map((root: string) => path.resolve(root)))];
  const lastOpenedRoot = value.lastOpenedRoot === null || value.lastOpenedRoot === undefined
    ? null
    : path.resolve(value.lastOpenedRoot);
  if (lastOpenedRoot !== null && !roots.includes(lastOpenedRoot)) throw new Error(`${label}.lastOpenedRoot must reference a registered root.`);
  return { schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots, lastOpenedRoot };
}

export function readWorkspaceRegistryFile(file: any) {
  const resolved = path.resolve(file);
  let content: string;
  try { content = fs.readFileSync(resolved, 'utf8'); }
  catch (error: any) {
    if (error.code === 'ENOENT' && isConfirmedMissingPath(resolved)) return { file: resolved, status: 'absent', registry: emptyRegistry(), reason: null };
    return { file: resolved, status: 'invalid', registry: null, reason: `workspace-registry.json cannot be read: ${error.message}` };
  }
  let value;
  try { value = JSON.parse(content); } catch (error: any) {
    return { file: resolved, status: 'invalid', registry: null, reason: `workspace-registry.json is invalid JSON: ${error.message}` };
  }
  try {
    return { file: resolved, status: 'ready', content, registry: canonicalRegistry(value, 'workspace-registry.json'), reason: null };
  } catch (error: any) {
    return { file: resolved, status: 'invalid', registry: null, reason: error.message };
  }
}

/**
 * 预览实例由 preview-lifecycle 注入 BUILDR_LOCAL_APP_PREVIEW，并把数据根隔离到
 * <共享数据根>/previews/<instance>；此处从该约定推导共享 Profile 的登记文件。
 * 返回 null 表示当前实例不读共享登记列表。
 */
export function resolvePreviewSharedRegistryFile(webProfile: WebProfile, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.BUILDR_LOCAL_APP_PREVIEW;
  if (!raw || !webProfile.overridden) return null;
  let instance: string | null = null;
  try {
    const owner = JSON.parse(raw);
    if (owner && typeof owner.instance === 'string') instance = owner.instance;
  } catch { return null; }
  if (!instance) return null;
  const resolved = path.resolve(webProfile.dataRoot);
  const previewsRoot = path.dirname(resolved);
  const sharedRoot = path.dirname(previewsRoot);
  if (resolved !== path.join(previewsRoot, instance) || path.basename(previewsRoot) !== 'previews') return null;
  return path.join(sharedRoot, 'workspace-registry.json');
}

export function createWorkspaceRegistryRepository(runtime: WorkspaceRegistryRepositoryRuntime, options: WorkspaceRegistryRepositoryOptions = {}) {
  const productIdentity = options.productIdentity || options.readProductIdentity?.();
  if (!productIdentity) throw new Error('Workspace registry repository requires the System Installation identity port.');
  if (typeof options.resolveWebProfile !== 'function') throw new Error('Workspace registry repository requires the System Installation Web Profile contract.');
  const resolveWebProfile = options.resolveWebProfile;
  const webProfile = options.webProfile || resolveWebProfile(productIdentity, options);
  const sharedRegistryFile = options.sharedRegistryFile !== undefined ? options.sharedRegistryFile : resolvePreviewSharedRegistryFile(webProfile);

  function workspaceRegistryPath() {
    return path.join(webProfile.dataRoot, 'workspace-registry.json');
  }

  /** 当前实例是否写入共享 Profile 登记列表（未隔离数据根）。预览与显式覆盖都不算共享。 */
  function isSharedRegistryScope() {
    return webProfile.overridden !== true;
  }

  /** 预览上下文读取共享 Profile 的 roots；共享文件缺失或损坏时返回空列表，不阻断本实例读取。 */
  function readSharedRegistryRoots() {
    if (!sharedRegistryFile) return { file: null, roots: [] as string[] };
    const observed = readWorkspaceRegistryFile(sharedRegistryFile);
    if (observed.status !== 'ready' || !observed.registry) return { file: sharedRegistryFile, roots: [] as string[] };
    return { file: observed.file, roots: observed.registry.roots };
  }

  function readWorkspaceRegistryPersistence() {
    const file = workspaceRegistryPath();
    const observed = readWorkspaceRegistryFile(file);
    if (observed.status === 'absent') {
      const registry = emptyRegistry();
      const content = `${JSON.stringify(registry, null, 2)}\n`;
      return { file, content, revision: registryRevision(content), registry };
    }
    if (observed.status === 'invalid') throw new Error(observed.reason);
    const content = observed.content!;
    return { file, content, revision: registryRevision(content), registry: observed.registry! };
  }

  function writeWorkspaceRegistry(file: any, registry: any) {
    runtime.atomicWriteJson(file, canonicalRegistry(registry, 'Workspace registry'));
  }

  function withWorkspaceRegistryMutation(expectedRevision: any, mutate: any) {
    const file = workspaceRegistryPath();
    const lock = `${file}.lock`;
    runtime.ensureDirectory(path.dirname(file));
    try {
      return withExclusiveFileLock(lock, file, () => {
        const current = readWorkspaceRegistryPersistence();
        if (current.revision !== expectedRevision) {
          const conflict: Error & Record<string, any> = new Error('Workspace 登记列表已变化，请刷新后重试。');
          conflict.code = 'workspace_registry_revision_conflict';
          conflict.status = 409;
          conflict.details = { currentRevision: current.revision };
          throw conflict;
        }
        writeWorkspaceRegistry(current.file, mutate(current.registry));
        return readWorkspaceRegistryPersistence();
      }, { timeoutMs: 0 });
    } catch (error: any) {
      if (error.code !== 'buildr_exclusive_file_lock_timeout') throw error;
      const conflict: Error & Record<string, any> = new Error('Workspace 登记列表被其他操作占用，或锁的归属尚不能确认。请重新读取后重试；持续失败时由智能体核对锁归属。', { cause: error });
      conflict.code = 'workspace_registry_revision_conflict';
      conflict.status = 409;
      throw conflict;
    }
  }

  return Object.freeze({
    currentWebProfile: () => webProfile,
    currentProductIdentity: () => productIdentity,
    readWorkspaceRegistryFile,
    workspaceRegistryPath,
    readWorkspaceRegistryPersistence,
    writeWorkspaceRegistry,
    withWorkspaceRegistryMutation,
    workspaceRegistryRevision: registryRevision,
    isSharedRegistryScope,
    readSharedRegistryRoots,
    sharedRegistryFile: () => sharedRegistryFile,
  });
}

export type RegistryRepository = ReturnType<typeof createWorkspaceRegistryRepository>;
