import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { productDataRoot } from '../../infrastructure/filesystem/product-data-root.ts';

export const WORKSPACE_REGISTRY_SCHEMA = 'buildr.local-workspace-registry/v1';

function registryRevision(content: any) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function buildrWebDataRoot({ respectOverride = true }: any = {}) {
  if (respectOverride && process.env.BUILDR_APP_DATA_DIR) return path.resolve(process.env.BUILDR_APP_DATA_DIR);
  return productDataRoot({ respectOverride: false });
}

function emptyRegistry() {
  return { schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [], lastOpenedRoot: null };
}

function canonicalRegistry(value: any, label: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  for (const field of Object.keys(value)) {
    if (!new Set(['schemaVersion', 'roots', 'lastOpenedRoot']).has(field)) throw new Error(`${label}.${field} is not supported.`);
  }
  if (value.schemaVersion !== WORKSPACE_REGISTRY_SCHEMA) throw new Error(`${label}.schemaVersion must be ${WORKSPACE_REGISTRY_SCHEMA}.`);
  if (!Array.isArray(value.roots) || value.roots.some((root: any) => typeof root !== 'string' || !path.isAbsolute(root))) {
    throw new Error(`${label}.roots must contain absolute paths.`);
  }
  const roots = [...new Set(value.roots.map((root: any) => path.resolve(root)))];
  const lastOpenedRoot = value.lastOpenedRoot === null || value.lastOpenedRoot === undefined
    ? null
    : path.resolve(value.lastOpenedRoot);
  if (lastOpenedRoot !== null && !roots.includes(lastOpenedRoot)) throw new Error(`${label}.lastOpenedRoot must reference a registered root.`);
  return { schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots, lastOpenedRoot };
}

export function readWorkspaceRegistryFile(file: any) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return { file: resolved, status: 'absent', registry: emptyRegistry(), reason: null };
  let value;
  try { value = JSON.parse(fs.readFileSync(resolved, 'utf8')); } catch (error: any) {
    return { file: resolved, status: 'invalid', registry: null, reason: `workspace-registry.json is invalid JSON: ${error.message}` };
  }
  try {
    return { file: resolved, status: 'ready', registry: canonicalRegistry(value, 'workspace-registry.json'), reason: null };
  } catch (error: any) {
    return { file: resolved, status: 'invalid', registry: null, reason: error.message };
  }
}

export function registerWorkspaceRegistryRepository(runtime: any, options: any = {}) {
  const productIdentity = options.productIdentity || options.readProductIdentity?.();
  if (!productIdentity) throw new Error('Workspace registry repository requires the System Installation identity port.');
  if (typeof options.resolveWebProfile !== 'function') throw new Error('Workspace registry repository requires the System Installation Web Profile contract.');
  const resolveWebProfile = options.resolveWebProfile;
  const webProfile = options.webProfile || resolveWebProfile(productIdentity, options);

  function workspaceRegistryPath() {
    return path.join(webProfile.dataRoot, 'workspace-registry.json');
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
    const content = fs.readFileSync(file, 'utf8');
    return { file, content, revision: registryRevision(content), registry: observed.registry };
  }

  function writeWorkspaceRegistry(file: any, registry: any) {
    runtime.atomicWriteJson(file, canonicalRegistry(registry, 'Workspace registry'));
  }

  function withWorkspaceRegistryMutation(expectedRevision: any, mutate: any) {
    const file = workspaceRegistryPath();
    const lock = `${file}.lock`;
    runtime.ensureDirectory(path.dirname(file));
    let descriptor;
    try {
      descriptor = fs.openSync(lock, 'wx');
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      const conflict: Error & Record<string, any> = new Error('Workspace 登记列表正在被另一个操作修改，请刷新后重试。');
      conflict.code = 'workspace_registry_revision_conflict';
      conflict.status = 409;
      throw conflict;
    }
    try {
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
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      fs.rmSync(lock, { force: true });
    }
  }

  Object.assign(runtime, {
    currentWebProfile: () => webProfile,
    currentProductIdentity: () => productIdentity,
    readWorkspaceRegistryFile,
    workspaceRegistryPath,
    readWorkspaceRegistryPersistence,
    writeWorkspaceRegistry,
    withWorkspaceRegistryMutation,
    workspaceRegistryRevision: registryRevision,
  });
  return runtime;
}
