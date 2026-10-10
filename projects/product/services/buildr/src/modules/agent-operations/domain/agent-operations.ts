export type AgentRunStatus = 'queued' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type AgentRuntimeStatus = 'stopped' | 'starting' | 'running' | 'idle' | 'stopping';
export const AGENT_EXECUTION_CONFIG_VALUE_LIMIT = 256;
/** Selected session configuration, not per-turn execution telemetry. */
export type AgentExecutionConfig = { model: string | null; modelProvider: string | null; reasoningEffort: string | null };
export function readAgentExecutionConfig(value: unknown): AgentExecutionConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const field = (entry: unknown): string | null => typeof entry === 'string' && entry.trim().length > 0 && entry.length <= AGENT_EXECUTION_CONFIG_VALUE_LIMIT && !/[\u0000-\u001f\u007f]/.test(entry) ? entry : null;
  return { model: field(source.model), modelProvider: field(source.modelProvider), reasoningEffort: field(source.reasoningEffort) };
}
export type AgentRunView = {
  id: string;
  agentId: string;
  registrationRevision: string;
  executionConfig: AgentExecutionConfig | null;
  status: AgentRunStatus;
  output: unknown | null;
  error: { code: string; message: string } | null;
};
export type AgentRegistryView = {
  revision: string;
  defaultAgentId: string | null;
  agents: {
    id: string;
    kind: AgentRegistration['kind'];
    label: string;
    capabilities: string[];
    availability: 'available' | 'unavailable';
    runtimeStatus: AgentRuntimeStatus;
    lastExecutionConfig: AgentExecutionConfig | null;
    safeReason: string | null;
  }[];
};
type AgentRegistrationBase = {
  id: string;
  label: string;
  executable: string;
  version: string;
};
export type CodexAgentRegistration = AgentRegistrationBase & { kind: 'codex'; codexHome: string };
export type DshAgentRegistration = AgentRegistrationBase & { kind: 'dsh'; dshHome: string };
export type AgentRegistration = CodexAgentRegistration | DshAgentRegistration;
export type AgentGenerationEnvironment = { kind: 'workspace-read-only'; readableRoots: string[] };
export type AgentGenerationExecution = { reasoningEffort?: 'low'; timeoutMs?: number };
export type AgentGenerationInput = {
  agentId?: string;
  cwd: string;
  prompt: string;
  outputSchema: unknown;
  environment?: AgentGenerationEnvironment;
  execution?: AgentGenerationExecution;
  validateResult?: (output: unknown) => void | Promise<void>;
};
export type AgentProviderGenerationInput = {
  cwd: string;
  prompt: string;
  outputSchema: unknown;
  environment?: AgentGenerationEnvironment;
  execution?: AgentGenerationExecution;
  signal: AbortSignal;
  onConfigured(config: AgentExecutionConfig): void;
  onRunning(): void;
};
export interface AgentExecutionProvider {
  readonly alive: boolean;
  start(): Promise<void>;
  generate(input: AgentProviderGenerationInput): Promise<unknown>;
  close(): Promise<void>;
}
export function agentFailure(code: string, message: string, status = 400): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}
