import type { AgentActionOption } from '../../components/AgentActionControl';
import type { AgentRun } from './api/agent-operations-api';

export type AgentExecutionConfig = NonNullable<AgentRun['executionConfig']>;
export function executionConfigSummary(config: AgentExecutionConfig | null): string {
  if (!config) return '';
  return [config.model && '模型：' + config.model, config.modelProvider && '提供方：' + config.modelProvider, config.reasoningEffort && '推理级别：' + config.reasoningEffort].filter(Boolean).join(' · ');
}

export type AgentDescriptor = {
  id: string;
  label: string;
  capabilities: string[];
  availability: 'available' | 'unavailable';
  runtimeStatus: 'stopped' | 'starting' | 'running' | 'idle' | 'stopping';
  safeReason: string | null;
};
export function agentOption(agent: AgentDescriptor): AgentActionOption {
  return {id: agent.id, label: agent.label, available: agent.availability === 'available' && agent.capabilities.includes('structured-generation')};
}
export function agentStatusLabel(agent: AgentDescriptor): string {
  if (agent.availability !== 'available') return agent.safeReason?.includes('登录') || agent.safeReason?.includes('授权') ? '需要授权' : '暂不可用';
  if (agent.runtimeStatus === 'starting') return '准备中';
  if (agent.runtimeStatus === 'stopping') return '正在关闭';
  return agent.runtimeStatus === 'running' || agent.runtimeStatus === 'idle' ? '运行中' : '按需启动';
}
export const agentRegistrationRequest = '请将当前智能体接入本机 Buildr，以便我在 Buildr 中调用你完成工作。';
