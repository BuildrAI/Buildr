import assert from 'node:assert/strict';

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
    await page.goto(workspaceUrl + '/code/source-control');
    await root().locator('.source-control-repository-copy').first().waitFor();
    const response = await page.request.get(api + '/code/source-control'); assert.equal(response.status(), 200);
    const catalog = await response.json(), repository = catalog.repositories.find((item: any) => item.worktrees.some((worktree: any) => worktree.location === branches.location));
    assert.ok(repository);
    const adapt = (worktree: any) => ({ ...worktree, repositoryId: repository.id, repositoryName: repository.name });
    const worktree = adapt(repository.worktrees.find((item: any) => item.location === branches.location));
    const main = adapt(repository.worktrees.find((item: any) => item.isMain));
    const fold = root().locator('[data-source-repository="' + repository.id + '"] > .source-control-repository .source-control-repository-fold');
    if (await fold.getAttribute('aria-expanded') === 'false') await fold.click();
    await row(worktree).locator('.source-control-repository-copy').click();
    await root().locator('.source-control-browse-tabs').getByText('提交历史', { exact: true }).click();
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
  const manage = async (worktree: any, name: string) => {
    const label = worktree.isMain ? '主工作树' : worktree.name;
    await row(worktree).getByRole('button', { name: '管理分支 · ' + worktree.repositoryName + ' · ' + label, exact: true }).click();
    const manager = page.getByRole('region', { name: '分支管理 · ' + worktree.repositoryName + ' · ' + label, exact: true });
    await manager.waitFor();
    await manager.getByRole('button', { name: '管理 ' + name, exact: true }).click();
    const action = page.getByRole('region', { name: '分支操作 · ' + name, exact: true }); await action.waitFor();
    assert.equal(await page.locator('.ant-modal-mask:visible,.ant-drawer-mask:visible').count(), 0, '切换使用相邻小浮层，没有整页遮罩');
    return { manager, action };
  };
  const switchTo = async (worktree: any, name: string, target: string, remote = false, collapseWhileWriting = false) => {
    const { manager, action } = await manage(worktree, name);
    assert.equal(await action.getByRole('button').count(), 1, '正常切换只提供一个明确动作');
    const button = action.getByRole('button', { name: (remote ? '检出并切换为 ' : '切换到 ') + target, exact: true });
    // A cached list may open while its fresh observation is still loading. Start
    // the write-response clock only when that explicit action is actually usable.
    await page.waitForFunction((label: string) => [...document.querySelectorAll<HTMLElement>('[aria-label]')].some(element => element.getAttribute('aria-label') === label && [...element.querySelectorAll<HTMLButtonElement>('button')].some(candidate => !candidate.disabled && !candidate.classList.contains('ant-btn-loading'))), '分支操作 · ' + name);
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
    if (collapseWhileWriting) await page.route('**/code/branch-switch', delayed);
    try {
      const returned = page.waitForResponse((response: any) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/code/branch-switch'), { timeout: 20_000 }).then((response:any) => ({response}), (error:unknown) => ({error}));
      const started = collapseWhileWriting ? page.waitForRequest((request: any) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/code/branch-switch')) : null;
      await button.click();
      if (collapseWhileWriting) {
        await started;
        await root().getByRole('button', { name: '折叠代码库列表', exact: true }).click();
        assert.equal(await root().locator('.source-control-repository-tree-scroll').isVisible(), false);
      }
      release();
      const outcome = await returned; if (outcome.error) throw outcome.error;
      const response = outcome.response; assert.equal(response.status(), 200);
      const result = await response.json(); assert.equal(result.source.worktreeId, worktree.worktreeId); assert.equal(result.branch, target);
      await manager.waitFor({ state: 'hidden' });
      if (collapseWhileWriting) await root().getByRole('button', { name: '展开代码库列表', exact: true }).click();
      await page.waitForFunction(({ id, title }: { id: string; title: string }) => [...document.querySelectorAll('.code-source-control-page:not([hidden]) [data-source-worktree]')].some(element => element.getAttribute('data-source-worktree') === id && element.querySelector('.source-control-row-action-button')?.getAttribute('title') === title), { id: worktree.worktreeId, title: target + ' · 管理分支' });
      assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), target + ' · 管理分支');
      return result;
    } catch (error) {
      const state = await page.evaluate(() => ({events:(window as unknown as {__branchWriteEvents?:unknown[]}).__branchWriteEvents,panels:[...document.querySelectorAll<HTMLElement>('.branch-management-panel,.branch-management-action')].map(element=>({label:element.getAttribute('aria-label'),text:element.innerText,visible:Boolean(element.getClientRects().length)}))})).catch(()=>null);
      process.stderr.write('[source-control-branch-write-failure] '+JSON.stringify({name,target,collapseWhileWriting,beforeClick,requests,state})+'\n');
      await capture(page, 'source-control-branch-write-failure.png').catch(()=>{});
      throw error;
    } finally {
      release();
      page.off('request', observe);
      await page.evaluate(() => {
        const state = window as unknown as {__branchWriteListener?: EventListener};
        if (state.__branchWriteListener) { document.removeEventListener('pointerdown',state.__branchWriteListener,true);document.removeEventListener('click',state.__branchWriteListener,true);delete state.__branchWriteListener; }
      }).catch(()=>{});
      if (collapseWhileWriting) await page.unroute('**/code/branch-switch', delayed);
    }
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

  await scenario('分支与同名作者组合过滤只读，窄区同排重置恢复当前范围', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const { worktree } = await open(branches), before = branches.snapshot();
      assert.equal(await reset().isDisabled(), true);
      await viewScope(branches.branch);
      const authorResult = historyResult(worktree.worktreeId, { branch: 'refs/heads/' + branches.branch, authorEmail: branches.authorEmail, query: null });
      await chooseAuthor(branches.authorEmail); assert.equal((await authorResult).status(), 200);
      assert.ok((await root().locator('.branch-history-filter-author').getAttribute('title')).includes(branches.authorEmail), '选中同名作者后完整邮箱仍可核对');
      await waitRows([branches.tip, branches.first]);
      const queryResult = historyResult(worktree.worktreeId, { branch: 'refs/heads/' + branches.branch, authorEmail: branches.authorEmail, query: 'shared' });
      await search().fill('shared'); const filtered = await queryResult; assert.equal(filtered.status(), 200);
      assert.deepEqual((await filtered.json()).commits.map((item: any) => item.hash), [branches.first]);
      await waitRows([branches.first]);
      assert.equal(await commit(branches.second).count(), 0, '相同姓名的另一个邮箱提交不能混入');
      assert.deepEqual(branches.snapshot(), before, '筛选不修改文件、索引、引用或跟踪关系');
      for (const width of [1440, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        await root().getByRole('separator', { name: '调整源代码管理与阅读区宽度', exact: true }).press('Home');
        const controls = await root().getByRole('group', { name: '提交历史筛选', exact: true }).evaluate((element: HTMLElement) => {
          const box = element.getBoundingClientRect();
          return { width: element.clientWidth, scrollWidth: element.scrollWidth, left: box.left, right: box.right, parts: [...element.querySelectorAll(':scope > *')].map(part => { const bounds = part.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right }; }) };
        });
        assert.ok(controls.scrollWidth <= controls.width + 1 && controls.parts.every((part: any) => part.left >= controls.left - 1 && part.right <= controls.right + 1), '窄列表筛选操作全部可达：' + JSON.stringify(controls));
        assert.ok(controls.parts.every((part: any) => Math.abs(part.top - controls.parts[0].top) <= 3), '重置始终与范围和作者同排');
        const branchButton = row(worktree).locator('.source-control-row-action-button'), bounds = await branchButton.boundingBox();
        assert.ok(bounds && bounds.width <= 73, '当前工作分支入口不占据长列');
        assert.equal(await branchButton.getAttribute('title'), branches.branch + ' · 管理分支');
        assert.ok(!(await branchButton.innerText()).includes('fixture/team/'), '长名称紧凑显示末段，完整名称可按需查看');
        await noOverflow(); await capture(page, 'source-control-branch-filters-' + width + '.png');
      }
      const resetResult = historyResult(worktree.worktreeId, { branch: null, authorEmail: null, query: null });
      await reset().click(); assert.equal((await resetResult).status(), 200); await commit(branches.tip).waitFor();
      assert.equal(await search().inputValue(), ''); assert.equal(await reset().isDisabled(), true);
      assert.equal(await scope().innerText(), '分支：当前');
      assert.equal(await root().locator('.branch-history-filter-author').getAttribute('title'), '作者：全部');
      await viewScope(branches.remote + '/' + branches.remoteName); await commit(branches.second).waitFor();
      assert.equal(await commit(branches.tip).count(), 0, '远程范围按可达提交查看，不改变当前目录');
      assert.deepEqual(branches.snapshot(), before);
    });
  });

  await scenario('作者姓名和邮箱搜索、我的提交me与无配置回退均保持只读', async () => {
    await fixture.withBranches(async (branches:any) => {
      await page.setViewportSize({width:1440,height:1000});
      branches.configureAuthor({name:branches.authorName,email:branches.authorEmail,userName:'备用作者',userEmail:branches.otherEmail});
      const configured = branches.snapshot(), {worktree}=await open(branches);
      const readIdentity = async () => {
        const query=new URLSearchParams({repositoryId:worktree.repositoryId,worktreeId:worktree.worktreeId});
        const response=await page.request.get(api+'/code/authors?'+query);assert.equal(response.status(),200);return response.json();
      };
      assert.deepEqual((await readIdentity()).currentAuthor,{name:branches.authorName,email:branches.authorEmail},'me使用具体位置的author.*身份，优先于不同的user.*身份');
      const popup = () => page.getByRole('region',{name:'提交作者',exact:true});
      const openAuthors=async()=>{await root().getByRole('button',{name:'筛选提交作者',exact:true}).click();await popup().waitFor();};
      const authorSearch=()=>popup().getByRole('textbox',{name:'输入作者姓名或邮箱',exact:true});
      const options=()=>popup().getByRole('option');
      const waitOptionCount=async(count:number)=>{
        try{
          await popup().waitFor({state:'visible'});
          await authorSearch().evaluate(async()=>{await new Promise(requestAnimationFrame);});
          await page.waitForFunction((expected:number)=>{
            const visible=(element:HTMLElement)=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&getComputedStyle(element).visibility==='visible';};
            const panels=[...document.querySelectorAll<HTMLElement>('[aria-label="提交作者"]')].filter(visible);
            return panels.length===1 && [...panels[0].querySelectorAll<HTMLElement>('[role="option"]')].filter(visible).length===expected;
          },count);
          for(let index=0;index<count;index++)await options().nth(index).waitFor({state:'visible'});
          assert.equal(await options().count(),count);
          for(const option of await options().all())assert.equal(await option.isVisible(),true);
        }catch(error){
          const state=await page.evaluate(()=>{
            const style=(element:Element)=>{const css=getComputedStyle(element),box=element.getBoundingClientRect();return {tag:element.tagName,className:element.getAttribute('class'),display:css.display,visibility:css.visibility,opacity:css.opacity,transform:css.transform,box:box.toJSON()};};
            return {expanded:document.querySelector('[aria-label="筛选提交作者"]')?.getAttribute('aria-expanded'),active:document.activeElement?.outerHTML,popups:[...document.querySelectorAll<HTMLElement>('[aria-label="提交作者"]')].map(element=>{const ancestors=[];for(let parent:Element|null=element;parent&&ancestors.length<8;parent=parent.parentElement)ancestors.push(style(parent));return {text:element.innerText,input:element.querySelector<HTMLInputElement>('input')?.value,options:[...element.querySelectorAll<HTMLElement>('[role="option"]')].map(option=>({...style(option),email:option.dataset.authorEmail,text:option.innerText})),ancestors};})};
          });
          process.stderr.write('[source-control-author-visibility-failure] '+JSON.stringify({expected:count,state})+'\n');
          await capture(page,'source-control-author-visibility-failure.png');
          throw error;
        }
      };
      await openAuthors();
      const me=popup().getByRole('button',{name:'筛选我的提交（me）',exact:true});
      await me.getByText(branches.authorEmail,{exact:true}).waitFor();assert.equal(await me.isEnabled(),true);
      await authorSearch().fill(branches.authorName);await waitOptionCount(2);
      assert.equal(await options().filter({hasText:branches.authorEmail}).count(),1);
      assert.equal(await options().filter({hasText:branches.otherEmail}).count(),1,'同名候选用各自邮箱明确区分');
      await authorSearch().fill('first.author');await waitOptionCount(1);
      assert.ok((await options().first().innerText()).includes(branches.authorEmail));
      await authorSearch().fill('second.author');await waitOptionCount(1);
      const otherResult=historyResult(worktree.worktreeId,{branch:null,authorEmail:branches.otherEmail,query:null});
      await options().filter({hasText:branches.otherEmail}).click();const other=await otherResult;assert.equal(other.status(),200);await waitRows([branches.second]);
      assert.ok((await root().locator('.branch-history-filter-author').getAttribute('title')).includes(branches.otherEmail));
      await openAuthors();assert.equal(await authorSearch().inputValue(),'','重开候选面板清空上次名称查询');
      const mineResult=historyResult(worktree.worktreeId,{branch:null,authorEmail:branches.authorEmail,query:null});
      await popup().getByRole('button',{name:'筛选我的提交（me）',exact:true}).click();
      const mine=await mineResult;assert.equal(mine.status(),200);
      assert.deepEqual((await mine.json()).commits.map((item:any)=>item.hash),[branches.tip,branches.first]);
      await waitRows([branches.tip,branches.first]);
      assert.equal(await root().getByRole('button',{name:'筛选提交作者',exact:true}).innerText(),'作者：我（me）');
      const keyword=historyResult(worktree.worktreeId,{branch:null,authorEmail:branches.authorEmail,query:'unique'});
      await search().fill('unique');await keyword;await waitRows([branches.tip]);
      const cleared=historyResult(worktree.worktreeId,{branch:null,authorEmail:null,query:null});
      await reset().click();await cleared;await commit(branches.second).waitFor();
      assert.equal(await search().inputValue(),'');assert.equal(await reset().isDisabled(),true);
      assert.equal(await root().locator('.branch-history-filter-author').getAttribute('title'),'作者：全部');
      assert.deepEqual(branches.snapshot(),configured,'作者候选查找、me和重置不能写Git现场或配置');
      await openAuthors();await authorSearch().fill(branches.authorName);await waitOptionCount(2);
      await capture(page,'source-control-author-search-and-me.png');
      await authorSearch().press('Escape');await popup().waitFor({state:'hidden'});

      branches.configureAuthor(null);
      const unconfigured=branches.snapshot();
      await open(branches);
      assert.equal((await readIdentity()).currentAuthor,null,'两个邮箱均无有效配置时不从现有提交或宿主账号猜me');
      await openAuthors();
      const unavailable=popup().getByRole('button',{name:'筛选我的提交（me）',exact:true});
      await unavailable.getByText('Git 作者邮箱不可用',{exact:true}).waitFor();assert.equal(await unavailable.isDisabled(),true);
      await authorSearch().fill('first.author');await waitOptionCount(1);
      await capture(page,'source-control-author-me-unavailable.png');
      const ordinary=historyResult(worktree.worktreeId,{branch:null,authorEmail:branches.authorEmail,query:null});
      await options().filter({hasText:branches.authorEmail}).click();assert.equal((await ordinary).status(),200);await waitRows([branches.tip,branches.first]);
      assert.equal(await root().getByRole('button',{name:'筛选提交作者',exact:true}).innerText(),'作者：'+branches.authorName,'me不可用不妨碍普通作者选择');
      assert.deepEqual(branches.snapshot(),unconfigured);
    });
  });

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
      await row(worktree).locator('.source-control-file-status').filter({ hasText: '2' }).waitFor();
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

  await scenario('离开保留页面关闭分支与作者浮层，返回保留历史条件', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440,height:1000});
      const {worktree}=await open(branches), before=branches.snapshot();
      await viewScope(branches.branch); await chooseAuthor(branches.authorEmail);
      const filtered=historyResult(worktree.worktreeId,{branch:'refs/heads/'+branches.branch,authorEmail:branches.authorEmail,query:'shared'});
      await search().fill('shared'); await filtered; await waitRows([branches.first]);
      const navigate = async (name:string) => {
        const link=page.getByRole('navigation',{name:'代码导航',exact:true}).getByRole('link',{name,exact:true});
        // Keyboard navigation does not dispatch an outside pointer click that
        // could accidentally hide a leaked portal before view deactivation.
        await link.focus(); await link.press('Enter');
      };
      const leaveAndReturn=async (overlays:any[])=>{
        await navigate('资源管理器'); await page.locator('.code-explorer-stage:visible').waitFor();
        assert.equal(await root().count(),0);
        for(const overlay of overlays)await overlay.waitFor({state:'hidden'});
        assert.equal(await page.locator('.code-source-control-page').count(),1,'原页面仍挂载，浮层须依活动现场关闭');
        await capture(page,'source-control-inactive-menu-closed.png');
        await navigate('源代码管理'); await root().locator('.source-control-repository-copy').first().waitFor();
        assert.equal(await search().inputValue(),'shared'); await waitRows([branches.first]);
        assert.equal(await scope().innerText(),'分支：'+branches.branch);
        assert.ok((await root().locator('.branch-history-filter-author').getAttribute('title')).includes(branches.authorEmail));
      };
      const management=await manage(worktree,branches.alternate);
      await leaveAndReturn([management.manager,management.action]);
      await scope().click();
      const picker=page.getByRole('region',{name:'历史查看范围',exact:true}); await picker.waitFor();
      await leaveAndReturn([picker]);
      await root().getByRole('button',{name:'筛选提交作者',exact:true}).click();
      const authors=page.getByRole('region',{name:'提交作者',exact:true}); await authors.waitFor();
      await leaveAndReturn([authors]);
      assert.deepEqual(branches.snapshot(),before,'关闭查看浮层和页面往返不产生Git写入');
    });
  });
}
