import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Page } from 'playwright-core';

export const publicationTestPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64');

type Context = {
  t: TestContext; page: Page; workspaceRoot: string; workspaceUrl: string;
  expectedBrowserErrors: Set<string>;
  selectAntdOption(page: Page, id: string, text: string): Promise<unknown>;
  capture(page: Page, name: string): Promise<unknown>;
};

export async function runPublicationJourney({ t, page, workspaceRoot, workspaceUrl, expectedBrowserErrors, selectAntdOption, capture }: Context) {
  const root = path.join(workspaceRoot, 'projects/product/docs/publications');
  const apiBase = `${new URL(workspaceUrl).origin}/api/v1${new URL(workspaceUrl).pathname}`;
  const visible = () => page.locator('.workspace-page:not([hidden])');
  let createdId = '', createdFile = '', imageRef = '', attachmentRef = '';

  await t.test('旧文章链接保留真实图片，文章列表搜索与阅读往返保持条件', async () => {
    await page.goto(`${workspaceUrl}/articles/browser-article`);
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    assert.equal(await visible().locator('#publication-title').innerText(), '浏览器测试文章');
    const image = visible().locator('.publication-body img');
    await image.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const image = document.querySelector('.workspace-page:not([hidden]) .publication-body img') as HTMLImageElement | null;
      return Boolean(image?.complete && image.naturalWidth);
    });
    assert.match(decodeURIComponent((await image.getAttribute('src')) || ''), /\/projects\/product\/publications\/browser-article\/assets\/assets\/cover\.png$/);
    await page.locator('[data-nav="articles"]').click();
    await visible().locator('#articles-search').fill('浏览器测试');
    await visible().getByRole('link', { name: '浏览器测试文章', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    await visible().getByRole('link', { name: /返回文章|文章列表/ }).first().click();
    assert.equal(await visible().locator('#articles-search').inputValue(), '浏览器测试');
    await visible().locator('#articles-search').fill('');
  });

  await t.test('新建编辑真实文章，上传图片附件后插入并保存引用', async () => {
    await page.goto(`${workspaceUrl}/articles`);
    await visible().locator('.publication-page-head').getByRole('button', { name: /新建文章/ }).click();
    await selectAntdOption(page, 'article-create-project', 'Buildr Product');
    await page.locator('#article-create-title').fill('文章资源浏览器验证');
    await page.getByRole('button', { name: '创建草稿', exact: true }).click();
    await visible().locator('#article-edit-content').waitFor({ state: 'visible' });
    assert.match(page.url(), /\/articles\/product\/[^/]+\/edit$/);
    createdId = new URL(page.url()).pathname.split('/').at(-2)!;
    createdFile = path.join(root, `${createdId}.md`);
    assert.equal(fs.existsSync(createdFile), true);
    await visible().locator('#article-edit-summary').fill('上传、引用与真实文件保存。');
    await visible().locator('#article-edit-content').fill('## 图片与附件\n\n本轮资源验证正文。\n');
    await visible().locator('#article-asset-file').setInputFiles({ name: 'upload-image.png', mimeType: 'image/png', buffer: publicationTestPng });
    const insertImage = visible().locator('[data-insert-asset*="upload-image-"]');
    await insertImage.waitFor({ state: 'visible' });
    imageRef = (await insertImage.getAttribute('data-insert-asset'))!;
    assert.equal(fs.existsSync(path.join(root, imageRef)), true);
    assert.doesNotMatch(fs.readFileSync(createdFile, 'utf8'), /upload-image-/);
    await insertImage.click();
    assert.match(await visible().locator('#article-edit-content').inputValue(), /!\[[^\]]+\]\(assets\/upload-image-/);
    assert.match(await visible().locator('#article-edit-content').inputValue(), /^## 图片与附件/m);
    await visible().locator('#article-asset-file').setInputFiles({ name: 'reference.txt', mimeType: 'text/plain', buffer: Buffer.from('article attachment example', 'utf8') });
    const insertAttachment = visible().locator('[data-insert-asset*="reference-"]');
    await insertAttachment.waitFor({ state: 'visible' });
    attachmentRef = (await insertAttachment.getAttribute('data-insert-asset'))!;
    await insertAttachment.click();
    await visible().locator('#article-save').click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    const source = fs.readFileSync(createdFile, 'utf8');
    const stored = await (await page.request.get(`${apiBase}/projects/product/publications/${createdId}`)).json();
    assert.equal(stored.publication.summary, '上传、引用与真实文件保存。');
    assert.ok(source.includes(imageRef) && source.includes(attachmentRef));
    await page.reload();
    await visible().locator('.publication-body img').waitFor({ state: 'visible' });
    const attachment = visible().locator('.publication-body a[href*="reference-"]');
    await attachment.waitFor({ state: 'visible' });
    const response = await page.request.get(new URL((await attachment.getAttribute('href'))!, workspaceUrl).href);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-disposition'], /^attachment;/);
    assert.equal(await response.text(), 'article attachment example');
    await visible().getByRole('button', { name: '收藏当前资料', exact: true }).click();
    await visible().getByRole('button', { name: '取消收藏当前资料', exact: true }).waitFor({ state: 'visible' });
    await capture(page, 'article-resources-reader.png');
  });

  await t.test('外部修改冲突保留编辑，删除正文不删除共享资源，窄屏资源可用', async () => {
    await visible().getByRole('button', { name: /编辑文章/ }).click();
    await visible().locator('#article-edit-title').waitFor({ state: 'visible' });
    await visible().locator('#article-edit-title').fill('保留我的编辑标题');
    fs.appendFileSync(createdFile, '\n外部编辑新增的一段。\n');
    expectedBrowserErrors.add(`${apiBase}/projects/product/publications/${createdId}`);
    await visible().locator('#article-save').click();
    await visible().getByText(/文章已被其他入口修改|稿件已变化|保存冲突/).first().waitFor({ state: 'visible' });
    assert.equal(await visible().locator('#article-edit-title').inputValue(), '保留我的编辑标题');
    assert.match(fs.readFileSync(createdFile, 'utf8'), /外部编辑新增的一段/);
    assert.doesNotMatch(fs.readFileSync(createdFile, 'utf8'), /title: 保留我的编辑标题/);
    await page.setViewportSize({ width: 390, height: 844 });
    await visible().locator('#article-asset-upload').scrollIntoViewIfNeeded();
    assert.equal(await visible().locator('#article-asset-upload').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await capture(page, 'article-resource-editor-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
    await visible().getByRole('button', { name: /^取\s*消$/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '放弃修改', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    await visible().getByRole('button', { name: '更多文章操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '删除文章', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除文章', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/articles`);
    assert.equal(fs.existsSync(createdFile), false);
    assert.equal(fs.existsSync(path.join(root, imageRef)), true);
    assert.equal(fs.existsSync(path.join(root, attachmentRef)), true);
    expectedBrowserErrors.add(`${apiBase}/projects/product/publications/missing`);
    await page.goto(`${workspaceUrl}/articles/missing`);
    await visible().getByText('文章不可用', { exact: true }).waitFor({ state: 'visible' });
  });
}
