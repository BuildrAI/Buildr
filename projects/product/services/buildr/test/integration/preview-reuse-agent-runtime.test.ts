import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { createAgentService } from '@buildr-ai/buildr-agent';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions } from '@buildr-ai/buildr-agent';

import { applyPreviewReuse, parsePreviewReuseSelection } from '../../src/web/application/preview-reuse.ts';

function schema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE conversations(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, hidden INTEGER NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL);
    PRAGMA user_version=1;`);
}

function fixture(t: test.TestContext, options: { brokenProvider?: boolean } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-runtime-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'development');
  const previewRoot = path.join(root, 'preview');
  const sourceAgent = path.join(sourceRoot, 'agent-service');
  const previewAgent = path.join(previewRoot, 'agent-service');
  const modelAccess = path.join(sourceAgent, 'model-access');
  fs.mkdirSync(modelAccess, { recursive: true });
  fs.writeFileSync(path.join(modelAccess, 'accounts.json'), '{"version":1,"accounts":[]}\n');

  const executable = path.join(sourceAgent, 'programs', 'qoder', '1.1.75-fixture', 'node_modules', '@qoder-ai', 'qoder-agent-sdk', 'dist', '_bundled', 'qodercli');
  const config = path.join(sourceAgent, 'connections', 'qoder', 'qoder-config');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(executable, '#!/bin/sh\necho fixture\n', { mode: 0o700 });
  fs.writeFileSync(path.join(config, 'auth.json'), '{"user":"fixture"}\n');
  fs.writeFileSync(path.join(config, 'models.json'), '{"model":"fixture-model"}\n');
  for (const excluded of ['model-bindings', 'tmp', 'logs', 'sessions']) {
    fs.mkdirSync(path.join(sourceAgent, 'connections', 'qoder', excluded), { recursive: true });
    fs.writeFileSync(path.join(sourceAgent, 'connections', 'qoder', excluded, 'cache.bin'), 'runtime cache\n');
  }
  fs.mkdirSync(path.join(sourceAgent, 'connections', 'qoder', 'home'), { recursive: true });
  fs.writeFileSync(path.join(sourceAgent, 'connections', 'qoder', 'home', 'keep.txt'), 'home\n');
  const codexHome = path.join(sourceAgent, 'connections', 'codex', 'codex-home');
  fs.mkdirSync(codexHome, { recursive: true });
  for (const file of ['auth.json', 'config.toml', 'models_cache.json', 'logs_2.sqlite', 'logs_2.sqlite-wal', 'thread_history_1.sqlite', 'state_5.sqlite', 'memories_1.sqlite', 'goals_1.sqlite', 'queue_1.sqlite']) fs.writeFileSync(path.join(codexHome, file), `${file}\n`);
  fs.mkdirSync(path.join(codexHome, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'sessions', 'session.json'), '{}\n');
  fs.mkdirSync(path.join(codexHome, 'shell_snapshots'), { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'shell_snapshots', 'snap.txt'), 'snapshot\n');
  fs.mkdirSync(path.join(sourceAgent, 'connections', 'codex', 'model-bindings', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(sourceAgent, 'connections', 'codex', 'model-bindings', 'cache', 'binding.bin'), 'cache\n');
  const dshHome = path.join(sourceAgent, 'connections', 'dsh', 'dsh-home');
  fs.mkdirSync(path.join(dshHome, 'profiles', 'web'), { recursive: true });
  fs.writeFileSync(path.join(dshHome, '.credentials.yaml'), 'credentials: fixture\n');
  fs.writeFileSync(path.join(dshHome, 'profiles', 'web', 'profile.json'), '{"profile":"web"}\n');
  fs.writeFileSync(path.join(dshHome, 'model-bridge-fixture.json'), 'temporary bridge\n');

  const info = fs.statSync(config);
  const sourceDatabase = path.join(sourceAgent, 'conversations.sqlite');
  const db = new DatabaseSync(sourceDatabase);
  schema(db);
  const connection = {
    view: {
      id: 'qoder', provider: 'qoder', label: 'Qoder', revision: 'r1', status: 'ready', enabled: true,
      executable, configPath: path.join(sourceAgent, 'connections', 'qoder'),
      capabilities: { text: true, images: true, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024, maxImageBytes: 8 * 1024 * 1024, permissionModes: ['default', 'full-access'] },
      models: [{ id: 'fixture-model', label: 'Fixture Model', isDefault: true }],
    },
    bindingIdentity: 'source-identity',
    bindingData: { format: 'buildr-native-binding/v2', provider: 'qoder', executable, config, dev: info.dev, ino: info.ino, series: '1.1', observedVersion: '1.1.75' },
  };
  db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?)').run('qoder', 'qoder', 'r1', JSON.stringify(connection));
  if (options.brokenProvider) {
    const codexExecutable = path.join(sourceAgent, 'system', 'codex-cli');
    const codexConfig = path.join(sourceAgent, 'connections', 'codex', 'codex-home');
    fs.mkdirSync(path.dirname(codexExecutable), { recursive: true });
    fs.mkdirSync(codexConfig, { recursive: true });
    fs.writeFileSync(codexExecutable, '#!/bin/sh\n', { mode: 0o700 });
    fs.writeFileSync(path.join(codexConfig, 'auth.json'), '{"user":"fixture"}\n');
    const codexInfo = fs.statSync(codexConfig);
    const codex = {
      view: { id: 'codex', provider: 'codex', label: 'Codex', revision: 'r1', status: 'ready', enabled: true, executable: codexExecutable, configPath: path.join(sourceAgent, 'connections', 'codex'), capabilities: { text: true, images: false, maxInputBytes: 1024 }, models: [] },
      bindingIdentity: 'codex-source',
      bindingData: { format: 'buildr-native-binding/v2', provider: 'codex', executable: codexExecutable, config: codexConfig, dev: codexInfo.dev, ino: codexInfo.ino, series: '0.163', observedVersion: '0.163.0' },
    };
    db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?)').run('codex', 'codex', 'r1', JSON.stringify(codex));
  }
  db.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?)').run('source-conversation', 'ws', null, 0, 'now', 'r1', JSON.stringify({ view: { id: 'source-conversation', title: 'dev only' } }));
  const sourceDatabaseBytes = fs.readFileSync(sourceDatabase);
  db.close();

  fs.mkdirSync(path.join(sourceAgent, 'attachments', 'source-conversation'), { recursive: true });
  fs.writeFileSync(path.join(sourceAgent, 'attachments', 'source-conversation', 'source-image'), 'source attachment\n');
  fs.mkdirSync(path.join(sourceAgent, 'handoff-materials', 'source-conversation'), { recursive: true });
  fs.writeFileSync(path.join(sourceAgent, 'handoff-materials', 'source-conversation', 'index.md'), 'source handoff\n');

  fs.mkdirSync(previewAgent, { recursive: true });
  const previewDatabase = path.join(previewAgent, 'conversations.sqlite');
  const previewDb = new DatabaseSync(previewDatabase);
  schema(previewDb);
  const previewRecord = {
    view: { id: 'preview-conversation', workspaceId: 'ws', cwd: previewRoot, title: 'preview only', revision: 'r1', hidden: false, updatedAt: 'now', participants: [], entries: [], requests: [], run: null },
    participants: [], sources: {}, attempts: [], requests: {}, attachments: {},
  };
  previewDb.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?)').run('preview-conversation', 'ws', null, 0, 'now', 'r1', JSON.stringify(previewRecord));
  previewDb.close();

  return { root, sourceRoot, previewRoot, previewAgent, executable, config, sourceDatabase, sourceDatabaseBytes };
}

function fakeExecutor(state: { opens: ExecutorOpenOptions[] }): AgentExecutor {
  const contexts = new Map<string, { items: ExecutorItem[]; observation: ExecutorObservation }>();
  const capabilities = { text: true, images: true, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024, maxImageBytes: 8 * 1024 * 1024, permissionModes: ['default', 'full-access'] as Array<'default' | 'full-access'> };
  return {
    descriptor: { id: 'qoder', label: 'Qoder', capabilities },
    async open(input) {
      state.opens.push(input);
      const runtime: AgentRuntime = {
        bindingIdentity: input.binding?.identity ?? 'fixture-binding',
        bindingData: input.binding?.data,
        capabilities,
        async inspectAccount() { return { status: 'ready', label: 'Fixture' }; },
        async models() { return [{ id: 'fixture-model', label: 'Fixture Model' }]; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext() { const ref = { id: randomUUID() }; contexts.set(ref.id, { items: [], observation: { status: 'idle', tools: [] } }); return ref; },
        async resumeContext() {},
        async readHistory({ contextRef }: { contextRef: ContextRef }) { return structuredClone(contexts.get(contextRef.id)!.items); },
        async send(sendInput) {
          const context = contexts.get(sendInput.contextRef.id)!;
          const executionRef = { id: `fixture-${sendInput.clientRequestId}` };
          context.observation = { status: 'running', executionRef, tools: [] };
          sendInput.onEvent({ type: 'accepted', executionRef });
          const item: ExecutorItem = { id: `answer-${sendInput.clientRequestId}`, kind: 'message', role: 'assistant', text: 'fixture answer', status: 'completed', executionId: executionRef.id };
          context.items.push(item);
          sendInput.onEvent({ type: 'item', item });
          context.observation = { status: 'idle', executionRef, tools: [] };
          sendInput.onEvent({ type: 'completed', status: 'completed' });
        },
        async observe({ contextRef }) { return structuredClone(contexts.get(contextRef.id)!.observation); },
        async reply() {},
        async stop({ contextRef }) { return structuredClone(contexts.get(contextRef.id)!.observation); },
        async close() {},
      };
      return runtime;
    },
  };
}

test('agent-runtime 沿用登录配置和程序、重建绑定并保持会话双向隔离', { timeout: 30_000 }, async (t) => {
  const data = fixture(t);
  const registry = undefined;
  const selection = parsePreviewReuseSelection('development:agent-runtime', registry);
  const facts = await applyPreviewReuse({ selection, sourceRoot: data.sourceRoot, previewRoot: data.previewRoot });
  assert.deepEqual(facts.results.map((result) => [result.id, result.status]), [['model-catalog', 'seeded'], ['agent-runtime', 'seeded']]);
  assert.deepEqual(facts.results[1].diagnostics, []);

  const targetConnections = path.join(data.previewAgent, 'connections', 'qoder');
  assert.equal(fs.readFileSync(path.join(targetConnections, 'qoder-config', 'auth.json'), 'utf8'), '{"user":"fixture"}\n');
  assert.equal(fs.readFileSync(path.join(targetConnections, 'home', 'keep.txt'), 'utf8'), 'home\n');
  for (const excluded of ['model-bindings', 'tmp', 'logs', 'sessions', 'projects']) assert.equal(fs.existsSync(path.join(targetConnections, excluded)), false);
  const targetCodex = path.join(data.previewAgent, 'connections', 'codex', 'codex-home');
  for (const file of ['auth.json', 'config.toml']) assert.equal(fs.readFileSync(path.join(targetCodex, file), 'utf8'), `${file}\n`);
  for (const excluded of ['models_cache.json', 'logs_2.sqlite', 'logs_2.sqlite-wal', 'thread_history_1.sqlite', 'state_5.sqlite', 'memories_1.sqlite', 'goals_1.sqlite', 'queue_1.sqlite', 'sessions', 'shell_snapshots']) assert.equal(fs.existsSync(path.join(targetCodex, excluded)), false);
  assert.equal(fs.existsSync(path.join(data.previewAgent, 'connections', 'codex', 'model-bindings')), false);
  const targetDsh = path.join(data.previewAgent, 'connections', 'dsh', 'dsh-home');
  assert.equal(fs.readFileSync(path.join(targetDsh, '.credentials.yaml'), 'utf8'), 'credentials: fixture\n');
  assert.equal(fs.readFileSync(path.join(targetDsh, 'profiles', 'web', 'profile.json'), 'utf8'), '{"profile":"web"}\n');
  assert.equal(fs.existsSync(path.join(targetDsh, 'model-bridge-fixture.json')), false);
  const targetProgram = path.join(data.previewAgent, 'programs', 'qoder', '1.1.75-fixture', 'node_modules', '@qoder-ai', 'qoder-agent-sdk', 'dist', '_bundled', 'qodercli');
  assert.equal(fs.statSync(targetProgram).mode & 0o700, 0o700);

  const state = { opens: [] as ExecutorOpenOptions[] };
  const service = createAgentService({
    dataRoot: data.previewRoot,
    executors: [fakeExecutor(state)],
    environment: {},
    resolveWorkspace: () => ({ rootPath: data.previewRoot }),
    assertTask: () => {},
    shutdownTimeoutMs: 1000,
  });
  try {
    assert.equal(service.connections.read('qoder').status, 'ready');
    const created = await service.conversations.create('ws', { cwd: data.previewRoot });
    const listed = service.conversations.list('ws').conversations.map((conversation) => conversation.id);
    assert.ok(listed.includes(created.id));
    assert.equal(listed.includes('source-conversation'), false);
    assert.throws(() => service.conversations.read('ws', 'source-conversation'), { code: 'agent_conversation_missing' });
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const attachment = service.conversations.addAttachment('ws', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png });
    const draft = { expectedRevision: attachment.revision, connectionId: 'qoder', text: 'run fixture agent', attachmentIds: [attachment.id] };
    const preview = service.conversations.prepareSend('ws', created.id, draft);
    assert.equal(preview.fits, true);
    service.conversations.send('ws', created.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    let completed;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      completed = service.conversations.read('ws', created.id);
      if (completed.run?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(completed?.run?.status, 'completed');
    assert.ok(completed?.entries.some((entry) => entry.text === 'fixture answer'));

    const targetDb = new DatabaseSync(path.join(data.previewAgent, 'conversations.sqlite'), { readOnly: true });
    const relocated = JSON.parse((targetDb.prepare("SELECT body FROM connections WHERE id='qoder'").get() as { body: string }).body);
    const targetConfig = path.join(targetConnections, 'qoder-config');
    assert.equal(relocated.view.configPath, targetConnections);
    assert.equal(relocated.view.executable, targetProgram);
    assert.equal(relocated.bindingData.config, targetConfig);
    assert.equal(relocated.bindingIdentity, state.opens[0]?.binding?.identity);
    assert.equal(JSON.stringify(relocated).includes(data.sourceRoot), false);
    assert.equal((targetDb.prepare("SELECT COUNT(*) AS count FROM conversations WHERE id='source-conversation'").get() as { count: number }).count, 0);
    assert.equal((targetDb.prepare("SELECT COUNT(*) AS count FROM conversations WHERE id='preview-conversation'").get() as { count: number }).count, 1);
    targetDb.close();

    const previewAttachment = path.join(data.previewAgent, 'attachments', created.id, attachment.id);
    assert.equal(fs.readFileSync(previewAttachment).equals(png), true);
    assert.equal(fs.existsSync(path.join(data.previewAgent, 'attachments', 'source-conversation')), false);
    assert.deepEqual(fs.readFileSync(data.sourceDatabase), data.sourceDatabaseBytes);
    assert.equal(fs.readFileSync(path.join(data.sourceRoot, 'agent-service', 'attachments', 'source-conversation', 'source-image'), 'utf8'), 'source attachment\n');
    assert.equal(fs.readFileSync(path.join(data.sourceRoot, 'agent-service', 'handoff-materials', 'source-conversation', 'index.md'), 'utf8'), 'source handoff\n');
  } finally {
    await service.close();
  }

  const sourceDb = new DatabaseSync(data.sourceDatabase, { readOnly: true });
  assert.equal((sourceDb.prepare("SELECT COUNT(*) AS count FROM conversations WHERE id='source-conversation'").get() as { count: number }).count, 1);
  assert.equal((sourceDb.prepare("SELECT COUNT(*) AS count FROM conversations WHERE id<>'source-conversation'").get() as { count: number }).count, 0);
  sourceDb.close();

  const refreshed = await applyPreviewReuse({ selection, sourceRoot: data.sourceRoot, previewRoot: data.previewRoot, refresh: true, previous: facts });
  assert.deepEqual(refreshed.results.map((result) => result.status), ['refreshed', 'refreshed']);
  assert.deepEqual(fs.readFileSync(data.sourceDatabase), data.sourceDatabaseBytes);
  const afterRefresh = new DatabaseSync(path.join(data.previewAgent, 'conversations.sqlite'), { readOnly: true });
  assert.equal((afterRefresh.prepare("SELECT COUNT(*) AS count FROM conversations WHERE id='preview-conversation'").get() as { count: number }).count, 1);
  afterRefresh.close();
});

test('单个连接绑定失败只影响该连接，其他连接与预览继续可用', { timeout: 20_000 }, async (t) => {
  const data = fixture(t, { brokenProvider: true });
  const selection = parsePreviewReuseSelection('development:agent-runtime');
  const facts = await applyPreviewReuse({ selection, sourceRoot: data.sourceRoot, previewRoot: data.previewRoot });
  assert.equal(facts.results[1].status, 'failed');
  assert.ok(facts.results[1].diagnostics.some((entry) => entry.includes('codex')));
  const targetDb = new DatabaseSync(path.join(data.previewAgent, 'conversations.sqlite'), { readOnly: true });
  assert.equal((targetDb.prepare("SELECT COUNT(*) AS count FROM connections WHERE id='qoder'").get() as { count: number }).count, 1);
  assert.equal((targetDb.prepare("SELECT COUNT(*) AS count FROM connections WHERE id='codex'").get() as { count: number }).count, 0);
  targetDb.close();

  const service = createAgentService({
    dataRoot: data.previewRoot,
    executors: [fakeExecutor({ opens: [] })],
    environment: {},
    resolveWorkspace: () => ({ rootPath: data.previewRoot }),
    assertTask: () => {},
    shutdownTimeoutMs: 500,
  });
  try {
    assert.equal(service.connections.read('qoder').status, 'ready');
    assert.equal(service.connections.read('qoder').enabled, true);
  } finally {
    await service.close();
  }
});
