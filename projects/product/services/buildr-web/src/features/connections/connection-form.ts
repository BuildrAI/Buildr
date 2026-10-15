import type { MySqlConnectionInput, MySqlConnection } from './connection-types';

export type ConnectionDraft = { name: string; environment: string; host: string; port: number | null; username: string; password: string; defaultDatabase: string };

export function connectionDraft(connection?: MySqlConnection): ConnectionDraft {
  return { name: connection?.name || '', environment: connection?.environment || '', host: connection?.config.host || '', port: connection?.config.port || 3306, username: connection?.config.username || '', password: '', defaultDatabase: connection?.config.defaultDatabase || '' };
}

export function connectionInput(draft: ConnectionDraft, previous?: MySqlConnection): MySqlConnectionInput {
  const name = draft.name.trim(), environment = draft.environment.trim(), host = draft.host.trim(), username = draft.username.trim();
  if (!name || !environment || !host || !username) throw new Error('请填写名称、环境、主机和用户。');
  if (!Number.isInteger(draft.port) || draft.port! < 1 || draft.port! > 65535) throw new Error('端口应为 1–65535 的整数。');
  const targetChanged = previous && (host !== previous.config.host || draft.port !== previous.config.port || username !== previous.config.username);
  if (targetChanged && previous.hasCredentials && !draft.password) throw new Error('主机、端口或用户已变化，请重新填写密码。');
  return {
    name, environment, category: 'data-source', type: 'mysql', config: { host, port: draft.port!, username, defaultDatabase: draft.defaultDatabase.trim() || null, selectedDatabases: previous?.config.selectedDatabases || [] },
    ...(!previous || draft.password || targetChanged ? { credentials: { password: draft.password } } : {}),
  };
}

export { resultCell } from '../mysql-query/result-cell.ts';
