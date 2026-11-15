import type { IncomingMessage } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { HARNESS_EXECUTION_CONTRACTS, executionScopeRef } from '../execution-contracts.ts';
import type { ExecutionScopeRef, HarnessCaller, HarnessCallerSession } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { authorize, privateToken } from './transport.ts';

interface Grant { caller: HarnessCaller; authoritySources: string[]; session: HarnessCallerSession; fingerprint: string }
const sourcePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const sourceMismatch = () => new AgentServiceError('agent_caller_scope_denied', '调用身份未获目标来源权限，未读取或改变原工作。', 403);
const firstParty = (grant: Grant) => grant.caller.kind === 'first-party-user';

/** Only the private, authenticated process owner can issue a caller session.
 * Browser/programmatic credentials never authenticate this issuer endpoint.
 * Following requests use the issued token, not a caller/source assertion. */
export class HarnessCallerSessions {
  private readonly grants = new Map<string, Grant>();
  private readonly generation: string;
  private readonly now: () => number;
  constructor(generation: string, now = Date.now) { this.generation = generation; this.now = now; }
  issue(input: {clientRequestId: string; contracts: unknown; caller: unknown}): HarnessCallerSession {
    if (!input || typeof input.clientRequestId !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(input.clientRequestId) ||
        !input.contracts || Object.entries(HARNESS_EXECUTION_CONTRACTS).some(([name, value]) => (input.contracts as Record<string, unknown>)[name] !== value)) {
      throw new AgentServiceError('agent_caller_contract_unsupported', '此调用身份未协商受支持的操作与宿主契约。', 409);
    }
    const caller = input.caller as HarnessCaller;
    if (!caller || typeof caller !== 'object' ||
      (caller.kind === 'first-party-user'
        ? !['buildr-harness', 'buildr-development'].includes(caller.product) || Object.keys(caller).sort().join() !== 'kind,product'
        : caller.kind !== 'host' || typeof caller.sourceId !== 'string' || !sourcePattern.test(caller.sourceId) || Object.keys(caller).sort().join() !== 'kind,sourceId')) {
      throw new AgentServiceError('agent_caller_invalid', '本机调用主体无效，未建立权限。', 400);
    }
    for (const [id, grant] of this.grants) if (grant.session.expiresAt <= this.now()) this.grants.delete(id);
    const fingerprint = createHash('sha256').update(JSON.stringify([input.contracts, caller])).digest('hex');
    const prior = this.grants.get(input.clientRequestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AgentServiceError('agent_caller_request_conflict', '调用身份协商编号已用于其他主体。', 409);
      return structuredClone(prior.session);
    }
    if (this.grants.size >= 1024) throw new AgentServiceError('agent_caller_busy', '本机调用连接较多，请释放不用的入口。', 503);
    const authoritySources = caller.kind === 'host' ? [caller.sourceId] : caller.product === 'buildr-development' ? ['buildr'] : [];
    const session: HarnessCallerSession = {contract: HARNESS_EXECUTION_CONTRACTS, id: randomUUID(), token: privateToken(),
      generation: this.generation, expiresAt: this.now() + 8 * 60 * 60_000};
    this.grants.set(input.clientRequestId, {caller: structuredClone(caller), authoritySources, session, fingerprint});
    return structuredClone(session);
  }
  authenticate(req: IncomingMessage): Grant {
    for (const grant of this.grants.values()) {
      if (grant.session.expiresAt <= this.now()) continue;
      try { authorize(req, grant.session.token); return grant; }
      catch (error) { if (!(error instanceof AgentServiceError) || error.code !== 'agent_process_unauthorized') throw error; }
    }
    throw new AgentServiceError('agent_caller_unauthorized', '调用连接身份无效或已到期，原请求未执行。', 401);
  }
  close(grant: Grant): void {
    for (const [id, value] of this.grants) if (value === grant) this.grants.delete(id);
  }
  isFirstParty(grant: Grant): boolean { return firstParty(grant); }
  canRead(grant: Grant, key: string): boolean {
    return firstParty(grant) || executionScopeRef(key, 'buildr').sourceId === (grant.caller as {sourceId: string}).sourceId;
  }
  scope(grant: Grant, key: unknown, expected?: ExecutionScopeRef): ExecutionScopeRef {
    if (typeof key !== 'string' || !key) throw sourceMismatch();
    const ref = executionScopeRef(key, 'buildr');
    if (!this.canRead(grant, key) || expected && (ref.id !== expected.id || ref.sourceId !== expected.sourceId)) throw sourceMismatch();
    return ref;
  }
  authority(grant: Grant, sourceId: unknown): void {
    if (typeof sourceId !== 'string' || !grant.authoritySources.includes(sourceId)) throw sourceMismatch();
  }
  directory(grant: Grant, write: boolean): void {
    if (!firstParty(grant) && (write || (grant.caller as {sourceId: string}).sourceId !== 'harness-local')) throw sourceMismatch();
  }
  policy(grant: Grant, sourceId: unknown, write: boolean): void {
    if (typeof sourceId !== 'string' || !sourcePattern.test(sourceId)) throw sourceMismatch();
    if (write) {
      if (sourceId === 'harness-local' && firstParty(grant)) return;
      this.authority(grant, sourceId);
    } else if (!firstParty(grant) && !grant.authoritySources.includes(sourceId)) throw sourceMismatch();
  }
  operation(grant: Grant, input: {operation: string; args: unknown[]; targetScope?: ExecutionScopeRef}): void {
    const {operation, args, targetScope} = input;
    if (!firstParty(grant)) {
      const value = args.at(-1) as {workObjectLinks?: Array<{sourceId?:string}>;taskLinks?:Array<{workspaceId:string}>} | undefined;
      if (value && typeof value === 'object') {
        if (Array.isArray(value.workObjectLinks) && value.workObjectLinks.some(link=>!link || link.sourceId !== (grant.caller as {sourceId:string}).sourceId)) throw sourceMismatch();
        if (Array.isArray(value.taskLinks)) for (const link of value.taskLinks) this.scope(grant, link?.workspaceId);
      }
    }
    if (!firstParty(grant) && (!operation.startsWith('conversations.') ||
      ['conversations.modelAccountReferences', 'conversations.generateTitle'].includes(operation))) throw sourceMismatch();
    if (operation === 'conversations.listAll' || operation === 'conversations.activityEpoch') {
      if (targetScope || !Array.isArray(args[0])) throw sourceMismatch();
      for (const key of args[0]) this.scope(grant, key);
    } else if (operation.startsWith('conversations.') && !['conversations.pending', 'conversations.pendingSummary', 'conversations.modelAccountReferences'].includes(operation)) {
      if (!targetScope) throw sourceMismatch();
      this.scope(grant, args[0], targetScope);
    } else if (targetScope) throw sourceMismatch();
  }
}
