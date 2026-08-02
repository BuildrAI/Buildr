import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { chromium } from 'playwright-core';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const SELECTOR = process.argv[2] ?? 'all';
const SCREENSHOT_DIR = process.env.BUILDR_SCREENSHOT_DIR;
const KNOWN_SELECTORS = new Set(['all', 'shell', 'task', 'project', 'service', 'change']);

if (!KNOWN_SELECTORS.has(SELECTOR)) throw new Error(`Unknown browser integration selector: ${SELECTOR}`);
const selected = (name) => SELECTOR === 'all' || SELECTOR === name;

function runBuildr(args) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function browserCandidates() {
  return [
    process.env.BUILDR_BROWSER_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
}

function resolveBrowserExecutable() {
  const executable = browserCandidates().find((candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
  });
  if (!executable) {
    throw new Error('Browser smoke 需要本机 Chrome/Chromium；可通过 BUILDR_BROWSER_EXECUTABLE 指定可执行文件，测试不会自动下载浏览器。');
  }
  return executable;
}

function writeChange(projectRoot, relative, title) {
  const changeRoot = path.join(projectRoot, 'openspec', 'changes', relative);
  fs.mkdirSync(path.join(changeRoot, 'specs', 'demo-capability'), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(changeRoot, 'brief.md'), `# ${title}\n\n## 一句话摘要\n\n普通用户先从这里了解变更。\n\n## 核心流程\n\n- 查看 Brief\n- 深入技术产物\n`);
  fs.writeFileSync(path.join(changeRoot, 'proposal.md'), `# ${title}\n\n验证本机应用。\n`);
  fs.writeFileSync(path.join(changeRoot, 'design.md'), '## Context\n\nBrowser smoke fixture.\n');
  fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] 准备 fixture\n- [ ] 验证页面\n');
  fs.writeFileSync(path.join(changeRoot, 'specs', 'demo-capability', 'spec.md'), '# Demo Capability Specification\n\n## Purpose\n\nFixture.\n\n## Requirements\n');
}

function createFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke', '--description', '隔离的浏览器 E2E fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  runBuildr(['project', 'create', 'other', '--target', root, '--name', '另一项目', '--description', '用于验证 Workspace 摘要不锁定项目']);
  const source = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
  const projectRoot = path.join(root, 'projects', 'demo');
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  writeChange(projectRoot, 'archive/2026-07-22-archived-flow', '已归档流程');
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Task Record 页面', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  runBuildr(['task', 'environment', 'prepare', 'browser-task', '--shared', '--target', root]);
  runBuildr(['task', 'create', 'browser-abandon', '--title', '待放弃任务', '--intent', '验证明确放弃', '--target', root]);
}

async function unique(locator, description) {
  const count = await locator.count();
  assert.equal(count, 1, `${description} 应唯一，实际 ${count} 个。`);
  return locator;
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true });
}

test(`本机应用浏览器集成：${SELECTOR}`, { timeout: 90_000 }, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-smoke-'));
  const workspaceRoot = path.join(base, 'workspace');
  let browser;
  let server;
  let previewServer;
  t.after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previewServer) await new Promise((resolve) => previewServer.close(resolve));
    fs.rmSync(base, { recursive: true, force: true });
  });

  createFixture(workspaceRoot);
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const otherRoot = path.join(base, 'other-workspace');
  runBuildr(['init', '--target', otherRoot, '--name', 'other-workspace', '--description', '第二个浏览器工作空间']);
  const runtime = createRuntime();
  let registry = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: registry.revision });
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: workspaceRoot });
  server = instance.server;
  const { url, initialWorkspaceId } = await instance.ready;
  const previewInstance = createLocalWorkspaceServer(runtime, {
    targetRoot: workspaceRoot,
    previewIdentity: {
      schemaVersion: 'buildr.local-app-preview/v1', instance: 'browser-preview', worktree: workspaceRoot,
      repository: workspaceRoot, branch: 'preview-branch', head: '0123456789abcdef', dirty: true,
    },
  });
  previewServer = previewInstance.server;
  const { url: previewUrl } = await previewInstance.ready;
  const workspaceUrl = `${url}/workspaces/${initialWorkspaceId}`;
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage({ locale: 'zh-CN' });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror ${page.url()}: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console.error ${page.url()}: ${message.text()}`); });

  if (selected('shell')) await t.test('全局首页展示多个工作空间并进入选定上下文', async () => {
    await page.goto(url);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#preview-identity').isHidden(), true);
    await page.goto(previewUrl);
    await page.locator('#preview-identity').waitFor({ state: 'visible' });
    assert.match(await page.locator('#preview-identity').innerText(), /开发预览：browser-preview · preview-branch · 0123456789ab · 有未提交修改/);
    await page.goto(url);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-grid .workspace-card').count(), 2);
    const target = page.locator('#workspace-grid .workspace-card').filter({ has: page.locator('h2').filter({ hasText: /^browser-smoke$/ }) });
    await unique(target, 'browser-smoke 工作空间卡片');
    await target.getByRole('link', { name: '进入工作空间' }).click();
    await page.waitForURL(`${workspaceUrl}/`);
    assert.equal(await page.locator('#overview-title').innerText(), 'browser-smoke');
    assert.equal(await page.locator('#project-count').innerText(), '2');
    assert.equal(await page.locator('#service-count').innerText(), '1');
    assert.equal(await page.locator('#start-actions select').count(), 0);
    await page.goto(`${workspaceUrl}/?project=other`);
    await page.locator('#overview-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start-actions select').count(), 0, '旧项目查询参数不得将开始页锁定为项目选择');
    await unique(page.getByRole('button', { name: '用 Agent 开始', exact: true }), '开始工作操作');
    await page.getByRole('button', { name: '用 Agent 开始', exact: true }).click();
    await page.locator('#action-project').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#action-project option').count(), 2);
    await page.locator('#action-project').selectOption('other');
    await page.locator('#action-goal').fill('梳理浏览器 fixture 的下一步工作');
    await page.getByRole('button', { name: '生成开始工作指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /项目：另一项目（other）/);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(url);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 720 });
    let current = runtime.listRegisteredWorkspaces();
    for (const entry of [...current.workspaces]) current = runtime.removeRegisteredWorkspace({ rootPath: entry.rootPath, revision: current.revision });
    await page.goto(url);
    await page.locator('#workspace-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#empty-add-workspace').count(), 1);
    assert.equal(await page.getByRole('button', { name: '让 Agent 创建工作空间' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: '稍后处理' }).count(), 1);
    current = runtime.registerLocalWorkspace({ rootPath: workspaceRoot, revision: current.revision });
    runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: current.revision });
  });

  if (selected('project')) await t.test('项目目录在操作栏提供关联跳转，详情只展示统一事实', async () => {
    await page.goto(`${workspaceUrl}/projects`);
    const row = page.locator('#project-table-body tr').filter({ hasText: '演示项目' });
    await unique(row, '项目行');
    const detail = row.getByRole('link', { name: '详情', exact: true });
    await unique(detail, '项目详情操作');
    await unique(row.getByRole('link', { name: '服务', exact: true }), '项目服务目录操作');
    await unique(row.getByRole('link', { name: '变更', exact: true }), '项目变更目录操作');
    await detail.click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    assert.equal(await page.locator('#project-detail-name').innerText(), '演示项目');
    assert.equal(await page.locator('#project-detail-code').innerText(), 'demo');
    assert.equal(await page.locator('#project-service-summary').innerText(), '1 个已登记服务');
    assert.equal(await page.locator('#app-view input, #app-view textarea').count(), 0);
    assert.equal(await page.getByText('操作', { exact: true }).count(), 0);
    assert.equal(await page.locator('.overview-strip, .related-resource-links').count(), 0);
    assert.equal(await page.locator('.detail-facts > div').count(), 5);
    assert.equal(await page.locator('[data-nav="projects"]').evaluate((item) => item.classList.contains('active')), true);
    await page.getByRole('link', { name: '编辑项目', exact: true }).first().click();
    await page.waitForURL(`${workspaceUrl}/projects/demo/edit`);
    assert.equal(await page.locator('.read-only-section .technical-details').count(), 1);
    assert.equal(await page.getByText('技术信息', { exact: true }).count(), 1);
    await page.locator('#project-description').fill('已在独立编辑页更新');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('project-save-state')?.textContent === '保存成功');
    assert.equal(await page.locator('#project-save-state').innerText(), '保存成功');
  });

  if (selected('service')) await t.test('服务目录在操作栏提供关联跳转，详情与编辑分离', async () => {
    await page.goto(`${workspaceUrl}/services?project=demo`);
    const projectSelect = page.locator('#service-project-select');
    await unique(projectSelect, '服务所属项目过滤器');
    assert.equal(await projectSelect.inputValue(), 'demo');
    const row = page.locator('#service-table-body tr').filter({ hasText: '演示服务' });
    await unique(row, '服务行');
    await capture(page, 'local-app-services-desktop.png');
    const detail = row.getByRole('link', { name: '详情', exact: true });
    await unique(detail, '服务详情操作');
    await unique(row.getByRole('link', { name: '项目', exact: true }), '服务所属项目操作');
    await detail.click();
    await page.waitForURL(`${workspaceUrl}/services/demo/api`);
    assert.equal(await page.locator('#service-detail-name').innerText(), '演示服务');
    assert.equal(await page.locator('#service-project-code').textContent(), 'demo');
    assert.equal(await page.locator('#service-detail-type').innerText(), '后端');
    assert.equal(await page.locator('#app-view input, #app-view textarea').count(), 0);
    assert.equal(await page.getByText('操作', { exact: true }).count(), 0);
    assert.equal(await page.locator('.overview-strip, .related-resource-links').count(), 0);
    assert.equal(await page.locator('.detail-facts > div').count(), 6);
    assert.equal(await page.locator('[data-nav="services"]').evaluate((item) => item.classList.contains('active')), true);
    await page.getByRole('link', { name: '编辑服务', exact: true }).first().click();
    await page.waitForURL(`${workspaceUrl}/services/demo/api/edit`);
    assert.equal(await page.locator('.read-only-section .technical-details').count(), 1);
    assert.equal(await page.getByText('技术信息', { exact: true }).count(), 1);
    await page.locator('#service-description').fill('已在独立详情页更新');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('service-save-state')?.textContent === '保存成功');
    assert.equal(await page.locator('#service-save-state').innerText(), '保存成功');
    await page.reload();
    assert.equal(await page.locator('#service-description').inputValue(), '已在独立详情页更新');
  });

  if (selected('service')) await t.test('390px 下目录与详情不产生页面横向溢出', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${workspaceUrl}/services?project=demo`);
    await page.locator('#service-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('link', { name: '详情', exact: true }).click();
    await page.locator('#service-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await unique(page.getByRole('link', { name: '编辑服务', exact: true }).first(), '服务详情编辑操作');
    await capture(page, 'local-app-service-detail-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('task')) await t.test('任务列表、创建、编辑、冲突、终态确认与窄屏交互共享同一 Task Record', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-body tr').count(), 2);
    assert.equal(await page.locator('[data-nav="tasks"]').evaluate((item) => item.classList.contains('active')), true);
    assert.match(await page.locator('.page-copy').first().innerText(), /不展示或修改 Task Environment/);

    await page.locator('#task-create-id').fill('created-in-app');
    await page.locator('#task-create-title').fill('页面创建任务');
    await page.locator('#task-create-intent').fill('验证 Local App 是共享 Application 客户端');
    await page.locator('#task-create-projects').fill('demo');
    await page.locator('#task-create-services').fill('demo/api');
    await page.locator('#task-create-changes').fill('demo/browser-flow');
    await page.getByRole('button', { name: '创建 Task Record', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/tasks/created-in-app`);
    assert.equal(await page.locator('#task-detail-status').innerText(), '进行中');
    assert.equal(await page.locator('#task-detail-services').innerText(), 'demo/api');
    assert.match(await page.locator('#task-detail-changes').innerText(), /demo\/browser-flow/);
    assert.match(await page.locator('#task-detail-changes').innerText(), /Retained · 进行中/);
    await unique(page.getByRole('button', { name: '环境', exact: true }), '任务环境页签');

    await page.locator('#task-complete-summary').fill('页面确认完成');
    await page.locator('#task-complete-no-change').selectOption('false');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '确认完成', exact: true }).click();
    await page.locator('#task-terminal-note').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-detail-status').innerText(), '已完成');
    assert.equal(await page.locator('#task-active-actions').isHidden(), true);

    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.locator('#task-edit-form').waitFor({ state: 'visible' });
    const taskChange = page.locator('#task-detail-changes a').filter({ hasText: 'demo/browser-flow' });
    await unique(taskChange, '任务关联 Change');
    assert.match(await taskChange.innerText(), /任务环境候选 · 进行中/);
    await taskChange.click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    assert.equal(await page.locator('#change-detail-code').innerText(), 'browser-flow');
    assert.equal(await page.locator('#change-detail-provenance').innerText(), '任务环境候选');
    await page.locator('#task-change-provenance').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /Working copy/);
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /Retained baseline/);
    assert.equal(await page.locator('.panel-actions').isHidden(), true, '任务关联 Change 详情保持只读');
    await page.locator('.back-link').click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task`);

    await page.getByRole('button', { name: '环境', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-environment-status')?.textContent === '可执行');
    assert.equal(await page.locator('#task-environment-source').innerText(), 'current-machine');
    assert.match(await page.locator('#task-environment-receipt').innerText(), /^可用 · /);
    assert.ok(await page.locator('#task-environment-scopes .environment-scope-card').count() >= 2, '应展示稳定控制面与实际工作范围');
    assert.match(await page.locator('#task-environment-scopes').innerText(), /共享根/);
    assert.match(await page.locator('#task-environment-resources').innerText(), /没有已登记的 Task-owned 动态资源/);
    assert.equal(await page.locator('#task-environment-panel button').count(), 1, '环境页签只提供只读刷新');
    await page.getByRole('button', { name: '刷新当前事实', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('task-environment-refresh')?.disabled);
    assert.equal(await page.locator('#task-environment-status').innerText(), '可执行');
    await page.getByRole('button', { name: '概览', exact: true }).click();

    runtime.updateTaskRecord(workspaceRoot, 'browser-task', { intent: '另一客户端已经更新' });
    await page.locator('#task-edit-title').fill('陈旧页面不得覆盖');
    await page.getByRole('button', { name: '保存 Task Record', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-edit-state')?.textContent === '记录已变化');
    assert.match(await page.locator('#task-detail-alert').innerText(), /请刷新本页/);
    for (let index = browserErrors.length - 1; index >= 0; index -= 1) {
      if (/\/tasks\/browser-task: Failed to load resource: the server responded with a status of 409 \(Conflict\)$/.test(browserErrors[index])) browserErrors.splice(index, 1);
    }
    await page.reload();
    assert.equal(await page.locator('#task-edit-intent').inputValue(), '另一客户端已经更新');
    await page.locator('#task-edit-intent').fill('页面基于最新记录更新');
    await page.getByRole('button', { name: '保存 Task Record', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-edit-state')?.textContent === '保存成功');

    await page.goto(`${workspaceUrl}/tasks/browser-abandon`);
    await page.locator('#task-abandon-reason').fill('浏览器验收取消');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '确认放弃', exact: true }).click();
    await page.locator('#task-terminal-note').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-detail-status').innerText(), '已放弃');

    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(`${workspaceUrl}/tasks`); await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${workspaceUrl}/tasks/browser-task`); await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(page, 'local-app-task-detail-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('change')) await t.test('变更目录过滤、详情和 Agent prompt 保持只读', async () => {
    await page.goto(`${workspaceUrl}/changes`);
    const lifecycle = page.locator('#change-lifecycle-filter');
    await unique(lifecycle, '变更生命周期过滤器');
    await lifecycle.selectOption('archived');
    assert.equal(await page.locator('#change-table-body tr').count(), 1);
    await lifecycle.selectOption('active');
    const row = page.locator('#change-table-body tr').filter({ hasText: 'browser-flow' });
    await unique(row, '进行中变更行');
    const detail = row.getByRole('link', { name: '详情', exact: true });
    await unique(detail, '变更详情操作');
    await detail.click();
    await page.waitForURL(`${workspaceUrl}/changes/demo/active~browser-flow`);
    assert.equal(await page.locator('#change-detail-code').innerText(), 'browser-flow');
    assert.equal(await page.locator('#change-detail-lifecycle').innerText(), '进行中');
    assert.equal(await page.locator('#change-detail-progress').innerText(), '1 / 2');
    assert.equal(await page.locator('.change-brief-panel').count(), 1);
    assert.match(await page.locator('.brief-content.markdown-body').innerText(), /普通用户先从这里了解变更/);
    const briefTop = await page.locator('.change-brief-panel').evaluate((element) => element.getBoundingClientRect().top);
    const artifactsTop = await page.locator('.technical-artifacts-panel').evaluate((element) => element.getBoundingClientRect().top);
    assert.ok(briefTop < artifactsTop, 'Brief 必须位于技术 artifacts 之前');
    assert.equal(await page.locator('#change-artifacts .artifact-panel').count(), 4);
    assert.equal(await page.locator('#change-artifacts .artifact-content.markdown-body').count(), 4);
    assert.equal(await page.locator('#change-artifacts .content-view-source').count(), 4);
    assert.match(await page.locator('#change-artifacts .artifact-content.markdown-body').first().innerText(), /浏览器流程|验证本机应用/);
    assert.ok(await page.locator('#change-artifacts .artifact-content.markdown-body h1').count() > 0);
    assert.equal(await page.locator('#change-artifacts .artifact-panel > pre').count(), 0);
    assert.ok(await page.locator('#change-artifacts .task-list-item input[type="checkbox"]').count() >= 2);
    const firstArtifact = page.locator('#change-artifacts .artifact-panel').first();
    await unique(firstArtifact.getByRole('button', { name: '原文', exact: true }), '产物原文视图');
    await firstArtifact.getByRole('button', { name: '原文', exact: true }).click();
    assert.equal(await firstArtifact.locator('.content-view-source').isVisible(), true);
    assert.equal(await firstArtifact.locator('.markdown-body').isHidden(), true);
    assert.match(await firstArtifact.locator('.content-view-source').innerText(), /浏览器流程|验证本机应用|# /);
    await firstArtifact.getByRole('button', { name: '渲染', exact: true }).click();
    assert.equal(await firstArtifact.locator('.markdown-body').isVisible(), true);
    assert.equal(await firstArtifact.locator('.content-view-source').isHidden(), true);
    const proceed = page.getByRole('button', { name: '继续推进', exact: true });
    await unique(proceed, '继续推进操作');
    await proceed.click();
    const generate = page.getByRole('button', { name: '生成继续推进指令', exact: true });
    await unique(generate, '生成继续推进指令操作');
    await generate.click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /browser-flow/);
    assert.equal(await page.locator('#action-copy-state').innerText(), '变更文件未被修改。');
  });

  assert.deepEqual(browserErrors, [], browserErrors.join('\n'));
});
