import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { AgentCapabilities, AgentExecutor, AgentRuntime, ExecutorItem } from '../../src/contracts.ts';
import { createAgentService, connectAgentProcess, prepareAgentRuntime, stopAgentProcess } from '../../src/index.ts';
import { createGoogleAiProxyProvider } from '../../src/model-access/providers/google-ai-proxy.ts';
import { cliProxyBinaryName } from '../../src/model-access/providers/google-ai-proxy-install.ts';
import { generateGatewayTitle } from '../../src/executors/model-title.ts';

function makeTempDir(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'google-ai-proxy-lifecycle-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(check: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(check(), 'condition timed out');
}

function writeMockCliProxy(directory: string, port: number, options: { ignoreSigterm?: boolean; neverListen?: boolean; pidFile: string; loginUrl?: string }): void {
  const authDir = path.join(directory, 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'antigravity-user.json'), JSON.stringify({
    type: 'antigravity',
    email: 'user@example.com',
    refresh_token: 'refresh-tok',
    project_id: 'proj-1',
  }));
  fs.writeFileSync(path.join(directory, 'config.yaml'), JSON.stringify({
    'config-version': 8,
    server: { host: '127.0.0.1', port },
    access: { 'api-keys': ['mock-key'] },
    oauth: { 'auth-dir': authDir },
  }));
  const binaryPath = path.join(directory, cliProxyBinaryName());
  const lines = [
    '#!/usr/bin/env node',
    "import http from 'node:http';",
    "import fs from 'node:fs';",
    'const args = process.argv.slice(2);',
    `const pidFile = ${JSON.stringify(options.pidFile)};`,
    'fs.writeFileSync(pidFile, String(process.pid));',
    options.ignoreSigterm
      ? "process.on('SIGTERM', () => {});"
      : "process.on('SIGTERM', () => process.exit(0));",
    "if (args.includes('-antigravity-login')) {",
    `  console.log(${JSON.stringify((options.loginUrl ?? 'https://accounts.google.com/o/oauth2/v2/auth?state=1') + ' ')});`,
    '  setInterval(() => {}, 1000);',
    ...(options.neverListen
      ? ['} else {', '  setInterval(() => {}, 1000);']
      : [
          '} else {',
          '  const server = http.createServer((req, res) => {',
          "    if (req.url === '/v1/models') {",
          "      res.writeHead(200, { 'content-type': 'application/json' });",
          "      res.end(JSON.stringify({ data: [{ id: 'gemini-4-carbon-high', display_name: 'Gemini 4 Carbon' }] }));",
          '      return;',
          '    }',
          '    res.writeHead(404);',
          '    res.end();',
          '  });',
          `  server.listen(${port}, '127.0.0.1');`,
        ]),
    '}',
    '',
  ];
  fs.writeFileSync(binaryPath, lines.join('\n'), { mode: 0o755 });
}

async function findFreePort(): Promise<number> {
  const net = await import('node:net');
  const srv = net.createServer();
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', () => resolve()));
  const port = (srv.address() as { port: number }).port;
  await new Promise<void>(resolve => srv.close(() => resolve()));
  return port;
}

test('closing AgentService stops running CLIProxyAPI server (including SIGTERM-ignoring process via SIGKILL)', async t => {
  for (const ignoreSigterm of [false, true]) {
    const root = makeTempDir(t);
    const proxyDir = path.join(root, 'CLIProxyAPI');
    const pidFile = path.join(root, 'proxy.pid');
    const port = await findFreePort();
    writeMockCliProxy(proxyDir, port, { ignoreSigterm, pidFile });

    const service = createAgentService({
      dataRoot: root,
      executors: [],
      modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 120 })],
      resolveWorkspace: () => ({ rootPath: root }),
      assertTask() {},
    });
    try {
      const added = await service.models.accounts.add({ provider: 'google-ai-subscription' });
      const checked = await service.models.accounts.check(added.id);
      assert.equal(checked.status, 'ready');
      assert.equal(checked.models.length, 1);
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      assert.equal(processAlive(pid), true);

      await service.close();
      await waitUntil(() => !processAlive(pid));
    } finally {
      await service.close();
    }
  }
});

test('cold-started CLIProxyAPI waits for async model registration, leaves config.yaml untouched, and routes each (series, effort) to exact upstream model ID', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const authDir = path.join(proxyDir, 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  const port = await findFreePort();
  const requestLogFile = path.join(root, 'requests.jsonl');
  const originalConfig = JSON.stringify({
    'config-version': 8,
    server: { host: '127.0.0.1', port },
    access: { 'api-keys': ['mock-key'] },
    oauth: { 'auth-dir': authDir },
  }) + '\n';
  fs.writeFileSync(path.join(proxyDir, 'config.yaml'), originalConfig);
  fs.writeFileSync(path.join(authDir, 'antigravity-user.json'), JSON.stringify({
    type: 'antigravity',
    email: 'user@example.com',
    refresh_token: 'refresh-tok',
    project_id: 'proj-1',
  }));

  const binaryPath = path.join(proxyDir, cliProxyBinaryName());
  fs.writeFileSync(binaryPath, [
    '#!/usr/bin/env node',
    "import http from 'node:http';",
    "import fs from 'node:fs';",
    "process.on('SIGTERM', () => process.exit(0));",
    'const args = process.argv.slice(2);',
    "const cfgIdx = args.indexOf('-config');",
    'const cfgPath = cfgIdx >= 0 ? args[cfgIdx + 1] : "";',
    'const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));',
    'const catalog = JSON.parse(fs.readFileSync(cfg.models.catalog, "utf8"));',
    'const allowed = new Set(["gemini-4-carbon-low", "gemini-4-carbon-medium", "gemini-4-carbon-high", "claude-opus-5-5-low", "claude-opus-5-5-medium", "claude-opus-5-5-high"]);',
    'const entitledModels = catalog.antigravity.filter(m => allowed.has(m.id)).map(m => ({ id: m.id, object: "model", owned_by: "antigravity" }));',
    'let modelPolls = 0;',
    'const server = http.createServer((req, res) => {',
    '  if (req.headers.authorization !== "Bearer mock-key") { res.writeHead(401); res.end(); return; }',
    '  if (req.url === "/v1/models") {',
    '    modelPolls++;',
    '    const data = modelPolls < 3 ? [] : entitledModels;',
    '    res.writeHead(200, { "content-type": "application/json" });',
    '    res.end(JSON.stringify({ object: "list", data }));',
    '    return;',
    '  }',
    '  let raw = "";',
    '  req.on("data", chunk => { raw += chunk; });',
    '  req.on("end", () => {',
    '    const parsed = JSON.parse(raw);',
    `    fs.appendFileSync(${JSON.stringify(requestLogFile)}, JSON.stringify({ url: req.url, body: parsed }) + "\\n");`,
    '    const promptText = JSON.stringify(parsed.messages ?? "");',
    '    const replyText = promptText.includes("精短标题") ? JSON.stringify({ title: "低推理标题:" + parsed.model }) : "ok:" + parsed.model;',
    '    res.writeHead(200, { "content-type": "application/json" });',
    '    if (req.url === "/v1/messages") {',
    '      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: parsed.model, content: [{ type: "text", text: replyText }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 3 } }));',
    '    } else {',
    '      res.end(JSON.stringify({ id: "cmpl_1", object: "chat.completion", model: parsed.model, choices: [{ index: 0, message: { role: "assistant", content: replyText }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }));',
    '    }',
    '  });',
    '});',
    `server.listen(${port}, "127.0.0.1");`,
    '',
  ].join('\n'), { mode: 0o755 });

  const dataRoot = path.join(root, 'data');
  let accountId: string;

  // First boot: add and inspect account to persist aggregated series catalog.
  const firstService = createAgentService({
    dataRoot,
    executors: [],
    modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 120 })],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    const added = await firstService.models.accounts.add({ provider: 'google-ai-subscription' });
    accountId = added.id;
    const checked = await firstService.models.accounts.check(accountId);
    assert.equal(checked.status, 'ready');
    assert.deepEqual(
      checked.models.map(m => ({ id: m.id, efforts: m.reasoningEfforts?.map(e => e.id), defaultEffort: m.defaultReasoningEffort })),
      [
        { id: 'gemini-4-carbon', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
        { id: 'claude-opus-5-5', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      ],
    );
    assert.equal(fs.readFileSync(path.join(proxyDir, 'config.yaml'), 'utf8'), originalConfig, 'config.yaml must stay untouched');
  } finally {
    await firstService.close();
  }

  // Second boot: cold-start inference BEFORE any inspect() call, plus legacy conversation continuation.
  const contexts = new Map<string, ExecutorItem[]>();
  const capabilities: AgentCapabilities = { text: true, images: true, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 100_000, permissionModes: ['default', 'full-access'] };
  const mockExecutor: AgentExecutor = {
    descriptor: { id: 'codex', label: 'Codex', capabilities },
    async open(input) {
      const gateway = input.gateway;
      const runtime: AgentRuntime = {
        bindingIdentity: 'codex-mock',
        capabilities,
        async inspectAccount() { return { status: 'ready' }; },
        async models() { return []; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext() { const ref = { id: randomUUID() }; contexts.set(ref.id, []); return ref; },
        async resumeContext({ contextRef }) { contexts.set(contextRef.id, contexts.get(contextRef.id) ?? []); },
        async readHistory({ contextRef }) { return structuredClone(contexts.get(contextRef.id) ?? []); },
        async send(sendInput) {
          const execId = randomUUID();
          sendInput.onEvent({ type: 'accepted', executionRef: { id: execId }, inputItemId: sendInput.clientRequestId });
          const res = await fetch(`${gateway!.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${gateway!.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: sendInput.model,
              stream: false,
              messages: [{ role: 'user', content: sendInput.text }],
              ...(sendInput.reasoningEffort ? { reasoning_effort: sendInput.reasoningEffort } : {}),
            }),
          });
          assert.equal(res.status, 200);
          const payload = await res.json() as { choices: Array<{ message: { content: string } }> };
          const text = payload.choices[0]!.message.content;
          const item: ExecutorItem = { id: randomUUID(), kind: 'message', role: 'assistant', text, executionId: execId, status: 'completed' };
          contexts.get(sendInput.contextRef.id)!.push(item);
          sendInput.onEvent({ type: 'item', item });
          sendInput.onEvent({ type: 'completed', status: 'completed' });
        },
        async observe({ executionRef }) { return { status: 'idle', executionRef, tools: [] }; },
        async reply() {},
        async stop() { return { status: 'stopped', tools: [] }; },
        async generateTitle(titleInput) {
          return generateGatewayTitle(
            gateway!,
            titleInput,
            gateway!.models[0]!.id === 'claude-opus-5-5' ? 'anthropic-messages' : 'chat-completions',
            new Set(['low', 'medium', 'high']),
          );
        },
        async close() {},
      };
      return runtime;
    },
  };

  const secondService = createAgentService({
    dataRoot,
    executors: [mockExecutor],
    modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 120 })],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    await secondService.connections.connect('codex', { expectedRevision: secondService.connections.read('codex').revision });
    const chat = await secondService.conversations.create('workspace', { title: 'Google AI Mapping Test' });

    // 1. Legacy persisted draft `gemini-4-carbon-high` with explicit `medium` must keep `medium` and hit `gemini-4-carbon-medium` on cold start!
    const legacyDraft = {
      expectedRevision: chat.revision,
      connectionId: 'codex',
      modelAccountId: accountId!,
      model: 'gemini-4-carbon-high',
      reasoningEffort: 'medium',
      permissionMode: 'full-access' as const,
      text: 'turn-1',
    };
    const preview1 = secondService.conversations.prepareSend('workspace', chat.id, legacyDraft);
    assert.equal(preview1.model, 'gemini-4-carbon');
    assert.equal(preview1.reasoningEffort, 'medium');
    secondService.conversations.send('workspace', chat.id, { ...legacyDraft, previewToken: preview1.token, clientRequestId: randomUUID() });
    await waitUntil(() => {
      const r = secondService.conversations.read('workspace', chat.id).run;
      if (r && ['failed', 'stopped', 'interrupted', 'unknown'].includes(r.status)) {
        assert.fail(`turn 1 status=${r.status}: ${r.diagnostic}`);
      }
      return r?.status === 'completed';
    });
    const after1 = secondService.conversations.read('workspace', chat.id);
    const firstParticipantId = after1.run!.participantId;

    // 2. Switching effort to `low` reuses the same participant without handoff and hits `gemini-4-carbon-low`.
    const lowDraft = {
      expectedRevision: after1.revision,
      connectionId: 'codex',
      modelAccountId: accountId!,
      model: 'gemini-4-carbon',
      reasoningEffort: 'low',
      permissionMode: 'full-access' as const,
      text: 'turn-2',
    };
    const preview2 = secondService.conversations.prepareSend('workspace', chat.id, lowDraft);
    assert.equal(preview2.switching, false);
    assert.equal(preview2.participantId, firstParticipantId);
    secondService.conversations.send('workspace', chat.id, { ...lowDraft, previewToken: preview2.token, clientRequestId: randomUUID() });
    await waitUntil(() => {
      const view = secondService.conversations.read('workspace', chat.id);
      if (view.run && ['failed', 'stopped', 'interrupted', 'unknown'].includes(view.run.status)) {
        assert.fail(`turn 2 status=${view.run.status}: ${view.run.diagnostic}`);
      }
      return view.run?.status === 'completed' && view.entries.some(e => e.role === 'assistant' && e.text.includes('gemini-4-carbon-low'));
    });

    // 3. Claude Opus 5.5 + `low` routes via `/v1/messages` with exact `claude-opus-5-5-low` and stripped effort fields.
    const claudeChat = await secondService.conversations.create('workspace', { title: 'Claude Mapping Test' });
    const claudeDraft = {
      expectedRevision: claudeChat.revision,
      connectionId: 'codex',
      modelAccountId: accountId!,
      model: 'claude-opus-5-5',
      reasoningEffort: 'low',
      permissionMode: 'full-access' as const,
      text: 'turn-claude',
    };
    const previewClaude = secondService.conversations.prepareSend('workspace', claudeChat.id, claudeDraft);
    secondService.conversations.send('workspace', claudeChat.id, { ...claudeDraft, previewToken: previewClaude.token, clientRequestId: randomUUID() });
    await waitUntil(() => {
      const r = secondService.conversations.read('workspace', claudeChat.id).run;
      if (r && ['failed', 'stopped', 'interrupted', 'unknown'].includes(r.status)) {
        assert.fail(`claude turn status=${r.status}: ${r.diagnostic}`);
      }
      return r?.status === 'completed';
    });

    const logged = fs.readFileSync(requestLogFile, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as { url: string; body: Record<string, unknown> });
    assert.deepEqual(
      logged.map(entry => ({
        url: entry.url,
        model: entry.body.model,
        hasReasoningEffort: 'reasoning_effort' in entry.body,
        hasReasoning: 'reasoning' in entry.body,
        hasOutputConfig: 'output_config' in entry.body,
        hasThinking: 'thinking' in entry.body,
      })),
      [
        { url: '/v1/chat/completions', model: 'gemini-4-carbon-medium', hasReasoningEffort: false, hasReasoning: false, hasOutputConfig: false, hasThinking: false },
        { url: '/v1/chat/completions', model: 'gemini-4-carbon-low', hasReasoningEffort: false, hasReasoning: false, hasOutputConfig: false, hasThinking: false },
        { url: '/v1/messages', model: 'claude-opus-5-5-low', hasReasoningEffort: false, hasReasoning: false, hasOutputConfig: false, hasThinking: false },
      ],
    );
    assert.equal(fs.readFileSync(path.join(proxyDir, 'config.yaml'), 'utf8'), originalConfig);

    // 4. Request-level reasoning overrides lease default even while the main turn runs at high effort.
    const geminiTitleChat = await secondService.conversations.create('workspace', {});
    const geminiHighDraft = {
      expectedRevision: geminiTitleChat.revision,
      connectionId: 'codex',
      modelAccountId: accountId!,
      model: 'gemini-4-carbon',
      reasoningEffort: 'high',
      permissionMode: 'full-access' as const,
      text: 'turn-gemini-title',
    };
    const geminiTitlePreview = secondService.conversations.prepareSend('workspace', geminiTitleChat.id, geminiHighDraft);
    secondService.conversations.send('workspace', geminiTitleChat.id, { ...geminiHighDraft, previewToken: geminiTitlePreview.token, clientRequestId: randomUUID() });
    let resolvedGemini!: ReturnType<typeof secondService.conversations.read>;
    await waitUntil(() => {
      resolvedGemini = secondService.conversations.read('workspace', geminiTitleChat.id);
      if (resolvedGemini.run && ['failed', 'stopped', 'interrupted', 'unknown'].includes(resolvedGemini.run.status)) {
        assert.fail(`gemini title turn status=${resolvedGemini.run.status}: ${resolvedGemini.run.diagnostic}`);
      }
      if (resolvedGemini.titleState?.status === 'failed') {
        assert.fail(`gemini title failed: ${resolvedGemini.titleState.reason}`);
      }
      return resolvedGemini.run?.status === 'completed' && resolvedGemini.titleState?.status === 'generated';
    });
    assert.equal(resolvedGemini.title, '低推理标题:gemini-4-carbon-low');
    assert.equal(resolvedGemini.entries.some(entry => entry.role === 'assistant' && entry.text.includes('gemini-4-carbon-high')), true);

    const claudeTitleChat = await secondService.conversations.create('workspace', {});
    const claudeHighDraft = {
      expectedRevision: claudeTitleChat.revision,
      connectionId: 'codex',
      modelAccountId: accountId!,
      model: 'claude-opus-5-5',
      reasoningEffort: 'high',
      permissionMode: 'full-access' as const,
      text: 'turn-claude-title',
    };
    const claudeTitlePreview = secondService.conversations.prepareSend('workspace', claudeTitleChat.id, claudeHighDraft);
    secondService.conversations.send('workspace', claudeTitleChat.id, { ...claudeHighDraft, previewToken: claudeTitlePreview.token, clientRequestId: randomUUID() });
    let resolvedClaude!: ReturnType<typeof secondService.conversations.read>;
    await waitUntil(() => {
      resolvedClaude = secondService.conversations.read('workspace', claudeTitleChat.id);
      if (resolvedClaude.run && ['failed', 'stopped', 'interrupted', 'unknown'].includes(resolvedClaude.run.status)) {
        assert.fail(`claude title turn status=${resolvedClaude.run.status}: ${resolvedClaude.run.diagnostic}`);
      }
      if (resolvedClaude.titleState?.status === 'failed') {
        assert.fail(`claude title failed: ${resolvedClaude.titleState.reason}`);
      }
      return resolvedClaude.run?.status === 'completed' && resolvedClaude.titleState?.status === 'generated';
    });
    assert.equal(resolvedClaude.title, '低推理标题:claude-opus-5-5-low');
    assert.equal(resolvedClaude.entries.some(entry => entry.role === 'assistant' && entry.text.includes('claude-opus-5-5-high')), true);

    const loggedAfterTitles = fs.readFileSync(requestLogFile, 'utf8')
      .trim()
      .split('\n')
      .slice(3)
      .map(line => JSON.parse(line) as { url: string; body: Record<string, unknown> });
    const geminiTitleReq = loggedAfterTitles.find(entry => entry.url === '/v1/chat/completions' && entry.body.model === 'gemini-4-carbon-low');
    assert.ok(geminiTitleReq);
    assert.equal(geminiTitleReq.body.max_tokens, 512);
    assert.equal('reasoning_effort' in geminiTitleReq.body, false);
    const claudeTitleReq = loggedAfterTitles.find(entry => entry.url === '/v1/messages' && entry.body.model === 'claude-opus-5-5-low');
    assert.ok(claudeTitleReq);
    assert.equal(claudeTitleReq.body.max_tokens, 512);
    assert.equal('output_config' in claudeTitleReq.body, false);
  } finally {
    await secondService.close();
  }
});

test('closing AgentService while CLIProxyAPI is still starting terminates the starting child without leaving orphans', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-starting.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { neverListen: true, pidFile });

  const service = createAgentService({
    dataRoot: root,
    executors: [],
    modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 80 })],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    const added = await service.models.accounts.add({ provider: 'google-ai-subscription' });
    const checking = service.models.accounts.check(added.id);
    await waitUntil(() => fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(pid), true);

    await service.close();
    await checking.catch(() => {});
    await waitUntil(() => !processAlive(pid));
  } finally {
    await service.close();
  }
});

test('closing AgentService while -antigravity-login is active terminates the login subprocess', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-login.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const service = createAgentService({
    dataRoot: root,
    executors: [],
    modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 80 })],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    const added = await service.models.accounts.add({ provider: 'google-ai-subscription' });
    await service.models.accounts.login(added.id, { expectedRevision: added.revision });
    await waitUntil(() => fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(pid), true);

    await service.close();
    await waitUntil(() => !processAlive(pid));
  } finally {
    await service.close();
  }
});

test('stopping isolated AgentProcess via authenticated shutdown terminates its CLIProxyAPI child process', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-process.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const packageRoot = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent');
  const runtime = prepareAgentRuntime({ dataRoot: root, packageRoot });
  const connection = await connectAgentProcess({
    dataRoot: root,
    profileId: 'test',
    sourceId: 'buildr',
    runtime,
  });
  try {
    const added = await connection.operations.models.accounts.add({ provider: 'google-ai-subscription' });
    const checked = await connection.operations.models.accounts.check(added.id);
    assert.equal(checked.status, 'ready');
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(pid), true);

    await connection.disconnect();
    await stopAgentProcess({ dataRoot: root, profileId: 'test', mode: 'stop-owned' });
    await waitUntil(() => !processAlive(pid));
  } finally {
    await connection.disconnect().catch(() => {});
    await stopAgentProcess({ dataRoot: root, profileId: 'test', mode: 'stop-owned' }).catch(() => {});
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (processAlive(pid)) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
    }
  }
});

test('unexpected parent exit synchronously kills tracked CLIProxyAPI child via exit hook', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-exit.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const runner = path.join(root, 'spawn-and-exit.ts');
  const providerModule = path.resolve(import.meta.dirname, '../../src/model-access/providers/google-ai-proxy.ts');
  const runnerLines = [
    `import { createGoogleAiProxyProvider } from ${JSON.stringify(providerModule)};`,
    `const runtime = await createGoogleAiProxyProvider(${JSON.stringify(proxyDir)}).open({ accountId: 'g', configRoot: ${JSON.stringify(proxyDir)}, environment: {} });`,
    'const obs = await runtime.inspect();',
    "if (obs.status !== 'ready') process.exit(2);",
    'process.exit(0);',
    '',
  ];
  fs.writeFileSync(runner, runnerLines.join('\n'));
  const child = spawn(process.execPath, [runner], { cwd: root, stdio: 'inherit' });
  const code = await new Promise<number | null>(resolve => child.once('exit', resolve));
  assert.equal(code, 0);
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  await waitUntil(() => !processAlive(pid));
});

test('SIGTERM on isolated AgentProcess terminates both AgentProcess and its CLIProxyAPI child', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-sigterm.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const packageRoot = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent');
  const runtime = prepareAgentRuntime({ dataRoot: root, packageRoot });
  const connection = await connectAgentProcess({
    dataRoot: root,
    profileId: 'test',
    sourceId: 'buildr',
    runtime,
  });
  try {
    const added = await connection.operations.models.accounts.add({ provider: 'google-ai-subscription' });
    const checked = await connection.operations.models.accounts.check(added.id);
    assert.equal(checked.status, 'ready');
    const status = await connection.lifecycle.status();
    const agentPid = status.identity.pid;
    const proxyPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(agentPid), true);
    assert.equal(processAlive(proxyPid), true);

    await connection.disconnect();
    process.kill(agentPid, 'SIGTERM');
    await waitUntil(() => !processAlive(agentPid) && !processAlive(proxyPid), 8_000);
  } finally {
    await connection.disconnect().catch(() => {});
    await stopAgentProcess({ dataRoot: root, profileId: 'test', mode: 'stop-owned' }).catch(() => {});
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (processAlive(pid)) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
    }
  }
});
