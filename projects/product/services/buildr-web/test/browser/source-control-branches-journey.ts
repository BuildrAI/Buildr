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
    try {
      const returned = page.waitForResponse((response: any) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/code/branch-switch'), { timeout: 20_000 }).then((response:any) => ({response}), (error:unknown) => ({error}));
      const started = delayWrite ? page.waitForRequest((request: any) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/code/branch-switch')) : null;
      await button.click();
      if (started) await started;
      if (collapseWhileWriting) {
        await root().getByRole('button', { name: '折叠代码库列表', exact: true }).click();
        assert.equal(await root().locator('.source-control-repository-tree-scroll').isVisible(), false);
      }
      await lifecycle.whileWriting?.();
      release();
      const outcome = await returned; if (outcome.error) throw outcome.error;
      const response = outcome.response; assert.equal(response.status(), 200);
      const result = await response.json(); assert.equal(result.source.worktreeId, worktree.worktreeId); assert.equal(result.branch, target);
      await lifecycle.afterWrite?.(result);
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
      if (delayWrite) await page.unroute('**/code/branch-switch', delayed);
    }
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const operationMenu = (worktree?:any) => page.getByRole('menu', {name:worktree ? '操作菜单 · ' + worktree.repositoryName + ' · ' + (worktree.isMain ? '主工作树' : worktree.name) : '源代码管理操作菜单', exact:true});
  const openOperations = async (worktree:any) => {
    await row(worktree).getByRole('button', {name:'操作菜单 · ' + worktree.repositoryName + ' · ' + (worktree.isMain ? '主工作树' : worktree.name), exact:true}).click();
    await operationMenu(worktree).waitFor(); return operationMenu(worktree);
  };
  const fetchOne = async (worktree:any) => {const menu = await openOperations(worktree); await menu.getByRole('menuitem', {name:'获取远程', exact:true}).click();};
  const fetchAll = async () => {await root().getByRole('button', {name:'源代码管理操作菜单', exact:true}).click(); await operationMenu().getByRole('menuitem', {name:'全部获取远程', exact:true}).click();};


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
        assert.ok(bounds && bounds.width >= 24, '窄栏仍保留可点击的分支名称入口');
        const layout = await row(worktree).locator('.source-control-row-copy').evaluate((element:HTMLElement) => {const name = element.querySelector('.source-control-repository-copy')!.getBoundingClientRect(), branch = element.querySelector('.source-control-row-action-button')!.getBoundingClientRect(), box = element.getBoundingClientRect(); return {adjacent:name.right <= branch.left && branch.right <= box.right + 1, contained:element.scrollWidth <= element.clientWidth + 1};});
        assert.deepEqual(layout, {adjacent:true, contained:true}, '来源名称后分支共同收缩，不越过名称区域');
        assert.equal(await branchButton.getAttribute('title'), branches.branch + ' · 管理分支');
        assert.equal(await branchButton.innerText(), branches.branch, '保留完整分支文本，视觉省略不改变名称');
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

  for (const refreshMode of ['delayed', 'failed']) await scenario(`远程检出后目录读取${refreshMode === 'delayed' ? '延迟' : '失败'}，立即显示已确认分支且旧状态不冒充新状态`, async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches);
      await root().locator('.source-control-browse-tabs').getByText('未提交变更', {exact:true}).click();
      const retainedFile = () => root().locator('.source-control-change-area .task-changed-row').filter({has:page.locator('.task-changed-path[data-file-path="' + branches.keepPath + '"]')});
      await retainedFile().waitFor();
      assert.equal(await row(worktree).locator('.source-control-status-count[data-status-kind="files"]').innerText(), '1', '切换前确实存在旧分支的已读文件数量');
      const catalogPath = new URL(api + '/code/source-control').pathname;
      const matchesCatalog = (url: URL) => url.pathname === catalogPath;
      const scopedReads: string[] = [];
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      const intercept = async (route: any) => {
        scopedReads.push(new URL(route.request().url()).searchParams.get('repositoryId') || '');
        if (refreshMode === 'delayed') { await gate; await route.continue(); }
        else await route.fulfill({status:503, json:{error:{code:'browser_catalog_unavailable', message:'浏览器回归：目录读取暂不可用。'}}});
      };
      if (refreshMode === 'failed') expectedBrowserErrors.add(catalogPath);
      await page.route(matchesCatalog, intercept);
      const refreshed = page.waitForResponse((response: any) => new URL(response.url()).pathname === catalogPath).then((response: any) => ({response}), (error: unknown) => ({error}));
      try {
        await switchTo(worktree, branches.remote + '/' + branches.remoteName, branches.remoteName, true, false, {afterWrite:async result => {
          // Hold the target observation to distinguish confirmed write facts from a later read.
          await page.waitForFunction(({id, title}: {id:string; title:string}) => [...document.querySelectorAll('.code-source-control-page:not([hidden]) [data-source-worktree]')].some(element => element.getAttribute('data-source-worktree') === id && element.querySelector('.source-control-row-action-button')?.getAttribute('title') === title), {id:worktree.worktreeId, title:branches.remoteName + ' · 管理分支'});
          assert.equal(result.head, branches.second);
          assert.equal(await row(worktree).locator('.source-control-status-button').getAttribute('data-file-state'), 'unknown');
          assert.equal(await row(worktree).locator('.source-control-status-button').getAttribute('data-remote-state'), 'unknown');
          assert.equal(await row(worktree).locator('.source-control-status-count').count(), 0, '旧分支的数量不沿用到新分支');
          assert.equal(await retainedFile().count(), 0, '尚未重读时不把旧变更列表当作新分支的当前内容');
          assert.ok((await root().locator('.code-location-summary').innerText()).includes(branches.remoteName), '阅读位置也使用服务端确认的新分支');
          await page.locator('.branch-management-panel:visible').waitFor({state:'hidden', timeout:2000});
          assert.deepEqual(scopedReads, [worktree.repositoryId], '切换只重新读取目标代码库');
          await capture(page, 'source-control-checkout-catalog-' + refreshMode + '.png');
          if (refreshMode === 'failed') {
            const outcome = await refreshed; if (outcome.error) throw outcome.error;
            assert.equal(outcome.response.status(), 503);
            await root().getByText(new RegExp(worktree.repositoryName + '：浏览器回归：目录读取暂不可用。')).waitFor();
            assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), branches.remoteName + ' · 管理分支', '刷新失败也不能退回旧分支名称');
            await page.unroute(matchesCatalog, intercept);
            await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click();
          } else {
            release();
            const outcome = await refreshed; if (outcome.error) throw outcome.error;
            assert.equal(outcome.response.status(), 200);
          }
          await retainedFile().waitFor();
          assert.equal(await row(worktree).locator('.source-control-status-count[data-status-kind="files"]').innerText(), '1', '完整重读后恢复实际数量与变更列表');
        }});
        assert.equal(branches.keepContent(), 'preserve current work\n');
      } finally {
        release();
        await page.unroute(matchesCatalog, intercept);
      }
    });
  });

  await scenario('切换成功后续分支读取延迟，浮层关闭与操作等待及时结束', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches);
      let writing = false, release = () => {};
      const gate = new Promise<void>(resolve => {release = resolve;});
      const pendingRoutes = new Set<Promise<void>>();
      const observe = (request: any) => {if (new URL(request.url()).pathname.endsWith('/code/branch-switch')) writing = true;};
      const hold = (route: any) => {
        const handled = (async () => {
          if (writing) await gate;
          try {await route.continue();} catch (error) {
            // Successful close legitimately aborts this read while the fixture holds its route.
            if (!(error instanceof Error) || !/Route is already handled|Target page, context or browser has been closed/.test(error.message)) throw error;
          }
        })();
        pendingRoutes.add(handled); return handled.finally(() => pendingRoutes.delete(handled));
      };
      page.on('request', observe); await page.route('**/code/branches?**', hold);
      try {
        await switchTo(worktree, branches.alternate, branches.alternate, false, false, {afterWrite:async () => {
          await page.locator('.branch-management-panel:visible').waitFor({state:'hidden', timeout:2000});
          assert.equal(await row(worktree).locator('.source-control-row-action-button').isEnabled(), true, '后续只读清单不保持切换操作的pending状态');
          await capture(page, 'source-control-switch-background-branches.png');
        }});
      } finally {release(); await Promise.all([...pendingRoutes]); page.off('request', observe); await page.unroute('**/code/branches?**', hold);}
    });
  });

  await scenario('未跟踪上游的同步与获取菜单置灰，菜单内说明原因且跟踪后恢复', async () => {
    await fixture.withBranches(async (branches:any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches), before = branches.snapshot();
      assert.equal(worktree.upstream, null, '夹具真实当前分支尚未设置上游');
      const requests:string[] = [], reason = '未设置远端跟踪分支';
      const observe = (request:any) => {const path = new URL(request.url()).pathname; if (/\/code\/(?:fetch|sync|sync-context)$/.test(path)) requests.push(path);};
      page.on('request', observe);
      try {
        const menu = await openOperations(worktree), disabledColors = new Map<string,string>();
        const panel = page.locator('.source-control-worktree-menu-panel:visible');
        const note = panel.getByRole('note'); await note.waitFor(); assert.equal(await note.innerText(), reason);
        assert.equal(await menu.getAttribute('aria-describedby'), await note.getAttribute('id'), '菜单与就地原因保留可访问关联');
        const panelStyle = await panel.evaluate((element:HTMLElement) => {const style = getComputedStyle(element);return {background:style.backgroundColor,border:style.borderTopWidth};});
        assert.equal(panelStyle.background, 'rgb(255, 255, 255)', '禁用项与原因位于同一白色面板内');
        assert.equal(panelStyle.border, '1px', '面板有清晰而轻的边界');
        for (const name of ['同步', '获取远程']) {
          const item = menu.getByRole('menuitem', {name, exact:true});
          assert.equal(await item.getAttribute('aria-disabled'), 'true', name + '在未跟踪时明确禁用');
          assert.ok((await item.getAttribute('class')).includes('ant-dropdown-menu-item-disabled'), name + '使用真实禁用样式');
          disabledColors.set(name, await item.evaluate((element:HTMLElement) => getComputedStyle(element).color));
          await item.hover();
          assert.equal(await page.getByRole('tooltip', {name:/未设置远端跟踪分支/}).count(), 0, '禁用原因不弹出遮挡菜单的大块提示');
          const bounds = await item.boundingBox(); assert.ok(bounds);
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        }
        await page.evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);});
        assert.deepEqual(requests, [], '禁用菜单项点击不会读取同步上下文或发出获取/同步请求');
        assert.deepEqual(branches.snapshot(), before, '禁用操作不改变文件、索引、引用或配置');
        await capture(page, 'source-control-remote-actions-untracked-disabled.png');
        await row(worktree).locator('.source-control-row-menu-button').press('Escape'); await menu.waitFor({state:'hidden'});
        await switchTo(worktree, branches.remote + '/' + branches.remoteName, branches.remoteName, true);
        await row(worktree).locator('.source-control-worktree-status[data-remote-state="clean"],.source-control-worktree-status[data-remote-state="changed"]').waitFor();
        const enabled = await openOperations(worktree);
        for (const name of ['同步', '获取远程']) {
          const item = enabled.getByRole('menuitem', {name, exact:true});
          assert.notEqual(await item.getAttribute('aria-disabled'), 'true', name + '在真实检出并建立上游后恢复可用');
          assert.equal((await item.getAttribute('class')).includes('ant-dropdown-menu-item-disabled'), false);
          assert.notEqual(await item.evaluate((element:HTMLElement) => getComputedStyle(element).color), disabledColors.get(name), '可用项与禁用项颜色可区分');
          await item.click({trial:true});
        }
        assert.deepEqual(requests, [], '只查看恢复后的菜单不执行远程操作');
        await capture(page, 'source-control-remote-actions-tracked-enabled.png');
        await enabled.getByRole('menuitem', {name:'同步', exact:true}).getByText('同步', {exact:true}).hover();
        await page.getByRole('tooltip', {name:'先拉取并变基，再推送到当前远端跟踪分支', exact:true}).waitFor();
        await row(worktree).locator('.source-control-row-menu-button').click(); await enabled.waitFor({state:'hidden'});
        await page.evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);});
        assert.deepEqual(requests, [], '同步提示不遮挡同一行三个点，鼠标关闭菜单不会执行远程操作');
        await noOverflow();
      } finally {page.off('request', observe);}
    });
  });

  await scenario('单库获取远程发现新分支，关闭浮层不取消写入且保留当前成果', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches);
      await switchTo(worktree, branches.remote + '/' + branches.remoteName, branches.remoteName, true);
      await row(worktree).locator('.source-control-worktree-status[data-remote-state="clean"],.source-control-worktree-status[data-remote-state="changed"]').waitFor();
      const before = branches.snapshot();
      const {manager} = await manage(worktree, branches.remote + '/' + branches.remoteName);
      const added = branches.publishRemoteBranch('dev');
      assert.equal(await manager.getByRole('button', {name:'管理 ' + branches.remote + '/' + added.name, exact:true}).count(), 0);
      const reads: string[] = [];
      const observe = (request: any) => { const url = new URL(request.url()); if (url.pathname === new URL(api + '/code/source-control').pathname) reads.push(url.searchParams.get('repositoryId') || ''); };
      page.on('request', observe);
      let release = () => {}; const gate = new Promise<void>(resolve => {release = resolve;});
      const hold = async (route: any) => { await gate; await route.continue(); };
      await page.route('**/code/fetch', hold);
      try {
        const sent = page.waitForRequest((request: any) => new URL(request.url()).pathname.endsWith('/code/fetch'));
        const returned = page.waitForResponse((response: any) => new URL(response.url()).pathname.endsWith('/code/fetch'));
        await fetchOne(worktree);
        const request = await sent;
        assert.deepEqual(request.postDataJSON().repositories.map((item: any) => item.repositoryId), [worktree.repositoryId]);
        assert.ok(request.postDataJSON().repositories[0].expectedGitId && request.postDataJSON().repositories[0].expectedCheckoutId);
        await row(worktree).locator('.source-control-row-menu-button.ant-btn-loading').waitFor();
        await root().getByRole('button', {name:'源代码管理操作菜单', exact:true}).locator('.anticon-loading').waitFor();
        await manager.waitFor({state:'hidden'});
        release(); const response = await returned; assert.equal(response.status(), 200);
        const result = await response.json(); assert.equal(result.repositories[0].status, 'succeeded', JSON.stringify(result));
        await root().locator('[data-fetch-repository="' + worktree.repositoryId + '"][data-fetch-status="succeeded"]').waitFor();
        assert.deepEqual(reads, [worktree.repositoryId], '单库获取只进行一次目标目录观察');
        const reopened = await manage(worktree, branches.remote + '/' + added.name);
        await reopened.manager.getByRole('button', {name:'管理 ' + branches.remote + '/' + added.name, exact:true}).waitFor();
        const after = branches.snapshot();
        assert.deepEqual(after.positions, before.positions, '获取只更新远程跟踪记录，HEAD、索引及当前文件不变');
        const localRefs = (snapshots: string[]) => snapshots.map(refs => refs.split('\n').filter(line => line.startsWith('refs/heads/')));
        assert.deepEqual(localRefs(after.refs), localRefs(before.refs), '新远程dev可发现，但不自动创建或切换本地dev');
        assert.deepEqual(after.config, before.config, '获取不改远程或本地分支配置');
        assert.equal(branches.keepContent(), 'preserve current work\n');
        await capture(page, 'source-control-fetch-single.png');
        await row(worktree).getByRole('button', {name:'管理分支 · ' + worktree.repositoryName + ' · ' + worktree.name, exact:true}).click();
        await reopened.manager.waitFor({state:'hidden'});
        await root().getByRole('separator', {name:'调整源代码管理与阅读区宽度', exact:true}).press('Home');
        await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-sidebar')?.getBoundingClientRect().width || Infinity) <= 261);
        const narrow = await manage(worktree, branches.remote + '/' + added.name);
        const geometry = await narrow.manager.locator('footer').evaluate((footer: HTMLElement) => {
          const bounds = footer.getBoundingClientRect();
          const buttons = [...footer.querySelectorAll('button')].map(button => button.getBoundingClientRect());
          return {contained:buttons.every(button => button.left >= bounds.left && button.right <= bounds.right), distinct:buttons.every((button, index) => buttons.slice(index + 1).every(other => button.right <= other.left || other.right <= button.left || button.bottom <= other.top || other.bottom <= button.top))};
        });
        assert.deepEqual(geometry, {contained:true, distinct:true}, '窄栏分支底部只读刷新可达');
        assert.equal(await narrow.manager.getByRole('button', {name:/获取远程/}).count(), 0, '分支浮窗不重复放置获取远程');
        const menu = await openOperations(worktree);
        await menu.getByRole('menuitem', {name:'获取远程', exact:true}).click({trial:true});
        await noOverflow(); await capture(page, 'source-control-fetch-single-260px.png');
      } finally {release(); page.off('request', observe); await page.unroute('**/code/fetch', hold);}
    });
  });

  await scenario('两库获取后局部读取交错，旧全量迟到不回滚且无关阅读不重读', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches);
      const actual = await (await page.request.get(api + '/code/source-control')).json();
      // This case owns response substitutes for concurrency, including the
      // tracked availability of its two observed click targets; Git is unchanged.
      const observed = {...actual, repositories:actual.repositories.map((repository:any) => ({...repository, worktrees:repository.worktrees.map((tree:any) => tree.branch && tree.status !== 'unavailable' ? {...tree, upstream:tree.upstream || 'browser-observed/' + tree.branch, ahead:tree.ahead ?? 0, behind:tree.behind ?? 0} : tree)}))};
      const peer = observed.repositories.find((item: any) => item.id !== worktree.repositoryId && item.source?.checkoutId);
      assert.ok(peer, '并发回归需要第二个真实可观察代码库');
      const peerTree = {...peer.worktrees.find((item: any) => item.isRegistered), repositoryId:peer.id, repositoryName:peer.name};
      const reads: string[] = [], contentReads: string[] = [];
      const gates = new Map<string, {gate:Promise<void>; release():void}>();
      for (const id of ['', worktree.repositoryId, peer.id]) {
        let release = () => {}; const gate = new Promise<void>(resolve => {release = resolve;}); gates.set(id, {gate, release});
      }
      const catalogPath = new URL(api + '/code/source-control').pathname;
      const matchesCatalog = (url: URL) => url.pathname === catalogPath;
      const interceptCatalog = async (route: any) => {
        const id = new URL(route.request().url()).searchParams.get('repositoryId') || ''; reads.push(id);
        await gates.get(id)!.gate;
        const repository = observed.repositories.find((item: any) => item.id === id);
        const branch = id === worktree.repositoryId ? 'concurrent-a-new' : 'concurrent-b-new';
        const value = id ? {...observed, readAt:new Date().toISOString(), repositories:[{...repository, branch, worktrees:repository.worktrees.map((item: any) => ({...item, branch}))}]} : observed;
        await route.fulfill({json:value});
      };
      const interceptFetch = async (route: any) => {
        const input = route.request().postDataJSON();
        await route.fulfill({json:{readAt:new Date().toISOString(), repositories:input.repositories.map((item: any) => ({repositoryId:item.repositoryId, gitId:item.expectedGitId, status:'succeeded', message:'隔离获取成功', remotes:[]}))}});
      };
      const observeContents = (request: any) => {
        const url = new URL(request.url());
        if (/\/code\/(?:history|commit|diff|source-file|branches|authors)$/.test(url.pathname)) contentReads.push(url.searchParams.get('repositoryId') || '');
      };
      const initialCatalog = async (route:any) => {await route.fulfill({json:observed});};
      await page.route(matchesCatalog, initialCatalog);
      const initialReturned = page.waitForResponse((response:any) => new URL(response.url()).pathname === catalogPath);
      await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click(); await initialReturned;
      await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
      await page.unroute(matchesCatalog, initialCatalog);
      await page.route(matchesCatalog, interceptCatalog); await page.route('**/code/fetch', interceptFetch);
      page.on('request', observeContents);
      try {
        const fullReturned = page.waitForResponse((response: any) => {const url = new URL(response.url()); return url.pathname === catalogPath && !url.searchParams.has('repositoryId');});
        const fullStarted = page.waitForRequest((request: any) => {const url = new URL(request.url()); return url.pathname === catalogPath && !url.searchParams.has('repositoryId');});
        await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click(); await fullStarted;
        const aStarted = page.waitForRequest((request: any) => new URL(request.url()).searchParams.get('repositoryId') === worktree.repositoryId && new URL(request.url()).pathname === catalogPath);
        const aReturned = page.waitForResponse((response: any) => new URL(response.url()).searchParams.get('repositoryId') === worktree.repositoryId && new URL(response.url()).pathname === catalogPath);
        await fetchOne(worktree); await aStarted;
        // Let A's own invalidation publish before measuring B's effect on retained A reading.
        await page.evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);});
        const aReads = contentReads.filter(id => id === worktree.repositoryId).length;
        const bStarted = page.waitForRequest((request: any) => new URL(request.url()).searchParams.get('repositoryId') === peer.id && new URL(request.url()).pathname === catalogPath);
        const bReturned = page.waitForResponse((response: any) => new URL(response.url()).searchParams.get('repositoryId') === peer.id && new URL(response.url()).pathname === catalogPath);
        await fetchOne(peerTree); await bStarted;
        gates.get(peer.id)!.release(); await bReturned;
        await page.waitForFunction(({id}: {id:string}) => [...document.querySelectorAll('[data-source-worktree]')].some(element => element.getAttribute('data-source-worktree') === id && element.querySelector('.source-control-row-action-button')?.getAttribute('title') === 'concurrent-b-new · 管理分支'), {id:peerTree.worktreeId});
        assert.equal(contentReads.filter(id => id === worktree.repositoryId).length, aReads, 'B更新不触发A的分支、历史、作者、提交或文件读取');
        gates.get(worktree.repositoryId)!.release(); await aReturned;
        gates.get('')!.release(); await fullReturned;
        await page.evaluate(async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);});
        assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), 'concurrent-a-new · 管理分支');
        assert.equal(await row(peerTree).locator('.source-control-row-action-button').getAttribute('title'), 'concurrent-b-new · 管理分支');
        assert.equal(await row(worktree).locator('.source-control-repository-copy').getAttribute('aria-pressed'), 'true');
        assert.deepEqual(reads, ['', worktree.repositoryId, peer.id]);
        await capture(page, 'source-control-scoped-concurrent.png');
      } finally {
        for (const value of gates.values()) value.release(); page.off('request', observeContents);
        await page.unroute(matchesCatalog, interceptCatalog); await page.unroute('**/code/fetch', interceptFetch);
      }
    });
  });

  await scenario('全部获取远程绑定已观察范围，逐库反馈且只重新读取一次全目录', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches), before = branches.snapshot();
      const observed = await (await page.request.get(api + '/code/source-control')).json();
      const reads: string[] = [], writes: any[] = [];
      const observe = (request: any) => { const url = new URL(request.url()); if (url.pathname === new URL(api + '/code/source-control').pathname) reads.push(url.searchParams.get('repositoryId') || ''); };
      const intercept = async (route: any) => {
        const input = route.request().postDataJSON(); writes.push(input);
        await route.fulfill({json:{readAt:new Date().toISOString(), repositories:input.repositories.map((item: any, index: number) => ({repositoryId:item.repositoryId, gitId:item.expectedGitId, status:index === 0 ? 'succeeded' : 'failed', message:index === 0 ? '隔离获取成功' : '隔离远程认证失败', remotes:[{name:'origin', status:index === 0 ? 'succeeded' : 'failed', message:index === 0 ? '已获取' : '认证失败'}]}))}});
      };
      await page.route('**/code/fetch', intercept); page.on('request', observe);
      try {
        await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click();
        await root().locator('.source-control-title .anticon-spin').waitFor({state:'hidden'});
        assert.equal(writes.length, 0, '只读刷新不执行获取远程'); reads.length = 0;
        const refreshed = page.waitForResponse((response: any) => new URL(response.url()).pathname === new URL(api + '/code/source-control').pathname);
        await fetchAll(); await refreshed;
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].repositories, observed.repositories.map((item: any) => ({repositoryId:item.id, expectedGitId:item.gitId, expectedCheckoutId:item.source?.checkoutId || null})));
        assert.deepEqual(reads, [''], '一批全部获取只作一次全目录观察');
        await root().locator('[data-fetch-status="succeeded"]').waitFor(); await root().locator('[data-fetch-status="failed"]').first().waitFor();
        assert.equal(await root().locator('[data-fetch-repository]').count(), observed.repositories.length);
        assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), branches.branch + ' · 管理分支');
        assert.deepEqual(branches.snapshot(), before, '隔离响应替身不触发真实Git写入');
        await capture(page, 'source-control-fetch-batch-partial.png');
        await root().getByRole('separator', {name:'调整源代码管理与阅读区宽度', exact:true}).press('Home');
        await page.waitForFunction(() => (document.querySelector('.code-source-control-page:not([hidden]) .source-control-sidebar')?.getBoundingClientRect().width || Infinity) <= 261);
        const header = await root().locator('.source-control-title').evaluate((element: HTMLElement) => {
          const bounds = element.getBoundingClientRect(), actions = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
          return {contained:actions.every(button => button.left >= bounds.left && button.right <= bounds.right), distinct:actions.every((button, index) => actions.slice(index + 1).every(other => button.right <= other.left || other.right <= button.left))};
        });
        assert.deepEqual(header, {contained:true, distinct:true}, '260px目录标题内操作菜单与只读刷新均可达且不重叠');
        await noOverflow(); await capture(page, 'source-control-fetch-batch-260px.png');
      } finally {page.off('request', observe); await page.unroute('**/code/fetch', intercept);}
    });
  });

  await scenario('菜单与箭头同步共用等待，逐阶段结果和来源漂移不误写', async () => {
    await fixture.withBranches(async (branches:any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches), before = branches.snapshot();
      assert.deepEqual(await page.locator('.shell-navigation [data-nav]').evaluateAll((items:HTMLElement[]) => items.map(item => item.dataset.nav)), ['source-control', 'explorer'], '代码导航交换显示顺序');
      const input = {repositoryId:worktree.repositoryId, worktreeId:worktree.worktreeId};
      const contextResponse = await page.request.get(api + '/code/sync-context?' + new URLSearchParams(input)); assert.equal(contextResponse.status(), 200);
      const actual = await contextResponse.json(), target = branches.remote + '/' + branches.remoteName;
      const observed = await (await page.request.get(api + '/code/source-control')).json();
      const catalogPath = new URL(api + '/code/source-control').pathname, reads:string[] = [], writes:any[] = [];
      const matchesCatalog = (url:URL) => url.pathname === catalogPath;
      const catalogRoute = async (route:any) => {
        const id = new URL(route.request().url()).searchParams.get('repositoryId') || ''; reads.push(id);
        await route.fulfill({json:{...observed, repositories:observed.repositories.filter((repository:any) => !id || repository.id === id).map((repository:any) => repository.id !== worktree.repositoryId ? repository : {...repository, worktrees:repository.worktrees.map((tree:any) => tree.worktreeId !== worktree.worktreeId ? tree : {...tree, upstream:target, ahead:1, behind:2})})}});
      };
      let changed = false, holdContext = false, release = () => {}, releaseContext = () => {};
      const gate = new Promise<void>(resolve => {release = resolve;}), contextGate = new Promise<void>(resolve => {releaseContext = resolve;});
      const contextRoute = async (route:any) => {if (holdContext) await contextGate; await route.fulfill({json:{...actual, available:true, reason:null, target, branch:changed ? 'changed-before-sync' : worktree.branch, head:worktree.head, revision:'browser-sync-observation', ahead:1, behind:2, hasChanges:true}});};
      const syncRoute = async (route:any) => {
        writes.push(route.request().postDataJSON()); await gate;
        await route.fulfill({json:{source:actual.source, readAt:new Date().toISOString(), branch:worktree.branch, head:worktree.head, upstream:target, status:'failed', message:'本地整合已完成，远程认证失败。', fetch:{status:'succeeded',message:'已获取固定上游'}, rebase:{status:'succeeded',message:'已整合到本次上游'}, push:{status:'failed',message:'远程认证失败'}}});
      };
      await page.route(matchesCatalog, catalogRoute); await page.route('**/code/sync-context?**', contextRoute); await page.route('**/code/sync', syncRoute);
      try {
        await root().getByRole('button', {name:'刷新源代码管理', exact:true}).click();
        const shortcut = row(worktree).locator('.source-control-sync-button'); await shortcut.waitFor(); reads.length = 0;
        assert.ok((await shortcut.getAttribute('title')).includes('先拉取并变基，再推送到 ' + target));
        await row(worktree).locator('.source-control-status-button').click(); await page.locator('.source-control-status-details:visible').waitFor();
        assert.equal(writes.length, 0, '文件状态详情不会执行同步'); await row(worktree).locator('.source-control-status-button').press('Escape');
        const menu = await openOperations(worktree); await menu.getByRole('menuitem', {name:'同步', exact:true}).click({trial:true});
        await row(worktree).locator('.source-control-row-menu-button').press('Escape'); await menu.waitFor({state:'hidden'});
        const syncSent = page.waitForRequest((request:any) => new URL(request.url()).pathname.endsWith('/code/sync'));
        await shortcut.focus(); await shortcut.press('Enter'); await syncSent;
        await shortcut.locator('.anticon-loading').waitFor();
        assert.equal(await shortcut.isDisabled(), true, '等待期间箭头入口防重复');
        assert.equal(await row(worktree).locator('.source-control-row-menu-button').isDisabled(), true, '菜单等待和快捷入口共享状态');
        assert.deepEqual(writes, [{...input, expectedRevision:'browser-sync-observation'}]);
        await capture(page, 'source-control-sync-pending.png');
        const refreshed = page.waitForResponse((response:any) => new URL(response.url()).pathname === catalogPath);
        release(); await refreshed;
        const result = root().locator('[data-sync-worktree="' + worktree.worktreeId + '"]'); await result.waitFor();
        await result.locator('[data-sync-phase="fetch"][data-sync-phase-status="succeeded"]').waitFor();
        await result.locator('[data-sync-phase="rebase"][data-sync-phase-status="succeeded"]').waitFor();
        await result.locator('[data-sync-phase="push"][data-sync-phase-status="failed"]').waitFor();
        await shortcut.locator('.anticon-loading').waitFor({state:'hidden'});
        assert.deepEqual(reads, [worktree.repositoryId], '完成后只重新观察本库');
        assert.equal(writes.length, 1, '部分成功不自动重发');
        await capture(page, 'source-control-sync-partial-result.png');
        changed = true;
        // The next click reads a different branch; it must refresh facts without a second write.
        const menuAgain = await openOperations(worktree); await menuAgain.getByRole('menuitem', {name:'同步', exact:true}).click();
        await root().locator('[data-sync-worktree="' + worktree.worktreeId + '"]').getByText('来源、分支或提交已变化，请核对更新后的状态再同步。', {exact:true}).waitFor();
        assert.equal(writes.length, 1, '观察来源漂移拒绝同步POST');
        changed = false; holdContext = true;
        const contextSent = page.waitForRequest((request:any) => new URL(request.url()).pathname.endsWith('/code/sync-context'));
        const contextReturned = page.waitForResponse((response:any) => new URL(response.url()).pathname.endsWith('/code/sync-context'));
        const delayed = await openOperations(worktree); await delayed.getByRole('menuitem', {name:'同步', exact:true}).click(); await contextSent;
        await page.locator('.shell-navigation [data-nav="explorer"]').click(); await page.locator('.code-explorer-stage:visible').waitFor();
        releaseContext(); await contextReturned;
        await page.waitForFunction((id:string) => [...document.querySelectorAll('.code-source-control-page [data-source-worktree]')].find(element => element.getAttribute('data-source-worktree') === id)?.querySelector('.source-control-row-menu-button:not(.ant-btn-loading)'), worktree.worktreeId);
        await page.locator('.shell-navigation [data-nav="source-control"]').click(); await row(worktree).locator('.source-control-row-menu-button:not(.ant-btn-loading)').waitFor();
        assert.equal(writes.length, 1, '读取同步上下文期间离开页，迟到观察不发起新写入');
        assert.deepEqual(branches.snapshot(), before, '界面替身没有触发真实Git写入');
        await noOverflow();
      } finally {release(); releaseContext(); await page.unroute(matchesCatalog, catalogRoute); await page.unroute('**/code/sync-context?**', contextRoute); await page.unroute('**/code/sync', syncRoute);}
    });
  });

  await scenario('远程检出写入中切换工作空间再返回，旧页面完成结果刷新当前页面', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width:1440, height:1000});
      const {worktree} = await open(branches);
      const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1);
      const response = await page.request.get(new URL('/api/v1/workspaces', workspaceUrl).href);
      assert.equal(response.status(), 200);
      const registry = await response.json();
      const current = registry.workspaces.find((entry: any) => entry.workspace?.id === workspaceId);
      const other = registry.workspaces.find((entry: any) => entry.status === 'ready' && entry.workspace?.id && entry.workspace.id !== workspaceId);
      assert.ok(current?.workspace && other?.workspace, '跨工作空间回归使用宿主真实登记的两个有效对象');
      const switchWorkspace = async (entry: any) => {
        await page.getByRole('button', {name:'切换工作空间', exact:true}).click();
        await page.locator('.workspace-switcher-popup:visible').getByRole('menuitem', {name:entry.workspace.name, exact:true}).click();
        await page.waitForURL(new URL('/workspaces/' + entry.workspace.id + '/overview', workspaceUrl).href);
      };
      await page.evaluate(() => { (window as unknown as {__branchContinuationDocument:string}).__branchContinuationDocument = 'same-document'; });
      await switchTo(worktree, branches.remote + '/' + branches.remoteName, branches.remoteName, true, false, {whileWriting:async () => {
        await switchWorkspace(other);
        await switchWorkspace(current);
        await page.getByRole('navigation', {name:'主导航', exact:true}).getByRole('link', {name:'代码', exact:true}).click();
        await page.getByRole('navigation', {name:'代码导航', exact:true}).getByRole('link', {name:'源代码管理', exact:true}).click();
        await row(worktree).locator('.source-control-row-action-button').waitFor();
        assert.equal(await row(worktree).locator('.source-control-row-action-button').getAttribute('title'), branches.branch + ' · 管理分支', '旧请求放行前，新页面实际读到原分支');
        assert.equal(await page.evaluate(() => (window as unknown as {__branchContinuationDocument?:string}).__branchContinuationDocument), 'same-document', '经应用内切换保留原写入请求，没有整页重载');
      }});
      assert.equal(branches.localTracking().head, branches.second);
      assert.equal(branches.keepContent(), 'preserve current work\n');
      await capture(page, 'source-control-checkout-workspace-return.png');
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
