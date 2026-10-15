import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { atomicWriteFile, atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { assertRevision, diagnostic, failure, identifier, object, type AuthenticationGroup, type ConnectionInstance, type ConnectionScope } from '../domain/instance.ts';

const keys = new Map<string, Buffer>();
const CONNECTION_FILE_LIMIT = 256 * 1024;
type TeamSource = { sourcePath: string; id?: string; value?: ConnectionInstance; raw?: string; error?: unknown };
type TeamRecord = { value: ConnectionInstance; revision: string; sourcePath: string; diagnostic?: string };
type TeamRead = TeamRecord | { value: null; revision: 'absent'; sourcePath: null };
export function digest(value: unknown): string { return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function filenamePart(value: string, fallback: string): string {
  const normalized = value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  let result = '';
  for (const character of normalized) { if (Buffer.byteLength(result + character, 'utf8') > 60) break; result += character; }
  return result.replace(/-+$/g, '') || fallback;
}
function teamFilename(id: string, system: string, environment: string): string {
  const suffix = crypto.createHash('sha256').update(identifier(id)).digest('hex').slice(0, 12);
  return `${filenamePart(system, 'connection')}-${filenamePart(environment, 'default')}--${suffix}.yml`;
}
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
  private discoverTeam(scope: ConnectionScope): TeamSource[] {
    const directory = path.join(scope.rootPath, 'connections', 'instances'); safePath(scope.rootPath, directory);
    if (!fs.existsSync(directory)) return [];
    const sources: TeamSource[] = [];
    for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.yml')).sort()) {
      const source: TeamSource = { sourcePath: `connections/instances/${file}` };
      try {
        const raw = read(scope.rootPath, path.join(directory, file));
        if (raw === null) continue;
        source.raw = raw;
        if (/^(<<<<<<<|=======|>>>>>>>)/m.test(raw)) throw new Error();
        const doc = YAML.parseDocument(raw, { uniqueKeys: true });
        if (doc.errors.length) throw new Error();
        const value = object(doc.toJS({ maxAliasCount: 0 }));
        source.id = identifier(value.id);
        if (Object.keys(value).some(key => !['schemaVersion', 'id', 'name', 'environment', 'enabled', 'category', 'binding', 'config', 'authentication'].includes(key))) throw new Error();
        if (value.schemaVersion !== 'buildr.connection-instance/v1' || typeof value.name !== 'string' || typeof value.enabled !== 'boolean' || typeof value.category !== 'string') throw new Error();
        if (value.environment !== undefined && (typeof value.environment !== 'string' || value.environment.length > 200)) throw new Error();
        if (!(value.name as string).trim() || (value.name as string).length > 200 || (value.category as string).length > 200) throw new Error();
        const binding = object(value.binding); object(value.config);
        if (Object.keys(binding).some(key => !['skillAssetIdentity', 'definitionId', 'sourceIdentity', 'configVersion'].includes(key))) throw new Error();
        if (!['skillAssetIdentity', 'definitionId', 'sourceIdentity'].every(key => typeof binding[key] === 'string') || !Number.isInteger(binding.configVersion)) throw new Error();
        if (value.authentication !== null && value.authentication !== undefined) { const auth = object(value.authentication); if (typeof auth.targetBinding !== 'string' || Object.keys(auth).some(key => !['targetBinding', 'values'].includes(key))) throw new Error(); object(auth.values); }
        source.value = { ...value, environment: value.environment ?? '', authentication: value.authentication ?? null } as ConnectionInstance;
      } catch (error) {
        source.error = error instanceof Error && 'code' in error && String(error.code).startsWith('connection_') ? error : failure('connection_skill_file_invalid', '连接文件身份或内容无效，可能存在合并冲突；已保留原文件。');
      }
      sources.push(source);
    }
    return sources;
  }
  private teamFromSources(id: string, sources: TeamSource[]): TeamRead {
    const matches = sources.filter(source => source.id === id);
    if (matches.length > 1) throw failure('connection_skill_id_duplicate', `连接编号 ${id} 出现在多个文件：${matches.map(source => source.sourcePath).join('、')}；未选择、修改或删除其中任何文件。`);
    const source = matches[0];
    if (!source) return { value: null, revision: 'absent', sourcePath: null };
    if (source.error) throw source.error;
    if (!source.value || source.raw === undefined) throw failure('connection_skill_file_invalid', '连接文件身份或内容无效；已保留原文件。');
    try { return { value: source.value, sourcePath: source.sourcePath, revision: this.revision(source.raw) }; }
    catch { return { value: source.value, sourcePath: source.sourcePath, revision: 'unavailable', diagnostic: '本机观察密钥不可用，无法确认连接版本；共享连接内容有效且已保留，未修复密钥或回退认证。' }; }
  }
  readTeam(scope: ConnectionScope, id: string): TeamRead { return this.teamFromSources(identifier(id), this.discoverTeam(scope)); }
  listTeam(scope: ConnectionScope): { instances: TeamRecord[]; diagnostics: Array<{ id?: string; sourcePath?: string; message: string }> } {
    const sources = this.discoverTeam(scope), instances: TeamRecord[] = [], diagnostics: Array<{ id?: string; sourcePath?: string; message: string }> = [];
    for (const source of sources) if (!source.id) diagnostics.push({ sourcePath: source.sourcePath, message: diagnostic(source.error) });
    for (const id of new Set(sources.flatMap(source => source.id ? [source.id] : []))) {
      try { const team = this.teamFromSources(id, sources); if (team.value) instances.push(team); }
      catch (error) { diagnostics.push({ id, sourcePath: sources.find(source => source.id === id)?.sourcePath, message: diagnostic(error) }); }
    }
    return { instances, diagnostics };
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
  writeTeam(scope: ConnectionScope, value: ConnectionInstance, expected: string, system = value.binding.definitionId): void {
    const before = this.readTeam(scope, value.id); assertRevision(before.revision, expected);
    const content = YAML.stringify(value);
    if (Buffer.byteLength(content, 'utf8') > CONNECTION_FILE_LIMIT) throw failure('connection_skill_file_invalid', '连接内容序列化后超过大小限制；未修改已保存文件。', 400);
    const sourcePath = `connections/instances/${teamFilename(value.id, system, value.environment)}`, file = path.join(scope.rootPath, sourcePath);
    safePath(scope.rootPath, file);
    const assertOriginal = (sources = this.discoverTeam(scope)) => {
      const current = this.teamFromSources(value.id, sources); assertRevision(current.revision, expected);
      if (current.sourcePath !== before.sourcePath) throw failure('connection_skill_revision_conflict', '连接文件位置已变化，请重新读取；未覆盖或删除原文件。');
    };
    assertOriginal();
    if (before.sourcePath === sourcePath) { atomicWriteFile(file, content, 'utf8', { mode: 0o600 }); return; }
    const destination = fs.lstatSync(file, { throwIfNoEntry: false });
    const originalFile = before.sourcePath ? path.join(scope.rootPath, before.sourcePath) : null;
    if (destination && originalFile) {
      safePath(scope.rootPath, originalFile);
      const original = fs.lstatSync(originalFile, { throwIfNoEntry: false });
      // Case or Unicode-equivalent names can address the single observed file.
      // Separate hard-link entries were already rejected as duplicate identities.
      if (destination.isFile() && !destination.isSymbolicLink() && original?.isFile() && !original.isSymbolicLink() && destination.dev === original.dev && destination.ino === original.ino) {
        // The observed content also proves the full identity; inode values alone
        // are insufficient on filesystems that do not expose reliable numbers.
        assertRevision(this.revision(read(scope.rootPath, file)), expected);
        atomicWriteFile(originalFile, content, 'utf8', { mode: 0o600 }); return;
      }
    }
    if (destination) throw failure('connection_skill_path_occupied', '生成的连接文件路径已被占用；未覆盖原文件或占用文件。');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.buildr-tmp-${crypto.randomUUID()}`);
    let installed = false, originalRemoved = false;
    const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    const temporaryIdentity = fs.fstatSync(descriptor);
    try {
      fs.writeFileSync(descriptor, content, 'utf8'); fs.fsyncSync(descriptor);
      assertOriginal(); safePath(scope.rootPath, file);
      try { fs.linkSync(temporary, file); installed = true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw failure('connection_skill_path_occupied', '生成的连接文件路径已被占用；未覆盖原文件或占用文件。');
        throw failure('connection_skill_file_unavailable', '连接文件无法以不覆盖方式安装；原文件已保留。');
      }
      // The new hard link is the only extra identity expected during this migration.
      assertOriginal(this.discoverTeam(scope).filter(source => source.sourcePath !== sourcePath));
      const installedIdentity = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!installedIdentity?.isFile() || installedIdentity.dev !== temporaryIdentity.dev || installedIdentity.ino !== temporaryIdentity.ino || read(scope.rootPath, file) !== content) throw failure('connection_skill_revision_conflict', '新连接文件在保存期间发生变化；未清理原文件，请重新读取。');
      if (before.sourcePath) { safePath(scope.rootPath, path.join(scope.rootPath, before.sourcePath)); fs.unlinkSync(path.join(scope.rootPath, before.sourcePath)); originalRemoved = true; }
    } catch (error) {
      // Roll back only our own destination, and never remove the last preserved copy.
      if (installed && !originalRemoved) {
        try {
          const original = before.sourcePath ? fs.lstatSync(path.join(scope.rootPath, before.sourcePath), { throwIfNoEntry: false }) : null;
          const originalStillPresent = !before.sourcePath || original?.isFile() && !original.isSymbolicLink();
          const target = fs.lstatSync(file, { throwIfNoEntry: false });
          if (originalStillPresent && target?.isFile() && !target.isSymbolicLink() && target.dev === temporaryIdentity.dev && target.ino === temporaryIdentity.ino && read(scope.rootPath, file) === content) fs.unlinkSync(file);
        } catch { /* A changed or unreadable destination is preserved for explicit recovery. */ }
      }
      throw error;
    } finally { fs.closeSync(descriptor); fs.rmSync(temporary, { force: true }); }
  }
  removeTeam(scope: ConnectionScope, id: string, expected: string): void { const current = this.readTeam(scope, id); assertRevision(current.revision, expected); if (!current.value) throw failure('connection_skill_not_found', '当前实例不存在。', 404); const file = path.join(scope.rootPath, current.sourcePath); safePath(scope.rootPath, file); fs.unlinkSync(file); }
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
