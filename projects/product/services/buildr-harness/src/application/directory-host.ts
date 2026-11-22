import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AgentHostCapabilities, ExecutionScope, ExecutionScopeRef } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { claimStorage, readPrivate, writePrivate } from '../process/ownership.ts';
import { previewLocalFile, type LocalFilePreview } from './local-file-preview.ts';

import type { LocalWorkspaceAuthority } from './local-workspaces.ts';

export const DIRECTORY_SOURCE_ID = 'harness-local';
export interface HarnessDirectory extends ExecutionScope { selectedPath: string; name?: string }
interface DirectoryStore { version: 1; directories: HarnessDirectory[] }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Observe both the selected route (including links) and the actual directory.
 * CWD is an execution starting point, not a filesystem sandbox. */
export function observeWorkbenchDirectory(selectedPath: string) {
  try {
    const rootPath = fs.realpathSync(selectedPath);
    const target = fs.statSync(rootPath);
    if (!target.isDirectory()) throw new Error('not a directory');
    fs.accessSync(rootPath, fs.constants.R_OK | fs.constants.X_OK);
    const links: unknown[] = [];
    let current = path.parse(selectedPath).root;
    for (const segment of selectedPath.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink()) links.push([current, info.ino, info.birthtimeMs, fs.readlinkSync(current)]);
    }
    // Device numbers can change across restarts; do not use them as persistent identity.
    return { rootPath, revision: digest([selectedPath, rootPath, target.ino, target.birthtimeMs, links]) };
  } catch {
    throw new AgentServiceError('agent_directory_unavailable', '所选目录不存在、不可访问或已变化；原记录已保留。', 409);
  }
}

/** Built-in directory authority; no Development registry or second host process. */
export class HarnessDirectoryHost implements AgentHostCapabilities {
  private readonly filename: string;
  private readonly dataRoot: string;
  private readonly localWorkspaces?: LocalWorkspaceAuthority;
  constructor(dataRoot: string, localWorkspaces?: LocalWorkspaceAuthority) {
    this.dataRoot = dataRoot;
    this.filename = path.join(dataRoot, 'agent-service', 'directories.json');
    this.localWorkspaces = localWorkspaces;
  }
  private store(): DirectoryStore {
    const value = readPrivate<DirectoryStore>(this.filename);
    if (!value) return { version: 1, directories: [] };
    if (value.version !== 1 || !Array.isArray(value.directories) || value.directories.some(entry =>
      entry?.ref?.sourceId !== DIRECTORY_SOURCE_ID || typeof entry.ref.id !== 'string' || !entry.ref.id ||
      typeof entry.selectedPath !== 'string' || !path.isAbsolute(entry.selectedPath) ||
      entry.name !== undefined && (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 512) ||
      typeof entry.rootPath !== 'string' || !path.isAbsolute(entry.rootPath) || typeof entry.revision !== 'string' || !entry.revision)) {
      throw new AgentServiceError('agent_directory_record_invalid', '目录登记不可识别，未覆盖原记录。', 409);
    }
    return value;
  }
  list(): HarnessDirectory[] { return structuredClone(this.store().directories); }
  register(selectedPath: string, name?: string): HarnessDirectory {
    if(name !== undefined && (typeof name !== 'string' || name.trim().length > 160 || /[\0\r\n]/.test(name))) throw new AgentServiceError('agent_directory_name_invalid', '工作空间名称无效，请使用不超过 160 字符的单行名称。');
    const requestedName = name?.trim();
    if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath)) throw new AgentServiceError('agent_directory_path_invalid', '请选择准确的绝对目录。');
    const selected = path.normalize(selectedPath);
    const lock = claimStorage(this.dataRoot);
    try {
      const store = this.store(), observation = observeWorkbenchDirectory(selected);
      const existing = store.directories.find(entry => entry.selectedPath === selected);
      if (existing) {
        this.assertCurrent(existing, observation);
        if(requestedName && requestedName !== (existing.name || path.basename(existing.rootPath) || existing.rootPath)) throw new AgentServiceError('agent_directory_already_registered', '该目录已登记为其他名称，请直接选择已有工作空间；原名称未改变。', 409);
        return structuredClone(existing);
      }
      const registeredWorkspace = this.localWorkspaces?.findBySelectedPath(selected);
      if (registeredWorkspace) {
        if (requestedName && requestedName !== registeredWorkspace.name) {
          throw new AgentServiceError('agent_directory_already_registered', '该目录已登记为其他名称，请直接选择已有工作空间；原名称未改变。', 409);
        }
        return structuredClone(registeredWorkspace);
      }
      const entry: HarnessDirectory = { ref: { sourceId: DIRECTORY_SOURCE_ID, id: randomUUID() }, selectedPath: selected, name: requestedName || path.basename(selected) || observation.rootPath, ...observation };
      store.directories.push(entry);
      writePrivate(this.filename, store);
      return structuredClone(entry);
    } finally { lock.release(); }
  }
  async preview(input:{ref:ExecutionScopeRef;expectedRevision:string;path:string}):Promise<LocalFilePreview> {
    const scope=await this.resolveExecutionScope(input);
    return previewLocalFile({path:input.path,cwd:scope.rootPath});
  }
  private assertCurrent(entry: HarnessDirectory, current = observeWorkbenchDirectory(entry.selectedPath)): void {
    if (current.revision !== entry.revision || current.rootPath !== entry.rootPath) throw new AgentServiceError('agent_scope_binding_changed', '目录或链接身份已变化，未在新对象上继续；原对话及目录登记保留。', 409);
  }
  async resolveExecutionScope(input: { ref: ExecutionScopeRef; expectedRevision?: string }): Promise<ExecutionScope> {
    return this.resolveDirectory(input);
  }
  resolveDirectory({ ref, expectedRevision }: { ref: ExecutionScopeRef; expectedRevision?: string }): HarnessDirectory {
    const entry = this.store().directories.find(entry => entry.ref.sourceId === ref.sourceId && entry.ref.id === ref.id);
    if (!entry) throw new AgentServiceError('agent_directory_missing', '目录引用未登记，不能直接用路径发起工作。', 404);
    this.assertCurrent(entry);
    if (expectedRevision && expectedRevision !== entry.revision) throw new AgentServiceError('agent_scope_binding_changed', '目录观察版本已变化。', 409);
    return structuredClone(entry);
  }
  async listExecutionScopes({ sourceId }: { sourceId: string }) {
    if (sourceId !== DIRECTORY_SOURCE_ID) throw new AgentServiceError('agent_host_source_mismatch', '目录来源不匹配。', 409);
    const entries = this.list(), refs = entries.map(entry => entry.ref);
    const labels = Object.fromEntries(entries.map(entry => [entry.ref.id, entry.name || path.basename(entry.rootPath) || entry.rootPath]));
    const rootPaths = Object.fromEntries(entries.map(entry => [entry.ref.id, entry.rootPath]));
    return { refs, labels, rootPaths, revision: digest({refs,labels,rootPaths}) };
  }
  async verifyWorkObject(): Promise<never> {
    throw new AgentServiceError('agent_host_capability_unavailable', '目录宿主不提供业务工作对象核验。', 409);
  }
}
