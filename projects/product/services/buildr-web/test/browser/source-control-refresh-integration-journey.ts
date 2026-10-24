import { showPrimaryNavigation } from './primary-navigation-controls.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Real inventory, Git observations and external file writes share the isolated host fixture. */
export async function runSourceControlRefreshIntegrationJourney({t,page,workspaceUrl,capture,fixture,scenario=(name:string,action:()=>Promise<void>)=>t.test(name,action)}:any) {
  const api=workspaceUrl.replace('/workspaces/','/api/v1/workspaces/');
  const statusPath=new URL(api+'/code/source-control').pathname;
  const scm=()=>page.locator('.code-source-control-page:visible');
  const explorer=()=>page.locator('.code-explorer-stage:visible');
  const handled=(promise:Promise<any>)=>promise.then(value=>({value}),error=>({error}));
  const result=async(promise:Promise<any>)=>{const outcome=await promise;if(outcome.error)throw outcome.error;return outcome.value;};
  const read=async(operation:string,input:Record<string,string>={})=>{
    const response=await page.request.get(api+'/code/'+operation+'?'+new URLSearchParams(input));assert.equal(response.status(),200);return response.json();
  };

  await scenario('刷新集成：首库等待时快库再次外部保存仍局部更新，默认来源不抢且待查无误报',async()=>{
    const before=await read('source-control'),first=before.repositories[0];
    const fast=before.repositories.find((repository:any,index:number)=>index>0&&repository.worktrees.some((tree:any)=>tree.isRegistered&&tree.available));
    assert.ok(first&&fast,'需要按真实登记顺序提供两个代码库');
    const firstTree=first.worktrees.find((tree:any)=>tree.isRegistered),fastTree=fast.worktrees.find((tree:any)=>tree.isRegistered);assert.ok(firstTree&&fastTree);
    assert.equal(fs.realpathSync(fastTree.location),fs.realpathSync(fixture.unavailableRepositoryLocation),'只能修改隔离夹具的第二个代码库');
    const filePath='src/main.ts',selector={kind:'code',repositoryId:fast.id,checkoutId:fastTree.worktreeId,filePath};
    const originalFile=await read('editor-file',selector);assert.equal(originalFile.rootPath,fastTree.location);
    const fileLocation=path.join(originalFile.rootPath,filePath),originalBytes=fs.readFileSync(fileLocation);
    assert.equal(originalBytes.toString('utf8'),originalFile.content);
    let release=()=>{},released=false;const gate=new Promise<void>(resolve=>{release=()=>{released=true;resolve();};});
    const status=(url:URL,repositoryId:string)=>url.pathname===statusPath&&url.searchParams.get('repositoryId')===repositoryId;
    const delayed=async(route:any)=>{if(status(new URL(route.request().url()),first.id))await gate;await route.continue();};
    await page.route((url:URL)=>url.pathname===statusPath,delayed);
    const firstStarted=handled(page.waitForRequest((request:any)=>status(new URL(request.url()),first.id)));
    const fastReturned=handled(page.waitForResponse((response:any)=>status(new URL(response.url()),fast.id)&&response.status()===200));
    const firstButton=()=>scm().locator('[data-source-repository="'+first.id+'"] > .source-control-repository .source-control-repository-copy');
    const fastButton=()=>scm().locator('[data-source-repository="'+fast.id+'"] > .source-control-repository .source-control-repository-copy');
    const waitingDefault=async()=>{
      assert.equal(released,false);assert.equal(await firstButton().isDisabled(),true,'首登记库尚未完成，不能冒充可选来源');
      assert.equal(await fastButton().isDisabled(),false,'快库完成后立即提供实际状态');
      assert.equal(await scm().locator('.source-control-repository-copy[aria-pressed="true"]').count(),0,'首库待查时后库不抢占默认详情');
      assert.equal(await scm().locator('.source-control-reader > .ant-alert-warning').count(),0,'正在读取的登记骨架不是失败或部分读取警告');
    };
    try{
      await page.setViewportSize({width:1440,height:900});await page.goto(workspaceUrl+'/code/source-control');
      await result(firstStarted);const initial=await(await result(fastReturned)).json();
      let observed=initial.repositories.find((repository:any)=>repository.id===fast.id).worktrees.find((tree:any)=>tree.worktreeId===fastTree.worktreeId);
      await page.waitForFunction((id:string)=>!!document.querySelector('[data-source-repository="'+id+'"] > .source-control-repository .source-control-repository-copy:not(:disabled)'),fast.id);
      await waitingDefault();
      await showPrimaryNavigation(page, 'code');await page.locator('.primary-secondary-navigation:visible [data-nav="explorer"]').click();await explorer().locator('.repository-root-name').first().waitFor();
      assert.equal(await explorer().locator('[data-code-notice-kind="status"]').count(),0,'未完成的inventory不制造状态读取失败');
      assert.equal(await explorer().getByText('部分内容不可读取',{exact:true}).count(),0);
      await showPrimaryNavigation(page, 'code');await page.locator('.primary-secondary-navigation:visible [data-nav="source-control"]').click();await scm().waitFor();await waitingDefault();

      const reads:string[]=[];
      const count=(request:any)=>{const url=new URL(request.url());if(status(url,fast.id))reads.push(request.url());};page.on('request',count);
      try{
        for(const version of [701,702]){
          const previousRevision=observed.observedRevision,previousCount=observed.fileCount,start=reads.length;
          const changed=handled(page.waitForResponse(async(response:any)=>{
            if(!status(new URL(response.url()),fast.id)||response.status()!==200)return false;
            const value=await response.json(),tree=value.repositories.find((repository:any)=>repository.id===fast.id)?.worktrees.find((tree:any)=>tree.worktreeId===fastTree.worktreeId);
            return Boolean(tree&&tree.observedRevision!==previousRevision&&tree.changes.some((file:any)=>file.path===filePath));
          }));
          const text=originalFile.content+'\nexport const progressiveRefreshExternal = '+version+';\n';fs.writeFileSync(fileLocation,text);
          const response=await result(changed),value=await response.json();observed=value.repositories.find((repository:any)=>repository.id===fast.id).worktrees.find((tree:any)=>tree.worktreeId===fastTree.worktreeId);
          assert.ok(reads.length>start&&reads.length-start<=3,'快库连续写入有界补查，不能等待首库完成或无限自触发');
          assert.notEqual(observed.observedRevision,previousRevision);if(version===702)assert.equal(observed.fileCount,previousCount,'已有修改再次保存不能只按数量去重');
          const file=await read('editor-file',selector);assert.equal(file.fileId,originalFile.fileId);assert.equal(file.content,text);
          await waitingDefault();await showPrimaryNavigation(page, 'code');assert.equal(await page.locator('.primary-secondary-navigation:visible [data-nav="source-control"]').getAttribute('data-has-changes'),'true');await page.keyboard.press('Escape');
        }
      }finally{page.off('request',count);}
      await capture(page,'source-refresh-integration-fast-updated-pending-first.png');
      release();await scm().locator('.source-control-workbench[data-current-repository="'+first.id+'"][data-current-checkout="'+firstTree.worktreeId+'"]').waitFor();
      assert.equal(await firstButton().getAttribute('aria-pressed'),'true','首库确认后默认使用其登记工作树，与完成顺序无关');
      await capture(page,'source-refresh-integration-registered-default.png');
    }finally{
      release();await page.unrouteAll({behavior:'wait'});await page.goto('about:blank');fs.writeFileSync(fileLocation,originalBytes);
    }
  });
}
