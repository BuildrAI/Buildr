import assert from 'node:assert/strict';

/** Exercises the production host against the layout journey's isolated workspace. */
export async function runWorkspacePaneJourney({ t, page, workspaceUrl, capture }: any) {
  await t.test('后台准备完成或失败后工作空间卡片自动更新，不要求打开空间', async () => {
    const id = new URL(workspaceUrl).pathname.split('/').at(-1)!;
    let state: 'preparing' | 'ready' | 'failed' = 'preparing';
    const handler = async (route:any) => {
      const response = await route.fetch();
      const body = await response.json();
      body.workspaces = body.workspaces.map((entry:any) => entry.workspace?.id === id
        ? {...entry, readiness:state, ...(state === 'failed' ? {error:{code:'workspace_preparation_failed',message:'本地定制需要确认，其他空间已继续刷新。'}} : {})} : entry);
      await route.fulfill({response, json:body});
    };
    const catalogUrl = new URL('/?catalog=1',workspaceUrl).href;
    await page.route('**/api/v1/workspaces',handler);
    try {
      await page.goto(catalogUrl);
      const card=page.locator(`[data-workspace-id="${id}"]`);
      await card.getByText('准备中',{exact:true}).waitFor();
      state='ready';
      await card.getByText('可用',{exact:true}).waitFor({timeout:10000});
      assert.equal(new URL(page.url()).pathname,'/','刷新结果不得自动进入工作空间');
      state='preparing';await page.reload();await card.getByText('准备中',{exact:true}).waitFor();
      state='failed';await card.getByText('待完成',{exact:true}).waitFor({timeout:10000});
      await card.getByText('本地定制需要确认，其他空间已继续刷新。',{exact:true}).waitFor();
      await capture(page,'background-workspace-refresh-result.png');
    } finally {
      await page.unroute('**/api/v1/workspaces',handler);
      await page.goto(`${workspaceUrl}/overview`);
      await page.locator('#workbench-overview').waitFor();
    }
  });
  const navigateWorkspace = async (name:string) => {
    await page.locator('.primary-navigation-rail [data-nav="workspace"]').hover();
    await page.locator('.primary-secondary-navigation:visible .shell-navigation').getByRole('link',{name,exact:true}).click();
  };
  await t.test('页面激活保持手动顺序并滚到可见，对象激活仍置首且来源独立', async () => {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(`${workspaceUrl}/projects/demo`);
    await page.locator('#project-detail-name:visible').waitFor();
    const middle = () => page.getByRole('tablist',{name:'打开的页面',exact:true});
    const names = (strip:any) => strip.locator('.pane-tab-text').allTextContents();
    const front = async (strip:any,title:string,previous:string[]) => {
      await strip.getByRole('tab',{name:title,exact:true}).click();
      await page.waitForFunction(({label,title}:any) => {
        const strip=[...document.querySelectorAll<HTMLElement>('[role="tablist"]')].find(node=>node.getAttribute('aria-label')===label&&node.getClientRects().length);
        return Boolean(strip&&strip.querySelector('.pane-tab-text')?.textContent===title&&strip.scrollLeft===0);
      },{label:await strip.getAttribute('aria-label'),title});
      assert.deepEqual(await names(strip),[title,...previous.filter(item=>item!==title)]);
    };
    for (const [title,path,tabTitle] of [['服务','services','服务目录'],['代码库','repositories','代码库目录'],['技能','skills','技能目录'],['文章','articles','文章'],['项目','projects','项目目录']]) {
      await navigateWorkspace(title);
      await page.waitForURL(`${workspaceUrl}/${path}`);
      await middle().getByRole('tab',{name:tabTitle,exact:true,selected:true}).waitFor();
    }
    await middle().evaluate((element:HTMLElement)=>{element.style.maxWidth='220px';element.scrollLeft=element.scrollWidth;});
    assert.ok(await middle().evaluate((element:HTMLElement)=>element.scrollWidth>element.clientWidth&&element.scrollLeft>0));
    const opened=await names(middle());
    await middle().getByRole('tab',{name:'演示项目',exact:true}).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    assert.deepEqual(await names(middle()),opened,'激活已经打开的页面不改变用户顺序');
    const demo=middle().getByRole('tab',{name:'演示项目',exact:true});
    const moved=[...opened];
    const demoIndex=moved.indexOf('演示项目');
    moved.splice(demoIndex,1);moved.splice(Math.min(demoIndex+1,moved.length),0,'演示项目');
    await demo.press('Alt+ArrowRight');
    await page.waitForFunction((expected:string[])=>JSON.stringify([...document.querySelectorAll('.workspace-tabstrip .pane-tab-text')].map(node=>node.textContent))===JSON.stringify(expected),moved);
    await demo.click();
    assert.deepEqual(await names(middle()),moved,'重复点击当前活动页面仍保留手动顺序');
    await middle().evaluate((element:HTMLElement)=>{element.scrollLeft=element.scrollWidth;});
    await demo.dispatchEvent('click');
    await page.waitForFunction(()=>{
      const strip=document.querySelector<HTMLElement>('.workspace-tabstrip');
      const active=strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if(!strip||!active)return false;
      const bounds=strip.getBoundingClientRect(),tab=active.getBoundingClientRect();
      return tab.left>=bounds.left-1&&tab.right<=bounds.right+1;
    });
    assert.deepEqual(await names(middle()),moved,'重复激活只让当前页签可见');
    await page.locator('[data-doc-row="readme"]:visible').click();
    await page.locator('.pane-right:visible .file-editing-pane:visible').waitFor();
    await page.locator('[data-doc-row="agents"]:visible').click();
    await page.locator('.pane-right:visible .markdown-body:visible').waitFor();
    await page.locator('[data-service-card="api"]:visible').click();
    await page.locator('#service-detail-name:visible').waitFor();
    const right=page.locator('.pane-right:visible').getByRole('tablist',{name:'打开的对象',exact:true});
    assert.deepEqual(await names(right),['服务详情','AGENTS.md','项目文档']);
    await right.evaluate((element:HTMLElement)=>{element.style.maxWidth='190px';element.scrollLeft=element.scrollWidth;});
    assert.ok(await right.evaluate((element:HTMLElement)=>element.scrollWidth>element.clientWidth&&element.scrollLeft>0));
    const middleBefore=await names(middle());
    await front(right,'项目文档',await names(right));
    await front(right,'AGENTS.md',await names(right));
    assert.deepEqual(await names(middle()),middleBefore,'右侧对象激活不重排中屏');
    const rightBefore=await names(right);
    await right.evaluate((element:HTMLElement)=>{element.scrollLeft=element.scrollWidth;});
    await right.getByRole('tab',{name:'AGENTS.md',exact:true}).dispatchEvent('click');
    assert.equal(await right.evaluate((element:HTMLElement)=>element.scrollLeft),0);
    await capture(page,'stable-page-order-active-object-first.png');
    await middle().getByRole('tab',{name:'服务目录',exact:true}).click();
    await page.waitForURL(`${workspaceUrl}/services`);
    await middle().getByRole('tab',{name:'演示项目',exact:true}).click();
    await page.waitForURL(`${workspaceUrl}/projects/demo`);
    await right.getByRole('tab',{name:rightBefore[0],exact:true}).waitFor({state:'visible'});
    assert.deepEqual(await names(right),rightBefore,'返回同来源页面保留对象激活顺序');
    await right.getByRole('button',{name:'关闭 AGENTS.md',exact:true}).click();
    await page.waitForFunction(()=>{
      const strip=[...document.querySelectorAll<HTMLElement>('[aria-label="打开的对象"]')].find(node=>node.getClientRects().length);
      return strip?.querySelector('[role="tab"]')?.getAttribute('aria-selected')==='true'&&strip.scrollLeft===0;
    });
    await page.reload();await page.locator('#project-detail-name:visible').waitFor();
    assert.deepEqual(await names(middle()),moved,'刷新后页面顺序保持，当前项不自动置首');
  });

  await t.test('固定页面可排序、关闭重开与刷新恢复，取消固定不关闭页面', async () => {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(`${workspaceUrl}/projects/demo`);
    await page.locator('#project-detail-name:visible').waitFor();
    const workspaceId=new URL(workspaceUrl).pathname.split('/').at(-1)!;
    const keys=[`buildr.web.page-tabs.${workspaceId}`,`buildr.web.pinned-page-tabs.${workspaceId}`];
    const saved=await page.evaluate((keys:string[])=>keys.map(key=>[key,localStorage.getItem(key)]),keys);
    const middle=()=>page.getByRole('tablist',{name:'打开的页面',exact:true});
    const names=()=>middle().locator('.pane-tab-text').allTextContents();
    const tab=(title:string)=>middle().getByRole('tab',{name:title,exact:true});
    const toggle=async(title:string,pinned:boolean,keyboard=false)=>{
      const button=middle().getByRole('button',{name:`${pinned?'取消固定':'固定'} ${title}`,exact:true});
      await tab(title).hover();
      if(keyboard)await button.press('Enter');else await button.click();
      await middle().getByRole('button',{name:`${pinned?'固定':'取消固定'} ${title}`,exact:true}).waitFor();
    };
    const waitForOrder=async(expected:string[])=>{
      await page.waitForFunction((expected:string[])=>JSON.stringify([...document.querySelectorAll('.workspace-tabstrip .pane-tab-text')].map(node=>node.textContent))===JSON.stringify(expected),expected);
    };
    try {
      await page.evaluate((keys:string[])=>keys.forEach(key=>localStorage.removeItem(key)),keys);
      await page.reload();await page.locator('#project-detail-name:visible').waitFor();
      for(const [title,path,tabTitle] of [['服务','services','服务目录'],['技能','skills','技能目录'],['项目','projects','项目目录']]){
        await navigateWorkspace(title);await page.waitForURL(`${workspaceUrl}/${path}`);
        await middle().getByRole('tab',{name:tabTitle,exact:true,selected:true}).waitFor();
      }
      await tab('演示项目').click();await page.waitForURL(`${workspaceUrl}/projects/demo`);
      const ordinary=await names();
      assert.deepEqual(ordinary,['演示项目','服务目录','技能目录','项目目录'],'新普通页面追加到末尾');
      await toggle('服务目录',false);
      assert.equal(page.url(),`${workspaceUrl}/projects/demo`,'固定另一个页面不切换当前页面');
      await toggle('技能目录',false);
      await waitForOrder(['服务目录','技能目录','演示项目','项目目录']);
      assert.equal(await middle().getByRole('button',{name:'取消固定 服务目录',exact:true}).getAttribute('aria-pressed'),'true');

      await tab('技能目录').press('Alt+ArrowLeft');
      await waitForOrder(['技能目录','服务目录','演示项目','项目目录']);
      await tab('演示项目').press('Alt+ArrowLeft');
      assert.deepEqual(await names(),['技能目录','服务目录','演示项目','项目目录'],'普通页面不能越过固定区');
      const skill=await tab('技能目录').boundingBox(),service=await tab('服务目录').boundingBox();
      assert.ok(skill&&service);
      await page.mouse.move(skill.x+skill.width/2,skill.y+skill.height/2);
      await page.mouse.down();
      await page.mouse.move(service.x+service.width-2,service.y+service.height/2,{steps:8});
      await page.mouse.up();
      await waitForOrder(['服务目录','技能目录','演示项目','项目目录']);
      await page.locator('.pane-tab-drag-ghost').waitFor({state:'hidden'});

      await middle().getByRole('button',{name:'关闭 服务目录',exact:true}).click();
      assert.equal(await tab('服务目录').count(),0);
      await page.reload();await page.locator('#project-detail-name:visible').waitFor();
      assert.deepEqual(await names(),['技能目录','演示项目','项目目录'],'刷新不重新打开已关闭的固定页面');
      await navigateWorkspace('服务');await page.waitForURL(`${workspaceUrl}/services`);
      await waitForOrder(['服务目录','技能目录','演示项目','项目目录']);
      assert.equal(await middle().getByRole('button',{name:'取消固定 服务目录',exact:true}).getAttribute('aria-pressed'),'true','关闭重开仍保留固定位置');
      await tab('演示项目').click();await page.waitForURL(`${workspaceUrl}/projects/demo`);
      assert.deepEqual(await names(),['服务目录','技能目录','演示项目','项目目录'],'日常切换不改变固定和普通区顺序');
      await capture(page,'pinned-page-tabs-restored.png');

      const reopenedContext=await page.context().browser().newContext({storageState:await page.context().storageState(),viewport:{width:1440,height:900}});
      const reopened=await reopenedContext.newPage();
      try {
        await reopened.goto(`${workspaceUrl}/projects/demo`);
        await reopened.locator('#project-detail-name:visible').waitFor();
        assert.deepEqual(await reopened.getByRole('tablist',{name:'打开的页面',exact:true}).locator('.pane-tab-text').allTextContents(),['服务目录','技能目录','演示项目','项目目录'],'新浏览器页面从持久偏好恢复固定顺序');
      } finally {await reopenedContext.close();}

      await toggle('服务目录',true,true);
      await waitForOrder(['技能目录','服务目录','演示项目','项目目录']);
      assert.equal(page.url(),`${workspaceUrl}/projects/demo`,'取消固定不关闭或切换页面');
      await tab('服务目录').click();await page.waitForURL(`${workspaceUrl}/services`);
      await middle().getByRole('button',{name:'关闭 服务目录',exact:true}).click();
      await navigateWorkspace('服务');await page.waitForURL(`${workspaceUrl}/services`);
      await middle().getByRole('tab',{name:'服务目录',exact:true,selected:true}).waitFor();
      assert.deepEqual(await names(),['技能目录','演示项目','项目目录','服务目录'],'取消固定后重开按普通页面追加');
      assert.equal(await middle().getByRole('button',{name:'固定 服务目录',exact:true}).getAttribute('aria-pressed'),'false');
    } finally {
      await page.evaluate((saved:[string,string|null][])=>saved.forEach(([key,value])=>value===null?localStorage.removeItem(key):localStorage.setItem(key,value)),saved);
      await page.goto(`${workspaceUrl}/projects/demo`);
      await page.locator('#project-detail-name:visible').waitFor();
    }
  });

  await t.test('共享中右内容区：暂看不导航，菜单恢复，局部展开保留实例和滚动', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${workspaceUrl}/projects`);
    await page.locator('#project-table-body').waitFor();
    await page.goto(`${workspaceUrl}/services/demo/api`);
    await page.waitForURL(`${workspaceUrl}/services`);
    await page.locator('.pane-right:visible #service-detail-name').waitFor();
    await page.getByRole('textbox', { name: '搜索服务', exact: true }).fill('演示');
    assert.equal(await page.locator('.pane-page-toggle').isDisabled(), false, '有对象页面的折叠按钮可用');
    await page.locator('.pane-page-toggle').click();
    const middle = page.locator('[data-prototype-position="page-rail"]');
    assert.ok(await middle.locator('.collapsed-pane-item').count() >= 2, '目录和已访问页面保留多个竖向标签');
    const projectsLabel = middle.getByRole('button', { name: '暂时查看项目目录', exact: true });
    await projectsLabel.hover();
    const peek = page.locator('[data-prototype-position="page-peek"]');
    await peek.waitFor({ state: 'visible' });
    assert.equal(page.url(), `${workspaceUrl}/services`, '悬停另一页面不提交导航');
    await peek.locator('.resource-directory:visible').waitFor();
    assert.equal(await page.locator('.pane-right:visible #service-detail-name').count(), 1, '暂看是页面预览，右栏仍绑定锚定页对象');
    await peek.getByRole('textbox', { name: '搜索项目', exact: true }).fill('演示');
    await page.keyboard.press('Escape');
    await peek.waitFor({ state: 'hidden' });
    await middle.getByRole('button', { name: '展开页面：服务目录', exact: true }).click();
    await middle.waitFor({ state: 'hidden' });
    assert.equal(page.url(), `${workspaceUrl}/services`, '展开暂看页面回到服务目录');
    await page.locator('.pane-right:visible #service-detail-name').waitFor();
    assert.equal(await page.locator('.pane-page-toggle').count(), 1, '展开后折叠按钮仍在固定槽位');
    await navigateWorkspace('服务');
    await page.locator('.pane-right:visible #service-detail-name').waitFor();
    assert.equal(await page.getByRole('textbox', { name: '搜索服务', exact: true }).inputValue(), '演示', '同路径菜单请求恢复原页面而不清空筛选');
    await page.locator('.pane-right:visible [data-doc-row="readme"]').click();
    const body = page.locator('.pane-right:visible > .pane-body');
    await body.getByRole('heading', { name: '布局阅读资料', exact: true }).waitFor();
    await body.evaluate((element: HTMLElement) => { element.scrollTop = 420; });
    await page.getByRole('button', { name: '收起页面', exact: true }).click();
    await body.hover();
    await page.mouse.wheel(0, 260);
    await page.waitForFunction(() => (document.querySelector('.pane-right > .pane-body')?.scrollTop || 0) > 420);
    const continued = await body.evaluate((element: HTMLElement) => element.scrollTop);
    await capture(page, 'layout-middle-pane-icon.png');
    await page.getByRole('button', { name: '展开页面', exact: true }).click();
    assert.ok(Math.abs(await body.evaluate((element: HTMLElement) => element.scrollTop) - continued) < 24, '中栏恢复不倒退右侧继续阅读的位置');
    const top = await body.evaluate((element: HTMLElement) => element.scrollTop);
    await page.getByRole('button', { name: '收起内容', exact: true }).click();
    const right = page.locator('[data-prototype-position="content-rail"]');
    const tab = right.locator('.collapsed-pane-item').first();
    await tab.locator('.collapsed-pane-label').hover();
    const contentPeek = page.locator('[data-prototype-position="content-peek"]');
    await contentPeek.waitFor({ state: 'visible' });
    await contentPeek.getByRole('heading', { name: '布局阅读资料', exact: true }).waitFor();
    assert.equal(page.url(), `${workspaceUrl}/services`);
    const bounds = await contentPeek.boundingBox();
    assert.ok(bounds && bounds.width <= 540 && bounds.x >= 0 && bounds.x + bounds.width <= 1441, '暂看浮窗有限宽且落在内容区内');
    assert.equal(await tab.locator('[data-icon="open-in-pane"]').count(), 1, '局部展开采用独立图标');
    assert.equal(await right.locator('.collapsed-pane-header [data-icon="open-in-pane"]').count(), 0, '顶部展开与局部展开图标有区别');
    await capture(page, 'layout-right-pane-icon.png');
    await tab.locator('.collapsed-pane-open').click();
    await right.waitFor({ state: 'hidden' });
    assert.ok(Math.abs(await body.evaluate((element: HTMLElement) => element.scrollTop) - top) < 24, '右栏收起、暂看、局部恢复保留文档滚动');
    await capture(page, 'layout-shared-pane-restored.png');
  });

  await t.test('共享右栏：在途保存、浮窗输入及撤销历史保留；同名标签按来源区分', async () => {
    await page.goto(`${workspaceUrl}/projects/demo`);
    await page.locator('[data-doc-row="readme"]').click();
    const firstPane = page.locator('.pane-right:visible .file-editing-pane:visible');
    await firstPane.waitFor();
    const fileId = await firstPane.getAttribute('data-file-id');
    const pane = page.locator(`.pane-right:visible .file-editing-pane[data-file-id=${JSON.stringify(fileId)}]`);
    await pane.locator('.file-editing-mode').getByText('编辑', { exact: true }).click();
    const editor = pane.locator('.cm-content[contenteditable="true"]');
    await editor.waitFor();
    const original = await editor.innerText();
    const handle = await editor.elementHandle();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const saveRoute = '**/code/save-file';
    await page.route(saveRoute, async (route: any) => { await held; await route.continue(); });
    try {
      await editor.press('ControlOrMeta+End');
      await page.keyboard.insertText('\n分屏草稿保留');
      await pane.locator('[data-prototype-position="save-status"]').getByText('保存中…', { exact: true }).waitFor();
      await page.getByRole('button', { name: '收起内容', exact: true }).click();
      const rail = page.locator('[data-prototype-position="content-rail"]');
      await rail.getByRole('button', { name: '暂时查看项目文档', exact: true }).click();
      await editor.waitFor({ state: 'visible' });
      assert.equal(await editor.evaluate((element: HTMLElement, prior: HTMLElement) => element === prior, handle), true, '收起和浮窗不重建编辑器');
      assert.match(await editor.innerText(), /分屏草稿保留/);
      await editor.press('ControlOrMeta+End');
      await page.keyboard.insertText('\n浮窗继续输入');
      await rail.getByRole('button', { name: '展开内容：项目文档', exact: true }).click();
      assert.match(await editor.innerText(), /浮窗继续输入/);
      await editor.press('ControlOrMeta+z');
      assert.doesNotMatch(await editor.innerText(), /浮窗继续输入/);
      assert.match(await editor.innerText(), /分屏草稿保留/);
      await editor.press('ControlOrMeta+Shift+z');
      assert.match(await editor.innerText(), /浮窗继续输入/);
      release();
      await pane.locator('[data-prototype-position="save-status"]').getByText('已保存', { exact: true }).waitFor();
      await navigateWorkspace('项目');
      await page.locator('#project-table-body tr').filter({ hasText: '另一项目' }).click();
      await page.waitForURL(`${workspaceUrl}/projects/other`);
      await page.locator('[data-doc-row="readme"]:visible').click();
      const tabs = page.locator('.pane-right:visible > .pane-tabstrip .pane-tab');
      assert.equal(await tabs.count(), 1, '右栏跟随中栏当前页面，只显示该页面对象');
      assert.match(await editor.innerText(), /浮窗继续输入/, '隐藏页面的对象内容保留实例与草稿');
      assert.notEqual(await editor.innerText(), original);
      await page.locator('.workspace-page-tabs .pane-tab').filter({ hasText: '演示项目' }).click();
      await page.waitForURL(`${workspaceUrl}/projects/demo`);
      assert.equal(await tabs.count(), 1, '切回来源页面恢复其对象标签');
      assert.match(await editor.innerText(), /浮窗继续输入/, '返回后同一编辑器实例仍在分屏');
      await page.getByRole('button', { name: '关闭 项目文档', exact: true }).first().click();
      await page.locator('.pane-right:visible').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.pane-left:visible').count(), 1, '最后资料关闭后中栏独占');
    } finally { release(); await page.unroute(saveRoute); await handle?.dispose(); }
  });
}
