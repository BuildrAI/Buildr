import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DshAcpServer, type DshObservation } from '../../src/modules/agent-operations/infrastructure/dsh-acp-server.ts';
import { dshRuntimeInvocation, inspectDshEntry } from '../../src/modules/agent-operations/infrastructure/dsh-entry.ts';
const fixture = fileURLToPath(new URL('../fixtures/agent-dsh-acp.ts', import.meta.url));
function setup(mode = 'normal', changeDuringStartup = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-provider-test-'));
  const install = path.join(root, 'install'); fs.mkdirSync(path.join(install, 'lib'), { recursive: true });
  const executable = path.join(install, 'lib', 'bin.js'); fs.writeFileSync(executable, '#!/usr/bin/env node\n', { mode: 0o755 }); fs.writeFileSync(path.join(install, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh' }));
  fs.mkdirSync(path.join(root, 'profiles', 'desktop'), { recursive: true }); fs.writeFileSync(path.join(root, 'profiles', 'desktop', 'package.json'), '{}');
  const observations: DshObservation[] = [];
  const children: ReturnType<typeof spawn>[] = [];
  const server = new DshAcpServer({ id: 'dsh-test', kind: 'dsh', label: 'DSH', executable, dshHome: root, version: '0.2.0-rc.2' }, {
    requestTimeoutMs: 2000, closeTimeoutMs: 30,
    onObservation: event => observations.push(event),
    spawnProcess: ((_: unknown, __: unknown, options: any) => {
      assert.equal(children.filter(child => child.exitCode === null && child.signalCode === null).length, 0, 'old child must have exited before its replacement starts');
      if (changeDuringStartup) fs.writeFileSync(path.join(root, 'profiles', 'desktop', 'cordis.patch.yml'), '[]\n');
      const child = spawn(process.execPath, [fixture], { ...options, env: { ...options.env, BUILDR_DSH_FIXTURE_MODE: mode } }); children.push(child); return child;
    }) as typeof spawn,
  });
  const cleanup = async () => { await server.close(); fs.rmSync(root, { recursive: true, force: true }); };
  const generate = (overrides: Record<string, unknown> = {}) => server.generate({ cwd: root, prompt: 'Generate the requested JSON only from supplied changes.', outputSchema: { type: 'object', properties: { commitMessage: { type: 'string' } }, required: ['commitMessage'], additionalProperties: false }, execution: { reasoningEffort: 'low', timeoutMs: 2000 }, signal: new AbortController().signal, onConfigured() {}, onRunning() {}, ...overrides });
  return { root, server, observations, children, cleanup, generate };
}
test('DSH reuses one process but releases an independent temporary context after each generation', async () => {
  const h = setup();
  try {
    let configured: unknown;
    assert.deepEqual(await h.generate({ onConfigured: (value: unknown) => configured = value }), { commitMessage: 'feat: 接入 DSH' });
    assert.deepEqual(configured, { model: 'native-model', modelProvider: 'native-provider', reasoningEffort: 'low' });
    assert.deepEqual(await h.generate(), { commitMessage: 'feat: 接入 DSH' });
    assert.equal(h.children.length, 1);
    const requests = h.observations.filter(event => event.kind === 'model-request'); assert.equal(requests.length, 2);
    assert.notEqual(requests[0].sessionId, requests[1].sessionId);
    assert.deepEqual(h.observations.filter(event => event.kind === 'session-released').map(event => event.remaining), [0, 0]);
  } finally { await h.cleanup(); }
});
test('DSH replaces a process sequentially when the native default configuration changes', async () => {
  const h = setup();
  try {
    await h.generate(); fs.writeFileSync(path.join(h.root, 'profiles', 'desktop', 'cordis.patch.yml'), '[]\n'); await h.generate();
    assert.equal(h.children.length, 2); assert.notEqual(h.children[0].pid, h.children[1].pid);
  } finally { await h.cleanup(); }
});
test('DSH refuses a native configuration changed during startup before any model request', async () => {
  const h = setup('normal', true);
  try {
    await assert.rejects(h.generate(), (error: any) => error.code === 'agent_native_configuration_changed');
    assert.equal(h.observations.filter(event => event.kind === 'model-request').length, 0);
  } finally { await h.cleanup(); }
});
for (const [mode, expected] of [['persistent', 'agent_generation_permissions_unconfirmed'], ['no-low', 'agent_execution_config_unconfirmed'], ['wrong-low', 'agent_execution_config_unconfirmed'], ['invalid-json', 'agent_output_invalid'], ['tool', 'agent_unexpected_tool_execution']] as const) test('DSH refuses ' + mode + ' without retrying the model request', async () => {
  const h = setup(mode);
  try {
    await assert.rejects(h.generate(), (error: any) => error.code === expected);
    assert.ok(h.observations.filter(event => event.kind === 'model-request').length <= 1);
    if (['persistent', 'no-low', 'wrong-low'].includes(mode)) assert.equal(h.observations.filter(event => event.kind === 'model-request').length, 0);
  } finally { await h.cleanup(); }
});
test('DSH closes an instance that cannot confirm temporary context release', async () => {
  const h = setup('no-release');
  try { await h.generate(); assert.equal(h.server.alive, false); } finally { await h.cleanup(); }
});
test('DSH cancels the current prompt and releases its context', async () => {
  const h = setup('wait'), controller = new AbortController();
  try {
    const active = h.generate({ signal: controller.signal });
    while (!h.observations.some(event => event.kind === 'model-request')) await new Promise(resolve => setTimeout(resolve, 5));
    controller.abort(); await assert.rejects(active, (error: any) => error.code === 'agent_run_cancelled');
    assert.equal(h.observations.filter(event => event.kind === 'model-request').length, 1);
    assert.equal(h.server.alive, true);
  } finally { await h.cleanup(); }
});
test('DSH entry rejects relative, control-character, and missing identities before probing', () => {
  for (const executable of ['relative/dsh', '/tmp/dsh\n', '/tmp/buildr-no-such-dsh']) assert.throws(() => inspectDshEntry({ executable }), (error: any) => ['agent_executable_invalid', 'agent_executable_unavailable'].includes(error.code));
});
test('installed DSH confirms the official native default without a model call or persisted session', { skip: !process.env.BUILDR_DSH_NATIVE_TEST_ENTRY }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-native-test-'));
  const desktop = path.join(root, 'profiles', 'desktop'); fs.mkdirSync(desktop, { recursive: true });
  const profile = JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } });
  const patch = JSON.stringify([{ id: 'agent-default-model', config: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high', apiKey: 'fixture-must-not-be-copied' } }]);
  fs.writeFileSync(path.join(desktop, 'package.json'), profile); fs.writeFileSync(path.join(desktop, 'cordis.patch.yml'), patch);
  const record = inspectDshEntry({ executable: process.env.BUILDR_DSH_NATIVE_TEST_ENTRY!, dshHome: root });
  assert.equal(fs.readdirSync(desktop).length, 2, 'registration must not initialize or write a native profile');
  const observations: DshObservation[] = [];
  const server = new DshAcpServer({ id: 'native-dsh', kind: 'dsh', ...record }, { onObservation: event => observations.push(event) });
  // The test exercises standard ACP requests directly to verify the installed
  // composition without spending a model request or exposing an extra API.
  const transport = server as unknown as { request(method: string, params: unknown): Promise<any> };
  try {
    await server.start();
    const bridge = JSON.parse(fs.readFileSync(path.join((server as unknown as { directory: string }).directory, 'cordis.yml'), 'utf8'));
    assert.equal(bridge.find((entry: any) => entry.id === 'system-prompt').config.includeRuntimeContext, false);
    assert.deepEqual(Object.keys(bridge.find((entry: any) => entry.id === 'agent-default-model').config).sort(), ['model', 'provider', 'reasoningEffort']);
    const created = await transport.request('session/new', { cwd: root, mcpServers: [] });
    assert.equal(created.configOptions.find((option: any) => option.id === 'model').currentValue, '["deepseek-official","deepseek-v4-flash"]');
    const reasoning = created.configOptions.find((option: any) => option.id === 'reasoning_effort');
    assert.ok(reasoning.options.some((option: any) => option.value === 'low'));
    const configured = await transport.request('session/set_config_option', { sessionId: created.sessionId, configId: 'reasoning_effort', value: 'low' });
    assert.equal(configured.configOptions.find((option: any) => option.id === 'reasoning_effort').currentValue, 'low');
    await transport.request('session/close', { sessionId: created.sessionId });
    assert.deepEqual((await transport.request('session/list', {})).sessions, []);
    assert.deepEqual(observations.filter(event => event.kind === 'session-released').map(event => event.remaining), [0]);
    assert.equal(observations.filter(event => event.kind === 'model-request').length, 0);
    assert.equal(fs.existsSync(path.join(root, 'sessions')), false);
    assert.equal(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'), profile);
    assert.equal(fs.readFileSync(path.join(desktop, 'cordis.patch.yml'), 'utf8'), patch);
  } finally { await server.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
test('native route inspection rejects URI credentials before materializing runtime config and allows ordinary query parameters', { skip: !process.env.BUILDR_DSH_NATIVE_TEST_ENTRY }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-route-guard-'));
  const home = path.join(root, 'home'), directory = path.join(root, 'runtime'), desktop = path.join(home, 'profiles', 'desktop');
  fs.mkdirSync(desktop, { recursive: true }); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(desktop, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }));
  const runtime = dshRuntimeInvocation(process.env.BUILDR_DSH_NATIVE_TEST_ENTRY!);
  const probe = (baseURL: string) => {
    fs.writeFileSync(path.join(desktop, 'cordis.patch.yml'), JSON.stringify([
      { id: 'agent-default-model', config: { provider: 'custom', model: 'fixture-model' } },
      { id: 'llm-pi-ai', config: { providers: { custom: { api: 'openai-responses', apiKeyEnv: 'NATIVE_CREDENTIAL_REFERENCE', baseURL, models: [{ id: 'fixture-model' }] } } } },
    ]));
    try {
      return execFileSync(runtime.executable, [...runtime.args, '--probe'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...(runtime.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}), DSH_HOME: home, BUILDR_DSH_INSTALL_ANCHOR: runtime.anchor, BUILDR_DSH_TEMP_DIR: directory } });
    } catch (error) { return String((error as { stdout?: unknown }).stdout || ''); }
  };
  try {
    for (const uri of ['https://user:password@example.test/v1', 'https://example.test/v1?token=fixture', 'https://example.test/v1?api_key=fixture', 'https://example.test/v1?signature=fixture']) {
      const messages = probe(uri).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(messages.find(message => message.method === '$buildr/start-failed')?.params.reason, 'agent_native_inline_credentials_unsupported');
      assert.equal(fs.existsSync(path.join(directory, 'cordis.yml')), false);
    }
    const messages = probe('https://example.test/v1?api-version=2026-01&region=cn').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(messages.find(message => message.method === '$buildr/inspected')?.params.protocolVersion, 1);
    assert.equal(fs.existsSync(path.join(directory, 'cordis.yml')), false, 'inspection must never materialize or start the service');
    assert.equal(fs.existsSync(path.join(home, 'sessions')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
