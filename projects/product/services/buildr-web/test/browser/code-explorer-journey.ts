import fs from 'node:fs';
import { runExplorerNavigationJourney } from './code-explorer-navigation-journey.ts';
import { runExplorerSourcesJourney } from './code-explorer-sources-journey.ts';
import { runExplorerSearchJourney } from './code-explorer-search-journey.ts';
import { showPrimaryNavigation } from './primary-navigation-controls.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import { assertEditorText, assertVisibleSearchHit, codeEditor, codeMarkdown, createCodeReadAssertions, editorPosition, editorScroll } from './code-editor-assertions.ts';
import { codeRepositoryCode } from '../../src/features/code/code-source-labels.ts';
export async function runCodeExplorerJourney({t,page,workspaceUrl,capture,expectedBrowserErrors,codeFixture}:any){
  const read = createCodeReadAssertions(page, workspaceUrl);
  const navigateCode = async (name:'source-control'|'explorer') => {
    await showPrimaryNavigation(page, 'code');
    await page.locator('.primary-secondary-navigation:visible [data-nav="'+name+'"]').click();
  };
  t.after(() => read.dispose());
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const fileResult=(filePath:string)=>page.locator('.repository-search-result[data-file-path="'+filePath+'"]');
  const matchResult=(filePath:string,line:number)=>page.locator('.repository-search-group[data-file-path="'+filePath+'"] .repository-search-occurrence[data-match-line="'+line+'"]');
  const search=async(query:string)=>{await page.getByRole('textbox',{name:'搜索文件',exact:true}).fill(query);await page.locator('.repository-search-result').first().waitFor();};
  const selectSearchMode=async(mode:string)=>{await page.locator('.repository-search-scope').click();await page.locator('.ant-select-dropdown:visible').getByText(mode,{exact:true}).click();};
  const resultPath=async(filePath:string)=>{const line=fileResult(filePath).locator('.repository-search-file-path');await line.waitFor();assert.equal(await line.innerText(),filePath);assert.equal(await line.getAttribute('title'),filePath);};
  const fileResponse=async(filePath:string,accept:(url:URL)=>boolean=()=>true)=>{
    const response=await page.waitForResponse(async(response:any)=>{const url=new URL(response.url());if(!/\/code\/(?:file|editor-file)$/u.test(url.pathname)||url.searchParams.get('filePath')!==filePath||!accept(url))return false;return !url.pathname.endsWith('/editor-file')||response.status()>=400||(await response.json()).kind!=='unsupported';});
    return {status:()=>response.status(),url:()=>response.url(),json:async()=>{
      const file=await response.json();if(!file.selector)return file;
      const catalog=await readCatalog(),member=catalog.worktrees.find((item:any)=>item.id===file.selector.checkoutId);
      return {...file,page:null,truncated:false,message:'',source:{repositoryId:file.selector.repositoryId,checkoutId:file.selector.checkoutId,commitHash:null,kind:member?.groupId==='main'?'default':member?.kind,location:file.rootPath}};
    }};
  };
  const assertPart=async(file:any,content:string)=>{
    assert.ok(file.page);assert.ok(file.sizeBytes>5*1024*1024);assert.ok(Buffer.byteLength(file.content)<=512*1024+4);assert.equal(file.truncated,true);assert.ok(!file.content.includes('\ufffd'));
    assert.equal(file.content,Buffer.from(content).subarray(file.page.offset,file.page.endOffset).toString('utf8'));
    await assertEditorText(page,file.content,{omitTrailingEmpty:file.page.index<file.page.total-1,readOnly:true});
    const expectedLines=file.content.split('\n'),shown=await page.locator('.repository-source-row').evaluateAll((rows:HTMLElement[])=>rows.map(row=>({line:Number(row.dataset.line),text:row.textContent||''})));for(const row of shown){assert.ok(row.line>=file.page.startLine&&row.line<=file.page.endLine);assert.ok(expectedLines[row.line-file.page.startLine].includes(row.text.slice(0,24)));}
    assert.equal(Number(await page.locator('.repository-source-row').first().getAttribute('data-line')),file.page.startLine);assert.ok(await page.locator('.repository-source-row').count()<12);
    await page.getByRole('region',{name:'大文件分段阅读',exact:true}).waitFor();assert.ok((await page.locator('.repository-file-page-status').innerText()).includes('第 '+(file.page.index+1)+' / '+file.page.total+' 段'));
  };
  const catalogUrl=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/')+'/code/repositories';
  const readCatalog=async(taskId?:string)=>await(await page.request.get(catalogUrl+(taskId?'?taskId='+encodeURIComponent(taskId):''))).json();
  const memberName=(catalog:any,member:any,peers=catalog.worktrees)=>{
    const name=path.basename(member.path);
    return peers.some((other:any)=>path.basename(other.path)===name&&other.path!==member.path)?name+'（'+member.path+'）':name;
  };
  const groupName=(catalog:any,groupId='main',repositoryIds:string[]=[])=>{
    const peers=catalog.worktrees.filter((member:any)=>!repositoryIds.length||repositoryIds.includes(member.repositoryId)),members=peers.filter((member:any)=>member.groupId===groupId);
    assert.ok(members.length);return [...new Set(members.map((member:any)=>memberName(catalog,member,peers)))].join('、');
  };
  const registeredRoots=async(catalog:any)=>{
    const roots=await page.locator('.repository-root-name').evaluateAll((elements:HTMLElement[])=>elements.map(element=>({repositoryId:element.dataset.repositoryId,location:element.dataset.location,label:element.dataset.locationLabel})));
    assert.ok(roots.length);
    for(const root of roots){const member=catalog.worktrees.find((item:any)=>item.repositoryId===root.repositoryId&&item.path===root.location);assert.ok(member);assert.equal(member.groupId,'main');assert.equal(root.label,memberName(catalog,member));}
  };
  const registeredFileTab=async(filePath:string)=>{
    const catalog=await readCatalog(),repository=catalog.repositories.find((item:any)=>item.id===codeFixture.primaryRepositoryId),member=catalog.worktrees.find((item:any)=>item.repositoryId===repository.id&&item.groupId==='main');assert.ok(member);
    return page.getByRole('tab',{name:path.basename(filePath)+' '+(repository.code||repository.name||repository.id)+' · '+memberName(catalog,member),exact:true});
  };
  const rootFor=(repositoryId:string)=>page.locator('.repository-root-name[data-repository-id="'+repositoryId+'"]');
  const expandedRoots=()=>page.locator('.repository-tree-body .ant-tree-treenode[aria-expanded="true"]').filter({has:page.locator('.repository-root-name')});
  const expandRoot=async(repositoryId:string)=>{
    const root=rootFor(repositoryId);await root.waitFor();
    if(await root.locator('xpath=ancestor::*[contains(@class,"ant-tree-treenode")][1]').getAttribute('aria-expanded')!=='true')await root.click();
    await page.waitForFunction(()=>!document.querySelector('.repository-tree-body .ant-tree-treenode-motion'));
    await page.waitForTimeout(250);
  };
  const returnToExplorer=async()=>{
    await showPrimaryNavigation(page, 'code');
    await page.locator('.primary-secondary-navigation:visible [data-nav="source-control"]').click();
    await page.waitForURL(workspaceUrl+'/code/source-control');const sourceControl=page.locator('.code-source-control-page:visible');await sourceControl.waitFor();
    // This fixture's default main.ts diff must finish before a later intentional source mutation.
    await sourceControl.locator('.source-control-diff').getByText('export const explorerAnswer = 2;',{exact:false}).waitFor();await sourceControl.locator('.source-control-read-status').waitFor({state:'hidden'});
    await showPrimaryNavigation(page, 'code');await navigateCode('explorer');await page.waitForURL(workspaceUrl+'/code/explorer');await page.locator('.code-explorer-stage:visible').waitFor();
  };
  const filterDropdown=async(index:number)=>{
    const listId=await page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox').getAttribute('aria-controls');assert.ok(listId);
    return page.locator('.ant-select-dropdown').filter({has:page.locator('[id=\"'+listId+'\"]')});
  };
  const selectFilter=async(index:number,name:string)=>{
    const combobox=page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox');await combobox.focus();await combobox.press('ArrowDown');
    const dropdown=await filterDropdown(index);
    const catalog=index===1?await readCatalog():null,repositoryId=index===1?await page.locator('.repository-root-name').first().getAttribute('data-repository-id'):null;
    const id=catalog?.worktrees.find((member:any)=>member.repositoryId===repositoryId&&(member.id===name||member.groupId===name))?.id;
    await(index===1?dropdown.locator('[data-code-worktree-id="'+id+'"]'):dropdown.getByText(name,{exact:true})).click();
    await page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox').press('Escape');await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
  };
  const clearFilter=async(index:number)=>{
    const select=page.locator('.code-root-selectors .ant-select').nth(index);await select.hover();await select.locator('.ant-select-clear').click();await select.getByRole('combobox').press('Escape');
    await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
  };
  const filterOptionNames=async(index:number)=>{
    // With code-only labels the selected tag ends near the selector's midpoint; a center click can hit its remove control.
    const combobox=page.locator('.code-root-selectors .ant-select').nth(index).getByRole('combobox');await combobox.focus();await combobox.press('ArrowDown');
    const labels=await(await filterDropdown(index)).locator('.ant-select-item-option-content').allTextContents();await combobox.press('Escape');await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();return labels;
  };
  const filterGroupIds=async()=>{
    await page.locator('.code-root-selectors .ant-select').nth(1).locator('.ant-select-selector').click();
    const ids=await(await filterDropdown(1)).locator('[data-code-worktree-id]').evaluateAll((elements:HTMLElement[])=>elements.map(element=>element.dataset.codeWorktreeId));await page.locator('.code-root-selectors .ant-select').nth(1).getByRole('combobox').press('Escape');await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();return ids;
  };
  await t.test('HTML 阅读、源码和草稿并排预览；静态渲染不请求文档外资源', async () => {
    // Chromium reports Playwright's frame-world probes against the deliberately scriptless iframe.
    expectedBrowserErrors.add("[about:srcdoc]: Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.");
    const htmlPath = 'projects/demo/services/api/html-reading-fixture.HTM';
    const original = fs.readFileSync(codeFixture.htmlFixturePath, 'utf8');
    const requests: string[] = [];
    const observe = (request: { url(): string }) => { if (request.url().includes('/html-preview-unused')) requests.push(request.url()); };
    page.on('request', observe);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(workspaceUrl + '/code/explorer');
      await search('html-reading-fixture.HTM');
      await fileResult(htmlPath).click();
      const pane = page.locator('.file-editing-pane:visible');
      const iframe = pane.locator('iframe[title="HTML 静态预览"]');
      const frame = iframe.contentFrame();
      const heading = frame.getByRole('heading', { name: 'HTML 阅读样例' });
      await heading.waitFor();
      assert.equal(await pane.getAttribute('data-file-presentation'), 'rendered');
      assert.equal(await iframe.getAttribute('sandbox'), '');
      assert.equal(await heading.evaluate((node: HTMLElement) => getComputedStyle(node).color), 'rgb(15, 105, 90)');
      assert.equal(await frame.locator('script, meta[http-equiv="refresh"]').count(), 0);
      assert.equal(await frame.getByText('外部链接', { exact: true }).getAttribute('href'), null);
      assert.equal(await frame.getByRole('img', { name: '相对图片' }).getAttribute('src'), null);
      await frame.locator('img[alt="内嵌图片"]').evaluate((img: HTMLImageElement) => img.decode());
      await frame.getByText('展开说明', { exact: true }).click();
      await frame.getByText('折叠内容').waitFor();
      await frame.getByRole('link', { name: '跳到结尾' }).click();
      assert.equal(await heading.evaluate(() => location.hash), '#ending');
      await pane.getByText('源码', { exact: true }).click();
      const editor = pane.locator('.cm-content');
      await editor.waitFor();
      assert.equal(await pane.getAttribute('data-file-presentation'), 'source');
      assert.ok((await editor.innerText()).includes('<h1>HTML 阅读样例</h1>'));
      await pane.getByRole('button', { name: '预览', exact: true }).click();
      await heading.waitFor();
      const editorBox = await editor.boundingBox(), previewBox = await iframe.boundingBox();
      assert.ok(editorBox && previewBox && previewBox.x > editorBox.x && previewBox.height > 100);
      await editor.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
      await editor.press('Enter');
      await page.keyboard.insertText('<p>HTML 草稿预览校对</p>');
      await frame.getByText('HTML 草稿预览校对', { exact: true }).waitFor();
      await pane.locator('[data-prototype-position="save-status"]').getByText('已保存', { exact: true }).waitFor();
      assert.ok(fs.readFileSync(codeFixture.htmlFixturePath, 'utf8').includes('<p>HTML 草稿预览校对</p>'));
      await capture(page, 'code-explorer-html-preview.png');
      await pane.getByText('阅读', { exact: true }).click();
      await frame.getByText('HTML 草稿预览校对', { exact: true }).waitFor();
      await pane.getByText('源码', { exact: true }).click();
      await iframe.waitFor({ state: 'detached' });
      await pane.getByText('阅读', { exact: true }).click();
      await selectSearchMode('内容');
      await search('HTML 文档结尾');
      await matchResult(htmlPath, 10).click();
      await pane.getByRole('button', { name: '返回阅读' }).waitFor();
      assert.equal(await pane.getAttribute('data-file-presentation'), 'source');
      await pane.getByRole('button', { name: '返回阅读' }).click();
      await heading.waitFor();
      assert.deepEqual(requests, []);
    } finally {
      page.off('request', observe);
      fs.writeFileSync(codeFixture.htmlFixturePath, original);
    }
  });
  await runExplorerNavigationJourney({assert, capture, clearFilter, codeFixture, codeRepositoryCode, expandRoot, expandedRoots, fileResponse, fileResult, filterGroupIds, filterOptionNames, groupName, navigateCode, noOverflow, page, read, readCatalog, registeredRoots, rootFor, search, selectFilter, selectSearchMode, t, workspaceUrl});
  await runExplorerSearchJourney({assert, assertEditorText, capture, codeEditor, codeFixture, codeMarkdown, editorPosition, editorScroll, expandRoot, fileResponse, fileResult, matchResult, noOverflow, page, read, resultPath, returnToExplorer, search, selectSearchMode, showPrimaryNavigation, t, workspaceUrl});
  await runExplorerSourcesJourney({assert, assertPart, assertVisibleSearchHit, capture, codeEditor, codeFixture, editorPosition, expandRoot, expectedBrowserErrors, fileResponse, fileResult, groupName, matchResult, noOverflow, page, read, readCatalog, registeredFileTab, registeredRoots, resultPath, returnToExplorer, search, selectSearchMode, t, workspaceUrl});

}
