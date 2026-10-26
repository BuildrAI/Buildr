import { runSourceControlReadingJourney } from './source-control-reading-journey.ts';
import { showPrimaryNavigation } from './primary-navigation-controls.ts';
import assert from 'node:assert/strict';
import { runSourceControlActionsJourney } from './source-control-actions-journey.ts';
import { runSourceControlBranchesJourney } from './source-control-branches-journey.ts';
import { runSourceControlEditableDiffJourney } from './source-control-editable-diff-journey.ts';
import { runSourceControlLiveRefreshJourney } from './source-control-live-refresh-journey.ts';
import { runSourceControlSourceSelectionJourney } from './source-control-source-selection-journey.ts';
import { codeRepositoryCode, codeRepositoryLabel } from '../../src/features/code/code-source-labels.ts';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** The host owns isolated Git data; every successful read below comes from production HTTP. */
export async function runSourceControlJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors}: any) {
  const focus = process.env.BUILDR_SOURCE_CONTROL_FOCUS || '';
  const selectedCases: string[] = [];
  const scenario = async (name: string, action: () => Promise<void>) => {
    if (focus && focus !== 'all' && !focus.split('|').some(part => part && name.includes(part))) return;
    assert.ok(!selectedCases.includes(name), 'Duplicate source-control scenario: ' + name);
    selectedCases.push(name); await t.test(name, action);
  };
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  let mainWorktreeId = '', mainRepositoryId = '';
  const catalog = async (taskId?: string) => {
    const response = await page.request.get(api + '/code/source-control' + (taskId ? '?taskId=' + encodeURIComponent(taskId) : ''));
    assert.equal(response.status(), 200); return response.json();
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '源代码管理不能产生页面横向溢出');
  const statusDetails = () => page.locator('.source-control-status-details:visible');
  const assertStatusDetails = async (status: any, remote: string, files: string) => {
    const button = await status.evaluate((element:HTMLElement) => element.matches('button')) ? status : status.locator('.source-control-status-button');
    const inline = await button.count() && await button.isVisible();
    const menuLabel = await status.evaluate((element:HTMLElement) => element.closest('.source-control-repository,.source-control-worktree')!.querySelector('.source-control-row-menu-button')?.getAttribute('aria-label'));
    const menuButton = root().getByRole('button', {name:menuLabel, exact:true});
    if (inline) await button.click();
    else {await menuButton.click(); await page.getByRole('menu', {name:menuLabel, exact:true}).getByRole('menuitem', {name:'查看状态', exact:true}).click();}
    const details = statusDetails(); await details.waitFor();
    assert.equal(await details.locator('dd').nth(0).innerText(), remote);
    assert.equal(await details.locator('dd').nth(1).innerText(), files);
    await (inline ? button : menuButton).press('Escape'); await details.waitFor({state: 'hidden'});
    if (inline) assert.equal(await button.getAttribute('aria-expanded'), 'false');
  };
  const assertLocationCopyRows = async (details: any) => {
    const values = details.locator('dd');
    assert.equal(await values.count(), 2);
    for (const value of await values.all()) {
      assert.equal(await value.getByRole('button').count(), 1, '每个位置值行包含自己的复制按钮');
      const text = await value.locator('code').boundingBox(), button = await value.getByRole('button').boundingBox();
      assert.ok(text && button && button.x >= text.x + text.width - 1 && Math.abs(button.y - text.y) <= 3, '复制按钮位于对应值行后方并对齐首行');
    }
    assert.equal(await details.locator(':scope > .ant-space').count(), 0, '没有单独复制操作行');
  };
  const assertHoverInViewport = async (card: any) => {
    const bounds = await card.evaluate((element: HTMLElement) => {
      const layer = element.closest('.ant-popover') || element, box = layer.getBoundingClientRect();
      return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight};
    });
    assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1, '悬浮信息完整停留在当前视口：' + JSON.stringify(bounds));
    await noOverflow();
  };
  const selectHoverText = async (text: any) => {
    const box = await text.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + Math.min(160, box.width - 4), box.y + box.height / 2, {steps: 8}); await page.mouse.up();
    assert.ok(await page.evaluate(() => (window.getSelection()?.toString().length || 0) > 0), '移入悬浮层后可以真实选择文字');
  };
  const assertSelectionContrast = async (control: any, label: string) => {
    const appearance = (element: HTMLElement) => { const style = getComputedStyle(element); return [style.color, style.backgroundColor, style.fontWeight]; };
    const tab = control.getByRole('tab', {name: label, exact: true});
    if (await tab.count()) {
      assert.equal(await tab.getAttribute('aria-selected'), 'true');
      const activeStyle = await control.locator('.pane-tab.on').evaluate(appearance);
      const inactiveStyle = await control.locator('.pane-tab:not(.on)').first().evaluate(appearance);
      assert.notDeepEqual(activeStyle, inactiveStyle, '选中项的文字和背景应依据实际选中状态保持可区别');
      return;
    }
    assert.equal(await control.getByRole('radio', {name: label, exact: true}).isChecked(), true);
    const activeStyle = await control.locator('.ant-segmented-item:has(input:checked)').evaluate(appearance);
    const inactiveStyle = await control.locator('.ant-segmented-item:has(input:not(:checked))').first().evaluate(appearance);
    assert.notDeepEqual(activeStyle, inactiveStyle, '选中项的文字和背景应依据实际选中状态保持可区别');
  };
  const open = async () => {
    await page.mouse.move(400, 4);
    await page.goto(workspaceUrl + '/code/source-control');
    await root().locator('.source-control-repository-copy').first().waitFor();
    await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
    const observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === fixture.location));
    assert.ok(repository); mainRepositoryId = repository.id; mainWorktreeId = repository.worktrees.find((item: any) => item.location === fixture.location).worktreeId;
    await root().getByRole('button', {name: '查看主工作树 · ' + codeRepositoryLabel(repository), exact: true}).click();
  };
  const checkoutGroup = (id: string) => root().locator('[data-change-worktree="' + id + '"]');
  // 统一“更改”分组：同一路径去重后只有一行，比较语义为 HEAD → 当前文件。
  const fileRow = (id: string, filePath = fixture.path) => checkoutGroup(id).locator('[data-change-area="working"]')
    .locator('.task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + filePath + '"]')});
  const row = (filePath = fixture.path) => fileRow(mainWorktreeId, filePath);
  const diff = () => root().getByRole('region', {name: '差异内容', exact: true});
  const assertTaskIdentity = async () => {
    const task = page.locator('#task-detail-main:visible'); await task.waitFor();
    assert.equal(await task.getAttribute('data-task-id'), 'browser-task');
    const pathname = new URL(page.url()).pathname, owner = new URL(workspaceUrl).pathname + '/tasks';
    assert.ok(pathname === owner || pathname === owner + '/browser-task', '同一任务仍在任务领域内查看');
  };
  // CodeMirror renders a viewport. Read every actual numbered line by scrolling,
  // then restore the user's position instead of requiring the whole document in DOM.
  const readOnlyText = async (code:any) => {
    await code.locator('.cm-scroller').waitFor();
    return code.evaluate(async (element:HTMLElement) => {
      const scroller = element.querySelector<HTMLElement>('.cm-scroller')!, originalTop = scroller.scrollTop;
      const lines = new Map<number,string>();
      const rendered = async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);};
      try {
        scroller.scrollTop = 0; await rendered();
        for (let step = 0; step < 1000; step++) {
          for (const line of element.querySelectorAll<HTMLElement>('.cm-line[data-line]')) lines.set(Number(line.dataset.line), line.textContent || '');
          if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) break;
          scroller.scrollTop += Math.max(1, scroller.clientHeight * 0.7); await rendered();
        }
      } finally {scroller.scrollTop = originalTop; await rendered();}
      return [...lines].sort(([a], [b]) => a - b).map(([number, text], index) => number === index + 1 ? text : '[missing rendered line ' + (index + 1) + ']').join('\n');
    });
  };
  const fullText = async () => readOnlyText(root().locator('.repository-source-code'));
  const waitFull = async (text: string) => {
    await root().locator('.repository-source-code .cm-line').first().waitFor();
    assert.equal(await fullText(), text, '滚动读取的完整只读正文保持精确来源与全部行');
  };
  const commitRow = (hash: string) => root().locator('.source-control-graph > li[data-source-commit="' + hash + '"]');
  const openCommitFile = async (hash: string, filePath: string) => {
    const commit = commitRow(hash); await commit.waitFor();
    const toggle = commit.locator('.source-control-commit-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    const file = commit.locator('.source-control-commit-children .task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + filePath + '"]')});
    await file.waitFor(); await file.click();
    await root().getByLabel('完整绝对路径', {exact:true}).waitFor();
    assert.ok((await root().getByLabel('完整绝对路径', {exact:true}).innerText()).endsWith('/' + filePath), '历史文件仍在所选固定版本来源中显示完整路径');
    return commit;
  };
  const openHistory = async () => {
    await open();
    const observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.worktreeId === mainWorktreeId));
    assert.ok(repository, '两层改动必须属于实际登记实例');
    await root().locator('.source-control-repository-copy').filter({has: page.getByText(codeRepositoryCode(repository), {exact: true})}).click();
    await selectSourceControlView(root(), 'history');
    await openCommitFile(fixture.commitHash, fixture.path);
    await diff().getByText('export const explorerAnswer = 1;', {exact: false}).waitFor();
    return repository;
  };
  const drag = async (locator: any, dx: number, dy: number) => {
    const box = await locator.boundingBox(); assert.ok(box);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, {steps: 12}); await page.mouse.up();
  };

  await runSourceControlReadingJourney({api, assert, assertHoverInViewport, assertLocationCopyRows, assertSelectionContrast, assertStatusDetails, assertTaskIdentity, capture, catalog, checkoutGroup, codeRepositoryLabel, diff, drag, fileRow, fixture, fullText, getMainRepositoryId: () => mainRepositoryId, getMainWorktreeId: () => mainWorktreeId, noOverflow, open, openCommitFile, openHistory, page, root, row, scenario, selectHoverText, selectSourceControlView, showPrimaryNavigation, waitFull, workspaceUrl});
  const linked = fixture.prepareWorktrees();
  const remoteStatuses = fixture.prepareRemoteStatuses(linked);
  const expectedLocations = [...fixture.baselineWorktrees.flatMap((repository: any) => repository.locations), ...linked.map((worktree: any) => worktree.location)];
  const worktrees = async () => {
    const observed = await catalog();
    return linked.map((item: any) => {
      const repository = observed.repositories.find((repo: any) => repo.worktrees.some((worktree: any) => worktree.location === item.location));
      assert.ok(repository, '真实 linked 工作树应被所属登记库发现');
      const worktree = repository.worktrees.find((value: any) => value.location === item.location);
      return {...item, repositoryId: repository.id, repositoryName: repository.name, repositoryLabel: codeRepositoryLabel(repository), worktreeId: worktree.worktreeId, observed: worktree};
    });
  };
  const expanded = async (button: any) => { if (await button.getAttribute('aria-expanded') === 'false') await button.click(); };
  const selectWorktree = async (worktree: any) => {
    const restore = root().getByRole('button', {name: '展开代码库列表', exact: true});
    if (await restore.count()) await restore.click();
    const repository = root().locator('[data-source-repository="' + worktree.repositoryId + '"]');
    if (worktree.worktreeId === mainWorktreeId) await repository.getByRole('button', {name: '查看主工作树 · ' + worktree.repositoryLabel, exact: true}).click();
    else {
      await expanded(repository.locator('.source-control-repository-fold'));
      await repository.locator('[data-source-worktree="' + worktree.worktreeId + '"] .source-control-repository-copy').click();
    }
  };
  const selectFile = async (worktree: any) => {
    await selectWorktree(worktree);
    const group = checkoutGroup(worktree.worktreeId); await group.waitFor();
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1, '下方只显示当前选中工作树');
    await expanded(group.locator('[data-change-area="working"] [data-area-toggle]'));
    await fileRow(worktree.worktreeId, worktree.path).click();
    await diff().getByText(worktree.workingText.trim(), {exact: false}).waitFor();
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(worktree.branch));
    assert.equal(await root().getByLabel('完整绝对路径', {exact:true}).innerText(), worktree.location + '/' + worktree.path, '差异绝对路径使用当前具体工作树而非主目录');
  };

  await scenario('来源行按名称实测逐级隐藏，窄栏全部能力仍在操作菜单', async () => {
    await page.setViewportSize({width:1440, height:1000}); await open();
    const value = (await worktrees()).find((item:any) => item.name === 'alpha'); assert.ok(value);
    const sourceName = '名称优先完整显示的实际工作树'.repeat(2);
    const matchesCatalog = (url:URL) => url.pathname === new URL(api + '/code/source-control').pathname;
    const rename = async (route:any) => {
      const response = await route.fetch(), actual = await response.json();
      // Only display metadata changes; the source identities, Git facts and task route remain real.
      await route.fulfill({response, json:{...actual, repositories:actual.repositories.map((repository:any) => repository.id !== value.repositoryId ? repository : {...repository, worktrees:repository.worktrees.map((worktree:any) => worktree.worktreeId !== value.worktreeId ? worktree : {...worktree, name:sourceName})})}});
    };
    // Install the substitute without an old document's automatic observation
    // already in flight, and drain it before any later document navigation.
    await page.goto('about:blank');
    await page.route(matchesCatalog, rename);
    try {
      await open(); await selectWorktree(value);
      const row = root().locator('[data-source-repository="' + value.repositoryId + '"] [data-source-worktree="' + value.worktreeId + '"] .source-control-worktree');
      const separator = root().getByRole('separator', {name:'调整源代码管理与阅读区宽度', exact:true});
      const menuButton = row.locator('.source-control-row-menu-button');
      const menuLabel = await menuButton.getAttribute('aria-label');
      const menu = () => page.getByRole('menu', {name:menuLabel, exact:true});
      const measure = () => row.evaluate((element:HTMLElement) => {
        const width = (selector:string) => element.querySelector(selector)!.getBoundingClientRect().width;
        const style = getComputedStyle(element), icon = element.querySelector('.source-control-worktree-icon')!, iconStyle = getComputedStyle(icon);
        const name = width('.source-control-row-name-text'), branch = element.querySelector('.source-control-row-action-button')!, branchStyle = getComputedStyle(branch);
        const branchWidth = Math.ceil(Math.max(width('.source-control-row-branch-measure') + parseFloat(branchStyle.paddingLeft) + parseFloat(branchStyle.paddingRight) + parseFloat(branchStyle.borderLeftWidth) + parseFloat(branchStyle.borderRightWidth), parseFloat(branchStyle.minWidth)));
        const shortcuts = width('.source-control-row-shortcuts'), gap = parseFloat(style.columnGap);
        const fixed = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + icon.getBoundingClientRect().width + parseFloat(iconStyle.marginLeft) + parseFloat(iconStyle.marginRight) + width('.source-control-row-action-slot') + gap * 3;
        const copyGap = parseFloat(getComputedStyle(element.querySelector('.source-control-row-copy')!).columnGap);
        return {full:fixed + name + branchWidth + copyGap + shortcuts, branchMinimum:fixed + name + Math.min(branchWidth,48) + copyGap + shortcuts, nameStatus:fixed + name + shortcuts, name, width:element.getBoundingClientRect().width};
      });
      const setWidth = async (width:number, layout:string) => {
        const current = await root().locator('.source-control-sidebar').boundingBox();
        await drag(separator, width - current.width, 0);
        await page.waitForFunction(({id, layout}:{id:string;layout:string}) => [...document.querySelectorAll<HTMLElement>('.code-source-control-page:not([hidden]) .source-control-worktree')].find(element => element.closest('[data-source-worktree]')?.getAttribute('data-source-worktree') === id)?.dataset.sourceRowLayout === layout, {id:value.worktreeId, layout});
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        assert.equal(await row.getAttribute('data-source-row-layout'), layout);
        const actual = await row.evaluate((element:HTMLElement) => {const strong = element.querySelector('strong')!.getBoundingClientRect(), text = element.querySelector('.source-control-row-name-text')!.getBoundingClientRect(), box = element.getBoundingClientRect(), menu = element.querySelector('.source-control-row-menu-button')!.getBoundingClientRect(); return {nameComplete:strong.width >= text.width - 1, height:box.height, menuInside:menu.left >= box.left && menu.right <= box.right, width:box.width};});
        assert.equal(actual.height, 36, '不同宽度均维持单行来源'); assert.equal(actual.menuInside, true, '末尾菜单始终位于行内');
        return actual;
      };
      await separator.press('End'); const required = await measure();
      assert.ok(required.nameStatus > 280 && required.full < 1000, '实测长名称覆盖三级压缩的真实宽度区间：' + JSON.stringify(required));
      assert.equal((await setWidth(Math.ceil(required.full) + 12, 'full')).nameComplete, true);
      const branch = row.locator('.source-control-row-action-button'); assert.equal(await branch.isVisible(), true);
      const branchLabel = branch.locator('.source-control-row-branch-name');
      assert.equal(await branchLabel.textContent(), value.branch, '宽栏完整分支名称');
      const widthBeforeFont = (await row.boundingBox()).width;
      await row.locator('.source-control-row-name-text').evaluate((element:HTMLElement) => {element.style.fontSize='24px';});
      await page.waitForFunction((id:string) => [...document.querySelectorAll<HTMLElement>('.code-source-control-page:not([hidden]) .source-control-worktree')].find(element => element.closest('[data-source-worktree]')?.getAttribute('data-source-worktree') === id)?.dataset.sourceRowLayout !== 'full', value.worktreeId);
      assert.equal((await row.boundingBox()).width, widthBeforeFont, '字号变化时栏宽不变仍重新测量');
      await row.locator('.source-control-row-name-text').evaluate((element:HTMLElement) => {element.style.fontSize='';});
      await setWidth(Math.ceil(required.full) + 12, 'full');
      assert.ok(required.full - required.branchMinimum > 24, '实际长分支提供连续省略区间');
      let previousWidth = (await branch.boundingBox()).width;
      const naturalWidth = await branch.locator('.source-control-row-branch-measure').evaluate((element:HTMLElement) => element.getBoundingClientRect().width);
      for (const ratio of [0.5]) {
        assert.equal((await setWidth(Math.floor(required.branchMinimum + (required.full - required.branchMinimum) * ratio), 'branch-clipped')).nameComplete, true);
        const clipping = await branch.evaluate((element:HTMLElement) => {const label=element.querySelector<HTMLElement>('.source-control-row-branch-name')!, style=getComputedStyle(label);return {width:element.getBoundingClientRect().width, overflow:label.scrollWidth > label.clientWidth, ellipsis:style.textOverflow, whiteSpace:style.whiteSpace, transition:getComputedStyle(element).transitionProperty};});
        assert.equal(await branch.isVisible(), true, '连续缩窄时分支保持可用');
        assert.ok(clipping.width < previousWidth - 1 && clipping.width >= 48, '分支宽度连续递减，低于可读下限才隐藏：' + JSON.stringify(clipping));
        assert.equal(clipping.overflow, true); assert.equal(clipping.ellipsis, 'ellipsis'); assert.equal(clipping.whiteSpace, 'nowrap');
        assert.ok(!clipping.transition.includes('all') && !clipping.transition.includes('width'), '可见分支的宽度跟随拖动，不能滞后覆盖名称或快捷');
        assert.equal(await branch.locator('.source-control-row-branch-measure').evaluate((element:HTMLElement) => element.getBoundingClientRect().width), naturalWidth, '截断不会改变自然宽读数或导致密度振荡');
        assert.equal(await branchLabel.textContent(), value.branch); assert.equal(await branch.getAttribute('title'), value.branch + ' · 管理分支');
        assert.equal(await row.locator('.source-control-worktree-status').isVisible(), true);
        previousWidth = clipping.width;
      }
      await capture(page, 'source-control-branch-progressive-clipping.png');
      await branch.click();
      const clippedManager = page.getByRole('region', {name:'分支管理 · ' + value.repositoryLabel + ' · ' + sourceName, exact:true}); await clippedManager.waitFor();
      await clippedManager.getByRole('button', {name:'管理 ' + value.branch, exact:true}).waitFor();
      await branch.press('Escape'); await clippedManager.waitFor({state:'hidden'}); assert.equal(await branch.getAttribute('aria-expanded'), 'false', '省略后的原分支按钮仍打开同一真实来源管理层');
      assert.equal((await setWidth(Math.ceil(required.full) + 12, 'full')).nameComplete, true);
      assert.equal(await branchLabel.evaluate((element:HTMLElement) => element.scrollWidth <= element.clientWidth + 1), true, '拉宽恢复完整分支文字');
      assert.equal((await setWidth(Math.floor(required.branchMinimum) - 2, 'name-status')).nameComplete, true);
      const branchVisibility = await branch.evaluate((element:HTMLElement) => {
        const matches:unknown[] = [];
        const inspect = (rules:CSSRuleList, href:string|null) => {for (const rule of rules) {
          if (rule instanceof CSSStyleRule && rule.style.getPropertyValue('visibility') && element.matches(rule.selectorText)) matches.push({href, selector:rule.selectorText, value:rule.style.getPropertyValue('visibility'), priority:rule.style.getPropertyPriority('visibility')});
          else if ('cssRules' in rule) inspect((rule as CSSGroupingRule).cssRules, href);
        }};
        for (const sheet of document.styleSheets) inspect(sheet.cssRules, sheet.href);
        return {css:getComputedStyle(element).visibility, parentCSS:getComputedStyle(element.parentElement!).visibility, rowLayout:element.closest('.source-control-worktree')?.getAttribute('data-source-row-layout'), html:element.outerHTML, parents:element.parentElement!.outerHTML, rowWidth:element.closest('.source-control-worktree')!.getBoundingClientRect().width, stylesheets:[...document.styleSheets].map(sheet => sheet.href), matches};
      });
      assert.equal(await branch.isVisible(), false, '整段分支隐藏：' + JSON.stringify(branchVisibility)); assert.equal(await row.locator('.source-control-worktree-status').isVisible(), true, '名称完整时先隐藏整段分支');
      const noShortcuts = await setWidth(Math.floor(required.nameStatus) - 8, 'name'); assert.equal(noShortcuts.nameComplete, true, '隐藏快捷后仍优先完整名称');
      assert.equal(await row.locator('.source-control-worktree-status').isVisible(), false); assert.equal(await row.locator('.source-control-task-link').isVisible(), false);
      for (const shortcut of await row.locator('.source-control-row-shortcuts button').all()) assert.equal(await shortcut.isVisible(), false, '快捷子按钮不能被浮层触发器显式visibility重新显示');
      assert.equal((await setWidth(260, 'name')).nameComplete, false, '所有次要入口隐藏后才省略长名称');
      const parentFold = root().locator('[data-source-repository="' + value.repositoryId + '"] .source-control-repository-fold');
      await menuButton.focus(); await menuButton.press('Shift+Tab');
      assert.equal(await row.locator('.source-control-repository-copy').evaluate((element:HTMLElement) => document.activeElement === element && element.matches(':focus-visible')), true, '隐藏快捷与分支后菜单的上一个键盘入口是来源名称');
      const locationCard = page.getByRole('article', {name:'工作树来源信息', exact:true}); await locationCard.waitFor();
      await parentFold.focus(); await parentFold.press('Enter'); await locationCard.waitFor({state:'hidden'});
      await parentFold.press('Enter'); assert.equal(await locationCard.isVisible(), false, '隐藏行来源路径卡关闭，重新展开不重播');
      await menuButton.focus(); await menuButton.press('Enter'); await menu().waitFor();
      for (const label of ['管理分支', '查看状态', '打开关联任务', '同步', '获取远程']) assert.equal(await menu().getByRole('menuitem', {name:label, exact:true}).count(), 1);
      await menu().getByRole('menuitem', {name:'管理分支', exact:true}).focus(); await page.keyboard.press('Enter');
      const manager = page.getByRole('region', {name:'分支管理 · ' + value.repositoryLabel + ' · ' + sourceName, exact:true}); await manager.waitFor();
      const branchSearch = manager.getByRole('textbox', {name:'搜索可用分支（Branch）', exact:true});
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '搜索可用分支（Branch）');
      assert.equal(await branchSearch.evaluate((element:HTMLElement) => document.activeElement === element), true, '隐藏分支的键盘菜单进入真实管理层');
      await manager.getByRole('button', {name:'管理 ' + value.branch, exact:true}).waitFor();
      await branchSearch.press('Escape'); await manager.waitFor({state:'hidden'});
      assert.equal(await menuButton.evaluate((element:HTMLElement) => document.activeElement === element), true, '关闭管理层焦点返回可见菜单');
      await menuButton.click(); await menu().getByRole('menuitem', {name:'管理分支', exact:true}).click(); await manager.waitFor();
      await parentFold.focus(); await parentFold.press('Enter'); await manager.waitFor({state:'hidden'});
      assert.equal(await parentFold.getAttribute('aria-expanded'), 'false');
      // Parent hiding masks the closing overlay immediately. Observe the actual
      // closed state and exit completion before checking for a replay.
      await row.locator('.source-control-row-action-button[aria-expanded="false"]').waitFor({state:'attached'});
      await page.waitForFunction((name:string)=>![...document.querySelectorAll('[role="region"]')].some(node=>node.getAttribute('aria-label')===name),'分支管理 · ' + value.repositoryLabel + ' · ' + sourceName);
      await parentFold.press('Enter'); assert.equal(await manager.isVisible(), false, '键盘重新展开父库不重播旧管理请求');
      await menuButton.click(); await menu().getByRole('menuitem', {name:'查看状态', exact:true}).click(); const details = statusDetails(); await details.waitFor();
      assert.equal(await details.locator('dd').nth(2).innerText(), '浏览器任务');
      await parentFold.focus(); await parentFold.press('Enter'); await details.waitFor({state:'hidden'});
      await parentFold.press('Enter'); assert.equal(await details.count(), 0, '键盘重新展开父库不重播旧状态详情');
      await capture(page, 'source-control-name-priority-menu-260px.png'); await noOverflow();
      await menuButton.click(); await menu().getByRole('menuitem', {name:'打开关联任务', exact:true}).click(); await assertTaskIdentity();
      await page.unrouteAll({behavior:'wait'});
      await page.goto(workspaceUrl + '/code/source-control'); await root().locator('.source-control-repository-copy').first().waitFor(); await separator.dblclick();
    } finally {await page.unrouteAll({behavior:'wait'});}
  });

  await scenario('任务原改动阅读与源代码管理双向关联，真实工作树预选和返回保留现场', async () => {
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha');
    await page.setViewportSize({width: 1440, height: 1000}); await page.goto(workspaceUrl + '/tasks/browser-task');
    const task = page.locator('#task-detail-main:visible'); await task.locator('[data-task-content=changes]').click();
    const reader = task.getByRole('region', {name: '改动与提交工作台', exact: true}); await reader.waitFor(); await assertTaskIdentity();
    const current = reader.locator('.task-rail-body > section > .task-changed-list .task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + fixture.path + '"]')}).first();
    await current.click(); await reader.getByRole('region', {name: '差异内容', exact: true}).getByText(alpha.workingText.trim(), {exact: false}).waitFor();
    const selected = await reader.locator('.task-changed-list > .is-selected .task-changed-path').first().getAttribute('data-file-path');
    // Task scope is observed per repository; only the read for the task's own repository carries its preselection.
    const response = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-control') && url.searchParams.get('taskId') === 'browser-task' && url.searchParams.get('repositoryId') === alpha.repositoryId; });
    await task.locator('[data-task-source-control="browser-task"]').click(); const observed = await (await response).json();
    assert.ok(observed.selectedWorktrees.some((item: any) => item.repositoryId === alpha.repositoryId && item.worktreeId === alpha.worktreeId), '任务预选=' + JSON.stringify(observed.selectedWorktrees) + ' 说明=' + observed.scopeReason);
    await checkoutGroup(alpha.worktreeId).waitFor(); assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1, '精确任务范围来自已核对evidence');
    await selectFile(alpha);
    const repository = (await catalog()).repositories.find((item: any) => item.id === alpha.repositoryId);
    assert.ok(repository);
    // This scenario opens through the task, so it must resolve the main worktree identity itself.
    mainRepositoryId = repository.id;
    const main = repository.worktrees.find((item: any) => item.location === fixture.location);
    assert.ok(main, '任务所属登记库必须包含主工作树');
    mainWorktreeId = main.worktreeId;
    await root().getByRole('button', {name: '查看主工作树 · ' + codeRepositoryLabel(repository), exact: true}).click();
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
    assert.equal(await checkoutGroup(mainWorktreeId).isVisible(), true);
    // Task preselection is retained locally; explicit refresh reconciles the shared
    // workspace catalog rather than repeating the task's initial selection read.
    // Progressive refresh reconciles the shared workspace catalog as an inventory read plus
    // per-repository reads; none of them may carry the task scope again.
    const refreshed = page.waitForRequest((request: any) => { const url = new URL(request.url()); return /\/code\/source-control(-inventory)?$/.test(url.pathname) && !url.searchParams.has('taskId'); });
    const refreshButton = root().getByRole('button', {name: '刷新源代码管理', exact: true}); await refreshButton.click(); await refreshed;
    await refreshButton.locator('.anticon-spin').waitFor({state: 'hidden'});
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
    assert.equal(await checkoutGroup(mainWorktreeId).isVisible(), true, '刷新保留用户选中的主工作树，不重放任务预选');
    await selectWorktree(alpha);
    const taskLink = root().locator('[data-source-repository="' + alpha.repositoryId + '"] [data-source-worktree="' + alpha.worktreeId + '"]').getByRole('button', {name: /^(打开|进入)任务 浏览器任务$/});
    await taskLink.click(); await reader.waitFor(); await assertTaskIdentity();
    assert.equal(await task.locator('[data-task-content=changes]').getAttribute('aria-selected'), 'true');
    assert.equal(await reader.locator('.task-changed-list > .is-selected .task-changed-path').first().getAttribute('data-file-path'), selected);
    assert.ok((await reader.getByRole('region', {name: '差异内容', exact: true}).innerText()).includes(alpha.workingText.trim()));
    await noOverflow(); await capture(page, 'source-control-fixture-task-worktree-return.png');
  });
  await runSourceControlEditableDiffJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors,scenario});
  await runSourceControlBranchesJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors,scenario});
  await runSourceControlActionsJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors,scenario});
  await runSourceControlLiveRefreshJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors,scenario});
  await runSourceControlSourceSelectionJourney({t,page,workspaceUrl,capture,expectedBrowserErrors,fixture:{...fixture,prepareWorktrees:worktrees},scenario});
  if (focus) {
    assert.ok(selectedCases.length, '源码管理 focus 必须选择至少一个真实场景');
    process.stderr.write('[buildr-browser-code-focus] ' + JSON.stringify({focus,cases:selectedCases}) + '\n');
  }
}
