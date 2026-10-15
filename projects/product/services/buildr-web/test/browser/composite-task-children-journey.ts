import assert from 'node:assert/strict';

export async function runCompositeTaskChildrenJourney({ t, page, runtime, workspaceRoot, workspaceUrl, capture }: any) {
  await t.test('组合任务的未完成子任务稳定前置，解除关联含义清晰且窄屏可用', async () => {
    const parentId = 'browser-child-actions';
    runtime.createTask(workspaceRoot, { taskId: parentId, title: '子任务操作与排序', intent: '验证当前所属关系、明确操作和未完成优先', isParent: true });
    const longTitle = '未完成子任务的长名称用于检查标题省略、状态和解除关联操作在窄屏下仍保持独立位置';
    const fixtures = [
      { taskId: 'browser-child-actions-completed-first', title: '已完成子任务', status: 'completed' },
      { taskId: 'browser-child-actions-todo-first', title: longTitle, status: 'todo' },
      { taskId: 'browser-child-actions-abandoned', title: '已放弃子任务', status: 'abandoned' },
      { taskId: 'browser-child-actions-active', title: '正在推进的子任务', status: 'active' },
      { taskId: 'browser-child-actions-completed-later', title: '另一个已完成子任务', status: 'completed' },
      { taskId: 'browser-child-actions-todo-later', title: '待推进子任务', status: 'todo' },
    ];
    for (const child of fixtures) {
      const record = runtime.createTask(workspaceRoot, { taskId: child.taskId, title: child.title, intent: '任务目标保留完整内容并在列表中显示一行摘要。', parentTaskId: parentId, status: child.status === 'todo' ? 'todo' : 'active' });
      if (child.status === 'completed') runtime.completeTask(workspaceRoot, child.taskId, { expectedRecordDigest: record.recordDigest, summary: '保留已有完成结果' });
      if (child.status === 'abandoned') runtime.abandonTask(workspaceRoot, child.taskId, { expectedRecordDigest: record.recordDigest, reason: '保留已有放弃结果' });
    }
    const observed = runtime.inspectParentCoordination(workspaceRoot, parentId).children;
    const unfinished = (child: any) => ['active', 'todo'].includes(child.status);
    const expectedOrder = [...observed.filter(unfinished), ...observed.filter((child: any) => !unfinished(child))].map((child: any) => child.taskId);
    await page.goto(`${workspaceUrl}/tasks/${parentId}`);
    await page.locator('#task-detail-id:visible').filter({ hasText: parentId }).waitFor();
    await page.getByRole('tab', { name: '子任务', exact: true }).click();
    const table = page.locator('.composite-task-list:visible');
    await table.getByRole('columnheader', { name: '操作', exact: true }).waitFor();
    const rows = table.locator('tbody tr.ant-table-row');
    assert.deepEqual(await rows.evaluateAll((nodes: HTMLElement[]) => nodes.map(node => node.dataset.rowKey)), expectedOrder);
    assert.equal(await table.getByRole('button', { name: /^解除关联 / }).count(), fixtures.length);
    assert.equal(await table.locator('.anticon-close').count(), 0, 'The operation uses visible text rather than an unexplained close icon.');
    try {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const longRow = table.locator(`[data-row-key="browser-child-actions-todo-first"]`);
        await longRow.waitFor({ state: 'visible' });
        const bounds = await longRow.evaluate((row: HTMLElement) => {
          const cells = row.querySelectorAll('td');
          const title = row.querySelector<HTMLElement>('.task-row-main')!;
          const status = row.querySelector<HTMLElement>('.lifecycle-badge')!.getBoundingClientRect();
          const action = row.querySelector<HTMLElement>('.composite-task-unlink')!.getBoundingClientRect();
          const taskCell = cells[0].getBoundingClientRect(), statusCell = cells[1].getBoundingClientRect(), actionCell = cells[2].getBoundingClientRect();
          return { taskWidth: taskCell.width, titleClipped: title.scrollWidth > title.clientWidth, statusFits: status.left >= statusCell.left && status.right <= statusCell.right, actionFits: action.left >= actionCell.left && action.right <= actionCell.right, distinct: taskCell.right <= statusCell.left + 1 && statusCell.right <= actionCell.left + 1, actionWidth: actionCell.width, viewportFits: document.documentElement.scrollWidth <= innerWidth + 1 };
        });
        assert.ok(bounds.taskWidth > 70, `The task title keeps a readable column at width ${width}.`);
        assert.ok(bounds.statusFits && bounds.actionFits && bounds.distinct && bounds.viewportFits, `Columns remain separate at width ${width}: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.actionWidth >= 100, 'The unlink action keeps enough width for its label.');
        if (width === 390) assert.equal(bounds.titleClipped, true, 'Long titles shorten inside their own column.');
        await capture(page, `composite-task-children-${width}.png`);
      }
      const childId = 'browser-child-actions-completed-first', before = runtime.inspectTask(workspaceRoot, childId).record;
      await table.getByRole('button', { name: '解除关联 已完成子任务', exact: true }).click();
      await table.locator(`[data-row-key="${childId}"]`).waitFor({ state: 'hidden' });
      const after = runtime.inspectTask(workspaceRoot, childId).record;
      assert.equal(after.parentTaskId, null);
      assert.equal(after.status, before.status);
      assert.deepEqual(after.result, before.result, 'Unlink preserves the existing task result.');
      assert.equal(await page.locator('#task-detail-id:visible').innerText(), parentId, 'Clicking unlink does not open the child task.');
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });
}
