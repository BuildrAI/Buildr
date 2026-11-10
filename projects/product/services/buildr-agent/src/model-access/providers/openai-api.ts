import { createHash } from 'node:crypto';
import type { LoginObservation } from '../../contracts.ts';
import { ModelAccessError, type ModelProvider, type ModelProviderObservation, type ModelProviderRuntime, type ModelOffering, type ProviderInferenceInput, type ProtocolJson } from '../contracts.ts';
import { record, string } from './private-account.ts';
import { PrivateApiKey } from './private-api-key.ts';
import { openAIModelOffering } from './openai-api-models.ts';

const BASE = 'https://api.openai.com/v1';
const EXCLUDED_MODEL = /(embedding|whisper|tts|transcrib|audio|realtime|moderation|dall-e|gpt-image|image-|sora|video|search-api|search-preview|live-|computer-use)/i;
const CHAT_MODEL = /^(gpt-|chatgpt-|o[1-9](?:-|$)|codex-)/i;

export interface OpenAIApiProviderOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

export function isOpenAIChatModel(id: string): boolean {
  return CHAT_MODEL.test(id) && !EXCLUDED_MODEL.test(id);
}

export function createOpenAIApiModelProvider(options: OpenAIApiProviderOptions = {}): ModelProvider {
  return {
    id: 'openai',
    label: 'ChatGPT API',
    authentication: { type: 'api-key', label: 'API Key', placeholder: 'sk-...', description: '只保存 API Key，使用 OpenAI 官方 API。' },
    group: { id: 'chatgpt', label: 'ChatGPT' },
    modeLabel: 'API Key',
    async open(input) {
      return new OpenAIApiRuntime(new PrivateApiKey(input.configRoot), options);
    },
  };
}

class OpenAIApiRuntime implements ModelProviderRuntime {
  readonly protocol = 'responses' as const;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly lifetime = new AbortController();
  private catalog = new Map<string, ModelOffering>();
  private cachedKey?: string;
  private readonly store: PrivateApiKey;
  constructor(store: PrivateApiKey, options: OpenAIApiProviderOptions) {
    this.store = store;
    this.fetch = options.fetch ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async inspect(): Promise<ModelProviderObservation> {
    let apiKey: string | undefined;
    try {
      apiKey = this.cachedKey ?? await this.store.read();
      this.cachedKey = apiKey;
    } catch {
      return { status: 'failed', credentialConfigured: false, models: [], diagnostic: 'API Key 存储不可读取，请检查账号私有目录。' };
    }
    if (!apiKey) return { status: 'not-authenticated', credentialConfigured: false, models: [] };
    try {
      const models = await this.models(apiKey);
      this.catalog = new Map(models.map(model => [model.id, model]));
      return { status: 'ready', label: 'ChatGPT API', identity: identity(apiKey), credentialConfigured: true, models };
    } catch (error) {
      const failure = this.failure(error);
      return { status: failure.status, incomplete: failure.incomplete, label: 'ChatGPT API', credentialConfigured: true, models: [], diagnostic: failure.diagnostic };
    }
  }

  async configure(input: { apiKey: string }): Promise<ModelProviderObservation> {
    const apiKey = input.apiKey.trim();
    if (!apiKey || apiKey.length > 4096) throw new ModelAccessError('model_openai_api_key_invalid', 'API Key 不能为空且不能超过 4096 个字符。', 400);
    const models = await this.models(apiKey);
    await this.store.save(apiKey);
    this.cachedKey = apiKey;
    this.catalog = new Map(models.map(model => [model.id, model]));
    return { status: 'ready', label: 'ChatGPT API', identity: identity(apiKey), credentialConfigured: true, models };
  }

  async beginLogin(_update: (value: LoginObservation) => void): Promise<void> {
    throw new ModelAccessError('model_openai_api_key_required', 'ChatGPT API 模式需要配置 API Key，不支持浏览器登录。', 400);
  }

  async cancelLogin(): Promise<void> {}

  async infer(input: ProviderInferenceInput): Promise<Response> {
    const apiKey = this.cachedKey ?? await this.store.read();
    if (!apiKey) return Response.json({ error: { code: 'model_openai_not_configured' } }, { status: 401 });
    if (!this.catalog.has(input.modelId)) await this.inspect();
    if (!this.catalog.has(input.modelId)) return Response.json({ error: { code: 'model_not_available' } }, { status: 404 });
    const body = openAIResponsesBody(input.body, input.modelId);
    let response: Response;
    try {
      response = await this.fetch(BASE + '/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, accept: input.body.stream === true ? 'text/event-stream' : 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.any([this.lifetime.signal, input.signal]),
      });
    } catch {
      return Response.json({ error: { code: 'model_openai_network_failed' } }, { status: 502 });
    }
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 401 ? 'model_openai_authentication_failed'
        : response.status === 403 ? 'model_openai_permission_denied'
          : response.status === 429 ? 'model_openai_rate_limited'
            : 'model_openai_upstream_failed';
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

  private async models(apiKey: string): Promise<ModelOffering[]> {
    let response: Response;
    try {
      response = await this.fetch(BASE + '/models', {
        method: 'GET',
        headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.timeoutMs)]),
      });
    } catch {
      throw new ModelAccessError('model_openai_network_failed', '无法连接 OpenAI 官方 API，请检查网络后重试。', 502);
    }
    if (response.status === 401) {
      await response.body?.cancel();
      throw new ModelAccessError('model_openai_api_key_invalid', 'API Key 无效或已被撤销。', 401);
    }
    if (response.status === 403) {
      await response.body?.cancel();
      throw new ModelAccessError('model_openai_permission_denied', '当前 API Key 没有读取模型或使用 API 的权限。', 403);
    }
    if (response.status === 429) {
      await response.body?.cancel();
      throw new ModelAccessError('model_openai_rate_limited', 'OpenAI API 当前限制了请求速率，请稍后重试。', 429);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ModelAccessError('model_openai_catalog_failed', `OpenAI API 模型读取失败（HTTP ${response.status}）。`, 502);
    }
    let data: ProtocolJson;
    try {
      data = record(await response.json());
    } catch {
      throw new ModelAccessError('model_openai_catalog_invalid', 'OpenAI API 返回的模型目录不是有效 JSON。', 502);
    }
    const models = (Array.isArray(data.data) ? data.data : []).flatMap(value => {
      const row = record(value), id = string(row.id);
      if (!id || !isOpenAIChatModel(id) || row.enabled === false || row.disabled === true) return [];
      return [openAIModelOffering(id, string(row.display_name) ?? string(row.name)) satisfies ModelOffering];
    });
    if (!models.length) throw new ModelAccessError('model_openai_catalog_empty', '当前 API Key 没有可用的文本对话模型。', 409);
    return models;
  }

  private failure(error: unknown): { status: ModelProviderObservation['status']; incomplete?: boolean; diagnostic: string } {
    if (error instanceof ModelAccessError) {
      if (error.code === 'model_openai_api_key_invalid') return { status: 'failed', diagnostic: 'API Key 无效或已被撤销。' };
      if (error.code === 'model_openai_permission_denied') return { status: 'failed', diagnostic: '当前 API Key 没有读取模型或使用 API 的权限。' };
      if (error.code === 'model_openai_rate_limited' || error.code === 'model_openai_network_failed') return { status: 'failed', incomplete: true, diagnostic: error.message };
      return { status: 'failed', diagnostic: error.message };
    }
    return { status: 'failed', incomplete: true, diagnostic: 'OpenAI API 模型读取未完成，请稍后重试。' };
  }
}

export function openAIResponsesBody(input: ProtocolJson, model: string): ProtocolJson {
  const body: ProtocolJson = { ...input, model, store: false };
  const include = Array.isArray(body.include) ? body.include.filter(value => typeof value === 'string') : [];
  body.include = [...new Set([...include, 'reasoning.encrypted_content'])];
  return body;
}

function identity(apiKey: string): string {
  return 'openai-api:' + createHash('sha256').update(apiKey).digest('hex');
}
