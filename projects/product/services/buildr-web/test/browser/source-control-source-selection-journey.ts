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
    await page.keyboard.press('Escape'); await page.mouse.move(400, 4);
    const group=scm().locator('[data-source-repository="'+repository.id+'"]');
    const fold=group.locator('> .source-control-repository .source-control-repository-fold');
    if(await fold.getAttribute('aria-expanded')==='false')await fold.click();
    await(worktree.isMain?group.getByRole('button',{name:'查看主工作树 · '+codeRepositoryLabel(repository),exact:true}):row(repository.id,worktree.worktreeId)).click();
    await selected(repository.id,worktree.worktreeId);
  };
  const navigate=async(name:'source-control'|'explorer')=>{
    await showPrimaryNavigation(page, 'code');await page.locator('.primary-secondary-navigation:visible [data-nav="'+name+'"]').click();
    await(name==='source-control'?scm():explorer()).waitFor();await page.keyboard.press('Escape');await page.mouse.move(400,4);
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
    const select=explorer().locator('.code-root-selectors .ant-select').nth(1);await select.getByRole('combobox').focus();await select.getByRole('combobox').press('ArrowDown');
    const id=await select.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has:page.locator('[id="'+id+'"]')}).locator('[data-code-worktree-id="'+member.id+'"]').click();
    await select.getByRole('combobox').press('Escape');await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).click();
    return member;
  };

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

}
