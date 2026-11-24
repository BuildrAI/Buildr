import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Page } from 'playwright-core';

export const publicationTestPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64');

type Context = {
  t: TestContext; page: Page; runtime: any; workspaceRoot: string; workspaceUrl: string; otherWorkspaceUrl: string;
  expectedBrowserErrors: Set<string>;
  selectAntdOption(page: Page, id: string, text: string): Promise<unknown>;
  capture(page: Page, name: string): Promise<unknown>;
};

export async function runPublicationJourney({ t, page, workspaceRoot, workspaceUrl, selectAntdOption, capture }: Context) {
  const publicationsRoot = path.join(workspaceRoot, 'projects/product/docs/publications');
  const visible = () => page.locator('.workspace-page:not([hidden])');
  const editor = () => page.locator('#article-editor');

  await t.test('文章列表检索并打开阅读详情与内嵌图片', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${workspaceUrl}/articles`);
    await visible().locator('#articles-search').fill('浏览器测试');
    await visible().getByRole('link', { name: '浏览器测试文章', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    assert.equal(await visible().locator('#publication-title').innerText(), '浏览器测试文章');

    const image = visible().locator('.publication-body img');
    await image.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const node = document.querySelector('.workspace-page:not([hidden]) .publication-body img') as HTMLImageElement | null;
      return Boolean(node?.complete && node.naturalWidth > 0);
    });
    await capture(page, 'article-reading.png');
  });

  await t.test('新建文章草稿、编辑摘要与正文并保存持久化', async () => {
    await page.goto(`${workspaceUrl}/articles`);
    await visible().locator('.publication-page-head').getByRole('button', { name: /新建文章/ }).click();
    await selectAntdOption(page, 'article-create-project', 'Buildr Product');
    await page.locator('#article-create-title').fill('精简浏览器新建文章');
    await page.getByRole('button', { name: '创建草稿', exact: true }).click();

    await editor().locator('#article-edit-content').waitFor({ state: 'visible' });
    const createdId = (await page.locator('#article-editor').getAttribute('data-publication-id'))!;
    assert.ok(createdId);
    const createdFile = path.join(publicationsRoot, `${createdId}.md`);
    assert.equal(fs.existsSync(createdFile), true);

    await editor().locator('#article-edit-summary').fill('精简浏览器新建文章摘要');
    await editor().locator('#article-edit-content').fill('## 精简验证正文\n\n确认创建、编辑和保存持久化正常。\n');
    await editor().locator('#article-save').click();
    await editor().waitFor({ state: 'hidden' });

    await page.goto(`${workspaceUrl}/articles/product/${createdId}`);
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    assert.equal(await visible().locator('#publication-title').innerText(), '精简浏览器新建文章');
    assert.equal(await visible().locator('#publication-copy').innerText(), '精简浏览器新建文章摘要');
    assert.match(await visible().locator('.publication-body').innerText(), /确认创建、编辑和保存持久化正常/);
    assert.match(fs.readFileSync(createdFile, 'utf8'), /确认创建、编辑和保存持久化正常/);
  });
}
