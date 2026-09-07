import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.ts';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/agent-assets';
const text: any = { type: 'string', minLength: 1 };
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT_2020_12, $id: `${ROOT}/${id}/v1`, title, ...body });

export const AGENT_ASSETS_HTTP_SCHEMAS: Readonly<Record<string, any>> = Object.freeze({
  inventoryRequest: schema('inventory/request', 'AgentAssetsInventoryRequest', closed({}, [])),
  inventoryResponse: schema('inventory/response', 'AgentAssetsInventoryResponse', closed({
    schemaVersion: { const: 'buildr.agent-assets-inventory/v1' },
    rules: { type: 'array', items: { type: 'object', additionalProperties: true } },
    skills: { type: 'array', items: { type: 'object', additionalProperties: true } },
    commands: { type: 'array', items: { type: 'object', additionalProperties: true } },
    components: { type: 'array', items: { type: 'object', additionalProperties: true } },
    builtins: { type: 'array', items: { type: 'object', additionalProperties: true } },
    runtimeProjection: { type: 'object', additionalProperties: true },
  }, ['schemaVersion', 'rules', 'skills', 'commands', 'components', 'builtins', 'runtimeProjection'])),
  rulesAddRequest: schema('rules/add-request', 'AgentAssetsRulesAddRequest', closed({ id: text, path: text, description: text, replace: { type: 'boolean' } }, ['id', 'description'])),
  rulesRemoveRequest: schema('rules/remove-request', 'AgentAssetsRulesRemoveRequest', closed({ id: text, keepFile: { type: 'boolean' } }, ['id'])),
  mutationResponse: schema('mutation/response', 'AgentAssetsMutationResponse', closed({ operation: text, inventory: { type: 'object', additionalProperties: true } }, ['operation', 'inventory'])),
  errorResponse: schema('error/response', 'AgentAssetsErrorResponse', closed({ error: closed({ code: text, message: text, details: {} }, ['code', 'message']) }, ['error'])),
});

export const AGENT_ASSETS_HTTP_OPERATIONS = Object.freeze([
  ['agent-assets.inventory', 'GET', '/agent-assets', 'inventoryRequest', 'inventoryResponse'],
  ['agent-assets.rules.add', 'POST', '/agent-assets/rules', 'rulesAddRequest', 'mutationResponse'],
  ['agent-assets.rules.remove', 'DELETE', '/agent-assets/rules/:id', 'rulesRemoveRequest', 'mutationResponse'],
].map(([id, method, path, request, success]: any) => Object.freeze({ id, method, path, requestSchemaId: AGENT_ASSETS_HTTP_SCHEMAS[request].$id, successSchemaId: AGENT_ASSETS_HTTP_SCHEMAS[success].$id, errorSchemaId: AGENT_ASSETS_HTTP_SCHEMAS.errorResponse.$id })));

export const AGENT_ASSETS_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(AGENT_ASSETS_HTTP_SCHEMAS));

export function validateAgentAssetsHttp(schemaId: any, value: any, operationId: any, phase: any = 'request'): any  {
  const result = AGENT_ASSETS_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const error: Error & Record<string, any> = new Error(`Agent Assets HTTP ${phase} DTO 不符合契约：${operationId}。`);
  error.code = phase === 'request' ? 'agent_assets_http_request_invalid' : 'agent_assets_http_response_invalid';
  error.status = 400;
  error.details = { operationId, schemaId, errors: result.errors };
  throw error;
}
