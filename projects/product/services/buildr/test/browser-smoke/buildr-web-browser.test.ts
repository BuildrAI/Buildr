import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { chromium } from 'playwright-core';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createRuntime as createProductionRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { materializeCleanProductSource } from '../helpers/clean-product-source.ts';
import { recordVerificationResultFromEvidence } from '../helpers/task-verification-result-fixture.ts';
import { runWorkspaceCompositionJourney } from './workspace-composition-journey.ts';
import { runWorkbenchJourney } from './workbench-journey.ts';
import { runPublicationJourney, publicationTestPng } from './publication-journey.ts';
import { runServiceKnowledgeJourney } from './service-knowledge-journey.ts';
import { runProjectKnowledgeInitializationJourney } from './knowledge-initialization-journey.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const SELECTOR_INPUT: any = process.argv[2] ?? 'all';
const SCREENSHOT_DIR: any = process.env.BUILDR_SCREENSHOT_DIR;
const BROWSER_WEB_DIST_ROOT: any = process.env.BUILDR_BROWSER_WEB_DIST_ROOT;
if (!BROWSER_WEB_DIST_ROOT) throw new Error('Browser smoke requires BUILDR_BROWSER_WEB_DIST_ROOT from the Browser dispatcher staging build.');
const KNOWN_SELECTORS: any = new Set(['all', 'core', 'shell', 'workbench', 'task', 'project', 'service', 'change', 'articles']);
const SELECTORS: any = new Set(SELECTOR_INPUT.split(',').map((item: any) => item.trim()).filter(Boolean));

for (const selector of SELECTORS) if (!KNOWN_SELECTORS.has(selector)) throw new Error(`Unknown browser integration selector: ${selector}`);
if (SELECTORS.size === 0) throw new Error('Browser integration selector cannot be empty.');
const selected: any = (name: any) => SELECTORS.has('all') || SELECTORS.has(name);
const selectorLabel: any = [...SELECTORS].join(',');

function runBuildr(args: any, buildr: any = BUILDR): any  {
  const result: any = spawnSync(process.execPath, [buildr, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function runGit(root: any, args: any): any  {
  const result: any = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function browserCandidates(): any  {
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

function resolveBrowserExecutable(): any  {
  const executable: any = browserCandidates().find((candidate: any) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
  });
  if (!executable) {
    throw new Error('Browser smoke 需要本机 Chrome/Chromium；可通过 BUILDR_BROWSER_EXECUTABLE 指定可执行文件，测试不会自动下载浏览器。');
  }
  return executable;
}

function writeChange(projectRoot: any, relative: any, title: any): any  {
  const changeRoot: any = path.join(projectRoot, 'openspec', 'changes', relative);
  fs.mkdirSync(path.join(changeRoot, 'specs', 'demo-capability'), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(changeRoot, 'brief.md'), `# ${title}\n\n## 一句话摘要\n\n普通用户先从这里了解变更。\n\n## 核心流程\n\n- 查看 Brief\n- 深入技术产物\n`);
  fs.writeFileSync(path.join(changeRoot, 'proposal.md'), `# ${title}\n\n验证 Buildr Web。\n`);
  fs.writeFileSync(path.join(changeRoot, 'design.md'), '## Context\n\nBrowser smoke fixture.\n' + '\n方案阅读位置验证。\n'.repeat(35));
  fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] 准备 fixture\n- [ ] 验证页面\n');
  fs.writeFileSync(path.join(changeRoot, 'specs', 'demo-capability', 'spec.md'), '# Demo Capability Specification\n\n## Purpose\n\nFixture.\n\n## Requirements\n');
}

function writeUiPrototypeFixtures(projectRoot: any, relative: any): any  {
  const prototypeRoot: any = path.join(projectRoot, 'openspec', 'changes', relative, 'prototype-fixtures');
  fs.mkdirSync(prototypeRoot, { recursive: true });
  fs.writeFileSync(path.join(prototypeRoot, 'overview.html'), `<!doctype html>
<!-- buildr:ui-prototype -->
<html lang="zh-CN"><head><meta charset="utf-8"><title>原型任务总览</title><style>
body{margin:0;font-family:system-ui;background:#f4f5f1;color:#283126}.shell{min-height:100vh}.nav{padding:18px 28px;background:#23372d;color:white}.page{padding:28px}.card{max-width:720px;padding:24px;border-radius:18px;background:white;box-shadow:0 12px 32px #23372d18}button{padding:9px 15px;border:0;border-radius:999px;background:#c9572c;color:white}
</style></head><body data-parent-access="pending"><div class="shell"><nav class="nav">Buildr · 任务</nav><main class="page"><section class="card"><p>完整任务页面</p><h1>原型任务总览</h1><button id="prototype-action">切换关键状态</button><strong id="prototype-state">待确认</strong></section></main></div><script>
try { parent.document.querySelector('#task-detail-title'); document.body.dataset.parentAccess = 'unexpected'; } catch { document.body.dataset.parentAccess = 'blocked'; }
document.querySelector('#prototype-action').addEventListener('click', () => { document.querySelector('#prototype-state').textContent = '已确认'; });
</script></body></html>`);
  fs.writeFileSync(path.join(prototypeRoot, 'details.html'), `<!doctype html>
<!-- buildr:ui-prototype -->
<html lang="zh-CN"><head><meta charset="utf-8"><title>原型任务详情</title><style>
body{margin:0;font-family:system-ui;background:#f4f5f1;color:#283126}.nav{padding:18px 28px;background:#23372d;color:white}.page{padding:28px}.grid{display:grid;grid-template-columns:220px 1fr;gap:18px}.panel{padding:22px;border-radius:18px;background:white}
</style></head><body><nav class="nav">Buildr · 任务</nav><main class="page"><div class="grid"><aside class="panel">任务导航</aside><section class="panel"><p>完整任务详情页面</p><h1 id="prototype-detail-heading">原型任务详情</h1></section></div></main></body></html>`);
}

function createCoreFixture(root: any): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-core', '--description', '核心 Browser Smoke fixture']);
  runBuildr(['task', 'create', 'core-task', '--title', '核心浏览器任务', '--intent', '验证核心 Browser Smoke 路由与只读 Tab', '--target', root]);
}

function createServiceFixture(root: any): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-service', '--description', '服务目录 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
}

function createProjectFixture(root: any): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-project', '--description', '项目目录 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
}

function createArticlesFixture(root: any): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-articles', '--description', '文章入口 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'product', '--target', root, '--name', 'Buildr Product', '--description', '对外文章测试项目']);
  const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: browser-article\ntitle: 浏览器测试文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-05\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 浏览器测试文章\n\n![测试配图](assets/cover.png)\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), publicationTestPng);
}

function createShellFixture(root: any): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke', '--description', 'Shell Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  runBuildr(['project', 'create', 'other', '--target', root, '--name', '另一项目', '--description', '用于验证 Workspace 摘要不锁定项目']);
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
  writeChange(path.join(root, 'projects', 'demo'), 'browser-flow', '浏览器流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser shell fixture baseline']);
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Shell Browser Smoke 路由', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
}

function createChangeFixture(root: any): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-change', '--description', 'Change 详情 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  const projectRoot: any = path.join(root, 'projects', 'demo');
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser change fixture baseline']);
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Change 详情页面', '--project', 'demo', '--change', 'demo/browser-flow', '--target', root]);
}

function createFixture(root: any, controllerCli: any, options: any = {}): any  {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke', '--description', '隔离的浏览器 E2E fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  runBuildr(['project', 'create', 'other', '--target', root, '--name', '另一项目', '--description', '用于验证 Workspace 摘要不锁定项目']);
  if (options.articles) {
    runBuildr(['project', 'create', 'product', '--target', root, '--name', 'Buildr Product', '--description', '对外文章测试项目']);
    const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
    fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: browser-article\ntitle: 浏览器测试文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-05\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 浏览器测试文章\n\n![测试配图](assets/cover.png)\n');
    fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), publicationTestPng);
  }
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
  const projectRoot: any = path.join(root, 'projects', 'demo');
  fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'docs', 'task-reference.md'), '# 任务参考资料\n\n普通用户可以直接查看这份文档。\n\n[继续阅读](more.md)\n');
  fs.writeFileSync(path.join(projectRoot, 'docs', 'more.md'), '# 后续资料\n\n同一项目内的相对文档链接也可打开。\n');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), `schemaVersion: buildr.project-verification/v4
testing:
  - id: demo.browser
    title: Browser smoke
    scope:
      project: demo
      services: [api]
    purpose: Task Verification Report is visible in Buildr Web
    sourcePaths: ["**"]
    testRoots: [test/browser-smoke/**]
    full: { kind: command, argv: [node, -e, "void 0"], cwd: . }
    requirements: [node]
`);
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  writeUiPrototypeFixtures(projectRoot, 'browser-flow');
  writeChange(projectRoot, 'archive/2026-07-22-archived-flow', '已归档流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser fixture baseline']);
  runBuildr(['task', 'create', 'browser-parent', '--title', '浏览器协调任务', '--intent', '验证 Parent Task 页面', '--project', 'demo', '--service', 'demo/api', '--target', root]);
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Task Record 页面，参考 [任务参考资料](projects/demo/docs/task-reference.md)。', '--parent', 'browser-parent', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  runBuildr(['task', 'create', 'created-in-app', '--title', '页面查看任务', '--intent', '验证 Buildr Web 轻量查询客户端', '--parent', 'browser-parent', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  for (const [taskId, title, parentTaskId] of [
    ['browser-delivered', '已交付浏览器任务', null],
    ['browser-stale', '目标已变化浏览器任务', null],
    ['browser-contribution-delivered', '贡献交付子任务', 'browser-parent'],
    ['browser-unproven', '交付未经证明子任务', 'browser-parent'],
  ]) {
    runBuildr(['task', 'create', taskId, '--title', title, '--intent', '验证 terminal delivery 与 live applicability 分离', ...(parentTaskId ? ['--parent', parentTaskId] : []), '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
    runBuildr(['task', 'review', 'record', taskId, '--type', 'planning', '--subject-identity', 'plan:browser-v1', '--method', 'self', '--reviewed', 'task intent', '--reviewed', 'change:demo/browser-flow', '--outcome', 'accepted', '--summary', '计划可执行', '--expected-current', 'absent', '--target', root]);
  }
  runBuildr(['task', 'review', 'record', 'browser-task', '--type', 'planning', '--subject-identity', 'plan:browser-v1', '--method', 'self', '--reviewed', 'task intent', '--reviewed', 'change:demo/browser-flow', '--outcome', 'accepted', '--summary', '计划可执行', '--expected-current', 'absent', '--target', root]);
  runBuildr(['task', 'create', 'browser-abandon', '--title', '待放弃任务', '--intent', '验证明确放弃', '--target', root]);
}

function createSelectedFixture(root: any, controllerCli: any): any  {
  if (SELECTORS.size === 2 && SELECTORS.has('shell') && SELECTORS.has('core')) {
    createShellFixture(root);
    return 'shell+core';
  }
  if (SELECTORS.size !== 1) {
    createFixture(root, controllerCli, { articles: selected('articles') });
    return 'full';
  }
  const selector: any = [...SELECTORS][0];
  if (selector === 'core') createCoreFixture(root);
  else if (selector === 'shell') createShellFixture(root);
  else if (selector === 'workbench') createShellFixture(root);
  else if (selector === 'project') createProjectFixture(root);
  else if (selector === 'service') createServiceFixture(root);
  else if (selector === 'change') createChangeFixture(root);
  else if (selector === 'articles') createArticlesFixture(root);
  else createFixture(root, controllerCli, { articles: selected('articles') });
  return selector;
}

function prepareEvidenceFixture(runtime: any, root: any, taskId: any = 'browser-task'): any  {
  const targetIdentity: any = `sha256-${crypto.createHash('sha256').update(`browser:${taskId}`).digest('hex')}`;
  recordVerificationResultFromEvidence(runtime, root, taskId, {
    targetIdentity,
    targetSummary: '浏览器交付目标',
    capabilities: [{ project: 'demo', capability: 'demo.browser', outcome: 'passed', facts: ['Buildr Web 验证投影已通过。'] }],
    coverageGaps: [],
    conclusion: { outcome: 'passed', summary: '浏览器验证已通过。' },
    declarationRoot: root,
  });
  runtime.recordTaskReview(root, taskId, {
    reviewType: 'completion', subjectIdentity: targetIdentity, method: 'human', reviewed: ['当前任务结果'],
    uncovered: [{ subject: '浏览器视觉差异', reason: '本轮只执行烟雾测试。' }], findings: ['没有阻断问题'],
    conclusion: { outcome: 'accepted', summary: '候选可交付' }, expectedCurrentDigest: 'absent',
  });
}

async function unique(locator: any, description: any): Promise<any>  {
  const count: any = await locator.count();
  assert.equal(count, 1, `${description} 应唯一，实际 ${count} 个。`);
  return locator;
}

async function closeTaskReading(page: any) {
  const open = page.locator('.task-reading-drawer.ant-drawer-open');
  if (await open.count()) await open.getByRole('button', {name:'关闭内容阅读',exact:true}).click();
  await page.locator('.task-reading-drawer').waitFor({state:'hidden'});
}

async function openTaskActionModal(page: any, actionId: any): Promise<any> {
  await closeTaskReading(page);
  await page.locator('#task-more-actions').click();
  await page.locator(`#${actionId}`).click();
}

async function openAntdSelect(page: any, id: any): Promise<any>  {
  await page.locator(`.ant-select:has(#${id}) .ant-select-selector`).click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().waitFor({ state: 'visible' });
}

async function antdSelectOptionTexts(page: any): Promise<any>  {
  return page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().locator('.ant-select-item-option-content').allTextContents();
}

async function selectAntdOption(page: any, id: any, optionText: any): Promise<any>  {
  await openAntdSelect(page, id);
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last()
    .locator('.ant-select-item-option')
    .filter({ hasText: optionText })
    .first()
    .click();
  await page.waitForFunction(
    ({ selectId, text }: any) => {
      const root: any = document.querySelector(`.ant-select:has(#${selectId})`);
      return Boolean(root?.querySelector('.ant-select-selection-item')?.textContent?.includes(text));
    },
    { selectId: id, text: optionText },
  );
}

async function openTaskFilterPanel(page: any): Promise<any>  {
  if (!await page.locator('#task-filter-form').isVisible()) {
    await page.locator('#task-filter-panel-toggle').click();
    await page.locator('#task-filter-form').waitFor({ state: 'visible' });
  }
}

async function applyTaskFilters(page: any): Promise<any>  {
  await page.locator('#task-filter-apply').click();
  await page.locator('#task-filter-form').waitFor({ state: 'hidden' });
}

async function openTaskSearch(page: any): Promise<any>  {
  await page.locator('#task-filter-q').waitFor({ state: 'visible' });
}

async function antdSelectDisplay(page: any, id: any): Promise<any>  {
  return page.locator(`.ant-select:has(#${id})`).evaluate((root: any) => (
    root.querySelector('.ant-select-selection-item')?.textContent?.trim()
      || root.querySelector('.ant-select-selection-placeholder')?.textContent?.trim()
      || ''
  ));
}

async function confirmAntModal(page: any): Promise<any>  {
  await page.locator('.ant-modal-confirm .ant-btn-primary').click();
}

async function capture(page: any, name: any): Promise<any>  {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true, animations: 'disabled' });
}

test(`Buildr Web 浏览器集成：${selectorLabel}`, { timeout: SELECTORS.has('all') || SELECTORS.has('task') ? 300_000 : SELECTORS.has('workbench') || SELECTORS.has('articles') || SELECTORS.has('shell') || SELECTORS.has('service') || SELECTORS.has('project') ? 120_000 : 45_000 }, async (t: any) => {
  const requestedSmokeRoot: any = process.env.BUILDR_SMOKE_ROOT;
  const managedSmokeRoot: any = requestedSmokeRoot && fs.existsSync(path.join(requestedSmokeRoot, '.buildr-smoke-owner')) ? requestedSmokeRoot : null;
  const base: any = managedSmokeRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-smoke-'));
  const workspaceRoot: any = process.env.BUILDR_SMOKE_WORKSPACE_ROOT || path.join(base, 'workspace');
  const previousAppData: any = process.env.BUILDR_APP_DATA_DIR;
  const previousProductData: any = process.env.BUILDR_PRODUCT_DATA_DIR;
  let browser: any;
  let server: any;
  let previewServer: any;
  t.after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve: any) => server.close(resolve));
    if (previewServer) await new Promise((resolve: any) => previewServer.close(resolve));
    fs.rmSync(base, { recursive: true, force: true });
    process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-complete\n`);
  });

  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    if (previousProductData === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR;
    else process.env.BUILDR_PRODUCT_DATA_DIR = previousProductData;
  });

  const controller: any = materializeCleanProductSource(PRODUCT_ROOT, path.join(base, 'retained-controller'));
  const fixtureProfile: any = createSelectedFixture(workspaceRoot, controller.cli);
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=fixture-ready\n`);
  const otherRoot: any = path.join(base, 'other-workspace');
  runBuildr(['init', '--target', otherRoot, '--name', 'other-workspace', '--description', '第二个浏览器工作空间']);
  const runtime: any = createRuntime();
  let registry: any = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: registry.revision });
  const otherWorkspaceId: any = registry.workspaces.find((item: any) => item.rootPath === otherRoot).workspace.id;
  // Fixture writers may use the test adapter; the HTTP host must use production composition.
  const webRuntime = createProductionRuntime();
  const workspaceApplication = runtimeProvide(webRuntime, WORKSPACE_APPLICATION);
  const workspacePorts = {
    ensureRegisteredTarget: workspaceApplication.ensureRegisteredTarget,
    resolveRegisteredWorkspace: workspaceApplication.resolveRegisteredWorkspace,
  };
  const instance: any = createLocalWorkspaceServer(webRuntime, {
    ...workspacePorts,
    targetRoot: workspaceRoot,
    webProfile: { profile: 'development' },
    staticRoot: BROWSER_WEB_DIST_ROOT,
  });
  server = instance.server;
  const { url, initialWorkspaceId }: any = await instance.ready;
  const previewInstance: any = createLocalWorkspaceServer(webRuntime, {
    ...workspacePorts,
    targetRoot: workspaceRoot,
    staticRoot: BROWSER_WEB_DIST_ROOT,
    previewIdentity: {
      schemaVersion: 'buildr.local-app-preview/v1', instance: 'browser-preview', worktree: workspaceRoot,
      repository: workspaceRoot, branch: 'preview-branch', head: '0123456789abcdef', dirty: true,
    },
  });
  previewServer = previewInstance.server;
  const { url: previewUrl }: any = await previewInstance.ready;
  const workspaceUrl: any = `${url}/workspaces/${initialWorkspaceId}`;
  browser = await chromium.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page: any = await browser.newPage({ locale: 'zh-CN' });
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=browser-ready\n`);
  const browserErrors: any[] = [];
  const expectedBrowserErrors: any = new Set();
  page.on('pageerror', (error: any) => browserErrors.push(`pageerror ${page.url()}: ${error.message}`));
  page.on('console', (message: any) => { if (message.type() === 'error') browserErrors.push(`console.error ${page.url()} [${message.location().url}]: ${message.text()}`); });

  if (SELECTORS.has('core')) await t.test('核心流程进入 Workspace、Task 路由并读取代表性 Tab', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#development-environment-badge').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#development-environment-badge').innerText()).trim(), '开发版');
    assert.equal(await page.title(), `${fixtureProfile === 'core' ? 'browser-smoke-core' : 'browser-smoke'} · Buildr Web Dev`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#task-table-body tr.ant-table-row').count() > 0, '核心 smoke 必须存在可进入的 Task');
    await page.locator('#task-table-body tr.ant-table-row').first().click();
    await page.waitForURL(/\/workspaces\/[^/]+\/tasks(?:\?.*)?$/);
    await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-node-content').waitFor({ state: 'visible' });
  });

  if (selected('project') || selected('service') || selected('shell')) await t.test('领域动作表单独立生成指令且不写入登记数据', async () => {
    const before = runtime.listProjects(workspaceRoot);
    await page.goto(`${url}/?catalog=1`);
    await page.locator('#create-workspace-agent').click();
    await page.locator('#action-name').fill('独立工作空间');
    await page.locator('#action-description').fill('领域表单重构验证');
    await page.getByRole('button', { name: '生成工作空间指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /独立工作空间/);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.goto(`${workspaceUrl}/projects`);
    await page.locator('#open-agent-action').click();
    await page.getByRole('dialog').getByRole('button', { name: /创建项目/ }).click();
    await page.locator('#action-name').fill('独立项目');
    await page.locator('#action-description').fill('项目表单独立输入');
    await page.getByRole('button', { name: '生成项目指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /独立项目/);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.goto(`${workspaceUrl}/services`);
    await page.locator('#open-agent-action').click();
    await page.getByRole('dialog').getByRole('button', { name: /接入服务/ }).click();
    await page.locator('#action-project:not([disabled])').waitFor({ state: 'visible' });
    await page.locator('#action-name').fill('独立服务');
    await page.locator('#action-description').fill('服务表单独立输入');
    await page.getByRole('button', { name: '生成服务指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    const prompt = await page.locator('#action-prompt-output').inputValue();
    assert.match(prompt, /独立服务/);
    assert.doesNotMatch(prompt, /独立项目|独立工作空间/);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.deepEqual(runtime.listProjects(workspaceRoot), before);
  });

  if (selected('shell')) await t.test('技能列表和主页连续操作、统一编辑入口与草稿保留', async () => {
    await page.goto(`${workspaceUrl}/skills`);
    await page.locator('[data-skill-id="ux-design-laws"]').waitFor({ state: 'visible' });
    await page.reload();
    await page.locator('#skills-search').fill('ux-design-laws');
    await page.locator('[data-skill-id="ux-design-laws"]').click();
    await page.locator('.skill-primary-document').getByRole('link', { name: '法则索引', exact: true }).click();
    await page.getByRole('heading', { name: '法则索引', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '← 返回详情', exact: true }).click();
    await page.getByRole('button', { name: '编辑技能', exact: true }).click();
    assert.equal(await page.locator('.skills-detail-drawer').count(), 0);
    assert.equal(new URL(page.url()).pathname, new URL(`${workspaceUrl}/skills`).pathname);
    await page.locator('#skill-action-input').fill('先列出三个最重要的问题');
    assert.match(await page.locator('#skill-prompt').inputValue(), /先列出三个最重要的问题/);
    assert.equal(await page.getByRole('button', { name: '生成指令', exact: true }).count(), 0);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: '复制指令', exact: true }).click();
    await page.getByRole('button', { name: '已复制', exact: true }).waitFor({ state: 'visible' });
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /先列出三个最重要的问题/);
    await page.locator('#skill-action-input').fill('优先五个问题');
    assert.equal(await page.getByRole('button', { name: '复制指令', exact: true }).isEnabled(), true);
    await page.keyboard.press('Escape');
    await page.locator('.skills-action-drawer').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '编辑技能', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '编辑技能', exact: true }).click();
    assert.equal(await page.locator('#skill-action-input').inputValue(), '优先五个问题');
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('fixture denied')) }); });
    await page.getByRole('button', { name: '复制指令', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '无法自动复制' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#skill-prompt').evaluate((el: any) => el.selectionEnd - el.selectionStart === el.value.length), true);
    await page.getByRole('button', { name: '关闭技能操作', exact: true }).click();
    await page.locator('.skills-action-drawer').waitFor({ state: 'detached' });
    await page.locator('[data-nav="skills"]').click();
    assert.equal(await page.locator('#skills-search').inputValue(), 'ux-design-laws');
    await page.locator('#skills-search').fill('');
    const mainTabs = await page.getByRole('tablist', { name: '打开的页面', exact: true }).getByRole('tab').count();
    const secondSkill = page.locator('[data-skill-id]').filter({ hasNot: page.locator('a[href$="/ux-design-laws"]') }).first();
    await secondSkill.locator('a[href]').first().click();
    await page.getByRole('tab', { name: '技能详情 关闭 技能详情', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('tablist', { name: '打开的页面', exact: true }).getByRole('tab').count(), mainTabs);
    assert.equal(await page.getByRole('tab', { name: '技能详情 关闭 技能详情', exact: true }).count(), 1);
    await page.locator('#skills-search').fill('no-such-skill-xyz');
    await page.getByRole('button', { name: '清除搜索', exact: true }).click();
    await page.locator('#skills-add').click();
    await page.getByRole('button', { name: '通过智能体接入外部技能或生成内容', exact: true }).click();
    await page.locator('#skill-action-input').fill('https://example.invalid/skill');
    assert.match(await page.locator('#skill-prompt').inputValue(), /example.invalid/);
    await page.getByRole('button', { name: '关闭技能操作', exact: true }).click();
    await page.locator('.skills-action-drawer').waitFor({ state: 'detached' });
    await page.locator('#skills-add').click();
    await page.getByRole('button', { name: '通过智能体接入外部技能或生成内容', exact: true }).click();
    assert.equal(await page.locator('#skill-action-input').inputValue(), 'https://example.invalid/skill');
    await page.goto(`${url}/workspaces/${otherWorkspaceId}/skills`);
    await page.locator('#skills-add').click();
    await page.getByRole('button', { name: '通过智能体接入外部技能或生成内容', exact: true }).click();
    assert.equal(await page.locator('#skill-action-input').inputValue(), '');
    await page.getByRole('button', { name: '关闭技能操作', exact: true }).click();
    await page.locator('.skills-action-drawer').waitFor({ state: 'detached' });
  });

  if (selected('shell')) await t.test('全局首页展示多个工作空间并进入选定上下文', async () => {
    await page.goto(url);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.title(), 'Buildr Web Dev');
    assert.equal(await page.locator('#preview-identity').isHidden(), true);
    await page.goto(previewUrl);
    await page.locator('#preview-identity').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#preview-identity').isHidden(), true);
    assert.match(await page.locator('#preview-identity').getAttribute('data-preview') || '', /开发预览：browser-preview · preview-branch · 0123456789ab · 有未提交修改/);
    await page.goto(url);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-grid .workspace-card').count(), 2);
    const target: any = page.locator('#workspace-grid .workspace-card').filter({ has: page.locator('h2').filter({ hasText: /^browser-smoke$/ }) });
    await unique(target, 'browser-smoke 工作空间卡片');
    await target.getByRole('link', { name: '进入工作空间' }).click();
    await page.waitForURL(`${workspaceUrl}/overview`);
    await page.locator('#workbench-overview').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#shell-workspace-name').innerText()).trim(), 'browser-smoke');
    assert.equal(await page.title(), 'browser-smoke · Buildr Web Dev');
    assert.equal(await page.locator('[data-nav="overview"]').evaluate((item: any) => item.classList.contains('active')), true);
    const expectedProjectCount: any = selected('articles') ? 3 : 2;
    await page.locator('#open-agent-action').click();
    await page.locator('#action-project').waitFor({ state: 'visible' });
    await openAntdSelect(page, 'action-project');
    await page.waitForFunction(
      (count: any) => {
        const dropdown: any = [...document.querySelectorAll('.ant-select-dropdown')]
          .find((node: any) => !node.classList.contains('ant-select-dropdown-hidden'));
        if (!dropdown) return false;
        return dropdown.querySelectorAll('.ant-select-item-option').length === count;
      },
      expectedProjectCount,
    );
    assert.equal(
      await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').count(),
      expectedProjectCount,
    );
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: 'other' })
      .first()
      .click();
    await page.locator('#action-goal').fill('梳理浏览器 fixture 的下一步工作');
    await page.getByRole('button', { name: '生成开始工作指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /项目：另一项目（other）/);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(url);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-grid').evaluate((grid: any) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 720 });
    let current: any = runtime.listRegisteredWorkspaces();
    for (const entry of [...current.workspaces]) current = runtime.removeRegisteredWorkspace({ rootPath: entry.rootPath, revision: current.revision });
    await page.goto(url);
    await page.locator('#workspace-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#empty-add-workspace').count(), 1);
    assert.equal(await page.locator('#empty-create-workspace').count(), 1);
    assert.equal(await page.getByRole('button', { name: '稍后处理' }).count(), 1);
    current = runtime.registerLocalWorkspace({ rootPath: workspaceRoot, revision: current.revision });
    runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: current.revision });
  });

  if (selected('shell')) await t.test('平级导航、页面级页签与手机菜单保持真实范围', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    assert.deepEqual(await page.locator('.top-nav a').allTextContents(), ['工作台', '工作空间']);
    await page.locator('[data-area="workspace"]').click();
    await page.waitForURL(`${workspaceUrl}/workspace-overview`);
    await page.waitForFunction(() => [...document.querySelectorAll('.shell-navigation .shell-nav-item')].some((node: any) => node.textContent === '项目'));
    assert.deepEqual(await page.locator('.shell-navigation .shell-nav-item').allTextContents(), ['总览', '项目', '服务', '代码库', '技能', '文章']);
    await page.locator('[data-nav=projects]').click();
    assert.equal(await page.getByRole('tab', { name: '项目目录', exact: true }).count(), 0);
    await page.locator('#project-table-body tr').filter({ hasText: '演示项目' }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.locator('.workspace-tabstrip .pane-tab.on').filter({ hasText: '演示项目' }).waitFor({ state: 'visible' });
    await page.locator('[data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.locator('.workspace-tabstrip .pane-tab').filter({ hasText: '演示项目' }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.goto(`${workspaceUrl}/services/demo/api`);
    await page.waitForURL(`${workspaceUrl}/services`);
    await page.locator('.pane-right:visible #service-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('tab', { name: '演示服务', exact: true }).count(), 0);
    assert.equal(await page.locator('#service-table-wrap').isVisible(), true);
    await page.locator('[data-area="workbench"]').click();
    await page.waitForURL(/\/(?:overview|tasks)/);
    await page.locator('[data-area="workspace"]').click();
    await page.waitForURL(`${workspaceUrl}/services`);
    await page.locator('.pane-right:visible #service-detail-name').waitFor({ state: 'visible' });
    await page.locator('[data-nav="skills"]').click();
    await page.locator('#skills-list').waitFor({ state: 'visible' });
    await page.locator('#skills-search').fill('保留筛选条件');
    await page.getByRole('button', { name: '切换工作空间', exact: true }).click();
    await page.locator('[data-action="workspace-settings"]').click();
    await page.locator('#workspace-form').waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/skills`);
    assert.equal(await page.getByRole('tab', { name: '设置', exact: true }).count(), 0);
    await page.getByRole('button', { name: '关闭工作空间设置', exact: true }).click();
    await page.locator('[data-nav="skills"]').click();
    assert.equal(await page.locator('#skills-search').inputValue(), '保留筛选条件');
    assert.equal(await page.locator('.workspace-page:not([hidden])').count(), 1);
    await page.getByRole('tab', { name: '演示项目', exact: true }).press('Alt+ArrowLeft');
    const order = await page.locator('.workspace-tabstrip .pane-tab-text').allTextContents();
    await page.reload();
    await page.locator('#skills-list').waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('.workspace-tabstrip .pane-tab-text').allTextContents(), order.filter((title: string) => title !== '演示服务'));
    assert.equal(await page.locator('[data-area="workspace"]').getAttribute('class'), 'active');
    assert.equal(await page.locator('[data-nav="services"]').innerText(), '服务');
    assert.equal(await page.getByText('环境维护', { exact: true }).count(), 0);
    assert.equal(await page.getByText('智能体配置', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '折叠菜单', exact: true }).click();
    assert.equal(await page.locator('.app-sidebar').evaluate((el: HTMLElement) => Math.round(el.getBoundingClientRect().width)), 64);
    await page.getByRole('button', { name: '展开菜单', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    assert.deepEqual(await page.getByRole('dialog').locator('.shell-nav-item').allTextContents(), ['总览', '项目', '服务', '代码库', '技能', '文章']);
    await page.getByRole('dialog').locator('[data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(page, 'navigation-project-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('#project-table-body tr').filter({ hasText: '演示项目' }).click();
    await page.locator('[data-nav="services"]').click();
    await page.getByRole('button', { name: '关闭 演示项目', exact: true }).click();
    await page.locator('[data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    assert.equal(await page.getByRole('tab', { name: '演示项目', exact: true }).count(), 0);
    await capture(page, 'navigation-project-desktop.png');
  });

  if (selected('articles')) await runPublicationJourney({ t, page, workspaceRoot, workspaceUrl, expectedBrowserErrors, selectAntdOption, capture });

  if (selected('shell')) await t.test('四类资源目录共享表头、搜索、操作位置与行密度', async () => {
    const heights: number[] = [];
    for (const [area, noun] of [['projects', '项目'], ['services', '服务'], ['repositories', '代码库'], ['skills', '技能']]) {
      await page.goto(`${workspaceUrl}/${area}`);
      await page.locator('.resource-directory-table tbody tr[data-row-key]').first().waitFor({ state: 'visible' });
      const headers = await page.locator('.resource-directory-table thead th').allTextContents();
      assert.equal(headers[0], `${noun} / 说明`);
      assert.equal(headers.at(-1), '操作');
      await page.getByRole('textbox', { name: `搜索${noun}`, exact: true }).waitFor({ state: 'visible' });
      heights.push(await page.locator('.resource-directory-table tbody tr[data-row-key]').first().evaluate((row: HTMLElement) => row.getBoundingClientRect().height));
      await page.getByRole('button', { name: `新增${noun}`, exact: true }).waitFor({ state: 'visible' });
      await page.getByRole('textbox', { name: `搜索${noun}`, exact: true }).fill('保留搜索');
      await Promise.all([page.waitForResponse((response: any) => response.request().method() === 'GET' && response.url().includes('/api/')), page.getByRole('button', { name: `刷新${noun}`, exact: true }).click()]);
      assert.equal(await page.getByRole('textbox', { name: `搜索${noun}`, exact: true }).inputValue(), '保留搜索');
      await page.getByRole('textbox', { name: `搜索${noun}`, exact: true }).fill('');
    }
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, JSON.stringify(heights));
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [area, header] of [['services', '代码库'], ['repositories', '集成分支'], ['skills', '来源']]) {
      await page.goto(`${workspaceUrl}/${area}`);
      await page.locator('.resource-directory-table .resource-name a').first().click();
      await page.locator('.pane-right:visible').waitFor({ state: 'visible' });
      await page.getByRole('columnheader', { name: header, exact: true }).waitFor({ state: 'visible' });
      const scrolling = page.locator('.resource-directory-table .ant-table-content:visible');
      await page.waitForFunction((el: HTMLElement) => el.scrollWidth > el.clientWidth, await scrolling.elementHandle());
      await scrolling.evaluate((el: HTMLElement) => { el.scrollLeft = el.scrollWidth; });
      assert.ok(await scrolling.evaluate((el: HTMLElement) => el.scrollLeft > 0 && el.scrollWidth > el.clientWidth), `${area} 的副屏打开后仍可横向阅读目录`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      if (area === 'services') {
        await page.locator('#service-table-body a[href*="/repositories/"]').first().click();
        await page.getByRole('button', { name: '编辑代码库', exact: true }).waitFor({ state: 'visible' });
      }
      assert.equal(await page.getByRole('tab', { name: /^(项目目录|服务目录|代码库目录|技能目录|设置)$/ }).count(), 0);
    }
    await page.setViewportSize({ width: 1280, height: 720 });

  });

  if (selected('shell')) await t.test('顶部与卡片共用设置抽屉，明确对象且冲突保留输入', async () => {
    const workspaceApiUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
    const original = await (await page.request.get(workspaceApiUrl)).json();
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto(`${workspaceUrl}/services`);
    const openSettings = async () => {
      await page.getByRole('button', { name: '切换工作空间', exact: true }).click();
      await page.locator('[data-action="workspace-settings"]').click();
      await page.locator('#workspace-name').waitFor({ state: 'visible' });
    };
    await openSettings();
    assert.equal(page.url(), `${workspaceUrl}/services`);
    assert.equal(await page.locator('[data-nav="settings"]').count(), 0);
    assert.equal(await page.getByText('技术事实', { exact: true }).count(), 0);
    await page.locator('#workspace-description-input').fill('保持设置草稿');
    await page.getByRole('button', { name: '关闭工作空间设置', exact: true }).click();
    await openSettings();
    assert.equal(await page.locator('#workspace-description-input').inputValue(), '保持设置草稿');
    const session = await page.locator('meta[name="buildr-session"]').getAttribute('content');
    const headers = { origin: url, 'x-buildr-session': session!, 'content-type': 'application/json' };
    const changed = await page.request.put(workspaceApiUrl, { headers, data: { revision: original.revision, description: '另一个入口保存的说明' } });
    assert.equal(changed.status(), 200, await changed.text());
    expectedBrowserErrors.add(workspaceApiUrl);
    await page.locator('#workspace-save-button').click();
    await page.locator('#workspace-settings-conflict').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-description-input').inputValue(), '保持设置草稿');
    assert.match(await page.locator('#workspace-settings-conflict').innerText(), /另一个入口保存的说明/);
    await page.locator('#workspace-save-latest').click();
    await page.locator('#workspace-form').waitFor({ state: 'hidden' });
    assert.equal((await (await page.request.get(workspaceApiUrl)).json()).workspace.description, '保持设置草稿');
    await openSettings();
    await page.locator('#workspace-name').fill('browser-smoke-updated');
    await page.locator('#workspace-save-button').click();
    await page.locator('#workspace-form').waitFor({ state: 'hidden' });
    assert.match(await page.getByRole('button', { name: '切换工作空间', exact: true }).innerText(), /browser-smoke-updated/);
    await openSettings();
    await page.locator('#workspace-name').fill(original.workspace.name);
    await page.locator('#workspace-description-input').fill(original.workspace.description);
    await page.locator('#workspace-save-button').click();
    await page.locator('#workspace-form').waitFor({ state: 'hidden' });
    await page.goto(`${url}/?catalog=1`);
    const catalogUrl = page.url();
    const otherCard = page.locator(`.workspace-card[data-workspace-id="${otherWorkspaceId}"]`);
    await otherCard.getByRole('button', { name: '设置工作空间：other-workspace', exact: true }).click();
    await page.locator('#workspace-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-name').inputValue(), 'other-workspace');
    await page.locator('#workspace-name').fill('other-workspace-updated');
    await page.locator('#workspace-save-button').click();
    await page.locator('#workspace-form').waitFor({ state: 'hidden' });
    await otherCard.getByRole('heading', { name: 'other-workspace-updated', exact: true }).waitFor({ state: 'visible' });
    assert.equal(page.url(), catalogUrl);
    assert.equal((await (await page.request.get(workspaceApiUrl)).json()).workspace.name, original.workspace.name);
    await otherCard.getByRole('button', { name: '设置工作空间：other-workspace-updated', exact: true }).click();
    await page.locator('#workspace-name').fill('other-workspace');
    await page.locator('#workspace-save-button').click();
    await page.locator('#workspace-form').waitFor({ state: 'hidden' });
    await page.goto(`${workspaceUrl}/settings`);
    await page.locator('#workspace-name').waitFor({ state: 'visible' });
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const drawer = document.querySelector('.workspace-settings-drawer .ant-drawer-content');
      return Boolean(drawer && drawer.getBoundingClientRect().width <= innerWidth);
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const box = await page.locator('.workspace-settings-drawer .ant-drawer-content').boundingBox();
    assert.ok(box && box.width <= 390);
    await page.getByRole('button', { name: '关闭工作空间设置', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('project')) await t.test('空项目首次建设有默认目标，打开与复制不执行写入，错误读取不误判为空', { timeout: 25_000 }, async () => {
    await runProjectKnowledgeInitializationJourney({ page, workspaceRoot, workspaceUrl, expectedBrowserErrors, capture });
  });

  if (selected('project')) await t.test('项目主页单次读取登记，服务列表不依赖旧详情请求', async () => {
    const apiPrefix = `/api/v1/workspaces/${initialWorkspaceId}`;
    const catalogPath = `${apiPrefix}/asset-catalog`;
    const legacyPaths = new Set([`${apiPrefix}/projects/demo`, `${apiPrefix}/projects/demo/services`]);
    const reads: string[] = [];
    const observe = (request: any) => {
      if (request.method() === 'GET') reads.push(new URL(request.url()).pathname);
    };
    const legacyRoute = (target: URL) => legacyPaths.has(target.pathname);
    // A slow unused detail endpoint must not delay the visible project or service list.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    page.on('request', observe);
    await page.route(legacyRoute, async (route: any) => { await held; await route.continue(); });
    try {
      await page.goto(`${workspaceUrl}/projects/demo`);
      await page.locator('[data-service-card="api"]').waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await page.locator('#project-detail-name').innerText(), '演示项目');
      assert.equal(await page.locator('#project-service-count').innerText(), '1');
      assert.equal(reads.filter(value => value === catalogPath).length, 1, '同一份登记供主页和面板使用');
      assert.deepEqual(reads.filter(value => legacyPaths.has(value)), [], '不再为名称或计数请求旧详情与服务列表');
    } finally {
      release(); await page.unroute(legacyRoute); page.off('request', observe);
    }
  });

  if (selected('project')) await t.test('项目列表展示标题与说明，详情展示基础事实与文档', async () => {
    await page.goto(`${workspaceUrl}/projects`);
    const row: any = page.locator('#project-table-body tr').filter({ hasText: '演示项目' });
    await row.waitFor({ state: 'visible' });
    await unique(row, '项目行');
    assert.match(await row.innerText(), /浏览器测试项目/);
    assert.equal(await row.getByRole('link', { name: '详情', exact: true }).count(), 0);
    await row.click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    assert.equal(await page.locator('#project-detail-name').innerText(), '演示项目');
    assert.equal(await page.locator('#project-detail-description').innerText(), '浏览器测试项目');
    assert.equal(await page.locator('#project-service-count').innerText(), '1');
    assert.equal(await page.getByRole('combobox', { name: '关联服务', exact: true }).count(), 1);
    assert.equal(await page.locator('#app-view textarea:visible').count(), 0);
    assert.equal(await page.getByText('操作', { exact: true }).filter({ visible: true }).count(), 0);
    assert.equal(await page.locator('.overview-strip, .related-resource-links').count(), 0);
    assert.equal(await page.locator('.project-home-entries .project-home-entry').count(), 3);
    await page.locator('.project-home-entries [data-knowledge-initialize-action]:visible').waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('.project-home-entry strong').allTextContents(), ['建立项目知识', '项目文章', '项目动态']);
    assert.equal(await page.locator('[data-doc-row="daily"]').count(), 0, '每日演进不再作为项目资料');
    assert.equal(await page.locator('[data-doc-row="readme"], [data-doc-row="agents"]').count(), 2);
    assert.equal(await page.getByRole('button', { name: '查看项目工作', exact: false }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /^移\s*除$/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '更多项目操作', exact: true }).count(), 1);
    await page.setViewportSize({ width: 1680, height: 900 });
    const entryBoxes = await page.locator('.project-home-entry').evaluateAll((items: Element[]) => items.map(item => ({ top: item.getBoundingClientRect().top, height: item.getBoundingClientRect().height })));
    assert.ok(Math.abs(entryBoxes[0].top - entryBoxes[1].top) < 1);
    assert.ok(entryBoxes.every((box: { height: number }) => box.height < 125));
    const serviceRow = page.locator('[data-service-card="api"]');
    const serviceSpacing = await serviceRow.evaluate((link: HTMLElement) => {
      const outer = link.getBoundingClientRect();
      const text = link.querySelector('strong')!.getBoundingClientRect();
      const copy = link.querySelector('small')!.getBoundingClientRect();
      const icon = link.querySelector('.project-service-icon')!.getBoundingClientRect();
      return { top: text.top - outer.top, bottom: outer.bottom - copy.bottom, iconTextGap: text.left - icon.right, clipped: copy.right > outer.right };
    });
    assert.ok(serviceSpacing.top >= 8 && serviceSpacing.bottom >= 8 && serviceSpacing.iconTextGap >= 10 && !serviceSpacing.clipped, JSON.stringify(serviceSpacing));
    await capture(page, 'project-home-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await capture(page, 'project-home-mobile.png');
    await page.setViewportSize({ width: 1680, height: 900 });
    assert.equal(await page.locator('[data-nav="projects"]').evaluate((item: any) => item.classList.contains('active')), true);
    await page.locator('[data-doc-row="readme"]').click();
    await page.locator('.pane-right .artifact-missing').waitFor({ state: 'visible' });
    const paneSize = () => page.locator('.workspace-page:not([hidden]) .pane-stage').evaluate((stage: any) => ({
      left: stage.querySelector('.pane-left').getBoundingClientRect().width,
      right: stage.querySelector('.pane-right')?.getBoundingClientRect().width ?? 0,
      total: stage.getBoundingClientRect().width,
    }));
    const initialPanes = await paneSize();
    assert.ok(Math.abs(initialPanes.left - initialPanes.right) <= 1, JSON.stringify(initialPanes));
    const separator = page.getByRole('separator', { name: '拖拽调整两侧宽度' });
    const dividerBox = await separator.boundingBox();
    assert.ok(dividerBox);
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 30);
    await page.mouse.down();
    await page.mouse.move(dividerBox.x - 80, dividerBox.y + 30, { steps: 5 });
    await page.mouse.up();
    const draggedPanes = await paneSize();
    assert.ok(draggedPanes.right > initialPanes.right + 60);
    const storedRatio = await page.evaluate((id: string) => localStorage.getItem(`buildr.web.pane-ratio.${id}`), initialWorkspaceId);
    assert.ok(storedRatio);
    await page.getByRole('button', { name: '关闭 README.md', exact: true }).click();
    const closedPanes = await paneSize();
    assert.equal(closedPanes.right, 0);
    assert.ok(Math.abs(closedPanes.left - closedPanes.total) <= 1);
    await page.locator('[data-doc-row="readme"]').click();
    assert.ok(Math.abs((await paneSize()).right - draggedPanes.right) <= 1);
    await page.reload();
    await page.locator('[data-doc-row="readme"]').click();
    await page.locator('.pane-right .artifact-missing').waitFor({ state: 'visible' });
    assert.ok(Math.abs((await paneSize()).right - draggedPanes.right) <= 1);
    assert.match(await page.locator('.pane-right .artifact-missing').innerText(), /未找到 README\.md/);
    await page.locator('[data-doc-row="agents"]').click();
    await page.waitForFunction(() => {
      const body: any = document.querySelector('.pane-right .markdown-body')?.textContent || '';
      return !body.includes('正在读取') && /AGENTS\.md|Project|项目/.test(body);
    });
    assert.match(await page.locator('.pane-right .markdown-body').innerText(), /AGENTS\.md|Project|项目/);
    const projectDocumentText = await page.locator('.pane-right .markdown-body').innerText();
    await page.locator('[data-service-card="api"]').click();
    await page.locator('#service-detail-name:visible').waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/projects/demo`);
    assert.equal(await page.getByRole('tab', { name: '演示项目', exact: true }).count(), 1);
    assert.equal(await page.getByRole('tab', { name: '服务详情 关闭 服务详情', exact: true }).count(), 1);
    assert.equal(await page.locator('.pane-right:visible [data-related-resources="projects"]').count(), 0);
    assert.equal(await page.locator('#project-detail-name').isVisible(), true);
    assert.equal(await page.getByRole('tab', { name: 'AGENTS.md 关闭 AGENTS.md', exact: true }).count(), 1);
    await page.goBack();
    await page.locator('.workspace-page:not([hidden]) .pane-right .markdown-body:visible').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-right .markdown-body:visible').innerText(), projectDocumentText);
    await page.goForward();
    await page.locator('#service-detail-name:visible').waitFor({ state: 'visible' });
    await page.locator('[data-nav="skills"]').click();
    await page.locator('[data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.getByRole('tab', { name: '演示项目', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.locator('#service-detail-name:visible').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#project-detail-name').isVisible(), true);
    await page.getByRole('link', { name: '返回项目列表', exact: true }).click();
    await page.locator('#project-table-body tr').filter({ hasText: '演示项目' }).click();
    await page.locator('#project-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#service-detail-name:visible').count(), 0);
    await page.locator('#project-activity-link').click();
    await page.waitForURL(current => current.pathname === new URL(`${workspaceUrl}/activity`).pathname && current.searchParams.get('project') === 'demo' && !current.searchParams.has('date'));
    await page.locator('#workbench-activity').waitFor({ state: 'visible' });
    await page.locator('#workbench-daily-progress').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-nav="activity"]').evaluate((element: HTMLElement) => element.classList.contains('active')), true);
    assert.equal(await page.locator('.pane-right #progress-body').count(), 0, '项目主页进入统一动态页，不挂载旧侧栏详情');
    await page.goBack();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.locator('#project-detail-name').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '编辑项目', exact: true }).click();
    await page.locator('#project-edit-form').waitFor({ state: 'visible' });
    assert.equal(await page.url(), `${workspaceUrl}/projects/demo`);
    await page.locator('#project-description').fill('已在抽屉中更新');
    await page.locator('#project-name').fill('演示项目（已更新）');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#project-detail-description').innerText(), '浏览器测试项目');
    await page.getByRole('button', { name: '编辑项目', exact: true }).click();
    await page.locator('#project-edit-form').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#project-description').inputValue(), '浏览器测试项目');
    await page.locator('#project-description').fill('已在抽屉中更新');
    await page.locator('#project-name').fill('演示项目（已更新）');
    const projectUpdateUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/projects/demo`;
    expectedBrowserErrors.add(projectUpdateUrl);
    const failProjectSave = async (route: any) => {
      if (route.request().method() === 'PUT') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'project_revision_conflict', message: '内容已变化' } }) });
      return route.continue();
    };
    await page.route(projectUpdateUrl, failProjectSave);
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.locator('#project-edit-alert').waitFor({ state: 'visible' });
    assert.match(await page.locator('#project-edit-alert').innerText(), /当前输入已保留/);
    assert.equal(await page.locator('#project-description').inputValue(), '已在抽屉中更新');
    await page.unroute(projectUpdateUrl, failProjectSave);
    await capture(page, 'project-edit-drawer-desktop.png');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('project-detail-description')?.textContent === '已在抽屉中更新');
    assert.equal(await page.locator('#project-detail-description').innerText(), '已在抽屉中更新');
    await page.waitForFunction(() => [...document.querySelectorAll('.workspace-tabstrip .pane-tab .pane-tab-text')].some((node: any) => node.textContent?.includes('演示项目（已更新）')));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('project')) await t.test('代码库已有目录可以移除并重新登记且保留 Git 内容', async () => {
    const repositoryPath = 'repositories/browser-retained', location = path.join(workspaceRoot, repositoryPath);
    fs.mkdirSync(location, { recursive: true }); runGit(location, ['init', '-b', 'main']); fs.writeFileSync(path.join(location, 'keep.txt'), 'repository bytes');
    if (runtime.assetCatalog(workspaceRoot).migrationRequired) runtime.migrateAssetCatalog(workspaceRoot, { revision: runtime.assetCatalog(workspaceRoot).revision });
    await page.goto(`${workspaceUrl}/repositories`);
    for (let round = 0; round < 2; round++) {
      await page.getByRole('button', { name: '新增代码库', exact: true }).click();
      await page.getByRole('combobox', { name: '已有代码库目录', exact: true }).click();
      await page.getByTitle(repositoryPath, { exact: true }).click();
      await page.getByRole('button', { name: '登记代码库', exact: true }).click();
      await page.locator('#repository-create').waitFor({ state: 'detached' });
      const row = page.locator('#repository-table-wrap tr').filter({ hasText: 'browser-retained' }); await row.waitFor();
      await row.getByRole('button', { name: /^移\s*除$/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /^移\s*除$/ }).click();
      await row.waitFor({ state: 'hidden' });
      assert.equal(fs.readFileSync(path.join(location, 'keep.txt'), 'utf8'), 'repository bytes'); assert.ok(fs.existsSync(path.join(location, '.git')));
    }
  });

  if (selected('project')) await t.test('项目连续新增服务和代码库仅在外层提交时保存', async () => {
    await page.goto(`${workspaceUrl}/projects/new`);
    const migration = page.getByRole('button', { name: '迁移登记', exact: true });
    const current = runtime.assetCatalog(workspaceRoot);
    if (current.migrationRequired) { await migration.click(); await migration.waitFor({ state: 'hidden' }); }
    assert.equal(await page.getByRole('tab', { name: '创建项目', exact: true }).count(), 0);
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('嵌套创建项目');
    await page.getByRole('textbox', { name: '项目标识', exact: true }).fill('nested-project');
    await page.getByRole('combobox', { name: '关联服务', exact: true }).click();
    await page.getByRole('textbox', { name: '过滤服务', exact: true }).fill('不存在的服务');
    await page.getByRole('button', { name: '新增服务', exact: true }).click();
    await page.getByRole('textbox', { name: '服务名称', exact: true }).fill('嵌套业务服务');
    await page.getByRole('textbox', { name: '服务标识', exact: true }).fill('nested-business');
    await page.getByRole('combobox', { name: '代码库', exact: true }).click();
    await page.getByRole('button', { name: '新增代码库', exact: true }).click();
    await page.getByRole('textbox', { name: '代码库标识', exact: true }).fill('nested-code');
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('https://example.com/nested.git');
    await page.getByRole('textbox', { name: '集成分支', exact: true }).fill('dev');
    await page.getByRole('button', { name: '添加服务', exact: true }).click();
    await page.getByRole('dialog').filter({ has: page.getByText('新增服务', { exact: true }) }).waitFor({ state: 'hidden' });
    assert.equal(page.url(), `${workspaceUrl}/projects`);
    assert.equal(runtime.assetCatalog(workspaceRoot).projects.some((p: any) => p.code === 'nested-project'), false);
    await page.getByRole('dialog').getByRole('button', { name: '创建项目', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/projects/nested-project`);
    await page.getByRole('link', { name: '嵌套业务服务', exact: true }).waitFor({ state: 'visible' });
    const saved = runtime.assetCatalog(workspaceRoot);
    const project = saved.projects.find((p: any) => p.code === 'nested-project');
    const service = saved.services.find((s: any) => s.code === 'nested-business');
    const repository = saved.repositories.find((r: any) => r.code === 'nested-code');
    assert.deepEqual(project.serviceIds, [service.id]);
    assert.equal(service.repositoryId, repository.id);
    assert.equal(repository.present, true);
    assert.equal(repository.source.path, 'projects/nested-project/services/nested-business');
    assert.equal(runtime.catalogRepositoryStatus(workspaceRoot, repository.id).available, false);
    assert.ok(fs.existsSync(path.join(workspaceRoot, repository.source.path, 'AGENTS.md')));
    await page.getByRole('button', { name: '解除关联 嵌套业务服务', exact: true }).click();
    await page.getByRole('link', { name: '嵌套业务服务', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#project-service-count').innerText(), '0');
    const unlinked = runtime.assetCatalog(workspaceRoot);
    assert.deepEqual(unlinked.projects.find((p: any) => p.id === project.id).serviceIds, []);
    assert.ok(unlinked.services.some((s: any) => s.id === service.id));
    assert.ok(unlinked.repositories.some((r: any) => r.id === repository.id));
    const associationUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/asset-catalog/projects/${project.id}/services`;
    expectedBrowserErrors.add(associationUrl);
    const rejectAssociation = (route: any) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'asset_catalog_revision_conflict', message: '关联版本已变化' } }) });
    await page.route(associationUrl, rejectAssociation);
    await page.getByRole('combobox', { name: '关联服务', exact: true }).click();
    await page.locator('.ant-select-item-option-content').filter({ hasText: '嵌套业务服务' }).click();
    await page.getByRole('alert').filter({ hasText: '关联版本已变化' }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('link', { name: '嵌套业务服务', exact: true }).count(), 0);
    await page.unroute(associationUrl, rejectAssociation);
    await page.getByRole('combobox', { name: '关联服务', exact: true }).click();
    await page.getByRole('textbox', { name: '过滤服务', exact: true }).fill('嵌套');
    await page.locator('.ant-select-item-option-content').filter({ hasText: '嵌套业务服务' }).click();
    await page.getByRole('link', { name: '嵌套业务服务', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#project-service-count').innerText(), '1');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.locator('#project-manage-services .ant-select-selection-item').count(), 0);
    const serviceCount = runtime.assetCatalog(workspaceRoot).services.length;
    await page.getByRole('combobox', { name: '关联服务', exact: true }).click();
    await page.getByRole('button', { name: '新增服务', exact: true }).click();
    await page.getByRole('textbox', { name: '服务名称', exact: true }).fill('保留未提交草稿');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(runtime.assetCatalog(workspaceRoot).services.length, serviceCount);
    await page.getByRole('combobox', { name: '关联服务', exact: true }).click();
    await page.getByRole('button', { name: '新增服务', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '服务名称', exact: true }).inputValue(), '保留未提交草稿');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();

  });

  if (selected('project')) await t.test('移除后从已有目录重新登记，版本冲突保留输入与原文件', async () => {
    let catalog = runtime.assetCatalog(workspaceRoot);
    if (catalog.migrationRequired) catalog = runtime.migrateAssetCatalog(workspaceRoot, { revision: catalog.revision });
    catalog = runtime.createCatalogProject(workspaceRoot, { revision: catalog.revision, code: 'register-browser', name: '重新登记验收项目' });
    const original = catalog.projects.find((project: any) => project.code === 'register-browser');
    const source = path.join(workspaceRoot, 'projects/register-browser/README.md');
    fs.writeFileSync(source, '重新登记保留原始内容\n');
    const missing = path.join(workspaceRoot, 'projects/register-browser/commands.yml');
    fs.rmSync(missing);
    await page.goto(`${workspaceUrl}/projects/register-browser`);
    await page.getByRole('button', { name: '更多项目操作', exact: true }).click();
    await page.getByRole('menuitem', { name: /^移\s*除$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^移\s*除$/ }).click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('#project-directory-create-button').click();
    await page.getByRole('radio', { name: '登记已有项目', exact: true }).check();
    await page.getByRole('combobox', { name: '已有项目目录', exact: true }).click();
    await page.locator('.ant-select-item-option-content').filter({ hasText: 'projects/register-browser' }).click();
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('重新登记后的名称');
    await page.getByRole('textbox', { name: '业务目标', exact: true }).fill('保留本次填写的目标');
    const registrationUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/asset-catalog/projects/register`;
    expectedBrowserErrors.add(registrationUrl);
    const current = runtime.assetCatalog(workspaceRoot);
    runtime.updateCatalogAsset(workspaceRoot, 'project', current.projects[0].id, { revision: current.revision, description: '登记期间由另一个入口修改' });
    await page.getByRole('button', { name: '登记项目', exact: true }).click();
    await page.locator('#project-register-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#project-register-error').innerText(), /当前输入已保留/);
    assert.equal(await page.getByRole('textbox', { name: '项目名称', exact: true }).inputValue(), '重新登记后的名称');
    assert.equal(await page.getByRole('textbox', { name: '业务目标', exact: true }).inputValue(), '保留本次填写的目标');
    await page.getByRole('button', { name: '重新核对目录', exact: true }).click();
    await page.getByRole('button', { name: '登记项目', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !(document.querySelector('button[form="project-register-form"]') as HTMLButtonElement)?.disabled);
    await capture(page, 'project-register-existing-desktop.png');
    await page.getByRole('button', { name: '登记项目', exact: true }).click();
    await page.waitForURL(`${workspaceUrl}/projects/register-browser`);
    await page.locator('#project-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#project-detail-name').innerText(), '重新登记后的名称');
    const registered = runtime.assetCatalog(workspaceRoot).projects.find((project: any) => project.code === original.code);
    assert.notEqual(registered.id, original.id);
    assert.deepEqual(registered.serviceIds, []);
    assert.equal(fs.readFileSync(source, 'utf8'), '重新登记保留原始内容\n');
    assert.equal(fs.existsSync(missing), false);
  });

  if (selected('service')) await t.test('全局服务目录进入主页，旧详情与文档保持兼容', async () => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto(`${workspaceUrl}/services?project=demo`);
    if (runtime.assetCatalog(workspaceRoot).migrationRequired) {
      await page.getByRole('button', { name: '迁移登记', exact: true }).click();
      await page.getByRole('button', { name: '迁移登记', exact: true }).waitFor({ state: 'hidden' });
    }
    assert.equal(await page.locator('#service-project-select').count(), 0);
    const row: any = page.locator('#service-table-body tr').filter({ hasText: '演示服务' });
    await row.waitFor({ state: 'visible' });
    await unique(row, '服务行');
    await capture(page, 'local-app-services-desktop.png');
    const detail: any = row.locator('a[href*="/services/"]');
    await unique(detail, '服务详情操作');
    assert.match(await row.innerText(), /演示项目/);
    await unique(row.getByRole('button', { name: '编辑', exact: true }), '服务目录编辑操作');
    const directServiceHref = await detail.getAttribute('href');
    await detail.click();
    await page.getByRole('tab', { name: '服务详情 关闭 服务详情', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '编辑服务', exact: true }).waitFor({ state: 'visible' });
    await page.locator('.pane-right:visible [data-related-resources="projects"]').waitFor({ state: 'visible' });
    await page.goto(new URL(directServiceHref, workspaceUrl).href);
    await page.getByRole('button', { name: '编辑服务', exact: true }).waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/services`);
    const service = runtime.assetCatalog(workspaceRoot).services.find((item: any) => item.name === '演示服务');
    assert.ok(service, '旧地址必须通过真实登记定位同一服务');
    const mainTabs = await page.locator('.workspace-tabstrip .pane-tab-text').allTextContents();
    // The historical route resolves to the same service preview and preserves its directory.
    await page.goto(`${workspaceUrl}/services/demo/api`);
    await page.waitForURL(`${workspaceUrl}/services`);
    await page.locator('.pane-right:visible #service-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.pane-right:visible #service-detail-name').innerText(), '演示服务');
    assert.equal(await page.locator('.pane-right:visible #service-detail-description').innerText(), '浏览器测试服务');
    assert.equal(await page.locator('.pane-right:visible input, .pane-right:visible textarea').count(), 0);
    assert.equal(await page.locator('.workspace-page:not([hidden]) #service-table-wrap').isVisible(), true);
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-stage:visible').count(), 1);
    assert.deepEqual(await page.locator('.workspace-tabstrip .pane-tab-text').allTextContents(), mainTabs);
    assert.equal(await page.locator('[data-nav="services"]').evaluate((item: any) => item.classList.contains('active')), true);
    await page.locator('[data-doc-row="readme"]').click();
    await page.waitForFunction(() => {
      const body: any = document.querySelector('.pane-right .markdown-body')?.textContent || '';
      return !body.includes('正在读取') && /Demo API|README/.test(body);
    });
    assert.match(await page.locator('.pane-right .markdown-body').innerText(), /Demo API|README/);
    await page.getByRole('button', { name: '← 返回详情', exact: true }).click();
    await page.locator('[data-doc-row="agents"]').click();
    await page.locator('.pane-right:visible .resource-reader').getByRole('heading', { name: 'AGENTS.md', exact: true }).waitFor({ state: 'visible' });
    const agentsResponse = await page.request.get(`${url}/api/v1/workspaces/${initialWorkspaceId}/asset-catalog/services/${service.id}/documents/AGENTS.md`);
    assert.equal(agentsResponse.status(), 200);
    const agentsDocument = await agentsResponse.json();
    if (agentsDocument.exists) await page.locator('.pane-right:visible .resource-reader .markdown-body').waitFor({ state: 'visible' });
    else await page.locator('.pane-right:visible .artifact-missing').getByText('未找到 AGENTS.md', { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '← 返回详情', exact: true }).click();
    await runServiceKnowledgeJourney({ page, workspaceRoot, workspaceUrl, service, capture });
    await page.getByRole('button', { name: '编辑服务', exact: true }).click();
    await page.locator('#catalog-edit').waitFor({ state: 'visible' });
    assert.equal(await page.url(), `${workspaceUrl}/services`);
    await page.getByRole('textbox', { name: '说明', exact: true }).fill('已在抽屉中更新');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '编辑服务', exact: true }).click();
    await page.locator('#catalog-edit').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('textbox', { name: '说明', exact: true }).inputValue(), '浏览器测试服务');
    await page.getByRole('textbox', { name: '说明', exact: true }).fill('已在抽屉中更新');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('service-detail-description')?.textContent === '已在抽屉中更新');
    assert.equal(await page.locator('#service-detail-description').innerText(), '已在抽屉中更新');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.goto(`${workspaceUrl}/services/demo/api/edit`);
    await page.locator('#catalog-edit').waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/services`);
    await page.getByRole('button', { name: '关闭编辑', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('service')) await t.test('目录登记流程移除后保留文件，服务与技能均可重新选择', async () => {
    const directoryPath = 'projects/demo/services/retained-browser';
    const directory = path.join(workspaceRoot, directoryPath);
    fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'keep.txt'), 'browser retained');
    await page.goto(`${workspaceUrl}/services`);
    for (let round = 0; round < 2; round++) {
      await page.getByRole('button', { name: '新增服务', exact: true }).click();
      await page.getByRole('textbox', { name: '服务名称', exact: true }).fill('目录登记服务');
      await page.getByRole('textbox', { name: '服务标识', exact: true }).fill('retained-browser');
      await page.getByRole('combobox', { name: '已有服务目录', exact: true }).click();
      await page.getByTitle(directoryPath, { exact: true }).click();
      await page.getByRole('button', { name: '添加服务', exact: true }).click();
      await page.locator('#catalog-service-create').waitFor({ state: 'detached' });
      const row = page.locator('#service-table-body tr').filter({ hasText: '目录登记服务' });
      await row.waitFor();
      await row.getByRole('button', { name: /^移\s*除$/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /^移\s*除$/ }).click();
      await row.waitFor({ state: 'hidden' });
      assert.equal(fs.readFileSync(path.join(directory, 'keep.txt'), 'utf8'), 'browser retained');
      assert.equal(fs.existsSync(path.join(directory, 'AGENTS.md')), false);
    }
    await page.getByRole('button', { name: '新增服务', exact: true }).click();
    await page.getByRole('textbox', { name: '服务名称', exact: true }).fill('新目录服务');
    await page.getByRole('textbox', { name: '服务标识', exact: true }).fill('new-directory-browser');
    await page.getByRole('combobox', { name: '所在项目', exact: true }).click();
    await page.getByTitle('演示项目', { exact: true }).click();
    await page.getByRole('button', { name: '添加服务', exact: true }).click();
    await page.locator('#catalog-service-create').waitFor({ state: 'detached' });
    assert.ok(fs.existsSync(path.join(workspaceRoot, 'projects/demo/services/new-directory-browser/AGENTS.md')));
    await page.goto(`${workspaceUrl}/skills`);
    await page.locator('#skills-add').click();
    await page.getByRole('textbox', { name: '技能标识', exact: true }).fill('retained-browser-skill');
    await page.getByRole('textbox', { name: '技能描述', exact: true }).fill('保留文件');
    await page.getByRole('textbox', { name: '技能正文', exact: true }).fill('# 浏览器保留技能\n\n正文不改写。');
    await page.getByRole('button', { name: '保存技能', exact: true }).click();
    await page.locator('#skill-registration').waitFor({ state: 'detached' });
    const skillFile = path.join(workspaceRoot, 'skills/retained-browser-skill/SKILL.md'), bytes = fs.readFileSync(skillFile);
    const skillRow = page.locator('[data-skill-id="retained-browser-skill"]');
    await skillRow.getByRole('button', { name: /^移\s*除$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^移\s*除$/ }).click();
    await skillRow.waitFor({ state: 'hidden' }); assert.deepEqual(fs.readFileSync(skillFile), bytes);
    await page.locator('#skills-add').click();
    await page.getByRole('combobox', { name: '已有技能目录', exact: true }).click();
    await page.getByTitle('skills/retained-browser-skill', { exact: true }).click();
    await page.getByRole('button', { name: '保存技能', exact: true }).click();
    await page.locator('#skill-registration').waitFor({ state: 'detached' }); await skillRow.waitFor();
    assert.deepEqual(fs.readFileSync(skillFile), bytes);
    await page.goto(`${workspaceUrl}/services`);
    await page.locator('#service-table-body a[href*="/services/"]').filter({ hasText: /^演示服务$/ }).click();
  });

  if (selected('service')) await t.test('独立列表快速读取，服务和项目删除保留文件与代码库', async () => {
    let c = runtime.assetCatalog(workspaceRoot);
    if (c.migrationRequired) c = runtime.migrateAssetCatalog(workspaceRoot, { revision: c.revision });
    c = runtime.createCatalogProject(workspaceRoot, { revision: c.revision, code: 'delete-browser', name: '删除验收项目', newServices: [{ code: 'delete-browser-api', name: '删除验收服务', repository: { code: 'delete-browser-code', url: 'https://example.com/delete.git', integrationBranch: 'dev' } }] });
    const service = c.services.find((s: any) => s.code === 'delete-browser-api');
    // Reload restores previews from history; explicitly close the prior service before measuring a directory-only request.
    const closeService = page.getByRole('button', { name: '关闭 服务详情', exact: true });
    if (await closeService.count()) await closeService.click();
    await page.locator('.workspace-page:not([hidden]) .pane-right').waitFor({ state: 'hidden' });
    const requests: string[] = [];
    const collect = (request: any) => { if (request.method() === 'GET') requests.push(request.url()); };
    page.on('request', collect);
    await page.goto(`${workspaceUrl}/services`);
    await page.locator('#service-table-body tr').filter({ hasText: '删除验收服务' }).waitFor();
    assert.ok(requests.some(url => url.endsWith('/services')));
    assert.ok(!requests.some(url => url.endsWith('/asset-catalog')));
    page.off('request', collect);
    await page.locator('#service-table-body tr').filter({ hasText: '删除验收服务' }).getByRole('button', { name: /^移\s*除$/ }).click();
    await page.getByRole('dialog').getByText(/将解除这些项目的引用：删除验收项目/).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: /^取\s*消$/ }).click();
    assert.ok(runtime.assetCatalog(workspaceRoot).services.some((s: any) => s.id === service.id));
    await page.locator('#service-table-body tr').filter({ hasText: '删除验收服务' }).getByRole('button', { name: /^移\s*除$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^移\s*除$/ }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('#service-table-body tr').filter({ hasText: '删除验收服务' }).waitFor({ state: 'hidden' });
    c = runtime.assetCatalog(workspaceRoot);
    assert.ok(!c.services.some((s: any) => s.id === service.id));
    assert.ok(c.repositories.some((r: any) => r.id === service.repositoryId));
    assert.ok(fs.existsSync(path.join(workspaceRoot, 'services/delete-browser-api/AGENTS.md')));
    await page.goto(`${workspaceUrl}/projects/delete-browser`);
    await page.getByRole('button', { name: '更多项目操作', exact: true }).click();
    await page.getByRole('menuitem', { name: /^移\s*除$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^移\s*除$/ }).click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('tab', { name: '删除验收项目', exact: true }).count(), 0);
    assert.ok(fs.existsSync(path.join(workspaceRoot, 'projects/delete-browser/AGENTS.md')));
  });

  if (selected('service')) await t.test('连续编辑三个服务使用新读取版本，真实冲突仍保留输入', async () => {
    let c = runtime.assetCatalog(workspaceRoot);
    if (c.migrationRequired) c = runtime.migrateAssetCatalog(workspaceRoot, { revision: c.revision });
    c = runtime.createCatalogProject(workspaceRoot, {
      revision: c.revision, code: 'sequential-edit', name: '连续编辑项目',
      newServices: [1, 2, 3].map(n => ({ code: `sequential-${n}`, name: `连续编辑服务${n}`, repository: { code: `sequential-code-${n}`, url: `https://example.com/sequential-${n}.git`, integrationBranch: 'main' } })),
    });
    const catalogUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/asset-catalog`;
    // Keep the fresh read behind the initial render so a cached snapshot cannot
    // accidentally pass by winning the network race.
    const delayRead = async (route: any) => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill({ response });
    };
    await page.route(catalogUrl, delayRead);
    try {
      await page.goto(`${workspaceUrl}/services`);
      for (const n of [1, 2, 3]) {
        await page.locator('#service-table-body tr').filter({ hasText: `连续编辑服务${n}` }).getByRole('button', { name: '编辑', exact: true }).click();
        await page.getByRole('textbox', { name: '名称', exact: true }).fill(`已修改服务${n}`);
        const saved = page.waitForResponse((response: any) => response.request().method() === 'PUT' && response.url().includes('/asset-catalog/service/'));
        await page.locator('#catalog-edit-save').click();
        assert.equal((await saved).status(), 200, `第 ${n} 次保存不应误报版本冲突`);
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.locator('#service-table-body tr').filter({ hasText: `已修改服务${n}` }).waitFor();
      }
      await page.locator('#service-table-body tr').filter({ hasText: '已修改服务3' }).getByRole('button', { name: '编辑', exact: true }).click();
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('保留我的输入');
      c = runtime.assetCatalog(workspaceRoot);
      const service = c.services.find((s: any) => s.code === 'sequential-3');
      runtime.updateCatalogAsset(workspaceRoot, 'service', service.id, { revision: c.revision, name: '另一入口修改' });
      const updateUrl = `${catalogUrl}/service/${service.id}`;
      expectedBrowserErrors.add(updateUrl);
      const rejected = page.waitForResponse((response: any) => response.request().method() === 'PUT' && response.url() === updateUrl);
      await page.locator('#catalog-edit-save').click();
      assert.equal((await rejected).status(), 409);
      assert.equal(await page.getByRole('textbox', { name: '名称', exact: true }).inputValue(), '保留我的输入');
      assert.equal(runtime.assetCatalog(workspaceRoot).services.find((s: any) => s.id === service.id).name, '另一入口修改');
      await page.getByRole('button', { name: '关闭编辑', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
    } finally {
      await page.unroute(catalogUrl, delayRead);
    }
  });

  if (selected('service')) await t.test('代码库完整声明可编辑，本地分支独立保存且实际 Git 保持不变', async () => {
    let c = runtime.assetCatalog(workspaceRoot);
    if (c.migrationRequired) c = runtime.migrateAssetCatalog(workspaceRoot, { revision: c.revision });
    const codeRoot = path.join(workspaceRoot, 'editable-code'); fs.mkdirSync(codeRoot);
    runGit(codeRoot, ['init', '--initial-branch=dev']);
    c = runtime.createCatalogRepository(workspaceRoot, { revision: c.revision, code: 'editable-code', name: '可编辑代码库', path: 'editable-code' });
    const repository = c.repositories.find((r: any) => r.code === 'editable-code');
    const config = fs.readFileSync(path.join(codeRoot, '.git/config')), head = fs.readFileSync(path.join(codeRoot, '.git/HEAD'));
    await page.goto(`${workspaceUrl}/repositories`);
    const row = page.locator('#repository-table-wrap tr').filter({ hasText: '可编辑代码库' });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: '集成分支', exact: true }).fill('release-next');
    await page.locator('#catalog-edit-save').click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await row.getByText('release-next', { exact: true }).waitFor();
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.find((r: any) => r.id === repository.id).source.integrationBranch, 'release-next');
    await row.getByRole('link', { name: '可编辑代码库', exact: true }).click();
    await page.locator('[data-repository-alignment="ready"]:visible').waitFor();
    await page.getByRole('button', { name: '编辑代码库', exact: true }).click();
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('https://example.com/desired.git');
    await page.getByRole('textbox', { name: '远端名称', exact: true }).fill('upstream');
    await page.getByRole('textbox', { name: '集成分支', exact: true }).fill('main');
    await page.locator('#catalog-edit-save').click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('[data-repository-alignment="pending"]:visible').waitFor();
    await page.getByRole('button', { name: '查看对齐指引', exact: true }).click();
    await page.getByRole('textbox', { name: '代码准备指令', exact: true }).waitFor();
    assert.match(await page.getByRole('textbox', { name: '代码准备指令', exact: true }).inputValue(), /声明保存不代表/);
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(fs.readFileSync(path.join(codeRoot, '.git/config')), config); assert.deepEqual(fs.readFileSync(path.join(codeRoot, '.git/HEAD')), head);
    const updateUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/asset-catalog/repository/${repository.id}`;
    expectedBrowserErrors.add(updateUrl);
    const conflict = (route: any) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'asset_revision_conflict', message: '声明版本已变化' } }) });
    await page.route(updateUrl, conflict);
    await page.getByRole('button', { name: '编辑代码库', exact: true }).click();
    await page.getByRole('textbox', { name: '集成分支', exact: true }).fill('keep-draft');
    await page.locator('#catalog-edit-save').click();
    await page.getByRole('dialog').getByText('声明版本已变化', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: '集成分支', exact: true }).inputValue(), 'keep-draft');
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.find((r: any) => r.id === repository.id).source.git.integrationBranch, 'main');
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.find((r: any) => r.id === repository.id).source.path, 'editable-code');
    await page.getByRole('dialog').getByRole('button', { name: '关闭编辑', exact: true }).click();
    await page.unroute(updateUrl, conflict);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '编辑代码库', exact: true }).click();
    await page.getByRole('textbox', { name: '仓库目录', exact: true }).fill('editable-future');
    await page.locator('#catalog-edit-save').click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('[data-repository-alignment="pending"]:visible').waitFor();
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.find((r: any) => r.id === repository.id).source.path, 'editable-future');
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'editable-future')), false);
    assert.deepEqual(fs.readFileSync(path.join(codeRoot, '.git/config')), config);
  });

  if (selected('service')) await t.test('本地配置自动补入缺失地址且异步读取保留用户输入', async () => {
    let c = runtime.assetCatalog(workspaceRoot);
    if (c.migrationRequired) c = runtime.migrateAssetCatalog(workspaceRoot, { revision: c.revision });
    const codeRoot = path.join(workspaceRoot, 'config-code'); fs.mkdirSync(codeRoot);
    runGit(codeRoot, ['init', '--initial-branch=dev']);
    runGit(codeRoot, ['remote', 'add', 'origin', 'https://example.com/actual-local.git']);
    runGit(codeRoot, ['symbolic-ref', 'HEAD', 'refs/heads/codex/preview-test']);
    c = runtime.createCatalogRepository(workspaceRoot, { revision: c.revision, code: 'config-code', name: '本地配置代码库', path: 'config-code', integrationBranch: 'dev' });
    const repository = c.repositories.find((r: any) => r.code === 'config-code');
    const manifest = fs.readFileSync(path.join(workspaceRoot, 'repositories/manifest.yml'));
    await page.goto(`${workspaceUrl}/repositories`);
    const row = page.locator('#repository-table-wrap tr').filter({ hasText: '本地配置代码库' });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await page.waitForFunction(() => (document.querySelector('input[aria-label="Git 地址"]') as HTMLInputElement)?.value === 'https://example.com/actual-local.git');
    assert.equal(await page.getByRole('textbox', { name: '远端名称', exact: true }).inputValue(), 'origin');
    assert.equal(await page.getByRole('textbox', { name: '集成分支', exact: true }).inputValue(), 'dev');
    assert.deepEqual(fs.readFileSync(path.join(workspaceRoot, 'repositories/manifest.yml')), manifest);
    await page.getByRole('dialog').getByRole('button', { name: '关闭编辑', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const configUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/repositories/${repository.id}/local-config`;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = async (route: any) => { await gate; return route.continue(); };
    await page.route(configUrl, delayed);
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('https://example.com/my-draft.git');
    release();
    await page.locator('[data-local-repository-config]').waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Git 地址', exact: true }).inputValue(), 'https://example.com/my-draft.git');
    assert.equal(await page.getByRole('textbox', { name: '集成分支', exact: true }).inputValue(), 'dev');
    await page.getByRole('dialog').getByRole('button', { name: '关闭编辑', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.unroute(configUrl, delayed);
    await row.getByRole('link', { name: '本地配置代码库', exact: true }).click();
    await page.locator('.resource-facts:visible').getByText('https://example.com/actual-local.git', { exact: true }).waitFor();
    runGit(codeRoot, ['remote', 'set-url', 'origin', 'https://example.com/changed-local.git']);
    await page.locator('.resource-facts:visible').getByRole('button', { name: '检查状态', exact: true }).click();
    await page.locator('.resource-facts:visible').getByText('https://example.com/changed-local.git', { exact: true }).waitFor();
    assert.deepEqual(fs.readFileSync(path.join(workspaceRoot, 'repositories/manifest.yml')), manifest);
  });

  if (selected('service')) await t.test('服务编辑提供过滤新增选项且只在保存时登记新代码库', async () => {
    let c = runtime.assetCatalog(workspaceRoot);
    if (c.migrationRequired) c = runtime.migrateAssetCatalog(workspaceRoot, { revision: c.revision });
    c = runtime.createCatalogService(workspaceRoot, { revision: c.revision, service: { code: 'inline-picker-service', name: '内联选择服务', repositoryId: c.repositories[0].id } });
    const service = c.services.find((s: any) => s.code === 'inline-picker-service'), count = c.repositories.length;
    await page.goto(`${workspaceUrl}/services`);
    const row = page.locator('#service-table-body tr').filter({ hasText: '内联选择服务' });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('保留服务名称草稿');
    await page.getByRole('combobox', { name: '代码库', exact: true }).press('ArrowDown');
    const filter = page.getByRole('textbox', { name: '过滤代码库', exact: true });
    await filter.fill('没有匹配的代码库');
    const create = page.getByRole('button', { name: '新增代码库', exact: true });
    await create.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const popup = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .resource-select-popup');
      const input = popup?.querySelector('input'), button = popup?.querySelector('.resource-select-create');
      return input && button && button.getBoundingClientRect().top > input.getBoundingClientRect().top;
    });
    await create.click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('textbox', { name: '代码库标识', exact: true }).fill('inline-picker-code');
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('https://example.com/inline-picker.git');
    await page.getByRole('textbox', { name: '集成分支', exact: true }).fill('dev');
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.length, count);
    await page.getByRole('button', { name: '取消新增代码库', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '名称', exact: true }).inputValue(), '保留服务名称草稿');
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.length, count);
    await page.getByRole('combobox', { name: '代码库', exact: true }).press('ArrowDown');
    await create.click();
    assert.equal(await page.getByRole('textbox', { name: '代码库标识', exact: true }).inputValue(), 'inline-picker-code');
    const updateUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}/asset-catalog/service/${service.id}`;
    expectedBrowserErrors.add(updateUrl);
    const conflict = (route: any) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'asset_revision_conflict', message: '清单版本已变化' } }) });
    await page.route(updateUrl, conflict);
    await page.locator('#catalog-edit-save').click();
    await page.getByRole('dialog').getByText('清单版本已变化', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: '代码库标识', exact: true }).inputValue(), 'inline-picker-code');
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.length, count);
    await page.unroute(updateUrl, conflict);
    await page.locator('#catalog-edit-save').click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const saved = runtime.assetCatalog(workspaceRoot), repository = saved.repositories.find((r: any) => r.code === 'inline-picker-code');
    assert.ok(repository); assert.equal(saved.repositories.length, count + 1);
    assert.equal(saved.services.find((s: any) => s.id === service.id).repositoryId, repository.id);
    assert.equal(saved.services.find((s: any) => s.id === service.id).name, '保留服务名称草稿');
    assert.equal(repository.source.path, 'repositories/inline-picker');
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'repositories/inline-picker-code')), false);
  });

  if (selected('service')) await t.test('新增代码库从地址自动填入标识目录并分别保护手动值', async () => {
    const count = runtime.assetCatalog(workspaceRoot).repositories.length;
    await page.goto(`${workspaceUrl}/repositories`);
    await page.getByRole('button', { name: '新增代码库', exact: true }).click();
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('https://example.com/team/Automatic.git/');
    assert.equal(await page.getByRole('textbox', { name: '代码库标识', exact: true }).inputValue(), 'Automatic');
    assert.equal(await page.getByRole('textbox', { name: '仓库目录', exact: true }).inputValue(), 'repositories/Automatic');
    await page.getByRole('textbox', { name: '代码库标识', exact: true }).fill('manual-code');
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('git@example.com:team/Next.git');
    assert.equal(await page.getByRole('textbox', { name: '代码库标识', exact: true }).inputValue(), 'manual-code');
    assert.equal(await page.getByRole('textbox', { name: '仓库目录', exact: true }).inputValue(), 'repositories/Next');
    await page.getByRole('textbox', { name: '仓库目录', exact: true }).fill('custom/location');
    await page.getByRole('textbox', { name: 'Git 地址', exact: true }).fill('ssh://git@example.com/team/Third.git');
    assert.equal(await page.getByRole('textbox', { name: '代码库标识', exact: true }).inputValue(), 'manual-code');
    assert.equal(await page.getByRole('textbox', { name: '仓库目录', exact: true }).inputValue(), 'custom/location');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(runtime.assetCatalog(workspaceRoot).repositories.length, count);
  });

  if (selected('service')) await t.test('服务文档使用副屏，代码准备使用抽屉，窄屏关闭恢复主页', async () => {
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto(`${workspaceUrl}/services`);
    await page.locator('#service-table-body a[href*="/services/"]').filter({ hasText: /^演示服务$/ }).click();
    await page.locator('[data-doc-row="readme"]').click();
    await page.locator('.pane-right .markdown-body').waitFor({ state: 'visible' });
    assert.match(await page.locator('.pane-right .markdown-body').innerText(), /Demo API/);
    assert.equal(await page.locator('.pane-left .markdown-body').count(), 0);
    await page.getByRole('button', { name: '← 返回详情', exact: true }).click();
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-right').count(), 1);
    // A workspace-source fixture is ready; preparation is available on its repository home.
    await page.locator('.resource-repository-summary a').click();
    await page.getByRole('button', { name: '准备代码', exact: true }).click();
    await page.getByRole('textbox', { name: '代码准备指令', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.pane-left textarea').count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('link', { name: /演示服务/ }).filter({ hasText: '演示服务' }).last().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-doc-row="readme"]').click();
    await page.getByRole('dialog', { name: '阅读材料' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-right:visible').count(), 1);
    assert.equal(await page.getByRole('dialog', { name: '阅读材料' }).getAttribute('aria-modal'), 'true');
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-reading-mask:visible').count(), 1);
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-left').getAttribute('inert'), '');
    await page.getByRole('button', { name: '关闭阅读', exact: true }).click();
    await page.getByRole('dialog', { name: '阅读材料' }).waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.workspace-page:not([hidden]) .pane-left').getAttribute('inert'), null);
    assert.equal(await page.getByRole('heading', { name: '服务', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('service')) await t.test('390px 下目录与详情不产生页面横向溢出', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${workspaceUrl}/services?project=demo`);
    await page.locator('#service-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#service-table-body a[href*="/services/"]').filter({ hasText: /^演示服务$/ }).click();
    await page.locator('#service-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await unique(page.getByRole('button', { name: '编辑服务', exact: true }), '服务详情编辑操作');
    await capture(page, 'local-app-service-detail-mobile.png');
    await page.getByRole('button', { name: '编辑服务', exact: true }).click();
    await page.locator('#catalog-edit').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const rect = document.querySelector('.metadata-edit-drawer .ant-drawer-content-wrapper')?.getBoundingClientRect();
      return rect && Math.abs(rect.width - window.innerWidth) <= 1 && Math.abs(rect.right - window.innerWidth) <= 1;
    });
    assert.equal(await page.locator('#catalog-edit-save').isVisible(), true);
    await capture(page, 'service-edit-drawer-mobile.png');
    await page.keyboard.press('Escape');
    await page.locator('.metadata-edit-drawer').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '关闭阅读', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('change')) await t.test('Change 详情展示任务关联事实与 OpenSpec 只读内容', async () => {
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await page.goto(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    await page.locator('#task-change-provenance').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /工作副本/);
    assert.match(await page.locator('#change-brief').innerText(), /浏览器流程/);
    assert.equal(await page.getByRole('button', { name: /审查|继续推进/ }).count(), 0, 'Change 详情只读展示');
  });

  if (selected('task')) await t.test('任务列表筛选、编辑、冲突、终态确认与窄屏交互共享同一 Task Record', async () => {
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    const staleChangeRoot: any = path.join(workspaceRoot, 'projects', 'demo', 'openspec', 'changes', 'stale-history');
    writeChange(path.join(workspaceRoot, 'projects', 'demo'), 'stale-history', '历史引用');
    const staleReferenceTask: any = runtime.createTask(workspaceRoot, { taskId: 'browser-stale-reference', title: '历史引用任务', intent: '验证终态历史引用不占用任务列表', projects: ['demo'], services: [], changes: ['demo/stale-history'] });
    runtime.abandonTask(workspaceRoot, 'browser-stale-reference', { expectedRecordDigest: staleReferenceTask.recordDigest, reason: '构造已放弃历史任务' });
    fs.rmSync(staleChangeRoot, { recursive: true });
    prepareEvidenceFixture(runtime, workspaceRoot, 'browser-delivered');
    prepareEvidenceFixture(runtime, workspaceRoot, 'browser-stale');
    recordVerificationResultFromEvidence(runtime, workspaceRoot, 'browser-stale', {
      targetIdentity: `sha256-${crypto.createHash('sha256').update('browser-stale-target').digest('hex')}`, targetSummary: '已变化目标',
      capabilities: [{ project: 'demo', capability: 'demo.browser', outcome: 'passed', facts: ['旧目标验证事实。'] }],
      coverageGaps: [], conclusion: { outcome: 'passed', summary: '旧目标曾通过。' }, declarationRoot: workspaceRoot,
    });
    runtime.completeTask(workspaceRoot, 'browser-delivered', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-delivered').recordDigest, summary: '浏览器交付完成' });
    await page.goto(`${workspaceUrl}/tasks/browser-parent`);
    await page.waitForFunction((id: any) => document.getElementById('task-detail-id')?.textContent === id, 'browser-parent');
    await page.locator('.composite-task-reader').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-work-path').count(), 0, '组合任务使用整体目标与子任务阅读');
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.waitForFunction((id: any) => document.getElementById('task-detail-id')?.textContent === id, 'browser-task');
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true');
    const focusReads: string[] = [];
    const trackFocusReads = (request: any) => { if (new URL(request.url()).pathname.includes('/tasks/browser-task')) focusReads.push(request.url()); };
    await page.locator('#task-node-content .markdown-body').waitFor({state:'visible'});
    await page.waitForLoadState('networkidle');
    page.on('request',trackFocusReads);
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(350);
    page.off('request',trackFocusReads);
    assert.deepEqual(focusReads, [], '返回浏览器不自动重读任务详情');
    assert.deepEqual(await page.locator('[data-task-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-task-node'))), ['requirements','design','implementation','closeout']);
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '普通用户先从这里了解变更' }).waitFor({ state: 'visible' });
    await page.locator('#task-node-content').getByRole('button',{name:'查看原文',exact:true}).click();
    assert.match(await page.locator('#task-node-content .markdown-reader-source').innerText(), /普通用户先从这里了解变更/);
    await page.locator('#task-node-content').getByRole('button',{name:'阅读模式',exact:true}).click();
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '任务详情复用列表分屏，内部不得再创建分屏');
    assert.equal(await page.locator('.pane-right:visible').count(), 1);
    assert.equal(await page.locator('.pane-left #task-table-body').isVisible(), true, '打开详情时保留任务列表');
    assert.ok(await page.locator('.task-compact-table thead').isVisible());
    assert.equal(await page.locator('.task-row-id').count(),0);
    const rowHeight = await page.locator('#task-table-body tr.ant-table-row').first().evaluate((node: HTMLElement) => node.getBoundingClientRect().height);
    assert.ok(rowHeight <= 80, `任务条目应紧凑，实际高度 ${rowHeight}`);
    assert.equal(await page.getByRole('button',{name:'收藏当前资料',exact:true}).count(),0);
    assert.equal(await page.locator('#task-context-edit').count(),0);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '验证 Buildr Web' }).waitFor({ state: 'visible' });
    await page.locator('[data-task-artifact$="design.md"]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: 'Browser smoke fixture' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.task-summary-checks').count(), 0, '总览不重复列出专业状态');
    await page.locator('[data-task-content=review]').waitFor({state:'visible'});
    await page.locator('#task-node-content .task-node-reading').evaluate((node: HTMLElement) => { node.scrollTop = 350; });
    const designScroll = await page.locator('#task-node-content .task-node-reading').evaluate((node: HTMLElement) => node.scrollTop);
    assert.ok(designScroll > 200, '长设计文档形成实际阅读位置');
    assert.equal(await page.locator('.pane-right .pane-body').evaluate((node:HTMLElement)=>node.scrollTop),0,'正文滚动不移动整页');
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click();
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
    await page.waitForFunction((top: number) => Math.abs((document.querySelector('#task-node-content .task-node-reading')?.scrollTop || 0) - top) < 3, designScroll, {timeout:3000}).catch(async () => { assert.fail(`设计阅读位置未恢复：期望 ${designScroll}，实际 ${await page.locator('#task-node-content .task-node-reading').evaluate((node: HTMLElement) => node.scrollTop)}`); });
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /Browser smoke fixture/, '回到原设计文档和滚动位置');

    await page.locator('[data-task-artifact$="spec.md"]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: 'Demo Capability Specification' }).waitFor({ state: 'visible' });
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click();
    assert.equal(await page.locator('#task-checklist-panel').isVisible(), false, '清单默认隐藏');
    await page.locator('#task-checklist-toggle').click();
    await page.locator('.task-checklist .markdown-body').filter({ hasText: '准备 fixture' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-checklist-toggle').evaluate((node:HTMLElement) => document.activeElement === node),true,'浮窗不自动抢焦点');
    await page.getByRole('button',{name:'关闭实施清单',exact:true}).press('Escape');
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),false);
    assert.equal(await page.locator('#task-checklist-toggle').evaluate((node:HTMLElement) => document.activeElement === node),true,'关闭后焦点回到入口');
    await page.setViewportSize({width:2560,height:1000});
    await page.mouse.move(10,10);
    await page.locator('#task-checklist-toggle').hover();
    await page.locator('#task-checklist-panel').waitFor({state:'visible'});
    await page.locator('#task-checklist-panel .side-reading-heading').hover();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),true,'入口移入清单不会误关');
    const bounds = await page.locator('#task-checklist-panel').evaluate((node:HTMLElement)=>({top:node.getBoundingClientRect().top,right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width,layoutTop:document.querySelector('.task-detail-layout')!.getBoundingClientRect().top}));
    assert.ok(Math.abs(bounds.top-bounds.layoutTop)<2,'浮窗只在标签下方');
    const tabsBottom=await page.locator('#task-work-path').evaluate((node:HTMLElement)=>node.getBoundingClientRect().bottom);
    assert.ok(Math.abs(bounds.top-tabsBottom)<2,'浮窗上沿贴齐标签分隔线');
    assert.equal(Math.round(bounds.width),520);
    await page.locator('#task-checklist-pin').click();
    assert.equal(await page.locator('#task-checklist-pin').getAttribute('aria-pressed'),'true');
    const pinned = await page.locator('#task-checklist-panel').evaluate((node:HTMLElement)=>({width:node.getBoundingClientRect().width,layout:node.parentElement!.clientWidth,reading:document.querySelector('.task-detail-reading')!.getBoundingClientRect().right,left:node.getBoundingClientRect().left}));
    assert.ok(Math.abs(pinned.width/pinned.layout-.35)<.02,'固定按比例占位');
    assert.ok(pinned.reading<=pinned.left,'固定不遮盖正文');
    await page.mouse.move(10,10); await page.waitForTimeout(500);
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),true,'固定后离开不隐藏');
    await page.locator('#task-checklist-pin').click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#task-checklist-panel').isVisible(),true,'取消固定后鼠标不动且仍在面板内时不自动隐藏');
    await page.mouse.move(10,10);
    await page.locator('#task-checklist-panel').waitFor({state:'hidden'});
    await page.setViewportSize({width:1280,height:720});

    await closeTaskReading(page);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /Demo Capability Specification/, '切回方案保持上次选择的规范');
    await page.locator('[data-task-tab=prototype]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-task-tab=prototype]').length === 2);
    assert.equal(await page.locator('[data-task-tab=prototype]').count(), 2);
    await page.locator('[data-task-tab=prototype]').filter({ hasText: '原型任务总览' }).click();
    await page.locator('#task-prototype-source summary').click();
    assert.match(await page.locator('#task-prototype-source').innerText(), /demo\/browser-flow[\s\S]*prototype-fixtures/);
    assert.equal(await page.locator('#task-prototype-open-window').innerText(), '单独查看');
    assert.equal(await page.locator('.ui-prototype-stage-heading').getByText('隔离预览').count(), 0);
    assert.equal(await page.locator('#task-prototype-frame').getAttribute('sandbox'), 'allow-scripts');
    const prototypeSource: any = await page.locator('#task-prototype-frame').getAttribute('src');
    assert.ok(prototypeSource);
    const [prototypeWindow]: any = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('#task-prototype-open-window').click(),
    ]);
    await prototypeWindow.waitForURL((opened: any) => new URL(opened).pathname.endsWith('/tasks/browser-task/prototypes'));
    await prototypeWindow.locator('nav[aria-label="原型页面列表"]').waitFor({state:'visible'});
    await prototypeWindow.locator('nav button').nth(1).waitFor({state:'visible'});
    assert.equal(await prototypeWindow.locator('nav button').count(),2);
    assert.equal(await prototypeWindow.locator('#task-prototype-frame').getAttribute('sandbox'),'allow-scripts');
    if (!await prototypeWindow.locator('#prototype-notes-panel').isVisible()) await prototypeWindow.getByRole('button',{name:'功能说明',exact:true}).click();
    await prototypeWindow.getByText('此页面尚未提供与本次任务相关的功能说明。').waitFor({state:'visible'});
    await prototypeWindow.close();
    const prototypeResponse: any = await page.request.get(new URL(prototypeSource, url).href);
    assert.equal(prototypeResponse.status(), 200);
    assert.match(prototypeResponse.headers()['content-security-policy'] || '', /sandbox allow-scripts[\s\S]*connect-src 'none'[\s\S]*form-action 'none'[\s\S]*frame-ancestors 'self'/);
    const prototypeFrame: any = page.frameLocator('#task-prototype-frame');
    await prototypeFrame.locator('#prototype-action').waitFor({ state: 'visible' });
    assert.equal(await prototypeFrame.locator('body').getAttribute('data-parent-access'), 'blocked');
    await prototypeFrame.locator('#prototype-action').click();
    await prototypeFrame.locator('#prototype-state').filter({ hasText: '已确认' }).waitFor({ state: 'visible' });
    await page.locator('[data-task-tab=prototype]').filter({ hasText: '原型任务详情' }).click();
    await page.frameLocator('#task-prototype-frame').locator('#prototype-detail-heading').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-prototype-title').innerText(), '原型任务详情');
    // Coordination consumes real task outcomes without a Parent development workflow.
    runtime.completeTask(workspaceRoot, 'browser-contribution-delivered', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-contribution-delivered').recordDigest, summary: '贡献交付子任务已完成' });
    runtime.completeTask(workspaceRoot, 'browser-unproven', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'browser-unproven').recordDigest, summary: '顶层标记完成，实际交付仍需核对' });
    // Review and Verification remain independent facts without an Environment record.
    prepareEvidenceFixture(runtime, workspaceRoot, 'browser-task');

    const defaultTaskCount: any = runtime.queryTasks(workspaceRoot, { status: 'open' }).matchingTaskCount;
    await page.getByRole('button', {name:'关闭 普通任务', exact:true}).click();
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), defaultTaskCount, '默认目录必须只显示未结束任务');
    assert.equal(await page.locator('#task-detail-id').count(), 0, '完整列表不得自动选择第一项任务');
    const listFrame = await page.locator('#task-table-wrap').evaluate((element: HTMLElement) => {
      const table = element.querySelector('.task-compact-table')!;
      const outer = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth, bottomGap: outer.bottom - table.getBoundingClientRect().bottom };
    });
    assert.equal(listFrame.borderTop, '0px', '任务列表只保留列表本身的一层边框');
    assert.equal(listFrame.borderBottom, '0px', '任务列表外容器不能再画一层底框');
    assert.ok(listFrame.bottomGap <= 2, `全部读完后不能保留空的续载区域：${JSON.stringify(listFrame)}`);
    assert.equal(await page.locator('#task-load-more-state').isVisible(), false, '无更多任务时续载状态不占位');
    await page.locator('#task-filter-q').fill('绝对不会命中的任务');
    await page.locator('#task-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-empty').innerText(), /当前筛选没有匹配任务/);
    await page.locator('#task-filter-q').clear();
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    await page.locator('#task-filter-q').fill('任务');
    await page.locator('#task-search-hint').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-search-hint').innerText(), /每个关键词至少输入3个字符/);
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), defaultTaskCount, '短关键词不得触发扫描或替换当前结果');
    await page.locator('#task-filter-q').clear();
    await page.locator('#task-search-hint').waitFor({ state: 'hidden' });
    process.stderr.write('[buildr-browser] selector=task phase=filtered-empty-verified\n');

    let paginationStore: any = runtime.openWorkspaceStructuredStore(workspaceRoot, { writable: true });
    const insertPaginationTask: any = paginationStore.database.prepare('INSERT INTO tasks(task_id, title, intent, status, result_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    paginationStore.database.exec('BEGIN');
    for (let index: any = 0; index < 60; index += 1) {
      insertPaginationTask.run(`browser-page-${String(index).padStart(2, '0')}`, `滚动续载任务 ${index}`, '验证 50/40 信息流分页', 'todo', null, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    }
    paginationStore.database.exec('COMMIT');
    paginationStore.database.close();
    const paginationRequests: any[] = [];
    const observePaginationRequest: any = (request: any) => {
      const requestUrl: any = new URL(request.url());
      if (requestUrl.pathname.endsWith('/tasks')) paginationRequests.push(requestUrl);
    };
    page.on('request', observePaginationRequest);
    const paginationRoute: any = /\/tasks(?:\?|$)/;
    let failNextPaginationRequest: any = true;
    await page.route(paginationRoute, async (route: any) => {
      const requestUrl: any = new URL(route.request().url());
      if (failNextPaginationRequest && requestUrl.searchParams.has('cursor')) {
        failNextPaginationRequest = false;
        expectedBrowserErrors.add(requestUrl.href);
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'browser_pagination_fixture_failed', message: '续载夹具失败' } }) });
      }
      return route.continue();
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 50);
    assert.match(await page.locator('#tasks-state').innerText(), /已加载 50 \/ 共 \d+ 个任务/);
    const prefetchRow: any = page.locator('#task-table-body [data-task-prefetch="true"]');
    await prefetchRow.scrollIntoViewIfNeeded();
    await page.locator('#task-load-more-state').getByRole('button', { name: '继续读取失败，重试', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), 50, '续载失败不得清空或替换已加载 Task');
    await page.locator('#task-load-more-state').getByRole('button', { name: '继续读取失败，重试', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length > 50);
    await page.locator('#task-load-more-state').waitFor({ state: 'hidden' });
    const loadedTaskIds: any[] = await page.locator('#task-table-body tr.ant-table-row').evaluateAll((rows: any[]) => rows.map((row: any) => row.getAttribute('data-task-id')));
    assert.equal(new Set(loadedTaskIds).size, loadedTaskIds.length, '滚动追加不得产生重复 Task');
    assert.equal(paginationRequests.some((requestUrl: any) => requestUrl.searchParams.get('pageSize') === '50' && requestUrl.searchParams.has('cursor')), true, '第40条附近必须使用cursor预取下一批');
    const returnRow = page.locator('#task-table-body tr.ant-table-row').nth(45);
    await returnRow.scrollIntoViewIfNeeded();
    const beforeDetailScroll = await page.locator('#task-table-wrap').evaluate((element: HTMLElement) => element.closest('.pane-body')?.scrollTop || 0);
    assert.ok(beforeDetailScroll > 0, '完整列表必须支持主屏内滚动');
    await returnRow.click();
    await page.getByRole('button', {name:'关闭 普通任务', exact:true}).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-wrap:visible').count(), 1, '打开副屏期间保留唯一任务列表');
    assert.equal(await page.locator('.pane-stage:visible').count(), 1);
    await page.getByRole('button', {name:'关闭 普通任务', exact:true}).click();
    await page.waitForURL(`${workspaceUrl}/tasks`);
    await page.waitForFunction((top: number) => Math.abs((document.querySelector('#task-table-wrap')?.closest('.pane-body')?.scrollTop || 0) - top) <= 2, beforeDetailScroll);
    assert.ok(await page.locator('#task-table-body tr.ant-table-row').count() > 50, '返回应恢复先前读到的批次');
    await page.unroute(paginationRoute);
    page.off('request', observePaginationRequest);
    paginationStore = runtime.openWorkspaceStructuredStore(workspaceRoot, { writable: true });
    paginationStore.database.prepare("DELETE FROM tasks WHERE task_id LIKE 'browser-page-%'").run();
    paginationStore.database.close();
    await page.reload();
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    process.stderr.write('[buildr-browser] selector=task phase=infinite-scroll-verified\n');

    await page.goto(`${url}/workspaces/${otherWorkspaceId}/tasks`);
    await page.locator('#task-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-empty').innerText(), /还没有正式任务记录/);
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    process.stderr.write('[buildr-browser] selector=task phase=empty-workspace-verified\n');
    let markDelayedActiveStarted: any;
    const delayedActiveStarted: any = new Promise((resolve: any) => { markDelayedActiveStarted = resolve; });
    const taskListRoute: any = /\/tasks(?:\?|$)/;
    let delayNextTaskList: any = true;
    const observedTaskRequests: any[] = [];
    const observeTaskRequest: any = (request: any) => { if (request.url().includes('/tasks')) observedTaskRequests.push(request.url()); };
    page.on('request', observeTaskRequest);
    await page.route(taskListRoute, async (route: any) => {
      if (!delayNextTaskList) return route.continue();
      delayNextTaskList = false;
      markDelayedActiveStarted();
      await new Promise((resolve: any) => setTimeout(resolve, 800));
      try { await route.continue(); } catch {}
    });
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-status', '进行中');
    await applyTaskFilters(page);
    await Promise.race([
      delayedActiveStarted,
      page.waitForTimeout(5000).then(() => { throw new Error(`delayed Task list request was not observed: ${observedTaskRequests.join(', ')}`); }),
    ]);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-status', '已完成');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 3);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), 3, '旧active请求不得覆盖新的completed结果');
    await page.unroute(taskListRoute);
    page.off('request', observeTaskRequest);
    await openTaskFilterPanel(page);
    await page.locator('#task-filter-clear').click();
    await applyTaskFilters(page);
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    process.stderr.write('[buildr-browser] selector=task phase=request-race-verified\n');
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-status', '已放弃');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    assert.match(await page.locator('#task-table-body').innerText(), /历史引用任务/);
    assert.equal(await page.locator('#task-diagnostics').count(), 0, '历史引用诊断只保留在任务详情，不占用任务列表');
    await openTaskFilterPanel(page);
    await page.locator('#task-filter-clear').click();
    await applyTaskFilters(page);
    await page.waitForFunction((count: any) => document.querySelectorAll('#task-table-body tr.ant-table-row').length === count, defaultTaskCount);
    assert.equal(await page.locator('[data-nav="tasks"]').evaluate((item: any) => item.classList.contains('active')), true);
    assert.equal(await page.getByRole('columnheader', {name:'任务', exact:true}).isVisible(), true);
    assert.equal(await page.locator('#task-create-form').count(), 0);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-project', '演示项目');
    await openAntdSelect(page, 'task-filter-service');
    assert.deepEqual(await antdSelectOptionTexts(page), ['全部服务', '演示服务']);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: '演示服务' })
      .first()
      .click();
    await page.waitForFunction(
      () => document.querySelector(`.ant-select:has(#task-filter-service) .ant-select-selection-item`)?.textContent?.includes('演示服务'),
    );
    await applyTaskFilters(page);
    await openTaskSearch(page);
    await page.locator('#task-filter-q').fill('轻量查询');
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    assert.match(await page.locator('#task-table-body').innerText(), /页面查看任务/);
    const selectedListUrl = page.url();
    await page.locator('#task-table-body tr.ant-table-row').click();
    await page.waitForFunction((id: any) => document.getElementById('task-detail-id')?.textContent === id, 'created-in-app');
    assert.equal(page.url(), selectedListUrl, '列表打开详情保持当前筛选 URL');
    assert.equal(await page.locator('#task-detail-status').innerText(), '进行中');
    assert.equal(await page.locator('.pane-left #task-table-body tr.ant-table-row').count(), 1, '打开详情保留列表筛选结果');
    assert.equal(await page.locator('#task-filter-q').inputValue(), '轻量查询');
    assert.equal(await page.locator('.pane-right #task-detail-main').isVisible(), true);
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '任务详情中没有嵌套副屏');
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '普通用户先从这里了解变更' }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('link', {name:'查看关联变更',exact:true}).count(), 0, '节点正文不重复提供技术目录入口');
    assert.match(await page.locator('#task-detail-parent').innerText(), /浏览器协调任务[\s\S]*进行中/);
    await page.locator('#task-detail-parent a').click();
    await page.locator('#task-detail-id:visible').filter({ hasText: 'browser-parent' }).waitFor();
    await page.getByRole('button', { name: '关闭 普通任务', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-detail-id')?.textContent === 'browser-parent');
    await page.locator('.composite-task-reader').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-work-path').count(), 0);
    await openTaskActionModal(page, 'task-complete-action');
    await page.getByRole('dialog').filter({ hasText: '结束组合任务' }).waitFor({ state: 'visible' });
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-parent').record.status, 'active');

    await page.goto(`${workspaceUrl}/tasks/created-in-app`);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click(); await page.locator('[data-task-content=review]').click();
    assert.match(await page.locator('#task-node-content').innerText(), /暂无审查记录/);
    assert.equal(await page.getByRole('button', { name: '交给智能体审查', exact: true }).count(), 0);
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    assert.match(await page.locator('#task-node-content').innerText(), /尚未保存验证结果/);
    await openTaskActionModal(page, 'task-complete-action');
    await page.locator('#task-complete-summary').fill('页面确认完成');
    await page.locator('#task-complete-form').getByRole('button', { name: '确认完成', exact: true }).click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'visible' });
    await confirmAntModal(page);
    await page.locator('#task-detail-status').filter({ hasText: '已完成' }).waitFor({ state: 'visible' });
    await page.locator('#task-more-actions').click(); assert.equal(await page.locator('#task-complete-action').count(), 0); await page.keyboard.press('Escape');
    assert.equal(runtime.inspectTask(workspaceRoot, 'created-in-app').record.result.summary, '页面确认完成');
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '页面确认完成' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.pane-stage:visible').count(), 1, '收尾节点直接展示完成摘要');
    const retrospectivePath: any = path.join(workspaceRoot, '.buildr/local/task-retrospectives/created-in-app.md');
    fs.mkdirSync(path.dirname(retrospectivePath), { recursive: true });
    fs.writeFileSync(retrospectivePath, '# 执行效率\n\n减少重复读取。\n');
    const retrospectiveDocument: any = runtime.inspectTaskRetrospectiveDocument(workspaceRoot, 'created-in-app');
    runtime.updateTask(workspaceRoot, 'created-in-app', { expectedRecordDigest: runtime.inspectTask(workspaceRoot, 'created-in-app').recordDigest, retrospectiveState: 'pending-decision', retrospectiveDocumentDigest: retrospectiveDocument.actualDigest });
    await page.goto(`${workspaceUrl}/tasks`);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '等待决定');
    assert.equal(await antdSelectDisplay(page, 'task-filter-status'), '全部');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    await page.goto(`${workspaceUrl}/tasks/created-in-app`);
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click(); await page.locator('[data-task-closeout=retrospective]').click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '减少重复读取' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-retrospective-document-state').innerText(), '等待你的决定');
    await page.locator('#task-retrospective-document-decide').click();
    await page.getByRole('button', { name: '我已完成决定', exact: true }).click();
    await page.locator('#task-retrospective-document-state').filter({ hasText: '已经决定' }).waitFor({ state: 'visible' });
    await page.goto(`${workspaceUrl}/tasks`);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '已经决定');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);

    // A real task-owned checkout has uncommitted content different from the retained project.
    runBuildr(['worktree', 'create', 'browser-task', '--branch', 'browser-task-reading', '--start-point', 'HEAD', '--include', 'project:demo', '--target', workspaceRoot]);
    const worktreeProject = path.join(workspaceRoot, '.worktrees/browser-task/projects/demo');
    fs.writeFileSync(path.join(worktreeProject, 'docs/task-reference.md'), '# 任务参考资料\n\n这是工作树的未提交说明。\n\n[继续阅读](more.md)\n');
    fs.writeFileSync(path.join(worktreeProject, 'docs/more.md'), '# 后续资料\n\n继续读取同一工作树。\n');
    fs.writeFileSync(path.join(worktreeProject, 'openspec/changes/browser-flow/brief.md'), '# 工作树的需求或说明\n\n独立文件系统中的最新需求。\n');
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true');
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '独立文件系统中的最新需求' }).waitFor({ state: 'visible' });
    const prototypeFailureRoute = /\/tasks\/browser-task\/ui-prototypes(?:\?|$)/;
    await page.route(prototypeFailureRoute, async (route: any) => {
      expectedBrowserErrors.add(route.request().url());
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'browser_prototype_fixture_failed', message: '原型读取夹具失败' } }) });
    });
    try {
      const prototypeFailure = page.waitForResponse((response: any) => new URL(response.url()).pathname.endsWith('/tasks/browser-task/ui-prototypes'));
      await closeTaskReading(page); await page.locator('[data-task-node=design]').click();
      assert.equal((await prototypeFailure).status(), 500);
      await closeTaskReading(page); await page.locator('[data-task-node=requirements]').click();
      await page.locator('#task-detail-refresh:not(.ant-btn-loading)').waitFor({ state: 'visible' });
      assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /独立文件系统中的最新需求/, '原型局部读取失败不能清空已读取的任务需求');
    } finally { await page.unroute(prototypeFailureRoute); }
    await page.locator('#task-detail-intent').getByRole('link', { name: '任务参考资料', exact: true }).click();
    const linkedDocument = page.locator('.resource-reader:visible');
    await linkedDocument.locator('.markdown-body').filter({ hasText: '这是工作树的未提交说明' }).waitFor({ state: 'visible' });
    await linkedDocument.getByRole('link', { name: '继续阅读', exact: true }).click();
    await linkedDocument.filter({ hasText: '继续读取同一工作树' }).waitFor({ state: 'visible' });
    fs.writeFileSync(path.join(worktreeProject, 'docs/more.md'), '# 后续资料\n\n工作树相关文档在阅读期间更新。\n');
    assert.equal(await page.locator('.pane-reading-mask').count(), 0, '宽屏副屏没有遮罩');
    // Linked documents use the shared object pane; reopening reads the current worktree.
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await page.locator('#task-detail-intent').getByRole('link', { name: '任务参考资料', exact: true }).click();
    await linkedDocument.getByRole('link', { name: '继续阅读', exact: true }).click();
    await linkedDocument.filter({ hasText: '工作树相关文档在阅读期间更新' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '关闭 文档', exact: true }).click();
    await page.locator('#task-node-content .markdown-body').filter({ hasText: '独立文件系统中的最新需求' }).waitFor({ state: 'visible' });
    await openTaskActionModal(page, 'task-edit-action');
    assert.match(await antdSelectDisplay(page, 'task-edit-parent'), /browser-parent/);
    await selectAntdOption(page, 'task-edit-parent', '不关联组合任务');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#task-node-content .markdown-body').innerText(), /独立文件系统中的最新需求/, '保存后保留阅读内容');
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-task').record.parentTaskId, null);
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click();
    assert.equal(await page.getByRole('button', {name:/^任务信息/}).count(), 0);
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click(); await page.locator('[data-task-content=review]').click();
    assert.match(await page.locator('#task-review-result').innerText(), /计划可执行/);
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=review]').click();
    assert.match(await page.locator('#task-review-result').innerText(), /没有阻断问题/);
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    assert.match(await page.locator('#task-verification-result').innerText(), /浏览器验证已通过[\s\S]*Buildr Web 验证投影已通过[\s\S]*当前内容版本尚未核对/);
    assert.equal(await page.getByRole('button', { name: '交给智能体验证', exact: true }).count(), 0);

    // Append a review and return to implementation without inventing a workflow gate.
    const reviewBefore = runtime.inspectTaskReview(workspaceRoot, 'browser-task');
    runtime.recordTaskReview(workspaceRoot, 'browser-task', { reviewType:'planning', subjectIdentity:'plan:browser-v2', method:'self', reviewed:['design.md'], uncovered:[], findings:['需要补充版本冲突'], conclusion:{outcome:'changes-requested',summary:'方案变更需要修订。'}, expectedCurrentDigest:reviewBefore.slots.planning.resultDigest });
    runtime.recordTaskWorkContext(workspaceRoot, 'browser-task', { expectedContextDigest:'absent', stage:'implementation', progress:'发现保存冲突，正在修复。', nextStep:'复审后再次验证。' });
    await page.locator(await page.getByRole('button',{name:'关闭内容阅读',exact:true}).isVisible().catch(()=>false) ? '#task-reading-refresh' : '#task-detail-refresh').click();
    await closeTaskReading(page); await page.locator('[data-task-node=implementation][aria-current=step]').waitFor({ state:'visible' });
    await closeTaskReading(page); await page.locator('[data-task-node=design]').click(); await page.locator('[data-task-content=review]').click();
    await page.getByRole('menuitem').filter({hasText:'第 1 次'}).waitFor({state:'visible'});
    assert.match(await page.locator('#task-review-result').innerText(), /方案变更需要修订/, '进入审查节点直接展示最新完整结果');
    await page.getByRole('menuitem').filter({hasText:'第 1 次'}).click();
    assert.match(await page.locator('#task-review-result').innerText(), /历史审查[\s\S]*计划可执行/);
    assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-current'), 'step');
    assert.equal(await page.locator('[data-task-node=design]').getAttribute('aria-pressed'), 'true');

    const oldReport = runtime.inspectTaskVerification(workspaceRoot, 'browser-task');
    runtime.recordTaskVerification(workspaceRoot, 'browser-task', { expectedReportDigest: oldReport.slot.reportDigest, contentIdentity: 'repair:v1', contentSummary: '保存冲突修复', checks: [{ id:'conflict', project:'demo', testing:'demo.browser', selection:'task-related', targets:['保存时输入保留'], source:'command', outcome:'failed', summary:'冲突后输入被清空。' }], gaps:[], conclusion:{outcome:'not-passed',summary:'保存冲突未通过，正在修复。'} });
    await page.locator(await page.getByRole('button',{name:'关闭内容阅读',exact:true}).isVisible().catch(()=>false) ? '#task-reading-refresh' : '#task-detail-refresh').click();
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-verification-result').filter({hasText:'保存冲突未通过，正在修复。'}).waitFor({state:'visible'});
    assert.match(await page.locator('#task-verification-result').innerText(), /未通过[\s\S]*冲突后输入被清空/);
    assert.equal(await page.locator('.task-verification-checks .task-check-outcome').count(),0,'单项与总结果一致不重复状态，但保留失败原因');
    assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-current'),'step');
    assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-pressed'),'true');
    const failedReport=runtime.inspectTaskVerification(workspaceRoot,'browser-task');
    runtime.recordTaskVerification(workspaceRoot,'browser-task',{expectedReportDigest:failedReport.slot.reportDigest,contentIdentity:'repair:v2',contentSummary:'输入保留修复',checks:[{id:'conflict',project:'demo',testing:'demo.browser',selection:'task-related',targets:['保存时输入保留'],source:'command',outcome:'passed',summary:'修复后输入保留。'}],gaps:[],conclusion:{outcome:'passed',summary:'本次修复验证通过。'}});
    await page.locator(await page.getByRole('button',{name:'关闭内容阅读',exact:true}).isVisible().catch(()=>false) ? '#task-reading-refresh' : '#task-detail-refresh').click();
    await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
    await page.locator('#task-verification-result').filter({hasText:'本次修复验证通过。'}).waitFor({state:'visible'});
    assert.doesNotMatch(await page.locator('#task-verification-result').innerText(), /冲突后输入被清空/,'当前验证结果替代上次失败结果');
    assert.equal(await page.locator('#task-node-content select').count(),0,'验证没有历史报告选择器');

    // Version conflict preserves the form, and re-reading never discards the draft.
    const listBeforeEdit = page.url();
    await openTaskActionModal(page, 'task-edit-action');
    await page.locator('#task-edit-title').fill('陈旧页面不得覆盖');
    runtime.updateTask(workspaceRoot, 'browser-task', { expectedRecordDigest: runtime.inspectTask(workspaceRoot,'browser-task').recordDigest, intent:'另一客户端已经更新' });
    await page.getByRole('button', { name:'保存任务记录',exact:true }).click();
    await page.locator('#task-edit-reread').waitFor({ state:'visible' });
    assert.equal(await page.locator('#task-edit-title').inputValue(),'陈旧页面不得覆盖');
    await page.locator('#task-edit-reread').click();
    await page.locator('#task-edit-state').filter({hasText:'已重读'}).waitFor({state:'visible'});
    assert.equal(await page.locator('#task-edit-intent').inputValue(),'另一客户端已经更新','重读时采用未编辑字段的最新值，保留已编辑草稿');
    assert.equal(await page.locator('#task-edit-title').inputValue(),'陈旧页面不得覆盖');
    await page.locator('#task-edit-intent').fill('页面基于最新记录更新');
    await page.getByRole('button', {name:'保存任务记录',exact:true}).click();
    await page.locator('#task-edit-form').waitFor({state:'hidden'});
    assert.match(await page.locator('#task-detail-intent').innerText(),/页面基于最新记录更新/);
    await page.locator('.pane-left #task-table-body [data-task-id="browser-task"] .task-row-main').filter({hasText:'陈旧页面不得覆盖'}).waitFor({state:'visible'});
    assert.equal(page.url(), listBeforeEdit, '详情写成功刷新列表内容但不改变筛选 URL');
    for (let i=browserErrors.length-1;i>=0;i--) if (/tasks\/browser-task.*409/.test(browserErrors[i])) browserErrors.splice(i,1);

    for (const id of ['browser-stale','browser-delivered']) {
      await page.goto(`${workspaceUrl}/tasks/${id}`);
      assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-pressed'), 'true', '终态任务打开时也先展示需求');
      await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
      assert.match(await page.locator('#task-verification-result').innerText(),/当前内容版本尚未核对/);
      assert.doesNotMatch(await page.locator('#task-verification-result').innerText(),/已随交付目标/);
    }
    runtime.recordTaskWorkContext(workspaceRoot, 'browser-abandon', { expectedContextDigest: 'absent', stage: 'acceptance', progress: '检查已完成，等待确认。', nextStep: '读取用户意见后决定收尾。', attention: { kind: 'acceptance', reason: '请确认当前交付内容符合本次目标。' } });
    await page.goto(`${workspaceUrl}/tasks/browser-abandon`);
    await closeTaskReading(page); await page.locator('[data-task-node=closeout]').click();
    assert.match(await page.locator('#task-node-content').innerText(), /请确认当前交付内容符合本次目标/,'用户确认节点直接展示已有待确认内容');
    await page.locator('#task-closeout-respond').click();
    await page.locator('#task-attention-response-input').fill('仍需调整交付范围。');
    await page.locator('#task-context-save').click();
    await page.locator('#task-node-content #task-attention-response').filter({hasText:'仍需调整交付范围'}).waitFor({state:'visible'});
    assert.equal(runtime.inspectTask(workspaceRoot, 'browser-abandon').record.status, 'active', '记录用户意见不自动完成任务');
    await openTaskActionModal(page,'task-abandon-action');
    await page.locator('#task-abandon-reason').fill('浏览器验收取消');
    await page.locator('#task-abandon-form').getByRole('button',{name:'确认放弃',exact:true}).click();
    await page.locator('.ant-modal-confirm').waitFor({state:'visible'}); await confirmAntModal(page);
    await page.locator('#task-detail-status').filter({hasText:'已放弃'}).waitFor({state:'visible'});
    for (const width of [1024,390]) {
      await page.setViewportSize({width,height:844});
      await page.goto(`${workspaceUrl}/tasks/browser-task`);
      await closeTaskReading(page); await page.locator('[data-task-node=requirements][aria-pressed=true]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-task-node=implementation]').getAttribute('aria-current'),'step','当前推进节点不替代默认需求阅读');
      await closeTaskReading(page); await page.locator('[data-task-node=implementation]').click(); await page.locator('[data-task-content=verification]').click();
      await page.locator('#task-verification-result').waitFor({state:'visible'});
      assert.equal(await page.locator('.pane-stage:visible').count(),1);
      assert.equal(await page.locator('.pane-right:visible').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await capture(page,`local-app-task-detail-${width}.png`);
      if(width===390) { await openTaskActionModal(page, 'task-edit-action'); await page.locator('#task-edit-title').fill('取消不写入'); await page.locator('#task-edit-title').press('Escape'); assert.notEqual(runtime.inspectTask(workspaceRoot,'browser-task').record.title,'取消不写入'); await page.getByRole('button',{name:'关闭阅读',exact:true}).click(); await page.locator('#task-table-body').waitFor({state:'visible'}); assert.equal(await page.locator('#task-detail-main').count(),0); }
    }
    await page.setViewportSize({width:1280,height:720});
  });

  if (selected('workbench')) await runWorkbenchJourney({ t, page, runtime, workspaceRoot, otherWorkspaceRoot: otherRoot, workspaceUrl, otherWorkspaceUrl: `${url}/workspaces/${otherWorkspaceId}`, expectedBrowserErrors, selectAntdOption, capture });

  if (selected('project')) await runWorkspaceCompositionJourney({ t, page, runtime, workspaceRoot, workspaceUrl, expectedBrowserErrors });

  const unexpectedBrowserErrors: any = browserErrors.filter((error: any) => ![...expectedBrowserErrors].some((expected: any) => error.includes(expected)));
  assert.deepEqual(unexpectedBrowserErrors, [], unexpectedBrowserErrors.join('\n'));
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=assertions-complete errors=${unexpectedBrowserErrors.length}\n`);
});
