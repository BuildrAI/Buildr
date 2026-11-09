import { createHash } from 'node:crypto';
import type { ExecutorOpenOptions, ModelGatewayConfiguration } from '../contracts.ts';
import { nativeBinding } from './native-process.ts';
import { AgentServiceError } from '../domain/agent-state.ts';

/** Only a restricted, local gateway lease crosses into a native consumer. */
export type ExecutorGateway = ModelGatewayConfiguration;
export function checkedGateway(gateway?: ExecutorGateway): ExecutorGateway | undefined {
  if (!gateway) return undefined;
  const url = new URL(gateway.baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !url.port || !gateway.identity || !gateway.apiKey || gateway.models.length !== 1 || !gateway.models[0].id) throw new Error('agent_gateway_lease_invalid');
  if (gateway.nativeModel && (gateway.nativeModel.provider !== 'qoder' || !gateway.nativeModel.id || !gateway.nativeModel.accountIdentity)) throw new Error('agent_gateway_lease_invalid');
  return structuredClone(gateway);
}
export async function consumerBinding(provider: string, executable: string, version: string, config: string, options: ExecutorOpenOptions) {
  if (!options.gateway) {
    if (options.binding?.data?.gatewayIdentity) throw new Error('agent_context_binding_mismatch');
    return await nativeBinding(provider, executable, version, config, options.binding, options.programSource);
  }
  const native = await nativeBinding(provider, executable, version, config, undefined, options.programSource);
  const identity = createHash('sha256').update(JSON.stringify(['buildr-model-gateway/v1', native.identity, options.gateway.identity])).digest('hex');
  if (options.binding && (options.binding.identity !== identity || options.binding.data?.gatewayIdentity !== options.gateway.identity)) throw new Error('agent_context_binding_mismatch');
  return { identity, data: { ...native.data, gatewayIdentity: options.gateway.identity } };
}
export function gatewayModel(gateway: ExecutorGateway, id?: string) {
  const model = gateway.models.find(model => model.id === (id ?? gateway.models[0].id));
  if (!model) throw new Error('agent_gateway_model_mismatch');
  return model;
}
export function gatewayEffort(gateway: ExecutorGateway, id: string | undefined, effort?: string) {
  const model = gatewayModel(gateway, id);
  if (effort && !model.reasoningEfforts?.some(option => option.id === effort)) throw new Error('agent_reasoning_unavailable');
  return effort ?? model.defaultReasoningEffort;
}
// Qoder CustomByokProviderThinkingCapabilities accepts exactly these effort levels.
const qoderReasoningEfforts = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
function qoderProviderId(gateway: ExecutorGateway): string {
  return 'buildr-' + createHash('sha256').update(gateway.identity).digest('hex').slice(0, 24);
}
export function qoderGatewayModelId(gateway: ExecutorGateway): string {
  return gateway.nativeModel?.id ?? qoderProviderId(gateway) + '/' + gatewayModel(gateway).id;
}
/** A query-local settings overlay; account settings and credentials remain native-owned. */
export function qoderGatewaySettings(gateway: ExecutorGateway) {
  const model = gatewayModel(gateway);
  const efforts = model.reasoningEfforts?.filter(effort => qoderReasoningEfforts.has(effort.id)).map(effort => effort.id);
  return { providers: { [qoderProviderId(gateway)]: { type: 'openai-compatible', protocol: 'openai', authType: 'bearer', baseUrl: gateway.baseUrl, apiKey: '${BUILDR_MODEL_GATEWAY_KEY}', displayName: 'Buildr', model: model.id, models: [{ model: model.id, displayName: model.label, ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}), ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}), capabilities: { ...(typeof model.tools === 'boolean' ? { tools: model.tools } : {}), ...(typeof model.vision === 'boolean' ? { vision: model.vision } : {}), ...(efforts?.length ? { thinking: { modes: ['enabled'], preferredMode: 'enabled', supportsEffort: true, supportedEffortLevels: efforts } } : {}) } }] } } };
}
/** Called for every Qoder purpose; a qualified string selects its registered direct route. */
export function qoderGatewayPolicy(gateway: ExecutorGateway, selected?: string, effort?: string) {
  const model = gatewayModel(gateway, selected);
  const reasoningEffort = effort ?? model.defaultReasoningEffort;
  if (reasoningEffort && (!qoderReasoningEfforts.has(reasoningEffort) || !model.reasoningEfforts?.some(option => option.id === reasoningEffort)) || !reasoningEffort && model.reasoningEfforts?.length && !model.reasoningEfforts.some(option => qoderReasoningEfforts.has(option.id))) throw new AgentServiceError('agent_reasoning_unavailable', 'Qoder 暂不支持所选推理强度，请选择其他已支持档位。');
  return { model: qoderGatewayModelId(gateway), parameters: { ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) } };
}
