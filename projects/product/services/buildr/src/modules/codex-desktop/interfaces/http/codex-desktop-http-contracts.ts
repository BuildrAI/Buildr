import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const text = { type: 'string', minLength: 1 };
const nullableText = { type: ['string', 'null'] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const schema = (name: string, properties: Record<string, unknown>, required?: string[]) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.buildr.ai/http/codex-desktop/${name}`, title: name, ...object(properties, required) });
const connection = object({ id: text, agentId: text, label: text, installationLabel: text, configurationLabel: text, status: { enum: ['pending', 'awaiting-desktop', 'ready', 'unavailable', 'disconnected'] }, safeReason: nullableText, pluginVersion: nullableText, lastSeenAt: nullableText });
const relation = object({ id: text, workspaceId: text, taskId: text, connectionId: text, nativeSessionId: text, createdAt: text, revision: text, sessionUrl: text, taskUrl: text });
export const CODEX_DESKTOP_HTTP_SCHEMAS = {
  connections: schema('CodexDesktopConnections', { connections: { type: 'array', items: connection } }),
  sessions: schema('CodexTaskSessions', { workspaceId: text, relations: { type: 'array', items: relation } }),
  binding: schema('CodexBinding', { id: text, workspaceId: text, connectionId: text, taskId: nullableText, status: { enum: ['pending', 'bound', 'expired'] }, nativeSessionId: nullableText, createdAt: text, expiresAt: text, panelUrl: text, message: text }),
};
export const CODEX_DESKTOP_HTTP_REQUESTS = {
  empty: schema('CodexConnectionsQuery', {}),
  sessions: schema('CodexTaskSessionsQuery', { taskId: text, connectionId: text, nativeSessionId: text }, []),
  binding: schema('CodexCreateBinding', { connectionId: text, taskId: text, bindingRequestId: text }, ['connectionId']),
  receipt: schema('CodexBindingReceiptQuery', {}),
  unlink: schema('CodexUnlinkSession', { relationId: text, expectedRevision: text }),
};
export const CODEX_DESKTOP_HTTP_OPERATIONS = [
  { id: 'codex-desktop.connections', method: 'GET', path: '/api/v1/app/codex/connections', requestSchemaId: CODEX_DESKTOP_HTTP_REQUESTS.empty.$id, successSchemaId: CODEX_DESKTOP_HTTP_SCHEMAS.connections.$id },
  { id: 'codex-desktop.sessions', method: 'GET', path: '/api/v1/workspaces/{workspaceId}/codex/sessions', requestSchemaId: CODEX_DESKTOP_HTTP_REQUESTS.sessions.$id, successSchemaId: CODEX_DESKTOP_HTTP_SCHEMAS.sessions.$id },
  { id: 'codex-desktop.unlink', method: 'POST', path: '/api/v1/workspaces/{workspaceId}/codex/sessions/unlink', requestSchemaId: CODEX_DESKTOP_HTTP_REQUESTS.unlink.$id, successSchemaId: CODEX_DESKTOP_HTTP_SCHEMAS.sessions.$id },
  { id: 'codex-desktop.binding', method: 'POST', path: '/api/v1/workspaces/{workspaceId}/codex/bindings', requestSchemaId: CODEX_DESKTOP_HTTP_REQUESTS.binding.$id, successSchemaId: CODEX_DESKTOP_HTTP_SCHEMAS.binding.$id },
  { id: 'codex-desktop.receipt', method: 'GET', path: '/api/v1/workspaces/{workspaceId}/codex/bindings/{id}', requestSchemaId: CODEX_DESKTOP_HTTP_REQUESTS.receipt.$id, successSchemaId: CODEX_DESKTOP_HTTP_SCHEMAS.binding.$id },
].map(operation => ({ ...operation, owner: 'codex-desktop', disposition: 'migrated-json', responseKind: 'json', errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1' }));
export const CODEX_DESKTOP_HTTP_VALIDATORS = compileJsonSchemaCatalog([...Object.values(CODEX_DESKTOP_HTTP_REQUESTS), ...Object.values(CODEX_DESKTOP_HTTP_SCHEMAS)]);
