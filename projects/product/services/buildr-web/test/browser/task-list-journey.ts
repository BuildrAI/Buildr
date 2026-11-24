import assert from 'node:assert/strict';

export async function runTaskListJourney({
  applyTaskFilters,
  capture,
  closeTaskReading,
  confirmAntModal,
  fs,
  openTaskActionModal,
  openTaskFilterPanel,
  openTaskSearch,
  otherWorkspaceId,
  page,
  path,
  prepareEvidenceFixture,
  runtime,
  selectAntdOption,
  t,
  url,
  workspaceRoot,
  workspaceUrl,
}: any) {
  prepareEvidenceFixture(runtime, workspaceRoot, 'browser-delivered');
  runtime.completeTask(workspaceRoot, 'browser-delivered', {
    expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-delivered').recordDigest,
    summary: '浏览器交付完成',
  });

  runtime.createTask(workspaceRoot, {
    taskId: 'browser-retro',
    title: '复盘待决定任务',
    intent: '验证终态复盘筛选与决定动作',
    projects: ['demo'],
    services: [],
    changes: [],
  });
  prepareEvidenceFixture(runtime, workspaceRoot, 'browser-retro');
  runtime.completeTask(workspaceRoot, 'browser-retro', {
    expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-retro').recordDigest,
    summary: '复盘任务完成',
  });
  const retrospectivePath = path.join(workspaceRoot, '.buildr/local/task-retrospectives/browser-retro.md');
  fs.mkdirSync(path.dirname(retrospectivePath), { recursive: true });
  fs.writeFileSync(retrospectivePath, '# 执行效率\n\n减少重复读取。\n');
  const retrospectiveDocument = runtime.inspectTaskRetrospectiveDocument(workspaceRoot, 'browser-retro');
  runtime.updateTask(workspaceRoot, 'browser-retro', {
    expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-retro').recordDigest,
    retrospectiveState: 'pending-decision',
    retrospectiveDocumentDigest: retrospectiveDocument.actualDigest,
  });

  await t.test('默认显示未完成任务、区分空工作空间与空筛选文案，并支持复盘筛选查看终态任务', async () => {
    const defaultTaskCount = runtime.queryTasks(workspaceRoot, { status: 'open' }).matchingTaskCount;
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-body tr.ant-table-row').first().waitFor({ state: 'visible' });
    await page.waitForFunction((count: number) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    assert.equal(await page.locator('#task-detail-id').count(), 0, '列表页不自动打开右侧详情');

    await openTaskSearch(page);
    await page.locator('#task-filter-q').fill('绝对不会命中的任务');
    await page.locator('#task-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-empty').innerText(), /当前筛选没有匹配任务/);

    await page.goto(`${url}/workspaces/${otherWorkspaceId}/tasks`);
    await page.locator('#task-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-empty').innerText(), /还没有正式任务记录/);

    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '等待决定');
    await applyTaskFilters(page);
    await page.locator('#task-table-body [data-task-id="browser-retro"]').waitFor({ state: 'visible' });
    await page.locator('#task-table-body [data-task-id="browser-retro"] .task-row-main').click();
    await page.locator('#task-detail-id').filter({ hasText: 'browser-retro' }).waitFor({ state: 'visible' });
    await closeTaskReading(page);
    await page.locator('[data-task-node=closeout]').click();
    await page.locator('[data-task-closeout=retrospective]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '减少重复读取' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-retrospective-document-state').innerText(), '等待你的决定');
    await page.locator('#task-retrospective-document-decide').click();
    await page.getByRole('button', { name: '我已完成决定', exact: true }).click();
    await page.locator('#task-retrospective-document-state').filter({ hasText: '已经决定' }).waitFor({ state: 'visible' });
  });

  await t.test('任务列表迟到筛选响应不得覆盖最新筛选结果', async () => {
    const completedCount = runtime.queryTasks(workspaceRoot, { status: 'completed' }).matchingTaskCount;
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });

    let markDelayedStarted: () => void = () => {};
    const delayedStarted = new Promise<void>(resolve => { markDelayedStarted = resolve; });
    const taskListRoute = /\/tasks(?:\?|$)/;
    let delayFirst = true;
    await page.route(taskListRoute, async (route: any) => {
      if (!delayFirst) return route.continue();
      delayFirst = false;
      markDelayedStarted();
      await new Promise(resolve => setTimeout(resolve, 800));
      try { await route.continue(); } catch {}
    });

    try {
      await openTaskFilterPanel(page);
      await selectAntdOption(page, 'task-filter-status', '进行中');
      await applyTaskFilters(page);
      await delayedStarted;

      await openTaskFilterPanel(page);
      await selectAntdOption(page, 'task-filter-status', '已完成');
      await applyTaskFilters(page);
      await page.waitForFunction((count: number) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, completedCount);
      await page.waitForTimeout(1000);
      assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), completedCount);
      await page.locator('#task-table-body [data-task-id="browser-delivered"]').waitFor({ state: 'visible' });
    } finally {
      await page.unroute(taskListRoute);
    }
  });

  await t.test('任务详情保持唯一身份标识，支持节点切换、编辑与明确放弃', async () => {
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.locator('#task-detail-id').filter({ hasText: 'browser-task' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-detail-id').count(), 1, '#task-detail-id 应唯一');
    await capture(page, 'task-detail.png');

    await closeTaskReading(page);
    await page.locator('[data-task-node=requirements][aria-pressed=true]').waitFor({ state: 'visible' });
    await page.locator('[data-task-node=design]').click();
    await page.locator('[data-task-artifact$="proposal.md"]').click();
    await page.locator('#task-node-content').waitFor({ state: 'visible' });
    await page.locator('[data-task-content=review]').click();
    await page.locator('#task-review-result').waitFor({ state: 'visible' });

    await page.locator('[data-task-node=implementation]').click();
    await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-node-content').filter({ hasText: /尚未保存验证结果|开发验证/ }).waitFor({ state: 'visible' });
    await page.locator('[data-task-node=closeout]').click();
    await page.locator('#task-node-content').waitFor({ state: 'visible' });

    await openTaskActionModal(page, 'task-edit-action');
    await page.locator('#task-edit-intent').fill('更新后的任务一句话目标');
    await page.locator('#task-edit-button').click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-task').record.intent, '更新后的任务一句话目标');

    await page.goto(`${workspaceUrl}/tasks/browser-abandon`);
    await page.locator('#task-detail-id').filter({ hasText: 'browser-abandon' }).waitFor({ state: 'visible' });
    await openTaskActionModal(page, 'task-abandon-action');
    await page.locator('#task-abandon-reason').fill('精简浏览器测试明确放弃');
    await page.locator('#task-abandon-form').getByRole('button', { name: '确认放弃', exact: true }).click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'visible' });
    await confirmAntModal(page);
    await page.locator('#task-detail-status').filter({ hasText: '已放弃' }).waitFor({ state: 'visible' });
  });
}
