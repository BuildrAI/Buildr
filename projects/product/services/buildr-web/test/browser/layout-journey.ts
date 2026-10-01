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
        // This case owns layout, so use a definite pointer-enter rather than
        // racing a hover-open state with a keyboard toggle from the prior page.
        await page.mouse.move(0, 0);
        await page.getByRole('button', { name: '功能说明', exact: true }).hover();
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

  await t.test('任务改动：完整提交可复制，同名文件按来源阅读，刷新等待新内容', async () => {
    const taskId = 'browser-task', pattern = `**/tasks/${taskId}/changed-files`, fullPattern = `**/tasks/${taskId}/file-diff?**`;
    let fullGateHash: string | null = null;
    let fullGate: Promise<void> | null = null, fullRelease: (() => void) | null = null, fullRequested: (() => void) | null = null;
    const hash = 'a'.repeat(40), otherHash = 'b'.repeat(40);
    const message = '修正布局\n\n保留完整说明并允许选择复制。\n\nBuildr-Task: browser-task';
    const file = (text: string) => ({ repositoryId: 'repo', path: 'layout.tsx', previousPath: null, kind: 'tracked', status: 'modified', additions: 1, deletions: 1, preview: `diff --git a/layout.tsx b/layout.tsx\nindex abc..def\n--- a/layout.tsx\n+++ b/layout.tsx\n@@ -1,72 +1,72 @@\n-old\n-second-old\n+${text}\n+extra-new\n${Array.from({ length: 70 }, (_, index) => ` context-${index}`).join('\n')}`, previewTruncated: false });
    const commit = (value: string, subject: string) => ({ repositoryId: 'repo', hash: value, shortHash: value.slice(0, 12), subject, message, authorName: '布局验证', authorEmail: 'layout@example.com', authoredAt: '2026-10-01T00:00:00Z', committedAt: '2026-10-01T00:00:00Z' });
    let currentText = 'worktree-current';
    let release: (() => void) | null = null;
    let requested: (() => void) | null = null;
    let gate: Promise<void> | null = null;
    await page.route(pattern, async (route: any) => {
      requested?.();
      if (gate) await gate;
      await route.fulfill({ json: {
        schemaVersion: 'buildr.task-changed-files/v1', taskId, readAt: '2026-10-01T00:00:00Z', status: 'complete',
        files: [file(currentText)], commits: [commit(hash, '修正布局'), commit(otherHash, '更早的布局')],
        commitFiles: { [`repo:${hash}`]: [file('commit-original')], [`repo:${otherHash}`]: [file('commit-earlier')] },
        repositories: [{ id: 'repo', label: '布局仓库', root: '.', sources: [], status: 'complete', branch: 'dev', ahead: 0, fileCount: 1, scannedCommitCount: 2 }],
        repositoryMeta: {}, coverage: { repositoryLimit: 32, fileLimit: 500, commitFileLimit: 500, previewLineLimit: 500, truncated: false }, diagnostics: [], effects: [],
      } });
    });
    await page.route(fullPattern, async (route: any) => {
      const hashValue = new URL(route.request().url()).searchParams.get('commitHash');
      const text = hashValue === hash ? 'commit-original' : hashValue === otherHash ? 'commit-earlier' : currentText;
      fullRequested?.(); if (fullGate && (!fullGateHash || hashValue === fullGateHash)) await fullGate;
      const entry = file(text);
      entry.preview = `diff --git a/layout.tsx b/layout.tsx\n--- a/layout.tsx\n+++ b/layout.tsx\n@@ -1,81 +1,81 @@\n file-start\n${Array.from({ length: 7 }, (_, index) => ` pre-context-${index}`).join('\n')}\n-old\n-second-old\n+${text}\n+extra-new\n${Array.from({ length: 70 }, (_, index) => ` context-${index}`).join('\n')}\n file-end`;
      await route.fulfill({ json: { schemaVersion: 'buildr.task-changed-files/v1', taskId, readAt: '2026-10-01T00:00:00Z', status: 'complete', files: [entry], commits: [], commitFiles: {}, repositories: [], repositoryMeta: {}, coverage: { repositoryLimit: 32, fileLimit: 1, commitFileLimit: 1, previewLineLimit: 5000, truncated: false }, diagnostics: [], effects: [] } });
    });
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      for (const width of [1920, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${workspaceUrl}/tasks/${taskId}`);
        const detail = page.locator('#task-detail-main:visible');
        await detail.locator('[data-task-content="changes"]').click();
        const diff = detail.locator('.task-diff-body');
        await diff.getByText('worktree-current', { exact: false }).waitFor();
        await diff.getByText('file-start', { exact: false }).first().waitFor();
        await diff.getByText('file-end', { exact: false }).first().waitFor();
        if (width === 390) {
          assert.match(await detail.locator('.task-diff-mode .ant-segmented-item-selected').innerText(), /上下对比/);
          assert.match(await detail.locator('[aria-label="上下差异"]').innerText(), /−old/);
          const disabledMode = detail.locator('.task-diff-mode .ant-segmented-item-disabled');
          const before = await disabledMode.evaluate((node: HTMLElement) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
          await disabledMode.hover();
          await page.getByRole('tooltip').getByText('当前阅读宽度不足，使用上下对比', { exact: true }).waitFor();
          const after = await disabledMode.evaluate((node: HTMLElement) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
          assert.deepEqual(after, before, '禁用项悬停不能再改变灰度或背景');

        }
        if (width === 1920) {
          const boundaries = await page.locator('.split-divider:has(.split-divider-header-marker):visible').evaluateAll(dividers => dividers.map(divider => {
            const line = getComputedStyle(divider, '::before');
            const bodyX = divider.getBoundingClientRect().left + parseFloat(line.left) + parseFloat(line.width) / 2;
            const marker = divider.querySelector('.split-divider-header-marker')!.getBoundingClientRect();
            return Math.abs(marker.left + marker.width / 2 - bodyX);
          }));
          assert.ok(boundaries.length >= 2 && boundaries.every(distance => distance < 1), '顶部短线与菜单、内容分屏的下方线严格对齐');
          await page.getByRole('button', { name: '展开阅读', exact: true }).click();
          const modes = detail.locator('.task-diff-mode');
          await modes.getByText('上下对比', { exact: true }).click();
          await detail.locator('.task-diff-text').waitFor();
          assert.match(await detail.locator('.task-diff-text').innerText(), /−old/);
          assert.match(await detail.locator('.task-diff-text').innerText(), /\+worktree-current/);
          assert.match(await modes.locator('.ant-segmented-item-selected').innerText(), /上下对比/);
          await modes.getByText('左右对比', { exact: true }).click();
          await detail.locator('.task-diff-split').waitFor();
          assert.match(await modes.locator('.ant-segmented-item-selected').innerText(), /左右对比/);
          const assertAlignedRows = async () => {
            const rows = await detail.locator('.task-diff-split').evaluate((root: HTMLElement) => {
              const columns = [root.querySelectorAll('.task-diff-split-side')[0], root.querySelector('.task-diff-split-gutter'), root.querySelectorAll('.task-diff-split-side')[1]];
              return columns.map(column => [...column!.querySelectorAll('[data-diff-row]')].map(row => { const rect = row.getBoundingClientRect(); return { top: rect.top, height: rect.height }; }));
            });
            assert.equal(rows[0].length, rows[1].length);
            assert.equal(rows[0].length, rows[2].length);
            for (let index = 0; index < rows[0].length; index += 1) {
              for (const column of [1, 2]) {
                assert.ok(Math.abs(rows[0][index].top - rows[column][index].top) < 1, `第${index}行三列顶端必须对齐`);
                assert.ok(Math.abs(rows[0][index].height - rows[column][index].height) < 1, `第${index}行三列高度必须一致，包括空行和补丁头`);
              }
            }
          };
          await assertAlignedRows();
          await detail.locator('.task-diff-split-side').first().evaluate((node: HTMLElement) => { node.scrollTop = 180; });
          await page.waitForFunction(() => {
            const left = document.querySelector('.task-diff-split-side')!;
            const middle = document.querySelector('.task-diff-split-gutter')!;
            return left.scrollTop > 0 && Math.abs(left.scrollTop - middle.scrollTop) < 1;
          });
          await assertAlignedRows();

          await capture(page, 'layout-task-diff-mode-selected.png');
          await page.getByRole('button', { name: '恢复分屏', exact: true }).click();
        }
        await detail.locator('.task-rail-commit').first().click();
        await detail.locator('.task-commit-details').waitFor();
        assert.equal(await detail.locator('.task-commit-details pre').innerText(), message);
        assert.match(await detail.locator('.task-commit-details').innerText(), new RegExp(hash));
        await detail.getByRole('button', { name: '复制提交说明', exact: true }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), message);
        await detail.getByRole('button', { name: '复制完整哈希', exact: true }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), hash);
        await detail.locator('.task-rail-commit-files .task-changed-row').first().click();
        await diff.getByText('commit-original', { exact: false }).waitFor();
        assert.doesNotMatch(await diff.innerText(), /worktree-current|commit-earlier/);
        await detail.locator('.task-rail-commit').nth(1).click();
        await detail.locator('.task-rail-commits > li').nth(1).locator('.task-changed-row').click();
        await diff.getByText('commit-earlier', { exact: false }).waitFor();
        await detail.locator('.task-rail-body > section > .task-changed-list .task-changed-row').click();
        await diff.getByText('worktree-current', { exact: false }).waitFor();
        if (width === 1920) {
          await page.waitForFunction(() => document.querySelector('.task-diff-reader')?.getAttribute('aria-busy') === 'false');
          assert.equal(await detail.locator('.task-diff-read-status').count(), 0, '完整差异正常显示时不增加说明行');
          fullGateHash = hash;
          fullGate = new Promise<void>(resolve => { fullRelease = resolve; });
          const oldFullArrived = new Promise<void>(resolve => { fullRequested = resolve; });
          const firstEntry = detail.locator('.task-rail-commits > li').nth(0);
          if (await firstEntry.locator('.task-rail-commit').getAttribute('aria-expanded') !== 'true') await firstEntry.locator('.task-rail-commit').click();
          await firstEntry.locator('.task-changed-row').click();
          await oldFullArrived;
          const secondEntry = detail.locator('.task-rail-commits > li').nth(1);
          if (await secondEntry.locator('.task-rail-commit').getAttribute('aria-expanded') !== 'true') await secondEntry.locator('.task-rail-commit').click();
          await secondEntry.locator('.task-changed-row').click();
          await diff.getByText('commit-earlier', { exact: false }).waitFor();
          fullRelease!(); fullGate = null; fullGateHash = null;
          assert.doesNotMatch(await diff.innerText(), /commit-original/);
          await detail.locator('.task-rail-body > section > .task-changed-list .task-changed-row').click();
          await diff.getByText('worktree-current', { exact: false }).waitFor();
        }
        await noPageOverflow();
        await capture(page, `layout-task-changes-${width}.png`);
      }
      const detail = page.locator('#task-detail-main:visible');
      const arrived = new Promise<void>(resolve => { requested = resolve; });
      gate = new Promise<void>(resolve => { release = resolve; });
      await detail.locator('#task-detail-refresh').click();
      await arrived;
      assert.equal(await detail.locator('#task-detail-refresh').getAttribute('aria-busy'), 'true', '改动读取未完成时，刷新不能先结束');
      assert.match(await detail.locator('.task-diff-body').innerText(), /worktree-current/, '等待时保留已读取内容');
      currentText = 'worktree-refreshed';
      const fullArrived = new Promise<void>(resolve => { fullRequested = resolve; });
      fullGate = new Promise<void>(resolve => { fullRelease = resolve; });
      release!();
      await fullArrived;
      assert.equal(await detail.locator('#task-detail-refresh').getAttribute('aria-busy'), 'true', '刷新必须等待所选文件的完整差异');
      fullRelease!(); fullGate = null;
      await detail.locator('.task-diff-body').getByText('worktree-refreshed', { exact: false }).waitFor();
      await page.waitForFunction(() => document.querySelector('#task-detail-refresh')?.getAttribute('aria-busy') === 'false');
      assert.doesNotMatch(await detail.locator('.task-diff-body').innerText(), /worktree-current/);
      await page.getByRole('button', { name: '关闭 普通任务', exact: true }).click();
      const returning = new Promise<void>(resolve => { requested = resolve; });
      gate = new Promise<void>(resolve => { release = resolve; });
      await page.locator('tr[data-row-key="browser-task"] a').first().click();
      await page.locator('[data-task-content="changes"]').click();
      await returning;
      await detail.locator('.task-diff-body').getByText('worktree-refreshed', { exact: false }).waitFor({ timeout: 1000 });
      currentText = 'return-revalidated'; release!(); gate = null;
      await detail.locator('.task-diff-body').getByText('return-revalidated', { exact: false }).waitFor();
      await page.waitForFunction(() => document.querySelector('.task-diff-reader')?.getAttribute('aria-busy') === 'false');
          assert.equal(await detail.locator('.task-diff-read-status').count(), 0, '完整差异正常显示时不增加说明行');
      await page.getByRole('button', { name: '关闭 普通任务', exact: true }).click();
      fullGate = new Promise<void>(resolve => { fullRelease = resolve; });
      const backgroundFullArrived = new Promise<void>(resolve => { fullRequested = resolve; });
      await page.locator('tr[data-row-key="browser-task"] a').first().click();
      await page.locator('[data-task-content="changes"]').click();
      await backgroundFullArrived;
      currentText = 'latest-after-pending';
      const newerFullArrived = new Promise<void>(resolve => { fullRequested = resolve; });
      await detail.locator('#task-detail-refresh').click(); await newerFullArrived;
      fullRelease!(); fullGate = null;
      await detail.locator('.task-diff-body').getByText('latest-after-pending', { exact: false }).waitFor();
      await page.waitForFunction(() => document.querySelector('#task-detail-refresh')?.getAttribute('aria-busy') === 'false');
      assert.doesNotMatch(await detail.locator('.task-diff-body').innerText(), /return-revalidated/);

    } finally { release?.(); fullRelease?.(); await page.unroute(pattern); await page.unroute(fullPattern); }
  });

  await t.test('任务说明：慢读取、快速切换、返回复用与主动刷新', async () => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    const first = 'browser-task', second = 'layout-reading-other', third = 'layout-reading-more';
    let extraTask = false, releaseList: (() => void) | null = null;
    const listPattern = /\/api\/v1\/workspaces\/[^/]+\/tasks(?:\?[^/]*)?$/;
    const otherPattern = `**/tasks/${second}`;
    const contextPattern = `**/tasks/${second}/work-context`;
    const contextsPattern = /\/tasks\/work-contexts\?/;
    const changePattern = /\/tasks\/(browser-task|layout-reading-other)\/changes\/demo\/browser-flow$/;
    const counts = { first: 0, second: 0, scans: 0 };
    let text = '说明甲';
    let gate: Promise<void> | null = null, release: (() => void) | null = null;
    let arrived: (() => void) | null = null;
    const scans = (request: any) => { if (request.url().includes('/changed-files')) counts.scans += 1; };
    page.on('request', scans);
    await page.route(listPattern, async (route: any) => {
      const response = await route.fetch();
      const payload = await response.json();
      const original = payload.tasks.find((task: any) => task.record.taskId === first);
      if (original) {
        payload.tasks.push({ ...original, record: { ...original.record, taskId: second, title: '切换说明任务' } });
        if (extraTask) payload.tasks.push({ ...original, record: { ...original.record, taskId: third, title: '刷新后新增任务' } });
        payload.matchingTaskCount += extraTask ? 2 : 1;
        payload.totalTaskCount += extraTask ? 2 : 1;
      }
      await route.fulfill({ response, json: payload });
    });
    await page.route(otherPattern, async (route: any) => {
      const response = await route.fetch({ url: route.request().url().replace(second, first) });
      const payload = await response.json();
      await route.fulfill({ response, json: { ...payload, record: { ...payload.record, taskId: second, title: '切换说明任务' } } });
    });
    await page.route(contextPattern, (route: any) => route.fulfill({ json: { schemaVersion: 'buildr.task-work-context/v1', taskId: second, context: null, contextDigest: null } }));
    await page.route(contextsPattern, async (route: any) => {
      const url = new URL(route.request().url()); url.searchParams.set('ids', first);
      const response = await route.fetch({ url: url.href });
      const payload = await response.json();
      payload.items.push({ schemaVersion: 'buildr.task-work-context/v1', taskId: second, context: null, contextDigest: null });
      if (extraTask) payload.items.push({ schemaVersion: 'buildr.task-work-context/v1', taskId: third, context: null, contextDigest: null });
      await route.fulfill({ response, json: payload });
    });
    await page.route(changePattern, async (route: any) => {
      const isFirst = route.request().url().includes(`/tasks/${first}/`);
      counts[isFirst ? 'first' : 'second'] += 1;
      const content = isFirst ? text : '说明乙';
      const response = await route.fetch({ url: route.request().url().replace(second, first) });
      const payload = await response.json();
      payload.resolution.workingCopy.change.brief = { exists: true, path: 'openspec/changes/browser-flow/brief.md', content: `# ${content}\n\n当前任务说明正文。` };
      if (isFirst && gate) { arrived?.(); await gate; }
      await route.fulfill({ response, json: payload });
    });
    try {
      gate = new Promise<void>(resolve => { release = resolve; });
      const initial = new Promise<void>(resolve => { arrived = resolve; });
      await page.goto(`${workspaceUrl}/tasks`);
      const row = (id: string) => page.locator(`tr[data-row-key="${id}"] a`).first();
      await row(first).waitFor();
      await page.waitForFunction(() => document.querySelector('#task-list-refresh')?.getAttribute('aria-busy') === 'false' && !document.querySelector('#tasks-state')?.textContent?.includes('正在读取'));
      const beforeCount = await page.locator('#tasks-state').innerText();
      const beforeButton = await page.locator('#task-list-refresh').boundingBox();
      let requestedList: (() => void) | null = null;
      const listGate = new Promise<void>(resolve => { releaseList = resolve; });
      const listArrived = new Promise<void>(resolve => { requestedList = resolve; });
      const slowList = async (route: any) => { requestedList!(); await listGate; extraTask = true; await route.fallback(); };
      await page.route(listPattern, slowList);
      await page.locator('#task-list-refresh').click(); await listArrived;
      assert.equal(await page.locator('#tasks-state').innerText(), beforeCount, '等待刷新结果时保留数量文本');
      assert.equal(await page.locator('#task-list-refresh').getAttribute('aria-busy'), 'true');
      assert.ok(await row(first).isVisible(), '刷新保留已有列表');
      const duringButton = await page.locator('#task-list-refresh').boundingBox();
      assert.equal(duringButton.width, beforeButton.width); assert.equal(duringButton.x, beforeButton.x);
      releaseList!(); await page.waitForFunction(() => document.querySelector('#task-list-refresh')?.getAttribute('aria-busy') === 'false');
      await row(third).waitFor();
      assert.equal(await page.locator('#tasks-state').innerText(), '3 个任务', '同样条件返回更多任务后必须更新统计');
      await page.unroute(listPattern, slowList);
      await row(first).click();
      await initial;
      const content = page.locator('#task-node-content:visible');
      assert.match(await content.innerText(), /正在读取内容/);
      assert.doesNotMatch(await content.innerText(), /暂无补充/);
      await row(second).click();
      await content.getByRole('heading', { name: '说明乙', exact: true }).waitFor();
      release!(); gate = null;
      assert.doesNotMatch(await content.innerText(), /说明甲/);
      assert.equal(counts.scans, 0, '任务说明不提前扫描改动与提交');
      await row(first).click();
      await content.getByRole('heading', { name: '说明甲', exact: true }).waitFor();
      const beforeReturn = counts.second;
      await row(second).click();
      await content.getByRole('heading', { name: '说明乙', exact: true }).waitFor();
      assert.ok(counts.second <= beforeReturn + 1, '返回只重核一次，复用已读材料');
      gate = new Promise<void>(resolve => { release = resolve; });
      const rereading = new Promise<void>(resolve => { arrived = resolve; });
      await row(first).click();
      await rereading;
      // Cached content remains visible even while revalidation is deliberately delayed.
      await content.getByRole('heading', { name: '说明甲', exact: true }).waitFor();
      text = '刷新后的说明甲';
      const beforeRefresh = counts.first;
      const refreshing = new Promise<void>(resolve => { arrived = resolve; });
      await page.locator('#task-detail-refresh:visible').click();
      await refreshing;
      assert.equal(await page.locator('#task-detail-refresh:visible').getAttribute('aria-busy'), 'true');
      assert.match(await content.innerText(), /说明甲/);
      release!(); gate = null;
      await content.getByRole('heading', { name: '刷新后的说明甲', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('#task-detail-refresh')?.getAttribute('aria-busy') === 'false');
      assert.equal(counts.first, beforeRefresh + 1, '相同引用刷新只读取正文一次');
      assert.equal(counts.scans, 0);
    } finally {
      release?.(); releaseList?.(); page.off('request', scans);
      await page.unroute(listPattern); await page.unroute(otherPattern); await page.unroute(changePattern); await page.unroute(contextPattern); await page.unroute(contextsPattern);
    }
  });

}
