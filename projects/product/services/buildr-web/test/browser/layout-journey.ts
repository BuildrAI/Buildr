import assert from 'node:assert/strict';

// Frontend assertions own visible behavior. The Buildr host supplies an isolated
// production URL, fixture and optional evidence writer; no browser-tool adapter.
export async function runLayoutJourney({ t, page, workspaceUrl, capture }: any) {
  const noPageOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '页面不应出现非预期横向溢出');
  const reachable = async (locator: any) => {
    await locator.click({ trial: true });
  };
  for (const width of [1920, 1280, 390]) {
    await t.test(`布局 ${width}：目录信息和操作可达，详情开关保留搜索`, async () => {
      await page.setViewportSize({ width, height: 900 });
      for (const [area, noun] of [['projects', '项目'], ['services', '服务'], ['repositories', '代码库'], ['skills', '技能']]) {
        await page.goto(`${workspaceUrl}/${area}`);
        const row = page.locator('.resource-directory-table tbody tr[data-row-key]').first();
        await row.waitFor({ state: 'visible' });
        await noPageOverflow();
        await reachable(page.getByRole('button', { name: `新增${noun}`, exact: true }));
        const search = page.getByRole('textbox', { name: `搜索${noun}`, exact: true });
        const name = await row.locator('.resource-name a').first().innerText();
        await search.fill(name);
        await row.locator('.resource-name a').first().click();
        // Projects are main pages; services, repositories and skills use object panes.
        if (area !== 'projects') {
          await page.locator('.pane-right:visible').waitFor();
          await noPageOverflow();
          const close = width < 860
            ? page.getByRole('button', { name: '关闭阅读', exact: true })
            : page.getByRole('button', { name: `关闭 ${noun}详情`, exact: true });
          await reachable(close);
          await capture(page, `layout-${area}-detail-${width}.png`);
          await close.click();
          await page.locator('.pane-right:visible').waitFor({ state: 'hidden' });
          assert.equal(await search.inputValue(), name, '关闭详情保留目录筛选');
          await row.waitFor({ state: 'visible' });
          // Horizontal scrolling inside a wide table is intentional: its action remains usable.
          await reachable(row.getByRole('button', { name: '编辑', exact: true }));
        }
        await noPageOverflow();
      }
    });
  }

  await t.test('阅读分屏：正文行宽有界，展开恢复保留位置与选中内容', async () => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto(`${workspaceUrl}/services/demo/api`);
    await page.locator('.pane-right:visible #service-detail-name').waitFor();
    // A real project reference must be present in the selected service, not inferred from a folder.
    const related = page.locator('.pane-right:visible [data-related-resources="projects"]');
    assert.match(await related.innerText(), /演示项目/);
    assert.match(await related.getByRole('link').first().getAttribute('href'), /\/projects\/demo/);
    await page.locator('[data-doc-row="readme"]').click();
    const body = page.locator('.pane-right:visible .markdown-body');
    await body.getByRole('heading', { name: '布局阅读资料', exact: true }).waitFor();
    const scroll = page.locator('.pane-right:visible > .pane-body');
    await scroll.evaluate((el: HTMLElement) => { el.scrollTop = 500; });
    const before = await scroll.evaluate((el: HTMLElement) => el.scrollTop);
    assert.ok(before > 0, '使用真实长文验证阅读位置');
    await page.getByRole('button', { name: '展开阅读', exact: true }).click();
    await page.getByRole('button', { name: '恢复分屏', exact: true }).waitFor({ state: 'visible' });
    const geometry = await body.locator('p').first().evaluate((el: HTMLElement) => ({ width: el.getBoundingClientRect().width, fontSize: parseFloat(getComputedStyle(el).fontSize) }));
    assert.ok(geometry.width > 300 && geometry.width / geometry.fontSize < 85, `宽屏展开后正文不能拉长成整屏行宽：${JSON.stringify(geometry)}`);
    await noPageOverflow();
    await capture(page, 'layout-reading-expanded-1920.png');
    await page.getByRole('button', { name: '恢复分屏', exact: true }).click();
    assert.ok(Math.abs(await scroll.evaluate((el: HTMLElement) => el.scrollTop) - before) < 24, '恢复分屏后保留阅读位置，允许不足一行的取整差异');
    await body.getByRole('heading', { name: '布局阅读资料', exact: true }).waitFor({ state: 'attached' });
    await page.getByRole('button', { name: '← 返回详情', exact: true }).click();
    await page.locator('.pane-right:visible #service-detail-name').waitFor();
    await page.getByRole('button', { name: '关闭 服务详情', exact: true }).click();
    await page.locator('#service-table-body').waitFor({ state: 'visible' });
    await noPageOverflow();
  });
}
