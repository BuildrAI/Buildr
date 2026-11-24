import assert from 'node:assert/strict';

export async function runCodeExplorerJourney({ t, page, workspaceUrl, capture }: any) {
  await t.test('代码资源管理器按文件名与内容检索、浏览 Markdown 并切换关闭文件页签', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${workspaceUrl}/code/explorer`);
    await page.locator('.code-explorer-stage:visible').waitFor();
    await page.locator('.repository-root-name').first().waitFor();

    const searchInput = page.getByRole('textbox', { name: '搜索文件', exact: true });
    await searchInput.fill('main.ts');
    await page.locator('.repository-search-result[data-file-path="projects/demo/services/api/src/main.ts"]').click();
    await page.locator('.file-editing-pane:visible .cm-content').filter({ hasText: 'explorerAnswer' }).waitFor();

    await page.getByRole('button', { name: /^搜索范围/ }).click();
    await page.getByRole('menuitem', { name: '内容', exact: true }).click();
    await searchInput.fill('explorerAnswer');
    await page.locator('.repository-search-occurrence[data-match-line="1"]').first().click();
    await page.locator('.file-editing-pane:visible .cm-content').filter({ hasText: 'explorerAnswer' }).waitFor();

    await page.getByRole('button', { name: /^搜索范围/ }).click();
    await page.getByRole('menuitem', { name: '文件名', exact: true }).click();
    await searchInput.fill('README.md');
    await page.locator('.repository-search-result[data-file-path="projects/demo/services/api/README.md"]').click();
    await page.locator('.file-editing-pane:visible .markdown-body').filter({ hasText: 'Explorer document' }).waitFor();
    await capture(page, 'code-explorer-smoke.png');

    const tabs = page.locator('.code-open-files [role="tab"]');
    assert.equal(await tabs.count(), 2);
    await tabs.filter({ hasText: 'main.ts' }).click();
    await page.locator('.file-editing-pane:visible .cm-content').filter({ hasText: 'explorerAnswer' }).waitFor();

    await page.getByRole('button', { name: '关闭文件 projects/demo/services/api/README.md', exact: true }).click();
    assert.equal(await tabs.count(), 1);
  });
}
