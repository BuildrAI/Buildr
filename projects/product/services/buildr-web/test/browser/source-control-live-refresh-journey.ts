import { showPrimaryNavigation } from './primary-navigation-controls.ts';
import assert from 'node:assert/strict';
import { codeRepositoryCode } from '../../src/features/code/code-source-labels.ts';

/** External filesystem/Git writes belong to the isolated host fixture. All UI observations use production HTTP. */
export async function runSourceControlLiveRefreshJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors, scenario = (name: string, action: () => Promise<void>) => t.test(name, action)}: any) {
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  const sourceControl = () => page.locator('.code-source-control-page:visible');
  const diff = () => sourceControl().getByRole('region', {name: '差异内容', exact: true});
  const longText = (version: number) => Array.from({length: 150}, (_, index) => `export const liveRefreshLine${index + 1} = ${version};`).join('\n') + '\n';
  const catalog = async () => {
    const response = await page.request.get(api + '/code/source-control');
    assert.equal(response.status(), 200);
    return response.json();
  };
  const identify = (value: any, location: string) => {
    const repository = value.repositories.find((item: any) => item.worktrees.some((tree: any) => tree.location === location));
    assert.ok(repository, '真实目录必须属于已登记代码库');
    const worktree = repository.worktrees.find((item: any) => item.location === location);
    return {repository, worktree};
  };
  const changedRow = (worktreeId: string, filePath: string) => sourceControl().locator('[data-change-worktree="' + worktreeId + '"] [data-change-area="working"] .task-changed-row')
    .filter({has: page.locator('.task-changed-path[data-file-path="' + filePath + '"]')});
  const readRequests = () => {
    const reads: Array<{repositoryId: string | null; operation: string; observation: string | null}> = [];
    const observe = (request: any) => {
      const url = new URL(request.url());
      if (url.pathname === new URL(api).pathname + '/code/source-control') reads.push({repositoryId: url.searchParams.get('repositoryId'), operation: 'source-control', observation: url.searchParams.get('observation')});
    };
    page.on('request', observe);
    return {reads, reset: () => {reads.length = 0;}, dispose: () => page.off('request', observe)};
  };
  const assertLocalReads = (reads: Array<{repositoryId: string | null}>, repositoryId: string) => {
    assert.ok(reads.some(read => read.repositoryId === repositoryId), '外部变化必须经单库真实读取核对');
    assert.deepEqual([...new Set(reads.map(read => read.repositoryId))], [repositoryId], '保存不能触发全目录或其他代码库状态读取');
    assert.ok(reads.length <= 6, '少量连续保存应合并为有界读取：' + JSON.stringify(reads));
  };
  const settledDiff = async (text: string) => {
    await diff().getByText(text, {exact: false}).waitFor();
    await sourceControl().locator('.source-control-diff > .source-control-read-status').waitFor({state: 'hidden'});
  };
  const selectWorktree = async (repositories: any, member: any) => {
    const repository = repositories.repositories.find((item: any) => item.id === member.repositoryId);
    assert.ok(repository);
    const repositorySelect = page.locator('.code-root-selectors .ant-select').nth(0);
    await repositorySelect.getByRole('combobox').focus();await repositorySelect.getByRole('combobox').press('ArrowDown');
    const repositoryListId = await repositorySelect.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has: page.locator('[id="' + repositoryListId + '"]')}).getByText(codeRepositoryCode(repository), {exact: true}).click();
    await repositorySelect.getByRole('combobox').press('Escape');
    const worktreeSelect = page.locator('.code-root-selectors .ant-select').nth(1);
    await worktreeSelect.locator('.ant-select-selector').click();
    const worktreeListId = await worktreeSelect.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has: page.locator('[id="' + worktreeListId + '"]')}).locator('[data-code-worktree-id="' + member.id + '"]').click();
    await worktreeSelect.getByRole('combobox').press('Escape');
  };

  await scenario('自动刷新：未打开源代码管理时外部保存更新入口、文件和祖先提示且只读取受影响库', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.liveRefresh.removeUntrackedKeep();
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto(workspaceUrl + '/code/explorer');
      await page.locator('.repository-root-name').first().waitFor();
      assert.equal(await sourceControl().count(), 0, '本次页面从资源管理器开始，尚未打开源代码管理');
      const response = await page.request.get(api + '/code/repositories');
      assert.equal(response.status(), 200);
      const repositories = await response.json();
      const member = repositories.worktrees.find((item: any) => item.path === branches.location);
      assert.ok(member);
      await selectWorktree(repositories, member);
      await page.getByRole('textbox', {name: '搜索文件', exact: true}).click();
      const root = page.locator('.repository-root-name[data-repository-id="' + member.repositoryId + '"]');
      await root.waitFor();
      const rootNode = root.locator('xpath=ancestor::*[contains(@class,"ant-tree-treenode")][1]');
      if (await rootNode.getAttribute('aria-expanded') !== 'true') await root.click();
      const directory = page.locator('.repository-tree-body .ant-tree-title').filter({hasText: /^scm-browser-branches$/u});
      await directory.waitFor();
      await directory.click();
      const file = page.locator('.repository-tree-file[data-file-path="' + branches.liveRefresh.path + '"]');
      await file.waitFor();
      assert.equal(await file.locator('.repository-status').count(), 0, '目标文件原先没有未提交标记');
      assert.equal(await page.locator('.repository-tree-directory[data-directory-path="scm-browser-branches"][data-has-changes="true"]').count(), 0, '目标文件的目录原先没有改动提示');
      // This shared fixture already contains other changes. The circle may be
      // present initially, so the new file/ancestor marks and local read prove
      // propagation rather than treating an existing circle as a transition.
      await catalog();
      const requests = readRequests();
      try {
        branches.liveRefresh.write(longText(41));
        await page.locator('.repository-tree-file[data-file-path="' + branches.liveRefresh.path + '"][data-code-status="M"]').waitFor();
        await showPrimaryNavigation(page, 'code');await page.locator('.primary-secondary-navigation:visible [data-nav="source-control"][data-has-changes="true"] .shell-nav-change-dot').waitFor();await page.locator('.primary-navigation-rail button[data-nav="code"]').press('Escape');
        await page.locator('.repository-tree-directory[data-directory-path="scm-browser-branches"][data-has-changes="true"] .repository-directory-change-dot').waitFor();
        assert.equal(await root.getAttribute('data-has-changes'), 'true', '同一资源树根也显示后代变化');
        assertLocalReads(requests.reads, member.repositoryId);
        assert.equal(await sourceControl().count(), 0, '状态传播无需挂载源代码管理页面');
        await capture(page, 'source-control-live-refresh-explorer.png');
        await page.mouse.move(5,5);await showPrimaryNavigation(page, 'code');await page.locator('.primary-secondary-navigation:visible [data-nav="source-control"]').click();
        const source = identify(await catalog(), branches.location);
        await sourceControl().locator('[data-source-repository="' + source.repository.id + '"] [data-source-worktree="' + source.worktree.worktreeId + '"] .source-control-repository-copy').click();
        await changedRow(source.worktree.worktreeId, branches.liveRefresh.path).click();
        await settledDiff('liveRefreshLine1 = 41');
      } finally {requests.dispose();}
    });
  });

  await scenario('缓存恢复：重载先显示上次来源分支与数量，真实核对后解锁且后台核对保留提交说明', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.liveRefresh.write(longText(53));
      await page.setViewportSize({width: 1800, height: 1000});
      await page.goto(workspaceUrl + '/code/source-control');
      await sourceControl().locator('.source-control-repository-copy').first().waitFor();
      const refresh = () => sourceControl().getByRole('button', {name: '刷新源代码管理', exact: true});
      const footer = () => sourceControl().locator('footer.source-control-observed');
      const statusPath = new URL(api).pathname + '/code/source-control';
      const matchesStatus = (url: URL) => url.pathname === statusPath;
      const workspaceId = decodeURIComponent(new URL(workspaceUrl).pathname.split('/workspaces/')[1].split('/')[0]);
      const cacheKey = 'buildr:source-control-cache:v1:' + workspaceId;
      // A complete explicit read, not a seeded localStorage value, establishes the save.
      await refresh().click();
      await refresh().locator('.anticon-spin').waitFor({state: 'hidden'});
      const actual = await catalog(), source = identify(actual, branches.location);
      assert.equal(source.worktree.branch, branches.branch);
      assert.equal(source.worktree.status, 'complete');
      assert.ok(source.worktree.fileCount > 0, '夹具的真实修改使数量与写入禁用断言具有区分力');
      const repositoryIds = actual.repositories.map((repository: any) => repository.id).sort();
      await page.waitForFunction(({key, repositoryIds, worktreeId, branch, fileCount}: any) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const saved = JSON.parse(raw), repositories = saved.data.repositories;
        const worktree = repositories.flatMap((repository: any) => repository.worktrees).find((item: any) => item.worktreeId === worktreeId);
        return JSON.stringify(repositories.map((repository: any) => repository.id).sort()) === JSON.stringify(repositoryIds)
          && !repositories.some((repository: any) => repository.diagnostics.some((item: any) => item.code === 'code_source_control_pending'))
          && worktree?.branch === branch && worktree.fileCount === fileCount;
      }, {key: cacheKey, repositoryIds, worktreeId: source.worktree.worktreeId, branch: branches.branch, fileCount: source.worktree.fileCount});
      await footer().getByText('本机记录', {exact: true}).waitFor();
      await sourceControl().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}).press('End');
      // Child identity belongs to its wrapper, rather than the responsive row itself.
      const row = () => sourceControl().locator('[data-source-repository="' + source.repository.id + '"] [data-source-worktree="' + source.worktree.worktreeId + '"] > .source-control-worktree');
      await row().locator('.source-control-repository-copy').click();
      await row().locator('.source-control-row-branch-name').waitFor();
      const visibleSources = () => sourceControl().locator('.source-control-repository:visible,.source-control-worktree:visible').evaluateAll((elements: HTMLElement[]) => elements.map(element => ({
        repositoryId: element.closest('[data-source-repository]')!.getAttribute('data-source-repository'),
        worktreeId: element.getAttribute('data-source-worktree') || element.closest('[data-source-worktree]')?.getAttribute('data-source-worktree'),
        name: element.querySelector('.source-control-row-name-text')!.textContent,
        branch: element.querySelector('.source-control-row-branch-name')?.textContent,
        counts: [...element.querySelectorAll('.source-control-status-count')].map(count => [count.getAttribute('data-status-kind'), count.querySelector('.source-control-status-number')!.textContent]),
      })));
      const visibleBefore = await visibleSources();
      assert.ok(visibleBefore.length > 0);
      assert.equal(await row().locator('[data-status-kind="files"] .source-control-status-number').innerText(), String(source.worktree.fileCount));
      const savedBefore = await page.evaluate((key: string) => localStorage.getItem(key), cacheKey);
      const requests = readRequests();
      let release = () => {};
      let gate: Promise<void>;
      const hold = () => { gate = new Promise<void>(resolve => {release = resolve;}); };
      const intercepted: any[] = [], completed: any[] = [], handlers = new Set<Promise<void>>();
      const onResponse = (response: any) => { if (intercepted.includes(response.request())) completed.push(response); };
      const delayStatus = (route: any) => {
        const request = route.request();
        if (request.method() !== 'GET') return route.continue();
        intercepted.push(request);
        // Only timing changes. Continue to the real production host without fulfilling JSON.
        const pending = gate.then(() => route.continue());
        handlers.add(pending);
        void pending.then(() => handlers.delete(pending), () => handlers.delete(pending));
        return pending;
      };
      const waitRealRepositories = () => Promise.all(repositoryIds.map((repositoryId: string) => page.waitForResponse((response: any) => {
        const url = new URL(response.url());
        return matchesStatus(url) && url.searchParams.get('repositoryId') === repositoryId;
      }).then(async (response: any) => {
        assert.equal(response.status(), 200);
        assert.equal(await response.finished(), null);
        const value = await response.json();
        assert.ok(value.repositories.some((repository: any) => repository.id === repositoryId), '真实响应包含请求的代码库');
        return value;
      })));
      const renderSettled = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      hold();
      page.on('response', onResponse);
      try {
        await page.route(matchesStatus, delayStatus);
        const reloadRequest = page.waitForRequest((request: any) => matchesStatus(new URL(request.url())));
        await page.reload();
        await reloadRequest;
        await footer().locator('[role="status"]').waitFor();
        assert.equal(await footer().getAttribute('data-source-control-cached'), 'true');
        assert.match(await footer().innerText(), /上次结果/);
        assert.match(await footer().innerText(), /正在核对/);
        assert.deepEqual(await visibleSources(), visibleBefore, '状态响应尚未返回时已恢复可见来源、分支和数量');
        assert.equal(await row().locator('.source-control-row-branch-name').isVisible(), true);
        assert.equal(await row().locator('.source-control-row-action-button').isDisabled(), true, '缓存分支不能打开管理层');
        const menuButton = row().locator('.source-control-row-menu-button');
        const menuLabel = await menuButton.getAttribute('aria-label');
        await menuButton.click();
        const menu = page.getByRole('menu', {name: menuLabel, exact: true});
        for (const label of ['管理分支', '同步', '获取远程']) assert.equal(await menu.getByRole('menuitem', {name: label, exact: true}).getAttribute('aria-disabled'), 'true', '缓存不能开启 ' + label);
        await menuButton.press('Escape');
        const catalogMenuButton = sourceControl().getByRole('button', {name: '源代码管理操作菜单', exact: true});
        await catalogMenuButton.click();
        const catalogMenu = page.getByRole('menu', {name: '源代码管理操作菜单', exact: true});
        for (const label of ['全部同步', '全部获取远程']) assert.equal(await catalogMenu.getByRole('menuitem', {name: label, exact: true}).getAttribute('aria-disabled'), 'true', '缓存不能开启 ' + label);
        await catalogMenuButton.press('Escape');
        await row().locator('.source-control-repository-copy').click();
        const message = () => sourceControl().getByRole('textbox', {name: '提交说明内容', exact: true});
        const draft = '缓存恢复后继续编辑的提交说明';
        await message().fill(draft);
        for (const selector of ['#commit-changes', '#commit-action-menu', '.source-control-discard-icon']) {
          const buttons = sourceControl().locator(selector);
          assert.ok(await buttons.count() > 0, '缓存下仍展示但禁用 ' + selector);
          for (const button of await buttons.all()) assert.equal(await button.isDisabled(), true, '缓存不能授权写入 ' + selector);
        }
        assert.ok(intercepted.length > 0);
        assert.equal(completed.length, 0, '缓存验收发生在所有被延迟状态响应完成之前');
        await capture(page, 'source-control-cache-restored-before-network.png');
        const restoredResponses = waitRealRepositories();
        release();
        const restored = await restoredResponses;
        const restoredSource = identify(restored.find(value => value.repositories.some((repository: any) => repository.id === source.repository.id)), branches.location);
        assert.equal(restoredSource.worktree.branch, branches.branch);
        assert.equal(restoredSource.worktree.fileCount, source.worktree.fileCount);
        await footer().getByText('本机记录', {exact: true}).waitFor();
        assert.notEqual(await footer().getAttribute('data-source-control-cached'), 'true');
        await page.waitForFunction(({key, previous}: any) => localStorage.getItem(key) !== previous, {key: cacheKey, previous: savedBefore});
        await sourceControl().locator('#commit-changes:not([disabled])').waitFor();
        assert.equal(await message().inputValue(), draft, '首次真实核对不清理已输入说明');
        assert.equal(await row().locator('.source-control-row-action-button').isDisabled(), false, '真实读取后恢复分支入口');

        // Focus is a production background reconciliation trigger; do not publish a fake change notice.
        const savedAfterRestore = await page.evaluate((key: string) => localStorage.getItem(key), cacheKey);
        const beforeBackground = intercepted.length;
        hold();
        const backgroundRequest = page.waitForRequest((request: any) => matchesStatus(new URL(request.url())));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await backgroundRequest;
        assert.equal(await message().inputValue(), draft);
        const backgroundResponses = waitRealRepositories();
        release();
        const unchanged = await backgroundResponses;
        const unchangedSource = identify(unchanged.find(value => value.repositories.some((repository: any) => repository.id === source.repository.id)), branches.location);
        assert.equal(unchangedSource.worktree.observedRevision, restoredSource.worktree.observedRevision, '后台真实核对没有文件变化');
        assert.equal(unchangedSource.worktree.branch, restoredSource.worktree.branch);
        assert.equal(unchangedSource.worktree.fileCount, restoredSource.worktree.fileCount);
        assert.ok(intercepted.slice(beforeBackground).every(request => new URL(request.url()).searchParams.get('observation') === 'shared'), '后台核对使用共享观察');
        await page.waitForFunction(({key, previous}: any) => localStorage.getItem(key) !== previous, {key: cacheKey, previous: savedAfterRestore});
        await renderSettled();
        assert.equal(await message().inputValue(), draft, '无变化后台核对完成后仍保留提交说明');

        requests.reset();
        const manualResponses = waitRealRepositories();
        await refresh().click();
        await manualResponses;
        await refresh().locator('.anticon-spin').waitFor({state: 'hidden'});
        assert.ok(requests.reads.length > 0, '主动刷新确实发起状态请求');
        assert.ok(requests.reads.every(read => read.observation === null), '主动刷新全部请求不带 observation=shared：' + JSON.stringify(requests.reads));
        assert.equal(await message().inputValue(), draft);
        await capture(page, 'source-control-cache-confirmed-draft-preserved.png');
      } finally {
        release();
        try {
          await page.unroute(matchesStatus, delayStatus);
          await Promise.allSettled([...handlers]);
        } finally {
          page.off('response', onResponse);
          requests.dispose();
        }
      }
    });
  });
}
