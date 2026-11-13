import { createHash } from 'node:crypto';
import type { LoginObservation } from '../../contracts.ts';
import { ModelAccessError, type CustomProviderConfig, type CustomProviderConfigureInput, type CustomProviderDiscoveryInput, type CustomProviderDiscoveryResult, type CustomProviderModel, type ModelOffering, type ModelProtocol, type ModelProvider, type ModelProviderObservation, type ModelProviderRuntime, type ProviderInferenceInput, type ProtocolJson } from '../contracts.ts';
import { PrivateApiKey } from './private-api-key.ts';
import { record, string } from './private-account.ts';

const MAX_URL = 2048;
const MAX_MODELS_PATH = 2048;
const DEFAULT_MODELS_PATH = '/models';
const MAX_MODELS = 200;
const MAX_DISCOVERY_MODELS = 1000;
const MAX_DISCOVERY_PAGES = 10;
const MODEL_ID = /^[^\s\u0000-\u001f]{1,256}$/u;
const NO_CATALOG_NOTICE = '端点未提供模型列表接口，请手动维护模型。';
const NO_CATALOG_DISCOVERY = '该端点没有提供可读取的模型列表接口，请手动添加模型。';

export interface CustomProviderOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

export function normalizeCustomBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL) throw new ModelAccessError('model_custom_url_invalid', 'Base URL 不能为空且不能超过 2048 个字符。', 400);
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new ModelAccessError('model_custom_url_invalid', 'Base URL 必须是完整的绝对地址，例如 https://gateway.example.com/v1。', 400); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ModelAccessError('model_custom_url_invalid', 'Base URL 只支持 HTTP 或 HTTPS 地址。', 400);
  if (url.username || url.password) throw new ModelAccessError('model_custom_url_credentials', 'Base URL 不能包含用户名或密码，请改用 API Key 配置认证。', 400);
  if (url.search || url.hash) throw new ModelAccessError('model_custom_url_invalid', 'Base URL 不能包含查询参数或片段。', 400);
  return url.href.replace(/\/+$/, '');
}

const CUSTOM_PROTOCOLS: readonly ModelProtocol[] = ['chat-completions', 'responses', 'anthropic-messages', 'gemini'];
const CUSTOM_PROTOCOL_LABELS: Record<ModelProtocol, string> = {'chat-completions':'OpenAI 兼容','responses':'OpenAI Responses','anthropic-messages':'Anthropic Messages',gemini:'Gemini'};

export function normalizeCustomProtocol(value: unknown): ModelProtocol {
  if (typeof value !== 'string' || !CUSTOM_PROTOCOLS.includes(value as ModelProtocol)) throw new ModelAccessError('model_custom_protocol_unsupported', 'API 协议只支持 OpenAI 兼容 Chat Completions、OpenAI Responses、Anthropic Messages 或 Gemini。', 400);
  return value as ModelProtocol;
}

export function normalizeCustomModelsPath(value: unknown): string {
  if (value === undefined) return DEFAULT_MODELS_PATH;
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_MODELS_PATH || !/^\/(?!\/)[^\s?#]*$/.test(value.trim())) {
    throw new ModelAccessError('model_custom_models_path_invalid', '模型列表路径必须以 / 开头，且不能包含空白、查询参数或连续斜杠。', 400);
  }
  return value.trim();
}

export function customProtocolLabel(protocol: ModelProtocol): string { return CUSTOM_PROTOCOL_LABELS[protocol]; }

export function normalizeCustomLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) throw new ModelAccessError('model_custom_name_invalid', '供应商名称不能为空且不能超过 160 个字符。', 400);
  return value.trim();
}

export function normalizeCustomModels(value: unknown): CustomProviderModel[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MODELS) throw new ModelAccessError('model_custom_models_invalid', '模型列表无效或数量超过限制。', 400);
  const seen = new Set<string>(), models: CustomProviderModel[] = [];
  for (const entry of value) {
    const row = record(entry), id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!MODEL_ID.test(id)) throw new ModelAccessError('model_custom_models_invalid', '模型 id 不能为空、不能含空白，且不能超过 256 个字符。', 400);
    if (seen.has(id)) continue;
    const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 160) : undefined;
    const contextWindow = row.contextWindow;
    if (contextWindow !== undefined && (!Number.isSafeInteger(contextWindow) || (contextWindow as number) < 1 || (contextWindow as number) > 10_000_000)) throw new ModelAccessError('model_custom_models_invalid', '上下文窗口必须是正整数，且不能超过 10000000。', 400);
    seen.add(id);
    models.push({ id, ...(label ? { label } : {}), ...(contextWindow !== undefined ? { contextWindow: contextWindow as number } : {}) });
  }
  return models;
}

export function normalizeCustomConfiguration(input: { baseUrl: unknown; protocol: unknown; modelsPath?: unknown; useApiKey: unknown; models?: unknown }): CustomProviderConfig {
  if (typeof input.useApiKey !== 'boolean') throw new ModelAccessError('model_custom_config_invalid', '请选择是否使用 API Key。', 400);
  return { protocol: normalizeCustomProtocol(input.protocol), baseUrl: normalizeCustomBaseUrl(input.baseUrl), ...(input.modelsPath !== undefined ? { modelsPath: normalizeCustomModelsPath(input.modelsPath) } : {}), useApiKey: input.useApiKey, models: normalizeCustomModels(input.models) };
}

export function customProviderIdentity(config: CustomProviderConfig, apiKey?: string): string {
  return `custom:${config.protocol}:${config.baseUrl}:${config.modelsPath ?? DEFAULT_MODELS_PATH}:${apiKey ? 'key-' + createHash('sha256').update(apiKey).digest('hex') : 'anonymous'}`;
}

export function createCustomModelProvider(options: CustomProviderOptions = {}): ModelProvider {
  return {
    id: 'custom',
    label: '自定义供应商',
    custom: true,
    sharing: { kind: 'gateway' },
    inference: 'gateway',
    presentation: { vendorLabel: '自定义供应商' },
    async open(input) {
      if (!input.custom) throw new ModelAccessError('model_custom_config_missing', '自定义供应商缺少端点配置。', 409);
      return new CustomRuntime(input.custom, new PrivateApiKey(input.configRoot), options);
    },
    async discover(input) {
      const baseUrl = normalizeCustomBaseUrl(input.baseUrl), protocol = normalizeCustomProtocol(input.protocol);
      const apiKey = input.useApiKey && input.apiKey !== undefined ? apiKeyValue(input.apiKey) : undefined;
      if (input.useApiKey && !apiKey) throw new ModelAccessError('model_custom_api_key_required', '请填写 API Key 后再获取模型列表。', 400);
      const result = await probe(baseUrl, protocol, normalizeCustomModelsPath(input.modelsPath), apiKey, input.useApiKey, createFetch(options), 20_000);
      if (result.kind === 'models') return { models: result.models, observedAt: new Date().toISOString(), ...(result.incomplete ? { incomplete: true } : {}), ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}) };
      return { models: [], incomplete: true, diagnostic: result.kind === 'no-catalog' ? NO_CATALOG_DISCOVERY : result.diagnostic };
    },
  };
}

class CustomRuntime implements ModelProviderRuntime {
  get protocol(): ModelProtocol { return this.config.protocol; }
  private readonly store: PrivateApiKey;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly lifetime = new AbortController();
  private config: CustomProviderConfig;
  private cachedKey?: string;
  constructor(config: CustomProviderConfig, store: PrivateApiKey, options: CustomProviderOptions) {
    this.config = structuredClone(config);
    this.store = store;
    this.fetch = options.fetch ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async inspect(): Promise<ModelProviderObservation> {
    let apiKey: string | undefined;
    try {
      apiKey = this.config.useApiKey ? (this.cachedKey ?? await this.store.read()) : undefined;
      this.cachedKey = apiKey;
    } catch {
      return { status: 'failed', credentialConfigured: false, models: [], curatedModels: true, diagnostic: 'API Key 存储不可读取，请检查账号私有目录。' };
    }
    if (this.config.useApiKey && !apiKey) return { status: 'not-authenticated', credentialConfigured: false, models: [], curatedModels: true };
    const identity = customProviderIdentity(this.config, apiKey);
    let result: ProbeResult;
    try { result = await probe(this.config.baseUrl, this.config.protocol, this.config.modelsPath ?? DEFAULT_MODELS_PATH, apiKey, this.config.useApiKey, this.fetch, this.timeoutMs, this.lifetime.signal); }
    catch (error) { return { status: 'failed', identity, credentialConfigured: Boolean(apiKey), models: [], curatedModels: true, diagnostic: error instanceof ModelAccessError ? error.message : '端点检查未完成，请稍后重试。' }; }
    if (result.kind === 'models' || result.kind === 'no-catalog') {
      const diagnostic = result.kind === 'no-catalog' ? NO_CATALOG_NOTICE : result.diagnostic;
      return { status: 'ready', identity, credentialConfigured: Boolean(apiKey), models: this.models(), curatedModels: true, ...(diagnostic ? { diagnostic } : {}) };
    }
    return { status: 'failed', incomplete: true, identity, credentialConfigured: Boolean(apiKey), models: this.models(), curatedModels: true, diagnostic: result.diagnostic };
  }

  async configureCustom(input: CustomProviderConfigureInput): Promise<ModelProviderObservation> {
    const config = normalizeCustomConfiguration({ baseUrl: input.baseUrl, protocol: input.protocol, ...(input.modelsPath !== undefined ? { modelsPath: input.modelsPath } : {}), useApiKey: input.useApiKey, models: input.models });
    let apiKey: string | undefined;
    if (config.useApiKey) {
      apiKey = input.apiKey === undefined ? this.cachedKey ?? await this.store.read() : apiKeyValue(input.apiKey);
      if (!apiKey) throw new ModelAccessError('model_custom_api_key_required', '启用 API Key 时必须填写密钥。', 400);
    }
    const result = await probe(config.baseUrl, config.protocol, config.modelsPath ?? DEFAULT_MODELS_PATH, apiKey, config.useApiKey, this.fetch, this.timeoutMs, this.lifetime.signal);
    if (result.kind === 'auth') throw new ModelAccessError('model_custom_authentication_failed', result.diagnostic, result.status);
    if (config.useApiKey) { await this.store.save(apiKey!); this.cachedKey = apiKey; }
    else { await this.store.delete(); this.cachedKey = undefined; }
    this.config = config;
    const identity = customProviderIdentity(config, apiKey);
    if (result.kind === 'models' || result.kind === 'no-catalog') {
      const diagnostic = result.kind === 'no-catalog' ? NO_CATALOG_NOTICE : result.diagnostic;
      return { status: 'ready', identity, credentialConfigured: Boolean(apiKey), models: this.models(), curatedModels: true, ...(diagnostic ? { diagnostic } : {}) };
    }
    return { status: 'failed', incomplete: true, identity, credentialConfigured: Boolean(apiKey), models: this.models(), curatedModels: true, diagnostic: result.diagnostic };
  }

  async discoverCustom(input: CustomProviderDiscoveryInput): Promise<CustomProviderDiscoveryResult> {
    const baseUrl = normalizeCustomBaseUrl(input.baseUrl), protocol = normalizeCustomProtocol(input.protocol);
    const modelsPath = normalizeCustomModelsPath(input.modelsPath ?? this.config.modelsPath);
    const useApiKey = input.useApiKey === true;
    let apiKey: string | undefined;
    if (useApiKey) {
      apiKey = input.apiKey === undefined ? this.cachedKey ?? await this.store.read() : apiKeyValue(input.apiKey);
      if (!apiKey) throw new ModelAccessError('model_custom_api_key_required', '请填写 API Key 后再获取模型列表。', 400);
    }
    const result = await probe(baseUrl, protocol, modelsPath, apiKey, useApiKey, this.fetch, 20_000, AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(20_000)]));
    if (result.kind === 'models') return { models: result.models, observedAt: new Date().toISOString(), ...(result.incomplete ? { incomplete: true } : {}), ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}) };
    if (result.kind === 'no-catalog') return { models: [], incomplete: true, diagnostic: NO_CATALOG_DISCOVERY };
    return { models: [], incomplete: true, diagnostic: result.diagnostic };
  }

  async beginLogin(_update: (value: LoginObservation) => void): Promise<void> {
    throw new ModelAccessError('model_custom_login_unsupported', '自定义供应商不支持浏览器登录，请编辑端点配置。', 400);
  }

  async cancelLogin(): Promise<void> {}

  async infer(input: ProviderInferenceInput): Promise<Response> {
    const apiKey = this.config.useApiKey ? (this.cachedKey ?? await this.store.read()) : undefined;
    if (this.config.useApiKey && !apiKey) return Response.json({ error: { code: 'model_custom_not_configured' } }, { status: 401 });
    const request = this.request(input, apiKey);
    let response: Response;
    try {
      response = await this.fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        redirect: 'error',
        signal: AbortSignal.any([this.lifetime.signal, input.signal]),
      });
    } catch {
      return Response.json({ error: { code: 'model_custom_network_failed' } }, { status: 502 });
    }
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 401 ? 'model_custom_authentication_failed'
        : response.status === 403 ? 'model_custom_permission_denied'
          : response.status === 429 ? 'model_custom_rate_limited'
            : 'model_custom_upstream_failed';
      return Response.json({ error: { code } }, { status: response.status });
    }
    if (input.body.stream === true && !response.headers.has('content-type')) {
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: { 'content-type': 'text/event-stream' } });
    }
    return response;
  }

  async close(): Promise<void> {
    this.lifetime.abort();
  }

  private request(input: ProviderInferenceInput, apiKey: string | undefined): { url: string; headers: Record<string, string>; body: ProtocolJson } {
    const stream = input.body.stream === true;
    const common = { 'content-type': 'application/json', accept: stream ? 'text/event-stream' : 'application/json' };
    if (this.config.protocol === 'chat-completions' || this.config.protocol === 'responses') {
      return { url: `${this.config.baseUrl}/${this.config.protocol === 'chat-completions' ? 'chat/completions' : 'responses'}`, headers: { ...common, ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: { ...input.body, model: input.modelId } };
    }
    if (this.config.protocol === 'anthropic-messages') {
      return { url: `${this.config.baseUrl}/messages`, headers: { ...common, 'anthropic-version': '2023-06-01', ...(apiKey ? { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` } : {}) }, body: { ...input.body, model: input.modelId } };
    }
    const { model: _model, stream: _stream, ...body } = input.body;
    return { url: `${this.config.baseUrl}/models/${encodeURIComponent(input.modelId.replace(/^models\//, ''))}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, headers: { ...common, ...(apiKey ? { 'x-goog-api-key': apiKey } : {}) }, body };
  }

  private models(): ModelOffering[] {
    return this.config.models.map(model => ({ id: model.id, label: model.label ?? model.id, ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}), images: false, tools: true, kind: 'model' as const }));
  }
}

type ProbeResult = { kind: 'models'; models: Array<{ id: string; label?: string }>; incomplete?: boolean; diagnostic?: string } | { kind: 'no-catalog' } | { kind: 'auth'; status: number; diagnostic: string } | { kind: 'unreachable'; diagnostic: string };

async function probe(baseUrl: string, protocol: ModelProtocol, modelsPath: string, apiKey: string | undefined, useApiKey: boolean, doFetch: typeof fetch, timeoutMs: number, lifetime?: AbortSignal): Promise<ProbeResult> {
  const headers = { accept: 'application/json', ...catalogHeaders(protocol, useApiKey ? apiKey : undefined) };
  const models = new Map<string, { id: string; label?: string }>();
  let url = catalogUrl(baseUrl, protocol, modelsPath);
  for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
    let response: Response;
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      response = await doFetch(url, { method: 'GET', headers, redirect: 'error', signal: lifetime ? AbortSignal.any([lifetime, timeout]) : timeout });
    } catch {
      return models.size ? { kind: 'models', models: [...models.values()], incomplete: true, diagnostic: '后续模型列表读取未完成，已保留本次读取到的候选。' } : { kind: 'unreachable', diagnostic: '无法连接自定义端点，请检查 Base URL 与网络后重试。' };
    }
    if (response.status === 401 || response.status === 403 || (protocol === 'gemini' && response.status === 400)) {
      await response.body?.cancel();
      return models.size ? { kind: 'models', models: [...models.values()], incomplete: true, diagnostic: '后续模型列表读取被拒绝，已保留本次读取到的候选。' } : { kind: 'auth', status: response.status, diagnostic: '自定义端点拒绝了当前认证，请检查 API Key 或认证设置。' };
    }
    if (response.status === 404 || response.status === 405) {
      await response.body?.cancel();
      return models.size ? { kind: 'models', models: [...models.values()], incomplete: true, diagnostic: '后续模型列表读取未完成，已保留本次读取到的候选。' } : { kind: 'no-catalog' };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return models.size ? { kind: 'models', models: [...models.values()], incomplete: true, diagnostic: `后续模型列表读取失败（HTTP ${response.status}）。` } : { kind: 'unreachable', diagnostic: `自定义端点模型列表读取失败（HTTP ${response.status}）。` };
    }
    let data: ProtocolJson;
    try { data = record(await boundedJson(response)); } catch {
      return models.size ? { kind: 'models', models: [...models.values()], incomplete: true, diagnostic: '后续模型列表不是有效 JSON，已保留本次读取到的候选。' } : { kind: 'no-catalog' };
    }
    for (const entry of catalogEntries(data, protocol)) { if (!models.has(entry.id)) models.set(entry.id, entry); if (models.size >= MAX_DISCOVERY_MODELS) break; }
    const next = catalogNext(baseUrl, protocol, modelsPath, data);
    if (!next) break;
    if (models.size >= MAX_DISCOVERY_MODELS || page === MAX_DISCOVERY_PAGES - 1) return { kind: 'models', models: [...models.values()], incomplete: true, diagnostic: '模型列表超过单次读取上限，已保留部分候选。' };
    url = next;
  }
  return models.size ? { kind: 'models', models: [...models.values()] } : { kind: 'no-catalog' };
}

function catalogUrl(baseUrl: string, protocol: ModelProtocol, modelsPath: string): string {
  if (protocol === 'anthropic-messages') return `${baseUrl}${modelsPath}?limit=1000`;
  if (protocol === 'gemini') return `${baseUrl}${modelsPath}?pageSize=1000`;
  return `${baseUrl}${modelsPath}`;
}

function catalogHeaders(protocol: ModelProtocol, apiKey: string | undefined): Record<string, string> {
  if (protocol === 'anthropic-messages') return { 'anthropic-version': '2023-06-01', ...(apiKey ? { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` } : {}) };
  if (protocol === 'gemini') return apiKey ? { 'x-goog-api-key': apiKey } : {};
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function catalogEntries(data: ProtocolJson, protocol: ModelProtocol): Array<{ id: string; label?: string }> {
  if (protocol === 'gemini') {
    return (Array.isArray(data.models) ? data.models : []).flatMap(value => {
      const row = record(value), name = string(row.name)?.trim(), methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
      const id = name?.replace(/^models\//, '');
      if (!id || !MODEL_ID.test(id) || !methods.includes('generateContent')) return [];
      const label = string(row.displayName);
      return [{ id, ...(label ? { label } : {}) }];
    });
  }
  return (Array.isArray(data.data) ? data.data : []).flatMap(value => {
    const row = record(value), id = string(row.id)?.trim();
    if (!id || !MODEL_ID.test(id)) return [];
    const label = string(row.display_name) ?? string(row.name);
    return [{ id, ...(label ? { label } : {}) }];
  });
}

function catalogNext(baseUrl: string, protocol: ModelProtocol, modelsPath: string, data: ProtocolJson): string | undefined {
  if (protocol === 'anthropic-messages') {
    const last = string(data.last_id);
    return data.has_more === true && last ? `${baseUrl}${modelsPath}?limit=1000&after_id=${encodeURIComponent(last)}` : undefined;
  }
  if (protocol === 'gemini') {
    const token = string(data.nextPageToken);
    return token ? `${baseUrl}${modelsPath}?pageSize=1000&pageToken=${encodeURIComponent(token)}` : undefined;
  }
  return undefined;
}

async function boundedJson(response: Response, limit = 2 * 1024 * 1024): Promise<unknown> {
  if (!response.body) throw new Error('model_custom_catalog_empty');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) throw new Error('model_custom_catalog_too_large');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8'));
}

function apiKeyValue(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 4096) throw new ModelAccessError('model_api_key_invalid', 'API Key 不能为空且不能超过 4096 个字符。', 400);
  return value.trim();
}

function createFetch(options: CustomProviderOptions): typeof fetch {
  return options.fetch ?? fetch;
}
