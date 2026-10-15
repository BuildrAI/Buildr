import type { AgentRegistry } from './api/agent-operations-api';
import { codexConnectionStatus, type CodexConnection } from './api/codex-desktop-api';
import { agentStatusLabel } from './agent-model';

export type CodexConnectionsState = {connections: CodexConnection[] | null; loading: boolean; error: string};
export type DesktopConnectionsState = CodexConnectionsState;
export type ConnectionTone = 'neutral' | 'success' | 'warning';

export function codexDesktopState(state: CodexConnectionsState, agentId: string): {label: string; tone: ConnectionTone; connection: CodexConnection | null} {
  const connection = state.connections?.find(item => item.agentId === agentId) || null;
  if (state.error) return {label: '未能确认', tone: 'warning', connection: null};
  if (!state.connections) return {label: state.loading ? '正在读取…' : '未能确认', tone: state.loading ? 'neutral' : 'warning', connection: null};
  if (!connection) return {label: '未配置', tone: 'warning', connection: null};
  return {label: codexConnectionStatus(connection), tone: connection.status === 'configured' ? 'success' : connection.status === 'unavailable' || connection.status === 'disconnected' ? 'warning' : 'neutral', connection};
}
export const desktopConnectionState = codexDesktopState;

export function agentGenerationState(agent: AgentRegistry['agents'][number]): {label: string; tone: ConnectionTone} {
  if (agent.safeReason) return {label: '生成需检查', tone: 'warning'};
  return {label: '生成：' + agentStatusLabel(agent), tone: agent.availability === 'available' ? 'neutral' : 'warning'};
}
