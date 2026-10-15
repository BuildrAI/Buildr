import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once, EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createDesktopServer, type DesktopNativeServices } from '../../plugin/desktop-server.ts';
import { DesktopNavigation } from '../../plugin/desktop-navigation.ts';
import { DSH_DESKTOP_BRIDGE_SCHEMA, DSH_DESKTOP_BRIDGE_LIMITS, readDshDesktopDiscovery,
  type DshDesktopDiscovery, type DshDesktopFrame } from '../../../buildr/src/modules/agent-operations/contracts/dsh-desktop-bridge.ts';

async function fixture(t: TestContext, services: DesktopNativeServices, cancelTimeoutMs?: number) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-bridge-test-')));
  const navigation = new DesktopNavigation();
  const server = await createDesktopServer({ identity: { schemaVersion: DSH_DESKTOP_BRIDGE_SCHEMA, channel: 'released', profileKey: home,
    hostInstanceId: randomUUID(), hostPid: process.pid, dshVersion: '0.2.0-rc.2', pluginVersion: 'test', appPath: '/test/DSH.app', executable: '/test/DSH.app/cli/dsh' },
    navigation, resolveServices: () => services, buildrOrigin: async () => 'http://127.0.0.1:49100', cancelTimeoutMs });
  t.after(async () => { navigation.dispose(); await server.close(); fs.rmSync(home, { recursive: true, force: true }); });
  const discovery = readDshDesktopDiscovery(JSON.parse(fs.readFileSync(server.discoveryPath, 'utf8')));
  return { home, server, discovery };
}
async function client(discovery: DshDesktopDiscovery, authenticate = true) {
  const socket = net.createConnection(discovery.address), events = new EventEmitter();
  const frames: DshDesktopFrame[] = [];
  let buffer = '';
  socket.on('error', () => {});
  socket.on('data', data => { buffer += data.toString(); let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      frames.push(JSON.parse(line)); events.emit('frame'); }
  });
  await once(socket, 'connect');
  const send = (id: string, method: string, params?: unknown) => socket.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n');
  const next = async (id: string, type?: string): Promise<any> => {
    const deadline = AbortSignal.timeout(3000);
    for (;;) { const index = frames.findIndex(row => row.id === id && (!type || row.type === type));
      if (index >= 0) return frames.splice(index, 1)[0];
      await once(events, 'frame', { signal: deadline }); }
  };
  if (authenticate) { send('hello', 'hello', hello(discovery)); assert.equal((await next('hello')).type, 'result'); }
  return { socket, send, next, frames };
}
function hello(discovery: DshDesktopDiscovery) {
  return { schemaVersion: discovery.schemaVersion, channel: discovery.channel, profileKey: discovery.profileKey,
    hostInstanceId: discovery.hostInstanceId, credential: discovery.credential };
}
function native(calls: Record<string, unknown>[], options: { waiting?: Set<string>; aborted?: string[]; selection?: () => { provider: string; model: string; reasoningEffort?: string } } = {}): DesktopNativeServices {
  return { agentDefaultModel: { currentSelection: options.selection ?? (() => ({ provider: 'native', model: 'model-a', reasoningEffort: 'max' })) },
    llm: { async prepareCall(config, signal) {
      signal.throwIfAborted();
      return { config: { ...config }, async *stream(request: Record<string, unknown>) {
        calls.push(request);
        const prompt = (request.messages as any[])[0].content[0].text as string;
        if (options.waiting?.has(prompt)) {
          await new Promise<void>((_resolve, reject) => {
            const signal = request.signal as AbortSignal;
            const abort = () => { options.aborted?.push(prompt); reject(signal.reason); };
            if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
          });
        }
        yield { type: 'text-delta', text: '{"commitMessage":"generated"}' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      } };
    } } };
}
test('private discovery and handshake reject wrong credentials, host scope and unauthenticated work', async t => {
  const calls: Record<string, unknown>[] = [], { server, discovery } = await fixture(t, native(calls));
  assert.equal(fs.statSync(path.dirname(server.discoveryPath)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(server.discoveryPath).mode & 0o777, 0o600);
  for (const input of [undefined, { ...discovery, credential: '0'.repeat(64) }, { ...discovery, profileKey: '/other' }, { ...discovery, hostInstanceId: 'old' }]) {
    const c = await client(discovery, false); t.after(() => c.socket.destroy());
    c.send('invalid', input ? 'hello' : 'generate', input ? hello(input) : { prompt: 'secret', outputSchema: {} });
    assert.match((await c.next('invalid')).error.code, /^agent_dsh_authentication_/);
  }
  assert.equal(calls.length, 0);
  assert.throws(() => readDshDesktopDiscovery({ ...discovery, address: { host: 'localhost', port: discovery.address.port } }));
});
test('strict method parameters reject hidden execution overrides before dispatch', async t => {
  const calls: Record<string, unknown>[] = [], { discovery } = await fixture(t, native(calls));
  const c = await client(discovery); t.after(() => c.socket.destroy());
  for (const field of ['sessionId', 'tools', 'reasoningEffort', 'cwd', 'system']) {
    c.send(field, 'generate', { prompt: 'normal', outputSchema: {}, [field]: 'forbidden' });
    assert.equal((await c.next(field)).error.code, 'agent_dsh_request_invalid');
  }
  assert.equal(calls.length, 0);
});
test('one-shot generation inherits each native selection, has no session or tools and returns text', async t => {
  const calls: Record<string, unknown>[] = [];
  let model = 'first';
  const { discovery, server } = await fixture(t, native(calls, { selection: () => ({ provider: 'desktop', model, reasoningEffort: 'max' }) }));
  const c = await client(discovery); t.after(() => c.socket.destroy());
  for (const id of ['a', 'b']) {
    c.send(id, 'generate', { prompt: 'private-material-' + id, outputSchema: { type: 'object' } });
    assert.deepEqual((await c.next(id, 'configured')).config, { model, modelProvider: 'desktop', reasoningEffort: 'max' });
    assert.equal((await c.next(id, 'result')).output, '{"commitMessage":"generated"}'); model = 'second';
  }
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(Object.hasOwn(call, 'sessionId'), false); assert.deepEqual(call.tools, []);
    assert.match(String(call.system), /JSON Schema: /); assert.equal(Object.hasOwn(call, 'context'), false); }
  const persisted = fs.readFileSync(server.discoveryPath, 'utf8'); assert.equal(persisted.includes('private-material'), false);
  c.send('inspect', 'inspect'); const inspected = (await c.next('inspect')).output;
  assert.equal(Object.hasOwn(inspected, 'credential'), false);
});
test('lightweight generation selects the lowest declared level rather than the display order and leaves the desktop selection intact', async t => {
  const calls: Record<string, unknown>[] = [], lookups: Array<{ provider: string; model: string; signal?: AbortSignal }> = [];
  const selected = Object.freeze({ provider: 'desktop', model: 'exact-model', reasoningEffort: 'max' });
  const services = native(calls, { selection: () => selected });
  let efforts = ['max', 'high', 'low', 'off'];
  services.llm.resolveModelInfo = async (provider, model, signal) => {
    lookups.push({ provider, model, signal });
    return { provider, id: model, reasoning: { efforts: efforts.map(id => ({ id, name: 'display label' })), defaultEffort: efforts[0] } };
  };
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('inspect', 'inspect'); assert.equal((await c.next('inspect')).output.capabilities.lightweightGeneration, true);
  for (const [index, entry] of [
    { efforts: ['max', 'high', 'low', 'off'], expected: 'off' },
    { efforts: ['max', 'xhigh', 'minimal', 'medium'], expected: 'minimal' },
    { efforts: ['high', 'medium', 'low'], expected: 'low' },
    { efforts: ['high'], expected: 'high' },
    { efforts: ['max', 'high', 'medium'], expected: 'medium' },
  ].entries()) {
    efforts = entry.efforts;
    c.send('light-' + index, 'generate', { prompt: 'one-shot', outputSchema: {}, reasoningEffort: 'lowest-supported' });
    assert.deepEqual((await c.next('light-' + index, 'configured')).config, { model: selected.model, modelProvider: selected.provider, reasoningEffort: entry.expected });
    assert.equal((await c.next('light-' + index, 'result')).output, '{"commitMessage":"generated"}');
    assert.equal(calls.at(-1)!.reasoningEffort, entry.expected);
  }
  assert.equal(lookups.length, 5); assert.equal(calls.length, 5);
  for (const lookup of lookups) { assert.equal(lookup.provider, selected.provider); assert.equal(lookup.model, selected.model); assert.ok(lookup.signal instanceof AbortSignal); }
  for (const call of calls) { assert.equal(call.provider, selected.provider); assert.equal(call.model, selected.model); assert.deepEqual(call.tools, []); assert.equal(Object.hasOwn(call, 'sessionId'), false); assert.equal(Object.hasOwn(call, 'context'), false); }
  assert.deepEqual(services.agentDefaultModel.currentSelection(), { provider: 'desktop', model: 'exact-model', reasoningEffort: 'max' });
  c.send('ordinary', 'generate', { prompt: 'ordinary', outputSchema: {} });
  assert.equal((await c.next('ordinary', 'configured')).config.reasoningEffort, 'max'); await c.next('ordinary', 'result');
  assert.equal(lookups.length, 5);
});
test('a model without selectable reasoning omits the inherited effort and preserves the unselected native default', async t => {
  const calls: Record<string, unknown>[] = [], inputs: Record<string, unknown>[] = [], services = native(calls);
  services.llm.resolveModelInfo = async (provider, model) => ({ provider, id: model });
  const prepare = services.llm.prepareCall;
  services.llm.prepareCall = async (config, signal) => {
    inputs.push({ ...config }); return prepare(config, signal);
  };
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('default', 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported' });
  assert.equal((await c.next('default', 'configured')).config.reasoningEffort, null); await c.next('default', 'result');
  assert.equal(Object.hasOwn(inputs[0], 'reasoningEffort'), false); assert.equal(Object.hasOwn(calls[0], 'reasoningEffort'), false);
  assert.equal(services.agentDefaultModel.currentSelection().reasoningEffort, 'max');
});
test('a newly materialized effort after a no-reasoning lookup is rejected before streaming', async t => {
  const calls: Record<string, unknown>[] = [], services = native(calls);
  services.llm.resolveModelInfo = async (provider, model) => ({ provider, id: model });
  const prepare = services.llm.prepareCall;
  services.llm.prepareCall = async (config, signal) => {
    assert.equal(Object.hasOwn(config, 'reasoningEffort'), false);
    const prepared = await prepare(config, signal);
    return { ...prepared, config: { ...prepared.config, reasoningEffort: 'max' } };
  };
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('changed', 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported' });
  const frame = await c.next('changed');
  assert.equal(frame.type, 'error'); assert.equal(frame.error.code, 'agent_dsh_model_unconfirmed');
  assert.equal(calls.length, 0); assert.equal(c.frames.some(row => row.type === 'configured' || row.type === 'running' || row.type === 'result'), false);
});
test('older native services advertise no lightweight capability while ordinary generation remains available', async t => {
  const calls: Record<string, unknown>[] = [], { discovery } = await fixture(t, native(calls));
  const c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('inspect', 'inspect'); const capabilities = (await c.next('inspect')).output.capabilities;
  assert.equal(capabilities.generate, true); assert.equal(capabilities.lightweightGeneration, false);
  c.send('light', 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported' });
  assert.equal((await c.next('light', 'error')).error.code, 'agent_dsh_generation_unavailable');
  c.send('ordinary', 'generate', { prompt: 'ordinary', outputSchema: {} });
  assert.equal((await c.next('ordinary', 'configured')).config.reasoningEffort, 'max'); await c.next('ordinary', 'result');
  assert.equal(calls.length, 1);
});
test('unknown or mixed effort identifiers and mismatched metadata routes fail before model dispatch', async t => {
  const calls: Record<string, unknown>[] = [], services = native(calls);
  let metadata: { provider: string; id: string; reasoning?: { efforts: Array<{ id: string; name: string }> } };
  services.llm.resolveModelInfo = async () => metadata;
  let prepared = 0; const prepare = services.llm.prepareCall;
  services.llm.prepareCall = async (config, signal) => { prepared++; return prepare(config, signal); };
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  for (const [index, entry] of [
    { provider: 'native', id: 'model-a', reasoning: { efforts: [{ id: 'opaque', name: 'Lowest' }] } },
    { provider: 'native', id: 'model-a', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'opaque', name: 'High' }] } },
    { provider: 'native', id: 'model-a', reasoning: { efforts: [] } },
    { provider: 'other', id: 'model-a' },
    { provider: 'native', id: 'other' },
  ].entries()) {
    metadata = entry;
    c.send('invalid-' + index, 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported' });
    assert.equal((await c.next('invalid-' + index, 'error')).error.code, 'agent_dsh_model_unconfirmed');
  }
  assert.equal(prepared, 0); assert.equal(calls.length, 0);
  assert.equal(c.frames.some(row => row.type === 'configured' || row.type === 'running' || row.type === 'result'), false);
});
test('prepared route or lightweight effort drift is rejected before configured or streaming events', async t => {
  const calls: Record<string, unknown>[] = [], services = native(calls);
  services.llm.resolveModelInfo = async (provider, model) => ({ provider, id: model, reasoning: { efforts: [{ id: 'low', name: 'Low' }] } });
  const prepare = services.llm.prepareCall;
  let drift: Record<string, string> = {};
  services.llm.prepareCall = async (config, signal) => { const prepared = await prepare(config, signal); return { ...prepared, config: { ...prepared.config, ...drift } }; };
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  const changes: Array<Record<string, string>> = [{ provider: 'other' }, { model: 'other' }, { reasoningEffort: 'high' }];
  for (const [index, fields] of changes.entries()) {
    drift = fields;
    c.send('drift-' + index, 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported' });
    assert.equal((await c.next('drift-' + index, 'error')).error.code, 'agent_dsh_model_unconfirmed');
  }
  assert.equal(calls.length, 0); assert.equal(c.frames.some(row => row.type === 'configured' || row.type === 'running' || row.type === 'result'), false);
});
test('metadata lookup shares request cancellation and timeout without affecting ordinary generation', async t => {
  const calls: Record<string, unknown>[] = [], services = native(calls), started = new EventEmitter();
  services.llm.resolveModelInfo = async (_provider, _model, signal) => new Promise((_resolve, reject) => {
    started.emit('lookup'); const abort = () => reject(signal!.reason);
    if (signal!.aborted) abort(); else signal!.addEventListener('abort', abort, { once: true });
  });
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('timeout', 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported', timeoutMs: 10 });
  assert.equal((await c.next('timeout', 'error')).error.code, 'agent_dsh_generation_timeout');
  const lookup = once(started, 'lookup');
  c.send('cancelled', 'generate', { prompt: 'normal', outputSchema: {}, reasoningEffort: 'lowest-supported' }); await lookup;
  c.send('cancel', 'cancel', { requestId: 'cancelled' });
  assert.equal((await c.next('cancelled', 'error')).error.code, 'agent_dsh_generation_cancelled');
  assert.deepEqual((await c.next('cancel')).output, { requestId: 'cancelled', cancelled: true, settled: true });
  c.send('ordinary', 'generate', { prompt: 'ordinary', outputSchema: {} }); await c.next('ordinary', 'result');
  assert.equal(calls.length, 1);
});
test('cancel ownership, disconnect and plugin disposal isolate native requests and settle before acknowledgement', async t => {
  const calls: Record<string, unknown>[] = [], aborted: string[] = [];
  const { discovery, server } = await fixture(t, native(calls, { waiting: new Set(['one', 'two', 'three']), aborted }));
  const a = await client(discovery), b = await client(discovery); t.after(() => { a.socket.destroy(); b.socket.destroy(); });
  a.send('owned', 'generate', { prompt: 'one', outputSchema: {} }); await a.next('owned', 'running');
  b.send('other', 'generate', { prompt: 'two', outputSchema: {} }); await b.next('other', 'running');
  b.send('wrong-cancel', 'cancel', { requestId: 'owned' });
  assert.equal((await b.next('wrong-cancel')).error.code, 'agent_dsh_request_not_owned'); assert.deepEqual(aborted, []);
  a.send('cancel', 'cancel', { requestId: 'owned' });
  assert.equal((await a.next('owned', 'error')).error.code, 'agent_dsh_generation_cancelled');
  assert.deepEqual((await a.next('cancel')).output, { requestId: 'owned', cancelled: true, settled: true });
  assert.deepEqual(aborted, ['one']);
  a.send('disconnect', 'generate', { prompt: 'three', outputSchema: {} }); await a.next('disconnect', 'running'); a.socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 30)); assert.deepEqual(aborted, ['one', 'three']);
  await server.close(); assert.deepEqual(aborted, ['one', 'three', 'two']);
  assert.equal(fs.existsSync(server.discoveryPath), false);
});
test('oversized admission and incomplete/tool streams cannot return a successful result', async t => {
  const calls: Record<string, unknown>[] = [];
  const services = native(calls);
  services.llm.prepareCall = async config => ({ config, async *stream() { yield { type: 'tool-call-delta' }; yield { type: 'finish', reason: { kind: 'stop' } }; } });
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('size', 'generate', { prompt: 'x'.repeat(DSH_DESKTOP_BRIDGE_LIMITS.promptBytes + 1), outputSchema: {} });
  assert.equal((await c.next('size')).error.code, 'agent_dsh_generation_invalid');
  c.send('tools', 'generate', { prompt: 'normal', outputSchema: {} });
  assert.equal((await c.next('tools', 'error')).error.code, 'agent_dsh_tool_forbidden');
  services.llm.prepareCall = async config => ({ config, async *stream() { yield { type: 'text-delta', text: '{}' }; } });
  c.send('incomplete', 'generate', { prompt: 'normal', outputSchema: {} });
  assert.equal((await c.next('incomplete', 'error')).error.code, 'agent_dsh_generation_incomplete');
  services.llm.prepareCall = async config => ({ config, async *stream() {
    yield { type: 'finish', reason: { kind: 'stop' } }; yield { type: 'text-delta', text: '{}' };
  } });
  c.send('after-finish', 'generate', { prompt: 'normal', outputSchema: {} });
  assert.equal((await c.next('after-finish', 'error')).error.code, 'agent_dsh_stream_invalid');
});
test('uncooperative native stream makes cancellation unconfirmed, and late output cannot succeed', async t => {
  const services = native([]);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  services.llm.prepareCall = async config => ({ config, async *stream() {
    await gate; yield { type: 'text-delta', text: '{}' }; yield { type: 'finish', reason: { kind: 'stop' } };
  } });
  const { discovery } = await fixture(t, services, 20), c = await client(discovery); t.after(() => { release(); c.socket.destroy(); });
  c.send('stubborn', 'generate', { prompt: 'normal', outputSchema: {} }); await c.next('stubborn', 'running');
  c.send('cancel', 'cancel', { requestId: 'stubborn' });
  assert.equal((await c.next('cancel')).error.code, 'agent_dsh_cancel_unconfirmed');
  release(); assert.equal((await c.next('stubborn', 'error')).error.code, 'agent_dsh_generation_cancelled');
  assert.equal(c.frames.some(row => row.id === 'stubborn' && row.type === 'result'), false);
});
test('per-request timeout does not cancel another connection', async t => {
  const aborted: string[] = [], { discovery } = await fixture(t, native([], { waiting: new Set(['timeout']), aborted }));
  const a = await client(discovery), b = await client(discovery); t.after(() => { a.socket.destroy(); b.socket.destroy(); });
  a.send('timeout', 'generate', { prompt: 'timeout', outputSchema: {}, timeoutMs: 10 });
  assert.equal((await a.next('timeout', 'error')).error.code, 'agent_dsh_generation_timeout');
  b.send('healthy', 'generate', { prompt: 'normal', outputSchema: {} });
  assert.equal((await b.next('healthy', 'result')).output, '{"commitMessage":"generated"}'); assert.deepEqual(aborted, ['timeout']);
});
test('native error messages cannot cross the bridge even when they forge its error namespace', async t => {
  const services = native([]);
  services.llm.prepareCall = async () => { throw Object.assign(new Error('private-provider-message'), { code: 'agent_dsh_native_failure' }); };
  const { discovery } = await fixture(t, services), c = await client(discovery); t.after(() => c.socket.destroy());
  c.send('error', 'generate', { prompt: 'normal', outputSchema: {} });
  const frame = await c.next('error', 'error'); assert.equal(frame.error.code, 'agent_dsh_request_failed');
  assert.equal(JSON.stringify(frame).includes('private-provider-message'), false);
});
