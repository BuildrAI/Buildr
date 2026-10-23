import assert from 'node:assert/strict';
import { codeRepositoryCode } from '../../src/features/code/code-source-labels.ts';
import { selectSourceControlView } from './source-control-view-controls.ts';

/** External filesystem/Git writes belong to the isolated host fixture. All UI observations use production HTTP. */
export async function runSourceControlLiveRefreshJourney({t, page, workspaceUrl, capture, fixture, expectedBrowserErrors, scenario = (name: string, action: () => Promise<void>) => t.test(name, action)}: any) {
  const api = workspaceUrl.replace('/workspaces/', '/api/v1/workspaces/');
  const sourceControl = () => page.locator('.code-source-control-page:visible');
  const diff = () => sourceControl().getByRole('region', {name: '差异内容', exact: true});
  const longText = (version: number) => Array.from({length: 150}, (_, index) => `export const liveRefreshLine${index + 1} = ${version};`).join('\n') + '\n';
  const catalog = async () => {
    const response = await page.request.get(api + '/code/source-control');
    assert.equal(response.status(), 200);
    return response.json();
  };
  const identify = (value: any, location: string) => {
    const repository = value.repositories.find((item: any) => item.worktrees.some((tree: any) => tree.location === location));
    assert.ok(repository, '真实目录必须属于已登记代码库');
    const worktree = repository.worktrees.find((item: any) => item.location === location);
    return {repository, worktree};
  };
  const changedRow = (worktreeId: string, filePath: string) => sourceControl().locator('[data-change-worktree="' + worktreeId + '"] [data-change-area="working"] .task-changed-row')
    .filter({has: page.locator('.task-changed-path[data-file-path="' + filePath + '"]')});
  const openWorktree = async (branches: any) => {
    await page.goto(workspaceUrl + '/code/source-control');
    await sourceControl().locator('.source-control-repository-copy').first().waitFor();
    const source = identify(await catalog(), branches.location);
    const group = sourceControl().locator('[data-source-repository="' + source.repository.id + '"]');
    const fold = group.locator('> .source-control-repository .source-control-repository-fold');
    if (await fold.getAttribute('aria-expanded') === 'false') await fold.click();
    await group.locator('[data-source-worktree="' + source.worktree.worktreeId + '"] .source-control-repository-copy').click();
    await selectSourceControlView(sourceControl(), 'changes');
    return source;
  };
  const readRequests = () => {
    const reads: Array<{repositoryId: string | null; operation: string}> = [];
    const observe = (request: any) => {
      const url = new URL(request.url());
      if (url.pathname === new URL(api).pathname + '/code/source-control') reads.push({repositoryId: url.searchParams.get('repositoryId'), operation: 'source-control'});
    };
    page.on('request', observe);
    return {reads, reset: () => {reads.length = 0;}, dispose: () => page.off('request', observe)};
  };
  const assertLocalReads = (reads: Array<{repositoryId: string | null}>, repositoryId: string) => {
    assert.ok(reads.some(read => read.repositoryId === repositoryId), '外部变化必须经单库真实读取核对');
    assert.deepEqual([...new Set(reads.map(read => read.repositoryId))], [repositoryId], '保存不能触发全目录或其他代码库状态读取');
    assert.ok(reads.length <= 6, '少量连续保存应合并为有界读取：' + JSON.stringify(reads));
  };
  const settledDiff = async (text: string) => {
    await diff().getByText(text, {exact: false}).waitFor();
    await sourceControl().locator('.source-control-diff > .source-control-read-status').waitFor({state: 'hidden'});
  };
  const fullText = async (text: string) => {
    // Use the same pinned CodeMirror view lookup as code-editor-assertions.ts:
    // the full document is virtualized and need not all be present in the DOM.
    await page.waitForFunction((expected: string) => {
      const content = document.querySelector('.source-control-full-file .cm-content');
      const view = (content as any)?.cmTile?.root?.view;
      return view?.state.doc.toString() === expected && view.state.readOnly;
    }, text);
  };
  const selectWorktree = async (repositories: any, member: any) => {
    const repository = repositories.repositories.find((item: any) => item.id === member.repositoryId);
    assert.ok(repository);
    const repositorySelect = page.locator('.code-root-selectors .ant-select').nth(0);
    await repositorySelect.getByRole('combobox').focus();await repositorySelect.getByRole('combobox').press('ArrowDown');
    const repositoryListId = await repositorySelect.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has: page.locator('[id="' + repositoryListId + '"]')}).getByText(codeRepositoryCode(repository), {exact: true}).click();
    await repositorySelect.getByRole('combobox').press('Escape');
    const worktreeSelect = page.locator('.code-root-selectors .ant-select').nth(1);
    await worktreeSelect.locator('.ant-select-selector').click();
    const worktreeListId = await worktreeSelect.getByRole('combobox').getAttribute('aria-controls');
    await page.locator('.ant-select-dropdown').filter({has: page.locator('[id="' + worktreeListId + '"]')}).locator('[data-code-worktree-id="' + member.id + '"]').click();
    await worktreeSelect.getByRole('combobox').press('Escape');
  };

  await scenario('自动刷新：未打开源代码管理时外部保存更新入口、文件和祖先提示且只读取受影响库', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.liveRefresh.removeUntrackedKeep();
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto(workspaceUrl + '/code/explorer');
      await page.locator('.repository-root-name').first().waitFor();
      assert.equal(await sourceControl().count(), 0, '本次页面从资源管理器开始，尚未打开源代码管理');
      const response = await page.request.get(api + '/code/repositories');
      assert.equal(response.status(), 200);
      const repositories = await response.json();
      const member = repositories.worktrees.find((item: any) => item.path === branches.location);
      assert.ok(member);
      await selectWorktree(repositories, member);
      await page.getByRole('textbox', {name: '搜索文件', exact: true}).click();
      const root = page.locator('.repository-root-name[data-repository-id="' + member.repositoryId + '"]');
      await root.waitFor();
      const rootNode = root.locator('xpath=ancestor::*[contains(@class,"ant-tree-treenode")][1]');
      if (await rootNode.getAttribute('aria-expanded') !== 'true') await root.click();
      const directory = page.locator('.repository-tree-body .ant-tree-title').filter({hasText: /^scm-browser-branches$/u});
      await directory.waitFor();
      await directory.click();
      const file = page.locator('.repository-tree-file[data-file-path="' + branches.liveRefresh.path + '"]');
      await file.waitFor();
      assert.equal(await file.locator('.repository-status').count(), 0, '目标文件原先没有未提交标记');
      assert.equal(await page.locator('.repository-tree-directory[data-directory-path="scm-browser-branches"][data-has-changes="true"]').count(), 0, '目标文件的目录原先没有改动提示');
      // This shared fixture already contains other changes. The circle may be
      // present initially, so the new file/ancestor marks and local read prove
      // propagation rather than treating an existing circle as a transition.
      await catalog();
      const requests = readRequests();
      try {
        branches.liveRefresh.write(longText(41));
        await page.locator('.repository-tree-file[data-file-path="' + branches.liveRefresh.path + '"][data-code-status="M"]').waitFor();
        await page.locator('.shell-navigation [data-nav="source-control"][data-has-changes="true"] .shell-nav-change-dot').waitFor();
        await page.locator('.repository-tree-directory[data-directory-path="scm-browser-branches"][data-has-changes="true"] .repository-directory-change-dot').waitFor();
        assert.equal(await root.getAttribute('data-has-changes'), 'true', '同一资源树根也显示后代变化');
        assertLocalReads(requests.reads, member.repositoryId);
        assert.equal(await sourceControl().count(), 0, '状态传播无需挂载源代码管理页面');
        await capture(page, 'source-control-live-refresh-explorer.png');
        await page.locator('.shell-navigation [data-nav="source-control"]').click();
        const source = identify(await catalog(), branches.location);
        await sourceControl().locator('[data-source-repository="' + source.repository.id + '"] [data-source-worktree="' + source.worktree.worktreeId + '"] .source-control-repository-copy').click();
        await changedRow(source.worktree.worktreeId, branches.liveRefresh.path).click();
        await settledDiff('liveRefreshLine1 = 41');
      } finally {requests.dispose();}
    });
  });

  await scenario('自动刷新：目录刷新按路径收敛，连续保存不扫描收起目录且整体删除无幽灵目录', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.liveRefresh.removeUntrackedKeep();branches.liveRefresh.prepareDirectoryCache();
      await page.setViewportSize({width:1440,height:900});
      await page.goto(workspaceUrl+'/code/explorer');
      await page.locator('.repository-root-name').first().waitFor();
      const response=await page.request.get(api+'/code/repositories');assert.equal(response.status(),200);
      const repositories=await response.json(),member=repositories.worktrees.find((item:any)=>item.path===branches.location);
      assert.ok(member);
      await selectWorktree(repositories,member);
      await page.getByRole('textbox',{name:'搜索文件',exact:true}).click();
      const root=page.locator('.repository-root-name[data-repository-id="'+member.repositoryId+'"]');
      const rootNode=root.locator('xpath=ancestor::*[contains(@class,"ant-tree-treenode")][1]');
      if(await rootNode.getAttribute('aria-expanded')!=='true')await root.click();
      const directory=(path:string)=>page.locator('.repository-tree-directory[data-directory-path="'+path+'"]');
      const expand=async(path:string)=>{
        const row=directory(path);await row.waitFor();
        if(await row.locator('xpath=ancestor::*[contains(@class,"ant-tree-treenode")][1]').getAttribute('aria-expanded')!=='true')await row.click();
      };
      await expand('scm-browser-branches');await expand(branches.liveRefresh.cachePath);
      for(let index=0;index<8;index++){
        const path=branches.liveRefresh.cachePath+'/other-'+index;await expand(path);
        await page.locator('.repository-tree-file[data-file-path="'+path+'/file.ts"]').waitFor();
      }
      await directory(branches.liveRefresh.cachePath).click();
      await page.locator('.repository-tree-file[data-file-path="'+branches.liveRefresh.path+'"]').click();
      const explorerText=async(text:string)=>page.waitForFunction((expected:string)=>{
        const content=document.querySelector('.code-explorer-stage .cm-content');
        return (content as any)?.cmTile?.root?.view?.state.doc.toString()===expected;
      },text);
      branches.liveRefresh.write(longText(71));await explorerText(longText(71));
      const reads:Array<{repositoryId:string|null;checkoutId:string|null;path:string}>=[];
      const observe=(request:any)=>{
        const url=new URL(request.url());
        if(url.pathname===new URL(api).pathname+'/code/directory')reads.push({repositoryId:url.searchParams.get('repositoryId'),checkoutId:url.searchParams.get('checkoutId'),path:url.searchParams.get('filePath')||''});
      };
      page.on('request',observe);
      assert.ok(expectedBrowserErrors instanceof Set, '宿主必须提供精确浏览器错误登记');
      // Deleting the directory outside the product makes its own reconciliation read
      // disappear while it runs, so only reads for the just-removed subtree may be
      // invalidated, and the window stays open until every such read has ended.
      const removed=branches.liveRefresh.createdDirectory;let accepted=false,removedInFlight=0;const unexpectedDirectoryReads:unknown[]=[],directoryChecks=new Set<Promise<void>>();
      const countsRemoved=(request:any)=>{const url=new URL(request.url());const filePath=url.searchParams.get('filePath');return url.pathname===new URL(api).pathname+'/code/directory'&&(filePath===removed||filePath?.startsWith(removed+'/'));};
      const onStart=(request:any)=>{if(countsRemoved(request))removedInFlight++;};
      const onEnd=(request:any)=>{if(countsRemoved(request))removedInFlight--;};
      const observeDirectory=(response:any)=>{
        if(!accepted||response.status()!==404||!countsRemoved(response.request()))return;
        const check=(async()=>{
          const body=await response.json().catch(()=>null);
          if(body?.error?.code==='code_file_missing')expectedBrowserErrors.add('['+response.url()+']: Failed to load resource: the server responded with a status of 404 (Not Found)');
          else unexpectedDirectoryReads.push({url:response.url(),body});
        })();
        directoryChecks.add(check);void check.finally(()=>directoryChecks.delete(check));
      };
      page.on('request',onStart);page.on('requestfinished',onEnd);page.on('requestfailed',onEnd);page.on('response',observeDirectory);
      try{
        branches.liveRefresh.write(longText(72));await explorerText(longText(72));
        branches.liveRefresh.write(longText(73));await explorerText(longText(73));
        assert.deepEqual(reads,[],'同路径连续保存只更新当前正文，已经访问后收起的8个目录不重读');
        branches.liveRefresh.createDirectory();
        await directory(branches.liveRefresh.createdDirectory).waitFor();
        assert.ok(reads.length>0,'外部新增目录必须自动核对父目录');
        assert.ok(reads.every(read=>read.repositoryId===member.repositoryId&&read.checkoutId===member.id&&['','scm-browser-branches'].includes(read.path)),JSON.stringify(reads));
        await expand(branches.liveRefresh.createdDirectory);await expand(branches.liveRefresh.createdDirectory+'/nested');
        await page.locator('.repository-tree-file[data-file-path="'+branches.liveRefresh.createdFile+'"][data-code-status="U"]').waitFor();
        reads.length=0;
        accepted=true;
        branches.liveRefresh.removeDirectory();
        await directory(branches.liveRefresh.createdDirectory).waitFor({state:'hidden'});
        await page.locator('.repository-tree-file[data-file-path="'+branches.liveRefresh.createdFile+'"]').waitFor({state:'hidden'});
        await page.waitForFunction(()=>!document.querySelector('.repository-tree-body .ant-tree-treenode-motion'));
        assert.equal(await page.locator('.repository-tree-file[data-file-path="'+branches.liveRefresh.createdFile+'"]').count(),0,'被删除目录的后代缓存不能合成幽灵父目录');
        assert.ok(reads.length>0,'整体删除必须自动核对父目录');
        assert.ok(reads.every(read=>read.repositoryId===member.repositoryId&&read.checkoutId===member.id&&['','scm-browser-branches',branches.liveRefresh.createdDirectory,branches.liveRefresh.createdDirectory+'/nested'].includes(read.path)),JSON.stringify(reads));
        await explorerText(longText(73));
        await capture(page,'source-control-live-refresh-directory-scope.png');
        console.log('[live-refresh-directory-reads]',JSON.stringify({samePathSaves:0,removedDirectory:reads}));
      }finally{
        for(let attempt=0;attempt<200&&removedInFlight>0;attempt++)await new Promise(resolve=>setTimeout(resolve,25));
        page.off('request',onStart);page.off('requestfinished',onEnd);page.off('requestfailed',onEnd);page.off('response',observeDirectory);
        page.off('request',observe);
        await Promise.all([...directoryChecks]);
        assert.equal(removedInFlight,0,'删除目录后仍有未结束的目录读取，竞态窗口无法判定');
        assert.deepEqual(unexpectedDirectoryReads,[],'只有被删除目录子树的读取可以被外部删除作废');
      }
    });
  });

  await scenario('自动刷新：已修改文件再次保存保留差异滚动、选择、展开及提交草稿', async () => {
    await fixture.withBranches(async (branches: any) => {
      branches.liveRefresh.write(longText(51));
      await page.setViewportSize({width: 1440, height: 900});
      const {repository, worktree} = await openWorktree(branches);
      const file = changedRow(worktree.worktreeId, branches.liveRefresh.path);
      await file.click(); await settledDiff('liveRefreshLine1 = 51');
      await sourceControl().locator('.task-diff-actions').getByText('上下对比', {exact: true}).click();
      const editor = sourceControl().locator('.file-diff-editor:visible');
      const current = editor.locator('.file-diff-current .cm-content[aria-label="当前文件编辑器"]');
      const editorText = (text: string) => page.waitForFunction((expected: string) => {
        const content = document.querySelector('.code-source-control-page:not([hidden]) .file-diff-current .cm-content');
        const view = (content as any)?.cmTile?.root?.view;
        return view?.state.doc.toString() === expected && !view.state.readOnly && view.contentDOM.contentEditable === 'true';
      }, text);
      await editorText(longText(51));
      const fileId = await editor.getAttribute('data-file-id'); assert.ok(fileId, '目标必须连接真实可编辑文件身份');
      // 统一更改差异以最近一次提交（HEAD）为比较基线，用显式提交层读取完整基线正文。
      const baselineResponse = await page.request.get(api + '/code/source-file?' + new URLSearchParams({repositoryId: repository.id, worktreeId: worktree.worktreeId, filePath: branches.liveRefresh.path, area: 'commit', commitHash: worktree.head}));
      assert.equal(baselineResponse.status(), 200);
      const baseline = await baselineResponse.json(); assert.equal(baseline.source.checkoutId, worktree.worktreeId);
      const scroller = editor.locator('.file-diff-current .cm-scroller');
      const draft = sourceControl().getByRole('textbox', {name: '提交说明内容', exact: true});
      const message = 'feat: 自动更新期间保留用户正在输入的说明\n\n这段草稿尚未提交。';
      await draft.fill(message);
      const inputPosition = await draft.evaluate((element: HTMLTextAreaElement) => {element.setSelectionRange(7, 15); return {start: element.selectionStart, end: element.selectionEnd};});
      const editorSelection = await current.evaluate((content: HTMLElement) => {
        const view = (content as any).cmTile.root.view; view.dispatch({selection: {anchor: 7, head: 15}});
        return {from: view.state.selection.main.from, to: view.state.selection.main.to};
      });
      const originalScroll = await scroller.evaluate((element: HTMLElement) => {element.scrollTop = Math.min(720, element.scrollHeight - element.clientHeight); return element.scrollTop;});
      assert.ok(originalScroll > 200, '测试必须处于实际已滚动的长差异');
      const expanded = await sourceControl().locator('[data-area-toggle="working"]').getAttribute('aria-expanded');
      const otherPositions = branches.otherPositions(branches.location);
      const requests = readRequests();
      assert.ok(expectedBrowserErrors instanceof Set, '宿主必须提供精确浏览器错误登记');
      let restoreWindow = false;
      const restoreDiffUrl = api + '/code/diff?' + new URLSearchParams({repositoryId: repository.id, worktreeId: worktree.worktreeId, filePath: branches.liveRefresh.path, area: 'working'});
      const readChecks = new Set<Promise<void>>(), unexpectedReads: unknown[] = [];
      const observeComparison = (response: any) => {
        if (!new URL(response.url()).pathname.endsWith('/code/diff') || response.status() < 400) return;
        const duringRestore = restoreWindow;
        const check = (async () => {
          const body = await response.json().catch(() => null);
          // External restore can finish before the observed change-list row disappears.
          // Only this exact old comparison may reject that racing read; the file,
          // zero-diff editor, inputs and cross-source continuation are still required.
          const expected = response.status() === 404 && body?.error?.code === 'code_changed_file_missing'
            || response.status() === 409 && body?.error?.code === 'code_source_changed';
          if (duringRestore && response.url() === restoreDiffUrl && expected) {
            expectedBrowserErrors.add('[' + restoreDiffUrl + ']: Failed to load resource: the server responded with a status of ' + (response.status() === 404 ? '404 (Not Found)' : '409 (Conflict)'));
          } else unexpectedReads.push({duringRestore, status:response.status(), url:response.url(), body});
        })();
        readChecks.add(check); void check.finally(() => readChecks.delete(check));
      };
      page.on('response', observeComparison);
      try {
        // The pathname, status and file count remain unchanged. Only current
        // contents change, which catches status-list-only invalidation.
        branches.liveRefresh.write(longText(52));
        await editorText(longText(52));
        assert.equal(await draft.inputValue(), message);
        assert.deepEqual(await draft.evaluate((element: HTMLTextAreaElement) => ({start: element.selectionStart, end: element.selectionEnd})), inputPosition);
        assert.ok(Math.abs(await scroller.evaluate((element: HTMLElement) => element.scrollTop) - originalScroll) <= 2, '同一文件自动更新保留差异阅读位置');
        assert.deepEqual(await current.evaluate((content: HTMLElement) => {const selection = (content as any).cmTile.root.view.state.selection.main; return {from: selection.from, to: selection.to};}), editorSelection, '自动更新保留可编辑正文选择');
        assert.equal(await sourceControl().locator('[data-area-toggle="working"]').getAttribute('aria-expanded'), expanded);
        assert.ok((await file.locator('xpath=..').getAttribute('class') || '').includes('is-selected'));
        // The single-repository verification read can trail the in-place diff
        // refresh; wait briefly instead of treating a slow notice as a missing read.
        for (let attempt = 0; attempt < 100 && !requests.reads.some(read => read.repositoryId === repository.id); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
        assertLocalReads(requests.reads, repository.id);
        assert.deepEqual(branches.otherPositions(branches.location), otherPositions, '自动观察不改变其他目录或索引');
        await capture(page, 'source-control-live-refresh-draft-scroll.png');
        requests.reset();
        await sourceControl().getByRole('button', {name: '查看完整文件', exact: true}).click();
        await fullText(longText(52));
        const fullScroller = sourceControl().locator('.source-control-full-file .cm-scroller');
        const fullScroll = await fullScroller.evaluate(async (element: HTMLElement) => {element.scrollTop = 520; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return element.scrollTop;});
        assert.ok(fullScroll > 200, '全文也必须处于实际滚动位置');
        branches.liveRefresh.write(longText(53));
        await fullText(longText(53));
        assert.equal(await draft.inputValue(), message, '全文自动更新保留提交草稿');
        assert.ok(Math.abs(await fullScroller.evaluate(async (element: HTMLElement) => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return element.scrollTop;}) - fullScroll) <= 2, '全文自动更新保留阅读位置');
        assertLocalReads(requests.reads, repository.id);
        await sourceControl().getByRole('button', {name: '返回差异', exact: true}).click();
        await editorText(longText(53));
        const beforeRestore = await scroller.evaluate((element: HTMLElement) => element.scrollTop);
        const selectionBeforeRestore = await current.evaluate((content: HTMLElement) => {const selection = (content as any).cmTile.root.view.state.selection.main; return {from: selection.from, to: selection.to};});
        requests.reset();
        restoreWindow = true;
        branches.liveRefresh.restore();
        await file.waitFor({state: 'hidden'});
        await editorText(baseline.content);
        await editor.locator('.file-diff-position[data-diff-count="0"]').waitFor();
        assert.equal(await file.count(), 0);
        assert.equal(await sourceControl().locator('.source-control-change-area .task-changed-list > li.is-selected').count(), 0, '文件退出列表不能自动选中其他文件');
        assert.equal(await editor.getAttribute('data-file-id'), fileId, '清单行消失后继续同一可编辑当前文件');
        assert.equal(await sourceControl().getByLabel('完整绝对路径', {exact: true}).innerText(), branches.location + '/' + branches.liveRefresh.path, '阅读仍对应原工作树的原文件');
        assert.equal(await editor.locator('.file-diff-position').getAttribute('data-diff-index'), '0', '零处变化没有当前差异');
        assert.equal(await editor.getByRole('button', {name: '上一个差异', exact: true}).isEnabled(), false);
        assert.equal(await editor.getByRole('button', {name: '下一个差异', exact: true}).isEnabled(), false);
        assert.deepEqual(await current.evaluate((content: HTMLElement) => {const selection = (content as any).cmTile.root.view.state.selection.main; return {from: selection.from, to: selection.to};}), selectionBeforeRestore, '恢复后仍有效的正文选择保持');
        const restoredScroll = await scroller.evaluate(async (element: HTMLElement) => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return {top: element.scrollTop, maximum: Math.max(0, element.scrollHeight - element.clientHeight)};});
        assert.ok(Math.abs(restoredScroll.top - Math.min(beforeRestore, restoredScroll.maximum)) <= 2, '正文缩短时阅读位置只按实际高度限制，不切换文件或重置仍有效的位置');
        assert.equal(await draft.inputValue(), message);
        assert.deepEqual(await draft.evaluate((element: HTMLTextAreaElement) => ({start: element.selectionStart, end: element.selectionEnd})), inputPosition, '文件退出列表保持提交草稿选择');
        assertLocalReads(requests.reads, repository.id);
        restoreWindow = false;
        await capture(page, 'source-control-live-refresh-file-left.png');
        const other = identify(await catalog(), fixture.location);
        assert.notEqual(other.worktree.worktreeId, worktree.worktreeId, '跨源回归必须切换真实工作树');
        const otherGroup = sourceControl().locator('[data-source-repository="' + other.repository.id + '"]');
        await otherGroup.locator('> .source-control-repository .source-control-repository-copy').click();
        await changedRow(other.worktree.worktreeId, fixture.path).click();
        await editorText(fixture.workingText);
        assert.notEqual(await editor.getAttribute('data-file-id'), fileId, 'B必须实际打开另一文件，覆盖最近观察来源');
        assert.equal(await sourceControl().getByLabel('完整绝对路径', {exact: true}).innerText(), other.worktree.location + '/' + fixture.path);
        await sourceControl().locator('[data-source-worktree="' + worktree.worktreeId + '"] .source-control-repository-copy').click();
        await editorText(baseline.content);
        await editor.locator('.file-diff-position[data-diff-count="0"]').waitFor();
        assert.equal(await editor.getAttribute('data-file-id'), fileId, '经过B实际文件阅读后，A归零文件仍按原身份接续');
        assert.equal(await sourceControl().getByLabel('完整绝对路径', {exact: true}).innerText(), branches.location + '/' + branches.liveRefresh.path);
        assert.equal(await file.count(), 0, '回到A不能伪造已经退出的变更行');
        assert.deepEqual(await current.evaluate((content: HTMLElement) => {const selection = (content as any).cmTile.root.view.state.selection.main; return {from: selection.from, to: selection.to};}), selectionBeforeRestore, '跨源返回继续A的正文选择');
        assert.ok(Math.abs(await scroller.evaluate(async (element: HTMLElement) => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); return element.scrollTop;}) - restoredScroll.top) <= 2, '跨源返回继续A的实际阅读位置');
        assert.equal(await draft.inputValue(), message, '跨源返回继续A的提交草稿');
        assert.deepEqual(await draft.evaluate((element: HTMLTextAreaElement) => ({start: element.selectionStart, end: element.selectionEnd})), inputPosition, '跨源返回继续A的草稿选择');
        await current.fill(baseline.content + '// undo remains available\n');
        await editorText(baseline.content + '// undo remains available\n');
        await current.press('ControlOrMeta+z');
        await editorText(baseline.content);
        assert.equal(await editor.getAttribute('data-file-id'), fileId, '归零文件跨源接续后撤销仍作用于同一文件');
        await editor.locator('.file-diff-position[data-diff-count="0"]').waitFor();
        await capture(page, 'source-control-live-refresh-clean-file-return.png');
      } finally {
        restoreWindow = false; await Promise.all([...readChecks]);
        page.off('response', observeComparison); requests.dispose();
        assert.deepEqual(unexpectedReads, [], '仅外部恢复窗口内原比较的精确404/409属于合法旧观察，其他读取错误必须失败');
      }
    });
  });

  await scenario('自动刷新：外部提交更新历史列表但保留固定提交与文件阅读', async () => {
    await fixture.withBranches(async (branches: any) => {
      await page.setViewportSize({width: 1440, height: 900});
      const {repository, worktree} = await openWorktree(branches);
      await selectSourceControlView(sourceControl(), 'history');
      const selected = sourceControl().locator('.source-control-graph > li[data-source-commit="' + branches.second + '"]');
      await selected.getByRole('button', {name: '查看提交 filter shared second author', exact: true}).click();
      await selected.locator('.task-changed-row').filter({has: page.locator('.task-changed-path[data-file-path="' + branches.historyPath + '"]')}).click();
      await settledDiff('branchHistory = 2');
      const current = branches.observe(branches.location);
      const otherPositions = branches.otherPositions(branches.location);
      const committed = branches.liveRefresh.commit('feat: external live refresh commit', 'export const branchHistory = 61;\n');
      assert.notEqual(committed, current.head);
      await sourceControl().locator('.source-control-graph > li[data-source-commit="' + committed + '"]').waitFor();
      assert.ok((await selected.getAttribute('class') || '').includes('is-selected'), '新提交不改变已选历史提交');
      assert.equal(await selected.getByRole('button', {name: '查看提交 filter shared second author', exact: true}).getAttribute('aria-expanded'), 'true');
      assert.ok((await diff().innerText()).includes('branchHistory = 2'), '阅读内容仍属于固定历史提交');
      assert.equal(await sourceControl().locator('[data-source-repository="' + repository.id + '"] [data-source-worktree="' + worktree.worktreeId + '"] .source-control-worktree.is-selected').count(), 1, '当前工作树选择保持');
      assert.deepEqual(branches.otherPositions(branches.location), otherPositions, '外部提交只改变指定独立目录');
      await capture(page, 'source-control-live-refresh-fixed-history.png');
    });
  });
}
