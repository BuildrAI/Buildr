import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Request, Route } from 'playwright-core';

type Scope = { kind: 'project' | 'service'; id: string; title: string; directory: string };
type Capture = (page: Page, name: string) => Promise<unknown>;

function directorySnapshot(root: string) {
  const entries: string[] = [];
  const visit = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name), relative = path.relative(root, file);
      if (item.isDirectory()) { entries.push(`directory:${relative}`); visit(file); }
      else if (item.isSymbolicLink()) entries.push(`symlink:${relative}:${fs.readlinkSync(file)}`);
      else entries.push(`file:${relative}:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`);
    }
  };
  const exists = fs.existsSync(root);
  if (exists) visit(root);
  return { exists, entries };
}

/** Opening and copying a ready first-build instruction never performs the work. */
export async function verifyKnowledgeInitializationHandoff(page: Page, trigger: Locator, scope: Scope, focus?: string, capture?: Capture) {
  const before = directorySnapshot(scope.directory), writes: string[] = [];
  const observe = (request: Request) => {
    if (request.url().includes('/knowledge/') && !['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  };
  page.on('request', observe);
  try {
    await trigger.click();
    const action = page.locator('.knowledge-action');
    const promptField = action.getByRole('textbox', { name: '架构知识指令', exact: true });
    await promptField.waitFor({ state: 'visible' });
    const prompt = await promptField.inputValue();
    assert.ok(prompt.trim(), '首次打开就有可复制的默认目标');
    for (const expected of [scope.title, `"kind": "${scope.kind}"`, `"id": "${scope.id}"`, '整体认识', '真实职责和关键过程', 'entryObject', 'parent', '已有未登记资料', '不固定层级、篇数']) assert.ok(prompt.includes(expected), expected);
    assert.equal(await action.getByRole('textbox', { name: '知识主题', exact: true }).count(), 0);
    assert.equal(await action.getByRole('button', { name: '生成建设指令', exact: true }).count(), 0);
    const copy = action.getByRole('button', { name: '复制给智能体', exact: true });
    assert.equal(await copy.isEnabled(), true, '无需先填写主题或重新生成');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await copy.click();
    await action.getByRole('status').filter({ hasText: '已复制' }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
    if (focus) {
      await action.getByRole('textbox', { name: '知识关注点', exact: true }).fill(focus);
      await page.waitForFunction(value => (document.querySelector('[aria-label="架构知识指令"]') as HTMLTextAreaElement | null)?.value.includes(value), focus);
      const focused = await promptField.inputValue();
      assert.ok(focused.includes(focus));
      assert.ok(focused.includes(`"id": "${scope.id}"`) && focused.includes('entryObject'), '补充关注点保留范围和首次结构要求');
      await copy.click();
      await action.getByRole('status').filter({ hasText: '已复制' }).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), focused);
    }
    if (capture) {
      await action.getByRole('textbox', { name: '知识关注点', exact: true }).scrollIntoViewIfNeeded();
      await capture(page, 'knowledge-initialize-ready-drawer.png');
    }
    await page.locator('#close-agent-action').click();
    await action.waitFor({ state: 'detached' });
    assert.deepEqual(writes, [], '打开和复制首次建设指令不得执行知识写入');
    assert.deepEqual(directorySnapshot(scope.directory), before, '首建指令不能创建或修改项目文件');
  } finally { page.off('request', observe); }
}

type Context = { page: Page; workspaceRoot: string; workspaceUrl: string; expectedBrowserErrors: Set<string>; capture: Capture };

export async function runProjectKnowledgeInitializationJourney({ page, workspaceRoot, workspaceUrl, expectedBrowserErrors, capture }: Context) {
  const apiBase = `${new URL(workspaceUrl).origin}/api/v1${new URL(workspaceUrl).pathname}`;
  const navigationUrl = `${apiBase}/knowledge/project/demo/navigation`;
  const knowledgeUrl = `${workspaceUrl}/knowledge/project/demo`;
  const visible = () => page.locator('.workspace-page:not([hidden])');
  const initialize = () => visible().locator('[data-knowledge-initialize-action]:visible');
  const response = await page.request.get(navigationUrl);
  assert.equal(response.status(), 200);
  const navigation = await response.json();
  assert.equal(navigation.artifactCount, 0);
  assert.equal(navigation.scope.kind, 'project');
  assert.equal(navigation.scope.title, '演示项目');
  assert.equal(fs.realpathSync(navigation.scope.directory), fs.realpathSync(path.join(workspaceRoot, 'projects/demo')));

  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto(`${workspaceUrl}/projects/demo`);
  await initialize().waitFor({ state: 'visible' });
  await capture(page, 'knowledge-initialize-project-home.png');
  await verifyKnowledgeInitializationHandoff(page, initialize(), navigation.scope, '优先解释服务职责，以及一次请求如何完成。', capture);
  assert.equal(page.url(), `${workspaceUrl}/projects/demo`, '主页操作返回后保持原位置');
  await page.goto(knowledgeUrl);
  await visible().locator('[data-knowledge-initialize]:visible').waitFor({ state: 'visible' });
  await capture(page, 'knowledge-initialize-empty-knowledge.png');
  await verifyKnowledgeInitializationHandoff(page, initialize(), navigation.scope);

  const knowledgeRoot = path.join(navigation.scope.directory, 'knowledge'), indexFile = path.join(knowledgeRoot, 'index.yml');
  assert.equal(fs.existsSync(indexFile), false, '此用例只使用隔离项目的空知识夹具');
  const directoryExisted = fs.existsSync(knowledgeRoot);
  fs.mkdirSync(knowledgeRoot, { recursive: true });
  fs.writeFileSync(indexFile, JSON.stringify({ schemaVersion: 'buildr.knowledge-index/v1', scope: { kind: 'project', id: 'demo' }, entryObject: 'existing-topic', objects: [{ id: 'existing-topic', title: '已有目录', summary: '尚未建设正文。' }], artifacts: [], sources: [], relations: [] }));
  try {
    await page.goto(knowledgeUrl);
    await initialize().waitFor({ state: 'visible' });
    await verifyKnowledgeInitializationHandoff(page, initialize(), navigation.scope, '沿用已有目录。');
  } finally {
    fs.unlinkSync(indexFile);
    if (!directoryExisted) fs.rmdirSync(knowledgeRoot);
  }

  // A pending/failed read is not an empty scope. The held GET makes both states observable.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const unavailable = async (route: Route) => { await held; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'fixture_unavailable', message: '主题目录暂不可读' } }) }); };
  expectedBrowserErrors.add(navigationUrl);
  await page.route(navigationUrl, unavailable);
  try {
    const requested = page.waitForRequest(request => request.method() === 'GET' && request.url() === navigationUrl);
    await page.goto(knowledgeUrl);
    await requested;
    assert.equal(await initialize().count(), 0, '加载中未知数量不能显示首建入口');
    release();
    await visible().locator('.ant-alert:visible').filter({ hasText: '主题目录暂不可读' }).first().waitFor({ state: 'visible' });
    assert.equal(await initialize().count(), 0, '读取失败不能冒充空知识');
  } finally { release(); await page.unroute(navigationUrl, unavailable); }
}
