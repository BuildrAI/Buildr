import assert from 'node:assert/strict';

/** Model protocol is an external collaborator; catalog, exact context and Git writes use production HTTP. */
export async function runSourceControlActionsJourney({t, page, workspaceUrl, capture, fixture, scenario = (name: string, action: () => Promise<void>) => t.test(name, action)}: any) {
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  const assertCommitSplit = async (panel: any) => {
    const layout = await panel.locator('.source-control-commit-split').evaluate((element: HTMLElement) => {
      const main = element.querySelector<HTMLElement>('#commit-changes')!, menu = element.querySelector<HTMLElement>('#commit-action-menu')!;
      const left = main.getBoundingClientRect(), right = menu.getBoundingClientRect(), leftStyle = getComputedStyle(main), rightStyle = getComputedStyle(menu);
      return {top: Math.abs(left.top - right.top), height: Math.abs(left.height - right.height), join: Math.abs(left.right - right.left), outerLeft: parseFloat(leftStyle.borderTopLeftRadius), innerLeft: parseFloat(leftStyle.borderTopRightRadius), innerRight: parseFloat(rightStyle.borderTopLeftRadius), outerRight: parseFloat(rightStyle.borderTopRightRadius)};
    });
    assert.ok(layout.top <= 1 && layout.height <= 1 && layout.join <= 1, '提交按钮组合共高且连接：' + JSON.stringify(layout));
    assert.ok(layout.outerLeft > 0 && layout.outerRight > 0 && layout.innerLeft === 0 && layout.innerRight === 0, '组合只保留外侧圆角：' + JSON.stringify(layout));
  };
  const open = async (branches: any) => {
    await page.goto(workspaceUrl + '/code/source-control'); await root().locator('.source-control-repository-copy').first().waitFor();
    const response = await page.request.get(api + '/code/source-control'); assert.equal(response.status(), 200);
    const catalog = await response.json(), repository = catalog.repositories.find((item: any) => item.worktrees.some((tree: any) => tree.location === branches.location));
    assert.ok(repository); const tree = repository.worktrees.find((item: any) => item.location === branches.location);
    const observed = page.waitForResponse((reply: any) => {const url = new URL(reply.url()); return url.pathname.endsWith('/code/commit-context') && url.searchParams.get('worktreeId') === tree.worktreeId;});
    await root().locator('[data-source-repository="' + repository.id + '"] [data-source-worktree="' + tree.worktreeId + '"] .source-control-repository-copy').click();
    const contextResponse = await observed;
    assert.equal(contextResponse.status(), 200, '读取精确提交上下文：' + await contextResponse.text());
    return {repository, tree};
  };
  const model = async (available: boolean) => {
    let counter = 0; const cancelled = new Set<string>(), starts: unknown[] = [];
    const executionConfig = {model: 'browser-confirmed-model', modelProvider: 'browser-confirmed-provider', reasoningEffort: 'high'};
    const agent = {id: 'browser-codex', kind: 'codex', label: 'Codex', capabilities: ['structured-generation'], availability: 'available', runtimeStatus: 'running', safeReason: null, lastExecutionConfig: null as typeof executionConfig | null};
    const run = (id: string, status: string) => ({id, agentId: agent.id, registrationRevision: 'browser-registry', status, output: status === 'succeeded' ? {commitMessage: 'feat: 浏览器生成提交说明\n\n验证生成结果可继续编辑。'} : null, error: null, executionConfig: status === 'succeeded' ? executionConfig : null});
    const handlers: Array<[string, (route: any) => Promise<void>]> = [];
    const add = async (pattern: string, handler: (route: any) => Promise<void>) => {handlers.push([pattern, handler]); await page.route(pattern, handler);};
    await add('**/api/v1/app/agents', async route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({revision: 'browser-registry', defaultAgentId: available ? agent.id : null, agents: available ? [agent] : []})}));
    await add('**/code/commit-message', async route => {starts.push(route.request().postDataJSON()); await route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify(run('browser-run-' + ++counter, 'running'))});});
    await add('**/api/v1/app/agents/runs?*', async route => {const id = new URL(route.request().url()).searchParams.get('runId')!, status = cancelled.has(id) ? 'cancelled' : 'succeeded'; if (status === 'succeeded') agent.lastExecutionConfig = {...executionConfig}; await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(run(id, status))});});
    await add('**/api/v1/app/agents/cancel', async route => {const id = route.request().postDataJSON().runId; cancelled.add(id); await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(run(id, 'cancelled'))});});
    return {starts, cancelled, setLastExecutionConfig: (config: typeof executionConfig) => {agent.lastExecutionConfig = config;}, dispose: async () => {for (const [pattern, handler] of handlers) await page.unroute(pattern, handler);}};
  };

  await scenario('统一生成控件取消保留说明，生成后手改并提交只改变原工作树', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.configureAuthor({name: '浏览器提交', email: 'commit-browser@example.invalid'});
      const protocol = await model(true);
      try {
        await page.setViewportSize({width: 1440, height: 900}); const {tree} = await open(branches);
        await page.locator('#global-agents-entry').getByText('Codex', {exact: true}).waitFor();
        await page.getByRole('button', {name: '智能体', exact: true}).click();
        const drawer = page.locator('.agent-registry-drawer:visible');
        assert.equal(await drawer.getByRole('button', {name: '设为默认智能体 Codex', exact: true}).getAttribute('aria-pressed'), 'true');
        await drawer.getByRole('button', {name: 'Codex 详情', exact: true}).click();
        await drawer.getByText('临时会话不积累对话历史，结果可在原处编辑和复制。', {exact: true}).waitFor();
        await capture(page, 'source-control-global-agent-registry.png');
        await drawer.getByRole('button', {name: '关闭智能体', exact: true}).click();
        const panel = root().locator('.source-control-commit-panel'), input = panel.getByRole('textbox', {name: '提交说明内容', exact: true});
        assert.equal((await panel.innerText()).includes('Codex'), false, '功能区不常驻执行者名称');
        const height = await panel.evaluate((element: HTMLElement) => element.getBoundingClientRect().height); assert.ok(height >= 65 && height <= 120, '默认说明区保持紧凑：' + height);
        await assertCommitSplit(panel);
        await input.fill('保留手写草稿');
        const started = page.waitForResponse((reply: any) => new URL(reply.url()).pathname.endsWith('/code/commit-message'));
        await panel.locator('#generate-commit-message').click(); await started; await panel.locator('#cancel-commit-message').click(); await panel.locator('#cancel-commit-message').waitFor({state: 'hidden'});
        assert.equal(await input.inputValue(), '保留手写草稿'); assert.equal(protocol.cancelled.size, 1);
        await panel.locator('#generate-commit-message').click(); await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('#commit-message-text')?.value.startsWith('feat: 浏览器生成提交说明'));
        await page.waitForFunction(() => (document.querySelector('#commit-message-text')?.getBoundingClientRect().height || 0) >= 120);
        await assertCommitSplit(panel);
        assert.equal((protocol.starts[0] as {worktreeId: string}).worktreeId, tree.worktreeId);
        await input.fill(['feat: 说明阅读高度', '', ...Array.from({length: 16}, (_, index) => '说明第 ' + (index + 1) + ' 行')].join('\n'));
        await page.waitForFunction(() => {const input = document.querySelector<HTMLTextAreaElement>('#commit-message-text'); return input && input.getBoundingClientRect().height >= 120 && input.getBoundingClientRect().height <= 252 && input.scrollHeight > input.clientHeight && getComputedStyle(input).overflowY === 'auto';});
        await input.fill('feat: 用户修改生成说明后提交');
        const before = branches.observe(branches.location), otherPositions = branches.otherPositions(branches.location);
        const written = page.waitForResponse((reply: any) => reply.request().method() === 'POST' && new URL(reply.url()).pathname.endsWith('/code/commit-changes'));
        await panel.locator('#commit-changes').click(); const response = await written; assert.equal(response.status(), 200); const result = await response.json();
        assert.equal(result.commit.completed, true); assert.notEqual(result.commit.hash, before.head);
        await panel.getByText('已提交', {exact: true}).waitFor(); await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('#commit-message-text')?.value === '');
        await panel.locator('#commit-changes.ant-btn-loading').waitFor({state: 'hidden'});
        await page.waitForFunction(() => (document.querySelector('#commit-message-text')?.getBoundingClientRect().height || 100) <= 40);
        await assertCommitSplit(panel);
        assert.equal(branches.observe(branches.location).head, result.commit.hash); assert.equal(branches.observe(branches.location).status, ''); assert.deepEqual(branches.otherPositions(branches.location), otherPositions);
        await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click(); await root().getByText('feat: 用户修改生成说明后提交', {exact: true}).waitFor();
        await capture(page, 'source-control-real-agent-message-commit.png');
      } finally {await protocol.dispose();}
    });
  });

  await scenario('无智能体仍可手写提交并推送，无上游保留已成立提交不猜目标', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.configureAuthor({name: '浏览器手写', email: 'manual-browser@example.invalid'});
      const protocol = await model(false);
      try {
        await page.setViewportSize({width: 1280, height: 900}); await open(branches);
        const panel = root().locator('.source-control-commit-panel'); await panel.getByRole('textbox', {name: '提交说明内容', exact: true}).fill('chore: 无智能体手写提交');
        assert.equal(await panel.locator('#generate-commit-message').isDisabled(), true);
        await panel.locator('#commit-action-menu').click(); await page.getByRole('menuitem', {name: '提交并推送', exact: true}).click();
        const written = page.waitForResponse((reply: any) => reply.request().method() === 'POST' && new URL(reply.url()).pathname.endsWith('/code/commit-changes'));
        await panel.locator('#commit-changes').click(); const response = await written; assert.equal(response.status(), 200); const result = await response.json();
        assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'unavailable'); assert.equal(result.push.target, null);
        await panel.getByText('已提交，尚未推送', {exact: true}).waitFor(); assert.equal(protocol.starts.length, 0); assert.equal(branches.observe(branches.location).head, result.commit.hash);
        await panel.locator('#commit-changes.ant-btn-loading').waitFor({state: 'hidden'});
        await assertCommitSplit(panel);
        assert.equal(await panel.locator('#retry-push').count(), 0); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await capture(page, 'source-control-real-manual-no-upstream.png');
      } finally {await protocol.dispose();}
    });
  });

  await scenario('智能体统一抽屉关闭与窄屏一致，最近配置更新不改旧生成来源', async () => {
    await fixture.withBranches(async (branches: any) => {
      const protocol = await model(true);
      try {
        await page.setViewportSize({width: 1440, height: 900}); await open(branches);
        const entry = page.getByRole('button', {name: '智能体', exact: true});
        const drawer = page.locator('.agent-registry-drawer:visible');
        const opened = async () => {
          await entry.click();
          await drawer.getByRole('button', {name: '关闭智能体', exact: true}).click({trial: true});
          await page.waitForFunction(() => {
            const root = document.querySelector('.agent-registry-drawer'), wrapper = root?.querySelector('.ant-drawer-content-wrapper');
            return root?.contains(document.activeElement) && wrapper && !/-(?:appear|enter|leave)(?:-(?:prepare|active|start))?(?:\s|$)/.test(wrapper.className) && wrapper.getAnimations().every(animation => animation.playState === 'finished' || animation.playState === 'idle');
          });
        };
        const closed = async () => {await drawer.waitFor({state: 'hidden'}); await page.waitForFunction(() => document.activeElement?.id === 'global-agents-entry');};
        await opened();
        assert.equal(await drawer.locator('.ant-drawer-close').count(), 0, '共用右侧关闭按钮');
        const close = drawer.getByRole('button', {name: '关闭智能体', exact: true});
        const titleBox = await drawer.locator('.drawer-shell-title').boundingBox(), closeBox = await close.boundingBox();
        assert.ok(titleBox && closeBox && closeBox.x > titleBox.x + titleBox.width);
        await drawer.getByRole('button', {name: 'Codex 详情', exact: true}).click();
        await drawer.getByText('首次调用后确认实际值', {exact: true}).waitFor();
        await drawer.getByText('应用服务（App Server）', {exact: true}).waitFor();
        await drawer.getByText('沿用 Codex 原生配置', {exact: true}).waitFor();
        assert.equal(protocol.starts.length, 0, '打开详情不启动生成探测');
        await capture(page, 'refinement-agent-drawer-first-use.png');
        await close.click(); await closed();
        await opened(); await page.keyboard.press('Escape'); await closed();
        await opened(); await drawer.locator('.ant-drawer-mask').click({position: {x: 10, y: 100}}); await closed();
        await page.setViewportSize({width: 390, height: 844}); await opened();
        const wrapper = await drawer.locator('.ant-drawer-content-wrapper').boundingBox();
        assert.ok(wrapper && wrapper.width <= 390 && wrapper.x >= -1, '窄屏抽屉不溢出');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await capture(page, 'refinement-agent-drawer-390.png');
        await drawer.getByRole('button', {name: '关闭智能体', exact: true}).click(); await closed();
        await page.setViewportSize({width: 1440, height: 900});
        const panel = root().locator('.source-control-commit-panel');
        await panel.locator('#generate-commit-message').click();
        await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('#commit-message-text')?.value.startsWith('feat: 浏览器生成提交说明'));
        await opened();
        await drawer.getByText('browser-confirmed-model', {exact: true}).waitFor();
        await drawer.getByText('high', {exact: true}).waitFor();
        protocol.setLastExecutionConfig({model: 'browser-later-model', modelProvider: 'browser-later-provider', reasoningEffort: 'low'});
        await drawer.getByRole('button', {name: '刷新智能体状态', exact: true}).click();
        await drawer.getByText('browser-later-model', {exact: true}).waitFor();
        await capture(page, 'refinement-agent-drawer-latest-config.png');
        await drawer.getByRole('button', {name: '关闭智能体', exact: true}).click(); await closed();
        await panel.getByRole('button', {name: '查看说明来源', exact: true}).hover();
        const tooltip = page.getByRole('tooltip').filter({hasText: 'browser-confirmed-model'});
        await tooltip.waitFor(); assert.ok((await tooltip.innerText()).includes('推理级别：high'));
        assert.equal((await tooltip.innerText()).includes('browser-later-model'), false, '旧结果固定本次确认配置');
        assert.equal((await panel.innerText()).includes('browser-confirmed-model'), false, '日常功能区不常驻模型信息');
        await capture(page, 'refinement-generated-config-fixed.png');
      } finally {await protocol.dispose();}
    });
  });
}
