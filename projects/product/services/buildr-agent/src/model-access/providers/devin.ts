import { randomUUID } from 'node:crypto';
import type { LoginObservation } from '../../contracts.ts';
import type { ModelProvider, ModelProviderRuntime, ModelProviderObservation, ProviderInferenceInput, ProtocolJson } from '../contracts.ts';
import { PrivateAccount, beginPkce, record, string } from './private-account.ts';
import { metadata, bytesField, decodeModels, decodeStatus, encodeRequest, connectFrame, splitFrames, unaryBody, decodeDelta, type DevinDelta } from './devin-codec.ts';
import { modelOfferings, buildDevinRequest, type DevinOffering } from './devin-wire.ts';
import { errorDiagnostic } from '../../domain/error-diagnostic.ts';
import { ModelAccessError } from '../contracts.ts';
import { modelFailure } from '../errors.ts';

const API = 'https://api.devin.ai', APP = 'https://app.devin.ai', SERVER = 'https://server.codeium.com';
const MODELS = '/exa.api_server_pb.ApiServerService/GetCliModelConfigs', STATUS = '/exa.seat_management_pb.SeatManagementService/GetUserStatus', CHAT = '/exa.api_server_pb.ApiServerService/GetChatMessage';
export interface DevinProviderOptions { fetch?: typeof fetch; callbackPort?: number; loginTimeoutMs?: number; }
export function createDevinModelProvider(options: DevinProviderOptions = {}): ModelProvider {
  return { id: 'devin', label: 'Devin', async open(input) { return new DevinRuntime(new PrivateAccount(input.configRoot), options); } };
}
class DevinRuntime implements ModelProviderRuntime {
  readonly protocol = 'chat-completions' as const;
  private fetch: typeof fetch;
  private offerings = new Map<string, DevinOffering>();
  private login?: { controller: AbortController; close?(): Promise<void> };
  private lifetime = new AbortController();
  private account: PrivateAccount;
  private options: DevinProviderOptions;
  constructor(account: PrivateAccount, options: DevinProviderOptions) { this.account = account; this.options = options; this.fetch = options.fetch ?? fetch; }
  private async unary(path: string, token: string): Promise<Response> {
    return this.fetch(SERVER + path, { method: 'POST', headers: { 'content-type': 'application/proto', 'connect-protocol-version': '1', authorization: basic(token) }, body: new Uint8Array(bytesField(1, metadata(token))), signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]), redirect: 'error' });
  }
  async inspect(): Promise<ModelProviderObservation> {
    const credential = await this.account.read(); if (!credential) return { status: 'not-authenticated', models: [] };
    try {
      const [modelsResponse, statusResponse] = await Promise.all([this.unary(MODELS, credential.accessToken), this.unary(STATUS, credential.accessToken)]);
      if ([modelsResponse.status, statusResponse.status].some(status => status === 401)) { await Promise.all([modelsResponse.body?.cancel(), statusResponse.body?.cancel()]); this.offerings.clear(); return { status: 'expired', models: [], diagnostic: 'model_devin_login_expired' }; }
      if (!modelsResponse.ok) { await Promise.all([modelsResponse.body?.cancel(), statusResponse.body?.cancel()]); throw new Error('model_devin_catalog_failed'); }
      const rows = decodeModels(unaryBody(await boundedBody(modelsResponse)));
      this.offerings = new Map(modelOfferings(rows).map(model => [model.id, model]));
      const status = statusResponse.ok ? decodeStatus(unaryBody(await boundedBody(statusResponse))) : undefined;
      if (!statusResponse.ok) await statusResponse.body?.cancel();
      const daily = percent(status?.daily), weekly = percent(status?.weekly);
      const remaining = [daily, weekly].filter((value): value is number => value !== undefined);
      const restrictiveDaily = daily !== undefined && (weekly === undefined || daily <= weekly);
      const reset = restrictiveDaily ? status?.dailyReset : status?.weeklyReset;
      return { status: status?.canUseCli === false ? 'failed' : 'ready', label: [status?.label ?? 'Devin', status?.plan].filter(Boolean).join(' · '), models: [...this.offerings.values()].map(({ variants, defaultUid, defaultTier, ...view }) => view), quota: { planLabel:status?.plan,windows:[...(daily===undefined?[]:[{id:'daily',label:'每日窗口',remainingPercent:daily,...(status?.dailyReset?{resetsAt:new Date(status.dailyReset*1000).toISOString()}:{})}]),...(weekly===undefined?[]:[{id:'weekly',label:'每周窗口',remainingPercent:weekly,...(status?.weeklyReset?{resetsAt:new Date(status.weeklyReset*1000).toISOString()}:{})}])],available: remaining.length > 0, observedAt: new Date().toISOString(), ...(remaining.length ? { remainingPercent: Math.min(...remaining) } : {}), ...(reset !== undefined && Number.isFinite(reset) ? { resetsAt: new Date(reset * 1000).toISOString() } : {}), summary: remaining.length ? `Devin${daily !== undefined ? ` · 日剩余 ${daily}%` : ''}${weekly !== undefined ? ` · 周剩余 ${weekly}%` : ''}` : 'Devin 当前未返回可读取额度' }, ...(status?.canUseCli === false ? { diagnostic: 'model_devin_cli_unavailable' } : {}) };
    } catch { return { status: 'failed', models: [], diagnostic: 'model_devin_observation_failed', quota: { available: false, observedAt: new Date().toISOString() } }; }
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    await this.cancelLogin(); this.lifetime.signal.throwIfAborted();
    const active = { controller: new AbortController(), close: undefined as (() => Promise<void>) | undefined }; this.login = active;
    update({ state: 'initializing' });
    try {
      const previous = await this.account.read();
      const attempt = await beginPkce({ port: this.options.callbackPort ?? 59653, signal: active.controller.signal, timeoutMs: this.options.loginTimeoutMs, authorization({ challenge, state, redirectUri }) { const url = new URL('/auth/cli/continue', APP); url.search = new URLSearchParams({ redirect_uri: redirectUri, state, prompt: 'select_account', cli_pkce_marker: '1', code_challenge: challenge, code_challenge_method: 'S256' }).toString(); return url.href; } });
      active.close = attempt.close; if (this.login !== active) { await attempt.close(); return; }
      update({ state: 'waiting-browser', url: attempt.url }); const code = await attempt.result;
      active.controller.signal.throwIfAborted(); update({ state: 'checking' });
      const response = await this.fetch(API + '/auth/cli/token', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ code, code_verifier: attempt.verifier, cli_pkce_marker: 1 }), redirect: 'error', signal: AbortSignal.any([active.controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('model_devin_login_failed'); }
      const data = record(await response.json()); const token = string(data.token);
      if (!token) throw new Error('model_devin_login_failed'); active.controller.signal.throwIfAborted();
      await this.account.save({ accessToken: token.startsWith('devin-session-token$') ? token : `devin-session-token$${token}` }, previous?.revision);
      if (this.login !== active) return;
      const observation = await this.inspect(); if (this.login !== active) return;
      update(observation.status === 'ready' && observation.models.length ? { state: 'completed' } : { state: 'failed', diagnostic: observation.diagnostic ?? 'model_devin_catalog_empty' });
    } catch (error) {
      if (this.login === active) update(active.controller.signal.aborted ? { state: 'cancelled' } : { state: (error as Error).message === 'model_login_expired' ? 'expired' : 'failed', diagnostic: 'model_devin_login_failed' });
    } finally { await active.close?.(); if (this.login === active) this.login = undefined; }
  }
  async cancelLogin(): Promise<void> { const active = this.login; if (!active) return; active.controller.abort(); await active.close?.(); }
  async infer(input: ProviderInferenceInput): Promise<Response> {
    const credential = await this.account.read(); if (!credential) return errorResponse('model_login_required', 401);
    if (!this.offerings.has(input.modelId)) await this.inspect(); const offering = this.offerings.get(input.modelId);
    if (!offering) return errorResponse('model_not_available', 404);
    const request = buildDevinRequest(input, offering, credential.accessToken);
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, input.signal, this.lifetime.signal]); signal.throwIfAborted();
    const response = await this.fetch(SERVER + CHAT, { method: 'POST', headers: { 'content-type': 'application/connect+proto', 'connect-protocol-version': '1', 'connect-content-encoding': 'gzip', 'connect-accept-encoding': 'gzip', 'accept-encoding': 'identity', authorization: basic(credential.accessToken) }, body: new Uint8Array(connectFrame(encodeRequest(request))), signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); return errorResponse(response.status === 401 ? 'model_devin_login_expired' : response.status === 429 ? 'model_devin_quota_or_rate_limit' : 'model_devin_upstream_failed', response.status); }
    const stage = Array.isArray(input.body.messages) && input.body.messages.some(message => record(message).role === 'tool') ? '工具结果接续 / 响应流' : '响应流';
    const deltas = readDeltas(response, signal, credential.accessToken, stage), state = new Completion(input.modelId);
    if (input.body.stream !== true) { for await (const delta of deltas) state.accept(delta); return Response.json(state.result()); }
    const encoder = new TextEncoder();
    // Keep an immediate upstream refusal as an HTTP error. Opening SSE first
    // makes native consumers mistake a permanent denial for a broken stream.
    let initial: ProtocolJson[] = [], ended = false;
    try {
      while (!initial.length) {
        const next = await deltas.next();
        if (next.done) { ended = true; break; }
        initial = state.accept(next.value);
      }
    } catch (error) {
      controller.abort(); await deltas.return(undefined);
      // These refusals describe this request, not an expired login or a transient
      // connection. Codex retries even HTTP 403; a bad request must remain final.
      if (error instanceof ModelAccessError && error.status === 403 && /MCP configuration issue|blocked by (?:our |the )?content policy/i.test(error.message)) throw new ModelAccessError('model_devin_request_rejected', error.message, 400);
      throw error;
    }
    async function* chunks(): AsyncGenerator<Uint8Array> {
      try {
        for (const value of initial) yield encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
        if (!ended) for await (const delta of deltas) for (const value of state.accept(delta)) yield encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
        yield encoder.encode(`data: ${JSON.stringify(state.finished())}\n\ndata: [DONE]\n\n`);
      } finally { controller.abort(); await deltas.return(undefined); }
    }
    const iterator = chunks();
    return new Response(new ReadableStream<Uint8Array>({ async pull(stream) { try { const next = await iterator.next(); if (next.done) stream.close(); else stream.enqueue(next.value); } catch (error) { stream.error(error); } }, async cancel() { controller.abort(); await iterator.return(undefined); } }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
  }
  async close(): Promise<void> { this.lifetime.abort(); await this.cancelLogin(); }
}
function basic(token: string): string { return `Basic ${Buffer.from(`${token}-${token}`).toString('base64')}`; }
function percent(value: number | undefined): number | undefined { return value !== undefined && value >= 0 && value <= 100 ? value : undefined; }
function errorResponse(code: string, status: number): Response { return Response.json({ error: { message: `Devin · 请求响应：HTTP ${status}（${code}）`, type: 'model_provider_error', code } }, { status: status >= 400 && status <= 599 ? status : 502 }); }
async function boundedBody(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error('model_devin_empty_response'); const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 16 * 1024 * 1024) throw new Error('model_devin_response_too_large'); chunks.push(next.value); } return Buffer.concat(chunks); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function* readDeltas(response: Response, signal: AbortSignal, token: string, stage: string): AsyncGenerator<DevinDelta> {
  if (!response.body) throw new Error('model_devin_empty_response'); const reader = response.body.getReader(); let buffered: Buffer = Buffer.alloc(0), ended = false, meaningful = false;
  const abort = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break;
      const split = splitFrames(Buffer.concat([buffered, next.value])); buffered = split.rest;
      for (const frame of split.frames) {
        if (ended) throw new Error('model_devin_frame_after_end');
        if (frame.end) {
          const trailer = record(JSON.parse(frame.payload.toString('utf8')));
          if (trailer.error) {
            const error = record(trailer.error), code = typeof error.code === 'string' && /^[a-z_]{1,64}$/.test(error.code) ? error.code : 'unknown';
            const message = errorDiagnostic(error.message, [token, token.replace(/^devin-session-token\$/, '')]);
            throw new ModelAccessError('model_devin_stream_failed', `Devin · ${stage}：${code}${message ? ': ' + message : ''}`, code === 'permission_denied' ? 403 : code === 'unauthenticated' ? 401 : code === 'resource_exhausted' ? 429 : 502);
          }
          ended = true; continue;
        }
        const delta = decodeDelta(frame.payload); if (delta.stop === 13) throw new Error('model_devin_generation_failed');
        meaningful ||= Boolean(delta.text || delta.thinking || delta.calls.length || delta.stop); yield delta;
      }
    }
    if (!ended || buffered.length) throw new Error('model_devin_stream_truncated');
    if (!meaningful) throw new Error('model_devin_empty_response');
  } catch (error) {
    if (signal.aborted || error instanceof ModelAccessError) throw error;
    const failure = modelFailure(error); throw new ModelAccessError(failure.code, `Devin · ${stage}：${failure.message}`, 502);
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
class Completion {
  private id = `chatcmpl-${randomUUID()}`; private created = Math.floor(Date.now() / 1000); private text = ''; private thinking = ''; private signature: Buffer = Buffer.alloc(0);
  private calls = new Map<string, { name: string; args: string; index: number }>(); private active?: string; private stop?: number; private usage?: DevinDelta['usage']; private roleSent = false; private signatureSent = false;
  private model: string;
  constructor(model: string) { this.model = model; }
  private chunk(delta: ProtocolJson, finish: string | null = null): ProtocolJson { return { id: this.id, object: 'chat.completion.chunk', created: this.created, model: this.model, choices: [{ index: 0, delta, finish_reason: finish }] }; }
  accept(delta: DevinDelta): ProtocolJson[] {
    const output: ProtocolJson[] = [];
    if (delta.thinking) { this.thinking += delta.thinking; output.push(this.chunk({ reasoning_content: delta.thinking })); }
    if (delta.signature?.length) { if (this.signatureSent) throw new Error('model_devin_multiple_signature_blocks'); this.signature = Buffer.concat([this.signature, delta.signature]); }
    if (this.signature.length && !this.signatureSent && (delta.text || delta.calls.length || delta.stop)) { output.push(this.chunk({ reasoning_signature: this.signature.toString('base64') })); this.signatureSent = true; }
    if (delta.text) { this.text += delta.text; output.push(this.chunk({ content: delta.text })); }
    for (const call of delta.calls) {
      const id = call.id ?? this.active; if (!id) throw new Error('model_devin_tool_id_missing'); this.active = id;
      const current = this.calls.get(id) ?? { name: '', args: '', index: this.calls.size }; const fn: ProtocolJson = {};
      if (call.name) { current.name = call.name; fn.name = call.name; }
      if (call.arguments !== undefined) { const tail = call.arguments.startsWith(current.args) ? call.arguments.slice(current.args.length) : call.arguments; current.args += tail; fn.arguments = tail; }
      this.calls.set(id, current); output.push(this.chunk({ tool_calls: [{ index: current.index, id, type: 'function', function: fn }] }));
    }
    if (delta.stop) this.stop = delta.stop; if (delta.usage) this.usage = delta.usage;
    if (output.length && !this.roleSent) { this.roleSent = true; output.unshift(this.chunk({ role: 'assistant' })); }
    return output;
  }
  private finish(): string { return this.calls.size || this.stop === 10 ? 'tool_calls' : this.stop === 3 ? 'length' : 'stop'; }
  private usageView(): ProtocolJson | undefined { return this.usage ? { prompt_tokens: this.usage.input, completion_tokens: this.usage.output, total_tokens: this.usage.input + this.usage.output, prompt_tokens_details: { cached_tokens: this.usage.cacheRead }, prompt_cache_write_tokens: this.usage.cacheWrite } : undefined; }
  finished(): ProtocolJson { return { ...this.chunk(this.signature.length && !this.signatureSent ? { reasoning_signature: this.signature.toString('base64') } : {}, this.finish()), ...(this.usage ? { usage: this.usageView() } : {}) }; }
  result(): ProtocolJson {
    return { id: this.id, object: 'chat.completion', created: this.created, model: this.model, choices: [{ index: 0, message: { role: 'assistant', content: this.text || null, ...(this.thinking ? { reasoning_content: this.thinking } : {}), ...(this.signature.length ? { reasoning_signature: this.signature.toString('base64') } : {}), ...(this.calls.size ? { tool_calls: [...this.calls].map(([id, value]) => ({ id, type: 'function', function: { name: value.name, arguments: value.args } })) } : {}) }, finish_reason: this.finish() }], ...(this.usage ? { usage: this.usageView() } : {}) };
  }
}
