import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium, type Route} from 'playwright-core';
import {connectHarnessProcess, prepareAgentRuntime, executionScopeKey, stopAgentProcess} from '../../../buildr-agent/src/index.ts';
import {agentRuntimePackageTree} from '../../../buildr-agent/tools/package-runtime.ts';

async function until<T>(read: () => T | Promise<T>, accept: (value: T) => boolean, label: string) {
  const deadline = Date.now() + 10000; let lastError: unknown;
  while (Date.now() < deadline) {
    try {const value = await read(); if (accept(value)) return value;} catch (error) {lastError = error;}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Standalone browser did not settle: ' + label, {cause: lastError});
}

test('standalone production UI sends through real source HTTP, isolates two drafts and consumes one concurrent reply', {timeout: 120000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-standalone-browser-'));
  const dataRoot = path.join(root, 'profile'), packageRoot = path.join(root, 'package'), work = path.join(root, 'work');
  const profileId = 'standalone-browser';
  let cleanupClient: Awaited<ReturnType<typeof connectHarnessProcess>> | undefined;
  let cleanupBrowser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const ownerPids = new Set<number>();
  t.after(async () => {
    const failures: unknown[] = [];
    let releaseResponseLost: unknown;
    let stopResponseLost: unknown;
    const exitedPids = new Set<number>();
    try {await cleanupBrowser?.close();} catch (error) {failures.push(error);}
    if (cleanupClient) try {
      const current = await cleanupClient.operations.connections.read('first');
      if (current.enabled) await cleanupClient.operations.connections.disconnect('first', {expectedRevision: current.revision});
    } catch (error) {
      if ((error as {code?: string}).code === 'agent_connection_release_unconfirmed') t.diagnostic('fixture connection release receipt unconfirmed; exact owned-process exit is checked separately');
      else if ((error as {code?: string}).code === 'ECONNRESET') releaseResponseLost = error;
      else failures.push(error);
    }
    try {await cleanupClient?.disconnect();} catch (error) {failures.push(error);}
    try {await stopAgentProcess({dataRoot, profileId, mode: 'stop-owned'});} catch (error) {
      if ((error as {code?: string}).code === 'ECONNRESET') stopResponseLost = error;
      else failures.push(error);
    }
    for (const ownerPid of ownerPids) try {
      await until(() => {try {process.kill(ownerPid, 0); return false;} catch {return true;}}, value => value, 'owned process exit');
      exitedPids.add(ownerPid);
    } catch (error) {failures.push(error);}
    if (stopResponseLost) {
      const receipts = fs.readdirSync(path.join(dataRoot, 'agent-service/process/instances'))
        .filter(name => name.endsWith('.json'))
        .map(name => JSON.parse(fs.readFileSync(path.join(dataRoot, 'agent-service/process/instances', name), 'utf8')));
      const confirmed = ownerPids.size > 0 && exitedPids.size === ownerPids.size && [...ownerPids].every(pid => receipts.some(value =>
        value.identity?.pid === pid && value.identity.dataRoot === dataRoot && value.stopped === true && value.confirmed === true));
      if (confirmed) t.diagnostic('shutdown response lost; exact backend stop receipts and physical exits confirm cleanup, without replaying shutdown');
      else failures.push(stopResponseLost);
    }
    if (releaseResponseLost) {
      if (ownerPids.size > 0 && exitedPids.size === ownerPids.size && failures.length === 0) t.diagnostic('fixture disconnect response lost; native response remains unknown, but public shutdown and physical exit of every owned generation are confirmed');
      else failures.push(releaseResponseLost);
    }
    if (failures.length) throw new AggregateError(failures, 'standalone browser cleanup unconfirmed: ' + root);
    fs.rmSync(root, {recursive: true, force: true});
  });
  const coreRoot = path.resolve(import.meta.dirname, '../../../buildr-agent');
  fs.mkdirSync(work);
  agentRuntimePackageTree(coreRoot).materialize(packageRoot);
  let fixtureSource = fs.readFileSync(path.join(coreRoot, 'test/integration/fixtures/agent-process-entry.mjs'), 'utf8');
  const turnInitialization = "state.status='running';state.kind=workText;";
  const approvalRequest = "if(workText==='approval'){input.onEvent(";
  assert.ok(fixtureSource.includes(turnInitialization) && fixtureSource.includes(approvalRequest));
  // This browser flow reuses one native context across question, stop and
  // approval turns. A prior answer must not approve a later fixture turn.
  fixtureSource = fixtureSource.replace(turnInitialization, "state.status='running';state.kind=workText;state.approved=false;delete state.requests;");
  fixtureSource = fixtureSource.replace(approvalRequest, "if(workText==='approval'){state.status='waiting';state.requests=[{id:'permit',kind:'approval',title:'Continue?'}];save(ref,state);input.onEvent(");
  assert.ok(fixtureSource.includes('value.approved=true;save(contextRef,value);'));
  fixtureSource = fixtureSource.replace('value.approved=true;save(contextRef,value);', 'value.approved=true;delete value.requests;save(contextRef,value);');
  assert.ok(fixtureSource.includes('const current=read(ref);\n        if(current.stopRequested)'));
  fixtureSource = fixtureSource.replace('const current=read(ref);\n        if(current.stopRequested)', 'const current=read(ref);\n        if(current.executionRef.id!==executionRef.id)return;\n        if(current.stopRequested)');
  assert.ok(fixtureSource.includes('const current=read(ref),item='));
  fixtureSource = fixtureSource.replace('const current=read(ref),item=', 'const current=read(ref);if(current.executionRef.id!==executionRef.id)return;const item=');
  fs.writeFileSync(path.join(packageRoot, 'build/browser-fixture.mjs'), fixtureSource);
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"standalone-browser"}');
  const runtime = prepareAgentRuntime({dataRoot, packageRoot, entry: 'build/browser-fixture.mjs'});
  let client = await connectHarnessProcess({dataRoot, profileId, runtime, sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}});
  cleanupClient = client;
  const firstIdentity = await client.lifecycle.identity();
  ownerPids.add(firstIdentity.pid);
  const browser = await chromium.launch({headless: true});
  cleanupBrowser = browser;
    const connection = await client.operations.connections.read('first');
    await client.operations.connections.connect('first', {expectedRevision: connection.revision});
    const added = await client.operations.models.accounts.add({provider: 'fixture-model'});
    let account = await client.operations.models.accounts.check(added.id);
    account = await client.operations.models.accounts.preferences(account.id, {expectedRevision: account.revision, models: [{id: 'fixture', enabled: true}]});
    await client.operations.models.catalog.list({refresh: true});
    const directory = await client.directories.register(work), scope = executionScopeKey(directory.ref);
    const origin = (await client.web.enable()).origin!;
    const login = await client.web.login(), ticket = new URLSearchParams(new URL(login.url).hash.slice(1)).get('ticket');
    const response = await fetch(origin + '/session/ticket', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({ticket})});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!, separator = cookie.indexOf('=');
    const html = await (await fetch(origin + '/', {headers: {cookie}})).text();
    const profile = /<meta name="buildr-web-profile" content="([^"]+)">/u.exec(html)![1]!;
    const context = await browser.newContext();
    await context.addCookies([{name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true, sameSite: 'Strict'}]);
    await context.addInitScript(({profile, account}) => {
      localStorage.setItem('buildr.agent-conversation.preference:' + encodeURIComponent(profile), JSON.stringify({version: 1, agent: {connectionId: 'first'}, permission: {mode: 'default'}}));
      localStorage.setItem('buildr.agent-conversation.model-preference:' + encodeURIComponent(profile), JSON.stringify({version: 1, connectionId: 'first', model: 'fixture', modelAccountId: account.id, modelAccountIdentity: account.identity}));
    }, {profile, account: {id: account.id, identity: account.identity}});
    const a = await context.newPage(), b = await context.newPage();
    await a.goto(origin);
    const inputA = a.getByRole('textbox', {name: '对话输入', exact: true});
    await until(() => a.locator('.ac-model-label').innerText(), value => value.includes('Fixture'), 'fixture model selection');
    await inputA.fill('question');
    await until(() => a.getByRole('button', {name: '发送对话', exact: true}).isEnabled(), value => value, 'send enabled');
    await inputA.press('Enter');
    try {
      await a.getByRole('radio', {name: 'Accepted', exact: true}).waitFor({state: 'visible', timeout: 10000});
    } catch (error) {
      t.diagnostic((await a.locator('body').innerText()).slice(-8000));
      const sent = path.join(dataRoot, 'native-sends.jsonl');
      t.diagnostic('fixture native inputs: ' + (fs.existsSync(sent) ? fs.readFileSync(sent, 'utf8').trim().split('\n').map(line => JSON.parse(line).text).join(' | ') : 'none'));
      throw error;
    }
    const conversationId = await a.locator('.ac-panel[data-conversation-id]').getAttribute('data-conversation-id');
    assert.ok(conversationId);
    await b.goto(origin);
    await b.locator('.harness-header button').filter({hasText: '全部对话'}).click();
    await b.locator(`.ac-history-row-main[data-conversation-id="${conversationId}"]`).click();
    await b.getByRole('radio', {name: 'Accepted', exact: true}).waitFor({state: 'visible', timeout: 10000});
    const inputB = b.getByRole('textbox', {name: '对话输入', exact: true});
    await inputA.fill('窗口 A 未提交草稿');
    await inputB.fill('窗口 B 未提交草稿');
    const routes: Route[] = [], statuses: number[] = [];
    let bothReady!: () => void;
    const ready = new Promise<void>(resolve => {bothReady = resolve;});
    await context.route('**/requests/*/reply', route => {routes.push(route); if (routes.length === 2) bothReady();});
    context.on('response', value => {if (value.url().includes('/requests/') && value.url().endsWith('/reply')) statuses.push(value.status());});
    for (const page of [a, b]) await page.getByRole('radio', {name: 'Accepted', exact: true}).check();
    await Promise.all([a, b].map(page => page.getByRole('button', {name: '回答并继续', exact: true}).click()));
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ready, new Promise<never>((_, reject) => {deadline = setTimeout(() => reject(new Error('both browser replies were not observed')), 10000);})]);
    } finally {clearTimeout(deadline);}
    assert.equal(routes[0]!.request().postDataJSON().expectedRevision, routes[1]!.request().postDataJSON().expectedRevision);
    await Promise.all(routes.map(route => route.continue()));
    await context.unroute('**/requests/*/reply');
    await until(() => statuses.length, value => value === 2, 'both reply responses');
    assert.deepEqual(statuses.sort(), [200, 409]);
    await until(async () => (await client.operations.conversations.read(scope, conversationId)).run?.status, value => value === 'completed', 'question completion');
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-replies.jsonl'), 'utf8').trim().split('\n').length, 1);
    assert.equal(await inputA.inputValue(), '窗口 A 未提交草稿');
    assert.equal(await inputB.inputValue(), '窗口 B 未提交草稿');
    await b.reload();
    await until(() => b.getByRole('textbox', {name: '对话输入', exact: true}).inputValue(), value => value === '窗口 B 未提交草稿', 'window B draft after reload');
    await inputA.fill('hold');
    await inputA.press('Enter');
    await a.getByRole('button', {name: '停止对话', exact: true}).waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('button', {name: '停止对话', exact: true}).click();
    await until(async () => (await client.operations.conversations.read(scope, conversationId)).run?.status, value => value === 'stopped', 'stop confirmation');
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8').trim().split('\n').length, 2);
    await a.locator('.ac-compose-toolbar input[type="file"]').setInputFiles({
      name: 'standalone-acceptance.txt', mimeType: 'text/plain', buffer: Buffer.from('Isolated document attachment; not a model instruction.'),
    });
    const removeDocument = a.getByRole('button', {name: '移除文档 standalone-acceptance.txt', exact: true});
    await removeDocument.waitFor({state: 'visible', timeout: 10000});
    await a.locator('.ac-document-thumbnail').filter({hasText: 'standalone-acceptance.txt'}).hover();
    await until(() => removeDocument.evaluate(node => getComputedStyle(node).pointerEvents), value => value === 'auto', 'hover reveals actionable document removal');
    await removeDocument.click();
    await until(() => removeDocument.count(), value => value === 0, 'standalone document removed without sending');
    await until(() => inputA.inputValue(), value => value === '', 'stop and attachment removal leave an empty input');
    await inputA.fill('approval');
    await until(() => a.getByRole('button', {name: '发送对话', exact: true}).isEnabled(), value => value, 'approval send enabled after stop');
    await inputA.press('Enter');
    try {
      await a.getByRole('button', {name: 'Allow', exact: true}).waitFor({state: 'visible', timeout: 10000});
    } catch (error) {
      const observed = await client.operations.conversations.read(scope, conversationId);
      t.diagnostic(JSON.stringify({run: observed.run, requests: observed.requests, pending: observed.pendingSend?.state, messages: observed.entries.filter(value => value.kind === 'message').map(value => ({role: value.role, text: value.text}))}));
      t.diagnostic('native inputs: ' + fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).text).join(' | '));
      throw error;
    }
    await a.getByRole('button', {name: 'Allow', exact: true}).click();
    try {
      await until(async () => (await client.operations.conversations.read(scope, conversationId)).run?.status, value => value === 'completed', 'standalone approval delivered');
    } catch (error) {
      const observed = await client.operations.conversations.read(scope, conversationId);
      t.diagnostic(JSON.stringify({run: observed.run, requests: observed.requests, replies: fs.readFileSync(path.join(dataRoot, 'native-replies.jsonl'), 'utf8').trim().split('\n').length}));
      throw error;
    }
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-replies.jsonl'), 'utf8').trim().split('\n').length, 2, 'question and approval each consume one native reply');
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8').trim().split('\n').length, 3);
    await a.locator('.harness-header button').filter({hasText: '设置'}).click();
    await a.getByRole('tab', {name: '智能体', exact: true}).click();
    await a.locator('.ams-executors').waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('tab', {name: '模型', exact: true}).click();
    await a.getByRole('button', {name: '全部供应商', exact: true}).waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('button', {name: '添加供应商', exact: true}).waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('tab', {name: '程序接入', exact: true}).click();
    const newAccess = a.getByRole('button', {name: '新建接入', exact: true});
    await until(() => newAccess.isEnabled(), value => value, 'programmatic settings discovery');
    await newAccess.click();
    await a.getByRole('textbox', {name: '程序凭据名称', exact: true}).fill('隔离目录读取程序');
    await a.getByRole('combobox', {name: '凭据允许的工作范围', exact: true}).click();
    await a.locator('.ant-select-item-option').filter({hasText: `harness-local / ${directory.ref.id}`}).click();
    await a.getByRole('switch', {name: '允许全部授权执行', exact: true}).uncheck();
    await a.getByRole('button', {name: '创建并自动保存', exact: true}).click();
    const handoff = a.getByTestId('programmatic-connection-info');
    await handoff.waitFor({state: 'visible', timeout: 10000});
    const handoffText = await handoff.innerText();
    assert.ok(handoffText.includes(JSON.stringify(directory.ref)), 'copied instructions retain the exact directory source and scope');
    assert.match(handoffText, /授权工作范围：/u);
    assert.doesNotMatch(handoffText, /brp_/u, 'no raw program token is rendered');
    assert.match(handoffText, /全部授权执行：已关闭/u);
    await a.getByRole('button', {name: '操作目录', exact: true}).click();
    const operationDirectory = a.getByRole('dialog', {name: '操作目录 · 按需读取', exact: true});
    await operationDirectory.getByText(/\/sources\/\{sourceId\}\/scopes\/\{scopeId\}\/conversations$/u).waitFor({state: 'visible', timeout: 10000});
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8').trim().split('\n').length, 3, 'settings never dispatch native work');
    const oldScript = await b.locator('script[src*="/bundles/"]').first().getAttribute('src');
    assert.ok(oldScript);
    // A distinct prepared generation with the same production UI plus an inert
    // fixture comment exercises bundle retention without inventing a release.
    const indexFile = path.join(packageRoot, 'build/harness-web-dist/index.html');
    const mainAsset = /src="\.\/([^"]+\.js)"/u.exec(fs.readFileSync(indexFile, 'utf8'))?.[1];
    assert.ok(mainAsset);
    fs.appendFileSync(path.join(path.dirname(indexFile), mainAsset), '\n/* isolated generation-transfer fixture */\n');
    fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"standalone-browser-next"}');
    const nextRuntime = prepareAgentRuntime({dataRoot, packageRoot, entry: 'build/browser-fixture.mjs'});
    const previousClient = client;
    client = await connectHarnessProcess({dataRoot, profileId, runtime: nextRuntime, sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}, requireRuntime: true, activationTimeoutMs: 30000});
    cleanupClient = client;
    const nextIdentity = await client.lifecycle.identity();
    ownerPids.add(nextIdentity.pid);
    assert.notEqual(nextIdentity.generation, firstIdentity.generation);
    await previousClient.disconnect();
    await until(() => client.web.status(), value => value.ready && value.origin === origin, 'same endpoint after generation transfer');
    const retainedScript = await context.request.get(new URL(oldScript, origin).href);
    assert.equal(retainedScript.status(), 200, 'the actual old page bundle remains available');
    await b.reload();
    await until(() => b.getByRole('textbox', {name: '对话输入', exact: true}).inputValue(), value => value === '窗口 B 未提交草稿', 'authenticated draft after generation transfer');
    const revoked = await context.request.post(origin + '/session/revoke', {headers: {origin, 'x-buildr-session': cookie.slice(separator + 1)}});
    assert.equal(revoked.status(), 200);
    const denied = await context.request.get(origin + '/api/v1/harness/scopes');
    assert.equal(denied.status(), 403, 'revocation denies protected reads');
    await b.reload();
    assert.equal(await b.evaluate(() => Object.values(sessionStorage).some(value => value.includes('窗口 B 未提交草稿'))), true, 'authentication loss preserves the unsent draft');
    const renewed = await client.web.login();
    await b.goto(renewed.url);
    await until(() => b.getByRole('textbox', {name: '对话输入', exact: true}).inputValue(), value => value === '窗口 B 未提交草稿', 'draft after explicit reauthentication');
    assert.equal(new URL(b.url()).hash, '', 'the one-use ticket is removed from the browser URL');
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8').trim().split('\n').length, 3, 'generation transfer and reauthentication never replay work');
    await context.close();
});
