import { createHash } from 'node:crypto';
import type { ExecutorBinding, ExecutorNativeSource, ExecutorOpenOptions, ModelGatewayConfiguration } from '../contracts.ts';
import { nativeBinding, resolveProvenanceForIdentity, sameVolumeProvenance, type NativeBindingProvenance } from './native-process.ts';

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

function provenanceFromNativeData(data: Record<string, unknown>): NativeBindingProvenance {
  const { observedVersion: _observedVersion, ...provenance } = data as NativeBindingProvenance & { observedVersion?: unknown };
  return provenance;
}

function candidateVolumeDevs(binding: ExecutorBinding | undefined, volumeDevs?: readonly number[]): readonly number[] | undefined {
  const recorded = typeof binding?.data?.dev === 'number' ? [binding.data.dev] : [];
  return recorded.length || volumeDevs?.length ? [...recorded, ...(volumeDevs ?? [])] : undefined;
}

export async function consumerBinding(provider: string, executable: string, version: string, config: string, options: ExecutorOpenOptions) {
  assertOpenModelBinding(options as { gateway?: unknown; nativeSource?: unknown });
  if (options.nativeSource) {
    const nativeSource = checkedNativeSource(options.nativeSource)!;
    const native = await nativeBinding(provider, executable, version, config, undefined, options.programSource);
    const provenance = provenanceFromNativeData(native.data);
    const nativeSourceIdentity = createHash('sha256')
      .update(JSON.stringify(['buildr-native-source/v1', nativeSource.accountId, nativeSource.accountIdentity]))
      .digest('hex');
    const wrap = (nativeIdentity: string) => createHash('sha256')
      .update(JSON.stringify(['buildr-native-source-binding/v1', nativeIdentity, nativeSourceIdentity]))
      .digest('hex');
    if (options.binding) {
      if (
        Boolean(options.binding.data?.gatewayIdentity)
        || (options.binding.data !== undefined && (options.binding.data.nativeSourceIdentity !== nativeSourceIdentity || !sameVolumeProvenance(provenance, options.binding.data)))
      ) {
        throw new Error('agent_context_binding_mismatch');
      }
      const matched = resolveProvenanceForIdentity(provenance, options.binding.identity, candidateVolumeDevs(options.binding, options.volumeDevs), wrap);
      if (!matched) throw new Error('agent_context_binding_mismatch');
      return { identity: options.binding.identity, data: { ...matched, observedVersion: version, nativeSourceIdentity } };
    }
    if (options.preferredBinding && !options.preferredBinding.data?.gatewayIdentity
        && (options.preferredBinding.data === undefined || (options.preferredBinding.data.nativeSourceIdentity === nativeSourceIdentity && sameVolumeProvenance(provenance, options.preferredBinding.data)))) {
      const matched = resolveProvenanceForIdentity(provenance, options.preferredBinding.identity, candidateVolumeDevs(options.preferredBinding, options.volumeDevs), wrap);
      if (matched) return { identity: options.preferredBinding.identity, data: { ...matched, observedVersion: version, nativeSourceIdentity } };
    }
    return { identity: wrap(native.identity), data: { ...native.data, nativeSourceIdentity } };
  }
  if (!options.gateway) {
    if (options.binding?.data?.gatewayIdentity || options.binding?.data?.nativeSourceIdentity) {
      throw new Error('agent_context_binding_mismatch');
    }
    return await nativeBinding(provider, executable, version, config, options.binding, options.programSource, options.volumeDevs);
  }
  if (options.binding?.data?.nativeSourceIdentity) throw new Error('agent_context_binding_mismatch');
  const native = await nativeBinding(provider, executable, version, config, undefined, options.programSource);
  const provenance = provenanceFromNativeData(native.data);
  const wrap = (nativeIdentity: string) => createHash('sha256').update(JSON.stringify(['buildr-model-gateway/v1', nativeIdentity, options.gateway!.identity])).digest('hex');
  if (options.binding) {
    if (options.binding.data !== undefined && (options.binding.data.gatewayIdentity !== options.gateway.identity || !sameVolumeProvenance(provenance, options.binding.data))) {
      throw new Error('agent_context_binding_mismatch');
    }
    const matched = resolveProvenanceForIdentity(provenance, options.binding.identity, candidateVolumeDevs(options.binding, options.volumeDevs), wrap);
    if (!matched) throw new Error('agent_context_binding_mismatch');
    return { identity: options.binding.identity, data: { ...matched, observedVersion: version, gatewayIdentity: options.gateway.identity } };
  }
  if (options.preferredBinding && !options.preferredBinding.data?.nativeSourceIdentity
      && (options.preferredBinding.data === undefined || (options.preferredBinding.data.gatewayIdentity === options.gateway.identity && sameVolumeProvenance(provenance, options.preferredBinding.data)))) {
    const matched = resolveProvenanceForIdentity(provenance, options.preferredBinding.identity, candidateVolumeDevs(options.preferredBinding, options.volumeDevs), wrap);
    if (matched) return { identity: options.preferredBinding.identity, data: { ...matched, observedVersion: version, gatewayIdentity: options.gateway.identity } };
  }
  return { identity: wrap(native.identity), data: { ...native.data, gatewayIdentity: options.gateway.identity } };
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
