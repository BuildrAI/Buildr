import { DIRECTORY_SOURCE_ID } from '../application/directory-host.ts';
import { BUILDR_SOURCE_ID, type LocalWorkspaceAuthority } from '../application/local-workspaces.ts';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { AgentHostCapabilities, ExecutionScopeRef } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { authorize, body, json, listen, localOrigin, privateToken, request } from './transport.ts';

export interface HostPeer { sourceId: string; peerId: string; origin: string; token: string }
const methods = ['resolveExecutionScope','verifyWorkObject','listExecutionScopes','observeParticipation'] as const;
type Method = typeof methods[number];
export async function exposeAgentHost(sourceId: string, host: AgentHostCapabilities): Promise<{ peer: HostPeer; close(): Promise<void> }> {
  const token = privateToken();
  const channel = await listen(async (req, res) => {
    authorize(req, token);
    if (req.method !== 'POST' || req.url !== '/host') throw new AgentServiceError('agent_host_operation_invalid', '宿主操作无效。');
    const input = await body(req, 1024 * 1024);
    if (!methods.includes(input.method) || !input.input || typeof input.input !== 'object' || (input.input.ref?.sourceId ?? input.input.sourceId) !== sourceId) throw new AgentServiceError('agent_host_source_mismatch', '宿主来源不匹配。', 409);
    const method = host[input.method as Method];
    if (!method) throw new AgentServiceError('agent_host_capability_unavailable','宿主未提供参与来源观察。',503);
    const result = await (method as (input: unknown) => Promise<unknown>).call(host,input.input);
    json(res, 200, result);
  });
  return { peer: { sourceId, peerId: randomUUID(), origin: channel.origin, token }, close: () => channel.close() };
}

/** Connections can disappear; stable authority source identities do not. */
export class AgentHostRegistry implements AgentHostCapabilities {
  private peers = new Map<string, HostPeer>();
  private readonly directoryHost?: AgentHostCapabilities;
  private readonly defaultWorkspaceRoot?: () => string;
  private readonly localWorkspaces?: LocalWorkspaceAuthority;
  constructor(directoryHost?: AgentHostCapabilities, fallback?: (() => string) | LocalWorkspaceAuthority) {
    this.directoryHost = directoryHost;
    if (typeof fallback === 'function') this.defaultWorkspaceRoot = fallback;
    else this.localWorkspaces = fallback;
  }
  validatePeer(value: HostPeer): void {
    if (!value || typeof value.sourceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value.sourceId) || typeof value.peerId !== 'string' || typeof value.token !== 'string' || value.token.length < 32) throw new AgentServiceError('agent_host_peer_invalid', '宿主连接身份无效。');
    if (this.directoryHost && value.sourceId === DIRECTORY_SOURCE_ID) throw new AgentServiceError('agent_host_source_reserved', '内置目录来源不能由外部回调接管。', 409);
    localOrigin(value.origin);
  }
  attach(value: HostPeer): boolean {
    this.validatePeer(value);
    // A refreshed live callback takes precedence over callbacks from old hosts.
    const previous = this.peers.get(value.peerId);
    this.peers.delete(value.peerId);
    this.peers.set(value.peerId, structuredClone(value));
    return !previous || previous.sourceId !== value.sourceId || previous.origin !== value.origin || previous.token !== value.token;
  }
  sourceOf(peerId: string): string | undefined { return this.peers.get(peerId)?.sourceId; }
  sources(): string[] { return [...new Set([...this.peers.values()].map(peer => peer.sourceId))]; }
  detach(peerId: string): void { this.peers.delete(peerId); }
  private async call(method: Method, sourceId: string, input: unknown): Promise<any> {
    if (this.directoryHost && sourceId === DIRECTORY_SOURCE_ID) {
      const operation = this.directoryHost[method];
      if (!operation) throw new AgentServiceError('agent_host_capability_unavailable', '目录宿主未提供此可选能力。', 409);
      return (operation as (input: unknown) => Promise<unknown>).call(this.directoryHost, input);
    }
    const peers = [...this.peers.values()].filter(peer => peer.sourceId === sourceId).reverse();
    let transportFailure: string | undefined;
    for (const peer of peers) {
      try { return await request(peer.origin, peer.token, '/host', { method, input }, AbortSignal.timeout(5000)); }
      catch (error) {
        if (error instanceof AgentServiceError) throw error;
        const failure = error as {name?:string;cause?:{code?:string}};
        const code = failure.cause?.code ?? failure.name;
        transportFailure = typeof code === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(code) ? code : 'transport_error';
        // Try another connection of the same authority only. Never expose URLs,
        // credentials or arbitrary response bodies in the failure diagnostic.
      }
    }
    if (method === 'resolveExecutionScope' && sourceId === BUILDR_SOURCE_ID) {
      const scopeInput = input as { ref?: ExecutionScopeRef; expectedRevision?: string };
      if (this.localWorkspaces && scopeInput?.ref) {
        const resolved = this.localWorkspaces.resolveExecutionScope({ ref: scopeInput.ref, expectedRevision: scopeInput.expectedRevision });
        if (resolved) return resolved;
      } else if (this.defaultWorkspaceRoot && scopeInput?.ref?.id === '@default') {
        const rawRoot = this.defaultWorkspaceRoot();
        fs.mkdirSync(rawRoot, { recursive: true });
        const rootPath = fs.realpathSync(rawRoot), info = fs.statSync(rootPath);
        const revision = createHash('sha256').update(JSON.stringify([scopeInput.ref, rootPath, info.ino, info.birthtimeMs])).digest('hex');
        if (scopeInput.expectedRevision && revision !== scopeInput.expectedRevision) throw new AgentServiceError('agent_scope_binding_changed', '执行环境已变化。', 409);
        return { ref: scopeInput.ref, rootPath, revision };
      }
    }
    throw new AgentServiceError('agent_host_unavailable', `执行环境提供方暂时不可达（${method}；${peers.length ? transportFailure : 'no_registered_peer'}）；原执行和记录已保留。`, 503);
  }
  observeParticipation(input: import('../participation-contracts.ts').ParticipationSourceRequest): Promise<import('../participation-contracts.ts').ParticipationSourceResult> { return this.call('observeParticipation',input.ref.sourceId,input); }
  resolveExecutionScope(input: Parameters<AgentHostCapabilities['resolveExecutionScope']>[0]) { return this.call('resolveExecutionScope', input.ref.sourceId, input); }
  verifyWorkObject(input: Parameters<NonNullable<AgentHostCapabilities['verifyWorkObject']>>[0]) { return this.call('verifyWorkObject', input.ref.sourceId, input); }
  listExecutionScopes(input: Parameters<AgentHostCapabilities['listExecutionScopes']>[0]) { return this.call('listExecutionScopes', input.sourceId, input); }
}
