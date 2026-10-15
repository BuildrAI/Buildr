import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentOperationsApplication } from '../../src/modules/agent-operations/application/agent-operations-application.ts';
import { AgentRegistrationRepository } from '../../src/modules/agent-operations/persistence/agent-registration-repository.ts';
import { discoverCodexInstallations } from '../../src/modules/agent-operations/infrastructure/codex-discovery.ts';
import { createAgentOperationsHttpContribution } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http.ts';
import { AGENT_OPERATIONS_HTTP_SCHEMAS, AGENT_OPERATIONS_HTTP_VALIDATORS } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http-contracts.ts';
import type { CodexDesktopConnectionView } from '../../src/modules/agent-operations/domain/agent-operations.ts';

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
function inventory(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-discovery-'));
  const home = path.join(root, 'user'), codexHome = path.join(home, '.codex'), applications = path.join(root, 'Applications'), bin = path.join(root, 'bin');
  for (const directory of [codexHome, applications, bin]) fs.mkdirSync(directory, { recursive: true });
  const executable = (file: string, version = '1.0') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, version, { mode: 0o755 }); return file; };
  const app = (name: string, version = '1.0') => {
    const appPath = path.join(applications, name), entry = executable(path.join(appPath, 'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'), version);
    fs.writeFileSync(path.join(appPath, 'Contents/Info.plist'), '<plist><dict><key>CFBundleShortVersionString</key><string>26.1007</string></dict></plist>');
    return { appPath, entry };
  };
  const inspectEntry = (input: { executable: string; codexHome?: string; label?: string }) => {
    const entry = fs.realpathSync(input.executable), config = fs.realpathSync(input.codexHome!);
    return { executable: entry, codexHome: config, label: input.label ?? 'Codex', version: fs.readFileSync(entry, 'utf8') };
  };
  const createApplication = () => new AgentOperationsApplication({ dataRoot: path.join(root, 'profile'), inspectEntry, inspectDshEntry: input => ({ executable: fs.realpathSync(input.executable), dshHome: fs.realpathSync(input.dshHome!), label: input.label ?? 'DSH', version: fs.readFileSync(input.executable, 'utf8') }), available: () => true, discoverCodex: registrations => discoverCodexInstallations({ registrations, inspectEntry, platform: 'darwin', homeDirectory: home, applicationRoots: [applications], env: { PATH: bin } }) });
  const application = createApplication();
  // These Codex scenarios start with a retained DSH registration, not a new
  // desktop connection (which now requires discovery and a real handshake).
  const seedLegacyDsh = (input: { executable: string; dshHome: string; label?: string }) => {
    const repository = new AgentRegistrationRepository(path.join(root, 'profile'));
    repository.mutate(application.listRegistry().revision, registry => {
      const id = 'agent-' + randomUUID();
      registry.agents.push({ id, kind: 'dsh', executable: fs.realpathSync(input.executable), dshHome: fs.realpathSync(input.dshHome), label: input.label ?? 'DSH', version: fs.readFileSync(input.executable, 'utf8') });
      registry.defaultAgentId ??= id;
      return registry;
    });
    return application.listRegistry();
  };
  t.after(async () => { await application.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, home, codexHome, applications, bin, executable, app, inspectEntry, application, createApplication, seedLegacyDsh };
}
function selected(f: ReturnType<typeof inventory>, id: string, makeDefault?: boolean, existingAgentId?: string) {
  return f.application.connectCodex({ candidateId: id, expectedDiscoveryRevision: f.application.listCodexDiscovery().revision, expectedRevision: f.application.listRegistry().revision, ...(makeDefault === undefined ? {} : { makeDefault }), ...(existingAgentId === undefined ? {} : { existingAgentId }) });
}

test('bounded discovery pairs desktop/bundled CLI, PATH and old registrations without starting a provider', async t => {
  const f = inventory(t), desktop = f.app('ChatGPT.app'), second = f.app('Codex Beta.app', '2.0');
  fs.symlinkSync(desktop.entry, path.join(f.bin, 'codex'));
  const extra = f.executable(path.join(f.root, 'outside', 'codex'), '3.0');
  const registered = f.application.registerCodex({ executable: extra, codexHome: f.codexHome, label: 'Existing Codex', expectedRevision: f.application.listRegistry().revision });
  const before = fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8');
  const discovered = f.application.listCodexDiscovery();
  assert.equal(discovered.candidates.length, 3, 'PATH alias of bundled executable must deduplicate');
  assert.deepEqual(discovered.candidates.map(candidate => candidate.source), ['desktop-bundled', 'desktop-bundled', 'registered']);
  assert.equal(discovered.candidates.find(candidate => candidate.version === '3.0')?.registeredAgentId, registered.defaultAgentId);
  assert.equal(discovered.candidates.find(candidate => candidate.version === '3.0')?.label, 'Existing Codex');
  assert.ok(discovered.candidates[0].installationLabel.includes('ChatGPT.app'));
  assert.ok(discovered.candidates[1].installationLabel.includes('Codex Beta.app'));
  assert.equal(discovered.candidates[0].configurationLabel, '~/.codex');
  assert.equal(discovered.candidates[0].desktopAvailable, true);
  assert.equal(discovered.candidates[2].desktopAvailable, false);
  assert.equal(AGENT_OPERATIONS_HTTP_VALIDATORS.validate(AGENT_OPERATIONS_HTTP_SCHEMAS.discovery.$id, discovered).valid, true);
  assert.equal(fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8'), before, 'discovery must not rewrite old records');
  assert.equal(f.application.listRegistry().agents[0].runtimeStatus, 'stopped');
  assert.notEqual(desktop.entry, second.entry);
});

test('new confirmation retains DSH identity/default and blocks repeated preparation', async t => {
  const f = inventory(t), old = f.executable(path.join(f.bin, 'codex')), desktop = f.app('ChatGPT.app', '2.0');
  const legacy = f.seedLegacyDsh({ executable: old, dshHome: f.codexHome, label: 'DSH' });
  const connected: unknown[] = [];
  f.application.bindCodexDesktopConnector({ disconnect() {}, connect: async (registration, installation) => {
    connected.push({ registration, installation });
    return { id: 'connection-one', agentId: registration.id, label: registration.label, installationLabel: 'ChatGPT', configurationLabel: '~/.codex', status: 'configured', safeReason: null };
  } });
  const candidate = f.application.listCodexDiscovery().candidates.find(item => item.desktopAvailable)!;
  assert.equal(f.application.listCodexDiscovery().candidates.every(item => item.label === 'Codex'), true);
  const result = await selected(f, candidate.id);
  assert.equal(result.registry.defaultAgentId, legacy.defaultAgentId);
  assert.notEqual(result.agentId, legacy.defaultAgentId);
  assert.equal(result.desktop?.status, 'configured');
  assert.equal(result.desktopError, null);
  assert.equal((connected[0] as any).installation.appPath, fs.realpathSync(desktop.appPath));
  assert.equal((connected[0] as any).installation.appVersion, '26.1007');
  assert.equal(AGENT_OPERATIONS_HTTP_VALIDATORS.validate(AGENT_OPERATIONS_HTTP_SCHEMAS.connect.$id, result).valid, true);
  const before = fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8');
  await assert.rejects(selected(f, candidate.id, true), code('agent_codex_already_connected'));
  assert.deepEqual(f.application.listRegistry(), result.registry);
  assert.equal(fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8'), before);
  assert.equal(connected.length, 1);
  assert.equal(result.registry.agents.every(agent => agent.runtimeStatus === 'stopped'), true);
});

test('desktop failure retains successful generation registration and reports only a safe partial-success error', async t => {
  const f = inventory(t); f.app('ChatGPT.app');
  f.application.bindCodexDesktopConnector({ disconnect() {}, connect: async () => { throw Object.assign(new Error('private executable path or credential'), { code: 'codex_plugin_failed' }); } });
  const result = await selected(f, f.application.listCodexDiscovery().candidates[0].id);
  assert.equal(result.registry.agents.length, 1); assert.equal(result.desktop, null); assert.equal(result.desktopError?.code, 'codex_plugin_failed');
  assert.equal(JSON.stringify(result).includes('credential'), false);
  assert.equal(f.application.listRegistry().defaultAgentId, result.agentId);
});

test('a later default selection remains authoritative while desktop preparation is pending', async t => {
  const f = inventory(t), old = f.executable(path.join(f.bin, 'codex')); f.app('ChatGPT.app', '2.0');
  const initial = f.seedLegacyDsh({ executable: old, dshHome: f.codexHome });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  f.application.bindCodexDesktopConnector({ disconnect() {}, connect: async registration => { await pending; return { id: 'connection-one', agentId: registration.id, label: 'Codex', installationLabel: 'ChatGPT', configurationLabel: '~/.codex', status: 'configured', safeReason: null }; } });
  const candidate = f.application.listCodexDiscovery().candidates.find(item => item.desktopAvailable)!;
  const result = selected(f, candidate.id, true);
  const afterRegistration = f.application.listRegistry();
  assert.notEqual(afterRegistration.defaultAgentId, initial.defaultAgentId);
  const later = f.application.selectAgent({ agentId: initial.defaultAgentId!, expectedRevision: afterRegistration.revision });
  release();
  assert.deepEqual((await result).registry, later, 'the reply must report current selection, not overwrite it with the earlier snapshot');
});

test('changed installation/config identity or registration revision cannot be confirmed from stale observations', async t => {
  const f = inventory(t), desktop = f.app('ChatGPT.app');
  const snapshot = f.application.listCodexDiscovery(), registry = f.application.listRegistry();
  fs.writeFileSync(desktop.entry, 'updated-2.0');
  await assert.rejects(f.application.connectCodex({ candidateId: snapshot.candidates[0].id, expectedDiscoveryRevision: snapshot.revision, expectedRevision: registry.revision }), code('agent_discovery_changed'));
  assert.deepEqual(f.application.listRegistry().agents, []);
  const current = f.application.listCodexDiscovery();
  const first = await selected(f, current.candidates[0].id);
  const observed = f.application.listCodexDiscovery();
  await assert.rejects(f.application.connectCodex({ candidateId: observed.candidates[0].id, expectedDiscoveryRevision: observed.revision, expectedRevision: registry.revision }), code('agent_registry_changed'));
  const configBefore = f.application.listCodexDiscovery();
  fs.renameSync(f.codexHome, path.join(f.home, 'previous-codex')); fs.mkdirSync(f.codexHome);
  await assert.rejects(f.application.connectCodex({ candidateId: configBefore.candidates[0].id, expectedDiscoveryRevision: configBefore.revision, expectedRevision: first.registry.revision }), code('agent_discovery_changed'));
});

test('explicit maintenance updates the matching generation identity without changing its default', async t => {
  const f = inventory(t), desktop = f.app('ChatGPT.app');
  const first = await selected(f, f.application.listCodexDiscovery().candidates[0].id);
  fs.writeFileSync(desktop.entry, '2.0');
  await assert.rejects(selected(f, f.application.listCodexDiscovery().candidates[0].id), code('agent_codex_already_connected'));
  const upgraded = await selected(f, f.application.listCodexDiscovery().candidates[0].id, false, first.agentId);
  assert.equal(upgraded.agentId, first.agentId); assert.equal(upgraded.registry.defaultAgentId, first.agentId); assert.equal(upgraded.registry.agents.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8')).agents[0].version, '2.0');
});

test('CLI-only candidates support new generation registration but cannot report successful desktop maintenance', async t => {
  const f = inventory(t); f.executable(path.join(f.bin, 'codex'));
  const candidate = f.application.listCodexDiscovery().candidates[0];
  assert.equal(candidate.desktopAvailable, false);
  const first = await selected(f, candidate.id);
  assert.equal(first.desktop, null); assert.equal(first.desktopError, null);
  assert.equal(first.registry.agents.length, 1);
  assert.equal(first.registry.agents[0].availability, 'available');
  const before = fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8');
  await assert.rejects(selected(f, candidate.id, false, first.agentId), code('agent_desktop_unavailable'));
  assert.equal(fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8'), before);
  assert.deepEqual(f.application.listRegistry(), first.registry);
});

test('a different existing Codex also blocks new connection while legacy registrations remain readable and updatable', async t => {
  const f = inventory(t), old = f.executable(path.join(f.root, 'old-codex')), desktop = f.app('ChatGPT.app', '2.0');
  const first = f.application.registerCodex({ executable: old, codexHome: f.codexHome, label: 'Codex（ChatGPT）', expectedRevision: f.application.listRegistry().revision });
  assert.equal(first.agents[0].label, 'Codex');
  let prepared = 0;
  f.application.bindCodexDesktopConnector({ disconnect() {}, connect: async () => { prepared++; throw new Error('must not prepare'); } });
  const candidate = f.application.listCodexDiscovery().candidates.find(item => item.desktopAvailable)!;
  const before = fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8');
  await assert.rejects(selected(f, candidate.id), code('agent_codex_already_connected'));
  assert.equal(prepared, 0);
  assert.equal(fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8'), before);
  fs.writeFileSync(old, '3.0');
  const updated = f.application.registerCodex({ executable: old, codexHome: f.codexHome, label: 'Custom Codex', expectedRevision: first.revision });
  assert.equal(updated.agents[0].id, first.defaultAgentId);
  assert.equal(updated.agents[0].label, 'Custom Codex');
  const another = f.application.registerCodex({ executable: desktop.entry, codexHome: f.codexHome, expectedRevision: updated.revision });
  assert.deepEqual(another.agents.map(agent => agent.id), [first.defaultAgentId, another.agents[1].id]);
  assert.equal(another.defaultAgentId, first.defaultAgentId);
});

test('maintenance cannot change default, create a missing target, or replace a different candidate', async t => {
  const f = inventory(t), desktop = f.app('ChatGPT.app'), other = f.app('Codex Beta.app', '2.0');
  const dsh = f.seedLegacyDsh({ executable: f.executable(path.join(f.bin, 'dsh')), dshHome: f.codexHome });
  const candidate = f.application.listCodexDiscovery().candidates.find(item => item.installationLabel.includes('ChatGPT.app'))!;
  const connected: string[] = [];
  f.application.bindCodexDesktopConnector({ disconnect() {}, connect: async registration => { connected.push(registration.id); return { id: 'connection-one', agentId: registration.id, label: registration.label, installationLabel: 'Codex', configurationLabel: '~/.codex', status: 'configured', safeReason: null }; } });
  const first = await selected(f, candidate.id);
  const before = fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8');
  await assert.rejects(selected(f, candidate.id, true, first.agentId), code('agent_request_invalid'));
  await assert.rejects(selected(f, candidate.id, false, ''), code('agent_request_invalid'));
  await assert.rejects(selected(f, candidate.id, false, 'agent-missing'), code('agent_codex_connection_target_changed'));
  await assert.rejects(selected(f, candidate.id, false, dsh.defaultAgentId!), code('agent_codex_connection_target_changed'));
  const mismatched = f.application.listCodexDiscovery().candidates.find(item => item.installationLabel.includes('Codex Beta.app'))!;
  await assert.rejects(selected(f, mismatched.id, false, first.agentId), code('agent_codex_connection_mismatch'));
  assert.equal(fs.readFileSync(path.join(f.root, 'profile/agent-registrations.json'), 'utf8'), before);
  assert.deepEqual(connected, [first.agentId]);
  fs.writeFileSync(desktop.entry, '3.0');
  const maintained = await selected(f, candidate.id, undefined, first.agentId);
  assert.equal(maintained.agentId, first.agentId);
  assert.equal(maintained.registry.defaultAgentId, dsh.defaultAgentId);
  assert.deepEqual(maintained.registry.agents.map(agent => agent.id), first.registry.agents.map(agent => agent.id));
  assert.deepEqual(connected, [first.agentId, first.agentId]);
  assert.notEqual(desktop.entry, other.entry);
});

test('another application cannot prepare the desktop twice while the first new connection is pending', async t => {
  const f = inventory(t); f.app('ChatGPT.app');
  let release!: () => void, prepared = 0;
  const pending = new Promise<void>(resolve => { release = resolve; }); t.after(() => release());
  f.application.bindCodexDesktopConnector({ disconnect() {}, connect: async registration => { prepared++; await pending; return { id: 'connection-one', agentId: registration.id, label: registration.label, installationLabel: 'Codex', configurationLabel: '~/.codex', status: 'configured', safeReason: null }; } });
  const candidate = f.application.listCodexDiscovery().candidates[0];
  const first = selected(f, candidate.id);
  const peer = f.createApplication();
  try {
    const discovery = peer.listCodexDiscovery(), registry = peer.listRegistry();
    await assert.rejects(peer.connectCodex({ candidateId: candidate.id, expectedDiscoveryRevision: discovery.revision, expectedRevision: registry.revision }), code('agent_codex_already_connected'));
  } finally { await peer.close(); }
  assert.equal(prepared, 1); assert.equal(f.application.listRegistry().agents.length, 1);
  release(); await first;
});

test('only a discovered candidate can be connected over an authorized strict HTTP request', async t => {
  const f = inventory(t); f.app('ChatGPT.app');
  const http = createAgentOperationsHttpContribution(f.application); let writes = 0;
  const call = (method: string, suffix: string, body: unknown = {}, query = '') => http.handleTopLevel({ request: { method }, pathname: '/api/v1/app/agents/codex/' + suffix, searchParams: new URLSearchParams(query), authorizeWrite: () => { writes++; }, readJsonBody: async () => body });
  const snapshot = (await call('GET', 'discovery'))!.body as ReturnType<typeof f.application.listCodexDiscovery>;
  const body = { candidateId: snapshot.candidates[0].id, expectedDiscoveryRevision: snapshot.revision, expectedRevision: f.application.listRegistry().revision };
  await assert.rejects(call('POST', 'connect', { ...body, executable: desktopEntry(f) }), code('agent_request_invalid'));
  await assert.rejects(call('GET', 'discovery', {}, 'path=arbitrary'), code('agent_request_invalid'));
  const result = (await call('POST', 'connect', body))!.body as { agentId: string; desktop: CodexDesktopConnectionView | null; registry: unknown };
  assert.equal(result.desktop, null, 'without host connector, discovery must not claim desktop enabled');
  const current = f.application.listCodexDiscovery(), maintenance = { candidateId: current.candidates[0].id, expectedDiscoveryRevision: current.revision, expectedRevision: f.application.listRegistry().revision, existingAgentId: result.agentId, makeDefault: false };
  assert.equal(((await call('POST', 'connect', maintenance))!.body as { agentId: string }).agentId, result.agentId);
  await assert.rejects(call('POST', 'connect', { ...maintenance, makeDefault: true }), code('agent_request_invalid'));
  await assert.rejects(call('POST', 'connect', { ...maintenance, existingAgentId: null }), code('agent_request_invalid'));
  assert.equal(writes, 5);
});
function desktopEntry(f: ReturnType<typeof inventory>) { return path.join(f.applications, 'ChatGPT.app'); }
