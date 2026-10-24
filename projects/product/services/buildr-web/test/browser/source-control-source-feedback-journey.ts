import assert from 'node:assert/strict';
import {assertEditorText, editorPosition, editorScroll} from './code-editor-assertions.ts';
import { codeRepositoryCode, codeRepositoryLabel } from '../../src/features/code/code-source-labels.ts';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** Successes use actual checkout/catalog data; only the exact status/watch failures are injected. */
export async function runSourceControlSourceFeedbackJourney({t,page,workspaceUrl,capture,fixture,expectedBrowserErrors,scenario=(name:string,action:()=>Promise<void>)=>t.test(name,action)}:any) {
  const api=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/');
  const operation=(name:string)=>new URL(api+'/code/'+name).pathname;
  const explorer=()=>page.locator('.code-explorer-stage:visible');
  const scm=()=>page.locator('.code-source-control-page:visible');
  const notice=(kind:string)=>explorer().locator('[data-code-notice-kind="'+kind+'"]');
  const baseName=(location:string)=>location.replace(/\\/gu,'/').replace(/\/+$/u,'').split('/').at(-1)!;
  const longText=(version:number)=>Array.from({length:150},(_,index)=>`export const feedbackLine${index+1} = ${version};`).join('\n')+'\n';
  const handled=(promise:Promise<any>)=>promise.then(value=>({value}),error=>({error}));
  const result=async(promise:Promise<any>)=>{const outcome=await promise;if(outcome.error)throw outcome.error;return outcome.value;};
  const read=async(name:string)=>{const response=await page.request.get(api+'/code/'+name);assert.equal(response.status(),200);return response.json();};
  const navigate=async(name:'explorer'|'source-control')=>{await page.locator('.shell-navigation [data-nav="'+name+'"]').click();await(name==='explorer'?explorer():scm()).waitFor();};
  const currentSource=async(repositoryId:string,checkoutId:string)=>scm().locator('.source-control-workbench[data-current-repository="'+repositoryId+'"][data-current-checkout="'+checkoutId+'"]').waitFor();
  const choose=async(repository:any,worktree:any)=>{
    const group=scm().locator('[data-source-repository="'+repository.id+'"]'),fold=group.locator('> .source-control-repository .source-control-repository-fold');
    if(await fold.getAttribute('aria-expanded')==='false')await fold.click();
    await(worktree.isMain?group.getByRole('button',{name:'查看主工作树 · '+codeRepositoryLabel(repository),exact:true}):group.locator('[data-source-worktree="'+worktree.worktreeId+'"] .source-control-repository-copy')).click();
    await currentSource(repository.id,worktree.worktreeId);
  };
  const chooseFilter=async(index:number,label:string)=>{
    const select=explorer().locator('.code-root-selectors .ant-select').nth(index);await select.getByRole('combobox').focus();await select.getByRole('combobox').press('ArrowDown');
    const list=await select.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has:page.locator('[id="'+list+'"]')}).getByText(label,{exact:true}).click();
    await select.getByRole('combobox').press('Escape');
  };
  const rootAt=(repositoryId:string,location:string)=>explorer().locator('.repository-root-name[data-repository-id="'+repositoryId+'"][data-location="'+location+'"]');
  const openBranch=async(branches:any,text:string)=>{
    await page.goto(workspaceUrl+'/code/source-control');await scm().locator('.source-control-repository-copy').first().waitFor();
    const catalog=await read('source-control'),repository=catalog.repositories.find((repository:any)=>repository.worktrees.some((tree:any)=>tree.location===branches.location));assert.ok(repository);
    const worktree=repository.worktrees.find((tree:any)=>tree.location===branches.location);await choose(repository,worktree);
    await navigate('explorer');await rootAt(repository.id,worktree.location).waitFor();
    await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).fill('history.ts');
    await explorer().locator('.repository-search-result[data-file-path="'+branches.liveRefresh.path+'"]').click();await assertEditorText(page,text);
    return{repository,worktree};
  };
  const expectErrorConsole=(response:any,status:number,reason:string)=>expectedBrowserErrors.add('['+response.url()+']: Failed to load resource: the server responded with a status of '+status+' ('+reason+')');
  const settle=()=>page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});

  await scenario('来源反馈：登记目录显示真实工作树名字，多库集合不冒称单库且阅读保持',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const text=longText(151);branches.liveRefresh.write(text);
      const linked=await fixture.prepareWorktrees(),alpha=linked.find((tree:any)=>tree.name==='alpha'),peer=linked.find((tree:any)=>tree.name==='peer');assert.ok(alpha&&peer);assert.equal(baseName(alpha.location),baseName(peer.location));
      await fixture.withRegisteredSource(branches.location,async(registered:any)=>{
        await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await rootAt(registered.repositoryId,registered.location).waitFor();
        const catalog=await read('repositories'),members=catalog.worktrees.filter((member:any)=>member.groupId==='main');
        assert.equal(await explorer().getByRole('combobox',{name:'筛选工作树',exact:true}).isDisabled(),true,'多库不显示拼接工作树选项');
        const repository=catalog.repositories.find((repository:any)=>repository.id===registered.repositoryId);await chooseFilter(0,codeRepositoryCode(repository));
        const label=explorer().locator('.code-root-selectors .ant-select').nth(1).locator('.ant-select-selection-item');
        const groupSelect=explorer().locator('.code-root-selectors .ant-select').nth(1);await groupSelect.locator('.ant-select-selector').click();
        const popupId=await groupSelect.getByRole('combobox').getAttribute('aria-controls'),popup=page.locator('.ant-select-dropdown').filter({has:page.locator('[id="'+popupId+'"]')});
        for(const member of catalog.worktrees.filter((member:any)=>member.repositoryId===repository.id&&member.available)){
          const option=popup.locator('[data-code-worktree-id="'+member.id+'"]');await option.waitFor();assert.equal(await option.getAttribute('title'),member.path);
          if(member.isMain)assert.ok((await option.locator('> small').innerText()).startsWith('主工作库'));
        }
        await groupSelect.getByRole('combobox').press('Escape');
        await page.waitForFunction((name:string)=>document.querySelector('.code-explorer-stage .code-root-selectors .ant-select:nth-child(2) .ant-select-selection-item')?.textContent===name,baseName(registered.location));
        assert.equal(await explorer().locator('.code-source-summary').count(),0,'登记的任务目录不冒称主工作库');
        const root=rootAt(repository.id,registered.location);assert.equal(await root.getAttribute('data-location-label'),baseName(registered.location));
        await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).fill('history.ts');await explorer().locator('.repository-search-result[data-file-path="'+branches.liveRefresh.path+'"]').click();await assertEditorText(page,text);
        await explorer().locator('.cm-content:visible').evaluate((content:any)=>content.cmTile.root.view.dispatch({selection:{anchor:7,head:15}}));
        const top=await editorScroll(page,480);assert.ok(top>200);const position=await editorPosition(page);
        const member=members.find((member:any)=>member.repositoryId===repository.id);await navigate('source-control');await currentSource(repository.id,member.id);
        await navigate('explorer');await assertEditorText(page,text);assert.equal(await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).inputValue(),'history.ts');
        assert.equal(await label.innerText(),baseName(registered.location));assert.deepEqual(await editorPosition(page),position);assert.ok(Math.abs(await editorScroll(page)-top)<=2);
        await capture(page,'source-feedback-real-worktree-names.png');
      });
    });
  });

  await scenario('来源反馈：真实局部状态读取等待不产生空黄条，也不清除已观察改动',async()=>{
    await fixture.withBranches(async(branches:any)=>{
      const before=longText(161),after=longText(162);branches.liveRefresh.write(before);await page.setViewportSize({width:1440,height:900});
      const{repository,worktree}=await openBranch(branches,before);
      const divider=explorer().getByRole('separator',{name:'调整资源管理器宽度',exact:true});
      while(Number(await divider.getAttribute('aria-valuenow'))>270)await divider.press('ArrowLeft');
      assert.ok(Number(await divider.getAttribute('aria-valuenow'))>=240&&Number(await divider.getAttribute('aria-valuenow'))<=270);
      const editor=explorer().locator('.file-editing-pane:visible'),fileId=await editor.getAttribute('data-file-id');assert.ok(fileId);
      await explorer().locator('.cm-content:visible').evaluate((content:any)=>content.cmTile.root.view.dispatch({selection:{anchor:7,head:15}}));
      const top=await editorScroll(page,460),position=await editorPosition(page);assert.ok(top>200);
      const matches=(url:URL)=>url.pathname===operation('source-control')&&url.searchParams.get('repositoryId')===repository.id;
      let release=()=>{},releaseDiff=()=>{},releaseRecovery=()=>{},rejectNext=false,recoveryBlocked=false;
      const gate=new Promise<void>(resolve=>{release=resolve;}),recoveryGate=new Promise<void>(resolve=>{releaseRecovery=resolve;});const requests=new Set<any>();
      const hold=async(route:any)=>{
        requests.add(route.request());await gate;
        if(rejectNext){rejectNext=false;recoveryBlocked=true;expectedBrowserErrors.add('['+route.request().url()+']: Failed to load resource: the server responded with a status of 503 (Service Unavailable)');await route.fulfill({status:503,json:{error:{code:'fixture_status_unavailable',message:'隔离局部状态读取暂不可用'}}});return;}
        // A real queued follow-up may already be waiting when the failure is shown.
        // Retain its response until the user retries so automatic recovery cannot
        // remove the button during the narrow-layout screenshot.
        if(recoveryBlocked)await recoveryGate;
        await route.continue();
      };await page.route(matches,hold);
      const started=handled(page.waitForRequest((request:any)=>matches(new URL(request.url()))));
      const returned=handled(page.waitForResponse((response:any)=>requests.has(response.request())&&response.status()===200));
      try{
        branches.liveRefresh.write(after);await result(started);await settle();
        assert.equal(await notice('status').count(),0,'等待真实局部读取没有错误，不能显示空状态警告');
        assert.equal(await explorer().getByText('部分内容不可读取',{exact:true}).count(),0);
        // The shared file editor has its own verified refresh. Holding SCM
        // metadata must not prevent it from reading the actual newer body.
        await assertEditorText(page,after);assert.equal(await editor.getAttribute('data-file-id'),fileId);
        assert.equal(await editor.locator('.file-editing-path').getAttribute('aria-label'),'文件路径：'+branches.liveRefresh.path);assert.equal(await editor.locator('.file-editing-path').getAttribute('title'),worktree.location+'/'+branches.liveRefresh.path);
        assert.equal(await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).inputValue(),'history.ts');assert.deepEqual(await editorPosition(page),position);
        const refreshedTop=await editorScroll(page);assert.ok(Math.abs(refreshedTop-top)<=2,'同一文件外部正文刷新须保持阅读位置：before='+top+', after='+refreshedTop);
        assert.equal(await notice('status').count(),0);assert.equal(await page.locator('.shell-navigation [data-nav="source-control"]').getAttribute('data-has-changes'),'true');
        release();const response=await result(returned),observed=await response.json();
        assert.equal(observed.repositories.length,1);assert.equal(observed.repositories[0].id,repository.id);
        assert.ok(observed.repositories[0].worktrees.find((tree:any)=>tree.worktreeId===worktree.worktreeId).changes.some((file:any)=>file.path===branches.liveRefresh.path));
        await assertEditorText(page,after);assert.equal(await editor.getAttribute('data-file-id'),fileId);assert.deepEqual(await editorPosition(page),position);assert.ok(Math.abs(await editorScroll(page)-top)<=2);
        assert.equal(await notice('status').count(),0);

        const failed=handled(page.waitForResponse((response:any)=>requests.has(response.request())&&response.status()===503));rejectNext=true;branches.liveRefresh.write(longText(163));
        const failure=await result(failed);assert.equal((await failure.json()).error.code,'fixture_status_unavailable');
        const status=notice('status');await status.waitFor();await status.getByRole('button',{name:'查看原因 · 代码状态暂未更新',exact:true}).click();
        const reason=await status.getByRole('list',{name:'代码状态暂未更新的原因',exact:true}).innerText();assert.ok(reason.includes(repository.name));assert.ok(reason.includes('隔离局部状态读取暂不可用'));
        const noticeGeometry=await status.evaluate((section:HTMLElement)=>{const content=section.querySelector('.ant-alert-content')!.getBoundingClientRect(),actions=section.querySelector('.ant-alert-action')!.getBoundingClientRect();return{width:section.getBoundingClientRect().width,contentWidth:content.width,contentBottom:content.bottom,actionsTop:actions.top};});
        assert.ok(noticeGeometry.width<=270&&noticeGeometry.contentWidth>=160&&noticeGeometry.actionsTop>=noticeGeometry.contentBottom,'窄侧栏中原因正文使用完整内容宽度，按钮独占下行：'+JSON.stringify(noticeGeometry));
        await capture(page,'source-feedback-status-reasons-narrow.png');
        const retried:Array<string|null>=[],directories:string[]=[];
        const observe=(request:any)=>{const url=new URL(request.url());if(url.pathname===operation('source-control'))retried.push(url.searchParams.get('repositoryId'));if(url.pathname===operation('directory'))directories.push(request.url());};page.on('request',observe);
        try{
          const previousRequests=new Set(requests);
          const retry=handled(page.waitForResponse((response:any)=>matches(new URL(response.url()))&&!previousRequests.has(response.request())&&response.status()===200));
          await status.waitFor();assert.deepEqual((await status.getByRole('button').allTextContents()).map((text:string)=>text.replace(/\s/gu,'')),['收起原因','重试']);
          // Ant Design inserts a space between a two-character Chinese button label.
          await status.getByRole('button',{name:/^重\s*试$/u}).click();recoveryBlocked=false;releaseRecovery();await result(retry);await status.waitFor({state:'hidden'});
          assert.ok(retried.length>0&&retried.length<=3);assert.deepEqual([...new Set(retried)],[repository.id],'局部状态重试只补查失败代码库，不能变成全工作空间读取');assert.deepEqual(directories,[],'状态重试不能重读目录');
          await assertEditorText(page,longText(163));assert.equal(await editor.getAttribute('data-file-id'),fileId);assert.deepEqual(await editorPosition(page),position);assert.ok(Math.abs(await editorScroll(page)-top)<=2);
        }finally{page.off('request',observe);}

        await navigate('source-control');await currentSource(repository.id,worktree.worktreeId);
        await selectSourceControlView(scm(), 'changes');
        await scm().locator('[data-change-worktree="'+worktree.worktreeId+'"] [data-change-area="working"] .task-changed-row').filter({has:page.locator('.task-changed-path[data-file-path="'+branches.liveRefresh.path+'"]')}).click();
        const comparison=scm().locator('.file-diff-editor:visible');await comparison.waitFor();const comparisonId=await comparison.getAttribute('data-file-id');assert.equal(comparisonId,fileId);
        const matchesDiff=(url:URL)=>url.pathname===operation('diff')&&url.searchParams.get('repositoryId')===repository.id&&url.searchParams.get('worktreeId')===worktree.worktreeId&&url.searchParams.get('filePath')===branches.liveRefresh.path;
        const diffGate=new Promise<void>(resolve=>{releaseDiff=resolve;}),diffRequests=new Set<any>();
        await page.route(matchesDiff,async(route:any)=>{diffRequests.add(route.request());await diffGate;await route.continue();});
        const diffStarted=handled(page.waitForRequest((request:any)=>matchesDiff(new URL(request.url())))),diffReturned=handled(page.waitForResponse((response:any)=>diffRequests.has(response.request())&&response.status()===200));
        branches.liveRefresh.write(longText(164));await result(diffStarted);await settle();
        assert.equal(await scm().locator('.source-control-diff > .source-control-read-status').count(),0,'已有差异数据的后台刷新不再闪正在读取差异');
        assert.equal(await comparison.getAttribute('data-file-id'),comparisonId);assert.ok(await comparison.locator('.file-diff-current .cm-content:visible').evaluate((content:any)=>content.cmTile.root.view.state.doc.length)>1000,'后台核对继续保留真实编辑正文');
        releaseDiff();await result(diffReturned);await page.waitForFunction((expected:string)=>{
          const content=document.querySelector('.code-source-control-page .file-diff-current .cm-content');return (content as any)?.cmTile?.root?.view?.state.doc.toString()===expected;
        },longText(164));await currentSource(repository.id,worktree.worktreeId);
        await capture(page,'source-feedback-pending-local-status.png');
      }finally{release();releaseRecovery();releaseDiff();await page.unrouteAll({behavior:'wait'});}
    });
  });

  await scenario('来源反馈：真实局部目录失败展开显示路径原因，其他文件保持可读并可重试',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await explorer().locator('.repository-root-name').first().waitFor();
    const catalog=await read('repositories'),peer=catalog.repositories.find((repository:any)=>repository.code==='second-code'),member=catalog.worktrees.find((tree:any)=>tree.repositoryId===peer.id&&tree.groupId==='main');assert.ok(member);
    await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).fill('main.ts');await explorer().locator('.repository-search-result[data-file-path="'+fixture.path+'"]').click();await assertEditorText(page,fixture.workingText);
    await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).fill('');
    const peerRoot=rootAt(peer.id,member.path);await peerRoot.click();await explorer().locator('.ant-tree-treenode-loading').waitFor({state:'hidden'});
    let failureMessage='';
    await fixture.withUnavailableRepository(async()=>{
      const failed=handled(page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname===operation('directory')&&url.searchParams.get('repositoryId')===peer.id&&url.searchParams.get('checkoutId')===member.id&&response.status()>=400;}));
      await explorer().getByRole('button',{name:'刷新展开目录',exact:true}).click();const response=await result(failed),body=await response.json();
      assert.equal(response.status(),404);assert.equal(body.error.code,'code_repository_unavailable');failureMessage=body.error.message;assert.ok(failureMessage.trim());expectErrorConsole(response,404,'Not Found');
      const warning=notice('directories');await warning.waitFor();assert.ok((await warning.innerText()).includes('部分目录暂不可读取'));
      const expand=warning.getByRole('button',{name:'查看原因 · 部分目录暂不可读取',exact:true});assert.equal(await expand.getAttribute('aria-expanded'),'false');
      assert.equal(await warning.getByRole('list',{name:'部分目录暂不可读取的原因',exact:true}).count(),0);
      await expand.click();const reasons=warning.getByRole('list',{name:'部分目录暂不可读取的原因',exact:true});await reasons.waitFor();
      const details=await reasons.innerText();assert.ok(details.includes(peer.name));assert.ok(details.includes(member.path),'失败原因应给出真实受影响目录路径');assert.ok(details.includes(failureMessage),'展开内容展示真实接口原因');
      await assertEditorText(page,fixture.workingText);assert.equal(await explorer().getByText('部分内容不可读取',{exact:true}).count(),0);
      await capture(page,'source-feedback-real-directory-failure.png');
    });
    const recovered=handled(page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname===operation('directory')&&url.searchParams.get('repositoryId')===peer.id&&url.searchParams.get('checkoutId')===member.id&&response.status()===200;}));
    await explorer().getByRole('button',{name:'刷新展开目录',exact:true}).click();await result(recovered);await notice('directories').waitFor({state:'hidden'});await assertEditorText(page,fixture.workingText);
    assert.equal(await explorer().getByText(failureMessage,{exact:false}).count(),0);
  });

  await scenario('来源反馈：自动更新重连失败独立说明原因，不冒充目录不可读且恢复后清除',async()=>{
    let release=()=>{},received=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),retryStarted=new Promise<void>(resolve=>{received=resolve;});let count=0;const reconnects=new Set<any>();
    const matches=(url:URL)=>url.pathname===operation('source-control-watch');
    const hold=async(route:any)=>{
      if(++count===1){
        expectedBrowserErrors.add('['+route.request().url()+']: Failed to load resource: the server responded with a status of 503 (Service Unavailable)');
        await route.fulfill({status:503,json:{error:{code:'fixture_watch_unavailable',message:'隔离观察连接暂不可用'}}});return;
      }
      reconnects.add(route.request());if(count===2){received();await gate;}await route.continue();
    };await page.route(matches,hold);
    const returned=handled(page.waitForResponse((response:any)=>reconnects.has(response.request())&&response.status()===200));
    try{
      await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await explorer().locator('.repository-root-name').first().waitFor();
      const warning=notice('updates');await warning.waitFor();assert.ok((await warning.innerText()).includes('自动更新暂时中断'));
      await warning.getByRole('button',{name:'查看原因 · 自动更新暂时中断',exact:true}).click();
      await warning.getByRole('list',{name:'自动更新暂时中断的原因',exact:true}).getByText('自动更新暂时中断，保留上次读取结果；正在重新连接。',{exact:true}).waitFor();
      assert.equal(await notice('directories').count(),0);assert.equal(await explorer().getByText('部分内容不可读取',{exact:true}).count(),0);
      await explorer().getByRole('textbox',{name:'搜索文件',exact:true}).fill('main.ts');await explorer().locator('.repository-search-result[data-file-path="'+fixture.path+'"]').click();await assertEditorText(page,fixture.workingText);
      assert.equal(await page.locator('.shell-navigation [data-nav="source-control"]').getAttribute('data-has-changes'),'true','观察连接失败保留已确认的全域未提交提示');
      await retryStarted;release();await result(returned);await warning.waitFor({state:'hidden'});await assertEditorText(page,fixture.workingText);
      await capture(page,'source-feedback-watch-recovered.png');
    }finally{release();await page.unrouteAll({behavior:'wait'});}
  });
}
