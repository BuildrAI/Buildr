import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import { connectHarnessProcess, prepareAgentRuntime, stopAgentProcess } from '../../../buildr-harness/src/index.ts';
import { agentRuntimePackageTree } from '../../../buildr-harness/tools/package-runtime.ts';
import { executionScopeKey } from '../../../buildr-harness/src/execution-contracts.ts';
import { codeGitEnvironment } from '../../../buildr-harness/src/workbench/code-git-environment.ts';

async function replaceCodeMirrorText(page: Page, root: Locator, value: string) {
  const content = root.locator('.file-editing-pane .cm-content').first();
  await content.waitFor();
  await content.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyA' : 'Control+KeyA');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(value);
}

test('production Harness browses, edits, reviews and commits with no Development or model', { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-workbench-browser-'));
  const dataRoot = path.join(root, 'profile'), packageRoot = path.join(root, 'package'), repo = path.join(root, 'repo');
  const profileId = 'workbench-browser';
  let client: Awaited<ReturnType<typeof connectHarnessProcess>> | undefined;
  let host: typeof client;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let ownerPid: number | undefined;
  t.after(async () => {
    try { await browser?.close(); } finally { await host?.disconnect(); await client?.disconnect(); }
    if (ownerPid) {
      let failure: unknown;
      try { await stopAgentProcess({ dataRoot, profileId, mode: 'stop-owned' }); } catch (error) { failure = error; }
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try { process.kill(ownerPid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { ownerPid = undefined; break; } throw error; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (ownerPid) throw new Error('Isolated Harness process still present: ' + root, { cause: failure });
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { env: codeGitEnvironment(), encoding: 'utf8' }).trim();
  git('-c', 'init.templateDir=', 'init', '-q', '-b', 'main');
  git('config', 'user.name', 'Browser Fixture');
  git('config', 'user.email', 'workbench@example.invalid');
  git('config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(repo, 'note.txt'), 'before\n');
  fs.writeFileSync(path.join(repo, 'untouched.txt'), 'base\n');
  git('add', '--', 'note.txt', 'untouched.txt');
  git('commit', '-qm', 'initial test revision');
  git('branch', 'feature/branch-ui');
  fs.writeFileSync(path.join(repo, 'untouched.txt'), 'external change\n');
  const linked = path.join(root, 'linked-review');
  git('worktree', 'add', '-qb', 'linked-review', linked);
  fs.writeFileSync(path.join(linked, 'note.txt'), 'from linked checkout\n');

  const coreRoot = path.resolve(import.meta.dirname, '../../../buildr-harness');
  agentRuntimePackageTree(coreRoot).materialize(packageRoot);
  fs.copyFileSync(path.join(coreRoot, 'test/integration/fixtures/agent-process-entry.mjs'), path.join(packageRoot, 'build/workbench-fixture.mjs'));
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), '{"version":"workbench-browser"}');
  const runtime = prepareAgentRuntime({ dataRoot, packageRoot, entry: 'build/workbench-fixture.mjs' });
  client = await connectHarnessProcess({ dataRoot, profileId, runtime, sourceId: 'harness-local', caller: { kind: 'first-party-user', product: 'buildr-harness' } });
  ownerPid = (await client.lifecycle.identity()).pid;
  const scope = await client.directories.register(repo, '工作台验收仓库');
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const ready = await client.web.enable({ port }); assert.equal(ready.ready, true);
  const login = await client.web.login();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(login.url);
  const rail = page.locator('.ac-collapsed-rail');
  const activateWorkspace = async () => {
    const toggle = page.getByRole('button', { name: '打开对话工作区', exact: true });
    await rail.waitFor({ state: 'visible' });
    await toggle.or(rail.getByRole('button', { name: '当前对话', exact: true })).first().waitFor({ state: 'visible' });
    if (!await toggle.isVisible()) await rail.getByRole('button', { name: '当前对话', exact: true }).click();
    await toggle.waitFor({ state: 'visible' });
    assert.equal(await toggle.locator('svg[data-icon="panel-right"]').count(), 1, '折叠态工作区按钮应展示右侧面板图标');
    await toggle.click();
  };
  const workspace = page.getByRole('region', { name: '对话工作区', exact: true });
  const header = page.locator('#agent-conversation-panel .ac-stream > .ac-thread-header');
  await activateWorkspace();
  const moduleTab = (name: string) => workspace.getByRole('tab', { name, exact: true });
  const pick = async (name: '资源管理器' | '源代码管理') => {
    const entry = workspace.getByRole('navigation', { name: '工作区内容' }).getByRole('button', { name, exact: true });
    const tab = moduleTab(name);
    await entry.or(tab).or(workspace.getByRole('button', { name: '打开工作区模块', exact: true })).first().waitFor();
    if (await tab.isVisible()) await tab.click();
    else if (await entry.isVisible()) await entry.click();
    else {
      await workspace.getByRole('button', { name: '打开工作区模块', exact: true }).click();
      await entry.click();
    }
    await moduleTab(name).waitFor();
  };
  const assertAligned = async () => {
    const title = await header.locator('.ac-thread-title').boundingBox();
    const compose = page.locator('#agent-conversation-panel .ac-compose-wrap');
    const edges = await compose.evaluate(el => {
      const box = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
    });
    const toggle = await header.locator('.harness-workspace-toggle').boundingBox();
    assert.ok(title && toggle && Math.abs(title.x - edges.left) <= 2 && Math.abs(toggle.x + toggle.width - edges.right) <= 2, JSON.stringify({ title, toggle, edges }));
  };
  assert.equal(await page.locator('.harness-environment-controls').count(), 0);
  assert.equal(await workspace.locator('.harness-worktree-picker').count(), 0, '工作台顶部工具栏不应显示冗余工作树切换器');
  assert.equal(await header.locator('button[aria-label="更多对话操作"] + .harness-workspace-toggle').count(), 1);
  assert.equal(await header.locator('.harness-workspace-toggle svg[data-icon="panel-right-open"]').count(), 1, '展开态工作区按钮应展示展开后的右侧面板图标');
  const historyPane = page.locator('.ac-focus-history-pane');
  const feedPane = page.locator('#agent-conversation-panel .ac-conversation-view');
  const historyDivider = page.locator('.ac-focus-history-divider.split-divider');
  const workspaceDivider = page.locator('.harness-shell-panels > .resizable-panels-divider.split-divider');
  await historyPane.waitFor({ state: 'visible' });
  await historyDivider.waitFor({ state: 'visible' });
  await workspaceDivider.waitFor({ state: 'visible' });
  assert.equal(await historyPane.getByRole('button', { name: '返回当前对话', exact: true }).count(), 0, '三分屏列表不展示返回当前对话按钮');
  const [initHistoryBox, initFeedBox, initWorkspaceBox] = await Promise.all([historyPane.boundingBox(), feedPane.boundingBox(), workspace.boundingBox()]);
  assert.ok(initHistoryBox && initFeedBox && initWorkspaceBox);
  assert.ok(initHistoryBox.width >= 240 && initFeedBox.width >= 520 && initWorkspaceBox.width >= 360, JSON.stringify({ initHistoryBox, initFeedBox, initWorkspaceBox }));
  const [newButton, currentButton, listButton] = await Promise.all(['.ac-new-conversation', '.ac-current-conversation', '.ac-all-conversations'].map(selector => rail.locator(selector).boundingBox()));
  assert.ok(newButton && currentButton && listButton && newButton.y < currentButton.y && currentButton.y < listButton.y);
  await assertAligned();
  await workspace.getByRole('navigation', { name: '工作区内容' }).waitFor();
  if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'workspace-home.png') });

  // Explorer: right-docked tree, single ObjectTabStrip, hidden ReadingToggle when no files open, CodeMirror FileEditingPane + conflict handling
  await pick('资源管理器');
  const explorer = workspace.locator('.harness-directory-explorer');
  await explorer.locator('aside.global-source-dock.is-right').waitFor();
  await workspace.getByText('从右侧目录选择文件', { exact: true }).waitFor();
  assert.equal(await workspace.locator('.harness-worktree-picker').count(), 0);
  assert.equal(await explorer.locator('.repository-file-pane .repository-file-tabs').count(), 0, '不应出现重复的内置文件页签栏');
  assert.equal(await explorer.locator('.code-reading-toggle').count(), 0, '无打开文件且目录展开时不应显示冗余切换按钮');
  assert.equal(await explorer.locator('.code-file-tabstrip').count(), 1);
  await explorer.locator('.repository-tree-file[data-file-path="untouched.txt"] .repository-status-M').waitFor();
  if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'workspace-explorer-empty.png') });

  await explorer.locator('.repository-tree-file[data-file-path="note.txt"]').click();
  await explorer.locator('.file-editing-pane .cm-editor').waitFor();
  await replaceCodeMirrorText(page, explorer, 'changed in real Harness\n');
  // Blur editor triggers immediate save
  await explorer.locator('.file-editing-header').click();
  await explorer.locator('.file-editing-save-state', { hasText: '已保存' }).waitFor();
  assert.equal(fs.readFileSync(path.join(repo, 'note.txt'), 'utf8'), 'changed in real Harness\n');
  if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'workspace-explorer-editing.png') });

  // Keep unsaved edit across workspace module open/close and tab switching
  await replaceCodeMirrorText(page, explorer, 'must not overwrite\n');
  await pick('源代码管理');
  const plus = workspace.getByRole('button', { name: '打开工作区模块', exact: true });
  const home = workspace.getByRole('navigation', { name: '工作区内容' });
  await plus.click();
  await home.getByRole('button', { name: '资源管理器', exact: true }).waitFor();
  await home.getByRole('button', { name: '源代码管理', exact: true }).waitFor();
  await home.getByRole('button', { name: '源代码管理', exact: true }).click();
  assert.equal(await workspace.getByRole('tablist', { name: '已打开的工作区模块' }).getByRole('tab').count(), 2);
  assert.equal(await moduleTab('资源管理器').getAttribute('aria-selected'), 'false');
  assert.equal(await moduleTab('源代码管理').getAttribute('aria-selected'), 'true');
  await moduleTab('源代码管理').press('ArrowLeft');
  assert.match(await explorer.locator('.file-editing-pane .cm-content').innerText(), /must not overwrite/);
  await workspace.getByRole('button', { name: '关闭源代码管理标签', exact: true }).click();
  assert.equal(await moduleTab('源代码管理').count(), 0);
  assert.match(await explorer.locator('.file-editing-pane .cm-content').innerText(), /must not overwrite/);

  // External write triggers 3-way conflict modal; adopt disk version cleanly
  fs.writeFileSync(path.join(repo, 'note.txt'), 'external version\n');
  await explorer.locator('.file-editing-pane .cm-content').click();
  await explorer.locator('.file-editing-header').click();
  const conflictModal = page.getByRole('dialog', { name: '处理文件保存冲突' });
  await conflictModal.waitFor();
  await conflictModal.getByRole('button', { name: '采用磁盘版本', exact: true }).click();
  await page.locator('.ant-popover').getByRole('button', { name: '采用磁盘版本', exact: true }).click();
  await explorer.locator('.file-editing-save-state', { hasText: '已保存' }).waitFor();
  assert.equal(fs.readFileSync(path.join(repo, 'note.txt'), 'utf8'), 'external version\n');
  assert.match(await explorer.locator('.file-editing-pane .cm-content').innerText(), /external version/);

  // Source Control: Development parity, full catalog statuses, branch popover, worktree menu, commit panel, history filters, discard
  await pick('源代码管理');
  const scm = page.locator('.source-control-workbench');
  const changes = scm.locator('.source-control-list');
  await scm.locator('.source-control-commit-panel').waitFor();
  assert.equal(await scm.locator('.harness-local-commit').count(), 0);
  assert.equal(await scm.locator('.source-control-diagnostics').filter({ hasText: '代码库读取达到上限' }).count(), 0, '不应误报代码库读取达到上限');
  assert.equal(await scm.locator('.source-control-status-unknown, [data-file-state="unknown"]').count(), 0, '所有工作树应具备完整状态观察，不显示问号未知状态');

  // Linked worktree shows real branch & status right away
  const expand = scm.getByRole('button', { name: '展开代码库 工作台验收仓库', exact: true });
  if (await expand.isVisible()) await expand.click();
  await scm.getByRole('button', { name: /查看工作树 linked-review/ }).waitFor();

  // Header menu exposes batch sync/fetch/create worktree
  await scm.getByRole('button', { name: '源代码管理操作菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: /全部同步/ }).waitFor();
  await page.getByRole('menuitem', { name: /全部获取远程/ }).waitFor();
  await page.getByRole('menuitem', { name: /新建工作树/ }).waitFor();
  await page.keyboard.press('Escape');

  // BranchManagementPopover switches branch & back (inline trigger when wide, worktree "..." menu when compact in 3-pane)
  const openMainBranchPopover = async () => {
    const inline = scm.getByRole('button', { name: /管理分支 · 工作台验收仓库 · 主工作树/ });
    if (await inline.isVisible()) await inline.click();
    else {
      await scm.getByRole('button', { name: '操作菜单 · 工作台验收仓库 · 主工作树', exact: true }).click();
      await page.getByRole('menuitem', { name: /管理分支/ }).click();
    }
    await page.getByRole('region', { name: /分支管理 · 工作台验收仓库 · 主工作树/ }).waitFor();
  };
  await openMainBranchPopover();
  await page.getByRole('button', { name: '管理 feature/branch-ui', exact: true }).click();
  await page.getByRole('button', { name: '切换到 feature/branch-ui', exact: true }).click();
  await page.getByText('已切换到 feature/branch-ui').waitFor();
  assert.equal(git('branch', '--show-current'), 'feature/branch-ui');
  await openMainBranchPopover();
  await page.getByRole('button', { name: '管理 main', exact: true }).click();
  await page.getByRole('button', { name: '切换到 main', exact: true }).click();
  await page.getByText('已切换到 main').waitFor();
  assert.equal(git('branch', '--show-current'), 'main');

  // Live editable diff viewer works and opens file in Explorer
  await changes.locator('.task-changed-row').filter({ has: page.locator('[data-file-path="note.txt"]') }).first().click();
  await scm.locator('.source-control-editable-diff .cm-editor').first().waitFor();
  assert.match(await scm.locator('.source-control-editable-diff').innerText(), /external version/);
  if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'workspace-scm-changes.png') });
  await scm.getByRole('button', { name: '在资源管理器打开', exact: true }).click();
  await explorer.locator('.file-editing-pane').getByText('note.txt', { exact: true }).first().waitFor();

  // Commit changes through unified SourceControlCommitPanel
  await pick('源代码管理');
  await scm.locator('#commit-message-text').fill('directory workbench commit');
  await scm.locator('#commit-changes').click();
  await scm.getByText(/已提交/).waitFor();
  assert.equal(git('show', '--format=%s', '-s', 'HEAD'), 'directory workbench commit');
  assert.match(git('show', '--format=', '--name-only', 'HEAD'), /note\.txt/);

  // History view includes HistoryFilters
  await scm.locator('.source-control-browse-tabs').getByText('提交历史', { exact: true }).click();
  await scm.getByRole('group', { name: '提交历史筛选', exact: true }).waitFor();
  await scm.getByRole('button', { name: '查看提交 directory workbench commit', exact: true }).click();
  if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'workspace-scm-history.png') });

  // Switch to linked-review worktree, view diff, open in Explorer (disambiguated tab), then discard change
  await scm.getByRole('button', { name: /查看工作树 linked-review/ }).click();
  await scm.locator('.source-control-browse-tabs').getByText('未提交变更', { exact: true }).click();
  await changes.locator('.task-changed-row').filter({ has: page.locator('[data-file-path="note.txt"]') }).first().click();
  await scm.locator('.source-control-editable-diff .cm-editor').first().waitFor();
  assert.match(await scm.locator('.source-control-editable-diff').innerText(), /from linked checkout/);
  await scm.getByRole('button', { name: '在资源管理器打开', exact: true }).click();
  const fileTabs = workspace.getByRole('tablist', { name: '打开的文件' });
  await fileTabs.getByRole('tab', { name: 'linked-review · note.txt', exact: true }).waitFor();
  await fileTabs.getByRole('tab', { name: 'repo · note.txt', exact: true }).click();
  await explorer.locator('.file-editing-pane').waitFor();
  assert.match(await explorer.locator('.file-editing-pane .cm-content').innerText(), /external version/);

  // Discard change in linked-review via Source Control discard button
  await pick('源代码管理');
  const linkedFileRow = changes.locator('.task-changed-list > li').filter({ has: page.locator('[data-file-path="note.txt"]') }).first();
  await linkedFileRow.hover();
  await linkedFileRow.getByRole('button', { name: /丢弃/ }).click();
  const discardDialog = page.getByRole('dialog', { name: '丢弃此文件的更改？' });
  await discardDialog.waitFor();
  await discardDialog.getByRole('button', { name: '丢弃更改', exact: true }).click();
  await changes.getByText('没有未提交文件', { exact: true }).waitFor();
  assert.equal(fs.readFileSync(path.join(linked, 'note.txt'), 'utf8'), 'before\n');

  if (process.env.BUILDR_HARNESS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR, 'directory-workbench.png') });

  await workspace.getByRole('button', { name: '关闭源代码管理标签', exact: true }).click();
  assert.equal(await moduleTab('资源管理器').getAttribute('aria-selected'), 'true');
  await workspace.getByRole('button', { name: '关闭资源管理器标签', exact: true }).click();
  await workspace.getByRole('navigation', { name: '工作区内容' }).waitFor();
  await page.getByRole('button', { name: '收起对话工作区', exact: true }).click();
  await assertAligned();

  // Multi-workspace isolation & draft preservation
  const localId = executionScopeKey(scope.ref);
  const localChat = await client.operations.conversations.create(localId, { title: '本机检出对话' });
  const engineering = fs.realpathSync(fs.mkdtempSync(path.join(root, 'engineering-')));
  fs.writeFileSync(path.join(engineering, 'note.txt'), 'different scope\n');
  fs.writeFileSync(path.join(engineering, 'engineering-only.txt'), 'only here\n');
  const engineeringId = 'engineering-fixture';
  let available = true;
  host = await connectHarnessProcess({
    dataRoot, profileId, runtime, sourceId: 'buildr', caller: { kind: 'host', sourceId: 'buildr' },
    host: {
      async resolveExecutionScope({ ref }) { assert.equal(ref.id, engineeringId); return { ref, rootPath: available ? engineering : path.join(root, 'unavailable'), revision: 'engineering-binding' }; },
      async listExecutionScopes({ sourceId }) { return { refs: [{ sourceId, id: engineeringId }], labels: { [engineeringId]: '工程工作空间' }, rootPaths: { [engineeringId]: engineering }, revision: 'engineering-catalog' }; },
    },
  });
  const engineeringChat = await host.operations.conversations.create(engineeringId, { title: '工程检出对话' });
  const connection = await client.operations.connections.read('first');
  await client.operations.connections.connect('first', { expectedRevision: connection.revision });
  for (const [source, wsId, chat] of [[client, localId, localChat], [host, engineeringId, engineeringChat]] as const) {
    const draft = { expectedRevision: chat.revision, connectionId: 'first', text: '目录范围验证' };
    const preview = await source.operations.conversations.prepareSend(wsId, chat.id, draft);
    await source.operations.conversations.send(wsId, chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
  }
  await page.reload();
  await activateWorkspace();
  page.setDefaultTimeout(12000);
  const openChat = async (id: string) => {
    const row = page.locator(`.ac-history-row-main[data-conversation-id="${id}"]`);
    if (!await page.locator('.ac-focus-history-pane').isVisible()) await page.locator('.ac-collapsed-rail .ac-all-conversations').click();
    await row.click();
    await page.locator(`#agent-conversation-panel[data-conversation-id="${id}"]`).waitFor();
  };
  await openChat(localChat.id);
  await assertAligned();
  await pick('资源管理器');
  await explorer.locator('.repository-tree-file[data-file-path="note.txt"]').click();
  await replaceCodeMirrorText(page, explorer, 'keep across workspace switch');
  await pick('源代码管理');
  await openChat(engineeringChat.id);
  await workspace.getByText('源代码管理暂不可用', { exact: true }).waitFor();
  assert.equal(await moduleTab('资源管理器').count(), 1);
  assert.equal(await moduleTab('源代码管理').getAttribute('aria-selected'), 'true');
  assert.equal(await changes.locator('[data-file-path="untouched.txt"]').count(), 0);
  await moduleTab('资源管理器').click();
  await explorer.locator('[data-file-path="engineering-only.txt"]').waitFor();
  assert.equal(await workspace.getByRole('button', { name: '添加本机目录' }).count(), 0);
  await pick('源代码管理');
  await workspace.getByText('源代码管理暂不可用', { exact: true }).waitFor();
  await openChat(localChat.id);
  await pick('资源管理器');
  await explorer.locator('.repository-tree-file[data-file-path="note.txt"]').click();
  await explorer.locator('.file-editing-pane .cm-content').waitFor();
  assert.match(await explorer.locator('.file-editing-pane .cm-content').innerText(), /keep across workspace switch/);
  if (!await page.locator('.ac-focus-history-pane').isVisible()) await page.locator('.ac-collapsed-rail .ac-all-conversations').click();
  await page.getByRole('button', { name: '在工程工作空间新建对话', exact: true }).click();
  assert.equal(await historyPane.isVisible(), true, '三分屏下在分组新建对话保持左侧列表展开');
  await pick('资源管理器');
  await rail.getByRole('button', { name: '当前对话', exact: true }).click();
  await explorer.locator('[data-file-path="engineering-only.txt"]').waitFor();
  assert.equal(await page.locator('#agent-conversation-panel').getAttribute('data-conversation-id'), null);
  await page.locator('.ac-collapsed-rail .ac-all-conversations').click();
  await historyPane.waitFor({ state: 'visible' });
  await rail.locator('.ac-new-conversation').click();
  await historyPane.waitFor({ state: 'visible' });
  assert.equal(await historyPane.isVisible(), true, '三分屏下点击导轨新建对话保持左侧列表展开');
  const dragDivider = async (locator: ReturnType<typeof page.locator>, deltaX: number) => {
    const box = await locator.boundingBox();
    assert.ok(box);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + deltaX, y, { steps: 8 });
    await page.mouse.up();
  };
  const beforeDragWorkspace = await workspace.boundingBox();
  await dragDivider(workspaceDivider, -400);
  const squeezedBoxes = await Promise.all([historyPane.boundingBox(), feedPane.boundingBox(), workspace.boundingBox()]);
  assert.ok(beforeDragWorkspace && squeezedBoxes[0] && squeezedBoxes[1] && squeezedBoxes[2]);
  assert.ok(squeezedBoxes[2].width >= beforeDragWorkspace.width + 45, '向左拖拽分隔条应扩宽右侧工作区');
  assert.ok(squeezedBoxes[1].width >= 520, '拉宽工作区时核心对话信息流不得低于 520px');
  assert.ok(squeezedBoxes[0].width >= 240, '拉宽工作区时左侧列表不得低于 240px');
  await dragDivider(workspaceDivider, 240);
  const relaxedBoxes = await Promise.all([historyPane.boundingBox(), feedPane.boundingBox(), workspace.boundingBox()]);
  assert.ok(relaxedBoxes[0] && relaxedBoxes[1] && relaxedBoxes[2]);
  assert.ok(relaxedBoxes[1].width > squeezedBoxes[1].width, '向右收缩工作区应优先归还核心对话信息流宽度');
  assert.ok(Math.abs(relaxedBoxes[0].width - squeezedBoxes[0].width) <= 2, '向右收缩工作区时左侧列表宽度不跳动');
  await workspaceDivider.dblclick();

  const beforeHistory = await historyPane.boundingBox();
  await dragDivider(historyDivider, 240);
  const pushedBoxes = await Promise.all([historyPane.boundingBox(), feedPane.boundingBox(), workspace.boundingBox()]);
  assert.ok(beforeHistory && pushedBoxes[0] && pushedBoxes[1] && pushedBoxes[2]);
  assert.ok(pushedBoxes[0].width > beforeHistory.width + 40, '向右拖拽列表分隔条应加宽列表');
  assert.ok(pushedBoxes[1].width >= 520, '加宽列表时核心对话信息流不得低于 520px');
  assert.ok(pushedBoxes[2].width >= 360, '加宽列表时右侧工作区不得低于 360px');
  await historyDivider.dblclick();

  const draftInput = page.getByRole('textbox', { name: '对话输入', exact: true });
  await draftInput.fill('三分屏设置保留草稿');
  await rail.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('region', { name: '设置', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await historyPane.isVisible(), false, '打开全屏设置时隐藏左侧列表');
  assert.equal(await workspace.isVisible(), false, '打开全屏设置时临时隐藏右侧工作区');
  await page.keyboard.press('Escape');
  await page.getByRole('region', { name: '设置', exact: true }).waitFor({ state: 'hidden' });
  await historyPane.waitFor({ state: 'visible' });
  await workspace.waitFor({ state: 'visible' });
  assert.equal(await draftInput.inputValue(), '三分屏设置保留草稿');

  await page.setViewportSize({ width: 1024, height: 900 });
  await historyPane.waitFor({ state: 'hidden' });
  await feedPane.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const feed = document.querySelector('#agent-conversation-panel .ac-conversation-view')?.getBoundingClientRect();
    const work = document.querySelector('[aria-label="对话工作区"]')?.getBoundingClientRect();
    return Boolean(feed && work && feed.width >= 520 && work.width >= 360);
  }, undefined, { timeout: 10000 });
  assert.notEqual(await page.evaluate(() => localStorage.getItem('buildr.harness-standalone.history-open:' + (document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local'))), 'false', '缩窄退回双栏不得覆盖桌面列表偏好');
  await page.setViewportSize({ width: 1440, height: 900 });
  await historyPane.waitFor({ state: 'visible' });
  available = false;
  await page.getByRole('button', { name: '收起对话工作区', exact: true }).click();
  assert.equal(await header.locator('.harness-workspace-toggle svg[data-icon="panel-right"]').count(), 1, '收起工作区后按钮应恢复折叠态右侧面板图标');
  await page.getByRole('button', { name: '打开对话工作区', exact: true }).click();
  assert.equal(await header.locator('.harness-workspace-toggle svg[data-icon="panel-right-open"]').count(), 1, '再次展开工作区后按钮应展示展开态右侧面板图标');
  await workspace.getByText('当前工作空间目录不可用', { exact: true }).waitFor();
  assert.equal(await workspace.locator('[data-file-path="note.txt"]').count(), 0);
  assert.equal((await client.directories.list()).length, 1, '工程目录不重复登记');
  const denied = await fetch(new URL('/api/v1/harness/directory-workbench/status', login.url), {
    method: 'POST',
    headers: { origin: new URL(login.url).origin, 'content-type': 'application/json' },
    body: JSON.stringify({ scopeId: scope.ref.id, scopeRevision: scope.revision }),
  });
  assert.equal(denied.status, 403, 'directory endpoints do not inherit a login or a scope from proximity');
  assert.equal(fs.existsSync(path.join(repo, '.buildr')), false);
});
