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
