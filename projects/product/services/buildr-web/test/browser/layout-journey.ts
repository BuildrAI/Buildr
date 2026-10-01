import assert from 'node:assert/strict';

// Frontend assertions own visible behavior. The Buildr host supplies an isolated
// production URL, fixture and optional evidence writer; no browser-tool adapter.
export async function runLayoutJourney({ t, page, workspaceUrl, capture }: any) {
  const noPageOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '页面不应出现非预期横向溢出');
  const reachable = async (locator: any) => {
    await locator.click({ trial: true });
  };
  const readableDirectoryHeader = async () => {
    const geometry = await page.locator('.resource-directory').evaluate((directory: HTMLElement) => {
      const header = directory.querySelector('.resource-directory-head')!;
      const title = header.querySelector('h1')!;
      const description = header.querySelector('p:not(.resource-eyebrow)')!;
      const bounds = header.getBoundingClientRect();
      return {
        width: bounds.width,
        titleHeight: title.getBoundingClientRect().height,
        titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
        descriptionWidth: description.getBoundingClientRect().width,
        actionsContained: Array.from(header.querySelectorAll('button')).every(button => {
          const rect = button.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        }),
      };
    });
    assert.ok(geometry.titleHeight <= geometry.titleLineHeight * 1.5, `目录标题不能被按钮挤成竖排：${JSON.stringify(geometry)}`);
    assert.ok(geometry.descriptionWidth >= Math.min(240, geometry.width - 1), `目录说明应保留可读宽度：${JSON.stringify(geometry)}`);
    assert.ok(geometry.actionsContained, `目录操作不能超出栏宽：${JSON.stringify(geometry)}`);
  };
  for (const width of [1920, 1280, 390]) {
    await t.test(`布局 ${width}：目录信息和操作可达，详情开关保留搜索`, async () => {
      await page.setViewportSize({ width, height: 900 });
      for (const [area, noun] of [['projects', '项目'], ['services', '服务'], ['repositories', '代码库'], ['skills', '技能']]) {
        await page.goto(`${workspaceUrl}/${area}`);
        const row = page.locator('.resource-directory-table tbody tr[data-row-key]').first();
        await row.waitFor({ state: 'visible' });
        await noPageOverflow();
        await readableDirectoryHeader();
        await reachable(page.getByRole('button', { name: `新增${noun}`, exact: true }));
        const search = page.getByRole('textbox', { name: `搜索${noun}`, exact: true });
        const name = await row.locator('.resource-name a').first().innerText();
        await search.fill(name);
        await row.locator('.resource-name a').first().click();
        // Projects are main pages; services, repositories and skills use object panes.
        if (area !== 'projects') {
          await page.locator('.pane-right:visible').waitFor();
          await noPageOverflow();
          if (width >= 860) await readableDirectoryHeader();
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

  await t.test('独立原型阅读：窄屏目录移至顶部，画面与说明保留可用宽度', async () => {
    const catalogRoute = '**/tasks/layout-prototype/ui-prototypes';
    const contentRoute = '**/tasks/layout-prototype/ui-prototypes/layout';
    const metadata = { version: 1, pages: [
      { id: 'overview', title: '原型总览', notes: [{ id: 'action', title: '操作说明', text: '阅读说明后仍可操作当前原型。' }], states: [] },
      { id: 'details', title: '原型详情', notes: [{ id: 'detail', title: '详情说明', text: '页面目录和说明在窄屏中都保持可达。' }], states: [] },
    ] };
    // Only the task data source is isolated; navigation, layout and notes use the production reader.
    await page.route(catalogRoute, (route: any) => route.fulfill({ json: { taskId: 'layout-prototype', diagnostics: [], prototypes: [{ id: 'layout', source: 'change', project: 'demo', change: 'layout', lifecycle: 'active', provenance: 'task-worktree-candidate', path: 'prototype.html', title: '布局原型', sizeBytes: 300, updatedAt: '2026-09-27T00:00:00Z', metadata }] } }));
    await page.route(contentRoute, (route: any) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>布局原型</title></head><body><h1>可操作的原型</h1><button id="layout-prototype-action" onclick="this.textContent=\'已操作\'">执行操作</button></body></html>' }));
    try {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`${workspaceUrl}/tasks/layout-prototype/prototypes`);
        const directory = page.getByRole('navigation', { name: '原型页面列表', exact: true });
        await directory.getByRole('button', { name: '原型总览', exact: true }).waitFor({ state: 'visible' });
        await page.frameLocator('#task-prototype-frame').locator('#layout-prototype-action').waitFor({ state: 'visible' });
        const bounds = await page.locator('.prototype-standalone').evaluate((root: HTMLElement) => {
          const nav = root.querySelector('nav')!.getBoundingClientRect();
          const reader = root.querySelector('.prototype-reader')!.getBoundingClientRect();
          const frame = root.querySelector('iframe')!.getBoundingClientRect();
          return { navBottom: nav.bottom, navRight: nav.right, readerTop: reader.top, readerLeft: reader.left, frameWidth: frame.width };
        });
        if (width < 700) {
          assert.ok(bounds.navBottom <= bounds.readerTop, '窄屏页面目录位于正文上方，不能挤占左侧阅读空间');
          assert.ok(bounds.frameWidth >= width - 48, `窄屏原型画面应使用可用宽度：${JSON.stringify(bounds)}`);
        } else assert.ok(bounds.navRight <= bounds.readerLeft, '宽屏保留并排页面目录');
        const notes = page.locator('#prototype-notes-panel');
        if (!await notes.isVisible()) await page.getByRole('button', { name: '功能说明', exact: true }).click();
        await notes.waitFor({ state: 'visible' });
        await notes.evaluate(async (node: HTMLElement) => { await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))); });
        const notesBounds = await notes.evaluate((node: HTMLElement) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; });
        assert.ok(notesBounds.left >= 0 && notesBounds.right <= width + 1, `说明稳定展开后位于屏内：${JSON.stringify(notesBounds)}`);
        if (width < 700) assert.ok(notesBounds.width >= width - 48, '窄屏功能说明不应被左侧目录压缩');
        await noPageOverflow();
        await capture(page, `layout-prototype-notes-${width}.png`);
        await notes.getByRole('button', { name: '关闭功能说明', exact: true }).click();
        await page.frameLocator('#task-prototype-frame').locator('#layout-prototype-action').click();
        assert.equal(await page.frameLocator('#task-prototype-frame').locator('#layout-prototype-action').innerText(), '已操作');
        await directory.getByRole('button', { name: '原型详情', exact: true }).click();
        await page.getByRole('heading', { name: '原型详情', exact: true }).waitFor({ state: 'visible' });
        assert.equal(await page.locator('#task-prototype-title').innerText(), '原型详情');
      }
    } finally {
      await page.unroute(catalogRoute);
      await page.unroute(contentRoute);
    }
  });
}
