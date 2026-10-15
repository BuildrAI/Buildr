import { codexSessionHref } from '../agents/api/codex-desktop-api';
import type { AgentSessionRelation, AgentSessions, AgentSessionOpenResult } from '../agents/api/agent-sessions-api';

export const sessionRelationKey = (relation: Pick<AgentSessionRelation, 'provider' | 'id'>) => `${relation.provider}:${relation.id}`;
export const sessionProviderLabel = (provider: AgentSessionRelation['provider']) => provider === 'codex' ? 'Codex' : 'DSH';
export const agentSessionHref = (relation: AgentSessionRelation) => relation.provider === 'codex' ? codexSessionHref(relation.nativeSessionId) : null;

/** A failed provider retains only its previous rows; successful providers use the new observation. */
export function mergeAgentSessionObservation(previous: AgentSessionRelation[], result: AgentSessions, workspaceId: string, taskId: string): AgentSessionRelation[] {
  if (result.workspaceId !== workspaceId || !Array.isArray(result.relations) || !Array.isArray(result.diagnostics)
      || result.relations.some(item => !['codex', 'dsh'].includes(item.provider) || item.workspaceId !== workspaceId)
      || result.diagnostics.some(item => !['codex', 'dsh'].includes(item.provider) || typeof item.code !== 'string' || typeof item.message !== 'string')) throw new Error('会话关联响应与当前任务不匹配，未显示其他任务的数据。');
  const failed = new Set(result.diagnostics.map(item => item.provider));
  // Unlink returns the workspace aggregation. Select the panel's task before
  // combining it with provider-local retained rows.
  const observed = result.relations.filter(item => item.taskId === taskId && !failed.has(item.provider));
  const retained = previous.filter(item => failed.has(item.provider) && item.workspaceId === workspaceId && item.taskId === taskId);
  const merged = [...observed, ...retained];
  if (new Set(merged.map(sessionRelationKey)).size !== merged.length) throw new Error('会话关联响应包含重复身份，请刷新后重试。');
  return merged;
}

export function assertDshSessionOpened(result: AgentSessionOpenResult, relation: AgentSessionRelation): void {
  if (!result || relation.provider !== 'dsh' || result.provider !== 'dsh' || result.opened !== true || result.nativeSessionId !== relation.nativeSessionId) throw new Error('未能确认已打开所选 DSH 会话，请核对桌面后重试。');
}
