export type ExternalConnection<TConfig = Record<string, unknown>> = {
  id: string;
  revision: string;
  name: string;
  category: string;
  type: string;
  environment: string;
  config: TConfig;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MySqlConfig = {
  host: string;
  port: number;
  username: string;
  defaultDatabase: string | null;
  selectedDatabases: string[];
};

export type MySqlConnection = ExternalConnection<MySqlConfig> & { category: 'data-source'; type: 'mysql' };

export function isMySqlConnection(connection: ExternalConnection): connection is MySqlConnection {
  return connection.category === 'data-source' && connection.type === 'mysql';
}

export type ConnectionInput = {
  name: string;
  category: 'data-source';
  type: 'mysql';
  environment: string;
  config: MySqlConfig;
  credentials?: { password: string };
};

export type ConnectionTestInput = ConnectionInput & { id?: string; expectedRevision?: string };
export type ConnectionTestResult = { ok: true; serverVersion: string; elapsedMs: number };
export type MySqlQueryResult = {
  connectionId: string;
  database: string | null;
  submittedSql: string;
  executedSql: string;
  columns: { name: string; type: string }[];
  rows: unknown[][];
  rowCount: number;
  rowLimit: number;
  elapsedMs: number;
  limitReached: boolean;
};
