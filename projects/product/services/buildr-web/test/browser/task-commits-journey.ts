import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Real temporary Git histories exercise the production host and feature client.
// Only the explicit network failure/delay scenarios intercept requests; successful
// commit responses always come from the production query.
export async function runTaskCommitsJourney({ t, page, runtime, workspaceRoot, workspaceUrl, expectedBrowserErrors, capture }: any) {
  const taskId = 'browser-commits', parentId = 'browser-commits-parent', emptyId = 'browser-commits-empty';
  const mirror = path.join(workspaceRoot, 'repositories', 'commit-mirror');
  function git(root: string, args: string[], at?: string) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...(at ? { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } : {}) } });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    return result.stdout.trim();
  }
  function commit(id: string, subject: string, at: string) {
    git(workspaceRoot, ['-c', 'user.name=Buildr Commit Fixture', '-c', 'user.email=commits@example.com', 'commit', '--allow-empty', '-qm', `${subject}\n\n真实本机提交，用于验证任务关联与完整复制。\n\nBuildr-Task: ${id}`], at);
    return git(workspaceRoot, ['rev-parse', 'HEAD']);
  }
  fs.mkdirSync(mirror, { recursive: true });
  git(mirror, ['init', '-q']);
  let catalog = runtime.assetCatalog(workspaceRoot);
  if (catalog.migrationRequired) catalog = runtime.migrateAssetCatalog(workspaceRoot, { revision: catalog.revision });
  catalog = runtime.createCatalogRepository(workspaceRoot, { revision: catalog.revision, code: 'commit-mirror', name: '提交验证镜像', path: 'repositories/commit-mirror' });
  const repositoryId = catalog.repositories.find((item: any) => item.code === 'commit-mirror').id;
  catalog = runtime.createCatalogService(workspaceRoot, { revision: catalog.revision, service: { code: 'commit-mirror', name: '提交验证服务', repositoryId } });
  const serviceId = catalog.services.find((item: any) => item.code === 'commit-mirror').id;
  runtime.createCatalogProject(workspaceRoot, { revision: catalog.revision, code: 'commits-fixture', name: '提交关联验证', serviceIds: [serviceId] });
  const scope = { projects: ['commits-fixture'], services: ['commits-fixture/commit-mirror'], changes: [] };
  for (const [id, title] of [[parentId, '提交关联组合任务'], [taskId, '提交关联普通任务'], [emptyId, '尚无提交的任务']]) runtime.createTask(workspaceRoot, { taskId: id, title, intent: '检查真实本机提交与任务编码的双向关联。', ...scope, ...(id === taskId ? { parentTaskId: parentId } : {}) });
  const parentHash = commit(parentId, 'docs(parent): 保存组合任务自己的提交', '2026-09-27T08:00:00Z');
  const sharedHash = commit(taskId, 'feat(task): 在两个仓库保留同一提交', '2026-09-27T08:01:00Z');
  git(mirror, ['fetch', '-q', workspaceRoot, 'HEAD']);
  git(mirror, ['update-ref', 'refs/heads/fixture', 'FETCH_HEAD']);
  git(mirror, ['symbolic-ref', 'HEAD', 'refs/heads/fixture']);
  const latestHash = commit(taskId, 'fix(task): 保留尚未推送的最新提交', '2026-09-27T08:02:00Z');
  const body = () => page.locator('#task-detail-main:visible');
  const open = async (id: string) => {
    await page.goto(`${workspaceUrl}/tasks/${id}`);
    await body().getByRole('tab', { name: '提交记录', exact: true }).click();
  };
  const rows = () => body().locator('.task-commits-row');
  const loaded = async (count: number) => { await rows().nth(count - 1).waitFor({ state: 'visible' }); assert.equal(await rows().count(), count); };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '提交详情在页面内保持可读');

  await t.test('任务提交：真实本机记录、跨仓库同哈希、复制和宽窄屏可读', async () => {
    const requests: any[] = [];
    page.on('request', (request: any) => { if (request.url().endsWith(`/tasks/${taskId}/commits`)) requests.push(request); });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await open(taskId);
      await loaded(3);
      assert.equal(await body().locator('[data-task-node]').count(), 4, '阅读标签不新增工作阶段');
      assert.equal(await body().locator('.task-path-track [role=tab]').last().innerText(), '提交记录');
      assert.equal(await body().locator('[data-task-node][aria-selected=true]').count(), 0);
      assert.equal(await rows().filter({ hasText: sharedHash.slice(0, 8) }).count(), 2, '同哈希在不同仓库仍是两条');
      assert.match(await rows().first().innerText(), /尚未推送的最新提交/);
      await rows().first().click();
      await body().locator('.task-commits-detail pre').waitFor({ state: 'visible' });
      assert.match(await body().locator('.task-commits-detail pre').innerText(), new RegExp(`Buildr-Task: ${taskId}`));
      assert.equal(await body().getByText('关联当前任务', { exact: true }).count(), 0);
      await body().getByRole('button', { name: '复制完整哈希', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), latestHash);
      await body().getByRole('button', { name: '复制完整说明', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await body().locator('.task-commits-detail pre').innerText());
      await noOverflow();
      await capture(page, `task-commits-expanded-${width}.png`);
      // Separate repository identities must also separate expansion and copy feedback.
      const duplicates = rows().filter({ hasText: sharedHash.slice(0, 8) });
      await duplicates.nth(0).click();
      const firstControl = await duplicates.nth(0).getAttribute('aria-controls');
      await body().getByRole('button', { name: '复制完整哈希', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), sharedHash);
      await duplicates.nth(1).click();
      assert.notEqual(await duplicates.nth(1).getAttribute('aria-controls'), firstControl);
      assert.equal(await duplicates.nth(0).getAttribute('aria-expanded'), 'false');
      assert.equal((await body().getByRole('button', { name: '复制完整哈希', exact: true }).innerText()).trim(), '复制完整哈希', '另一仓库未继承已复制反馈');
      await body().getByRole('button', { name: '提交说明示例', exact: true }).click();
      await body().getByRole('button', { name: '复制任务标记', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `Buildr-Task: ${taskId}`);
      await body().getByRole('button', { name: '收起示例', exact: true }).click();
      await body().locator('.task-commits-coverage summary').click();
      assert.match(await body().locator('.task-commits-coverage').innerText(), /commit-mirror/);
      assert.doesNotMatch(await body().locator('.task-commits').innerText(), /模拟提交/);
      await body().getByRole('tab', { name: '任务收尾', exact: true }).click();
      await body().getByRole('tab', { name: '提交记录', exact: true }).click();
      await loaded(3);
    }
    assert.ok(requests.length >= 4);
    assert.ok(requests.every(request => request.method() === 'GET' && !request.postData()), '打开、返回及复制只读取提交');
  });

  await t.test('任务提交：组合任务只读取自身，完整空范围给出提交示例', async () => {
    await open(parentId);
    await loaded(2);
    assert.ok((await body().locator('.task-commits-list').innerText()).includes(parentHash.slice(0, 8)));
    assert.doesNotMatch(await body().locator('.task-commits-list').innerText(), /尚未推送的最新提交|在两个仓库/);
    assert.equal(await body().getByRole('tab', { name: '验收', exact: true }).isVisible(), true);
    await open(emptyId);
    await body().getByRole('heading', { name: '当前检查范围内暂无关联提交', exact: true }).waitFor();
    await body().getByRole('button', { name: '查看提交说明示例', exact: true }).click();
    assert.match(await body().locator('.task-commits-example').innerText(), new RegExp(`Buildr-Task: ${emptyId}`));
  });

  await t.test('任务提交：真实仓库不可用时保留部分结果，重试恢复', async () => {
    const unavailable = `${mirror}-unavailable`;
    fs.renameSync(mirror, unavailable);
    try {
      await open(taskId);
      await body().getByRole('alert').filter({ hasText: '提交记录读取不完整' }).waitFor();
      await loaded(2);
      assert.equal(await body().getByText('当前检查范围内暂无关联提交', { exact: true }).count(), 0);
    } finally { fs.renameSync(unavailable, mirror); }
    await body().getByRole('button', { name: '重新读取', exact: true }).click();
    await loaded(3);
    await body().getByRole('alert').filter({ hasText: '提交记录读取不完整' }).waitFor({ state: 'hidden' });
  });

  await t.test('任务提交：请求等待、失败重试与刷新保留已有记录', async () => {
    const routePattern = `**/tasks/${taskId}/commits`;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(routePattern, async (route: any) => { await gate; await route.continue(); }, { times: 1 });
    await open(taskId);
    await body().getByRole('heading', { name: '正在读取提交记录…', exact: true }).waitFor();
    release(); await loaded(3);
    expectedBrowserErrors.add('net::ERR_FAILED');
    await page.route(routePattern, (route: any) => route.abort('failed'), { times: 1 });
    await body().getByRole('button', { name: '刷新任务', exact: true }).click();
    await body().getByRole('alert').filter({ hasText: '刷新失败，仍显示上次读取的记录。' }).waitFor();
    assert.equal(await rows().count(), 3);
    await body().getByRole('button', { name: '重新读取', exact: true }).click();
    await body().getByRole('alert').filter({ hasText: '刷新失败' }).waitFor({ state: 'hidden' });
    await loaded(3);
    await page.route(routePattern, (route: any) => route.abort('failed'), { times: 1 });
    await open(taskId);
    await body().getByRole('alert').filter({ hasText: '提交记录暂时不可用' }).waitFor();
    assert.equal(await body().getByText('当前检查范围内暂无关联提交', { exact: true }).count(), 0);
    await body().getByRole('button', { name: '重新读取', exact: true }).click();
    await loaded(3);
  });
}
