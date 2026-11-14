import type { LoginObservation } from '../contracts.ts';

export type ModelProtocol = 'responses' | 'chat-completions' | 'anthropic-messages' | 'gemini';
export type ProtocolJson = Record<string, unknown>;
export interface ModelProviderAuthentication {
  type: 'oauth' | 'api-key';
  label: string;
  placeholder?: string;
  description?: string;
}
export interface ModelProviderGroup {
  id: string;
  label: string;
}
export type ModelProviderSharing =
  | { kind: 'gateway' }
  | { kind: 'executor-exclusive'; executors: readonly string[]; reason: string };
export type ModelProviderInference = 'gateway' | 'none';
export interface ModelProviderPresentation {
  vendorLabel: string;
  sourceLabel?: string;
  quotaLabel?: string;
  apiKeyHint?: string;
  quotaUnavailableNote?: string;
  billing?: { url: string; label: string };
}
export interface ModelExecutorCompatibility {
  connectionId: string;
  compatible: boolean;
  reasonCode?: string;
  reason?: string;
}
export interface ModelOffering {
  id: string;
  label: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  images: boolean;
  tools: boolean;
  reasoningEfforts?: Array<{ id: string; label: string }>;
  defaultReasoningEffort?: string;
  kind?: 'model' | 'combination';
  family?: string;
  enabled?: boolean;
  reportedContextWindow?: number;
  contextWindowOverride?: number;
  defaultServiceTier?: string;
  /** Platform-reported per-request credit multiplier (for example Qoder `price_factor`). */
  creditFactor?: number;
  serviceTiers?: Array<{id:string;label:string;contextWindow?:number;reasoningEfforts?:Array<{id:string;label:string}>;defaultReasoningEffort?:string}>;
}
export interface ModelPreference { enabled:boolean;contextWindow?:number; }
export interface ModelPreferenceUpdate { expectedRevision:string;sourceEnabled?:boolean;models?:Array<{id:string;enabled?:boolean;contextWindow?:number|null}>; }
export interface ModelQuotaObservation {
  observedAt: string;
  available: boolean;
  summary?: string;
  remainingPercent?: number;
  resetsAt?: string;
  planLabel?: string;
  stale?:boolean;
  diagnostic?:string;
  /** Decimal strings preserve the native wallet precision; currencies are never converted. */
  balances?: Array<{currency:string;total:string;toppedUp?:string;granted?:string}>;
  windows?: Array<{id:string;label:string;groupLabel?:string;remainingPercent:number;resetsAt?:string;limitWindowSeconds?:number;/** Platform-reported credit amounts; omitted when the source only reports percentages. */remainingCredits?:number;totalCredits?:number}>;
}
export interface CustomProviderModel {
  /** Upstream model id, sent verbatim. */
  id: string;
  label?: string;
  contextWindow?: number;
}
export interface CustomProviderConfig {
  protocol: ModelProtocol;
  baseUrl: string;
  /** Catalog path relative to Base URL; omitted keeps the legacy `/models` path. */
  modelsPath?: string;
  useApiKey: boolean;
  models: CustomProviderModel[];
}
export interface CustomProviderConfigureInput {
  expectedRevision?: string;
  label: string;
  baseUrl: string;
  protocol: string;
  useApiKey: boolean;
  /** Required when `useApiKey` is true; omitted means keep the stored key. */
  apiKey?: string;
  /** Catalog path relative to Base URL; omitted keeps the stored or default path. */
  modelsPath?: string;
  models?: CustomProviderModel[];
}
export interface CustomProviderDiscoveryInput {
  /** Reuse the stored key of an existing custom account when `apiKey` is omitted. */
  accountId?: string;
  baseUrl: string;
  protocol: string;
  useApiKey: boolean;
  apiKey?: string;
  /** Catalog path relative to Base URL; omitted keeps the stored or default path. */
  modelsPath?: string;
}
export interface CustomProviderDiscoveryResult {
  models: Array<{ id: string; label?: string }>;
  observedAt?: string;
  /** The endpoint did not complete discovery; partial or empty results are not a credential failure. */
  incomplete?: boolean;
  diagnostic?: string;
}
export interface ModelProviderObservation {
  /** The inspection did not establish current availability; not a confirmed account failure. */
  incomplete?: boolean;
  /** The selected source has a locally configured credential without exposing it. */
  credentialConfigured?: boolean;
  /** The observed model list is user-curated and must not be replaced by an inspection. */
  curatedModels?: boolean;
  status: 'not-authenticated' | 'ready' | 'expired' | 'failed';
  label?: string;
  identity?: string;
  models: ModelOffering[];
  quota?: ModelQuotaObservation;
  diagnostic?: string;
}
export interface ProviderInferenceInput {
  /** Already translated to the runtime's declared protocol. */
  body: ProtocolJson;
  modelId: string;
  providerIdentity?: string;
  signal: AbortSignal;
  context: { accountId: string; agentId: string; conversationId: string; runId: string; requestId: string };
}
export interface ModelProviderRuntime {
  readonly protocol: ModelProtocol;
  protocolForModel?(modelId: string): ModelProtocol;
  inspect(): Promise<ModelProviderObservation>;
  /** Local credential identity; read by this provider, never derived from an agent connection. */
  identity?(): Promise<string>;
  /** Validate and replace an API-key credential atomically. */
  configure?(input: { apiKey: string }): Promise<ModelProviderObservation>;
  /** Validate and persist custom endpoint configuration without exposing its credential. */
  configureCustom?(input: CustomProviderConfigureInput): Promise<ModelProviderObservation>;
  /** Read the configured endpoint's model list as discovery candidates only. */
  discoverCustom?(input: CustomProviderDiscoveryInput): Promise<CustomProviderDiscoveryResult>;
  beginLogin(update: (value: LoginObservation) => void): Promise<void>;
  cancelLogin(): Promise<void>;
  /** Response uses protocol, including its native streaming and errors. */
  infer(input: ProviderInferenceInput): Promise<Response>;
  close(): Promise<void>;
}
export interface ModelProvider {
  readonly id: string;
  readonly label: string;
  readonly connectionId?: string;
  /** Created automatically from a native account that no agent connection owns. */
  readonly linked?: boolean;
  /** Built-in source that owns exactly one local account. */
  readonly singleton?: boolean;
  /** Probe for a reusable local login even before the first successful observation. */
  readonly autoInspect?: boolean;
  readonly replacesSource?: (account: ModelAccountView) => boolean;
  readonly authentication?: ModelProviderAuthentication;
  readonly group?: ModelProviderGroup;
  readonly modeLabel?: string;
  readonly sharing?: ModelProviderSharing;
  readonly inference?: ModelProviderInference;
  readonly presentation?: ModelProviderPresentation;
  /** Clear persisted catalog/quota snapshot when inspection proves unauthenticated or expired. */
  readonly clearCatalogOnUnauthenticated?: boolean;
  /** Newly discovered non-combination models default to enabled when first observed. */
  readonly enableDiscoveredModelsByDefault?: boolean;
  readonly legacyModelVariant?: (modelId: string) => { family: string; depth: string } | undefined;
  /** Connection account inspection delegates to this model provider without starting the executor runtime. */
  readonly observesConnection?: boolean;
  /** Accounts of this provider carry user-declared endpoint configuration. */
  readonly custom?: boolean;
  open(input: { accountId: string; configRoot: string; environment: Readonly<Record<string, string>>; custom?: CustomProviderConfig }): Promise<ModelProviderRuntime>;
  /** Stateless discovery for an unsaved custom configuration. */
  discover?(input: CustomProviderDiscoveryInput): Promise<CustomProviderDiscoveryResult>;
}
export interface ModelAccountView {
  id: string;
  /** Local credential generation. Changes at explicit login, not token renewal. */
  identity: string;
  provider: string;
  connectionId?: string;
  label: string;
  revision: string;
  enabled: boolean;
  /** Selection visibility, independent of credential/login state. Missing legacy value means enabled. */
  sourceEnabled?: boolean;
  status: 'not-authenticated' | 'ready' | 'expired' | 'failed' | 'disconnected';
  /** Provider-declared credential mechanism; never the credential itself. */
  authType?: 'oauth' | 'api-key';
  singleton?: boolean;
  group?: ModelProviderGroup;
  modeLabel?: string;
  sharing?: { kind: 'gateway' } | { kind: 'executor-exclusive'; executors: string[]; reason: string };
  inference?: ModelProviderInference;
  presentation?: ModelProviderPresentation;
  executorCompatibility?: ModelExecutorCompatibility[];
  credentialConfigured?: boolean;
  accountLabel?: string;
  /** Public custom endpoint configuration; never contains the API key. */
  custom?: CustomProviderConfig;
  models: ModelOffering[];
  observedAt?: string;
  quota?: ModelQuotaObservation;
  diagnostic?: string;
  loginAttempt?: LoginObservation & { id: string; updatedAt: string };
}
export interface CatalogModel extends ModelOffering {
  accountId: string;
  accountIdentity: string;
  provider: string;
  accountLabel: string;
  modelId: string;
  accountRevision: string;
  available: boolean;
  observedAt?: string;
  sharing?: { kind: 'gateway' } | { kind: 'executor-exclusive'; executors: string[]; reason: string };
  inference?: ModelProviderInference;
  presentation?: ModelProviderPresentation;
  executorCompatibility?: ModelExecutorCompatibility[];
}
export interface ModelLeaseInput {
  accountId: string;
  modelId: string;
  conversationId: string;
  runId: string;
  agentId: string;
  expectedRevision?: string;
  expectedIdentity?: string;
  serviceTier?: string;
  sseKeepalive?: boolean;
}
export interface ModelGatewayLease {
  identity: string;
  baseUrl: string;
  apiKey: string;
  /** Client-facing route; never an upstream account credential. */
  model: string;
  offering: ModelOffering;
  accountId: string;
  accountLabel: string;
  provider: string;
}
export interface ModelAccessOptions {
  root: string;
  providers: ModelProvider[];
  executors?: ReadonlyArray<import('../contracts.ts').ExecutorDescriptor> | (() => ReadonlyArray<import('../contracts.ts').ExecutorDescriptor>);
  environment?: Record<string, string>;
  changed?(account: ModelAccountView): void;
  diagnostics?: import('../contracts.ts').ExecutionDiagnosticSink;
  now?(): Date;
}
export class ModelAccessError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) { super(message); this.code = code; this.status = status; }
}
