import type { LoginObservation } from '../contracts.ts';

export type ModelProtocol = 'responses' | 'chat-completions' | 'anthropic-messages';
export type ProtocolJson = Record<string, unknown>;
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
export interface ModelPreferenceUpdate { expectedRevision:string;models:Array<{id:string;enabled?:boolean;contextWindow?:number|null}>; }
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
  windows?: Array<{id:string;label:string;remainingPercent:number;resetsAt?:string;limitWindowSeconds?:number}>;
}
export interface ModelProviderObservation {
  /** The inspection did not establish current availability; not a confirmed account failure. */
  incomplete?: boolean;
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
  signal: AbortSignal;
  context: { accountId: string; agentId: string; conversationId: string; runId: string; requestId: string };
}
export interface ModelProviderRuntime {
  readonly protocol: ModelProtocol;
  inspect(): Promise<ModelProviderObservation>;
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
  open(input: { accountId: string; configRoot: string; environment: Readonly<Record<string, string>> }): Promise<ModelProviderRuntime>;
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
  status: 'not-authenticated' | 'ready' | 'expired' | 'failed' | 'disconnected';
  accountLabel?: string;
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
  environment?: Record<string, string>;
  changed?(account: ModelAccountView): void;
  now?(): Date;
}
export class ModelAccessError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) { super(message); this.code = code; this.status = status; }
}
