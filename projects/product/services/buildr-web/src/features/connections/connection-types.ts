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

export type NacosApiVersion = 'auto' | 'v1' | 'v2' | 'v3';
export type NacosConfig = {
  consoleUrl: string;
  username: string;
  namespaceId: string;
  defaultGroup: string;
  production: boolean;
  apiVersion: NacosApiVersion;
};
export type NacosConnection = ExternalConnection<NacosConfig> & { category: 'configuration'; type: 'nacos' };
export type EditableConnection = MySqlConnection | NacosConnection;

export function isNacosConnection(connection: ExternalConnection): connection is NacosConnection {
  return connection.category === 'configuration' && connection.type === 'nacos';
}

export function isEditableConnection(connection: ExternalConnection): connection is EditableConnection {
  return isMySqlConnection(connection) || isNacosConnection(connection);
}

export type MySqlConnectionInput = {
  name: string;
  category: 'data-source';
  type: 'mysql';
  environment: string;
  config: MySqlConfig;
  credentials?: { password: string };
};

export type NacosConnectionInput = {
  name: string;
  category: 'configuration';
  type: 'nacos';
  environment: string;
  config: NacosConfig;
  credentials?: { password: string };
};

export type ConnectionInput = MySqlConnectionInput | NacosConnectionInput;

export type ConnectionTestInput = ConnectionInput & { id?: string; expectedRevision?: string };
export type ConnectionTestResult = { ok: true; serverVersion?: string; elapsedMs: number; apiVersion?: Exclude<NacosApiVersion, 'auto'>; namespaceId?: string };
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

export type QueryPreferences = {
  enabledDatabases: string[];
  currentDatabase: string | null;
  revision: string;
};
