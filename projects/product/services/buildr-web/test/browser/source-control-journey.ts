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
    assert.equal(await row().count(), 1, '同一路径的暂存与继续编辑在统一更改列表只保留一行');
    await row().click(); await diff().getByText('export const sourceControlWorking = 34;', {exact: false}).waitFor();
    // 统一更改差异直接比较最近提交与当前文件，暂存内容不冒充基线。
    assert.ok((await diff().innerText()).includes('explorerAnswer = 1'), '更改差异以最近提交为旧侧');
    assert.ok(!(await diff().innerText()).includes('sourceControlIndex = 21'), '暂存内容不进入统一更改比较');
    // 显式已暂存、未暂存比较继续由接口保持真实基线与实际全文。
    const layerRead = async (area: string) => {
      const response = await page.request.get(api + '/code/diff?' + new URLSearchParams({repositoryId: mainRepositoryId, worktreeId: mainWorktreeId, filePath: fixture.path, area}));
      assert.equal(response.status(), 200); return response.json();
    };
    const stagedDiff = await layerRead('staged'); assert.equal(stagedDiff.area, 'staged');
    assert.match(stagedDiff.patch || '', /\+export const sourceControlIndex = 21;/, '已暂存接口仍比较提交与索引');
    const unstagedDiff = await layerRead('unstaged'); assert.equal(unstagedDiff.area, 'unstaged');
    assert.match(unstagedDiff.patch || '', /\+export const sourceControlWorking = 34;/, '未暂存接口仍比较索引与当前文件');
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.workingText);
    const summary = await root().locator('.code-location-summary').innerText();
    assert.match(summary, /api|主工作树/, '位置摘要指向真实代码库与工作树'); assert.ok(!summary.includes('已暂存'), '统一更改完整文件不再标注已暂存版本');
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
    await row().click(); await diff().getByText('export const sourceControlWorking = 34;', {exact: false}).waitFor();
    const absoluteMain = fixture.location + '/' + fixture.path;
    assert.equal(await root().getByLabel('完整绝对路径', {exact: true}).innerText(), absoluteMain);
    assert.equal(await diff().locator('.file-diff-original .cm-line').first().innerText(), fixture.historyText.split('\n')[0], '左右对比直接从最近提交的真实代码开始，没有机器补丁头');
    assert.equal(await diff().locator('.file-diff-current .cm-line').first().innerText(), fixture.workingText.trim());
    await root().locator('.task-diff-actions').getByText('上下对比', {exact:true}).click();
    await diff().locator('.file-diff-editor[data-diff-mode="unified"]').waitFor();
    assert.equal(await diff().locator('.line-meta,.line-hunk').count(), 0, '单区块上下对比不展示机器头或首个区块标记');
    assert.equal(await diff().locator('.cm-deletedChunk .cm-deletedLine').first().innerText(), fixture.historyText.split('\n')[0]);
    assert.equal(await diff().locator('.file-diff-current .cm-line').first().innerText(), fixture.workingText.trim());
    await root().locator('.task-diff-actions').getByText('左右对比', {exact:true}).click();
    await diff().locator('.file-diff-editor[data-diff-mode="split"]').waitFor();
    await root().locator('.task-diff-toolbar').getByRole('button', {name: '复制路径', exact: true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), absoluteMain);
    const mainFileRow = row();
    const pathHoverStart = Date.now(); await mainFileRow.hover();
    const pathHint = page.getByRole('tooltip', {name: absoluteMain, exact: true}); await pathHint.waitFor({timeout: 600});
    assert.ok(Date.now() - pathHoverStart < 600, '路径提示快速显示完整真实绝对路径');
    assert.equal(await pathHint.evaluate((element: HTMLElement) => getComputedStyle(element).pointerEvents), 'none', '路径提示不拦截相邻行选择');
    assert.equal(await mainFileRow.locator('.task-changed-path').innerText(), '', '普通文件不常驻相对目录');
    assert.equal(await mainFileRow.locator('.task-changed-path').isVisible(), false, '无目录提示时不占文件名空间');
    assert.equal(await mainFileRow.locator('.task-changed-path').getAttribute('title'), null, '不保留迟到的原生相对路径提示');
    await row().click(); await diff().getByText('export const sourceControlWorking = 34;', {exact:false}).waitFor();
    assert.equal(await root().locator('.task-diff-scope,.source-control-history-version').count(),0, '差异头没有重复来源说明或独立比较带');
    await capture(page, 'source-control-file-name-priority.png');
    assert.ok((await diff().innerText()).includes('explorerAnswer = 1'), '更改差异旧侧来自最近提交');
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click(); await waitFull(fixture.workingText);
    assert.ok(!(await fullText()).includes('sourceControlIndex'));
    await noOverflow(); await capture(page, 'source-control-fixture-working-full.png');
    const peer = observed.repositories.find((repository: any) => repository.location === fixture.unavailableRepositoryLocation); assert.ok(peer);
    const refreshCatalog = async () => {
      const observations: Promise<any>[] = [];
      const observe = (returned: any) => {const url = new URL(returned.url()); if (url.pathname.endsWith('/code/source-control') && url.searchParams.has('repositoryId')) observations.push(returned.json());};
      page.on('response', observe);
      try {
        const inventory = page.waitForResponse((returned: any) => new URL(returned.url()).pathname.endsWith('/code/source-control-inventory'));
        await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click(); assert.equal((await inventory).status(), 200);
        await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
        return {repositories:(await Promise.all(observations)).flatMap(value => value.repositories)};
      } finally {page.off('response', observe);}
    };
    await fixture.withUnavailableRepository(async () => {
      const unavailable = (await refreshCatalog()).repositories.find((repository: any) => repository.id === peer.id);
      assert.ok(unavailable); assert.equal(unavailable.worktreeCount, null); assert.equal(unavailable.fileCount, null); assert.ok(unavailable.diagnostics.length);
      const upper = root().locator('[data-source-repository="' + peer.id + '"]');
      const status = upper.locator(':scope > .source-control-repository .source-control-status-button');
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
        return {...checkout,repositoryId:repository.id,repositoryName:repository.name,repositoryLabel:codeRepositoryLabel(repository),worktreeId:repository.worktrees.find((worktree: any) => worktree.location === checkout.location).worktreeId};
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
      // 界面统一从“更改”分组选择：暂存、未暂存与未跟踪同行按路径去重；
      // expectedArea 是服务端核对出的真实比较层（working / untracked / commit）。
      const selectImage = async (checkout: any, relative: string, before: any, after: any, expectedArea: string = 'working') => {
        await selectCheckout(checkout);
        const group = checkoutGroup(checkout.worktreeId); await group.waitFor();
        const areaHeading = group.locator('[data-change-area="working"] [data-area-toggle]');
        if (await areaHeading.getAttribute('aria-expanded') !== 'true') await areaHeading.click();
        await fileRow(checkout.worktreeId, relative).click();
        const body = await readDiff(checkout, expectedArea, relative); assertPayload(body, checkout, expectedArea, before, after, relative);
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
      await selectImage(primary, images.addedPath, null, versions.added, 'untracked');
      await assertImageLayout('added');
      await capture(page, 'source-control-image-untracked.png');
      await narrowImages(); await assertImageLayout('added'); await capture(page, 'source-control-image-untracked-300px.png');
      await openCompleteImage(primary, 'working', images.addedPath, versions.added, null, versions.added);
      await assertImageLayout('added'); await normalImages();
      // 显式已暂存、未暂存图片比较继续由接口保持真实侧别，统一列表不复制分层入口。
      const staged = await readDiff(primary, 'staged', images.imagePath);
      assertPayload(staged, primary, 'staged', versions.history, versions.index, images.imagePath);
      assert.equal(staged.imagePreview.before.source.commitHash, primary.commitHash);
      assert.equal(staged.imagePreview.after.revision, 'index:' + primary.indexBlob + ':100644');
      const unstaged = await readDiff(primary, 'unstaged', images.imagePath);
      assertPayload(unstaged, primary, 'unstaged', versions.index, versions.working, images.imagePath);
      assert.equal(unstaged.imagePreview.before.revision, 'index:' + primary.indexBlob + ':100644');
      const working = await selectImage(primary, images.imagePath, versions.history, versions.working);
      assert.equal(working.imagePreview.before.source.commitHash, primary.commitHash); assert.ok(working.imagePreview.after.revision.startsWith('current:'));
      await assertImageLayout('paired-wide');
      await capture(page, 'source-control-image-index-current.png');
      await openCompleteImage(primary, 'working', images.imagePath, versions.working, versions.history, versions.working);
      await selectImage(peerImage, images.imagePath, null, versions.peer, 'untracked');
      await selectImage(primary, images.imagePath, versions.history, versions.working);
      await narrowImages();
      await assertSide('before', versions.history); await assertSide('after', versions.working); await noOverflow();
      await assertImageLayout('paired-narrow');
      const bounds = await preview().getByRole('img').evaluateAll((elements: HTMLImageElement[]) => elements.map(element => {
        const box = element.getBoundingClientRect(), reader = element.closest('.source-control-reader')!.getBoundingClientRect(); return {left:box.left,right:box.right,readerLeft:reader.left,readerRight:reader.right};
      }));
      assert.ok(bounds.every((box: any) => box.left >= box.readerLeft && box.right <= box.readerRight), '300px阅读区图片实际边界不越栏');
      await capture(page, 'source-control-image-300px.png'); await normalImages();
      const stagedDeleted = await selectImage(primary, images.stagedDeletedPath, versions.deleted, null);
      await assertImageLayout('deleted');
      await openCompleteImage(primary, 'working', images.stagedDeletedPath, versions.deleted, versions.deleted, null, primary.commitHash);
      await selectSourceControlView(root(), 'history');
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
      await selectSourceControlView(root(), 'changes');
      await selectCheckout(primary); await fileRow(primary.worktreeId, images.binaryPath).click();
      const binary = await readDiff(primary, 'untracked', images.binaryPath); assert.equal(binary.binary, true); assert.equal(binary.imagePreview, undefined);
      await root().getByText('非文本内容，不提供文本差异。', {exact:true}).waitFor(); assert.equal(await preview().count(), 0);
      await noOverflow();
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
    await assertSelectionContrast(root().locator('.source-control-view-tabs'), '提交历史');
    await root().getByRole('button', {name: '返回差异', exact: true}).click();
    const orientation = root().locator('.task-diff-mode');
    await orientation.getByText('上下对比', {exact: true}).click();
    await assertSelectionContrast(orientation, '上下对比');
    await drag(root().getByRole('separator', {name: '调整源代码管理与阅读区宽度', exact: true}), -55, 0);
    await assertSelectionContrast(root().locator('.source-control-view-tabs'), '提交历史');
    await assertSelectionContrast(orientation, '上下对比');
    await capture(page, 'source-control-fixture-history-return-resize-selection.png');
    await noOverflow();
  });

  await scenario('鼠标调整两轴、展开恢复、刷新与窄分屏保留手动比例', async () => {
    await page.setViewportSize({width: 1440, height: 900}); await open();
    await row().click(); await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
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
    await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
    await root().locator('[data-source-repository="' + mainRepositoryId + '"] > .source-control-repository .source-control-repository-copy').click();
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
    await page.setViewportSize({width: 1024, height: 768}); await row().click();
    await diff().getByText('sourceControlWorking = 34', {exact: false}).waitFor();
    await root().getByRole('button', {name: '查看完整文件', exact: true}).click({trial: true}); await noOverflow();
    await capture(page, 'source-control-fixture-split-1024.png');
    assert.deepEqual(await page.evaluate((values: string[]) => values.map(key => localStorage.getItem(key)), keys), saved, '临时窗口缩窄不覆盖手动比例');
    await page.setViewportSize({width: 1440, height: 900});
    assert.deepEqual([Number(await horizontal.getAttribute('aria-valuenow')), Number(await vertical.getAttribute('aria-valuenow'))], after);
  });

  await scenario('离开保留的源代码管理页面时悬浮信息层关闭', async () => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(workspaceUrl + '/code/explorer'); await page.locator('.code-explorer-stage').waitFor();
    await showPrimaryNavigation(page, 'code');await page.getByRole('navigation', {name: '代码导航', exact: true}).getByRole('link', {name: '源代码管理', exact: true}).click();
    await root().locator('.source-control-repository-copy').first().waitFor();
    await selectSourceControlView(root(), 'history');
    await root().locator('.source-control-graph li').first().waitFor();
    await root().locator('.source-control-graph > li').first().locator('.source-control-commit-toggle').hover();
    const popup = page.getByRole('article', {name: '提交摘要', exact: true}); await popup.waitFor(); await popup.hover();
    await page.goBack(); await page.locator('.code-explorer-stage:visible').waitFor();
    await popup.waitFor({state: 'hidden'});
    assert.equal(await page.locator('.code-source-control-page').count(), 1, '源页面仍挂载，浮层由活动现场控制关闭');
    await noOverflow();
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
