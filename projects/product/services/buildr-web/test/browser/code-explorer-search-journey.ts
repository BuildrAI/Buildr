import assert from 'node:assert/strict';
/** Retains the original real-page assertions; shared preparation remains with the host. */
export async function runExplorerSearchJourney({assertEditorText, capture, codeEditor, codeFixture, codeMarkdown, editorPosition, editorScroll, expandRoot, fileResponse, fileResult, matchResult, noOverflow, page, read, resultPath, returnToExplorer, search, selectSearchMode, showPrimaryNavigation, t, workspaceUrl}: any) {
  await t.test('真实代码页面：目录读取、完整文件、内容搜索、文档链接与图片',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await showPrimaryNavigation(page, 'code');await page.getByRole('navigation',{name:'代码导航',exact:true}).waitFor();await page.locator('.primary-navigation-rail button[data-nav="code"]').press('Escape');await page.getByLabel('代码二级导航',{exact:true}).waitFor({state:'hidden'});await page.locator('.repository-root-name').first().waitFor();
    await search('main.ts');await resultPath('projects/demo/services/api/src/main.ts');await resultPath('src/main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await read.text('explorerAnswer = 2');await noOverflow();
    const width=await page.getByRole('complementary',{name:'资源管理器文件树',exact:true}).evaluate((el:HTMLElement)=>el.getBoundingClientRect().width);assert.ok(width>=240&&width<=420);
    const divider=page.getByRole('separator',{name:'调整资源管理器宽度'});await divider.press('ArrowRight');assert.ok(await divider.getAttribute('aria-valuenow')>width);
    await page.getByRole('button',{name:'展开阅读',exact:true}).click();await page.getByRole('button',{name:'恢复分屏',exact:true}).click();
    await selectSearchMode('内容');await search('explorerAnswer');await matchResult('projects/demo/services/api/src/main.ts',1).click();
    await selectSearchMode('文件名');await search('README.md');const readmeResponse=fileResponse('projects/demo/services/api/README.md');await fileResult('projects/demo/services/api/README.md').click();const readme=await(await readmeResponse).json();await read.markdown('Explorer document');
    await page.locator(codeMarkdown).getByRole('img').waitFor();assert.ok((await page.locator(codeMarkdown).getByRole('img').getAttribute('src')).startsWith('data:image/png;base64,'));
    const codeUrl=page.url(),resourceViews=await page.evaluate(()=>history.state?.usr?.resourceViews??null),parentPath='projects/demo/services/services/foo';
    const parentResponse=fileResponse(parentPath,(url: URL)=>url.searchParams.get('checkoutId')===readme.source.checkoutId);await page.getByRole('link',{name:'同库父级资料',exact:true}).click();const parent=await(await parentResponse).json();
    assert.equal(parent.source.repositoryId,readme.source.repositoryId);assert.equal(parent.source.checkoutId,readme.source.checkoutId);assert.equal(parent.source.commitHash,null);assert.equal(parent.path,parentPath);await read.text('parentRelativeSource = "same checkout"');
    assert.equal(page.url(),codeUrl,'父相对链接仍在同一代码现场');assert.deepEqual(await page.evaluate(()=>history.state?.usr?.resourceViews??null),resourceViews,'正文链接不提交工作空间服务对象选择');assert.equal(await page.locator('.workspace-pane-host .pane-right:visible').count(),0);
    await page.getByRole('button',{name:'关闭文件 '+parentPath,exact:true}).click();await read.markdown('Explorer document');
    await page.getByRole('link',{name:'Source',exact:true}).click();await read.text('explorerAnswer = 2');
    await page.getByRole('button',{name:'请智能体解释',exact:true}).click();assert.ok((await page.getByRole('textbox',{name:'文件协作指令'}).inputValue()).includes('src/main.ts'));await page.getByRole('button',{name:'返回文件',exact:true}).click();
    await capture(page,'code-explorer-1440.png');
    const largePath='projects/demo/services/api/large-text.txt';await search('large-text.txt');await resultPath(largePath);
    const largeResponse=fileResponse(largePath);await fileResult(largePath).click();const large=(await(await largeResponse).json());
    assert.ok(large.sizeBytes>2*1024*1024&&large.sizeBytes<5*1024*1024);assert.equal(large.truncated,false);assert.equal(large.page,null);assert.equal(large.message,'');assert.equal(large.content.length,large.sizeBytes);
    await read.text('large text end');await assertEditorText(page,large.content);assert.equal(await page.getByRole('alert').filter({hasText:/文件超过完整读取上限|当前内容不完整/}).count(),0);await noOverflow();
    await page.locator('.code-open-files').getByRole('tab',{name:'README.md',exact:true}).click();await read.markdown('Explorer document');
    const retainedFileKeys=await page.locator('.code-open-files [role="tab"]').evaluateAll((tabs:HTMLElement[])=>tabs.map(tab=>tab.dataset.tabKey)),retainedActiveKey=await page.locator('.code-open-files [role="tab"][aria-selected="true"]').getAttribute('data-tab-key');
    const taskLink=page.locator(codeMarkdown).getByRole('link',{name:'代码关联任务说明',exact:true});assert.equal(await taskLink.getAttribute('href'),new URL(workspaceUrl).pathname+'/tasks/browser-task');await taskLink.click();
    await page.waitForURL(workspaceUrl+'/tasks/browser-task');await page.locator('[data-task-brief="browser-task"]:visible').filter({hasText:'代码定位任务说明'}).waitFor();assert.equal(await page.locator(codeMarkdown+':visible').count(),0,'代码任务链接进入真实任务页面');
    await returnToExplorer();assert.equal(page.url(),codeUrl);const returnedReadme=await read.markdown('Explorer document');
    assert.equal(returnedReadme.path,readme.path);assert.equal(returnedReadme.source.repositoryId,readme.source.repositoryId);assert.equal(returnedReadme.source.checkoutId,readme.source.checkoutId);assert.equal(returnedReadme.source.commitHash,readme.source.commitHash);
    assert.deepEqual(await page.locator('.code-open-files [role="tab"]').evaluateAll((tabs:HTMLElement[])=>tabs.map(tab=>tab.dataset.tabKey)),retainedFileKeys,'任务链接往返保留已打开文件及来源身份');assert.equal(await page.locator('.code-open-files [role="tab"][aria-selected="true"]').getAttribute('data-tab-key'),retainedActiveKey,'返回原代码Markdown文件');await noOverflow();
  });
  await t.test('代码顶部与分屏保持同高短竖线，文件标签复用共享样式',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await search('main.ts');await fileResult('projects/demo/services/api/src/main.ts').click();await page.locator(codeEditor+':visible').waitFor();
    await search('README.md');await fileResult('projects/demo/services/api/README.md').click();await read.markdown('Explorer document');
    const files=page.locator('.code-open-files.pane-tabstrip[role="tablist"]');await files.waitFor();
    assert.equal(await files.getAttribute('aria-label'),'打开的文件');assert.equal(await files.locator('.pane-tab').count(),2);assert.equal(await files.locator('.pane-tab.on').count(),1);
    assert.equal((await page.locator('.code-tree-pane-title').innerText()).trim(),'目录','左栏标题不再重复资源管理器页面名称');
    const headerGeometry=await page.locator('.code-explorer-stage').evaluate((el:HTMLElement)=>{
      const tabs=el.querySelector('.code-file-tabstrip')!.getBoundingClientRect(),tree=el.querySelector('.code-tree-pane-title')!.getBoundingClientRect(),marker=el.querySelector('.global-source-divider > .split-divider-header-marker')!.getBoundingClientRect();
      return {tabsHeight:tabs.height,treeHeight:tree.height,topGap:Math.abs(tabs.top-tree.top),markerHeight:marker.height,markerTop:marker.top-tree.top};
    });
    assert.equal(headerGeometry.tabsHeight,43);assert.equal(headerGeometry.treeHeight,43);assert.ok(headerGeometry.topGap<1,JSON.stringify(headerGeometry));assert.equal(headerGeometry.markerHeight,19);assert.equal(headerGeometry.markerTop,12);
    await noOverflow();await capture(page,'code-header-alignment.png');
  });
  await t.test('点击文件夹标题展开、折叠，收起菜单后文件树贴齐内容区',async()=>{
    await page.setViewportSize({width:1920,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await expandRoot(codeFixture.secondRepositoryId);const folder=page.locator('.ant-tree-title').filter({hasText:/^src$/});await folder.waitFor();
    await folder.click();await page.locator('[data-file-path="src/file1.ts"]').waitFor();
    await folder.click();await page.locator('[data-file-path="src/file1.ts"]').waitFor({state:'hidden'});
    await folder.click();await page.locator('[data-file-path="src/file1.ts"]').waitFor();
    await showPrimaryNavigation(page, 'code');await page.locator('.primary-navigation-rail button[data-nav="code"]').click();await page.locator('.primary-secondary-navigation.is-fixed:visible').waitFor();
    await page.locator('.primary-navigation-rail button[data-nav="code"]').click();await page.locator('.primary-secondary-navigation.is-fixed').waitFor({state:'hidden'});await page.mouse.move(400,4);await page.locator('.primary-secondary-navigation.is-floating').waitFor({state:'hidden'});
    const geometry=await page.locator('.code-explorer-stage').evaluate((el:HTMLElement)=>{
      const stage=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect(),tree=el.querySelector('.global-source-dock')!.getBoundingClientRect();
      const reader=el.querySelector('.code-file-stage')!.getBoundingClientRect();
      return {leftGap:tree.left-parent.left,rightGap:parent.right-stage.right,width:stage.width,parentWidth:parent.width,dividerGap:reader.left-tree.right};
    });assert.ok(Math.abs(geometry.leftGap)<2,JSON.stringify(geometry));assert.ok(Math.abs(geometry.rightGap)<2,JSON.stringify(geometry));assert.ok(Math.abs(geometry.width-geometry.parentWidth)<2);assert.ok(Math.abs(geometry.dividerGap)<1,JSON.stringify(geometry));
    await noOverflow();await capture(page,'code-tree-collapsed-menu.png');
    await search('README.md');await fileResult('projects/demo/services/api/README.md').click();await read.markdown('Explorer document');
    const markdown=await page.locator(codeMarkdown).evaluate((el:HTMLElement)=>{const box=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect(),style=getComputedStyle(el);return {width:box.width,contentWidth:box.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),centerGap:Math.abs((box.left+box.right)-(parent.left+parent.right))};});
    assert.equal(markdown.width,1200);assert.equal(markdown.contentWidth,1200);assert.ok(markdown.centerGap<2);await capture(page,'code-markdown-read.png');
    await page.locator('.file-editing-mode').getByText('编辑',{exact:true}).click();await read.text('# Explorer document');assert.equal(await page.locator(codeMarkdown+':visible').count(),0);
    const rawWidth=await page.locator(codeEditor+':visible').evaluate((el:HTMLElement)=>({width:el.getBoundingClientRect().width,parentWidth:el.parentElement!.clientWidth}));assert.ok(rawWidth.width>=rawWidth.parentWidth-1);
    await page.locator('.file-editing-mode').getByText('阅读',{exact:true}).click();await read.markdown('Explorer document');
    await showPrimaryNavigation(page, 'code');await page.locator('.primary-navigation-rail button[data-nav="code"]').click();await page.locator('.primary-secondary-navigation.is-fixed:visible').waitFor();
  });
  await t.test('打开搜索结果和切换文件不重搜，主动刷新与改变范围会重搜',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    let searches=0;const count=(request:any)=>{if(new URL(request.url()).pathname.endsWith('/code/search'))searches++;};page.on('request',count);
    try{
      await selectSearchMode('内容');await search('cachedFile');await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===9);
      const initial=searches;assert.ok(initial>0);
      await matchResult('src/file1.ts',1).click();await read.text('cachedFile1 = true');
      await matchResult('src/file2.ts',1).click();await read.text('cachedFile2 = true');
      await page.getByRole('tab',{name:'file1.ts',exact:true}).click();await read.text('cachedFile1 = true');
      await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,initial);assert.equal(await page.locator('.repository-search-result').count(),9);
      const refreshed=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/search'));await page.getByRole('button',{name:'刷新展开目录',exact:true}).click();await refreshed;await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===9);assert.ok(searches>initial);
      const beforeScope=searches;await page.locator('.code-root-selectors .ant-select-selector').first().click();await page.locator('.ant-select-dropdown .ant-select-item-option').filter({hasText:'second-code'}).click();await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.repository-search-result').length===9);assert.ok(searches>beforeScope);await capture(page,'code-content-search-retained.png');
    }finally{page.off('request',count);}
  });
  await t.test('文件名和内容搜索至少两个字符，回退单字符清空结果且 Unicode 按字符计数',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
    const input=page.getByRole('textbox',{name:'搜索文件',exact:true});
    let searches=0;const count=(request:any)=>{if(new URL(request.url()).pathname.endsWith('/code/search'))searches++;};page.on('request',count);
    try{
      // Full mode/Unicode/debounce combinations live in code-explorer-search-hook.test.mjs.
      // Keep real content-mode Unicode search and empty-state rendering here.
      for(const [mode,query] of [['内容','ex']]){
        await input.fill('');await selectSearchMode(mode);const before=searches;
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
  await t.test('文件名无结果时可直接切换到内容搜索，摘要说明当前范围',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
    assert.equal(await page.locator('.repository-search-scope .ant-select-selection-item').innerText(),'文件名');
    await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill('explorerAnswer');
    await page.getByText('文件名匹配 · 0 个文件',{exact:true}).waitFor();
    await page.getByRole('button',{name:'在内容中搜索',exact:true}).click();
    await page.locator('.repository-search-result').first().waitFor();
    assert.equal(await page.locator('.repository-search-scope .ant-select-selection-item').innerText(),'内容');
    assert.match(await page.locator('.repository-search-results > p').innerText(),/^内容匹配 · \d+ 个文件 · \d+ 处$/);
    await noOverflow();await capture(page,'code-search-empty-to-content.png');
  });
  await t.test('代码库筛选聚焦只有一层描边，搜索方式有清楚的选中样式',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
    const select=page.locator('.code-root-selectors .ant-select').first();await select.locator('.ant-select-selector').click();await page.locator('.ant-select-dropdown:visible').waitFor();
    const focusPaint=await select.evaluate((el:HTMLElement)=>[el,el.querySelector('.ant-select-selector')!,el.querySelector('input')!].map(node=>{const style=getComputedStyle(node);return {outline:style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0,shadow:style.boxShadow!=='none'};}));
    assert.equal(focusPaint.at(-1).outline,false,JSON.stringify(focusPaint));assert.equal(focusPaint.at(-1).shadow,false,JSON.stringify(focusPaint));assert.ok(focusPaint.filter((paint:any)=>paint.outline||paint.shadow).length<=1,JSON.stringify(focusPaint));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.repository-file-search .ant-input-affix-wrapper .repository-search-scope').count(),1);
    for(const mode of ['文件名','内容']){
      await selectSearchMode(mode);assert.equal(await page.locator('.repository-search-scope .ant-select-selection-item').innerText(),mode);
      await page.locator('.repository-search-scope').click();const selected=page.locator('.ant-select-dropdown:visible .ant-select-item-option-selected');assert.equal(await selected.innerText(),mode);
      const paint=await selected.evaluate((el:HTMLElement)=>{const style=getComputedStyle(el);return {weight:Number(style.fontWeight),color:style.color,background:style.backgroundColor};});
      assert.ok(paint.weight>=600,JSON.stringify(paint));assert.notEqual(paint.background,'rgba(0, 0, 0, 0)',JSON.stringify(paint));
      await page.keyboard.press('Escape');
    }
    await noOverflow();await capture(page,'code-search-control-focus.png');
  });
  await t.test('忽略开关说明搜索边界，根目录忽略项按开关显示且 Git 管理目录始终隐藏',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');await page.locator('.repository-root-name').first().waitFor();
    await expandRoot(codeFixture.primaryRepositoryId);const directories=['.agents','.worktrees','.pnpm-store'];const folder=(name:string)=>page.locator('.repository-tree-body .ant-tree-title').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
    for(const directory of directories)assert.equal(await folder(directory).count(),0);assert.equal(await folder('.git').count(),0);
    const show=page.getByRole('button',{name:'显示忽略文件',exact:true});await show.hover();const tooltip=page.getByRole('tooltip').filter({hasText:'包含当前目录中被 Git 忽略规则'});await tooltip.waitFor();const explanation=await tooltip.innerText();assert.ok(explanation.includes('Git 忽略规则'));assert.ok(explanation.includes('点号开头不代表忽略'));assert.ok(explanation.includes('Git 管理目录始终隐藏'));
    await show.click();await page.getByRole('button',{name:'隐藏忽略文件',exact:true}).waitFor();for(const directory of directories)await folder(directory).waitFor();assert.equal(await folder('.git').count(),0);
    await capture(page,'code-ignored-directory-toggle.png');
    await page.getByRole('button',{name:'隐藏忽略文件',exact:true}).click();await page.getByRole('button',{name:'显示忽略文件',exact:true}).waitFor();for(const directory of directories)await folder(directory).waitFor({state:'hidden'});assert.equal(await folder('.git').count(),0);
  });
  await t.test('内容结果按文件与代码库分组，逐行定位并高亮大小写不敏感的字面字串',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    let searches=0,reads=0;const count=(request:any)=>{const path=new URL(request.url()).pathname;if(path.endsWith('/code/search'))searches++;if(/\/code\/(?:file|editor-file)$/u.test(path))reads++;};page.on('request',count);
    try{
      await selectSearchMode('内容');await search('search.hit[0]');await page.waitForFunction(()=>document.querySelectorAll('.repository-search-group').length===2);
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
      await fileResult(firstPath).locator('.repository-search-file-path').click();assert.equal(await first.locator('.repository-search-occurrence:visible').count(),3);await new Promise(resolve=>setTimeout(resolve,350));assert.equal(searches,initial);assert.equal(reads,initialReads);assert.equal(await page.locator(codeEditor+':visible').count(),0);
      await matchResult(firstPath,1).click();await read.text('firstSearch');await read.line(1);await page.locator('.repository-source-row.selected-line[data-line="1"]').waitFor();assert.ok(reads>initialReads);
      assert.equal(await page.locator(codeEditor+' mark.repository-search-hit').count(),4);assert.equal(await page.locator('.repository-source-row[data-line="1"] mark.repository-search-hit').count(),2);
      assert.equal(await page.locator('.repository-source-row[data-line="2"] mark.repository-search-hit').count(),0);
      assert.deepEqual(await page.locator(codeEditor+' mark.repository-search-hit').allTextContents(),['Search.Hit[0]','SEARCH.HIT[0]','search.hit[0]','Search.Hit[0]']);
      await first.locator('.repository-search-occurrence[data-match-line="3"]').click();await read.line(3);await page.locator('.repository-source-row.selected-line[data-line="3"]').waitFor();assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').count(),1);
      await first.getByRole('button',{name:'折叠 '+firstPath+' 的匹配',exact:true}).click();assert.equal(await first.locator('.repository-search-occurrence:visible').count(),0);assert.equal(await second.locator('.repository-search-occurrence:visible').count(),1);assert.equal(await page.locator('.repository-source-row.selected-line[data-line="3"]').count(),1);
      const beforeToggleReads=reads;await resultPath(firstPath);await fileResult(firstPath).locator('.repository-search-file-path').click();assert.equal(await page.locator('.repository-source-row.selected-line[data-line="3"]').count(),1);assert.equal(await first.locator('.repository-search-occurrence:visible').count(),3);assert.equal(searches,initial);assert.equal(reads,beforeToggleReads);
      await first.locator('.repository-search-occurrence[data-match-line="4"]').click();await read.line(4);await page.locator('.repository-source-row.selected-line[data-line="4"]').waitFor();
      await matchResult(secondPath,1).click();await read.text('secondSearch');
      assert.equal(await page.locator(codeEditor+' mark.repository-search-hit').count(),1);assert.equal(await page.getByRole('tab',{name:/search-matches\.ts/}).count(),2);
      await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,initial);assert.equal(await page.locator('.repository-search-group').count(),2);
      await noOverflow();await capture(page,'code-grouped-search-hits.png');
      const tokenSearch=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/search')&&url.searchParams.get('query')==='export const';});
      await search('export const');await tokenSearch;await matchResult(firstPath,1).click();
      await read.text('firstSearch');await read.line(1);await page.locator('.repository-source-row[data-line="1"] mark.repository-search-hit').filter({hasText:'export const'}).waitFor();
      const tokenHit=page.locator('.repository-source-row[data-line="1"] mark.repository-search-hit');assert.equal(await tokenHit.count(),1);assert.equal(await tokenHit.innerText(),'export const');
      await page.waitForFunction(()=>{
        const line=document.querySelector('.repository-source-row[data-line="1"]'),base=line&&getComputedStyle(line.closest('.cm-content')!).color;
        return line&&['export','const'].every(text=>[...line.querySelectorAll('span')].some(node=>node.textContent===text&&getComputedStyle(node).color!==base));
      });
      const keywordPaint=await page.locator('.repository-source-row[data-line="1"]').evaluate((line:HTMLElement)=>['export','const'].map(text=>{const node=[...line.querySelectorAll('span')].find(node=>node.textContent===text&&getComputedStyle(node).color!==getComputedStyle(line.closest('.cm-content')!).color);return {text:node?.textContent,className:node?.className};}));
      assert.deepEqual(keywordPaint.map((token:any)=>token.text),['export','const']);assert.ok(keywordPaint.every((token:any)=>Boolean(token.className)),'真实语言着色在搜索高亮内继续显示两个关键字');
      const markdownSearch=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/search')&&url.searchParams.get('query')==='Explorer document';});
      await search('Explorer document');await markdownSearch;
      const markdownPath='projects/demo/services/api/README.md',markdownGroup=page.locator('.repository-search-group[data-file-path="'+markdownPath+'"]');await markdownGroup.waitFor();
      const markdownExpand=markdownGroup.getByRole('button',{name:'展开 '+markdownPath+' 的匹配',exact:true});if(await markdownExpand.isVisible())await markdownExpand.click();
      const markdownMatch=markdownGroup.locator('.repository-search-occurrence[data-match-line="1"]');await markdownMatch.click();await page.locator('.repository-source-row.selected-line[data-line="1"] mark.repository-search-hit').waitFor();
      await read.text('# Explorer document');await read.line(1);assert.equal(await page.locator(codeMarkdown+':visible').count(),0);assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').innerText(),'Explorer document');
      await page.locator('.file-editing-pane').getByText('源码定位：只读查看，可返回阅读或明确进入编辑。',{exact:true}).waitFor();assert.equal(await page.locator('.file-editing-source .cm-content').getAttribute('contenteditable'),'false','Markdown搜索只读定位，不擅自进入编辑');
      const beforeRepeat=searches;await page.getByRole('button',{name:'返回阅读',exact:true}).click();await read.markdown('Explorer document');
      await markdownMatch.click();await read.text('# Explorer document');await read.line(1);await page.locator('.repository-source-row.selected-line[data-line="1"] mark.repository-search-hit').waitFor();assert.equal(await page.locator(codeMarkdown+':visible').count(),0);assert.equal(await page.locator('.repository-source-row.selected-line mark.repository-search-hit').innerText(),'Explorer document');
      await new Promise(resolve=>setTimeout(resolve,700));assert.equal(searches,beforeRepeat);await capture(page,'code-markdown-search-source.png');
    }finally{page.off('request',count);}
  });
  await t.test('可搜索页面中的真实源码，右上角展开与恢复保留搜索、宽度和阅读位置',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/explorer');
    await selectSearchMode('内容');await search('registerApplicationDoctor');
    await matchResult('projects/demo/services/api/src/main.ts',2).click();await read.text('registerApplicationDoctor');
    assert.equal(await page.locator('.code-tree-coverage').count(),0);const count=await page.locator('.repository-search-result').count();
    const divider=page.getByRole('separator',{name:'调整资源管理器宽度'}),width=await divider.getAttribute('aria-valuenow');
    await read.line(2);const top=await editorScroll(page,400);assert.ok(top>300,'真实编辑器承担长源码的滚动');
    const toggle=page.getByRole('button',{name:'展开阅读',exact:true});const toggleBox=await toggle.boundingBox(),readerBox=await page.locator('.code-file-stage').boundingBox();assert.ok(toggleBox.x>readerBox.x+readerBox.width-150);assert.equal((await toggle.innerText()).trim(),'','展开阅读只显示图标');
    await toggle.click();await page.getByRole('complementary',{name:'资源管理器文件树',exact:true}).waitFor({state:'hidden'});await capture(page,'code-expanded-reading.png');
    await page.getByRole('button',{name:'恢复分屏',exact:true}).click();assert.equal(await divider.getAttribute('aria-valuenow'),width);assert.equal(await page.getByRole('textbox',{name:'搜索文件',exact:true}).inputValue(),'registerApplicationDoctor');assert.equal(await page.locator('.repository-search-result').count(),count);assert.equal(await editorScroll(page),top);await capture(page,'code-restored-reading.png');
    const beforeMenuPosition=await editorPosition(page),codeUrl=page.url(),workspaceMenu=page.locator('.primary-navigation-rail [data-nav="workspace"]');
    await workspaceMenu.hover();const workspaceTarget=page.locator('.primary-secondary-navigation:visible [data-nav="workspace-overview"]'),workspaceHref=await workspaceTarget.getAttribute('href');assert.ok(workspaceHref);
    await workspaceTarget.click();await page.waitForURL(new URL(workspaceHref,codeUrl).href);await page.locator(codeEditor+':visible').waitFor({state:'hidden'});
    await returnToExplorer();assert.equal(page.url(),codeUrl);await read.text('registerApplicationDoctor');
    assert.equal(await editorScroll(page),top,'菜单切离再返回保留用户后续滚动，旧搜索行号不能重新定位');assert.deepEqual(await editorPosition(page),beforeMenuPosition,'菜单往返保留真实选区和横向阅读位置');assert.equal(await divider.getAttribute('aria-valuenow'),width);assert.equal(await page.getByRole('textbox',{name:'搜索文件',exact:true}).inputValue(),'registerApplicationDoctor');assert.equal(await page.locator('.repository-search-result').count(),count);
  });

}
