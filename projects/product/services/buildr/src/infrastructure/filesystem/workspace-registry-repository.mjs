import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const WORKSPACE_REGISTRY_SCHEMA = 'buildr.local-workspace-registry/v1';

function registryRevision(content) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function localAppDataRoot({ respectOverride = true } = {}) {
  if (respectOverride && process.env.BUILDR_APP_DATA_DIR) return path.resolve(process.env.BUILDR_APP_DATA_DIR);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Buildr');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Buildr');
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'buildr');
}

function emptyRegistry() {
  return { schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [], lastOpenedRoot: null };
}

function canonicalRegistry(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  for (const field of Object.keys(value)) {
    if (!new Set(['schemaVersion', 'roots', 'lastOpenedRoot']).has(field)) throw new Error(`${label}.${field} is not supported.`);
  }
  if (value.schemaVersion !== WORKSPACE_REGISTRY_SCHEMA) throw new Error(`${label}.schemaVersion must be ${WORKSPACE_REGISTRY_SCHEMA}.`);
  if (!Array.isArray(value.roots) || value.roots.some((root) => typeof root !== 'string' || !path.isAbsolute(root))) {
    throw new Error(`${label}.roots must contain absolute paths.`);
  }
  const roots = [...new Set(value.roots.map((root) => path.resolve(root)))];
  const lastOpenedRoot = value.lastOpenedRoot === null || value.lastOpenedRoot === undefined
    ? null
    : path.resolve(value.lastOpenedRoot);
  if (lastOpenedRoot !== null && !roots.includes(lastOpenedRoot)) throw new Error(`${label}.lastOpenedRoot must reference a registered root.`);
  return { schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots, lastOpenedRoot };
}

export function registerWorkspaceRegistryRepository(runtime) {
  function workspaceRegistryPath() {
    return path.join(localAppDataRoot(), 'workspace-registry.json');
  }

  function readWorkspaceRegistryPersistence() {
    const file = workspaceRegistryPath();
    if (!fs.existsSync(file)) {
      const registry = emptyRegistry();
      const content = `${JSON.stringify(registry, null, 2)}\n`;
      return { file, content, revision: registryRevision(content), registry };
    }
    const content = fs.readFileSync(file, 'utf8');
    let value;
    try { value = JSON.parse(content); } catch (error) { throw new Error(`workspace-registry.json is invalid JSON: ${error.message}`); }
    return { file, content, revision: registryRevision(content), registry: canonicalRegistry(value, 'workspace-registry.json') };
  }

  function writeWorkspaceRegistry(file, registry) {
    runtime.atomicWriteJson(file, canonicalRegistry(registry, 'Workspace registry'));
  }

  function withWorkspaceRegistryMutation(expectedRevision, mutate) {
    const file = workspaceRegistryPath();
    const lock = `${file}.lock`;
    runtime.ensureDirectory(path.dirname(file));
    let descriptor;
    try {
      descriptor = fs.openSync(lock, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const conflict = new Error('Workspace 登记列表正在被另一个操作修改，请刷新后重试。');
      conflict.code = 'workspace_registry_revision_conflict';
      conflict.status = 409;
      throw conflict;
    }
    try {
      const current = readWorkspaceRegistryPersistence();
      if (current.revision !== expectedRevision) {
        const conflict = new Error('Workspace 登记列表已变化，请刷新后重试。');
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
    workspaceRegistryPath,
    readWorkspaceRegistryPersistence,
    writeWorkspaceRegistry,
    withWorkspaceRegistryMutation,
    workspaceRegistryRevision: registryRevision,
  });
  return runtime;
}
