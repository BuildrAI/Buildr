import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Request } from 'playwright-core';

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
  const additionalArtifacts = Array.from({ length: 44 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const id = `service-page-${number}`, title = `服务阅读条目 ${number}`;
    fs.writeFileSync(path.join(knowledgeRoot, 'docs', `${id}.md`), `# ${title}\n\n当前服务的分页阅读夹具。\n`);
    return { id, title, kind: 'document', path: `knowledge/docs/${id}.md`, objects: ['service-topic'], sources: [] };
  });
  fs.writeFileSync(path.join(knowledgeRoot, 'index.yml'), JSON.stringify({
    schemaVersion: 'buildr.knowledge-index/v1', scope: { kind: 'service', id: service.id },
    objects: [{ id: 'service-topic', title: '服务阅读主题', summary: '当前服务的职责与实现来源。' }],
    artifacts: [{ id: 'service-intro', kind: 'document', title: '服务阅读验证', path: 'knowledge/docs/service-intro.md', objects: ['service-topic'], sources: ['service-readme'] }, ...additionalArtifacts],
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
  const knowledgeRequests: string[] = [];
  const collectKnowledge = (request: Request) => { if (request.method() === 'GET' && request.url().startsWith(scopeUrl)) knowledgeRequests.push(request.url()); };
  const catalogEntries = () => browser().locator('[data-knowledge-view="catalog"]:visible [data-knowledge-entry]');
  const nextCatalogResponse = (query: string, cursor: boolean) => page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === catalogPath && url.searchParams.get('q') === query && url.searchParams.has('cursor') === cursor;
  });
  page.on('request', collectKnowledge);
  try {
    const firstPageResponse = nextCatalogResponse('', false);
    await visible().getByRole('link', { name: '服务知识', exact: true }).click();
    const firstPage = await (await firstPageResponse).json();
    assert.equal(firstPage.items.length, 20);
    assert.equal(firstPage.matchingCount, 45);
    assert.equal('index' in firstPage, false, '目录响应不能携带完整知识索引');
    await catalogEntries().nth(19).waitFor({ state: 'visible' });
    assert.equal(await catalogEntries().count(), 20, '首屏只渲染第一批20项');
    assert.ok(knowledgeRequests.length > 0 && knowledgeRequests.every(value => new URL(value).pathname === catalogPath), '目录不能并行请求旧的完整索引或正文');
    assert.equal(page.url(), `${workspaceUrl}/services`);
    await assertSingleReadingPane();

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
  await browser().getByRole('button', { name: '← 返回服务', exact: true }).click();
  await visible().locator('#service-detail-name:visible').waitFor({ state: 'visible' });
  assert.equal(await visible().locator('#services-search').inputValue(), '演示');
  await assertSingleReadingPane();
  await capture(page, 'service-knowledge-return.png');

  await page.goto(`${workspaceUrl}/knowledge/service/${encodeURIComponent(service.id)}?artifact=service-intro`);
  await page.waitForURL(`${workspaceUrl}/services`);
  await browser().getByRole('link', { name: '真实实现来源', exact: true }).waitFor({ state: 'visible' });
  await assertSingleReadingPane();
  await browser().getByRole('button', { name: '← 返回服务', exact: true }).click();
  await visible().locator('#service-detail-name:visible').waitFor({ state: 'visible' });
}
