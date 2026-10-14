import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connectionFailure, type ConnectionScope } from '../domain/connection.ts';

/** Consumption evidence is local; it grants no future permission and contains no configuration text. */
export function consumeNacosPublicationAuthorization(scope: ConnectionScope, connectionId: string, source: string, statement: string): void {
  const directory = path.join(scope.rootPath, '.buildr', 'local', 'nacos-publish-authorizations');
  try {
    for (const part of [path.dirname(path.dirname(directory)), path.dirname(directory)]) {
      if (fs.existsSync(part) && (fs.lstatSync(part).isSymbolicLink() || !fs.lstatSync(part).isDirectory())) throw new Error('unsafe directory');
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(directory).isDirectory()) throw new Error('unsafe directory');
    const identity = crypto.createHash('sha256').update(JSON.stringify([scope.workspaceId, connectionId, source.trim(), statement.trim()])).digest('hex');
    try {
      fs.writeFileSync(path.join(directory, identity + '.json'), JSON.stringify({ schemaVersion: 'buildr.nacos-authorization-use/v1', usedAt: new Date().toISOString() }) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw connectionFailure('nacos_production_authorization_used', '这份用户授权依据已经用于一次生产发布尝试；再次发布需要用户新的明确授权。', 403);
      throw error;
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'nacos_production_authorization_used') throw error;
    throw connectionFailure('nacos_production_authorization_store_failed', '无法安全登记本次生产授权的使用，未发起发布；请保留现场并修复本机存储。', 409);
  }
}
