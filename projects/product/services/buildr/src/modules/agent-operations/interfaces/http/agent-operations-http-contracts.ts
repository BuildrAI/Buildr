import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';
import { AGENT_EXECUTION_CONFIG_VALUE_LIMIT } from '../../domain/agent-operations.ts';

const text = { type: 'string', minLength: 1 };
const closed = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const schema = (name: string, properties: Record<string, unknown>, required = Object.keys(properties)) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.buildr.ai/http/agent-operations/' + name, title: name, ...closed(properties, required) });
const configuredText = { type: ['string', 'null'], minLength: 1, maxLength: AGENT_EXECUTION_CONFIG_VALUE_LIMIT };
const executionConfig = { anyOf: [{ type: 'null' }, closed({ model: configuredText, modelProvider: configuredText, reasoningEffort: configuredText })] };
const safeError = closed({ code: text, message: text });
const desktopConnection = closed({ id: text, agentId: text, label: text, installationLabel: text, configurationLabel: text, status: { enum: ['pending', 'awaiting-desktop', 'ready', 'unavailable', 'disconnected'] }, safeReason: { type: ['string', 'null'] }, pluginVersion: { type: ['string', 'null'] }, lastSeenAt: { type: ['string', 'null'] } });
const registryFields = {
  revision: text, defaultAgentId: { type: ['string', 'null'] },
  agents: { type: 'array', items: closed({ id: text, kind: { enum: ['codex', 'dsh'] }, label: text, capabilities: { type: 'array', items: text }, availability: { enum: ['available', 'unavailable'] }, runtimeStatus: { enum: ['stopped', 'starting', 'running', 'idle', 'stopping'] }, lastExecutionConfig: executionConfig, safeReason: { type: ['string', 'null'] } }) },
};
export const AGENT_OPERATIONS_HTTP_SCHEMAS = Object.freeze({
  registry: schema('AgentRegistryView', registryFields),
  run: schema('AgentRunView', {
    id: text, agentId: text, registrationRevision: text, executionConfig,
    status: { enum: ['queued', 'starting', 'running', 'succeeded', 'failed', 'cancelled'] },
    output: {}, error: { anyOf: [{ type: 'null' }, closed({ code: text, message: text })] },
    cleanupWarning: safeError,
  }, ['id', 'agentId', 'registrationRevision', 'executionConfig', 'status', 'output', 'error']),
  discovery: schema('CodexDiscoveryView', {
    revision: text,
    candidates: { type: 'array', maxItems: 32, items: closed({ id: text, label: text, version: text, installationLabel: text, configurationLabel: text, source: { enum: ['desktop-bundled', 'path', 'registered'] }, registeredAgentId: { type: ['string', 'null'] }, desktopAvailable: { type: 'boolean' }, generationAvailability: { enum: ['available', 'unavailable'] }, safeReason: { type: ['string', 'null'] } }) },
  }),
  connect: schema('CodexConnectResult', { registry: closed(registryFields), agentId: text, desktop: { anyOf: [{ type: 'null' }, desktopConnection] }, desktopError: { anyOf: [{ type: 'null' }, safeError] } }),
  remove: schema('CodexRemoveResult', { registry: closed(registryFields), removedAgentId: text, desktopWarning: { anyOf: [{ type: 'null' }, safeError] } }),
});
export const AGENT_OPERATIONS_HTTP_REQUESTS = Object.freeze({
  list: schema('AgentRegistryQuery', {}),
  select: schema('AgentSelectRequest', { agentId: text, expectedRevision: text }),
  run: schema('AgentRunQuery', { runId: text }),
  cancel: schema('AgentCancelRequest', { runId: text }),
  discovery: schema('CodexDiscoveryQuery', {}),
  connect: schema('CodexConnectRequest', { candidateId: text, expectedDiscoveryRevision: text, expectedRevision: text, makeDefault: { type: 'boolean' }, existingAgentId: text }, ['candidateId', 'expectedDiscoveryRevision', 'expectedRevision']),
  remove: schema('CodexRemoveRequest', { agentId: text, expectedRevision: text }),
});
export const AGENT_OPERATIONS_HTTP_OPERATIONS = Object.freeze([
  { id: 'agent-operations.list', method: 'GET', path: '/api/v1/app/agents', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.list.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id },
  { id: 'agent-operations.select', method: 'POST', path: '/api/v1/app/agents/select', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.select.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id },
  { id: 'agent-operations.run', method: 'GET', path: '/api/v1/app/agents/runs', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.run.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id },
  { id: 'agent-operations.cancel', method: 'POST', path: '/api/v1/app/agents/cancel', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.cancel.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id },
  { id: 'agent-operations.codex-discovery', method: 'GET', path: '/api/v1/app/agents/codex/discovery', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.discovery.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.discovery.$id },
  { id: 'agent-operations.codex-connect', method: 'POST', path: '/api/v1/app/agents/codex/connect', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.connect.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.connect.$id },
  { id: 'agent-operations.codex-remove', method: 'POST', path: '/api/v1/app/agents/codex/remove', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.remove.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.remove.$id },
].map(operation => ({ ...operation, owner: 'agent-operations', disposition: 'migrated-json', responseKind: 'json', errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1' })));
export const AGENT_OPERATIONS_HTTP_VALIDATORS = compileJsonSchemaCatalog([...Object.values(AGENT_OPERATIONS_HTTP_REQUESTS), ...Object.values(AGENT_OPERATIONS_HTTP_SCHEMAS)]);
