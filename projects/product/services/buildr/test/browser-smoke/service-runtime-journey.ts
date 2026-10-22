import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import type { Page } from 'playwright-core';

type Context = { page: Page; workspaceRoot: string; workspaceUrl: string; service: { id: string; name: string; code: string }; capture: (page: Page, name: string) => Promise<unknown> };
type Run = { id: string; status: string; actualPort: number; pid: number; worktreeLabel: string };

const SERVER_SOURCE = `import http from 'node:http';
const argument = process.argv.find(item => item.startsWith('--port='));
const port = Number(argument ? argument.slice('--port='.length) : 0);
http.createServer((_request, response) => response.end('runtime fixture ok')).listen(port, '127.0.0.1', () => {
  console.log('Started RuntimeFixture on ' + port);
});
setInterval(() => {}, 1000);
`;

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} 失败：${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function portReleased(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 服务运行与部署：目录状态列、详情运行区块、启动/日志/配置/QA 抽屉与真实受管进程生命周期。 */
export async function runServiceRuntimeJourney({ page, workspaceRoot, workspaceUrl, service, capture }: Context) {
  const scope = new URL(workspaceUrl);
  const apiBase = `${scope.origin}/api/v1${scope.pathname}`;
  const detailUrl = `${apiBase}/service-runtime/services/${encodeURIComponent(service.code)}`;
  const read = async (target: string) => {
    const response = await page.request.get(target);
    assert.equal(response.status(), 200, `${target} 必须可读`);
    return response.json();
  };
  const realRoot = fs.realpathSync(workspaceRoot);
  await page.goto(`${workspaceUrl}/services`);
  const session = await page.locator('meta[name="buildr-session"]').getAttribute('content');
  assert.ok(session, '页面必须提供当前 session，写请求才可核对来源');
  const writeHeaders = { origin: scope.origin, 'x-buildr-session': session, 'content-type': 'application/json' };
  // 受管运行必须落在真实检出目录中；服务夹具本身没有初始化仓库，全量夹具已有基线提交。
  // 空提交即可提供分支与 HEAD：夹具里存在其他测试留下的嵌套仓库，不能整目录入索引。
  if (!fs.existsSync(path.join(realRoot, '.git'))) {
    git(realRoot, ['init', '-q', '--initial-branch=main']);
    git(realRoot, ['config', 'user.name', 'Buildr Browser Fixture']);
    git(realRoot, ['config', 'user.email', 'fixture@example.com']);
    git(realRoot, ['commit', '-q', '--allow-empty', '-m', 'service runtime fixture baseline']);
  }

  const before = await read(detailUrl);
  assert.equal(before.service.definition, null, '夹具开始时没有运行定义');
  assert.equal(before.service.environments.qa.defined, false);
  const main = before.worktrees.find((item: any) => item.main);
  assert.ok(main, '登记代码库必须提供主检出，服务运行才能确定工作目录');
  const integrationBranch: string = main.branch;
  assert.ok(integrationBranch, '主检出必须有分支，部署默认才可以使用登记集成分支');

  const serverFile = path.join(main.path, 'runtime-fixture-server.mjs');
  const definitionFile = path.join(realRoot, 'services', service.code, 'runtime.yml');
  const deploymentFile = path.join(realRoot, '.buildr', 'local', 'service-runtime', 'deployments', `${service.code}.json`);
  assert.equal(fs.existsSync(serverFile), false, '不得覆盖其他夹具的运行脚本');
  assert.equal(fs.existsSync(definitionFile), false, '不得覆盖其他夹具已有运行定义');
  fs.writeFileSync(serverFile, SERVER_SOURCE);
  fs.mkdirSync(path.dirname(definitionFile), { recursive: true });
  const preferredPort = 18600 + (process.pid % 300);
  fs.writeFileSync(definitionFile, `version: 1
source: agent
verifiedAt: '${new Date().toISOString()}'
local:
  command:
    - ${process.execPath}
    - runtime-fixture-server.mjs
  cwd: .
  profile: fixture
  preferredPort: ${preferredPort}
  portOverride: --port
  readiness:
    kind: log
    pattern: Started RuntimeFixture on
  timeoutSeconds: 60
environments:
  qa:
    connectionId: runtime-fixture-cicd
    program: deploy
    target: 夹具部署目标
    targetRef: RUNTIME-FIXTURE-QA
    integrationBranch: ${integrationBranch}
    timeoutSeconds: 30
  prod:
    connectionId: runtime-fixture-cicd
    program: deploy
    target: 夹具生产目标
    targetRef: RUNTIME-FIXTURE-PROD
    integrationBranch: main
    timeoutSeconds: 30
`);

  const directory = () => page.locator('#service-table-wrap');
  const rows = () => page.locator('#service-table-body tr.resource-directory-row');
  const row = () => rows().filter({ has: page.locator(`a[href*="/services/${service.id}"]`) });
  const cell = () => row().locator(`[data-service-runtime-status="${service.code}"]`);
  const popover = () => page.locator('.directory-popover:visible');
  const section = () => page.locator('#service-runtime-section:visible');
  const tab = (label: string) => section().getByRole('tab', { name: label, exact: true });
  const openRuntimeTab = async () => {
    await page.getByRole('tab', { name: '运行与部署', exact: true }).click();
    await section().waitFor({ state: 'visible' });
  };
  const filter = (label: string) => page.locator('#service-runtime-filter').getByText(label, { exact: true });
  // 抽屉 id 落在正文节点上，底部操作按当前打开的抽屉定位。
  const footer = () => page.locator('.ant-drawer-open .ant-drawer-footer');
  let started: Run | null = null;
  try {
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto(`${workspaceUrl}/services?project=demo`);
    await rows().first().waitFor({ state: 'visible' });
    assert.deepEqual(await directory().locator('thead th').allInnerTexts(), ['服务 / 说明', '关联项目', '代码库', '运行与部署', '操作']);
    assert.equal(await row().count(), 1, '当前服务在目录中只有一行');
    await cell().waitFor({ state: 'visible' });
    assert.equal(await cell().locator('.directory-env').count(), 2, '状态列固定两行，其余环境进入浮窗');
    assert.match(await cell().innerText(), /本地[\s\S]*未运行/);
    assert.match(await cell().innerText(), /QA[\s\S]*未部署[\s\S]*另 1 个环境/, '已登记的其他环境以计数提示进入浮窗');
    const heights = await rows().evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().height)));
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 2, `服务行高必须保持一致：${heights.join('/')}`);

    await cell().hover();
    await popover().waitFor({ state: 'visible' });
    assert.deepEqual(await popover().locator('.directory-popover-section h4').allInnerTexts(), ['本地运行', 'QA 部署', 'PROD 部署']);
    assert.match(await popover().innerText(), /当前没有运行实例/);
    assert.match(await popover().innerText(), /还没有提交过部署/);
    await capture(page, 'service-runtime-directory-popover.png');

    await filter('只看运行中').click();
    await page.getByRole('button', { name: '清除筛选', exact: true }).waitFor({ state: 'visible' });
    assert.match(await page.locator('.resource-directory-count').innerText(), /^0 \/ \d+ 个服务$/);
    await page.getByText('当前没有运行中的服务', { exact: true }).waitFor({ state: 'visible' });
    await filter('全部服务').click();
    await cell().waitFor({ state: 'visible' });

    await row().getByRole('button', { name: '启动' }).click();
    const startDrawer = page.locator('#service-runtime-start-drawer');
    const worktreeRow = startDrawer.locator(`[data-worktree-id="${main.id}"]`);
    await worktreeRow.waitFor({ state: 'visible' });
    assert.match(await worktreeRow.innerText(), /主检出/);
    assert.match(await worktreeRow.innerText(), new RegExp(integrationBranch));
    assert.match(await worktreeRow.innerText(), /未提交改动/, '夹具脚本尚未提交，启动前必须如实提示');
    await capture(page, 'service-runtime-start-drawer.png');
    await worktreeRow.getByRole('button', { name: '启动' }).click();
    await page.locator('.ant-message').getByText(/已启动 主检出，端口 :/).waitFor({ state: 'visible' });
    await worktreeRow.getByRole('button', { name: '已在运行', exact: true }).waitFor({ state: 'visible' });
    const afterStart = await read(detailUrl);
    started = afterStart.service.runs.find((item: Run) => item.worktreeLabel === '主检出' && item.status !== 'stopped' && item.status !== 'failed') ?? null;
    assert.ok(started, '启动后必须能读到受管运行记录');
    assert.ok(started.actualPort >= preferredPort, '端口由 Buildr 分配，首选被占用时避让');
    await footer().getByRole('button', { name: /取\s*消/ }).click();
    await startDrawer.waitFor({ state: 'hidden' });

    await cell().locator('.run-dot').waitFor({ state: 'visible' });
    assert.match(await cell().innerText(), /1 个运行中/);
    assert.match(await cell().innerText(), new RegExp(`:${started.actualPort}`));
    await filter('只看运行中').click();
    await page.waitForFunction(() => document.querySelectorAll('#service-table-body tr.resource-directory-row').length === 1);
    assert.match(await page.locator('.resource-directory-count').innerText(), /^1 \/ \d+ 个服务$/);
    await filter('全部服务').click();
    await cell().waitFor({ state: 'visible' });

    await cell().hover();
    await popover().waitFor({ state: 'visible' });
    assert.match(await popover().innerText(), /主检出/);
    await popover().getByRole('button', { name: /查看服务详情/ }).click();
    await page.locator('.asset-home-tabs [role=tab]').first().waitFor({ state: 'visible' });
    assert.deepEqual(await page.locator('.asset-home-tabs [role=tab]').allInnerTexts(), ['详情', '运行与部署'], '服务详情先展示详情，运行与部署在第二个页签');
    await openRuntimeTab();
    assert.match(await section().locator('.runtime-source').innerText(), new RegExp(`智能体发现[\\s\\S]*services/${service.code}/runtime\\.yml[\\s\\S]*验证于`));
    const runRow = section().locator(`.runtime-run-row[data-run-id="${started.id}"]`);
    await runRow.waitFor({ state: 'visible' });
    await section().locator(`.runtime-run-row[data-run-id="${started.id}"][data-run-status="running"]`).waitFor({ state: 'visible', timeout: 20_000 });
    assert.match(await runRow.locator('.runtime-run-title').innerText(), new RegExp(`运行中[\\s\\S]*:${started.actualPort}`));
    assert.match(await runRow.locator('.runtime-run-sub').innerText(), /使用首选端口|已避让/);
    assert.equal(await runRow.locator('.runtime-run-sub code').getAttribute('title'), main.path, '运行记录必须指向真实检出目录');
    const facts = await section().locator('.runtime-local-facts').innerText();
    assert.match(facts, /启动命令[\s\S]*runtime-fixture-server\.mjs/);
    assert.match(facts, new RegExp(`端口[\\s\\S]*首选 ${preferredPort}`));
    assert.match(facts, /就绪检查[\s\S]*Started RuntimeFixture on[\s\S]*60s 内/);
    assert.match(await section().locator('.runtime-notes').first().innerText(), /不管理 Nacos 注册、流量或 MQ/);
    assert.deepEqual(await section().getByRole('tab').allInnerTexts(), ['本地运行', 'QA 部署', 'PROD 部署'], '本地与各环境以同一区块页签切换');

    await runRow.getByRole('button', { name: '日志' }).click();
    const logDrawer = page.locator('#service-runtime-log-drawer');
    await logDrawer.locator('.local-log-lines').waitFor({ state: 'visible' });
    await page.waitForFunction(() => (document.querySelector('#service-runtime-log-drawer .local-log-lines')?.textContent || '').includes('Started RuntimeFixture on'), undefined, { timeout: 20_000 });
    assert.match(await logDrawer.locator('.local-log-lines').innerText(), new RegExp(`Started RuntimeFixture on ${started!.actualPort}`));
    assert.match(await logDrawer.locator('.local-logs-note').last().innerText(), /标准输出与错误输出/);
    await capture(page, 'service-runtime-log-drawer.png');
    await footer().getByRole('button', { name: /关\s*闭/ }).click();
    await logDrawer.waitFor({ state: 'hidden' });

    await section().locator('.runtime-source').getByRole('button', { name: '重新配置' }).click();
    const discovery = page.locator('#service-runtime-discovery-drawer');
    await discovery.locator('.discovery-steps').waitFor({ state: 'visible' });
    const prompt = await discovery.getByRole('textbox', { name: '运行配置指令', exact: true }).inputValue();
    assert.match(prompt, new RegExp(`services/${service.code}/runtime\\.yml`));
    assert.match(prompt, /不要部署，不要读取连接秘密/);
    await footer().getByRole('button', { name: /关\s*闭/ }).click();
    await discovery.waitFor({ state: 'hidden' });

    await tab('QA 部署').click();
    const qaCard = section().locator('.runtime-environment-card[data-environment="qa"]');
    await qaCard.waitFor({ state: 'visible' });
    assert.match(await qaCard.innerText(), /夹具部署目标[\s\S]*RUNTIME-FIXTURE-QA/);
    assert.match(await qaCard.innerText(), new RegExp(`集成分支[\\s\\S]*${integrationBranch}`));
    assert.match(await qaCard.innerText(), /还没有提交过部署/);
    await tab('PROD 部署').click();
    const prodCard = section().locator('.runtime-environment-card[data-environment="prod"]');
    await prodCard.waitFor({ state: 'visible' });
    assert.match(await prodCard.innerText(), /夹具生产目标[\s\S]*RUNTIME-FIXTURE-PROD/);
    assert.match(await prodCard.innerText(), /页面首期只提交 QA/);
    assert.equal(await prodCard.getByRole('button', { name: /部署到/ }).count(), 0, '首期页面只为 QA 提供提交入口');
    assert.match(await section().locator('.runtime-scope-note').innerText(), /首期页面只提供本地运行与 QA 部署提交/);
    await capture(page, 'service-runtime-section.png');
    await tab('本地运行').click();

    await page.goto(`${workspaceUrl}/overview`);
    const rail = page.locator('#workbench-local-runs');
    await rail.locator('.workbench-run-row').first().waitFor({ state: 'visible' });
    const railLink = rail.locator('.workbench-run-row a');
    assert.equal(await railLink.count(), 1, '工作台只读列出当前受管运行');
    assert.match(await railLink.getAttribute('href')!, new RegExp(`/services/${service.id}`));
    assert.match(await railLink.innerText(), new RegExp(`${service.name}[\\s\\S]*主检出[\\s\\S]*:${started.actualPort}`));
    assert.match(await rail.innerText(), /只读状态；启动、停止和日志在服务页管理/);
    await capture(page, 'service-runtime-workbench.png');

    await page.goto(`${workspaceUrl}/services?project=demo`);
    await cell().hover();
    await popover().waitFor({ state: 'visible' });
    await popover().getByRole('button', { name: /查看服务详情/ }).click();
    await openRuntimeTab();
    await runRow.waitFor({ state: 'visible' });
    await runRow.getByRole('button', { name: '停止' }).click();
    const modal = page.locator('.ant-modal-confirm');
    await modal.waitFor({ state: 'visible' });
    assert.match(await modal.innerText(), /停止 主检出 的本地运行？/);
    assert.match(await modal.innerText(), new RegExp(`端口 :${started.actualPort} 随后释放`));
    await modal.getByRole('button', { name: '停止运行', exact: true }).click();
    await page.locator('.ant-message').getByText('已停止本地运行').waitFor({ state: 'visible' });
    await section().locator(`.runtime-run-row[data-run-id="${started.id}"][data-run-status="stopped"]`).waitFor({ state: 'visible' });
    const stopped = (await read(detailUrl)).service.runs.find((item: Run) => item.id === started!.id);
    assert.equal(stopped.status, 'stopped');
    for (let attempt = 0; attempt < 50 && processAlive(stopped.pid); attempt += 1) await wait(100);
    assert.equal(processAlive(stopped.pid), false, '停止必须真正结束托管进程');
    assert.equal(await portReleased(stopped.actualPort), true, '停止后端口必须释放');
    started = null;

    await tab('QA 部署').click();
    await qaCard.waitFor({ state: 'visible' });
    await qaCard.getByRole('button', { name: '部署到 QA' }).click();
    const qaDrawer = page.locator('#service-runtime-qa-drawer');
    await qaDrawer.locator('.qa-branch-field').waitFor({ state: 'visible' });
    assert.equal(await qaDrawer.locator('.qa-branch-field .ant-select-selection-item').innerText(), integrationBranch, '默认使用登记集成分支');
    assert.match(await qaDrawer.innerText(), /连接实例不可用/);
    assert.match(await qaDrawer.innerText(), /未读取/, '没有远端提交时不得伪造计划版本');
    assert.match(await qaDrawer.innerText(), /有未提交改动/);
    assert.match(await qaDrawer.innerText(), /本地未提交改动不会进入这次部署/);
    assert.match(await qaDrawer.innerText(), /读取连接实例 runtime-fixture-cicd 失败/);
    assert.match(await qaDrawer.innerText(), /请求受理不等于部署成功/);
    assert.match(await qaDrawer.innerText(), /只需新连接技能实现同一部署适配器契约/);
    assert.equal(await footer().getByRole('button', { name: '确认部署到 QA' }).isEnabled(), false, '提供者不可用时不得提交');
    await capture(page, 'service-runtime-qa-drawer.png');
    await footer().getByRole('button', { name: /取\s*消/ }).click();
    await qaDrawer.waitFor({ state: 'hidden' });

    // 最近部署结果由外部系统提交产生；夹具直接写产品自己的状态文件，验证已提交与未知两种界面表达。
    const externalUrl = 'https://cicd.fixture.invalid/pipelines/4242';
    const deploymentRecord = (state: string, extra: Record<string, unknown> = {}) => ({
      id: `deploy-fixture-${state}`, serviceId: service.id, serviceCode: service.code, environment: 'qa',
      target: '夹具部署目标', targetRef: 'RUNTIME-FIXTURE-QA', branch: integrationBranch, commit: '3f2a1c9d0e1b2a3f',
      submittedAt: new Date().toISOString(), provider: { connectionId: 'runtime-fixture-cicd', revision: 'fixture-revision', program: 'deploy' },
      state, version: `${integrationBranch}@3f2a1c9`, at: new Date().toISOString(), externalUrl: null, diagnostics: [], ...extra,
    });
    const seedDeployment = (state: string, extra: Record<string, unknown> = {}) => {
      fs.mkdirSync(path.dirname(deploymentFile), { recursive: true });
      fs.writeFileSync(deploymentFile, JSON.stringify({ schemaVersion: 'buildr.service-deployment-state/v1', serviceCode: service.code, latest: { qa: deploymentRecord(state, extra) } }, null, 2));
    };
    const openDetail = async () => {
      await page.goto(`${workspaceUrl}/services?project=demo`);
      await cell().waitFor({ state: 'visible' });
      await row().locator('a[href*="/services/"]').first().click();
      await openRuntimeTab();
      await tab('QA 部署').click();
      await qaCard.waitFor({ state: 'visible' });
    };

    seedDeployment('submitted', { externalUrl });
    await openDetail();
    assert.match(await cell().innerText(), new RegExp(`QA[\\s\\S]*已提交，构建中[\\s\\S]*${integrationBranch}@3f2a1c9`));
    assert.match(await qaCard.innerText(), /已提交，构建和部署正在进行[\s\S]*不复制外部系统的进度、历史和日志页面/);
    assert.match(await qaCard.innerText(), new RegExp(`最近结果[\\s\\S]*已提交，构建中[\\s\\S]*${integrationBranch}@3f2a1c9`));
    const submittedLink = qaCard.locator('.runtime-submitted a');
    assert.equal(await submittedLink.getAttribute('href'), externalUrl, '提交后只保留外部系统入口');
    assert.equal(await submittedLink.getAttribute('target'), '_blank');
    await cell().hover();
    await popover().waitFor({ state: 'visible' });
    assert.match(await popover().innerText(), /已提交，构建中/);
    await capture(page, 'service-runtime-qa-submitted.png');

    seedDeployment('unknown', { externalUrl, diagnostics: ['夹具：部署程序超时，未读取到符合契约的结果。'] });
    await openDetail();
    assert.match(await cell().innerText(), /QA[\s\S]*未知/);
    assert.match(await qaCard.innerText(), /最近一次提交结果未知[\s\S]*夹具：部署程序超时，未读取到符合契约的结果。/);
    assert.equal(await qaCard.locator('a[href]').first().getAttribute('href'), externalUrl, '结果未知时同样只给外部系统入口');
    await capture(page, 'service-runtime-qa-unknown.png');
    await page.getByRole('button', { name: '关闭 服务详情', exact: true }).click();
    fs.rmSync(deploymentFile, { force: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${workspaceUrl}/services?project=demo`);
    await directory().waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '窄屏目录不得横向溢出');
    await row().locator('a[href*="/services/"]').first().click();
    await openRuntimeTab();
    await section().locator('.runtime-run-row').first().waitFor({ state: 'visible' });
    assert.match(await section().locator('.runtime-run-row').first().innerText(), /已停止/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '窄屏详情与运行区块不得横向溢出');
    await capture(page, 'service-runtime-mobile.png');
    await page.getByRole('button', { name: '关闭 服务详情', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
  } finally {
    if (started) {
      await page.request.post(`${apiBase}/service-runtime/runs/${encodeURIComponent(started.id)}/stop`, { headers: writeHeaders, data: {} }).catch(() => undefined);
      const record = await read(detailUrl).then(value => value.service.runs.find((item: Run) => item.id === started!.id)).catch(() => null);
      for (let attempt = 0; attempt < 30 && record && processAlive(record.pid); attempt += 1) await wait(100);
    }
    fs.rmSync(serverFile, { force: true });
    fs.rmSync(definitionFile, { force: true });
    fs.rmSync(deploymentFile, { force: true });
  }
}
