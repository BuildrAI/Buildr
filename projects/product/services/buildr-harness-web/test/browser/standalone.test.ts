import {readLock} from '../../../buildr-harness/src/process/ownership.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium, type Route} from 'playwright-core';
import {connectHarnessProcess, prepareAgentRuntime, executionScopeKey, stopAgentProcess} from '../../../buildr-harness/src/index.ts';
import {agentRuntimePackageTree} from '../../../buildr-harness/tools/package-runtime.ts';

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
    if (cleanupClient) for (const connectionId of ['first', 'second']) try {
      const current = await cleanupClient.operations.connections.read(connectionId);
      if (current.enabled) await cleanupClient.operations.connections.disconnect(connectionId, {expectedRevision: current.revision});
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
  const coreRoot = path.resolve(import.meta.dirname, '../../../buildr-harness');
  fs.mkdirSync(work);
  const proofImage=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64');
  fs.writeFileSync(path.join(work,'proof.png'),proofImage);
  fs.writeFileSync(path.join(root,'outside.png'),proofImage);
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
  const fixtureModels = "models:[{id:'fixture',label:'Fixture',images:false,tools:false}]";
  const modelProvidersTail = 'modelProviders:[provider]';
  assert.ok(fixtureSource.includes(fixtureModels) && fixtureSource.includes(modelProvidersTail));
  fixtureSource = fixtureSource.replace(fixtureModels, "models:[{id:'fixture',label:'Fixture',images:false,tools:false},{id:'fast',label:'Fast',images:false,tools:false}]");
  fixtureSource = fixtureSource.replace(
    modelProvidersTail,
    "modelProviders:[provider,{id:'exclusive-model',label:'Exclusive model',sharing:{kind:'executor-exclusive',executors:['second'],reason:'受官方授权限制，仅可在 second 中使用。'},async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'exclusive',label:'Exclusive',images:false,tools:false}]}),beginLogin:async()=>{},cancelLogin:async()=>{},async infer(){throw new Error('unused');},close:async()=>{}};}}]",
  );
  fixtureSource = fixtureSource.replace("inspect:async()=>({status:'ready',models:", "inspect:async()=>({status:'ready',quota:{available:true,observedAt:new Date().toISOString(),windows:[{id:'weekly',label:'每周窗口',remainingPercent:5,resetsAt:new Date(Date.now()+3600000).toISOString()}]},models:");
  fs.writeFileSync(path.join(packageRoot, 'build/browser-fixture.mjs'), fixtureSource);
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"standalone-browser"}');
  const runtime = prepareAgentRuntime({dataRoot, packageRoot, entry: 'build/browser-fixture.mjs'});
  let client = await connectHarnessProcess({dataRoot, profileId, runtime, sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}});
  cleanupClient = client;
  const firstIdentity = await client.lifecycle.identity();
  ownerPids.add(firstIdentity.pid);
  const browser = await chromium.launch({headless: true});
  cleanupBrowser = browser;
    for (const connectionId of ['first', 'second']) {
      const connection = await client.operations.connections.read(connectionId);
      await client.operations.connections.connect(connectionId, {expectedRevision: connection.revision});
    }
    const added = await client.operations.models.accounts.add({provider: 'fixture-model'});
    let account = await client.operations.models.accounts.check(added.id);
    account = await client.operations.models.accounts.preferences(account.id, {expectedRevision: account.revision, models: [{id: 'fixture', enabled: true}, {id: 'fast', enabled: true}]});
    const addedExclusive = await client.operations.models.accounts.add({provider: 'exclusive-model'});
    const checkedExclusive = await client.operations.models.accounts.check(addedExclusive.id);
    await client.operations.models.accounts.preferences(checkedExclusive.id, {expectedRevision: checkedExclusive.revision, models: [{id: 'exclusive', enabled: true}]});
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
    assert.equal(await a.locator('.harness-header').count(),0,'no duplicate outer navigation');
    assert.equal(await a.locator('.ac-collapsed-rail').count(),1);
    assert.equal(await a.locator('.ac-collapsed-rail .ac-current-conversation').count(),0,'standalone rail omits current conversation collapse/expand button');
    await a.locator('.ac-focus-history-pane').waitFor({state:'visible',timeout:10000});
    assert.equal(await a.locator('.ac-focus-history-pane').getByRole('button',{name:'返回当前对话',exact:true}).count(),0,'desktop split omits narrow back button');
    await a.getByRole('button',{name:'更多对话操作',exact:true}).click();
    await a.locator('.ant-dropdown:visible').waitFor({state:'visible',timeout:10000});
    for(const label of ['收起对话','专注对话','恢复分屏','对话移到最左侧','对话移到右侧']){
      assert.equal(await a.getByRole('menuitem',{name:label,exact:true}).count(),0,`standalone menu must omit ${label}`);
    }
    await a.getByRole('menuitem',{name:'重命名',exact:true}).waitFor({state:'visible',timeout:10000});
    await a.keyboard.press('Escape');
    await a.locator('.ant-dropdown:visible').waitFor({state:'hidden',timeout:10000});
    await a.locator('.ac-collapsed-rail .ac-all-conversations').click();
    await a.locator('.ac-focus-history-pane').waitFor({state:'hidden',timeout:10000});
    await a.reload();
    await a.locator('.ac-panel').waitFor({state:'visible',timeout:10000});
    assert.equal(await a.locator('.ac-focus-history-pane').count(),0,'collapsed history preference persists across reload');
    const welcomeHeadingBox = await a.locator('.ac-welcome h1').boundingBox();
    const welcomeWorkspaceBox = await a.locator('.ac-welcome .ac-location-settings').boundingBox();
    const welcomeSelectBox = await a.locator('.ac-welcome .ac-workspace-select').boundingBox();
    const welcomeAddBox = await a.getByRole('button', {name: '添加工作空间', exact: true}).boundingBox();
    assert.ok(welcomeHeadingBox && welcomeWorkspaceBox && welcomeSelectBox && welcomeAddBox);
    assert.ok(Math.abs(welcomeHeadingBox.x - welcomeWorkspaceBox.x) <= 1, 'welcome workspace card aligns with welcome heading');
    assert.ok(Math.abs(welcomeSelectBox.y - welcomeAddBox.y) <= 1 && Math.abs(welcomeSelectBox.height - welcomeAddBox.height) <= 1, 'workspace select and add button align on the same row');
    if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await a.screenshot({path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'welcome-workspace.png')});
    await a.getByRole('combobox', {name:'新对话工作空间'}).locator('..').locator('..').click();
    await a.getByText('work', {exact:true}).last().waitFor({state:'visible'});
    await a.keyboard.press('Escape');
    let choosePath:string|null=null;
    await context.route('**/api/v1/harness/directories/choose', route=>route.fulfill({json:{path:choosePath}}));
    const beforeDirectories=(await client.directories.list()).length;
    await a.getByRole('button',{name:'添加工作空间',exact:true}).click();
    const cancelledResponse=a.waitForResponse(response=>response.url().endsWith('/directories/choose'));
    await a.getByRole('button',{name:'选择本机目录',exact:true}).click();
    assert.deepEqual(await (await cancelledResponse).json(),{path:null});
    try{await until(()=>a.getByRole('button',{name:/选择.*目录/}).isEnabled(),value=>value,'cancelled chooser');}
    catch(error){t.diagnostic(await a.getByRole('dialog',{name:'添加工作空间'}).innerText());throw error;}

    assert.equal((await client.directories.list()).length,beforeDirectories);
    const dialog=a.getByRole('dialog',{name:'添加工作空间'});
    await until(async()=>{
      const box=await dialog.boundingBox(), viewport=a.viewportSize();
      return Boolean(box&&viewport&&Math.abs((box.y+box.height/2)-viewport.height/2)<=24&&Math.abs((box.x+box.width/2)-viewport.width/2)<=12);
    },value=>value,'add-workspace modal is vertically and horizontally centered');
    if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await a.screenshot({path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'add-workspace-modal-empty.png')});
    assert.equal(await dialog.getByRole('button',{name:'创建并使用',exact:true}).isEnabled(),false);
    choosePath=work;
    await dialog.getByRole('button',{name:'选择本机目录',exact:true}).click();
    await dialog.getByLabel('已选择的工作空间目录').getByText(work,{exact:true}).waitFor();
    if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await a.screenshot({path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'add-workspace-modal-selected.png')});
    assert.equal(await dialog.getByRole('textbox').count(),1,'only the optional name is editable; no path input');
    assert.equal(await dialog.getByRole('button',{name:'使用路径备用方式'}).count(),0);
    await dialog.getByRole('button',{name:'创建并使用',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await client.directories.list()).length,beforeDirectories,'reusing directory does not duplicate scope');
    const namedWork=path.join(root,'named-directory');fs.mkdirSync(namedWork);choosePath=namedWork;
    await a.getByRole('button',{name:'添加工作空间',exact:true}).click();
    await dialog.getByRole('textbox',{name:'工作空间名称',exact:true}).fill('我的工作空间');
    await dialog.getByRole('button',{name:'选择本机目录',exact:true}).click();
    await dialog.getByLabel('已选择的工作空间目录').getByText(namedWork,{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'创建并使用',exact:true}).click();await dialog.waitFor({state:'hidden'});
    const named=(await client.directories.list()).find(item=>item.rootPath===fs.realpathSync(namedWork));
    assert.equal(named?.name,'我的工作空间');
    await a.reload();
    await a.getByRole('combobox',{name:'新对话工作空间'}).locator('..').locator('..').click();
    await a.getByText('我的工作空间',{exact:true}).last().waitFor();
    assert.equal(await a.locator('.ac-panel-popup .ant-select-item-option').filter({hasText:'默认工作空间'}).count(),0,'workspace dropdown hides default workspace option');
    await a.keyboard.press('Escape');
    await a.locator('.ac-welcome .ac-workspace-select').hover();
    await a.locator('.ac-welcome .ac-workspace-select .ant-select-clear').click();
    assert.equal(await a.locator('.ac-welcome .ac-workspace-select .ant-select-selection-placeholder').innerText(),'默认工作空间');
    await until(async()=>{
      const meta=a.getByRole('button',{name:'对话信息与工作空间',exact:true});
      const label=(await meta.innerText()).trim(),title=await meta.getAttribute('title');
      return label==='默认工作空间'&&Boolean(title?.endsWith('default-workspace'));
    },value=>value,'clearing workspace selection restores default workspace metadata and cwd');
    await a.getByRole('combobox',{name:'新对话工作空间'}).locator('..').locator('..').click();
    await a.locator('.ac-panel-popup .ant-select-item-option').filter({hasText:/^work$/}).click();

    const inputA = a.getByRole('textbox', {name: '对话输入', exact: true});
    await until(() => a.locator('.ac-model-label').innerText(), value => value.includes('Fixture'), 'fixture model selection');
    await a.getByRole('button',{name:'智能体与模型设置',exact:true}).hover();
    const quotaOverview=a.getByTestId('account-quota-overview');
    await quotaOverview.getByText(/小时.*分钟后重置/).waitFor({state:'visible'});
    assert.match(await quotaOverview.innerText(),/每周窗口.*剩余 5%/s);
    await quotaOverview.screenshot({path:path.join(os.tmpdir(),'conversation-single-quota.png')});
    await a.mouse.move(5,5);
    await inputA.fill('question');
    await until(() => a.getByRole('button', {name: '发送对话', exact: true}).isEnabled(), value => value, 'send enabled');
    const firstSend = '**/drafts/*/send';
    const firstLookup = '**/drafts/*/submissions/*';
    const firstAttemptIds: string[] = [], firstEvents: string[] = [];
    let recoveringFirst = false;
    const rejectDuringUpdate = async (route: Route) => {
      firstAttemptIds.push(route.request().postDataJSON().clientRequestId);
      firstEvents.push('send');
      if (!recoveringFirst) return route.fulfill({status: 503, json: {error: {code: 'agent_process_switching', message: 'updating'}}});
      const accepted = await route.fetch();
      assert.equal(accepted.status(), 202);
      // The real backend accepted the request, but the browser lost its reply.
      await route.abort('failed');
    };
    const observeFirst = async (route: Route) => {firstEvents.push('lookup');await route.continue();};
    await a.route(firstSend, rejectDuringUpdate);
    await a.route(firstLookup, observeFirst);
    await inputA.press('Enter');
    await a.getByText('上次发送尚未受理：正在等待可接单的执行后台。', {exact: true}).waitFor();
    await inputA.fill('首发后的新草稿');
    recoveringFirst = true;
    try {
      await a.getByRole('radio', {name: 'Accepted', exact: true}).waitFor({state: 'visible', timeout: 10000});
    } catch (error) {
      t.diagnostic((await a.locator('body').innerText()).slice(-8000));
      const sent = path.join(dataRoot, 'native-sends.jsonl');
      t.diagnostic('fixture native inputs: ' + (fs.existsSync(sent) ? fs.readFileSync(sent, 'utf8').trim().split('\n').map(line => JSON.parse(line).text).join(' | ') : 'none'));
      throw error;
    }
    await a.unroute(firstSend, rejectDuringUpdate);
    await a.unroute(firstLookup, observeFirst);
    assert.deepEqual(firstEvents, ['send', 'lookup', 'send', 'lookup']);
    assert.equal(firstAttemptIds.length, 2);
    assert.equal(firstAttemptIds[1], firstAttemptIds[0]);
    assert.equal(await a.evaluate(() => Object.values(sessionStorage).some(value => value.includes('首发后的新草稿'))), true);
    const conversationId = await a.locator('.ac-panel[data-conversation-id]').getAttribute('data-conversation-id');
    assert.ok(conversationId);
    assert.equal(await a.getByRole('button',{name:'系统提示词',exact:true}).count(),0);
    await b.goto(origin);
    await b.locator('.ac-collapsed-rail .ac-all-conversations').hover();
    const activityButton = b.locator(`.ac-activity-menu [data-activity-id="${conversationId}"]`);
    await activityButton.waitFor({state: 'visible', timeout: 10000});
    assert.equal(await activityButton.locator('.ac-activity-status').innerText(), '待决策');
    const activityStyle = (node: HTMLElement) => {
      const parent = node.parentElement!, copy = parent.querySelector('.ac-activity-row-copy')!, idCount = node.querySelectorAll('.ac-activity-id').length, meta = node.querySelector('.ac-activity-meta')!;
      const c = copy.getBoundingClientRect(), m = meta.getBoundingClientRect(), style = getComputedStyle(copy);
      return {idCount, copyTitle: copy.getAttribute('title') || '', opacity: style.opacity, pointerEvents: style.pointerEvents, metaText: meta.textContent?.trim() || '', metaRight: m.right, copyLeft: c.left, copyMid: c.top + c.height / 2, metaMid: m.top + m.height / 2};
    };
    const activityHidden = await activityButton.evaluate(activityStyle);
    assert.ok(activityHidden.idCount === 0 && activityHidden.opacity === '0' && activityHidden.pointerEvents === 'none', JSON.stringify(activityHidden));
    await activityButton.hover();
    const activityOrder = await activityButton.evaluate(activityStyle);
    assert.ok(activityOrder.idCount === 0 && activityOrder.opacity === '1' && activityOrder.pointerEvents === 'auto' && activityOrder.copyTitle === `复制对话 ID（${conversationId.slice(0, 8)}）` && activityOrder.metaText.length > 0 && activityOrder.metaRight <= activityOrder.copyLeft + 1 && Math.abs(activityOrder.copyMid - activityOrder.metaMid) < 6, JSON.stringify(activityOrder));
    if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await b.screenshot({path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'activity-popover-order.png')});
    await b.locator('.ac-collapsed-rail .ac-all-conversations').click();
    const historyButton = b.locator(`.ac-history-row-main[data-conversation-id="${conversationId}"]`);
    await historyButton.waitFor({state: 'visible', timeout: 10000});
    assert.equal(await historyButton.locator('.ac-activity-status').innerText(), '待决策');
    const historyStyle = (node: HTMLElement) => {
      const parent = node.parentElement!, copy = parent.querySelector('.ac-history-row-copy')!, idCount = node.querySelectorAll('.ac-history-id').length, meta = node.querySelector('.ac-history-meta')!;
      const c = copy.getBoundingClientRect(), m = meta.getBoundingClientRect(), style = getComputedStyle(copy);
      return {idCount, copyTitle: copy.getAttribute('title') || '', opacity: style.opacity, pointerEvents: style.pointerEvents, metaText: meta.textContent?.trim() || '', metaRight: m.right, copyLeft: c.left, copyMid: c.top + c.height / 2, metaMid: m.top + m.height / 2};
    };
    await b.locator('.ac-history > .ac-thread-header').hover();
    const historyHidden = await historyButton.evaluate(historyStyle);
    assert.ok(historyHidden.idCount === 0 && historyHidden.opacity === '0' && historyHidden.pointerEvents === 'none', JSON.stringify(historyHidden));
    await historyButton.hover();
    const historyOrder = await historyButton.evaluate(historyStyle);
    assert.ok(historyOrder.idCount === 0 && historyOrder.opacity === '1' && historyOrder.pointerEvents === 'auto' && historyOrder.copyTitle === `复制对话 ID（${conversationId.slice(0, 8)}）` && historyOrder.metaText.length > 0 && historyOrder.metaRight <= historyOrder.copyLeft + 1 && Math.abs(historyOrder.copyMid - historyOrder.metaMid) < 6, JSON.stringify(historyOrder));
    if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await b.screenshot({path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'history-list-order.png')});
    await historyButton.click();
    await b.getByRole('radio', {name: 'Accepted', exact: true}).waitFor({state: 'visible', timeout: 10000});
    assert.equal(await b.locator('.ac-thread-identity').count(), 0);
    await b.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText: async (text: string) => {(window as any).__copiedId = text;}},
      });
    });
    await b.locator('.ac-panel > .ac-conversation-view > .ac-thread-header').getByRole('button', {name: '更多对话操作', exact: true}).click();
    await b.getByRole('menuitem', {name: `复制对话 ID（${conversationId.slice(0, 8)}）`, exact: true}).click();
    assert.equal(await b.evaluate(() => (window as any).__copiedId), conversationId);
    await b.getByText('对话 ID 已复制', {exact: true}).waitFor();
    assert.equal(await b.locator('.ac-panel').getByText('对话 ID 已复制', {exact: true}).count(), 0);
    await b.evaluate(() => {delete (navigator as any).clipboard; delete (window as any).__copiedId;});
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
    await b.locator('.ac-focus-history-pane').waitFor({state: 'visible', timeout: 10000});
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
    const mermaidConversationRoute = `**/api/v1/harness/sources/harness-local/scopes/*/conversations/${conversationId}`;
    await a.route(mermaidConversationRoute, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const fetched = await route.fetch();
      const body = await fetched.json();
      body.entries = [...(body.entries ?? []), {
        id: 'standalone-mermaid-entry',
        kind: 'message',
        role: 'assistant',
        text: '![独立版验收图片](proof.png)\n\n[打开本机图片](proof.png)\n\n![目录外图片](../outside.png)\n\n时序图如下：\n\n```mermaid\nsequenceDiagram\n  actor U as 客户\n  participant C as 鲜虾小程序\n  participant B as 鲜虾后端\n  U->>C: 选择微信支付\n  C->>B: 提交下单内容\n  B-->>C: 返回内部支付流水\n```\n',
        createdAt: new Date().toISOString(),
      }];
      await route.fulfill({response: fetched, json: body});
    });
    await a.reload();
    await a.locator('.markdown-diagram[data-mermaid-state="rendered"] .markdown-diagram-view svg').waitFor({state: 'visible', timeout: 20000});
    assert.equal(await a.locator('.markdown-diagram .markdown-render-note').isHidden(), true, 'render note hides once Mermaid SVG finishes rendering');
    const inlineProof=a.getByRole('button',{name:'查看大图：独立版验收图片',exact:true});
    const proofSrc=`data:image/png;base64,${proofImage.toString('base64')}`;
    await a.waitForFunction(()=>[...document.images].some(img=>img.alt==='独立版验收图片'&&img.naturalWidth===1));
    await a.getByText('图片无法预览：目录外图片',{exact:true}).waitFor();
    await inlineProof.press('Enter');
    const proofDialog=a.getByRole('dialog',{name:'图片预览',exact:true});
    await proofDialog.waitFor();assert.equal(await proofDialog.locator('img').getAttribute('src'),proofSrc);
    const openOriginal=proofDialog.getByRole('link',{name:'新窗口打开',exact:true});
    const popup=context.waitForEvent('page',{timeout:10000});
    await openOriginal.click();
    const original=await popup;
    try{await original.waitForFunction(()=>document.images[0]?.naturalWidth===1);}finally{await original.close();}
    await proofDialog.getByRole('button',{name:'关闭预览',exact:true}).click();
    await a.getByRole('link',{name:'打开本机图片',exact:true}).click();
    await proofDialog.locator('img').waitFor();assert.equal(await proofDialog.locator('img').getAttribute('src'),proofSrc);
    await proofDialog.getByRole('button',{name:'关闭预览',exact:true}).click();

    if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await a.screenshot({path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'mermaid-rendered.png')});
    await a.unroute(mermaidConversationRoute);
    await a.reload();
    const modelTriggerA = a.getByRole('button', {name: '模型与推理强度', exact: true});
    const modelDialogA = a.getByRole('dialog', {name: '模型与推理强度设置', exact: true});
    const modelComboA = modelDialogA.getByRole('combobox', {name: '执行模型', exact: true});
    const modelPopupA = a.locator('.ac-model-list-popup:visible');
    await modelTriggerA.click();
    await modelDialogA.waitFor({state: 'visible', timeout: 10000});
    await modelComboA.focus();
    await modelComboA.press('ArrowDown');
    await modelPopupA.waitFor({state: 'visible', timeout: 10000});
    assert.equal(await a.locator('.ac-model-list-popup .ac-model-notice').count(), 0, 'model dropdown never renders redundant top warning notice');
    const exclusiveOption = modelPopupA.locator('.ant-select-item-option').filter({hasText: 'Exclusive'});
    await exclusiveOption.waitFor({state: 'visible', timeout: 10000});
    assert.match((await exclusiveOption.getAttribute('class')) ?? '', /ant-select-item-option-disabled/u, 'incompatible model stays greyed out and disabled');
    assert.equal(await exclusiveOption.getAttribute('title'), '受官方授权限制，仅可在 second 中使用。', 'disabled model retains hover compatibility reason');
    await modelPopupA.locator('.ant-select-item-option').filter({hasText: 'Fast'}).click();
    await a.locator('.ac-model-list-popup').waitFor({state: 'hidden', timeout: 10000});
    await modelComboA.focus();
    await modelComboA.press('Escape');
    await modelDialogA.waitFor({state: 'hidden', timeout: 10000});
    await a.locator('.ac-transfer-notice').filter({hasText: '接下来使用'}).waitFor({state: 'visible', timeout: 10000});
    const handoffDraft = a.getByRole('textbox', {name: '对话输入', exact: true});
    const review = a.locator('.ac-handoff-review');
    const openReview = async () => {
      await a.locator('.ac-transfer-notice').getByRole('button', {name:'交接内容',exact:true}).click();
      await review.waitFor();
    };
    const sendsBeforeReview = fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8');
    const desktopViewport = a.viewportSize()!;
    await handoffDraft.fill('交接前保留的草稿');
    for (const size of [desktopViewport, {width:390,height:780}]) {
      await a.setViewportSize(size);
      if (size.width===390) {
        const back = a.getByRole('button', {name:'返回当前对话',exact:true});
        await back.waitFor({state:'attached',timeout:5000});
        if (await back.isVisible()) await back.click();
        await handoffDraft.waitFor({state:'visible',timeout:5000});
      }
      await openReview();
      await review.getByText(/接手方：.*Fast/u).waitFor();
      assert.doesNotMatch(await review.innerText(),/交接范围：/u);
      const confirm = review.getByRole('button', {name:'确认交接并发送',exact:true});
      assert.equal(await a.locator('.ac-handoff-drawer:visible').count(), 0, 'pending review never masks the conversation');
      assert.equal(await a.getByRole('button', {name:'发送对话',exact:true}).isDisabled(), true);
      await handoffDraft.press('Enter');
      assert.equal(await review.locator('.ac-hd-round-list').count(), 0, 'details default to collapsed');
      await review.getByRole('button', {name:'查看交接详情',exact:true}).click();
      assert.doesNotMatch(await review.innerText(),/无需逐项确认/u);
      assert.equal(await review.locator('.ac-hd-send-body').isVisible(), false, 'wire body is separately collapsed');
      await review.locator('.ac-hd-material-more>summary').click();
      assert.equal(await review.locator('.ac-hd-send-body').isVisible(), true);
      const card = await review.boundingBox(), composer = await a.locator('.ac-compose-wrap>.ac-composer').boundingBox(), action = await confirm.boundingBox();
      assert.ok(card && composer && action && Math.abs(card.x-composer.x)<2 && Math.abs(card.width-composer.width)<2, 'review shares the composer column');
      assert.ok(action.y>=0 && action.y+action.height<=size.height && composer.y+composer.height<=size.height, 'details keep confirmation and the draft within the viewport');
      assert.equal(await review.evaluate(node => node.scrollWidth <= node.clientWidth+1), true);
      if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await a.screenshot({path:path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, `handoff-inline-${size.width}.png`)});
      await review.getByRole('button', {name:'返回编辑',exact:true}).press('Escape');
      await review.waitFor({state:'hidden'});
      await a.waitForFunction(() => document.activeElement?.matches('.ac-composer textarea'));
      assert.equal(await handoffDraft.inputValue(), '交接前保留的草稿');
    }
    await a.setViewportSize(desktopViewport);
    await openReview();
    await handoffDraft.fill('编辑后的草稿');
    await review.waitFor({state:'hidden'});
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8'), sendsBeforeReview, 'preview, Enter, dismissal and editing never dispatch');
    await handoffDraft.fill('');
    const agentComboA = a.getByRole('combobox', {name: '下一位智能体', exact: true});
    const selectDropdownA = a.locator('.ant-select-dropdown:visible');
    await agentComboA.focus();
    await agentComboA.press('ArrowDown');
    await selectDropdownA.locator('.ant-select-item-option').filter({hasText: 'second'}).click();
    await a.locator('.ant-select-dropdown').waitFor({state: 'hidden', timeout: 10000});
    assert.equal(await a.locator('.ac-transfer-notice').count(), 1, 'switching to another Harness keeps handoff notice visible');
    await agentComboA.focus();
    await agentComboA.press('ArrowDown');
    await selectDropdownA.locator('.ant-select-item-option').filter({hasText: 'first'}).click();
    await a.locator('.ant-select-dropdown').waitFor({state: 'hidden', timeout: 10000});
    await modelTriggerA.click();
    await modelDialogA.waitFor({state: 'visible', timeout: 10000});
    await modelComboA.focus();
    await modelComboA.press('ArrowDown');
    await modelPopupA.waitFor({state: 'visible', timeout: 10000});
    await modelPopupA.locator('.ant-select-item-option').getByText('Fixture', {exact: true}).click();
    await a.locator('.ac-model-list-popup').waitFor({state: 'hidden', timeout: 10000});
    await modelComboA.focus();
    await modelComboA.press('Escape');
    await modelDialogA.waitFor({state: 'hidden', timeout: 10000});
    await until(() => a.locator('.ac-transfer-notice').count(), value => value === 0, 'switching back to original Harness and model clears transfer notice without reload');
    assert.equal(fs.readFileSync(path.join(dataRoot, 'native-sends.jsonl'), 'utf8').trim().split('\n').length, 3, 'model and harness switching before send never dispatches native work');
    await a.locator('.ac-collapsed-rail .ac-account-settings').click();
    await a.getByRole('tab', {name: '智能体', exact: true}).click();
    await a.locator('.ams-executors').waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('tab', {name: '模型', exact: true}).click();
    await a.getByRole('button', {name: '全部供应商', exact: true}).waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('button', {name: '添加供应商', exact: true}).waitFor({state: 'visible', timeout: 10000});
    await a.getByRole('tab', {name: '系统提示词', exact: true}).click();
    const promptText = a.getByRole('textbox', {name:'系统提示词内容',exact:true});
    const savePromptButton=a.getByRole('button',{name:'保存系统提示词',exact:true});
    const savePrompt=async()=>{
      for(let attempt=0;attempt<8;attempt++){
        await until(()=>savePromptButton.getAttribute('class'),value=>!value?.includes('ant-btn-loading'),'prompt save button ready');
        const response=a.waitForResponse(value=>value.url().endsWith('/system-prompt')&&value.request().method()!=='GET');
        await savePromptButton.click();
        const receipt=await response,body=await receipt.json();
        await until(()=>savePromptButton.getAttribute('class'),value=>!value?.includes('ant-btn-loading'),'prompt save completed');
        if(receipt.status()===200)return;
        // A global storage lock can be briefly held by the fixture's background
        // observers. This rejection happens before writing, not an unknown save.
        if(receipt.status()===409&&body.error?.code==='agent_process_owned'&&attempt<7){
          assert.equal((await client.operations.systemPrompt.read()).revision,receipt.request().postDataJSON().expectedRevision);
          await new Promise(resolve=>setTimeout(resolve,Math.min(100*2**attempt,1000)));
          continue;
        }
        assert.equal(receipt.status(),200,JSON.stringify({body,requests:promptSaves,lock:readLock(dataRoot,'storage'),testPid:process.pid,servicePid:firstIdentity.pid}));
      }
    };
    const promptSaves:Array<unknown>=[];a.on('response',response=>{if(response.url().endsWith('/system-prompt')&&response.request().method()!=='GET')promptSaves.push({status:response.status(),input:response.request().postDataJSON()});});
    await until(()=>promptText.inputValue(),value=>value.includes('简洁'),'system prompt default loaded');
    await promptText.fill('浏览器验收：简洁表达，不省略风险。');
    await savePrompt();
    await a.getByText('已保存，下一轮应用',{exact:true}).waitFor();
    assert.equal((await client.operations.systemPrompt.read()).text,'浏览器验收：简洁表达，不省略风险。');
    await a.getByRole('switch',{name:'启用 Buildr Harness 系统提示词',exact:true}).click();
    await savePrompt();
    await until(()=>client.operations.systemPrompt.read(),value=>!value.enabled,'system prompt disabled');
    await a.getByRole('button',{name:'恢复默认内容',exact:true}).click();
    const defaultPrompt=(await client.operations.systemPrompt.read()).defaultText;
    await until(()=>promptText.inputValue(),value=>value===defaultPrompt,'default prompt editor restored');
    await savePrompt();
    try {await until(()=>client.operations.systemPrompt.read(),value=>value.enabled&&value.text===value.defaultText,'system prompt restored');} catch(error) {t.diagnostic(JSON.stringify({saved:await client.operations.systemPrompt.read(),requests:promptSaves,ui:await a.locator('section[aria-label="Buildr Harness 系统提示词"]').innerText()}));throw error;}
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
    await b.locator('.ac-collapsed-rail .ac-new-conversation').click();
    const freshInput = b.getByRole('textbox', {name: '对话输入', exact: true});
    await until(() => freshInput.inputValue(), value => value === '', 'new conversation clears view to empty draft');
    fs.writeFileSync(path.join(dataRoot, 'release-uncertain-resource'), 'yes');
    await freshInput.fill('uncertain-ended');
    await until(() => b.getByRole('button', {name: '发送对话', exact: true}).isEnabled(), value => value, 'fresh send enabled');
    await freshInput.press('Enter');
    const continueButton = b.getByRole('button', {name: '继续原任务', exact: true});
    await continueButton.waitFor({state: 'visible', timeout: 15000});
    await continueButton.click();
    await b.locator('.ac-turn').getByText('answer standalone-browser-next', {exact: true}).waitFor({state: 'visible', timeout: 15000});
    assert.equal(await b.locator('.ac-turn').count(), 1, 'same-page continuation reuses the original ConversationTurn instead of duplicating the prompt');
    assert.equal(await b.locator('.ac-turn .ac-turn-prompt').count(), 1, 'reused turn renders the original user prompt bubble only once');
    assert.equal(await b.locator('.ac-continuation-prompt-label').count(), 0, 'same-page continuation omits the off-page continuation label');
    assert.equal(await b.locator('.ac-turn').getByText('已请求继续上次执行。').count(), 1, 'continuation notice renders inside the reused turn');
    const narrow = await context.newPage();
    await narrow.setViewportSize({width: 500, height: 800});
    await narrow.goto(origin);
    await narrow.getByRole('textbox', {name: '对话输入', exact: true}).waitFor({state: 'visible', timeout: 10000});
    assert.equal(await narrow.locator('.ac-history:visible').count(), 0, 'narrow viewport defaults to conversation view even when desktop history preference is open');
    await narrow.locator('.ac-collapsed-rail .ac-all-conversations').click();
    await narrow.locator('.ac-history').waitFor({state: 'visible', timeout: 10000});
    const backToConversation = narrow.getByRole('button', {name: '返回当前对话', exact: true});
    await backToConversation.waitFor({state: 'visible', timeout: 10000});
    await backToConversation.click();
    await narrow.locator('.ac-history').waitFor({state: 'hidden', timeout: 10000});
    await narrow.getByRole('textbox', {name: '对话输入', exact: true}).waitFor({state: 'visible', timeout: 10000});
    assert.equal(await narrow.evaluate(() => localStorage.getItem('buildr.harness-standalone.history-open:' + (document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local'))), 'true', 'narrow fallback and return never overwrite desktop history preference');
    await narrow.close();
    const finalModelDialog = b.getByRole('dialog', {name:'模型与推理强度设置',exact:true});
    await b.getByRole('button', {name:'模型与推理强度',exact:true}).click();
    const finalModelCombo = finalModelDialog.getByRole('combobox', {name:'执行模型',exact:true});
    await finalModelCombo.focus();await finalModelCombo.press('ArrowDown');
    await b.locator('.ac-model-list-popup:visible .ant-select-item-option').filter({hasText:'Fast'}).click();
    await finalModelCombo.focus();await finalModelCombo.press('Escape');
    await finalModelDialog.waitFor({state:'hidden'});
    const sentPath = path.join(dataRoot, 'native-sends.jsonl');
    const sentCount = () => fs.readFileSync(sentPath, 'utf8').trim().split('\n').length;
    const beforeConfirmation = sentCount();
    await freshInput.fill('确认后只发送这条交接要求');
    await b.locator('.ac-transfer-notice').getByRole('button', {name:'交接内容',exact:true}).click();
    const finalReview = b.locator('.ac-handoff-review');
    const confirm = finalReview.getByRole('button', {name:'确认交接并发送',exact:true});
    await confirm.waitFor();
    assert.equal(sentCount(), beforeConfirmation);
    await confirm.click();
    await until(sentCount, n => n===beforeConfirmation+1, 'exactly one native send after explicit handoff confirmation');
    await finalReview.waitFor({state:'hidden'});
    assert.equal(await freshInput.inputValue(),'');

    await context.close();
});
