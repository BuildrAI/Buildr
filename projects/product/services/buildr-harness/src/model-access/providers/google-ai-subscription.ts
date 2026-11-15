import { createHash } from 'node:crypto';
import type { LoginObservation } from '../../contracts.ts';
import { ModelAccessError, type ModelProvider, type ModelProviderObservation, type ModelProviderRuntime, type ModelQuotaObservation, type ProtocolJson, type ProviderInferenceInput } from '../contracts.ts';
import { beginPkce, positive, PrivateAccount, record, string, type CredentialRecord } from './private-account.ts';

const upstream = 'https://cloudcode-pa.googleapis.com/v1internal:';
const accountUpstream = 'https://daily-cloudcode-pa.googleapis.com/v1internal:';
const scopes = ['openid', 'email', ...['cloud-platform', 'aicode'].map(scope => 'https://www.googleapis.com/auth/' + scope)];
const usageLink = { url: 'https://antigravity.google/docs/cli/commands/usage', label: '查看额度方法' };
interface Options { clientId?: string; clientSecret?: string; callbackPort?: number; fetch?: typeof fetch; }

export function createGoogleAiSubscriptionProvider(options: Options = {}): ModelProvider {
  return {
    id: 'google-ai-subscription',
    label: 'Google AI 订阅',
    singleton: true,
    enableDiscoveredModelsByDefault: true,
    authentication: {
      type: 'oauth',
      label: 'Google OAuth',
      description: '通过独立 OAuth 客户端访问 Google AI 订阅。Google 限制第三方访问，继续可能导致账号停用。',
    },
    modeLabel: '订阅',
    sharing: { kind: 'gateway' },
    inference: 'gateway',
    presentation: { vendorLabel: 'Google', sourceLabel: 'Google AI 订阅', billing: usageLink },
    async open(input) { return new GoogleAiRuntime(new PrivateAccount(input.configRoot), options); },
  };
}

class GoogleAiRuntime implements ModelProviderRuntime {
  readonly protocol = 'gemini' as const;
  private readonly lifetime = new AbortController();
  private login?: AbortController;
  private loginFinished?: Promise<void>;
  private refreshing?: Promise<CredentialRecord>;
  private readonly request: typeof fetch;
  private readonly account: PrivateAccount;
  private readonly options: Options;
  private readonly clientId?: string;
  private readonly clientSecret?: string;

  constructor(account: PrivateAccount, options: Options) {
    this.account = account;
    this.options = options;
    this.request = options.fetch ?? fetch;
    this.clientId = options.clientId ?? process.env.BUILDR_GOOGLE_AI_OAUTH_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.BUILDR_GOOGLE_AI_OAUTH_CLIENT_SECRET;
  }

  private async token(fields: Record<string, string>, signal: AbortSignal) {
    if (!this.clientId) throw new ModelAccessError('google_ai_client_missing', '请配置 Google AI 订阅 OAuth 客户端。', 409);
    const response = await this.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, client_id: this.clientId, ...(this.clientSecret ? { client_secret: this.clientSecret } : {}) }),
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ModelAccessError('google_ai_token_failed', 'Google OAuth 授权或刷新失败。', response.status === 400 ? 401 : response.status);
    }
    const data = record(await response.json()), accessToken = string(data.access_token), expires = positive(data.expires_in);
    if (!accessToken || !expires) throw new ModelAccessError('google_ai_token_invalid', 'Google OAuth 返回的凭据不完整。', 502);
    return { accessToken, expiresAt: Date.now() + expires * 1000, refreshToken: string(data.refresh_token) };
  }

  private async credential() {
    const current = await this.account.read();
    if (!current || (current.expiresAt ?? 0) > Date.now() + 60_000) return current;
    if (!current.refreshToken) throw new ModelAccessError('google_ai_login_expired', 'Google AI 登录已过期。', 401);
    const refreshToken = current.refreshToken;
    if (!this.refreshing) {
      this.refreshing = this.token({ grant_type: 'refresh_token', refresh_token: refreshToken }, this.lifetime.signal)
        .then(next => {
          this.lifetime.signal.throwIfAborted();
          return this.account.save({ ...next, accountId: current.accountId, refreshToken: next.refreshToken ?? refreshToken }, current.revision);
        })
        .finally(() => { this.refreshing = undefined; });
    }
    return this.refreshing;
  }

  async identity() {
    const current = await this.account.read();
    if (!current?.accountId) throw new ModelAccessError('google_ai_identity_missing', 'Google AI 账号身份不可用。', 401);
    return current.accountId;
  }

  private post(method: string, body: ProtocolJson, accessToken: string, signal: AbortSignal, stream = false) {
    const origin = method === 'loadCodeAssist' || method === 'retrieveUserQuotaSummary' ? accountUpstream : upstream;
    return this.request(origin + method, {
      method: 'POST', redirect: 'error', signal,
      headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json', accept: stream ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async read(response: Response): Promise<ProtocolJson> {
    if (response.ok) return record(await response.json());
    await response.body?.cancel();
    const message = response.status === 403 ? 'Google 拒绝访问此订阅。'
      : response.status === 429 ? 'Google AI 订阅请求达到上游限额。' : '无法读取 Google AI 订阅。';
    throw new ModelAccessError('google_ai_upstream_' + response.status, message, response.status);
  }

  private async project(accessToken: string, signal: AbortSignal) {
    const data = await this.read(await this.post('loadCodeAssist', { metadata: { ideType: 'ANTIGRAVITY' } }, accessToken, signal));
    const project = string(data.cloudaicompanionProject);
    if (!project) throw new ModelAccessError('google_ai_entitlement_missing', 'Google 未返回此账号的 Antigravity 项目。', 403);
    return project;
  }

  private async catalog(accessToken: string, project: string, signal: AbortSignal) {
    const data = await this.read(await this.post('fetchAvailableModels', { project }, accessToken, signal));
    return Object.entries(record(data.models)).flatMap(([id, raw]) => {
      const model = record(raw), label = string(model.displayName);
      if (!label || model.disabled === true || model.isEnabled === false || !/^(gemini|claude|gpt)[-_.]/i.test(id) || /image|embedding/i.test(id)) return [];
      return [{ id, label, images: model.supportsImages === true, tools: model.supportsTools !== false }];
    });
  }

  private async quota(accessToken: string, project: string): Promise<ModelQuotaObservation> {
    const observedAt = new Date().toISOString();
    try {
      const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(5_000)]);
      const data = await this.read(await this.post('retrieveUserQuotaSummary', { project }, accessToken, signal));
      const groups: unknown[] = Array.isArray(data.groups) ? data.groups : [];
      const windows = groups.flatMap(raw => {
        const group = record(raw), label = string(group.displayName);
        const buckets: unknown[] = Array.isArray(group.buckets) ? group.buckets : [];
        return buckets.flatMap(rawBucket => {
          const bucket = record(rawBucket), id = string(bucket.bucketId), name = string(bucket.displayName);
          const fraction = bucket.remainingFraction, resetTime = string(bucket.resetTime);
          if (!id || !label || !name || typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return [];
          const duration = bucket.window === 'weekly' ? 604800 : bucket.window === '5h' ? 18000 : undefined;
          return [{
            id, label: label + ' · ' + name, remainingPercent: Number((fraction * 100).toFixed(2)),
            ...(resetTime && Number.isFinite(Date.parse(resetTime)) ? { resetsAt: resetTime } : {}),
            ...(duration ? { limitWindowSeconds: duration } : {}),
          }];
        });
      });
      return { available: windows.length > 0, observedAt, ...(windows.length ? { windows } : {}) };
    } catch {
      return { available: false, observedAt };
    }
  }

  async inspect(): Promise<ModelProviderObservation> {
    try {
      const credential = await this.credential();
      if (!credential) return { status: 'not-authenticated', models: [] };
      const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15_000)]);
      const project = await this.project(credential.accessToken, signal);
      const [models, quota] = await Promise.all([
        this.catalog(credential.accessToken, project, signal),
        this.quota(credential.accessToken, project),
      ]);
      const identity = await this.identity();
      if (identity !== credential.accountId) throw new Error('google_ai_identity_changed');
      return { status: models.length ? 'ready' : 'failed', models, identity, quota, ...(!models.length && { diagnostic: 'Google 未返回可用模型。' }) };
    } catch (error) {
      return { status: error instanceof ModelAccessError && error.status === 401 ? 'expired' : 'failed', models: [], diagnostic: error instanceof ModelAccessError ? error.message : 'Google AI 订阅检查失败。' };
    }
  }

  async beginLogin(update: (observation: LoginObservation) => void) {
    await this.cancelLogin();
    if (!this.clientId) {
      update({ state: 'failed', diagnostic: '尚未配置 Google AI 订阅 OAuth 客户端（BUILDR_GOOGLE_AI_OAUTH_CLIENT_ID）。' });
      return;
    }
    const clientId = this.clientId, attempt = new AbortController();
    this.login = attempt;
    let finish!: () => void;
    this.loginFinished = new Promise<void>(resolve => { finish = resolve; });
    let callback: Awaited<ReturnType<typeof beginPkce>> | undefined;
    try {
      const previous = await this.account.read();
      callback = await beginPkce({
        port: this.options.callbackPort ?? 0,
        signal: attempt.signal,
        authorization: ({ challenge, redirectUri, state }) => {
          const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256', scope: scopes.join(' '), access_type: 'offline', prompt: 'consent' }).toString();
          return url.href;
        },
      });
      attempt.signal.throwIfAborted();
      update({ state: 'waiting-browser', url: callback.url });
      const code = await callback.result;
      update({ state: 'checking' });
      const credential = await this.token({ grant_type: 'authorization_code', code, redirect_uri: callback.redirectUri, code_verifier: callback.verifier }, attempt.signal);
      const signal = AbortSignal.any([attempt.signal, AbortSignal.timeout(15_000)]);
      const user = await this.read(await this.request('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + credential.accessToken }, redirect: 'error', signal }));
      const subject = string(user.sub);
      if (!subject || !credential.refreshToken) throw new ModelAccessError('google_ai_identity_missing', 'Google 未返回账号身份或离线授权。', 401);
      const project = await this.project(credential.accessToken, signal);
      if (!(await this.catalog(credential.accessToken, project, signal)).length) throw new ModelAccessError('google_ai_catalog_empty', 'Google 未返回可用订阅模型。', 403);
      signal.throwIfAborted();
      await this.account.save({ ...credential, accountId: 'google-ai:' + createHash('sha256').update(subject).digest('hex') }, previous?.revision);
      if (this.login === attempt) update({ state: 'completed' });
    } catch (error) {
      if (this.login === attempt) update(attempt.signal.aborted ? { state: 'cancelled' }
        : { state: 'failed', diagnostic: error instanceof ModelAccessError ? error.message : 'Google AI 授权未完成。' });
    } finally {
      try { await callback?.close(); }
      finally {
        if (this.login === attempt) {
          this.login = undefined;
          this.loginFinished = undefined;
        }
        finish();
      }
    }
  }

  async cancelLogin() {
    this.login?.abort();
    await this.loginFinished;
  }

  async infer(input: ProviderInferenceInput): Promise<Response> {
    const credential = await this.credential();
    if (!credential) return Response.json({ error: { code: 'google_ai_login_required' } }, { status: 401 });
    if (!credential.accountId || input.providerIdentity !== createHash('sha256').update(credential.accountId).digest('hex')) throw new ModelAccessError('model_account_identity_changed', 'Google AI 账号已变化。', 409);
    const signal = AbortSignal.any([this.lifetime.signal, input.signal]);
    const project = await this.project(credential.accessToken, AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
    const { model: _model, stream, service_tier: _serviceTier, ...request } = input.body;
    const response = await this.post(stream ? 'streamGenerateContent?alt=sse' : 'generateContent', {
      project, model: input.modelId, requestId: input.context.requestId, requestType: 'agent',
      request: { ...request, sessionId: input.context.conversationId },
    }, credential.accessToken, signal, stream === true);
    if (!response.ok) {
      await response.body?.cancel();
      return Response.json({ error: { code: 'google_ai_upstream_' + response.status } }, { status: response.status });
    }
    if (!stream) {
      const data = record(await response.json());
      return Response.json(data.response ?? data);
    }
    return new Response(response.body, { headers: { 'content-type': 'text/event-stream', 'x-buildr-gemini-envelope': 'cloud-code' } });
  }

  async close() { this.lifetime.abort(); await this.cancelLogin(); }
}
