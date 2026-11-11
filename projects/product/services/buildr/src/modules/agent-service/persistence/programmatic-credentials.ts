import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AgentServiceError } from '@buildr-ai/buildr-agent';

export const PROGRAMMATIC_SCOPES = ['read', 'execute', 'answer', 'approve'] as const;
export type ProgrammaticScope = typeof PROGRAMMATIC_SCOPES[number];
export interface ProgrammaticCredential { id: string; name: string; workspaceIds: string[]; scopes: ProgrammaticScope[]; revision: string; createdAt: string; revokedAt: string | null; tokenFilePath?: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function accessError(code: string, message: string, status = 403): never { throw new AgentServiceError(code, message, status); }
/** SQLite stores only hashes; caller-readable secrets live in profile-private 600 files. */
export class ProgrammaticCredentials {
  private readonly dataRoot: string;
  constructor(dataRoot: string) { this.dataRoot = dataRoot; }
  private use<T>(write: boolean, action: (db: DatabaseSync) => T): T {
    const dir = path.join(this.dataRoot, 'programmatic-access'), file = path.join(dir, 'credentials.sqlite');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== path.join(fs.realpathSync(this.dataRoot), 'programmatic-access')) accessError('programmatic_storage_unsafe', '程序凭据目录身份不安全。', 409);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) accessError('programmatic_storage_unsafe', '程序凭据库身份不安全。', 409);
    if (!stat) fs.closeSync(fs.openSync(file, 'wx', 0o600));
    fs.chmodSync(file, 0o600);
    const db = new DatabaseSync(file);
    try {
      db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, digest TEXT UNIQUE NOT NULL, metadata TEXT NOT NULL)');
      if (write) db.exec('BEGIN IMMEDIATE');
      const result = action(db);
      if (write) db.exec('COMMIT');
      return result;
    } catch (error) { if (write && db.isTransaction) db.exec('ROLLBACK'); throw error; }
    finally { db.close(); }
  }
  list(): ProgrammaticCredential[] { return this.use(false, db => db.prepare('SELECT metadata FROM credentials ORDER BY rowid DESC').all().map(row => JSON.parse(String(row.metadata)))); }
  private saveToken(credential: ProgrammaticCredential, token: string) {
    const parent = path.join(this.dataRoot, 'programmatic-access');
    const dir = path.join(parent, 'tokens');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== path.join(fs.realpathSync(parent), 'tokens')) accessError('programmatic_storage_unsafe', '程序令牌目录身份不安全。', 409);
    fs.chmodSync(parent, 0o700);
    fs.chmodSync(dir, 0o700);
    const file = path.join(dir, `${credential.id}-${credential.revision}.token`);
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try {
      fs.fchmodSync(fd, 0o600);
      fs.writeFileSync(fd, token + '\n', 'utf8');
      fs.fsyncSync(fd);
    } catch (error) { fs.unlinkSync(file); throw error; }
    finally { fs.closeSync(fd); }
    credential.tokenFilePath = path.resolve(file);
  }
  private persistToken<T>(credential: ProgrammaticCredential, token: string, write: (db: DatabaseSync) => T): T {
    let saved = false;
    try {
      return this.use(true, db => {
        this.saveToken(credential, token); saved = true;
        return write(db);
      });
    } catch (error) {
      // Only remove the exclusive file from this attempt, never a prior credential.
      if (saved && credential.tokenFilePath) fs.unlinkSync(credential.tokenFilePath);
      if (error instanceof AgentServiceError) throw error;
      accessError('programmatic_token_save_failed', '程序令牌未能安全保存，凭据未生效。请检查实例私有目录与磁盘权限。', 500);
    }
  }
  create(raw: unknown, registered: string[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) accessError('programmatic_input_invalid', '凭据参数必须为对象。', 400);
    const value = raw as Record<string, unknown>;
    if (Object.keys(value).some(key => !['name', 'workspaceIds', 'scopes'].includes(key)) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100
      || !Array.isArray(value.workspaceIds) || !value.workspaceIds.length || !value.workspaceIds.every(id => typeof id === 'string' && registered.includes(id))
      || !Array.isArray(value.scopes) || !value.scopes.includes('read') || !value.scopes.every(scope => PROGRAMMATIC_SCOPES.includes(scope as ProgrammaticScope))) accessError('programmatic_input_invalid', '请选择名称、已登记工作空间及合法权限（必须含读取）。', 400);
    const credential: ProgrammaticCredential = { id: randomUUID(), name: value.name.trim(), workspaceIds: [...new Set(value.workspaceIds as string[])], scopes: [...new Set(value.scopes as ProgrammaticScope[])], revision: randomUUID(), createdAt: new Date().toISOString(), revokedAt: null };
    const token = `brp_${randomBytes(32).toString('base64url')}`;
    this.persistToken(credential, token, db => db.prepare('INSERT INTO credentials VALUES (?, ?, ?)').run(credential.id, hash(token), JSON.stringify(credential)));
    return { credential, token };
  }
  regenerate(id: string, revision: unknown) {
    const previous = this.list().find(item => item.id === id);
    if (!previous) accessError('programmatic_credential_missing', '凭据不存在。', 404);
    if (previous.revokedAt || previous.revision !== revision) accessError('programmatic_revision_conflict', '凭据已变化或撤销，请重新读取。', 409);
    const credential = { ...previous, revision: randomUUID() };
    const token = `brp_${randomBytes(32).toString('base64url')}`;
    this.persistToken(credential, token, db => {
      // Recheck inside the transaction: a revoke/regenerate may have won since list().
      const row = db.prepare('SELECT metadata FROM credentials WHERE id=?').get(id);
      const current = row && JSON.parse(String(row.metadata)) as ProgrammaticCredential | undefined;
      if (!current || current.revokedAt || current.revision !== revision) accessError('programmatic_revision_conflict', '凭据已变化或撤销，请重新读取。', 409);
      db.prepare('UPDATE credentials SET digest=?, metadata=? WHERE id=?').run(hash(token), JSON.stringify(credential), id);
    });
    return { credential, token };
  }
  revoke(id: string, revision: unknown) {
    return this.use(true, db => {
      const row = db.prepare('SELECT metadata FROM credentials WHERE id=?').get(id);
      if (!row) accessError('programmatic_credential_missing', '凭据不存在。', 404);
      const credential = JSON.parse(String(row.metadata)) as ProgrammaticCredential;
      if (credential.revision !== revision) accessError('programmatic_revision_conflict', '凭据已变化，请重新读取。', 409);
      credential.revokedAt ??= new Date().toISOString(); credential.revision = randomUUID();
      db.prepare('UPDATE credentials SET metadata=? WHERE id=?').run(JSON.stringify(credential), id);
      return credential;
    });
  }
  authenticate(authorization: unknown): ProgrammaticCredential {
    if (typeof authorization !== 'string' || !/^Bearer brp_[A-Za-z0-9_-]{43}$/.test(authorization)) accessError('programmatic_unauthorized', '需要有效的程序 Bearer 凭据。', 401);
    const credential = this.use(false, db => { const row = db.prepare('SELECT metadata FROM credentials WHERE digest=?').get(hash(authorization.slice(7))); return row ? JSON.parse(String(row.metadata)) as ProgrammaticCredential : undefined; });
    if (!credential || credential.revokedAt) accessError('programmatic_unauthorized', '程序凭据无效或已撤销。', 401);
    return credential;
  }
}
