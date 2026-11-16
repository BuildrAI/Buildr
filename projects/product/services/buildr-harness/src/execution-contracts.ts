/** The three public boundaries are independent of a product's modules and transport. */
export const AGENT_EXECUTION_CONTRACTS = Object.freeze({
  operations: 'buildr.agent-operations/v1',
  host: 'buildr.agent-host/v1',
  lifecycle: 'buildr.agent-lifecycle/v1',
});

/** Keep the v1 discovery projection truthful; new semantics are opt-in. */
export const HARNESS_EXECUTION_CONTRACTS = Object.freeze({
  operations: 'buildr.agent-operations/v2',
  host: 'buildr.agent-host/v2',
  lifecycle: AGENT_EXECUTION_CONTRACTS.lifecycle,
});
export type HarnessCaller =
  | { kind: 'first-party-user'; product: 'buildr-harness' | 'buildr-development' }
  | { kind: 'host'; sourceId: string };
export interface HarnessCallerSession {
  contract: typeof HARNESS_EXECUTION_CONTRACTS;
  id: string;
  token: string;
  generation: string;
  expiresAt: number;
}

export interface ExecutionScopeRef { sourceId: string; id: string }
export interface WorkObjectRef { sourceId: string; scopeId: string; kind: string; id: string }
export interface ExecutionScope { ref: ExecutionScopeRef; revision: string; rootPath: string }
export interface SourceContinuationPolicy { sourceId: string; revision: string; autoContinueInterrupted: boolean }
export interface WorkObjectObservation { ref: WorkObjectRef; revision: string }

/** Read-only host authority. Unreachable is an error, never an invalid object observation. */
export interface AgentHostCapabilities {
  resolveExecutionScope(input: { ref: ExecutionScopeRef; expectedRevision?: string }): Promise<ExecutionScope>;
  verifyWorkObject?(input: { ref: WorkObjectRef; expectedRevision?: string }): Promise<WorkObjectObservation>;
  observeParticipation?(input: import('./participation-contracts.ts').ParticipationSourceRequest): Promise<import('./participation-contracts.ts').ParticipationSourceResult>;
  listExecutionScopes(input: { sourceId: string }): Promise<{ refs: ExecutionScopeRef[]; revision: string; labels?: Record<string, string>; rootPaths?: Record<string, string> }>;
}

export interface AgentActivity { busy: boolean; reasons: Array<{ kind: string; count: number }> }
export interface AgentRuntimeUnit {
  schemaVersion: 1;
  digest: string;
  directory: string;
  entry: string;
  node: string;
  /** Equal values explicitly permit concurrent use of the private storage. */
  parallelCompatibility?: 1 | 2 | 3 | 4;
}
export interface AgentProcessIdentity {
  contracts: typeof AGENT_EXECUTION_CONTRACTS;
  /** Additive discovery; v1 identities without this field remain valid. */
  capabilities?: { directoryHost?: 1; harnessWeb?: 1 };
  supportedContracts?: { operations: string[]; host: string[]; lifecycle: string[] };
  instanceId: string;
  generation: string;
  profileId: string;
  dataRoot: string;
  pid: number;
  runtime: AgentRuntimeUnit;
  parallelCompatibility?: 1 | 2 | 3 | 4;
}
export interface AgentProcessStatus {
  identity: AgentProcessIdentity;
  activity: AgentActivity;
  accepting: boolean;
  pendingRuntime?: AgentRuntimeUnit;
  pendingReason?: 'program-upgrade';
  diagnostic?: string;
  retiring?: boolean;
  instances?: Array<{ generation: string; runtimeDigest: string; retiring: boolean }>;
}
export interface AgentLifecycleContract {
  identity(): Promise<AgentProcessIdentity>;
  status(): Promise<AgentProcessStatus>;
  requestRuntime(input: { expectedGeneration: string; runtime: AgentRuntimeUnit }): Promise<AgentProcessStatus>;
  /** Register the target and resolve only after its exact server accepts work. */
  activateRuntime(input: { expectedGeneration: string; runtime: AgentRuntimeUnit; timeoutMs?: number }): Promise<AgentProcessStatus>;
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
