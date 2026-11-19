import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AgentHostCapabilities, ExecutionScope, ExecutionScopeRef } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { claimStorage, readPrivate, writePrivate } from '../process/ownership.ts';

export const DIRECTORY_SOURCE_ID = 'harness-local';
export interface HarnessDirectory extends ExecutionScope { selectedPath: string; name?: string }
interface DirectoryStore { version: 1; directories: HarnessDirectory[] }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Observe both the selected route (including links) and the actual directory.
 * CWD is an execution starting point, not a filesystem sandbox. */
function observe(selectedPath: string) {
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
  constructor(dataRoot: string) {
    this.dataRoot = dataRoot;
    this.filename = path.join(dataRoot, 'agent-service', 'directories.json');
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
      const store = this.store(), observation = observe(selected);
      const existing = store.directories.find(entry => entry.selectedPath === selected);
      if (existing) {
        this.assertCurrent(existing, observation);
        if(requestedName && requestedName !== (existing.name || path.basename(existing.rootPath) || existing.rootPath)) throw new AgentServiceError('agent_directory_already_registered', '该目录已登记为其他名称，请直接选择已有工作空间；原名称未改变。', 409);
        return structuredClone(existing);
      }
      const entry: HarnessDirectory = { ref: { sourceId: DIRECTORY_SOURCE_ID, id: randomUUID() }, selectedPath: selected, name: requestedName || path.basename(selected) || observation.rootPath, ...observation };
      store.directories.push(entry);
      writePrivate(this.filename, store);
      return structuredClone(entry);
    } finally { lock.release(); }
  }
  async preview(input:{ref:ExecutionScopeRef;expectedRevision:string;path:string}):Promise<{kind:string;content:string;truncated:boolean}> {
    const scope=await this.resolveExecutionScope(input);
    if(typeof input.path!=='string'||!input.path||/[\0\r\n]/.test(input.path))throw new AgentServiceError('agent_directory_file_invalid','来源文件路径无效。');
    const selected=path.resolve(scope.rootPath,input.path);
    let actual:string,stat:fs.Stats;
    try{actual=fs.realpathSync(selected);stat=fs.statSync(actual);}catch{throw new AgentServiceError('agent_directory_file_missing','来源文件不存在。',404);}
    if(!actual!.startsWith(scope.rootPath+path.sep)||!stat!.isFile()||stat!.nlink!==1)throw new AgentServiceError('agent_directory_file_forbidden','文件不在已核验目录内，或身份不能确认。',403);
    const mime=new Map([['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.gif','image/gif'],['.webp','image/webp']]).get(path.extname(actual!).toLowerCase());
    if(!mime&&!/\.(?:md|txt|json|ya?ml|ts|tsx|js|jsx|mjs|cjs|css|html?|xml|sql|py|rs|go|java|sh|toml|ini|log)$/i.test(actual!))return {kind:'unsupported',content:'此类型仅可复制路径，不执行或内嵌打开。',truncated:false};
    const fd=fs.openSync(actual!,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{
      const opened=fs.fstatSync(fd);
      if(opened.ino!==stat!.ino||opened.dev!==stat!.dev||!opened.isFile())throw new AgentServiceError('agent_directory_file_changed','来源文件已变化。',409);
      const limit=1024*1024;
      if(mime&&opened.size>limit)throw new AgentServiceError('agent_directory_file_too_large','图片超出 1 MiB 预览上限。',413);
      const bytes=Buffer.alloc(Math.min(opened.size,limit));
      const length=fs.readSync(fd,bytes,0,bytes.length,0);
      if(length!==bytes.length)throw new AgentServiceError('agent_directory_file_changed','来源文件已变化。',409);
      await this.resolveExecutionScope(input);
      if(fs.realpathSync(selected)!==actual!)throw new AgentServiceError('agent_directory_file_changed','来源路径已变化。',409);
      if(mime)return {kind:'image',content:`data:${mime};base64,${bytes.toString('base64')}`,truncated:false};
      let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes,{stream:opened.size>bytes.length});}catch{throw new AgentServiceError('agent_directory_file_encoding','此文件不是可预览的 UTF-8 文本。',415);}
      return {kind:actual!.toLowerCase().endsWith('.md')?'markdown':'text',content,truncated:opened.size>bytes.length};
    }finally{fs.closeSync(fd);}
  }
  private assertCurrent(entry: HarnessDirectory, current = observe(entry.selectedPath)): void {
    if (current.revision !== entry.revision || current.rootPath !== entry.rootPath) throw new AgentServiceError('agent_scope_binding_changed', '目录或链接身份已变化，未在新对象上继续；原对话及目录登记保留。', 409);
  }
  async resolveExecutionScope({ ref, expectedRevision }: { ref: ExecutionScopeRef; expectedRevision?: string }): Promise<ExecutionScope> {
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
