import { randomUUID } from 'node:crypto';
import { HARNESS_EXECUTION_CONTRACTS, executionScopeRef } from '../execution-contracts.ts';
import type { HarnessCaller, HarnessCallerSession } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import type { ProcessRecord } from './ownership.ts';
import { request } from './transport.ts';

/** Private IPC identities, never browser sessions or programmatic credentials. */
export class HarnessCallerClient {
  private readonly caller?: HarnessCaller;
  private readonly sessions = new Map<string, {record: ProcessRecord; value: Promise<HarnessCallerSession>}>();
  constructor(caller?: HarnessCaller) { this.caller = caller; }
  private supports(record: ProcessRecord): boolean {
    return !!this.caller && record.identity.supportedContracts?.operations?.includes(HARNESS_EXECUTION_CONTRACTS.operations) === true &&
      record.identity.supportedContracts?.host?.includes(HARNESS_EXECUTION_CONTRACTS.host) === true;
  }
  private session(record: ProcessRecord): Promise<HarnessCallerSession> {
    const prior = this.sessions.get(record.identity.instanceId);
    if (prior) return prior.value;
    // The id is fixed for this negotiation. A lost negotiation response does
    // not authorize replaying any later operation.
    const clientRequestId = randomUUID();
    const value = request(record.origin, record.token, '/caller/negotiate', {
      clientRequestId, contracts: HARNESS_EXECUTION_CONTRACTS, caller: this.caller,
    }, AbortSignal.timeout(5000)).then((value: HarnessCallerSession) => {
      if (Object.entries(HARNESS_EXECUTION_CONTRACTS).some(([key, expected]) => value.contract?.[key as keyof typeof HARNESS_EXECUTION_CONTRACTS] !== expected) ||
        value.generation !== record.identity.generation || typeof value.token !== 'string' || value.token.length < 32 ||
        typeof value.id !== 'string' || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
        throw new AgentServiceError('agent_caller_identity_mismatch', '调用身份协商结果与准确后台不符。', 409);
      }
      return value;
    });
    this.sessions.set(record.identity.instanceId, {record, value});
    void value.catch(() => {
      if (this.sessions.get(record.identity.instanceId)?.value === value) this.sessions.delete(record.identity.instanceId);
    });
    return value;
  }
  async endpoint(record: ProcessRecord, route: string, input?: any): Promise<{route: string; token: string; input: any}> {
    const eligible = ['/operations', '/events', '/directories', '/host/attach', '/host/detach', '/scope-catalog', '/source-policy', '/web', '/generate', '/cancel-generation'];
    if (!eligible.includes(route)) return {route, token: record.token, input};
    if (!this.supports(record)) {
      if (['/scope-catalog', '/source-policy', '/web'].includes(route)) throw new AgentServiceError('agent_capability_unavailable', '现有后台未提供多来源发现；未另起后台或扩大权限。', 409);
      return {route, token: record.token, input};
    }
    const session = await this.session(record);
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(record.identity.instanceId);
      // No operation has been dispatched; only the identity may be renewed.
      return this.endpoint(record, route, input);
    }
    const payload = {...input};
    delete payload.sourceId;
    if (route === '/operations') {
      payload.contract = HARNESS_EXECUTION_CONTRACTS.operations;
      if (payload.operation.startsWith('conversations.') && typeof payload.args[0] === 'string') {
        payload.targetScope = executionScopeRef(payload.args[0], 'buildr');
      }
    } else if (route === '/events') payload.targetScope = executionScopeRef(payload.scope, 'buildr');
    return {route: '/v2' + route, token: session.token, input: payload};
  }
  async close(): Promise<void> {
    const sessions = [...this.sessions.values()]; this.sessions.clear();
    await Promise.all(sessions.map(async ({record, value}) => {
      try {
        const session = await value;
        await request(record.origin, session.token, '/v2/caller-close', {}, AbortSignal.timeout(1000));
      } catch { /* Disconnect revokes reachable leases; crashed generations retain no memory. */ }
    }));
  }
}
