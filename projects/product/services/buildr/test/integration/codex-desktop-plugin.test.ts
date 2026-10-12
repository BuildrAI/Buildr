import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import vm from 'node:vm';
import { codexDesktopEntryIdentity, installCodexDesktopPlugin } from '../../src/modules/codex-desktop/infrastructure/codex-plugin-installation.ts';
import { runCodexMcpServer } from '../../src/modules/codex-desktop/interfaces/mcp/codex-mcp-server.ts';
import type { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';

function installationFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-plugin-'));
  const executable = path.join(root, 'codex'), codexHome = path.join(root, 'codex-home'), dataRoot = path.join(root, 'data'), entry = path.join(root, 'bin', 'buildr.mjs'), appPath = path.join(root, 'ChatGPT.app');
  for (const directory of [codexHome, dataRoot, path.dirname(entry), appPath]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(entry, '// isolated retained-entry fixture\n');
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2),home=process.env.CODEX_HOME;fs.appendFileSync(path.join(home,'calls.jsonl'),JSON.stringify(args)+'\\n');if(args[1]==='marketplace'){fs.writeFileSync(path.join(home,'marketplace-root'),args[3]);console.log(JSON.stringify({name:'fixture'}));}else if(args[1]==='add'){fs.writeFileSync(path.join(home,'plugin-id'),args[2]);const root=fs.readFileSync(path.join(home,'marketplace-root'),'utf8');fs.cpSync(path.join(root,'plugins','buildr-desktop'),path.join(home,'cache'),{recursive:true});if(fs.existsSync(path.join(home,'stale')))fs.writeFileSync(path.join(home,'cache','plugin.json'),JSON.stringify({version:'0.0.1'}));console.log(JSON.stringify({pluginId:args[2],version:'1.0.0',installedPath:path.join(home,'cache')}));}else if(args[1]==='list'){console.log(JSON.stringify({installed:[{pluginId:fs.readFileSync(path.join(home,'plugin-id'),'utf8'),installed:true,enabled:!fs.existsSync(path.join(home,'disabled')),version:'1.0.0'}],available:[]}));}else process.exit(2);\n`, { mode: 0o755 });
  fs.appendFileSync(executable, "if(args[1]==='add'&&fs.existsSync(path.join(home,'stale-entry'))){const file=path.join(home,'cache','mcp.json'),value=JSON.parse(fs.readFileSync(file,'utf8'));value.mcpServers.buildr.args.push('unexpected');fs.writeFileSync(file,JSON.stringify(value));}\n");
  return { root, executable, codexHome, dataRoot, entry, appPath, input: { dataRoot, connectionId: 'codex-connection-one', registration: { id: 'agent-one', kind: 'codex' as const, label: 'Codex', executable, codexHome, version: '0.162.0' }, installation: { appPath, appVersion: '26.1007' }, invocation: { command: process.execPath, argsPrefix: [entry], kind: 'host-node' } } };
}

test('desktop plugin uses public commands and a stable profile-scoped connector entry', async () => {
  const fixture = installationFixture();
  try {
    const result = await installCodexDesktopPlugin(fixture.input);
    assert.equal(result.status, 'awaiting-desktop');
    const calls = fs.readFileSync(path.join(fixture.codexHome, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(args => args.slice(0, 3)), [['plugin', 'marketplace', 'add'], ['plugin', 'add', result.pluginId], ['plugin', 'list', '--json']]);
    const pluginRoot = path.join(calls[0][3], 'plugins', 'buildr-desktop');
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));
    assert.deepEqual(manifest.mcpServers.buildr, { command: fs.realpathSync(process.execPath), args: [fs.realpathSync(fixture.entry), 'codex', 'serve', '--connection-id', 'codex-connection-one'], env: { BUILDR_APP_DATA_DIR: fixture.dataRoot } });
    assert.equal(fs.existsSync(path.join(pluginRoot, 'skills', 'buildr-desktop', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(pluginRoot, 'mcp.json')), true);
    const repeated = await installCodexDesktopPlugin(fixture.input);
    assert.equal(repeated.pluginId, result.pluginId);
    assert.equal(repeated.entryIdentity, result.entryIdentity);
    assert.equal(result.entryIdentity, codexDesktopEntryIdentity(fixture.input.invocation, fixture.dataRoot, fixture.input.connectionId));
    const nextEntry = path.join(fixture.root, 'bin', 'next-buildr.mjs'); fs.writeFileSync(nextEntry, '// next retained entry\n');
    assert.notEqual(codexDesktopEntryIdentity({ ...fixture.input.invocation, argsPrefix: [nextEntry] }, fixture.dataRoot, fixture.input.connectionId), result.entryIdentity);
    const another = await installCodexDesktopPlugin({ ...fixture.input, connectionId: 'codex-connection-two' });
    assert.notEqual(another.pluginId, result.pluginId);
    assert.equal(fs.existsSync(path.join(fixture.codexHome, 'config.toml')), false);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('candidate entry cannot install into a desktop profile and disabled plugins remain unconfirmed', async () => {
  const fixture = installationFixture();
  try {
    const candidateEntry = path.join(fixture.root, '.worktrees', 'candidate', 'bin', 'buildr.mjs');
    fs.mkdirSync(path.dirname(candidateEntry), { recursive: true }); fs.writeFileSync(candidateEntry, '');
    await assert.rejects(installCodexDesktopPlugin({ ...fixture.input, invocation: { ...fixture.input.invocation, argsPrefix: [candidateEntry] } }), { code: 'codex_plugin_candidate_entry' });
    assert.equal(fs.existsSync(path.join(fixture.codexHome, 'calls.jsonl')), false);
    fs.writeFileSync(path.join(fixture.codexHome, 'disabled'), '');
    await assert.rejects(installCodexDesktopPlugin(fixture.input), { code: 'codex_plugin_not_enabled' });
    fs.rmSync(path.join(fixture.codexHome, 'disabled'));
    fs.writeFileSync(path.join(fixture.codexHome, 'stale'), '');
    await assert.rejects(installCodexDesktopPlugin(fixture.input), { code: 'codex_plugin_version_unconfirmed' });
    fs.rmSync(path.join(fixture.codexHome, 'stale'));
    fs.writeFileSync(path.join(fixture.codexHome, 'stale-entry'), '');
    await assert.rejects(installCodexDesktopPlugin(fixture.input), { code: 'codex_plugin_cache_unconfirmed' });
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

function mockApplication() {
  const calls: unknown[][] = [];
  const binding = { id: 'binding-one', workspaceId: 'workspace-one', connectionId: 'connection-one', taskId: 'task-one', status: 'bound', nativeSessionId: 'concrete-thread-one' };
  const application = {
    connectorStarted: (...args: unknown[]) => calls.push(['started', ...args]), connectorStopped: (...args: unknown[]) => calls.push(['stopped', ...args]),
    assertConnectionActive: () => {},
    listConnections: () => ({ connections: [] }), listWorkspaces: () => ({ workspaces: [{ id: 'workspace-one', name: 'Buildr' }] }), currentOrigin: () => 'http://127.0.0.1:4458',
    pendingBindings: (...args: unknown[]) => { calls.push(['pendingBindings', ...args]); return { bindings: [binding] }; },
    completeBinding: (...args: unknown[]) => { calls.push(['completeBinding', ...args]); return binding; },
    sessionRelations: (...args: unknown[]) => { calls.push(['sessionRelations', ...args]); return { workspaceId: 'workspace-one', relations: [] }; },
  } as unknown as CodexDesktopApplication;
  return { application, calls };
}
async function protocol(application: CodexDesktopApplication, requests: unknown[]) {
  const input = new PassThrough(); let text = '';
  const output = new Writable({ write(chunk, _encoding, callback) { text += chunk.toString(); callback(); } });
  const running = runCodexMcpServer(application, { connectionId: 'connection-one', input, output });
  input.end(requests.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n') + '\n');
  await running; return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('stdio desktop protocol separates thread/global entrypoints and passes explicit concrete identity', async () => {
  const { application, calls } = mockApplication();
  const responses = await protocol(application, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'fixture', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'buildr_codex_connections', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'buildr_codex_complete_binding', arguments: { workspaceId: 'workspace-one', bindingRequestId: 'binding-one', connectionId: 'connection-one', nativeSessionId: 'concrete-thread-one' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'buildr_codex_relations', arguments: { workspaceId: 'workspace-one', bindingRequestId: 'binding-one' } } },
    { jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: 'ui://buildr/codex-desktop.html' } },
  ]);
  const tools = responses[1].result.tools;
  assert.deepEqual(tools.find((item: { name: string }) => item.name === 'buildr_codex_panel')._meta['openai/ui'].entrypoints, [{ type: 'thread' }]);
  assert.deepEqual(tools.find((item: { name: string }) => item.name === 'buildr_codex_connections')._meta['openai/ui'].entrypoints, [{ type: 'global' }]);
  assert.equal(responses[2].result.structuredContent.surface, 'global');
  assert.deepEqual(calls.find(value => value[0] === 'completeBinding'), ['completeBinding', 'workspace-one', { bindingRequestId: 'binding-one', connectionId: 'connection-one', nativeSessionId: 'concrete-thread-one' }]);
  assert.deepEqual(calls.find(value => value[0] === 'sessionRelations'), ['sessionRelations', 'workspace-one', { connectionId: 'connection-one', bindingRequestId: 'binding-one' }]);
  assert.deepEqual(calls.map(value => value[0]), ['started', 'completeBinding', 'sessionRelations', 'stopped']);
  const html = responses[5].result.contents[0].text;
  assert.match(html, /context\?\.surface === 'thread'/u);
  assert.doesNotMatch(html, /01a128ff|61465|codex-session-bridge-probe/u);
});

test('stdio protocol rejects unknown fields, foreign connection and malformed requests without side effects', async () => {
  const { application, calls } = mockApplication();
  const responses = await protocol(application, [
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'buildr_codex_complete_binding', arguments: { workspaceId: 'workspace-one', bindingRequestId: 'binding-one', connectionId: 'another-connection', nativeSessionId: 'thread' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'buildr_codex_relations', arguments: { workspaceId: 'workspace-one', bindingRequestId: 'binding-one', root: '/arbitrary/path' } } },
    '{invalid-json',
    { jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'file:///etc/passwd' } },
  ]);
  assert.equal(responses[1].error.code, -32602); assert.equal(responses[2].error.code, -32602); assert.equal(responses[3].error.code, -32700); assert.equal(responses[4].error.code, -32602);
  assert.deepEqual(calls.map(value => value[0]), ['started', 'stopped']);
});

async function panelFixture(surface: 'thread' | 'global', deepLink?: string, unknownCreate = false, unknownHandoff = false, disconnectedBeforeMessage = false) {
  const html = fs.readFileSync(new URL('../../resources/codex-desktop/panel.html', import.meta.url), 'utf8');
  class Element {
    children: Element[] = []; textContent = ''; disabled = false; className = ''; selectedValue: string | null = null;
    listeners = new Map<string, () => void>(); hidden = new Set<string>();
    classList = { toggle: (key: string, value: boolean) => value ? this.hidden.add(key) : this.hidden.delete(key), add: (key: string) => this.hidden.add(key), remove: (key: string) => this.hidden.delete(key) };
    get value(): string { return this.selectedValue ?? this.children[0]?.value ?? ''; }
    set value(value: string) { this.selectedValue = value; }
    replaceChildren(...children: Element[]) { this.children = children; this.selectedValue = null; }
    append(...children: Element[]) { this.children.push(...children); }
    addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
    click() { this.listeners.get('click')?.(); }
  }
  const elements = new Map<string, Element>(), requests: { method: string; params?: Record<string, unknown> }[] = [];
  let receive: (event: unknown) => void = () => {}, bindingReads = 0;
  const parent = { postMessage(value: { id?: number; method: string; params?: Record<string, unknown> }) {
    requests.push(value);
    let result: unknown = {};
    if (value.method === 'ui/initialize') result = { hostCapabilities: { message: {}, openLinks: {} }, protocolVersion: '2026-01-26', ...(deepLink ? { hostContext: { 'openai/deepLink': { url: deepLink } } } : {}) };
    if (value.method === 'tools/call') {
      if (value.params?.name === 'buildr_codex_binding_receipt') bindingReads++;
      const binding = { id: deepLink ? '00000000-0000-4000-8000-000000000002' : 'binding-one', taskId: 'task-one', status: unknownHandoff && bindingReads > 1 ? 'bound' : 'pending', message: 'Explicit identity request', connectionId: 'connection-one', nativeSessionId: 'concrete-thread-one' };
      result = (value.params?.name === 'buildr_codex_create_binding' && unknownCreate) || (value.params?.name === 'buildr_codex_create_handoff' && unknownHandoff) ? { isError: true, content: [{ type: 'text', text: 'Creation result unknown' }] } : { structuredContent: value.params?.name === 'buildr_codex_pending_bindings' ? { bindings: [binding] } : value.params?.name === 'buildr_codex_relations' ? { relations: [{ taskId: 'task-one', taskUrl: '/workspaces/workspace-one/codex#/tasks/task-one' }] } : binding };
      if (value.params?.name === 'buildr_codex_connection_status' && disconnectedBeforeMessage) result = { structuredContent: { connection: { status: 'disconnected', safeReason: 'Codex 接入已移除，业务已停用。' } } };
    }
    if (value.id !== undefined) queueMicrotask(() => receive({ source: parent, data: { jsonrpc: '2.0', id: value.id, result } }));
    if (value.method === 'ui/notifications/initialized') queueMicrotask(() => receive({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { surface, connectionId: 'connection-one', origin: 'http://127.0.0.1:4458', workspaces: [{ id: 'workspace-one', name: 'Buildr' }, { id: '00000000-0000-4000-8000-000000000001', name: 'Requested workspace' }] } } } }));
  } };
  const document = { getElementById(id: string) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; }, createElement() { return new Element(); }, documentElement: { getBoundingClientRect: () => ({ height: 300 }) } };
  const window = { parent, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000003' }, addEventListener(_event: string, listener: typeof receive) { receive = listener; } };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/u)![1], { window, document, setTimeout, clearTimeout, console });
  const settle = () => new Promise(resolve => setImmediate(resolve)); await settle(); await settle();
  return { elements, requests, settle, emitDeepLink(url: string) { receive({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { 'openai/deepLink': { url } } } }); } };
}

test('global panel never sends ui/message while explicit thread confirmation sends exactly once', async () => {
  const global = await panelFixture('global');
  assert.equal(global.elements.get('confirm')!.disabled, true);
  global.elements.get('confirm')!.click(); await global.settle();
  assert.equal(global.requests.filter(value => value.method === 'ui/message').length, 0);
  const thread = await panelFixture('thread');
  assert.equal(thread.requests.filter(value => value.method === 'ui/message').length, 0);
  thread.elements.get('binding')!.value = 'binding-one';
  const messagesBefore = thread.requests.length;
  thread.elements.get('confirm')!.click(); await thread.settle(); await thread.settle();
  assert.equal(thread.requests.filter(value => value.method === 'ui/message').length, 1);
  assert.equal(thread.requests.slice(messagesBefore).filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_binding_receipt').length, 1);
  assert.equal(thread.requests.slice(messagesBefore).filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_connection_status').length, 1);
  await thread.settle();
  assert.equal(thread.requests.filter(value => value.method === 'ui/message').length, 1);
});

test('global app deep link selects its exact pending request without sending a message', async () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001', bindingRequestId = '00000000-0000-4000-8000-000000000002';
  const panel = await panelFixture('global', `/bind/${workspaceId}/${bindingRequestId}`);
  assert.equal(panel.elements.get('workspace')!.value, workspaceId);
  assert.equal(panel.elements.get('binding')!.value, bindingRequestId);
  assert.equal(panel.requests.filter(value => value.method === 'ui/message').length, 0);
  const query = panel.requests.find(value => value.method === 'tools/call');
  assert.equal((query?.params?.arguments as { workspaceId: string }).workspaceId, workspaceId);
  const changed = await panelFixture('global', undefined);
  changed.emitDeepLink(`/bind/${workspaceId}/${bindingRequestId}`); await changed.settle(); await changed.settle();
  assert.equal(changed.elements.get('workspace')!.value, workspaceId);
  assert.equal(changed.requests.filter(value => value.method === 'ui/message').length, 0);
});

test('panel retains its preallocated binding id when creation result is unknown and queries without replay', async () => {
  const panel = await panelFixture('thread', undefined, true);
  panel.elements.get('confirm')!.click(); await panel.settle(); await panel.settle();
  const creates = panel.requests.filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_create_binding');
  assert.equal(creates.length, 1);
  const createdId = (creates[0].params?.arguments as { bindingRequestId: string }).bindingRequestId;
  assert.equal(createdId, '00000000-0000-4000-8000-000000000003');
  assert.equal(panel.elements.get('receipt')!.disabled, false);
  assert.equal(panel.elements.get('confirm')!.disabled, true);
  panel.elements.get('receipt')!.click(); await panel.settle(); await panel.settle();
  const queries = panel.requests.filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_binding_receipt');
  assert.equal((queries[0].params?.arguments as { bindingRequestId: string }).bindingRequestId, createdId);
  assert.equal(panel.requests.filter(value => value.method === 'ui/message').length, 0);
  assert.equal(panel.requests.filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_create_binding').length, 1);
});

test('panel retains handoff identity before creation and never submits a message after an unknown result', async () => {
  const panel = await panelFixture('thread', undefined, false, true);
  panel.elements.get('binding')!.value = 'binding-one'; panel.elements.get('confirm')!.click(); await panel.settle(); await panel.settle();
  panel.elements.get('receipt')!.click(); await panel.settle(); await panel.settle();
  assert.equal(panel.elements.get('handoff')!.disabled, false);
  panel.elements.get('handoff')!.click(); await panel.settle(); await panel.settle();
  const creates = panel.requests.filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_create_handoff');
  assert.equal(creates.length, 1);
  const createdId = (creates[0].params?.arguments as { handoffRequestId: string }).handoffRequestId;
  assert.equal(panel.elements.get('handoff-receipt')!.disabled, false);
  assert.equal(panel.elements.get('handoff')!.disabled, true);
  panel.elements.get('handoff-receipt')!.click(); await panel.settle(); await panel.settle();
  const query = panel.requests.find(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_handoff_receipt');
  assert.equal((query?.params?.arguments as { handoffRequestId: string }).handoffRequestId, createdId);
  assert.equal(panel.requests.filter(value => value.method === 'ui/message').length, 1); // Only the explicit identity request.
  assert.equal(panel.requests.filter(value => value.method === 'tools/call' && value.params?.name === 'buildr_codex_create_handoff').length, 1);
});

test('panel rechecks registration before native message submission and disables controls after disconnect', async () => {
  const panel = await panelFixture('thread', undefined, false, false, true);
  panel.elements.get('binding')!.value = 'binding-one'; panel.elements.get('confirm')!.click(); await panel.settle(); await panel.settle();
  assert.equal(panel.requests.filter(value => value.method === 'ui/message').length, 0);
  assert.equal(panel.elements.get('confirm')!.disabled, true); assert.equal(panel.elements.get('receipt')!.disabled, true);
  assert.match(panel.elements.get('connection-status')!.textContent, /接入已移除/u);
});
