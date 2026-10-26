import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDevinModelProvider } from '../../src/model-access/providers/devin.ts';
import { createCodexModelProvider, codexBody } from '../../src/model-access/providers/codex.ts';
import { createDeepSeekModelProvider } from '../../src/model-access/providers/deepseek.ts';
import { fields, allBytes, text, integer, stringField, bytesField, intField, connectFrame, splitFrames } from '../../src/model-access/providers/devin-codec.ts';
import { PrivateAccount } from '../../src/model-access/providers/private-account.ts';
import type { ModelProviderRuntime, ProviderInferenceInput } from '../../src/model-access/contracts.ts';
import type { LoginObservation } from '../../src/contracts.ts';
import { translateRequest, translateResponse } from '../../src/model-access/protocols.ts';

const sourceContext = { accountId: 'account', agentId: 'dsh', conversationId: 'one', runId: 'run', requestId: 'request' };
const input = (body: Record<string, unknown>, modelId = 'test', signal = new AbortController().signal): ProviderInferenceInput => ({ body, modelId, signal, context: sourceContext });
const opaque = { encode(value: Record<string, unknown>) { return 'buildr-v1.' + Buffer.from(JSON.stringify(value)).toString('base64url'); }, decode(value: string) { return JSON.parse(Buffer.from(value.slice(10), 'base64url').toString('utf8')) as Record<string, unknown>; } };
function modelFixture(): Buffer {
  return Buffer.concat(['low', 'high'].map((effort, index) => bytesField(1, Buffer.concat([stringField(1, `Test ${effort}`), intField(5, 1), stringField(22, `test-${effort}`), bytesField(23, Buffer.concat([intField(4, 16000), intField(13, 4000), stringField(23, 'test')])), ...(index === 1 ? [intField(31, 1)] : [])]))));
}
function statusFixture(): Buffer {
  const plan = Buffer.concat([stringField(2, 'Pro'), bytesField(33, intField(2, 1))]);
  return Buffer.concat([bytesField(1, Buffer.concat([stringField(7, 'test@example.invalid'), bytesField(13, Buffer.concat([bytesField(1, plan), intField(14, 80), intField(15, 60), intField(18, 1800000000)]))])), bytesField(2, plan)]);
}
function responseFrames(chunks: Buffer[], trailer = '{}'): Buffer { return Buffer.concat([...chunks.map(value => connectFrame(value)), connectFrame(Buffer.from(trailer), true, false)]); }
async function login(runtime: ModelProviderRuntime, provider: 'devin' | 'codex' = 'devin'): Promise<LoginObservation[]> {
  const observations: LoginObservation[] = []; let waiting!: (url: string) => void;
  const urlPromise = new Promise<string>(resolve => { waiting = resolve; });
  const pending = runtime.beginLogin(value => { observations.push(value); if (value.state === 'waiting-browser' && value.url) waiting(value.url); });
  const authorization = new URL(await urlPromise), challenge = authorization.searchParams.get('code_challenge'); assert.equal(challenge?.length, 43);
  assert.equal(authorization.hostname, provider === 'devin' ? 'app.devin.ai' : 'auth.openai.com');
  const callback = new URL(authorization.searchParams.get('redirect_uri')!); callback.hostname = '127.0.0.1';
  callback.search = new URLSearchParams({ code: 'test-authorization-code', state: authorization.searchParams.get('state')! }).toString();
  const invalid = new URL(callback); invalid.searchParams.set('state', 'wrong'); assert.equal((await fetch(invalid)).status, 400);
  assert.equal((await fetch(callback)).status, 200); await pending; assert.equal(observations.at(-1)?.state, 'completed'); return observations;
}
async function devinFixture(t: test.TestContext, chat: (init: RequestInit) => Response | Promise<Response>) {
  const root = await mkdtemp(join(tmpdir(), 'buildr-devin-source-')); let exchanges = 0;
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url);
    if (target === 'https://api.devin.ai/auth/cli/token') {
      const body = JSON.parse(String(init.body)); assert.equal(body.code, 'test-authorization-code'); assert.equal(body.code_verifier.length, 43); exchanges++; return Response.json({ token: 'private-test-token' });
    }
    if (target.endsWith('/GetCliModelConfigs')) return new Response(new Uint8Array(modelFixture()));
    if (target.endsWith('/GetUserStatus')) return new Response(new Uint8Array(statusFixture()));
    if (target.endsWith('/GetChatMessage')) return chat(init);
    throw new Error('unexpected_test_network');
  };
  const runtime = await createDevinModelProvider({ fetch: mock, callbackPort: 0 }).open({ accountId: 'account', configRoot: root, environment: {} });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal((await runtime.inspect()).status, 'not-authenticated'); await login(runtime); assert.equal(exchanges, 1);
  return { runtime, root };
}

test('Devin login uses real PKCE callback; dynamic catalog and observed quota never expose credentials', { timeout: 10000 }, async t => {
  const { runtime, root } = await devinFixture(t, () => { throw new Error('must not infer'); });
  const view = await runtime.inspect(); assert.equal(view.status, 'ready'); assert.equal(view.models.length, 1);
  assert.deepEqual(view.models[0]?.reasoningEfforts?.map(value => value.id), ['low', 'high']); assert.equal(view.models[0]?.defaultReasoningEffort, 'high');
  assert.deepEqual(view.quota?.windows?.map(window=>window.remainingPercent),[80,60]);assert.equal(view.quota?.planLabel,'Pro');assert.equal(view.quota?.remainingPercent, 60); assert.equal(view.quota?.resetsAt, '2027-01-15T08:00:00.000Z'); assert.ok(!JSON.stringify(view).includes('private-test-token'));
  if (process.platform !== 'win32') assert.equal((await stat(join(root, 'model-credential.json'))).mode & 0o777, 0o600);
});

test('Devin maps images, thinking, tool schemas/results and isolated conversation identity to protobuf', { timeout: 10000 }, async t => {
  const requests: Buffer[] = [];
  const { runtime } = await devinFixture(t, init => {
    const frame = splitFrames(new Uint8Array(init.body as Uint8Array)).frames[0]!; requests.push(frame.payload);
    const tool = Buffer.concat([stringField(1, 'call-one'), stringField(2, 'read_file'), stringField(3, '{"path":')]);
    const toolTail = Buffer.concat([stringField(1, 'call-one'), stringField(3, '{"path":"a.ts"}')]);
    const deltas = [stringField(9, 'checking'), bytesField(6, tool), bytesField(6, toolTail), intField(5, 10)];
    return new Response(new Uint8Array(responseFrames(deltas)));
  });
  const body = { messages: [{ role: 'system', content: 'instructions' }, { role: 'user', content: [{ type: 'text', text: 'inspect' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] }, { role: 'assistant', content: null, reasoning_content: 'prior thought', reasoning_signature: Buffer.from([0, 255]).toString('base64'), tool_calls: [{ id: 'previous', type: 'function', function: { name: 'read_file', arguments: '{"path":"old"}' } }] }, { role: 'tool', tool_call_id: 'previous', content: 'prior result' }], tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }], reasoning_effort: 'low' };
  const result = await (await runtime.infer(input(body))).json();
  assert.equal(result.choices[0].finish_reason, 'tool_calls'); assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"path":"a.ts"}'); assert.equal(result.choices[0].message.reasoning_content, 'checking');
  const request = fields(requests[0]!); assert.equal(text(request, 21), 'test-low'); assert.equal(text(request, 2), 'instructions');
  const prompts = allBytes(request, 3).map(fields); assert.equal(prompts.length, 3); assert.equal(integer(prompts[0]!, 2), 1);
  const image = fields(allBytes(prompts[0]!, 10)[0]!); assert.equal(text(image, 1), 'aGVsbG8=');
  assert.deepEqual(allBytes(prompts[1]!, 12)[0], Buffer.from([0, 255])); assert.equal(text(prompts[2]!, 7), 'previous');
  const tool = fields(allBytes(request, 10)[0]!); assert.equal(text(tool, 1), 'read_file'); assert.deepEqual(JSON.parse(text(tool, 3)!), body.tools[0]!.function.parameters);
  const other = input(body); other.context = { ...sourceContext, conversationId: 'two' }; await (await runtime.infer(other)).json();
  assert.notEqual(text(request, 16), text(fields(requests[1]!), 16));
});

test('Devin streaming converts cumulative tool parameters to deltas and fails truncated or error trailers', { timeout: 10000 }, async t => {
  let mode: 'ok' | 'truncated' | 'error' = 'ok';
  const { runtime } = await devinFixture(t, () => {
    const chunks = [stringField(9, 'thinking'), bytesField(10, Buffer.from([0, 255])), bytesField(10, Buffer.from([128, 1])), bytesField(6, Buffer.concat([stringField(1, 'call'), stringField(2, 'tool'), stringField(3, '{"x":')])), bytesField(6, Buffer.concat([stringField(1, 'call'), stringField(3, '{"x":1}')])), intField(5, 10)];
    const bytes = mode === 'truncated' ? connectFrame(chunks[0]!) : responseFrames(chunks, mode === 'error' ? '{"error":{"code":"resource_exhausted","message":"quota"}}' : '{}');
    return new Response(new Uint8Array(bytes));
  });
  const body = { messages: [{ role: 'user', content: 'test' }], stream: true };
  const stream = await (await runtime.infer(input(body))).text(); const events = stream.split('\n\n').filter(value => value.startsWith('data: {')).map(value => JSON.parse(value.slice(6)));
  const args = events.flatMap(event => event.choices[0].delta.tool_calls ?? []).map(call => call.function.arguments ?? '').join(''); assert.equal(args, '{"x":1}'); assert.ok(stream.includes('[DONE]'));
  const signatures = events.flatMap(event => event.choices[0].delta.reasoning_signature ?? []); assert.deepEqual(signatures, [Buffer.from([0, 255, 128, 1]).toString('base64')]);
  assert.ok(events.findIndex(event => event.choices[0].delta.reasoning_signature) < events.findIndex(event => event.choices[0].delta.tool_calls));
  mode = 'truncated'; await assert.rejects(() => runtime.infer(input({ ...body, stream: false })).then(response => response.json()), /stream_truncated/);
  mode = 'error'; await assert.rejects(() => runtime.infer(input({ ...body, stream: false })).then(response => response.json()), /stream_failed/);
});

test('Devin caller cancellation aborts the real fetch signal and prevents completed output', { timeout: 10000 }, async t => {
  let aborted = false;
  const { runtime } = await devinFixture(t, init => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(connectFrame(stringField(3, 'hello')))); init.signal!.addEventListener('abort', () => { aborted = true; controller.error(new Error('upstream_aborted')); }); } })));
  const controller = new AbortController(); const response = await runtime.infer(input({ messages: [{ role: 'user', content: 'test' }], stream: true }, 'test', controller.signal));
  const reader = response.body!.getReader(); assert.equal((await reader.read()).done, false); controller.abort();
  await assert.rejects(async () => { while (!(await reader.read()).done) {} }); assert.equal(aborted, true);
});

test('private account compare-and-set preserves a newer login instead of stale refresh overwrite', async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-account-vault-')); t.after(() => rm(root, { recursive: true, force: true }));
  const account = new PrivateAccount(root); const first = await account.save({ accessToken: 'first' });
  const next = await account.save({ accessToken: 'new-login' }, first.revision);
  await assert.rejects(() => account.save({ accessToken: 'stale-refresh' }, first.revision), /credential_changed/);
  assert.equal((await account.read())?.revision, next.revision); assert.ok((await readFile(join(root, 'model-credential.json'), 'utf8')).includes('new-login'));
});

test('Codex explicit login, dynamic catalog and Responses negotiation work without desktop credentials', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-codex-source-')); const requests: Record<string, unknown>[] = [];
  const claims = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'upstream-account' } })).toString('base64url');
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/oauth/token')) { const params = new URLSearchParams(String(init.body)); assert.equal(params.get('code'), 'test-authorization-code'); assert.equal(createHash('sha256').update(params.get('code_verifier')!).digest('base64url').length, 43); return Response.json({ access_token: 'private-codex-token', refresh_token: 'private-refresh', id_token: `header.${claims}.signature`, expires_in: 3600 }); }
    if (target.includes('/codex/models')) return Response.json({ models: [{ slug: 'gpt-test', display_name: 'GPT Test', context_window: 100000, max_context_window:1000000, input_modalities: ['text', 'image'], supported_reasoning_levels: [{ effort: 'high', description: 'High' }] }] });
    if (target.endsWith('/wham/usage')) return Response.json({ rate_limit: { primary_window: { used_percent: 25 } } });
    if (target.endsWith('/codex/responses')) { assert.equal(new Headers(init.headers).get('chatgpt-account-id'), 'upstream-account'); requests.push(JSON.parse(String(init.body))); return new Response('event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"ok"}]}]}}\n\n', { headers: { 'content-type': 'text/event-stream' } }); }
    throw new Error('unexpected_test_network');
  };
  const runtime = await createCodexModelProvider({ fetch: mock, callbackPort: 0 }).open({ accountId: 'account', configRoot: root, environment: {} });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  await login(runtime, 'codex'); const view = await runtime.inspect(); assert.equal(view.quota?.remainingPercent, 75);assert.equal(view.models[0]?.contextWindow,100000);assert.equal(view.models[0]?.reportedContextWindow,1000000); assert.equal(view.models[0]?.maxOutputTokens, undefined);
  const translated = translateRequest({ system: 'system', messages: [{ role: 'user', content: 'hello' }], max_tokens: 4096, tools: [{ name: 'read_file', input_schema: { type: 'object' } }], tool_choice: { type: 'auto' } }, 'anthropic-messages', 'responses', opaque);
  const result = await (await runtime.infer(input(translated, 'gpt-test'))).json();
  assert.equal(result.status, 'completed'); assert.equal(requests[0]!.instructions, 'system'); assert.equal(requests[0]!.max_output_tokens, undefined); assert.equal(requests[0]!.store, false); assert.equal(requests[0]!.stream, true);
  assert.deepEqual(requests[0]!.tools, [{ type: 'function', name: 'read_file', description: undefined, parameters: { type: 'object' } }].map(value => JSON.parse(JSON.stringify(value))));
  assert.ok(!JSON.stringify(view).includes('private-codex-token'));
});

test('Codex Responses consumer completes a two-turn Devin tool loop through the real protocol translators', { timeout: 10000 }, async t => {
  const captured: Buffer[] = [];
  const { runtime } = await devinFixture(t, init => {
    captured.push(splitFrames(new Uint8Array(init.body as Uint8Array)).frames[0]!.payload);
    return new Response(new Uint8Array(responseFrames(captured.length === 1 ? [bytesField(6, Buffer.concat([stringField(1, 'read-call'), stringField(2, 'read_file'), stringField(3, '{"path":"a.ts"}')])), intField(5, 10)] : [stringField(3, 'done'), intField(5, 1)])));
  });
  const request = { model: 'consumer-route', input: [{ role: 'user', content: 'inspect file' }], tools: [{ type: 'function', name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }] };
  const body = translateRequest(request, 'responses', 'chat-completions', opaque);
  const first = await runtime.infer(input(body));
  const exposed = await (await translateResponse(first, 'chat-completions', 'responses', { model: 'consumer-route', stream: false, request, opaque, signal: new AbortController().signal })).json();
  const call = exposed.output.find((value: Record<string, unknown>) => value.type === 'function_call'); assert.equal(call.call_id, 'read-call'); assert.equal(call.name, 'read_file');
  const next = { ...request, input: [...request.input, ...exposed.output, { type: 'function_call_output', call_id: call.call_id, output: 'file contents' }] };
  const secondInput = input(translateRequest(next, 'responses', 'chat-completions', opaque)); secondInput.context = { ...sourceContext, requestId: 'request-two' };
  const second = await runtime.infer(secondInput);
  const final = await (await translateResponse(second, 'chat-completions', 'responses', { model: 'consumer-route', stream: false, request: next, opaque, signal: new AbortController().signal })).json();
  assert.equal(final.output[0].content[0].text, 'done');
  const prompts = allBytes(fields(captured[1]!), 3).map(fields), result = prompts.find(value => integer(value, 2) === 4)!;
  assert.equal(text(result, 7), 'read-call'); assert.equal(text(result, 3), 'file contents'); assert.equal(text(fields(captured[0]!), 16), text(fields(captured[1]!), 16)); assert.notEqual(text(fields(captured[0]!), 22), text(fields(captured[1]!), 22));
});

test('DeepSeek source delegates native login and raw inference to its sole owner', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = []; let closed = false, logged = false;
  const runtime = await createDeepSeekModelProvider({ ownerFactory: () => ({
    async inspect() { return { status: logged ? 'ready' : 'not-authenticated', label: 'DeepSeek account' }; },
    async beginLogin(update) { update({ state: 'waiting-browser', url: 'https://accounts.deepseek.com/login' }); logged = true; update({ state: 'completed' }); }, async cancelLogin() {},
    async request(url, init = {}) { requests.push({ url, init }); return url.endsWith('/models') ? Response.json({ data: [{ id: 'deepseek-test', name: 'DeepSeek test', effort: {supported_levels:['low','high','max'],default_level:'high'}, api_capabilities: { anthropic_messages: {} }, context_window: 100000, max_output_tokens: 5000, input_modalities: ['text', 'image'] }] }) : Response.json({ type: 'message', content: [{ type: 'text', text: 'ok' }] }); }, async close() { closed = true; },
  }) }).open({ accountId: 'account', configRoot: '/unused-private-test-profile', environment: {} });
  const events: LoginObservation[] = []; await runtime.beginLogin(value => events.push(value)); assert.equal(events.at(-1)?.state, 'completed');
  const view = await runtime.inspect(); assert.equal(view.quota?.available, false); assert.equal(view.models[0]?.images, true); assert.deepEqual(view.models[0]?.reasoningEfforts?.map(effort=>effort.id),['low','high','max']); assert.equal(view.models[0]?.defaultReasoningEffort,'high');
  const body = { messages: [{ role: 'user', content: 'test' }], max_tokens: 100 }; await runtime.infer(input(body, 'deepseek-test'));
  assert.equal(requests.at(-1)?.url, 'https://api.deepseek.com/anthropic/v1/messages'); assert.deepEqual(JSON.parse(String(requests.at(-1)?.init.body)), { ...body, model: 'deepseek-test' });
  assert.equal(new Headers(requests.at(-1)?.init.headers).has('x-dsh-auth-token'), false); await runtime.close(); assert.equal(closed, true);
});
