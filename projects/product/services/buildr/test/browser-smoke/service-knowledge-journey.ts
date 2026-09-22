import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Request } from 'playwright-core';
import { openKnowledgeTopicDirectory, runKnowledgeLocalReadingJourney, selectKnowledgeChildTopic } from './knowledge-local-reading-journey.ts';

type Context = { page: Page; workspaceRoot: string; workspaceUrl: string; service: { id: string; name: string }; capture: (page: Page, name: string) => Promise<unknown> };

/** Exercise service knowledge against its registered directory in the isolated browser fixture. */
export async function runServiceKnowledgeJourney({ page, workspaceRoot, workspaceUrl, service, capture }: Context) {
  const apiBase = `${new URL(workspaceUrl).origin}/api/v1${new URL(workspaceUrl).pathname}`;
  const before = await page.request.get(`${apiBase}/knowledge/service/${encodeURIComponent(service.id)}`);
  assert.equal(before.status(), 200);
  const { scope, index } = await before.json();
  assert.equal(index, null, '没有知识内容时不显示服务知识入口');
  await page.locator('[data-service-knowledge-state="empty"]:visible').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#service-knowledge-entry').count(), 0);
  const realRoot = fs.realpathSync(workspaceRoot);
  assert.ok(path.isAbsolute(scope.directory), '服务知识必须返回已解析的绝对登记目录');
  let relative = path.relative(path.resolve(workspaceRoot), scope.directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) relative = path.relative(realRoot, scope.directory);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), '知识夹具必须写入当前隔离工作空间中的登记目录');
  const serviceRoot = path.join(realRoot, relative);
  let existing = serviceRoot;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const ancestor = path.relative(realRoot, fs.realpathSync(existing));
  assert.ok(!ancestor.startsWith('..') && !path.isAbsolute(ancestor), '登记目录的现有祖先不能经符号链接越出隔离工作空间');
  fs.mkdirSync(serviceRoot, { recursive: true });
  if (!fs.existsSync(path.join(serviceRoot, 'README.md'))) fs.writeFileSync(path.join(serviceRoot, 'README.md'), '# Demo API\n\n隔离服务知识浏览器夹具。\n');
  const knowledgeRoot = path.join(serviceRoot, 'knowledge');
  assert.equal(fs.existsSync(path.join(knowledgeRoot, 'index.yml')), false, '不得覆盖其他夹具已有知识');
  fs.mkdirSync(path.join(knowledgeRoot, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(knowledgeRoot, 'docs', 'service-intro.md'), '# 服务阅读验证\n\n从当前服务理解职责，并查看[真实实现来源](../../README.md)。\n');
  fs.mkdirSync(path.join(knowledgeRoot, 'archify'), { recursive: true });
  fs.mkdirSync(path.join(knowledgeRoot, 'code-map'), { recursive: true });
  fs.writeFileSync(path.join(knowledgeRoot, 'archify', 'service.html'), '<!doctype html><html><body><svg viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg"><text x="10" y="50">服务职责图</text></svg></body></html>');
  fs.writeFileSync(path.join(knowledgeRoot, 'code-map', 'service.md'), '# 服务实现地图\n\n- 请求处理 — 当前服务实现职责。\n');
  const additionalArtifacts = Array.from({ length: 44 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const id = `service-page-${number}`, title = `服务阅读条目 ${number}`;
    fs.writeFileSync(path.join(knowledgeRoot, 'docs', `${id}.md`), `# ${title}\n\n当前服务的分页阅读夹具。\n`);
    return { id, title, kind: 'document', path: `knowledge/docs/${id}.md`, objects: index === 29 ? ['service-detail-topic'] : [], sources: [] };
  });
  fs.writeFileSync(path.join(knowledgeRoot, 'index.yml'), JSON.stringify({
    schemaVersion: 'buildr.knowledge-index/v1', scope: { kind: 'service', id: service.id }, entryObject: 'service-topic',
    objects: [{ id: 'service-topic', title: '服务阅读主题', summary: '当前服务的职责与实现来源。' }, { id: 'service-detail-topic', title: '服务深入主题', parent: 'service-topic', summary: '按职责深入服务。' }],
    artifacts: [{ id: 'service-intro', kind: 'document', title: '服务阅读验证', path: 'knowledge/docs/service-intro.md', objects: ['service-topic'], sources: ['service-readme'] }, { id: 'service-diagram', title: '服务职责图', kind: 'diagram', path: 'knowledge/archify/service.html', objects: ['service-topic'], sources: [] }, { id: 'service-map', title: '服务实现地图', kind: 'code-map', path: 'knowledge/code-map/service.md', objects: ['service-topic'], sources: [] }, ...additionalArtifacts],
    sources: [{ id: 'service-readme', title: '真实服务来源', kind: 'code', path: 'README.md', summary: '当前登记代码库中的服务说明。' }], relations: [],
  }, null, 2) + '\n');
  await page.reload();
  await page.locator('[data-service-knowledge-state="available"]:visible').waitFor({ state: 'visible' });
  const visible = () => page.locator('.workspace-page:not([hidden])');
  const browser = () => visible().locator(`[data-knowledge-browser="service:${service.id}"]:visible`);
  const mainTabs = await page.locator('.workspace-tabstrip .pane-tab-text').allTextContents();
  const assertSingleReadingPane = async () => {
    assert.equal(await visible().locator('.pane-stage:visible').count(), 1, '知识不能创建嵌套分屏');
    assert.equal(await visible().locator('.pane-right:visible').count(), 1, '始终只有一个副屏');
    assert.deepEqual(await page.locator('.workspace-tabstrip .pane-tab-text').allTextContents(), mainTabs, '服务知识不得增加主标签');
    assert.equal(await visible().locator('#service-table-wrap').isVisible(), true, '主屏服务目录保持可见');
    assert.equal(await page.getByRole('tab', { name: '服务详情 关闭 服务详情', exact: true }).count(), 1, '知识复用当前服务详情标签');
  };
  await visible().locator('#services-search').fill('演示');
  const scopeUrl = `${apiBase}/knowledge/service/${encodeURIComponent(service.id)}`;
  const catalogPath = new URL(`${scopeUrl}/catalog`).pathname;
  const knowledgeRequests: string[] = [], knowledgeWrites: string[] = [];
  const collectKnowledge = (request: Request) => {
    if (!request.url().startsWith(scopeUrl)) return;
    if (request.method() === 'GET') knowledgeRequests.push(request.url());
    else if (request.method() !== 'HEAD') knowledgeWrites.push(`${request.method()} ${request.url()}`);
  };
  const catalogEntries = () => browser().locator('[data-knowledge-view="catalog"]:visible [data-knowledge-entry]');
  const nextCatalogResponse = (query: string, cursor: boolean) => page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === catalogPath && url.searchParams.get('q') === query && url.searchParams.has('cursor') === cursor;
  });
  page.on('request', collectKnowledge);
  try {
    const topic = (id: string) => browser().locator(`[data-knowledge-topic-content="${id}"]:visible`);
    await visible().getByRole('link', { name: '服务知识', exact: true }).click();
    await topic('service-topic').locator('[data-knowledge-artifact="service-intro"]').waitFor({ state: 'visible' });
    assert.ok(knowledgeRequests.some(value => new URL(value).pathname === new URL(`${scopeUrl}/navigation`).pathname), '服务入口读取完整轻主题目录');
    assert.equal(knowledgeRequests.some(value => new URL(value).pathname === catalogPath), false, '默认主题不提前请求全部资料目录');
    await assertSingleReadingPane();
    await browser().getByRole('tab', { name: '技术图', exact: true }).click();
    await topic('service-topic').locator('[data-knowledge-artifact="service-diagram"] iframe').waitFor({ state: 'visible' });
    await browser().getByRole('tab', { name: '代码地图', exact: true }).click();
    await topic('service-topic').locator('[data-knowledge-artifact="service-map"]').waitFor({ state: 'visible' });
    await browser().getByRole('tab', { name: '说明', exact: true }).click();
    await topic('service-topic').locator('[data-knowledge-artifact="service-intro"]').waitFor({ state: 'visible' });
    await selectKnowledgeChildTopic(browser(), 'service-topic', 'service-detail-topic');
    await topic('service-detail-topic').locator('[data-knowledge-artifact="service-page-30"]').waitFor({ state: 'visible' });
    await browser().getByRole('button', { name: '← 返回服务阅读主题', exact: true }).click();
    await topic('service-topic').locator('[data-knowledge-artifact="service-intro"]').waitFor({ state: 'visible' });
    await capture(page, 'service-knowledge-topic.png');
    await openKnowledgeTopicDirectory(browser());
    const firstPageResponse = nextCatalogResponse('', false);
    await browser().locator('[data-knowledge-all]:visible').click();
    const firstPage = await (await firstPageResponse).json();
    assert.equal(firstPage.items.length, 20);
    assert.equal(firstPage.matchingCount, 45);
    assert.equal('index' in firstPage, false, '目录响应不能携带完整知识索引');
    await catalogEntries().nth(19).waitFor({ state: 'visible' });
    assert.equal(await catalogEntries().count(), 20, '首屏只渲染第一批20项');
    assert.equal(knowledgeRequests.some(value => new URL(value).pathname === new URL(scopeUrl).pathname), false, '主题和全部资料不调用旧完整索引入口');
    assert.equal(page.url(), `${workspaceUrl}/services`);
    await assertSingleReadingPane();

    const indexBeforeExploration = fs.readFileSync(path.join(knowledgeRoot, 'index.yml'), 'utf8');
    await browser().getByRole('button', { name: '了解与探索', exact: true }).click();
    const action = page.locator('.knowledge-action');
    const generate = action.getByRole('button', { name: '生成了解指令', exact: true });
    await generate.waitFor({ state: 'visible' });
    assert.equal(await generate.isEnabled(), true, '看全貌无需预先知道主题');
    await generate.click();
    assert.match(await action.getByRole('textbox', { name: '架构知识指令', exact: true }).inputValue(), /当前登记范围：服务[\s\S]*本次仅授权只读调查/);
    await action.getByRole('radio', { name: '跟一个场景', exact: true }).check();
    assert.equal(await generate.isDisabled(), true);
    await action.getByRole('textbox', { name: '探索对象', exact: true }).fill('从请求进入到完成');
    await action.getByRole('textbox', { name: '知识探索问题', exact: true }).fill('失败后怎样继续？');
    await generate.click();
    assert.match(await action.getByRole('textbox', { name: '架构知识指令', exact: true }).inputValue(), /场景：从请求进入到完成[\s\S]*失败后怎样继续/);
    await action.getByRole('radio', { name: '深入某部分', exact: true }).check();
    assert.equal(await action.getByRole('textbox', { name: '知识探索问题', exact: true }).inputValue(), '失败后怎样继续？', '切换探索方式保留问题');
    await action.getByRole('textbox', { name: '探索对象', exact: true }).fill('');
    assert.equal(await generate.isDisabled(), true);
    await action.getByRole('textbox', { name: '探索对象', exact: true }).fill('请求处理');
    await generate.click();
    assert.match(await action.getByRole('textbox', { name: '架构知识指令', exact: true }).inputValue(), /部分：请求处理/);
    await action.getByRole('radio', { name: '自由提问', exact: true }).check();
    assert.equal(await action.getByRole('textbox', { name: '知识探索问题', exact: true }).inputValue(), '失败后怎样继续？');
    await action.getByRole('textbox', { name: '知识探索问题', exact: true }).fill('');
    assert.equal(await generate.isDisabled(), true);
    await action.getByRole('textbox', { name: '知识探索问题', exact: true }).fill('哪些信息可以重建？');
    await generate.click();
    assert.match(await action.getByRole('textbox', { name: '架构知识指令', exact: true }).inputValue(), /哪些信息可以重建/);
    await page.locator('#close-agent-action').click();
    await action.waitFor({ state: 'detached' });
    await assertSingleReadingPane();
    assert.equal(fs.readFileSync(path.join(knowledgeRoot, 'index.yml'), 'utf8'), indexBeforeExploration, '探索指令不能写入长期知识');

    const filteredResponse = nextCatalogResponse('服务阅读', false);
    await browser().getByRole('textbox', { name: '检索知识', exact: true }).fill('服务阅读');
    assert.equal((await (await filteredResponse).json()).items.length, 20);
    await catalogEntries().nth(19).waitFor({ state: 'visible' });
    const secondPageResponse = nextCatalogResponse('服务阅读', true);
    await browser().locator('[data-knowledge-prefetch="true"]:visible').scrollIntoViewIfNeeded();
    assert.equal((await (await secondPageResponse).json()).items.length, 20);
    await catalogEntries().nth(39).waitFor({ state: 'visible' });
    assert.equal(await catalogEntries().count(), 40);
    const finalPageResponse = nextCatalogResponse('服务阅读', true);
    await browser().locator('[data-knowledge-prefetch="true"]:visible').scrollIntoViewIfNeeded();
    const finalPage = await (await finalPageResponse).json();
    assert.equal(finalPage.items.length, 5);
    assert.equal(finalPage.hasMore, false);
    await catalogEntries().nth(44).waitFor({ state: 'visible' });
    assert.equal(await catalogEntries().count(), 45);
    const filteredRequests = knowledgeRequests.map(value => new URL(value)).filter(url => url.searchParams.get('q') === '服务阅读');
    assert.equal(filteredRequests.length, 3, '当前筛选只请求三批，不重复续载同一游标');
    assert.equal(new Set(filteredRequests.map(url => url.searchParams.get('cursor') || 'first')).size, 3);
    assert.ok(filteredRequests.every(url => url.searchParams.get('pageSize') === '20'));

    const laterEntry = browser().locator('[data-knowledge-entry="service-page-30"]');
    await laterEntry.scrollIntoViewIfNeeded();
    const position = await visible().locator('.pane-right > .pane-body').evaluate(node => node.scrollTop);
    const catalogRequestsBeforeReading = knowledgeRequests.filter(value => new URL(value).pathname === catalogPath).length;
    await laterEntry.click();
    await browser().locator('[data-knowledge-view="artifact"]:visible .knowledge-browser-heading').getByRole('heading', { name: '服务阅读条目 30', exact: true }).waitFor({ state: 'visible' });
    await browser().getByRole('button', { name: `← 返回${service.name} · 服务知识`, exact: true }).click();
    await catalogEntries().nth(44).waitFor({ state: 'visible' });
    assert.equal(await catalogEntries().count(), 45, '返回目录保留已加载三批条目');
    assert.equal(await browser().getByRole('textbox', { name: '检索知识', exact: true }).inputValue(), '服务阅读');
    await page.waitForFunction(expected => {
      const host = document.querySelector('.workspace-page:not([hidden]) .pane-right > .pane-body');
      return Boolean(host) && Math.abs((host?.scrollTop || 0) - expected) < 2;
    }, position);
    assert.equal(knowledgeRequests.filter(value => new URL(value).pathname === catalogPath).length, catalogRequestsBeforeReading, '返回已加载目录不从第一页重读');
    await assertSingleReadingPane();
    assert.deepEqual(knowledgeWrites, [], '主题导航、探索和全部资料阅读不得写回知识');
  } finally { page.off('request', collectKnowledge); }
  await browser().getByRole('button', { name: /服务阅读验证/ }).click();
  await browser().getByRole('link', { name: '真实实现来源', exact: true }).click();
  await browser().getByRole('heading', { name: '文件说明', exact: true }).waitFor({ state: 'visible' });
  assert.match(await browser().locator('[data-knowledge-view="source"]:visible').innerText(), /当前登记代码库中的服务说明[\s\S]*Demo API/);
  await assertSingleReadingPane();
  await browser().getByRole('button', { name: '← 返回服务阅读验证', exact: true }).click();
  await browser().getByRole('link', { name: '真实实现来源', exact: true }).waitFor({ state: 'visible' });
  await browser().getByRole('button', { name: `← 返回${service.name} · 服务知识`, exact: true }).click();
  assert.equal(await browser().getByRole('textbox', { name: '检索知识', exact: true }).inputValue(), '服务阅读');
  assert.equal(await catalogEntries().count(), 45);
  await browser().getByRole('button', { name: '← 返回服务阅读主题', exact: true }).click();
  await browser().locator('[data-knowledge-topic-content="service-topic"]:visible [data-knowledge-artifact="service-intro"]').waitFor({ state: 'visible' });
  await browser().getByRole('button', { name: '← 返回服务', exact: true }).click();
  await visible().locator('#service-detail-name:visible').waitFor({ state: 'visible' });
  assert.equal(await visible().locator('#services-search').inputValue(), '演示');
  await assertSingleReadingPane();
  await capture(page, 'service-knowledge-return.png');

  await page.goto(`${workspaceUrl}/knowledge/service/${encodeURIComponent(service.id)}?artifact=service-intro`);
  await page.waitForURL(`${workspaceUrl}/services`);
  await browser().getByRole('link', { name: '真实实现来源', exact: true }).waitFor({ state: 'visible' });
  await assertSingleReadingPane();
  await runKnowledgeLocalReadingJourney({ page, workspaceRoot, serviceRoot, scopeUrl, browser, capture });
  await assertSingleReadingPane();
  await browser().getByRole('button', { name: '← 返回服务', exact: true }).click();
  await visible().locator('#service-detail-name:visible').waitFor({ state: 'visible' });
}
