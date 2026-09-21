import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Page, Request } from 'playwright-core';

type WorkbenchJourney = {
  t: TestContext;
  page: Page;
  runtime: any;
  workspaceRoot: string;
  otherWorkspaceRoot: string;
  workspaceUrl: string;
  otherWorkspaceUrl: string;
  expectedBrowserErrors: Set<string>;
  selectAntdOption(page: Page, id: string, text: string): Promise<unknown>;
  capture(page: Page, name: string): Promise<unknown>;
};

export async function runWorkbenchJourney({ t, page, runtime, workspaceRoot, otherWorkspaceRoot, workspaceUrl, otherWorkspaceUrl, expectedBrowserErrors, selectAntdOption, capture }: WorkbenchJourney): Promise<void> {
  const workspacePath = new URL(workspaceUrl).pathname;
  const apiBase = `${new URL(workspaceUrl).origin}/api/v1${workspacePath}`;
  const crossId = 'workbench-cross-project';
  const nextId = 'workbench-next';
  const crossTitle = '工作台跨项目目标';
  const nextTitle = '工作台准备推进目标';
  runtime.createTask(workspaceRoot, { taskId: crossId, title: crossTitle, intent: '请查看 [工作台关联资料](projects/demo/docs/workbench-reference.md)。', status: 'active', projects: ['demo', 'other'], services: [], changes: [] });
  runtime.createTask(workspaceRoot, { taskId: nextId, title: nextTitle, intent: '准备下一项真实工作。', status: 'todo', projects: ['demo'], services: [], changes: [] });
  runtime.createTask(workspaceRoot, { taskId: 'workbench-other', title: '另一个项目的未安排目标', intent: '跨项目筛选边界。', status: 'todo', projects: ['other'], services: [], changes: [] });
  const documentPath = path.join(workspaceRoot, 'projects/demo/docs/workbench-reference.md');
  fs.mkdirSync(path.dirname(documentPath), { recursive: true });
  fs.writeFileSync(documentPath, '# 工作台关联资料\n\n这是当前项目的真实文件内容，用于接续目标并阅读成果。\n');
  runtime.recordProjectDailyProgress(workspaceRoot, {
    project: 'other', date: '2026-09-19', payload: {
      daySummary: { added: '工作台浏览器场景中的真实每日摘要。', updated: '调整项目入口。', deleted: '无删除。', drawbacks: '只覆盖明确提交，不包含未提交内容。' },
      commits: [
        { sha: 'acb1234', subject: '登记工作台浏览器场景。', authorName: 'Browser Fixture', authorEmail: 'fixture@example.com', authorship: 'self', taskIds: [crossId] },
        { sha: 'bca5678', subject: '协作者补充项目入口。', authorName: 'Collaborator Fixture', authorEmail: 'collaborator@example.com', authorship: 'other', taskIds: [] },
      ],
      files: [{ path: 'README.md', kind: 'modified' }],
    },
  });
  await page.goto(`${workspaceUrl}/overview`);
  const session = await page.locator('meta[name="buildr-session"]').getAttribute('content');
  assert.ok(session);
  const headers = { origin: new URL(workspaceUrl).origin, 'x-buildr-session': session, 'content-type': 'application/json' };
  const put = async (suffix: string, data: unknown) => {
    const response = await page.request.put(`${apiBase}${suffix}`, { headers, data });
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const read = async (suffix: string) => {
    const response = await page.request.get(`${apiBase}${suffix}`);
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const projects = (await read('/projects')).projects as Array<{ code: string; name: string }>;
  const demoProject = projects.find(project => project.code === 'demo');
  const otherProject = projects.find(project => project.code === 'other');
  assert.ok(demoProject && otherProject, '工作台场景依赖两个已登记项目');
  // The full project journey may have renamed these shared fixtures already.
  const demoProjectName = demoProject.name;
  const otherProjectName = otherProject.name;
  const originalRecord = runtime.inspectTask(workspaceRoot, crossId);
  await put(`/tasks/${crossId}/work-context`, {
    expectedContextDigest: 'absent', progress: '已经梳理两项关联项目的当前资料。', nextStep: '根据本次回应继续实施。',
    attention: { kind: 'decision', reason: '请确认两项项目采用同一工作方向。' },
  });
  await put('/workbench/preferences/saved-resource/project-demo', { label: '收藏的演示项目', href: `${workspacePath}/projects/demo` });

  await t.test('工作概览读取显式事项、真实项目变化，并在各项目范围内去重', async () => {
    await page.goto(workspaceUrl);
    await page.waitForURL(`${workspaceUrl}/overview`);
    await page.locator(`[data-attention-task="${crossId}"]`).waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('.shell-navigation [data-nav]').allTextContents(), ['概览', '任务', '动态']);
    assert.equal(await page.locator('#workbench-attention [data-attention-task]').count(), 1, '只有明确登记的事项进入等我回应');
    assert.equal(await page.locator('#workbench-attention').getByRole('heading', { name: /等我回应/ }).count(), 1);
    assert.match(await page.locator('#workbench-attention').innerText(), /决定、验收或补充信息/);
    assert.match(await page.locator('#workbench-attention').innerText(), /请确认两项项目采用同一工作方向/);
    assert.equal(await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).count(), 1);
    assert.match(await page.locator('#workbench-daily-progress').innerText(), /工作台浏览器场景中的真实每日摘要/);
    assert.match(await page.locator('#workbench-daily-progress').innerText(), /2026-09-19/);
    for (const project of [demoProjectName, otherProjectName]) {
      await selectAntdOption(page, 'workbench-project-filter', project);
      await page.locator(`[data-attention-task="${crossId}"]`).waitFor({ state: 'visible' });
      assert.equal(await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).count(), 1);
    }
    await selectAntdOption(page, 'workbench-project-filter', '全部项目');
    await page.locator('#workbench-resources').getByRole('link').filter({ hasText: '收藏的演示项目' }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.locator('#project-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#project-detail-name').innerText(), demoProjectName);
  });

  await t.test('人的回应保存到同一工作摘要并移出事项，任务记录保持不变', async () => {
    await page.goto(`${workspaceUrl}/overview`);
    await page.locator(`[data-attention-task="${crossId}"]`).getByRole('link', { name: crossTitle, exact: true }).click();
    await page.locator('#task-detail-id').filter({ hasText: crossId }).waitFor({ state: 'visible' });
    await page.locator('#task-work-context').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-work-context').innerText(), /已经梳理两项关联项目的当前资料/);
    await page.locator('#task-attention-respond').click();
    await page.locator('#task-attention-response-input').fill('确认按共同方向推进，保留各自资料来源。');
    const beforeResponse = await read(`/tasks/${crossId}/work-context`);
    await put(`/tasks/${crossId}/work-context`, { expectedContextDigest: beforeResponse.contextDigest, progress: '其他入口刚补充了最新进展。', nextStep: '核对更新后继续回应。' });
    expectedBrowserErrors.add(`${apiBase}/tasks/${crossId}/work-context/respond`);
    const conflictResponse = page.waitForResponse(response => response.url() === `${apiBase}/tasks/${crossId}/work-context/respond` && response.request().method() === 'POST');
    await page.locator('#task-context-save').click();
    assert.equal((await conflictResponse).status(), 409);
    await page.locator('#task-context-reread').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-attention-response-input').inputValue(), '确认按共同方向推进，保留各自资料来源。');
    assert.equal((await read(`/tasks/${crossId}/work-context`)).context.attention.state, 'pending');
    await page.locator('#task-context-reread').click();
    await page.locator('#task-context-reread').waitFor({ state: 'hidden' });
    await page.locator('#task-context-save').click();
    await page.locator('#task-attention-response').waitFor({ state: 'visible' });
    const current = await read(`/tasks/${crossId}/work-context`);
    assert.equal(current.context.attention.state, 'resolved');
    assert.equal(current.context.attention.response.text, '确认按共同方向推进，保留各自资料来源。');
    assert.equal(runtime.inspectTask(workspaceRoot, crossId).recordDigest, originalRecord.recordDigest);
    await page.goto(`${workspaceUrl}/overview`);
    await page.locator('#workbench-attention').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workbench-attention [data-attention-task]').count(), 0);
    assert.match(await page.locator('#workbench-attention').innerText(), /没有|暂无/);
    assert.match(await page.locator('#workbench-attention').innerText(), /决定、验收或补充信息/);
    const emptyAttention = await page.locator('#workbench-attention').boundingBox();
    assert.ok(emptyAttention && emptyAttention.height <= 100, '没有待回应事项时应紧凑呈现，不保留大块空卡片');
    const emptyStatus = await page.locator('#workbench-attention [role="status"]').boundingBox();
    assert.ok(emptyStatus && emptyStatus.height <= 40, '空态应是一行状态说明');
  });

  await t.test('任务抽屉随缓存页隐藏，浏览器前进恢复未保存草稿', async () => {
    await page.goto(`${workspaceUrl}/overview`);
    await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).getByRole('link', { name: crossTitle, exact: true }).click();
    await page.locator('#task-detail-id').filter({ hasText: crossId }).waitFor({ state: 'visible' });
    await page.locator('#task-more-actions').click(); await page.locator('#task-edit-action').click();
    await page.locator('#task-edit-title').fill('浏览器返回时保留的任务进展草稿');
    await page.goBack();
    await page.waitForURL(`${workspaceUrl}/overview`, { timeout: 10000 });
    await page.locator('#task-edit-title').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('dialog').count(), 0, '隐藏任务页不得保留可见的维护对话框');
    await page.locator('#workbench-attention').click({ trial: true });
    await page.goForward();
    await page.locator('#task-edit-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-edit-title').inputValue(), '浏览器返回时保留的任务进展草稿');
    await page.locator('#task-edit-title').press('Escape');
    assert.notEqual(runtime.inspectTask(workspaceRoot, crossId).record.title, '浏览器返回时保留的任务进展草稿', '关闭保留中的草稿不会写入任务');
  });

  await t.test('历史每日演进从概览和动态进入同一详情，日期与分组可刷新并随任务返回', async () => {
    const progressPath = path.join(workspaceRoot, '.buildr/daily-progress/other/2026-09-19.yml');
    const savedProgress = fs.readFileSync(progressPath, 'utf8');
    await page.goto(`${workspaceUrl}/overview?project=other`);
    await page.locator('#workbench-daily-progress').getByRole('link', { name: /查看每日演进/ }).click();
    await page.waitForURL(current => current.pathname === `${workspacePath}/activity` && current.searchParams.get('project') === 'other' && current.searchParams.get('date') === '2026-09-19');
    await page.locator('[data-progress-item="acb1234"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#progress-date').inputValue(), '2026-09-19', '历史摘要不能退回今天');
    assert.equal(await page.locator('#progress-body [data-progress-item]').count(), 2);
    assert.match(await page.locator('#progress-body').innerText(), /工作台浏览器场景中的真实每日摘要/);
    assert.equal(await page.locator('[data-nav="activity"]').evaluate((element: HTMLElement) => element.classList.contains('active')), true);
    assert.equal(await page.locator('.pane-right #progress-body').count(), 0, '完整详情属于动态页');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '每日演进完整详情在窄屏不横向溢出');
    await capture(page, 'workbench-daily-progress-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.locator('[data-group="person"]').click();
    await page.waitForURL(current => current.searchParams.get('group') === 'person');
    await page.locator('#progress-body .progress-group').getByRole('heading', { name: /Collaborator Fixture/ }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#progress-body [data-progress-item]').count(), 2, '按人保留自己的与他人的提交');
    await page.locator('[data-group="task"]').click();
    await page.waitForURL(current => current.searchParams.get('group') === 'task');
    await page.locator('#progress-body .progress-group').getByRole('heading', { name: new RegExp(crossTitle) }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#progress-body [data-progress-item]').count(), 1, '按任务只聚合已关联的自己的提交');
    const taskGroupUrl = page.url();
    await page.reload();
    await page.locator('[data-group="task"][aria-pressed="true"]').waitFor({ state: 'visible' });
    await page.locator('[data-progress-item="acb1234"]').waitFor({ state: 'visible' });
    assert.equal(page.url(), taskGroupUrl);
    assert.equal(await page.locator('#progress-date').inputValue(), '2026-09-19');

    await page.locator('#activity-generate-button').click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    const prompt = await page.locator('#action-prompt-output').inputValue();
    assert.match(prompt, /--project other/);
    assert.match(prompt, /--date 2026-09-19/);
    assert.equal(fs.readFileSync(progressPath, 'utf8'), savedProgress, '生成入口只准备指令，不写演进文件');
    await page.locator('#close-agent-action').click();
    await page.locator('[data-progress-item="acb1234"]').getByRole('link').filter({ hasText: crossTitle }).click();
    await page.locator('#task-detail-id').filter({ hasText: crossId }).waitFor({ state: 'visible' });
    await page.goBack();
    await page.waitForURL(taskGroupUrl, { timeout: 10000 });
    await page.locator('[data-progress-item="acb1234"]').waitFor({ state: 'visible' });

    await page.locator('#workbench-activity').getByRole('button', { name: '后一天', exact: true }).click();
    await page.waitForURL(current => current.searchParams.get('date') === '2026-09-20');
    await page.locator('#daily-progress-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#progress-body [data-progress-item]').count(), 0, '空日期不能残留上一日提交');
    await page.locator('#empty-agent-action').click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /--project other --date 2026-09-20/);
    await page.locator('#close-agent-action').click();
    await page.locator('#workbench-activity').getByRole('button', { name: '前一天', exact: true }).click();
    await page.waitForURL(taskGroupUrl);
    await page.locator('[data-progress-item="acb1234"]').waitFor({ state: 'visible' });
    await page.locator('#activity-latest-button').click();
    await page.waitForURL(current => current.pathname === `${workspacePath}/activity` && current.searchParams.get('project') === 'other' && !current.searchParams.has('date') && !current.searchParams.has('group'));
    await page.locator('#workbench-daily-progress').getByRole('link', { name: /查看每日演进/ }).click();
    await page.waitForURL(current => current.searchParams.get('project') === 'other' && current.searchParams.get('date') === '2026-09-19');
    await page.locator('[data-progress-item="bca5678"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-group="day"]').getAttribute('aria-pressed'), 'true');
  });

  await t.test('旧项目每日演进链接保留项目日期和分组，缺省日期按本机今天转换', async () => {
    await page.goto(`${workspaceUrl}/projects/other?document=daily&date=2026-09-19&group=person`);
    await page.waitForURL(current => current.pathname === `${workspacePath}/activity` && current.searchParams.get('project') === 'other' && current.searchParams.get('date') === '2026-09-19' && current.searchParams.get('group') === 'person');
    await page.locator('[data-progress-item="bca5678"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#progress-date').inputValue(), '2026-09-19');
    assert.equal(await page.locator('[data-group="person"]').getAttribute('aria-pressed'), 'true');
    assert.equal(new URL(page.url()).searchParams.has('document'), false);
    const today = await page.evaluate(() => {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    await page.goto(`${workspaceUrl}/projects/other?document=daily`);
    await page.waitForURL(current => current.pathname === `${workspacePath}/activity` && current.searchParams.get('project') === 'other' && current.searchParams.get('date') === today);
    assert.equal(await page.locator('#progress-date').inputValue(), today);

    await page.goto(`${workspaceUrl}/projects/other?document=daily&date=2026-09-19&group=person`);
    await page.waitForURL(current => current.pathname === `${workspacePath}/activity` && current.searchParams.get('project') === 'other' && current.searchParams.get('date') === '2026-09-19' && current.searchParams.get('group') === 'person');
    await page.locator('[data-progress-item="bca5678"]').waitFor({ state: 'visible' });
    await page.locator('[data-area="workspace"]').click();
    await page.waitForURL(`${workspaceUrl}/projects/other`);
    await page.locator('#project-activity-link').waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/projects/other`, '切回工作空间不能恢复已迁移的每日演进查询参数');
    assert.equal(await page.locator('#project-detail-name').innerText(), otherProjectName);
    await page.reload();
    await page.locator('#project-activity-link').waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/projects/other`, '项目主页刷新后不能再次跳回动态');
    assert.equal(await page.locator('#workbench-activity').count(), 0);
    await page.locator('[data-area="workbench"]').click();
    await page.waitForURL(`${workspaceUrl}/overview`);
    await page.locator('[data-nav="activity"]').click();
    await page.waitForURL(`${workspaceUrl}/activity`);
    await page.locator('#workbench-activity').waitFor({ state: 'visible' });
  });

  await t.test('逐项偏好由真实界面保存，刷新后恢复且不改变任务状态', async () => {
    await page.goto(`${workspaceUrl}/overview`);
    await page.getByRole('button', { name: `置顶：${crossTitle}`, exact: true }).click();
    await page.getByRole('button', { name: `取消置顶：${crossTitle}`, exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: `关注：${demoProjectName}`, exact: true }).click();
    await page.getByRole('button', { name: `取消关注：${demoProjectName}`, exact: true }).waitFor({ state: 'visible' });
    const initialPreferencesRead = page.waitForResponse(response => response.request().method() === 'GET' && response.url().endsWith('/workbench/preferences'));
    await page.goto(`${workspaceUrl}/tasks/${nextId}`);
    await initialPreferencesRead;
    let preferenceReadsAfterWrite = 0;
    const countPreferenceReads = (request: any) => { if (request.method() === 'GET' && request.url().endsWith('/workbench/preferences')) preferenceReadsAfterWrite++; };
    page.on('request', countPreferenceReads);
    await page.locator('#task-more-actions').click();
    await page.locator('#task-plan-next').click();
    await page.locator('#task-more-actions').click();
    await page.locator('#task-plan-next').filter({ hasText: '移出接下来' }).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    page.off('request', countPreferenceReads);
    assert.equal(preferenceReadsAfterWrite, 0, '偏好写入直接采用权威响应，不再重复GET读取');
    assert.equal(await page.getByRole('button', {name:'收藏当前资料',exact:true}).count(),0, '任务详情只保留一种任务组织方式，不重复收藏');
    await page.reload();
    await page.locator('#task-more-actions').click();
    await page.locator('#task-plan-next').filter({hasText:'移出接下来'}).waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    const preferences = await read('/workbench/preferences');
    for (const [kind, key] of [['pinned-task', crossId], ['planned-task', nextId], ['followed-project', 'demo'], ['recent-resource', `task:${nextId}`]]) {
      assert.ok(preferences.items.some((item: { kind: string; key: string }) => item.kind === kind && item.key === key), `${kind}/${key} 已持久保存`);
    }
    assert.equal(runtime.inspectTask(workspaceRoot, nextId).record.status, 'todo');
    assert.equal(runtime.inspectTask(workspaceRoot, crossId).recordDigest, originalRecord.recordDigest);
    await page.goto(`${workspaceUrl}/overview`);
    await page.getByRole('button', { name: `取消置顶：${crossTitle}`, exact: true }).waitFor({ state: 'visible' });
    const plannedLink = page.locator(`#workbench-planned a[href="${workspacePath}/tasks/${nextId}"]`);
    await plannedLink.waitFor({ state: 'visible' });
    assert.equal(await plannedLink.innerText(), nextTitle);
    await page.locator('#workbench-resources').getByText('最近打开', {exact:true}).click();
    await page.locator('#workbench-resources').getByRole('link').filter({ hasText: nextTitle }).waitFor({ state: 'visible' });
    await page.locator('#workbench-resources').getByRole('button', {name:`收藏：${nextTitle}`, exact:true}).click();
    await page.locator('#workbench-resources').getByRole('button', {name:`取消收藏：${nextTitle}`, exact:true}).waitFor({state:'visible'});
    await page.locator('#workbench-resources').getByText('已收藏', {exact:true}).click();
    await page.locator('#workbench-resources').getByRole('link').filter({ hasText: nextTitle }).waitFor({ state: 'visible' });
    assert.equal(await page.locator(`.workbench-followed-navigation a[href="${workspacePath}/projects/demo"]`).innerText(), demoProjectName);
  });

  await t.test('完整任务列表按项目分组不重复，打开资料后返回原筛选', async () => {
    await page.goto(`${workspaceUrl}/tasks?status=open&project=demo&group=project&q=工作台`);
    const crossRow = page.locator(`#task-table-body [data-task-id="${crossId}"]`);
    await crossRow.waitFor({ state: 'visible' });
    assert.equal(await crossRow.count(), 1);
    assert.equal(await page.locator('#task-detail-main').count(), 0);
    assert.match(await page.locator('#task-table-body').innerText(), /跨项目工作/);
    const listUrl = page.url();
    await crossRow.click();
    await page.locator('#task-detail-id').filter({ hasText: crossId }).waitFor({ state: 'visible' });
    assert.equal(page.url(), listUrl, '任务副屏保持列表筛选 URL');
    assert.equal(await crossRow.isVisible(), true, '副屏打开时列表仍在主屏');
    assert.equal(await page.locator('.pane-stage:visible').count(), 1);
    assert.equal(await page.locator('.pane-right:visible').count(), 1);
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#task-node-content').innerText(), /暂无补充需求或说明/);
    await page.locator('#task-detail-intent').getByRole('link', { name: '工作台关联资料', exact: true }).click();
    await page.locator('.task-document-preview-content').getByText('这是当前项目的真实文件内容，用于接续目标并阅读成果。', { exact: true }).waitFor({ state: 'visible' });
    const mainBox = await page.locator('.pane-left').boundingBox();
    const readerBox = await page.locator('.pane-right').boundingBox();
    assert.ok(mainBox && readerBox && readerBox.x >= mainBox.x + mainBox.width - 1, '桌面保留任务列表，资料在同一副屏内阅读');
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '打开相关文档不得增加嵌套分屏');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#task-document-close').click();
    await page.locator('#task-document-preview').waitFor({ state: 'hidden' });
    await page.locator('#task-node-content').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('button', {name:'关闭 任务详情', exact:true}).click();
    await page.waitForURL(listUrl);
    await crossRow.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-filter-q').inputValue(), '工作台');
    assert.equal(await page.locator('#task-group-toggle').innerText(), '按项目分组');
    assert.equal(await page.locator('#task-detail-main').count(), 0);
    await page.reload();
    await crossRow.waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).searchParams.get('project'), 'demo');
  });

  await t.test('任务列表刷新保留筛选和内容，同时读取其他入口更新的任务与进展', async () => {
    const id = 'workbench-refresh';
    runtime.createTask(workspaceRoot, { taskId: id, title: '刷新回归原有目标', intent: '验证列表刷新。', status: 'todo', projects: ['demo'], services: [], changes: [] });
    runtime.recordTaskWorkContext(workspaceRoot, id, { expectedContextDigest: 'absent', progress: '刷新前的进展。', nextStep: '继续检查。' });
    await page.goto(`${workspaceUrl}/tasks?status=todo&project=demo&q=刷新回归`);
    const row = page.locator(`#task-table-body [data-task-id="${id}"]`);
    await row.getByText('刷新前的进展。', { exact: true }).waitFor({ state: 'visible' });
    const listUrl = page.url();
    runtime.updateTask(workspaceRoot, id, { expectedRecordDigest: runtime.inspectTask(workspaceRoot, id).recordDigest, title: '刷新回归已更新目标' });
    runtime.recordTaskWorkContext(workspaceRoot, id, { expectedContextDigest: runtime.inspectTaskWorkContext(workspaceRoot, id).contextDigest, progress: '其他入口已更新最近进展。', nextStep: '查看更新。' });
    const endpoint = new URL(`${apiBase}/tasks`).pathname;
    const matches = (url: URL) => url.pathname === endpoint;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let reads = 0;
    await page.route(matches, async route => { reads++; const response = await route.fetch(); await held; await route.fulfill({ response }); });
    try {
      const requested = page.waitForRequest(request => new URL(request.url()).pathname === endpoint);
      await page.getByRole('button', { name: '刷新任务列表', exact: true }).click();
      await requested;
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
      await row.getByText('刷新前的进展。', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(page.url(), listUrl, '刷新不能重置筛选');
      await page.waitForTimeout(100);
      assert.equal(reads, 1, '手动与焦点刷新共享同一次在途读取');
      release();
      await row.getByText('刷新回归已更新目标', { exact: true }).waitFor({ state: 'visible' });
      await row.getByText('其他入口已更新最近进展。', { exact: true }).waitFor({ state: 'visible' });
    } finally { release(); await page.unroute(matches); }

    runtime.recordTaskWorkContext(workspaceRoot, id, { expectedContextDigest: runtime.inspectTaskWorkContext(workspaceRoot, id).contextDigest, progress: '重新回到页面时读取的进展。', nextStep: '继续。' });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await row.getByText('重新回到页面时读取的进展。', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(page.url(), listUrl);
    await page.route(matches, async route => {
      expectedBrowserErrors.add(route.request().url());
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '刷新回归中的临时读取失败。' } }) });
    });
    try {
      await page.getByRole('button', { name: '刷新任务列表', exact: true }).click();
      await page.getByText('刷新回归中的临时读取失败。', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(await row.isVisible(), true, '刷新失败不能隐藏已有内容');
      assert.equal(await page.getByRole('button', { name: /^重\s*试$/ }).isVisible(), true);
      assert.equal(page.url(), listUrl);
    } finally { await page.unroute(matches); }
    // Focus refresh may already recover the error after the failure route is removed.
    await page.getByRole('button', { name: '刷新任务列表', exact: true }).click();
    await page.getByText('刷新回归中的临时读取失败。', { exact: true }).waitFor({ state: 'hidden' });
    await row.getByText('重新回到页面时读取的进展。', { exact: true }).waitFor({ state: 'visible' });
  });

  await t.test('概览和个人关注在重复焦点与手动刷新时不取消同范围请求', async () => {
    const overviewPath = new URL(`${apiBase}/workbench`).pathname;
    const initialReads = Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === overviewPath),
      page.waitForResponse(response => new URL(response.url()).pathname === `${overviewPath}/preferences`),
    ]);
    await page.goto(`${workspaceUrl}/overview`);
    await initialReads;
    await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).waitFor({ state: 'visible' });
    const matches = (url: URL) => url.pathname === overviewPath || url.pathname === `${overviewPath}/preferences`;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const reads: string[] = [], failures: string[] = [];
    const failed = (request: Request) => { if (matches(new URL(request.url()))) failures.push(request.failure()?.errorText || 'request failed'); };
    page.on('requestfailed', failed);
    await page.route(matches, async route => { reads.push(new URL(route.request().url()).pathname); const response = await route.fetch(); await held; await route.fulfill({ response }); });
    try {
      const requested = page.waitForRequest(request => new URL(request.url()).pathname === overviewPath);
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
      await requested;
      assert.equal(await page.getByRole('button', { name: '刷新工作概览', exact: true }).isDisabled(), true, '读取期间页面刷新禁用，不能重复提交');
      await page.waitForTimeout(100);
      assert.equal(reads.filter(url => url === overviewPath).length, 1);
      assert.equal(reads.filter(url => url === `${overviewPath}/preferences`).length, 1);
      assert.deepEqual(failures, [], '相同范围的并发刷新不能制造取消错误');
      const completed = page.waitForResponse(response => new URL(response.url()).pathname === overviewPath);
      release();
      assert.equal((await completed).status(), 200);
    } finally { release(); await page.unroute(matches); page.off('requestfailed', failed); }
  });

  await t.test('接续指令读取最新答复，终态只准备新目标而不重开任务', async () => {
    await page.goto(`${workspaceUrl}/tasks/${crossId}`);
    await page.locator('#task-more-actions').click(); await page.locator('#task-continue').click();
    await page.locator('#task-continue-prepare').click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    const prompt = await page.locator('#action-prompt-output').inputValue();
    assert.match(prompt, /workbench-cross-project/);
    assert.match(prompt, /其他入口刚补充了最新进展/);
    assert.match(prompt, /确认按共同方向推进，保留各自资料来源/);
    await page.locator('#close-agent-action').click();
    const ended = runtime.createTask(workspaceRoot, { taskId: 'workbench-finished', title: '工作台已有成果', intent: '交接新目标边界。', projects: ['demo'], services: [], changes: [] });
    runtime.completeTask(workspaceRoot, 'workbench-finished', { expectedRecordDigest: ended.recordDigest, summary: '已交付可供接续的真实成果。' });
    const before = runtime.inspectTask(workspaceRoot, 'workbench-finished');
    const taskCount = runtime.queryTasks(workspaceRoot, { status: 'all' }).matchingTaskCount;
    await page.goto(`${workspaceUrl}/tasks/workbench-finished`);
    await page.locator('#task-more-actions').click(); await page.locator('#task-continue').filter({ hasText: '基于成果生成新任务指令' }).click();
    await page.locator('#task-continue-goal').fill('基于已有成果，补充下一阶段的目标。');
    await page.locator('#task-continue-prepare').click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /新目标：基于已有成果/);
    assert.match(await page.locator('#action-copy-state').innerText(), /尚未启动执行或创建新的任务记录/);
    assert.equal(runtime.inspectTask(workspaceRoot, 'workbench-finished').recordDigest, before.recordDigest);
    assert.equal(runtime.queryTasks(workspaceRoot, { status: 'all' }).matchingTaskCount, taskCount);
    await page.locator('#close-agent-action').click();
  });

  await t.test('动态局部来源失败可重试，其余内容和真实空态保持可用', async () => {
    const brokenPath = path.join(workspaceRoot, '.buildr/daily-progress/demo/2026-09-19.yml');
    fs.mkdirSync(path.dirname(brokenPath), { recursive: true });
    fs.writeFileSync(brokenPath, 'broken: [invalid yaml\n');
    try {
      await page.goto(`${workspaceUrl}/overview`);
      await page.locator('#workbench-daily-progress').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: '重试项目变化', exact: true }).waitFor({ state: 'visible' });
      assert.match(await page.locator('#workbench-daily-progress').innerText(), /工作台浏览器场景中的真实每日摘要/);
      assert.equal(await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).count(), 1);
      fs.rmSync(brokenPath);
      await page.getByRole('button', { name: '重试项目变化', exact: true }).click();
      await page.getByRole('button', { name: '重试项目变化', exact: true }).waitFor({ state: 'hidden' });
      await page.locator('[data-nav="activity"]').click();
      await page.waitForURL(`${workspaceUrl}/activity`);
      await page.locator('#workbench-activity').waitFor({ state: 'visible' });
      assert.match(await page.locator('#workbench-activity').innerText(), /工作台浏览器场景中的真实每日摘要/);
      await page.goto(`${otherWorkspaceUrl}/overview`);
      await page.locator('#workbench-overview').waitFor({ state: 'visible' });
      await page.locator('#workbench-attention').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-attention-task], [data-workbench-task]').count(), 0);
      assert.doesNotMatch(await page.locator('#workbench-resources').innerText(), /收藏的演示项目/);
      assert.match(await page.locator('#workbench-daily-progress').innerText(), /暂无|尚未|没有/);
    } finally {
      fs.rmSync(brokenPath, { force: true });
    }
  });

  await t.test('单项目概览超过首批时，更多入口保持所选项目范围', async () => {
    for (let index = 0; index < 13; index += 1) {
      const taskId = `workbench-more-${index}`;
      runtime.createTask(workspaceRoot, { taskId, title: `项目范围内的更多事项 ${index}`, intent: '验证超过概览首批后的范围保持。', status: 'todo', projects: ['demo'], services: [], changes: [] });
      runtime.recordTaskWorkContext(workspaceRoot, taskId, { expectedContextDigest: 'absent', progress: '已准备背景资料。', nextStep: '等人确认后推进。', attention: { kind: 'question', reason: `请确认第 ${index} 项内容。` } });
      runtime.putWorkbenchPreference(workspaceRoot, 'planned-task', taskId, {});
    }
    for (const [section, label, status] of [
      ['#workbench-attention', '查看全部任务', 'all'],
      ['#workbench-planned', '更多待办', 'todo'],
      ['.workbench-recent-results', '查看完成记录', 'completed'],
    ]) {
      await page.goto(`${workspaceUrl}/overview?project=demo`);
      const link = page.locator(section).getByRole('link').filter({ hasText: label });
      await link.waitFor({ state: 'visible' });
      if (status === 'all') assert.equal(await page.locator('#workbench-attention [data-attention-task]').count(), 12);
      await link.click();
      await page.waitForURL(current => current.pathname === `${workspacePath}/tasks` && current.searchParams.get('status') === status && current.searchParams.get('project') === 'demo');
      await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#task-table-body [data-task-id="workbench-other"]').count(), 0);
    }
  });

  await t.test('跨工作空间返回关闭旧任务交接，同名任务始终读取当前范围', async () => {
    const other = runtime.createTask(otherWorkspaceRoot, { taskId: crossId, title: '第二工作空间的同名任务', intent: '这是第二个工作空间的独立目标。', projects: [], services: [], changes: [] });
    await page.goto(`${otherWorkspaceUrl}/tasks/${crossId}`);
    await page.locator('#task-detail-title').filter({ hasText: '第二工作空间的同名任务' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '切换工作空间', exact: true }).click();
    await page.getByRole('menuitem', { name: 'browser-smoke', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/overview`);
    await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).getByRole('link', { name: crossTitle, exact: true }).click();
    await page.locator('#task-more-actions').click(); await page.locator('#task-continue').click();
    await page.locator('#task-continue-goal').waitFor({ state: 'visible' });
    await page.goBack();
    await page.waitForURL(`${workspaceUrl}/overview`);
    await page.goBack();
    await page.waitForURL(`${otherWorkspaceUrl}/tasks`);
    await page.locator('#task-detail-title').filter({ hasText: '第二工作空间的同名任务' }).waitFor({ state: 'visible' });
    await page.locator('#task-continue-goal').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#agent-action-drawer').isVisible(), false, '其他工作空间不得保留旧任务交接抽屉');
    await page.locator('#task-more-actions').click(); await page.locator('#task-continue').click();
    await page.locator('#task-continue-prepare').click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    const prompt = await page.locator('#action-prompt-output').inputValue();
    assert.match(prompt, /第二工作空间的同名任务/);
    assert.match(prompt, /这是第二个工作空间的独立目标/);
    assert.doesNotMatch(prompt, /工作台跨项目目标|确认按共同方向推进/);
    assert.equal(runtime.inspectTask(otherWorkspaceRoot, crossId).recordDigest, other.recordDigest);
    assert.equal(runtime.inspectTask(workspaceRoot, crossId).recordDigest, originalRecord.recordDigest);
    await page.locator('#close-agent-action').click();
  });

  await t.test('工作概览在桌面和窄屏可用且不会横向溢出', async () => {
    for (const width of [1680, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${workspaceUrl}/overview`);
      await page.locator(`#workbench-active [data-workbench-task="${crossId}"]`).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${width}px 不应横向溢出`);
      for (const id of ['workbench-attention', 'workbench-active', 'workbench-planned', 'workbench-daily-progress', 'workbench-resources']) {
        const box = await page.locator(`#${id}`).boundingBox();
        assert.ok(box && box.width > 100 && box.x >= 0 && box.x + box.width <= width + 1, `${id} 在 ${width}px 内可读取`);
      }
      await capture(page, `workbench-overview-${width}.png`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
}
