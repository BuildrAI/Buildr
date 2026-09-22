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

/** Both the wide sidebar and the narrow disclosure keep the same topic controls. */
export async function openKnowledgeTopicDirectory(root: Locator) {
  const disclosure = root.locator('[data-knowledge-topic-disclosure]:visible');
  if (await disclosure.count() && await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click();
}

export async function selectKnowledgeChildTopic(root: Locator, parentId: string, childId: string) {
  await openKnowledgeTopicDirectory(root);
  const child = root.locator(`[data-knowledge-topic="${childId}"]:visible`);
  if (!await child.isVisible()) await root.locator(`[data-knowledge-topic-toggle="${parentId}"]:visible`).click();
  await child.click();
}

/** Exercise the real shared action drawer without handing work to an agent. */
export async function verifyKnowledgeQuestionHandoff(page: Page, trigger: Locator, expectedContext: string[]) {
  await trigger.click();
  const action = page.locator('.knowledge-action');
  const generate = action.getByRole('button', { name: '生成了解指令', exact: true });
  await generate.waitFor({ state: 'visible' });
  assert.equal(await generate.isDisabled(), true, '追问必须有问题');
  await action.getByRole('textbox', { name: '知识追问问题', exact: true }).fill('这里的职责为什么分开？请核查当前实现。');
  await generate.click();
  const prompt = await action.getByRole('textbox', { name: '架构知识指令', exact: true }).inputValue();
  for (const value of expectedContext) assert.ok(prompt.includes(value), value);
  assert.match(prompt, /本次仅授权只读调查和回答/);
  assert.match(prompt, /重新读取相关最新规范、代码和登记配置/);
  assert.doesNotMatch(prompt, /即请求在指定范围建设|将实际文章|将更新后的地图/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await action.getByRole('button', { name: '复制给智能体', exact: true }).click();
  await action.getByRole('status').filter({ hasText: '已复制' }).waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  await page.locator('#close-agent-action').click();
  await action.waitFor({ state: 'detached' });
}

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
    await verifyKnowledgeQuestionHandoff(page, reader().getByRole('button', { name: '追问当前内容', exact: true }), ['service-intro', 'service-readme', '"kind": "service"']);
    await reader().getByRole('button', { name: '完善当前内容', exact: true }).click();
    const maintenance = page.locator('.knowledge-action');
    await maintenance.getByRole('textbox', { name: '知识修改意见', exact: true }).fill('请补充职责取舍的说明');
    await maintenance.getByRole('button', { name: '生成完善指令', exact: true }).click();
    const maintenancePrompt = await maintenance.getByRole('textbox', { name: '架构知识指令', exact: true }).inputValue();
    assert.match(maintenancePrompt, /请补充职责取舍的说明/);
    assert.match(maintenancePrompt, /即请求在指定范围建设/);
    assert.doesNotMatch(maintenancePrompt, /本次仅授权只读调查/);
    await page.locator('#close-agent-action').click();
    await maintenance.waitFor({ state: 'detached' });
    await waitForReader();
    await capture(page, 'knowledge-local-reading.png');

    const [sourceRead] = await Promise.all([nextRead(sourceUrl), reader().getByRole('link', { name: '真实实现来源', exact: true }).click()]);
    const sourceData = await sourceRead.json();
    assert.equal(sourceData.observations.find((item: { id: string }) => item.id === 'service-readme').content, currentSource);
    await sourceReader().getByRole('heading', { name: '文件说明', exact: true }).waitFor({ state: 'visible' });
    assert.match(await sourceReader().innerText(), /本地来源已更新/);
    await assertReadingOnly();
    await verifyKnowledgeQuestionHandoff(page, sourceReader().getByRole('button', { name: '追问当前内容', exact: true }), ['service-readme', sourceData.observations.find((item: { id: string }) => item.id === 'service-readme').digest]);
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
