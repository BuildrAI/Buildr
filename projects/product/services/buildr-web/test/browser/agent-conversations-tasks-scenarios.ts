import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** tasks 场景使用独立准备的对话现场。 */
export async function runTasksScenarios(fixture:AgentConversationFixture){
  const {assertFixed,capture,chooseAgent,chooseOption,closeConversation,connections,input,openDesktopConversation,page,panel,reopen,run,sentInputs,step,update,workspaceId,workspaceUrl}=fixture;
await step('已合并任务本地验证展示集成快检而非服务范围警示',async()=>{
  const matcher='**/service-runtime/tasks/browser-associated-task';
  await page.route(matcher,async(route:any)=>route.fulfill({json:{
    taskId:'browser-associated-task',title:'已合并任务',services:[],runs:[],diagnostics:[],
    integration:{checkedAt:new Date().toISOString(),complete:true,diagnostics:[],repositories:[
      {repositoryId:'repo',label:'业务代码库',branch:'dev',head:'a'.repeat(40),checked:2,contained:2,status:'contained',message:'已发现的关联提交均已包含在主工作库当前版本。'},
    ]},
  }}));
  try {
    await page.goto(workspaceUrl+'/tasks/browser-associated-task');
    await page.getByText('本地验证',{exact:true}).click();
    const runtime=page.locator('#task-local-runtime');
    await runtime.getByText('集成快检通过',{exact:true}).waitFor();
    assert.match(await runtime.innerText(),/业务代码库.*dev.*已包含 2\/2/s);
    assert.doesNotMatch(await runtime.innerText(),/任务尚未明确服务范围/);
    assert.equal(await runtime.getByRole('button',{name:'启动任务服务'}).isDisabled(),true);
    await capture(page,'task-integrated-quick-check.png');
  } finally { await page.unroute(matcher); }
});
await step('关联数量浮层零一多、跨空间同码前缀搜索及双向导航',async()=>{
  const taskId='browser-associated-task',remote=fixture.otherWorkspaceId;
  assert.ok(remote,'夹具必须提供第二个真实登记空间');
  const popup=()=>page.locator('.ac-association-popup.is-open:visible .ac-association-body');
  const taskEntry=()=>page.locator('[data-task-internal-conversations="'+taskId+'"]:visible');
  const taskButton=()=>taskEntry().getByRole('button',{name:'关联对话',exact:true});
  const conversationButton=()=>panel().getByRole('button',{name:'关联任务',exact:true});
  const waitConversation=async(id:string)=>await page.waitForFunction((value:string)=>document.querySelector('#agent-conversation-panel')?.getAttribute('data-conversation-id')===value,id);
  const waitTaskWorkspace=async(space:string)=>await page.waitForFunction((id:string)=>location.pathname.startsWith('/workspaces/'+id+'/tasks'),space);
  const waitTaskDetail=async(id:string)=>await page.waitForFunction((value:string)=>document.querySelector('#task-detail-main')?.getAttribute('data-task-id')===value,id);
  const linkedRow=(space:string)=>popup().locator('.ac-association-row').filter({has:page.locator('[data-associated-workspace="'+space+'"][data-associated-task="'+taskId+'"]')});
  fixture.holdTaskList=true;const started=new Promise<void>(resolve=>{fixture.taskListStarted=resolve;});
  await page.goto(workspaceUrl+'/tasks/'+taskId);await started;await taskButton().waitFor();
  assert.match(await taskButton().innerText(),/未确认/);assert.equal(await taskButton().isEnabled(),true);
  await taskButton().click();await popup().getByText('正在读取关联对话…',{exact:true}).waitFor();fixture.releaseTaskList!();
  await popup().getByText('暂无关联对话。',{exact:true}).waitFor();assert.match(await taskButton().innerText(),/0/);
  const before=fixture.creations,sends=fixture.sends;
  assert.equal(fixture.creations,before,'展开零项浮层不创建对话');
  await popup().getByRole('button',{name:'新建任务对话',exact:true}).click();await input().waitFor();
  assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(fixture.creations,before);
  assert.match(await conversationButton().innerText(),/1/);assert.equal((await panel().locator('.ac-location-meta').innerText()).includes(taskId),false,'主入口不常驻编码');
  await input().fill('跨空间关联的实际工作');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();
  assert.equal(fixture.creations,before+1);assert.equal(fixture.conversation.taskId,taskId);
  await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
  const originalId=fixture.conversation.id,cwd=fixture.conversation.cwd;
  const firstTitleSummaries=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/tasks/title-summaries'));
  await conversationButton().hover();await popup().getByText('已关联任务',{exact:true}).waitFor();
  await firstTitleSummaries;
  await page.keyboard.press('Escape');await popup().waitFor({state:'hidden'});
  const reopenedTitleSummaries=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/tasks/title-summaries'));
  await conversationButton().click();await popup().getByText('已关联任务',{exact:true}).waitFor();
  await reopenedTitleSummaries;
  const refreshedTitleSummaries=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/tasks/title-summaries'));
  await popup().getByRole('button',{name:'刷新关联信息',exact:true}).click();
  await refreshedTitleSummaries;
  const changedTitleSummaries=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/tasks/title-summaries'));
  await page.evaluate(()=>window.dispatchEvent(new Event('buildr-conversation-associations-changed')));
  await changedTitleSummaries;
  // Measure the final popup position, not its entering transform.
  await page.waitForFunction(([body,trigger]:HTMLElement[])=>body.getBoundingClientRect().bottom<=trigger.getBoundingClientRect().top+10,[await popup().elementHandle(),await conversationButton().elementHandle()],{timeout:10_000});
  const triggerBox=await conversationButton().boundingBox(),popupBox=await popup().boundingBox();assert.ok(popupBox!.y+popupBox!.height<=triggerBox!.y+10,'底部入口向上展开');
  const taskMatcher='**/api/v1/workspaces/'+workspaceId+'/tasks?**';let taskSearchPages=0;
  const taskPager=async(route:any)=>{
    const url=new URL(route.request().url());if(url.searchParams.get('status')!=='all'||url.searchParams.get('pageSize')!=='100')return route.fallback();
    taskSearchPages++;const cursor=url.searchParams.get('cursor');url.searchParams.delete('cursor');
    const response=await route.fetch({url:url.toString()}),body=await response.json();
    await route.fulfill({json:cursor?body:{...body,tasks:[],hasMore:true,nextCursor:'association-next'}});
  };
  await page.route(taskMatcher,taskPager);
  const search=popup().getByRole('combobox',{name:'搜索任务',exact:true});await search.focus();
  const settledHeight=async()=>{let last=-1;for(let index=0;index<40;index+=1){const height=Math.round((await popup().boundingBox())!.height);if(height===last)return height;last=height;await page.waitForTimeout(50);}return last;};
  const stableHeight=await settledHeight();
  await search.fill('b');await page.waitForTimeout(350);assert.equal(taskSearchPages,0,'单字符不请求搜索');
  await search.fill('browser-associated');
  await page.waitForFunction(()=>document.querySelectorAll('.ac-association-popup .ac-association-candidate').length===2);
  assert.equal(await settledHeight(),stableHeight,'候选不撑大外层浮窗');
  assert.equal(await popup().locator('.ac-association-options').evaluate((node:any)=>getComputedStyle(node).borderTopStyle),'solid');
  assert.equal(await popup().getByText('正在读取任务信息…',{exact:true}).count(),0);
  const metaBoxes=await panel().locator('.ac-location-meta>span').evaluateAll((nodes:any[])=>nodes.map(node=>{const r=node.getBoundingClientRect();return {top:r.top,height:r.height};}));assert.ok(Math.abs(metaBoxes[0].top+metaBoxes[0].height/2-metaBoxes[1].top-metaBoxes[1].height/2)<2,'工作空间与关联任务横向对齐');
  assert.ok(taskSearchPages>=2,'前缀搜索必须读取包含匹配的后续页');await page.unroute(taskMatcher,taskPager);
  const addedTitleSummaries=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/tasks/title-summaries')&&decodeURIComponent(url.pathname).includes('/workspaces/'+remote+'/')&&url.searchParams.get('ids')===taskId;});
  const candidate=popup().locator('.ac-association-candidate').filter({hasText:'other-workspace'});await candidate.click();await addedTitleSummaries;
  await page.waitForFunction(()=>document.querySelector('#agent-conversation-panel .ac-association-trigger')?.textContent?.includes('2'));
  assert.deepEqual(fixture.conversation.taskLinks,[{workspaceId,taskId},{workspaceId:remote,taskId}]);
  assert.equal(fixture.conversation.cwd,cwd);assert.equal(fixture.conversation.workspaceId,workspaceId);assert.equal(fixture.sends,sends+1);
  assert.equal(await popup().isVisible(),true,'新增后保持浮层打开');await search.fill('不存在的前缀');await popup().getByText('没有前缀匹配。',{exact:true}).waitFor();
  await page.keyboard.press('Escape');await popup().waitFor({state:'hidden'});await conversationButton().click();
  await linkedRow(remote).locator('.ac-association-open').click();await waitTaskWorkspace(remote);await waitTaskDetail(taskId);
  await taskButton().waitFor();await closeConversation();await taskButton().click();await popup().locator('[data-associated-conversation="'+originalId+'"]').click();
  await input().waitFor();await waitConversation(originalId);assert.equal(await panel().getAttribute('data-conversation-id'),originalId,'异空间任务打开原空间对话');assert.equal(fixture.creations,before+1);
  const removedTitleSummaries=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/tasks/title-summaries')&&decodeURIComponent(url.pathname).includes('/workspaces/'+workspaceId+'/')&&url.searchParams.get('ids')===taskId;});
  await conversationButton().click();await linkedRow(remote).getByRole('button',{name:'解除关联 '+taskId,exact:true}).click();
  await removedTitleSummaries;
  await page.waitForFunction(()=>document.querySelector('#agent-conversation-panel .ac-association-trigger')?.textContent?.includes('1'));
  assert.equal(await popup().isVisible(),true);assert.deepEqual(fixture.conversation.taskLinks,[{workspaceId,taskId}]);await page.keyboard.press('Escape');
  await closeConversation();await taskButton().click();await popup().getByText('暂无关联对话。',{exact:true}).waitFor();
  await popup().getByRole('combobox',{name:'搜索对话',exact:true}).fill(fixture.conversation.title);
  await popup().locator('.ac-association-candidate').filter({hasText:originalId}).click();
  await popup().locator('[data-associated-conversation="'+originalId+'"]').waitFor();assert.equal(await popup().isVisible(),true,'任务侧新增不关闭');
  await popup().locator('[data-associated-conversation="'+originalId+'"]').click();await input().waitFor();
  assert.equal(fixture.conversation.taskLinks.length,2);assert.equal(fixture.sends,sends+1,'两端维护不发送消息');
  await input().focus();await conversationButton().focus();await popup().waitFor();await page.keyboard.press('Escape');await popup().waitFor({state:'hidden'});
  await page.setViewportSize({width:390,height:844});await conversationButton().click();await popup().waitFor();
  await page.waitForFunction(()=>{const node=[...document.querySelectorAll<HTMLElement>('.ac-association-body')].find(item=>item.getClientRects().length);if(!node)return false;const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});await capture(page,'association-cross-workspace-mobile.png');
  await page.keyboard.press('Escape');await page.setViewportSize({width:1600,height:1000});await conversationButton().click();await popup().waitFor();await capture(page,'association-cross-workspace-desktop.png');await page.keyboard.press('Escape');
  // Leave the pre-existing multi-conversation fixture for the following independent controls.
  fixture.additionalConversations=[{...fixture.conversation,id:'task-second',title:'另一段任务对话',entries:[],participants:[],activity:undefined}];
  await page.reload();await input().waitFor();await taskButton().click();await popup().locator('[data-associated-conversation="task-second"]').waitFor();assert.match(await taskButton().innerText(),/2/);
  await popup().locator('[data-associated-conversation="task-second"]').click();await input().waitFor();await page.waitForFunction(()=>document.querySelector('#agent-conversation-panel')?.getAttribute('data-conversation-id')==='task-second');
  // Return to the original task and original conversation without implicit selection.
  await conversationButton().click();await linkedRow(workspaceId).locator('.ac-association-open').click();await waitTaskWorkspace(workspaceId);await waitTaskDetail(taskId);
  await closeConversation();await taskButton().click();await popup().locator('[data-associated-conversation="'+originalId+'"]').click();await input().waitFor();
});

await step('窄工作区同时打开任务与对话时，内容标题栏填满边界且按钮不互相遮挡',async()=>{
      await page.setViewportSize({width:1068,height:820});
      const stage=page.locator('.workspace-pane-stage .pane-stage:visible');await stage.locator('.pane-right:visible').waitFor();
      await page.waitForFunction(()=>Boolean(document.querySelector('.workspace-pane-stage .pane-stage.reading-overlay')));await stage.getByRole('button',{name:'收起内容',exact:true}).click({trial:true});
      const geometry=await stage.locator('.pane-right').evaluate((node:HTMLElement)=>{
        const rect=node.getBoundingClientRect(),strip=node.querySelector('.pane-tabstrip')!.getBoundingClientRect(),toggle=node.querySelector('.pane-content-toggle')!.getBoundingClientRect();
        const chat=document.querySelector('#agent-conversation-panel')!.getBoundingClientRect();
        const target=document.elementFromPoint(toggle.x+toggle.width/2,toggle.y+toggle.height/2);
        return {right:rect.right,stripRight:strip.right,toggleRight:toggle.right,chatLeft:chat.left,reachable:Boolean(target?.closest('.pane-content-toggle')),hit:target?.outerHTML.slice(0,500)};
      });
      assert.ok(Math.abs(geometry.stripRight-geometry.right)<=1,JSON.stringify(geometry)+'：内容标题栏应填满保留按钮槽位，不在对话边界留下白条');
      assert.ok(geometry.toggleRight<=geometry.chatLeft,JSON.stringify(geometry));assert.equal(geometry.reachable,true,JSON.stringify(geometry));
      await capture(page,'agent-conversation-narrow-work-boundary.png');
      await stage.getByRole('button',{name:'收起内容',exact:true}).click();await stage.getByRole('button',{name:'展开内容',exact:true}).waitFor();
      await stage.getByRole('button',{name:'展开内容',exact:true}).click();await stage.locator('.pane-right:visible .pane-content-toggle').waitFor();
      await page.setViewportSize({width:1600,height:1000});
    });

await step('已提交未受理和失败只显示两个状态并保留在活动浮窗',async()=>{
  const at=new Date().toISOString(),base=structuredClone(fixture.conversation);
  const make=(id:string,state:'waiting'|'failed',reason:string)=>({...base,id,title:id,entries:[],requests:[],run:undefined,retainedRuns:[],activity:{active:true,version:1,seenThrough:1,updatedAt:at,pendingDecisionCount:0,pendingSend:{state,reason,updatedAt:at}}});
  const pattern='**/api/v1/app/agent-service/activity-summary*';
  const route=async(route:any)=>route.fulfill({status:200,json:{revision:'pending-display',conversations:[make('待发送测试','waiting','等待准确接收后台就绪'),make('发送失败测试','failed','明确的发送错误')],pending:[],total:2,activityCounts:{active:2,running:0,waiting:0,unseen:0,unknown:0,attention:0,pendingSend:2},stats:{agents:[],models:[],executions:[],modelExecutions:[]}}});
  try{
    await page.route(pattern,route);await page.reload();await input().waitFor();
    const entry=page.locator('button[aria-label^="所有对话，"]:visible').last();
    await entry.getByLabel('2 个活动中对话',{exact:true}).waitFor();await entry.hover();
    const menu=page.locator('.ac-activity-menu:visible');
    await menu.getByText('等待发送',{exact:true}).waitFor();await menu.hover();await menu.getByText('发送失败',{exact:true}).waitFor();
    await menu.getByText('等待准确接收后台就绪',{exact:true}).waitFor();await menu.getByText('明确的发送错误',{exact:true}).waitFor();
    assert.match(await menu.locator('.ac-execution-summary').innerText(),/执行中模型\s*0/);
    assert.equal(await menu.locator('[data-activity-id]').count(),2);
    await capture(page,'conversation-pending-activity.png');
  }finally{await page.unroute(pattern,route);await page.reload();await input().waitFor();}
});

await step('原生暂忙时保存待发送内容，刷新保留、仅可取消，并在新版开始后更新展示',async()=>{
      update({run:run('stopping','dsh'),requests:[],pendingSend:undefined});await reopen();
      const before=fixture.sends,previewsBefore=fixture.prepares;
      await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles({name:'cancel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
      await panel().locator('.ac-image-thumbnail[title="cancel.png"]').hover();await panel().getByRole('button',{name:'移除图片 cancel.png',exact:true}).waitFor();
      fixture.prepareError={code:'agent_process_switching',message:'原生服务正在切换。'};
      await input().fill('上一轮结束后继续修复');await input().press('Enter');
      await panel().getByText('等待发送',{exact:true}).waitFor();
      assert.equal(fixture.sends,before);assert.equal(fixture.prepares,previewsBefore,'直接提交返回真实服务占用，不先请求预览');assert.equal(await input().inputValue(),'');
      assert.equal(fixture.conversation.pendingSend.draft.text,'上一轮结束后继续修复');
      await page.reload();await panel().getByText('等待发送',{exact:true}).waitFor();
      assert.deepEqual(await panel().locator('.ac-pending-send-actions button').allTextContents(),['取消']);
      assert.equal(await page.getByRole('dialog',{name:'修改待发送指令',exact:true}).count(),0);
      await capture(page,'agent-conversation-pending-send.png');
      const pending=structuredClone(fixture.conversation.pendingSend);
      update({pendingSend:{...pending,draft:{...pending.draft,text:'修改后的下一轮指令\n'+Array.from({length:30},(_,i)=>'完整保留的待发送内容 '+i).join('\n')}}});
      await page.reload();await input().waitFor();
      const body=panel().locator('.ac-pending-send-text');
      assert.equal(await body.evaluate((node:HTMLElement)=>node.scrollHeight>node.clientHeight),true,'长内容有界但保留完整正文');
      assert.match(await body.innerText(),/完整保留的待发送内容 29/);
      update({pendingSend:{...pending,state:'dispatching'}});await page.reload();await panel().getByText('等待发送',{exact:true}).waitFor();assert.equal(await panel().getByRole('button',{name:'取消',exact:true}).isEnabled(),false);
      update({pendingSend:{...pending,state:'failed',reason:'原命令尚未确认退出，未发送下一轮。'}});await page.reload();
      await panel().getByText('发送失败',{exact:true}).waitFor();
      await panel().locator('.ac-pending-send-reason').getByText('原命令尚未确认退出，未发送下一轮。',{exact:true}).waitFor();
      assert.equal(await panel().getByRole('button',{name:'取消',exact:true}).isEnabled(),true);
      assert.equal(fixture.sends,before);
      await capture(page,'agent-conversation-pending-failure.png');
      update({pendingSend:pending});await page.reload();await panel().getByText('等待发送',{exact:true}).waitFor();
      await panel().getByRole('button',{name:'取消',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
      assert.equal(await input().inputValue(),pending.draft.text);
      await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='对话输入');
      assert.equal(await input().evaluate((node:HTMLElement)=>document.activeElement===node),true);
      assert.equal(await panel().getByRole('button',{name:'移除图片 cancel.png',exact:true}).count(),1);
      const stopsBeforeCancel=fixture.stops;
      update({pendingSend:pending});await page.reload();await input().fill('已有新草稿');
      await panel().getByRole('button',{name:'取消',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
      assert.equal(await input().inputValue(),'已有新草稿\n\n'+pending.draft.text);assert.equal(fixture.stops,stopsBeforeCancel);assert.equal(fixture.sends,before);
      await page.reload();assert.equal(await input().inputValue(),'已有新草稿\n\n'+pending.draft.text);
      update({pendingSend:pending});await page.reload();
      const cancelRoute='**/cancel-pending-send';const rejectCancel=async(route:any)=>{fixture.expectedBrowserErrors?.add(route.request().url());await route.fulfill({status:409,json:{error:{code:'agent_pending_conflict',message:'待发送内容已经变化。'}}});};
      await page.route(cancelRoute,rejectCancel);await panel().getByRole('button',{name:'取消',exact:true}).click();await panel().getByText('待发送内容已经变化。',{exact:true}).waitFor();
      assert.equal(await panel().locator('[data-pending-send-state]').count(),1);assert.equal(await input().inputValue(),'已有新草稿\n\n'+pending.draft.text);
      await page.unroute(cancelRoute,rejectCancel);await panel().getByRole('button',{name:'取消',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});await input().fill('');
      assert.equal(await panel().getByRole('button',{name:'移除图片 cancel.png',exact:true}).count(),1);await panel().getByRole('button',{name:'移除图片 cancel.png',exact:true}).focus();await page.keyboard.press('Enter');
      update({run:run('stopped','dsh'),requests:[]});await reopen();const observesBefore=fixture.observes;await panel().locator('.ac-recovery-action').getByRole('button',{name:'继续',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,before+1,'取消只撤回待发送，之后仍能继续原目标');assert.ok(fixture.observes>observesBefore,'继续会先核对原执行');assert.ok(fixture.sentInputs.at(-1).continueRunId);
      update({run:run('stopping','dsh')});await reopen();assert.equal(fixture.sends,before+1);
      fixture.prepareError={code:'agent_process_switching',message:'原生服务正在切换。'};await input().fill('自动交给新版');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().getByText('等待发送',{exact:true}).waitFor();
      const submitted=fixture.conversation.pendingSend.draft;
      update({pendingSend:undefined,entries:[...fixture.conversation.entries,{id:'auto-new-version',sequence:fixture.conversation.entries.length+1,kind:'message',role:'user',text:submitted.text,createdAt:new Date().toISOString()}],run:run('running','dsh',{generation:'new-service-generation',permissionMode:submitted.permissionMode,model:submitted.model,modelAccountId:submitted.modelAccountId})});
      await panel().getByText('自动交给新版',{exact:true}).waitFor();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
      await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,before+1,'界面不自行重发后台已接续的指令');
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });

await step('A的停止等待不阻断B，A的迟到回执不改B状态',async()=>{
      update({run:run('running','dsh',{id:'parallel-stop-a'})});fixture.additionalConversations[0].run=run('running','codex',{id:'parallel-stop-b'});await reopen();const stopsBefore=fixture.stops;fixture.holdStop=true;const started=new Promise<void>(resolve=>{fixture.stopStarted=resolve;});await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await started;
      await fixture.openHistoryList();await page.locator('.ac-history-list').getByText('另一段任务对话',{exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();assert.equal(fixture.stops,stopsBefore+2,'B不等待A的控制请求完成');const response=page.waitForResponse((value:any)=>value.url().includes('/'+fixture.conversation.id+'/stop'));fixture.releaseStop!();await response;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(await panel().getAttribute('data-conversation-id'),'task-second');assert.equal(await panel().locator('[data-run-status="stopped"]').count(),1);
    });

await step('迟到的预览与创建不得跨到另一段对话或新草稿，也不能自动执行',async()=>{
      // This scenario owns the primary source; the preceding stop test leaves B selected.
      if(await panel().getAttribute('data-conversation-id')!==fixture.conversation.id){
        await fixture.openHistoryList();
        await page.locator('.ac-history-row-main[data-conversation-id="'+fixture.conversation.id+'"]').click();await input().waitFor();
      }
      const sentBefore=fixture.sends;await chooseAgent('Qoder');await input().fill('旧会话等待预览');fixture.holdPrepare=true;const preparedStarted=new Promise<void>(resolve=>{fixture.prepareStarted=resolve;});await panel().locator('.ac-transfer-notice,.ac-recovery-action').getByRole('button',{name:'交接内容',exact:true}).click();await preparedStarted;
      await fixture.startNewConversation();await input().fill('新草稿需要保留');const previewResponse=page.waitForResponse((response:any)=>response.url().endsWith('/prepare-send'));fixture.releasePrepare!();await previewResponse;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(fixture.sends,sentBefore);assert.equal(await page.getByRole('dialog',{name:'确认发送与接续范围',exact:true}).count(),0);assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await input().inputValue(),'新草稿需要保留');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isEnabled(),true);
      fixture.holdCreate=true;const createdStarted=new Promise<void>(resolve=>{fixture.createStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await createdStarted;await fixture.startNewConversation();await input().fill('同为新对话，但已经是另一份草稿');const createResponse=page.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().includes('/drafts/')&&response.url().endsWith('/send'));fixture.releaseCreate!();await createResponse;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(fixture.sends,sentBefore+1);assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await input().inputValue(),'同为新对话，但已经是另一份草稿');assert.equal(await page.getByRole('dialog',{name:'确认发送与接续范围',exact:true}).count(),0);
    });

await step('反复新建共用同一份新草稿，含权限与模型选择',async()=>{
      await input().fill('跨入口共享的草稿');await chooseOption('执行权限','完全访问');
      await fixture.startNewConversation();await input().waitFor();assert.equal(await input().inputValue(),'跨入口共享的草稿','再次新建沿用唯一新草稿');
      await fixture.openHistoryList();await panel().locator('.ac-history').waitFor();await fixture.startNewConversation();await input().waitFor();assert.equal(await input().inputValue(),'跨入口共享的草稿','历史视图新建仍是同一份草稿');
      assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','新建不丢弃未发送的权限选择');
      await chooseOption('执行权限','默认权限');
      await closeConversation();await panel().waitFor({state:'hidden'});await openDesktopConversation();await input().waitFor();assert.equal(await input().inputValue(),'跨入口共享的草稿','收起再打开草稿仍在');await input().fill('');
    });

await step('创建回执迟到时保留主动收起，接受的发送在后台继续',async()=>{
      const sentBefore=fixture.sends;await input().fill('创建后在后台执行');fixture.holdCreate=true;const creating=new Promise<void>(resolve=>{fixture.createStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await creating;await closeConversation();await panel().waitFor({state:'hidden'});const accepted=page.waitForResponse((response:any)=>response.url().endsWith('/send'));fixture.releaseCreate!();await accepted;assert.equal(fixture.sends,sentBefore+1);await assertFixed(false);await panel().waitFor({state:'hidden'});await page.getByRole('complementary',{name:'当前对话与所有对话',exact:true}).waitFor();await openDesktopConversation();await panel().locator('[data-run-status="running"]').waitFor();await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });

await step('首次创建期间继续输入，权限准确转移，切家不降级且刷新保留显式默认',async()=>{
      const sentBefore=fixture.sends;await fixture.startNewConversation();await input().waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'默认权限','明确选回默认后，同空间新对话恢复该选择');
      await chooseAgent('Codex');await chooseOption('执行权限','完全访问');await input().fill('首次发送的固定快照');fixture.holdCreate=true;const creating=new Promise<void>(resolve=>{fixture.createStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await creating;await input().fill('创建期间继续输入的下一轮草稿');const accepted=page.waitForResponse((response:any)=>response.url().endsWith('/send'));fixture.releaseCreate!();await accepted;await panel().locator('[data-run-status="running"]').waitFor();
      assert.equal(fixture.sends,sentBefore+1);assert.equal(sentInputs.at(-1).text,'首次发送的固定快照');assert.equal(sentInputs.at(-1).permissionMode,'full-access');assert.equal(fixture.conversation.run.permissionMode,'full-access');assert.equal(await input().inputValue(),'创建期间继续输入的下一轮草稿','迁移真实会话时读取最新草稿，不覆盖创建期间的连续输入');await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
      connections[2].capabilities.permissionModes=['default'];const connectionsRead=page.waitForResponse((response:any)=>response.url().endsWith('/agent-service/connections'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await connectionsRead;await chooseAgent('Qoder');await panel().getByText('当前执行者不支持完全访问',{exact:true}).waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);await input().press('Enter');assert.equal(fixture.sends,sentBefore+1,'未支持完全访问时提示原因，不静默降级');
      await chooseAgent('Codex');await chooseOption('执行权限','默认权限');await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();assert.equal(fixture.conversation.run.permissionMode,'full-access');assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'默认权限','旧run为full但用户已选default，刷新不得恢复成full');assert.equal(await input().inputValue(),'创建期间继续输入的下一轮草稿');assert.equal(fixture.sends,sentBefore+1);
      connections[2].capabilities.permissionModes=['default','full-access'];
    });

await step('多图上传和旧发送回执只影响对应图片，不复活已删图或清空后来图片',async()=>{
      const png=(name:string)=>({name,mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
      fixture.holdUploadAt=fixture.attachmentUploads+2;const uploadingSecond=new Promise<void>(resolve=>{fixture.uploadStarted=resolve;});await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles([png('first.png'),png('second.png')]);await uploadingSecond;assert.equal(await panel().getByRole('button',{name:'移除图片 first.png',exact:true}).isDisabled(),true,'批次上传期间材料修改入口禁用');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),true,'完整批次接受前不发送部分材料');const secondAccepted=page.waitForResponse((response:any)=>response.url().endsWith('/attachments'));fixture.releaseUpload!();await secondAccepted;await panel().getByRole('button',{name:'移除图片 second.png',exact:true}).waitFor();await panel().locator('.ac-image-thumbnail[title="first.png"]').hover();await panel().getByRole('button',{name:'移除图片 first.png',exact:true}).click();assert.equal(await panel().getByRole('button',{name:'移除图片 first.png',exact:true}).count(),0,'批次完成后只移除用户指定的材料');await panel().getByRole('button',{name:'发送对话',exact:true}).waitFor();
      const sentBefore=fixture.sends,submittedImage='image-fixture-'+fixture.attachmentUploads;fixture.holdSend=true;const started=new Promise<void>(resolve=>{fixture.sendStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await started;assert.equal(fixture.sends,sentBefore+1);assert.deepEqual(sentInputs.at(-1).attachmentIds,[submittedImage]);assert.equal(sentInputs.at(-1).permissionMode,'default','full切回default时下一轮明确传default');assert.equal(fixture.conversation.run.permissionMode,'default');
      const activeId=fixture.conversation.id;update({title:'输入与附件竞态验证',run:run('completed','codex',{model:'fixture-model',permissionMode:'default'})});fixture.additionalConversations=[{id:'attachment-other',workspaceId:workspaceId,cwd:'/isolated/other',title:'附件验证中的另一段对话',revision:'attachment-other-r1',hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[],requests:[]}];
      await fixture.openHistoryList();await page.locator('.ac-history-list').getByText('附件验证中的另一段对话',{exact:true}).click();await page.locator('#agent-conversation-panel[data-conversation-id="attachment-other"]').waitFor();await fixture.openHistoryList();await page.locator('.ac-history-list').getByText('输入与附件竞态验证',{exact:true}).click();await page.locator('#agent-conversation-panel[data-conversation-id="'+activeId+'"]').waitFor();await panel().locator('[data-run-status="completed"]').waitFor();
      await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles(png('later.png'));await panel().getByRole('button',{name:'移除图片 later.png',exact:true}).waitFor();await input().fill('旧发送之后新增的下一轮内容');const delayedAccepted=page.waitForResponse((response:any)=>response.url().endsWith('/send'));fixture.releaseSend!();await delayedAccepted;await panel().getByRole('button',{name:'移除图片 second.png',exact:true}).waitFor({state:'hidden'});assert.equal(await panel().getByRole('button',{name:'移除图片 later.png',exact:true}).isVisible(),true,'旧发送只移除提交ID，保留切回后新添图');assert.equal(await input().inputValue(),'旧发送之后新增的下一轮内容');await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'默认权限');await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(fixture.conversation.run.permissionMode,'default','刷新读取实际run权限');
    });
}
