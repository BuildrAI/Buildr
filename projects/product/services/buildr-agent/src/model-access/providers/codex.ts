import type { LoginObservation } from '../../contracts.ts';
import type { ModelProvider, ModelProviderRuntime, ModelProviderObservation, ModelOffering, ProviderInferenceInput, ProtocolJson } from '../contracts.ts';
import { PrivateAccount, beginPkce, record, string, positive, type CredentialRecord } from './private-account.ts';

const AUTH = 'https://auth.openai.com', BASE = 'https://chatgpt.com/backend-api', CLIENT = 'app_EMoamEEZ73f0CkXaXp7hrann', VERSION = '0.163.0';
export interface CodexProviderOptions { fetch?: typeof fetch; callbackPort?: number; loginTimeoutMs?: number; }
/** Explicit model-account login. Never reads ~/.codex or the desktop credential store. */
export function createCodexModelProvider(options: CodexProviderOptions = {}): ModelProvider { return { id: 'codex', label: 'Codex / ChatGPT', async open(input) { return new CodexRuntime(new PrivateAccount(input.configRoot), options); } }; }
class CodexRuntime implements ModelProviderRuntime {
  readonly protocol = 'responses' as const;
  private account: PrivateAccount; private options: CodexProviderOptions; private fetch: typeof fetch;
  private lifetime = new AbortController(); private login?: { controller: AbortController; close?(): Promise<void> }; private refreshing?: Promise<CredentialRecord>;
  private catalog = new Map<string, ModelOffering>();
  constructor(account: PrivateAccount, options: CodexProviderOptions) { this.account = account; this.options = options; this.fetch = options.fetch ?? fetch; }
  private headers(credential: CredentialRecord): Record<string, string> { return { authorization: `Bearer ${credential.accessToken}`, ...(credential.accountId ? { 'chatgpt-account-id': credential.accountId } : {}), originator: 'codex_cli_rs', 'user-agent': `codex_cli_rs/${VERSION}`, 'openai-beta': 'responses=experimental', 'openai-version': VERSION }; }
  private async credential(force = false): Promise<CredentialRecord | undefined> {
    const current = await this.account.read(); if (!current) return undefined;
    if (!force && (!current.expiresAt || current.expiresAt > Date.now() + 60000)) return current;
    if (this.refreshing) return this.refreshing;
    const work = (async () => {
      if (!current.refreshToken) throw new Error('model_codex_login_expired');
      const response = await this.fetch(AUTH + '/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json', originator: 'codex_cli_rs' }, body: JSON.stringify({ grant_type: 'refresh_token', client_id: CLIENT, refresh_token: current.refreshToken }), redirect: 'error', signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('model_codex_login_expired'); }
      const next = tokenRecord(record(await response.json()), current);
      try { return await this.account.save(next, current.revision); }
      catch (error) { const replacement = await this.account.read(); if (replacement && replacement.revision !== current.revision) return replacement; throw error; }
    })();
    this.refreshing = work; try { return await work; } finally { if (this.refreshing === work) this.refreshing = undefined; }
  }
  private async request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
    const credential = await this.credential(); if (!credential) return Response.json({ error: { code: 'model_login_required' } }, { status: 401 });
    const send = (value: CredentialRecord) => this.fetch(BASE + path, { ...init, headers: { ...this.headers(value), ...Object.fromEntries(new Headers(init.headers)) }, redirect: 'error', signal: AbortSignal.any([this.lifetime.signal, signal ?? AbortSignal.timeout(15000)]) });
    let response = await send(credential);
    if (response.status === 401 && credential.refreshToken) { await response.body?.cancel(); const fresh = await this.credential(true); if (fresh) response = await send(fresh); }
    return response;
  }
  async inspect(): Promise<ModelProviderObservation> {
    try {
      const credential = await this.credential(); if (!credential) return { status: 'not-authenticated', models: [] };
      const response = await this.request(`/codex/models?client_version=${VERSION}`);
      if (response.status === 401) { await response.body?.cancel(); return { status: 'expired', models: [], diagnostic: 'model_codex_login_expired' }; }
      if (!response.ok) { await response.body?.cancel(); throw new Error('model_codex_catalog_failed'); }
      const data = record(await response.json());
      const models = (Array.isArray(data.models) ? data.models : []).flatMap(value => {
        const row = record(value), id = string(row.slug) ?? string(row.id); if (!id || row.visibility === 'hide' || row.hidden === true) return [];
        const efforts = (Array.isArray(row.supported_reasoning_levels) ? row.supported_reasoning_levels : []).flatMap(value => { const level = record(value), effort = string(level.effort) ?? string(value); return effort ? [{ id: effort, label: string(level.description) ?? effort }] : []; });
        return [{ id, label: string(row.display_name) ?? id, images: Array.isArray(row.input_modalities) ? row.input_modalities.includes('image') : row.supports_image === true, tools: true, ...(positive(row.context_window) ? { contextWindow: positive(row.context_window) } : {}), ...(efforts.length ? { reasoningEfforts: efforts } : {}), ...(string(row.default_reasoning_level) ? { defaultReasoningEffort: string(row.default_reasoning_level) } : {}) } satisfies ModelOffering];
      });
      this.catalog = new Map(models.map(model => [model.id, model]));
      let quota: ModelProviderObservation['quota'] = { available: false, observedAt: new Date().toISOString() };
      try {
        const response = await this.request('/wham/usage');
        if (response.ok) {
          const data = record(await response.json()), limits = record(data.rate_limit), windows = [record(limits.primary_window), record(limits.secondary_window)];
          const reported = windows.flatMap(window => typeof window.used_percent === 'number' && window.used_percent >= 0 && window.used_percent <= 100 ? [{ remaining: 100 - window.used_percent, reset: typeof window.reset_at === 'number' ? window.reset_at : undefined }] : []);
          const tightest = reported.sort((a, b) => a.remaining - b.remaining)[0];
          if (tightest) quota = { available: true, observedAt: new Date().toISOString(), remainingPercent: tightest.remaining, ...(tightest.reset ? { resetsAt: new Date(tightest.reset * 1000).toISOString() } : {}), summary: 'ChatGPT 套餐上游报告额度' };
        } else await response.body?.cancel();
      } catch { /* Quota observation cannot invalidate an otherwise usable source. */ }
      return { status: models.length ? 'ready' : 'failed', label: 'Codex / ChatGPT', models, quota, ...(!models.length ? { diagnostic: 'model_codex_catalog_empty' } : {}) };
    } catch (error) { return { status: (error as Error).message === 'model_codex_login_expired' ? 'expired' : 'failed', models: [], diagnostic: (error as Error).message === 'model_codex_login_expired' ? 'model_codex_login_expired' : 'model_codex_observation_failed' }; }
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    await this.cancelLogin(); const active = { controller: new AbortController(), close: undefined as (() => Promise<void>) | undefined }; this.login = active; update({ state: 'initializing' });
    try {
      const previous = await this.account.read();
      const attempt = await beginPkce({ port: this.options.callbackPort ?? 1455, fallbackPort: this.options.callbackPort === undefined ? 1457 : 0, callbackHost: 'localhost', path: '/auth/callback', signal: active.controller.signal, timeoutMs: this.options.loginTimeoutMs, authorization({ challenge, state, redirectUri }) { const url = new URL('/oauth/authorize', AUTH); url.search = new URLSearchParams({ response_type: 'code', client_id: CLIENT, redirect_uri: redirectUri, scope: 'openid profile email offline_access', code_challenge: challenge, code_challenge_method: 'S256', state, id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', originator: 'codex_cli_rs' }).toString(); return url.href; } });
      active.close = attempt.close; if (this.login !== active) { await attempt.close(); return; }
      update({ state: 'waiting-browser', url: attempt.url }); const code = await attempt.result; active.controller.signal.throwIfAborted(); update({ state: 'checking' });
      const response = await this.fetch(AUTH + '/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', originator: 'codex_cli_rs' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: CLIENT, redirect_uri: attempt.redirectUri, code_verifier: attempt.verifier }).toString(), redirect: 'error', signal: AbortSignal.any([active.controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('model_codex_login_failed'); }
      const credential = tokenRecord(record(await response.json())); active.controller.signal.throwIfAborted(); await this.account.save(credential, previous?.revision);
      if (this.login !== active) return; const observation = await this.inspect(); if (this.login !== active) return;
      update(observation.status === 'ready' ? { state: 'completed' } : { state: 'failed', diagnostic: observation.diagnostic ?? 'model_codex_login_failed' });
    } catch (error) { if (this.login === active) update(active.controller.signal.aborted ? { state: 'cancelled' } : { state: (error as Error).message === 'model_login_expired' ? 'expired' : 'failed', diagnostic: 'model_codex_login_failed' }); }
    finally { await active.close?.(); if (this.login === active) this.login = undefined; }
  }
  async cancelLogin(): Promise<void> { const active = this.login; if (!active) return; active.controller.abort(); await active.close?.(); }
  async infer(input: ProviderInferenceInput): Promise<Response> {
    if (!this.catalog.has(input.modelId)) await this.inspect(); if (!this.catalog.has(input.modelId)) return Response.json({ error: { code: 'model_not_available' } }, { status: 404 });
    const body = codexBody(input.body, input.modelId);
    const response = await this.request('/codex/responses', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-codex-routing-hint': `model=${input.modelId}`, 'session_id': input.context.conversationId }, body: JSON.stringify(body) }, input.signal);
    if (!response.ok) { await response.body?.cancel(); return Response.json({ error: { code: response.status === 401 ? 'model_codex_login_expired' : 'model_codex_upstream_failed' } }, { status: response.status }); }
    if (input.body.stream === true) return response;
    return Response.json(await completedResponse(response, input.signal));
  }
  async close(): Promise<void> { this.lifetime.abort(); await this.cancelLogin(); }
}
function tokenRecord(data: ProtocolJson, fallback?: CredentialRecord): Omit<CredentialRecord, 'revision'> {
  const accessToken = string(data.access_token), refreshToken = string(data.refresh_token) ?? fallback?.refreshToken;
  const claims = jwt(string(data.id_token) ?? accessToken), accountId = string(record(claims['https://api.openai.com/auth']).chatgpt_account_id) ?? fallback?.accountId;
  const seconds = positive(data.expires_in), expiresAt = seconds ? Date.now() + seconds * 1000 : positive(jwt(accessToken).exp) ? Number(jwt(accessToken).exp) * 1000 : undefined;
  if (!accessToken || !accountId || !expiresAt) throw new Error('model_codex_token_invalid');
  return { accessToken, ...(refreshToken ? { refreshToken } : {}), accountId, expiresAt };
}
function jwt(token: string | undefined): ProtocolJson { try { return record(JSON.parse(Buffer.from(token?.split('.')[1] ?? '', 'base64url').toString('utf8'))); } catch { return {}; } }
/** SDK-generated output caps are negotiated away: this subscription route cannot set them. */
export function codexBody(input: ProtocolJson, model: string): ProtocolJson {
  const body: ProtocolJson = { ...input, model, store: false, stream: true };
  if (typeof body.input === 'string') body.input = [{ role: 'user', content: body.input }];
  if (!Array.isArray(body.input)) throw new Error('model_input_required');
  const leading: string[] = []; const items = [...body.input];
  while (items.length && ['system', 'developer'].includes(String(record(items[0]).role))) {
    const item = record(items.shift());
    if (typeof item.content === 'string') leading.push(item.content);
    else if (Array.isArray(item.content)) { for (const value of item.content) { const part = record(value); if (typeof part.text !== 'string') throw new Error('model_instruction_content_unsupported'); leading.push(part.text); } }
    else throw new Error('model_instruction_content_unsupported');
  }
  body.instructions = [typeof body.instructions === 'string' ? body.instructions : '', ...leading].filter(Boolean).join('\n\n'); body.input = items;
  delete body.max_output_tokens; delete body.prompt_cache_retention; delete body.prompt_cache_options;
  if (!Array.isArray(body.include)) body.include = ['reasoning.encrypted_content'];
  return body;
}
async function completedResponse(response: Response, signal: AbortSignal): Promise<ProtocolJson> {
  if (!response.body) throw new Error('model_codex_empty_response'); const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', completed: ProtocolJson | undefined;
  const abort = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true }); if (buffer.length > 16 * 1024 * 1024) throw new Error('model_codex_event_too_large');
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue; const event = record(JSON.parse(data));
        if (event.type === 'response.failed' || event.type === 'error') throw new Error('model_codex_generation_failed');
        if (event.type === 'response.completed') completed = record(event.response);
      }
    }
    if (!completed || completed.status !== 'completed') throw new Error('model_codex_stream_incomplete'); return completed;
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
