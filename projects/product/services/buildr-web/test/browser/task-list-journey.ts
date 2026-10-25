import assert from 'node:assert/strict';
/** Retains the original real-page assertions; shared preparation remains with the host. */
export async function runTaskListJourney({antdSelectDisplay, antdSelectOptionTexts, applyTaskFilters, browserErrors, capture, closeTaskReading, confirmAntModal, crypto, expectedBrowserErrors, fs, openAntdSelect, openTaskActionModal, openTaskFilterPanel, openTaskSearch, otherWorkspaceId, page, path, prepareEvidenceFixture, process, recordVerificationResultFromEvidence, runBuildr, runtime, selectAntdOption, selected, showPrimaryNavigation, t, taskFocusedT, url, workspaceRoot, workspaceUrl, writeChange}: any) {
  await t.test('无关联变更的任务可从方案设计与单独查看阅读本机原型', async () => {
    const taskId = 'browser-local-prototype';
    runtime.createTask(workspaceRoot, { taskId, title: '本机原型示例', intent: '验证未决定实施时也可阅读已归入原型', projects: [], services: [], changes: [] });
    const localRoot = path.join(workspaceRoot, '.buildr/local/task-prototypes', taskId);
    fs.mkdirSync(localRoot, { recursive: true });
    fs.writeFileSync(path.join(localRoot, 'screen.html'), `<!doctype html><html><head><title>任务本机页面</title></head><body>
<!-- buildr:ui-prototype --><h1 id="local-prototype-heading">当前任务的本机原型</h1><button id="local-prototype-action" onclick="this.textContent='已切换'">切换状态</button>
<script id="buildr-prototype" type="application/json">{"version":1,"pages":[{"id":"local","title":"任务本机页面","notes":[{"id":"scope","title":"本机来源","text":"此页面属于当前任务，不要求关联规范变更。"}],"states":[]}]}</script></body></html>`);
    assert.deepEqual(runtime.inspectTask(workspaceRoot, taskId).record.changes, []);
    await page.goto(`${workspaceUrl}/tasks/${taskId}`);
    await page.locator('[data-task-node=design]').click();
    await page.locator('[data-task-tab=prototype]').filter({ hasText: '任务本机页面' }).click();
    await page.frameLocator('#task-prototype-frame').locator('#local-prototype-heading').waitFor({ state: 'visible' });
    await page.frameLocator('#task-prototype-frame').locator('#local-prototype-action').click();
    assert.equal(await page.frameLocator('#task-prototype-frame').locator('#local-prototype-action').innerText(), '已切换');
    await page.locator('#task-prototype-source summary').click();
    assert.match(await page.locator('#task-prototype-source').innerText(), /任务原型[\s\S]*screen.html/);
    assert.doesNotMatch(await page.locator('#task-prototype-source').innerText(), /null\/null/);
    assert.equal(await page.locator('#prototype-notes-panel').isVisible(), false, '任务内原型的功能说明默认收回');
    await page.locator('#prototype-notes-toggle').click();
    await page.getByText('此页面属于当前任务，不要求关联规范变更。').waitFor({ state: 'visible' });
    const [reader] = await Promise.all([page.waitForEvent('popup'), page.locator('#task-prototype-open-window').click()]);
    await reader.waitForURL((opened: any) => new URL(opened).pathname.endsWith(`/tasks/${taskId}/prototypes`));
    await reader.frameLocator('#task-prototype-frame').locator('#local-prototype-heading').waitFor({ state: 'visible' });
    assert.equal(await reader.locator('#prototype-notes-panel').isVisible(), false, '单独查看也保持功能说明默认收回');
    await reader.locator('#prototype-notes-toggle').click();
    await reader.getByText('此页面属于当前任务，不要求关联规范变更。').waitFor({ state: 'visible' });
    assert.equal(await reader.locator('#task-prototype-frame').getAttribute('sandbox'), 'allow-scripts');
    await reader.close();
    process.stderr.write('[buildr-browser] selector=task phase=task-local-prototype-verified\n');
  });

  await t.test('任务列表筛选、编辑、冲突、终态确认与窄屏交互共享同一 Task Record', async () => {
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    const staleChangeRoot: any = path.join(workspaceRoot, 'projects', 'demo', 'openspec', 'changes', 'stale-history');
    writeChange(path.join(workspaceRoot, 'projects', 'demo'), 'stale-history', '历史引用');
    const staleReferenceTask: any = runtime.createTask(workspaceRoot, { taskId: 'browser-stale-reference', title: '历史引用任务', intent: '验证终态历史引用不占用任务列表', projects: ['demo'], services: [], changes: ['demo/stale-history'] });
    runtime.abandonTask(workspaceRoot, 'browser-stale-reference', { expectedRecordDigest: staleReferenceTask.recordDigest, reason: '构造已放弃历史任务' });
    fs.rmSync(staleChangeRoot, { recursive: true });
    prepareEvidenceFixture(runtime, workspaceRoot, 'browser-delivered');
    prepareEvidenceFixture(runtime, workspaceRoot, 'browser-stale');
    recordVerificationResultFromEvidence(runtime, workspaceRoot, 'browser-stale', {
      targetIdentity: `sha256-${crypto.createHash('sha256').update('browser-stale-target').digest('hex')}`, targetSummary: '已变化目标',
      capabilities: [{ project: 'demo', capability: 'demo.browser', outcome: 'passed', facts: ['旧目标验证事实。'] }],
      coverageGaps: [], conclusion: { outcome: 'passed', summary: '旧目标曾通过。' }, declarationRoot: workspaceRoot,
    });
    runtime.completeTask(workspaceRoot, 'browser-delivered', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-delivered').recordDigest, summary: '浏览器交付完成' });
    await page.goto(`${workspaceUrl}/tasks/browser-parent`);
    await page.waitForFunction((id: any) => document.getElementById('task-detail-id')?.textContent === id, 'browser-parent');
    await page.locator('.composite-task-reader').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-work-path').count(), 0, '组合任务使用整体目标与子任务阅读');
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.waitForFunction((id: any) => document.getElementById('task-detail-id')?.textContent === id, 'browser-task');
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true');
    const focusReads: string[] = [];
    const trackFocusReads = (request: any) => { if (new URL(request.url()).pathname.includes('/tasks/browser-task')) focusReads.push(request.url()); };
    await page.locator('#task-node-content .markdown-body').waitFor({state:'visible'});
    await page.locator('#task-detail-refresh[aria-busy="false"]').waitFor({state:'visible'});
    page.on('request',trackFocusReads);
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(350);
    page.off('request',trackFocusReads);
    assert.deepEqual(focusReads, [], '返回浏览器不自动重读任务详情');
    assert.deepEqual(await page.locator('[data-task-node]').evaluateAll((nodes: Element[]) => nodes.map(node => node.getAttribute('data-task-node'))), ['requirements','design','implementation','closeout']);
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /验证 Task Record 页面/, '说明节点默认显示记录正文');
    await page.locator('[data-task-node=design]').click();
    await page.locator('[data-task-artifact$="proposal.md"]').click();
    assert.equal(await page.locator('[data-task-artifact$="brief.md"]').count(), 0);
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '验证 Buildr Web' }).waitFor({ state: 'visible' });
    await page.locator('#task-node-content').getByRole('button',{name:'查看原文',exact:true}).click();
    assert.match(await page.locator('#task-node-content .markdown-reader-source').innerText(), /验证 Buildr Web/);
    await page.locator('#task-node-content').getByRole('button',{name:'阅读模式',exact:true}).click();
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '任务详情复用列表分屏，内部不得再创建分屏');
    assert.equal(await page.locator('.pane-right:visible').count(), 1);
    assert.equal(await page.locator('.pane-left #task-table-body').isVisible(), true, '打开详情时保留任务列表');
    assert.ok(await page.locator('.task-compact-table thead').isVisible());
    assert.equal(await page.locator('.task-row-id').count(),0);
    const rowHeight = await page.locator('#task-table-body tr.ant-table-row').first().evaluate((node: HTMLElement) => node.getBoundingClientRect().height);
    assert.ok(rowHeight <= 80, `任务条目应紧凑，实际高度 ${rowHeight}`);
    assert.equal(await page.getByRole('button',{name:'收藏当前资料',exact:true}).count(),0);
    assert.equal(await page.locator('#task-context-edit').count(),0);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
    await page.locator('[data-task-artifact$="proposal.md"]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '验证 Buildr Web' }).waitFor({ state: 'visible' });
    await page.locator('[data-task-artifact$="design.md"]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: 'Browser smoke fixture' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.task-summary-checks').count(), 0, '总览不重复列出专业状态');
    await page.locator('[data-task-content=review]').waitFor({state:'visible'});
    await page.locator('#task-node-content .task-node-reading').evaluate((node: HTMLElement) => { node.scrollTop = 350; });
    const designScroll = await page.locator('#task-node-content .task-node-reading').evaluate((node: HTMLElement) => node.scrollTop);
    assert.ok(designScroll > 200, '长设计文档形成实际阅读位置');
    assert.equal(await page.locator('.pane-right .pane-body').evaluate((node:HTMLElement)=>node.scrollTop),0,'正文滚动不移动整页');
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click();
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
    await page.waitForFunction((top: number) => Math.abs((document.querySelector('#task-node-content .task-node-reading')?.scrollTop || 0) - top) < 3, designScroll, {timeout:3000}).catch(async () => { assert.fail(`设计阅读位置未恢复：期望 ${designScroll}，实际 ${await page.locator('#task-node-content .task-node-reading').evaluate((node: HTMLElement) => node.scrollTop)}`); });
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /Browser smoke fixture/, '回到原设计文档和滚动位置');

    await page.locator('[data-task-artifact$="spec.md"]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: 'Demo Capability Specification' }).waitFor({ state: 'visible' });
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click();
    assert.equal(await page.locator('#task-checklist-panel').isVisible(), false, '清单默认隐藏');
    await page.locator('#task-checklist-toggle').click();
    await page.locator('.task-checklist .markdown-body').filter({ hasText: '准备 fixture' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-checklist-toggle').evaluate((node:HTMLElement) => document.activeElement === node),true,'浮窗不自动抢焦点');
    await page.getByRole('button',{name:'关闭实施清单',exact:true}).press('Escape');
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),false);
    assert.equal(await page.locator('#task-checklist-toggle').evaluate((node:HTMLElement) => document.activeElement === node),true,'关闭后焦点回到入口');
    await page.setViewportSize({width:2560,height:1000});
    await page.mouse.move(10,10);
    await page.locator('#task-checklist-toggle').hover();
    await page.locator('#task-checklist-panel').waitFor({state:'visible'});
    await page.locator('#task-checklist-panel .side-reading-heading').hover();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),true,'入口移入清单不会误关');
    const bounds = await page.locator('#task-checklist-panel').evaluate((node:HTMLElement)=>({top:node.getBoundingClientRect().top,right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width,layoutTop:document.querySelector('.task-detail-layout')!.getBoundingClientRect().top}));
    assert.ok(Math.abs(bounds.top-bounds.layoutTop)<2,'浮窗只在标签下方');
    const tabsBottom=await page.locator('#task-work-path').evaluate((node:HTMLElement)=>node.getBoundingClientRect().bottom);
    assert.ok(Math.abs(bounds.top-tabsBottom)<2,'浮窗上沿贴齐标签分隔线');
    assert.equal(Math.round(bounds.width),520);
    await page.locator('#task-checklist-pin').click();
    assert.equal(await page.locator('#task-checklist-pin').getAttribute('aria-pressed'),'true');
    const pinned = await page.locator('#task-checklist-panel').evaluate((node:HTMLElement)=>({width:node.getBoundingClientRect().width,layout:node.parentElement!.clientWidth,reading:document.querySelector('.task-detail-reading')!.getBoundingClientRect().right,left:node.getBoundingClientRect().left}));
    assert.ok(Math.abs(pinned.width/pinned.layout-.35)<.02,'固定按比例占位');
    assert.ok(pinned.reading<=pinned.left,'固定不遮盖正文');
    await page.mouse.move(10,10); await page.waitForTimeout(500);
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),true,'固定后离开不隐藏');
    await page.locator('#task-checklist-pin').click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),true,'取消固定后鼠标不动且仍在面板内时不自动隐藏');
    await page.mouse.move(10,10);
    await page.locator('#task-checklist-panel').waitFor({state:'hidden'});
    await page.setViewportSize({width:1280,height:720});

    await closeTaskReading(page);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /Demo Capability Specification/, '切回方案保持上次选择的规范');
    await page.locator('[data-task-tab=prototype]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-task-tab=prototype]').length === 2);
    assert.equal(await page.locator('[data-task-tab=prototype]').count(), 2);
    await page.locator('[data-task-tab=prototype]').filter({ hasText: '原型任务总览' }).click();
    await page.locator('#task-prototype-source summary').click();
    assert.match(await page.locator('#task-prototype-source').innerText(), /demo\/browser-flow[\s\S]*prototype-fixtures/);
    assert.equal(await page.locator('#task-prototype-open-window').innerText(), '单独查看');
    assert.equal(await page.locator('.ui-prototype-stage-heading').getByText('隔离预览').count(), 0);
    assert.equal(await page.locator('#task-prototype-frame').getAttribute('sandbox'), 'allow-scripts');
    const prototypeSource: any = await page.locator('#task-prototype-frame').getAttribute('src');
    assert.ok(prototypeSource);
    const [prototypeWindow]: any = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('#task-prototype-open-window').click(),
    ]);
    await prototypeWindow.waitForURL((opened: any) => new URL(opened).pathname.endsWith('/tasks/browser-task/prototypes'));
    await prototypeWindow.locator('nav[aria-label="原型页面列表"]').waitFor({state:'visible'});
    await prototypeWindow.locator('nav button').nth(1).waitFor({state:'visible'});
    assert.equal(await prototypeWindow.locator('nav button').count(),2);
    assert.equal(await prototypeWindow.locator('#task-prototype-frame').getAttribute('sandbox'),'allow-scripts');
    if (!await prototypeWindow.locator('#prototype-notes-panel').isVisible()) await prototypeWindow.getByRole('button',{name:'功能说明',exact:true}).click();
    await prototypeWindow.getByText('此页面尚未提供与本次任务相关的功能说明。').waitFor({state:'visible'});
    await prototypeWindow.close();
    const prototypeResponse: any = await page.request.get(new URL(prototypeSource, url).href);
    assert.equal(prototypeResponse.status(), 200);
    assert.match(prototypeResponse.headers()['content-security-policy'] || '', /sandbox allow-scripts[\s\S]*connect-src 'none'[\s\S]*form-action 'none'[\s\S]*frame-ancestors 'self'/);
    const prototypeFrame: any = page.frameLocator('#task-prototype-frame');
    await prototypeFrame.locator('#prototype-action').waitFor({ state: 'visible' });
    assert.equal(await prototypeFrame.locator('body').getAttribute('data-parent-access'), 'blocked');
    await prototypeFrame.locator('#prototype-action').click();
    await prototypeFrame.locator('#prototype-state').filter({ hasText: '已确认' }).waitFor({ state: 'visible' });
    await page.locator('[data-task-tab=prototype]').filter({ hasText: '原型任务详情' }).click();
    await page.frameLocator('#task-prototype-frame').locator('#prototype-detail-heading').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-prototype-title').innerText(), '原型任务详情');
    // Coordination consumes real task outcomes without a Parent development workflow.
    runtime.completeTask(workspaceRoot, 'browser-contribution-delivered', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-contribution-delivered').recordDigest, summary: '贡献交付子任务已完成' });
    runtime.completeTask(workspaceRoot, 'browser-unproven', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-unproven').recordDigest, summary: '顶层标记完成，实际交付仍需核对' });
    // Review and Verification remain independent facts without an Environment record.
    prepareEvidenceFixture(runtime, workspaceRoot, 'browser-task');

    const defaultTaskCount: any = runtime.queryTasks(workspaceRoot, { status: 'open' }).matchingTaskCount;
    await page.getByRole('button', {name:'关闭 普通任务', exact:true}).click();
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), defaultTaskCount, '默认目录必须只显示未结束任务');
    assert.equal(await page.locator('#task-detail-id').count(), 0, '完整列表不得自动选择第一项任务');
    const listFrame = await page.locator('#task-table-wrap').evaluate((element: HTMLElement) => {
      const table = element.querySelector('.task-compact-table')!;
      const outer = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth, bottomGap: outer.bottom - table.getBoundingClientRect().bottom };
    });
    assert.equal(listFrame.borderTop, '0px', '任务列表只保留列表本身的一层边框');
    assert.equal(listFrame.borderBottom, '0px', '任务列表外容器不能再画一层底框');
    assert.ok(listFrame.bottomGap <= 2, `全部读完后不能保留空的续载区域：${JSON.stringify(listFrame)}`);
    assert.equal(await page.locator('#task-load-more-state').isVisible(), false, '无更多任务时续载状态不占位');
    await page.locator('#task-filter-q').fill('绝对不会命中的任务');
    await page.locator('#task-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-empty').innerText(), /当前筛选没有匹配任务/);
    await page.locator('#task-filter-q').clear();
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    await page.locator('#task-filter-q').fill('任务');
    await page.locator('#task-search-hint').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-search-hint').innerText(), /每个关键词至少输入3个字符/);
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), defaultTaskCount, '短关键词不得触发扫描或替换当前结果');
    await page.locator('#task-filter-q').clear();
    await page.locator('#task-search-hint').waitFor({ state: 'hidden' });
    process.stderr.write('[buildr-browser] selector=task phase=filtered-empty-verified\n');

    let paginationStore: any = runtime.openWorkspaceStructuredStore(workspaceRoot, { writable: true });
    const insertPaginationTask: any = paginationStore.database.prepare('INSERT INTO tasks(task_id, title, intent, status, result_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    paginationStore.database.exec('BEGIN');
    for (let index: any = 0; index < 60; index += 1) {
      insertPaginationTask.run(`browser-page-${String(index).padStart(2, '0')}`, `滚动续载任务 ${index}`, '验证 50/40 信息流分页', 'todo', null, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    }
    paginationStore.database.exec('COMMIT');
    paginationStore.database.close();
    const paginationRequests: any[] = [];
    const observePaginationRequest: any = (request: any) => {
      const requestUrl: any = new URL(request.url());
      if (requestUrl.pathname.endsWith('/tasks')) paginationRequests.push(requestUrl);
    };
    page.on('request', observePaginationRequest);
    const paginationRoute: any = /\/tasks(?:\?|$)/;
    let failNextPaginationRequest: any = true;
    await page.route(paginationRoute, async (route: any) => {
      const requestUrl: any = new URL(route.request().url());
      if (failNextPaginationRequest && requestUrl.searchParams.has('cursor')) {
        failNextPaginationRequest = false;
        expectedBrowserErrors.add(requestUrl.href);
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'browser_pagination_fixture_failed', message: '续载夹具失败' } }) });
      }
      return route.continue();
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 50);
    assert.match(await page.locator('#tasks-state').innerText(), /已加载 50 \/ 共 \d+ 个任务/);
    const prefetchRow: any = page.locator('#task-table-body [data-task-prefetch="true"]');
    await prefetchRow.scrollIntoViewIfNeeded();
    await page.locator('#task-load-more-state').getByRole('button', { name: '继续读取失败，重试', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), 50, '续载失败不得清空或替换已加载 Task');
    await page.locator('#task-load-more-state').getByRole('button', { name: '继续读取失败，重试', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length > 50);
    await page.locator('#task-load-more-state').waitFor({ state: 'hidden' });
    const loadedTaskIds: any[] = await page.locator('#task-table-body tr.ant-table-row').evaluateAll((rows: any[]) => rows.map((row: any) => row.getAttribute('data-task-id')));
    assert.equal(new Set(loadedTaskIds).size, loadedTaskIds.length, '滚动追加不得产生重复 Task');
    assert.equal(paginationRequests.some((requestUrl: any) => requestUrl.searchParams.get('pageSize') === '50' && requestUrl.searchParams.has('cursor')), true, '第40条附近必须使用cursor预取下一批');
    const returnRow = page.locator('#task-table-body tr.ant-table-row').nth(45);
    await returnRow.scrollIntoViewIfNeeded();
    const beforeDetailScroll = await page.locator('#task-table-wrap').evaluate((element: HTMLElement) => element.closest('.pane-body')?.scrollTop || 0);
    assert.ok(beforeDetailScroll > 0, '完整列表必须支持主屏内滚动');
    await returnRow.click();
    await page.getByRole('button', {name:'关闭 普通任务', exact:true}).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-wrap:visible').count(), 1, '打开副屏期间保留唯一任务列表');
    assert.equal(await page.locator('.pane-stage:visible').count(), 1);
    await page.getByRole('button', {name:'关闭 普通任务', exact:true}).click();
    await page.waitForURL(`${workspaceUrl}/tasks`);
    await page.waitForFunction((top: number) => Math.abs((document.querySelector('#task-table-wrap')?.closest('.pane-body')?.scrollTop || 0) - top) <= 2, beforeDetailScroll);
    assert.ok(await page.locator('#task-table-body tr.ant-table-row').count() > 50, '返回应恢复先前读到的批次');
    await page.unroute(paginationRoute);
    page.off('request', observePaginationRequest);
    paginationStore = runtime.openWorkspaceStructuredStore(workspaceRoot, { writable: true });
    paginationStore.database.prepare("DELETE FROM tasks WHERE task_id LIKE 'browser-page-%'").run();
    paginationStore.database.close();
    await page.reload();
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    process.stderr.write('[buildr-browser] selector=task phase=infinite-scroll-verified\n');

    await page.goto(`${url}/workspaces/${otherWorkspaceId}/tasks`);
    await page.locator('#task-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-empty').innerText(), /还没有正式任务记录/);
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    process.stderr.write('[buildr-browser] selector=task phase=empty-workspace-verified\n');
    let markDelayedActiveStarted: any;
    const delayedActiveStarted: any = new Promise((resolve: any) => { markDelayedActiveStarted = resolve; });
    const taskListRoute: any = /\/tasks(?:\?|$)/;
    let delayNextTaskList: any = true;
    const observedTaskRequests: any[] = [];
    const observeTaskRequest: any = (request: any) => { if (request.url().includes('/tasks')) observedTaskRequests.push(request.url()); };
    page.on('request', observeTaskRequest);
    await page.route(taskListRoute, async (route: any) => {
      if (!delayNextTaskList) return route.continue();
      delayNextTaskList = false;
      markDelayedActiveStarted();
      await new Promise((resolve: any) => setTimeout(resolve, 800));
      try { await route.continue(); } catch {}
    });
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-status', '进行中');
    await applyTaskFilters(page);
    await Promise.race([
      delayedActiveStarted,
      page.waitForTimeout(5000).then(() => { throw new Error(`delayed Task list request was not observed: ${observedTaskRequests.join(', ')}`); }),
    ]);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-status', '已完成');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 3);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), 3, '旧active请求不得覆盖新的completed结果');
    await page.unroute(taskListRoute);
    page.off('request', observeTaskRequest);
    await openTaskFilterPanel(page);
    await page.locator('#task-filter-clear').click();
    await applyTaskFilters(page);
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    process.stderr.write('[buildr-browser] selector=task phase=request-race-verified\n');
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-status', '已放弃');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    assert.match(await page.locator('#task-table-body').innerText(), /历史引用任务/);
    assert.equal(await page.locator('#task-diagnostics').count(), 0, '历史引用诊断只保留在任务详情，不占用任务列表');
    await openTaskFilterPanel(page);
    await page.locator('#task-filter-clear').click();
    await applyTaskFilters(page);
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    await showPrimaryNavigation(page, 'workbench');
    assert.equal(await page.locator('.primary-secondary-navigation:visible [data-nav="tasks"]').evaluate((item: any) => item.classList.contains('active')), true);
    assert.equal(await page.getByRole('columnheader', {name:'任务', exact:true}).isVisible(), true);
    assert.equal(await page.locator('#task-create-form').count(), 0);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-project', '演示项目');
    await openAntdSelect(page, 'task-filter-service');
    assert.deepEqual(await antdSelectOptionTexts(page), ['全部服务', '演示服务']);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: '演示服务' })
      .first()
      .click();
    await page.waitForFunction(
      () => document.querySelector(`.ant-select:has(#task-filter-service) .ant-select-selection-item`)?.textContent?.includes('演示服务'),
    );
    await applyTaskFilters(page);
    await openTaskSearch(page);
    await page.locator('#task-filter-q').fill('轻量查询');
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    assert.match(await page.locator('#task-table-body').innerText(), /页面查看任务/);
    const selectedListUrl = page.url();
    await page.locator('#task-table-body tr.ant-table-row').click();
    await page.waitForFunction((id: any) => document.getElementById('task-detail-id')?.textContent === id, 'created-in-app');
    assert.equal(page.url(), selectedListUrl, '列表打开详情保持当前筛选 URL');
    assert.equal(await page.locator('#task-detail-status').innerText(), '进行中');
    assert.equal(await page.locator('.pane-left #task-table-body tr.ant-table-row').count(), 1, '打开详情保留列表筛选结果');
    assert.equal(await page.locator('#task-filter-q').inputValue(), '轻量查询');
    assert.equal(await page.locator('.pane-right #task-detail-main').isVisible(), true);
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '任务详情中没有嵌套副屏');
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /验证 Buildr Web 轻量查询客户端/, '说明节点默认显示记录正文');
    await page.locator('[data-task-node=design]').click();
    await page.locator('[data-task-artifact$="proposal.md"]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '验证 Buildr Web' }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('link', {name:'查看关联变更',exact:true}).count(), 0, '节点正文不重复提供技术目录入口');
    assert.match(await page.locator('#task-detail-parent').innerText(), /浏览器协调任务[\s\S]*进行中/);
    await page.locator('#task-detail-parent a').click();
    await page.locator('#task-detail-id:visible').filter({ hasText: 'browser-parent' }).waitFor();
    await page.getByRole('button', { name: '关闭 普通任务', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-detail-id')?.textContent === 'browser-parent');
    await page.locator('.composite-task-reader').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-work-path').count(), 0);
    await openTaskActionModal(page, 'task-complete-action');
    await page.getByRole('dialog').filter({ hasText: '结束组合任务' }).waitFor({ state: 'visible' });
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-parent').record.status, 'active');

    await page.goto(`${workspaceUrl}/tasks/created-in-app`);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click(); await page.locator('[data-task-content=review]').click();
    await page.locator('#task-node-content .task-node-empty').filter({ hasText: '暂无审查记录。' }).waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-node-content').innerText(), /暂无审查记录/);
    assert.equal(await page.getByRole('button', { name: '交给智能体审查', exact: true }).count(), 0);
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-node-content .task-node-empty').filter({ hasText: '尚未保存验证结果。' }).waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-node-content').innerText(), /尚未保存验证结果/);
    await openTaskActionModal(page, 'task-complete-action');
    await page.locator('#task-complete-summary').fill('页面确认完成');
    await page.locator('#task-complete-form').getByRole('button', { name: '确认完成', exact: true }).click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'visible' });
    await confirmAntModal(page);
    await page.locator('#task-detail-status').filter({ hasText: '已完成' }).waitFor({ state: 'visible' });
    await page.locator('#task-more-actions').click(); assert.equal(await page.locator('#task-complete-action').count(), 0); await page.keyboard.press('Escape');
    assert.equal(runtime.inspectTask(workspaceRoot, 'created-in-app').record.result.summary, '页面确认完成');
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '页面确认完成' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '收尾节点直接展示完成摘要');
    const retrospectivePath: any = path.join(workspaceRoot, '.buildr/local/task-retrospectives/created-in-app.md');
    fs.mkdirSync(path.dirname(retrospectivePath), { recursive: true });
    fs.writeFileSync(retrospectivePath, '# 执行效率\n\n减少重复读取。\n');
    const retrospectiveDocument: any = runtime.inspectTaskRetrospectiveDocument(workspaceRoot, 'created-in-app');
    runtime.updateTask(workspaceRoot, 'created-in-app', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'created-in-app').recordDigest, retrospectiveState: 'pending-decision', retrospectiveDocumentDigest: retrospectiveDocument.actualDigest });
    await page.goto(`${workspaceUrl}/tasks`);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '等待决定');
    assert.equal(await antdSelectDisplay(page, 'task-filter-status'), '全部');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    await page.goto(`${workspaceUrl}/tasks/created-in-app`);
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click(); await page.locator('[data-task-closeout=retrospective]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '减少重复读取' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-retrospective-document-state').innerText(), '等待你的决定');
    await page.locator('#task-retrospective-document-decide').click();
    await page.getByRole('button', { name: '我已完成决定', exact: true }).click();
    await page.locator('#task-retrospective-document-state').filter({ hasText: '已经决定' }).waitFor({ state: 'visible' });
    await page.goto(`${workspaceUrl}/tasks`);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '已经决定');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);

    // A real task-owned checkout has uncommitted content different from the retained project.
    runBuildr(['worktree', 'create', 'browser-task', '--branch', 'browser-task-reading', '--start-point', 'HEAD', '--include', 'project:demo', '--target', workspaceRoot]);
    const worktreeProject = path.join(workspaceRoot, '.worktrees/browser-task/projects/demo');
    fs.writeFileSync(path.join(worktreeProject, 'docs/task-reference.md'), '# 任务参考资料\n\n这是工作树的未提交说明。\n\n[继续阅读](more.md)\n');
    fs.writeFileSync(path.join(worktreeProject, 'docs/more.md'), '# 后续资料\n\n继续读取同一工作树。\n');
    fs.writeFileSync(path.join(worktreeProject, 'openspec/changes/browser-flow/proposal.md'), '# 工作树中的提案\n\n独立文件系统中的最新提案。\n\n[阅读历史说明](brief.md)\n');
    const historicalBrief = '\ufeff# 旧变更说明\r\n\r\n旧文件保留，通过普通链接读取。\r\n';
    const historicalBriefPath = path.join(worktreeProject, 'openspec/changes/browser-flow/brief.md');
    fs.writeFileSync(historicalBriefPath, historicalBrief);
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /验证 Task Record 页面/, '说明节点默认显示记录正文');
    await page.locator('[data-task-node=design]').click();
    await page.locator('[data-task-artifact$="proposal.md"]').click();
    assert.equal(await page.locator('[data-task-artifact$="brief.md"]').count(), 0);
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '独立文件系统中的最新提案' }).waitFor({ state: 'visible' });
    await page.locator('#task-node-content').getByRole('link', { name: '阅读历史说明', exact: true }).click();
    await page.locator('.resource-reader:visible .markdown-body').filter({ hasText: '旧文件保留，通过普通链接读取' }).waitFor({ state: 'visible' });
    assert.equal(fs.readFileSync(historicalBriefPath, 'utf8'), historicalBrief);
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await page.locator('.resource-reader:visible').waitFor({state:'hidden'});
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '独立文件系统中的最新提案' }).waitFor({state:'visible'});
    await page.locator('#task-detail-refresh[aria-busy="false"]').waitFor({state:'visible'});
    const prototypeFailureRoute = /\/tasks\/browser-task\/ui-prototypes(?:\?|$)/;
    await page.route(prototypeFailureRoute, async (route: any) => {
      expectedBrowserErrors.add(route.request().url());
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'browser_prototype_fixture_failed', message: '原型读取夹具失败' } }) });
    });
    try {
      const prototypeFailure = page.waitForResponse((response: any) => new URL(response.url()).pathname.endsWith('/tasks/browser-task/ui-prototypes') && response.status() === 500);
      await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
      await page.locator('#task-detail-refresh').click();
      assert.equal((await prototypeFailure).status(), 500);
      await closeTaskReading(page); await page.locator('[data-task-node=requirements]').click();
      await page.locator('#task-detail-refresh:not(.ant-btn-loading)').waitFor({ state: 'visible' });
      assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /验证 Task Record 页面/, '原型失败不影响记录说明');
      await page.locator('[data-task-node=design]').click();
      await page.locator('[data-task-artifact$="proposal.md"]').click();
      assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /独立文件系统中的最新提案/, '原型局部读取失败不影响已读取的标准提案');
    } finally { await page.unroute(prototypeFailureRoute); }
    await page.locator('#task-detail-intent').getByRole('link', { name: '任务参考资料', exact: true }).click();
    const linkedDocument = page.locator('.resource-reader:visible');
    await linkedDocument.locator('.markdown-body').filter({ hasText: '这是工作树的未提交说明' }).waitFor({ state: 'visible' });
    await linkedDocument.getByRole('link', { name: '继续阅读', exact: true }).click();
    await linkedDocument.filter({ hasText: '继续读取同一工作树' }).waitFor({ state: 'visible' });
    fs.writeFileSync(path.join(worktreeProject, 'docs/more.md'), '# 后续资料\n\n工作树相关文档在阅读期间更新。\n');
    assert.equal(await page.locator('.pane-reading-mask').count(), 0, '宽屏副屏没有遮罩');
    // Linked documents use the shared object pane; reopening reads the current worktree.
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await page.locator('#task-detail-intent').getByRole('link', { name: '任务参考资料', exact: true }).click();
    await linkedDocument.getByRole('link', { name: '继续阅读', exact: true }).click();
    await linkedDocument.filter({ hasText: '工作树相关文档在阅读期间更新' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '独立文件系统中的最新提案' }).waitFor({ state: 'visible' });
    await openTaskActionModal(page, 'task-edit-action');
    assert.match(await antdSelectDisplay(page, 'task-edit-parent'), /browser-parent/);
    await selectAntdOption(page, 'task-edit-parent', '不关联组合任务');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /独立文件系统中的最新提案/, '保存后保留阅读内容');
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-task').record.parentTaskId, null);
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click();
    assert.equal(await page.getByRole('button', {name:/^任务信息/}).count(), 0);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click(); await page.locator('[data-task-content=review]').click();
    assert.match(await page.locator('#task-review-result').innerText(), /计划可执行/);
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=review]').click();
    assert.match(await page.locator('#task-review-result').innerText(), /没有阻断问题/);
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    assert.match(await page.locator('#task-verification-result').innerText(), /浏览器验证已通过[\s\S]*Buildr Web 验证投影已通过[\s\S]*当前内容版本尚未核对/);
    assert.equal(await page.getByRole('button', { name: '交给智能体验证', exact: true }).count(), 0);

    // Append a review and return to implementation without inventing a workflow gate.
    const reviewBefore = runtime.inspectTaskReview(workspaceRoot, 'browser-task');
    runtime.recordTaskReview(workspaceRoot, 'browser-task', { reviewType:'planning', subjectIdentity:'plan:browser-v2', method:'self', reviewed:['design.md'], uncovered:[], findings:['需要补充版本冲突'], conclusion:{outcome:'changes-requested',summary:'方案变更需要修订。'}, expectedCurrentDigest:reviewBefore.slots.planning.resultDigest });
    runtime.recordTaskWorkContext(workspaceRoot, 'browser-task', { expectedContextDigest:'absent', stage:'implementation', progress:'发现保存冲突，正在修复。', nextStep:'复审后再次验证。' });
    await page.locator(await page.getByRole('button',{name:'关闭内容阅读',exact:true}).isVisible().catch(()=>false) ? '#task-reading-refresh' : '#task-detail-refresh').click();
    await closeTaskReading(page); await page.locator('[data-task-node=implementation][aria-current=step]').waitFor({ state:'visible' });
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click(); await page.locator('[data-task-content=review]').click();
    await page.getByRole('menuitem').filter({hasText:'第 1 次'}).waitFor({state:'visible'});
    assert.match(await page.locator('#task-review-result').innerText(), /方案变更需要修订/, '进入审查节点直接展示最新完整结果');
    await page.getByRole('menuitem').filter({hasText:'第 1 次'}).click();
    assert.match(await page.locator('#task-review-result').innerText(), /历史审查[\s\S]*计划可执行/);
    assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-current'), 'step');
    assert.equal(await page.locator('[data-task-node=design]').getAttribute('aria-pressed'), 'true');

    const oldReport = runtime.inspectTaskVerification(workspaceRoot, 'browser-task');
    runtime.recordTaskVerification(workspaceRoot, 'browser-task', { expectedReportDigest: oldReport.slot.reportDigest, contentIdentity: 'repair:v1', contentSummary: '保存冲突修复', checks: [{ id:'conflict', project:'demo', testing:'demo.browser', selection:'task-related', targets:['保存时输入保留'], source:'command', outcome:'failed', summary:'冲突后输入被清空。' }], gaps:[], conclusion:{outcome:'not-passed',summary:'保存冲突未通过，正在修复。'} });
    await page.locator(await page.getByRole('button',{name:'关闭内容阅读',exact:true}).isVisible().catch(()=>false) ? '#task-reading-refresh' : '#task-detail-refresh').click();
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-verification-result').filter({hasText:'保存冲突未通过，正在修复。'}).waitFor({state:'visible'});
    assert.match(await page.locator('#task-verification-result').innerText(), /未通过[\s\S]*冲突后输入被清空/);
    assert.equal(await page.locator('.task-verification-checks .task-check-outcome.failed').count(),1,'保留实际检查的失败状态及原因');
    assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-current'),'step');
    assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-pressed'),'true');
    const failedReport=runtime.inspectTaskVerification(workspaceRoot,'browser-task');
    runtime.recordTaskVerification(workspaceRoot,'browser-task',{expectedReportDigest:failedReport.slot.reportDigest,contentIdentity:'repair:v2',contentSummary:'输入保留修复',checks:[{id:'conflict',project:'demo',testing:'demo.browser',selection:'task-related',targets:['保存时输入保留'],source:'command',outcome:'passed',summary:'修复后输入保留。'}],gaps:[],conclusion:{outcome:'passed',summary:'本次修复验证通过。'}});
    await page.locator(await page.getByRole('button',{name:'关闭内容阅读',exact:true}).isVisible().catch(()=>false) ? '#task-reading-refresh' : '#task-detail-refresh').click();
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-verification-result').filter({hasText:'本次修复验证通过。'}).waitFor({state:'visible'});
    assert.doesNotMatch(await page.locator('#task-verification-result').innerText(), /冲突后输入被清空/,'当前验证结果替代上次失败结果');
    assert.equal(await page.locator('#task-node-content select').count(),0,'验证没有历史报告选择器');

    // Version conflict preserves the form, and re-reading never discards the draft.
    const listBeforeEdit = page.url();
    await openTaskActionModal(page, 'task-edit-action');
    await page.locator('#task-edit-title').fill('陈旧页面不得覆盖');
    await page.locator('#task-edit-brief').fill('# 页面保留的任务说明草稿\n');
    runtime.updateTask(workspaceRoot, 'browser-task', { expectedRecordDigest: runtime.inspectTask(workspaceRoot,'browser-task').recordDigest, intent:'另一客户端已经更新', brief:'# 外部更新的任务说明\n' });
    await page.getByRole('button', { name:'保存任务记录',exact:true }).click();
    await page.locator('#task-edit-reread').waitFor({ state:'visible' });
    assert.equal(await page.locator('#task-edit-title').inputValue(),'陈旧页面不得覆盖');
    await page.locator('#task-edit-reread').click();
    await page.locator('#task-edit-state').filter({hasText:'已重读'}).waitFor({state:'visible'});
    assert.equal(await page.locator('#task-edit-intent').inputValue(),'另一客户端已经更新','重读时采用未编辑字段的最新值，保留已编辑草稿');
    assert.equal(await page.locator('#task-edit-title').inputValue(),'陈旧页面不得覆盖');
    assert.equal(await page.locator('#task-edit-brief').inputValue(),'# 页面保留的任务说明草稿\n');
    await page.locator('#task-edit-intent').fill('页面基于最新记录更新');
    await page.getByRole('button', {name:'保存任务记录',exact:true}).click();
    await page.locator('#task-edit-form').waitFor({state:'hidden'});
    assert.match(await page.locator('#task-detail-intent').innerText(),/页面基于最新记录更新/);
    await page.locator('.pane-left #task-table-body [data-task-id="browser-task"] .task-row-main').filter({hasText:'陈旧页面不得覆盖'}).waitFor({state:'visible'});
    assert.equal(page.url(), listBeforeEdit, '详情写成功刷新列表内容但不改变筛选 URL');
    for (let i=browserErrors.length-1;i>=0;i--) if (/tasks\/browser-task.*409/.test(browserErrors[i])) browserErrors.splice(i,1);

    for (const id of ['browser-stale','browser-delivered']) {
      await page.goto(`${workspaceUrl}/tasks/${id}`);
      assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true', '终态任务打开时也先展示需求');
      await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
      assert.match(await page.locator('#task-verification-result').innerText(),/当前内容版本尚未核对/);
      assert.doesNotMatch(await page.locator('#task-verification-result').innerText(),/已随交付目标/);
    }
    runtime.recordTaskWorkContext(workspaceRoot, 'browser-abandon', { expectedContextDigest: 'absent', stage: 'acceptance', progress: '检查已完成，等待确认。', nextStep: '读取用户意见后决定收尾。', attention: { kind: 'acceptance', reason: '请确认当前交付内容符合本次目标。' } });
    await page.goto(`${workspaceUrl}/tasks/browser-abandon`);
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click();
    assert.match(await page.locator('#task-attention').innerText(), /请确认当前交付内容符合本次目标/,'当前确认事项在任务回应区域展示');
    assert.doesNotMatch(await page.locator('#task-node-content').innerText(), /用户确认/,'收尾不提供常驻用户确认目录');
    await page.locator('#task-attention-respond').click();
    await page.locator('#task-attention-response-input').fill('仍需调整交付范围。');
    await page.locator('#task-context-save').click();
    await page.locator('#task-attention-response').filter({hasText:'仍需调整交付范围'}).waitFor({state:'visible'});
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-abandon').record.status, 'active', '记录用户意见不自动完成任务');
    await openTaskActionModal(page,'task-abandon-action');
    await page.locator('#task-abandon-reason').fill('浏览器验收取消');
    await page.locator('#task-abandon-form').getByRole('button',{name:'确认放弃',exact:true}).click();
    await page.locator('.ant-modal-confirm').waitFor({state:'visible'}); await confirmAntModal(page);
    await page.locator('#task-detail-status').filter({hasText:'已放弃'}).waitFor({state:'visible'});
    for (const width of [1024,390]) {
      await page.setViewportSize({width,height:844});
      await page.goto(`${workspaceUrl}/tasks/browser-task`);
      await closeTaskReading(page); await page.locator('[data-task-node=requirements][aria-pressed=true]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-current'),'step','当前推进节点不替代默认需求阅读');
      await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
      await page.locator('#task-verification-result').waitFor({state:'visible'});
      assert.equal(await page.locator('.pane-stage:visible').count(),1);
      assert.equal(await page.locator('.pane-right:visible').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await capture(page,`local-app-task-detail-${width}.png`);
      if(width===390) { await openTaskActionModal(page, 'task-edit-action'); await page.locator('#task-edit-title').fill('取消不写入'); await page.locator('#task-edit-title').press('Escape'); assert.notEqual(runtime.inspectTask(workspaceRoot,'browser-task').record.title,'取消不写入'); await page.getByRole('button',{name:'关闭 普通任务',exact:true}).click(); await page.locator('#task-table-body').waitFor({state:'visible'}); assert.equal(await page.locator('#task-detail-main:visible').count(),0); }
    }
    await page.setViewportSize({width:1280,height:720});
  });


}
