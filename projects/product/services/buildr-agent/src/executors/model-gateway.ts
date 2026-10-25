import { createHash } from 'node:crypto';
import type { AgentModel, ExecutorOpenOptions } from '../contracts.ts';
import { nativeBinding } from './native-process.ts';

/** Only a restricted, local gateway lease crosses into a native consumer. */
export interface ExecutorGateway {
  identity: string;
  baseUrl: string;
  apiKey: string;
  models: Array<AgentModel & { contextWindow?: number; maxOutputTokens?: number; vision?: boolean; tools?: boolean }>;
}
export function checkedGateway(gateway?: ExecutorGateway): ExecutorGateway | undefined {
  if (!gateway) return undefined;
  const url = new URL(gateway.baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !url.port || !gateway.identity || !gateway.apiKey || gateway.models.length !== 1 || !gateway.models[0].id) throw new Error('agent_gateway_lease_invalid');
  return structuredClone(gateway);
}
export async function consumerBinding(provider: string, executable: string, version: string, config: string, options: ExecutorOpenOptions) {
  if (!options.gateway) {
    if (options.binding?.data?.gatewayIdentity) throw new Error('agent_context_binding_mismatch');
    return await nativeBinding(provider, executable, version, config, options.binding);
  }
  const native = await nativeBinding(provider, executable, version, config);
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
/** Called for every Qoder purpose; no default-account inference may leak through. */
export function qoderGatewayPolicy(gateway: ExecutorGateway, selected?: string, effort?: string) {
  const model = gatewayModel(gateway, selected);
  const reasoningEffort = gatewayEffort(gateway, selected, effort);
  return { model: { provider: 'openai', api_key: gateway.apiKey, model: model.id, url: gateway.baseUrl.replace(/\/$/, ''), style: 'openai', isVl: model.vision === true }, parameters: { ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) } };
}
