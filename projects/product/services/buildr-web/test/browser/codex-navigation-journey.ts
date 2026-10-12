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
  await t.test('Codex 关联界面：创建结果不明查询原请求，刷新恢复后展示多个聊天并按关系版本解除', async () => {
    const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
    const nativeId = '11111111-1111-1111-1111-111111111111', otherNativeId = '22222222-2222-2222-2222-222222222222';
    const connection = {id: 'connection-recovery-fixture', agentId: 'agent-fixture', label: 'Codex 关联夹具', installationLabel: '隔离安装', configurationLabel: '隔离配置', status: 'ready', safeReason: null, pluginVersion: 'fixture', lastSeenAt: new Date().toISOString()};
    let requestId = '', posts = 0, receipts = 0, bound = false, removed = false;
    const relations = () => bound ? [nativeId, otherNativeId].filter(id => !removed || id !== nativeId).map((id, index) => ({id: 'relation-' + id, workspaceId, taskId: first, connectionId: connection.id, nativeSessionId: id, createdAt: new Date().toISOString(), revision: 'relation-revision-' + index, sessionUrl: `codex://threads/${id}`, taskUrl: `${new URL(workspaceUrl).pathname}/codex#/tasks/${first}`})) : [];
    const globalPattern = '**/api/v1/app/codex/connections', scopedPattern = '**/api/v1/workspaces/*/codex/**';
    const globalHandler = (route: any) => route.fulfill({json: {connections: [connection]}});
    const scopedHandler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/sessions/unlink')) {
        assert.deepEqual(route.request().postDataJSON(), {relationId: 'relation-' + nativeId, expectedRevision: 'relation-revision-0'});
        removed = true; return route.fulfill({json: {workspaceId, relations: relations()}});
      }
      if (url.pathname.endsWith('/sessions')) return route.fulfill({json: {workspaceId, relations: relations()}});
      if (url.pathname.endsWith('/bindings') && route.request().method() === 'POST') {
        posts++; requestId = route.request().postDataJSON().bindingRequestId;
        assert.match(requestId, /^[a-f0-9-]{36}$/u);
        // The create happened, but its response cannot establish the identity.
        // This avoids issuing a real host message or installing a desktop plugin.
        return route.fulfill({json: {}});
      }
      if (url.pathname.includes('/bindings/')) {
        receipts++; assert.equal(url.pathname.split('/').at(-1), requestId);
        return route.fulfill({json: {id: requestId, workspaceId, connectionId: connection.id, taskId: first, status: bound ? 'bound' : 'pending', nativeSessionId: bound ? nativeId : null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 29 * 60_000).toISOString(), panelUrl: 'codex://plugins/fixture/app/buildr_codex_connections', message: 'not-user-facing'}});
      }
      return route.continue();
    };
    await page.route(globalPattern, globalHandler); await page.route(scopedPattern, scopedHandler);
    try {
      await page.goto(`${workspaceUrl}/codex#/tasks/${first}`); await visibleTask(first).waitFor({state: 'visible'});
      await page.locator('#task-codex-sessions').getByRole('button', {name: '关联聊天', exact: true}).click();
      await page.locator('#task-codex-bind:not([disabled])').click();
      await page.locator('#task-codex-binding').getByText('等待在目标原聊天确认', {exact: true}).waitFor({state: 'visible'});
      assert.equal(posts, 1); assert.ok(receipts >= 1);
      const stored = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('buildr.codex.binding.')).map(key => sessionStorage.getItem(key)).join('\n'));
      assert.equal(stored.includes(nativeId), false); assert.equal(stored.includes('nativeSessionId'), false);
      await page.reload(); await page.locator('#task-codex-binding').getByText('等待在目标原聊天确认', {exact: true}).waitFor({state: 'visible'});
      assert.equal(posts, 1, '刷新仅查询既有请求，不能重新创建'); assert.ok(receipts >= 2);
      bound = true; await page.locator('#task-codex-binding').getByRole('button', {name: '查询关联结果', exact: true}).click();
      await page.locator('[data-codex-session]').nth(1).waitFor({state: 'visible'});
      await capture(page, 'codex-session-relations-two.png');
      assert.equal(await page.locator(`[data-codex-session="${nativeId}"] a`).getAttribute('href'), `codex://threads/${nativeId}`);
      connection.status = 'disconnected'; await page.locator('#task-codex-sessions').getByRole('button', {name: /刷\s*新$/u}).click(); await page.locator(`[data-codex-session="${nativeId}"]`).getByText('已断开', {exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator(`[data-codex-session="${nativeId}"] a`).getAttribute('href'), `codex://threads/${nativeId}`); assert.equal(await page.locator('#task-codex-bind').count(), 0, '断开的连接不能继续创建关联');
      await page.locator(`[data-codex-session="${nativeId}"]`).getByRole('button', {name: '解除关联', exact: true}).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-codex-session]').length === 1);
      assert.equal(runtime.inspectTask(workspaceRoot, first).recordDigest, before);
      await capture(page, 'codex-session-relations.png');
    } finally {await page.unroute(globalPattern, globalHandler); await page.unroute(scopedPattern, scopedHandler);}
  });
}
