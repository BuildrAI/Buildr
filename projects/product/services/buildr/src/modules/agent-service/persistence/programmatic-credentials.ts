import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AgentServiceError } from '@buildr-ai/buildr-agent';

export const PROGRAMMATIC_SCOPES = ['read', 'execute', 'answer', 'approve'] as const;
export type ProgrammaticScope = typeof PROGRAMMATIC_SCOPES[number];
export interface ProgrammaticCredential { id: string; name: string; workspaceIds: string[]; scopes: ProgrammaticScope[]; revision: string; createdAt: string; revokedAt: string | null }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function accessError(code: string, message: string, status = 403): never { throw new AgentServiceError(code, message, status); }
/** Profile-owned secrets: only hashes persist, every call rechecks revocation. */
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
  create(raw: unknown, registered: string[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) accessError('programmatic_input_invalid', '凭据参数必须为对象。', 400);
    const value = raw as Record<string, unknown>;
    if (Object.keys(value).some(key => !['name', 'workspaceIds', 'scopes'].includes(key)) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100
      || !Array.isArray(value.workspaceIds) || !value.workspaceIds.length || !value.workspaceIds.every(id => typeof id === 'string' && registered.includes(id))
      || !Array.isArray(value.scopes) || !value.scopes.includes('read') || !value.scopes.every(scope => PROGRAMMATIC_SCOPES.includes(scope as ProgrammaticScope))) accessError('programmatic_input_invalid', '请选择名称、已登记工作空间及合法权限（必须含读取）。', 400);
    const credential: ProgrammaticCredential = { id: randomUUID(), name: value.name.trim(), workspaceIds: [...new Set(value.workspaceIds as string[])], scopes: [...new Set(value.scopes as ProgrammaticScope[])], revision: randomUUID(), createdAt: new Date().toISOString(), revokedAt: null };
    const token = `brp_${randomBytes(32).toString('base64url')}`;
    this.use(true, db => db.prepare('INSERT INTO credentials VALUES (?, ?, ?)').run(credential.id, hash(token), JSON.stringify(credential)));
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
