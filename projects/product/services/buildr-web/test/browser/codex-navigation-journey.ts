import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {reportAgentUiFailure, runCodexAgentRegistryJourney, waitForTaskSessionPopover} from './codex-agent-registry-journey.ts';
import { runDshDesktopJourney } from './dsh-desktop-journey.ts';
import { runDshTaskPageJourney } from './dsh-task-page-journey.ts';

/** Production-hosted routing; the connection fixture is explicitly isolated and never installs a plugin. */
export async function runCodexNavigationJourney({t, page, runtime, workspaceRoot, workspaceUrl, runBuildr, capture, expectedBrowserErrors}: any) {
  const first = 'codex-navigation-first', second = 'codex-navigation-second';
  for (const id of [first, second]) runtime.createTask(workspaceRoot, { taskId: id, title: `Codex 导航 ${id}`, intent: '验证固定入口准确到达及原任务状态保全', projects: ['demo'] });
  const before = runtime.inspectTask(workspaceRoot, first).recordDigest;
  const visibleTask = (id: string) => page.locator(`#task-detail-main[data-task-id="${id}"]:visible`);
  const fragment = async (target: string) => {
    await page.evaluate((hash: string) => {location.hash = hash;}, '#' + target);
  };
  await t.test('Codex 固定入口：真实任务初载、片段切换、刷新及历史前进后退', async () => {
    await page.goto(`${workspaceUrl}/codex#/overview`);
    await page.locator('#global-agents-entry').waitFor({state: 'visible'});
    await fragment(`/tasks/${first}`); await visibleTask(first).waitFor({state: 'visible'});
    assert.equal(new URL(page.url()).pathname, new URL(workspaceUrl).pathname + '/codex');
    assert.equal(new URL(page.url()).hash, `#/tasks/${first}`);
    await fragment(`/tasks/${second}`); await visibleTask(second).waitFor({state: 'visible'});
    await page.goBack(); await visibleTask(first).waitFor({state: 'visible'});
    await page.goForward(); await visibleTask(second).waitFor({state: 'visible'});
    await page.reload(); await visibleTask(second).waitFor({state: 'visible'});
    assert.equal(new URL(page.url()).hash, `#/tasks/${second}`);
    await fragment('/tasks/%zz'); await page.locator('#codex-entry-error').waitFor({state: 'visible'});
    assert.equal(await page.locator('#task-detail-main:visible').count(), 0, '无效目标不得继续显示旧任务');
    await page.goto(`${workspaceUrl}/tasks/${first}`); await visibleTask(first).waitFor({state: 'visible'});
    assert.equal(new URL(page.url()).pathname, new URL(workspaceUrl).pathname + '/tasks', '旧链接继续使用原资源列表规范化');
    await capture(page, 'codex-legacy-task.png');
    const document = path.join(workspaceRoot, 'projects/demo/docs/codex-navigation-material.md');
    fs.mkdirSync(path.dirname(document), {recursive: true}); fs.writeFileSync(document, '# Codex 旧材料链接\n\n验证直接打开真实项目材料。\n');
    const materialTarget = `/tasks/${first}/document?project=demo&file=docs%2Fcodex-navigation-material.md`;
    for (const entry of [`${workspaceUrl}${materialTarget}`, `${workspaceUrl}/codex#${materialTarget}`]) {
      await page.goto(entry);
      const reader = page.locator(`[data-task-linked-document="${first}"]:visible`);
      await reader.waitFor({state: 'visible'}); await reader.getByRole('heading', {name: 'Codex 旧材料链接', exact: true}).waitFor({state: 'visible'});
    }
    assert.equal(runtime.inspectTask(workspaceRoot, first).recordDigest, before, '导航不改变任务正文或状态');
    await capture(page, 'codex-legacy-material.png');
  });
  await runCodexAgentRegistryJourney({t, page, workspaceUrl, taskId: first, capture, expectedBrowserErrors});
  await runDshDesktopJourney({t, page, workspaceUrl, taskId: first, capture, expectedBrowserErrors});
  await runDshTaskPageJourney({t, page, workspaceUrl, taskId: first, nextTaskId: second, capture});
  await t.test('Codex 外部片段导航保留工作空间草稿，离开编辑器边界时保护原文与网址', async () => {
    const root = path.join(workspaceRoot, 'projects/demo/docs/publications');
    fs.mkdirSync(root, {recursive: true});
    fs.writeFileSync(path.join(root, 'codex-draft.md'), '---\nid: codex-draft\ntitle: Codex 草稿保护\nkind: product-article\nstatus: draft\n---\n\n# 原始正文\n');
    const before = fs.readFileSync(path.join(root, 'codex-draft.md'));
    await page.goto(`${workspaceUrl}/codex#/articles/demo/codex-draft/edit`);
    const input = page.locator('#article-edit-content');
    await input.waitFor({state: 'visible'}); await input.fill('# 尚未保存的 Codex 编辑\n');
    await fragment(`/tasks/${first}`);
    await visibleTask(first).waitFor({state: 'visible'}).catch(async(error:unknown)=>{
      const scene=await page.evaluate(()=>({url:location.href,title:document.title,dialogs:[...document.querySelectorAll<HTMLElement>('.ant-modal')].filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>({text:node.innerText,rect:node.getBoundingClientRect().toJSON()})),editor:[...document.querySelectorAll<HTMLTextAreaElement>('#article-edit-content')].map(node=>({value:node.value,rect:node.getBoundingClientRect().toJSON(),hidden:Boolean(node.closest('[hidden]'))})),tasks:[...document.querySelectorAll<HTMLElement>('#task-detail-main')].map(node=>({taskId:node.dataset.taskId,rect:node.getBoundingClientRect().toJSON(),hidden:Boolean(node.closest('[hidden]'))})),body:document.body.innerText.slice(-4500)}));
      process.stderr.write('[codex-draft-fragment-failure] '+JSON.stringify(scene)+'\n');await capture(page,'codex-draft-fragment-failure.png');throw error;
    });
    assert.equal(await input.inputValue(), '# 尚未保存的 Codex 编辑\n', '同一工作空间切换沿用既有编辑器，不要求丢弃草稿');
    assert.equal(await page.getByRole('dialog', {name: '放弃尚未保存的修改？', exact: true}).count(), 0);
    const retainedUrl = page.url();
    await capture(page, 'codex-draft-retained-task.png');
    // The standalone prototype reader intentionally lives outside AppLayout and
    // would release ArticleEditorProvider. This must exercise its existing blocker.
    await fragment(`/tasks/${first}/prototypes`);
    const dialog = page.getByRole('dialog', {name: '放弃尚未保存的修改？', exact: true});
    await dialog.waitFor({state: 'visible'}); await dialog.getByRole('button', {name: '继续编辑', exact: true}).click();
    assert.equal(await input.inputValue(), '# 尚未保存的 Codex 编辑\n');
    assert.equal(page.url(), retainedUrl);
    await fragment(`/tasks/${first}/prototypes`); await dialog.waitFor({state: 'visible'});
    await capture(page, 'codex-draft-leave-confirmation.png');
    await dialog.getByRole('button', {name: '放弃修改', exact: true}).click(); await page.locator('.prototype-standalone').waitFor({state: 'visible'});
    assert.equal(new URL(page.url()).hash, `#/tasks/${first}/prototypes`);
    assert.deepEqual(fs.readFileSync(path.join(root, 'codex-draft.md')), before, '明确放弃也不写入未保存草稿');
  });
  await t.test('Codex 关联界面：单行按需浮层，准确选择多个会话，空态、错误与宽窄布局均保持紧凑', async () => {
    const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
    const nativeId = '11111111-1111-1111-1111-111111111111', otherNativeId = '22222222-2222-2222-2222-222222222222';
    const connectionId = 'connection-recovery-fixture', requestId = '33333333-3333-3333-3333-333333333333';
    let posts = 0, receipts = 0, bound = false, readFailed = false;
    const removed = new Set<string>();
    const relations = () => bound ? [nativeId, otherNativeId].filter(id => !removed.has(id)).map((id, index) => ({provider: 'codex', id: 'relation-' + id, workspaceId, taskId: first, connectionId, nativeSessionId: id, createdAt: new Date().toISOString(), revision: 'relation-revision-' + index, sessionUrl: 'codex://threads/' + id, taskUrl: new URL(workspaceUrl).pathname + '/codex#/tasks/' + first})) : [];
    const scopedPattern = '**/api/v1/workspaces/*/agent-sessions**';
    expectedBrowserErrors.add(new URL(workspaceUrl).origin + '/api/v1/workspaces/' + workspaceId + '/agent-sessions');
    const scopedHandler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/agent-sessions/unlink')) {
        posts++;
        const input = route.request().postDataJSON(), relation = relations().find(item => item.id === input.relationId);
        assert.ok(relation); assert.deepEqual(input, {provider: 'codex', relationId: relation.id, expectedRevision: relation.revision});
        removed.add(relation.nativeSessionId); return route.fulfill({json: {workspaceId, diagnostics: [], relations: relations()}});
      }
      if (url.pathname.endsWith('/agent-sessions')) return readFailed ? route.fulfill({status: 503, json: {error: {code: 'fixture_read_failed', message: '隔离会话关联读取失败。'}}}) : route.fulfill({json: {workspaceId, diagnostics: [], relations: relations()}});
      if (url.pathname.endsWith('/bindings') && route.request().method() === 'POST') {posts++; assert.fail('任务页面不得创建等待用户去总览确认的关联请求。');}
      if (url.pathname.includes('/bindings/')) {receipts++; assert.fail('新版任务页面不再恢复或查询旧的关联请求。');}
      return route.continue();
    };
    const geometry: Array<{kind: string; viewport: number; width: number; height: number; x?: number; y?: number}> = [];
    const section = () => visibleTask(first).locator('#task-codex-sessions');
    const panel = () => page.getByRole('dialog', {name: '智能体会话关联', exact: true});
    const openPanel = async () => {await section().locator('#task-codex-manage').click(); await panel().waitFor({state: 'visible'});};
    const closePanel = async () => {await panel().getByRole('button', {name: '关闭会话关联', exact: true}).click(); await panel().waitFor({state: 'hidden'});};
    const assertCompact = async () => {
      const box = await section().boundingBox(); assert.ok(box && box.height <= 36, '常驻会话区域只占一行：' + JSON.stringify(box));
      geometry.push({kind: 'collapsed', viewport: page.viewportSize().width, width: box.width, height: box.height});
      assert.equal(await section().locator('[data-codex-session], .task-codex-association, .task-codex-feedback, .ant-alert').count(), 0, '关系明细、指令及反馈均不占据常驻页面');
      try { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); }
      catch (error) { await reportAgentUiFailure(page, 'codex-sessions-compact'); throw error; }
    };
    const stubClipboard = () => page.evaluate(() => {
      (window as any).__codexCopied = [];
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async (value: string) => {(window as any).__codexCopied.push(value);}}});
    });
    const copied = () => page.evaluate(() => (window as any).__codexCopied.at(-1));
    const taskLink = workspaceUrl + '/codex#/tasks/' + first;
    await page.route(scopedPattern, scopedHandler);
    try {
      await page.goto(taskLink); await visibleTask(first).waitFor({state: 'visible'});
      await section().getByText(/尚未关联会话/u).waitFor({state: 'visible'}); await assertCompact();
      assert.equal(await panel().count(), 0); assert.equal(await section().locator('.ant-empty').count(), 0);
      await capture(page, 'codex-session-compact-empty.png');
      await section().getByRole('button', {name: '关联会话', exact: true}).click(); await panel().waitFor({state: 'visible'});
      await stubClipboard(); await panel().getByRole('button', {name: '复制任务链接', exact: true}).click(); assert.equal(await copied(), taskLink);
      await panel().getByText('把当前会话关联到 Buildr 任务 ' + first + '。', {exact: true}).waitFor({state: 'visible'});
      assert.equal(await panel().locator('.ant-select, #task-codex-bind, #task-codex-binding, a[href^="plugin:"], a[href^="codex://plugins"]').count(), 0);
      await panel().getByRole('button', {name: '复制关联请求', exact: true}).click();
      assert.equal(await copied(), '把当前会话关联到 Buildr 任务 ' + first + '。\n任务链接：' + taskLink);
      assert.equal(posts, 0); assert.equal(receipts, 0);
      await capture(page, 'codex-session-compact-empty-popover.png');
      await page.keyboard.press('Escape'); await panel().waitFor({state: 'hidden'});
      assert.equal(await section().getByRole('button', {name: '关联会话', exact: true}).evaluate((element: HTMLElement) => document.activeElement === element), true, 'Escape关闭后焦点回到触发按钮');
      const storageKey = 'buildr.codex.binding.' + JSON.stringify([workspaceId, first]);
      const storedRequest = {id: requestId, workspaceId, taskId: first, connectionId, expiresAt: Date.now() + 29 * 60_000};
      await page.evaluate(({key, value}: any) => {sessionStorage.setItem(key, JSON.stringify(value));}, {key: storageKey, value: storedRequest});
      await page.reload(); await section().getByText(/尚未关联会话/u).waitFor({state: 'visible'}); await assertCompact();
      assert.equal(await panel().count(), 0); assert.equal(receipts, 0, '旧请求不展开浮层且不触发查询');
      // Simulate a target chat writing relations; this browser fixture never
      // supplies a real Codex identity or sends an actual native host message.
      bound = true; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await section().getByText(' · 2', {exact: true}).waitFor({state: 'visible'}); await assertCompact();
      assert.equal(await section().locator('a[href^="codex://threads/"]').count(), 0, '多个会话必须明确选择，不能默认打开第一个');
      await section().getByRole('button', {name: '打开会话', exact: true}).click(); await panel().waitFor({state: 'visible'});
      await panel().locator('[data-codex-session]').nth(1).waitFor({state: 'visible'});
      assert.equal(await panel().locator('[data-codex-session="' + nativeId + '"] a').getAttribute('href'), 'codex://threads/' + nativeId);
      assert.equal(await panel().locator('[data-codex-session="' + otherNativeId + '"] a').getAttribute('href'), 'codex://threads/' + otherNativeId);
      await panel().evaluate((element: HTMLElement) => element.addEventListener('click', event => {const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="codex://threads/"]'); if (anchor) {event.preventDefault(); (window as any).__selectedCodexHref = anchor.href;}}));
      await panel().locator('[data-codex-session="' + otherNativeId + '"]').getByRole('link', {name: '打开会话', exact: true}).click();
      assert.equal(await page.evaluate(() => (window as any).__selectedCodexHref), 'codex://threads/' + otherNativeId, '点击第二条打开第二个准确会话');
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), JSON.stringify(storedRequest));
      for (const width of [1280, 390]) {
        await page.setViewportSize({width, height: 900});
        try { await waitForTaskSessionPopover(page); }
        catch (error) { await reportAgentUiFailure(page, `codex-session-popover-${width}`); throw error; }
        await assertCompact();
        const box = await page.locator('.task-codex-popover:visible').boundingBox(); assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= 901, '会话浮层外框在宽窄视口内：' + JSON.stringify({width, box}));
        geometry.push({kind: 'popover', viewport: width, ...box});
        await capture(page, 'codex-session-compact-popover-' + width + '.png');
      }
      await page.setViewportSize({width: 1280, height: 900});
      await visibleTask(first).getByRole('heading', {name: 'Codex 导航 ' + first, exact: true}).click(); await panel().waitFor({state: 'hidden'});
      await assertCompact(); await capture(page, 'codex-session-compact-multiple.png');
      await section().locator('#task-codex-manage').focus(); await page.keyboard.press('Enter'); await panel().waitFor({state: 'visible'});
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '智能体会话关联');
      readFailed = true; await panel().getByRole('button', {name: '刷新会话关联', exact: true}).click();
      await section().getByText(' · 读取失败', {exact: true}).waitFor({state: 'visible'});
      await panel().getByText('隔离会话关联读取失败。', {exact: true}).waitFor({state: 'visible'});
      await panel().getByText('上次读取的关联 · 2', {exact: true}).waitFor({state: 'visible'});
      await closePanel(); await assertCompact();
      assert.equal(await section().getByText(' · 2', {exact: true}).count(), 0, '失败不能用旧数量冒充当前读取成功');
      await openPanel(); readFailed = false; await panel().getByRole('button', {name: '刷新会话关联', exact: true}).click();
      await section().getByText(' · 2', {exact: true}).waitFor({state: 'visible'});
      await panel().locator('[data-codex-session="' + nativeId + '"]').getByRole('button', {name: '解除关联', exact: true}).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-codex-session]').length === 1);
      await closePanel(); await assertCompact();
      assert.equal(await section().getByRole('link', {name: '打开会话', exact: true}).getAttribute('href'), 'codex://threads/' + otherNativeId, '剩一条时直接打开准确会话');
      await capture(page, 'codex-session-compact-single.png');
      await openPanel(); await panel().locator('[data-codex-session="' + otherNativeId + '"]').getByRole('button', {name: '解除关联', exact: true}).click();
      await panel().getByText('尚未关联会话', {exact: true}).waitFor({state: 'visible'});
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '智能体会话关联');
      await page.keyboard.press('Escape'); await panel().waitFor({state: 'hidden'});
      assert.equal(await section().locator('#task-codex-manage').evaluate((element: HTMLElement) => document.activeElement === element), true, '解除最后一条后Escape关闭并恢复管理入口焦点');
      await section().getByText(/尚未关联会话/u).waitFor({state: 'visible'}); await assertCompact();
      assert.equal(posts, 2); assert.equal(receipts, 0); assert.equal(runtime.inspectTask(workspaceRoot, first).recordDigest, before);
      process.stderr.write('[codex-compact-geometry] ' + JSON.stringify(geometry) + '\n');
    } finally {await page.unroute(scopedPattern, scopedHandler);}
  });
  await t.test('Codex 解除关联：浮层随任务切换关闭，旧失败不污染新任务且操作可继续', async () => {
    const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
    const nativeIds = {[first]: '11111111-1111-1111-1111-111111111111', [second]: '22222222-2222-2222-2222-222222222222'};
    const scopedPattern = '**/api/v1/workspaces/*/agent-sessions**';
    let release!: () => void, secondRemoved = false, oldSettled = false;
    const held = new Promise<void>(resolve => {release = resolve;});
    const relations = (taskId: string) => (taskId !== first && taskId !== second) || taskId === second && secondRemoved ? [] : [{provider: 'codex', id: 'relation-' + taskId, workspaceId, taskId, connectionId: 'fixture', nativeSessionId: nativeIds[taskId], revision: taskId + '-v1', createdAt: new Date().toISOString(), sessionUrl: 'codex://threads/' + nativeIds[taskId], taskUrl: new URL(workspaceUrl).pathname + '/codex#/tasks/' + taskId}];
    const oldFailureUrl = new URL(workspaceUrl).origin + '/api/v1/workspaces/' + workspaceId + '/agent-sessions/unlink';
    expectedBrowserErrors.add(oldFailureUrl);
    const scopedHandler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/agent-sessions')) return route.fulfill({json: {workspaceId, diagnostics: [], relations: relations(url.searchParams.get('taskId')!)}});
      if (url.pathname.endsWith('/agent-sessions/unlink')) {
        const input = route.request().postDataJSON();
        if (input.relationId === 'relation-' + first) {
          assert.equal(input.expectedRevision, first + '-v1'); await held;
          try {return await route.fulfill({status: 503, json: {error: {code: 'fixture_old_task_unlink_failed', message: '旧任务解除失败，不能显示在新任务。'}}});}
          finally {oldSettled = true;}
        }
        assert.deepEqual(input, {provider: 'codex', relationId: 'relation-' + second, expectedRevision: second + '-v1'});
        secondRemoved = true; return route.fulfill({json: {workspaceId, diagnostics: [], relations: []}});
      }
      return route.continue();
    };
    const panel = () => page.getByRole('dialog', {name: '智能体会话关联', exact: true});
    await page.route(scopedPattern, scopedHandler);
    try {
      await page.goto(workspaceUrl + '/codex#/tasks/' + first); await visibleTask(first).waitFor({state: 'visible'});
      const initial = visibleTask(first).locator('#task-codex-sessions');
      await initial.getByRole('link', {name: '打开会话', exact: true}).waitFor({state: 'visible'});
      await initial.locator('#task-codex-manage').click(); await panel().waitFor({state: 'visible'});
      const unlinkStarted = page.waitForRequest((request: any) => new URL(request.url()).pathname.endsWith('/agent-sessions/unlink'), {timeout: 4000});
      await panel().getByRole('button', {name: '解除关联', exact: true}).click(); await unlinkStarted;
      await fragment('/tasks/' + second); await visibleTask(second).waitFor({state: 'visible'}); await panel().waitFor({state: 'hidden'});
      const current = visibleTask(second).locator('#task-codex-sessions');
      await current.getByRole('link', {name: '打开会话', exact: true}).waitFor({state: 'visible'});
      assert.equal(await current.getByRole('link', {name: '打开会话', exact: true}).getAttribute('href'), 'codex://threads/' + nativeIds[second]);
      const oldResponse = page.waitForResponse((response: any) => response.url() === oldFailureUrl && response.status() === 503, {timeout: 4000});
      release(); await oldResponse;
      await page.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(oldSettled, true); assert.equal(await panel().count(), 0, '旧失败不会重新打开浮层');
      await current.locator('#task-codex-manage').click(); await panel().waitFor({state: 'visible'});
      assert.equal(await panel().getByText('旧任务解除失败，不能显示在新任务。', {exact: true}).count(), 0);
      assert.equal(await panel().getByText('已解除关联，会话和任务内容仍保留。', {exact: true}).count(), 0);
      const refreshButton = panel().getByRole('button', {name: '刷新会话关联', exact: true});
      assert.equal(await refreshButton.isEnabled(), true); await refreshButton.click();
      const unlinkButton = panel().getByRole('button', {name: '解除关联', exact: true});
      assert.equal(await unlinkButton.isEnabled(), true); await unlinkButton.click(); await panel().getByText('尚未关联会话', {exact: true}).waitFor({state: 'visible'});
      assert.equal(secondRemoved, true);
      await panel().getByRole('button', {name: '关闭会话关联', exact: true}).click(); await panel().waitFor({state: 'hidden'});
      const box = await current.boundingBox(); assert.ok(box && box.height <= 36);
      await capture(page, 'codex-session-compact-task-switch.png');
    } finally {release(); await page.unroute(scopedPattern, scopedHandler);}
  });
}
