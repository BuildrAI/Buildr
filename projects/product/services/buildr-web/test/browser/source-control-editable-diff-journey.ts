import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** Only the host's disposable checkout is prepared here; user edits use real HTTP. */
function prepareFiles(branches: any) {
  assert.ok(branches.branch.startsWith('fixture/'), '差异数据只能准备在宿主的一次性检出目录');
  const directory = 'scm-browser-editable', changedPath = directory + '/changes.ts', otherPath = directory + '/other.ts', newPath = directory + '/new.ts';
  assert.equal(fs.existsSync(path.join(branches.location, directory)), false, '不能覆盖已有验收文件');
  fs.mkdirSync(path.join(branches.location, directory));
  const git = (args: string[]) => {
    const result = spawnSync('git', args, {cwd: branches.location, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const baseLines = Array.from({length: 50}, (_, index) => 'export const editableLine' + (index + 1) + ' = ' + (index + 1) + ';');
  const indexLines = [...baseLines]; indexLines[2] = 'export const editableLine3 = 103;';
  const workingLines = [...indexLines]; workingLines[2] = 'export const editableLine3 = 203;'; workingLines[24] = 'export const editableLine25 = 225;'; workingLines[46] = 'export const editableLine47 = 247;';
  const base = baseLines.join('\n') + '\n', index = indexLines.join('\n') + '\n', working = workingLines.join('\n') + '\n';
  fs.writeFileSync(path.join(branches.location, changedPath), base);
  fs.writeFileSync(path.join(branches.location, otherPath), 'export const editableOther = 1;\n');
  git(['add', '--', changedPath, otherPath]);
  git(['-c', 'commit.gpgSign=false', 'commit', '-qm', 'editable diff browser baseline']);
  const commitHash = git(['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(branches.location, changedPath), index); git(['add', '--', changedPath]);
  fs.writeFileSync(path.join(branches.location, changedPath), working);
  fs.writeFileSync(path.join(branches.location, otherPath), 'export const editableOther = 2;\n');
  fs.writeFileSync(path.join(branches.location, newPath), 'export const editableUntracked = 1;\n');
  return {changedPath, otherPath, newPath, base, index, working, commitHash, git,
    absolute: path.join(branches.location, changedPath), newAbsolute: path.join(branches.location, newPath),
    read: () => fs.readFileSync(path.join(branches.location, changedPath), 'utf8'),
    indexContent: () => git(['show', ':' + changedPath]),
  };
}

async function waitForDisk(file: string, content: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fs.readFileSync(file, 'utf8') === content) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(fs.readFileSync(file, 'utf8'), content, '实际文件应保存完整当前正文');
}

export async function runSourceControlEditableDiffJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors, scenario = (name: string, action: () => Promise<void>) => t.test(name, action)}: any) {
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  const pane = () => root().locator('.file-diff-editor:visible');
  const current = () => pane().locator('.file-diff-current .cm-content[aria-label="当前文件编辑器"]');
  const original = () => pane().locator('.file-diff-original .cm-content[aria-label="旧版本只读编辑器"]');
  const restore = () => pane().locator('.file-diff-toolbar').getByRole('button', {name: '恢复此处改动', exact: true});
  const position = () => pane().locator('.file-diff-position');
  const mode = () => root().locator('.task-diff-mode');
  const withFiles = (verify: (branches: any) => Promise<void>) => fixture.withBranches(async (branches: any) => {
    try {await verify(branches);}
    catch (error) {
      const state = await root().innerText().catch(() => '源代码管理页面已关闭');
      const editors = await page.locator('.file-diff-editor').evaluateAll((elements: HTMLElement[]) => elements.map(element => ({
        rect: element.getBoundingClientRect().toJSON(), display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility,
        parents: [element.parentElement, element.parentElement?.parentElement].filter(Boolean).map(parent => ({className: parent!.className, hidden: parent!.hidden, rect: parent!.getBoundingClientRect().toJSON(), display: getComputedStyle(parent!).display})),
        contents: [...element.querySelectorAll<HTMLElement>('.cm-content')].map(content => ({label: content.getAttribute('aria-label'), editable: content.contentEditable, editorClass: content.closest('.cm-editor')?.className, rect: content.getBoundingClientRect().toJSON()})),
      }))).catch(() => null);
      process.stderr.write('[source-control-editable-diff-failure] ' + JSON.stringify({editors, state}) + '\n');
      await capture(page, 'source-control-editable-diff-failure.png').catch(() => {});
      throw error;
    }
  });
  const open = async (branches: any, beforeSelection?: () => Promise<void>) => {
    await page.goto(workspaceUrl + '/code/source-control'); await root().locator('.source-control-repository-copy').first().waitFor();
    const response = await page.request.get(api + '/code/source-control'); assert.equal(response.status(), 200);
    const catalog = await response.json(), repository = catalog.repositories.find((item: any) => item.worktrees.some((tree: any) => tree.location === branches.location));
    assert.ok(repository); const tree = repository.worktrees.find((item: any) => item.location === branches.location);
    const parent = root().locator('[data-source-repository="' + repository.id + '"]');
    const fold = parent.locator(':scope > .source-control-repository .source-control-repository-fold');
    if (await fold.getAttribute('aria-expanded') === 'false') await fold.click();
    await beforeSelection?.();
    await parent.locator('[data-source-worktree="' + tree.worktreeId + '"] .source-control-repository-copy').click();
    await selectSourceControlView(root(), 'changes');
    const file = (filePath: string) => root().locator('[data-change-worktree="' + tree.worktreeId + '"] [data-change-area="working"] .task-changed-row')
      .filter({has: page.locator('.task-changed-path[data-file-path="' + filePath + '"]')});
    return {repository, tree, file};
  };
  const replaceFirstChange = async (text: string) => {
    await current().press('ControlOrMeta+Home');
    await current().press('ArrowDown'); await current().press('ArrowDown');
    await current().press('Home'); await current().press('Shift+End');
    await page.keyboard.insertText(text);
  };
  const assertNoOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '差异编辑不产生页面横向溢出');
  const assertLineInReader = async (text: string) => {
    await page.waitForFunction((expected: string) => {
      const pane = document.querySelector('.code-source-control-page:not([hidden]) .file-diff-editor'), host = pane?.querySelector('.file-diff-host');
      const line = [...pane?.querySelectorAll('.file-diff-current .cm-line') || []].find(element => element.textContent === expected);
      if (!line || !host) return false;
      const row = line.getBoundingClientRect(), reader = host.getBoundingClientRect();
      return row.top >= reader.top - 1 && row.bottom <= Math.min(reader.bottom, innerHeight) + 1;
    }, text);
  };
  const assertReadOnly = async () => {
    await root().locator('.file-diff-editor:visible').waitFor({state: 'hidden'});
    assert.equal(await root().locator('.file-diff-editor:visible .cm-content[contenteditable="true"]').count(), 0, '固定比较层不开放当前文件编辑器');
    assert.equal(await root().getByRole('button', {name: '恢复此处改动', exact: true}).count(), 0, '固定比较层不提供恢复写入');
  };

  await scenario('可编辑差异：真实写盘、比较层只读、跨模式历史和逐块恢复', async () => {
    await withFiles(async (branches: any) => {
      const files = prepareFiles(branches), otherPositions = branches.otherPositions(branches.location);
      // Isolate the fresh-open read from periodic polling without imposing a wall-clock budget.
      // Normal effects, network reads and animation frames remain real; later documents default to polling.
      await page.addInitScript(() => {
        const state = window as Window & {__editableDiffReadProbe?: {deferPolling: boolean}};
        state.__editableDiffReadProbe = {deferPolling: false};
        const schedule = window.setInterval.bind(window);
        window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
          if (typeof callback !== 'function' || delay !== 5000) return schedule(callback, delay, ...args);
          return schedule((...values: unknown[]) => {if (!state.__editableDiffReadProbe?.deferPolling) callback.apply(window, values);}, delay, ...args);
        }) as typeof window.setInterval;
      });
      const editorReads: URL[] = [];
      const observeEditorRead = (request: any) => {
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.pathname.endsWith('/code/editor-file') && url.searchParams.get('filePath') === files.changedPath) editorReads.push(url);
      };
      page.on('request', observeEditorRead);
      await page.setViewportSize({width: 1440, height: 1000});
      const {file, tree, repository} = await open(branches, () => page.evaluate(() => {
        (window as Window & {__editableDiffReadProbe: {deferPolling: boolean}}).__editableDiffReadProbe.deferPolling = true;
      }));
      try {
        await file(files.changedPath).click(); await current().waitFor();
        await current().evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);});
        const readsForSelection = () => editorReads.filter(url => url.searchParams.get('checkoutId') === tree.worktreeId);
        assert.equal(readsForSelection().length, 1, '首次打开只读取一次完整当前文件，挂载不立即重复读取');
        await mode().getByText('上下对比', {exact: true}).click(); await pane().locator('[data-diff-original="true"]').first().waitFor();
        await mode().getByText('左右对比', {exact: true}).click(); await original().waitFor();
        await current().evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);});
        assert.equal(readsForSelection().length, 1, '切换差异呈现只复用当前文件，不增加完整文件读取');
      } finally {
        page.off('request', observeEditorRead);
        await page.evaluate(() => {
          const probe = (window as Window & {__editableDiffReadProbe?: {deferPolling: boolean}}).__editableDiffReadProbe;
          if (probe) probe.deferPolling = false;
        });
      }
      const fileId = await pane().getAttribute('data-file-id');
      await mode().getByText('左右对比', {exact: true}).click();
      assert.equal(await pane().getAttribute('data-diff-mode'), 'split');
      assert.equal(await current().getAttribute('contenteditable'), 'true');
      assert.equal(await original().getAttribute('contenteditable'), 'false');
      assert.equal(await position().getAttribute('data-diff-count'), '3');
      const oldColor = await original().locator('.cm-changedLine').first().evaluate((element: HTMLElement) => getComputedStyle(element).backgroundColor.match(/[\d.]+/g)!.map(Number));
      const newColor = await current().locator('.cm-changedLine').first().evaluate((element: HTMLElement) => getComputedStyle(element).backgroundColor.match(/[\d.]+/g)!.map(Number));
      assert.ok(oldColor[0] - oldColor[1] >= 20 && newColor[1] - newColor[0] >= 15, '旧行使用可辨认的红色背景，新行使用可辨认的绿色背景');
      const highlights = await pane().locator('.cm-changedText,.cm-deletedText').evaluateAll((elements: HTMLElement[]) => elements.map(element => getComputedStyle(element).backgroundImage));
      assert.ok(highlights.length > 0 && highlights.every((background: string) => background === 'none'), '变化文本没有渐变下划线');
      const beforeOld = await original().innerText();
      await original().click(); await original().press('ControlOrMeta+Home'); await page.keyboard.insertText('旧侧不得修改');
      assert.equal(await original().innerText(), beforeOld, '旧版本拒绝真实键盘输入'); assert.equal(files.read(), files.working);
      assert.equal(files.indexContent(), files.index);

      // Synthetic composition checks DOM lifetime only; it is not a real IME acceptance test.
      const composingEditor = await current().elementHandle();
      await current().dispatchEvent('compositionstart', {data: ''});
      await mode().getByText('上下对比', {exact: true}).click();
      assert.equal(await pane().getAttribute('data-diff-mode'), 'split', '组合输入期间延后呈现重建');
      assert.equal(await current().evaluate((element: HTMLElement, prior: HTMLElement) => element === prior, composingEditor), true);
      await current().dispatchEvent('compositionend', {data: ''});
      await pane().locator('[data-diff-original="true"]').first().waitFor();
      assert.equal(await pane().getAttribute('data-diff-mode'), 'unified');
      await composingEditor?.dispose();
      await mode().getByText('左右对比', {exact: true}).click();

      const edited = files.working.replace('editableLine3 = 203', 'editableLine3 = 303');
      await replaceFirstChange('export const editableLine3 = 303;'); await waitForDisk(files.absolute, edited);
      assert.equal(files.indexContent(), files.index, '自动保存只写当前文件，索引字节不变');
      await mode().getByText('上下对比', {exact: true}).click();
      assert.equal(await pane().getAttribute('data-diff-mode'), 'unified');
      const deleted = pane().locator('.cm-deletedChunk').first(); await deleted.waitFor();
      assert.equal(await deleted.getAttribute('contenteditable'), 'false', '统一对比的旧删除文本保持只读');
      assert.match(await deleted.innerText(), /editableLine3 = 3;/, '统一更改差异以最近提交为旧侧基线');
      await current().press('ControlOrMeta+z'); await waitForDisk(files.absolute, files.working);
      await current().press('ControlOrMeta+Shift+z'); await waitForDisk(files.absolute, edited);
      await file(files.otherPath).click(); await pane().waitFor();
      await file(files.changedPath).click(); await pane().waitFor();
      await current().press('ControlOrMeta+z'); await waitForDisk(files.absolute, files.working);
      await current().press('ControlOrMeta+Shift+z'); await waitForDisk(files.absolute, edited);

      await pane().getByRole('button', {name: '下一个差异', exact: true}).click();
      assert.equal(await position().getAttribute('data-diff-index'), '2');
      await pane().getByRole('button', {name: '下一个差异', exact: true}).click();
      assert.equal(await position().getAttribute('data-diff-index'), '3');
      await assertLineInReader('export const editableLine47 = 247;');
      await pane().getByRole('button', {name: '上一个差异', exact: true}).click();
      assert.equal(await position().getAttribute('data-diff-index'), '2');
      await pane().getByRole('button', {name: '上一个差异', exact: true}).click();
      assert.equal(await position().getAttribute('data-diff-index'), '1');
      await assertLineInReader('export const editableLine3 = 303;');
      const restored = edited.replace('editableLine3 = 303', 'editableLine3 = 3');
      await restore().click(); await waitForDisk(files.absolute, restored);
      assert.equal(await position().getAttribute('data-diff-count'), '2');
      assert.match(files.read(), /editableLine25 = 225/); assert.match(files.read(), /editableLine47 = 247/);
      await current().press('ControlOrMeta+z'); await waitForDisk(files.absolute, edited);
      await current().press('ControlOrMeta+Shift+z'); await waitForDisk(files.absolute, restored);
      assert.equal(files.indexContent(), files.index);

      // Restore by the chunk the cursor actually lands on: after removing the
      // line-3 chunk the remaining chunks are line 25 then line 47.
      await pane().getByRole('button', {name: '下一个差异', exact: true}).click();
      await assertLineInReader('export const editableLine25 = 225;');
      await pane().getByRole('button', {name: '下一个差异', exact: true}).click();
      await assertLineInReader('export const editableLine47 = 247;');
      await restore().click();
      await waitForDisk(files.absolute, restored.replace('editableLine47 = 247', 'editableLine47 = 47'));
      await pane().getByRole('button', {name: '下一个差异', exact: true}).click();
      await assertLineInReader('export const editableLine25 = 225;');
      await restore().click();
      await waitForDisk(files.absolute, files.base);
      assert.equal(await file(files.changedPath).count(), 1, '恢复全部提交基线差异后索引仍不同，更改行保留在统一清单');
      assert.equal(await pane().getAttribute('data-file-id'), fileId, '恢复全部变化后仍保留当前文件和撤销入口');
      assert.equal(await position().getAttribute('data-diff-count'), '0');
      assert.equal(await root().getByLabel('完整绝对路径', {exact: true}).innerText(), files.absolute, '清单行保留后不自动选择其他文件');
      await current().press('ControlOrMeta+z'); await waitForDisk(files.absolute, restored.replace('editableLine47 = 247', 'editableLine47 = 47'));
      await current().press('ControlOrMeta+z'); await waitForDisk(files.absolute, restored);

      await page.setViewportSize({width: 900, height: 900}); await assertNoOverflow();
      await root().getByRole('button', {name: '展开阅读', exact: true}).click();
      await page.setViewportSize({width: 390, height: 844});
      await page.waitForFunction(() => document.querySelector('.code-source-control-page:not([hidden]) .file-diff-editor')?.getAttribute('data-diff-mode') === 'unified');
      await current().click({trial: true});
      await pane().getByRole('button', {name: '下一个差异', exact: true}).click();
      await restore().click({trial: true});
      await assertNoOverflow(); await capture(page, 'source-control-editable-diff-390.png');
      await page.setViewportSize({width: 1440, height: 1000});
      await root().getByRole('button', {name: '恢复分屏', exact: true}).click();

      // 统一更改列表不再提供显式暂存选择；显式分层读取继续由接口保持既有基线。
      const stagedDiff = await page.request.get(api + '/code/diff?' + new URLSearchParams({repositoryId: repository.id, worktreeId: tree.worktreeId, filePath: files.changedPath, area: 'staged'}));
      assert.equal(stagedDiff.status(), 200);
      const stagedBody = await stagedDiff.json();
      assert.equal(stagedBody.area, 'staged', '显式已暂存比较继续以暂存基线读取');
      assert.match(stagedBody.patch || '', /\+export const editableLine3 = 103;/, '已暂存接口仍读取索引内容，不冒充当前文件');
      await selectSourceControlView(root(), 'history');
      const commit = root().locator('.source-control-graph > li[data-source-commit="' + files.commitHash + '"]'); await commit.waitFor();
      const toggle = commit.locator('.source-control-commit-toggle'); if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      await commit.locator('.source-control-commit-children .task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + files.changedPath + '"]')}).click();
      await assertReadOnly(); assert.equal(files.read(), restored); assert.equal(files.indexContent(), files.index);
      await root().getByRole('button', {name: '查看完整文件', exact: true}).click();
      await root().getByRole('button', {name: '查看当前文件', exact: true}).click();
      const explorer = page.locator('.code-explorer-stage:visible'), filePane = explorer.locator('.file-editing-pane:visible');
      const editor = filePane.locator('.file-editing-source .cm-content[contenteditable="true"]'); await editor.waitFor();
      assert.equal(await filePane.getAttribute('data-file-id'), fileId, '资源管理器和差异编辑共用真实文件身份');
      assert.equal(await editor.locator('.cm-deletedChunk').count(), 0, '普通编辑器不残留差异删除装饰');
      await editor.press('ControlOrMeta+z'); await waitForDisk(files.absolute, edited);
      await editor.press('ControlOrMeta+Shift+z'); await waitForDisk(files.absolute, restored);
      await explorer.getByRole('button', {name: '返回源代码管理', exact: true}).click();
      await root().getByRole('button', {name: '返回差异', exact: true}).click();
      await selectSourceControlView(root(), 'changes');
      await file(files.newPath).click(); await pane().waitFor();
      await restore().click(); await waitForDisk(files.newAbsolute, '');
      assert.equal(fs.existsSync(files.newAbsolute), true, '未跟踪全部恢复为空正文，文件对象仍存在');
      assert.equal(await position().getAttribute('data-diff-count'), '0');
      assert.equal(await pane().getByRole('button', {name: '下一个差异', exact: true}).isDisabled(), true);
      await current().press('ControlOrMeta+z'); await waitForDisk(files.newAbsolute, 'export const editableUntracked = 1;\n');
      assert.equal(files.git(['rev-parse', 'HEAD']).trim(), files.commitHash, '编辑和恢复不生成提交');
      assert.deepEqual(branches.otherPositions(branches.location), otherPositions, '其他检出目录的正文、索引及引用未改变');
      assert.equal(await root().locator('[data-change-worktree="' + tree.worktreeId + '"]').isVisible(), true);
      await assertNoOverflow(); await capture(page, 'source-control-editable-diff-untracked-undo.png');
    });
  });

  await scenario('可编辑差异：过期提交基线取消旧块恢复', async () => {
    await withFiles(async (branches: any) => {
      const files = prepareFiles(branches);
      // Defer live polling so the stale baseline cannot refresh before the click.
      await page.addInitScript(() => {
        const state = window as Window & {__editableDiffReadProbe?: {deferPolling: boolean}};
        state.__editableDiffReadProbe = {deferPolling: false};
        const schedule = window.setInterval.bind(window);
        window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
          if (typeof callback !== 'function' || delay !== 5000) return schedule(callback, delay, ...args);
          return schedule((...values: unknown[]) => {if (!state.__editableDiffReadProbe?.deferPolling) callback.apply(window, values);}, delay, ...args);
        }) as typeof window.setInterval;
      });
      await page.setViewportSize({width: 1440, height: 1000}); const {file} = await open(branches, () => page.evaluate(() => {
        (window as Window & {__editableDiffReadProbe: {deferPolling: boolean}}).__editableDiffReadProbe.deferPolling = true;
      }));
      await file(files.changedPath).click(); await pane().waitFor();
      await mode().getByText('左右对比', {exact: true}).click();
      // External partial commit moves HEAD without the open file: add only the
      // other files to the index on top of its staged entry and commit the index.
      files.git(['reset', '-q', '--', files.changedPath]);
      files.git(['add', '--', files.otherPath, files.newPath]);
      files.git(['-c', 'commit.gpgSign=false', 'commit', '-qm', 'external baseline move']);
      await restore().click();
      await page.getByText('最近提交或文件来源已变化，请刷新后重新核对。', {exact: true}).waitFor();
      assert.equal(files.read(), files.working, '过期块不写入旧范围');
      await capture(page, 'source-control-editable-diff-stale-index.png');
    });
  });

  await scenario('可编辑差异：在途保存遇到外部冲突保留双方', async () => {
    await withFiles(async (branches: any) => {
      const files = prepareFiles(branches);
      await page.setViewportSize({width: 1440, height: 1000}); const {file} = await open(branches);
      await file(files.changedPath).click(); await pane().waitFor();
      await mode().getByText('左右对比', {exact: true}).click();
      let release!: () => void; const held = new Promise<void>(resolve => {release = resolve;});
      const routePattern = '**/code/save-file';
      const delayed = async (route: any) => {await held; await route.continue();};
      expectedBrowserErrors.add('/code/save-file'); await page.route(routePattern, delayed);
      try {
        const started = page.waitForRequest((request: any) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/code/save-file'));
        await replaceFirstChange('export const editableLine3 = 603;'); await started;
        const disk = files.working.replace('editableLine3 = 203', 'editableLine3 = 703'); fs.writeFileSync(files.absolute, disk);
        const failed = page.waitForResponse((response: any) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/code/save-file'));
        release(); assert.equal((await failed).status(), 409);
        const dialog = page.getByRole('dialog', {name: '处理文件保存冲突', exact: true}); await dialog.waitFor();
        await dialog.locator('.cm-content[aria-label="磁盘最新内容"]').getByText('export const editableLine3 = 703;', {exact: true}).waitFor();
        await dialog.locator('.cm-content[aria-label="我的输入"]').getByText('export const editableLine3 = 603;', {exact: true}).waitFor();
        assert.equal(files.read(), disk, '冲突不覆盖磁盘外部更新');
        await dialog.getByRole('button', {name: '稍后处理', exact: true}).click();
        await root().getByText('文件已被外部修改，自动保存已暂停', {exact: true}).waitFor();
        await current().getByText('export const editableLine3 = 603;', {exact: true}).waitFor();
        await assertNoOverflow(); await capture(page, 'source-control-editable-diff-conflict-preserved.png');
      } finally {release(); await page.unroute(routePattern, delayed);}
    });
  });
}
