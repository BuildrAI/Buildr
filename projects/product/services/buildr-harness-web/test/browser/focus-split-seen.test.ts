import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { connectHarnessProcess, executionScopeKey, prepareAgentRuntime, stopAgentProcess } from '../../../buildr-harness/src/index.ts';
import { agentRuntimePackageTree } from '../../../buildr-harness/tools/package-runtime.ts';

async function until<T>(read: () => T | Promise<T>, accept: (value: T) => boolean, label: string) {
  const deadline = Date.now() + 10000;
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
  throw new Error('Focus split browser did not settle: ' + label, { cause: lastError });
}

test('focus split and collapsed stopped process clear unseen status immediately upon viewing', { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-focus-split-seen-'));
  const dataRoot = path.join(root, 'profile');
  const packageRoot = path.join(root, 'package');
  const work = path.join(root, 'work');
  const profileId = 'focus-split-seen';
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
    if (failures.length) throw new AggregateError(failures, 'focus split browser cleanup unconfirmed: ' + root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const coreRoot = path.resolve(import.meta.dirname, '../../../buildr-harness');
  fs.mkdirSync(work);
  agentRuntimePackageTree(coreRoot).materialize(packageRoot);
  let fixtureSource = fs.readFileSync(path.join(coreRoot, 'test/integration/fixtures/agent-process-entry.mjs'), 'utf8');
  const acceptLine = "input.onEvent({type:'accepted',executionRef});";
  assert.ok(fixtureSource.includes(acceptLine));
  fixtureSource = fixtureSource.replace(
    acceptLine,
    acceptLine + "\n      if(workText==='partial-stop'){const item={id:randomUUID(),kind:'message',role:'assistant',text:'停止前尚在生成的折叠过程消息',status:'running',executionId:executionRef.id};state.items.push(item);state.status='stopped';save(ref,state);input.onEvent({type:'item',item});input.onEvent({type:'completed',status:'stopped'});return;}",
  );
  fs.writeFileSync(path.join(packageRoot, 'build/browser-fixture.mjs'), fixtureSource);
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"focus-split-seen"}');

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
  const directory = await client.directories.register(work);
  const scope = executionScopeKey(directory.ref);

  const convCompleted = await client.operations.conversations.create(scope, { title: '专注分屏待查看完成会话' });
  const draftCompleted = { expectedRevision: convCompleted.revision, connectionId: 'first', text: 'focus-split-unseen-check' };
  const previewCompleted = await client.operations.conversations.prepareSend(scope, convCompleted.id, draftCompleted);
  await client.operations.conversations.send(scope, convCompleted.id, { ...draftCompleted, previewToken: previewCompleted.token, clientRequestId: randomUUID() });
  const settledCompleted = await until(
    () => client.operations.conversations.read(scope, convCompleted.id),
    view => view.run?.status === 'completed',
    'completed unseen conversation settled',
  );
  assert.ok(settledCompleted.activity && settledCompleted.activity.version > settledCompleted.activity.seenThrough);

  const convStopped = await client.operations.conversations.create(scope, { title: '专注分屏停止态折叠会话' });
  const draftStopped = { expectedRevision: convStopped.revision, connectionId: 'first', text: 'partial-stop' };
  const previewStopped = await client.operations.conversations.prepareSend(scope, convStopped.id, draftStopped);
  await client.operations.conversations.send(scope, convStopped.id, { ...draftStopped, previewToken: previewStopped.token, clientRequestId: randomUUID() });
  const settledStopped = await until(
    () => client.operations.conversations.read(scope, convStopped.id),
    view => view.run?.status === 'stopped',
    'stopped unseen conversation settled',
  );
  assert.ok(settledStopped.activity && settledStopped.activity.version > settledStopped.activity.seenThrough);

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

  const browser = await chromium.launch({ headless: true });
  cleanupBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(origin);
  const focusPane = page.locator('.ac-focus-history-pane');
  const detailPane = page.locator('.ac-conversation-view');
  await focusPane.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await detailPane.isVisible(), true, 'focus split keeps transcript pane visible');
  assert.equal(await focusPane.getByRole('button', { name: '返回当前对话', exact: true }).count(), 0, 'desktop side-by-side split omits back arrow');

  const railListButton = page.locator('.ac-collapsed-rail .ac-all-conversations');
  await until(
    () => railListButton.getAttribute('aria-label'),
    label => Boolean(label?.includes('待查看 2')),
    'rail initially reports 2 unseen conversations',
  );

  const rowCompleted = focusPane.locator(`button[data-conversation-id="${convCompleted.id}"]`);
  const rowStopped = focusPane.locator(`button[data-conversation-id="${convStopped.id}"]`);
  await rowCompleted.getByText('待查看', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await rowStopped.getByText('待查看', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });

  const seenCompleted = page.waitForResponse(
    value => value.request().method() === 'POST' && value.url().endsWith('/' + convCompleted.id + '/seen') && value.status() === 200,
  );
  await rowCompleted.click();
  await seenCompleted;
  await detailPane.getByText('answer focus-split-seen', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await focusPane.isVisible(), true, 'focus split keeps left history list open');
  await rowCompleted.getByText('待查看', { exact: true }).waitFor({ state: 'hidden', timeout: 5000 });
  await until(
    () => railListButton.getAttribute('aria-label'),
    label => Boolean(label?.includes('待查看 1')),
    'rail updates to 1 unseen after viewing completed conversation in focus split',
  );
  await until(
    () => client.operations.conversations.read(scope, convCompleted.id),
    view => Boolean(view.activity && view.activity.seenThrough === view.activity.version),
    'completed conversation seenThrough persisted in backend',
  );

  const seenStopped = page.waitForResponse(
    value => value.request().method() === 'POST' && value.url().endsWith('/' + convStopped.id + '/seen') && value.status() === 200,
  );
  await rowStopped.click();
  await seenStopped;
  await detailPane.getByText('partial-stop', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  const collapsedToggle = detailPane.locator('button[aria-label="展开处理过程"][aria-expanded="false"]');
  await collapsedToggle.waitFor({ state: 'visible', timeout: 10000 });
  await rowStopped.getByText('待查看', { exact: true }).waitFor({ state: 'hidden', timeout: 5000 });
  await until(
    () => railListButton.getAttribute('aria-label'),
    label => Boolean(label?.includes('待查看 0')),
    'rail updates to 0 unseen after viewing collapsed stopped conversation',
  );
  await until(
    () => client.operations.conversations.read(scope, convStopped.id),
    view => Boolean(view.activity && view.activity.seenThrough === view.activity.version),
    'stopped collapsed conversation seenThrough persisted in backend',
  );

  assert.deepEqual(errors, []);
  await context.close();
});
