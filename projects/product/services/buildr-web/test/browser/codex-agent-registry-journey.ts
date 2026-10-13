import assert from 'node:assert/strict';

/** Only transport fixtures are mocked; the hosted drawer and global registry are real. */
export async function runCodexAgentRegistryJourney({t, page, workspaceUrl, taskId, capture, expectedBrowserErrors = new Set()}: any) {
  const pattern = '**/api/v1/app/agents**';
  const empty = {revision: 'registry-before', defaultAgentId: null, agents: []};
  const agent = {id: 'codex-ui-fixture', label: 'Codex 浏览器夹具', kind: 'codex', capabilities: ['structured-generation'], availability: 'available', runtimeStatus: 'stopped', safeReason: null, lastExecutionConfig: null};
  const dsh = {...agent, id: 'dsh-ui-fixture', label: 'DSH 浏览器夹具', kind: 'dsh'};
  const candidate = {id: 'candidate-ui-fixture', label: agent.label, version: 'fixture', installationLabel: '隔离桌面夹具', configurationLabel: '隔离配置夹具', source: 'desktop-bundled', registeredAgentId: null, desktopAvailable: true, generationAvailability: 'available', safeReason: null};
  const connection = {id: 'desktop-ui-fixture', agentId: agent.id, label: agent.label, installationLabel: candidate.installationLabel, configurationLabel: candidate.configurationLabel, status: 'configured', safeReason: null};
  const parent = () => page.getByRole('dialog', {name: '智能体', exact: true});
  const child = () => page.getByRole('dialog', {name: '接入 Codex', exact: true});
  const details = (label: string) => page.getByRole('dialog', {name: label + ' 接入详情', exact: true});
  const floating = (label: string) => page.locator('.agent-registry-details-popover').filter({has: details(label)});
  const closeDetails = async (label: string) => {await details(label).getByRole('button', {name: '关闭接入详情', exact: true}).click(); await details(label).waitFor({state: 'hidden'});};
  const row = (id: string) => page.locator(`.agent-registry-drawer [data-agent-id="${id}"]`);
  const removeEntry = () => row(agent.id).getByRole('button', {name: '移除 ' + agent.label + ' 接入', exact: true});
  const choose = async () => {await page.locator('#add-agent-entry').click(); await page.getByRole('menuitem', {name: 'Codex', exact: true}).click(); await child().waitFor({state: 'visible'});};
  const open = async () => {await page.goto(`${workspaceUrl}/tasks/${taskId}`); await page.locator('#global-agents-entry').click(); await parent().waitFor({state: 'visible'});};
  await t.test('Codex 接入界面：已接入选项禁用，悬停与键盘可达，DSH默认保留且浮窗对齐条目并支持完整键盘操作', async () => {
    let discoveries = 0, writes = 0;
    const registry = {revision: 'registry-both', defaultAgentId: dsh.id, agents: [agent, dsh]};
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents' && route.request().method() === 'GET') return route.fulfill({json: registry});
      if (url.pathname.endsWith('/codex/discovery')) {discoveries++; assert.fail('已有Codex的接入菜单不得发起新的发现');}
      if (route.request().method() === 'POST') {writes++; assert.fail('只读详情与禁用接入不得修改登记或默认项');}
      return route.continue();
    };
    const connections = (route: any) => route.fulfill({json: {connections: [connection]}});
    await page.route(pattern, handler); await page.route('**/api/v1/app/codex/connections', connections);
    try {
      await open();
      assert.equal(await parent().locator('.agent-registry-list > article').count(), 2);
      assert.equal(await row(dsh.id).getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'true');
      assert.equal(await row(dsh.id).getByRole('button', {name: /^移除 /u}).count(), 1, 'DSH既有条目提供同一移除入口');
      assert.equal(await removeEntry().count(), 1, 'Codex移除操作直接属于其列表条目');
      assert.equal(await page.locator('.agent-registry-details').count(), 0, '一级列表不自动展开详情');
      await page.locator('#add-agent-entry').hover();
      const connected = page.getByRole('menuitem', {name: 'Codex · 已接入', exact: true});
      await connected.waitFor({state: 'visible'}); assert.equal(await connected.getAttribute('aria-disabled'), 'true');
      await connected.evaluate(async (element: HTMLElement) => {await Promise.all((element.closest('.ant-dropdown')?.getAnimations({subtree: true}) || []).map(animation => animation.finished.catch(() => {})));});
      const menuBox = await connected.boundingBox(), menuViewport = page.viewportSize(); assert.ok(menuBox && menuViewport && menuBox.x >= -1 && menuBox.x + menuBox.width <= menuViewport.width + 1, '悬停菜单应位于视口内');
      await capture(page, 'codex-already-connected-hover-menu.png');
      assert.equal(await child().count(), 0); assert.equal(discoveries, 0);
      await parent().getByText('智能体', {exact: true}).hover(); await connected.waitFor({state: 'hidden'});
      await page.locator('#add-agent-entry').focus(); await page.keyboard.press('Enter'); await connected.waitFor({state: 'visible'});
      const dshChoice = page.getByRole('menuitem', {name: 'DSH · 已接入', exact: true});
      assert.equal(await dshChoice.getAttribute('aria-disabled'), 'true');
      await parent().getByText('智能体', {exact: true}).click(); await dshChoice.waitFor({state: 'hidden'});
      const viewport = page.viewportSize();
      for (const width of [1280, 390]) {
        await page.setViewportSize({width, height: 900});
        await page.waitForFunction((expected: number) => {
          const box = document.querySelector('.agent-registry-drawer [role="dialog"]')?.getBoundingClientRect();
          return box && box.width > 0 && box.width <= expected + 1 && (expected < 600 || box.width >= 600);
        }, width);
        const box = await parent().boundingBox();
        if (!box || box.width > width + 1 || width >= 600 && box.width < 600) await capture(page, `codex-registry-width-failure-${width}.png`);
        assert.ok(box && box.width <= width + 1 && (width < 600 || box.width >= 600), '一级抽屉提供足够列表宽度且不超出视口: ' + JSON.stringify({width, box}));
        await row(dsh.id).getByRole('button', {name: dsh.label + ' 详情', exact: true}).click(); await details(dsh.label).waitFor({state: 'visible'});
        assert.equal(await page.locator('.agent-registry-drawer .agent-registry-details').count(), 0, '详情以浮窗呈现，不占用一级列表');
        const detailButton = row(agent.id).getByRole('button', {name: agent.label + ' 详情', exact: true});
        await detailButton.focus(); await detailButton.press('Enter'); await details(agent.label).waitFor({state: 'visible'}); await details(dsh.label).waitFor({state: 'hidden'});
        await page.waitForFunction((id: string) => document.getElementById(`agent-connection-details-${id}`)?.contains(document.activeElement), agent.id);
        await floating(agent.label).evaluate(async (element: HTMLElement) => {await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => {})));});
        const popup = await floating(agent.label).boundingBox(), actions = await row(agent.id).locator('.agent-registry-actions').boundingBox(), item = await row(agent.id).boundingBox();
        if (!popup || popup.x < -1 || popup.x + popup.width > width + 1) await capture(page, `codex-registry-details-failure-${width}.png`);
        assert.ok(popup && actions && item && popup.x >= -1 && popup.x + popup.width <= width + 1 && popup.y >= -1 && popup.y + popup.height <= 901, '详情浮窗完整保留在宽窄视口内: ' + JSON.stringify({width, popup, actions, item}));
        if (width >= 600) assert.ok(popup.width >= 420 && popup.width <= 460, '宽屏浮窗保持紧凑阅读宽度');
        const targetRight = item.x + item.width; if (targetRight - popup.width >= 0 && targetRight <= width) assert.ok(Math.abs(popup.x + popup.width - targetRight) <= 2, '浮窗右边框对齐触发行外边框；仅视口裁切时允许避让: ' + JSON.stringify({width, popup, item}));
        const below = popup.y - item.y - item.height, above = item.y - popup.y - popup.height; assert.ok(below >= 4 && below <= 16 || above >= 4 && above <= 16, '浮窗与触发行边缘保持约8px间距且不覆盖条目，可按空间翻转: ' + JSON.stringify({below, above, popup, item}));
        await details(agent.label).getByText('已配置', {exact: true}).waitFor({state: 'visible'}); assert.equal(await details(agent.label).getByText(candidate.installationLabel, {exact: true}).count(), 0, '低频路径不在默认详情展开'); await capture(page, `codex-registry-aligned-floating-${width}.png`);
        await page.keyboard.press('Tab'); assert.equal(await details(agent.label).getByRole('button', {name: '关闭接入详情', exact: true}).evaluate((element: HTMLElement) => document.activeElement === element), true, '键盘进入浮窗后可到达关闭按钮');
        await page.keyboard.press('Tab'); assert.equal(await details(agent.label).getByRole('button', {name: /刷新接入状态$/u}).evaluate((element: HTMLElement) => document.activeElement === element), true, '刷新按钮处于浮窗正常Tab顺序');
        const keyboardRead = page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/v1/app/codex/connections'); await page.keyboard.press('Enter'); await keyboardRead; await details(agent.label).getByText('已配置', {exact: true}).waitFor({state: 'visible'});
        await page.waitForFunction((id: string) => [...(document.getElementById(`agent-connection-details-${id}`)?.querySelectorAll('button') || [])].some(button => button.textContent?.trim() === '重新检查接入' && !button.disabled), agent.id);
        await page.keyboard.press('Tab'); assert.equal(await details(agent.label).getByRole('button', {name: '重新检查接入', exact: true}).evaluate((element: HTMLElement) => document.activeElement === element), true, '维护按钮也可通过键盘到达');
        await page.keyboard.press('Escape'); await details(agent.label).waitFor({state: 'hidden'}); await parent().waitFor({state: 'visible'});
        await page.waitForFunction((name: string) => document.activeElement?.getAttribute('aria-label') === name, agent.label + ' 详情'); assert.equal(await detailButton.evaluate((element: HTMLElement) => document.activeElement === element), true, '关闭详情后焦点回到原条目，一级抽屉保留');
        await detailButton.click(); await details(agent.label).waitFor({state: 'visible'}); await detailButton.click(); await details(agent.label).waitFor({state: 'hidden'});
        await detailButton.click(); await details(agent.label).waitFor({state: 'visible'});
        const outsideRead = page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/v1/app/codex/connections'); await page.locator('#refresh-agent-registry').click(); await outsideRead; await details(agent.label).waitFor({state: 'hidden'}); assert.equal(await page.locator('#refresh-agent-registry').evaluate((element: HTMLElement) => document.activeElement === element), true, '点击浮窗外按钮后关闭详情并保留用户新焦点');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      if (viewport) await page.setViewportSize(viewport);
      assert.equal(discoveries, 0); assert.equal(writes, 0);
      assert.equal(await row(dsh.id).getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute(pattern, handler); await page.unroute('**/api/v1/app/codex/connections', connections);}
  });
  await t.test('Codex 接入界面：不轮询插件存活，聚焦读取保持详情节点、位置与DSH默认', async () => {
    let reads = 0, registryReads = 0, writes = 0;
    const registry = {revision: 'registry-observe', defaultAgentId: dsh.id, agents: [agent, dsh]};
    const handler = async (route: any) => {
      if (route.request().method() !== 'GET') {writes++; assert.fail('只读状态观察不得修改接入或默认项');}
      registryReads++; return route.fulfill({json: registry});
    };
    const connections = (route: any) => {reads++; return route.fulfill({json: {connections: [connection]}});};
    await page.route(pattern, handler); await page.route('**/api/v1/app/codex/connections', connections);
    try {
      await open(); await row(agent.id).getByText('原生会话关联：已配置', {exact: true}).waitFor({state: 'visible'});
      await row(agent.id).getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).waitFor({state: 'visible'});
      await details(agent.label).getByRole('button', {name: /配置与运行信息$/u}).click();
      await details(agent.label).getByRole('button', {name: /刷新接入状态$/u}).focus();
      await floating(agent.label).evaluate(async (element: HTMLElement) => {await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => {})));});
      const original = await details(agent.label).elementHandle(), box = await floating(agent.label).boundingBox(), readsBefore = reads;
      const automatic = await page.waitForRequest((request: any) => new URL(request.url()).pathname === '/api/v1/app/codex/connections', {timeout: 4500}).then(() => true, (failure: Error) => {if (failure.name === 'TimeoutError') return false; throw failure;});
      assert.equal(automatic, false, '打开详情跨过原4秒周期也不轮询插件存活'); assert.equal(reads, readsBefore);
      assert.ok(registryReads >= 2, '既有智能体生成状态读取继续工作，不改DSH行为');
      const observed = page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/v1/app/codex/connections');
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await observed;
      assert.equal(await original!.evaluate((element: HTMLElement) => element.isConnected), true);
      assert.deepEqual(await floating(agent.label).boundingBox(), box, '聚焦读取不移动浮窗');
      assert.equal(await details(agent.label).getByRole('button', {name: /刷新接入状态$/u}).evaluate((element: HTMLElement) => document.activeElement === element), true);
      assert.equal(await details(agent.label).locator('.ant-collapse-header').getAttribute('aria-expanded'), 'true');
      assert.equal(await details(agent.label).getByText(/等待.*加载|组件版本|重启|桌面已连接/u).count(), 0, '不再显示插件握手或桌面在线语义');
      assert.equal(await row(dsh.id).getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'true'); assert.equal(writes, 0);
      await capture(page, 'codex-no-plugin-detail-observation.png');
      await closeDetails(agent.label); await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute(pattern, handler); await page.unroute('**/api/v1/app/codex/connections', connections);}
  });
  await t.test('Codex 接入界面：生成配置与关联配置独立，列表及详情共享只读查询且失效目标自动关闭', async () => {
    expectedBrowserErrors.add(new URL('/api/v1/app/codex/connections', workspaceUrl).href);
    let mode = 'loading', reads = 0, writes = 0, present = true, currentAgent: any = agent, release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {release = resolve;});
    const registry = () => ({revision: 'registry-state-' + String(present) + '-' + String(Boolean(currentAgent.safeReason)), defaultAgentId: dsh.id, agents: present ? [currentAgent, dsh] : [dsh]});
    const handler = async (route: any) => {
      if (route.request().method() !== 'GET') {writes++; assert.fail('读取状态、展开详情和失效恢复不得写入接入或默认项');}
      if (new URL(route.request().url()).pathname === '/api/v1/app/agents') return route.fulfill({json: registry()});
      assert.fail('只读状态与详情不应重新探测安装或准备连接');
    };
    const connections = async (route: any) => {
      reads++;
      if (mode === 'loading') await gate;
      if (mode === 'error') return route.fulfill({status: 503, json: {error: {code: 'fixture_desktop_state_failed', message: '隔离桌面状态读取失败。'}}});
      return route.fulfill({json: {connections: mode === 'none' ? [] : [{...connection, status: mode, safeReason: mode === 'unavailable' ? '隔离桌面连接当前不可用。' : null}]}});
    };
    const state = async (text: string) => {
      await row(agent.id).getByText('原生会话关联：' + text, {exact: true}).waitFor({state: 'visible'});
      assert.equal((await row(agent.id).locator('[data-agent-desktop-status]').innerText()).trim(), '原生会话关联：' + text);
      await details(agent.label).getByText(text, {exact: true}).waitFor({state: 'visible'});
    };
    const observeRegistry = async () => {
      const observed = Promise.all(['/api/v1/app/agents', '/api/v1/app/codex/connections'].map(path => page.waitForResponse((response: any) => new URL(response.url()).pathname === path)));
      await page.evaluate(() => {window.dispatchEvent(new Event('focus'));}); await observed;
    };
    await page.route(pattern, handler); await page.route('**/api/v1/app/codex/connections', connections);
    try {
      await open(); await row(agent.id).getByText('原生会话关联：正在读取…', {exact: true}).waitFor({state: 'visible'}); await row(agent.id).getByText('生成：按需启动', {exact: true}).waitFor({state: 'visible'});
      const readsBeforeDetails = reads; await row(agent.id).getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).waitFor({state: 'visible'}); await state('正在读取…'); assert.equal(reads, readsBeforeDetails, '打开详情共享现有读取，不建立第二套查询');
      mode = 'configured'; release!(); await state('已配置');
      for (const [next, label] of [['error', '未能确认'], ['unavailable', '需检查'], ['disconnected', '已移除'], ['none', '未配置']]) {
        mode = next; const previousReads = reads, response = page.waitForResponse((item: any) => new URL(item.url()).pathname === '/api/v1/app/codex/connections');
        await details(agent.label).getByRole('button', {name: /刷新接入状态$/u}).click(); await response; await state(label); assert.ok(reads > previousReads);
        if (next === 'error') {assert.equal(await row(agent.id).getByText('原生会话关联：已配置', {exact: true}).count(), 0, '读取失败不能继续宣称旧ready有效'); assert.equal(await row(agent.id).getByText('原生会话关联：未配置', {exact: true}).count(), 0, '读取失败不能冒充成功的无记录结果');}
        await row(agent.id).getByText('生成：按需启动', {exact: true}).waitFor({state: 'visible'});
      }
      await capture(page, 'codex-desktop-status-unconfigured.png');
      currentAgent = {...agent, lastExecutionConfig: {model: 'observed-fixture-model', modelProvider: 'observed-fixture-provider', reasoningEffort: 'high'}, safeReason: '上次生成退出未确认，请检查独立服务。'};
      await observeRegistry(); await row(agent.id).getByText('生成需检查', {exact: true}).waitFor({state: 'visible'}); assert.equal(await row(agent.id).getByText('生成：按需启动', {exact: true}).count(), 0, '已读取模型配置不能掩盖退出未确认');
      currentAgent = {...currentAgent, safeReason: null}; await observeRegistry(); await row(agent.id).getByText('生成：按需启动', {exact: true}).waitFor({state: 'visible'});
      currentAgent = agent; await observeRegistry(); await row(agent.id).getByText('生成：按需启动', {exact: true}).waitFor({state: 'visible'}); await state('未配置');
      await closeDetails(agent.label); await page.getByRole('button', {name: '关闭智能体', exact: true}).click(); await parent().waitFor({state: 'hidden'});
      const closedReads = reads;
      const requestedWhileClosed = await page.waitForRequest((request: any) => new URL(request.url()).pathname === '/api/v1/app/codex/connections', {timeout: 4500}).then(() => true, (failure: Error) => {if (failure.name === 'TimeoutError') return false; throw failure;});
      assert.equal(requestedWhileClosed, false, '关闭抽屉后跨过正常轮询间隔也不再查询桌面状态'); assert.equal(reads, closedReads);
      const reopened = page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/v1/app/codex/connections');
      await page.locator('#global-agents-entry').click(); await parent().waitFor({state: 'visible'}); await reopened; await row(agent.id).getByText('原生会话关联：未配置', {exact: true}).waitFor({state: 'visible'}); assert.ok(reads > closedReads, '同页重开抽屉重新读取状态');
      await row(agent.id).getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).waitFor({state: 'visible'});
      present = false; await page.evaluate(() => {window.dispatchEvent(new Event('focus'));}); await details(agent.label).waitFor({state: 'hidden'}); await row(agent.id).waitFor({state: 'hidden'});
      assert.equal(await page.locator('.agent-registry-details').count(), 0, '详情目标失效时销毁浮窗内容'); assert.equal(await row(dsh.id).getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'true'); assert.equal(writes, 0);
      await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {release!(); await page.unroute(pattern, handler); await page.unroute('**/api/v1/app/codex/connections', connections);}
  });
  await t.test('Codex 接入界面：显式选择、二级加载空状态和错误恢复，取消保留父列表', async () => {
    expectedBrowserErrors.add(new URL('/api/v1/app/agents/codex/discovery', workspaceUrl).href);
    let discoveries = 0, mode = 'empty', release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {release = resolve;});
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: empty});
      if (url.pathname.endsWith('/dsh/discovery')) return route.fulfill({json: {revision: 'dsh-discovery-empty', candidates: []}});
      if (url.pathname.endsWith('/codex/discovery')) {
        discoveries++;
        if (discoveries === 1) await gate;
        if (mode === 'error') return route.fulfill({status: 503, json: {error: {code: 'fixture_discovery_failed', message: '检测失败，请重新检测。'}}});
        return route.fulfill({json: {revision: 'discovery-fixture', candidates: mode === 'empty' ? [] : [candidate, {...candidate, id: 'candidate-other', label: 'Codex 命令行夹具', source: 'path', desktopAvailable: false, generationAvailability: 'unavailable', safeReason: '该候选暂不能用于一次性生成。'}]}});
      }
      if (url.pathname.endsWith('/codex/connect')) assert.fail('取消、空状态和发现失败均不得发送确认');
      return route.continue();
    };
    await page.route(pattern, handler);
    try {
      await open();
      assert.equal(await page.locator('#codex-local-setup').count(), 0); assert.equal(await page.locator('#dsh-local-setup').count(), 0); assert.equal(discoveries, 0, '一级空列表不自动展开接入表单');
      await page.locator('#add-agent-entry').click(); await page.getByRole('menuitem', {name: 'DSH', exact: true}).click();
      await page.locator('#dsh-local-setup').getByText('未发现 DSH', {exact: true}).waitFor({state: 'visible'}); assert.equal(discoveries, 0, 'DSH接入抽屉不探测Codex');
      await page.locator('#cancel-local-dsh').click(); await parent().waitFor({state: 'visible'});
      await choose(); await child().getByText('正在检测本机 Codex…', {exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isDisabled(), true);
      release!(); await child().getByText('未发现 Codex', {exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isDisabled(), true);
      const viewport = page.viewportSize();
      for (const width of [1280, 390]) {await page.setViewportSize({width, height: 900}); await capture(page, `codex-no-install-${width}.png`); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));}
      if (viewport) await page.setViewportSize(viewport);
      mode = 'error'; await page.locator('#discover-local-codex').click(); await child().getByText('检测失败，请重新检测。', {exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isDisabled(), true);
      mode = 'candidates'; await page.locator('#discover-local-codex').click(); await page.locator('[data-codex-candidate="candidate-other"]').waitFor({state: 'visible'});
      await child().getByRole('radio', {name: 'Codex 命令行夹具', exact: true}).check(); assert.equal(await page.locator('#confirm-local-codex').isDisabled(), true);
      await child().getByRole('radio', {name: agent.label, exact: true}).check(); assert.equal(await page.locator('#confirm-local-codex').isEnabled(), true);
      await page.locator('#cancel-local-codex').click(); await child().waitFor({state: 'hidden'}); await parent().getByText('尚未接入智能体', {exact: true}).waitFor({state: 'visible'});
      await choose(); await page.locator('[data-codex-candidate="candidate-ui-fixture"]').waitFor({state: 'visible'}); await page.getByRole('button', {name: '关闭 Codex 接入', exact: true}).click(); await child().waitFor({state: 'hidden'}); await parent().waitFor({state: 'visible'});
      await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {release!(); await page.unroute(pattern, handler);}
  });
  await t.test('Codex 接入界面：候选确认后关闭子抽屉，父列表保留实际关联配置及无重载采用', async () => {
    let connected = false, confirmations = 0, release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {release = resolve;});
    const partialReason = 'Codex 安装与配置身份需检查；独立生成配置已保存。', partialConnection = {...connection, status: 'unavailable', safeReason: partialReason};
    const registry = () => connected ? {revision: 'registry-connected', defaultAgentId: agent.id, agents: [agent, dsh]} : {...empty, defaultAgentId: dsh.id, agents: [dsh]};
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: registry()});
      if (url.pathname.endsWith('/codex/discovery')) return route.fulfill({json: {revision: 'discovery-fixture', candidates: [candidate]}});
      if (url.pathname.endsWith('/codex/connect')) {
        confirmations++; assert.deepEqual(route.request().postDataJSON(), {candidateId: candidate.id, expectedDiscoveryRevision: 'discovery-fixture', expectedRevision: empty.revision, makeDefault: true}); await gate; connected = true;
        return route.fulfill({json: {registry: registry(), agentId: agent.id, desktop: partialConnection, desktopError: {code: 'fixture_partial', message: partialReason}}});
      }
      return route.continue();
    };
    const connections = (route: any) => route.fulfill({json: {connections: [partialConnection]}});
    await page.route(pattern, handler); await page.route('**/api/v1/app/codex/connections', connections);
    try {
      await open(); await page.evaluate(() => {(window as any).__codexDocumentProof = 'same-document';}); await choose(); await page.locator('[data-codex-candidate="candidate-ui-fixture"]').waitFor({state: 'visible'});
      await child().getByRole('checkbox', {name: '设为之后生成的默认智能体（Agent）', exact: true}).check();
      const viewport = page.viewportSize();
      for (const width of [1280, 390]) {await page.setViewportSize({width, height: 900}); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await capture(page, `codex-local-discovery-${width}.png`);}
      if (viewport) await page.setViewportSize(viewport);
      await page.locator('#confirm-local-codex').click();
      assert.equal(await page.locator('#cancel-local-codex').isDisabled(), true); assert.equal(await page.getByRole('button', {name: '关闭 Codex 接入', exact: true}).isDisabled(), true); assert.equal(await page.getByRole('button', {name: '关闭智能体', exact: true}).isDisabled(), true); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).isDisabled(), true);
      await page.keyboard.press('Escape'); await child().waitFor({state: 'visible'}); release!(); await child().waitFor({state: 'hidden'});
      await parent().getByRole('button', {name: '设为默认智能体 ' + agent.label, exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator('.agent-registry-details').count(), 0, '接入成功只返回简洁列表，不自动展开详情');
      const result = parent().locator('.agent-registry-result'); await result.getByText('提交说明等一次性生成已配置；原生会话关联需检查。', {exact: true}).waitFor({state: 'visible'}); assert.equal(await result.count(), 1); assert.match(await result.getAttribute('class') || '', /ant-alert-warning/u); assert.equal(await parent().locator('.agent-registry-feedback').count(), 0, '部分接入结果不再用统一绿色成功文本表示');
      const resultBox = await result.boundingBox(), listBox = await parent().locator('.agent-registry-list').boundingBox(); assert.ok(resultBox && listBox && resultBox.y >= listBox.y + listBox.height - 1, '操作结果位于条目列表下方');
      await result.getByRole('button', {name: '查看详情', exact: true}).click(); await details(agent.label).getByText('需检查', {exact: true}).waitFor({state: 'visible'}); await details(agent.label).getByRole('button', {name: /配置与运行信息$/u}).click(); await details(agent.label).getByText(partialReason, {exact: true}).waitFor({state: 'visible'});
      assert.equal(confirmations, 1); assert.equal(await page.evaluate(() => (window as any).__codexDocumentProof), 'same-document'); assert.equal(new URL(page.url()).hash, `#/tasks/${taskId}`);
      await capture(page, 'codex-connected-parent.png'); await closeDetails(agent.label); await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
      await page.evaluate(() => {location.hash = '#/overview';}); await page.locator('#global-agents-entry').waitFor({state: 'visible'}); assert.equal(new URL(page.url()).pathname, new URL(workspaceUrl).pathname + '/codex');
    } finally {release!(); await page.unroute(pattern, handler); await page.unroute('**/api/v1/app/codex/connections', connections);}
  });
  await t.test('Codex 接入界面：二级打开后发现外部接入禁止确认，取消不修改DSH默认或重复接入', async () => {
    let externallyConnected = false, confirmations = 0;
    const registry = () => ({revision: externallyConnected ? 'registry-external' : 'registry-before', defaultAgentId: dsh.id, agents: externallyConnected ? [agent, dsh] : [dsh]});
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: registry()});
      if (url.pathname.endsWith('/codex/discovery')) return route.fulfill({json: {revision: 'discovery-fixture', candidates: [candidate]}});
      if (url.pathname.endsWith('/codex/connect')) {confirmations++; assert.fail('二级抽屉观察到外部Codex登记后不得继续发送新接入');}
      return route.continue();
    };
    await page.route(pattern, handler);
    try {
      await open(); await choose(); await page.locator('[data-codex-candidate="candidate-ui-fixture"]').waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isEnabled(), true);
      externallyConnected = true;
      await page.evaluate(() => {window.dispatchEvent(new Event('focus'));});
      await child().getByText(/Codex 已接入/).waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isDisabled(), true);
      await page.locator('#cancel-local-codex').click(); await child().waitFor({state: 'hidden'});
      assert.equal(await parent().locator('.agent-registry-list > article').count(), 2); assert.equal(await row(dsh.id).getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'true');
      await page.locator('#add-agent-entry').hover(); const connected = page.getByRole('menuitem', {name: 'Codex · 已接入', exact: true}); await connected.waitFor({state: 'visible'}); assert.equal(await connected.getAttribute('aria-disabled'), 'true');
      assert.equal(confirmations, 0); await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute(pattern, handler);}
  });
  await t.test('Codex 接入界面：已接入项显式检查原连接，取消零写入，准备成功保留DSH默认与页面', async () => {
    let confirmations = 0, connectionReads = 0, desktopAvailable = false, maintained = false, holdNextRead = false, releaseOldRead: (() => void) | null = null, finishOldRead: (() => void) | null = null;
    const oldRead = new Promise<void>(resolve => {releaseOldRead = resolve;}), oldReadFinished = new Promise<void>(resolve => {finishOldRead = resolve;});
    const readyConnection = {...connection, status: 'configured', safeReason: null}, previousConnection = {...connection, status: 'unavailable', safeReason: '关联配置需重新检查。'};
    const registry = {revision: 'registry-maintenance', defaultAgentId: dsh.id, agents: [agent, dsh]};
    const registered = {...candidate, registeredAgentId: agent.id};
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: registry});
      if (url.pathname.endsWith('/codex/discovery')) return route.fulfill({json: {revision: 'discovery-maintenance', candidates: [{...registered, desktopAvailable}, {...candidate, id: 'candidate-new'}, {...candidate, id: 'candidate-registered-other', registeredAgentId: 'different-codex'}]}});
      if (url.pathname.endsWith('/codex/connect')) {
        confirmations++; assert.deepEqual(route.request().postDataJSON(), {candidateId: candidate.id, expectedDiscoveryRevision: 'discovery-maintenance', expectedRevision: registry.revision, existingAgentId: agent.id, makeDefault: false});
        maintained = true; return route.fulfill({json: {registry, agentId: agent.id, desktop: readyConnection, desktopError: null}});
      }
      return route.continue();
    };
    const connections = async (route: any) => {
      connectionReads++;
      if (holdNextRead) {
        holdNextRead = false; await oldRead;
        try {await route.fulfill({json: {connections: [previousConnection]}});}
        catch (failure) {if (!route.request().failure()?.errorText?.includes('ERR_ABORTED')) throw failure;}
        finally {finishOldRead!();}
        return;
      }
      return route.fulfill({json: {connections: [maintained ? readyConnection : previousConnection]}});
    };
    await page.route(pattern, handler); await page.route('**/api/v1/app/codex/connections', connections);
    const repair = () => page.getByRole('dialog', {name: '检查 Codex 接入', exact: true});
    const inspect = async () => {if (!await details(agent.label).isVisible()) await row(agent.id).getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).getByRole('button', {name: '重新检查接入', exact: true}).click(); await repair().waitFor({state: 'visible'}); await page.locator('[data-codex-candidate="candidate-ui-fixture"]').waitFor({state: 'visible'});};
    try {
      await open(); const originalUrl = page.url(); await page.evaluate(() => {(window as any).__codexMaintenanceProof = 'original-document';});
      await row(agent.id).getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).getByText('需检查', {exact: true}).waitFor({state: 'visible'});
      const readsBefore = connectionReads, readResponse = page.waitForResponse((response: any) => new URL(response.url()).pathname === '/api/v1/app/codex/connections');
      await details(agent.label).getByRole('button', {name: /刷新接入状态$/u}).click(); await readResponse; assert.ok(connectionReads > readsBefore); assert.equal(confirmations, 0, '只读刷新不得重复准备桌面组件');
      await inspect(); assert.equal(await repair().locator('[data-codex-candidate]').count(), 1, '维护只能选择原登记匹配的安装，不接入新Codex'); assert.equal(await repair().getByRole('checkbox').count(), 0, '维护不提供改默认项或采用入口');
      await repair().getByText('未发现原 Codex 桌面安装，无法确认当前关联范围。独立生成配置与已有会话关联仍保留。', {exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isDisabled(), true); assert.equal(confirmations, 0, '关联范围不完整时禁用维护且不发送POST，保留现有生成配置');
      await capture(page, 'codex-maintenance-cli-only.png');
      desktopAvailable = true; await page.locator('#discover-local-codex').click(); await page.locator('[data-codex-candidate="candidate-ui-fixture"]').waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-codex').isEnabled(), true);
      await page.locator('#cancel-local-codex').click(); await repair().waitFor({state: 'hidden'}); assert.equal(confirmations, 0);
      await inspect(); holdNextRead = true; const pendingRead = page.waitForRequest((request: any) => new URL(request.url()).pathname === '/api/v1/app/codex/connections'); await page.evaluate(() => {window.dispatchEvent(new Event('focus'));}); await pendingRead;
      await repair().getByRole('button', {name: '确认检查', exact: true}).click(); await repair().waitFor({state: 'hidden'}); await row(agent.id).getByText('原生会话关联：已配置', {exact: true}).waitFor({state: 'visible'});
      releaseOldRead!(); await oldReadFinished; await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))); assert.equal((await row(agent.id).locator('[data-agent-desktop-status]').innerText()).trim(), '原生会话关联：已配置', '维护完成后的新状态不能被迟到的旧查询降级');
      assert.equal(confirmations, 1); assert.equal(await parent().locator('.agent-registry-list > article').count(), 2); assert.equal(await row(dsh.id).getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'true'); assert.equal(await row(agent.id).getByRole('button', {name: '设为默认智能体 ' + agent.label, exact: true}).getAttribute('aria-pressed'), 'false');
      assert.equal(page.url(), originalUrl); assert.equal(await page.evaluate(() => (window as any).__codexMaintenanceProof), 'original-document'); assert.equal(await page.locator('.agent-registry-details').count(), 0, '维护完成回到列表，无残留详情');
      const result = parent().locator('.agent-registry-result'); await result.getByText('原生会话关联已配置；现有接入与默认选择已保留。', {exact: true}).waitFor({state: 'visible'}); assert.match(await result.getAttribute('class') || '', /ant-alert-info/u); assert.equal(await result.count(), 1); await capture(page, 'codex-maintained-dsh-default.png'); await result.getByRole('button', {name: '关闭操作提示', exact: true}).click(); await result.waitFor({state: 'hidden'}); assert.equal(confirmations, 1);
      await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {releaseOldRead!(); await page.unroute(pattern, handler); await page.unroute('**/api/v1/app/codex/connections', connections);}
  });
  await t.test('Codex 接入界面：移除忙碌失败与结果不明只核对登记，保留DSH和旧会话', async () => {
    expectedBrowserErrors.add(new URL('/api/v1/app/agents/codex/remove', workspaceUrl).href);
    let removed = false, attempts = 0, mode = 'busy', reads = 0;
    const registry = () => ({revision: removed ? 'registry-removed' : 'registry-registered', defaultAgentId: removed ? null : agent.id, agents: removed ? [dsh] : [agent, dsh]});
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') {reads++; return route.fulfill({json: registry()});}
      if (url.pathname.endsWith('/codex/remove')) {
        attempts++; assert.deepEqual(route.request().postDataJSON(), {agentId: agent.id, expectedRevision: 'registry-registered'});
        if (mode === 'busy') return route.fulfill({status: 409, json: {error: {code: 'agent_busy', message: '该 Codex 正在生成提交说明，请完成后重试。'}}});
        if (mode === 'unknown-removed') removed = true;
        return route.fulfill({json: {}});
      }
      return route.continue();
    };
    const connections = (route: any) => route.fulfill({json: {connections: [{...connection, status: removed ? 'disconnected' : 'configured'}]}});
    await page.route(pattern, handler); await page.route('**/api/v1/app/codex/connections', connections);
    try {
      await open(); assert.equal(await row(dsh.id).getByRole('button', {name: /^移除 /u}).count(), 1, 'DSH也提供移除操作'); await parent().getByRole('button', {name: dsh.label + ' 详情', exact: true}).click(); await details(dsh.label).waitFor({state: 'visible'}); await closeDetails(dsh.label);
      await parent().getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).waitFor({state: 'visible'}); await closeDetails(agent.label); await removeEntry().click();
      const dialog = page.getByRole('dialog', {name: '移除 Codex 接入？', exact: true}); await dialog.waitFor({state: 'visible'}); await dialog.getByRole('button', {name: /^取\s*消$/u}).click({trial: true}); await dialog.evaluate(async (element: HTMLElement) => {await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => {})));}); await capture(page, 'codex-remove-confirmation.png');
      assert.equal(await page.locator('.agent-registry-details').count(), 0, '移除确认不残留详情浮窗');
      await dialog.getByRole('button', {name: /^取\s*消$/u}).click(); assert.equal(attempts, 0);
      await page.locator('#remove-codex-entry').click(); await page.locator('#confirm-remove-codex').click(); await dialog.getByText('该 Codex 正在生成提交说明，请完成后重试。', {exact: true}).waitFor({state: 'visible'}); assert.equal(attempts, 1);
      mode = 'unknown-kept'; const previousReads = reads; await page.locator('#confirm-remove-codex').click(); await dialog.getByText(/移除结果尚未确认/).waitFor({state: 'visible'}); assert.ok(reads > previousReads, '结果不明必须GET核对登记'); assert.equal(attempts, 2);
      await dialog.getByRole('button', {name: /^取\s*消$/u}).click(); await page.locator('#refresh-agent-registry').click(); await parent().getByRole('button', {name: '设为默认智能体 ' + agent.label, exact: true}).waitFor({state: 'visible'}); assert.equal(attempts, 2, '刷新不能重发移除');
      mode = 'unknown-removed'; await page.locator('#remove-codex-entry').click(); await page.locator('#confirm-remove-codex').click(); await dialog.waitFor({state: 'hidden'}); await parent().getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).waitFor({state: 'visible'}); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + agent.label, exact: true}).count(), 0); assert.equal(attempts, 3); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'false'); assert.equal(await parent().getByText('默认', {exact: true}).count(), 0, '移除默认Codex不得自动切换到DSH'); assert.equal(await page.locator('.agent-registry-details').count(), 0, '删除详情目标后不留下浮层');
      await parent().getByText(/已重新读取并确认接入已移除/).waitFor({state: 'visible'}); await capture(page, 'codex-removed-parent.png'); await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute(pattern, handler); await page.unroute('**/api/v1/app/codex/connections', connections);}
  });
  await t.test('Codex 接入界面：明确移除成功刷新父列表，关联登记清理提示不否定成功', async () => {
    let removed = false, attempts = 0;
    const registry = () => ({revision: removed ? 'registry-removed' : 'registry-registered', defaultAgentId: removed ? null : agent.id, agents: removed ? [dsh] : [agent, dsh]});
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: registry()});
      if (url.pathname.endsWith('/codex/remove')) {attempts++; assert.deepEqual(route.request().postDataJSON(), {agentId: agent.id, expectedRevision: 'registry-registered'}); removed = true; return route.fulfill({json: {registry: registry(), removedAgentId: agent.id, desktopWarning: {code: 'fixture_desktop_warning', message: '接入已移除，关联登记清理待核对。'}}});}
      return route.continue();
    };
    await page.route(pattern, handler);
    try {
      await open(); await parent().getByRole('button', {name: agent.label + ' 详情', exact: true}).click(); await details(agent.label).waitFor({state: 'visible'}); await closeDetails(agent.label); await removeEntry().click(); await page.locator('#confirm-remove-codex').click();
      await page.getByRole('dialog', {name: '移除 Codex 接入？', exact: true}).waitFor({state: 'hidden'}); await parent().getByText('接入已移除，关联登记清理待核对。', {exact: true}).waitFor({state: 'visible'}); assert.equal(attempts, 1); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + agent.label, exact: true}).count(), 0); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'false');
      await page.locator('#refresh-agent-registry').click(); assert.equal(attempts, 1); await capture(page, 'codex-remove-warning-parent.png'); await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute(pattern, handler);}
  });
}
