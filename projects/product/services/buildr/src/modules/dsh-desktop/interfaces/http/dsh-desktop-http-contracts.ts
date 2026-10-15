import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const text = { type: 'string', minLength: 1 };
const uuid = { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' };
const taskUrl = { type: ['string', 'null'], minLength: 1, maxLength: 512 };
const closed = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const schema = (name: string, properties: Record<string, unknown>) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.buildr.ai/http/dsh-desktop/' + name, title: name, ...closed(properties) });
export const DSH_DESKTOP_HTTP_SCHEMAS = {
  connections: schema('DshConnectionsView', { connections: { type: 'array', maxItems: 64, items: closed({ id: text, agentId: text, label: text, installationLabel: text, configurationLabel: text, status: { enum: ['configured', 'unavailable', 'disconnected'] }, safeReason: { type: ['string', 'null'] } }) } }),
  pageWatch: schema('DshPageWatchResult', { challengeId: { ...uuid, type: ['string', 'null'] } }),
  pageProbe: schema('DshPageProbeResult', { taskUrl }),
  pageAck: schema('DshPageAckResult', { accepted: { type: 'boolean' } }),
};
export const DSH_DESKTOP_HTTP_REQUESTS = {
  empty: schema('DshConnectionsQuery', {}),
  page: schema('DshPageQuery', { pageId: uuid }),
  pageAck: schema('DshPageAckRequest', { pageId: uuid, challengeId: uuid, taskUrl }),
};
const operation = (id: string, method: string, path: string, requestSchemaId: string, successSchemaId: string) => ({ id, method, path, requestSchemaId, successSchemaId, owner: 'dsh-desktop', disposition: 'migrated-json', responseKind: 'json', errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1' });
export const DSH_DESKTOP_HTTP_OPERATIONS = [
  operation('dsh-desktop.connections', 'GET', '/api/v1/app/dsh/connections', DSH_DESKTOP_HTTP_REQUESTS.empty.$id, DSH_DESKTOP_HTTP_SCHEMAS.connections.$id),
  operation('dsh-desktop.pages.watch', 'GET', '/api/v1/app/dsh/pages/watch', DSH_DESKTOP_HTTP_REQUESTS.page.$id, DSH_DESKTOP_HTTP_SCHEMAS.pageWatch.$id),
  operation('dsh-desktop.pages.probe', 'GET', '/api/v1/app/dsh/pages/probe', DSH_DESKTOP_HTTP_REQUESTS.page.$id, DSH_DESKTOP_HTTP_SCHEMAS.pageProbe.$id),
  operation('dsh-desktop.pages.ack', 'POST', '/api/v1/app/dsh/pages/ack', DSH_DESKTOP_HTTP_REQUESTS.pageAck.$id, DSH_DESKTOP_HTTP_SCHEMAS.pageAck.$id),
];
export const DSH_DESKTOP_HTTP_VALIDATORS = compileJsonSchemaCatalog([...Object.values(DSH_DESKTOP_HTTP_SCHEMAS), ...Object.values(DSH_DESKTOP_HTTP_REQUESTS)]);
