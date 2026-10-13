import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Real temporary Git histories exercise the production host and feature client.
// Only the explicit network failure/delay scenarios intercept requests; successful
// commit responses always come from the production query.
export async function runTaskCommitsJourney({ t, page, runtime, workspaceRoot, workspaceUrl, expectedBrowserErrors, capture }: any) {
  const taskId = 'browser-commits', parentId = 'browser-commits-parent', emptyId = 'browser-commits-empty', workbenchId = 'browser-commits-workbench';
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
  for (const [id, title] of [[parentId, '提交关联组合任务'], [taskId, '独立提交记录组合任务'], [emptyId, '尚无提交的任务']]) runtime.createTask(workspaceRoot, { taskId: id, title, intent: '检查真实本机提交与任务编码的双向关联。', isParent: true, ...scope, ...(id === taskId ? { parentTaskId: parentId } : {}) });
  const parentHash = commit(parentId, 'docs(parent): 保存组合任务自己的提交', '2026-09-27T08:00:00Z');
  const childFile = 'child-delivery-canary.txt';
  fs.writeFileSync(path.join(workspaceRoot, childFile), '真实子任务提交文件的完整内容。\n');
  git(workspaceRoot, ['add', childFile]);
  const sharedHash = commit(taskId, 'feat(task): 在两个仓库保留同一提交', '2026-09-27T08:01:00Z');
  git(mirror, ['fetch', '-q', workspaceRoot, 'HEAD']);
  git(mirror, ['update-ref', 'refs/heads/fixture', 'FETCH_HEAD']);
  git(mirror, ['symbolic-ref', 'HEAD', 'refs/heads/fixture']);
  const latestHash = commit(taskId, 'fix(task): 保留尚未推送的最新提交', '2026-09-27T08:02:00Z');
  runtime.createTask(workspaceRoot, { taskId: workbenchId, title: '普通任务提交工作台', intent: '核对当前普通任务的真实提交及文件差异。', ...scope });
  const canaryFile = 'task-commit-canary.txt';
  fs.writeFileSync(path.join(workspaceRoot, canaryFile), '真实提交文件的完整内容。\n');
  git(workspaceRoot, ['add', canaryFile]);
  const canaryHash = commit(workbenchId, 'test(workbench): 保存真实提交文件', '2026-09-27T08:03:00Z');
  const body = () => page.locator('#task-detail-main:visible');
  const open = async (id: string) => {
    await page.goto(`${workspaceUrl}/tasks/${id}`);
    await body().getByRole('tab', { name: '提交记录', exact: true }).click();
  };
  const rows = () => body().locator('.task-rail-commit');
  const loaded = async (count: number) => { await rows().nth(count - 1).waitFor({ state: 'visible' }); assert.equal(await rows().count(), count); };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '提交详情在页面内保持可读');

  await t.test('普通任务提交：当前改动与提交入口读取真实列表和所选提交文件', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fileReads: string[] = [];
    const track = (request: any) => { if (request.url().includes(`/tasks/${workbenchId}/file-diff?`)) fileReads.push(request.url()); };
    page.on('request', track);
    try {
      await page.goto(`${workspaceUrl}/tasks/${workbenchId}`);
      await body().locator('[data-task-content=changes]').click();
      const record = body().locator('.task-rail-commit').filter({ hasText: canaryHash.slice(0, 8) });
      await record.waitFor({ state: 'visible' }); await record.click();
      await body().locator('.task-commit-details pre').filter({ hasText: `Buildr-Task: ${workbenchId}` }).waitFor({ state: 'visible' });
      assert.match(await body().locator('.task-commit-details').innerText(), new RegExp(canaryHash));
      await body().locator('.task-rail-commit-files .task-changed-row').filter({ hasText: canaryFile }).click();
      await body().locator('.task-diff-body').getByText('真实提交文件的完整内容。', { exact: false }).waitFor({ state: 'visible' });
      assert.ok(fileReads.some(url => { const parameters = new URL(url).searchParams; return parameters.get('commitHash') === canaryHash && parameters.get('filePath') === canaryFile; }), '所选提交文件通过真实任务限定接口读取');
      await capture(page, 'task-workbench-real-commit-file.png');
    } finally { page.off('request', track); }
  });

  await t.test('任务文件选择：暂时失败保留来源，确认消失后清理旧预览且不转读同名文件', async () => {
    const listPattern = `**/tasks/${workbenchId}/changed-files`, diffPattern = `**/tasks/${workbenchId}/file-diff?**`;
    const original = 'checkout-' + 'c'.repeat(64), replacement = 'checkout-' + 'd'.repeat(64);
    let mode = 'ready';
    const reads: string[] = [];
    const file = (checkoutId: string, text: string) => ({ repositoryId: 'repo', checkoutId, path: 'stale-delivery.txt', previousPath: null, kind: 'tracked', status: 'modified', additions: 1, deletions: 1, preview: `--- a/stale-delivery.txt\n+++ b/stale-delivery.txt\n@@ -1 +1 @@\n-before\n+${text}\n`, previewTruncated: false });
    const payload = (files: any[]) => ({ schemaVersion: 'buildr.task-changed-files/v1', taskId: workbenchId, readAt: new Date().toISOString(), status: 'complete', files, commits: [], commitFiles: {}, repositories: [{ id: 'repo', label: '来源核对仓库', root: '.', sources: [], status: 'complete', branch: 'dev', ahead: 0, fileCount: files.length, scannedCommitCount: 0 }], repositoryMeta: {}, coverage: { repositoryLimit: 32, fileLimit: 500, commitFileLimit: 500, previewLineLimit: 500, truncated: false }, diagnostics: [], effects: [] });
    await page.route(listPattern, (route: any) => route.fulfill({ json: payload([mode === 'gone' ? file(replacement, 'replacement-checkout') : file(original, 'original-checkout')]) }));
    await page.route(diffPattern, (route: any) => {
      const url = new URL(route.request().url()), checkoutId = url.searchParams.get('checkoutId')!;
      reads.push(checkoutId);
      if (checkoutId === original && mode !== 'ready') {
        expectedBrowserErrors.add(url.href);
        return route.fulfill({ status: mode === 'transient' ? 503 : 404, json: { error: { code: mode === 'transient' ? 'task_file_checkout_unconfirmed' : 'task_file_diff_invalid', message: mode === 'transient' ? '暂时无法核对所选来源' : '所选文件不在当前改动范围中，请刷新列表。' } } });
      }
      return route.fulfill({ json: payload([file(checkoutId, checkoutId === original ? 'original-checkout' : 'replacement-checkout')]) });
    });
    try {
      await page.goto(`${workspaceUrl}/tasks/${workbenchId}`);
      await body().locator('[data-task-content=changes]').click();
      await body().locator('.task-diff-body').getByText('original-checkout', { exact: false }).waitFor();
      mode = 'transient';
      await body().locator('#task-detail-refresh').click();
      await body().locator('.task-diff-read-status').filter({ hasText: '暂时无法核对所选来源' }).waitFor();
      assert.equal(await body().locator('.task-diff-file strong').innerText(), 'stale-delivery.txt');
      mode = 'gone';
      await body().locator('#task-detail-refresh').click();
      await body().getByText('上次所选文件已不在当前范围，已清除旧预览。', { exact: true }).waitFor();
      assert.equal(await body().locator('.task-diff-file strong').innerText(), '差异阅读');
      assert.doesNotMatch(await body().locator('.task-diff-body').innerText(), /replacement-checkout|original-checkout/);
      assert.ok(reads.length >= 3 && reads.every(value => value === original), '失效核对始终携带原工作树身份，不能自动换读同路径来源');
      await body().locator('.task-changed-row').filter({ hasText: 'stale-delivery.txt' }).click();
      await body().locator('.task-diff-body').getByText('replacement-checkout', { exact: false }).waitFor();
      assert.equal(reads.at(-1), replacement, '只有用户重新选择后才读取另一来源');
      await capture(page, 'task-stale-file-selection-cleared.png');
    } finally { await page.unroute(listPattern); await page.unroute(diffPattern); }
  });

  await t.test('提交文件局部读取失败时保留固定提交来源并可重试', async () => {
    const listPattern = `**/tasks/${workbenchId}/changed-files`, diffPattern = `**/tasks/${workbenchId}/file-diff?**`;
    let partial = false;
    const reads: string[] = [];
    await page.route(listPattern, async (route: any) => {
      const response = await route.fetch();
      if (!partial) return route.fulfill({ response });
      const value = await response.json();
      return route.fulfill({ response, json: { ...value, status: 'partial', commitFiles: {}, diagnostics: [{ code: 'git_temporarily_unavailable', message: '提交文件列表暂时无法读取', repositoryId: null, reference: null, hash: canaryHash }] } });
    });
    await page.route(diffPattern, (route: any) => {
      reads.push(route.request().url());
      if (!partial) return route.continue();
      expectedBrowserErrors.add(route.request().url());
      return route.fulfill({ status: 503, json: { error: { code: 'task_file_diff_unconfirmed', message: '固定提交文件暂时无法读取' } } });
    });
    try {
      await page.goto(`${workspaceUrl}/tasks/${workbenchId}`);
      await body().locator('[data-task-content=changes]').click();
      const row = body().locator('.task-rail-commit').filter({ hasText: canaryHash.slice(0, 8) });
      await row.click();
      await row.locator('..').locator('.task-changed-row').filter({ hasText: canaryFile }).click();
      await body().locator('.task-diff-body').getByText('真实提交文件的完整内容。', { exact: false }).waitFor();
      reads.length = 0;
      partial = true;
      await body().locator('#task-detail-refresh').click();
      await body().locator('.task-diff-read-status').filter({ hasText: '固定提交文件暂时无法读取' }).waitFor();
      await body().getByText('文件列表尚未读取或暂不可展示', { exact: true }).waitFor();
      assert.equal(await body().locator('.task-diff-file strong').innerText(), canaryFile);
      assert.match(await body().locator('.task-diff-scope').innerText(), new RegExp(canaryHash.slice(0, 8)));
      assert.ok(reads.length >= 1 && reads.every(value => new URL(value).searchParams.get('commitHash') === canaryHash), '刷新仍读取已观察的固定提交，而非工作区或其他提交');
      partial = false;
      await body().locator('#task-detail-refresh').click();
      await body().locator('.task-diff-body').getByText('真实提交文件的完整内容。', { exact: false }).waitFor();
      await body().locator('.task-diff-read-status').waitFor({ state: 'hidden' });
    } finally { await page.unroute(listPattern); await page.unroute(diffPattern); }
  });

  await t.test('组合任务提交：真实本机记录、跨仓库同哈希、复制和宽窄屏可读', async () => {
    const requests: any[] = [];
    page.on('request', (request: any) => { if (request.url().endsWith(`/tasks/${taskId}/changed-files`)) requests.push(request); });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await open(taskId);
      await loaded(3);
      assert.equal(await body().locator('[data-task-node]').count(), 0, '组合任务使用自身内容入口');
      assert.equal(await body().locator('.task-path-track [role=tab]').last().innerText(), '提交记录');
      assert.equal(await body().locator('[data-task-node][aria-selected=true]').count(), 0);
      assert.equal(await rows().filter({ hasText: sharedHash.slice(0, 8) }).count(), 2, '同哈希在不同仓库仍是两条');
      assert.match(await rows().first().innerText(), /尚未推送的最新提交/);
      await body().locator('.task-commit-details pre').waitFor({ state: 'visible' });
      assert.match(await body().locator('.task-commit-details pre').innerText(), new RegExp(`Buildr-Task: ${taskId}`));
      assert.match(await body().locator('.task-commit-details').innerText(), /独立提交记录组合任务/);
      assert.equal(await body().getByText('工作区干净', { exact: true }).count(), 0);
      assert.equal(await body().getByText('暂无关联提交', { exact: true }).count(), 0);
      assert.equal(await body().getByText('关联当前任务', { exact: true }).count(), 0);
      await body().getByRole('button', { name: '复制完整哈希', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), latestHash);
      await body().getByRole('button', { name: '复制提交说明', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await body().locator('.task-commit-details pre').innerText());
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
      assert.equal(await duplicates.nth(0).getAttribute('aria-expanded'), 'true', '展开状态属于各自仓库中的提交');
      assert.equal((await body().getByRole('button', { name: '复制完整哈希', exact: true }).innerText()).trim(), '复制完整哈希', '另一仓库未继承已复制反馈');
      await duplicates.nth(1).locator('..').locator('.task-changed-row').filter({ hasText: childFile }).click();
      await body().locator('.task-diff-body').getByText('真实子任务提交文件的完整内容。', { exact: false }).waitFor();
      await noOverflow();
      assert.doesNotMatch(await body().locator('.task-changes-pane').innerText(), /模拟提交/);
      await body().getByRole('tab', { name: '验收', exact: true }).click();
      await body().getByRole('tab', { name: '提交记录', exact: true }).click();
      await loaded(3);
    }
    assert.ok(requests.length >= 2);
    assert.ok(requests.every(request => request.method() === 'GET' && !request.postData()), '打开、返回及复制只读取提交');
  });

  await t.test('组合任务汇总直接子任务并能展开子任务文件，空范围不伪造交付', async () => {
    const fileReads: string[] = [];
    const track = (request: any) => { if (request.url().includes(`/tasks/${parentId}/file-diff?`)) fileReads.push(request.url()); };
    page.on('request', track);
    await open(parentId);
    try {
      await loaded(5);
      const text = (await rows().allInnerTexts()).join('\n');
      assert.ok(text.includes(parentHash.slice(0, 8)));
      assert.match(text, /尚未推送的最新提交|在两个仓库/);
      assert.doesNotMatch(text, /保存真实提交文件/);
      assert.equal(await body().getByRole('tab', { name: '验收', exact: true }).isVisible(), true);
      const child = rows().filter({ hasText: sharedHash.slice(0, 8) }).first();
      await child.click();
      assert.match(await body().locator('.task-commit-details').innerText(), /独立提交记录组合任务/);
      assert.match(await body().locator('.task-commit-details pre').innerText(), new RegExp(`Buildr-Task: ${taskId}`));
      await child.locator('..').locator('.task-changed-row').filter({ hasText: childFile }).click();
      await body().locator('.task-diff-body').getByText('真实子任务提交文件的完整内容。', { exact: false }).waitFor();
      assert.ok(fileReads.some(value => new URL(value).searchParams.get('commitHash') === sharedHash));
      await capture(page, 'composite-task-child-commit-file.png');
    } finally { page.off('request', track); }
    await open(emptyId);
    await body().getByText('暂无可见的改动与提交。', { exact: true }).waitFor();
    assert.equal(await rows().count(), 0);
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
    const routePattern = `**/tasks/${taskId}/changed-files`;
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
