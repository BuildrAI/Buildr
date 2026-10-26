import assert from 'node:assert/strict';
import { codeRepositoryLabel } from '../../src/features/code/code-source-labels.ts';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** Model protocol is an external collaborator; catalog, exact context and Git writes use production HTTP. */
export async function runSourceControlActionsJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors, scenario = (name: string, action: () => Promise<void>) => t.test(name, action)}: any) {
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  const details = () => page.getByRole('dialog', {name: 'Codex 接入详情', exact: true});
  const openDetails = async (drawer: any) => {
    await drawer.getByRole('button', {name: 'Codex 详情', exact: true}).click();
    await details().waitFor({state: 'visible'});
    await details().getByRole('button', {name: /配置与运行信息$/u}).click();
    await details().getByText('最近读取的生成配置', {exact: true}).waitFor({state: 'visible'});
    return details();
  };
  const assertCommitSplit = async (panel: any) => {
    const layout = await panel.locator('.source-control-commit-split').evaluate((element: HTMLElement) => {
      const main = element.querySelector<HTMLElement>('#commit-changes')!, menu = element.querySelector<HTMLElement>('#commit-action-menu')!;
      const left = main.getBoundingClientRect(), right = menu.getBoundingClientRect(), icon = menu.querySelector('svg')!.getBoundingClientRect(), leftStyle = getComputedStyle(main), rightStyle = getComputedStyle(menu);
      return {top: Math.abs(left.top - right.top), height: Math.abs(left.height - right.height), join: Math.abs(left.right - right.left), iconX: Math.abs(right.left + right.right - icon.left - icon.right) / 2, iconY: Math.abs(right.top + right.bottom - icon.top - icon.bottom) / 2, outerLeft: parseFloat(leftStyle.borderTopLeftRadius), innerLeft: parseFloat(leftStyle.borderTopRightRadius), innerRight: parseFloat(rightStyle.borderTopLeftRadius), outerRight: parseFloat(rightStyle.borderTopRightRadius)};
    });
    assert.ok(layout.top <= 1 && layout.height <= 1 && layout.join <= 1, '提交按钮组合共高且连接：' + JSON.stringify(layout));
    assert.ok(layout.iconX <= 1 && layout.iconY <= 1, '下拉箭头在按钮内水平、垂直居中：' + JSON.stringify(layout));
    assert.ok(layout.outerLeft > 0 && layout.outerRight > 0 && layout.innerLeft === 0 && layout.innerRight === 0, '组合只保留外侧圆角：' + JSON.stringify(layout));
  };
  const assertCommitSplitAtWidths = async (panel: any) => {
    await assertCommitSplit(panel);
    const splitter = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await splitter.press('Home');
    await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-sidebar')?.getBoundingClientRect().width || Infinity) <= 261);
    await assertCommitSplit(panel);
    await splitter.dblclick();
    await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-sidebar')?.getBoundingClientRect().width || 0) > 261);
  };
  const open = async (branches: any) => {
    await page.goto(workspaceUrl + '/code/source-control'); await root().locator('.source-control-repository-copy').first().waitFor();
    await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
    const response = await page.request.get(api + '/code/source-control'); assert.equal(response.status(), 200);
    const catalog = await response.json(), repository = catalog.repositories.find((item: any) => item.worktrees.some((tree: any) => tree.location === branches.location));
    assert.ok(repository); const tree = repository.worktrees.find((item: any) => item.location === branches.location);
    const observed = page.waitForResponse((reply: any) => {const url = new URL(reply.url()); return url.pathname.endsWith('/code/commit-context') && url.searchParams.get('worktreeId') === tree.worktreeId;});
    await root().locator('[data-source-repository="' + repository.id + '"] [data-source-worktree="' + tree.worktreeId + '"] .source-control-repository-copy').click();
    const contextResponse = await observed;
    assert.equal(contextResponse.status(), 200, '读取精确提交上下文：' + await contextResponse.text());
    return {repository, tree};
  };
  const commitMenu = async (panel: any) => {
    await panel.locator('#commit-action-menu').click();
    const menu = page.getByRole('menu'); await menu.waitFor({state: 'visible'});
    assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['提交并同步', '提交并推送'], '下拉只保留两个立即执行的动作，提交并同步在前');
    assert.equal(await menu.locator('.ant-dropdown-menu-item-selected').count(), 0, '菜单不记忆选中动作');
    return menu;
  };
  const model = async (available: boolean) => {
    let counter = 0; const cancelled = new Set<string>(), starts: unknown[] = [];
    const executionConfig = {model: 'browser-confirmed-model', modelProvider: 'browser-confirmed-provider', reasoningEffort: 'high'};
    const agent = {id: 'browser-codex', kind: 'codex', label: 'Codex', capabilities: ['structured-generation'], availability: 'available', runtimeStatus: 'running', safeReason: null, lastExecutionConfig: null as typeof executionConfig | null};
    const run = (id: string, status: string) => ({id, agentId: agent.id, registrationRevision: 'browser-registry', status, output: status === 'succeeded' ? {commitMessage: 'feat: 浏览器生成提交说明\n\n验证生成结果可继续编辑。'} : null, error: null, executionConfig: status === 'succeeded' ? executionConfig : null});
    const add = async (pattern: string, handler: (route: any) => Promise<void>) => {await page.route(pattern, handler);};
    await add('**/api/v1/app/agents', async route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({revision: 'browser-registry', defaultAgentId: available ? agent.id : null, agents: available ? [agent] : []})}));
    await add('**/code/commit-message', async route => {starts.push(route.request().postDataJSON()); await route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify(run('browser-run-' + ++counter, 'running'))});});
    await add('**/api/v1/app/agents/runs?*', async route => {const id = new URL(route.request().url()).searchParams.get('runId')!, status = cancelled.has(id) ? 'cancelled' : 'succeeded'; if (status === 'succeeded') agent.lastExecutionConfig = {...executionConfig}; await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(run(id, status))});});
    await add('**/api/v1/app/agents/cancel', async route => {const id = route.request().postDataJSON().runId; cancelled.add(id); await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(run(id, 'cancelled'))});});
    return {starts, cancelled, setLastExecutionConfig: (config: typeof executionConfig) => {agent.lastExecutionConfig = config;}, dispose: () => page.unrouteAll({behavior:'wait'})};
  };

  await scenario('统一生成控件刷新与取消保留说明，生成后手改并提交只改变原工作树', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.configureAuthor({name: '浏览器提交', email: 'commit-browser@example.com'});
      const protocol = await model(true);
      try {
        await page.setViewportSize({width: 1440, height: 900}); const {tree} = await open(branches);
        await page.locator('#global-agents-entry').getByText('Codex', {exact: true}).waitFor();
        await page.getByRole('button', {name: '智能体', exact: true}).click();
        const drawer = page.locator('.agent-registry-drawer:visible');
        assert.equal(await drawer.getByRole('button', {name: '设为默认智能体 Codex', exact: true}).getAttribute('aria-pressed'), 'true');
        const detail = await openDetails(drawer);
        await detail.getByText(/独立服务按需启动，空闲 1 小时后释放/u).waitFor({state: 'visible'});
        await detail.getByText(/一次性生成不积累对话历史。/u).waitFor({state: 'visible'});
        await capture(page, 'source-control-global-agent-registry.png');
        await drawer.getByRole('button', {name: '关闭智能体', exact: true}).click();
        const panel = root().locator('.source-control-commit-panel'), input = panel.getByRole('textbox', {name: '提交说明内容', exact: true});
        assert.equal((await panel.innerText()).includes('Codex'), false, '功能区不常驻执行者名称');
        const height = await panel.evaluate((element: HTMLElement) => element.getBoundingClientRect().height); assert.ok(height >= 65 && height <= 120, '默认说明区保持紧凑：' + height);
        await assertCommitSplitAtWidths(panel);
        assert.equal(await panel.locator('#commit-changes').isDisabled(), true, '说明为空时主按钮禁用');
        assert.equal(await panel.locator('#commit-action-menu').isDisabled(), true, '说明为空时下拉入口同样禁用');
        await input.fill('测试菜单失效关闭'); await commitMenu(panel);
        await input.fill(''); await page.getByRole('menu').waitFor({state: 'hidden'});
        await input.fill('保留手写草稿');
        const draftInput = await input.elementHandle();
        const inventoryRead = page.waitForResponse((reply: any) => new URL(reply.url()).pathname.endsWith('/code/source-control-inventory'));
        await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click(); await inventoryRead;
        await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
        assert.equal(await input.inputValue(), '保留手写草稿', '逐库刷新完成后仍保留用户正在输入的提交说明');
        assert.equal(await input.evaluate((element: HTMLElement, before: HTMLElement) => element === before, draftInput), true, '刷新不会重建当前说明输入框');
        await draftInput.dispose();
        const started = page.waitForResponse((reply: any) => new URL(reply.url()).pathname.endsWith('/code/commit-message'));
        await panel.locator('#generate-commit-message').click(); await started;
        assert.equal(await panel.locator('#commit-changes').isDisabled(), true, '生成中主按钮禁用');
        assert.equal(await panel.locator('#commit-action-menu').isDisabled(), true, '生成中下拉入口同样禁用');
        await panel.locator('#cancel-commit-message').click(); await panel.locator('#cancel-commit-message').waitFor({state: 'hidden'});
        assert.equal(await input.inputValue(), '保留手写草稿'); assert.equal(protocol.cancelled.size, 1);
        await panel.locator('#generate-commit-message').click(); await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('#commit-message-text')?.value.startsWith('feat: 浏览器生成提交说明'));
        await page.waitForFunction(() => (document.querySelector('#commit-message-text')?.getBoundingClientRect().height || 0) >= 120);
        await assertCommitSplitAtWidths(panel);
        assert.equal((protocol.starts[0] as {worktreeId: string}).worktreeId, tree.worktreeId);
        await input.fill(['feat: 说明阅读高度', '', ...Array.from({length: 16}, (_, index) => '说明第 ' + (index + 1) + ' 行')].join('\n'));
        await page.waitForFunction(() => {const input = document.querySelector<HTMLTextAreaElement>('#commit-message-text'); return input && input.getBoundingClientRect().height >= 120 && input.getBoundingClientRect().height <= 252 && input.scrollHeight > input.clientHeight && getComputedStyle(input).overflowY === 'auto';});
        await input.fill('feat: 用户修改生成说明后提交');
        const before = branches.observe(branches.location), otherPositions = branches.otherPositions(branches.location);
        // commit/push/sync 串联真实 Git 写调用，按操作成本放宽响应预算。
        const written = page.waitForResponse((reply: any) => reply.request().method() === 'POST' && new URL(reply.url()).pathname.endsWith('/code/commit-changes'), {timeout: 30_000});
        await panel.locator('#commit-changes').click();
        const response = await written; assert.equal(response.status(), 200); const result = await response.json();
        assert.equal(response.request().postDataJSON().mode, 'commit', '主按钮固定直接发起提交');
        await page.getByRole('menu').waitFor({state: 'hidden'});
        assert.equal(result.commit.completed, true); assert.notEqual(result.commit.hash, before.head);
        await panel.getByText('已提交', {exact: true}).waitFor(); await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('#commit-message-text')?.value === '');
        await panel.locator('#commit-changes.ant-btn-loading').waitFor({state: 'hidden'});
        await page.waitForFunction(() => (document.querySelector('#commit-message-text')?.getBoundingClientRect().height || 100) <= 40);
        await assertCommitSplit(panel);
        assert.equal(branches.observe(branches.location).head, result.commit.hash); assert.equal(branches.observe(branches.location).status, ''); assert.deepEqual(branches.otherPositions(branches.location), otherPositions);
        await selectSourceControlView(root(), 'history'); await root().getByText('feat: 用户修改生成说明后提交', {exact: true}).waitFor();
        await capture(page, 'source-control-real-agent-message-commit.png');
      } finally {await protocol.dispose();}
    });
  });

  await scenario('提交并同步从菜单一次执行固定跟踪分支，等待共用禁用且完成后主按钮仍是提交', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.configureAuthor({name: '浏览器同步', email: 'sync-browser@example.com'});
      const protocol = await model(false), writes: string[] = [];
      const observe = (request: any) => {const path = new URL(request.url()).pathname; if (request.method() === 'POST' && /\/code\/(?:commit-changes|sync|push)$/.test(path)) writes.push(path);};
      let mutating=false,selectedSource:{repositoryId:string;worktreeId:string}|undefined;
      const contextChecks=new Set<Promise<void>>(),unexpectedContexts:unknown[]=[];
      const observeContext=(response:any)=>{
        const url=new URL(response.url());
        if(!mutating||response.status()!==409||!selectedSource||!url.pathname.endsWith('/code/commit-context')||url.searchParams.get('repositoryId')!==selectedSource.repositoryId||url.searchParams.get('worktreeId')!==selectedSource.worktreeId)return;
        const check=(async()=>{let body:{error?:{code?:unknown};cancelled?:boolean}|undefined;try{body=await response.json();}catch(error){await response.finished();const failure=response.request().failure()?.errorText;if(!failure?.includes('ERR_ABORTED')){unexpectedContexts.push({url:response.url(),bodyError:String(error),failure});return;}body={cancelled:true};}if(body?.error?.code==='code_source_changed'||body?.cancelled)expectedBrowserErrors.add('['+response.url()+']: Failed to load resource: the server responded with a status of 409 (Conflict)');else unexpectedContexts.push({url:response.url(),body});})();
        contextChecks.add(check);void check.then(()=>contextChecks.delete(check),error=>{contextChecks.delete(check);unexpectedContexts.push({observerError:String(error)});});
      };
      page.on('response',observeContext);
      let release = () => {}; const gate = new Promise<void>(resolve => {release = resolve;});
      const delay = async (route: any) => {await gate; await route.continue();};
      try {
        await page.setViewportSize({width: 1440, height: 900}); const {repository, tree} = await open(branches);selectedSource={repositoryId:repository.id,worktreeId:tree.worktreeId};
        const row = root().locator('[data-source-repository="' + repository.id + '"] [data-source-worktree="' + tree.worktreeId + '"]');
        // 密度布局收窄时分支入口收进行内“…”菜单；行内按钮可见用行内，否则走同一菜单路径。
        if (await row.locator('.source-control-row-action-button').isVisible()) await row.locator('.source-control-row-action-button').click();
        else {
          const label = codeRepositoryLabel(repository) + ' · ' + (tree.isMain ? '主工作树' : tree.name);
          const trigger = row.getByRole('button', {name: '操作菜单 · ' + label, exact: true});
          if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
          const rowMenu = page.getByRole('menu', {name: '操作菜单 · ' + label, exact: true}); await rowMenu.waitFor();
          await rowMenu.getByRole('menuitem', {name: '管理分支', exact: true}).click();
        }
        const manager = page.getByRole('region', {name: '分支管理 · ' + codeRepositoryLabel(repository) + ' · ' + (tree.isMain ? '主工作树' : tree.name), exact: true});
        await manager.getByRole('button', {name: '管理 ' + branches.remote + '/' + branches.remoteName, exact: true}).click();
        const action = page.getByRole('region', {name: '分支操作 · ' + branches.remote + '/' + branches.remoteName, exact: true});
        const switched = page.waitForResponse((reply: any) => reply.request().method() === 'POST' && new URL(reply.url()).pathname.endsWith('/code/branch-switch'));
        mutating=true;await action.getByRole('button', {name: '检出并切换为 ' + branches.remoteName, exact: true}).click();
        assert.equal((await switched).status(), 200); await manager.waitFor({state: 'hidden'});
        await page.waitForFunction(({id, title}: {id: string; title: string}) => [...document.querySelectorAll('.code-source-control-page:not([hidden]) [data-source-worktree]')].some(element => element.getAttribute('data-source-worktree') === id && element.querySelector('.source-control-row-action-button')?.getAttribute('title') === title), {id: tree.worktreeId, title: branches.remoteName + ' · 管理分支'});
        const panel = root().locator('.source-control-commit-panel'), input = panel.getByRole('textbox', {name: '提交说明内容', exact: true});
        await input.fill('feat: 浏览器提交并同步');
        const before = branches.observe(branches.location), otherPositions = branches.otherPositions(branches.location);
        page.on('request', observe); await page.route('**/code/commit-changes', delay);
        const started = page.waitForRequest((request: any) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/code/commit-changes'));
        // commit/push/sync 串联真实 Git 写调用，按操作成本放宽响应预算。
        const written = page.waitForResponse((reply: any) => reply.request().method() === 'POST' && new URL(reply.url()).pathname.endsWith('/code/commit-changes'), {timeout: 30_000});
        await (await commitMenu(panel)).getByRole('menuitem', {name: '提交并同步', exact: true}).click(); await started;
        await page.getByRole('menu').waitFor({state: 'hidden'});
        assert.equal(await panel.locator('#commit-changes').innerText(), '正在提交并同步…');
        assert.equal(await panel.locator('#commit-changes').isDisabled(), true); assert.equal(await panel.locator('#commit-action-menu').isDisabled(), true);
        release(); const response = await written; assert.equal(response.status(), 200); const result = await response.json();
        assert.equal(response.request().postDataJSON().mode, 'commit-sync');
        assert.equal(result.commit.completed, true); assert.notEqual(result.commit.hash, before.head);
        assert.equal(result.push.status, 'not-requested'); assert.equal(result.sync.status, 'succeeded');
        assert.equal(result.sync.upstream, branches.remote + '/' + branches.remoteName);
        assert.equal(result.sync.fetch.status, 'succeeded'); assert.equal(result.sync.push.status, 'succeeded');
        await panel.getByText('已提交并同步', {exact: true}).waitFor();
        await panel.locator('#commit-changes.ant-btn-loading').waitFor({state: 'hidden'});
        assert.equal(await panel.locator('#commit-changes').innerText(), '提交'); assert.equal(await input.inputValue(), '');
        assert.equal(await panel.locator('#retry-push').count(), 0); assert.equal(writes.length, 1); assert.ok(writes[0].endsWith('/code/commit-changes'));
        assert.equal(branches.observe(branches.location).head, result.sync.head); assert.equal(branches.observe(branches.location).status, '');
        assert.deepEqual(branches.otherPositions(branches.location), otherPositions);
        assert.equal(branches.keepContent(), 'preserve current work\n');
        // A read of the old working diff may finish after the successful commit
        // removed that change. Only this exact retired comparison may return 404.
        const retiredDiff = api + '/code/diff?' + new URLSearchParams({repositoryId: repository.id, worktreeId: tree.worktreeId, filePath: branches.keepPath, area: 'working'});
        expectedBrowserErrors.add('[' + retiredDiff + ']: Failed to load resource: the server responded with a status of 404 (Not Found)');
        assert.equal(await root().getByRole('region', {name:'差异内容',exact:true}).locator('.ant-alert-error:visible').count(), 0);
        const context = await page.request.get(api + '/code/sync-context?' + new URLSearchParams({repositoryId: repository.id, worktreeId: tree.worktreeId}));
        assert.equal(context.status(), 200); const after = await context.json(); assert.equal(after.ahead, 0); assert.equal(after.behind, 0);
        const freshContext=await page.request.get(api+'/code/commit-context?'+new URLSearchParams({repositoryId:repository.id,worktreeId:tree.worktreeId}));assert.equal(freshContext.status(),200,'写入完成后可读取准确的新提交上下文');await Promise.all(contextChecks);assert.deepEqual(unexpectedContexts,[],'仅接受该来源写入期间的明确版本变化冲突');
        await assertCommitSplitAtWidths(panel); await capture(page, 'source-control-real-commit-sync.png');
      } finally {release();await Promise.all(contextChecks);page.off('response',observeContext);page.off('request', observe); await page.unroute('**/code/commit-changes', delay); await protocol.dispose();}
    });
  });
}
