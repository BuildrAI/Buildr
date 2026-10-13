import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const text = { type: 'string', minLength: 1, maxLength: 256 };
const provider = { enum: ['codex', 'dsh'] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const schema = (name: string, properties: Record<string, unknown>, required?: string[]) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.buildr.ai/http/native-session-links/${name}`, title: name, ...object(properties, required) });
const relation = object({ provider, id: text, workspaceId: text, taskId: text, connectionId: text, nativeSessionId: text, createdAt: text, revision: text, sessionUrl: { type: ['string', 'null'] }, taskUrl: { type: 'string', minLength: 1 } });
export const NATIVE_SESSION_LINKS_HTTP_SCHEMAS = {
  sessions: schema('NativeTaskSessions', { workspaceId: text, relations: { type: 'array', items: relation }, diagnostics: { type: 'array', items: object({ provider, code: text, message: { type: 'string', minLength: 1 } }) } }),
  open: schema('NativeSessionOpenResult', { provider: { const: 'dsh' }, opened: { const: true }, nativeSessionId: text }),
};
export const NATIVE_SESSION_LINKS_HTTP_REQUESTS = {
  empty: schema('NativeSessionsEmptyQuery', {}),
  sessions: schema('NativeSessionsQuery', { provider, taskId: text, connectionId: text, nativeSessionId: text }, []),
  relation: schema('NativeSessionRelationAction', { provider, relationId: text, expectedRevision: text }),
};
export const NATIVE_SESSION_LINKS_HTTP_OPERATIONS = [
  { id: 'native-session-links.sessions', method: 'GET', path: '/api/v1/workspaces/{workspaceId}/agent-sessions', requestSchemaId: NATIVE_SESSION_LINKS_HTTP_REQUESTS.sessions.$id, successSchemaId: NATIVE_SESSION_LINKS_HTTP_SCHEMAS.sessions.$id },
  { id: 'native-session-links.unlink', method: 'POST', path: '/api/v1/workspaces/{workspaceId}/agent-sessions/unlink', requestSchemaId: NATIVE_SESSION_LINKS_HTTP_REQUESTS.relation.$id, successSchemaId: NATIVE_SESSION_LINKS_HTTP_SCHEMAS.sessions.$id },
  { id: 'native-session-links.open', method: 'POST', path: '/api/v1/workspaces/{workspaceId}/agent-sessions/open', requestSchemaId: NATIVE_SESSION_LINKS_HTTP_REQUESTS.relation.$id, successSchemaId: NATIVE_SESSION_LINKS_HTTP_SCHEMAS.open.$id },
].map(operation => ({ ...operation, owner: 'native-session-links', disposition: 'migrated-json', responseKind: 'json', errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1' }));
export const NATIVE_SESSION_LINKS_HTTP_VALIDATORS = compileJsonSchemaCatalog([...Object.values(NATIVE_SESSION_LINKS_HTTP_SCHEMAS), ...Object.values(NATIVE_SESSION_LINKS_HTTP_REQUESTS)]);
