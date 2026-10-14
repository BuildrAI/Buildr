import assert from 'node:assert/strict';
import { reportAgentUiFailure, waitForTaskSessionPopover } from './codex-agent-registry-journey.ts';

/** The hosted components are real; only desktop transport is replaced, so no native chat is changed. */
export async function runDshDesktopJourney({t, page, workspaceUrl, taskId, capture, expectedBrowserErrors}: any) {
  const origin = new URL(workspaceUrl).origin, workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
  const codex = {id: 'codex-dsh-journey', label: 'Codex 已有接入', kind: 'codex', capabilities: ['structured-generation'], availability: 'available', runtimeStatus: 'stopped', safeReason: null, lastExecutionConfig: null};
  const dsh = {...codex, id: 'dsh-existing-identity', label: 'DSH 原登记名称', kind: 'dsh', runtimeStatus: 'idle', lastExecutionConfig: {model: 'desktop-current-model', modelProvider: 'desktop-current-provider', reasoningEffort: 'max'}};
  const candidate = {id: 'dsh-current-candidate', label: dsh.label, version: 'fixture', installationLabel: 'DSH 桌面安装', configurationLabel: '桌面当前配置', source: 'desktop-bundled', registeredAgentId: null, desktopAvailable: true, generationAvailability: 'available', safeReason: null};
  const desktopConnection = {id: 'dsh-desktop-current', agentId: dsh.id, label: dsh.label, installationLabel: candidate.installationLabel, configurationLabel: candidate.configurationLabel, status: 'configured', safeReason: null};
  const parent = () => page.getByRole('dialog', {name: '智能体', exact: true});
  const row = () => parent().locator(`[data-agent-id="${dsh.id}"]`);
  const detail = () => page.getByRole('dialog', {name: dsh.label + ' 接入详情', exact: true});
  const openRegistry = async () => {await page.goto(`${workspaceUrl}/tasks/${taskId}`); await page.locator('#global-agents-entry').click(); await parent().waitFor({state: 'visible'});};

  await t.test('DSH接入沿用现有抽屉，取消无写入，确认保留Codex默认，同范围检查保留原编号名称', async () => {
    let connected = false, revision = 'before-dsh', writes = 0;
    const registry = () => ({revision, defaultAgentId: codex.id, agents: connected ? [codex, dsh] : [codex]});
    const handler = async (route: any) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: registry()});
      if (url.pathname.endsWith('/dsh/discovery')) return route.fulfill({json: {revision: 'discovery-current', candidates: [{...candidate, registeredAgentId: connected ? dsh.id : null}]}});
      if (url.pathname.endsWith('/dsh/connect')) {
        writes++; const input = request.postDataJSON();
        assert.deepEqual(input, {candidateId: candidate.id, expectedDiscoveryRevision: 'discovery-current', expectedRevision: revision, makeDefault: false, ...(connected ? {existingAgentId: dsh.id} : {})});
        connected = true; revision = 'after-dsh-' + writes;
        return route.fulfill({json: {registry: registry(), agentId: dsh.id, desktop: desktopConnection, desktopError: null}});
      }
      if (request.method() !== 'GET') assert.fail('未授权的DSH夹具写入');
      return route.continue();
    };
    const connections = (route: any) => route.fulfill({json: {connections: connected ? [desktopConnection] : []}});
    await page.route('**/api/v1/app/agents**', handler); await page.route('**/api/v1/app/dsh/connections', connections);
    try {
      await openRegistry(); await page.locator('#add-agent-entry').click(); await page.getByRole('menuitem', {name: 'DSH', exact: true}).click();
      const child = page.getByRole('dialog', {name: '接入 DSH', exact: true}); await child.waitFor({state: 'visible'});
      await child.locator('[data-dsh-candidate]').waitFor({state: 'visible'}); assert.equal(await child.locator('input:not([type="radio"]):not([type="checkbox"]), textarea').count(), 0, '网页不要求输入路径、端口、凭证');
      await child.getByText('桌面后台生成可用', {exact: false}).waitFor({state: 'visible'}); await page.locator('#cancel-local-dsh').click(); assert.equal(writes, 0);
      await page.locator('#add-agent-entry').click(); await page.getByRole('menuitem', {name: 'DSH', exact: true}).click(); await child.waitFor({state: 'visible'});
      await page.locator('#confirm-local-dsh').click(); await child.waitFor({state: 'hidden'}); await row().waitFor({state: 'visible'});
      assert.equal(writes, 1); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + codex.label, exact: true}).getAttribute('aria-pressed'), 'true');
      await row().getByRole('button', {name: dsh.label + ' 详情', exact: true}).click(); await detail().waitFor({state: 'visible'});
      await detail().getByText('桌面后台生成', {exact: true}).waitFor({state: 'visible'});
      await detail().getByRole('button', {name: /配置与运行信息$/u}).click(); await detail().getByText('max', {exact: true}).waitFor({state: 'visible'});
      assert.equal(await detail().getByText(/独立服务按需启动/u).count(), 0); await capture(page, 'dsh-desktop-current-config.png');
      await detail().getByRole('button', {name: '重新检查接入', exact: true}).click();
      const check = page.getByRole('dialog', {name: '检查 DSH 接入', exact: true}); await check.waitFor({state: 'visible'}); await check.locator('[data-dsh-candidate]').waitFor({state: 'visible'});
      await page.locator('#confirm-local-dsh').click(); await check.waitFor({state: 'hidden'}); assert.equal(writes, 2);
      assert.equal(await row().getByRole('button', {name: '设为默认智能体 ' + dsh.label, exact: true}).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute('**/api/v1/app/agents**', handler); await page.unroute('**/api/v1/app/dsh/connections', connections);}
  });

  await t.test('DSH离线和移除失败不改变登记，丢失成功响应只读取核对且不改选Codex默认', async () => {
    let removed = false, mode = 'busy', posts = 0;
    const registry = () => ({revision: removed ? 'removed-dsh' : 'registered-dsh', defaultAgentId: removed ? null : dsh.id, agents: removed ? [codex] : [codex, dsh]});
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/app/agents') return route.fulfill({json: registry()});
      if (url.pathname.endsWith('/dsh/discovery')) return route.fulfill({json: {revision: 'offline-discovery', candidates: [{...candidate, registeredAgentId: dsh.id, desktopAvailable: false, generationAvailability: 'unavailable', safeReason: 'DSH桌面暂不可用。'}]}});
      if (url.pathname.endsWith('/dsh/remove')) {
        posts++; assert.deepEqual(route.request().postDataJSON(), {agentId: dsh.id, expectedRevision: 'registered-dsh'});
        if (mode === 'busy') return route.fulfill({status: 409, json: {error: {code: 'agent_busy', message: 'DSH正在生成，请稍后移除。'}}});
        removed = true; return route.abort('connectionfailed');
      }
      return route.continue();
    };
    const connections = (route: any) => route.fulfill({json: {connections: [{...desktopConnection, status: removed ? 'disconnected' : 'unavailable', safeReason: 'DSH桌面暂不可用。'}]}});
    expectedBrowserErrors.add(origin + '/api/v1/app/agents/dsh/remove');
    await page.route('**/api/v1/app/agents**', handler); await page.route('**/api/v1/app/dsh/connections', connections);
    try {
      await openRegistry(); await row().getByRole('button', {name: dsh.label + ' 详情', exact: true}).click(); await detail().waitFor({state: 'visible'});
      await detail().getByRole('button', {name: '重新检查接入', exact: true}).click(); const check = page.getByRole('dialog', {name: '检查 DSH 接入', exact: true}); await check.waitFor({state: 'visible'});
      await check.getByText('DSH桌面暂不可用。', {exact: true}).waitFor({state: 'visible'}); assert.equal(await page.locator('#confirm-local-dsh').isDisabled(), true); await page.locator('#cancel-local-dsh').click(); assert.equal(posts, 0);
      await page.locator('#remove-dsh-entry').click(); const dialog = page.getByRole('dialog', {name: '移除 DSH 接入？', exact: true}); await dialog.waitFor({state: 'visible'});
      await dialog.getByText(/DSH 桌面继续运行/u).waitFor({state: 'visible'}); await page.locator('#confirm-remove-dsh').click(); await dialog.getByText('DSH正在生成，请稍后移除。', {exact: true}).waitFor({state: 'visible'}); assert.equal(posts, 1);
      mode = 'unknown-removed'; await page.locator('#confirm-remove-dsh').click(); await dialog.waitFor({state: 'hidden'}); await row().waitFor({state: 'hidden'}); assert.equal(posts, 2);
      assert.equal(await parent().getByText('默认', {exact: true}).count(), 0); assert.equal(await parent().getByRole('button', {name: '设为默认智能体 ' + codex.label, exact: true}).getAttribute('aria-pressed'), 'false');
      await page.locator('#refresh-agent-registry').click(); assert.equal(posts, 2); await capture(page, 'dsh-removal-reconciled.png'); await page.getByRole('button', {name: '关闭智能体', exact: true}).click();
    } finally {await page.unroute('**/api/v1/app/agents**', handler); await page.unroute('**/api/v1/app/dsh/connections', connections);}
  });

  await t.test('混合任务会话准确打开DSH、保留Codex深链，局部诊断保留旧DSH关系并按版本解除', async () => {
    const nativeId = '11111111-1111-1111-1111-111111111111', dshId = 'native-dsh-chat';
    let failed = false, mismatched = false, removed = false, opens = 0, unlinks = 0;
    let codexRelation = {provider: 'codex', id: 'shared-relation-id', workspaceId, taskId, connectionId: 'codex-scope', nativeSessionId: nativeId, createdAt: '2026-10-13T00:00:00Z', revision: 'codex-edge-v1', sessionUrl: 'codex://threads/' + nativeId, taskUrl: `${new URL(workspaceUrl).pathname}/codex#/tasks/${taskId}`};
    const dshRelation = {...codexRelation, provider: 'dsh', connectionId: 'dsh-scope', nativeSessionId: dshId, revision: 'dsh-edge-v1', sessionUrl: null};
    const response = () => ({workspaceId, relations: [codexRelation, ...(!failed && !removed ? [dshRelation] : [])], diagnostics: failed ? [{provider: 'dsh', code: 'dsh_relations_unavailable', message: 'DSH关系暂不可读取。'}] : []});
    const pattern = '**/api/v1/workspaces/*/agent-sessions**';
    const handler = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/open')) {opens++; assert.deepEqual(route.request().postDataJSON(), {provider: 'dsh', relationId: dshRelation.id, expectedRevision: dshRelation.revision}); return route.fulfill({json: {provider: 'dsh', opened: true, nativeSessionId: mismatched ? 'another-chat' : dshId}});}
      if (url.pathname.endsWith('/unlink')) {unlinks++; assert.deepEqual(route.request().postDataJSON(), {provider: 'dsh', relationId: dshRelation.id, expectedRevision: dshRelation.revision}); removed = true; return route.fulfill({json: {...response(), relations: [codexRelation, {...codexRelation, id: 'another-task-edge', taskId: 'another-task'}]}});}
      return route.fulfill({json: response()});
    };
    const section = () => page.locator('[data-task-agent-sessions="' + taskId + '"]:visible');
    const panel = () => page.getByRole('dialog', {name: '智能体会话关联', exact: true});
    await page.route(pattern, handler);
    try {
      await page.goto(`${workspaceUrl}/tasks/${taskId}`); await section().getByText(' · 2', {exact: true}).waitFor({state: 'visible'}); await section().locator('#task-codex-manage').click(); await panel().waitFor({state: 'visible'});
      const dshRow = () => panel().locator('[data-dsh-session="' + dshId + '"]');
      assert.equal(await panel().locator('[data-codex-session="' + nativeId + '"] a').getAttribute('href'), 'codex://threads/' + nativeId); assert.equal(await dshRow().locator('a').count(), 0);
      await dshRow().getByRole('button', {name: '打开会话', exact: true}).click(); await panel().getByText('已打开所选 DSH 会话。', {exact: true}).waitFor({state: 'visible'}); assert.equal(opens, 1);
      mismatched = true; await dshRow().getByRole('button', {name: '打开会话', exact: true}).click(); await panel().getByText(/未能确认已打开所选 DSH 会话/u).waitFor({state: 'visible'}); assert.equal(opens, 2);
      const refreshedCodexId = '22222222-2222-2222-2222-222222222222';
      codexRelation = {...codexRelation, nativeSessionId: refreshedCodexId, revision: 'codex-edge-v2', sessionUrl: 'codex://threads/' + refreshedCodexId};
      failed = true; await panel().getByRole('button', {name: '刷新会话关联', exact: true}).click(); await section().getByText(' · 部分未确认', {exact: true}).waitFor({state: 'visible'});
      await dshRow().getByText(/上次读取/u).waitFor({state: 'visible'}); await panel().getByText('DSH：DSH关系暂不可读取。', {exact: true}).waitFor({state: 'visible'}); assert.equal(await panel().locator('[data-codex-session]').count(), 1);
      assert.equal(await panel().locator('[data-codex-session] a').getAttribute('href'), 'codex://threads/' + refreshedCodexId, '成功提供者使用本次关系而非旧快照');
      for (const width of [1280, 390]) {
        await page.setViewportSize({width, height: 900});
        try {
          await waitForTaskSessionPopover(page);
          const box = await page.locator('.task-codex-popover:visible').boundingBox();
          assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1);
        } catch (error) { await reportAgentUiFailure(page, `dsh-mixed-sessions-${width}`); throw error; }
        await capture(page, 'dsh-mixed-sessions-' + width + '.png');
      }
      await page.setViewportSize({width: 1280, height: 900}); await dshRow().getByRole('button', {name: '解除关联', exact: true}).click(); await dshRow().waitFor({state: 'hidden'}); assert.equal(unlinks, 1); assert.equal(await panel().locator('[data-codex-session]').count(), 1, '解除返回整空间其他任务时只显示当前任务');
      await panel().getByRole('button', {name: '关闭会话关联', exact: true}).click(); await panel().waitFor({state: 'hidden'}); assert.equal(await section().getByRole('link', {name: '打开会话', exact: true}).getAttribute('href'), 'codex://threads/' + refreshedCodexId);
    } finally {await page.setViewportSize({width: 1280, height: 900}); await page.unroute(pattern, handler);}
  });
}
