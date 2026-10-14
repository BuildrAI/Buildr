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
export type KibanaConfig = { consoleUrl: string; username: string; dataViewId: string | null };
export type KibanaConnection = ExternalConnection<KibanaConfig> & { category: 'logs'; type: 'kibana' };
export type XxlJobApiVersion = 'auto' | '2.3.0';
export type XxlJobServiceBinding = { serviceId: string; executorId: number; appName: string };
export type XxlJobConfig = {
  consoleUrl: string;
  username: string;
  production: boolean;
  apiVersion: XxlJobApiVersion;
  serviceBindings: XxlJobServiceBinding[];
};
export type XxlJobConnection = ExternalConnection<XxlJobConfig> & { category: 'scheduling'; type: 'xxl-job' };
export type EditableConnection = MySqlConnection | NacosConnection | KibanaConnection | XxlJobConnection;

export function isNacosConnection(connection: ExternalConnection): connection is NacosConnection {
  return connection.category === 'configuration' && connection.type === 'nacos';
}

export function isEditableConnection(connection: ExternalConnection): connection is EditableConnection {
  return isMySqlConnection(connection) || isNacosConnection(connection) || isKibanaConnection(connection) || isXxlJobConnection(connection);
}

export function isKibanaConnection(connection: ExternalConnection): connection is KibanaConnection {
  return connection.category === 'logs' && connection.type === 'kibana';
}

export function isXxlJobConnection(connection: ExternalConnection): connection is XxlJobConnection {
  return connection.category === 'scheduling' && connection.type === 'xxl-job';
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

export type KibanaConnectionInput = { name: string; category: 'logs'; type: 'kibana'; environment: string; config: KibanaConfig; credentials?: { password: string } };
export type XxlJobConnectionInput = { name: string; category: 'scheduling'; type: 'xxl-job'; environment: string; config: XxlJobConfig; credentials?: { password: string } };
export type ConnectionInput = MySqlConnectionInput | NacosConnectionInput | KibanaConnectionInput | XxlJobConnectionInput;

export type ConnectionTestInput = ConnectionInput & { id?: string; expectedRevision?: string };
export type KibanaDataView = { id: string; name: string; title: string };
export type KibanaWarning = { code: string; message: string; field?: string };
export type KibanaDataViewsResult = { dataViews: KibanaDataView[]; total: number; offset: number; limit: number; limitReached: boolean; target?: string; serverVersion?: string | null; warnings: KibanaWarning[] };
export type KibanaDataViewsInput = ConnectionTestInput & { viewName?: string; offset?: number; limit?: number };
export type ConnectionTestResult = {
  ok: true; serverVersion?: string; elapsedMs: number; apiVersion?: Exclude<NacosApiVersion, 'auto'>; namespaceId?: string;
  kibana?: { dataView: KibanaDataView & { timeFieldName: string | null }; searchVerified: true; queryChannel: string; warnings: KibanaWarning[] };
  xxlJob?: { apiVersion: '2.3.0'; readVerified: true; executorCount: number; warnings: string[] };
};
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
