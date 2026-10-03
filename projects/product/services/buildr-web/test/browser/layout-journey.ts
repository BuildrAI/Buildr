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
    await page.getByRole('button', { name: '展开阅读', exact: true }).click();
    await page.getByRole('button', { name: '恢复分屏', exact: true }).waitFor({ state: 'visible' });
    const functionalWidth = await page.locator('.pane-right:visible').evaluate((pane: HTMLElement) => {
      const inner = pane.querySelector<HTMLElement>('.pane-body-inner')!;
      return { pane: pane.clientWidth, content: inner.getBoundingClientRect().width };
    });
    assert.ok(Math.abs(functionalWidth.pane - functionalWidth.content) < 2, `功能详情使用右分屏全部宽度：${JSON.stringify(functionalWidth)}`);
    await page.getByRole('button', { name: '恢复分屏', exact: true }).click();
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
    assert.ok(geometry.width > 300 && geometry.width / geometry.fontSize < 100, `宽屏展开后正文不能拉长成整屏行宽：${JSON.stringify(geometry)}`);
    assert.ok(geometry.width > 1040, '文档阅读宽度比上一版 1040 像素适度增加');
    const readingMargins = await page.locator('.pane-right:visible').evaluate((pane: HTMLElement) => {
      const frame = pane.getBoundingClientRect();
      const reader = pane.querySelector<HTMLElement>('.resource-reader')!.getBoundingClientRect();
      return { left: reader.left - frame.left, right: frame.right - reader.right };
    });
    assert.ok(Math.abs(readingMargins.left - readingMargins.right) < 2, `文档在右分屏居中：${JSON.stringify(readingMargins)}`);
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
    const countPattern = `**/tasks/${taskId}/changed-file-count`;
    let fullLists = 0;
    await page.route(countPattern, (route: any) => route.fulfill({ json: { schemaVersion: 'buildr.task-changed-file-count/v1', taskId, readAt: '2026-10-01T00:00:00Z', fileCount: 1, status: 'complete', coverage: { repositoryLimit: 32, fileLimit: 500, truncated: false }, diagnostics: [], effects: [] } }));
    let currentText = 'worktree-current';
    let release: (() => void) | null = null;
    let requested: (() => void) | null = null;
    let gate: Promise<void> | null = null;
    await page.route(pattern, async (route: any) => {
      fullLists += 1;
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
      entry.preview = `diff --git a/layout.tsx b/layout.tsx\n--- a/layout.tsx\n+++ b/layout.tsx\n@@ -1,81 +1,81 @@\n file-start\n${Array.from({ length: 140 }, (_, index) => ` pre-context-${index}`).join('\n')}\n-old\n-second-old\n+${text}\n+extra-new\n${Array.from({ length: 70 }, (_, index) => ` context-${index}`).join('\n')}\n file-end`;
      if (text === 'unchanged-only') {
        entry.status = 'renamed'; entry.previousPath = 'old-layout.tsx';
        entry.preview = `diff --git a/old-layout.tsx b/layout.tsx\n@@ -1,220 +1,220 @@\n${Array.from({ length: 220 }, (_, index) => ` unchanged-only-${index}`).join('\n')}`;
      }
      await route.fulfill({ json: { schemaVersion: 'buildr.task-changed-files/v1', taskId, readAt: '2026-10-01T00:00:00Z', status: 'complete', files: [entry], commits: [], commitFiles: {}, repositories: [], repositoryMeta: {}, coverage: { repositoryLimit: 32, fileLimit: 1, commitFileLimit: 1, previewLineLimit: 5000, truncated: false }, diagnostics: [], effects: [] } });
    });
    const firstChangeVisible = async () => {
      await page.waitForFunction(() => {
        const body = document.querySelector<HTMLElement>('.task-diff-body');
        if (!body) return false;
        const split = body.querySelector<HTMLElement>('.task-diff-split-side');
        const host = split || body;
        const row = split?.querySelector<HTMLElement>('.is-del, .is-add') || body.querySelector<HTMLElement>('.line-del, .line-add');
        if (!row) return false;
        const header = split?.querySelector('.task-diff-version-head')?.getBoundingClientRect().height ?? 0;
        const top = row.getBoundingClientRect().top - host.getBoundingClientRect().top;
        return host.scrollTop > 100 && top >= header - 1 && top <= header + 32;
      }).catch(async (cause: Error) => {
        const geometry = await page.locator('.task-diff-body').evaluate((body: HTMLElement) => {
          const split = body.querySelector<HTMLElement>('.task-diff-split-side');
          const host = split || body;
          const row = split?.querySelector('.is-del, .is-add') || body.querySelector('.line-del, .line-add');
          return { mode: split ? 'split' : 'unified', scroll: host.scrollTop, height: host.clientHeight, scrollHeight: host.scrollHeight, bodyScroll: body.scrollTop, rowTop: row ? row.getBoundingClientRect().top - host.getBoundingClientRect().top : null, busy: body.closest('.task-diff-reader')?.getAttribute('aria-busy') };
        });
        throw new Error(`${cause.message} ${JSON.stringify(geometry)}`);
      });
    };
    const singleLineNumbers = async () => {
      const gutters = await page.locator('.task-diff-text').evaluate((root: HTMLElement) => [...root.querySelectorAll('.task-diff-line')].map(row => ({ kind: row.className, values: [...row.querySelectorAll('.task-diff-gutter')].map(node => node.textContent) })));
      assert.ok(gutters.every(row => row.values.length === 1), 'unified rows have one line-number column');
      assert.equal(gutters.find(row => row.kind.includes('line-del')).values[0], '142');
      assert.equal(gutters.find(row => row.kind.includes('line-add')).values[0], '142');
    };
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      for (const width of [1920, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const listsBefore = fullLists;
        await page.goto(`${workspaceUrl}/tasks/${taskId}`);
        const detail = page.locator('#task-detail-main:visible');
        await detail.locator('[data-task-content="changes"] .task-badge').filter({ hasText: '1' }).waitFor();
        assert.equal(fullLists, listsBefore, 'badge does not wait for full lists or history');
        assert.equal(await detail.locator('.task-diff-body').count(), 0, '统计在进入详情时已显示，差异仍按需读取');
        await detail.locator('[data-task-content="changes"]').click();
        const diff = detail.locator('.task-diff-body');
        await diff.getByText('worktree-current', { exact: false }).waitFor();
        await diff.getByText('file-start', { exact: false }).first().waitFor();
        await diff.getByText('file-end', { exact: false }).first().waitFor();
        await firstChangeVisible();
        if (width === 390) {
          assert.match(await detail.locator('.task-diff-mode .ant-segmented-item-selected').innerText(), /上下对比/);
          assert.match(await detail.locator('[aria-label="上下差异"]').innerText(), /−old/);
          await singleLineNumbers();
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
          await firstChangeVisible();
          await singleLineNumbers();
          assert.match(await detail.locator('.task-diff-text').innerText(), /−old/);
          assert.match(await detail.locator('.task-diff-text').innerText(), /\+worktree-current/);
          assert.match(await modes.locator('.ant-segmented-item-selected').innerText(), /上下对比/);
          await modes.getByText('左右对比', { exact: true }).click();
          await detail.locator('.task-diff-split').waitFor();
          await firstChangeVisible();
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
          await detail.locator('#task-detail-refresh').click();
          await page.waitForFunction(() => document.querySelector('#task-detail-refresh')?.getAttribute('aria-busy') === 'false');
          assert.equal(await detail.locator('.task-diff-split-side').first().evaluate((node: HTMLElement) => node.scrollTop), 180, 'split refresh preserves manual reading position');
          await assertAlignedRows();
          await detail.locator('.task-rail-body > section > .task-changed-list .task-changed-row').click();
          await firstChangeVisible();
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
        await firstChangeVisible();
        assert.doesNotMatch(await diff.innerText(), /worktree-current|commit-earlier/);
        await detail.locator('.task-rail-commit').nth(1).click();
        await detail.locator('.task-rail-commits > li').nth(1).locator('.task-changed-row').click();
        await diff.getByText('commit-earlier', { exact: false }).waitFor();
        await firstChangeVisible();
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
      // The narrow view can show its short preview before the complete diff's
      // first-selection positioning finishes. Establish the manual baseline only
      // after that positioning, so this case measures same-file refresh alone.
      await page.waitForFunction(() => document.querySelector('.task-diff-reader')?.getAttribute('aria-busy') === 'false');
      await firstChangeVisible();
      await detail.locator('.task-diff-body').evaluate((node: HTMLElement) => { node.scrollTop = 600; });
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
      assert.equal(await detail.locator('.task-diff-body').evaluate((node: HTMLElement) => node.scrollTop), 600, 'same-file refresh preserves manual reading position');
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
      currentText = 'unchanged-only';
      await detail.locator('#task-detail-refresh').click();
      await detail.locator('.task-diff-body').getByText('unchanged-only-0', { exact: true }).waitFor();
      await detail.locator('.task-diff-body').evaluate((node: HTMLElement) => { node.scrollTop = 600; });
      await detail.locator('.task-rail-body > section > .task-changed-list .task-changed-row').click();
      await page.waitForFunction(() => document.querySelector('.task-diff-body')?.scrollTop === 0);
      assert.equal(await detail.locator('.line-add, .line-del').count(), 0, 'unchanged rename starts at the text beginning');

    } finally { release?.(); fullRelease?.(); await page.unroute(pattern); await page.unroute(fullPattern); await page.unroute(countPattern); }
  });

  await t.test('任务说明：慢读取、快速切换、返回复用与主动刷新', async () => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    const first = 'browser-task', second = 'layout-reading-other', third = 'layout-reading-more';
    let extraTask = false, releaseList: (() => void) | null = null;
    const listPattern = /\/api\/v1\/workspaces\/[^/]+\/tasks(?:\?[^/]*)?$/;
    const otherPattern = `**/tasks/${second}`;
    const contextPattern = `**/tasks/${second}/work-context`;
    const changedPattern = `**/tasks/${second}/changed-file-count`;
    const firstCountPattern = `**/tasks/${first}/changed-file-count`;
    const materialsPattern = `**/tasks/${second}/materials`;
    const contextsPattern = /\/tasks\/work-contexts\?/;
    const changePattern = /\/tasks\/(browser-task|layout-reading-other)\/changes\/demo\/browser-flow$/;
    const detailPattern = /\/tasks\/(browser-task|layout-reading-other)(?:\?[^/]*)?$/;
    const counts = { first: 0, second: 0, scans: 0, counts: 0, diffs: 0 };
    let text = '说明甲';
    let gate: Promise<void> | null = null, release: (() => void) | null = null;
    let arrived: (() => void) | null = null;
    const scans = (request: any) => { if (request.url().includes('/changed-files')) counts.scans += 1; if (request.url().includes('/changed-file-count')) counts.counts += 1; if (request.url().includes('/file-diff?')) counts.diffs += 1; };
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
    await page.route(firstCountPattern, async (route: any) => {
      const response = await route.fetch(); const payload = await response.json();
      if (gate) await gate;
      await route.fulfill({ response, json: { ...payload, fileCount: 2 } });
    });
    await page.route(changedPattern, async (route: any) => {
      const response = await route.fetch({ url: route.request().url().replace(second, first) });
      const payload = await response.json();
      await route.fulfill({ response, json: { ...payload, taskId: second, fileCount: 7 } });
    });
    await page.route(contextPattern, (route: any) => route.fulfill({ json: { schemaVersion: 'buildr.task-work-context/v1', taskId: second, context: null, contextDigest: null } }));
    await page.route(materialsPattern, async (route: any) => {
      const response = await route.fetch({ url: route.request().url().replace(second, first) });
      const payload = await response.json();
      payload.taskId = second;
      await route.fulfill({ response, json: payload });
    });
    await page.route(contextsPattern, async (route: any) => {
      const url = new URL(route.request().url()); url.searchParams.set('ids', first);
      const response = await route.fetch({ url: url.href });
      const payload = await response.json();
      payload.items.push({ schemaVersion: 'buildr.task-work-context/v1', taskId: second, context: null, contextDigest: null });
      if (extraTask) payload.items.push({ schemaVersion: 'buildr.task-work-context/v1', taskId: third, context: null, contextDigest: null });
      await route.fulfill({ response, json: payload });
    });
    await page.route(changePattern, async (route: any) => {
      const response = await route.fetch({ url: route.request().url().replace(second, first) });
      await route.fulfill({ response });
    });
    await page.route(detailPattern, async (route: any) => {
      const isFirst = new URL(route.request().url()).pathname.endsWith(`/tasks/${first}`);
      counts[isFirst ? 'first' : 'second'] += 1;
      const content = isFirst ? text : '说明乙';
      const response = await route.fetch({ url: route.request().url().replace(second, first) });
      const payload = await response.json();
      payload.record = { ...payload.record, taskId: isFirst ? first : second, title: isFirst ? payload.record.title : '切换说明任务', brief: `# ${content}\n\n当前任务说明正文。` };
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
      assert.doesNotMatch(await page.locator('.pane-right:visible').innerText(), /说明甲/);
      await row(second).click();
      await content.getByRole('heading', { name: '说明乙', exact: true }).waitFor();
      release!(); gate = null;
      assert.doesNotMatch(await content.innerText(), /说明甲/);
      await page.locator('[data-task-content="changes"] .task-badge').filter({ hasText: '7' }).waitFor();
      assert.ok(counts.counts >= 1, '从列表打开可见任务即读取改动统计');
      assert.equal(counts.scans, 0, 'brief never loads full lists');
      assert.equal(counts.diffs, 0, '任务说明不提前读取具体文件差异');
      await row(first).click();
      await content.getByRole('heading', { name: '说明甲', exact: true }).waitFor();
      await page.locator('[data-task-content="changes"] .task-badge').filter({ hasText: '2' }).waitFor();
      assert.ok(counts.counts >= 2, '切换回已读任务也重核改动数量');
      const header = await page.locator('#task-detail-main').evaluate((root: HTMLElement) => {
        const title = root.querySelector<HTMLElement>('#task-detail-title')!.getBoundingClientRect();
        const metadata = root.querySelector<HTMLElement>('#task-work-context')!;
        const bounds = metadata.getBoundingClientRect();
        const intent = root.querySelector<HTMLElement>('#task-detail-intent')!.getBoundingClientRect();
        return { titleBottom: title.bottom, metadataTop: bounds.top, metadataBottom: bounds.bottom, intentTop: intent.top, idInMetadata: Boolean(metadata.querySelector('#task-detail-id')), updated: metadata.querySelector('time')?.textContent };
      });
      assert.ok(header.idInMetadata && header.updated?.includes('最后更新'), '标题下的同一模块保留任务编码与更新时间');
      assert.ok(header.metadataTop >= header.titleBottom && header.intentTop >= header.metadataBottom, `任务信息在名称下、意图前：${JSON.stringify(header)}`);
      assert.ok(header.metadataTop - header.titleBottom <= 12, '任务信息紧接名称下方');
      assert.ok(header.intentTop - header.metadataBottom <= 12, '意图与任务信息保持紧凑间距');
      const beforeReturn = counts.second;
      await row(second).click();
      await content.getByRole('heading', { name: '说明乙', exact: true }).waitFor();
      assert.ok(counts.second <= beforeReturn + 1, '返回只重核一次任务记录');
      await row(first).click();
      await content.getByRole('heading', { name: '说明甲', exact: true }).waitFor();
      gate = new Promise<void>(resolve => { release = resolve; });
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
      assert.equal(counts.first, beforeRefresh + 1, '刷新只读取一次任务记录正文');
      assert.equal(counts.diffs, 0, '说明刷新仍不读取文件差异');
      await page.waitForLoadState('networkidle');
    } finally {
      release?.(); releaseList?.(); page.off('request', scans);
      await page.unroute(listPattern); await page.unroute(otherPattern); await page.unroute(detailPattern); await page.unroute(changePattern); await page.unroute(contextPattern); await page.unroute(changedPattern); await page.unroute(firstCountPattern); await page.unroute(materialsPattern); await page.unroute(contextsPattern);
    }
  });

}
