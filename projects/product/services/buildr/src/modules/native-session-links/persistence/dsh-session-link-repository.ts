import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { boundedSessionIdentity, nativeSessionFailure, type NativeSessionRelation } from '../domain/native-session-links.ts';

type State = { schemaVersion: 'buildr.dsh-workspace-sessions/v1'; workspaceId: string; relations: NativeSessionRelation[] };
const failure = (code: string, message: string, status = 409) => nativeSessionFailure('dsh_' + code, message, status);
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value);
const exact = (value: object, fields: string[]) => Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key));

/** DSH relationships live separately; this repository never reads native chat history. */
export class DshSessionLinkRepository {
  private file(root: string) { return path.join(root, '.buildr', 'local', 'dsh-desktop-sessions.json'); }
  private assertDirectory(root: string) {
    for (const directory of [path.join(root, '.buildr'), path.join(root, '.buildr', 'local')]) {
      try { if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw new Error('invalid directory'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure('storage_scope_invalid', 'DSH 关联目录被替换或不可用。'); }
    }
  }
  read(root: string, workspaceId: string): State {
    this.assertDirectory(root);
    try {
      const file = this.file(root), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error('invalid state');
      const state = JSON.parse(fs.readFileSync(file, 'utf8')) as State;
      if (!state || state.schemaVersion !== 'buildr.dsh-workspace-sessions/v1' || state.workspaceId !== workspaceId || !exact(state, ['schemaVersion', 'workspaceId', 'relations']) || !Array.isArray(state.relations) || state.relations.length > 10_000
        || new Set(state.relations.map(r => r?.id)).size !== state.relations.length
        || new Set(state.relations.map(r => JSON.stringify([r?.taskId, r?.connectionId, r?.nativeSessionId]))).size !== state.relations.length
        || state.relations.some(r => !r || !exact(r, ['id', 'workspaceId', 'taskId', 'connectionId', 'nativeSessionId', 'createdAt', 'revision']) || !uuid(r.id) || r.workspaceId !== workspaceId || !boundedSessionIdentity(r.connectionId) || !boundedSessionIdentity(r.nativeSessionId) || typeof r.taskId !== 'string' || r.taskId.length > 200 || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(r.taskId) || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || typeof r.revision !== 'string' || !/^sha256-[a-f0-9]{64}$/u.test(r.revision))) throw new Error('invalid state');
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 'buildr.dsh-workspace-sessions/v1', workspaceId, relations: [] };
      if ((error as { code?: string }).code === 'dsh_storage_scope_invalid') throw error;
      throw failure('local_state_invalid', 'DSH 本机关联数据无法读取；已保留原文件。');
    }
  }
  mutate(root: string, workspaceId: string, change: (state: State) => void) {
    this.assertDirectory(root);
    const file = this.file(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      return withExclusiveFileLock(file + '.lock', file, () => {
        this.assertDirectory(root);
        const state = this.read(root, workspaceId);
        change(state);
        if (Buffer.byteLength(JSON.stringify(state, null, 2) + '\n') > 4 * 1024 * 1024) throw failure('local_state_full', 'DSH 本机关联数据已达容量限制；已有关系保留。');
        atomicWriteJson(file, state, { mode: 0o600 });
        return structuredClone(state);
      }, { timeoutMs: 0, assertSafe: () => this.assertDirectory(root) });
    } catch (error) {
      if ((error as { code?: string }).code === 'buildr_exclusive_file_lock_timeout') throw failure('local_state_busy', 'DSH 关联正在更新，请刷新后重试。');
      throw error;
    }
  }
}
