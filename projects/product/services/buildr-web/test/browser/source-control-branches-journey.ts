
import assert from 'node:assert/strict';
import { codeRepositoryLabel } from '../../src/features/code/code-source-labels.ts';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** Real branch data and physical snapshots are supplied by the isolated host. */
export async function runSourceControlBranchesJourney({ t, page, workspaceUrl, capture, fixture, expectedBrowserErrors, scenario = (name: string, action: () => Promise<void>) => t.test(name, action) }: any) {
  const root = () => page.locator('.code-source-control-page:visible');
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  const row = (worktree: any) => root().locator('[data-source-repository="' + worktree.repositoryId + '"] [data-source-worktree="' + worktree.worktreeId + '"]');
  const graph = () => root().locator('.source-control-graph > li');
  const commit = (hash: string) => root().locator('.source-control-graph > li[data-source-commit="' + hash + '"]');
  const search = () => root().getByRole('textbox', { name: '搜索提交历史', exact: true });
  const reset = () => root().getByRole('button', { name: '重置筛选条件', exact: true });
  const scope = () => root().getByRole('button', { name: '选择历史查看范围', exact: true });
  const historyResult = (worktreeId: string, conditions: Record<string, string | null>) => page.waitForResponse((response: any) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/code/history') && url.searchParams.get('worktreeId') === worktreeId
      && Object.entries(conditions).every(([key, value]) => url.searchParams.get(key) === value);
  });
  const waitRows = async (hashes: string[]) => {
    await page.waitForFunction((expected: string[]) => {
      const actual = Array.from(document.querySelectorAll('.code-source-control-page:not([hidden]) .source-control-graph > li')).map(element => element.getAttribute('data-source-commit'));
      return JSON.stringify(actual) === JSON.stringify(expected);
    }, hashes);
    assert.deepEqual(await graph().evaluateAll((elements: HTMLElement[]) => elements.map(element => element.getAttribute('data-source-commit'))), hashes);
  };
  const open = async (branches: any) => {
    await page.mouse.move(400, 4);
    await page.goto(workspaceUrl + '/code/source-control');
    await root().locator('.source-control-repository-copy').first().waitFor();
    await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
    const response = await page.request.get(api + '/code/source-control'); assert.equal(response.status(), 200);
    const catalog = await response.json(), repository = catalog.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === branches.location));
    assert.ok(repository);
    const adapt = (worktree: any) => ({ ...worktree, repositoryId: repository.id, repositoryName: repository.name, repositoryLabel: codeRepositoryLabel(repository) });
    const worktree = adapt(repository.worktrees.find((item: any) => item.location === branches.location));
    const main = adapt(repository.worktrees.find((item: any) => item.isMain));
    const fold = root().locator('[data-source-repository="' + repository.id + '"] > .source-control-repository .source-control-repository-fold');
    if (await fold.getAttribute('aria-expanded') === 'false') await fold.click();
    await row(worktree).locator('.source-control-repository-copy').click();
    await selectSourceControlView(root(), 'history');
    await commit(branches.tip).waitFor();
    return { worktree, main };
  };
  const viewScope = async (name: string, current = false) => {
    await scope().click();
    const picker = page.getByRole('region', { name: '历史查看范围', exact: true }); await picker.waitFor();
    if (current) await picker.getByRole('button', { name: '查看当前工作分支历史', exact: true }).click();
    else await picker.getByRole('button', { name: new RegExp('^查看 ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:，|$)') }).click();
    await picker.waitFor({ state: 'hidden' });
  };
  const chooseAuthor = async (email: string) => {
    await root().getByRole('button',{name:'筛选提交作者',exact:true}).click();
    const option = page.getByRole('region',{name:'提交作者',exact:true}).getByRole('option',{name:new RegExp(' · '+email.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
    await option.waitFor(); assert.equal(await option.count(), 1, '同名作者可按邮箱明确区分'); await option.click();
  };
  const manage = async (worktree: any, name: string, fromMenu = false) => {
    await page.mouse.move(400, 4);
    await page.getByRole('article', { name: '工作树来源信息', exact: true }).waitFor({ state: 'hidden' });
    const label = worktree.isMain ? '主工作树' : worktree.name;
    const branch = row(worktree).getByRole('button', { name: '管理分支 · ' + worktree.repositoryLabel + ' · ' + label, exact: true });
    if (!fromMenu && await branch.isVisible()) await branch.click();
    else {const menu = await openOperations(worktree); await menu.getByRole('menuitem', {name:'管理分支', exact:true}).click();}
    const manager = page.getByRole('region', { name: '分支管理 · ' + worktree.repositoryLabel + ' · ' + label, exact: true });
    await manager.waitFor();
    await page.mouse.move(900, 4);
    await page.getByRole('article', { name: '工作树来源信息', exact: true }).waitFor({ state: 'hidden' });
    await manager.getByRole('button', { name: '管理 ' + name, exact: true }).click();
    const action = page.getByRole('region', { name: '分支操作 · ' + name, exact: true }); await action.waitFor();
    assert.equal(await page.locator('.ant-modal-mask:visible,.ant-drawer-mask:visible').count(), 0, '切换使用相邻小浮层，没有整页遮罩');
    return { manager, action };
  };
  const switchTo = async (worktree: any, name: string, target: string, remote = false, collapseWhileWriting = false, lifecycle: {whileWriting?(): Promise<void>; afterWrite?(result: any): Promise<void>} = {}) => {
    const { manager, action } = await manage(worktree, name);
    assert.equal(await action.getByRole('button').count(), 1, '正常切换只提供一个明确动作');
    const button = action.getByRole('button', { name: (remote ? '检出并切换为 ' : '切换到 ') + target, exact: true });
    // A cached list may open while its fresh observation is still loading. Start
    // the write-response clock only when that explicit action is actually usable.
    await page.waitForFunction((label: string) => [...document.querySelectorAll<HTMLElement>('[aria-label]')].some(element => element.getAttribute('aria-label') === label && [...element.querySelectorAll<HTMLButtonElement>('button')].some(candidate => !candidate.disabled && !candidate.classList.contains('ant-btn-loading'))), '分支操作 · ' + name);
    await button.click({trial:true});
    const beforeClick = await button.evaluate((element: HTMLButtonElement) => {
      const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {disabled:element.disabled,html:element.outerHTML,rect:rect.toJSON(),hitInside:Boolean(hit && element.contains(hit)),hit:hit ? {tag:hit.tagName,className:hit.getAttribute('class'),text:hit.textContent?.slice(0,120)} : null};
    });
    assert.equal(beforeClick.hitInside, true, '单动作按钮中心不能被父列表或页脚遮住：' + JSON.stringify(beforeClick));
    const requests: Array<{method: string; path: string; time: number}> = [];
    const observe = (request: any) => { const url = new URL(request.url()); if (url.pathname.endsWith('/code/branch-switch') || url.pathname.endsWith('/code/branches')) requests.push({method:request.method(),path:url.pathname,time:Date.now()}); };
    page.on('request', observe);
    await page.evaluate(() => {
      const state = window as unknown as {__branchWriteEvents: unknown[]; __branchWriteListener?: EventListener};
      state.__branchWriteEvents = [];
      state.__branchWriteListener = event => {
        const target = event.target instanceof Element ? event.target.closest('.branch-management-action,.branch-management-entry,.source-control-row-action-button') : null;
        if (target) state.__branchWriteEvents.push({type:event.type,time:Date.now(),tag:target.tagName,label:target.getAttribute('aria-label'),text:target.textContent?.slice(0,120)});
      };
      document.addEventListener('pointerdown', state.__branchWriteListener, true);
      document.addEventListener('click', state.__branchWriteListener, true);
    });
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = async (route: any) => { await gate; await route.continue(); };
    const delayWrite = collapseWhileWriting || Boolean(lifecycle.whileWriting);
    if (delayWrite) await page.route('**/code/branch-switch', delayed);
    const writeStartedAt = Date.now();
    let stage = 'click-action', failed = false;
    try {
      const returned = page.waitForResponse((response: any) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/code/branch-switch'), { timeout: 20_000 }).then((response:any) => ({response}), (error:unknown) => ({error}));
      const started = delayWrite ? page.waitForRequest((request: any) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/code/branch-switch')) : null;
      await button.click();
      if (started) { stage = 'await-write-request'; await started; }
      if (collapseWhileWriting) {
        stage = 'collapse-while-writing';
        await root().getByRole('button', { name: '折叠代码库列表', exact: true }).click();
        assert.equal(await root().locator('.source-control-repository-tree-scroll').isVisible(), false);
      }
      stage = 'while-writing';
      await lifecycle.whileWriting?.();
      release();
      stage = 'await-write-response';
      const outcome = await returned; if (outcome.error) throw outcome.error;
      stage = 'validate-write-response';
      const response = outcome.response; assert.equal(response.status(), 200);
      const result = await response.json(); assert.equal(result.source.worktreeId, worktree.worktreeId); assert.equal(result.branch, target);
      stage = 'after-write';
      await lifecycle.afterWrite?.(result);
      stage = 'close-branch-manager';
      await manager.waitFor({ state: 'hidden' });
      if (collapseWhileWriting) { stage = 'expand-repository-list'; await root().getByRole('button', { name: '展开代码库列表', exact: true }).click(); }
      stage = 'await-current-branch';
      await page.waitForFunction(({ id, title }: { id: string; title: string }) => [...document.querySelectorAll('.code-source-control-page:not([hidden]) [data-source-worktree]')].some(element => element.getAttribute('data-source-worktree') === id && element.querySelector('.source-control-row-action-button')?.getAttribute('title') === title), { id: worktree.worktreeId, title: target + ' · 管理分支' });
      assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), target + ' · 管理分支');
      return result;
    } catch (error) {
      failed = true;
      const failure = error instanceof Error ? {name:error.name,message:error.message} : {name:typeof error,message:String(error)};
      const state = await page.evaluate(() => ({events:(window as unknown as {__branchWriteEvents?:unknown[]}).__branchWriteEvents,panels:[...document.querySelectorAll<HTMLElement>('.branch-management-panel,.branch-management-action')].map(element=>({label:element.getAttribute('aria-label'),text:element.innerText,visible:Boolean(element.getClientRects().length)}))})).catch(()=>null);
      process.stderr.write('[source-control-branch-write-failure] '+JSON.stringify({name,target,collapseWhileWriting,stage,error:failure,elapsedMs:Date.now()-writeStartedAt,pageClosed:page.isClosed(),cancelled:Boolean(t.signal?.aborted),beforeClick,requests,state})+'\n');
      await capture(page, 'source-control-branch-write-failure.png').catch(()=>{});
      throw error;
    } finally {
      release();
      page.off('request', observe);
      await page.evaluate(() => {
        const state = window as unknown as {__branchWriteListener?: EventListener};
        if (state.__branchWriteListener) { document.removeEventListener('pointerdown',state.__branchWriteListener,true);document.removeEventListener('click',state.__branchWriteListener,true);delete state.__branchWriteListener; }
      }).catch(()=>{});
      if (delayWrite) {
        try { await page.unroute('**/code/branch-switch', delayed); }
        catch (error) {
          const pageClosed = page.isClosed(), cancelled = Boolean(t.signal?.aborted);
          if (!failed && !pageClosed && !cancelled) throw error;
          const failure = error instanceof Error ? {name:error.name,message:error.message} : {name:typeof error,message:String(error)};
          process.stderr.write('[source-control-branch-write-cleanup-failure] '+JSON.stringify({name,target,stage,error:failure,originalFailure:failed,pageClosed,cancelled})+'\n');
        }
      }
    }
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const operationMenu = (worktree?:any) => page.getByRole('menu', {name:worktree ? '操作菜单 · ' + worktree.repositoryLabel + ' · ' + (worktree.isMain ? '主工作树' : worktree.name) : '源代码管理操作菜单', exact:true});
  const openOperations = async (worktree:any) => {
    const trigger = row(worktree).getByRole('button', {name:'操作菜单 · ' + worktree.repositoryLabel + ' · ' + (worktree.isMain ? '主工作树' : worktree.name), exact:true});
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
    await row(worktree).locator('.source-control-row-menu-button[aria-expanded="true"]').waitFor();
    await operationMenu(worktree).waitFor(); return operationMenu(worktree);
  };

  await scenario('指定位置就地切换与远程一步检出，固定历史独立且当前范围动态跟随', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const { worktree, main } = await open(branches);
      await viewScope(branches.branch);
      await chooseAuthor(branches.authorEmail);
      const queryResult = historyResult(worktree.worktreeId, { branch: 'refs/heads/' + branches.branch, authorEmail: branches.authorEmail, query: 'unique' });
      await search().fill('unique'); await queryResult; await waitRows([branches.tip]);
      await commit(branches.tip).locator('.source-control-commit-toggle').click();
      await commit(branches.tip).locator('.task-changed-row').filter({ has: page.locator('.task-changed-path[data-file-path="' + branches.historyPath + '"]') }).click();
      const diff = root().getByRole('region', { name: '差异内容', exact: true });
      await diff.getByText('export const branchHistory = 3;', { exact: false }).waitFor();
      const readingBefore = await root().locator('.code-location-summary').innerText();
      const mainOthers = branches.otherPositions(branches.root);
      await switchTo(main, branches.alternate, branches.alternate);
      assert.deepEqual(branches.otherPositions(branches.root), mainOthers, '主目录切换不写其他工作位置');
      assert.equal(await row(worktree).locator('.source-control-repository-copy').getAttribute('aria-pressed'), 'true', '操作未选中主目录不改当前阅读位置');
      assert.equal(await root().locator('.code-location-summary').innerText(), readingBefore);
      assert.ok((await diff.innerText()).includes('branchHistory = 3'));
      assert.equal(await search().inputValue(), 'unique'); await waitRows([branches.tip]);
      await switchTo(main, branches.originalBranch, branches.originalBranch);
      const others = branches.otherPositions(branches.location);
      await switchTo(worktree, branches.alternate, branches.alternate, false, true);
      assert.deepEqual(branches.otherPositions(branches.location), others);
      assert.equal(branches.keepContent(), 'preserve current work\n');
      assert.equal(await search().inputValue(), 'unique'); await waitRows([branches.tip]);
      assert.ok((await diff.innerText()).includes('branchHistory = 3'), '指定范围仍有效的固定版本阅读不被实际切换清除');
      const resetResult = historyResult(worktree.worktreeId, { branch: null, authorEmail: null, query: null });
      await reset().click(); await resetResult; await commit(branches.first).waitFor();
      assert.equal(await commit(branches.tip).count(), 0, '恢复当前后读取实际切换后的 HEAD');
      const remoteResult = await switchTo(worktree, branches.remote + '/' + branches.remoteName, branches.remoteName, true);
      assert.equal(remoteResult.head, branches.second); assert.equal(remoteResult.upstream, branches.remote + '/' + branches.remoteName);
      assert.equal(remoteResult.effects.createdLocalBranch, branches.remoteName);
      assert.deepEqual(branches.localTracking(), { head: branches.second, upstream: branches.remoteRef });
      assert.equal(branches.keepContent(), 'preserve current work\n');
      assert.deepEqual(branches.otherPositions(branches.location), others, '远程检出只修改指定位置及新增本地引用');
      await commit(branches.second).waitFor(); assert.equal(await commit(branches.tip).count(), 0);
      assert.equal(await scope().innerText(), '分支：当前');
      await noOverflow(); await capture(page, 'source-control-remote-checkout-current-history.png');
    });
  });


  await scenario('占用与覆盖风险在小浮层局部表达，拒绝切换保留真实现场', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const { worktree } = await open(branches), beforeOccupied = branches.snapshot();
      const occupied = await manage(worktree, branches.originalBranch);
      assert.equal(await occupied.action.getByRole('button', { name: '打开所在位置', exact: true }).count(), 1);
      assert.equal(await occupied.action.getByRole('button', { name: /^切换到 / }).count(), 0, '已被占用时没有强行切换动作');
      assert.deepEqual(branches.snapshot(), beforeOccupied);
      await page.mouse.click(5, 5); await occupied.manager.waitFor({ state: 'hidden' });
      branches.blockCheckout();
      await root().getByRole('button', { name: '刷新源代码管理', exact: true }).click();
      await row(worktree).locator('.source-control-status-count[data-status-kind="files"]').filter({ hasText: '2' }).waitFor();
      const beforeBlocked = branches.snapshot(), blocked = await manage(worktree, branches.alternate);
      expectedBrowserErrors.add('/code/branch-switch');
      const returned = page.waitForResponse((response: any) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/code/branch-switch'));
      await blocked.action.getByRole('button', { name: '切换到 ' + branches.alternate, exact: true }).click();
      assert.equal((await returned).status(), 409);
      await blocked.action.getByRole('alert').waitFor();
      await blocked.action.getByRole('button', { name: '查看现有改动', exact: true }).waitFor();
      assert.ok((await blocked.action.innerText()).includes(branches.historyPath));
      assert.deepEqual(branches.snapshot(), beforeBlocked, '覆盖拒绝不能修改文件、索引、引用或上游');
      assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), branches.branch + ' · 管理分支');
      await noOverflow(); await capture(page, 'source-control-branch-switch-conflict-inline.png');
    });
  });
}
