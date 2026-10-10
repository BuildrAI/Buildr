import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';
import { AGENT_EXECUTION_CONFIG_VALUE_LIMIT } from '../../domain/agent-operations.ts';

const text = { type: 'string', minLength: 1 };
const closed = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const schema = (name: string, properties: Record<string, unknown>) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.buildr.ai/http/agent-operations/' + name, title: name, ...closed(properties) });
const configuredText = { type: ['string', 'null'], minLength: 1, maxLength: AGENT_EXECUTION_CONFIG_VALUE_LIMIT };
const executionConfig = { anyOf: [{ type: 'null' }, closed({ model: configuredText, modelProvider: configuredText, reasoningEffort: configuredText })] };
export const AGENT_OPERATIONS_HTTP_SCHEMAS = Object.freeze({
  registry: schema('AgentRegistryView', {
    revision: text, defaultAgentId: { type: ['string', 'null'] },
    agents: { type: 'array', items: closed({ id: text, kind: { enum: ['codex', 'dsh'] }, label: text, capabilities: { type: 'array', items: text }, availability: { enum: ['available', 'unavailable'] }, runtimeStatus: { enum: ['stopped', 'starting', 'running', 'idle', 'stopping'] }, lastExecutionConfig: executionConfig, safeReason: { type: ['string', 'null'] } }) },
  }),
  run: schema('AgentRunView', {
    id: text, agentId: text, registrationRevision: text, executionConfig,
    status: { enum: ['queued', 'starting', 'running', 'succeeded', 'failed', 'cancelled'] },
    output: {}, error: { anyOf: [{ type: 'null' }, closed({ code: text, message: text })] },
  }),
});
export const AGENT_OPERATIONS_HTTP_REQUESTS = Object.freeze({
  list: schema('AgentRegistryQuery', {}),
  select: schema('AgentSelectRequest', { agentId: text, expectedRevision: text }),
  run: schema('AgentRunQuery', { runId: text }),
  cancel: schema('AgentCancelRequest', { runId: text }),
});
export const AGENT_OPERATIONS_HTTP_OPERATIONS = Object.freeze([
  { id: 'agent-operations.list', method: 'GET', path: '/api/v1/app/agents', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.list.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id },
  { id: 'agent-operations.select', method: 'POST', path: '/api/v1/app/agents/select', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.select.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id },
  { id: 'agent-operations.run', method: 'GET', path: '/api/v1/app/agents/runs', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.run.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id },
  { id: 'agent-operations.cancel', method: 'POST', path: '/api/v1/app/agents/cancel', requestSchemaId: AGENT_OPERATIONS_HTTP_REQUESTS.cancel.$id, successSchemaId: AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id },
].map(operation => ({ ...operation, owner: 'agent-operations', disposition: 'migrated-json', responseKind: 'json', errorSchemaId: 'https://schemas.buildr.ai/http/local-app/error/response/v1' })));
export const AGENT_OPERATIONS_HTTP_VALIDATORS = compileJsonSchemaCatalog([...Object.values(AGENT_OPERATIONS_HTTP_REQUESTS), ...Object.values(AGENT_OPERATIONS_HTTP_SCHEMAS)]);
