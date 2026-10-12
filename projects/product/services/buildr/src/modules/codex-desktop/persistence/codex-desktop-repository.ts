import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { codexFailure, isNativeSessionId, type CodexConnections, type CodexWorkspaceSessions } from '../domain/codex-desktop.ts';

const text = (value: unknown, max = 256): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const nullableText = (value: unknown) => value === null || text(value, 2000);
const stamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const connectionId = (value: unknown) => typeof value === 'string' && value.startsWith('codex-') && isNativeSessionId(value.slice(6));
const taskId = (value: unknown) => typeof value === 'string' && value.length <= 200 && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value);
const digest = (value: unknown) => typeof value === 'string' && /^sha256-[a-f0-9]{64}$/.test(value);
const exact = (value: object, fields: string[]) => Object.keys(value).length === fields.length && Object.keys(value).every(k => fields.includes(k));
const maxStateBytes = 4 * 1024 * 1024;

/** One local owner for connections; workspace relations never rewrite Task Record. */
export class CodexDesktopRepository {
  readonly dataRoot: string;
  constructor(dataRoot: string) { this.dataRoot = dataRoot; }
  private read<T>(file: string, empty: () => T, validate: (value: unknown) => value is T): T {
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxStateBytes) throw new Error('invalid local file');
      const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!validate(value)) throw new Error('invalid local state');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
      throw codexFailure('codex_local_state_invalid', 'Codex 本机关联数据无法读取；已保留原文件。', 409);
    }
  }
  private assertDirectory(directory: string, boundary: string) {
    const relative = path.relative(boundary, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw codexFailure('codex_storage_scope_invalid', 'Codex 本机数据目录越界。', 409);
    let current = boundary;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try { if (fs.lstatSync(current).isSymbolicLink() || !fs.statSync(current).isDirectory()) throw new Error('invalid directory'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw codexFailure('codex_storage_scope_invalid', 'Codex 本机数据目录被替换或不可用。', 409); }
    }
  }
  private mutate<T>(file: string, boundary: string, read: () => T, change: (value: T) => void): T {
    this.assertDirectory(path.dirname(file), boundary);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      return withExclusiveFileLock(file + '.lock', file, () => {
        this.assertDirectory(path.dirname(file), boundary);
        const value = read();
        change(value);
        if (Buffer.byteLength(JSON.stringify(value, null, 2) + '\n', 'utf8') > maxStateBytes) throw codexFailure('codex_local_state_full', 'Codex 本机关联数据已达容量限制；原有关系和回执已保留。', 409);
        atomicWriteJson(file, value, { mode: 0o600 });
        return structuredClone(value);
      }, { timeoutMs: 0 });
    } catch (error) {
      if ((error as { code?: string }).code === 'buildr_exclusive_file_lock_timeout') throw codexFailure('codex_local_state_busy', 'Codex 关联正在更新，请刷新后重试。', 409);
      throw error;
    }
  }
  private connectionsFile() { return path.join(this.dataRoot, 'codex-desktop', 'connections.json'); }
  readConnections(): CodexConnections {
    this.assertDirectory(path.dirname(this.connectionsFile()), this.dataRoot);
    return this.read(this.connectionsFile(), () => ({ schemaVersion: 'buildr.codex-desktop-connections/v1', connections: [] }), (value): value is CodexConnections => {
      const v = value as CodexConnections;
      return v?.schemaVersion === 'buildr.codex-desktop-connections/v1' && exact(v, ['schemaVersion', 'connections']) && Array.isArray(v.connections) && v.connections.length <= 64
        && new Set(v.connections.map(c => c.id)).size === v.connections.length && v.connections.every(c => c && exact(c, ['id', 'agentId', 'label', 'installationLabel', 'configurationLabel', 'status', 'safeReason', 'pluginVersion', 'lastSeenAt', 'executable', 'codexHome', 'appPath', 'appVersion', 'scopeIdentity', 'connectorPid', 'preparationId', 'pluginEntryIdentity']) && connectionId(c.id) && /^agent-[a-f0-9-]{36}$/.test(c.agentId) && text(c.label, 100) && text(c.installationLabel) && text(c.configurationLabel) && ['pending', 'awaiting-desktop', 'ready', 'unavailable', 'disconnected'].includes(c.status) && nullableText(c.safeReason) && nullableText(c.pluginVersion) && nullableText(c.appVersion) && (c.lastSeenAt === null || stamp(c.lastSeenAt)) && path.isAbsolute(c.executable) && path.isAbsolute(c.codexHome) && path.isAbsolute(c.appPath) && digest(c.scopeIdentity) && (c.connectorPid === null || Number.isSafeInteger(c.connectorPid) && c.connectorPid > 0) && (c.preparationId === null || isNativeSessionId(c.preparationId)) && (c.pluginEntryIdentity === null || digest(c.pluginEntryIdentity)));
    });
  }
  mutateConnections(change: (value: CodexConnections) => void) { return this.mutate(this.connectionsFile(), this.dataRoot, () => this.readConnections(), change); }
  private workspaceFile(root: string) { return path.join(root, '.buildr', 'local', 'codex-desktop-sessions.json'); }
  readWorkspace(root: string, workspaceId: string): CodexWorkspaceSessions {
    this.assertDirectory(path.dirname(this.workspaceFile(root)), root);
    return this.read(this.workspaceFile(root), () => ({ schemaVersion: 'buildr.codex-workspace-sessions/v1', workspaceId, relations: [], bindings: [], handoffs: [] }), (value): value is CodexWorkspaceSessions => {
      const v = value as CodexWorkspaceSessions;
      return v?.schemaVersion === 'buildr.codex-workspace-sessions/v1' && v.workspaceId === workspaceId && exact(v, ['schemaVersion', 'workspaceId', 'relations', 'bindings', 'handoffs'])
        && Array.isArray(v.relations) && Array.isArray(v.bindings) && Array.isArray(v.handoffs) && v.relations.length <= 10_000 && v.bindings.length <= 512 && v.handoffs.length <= 512
        && [...v.relations, ...v.bindings, ...v.handoffs].every(r => r && r.workspaceId === workspaceId && isNativeSessionId(r.id) && connectionId(r.connectionId) && stamp(r.createdAt))
        && new Set([...v.relations, ...v.bindings, ...v.handoffs].map(r => r.id)).size === v.relations.length + v.bindings.length + v.handoffs.length
        && new Set(v.relations.map(r => JSON.stringify([r.taskId, r.connectionId, r.nativeSessionId]))).size === v.relations.length
        && v.relations.every(r => exact(r, ['id', 'workspaceId', 'taskId', 'connectionId', 'nativeSessionId', 'createdAt', 'revision']) && taskId(r.taskId) && isNativeSessionId(r.nativeSessionId) && digest(r.revision))
        && v.bindings.every(b => exact(b, ['id', 'workspaceId', 'connectionId', 'taskId', 'status', 'nativeSessionId', 'createdAt', 'expiresAt']) && (b.taskId === null || taskId(b.taskId)) && stamp(b.expiresAt) && (b.status === 'pending' && b.nativeSessionId === null || b.status === 'bound' && isNativeSessionId(b.nativeSessionId)))
        && v.handoffs.every(h => exact(h, ['id', 'workspaceId', 'connectionId', 'taskId', 'nativeSessionId', 'status', 'createdAt', 'expiresAt', 'taskRevision', 'goal', 'message']) && taskId(h.taskId) && isNativeSessionId(h.nativeSessionId) && ['pending', 'received'].includes(h.status) && stamp(h.expiresAt) && text(h.taskRevision) && text(h.goal, 2000) && text(h.message, 8000));
    });
  }
  mutateWorkspace(root: string, workspaceId: string, change: (value: CodexWorkspaceSessions) => void) {
    return this.mutate(this.workspaceFile(root), root, () => this.readWorkspace(root, workspaceId), change);
  }
}
