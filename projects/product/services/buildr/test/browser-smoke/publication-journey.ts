import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Locator, Page, Request } from 'playwright-core';
import { openKnowledgeTopicDirectory, selectKnowledgeChildTopic, verifyKnowledgeQuestionHandoff } from './knowledge-local-reading-journey.ts';

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
  writeReadingFixture(workspaceRoot);
  const openKnowledgeSource = async (entry: Locator, sourceId: string) => {
    const base = new URL(apiBase), prefix = `${base.pathname}/knowledge/project/`;
    assert.equal(await entry.count(), 1, `来源 ${sourceId} 必须有唯一可点击入口`);
    await entry.waitFor({ state: 'visible' });
    await entry.scrollIntoViewIfNeeded();
    const requested: string[] = [];
    const observe = (request: Request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET') requested.push(url.origin + url.pathname);
    };
    page.on('request', observe);
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      if (response.request().method() !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(prefix)) return false;
      const parts = url.pathname.slice(prefix.length).split('/');
      return parts.length === 3 && Boolean(parts[0]) && parts[1] === 'sources' && decodeURIComponent(parts[2]) === sourceId;
    });
    // Keep a response rejection handled while the real pointer action is still pending.
    void responsePromise.catch(() => {});
    try {
      await entry.click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const data = await response.json();
      assert.equal(data.scope.kind, 'project');
      assert.equal(data.scope.code, 'product');
      assert.equal(data.observations.filter((item: { id: string }) => item.id === sourceId).length, 1);
      return data;
    } catch (error) {
      await capture(page, `knowledge-source-${sourceId}-failure.png`).catch(() => {});
      const readingState = await page.locator('.workspace-page:not([hidden])').evaluateAll(elements => elements.map(element => ({
        title: element.querySelector('h1')?.textContent,
        views: Array.from(element.querySelectorAll('[data-knowledge-view]')).filter(view => (view as HTMLElement).offsetWidth > 0).map(view => view.getAttribute('data-knowledge-view')),
        sources: Array.from(element.querySelectorAll('[data-knowledge-source]')).filter(source => (source as HTMLElement).offsetWidth > 0).map(source => source.getAttribute('data-knowledge-source')),
      }))).catch(() => []);
      throw new Error(`读取来源 ${sourceId} 失败；点击后的 GET 请求：${requested.join('；') || '无'}；当前阅读：${JSON.stringify(readingState)}`, { cause: error });
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
    const expectedGuide = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr/current-knowledge-maintenance/references/architecture-knowledge.md'), 'utf8');
    assert.equal(guideSource?.content, expectedGuide, '建设指引读取当前隔离工作空间已安装的真实参考文件');
    const guideHeading = expectedGuide.match(/^# (.+)$/m)?.[1];
    assert.ok(guideHeading, '当前建设指引有可阅读标题');
    await pane.locator('[data-knowledge-source="architecture-guide"]:visible').getByRole('heading', { name: guideHeading, exact: true }).waitFor({ state: 'visible' });
    assert.equal(page.url(), readingUrl);
    await pane.getByRole('button', { name: '← 返回Markdown 正文源', exact: true }).click();
    await rendered.locator('iframe').waitFor({ state: 'visible' });
    await rendered.locator('[data-knowledge-artifact="browser-map"]').waitFor({ state: 'visible' });
  };

  await t.test('项目知识默认进入主题，目录与分类可达，全部资料保留搜索和返回', async () => {
    await page.setViewportSize({ width: 1680, height: 1000 });
    const knowledgeUrl = `${workspaceUrl}/knowledge/project/product`;
    const indexFile = path.join(workspaceRoot, 'projects/product/knowledge/index.yml');
    const indexBefore = fs.readFileSync(indexFile, 'utf8');
    const main = () => visible().locator('.knowledge-page:visible');
    const topic = (id: string) => main().locator(`[data-knowledge-topic-content="${id}"]:visible`);
    const writes: string[] = [];
    const collectWrites = (request: Request) => { if (request.url().includes('/knowledge/') && !['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); };
    page.on('request', collectWrites);
    try {
      await page.goto(knowledgeUrl);
      await topic('browser-reading').locator('[data-knowledge-artifact="browser-explanation"]').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).searchParams.get('object'), 'browser-reading', '默认入口由显式 entryObject 决定');
      await main().locator('[data-knowledge-topic="browser-reading"]:visible').waitFor({ state: 'visible' });
      await main().getByRole('tab', { name: '技术图', exact: true }).click();
      await topic('browser-reading').locator('[data-knowledge-artifact="browser-diagram"] iframe').waitFor({ state: 'visible' });
      await main().getByRole('tab', { name: '代码地图', exact: true }).click();
      await topic('browser-reading').locator('[data-knowledge-artifact="browser-map"]').waitFor({ state: 'visible' });
      await main().getByRole('tab', { name: '说明', exact: true }).click();
      await topic('browser-reading').locator('[data-knowledge-artifact="browser-explanation"]').waitFor({ state: 'visible' });
      await selectKnowledgeChildTopic(main(), 'browser-reading', 'browser-details');
      await topic('browser-details').locator('[data-knowledge-artifact="browser-details-article"]').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).searchParams.get('object'), 'browser-details');
      await page.goBack();
      await topic('browser-reading').locator('[data-knowledge-artifact="browser-explanation"]').waitFor({ state: 'visible' });

      await page.setViewportSize({ width: 390, height: 844 });
      await main().locator('[data-knowledge-topic-disclosure]:visible').waitFor({ state: 'visible' });
      await selectKnowledgeChildTopic(main(), 'browser-reading', 'browser-details');
      await topic('browser-details').locator('[data-knowledge-artifact="browser-details-article"]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await capture(page, 'knowledge-topic-navigation-mobile.png');
      await page.setViewportSize({ width: 1680, height: 1000 });
      await openKnowledgeTopicDirectory(main());
      await main().locator('[data-knowledge-all]:visible').click();
      await main().getByRole('textbox', { name: '检索知识', exact: true }).waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).searchParams.get('browse'), 'all');
      await main().getByRole('textbox', { name: '检索知识', exact: true }).fill('深入阅读');
      await main().locator('[data-knowledge-entry="browser-details-article"]').waitFor({ state: 'visible' });
      assert.equal(await main().locator('[data-knowledge-entry]').count(), 1);
      await main().locator('[data-knowledge-entry="browser-details-article"]').click();
      await main().locator('[data-knowledge-artifact="browser-details-article"]').waitFor({ state: 'visible' });
      await page.goBack();
      await main().locator('[data-knowledge-entry="browser-details-article"]').waitFor({ state: 'visible' });
      assert.equal(await main().getByRole('textbox', { name: '检索知识', exact: true }).inputValue(), '深入阅读');
      assert.deepEqual(writes, [], '主题、目录与分类阅读不得写回知识');
      assert.equal(fs.readFileSync(indexFile, 'utf8'), indexBefore);
    } finally { page.off('request', collectWrites); await page.setViewportSize({ width: 1680, height: 1000 }); }
  });

  await t.test('未声明入口的旧知识索引仍可从主题目录与全部资料阅读', async () => {
    const indexFile = path.join(workspaceRoot, 'projects/product/knowledge/index.yml');
    const original = fs.readFileSync(indexFile, 'utf8');
    const legacy = JSON.parse(original); delete legacy.entryObject;
    fs.writeFileSync(indexFile, JSON.stringify(legacy));
    try {
      await page.goto(`${workspaceUrl}/knowledge/project/product`);
      const main = visible().locator('.knowledge-page:visible');
      await openKnowledgeTopicDirectory(main);
      await main.locator('[data-knowledge-topic="browser-reading"]:visible').waitFor({ state: 'visible' });
      assert.equal(await main.locator('[data-knowledge-topic-content]:visible').count(), 0, '旧索引不猜测首个主题为默认入口');
      await main.locator('[data-knowledge-all]:visible').click();
      await main.locator('[data-knowledge-entry="browser-explanation"]').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).searchParams.get('browse'), 'all');
    } finally { fs.writeFileSync(indexFile, original); }
  });

  await t.test('已有图或地图的空说明分类与零搜索不误报首次建设', async () => {
    const indexFile = path.join(workspaceRoot, 'projects/product/knowledge/index.yml');
    const original = fs.readFileSync(indexFile, 'utf8');
    const onlyViews = JSON.parse(original);
    onlyViews.artifacts = onlyViews.artifacts.filter((item: { kind: string }) => item.kind !== 'document');
    fs.writeFileSync(indexFile, JSON.stringify(onlyViews));
    const main = () => visible().locator('.knowledge-page:visible');
    try {
      const response = await page.request.get(`${apiBase}/knowledge/project/product/navigation`);
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).artifactCount, 2, '全范围成果计数包含技术图与代码地图');
      await page.goto(`${workspaceUrl}/knowledge/project/product?browse=all`);
      await main().getByText('当前分类尚未建设内容。', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(await main().locator('[data-knowledge-initialize-action]:visible').count(), 0, '没有说明文档不等于全范围空知识');
      await main().getByRole('tab', { name: /技术图$/ }).click();
      await main().locator('[data-knowledge-entry="browser-diagram"]').waitFor({ state: 'visible' });
      await main().getByRole('tab', { name: /代码地图$/ }).click();
      await main().locator('[data-knowledge-entry="browser-map"]').waitFor({ state: 'visible' });
    } finally { fs.writeFileSync(indexFile, original); }

    await page.goto(`${workspaceUrl}/knowledge/project/product?browse=all`);
    await main().locator('[data-knowledge-entry="browser-explanation"]').waitFor({ state: 'visible' });
    await main().getByRole('textbox', { name: '检索知识', exact: true }).fill('不会匹配的知识标题xyz');
    await main().getByText('没有匹配内容，试试其他关键词。', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await main().locator('[data-knowledge-initialize-action]:visible').count(), 0, '搜索零结果不能覆盖已有成果的事实');
    assert.equal(fs.readFileSync(indexFile, 'utf8'), original, '分类与检索不改写知识索引');
  });

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
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`${workspaceUrl}/articles`);
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
    await verifyKnowledgeQuestionHandoff(page, visible().locator('.pane-right').getByRole('button', { name: '追问当前内容', exact: true }), ['browser-explanation', 'browser-source', '"kind": "project"']);
    await knowledge.waitFor({ state: 'visible' });
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
    await verifyKnowledgeQuestionHandoff(page, visible().locator('.pane-left').getByRole('button', { name: '追问当前内容', exact: true }), ['browser-map', '"kind": "project"']);
    assert.equal(page.url(), readingUrl, '追问返回后保持主屏阅读位置');
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
    const createdId = (await page.locator('#article-editor').getAttribute('data-publication-id'))!;
    const createdFile = path.join(root, `${createdId}.md`);
    assert.equal(fs.existsSync(createdFile), true);
    await editor().locator('#article-edit-summary').fill('上传、引用与真实文件保存。');
    await editor().locator('#article-edit-content').fill('## 图片与附件\n\n本轮资源验证正文。\n');
    await editor().locator('#article-asset-file').setInputFiles({ name: 'upload-image.png', mimeType: 'image/png', buffer: publicationTestPng });
    const insertImage = editor().locator('[data-insert-asset*="upload-image-"]');
    await insertImage.waitFor({ state: 'visible' });
    const imageRef = (await insertImage.getAttribute('data-insert-asset'))!;
    assert.equal(fs.existsSync(path.join(root, imageRef)), true);
    assert.doesNotMatch(fs.readFileSync(createdFile, 'utf8'), /upload-image-/);
    await insertImage.click();
    assert.match(await editor().locator('#article-edit-content').inputValue(), /!\[[^\]]+\]\(assets\/upload-image-/);
    assert.match(await editor().locator('#article-edit-content').inputValue(), /^## 图片与附件/m);
    await editor().locator('#article-asset-file').setInputFiles({ name: 'reference.txt', mimeType: 'text/plain', buffer: Buffer.from('article attachment example', 'utf8') });
    const insertAttachment = editor().locator('[data-insert-asset*="reference-"]');
    await insertAttachment.waitFor({ state: 'visible' });
    const attachmentRef = (await insertAttachment.getAttribute('data-insert-asset'))!;
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
    // Conflict/deletion owns its data; upload success in another case is not a prerequisite.
    const createdId = 'conflict-deletion-fixture';
    const createdFile = path.join(root, `${createdId}.md`);
    const imageRef = 'assets/conflict-image.png', attachmentRef = 'assets/conflict-reference.txt';
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, imageRef), publicationTestPng);
    fs.writeFileSync(path.join(root, attachmentRef), 'shared attachment');
    fs.writeFileSync(createdFile, `---\nid: ${createdId}\ntitle: 独立冲突与删除样本\nkind: product-article\nstatus: draft\n---\n\n![图片](${imageRef})\n\n[附件](${attachmentRef})\n`);
    await page.goto(`${workspaceUrl}/articles/product/${createdId}`);
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
  put('knowledge/docs/details.md', '# 深入阅读说明\n\n这是子主题的独立说明。\n');
  put('knowledge/docs/explanation.md', `# 浏览器知识说明\n\n[引用来源](../../README.md)\n\n[建设指引](../../${guideLink})\n\n![测试技术图](../archify/diagram.html)\n\n![测试地图](../code-map/implementation.md)\n`);
  put('knowledge/code-map/implementation.md', '# 测试代码地图\n\n说明实现职责与对应来源。\n\n- [Markdown 正文源](../docs/explanation.md) — 查看当前正文与图示\n');
  put('knowledge/archify/diagram.html', '<!doctype html><html lang="zh-CN"><body><svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="580" height="180" fill="#edf5f1"/><text x="30" y="80">知识阅读测试图</text></svg></body></html>');
  put('knowledge/index.yml', JSON.stringify({
    schemaVersion: 'buildr.knowledge-index/v1', scope: { kind: 'project', id: 'product' }, entryObject: 'browser-reading',
    objects: [{ id: 'browser-reading', title: '浏览器阅读', summary: '关联阅读测试' }, { id: 'browser-details', title: '深入阅读', parent: 'browser-reading', summary: '子主题与目录往返。' }],
    sources: [{ id: 'browser-source', title: '引用来源', kind: 'spec', path: 'README.md' }, { id: 'file-explanation', title: 'Markdown 正文源', kind: 'code', path: 'knowledge/docs/explanation.md' }, { id: 'architecture-guide', title: '建设指引', kind: 'skill', skillId: 'current-knowledge-maintenance', path: 'references/architecture-knowledge.md', link: guideLink }],
    artifacts: [
      { id: 'browser-details-article', title: '深入阅读说明', kind: 'document', path: 'knowledge/docs/details.md', objects: ['browser-details'], sources: [] },
      { id: 'browser-explanation', title: '浏览器知识说明', kind: 'document', path: 'knowledge/docs/explanation.md', objects: ['browser-reading'], sources: ['browser-source', 'architecture-guide'] },
      { id: 'browser-diagram', title: '测试技术图', kind: 'diagram', path: 'knowledge/archify/diagram.html', objects: ['browser-reading'], sources: [] },
      { id: 'browser-map', title: '测试代码地图', kind: 'code-map', path: 'knowledge/code-map/implementation.md', objects: ['browser-reading'], sources: ['file-explanation'] },
    ], relations: [],
  }));
}
