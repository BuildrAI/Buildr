import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import type { Locator, Page } from 'playwright-core';
import YAML from 'yaml';
import { runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { SERVICE_RUNTIME_APPLICATION } from '../../src/modules/service-runtime/module.ts';
import { isActiveRun, type ManagedRunRecord } from '../../src/modules/service-runtime/domain/runs.ts';
import type { ServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';

type Service = { id: string; name: string; code: string };
type Context = { page: Page; runtime: any; workspaceRoot: string; workspaceUrl: string; expectedBrowserErrors: Set<string>; capture: (page: Page, name: string) => Promise<unknown> };
const TASK_ID = 'browser-local-runtime';
const BACKEND_CODE = 'runtime-fixture-backend';
const FRONTEND_CODE = 'runtime-fixture-web';
const REMOTE_URL = 'https://runtime-test.fixture.invalid/api';
const QUOTED_ARGUMENT = `--fixture-note=two words "quoted" \\literal\\ ${'long-argument/'.repeat(24)}`;
const SERVER_SOURCE = `import http from 'node:http';
const argument = process.argv.find(item => item.startsWith('--port='));
const port = Number(argument ? argument.slice('--port='.length) : 0);
const target = process.env.RUNTIME_BACKEND_URL || '';
http.createServer(async (request, response) => {
  if (request.url === '/backend' && target) {
    try {
      const backend = await fetch(new URL('/health', target));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ target, backend: await backend.json() }));
    } catch (error) { response.statusCode = 502; response.end(String(error)); }
  } else if (request.url === '/health') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ fixture: 'runtime-backend', port }));
  } else {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<h1>Runtime fixture</h1><pre id="backend-target">' + target + '</pre>');
  }
}).listen(port, '127.0.0.1', () => {
  console.log('Started RuntimeFixture on ' + port);
  console.log('RuntimeFixture target ' + (target || 'none'));
  console.error('RuntimeFixture diagnostic fixture-only');
});
`;
function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  assert.equal(result.status, 0, `git ${args.join(' ')} 失败：${result.stderr || result.stdout}`); return result.stdout.trim();
}
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = (server.address() as net.AddressInfo).port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}
function portReleased(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer(); server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true))); server.listen(port, '127.0.0.1');
  });
}

/** Modal placement is user-visible; oversized content may scroll instead of fitting vertically. */
async function assertCentered(page: Page, dialog: Locator) {
  await dialog.waitFor({ state: 'visible' });
  await dialog.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  const handle = await dialog.elementHandle(); assert.ok(handle);
  await page.waitForFunction(element => {
    const rect = element.getBoundingClientRect();
    const horizontal = Math.abs(rect.x + rect.width / 2 - innerWidth / 2) <= 20;
    return horizontal && (rect.height > innerHeight - 48 || Math.abs(rect.y + rect.height / 2 - innerHeight / 2) <= 20);
  }, handle, { timeout: 3000 });
  const rect = await dialog.boundingBox(), viewport = page.viewportSize(); assert.ok(rect); assert.ok(viewport);
  assert.ok(Math.abs(rect.x + rect.width / 2 - viewport.width / 2) <= 20, '弹窗应水平居中');
  if (rect.height <= viewport.height - 48) assert.ok(Math.abs(rect.y + rect.height / 2 - viewport.height / 2) <= 20, '可容纳的弹窗应垂直居中');
}

/** Real catalog, task and Git checkouts. Never fabricate API responses or run records. */
export async function createServiceRuntimeBrowserFixture(runtime: any, workspaceRoot: string) {
  const root = fs.realpathSync(workspaceRoot);
  const repositoryRelative = '.buildr/local/runtime-browser-repository';
  const repositoryRoot = path.join(root, repositoryRelative);
  assert.equal(fs.existsSync(repositoryRoot), false, '不得覆盖其他夹具代码');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  git(repositoryRoot, ['init', '-q', '--initial-branch=fixture-main']);
  git(repositoryRoot, ['config', 'user.name', 'Buildr Runtime Browser Fixture']);
  git(repositoryRoot, ['config', 'user.email', 'fixture@example.com']);
  git(repositoryRoot, ['config', 'commit.gpgSign', 'false']);
  for (const directory of ['backend', 'frontend']) {
    fs.mkdirSync(path.join(repositoryRoot, directory));
    fs.writeFileSync(path.join(repositoryRoot, directory, 'server.mjs'), SERVER_SOURCE);
  }
  git(repositoryRoot, ['add', 'backend/server.mjs', 'frontend/server.mjs']); git(repositoryRoot, ['commit', '-qm', 'runtime browser fixture']);
  let catalog = runtime.assetCatalog(root);
  if (catalog.migrationRequired) catalog = runtime.migrateAssetCatalog(root, { revision: catalog.revision });
  catalog = runtime.createCatalogRepository(root, { revision: catalog.revision, code: 'runtime-browser-repository', name: '运行浏览器夹具代码', path: repositoryRelative });
  const repositoryId = catalog.repositories.find((item: any) => item.code === 'runtime-browser-repository').id;
  const project = catalog.projects.find((item: any) => item.code === 'demo'); assert.ok(project);
  for (const [code, name, modulePath, type] of [[BACKEND_CODE, '运行夹具后端', 'backend', 'backend'], [FRONTEND_CODE, '运行夹具前端', 'frontend', 'frontend']]) {
    catalog = runtime.createCatalogService(root, { revision: catalog.revision, projectId: project.id, service: { code, name, modulePath, type, repositoryId } });
  }
  const frontend: Service = catalog.services.find((item: Service) => item.code === FRONTEND_CODE);
  const backend: Service = catalog.services.find((item: Service) => item.code === BACKEND_CODE);
  const definitionFiles: string[] = [];
  for (const [code, withBackend] of [[BACKEND_CODE, false], [FRONTEND_CODE, true]] as const) {
    const file = path.join(root, 'services', code, 'runtime.yml'); assert.equal(fs.existsSync(file), false);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, YAML.stringify({ version: 1, source: 'agent', verifiedAt: new Date().toISOString(), local: {
      command: [process.execPath, 'server.mjs', ...(withBackend ? [QUOTED_ARGUMENT] : [])], cwd: '.', profile: 'fixture', preferredPort: await freePort(), portOverride: '--port', readiness: { kind: 'log', pattern: 'Started RuntimeFixture on' }, timeoutSeconds: 30,
      ...(withBackend ? { backend: { serviceCode: BACKEND_CODE, environmentVariable: 'RUNTIME_BACKEND_URL', remoteUrl: REMOTE_URL } } : {}),
    }, environments: { qa: 'retired-invalid-field', prod: { connectionId: 'unused-fixture' } } })); definitionFiles.push(file);
  }
  runtime.createTask(root, { taskId: TASK_ID, title: '任务本地运行夹具', intent: '使用任务真实代码目录验证服务选择及前后端连接', status: 'active', projects: ['demo'], services: [`demo/${BACKEND_CODE}`, `demo/${FRONTEND_CODE}`], changes: [] });
  const prepared = runtime.prepareGitWorktrees({ workspaceRoot: root, taskId: TASK_ID, branch: `codex/${TASK_ID}`, includes: [`service:demo/${BACKEND_CODE}`, `service:demo/${FRONTEND_CODE}`] });
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared));
  fs.writeFileSync(path.join(repositoryRoot, 'frontend/uncommitted.txt'), 'main checkout current files\n');
  const application = runtimeProvide(runtime, SERVICE_RUNTIME_APPLICATION) as ServiceRuntimeApplication;
  const owned = (run: ManagedRunRecord) => [FRONTEND_CODE, BACKEND_CODE].includes(run.serviceCode)
    && (run.worktreePath === path.join(repositoryRoot, run.serviceCode === FRONTEND_CODE ? 'frontend' : 'backend') || run.taskId === TASK_ID);
  return { frontend, backend, taskId: TASK_ID, definitionFiles, application,
    async cleanup() {
      // Production identity-checked stop still works if the browser/request is gone.
      for (const run of await application.listRuns(root)) if (owned(run) && isActiveRun(run)) await application.stopRun(root, run.id);
      const ownedRuns = (await application.listRuns(root)).filter(owned);
      assert.deepEqual(ownedRuns.filter(isActiveRun), [], '夹具运行必须全部安全停止后再清理目录');
      process.stderr.write(`[buildr-service-runtime-fixture] ${JSON.stringify({ taskId: TASK_ID, ownedRuns: ownedRuns.length, activeAfterStop: 0 })}\n`);
      const cleanup = runtime.cleanupGitWorktrees({ workspaceRoot: root, taskId: TASK_ID, allowNoChange: true });
      assert.equal(cleanup.status, 'cleaned', JSON.stringify(cleanup));
      const task = runtime.inspectTask(root, TASK_ID);
      runtime.abandonTask(root, TASK_ID, { expectedRecordDigest: task.recordDigest, reason: '浏览器夹具已安全结束' });
      for (const service of [frontend, backend]) runtime.deleteCatalogAsset(root, 'service', service.id, { revision: runtime.assetCatalog(root).revision });
      runtime.deleteCatalogAsset(root, 'repository', repositoryId, { revision: runtime.assetCatalog(root).revision });
      for (const file of definitionFiles) fs.rmSync(file, { force: true });
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
    },
  };
}

/** Service/main and task paths share real instances; local injection is proved by an actual HTTP request. */
export async function runServiceRuntimeJourney({ page, runtime, workspaceRoot, workspaceUrl, expectedBrowserErrors, capture }: Context) {
  const fixture = await createServiceRuntimeBrowserFixture(runtime, workspaceRoot);
  const { frontend, backend, taskId } = fixture;
  const scope = new URL(workspaceUrl), apiBase = `${scope.origin}/api/v1${scope.pathname}/service-runtime`;
  const detailUrl = `${apiBase}/services/${frontend.code}`;
  const read = async (url: string) => { const response = await page.request.get(url); assert.equal(response.status(), 200, url); return response.json(); };
  const detail = () => read(detailUrl), taskDetail = () => read(`${apiBase}/tasks/${taskId}`);
  const section = () => page.locator('#service-runtime-section:visible');
  const row = () => page.locator('#service-table-body tr.resource-directory-row').filter({ has: page.locator(`a[href*="/services/${frontend.id}"]`) });
  const cell = () => row().locator(`[data-service-runtime-status="${frontend.code}"]`);
  const directoryAction = (name: RegExp) => row().getByRole('button', { name });
  const card = (id: string) => page.locator(`.runtime-run-row:visible[data-run-id="${id}"]`);
  const modal = () => page.getByRole('dialog').filter({ has: page.locator('#service-runtime-start-drawer, #task-runtime-start-modal') });
  const taskPanel = () => page.locator(`#task-local-runtime[data-task-runtime-id="${taskId}"]`), taskStart = () => page.locator('#task-runtime-start-modal');
  const openTask = async () => {
    await page.goto(`${workspaceUrl}/tasks/${taskId}`); await page.locator('[data-task-content="local-runtime"]').click();
    await taskPanel().getByRole('button', { name: /启动任务服务/ }).waitFor({ state: 'visible' });
  };
  const openService = async () => {
    await page.goto(`${workspaceUrl}/services/${frontend.id}?view=runtime`); await section().waitFor({ state: 'visible' });
  };
  const stopInUi = async (target: ManagedRunRecord) => {
    await card(target.id).getByRole('button', { name: /停止$/ }).click();
    const confirm = page.locator('.ant-modal-confirm'); await confirm.waitFor({ state: 'visible' }); assert.match(await confirm.innerText(), new RegExp(target.id));
    await assertCentered(page, confirm);
    await capture(page, `service-runtime-stop-confirm-${target.main ? 'main' : 'task'}.png`);
    const stopped = page.waitForResponse(response => response.url() === `${apiBase}/runs/${target.id}/stop` && response.request().method() === 'POST');
    await confirm.getByRole('button', { name: '停止运行', exact: true }).click();
    const stopResponse = await stopped; assert.equal(stopResponse.status(), 200); assert.equal((await stopResponse.json()).status, 'stopped');
    await confirm.waitFor({ state: 'hidden' });
    assert.equal((await fixture.application.listRuns(workspaceRoot)).find(run => run.id === target.id)?.status, 'stopped');
    assert.equal(await portReleased(target.actualPort), true, '停止后必须实际释放端口');
  };
  const startTask = async () => {
    await assertCentered(page, modal());
    const response = page.waitForResponse(result => result.url() === `${apiBase}/tasks/${taskId}/runs` && result.request().method() === 'POST');
    await modal().getByRole('button', { name: '启动所选服务', exact: true }).click();
    const result = await response; assert.equal(result.status(), 200); const body = await result.json();
    assert.equal(body.results.some((item: any) => item.error), false, JSON.stringify(body)); await taskStart().waitFor({ state: 'hidden' }); return body;
  };
  try {
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: scope.origin });
    const before = await detail(); assert.equal(Object.hasOwn(before.service, 'environments'), false);
    const main = before.worktrees.find((item: any) => item.main); assert.ok(main); assert.equal(main.branch, 'fixture-main'); assert.equal(main.dirty, true);
    assert.equal(before.connectionTargets[main.id].target, null); assert.ok(before.connectionTargets[main.id].reason);
    await page.goto(`${workspaceUrl}/services?project=demo`); await cell().waitFor({ state: 'visible' });
    assert.match(await cell().innerText(), /本地[\s\S]*未运行/); assert.equal(await cell().locator('.directory-env').count(), 1);
    await directoryAction(/启\s*动$/).waitFor({ state: 'visible' }); assert.equal(await directoryAction(/查看运行/).count(), 0);
    await cell().hover(); const popover = page.locator('.directory-popover:visible'); await popover.waitFor({ state: 'visible' });
    assert.deepEqual(await popover.locator('.directory-popover-section h4').allInnerTexts(), ['本地运行']); assert.doesNotMatch(await popover.innerText(), /QA|PROD|部署/);
    await capture(page, 'service-runtime-directory-popover.png');
    await popover.getByRole('button', { name: /查看本地运行/ }).click(); await section().waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('.asset-home-tabs:visible [role=tab]').allInnerTexts(), ['详情', '本地运行']); assert.equal(await section().getByRole('tab').count(), 0);
    // A direct address and a refresh must preserve the requested runtime view.
    await page.goto(`${workspaceUrl}/services/${frontend.id}?view=runtime`); await section().waitFor({ state: 'visible' });
    await page.reload(); await section().waitFor({ state: 'visible' });
    const serviceTabs = page.locator('.asset-home-tabs:visible');
    assert.equal(await serviceTabs.getByRole('tab', { name: '本地运行', exact: true }).getAttribute('aria-selected'), 'true');
    await serviceTabs.getByRole('tab', { name: '详情', exact: true }).click(); await section().waitFor({ state: 'hidden' });
    await serviceTabs.getByRole('tab', { name: '本地运行', exact: true }).click(); await section().waitFor({ state: 'visible' });
    const configuration = section().locator('#service-runtime-configuration');
    assert.match(await configuration.innerText(), /启动与连接配置/);
    assert.deepEqual(await configuration.locator('.runtime-configuration-connections dd').allInnerTexts(), [before.service.definition.local.backend.serviceCode, before.service.definition.local.backend.remoteUrl]);
    await configuration.getByRole('button', { name: /配置启动与连接$/ }).click();
    const discoveryDrawer = page.locator('#service-runtime-discovery-drawer'); await discoveryDrawer.waitFor({ state: 'visible' });
    await discoveryDrawer.getByRole('button', { name: '关闭', exact: true }).click(); await discoveryDrawer.waitFor({ state: 'hidden' });
    await section().getByRole('button', { name: '查看配置', exact: true }).click();
    const definitionDrawer = page.locator('#service-runtime-definition-drawer'); await definitionDrawer.waitFor({ state: 'visible' });
    const definition = before.service.definition; assert.ok(definition.path.length > 100, '实际夹具应覆盖长定义路径');
    const command = definitionDrawer.locator('pre[aria-label="启动命令参数数组"]');
    assert.deepEqual(JSON.parse((await command.textContent())!), definition.local.command, '展示命令必须保留空格、引号、反斜线及参数边界');
    assert.equal(definition.local.command.includes(QUOTED_ARGUMENT), true);
    const definitionLayout = await definitionDrawer.locator('.runtime-definition').evaluate(element => {
      const sections = [...element.children].map(section => section.getBoundingClientRect());
      const body = element.closest('.ant-drawer-body')!;
      return { gap: getComputedStyle(element).rowGap, gaps: sections.slice(1).map((section, index) => section.top - sections[index].bottom), overflowing: [body, element, ...element.querySelectorAll('.runtime-definition-paths, .runtime-definition-command, pre')].some(section => section.scrollWidth > section.clientWidth + 1) };
    });
    assert.equal(definitionLayout.gap, '24px'); assert.ok(definitionLayout.gaps.every(gap => Math.abs(gap - 24) <= 1), JSON.stringify(definitionLayout));
    assert.equal(definitionLayout.overflowing, false, '长路径和参数应换行，不扩大抽屉宽度');
    await capture(page, 'service-runtime-definition.png'); await definitionDrawer.getByRole('button', { name: '关闭', exact: true }).click(); await definitionDrawer.waitFor({ state: 'hidden' });
    await section().getByRole('button', { name: /启动本地/ }).click();
    const start = page.locator('#service-runtime-start-drawer'); await start.waitFor({ state: 'visible' });
    await assertCentered(page, modal());
    const source = start.locator(`[data-worktree-id="${main.id}"]`);
    assert.match(await source.innerText(), /主工作库[\s\S]*fixture-main[\s\S]*含未提交改动/);
    assert.equal(await source.locator('.runtime-start-path').getAttribute('title'), main.path);
    assert.equal(await start.getByRole('radio', { name: '远程测试环境', exact: true }).isChecked(), true);
    assert.equal(await start.getByRole('radio', { name: /本地后端/ }).isDisabled(), true, '没有已就绪本地后端时不能选择未知端口');
    assert.match(await start.locator('[data-connection-option="remote"]').innerText(), new RegExp(REMOTE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(await start.locator('.runtime-backend-options input:not([type="radio"])').count(), 0, '远程目标来自固定配置，不要求启动时输入地址');
    await capture(page, 'service-runtime-start-options.png');
    const launched = page.waitForResponse(response => response.url() === `${detailUrl}/runs` && response.request().method() === 'POST');
    await modal().getByRole('button', { name: '启动所选服务', exact: true }).click(); const launchResponse = await launched; assert.equal(launchResponse.status(), 200);
    const initial: ManagedRunRecord = await launchResponse.json(); await start.waitFor({ state: 'hidden' });
    await directoryAction(/查看运行/).waitFor({ state: 'visible', timeout: 3000 }); assert.equal(await directoryAction(/启\s*动$/).count(), 0);
    await page.locator(`.runtime-run-row:visible[data-run-id="${initial.id}"][data-run-status="running"]`).waitFor({ state: 'visible', timeout: 20_000 });
    const mainRun: ManagedRunRecord = (await detail()).service.runs.find((item: ManagedRunRecord) => item.id === initial.id);
    assert.equal(mainRun.origin, 'human'); assert.equal(mainRun.main, true); assert.equal(mainRun.dirty, true); assert.equal(mainRun.connection?.mode, 'remote'); assert.equal(mainRun.connection?.url, REMOTE_URL);
    assert.match(await card(mainRun.id).innerText(), /业务验证仍需执行/);
    await directoryAction(/查看运行/).scrollIntoViewIfNeeded();
    await capture(page, 'service-runtime-active-service.png');
    // The directory avoids duplicate starts; the detail still permits another actual checkout.
    await section().getByRole('button', { name: /启动本地/ }).click(); await start.waitFor({ state: 'visible' });
    await assertCentered(page, modal());
    const alternate = before.worktrees.find((item: any) => !item.main); assert.ok(alternate);
    await start.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '代码目录', exact: true }) }).locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: alternate.branch }).click();
    await start.locator(`[data-worktree-id="${alternate.id}"]`).waitFor({ state: 'visible' });
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' });
    assert.equal(await start.getByRole('radio', { name: /本地后端/ }).isDisabled(), true);
    await start.getByRole('radio', { name: '远程测试环境', exact: true }).check();
    assert.equal(await modal().getByRole('button', { name: '启动所选服务', exact: true }).isEnabled(), true);
    await capture(page, 'service-runtime-alternate-worktree.png');
    await modal().getByRole('button', { name: /取\s*消/ }).click(); await start.waitFor({ state: 'hidden' });
    await card(mainRun.id).getByRole('button', { name: /日志$/ }).click(); const logs = page.locator('#service-runtime-log-drawer');
    await page.waitForFunction(() => { const log = document.querySelector('#service-runtime-log-drawer .local-log-lines')?.textContent || ''; return log.includes('Started RuntimeFixture on') && log.includes('RuntimeFixture target https://'); });
    await logs.getByRole('textbox', { name: '搜索本实例日志', exact: true }).fill('RuntimeFixture target');
    assert.equal(await logs.getByRole('switch', { name: '跟随日志输出', exact: true }).getAttribute('aria-checked'), 'false');
    assert.equal(await logs.locator('.local-log-lines').innerText(), `RuntimeFixture target ${REMOTE_URL}`);
    await logs.getByRole('button', { name: /复制匹配日志$/ }).click(); await page.getByText('日志已复制', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `RuntimeFixture target ${REMOTE_URL}`); await capture(page, 'service-runtime-log-search.png');
    await page.locator('.ant-drawer-open .ant-drawer-footer').getByRole('button', { name: /关\s*闭/ }).click(); await logs.waitFor({ state: 'hidden' });
    const openLink = card(mainRun.id).getByRole('link', { name: /打开$/ }); assert.equal(await openLink.getAttribute('target'), '_blank'); assert.equal(new URL((await openLink.getAttribute('href'))!).href, new URL(mainRun.url).href);
    const currentUrl = page.url(); const [opened] = await Promise.all([page.waitForEvent('popup'), openLink.click()]);
    try { await opened.waitForLoadState('domcontentloaded'); assert.equal(await opened.locator('#backend-target').innerText(), REMOTE_URL); } finally { await opened.close(); }
    assert.equal(page.url(), currentUrl, '打开服务时保留当前运行页');
    await openTask(); const empty = await taskDetail(); assert.equal(empty.runs.length, 0); assert.equal(empty.services.length, 2);
    assert.equal(empty.services.every((item: any) => item.worktree?.taskId === taskId && item.worktree.main === false), true, JSON.stringify(empty));
    // Frontend-only remote never implicitly launches a backend.
    await taskPanel().getByRole('button', { name: /启动任务服务/ }).click();
    await taskStart().getByRole('checkbox', { name: backend.name, exact: true }).uncheck();
    assert.equal(await taskStart().getByRole('radio', { name: /本任务本地后端/ }).isDisabled(), true, '只启动前端时必须先有已就绪的本任务后端');
    await taskStart().getByRole('radio', { name: '远程测试环境', exact: true }).check();
    const remote = await startTask(); assert.deepEqual(remote.results.map((item: any) => item.serviceCode), [frontend.code]);
    const remoteRun: ManagedRunRecord = remote.results[0].run; assert.equal(remoteRun.connection?.mode, 'remote'); assert.equal((await taskDetail()).runs.some((run: ManagedRunRecord) => run.serviceCode === backend.code), false);
    await stopInUi(remoteRun);
    // Backend also starts independently; no frontend connection control remains selected.
    await taskPanel().getByRole('button', { name: /启动任务服务/ }).click(); await taskStart().getByRole('checkbox', { name: frontend.name, exact: true }).uncheck();
    assert.equal(await taskStart().getByRole('radio').count(), 0); const backendOnly = await startTask(); assert.deepEqual(backendOnly.results.map((item: any) => item.serviceCode), [backend.code]);
    let backendRun: ManagedRunRecord = backendOnly.results[0].run;
    await page.locator(`.runtime-run-row:visible[data-run-id="${backendRun.id}"][data-run-status="running"]`).waitFor({ state: 'visible', timeout: 20_000 });
    const readyTarget = (await taskDetail()).services.find((item: any) => item.service.code === frontend.code).connectionTarget;
    assert.equal(readyTarget.target.runId, backendRun.id); assert.equal(readyTarget.target.url, backendRun.url); assert.equal(readyTarget.reason, null);
    // An independently started backend enables frontend-only local startup with its actual port.
    await taskPanel().getByRole('button', { name: /启动任务服务/ }).click();
    assert.equal(await taskStart().getByRole('radio', { name: /本任务本地后端/ }).isChecked(), true);
    await taskStart().getByRole('checkbox', { name: backend.name, exact: true }).uncheck();
    assert.equal(await taskStart().getByRole('radio', { name: /本任务本地后端/ }).isEnabled(), true);
    assert.match(await taskStart().locator('[data-connection-option="local"]').innerText(), new RegExp(backendRun.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '本地选项应显示实际就绪实例地址');
    await capture(page, 'service-runtime-task-options.png'); const local = await startTask(); assert.deepEqual(local.results.map((item: any) => item.serviceCode), [frontend.code]);
    assert.deepEqual((await taskDetail()).runs.filter((run: ManagedRunRecord) => run.serviceCode === backend.code && isActiveRun(run)).map((run: ManagedRunRecord) => run.id), [backendRun.id], '单独启动前端不隐式新增或重启后端');
    let taskRun: ManagedRunRecord = local.results.find((item: any) => item.serviceCode === frontend.code).run;
    assert.equal(taskRun.connection?.runId, backendRun.id); assert.equal(taskRun.connection?.url, backendRun.url);
    const connected = await page.request.get(`${taskRun.url}/backend`); assert.equal(connected.status(), 200); assert.deepEqual(await connected.json(), { target: backendRun.url, backend: { fixture: 'runtime-backend', port: backendRun.actualPort } });
    await capture(page, 'service-runtime-task-local.png');
    const previousTaskRun = taskRun;
    await card(previousTaskRun.id).getByRole('button', { name: '切换连接', exact: true }).click();
    const switchOptions = page.locator('#service-runtime-start-drawer'); await switchOptions.waitFor({ state: 'visible' });
    await assertCentered(page, modal());
    assert.match(await switchOptions.innerText(), new RegExp(previousTaskRun.id));
    await switchOptions.getByRole('radio', { name: '远程测试环境', exact: true }).check();
    const switched = page.waitForResponse(response => response.url() === `${apiBase}/runs/${previousTaskRun.id}/restart` && response.request().method() === 'POST');
    await modal().getByRole('button', { name: '应用并重启当前前端', exact: true }).click();
    const switchResponse = await switched; assert.equal(switchResponse.status(), 200); taskRun = await switchResponse.json();
    await switchOptions.waitFor({ state: 'hidden' });
    await page.locator(`.runtime-run-row:visible[data-run-id="${taskRun.id}"][data-run-status="running"]`).waitFor({ state: 'visible', timeout: 20_000 });
    const switchedTask = await taskDetail();
    taskRun = switchedTask.runs.find((run: ManagedRunRecord) => run.id === taskRun.id);
    assert.equal(taskRun.taskId, taskId); assert.equal(taskRun.connection?.mode, 'remote'); assert.equal(taskRun.connection?.url, REMOTE_URL);
    assert.equal(switchedTask.runs.find((run: ManagedRunRecord) => run.id === previousTaskRun.id).status, 'stopped');
    assert.equal(switchedTask.runs.find((run: ManagedRunRecord) => run.id === backendRun.id).status, 'running', '切换前端不停止后端');
    // A target disappearing after the user saw it must not stop an otherwise usable frontend.
    await card(taskRun.id).getByRole('button', { name: '切换连接', exact: true }).click(); await switchOptions.waitFor({ state: 'visible' });
    await switchOptions.getByRole('radio', { name: /本地后端/ }).check();
    assert.match(await switchOptions.locator('[data-connection-option="local"]').innerText(), new RegExp(backendRun.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const preserved = { id: taskRun.id, pid: taskRun.pid, actualPort: taskRun.actualPort };
    // Delay only this real mutation request; no response or run state is fabricated.
    // This keeps the race deterministic even when background refresh disables a stale option.
    await page.route(`${apiBase}/runs/${taskRun.id}/restart`, async route => {
      assert.equal(route.request().postDataJSON().expectedBackendRunId, backendRun.id, '提交应校验弹窗已显示的具体后端实例');
      await fixture.application.stopRun(workspaceRoot, backendRun.id);
      assert.equal(await portReleased(backendRun.actualPort), true);
      await route.continue();
    }, { times: 1 });
    expectedBrowserErrors.add(`${apiBase}/runs/${taskRun.id}/restart`);
    const rejectedRestart = page.waitForResponse(response => response.url() === `${apiBase}/runs/${taskRun.id}/restart` && response.request().method() === 'POST');
    await modal().getByRole('button', { name: '应用并重启当前前端', exact: true }).click();
    const rejectedResponse = await rejectedRestart; assert.equal(rejectedResponse.status(), 409);
    await switchOptions.locator('.ant-alert-error').waitFor({ state: 'visible' });
    assert.equal(await switchOptions.isVisible(), true, '前置校验失败保留弹窗及可用前端');
    const afterRejected = (await taskDetail()).runs.find((run: ManagedRunRecord) => run.id === taskRun.id);
    assert.deepEqual({ id: afterRejected.id, pid: afterRejected.pid, actualPort: afterRejected.actualPort }, preserved);
    assert.equal(afterRejected.status, 'running'); assert.equal(afterRejected.connection.mode, 'remote');
    const preservedResponse = await page.request.get(taskRun.url); assert.equal(preservedResponse.status(), 200); assert.match(await preservedResponse.text(), new RegExp(REMOTE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await capture(page, 'service-runtime-switch-target-disappeared.png');
    await modal().getByRole('button', { name: /取\s*消/ }).click(); await switchOptions.waitFor({ state: 'hidden' });
    await stopInUi(taskRun);
    // From zero, one group action starts and waits for the backend before launching the frontend.
    await taskPanel().getByRole('button', { name: /启动任务服务/ }).click();
    assert.equal(await taskStart().getByRole('checkbox', { name: backend.name, exact: true }).isChecked(), true);
    assert.equal(await taskStart().getByRole('checkbox', { name: frontend.name, exact: true }).isChecked(), true);
    assert.equal(await taskStart().getByRole('radio', { name: /本任务本地后端/ }).isEnabled(), true, '整组启动仍可先启动所选后端');
    await taskStart().getByRole('radio', { name: /本任务本地后端/ }).check();
    const group = await startTask(); assert.deepEqual(group.results.map((item: any) => item.serviceCode), [backend.code, frontend.code]);
    assert.equal(group.results.some((item: any) => item.reused), false);
    backendRun = group.results.find((item: any) => item.serviceCode === backend.code).run;
    taskRun = group.results.find((item: any) => item.serviceCode === frontend.code).run;
    assert.equal(backendRun.status, 'running'); assert.equal(taskRun.connection?.runId, backendRun.id); assert.equal(taskRun.connection?.url, backendRun.url);
    const groupConnected = await page.request.get(`${taskRun.url}/backend`); assert.equal(groupConnected.status(), 200); assert.deepEqual(await groupConnected.json(), { target: backendRun.url, backend: { fixture: 'runtime-backend', port: backendRun.actualPort } });
    await capture(page, 'service-runtime-task-group-backend-first.png');
    await taskPanel().getByRole('button', { name: '停止本任务服务', exact: true }).click(); const confirm = page.locator('.ant-modal-confirm'); await confirm.waitFor({ state: 'visible' });
    await assertCentered(page, confirm);
    await capture(page, 'service-runtime-task-stop-confirm.png');
    assert.match(await confirm.innerText(), new RegExp(backendRun.id)); assert.match(await confirm.innerText(), new RegExp(taskRun.id)); assert.doesNotMatch(await confirm.innerText(), new RegExp(mainRun.id));
    await confirm.getByRole('button', { name: '停止运行', exact: true }).click(); await page.getByText('所选本地运行已停止', { exact: true }).waitFor({ state: 'visible' });
    assert.equal((await detail()).service.runs.find((run: ManagedRunRecord) => run.id === mainRun.id).status, 'running', '任务停止不能影响主工作库');
    assert.equal(await portReleased(backendRun.actualPort), true); assert.equal(await portReleased(taskRun.actualPort), true);
    await openService(); await directoryAction(/查看运行/).waitFor({ state: 'visible' }); await stopInUi(mainRun);
    await directoryAction(/启\s*动$/).waitFor({ state: 'visible', timeout: 3000 }); assert.equal(await directoryAction(/查看运行/).count(), 0);
    await directoryAction(/启\s*动$/).scrollIntoViewIfNeeded(); await capture(page, 'service-runtime-stopped-service.png');
    await section().getByText(/已结束的运行 ·/).click();
    await page.locator(`.runtime-run-row:visible[data-run-id="${mainRun.id}"][data-run-status="stopped"]`).waitFor({ state: 'visible' });
    for (const route of ['deployment-plan', 'deployments']) assert.equal((await page.request.get(`${detailUrl}/${route}`)).status(), 404);
    const session = await page.locator('meta[name="buildr-session"]').getAttribute('content'); assert.ok(session);
    assert.equal((await page.request.post(`${detailUrl}/deployments`, { headers: { origin: scope.origin, 'x-buildr-session': session }, data: {} })).status(), 404);
    assert.equal(await page.locator('#service-runtime-qa-drawer').count(), 0);
    for (const file of fixture.definitionFiles) assert.match(fs.readFileSync(file, 'utf8'), /retired-invalid-field/, '旧配置保持原样');
    await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture(page, 'service-runtime-mobile.png');
  } finally { await fixture.cleanup(); await page.setViewportSize({ width: 1280, height: 720 }); }
}
