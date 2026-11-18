import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { connectHarnessProcess, executionScopeKey, prepareAgentRuntime, stopAgentProcess } from '../../../buildr-harness/src/index.ts';
import { agentRuntimePackageTree } from '../../../buildr-harness/tools/package-runtime.ts';

async function until<T>(read: () => T | Promise<T>, accept: (value: T) => boolean, label: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Draft list calm browser did not settle: ' + label, { cause: lastError });
}

test('draft list ignores executing conversations and settles calmly on navigation away in focus split', { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-draft-list-calm-'));
  const dataRoot = path.join(root, 'profile');
  const packageRoot = path.join(root, 'package');
  const work1 = path.join(root, 'work-1');
  const work2 = path.join(root, 'work-2');
  const profileId = 'draft-list-calm';
  let cleanupClient: Awaited<ReturnType<typeof connectHarnessProcess>> | undefined;
  let cleanupBrowser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const ownerPids = new Set<number>();
  t.after(async () => {
    const failures: unknown[] = [];
    try { await cleanupBrowser?.close(); } catch (error) { failures.push(error); }
    if (cleanupClient) {
      try {
        const current = await cleanupClient.operations.connections.read('first');
        if (current.enabled) await cleanupClient.operations.connections.disconnect('first', { expectedRevision: current.revision });
      } catch (error) {
        if ((error as { code?: string }).code !== 'agent_connection_release_unconfirmed') failures.push(error);
      }
      try { await cleanupClient.disconnect(); } catch (error) { failures.push(error); }
    }
    try { await stopAgentProcess({ dataRoot, profileId, mode: 'stop-owned' }); } catch (error) {
      if ((error as { code?: string }).code !== 'ECONNRESET') failures.push(error);
    }
    for (const ownerPid of ownerPids) {
      try {
        await until(() => { try { process.kill(ownerPid, 0); return false; } catch { return true; } }, value => value, 'owned process exit');
      } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'draft list calm browser cleanup unconfirmed: ' + root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const coreRoot = path.resolve(import.meta.dirname, '../../../buildr-harness');
  fs.mkdirSync(work1);
  fs.mkdirSync(work2);
  agentRuntimePackageTree(coreRoot).materialize(packageRoot);
  const fixtureSource = fs.readFileSync(path.join(coreRoot, 'test/integration/fixtures/agent-process-entry.mjs'), 'utf8');
  fs.writeFileSync(path.join(packageRoot, 'build/browser-fixture.mjs'), fixtureSource);
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"draft-list-calm"}');

  const runtime = prepareAgentRuntime({ dataRoot, packageRoot, entry: 'build/browser-fixture.mjs' });
  const client = await connectHarnessProcess({
    dataRoot,
    profileId,
    runtime,
    sourceId: 'harness-local',
    caller: { kind: 'first-party-user', product: 'buildr-harness' },
  });
  cleanupClient = client;
  ownerPids.add((await client.lifecycle.identity()).pid);

  const connection = await client.operations.connections.read('first');
  await client.operations.connections.connect('first', { expectedRevision: connection.revision });
  const addedModel = await client.operations.models.accounts.add({ provider: 'fixture-model' });
  let modelAccount = await client.operations.models.accounts.check(addedModel.id);
  modelAccount = await client.operations.models.accounts.preferences(modelAccount.id, {
    expectedRevision: modelAccount.revision,
    models: [{ id: 'fixture', enabled: true }],
  });
  await client.operations.models.catalog.list({ refresh: true });
  const directory1 = await client.directories.register(work1, '主工作空间');
  const directory2 = await client.directories.register(work2, '其他工作空间');
  const scope1 = executionScopeKey(directory1.ref);
  const scope2 = executionScopeKey(directory2.ref);

  const createCompleted = async (scope: string, title: string, prompt: string) => {
    const created = await client.operations.conversations.create(scope, { title });
    const draft = {
      expectedRevision: created.revision,
      connectionId: 'first',
      model: 'fixture',
      modelAccountId: modelAccount.id,
      modelAccountRevision: modelAccount.revision,
      modelAccountIdentity: modelAccount.identity,
      text: prompt,
    };
    const preview = await client.operations.conversations.prepareSend(scope, created.id, draft);
    await client.operations.conversations.send(scope, created.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    const settled = await until(
      () => client.operations.conversations.read(scope, created.id),
      view => view.run?.status === 'completed',
      title + ' settled',
    );
    if (settled.activity?.version) {
      await client.operations.conversations.markSeen(scope, created.id, { through: settled.activity.version });
    }
    return settled;
  };

  const convOlder = await createCompleted(scope1, '较早普通会话', 'older-prompt');
  await new Promise(resolve => setTimeout(resolve, 25));
  const convNewer = await createCompleted(scope1, '较新普通会话', 'newer-prompt');
  const convOtherWs = await createCompleted(scope2, '跨空间会话', 'other-ws-prompt');

  const convRunning = await client.operations.conversations.create(scope1, { title: '执行中会话' });
  const runningDraft = { expectedRevision: convRunning.revision, connectionId: 'first', text: 'hold:draft-exec' };
  const runningPreview = await client.operations.conversations.prepareSend(scope1, convRunning.id, runningDraft);
  await client.operations.conversations.send(scope1, convRunning.id, { ...runningDraft, previewToken: runningPreview.token, clientRequestId: randomUUID() });
  await until(
    () => client.operations.conversations.read(scope1, convRunning.id),
    view => view.run?.status === 'running',
    'running conversation active',
  );

  const origin = (await client.web.enable()).origin!;
  const login = await client.web.login();
  const ticket = new URLSearchParams(new URL(login.url).hash.slice(1)).get('ticket');
  const response = await fetch(origin + '/session/ticket', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const separator = cookie.indexOf('=');
  const html = await (await fetch(origin + '/', { headers: { cookie } })).text();
  const webProfile = /<meta name="buildr-web-profile" content="([^"]+)">/u.exec(html)![1]!;

  const browser = await chromium.launch({ headless: true });
  cleanupBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true, sameSite: 'Strict' }]);
  await context.addInitScript(({ profile, account }) => {
    localStorage.setItem('buildr.agent-conversation.preference:' + encodeURIComponent(profile), JSON.stringify({ version: 1, agent: { connectionId: 'first' }, permission: { mode: 'default' } }));
    localStorage.setItem('buildr.agent-conversation.model-preference:' + encodeURIComponent(profile), JSON.stringify({ version: 1, connectionId: 'first', model: 'fixture', modelAccountId: account.id, modelAccountIdentity: account.identity }));
  }, { profile: webProfile, account: { id: modelAccount.id, identity: modelAccount.identity } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  let totalListRequests = 0;
  let statsRequests = 0;
  let otherWorkspaceRequests = 0;
  let tracking = false;
  page.on('request', request => {
    if (!tracking) return;
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/api/v1/app/agent-service/conversations')) return;
    totalListRequests++;
    if (url.searchParams.get('limit') === '1' && !url.searchParams.has('draftConversationIds')) statsRequests++;
    if (url.searchParams.get('workspaceId') === scope2) otherWorkspaceRequests++;
  });

  await page.goto(origin);
  const focusPane = page.locator('.ac-focus-history-pane');
  await focusPane.waitFor({ state: 'visible', timeout: 10000 });
  const group1 = focusPane.locator(`[data-history-workspace="${scope1}"]`);
  const group2 = focusPane.locator(`[data-history-workspace="${scope2}"]`);
  const rowRunning = group1.locator(`button[data-conversation-id="${convRunning.id}"]`);
  const rowOlder = group1.locator(`button[data-conversation-id="${convOlder.id}"]`);
  const rowNewer = group1.locator(`button[data-conversation-id="${convNewer.id}"]`);
  const rowOtherWs = group2.locator(`button[data-conversation-id="${convOtherWs.id}"]`);

  await rowRunning.waitFor({ state: 'visible', timeout: 10000 });
  await rowOlder.waitFor({ state: 'visible', timeout: 10000 });
  await rowNewer.waitFor({ state: 'visible', timeout: 10000 });
  await rowOtherWs.waitFor({ state: 'visible', timeout: 10000 });

  const input = page.getByRole('textbox', { name: '对话输入', exact: true });
  await rowRunning.click();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill('执行时输入的草稿');
  await input.fill('');
  await input.fill('保留到执行结束的草稿');
  await page.waitForTimeout(100);
  assert.equal(await rowRunning.locator('.ac-activity-status').innerText(), '执行中');
  assert.equal(await rowRunning.locator('.ac-draft-status').count(), 0, '执行中编辑草稿时不显示有草稿');

  // 切换到其他对话时，只要还在执行中，依然只展示执行中且不出现有草稿。
  await rowNewer.click();
  await page.waitForTimeout(100);
  assert.equal(await rowRunning.locator('.ac-activity-status').innerText(), '执行中');
  assert.equal(await rowRunning.locator('.ac-draft-status').count(), 0, '离开后仍在执行中也不展示有草稿');

  // 放行执行结束后，原保留的未发草稿才会按草稿规则显现。
  fs.writeFileSync(path.join(dataRoot, 'release-draft-exec'), '1');
  await until(
    async () => (await rowRunning.locator('.ac-activity-status', { hasText: '执行中' }).count()) === 0,
    Boolean,
    'running status cleared after execution completion',
  );
  await rowRunning.locator('.ac-draft-status').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await rowRunning.locator('.ac-draft-status').innerText(), '有草稿');

  // 清空执行后留下的草稿，并切回 convNewer，等全部列表空闲后再开始校验安静编辑与局部刷新。
  await rowRunning.click();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await input.inputValue(), '保留到执行结束的草稿');
  await input.fill('');
  await rowNewer.click();
  await rowRunning.locator('.ac-draft-status').waitFor({ state: 'detached', timeout: 10000 });
  await until(
    async () => (await focusPane.locator('[data-history-workspace][aria-busy="true"]').count()) === 0,
    Boolean,
    'all history groups idle before edit tracking',
  );

  const scope1Ids = () => group1.locator('[data-conversation-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-conversation-id')));
  const initialOrder = await scope1Ids();
  assert.ok(initialOrder.indexOf(convNewer.id) < initialOrder.indexOf(convOlder.id), '较新对话初始排在较早对话之前');

  await rowOlder.click();
  await until(
    async () => (await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id')) === convOlder.id,
    Boolean,
    'selected older conversation',
  );
  await until(
    async () => (await focusPane.locator('[data-history-workspace][aria-busy="true"]').count()) === 0,
    Boolean,
    'history groups idle after selecting older conversation',
  );
  await focusPane.locator('.ac-execution-summary').getByText('执行中模型', { exact: false }).waitFor({ state: 'visible' });

  tracking = true;
  const listBeforeEdit = totalListRequests;
  await input.fill('首次输入草稿');
  await input.fill('');
  await input.fill('离开后再标有草稿');
  await page.waitForTimeout(120);

  assert.equal(totalListRequests, listBeforeEdit, '并排编辑期间输入或清空均不触发列表请求');
  assert.equal(await rowOlder.locator('.ac-draft-status').count(), 0, '并排编辑期间当前行保持安静不显示有草稿');
  assert.deepEqual(await scope1Ids(), initialOrder, '并排编辑期间行序锁定不跳动');
  assert.equal(await focusPane.locator('.ac-execution-summary b').innerText(), '0', '顶部统计未闪回占位符');

  // 切换到其他对话后，仅主工作空间局部更新并平滑显示“有草稿”且排到普通历史前；统计与其他工作空间零请求。
  await rowNewer.click();
  await rowOlder.locator('.ac-draft-status').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await rowOlder.locator('.ac-draft-status').innerText(), '有草稿');
  await until(
    async () => {
      const ids = await scope1Ids();
      return ids.indexOf(convOlder.id) < ids.indexOf(convNewer.id);
    },
    Boolean,
    '离开后有草稿对话排到普通历史之前',
  );
  assert.equal(statsRequests, 0, '草稿结算期间顶部执行中模型统计零重刷');
  assert.equal(otherWorkspaceRequests, 0, '其他工作空间分组不受草稿变化影响');

  // 1. 点回已有草稿对话：左侧“有草稿”标识和排位保持原样不消失，也不发列表请求。
  const listBeforeReenter = totalListRequests;
  await rowOlder.click();
  await until(
    async () => (await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id')) === convOlder.id,
    Boolean,
    're-entered older conversation with settled draft',
  );
  await input.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await input.inputValue(), '离开后再标有草稿');
  await page.waitForTimeout(200);
  assert.equal(await rowOlder.locator('.ac-draft-status').innerText(), '有草稿', '点回已有草稿对话时有草稿保持不消失');
  assert.equal(totalListRequests, listBeforeReenter, '点回已有草稿对话不触发草稿列表刷新');
  assert.ok((await scope1Ids()).indexOf(convOlder.id) < (await scope1Ids()).indexOf(convNewer.id), '点回后原草稿排序席位保持在前');

  // 2. 在已有草稿对话继续编辑后切走：标签仍保持、列表零请求。
  await input.fill('修改但仍保留草稿');
  await rowNewer.click();
  await until(
    async () => (await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id')) === convNewer.id,
    Boolean,
    'navigated to newer conversation after editing non-empty draft',
  );
  await page.waitForTimeout(150);
  assert.equal(await rowOlder.locator('.ac-draft-status').innerText(), '有草稿');
  assert.equal(totalListRequests, listBeforeReenter, '仍有非空草稿时离开无需重刷列表');

  // 3. 点回已有草稿对话并手工清空：停留期间“有草稿”和席位保持冻结不动且零请求；切走后再恢复普通排序并去除标识。
  await rowOlder.click();
  await until(
    async () => (await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id')) === convOlder.id,
    Boolean,
    're-entered older conversation before manual clear',
  );
  await input.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await input.inputValue(), '修改但仍保留草稿');
  await input.fill('');
  await page.waitForTimeout(200);
  assert.equal(await rowOlder.locator('.ac-draft-status').innerText(), '有草稿', '停留清空草稿时有草稿标识保持不消失');
  assert.equal(totalListRequests, listBeforeReenter, '停留清空草稿期间不触发列表刷新');
  const orderWhileCleared = await scope1Ids();
  assert.ok(orderWhileCleared.indexOf(convOlder.id) < orderWhileCleared.indexOf(convNewer.id), '清空已有草稿但尚未离开时保持原席位不乱跳');

  await rowNewer.click();
  await rowOlder.locator('.ac-draft-status').waitFor({ state: 'detached', timeout: 10000 });
  await until(
    async () => {
      const ids = await scope1Ids();
      return ids.indexOf(convNewer.id) < ids.indexOf(convOlder.id);
    },
    Boolean,
    'older conversation returns to normal history order after leaving with empty draft',
  );
  assert.equal(statsRequests, 0, '清空结算期间顶部统计仍零重刷');
  assert.equal(otherWorkspaceRequests, 0, '清空结算期间其他工作空间仍零重刷');

  // 4. 在已有草稿对话中直接发送消息使草稿清空：即使不切换对话也立即清除“有草稿”标识。
  await rowOlder.click();
  await until(
    async () => (await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id')) === convOlder.id,
    Boolean,
    'selected older conversation for send test',
  );
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill('发送后立即清除草稿标识');
  await rowNewer.click();
  await rowOlder.locator('.ac-draft-status').waitFor({ state: 'visible', timeout: 10000 });

  await rowOlder.click();
  await until(
    async () => (await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id')) === convOlder.id,
    Boolean,
    're-entered older conversation before direct send',
  );
  assert.equal(await rowOlder.locator('.ac-draft-status').innerText(), '有草稿');
  await until(
    async () => (await page.locator('.ac-model-label').innerText()).toLowerCase().includes('fixture'),
    Boolean,
    'older conversation model ready',
  );
  await until(
    () => page.getByRole('button', { name: '发送对话', exact: true }).isEnabled(),
    Boolean,
    'direct send button enabled',
  );
  await page.getByRole('button', { name: '发送对话', exact: true }).click();
  try {
    await rowOlder.locator('.ac-draft-status').waitFor({ state: 'detached', timeout: 10000 });
  } catch (err) {
    t.diagnostic(await page.locator('#agent-conversation-panel').innerText());
    throw err;
  }
  await until(
    async () => (await client.operations.conversations.read(scope1, convOlder.id)).run?.status === 'completed',
    Boolean,
    'direct send completed on older conversation',
  );
  await page.waitForTimeout(150);
  assert.equal(await rowOlder.locator('.ac-draft-status').count(), 0, '停留在当前对话直接发送后不残余有草稿标识');

  assert.deepEqual(errors, []);
  await context.close();
});
