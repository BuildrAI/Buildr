import { createHash } from 'node:crypto';
import { AgentServiceError } from '../../domain/agent-state.ts';
import { gatewayModel, type ExecutorGateway } from '../model-gateway.ts';

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
  return {
    providers: {
      [qoderProviderId(gateway)]: {
        type: 'openai-compatible',
        protocol: 'openai',
        authType: 'bearer',
        baseUrl: gateway.baseUrl,
        apiKey: '${BUILDR_MODEL_GATEWAY_KEY}',
        displayName: 'Buildr',
        model: model.id,
        models: [{
          model: model.id,
          displayName: model.label,
          ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
          ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
          capabilities: {
            ...(typeof model.tools === 'boolean' ? { tools: model.tools } : {}),
            ...(typeof model.vision === 'boolean' ? { vision: model.vision } : {}),
            ...(efforts?.length ? { thinking: { modes: ['enabled'], preferredMode: 'enabled', supportsEffort: true, supportedEffortLevels: efforts } } : {}),
          },
        }],
      },
    },
  };
}

/** Called for every Qoder purpose; a qualified string selects its registered direct route. */
export function qoderGatewayPolicy(gateway: ExecutorGateway, selected?: string, effort?: string) {
  const model = gatewayModel(gateway, selected);
  const reasoningEffort = effort ?? model.defaultReasoningEffort;
  if (
    reasoningEffort && (!qoderReasoningEfforts.has(reasoningEffort) || !model.reasoningEfforts?.some(option => option.id === reasoningEffort)) ||
    !reasoningEffort && model.reasoningEfforts?.length && !model.reasoningEfforts.some(option => qoderReasoningEfforts.has(option.id))
  ) {
    throw new AgentServiceError('agent_reasoning_unavailable', 'Qoder 暂不支持所选推理强度，请选择其他已支持档位。');
  }
  return {
    model: qoderGatewayModelId(gateway),
    parameters: {
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    },
  };
}
