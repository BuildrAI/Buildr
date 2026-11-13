import type { ExecutorDescriptor } from '../contracts.ts';
import type {
  ModelExecutorCompatibility,
  ModelProviderInference,
  ModelProviderSharing,
} from '../model-access/contracts.ts';

export interface StaticSourceDescriptor {
  provider: string;
  sharing?: ModelProviderSharing;
  inference?: ModelProviderInference;
}

export interface StaticCompatibilityResult {
  compatible: boolean;
  reasonCode?: string;
  reason?: string;
}

export type ExecutionModelPath = 'native-connection' | 'gateway' | 'gateway-lease' | 'account-identity';

/**
 * Pure static compatibility predicate between an executor and a model source.
 * Depends solely on declarative capabilities (never on live login status, expiry,
 * disabled flags, or identity generation).
 */
export function sourceCompatibility(
  executor: Pick<ExecutorDescriptor, 'id' | 'label' | 'modelPolicy'>,
  source: StaticSourceDescriptor,
): StaticCompatibilityResult {
  const sharing = source.sharing ?? { kind: 'gateway' as const };
  const inference = source.inference ?? 'gateway';
  const policy = executor.modelPolicy;
  const native = policy?.native;
  const isNativeSource = Boolean(native?.sourceProviders.includes(source.provider));

  if (sharing.kind === 'executor-exclusive' && !sharing.executors.includes(executor.id)) {
    return {
      compatible: false,
      reasonCode: 'agent_model_source_unsupported',
      reason: sharing.reason,
    };
  }

  if (isNativeSource) {
    if (native!.binding === 'gateway-lease' && inference === 'none') {
      return {
        compatible: false,
        reasonCode: 'model_source_inference_unavailable',
        reason: `${executor.label} 需要网关模型绑定，当前来源不提供网关推理。`,
      };
    }
    return { compatible: true };
  }

  if (native?.exclusive) {
    return {
      compatible: false,
      reasonCode: 'agent_model_source_unsupported',
      reason: native.exclusiveReason ?? `${executor.label} Agent 暂不支持选择其他供应商的模型，请改用 ${executor.label} 原生模型。`,
    };
  }

  if (inference === 'none') {
    return {
      compatible: false,
      reasonCode: 'model_source_inference_unavailable',
      reason: '此模型来源仅支持对应原生执行器直通，不提供网关推理。',
    };
  }

  if (policy && !policy.gateway) {
    return {
      compatible: false,
      reasonCode: 'agent_model_source_unsupported',
      reason: `${executor.label} 不支持通过模型网关接入此来源。`,
    };
  }

  return { compatible: true };
}

/**
 * Resolve the single deterministic execution model path before opening a runtime.
 */
export function resolveExecutionModelPath(
  executor: Pick<ExecutorDescriptor, 'id' | 'label' | 'modelPolicy'> | undefined,
  source: StaticSourceDescriptor | undefined,
): ExecutionModelPath {
  if (!source) return 'native-connection';
  const native = executor?.modelPolicy?.native;
  if (native && native.sourceProviders.includes(source.provider)) {
    return native.binding;
  }
  return 'gateway';
}

export function executorCompatibilityForSource(
  executors: ReadonlyArray<Pick<ExecutorDescriptor, 'id' | 'label' | 'modelPolicy'>>,
  source: StaticSourceDescriptor,
): ModelExecutorCompatibility[] {
  return executors.map(executor => {
    const result = sourceCompatibility(executor, source);
    return {
      connectionId: executor.id,
      compatible: result.compatible,
      ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    };
  });
}
