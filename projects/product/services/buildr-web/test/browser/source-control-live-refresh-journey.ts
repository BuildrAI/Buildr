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
    const reads: Array<{repositoryId: string | null; operation: string}> = [];
    const observe = (request: any) => {
      const url = new URL(request.url());
      if (url.pathname === new URL(api).pathname + '/code/source-control') reads.push({repositoryId: url.searchParams.get('repositoryId'), operation: 'source-control'});
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
}
