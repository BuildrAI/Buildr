import { createHash } from 'node:crypto';
import type { ExecutorNativeSource, ExecutorOpenOptions, ModelGatewayConfiguration } from '../contracts.ts';
import { nativeBinding } from './native-process.ts';

/** Only a restricted, local gateway lease crosses into a native consumer. */
export type ExecutorGateway = ModelGatewayConfiguration;

export interface GatewayValidationContext {
  executorId: string;
  nativeBinding?: 'gateway-lease' | 'account-identity';
}

export function assertOpenModelBinding(options: { gateway?: unknown; nativeSource?: unknown }): void {
  if (options.gateway !== undefined && options.nativeSource !== undefined) {
    throw new Error('agent_model_binding_conflict');
  }
}

export function checkedGateway(gateway?: ExecutorGateway, context?: GatewayValidationContext): ExecutorGateway | undefined {
  if (!gateway) return undefined;
  const url = new URL(gateway.baseUrl);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.port ||
    !gateway.identity ||
    !gateway.apiKey ||
    gateway.models.length !== 1 ||
    !gateway.models[0].id
  ) {
    throw new Error('agent_gateway_lease_invalid');
  }
  if (gateway.nativeModel) {
    if (!gateway.nativeModel.provider || !gateway.nativeModel.id || !gateway.nativeModel.accountIdentity) {
      throw new Error('agent_gateway_lease_invalid');
    }
    if (context && (context.nativeBinding !== 'gateway-lease' || gateway.nativeModel.provider !== context.executorId)) {
      throw new Error('agent_gateway_lease_invalid');
    }
  }
  return structuredClone(gateway);
}

export function checkedNativeSource(source?: ExecutorNativeSource): ExecutorNativeSource | undefined {
  if (!source) return undefined;
  if (!source.accountId || !source.accountIdentity || !source.modelId || !source.model?.id || source.model.id !== source.modelId) {
    throw new Error('agent_native_source_invalid');
  }
  return structuredClone(source);
}

export async function consumerBinding(provider: string, executable: string, version: string, config: string, options: ExecutorOpenOptions) {
  assertOpenModelBinding(options as { gateway?: unknown; nativeSource?: unknown });
  if (options.nativeSource) {
    const nativeSource = checkedNativeSource(options.nativeSource)!;
    const native = await nativeBinding(provider, executable, version, config, undefined, options.programSource);
    const nativeSourceIdentity = createHash('sha256')
      .update(JSON.stringify(['buildr-native-source/v1', nativeSource.accountId, nativeSource.accountIdentity]))
      .digest('hex');
    const identity = createHash('sha256')
      .update(JSON.stringify(['buildr-native-source-binding/v1', native.identity, nativeSourceIdentity]))
      .digest('hex');
    if (
      options.binding &&
      (options.binding.identity !== identity || options.binding.data?.nativeSourceIdentity !== nativeSourceIdentity || Boolean(options.binding.data?.gatewayIdentity))
    ) {
      throw new Error('agent_context_binding_mismatch');
    }
    return { identity, data: { ...native.data, nativeSourceIdentity } };
  }
  if (!options.gateway) {
    if (options.binding?.data?.gatewayIdentity || options.binding?.data?.nativeSourceIdentity) {
      throw new Error('agent_context_binding_mismatch');
    }
    return await nativeBinding(provider, executable, version, config, options.binding, options.programSource);
  }
  if (options.binding?.data?.nativeSourceIdentity) throw new Error('agent_context_binding_mismatch');
  const native = await nativeBinding(provider, executable, version, config, undefined, options.programSource);
  const identity = createHash('sha256').update(JSON.stringify(['buildr-model-gateway/v1', native.identity, options.gateway.identity])).digest('hex');
  if (options.binding && (options.binding.identity !== identity || options.binding.data?.gatewayIdentity !== options.gateway.identity)) {
    throw new Error('agent_context_binding_mismatch');
  }
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
