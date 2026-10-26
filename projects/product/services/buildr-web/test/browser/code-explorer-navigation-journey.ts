import assert from 'node:assert/strict';
/** Retains the original real-page assertions; shared preparation remains with the host. */
export async function runExplorerNavigationJourney({capture, clearFilter, codeFixture, codeRepositoryCode, expandRoot, expandedRoots, fileResponse, fileResult, filterGroupIds, filterOptionNames, groupName, navigateCode, noOverflow, page, read, readCatalog, registeredRoots, rootFor, search, selectFilter, selectSearchMode, t, workspaceUrl}: any) {
  await t.test('全部代码库禁用工作树，根按需读取，单库目录逐项单选',async()=>{
    const requests:URL[]=[];const count=(request:any)=>requests.push(new URL(request.url()));page.on('request',count);
    try{
      await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
      const controls=page.getByRole('region',{name:'代码库与工作树筛选',exact:true}),catalog=await readCatalog();
      assert.equal(await controls.getByRole('combobox').count(),2);assert.equal(await controls.getByRole('combobox').nth(1).isDisabled(),true);
      assert.equal(requests.filter((url: URL)=>url.pathname.endsWith('/code/directory')).length,0);await registeredRoots(catalog);
      const secondary=catalog.repositories.find((repo:any)=>repo.id===codeFixture.secondRepositoryId);await selectFilter(0,codeRepositoryCode(secondary));
      assert.equal(await controls.getByRole('combobox').nth(1).isEnabled(),true);
      const ids=await filterGroupIds();assert.deepEqual(new Set(ids),new Set(catalog.worktrees.filter((member:any)=>member.repositoryId===secondary.id&&member.available).map((member:any)=>member.id)));
      await expandRoot(secondary.id);await page.locator('.ant-tree-title').filter({hasText:/^src$/}).click();
      requests.length=0;await page.locator('.repository-tree-file[data-file-path="src/main.ts"]').click();await read.text('secondRepository = true');
      assert.equal(requests.filter((url: URL)=>/\/code\/(?:file|editor-file)$/u.test(url.pathname)).length,1,'普通文本打开只有一个正文请求');
      await page.getByRole('button',{name:'关闭文件 src/main.ts',exact:true}).click();assert.equal(await controls.getByRole('combobox').nth(1).isEnabled(),true);
      for(const width of [1440,900]){await page.setViewportSize({width,height:900});await noOverflow();await capture(page,'code-worktree-options-'+width+'.png');}
    }finally{page.off('request',count);}
  });
  await t.test('普通返回保留手动展开和折叠，刷新保留目录现场，同文件再次定位展开相关根',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
    const expandedState=()=>page.locator('.repository-tree-body .ant-tree-treenode[aria-expanded="true"]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.querySelector('.ant-tree-title')?.textContent).sort());
    const roundTrip=async()=>{await navigateCode('source-control');await page.locator('.code-source-control-page:visible').waitFor();await navigateCode('explorer');await page.locator('.code-explorer-stage:visible').waitFor();};
    assert.equal(await expandedRoots().count(),0);
    await expandRoot(codeFixture.secondRepositoryId);await page.locator('.ant-tree-title').filter({hasText:/^src$/}).click();
    await page.locator('.repository-tree-file[data-file-path="src/main.ts"]').waitFor();
    const repeatedReads:any[]=[],countRepeated=(request:any)=>{const url=new URL(request.url());if(url.pathname.endsWith('/code/directory')&&url.searchParams.get('repositoryId')===codeFixture.secondRepositoryId&&url.searchParams.get('filePath')==='src')repeatedReads.push(url);};page.on('request',countRepeated);
    const srcFolder=page.locator('.ant-tree-title').filter({hasText:/^src$/});await srcFolder.click();await page.locator('.repository-tree-file[data-file-path="src/main.ts"]').waitFor({state:'hidden'});
    const warmExpand=await srcFolder.evaluate(async(element:HTMLElement)=>{const started=performance.now();element.click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const file=document.querySelector<HTMLElement>('.repository-tree-file[data-file-path="src/main.ts"]');return {elapsedMs:performance.now()-started,visible:Boolean(file?.getBoundingClientRect().height),motion:document.querySelectorAll('.repository-tree-body .ant-tree-treenode-motion').length};});
    assert.equal(warmExpand.visible,true,'已读取目录应在下一次绘制直接显示');assert.equal(warmExpand.motion,0,'不应等待收展动画');assert.equal(repeatedReads.length,0,'重新展开有效目录不重复读取');page.off('request',countRepeated);process.stderr.write('[explorer-warm-expand] '+JSON.stringify(warmExpand)+'\n');
    const manual=await expandedState();assert.ok(manual.length>=2);await roundTrip();assert.deepEqual(await expandedState(),manual,'尚未打开文件时也保留手动展开');
    await rootFor(codeFixture.secondRepositoryId).locator('xpath=ancestor::*[contains(@class,"ant-tree-treenode")][1]').locator('> .ant-tree-switcher').click();await page.waitForFunction((id:string)=>document.querySelector('.repository-root-name[data-repository-id="'+id+'"]')?.closest('.ant-tree-treenode')?.getAttribute('aria-expanded')==='false',codeFixture.secondRepositoryId);
    await page.waitForFunction(()=>!document.querySelector('.repository-tree-body .ant-tree-treenode-motion'));
    const folded=await expandedState();await roundTrip();assert.deepEqual(await expandedState(),folded,'用户折叠的根也保持折叠');assert.equal(await expandedRoots().count(),0);
    const path='projects/demo/services/api/src/main.ts';await search('main.ts');await fileResult(path).click();await read.text('explorerAnswer = 2');
    await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('');
    assert.equal(await expandedRoots().count(),1);assert.equal(await expandedRoots().locator('.repository-root-name').getAttribute('data-repository-id'),codeFixture.primaryRepositoryId);
    await page.locator('.repository-tree-file[data-file-path="'+path+'"]').waitFor();
    const opened=await expandedState();await roundTrip();assert.deepEqual(await expandedState(),opened);await page.locator('.repository-tree-file[data-file-path="'+path+'"]').waitFor();await read.text('explorerAnswer = 2');
    await expandRoot(codeFixture.primaryRepositoryId);const before=await page.locator('.repository-tree-body .ant-tree-treenode[aria-expanded="true"]').count();
    const refreshed=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/directory'));await page.getByRole('button',{name:'刷新展开目录',exact:true}).click();await refreshed;
    await page.waitForFunction(()=>!document.querySelector('button[aria-label="刷新展开目录"]')?.classList.contains('ant-btn-loading')&&!document.querySelector('.repository-tree-body .ant-tree-treenode-motion'));
    assert.equal(await page.locator('.repository-tree-body .ant-tree-treenode[aria-expanded="true"]').count(),before);
    await rootFor(codeFixture.primaryRepositoryId).click();await page.waitForFunction(()=>![...document.querySelectorAll('.repository-tree-body .ant-tree-treenode[aria-expanded="true"]')].some(node=>node.querySelector('.repository-root-name')));assert.equal(await expandedRoots().count(),0);
    await search('main.ts');await fileResult(path).click();await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('');
    assert.equal(await expandedRoots().count(),1);await page.locator('.repository-tree-file[data-file-path="'+path+'"]').waitFor();
  });
  await t.test('代码库根单行展示，悬停路径可移入选字复制且键盘聚焦可操作',async()=>{
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
    const catalog=await readCatalog(),repository=catalog.repositories.find((repo:any)=>repo.id===codeFixture.primaryRepositoryId),root=rootFor(repository.id);
    const info=page.getByRole('article',{name:'代码库完整路径',exact:true}).filter({has:page.getByText(repository.location,{exact:true})});
    for(const width of [1440,900]){
      await page.setViewportSize({width,height:900});await root.hover();await info.waitFor();await info.hover();
      const path=info.locator('.repository-root-location');assert.equal(await path.innerText(),repository.location);assert.equal(await root.locator('small').count(),0);
      assert.ok(await root.evaluate((el:HTMLElement)=>el.getBoundingClientRect().height)<=24);assert.equal(await path.evaluate((el:HTMLElement)=>getComputedStyle(el).userSelect),'text');
      await path.click({clickCount:3});assert.equal((await page.evaluate(()=>window.getSelection()?.toString()))?.trim(),repository.location);
      await info.getByRole('button',{name:'复制代码库完整路径',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),repository.location);assert.equal(await expandedRoots().count(),0);
      await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();await info.waitFor({state:'hidden'});await noOverflow();
    }
    await root.focus();await info.waitFor();await info.getByRole('button',{name:'复制代码库完整路径',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),repository.location);
    await navigateCode('source-control');await info.waitFor({state:'hidden'});
  });
  await t.test('无独立工作树的任务预选工作空间目录，选择其他实际工作树只读取目录',async()=>{
    let reads=0;const requests:URL[]=[];const count=(request:any)=>{const url=new URL(request.url());if(url.pathname.endsWith('/code/file'))reads++;if(url.pathname.endsWith('/code/directory'))requests.push(url);};page.on('request',count);
    try{
      await page.goto(workspaceUrl+'/tasks/browser-task');await page.locator('#task-source-files').waitFor();await page.locator('#task-source-files').click();
      const controls=page.getByRole('region',{name:'代码库与工作树筛选',exact:true});await controls.getByText('任务没有独立目录，可在上方选择其他目录。',{exact:true}).waitFor();
      const catalog=await readCatalog('browser-task'),taskGroup=catalog.worktreeGroups.find((group:any)=>group.id===codeFixture.worktreeGroupId),taskMember=catalog.worktrees.find((member:any)=>member.groupId===taskGroup.id&&member.repositoryId===codeFixture.primaryRepositoryId);
      assert.equal(reads,0);assert.equal(await page.getByRole('tab',{name:/main\.ts/}).count(),0);assert.equal(await controls.locator('.ant-select').nth(1).locator('.ant-select-selection-item').innerText(),groupName(catalog,'main',catalog.selectedRepositoryIds));
      await clearFilter(1);const before=requests.length;
      await selectFilter(1,taskGroup.id);await page.waitForFunction((location:string)=>Array.from(document.querySelectorAll('.repository-root-name')).some(el=>el.getAttribute('data-location')?.includes(location)),taskMember.path);await expandRoot(taskMember.repositoryId);
      const refreshResponse=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/directory')&&url.searchParams.get('checkoutId')===taskMember.id&&url.searchParams.get('filePath')==='';});await page.getByRole('button',{name:'刷新展开目录',exact:true}).click();await refreshResponse;
      assert.ok(requests.slice(before).some((url: URL)=>url.searchParams.get('checkoutId')===taskMember.id));assert.equal(reads,0);assert.equal(await page.getByRole('tab',{name:/main\.ts/}).count(),0);await noOverflow();
    }finally{page.off('request',count);}
  });
  await t.test('代码库限定实际工作树，同库切换保留已打开文件来源',async()=>{
    await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();const catalog=await readCatalog();
    const secondary=catalog.repositories.find((repo:any)=>repo.id===codeFixture.secondRepositoryId);
    await selectFilter(0,codeRepositoryCode(secondary));
    await page.waitForFunction((id:string)=>document.querySelectorAll('.repository-root-name').length===1&&document.querySelector('.repository-root-name')?.getAttribute('data-repository-id')===id,secondary.id);
    const members=catalog.worktrees.filter((member:any)=>member.repositoryId===secondary.id),native=members.find((member:any)=>member.kind==='worktree'),task=members.find((member:any)=>member.groupId===codeFixture.worktreeGroupId);
    assert.ok(native&&task);assert.equal((await filterOptionNames(0)).length,catalog.repositories.length);
    await selectSearchMode('内容');
    for(const member of [native,task]){
      await selectFilter(1,member.id);await search('WorktreeFilterNeedle');const result=page.locator('.repository-search-group[data-source-id*="'+member.id+'"]');await result.locator('.repository-search-occurrence').waitFor();
      const response=fileResponse(codeFixture.worktreeFiles[secondary.id].path,(url: URL)=>url.searchParams.get('checkoutId')===member.id);await result.locator('.repository-search-occurrence').click();const file=await(await response).json();assert.equal(file.source.checkoutId,member.id);
      await read.text(member===native?codeFixture.nativeWorktree.content:codeFixture.worktreeFiles[secondary.id].content);
    }
    assert.equal(await page.getByRole('tab',{name:/worktree-filter\.ts/}).count(),2);
    await clearFilter(1);await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('');await read.text(codeFixture.worktreeFiles[secondary.id].content);assert.equal(await page.locator('.code-range-outside').count(),1);
    await page.getByRole('button',{name:'加入范围',exact:true}).click();assert.equal(await page.locator('.repository-root-name').count(),1);assert.equal(await page.locator('.repository-root-name').getAttribute('data-location'),task.path);
    await clearFilter(0);assert.equal(await page.getByRole('combobox',{name:'筛选工作树',exact:true}).isDisabled(),true);await noOverflow();
  });
  await t.test('真实初始目录响应迟到不会覆盖后续刷新发现的新工作树',async()=>{
    let release:()=>void=()=>{},captured:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),oldCaptured=new Promise<void>(resolve=>{captured=resolve;});let count=0;
    const delayOld=async(route:any)=>{
      if(++count!==1)return route.continue();
      const response=await route.fetch();captured();await gate;return route.fulfill({response});
    };
    await page.route('**/code/repositories**',delayOld);
    try{
      await page.goto(workspaceUrl+'/code/explorer');await oldCaptured;assert.equal(await page.getByRole('combobox',{name:'筛选工作树',exact:true}).isDisabled(),true);
      const added=codeFixture.createNativeWorktree();const freshResponse=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/repositories'));
      await page.getByRole('button',{name:'刷新展开目录',exact:true}).click();const fresh=await(await freshResponse).json();assert.ok(fresh.worktrees.some((member:any)=>member.id===added.id));
      const lateMember=fresh.worktrees.find((member:any)=>member.id===added.id);
      const oldResponse=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/repositories'));release();await oldResponse;
      const repo=fresh.repositories.find((repo:any)=>repo.id===lateMember.repositoryId);await selectFilter(0,codeRepositoryCode(repo));assert.ok((await filterGroupIds()).includes(lateMember.id));await noOverflow();
    }finally{release();await page.unroute('**/code/repositories**',delayOld);}
  });

}
