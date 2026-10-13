import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { atomicWriteFile, atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { CONNECTION_FIELDS, configuration, connectionFailure, connectionId, inputObject, recordRevision, type ConnectionRecord, type ConnectionScope, type PublicConnection } from '../domain/connection.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
/** Workspace declarations own targets; the host profile alone owns encrypted credentials. */
export class ConnectionRepository {
  readonly dataRoot: string;
  constructor(dataRoot: string) { this.dataRoot = path.resolve(dataRoot); }
  private assertDirectory(directory: string, boundary: string) {
    const relative = path.relative(boundary, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw connectionFailure('connection_storage_invalid', '连接存储目录越界。', 409);
    for (let current = boundary, index = -1, parts = relative.split(path.sep).filter(Boolean); index < parts.length; index++) {
      if (index >= 0) current = path.join(current, parts[index]);
      const stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw connectionFailure('connection_storage_invalid', '连接存储目录被替换或不可用。', 409);
    }
  }
  private file(scope: ConnectionScope) { return path.join(scope.rootPath, 'connections', 'manifest.yml'); }
  private secretDirectory(scope: ConnectionScope) {
    if (!uuid(scope.workspaceId)) throw connectionFailure('connection_workspace_invalid', '工作空间编号无效。', 409);
    return path.join(this.dataRoot, 'external-connections', scope.workspaceId);
  }
  private readFile(file: string, maxBytes = MAX_BYTES): string | null {
    try {
      const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const before = fs.fstatSync(descriptor);
        if (!before.isFile() || before.size > maxBytes) throw new Error('invalid file');
        const bytes = Buffer.alloc(maxBytes + 1); let length = 0;
        while (length < bytes.length) { const read = fs.readSync(descriptor, bytes, length, bytes.length - length, null); if (!read) break; length += read; }
        const after = fs.fstatSync(descriptor);
        if (length > maxBytes || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('file changed');
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
      } finally { fs.closeSync(descriptor); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw connectionFailure('connection_storage_invalid', '连接数据无法安全读取；已保留原文件。', 409);
    }
  }
  read(scope: ConnectionScope): ConnectionRecord[] {
    this.assertDirectory(path.dirname(this.file(scope)), scope.rootPath);
    const content = this.readFile(this.file(scope));
    if (content === null) return [];
    try {
      const document = YAML.parseDocument(content, { uniqueKeys: true });
      if (document.errors.length) throw new Error('invalid yaml');
      const value = inputObject(document.toJS(), ['schemaVersion', 'workspaceId', 'connections']);
      if (value.schemaVersion !== 'buildr.connections/v1' || value.workspaceId !== scope.workspaceId || !Array.isArray(value.connections) || value.connections.length > 1000) throw new Error('invalid manifest');
      const records = value.connections.map(raw => {
        const item = inputObject(raw, [...CONNECTION_FIELDS, 'id', 'credentialId', 'createdAt', 'updatedAt']);
        if (item.credentialId !== null && !uuid(item.credentialId) || !['createdAt', 'updatedAt'].every(field => typeof item[field] === 'string' && Number.isFinite(Date.parse(item[field] as string)))) throw new Error('invalid record');
        return { ...configuration(item), id: connectionId(item.id), credentialId: item.credentialId as string | null, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string };
      });
      if (new Set(records.map(item => item.id)).size !== records.length) throw new Error('duplicate id');
      const credentials = records.map(item => item.credentialId).filter(item => item !== null);
      if (new Set(credentials).size !== credentials.length) throw new Error('shared credential identity');
      return records;
    } catch { throw connectionFailure('connection_manifest_invalid', '连接声明无效；已保留原文件。', 409); }
  }
  mutate<T>(scope: ConnectionScope, action: (records: ConnectionRecord[]) => T): T {
    const file = this.file(scope);
    this.assertDirectory(path.dirname(file), scope.rootPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      return withExclusiveFileLock(file + '.lock', file, () => {
        this.assertDirectory(path.dirname(file), scope.rootPath);
        const records = this.read(scope), result = action(records);
        const content = YAML.stringify({ schemaVersion: 'buildr.connections/v1', workspaceId: scope.workspaceId, connections: records }, { lineWidth: 0 });
        if (Buffer.byteLength(content) > MAX_BYTES) throw connectionFailure('connection_storage_full', '连接声明容量已达上限。', 409);
        atomicWriteFile(file, content, 'utf8', { mode: 0o600 });
        return result;
      }, { timeoutMs: 1000, assertSafe: () => this.assertDirectory(path.dirname(file), scope.rootPath) });
    } catch (error) {
      if ((error as { code?: string }).code === 'buildr_exclusive_file_lock_timeout') throw connectionFailure('connection_revision_conflict', '连接正在更新，请刷新后重试。', 409);
      throw error;
    }
  }
  private key(create: boolean): Buffer | null {
    const directory = path.join(this.dataRoot, 'external-connections');
    this.assertDirectory(directory, this.dataRoot);
    if (create) { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700); }
    const file = path.join(directory, 'credential-key.json');
    if (create) {
      try { fs.writeFileSync(file, JSON.stringify({ key: crypto.randomBytes(32).toString('base64') }) + '\n', { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw connectionFailure('connection_credentials_unavailable', '本机认证密钥无法创建。', 409); }
    }
    const raw = this.readFile(file, 1024);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw), key = Buffer.from(value.key, 'base64');
      if (key.length !== 32 || Object.keys(value).join(',') !== 'key' || (fs.statSync(file).mode & 0o077) !== 0) throw new Error('invalid key');
      return key;
    } catch { throw connectionFailure('connection_credentials_unavailable', '本机认证密钥不可用；请重新配置密码。', 409); }
  }
  writeCredentials(scope: ConnectionScope, credentials: Record<string, unknown>, bindingDigest: string): string {
    if (!/^sha256-[a-f0-9]{64}$/.test(bindingDigest)) throw connectionFailure('connection_credentials_binding_invalid', '无法确认认证对应的连接目标。', 409);
    const directory = this.secretDirectory(scope);
    this.assertDirectory(directory, this.dataRoot);
    const key = this.key(true)!;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const id = crypto.randomUUID(), iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(scope.workspaceId + ':' + id + ':' + bindingDigest));
    const plaintext = JSON.stringify(credentials);
    if (Buffer.byteLength(plaintext) > 16 * 1024) throw connectionFailure('connection_credentials_invalid', '本机认证配置过大。');
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    atomicWriteJson(path.join(directory, id + '.json'), { schemaVersion: 'buildr.connection-credential/v2', bindingDigest, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }, { mode: 0o600 });
    return id;
  }
  readCredentials(scope: ConnectionScope, id: string | null, bindingDigest: string): Record<string, unknown> | null {
    if (id === null) return null;
    if (!uuid(id)) throw connectionFailure('connection_credentials_unavailable', '本机认证编号无效。', 409);
    const directory = this.secretDirectory(scope);
    this.assertDirectory(directory, this.dataRoot);
    const file = path.join(directory, id + '.json'), raw = this.readFile(file, 32 * 1024);
    if (raw === null) return null;
    const key = this.key(false);
    if (!key) return null;
    try {
      const value = JSON.parse(raw);
      if (value.schemaVersion !== 'buildr.connection-credential/v2' || !/^sha256-[a-f0-9]{64}$/.test(value.bindingDigest)) throw connectionFailure('connection_credentials_binding_invalid', '本机认证尚未绑定连接目标，请重新配置认证信息。', 409);
      if (value.bindingDigest !== bindingDigest) throw connectionFailure('connection_credentials_target_changed', '连接的地址、身份或类型已改变，请为当前目标重新配置认证信息。', 409);
      if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error('invalid secret');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
      decipher.setAAD(Buffer.from(scope.workspaceId + ':' + id + ':' + bindingDigest)); decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      const valueRaw = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
      return inputObject(valueRaw, Object.keys(valueRaw || {}));
    } catch (error) {
      if (['connection_credentials_binding_invalid', 'connection_credentials_target_changed'].includes((error as { code?: string }).code || '')) throw error;
      throw connectionFailure('connection_credentials_unavailable', '本机认证无法解密；请重新配置认证信息。', 409);
    }
  }
  removeCredentials(scope: ConnectionScope, id: string | null): void {
    if (!uuid(id)) return;
    this.assertDirectory(this.secretDirectory(scope), this.dataRoot);
    fs.rmSync(path.join(this.secretDirectory(scope), id + '.json'), { force: true });
  }
  public(scope: ConnectionScope, record: ConnectionRecord, bindingDigest: string | null): PublicConnection {
    const { credentialId, ...fields } = record;
    let hasCredentials = false;
    try { hasCredentials = bindingDigest !== null && this.readCredentials(scope, credentialId, bindingDigest) !== null; } catch { /* Unavailable local authentication does not hide the registered target. */ }
    return { ...fields, hasCredentials, revision: recordRevision(record) };
  }
}
