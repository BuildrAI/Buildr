import { showPrimaryNavigation } from './primary-navigation-controls.ts';
import assert from 'node:assert/strict';
import { assertEditorText, editorScroll } from './code-editor-assertions.ts';
import { codeRepositoryLabel } from '../../src/features/code/code-source-labels.ts';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** Source identities come from the isolated host's real Git/registry observations. */
export async function runSourceControlSourceSelectionJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors=new Set(),scenario=(name:string,action:()=>Promise<void>)=>t.test(name,action)}:any) {
  const api=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/');
  const scm=()=>page.locator('.code-source-control-page:visible');
  const explorer=()=>page.locator('.code-explorer-stage:visible');
  const diff=()=>scm().getByRole('region',{name:'差异内容',exact:true});
  const longText=(version:number)=>Array.from({length:150},(_,index)=>`export const sourceSelectionLine${index+1} = ${version};`).join('\n')+'\n';
  const catalog=async()=>{const response=await page.request.get(api+'/code/source-control');assert.equal(response.status(),200);return response.json();};
  const identify=(value:any,location:string)=>{
    const repository=value.repositories.find((item:any)=>item.worktrees.some((tree:any)=>tree.location===location));assert.ok(repository);
    const worktree=repository.worktrees.find((item:any)=>item.location===location);return{repository,worktree};
  };
  const row=(repositoryId:string,checkoutId:string)=>scm().locator('[data-source-repository="'+repositoryId+'"] [data-source-worktree="'+checkoutId+'"] .source-control-repository-copy');
  const selected=async(repositoryId:string,checkoutId:string)=>{
    await scm().locator('.source-control-workbench[data-current-repository="'+repositoryId+'"][data-current-checkout="'+checkoutId+'"]').waitFor();
  };
  const choose=async(repository:any,worktree:any)=>{
    const group=scm().locator('[data-source-repository="'+repository.id+'"]');
    const fold=group.locator('> .source-control-repository .source-control-repository-fold');
    if(await fold.getAttribute('aria-expanded')==='false')await fold.click();
    await(worktree.isMain?group.getByRole('button',{name:'查看主工作树 · '+codeRepositoryLabel(repository),exact:true}):row(repository.id,worktree.worktreeId)).click();
    await selected(repository.id,worktree.worktreeId);
  };
  const navigate=async(name:'source-control'|'explorer')=>{
    await showPrimaryNavigation(page, 'code');await page.locator('.primary-secondary-navigation:visible [data-nav="'+name+'"]').click();
    await(name==='source-control'?scm():explorer()).waitFor();
  };
  // 密度布局收窄时任务入口收进行内“…”菜单，按用户路径取菜单项，不要求行内图标一定展开。
  const openTask=async(repository:any,worktree:any)=>{
    const tree=row(repository.id,worktree.worktreeId).locator('xpath=ancestor::*[@data-source-worktree][1]');
    const link=tree.getByRole('button',{name:'打开任务 浏览器任务',exact:true});
    if(await link.isVisible()){await link.click();return;}
    const label=codeRepositoryLabel(repository)+' · '+(worktree.isMain?'主工作树':worktree.name);
    const trigger=tree.getByRole('button',{name:'操作菜单 · '+label,exact:true});
    if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
    const menu=page.getByRole('menu',{name:'操作菜单 · '+label,exact:true});await menu.waitFor();
    await menu.getByRole('menuitem',{name:'打开关联任务',exact:true}).click();
  };
  const open=async(branches:any)=>{
    await page.goto(workspaceUrl+'/code/source-control');await scm().locator('.source-control-repository-copy').first().waitFor();
    const source=identify(await catalog(),branches.location);await choose(source.repository,source.worktree);return source;
  };
  const changedFile=(checkoutId:string,path:string)=>scm().locator('[data-change-worktree="'+checkoutId+'"] [data-change-area="working"] .task-changed-row').filter({has:page.locator('.task-changed-path[data-file-path="'+path+'"]')});
  const settledDiff=async(text:string)=>{
    await page.waitForFunction((expected:string)=>{
      const root=document.querySelector('.code-source-control-page:not([hidden]) [aria-label="差异内容"]');
      const content=root?.querySelector('.file-diff-current .cm-content'),view=(content as any)?.cmTile?.root?.view;
      return view?view.state.doc.toString().includes(expected):root?.textContent?.includes(expected);
    },text);
    await scm().locator('.source-control-diff > .source-control-read-status').waitFor({state:'hidden'});
  };
  const scrollDiff=async(top:number)=>diff().evaluate(async(element:HTMLElement,value:number)=>{
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const host=element.querySelector<HTMLElement>('.file-diff-host > .cm-mergeView,.file-diff-current .cm-scroller')||element;
    host.scrollTop=Math.min(value,host.scrollHeight-host.clientHeight);return host.scrollTop;
  },top);
  const expectScroll=async(top:number,stage='reading')=>{await page.waitForFunction((expected:number)=>{
    const root=document.querySelector('.code-source-control-page:not([hidden]) [aria-label="差异内容"]');
    const host=root?.querySelector('.file-diff-host > .cm-mergeView,.file-diff-current .cm-scroller')||root;
    return Boolean(host&&Math.abs(host.scrollTop-expected)<=2);
  },top).catch(async(error:any)=>{
    const actual=await diff().evaluate((element:HTMLElement)=>[element,...element.querySelectorAll<HTMLElement>('.cm-mergeView,.cm-scroller')].map(host=>({className:host.className,top:host.scrollTop,height:host.clientHeight,total:host.scrollHeight,visible:host.getClientRects().length>0})));
    process.stderr.write('[source-selection-scroll-failure] '+JSON.stringify({stage,expected:top,actual})+'\n');await capture(page,'source-selection-scroll-'+stage+'.png');throw error;
  });};
  const explorerSource=async(repositoryId:string,location:string)=>{
    await explorer().locator('.repository-root-name[data-repository-id="'+repositoryId+'"][data-location="'+location+'"]').waitFor().catch(async(error:any)=>{
      const actual=await explorer().evaluate((element:HTMLElement)=>({roots:[...element.querySelectorAll<HTMLElement>('.repository-root-name')].map(root=>({repositoryId:root.dataset.repositoryId,location:root.dataset.location,label:root.dataset.locationLabel,text:root.textContent})),filters:[...element.querySelectorAll<HTMLElement>('.code-root-selectors .ant-select')].map(filter=>filter.textContent),alerts:[...element.querySelectorAll<HTMLElement>('.ant-alert')].map(alert=>alert.textContent)}));
      process.stderr.write('[source-selection-explorer-failure] '+JSON.stringify({expected:{repositoryId,location},actual,catalog:await catalog(),bundles:await page.locator('script[src]').evaluateAll((nodes:any[])=>nodes.map(node=>node.src))})+'\n');await capture(page,'source-selection-explorer-failure.png');throw error;
    });
  };
  const selectExplorerGroup=async(checkoutId:string)=>{
    const response=await page.request.get(api+'/code/repositories');assert.equal(response.status(),200);const value=await response.json();
    const member=value.worktrees.find((item:any)=>item.id===checkoutId);assert.ok(member);const group=value.worktreeGroups.find((item:any)=>item.id===member.groupId);assert.ok(group);
    const select=explorer().locator('.code-root-selectors .ant-select').nth(1);await select.locator('.ant-select-selector').click();
    const id=await select.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has:page.locator('[id="'+id+'"]')}).locator('[data-code-worktree-id="'+member.id+'"]').click();
    await select.getByRole('combobox').press('Escape');await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).click();
    return member;
  };

  await scenario('来源对齐：独立登记目录首次两入口身份一致，角色和导航点说明工作空间范围',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      branches.liveRefresh.removeUntrackedKeep();
      await fixture.withRegisteredSource(branches.location,async(source:any)=>{
        await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
        await explorerSource(source.repositoryId,source.location);
        const value=await catalog(),repository=value.repositories.find((item:any)=>item.id===source.repositoryId),registered=repository.worktrees.find((item:any)=>item.isRegistered),main=repository.worktrees.find((item:any)=>item.isMain);
        assert.notEqual(registered.worktreeId,main.worktreeId,'登记目录必须确实不是Git主工作树');assert.equal(registered.location,source.location);assert.equal(main.location,source.mainLocation);assert.equal(repository.source.checkoutId,registered.worktreeId);assert.equal(registered.fileCount,0);
        assert.equal(await explorer().locator('.repository-root-name[data-repository-id="'+source.repositoryId+'"]').getAttribute('data-location-label'),registered.name);
        await navigate('source-control');await selected(repository.id,registered.worktreeId);
        assert.ok((await scm().locator('.code-location-summary').innerText()).includes(registered.branch));
        await showPrimaryNavigation(page, 'code');const nav=page.locator('.primary-secondary-navigation:visible [data-nav="source-control"]');
        assert.equal(await nav.getAttribute('data-has-changes'),'true','当前登记目录干净，其他来源的未提交改动仍保持全域圆点');
        const explanation='当前工作空间有未提交变更，包含其他代码库或工作树';
        assert.ok((await nav.getAttribute('title')).includes(explanation));assert.equal(await nav.getAttribute('aria-description'),explanation);assert.equal(await nav.getAttribute('aria-label'),'源代码管理');await page.locator('.primary-navigation-rail button[data-nav="code"]').press('Escape');
        await row(repository.id,registered.worktreeId).hover();
        const card=page.getByRole('article',{name:'工作树来源信息',exact:true}).filter({has:page.getByText(registered.location,{exact:true})});await card.waitFor();
        assert.equal(await card.locator('dt').last().innerText(),'目录角色');assert.equal(await card.locator('dd').last().innerText(),'工作空间登记目录');
        await page.mouse.move(5,5);await card.waitFor({state:'hidden'});
        await choose(repository,main);
        // Picking a source closes its hover card; move out before a fresh hover.
        await page.mouse.move(5,5);
        await scm().getByRole('button',{name:'查看主工作树 · '+codeRepositoryLabel(repository),exact:true}).hover();
        const mainCard=page.getByRole('article',{name:'工作树来源信息',exact:true}).filter({has:page.getByText(main.location,{exact:true})});await mainCard.waitFor().catch(async(error:any)=>{process.stderr.write('[source-selection-main-card-failure] '+JSON.stringify({cards:await page.locator('.source-control-location-card').allTextContents(),button:await scm().getByRole('button',{name:'查看主工作树 · '+codeRepositoryLabel(repository),exact:true}).evaluate((element:any)=>element.outerHTML),main,bundles:await page.locator('script[src]').evaluateAll((nodes:any[])=>nodes.map(node=>node.src))})+'\n');await capture(page,'source-selection-main-card-failure.png');throw error;});assert.equal(await mainCard.locator('dd').last().innerText(),'Git 主工作树');
        await page.mouse.move(5,5);await mainCard.waitFor({state:'hidden'});
        await navigate('explorer');await explorerSource(repository.id,main.location);
        await navigate('source-control');await selected(repository.id,main.worktreeId);
        await showPrimaryNavigation(page, 'code');assert.equal(await nav.getAttribute('data-has-changes'),'true','切来源和打开页面不会将未提交改动当作已读清除');await page.locator('.primary-navigation-rail button[data-nav="code"]').press('Escape');
        await capture(page,'source-selection-linked-registered.png');
      });
    });
  });

  await scenario('来源对齐：双向切换保留差异滚动、按来源提交草稿和资源编辑输入',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      branches.liveRefresh.write(longText(41));await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches);
      const main=repository.worktrees.find((item:any)=>item.isMain);await selectSourceControlView(scm(), 'changes');await changedFile(worktree.worktreeId,branches.liveRefresh.path).click();await settledDiff('sourceSelectionLine1 = 41');
      const draft=scm().getByRole('textbox',{name:'提交说明内容',exact:true}),message='feat: 保留A来源草稿\n\n尚未提交';await draft.fill(message);
      const top=await scrollDiff(480);assert.ok(top>200);
      await navigate('explorer');await explorerSource(repository.id,worktree.location);
      const search=explorer().getByRole('textbox',{name:'搜索文件',exact:true});await search.fill('history.ts');
      await explorer().locator('.repository-search-result[data-file-path="'+branches.liveRefresh.path+'"]').click();await assertEditorText(page,longText(41));
      let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});const hold=async(route:any)=>{await gate;await route.continue();};await page.route('**/code/save-file',hold);
      const sent=page.waitForRequest((request:any)=>new URL(request.url()).pathname.endsWith('/code/save-file')).then((request:any)=>({request}),(error:any)=>({error}));
      const returned=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/save-file')).then((response:any)=>({response}),(error:any)=>({error}));
      // Releasing the save rewrites the file, so a commit-context read already in flight for this
      // source may legitimately be invalidated. Only that stale read is excused, and the window stays
      // open until every context read for this worktree has ended.
      let accepted=false,contextInFlight=0;const unexpectedContextReads:unknown[]=[],contextChecks=new Set<Promise<void>>();
      const countsContext=(request:any)=>{const url=new URL(request.url());return url.pathname.endsWith('/code/commit-context')&&url.searchParams.get('worktreeId')===worktree.worktreeId;};
      const onStart=(request:any)=>{if(countsContext(request))contextInFlight++;};
      const onEnd=(request:any)=>{if(countsContext(request))contextInFlight--;};
      const observeContext=(response:any)=>{
        if(!accepted||response.status()!==409||!countsContext(response.request()))return;
        const check=(async()=>{
          const body=await response.json().catch(()=>null);
          if(body?.error?.code==='code_source_changed')expectedBrowserErrors.add('['+response.url()+']: Failed to load resource: the server responded with a status of 409 (Conflict)');
          else unexpectedContextReads.push({url:response.url(),body});
        })();
        contextChecks.add(check);void check.finally(()=>contextChecks.delete(check));
      };
      page.on('request',onStart);page.on('requestfinished',onEnd);page.on('requestfailed',onEnd);page.on('response',observeContext);
      try{
        await explorer().locator('.cm-content:visible').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.insertText('// retained source A input\n');
        const edited=longText(41)+'// retained source A input\n';await assertEditorText(page,edited);const sentResult=await sent;if(sentResult.error)throw sentResult.error;const request=sentResult.request;
        assert.equal(request.postDataJSON().selector.checkoutId,worktree.worktreeId);assert.equal(request.postDataJSON().selector.repositoryId,repository.id);
        const editorTop=await editorScroll(page,420);assert.ok(editorTop>200);
        await navigate('source-control');await selected(repository.id,worktree.worktreeId);await settledDiff('sourceSelectionLine1 = 41');assert.equal(await draft.inputValue(),message);await expectScroll(top,'same-source');
        await choose(repository,main);assert.equal(await draft.inputValue(),'','A的说明不会作为主树草稿出现');await draft.fill('chore: 主树自己的草稿');
        const searchFor=(checkoutId:string)=>page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname===new URL(api+'/code/search').pathname&&url.searchParams.get('repositoryId')===repository.id&&url.searchParams.get('checkoutId')===checkoutId&&url.searchParams.get('query')==='history.ts'&&response.status()===200;}).then((response:any)=>({response}),(error:any)=>({error}));
        const confirmSearch=async(outcome:any,target:any)=>{if(outcome.error)throw outcome.error;const value=await outcome.response.json();assert.equal(value.source.repositoryId,repository.id);assert.equal(value.source.checkoutId,target.worktreeId);assert.equal(value.source.location,target.location);assert.equal(await search.inputValue(),'history.ts','切换来源保留搜索输入，搜索视图不会显示目录根节点');};
        const mainSearch=searchFor(main.worktreeId);
        await navigate('explorer');await confirmSearch(await mainSearch,main);assert.equal(await explorer().locator('.code-root-selectors .ant-select').nth(1).locator('.ant-select-selection-item').innerText(),main.name);await assertEditorText(page,edited);assert.ok(Math.abs(await editorScroll(page)-editorTop)<=2);
        await explorer().getByText('当前文件不在筛选范围内。',{exact:false}).waitFor();
        const originalSearch=searchFor(worktree.worktreeId);await selectExplorerGroup(worktree.worktreeId);await confirmSearch(await originalSearch,worktree);
        await navigate('source-control');await selected(repository.id,worktree.worktreeId);await settledDiff('sourceSelectionLine1 = 41');assert.equal(await draft.inputValue(),message);await expectScroll(top,'source-return');
        await capture(page,'source-selection-draft-editor-retained.png');
      }finally{
        accepted=true;release();
        const result=await returned;if(result.response)assert.equal(result.response.status(),200);
        for(let attempt=0;attempt<200&&contextInFlight>0;attempt++)await new Promise(resolve=>setTimeout(resolve,25));
        await page.unrouteAll({behavior:'wait'});
        page.off('request',onStart);page.off('requestfinished',onEnd);page.off('requestfailed',onEnd);page.off('response',observeContext);
        await Promise.all([...contextChecks]);
        assert.equal(contextInFlight,0,'释放保存后仍有未结束的提交上下文读取，竞态窗口无法判定');
        assert.deepEqual(unexpectedContextReads,[],'只有保存释放时已在途的提交上下文读取可以被外部写入作废');
      }
    });
  });

  await scenario('来源对齐：跨来源返回恢复固定历史、搜索、展开和差异滚动',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const hash=branches.liveRefresh.commit('source selection fixed history',longText(61));branches.liveRefresh.write(longText(62));
      await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches),main=repository.worktrees.find((item:any)=>item.isMain);
      await selectSourceControlView(scm(), 'history');const query=scm().getByRole('textbox',{name:'搜索提交历史',exact:true});await query.fill('source selection fixed');
      const commit=scm().locator('.source-control-graph > li[data-source-commit="'+hash+'"]');await commit.waitFor();await commit.locator('.source-control-commit-toggle').click();
      await commit.locator('.source-control-commit-children .task-changed-row').filter({has:page.locator('.task-changed-path[data-file-path="'+branches.liveRefresh.path+'"]')}).click();await settledDiff('sourceSelectionLine1 = 61');
      await scm().locator('.task-diff-actions').getByText('上下对比',{exact:true}).click();const top=await scrollDiff(510);assert.ok(top>200);
      await navigate('explorer');await explorerSource(repository.id,worktree.location);await navigate('source-control');await selected(repository.id,worktree.worktreeId);
      assert.equal(await query.inputValue(),'source selection fixed');await settledDiff('sourceSelectionLine1 = 61');await expectScroll(top);
      await choose(repository,main);await navigate('explorer');await explorerSource(repository.id,main.location);await selectExplorerGroup(worktree.worktreeId);await navigate('source-control');await selected(repository.id,worktree.worktreeId);
      assert.equal(await query.inputValue(),'source selection fixed');await commit.locator('.source-control-commit-children').waitFor();assert.equal(await commit.locator('.source-control-commit-toggle').getAttribute('aria-expanded'),'true');await settledDiff('sourceSelectionLine1 = 61');await expectScroll(top);
      assert.ok((await scm().locator('.code-location-summary').innerText()).includes(hash.slice(0,7)),'固定历史仍指向原提交');
      await capture(page,'source-selection-fixed-history-restored.png');
    });
  });

  await scenario('来源对齐：任务显式入口覆盖共享来源一次，随后选择不被入口或刷新重放',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const values=await fixture.prepareWorktrees(),alpha=values.find((item:any)=>item.name==='alpha');assert.ok(alpha);
      branches.liveRefresh.write(longText(81));await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches);
      const taskSource=identify(await catalog(),alpha.location);await openTask(taskSource.repository,taskSource.worktree);
      const task=page.locator('#task-detail-main:visible');await task.locator('[data-task-source-control="browser-task"]').click();await selected(taskSource.repository.id,taskSource.worktree.worktreeId);
      await choose(repository,worktree);await selectSourceControlView(scm(), 'changes');await changedFile(worktree.worktreeId,branches.liveRefresh.path).click();await settledDiff('sourceSelectionLine1 = 81');
      branches.liveRefresh.write(longText(82));await settledDiff('sourceSelectionLine1 = 82');await selected(repository.id,worktree.worktreeId);
      await navigate('explorer');await explorerSource(repository.id,worktree.location);await navigate('source-control');await selected(repository.id,worktree.worktreeId);await settledDiff('sourceSelectionLine1 = 82');
      const peer=values.find((item:any)=>item.name==='peer'),peerSource=identify(await catalog(),peer.location);
      assert.equal(peerSource.worktree.name,taskSource.worktree.name,'两库使用真实同名目录，选择不能依赖名称');
      await choose(peerSource.repository,peerSource.worktree);await navigate('explorer');await explorerSource(peerSource.repository.id,peerSource.worktree.location);
      assert.equal(await explorer().locator('.repository-root-name').count(),1,'跨库显式来源不会借同名目录扩成其他代码库');
      await navigate('source-control');await selected(peerSource.repository.id,peerSource.worktree.worktreeId);
      await capture(page,'source-selection-task-entry-once.png');
    });
  });

  for(const targetFirst of [true,false])await scenario('来源对齐：冷任务入口延迟期间的新手选优先，三种真实身份不互相冒充 · '+(targetFirst?'目标代码库先返回':'无关代码库先返回'),async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const values=await fixture.prepareWorktrees(),alpha=values.find((item:any)=>item.name==='alpha');assert.ok(alpha);
      await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches),main=repository.worktrees.find((item:any)=>item.isMain);
      const value=await catalog(),taskSource=identify(value,alpha.location),peer=values.find((item:any)=>item.name==='peer');assert.ok(peer);
      const peerSource=identify(value,peer.location);assert.notEqual(peerSource.repository.id,taskSource.repository.id);
      assert.equal(new Set([worktree.worktreeId,main.worktreeId,taskSource.worktree.worktreeId]).size,3,'旧来源、显式任务和较新手选必须三者不同');
      await navigate('explorer');await explorerSource(repository.id,worktree.location);await navigate('source-control');
      await openTask(taskSource.repository,taskSource.worktree);
      const task=page.locator('#task-detail-main:visible');await task.waitFor();
      const matches=(url:URL)=>url.pathname===new URL(api+'/code/source-control').pathname&&url.searchParams.get('taskId')==='browser-task';
      const firstId=targetFirst?taskSource.repository.id:peerSource.repository.id,secondId=targetFirst?peerSource.repository.id:taskSource.repository.id;
      let release=()=>{},releaseFollowing=()=>{};
      const gate=new Promise<void>(resolve=>{release=resolve;}),firstCompleted=new Promise<void>(resolve=>{releaseFollowing=resolve;});
      const requests=new Set<any>(),responseOrder:string[]=[];
      // Delay transport only: both bodies still come from production HTTP. The
      // second repository waits for the first response to finish, not a timer.
      const hold=async(route:any)=>{
        requests.add(route.request());await gate;
        if(new URL(route.request().url()).searchParams.get('repositoryId')!==firstId)await firstCompleted;
        await route.continue();
      };
      await page.route(matches,hold);
      const started=Promise.all([firstId,secondId].map(id=>page.waitForRequest((request:any)=>{const url=new URL(request.url());return matches(url)&&url.searchParams.get('repositoryId')===id;}))).then((requests:any)=>({requests}),(error:any)=>({error}));
      const returned=(repositoryId:string)=>page.waitForResponse((response:any)=>requests.has(response.request())&&new URL(response.url()).searchParams.get('repositoryId')===repositoryId&&response.status()===200).then(async(response:any)=>{
        const error=await response.finished();if(error)return {error};
        responseOrder.push(repositoryId);if(repositoryId===firstId)releaseFollowing();return {response};
      },(error:any)=>({error}));
      const targetReturned=returned(taskSource.repository.id),peerReturned=returned(peerSource.repository.id);
      try{
        await task.locator('[data-task-source-control="browser-task"]').click();const pending=await started;if(pending.error)throw pending.error;
        await navigate('explorer');await selectExplorerGroup(main.worktreeId);await explorerSource(repository.id,main.location);
        // Browser Back returns the same explicit-entry nonce. Its metadata is still
        // pending, so the newer hand selection must win when that response arrives.
        await page.goBack();await page.waitForURL(workspaceUrl+'/code/source-control');await scm().waitFor();
        release();const [outcome,peerOutcome]=await Promise.all([targetReturned,peerReturned]);if(outcome.error)throw outcome.error;if(peerOutcome.error)throw peerOutcome.error;
        assert.deepEqual(responseOrder,[firstId,secondId],'两种返回顺序均由真实响应完成事件确认');
        const observed=await outcome.response.json(),peerObserved=await peerOutcome.response.json();
        assert.deepEqual(observed.repositories.map((item:any)=>item.id),[taskSource.repository.id]);
        assert.deepEqual(peerObserved.repositories.map((item:any)=>item.id),[peerSource.repository.id]);
        assert.deepEqual(peerObserved.selectedWorktrees,[],'无关代码库的空预选是正常结果，不能作为任务来源断言的输入');
        assert.ok(observed.selectedWorktrees.some((item:any)=>item.repositoryId===taskSource.repository.id&&item.worktreeId===taskSource.worktree.worktreeId),'迟到的真实任务响应仍指向A，不能借替身把其改成C：'+JSON.stringify({expected:taskSource,selected:observed.selectedWorktrees}));
        await selected(repository.id,main.worktreeId);
        const updated=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname===new URL(api+'/code/source-control').pathname&&url.searchParams.get('repositoryId')===repository.id;});
        branches.liveRefresh.write(longText(91));await updated;await selected(repository.id,main.worktreeId);
        await navigate('explorer');await explorerSource(repository.id,main.location);await navigate('source-control');await selected(repository.id,main.worktreeId);
        await capture(page,'source-selection-cold-task-intent-order-'+(targetFirst?'target-first':'peer-first')+'.png');
      }finally{release();releaseFollowing();await page.unrouteAll({behavior:'wait'});}
    });
  });

  await scenario('来源对齐：隐藏资源管理器的迟到任务入口不覆盖较新的源代码管理手选',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const values=await fixture.prepareWorktrees(),alpha=values.find((item:any)=>item.name==='alpha');assert.ok(alpha);
      await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches),main=repository.worktrees.find((item:any)=>item.isMain);
      const taskSource=identify(await catalog(),alpha.location);
      assert.equal(new Set([worktree.worktreeId,main.worktreeId,taskSource.worktree.worktreeId]).size,3);
      await openTask(taskSource.repository,taskSource.worktree);
      const task=page.locator('#task-detail-main:visible');await task.locator('#task-source-files').waitFor();
      const matches=(url:URL)=>url.pathname===new URL(api+'/code/repositories').pathname&&url.searchParams.get('taskId')==='browser-task';
      let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});const requests=new Set<any>();
      const hold=async(route:any)=>{requests.add(route.request());await gate;await route.continue();};await page.route(matches,hold);
      const started=page.waitForRequest((request:any)=>matches(new URL(request.url()))).then((request:any)=>({request}),(error:any)=>({error}));
      const returned=page.waitForResponse((response:any)=>requests.has(response.request())&&response.status()===200).then((response:any)=>({response}),(error:any)=>({error}));
      try{
        await task.locator('#task-source-files').click();const pending=await started;if(pending.error)throw pending.error;
        // The Explorer keeps its pending entry while hidden. The later explicit
        // SCM choice must fence that response before it can publish an old intent.
        await navigate('source-control');await choose(repository,main);
        release();const outcome=await returned;if(outcome.error)throw outcome.error;const observed=await outcome.response.json();
        assert.ok(observed.worktrees.some((item:any)=>item.repositoryId===taskSource.repository.id&&item.id===taskSource.worktree.worktreeId&&observed.selectedWorktreeGroupIds.includes(item.groupId)),'真实迟到目录响应仍包含任务A，不能用替换响应掩盖顺序');
        await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        await selected(repository.id,main.worktreeId);
        // Return the same entry nonce, so neither a fresh navigation's clearEntry
        // nor another entry request can conceal a missing base catalog.
        await page.goBack();await page.waitForURL(workspaceUrl+'/code/explorer');await explorer().waitFor();await explorerSource(repository.id,main.location);
        await navigate('source-control');await selected(repository.id,main.worktreeId);
        await capture(page,'source-selection-hidden-explorer-entry-order.png');
      }finally{release();await page.unrouteAll({behavior:'wait'});}
    });
  });

  await scenario('来源对齐：跨库跨工作树加入当前文件范围一次发布最终来源',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const values=await fixture.prepareWorktrees(),peer=values.find((item:any)=>item.name==='peer');assert.ok(peer);
      branches.liveRefresh.write(longText(101));await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches),peerSource=identify(await catalog(),peer.location);
      assert.notEqual(repository.id,peerSource.repository.id);assert.notEqual(worktree.worktreeId,peerSource.worktree.worktreeId);
      await navigate('explorer');await explorerSource(repository.id,worktree.location);
      const search=explorer().getByRole('textbox',{name:'搜索文件',exact:true});await search.fill('history.ts');
      await explorer().locator('.repository-search-result[data-file-path="'+branches.liveRefresh.path+'"]').click();await assertEditorText(page,longText(101));
      await navigate('source-control');await choose(peerSource.repository,peerSource.worktree);
      await navigate('explorer');await explorer().getByText('当前文件不在筛选范围内。',{exact:false}).waitFor();
      await page.waitForFunction(()=>document.querySelector('.code-explorer-stage:not([hidden]) .repository-tree-footer')?.textContent?.startsWith('1 个代码库 · 1 个目录'));
      const resolved=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname===new URL(api+'/code/search').pathname&&url.searchParams.get('repositoryId')===repository.id&&url.searchParams.get('checkoutId')===worktree.worktreeId&&url.searchParams.get('query')==='history.ts'&&response.status()===200;}).then((response:any)=>({response}),(error:any)=>({error}));
      await explorer().getByRole('button',{name:'加入范围',exact:true}).click();const outcome=await resolved;if(outcome.error)throw outcome.error;const actual=await outcome.response.json();
      assert.equal(actual.source.checkoutId,worktree.worktreeId);assert.equal(actual.source.location,worktree.location);await assertEditorText(page,longText(101));assert.equal(await search.inputValue(),'history.ts');
      await navigate('source-control');await selected(repository.id,worktree.worktreeId);
      await capture(page,'source-selection-include-active-combined-filter.png');
    });
  });

  await scenario('来源对齐：新历史文件入口发布检出来源一次，普通历史页签激活不重放',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const values=await fixture.prepareWorktrees(),alpha=values.find((item:any)=>item.name==='alpha');assert.ok(alpha);
      branches.liveRefresh.write(longText(121));await page.setViewportSize({width:1440,height:900});const{repository,worktree}=await open(branches),taskSource=identify(await catalog(),alpha.location);
      await openTask(taskSource.repository,taskSource.worktree);
      const task=page.locator('#task-detail-main:visible');await task.locator('[data-task-content=changes]').click();
      await task.locator('.task-rail-commit').filter({hasText:'code fixture'}).click();
      await task.locator('.task-rail-commit-files .task-changed-row').filter({has:page.locator('.task-changed-path[data-file-path="'+fixture.path+'"]')}).click();
      const taskCatalog=await(await page.request.get(api+'/code/repositories?taskId=browser-task')).json();
      const actualMembers=taskCatalog.worktrees.filter((member:any)=>member.repositoryId===repository.id&&taskCatalog.selectedWorktreeGroupIds.includes(member.groupId));
      assert.deepEqual(actualMembers.map((member:any)=>member.id),[taskSource.worktree.worktreeId],'目录提供者实际唯一确认任务的检出身份');
      const historical=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname===new URL(api+'/code/file').pathname&&url.searchParams.get('commitHash')===fixture.commitHash&&url.searchParams.get('filePath')===fixture.path&&response.status()===200;});
      await task.getByRole('button',{name:'查看完整文件',exact:true}).click();const response=await historical,value=await response.json();
      assert.equal(new URL(response.url()).searchParams.get('checkoutId'),taskSource.worktree.worktreeId,'真实入口带已确认的当前检出指针');
      assert.equal(value.source.repositoryId,repository.id);assert.equal(value.source.commitHash,fixture.commitHash);assert.equal(value.source.checkoutId,null,'历史正文声明固定Git提交，不冒充当前工作树正文');await assertEditorText(page,value.content,{readOnly:true});
      const historyTab=explorer().locator('.code-open-files').getByRole('tab',{name:new RegExp('main\\.ts.*'+fixture.commitHash.slice(0,7))});await historyTab.waitFor();
      await navigate('source-control');await selected(taskSource.repository.id,taskSource.worktree.worktreeId);
      await choose(repository,worktree);await navigate('explorer');await explorerSource(repository.id,worktree.location);
      const search=explorer().getByRole('textbox',{name:'搜索文件',exact:true});await search.fill('history.ts');
      await explorer().locator('.repository-search-result[data-file-path="'+branches.liveRefresh.path+'"]').click();await assertEditorText(page,longText(121));
      await historyTab.click();await assertEditorText(page,value.content,{readOnly:true});assert.equal(await search.inputValue(),'history.ts');
      await navigate('source-control');await selected(repository.id,worktree.worktreeId);
      await capture(page,'source-selection-historical-file-entry-once.png');
    });
  });

  await scenario('来源对齐：冷任务目录失败后返回同一入口仍采用当前来源和可用目录事实',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const values=await fixture.prepareWorktrees(),alpha=values.find((item:any)=>item.name==='alpha');assert.ok(alpha);
      await page.setViewportSize({width:1440,height:900});const{repository}=await open(branches),main=repository.worktrees.find((item:any)=>item.isMain),taskSource=identify(await catalog(),alpha.location);
      await openTask(taskSource.repository,taskSource.worktree);
      const task=page.locator('#task-detail-main:visible');await task.locator('#task-source-files').waitFor();
      const matches=(url:URL)=>url.pathname===new URL(api+'/code/repositories').pathname&&url.searchParams.get('taskId')==='browser-task';
      let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});const requests=new Set<any>();
      const hold=async(route:any)=>{
        requests.add(route.request());await gate;
        expectedBrowserErrors.add('['+route.request().url()+']: Failed to load resource: the server responded with a status of 503 (Service Unavailable)');
        await route.fulfill({status:503,json:{error:{code:'fixture_task_catalog_unavailable',message:'隔离任务目录读取失败'}}});
      };await page.route(matches,hold);
      const started=page.waitForRequest((request:any)=>matches(new URL(request.url()))).then((request:any)=>({request}),(error:any)=>({error}));
      const returned=page.waitForResponse((response:any)=>requests.has(response.request())&&response.status()===503).then((response:any)=>({response}),(error:any)=>({error}));
      try{
        await task.locator('#task-source-files').click();const pending=await started;if(pending.error)throw pending.error;
        await navigate('source-control');await choose(repository,main);
        release();const outcome=await returned;if(outcome.error)throw outcome.error;const body=await outcome.response.json();assert.equal(body.error.code,'fixture_task_catalog_unavailable');
        await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        await page.goBack();await page.waitForURL(workspaceUrl+'/code/explorer');await explorer().waitFor();await explorerSource(repository.id,main.location);
        assert.equal(await explorer().getByText('隔离任务目录读取失败',{exact:false}).count(),0,'旧任务失败不能作为当前较新来源的失败');
        await navigate('source-control');await selected(repository.id,main.worktreeId);
        await capture(page,'source-selection-failed-cold-entry-retains-current.png');
      }finally{release();await page.unrouteAll({behavior:'wait'});}
    });
  });
}
