import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {runCodexAgentRegistryJourney} from './codex-agent-registry-journey.ts';

/** Production-hosted routing; the connection fixture is explicitly isolated and never installs a plugin. */
export async function runCodexNavigationJourney({t, page, runtime, workspaceRoot, workspaceUrl, runBuildr, capture, expectedBrowserErrors}: any) {
  const first = 'codex-navigation-first', second = 'codex-navigation-second';
  for (const id of [first, second]) runBuildr(['task', 'create', id, '--title', `Codex 导航 ${id}`, '--intent', '验证固定入口准确到达及原任务状态保全', '--project', 'demo', '--target', workspaceRoot, '--json']);
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
  await t.test('Codex 外部片段导航保留工作空间草稿，离开编辑器边界时保护原文与网址', async () => {
    const root = path.join(workspaceRoot, 'projects/demo/docs/publications');
    fs.mkdirSync(root, {recursive: true});
    fs.writeFileSync(path.join(root, 'codex-draft.md'), '---\nid: codex-draft\ntitle: Codex 草稿保护\nkind: product-article\nstatus: draft\n---\n\n# 原始正文\n');
    const before = fs.readFileSync(path.join(root, 'codex-draft.md'));
    await page.goto(`${workspaceUrl}/codex#/articles/demo/codex-draft/edit`);
    const input = page.locator('#article-edit-content');
    await input.waitFor({state: 'visible'}); await input.fill('# 尚未保存的 Codex 编辑\n');
    await fragment(`/tasks/${first}`);
    await visibleTask(first).waitFor({state: 'visible'});
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
  await t.test('Codex 关联界面：空态简洁，聊天请求含任务身份，不恢复旧请求且多个聊天按关系版本解除', async () => {
    const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
    const nativeId = '11111111-1111-1111-1111-111111111111', otherNativeId = '22222222-2222-2222-2222-222222222222';
    const connectionId = 'connection-recovery-fixture', requestId = '33333333-3333-3333-3333-333333333333';
    let posts = 0, receipts = 0, bound = false, removed = false;
    const relations = () => bound ? [nativeId, otherNativeId].filter(id => !removed || id !== nativeId).map((id, index) => ({id: 'relation-' + id, workspaceId, taskId: first, connectionId, nativeSessionId: id, createdAt: new Date().toISOString(), revision: 'relation-revision-' + index, sessionUrl: 'codex://threads/' + id, taskUrl: new URL(workspaceUrl).pathname + '/codex#/tasks/' + first})) : [];
    const scopedPattern = '**/api/v1/workspaces/*/codex/**';
    const scopedHandler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/sessions/unlink')) {
        posts++;
        assert.deepEqual(route.request().postDataJSON(), {relationId: 'relation-' + nativeId, expectedRevision: 'relation-revision-0'});
        removed = true; return route.fulfill({json: {workspaceId, relations: relations()}});
      }
      if (url.pathname.endsWith('/sessions')) return route.fulfill({json: {workspaceId, relations: relations()}});
      if (url.pathname.endsWith('/bindings') && route.request().method() === 'POST') {
        posts++; assert.fail('任务页面不得创建等待用户去总览确认的关联请求。');
      }
      if (url.pathname.includes('/bindings/')) {receipts++; assert.fail('新版任务页面不再恢复或查询旧的关联请求。');}
      return route.continue();
    };
    const section = () => page.locator('#task-codex-sessions');
    const openHelp = () => section().getByRole('button', {name: '关联聊天', exact: true}).click();
    const stubClipboard = () => page.evaluate(() => {
      (window as any).__codexCopied = [];
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async (value: string) => {(window as any).__codexCopied.push(value);}}});
    });
    const copied = () => page.evaluate(() => (window as any).__codexCopied.at(-1));
    const taskLink = workspaceUrl + '/codex#/tasks/' + first;
    await page.route(scopedPattern, scopedHandler);
    try {
      await page.goto(taskLink); await visibleTask(first).waitFor({state: 'visible'});
      await section().getByText('尚未关联聊天', {exact: true}).waitFor({state: 'visible'});
      assert.equal(await section().locator('.ant-empty').count(), 0, '无关联仅显示简洁文字，不放置大块空态');
      assert.equal(await section().locator('.task-codex-association').count(), 0, '无关联不默认展开操作说明');
      await stubClipboard(); await section().getByRole('button', {name: '复制任务链接', exact: true}).click();
      assert.equal(await copied(), taskLink);
      assert.equal(await section().locator('.task-codex-association').count(), 0, '复制任务链接不会展开无关的关联操作');
      await openHelp();
      await section().getByText('把当前会话关联到 Buildr 任务 ' + first + '。', {exact: true}).waitFor({state: 'visible'});
      assert.equal(await section().locator('.ant-select, #task-codex-bind, #task-codex-binding, a[href^="plugin:"], a[href^="codex://plugins"]').count(), 0, '不再提供错误的总览入口、桌面选择或等待确认表单');
      await section().getByRole('button', {name: '复制关联请求', exact: true}).click();
      assert.equal(await copied(), '把当前会话关联到 Buildr 任务 ' + first + '。\n任务链接：' + taskLink);
      assert.equal(posts, 0); assert.equal(receipts, 0, '自然语言关联不预先创建或轮询请求');
      await capture(page, 'codex-session-association-help.png');
      const storageKey = 'buildr.codex.binding.' + JSON.stringify([workspaceId, first]);
      const storedRequest = {id: requestId, workspaceId, taskId: first, connectionId, expiresAt: Date.now() + 29 * 60_000};
      await page.evaluate(({key, value}: any) => {sessionStorage.setItem(key, JSON.stringify(value));}, {key: storageKey, value: storedRequest});
      await page.reload(); await section().getByText('尚未关联聊天', {exact: true}).waitFor({state: 'visible'});
      assert.equal(await section().locator('.task-codex-association').count(), 0, '旧请求不会自动展开或遮挡简洁空态');
      assert.equal(receipts, 0, '恢复页面不轮询之前的请求');
      await openHelp(); await stubClipboard();
      assert.equal(await section().locator('#task-codex-query-legacy').count(), 0, '旧请求不在新版界面中出现');
      await section().getByRole('button', {name: '复制关联请求', exact: true}).click();
      assert.equal(await copied(), '把当前会话关联到 Buildr 任务 ' + first + '。\n任务链接：' + taskLink);
      assert.equal(posts, 0); assert.equal(receipts, 0, '旧请求不阻塞新的聊天关联，也不触发后台查询');
      // Simulate a relation written by the target chat, without pretending that this
      // browser fixture can supply a real Codex chat identity or send a host message.
      bound = true; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await section().locator('[data-codex-session]').nth(1).waitFor({state: 'visible'});
      assert.equal(await section().getByText('尚未关联聊天', {exact: true}).count(), 0);
      assert.equal(await section().locator('[data-codex-session="' + nativeId + '"] a').getAttribute('href'), 'codex://threads/' + nativeId);
      assert.equal(await section().locator('[data-codex-session="' + otherNativeId + '"] a').getAttribute('href'), 'codex://threads/' + otherNativeId);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), JSON.stringify(storedRequest), '新版界面不删除既有请求数据');
      await capture(page, 'codex-session-relations-two.png');
      for (const width of [1280, 390]) {
        await page.setViewportSize({width, height: 900});
        await section().getByRole('button', {name: '复制关联请求', exact: true}).waitFor({state: 'visible'});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '关联请求及聊天列表在宽窄视口不产生水平溢出');
        await capture(page, 'codex-session-association-' + width + '.png');
      }
      await page.setViewportSize({width: 1280, height: 900});
      await section().locator('[data-codex-session="' + nativeId + '"]').getByRole('button', {name: '解除关联', exact: true}).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-codex-session]').length === 1);
      assert.equal(posts, 1); assert.equal(runtime.inspectTask(workspaceRoot, first).recordDigest, before, '关联和解除均不修改任务正文或状态');
      await capture(page, 'codex-session-relations.png');
    } finally {await page.unroute(scopedPattern, scopedHandler);}
  });
  await t.test('Codex 解除关联：等待旧任务结果时切换任务，旧失败不污染新任务且操作可继续', async () => {
    const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
    const nativeIds = {[first]: '11111111-1111-1111-1111-111111111111', [second]: '22222222-2222-2222-2222-222222222222'};
    const scopedPattern = '**/api/v1/workspaces/*/codex/**';
    let release!: () => void, secondRemoved = false, oldSettled = false;
    const held = new Promise<void>(resolve => {release = resolve;});
    const relations = (taskId: string) => taskId === second && secondRemoved ? [] : [{id: 'relation-' + taskId, workspaceId, taskId, connectionId: 'fixture', nativeSessionId: nativeIds[taskId], revision: taskId + '-v1', createdAt: new Date().toISOString(), sessionUrl: 'codex://threads/' + nativeIds[taskId], taskUrl: new URL(workspaceUrl).pathname + '/codex#/tasks/' + taskId}];
    const oldFailureUrl = new URL(workspaceUrl).origin + '/api/v1/workspaces/' + workspaceId + '/codex/sessions/unlink';
    expectedBrowserErrors.add(oldFailureUrl);
    const scopedHandler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/sessions')) return route.fulfill({json: {workspaceId, relations: relations(url.searchParams.get('taskId')!)}});
      if (url.pathname.endsWith('/sessions/unlink')) {
        const input = route.request().postDataJSON();
        if (input.relationId === 'relation-' + first) {
          assert.equal(input.expectedRevision, first + '-v1'); await held;
          try {return await route.fulfill({status: 503, json: {error: {code: 'fixture_old_task_unlink_failed', message: '旧任务解除失败，不能显示在新任务。'}}});}
          finally {oldSettled = true;}
        }
        assert.deepEqual(input, {relationId: 'relation-' + second, expectedRevision: second + '-v1'});
        secondRemoved = true; return route.fulfill({json: {workspaceId, relations: []}});
      }
      return route.continue();
    };
    await page.route(scopedPattern, scopedHandler);
    try {
      await page.goto(workspaceUrl + '/codex#/tasks/' + first); await visibleTask(first).waitFor({state: 'visible'});
      const initial = visibleTask(first).locator('#task-codex-sessions');
      await initial.locator('[data-codex-session]').waitFor({state: 'visible'});
      const unlinkStarted = page.waitForRequest((request: any) => new URL(request.url()).pathname.endsWith('/sessions/unlink'), {timeout: 4000});
      await initial.getByRole('button', {name: '解除关联', exact: true}).click(); await unlinkStarted;
      await fragment('/tasks/' + second); await visibleTask(second).waitFor({state: 'visible'});
      const current = visibleTask(second).locator('#task-codex-sessions');
      await current.locator('[data-codex-session="' + nativeIds[second] + '"]').waitFor({state: 'visible'});
      const oldResponse = page.waitForResponse((response: any) => response.url() === oldFailureUrl && response.status() === 503, {timeout: 4000});
      release(); await oldResponse;
      await page.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(oldSettled, true); assert.equal(await current.getByText('旧任务解除失败，不能显示在新任务。', {exact: true}).count(), 0);
      assert.equal(await current.getByText('已解除关联，聊天和任务内容仍保留。', {exact: true}).count(), 0, '旧任务不能给新任务写入成功提示');
      const refreshButton = current.getByRole('button', {name: '刷新聊天关联', exact: true});
      assert.equal(await refreshButton.isEnabled(), true, '旧任务解除结束后，新任务刷新不能永久禁用');
      await refreshButton.click();
      const unlinkButton = current.getByRole('button', {name: '解除关联', exact: true});
      assert.equal(await unlinkButton.isEnabled(), true, '新任务仍可执行自己的解除操作');
      await unlinkButton.click(); await current.getByText('尚未关联聊天', {exact: true}).waitFor({state: 'visible'});
      assert.equal(secondRemoved, true);
      await capture(page, 'codex-session-unlink-task-switch.png');
    } finally {release(); await page.unroute(scopedPattern, scopedHandler);}
  });
}
