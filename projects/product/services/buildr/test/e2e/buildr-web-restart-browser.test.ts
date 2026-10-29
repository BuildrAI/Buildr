import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopAgentProcess } from '@buildr-ai/buildr-agent';
import type { Page, Route } from 'playwright-core';
import { materializeCleanProductSource } from '../helpers/clean-product-source.ts';
import { launchTestBrowser } from './browser-launch.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function receiptAt(file: string, previousPid?: number): Promise<any> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.url && value.secret && value.pid && value.pid !== previousPid) return value;
    } catch {}
    await wait(50);
  }
  throw new Error('隔离浏览器实例未在预算内发布新回执。');
}

async function confirmRestart(page: Page, retry = false): Promise<void> {
  if (retry) await page.locator('#restart-again').click();
  else {
    await page.locator('#more-actions').hover();
    await page.locator('#restart-buildr').click();
  }
  const modal = page.locator('.ant-modal-confirm');
  await modal.waitFor();
  assert.match(await modal.innerText(), /独立智能体（Agent）执行服务不会被强制停止/);
  await modal.locator('.ant-btn-primary').click();
  await modal.waitFor({ state: 'hidden' });
}

test('真实生产页面重启恢复、已知失败真正重试及未知状态继续连接', { timeout: 240_000 }, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-restart-browser-'));
  const appData = path.join(base, 'app-data'), productData = path.join(base, 'product-data');
  const controller = materializeCleanProductSource(serviceRoot, path.join(base, 'controller'));
  const distRoot = path.join(serviceRoot, 'web-dist');
  assert.ok(fs.existsSync(path.join(distRoot, 'index.html')), '需要本次真实生产前端构建产物');
  fs.cpSync(distRoot, path.join(controller.root, 'web-dist'), { recursive: true });
  const instanceFile = path.join(appData, 'instance.json');
  const environment = { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: productData, BUILDR_NPM_ENTRY_PATH: controller.cli };
  const child = spawn(process.execPath, [controller.cli, 'web', '--no-open', '--port', '0'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  let browser: Awaited<ReturnType<typeof launchTestBrowser>> | undefined;
  t.after(async () => {
    await browser?.close();
    try {
      const deadline = Date.now() + 15_000;
      while (fs.existsSync(instanceFile)) {
        const state = JSON.parse(fs.readFileSync(instanceFile, 'utf8'));
        assert.equal(state.productIdentity?.sourceRoot, controller.root, '只清理当前隔离源码实例');
        try {
          const response = await fetch(`${state.url}/api/v1/app/quit-instance`, { method: 'POST', headers: { 'x-buildr-instance': state.secret }, signal: AbortSignal.timeout(1000) });
          await response.arrayBuffer();
          assert.ok([202, 409, 503].includes(response.status));
        } catch (error) { if (Date.now() >= deadline) throw error; }
        if (Date.now() >= deadline) throw new Error('隔离网页实例未确认退出。');
        await wait(50);
      }
    } finally {
      await stopAgentProcess({ dataRoot: appData });
      if (child.exitCode === null) child.kill('SIGTERM');
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  const first = await receiptAt(instanceFile).catch(error => { throw new Error(`${error.message}\n${output}`); });
  assert.notEqual(new URL(first.url).port, '4458', '不能使用日常开发端口');
  browser = await launchTestBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const screenshot = async (target: Page, name: string) => {
    if (!process.env.BUILDR_SCREENSHOT_DIR) return;
    fs.mkdirSync(process.env.BUILDR_SCREENSHOT_DIR, { recursive: true });
    await target.screenshot({ path: path.join(process.env.BUILDR_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  let currentPage = page, scenarioNumber = 0;
  const runScenario = (name: string, action: () => Promise<void>) => t.test(name, async () => {
    scenarioNumber += 1;
    try { await action(); }
    catch (error) {
      await screenshot(currentPage, `restart-browser-failure-${scenarioNumber}`).catch(() => {});
      throw error;
    }
  });
  const tokenOf = (target: Page) => target.locator('meta[name="buildr-session"]').getAttribute('content');
  const waitForPageRecovery = async (previousToken: string | null) => {
    await page.waitForFunction(token => {
      const current = document.querySelector('meta[name="buildr-session"]')?.getAttribute('content');
      return current && current !== token && !document.getElementById('restart-screen');
    }, previousToken, { timeout: 60_000 });
    await page.locator('#more-actions').waitFor();
  };

  await runScenario('真实点击重启后新进程接管原端口且页面自动恢复', async () => {
    await page.goto(first.url);
    await page.locator('#more-actions').waitFor();
    const previousToken = await tokenOf(page);
    await confirmRestart(page);
    await waitForPageRecovery(previousToken);
    const next = await receiptAt(instanceFile, first.pid);
    assert.equal(next.url, first.url);
    assert.notEqual(next.pid, first.pid);
    await screenshot(page, 'restart-browser-recovered');
  });

  await runScenario('注入首个后继失败后展示原因，重新重启发起真实请求并恢复', async () => {
    await page.goto(first.url);
    await page.locator('#more-actions').waitFor();
    const before = await receiptAt(instanceFile);
    const previousToken = await tokenOf(page);
    let simulatedFailure = true, posts = 0;
    const restartRoute = async (route: Route) => {
      posts += 1;
      if (simulatedFailure) await route.fulfill({ status: 202, contentType: 'application/json', body: '{"status":"restarting"}' });
      else await route.continue();
    };
    const statusRoute = async (route: Route) => {
      if (simulatedFailure) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'failed', error: { code: 'browser_restart_fixture_failure', message: '浏览器测试注入的后继启动失败。' } }) });
      else await route.continue();
    };
    // Only the first request/result is injected. Retry crosses the actual CLI,
    // authenticated shutdown, successor process and production page boundary.
    await page.route('**/api/v1/app/restart', restartRoute);
    await page.route('**/api/v1/app/restart-status', statusRoute);
    try {
      await confirmRestart(page);
      await page.locator('#restart-again').waitFor();
      assert.match(await page.locator('#restart-buildr-error').innerText(), /浏览器测试注入的后继启动失败/);
      assert.equal(posts, 1);
      assert.equal((await receiptAt(instanceFile)).pid, before.pid, '失败注入保留原服务');
      await screenshot(page, 'restart-browser-failed');
      simulatedFailure = false;
      await confirmRestart(page, true);
      await waitForPageRecovery(previousToken);
      const next = await receiptAt(instanceFile, before.pid);
      assert.equal(next.url, before.url);
      assert.equal(posts, 2, '重新重启必须真正再次POST');
    } finally {
      await page.unroute('**/api/v1/app/restart', restartRoute);
      await page.unroute('**/api/v1/app/restart-status', statusRoute);
    }
  });

  await runScenario('原地址无法确认时仅继续观察，不冒称仍在重启或再次POST', async () => {
    await page.goto(first.url);
    await page.locator('#more-actions').waitFor();
    let posts = 0;
    await page.clock.install();
    await page.route('**/api/v1/app/restart', async route => { posts += 1; await route.fulfill({ status: 202, contentType: 'application/json', body: '{"status":"restarting"}' }); });
    await page.route('**/api/v1/app/restart-status', route => route.abort());
    await page.route(url => url.href === `${first.url}/`, route => route.abort());
    await confirmRestart(page);
    await page.locator('#restart-screen').waitFor();
    await page.clock.fastForward(31_000);
    await page.getByRole('heading', { name: '尚未确认重启完成', exact: true }).waitFor();
    assert.equal(await page.locator('#restart-again').count(), 0);
    assert.match(await page.locator('#restart-screen').innerText(), /重新打开 Buildr Web 应用/);
    await screenshot(page, 'restart-browser-unknown');
    await page.locator('#restart-retry').click();
    await page.clock.fastForward(31_000);
    await page.getByRole('heading', { name: '尚未确认重启完成', exact: true }).waitFor();
    assert.equal(posts, 1, '继续等待不得重新发起重启');
    await page.close();
  });

  await runScenario('首次POST响应挂起也有截止，并提供只观察连接的恢复入口', async () => {
    const waitingPage = await context.newPage();
    currentPage = waitingPage;
    let posts = 0;
    const held: Route[] = [];
    let observePost: (() => void) | undefined;
    const postObserved = new Promise<void>(resolve => { observePost = resolve; });
    await waitingPage.goto(first.url);
    await waitingPage.locator('#more-actions').waitFor();
    await waitingPage.clock.install();
    await waitingPage.route('**/api/v1/app/restart', async route => { posts += 1; held.push(route); observePost?.(); });
    await waitingPage.route('**/api/v1/app/restart-status', route => route.abort());
    await waitingPage.route(url => url.href === `${first.url}/`, route => route.abort());
    try {
      await confirmRestart(waitingPage);
      await postObserved;
      assert.equal(posts, 1);
      await waitingPage.clock.fastForward(5100);
      await waitingPage.getByRole('heading', { name: '尚未确认重启完成', exact: true }).waitFor();
      assert.match(await waitingPage.locator('#restart-screen').innerText(), /请求超过预期时间/);
      assert.equal(await waitingPage.locator('#restart-again').count(), 0);
      await screenshot(waitingPage, 'restart-browser-request-timeout');
      await waitingPage.locator('#restart-retry').click();
      await waitingPage.clock.fastForward(31_000);
      await waitingPage.getByRole('heading', { name: '尚未确认重启完成', exact: true }).waitFor();
      assert.equal(posts, 1);
    } finally {
      for (const route of held) await route.abort().catch(() => {});
    }
    await waitingPage.close();
  });
});
