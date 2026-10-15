import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { atomicWriteFile, atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { assertRevision, failure, identifier, object, type AuthenticationGroup, type ConnectionInstance, type ConnectionScope } from '../domain/instance.ts';

const keys = new Map<string, Buffer>();
const CONNECTION_FILE_LIMIT = 256 * 1024;
export function digest(value: unknown): string { return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
/** Every existing segment is checked. No symlink or special file is a source asset. */
export function safePath(root: string, file: string): void {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw failure('connection_skill_path_invalid', '文件越出允许目录。');
  let current = root;
  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    current = segment ? path.join(current, segment) : current;
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))) throw failure('connection_skill_path_invalid', '连接文件路径不能经过符号链接或特殊文件。');
  }
}
function read(root: string, file: string, limit = CONNECTION_FILE_LIMIT): string | null {
  safePath(root, file);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile() || stat.size > limit) throw failure('connection_skill_file_invalid', '连接文件不是受支持的普通文件或超过大小限制。');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = fs.fstatSync(fd); if (!before.isFile() || before.size > limit) throw new Error();
    const bytes = Buffer.alloc(limit + 1); let length = 0;
    while (length <= limit) { const count = fs.readSync(fd, bytes, length, bytes.length - length, null); if (!count) break; length += count; }
    const after = fs.fstatSync(fd);
    if (length > limit || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  }
  catch { throw failure('connection_skill_file_invalid', '连接文件无法作为有界文本读取。'); }
  finally { fs.closeSync(fd); }
}
export class ConnectionFiles {
  readonly dataRoot: string;
  constructor(dataRoot: string) { this.dataRoot = path.resolve(dataRoot, 'connection-skills'); }
  private key(persist = false): Buffer {
    const file = path.join(this.dataRoot, 'key.json');
    const raw = read(this.dataRoot, file, 2048);
    let key: Buffer;
    if (raw !== null) {
      try {
        key = Buffer.from(JSON.parse(raw).key, 'base64');
        if (key.length !== 32 || (process.platform !== 'win32' && (fs.statSync(file).mode & 0o077))) throw new Error();
      } catch { throw failure('connection_skill_key_invalid', '本机认证密钥不可用；未尝试其他认证来源。'); }
      keys.set(this.dataRoot, key);
    } else { key = keys.get(this.dataRoot) ?? crypto.randomBytes(32); keys.set(this.dataRoot, key); }
    if (persist && raw === null) {
      fs.mkdirSync(this.dataRoot, { recursive: true, mode: 0o700 });
      try { fs.writeFileSync(file, JSON.stringify({ key: key.toString('base64') }) + '\n', { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return this.key(false); throw failure('connection_skill_key_unavailable', '本机认证密钥无法保存。'); }
    }
    return key;
  }
  revision(raw: unknown): string { return raw === null ? 'absent' : 'opaque-' + crypto.createHmac('sha256', this.key(true)).update(JSON.stringify(raw)).digest('hex'); }
  teamPath(scope: ConnectionScope, id: string): string { return path.join(scope.rootPath, 'connections', 'instances', identifier(id) + '.yml'); }
  readTeam(scope: ConnectionScope, id: string): { value: ConnectionInstance | null; revision: string; diagnostic?: string } {
    const raw = read(scope.rootPath, this.teamPath(scope, id));
    if (raw === null) return { value: null, revision: 'absent' };
    let instance: ConnectionInstance;
    try {
      if (/^(<<<<<<<|=======|>>>>>>>)/m.test(raw)) throw new Error();
      const doc = YAML.parseDocument(raw, { uniqueKeys: true });
      if (doc.errors.length) throw new Error();
      const value = object(doc.toJS({ maxAliasCount: 0 }));
      if (Object.keys(value).some(key => !['schemaVersion', 'id', 'name', 'environment', 'enabled', 'category', 'binding', 'config', 'authentication'].includes(key))) throw new Error();
      if (value.schemaVersion !== 'buildr.connection-instance/v1' || value.id !== id || typeof value.name !== 'string' || typeof value.enabled !== 'boolean' || typeof value.category !== 'string') throw new Error();
      if (value.environment !== undefined && (typeof value.environment !== 'string' || value.environment.length > 200)) throw new Error();
      if (!(value.name as string).trim() || (value.name as string).length > 200 || (value.category as string).length > 200) throw new Error();
      const binding = object(value.binding); object(value.config);
      if (Object.keys(binding).some(key => !['skillAssetIdentity', 'definitionId', 'sourceIdentity', 'configVersion'].includes(key))) throw new Error();
      if (!['skillAssetIdentity', 'definitionId', 'sourceIdentity'].every(key => typeof binding[key] === 'string') || !Number.isInteger(binding.configVersion)) throw new Error();
      if (value.authentication !== null && value.authentication !== undefined) { const auth = object(value.authentication); if (typeof auth.targetBinding !== 'string' || Object.keys(auth).some(key => !['targetBinding', 'values'].includes(key))) throw new Error(); object(auth.values); }
      instance = { ...value, environment: value.environment ?? '', authentication: value.authentication ?? null } as ConnectionInstance;
    } catch { throw failure('connection_skill_file_invalid', '连接文件身份或内容无效，可能存在合并冲突；已保留原文件。'); }
    try { return { value: instance, revision: this.revision(raw) }; }
    catch { return { value: instance, revision: 'unavailable', diagnostic: '本机观察密钥不可用，无法确认连接版本；共享连接内容有效且已保留，未修复密钥或回退认证。' }; }
  }
  ids(scope: ConnectionScope): string[] {
    const directory = path.join(scope.rootPath, 'connections', 'instances'); safePath(scope.rootPath, directory);
    return fs.existsSync(directory) ? fs.readdirSync(directory).filter(file => file.endsWith('.yml')).map(file => file.slice(0, -4)).sort() : [];
  }
  private localPath(scope: ConnectionScope, id: string): string { return path.join(this.dataRoot, digest([scope.workspaceId, scope.rootPath]), identifier(id) + '.json'); }
  readLocal(scope: ConnectionScope, id: string): { present: boolean; revision: string; group: AuthenticationGroup | null; diagnostic: string | null } {
    let raw: string | null;
    try { raw = read(this.dataRoot, this.localPath(scope, id), 64 * 1024); }
    catch { return { present: true, revision: 'unreadable', group: null, diagnostic: '个人认证文件不可读取；未回退团队认证。' }; }
    if (raw === null) return { present: false, revision: 'absent', group: null, diagnostic: null };
    let revision: string;
    try { revision = this.revision(raw); } catch { revision = 'unreadable'; }
    try {
      const encrypted = JSON.parse(raw);
      if (process.platform !== 'win32' && (fs.statSync(this.localPath(scope, id)).mode & 0o077)) throw new Error();
      const cipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(encrypted.iv, 'base64'));
      cipher.setAAD(Buffer.from(JSON.stringify([scope.workspaceId, scope.rootPath, id]))); cipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
      const group = JSON.parse(Buffer.concat([cipher.update(Buffer.from(encrypted.ciphertext, 'base64')), cipher.final()]).toString('utf8'));
      if (typeof group.targetBinding !== 'string') throw new Error(); object(group.values);
      return { present: true, revision, group, diagnostic: null };
    } catch { return { present: true, revision, group: null, diagnostic: '个人认证无法解密或格式无效；未回退团队认证。' }; }
  }
  lock<T>(scope: ConnectionScope, id: string, action: () => T): T {
    this.key(true);
    const lock = path.join(this.dataRoot, 'locks', digest([scope.workspaceId, scope.rootPath, identifier(id)]) + '.lock');
    safePath(this.dataRoot, lock); fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
    return withExclusiveFileLock(lock, scope.rootPath, action);
  }
  writeTeam(scope: ConnectionScope, value: ConnectionInstance, expected: string): void {
    const file = this.teamPath(scope, value.id); assertRevision(this.readTeam(scope, value.id).revision, expected);
    const content = YAML.stringify(value);
    if (Buffer.byteLength(content, 'utf8') > CONNECTION_FILE_LIMIT) throw failure('connection_skill_file_invalid', '连接内容序列化后超过大小限制；未修改已保存文件。', 400);
    safePath(scope.rootPath, file); atomicWriteFile(file, content, 'utf8', { mode: 0o600 });
  }
  removeTeam(scope: ConnectionScope, id: string, expected: string): void { const current = this.readTeam(scope, id); assertRevision(current.revision, expected); if (!current.value) throw failure('connection_skill_not_found', '当前实例不存在。', 404); fs.unlinkSync(this.teamPath(scope, id)); }
  writeLocal(scope: ConnectionScope, id: string, group: AuthenticationGroup | null, expected: string): void {
    assertRevision(this.readLocal(scope, id).revision, expected);
    const file = this.localPath(scope, id); safePath(this.dataRoot, file);
    if (group === null) { fs.rmSync(file, { force: true }); return; }
    if (Buffer.byteLength(JSON.stringify(group)) > 32 * 1024) throw failure('connection_skill_auth_invalid', '认证组超过大小限制。', 400);
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', this.key(true), iv);
    cipher.setAAD(Buffer.from(JSON.stringify([scope.workspaceId, scope.rootPath, id])));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(group), 'utf8'), cipher.final()]);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    atomicWriteJson(file, { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }, { mode: 0o600 });
  }
  privateState(scope: ConnectionScope, identity: string): string {
    const directory = path.join(this.dataRoot, 'providers', digest([scope.workspaceId, scope.rootPath, identity]));
    safePath(this.dataRoot, directory); fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); return directory;
  }
}
