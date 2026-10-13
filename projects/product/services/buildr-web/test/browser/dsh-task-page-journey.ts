import assert from 'node:assert/strict';

/** Uses the real shell and Task resource; only the plugin challenge transport is replaced. */
export async function runDshTaskPageJourney({t, page, workspaceUrl, taskId, nextTaskId, capture}: any) {
  await t.test('DSH受控任务页保留真实Task地址，后续任务导航回执读取此刻实际地址', async () => {
    const viewport = page.viewportSize();
    const nonce = '44444444-4444-4444-4444-444444444444', challenge = '55555555-5555-5555-5555-555555555555';
    const pending: ((value: string | null) => void)[] = [], acknowledgements: any[] = [];
    let notifyWatch: (() => void) | null = null;
    const pattern = '**/api/v1/app/dsh/pages/**';
    const handler = async (route: any) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith('/watch')) {
        assert.equal(url.searchParams.get('pageId'), nonce);
        const challengeId = await new Promise<string | null>(resolve => {pending.push(resolve); notifyWatch?.(); notifyWatch = null;});
        await route.fulfill({json: {challengeId}}).catch(() => {});
      } else {acknowledgements.push(request.postDataJSON()); await route.fulfill({json: {acknowledged: true}});}
    };
    const confirm = async (target: string) => {
      if (!pending.length) await new Promise<void>(resolve => {notifyWatch = resolve;});
      const response = page.waitForResponse((item: any) => new URL(item.url()).pathname.endsWith('/ack'));
      pending.shift()!(challenge); await response;
      assert.deepEqual(acknowledgements.at(-1), {pageId: nonce, challengeId: challenge, taskUrl: target});
    };
    await page.route(pattern, handler);
    try {
      const target = `${workspaceUrl}/tasks/${taskId}`;
      await page.goto(target + '?buildrDshPage=' + nonce);
      await page.locator(`#task-detail-main[data-task-id="${taskId}"]`).waitFor({state: 'visible'});
      assert.equal(page.url(), target + '?buildrDshPage=' + nonce, '已渲染详情后实际URL仍为准确Task');
      await confirm(target);
      for (const width of [1280, 390]) {await page.setViewportSize({width, height: 900}); await capture(page, `dsh-task-page-${width}.png`); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));}
      if (nextTaskId) {
        const next = `${workspaceUrl}/tasks/${nextTaskId}`;
        // Fixture content uses the same ordinary resource link capture as a
        // task body; it does not call router internals or fabricate a receipt.
        await page.locator('#task-detail-main').evaluate((element: HTMLElement, href: string) => {const link = document.createElement('a'); link.href = href; link.id = 'dsh-page-next-task'; link.textContent = '打开另一个任务'; element.append(link);}, next);
        await page.locator('#dsh-page-next-task').click(); await page.locator(`#task-detail-main[data-task-id="${nextTaskId}"]`).waitFor({state: 'visible'});
        assert.equal(page.url(), next + '?buildrDshPage=' + nonce); await confirm(next);
      }
      await page.goto(target); await page.locator(`#task-detail-main[data-task-id="${taskId}"]`).waitFor({state: 'visible'});
      assert.equal(new URL(page.url()).pathname, new URL(workspaceUrl).pathname + '/tasks', '普通Task入口保留既有列表副屏行为');
    } finally {
      for (const release of pending) release(null);
      await page.unroute(pattern, handler);
      if (viewport) await page.setViewportSize(viewport);
    }
  });
}
