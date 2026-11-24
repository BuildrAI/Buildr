import { runTaskListJourney } from '../../../buildr-web/test/browser/task-list-journey.ts';
import { AGENT_SERVICE_APPLICATION } from '../../src/modules/agent-service/module.ts';
import { stopAgentProcess } from '@buildr-ai/buildr-harness';
import { TASK_MATERIALS_APPLICATION } from '../../src/modules/task/materials/module.ts';
import { showPrimaryNavigation } from '../../../buildr-web/test/browser/primary-navigation-controls.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { launchTestBrowser } from './browser-launch.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { createRuntime as createProductionRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { recordVerificationResultFromEvidence } from '../helpers/task-verification-result-fixture.ts';
import { planCodeBrowserGroups } from '../verification/browser-selector-dispatcher.ts';
import { runCodeExplorerJourney } from '../../../buildr-web/test/browser/code-explorer-journey.ts';
import { runSourceControlJourney } from '../../../buildr-web/test/browser/source-control-journey.ts';
import { runTaskMaterialsJourney } from '../../../buildr-web/test/browser/task-materials-journey.ts';
import { runWorkbenchJourney } from './workbench-journey.ts';
import { runPublicationJourney, publicationTestPng } from './publication-journey.ts';
import { useLegacyAssetCatalog } from '../helpers/legacy-asset-catalog.ts';
import { acquirePreparedAgentRuntime } from '../helpers/prepared-agent-runtime.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const SELECTOR_INPUT: any = process.argv[2] ?? 'all';
const SCREENSHOT_DIR: any = process.env.BUILDR_SCREENSHOT_DIR;
const BROWSER_WEB_DIST_ROOT: any = process.env.BUILDR_BROWSER_WEB_DIST_ROOT;
if (!BROWSER_WEB_DIST_ROOT) throw new Error('Browser E2E requires BUILDR_BROWSER_WEB_DIST_ROOT from the Browser dispatcher staging build.');
const KNOWN_SELECTORS: any = new Set(['all', 'core', 'shell', 'workbench', 'task', 'task-materials', 'project', 'service', 'change', 'articles', 'code']);
const SELECTORS: any = new Set(SELECTOR_INPUT.split(',').map((item: any) => item.trim()).filter(Boolean));

for (const selector of SELECTORS) if (!KNOWN_SELECTORS.has(selector)) throw new Error(`Unknown browser integration selector: ${selector}`);
if (SELECTORS.size === 0) throw new Error('Browser integration selector cannot be empty.');
const selected: any = (name: any) => SELECTORS.has('all') || SELECTORS.has(name);
const codeFocusProvided = Boolean(process.env.BUILDR_CODE_EXPLORER_FOCUS || process.env.BUILDR_SOURCE_CONTROL_FOCUS);
const codeGroup = selected('code') && codeFocusProvided ? planCodeBrowserGroups(process.env, process.env.BUILDR_CODE_EXPLORER_FOCUS ? 'code-explorer' : 'code')[0] : null;
const runCodeExplorer = !codeGroup || codeGroup.id === 'explorer';
const runSourceControl = !codeGroup || codeGroup.id === 'source-control';
const selectorLabel: any = [...SELECTORS].join(',') + (SELECTORS.has('code') && codeGroup ? ':' + codeGroup.id : '');
// Optional scenario-name filter for long task/layout journeys; same pipe-separated
// semantics as BUILDR_SOURCE_CONTROL_FOCUS. Empty runs everything.
const taskFocus: any = process.env.BUILDR_TASK_FOCUS || '';
const taskFocused = (name: string) => !taskFocus || taskFocus === 'all' || taskFocus.split('|').some((part: string) => part && name.includes(part));
const taskFocusedT = (t: any) => Object.assign(Object.create(t), {
  test: async (name: string, action: any) => { if (taskFocused(name)) return t.test(name, action); },
});

function runBuildr(args: any, buildr: any = BUILDR): any  {
  const result: any = spawnSync(process.execPath, [buildr, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return args.includes('--json') ? JSON.parse(result.stdout) : result.stdout;
}

function runGit(root: any, args: any): any  {
  const result: any = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function writeChange(projectRoot: any, relative: any, title: any): any  {
  const changeRoot: any = path.join(projectRoot, 'openspec', 'changes', relative);
  fs.mkdirSync(path.join(changeRoot, 'specs', 'demo-capability'), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
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

// Data setup is a precondition here; actual CLI journeys keep runBuildr.
// The test adapter delegates to the same production applications, under this
// process's private App/Product Data Root. No service or writable root is shared.
let preparedFixtureRuntime: any;
const fixtureRuntime = () => preparedFixtureRuntime ??= createRuntime();
function initializeBrowserFixture(root: string, name: string, description: string) {
  return fixtureRuntime().initializeWorkspace({ targetRoot: root, name, description, profile: 'team', agent: null });
}

function createCoreFixture(root: any): any  {
  initializeBrowserFixture(root, 'browser-e2e-core', '核心 Browser E2E fixture');
  fixtureRuntime().createTask(root, { taskId: 'core-task', title: '核心浏览器任务', intent: '验证核心 Browser E2E 路由与只读 Tab' });
}

function createServiceFixture(root: any): any  {
  initializeBrowserFixture(root, 'browser-e2e-service', '服务目录 Browser E2E fixture');
  useLegacyAssetCatalog(root);
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'demo', name: '演示项目', description: '浏览器测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  fixtureRuntime().createServiceAsset({ targetRoot: root, project: 'demo', service: 'api', repoRef: source, attachRef: null, name: '演示服务', description: '浏览器测试服务', type: 'backend', rulesSource: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
}

function createProjectFixture(root: any): any  {
  initializeBrowserFixture(root, 'browser-e2e-project', '项目目录 Browser E2E fixture');
  useLegacyAssetCatalog(root);
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'demo', name: '演示项目', description: '浏览器测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  fixtureRuntime().createServiceAsset({ targetRoot: root, project: 'demo', service: 'api', repoRef: source, attachRef: null, name: '演示服务', description: '浏览器测试服务', type: 'backend', rulesSource: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
}

function createArticlesFixture(root: any): any  {
  initializeBrowserFixture(root, 'browser-e2e-articles', '文章入口 Browser E2E fixture');
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'product', name: 'Buildr Product', description: '对外文章测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: browser-article\ntitle: 浏览器测试文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-05\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 浏览器测试文章\n\n![测试配图](assets/cover.png)\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), publicationTestPng);
}

function createShellFixture(root: any): any  {
  initializeBrowserFixture(root, 'browser-e2e', 'Shell Browser E2E fixture');
  useLegacyAssetCatalog(root);
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'demo', name: '演示项目', description: '浏览器测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'other', name: '另一项目', description: '用于验证 Workspace 摘要不锁定项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  fixtureRuntime().createServiceAsset({ targetRoot: root, project: 'demo', service: 'api', repoRef: source, attachRef: null, name: '演示服务', description: '浏览器测试服务', type: 'backend', rulesSource: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'AGENTS.md'), '# AGENTS.md\n\n演示项目规则。\n', 'utf8');
  writeChange(path.join(root, 'projects', 'demo'), 'browser-flow', '浏览器流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser shell fixture baseline']);
  fixtureRuntime().createTask(root, { taskId: 'browser-task', title: '浏览器任务', intent: '验证 Shell Browser E2E 路由', projects: ['demo'], services: ['demo/api'], changes: ['demo/browser-flow'] });
}


function createChangeFixture(root: any): any  {
  initializeBrowserFixture(root, 'browser-e2e-change', 'Change 详情 Browser E2E fixture');
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'demo', name: '演示项目', description: '浏览器测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const projectRoot: any = path.join(root, 'projects', 'demo');
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser change fixture baseline']);
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Change 详情页面', '--project', 'demo', '--change', 'demo/browser-flow', '--target', root]);
}

function createFixture(root: any, options: any = {}): any  {
  initializeBrowserFixture(root, 'browser-e2e', '隔离的浏览器 E2E fixture');
  useLegacyAssetCatalog(root);
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'demo', name: '演示项目', description: '浏览器测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'other', name: '另一项目', description: '用于验证 Workspace 摘要不锁定项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  if (options.articles) {
    fixtureRuntime().createProjectAsset({ targetRoot: root, project: 'product', name: 'Buildr Product', description: '对外文章测试项目', repoRef: null, attachRef: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
    const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
    fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: browser-article\ntitle: 浏览器测试文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-05\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 浏览器测试文章\n\n![测试配图](assets/cover.png)\n');
    fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), publicationTestPng);
  }
  const source: any = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  fixtureRuntime().createServiceAsset({ targetRoot: root, project: 'demo', service: 'api', repoRef: source, attachRef: null, name: '演示服务', description: '浏览器测试服务', type: 'backend', rulesSource: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
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
    testRoots: [test/browser-e2e/**]
    full: { kind: command, argv: [node, -e, "void 0"], cwd: . }
    requirements: [node]
`);
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  if (!options.materialsOnly) writeUiPrototypeFixtures(projectRoot, 'browser-flow');
  writeChange(projectRoot, 'archive/2026-07-22-archived-flow', '已归档流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser fixture baseline']);
  if (options.materialsOnly) return;
  const taskRuntime = createRuntime();
  const recordBriefFile = path.join(root, '.buildr/local/browser-record-brief.md');
  fs.mkdirSync(path.dirname(recordBriefFile), { recursive: true });
  fs.writeFileSync(recordBriefFile, '# 浏览器任务说明\n\n验证 Task Record 页面，说明保存在任务记录中。\n\n验证 Buildr Web 轻量查询客户端。\n');
  if (options.applicationTasks) taskRuntime.createTask(root, { taskId: 'browser-parent', title: '浏览器协调任务', intent: '验证 Parent Task 页面', brief: fs.readFileSync(recordBriefFile, 'utf8'), projects: ['demo'], services: ['demo/api'] }); else runBuildr(['task', 'create', 'browser-parent', '--title', '浏览器协调任务', '--intent', '验证 Parent Task 页面', '--brief-file', recordBriefFile, '--project', 'demo', '--service', 'demo/api', '--target', root]);
  if (options.applicationTasks) taskRuntime.createTask(root, { taskId: 'browser-task', title: '浏览器任务', intent: '验证 Task Record 页面，参考 [任务参考资料](projects/demo/docs/task-reference.md)。', brief: fs.readFileSync(recordBriefFile, 'utf8'), parentTaskId: 'browser-parent', projects: ['demo'], services: ['demo/api'], changes: ['demo/browser-flow'] }); else runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Task Record 页面，参考 [任务参考资料](projects/demo/docs/task-reference.md)。', '--brief-file', recordBriefFile, '--parent', 'browser-parent', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  if (options.applicationTasks) taskRuntime.createTask(root, { taskId: 'created-in-app', title: '页面查看任务', intent: '验证 Buildr Web 轻量查询客户端', brief: fs.readFileSync(recordBriefFile, 'utf8'), parentTaskId: 'browser-parent', projects: ['demo'], services: ['demo/api'], changes: ['demo/browser-flow'] }); else runBuildr(['task', 'create', 'created-in-app', '--title', '页面查看任务', '--intent', '验证 Buildr Web 轻量查询客户端', '--brief-file', recordBriefFile, '--parent', 'browser-parent', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  for (const [taskId, title, parentTaskId] of [
    ['browser-delivered', '已交付浏览器任务', null],
    ['browser-stale', '目标已变化浏览器任务', null],
    ['browser-contribution-delivered', '贡献交付子任务', 'browser-parent'],
    ['browser-unproven', '交付未经证明子任务', 'browser-parent'],
  ]) {
    if (options.applicationTasks) taskRuntime.createTask(root, { taskId, title, intent: '验证 terminal delivery 与 live applicability 分离', ...(parentTaskId ? { parentTaskId } : {}), projects: ['demo'], services: ['demo/api'], changes: ['demo/browser-flow'] }); else runBuildr(['task', 'create', taskId, '--title', title, '--intent', '验证 terminal delivery 与 live applicability 分离', ...(parentTaskId ? ['--parent', parentTaskId] : []), '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
    if (options.applicationTasks) taskRuntime.recordTaskReview(root, taskId, { reviewType: 'planning', subjectIdentity: 'plan:browser-v1', method: 'self', reviewed: ['task intent', 'change:demo/browser-flow'], uncovered: [], findings: [], conclusion: { outcome: 'accepted', summary: '计划可执行' }, expectedCurrentDigest: 'absent' }); else runBuildr(['task', 'review', 'record', taskId, '--type', 'planning', '--subject-identity', 'plan:browser-v1', '--method', 'self', '--reviewed', 'task intent', '--reviewed', 'change:demo/browser-flow', '--outcome', 'accepted', '--summary', '计划可执行', '--expected-current', 'absent', '--target', root]);
  }
  if (options.applicationTasks) taskRuntime.recordTaskReview(root, 'browser-task', { reviewType: 'planning', subjectIdentity: 'plan:browser-v1', method: 'self', reviewed: ['task intent', 'change:demo/browser-flow'], uncovered: [], findings: [], conclusion: { outcome: 'accepted', summary: '计划可执行' }, expectedCurrentDigest: 'absent' }); else runBuildr(['task', 'review', 'record', 'browser-task', '--type', 'planning', '--subject-identity', 'plan:browser-v1', '--method', 'self', '--reviewed', 'task intent', '--reviewed', 'change:demo/browser-flow', '--outcome', 'accepted', '--summary', '计划可执行', '--expected-current', 'absent', '--target', root]);
  if (options.applicationTasks) taskRuntime.createTask(root, { taskId: 'browser-abandon', title: '待放弃任务', intent: '验证明确放弃' }); else runBuildr(['task', 'create', 'browser-abandon', '--title', '待放弃任务', '--intent', '验证明确放弃', '--target', root]);
}

function createSelectedFixture(root: any): any  {
  if (SELECTORS.size === 2 && SELECTORS.has('shell') && SELECTORS.has('core')) {
    createShellFixture(root);
    return 'shell+core';
  }
  // The reading bundle only needs the shared shell fixture: two registered
  // projects, one service, one Change and the associated Task. The full
  // fixture's record/material variants belong to the task owners.
  if (SELECTORS.size >= 2 && [...SELECTORS].every(selector => ['core', 'shell', 'workbench', 'change'].includes(selector))) {
    createShellFixture(root);
    return 'reading';
  }
  // Task and Task materials share one real fixture: both create their own
  // records through the production applications and read them through the
  // same hosted Workspace.
  if (SELECTORS.size >= 2 && [...SELECTORS].every(selector => ['task', 'task-materials'].includes(selector))) {
    createFixture(root, { applicationTasks: true });
    return 'task-records';
  }
  if (SELECTORS.size !== 1) {
    createFixture(root, { articles: selected('articles') });
    return 'full';
  }
  const selector: any = [...SELECTORS][0];
  if (selector === 'core') createCoreFixture(root);
  else if (selector === 'shell') createShellFixture(root);
  else if (selector === 'workbench') {
    createShellFixture(root);
  }
  else if (selector === 'code') {
    createShellFixture(root);
    const source = path.join(root, 'projects/demo/services/api');
    fs.mkdirSync(path.join(source, 'src'), { recursive: true });
    fs.writeFileSync(path.join(source, 'src/main.ts'), 'export const explorerAnswer = 1;\n' + '// readable source line\n'.repeat(120));
    fs.writeFileSync(path.join(source, 'README.md'), '# Explorer document\n\n![Image](image.png)\n\nA paragraph for reading.\n\n[Source](src/main.ts)\n');
    fs.writeFileSync(path.join(source, 'image.png'), publicationTestPng);
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-qm', 'code fixture\n\nBuildr-Task: browser-task']);
    fs.writeFileSync(path.join(source, 'src/main.ts'), 'export const explorerAnswer = 2;\nexport function registerApplicationDoctor() {}\n' + '// readable source line\n'.repeat(120));
  }
  else if (selector === 'project') createProjectFixture(root);
  else if (selector === 'service') createServiceFixture(root);
  else if (selector === 'change') createChangeFixture(root);
  else if (selector === 'articles') createArticlesFixture(root);
  else if (selector === 'task-materials') createFixture(root, { materialsOnly: true });
  else createFixture(root, { articles: selected('articles'), applicationTasks: selector === 'task' });
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

async function capture(page: any, name: any, options: any = {}): Promise<any>  {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: options.fullPage !== false, animations: 'disabled' });
}

// Dispatcher splits code into independent Explorer/SCM parents (240/900 seconds)
// and reserves 15 seconds outside each parent for its isolated cleanup.
test(`Buildr Web 浏览器端到端测试（E2E）：${selectorLabel}`, { timeout: SELECTORS.has('code') && codeGroup ? codeGroup.nodeTimeoutMs : SELECTORS.has('code') || SELECTORS.has('task') ? 240_000 : SELECTORS.has('all') ? 300_000 : SELECTORS.size > 1 ? 300_000 : SELECTORS.has('task-materials') || SELECTORS.has('service') ? 180_000 : SELECTORS.has('workbench') || SELECTORS.has('articles') || SELECTORS.has('shell') || SELECTORS.has('project') ? 120_000 : 60_000 }, async (t: any) => {
  const costEnabled = process.env.BUILDR_BROWSER_COST_PROFILE === '1';
  const costClock = () => costEnabled ? performance.now() : 0;
  const costStarted = costClock();
  let costStage = 'local-setup', costStageStarted = costStarted;
  const costStages: Array<{ phase: string; durationMs: number }> = [];
  const costScenarios: Array<{ name: string; durationMs: number }> = [];
  let costResetMs = 0;
  const costBegin = (phase: string) => {
    if (!costEnabled) return;
    const now = costClock();
    costStages.push({ phase: costStage, durationMs: now - costStageStarted });
    costStage = phase; costStageStarted = now;
  };
  const requestedSmokeRoot: any = process.env.BUILDR_SMOKE_ROOT;
  const managedSmokeRoot: any = requestedSmokeRoot && fs.existsSync(path.join(requestedSmokeRoot, '.buildr-smoke-owner')) ? requestedSmokeRoot : null;
  const base: any = managedSmokeRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-e2e-'));
  const workspaceRoot: any = process.env.BUILDR_SMOKE_WORKSPACE_ROOT || path.join(base, 'workspace');
  const previousAppData: any = process.env.BUILDR_APP_DATA_DIR;
  const previousProductData: any = process.env.BUILDR_PRODUCT_DATA_DIR;
  let browser: any;
  let server: any;
  let serverInstance: any;
  let previewServer: any;
  let previewServerInstance: any;
  let webRuntime: any;
  t.after(async () => {
    costBegin('cleanup');
    let cleanupComplete = false;
    try {
      process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-browser\n`);
      if (browser) await browser.close();
      process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-servers\n`);
      if (serverInstance) await serverInstance.shutdown();
      else if (server) await new Promise((resolve: any) => server.close(resolve));
      if (previewServerInstance) await previewServerInstance.shutdown();
      else if (previewServer) await new Promise((resolve: any) => previewServer.close(resolve));
      process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-agent-close\n`);
      if (webRuntime) await runtimeProvide(webRuntime, AGENT_SERVICE_APPLICATION).close();
      process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-agent-stop\n`);
      // The direct HTTP fixture owns its callback bridge and isolated execution
      // daemon; closing server sockets alone cannot release those resources.
      await stopAgentProcess({dataRoot:path.join(base,'app-data'),mode:'stop-owned'});
      if (!managedSmokeRoot) {
        process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-rm\n`);
        fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
      cleanupComplete = true;
      process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-complete\n`);
    } catch (error: any) {
      const appDataRoot = path.join(base, 'app-data');
      const stopDiagnostics: Record<string, unknown> = {};
      if (fs.existsSync(appDataRoot)) {
        for (const rel of fs.readdirSync(appDataRoot, { recursive: true, encoding: 'utf8' })) {
          if (rel.endsWith('last-stop.json') || rel.endsWith('instance.json') || rel.endsWith('instances.json')) {
            try { stopDiagnostics[rel] = fs.readFileSync(path.join(appDataRoot, rel), 'utf8'); } catch {}
          }
        }
      }
      process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-error message=${error?.stack || error?.message || String(error)} diagnostics=${JSON.stringify(stopDiagnostics)}\n`);
      throw error;
    } finally {
      if (costEnabled) {
        costBegin('finished');
        process.stderr.write('[browser-cost] '+JSON.stringify({
          selector: selectorLabel, scope: 'fixture-callback-through-cleanup',
          totalMs: costStageStarted - costStarted, stages: costStages,
          scenarios: { count: costScenarios.length, bodyMs: costScenarios.reduce((sum, item) => sum + item.durationMs, 0), resetMs: costResetMs,
            slowest: [...costScenarios].sort((a, b) => b.durationMs - a.durationMs).slice(0, 3) },
          cleanup: cleanupComplete ? 'complete' : 'failed',
        })+'\n');
      }
    }
  });

  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    if (previousProductData === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR;
    else process.env.BUILDR_PRODUCT_DATA_DIR = previousProductData;
  });

  costBegin('primary-fixture');
  const fixtureProfile: any = createSelectedFixture(workspaceRoot);
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=fixture-ready\n`);
  costBegin('secondary-workspace');
  // Only selectors whose real journey compares two Workspaces need the
  // secondary fixture. Others keep the same single-Workspace assertions.
  const needsOtherWorkspace: any = SELECTORS.has('all')
    || ['shell', 'workbench', 'project', 'articles', 'task'].some(selector => SELECTORS.has(selector));
  const otherRoot: any = needsOtherWorkspace ? path.join(base, 'other-workspace') : null;
  if (otherRoot) {
    initializeBrowserFixture(otherRoot, 'other-workspace', '第二个浏览器工作空间');
  }
  costBegin('application-and-servers');
  const runtime: any = createRuntime();
  if (SELECTORS.has('code')) {
    const catalog = runtime.assetCatalog(workspaceRoot);
    if (catalog.migrationRequired) runtime.migrateAssetCatalog(workspaceRoot, { revision: catalog.revision });
  }
  let registry: any = runtime.listRegisteredWorkspaces();
  if (otherRoot) registry = runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: registry.revision });
  const otherWorkspaceId: any = otherRoot ? registry.workspaces.find((item: any) => item.rootPath === otherRoot).workspace.id : null;
  // Fixture writers may use the test adapter; the HTTP host must use production composition.
  const preparedAgentRuntime = acquirePreparedAgentRuntime(process.env.BUILDR_APP_DATA_DIR);
  webRuntime = createProductionRuntime(preparedAgentRuntime ? { agentRuntime: preparedAgentRuntime } : {});
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
  serverInstance = instance;
  server = instance.server;
  const { url, initialWorkspaceId }: any = await instance.ready;
  const previewInstance: any = createLocalWorkspaceServer(webRuntime, {
    ...workspacePorts,
    targetRoot: workspaceRoot,
    staticRoot: BROWSER_WEB_DIST_ROOT,
    previewIdentity: {
      schemaVersion: 'buildr.local-app-preview/v1', instance: 'browser-preview', worktree: workspaceRoot,
      repository: workspaceRoot, branch: 'preview-branch', head: '0123456789abcdef', dirty: true,
      workspaceMode: 'shared', environmentRoot: workspaceRoot,
      frontendSource: `${workspaceRoot}/projects/product/services/buildr/web-dist`,
      agent: { digest: 'a'.repeat(64), generation: 'gen-browser', accepting: true },
      reuse: { source: 'development', facets: ['model-catalog', 'agent-runtime'] },
    },
  });
  previewServerInstance = previewInstance;
  previewServer = previewInstance.server;
  const { url: previewUrl }: any = await previewInstance.ready;
  const workspaceUrl: any = `${url}/workspaces/${initialWorkspaceId}`;
  costBegin('agent-ready');
  await runtimeProvide(webRuntime, AGENT_SERVICE_APPLICATION).start();
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=agent-ready\n`);
  costBegin('browser-ready');
  browser = await launchTestBrowser();
  const browserErrors: any[] = [];
  const expectedBrowserErrors: any = new Set();
  const newBrowserPage = async () => {
    // Each group owns a fresh context, permitting multi-tab journeys while
    // keeping storage and route fixtures isolated from previous groups.
    const context = await browser.newContext({ locale: 'zh-CN' });
    const nextPage = await context.newPage();
    nextPage.on('pageerror', (error: any) => browserErrors.push(`pageerror ${nextPage.url()}: ${error.message}`));
    nextPage.on('console', (message: any) => {
      if (message.type() === 'error') browserErrors.push(`console.error ${nextPage.url()} [${message.location().url}]: ${message.text()}`);
      if (message.type() === 'warning' && message.text().startsWith('文件语言加载失败')) process.stderr.write('[browser-language-load] '+message.text()+'\n');
    });
    // Bundled selectors run in one host while other heavy verification groups
    // share the machine; observed event-loop lag can exceed 8s. Focused
    // single-selector diagnosis keeps the tighter budget.
    nextPage.setDefaultTimeout(SELECTORS.size > 1 ? 20_000 : 10_000);
    nextPage.on('requestfinished',(request:any)=>{
      const timing=request.timing();
      if(timing.responseEnd>1000)process.stderr.write('[browser-request-timing] '+JSON.stringify({path:new URL(request.url()).pathname,responseMs:timing.responseEnd,requestStart:timing.requestStart,responseStart:timing.responseStart,connectStart:timing.connectStart,connectEnd:timing.connectEnd})+'\n');
    });
    nextPage.on('response',async(response:any)=>{
      const pathname=new URL(response.url()).pathname;
      if(response.status()>=400&&pathname.endsWith('/code/branches')){
        const failure=await response.json().catch(()=>null);
        process.stderr.write('[browser-branch-read-failure] '+JSON.stringify({path:pathname,status:response.status(),code:failure?.error?.code})+'\n');
      }
    });

    return nextPage;
  };
  let page: any = await newBrowserPage();
  let lastTick=performance.now(),maximumLag=0;
  const lagTimer=setInterval(()=>{const now=performance.now();maximumLag=Math.max(maximumLag,now-lastTick-100);lastTick=now;},100);
  lagTimer.unref();
  t.after(()=>{clearInterval(lagTimer);process.stderr.write('[browser-host-lag] '+JSON.stringify({maximumLag})+'\n');});

  const observedNavigations: Array<{path:string;status:number}> = [];
  const observedWrites: Array<{path:string;method:string;status?:number}> = [];
  const writes=new WeakMap<object,{path:string;method:string;status?:number}>();
  page.on('request',(request:any)=>{if(!['GET','HEAD','OPTIONS'].includes(request.method())){const item={path:new URL(request.url()).pathname,method:request.method()};observedWrites.push(item);writes.set(request,item);if(observedWrites.length>30)observedWrites.shift();}});
  page.on('response',(response:any)=>{const item=writes.get(response.request());if(item)item.status=response.status();});

  page.on('response',(response:any)=>{
    if(response.request().isNavigationRequest()&&response.frame()===page.mainFrame()){
      observedNavigations.push({path:new URL(response.url()).pathname,status:response.status()});
      if(observedNavigations.length>20)observedNavigations.shift();
    }
  });
  const runTest=t.test.bind(t);
  t.test=(...args:any[])=>{
    if (SELECTORS.size === 1 && SELECTORS.has('service') && !taskFocused(args[0])) return Promise.resolve();
    const action=args.at(-1);
    if(typeof action==='function')args[args.length-1]=async(context:any)=>{
      const scenarioName = String(args[0]);
      const started = costClock();
      process.stderr.write(`[buildr-browser-scenario] selector=${selectorLabel} status=started name=${JSON.stringify(scenarioName)}\n`);
      let scenarioStatus = 'passed';
      try{return await action(context);}catch(error){
        scenarioStatus = 'failed';
        const state=await page.evaluate(()=>({path:location.pathname,title:document.title,session:Boolean(document.querySelector('meta[name="buildr-session"]')),nodes:[...document.querySelectorAll('[data-task-node]')].map(n=>({value:n.getAttribute('data-task-node'),visible:Boolean(n.getClientRects().length)})),ids:[...document.querySelectorAll('[id]')].slice(0,100).map(n=>n.id),text:document.body.innerText.slice(0,5000)})).catch(()=>({closed:true}));
        process.stderr.write('[browser-failure-state] '+JSON.stringify({scenario:args[0],navigations:observedNavigations,writes:observedWrites,state})+'\n');
        throw error;
      } finally {
        const durationMs = Math.round(costClock() - started);
        process.stderr.write(`[buildr-browser-scenario] selector=${selectorLabel} status=${scenarioStatus} durationMs=${durationMs} name=${JSON.stringify(scenarioName)}\n`);
        if (costEnabled) costScenarios.push({ name: scenarioName, durationMs });
      }
    };
    return runTest(...args);
  };

  costBegin('scenarios-and-resets');
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=browser-ready\n`);
  t.beforeEach(() => { browserErrors.length = 0; expectedBrowserErrors.clear(); });
  t.afterEach(async () => {
    const resetStarted = costClock();
    try {
      try {
        const unexpected = browserErrors.filter(error => ![...expectedBrowserErrors].some((expected: any) => error.includes(expected)));
        assert.deepEqual(unexpected, [], unexpected.join('\n'));
      } finally {
        // Always discard failed dialogs, injected routes, listeners, viewport and saved UI state.
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        page.removeAllListeners('request');
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
        await page.goto('about:blank');
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    } finally { if (costEnabled) costResetMs += costClock() - resetStarted; }
  });

  if (selected('code')) {
    const history = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' });
    assert.equal(history.status, 0, history.stderr);
    if (runCodeExplorer) {
      await runCodeExplorerJourney({ t, page, workspaceUrl, capture, expectedBrowserErrors, codeFixture: { commitHash: history.stdout.trim() } });
    }
    if (runSourceControl) {
      const sourceControlPath = 'projects/demo/services/api/src/main.ts';
      const workingText = 'export const sourceControlWorking = 34;\n';
      fs.writeFileSync(path.join(workspaceRoot, sourceControlPath), workingText);
      await runSourceControlJourney({
        t, page, workspaceUrl, capture, expectedBrowserErrors,
        fixture: { path: sourceControlPath, location: fs.realpathSync(workspaceRoot), commitHash: history.stdout.trim(), workingText },
      });
    }
  }

  if (SELECTORS.has('core')) await t.test('核心流程进入 Workspace、Task 路由并读取代表性 Tab', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#development-environment-badge').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#development-environment-badge').innerText()).trim(), '开发版');
    assert.equal(await page.title(), `${fixtureProfile === 'core' ? 'browser-e2e-core' : 'browser-e2e'} · Buildr Development Dev`);
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

  if (selected('shell')) await t.test('全局首页展示多个工作空间并进入选定上下文', async () => {
    await page.goto(`${url}/?catalog=1`);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.title(), 'Buildr Development Dev');
    assert.equal(await page.locator('#preview-identity').isHidden(), true);
    await page.goto(`${previewUrl}/?catalog=1`);
    await page.locator('#preview-identity').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#preview-identity').isHidden(), false, '托管预览展示组件级来源身份条');
    await page.locator('#more-actions').hover();
    await page.locator('#quit-buildr').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#restart-buildr').locator('xpath=ancestor::*[@role="menuitem"]').getAttribute('aria-disabled'), 'true', '托管预览在统一菜单中禁用重启');
    // Navigation preserves the pointer position; leave the trigger so the
    // next page cannot reopen its hover menu before the closed-state check.
    await page.mouse.move(0, 0);
    await page.goto(`${url}/?catalog=1`);
    assert.equal(await page.locator('#more-actions').isVisible(), true, '默认实例通过更多操作菜单提供重启和退出');
    assert.equal(await page.locator('#quit-buildr').count(), 0, '退出入口收进下拉菜单，未展开时不存在');
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-grid .workspace-card').count(), 2);
    const target: any = page.locator('#workspace-grid .workspace-card').filter({ has: page.locator('h2').filter({ hasText: /^browser-e2e$/ }) });
    await unique(target, 'browser-e2e 工作空间卡片');
    await target.getByRole('link', { name: '进入工作空间' }).click();
    await page.waitForURL(`${workspaceUrl}/overview`);
    await page.locator('#workbench-overview').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#shell-workspace-name').innerText()).trim(), 'browser-e2e');
    assert.equal(await page.title(), 'browser-e2e · Buildr Development Dev');
    await showPrimaryNavigation(page, 'workbench');
    assert.equal(await page.getByLabel('工作台二级导航',{exact:true}).locator('[data-nav="overview"]').evaluate((item: any) => item.classList.contains('active')), true);
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
    await page.goto(`${url}/?catalog=1`);
    await page.locator('#workspace-grid .workspace-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspace-grid').evaluate((grid: any) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 720 });
    let current: any = runtime.listRegisteredWorkspaces();
    // A background request can update lastOpenedRoot after the cards were read.
    // Removal must obtain a fresh snapshot before presenting confirmation.
    const firstRoot = current.workspaces[0].rootPath;
    const touchRoot = current.workspaces.find((entry: any) => entry.rootPath !== firstRoot).rootPath;
    current = runtime.registerLocalWorkspace({ rootPath: firstRoot, revision: current.revision, open: true });
    current = runtime.registerLocalWorkspace({ rootPath: touchRoot, revision: current.revision, open: true });
    await page.locator('#workspace-grid .workspace-card').first().getByRole('button', { name: '移除', exact: true }).click();
    await page.locator('.workspace-remove-dialog').waitFor({state:'visible'});
    await page.locator('.workspace-remove-dialog').getByRole('button',{name:/移\s*除/}).click();
    await page.waitForFunction(() => document.querySelectorAll('#workspace-grid .workspace-card').length === 1);
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).pathname, '/', '移除后留在工作空间列表，不自动进入剩下的工作空间');
    assert.equal(await page.locator('#workspace-grid .workspace-card').count(), 1);
    assert.equal(runtime.listRegisteredWorkspaces().workspaces.some((entry: any) => entry.rootPath === firstRoot), false);
    current = runtime.listRegisteredWorkspaces();
    for (const entry of [...current.workspaces]) current = runtime.removeRegisteredWorkspace({ rootPath: entry.rootPath, revision: current.revision });
    await page.goto(`${url}/?catalog=1`);
    await page.locator('#workspace-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#empty-add-workspace').count(), 1);
    assert.equal(await page.locator('#empty-create-workspace').count(), 1);
    assert.equal(await page.getByRole('button', { name: '稍后处理' }).count(), 0);
    current = runtime.registerLocalWorkspace({ rootPath: workspaceRoot, revision: current.revision });
    runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: current.revision });
  });

  if (selected('shell')) await t.test('平级导航、页面级页签与手机菜单保持真实范围', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    assert.deepEqual(await page.locator('.primary-navigation-rail button[data-nav]').allTextContents(), ['工作台', '工作空间', '代码']);
    await showPrimaryNavigation(page, 'workspace');
    await page.locator('.primary-navigation-rail [data-nav="workspace"]').click();
    await page.locator('.primary-secondary-navigation:visible [data-nav="workspace-overview"]').click();
    await page.waitForURL(`${workspaceUrl}/workspace-overview`);
    await page.waitForFunction(() => [...document.querySelectorAll('.shell-navigation .shell-nav-item')].some((node: any) => node.textContent === '项目'));
    assert.deepEqual(await page.locator('.shell-navigation .shell-nav-item').allTextContents(), ['总览', '项目', '服务', '代码库', '连接', '技能', '文章']);
    await page.locator('[data-nav=projects]').click();
    await page.getByRole('tab', { name: '项目目录', exact: true }).waitFor({ state: 'visible' });
    await page.locator('#project-table-body tr').filter({ hasText: '演示项目' }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    // The .on activation class was timing-fragile; presence + URL is enough here.
    await page.locator('.workspace-tabstrip .pane-tab').filter({ hasText: '演示项目' }).waitFor({ state: 'visible' });
    await page.locator('[data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.locator('.workspace-tabstrip .pane-tab').filter({ hasText: '演示项目' }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.goto(`${workspaceUrl}/services/demo/api`);
    await page.waitForURL(`${workspaceUrl}/services`);
    await page.locator('.pane-right:visible #service-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('tab', { name: '演示服务', exact: true }).count(), 0);
    assert.equal(await page.locator('#service-table-wrap').isVisible(), true);
    await showPrimaryNavigation(page, 'workbench');
    await page.locator('.primary-secondary-navigation:visible').getByRole('link',{name:'概览',exact:true}).click();
    await page.waitForURL(`${workspaceUrl}/overview`);
    await showPrimaryNavigation(page, 'workspace');
    await page.locator('.primary-secondary-navigation:visible [data-nav="workspace-overview"]').click();
    await page.waitForURL(`${workspaceUrl}/workspace-overview`);
    await page.getByRole('tab', {name:'服务目录',exact:true}).click();
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
    const tabOrder = (): Promise<string[]> => page.locator('.workspace-tabstrip .pane-tab-text').allTextContents();
    const pins = (): Promise<string[]> => page.locator('.workspace-tabstrip [data-pinned="true"] .pane-tab-text').allTextContents();
    await page.getByRole('tab', { name: '演示项目', exact: true }).press('Alt+ArrowLeft');
    const order = await tabOrder();
    const activeTitle = await page.locator('.workspace-tabstrip [aria-selected="true"] .pane-tab-text').innerText();
    await page.reload();
    await page.locator('#skills-list').waitFor({ state: 'visible' });
    assert.deepEqual(await tabOrder(), order, '刷新保留用户排序，不因激活而自动置首');
    assert.equal(await page.locator('.workspace-tabstrip [aria-selected="true"] .pane-tab-text').innerText(), activeTitle);
    const pin = async (title: string) => {
      await page.getByRole('tab', { name: title, exact: true }).hover();
      await page.getByRole('button', { name: `固定 ${title}`, exact: true }).click();
      assert.equal(await page.getByRole('button', { name: `取消固定 ${title}`, exact: true }).getAttribute('aria-pressed'), 'true');
    };
    await pin('技能目录');
    await pin('演示项目');
    assert.deepEqual(await pins(), ['技能目录', '演示项目']);
    assert.equal(page.url(), `${workspaceUrl}/skills`, '固定操作不切换当前页面');
    await page.getByRole('tab', { name: '演示项目', exact: true }).press('Alt+ArrowLeft');
    assert.deepEqual(await pins(), ['演示项目', '技能目录'], '固定区内可以调整个人顺序');
    // Drag an ordinary page across the fixed boundary: it moves within its own region.
    const ordinary = page.getByRole('tab', { name: '服务目录', exact: true });
    const sourceBox = await ordinary.boundingBox();
    const targetBox = await page.getByRole('tab', { name: '演示项目', exact: true }).boundingBox();
    assert.ok(sourceBox && targetBox);
    await page.mouse.move(sourceBox.x + 40, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + 2, targetBox.y + targetBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('.pane-tab-drag-ghost'));
    assert.deepEqual((await tabOrder()).slice(0, 3), ['演示项目', '技能目录', '服务目录']);
    assert.equal(page.url(), `${workspaceUrl}/skills`, '拖动不误激活被拖页面');
    const ordinaryOrder = (await tabOrder()).slice(2);
    await page.getByRole('button', { name: '关闭 演示项目', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '演示项目', exact: true }).count(), 0);
    await page.reload();
    await page.locator('#skills-list').waitFor();
    assert.equal(await page.getByRole('tab', { name: '演示项目', exact: true }).count(), 0, '关闭固定页面后刷新不强行重开');
    assert.deepEqual(await pins(), ['技能目录']);
    assert.deepEqual(await page.evaluate((id: string) => JSON.parse(localStorage.getItem(`buildr.web.pinned-page-tabs.${id}`) || '[]').map((tab: { title: string }) => tab.title), initialWorkspaceId), ['演示项目', '技能目录']);
    await showPrimaryNavigation(page, 'workspace');
    await page.locator('.primary-secondary-navigation:visible [data-nav="projects"]').click();
    await page.locator('#project-table-body tr').filter({ hasText: '演示项目' }).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await page.getByRole('tab', { name: '演示项目', exact: true }).waitFor({ state: 'visible' });
    assert.deepEqual(await pins(), ['演示项目', '技能目录'], '重新打开恢复保存的固定位置');
    assert.deepEqual((await tabOrder()).slice(2), ordinaryOrder, '打开和激活保留普通区的用户顺序');
    await page.getByRole('tab', { name: '技能目录', exact: true }).click();
    await page.getByRole('button', { name: '取消固定 演示项目', exact: true }).click();
    assert.deepEqual((await tabOrder()).slice(0, 2), ['技能目录', '演示项目']);
    assert.equal(page.url(), `${workspaceUrl}/skills`, '取消固定不改变当前页面');
    await page.getByRole('button', { name: '取消固定 技能目录', exact: true }).click();
    assert.deepEqual(await pins(), []);
    const unpinnedOrder = await tabOrder();
    await page.reload();
    await page.locator('#skills-list').waitFor();
    assert.deepEqual(await tabOrder(), unpinnedOrder);
    assert.deepEqual(await pins(), [], '取消固定的偏好也跨刷新保存');
    assert.equal(await page.locator('.primary-navigation-rail [data-nav="workspace"]').getAttribute('data-fixed'), 'true');
    assert.equal(await page.locator('.primary-navigation-rail .active').count(), 0, '一级图标不使用路由active标记');
    assert.equal(await page.locator('.primary-navigation-rail button[data-nav="workspace"]').getAttribute('data-highlighted'), 'true');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.primary-navigation-rail button[data-nav="workspace"]')!).backgroundColor==='rgb(237, 244, 240)');
    assert.ok(['none','normal'].includes(await page.locator('.primary-navigation-rail button[data-nav="workspace"]').evaluate((node:HTMLElement)=>getComputedStyle(node,'::before').content)));
    assert.equal(await page.locator('[data-nav="services"]').innerText(), '服务');
    assert.equal(await page.getByText('环境维护', { exact: true }).count(), 0);
    assert.equal(await page.getByText('智能体配置', { exact: true }).count(), 0);
    await page.locator('.primary-navigation-rail [data-nav="workspace"]').click();
    assert.equal(await page.locator('.primary-navigation').evaluate((el: HTMLElement) => Math.round(el.getBoundingClientRect().width)), 53);
    await showPrimaryNavigation(page, 'workspace');
    await page.locator('.primary-navigation-rail [data-nav="workspace"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(await page.locator('.primary-secondary-navigation .shell-nav-item').allTextContents(), ['总览', '项目', '服务', '代码库', '连接', '技能', '文章']);
    await page.locator('.primary-secondary-navigation [data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    await page.locator('.primary-navigation-rail [data-nav="workspace"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(page, 'navigation-project-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
    await showPrimaryNavigation(page, 'workspace');
    await page.locator('.primary-navigation-rail [data-nav="workspace"]').click();
    await page.locator('#project-table-body tr').filter({ hasText: '演示项目' }).click();
    await page.locator('[data-nav="services"]').click();
    await page.getByRole('button', { name: '关闭 演示项目', exact: true }).click();
    await page.locator('[data-nav="projects"]').click();
    await page.waitForURL(`${workspaceUrl}/projects`);
    assert.equal(await page.getByRole('tab', { name: '演示项目', exact: true }).count(), 0);
    await capture(page, 'navigation-project-desktop.png');
  });

  if (selected('articles')) await runPublicationJourney({ t, page, runtime, workspaceRoot, workspaceUrl, otherWorkspaceUrl: `${url}/workspaces/${otherWorkspaceId}`, expectedBrowserErrors, selectAntdOption, capture });

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
    await page.locator('#workspace-name').fill('browser-e2e-updated');
    await page.locator('#workspace-save-button').click();
    await page.locator('#workspace-form').waitFor({ state: 'hidden' });
    assert.match(await page.getByRole('button', { name: '切换工作空间', exact: true }).innerText(), /browser-e2e-updated/);
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

  if (selected('project')) await t.test('全新工作空间不先迁移即可从网页创建首个项目', async () => {
    const before = runtime.assetCatalog(otherRoot);
    assert.equal(before.migrationRequired, false);
    assert.deepEqual([before.projects, before.services, before.repositories], [[], [], []]);
    await page.goto(`${url}/workspaces/${otherWorkspaceId}/projects/new`);
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('首次网页项目');
    await page.getByRole('textbox', { name: '项目编码', exact: true }).fill('first-browser-project');
    assert.equal(await page.getByRole('button', { name: '迁移登记', exact: true }).count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: '创建项目', exact: true }).click();
    await page.waitForURL(`${url}/workspaces/${otherWorkspaceId}/projects/first-browser-project`);
    await page.getByRole('heading', { name: '首次网页项目', exact: true }).waitFor({ state: 'visible' });
    const after = runtime.assetCatalog(otherRoot);
    assert.equal(after.migrationRequired, false);
    assert.equal(after.projects[0].code, 'first-browser-project');
    assert.deepEqual([after.services, after.repositories], [[], []]);
  });

  if (selected('project')) await t.test('项目列表展示标题与说明，详情展示基础事实与文档', async () => {
    const demoAgentsPath = path.join(workspaceRoot, 'projects', 'demo', 'AGENTS.md');
    const previousDemoAgents = fs.existsSync(demoAgentsPath) ? fs.readFileSync(demoAgentsPath, 'utf8') : null;
    if (previousDemoAgents === null) fs.writeFileSync(demoAgentsPath, '# AGENTS.md\n\n演示项目规则。\n', 'utf8');
    try {
      const beforeProjectEdit = runtime.assetCatalog(workspaceRoot);
      if (beforeProjectEdit.migrationRequired) runtime.migrateAssetCatalog(workspaceRoot, { revision: beforeProjectEdit.revision });
      await page.goto(`${workspaceUrl}/projects`);
      const row: any = page.locator('#project-table-body tr').filter({ hasText: '演示项目' });
      await row.waitFor({ state: 'visible' });
      await unique(row, '项目行');
      await row.click();
      await page.waitForURL(`${workspaceUrl}/projects/demo`);
      assert.equal(await page.locator('#project-detail-name').innerText(), '演示项目');
      assert.equal(await page.locator('#project-detail-description').innerText(), '浏览器测试项目');
      assert.equal(await page.locator('#project-service-count').innerText(), '1');
      await page.locator('[data-service-card="api"]').waitFor({ state: 'visible' });
      await page.locator('[data-doc-row="agents"]').click();
      await page.locator('.pane-right .markdown-body').filter({ hasText: /AGENTS\.md|演示项目规则/ }).waitFor({ state: 'visible' });
      await capture(page, 'project-home-desktop.png');

      await page.getByRole('button', { name: '编辑项目', exact: true }).click();
      await page.locator('#catalog-edit').waitFor({ state: 'visible' });
      await page.getByRole('textbox', { name: '说明', exact: true }).fill('已在抽屉中更新');
      await page.getByRole('button', { name: '保存修改', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.getElementById('project-detail-description')?.textContent === '已在抽屉中更新');

      await page.getByRole('button', { name: '编辑项目', exact: true }).click();
      await page.locator('#catalog-edit').waitFor({ state: 'visible' });
      await page.getByRole('textbox', { name: '说明', exact: true }).fill('浏览器测试项目');
      await page.getByRole('button', { name: '保存修改', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.getElementById('project-detail-description')?.textContent === '浏览器测试项目');
    } finally {
      if (previousDemoAgents === null) fs.rmSync(demoAgentsPath, { force: true });
      else fs.writeFileSync(demoAgentsPath, previousDemoAgents, 'utf8');
    }
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
    await page.getByRole('tab', { name: '服务详情', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: '关闭 服务详情', exact: true }).count(), 1, '对象关闭是独立可访问控件');
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
    await showPrimaryNavigation(page, 'workspace');
    assert.equal(await page.locator('.primary-secondary-navigation:visible [data-nav="services"]').evaluate((item: any) => item.classList.contains('active')), true);
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

  if (selected('change')) await t.test('Change 详情展示任务关联事实与 OpenSpec 只读内容', async () => {
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await page.goto(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    await page.locator('#task-change-provenance').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /工作副本/);
    assert.match(await page.locator('#change-artifacts').innerText(), /浏览器流程/);
    assert.equal(await page.locator('#change-brief').count(), 0);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'projects/demo/openspec/changes/browser-flow/brief.md')), false);
    const response = await page.request.get(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/browser-task/changes/demo/browser-flow`);
    assert.equal(response.status(), 200);
    assert.equal(Object.hasOwn((await response.json()).resolution.workingCopy.change, 'brief'), false);
    assert.equal(await page.getByRole('button', { name: /审查|继续推进/ }).count(), 0, 'Change 详情只读展示');
  });

  if (selected('task')) await runTaskListJourney({antdSelectDisplay, antdSelectOptionTexts, applyTaskFilters, assert, browserErrors, capture, closeTaskReading, confirmAntModal, crypto, expectedBrowserErrors, fs, openAntdSelect, openTaskActionModal, openTaskFilterPanel, openTaskSearch, otherWorkspaceId, page, path, prepareEvidenceFixture, process, recordVerificationResultFromEvidence, runBuildr, runtime, selectAntdOption, selected, showPrimaryNavigation, t: taskFocusedT(t), taskFocusedT, url, workspaceRoot, workspaceUrl, writeChange});

  if (selected('task-materials')) await runTaskMaterialsJourney({ t: taskFocusedT(t), page, runtime, materials: runtimeProvide(webRuntime, TASK_MATERIALS_APPLICATION), workspaceRoot, workspaceUrl, runBuildr, runGit, capture, expectedBrowserErrors });

  if (selected('workbench')) await runWorkbenchJourney({ t, page, runtime, workspaceRoot, otherWorkspaceRoot: otherRoot, workspaceUrl, otherWorkspaceUrl: `${url}/workspaces/${otherWorkspaceId}`, expectedBrowserErrors, selectAntdOption, capture });



  const unexpectedBrowserErrors: any = browserErrors.filter((error: any) => ![...expectedBrowserErrors].some((expected: any) => error.includes(expected)));
  assert.deepEqual(unexpectedBrowserErrors, [], unexpectedBrowserErrors.join('\n'));
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=assertions-complete errors=${unexpectedBrowserErrors.length}\n`);
});
