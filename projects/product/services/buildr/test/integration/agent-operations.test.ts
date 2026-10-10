import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { AgentOperationsApplication, type AgentOperationsOptions } from '../../src/modules/agent-operations/application/agent-operations-application.ts';
import { CodexAppServer, codexChildEnvironment, type CodexAppServerOptions } from '../../src/modules/agent-operations/infrastructure/codex-app-server.ts';
import { assertAgentGenerationEnvironmentCurrent, resolveAgentGenerationEnvironment } from '../../src/modules/agent-operations/infrastructure/agent-generation-environment.ts';
import { codexPlatformExecutionReadRoots } from '../../src/modules/agent-operations/infrastructure/codex-readonly-profile.ts';
import { codexGitExecutionReadRoots } from '../../src/modules/agent-operations/infrastructure/codex-git-read-support.ts';
import { createAgentOperationsHttpContribution } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http.ts';
import { AGENT_OPERATIONS_HTTP_SCHEMAS, AGENT_OPERATIONS_HTTP_VALIDATORS } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http-contracts.ts';
import type { AgentExecutionConfig, AgentRegistration, AgentRunView } from '../../src/modules/agent-operations/domain/agent-operations.ts';
import { createAgentOperationsCliContributions } from '../../src/modules/agent-operations/interfaces/cli/agent-operations-cli.ts';
import { registerCommandHelp } from '../../src/bootstrap/cli/help.ts';

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const outputSchema = { type: 'object', additionalProperties: false, properties: { commitMessage: { type: 'string', minLength: 1 } }, required: ['commitMessage'] };
function fixture(t: test.TestContext, mode = 'normal', idleMs = 30 * 60 * 1000, onInspection?: CodexAppServerOptions['onInspection']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-operations-')), home = path.join(root, 'codex-home'), dataRoot = path.join(root, 'buildr-profile');
  fs.mkdirSync(home); const executable = path.join(root, 'codex-fixture');
  fs.writeFileSync(executable, '#!/bin/sh\nexport BUILDR_FAKE_CODEX_MODE=' + quote(mode) + '\nexec ' + quote(process.execPath) + ' ' + quote(path.resolve(import.meta.dirname, '../fixtures/agent-codex-app-server.ts')) + ' "$@"\n', { mode: 0o755 });
  const app = new AgentOperationsApplication({ dataRoot, idleMs, closeWaitMs: 50, providerFactory: record => new CodexAppServer(record, { requestTimeoutMs: 2000, generationTimeoutMs: mode === 'timeout' ? 60 : 2000, closeTimeoutMs: 50, onInspection }) });
  t.after(async () => { await app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const register = (codexHome = home, label = 'Codex') => app.registerCodex({ executable, codexHome, label, expectedRevision: app.listRegistry().revision });
  const messages = (codexHome = home): any[] => fs.existsSync(path.join(codexHome, 'protocol.jsonl')) ? fs.readFileSync(path.join(codexHome, 'protocol.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  const generate = (agentId?: string, validateResult?: (output: unknown) => void | Promise<void>) => app.startGeneration({ agentId, cwd: root, prompt: 'Summarize supplied changes.', outputSchema, validateResult });
  return { root, home, dataRoot, executable, app, register, messages, generate };
}
async function settled(app: AgentOperationsApplication, id: string, expected = ['succeeded', 'failed', 'cancelled']): Promise<AgentRunView> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { const run = app.getRun(id); if (expected.includes(run.status)) return run; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Run did not settle: ' + JSON.stringify(app.getRun(id)));
}
const posix = { skip: process.platform === 'win32' ? 'This real-process fixture uses a POSIX executable wrapper.' : false };
function controlledExecution(t: test.TestContext, providerFactory: AgentOperationsOptions['providerFactory']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-deadline-'));
  const app = new AgentOperationsApplication({ dataRoot: root, providerFactory, closeWaitMs: 50, inspectEntry: () => ({ executable: process.execPath, codexHome: root, label: 'Codex', version: 'test' }), available: () => true });
  app.registerCodex({ executable: process.execPath, expectedRevision: app.listRegistry().revision });
  t.after(async () => { try { await app.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); } });
  return { root, app };
}

test('dedicated child strips invoking chat tool pipes and permissions while retaining ordinary authentication/proxy environment', () => {
  const inherited = { CODEX_HOME: '/old-home', CODEX_APP_TOOLS_PIPE_PATH: 'private-chat-pipe', CODEX_SESSION_ID: 'parent-session', CODEX_THREAD_ID: 'parent-thread', CODEX_PERMISSION_PROFILE: 'parent-permissions', BROWSER_USE_ACCESS_VERIFYING_IDENTITY: 'parent-browser-proof', OPENAI_API_KEY: 'auth-fixture', CODEX_API_KEY: 'alternate-auth-fixture', HTTPS_PROXY: 'proxy-fixture', PATH: 'path-fixture' };
  const child = codexChildEnvironment('/registered-home', inherited);
  for (const key of ['CODEX_APP_TOOLS_PIPE_PATH', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID', 'CODEX_PERMISSION_PROFILE', 'BROWSER_USE_ACCESS_VERIFYING_IDENTITY']) assert.equal(child[key], undefined);
  assert.equal(child.CODEX_HOME, '/registered-home'); assert.equal(child.OPENAI_API_KEY, inherited.OPENAI_API_KEY); assert.equal(child.CODEX_API_KEY, inherited.CODEX_API_KEY); assert.equal(child.HTTPS_PROXY, inherited.HTTPS_PROXY); assert.equal(inherited.CODEX_THREAD_ID, 'parent-thread');
});

test('agent registration validates real entry, is lazy and idempotent, exposes safe views, and rejects stale selection', posix, async t => {
  const f = fixture(t), empty = f.app.listRegistry(); assert.equal(empty.defaultAgentId, null); assert.deepEqual(empty.agents, []);
  assert.throws(() => f.app.registerCodex({ executable: 'relative', codexHome: f.home, expectedRevision: empty.revision }), code('agent_executable_invalid'));
  const first = f.register(); assert.equal(first.agents.length, 1); assert.equal(first.defaultAgentId, first.agents[0].id); assert.equal(first.agents[0].runtimeStatus, 'stopped'); assert.equal(first.agents[0].lastExecutionConfig, null);
  assert.deepEqual(f.messages(), []); assert.equal(JSON.stringify(first).includes(f.executable), false); assert.equal(JSON.stringify(first).includes(f.home), false);
  assert.equal(f.register().revision, first.revision); assert.equal(f.app.listRegistry().agents.length, 1);
  const secondHome = path.join(f.root, 'other-home'); fs.mkdirSync(secondHome); const added = f.register(secondHome, 'Other Codex');
  assert.throws(() => f.app.selectAgent({ agentId: added.agents[1].id, expectedRevision: first.revision }), code('agent_registry_changed'));
  const selected = f.app.selectAgent({ agentId: added.agents[1].id, expectedRevision: added.revision }); assert.equal(selected.defaultAgentId, added.agents[1].id);
  assert.equal(AGENT_OPERATIONS_HTTP_VALIDATORS.validate(AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id, selected).valid, true);
});

test('two generations reuse one child but create separate confirmed read-only ephemeral threads and validate structure', posix, async t => {
  const f = fixture(t); f.register();
  const one = await f.generate(); assert.equal(one.status, 'queued'); assert.equal(one.executionConfig, null); const result = await settled(f.app, one.id); assert.equal(result.status, 'succeeded'); assert.deepEqual(result.output, { commitMessage: 'feat: verified generated message' });
  assert.deepEqual(result.executionConfig, { model: null, modelProvider: null, reasoningEffort: null }, 'missing session fields must not use config defaults or persisted metadata');
  const two = await f.generate(); await settled(f.app, two.id);
  const messages = f.messages(), starts = messages.filter(message => message.method === 'thread/start'), turns = messages.filter(message => message.method === 'turn/start');
  assert.equal(messages.filter(message => message.boot).length, 1); assert.equal(starts.length, 2);
  const args = messages.find(message => message.boot).args as string[];
  for (const feature of ['shell_tool', 'unified_exec', 'code_mode_host']) assert.equal(args.some((arg, index) => arg === '--disable' && args[index + 1] === feature), false, 'native tool selection must remain a per-thread decision');
  for (const feature of ['apps', 'plugins', 'hooks', 'multi_agent']) assert.equal(args.some((arg, index) => arg === '--disable' && args[index + 1] === feature), true);
  for (const start of starts) { assert.equal(start.params.ephemeral, true); assert.equal(start.params.sandbox, 'read-only'); assert.equal(start.params.approvalPolicy, 'never'); }
  for (const start of starts) { assert.equal(start.params.permissions, undefined); assert.equal(start.params.config['features.shell_tool'], false); assert.equal(start.params.config['features.unified_exec'], false); assert.equal(start.params.config['features.code_mode_host'], false); assert.equal(start.params.config['features.skip_host_skill_discovery'], true); assert.equal(start.params.config.project_doc_max_bytes, 0); }
  for (const turn of turns) { assert.deepEqual(turn.params.outputSchema, outputSchema); assert.equal(turn.params.sandboxPolicy.networkAccess, false); }
  assert.notEqual(turns[0].params.threadId, turns[1].params.threadId); assert.equal(messages.filter(message => message.method === 'thread/unsubscribe').length, 2);
  assert.equal(AGENT_OPERATIONS_HTTP_VALIDATORS.validate(AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id, result).valid, true);
  assert.equal(f.app.listRegistry().agents[0].runtimeStatus, 'idle');
});

for (const mode of ['unexpected-command-start', 'unexpected-command-complete', 'unexpected-file-change', 'unexpected-mcp-tool']) {
  test('supplied-data generation refuses ' + mode + ' and closes its owned process without publishing output', posix, async t => {
    const inspections: unknown[] = [], f = fixture(t, mode, undefined, event => inspections.push(event)); f.register();
    const run = await f.app.startGeneration({ cwd: f.root, prompt: 'Generate only from the supplied bounded facts.', outputSchema, execution: { reasoningEffort: 'low', timeoutMs: 60_000 } });
    const result = await settled(f.app, run.id); assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'agent_unexpected_tool_execution'); assert.equal(result.output, null);
    assert.equal(result.executionConfig?.reasoningEffort, 'low'); assert.deepEqual(inspections, []);
    assert.equal(f.messages().filter(message => message.method === 'turn/start').length, 1);
    assert.throws(() => process.kill(f.messages().find(message => message.boot).pid, 0));
  });
}

test('workspace inspection captures a restricted profile, reads bounded snippets and exposes only completed-command metadata', posix, async t => {
  const inspections: unknown[] = [], f = fixture(t, 'workspace-read-only', undefined, event => inspections.push(event)); f.register();
  fs.writeFileSync(path.join(f.root, 'AGENTS.md'), 'Use accurate subjects.'); fs.mkdirSync(path.join(f.root, 'src')); fs.writeFileSync(path.join(f.root, 'src/large-input.ts'), 'ON_DEMAND_LARGE_CONTEXT\n' + 'x'.repeat(8192));
  const roots = [f.root];
  const run = await f.app.startGeneration({ cwd: f.root, prompt: 'Inspect current authorized changes.', outputSchema, environment: { kind: 'workspace-read-only', readableRoots: roots } });
  roots.push(os.homedir());
  assert.equal((await settled(f.app, run.id)).status, 'succeeded');
  const messages = f.messages(), start = messages.find(item => item.method === 'thread/start'), turn = messages.find(item => item.method === 'turn/start');
  assert.equal(messages.find(item => item.method === 'initialize').params.capabilities.experimentalApi, true);
  assert.equal(start.params.sandbox, undefined); assert.equal(turn.params.sandboxPolicy, undefined); assert.equal(turn.params.permissions, start.params.permissions);
  const profile = start.params.config['permissions.' + start.params.permissions];
  assert.deepEqual(profile, { filesystem: { ':root': 'deny', ':minimal': 'read', ...Object.fromEntries([...codexPlatformExecutionReadRoots(), ...codexGitExecutionReadRoots(f.root)].map(root => [root, 'read'])), [fs.realpathSync(f.root)]: 'read' }, network: { enabled: false } });
  assert.equal(start.params.config.default_permissions, start.params.permissions);
  assert.equal(start.params.config['features.shell_tool'], true); assert.equal(start.params.config['features.unified_exec'], true);
  assert.equal(start.params.config['features.code_mode_host'], true);
  for (const feature of ['apps', 'plugins', 'hooks', 'multi_agent', 'multi_agent_v2', 'image_generation', 'view_image', 'memories', 'workspace_dependencies', 'skill_search', 'shell_snapshot', 'request_permissions_tool']) assert.equal(start.params.config['features.' + feature], false);
  assert.equal(start.params.config.project_doc_max_bytes, 0); assert.equal(start.params.config['features.skip_host_skill_discovery'], true);
  assert.equal(start.params.config.shell_environment_policy.inherit, 'core'); assert.equal(start.params.config.shell_environment_policy.ignore_default_excludes, false);
  assert.equal(start.params.config.shell_environment_policy.set.GIT_CONFIG_GLOBAL, undefined); assert.equal(start.params.config.shell_environment_policy.set.GIT_OPTIONAL_LOCKS, '0'); assert.equal(start.params.config.shell_environment_policy.set.GIT_CONFIG_KEY_0, 'core.fsmonitor');
  assert.equal(start.params.config.model, undefined); assert.equal(start.params.config.model_reasoning_effort, undefined); assert.equal(turn.params.model, undefined); assert.equal(turn.params.effort, undefined);
  const reads = messages.filter(item => item.inspection?.phase === 'completed').map(item => item.inspection);
  assert.equal(reads.length, 2); assert.equal(reads.find(item => item.path === 'src/large-input.ts').readBytes, 4096); assert.equal(reads.find(item => item.path === 'src/large-input.ts').containsMarker, true);
  assert.deepEqual(inspections, [{ kind: 'command', status: 'completed', exitCode: 0 }, { kind: 'command', status: 'completed', exitCode: 0 }]);
  assert.equal(JSON.stringify(f.app.getRun(run.id)).includes(f.root), false);
});

test('distinct workspace roots receive fresh permission profiles while retaining one owned provider instance', posix, async t => {
  const f = fixture(t, 'execution-config'); f.register();
  const cwds = [path.join(f.root, 'first'), path.join(f.root, 'second')]; for (const cwd of cwds) fs.mkdirSync(cwd);
  for (const cwd of cwds) { const run = await f.app.startGeneration({ cwd, prompt: 'Inspect authorized current changes.', outputSchema, environment: { kind: 'workspace-read-only', readableRoots: [cwd] } }); assert.equal((await settled(f.app, run.id)).status, 'succeeded'); }
  const starts = f.messages().filter(item => item.method === 'thread/start'); assert.equal(f.messages().filter(item => item.boot).length, 1); assert.notEqual(starts[0].params.permissions, starts[1].params.permissions);
  for (const [index, start] of starts.entries()) {
    const filesystem = start.params.config['permissions.' + start.params.permissions].filesystem;
    assert.equal(filesystem[fs.realpathSync(cwds[index])], 'read'); assert.equal(filesystem[fs.realpathSync(cwds[1 - index])], undefined);
  }
});

test('invalid or replaced workspace read scopes cannot become native inspection authority', posix, async t => {
  const f = fixture(t); f.register();
  for (const roots of [[], ['relative'], [path.parse(f.root).root], [path.join(f.root, 'missing')], Array(129).fill(f.root)]) await assert.rejects(f.app.startGeneration({ cwd: f.root, prompt: 'test', outputSchema, environment: { kind: 'workspace-read-only', readableRoots: roots } }), error => String((error as { code?: string }).code).startsWith('agent_environment_'));
  assert.deepEqual(f.messages(), []);
  const allowed = path.join(f.root, 'allowed'), replacement = path.join(f.root, 'replacement'); fs.mkdirSync(allowed); fs.mkdirSync(replacement);
  const captured = resolveAgentGenerationEnvironment(allowed, { kind: 'workspace-read-only', readableRoots: [allowed] });
  fs.rmdirSync(allowed); fs.symlinkSync(replacement, allowed);
  assert.throws(() => assertAgentGenerationEnvironmentCurrent(allowed, captured), code('agent_environment_changed'));
  fs.unlinkSync(allowed); fs.mkdirSync(allowed);
  const samePath = resolveAgentGenerationEnvironment(allowed, { kind: 'workspace-read-only', readableRoots: [allowed] });
  fs.renameSync(allowed, path.join(f.root, 'previous-allowed')); fs.mkdirSync(allowed);
  assert.throws(() => assertAgentGenerationEnvironmentCurrent(allowed, samePath), code('agent_environment_changed'));
  const rule = path.join(f.root, 'AGENTS.md'); fs.writeFileSync(rule, 'Original rule.');
  const fileScope = resolveAgentGenerationEnvironment(f.root, { kind: 'workspace-read-only', readableRoots: [f.root, rule] });
  fs.renameSync(rule, path.join(f.root, 'previous-AGENTS.md')); fs.writeFileSync(rule, 'Replacement rule.');
  assert.throws(() => assertAgentGenerationEnvironmentCurrent(f.root, fileScope), code('agent_environment_changed'));
});

test('Git runtime support retains cwd-specific includes and ignore files without opening their parent directories', posix, t => {
  const f = fixture(t), repository = path.join(f.root, 'repository'), home = path.join(f.root, 'git-home'), xdg = path.join(f.root, 'xdg');
  fs.mkdirSync(repository); fs.mkdirSync(home); fs.mkdirSync(xdg);
  const included = path.join(home, 'included.conf'), ignored = path.join(home, 'global-ignore'), attributes = path.join(home, 'global-attributes');
  fs.writeFileSync(included, '[core]\n\texcludesFile = ' + ignored + '\n\tattributesFile = ' + attributes + '\n');
  fs.writeFileSync(ignored, 'ignored-fixture.txt\n'); fs.writeFileSync(attributes, '*.fixture -diff\n');
  fs.writeFileSync(path.join(home, '.gitconfig'), '[includeIf "gitdir:' + fs.realpathSync(repository) + '/.git"]\n\tpath = ' + included + '\n[credential]\n\thelper = private-value-never-copied\n');
  const inherited = { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg, GIT_CONFIG_GLOBAL: path.join(f.root, 'unrelated-config') };
  execFileSync('git', ['init', '--initial-branch=main', repository], { env: { ...inherited, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }, stdio: 'ignore' });
  const roots = codexGitExecutionReadRoots(repository, inherited);
  for (const expected of [path.join(home, '.gitconfig'), included, ignored, attributes, path.join(repository, '.git/config')]) assert.ok(roots.includes(fs.realpathSync(expected)), expected);
  for (const parent of [home, xdg, f.root]) assert.equal(roots.includes(parent), false);
  assert.equal(roots.includes(inherited.GIT_CONFIG_GLOBAL), false, 'inherited GIT_* overrides must follow the product reader policy');
  assert.equal(JSON.stringify(roots).includes('private-value-never-copied'), false);
  const other = path.join(f.root, 'other-repository'); fs.mkdirSync(other);
  assert.equal(codexGitExecutionReadRoots(other, inherited).includes(included), false, 'includeIf must follow the selected cwd');
});

for (const mode of ['profile-missing', 'profile-mismatch', 'profile-inherited', 'profile-unknown-parent', 'profile-network', 'profile-unknown-network']) {
  test('workspace inspection rejects ' + mode + ' before sending a model turn', posix, async t => {
    const f = fixture(t, mode); f.register();
    const run = await f.app.startGeneration({ cwd: f.root, prompt: 'Inspect authorized changes.', outputSchema, environment: { kind: 'workspace-read-only', readableRoots: [f.root] } });
    const result = await settled(f.app, run.id); assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'agent_generation_permissions_unconfirmed'); assert.equal(result.executionConfig, null);
    assert.equal(f.messages().some(item => item.method === 'turn/start'), false); assert.equal(f.app.listRegistry().agents[0].lastExecutionConfig, null);
  });
}

for (const mode of ['workspace-no-inspection', 'workspace-failed-inspection']) {
  test('workspace inspection cannot publish a result with ' + mode, posix, async t => {
    const f = fixture(t, mode); f.register();
    const run = await f.app.startGeneration({ cwd: f.root, prompt: 'Inspect current changes.', outputSchema, environment: { kind: 'workspace-read-only', readableRoots: [f.root] } });
    const result = await settled(f.app, run.id);
    assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'agent_readonly_inspection_unavailable'); assert.equal(result.output, null);
  });
}

test('selected configuration comes only from each confirmed session and stays bound across different working directories', posix, async t => {
  const f = fixture(t, 'execution-config'); f.register();
  const firstCwd = path.join(f.root, 'first'), secondCwd = path.join(f.root, 'second'); fs.mkdirSync(firstCwd); fs.mkdirSync(secondCwd);
  const firstConfig = { model: 'model-first', modelProvider: 'provider-first', reasoningEffort: 'high' }, secondConfig = { model: 'model-second', modelProvider: 'provider-second', reasoningEffort: 'low' };
  const one = await f.app.startGeneration({ cwd: firstCwd, prompt: 'First supplied changes.', outputSchema });
  assert.equal(one.executionConfig, null); const first = await settled(f.app, one.id); assert.equal(first.status, 'succeeded'); assert.deepEqual(first.executionConfig, firstConfig);
  assert.deepEqual(f.app.listRegistry().agents[0].lastExecutionConfig, firstConfig);
  const two = await f.app.startGeneration({ cwd: secondCwd, prompt: 'Second supplied changes.', outputSchema });
  assert.equal(two.executionConfig, null); const second = await settled(f.app, two.id); assert.equal(second.status, 'succeeded'); assert.deepEqual(second.executionConfig, secondConfig);
  assert.deepEqual(f.app.getRun(one.id).executionConfig, firstConfig); assert.deepEqual(f.app.listRegistry().agents[0].lastExecutionConfig, secondConfig);
  const registry = f.app.listRegistry(); registry.agents[0].lastExecutionConfig!.model = 'consumer mutation';
  first.executionConfig!.model = 'consumer mutation';
  assert.deepEqual(f.app.getRun(one.id).executionConfig, firstConfig); assert.deepEqual(f.app.listRegistry().agents[0].lastExecutionConfig, secondConfig);
  const exposed = JSON.stringify({ run: f.app.getRun(two.id), registry: f.app.listRegistry() });
  for (const privateValue of ['private-config-credential', 'config-default-model', 'persisted-model', firstCwd, secondCwd]) assert.equal(exposed.includes(privateValue), false);
  const stored = fs.readFileSync(path.join(f.dataRoot, 'agent-registrations.json'), 'utf8'); assert.equal(stored.includes('ExecutionConfig'), false); assert.equal(stored.includes('model-second'), false);
  for (const message of f.messages().filter(item => item.method === 'thread/start')) { assert.equal(message.params.model, undefined); assert.equal(message.params.modelProvider, undefined); assert.equal(message.params.config.model, undefined); assert.equal(message.params.config.model_reasoning_effort, undefined); }
  for (const message of f.messages().filter(item => item.method === 'turn/start')) { assert.equal(message.params.model, undefined); assert.equal(message.params.effort, undefined); }
  assert.equal(AGENT_OPERATIONS_HTTP_VALIDATORS.validate(AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id, f.app.listRegistry()).valid, true);
});

test('invalid or oversized selected configuration fields remain unknown without blocking generation', posix, async t => {
  const f = fixture(t, 'invalid-config'); f.register(); const run = await f.generate(), result = await settled(f.app, run.id);
  assert.equal(result.status, 'succeeded'); assert.deepEqual(result.executionConfig, { model: null, modelProvider: null, reasoningEffort: null });
  assert.deepEqual(f.app.listRegistry().agents[0].lastExecutionConfig, result.executionConfig);
});

test('configuration callbacks are captured once, cloned and cannot relabel settled runs or later registry observations', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-selected-config-'));
  const callbacks: ((config: AgentExecutionConfig) => void)[] = [];
  const app = new AgentOperationsApplication({ dataRoot: root, inspectEntry: () => ({ executable: process.execPath, codexHome: root, label: 'Codex', version: 'test' }), available: () => true, providerFactory: () => ({
    alive: true, start: async () => {}, close: async () => {}, generate: async input => {
      const number = callbacks.length + 1; callbacks.push(input.onConfigured);
      const selected = { model: 'selected-' + number, modelProvider: 'provider', reasoningEffort: 'high', credential: 'must-not-leak' };
      input.onConfigured(selected); selected.model = 'mutated after callback';
      input.onConfigured({ model: 'duplicate callback', modelProvider: 'duplicate', reasoningEffort: 'low' });
      input.onRunning(); return { commitMessage: 'test' };
    },
  }) });
  t.after(async () => { await app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  app.registerCodex({ executable: process.execPath, expectedRevision: app.listRegistry().revision });
  const one = await app.startGeneration({ cwd: root, prompt: 'First supplied changes.', outputSchema }); await settled(app, one.id);
  const two = await app.startGeneration({ cwd: root, prompt: 'Second supplied changes.', outputSchema }); await settled(app, two.id);
  callbacks[0]({ model: 'late callback', modelProvider: 'late', reasoningEffort: 'low' });
  assert.deepEqual(app.getRun(one.id).executionConfig, { model: 'selected-1', modelProvider: 'provider', reasoningEffort: 'high' });
  assert.deepEqual(app.getRun(two.id).executionConfig, { model: 'selected-2', modelProvider: 'provider', reasoningEffort: 'high' });
  assert.deepEqual(app.listRegistry().agents[0].lastExecutionConfig, app.getRun(two.id).executionConfig);
  assert.equal(JSON.stringify({ first: app.getRun(one.id), second: app.getRun(two.id), registry: app.listRegistry() }).includes('must-not-leak'), false);
});

test('observed MCP servers are explicitly disabled per thread without exposing config secrets', posix, async t => {
  const f = fixture(t, 'with-mcp'); f.register(); const run = await f.generate(); assert.equal((await settled(f.app, run.id)).status, 'succeeded');
  const messages = f.messages(), start = messages.find(message => message.method === 'thread/start');
  assert.equal(start.params.config['mcp_servers.node_repl.enabled'], false);
  assert.equal(start.params.config['features.apps'], false); assert.equal(start.params.config['features.shell_tool'], false); assert.equal(start.params.config.web_search, 'disabled');
  assert.equal(messages.find(message => message.method === 'mcpServerStatus/list').params.threadId, 'thread-1');
  assert.equal(fs.readFileSync(path.join(f.dataRoot, 'agent-registrations.json'), 'utf8').includes('private-credential-fixture'), false);
});

test('execution settings are validated and captured per queued call without changing ordinary inheritance or model selection', posix, async t => {
  const f = fixture(t, 'slow'); f.register();
  for (const invalid of [null, [], { model: 'other-model' }, { reasoningEffort: 'ultra' }, { timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: 300_001 }, { timeoutMs: 1.5 }, { timeoutMs: '60000' }]) await assert.rejects(f.app.startGeneration({ cwd: f.root, prompt: 'test', outputSchema, execution: invalid as never }), code('agent_execution_input_invalid'));
  assert.deepEqual(f.messages(), []);
  const ordinary = await f.generate(); await settled(f.app, ordinary.id, ['running']);
  const execution = { reasoningEffort: 'low' as const, timeoutMs: 60_000 };
  const low = await f.app.startGeneration({ cwd: f.root, prompt: 'Use this call-specific execution setting.', outputSchema, execution });
  (execution as { reasoningEffort: string }).reasoningEffort = 'ultra'; execution.timeoutMs = 1;
  const lowResult = await settled(f.app, low.id); assert.equal(lowResult.status, 'succeeded'); assert.equal(lowResult.executionConfig?.reasoningEffort, 'low');
  const next = await f.generate(); assert.equal((await settled(f.app, next.id)).status, 'succeeded');
  const starts = f.messages().filter(message => message.method === 'thread/start'), turns = f.messages().filter(message => message.method === 'turn/start');
  assert.equal(starts[0].params.config.model_reasoning_effort, undefined); assert.equal(starts[1].params.config.model_reasoning_effort, 'low'); assert.equal(starts[2].params.config.model_reasoning_effort, undefined);
  for (const start of starts) { assert.equal(start.params.model, undefined); assert.equal(start.params.config.model, undefined); }
  for (const turn of turns) { assert.equal(turn.params.model, undefined); assert.equal(turn.params.effort, undefined); }
  assert.equal(f.app.getRun(low.id).executionConfig?.reasoningEffort, 'low'); assert.equal(f.app.getRun(next.id).executionConfig?.reasoningEffort, null);
  assert.equal(JSON.stringify(lowResult).includes('timeoutMs'), false);
});

for (const mode of ['low-effort-missing', 'low-effort-mismatch']) {
  test('explicit low reasoning requires confirmed session configuration with ' + mode, posix, async t => {
    const f = fixture(t, mode); f.register();
    const run = await f.app.startGeneration({ cwd: f.root, prompt: 'Use low reasoning for this call.', outputSchema, execution: { reasoningEffort: 'low' } });
    const result = await settled(f.app, run.id); assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'agent_execution_config_unconfirmed'); assert.equal(result.executionConfig, null);
    assert.equal(f.messages().some(message => message.method === 'turn/start'), false); assert.equal(f.messages().filter(message => message.method === 'thread/unsubscribe').length, 1);
  });
}

for (const [name, inspection, explicit, executionBudget, budget] of [['tool-free default', false, undefined, undefined, 180_000], ['workspace inspection default', true, undefined, undefined, 180_000], ['explicit provider override', true, 17, undefined, 17], ['call budget before provider override', true, 300_000, 60_000, 60_000]] as const) {
  test('generation timeout budget uses ' + name + ' and still closes the owned execution', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const client = new CodexAppServer({ id: 'timeout-budget', kind: 'codex', label: 'Timer test', executable: process.execPath, codexHome: os.tmpdir(), version: 'test' }, { generationTimeoutMs: explicit });
    let running = false, closed = 0, settledRun = false;
    client.start = async () => {};
    client.close = async () => { closed++; };
    const protocol = client as unknown as { prepareThread(): Promise<{ threadId: string; permissions: string | null }>; request(method: string): Promise<unknown> };
    protocol.prepareThread = async () => ({ threadId: 'timer-thread', permissions: inspection ? 'captured-test-profile' : null });
    protocol.request = async method => method === 'turn/start' ? { turn: { id: 'timer-turn' } } : {};
    const pending = client.generate({ cwd: os.tmpdir(), prompt: 'Timer lifecycle test.', outputSchema, ...(inspection ? { environment: { kind: 'workspace-read-only' as const, readableRoots: [os.tmpdir()] } } : {}), ...(executionBudget ? { execution: { timeoutMs: executionBudget } } : {}), signal: new AbortController().signal, onConfigured() {}, onRunning() { running = true; } });
    void pending.finally(() => { settledRun = true; }).catch(() => {});
    const drain = () => new Promise<void>(resolve => setImmediate(resolve));
    await drain(); assert.equal(running, true);
    t.mock.timers.tick(budget - 1); await drain();
    assert.equal(settledRun, false, 'the generation must remain active until its selected deadline'); assert.equal(closed, 0);
    t.mock.timers.tick(1);
    await assert.rejects(pending, code('agent_generation_timeout'));
    assert.ok(closed > 0); assert.equal(settledRun, true);
  });
}

test('a queued call deadline fails without closing or interrupting another active run', async t => {
  let release!: (value: unknown) => void, closes = 0, generated = 0;
  const blocked = new Promise<unknown>(resolve => { release = resolve; });
  const f = controlledExecution(t, () => ({ alive: true, start: async () => {}, generate: async input => { generated++; input.onRunning(); return input.prompt === 'first' ? blocked : { commitMessage: 'next' }; }, close: async () => { closes++; release({ commitMessage: 'first' }); } }));
  const first = await f.app.startGeneration({ cwd: f.root, prompt: 'first', outputSchema }); await settled(f.app, first.id, ['running']);
  const queued = await f.app.startGeneration({ cwd: f.root, prompt: 'expired queue member', outputSchema, execution: { timeoutMs: 80 } });
  assert.equal((await settled(f.app, queued.id)).error?.code, 'agent_generation_timeout');
  assert.equal(f.app.getRun(first.id).status, 'running'); assert.equal(closes, 0); assert.equal(generated, 1);
  release({ commitMessage: 'first' }); assert.equal((await settled(f.app, first.id)).status, 'succeeded');
  const next = await f.app.startGeneration({ cwd: f.root, prompt: 'next', outputSchema }); assert.equal((await settled(f.app, next.id)).status, 'succeeded');
  assert.equal(generated, 2); assert.equal(closes, 0); assert.equal(f.app.getRun(queued.id).status, 'failed');
});

test('a call deadline includes provider preparation and prevents late preparation from invoking the model', async t => {
  let release!: () => void, closes = 0, generated = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const f = controlledExecution(t, () => { let alive = true; return { get alive() { return alive; }, start: () => blocked, generate: async () => { generated++; return { commitMessage: 'must not publish' }; }, close: async () => { alive = false; closes++; } }; });
  const run = await f.app.startGeneration({ cwd: f.root, prompt: 'slow preparation', outputSchema, execution: { timeoutMs: 80 } });
  assert.equal((await settled(f.app, run.id)).error?.code, 'agent_generation_timeout');
  await new Promise(resolve => setTimeout(resolve, 10)); assert.ok(closes > 0); assert.equal(generated, 0);
  release(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(generated, 0); assert.equal(f.app.getRun(run.id).status, 'failed'); assert.equal(f.app.getRun(run.id).output, null);
});

for (const cancellation of [false, true]) {
  test('a call ' + (cancellation ? 'cancellation' : 'deadline') + ' includes result validation and cannot publish its late result', async t => {
    let release!: () => void, entered = false, closes = 0;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const f = controlledExecution(t, () => { let alive = true; return { get alive() { return alive; }, start: async () => {}, generate: async input => { input.onRunning(); return { commitMessage: 'verified output' }; }, close: async () => { alive = false; closes++; } }; });
    const run = await f.app.startGeneration({ cwd: f.root, prompt: 'waiting validation', outputSchema, execution: { timeoutMs: 100 }, validateResult: async () => { entered = true; await blocked; } });
    const until = Date.now() + 1000; while (!entered && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(entered, true);
    if (cancellation) f.app.cancelRun(run.id);
    const result = await settled(f.app, run.id); assert.equal(result.status, cancellation ? 'cancelled' : 'failed'); if (!cancellation) assert.equal(result.error?.code, 'agent_generation_timeout');
    await new Promise(resolve => setTimeout(resolve, 10)); assert.ok(closes > 0);
    const next = await f.app.startGeneration({ cwd: f.root, prompt: 'next independent result', outputSchema }); assert.equal((await settled(f.app, next.id)).status, 'succeeded', 'late validation must not hold the provider queue');
    release(); await new Promise(resolve => setTimeout(resolve, 110));
    assert.equal(f.app.getRun(run.id).status, cancellation ? 'cancelled' : 'failed'); assert.equal(f.app.getRun(run.id).output, null);
  });
}

for (const [mode, expected] of [['handshake', 'agent_handshake_invalid'], ['special-mcp', 'agent_mcp_identifier_unsupported'], ['persistent', 'agent_generation_permissions_unconfirmed'], ['writable', 'agent_generation_permissions_unconfirmed'], ['approval', 'agent_generation_permissions_unconfirmed'], ['unsafe-mcp', 'agent_external_tools_unconfirmed'], ['process-exit', 'agent_process_exited'], ['invalid-output', 'agent_output_invalid'], ['timeout', 'agent_generation_timeout'], ['failed', 'agent_generation_failed']]) {
  test('generation rejects ' + mode + ' without replay or persisted fallback', posix, async t => {
    const f = fixture(t, mode); f.register(); const run = await f.generate(undefined, mode === 'invalid-output' ? () => { throw new Error('Invalid output must not reach business validation.'); } : undefined), result = await settled(f.app, run.id);
    assert.equal(result.status, 'failed'); assert.equal(result.error?.code, expected); assert.equal(result.output, null);
    assert.ok(f.messages().filter(message => message.method === 'turn/start').length <= 1);
    if (['persistent', 'writable', 'approval', 'unsafe-mcp'].includes(mode)) assert.equal(f.messages().some(message => message.method === 'turn/start'), false);
    if (['persistent', 'writable', 'approval'].includes(mode)) { assert.equal(result.executionConfig, null); assert.equal(f.app.listRegistry().agents[0].lastExecutionConfig, null); }
  });
}

test('server-initiated tools are refused and do not become additional authority', posix, async t => {
  const f = fixture(t, 'tool-request'); f.register(); const run = await f.generate(); assert.equal((await settled(f.app, run.id)).status, 'succeeded');
  assert.equal(f.messages().find(message => message.id === 'untrusted-tool' && !message.method).error.code, -32601);
});

test('cancel interrupts only the captured run and a default change does not migrate its provider', posix, async t => {
  const f = fixture(t, 'slow'); const original = f.register(), originalId = original.defaultAgentId!;
  const secondHome = path.join(f.root, 'second'); fs.mkdirSync(secondHome); const registry = f.register(secondHome, 'Second');
  const run = await f.generate(originalId); await settled(f.app, run.id, ['running']);
  f.app.selectAgent({ agentId: registry.agents[1].id, expectedRevision: registry.revision });
  assert.equal(f.app.cancelRun(run.id).status, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(f.app.getRun(run.id).agentId, originalId); assert.equal(f.app.getRun(run.id).output, null); assert.equal(f.messages().some(message => message.method === 'turn/interrupt'), true); assert.deepEqual(f.messages(secondHome), []);
  const next = await f.generate(); assert.equal(next.agentId, registry.agents[1].id); assert.equal((await settled(f.app, next.id)).status, 'succeeded');
});

test('result validation receives schema-validated output and can reject stale results without publishing them', posix, async t => {
  const f = fixture(t); f.register(); let validations = 0;
  const run = await f.generate(undefined, async output => { validations++; assert.deepEqual(output, { commitMessage: 'feat: verified generated message' }); throw Object.assign(new Error('内容已变化，请刷新。'), { code: 'code_source_changed' }); });
  const result = await settled(f.app, run.id); assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'code_source_changed'); assert.equal(result.output, null);
  assert.equal(validations, 1);
});

test('idle recycling excludes active/queued work, queries do not reset it, and next generation restarts', posix, async t => {
  const f = fixture(t, 'slow', 60); f.register(); const one = await f.generate(), two = await f.generate();
  await settled(f.app, one.id, ['running']); await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(f.app.listRegistry().agents[0].runtimeStatus, 'running');
  assert.equal((await settled(f.app, one.id)).status, 'succeeded'); assert.equal((await settled(f.app, two.id)).status, 'succeeded');
  const deadline = Date.now() + 1500;
  while (f.app.listRegistry().agents[0].runtimeStatus !== 'stopped' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.app.listRegistry().agents[0].runtimeStatus, 'stopped');
  const next = await f.generate(); await settled(f.app, next.id); assert.equal(f.messages().filter(message => message.boot).length, 2);
});

test('close rejects new work, cancels queued/running jobs and reaps only owned children', posix, async t => {
  const f = fixture(t, 'slow'); f.register(); const one = await f.generate(), two = await f.generate(); await settled(f.app, one.id, ['running']);
  const pid = f.messages().find(message => message.boot).pid; await f.app.close();
  assert.equal(f.app.getRun(one.id).status, 'cancelled'); assert.equal(f.app.getRun(two.id).status, 'cancelled');
  assert.throws(() => process.kill(pid, 0)); await assert.rejects(f.generate(), code('agent_operations_closed')); await f.app.close();
});

test('HTTP only exposes safe registry/query/select/cancel and requires authorized strict writes', posix, async t => {
  const f = fixture(t); f.register(); const http = createAgentOperationsHttpContribution(f.app); let authorized = 0;
  const call = (method: string, suffix = '', body: unknown = {}, query = '') => http.handleTopLevel({ request: { method }, pathname: '/api/v1/app/agents' + suffix, searchParams: new URLSearchParams(query), authorizeWrite: () => { authorized++; }, readJsonBody: async () => body });
  const list = await call('GET'); assert.equal(list?.status, 200); assert.equal(JSON.stringify(list?.body).includes(f.executable), false);
  const registry = f.app.listRegistry(); await call('POST', '/select', { agentId: registry.defaultAgentId, expectedRevision: registry.revision }); assert.equal(authorized, 1);
  await assert.rejects(call('POST', '/select', { agentId: registry.defaultAgentId, expectedRevision: registry.revision, executable: f.executable }), code('agent_request_invalid'));
  await assert.rejects(call('GET', '/runs', {}, 'runId=one&runId=two'), code('agent_request_invalid'));
  assert.equal(await call('POST', '/start', { prompt: 'arbitrary', cwd: f.root }), null);
  const run = await f.generate(); assert.equal((await call('GET', '/runs', {}, 'runId=' + run.id))?.status, 200); await call('POST', '/cancel', { runId: run.id }); assert.equal(f.app.getRun(run.id).status, 'cancelled');
});

test('agent command aggregate help is discoverable and invalid arguments cannot mutate registration', posix, async t => {
  const f = fixture(t), commands = createAgentOperationsCliContributions(f.app), runtime: Record<string, any> = {};
  registerCommandHelp(runtime, commands); assert.equal(runtime.commandTopic(['help', 'agent']), 'agent'); assert.equal(runtime.commandTopic(['agent', 'register', '--help']), 'agent register');
  const register = commands.find(command => command.key === 'agent register')!;
  await assert.rejects(Promise.resolve(register.run({}, { argv: ['node', 'buildr', 'agent', 'register', 'codex', '--executable', f.executable, '--expected-revision', f.app.listRegistry().revision, '--unknown', 'value'] })), code('agent_cli_invalid'));
  assert.equal(f.app.listRegistry().agents.length, 0);
});

test('unconfirmed idle disposal remains a local failure and cannot spawn another instance beside it', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-close-failure-')); let factories = 0;
  const app = new AgentOperationsApplication({ dataRoot: root, idleMs: 10, inspectEntry: () => ({ executable: process.execPath, codexHome: root, label: 'Codex', version: 'test' }), available: () => true, providerFactory: () => {
    factories++; let alive = false;
    return { get alive() { return alive; }, start: async () => { alive = true; }, generate: async input => { input.onRunning(); return { commitMessage: 'test' }; }, close: async () => { alive = false; throw Object.assign(new Error('Unconfirmed owned process exit.'), { code: 'agent_close_timeout' }); } };
  } });
  t.after(async () => { await assert.rejects(app.close(), code('agent_close_incomplete')); fs.rmSync(root, { recursive: true, force: true }); });
  app.registerCodex({ executable: process.execPath, expectedRevision: app.listRegistry().revision });
  const one = await app.startGeneration({ cwd: root, prompt: 'test', outputSchema }); assert.equal((await settled(app, one.id)).status, 'succeeded');
  await new Promise(resolve => setTimeout(resolve, 30));
  for (let index = 0; index < 2; index++) { const next = await app.startGeneration({ cwd: root, prompt: 'test', outputSchema }); assert.equal((await settled(app, next.id)).error?.code, 'agent_close_timeout'); }
  assert.equal(factories, 1);
});

test('dead transport with a live child is reaped before provider replacement', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-dead-transport-')), children: ChildProcess[] = [];
  const app = new AgentOperationsApplication({ dataRoot: root, inspectEntry: () => ({ executable: process.execPath, codexHome: root, label: 'Codex', version: 'test' }), available: () => true, providerFactory: () => {
    for (const previous of children) assert.ok(previous.exitCode !== null || previous.signalCode !== null, 'previous owned child must exit before replacement');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); children.push(child); let alive = true;
    return { get alive() { return alive; }, start: async () => {}, generate: async () => { alive = false; throw Object.assign(new Error('broken pipe'), { code: 'agent_transport_closed' }); }, close: async () => {
      alive = false; if (child.exitCode !== null || child.signalCode !== null) return;
      const exit = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGTERM'); await exit;
    } };
  } });
  t.after(async () => { await app.close(); for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); });
  app.registerCodex({ executable: process.execPath, expectedRevision: app.listRegistry().revision });
  for (let index = 0; index < 2; index++) {
    const run = await app.startGeneration({ cwd: root, prompt: 'test', outputSchema }); assert.equal((await settled(app, run.id)).error?.code, 'agent_transport_closed');
    assert.throws(() => process.kill(children[index].pid!, 0));
  }
  assert.equal(children.length, 2);
});

test('waiting business validation cannot indefinitely delay owned-process shutdown or publish late output', posix, async t => {
  const f = fixture(t); f.register(); let entered = false;
  const run = await f.generate(undefined, async () => { entered = true; await new Promise(() => {}); });
  const deadline = Date.now() + 3000; while (!entered && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(entered, true);
  const before = Date.now(), pid = f.messages().find(message => message.boot).pid; await f.app.close();
  assert.ok(Date.now() - before < 1000); assert.throws(() => process.kill(pid, 0)); assert.equal(f.app.getRun(run.id).status, 'cancelled'); assert.equal(f.app.getRun(run.id).output, null);
});

test('cancelled views still consume capacity until blocked or queued jobs actually settle', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-queue-bound-')); let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const app = new AgentOperationsApplication({ dataRoot: root, maxRuns: 3, inspectEntry: () => ({ executable: process.execPath, codexHome: root, label: 'Codex', version: 'test' }), available: () => true, providerFactory: () => ({ alive: true, start: () => blocked, generate: async () => ({ commitMessage: 'unused' }), close: async () => { release(); } }) });
  t.after(async () => { release(); await app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  app.registerCodex({ executable: process.execPath, expectedRevision: app.listRegistry().revision });
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) { const run = await app.startGeneration({ cwd: root, prompt: 'test', outputSchema }); ids.push(run.id); assert.equal(app.cancelRun(run.id).status, 'cancelled'); }
  await assert.rejects(app.startGeneration({ cwd: root, prompt: 'test', outputSchema }), code('agent_run_capacity'));
  for (const id of ids) assert.equal(app.getRun(id).status, 'cancelled');
  release(); await new Promise(resolve => setTimeout(resolve, 10));
  const next = await app.startGeneration({ cwd: root, prompt: 'test', outputSchema }); assert.equal((await settled(app, next.id)).status, 'succeeded');
});
