import type { AgentRegistry } from './api/agent-operations-api';
import { codexConnectionStatus, type CodexConnection } from './api/codex-desktop-api';
import { agentStatusLabel } from './agent-model';

export type CodexConnectionsState = {connections: CodexConnection[] | null; loading: boolean; error: string};
export type ConnectionTone = 'neutral' | 'success' | 'warning';

export function codexDesktopState(state: CodexConnectionsState, agentId: string): {label: string; tone: ConnectionTone; connection: CodexConnection | null} {
  const connection = state.connections?.find(item => item.agentId === agentId) || null;
  if (state.loading) return {label: '正在读取桌面状态…', tone: 'neutral', connection};
  if (state.error || !state.connections) return {label: '桌面状态未能确认', tone: 'warning', connection: null};
  if (!connection) return {label: '桌面未连接', tone: 'warning', connection: null};
  return {label: codexConnectionStatus(connection), tone: connection.status === 'ready' ? 'success' : connection.status === 'unavailable' || connection.status === 'disconnected' ? 'warning' : 'neutral', connection};
}

export function agentGenerationState(agent: AgentRegistry['agents'][number]): {label: string; tone: ConnectionTone} {
  if (agent.kind === 'codex' && agent.safeReason) return {label: '生成需检查', tone: 'warning'};
  return {label: '生成：' + agentStatusLabel(agent), tone: agent.availability === 'available' ? 'neutral' : 'warning'};
}
