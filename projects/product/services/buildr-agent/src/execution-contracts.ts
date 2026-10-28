/** The three public boundaries are independent of a product's modules and transport. */
export const AGENT_EXECUTION_CONTRACTS = Object.freeze({
  operations: 'buildr.agent-operations/v1',
  host: 'buildr.agent-host/v1',
  lifecycle: 'buildr.agent-lifecycle/v1',
});

export interface ExecutionScopeRef { sourceId: string; id: string }
export interface WorkObjectRef { sourceId: string; scopeId: string; kind: string; id: string }
export interface ExecutionScope { ref: ExecutionScopeRef; revision: string; rootPath: string }
export interface WorkObjectObservation { ref: WorkObjectRef; revision: string }

/** Read-only host authority. Unreachable is an error, never an invalid object observation. */
export interface AgentHostCapabilities {
  resolveExecutionScope(input: { ref: ExecutionScopeRef; expectedRevision?: string }): Promise<ExecutionScope>;
  verifyWorkObject(input: { ref: WorkObjectRef; expectedRevision?: string }): Promise<WorkObjectObservation>;
  listExecutionScopes(input: { sourceId: string }): Promise<{ refs: ExecutionScopeRef[]; revision: string }>;
}

export interface AgentActivity { busy: boolean; reasons: Array<{ kind: string; count: number }> }
export interface AgentRuntimeUnit {
  schemaVersion: 1;
  digest: string;
  directory: string;
  entry: string;
  node: string;
  /** Equal values explicitly permit concurrent use of the private storage. */
  parallelCompatibility?: 1 | 2;
}
export interface AgentProcessIdentity {
  contracts: typeof AGENT_EXECUTION_CONTRACTS;
  instanceId: string;
  generation: string;
  profileId: string;
  dataRoot: string;
  pid: number;
  runtime: AgentRuntimeUnit;
  parallelCompatibility?: 1 | 2;
}
export interface AgentProcessStatus {
  identity: AgentProcessIdentity;
  activity: AgentActivity;
  accepting: boolean;
  pendingRuntime?: AgentRuntimeUnit;
  diagnostic?: string;
  retiring?: boolean;
  instances?: Array<{ generation: string; runtimeDigest: string; retiring: boolean }>;
}
export interface AgentLifecycleContract {
  identity(): Promise<AgentProcessIdentity>;
  status(): Promise<AgentProcessStatus>;
  requestRuntime(input: { expectedGeneration: string; runtime: AgentRuntimeUnit }): Promise<AgentProcessStatus>;
  shutdown(input: { expectedGeneration: string; mode: 'if-idle' | 'stop-owned' }): Promise<void>;
}

/** Opaque storage/query key; a host may preserve its existing local IDs during migration. */
export function executionScopeKey(ref: ExecutionScopeRef): string {
  if (!ref.sourceId || !ref.id) throw new Error('agent_scope_ref_invalid');
  return 'scope:' + Buffer.from(JSON.stringify([ref.sourceId, ref.id])).toString('base64url');
}
export function executionScopeRef(key: string, legacySourceId = 'local'): ExecutionScopeRef {
  if (!key.startsWith('scope:')) return { sourceId: legacySourceId, id: key };
  try {
    const value: unknown = JSON.parse(Buffer.from(key.slice(6), 'base64url').toString());
    if (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'string' && item.length > 0)) return { sourceId: value[0], id: value[1] };
  } catch { /* Invalid references never fall back to another source. */ }
  throw new Error('agent_scope_ref_invalid');
}
