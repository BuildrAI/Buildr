import assert from 'node:assert/strict';
export async function runCodeExplorerJourney({t,page,workspaceUrl,capture,expectedBrowserErrors,codeFixture}:any){
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const fileResult=(filePath:string)=>page.locator('.repository-search-result[data-file-path="'+filePath+'"]');
  const matchResult=(filePath:string,line:number)=>page.locator('.repository-search-group[data-file-path="'+filePath+'"] .repository-search-occurrence[data-match-line="'+line+'"]');
  const search=async(query:string)=>{await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill(query);await page.locator('.repository-search-result').first().waitFor();};
  const resultPath=async(filePath:string)=>{const line=fileResult(filePath).locator('.repository-search-file-path');await line.waitFor();assert.equal(await line.innerText(),filePath);assert.equal(await line.getAttribute('title'),filePath);};
  const fileResponse=(filePath:string,accept:(url:URL)=>boolean=()=>true)=>page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/file')&&url.searchParams.get('filePath')===filePath&&accept(url);});
  const assertPart=async(file:any,content:string)=>{
    assert.ok(file.page);assert.ok(file.sizeBytes>5*1024*1024);assert.ok(Buffer.byteLength(file.content)<=512*1024+4);assert.equal(file.truncated,true);assert.ok(!file.content.includes('\ufffd'));
    assert.equal(file.content,Buffer.from(content).subarray(file.page.offset,file.page.endOffset).toString('utf8'));
    await page.waitForFunction((expected:string)=>Array.from(document.querySelectorAll('.repository-source-code code')).map(el=>el.textContent).join('\n')===expected,file.content);
    assert.equal(Number(await page.locator('.repository-source-row').first().getAttribute('data-line')),file.page.startLine);assert.ok(await page.locator('.repository-source-row').count()<12);
    await page.getByRole('region',{name:'大文件分段阅读',exact:true}).waitFor();assert.ok((await page.locator('.repository-file-page-status').innerText()).includes('第 '+(file.page.index+1)+' / '+file.page.total+' 段'));
  };
  const catalogUrl=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/')+'/code/repositories';
  const readCatalog=async(taskId?:string)=>await(await page.request.get(catalogUrl+(taskId?'?taskId='+encodeURIComponent(taskId):''))).json();
  const filterDropdown=async(index:number)=>{
    const listId=await page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox').getAttribute('aria-controls');assert.ok(listId);
    return page.locator('.ant-select-dropdown').filter({has:page.locator('[id=\"'+listId+'\"]')});
  };
  const selectFilter=async(index:number,name:string)=>{
    await page.locator('.code-root-selectors .ant-select').nth(index).locator('.ant-select-selector').click();
    await(await filterDropdown(index)).getByText(name,{exact:true}).click();
    await page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox').press('Escape');await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
  };
  const clearFilter=async(index:number)=>{
    const select=page.locator('.code-root-selectors .ant-select').nth(index);await select.hover();await select.locator('.ant-select-clear').click();await select.getByRole('combobox').press('Escape');
    await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
  };
  const filterOptionNames=async(index:number)=>{
    await page.locator('.code-root-selectors .ant-select').nth(index).locator('.ant-select-selector').click();
    const labels=await(await filterDropdown(index)).locator('.ant-select-item-option-content').allTextContents();await page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox').press('Escape');await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();return labels;
  };
  await t.test('默认主目录、代码库多选和工作树单选始终可见，刷新同行对齐且关闭文件不改变范围',async()=>{
    let reads=0;const count=(request:any)=>{if(new URL(request.url()).pathname.endsWith('/code/file'))reads++;};page.on('request',count);
    try{
      await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-tree-file').first().waitFor();
      const controls=page.getByRole('region',{name:'代码库与工作树筛选',exact:true});await controls.waitFor();
      assert.equal(await controls.getByRole('combobox').count(),2);assert.equal(await controls.getByText('主目录',{exact:true}).count(),1);assert.equal(reads,0);
      assert.equal(await page.locator('.code-location-explanation').count(),0);
      const catalog=await readCatalog();assert.equal(await page.locator('.repository-root-name').count(),catalog.repositories.length);
      for(const repo of catalog.repositories){const root=page.locator('.repository-root-name').filter({has:page.getByText(repo.name,{exact:true})});assert.ok((await root.getAttribute('title')).includes(repo.location));assert.ok((await root.locator('small').innerText()).includes('主目录'));}
      for(const width of [1440,900]){
        await page.setViewportSize({width,height:900});
        const geometry=await page.locator('.global-source-sidebar .repository-browser-context').evaluate((el:HTMLElement)=>{
          const select=el.querySelector('.code-root-selectors > .ant-select')!.getBoundingClientRect(),refresh=el.querySelector(':scope > .ant-btn')!.getBoundingClientRect();
          return {selectHeight:select.height,refreshHeight:refresh.height,centerGap:Math.abs(select.top+select.height/2-refresh.top-refresh.height/2),horizontalGap:refresh.left-select.right};
        });
        assert.equal(geometry.selectHeight,32);assert.equal(geometry.refreshHeight,32);assert.ok(geometry.centerGap<1,JSON.stringify(geometry));assert.ok(geometry.horizontalGap>=0,JSON.stringify(geometry));await noOverflow();
      }
      await page.setViewportSize({width:1440,height:900});await capture(page,'code-worktree-empty-alignment.png');
      await page.locator('.ant-tree-title').filter({hasText:/^src$/}).click();await page.locator('.repository-tree-file[data-file-path="src/main.ts"]').click();await page.locator('.repository-source-code').waitFor();
      const openedReads=reads;assert.ok(openedReads>0);await page.getByRole('button',{name:'关闭文件 src/main.ts',exact:true}).click();
      await page.locator('.repository-reader-content').getByText('从目录选择一个文件',{exact:true}).waitFor();assert.equal(await controls.getByText('主目录',{exact:true}).count(),1);assert.equal(reads,openedReads);
    }finally{page.off('request',count);}
  });
  await t.test('无独立工作树的任务预选主目录，选择其他实际工作树只读取目录',async()=>{
    let reads=0;const requests:URL[]=[];const count=(request:any)=>{const url=new URL(request.url());if(url.pathname.endsWith('/code/file'))reads++;if(url.pathname.endsWith('/code/directory'))requests.push(url);};page.on('request',count);
    try{
      await page.goto(workspaceUrl+'/tasks/browser-task');await page.locator('#task-source-files').waitFor();await page.locator('#task-source-files').click();
      const controls=page.getByRole('region',{name:'代码库与工作树筛选',exact:true});await controls.getByText('任务没有独立工作树，默认查看主目录。',{exact:true}).waitFor();
      const catalog=await readCatalog(),taskGroup=catalog.worktreeGroups.find((group:any)=>group.id===codeFixture.worktreeGroupId),taskMember=catalog.worktrees.find((member:any)=>member.groupId===taskGroup.id&&member.repositoryId===codeFixture.primaryRepositoryId);
      assert.equal(reads,0);assert.equal(await page.getByRole('tab',{name:/main\.ts/}).count(),0);assert.equal(await controls.getByText('主目录',{exact:true}).count(),1);
      await clearFilter(1);const before=requests.length;
      await selectFilter(1,taskGroup.name);await page.waitForFunction((location:string)=>Array.from(document.querySelectorAll('.repository-root-name')).some(el=>el.getAttribute('title')?.includes(location)),taskMember.path);
      const refreshResponse=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/directory')&&url.searchParams.get('checkoutId')===taskMember.id&&url.searchParams.get('filePath')==='';});await page.getByRole('button',{name:'重新读取文件',exact:true}).click();await refreshResponse;
      assert.ok(requests.slice(before).some(url=>url.searchParams.get('checkoutId')===taskMember.id));assert.equal(reads,0);assert.equal(await page.getByRole('tab',{name:/main\.ts/}).count(),0);await noOverflow();
    }finally{page.off('request',count);}
  });
  await t.test('代码库多选和工作树单选双向限制候选，切换同库目录保留实际文件来源',async()=>{
    await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-tree-file').first().waitFor();const catalog=await readCatalog();
    const primary=catalog.repositories.find((repo:any)=>repo.id===codeFixture.primaryRepositoryId),secondary=catalog.repositories.find((repo:any)=>repo.id===codeFixture.secondRepositoryId),taskGroup=catalog.worktreeGroups.find((group:any)=>group.id===codeFixture.worktreeGroupId);
    const nativeMember=catalog.worktrees.find((member:any)=>member.repositoryId===secondary.id&&member.kind==='worktree'),nativeGroup=catalog.worktreeGroups.find((group:any)=>group.id===nativeMember.groupId);
    assert.ok((await page.locator('.code-root-selectors .ant-select').first().getAttribute('class')).includes('ant-select-multiple'));
    assert.ok(!(await page.locator('.code-root-selectors .ant-select').nth(1).getAttribute('class')).includes('ant-select-multiple'));
    await selectFilter(0,primary.name);assert.ok(!(await filterOptionNames(1)).includes(nativeGroup.name));
    await clearFilter(0);await clearFilter(1);assert.equal(await page.locator('.repository-root-name').count(),catalog.repositories.length);assert.equal(await page.locator('.code-root-selectors .ant-select').nth(1).locator('.ant-select-selection-placeholder').innerText(),'主目录');
    for(const root of await page.locator('.repository-root-name small').allTextContents())assert.ok(root.includes('主目录'));
    await selectFilter(1,nativeGroup.name);assert.deepEqual(await filterOptionNames(0),[secondary.name]);await selectFilter(0,secondary.name);assert.equal(await page.locator('.repository-root-name').count(),1);
    await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('WorktreeFilterNeedle');
    const responses:any[]=[];
    for(const group of [nativeGroup,taskGroup]){
      if(group===taskGroup){await selectFilter(1,taskGroup.name);assert.ok((await page.locator('.repository-source-code').innerText()).includes(codeFixture.nativeWorktree.content));}
      assert.ok((await page.locator('.repository-tree-footer').innerText()).startsWith('1 个代码库 · 1 个目录'));
      const result=page.locator('.repository-search-group').filter({hasText:group.name});await result.locator('.repository-search-occurrence').waitFor();assert.equal(await page.locator('.repository-search-group').count(),1);
      const response=fileResponse(codeFixture.worktreeFiles[secondary.id].path);assert.equal(await result.getAttribute('data-repository-id'),secondary.id);await result.locator('.repository-search-occurrence').click();responses.push(await(await response).json());
      assert.ok((await page.locator('.repository-source-code').innerText()).includes(group.id===nativeGroup.id?codeFixture.nativeWorktree.content:codeFixture.worktreeFiles[secondary.id].content));
    }
    assert.notEqual(responses[0].source.checkoutId,responses[1].source.checkoutId);assert.equal(responses[0].source.repositoryId,responses[1].source.repositoryId);
    assert.equal(await page.getByRole('tab',{name:/worktree-filter\.ts/}).count(),2);assert.ok((await page.locator('.repository-tree-footer').innerText()).startsWith('1 个代码库 · 1 个目录'));
    await clearFilter(1);await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('');assert.equal(await page.locator('.repository-root-name').count(),1);assert.equal(await page.locator('.code-range-outside').filter({hasText:'当前文件不在筛选范围内'}).count(),1);assert.ok((await page.locator('.repository-source-code').innerText()).includes(codeFixture.worktreeFiles[secondary.id].content));
    await page.getByRole('button',{name:'加入范围',exact:true}).click();await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('');
    await page.waitForFunction((name:string)=>document.querySelector('.code-root-selectors .ant-select:nth-child(2) .ant-select-selection-item')?.textContent===name,taskGroup.name);
    assert.equal(await page.locator('.repository-root-name').count(),1);assert.ok((await page.locator('.repository-root-name small').innerText()).includes(taskGroup.name));await noOverflow();await capture(page,'code-worktree-combined-filters.png');
  });
  await t.test('真实初始目录响应迟到不会覆盖后续刷新发现的新工作树',async()=>{
    let release:()=>void=()=>{},captured:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),oldCaptured=new Promise<void>(resolve=>{captured=resolve;});let count=0;
    const delayOld=async(route:any)=>{
      if(++count!==1)return route.continue();
      const response=await route.fetch();captured();await gate;return route.fulfill({response});
    };
    await page.route('**/code/repositories**',delayOld);
    try{
      await page.goto(workspaceUrl+'/code/explorer');await oldCaptured;assert.equal(await page.locator('.code-root-selectors').getByText('主目录',{exact:true}).count(),1);
      const added=codeFixture.createNativeWorktree();const freshResponse=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/repositories'));
      await page.getByRole('button',{name:'重新读取文件',exact:true}).click();const fresh=await(await freshResponse).json();assert.ok(fresh.worktrees.some((member:any)=>member.id===added.id));
      const lateMember=fresh.worktrees.find((member:any)=>member.id===added.id),lateGroup=fresh.worktreeGroups.find((group:any)=>group.id===lateMember.groupId);
      const oldResponse=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/repositories'));release();await oldResponse;
      assert.ok((await filterOptionNames(1)).includes(lateGroup.name));await noOverflow();
    }finally{release();await page.unroute('**/code/repositories**',delayOld);}
  });
  await t.test('真实代码页面：目录读取、完整文件、内容搜索、文档链接与图片',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await page.getByRole('navigation',{name:'代码导航'}).waitFor();await page.locator('.repository-tree-file').first().waitFor();
    await search('main.ts');await resultPath('projects/demo/services/api/src/main.ts');await resultPath('src/main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await page.locator('.repository-source-code').waitFor();
    assert.ok((await page.locator('.repository-source-code').innerText()).includes('explorerAnswer = 2'));await noOverflow();
    const width=await page.getByRole('complementary',{name:'资源管理器文件树',exact:true}).evaluate((el:HTMLElement)=>el.getBoundingClientRect().width);assert.ok(width>=240&&width<=420);
    const divider=page.getByRole('separator',{name:'调整资源管理器宽度'});await divider.press('ArrowRight');assert.ok(await divider.getAttribute('aria-valuenow')>width);
    await page.getByRole('button',{name:'展开阅读',exact:true}).click();await page.getByRole('button',{name:'恢复分屏',exact:true}).click();
    await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('explorerAnswer');await matchResult('projects/demo/services/api/src/main.ts',1).click();
    await page.locator('.repository-search-options').getByText('文件名',{exact:true}).click();await search('README.md');await fileResult('projects/demo/services/api/README.md').click();await page.getByRole('heading',{name:'Explorer document'}).waitFor();
    await page.locator('.repository-markdown img').waitFor();assert.ok((await page.locator('.repository-markdown img').getAttribute('src')).startsWith('data:image/png;base64,'));
    await page.getByRole('link',{name:'Source',exact:true}).click();await page.locator('.repository-source-code').waitFor();
    await page.getByRole('button',{name:'请智能体解释',exact:true}).click();assert.ok((await page.getByRole('textbox',{name:'文件协作指令'}).inputValue()).includes('src/main.ts'));await page.getByRole('button',{name:'返回文件',exact:true}).click();
    await capture(page,'code-explorer-1440.png');
    const largePath='projects/demo/services/api/large-text.txt';await search('large-text.txt');await resultPath(largePath);
    const largeResponse=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/file')&&url.searchParams.get('filePath')===largePath;});await fileResult(largePath).click();const large=(await(await largeResponse).json());
    assert.ok(large.sizeBytes>2*1024*1024&&large.sizeBytes<5*1024*1024);assert.equal(large.truncated,false);assert.equal(large.page,null);assert.equal(large.message,'');assert.equal(large.content.length,large.sizeBytes);
    await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('large text end'));
    assert.equal(await page.locator('.repository-source-code code').evaluateAll((elements:HTMLElement[])=>elements.map(el=>el.textContent).join('\n')),large.content);assert.equal(await page.getByRole('alert').filter({hasText:/文件超过完整读取上限|当前内容不完整/}).count(),0);await noOverflow();
  });
  await t.test('代码顶部与分屏保持同高短竖线，文件标签复用共享样式',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await search('main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await page.locator('.repository-source-code').waitFor();
    await search('README.md');await fileResult('projects/demo/services/api/README.md').click();await page.getByRole('heading',{name:'Explorer document'}).waitFor();
    const files=page.locator('.code-open-files.pane-tabstrip[role="tablist"]');await files.waitFor();
    assert.equal(await files.getAttribute('aria-label'),'打开的文件');assert.equal(await files.locator('.pane-tab').count(),2);assert.equal(await files.locator('.pane-tab.on').count(),1);
    const headerGeometry=await page.locator('.code-explorer-stage').evaluate((el:HTMLElement)=>{
      const tabs=el.querySelector('.code-file-tabstrip')!.getBoundingClientRect(),tree=el.querySelector('.code-tree-pane-title')!.getBoundingClientRect(),marker=el.querySelector('.global-source-divider > .split-divider-header-marker')!.getBoundingClientRect();
      return {tabsHeight:tabs.height,treeHeight:tree.height,topGap:Math.abs(tabs.top-tree.top),markerHeight:marker.height,markerTop:marker.top-tree.top};
    });
    assert.equal(headerGeometry.tabsHeight,43);assert.equal(headerGeometry.treeHeight,43);assert.ok(headerGeometry.topGap<1,JSON.stringify(headerGeometry));assert.equal(headerGeometry.markerHeight,19);assert.equal(headerGeometry.markerTop,12);
    await noOverflow();await capture(page,'code-header-alignment.png');
  });
  await t.test('点击文件夹标题展开、折叠，收起菜单后文件树贴齐内容区',async()=>{
    await page.setViewportSize({width:1920,height:900});await page.goto(workspaceUrl+'/code/explorer');
    const folder=page.locator('.ant-tree-title').filter({hasText:/^src$/});await folder.waitFor();
    await folder.click();await page.locator('[data-file-path="src/file1.ts"]').waitFor();
    await folder.click();await page.locator('[data-file-path="src/file1.ts"]').waitFor({state:'hidden'});
    await folder.click();await page.locator('[data-file-path="src/file1.ts"]').waitFor();
    await page.getByRole('button',{name:'折叠菜单',exact:true}).click();
    const geometry=await page.locator('.code-explorer-stage').evaluate((el:HTMLElement)=>{
      const stage=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect(),tree=el.querySelector('.global-source-dock')!.getBoundingClientRect();
      const reader=el.querySelector('.code-file-stage')!.getBoundingClientRect();
      return {leftGap:tree.left-parent.left,rightGap:parent.right-stage.right,width:stage.width,parentWidth:parent.width,dividerGap:reader.left-tree.right};
    });assert.ok(Math.abs(geometry.leftGap)<2,JSON.stringify(geometry));assert.ok(Math.abs(geometry.rightGap)<2,JSON.stringify(geometry));assert.ok(Math.abs(geometry.width-geometry.parentWidth)<2);assert.ok(Math.abs(geometry.dividerGap)<1,JSON.stringify(geometry));
    await noOverflow();await capture(page,'code-tree-collapsed-menu.png');
    await search('README.md');await fileResult('projects/demo/services/api/README.md').click();await page.getByRole('heading',{name:'Explorer document'}).waitFor();
    const markdown=await page.locator('.repository-markdown').evaluate((el:HTMLElement)=>{const box=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect(),style=getComputedStyle(el);return {width:box.width,contentWidth:box.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),centerGap:Math.abs((box.left+box.right)-(parent.left+parent.right))};});
    assert.equal(markdown.width,1200);assert.equal(markdown.contentWidth,1200);assert.ok(markdown.centerGap<2);await capture(page,'code-markdown-read.png');
    await page.locator('.repository-reader-toolbar').getByText('原文',{exact:true}).click();await page.locator('.repository-source-code').waitFor();
    assert.ok((await page.locator('.repository-source-code').innerText()).includes('# Explorer document'));assert.equal(await page.locator('.repository-markdown').count(),0);
    const rawWidth=await page.locator('.repository-source-code').evaluate((el:HTMLElement)=>({width:el.getBoundingClientRect().width,parentWidth:el.parentElement!.clientWidth}));assert.ok(rawWidth.width>=rawWidth.parentWidth-1);
    await page.locator('.repository-reader-toolbar').getByText('阅读',{exact:true}).click();await page.getByRole('heading',{name:'Explorer document'}).waitFor();
    await page.getByRole('button',{name:'展开菜单',exact:true}).click();
  });
  await t.test('打开搜索结果和切换文件不重搜，主动刷新与改变范围会重搜',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    let searches=0;const count=(request:any)=>{if(new URL(request.url()).pathname.endsWith('/code/search'))searches++;};page.on('request',count);
    try{
      await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('cachedFile');await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===9);
      const initial=searches;assert.ok(initial>0);
      await matchResult('src/file1.ts',1).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('cachedFile1 = true'));
      await matchResult('src/file2.ts',1).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('cachedFile2 = true'));
      await page.getByRole('tab',{name:'file1.ts',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('cachedFile1 = true'));
      await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,initial);assert.equal(await page.locator('.repository-search-result').count(),9);
      const refreshed=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/search'));await page.getByRole('button',{name:'重新读取文件',exact:true}).click();await refreshed;await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===9);assert.ok(searches>initial);
      const beforeScope=searches;await page.locator('.code-root-selectors .ant-select-selector').first().click();await page.locator('.ant-select-dropdown .ant-select-item-option').filter({hasText:'另一个代码库'}).click();await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===9);assert.ok(searches>beforeScope);await capture(page,'code-content-search-retained.png');
    }finally{page.off('request',count);}
  });
  await t.test('文件名和内容搜索至少两个字符，回退单字符清空结果且 Unicode 按字符计数',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-tree-file').first().waitFor();
    const input=page.getByRole('textbox',{name:'搜索文件',exact:true});
    let searches=0;const count=(request:any)=>{if(new URL(request.url()).pathname.endsWith('/code/search'))searches++;};page.on('request',count);
    try{
      for(const [mode,query] of [['文件名','ma'],['内容','ex']]){
        await input.fill('');await page.locator('.repository-search-options').getByText(mode,{exact:true}).click();const before=searches;
        await input.fill('m');await page.locator('.repository-search-hint').waitFor();await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,before);assert.equal(await page.locator('.repository-search-result').count(),0);
        await search(query);assert.ok(searches>before);const afterAscii=searches;
        await input.fill('m');await page.locator('.repository-search-hint').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===0);await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,afterAscii);
        await input.fill('𠮷');await page.locator('.repository-search-hint').waitFor();await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,afterAscii);
        await search('𠮷𠮷');await fileResult('projects/demo/services/api/src/𠮷𠮷.ts').waitFor();assert.ok(searches>afterAscii);const afterUnicode=searches;
        await input.fill('𠮷');await page.locator('.repository-search-hint').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===0);await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,afterUnicode);
      }
      assert.equal(await page.locator('.repository-search-hint').innerText(),'输入至少 2 个字符开始搜索');await capture(page,'code-search-minimum-characters.png');
    }finally{page.off('request',count);}
  });
  await t.test('代码库筛选聚焦只有一层描边，搜索方式有清楚的选中样式',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-tree-file').first().waitFor();
    const select=page.locator('.code-root-selectors .ant-select').first();await select.locator('.ant-select-selector').click();await page.locator('.ant-select-dropdown:visible').waitFor();
    const focusPaint=await select.evaluate((el:HTMLElement)=>[el,el.querySelector('.ant-select-selector')!,el.querySelector('input')!].map(node=>{const style=getComputedStyle(node);return {outline:style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0,shadow:style.boxShadow!=='none'};}));
    assert.equal(focusPaint.at(-1).outline,false,JSON.stringify(focusPaint));assert.equal(focusPaint.at(-1).shadow,false,JSON.stringify(focusPaint));assert.ok(focusPaint.filter((paint:any)=>paint.outline||paint.shadow).length<=1,JSON.stringify(focusPaint));
    await page.keyboard.press('Escape');
    const segmented=page.locator('.repository-search-options .repository-search-mode');
    for(const mode of ['文件名','内容']){
      await segmented.getByText(mode,{exact:true}).click();const selected=segmented.locator('.ant-segmented-item-selected');assert.equal(await selected.innerText(),mode);
      const paint=await selected.evaluate((el:HTMLElement)=>{const style=getComputedStyle(el),other=getComputedStyle(el.parentElement!.querySelector('.ant-segmented-item:not(.ant-segmented-item-selected)')!);return {background:style.backgroundColor,otherBackground:other.backgroundColor,weight:Number(style.fontWeight)};});
      assert.notEqual(paint.background,paint.otherBackground,JSON.stringify(paint));assert.notEqual(paint.background,'rgba(0, 0, 0, 0)');assert.ok(paint.weight>=600,JSON.stringify(paint));
    }
    await noOverflow();await capture(page,'code-search-control-focus.png');
  });
  await t.test('忽略开关说明搜索边界，根目录忽略项按开关显示且 Git 管理目录始终隐藏',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-tree-file').first().waitFor();
    const directories=['.agents','.worktrees','.pnpm-store'];const folder=(name:string)=>page.locator('.repository-tree-body .ant-tree-title').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
    for(const directory of directories)assert.equal(await folder(directory).count(),0);assert.equal(await folder('.git').count(),0);
    const show=page.getByRole('button',{name:'显示忽略文件',exact:true});await show.hover();const tooltip=page.getByRole('tooltip');await tooltip.waitFor();const explanation=await tooltip.innerText();assert.ok(explanation.includes('Git 忽略规则'));assert.ok(explanation.includes('点号开头不代表忽略'));assert.ok(explanation.includes('Git 管理目录始终隐藏'));
    await show.click();await page.getByRole('button',{name:'隐藏忽略文件',exact:true}).waitFor();for(const directory of directories)await folder(directory).waitFor();assert.equal(await folder('.git').count(),0);
    await capture(page,'code-ignored-directory-toggle.png');
    await page.getByRole('button',{name:'隐藏忽略文件',exact:true}).click();await page.getByRole('button',{name:'显示忽略文件',exact:true}).waitFor();for(const directory of directories)await folder(directory).waitFor({state:'hidden'});assert.equal(await folder('.git').count(),0);
  });
  await t.test('内容结果按文件与代码库分组，逐行定位并高亮大小写不敏感的字面字串',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    let searches=0,reads=0;const count=(request:any)=>{const path=new URL(request.url()).pathname;if(path.endsWith('/code/search'))searches++;if(path.endsWith('/code/file'))reads++;};page.on('request',count);
    try{
      await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('search.hit[0]');await page.waitForFunction(()=>document.querySelectorAll('.repository-search-group').length===2);
      const firstPath='projects/demo/services/api/src/search-matches.ts',secondPath='src/search-matches.ts';
      const first=page.locator('.repository-search-group[data-file-path="'+firstPath+'"]'),second=page.locator('.repository-search-group[data-file-path="'+secondPath+'"]');
      assert.equal(await first.count(),1);assert.equal(await second.count(),1);assert.notEqual(await first.getAttribute('data-repository-id'),await second.getAttribute('data-repository-id'));
      assert.ok((await fileResult(firstPath).innerText()).includes('search-matches.ts'));assert.ok((await fileResult(secondPath).innerText()).includes('另一个代码库'));
      await resultPath(firstPath);await resultPath(secondPath);assert.notEqual(await fileResult(firstPath).locator('.repository-search-file-path').innerText(),await fileResult(secondPath).locator('.repository-search-file-path').innerText());
      const divider=page.getByRole('separator',{name:'调整资源管理器宽度'});await divider.dblclick();
      for(const treeWidth of [280,240]){
        if(treeWidth===240)for(let step=0;step<3;step++)await divider.press('ArrowLeft');
        assert.equal(Number(await divider.getAttribute('aria-valuenow')),treeWidth);
        const resultWidths=await fileResult(firstPath).evaluate((el:HTMLElement)=>({row:el.getBoundingClientRect().width,label:el.querySelector('.repository-search-file-label')!.getBoundingClientRect().width,count:el.querySelector('.repository-search-count')!.getBoundingClientRect().width}));
        assert.ok(resultWidths.count<16,JSON.stringify(resultWidths));assert.ok(resultWidths.label>resultWidths.row*0.65,JSON.stringify(resultWidths));
      }
      await divider.dblclick();
      await first.getByRole('button',{name:'折叠 '+firstPath+' 的匹配',exact:true}).waitFor();await second.getByRole('button',{name:'折叠 '+secondPath+' 的匹配',exact:true}).waitFor();
      assert.equal(await second.locator('.repository-search-occurrence:visible').count(),1);
      assert.equal(await first.locator('.repository-search-occurrence').count(),3);assert.deepEqual(await first.locator('.repository-search-occurrence').evaluateAll((els:HTMLElement[])=>els.map(el=>el.dataset.matchLine)),['1','3','4']);
      const initial=searches,initialReads=reads;await fileResult(firstPath).click();assert.equal(await first.locator('.repository-search-occurrence:visible').count(),0);await resultPath(firstPath);
      await fileResult(firstPath).locator('.repository-search-file-path').click();assert.equal(await first.locator('.repository-search-occurrence:visible').count(),3);await new Promise(resolve=>setTimeout(resolve,350));assert.equal(searches,initial);assert.equal(reads,initialReads);assert.equal(await page.locator('.repository-source-code').count(),0);
      await matchResult(firstPath,1).click();await page.locator('.repository-source-row.selected-line[data-line="1"]').waitFor();assert.ok(reads>initialReads);
      assert.equal(await page.locator('.repository-source-code mark.repository-search-hit').count(),4);assert.equal(await page.locator('.repository-source-row[data-line="1"] mark.repository-search-hit').count(),2);
      assert.equal(await page.locator('.repository-source-row[data-line="2"] mark.repository-search-hit').count(),0);
      assert.deepEqual(await page.locator('.repository-source-code mark.repository-search-hit').allTextContents(),['Search.Hit[0]','SEARCH.HIT[0]','search.hit[0]','Search.Hit[0]']);
      await first.locator('.repository-search-occurrence[data-match-line="3"]').click();await page.locator('.repository-source-row.selected-line[data-line="3"]').waitFor();assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').count(),1);
      await first.getByRole('button',{name:'折叠 '+firstPath+' 的匹配',exact:true}).click();assert.equal(await first.locator('.repository-search-occurrence:visible').count(),0);assert.equal(await second.locator('.repository-search-occurrence:visible').count(),1);assert.equal(await page.locator('.repository-source-row.selected-line[data-line="3"]').count(),1);
      const beforeToggleReads=reads;await resultPath(firstPath);await fileResult(firstPath).locator('.repository-search-file-path').click();assert.equal(await page.locator('.repository-source-row.selected-line[data-line="3"]').count(),1);assert.equal(await first.locator('.repository-search-occurrence:visible').count(),3);assert.equal(searches,initial);assert.equal(reads,beforeToggleReads);
      await first.locator('.repository-search-occurrence[data-match-line="4"]').click();await page.locator('.repository-source-row.selected-line[data-line="4"]').waitFor();
      await matchResult(secondPath,1).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('secondSearch'));
      assert.equal(await page.locator('.repository-source-code mark.repository-search-hit').count(),1);assert.equal(await page.getByRole('tab',{name:/search-matches\.ts/}).count(),2);
      await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,initial);assert.equal(await page.locator('.repository-search-group').count(),2);
      await noOverflow();await capture(page,'code-grouped-search-hits.png');
      const tokenSearch=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/search')&&url.searchParams.get('query')==='export const';});
      await search('export const');await tokenSearch;await matchResult(firstPath,1).click();
      await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('firstSearch')&&document.querySelector('.repository-source-row[data-line="1"] mark.repository-search-hit')?.textContent==='export const');
      const tokenHit=page.locator('.repository-source-row[data-line="1"] mark.repository-search-hit');assert.equal(await tokenHit.count(),1);assert.equal(await tokenHit.innerText(),'export const');assert.deepEqual(await tokenHit.locator('.source-token-keyword').allTextContents(),['export','const']);
      const markdownSearch=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/search')&&url.searchParams.get('query')==='Explorer document';});
      await search('Explorer document');await markdownSearch;
      const markdownPath='projects/demo/services/api/README.md',markdownGroup=page.locator('.repository-search-group[data-file-path="'+markdownPath+'"]');await markdownGroup.waitFor();
      const markdownExpand=markdownGroup.getByRole('button',{name:'展开 '+markdownPath+' 的匹配',exact:true});if(await markdownExpand.isVisible())await markdownExpand.click();
      const markdownMatch=markdownGroup.locator('.repository-search-occurrence[data-match-line="1"]');await markdownMatch.click();await page.locator('.repository-source-row.selected-line[data-line="1"] mark.repository-search-hit').waitFor();
      assert.equal(await page.locator('.repository-markdown').count(),0);assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').innerText(),'Explorer document');
      const beforeRepeat=searches;await page.locator('.repository-reader-toolbar').getByText('阅读',{exact:true}).click();await page.getByRole('heading',{name:'Explorer document'}).waitFor();
      await markdownMatch.click();await page.locator('.repository-source-row.selected-line[data-line="1"] mark.repository-search-hit').waitFor();assert.equal(await page.locator('.repository-markdown').count(),0);assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').innerText(),'Explorer document');
      await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,beforeRepeat);await capture(page,'code-markdown-search-source.png');
    }finally{page.off('request',count);}
  });
  await t.test('可搜索页面中的真实源码，右上角展开与恢复保留搜索、宽度和阅读位置',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('registerApplicationDoctor');
    await matchResult('projects/demo/services/api/src/main.ts',2).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('registerApplicationDoctor'));
    assert.equal(await page.locator('.code-tree-coverage').count(),0);const count=await page.locator('.repository-search-result').count();
    const divider=page.getByRole('separator',{name:'调整资源管理器宽度'}),width=await divider.getAttribute('aria-valuenow');
    const body=page.locator('.repository-reader-content');await body.evaluate((el:HTMLElement)=>{el.scrollTop=400;});const top=await body.evaluate((el:HTMLElement)=>el.scrollTop);
    const toggle=page.getByRole('button',{name:'展开阅读',exact:true});const toggleBox=await toggle.boundingBox(),readerBox=await page.locator('.code-file-stage').boundingBox();assert.ok(toggleBox.x>readerBox.x+readerBox.width-150);
    await toggle.click();await page.getByRole('complementary',{name:'资源管理器文件树',exact:true}).waitFor({state:'hidden'});await capture(page,'code-expanded-reading.png');
    await page.getByRole('button',{name:'恢复分屏',exact:true}).click();assert.equal(await divider.getAttribute('aria-valuenow'),width);assert.equal(await page.getByRole('textbox',{name:'搜索文件',exact:true}).inputValue(),'registerApplicationDoctor');assert.equal(await page.locator('.repository-search-result').count(),count);assert.equal(await body.evaluate((el:HTMLElement)=>el.scrollTop),top);await capture(page,'code-restored-reading.png');
  });
  await t.test('大文件逐段阅读保留 UTF-8 和真行号，搜索直达后续段且变更后拒绝续读',async()=>{
    const path='projects/demo/services/api/zz-segmented-text.txt',requests:URL[]=[];
    const count=(request:any)=>{const url=new URL(request.url());if(url.pathname.endsWith('/code/file')&&url.searchParams.get('filePath')===path)requests.push(url);};page.on('request',count);
    try{
      await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await search('zz-segmented-text.txt');
      const initial=fileResponse(path);await fileResult(path).click();const first=await(await initial).json();assert.equal(first.page.index,0);assert.equal(first.page.startLine,1);assert.equal(first.source.commitHash,null);await assertPart(first,codeFixture.current);assert.equal(await page.getByRole('button',{name:'上一段',exact:true}).isDisabled(),true);
      const next=fileResponse(path,url=>url.searchParams.get('page')==='1');await page.getByRole('button',{name:'下一段',exact:true}).click();const second=await(await next).json();assert.equal(second.revision,first.revision);assert.equal(second.page.index,1);assert.equal(second.page.offset,first.page.endOffset);assert.equal(second.page.startsMidLine,true);assert.ok((first.content+second.content).includes('前界😀BoundaryNeedle'));assert.equal(requests.at(-1)?.searchParams.get('expectedRevision'),first.revision);await assertPart(second,codeFixture.current);
      const previous=fileResponse(path,url=>url.searchParams.get('page')==='0');await page.getByRole('button',{name:'上一段',exact:true}).click();const restored=await(await previous).json();assert.equal(restored.revision,first.revision);assert.deepEqual(restored.page,first.page);await assertPart(restored,codeFixture.current);
      const otherResponse=fileResponse('zz-segmented-text.txt');await fileResult('zz-segmented-text.txt').click();const other=await(await otherResponse).json();assert.notEqual(other.source.repositoryId,first.source.repositoryId);assert.equal(other.page,null);await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('second repository isolated text'));assert.equal(await page.locator('.repository-file-pagination').count(),0);
      await page.getByRole('tab',{name:/zz-segmented-text\.txt.*主目录/}).filter({hasText:'api'}).click();await assertPart(restored,codeFixture.current);
      await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('AfterBoundaryNeedle');const beforeLongLine=requests.length;
      const longLineResponse=fileResponse(path,url=>url.searchParams.get('line')==='2'&&url.searchParams.get('matchQuery')==='AfterBoundaryNeedle');await matchResult(path,2).click();const longLine=await(await longLineResponse).json();assert.equal(requests.length,beforeLongLine+1);assert.equal(longLine.page.index,1);await assertPart(longLine,codeFixture.current);await page.locator('.repository-source-row.selected-line[data-line="2"] mark.repository-search-hit').waitFor();assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').innerText(),'AfterBoundaryNeedle');
      await search('FarSegmentNeedle');const beforeFarLine=requests.length;const farResponse=fileResponse(path,url=>url.searchParams.get('line')==='40'&&url.searchParams.get('matchQuery')==='FarSegmentNeedle');await matchResult(path,40).click();const far=await(await farResponse).json();assert.equal(requests.length,beforeFarLine+1);assert.ok(far.page.index>1);await assertPart(far,codeFixture.current);await page.locator('.repository-source-row.selected-line[data-line="40"] mark.repository-search-hit').waitFor();assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').innerText(),'FarSegmentNeedle');
      const crossing='前界😀BoundaryNeedle';await search(crossing);const crossResponse=fileResponse(path,url=>url.searchParams.get('line')==='2'&&url.searchParams.get('matchQuery')===crossing);await matchResult(path,2).click();const cross=await(await crossResponse).json();assert.equal(cross.page.index,0);assert.ok(cross.page.matchEndOffset>cross.page.endOffset);await assertPart(cross,codeFixture.current);
      const crossHead=(await page.locator('.repository-source-row[data-line="2"] mark.repository-search-hit').allTextContents()).join('');assert.ok(crossHead.length>0&&crossHead.length<crossing.length);assert.ok(crossing.startsWith(crossHead));assert.equal(await page.locator('.repository-file-match-continuation').innerText(),'匹配文字跨段，下一段继续');
      const crossNext=fileResponse(path,url=>url.searchParams.get('page')==='1');await page.getByRole('button',{name:'下一段',exact:true}).click();const crossTail=await(await crossNext).json();await assertPart(crossTail,codeFixture.current);assert.equal(await page.locator('.repository-file-match-continuation').innerText(),'匹配文字续自上一段');const crossEnd=(await page.locator('.repository-source-row[data-line="2"] mark.repository-search-hit').allTextContents()).join('');assert.equal(crossHead+crossEnd,crossing);
      codeFixture.change();expectedBrowserErrors.add('/code/file?repositoryId='+first.source.repositoryId);const changed=fileResponse(path,url=>url.searchParams.get('page')==='2');await page.getByRole('button',{name:'下一段',exact:true}).click();const rejected=await changed;assert.equal(rejected.status(),409);assert.equal((await rejected.json()).error.code,'code_file_changed');await page.locator('.repository-reading-empty').filter({hasText:'变化'}).waitFor();assert.equal(await page.locator('.repository-file-pagination').count(),0);assert.equal(await page.locator('.repository-source-code').count(),0);
      const reread=fileResponse(path,url=>!url.searchParams.has('page')&&!url.searchParams.has('expectedRevision'));await page.getByRole('button',{name:'重新读取',exact:true}).click();const latest=await(await reread).json();assert.notEqual(latest.revision,first.revision);assert.equal(latest.page.index,0);await assertPart(latest,'changed segmented text\n'+codeFixture.current);assert.ok(latest.content.startsWith('changed segmented text'));await noOverflow();await capture(page,'code-segmented-current.png');
    }finally{codeFixture.restore();page.off('request',count);}
  });
  await t.test('同一大文件的历史对象和当前目录分段独立，不混用版本与正文',async()=>{
    const path='projects/demo/services/api/zz-segmented-text.txt';await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/tasks/browser-task');await page.locator('#task-source-files').waitFor();await page.getByText('改动与提交',{exact:false}).click();
    await page.locator('.task-rail-commit').filter({hasText:'code fixture'}).click();await page.locator('.task-rail-commit-files .task-changed-row').filter({hasText:'zz-segmented-text.txt'}).click();
    const historyResponse=fileResponse(path,url=>url.searchParams.get('commitHash')===codeFixture.commitHash);await page.getByRole('button',{name:'查看完整文件',exact:true}).click();const history=await(await historyResponse).json();assert.equal(history.source.kind,'commit');assert.equal(history.source.commitHash,codeFixture.commitHash);assert.equal(history.page.index,0);assert.ok(history.content.startsWith('segmented history start'));await assertPart(history,codeFixture.history);
    const next=fileResponse(path,url=>url.searchParams.get('commitHash')===codeFixture.commitHash&&url.searchParams.get('page')==='1');await page.getByRole('button',{name:'下一段',exact:true}).click();const historyNext=await(await next).json();assert.equal(historyNext.revision,history.revision);assert.equal(historyNext.source.commitHash,codeFixture.commitHash);await assertPart(historyNext,codeFixture.history);
    const currentResponse=fileResponse(path,url=>!url.searchParams.has('commitHash'));await page.getByRole('button',{name:'查看当前文件',exact:true}).click();const current=await(await currentResponse).json();assert.equal(current.source.commitHash,null);assert.notEqual(current.revision,history.revision);assert.equal(current.page.index,0);assert.ok(current.content.startsWith('segmented current start'));await assertPart(current,codeFixture.current);assert.equal(await page.getByRole('tab',{name:/zz-segmented-text\.txt/}).count(),2);
    await noOverflow();await capture(page,'code-segmented-history-current.png');
  });
  await t.test('任务入口预选代码库，完整文件跳转后返回保留改动选择和滚动',async()=>{
    await page.goto(workspaceUrl+'/tasks/browser-task');await page.locator('#task-source-files').waitFor();
    await page.getByRole('link',{name:'读取本任务说明',exact:true}).click();
    await page.locator('[data-task-brief="browser-task"]').filter({hasText:'代码定位任务说明'}).waitFor();
    assert.equal(await page.locator('[data-task-node=requirements]').getAttribute('aria-selected'),'true');
    await page.getByText('改动与提交',{exact:false}).click();await page.getByRole('button',{name:'查看完整文件',exact:true}).waitFor();
    await page.getByRole('status',{name:'正在读取完整差异'}).waitFor({state:'hidden'});const taskApi=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/')+'/tasks/browser-task';const taskBefore=await(await page.request.get(taskApi)).json();const before=await page.locator('.task-diff-reader').innerText();
    const diffScroll=page.locator('.task-diff-body');await diffScroll.evaluate((el:HTMLElement)=>{el.scrollTop=240;});const scrollBefore=await diffScroll.evaluate((el:HTMLElement)=>el.scrollTop);await page.getByRole('button',{name:'查看完整文件',exact:true}).click();await page.locator('.repository-source-code').waitFor();
    assert.ok((await page.locator('.code-root-selectors').innerText()).includes('主目录'));assert.equal(await page.locator('.repository-root-name').count(),1);
    const clear=page.locator('.code-root-selectors .ant-select-clear').first();await clear.click();await page.waitForFunction(()=>document.querySelectorAll('.repository-root-name').length===2);
    await search('README.md');await page.locator('.repository-search-result').filter({hasText:'另一个代码库'}).click();await page.getByRole('heading',{name:'Second repository'}).waitFor();await page.getByRole('button',{name:'返回任务',exact:true}).click();await page.getByRole('button',{name:'查看完整文件',exact:true}).waitFor();assert.ok(before.includes('main.ts'));assert.ok((await page.locator('.task-diff-reader').innerText()).includes('explorerAnswer = 2'));
    assert.equal(await page.locator('[data-task-content=changes]').getAttribute('aria-selected'),'true','Code返回不重放已消费的@task说明导航意图');
    assert.equal(await page.locator('#task-node-content:visible [data-task-brief]').count(),0);
    assert.equal(await diffScroll.evaluate((el:HTMLElement)=>el.scrollTop),scrollBefore);const taskAfter=await(await page.request.get(taskApi)).json();assert.deepEqual(taskAfter.record,taskBefore.record);await capture(page,'code-task-return.png');
    await page.locator('#task-source-files').click();await page.getByRole('button',{name:'返回任务',exact:true}).waitFor();await page.getByRole('button',{name:'返回任务',exact:true}).click();await page.getByRole('button',{name:'查看完整文件',exact:true}).waitFor();
  });
  await t.test('真实任务入口以同一组预选两个工作树，主目录独有改动保留实际差异与完整文件来源',async()=>{
    const catalog=await readCatalog(codeFixture.worktreeTaskId),taskMembers=catalog.worktrees.filter((member:any)=>member.groupId===codeFixture.worktreeGroupId);
    const main=catalog.worktrees.find((member:any)=>member.repositoryId===codeFixture.primaryRepositoryId&&member.groupId==='main');assert.equal(taskMembers.length,2);
    await page.goto(workspaceUrl+'/tasks/'+codeFixture.worktreeTaskId);await page.locator('#task-source-files').click();await page.locator('.repository-root-name').first().waitFor();
    await page.waitForFunction((paths:string[])=>paths.every(path=>Array.from(document.querySelectorAll('.repository-root-name')).some(el=>el.getAttribute('title')?.includes(path))),taskMembers.map((member:any)=>member.path));
    assert.equal(await page.locator('.repository-root-name').count(),2);assert.equal(await page.getByRole('tab').count(),0);assert.equal(await page.locator('.code-root-selectors .ant-select').nth(1).locator('.ant-select-selection-item').count(),1);
    await page.getByRole('button',{name:'返回任务',exact:true}).click();
    const diffRequests:URL[]=[];const observe=(request:any)=>{const url=new URL(request.url());if(url.pathname.endsWith('/file-diff'))diffRequests.push(url);};page.on('request',observe);
    try{
      await page.getByText('改动与提交',{exact:false}).click();
      const row=page.locator('.task-changed-row').filter({has:page.locator('strong').filter({hasText:/^main\.ts$/})});await row.click();
      await page.waitForFunction(()=>document.querySelector('.task-diff-reader')?.textContent?.includes('explorerAnswer = 2'));
      const path='projects/demo/services/api/src/main.ts',request=diffRequests.filter(url=>url.searchParams.get('filePath')===path).at(-1);assert.ok(request);assert.equal(request.searchParams.get('checkoutId'),main.id);
      const response=fileResponse(path,url=>url.searchParams.get('checkoutId')===main.id);await page.getByRole('button',{name:'查看完整文件',exact:true}).click();const file=await(await response).json();assert.equal(file.source.checkoutId,main.id);assert.equal(file.source.kind,'default');assert.ok(file.content.includes('explorerAnswer = 2'));await page.locator('.code-root-selectors .ant-select').nth(1).getByText('主目录',{exact:true}).waitFor();for(const root of await page.locator('.repository-root-name small').allTextContents())assert.ok(root.includes('主目录'));
      await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('explorerAnswer = 2'));await page.getByRole('button',{name:'返回任务',exact:true}).click();await page.getByRole('button',{name:'查看完整文件',exact:true}).waitFor();assert.ok((await page.locator('.task-diff-reader').innerText()).includes('explorerAnswer = 2'));assert.ok((await row.locator('..').getAttribute('class')).includes('is-selected'));await capture(page,'code-task-main-source.png');
    }finally{page.off('request',observe);}
  });
  await t.test('任务历史提交打开同版本完整文件，当前文件独立成页签',async()=>{
    await page.goto(workspaceUrl+'/tasks/browser-task');await page.locator('#task-source-files').waitFor();await page.getByText('改动与提交',{exact:false}).click();
    await page.locator('.task-rail-commit').filter({hasText:'code fixture'}).click();await page.locator('.task-rail-commit-files .task-changed-row').filter({hasText:'main.ts'}).click();
    await page.getByRole('button',{name:'查看完整文件',exact:true}).click();await page.locator('.repository-source-code').waitFor();assert.ok((await page.locator('.repository-source-code').innerText()).includes('explorerAnswer = 1'));
    await page.getByRole('button',{name:'查看当前文件',exact:true}).click();await page.locator('.repository-source-code').waitFor();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('explorerAnswer = 2'));
    assert.equal(await page.getByRole('tab',{name:/main.ts/}).count(),2);await capture(page,'code-history-current.png');
  });
  await t.test('一个代码库目录读取失败保留其他文件，重试恢复目录',async()=>{
    const api=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/');const catalog=await (await page.request.get(api+'/code/repositories')).json();const second=catalog.repositories.find((r:any)=>r.code==='second-code');expectedBrowserErrors.add('/code/directory?repositoryId='+second.id);
    await page.route('**/code/directory?**',async(route:any)=>{const url=new URL(route.request().url());if(url.searchParams.get('repositoryId')===second.id)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'code_directory_missing',message:'fixture directory unavailable'}})});return route.continue();});
    await page.goto(workspaceUrl+'/code/explorer');await page.getByText('fixture directory unavailable',{exact:false}).waitFor();await search('main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await page.locator('.repository-source-code').waitFor();
    await page.unroute('**/code/directory?**');await page.getByRole('button',{name:'重新读取文件',exact:true}).click();await page.waitForFunction(()=>!document.body.textContent?.includes('fixture directory unavailable'));
  });
  await t.test('快速切换代码库不会被迟到的另一来源正文覆盖',async()=>{
    await page.route('**/code/file?**',async(route:any)=>{const url=new URL(route.request().url());if(url.searchParams.get('filePath')==='projects/demo/services/api/src/main.ts')await new Promise(resolve=>setTimeout(resolve,400));return route.continue();});
    await page.goto(workspaceUrl+'/code/explorer');await search('main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await page.locator('.repository-search-result').filter({hasText:'另一个代码库'}).click();
    await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('secondRepository = true'));await new Promise(resolve=>setTimeout(resolve,500));assert.ok((await page.locator('.repository-source-code').innerText()).includes('secondRepository = true'));
    await page.getByRole('tab',{name:/main.ts.*主目录/}).filter({hasText:'api'}).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('explorerAnswer = 2'));
    await page.unroute('**/code/file?**');
  });
  await t.test('正文缓存淘汰后保留全部文件页签并正确重新读取',async()=>{
    await page.goto(workspaceUrl+'/code/explorer');await search('src/file');
    for(let i=1;i<=9;i++){await fileResult('src/file'+i+'.ts').click();await page.waitForFunction((index:number)=>document.querySelector('.repository-source-code')?.textContent?.includes('cachedFile'+index+' = true'),i);}
    assert.equal(await page.getByRole('tab').count(),9);await page.getByRole('tab',{name:'file1.ts',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.repository-source-code')?.textContent?.includes('cachedFile1 = true'));
  });
  for(const width of [900,390])await t.test('资源管理器响应布局 '+width,async()=>{
    await page.setViewportSize({width,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await page.locator('.code-explorer-stage').waitFor();await capture(page,'code-initial-'+width+'.png');
    if(width<680)await page.getByRole('button',{name:'恢复分屏',exact:true}).click();
    await search('main.ts');await resultPath('projects/demo/services/api/src/main.ts');await resultPath('src/main.ts');await noOverflow();
    await page.locator('.repository-search-options').getByText('内容',{exact:true}).click();await search('search.hit[0]');await resultPath('projects/demo/services/api/src/search-matches.ts');await resultPath('src/search-matches.ts');await noOverflow();await capture(page,'code-search-paths-'+width+'.png');
    await page.locator('.repository-search-options').getByText('文件名',{exact:true}).click();await search('main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await page.locator('.repository-source-code').waitFor();
    await page.getByRole('button',{name:'请智能体解释',exact:true}).click({trial:true});await noOverflow();await capture(page,'code-explorer-'+width+'.png');
  });
  await t.test('选中工作树消失后刷新保留旧身份的失败，另一代码库继续读取且不回退主目录',async()=>{
    await page.goto(workspaceUrl+'/tasks/'+codeFixture.worktreeTaskId);await page.locator('#task-source-files').click();await page.locator('.repository-root-name').first().waitFor();
    const catalog=await readCatalog(codeFixture.worktreeTaskId),retired=catalog.worktrees.find((member:any)=>member.repositoryId===codeFixture.secondRepositoryId&&member.groupId===codeFixture.worktreeGroupId);
    const path=codeFixture.worktreeFiles[retired.repositoryId].path;await search('worktree-filter.ts');await fileResult(path).click();await page.waitForFunction((text:string)=>document.querySelector('.repository-source-code')?.textContent?.includes(text),codeFixture.worktreeFiles[retired.repositoryId].content.trim());
    const requests:URL[]=[];const observe=(request:any)=>{const url=new URL(request.url());if(url.pathname.includes('/code/'))requests.push(url);};page.on('request',observe);
    expectedBrowserErrors.add('/code/directory?repositoryId='+retired.repositoryId);expectedBrowserErrors.add('/code/search?repositoryId='+retired.repositoryId);expectedBrowserErrors.add('/code/file?repositoryId='+retired.repositoryId);
    try{
      codeFixture.retireWorktree(retired.id);const response=fileResponse(path,url=>url.searchParams.get('checkoutId')===retired.id);await page.getByRole('button',{name:'重新读取文件',exact:true}).click();const failure=await response;assert.equal(failure.status(),404);
      await page.getByRole('heading',{name:'文件暂不可读取',exact:true}).waitFor();assert.equal(await page.locator('.repository-source-code').count(),0);assert.equal(await page.getByRole('tab',{name:/worktree-filter\.ts/}).count(),1);
      const reads=requests.filter(url=>url.searchParams.get('repositoryId')===retired.repositoryId&&url.pathname!=='/code/repositories');assert.ok(reads.length>0);assert.ok(reads.every(url=>url.searchParams.get('checkoutId')===retired.id),'退役来源仍带原checkoutId，不能改读主目录或占位身份');
      await fileResult(codeFixture.worktreeFiles[codeFixture.primaryRepositoryId].path).click();await page.waitForFunction((text:string)=>document.querySelector('.repository-source-code')?.textContent?.includes(text),codeFixture.worktreeFiles[codeFixture.primaryRepositoryId].content.trim());await capture(page,'code-worktree-retired-local-failure.png');
    }finally{page.off('request',observe);}
  });

}
