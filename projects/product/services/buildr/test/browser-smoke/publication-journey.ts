import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Locator, Page, Request } from 'playwright-core';

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
  const editor = () => page.locator('.publication-editor-drawer');
  const primaryTabs = () => page.getByRole('tablist', { name: '打开的页面', exact: true }).getByRole('tab');
  let createdId = '', createdFile = '', imageRef = '', attachmentRef = '';
  writeReadingFixture(workspaceRoot);
  const openKnowledgeSource = async (entry: Locator, sourceId: string) => {
    const base = new URL(apiBase), prefix = `${base.pathname}/knowledge/project/`;
    assert.equal(await entry.count(), 1, `来源 ${sourceId} 必须有唯一可点击入口`);
    await entry.waitFor({ state: 'visible' });
    const requested: string[] = [];
    const observe = (request: Request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET') requested.push(url.origin + url.pathname);
    };
    page.on('request', observe);
    try {
      const [response] = await Promise.all([
        page.waitForResponse(response => {
          const url = new URL(response.url());
          if (response.request().method() !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(prefix)) return false;
          const parts = url.pathname.slice(prefix.length).split('/');
          return parts.length === 3 && Boolean(parts[0]) && parts[1] === 'sources' && decodeURIComponent(parts[2]) === sourceId;
        }),
        entry.click(),
      ]);
      assert.equal(response.status(), 200);
      const data = await response.json();
      assert.equal(data.scope.kind, 'project');
      assert.equal(data.scope.code, 'product');
      assert.equal(data.observations.filter((item: { id: string }) => item.id === sourceId).length, 1);
      return data;
    } catch (error) {
      throw new Error(`读取来源 ${sourceId} 失败；点击后的 GET 请求：${requested.join('；') || '无'}`, { cause: error });
    } finally {
      page.off('request', observe);
    }
  };
  const verifyMarkdownSource = async (entry: Locator) => {
    const sourceData = await openKnowledgeSource(entry, 'file-explanation');
    assert.deepEqual(sourceData.artifacts, []);
    assert.match(sourceData.observations.find((item: { id: string }) => item.id === 'file-explanation')?.content || '', /!\[测试技术图\]\(\.\.\/archify\/diagram\.html\)/);

    const pane = visible().locator('.pane-right');
    const source = pane.locator('[data-knowledge-source="file-explanation"]:visible');
    const rendered = source.locator('[data-rendered-source]:visible');
    await rendered.waitFor({ state: 'visible' });
    await rendered.locator('iframe').waitFor({ state: 'visible' });
    assert.match((await rendered.locator('iframe').getAttribute('src')) || '', /\/artifacts\/browser-diagram\/view/);
    await rendered.locator('[data-knowledge-artifact="browser-map"]').waitFor({ state: 'visible' });
    assert.doesNotMatch(await rendered.innerText(), /!\[|\]\(\.\.\//);
    await rendered.getByRole('link', { name: '引用来源', exact: true }).waitFor({ state: 'visible' });

    await source.getByRole('button', { name: '查看原文', exact: true }).click();
    const raw = source.locator('pre[aria-label="只读来源"]');
    await raw.waitFor({ state: 'visible' });
    assert.match(await raw.innerText(), /!\[测试技术图\]\(\.\.\/archify\/diagram\.html\)/);
    assert.match(await raw.innerText(), /!\[测试地图\]\(\.\.\/code-map\/implementation\.md\)/);
    assert.equal(await source.locator('iframe:visible').count(), 0);
    await source.getByRole('button', { name: '阅读模式', exact: true }).click();
    await rendered.locator('iframe').waitFor({ state: 'visible' });
    await rendered.getByRole('link', { name: '引用来源', exact: true }).click();
    await pane.locator('[data-knowledge-source="browser-source"]:visible').getByText('这是真实来源说明。', { exact: false }).waitFor({ state: 'visible' });
    await pane.getByRole('button', { name: '← 返回Markdown 正文源', exact: true }).click();
    await rendered.locator('iframe').waitFor({ state: 'visible' });
    await rendered.locator('[data-knowledge-artifact="browser-map"]').waitFor({ state: 'visible' });

    const readingUrl = page.url();
    const guideData = await openKnowledgeSource(rendered.getByRole('link', { name: '建设指引', exact: true }), 'architecture-guide');
    const guideSource = guideData.observations.find((item: { id: string }) => item.id === 'architecture-guide');
    assert.equal(guideSource?.path, 'references/architecture-knowledge.md');
    assert.match(guideSource?.content || '', /^# 用户引导的架构知识建设/m);
    await pane.locator('[data-knowledge-source="architecture-guide"]:visible').getByRole('heading', { name: '用户引导的架构知识建设', exact: true }).waitFor({ state: 'visible' });
    assert.equal(page.url(), readingUrl);
    await pane.getByRole('button', { name: '← 返回Markdown 正文源', exact: true }).click();
    await rendered.locator('iframe').waitFor({ state: 'visible' });
    await rendered.locator('[data-knowledge-artifact="browser-map"]').waitFor({ state: 'visible' });
  };

  await t.test('旧文章链接保留真实图片，文章列表搜索与阅读往返保持条件', async () => {
    await page.setViewportSize({ width: 1680, height: 1000 });
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
    await visible().getByRole('button', { name: '← 返回', exact: true }).click();
    assert.equal(await visible().locator('#articles-search').inputValue(), '浏览器测试');
    await visible().locator('#articles-search').fill('');
  });

  await t.test('文章与知识复用副屏、展开保留阅读位置、旧编辑地址保持兼容', async () => {
    await visible().locator('#articles-search').fill('浏览器');
    const tabCount = await primaryTabs().count();
    await visible().getByRole('link', { name: '浏览器测试文章', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    assert.equal(await visible().locator('#articles-search').inputValue(), '浏览器');
    assert.equal(await primaryTabs().count(), tabCount);
    const readingPane = visible().locator('.pane-right > .pane-body');
    await readingPane.evaluate((pane: HTMLElement) => { pane.scrollTop = pane.scrollHeight - pane.clientHeight; });
    const readingTop = await readingPane.evaluate((pane: HTMLElement) => pane.scrollTop);
    assert.ok(readingTop > 1000);
    await visible().getByRole('button', { name: '展开阅读', exact: true }).click();
    await visible().getByRole('button', { name: '恢复分屏', exact: true }).click();
    await page.waitForFunction((top: number) => Math.abs((document.querySelector('.workspace-page:not([hidden]) .pane-right > .pane-body')?.scrollTop || 0) - top) < 3, readingTop);
    await visible().getByRole('button', { name: /浏览器知识说明 项目知识/ }).click();
    const knowledge = visible().locator('[data-knowledge-artifact="browser-explanation"]:visible');
    await knowledge.waitFor({ state: 'visible' });
    await knowledge.locator('iframe').waitFor({ state: 'visible' });
    await knowledge.locator('[data-knowledge-artifact="browser-map"]').waitFor({ state: 'visible' });
    assert.doesNotMatch(await knowledge.innerText(), /!\[|\]\(\.\.\//);
    await knowledge.getByRole('link', { name: '引用来源', exact: true }).click();
    await visible().getByText('这是真实来源说明。', { exact: false }).last().waitFor({ state: 'visible' });
    await visible().getByRole('button', { name: '← 返回浏览器知识说明', exact: true }).click();
    await knowledge.waitFor({ state: 'visible' });
    await visible().getByRole('button', { name: '展开阅读', exact: true }).click();
    assert.equal(await primaryTabs().count(), tabCount);
    await visible().getByRole('button', { name: '恢复分屏', exact: true }).click();
    assert.equal(await visible().locator('#articles-search').inputValue(), '浏览器');
    await capture(page, 'article-knowledge-split.png');
    await page.goto(`${workspaceUrl}/articles/product/browser-article/edit`);
    await editor().locator('#article-edit-content').waitFor({ state: 'visible' });
    assert.equal(await primaryTabs().count(), tabCount);
    await editor().locator('#article-edit-summary').fill('暂未保存的测试输入');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: '放弃尚未保存的修改？' }).waitFor({ state: 'visible' });
    await page.getByRole('dialog', { name: '放弃尚未保存的修改？' }).getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await editor().locator('#article-edit-summary').inputValue(), '暂未保存的测试输入');
    await editor().getByRole('button', { name: '关闭文章编辑', exact: true }).click();
    await page.getByRole('dialog', { name: '放弃尚未保存的修改？' }).getByRole('button', { name: '放弃修改', exact: true }).click();
    await editor().waitFor({ state: 'hidden' });
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
  });

  await t.test('项目代码地图的正文源保留链接、技术图、地图与原文，并支持原位返回', async () => {
    const readingUrl = `${workspaceUrl}/knowledge/project/product?artifact=browser-map`;
    await page.goto(readingUrl);
    const mainMap = visible().locator('.pane-left [data-knowledge-artifact="browser-map"]');
    await mainMap.waitFor({ state: 'visible' });
    await verifyMarkdownSource(mainMap.getByRole('button', { name: /Markdown 正文源$/ }));
    assert.equal(page.url(), readingUrl);
    assert.equal(await mainMap.isVisible(), true);
    await visible().getByRole('button', { name: '关闭 Markdown 正文源', exact: true }).click();
    await visible().locator('.pane-right').waitFor({ state: 'hidden' });
    assert.equal(await mainMap.isVisible(), true);
  });

  await t.test('文章相关知识的代码地图读取正文源时补全图示，返回仍留在同一副屏', async () => {
    await page.goto(`${workspaceUrl}/articles/browser-article`);
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    const tabCount = await primaryTabs().count();
    await visible().getByRole('button', { name: /浏览器知识说明 项目知识/ }).click();
    const knowledge = visible().locator('[data-knowledge-artifact="browser-explanation"]:visible');
    const embeddedMap = knowledge.locator('[data-knowledge-artifact="browser-map"]');
    await embeddedMap.waitFor({ state: 'visible' });
    await verifyMarkdownSource(embeddedMap.getByRole('button', { name: /Markdown 正文源$/ }));
    assert.equal(await primaryTabs().count(), tabCount);
    assert.equal(await visible().locator('.pane-right').count(), 1);
    await visible().locator('.pane-right').getByRole('button', { name: '← 返回浏览器知识说明', exact: true }).click();
    await knowledge.waitFor({ state: 'visible' });
    await embeddedMap.waitFor({ state: 'visible' });
    await visible().getByRole('button', { name: '← 返回详情', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    await capture(page, 'article-knowledge-source-return.png');
  });

  await t.test('浏览器后退不卸载未保存的文章编辑', async () => {
    await page.goto(`${workspaceUrl}/articles`);
    await visible().getByRole('link', { name: '浏览器测试文章', exact: true }).click();
    await visible().getByRole('button', { name: /编辑文章/ }).click();
    await editor().locator('#article-edit-summary').fill('后退时仍需保留的草稿');
    await page.goBack();
    assert.equal(await editor().locator('#article-edit-summary').inputValue(), '后退时仍需保留的草稿');
    await editor().getByRole('button', { name: '关闭文章编辑', exact: true }).click();
    await page.getByRole('dialog', { name: '放弃尚未保存的修改？' }).getByRole('button', { name: '放弃修改', exact: true }).click();
    await editor().waitFor({ state: 'hidden' });
  });

  await t.test('新建编辑真实文章，上传图片附件后插入并保存引用', async () => {
    await page.goto(`${workspaceUrl}/articles`);
    await visible().locator('.publication-page-head').getByRole('button', { name: /新建文章/ }).click();
    await selectAntdOption(page, 'article-create-project', 'Buildr Product');
    await page.locator('#article-create-title').fill('文章资源浏览器验证');
    await page.getByRole('button', { name: '创建草稿', exact: true }).click();
    await editor().locator('#article-edit-content').waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/articles`);
    createdId = (await page.locator('#article-editor').getAttribute('data-publication-id'))!;
    createdFile = path.join(root, `${createdId}.md`);
    assert.equal(fs.existsSync(createdFile), true);
    await editor().locator('#article-edit-summary').fill('上传、引用与真实文件保存。');
    await editor().locator('#article-edit-content').fill('## 图片与附件\n\n本轮资源验证正文。\n');
    await editor().locator('#article-asset-file').setInputFiles({ name: 'upload-image.png', mimeType: 'image/png', buffer: publicationTestPng });
    const insertImage = editor().locator('[data-insert-asset*="upload-image-"]');
    await insertImage.waitFor({ state: 'visible' });
    imageRef = (await insertImage.getAttribute('data-insert-asset'))!;
    assert.equal(fs.existsSync(path.join(root, imageRef)), true);
    assert.doesNotMatch(fs.readFileSync(createdFile, 'utf8'), /upload-image-/);
    await insertImage.click();
    assert.match(await editor().locator('#article-edit-content').inputValue(), /!\[[^\]]+\]\(assets\/upload-image-/);
    assert.match(await editor().locator('#article-edit-content').inputValue(), /^## 图片与附件/m);
    await editor().locator('#article-asset-file').setInputFiles({ name: 'reference.txt', mimeType: 'text/plain', buffer: Buffer.from('article attachment example', 'utf8') });
    const insertAttachment = editor().locator('[data-insert-asset*="reference-"]');
    await insertAttachment.waitFor({ state: 'visible' });
    attachmentRef = (await insertAttachment.getAttribute('data-insert-asset'))!;
    await insertAttachment.click();
    await editor().locator('#article-save').click();
    await editor().waitFor({ state: 'hidden' });
    await visible().getByRole('link', { name: '文章资源浏览器验证', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    const source = fs.readFileSync(createdFile, 'utf8');
    const stored = await (await page.request.get(`${apiBase}/projects/product/publications/${createdId}`)).json();
    assert.equal(stored.publication.summary, '上传、引用与真实文件保存。');
    assert.ok(source.includes(imageRef) && source.includes(attachmentRef));
    await page.goto(`${workspaceUrl}/articles/product/${createdId}`);
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
    await editor().locator('#article-edit-title').waitFor({ state: 'visible' });
    await editor().locator('#article-edit-title').fill('保留我的编辑标题');
    fs.appendFileSync(createdFile, '\n外部编辑新增的一段。\n');
    expectedBrowserErrors.add(`${apiBase}/projects/product/publications/${createdId}`);
    await editor().locator('#article-save').click();
    await editor().getByText(/文章已被其他入口修改|稿件已变化|保存冲突/).first().waitFor({ state: 'visible' });
    assert.equal(await editor().locator('#article-edit-title').inputValue(), '保留我的编辑标题');
    assert.match(fs.readFileSync(createdFile, 'utf8'), /外部编辑新增的一段/);
    assert.doesNotMatch(fs.readFileSync(createdFile, 'utf8'), /title: 保留我的编辑标题/);
    await page.setViewportSize({ width: 390, height: 844 });
    await editor().locator('#article-asset-upload').scrollIntoViewIfNeeded();
    assert.equal(await editor().locator('#article-asset-upload').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await capture(page, 'article-resource-editor-mobile.png');
    await page.setViewportSize({ width: 1680, height: 1000 });
    await editor().getByRole('button', { name: /^取\s*消$/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '放弃修改', exact: true }).click();
    await visible().locator('#publication-title').waitFor({ state: 'visible' });
    await visible().getByRole('button', { name: '更多文章操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '删除文章', exact: true }).click();
    const deleted = page.waitForResponse(response => response.url() === `${apiBase}/projects/product/publications/${createdId}` && response.request().method() === 'DELETE');
    await page.getByRole('dialog').getByRole('button', { name: '删除文章', exact: true }).click();
    assert.equal((await deleted).status(), 200);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForURL(`${workspaceUrl}/articles`);
    assert.equal(fs.existsSync(createdFile), false);
    assert.equal(fs.existsSync(path.join(root, imageRef)), true);
    assert.equal(fs.existsSync(path.join(root, attachmentRef)), true);
    expectedBrowserErrors.add(`${apiBase}/projects/product/publications/missing`);
    await page.goto(`${workspaceUrl}/articles/missing`);
    await visible().getByText('文章不可用', { exact: true }).waitFor({ state: 'visible' });
  });
}


function writeReadingFixture(workspaceRoot: string) {
  const projectRoot = path.join(workspaceRoot, 'projects/product');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'skills/buildr/current-knowledge-maintenance/references/architecture-knowledge.md')), true, '文章阅读测试使用已安装的真实建设指引');
  const guideLink = 'services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/references/architecture-knowledge.md';
  const put = (file: string, content: string) => { const target = path.join(projectRoot, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  fs.appendFileSync(path.join(projectRoot, 'docs/publications/article.md'), '\n' + Array.from({ length: 80 }, (_, i) => `段落 ${i + 1}：阅读位置需要在展开、编辑和返回后保持。${'这是一段用于验证长文阅读布局的内容。'.repeat(8)}\n`).join('\n'));
  put('README.md', '# 来源说明\n\n这是真实来源说明。\n');
  put('knowledge/docs/explanation.md', `# 浏览器知识说明\n\n[引用来源](../../README.md)\n\n[建设指引](../../${guideLink})\n\n![测试技术图](../archify/diagram.html)\n\n![测试地图](../code-map/implementation.md)\n`);
  put('knowledge/code-map/implementation.md', '# 测试代码地图\n\n说明实现职责与对应来源。\n\n- [Markdown 正文源](../docs/explanation.md) — 查看当前正文与图示\n');
  put('knowledge/archify/diagram.html', '<!doctype html><html lang="zh-CN"><body><svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="580" height="180" fill="#edf5f1"/><text x="30" y="80">知识阅读测试图</text></svg></body></html>');
  put('knowledge/index.yml', JSON.stringify({
    schemaVersion: 'buildr.knowledge-index/v1', scope: { kind: 'project', id: 'product' },
    objects: [{ id: 'browser-reading', title: '浏览器阅读', summary: '关联阅读测试' }],
    sources: [{ id: 'browser-source', title: '引用来源', kind: 'spec', path: 'README.md' }, { id: 'file-explanation', title: 'Markdown 正文源', kind: 'code', path: 'knowledge/docs/explanation.md' }, { id: 'architecture-guide', title: '建设指引', kind: 'skill', skillId: 'current-knowledge-maintenance', path: 'references/architecture-knowledge.md', link: guideLink }],
    artifacts: [
      { id: 'browser-explanation', title: '浏览器知识说明', kind: 'document', path: 'knowledge/docs/explanation.md', objects: ['browser-reading'], sources: ['browser-source', 'architecture-guide'] },
      { id: 'browser-diagram', title: '测试技术图', kind: 'diagram', path: 'knowledge/archify/diagram.html', objects: ['browser-reading'], sources: [] },
      { id: 'browser-map', title: '测试代码地图', kind: 'code-map', path: 'knowledge/code-map/implementation.md', objects: ['browser-reading'], sources: ['file-explanation'] },
    ], relations: [],
  }));
}
