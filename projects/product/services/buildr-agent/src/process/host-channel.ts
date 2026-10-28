import { randomUUID } from 'node:crypto';
import type { AgentHostCapabilities } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { authorize, body, json, listen, localOrigin, privateToken, request } from './transport.ts';

export interface HostPeer { sourceId: string; peerId: string; origin: string; token: string }
const methods = ['resolveExecutionScope','verifyWorkObject','listExecutionScopes'] as const;
type Method = typeof methods[number];
export async function exposeAgentHost(sourceId: string, host: AgentHostCapabilities): Promise<{ peer: HostPeer; close(): Promise<void> }> {
  const token = privateToken();
  const channel = await listen(async (req, res) => {
    authorize(req, token);
    if (req.method !== 'POST' || req.url !== '/host') throw new AgentServiceError('agent_host_operation_invalid', '宿主操作无效。');
    const input = await body(req, 1024 * 1024);
    if (!methods.includes(input.method) || !input.input || typeof input.input !== 'object' || (input.input.ref?.sourceId ?? input.input.sourceId) !== sourceId) throw new AgentServiceError('agent_host_source_mismatch', '宿主来源不匹配。', 409);
    const result = await host[input.method as Method](input.input);
    json(res, 200, result);
  });
  return { peer: { sourceId, peerId: randomUUID(), origin: channel.origin, token }, close: () => channel.close() };
}

/** Connections can disappear; stable authority source identities do not. */
export class AgentHostRegistry implements AgentHostCapabilities {
  private peers = new Map<string, HostPeer>();
  attach(value: HostPeer): void {
    if (!value || typeof value.sourceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value.sourceId) || typeof value.peerId !== 'string' || typeof value.token !== 'string' || value.token.length < 32) throw new AgentServiceError('agent_host_peer_invalid', '宿主连接身份无效。');
    localOrigin(value.origin); this.peers.set(value.peerId, structuredClone(value));
  }
  detach(peerId: string): void { this.peers.delete(peerId); }
  private async call(method: Method, sourceId: string, input: unknown): Promise<any> {
    const peers = [...this.peers.values()].filter(peer => peer.sourceId === sourceId).reverse();
    for (const peer of peers) {
      try { return await request(peer.origin, peer.token, '/host', { method, input }, AbortSignal.timeout(5000)); }
      catch (error) { if (error instanceof AgentServiceError) throw error; /* Try another connection of the same authority only. */ }
    }
    throw new AgentServiceError('agent_host_unavailable', '执行环境提供方暂时不可达；原执行和记录已保留。', 503);
  }
  resolveExecutionScope(input: Parameters<AgentHostCapabilities['resolveExecutionScope']>[0]) { return this.call('resolveExecutionScope', input.ref.sourceId, input); }
  verifyWorkObject(input: Parameters<AgentHostCapabilities['verifyWorkObject']>[0]) { return this.call('verifyWorkObject', input.ref.sourceId, input); }
  listExecutionScopes(input: Parameters<AgentHostCapabilities['listExecutionScopes']>[0]) { return this.call('listExecutionScopes', input.sourceId, input); }
}
