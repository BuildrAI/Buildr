import assert from 'node:assert/strict';

export async function runWorkbenchJourney({ t, page, runtime, workspaceRoot, otherWorkspaceRoot, workspaceUrl, otherWorkspaceUrl, capture }: any) {
  await t.test('工作概览展示活跃任务与待回应事项，提交回应后保存到工作摘要并移出待回应列表', async () => {
    const taskId = 'workbench-cross';
    runtime.createTask(workspaceRoot, {
      taskId,
      title: '跨项目协同任务',
      intent: '工作台跨项目目标，验证概览活跃列表与待回应流程。',
      projects: ['demo'],
      services: ['demo/api'],
      changes: [],
    });
    runtime.recordTaskWorkContext(workspaceRoot, taskId, {
      expectedContextDigest: 'absent',
      progress: '已完成接口字段梳理。',
      nextStep: '确认按共同方向推进。',
      attention: { kind: 'decision', reason: '请确认概览页待回应事项是否保存到工作摘要。' },
    });

    await page.goto(`${workspaceUrl}/overview`);
    await page.locator('#workbench-overview').waitFor({ state: 'visible' });
    await page.locator(`#workbench-active [data-workbench-task="${taskId}"]`).waitFor({ state: 'visible' });
    const card = page.locator(`#workbench-attention [data-attention-task="${taskId}"]`);
    await card.waitFor({ state: 'visible' });
    await capture(page, 'workbench-overview.png');

    await card.getByRole('link', { name: '跨项目协同任务', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/tasks`);
    await page.locator('#task-detail-id').filter({ hasText: taskId }).waitFor({ state: 'visible' });

    await page.locator('#task-attention-respond').click();
    await page.locator('#task-attention-response-input').fill('同意按共同方向推进。');
    await page.locator('#task-context-save').click();
    await page.locator('#task-attention-response').filter({ hasText: '同意按共同方向推进。' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-attention').count(), 0);

    await page.goto(`${workspaceUrl}/overview`);
    await page.locator('#workbench-overview').waitFor({ state: 'visible' });
    assert.equal(await page.locator(`#workbench-attention [data-attention-task="${taskId}"]`).count(), 0);
    assert.equal(runtime.inspectTask(workspaceRoot, taskId).record.status, 'active');
  });

  await t.test('其他工作空间概览保持隔离且呈现真实空态', async () => {
    await page.goto(`${otherWorkspaceUrl}/overview`);
    await page.locator('#workbench-overview').waitFor({ state: 'visible' });
    await page.locator('#workbench-attention').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-attention-task], [data-workbench-task]').count(), 0);
    assert.doesNotMatch(await page.locator('#workbench-resources').innerText(), /收藏的演示项目|跨项目协同任务/);
  });
}
