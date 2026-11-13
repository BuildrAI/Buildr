import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { AgentExecutor, AgentProgramManager, ServiceEvent } from '../../src/contracts.ts';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import { createAntigravityExecutor } from '../../src/executors/antigravity/index.ts';
import { createNativeExecutors } from '../../src/executors/index.ts';
import { createAgentService } from '../../src/index.ts';
import { ModelAccessError } from '../../src/model-access/contracts.ts';

const fixtureSource = fileURLToPath(new URL('./executors/fixtures/antigravity-acp.mjs', import.meta.url));
const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));

async function waitUntil<T>(
  read: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest = await read();
  while (!predicate(latest)) {
    if (Date.now() >= deadline) {
      assert.fail(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    latest = await read();
  }
  return latest;
}

async function collectFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function createServiceHarness(
  t: test.TestContext,
  options: {
    initialControl?: Record<string, unknown>;
    initialAuth?: Record<string, unknown>;
    executors?: AgentExecutor[];
  } = {},
) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'buildr-agy-acc-')));
  const dataRoot = path.join(root, 'profile');
  const workspaceRoot = path.join(root, 'workspace');
  const binDir = path.join(root, 'managed-bin');
  const executable = path.join(binDir, 'antigravity-acp.mjs');
  const connectionRoot = path.join(dataRoot, 'agent-service', 'connections', 'antigravity');
  const cliDir = path.join(connectionRoot, 'home', '.gemini', 'antigravity-cli');
  const keyringFile = path.join(cliDir, 'fixture-keyring.json');
  const controlFile = path.join(cliDir, 'fixture-control.json');

  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await mkdir(cliDir, { recursive: true });
  await copyFile(fixtureSource, executable);
  await writeFile(controlFile, JSON.stringify(options.initialControl ?? { autoAllow: true }, null, 2) + '\n');
  await writeFile(
    keyringFile,
    JSON.stringify(options.initialAuth ?? { authenticated: false }, null, 2) + '\n',
  );

  const programManager: AgentProgramManager = {
    async discover(input) {
      if (input.provider === 'antigravity') {
        return {
          candidates: [
            {
              executable,
              source: 'managed',
              label: 'Antigravity CLI (Managed)',
              version: '1.5.8',
              compatible: true,
            },
          ],
          installation: {
            label: 'Antigravity CLI',
            version: '1.5.8',
            url: 'https://antigravity.google/docs/getting-started?tab=cli',
            canInstall: true,
          },
        };
      }
      return {
        candidates: [],
        installation: {
          label: input.provider,
          version: '0.0.0',
          url: 'https://example.invalid',
          canInstall: false,
        },
      };
    },
    async install() {
      return executable;
    },
  };

  const environment: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: root,
  };

  const events: ServiceEvent[] = [];
  const service = createAgentService({
    dataRoot,
    environment,
    programManager,
    ...(options.executors ? { executors: options.executors } : {}),
    resolveWorkspace: () => ({ rootPath: workspaceRoot }),
    assertTask() {},
  });
  const watcherChat = await service.conversations.create('workspace', { title: 'event-watcher' });
  const sub = service.conversations.subscribe('workspace', watcherChat.id);
  const pump = (async () => {
    for await (const event of sub.events) {
      events.push(event);
    }
  })().catch(() => {});

  t.after(async () => {
    sub.close();
    await pump;
    await service.close();
    await rm(root, { recursive: true, force: true });
  });

  async function setControl(patch: Record<string, unknown>) {
    const current = JSON.parse(await readFile(controlFile, 'utf8').catch(() => '{}'));
    await writeFile(controlFile, JSON.stringify({ ...current, ...patch }, null, 2) + '\n');
  }

  async function setAuth(nextAuth: Record<string, unknown>) {
    await writeFile(keyringFile, JSON.stringify(nextAuth, null, 2) + '\n');
  }

  async function prepareAntigravity() {
    const current = service.connections.read('antigravity');
    const attempt = service.connections.prepare('antigravity', {
      expectedRevision: current.revision,
      executable,
    });
    const settled = await waitUntil(
      () => service.connections.preparation('antigravity', attempt.id),
      view => view.state === 'ready' || view.state === 'failed',
      'antigravity preparation',
    );
    assert.equal(settled.state, 'ready', settled.message);
    return settled.connection;
  }

  return {
    root,
    dataRoot,
    workspaceRoot,
    executable,
    events,
    service,
    setControl,
    setAuth,
    prepareAntigravity,
  };
}

test('5.1: D7 Google personal account status table, default model enablement, executor exclusivity and zero gateway inference', async t => {
  const codexStub: AgentExecutor = {
    descriptor: {
      id: 'codex',
      label: 'Codex',
      capabilities: {
        text: true,
        images: false,
        approval: false,
        questions: false,
        stop: true,
        resume: true,
        maxInputBytes: 65536,
      },
      modelPolicy: {
        account: 'native',
        gateway: {
          protocol: 'responses',
        },
      },
    },
    async open() {
      return {
        bindingIdentity: 'codex-stub',
        capabilities: {
          text: true,
          images: false,
          approval: false,
          questions: false,
          stop: true,
          resume: true,
          maxInputBytes: 65536,
        },
        inspectAccount: async () => ({ status: 'ready' }),
        models: async () => [{ id: 'gpt-5', label: 'GPT-5' }],
        beginLogin: async () => {},
        cancelLogin: async () => {},
        createContext: async () => ({ id: randomUUID() }),
        resumeContext: async () => {},
        readHistory: async () => [],
        send: async () => {},
        observe: async () => ({ status: 'idle', tools: [] }),
        reply: async () => {},
        stop: async () => ({ status: 'stopped', tools: [] }),
        close: async () => {},
      };
    },
  };

  const executors = createNativeExecutors().map(exec => (exec.descriptor.id === 'codex' ? codexStub : exec));
  const h = await createServiceHarness(t, {
    initialAuth: { authenticated: false },
    executors,
  });

  await h.prepareAntigravity();
  await h.service.connections.connect('codex', { expectedRevision: 'unconfigured', executable: h.executable });
  await h.service.models.catalog.list({ refresh: true });

  // Row 1: not-authenticated
  const unauth = await h.service.models.accounts.check('native-antigravity');
  assert.equal(unauth.status, 'not-authenticated');
  assert.equal(unauth.models.length, 0);
  assert.equal(unauth.inference, 'none');
  assert.equal(unauth.sharing?.kind, 'executor-exclusive');
  assert.deepEqual(unauth.sharing?.executors, ['antigravity']);
  assert.equal(unauth.presentation?.billing?.url, 'https://one.google.com/about/ai-plans');
  assert.ok(unauth.presentation?.quotaUnavailableNote?.includes('未公开订阅剩余额度'));

  // Executor compatibility: ONLY antigravity is compatible
  const compatById = Object.fromEntries(
    (unauth.executorCompatibility ?? []).map(entry => [entry.connectionId, entry]),
  );
  assert.equal(compatById.antigravity?.compatible, true);
  for (const other of ['codex', 'claude-code', 'qoder', 'qoder-cn', 'dsh']) {
    assert.equal(compatById[other]?.compatible, false, `${other} must be incompatible`);
    assert.equal(compatById[other]?.reasonCode, 'agent_model_source_unsupported');
  }

  // Row 2a: Free tier -> ready ("免费账号")
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'free-tier', name: 'Free' },
  });
  const freeAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(freeAcc.status, 'ready');
  assert.equal(freeAcc.quota?.available, false);
  assert.equal(freeAcc.quota?.planLabel, '免费账号');
  assert.ok(freeAcc.models.length >= 2);
  assert.ok(freeAcc.models.every(m => m.enabled === true), 'discovered models must be enabled by default');

  // Row 2b: Pro tier -> ready ("Google AI Pro")
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
  });
  const proAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(proAcc.status, 'ready');
  assert.equal(proAcc.quota?.planLabel, 'Google AI Pro');

  // Row 2c: Ultra tier -> ready ("Google AI Ultra")
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
  });
  const ultraAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(ultraAcc.status, 'ready');
  assert.equal(ultraAcc.quota?.planLabel, 'Google AI Ultra');

  // Row 2d: Unreadable tier -> ready ("档位不可读")
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'mystery-tier', name: 'Unknown Plan' },
  });
  const unreadableTierAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(unreadableTierAcc.status, 'ready');
  assert.equal(unreadableTierAcc.quota?.planLabel, '档位不可读');

  // Other executor cannot consume native-antigravity via gateway or native route
  const codexChat = await h.service.conversations.create('workspace', {});
  assert.throws(
    () =>
      h.service.conversations.prepareSend('workspace', codexChat.id, {
        expectedRevision: codexChat.revision,
        connectionId: 'codex',
        modelAccountId: 'native-antigravity',
        model: 'gemini-2.5-pro',
        text: 'must be rejected on codex',
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_model_source_unsupported',
  );

  // Direct gateway inference / lease creation is rejected (inference: 'none')
  await assert.rejects(
    () =>
      h.service.models.generate({
        accountId: 'native-antigravity',
        modelId: 'gemini-2.5-pro',
        agentId: 'antigravity',
        conversationId: randomUUID(),
        runId: randomUUID(),
        prompt: 'must not proxy Google OAuth token',
        signal: new AbortController().signal,
      }),
    (err: unknown) => err instanceof ModelAccessError && err.code === 'model_source_inference_unavailable',
  );

  // Row 5: Expired after a Pro observation -> preserves last observed planLabel ("Google AI Pro") and blocks send
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
  });
  await h.service.models.accounts.check('native-antigravity');
  await h.setAuth({
    authenticated: true,
    expired: true,
    methodId: 'oauth-personal',
  });
  const expiredAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(expiredAcc.status, 'expired');
  assert.equal(expiredAcc.quota?.planLabel, 'Google AI Pro');
  assert.match(expiredAcc.diagnostic ?? '', /过期|重新登录/);
  const agyChat = await h.service.conversations.create('workspace', {});
  assert.throws(
    () =>
      h.service.conversations.prepareSend('workspace', agyChat.id, {
        expectedRevision: agyChat.revision,
        connectionId: 'antigravity',
        modelAccountId: 'native-antigravity',
        model: 'gemini-2.5-pro',
        text: 'blocked while expired',
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_model_source_unavailable',
  );

  // Row 3: Logged in but empty model catalog -> failed ("无可用模型")
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
    models: [],
  });
  const emptyModelsAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(emptyModelsAcc.status, 'failed');
  assert.match(emptyModelsAcc.diagnostic ?? '', /未返回任何可用模型|无可用模型/);

  // Row 4: Explicit account field present but corrupted/empty -> failed ("身份不可确认")
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    email: '   ',
    tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
  });
  const unconfirmedAcc = await h.service.models.accounts.check('native-antigravity');
  assert.equal(unconfirmedAcc.status, 'failed');
  assert.equal(unconfirmedAcc.accountLabel, '身份不可确认');
  assert.match(unconfirmedAcc.diagnostic ?? '', /身份不可确认/);
});

test('5.2: official login state machine, waiting-browser URL scoping, cancellation cleanup and log redaction', async t => {
  const secretState = 'secret-oauth-state-token-9f8e7d6c';
  const h = await createServiceHarness(t, {
    initialControl: {
      autoAllow: true,
      loginStateParam: secretState,
      loginCompleteDelayMs: 2000,
      nextLoginAuth: {
        authenticated: true,
        methodId: 'oauth-personal',
        tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
      },
    },
    initialAuth: { authenticated: false },
  });

  await h.prepareAntigravity();
  await h.service.models.catalog.list({ refresh: true });
  const started = h.service.connections.login('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
  });
  const attemptId = started.loginAttempt?.id;
  assert.ok(attemptId);

  const waiting = await waitUntil(
    () => h.service.connections.loginAttempt('antigravity', attemptId),
    view => view.loginAttempt?.state === 'waiting-browser' && Boolean(view.loginAttempt.url),
    'waiting-browser login attempt with URL',
  );
  assert.match(waiting.loginAttempt?.url ?? '', /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  assert.ok(waiting.loginAttempt?.url?.includes(secretState));

  // Public connection read/list, model account read, and emitted events must NEVER expose the auth URL or secret state
  assert.equal(h.service.connections.read('antigravity').loginAttempt?.url, undefined);
  assert.equal(
    h.service.connections.list().connections.find(c => c.id === 'antigravity')?.loginAttempt?.url,
    undefined,
  );
  assert.equal(h.service.models.accounts.read('native-antigravity').loginAttempt?.url, undefined);

  const completed = await waitUntil(
    () => h.service.connections.loginAttempt('antigravity', attemptId),
    view => view.loginAttempt?.state === 'completed' && view.status === 'ready',
    'completed login attempt',
  );
  // Once completed, even the dedicated loginAttempt endpoint clears url
  assert.equal(completed.loginAttempt?.url, undefined);
  assert.equal(completed.status, 'ready');
  assert.equal(h.service.models.accounts.read('native-antigravity').status, 'ready');
  assert.equal(h.service.models.accounts.read('native-antigravity').quota?.planLabel, 'Google AI Ultra');

  // Verify cancellation clears waiting-browser URL immediately
  await h.setAuth({ authenticated: false });
  await h.setControl({ loginHang: true, forceInteractiveLogin: true, loginStateParam: `${secretState}-cancel` });
  const cancelStart = h.service.connections.login('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
  });
  const cancelAttemptId = cancelStart.loginAttempt!.id;
  await waitUntil(
    () => h.service.connections.loginAttempt('antigravity', cancelAttemptId),
    view => view.loginAttempt?.state === 'waiting-browser' && Boolean(view.loginAttempt.url),
    'second waiting-browser login attempt',
  );
  const cancelled = await h.service.connections.cancelLogin('antigravity', cancelAttemptId, {
    expectedRevision: h.service.connections.read('antigravity').revision,
  });
  assert.equal(cancelled.loginAttempt?.state, 'cancelled');
  assert.equal(cancelled.loginAttempt?.url, undefined);
  assert.equal(
    h.service.connections.loginAttempt('antigravity', cancelAttemptId).loginAttempt?.url,
    undefined,
  );

  // Events, SQLite, accounts.json, and diagnostics logs must NOT contain secretState
  const serializedEvents = JSON.stringify(h.events);
  assert.equal(serializedEvents.includes(secretState), false, 'ServiceEvents must never contain OAuth state or auth URL');

  const serviceFiles = await collectFiles(path.join(h.dataRoot, 'agent-service'));
  for (const file of serviceFiles) {
    if (file.includes(`${path.sep}connections${path.sep}antigravity${path.sep}home${path.sep}`)) continue;
    const raw = await readFile(file);
    assert.equal(
      raw.includes(Buffer.from(secretState)),
      false,
      `Persisted file ${file} leaked OAuth query parameter`,
    );
  }
});

test('5.3a: sendGate coordination, active run stop, switchAccount isolation, disable/re-enable and zero direct keyring access', async t => {
  const h = await createServiceHarness(t, {
    initialControl: { autoAllow: true },
    initialAuth: {
      authenticated: true,
      methodId: 'oauth-personal',
      tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
    },
  });

  await h.prepareAntigravity();
  await h.service.connections.check('antigravity');
  const initialAccount = await h.service.models.accounts.check('native-antigravity');
  assert.equal(initialAccount.status, 'ready');
  const initialIdentity = initialAccount.identity;

  // Disable source -> blocks sends without logging out; re-enable -> immediately ready with same identity!
  const disabledAcc = await h.service.models.accounts.preferences('native-antigravity', {
    expectedRevision: initialAccount.revision,
    sourceEnabled: false,
  });
  assert.equal(disabledAcc.sourceEnabled, false);
  const probeChat = await h.service.conversations.create('workspace', {});
  assert.throws(
    () =>
      h.service.conversations.prepareSend('workspace', probeChat.id, {
        expectedRevision: probeChat.revision,
        connectionId: 'antigravity',
        modelAccountId: 'native-antigravity',
        model: 'gemini-2.5-pro',
        text: 'blocked when source disabled',
      }),
    /停用/,
  );

  const reenabledAcc = await h.service.models.accounts.preferences('native-antigravity', {
    expectedRevision: disabledAcc.revision,
    sourceEnabled: true,
  });
  assert.equal(reenabledAcc.sourceEnabled, true);
  assert.equal(reenabledAcc.status, 'ready');
  assert.equal(reenabledAcc.identity, initialIdentity, 're-enabling must preserve login epoch without re-login');

  // Start a long-running conversation on Antigravity (via control scenario so handoff text won't re-trigger)
  await h.setControl({ scenario: 'long-command' });
  const runningChat = await h.service.conversations.create('workspace', { title: '正在运行的研发对话' });
  const runDraft = {
    expectedRevision: runningChat.revision,
    connectionId: 'antigravity',
    modelAccountId: 'native-antigravity',
    model: 'gemini-2.5-pro',
    text: '请执行耗时构建检查',
  };
  const runPreview = h.service.conversations.prepareSend('workspace', runningChat.id, runDraft);
  h.service.conversations.send('workspace', runningChat.id, {
    ...runDraft,
    previewToken: runPreview.token,
    clientRequestId: randomUUID(),
  });

  await waitUntil(
    () => h.service.conversations.read('workspace', runningChat.id),
    view => view.run?.status === 'running' && (view.run.tools?.length ?? 0) > 0,
    'running tool execution on Antigravity',
  );

  // Check accountImpact lists the running conversation and hostKeyringAuth: true
  const impact = await h.service.connections.accountImpact('antigravity');
  assert.equal(impact.hostKeyringAuth, true);
  assert.equal(impact.activeConversations.length, 1);
  assert.equal(impact.activeConversations[0]?.conversationId, runningChat.id);

  // Configure interactive login to hang so we can inspect the paused sendGate during switchAccount!
  await h.setControl({
    autoAllow: true,
    loginHang: true,
    forceInteractiveLogin: true,
    nextLoginAuth: {
      authenticated: true,
      methodId: 'oauth-personal',
      tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
    },
  });

  const switched = await h.service.connections.logout('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
    switchAccount: true,
  });

  // Active conversation was stopped and released control cleanly
  const stoppedView = h.service.conversations.read('workspace', runningChat.id);
  assert.ok(
    stoppedView.run?.status === 'stopped'
      || (stoppedView.run?.status === 'unknown' && stoppedView.run?.resourcesReleased === true),
    `Expected stopped or released-unknown run, got ${JSON.stringify(stoppedView.run)}`,
  );

  // Connection sendGate is paused during switchAccount's waiting-browser phase
  assert.equal(switched.sendGate?.state, 'paused');
  assert.equal(switched.sendGate?.reason, 'account-change');
  const switchAttemptId = switched.loginAttempt?.id;
  assert.ok(switchAttemptId);

  await waitUntil(
    () => h.service.connections.loginAttempt('antigravity', switchAttemptId),
    view => view.loginAttempt?.state === 'waiting-browser',
    'switchAccount waiting-browser',
  );

  // While sendGate is paused: prepareSend AND queueSend MUST fail and NOT enter pendingSend!
  const blockedChat = await h.service.conversations.create('workspace', {});
  assert.throws(
    () =>
      h.service.conversations.prepareSend('workspace', blockedChat.id, {
        expectedRevision: blockedChat.revision,
        connectionId: 'antigravity',
        text: 'must not prepare while paused',
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_connection_send_paused',
  );
  assert.throws(
    () =>
      h.service.conversations.queueSend('workspace', blockedChat.id, {
        expectedRevision: blockedChat.revision,
        connectionId: 'antigravity',
        text: 'must not queue while paused',
        clientRequestId: randomUUID(),
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_connection_send_paused',
  );
  assert.equal(h.service.conversations.read('workspace', blockedChat.id).pendingSend, undefined);

  // Cancel the hanging login and run a fast completing login to finish switching to the new account
  await h.service.connections.cancelLogin('antigravity', switchAttemptId, {
    expectedRevision: h.service.connections.read('antigravity').revision,
  });
  assert.equal(h.service.connections.read('antigravity').sendGate, undefined, 'cancelling switch login reopens gate');

  await h.setControl({
    scenario: '',
    autoAllow: true,
    loginHang: false,
    forceInteractiveLogin: true,
    loginCompleteDelayMs: 60,
    nextLoginAuth: {
      authenticated: true,
      methodId: 'oauth-personal',
      tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
    },
  });
  const finishLogin = h.service.connections.login('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
  });
  await waitUntil(
    () => h.service.connections.loginAttempt('antigravity', finishLogin.loginAttempt!.id),
    view => view.loginAttempt?.state === 'completed' && view.status === 'ready',
    'new account login completed',
  );
  assert.equal(h.service.connections.read('antigravity').sendGate, undefined);
  const newAccount = await waitUntil(
    () => h.service.models.accounts.read('native-antigravity'),
    acc => acc.status === 'ready',
    'switched model account ready',
  );
  assert.notEqual(newAccount.identity, initialIdentity, 'switched account must have a fresh binding identity');

  // 1) Old conversation draft carrying previous modelAccountIdentity MUST be rejected with agent_model_source_changed
  const latestOldChat = h.service.conversations.read('workspace', runningChat.id);
  const initialContextId = latestOldChat.participants[0]?.contextId;
  assert.throws(
    () =>
      h.service.conversations.prepareSend('workspace', runningChat.id, {
        expectedRevision: latestOldChat.revision,
        connectionId: 'antigravity',
        modelAccountId: 'native-antigravity',
        modelAccountIdentity: initialIdentity,
        model: 'gemini-2.5-pro',
        text: '试图沿用旧账号身份继续发送',
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_model_source_changed',
  );

  // 2) Explicitly selecting the new account identity isolates execution into a brand-new native session!
  const reselectedDraft = {
    expectedRevision: latestOldChat.revision,
    connectionId: 'antigravity',
    modelAccountId: 'native-antigravity',
    modelAccountIdentity: newAccount.identity,
    model: 'gemini-2.5-pro',
    text: '已确认切换到新账号后继续工作',
  };
  const oldPreview = h.service.conversations.prepareSend('workspace', runningChat.id, reselectedDraft);
  h.service.conversations.send('workspace', runningChat.id, {
    ...reselectedDraft,
    previewToken: oldPreview.token,
    clientRequestId: randomUUID(),
  });
  const settledOld = await waitUntil(
    () => h.service.conversations.read('workspace', runningChat.id),
    view => view.run?.status === 'completed' || view.run?.status === 'failed',
    'post-switch conversation turn',
  );
  assert.equal(settledOld.run?.status, 'completed', settledOld.run?.diagnostic);
  const latestContextId = settledOld.participants.at(-1)?.contextId;
  assert.notEqual(latestContextId, initialContextId, 'new account must never reuse the old native session');

  // Plain logout (switchAccount: false) -> disconnects connection and clears native-antigravity to not-authenticated
  const loggedOut = await h.service.connections.logout('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
    switchAccount: false,
  });
  assert.equal(loggedOut.enabled, false);
  assert.equal(loggedOut.status, 'disconnected');
  assert.equal(loggedOut.sendGate, undefined);
  assert.equal(h.service.models.accounts.read('native-antigravity').status, 'not-authenticated');

  // Static verification: zero direct OS keyring access in buildr-agent source files
  const sourceFiles = (await collectFiles(srcRoot)).filter(file => file.endsWith('.ts'));
  assert.ok(sourceFiles.length > 20);
  const forbiddenKeyringPatterns = [
    'find-generic-password',
    'delete-generic-password',
    'add-generic-password',
    'secret-tool',
    'cmdkey',
    'keytar',
    'jetski-standalone-oauth-token',
  ];
  for (const file of sourceFiles) {
    const text = await readFile(file, 'utf8');
    for (const pattern of forbiddenKeyringPatterns) {
      assert.equal(
        text.includes(pattern),
        false,
        `Source file ${file} must not directly touch OS keyring (${pattern})`,
      );
    }
  }
});

test('5.3b: logout aborts when active run stop cannot be proven, and re-observes identity on logout RPC failures', async t => {
  // Part 1: Unconfirmed stop aborts logout and restores sendGate to open
  const realAntigravity = createAntigravityExecutor();
  let forceUnstoppable = true;
  const wrappedAntigravity: AgentExecutor = {
    descriptor: realAntigravity.descriptor,
    ...(realAntigravity.readReleasedControl
      ? {
          async readReleasedControl(input) {
            if (forceUnstoppable) return false;
            return realAntigravity.readReleasedControl!(input);
          },
        }
      : {}),
    async open(options) {
      const inner = await realAntigravity.open(options);
      return new Proxy(inner, {
        get(target, prop, receiver) {
          if (prop === 'stop' && forceUnstoppable) {
            return async () => ({ status: 'running' as const, tools: [] });
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
  const executors = createNativeExecutors().map(exec =>
    exec.descriptor.id === 'antigravity' ? wrappedAntigravity : exec,
  );
  const h = await createServiceHarness(t, {
    executors,
    initialControl: { autoAllow: true },
    initialAuth: {
      authenticated: true,
      methodId: 'oauth-personal',
      tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
    },
  });

  await h.prepareAntigravity();
  await h.service.connections.check('antigravity');
  await h.service.models.accounts.check('native-antigravity');

  const chat = await h.service.conversations.create('workspace', {});
  const draft = {
    expectedRevision: chat.revision,
    connectionId: 'antigravity',
    modelAccountId: 'native-antigravity',
    model: 'gemini-2.5-pro',
    text: '长耗时任务 [LONG_COMMAND]',
  };
  const preview = h.service.conversations.prepareSend('workspace', chat.id, draft);
  h.service.conversations.send('workspace', chat.id, {
    ...draft,
    previewToken: preview.token,
    clientRequestId: randomUUID(),
  });
  await waitUntil(
    () => h.service.conversations.read('workspace', chat.id),
    view => view.run?.status === 'running',
    'running turn for unstoppable test',
  );

  await assert.rejects(
    () =>
      h.service.connections.logout('antigravity', {
        expectedRevision: h.service.connections.read('antigravity').revision,
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_account_change_stop_unconfirmed',
  );
  assert.equal(h.service.connections.read('antigravity').sendGate, undefined, 'failed stop must reopen sendGate');

  // Allow stop to succeed now
  forceUnstoppable = false;
  const activeBeforeStop = h.service.conversations.read('workspace', chat.id);
  await h.service.conversations.stop('workspace', chat.id, {
    expectedRevision: activeBeforeStop.revision,
    runId: activeBeforeStop.run!.id,
    participantId: activeBeforeStop.run!.participantId,
    generation: activeBeforeStop.run!.generation,
  });
  await waitUntil(
    () => h.service.conversations.read('workspace', chat.id),
    view =>
      view.run?.status === 'stopped'
      || (view.run?.status === 'unknown' && view.run?.resourcesReleased === true),
    'stopped turn after restoring real stop',
  );

  // Part 2a: logout RPC throws after clearing keyring ('logout-error-cleared') -> re-observes not-authenticated & succeeds
  await h.setControl({ scenario: 'logout-error-cleared' });
  const clearedLogout = await h.service.connections.logout('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
  });
  assert.equal(clearedLogout.status, 'disconnected');
  assert.equal(clearedLogout.sendGate, undefined);
  assert.equal(h.service.models.accounts.read('native-antigravity').status, 'not-authenticated');

  // Part 2b: logout RPC fails with explicit email unchanged ('logout-error-still-logged-in' + email) -> reopens sendGate
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    email: 'dev@example.com',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
  });
  await h.setControl({ scenario: '' });
  await h.service.connections.connect('antigravity', {
    expectedRevision: h.service.connections.read('antigravity').revision,
    executable: h.executable,
  });
  await h.service.connections.check('antigravity');
  assert.equal(h.service.models.accounts.read('native-antigravity').status, 'ready');

  await h.setControl({ scenario: 'logout-error-still-logged-in' });
  await assert.rejects(
    () =>
      h.service.connections.logout('antigravity', {
        expectedRevision: h.service.connections.read('antigravity').revision,
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_account_logout_failed',
  );
  assert.equal(
    h.service.connections.read('antigravity').sendGate,
    undefined,
    'explicit unchanged account identity allows safely reopening sendGate',
  );

  // Part 2c: logout RPC fails in epoch-only mode (no explicit email) -> keeps sendGate paused ('account-unconfirmed')!
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
  });
  await h.setControl({ scenario: '' });
  await h.service.connections.check('antigravity');
  await h.setControl({ scenario: 'logout-error-still-logged-in' });
  await assert.rejects(
    () =>
      h.service.connections.logout('antigravity', {
        expectedRevision: h.service.connections.read('antigravity').revision,
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_account_logout_unconfirmed',
  );
  const pausedAfterUnknown = h.service.connections.read('antigravity');
  assert.equal(pausedAfterUnknown.sendGate?.state, 'paused');
  assert.equal(pausedAfterUnknown.sendGate?.reason, 'account-unconfirmed');

  // Sending or queueing while account-unconfirmed MUST be rejected without entering pendingSend
  const afterChat = await h.service.conversations.create('workspace', {});
  assert.throws(
    () =>
      h.service.conversations.queueSend('workspace', afterChat.id, {
        expectedRevision: afterChat.revision,
        connectionId: 'antigravity',
        text: 'blocked when account unconfirmed',
        clientRequestId: randomUUID(),
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_connection_send_paused',
  );
  assert.equal(h.service.conversations.read('workspace', afterChat.id).pendingSend, undefined);
});
