import { executionScopeRef } from '../execution-contracts.ts';
import type { SourceContinuationPolicy } from '../execution-contracts.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import path from 'node:path';

/** Policies belong to the authority source, not the last attached product. */
export class SourceContinuationPolicies {
  private readonly repository: ConversationRepository;
  private readonly legacySource: string;
  private readonly legacyDefault: () => boolean;
  constructor(dataRoot: string, legacySource: string, legacyDefault: () => boolean) {
    this.repository = new ConversationRepository(path.join(dataRoot, 'agent-service'));
    this.legacySource = legacySource;
    this.legacyDefault = legacyDefault;
  }
  read(sourceId: string): SourceContinuationPolicy {
    if (typeof sourceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(sourceId)) throw new AgentServiceError('agent_source_policy_invalid', '恢复策略来源无效。');
    return this.repository.readContinuationPolicy(sourceId) ?? {
      sourceId, revision: 'absent', autoContinueInterrupted: sourceId === this.legacySource && this.legacyDefault(),
    };
  }
  configure(sourceId: string, input: {expectedRevision: string; autoContinueInterrupted: boolean}): SourceContinuationPolicy {
    this.read(sourceId);
    return this.repository.saveContinuationPolicy(sourceId, input);
  }
  enabled(scope: string): boolean { return this.read(executionScopeRef(scope, this.legacySource).sourceId).autoContinueInterrupted; }
}
