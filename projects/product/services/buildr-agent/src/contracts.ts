import type { ModelProvider } from './model-access/contracts.ts';
/** Public executor protocol. Vendor credentials and opaque state never become UI state. */
export type ProviderId = string;
export type PermissionMode = 'default' | 'full-access';
export type ContextRef = { id: string; data?: Record<string, unknown> };
export type ExecutionRef = { id: string; data?: Record<string, unknown> };

export interface AgentCapabilities {
  text: boolean;
  images: boolean;
  approval: boolean;
  questions: boolean;
  stop: boolean;
  resume: boolean;
  maxInputBytes: number;
  maxImageBytes?: number;
  permissionModes?: PermissionMode[];
}
export interface AgentModel {
  id: string; label: string; isDefault?: boolean;
  reasoningEfforts?: Array<{ id: string; label: string }>;
  defaultReasoningEffort?: string;
}
export interface AccountObservation {
  status: 'not-authenticated' | 'ready' | 'expired' | 'failed';
  label?: string;
  loginMethod?: string;
  diagnostic?: string;
}
export interface ExecutorDescriptor { id: ProviderId; label: string; capabilities: AgentCapabilities }
export interface ExecutorBinding {
  identity: string;
  /** Opaque executor-owned provenance, persisted without vendor credentials. */
  data?: Record<string, unknown>;
  /** Existing source locations allow an executor to adopt pre-provenance records. */
  executable?: string;
  configRoot?: string;
}
export interface ModelGatewayConfiguration {
  identity: string; baseUrl: string; apiKey: string;
  models: Array<AgentModel & { contextWindow?: number; maxOutputTokens?: number; vision?: boolean; tools?: boolean }>;
}
export interface ExecutorOpenOptions {
  gateway?: ModelGatewayConfiguration;
  nativeAccountConfigRoot?: string;
  connectionId: string;
  configRoot: string;
  executable?: string;
  environment: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  binding?: ExecutorBinding;
}
export interface LoginObservation {
  state: 'initializing' | 'waiting-browser' | 'checking' | 'completed' | 'cancelled' | 'expired' | 'failed';
  url?: string;
  diagnostic?: string;
}
export interface ExecutorImage { id: string; path: string; mimeType: string }
export interface ExecutorItem {
  id: string;
  kind: 'message' | 'tool' | 'notice';
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** Stable tool-step name when the source provides one (e.g. command, file-change, read). */
  name?: string;
  /** Original tool invocation input; retained when a later result replaces text. */
  input?: string;
  executionId?: string;
  status?: 'running' | 'completed' | 'failed';
}
export interface ExecutorRequest {
  id: string;
  kind: 'approval' | 'question';
  title: string;
  description?: string;
  options?: Array<{ id: string; label: string }>;
  questions?: Array<{ id: string; label: string; options?: Array<{ id: string; label: string }>; multiple?: boolean }>;
}
export interface ExecutorObservation {
  status: 'idle' | 'running' | 'waiting' | 'stopped' | 'tools-active' | 'unknown';
  executionRef?: ExecutionRef;
  tools: Array<{ id: string; label: string; status: 'running' | 'completed' | 'unknown'; canStop?: boolean }>;
  requests?: ExecutorRequest[];
  diagnostic?: string;
}
export type ExecutorEvent =
  | { type: 'context-usage'; usedTokens:number; windowTokens?:number }
  | { type: 'models'; models: AgentModel[] }
  | { type: 'title'; title: string }
  | { type: 'accepted'; executionRef: ExecutionRef; inputItemId?: string }
  | { type: 'item'; item: ExecutorItem }
  | { type: 'request'; request: ExecutorRequest }
  | { type: 'request-resolved'; requestId: string }
  | { type: 'observation'; observation: ExecutorObservation }
  | { type: 'completed'; status: 'completed' | 'stopped' | 'failed'; diagnostic?: string }
  | { type: 'diagnostic'; message: string };
export interface ExecutorTitleInput { contextRef: ContextRef; cwd: string; description: string; model?: string; signal: AbortSignal }
export interface ExecutorSendInput {
  contextRef: ContextRef;
  cwd: string;
  text: string;
  images: ExecutorImage[];
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  permissionMode?: PermissionMode;
  clientRequestId: string;
  onEvent(event: ExecutorEvent): void;
}
export interface AgentRuntime {
  /** Stable for compatible program updates at the verified source and config. */
  bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  capabilities: AgentCapabilities;
  inspectAccount(): Promise<AccountObservation>;
  models(): Promise<AgentModel[]>;
  /** Private fixed-upstream model bridge; never exposed over host HTTP. */
  requestModel?(path: string, init?: RequestInit, expectedIdentity?: string): Promise<Response>;
  modelIdentity?(): Promise<string>;
  beginLogin(onUpdate: (observation: LoginObservation) => void): Promise<void>;
  cancelLogin(): Promise<void>;
  createContext(input: { cwd: string; permissionMode?: PermissionMode }): Promise<ContextRef>;
  resumeContext(input: { contextRef: ContextRef; cwd: string; permissionMode?: PermissionMode }): Promise<void>;
  readHistory(input: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]>;
  /** Resolves at terminal observation. Control requests must stay independent. */
  send(input: ExecutorSendInput): Promise<void>;
  observe(input: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation>;
  reply(input: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void>;
  stop(input: { contextRef: ContextRef; executionRef: ExecutionRef; toolId?: string }): Promise<ExecutorObservation>;
  /** Native generated/name metadata only; never a first-prompt preview or fallback. */
  readTitle?(input: { contextRef: ContextRef; cwd: string }): Promise<string | undefined>;
  /** Independent, bounded auxiliary inference; it must not add input to the work context. */
  generateTitle?(input: ExecutorTitleInput): Promise<string | undefined>;
  summarizeHandoff?(input: ExecutorTitleInput): Promise<string | undefined>;
  close(): Promise<void>;
}
export interface AgentExecutor {
  descriptor: ExecutorDescriptor;
  open(options: ExecutorOpenOptions): Promise<AgentRuntime>;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'not-authenticated' | 'ready' | 'expired' | 'failed';
export interface LoginAttemptView extends LoginObservation { id: string; generation: string; updatedAt: string }
export interface ConnectionView {
  id: string;
  provider: ProviderId;
  label: string;
  revision: string;
  status: ConnectionStatus;
  enabled: boolean;
  executable?: string;
  configPath?: string;
  account?: { label?: string; loginMethod?: string };
  diagnostic?: string;
  models: AgentModel[];
  capabilities: AgentCapabilities;
  loginAttempt?: LoginAttemptView;
}
export interface ProgramCandidate {
  executable: string;
  source: 'configured' | 'selected' | 'path' | 'managed' | 'application' | 'sdk';
  label: string;
  version?: string;
  compatible: boolean;
  diagnostic?: string;
}
export interface ProgramCatalog {
  candidates: ProgramCandidate[];
  installation: { label: string; version: string; url: string; canInstall: boolean; diagnostic?: string };
}
export interface AgentProgramManager {
  discover(input: { provider: string; executable?: string; boundExecutable?: string; signal: AbortSignal }): Promise<ProgramCatalog>;
  install(input: { provider: string; signal: AbortSignal; progress(message: string): void }): Promise<string>;
}
export type PreparationState = 'discovering' | 'selection-required' | 'installation-required' | 'installing' | 'connecting' | 'waiting-login' | 'ready' | 'failed' | 'cancelled';
export interface PreparationView {
  id: string;
  connectionId: string;
  generation: string;
  state: PreparationState;
  message: string;
  updatedAt: string;
  catalog?: ProgramCatalog;
  connection: ConnectionView;
}
export interface PreparationInput { expectedRevision: string; executable?: string; install?: boolean }
export type RunStatus = 'starting' | 'running' | 'waiting-approval' | 'waiting-question' | 'stopping' | 'stopped' | 'tools-active' | 'unknown' | 'completed' | 'failed';
export interface ParticipantView { id: string; provider: ProviderId; connectionId: string; label: string; deliveredThrough: number; contextId: string }
export interface ConversationEntry {
  id: string;
  sequence: number;
  kind: 'message' | 'tool' | 'notice' | 'handoff';
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** Stable tool-step name when the source provided one. */
  name?: string;
  /** Original tool invocation input; retained when a later result replaces text. */
  input?: string;
  participantId?: string;
  provider?: ProviderId;
  runId?: string;
  status?: 'sending' | 'accepted' | 'unknown' | 'running' | 'completed' | 'failed';
  attachments?: string[];
  handoff?: HandoffMaterial;
  createdAt: string;
}
export interface RunView {
  /** Host interruption is unfinished work, distinct from a user stop. */
  interrupted?: boolean;
  contextUsage?: {usedTokens:number;windowTokens?:number};
  modelAccountId?: string; modelAccountIdentity?: string; modelSourceLabel?: string;
  id: string;
  participantId: string;
  provider: ProviderId;
  generation: string;
  status: RunStatus;
  accepted: boolean;
  tools: ExecutorObservation['tools'];
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  permissionMode?: PermissionMode;
  diagnostic?: string;
  startedAt: string;
  updatedAt: string;
}
export interface PendingRequestView extends ExecutorRequest {
  id: string;
  conversationId: string;
  workspaceId: string;
  participantId: string;
  runId: string;
  generation: string;
}
export interface ConversationView {
  id: string;
  workspaceId: string;
  cwd: string;
  taskId?: string;
  title: string;
  revision: string;
  hidden: boolean;
  updatedAt: string;
  participants: ParticipantView[];
  entries: ConversationEntry[];
  run?: RunView;
  requests: PendingRequestView[];
  nextEntryCursor?: number;
}
export interface HandoffRound {
  id: string; title: string; from: number; through: number;
  executionCount?: number; artifactCount?: number;
  state?: RunStatus; diagnostic?: string; provider?: string; model?: string;
  userInputs: string[]; assistantNotes: string[];
  execution: Array<{action:string;result:string;location?:string}>;
  artifacts: Array<{location:string;description:string}>;
  finalReply?: string; sourcePath?: string;
}
export interface HandoffMaterial {
  agent: string; model: string;
  changes: Array<{kind:'agent'|'model';label:string;before:string;after:string}>;
  rounds: HandoffRound[]; roundCount?: number; body: string; sourceThrough: number;
  mode: 'records'|'summary'|'indexed'; sourcePath?: string;
}
export interface SendDraft {
  skipHandoffSummary?: boolean;
  modelAccountId?: string; modelAccountIdentity?: string; modelAccountRevision?: string;
  expectedRevision: string;
  connectionId: string;
  text: string;
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  permissionMode?: PermissionMode;
  attachmentIds?: string[];
  /** Explicit user-authored replacement for the selected history range. */
  handoffSummary?: string;
}
export interface SendPreview {
  handoff?: HandoffMaterial;
  modelAccountId?: string; modelAccountIdentity?: string; modelAccountRevision?: string; modelSourceLabel?: string;
  token: string;
  conversationId: string;
  revision: string;
  connectionId: string;
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  permissionMode: PermissionMode;
  participantId?: string;
  cwd: string;
  taskId?: string;
  text: string;
  history: Array<{ sequence: number; role: string; provider?: string; text: string }>;
  sourceThrough: number;
  inputBytes: number;
  maxInputBytes: number;
  fits: boolean;
  switching: boolean;
  diagnostic?: string;
}
export interface ServiceEvent {
  cursor: number;
  generation: string;
  type: 'snapshot' | 'conversation' | 'connection';
  workspaceId?: string;
  conversationId?: string;
  revision: string;
  payload: { conversation?: ConversationView; connection?: ConnectionView };
}
export interface AgentServiceOptions {
  /** Trusted host profile only; released installations default to manual continuation. */
  autoContinueInterrupted?: boolean;
  modelProviders?: ModelProvider[];
  dataRoot: string;
  executors?: AgentExecutor[];
  environment?: Record<string, string | undefined>;
  /** Native program discovery/install port; credentials remain in executor-owned configs. */
  programManager?: AgentProgramManager;
  /** Host authority: resolve a registered workspace and validate an optional task. */
  resolveWorkspace(workspaceId: string): Promise<{ rootPath: string }> | { rootPath: string };
  assertTask(workspaceId: string, taskId: string): Promise<void> | void;
  now?: () => Date;
  /** Bounded host shutdown; chiefly useful for deterministic lifecycle tests. */
  shutdownTimeoutMs?: number;
}
