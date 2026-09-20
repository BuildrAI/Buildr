import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Request, Route } from 'playwright-core';

type Context = {
  page: Page;
  workspaceRoot: string;
  serviceRoot: string;
  scopeUrl: string;
  browser: () => Locator;
  capture: (page: Page, name: string) => Promise<unknown>;
};

/** Reading follows current files; fixture edits never leave this isolated workspace. */
export async function runKnowledgeLocalReadingJourney({ page, workspaceRoot, serviceRoot, scopeUrl, browser, capture }: Context) {
  const realWorkspace = fs.realpathSync(workspaceRoot), realService = fs.realpathSync(serviceRoot);
  const fixtureFile = (relative: string, directory = realService) => {
    const root = fs.realpathSync(directory), target = fs.realpathSync(path.join(root, relative));
    for (const parent of [realWorkspace, root]) {
      const contained = path.relative(parent, target);
      assert.ok(contained && !contained.startsWith('..') && !path.isAbsolute(contained), '知识阅读夹具只能修改当前隔离工作空间内的文件');
    }
    return target;
  };
  const bodyFile = fixtureFile('knowledge/docs/service-intro.md');
  const indexFile = fixtureFile('knowledge/index.yml');
  const indexBefore = fs.readFileSync(indexFile, 'utf8');
  const sourceUrl = `${scopeUrl}/sources/service-readme`;
  const sourceResponse = await page.request.get(sourceUrl);
  assert.equal(sourceResponse.status(), 200);
  const source = (await sourceResponse.json()).observations.find((item: { id: string }) => item.id === 'service-readme');
  assert.equal(source.kind, 'code');
  assert.equal(source.path, 'README.md');
  assert.ok(path.isAbsolute(source.location.root));
  const sourceFile = fixtureFile('README.md', source.location.root);
  const currentBody = fs.readFileSync(bodyFile, 'utf8') + '\n本地正文已更新，刷新后直接阅读。\n';
  const currentSource = fs.readFileSync(sourceFile, 'utf8') + '\n本地来源已更新。\n';
  const artifactUrl = `${scopeUrl}/artifacts/service-intro`;
  const reader = () => browser().locator('[data-knowledge-view="artifact"]:visible');
  const sourceReader = () => browser().locator('[data-knowledge-view="source"]:visible');
  const nextRead = (url: string) => page.waitForResponse(response => response.url() === url && response.request().method() === 'GET');
  const waitForReader = () => reader().getByRole('link', { name: '真实实现来源', exact: true }).waitFor({ state: 'visible' });
  const refresh = async (url = artifactUrl) => {
    const [response] = await Promise.all([nextRead(url), browser().getByRole('button', { name: '刷新当前知识', exact: true }).click()]);
    assert.equal(response.status(), 200);
    if (url === artifactUrl) await waitForReader();
    else await sourceReader().getByRole('heading', { name: '文件说明', exact: true }).waitFor({ state: 'visible' });
    return response.json();
  };
  const assertReadingOnly = async () => {
    assert.equal(await browser().getByRole('button', { name: /编辑内容|核对来源|查看变化并核对|确认当前内容仍适用|查看历史|对照/ }).count(), 0);
    assert.doesNotMatch(await browser().innerText(), /待核对|上次核对|历史版本|相关文件已有变化/);
    await browser().getByRole('button', { name: '完善当前内容', exact: true }).waitFor({ state: 'visible' });
  };
  const writes: string[] = [];
  const collectWrites = (request: Request) => { if (request.url().startsWith(scopeUrl) && !['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); };
  page.on('request', collectWrites);
  try {
    fs.writeFileSync(bodyFile, currentBody);
    fs.writeFileSync(sourceFile, currentSource);
    // Pause a real GET to make busy feedback and duplicate-click protection observable.
    let releaseRead!: () => void;
    const heldRead = new Promise<void>(resolve => { releaseRead = resolve; });
    const holdRefresh = async (route: Route) => { await heldRead; await route.continue(); };
    await page.route(artifactUrl, holdRefresh);
    try {
      const requested = page.waitForRequest(request => request.url() === artifactUrl && request.method() === 'GET');
      const refreshed = nextRead(artifactUrl);
      await browser().getByRole('button', { name: '刷新当前知识', exact: true }).click();
      await requested;
      const control = browser().getByRole('button', { name: '刷新当前知识', exact: true });
      assert.equal(await control.isDisabled(), true);
      assert.equal(await control.getAttribute('aria-busy'), 'true');
      releaseRead();
      const response = await refreshed;
      assert.equal(response.status(), 200);
      const data = await response.json();
      const artifact = data.artifacts.find((item: { id: string }) => item.id === 'service-intro');
      assert.equal(artifact.status, 'readable');
      assert.equal(artifact.content, currentBody);
      assert.equal(data.observations.find((item: { id: string }) => item.id === 'service-readme').status, 'readable');
      await waitForReader();
    } finally { releaseRead(); await page.unroute(artifactUrl, holdRefresh); }
    await reader().getByText('本地正文已更新，刷新后直接阅读。', { exact: true }).waitFor({ state: 'visible' });
    await assertReadingOnly();
    assert.equal(await reader().locator('[data-knowledge-unavailable-sources]').count(), 0);
    await capture(page, 'knowledge-local-reading.png');

    const [sourceRead] = await Promise.all([nextRead(sourceUrl), reader().getByRole('link', { name: '真实实现来源', exact: true }).click()]);
    const sourceData = await sourceRead.json();
    assert.equal(sourceData.observations.find((item: { id: string }) => item.id === 'service-readme').content, currentSource);
    await sourceReader().getByRole('heading', { name: '文件说明', exact: true }).waitFor({ state: 'visible' });
    assert.match(await sourceReader().innerText(), /本地来源已更新/);
    await assertReadingOnly();
    await browser().getByRole('button', { name: '← 返回服务阅读验证', exact: true }).click();
    await waitForReader();

    fs.unlinkSync(sourceFile);
    try {
      const missing = await refresh();
      assert.equal(missing.observations.find((item: { id: string }) => item.id === 'service-readme').status, 'missing');
      assert.equal(missing.artifacts.find((item: { id: string }) => item.id === 'service-intro').content, currentBody);
      const notice = reader().locator('[data-knowledge-unavailable-sources]');
      await notice.waitFor({ state: 'visible' });
      assert.match(await notice.innerText(), /部分来源缺失或暂不可读.*其余内容仍可查看/);
      assert.match(await reader().innerText(), /本地正文已更新/);
      await capture(page, 'knowledge-local-missing-source.png');
      const [missingSource] = await Promise.all([nextRead(sourceUrl), notice.getByRole('button', { name: '真实服务来源 · 缺失', exact: true }).click()]);
      assert.equal((await missingSource.json()).observations.find((item: { id: string }) => item.id === 'service-readme').status, 'missing');
      await sourceReader().getByRole('heading', { name: '文件说明', exact: true }).waitFor({ state: 'visible' });
      assert.match(await sourceReader().innerText(), /缺失|不可读|ENOENT|不存在/);
    } finally { fs.writeFileSync(sourceFile, currentSource); }
    const restored = await refresh(sourceUrl);
    assert.equal(restored.observations.find((item: { id: string }) => item.id === 'service-readme').status, 'readable');
    assert.match(await sourceReader().innerText(), /本地来源已更新/);
    await browser().getByRole('button', { name: '← 返回服务阅读验证', exact: true }).click();
    await refresh();
    assert.equal(await reader().locator('[data-knowledge-unavailable-sources]').count(), 0);
    await assertReadingOnly();
    assert.equal(fs.readFileSync(bodyFile, 'utf8'), currentBody);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), currentSource);
    assert.equal(fs.readFileSync(indexFile, 'utf8'), indexBefore, '阅读和刷新不得写回知识索引');
    assert.deepEqual(writes, [], '当前文件阅读不得调用知识写入接口');
  } finally { page.off('request', collectWrites); }
}
