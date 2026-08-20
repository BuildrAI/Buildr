import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { FINISH_PHASES, FINISH_RUN_SCHEMA, inspectFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';
import { taskDevelopmentDigest } from '../../src/domain/task-development/task-development.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { materializeCleanProductSource } from '../helpers/clean-product-source.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const SELECTOR_INPUT = process.argv[2] ?? 'all';
const SCREENSHOT_DIR = process.env.BUILDR_SCREENSHOT_DIR;
const KNOWN_SELECTORS = new Set(['all', 'core', 'shell', 'task', 'project', 'service', 'change', 'articles']);
const SELECTORS = new Set(SELECTOR_INPUT.split(',').map((item) => item.trim()).filter(Boolean));

for (const selector of SELECTORS) if (!KNOWN_SELECTORS.has(selector)) throw new Error(`Unknown browser integration selector: ${selector}`);
if (SELECTORS.size === 0) throw new Error('Browser integration selector cannot be empty.');
const selected = (name) => SELECTORS.has('all') || SELECTORS.has(name);
const selectorLabel = [...SELECTORS].join(',');

function runBuildr(args, buildr = BUILDR) {
  const result = spawnSync(process.execPath, [buildr, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
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
  fs.writeFileSync(path.join(changeRoot, 'proposal.md'), `# ${title}\n\n验证 Buildr Web。\n`);
  fs.writeFileSync(path.join(changeRoot, 'design.md'), '## Context\n\nBrowser smoke fixture.\n');
  fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] 准备 fixture\n- [ ] 验证页面\n');
  fs.writeFileSync(path.join(changeRoot, 'specs', 'demo-capability', 'spec.md'), '# Demo Capability Specification\n\n## Purpose\n\nFixture.\n\n## Requirements\n');
}

function writeUiPreviewFixtures(projectRoot, relative) {
  const previewRoot = path.join(projectRoot, 'openspec', 'changes', relative, 'preview-fixtures');
  fs.mkdirSync(previewRoot, { recursive: true });
  fs.writeFileSync(path.join(previewRoot, 'overview.html'), `<!doctype html>
<!-- buildr:ui-preview -->
<html lang="zh-CN"><head><meta charset="utf-8"><title>预演任务总览</title><style>
body{margin:0;font-family:system-ui;background:#f4f5f1;color:#283126}.shell{min-height:100vh}.nav{padding:18px 28px;background:#23372d;color:white}.page{padding:28px}.card{max-width:720px;padding:24px;border-radius:18px;background:white;box-shadow:0 12px 32px #23372d18}button{padding:9px 15px;border:0;border-radius:999px;background:#c9572c;color:white}
</style></head><body data-parent-access="pending"><div class="shell"><nav class="nav">Buildr · 任务</nav><main class="page"><section class="card"><p>完整任务页面</p><h1>预演任务总览</h1><button id="preview-action">切换关键状态</button><strong id="preview-state">待确认</strong></section></main></div><script>
try { parent.document.querySelector('#task-detail-title'); document.body.dataset.parentAccess = 'unexpected'; } catch { document.body.dataset.parentAccess = 'blocked'; }
document.querySelector('#preview-action').addEventListener('click', () => { document.querySelector('#preview-state').textContent = '已确认'; });
</script></body></html>`);
  fs.writeFileSync(path.join(previewRoot, 'details.html'), `<!doctype html>
<!-- buildr:ui-preview -->
<html lang="zh-CN"><head><meta charset="utf-8"><title>预演任务详情</title><style>
body{margin:0;font-family:system-ui;background:#f4f5f1;color:#283126}.nav{padding:18px 28px;background:#23372d;color:white}.page{padding:28px}.grid{display:grid;grid-template-columns:220px 1fr;gap:18px}.panel{padding:22px;border-radius:18px;background:white}
</style></head><body><nav class="nav">Buildr · 任务</nav><main class="page"><div class="grid"><aside class="panel">任务导航</aside><section class="panel"><p>完整任务详情页面</p><h1 id="preview-detail-heading">预演任务详情</h1></section></div></main></body></html>`);
}

function createCoreFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-core', '--description', '核心 Browser Smoke fixture']);
  runBuildr(['task', 'create', 'core-task', '--title', '核心浏览器任务', '--intent', '验证核心 Browser Smoke 路由与只读 Tab', '--target', root]);
}

function createServiceFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-service', '--description', '服务目录 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  const source = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
}

function createProjectFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-project', '--description', '项目目录 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  const source = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
}

function createArticlesFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-articles', '--description', '文章入口 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'product', '--target', root, '--name', 'Buildr Product', '--description', '对外文章测试项目']);
  const publicationRoot = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: browser-article\ntitle: 浏览器测试文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-05\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 浏览器测试文章\n\n![测试配图](assets/cover.png)\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), Buffer.from('not-a-real-image'));
}

function createShellFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke', '--description', 'Shell Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  runBuildr(['project', 'create', 'other', '--target', root, '--name', '另一项目', '--description', '用于验证 Workspace 摘要不锁定项目']);
  const source = path.join(path.dirname(root), 'service-source');
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

function createChangeFixture(root) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke-change', '--description', 'Change 详情 Browser Smoke fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  const projectRoot = path.join(root, 'projects', 'demo');
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser change fixture baseline']);
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Change 详情页面', '--project', 'demo', '--change', 'demo/browser-flow', '--target', root]);
}

function createFixture(root, controllerCli, options = {}) {
  runBuildr(['init', '--target', root, '--name', 'browser-smoke', '--description', '隔离的浏览器 E2E fixture']);
  runBuildr(['project', 'create', 'demo', '--target', root, '--name', '演示项目', '--description', '浏览器测试项目']);
  runBuildr(['project', 'create', 'other', '--target', root, '--name', '另一项目', '--description', '用于验证 Workspace 摘要不锁定项目']);
  if (options.articles) {
    runBuildr(['project', 'create', 'product', '--target', root, '--name', 'Buildr Product', '--description', '对外文章测试项目']);
    const publicationRoot = path.join(root, 'projects', 'product', 'docs', 'publications');
    fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: browser-article\ntitle: 浏览器测试文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-05\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 浏览器测试文章\n\n![测试配图](assets/cover.png)\n');
    fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), Buffer.from('not-a-real-image'));
  }
  const source = path.join(path.dirname(root), 'service-source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Demo API\n');
  runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', '演示服务', '--description', '浏览器测试服务', '--type', 'backend']);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'docs', 'task-reference.md'), '# 任务参考资料\n\n普通用户可以直接查看这份文档。\n\n[继续阅读](more.md)\n');
  fs.writeFileSync(path.join(projectRoot, 'docs', 'more.md'), '# 后续资料\n\n同一项目内的相对文档链接也可打开。\n');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), `schemaVersion: buildr.project-verification/v2
capabilities:
  - id: demo.browser
    title: Browser smoke
    scope:
      project: demo
      services: [api]
    invocation:
      kind: command
      argv: [node, -e, "void 0"]
      cwd: .
    applicability:
      paths: ["**"]
    proves:
      - Task Verification Result is visible in Buildr Web
    requiredForDelivery: true
`);
  writeChange(projectRoot, 'browser-flow', '浏览器流程');
  writeUiPreviewFixtures(projectRoot, 'browser-flow');
  writeChange(projectRoot, 'archive/2026-07-22-archived-flow', '已归档流程');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Browser Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'browser fixture baseline']);
  runBuildr(['task', 'create', 'browser-parent', '--title', '浏览器协调任务', '--intent', '验证 Parent Task 页面', '--project', 'demo', '--service', 'demo/api', '--target', root]);
  runBuildr(['task', 'create', 'browser-task', '--title', '浏览器任务', '--intent', '验证 Task Record 页面，参考 [任务参考资料](projects/demo/docs/task-reference.md)。', '--parent', 'browser-parent', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  runBuildr(['task', 'create', 'created-in-app', '--title', '页面查看任务', '--intent', '验证 Buildr Web 轻量查询客户端', '--parent', 'browser-task', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
  for (const [taskId, title] of [['browser-delivered', '已交付浏览器任务'], ['browser-stale', '目标已变化浏览器任务']]) {
    runBuildr(['task', 'create', taskId, '--title', title, '--intent', '验证 terminal delivery 与 live applicability 分离', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/browser-flow', '--target', root]);
    const planFile = path.join(path.dirname(root), `${taskId}-environment-plan.json`);
    fs.writeFileSync(planFile, `${JSON.stringify({ schemaVersion: 'buildr.task-environment-plan/v1', services: [{ selector: 'service:demo/api', disposition: 'not-applicable', reason: 'Browser fixture uses only saved Buildr Web facts.', steps: [] }] })}\n`);
    runBuildr(['task', 'environment', 'prepare', taskId, '--plan', planFile, ...(taskId === 'browser-delivered' ? ['--shared'] : []), '--agent', 'codex', '--target', root], controllerCli);
    runBuildr(['task', 'review', 'record', taskId, '--type', 'planning', '--target-identity', 'plan:browser-v1', '--method', 'self', '--reviewed', 'task intent', '--reviewed', 'change:demo/browser-flow', '--outcome', 'ready', '--summary', '计划可执行', '--target', root]);
  }
  runBuildr(['task', 'create', 'browser-unproven', '--title', '交付未经证明任务', '--intent', '验证 completed 但缺少 matching Finish', '--target', root]);
  runBuildr(['task', 'review', 'record', 'browser-task', '--type', 'planning', '--target-identity', 'plan:browser-v1', '--method', 'self', '--reviewed', 'task intent', '--reviewed', 'change:demo/browser-flow', '--outcome', 'ready', '--summary', '计划可执行', '--target', root]);
  runBuildr(['task', 'create', 'browser-abandon', '--title', '待放弃任务', '--intent', '验证明确放弃', '--target', root]);
}

function createSelectedFixture(root, controllerCli) {
  if (SELECTORS.size === 2 && SELECTORS.has('shell') && SELECTORS.has('core')) {
    createShellFixture(root);
    return 'shell+core';
  }
  if (SELECTORS.size !== 1) {
    createFixture(root, controllerCli, { articles: selected('articles') });
    return 'full';
  }
  const selector = [...SELECTORS][0];
  if (selector === 'core') createCoreFixture(root);
  else if (selector === 'shell') createShellFixture(root);
  else if (selector === 'project') createProjectFixture(root);
  else if (selector === 'service') createServiceFixture(root);
  else if (selector === 'change') createChangeFixture(root);
  else if (selector === 'articles') createArticlesFixture(root);
  else createFixture(root, controllerCli, { articles: selected('articles') });
  return selector;
}

function prepareDevelopmentFixture(runtime, root, taskId = 'browser-task', contributionBinding = null) {
  runtime.beginTaskDevelopment(root, taskId, {
    changeDispositions: [{ project: 'demo', change: 'browser-flow', disposition: 'not-applicable', summary: '浏览器夹具不验证Change收敛。' }],
    planning: { targetIdentity: 'plan:browser-v1', nodes: [{ id: 'proposal', kind: 'proposal', authority: 'openspec/v1', reference: 'demo/browser-flow/proposal', identity: taskDevelopmentDigest('browser-flow-proposal'), disposition: 'current', summary: '浏览器夹具提案已形成。' }] },
  });
  if (contributionBinding) runtime.bindChildContributions(root, taskId, contributionBinding);
  let development = runtime.observeTaskDevelopment(root, taskId, {
    changeDispositions: [{ project: 'demo', change: 'browser-flow', disposition: 'not-applicable', summary: '浏览器夹具不验证Change收敛。' }],
    planningTargetIdentity: 'plan:browser-v1',
  });
  development = runtime.recordTaskDevelopmentPolicy(root, taskId, {
    capabilities: [{ project: 'demo', capability: 'demo.browser', required: true }], coverageGaps: [], overrides: [],
  });
  const targetIdentity = development.development.receipt.contentTarget.identity;
  runtime.recordTaskVerification(root, taskId, {
    targetIdentity,
    targetSummary: '浏览器交付目标',
    capabilities: [{ project: 'demo', capability: 'demo.browser', outcome: 'passed', facts: ['Buildr Web 验证投影已通过。'] }],
    coverageGaps: [],
    conclusion: { outcome: 'passed', summary: '浏览器验证已通过。' },
    declarationRoot: root,
  });
  const failedVerification = runtime.openTaskExecutionRecord(root, taskId, { owner: 'task-verification', kind: 'verification-execution', runIdentity: 'browser-verification-failed', targetIdentity, producer: 'browser-smoke' });
  runtime.sealTaskExecutionRecord(root, failedVerification.record.recordId, { outcome: 'failed', files: [{ name: 'stdout.txt', content: 'browser verification failed output' }, { name: 'summary.json', content: { outcome: 'failed' } }] });
  const passedVerification = runtime.openTaskExecutionRecord(root, taskId, { owner: 'task-verification', kind: 'verification-execution', runIdentity: 'browser-verification-passed', targetIdentity, producer: 'browser-smoke' });
  runtime.sealTaskExecutionRecord(root, passedVerification.record.recordId, { outcome: 'passed', files: [{ name: 'stdout.txt', content: 'browser verification passed output' }] });
  const finishDiagnostics = runtime.openTaskExecutionRecord(root, taskId, { owner: 'task-finish', kind: 'finish-diagnostics', runIdentity: 'browser-finish-passed', targetIdentity, producer: 'browser-smoke' });
  runtime.sealTaskExecutionRecord(root, finishDiagnostics.record.recordId, { outcome: 'passed', files: [{ name: 'diagnostics.json', content: { outcome: 'passed' } }] });
  development = runtime.freezeTaskDevelopmentCandidate(root, taskId);
  const candidate = development.development.receipt.candidate;
  runtime.recordTaskReview(root, taskId, {
    reviewType: 'completion', targetIdentity: candidate.identity, method: 'human', reviewed: ['当前任务候选'],
    uncovered: [{ subject: '浏览器视觉差异', reason: '本轮只执行烟雾测试。' }], findings: ['没有阻断问题'],
    conclusion: { outcome: 'ready', summary: '候选可交付' },
  });
  runtime.decideTaskDevelopment(root, taskId, { outcome: 'proceed', summary: '当前门禁均允许推进。', risks: [] });
  return runtime.createTaskDevelopmentHandoff(root, taskId).development.receipt;
}

function writeDeliveredFinishFixture(runtime, root, taskId, receipt, cleanupResult) {
  const handoff = receipt.handoffs.at(-1);
  const runId = `${taskId}-browser-run`;
  const completedAt = cleanupResult.environment.latest.cleanup.completedAt;
  const carrier = { identity: 'sha256-browser-carrier', reuseMode: 'deterministic-reuse' };
  const equivalence = { status: 'equivalent', reuseMode: 'deterministic-reuse', semanticEquivalence: 'deterministic-git-identity', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity, candidateGeneration: handoff.candidate.generation, contentTargetIdentity: handoff.candidate.contentTargetIdentity, carrierIdentity: carrier.identity };
  const delivery = { status: 'delivered', carrierRef: 'browser-final-ref', remoteAfterRef: 'browser-final-ref', finalRemoteRef: 'browser-final-ref', activation: { status: 'passed' }, retainedDoctor: 'passed', runtimeInstall: 'not-applicable', localAppDelivery: 'not-applicable' };
  const completion = { status: 'complete', cleanup: cleanupResult };
  const run = {
    schemaVersion: FINISH_RUN_SCHEMA, runId, status: 'complete',
    identity: { task: taskId, handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity, candidateGeneration: handoff.candidate.generation, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'codex', targetBranch: 'dev', remote: 'origin', environmentRoot: root, workspaceRoot: root },
    identityDigest: 'sha256-browser-run', createdAt: completedAt, updatedAt: completedAt, completedAt, invocations: 1,
    deliveryCarrier: carrier, equivalence, delivery, completion, resume: null, primaryFailure: null,
    phases: FINISH_PHASES.map((id) => ({ id, status: 'passed', attempts: 1, startedAt: completedAt, completedAt, durationMs: 0, inputIdentity: null, outputIdentity: null, checks: [], operations: [], observations: [], output: null, failure: null })),
  };
  runtime.writeTaskFinishRunPersistence(root, run);
  const association = {
    schemaVersion: 'buildr.task-terminal-delivery-associations/v1', handoffIdentity: handoff.identity,
    candidateIdentity: handoff.candidate.identity, candidateGeneration: handoff.candidate.generation,
    gates: {
      planning: handoff.gates.planning.disposition
        ? { status: 'gate-disposition', disposition: handoff.gates.planning.disposition, targetIdentity: handoff.gates.planning.targetIdentity, summary: handoff.gates.planning.summary, source: handoff.gates.planning.source }
        : { status: 'adopted-at-delivery', targetIdentity: handoff.gates.planning.targetIdentity, resultDigest: handoff.gates.planning.resultDigest, outcome: handoff.gates.planning.outcome },
      completion: { status: 'adopted-at-delivery', targetIdentity: handoff.gates.completion.targetIdentity, resultDigest: handoff.gates.completion.resultDigest, outcome: handoff.gates.completion.outcome },
      verification: { status: 'verified-at-delivery', targetIdentity: handoff.gates.verification.targetIdentity, resultDigest: handoff.gates.verification.resultDigest, outcome: handoff.gates.verification.outcome },
    },
    observedAt: completedAt, source: 'task-finish-application',
  };
  const completionRecord = { schemaVersion: 'buildr.task-finish-completion/v1', runId, task: taskId, handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity, candidateGeneration: handoff.candidate.generation, contentTargetIdentity: handoff.candidate.contentTargetIdentity, carrierIdentity: carrier.identity, carrierRef: delivery.finalRemoteRef, finalRemoteRef: delivery.finalRemoteRef, taskContributionIdentity: 'sha256-browser-contribution', deliveryBaseline: { head: 'browser-base', tree: 'browser-tree' }, targetBranch: 'dev', status: 'complete', preparedAt: completedAt, completedAt, cleanup: cleanupResult, association };
  runtime.finalizeTaskFinishPersistence(root, { run, result: inspectFinishRun({ root, runId, runtime }), completion: completionRecord });
}

async function unique(locator, description) {
  const count = await locator.count();
  assert.equal(count, 1, `${description} 应唯一，实际 ${count} 个。`);
  return locator;
}

async function openTaskActionModal(page, actionId) {
  await page.locator(`#${actionId}`).click();
}

async function openAntdSelect(page, id) {
  await page.locator(`.ant-select:has(#${id}) .ant-select-selector`).click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().waitFor({ state: 'visible' });
}

async function antdSelectOptionTexts(page) {
  return page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().locator('.ant-select-item-option-content').allTextContents();
}

async function selectAntdOption(page, id, optionText) {
  await openAntdSelect(page, id);
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last()
    .locator('.ant-select-item-option')
    .filter({ hasText: optionText })
    .first()
    .click();
  await page.waitForFunction(
    ({ selectId, text }) => {
      const root = document.querySelector(`.ant-select:has(#${selectId})`);
      return Boolean(root?.querySelector('.ant-select-selection-item')?.textContent?.includes(text));
    },
    { selectId: id, text: optionText },
  );
}

async function openTaskFilterPanel(page) {
  if (!await page.locator('#task-filter-form').isVisible()) {
    await page.locator('#task-filter-panel-toggle').click();
    await page.locator('#task-filter-form').waitFor({ state: 'visible' });
  }
}

async function applyTaskFilters(page) {
  await page.locator('#task-filter-apply').click();
  await page.locator('#task-filter-form').waitFor({ state: 'hidden' });
}

async function openTaskSearch(page) {
  await page.locator('#task-filter-q').waitFor({ state: 'visible' });
}

async function antdSelectDisplay(page, id) {
  return page.locator(`.ant-select:has(#${id})`).evaluate((root) => (
    root.querySelector('.ant-select-selection-item')?.textContent?.trim()
      || root.querySelector('.ant-select-selection-placeholder')?.textContent?.trim()
      || ''
  ));
}

async function confirmAntModal(page) {
  await page.locator('.ant-modal-confirm .ant-btn-primary').click();
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true });
}

test(`Buildr Web 浏览器集成：${selectorLabel}`, { timeout: SELECTORS.has('all') || SELECTORS.has('task') ? 180_000 : 45_000 }, async (t) => {
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
    process.stderr.write(`[buildr-browser] selector=${selectorLabel} phase=cleanup-complete\n`);
  });

  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);

  const controller = materializeCleanProductSource(PRODUCT_ROOT, path.join(base, 'retained-controller'));
  const controllerRuntime = (await import(`${pathToFileURL(path.join(controller.root, 'src', 'application', 'compose-runtime.mjs')).href}?browser=${Date.now()}`)).createRuntime();
  controllerRuntime.currentProductInvocation = (options = {}) => ({
    command: process.execPath,
    argsPrefix: [options.cliPath || controller.cli],
    kind: options.kind || 'stable-controller',
  });
  const fixtureProfile = createSelectedFixture(workspaceRoot, controller.cli);
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=fixture-ready\n`);
  const otherRoot = path.join(base, 'other-workspace');
  runBuildr(['init', '--target', otherRoot, '--name', 'other-workspace', '--description', '第二个浏览器工作空间']);
  const runtime = createRuntime();
  let forceDevelopmentUnknown = false;
  const resolveTaskEnvironmentExecution = runtime.resolveTaskEnvironmentExecution.bind(runtime);
  runtime.resolveTaskEnvironmentExecution = (targetRoot, taskId) => {
    if (taskId === 'browser-parent') {
      return { ready: true, taskId, receiptSchema: 'buildr.task-environment-receipt/v5', workspaceRoot: targetRoot, environmentRoot: targetRoot, validationRoot: targetRoot, scopes: [] };
    }
    if (forceDevelopmentUnknown && taskId === 'browser-task') {
      const error = new Error('当前机器暂时无法读取任务环境。');
      error.code = 'task_environment_unavailable';
      throw error;
    }
    return resolveTaskEnvironmentExecution(targetRoot, taskId);
  };
  let registry = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: registry.revision });
  const instance = createLocalWorkspaceServer(runtime, {
    targetRoot: workspaceRoot,
    webProfile: { profile: 'development' },
  });
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
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=browser-ready\n`);
  const browserErrors = [];
  const expectedBrowserErrors = new Set();
  page.on('pageerror', (error) => browserErrors.push(`pageerror ${page.url()}: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console.error ${page.url()} [${message.location().url}]: ${message.text()}`); });

  if (SELECTORS.has('core')) await t.test('核心流程进入 Workspace、Task 路由并读取代表性 Tab', async () => {
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#development-environment-badge').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#development-environment-badge').innerText()).trim(), '开发版');
    assert.equal(await page.title(), `${fixtureProfile === 'core' ? 'browser-smoke-core' : 'browser-smoke'} · Buildr Web Dev`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#task-table-body tr.ant-table-row').count() > 0, '核心 smoke 必须存在可进入的 Task');
    await page.locator('#task-table-body tr.ant-table-row').first().click();
    await page.waitForURL(/\/workspaces\/[^/]+\/tasks\/[^/]+$/);
    await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.locator('#task-development-panel').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#task-development-status').innerText()).length > 0, '核心 smoke 必须展示研发 Tab 状态');
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
    const target = page.locator('#workspace-grid .workspace-card').filter({ has: page.locator('h2').filter({ hasText: /^browser-smoke$/ }) });
    await unique(target, 'browser-smoke 工作空间卡片');
    await target.getByRole('link', { name: '进入工作空间' }).click();
    await page.waitForURL(/\/workspaces\/[^/]+\/tasks(?:\/[^/]+)?$/);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#shell-workspace-name').innerText()).trim(), 'browser-smoke');
    assert.equal(await page.title(), 'browser-smoke · Buildr Web Dev');
    assert.equal(await page.locator('[data-nav="tasks"]').evaluate((item) => item.classList.contains('active')), true);
    const expectedProjectCount = selected('articles') ? 3 : 2;
    await page.locator('#open-agent-action').click();
    await unique(page.getByRole('button', { name: '用 Agent 开始' }), '开始工作操作');
    await page.getByRole('button', { name: '用 Agent 开始' }).click();
    await page.locator('#action-project').waitFor({ state: 'visible' });
    await openAntdSelect(page, 'action-project');
    await page.waitForFunction(
      (count) => {
        const dropdown = [...document.querySelectorAll('.ant-select-dropdown')]
          .find((node) => !node.classList.contains('ant-select-dropdown-hidden'));
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
    assert.equal(await page.locator('#workspace-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 720 });
    let current = runtime.listRegisteredWorkspaces();
    for (const entry of [...current.workspaces]) current = runtime.removeRegisteredWorkspace({ rootPath: entry.rootPath, revision: current.revision });
    await page.goto(url);
    await page.locator('#workspace-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#empty-add-workspace').count(), 1);
    assert.equal(await page.locator('#empty-create-workspace').count(), 1);
    assert.equal(await page.getByRole('button', { name: '稍后处理' }).count(), 1);
    current = runtime.registerLocalWorkspace({ rootPath: workspaceRoot, revision: current.revision });
    runtime.registerLocalWorkspace({ rootPath: otherRoot, revision: current.revision });
  });

  if (selected('articles')) await t.test('文章入口展示列表、详情和项目内配图', async () => {
    await page.goto(`${workspaceUrl}/articles`);
    await page.locator('.publication-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('.publication-card').count(), 1);
    assert.equal(await page.locator('[data-nav="articles"]').evaluate((item) => item.classList.contains('active')), true);
    await page.locator('.publication-card a').click();
    await page.waitForURL(`${workspaceUrl}/articles/browser-article`);
    await page.locator('#publication-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#publication-title').innerText(), '浏览器测试文章');
    assert.match(await page.locator('#publication-targets').innerText(), /Buildr Web/);
    assert.equal(await page.locator('.publication-content img').count(), 1);
    assert.match(await page.locator('.publication-content img').getAttribute('src'), /\/api\/v1\/workspaces\/[^/]+\/publications\/browser-article\/assets\/assets\/cover\.png$/);
    await page.locator('.ant-segmented-item').filter({ hasText: '原文' }).click();
    assert.equal(await page.locator('.content-view-source').isVisible(), true);
    expectedBrowserErrors.add(`${url}/api/v1/workspaces/${initialWorkspaceId}/publications/missing`);
    await page.goto(`${workspaceUrl}/articles/missing`);
    await page.locator('h1').filter({ hasText: '文章不可用' }).waitFor({ state: 'visible' });
    assert.match(await page.locator('.page-copy').innerText(), /文章不存在/);
    fs.rmSync(path.join(workspaceRoot, 'projects', 'product', 'docs', 'publications', 'article.md'));
    await page.goto(`${workspaceUrl}/articles`);
    await page.locator('#publications-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#publications-empty').innerText(), /暂无文章/);
  });

  if (selected('project')) await t.test('项目列表展示标题与说明，详情展示基础事实与文档', async () => {
    await page.goto(`${workspaceUrl}/projects`);
    const row = page.locator('#project-table-body tr').filter({ hasText: '演示项目' });
    await row.waitFor({ state: 'visible' });
    await unique(row, '项目行');
    assert.match(await row.innerText(), /浏览器测试项目/);
    assert.equal(await row.getByRole('link', { name: '详情', exact: true }).count(), 0);
    await row.click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    assert.equal(await page.locator('#project-detail-name').innerText(), '演示项目');
    assert.equal(await page.locator('#project-detail-description').innerText(), '浏览器测试项目');
    assert.equal(await page.locator('#project-service-summary').innerText(), '1 个已登记服务');
    assert.equal(await page.locator('#app-view input, #app-view textarea').count(), 0);
    assert.equal(await page.getByText('操作', { exact: true }).count(), 0);
    assert.equal(await page.locator('.overview-strip, .related-resource-links').count(), 0);
    assert.equal(await page.locator('.detail-facts > div').count(), 2);
    assert.equal(await page.locator('[data-nav="projects"]').evaluate((item) => item.classList.contains('active')), true);
    assert.match(await page.locator('#project-document-missing-README-md').innerText(), /未找到 README\.md/);
    await page.getByRole('tab', { name: 'AGENTS.md', exact: true }).click();
    await page.waitForFunction(() => {
      const body = document.getElementById('project-document-AGENTS-md')?.textContent || '';
      return !body.includes('正在读取') && /AGENTS\.md|Project|项目/.test(body);
    });
    assert.match(await page.locator('#project-document-AGENTS-md').innerText(), /AGENTS\.md|Project|项目/);
    await page.getByRole('tab', { name: '每日演进', exact: true }).click();
    await page.locator('#progress-date').waitFor({ state: 'visible' });
    await page.locator('#progress-date').click();
    await page.locator('.ant-picker-dropdown:visible').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#daily-progress-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#daily-progress-empty').innerText(), /需要 Agent/);
    assert.equal(await page.locator('#progress-body input, #progress-body textarea').count(), 0);
    assert.equal(await page.locator('[data-group]').count(), 3);
    await page.getByRole('button', { name: '编辑项目', exact: true }).click();
    await page.locator('#project-edit-form').waitFor({ state: 'visible' });
    assert.equal(await page.url(), `${workspaceUrl}/projects/demo`);
    await page.locator('#project-description').fill('已在弹框中更新');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('project-detail-description')?.textContent === '已在弹框中更新');
    assert.equal(await page.locator('#project-detail-description').innerText(), '已在弹框中更新');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });

  if (selected('service')) await t.test('服务目录在操作栏提供关联跳转，详情展示基础事实与文档', async () => {
    await page.goto(`${workspaceUrl}/services?project=demo`);
    const projectSelect = page.locator('#service-project-select');
    await unique(projectSelect, '服务所属项目过滤器');
    assert.match(await antdSelectDisplay(page, 'service-project-select'), /demo/);
    const row = page.locator('#service-table-body tr').filter({ hasText: '演示服务' });
    await row.waitFor({ state: 'visible' });
    await unique(row, '服务行');
    await capture(page, 'local-app-services-desktop.png');
    const detail = row.getByRole('link', { name: '详情', exact: true });
    await unique(detail, '服务详情操作');
    await unique(row.getByRole('link', { name: '项目', exact: true }), '服务所属项目操作');
    await unique(row.getByRole('button', { name: '编辑', exact: true }), '服务目录编辑操作');
    await detail.click();
    await page.waitForURL(`${workspaceUrl}/services/demo/api`);
    assert.equal(await page.locator('#service-detail-name').innerText(), '演示服务');
    assert.equal(await page.locator('#service-detail-description').innerText(), '浏览器测试服务');
    assert.equal(await page.locator('#service-detail-type').innerText(), '后端');
    assert.equal(await page.locator('#app-view input, #app-view textarea').count(), 0);
    assert.equal(await page.getByText('操作', { exact: true }).count(), 0);
    assert.equal(await page.locator('.overview-strip, .related-resource-links').count(), 0);
    assert.equal(await page.locator('.detail-facts > div').count(), 3);
    assert.equal(await page.locator('[data-nav="services"]').evaluate((item) => item.classList.contains('active')), true);
    await page.waitForFunction(() => {
      const body = document.getElementById('service-document-README-md')?.textContent || '';
      return !body.includes('正在读取') && /Demo API|README/.test(body);
    });
    assert.match(await page.locator('#service-document-README-md').innerText(), /Demo API|README/);
    await page.getByRole('tab', { name: 'AGENTS.md', exact: true }).click();
    await page.waitForFunction(() => {
      const body = document.getElementById('service-document-AGENTS-md')?.textContent || '';
      return !body.includes('正在读取') && /未找到 AGENTS\.md/.test(body);
    });
    await page.getByRole('button', { name: '编辑服务', exact: true }).click();
    await page.locator('#service-edit-form').waitFor({ state: 'visible' });
    assert.equal(await page.url(), `${workspaceUrl}/services/demo/api`);
    await page.locator('#service-description').fill('已在弹框中更新');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('service-detail-description')?.textContent === '已在弹框中更新');
    assert.equal(await page.locator('#service-detail-description').innerText(), '已在弹框中更新');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });

  if (selected('service')) await t.test('390px 下目录与详情不产生页面横向溢出', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${workspaceUrl}/services?project=demo`);
    await page.locator('#service-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('link', { name: '详情', exact: true }).click();
    await page.locator('#service-detail-name').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await unique(page.getByRole('button', { name: '编辑服务', exact: true }), '服务详情编辑操作');
    await capture(page, 'local-app-service-detail-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  if (selected('change')) await t.test('Change 详情展示任务关联事实与 OpenSpec 只读内容', async () => {
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await unique(page.locator('#task-detail-changes a').filter({ hasText: 'demo/browser-flow' }), '任务 Change 关联');
    await page.locator('#task-detail-changes a').filter({ hasText: 'demo/browser-flow' }).click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    await page.locator('#task-change-provenance').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /工作副本/);
    assert.match(await page.locator('#change-brief').innerText(), /浏览器流程/);
    assert.equal(await page.getByRole('button', { name: /审查|继续推进/ }).count(), 0, 'Change 详情只读展示');
  });

  if (selected('task')) await t.test('任务列表筛选、编辑、冲突、终态确认与窄屏交互共享同一 Task Record', async () => {
    const deliveredReceipt = prepareDevelopmentFixture(runtime, workspaceRoot, 'browser-delivered');
    prepareDevelopmentFixture(runtime, workspaceRoot, 'browser-stale');
    runtime.recordTaskVerification(workspaceRoot, 'browser-stale', { targetIdentity: 'sha256-browser-stale-target', targetSummary: '已变化目标', capabilities: [{ project: 'demo', capability: 'demo.browser', outcome: 'passed', facts: ['旧目标验证事实。'] }], coverageGaps: [], conclusion: { outcome: 'passed', summary: '旧目标曾通过。' }, declarationRoot: workspaceRoot });
    runtime.completeTaskRecord(workspaceRoot, 'browser-delivered', { summary: '浏览器交付完成', noChange: false });
    const deliveredCleanup = await controllerRuntime.cleanupTaskEnvironment(workspaceRoot, 'browser-delivered', { type: 'finish', deliveries: { workspace: 'dev' } });
    assert.equal(deliveredCleanup.status, 'cleaned', JSON.stringify(deliveredCleanup, null, 2));
    writeDeliveredFinishFixture(runtime, workspaceRoot, 'browser-delivered', deliveredReceipt, deliveredCleanup);
    const browserEnvironment = controllerRuntime.prepareTaskEnvironment(workspaceRoot, 'browser-task', { adapter: 'codex', useGit: false, plan: { schemaVersion: 'buildr.task-environment-plan/v1', services: [{ selector: 'service:demo/api', disposition: 'not-applicable', reason: 'Browser fixture uses only saved Buildr Web facts.', steps: [] }] } });
    assert.equal(browserEnvironment.status, 'ready', JSON.stringify(browserEnvironment, null, 2));
    await page.goto(`${workspaceUrl}/tasks/browser-parent`);
    await page.getByRole('button', { name: '预演', exact: true }).click();
    await page.locator('#task-preview-empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-preview-empty').innerText(), /还没有可查看的界面预演稿[\s\S]*不会阻塞任务推进/);
    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.getByRole('button', { name: '预演', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.ui-preview-page').length === 2);
    assert.equal(await page.locator('.ui-preview-page').count(), 2);
    await page.locator('.ui-preview-page').filter({ hasText: '预演任务总览' }).click();
    assert.match(await page.locator('#task-preview-source').innerText(), /demo\/browser-flow[\s\S]*preview-fixtures/);
    assert.equal(await page.locator('#task-preview-open-window').innerText(), '新窗口打开');
    assert.equal(await page.locator('.ui-preview-stage-heading').getByText('隔离预览').count(), 0);
    assert.equal(await page.locator('#task-preview-frame').getAttribute('sandbox'), 'allow-scripts');
    const previewSource = await page.locator('#task-preview-frame').getAttribute('src');
    assert.ok(previewSource);
    const [previewWindow] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('#task-preview-open-window').click(),
    ]);
    await previewWindow.waitForURL((opened) => new URL(opened).pathname === new URL(previewSource, url).pathname);
    assert.equal(new URL(previewWindow.url()).pathname, new URL(previewSource, url).pathname);
    await previewWindow.close();
    const previewResponse = await page.request.get(new URL(previewSource, url).href);
    assert.equal(previewResponse.status(), 200);
    assert.match(previewResponse.headers()['content-security-policy'] || '', /sandbox allow-scripts[\s\S]*connect-src 'none'[\s\S]*form-action 'none'[\s\S]*frame-ancestors 'self'/);
    const previewFrame = page.frameLocator('#task-preview-frame');
    await previewFrame.locator('#preview-action').waitFor({ state: 'visible' });
    assert.equal(await previewFrame.locator('body').getAttribute('data-parent-access'), 'blocked');
    await previewFrame.locator('#preview-action').click();
    assert.equal(await previewFrame.locator('#preview-state').innerText(), '已确认');
    await page.locator('.ui-preview-page').filter({ hasText: '预演任务详情' }).click();
    await page.frameLocator('#task-preview-frame').locator('#preview-detail-heading').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-preview-title').innerText(), '预演任务详情');
    runtime.beginTaskDevelopment(workspaceRoot, 'browser-parent', {
      changeDispositions: [],
      planning: { targetIdentity: null, nodes: [] },
      planningGate: { disposition: 'not-applicable', targetIdentity: null, summary: 'Parent Plan 尚未记录。', source: 'browser fixture' },
    });
    const parentCoordination = runtime.recordParentPlan(workspaceRoot, 'browser-parent', { plan: {
      outcome: '完成父任务协调视图的集成验收。',
      architectureDecisions: ['Parent Coordination 只派生 read model。'],
      contributions: [
        { id: 'task-record-reference-slice', priority: 'P0-1 reference slice', title: 'Task Record 参考切片', objective: '完成 Task Record 纵向参考切片重构。', directions: ['保持单一 authority。'], boundaries: ['不复制 Child 状态。'], expectedChild: 'Task Record focused Child', dependencies: [] },
        { id: 'engineering-root-layout', priority: 'P0-2 independent foundation', title: '工程根目录布局', objective: '收敛工程根目录职责与直接消费者。', directions: ['先识别直接消费者。'], boundaries: ['不扩大到无关服务。'], expectedChild: 'Layout focused Child', dependencies: [] },
        { id: 'parent-integration', priority: 'P1-1 composition foundation', title: 'Parent 集成', objective: '执行父任务最终集成验收。', directions: ['只集成已证明交付。'], boundaries: ['不从 completed 推断交付。'], expectedChild: null, dependencies: ['task-record-reference-slice', 'engineering-root-layout'] },
        { id: 'infrastructure-boundaries', priority: 'P1-2 technical mechanisms', title: '通用 Infrastructure 边界', objective: '收敛 SQLite、filesystem、Git、process、network、platform 和 clock 等通用技术机制。', directions: ['保持通用技术能力可独立验证。'], boundaries: ['不引入业务语义或第二 writer。'], expectedChild: 'Infrastructure focused Child', dependencies: ['parent-integration'] },
        { id: 'task-capability-slices', priority: 'P1-3 task capability slices', title: 'Task 能力单元', objective: '按独立验证的能力单元迁移 Task 模块其余职责。', directions: ['保持 Task Record 与专业 owner 边界。'], boundaries: ['不复制专业 Result。'], expectedChild: 'Task capability Child', dependencies: ['parent-integration'] },
        { id: 'workspace-capability-slices', priority: 'P1-4 workspace capability slices', title: 'Workspace 管理能力', objective: '迁移 Workspace、Project、Service、Component、Rules 与 Commands 能力单元。', directions: ['保持 workspace authority。'], boundaries: ['不改变公开契约。'], expectedChild: 'Workspace capability Child', dependencies: ['parent-integration'] },
        { id: 'agent-asset-slices', priority: 'P1-5 agent asset slices', title: 'Agent Assets 能力单元', objective: '迁移 Rule、Skill、Command、Component 与 runtime adapter 能力单元。', directions: ['保持资产治理职责。'], boundaries: ['不改变 runtime authority。'], expectedChild: 'Agent assets Child', dependencies: ['parent-integration'] },
        { id: 'web-runtime-capabilities', priority: 'P2-1 web runtime capabilities', title: 'Buildr Web Runtime 能力', objective: '迁移 Buildr Web Runtime、HTTP 公共宿主与 web-dist 托管职责。', directions: ['保持同源托管。'], boundaries: ['不接管 buildr-web 前端源码。'], expectedChild: 'Web runtime Child', dependencies: ['parent-integration'] },
        { id: 'installation-doctor-capabilities', priority: 'P2-2 installation capabilities', title: 'Installation 与 Doctor 能力', objective: '收敛 installation、update、launcher 和 doctor 等 system 能力单元。', directions: ['保持安装和诊断语义。'], boundaries: ['必要时拆成多个 Child。'], expectedChild: 'Installation Child', dependencies: ['parent-integration'] },
        { id: 'release-packaging-capabilities', priority: 'P2-3 release packaging', title: 'Release 与 Packaging 能力', objective: '收敛 npm package、payload、release artifacts 与正式发布验证入口。', directions: ['保持制品 identity。'], boundaries: ['不改变发布授权。'], expectedChild: 'Release packaging Child', dependencies: ['parent-integration'] },
      ],
      finalAcceptance: ['全部 Contribution 已交付或明确替代。'],
    } });
    runtime.recordTaskReview(workspaceRoot, 'browser-parent', {
      reviewType: 'planning', targetIdentity: parentCoordination.plan.identity, method: 'self',
      reviewed: ['Parent Plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: '父任务计划可推进。' },
    });
    runtime.refreshParentPlanning(workspaceRoot, 'browser-parent');
    prepareDevelopmentFixture(runtime, workspaceRoot, 'browser-task', { parentTaskId: 'browser-parent', contributionIds: ['task-record-reference-slice'] });
    runtime.completeTaskRecord(workspaceRoot, 'browser-unproven', { summary: '顶层标记完成', noChange: false });
    await page.goto(`${workspaceUrl}/tasks`);
    await page.locator('#task-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-table-body tr.ant-table-row').count(), 7, '默认目录显示全部任务；未完成排在前面');
    assert.equal(await page.locator('[data-nav="tasks"]').evaluate((item) => item.classList.contains('active')), true);
    assert.match(await page.locator('.page-copy').first().innerText(), /正式任务由 Agent 创建/);
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
    await page.locator('#task-table-body tr.ant-table-row').click();
    await page.waitForURL(`${workspaceUrl}/tasks/created-in-app`);
    assert.equal(await page.locator('#task-detail-status').innerText(), '进行中');
    assert.match(await page.locator('#task-detail-parent').innerText(), /浏览器任务[\s\S]*进行中/);
    await page.locator('#task-detail-parent a').click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task`);
    assert.match(await page.locator('#task-detail-parent').innerText(), /浏览器协调任务[\s\S]*进行中/);
    assert.match(await page.locator('#task-detail-children').innerText(), /页面查看任务[\s\S]*进行中/);
    await page.locator('#task-detail-parent a').click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-parent`);
    await page.locator('.parent-plan-workbench').waitFor({ state: 'visible' });
    assert.match(await page.locator('.parent-summary-strip').innerText(), /可启动[\s\S]*1[\s\S]*明确处置[\s\S]*0 \/ 10/);
    assert.match(await page.locator('.parent-contribution-rail').innerText(), /Task Record 参考切片[\s\S]*工程根目录布局[\s\S]*Parent 集成/);
    assert.equal(await page.locator('.parent-contribution-detail').count(), 0, 'Contribution 详情默认不占用正文布局');
    const parentLayout = await page.evaluate(() => {
      const work = document.querySelector('.parent-work-section').getBoundingClientRect();
      const architecture = document.querySelector('.parent-plan-architecture').getBoundingClientRect();
      const priorities = [...document.querySelectorAll('.parent-priority-items .parent-priority')].slice(0, 3).map((item) => item.getBoundingClientRect());
      return { workBottom: work.bottom, architectureTop: architecture.top, priorities: priorities.map((item) => ({ width: item.width, height: item.height })) };
    });
    assert.ok(parentLayout.workBottom <= parentLayout.architectureTop, 'Contribution Map 不得覆盖后续架构决定区块');
    assert.ok(parentLayout.priorities.every((item) => item.width >= 150 && item.height < 40), '自由格式 priority 在桌面端保持可读宽度');
    await page.locator('[data-contribution-id="engineering-root-layout"]').click();
    await page.locator('.parent-contribution-drawer').waitFor({ state: 'visible' });
    assert.match(await page.locator('.parent-contribution-detail').innerText(), /P0-2[\s\S]*工程根目录布局[\s\S]*执行：可启动[\s\S]*实际：尚未分配/);
    await page.locator('.parent-contribution-drawer .ant-drawer-close').click();
    await page.locator('.parent-contribution-drawer').waitFor({ state: 'hidden' });
    await page.locator('[data-contribution-id="parent-integration"]').click();
    assert.match(await page.locator('.parent-contribution-detail').innerText(), /等待依赖[\s\S]*工程根目录布局[\s\S]*Task Record 参考切片/);
    await page.locator('.parent-contribution-drawer .ant-drawer-close').click();
    await page.locator('.parent-contribution-drawer').waitFor({ state: 'hidden' });
    await page.locator('.parent-governance-details summary').click();
    const governanceFacts = await page.locator('.parent-governance-details').innerText();
    assert.match(governanceFacts, /Planning Review[\s\S]*ready · current/);
    assert.doesNotMatch(governanceFacts, /undefined/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('[data-contribution-id="task-record-reference-slice"]').click();
    await page.locator('.parent-contribution-drawer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.parent-contribution-drawer .ant-drawer-content-wrapper').evaluate((item) => item.getBoundingClientRect().width <= window.innerWidth), true);
    await page.locator('.parent-contribution-drawer .ant-drawer-close').click();
    await page.locator('.parent-contribution-drawer').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('.task-technical-overview > summary').click();
    await page.locator('#task-detail-children a').filter({ hasText: '浏览器任务' }).click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task`);
    assert.match(await page.locator('.child-parent-source').innerText(), /PARENT 来源[\s\S]*浏览器协调任务[\s\S]*Task Record 参考切片[\s\S]*进行中/);
    await page.locator('#task-detail-children a').filter({ hasText: '页面查看任务' }).click();
    await page.waitForURL(`${workspaceUrl}/tasks/created-in-app`);
    assert.equal(await page.locator('#task-detail-services').innerText(), 'demo/api');
    assert.match(await page.locator('#task-detail-changes').innerText(), /demo\/browser-flow/);
    assert.match(await page.locator('#task-detail-changes').innerText(), /打开时检查当前状态/);
    await page.locator('#task-parent-coordination').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-task-tab]').count(), 6);
    await unique(page.getByRole('button', { name: '预演', exact: true }), '任务预演页签');
    await unique(page.getByRole('button', { name: '研发', exact: true }), '任务研发页签');
    await unique(page.getByRole('button', { name: '证据', exact: true }), '任务证据页签');
    await unique(page.getByRole('button', { name: '复盘', exact: true }), '任务复盘页签');
    await unique(page.getByRole('button', { name: '环境', exact: true }), '任务环境页签');
    await page.getByRole('button', { name: '复盘', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-retrospective-content')?.textContent.includes('尚未复盘'));
    assert.equal(await page.locator('#task-retrospective-panel button').count(), 1, '复盘页签只提供只读刷新');
    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.locator('#task-development-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-development-status').innerText(), '尚未形成研发回执');
    assert.equal(await page.locator('#task-development-detail').isHidden(), true);
    assert.equal(await page.locator('#task-development-panel button').count(), 2, '研发页提供只读刷新与 Finish 执行记录入口');
    await page.getByRole('button', { name: '证据', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-review-slots .review-slot-card').length === 2);
    await page.waitForFunction(() => document.querySelectorAll('#task-verification-result .review-slot-card').length === 1);
    assert.equal(await page.locator('#task-review-slots .review-slot-card').count(), 2);
    assert.equal(await page.locator('#task-review-slots').getByText('未记录', { exact: true }).count(), 2);
    assert.equal(await page.locator('#task-verification-result').getByText('未记录', { exact: true }).count(), 1);
    await page.locator('#task-review-slots .review-slot-card').first().getByRole('button', { name: '交给智能体审查', exact: true }).click();
    await page.getByRole('button', { name: '生成审查指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /created-in-app/);
    assert.match(await page.locator('#action-prompt-output').inputValue(), /Planning Review/);
    assert.equal(await page.locator('#action-copy-state').innerText(), '审查结果尚未记录。');
    await page.locator('#close-agent-action').click();
    await page.getByRole('button', { name: '概览', exact: true }).click();

    await openTaskActionModal(page, 'task-complete-action');
    await page.locator('#task-complete-form').waitFor({ state: 'visible' });
    await page.locator('#task-complete-summary').fill('页面确认完成');
    await selectAntdOption(page, 'task-complete-no-change', '有交付变更');
    await page.locator('#task-complete-form').getByRole('button', { name: '确认完成', exact: true }).click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'visible' });
    await confirmAntModal(page);
    await page.locator('#task-terminal-note').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-detail-status').innerText(), '已完成');
    assert.equal(await page.locator('#task-active-actions').isHidden(), true);
    runtime.recordTaskRetrospective(workspaceRoot, 'created-in-app', { reportMarkdown: '# 执行效率\n\n减少重复读取。' });
    await page.goto(`${workspaceUrl}/tasks`);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '未处理');
    assert.equal(await antdSelectDisplay(page, 'task-filter-status'), '全部', '处置状态筛选应解除默认的进行中限制');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    assert.match(await page.locator('#task-table-body').innerText(), /页面查看任务/);
    await page.goto(`${workspaceUrl}/tasks/created-in-app`);
    await page.getByRole('button', { name: '复盘', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-retrospective-content')?.textContent.includes('减少重复读取'));
    assert.match(await page.locator('#task-retrospective-content').innerText(), /Agent 执行效率[\s\S]*执行效率[\s\S]*减少重复读取/);
    assert.equal(await page.locator('#task-retrospective-content h2').innerText(), '执行效率');
    assert.match(await page.locator('.retrospective-disposition').innerText(), /未处理/);
    await page.locator('#task-retrospective-handle-open').click();
    await page.locator('#task-retrospective-disposition-note').waitFor({ state: 'visible' });
    await page.locator('#task-retrospective-disposition-note').fill('没有可转化为改进任务的事项');
    await page.locator('#task-retrospective-no-action').click();
    await page.waitForFunction(() => document.querySelector('.retrospective-disposition')?.textContent.includes('没有可转化为改进任务的事项'));
    assert.match(await page.locator('.retrospective-disposition').innerText(), /无需处理[\s\S]*重新打开[\s\S]*没有可转化为改进任务的事项/);
    await page.goto(`${workspaceUrl}/tasks`);
    await openTaskFilterPanel(page);
    await selectAntdOption(page, 'task-filter-retrospective', '无需处理');
    await applyTaskFilters(page);
    await page.waitForFunction(() => document.querySelectorAll('#task-table-body tr.ant-table-row').length === 1);
    assert.match(await page.locator('#task-table-body').innerText(), /页面查看任务/);

    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.locator('#task-detail-intent').getByRole('link', { name: '任务参考资料', exact: true }).click();
    await page.locator('#task-document-preview').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-document-preview-path').innerText(), 'projects/demo/docs/task-reference.md');
    assert.match(await page.locator('.task-document-preview-content').innerText(), /普通用户可以直接查看这份文档/);
    await page.locator('.task-document-preview-content').getByRole('link', { name: '继续阅读', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-document-preview-path')?.textContent?.endsWith('/more.md'));
    assert.match(await page.locator('.task-document-preview-content').innerText(), /同一项目内的相对文档链接也可打开/);
    await page.locator('.task-document-preview-modal .ant-modal-close').click();
    await page.locator('#task-document-preview').waitFor({ state: 'hidden' });
    await openTaskActionModal(page, 'task-edit-action');
    await page.locator('#task-edit-form').waitFor({ state: 'visible' });
    await page.locator('#task-change-briefs .change-brief-panel').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-change-briefs').innerText(), /普通用户先从这里了解变更/);
    assert.match(await antdSelectDisplay(page, 'task-edit-parent'), /browser-parent/);
    await selectAntdOption(page, 'task-edit-parent', '无 Parent（独立 Task）');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#task-detail-parent').innerText(), '无（独立 Task）');
    const taskChange = page.locator('#task-detail-changes a').filter({ hasText: 'demo/browser-flow' });
    await unique(taskChange, '任务关联 Change');
    assert.match(await taskChange.innerText(), /打开时检查当前状态/);
    await taskChange.click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task/changes/demo/browser-flow`);
    await page.locator('#task-change-provenance').waitFor({ state: 'visible' });
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /工作副本/);
    assert.match(await page.locator('#task-change-provenance-facts').innerText(), /保留基线/);
    assert.equal(await page.getByRole('button', { name: /审查|继续推进/ }).count(), 0, 'Task-scoped Change 只读展示');
    await page.locator('.back-link').click();
    await page.waitForURL(`${workspaceUrl}/tasks/browser-task`);

    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent === '研发交接已就绪');
    assert.equal(await page.locator('#task-development-axes .development-axis-card').count(), 6);
    assert.equal(await page.locator('#task-development-axes').getByText('当前有效', { exact: true }).count(), 6);
    assert.match(await page.locator('#task-development-planning').innerText(), /proposal · proposal[\s\S]*当前事实[\s\S]*openspec\/v1[\s\S]*浏览器夹具提案已形成/);
    assert.equal(await page.locator('#task-development-gates .development-gate-card').count(), 3);
    assert.match(await page.locator('#task-development-gates').innerText(), /方案审查[\s\S]*已就绪/);
    assert.match(await page.locator('#task-development-gates').innerText(), /任务验证[\s\S]*已通过/);
    assert.match(await page.locator('#task-development-gates').innerText(), /完成审查[\s\S]*已就绪/);
    assert.match(await page.locator('#task-development-candidate').innerText(), /候选代次[\s\S]*1/);
    assert.match(await page.locator('#task-development-decision').innerText(), /允许推进/);
    assert.match(await page.locator('#task-development-decision').innerText(), /已接受风险数[\s\S]*0/);
    assert.match(await page.locator('#task-development-handoff').innerText(), /已保存交接数[\s\S]*1/);
    assert.equal(await page.locator('#task-development-panel button').count(), 5, '研发页只有刷新、三个门禁证据跳转与 Finish 执行记录入口');
    await page.locator('#task-finish-execution-records-entry').getByRole('button', { name: '查看 Finish 执行记录', exact: true }).click();
    await page.locator('#task-execution-record-filter-finish[aria-pressed="true"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#task-execution-record-list .execution-record-card').length === 1);
    assert.match(await page.locator('#task-execution-record-list').innerText(), /Finish · passed/);
    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent === '研发交接已就绪');
    await capture(page, 'local-app-task-development-desktop.png');

    forceDevelopmentUnknown = true;
    await page.getByRole('button', { name: '刷新研发状态', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent === '研发交接已就绪');
    assert.equal(await page.locator('#task-development-history-note').isHidden(), true, '刷新只查询已保存的 current read model，不重新检查 Environment');
    assert.match(await page.locator('#task-development-handoff').innerText(), /已保存交接数[\s\S]*1/);
    forceDevelopmentUnknown = false;
    await page.getByRole('button', { name: '刷新研发状态', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent === '研发交接已就绪');

    await page.getByRole('button', { name: '证据', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-review-slots .review-slot-card').length === 2);
    await page.waitForFunction(() => document.querySelectorAll('#task-verification-result .review-slot-card').length === 1);
    await page.locator('#task-execution-record-filter-all').click();
    await page.waitForFunction(() => document.querySelectorAll('#task-execution-record-list .execution-record-card').length === 3);
    assert.match(await page.locator('#task-execution-record-list').innerText(), /Verification · failed/);
    await page.locator('#task-execution-record-list .execution-record-card.failed').click();
    await page.locator('#task-execution-record-detail').waitFor({ state: 'visible' });
    await page.locator('#task-execution-record-detail').getByRole('button', { name: /stdout\.txt/ }).click();
    await page.waitForFunction(() => document.querySelector('.execution-record-body pre')?.textContent?.includes('browser verification failed output'));
    await page.locator('.ant-modal-close').click();
    await page.locator('.ant-modal-wrap').waitFor({ state: 'hidden' });
    await page.locator('#task-verification-execution-records').click();
    await page.locator('#task-execution-record-filter-verification[aria-pressed="true"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#task-execution-record-list .execution-record-card').length === 2);
    assert.equal(await page.locator('#task-review-slots').getByText('适用性未知', { exact: true }).count(), 2);
    assert.match(await page.locator('#task-review-slots').innerText(), /plan:browser-v1/);
    assert.match(await page.locator('#task-review-slots').innerText(), /sha256-/);
    assert.match(await page.locator('#task-review-slots').innerText(), /计划可执行/);
    assert.match(await page.locator('#task-review-slots').innerText(), /没有阻断问题/);
    assert.match(await page.locator('#task-verification-result').innerText(), /适用性未知/);
    assert.match(await page.locator('#task-verification-result').innerText(), /sha256-/);
    assert.match(await page.locator('#task-verification-result').innerText(), /浏览器验证已通过/);
    assert.match(await page.locator('#task-verification-result').innerText(), /demo\/demo.browser · 已通过 · Buildr Web 验证投影已通过/);
    await page.getByRole('button', { name: '交给智能体验证', exact: true }).click();
    await page.getByRole('button', { name: '生成验证指令', exact: true }).click();
    await page.locator('#action-prompt-output').waitFor({ state: 'visible' });
    assert.match(await page.locator('#action-prompt-output').inputValue(), /browser-task/);
    assert.match(await page.locator('#action-prompt-output').inputValue(), /task-verification Skill/);
    assert.equal(await page.locator('#action-copy-state').innerText(), '验证结果未被修改。');
    await page.locator('#close-agent-action').click();

    await page.goto(`${workspaceUrl}/tasks/browser-stale`);
    await page.getByRole('button', { name: '证据', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-verification-result .review-slot-card').length === 1);
    assert.match(await page.locator('#task-verification-result').innerText(), /适用性未知/);
    assert.doesNotMatch(await page.locator('#task-verification-result').innerText(), /已随交付目标/);

    await page.goto(`${workspaceUrl}/tasks/browser-delivered`);
    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent === '已交付');
    assert.equal(await page.locator('#task-development-axes').getByText('交付时快照', { exact: true }).count(), 6);
    assert.match(await page.locator('#task-development-terminal').innerText(), /origin\/dev[\s\S]*已按正常流程清理/);
    assert.equal(await page.locator('#task-development-history-note').innerText(), 'Environment 已按正常流程清理；刷新只会重读交付事实，不会重新创建 Environment。');
    await page.getByRole('button', { name: '证据', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-review-slots .review-slot-card').length === 2);
    await page.waitForFunction(() => document.querySelectorAll('#task-verification-result .review-slot-card').length === 1);
    assert.match(await page.locator('#task-review-slots').innerText(), /已随交付候选采用/);
    assert.match(await page.locator('#task-verification-result').innerText(), /已随交付目标验证通过/);
    assert.equal(await page.locator('#task-verification-result .review-slot-card').evaluate((item) => item.getBoundingClientRect().width <= 800), true);

    await page.goto(`${workspaceUrl}/tasks/browser-unproven`);
    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent === '已完成，但交付未经证明');
    assert.match(await page.locator('#task-development-terminal').innerText(), /没有找到与 immutable handoff\/Candidate 完整匹配的成功 Finish Result/);
    assert.equal(await page.locator('#task-development-terminal').evaluate((item) => item.classList.contains('delivered')), false);

    await page.goto(`${workspaceUrl}/tasks/browser-task`);
    await page.getByRole('button', { name: '环境', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-environment-status')?.textContent === '可执行');
    assert.equal(await page.locator('#task-environment-source').innerText(), '当前机器（current-machine）');
    assert.match(await page.locator('#task-environment-receipt').innerText(), /^可用 · /);
    assert.ok(await page.locator('#task-environment-scopes .environment-scope-card').count() >= 2, '应展示稳定控制面与实际工作范围');
    assert.match(await page.locator('#task-environment-scopes').innerText(), /共享根/);
    assert.match(await page.locator('#task-environment-detail').innerText(), /Task inline（没有长期声明/);
    assert.match(await page.locator('#task-environment-preparation-steps').innerText(), /当前Task无需执行Step/);
    assert.match(await page.locator('#task-environment-resources').innerText(), /没有已登记的任务所属动态资源/);
    assert.equal(await page.locator('#task-environment-panel button').count(), 1, '环境页签只提供只读刷新');
    await page.getByRole('button', { name: '刷新当前事实', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('task-environment-refresh')?.disabled);
    assert.equal(await page.locator('#task-environment-status').innerText(), '可执行');
    await page.getByRole('button', { name: '概览', exact: true }).click();

    runtime.updateTaskRecord(workspaceRoot, 'browser-task', { intent: '另一客户端已经更新' });
    await openTaskActionModal(page, 'task-edit-action');
    await page.locator('#task-edit-form').waitFor({ state: 'visible' });
    await page.locator('#task-edit-title').fill('陈旧页面不得覆盖');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-edit-state')?.textContent === '记录已变化');
    assert.match(await page.locator('#task-detail-alert').innerText(), /请刷新本页/);
    for (let index = browserErrors.length - 1; index >= 0; index -= 1) {
      if (/\/tasks\/browser-task \[[^\]]*\]: Failed to load resource: the server responded with a status of 409 \(Conflict\)$/.test(browserErrors[index])) browserErrors.splice(index, 1);
    }
    await page.reload();
    await openTaskActionModal(page, 'task-edit-action');
    await page.locator('#task-edit-form').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-edit-intent').inputValue(), '另一客户端已经更新');
    await page.locator('#task-edit-intent').fill('页面基于最新记录更新');
    await page.getByRole('button', { name: '保存任务记录', exact: true }).click();
    await page.locator('#task-edit-form').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#task-detail-intent').innerText(), /页面基于最新记录更新/);

    await page.goto(`${workspaceUrl}/tasks/browser-abandon`);
    await openTaskActionModal(page, 'task-abandon-action');
    await page.locator('#task-abandon-form').waitFor({ state: 'visible' });
    await page.locator('#task-abandon-reason').fill('浏览器验收取消');
    await page.locator('#task-abandon-form').getByRole('button', { name: '确认放弃', exact: true }).click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'visible' });
    await confirmAntModal(page);
    await page.locator('#task-terminal-note').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#task-detail-status').innerText(), '已放弃');

    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(`${workspaceUrl}/tasks/browser-task`); await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '研发', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('task-development-status')?.textContent !== '尚未读取');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(page, 'local-app-task-development-1024.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${workspaceUrl}/tasks/browser-task`); await page.locator('#task-detail-title').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '证据', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#task-review-slots .review-slot-card').length === 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(page, 'local-app-task-detail-mobile.png');
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  const unexpectedBrowserErrors = browserErrors.filter((error) => ![...expectedBrowserErrors].some((expected) => error.includes(expected)));
  assert.deepEqual(unexpectedBrowserErrors, [], unexpectedBrowserErrors.join('\n'));
  process.stderr.write(`[buildr-browser] selector=${selectorLabel} fixture=${fixtureProfile} phase=assertions-complete errors=${unexpectedBrowserErrors.length}\n`);
});
