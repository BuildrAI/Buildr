import { isMySqlConnection, isNacosConnection, type ExternalConnection } from './connection-types.ts';

export function connectionTypeLabel(connection: ExternalConnection): string {
  return connection.type === 'mysql' ? 'MySQL' : connection.type === 'nacos' ? 'Nacos' : connection.type;
}

export function connectionSearchText(connection: ExternalConnection): string {
  const target = isMySqlConnection(connection)
    ? `${connection.config.host}:${connection.config.port} ${connection.config.defaultDatabase || ''} ${connection.config.selectedDatabases.join(' ')}`
    : isNacosConnection(connection) ? `${connection.config.consoleUrl} ${connection.config.namespaceId} ${connection.config.defaultGroup}` : '';
  return `${connection.name} ${connection.environment} ${connection.category} ${connection.type} ${target}`;
}
