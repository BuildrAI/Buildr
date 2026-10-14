import assert from 'node:assert/strict';
import { runSourceControlActionsJourney } from './source-control-actions-journey.ts';
import { runSourceControlBranchesJourney } from './source-control-branches-journey.ts';

/** The host owns isolated Git data; every successful read below comes from production HTTP. */
export async function runSourceControlJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors}: any) {
  const focus = process.env.BUILDR_SOURCE_CONTROL_FOCUS || '';
  const selectedCases: string[] = [];
  const scenario = async (name: string, action: () => Promise<void>) => {
    if (focus && focus !== 'all' && !focus.split('|').some(part => part && name.includes(part))) return;
    selectedCases.push(name); await t.test(name, action);
  };
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  let mainWorktreeId = '';
  const catalog = async (taskId?: string) => {
    const response = await page.request.get(api + '/code/source-control' + (taskId ? '?taskId=' + encodeURIComponent(taskId) : ''));
    assert.equal(response.status(), 200); return response.json();
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '源代码管理不能产生页面横向溢出');
  const statusDetails = () => page.locator('.source-control-status-details:visible');
  const assertStatusCounts = async (status: any, expected: {ahead?: number; behind?: number; files?: number}) => {
    const counts = await status.locator('.source-control-status-count').evaluateAll((elements: HTMLElement[]) => elements.map(element => ({
      kind: element.getAttribute('data-status-kind'), count: Number(element.querySelector('.source-control-status-number')!.textContent),
    })));
    assert.deepEqual(counts, Object.entries(expected).filter(([, count]) => typeof count === 'number' && count > 0).map(([kind, count]) => ({kind, count})), '目录只常驻实际非零数量，零值可在状态详情查看');
  };
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
  const assertHoverBesideList = async (card: any) => {
    await assertHoverInViewport(card);
    const right = await root().locator('.source-control-sidebar').evaluate((element: HTMLElement) => element.getBoundingClientRect().right);
    const left = await card.evaluate((element: HTMLElement) => (element.closest('.ant-popover') || element).getBoundingClientRect().left);
    assert.ok(left >= right - 1, '目录与历史悬浮信息位于列表右侧，不占用上下选行路径：' + JSON.stringify({left, right}));
  };
  const hoverThenVerticalClick = async (from: any, target: any, card: any, screenshot: string) => {
    const start = await from.boundingBox(), end = await target.boundingBox(); assert.ok(start && end);
    const left = Math.max(start.x, end.x), right = Math.min(start.x + start.width, end.x + end.width);
    assert.ok(right > left + 2, '两行有共同的鼠标文字列');
    const x = left + Math.min(20, (right - left) / 2), fromY = start.y + start.height / 2, toY = end.y + end.height / 2;
    // Enter the row anew after any previous click; the tested open-card movement remains strictly vertical.
    await page.mouse.move(start.x - 3, fromY, {steps: 2});
    await page.mouse.move(x, fromY, {steps: 8}); await card.waitFor(); await page.waitForTimeout(200);
    await assertHoverBesideList(card); await capture(page, screenshot);
    await page.mouse.move(x, toY, {steps: 8});
    const hit = await target.evaluate((element: HTMLElement, point: {x: number; y: number}) => {
      const actual = document.elementFromPoint(point.x, point.y);
      return {inside: Boolean(actual && element.contains(actual)), hovered: element.matches(':hover'), actual: actual?.tagName};
    }, {x, y: toY});
    assert.ok(hit.inside && hit.hovered, '卡已打开后同列垂直移动仍命中目标行：' + JSON.stringify(hit));
    await target.click({position: {x: x - end.x, y: end.height / 2}});
  };
  const dismissHoverCards = async () => {
    await page.mouse.move(5, 5);
    await page.mouse.click(5, 5);
    await page.locator('.selectable-hover-card:visible').waitFor({state: 'hidden'});
  };
  const closeHover = async (card: any) => {
    await dismissHoverCards();
    await card.waitFor({state: 'hidden'});
  };
  const selectHoverText = async (text: any) => {
    const box = await text.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + Math.min(160, box.width - 4), box.y + box.height / 2, {steps: 8}); await page.mouse.up();
    assert.ok(await page.evaluate(() => (window.getSelection()?.toString().length || 0) > 0), '移入悬浮层后可以真实选择文字');
  };
  const enterHoverCard = async (card: any) => {
    await card.evaluate(async (element: HTMLElement) => {
      const layer = element.closest('.ant-popover') || element;
      // rc-motion starts its animation on a later frame. A one-time animation
      // snapshot can therefore precede the final placement and produce a stale hit point.
      let previous = '', stable = 0;
      for (let frame = 0; frame < 120; frame++) {
        await new Promise(requestAnimationFrame);
        const box = element.getBoundingClientRect(), bounds = [box.x,box.y,box.width,box.height].join(',');
        const moving = /(?:appear|enter)(?:-|\s|$)/.test(layer.className) || layer.getAnimations({subtree:true}).some(animation => animation.playState === 'running' || animation.pending);
        stable = !moving && box.width > 0 && box.height > 0 && bounds === previous ? stable + 1 : 0;
        previous = bounds;
        if (stable >= 3) return;
      }
      throw new Error('工作树信息层未在取点前稳定');
    });
    const box = await card.boundingBox(); assert.ok(box);
    // Enter the observed card directly, as a user does. Locator.hover's automatic
    // scroll/stability wait can outlast the card's pointer-leave grace period.
    await page.mouse.move(box.x + Math.min(20, box.width / 2), box.y + Math.min(20, box.height / 2), {steps: 4});
    const point = {x:box.x + Math.min(20,box.width/2),y:box.y + Math.min(20,box.height/2)};
    await card.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const pointerInside = await card.evaluate((element:HTMLElement, position:{x:number;y:number}) => { const hit=document.elementFromPoint(position.x,position.y);return Boolean(hit && element.contains(hit) && hit.closest('article')===element); }, point);
    if (!pointerInside) {
      const actual = await card.evaluate((element:HTMLElement, position:{x:number;y:number}) => {const hit=document.elementFromPoint(position.x,position.y);return {bounds:element.getBoundingClientRect().toJSON(), hit:hit?.outerHTML.slice(0,400), parent:hit?.closest('article')?.getAttribute('aria-label')};}, point);
      process.stderr.write('[source-control-hover-position-failure] ' + JSON.stringify({box, point, actual}) + '\n');
      await capture(page, 'source-control-hover-position-failure.png');
    }
    assert.equal(pointerInside, true, '真实命中必须属于同一个工作树信息层');
    await page.waitForFunction(({x,y}: {x:number;y:number}) => {
      const hit=document.elementFromPoint(x,y), owner=hit?.closest('article[aria-label="工作树来源信息"]');
      return Boolean(owner && owner.matches(':hover'));
    }, point, {polling:'raf',timeout:1500}).catch(()=>{});
    const entered = await card.evaluate((element: HTMLElement) => element.matches(':hover'));
    if (!entered) {
      const actual = await page.evaluate(({x,y}: {x:number;y:number}) => { const hit = document.elementFromPoint(x,y);return {hit:hit ? {tag:hit.tagName,className:hit.getAttribute('class'),text:hit.textContent?.slice(0,180),owner:hit.closest('article')?.getAttribute('aria-label')} : null,hovered:[...document.querySelectorAll(':hover')].map(element=>({tag:element.tagName,className:element.getAttribute('class')})).slice(-12)}; }, point);
      process.stderr.write('[source-control-hover-hit-failure] '+JSON.stringify({box,pointerInside,actual})+'\n');
      await capture(page,'source-control-hover-hit-failure.png');
    }
    assert.equal(entered, true, '指针实际进入可操作的信息层');
  };
  const assertSelectionContrast = async (control: any, label: string) => {
    assert.equal(await control.getByRole('radio', {name: label, exact: true}).isChecked(), true);
    const appearance = (element: HTMLElement) => { const style = getComputedStyle(element); return [style.color, style.backgroundColor, style.fontWeight]; };
    const activeStyle = await control.locator('.ant-segmented-item:has(input:checked)').evaluate(appearance);
    const inactiveStyle = await control.locator('.ant-segmented-item:has(input:not(:checked))').first().evaluate(appearance);
    assert.notDeepEqual(activeStyle, inactiveStyle, '选中项的文字和背景应依据实际选中状态保持可区别');
  };
  const open = async () => {
    await page.goto(workspaceUrl + '/code/source-control');
    await root().locator('.source-control-repository-copy').first().waitFor();
    const observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === fixture.location));
    assert.ok(repository); mainWorktreeId = repository.worktrees.find((item: any) => item.location === fixture.location).worktreeId;
    await root().getByRole('button', {name: '查看主工作树 · ' + repository.name, exact: true}).click();
  };
  const areaValue: Record<string,string> = {'未暂存': 'unstaged', '已暂存': 'staged', '未跟踪': 'untracked'};
  const checkoutGroup = (id: string) => root().locator('[data-change-worktree="' + id + '"]');
  const fileRow = (id: string, area: string, filePath = fixture.path) => checkoutGroup(id).locator('[data-change-area="' + area + '"]')
    .locator('.task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + filePath + '"]')});
  const row = (area: string) => fileRow(mainWorktreeId, areaValue[area]);
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
    await root().locator('.source-control-repository-copy').filter({has: page.getByText(repository.name, {exact: true})}).click();
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
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

  await scenario('源代码管理真实清单、同文件两层差异与实际暂存全文', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 900}); await open();
    const observed = await catalog();
    assert.ok(observed.repositories.length >= 2, '覆盖工作空间与独立登记的第二个代码库');
    assert.ok(!observed.diagnostics.some((item: any) => item.code === 'code_task_location_unavailable'), '普通源代码管理不继承其他任务的退役关联诊断，当前 Git 工作树事实独立读取');
    assert.equal(await root().getByRole('alert').filter({hasText: fixture.unrelatedRetiredTaskId}).count(), 0);
    assert.equal(new Set(observed.repositories.map((item: any) => item.id)).size, observed.repositories.length);
    assert.deepEqual(observed.repositories.flatMap((repository: any) => repository.worktrees.map((worktree: any) => worktree.location)).sort(), fixture.baselineWorktrees.flatMap((repository: any) => repository.locations).sort(), '源代码管理保留主线实际 Git 工作树清单中的全部来源');
    assert.equal(await root().locator('.source-control-repository').count(), observed.repositories.length);
    for (const repository of observed.repositories) {
      const rendered = root().locator('[data-source-repository="' + repository.id + '"]');
      assert.equal(await rendered.count(), 1);
      const main = repository.worktrees.find((item: any) => item.isMain);
      const primary = rendered.locator(':scope > .source-control-repository');
      const status = primary.locator('.source-control-status-button');
      if (main?.upstream === null && main.status !== 'unavailable') {
        assert.equal(await status.getAttribute('data-remote-state'), 'untracked');
        assert.ok((await status.getAttribute('aria-label')).includes('未跟踪远程分支'));
        assert.equal(await status.locator('.anticon-cloud.is-untracked').count(), 1);
        assert.equal(await status.locator('.anticon-check').count(), 0, '没有远程跟踪时不冒充综合清洁');
      }
      if (main?.fileCount > 0) assert.ok((await status.getAttribute('aria-label')).includes(main.fileCount + ' 个未提交文件'));
    }
    assert.equal(await row('已暂存').count(), 1); assert.equal(await row('未暂存').count(), 1);
    await row('已暂存').click(); await diff().getByText('export const sourceControlIndex = 21;', {exact: false}).waitFor();
    assert.ok(!(await diff().innerText()).includes('sourceControlWorking'));
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.indexText);
    assert.match(await root().locator('.code-location-summary').innerText(), /已暂存/);
    const locationButton = root().locator('.code-location-summary'), positionInfo = root().getByRole('region', {name: '位置信息', exact: true});
    await locationButton.hover(); await page.waitForTimeout(450);
    assert.equal(await locationButton.getAttribute('aria-expanded'), 'false');
    assert.equal(await positionInfo.count(), 0, '来源摘要只在点击后披露，不因悬停展开');
    await locationButton.click(); await positionInfo.waitFor();
    assert.equal(await locationButton.getAttribute('aria-controls'), await positionInfo.getAttribute('id'));
    assert.equal(await positionInfo.locator('dd code').first().innerText(), fixture.location);
    assert.deepEqual(await positionInfo.locator('dt').allTextContents(), ['目录', '分支'], '位置信息只展示必要的目录和分支');
    await assertLocationCopyRows(positionInfo);
    assert.ok(!(await positionInfo.innerText()).includes('观察版本'));
    await positionInfo.getByRole('button', {name: '复制路径', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.location);
    await positionInfo.getByRole('button', {name: '复制分支', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.worktreeId === mainWorktreeId)).worktrees.find((worktree: any) => worktree.worktreeId === mainWorktreeId).branch);
    await capture(page, 'source-control-fixture-position-inline.png');
    await positionInfo.getByRole('button', {name: '复制路径', exact: true}).press('Escape');
    await positionInfo.waitFor({state: 'hidden'}); assert.equal(await locationButton.getAttribute('aria-expanded'), 'false');
    await locationButton.click(); await positionInfo.getByRole('button', {name: '收起位置信息', exact: true}).click(); await positionInfo.waitFor({state: 'hidden'});
    await capture(page, 'source-control-fixture-staged-full.png');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    await row('未暂存').click(); await diff().getByText('export const sourceControlWorking = 34;', {exact: false}).waitFor();
    const absoluteMain = fixture.location + '/' + fixture.path;
    assert.equal(await root().getByLabel('完整绝对路径', {exact: true}).innerText(), absoluteMain);
    assert.equal(await diff().locator('.task-diff-split-side').first().locator('.task-diff-row').first().innerText(), fixture.indexText.trim(), '左右对比直接从真实代码开始，没有机器补丁头');
    assert.equal(await diff().locator('.task-diff-split-side').last().locator('.task-diff-row').first().innerText(), fixture.workingText.trim());
    await root().locator('.task-diff-actions').getByText('上下对比', {exact:true}).click();
    await diff().locator('.task-diff-text').waitFor();
    assert.equal(await diff().locator('.line-meta,.line-hunk').count(), 0, '单区块上下对比不展示机器头或首个区块标记');
    assert.equal(await diff().locator('.task-diff-line').first().locator('em').innerText(), '−' + fixture.indexText.trim());
    assert.equal(await diff().locator('.task-diff-line').last().locator('em').innerText(), '+' + fixture.workingText.trim());
    await root().locator('.task-diff-actions').getByText('左右对比', {exact:true}).click();
    await diff().getByRole('region', {name:'并排差异',exact:true}).waitFor();
    await root().locator('.task-diff-toolbar').getByRole('button', {name: '复制路径', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), absoluteMain);
    const mainFileRow = row('未暂存');
    const pathHoverStart = Date.now(); await mainFileRow.hover();
    const pathHint = page.getByRole('tooltip', {name: absoluteMain, exact: true}); await pathHint.waitFor({timeout: 600});
    assert.ok(Date.now() - pathHoverStart < 600, '路径提示快速显示完整真实绝对路径');
    assert.equal(await pathHint.evaluate((element: HTMLElement) => getComputedStyle(element).pointerEvents), 'none', '路径提示不拦截相邻行选择');
    assert.equal(await mainFileRow.locator('.task-changed-path').innerText(), '', '普通文件不常驻相对目录');
    assert.equal(await mainFileRow.locator('.task-changed-path').isVisible(), false, '无目录提示时不占文件名空间');
    assert.equal(await mainFileRow.locator('.task-changed-path').getAttribute('title'), null, '不保留迟到的原生相对路径提示');
    await row('已暂存').click(); await diff().getByText('export const sourceControlIndex = 21;', {exact:false}).waitFor();
    await row('未暂存').click(); await diff().getByText('export const sourceControlWorking = 34;', {exact:false}).waitFor();
    assert.equal(await root().locator('.task-diff-scope,.source-control-history-version').count(),0, '差异头没有重复来源说明或独立比较带');
    await capture(page, 'source-control-file-name-priority.png');
    assert.ok((await diff().innerText()).includes('sourceControlIndex = 21'));
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.workingText);
    assert.ok(!(await fullText()).includes('sourceControlIndex'));
    await noOverflow(); await capture(page, 'source-control-fixture-working-full.png');
    const peer = observed.repositories.find((repository: any) => repository.location === fixture.unavailableRepositoryLocation); assert.ok(peer);
    const refreshCatalog = async () => {
      const response = page.waitForResponse((returned: any) => new URL(returned.url()).pathname.endsWith('/code/source-control'));
      await root().getByRole('button', {name: '刷新源代码管理', exact: true}).click();
      const returned = await response; assert.equal(returned.status(), 200); const body = await returned.json();
      await root().locator('.source-control-title .anticon-spin').waitFor({state: 'hidden'}); return body;
    };
    await fixture.withUnavailableRepository(async () => {
      const unavailable = (await refreshCatalog()).repositories.find((repository: any) => repository.id === peer.id);
      assert.ok(unavailable); assert.equal(unavailable.worktreeCount, null); assert.equal(unavailable.fileCount, null); assert.ok(unavailable.diagnostics.length);
      const upper = root().locator('[data-source-repository="' + peer.id + '"]');
      const status = upper.locator('.source-control-status-button');
      assert.equal(await status.getAttribute('data-remote-state'), 'unavailable');
      assert.equal(await status.getAttribute('data-file-state'), 'unavailable');
      assert.equal(await status.locator('.anticon-question-circle').count(), 1);
      await assertStatusDetails(status, '远程状态不可读取', '未提交文件数量不可读取');
      assert.equal(await root().locator('[data-change-repository="' + peer.id + '"]').count(), 0, '无关不可读代码库不进入当前工作树变更列表');
      assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
      await waitFull(fixture.workingText); await capture(page, 'source-control-fixture-unavailable-repository.png');
    });
    const restored = (await refreshCatalog()).repositories.find((repository: any) => repository.id === peer.id);
    assert.ok(restored.available); assert.equal(restored.worktreeCount, fixture.baselineWorktrees.find((repository: any) => repository.location === fixture.unavailableRepositoryLocation).locations.length); await waitFull(fixture.workingText);
    await fixture.withImages(async (images: any) => {
      await open(); const imageCatalog = await catalog();
      const identify = (checkout: any) => {
        const repository = imageCatalog.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === checkout.location)); assert.ok(repository);
        return {...checkout,repositoryId:repository.id,repositoryName:repository.name,worktreeId:repository.worktrees.find((worktree: any) => worktree.location === checkout.location).worktreeId};
      };
      const primary = identify(images.primary), peerImage = identify(images.peer), versions = images.versions;
      const preview = () => root().getByRole('region', {name: '图片差异', exact: true});
      const selectCheckout = async (checkout: any) => {
        const repository = root().locator('[data-source-repository="' + checkout.repositoryId + '"]'), fold = repository.locator('.source-control-repository-fold');
        if (await fold.getAttribute('aria-expanded') !== 'true') await fold.click();
        await repository.locator('[data-source-worktree="' + checkout.worktreeId + '"] .source-control-repository-copy').click();
      };
      const decodeImage = async (image: any, version: any) => {
        await image.waitFor();
        await page.waitForFunction(({content,width,height}: any) => [...document.querySelectorAll('.code-source-control-page:not([hidden]) img')].some(element => {
          const image = element as HTMLImageElement;
          return image.src === content && image.complete && image.naturalWidth === width && image.naturalHeight === height;
        }), {content:version.content,width:version.width,height:version.height});
        assert.equal(await image.getAttribute('src'), version.content);
        const loaded = await image.evaluate((element: HTMLImageElement) => ({complete:element.complete,width:element.naturalWidth,height:element.naturalHeight}));
        assert.deepEqual(loaded, {complete:true,width:version.width,height:version.height}, '真实PNG字节必须由浏览器完整解码');
      };
      const assertSide = async (side: string, version: any) => {
        const figure = preview().locator('figure[data-side="' + side + '"]');
        if (!version) {
          await figure.waitFor({state:'hidden'});
          assert.equal(await figure.count(), 0, '缺失版本不占用图片卡位置');
          assert.equal(await preview().getByText(side === 'before' ? '此版本中没有图片' : '图片已删除', {exact:true}).count(), 0);
        } else await decodeImage(figure.getByRole('img'), version);
      };
      const assertImageLayout = async (mode: 'added'|'deleted'|'paired-wide'|'paired-narrow') => {
        const layout = await preview().locator('.source-control-image-pair').evaluate((element: HTMLElement) => {
          const rect = (item: Element) => {const box=item.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};};
          return {content:rect(element),cards:[...element.querySelectorAll(':scope > figure')].map(card=>({...rect(card),side:card.getAttribute('data-side'),title:card.querySelector('strong')!.textContent}))};
        });
        if (mode === 'added' || mode === 'deleted') {
          assert.equal(layout.cards.length, 1, '新增或删除只显示一个有效图片版本');
          const card=layout.cards[0];assert.equal(card.side,mode==='added'?'after':'before');assert.equal(card.title,mode==='added'?'新增图片':'删除前图片');
          assert.ok(Math.abs(card.left-layout.content.left)<=1 && Math.abs(card.right-layout.content.right)<=1, '单图使用完整内容宽度：'+JSON.stringify(layout));
        } else {
          assert.equal(layout.cards.length, 2, '两个实际版本仍保留对照');
          const [before,after]=layout.cards;
          if (mode==='paired-wide') assert.ok(Math.abs(before.top-after.top)<=1 && before.right<after.left, '宽阅读区前后图片并排：'+JSON.stringify(layout));
          else assert.ok(Math.abs(before.left-after.left)<=1 && Math.abs(before.right-after.right)<=1 && before.bottom<after.top, '窄阅读区前后图片上下排列：'+JSON.stringify(layout));
        }
        await noOverflow();
      };
      const assertPayload = (body: any, checkout: any, area: string, before: any, after: any, relative: string, commitHash?: string) => {
        assert.equal(body.source.repositoryId, checkout.repositoryId); assert.equal(body.source.worktreeId, checkout.worktreeId); assert.equal(body.source.location, checkout.location);
        assert.equal(body.source.commitHash, commitHash || null); assert.equal(body.area, area); assert.equal(body.file.path, relative);
        assert.equal(body.patch, null); assert.equal(body.binary, true); assert.ok(body.imagePreview);
        for (const [side,version] of [['before',before],['after',after]] as any) {
          const file = body.imagePreview[side];
          if (!version) assert.equal(file, null);
          else {
            assert.equal(file.kind, 'image'); assert.equal(file.content, version.content); assert.equal(file.digest, version.digest);
            assert.equal(file.sizeBytes, version.bytes.length); assert.equal(file.mediaType, 'image/png'); assert.equal(file.truncated, false);
            assert.equal(file.source.repositoryId, checkout.repositoryId); assert.equal(file.source.worktreeId, checkout.worktreeId); assert.equal(file.source.location, checkout.location);
          }
        }
      };
      const readDiff = async (checkout: any, area: string, relative: string, commitHash?: string) => {
        const query = new URLSearchParams({repositoryId:checkout.repositoryId,worktreeId:checkout.worktreeId,filePath:relative,area,...(commitHash ? {commitHash} : {})});
        const response = await page.request.get(api + '/code/diff?' + query); assert.equal(response.status(), 200, await response.text()); return response.json();
      };
      const selectImage = async (checkout: any, area: string, relative: string, before: any, after: any) => {
        await selectCheckout(checkout);
        const group = checkoutGroup(checkout.worktreeId); await group.waitFor();
        const areaHeading = group.locator('[data-change-area="' + area + '"] [data-area-toggle]');
        if (await areaHeading.getAttribute('aria-expanded') !== 'true') await areaHeading.click();
        await fileRow(checkout.worktreeId, area, relative).click();
        const body = await readDiff(checkout, area, relative); assertPayload(body, checkout, area, before, after, relative);
        await assertSide('before', before); await assertSide('after', after);
        assert.equal(await root().locator('.task-diff-mode:visible').count(), 0, '图片保留前后版本而不显示文字对比方式');
        assert.equal(await root().getByText('非文本内容，不提供文本差异。', {exact:true}).count(), 0);
        await noOverflow(); return body;
      };
      const openCompleteImage = async (checkout: any, area: string, relative: string, version: any, before: any, after: any, commitHash?: string) => {
        const requests: string[] = [], collect = (request: any) => {if (new URL(request.url()).pathname.endsWith('/code/source-file')) requests.push(request.url());};
        page.on('request', collect);
        try {
          const response = after ? page.waitForResponse((returned: any) => {
            const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-file') && url.searchParams.get('worktreeId') === checkout.worktreeId && url.searchParams.get('filePath') === relative && url.searchParams.get('area') === area;
          }) : null;
          await root().getByRole('button', {name:'查看完整文件',exact:true}).click();
          await decodeImage(root().locator('.source-control-full-file .repository-image-preview img'), version);
          if (response) {
            const returned = await response; assert.equal(returned.status(), 200); const file = await returned.json();
            assert.equal(file.content, version.content); assert.equal(file.digest, version.digest); assert.equal(file.source.worktreeId, checkout.worktreeId);
            assert.equal(file.source.commitHash, commitHash || null);
          } else {
            assert.deepEqual(requests, [], '删除前完整图片复用已校验旧图，不向缺失当前文件发请求');
            assert.equal(await root().locator('.source-control-full-file > header strong').innerText(), '删除前图片');
            if (commitHash) assert.ok((await root().locator('.code-location-summary').innerText()).includes(commitHash.slice(0,8)), '删除前完整图来源指向真实父提交');
          }
          await noOverflow(); await root().getByRole('button', {name:'返回差异',exact:true}).click(); await assertSide('before', before); await assertSide('after', after);
        } finally {page.off('request', collect);}
      };
      const separator = root().getByRole('separator', {name:'调整源代码管理与阅读区宽度',exact:true});
      const narrowImages = async () => {
        await separator.press('End');
        await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
      };
      const normalImages = async () => {
        await separator.dblclick();
        await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || 0) > 700);
      };
      await selectImage(primary, 'untracked', images.addedPath, null, versions.added);
      await assertImageLayout('added');
      await capture(page, 'source-control-image-untracked.png');
      await narrowImages(); await assertImageLayout('added'); await capture(page, 'source-control-image-untracked-300px.png');
      await openCompleteImage(primary, 'untracked', images.addedPath, versions.added, null, versions.added);
      await assertImageLayout('added'); await normalImages();
      const staged = await selectImage(primary, 'staged', images.imagePath, versions.history, versions.index);
      assert.equal(staged.imagePreview.before.source.commitHash, primary.commitHash);
      assert.equal(staged.imagePreview.after.revision, 'index:' + primary.indexBlob + ':100644');
      await openCompleteImage(primary, 'staged', images.imagePath, versions.index, versions.history, versions.index);
      const working = await selectImage(primary, 'unstaged', images.imagePath, versions.index, versions.working);
      assert.equal(working.imagePreview.before.revision, 'index:' + primary.indexBlob + ':100644'); assert.ok(working.imagePreview.after.revision.startsWith('current:'));
      await assertImageLayout('paired-wide');
      await capture(page, 'source-control-image-index-current.png');
      await openCompleteImage(primary, 'unstaged', images.imagePath, versions.working, versions.index, versions.working);
      await selectImage(peerImage, 'untracked', images.imagePath, null, versions.peer);
      await selectImage(primary, 'unstaged', images.imagePath, versions.index, versions.working);
      await narrowImages();
      await assertSide('before', versions.index); await assertSide('after', versions.working); await noOverflow();
      await assertImageLayout('paired-narrow');
      const bounds = await preview().getByRole('img').evaluateAll((elements: HTMLImageElement[]) => elements.map(element => {
        const box = element.getBoundingClientRect(), reader = element.closest('.source-control-reader')!.getBoundingClientRect(); return {left:box.left,right:box.right,readerLeft:reader.left,readerRight:reader.right};
      }));
      assert.ok(bounds.every((box: any) => box.left >= box.readerLeft && box.right <= box.readerRight), '300px阅读区图片实际边界不越栏');
      await capture(page, 'source-control-image-300px.png'); await normalImages();
      await selectImage(primary, 'staged', images.stagedDeletedPath, versions.deleted, null);
      await assertImageLayout('deleted');
      await openCompleteImage(primary, 'staged', images.stagedDeletedPath, versions.deleted, versions.deleted, null, primary.commitHash);
      await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact:true}).click();
      await openCommitFile(primary.commitHash, images.imagePath);
      const historical = await readDiff(primary, 'commit', images.imagePath, primary.commitHash); assertPayload(historical, primary, 'commit', versions.before, versions.history, images.imagePath, primary.commitHash);
      assert.equal(historical.baseHash, primary.baseHash); assert.equal(historical.imagePreview.before.source.commitHash, primary.baseHash); assert.equal(historical.imagePreview.after.source.commitHash, primary.commitHash);
      await assertSide('before', versions.before); await assertSide('after', versions.history);
      await assertImageLayout('paired-wide');
      await capture(page, 'source-control-image-fixed-history.png');
      await openCompleteImage(primary, 'commit', images.imagePath, versions.history, versions.before, versions.history, primary.commitHash);
      await openCommitFile(primary.commitHash, images.deletedPath);
      const deleted = await readDiff(primary, 'commit', images.deletedPath, primary.commitHash); assertPayload(deleted, primary, 'commit', versions.deleted, null, images.deletedPath, primary.commitHash);
      assert.equal(deleted.imagePreview.before.source.commitHash, primary.baseHash); await assertSide('before', versions.deleted); await assertSide('after', null);
      await assertImageLayout('deleted');
      await capture(page, 'source-control-image-deleted.png');
      await narrowImages(); await assertImageLayout('deleted'); await capture(page, 'source-control-image-deleted-300px.png');
      await openCompleteImage(primary, 'commit', images.deletedPath, versions.deleted, versions.deleted, null, primary.baseHash);
      await assertImageLayout('deleted'); await normalImages();
      assert.ok((await root().locator('.code-location-summary').innerText()).includes(primary.commitHash.slice(0,8)), '返回删除差异恢复所选提交来源');
      await root().locator('.source-control-browse-tabs').getByText('未提交变更', {exact:true}).click();
      await selectCheckout(primary); await fileRow(primary.worktreeId, 'untracked', images.binaryPath).click();
      const binary = await readDiff(primary, 'untracked', images.binaryPath); assert.equal(binary.binary, true); assert.equal(binary.imagePreview, undefined);
      await root().getByText('非文本内容，不提供文本差异。', {exact:true}).waitFor(); assert.equal(await preview().count(), 0);
      await noOverflow();
    });
  });

  await scenario('源码文件名优先，同名文件只补最短区分目录', async () => {
    await fixture.withDuplicateFiles(async ({location,files}:any) => {
      await page.setViewportSize({width:1440,height:900}); await open();
      const refreshed=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/source-control'));
      await root().getByRole('button',{name:'刷新源代码管理',exact:true}).click();
      const response=await refreshed; assert.equal(response.status(),200);
      const observed=await response.json();
      const main=observed.repositories.flatMap((repository:any)=>repository.worktrees).find((worktree:any)=>worktree.worktreeId===mainWorktreeId);
      assert.ok(main); assert.equal(main.location,location);
      for(const file of files)assert.ok(main.changes.some((change:any)=>change.path===file.path&&change.area==='untracked'),file.path+' 来自真实未跟踪清单');
      const heading=checkoutGroup(mainWorktreeId).locator('[data-change-area="untracked"] [data-area-toggle]');
      await heading.waitFor(); if(await heading.getAttribute('aria-expanded')!=='true')await heading.click();
      for(const file of files){
        const rendered=fileRow(mainWorktreeId,'untracked',file.path),name=rendered.locator('.task-changed-row-content strong'),hint=rendered.locator('.task-changed-path');
        await rendered.waitFor(); assert.equal(await name.innerText(),file.path.split('/').at(-1));
        assert.equal(await hint.innerText(),file.hint||'');
        if(file.hint){
          assert.equal(await hint.isVisible(),true);
          const nameBox=await name.boundingBox(),hintBox=await hint.boundingBox(); assert.ok(nameBox&&hintBox);
          assert.ok(hintBox.x>=nameBox.x+nameBox.width-1&&Math.abs(nameBox.y+nameBox.height/2-hintBox.y-hintBox.height/2)<=1,'同名补充目录与文件名并列同一行');
        }else assert.equal(await hint.isVisible(),false,'唯一文件只常驻文件名');
      }
      const first=files[0],second=files[1],firstRow=fileRow(mainWorktreeId,'untracked',first.path),secondRow=fileRow(mainWorktreeId,'untracked',second.path);
      const readFile=async(file:any,select:()=>Promise<void>)=>{
        const returned=page.waitForResponse((result:any)=>{const url=new URL(result.url());return url.pathname.endsWith('/code/diff')&&url.searchParams.get('filePath')===file.path&&url.searchParams.get('worktreeId')===mainWorktreeId&&url.searchParams.get('area')==='untracked';});
        await select(); const response=await returned; assert.equal(response.status(),200);
        const body=await response.json(); assert.equal(body.file.path,file.path);assert.equal(body.source.location,location);assert.ok(body.file.preview.includes(file.content.trim()));
        await diff().getByText(file.content.trim(),{exact:false}).waitFor();
        assert.equal(await root().getByLabel('完整绝对路径',{exact:true}).innerText(),location+'/'+file.path);
      };
      await readFile(first,()=>firstRow.click());
      // A row can have a bounding box while being clipped below the scrolling file list.
      // Bring the target into the visible list before opening the first row's tooltip.
      await secondRow.scrollIntoViewIfNeeded();
      const visibleFirst=await firstRow.boundingBox();assert.ok(visibleFirst);
      await firstRow.hover({position:{x:24,y:visibleFirst.height/2}});const tooltip=page.getByRole('tooltip',{name:location+'/'+first.path,exact:true});await tooltip.waitFor({timeout:600});
      assert.equal(await tooltip.evaluate((element:HTMLElement)=>getComputedStyle(element).pointerEvents),'none');
      const start=await firstRow.boundingBox(),end=await secondRow.boundingBox();assert.ok(start&&end);
      const list=await secondRow.evaluate((element:HTMLElement)=>{const host=element.closest('.source-control-list')!;const box=host.getBoundingClientRect();return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,scrollTop:host.scrollTop};});
      assert.ok([start,end].every(box=>box.y>=list.top-1&&box.y+box.height<=list.bottom+1),'两相邻行都位于实际滚动可见区：'+JSON.stringify({start,end,list}));
      const x=start.x+24,y=end.y+end.height/2;await page.mouse.move(x,y,{steps:8});
      const hit=await secondRow.evaluate((element:HTMLElement,point:any)=>{const actual=document.elementFromPoint(point.x,point.y);return {inside:Boolean(actual&&element.contains(actual)),hovered:element.matches(':hover'),actual:actual&&{tag:actual.tagName,id:actual.id,className:actual.className,ariaLabel:actual.getAttribute('aria-label')},point};},{x,y});
      assert.equal(hit.inside,true,'浮窗不阻挡沿同一列向下选择同名文件：'+JSON.stringify({hit,start,end,list}));
      await readFile(second,()=>secondRow.click({position:{x:x-end.x,y:end.height/2}}));
      await noOverflow(); await capture(page,'source-control-file-duplicate-hints.png');
    });
  });

  await scenario('固定历史全文、悬浮信息选择复制与准确任务往返', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 900}); await openHistory();
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.historyText);
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(fixture.commitHash.slice(0, 8)));
    const info = root().locator('.source-control-reader').getByRole('button', {name: '查看完整提交信息', exact: true});
    await info.hover(); const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor();
    await popup.hover(); assert.ok((await popup.innerText()).includes(fixture.commitHash));
    await assertHoverInViewport(popup);
    assert.equal(await popup.locator('pre').count(), 0, '悬浮摘要不重复完整正文');
    await selectHoverText(popup.locator('code').filter({hasText: fixture.commitHash}));
    await capture(page, 'source-control-fixture-history-text-selection.png');
    await popup.getByRole('button', {name: /复制提交标识$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.commitHash);
    await popup.getByRole('button', {name: /复制完整信息$/}).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes(fixture.commitHash) && copied.includes('Buildr-Task: browser-task'));
    await capture(page, 'source-control-fixture-history-hover.png');
    await popup.getByRole('button', {name: '打开任务 浏览器任务', exact: true}).click();
    await assertTaskIdentity();
    await popup.waitFor({state: 'hidden'});
    await page.goBack(); await waitFull(fixture.historyText);
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(fixture.commitHash.slice(0, 8)));
    await drag(root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}), 55, 0);
    await assertSelectionContrast(root().locator('.source-control-browse-tabs'), '提交历史');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    const orientation = root().locator('.task-diff-mode');
    await orientation.getByText('上下对比', {exact: true}).click();
    await assertSelectionContrast(orientation, '上下对比');
    await drag(root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}), -55, 0);
    await assertSelectionContrast(root().locator('.source-control-browse-tabs'), '提交历史');
    await assertSelectionContrast(orientation, '上下对比');
    await capture(page, 'source-control-fixture-history-return-resize-selection.png');
    await noOverflow();
  });

  await scenario('鼠标调整两轴、展开恢复、刷新与窄分屏保留手动比例', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await open();
    await row('未暂存').click(); await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    const horizontal = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    const vertical = root().getByRole('separator', {name: '调整代码库与浏览区高度', exact: true});
    const before = [Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))];
    await drag(horizontal, 70, 0); await drag(vertical, 0, 50);
    const after = [Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))];
    assert.ok(after[0] > before[0] + 1 && after[1] > before[1] + 1, '两个实际分隔线分别改变宽度与高度');
    await root().getByRole('button', {name: '展开阅读', exact: true}).click();
    await root().getByRole('button', {name: '恢复分屏', exact: true}).click();
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
    assert.ok((await diff().innerText()).includes('sourceControlWorking = 34'));
    const workspaceId = new URL(workspaceUrl).pathname.split('/')[2];
    const keys = ['buildr:source-control:' + workspaceId + ':columns', 'buildr:source-control:' + workspaceId + ':stack'];
    const saved = await page.evaluate((values: string[]) => values.map(key => localStorage.getItem(key)), keys);
    assert.ok(saved.every((value: any) => value !== null));
    await page.reload(); await root().locator('.source-control-repository-copy').first().waitFor();
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
    await page.setViewportSize({width: 1024, height: 768}); await row('未暂存').click();
    await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click({trial: true}); await noOverflow();
    await capture(page, 'source-control-fixture-split-1024.png');
    assert.deepEqual(await page.evaluate((values: string[]) => values.map(key => localStorage.getItem(key)), keys), saved, '临时窗口缩窄不覆盖手动比例');
    await page.setViewportSize({width: 1440, height: 900});
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
  });

  await scenario('迟到的差异不能覆盖当前层，清单刷新失败保留已读取现场', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await open();
    await row('未暂存').click(); await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = async (route: any) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('area') === 'staged' && url.searchParams.get('filePath') === fixture.path) await gate;
      try { await route.continue(); } catch { /* Switching layers can cancel the old transport. */ }
    };
    await page.route('**/code/diff?**', delayed);
    try {
      const started = page.waitForRequest((request: any) => { const url = new URL(request.url()); return url.pathname.endsWith('/code/diff') && url.searchParams.get('area') === 'staged'; });
      await row('已暂存').click(); await started; await row('未暂存').click(); release();
      await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
      await page.waitForTimeout(450);
      assert.match(await root().locator('.task-diff-comparison').innerText(), /未暂存/);
      assert.ok((await diff().innerText()).includes('sourceControlWorking = 34'), '迟到暂存响应不能覆盖当前未暂存差异');
    } finally { release(); await page.unroute('**/code/diff?**', delayed); }
    const failed = async (route: any) => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: {code: 'scm_fixture_unavailable', message: '隔离测试清单暂不可读取'}})});
    const catalogRoute = /\/code\/source-control(?:\?|$)/;
    expectedBrowserErrors.add('/code/source-control');
    await page.route(catalogRoute, failed);
    try {
      await root().getByRole('button', {name: '刷新源代码管理', exact: true}).click();
      await root().getByRole('alert').filter({hasText: '隔离测试清单暂不可读取'}).waitFor();
      assert.ok(await root().locator('.source-control-repository').count() >= 2);
      assert.equal(await row('未暂存').count(), 1);
      await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    } finally { await page.unroute(catalogRoute, failed); }
    await root().getByRole('button', {name: '刷新源代码管理', exact: true}).click();
    await root().getByRole('alert').filter({hasText: '隔离测试清单暂不可读取'}).waitFor({state: 'hidden'});
    await noOverflow();
  });

  await scenario('代码主导航与默认路由始终进入源代码管理', async () => {
    await page.goto(workspaceUrl + '/code'); await root().locator('.source-control-repository-copy').first().waitFor();
    assert.equal(new URL(page.url()).pathname, new URL(workspaceUrl + '/code/source-control').pathname);
    await page.locator('.shell-navigation [data-nav="explorer"]').click(); await page.locator('.code-explorer-stage:visible').waitFor();
    await page.getByRole('navigation', {name:'主导航', exact:true}).getByRole('link', {name:'代码', exact:true}).click();
    await root().locator('.source-control-repository-copy').first().waitFor();
    await page.locator('.shell-navigation [data-nav="explorer"]').click(); await page.locator('.code-explorer-stage:visible').waitFor();
    await page.getByRole('navigation', {name:'主导航', exact:true}).getByRole('link', {name:'工作台', exact:true}).click();
    await page.getByRole('navigation', {name:'主导航', exact:true}).getByRole('link', {name:'代码', exact:true}).click();
    await root().locator('.source-control-repository-copy').first().waitFor();
    assert.equal(new URL(page.url()).pathname, new URL(workspaceUrl + '/code/source-control').pathname);
  });

  await scenario('离开保留的源代码管理页面时悬浮信息层关闭', async () => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(workspaceUrl + '/code/explorer'); await page.locator('.code-explorer-stage').waitFor();
    await page.getByRole('navigation', {name: '代码导航', exact: true}).getByRole('link', {name: '源代码管理', exact: true}).click();
    await root().locator('.source-control-repository-copy').first().waitFor();
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    await root().locator('.source-control-graph li').first().waitFor();
    await root().locator('.source-control-graph > li').first().locator('.source-control-commit-toggle').hover();
    const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor(); await popup.hover();
    await page.goBack(); await page.locator('.code-explorer-stage:visible').waitFor();
    await popup.waitFor({state: 'hidden'});
    assert.equal(await page.locator('.code-source-control-page').count(), 1, '源页面仍挂载，浮层由活动现场控制关闭');
    await noOverflow();
  });

  await scenario('任务改动与提交保留原列表、提交详情、完整文件与返回现场', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await page.goto(workspaceUrl + '/tasks/browser-task');
    const task = page.locator('#task-detail-main:visible');
    await task.locator('[data-task-content=changes]').click();
    const reader = task.getByRole('region', {name: '改动与提交工作台', exact: true}); await reader.waitFor();
    await assertTaskIdentity();
    const current = reader.locator('.task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + fixture.path + '"]')}).first();
    await current.click(); await reader.getByRole('region', {name: '差异内容', exact: true}).getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    const commit = reader.locator('.task-rail-commit').filter({hasText: fixture.commitHash.slice(0, 8)}); await commit.waitFor(); await commit.click();
    await reader.locator('.task-commit-details').getByText('Buildr-Task: browser-task', {exact: false}).waitFor();
    await reader.locator('.task-rail-commit-files .task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + fixture.path + '"]')}).click();
    await reader.getByRole('region', {name: '差异内容', exact: true}).getByText('explorerAnswer = 1', {exact: false}).waitFor();
    await reader.getByRole('button', {name: '查看完整文件', exact: true}).click();
    await page.locator('.repository-source-code').waitFor();
    assert.equal(await readOnlyText(page.locator('.repository-source-code:visible')), fixture.historyText);
    await page.getByRole('button', {name: '返回任务', exact: true}).click(); await reader.waitFor();
    await assertTaskIdentity();
    assert.ok((await reader.getByRole('region', {name: '差异内容', exact: true}).innerText()).includes('explorerAnswer = 1'));
    await noOverflow(); await capture(page, 'source-control-fixture-original-task-reader.png');
  });

  const linked = fixture.prepareWorktrees();
  const remoteStatuses = fixture.prepareRemoteStatuses(linked);
  const expectedLocations = [...fixture.baselineWorktrees.flatMap((repository: any) => repository.locations), ...linked.map((worktree: any) => worktree.location)];
  const worktrees = async () => {
    const observed = await catalog();
    return linked.map((item: any) => {
      const repository = observed.repositories.find((repo: any) => repo.worktrees.some((worktree: any) => worktree.location === item.location));
      assert.ok(repository, '真实 linked 工作树应被所属登记库发现');
      const worktree = repository.worktrees.find((value: any) => value.location === item.location);
      return {...item, repositoryId: repository.id, repositoryName: repository.name, worktreeId: worktree.worktreeId, observed: worktree};
    });
  };
  const expanded = async (button: any) => { if (await button.getAttribute('aria-expanded') === 'false') await button.click(); };
  const selectWorktree = async (worktree: any) => {
    const restore = root().getByRole('button', {name: '展开代码库列表', exact: true});
    if (await restore.count()) await restore.click();
    const repository = root().locator('[data-source-repository="' + worktree.repositoryId + '"]');
    if (worktree.worktreeId === mainWorktreeId) await repository.getByRole('button', {name: '查看主工作树 · ' + worktree.repositoryName, exact: true}).click();
    else {
      await expanded(repository.locator('.source-control-repository-fold'));
      await repository.locator('[data-source-worktree="' + worktree.worktreeId + '"] .source-control-repository-copy').click();
    }
  };
  const selectFile = async (worktree: any, area: string) => {
    await selectWorktree(worktree);
    const group = checkoutGroup(worktree.worktreeId); await group.waitFor();
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1, '下方只显示当前选中工作树');
    await expanded(group.locator('[data-change-area="' + area + '"] [data-area-toggle]'));
    await fileRow(worktree.worktreeId, area, worktree.path).click();
    const text = area === 'staged' ? worktree.indexText : worktree.workingText;
    await diff().getByText(text.trim(), {exact: false}).waitFor();
    assert.ok((await root().locator('.code-location-summary').innerText()).includes(worktree.branch));
    assert.equal(await root().getByLabel('完整绝对路径', {exact:true}).innerText(), worktree.location + '/' + worktree.path, '差异绝对路径使用当前具体工作树而非主目录');
  };
  const assertFullVersion = async (worktree: any, area: string, content: string, hash?: string) => {
    const returned = page.waitForResponse((response: any) => { const url = new URL(response.url()); return url.pathname.endsWith('/code/source-file') && url.searchParams.get('worktreeId') === worktree.worktreeId && url.searchParams.get('filePath') === worktree.path && url.searchParams.get('area') === area; });
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click();
    const response = await returned; assert.equal(response.status(), 200);
    const body = await response.json(); assert.equal(body.source.worktreeId, worktree.worktreeId); assert.equal(body.source.location, worktree.location);
    assert.equal(body.source.commitHash, hash || null); assert.equal(body.content, content);
    try { await waitFull(content); }
    catch (error) {
      process.stderr.write('[source-control-full-file-failure] ' + JSON.stringify({worktree:worktree.worktreeId, area, expected:content, actual:await fullText(), visible:await root().locator('.source-control-reader').innerText()}) + '\n');
      await capture(page, 'source-control-full-file-failure.png'); throw error;
    }
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
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
      for (const ratio of [0.8, 0.5, 0.2]) {
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
      const clippedManager = page.getByRole('region', {name:'分支管理 · ' + value.repositoryName + ' · ' + sourceName, exact:true}); await clippedManager.waitFor();
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
      const manager = page.getByRole('region', {name:'分支管理 · ' + value.repositoryName + ' · ' + sourceName, exact:true}); await manager.waitFor();
      const branchSearch = manager.getByRole('textbox', {name:'搜索可用分支（Branch）', exact:true});
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '搜索可用分支（Branch）');
      assert.equal(await branchSearch.evaluate((element:HTMLElement) => document.activeElement === element), true, '隐藏分支的键盘菜单进入真实管理层');
      await manager.getByRole('button', {name:'管理 ' + value.branch, exact:true}).waitFor();
      await branchSearch.press('Escape'); await manager.waitFor({state:'hidden'});
      assert.equal(await menuButton.evaluate((element:HTMLElement) => document.activeElement === element), true, '关闭管理层焦点返回可见菜单');
      await menuButton.click(); await menu().getByRole('menuitem', {name:'管理分支', exact:true}).click(); await manager.waitFor();
      await parentFold.focus(); await parentFold.press('Enter'); await manager.waitFor({state:'hidden'});
      await parentFold.press('Enter'); assert.equal(await manager.isVisible(), false, '键盘重新展开父库不重播旧管理请求');
      await menuButton.click(); await menu().getByRole('menuitem', {name:'查看状态', exact:true}).click(); const details = statusDetails(); await details.waitFor();
      assert.equal(await details.locator('dd').nth(2).innerText(), '浏览器任务');
      await parentFold.focus(); await parentFold.press('Enter'); await details.waitFor({state:'hidden'});
      await parentFold.press('Enter'); assert.equal(await details.count(), 0, '键盘重新展开父库不重播旧状态详情');
      await capture(page, 'source-control-name-priority-menu-260px.png'); await noOverflow();
      await menuButton.click(); await menu().getByRole('menuitem', {name:'打开关联任务', exact:true}).click(); await assertTaskIdentity();
      await page.goto(workspaceUrl + '/code/source-control'); await root().locator('.source-control-repository-copy').first().waitFor(); await separator.dblclick();
    } finally {await page.unroute(matchesCatalog, rename);}
  });

  await scenario('同库全部真实工作树分组，同路径两层及全文保持各自版本', async () => {
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), observed = await catalog();
    const repository = observed.repositories.find((item: any) => item.id === values[0].repositoryId);
    const primaryCount = fixture.baselineWorktrees.find((item: any) => item.location === fixture.location).locations.length + 2;
    assert.equal(repository.worktreeCount, primaryCount); assert.equal(repository.worktrees.length, primaryCount);
    assert.deepEqual(observed.repositories.flatMap((item: any) => item.worktrees.map((worktree: any) => worktree.location)).sort(), expectedLocations.toSorted(), '主线来源与本轮新增工作树全部保留，真实 Git 清单不因来源未登记为当前任务而遗漏');
    assert.equal(repository.fileCount, repository.worktrees.reduce((total: number, worktree: any) => total + worktree.fileCount, 0), '同一路径在不同工作树独立计数');
    const rendered = root().locator('[data-source-repository="' + repository.id + '"]');
    for (const value of repository.worktrees) assert.equal(await rendered.locator('[data-source-worktree="' + value.worktreeId + '"]').count(), 1);
    assert.equal(await rendered.locator('.source-control-worktree-status').count(), repository.worktrees.length, '主工作树与每个子工作树各有独立状态区域');
    assert.equal(await root().locator('.source-control-task-slot:empty:visible').count(), 0, '没有关联任务时不保留空任务位置');
    const hierarchy = await rendered.evaluate((element: HTMLElement) => {
      const parent = element.querySelector('.source-control-repository-copy strong')!.getBoundingClientRect().left;
      const children = [...element.querySelectorAll('.source-control-worktree .source-control-repository-copy strong')].map(child => child.getBoundingClientRect().left);
      return {parent, children};
    });
    assert.ok(hierarchy.children.length > 0 && hierarchy.children.every((left: number) => left >= hierarchy.parent + 16 && left <= hierarchy.parent + 32), '子工作树名称比所属代码库缩进一级，保持清楚的树状层级');
    for (const expected of remoteStatuses) {
      const owner = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === expected.location));
      const worktree = owner.worktrees.find((item: any) => item.location === expected.location);
      assert.deepEqual([worktree.ahead, worktree.behind], [expected.ahead, expected.behind], '真实本机裸远程推送/抓取后的生产接口数量');
      assert.ok(worktree.upstream?.startsWith('status-fixture/'));
      const status = root().locator('[data-source-repository="' + owner.id + '"] [data-source-worktree="' + worktree.worktreeId + '"] .source-control-worktree-status');
      const remote = `未推送 ${expected.ahead} 个提交，落后远程跟踪记录 ${expected.behind} 个提交`;
      assert.equal(await status.getAttribute('data-remote-state'), expected.ahead === 0 && expected.behind === 0 ? 'clean' : 'changed');
      assert.ok((await status.getAttribute('aria-label')).includes(remote));
      await assertStatusCounts(status, {ahead: expected.ahead, behind: expected.behind, files: worktree.fileCount});
      assert.equal(await status.locator('.anticon-arrow-up').count(), expected.ahead > 0 ? 1 : 0);
      assert.equal(await status.locator('.anticon-arrow-down').count(), expected.behind > 0 ? 1 : 0);
      assert.equal(await status.locator('.anticon-check').count(), expected.ahead === 0 && expected.behind === 0 && worktree.fileCount === 0 ? 1 : 0, '仅远程与文件两方面都确认没有差异时显示单勾');
      await assertStatusDetails(status, remote, worktree.fileCount === 0 ? '没有未提交文件' : worktree.fileCount + ' 个未提交文件');
    }
    const cleanOwner = observed.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === fixture.cleanLocation));
    const clean = cleanOwner.worktrees.find((item: any) => item.location === fixture.cleanLocation); assert.equal(clean.fileCount, 0);
    const cleanStatus = root().locator('[data-source-repository="' + cleanOwner.id + '"] [data-source-worktree="' + clean.worktreeId + '"] .source-control-worktree-status');
    assert.equal(await cleanStatus.getAttribute('data-file-state'), 'clean');
    assert.ok((await cleanStatus.getAttribute('aria-label')).includes('没有未提交文件'));
    assert.equal(await cleanStatus.locator('[data-status-kind="files"],.anticon-file').count(), 0, '文件零值不单独占用图标或数量位置');
    const changedStatus = rendered.locator('[data-source-worktree="' + values[0].worktreeId + '"] .source-control-status-button');
    assert.equal(await changedStatus.getAttribute('data-file-state'), 'changed');
    assert.equal(await changedStatus.locator('[data-status-kind="files"] .anticon-file-text').count(), 1);
    await fixture.withStatusDigits(linked, async (expected: any) => {
      await open(); const digitCatalog = await catalog();
      const observedLocation = (location: string) => digitCatalog.repositories.flatMap((owner: any) => owner.worktrees).find((worktree: any) => worktree.location === location);
      for (const remote of expected.remote) {
        const worktree = observedLocation(remote.location); assert.ok(worktree);
        assert.deepEqual([worktree.ahead, worktree.behind], [remote.ahead, remote.behind], '一位／两位远程计数来自真实Git分叉');
      }
      for (const files of expected.files) assert.equal(observedLocation(files.location)?.fileCount, files.count, '0／1／12／123文件计数来自实际独立路径');
      const separator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
      await separator.dblclick(); await drag(separator, 80, 0);
      for (const width of ['440px', '260px']) {
        if (width === '260px') {
          await separator.press('Home');
          await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-sidebar')?.getBoundingClientRect().width || Infinity) <= 261);
        }
        const sidebar = await root().locator('.source-control-sidebar').boundingBox();
        assert.ok(sidebar && Math.abs(sidebar.width - Number.parseInt(width)) <= 2, '本轮测量实际目录宽度：' + JSON.stringify({width, sidebar}));
        for (const remote of expected.remote) {
          const worktree = observedLocation(remote.location);
          const status = root().locator('[data-source-worktree="' + worktree.worktreeId + '"] .source-control-worktree-status');
          await assertStatusCounts(status, {ahead: remote.ahead, behind: remote.behind, files: worktree.fileCount});
        }
        for (const files of expected.files) {
          const worktree = observedLocation(files.location);
          const status = root().locator('[data-source-worktree="' + worktree.worktreeId + '"] .source-control-worktree-status');
          assert.deepEqual(await status.locator('[data-status-kind="files"] .source-control-status-number').allTextContents(), files.count > 0 ? [String(files.count)] : []);
        }
        const geometry = await root().locator('.source-control-repository-tree-scroll .source-control-repository,.source-control-repository-tree-scroll .source-control-worktree').evaluateAll((elements: HTMLElement[]) => {
          const bounds = (element: Element) => { const box = element.getBoundingClientRect(); return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width}; };
          const textBounds = (element: Element | null) => {
            if (!element) return null;
            const range = document.createRange(); range.selectNodeContents(element); const box = range.getBoundingClientRect();
            return {text: element.textContent, left: box.left, right: box.right, lines: range.getClientRects().length, numericStyle:getComputedStyle(element).fontVariantNumeric};
          };
          return elements.filter(row => row.getBoundingClientRect().width > 0).map(row => {
            const name = row.querySelector('.source-control-repository-copy')!, status = row.querySelector('.source-control-worktree-status')!;
            const controls = [...row.querySelectorAll('.source-control-task-slot,:scope > .source-control-row-action-slot')].filter(element => getComputedStyle(element).visibility !== 'hidden').map(bounds).filter(box => box.width > 0);
            const branch = row.querySelector('.source-control-row-branch-slot');
            const menu = row.querySelector(':scope > .source-control-row-action-slot');
            return {
              label: name.textContent, layout:row.dataset.sourceRowLayout, remoteState:status.getAttribute('data-remote-state'), multipleGroups:status.classList.contains('has-many-counts'), row: bounds(row), name: bounds(name), nameNatural:bounds(row.querySelector('.source-control-row-name-text')!), status: bounds(status), statusVisible:getComputedStyle(status).visibility !== 'hidden',
              controls, branch: branch && getComputedStyle(branch).visibility !== 'hidden' ? bounds(branch) : null, menu:menu ? bounds(menu) : null,
              parts: [...status.children].map(bounds),
              groups:[...status.querySelectorAll('.source-control-status-content')].map(content => ({box:bounds(content), parts:[...content.children].map(bounds)})),
              counts: [...status.querySelectorAll('.source-control-status-count')].map(count => ({kind: count.getAttribute('data-status-kind'), box: bounds(count), icon: bounds(count.querySelector('.anticon > svg')!), number: textBounds(count.querySelector('.source-control-status-number'))!})),
            };
          });
        });
        assert.ok(geometry.every((row: any) => row.name.width > 0 && (row.layout === 'name' || row.name.width >= row.nameNatural.width - 1)), '优先完整名称，全部次要快捷隐藏后才允许名称省略：' + JSON.stringify(geometry));
        const visibleBoxes = (row:any) => [row.name, ...(row.statusVisible ? [row.status] : []), ...row.controls];
        assert.ok(geometry.every((row: any) => visibleBoxes(row).every((box: any) => box.left >= row.row.left - 1 && box.right <= row.row.right + 1)), '可见名称、状态和操作均位于所属目录行边界内：' + JSON.stringify(geometry));
        assert.ok(geometry.every((row: any) => visibleBoxes(row).every((box: any, index: number, boxes: any[]) => boxes.slice(index + 1).every(next => box.right <= next.left + 1 || next.right <= box.left + 1))), '可见项目同行且不能覆盖名称和相邻操作');
        const menus = geometry.map((row: any) => row.menu).filter(Boolean);
        assert.ok(menus.every((box: any) => Math.abs(box.right - menus[0].right) <= 1 && Math.abs(box.width - 24) <= 1), '三个点操作入口固定等宽并在各行右沿对齐');
        assert.ok(geometry.every((row:any) => !row.branch || row.branch.width >= 24 && row.name.right <= row.branch.left + 1 && row.branch.right <= row.menu.left + 1 && (!row.statusVisible || row.branch.right <= row.status.left + 1)), '完整分支紧随名称且不覆盖可见状态或末尾操作：' + JSON.stringify({width, rows:geometry}));
        assert.ok(geometry.every((row: any) => row.parts.every((box: any, index: number) => box.left >= row.status.left - 1 && box.right <= row.status.right + 1 && row.parts.slice(index + 1).every((next: any) => box.right <= next.left + 1 || next.right <= box.left + 1))), '状态标记与各项数量不重叠或越过入口边界');
        assert.ok(geometry.some((row:any) => row.remoteState === 'untracked' && row.counts.some((count:any) => count.kind === 'files' && Number(count.number.text) >= 10) && row.groups.some((group:any) => group.parts.length >= 2)), '真实未跟踪来源和多位文件数共同验证标识分组间距');
        assert.ok(geometry.filter((row:any) => row.remoteState === 'untracked' && row.counts.some((count:any) => count.kind === 'files')).every((row:any) => row.multipleGroups && (!row.statusVisible || Math.abs((row.status.top + row.status.bottom - row.name.top - row.name.bottom) / 2) <= 1)), '未跟踪与文件数量保持同排，空间不足时整组隐藏：' + JSON.stringify({width, rows:geometry}));
        assert.ok(geometry.every((row:any) => !row.counts.length || row.groups.length > 0), '状态内容使用显式分组，避免按钮自动包裹片段吞掉间距');
        assert.ok(geometry.every((row:any) => row.groups.every((group:any) => group.parts.every((part:any, index:number) => part.left >= group.box.left - 1 && part.right <= group.box.right + 1 && (index === 0 || part.left - group.parts[index - 1].right >= 7.5 && Math.abs((part.top + part.bottom) / 2 - (group.parts[index - 1].top + group.parts[index - 1].bottom) / 2) <= 1)))), '远程标识、文件组和远程数量组之间保留8px间距并垂直对齐：' + JSON.stringify({width, rows:geometry}));
        assert.ok(geometry.every((row: any) => row.counts.every((count: any) => count.number.lines === 1 && Number(count.number.text) > 0 && count.number.left - count.icon.right >= 2.5 && count.number.right <= count.box.right + 1 && count.number.numericStyle.includes('tabular-nums'))), '一／二／三位数字保持单行、等宽字形，与对应图标保留3px间距');
        process.stderr.write('[source-control-compact-status] ' + JSON.stringify({width,rows:geometry}) + '\n');
        await noOverflow(); await capture(page, 'source-control-fixture-compact-status-' + width + '.png');
      }
      await separator.dblclick();
    });
    await open();
    const main = {...fixture, repositoryId: repository.id, repositoryName: repository.name, worktreeId: mainWorktreeId, branch: repository.worktrees.find((item: any) => item.worktreeId === mainWorktreeId).branch};
    for (const value of [main, ...values]) {
      await selectFile(value, 'staged'); await assertFullVersion(value, 'staged', value.indexText);
      await selectFile(value, 'unstaged'); await assertFullVersion(value, 'unstaged', value.workingText);
    }
    await noOverflow(); await capture(page, 'source-control-fixture-all-worktrees.png');
  });

  await scenario('代码库列表和比较层折叠保留选择，同名跨库工作树保持单一准确来源', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha'), beta = values.find((item: any) => item.name === 'beta'), peer = values.find((item: any) => item.name === 'peer');
    const movingRepository = root().locator('[data-source-repository="' + alpha.repositoryId + '"]');
    const alphaName = movingRepository.locator('[data-source-worktree="' + alpha.worktreeId + '"] .source-control-repository-copy');
    const betaName = movingRepository.locator('[data-source-worktree="' + beta.worktreeId + '"] .source-control-repository-copy');
    const mainName = movingRepository.getByRole('button', {name: '查看主工作树 · ' + alpha.repositoryName, exact: true});
    const locationCard = (location: string) => page.getByRole('article', {name: '工作树来源信息', exact: true}).filter({has: page.getByText(location, {exact: true})});
    const movementSeparator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await root().locator('.code-location-summary').click();
    await root().getByRole('region', {name: '位置信息', exact: true}).waitFor();
    for (const width of ['normal', '300px']) {
      if (width === 'normal') await movementSeparator.dblclick();
      else await movementSeparator.press('End');
      await hoverThenVerticalClick(alphaName, betaName, locationCard(alpha.location), 'source-control-worktree-hover-up-' + width + '.png');
      assert.equal(await betaName.getAttribute('aria-pressed'), 'true');
      assert.equal(await root().getByRole('region', {name: '位置信息', exact: true}).count(), 0, '切换真实工作树自动收起上一来源的信息');
      await hoverThenVerticalClick(mainName, alphaName, locationCard(fixture.location), 'source-control-worktree-hover-down-' + width + '.png');
      assert.equal(await alphaName.getAttribute('aria-pressed'), 'true');
    }
    await selectFile(alpha, 'unstaged');
    const area = checkoutGroup(alpha.worktreeId).locator('[data-change-area="unstaged"]'), areaButton = area.locator('[data-area-toggle]');
    await areaButton.click(); assert.equal(await areaButton.getAttribute('aria-expanded'), 'false');
    assert.ok((await diff().innerText()).includes(alpha.workingText.trim()), '折叠比较层不改变阅读现场');
    await areaButton.click(); assert.equal(await areaButton.getAttribute('aria-expanded'), 'true');
    const catalogRepository = root().locator('[data-source-repository="' + alpha.repositoryId + '"]');
    const catalogWorktree = catalogRepository.locator('[data-source-worktree="' + alpha.worktreeId + '"]');
    assert.equal(await catalogWorktree.locator('.source-control-fold').count(), 0, '叶工作树无需用折叠箭头展开路径');
    const sourceName = catalogWorktree.locator('.source-control-repository-copy');
    const narrowSeparator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await narrowSeparator.press('End');
    await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
    const nameBox = await sourceName.locator('strong').boundingBox(), sourceBox = await sourceName.boundingBox();
    assert.ok(nameBox && sourceBox && Math.abs(nameBox.width - sourceBox.width) < 2, '工作树名称利用完整身份栏宽度');
    assert.equal(await sourceName.locator('code').count(), 0, '真实分支只在按需信息层展示');
    assert.ok(!(await catalogWorktree.innerText()).includes(alpha.location), '完整路径平时不占用目录行');
    await sourceName.hover();
    const locationInfo = page.getByRole('article', {name: '工作树来源信息', exact: true}); await locationInfo.waitFor(); await enterHoverCard(locationInfo);
    await assertHoverBesideList(locationInfo);
    assert.equal(await locationInfo.locator('.source-control-worktree-info-task').innerText(), '任务：浏览器任务');
    assert.equal(await locationInfo.locator('.source-control-worktree-info-location').innerText(), alpha.repositoryName + ' · 工作树 · ' + alpha.observed.name);
    const path = locationInfo.locator('dd code').filter({hasText: alpha.location});
    assert.equal(await path.innerText(), alpha.location); await selectHoverText(path);
    await capture(page, 'source-control-fixture-worktree-text-selection.png');
    await locationInfo.getByRole('button', {name: /复制路径$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.location);
    await locationInfo.getByRole('button', {name: /复制分支$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.branch);
    await assertHoverBesideList(locationInfo);
    await capture(page, 'source-control-fixture-worktree-path-hover.png');
    await closeHover(locationInfo);
    const keyboardWidth = await root().locator('.source-control-sidebar').boundingBox();
    await drag(narrowSeparator, 640 - keyboardWidth.width, 0);
    await page.waitForFunction((id:string) => [...document.querySelectorAll<HTMLElement>('.code-source-control-page:not([hidden]) .source-control-worktree')].find(element => element.closest('[data-source-worktree]')?.getAttribute('data-source-worktree') === id)?.dataset.sourceRowLayout === 'full', alpha.worktreeId);
    const taskIcon = catalogWorktree.getByRole('button', {name: '打开任务 浏览器任务', exact: true});
    const statusButton = catalogWorktree.locator('.source-control-status-button');
    await taskIcon.focus(); await taskIcon.press('Shift+Tab');
    assert.equal(await statusButton.evaluate((element: HTMLElement) => document.activeElement === element && element.matches(':focus-visible')), true, '从任务入口按Shift+Tab先到可操作的状态入口');
    await statusButton.press('Enter'); const details = statusDetails(); await details.waitFor();
    assert.equal(await statusButton.getAttribute('aria-expanded'), 'true');
    assert.equal(await details.locator('dd').nth(2).innerText(), '浏览器任务', '键盘打开状态详情保留当前工作树任务');
    await statusButton.press('Escape'); await details.waitFor({state: 'hidden'});
    assert.equal(await statusButton.getAttribute('aria-expanded'), 'false');
    await statusButton.press('Enter'); await details.waitFor();
    const statusOwnerFold = catalogRepository.locator('.source-control-repository-fold');
    await statusOwnerFold.focus(); await statusOwnerFold.press('Enter');
    await details.waitFor({state: 'hidden'});
    assert.equal(await statusButton.getAttribute('aria-expanded'), 'false', '键盘折叠所属代码库也关闭隐藏行的状态详情');
    await statusOwnerFold.press('Enter'); await statusButton.focus();
    await statusButton.press('Enter'); await details.waitFor();
    const statusCatalogToggle = root().getByRole('button', {name:'折叠代码库列表', exact:true});
    await statusCatalogToggle.focus(); await statusCatalogToggle.press('Enter');
    await details.waitFor({state:'hidden'});
    assert.equal(await statusButton.getAttribute('aria-expanded'), 'false', '键盘折叠整体目录关闭状态详情');
    await root().getByRole('button', {name:'展开代码库列表', exact:true}).press('Enter'); await statusButton.focus();
    const syncButton = catalogWorktree.locator('.source-control-sync-button'), branchButton = catalogWorktree.locator('.source-control-row-action-button');
    if (await syncButton.count()) {
      await statusButton.press('Shift+Tab');
      assert.equal(await syncButton.evaluate((element:HTMLElement) => document.activeElement === element && element.matches(':focus-visible')), true, '文件状态之前是独立同步快捷入口');
      await syncButton.press('Shift+Tab');
    } else await statusButton.press('Shift+Tab');
    assert.equal(await branchButton.evaluate((element:HTMLElement) => document.activeElement === element && element.matches(':focus-visible')), true, '分支名称保持独立键盘入口');
    await branchButton.press('Shift+Tab');
    const focusState = () => sourceName.evaluate((element: HTMLElement) => ({active: document.activeElement === element, focusVisible: element.matches(':focus-visible'), activeLabel: document.activeElement?.getAttribute('aria-label')}));
    const initialFocus = await focusState();
    assert.ok(initialFocus.active && initialFocus.focusVisible, '键盘Tab能回到工作树名称并呈现键盘焦点：' + JSON.stringify(initialFocus));
    await locationInfo.waitFor(); await enterHoverCard(locationInfo);
    await page.mouse.move(5, 5); await page.waitForTimeout(450);
    await capture(page, 'source-control-fixture-worktree-keyboard-away.png');
    assert.equal(await locationInfo.isVisible(), true, '鼠标移开超过关闭延时后，键盘焦点继续保留来源信息：' + JSON.stringify(await focusState()));
    await locationInfo.hover(); await assertHoverBesideList(locationInfo);
    await locationInfo.getByRole('button', {name: /复制路径$/}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.location, '键盘打开的来源卡仍可移入并复制');
    await capture(page, 'source-control-fixture-worktree-keyboard-hover.png');
    await closeHover(locationInfo);
    assert.equal(await taskIcon.locator('.anticon-project').count(), 1);
    assert.equal(await catalogWorktree.locator('.source-control-worktree-status [data-status-kind="ahead"] .anticon-arrow-up,.source-control-worktree-status [data-status-kind="behind"] .anticon-arrow-down').count(), [alpha.observed.ahead, alpha.observed.behind].filter((count: number) => count > 0).length, '真实分叉的非零远程数量使用对应箭头，与任务项目图标区分');
    await taskIcon.hover(); await page.getByRole('tooltip', {name: '任务：浏览器任务', exact: true}).waitFor();
    await narrowSeparator.dblclick();
    assert.equal(await root().locator('.source-control-context').count(), 0, '浏览区不重复代码库和分支');
    for (const button of [catalogRepository.locator('.source-control-repository-fold')]) {
      const initial = await button.getAttribute('aria-expanded');
      await button.click(); assert.equal(await button.getAttribute('aria-expanded'), initial === 'true' ? 'false' : 'true');
      assert.ok((await diff().innerText()).includes(alpha.workingText.trim()));
      await button.click(); assert.equal(await button.getAttribute('aria-expanded'), initial);
    }
    const collapse = root().getByRole('button', {name: '折叠代码库列表', exact: true}); await collapse.click();
    assert.equal(await root().locator('.source-control-repository-tree-scroll').isVisible(), false);
    assert.equal(await checkoutGroup(alpha.worktreeId).isVisible(), true);
    assert.ok((await diff().innerText()).includes(alpha.workingText.trim()));
    await root().getByRole('button', {name: '展开代码库列表', exact: true}).click();
    await selectFile(peer, 'unstaged');
    assert.equal(await checkoutGroup(alpha.worktreeId).count(), 0, '同名工作树只按选中身份查看');
    assert.equal(await checkoutGroup(peer.worktreeId).isVisible(), true);
    const peerRow = root().locator('[data-source-repository="' + peer.repositoryId + '"] [data-source-worktree="' + peer.worktreeId + '"]');
    assert.equal(await peerRow.getByRole('button', {name: /^(打开|进入)任务 /}).count(), 0, '同名不推导任务');
    await selectFile(alpha, 'unstaged');
    const modes = root().locator('.source-control-browse-tabs');
    await assertSelectionContrast(modes, '未提交变更');
    await capture(page, 'source-control-fixture-single-worktree-selection.png'); await noOverflow();
  });

  await scenario('当前分支历史仅提供范围与作者筛选，提交展开文件后点击差异，搜索从两个字符开始', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha'), beta = values.find((item: any) => item.name === 'beta');
    await selectWorktree(alpha);
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    const commit = commitRow(alpha.commitHash); await commit.waitFor();
    assert.equal(await commitRow(beta.commitHash).count(), 0, '当前分支历史不混入同库其他任务独有提交');
    assert.equal(await root().getByRole('button', {name: '选择历史查看范围', exact: true}).count(), 1);
    assert.equal(await root().getByRole('button', {name: '筛选提交作者', exact: true}).count(), 1);
    assert.equal(await root().getByRole('button', {name: '重置筛选条件', exact: true}).isDisabled(), true);
    const toggle = commit.locator('.source-control-commit-toggle');
    const historyRows = root().locator('.source-control-graph > li'); assert.ok(await historyRows.count() >= 3);
    const middle = commitRow(fixture.commitHash), last = historyRows.nth(2), lastHash = await last.getAttribute('data-source-commit'); assert.ok(lastHash);
    const middleToggle = middle.locator('.source-control-commit-toggle'), lastToggle = last.locator('.source-control-commit-toggle');
    const middleCard = page.getByRole('article', {name: '提交摘要', exact: true}).filter({has: page.getByText(fixture.commitHash, {exact: true})});
    const movementSeparator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    for (const width of ['normal', '300px']) {
      for (const historyRow of [commit, middle, last]) {
        const fold = historyRow.locator('.source-control-history-fold');
        if (await fold.getAttribute('aria-expanded') === 'true') await fold.click();
      }
      if (width === 'normal') await movementSeparator.dblclick();
      else await movementSeparator.press('End');
      await hoverThenVerticalClick(middleToggle, toggle, middleCard, 'source-control-history-hover-up-' + width + '.png');
      assert.equal(await root().getByRole('article', {name: '完整提交信息', exact: true}).locator('dd code').first().innerText(), alpha.commitHash);
      await hoverThenVerticalClick(middleToggle, lastToggle, middleCard, 'source-control-history-hover-down-' + width + '.png');
      assert.equal(await root().getByRole('article', {name: '完整提交信息', exact: true}).locator('dd code').first().innerText(), lastHash);
    }
    for (const historyRow of [commit, middle, last]) {
      const fold = historyRow.locator('.source-control-history-fold');
      if (await fold.getAttribute('aria-expanded') === 'true') await fold.click();
    }
    const observedDiffRequests: string[] = [];
    const observeDiff = (request: any) => { if (new URL(request.url()).pathname.endsWith('/code/diff')) observedDiffRequests.push(request.url()); };
    page.on('request', observeDiff);
    try {
      await toggle.click();
      await commit.locator('.source-control-commit-children .task-changed-row').first().waitFor();
      assert.equal(observedDiffRequests.length, 0, '展开提交只读取变更文件，点击文件才读取差异');
    } finally { page.off('request', observeDiff); }
    const selectedCard = page.getByRole('article', {name: '提交摘要', exact: true}).filter({has: page.getByText(alpha.commitHash, {exact: true})});
    const expandedFile = commit.locator('.source-control-commit-children .task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + alpha.path + '"]')});
    await hoverThenVerticalClick(toggle, expandedFile, selectedCard, 'source-control-history-hover-expanded-file.png');
    await diff().getByText(alpha.historyText.trim(), {exact: false}).waitFor();
    await root().locator('.source-control-reader').getByRole('button', {name: '查看完整提交信息', exact: true}).click();
    const details = root().getByRole('article', {name: '完整提交信息', exact: true}); await details.waitFor();
    assert.ok((await details.innerText()).includes(alpha.commitHash));
    const subject = await toggle.locator('strong').innerText();
    assert.equal(await details.getByRole('heading', {name: subject, exact: true}).count(), 1, '详细阅读区只显示一次提交标题');
    const description = details.locator('.source-control-commit-message');
    if (await description.count()) assert.ok(!(await description.innerText()).startsWith(subject), '正文去除重复标题并保留描述');
    assert.ok(!(await details.innerText()).includes('Buildr-Task: browser-task'), '已识别的机器尾注由结构化任务入口展示，不重复进正文');
    await details.getByRole('button', {name: /复制完整信息$/}).click();
    const completeCommit = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(completeCommit.includes(subject) && completeCommit.includes(alpha.commitHash) && completeCommit.includes('Buildr-Task: browser-task'), '复制完整信息保留原提交消息和任务尾注');
    const checkoutBox = await root().locator('.source-control-checkout').boundingBox(), headingBox = await details.getByRole('heading', {name: subject, exact: true}).boundingBox();
    assert.ok(checkoutBox && headingBox && headingBox.y >= checkoutBox.y + checkoutBox.height && headingBox.y - checkoutBox.y - checkoutBox.height < 32, '详细提交信息紧接来源栏展示，不保留大块空白');
    assert.equal(await commit.locator('.source-control-graph-refs,.source-control-history-task,.source-control-commit-toggle code,.source-control-commit-toggle time').count(), 0, '简洁历史行不常驻提交标识、日期、引用标签与任务文字块');
    const commitTask = commit.getByRole('button', {name: '打开提交任务 浏览器任务', exact: true});
    assert.equal(await commitTask.locator('.anticon-project').count(), 1);
    assert.ok((await commitTask.getAttribute('class')).includes('source-control-task-link'), '历史任务入口与工作树任务入口使用相同标识');
    assert.equal(await details.getByRole('button', {name: '打开任务 浏览器任务', exact: true}).count(), 1);
    await commitTask.hover(); await page.getByRole('tooltip', {name: '任务：浏览器任务', exact: true}).waitFor();
    await capture(page, 'source-control-fixture-compact-history-detail.png');
    const separator = root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true});
    await separator.press('End');
    await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-reader')?.getBoundingClientRect().width || Infinity) <= 301);
    const narrowHeader = root().locator('.source-control-checkout'), summary = narrowHeader.locator('.code-location-summary-content');
    const summaryBounds = await summary.boundingBox(); assert.ok(summaryBounds && summaryBounds.width > 0);
    const parts = await summary.locator('strong, :scope > span, code').evaluateAll((elements: HTMLElement[]) => elements.map(element => ({left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width})));
    assert.ok(parts.every((part: any) => part.left >= summaryBounds.x - 1 && part.right <= summaryBounds.x + summaryBounds.width + 1), '300px阅读区的长代码库、工作树及提交标识均限制在来源摘要边界内');
    assert.ok(await summary.locator('code').evaluate((element: HTMLElement) => element.getBoundingClientRect().width > 0), '窄阅读区保留提交标识可见空间');
    const headerActions = [narrowHeader.getByRole('button', {name: '查看完整提交信息', exact: true}), narrowHeader.getByRole('button', {name: '打开工作树任务 浏览器任务', exact: true}), root().getByRole('button', {name: '展开阅读', exact: true})];
    const actionBounds = [];
    for (const action of headerActions) { await action.click({trial: true}); const box = await action.boundingBox(); assert.ok(box); actionBounds.push(box); }
    assert.ok(actionBounds.every((box: any) => box.x >= summaryBounds.x + summaryBounds.width - 1), '窄来源摘要不覆盖提交信息、任务和阅读操作');
    assert.ok(actionBounds.every((box: any, index: number) => actionBounds.slice(index + 1).every((next: any) => box.x + box.width <= next.x + 1 || next.x + next.width <= box.x + 1)), '提交信息、任务和阅读按钮彼此不重叠');
    await toggle.hover();
    const narrowPopup = page.getByRole('article', {name: '提交摘要', exact: true}); await narrowPopup.waitFor(); await narrowPopup.hover();
    await assertHoverBesideList(narrowPopup);
    await capture(page, 'source-control-fixture-header-300px.png');
    await root().getByRole('button', {name: '展开阅读', exact: true}).click();
    await narrowPopup.waitFor({state: 'hidden'});
    assert.equal(await root().locator('.source-control-sidebar').isVisible(), false, '展开阅读不残留来自隐藏列表的悬浮信息');
    await root().getByRole('button', {name: '恢复分屏', exact: true}).click();
    await headerActions[0].hover(); await narrowPopup.waitFor(); await narrowPopup.hover();
    await assertHoverInViewport(narrowPopup);
    await capture(page, 'source-control-fixture-header-summary-300px.png');
    await closeHover(narrowPopup);
    await details.waitFor(); assert.ok((await details.innerText()).includes(alpha.commitHash));
    for (const width of ['300px', 'normal']) {
      if (width === 'normal') await separator.dblclick();
      await dismissHoverCards();
      const positionButton = root().locator('.code-location-summary'); await positionButton.click();
      const positionInfo = root().getByRole('region', {name: '位置信息', exact: true}); await positionInfo.waitFor();
      assert.deepEqual(await positionInfo.locator('dt').allTextContents(), ['目录', '固定提交']);
      await assertLocationCopyRows(positionInfo);
      assert.equal(await positionInfo.locator('dd code').last().innerText(), alpha.commitHash);
      const positionLayout = await positionInfo.evaluate((element: HTMLElement) => {
        const labels = [...element.querySelectorAll('dt')].map(label => {
          const range = document.createRange(); range.selectNodeContents(label);
          return {lines: range.getClientRects().length, right: label.getBoundingClientRect().right, valueLeft: label.nextElementSibling!.getBoundingClientRect().left};
        });
        const box = element.getBoundingClientRect();
        return {labels, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, right: box.right, viewportWidth: innerWidth};
      });
      assert.ok(positionLayout.labels.every((label: any) => label.lines === 1 && label.right < label.valueLeft), '目录与固定提交标签保持单行，且不侵入内容列：' + JSON.stringify(positionLayout));
      assert.ok(positionLayout.scrollWidth <= positionLayout.clientWidth + 1 && positionLayout.right <= positionLayout.viewportWidth + 1, '300px和正常阅读区的位置信息都没有横向溢出：' + JSON.stringify(positionLayout));
      await positionInfo.getByRole('button', {name: '复制路径', exact: true}).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.location);
      await positionInfo.getByRole('button', {name: '复制提交标识', exact: true}).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), alpha.commitHash);
      await capture(page, width === 'normal' ? 'source-control-fixture-position-fixed-commit.png' : 'source-control-fixture-position-fixed-commit-300px.png');
      await positionInfo.getByRole('button', {name: '收起位置信息', exact: true}).click();
    }
    await capture(page, 'source-control-fixture-history-detail-stable.png');
    await openCommitFile(alpha.commitHash, alpha.path); await diff().getByText(alpha.historyText.trim(), {exact: false}).waitFor();
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.ok((await diff().innerText()).includes(alpha.historyText.trim()), '折叠提交保留已选差异');
    const fold = commit.locator('.source-control-history-fold'); await fold.click();
    assert.equal(await fold.getAttribute('aria-expanded'), 'true');
    assert.ok((await diff().innerText()).includes(alpha.historyText.trim()), '独立展开按钮保持当前文件差异');
    await fold.click(); assert.equal(await fold.getAttribute('aria-expanded'), 'false');
    assert.ok((await diff().innerText()).includes(alpha.historyText.trim()), '独立折叠按钮保持当前文件差异');
    const search = root().getByRole('textbox', {name: '搜索提交历史', exact: true});
    const queries: string[] = [];
    const observeHistory = (request: any) => { const url = new URL(request.url()); if (url.pathname.endsWith('/code/history') && url.searchParams.has('query')) queries.push(url.searchParams.get('query')!); };
    page.on('request', observeHistory);
    try {
      await search.fill('l'); await page.waitForTimeout(400); assert.deepEqual(queries, [], '一个字符不提交搜索请求');
      const response = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/history') && url.searchParams.get('query') === 'li'; });
      await search.fill('li'); const returned = await response; assert.equal(returned.status(), 200);
      const url = new URL(returned.url()); assert.equal(url.searchParams.get('worktreeId'), alpha.worktreeId); assert.equal(url.searchParams.get('branch'), null, '历史从所选工作树当前 HEAD 读取');
      assert.deepEqual(queries, ['li']); await commitRow(alpha.commitHash).waitFor();
    } finally { page.off('request', observeHistory); }
    await search.fill(''); await commitRow(alpha.commitHash).waitFor();
    await noOverflow(); await capture(page, 'source-control-fixture-branch-history-search.png');
  });

  await scenario('跨工作树迟到读取隔离，固定历史与同名无尾注提交保持精确来源', async () => {
    await page.setViewportSize({width: 1440, height: 1000}); await open();
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha'), beta = values.find((item: any) => item.name === 'beta'), peer = values.find((item: any) => item.name === 'peer');
    await selectFile(beta, 'unstaged');
    let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = async (route: any) => { if (new URL(route.request().url()).searchParams.get('worktreeId') === alpha.worktreeId) await gate; try { await route.continue(); } catch { /* A new worktree may cancel the former transport. */ } };
    await page.route('**/code/diff?**', delayed);
    try {
      const started = page.waitForRequest((request: any) => { const url = new URL(request.url()); return url.pathname.endsWith('/code/diff') && url.searchParams.get('worktreeId') === alpha.worktreeId; });
      await selectWorktree(alpha); await fileRow(alpha.worktreeId, 'unstaged', alpha.path).click(); await started; await selectFile(beta, 'unstaged'); release();
      await page.waitForTimeout(450); assert.ok((await diff().innerText()).includes(beta.workingText.trim()));
      assert.ok(!(await diff().innerText()).includes(alpha.workingText.trim()));
    } finally { release(); await page.unroute('**/code/diff?**', delayed); }
    await root().locator('.source-control-browse-tabs').getByText('提交历史', {exact: true}).click();
    const modes = root().locator('.source-control-browse-tabs'); assert.equal(await modes.getByRole('radio', {name: '提交历史', exact: true}).isChecked(), true);
    for (const value of [alpha, peer]) {
      await selectWorktree(value);
      await openCommitFile(value.commitHash, value.path); await diff().getByText(value.historyText.trim(), {exact: false}).waitFor();
      await assertFullVersion(value, 'commit', value.historyText, value.commitHash);
      if (value.name === 'alpha') {
        await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(value.historyText);
        const returned = page.waitForResponse((response: any) => { const url = new URL(response.url()); return url.pathname.endsWith('/code/file') && url.searchParams.get('checkoutId') === value.worktreeId && url.searchParams.get('filePath') === value.path; });
        await root().getByRole('button', {name: '查看当前文件', exact: true}).click();
        const response = await returned; assert.equal(response.status(), 200);
        const current = await response.json(); assert.equal(current.source.checkoutId, value.worktreeId); assert.equal(current.source.location, value.location); assert.equal(current.source.commitHash, null); assert.equal(current.content, value.workingText);
        const explorer = page.locator('.code-explorer-stage:visible');
        const editor = explorer.locator('.file-editing-source .cm-line').filter({hasText:value.workingText.trim()}); await editor.waitFor();
        assert.equal(await editor.textContent(), value.workingText.trim(), '当前文件通过实际编辑器显示对应工作树正文');
        await explorer.getByRole('button', {name: '返回源代码管理', exact: true}).click(); await waitFull(value.historyText);
        await root().getByRole('button', {name: '返回差异', exact: true}).click();
      }
      if (value.name === 'peer') {
        await root().getByRole('button', {name: '查看完整提交信息', exact: true}).first().hover();
        const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor(); assert.match(await popup.innerText(), /未关联任务/);
        assert.equal(await popup.getByRole('button', {name: '打开任务 浏览器任务', exact: true}).count(), 0, '同名工作树不推导任务关联');
      }
    }
    await capture(page, 'source-control-fixture-worktree-history-source.png'); await noOverflow();
  });

  await scenario('任务原改动阅读与源代码管理双向关联，真实工作树预选和返回保留现场', async () => {
    const values = await worktrees(), alpha = values.find((item: any) => item.name === 'alpha');
    await page.setViewportSize({width: 1440, height: 1000}); await page.goto(workspaceUrl + '/tasks/browser-task');
    const task = page.locator('#task-detail-main:visible'); await task.locator('[data-task-content=changes]').click();
    const reader = task.getByRole('region', {name: '改动与提交工作台', exact: true}); await reader.waitFor(); await assertTaskIdentity();
    const current = reader.locator('.task-rail-body > section > .task-changed-list .task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + fixture.path + '"]')}).first();
    await current.click(); await reader.getByRole('region', {name: '差异内容', exact: true}).getByText(alpha.workingText.trim(), {exact: false}).waitFor();
    const selected = await reader.locator('.task-changed-list > .is-selected .task-changed-path').first().getAttribute('title');
    const response = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-control') && url.searchParams.get('taskId') === 'browser-task'; });
    await task.locator('[data-task-source-control="browser-task"]').click(); const observed = await (await response).json();
    assert.ok(observed.selectedWorktrees.some((item: any) => item.repositoryId === alpha.repositoryId && item.worktreeId === alpha.worktreeId));
    await checkoutGroup(alpha.worktreeId).waitFor(); assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1, '精确任务范围来自已核对evidence');
    await selectFile(alpha, 'unstaged');
    const repository = (await catalog()).repositories.find((item: any) => item.id === alpha.repositoryId);
    await root().getByRole('button', {name: '查看主工作树 · ' + repository.name, exact: true}).click();
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
    assert.equal(await checkoutGroup(mainWorktreeId).isVisible(), true);
    const refreshed = page.waitForResponse((returned: any) => { const url = new URL(returned.url()); return url.pathname.endsWith('/code/source-control') && url.searchParams.get('taskId') === 'browser-task'; });
    const refreshButton = root().getByRole('button', {name: '刷新源代码管理', exact: true}); await refreshButton.click(); await refreshed;
    await refreshButton.locator('.anticon-spin').waitFor({state: 'hidden'});
    assert.equal(await root().locator('[data-change-worktree]:visible').count(), 1);
    assert.equal(await checkoutGroup(mainWorktreeId).isVisible(), true, '刷新保留用户选中的主工作树，不重放任务预选');
    await selectWorktree(alpha);
    const taskLink = root().locator('[data-source-repository="' + alpha.repositoryId + '"] [data-source-worktree="' + alpha.worktreeId + '"]').getByRole('button', {name: /^(打开|进入)任务 浏览器任务$/});
    await taskLink.click(); await reader.waitFor(); await assertTaskIdentity();
    assert.equal(await task.locator('[data-task-content=changes]').getAttribute('aria-selected'), 'true');
    assert.equal(await reader.locator('.task-changed-list > .is-selected .task-changed-path').first().getAttribute('title'), selected);
    assert.ok((await reader.getByRole('region', {name: '差异内容', exact: true}).innerText()).includes(alpha.workingText.trim()));
    await noOverflow(); await capture(page, 'source-control-fixture-task-worktree-return.png');
  });
  await runSourceControlBranchesJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors,scenario});
  await runSourceControlActionsJourney({t,page,workspaceUrl,capture,fixture,scenario});
  if (focus) {
    assert.ok(selectedCases.length, '源码管理 focus 必须选择至少一个真实场景');
    process.stderr.write('[buildr-browser-code-focus] ' + JSON.stringify({focus,cases:selectedCases}) + '\n');
  }
}
