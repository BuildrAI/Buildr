import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** tasks 场景使用独立准备的对话现场。 */
export async function runTasksScenarios(fixture:AgentConversationFixture){
  const {assertFixed,capture,chooseAgent,chooseOption,closeConversation,connections,input,openDesktopConversation,page,panel,reopen,run,sentInputs,step,update,workspaceId,workspaceUrl}=fixture;
await step('任务对话入口零一多：绑定跟随草稿，发送才建会话，一条直接打开，多条明确选择',async()=>{
      fixture.holdTaskList=true;const taskListRead=new Promise<void>(resolve=>{fixture.taskListStarted=resolve;});
      await page.goto(workspaceUrl+'/tasks');await page.locator('#task-table-body tr.ant-table-row').first().click();await taskListRead;await page.locator('#task-detail-title:visible').waitFor();
      const entry=page.locator('[data-task-internal-conversations]:visible'),taskConversationLink=entry.getByRole('button',{name:'任务对话',exact:true});
      await entry.getByText('读取中…',{exact:false}).waitFor();await taskConversationLink.waitFor();assert.equal(await taskConversationLink.isDisabled(),true);assert.equal(await taskConversationLink.getAttribute('aria-busy'),'true');
      fixture.releaseTaskList!();
      await entry.getByText('任务对话',{exact:true}).waitFor();assert.equal(await taskConversationLink.isEnabled(),true);assert.equal(await taskConversationLink.getAttribute('aria-busy'),'false');
      const before=fixture.creations,sendsBefore=fixture.sends;await taskConversationLink.click();await panel().locator('.ac-location-meta').filter({hasText:'关联任务：'}).waitFor();assert.equal(fixture.creations,before,'打开任务对话只进入草稿，不创建会话');assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await page.locator('.pane-left:visible').count(),1);assert.equal(await page.locator('.pane-right:visible').count(),1);
      await input().fill('从任务详情继续的工作');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.creations,before+1,'首次发送才创建任务会话');assert.equal(fixture.sends,sendsBefore+1);assert.ok(fixture.conversation.taskId);assert.equal(await panel().getAttribute('data-conversation-id'),fixture.conversation.id);assert.ok((await panel().locator('.ac-location-meta').innerText()).includes('关联任务：'+fixture.conversation.taskId));await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();await capture(page,'agent-conversation-task.png');
      await closeConversation();await taskConversationLink.click();await panel().waitFor();assert.equal(fixture.creations,before+1,'已有一条时直接恢复，不另建');
      fixture.additionalConversations=[{...fixture.conversation,id:'task-second',workspaceId:workspaceId,title:'另一段任务对话',entries:[],participants:[],activity:undefined}];await page.reload();await page.locator('[data-task-internal-conversations]:visible').getByText('任务对话 · 2',{exact:false}).waitFor();await closeConversation();await page.locator('[data-task-internal-conversations]:visible').getByRole('button',{name:'任务对话',exact:true}).click();await page.getByText('另一段任务对话',{exact:true}).click();await page.locator('#agent-conversation-panel[data-conversation-id="task-second"]').waitFor();assert.equal(await panel().getAttribute('data-conversation-id'),'task-second');await page.locator('.ant-popover:visible').waitFor({state:'hidden'});
      // 绑定跟随工作空间草稿：入口提出绑定后，跨入口新建不丢绑定，移除后发送不带任务
      await taskConversationLink.click();await page.locator('.ac-task-picker:visible').getByRole('button',{name:'新建任务对话',exact:true}).click();await panel().waitFor();await panel().locator('.ac-location-meta').filter({hasText:'关联任务：'}).waitFor();assert.equal(fixture.creations,before+1,'任务入口新对话仍是草稿');assert.equal(await panel().getAttribute('data-conversation-id'),null);
      await input().fill('绑定跟随草稿的工作');await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'绑定跟随草稿的工作','全局新建沿用同一工作空间草稿');await panel().locator('.ac-location-meta').filter({hasText:'关联任务：'}).waitFor();
      await panel().getByRole('button',{name:'更换或解除任务关联',exact:true}).click();await page.locator('.ac-task-associate:visible').getByRole('button',{name:'解除关联',exact:true}).click();assert.equal(await panel().locator('.ac-location-meta').filter({hasText:'关联任务：'}).count(),0,'移除绑定后草稿不再带任务');assert.equal(await input().inputValue(),'绑定跟随草稿的工作','移除绑定保留草稿文本');
      await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.creations,before+2,'解除绑定后发送仍只建一次会话');assert.ok(!fixture.conversation.taskId,'解除绑定后发送不关联任务');await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();assert.equal(fixture.sends,sendsBefore+2);
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

await step('停止期间提交待发送内容，刷新保留、可修改取消，并在新版开始后更新展示',async()=>{
      update({run:run('stopping','dsh'),requests:[],pendingSend:undefined});await reopen();
      const before=fixture.sends,previewsBefore=fixture.prepares;
      await input().fill('上一轮结束后继续修复');await input().press('Enter');
      await panel().getByText('已提交，等待自动发送',{exact:true}).waitFor();
      assert.equal(fixture.sends,before);assert.equal(fixture.prepares,previewsBefore);assert.equal(await input().inputValue(),'');
      assert.equal(fixture.conversation.pendingSend.draft.text,'上一轮结束后继续修复');
      await page.reload();await panel().getByText('已提交，等待自动发送',{exact:true}).waitFor();
      await panel().getByRole('button',{name:'修改待发送内容',exact:true}).click();
      const edit=page.getByRole('dialog',{name:'修改待发送指令',exact:true});
      await edit.getByRole('textbox',{name:'待发送内容',exact:true}).fill('修改后的下一轮指令');
      await edit.getByRole('button',{name:'保存并等待发送',exact:true}).click();await edit.waitFor({state:'hidden'});
      await panel().locator('.ac-pending-send-text').filter({hasText:'修改后的下一轮指令'}).waitFor();assert.equal(fixture.sends,before);
      await capture(page,'agent-conversation-pending-send.png');
      await panel().getByRole('button',{name:'取消待发送',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
      assert.equal(fixture.sends,before);
      await input().fill('自动交给新版');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().getByText('已提交，等待自动发送',{exact:true}).waitFor();
      const submitted=fixture.conversation.pendingSend.draft;
      update({pendingSend:undefined,entries:[...fixture.conversation.entries,{id:'auto-new-version',sequence:fixture.conversation.entries.length+1,kind:'message',role:'user',text:submitted.text,createdAt:new Date().toISOString()}],run:run('running','dsh',{generation:'new-service-generation',permissionMode:submitted.permissionMode,model:submitted.model,modelAccountId:submitted.modelAccountId})});
      await panel().getByText('自动交给新版',{exact:true}).waitFor();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
      await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,before,'界面不自行重发后台已接续的指令');
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });

await step('A的停止等待不阻断B，A的迟到回执不改B状态',async()=>{
      update({run:run('running','dsh')});fixture.additionalConversations[0].run=run('running','codex');await reopen();const stopsBefore=fixture.stops;fixture.holdStop=true;const started=new Promise<void>(resolve=>{fixture.stopStarted=resolve;});await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await started;
      await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await page.locator('.ac-history-list').getByText('另一段任务对话',{exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();assert.equal(fixture.stops,stopsBefore+2,'B不等待A的控制请求完成');const response=page.waitForResponse((value:any)=>value.url().includes('/'+fixture.conversation.id+'/stop'));fixture.releaseStop!();await response;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(await panel().getAttribute('data-conversation-id'),'task-second');assert.equal(await panel().locator('[data-run-status="stopped"]').count(),1);
    });

await step('迟到的预览与创建不得跨到另一段对话或新草稿，也不能自动执行',async()=>{
      const sentBefore=fixture.sends;await input().fill('旧会话等待预览');fixture.holdPrepare=true;const preparedStarted=new Promise<void>(resolve=>{fixture.prepareStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await preparedStarted;
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().fill('新草稿需要保留');const previewResponse=page.waitForResponse((response:any)=>response.url().endsWith('/prepare-send'));fixture.releasePrepare!();await previewResponse;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(fixture.sends,sentBefore);assert.equal(await page.getByRole('dialog',{name:'确认发送与接续范围',exact:true}).count(),0);assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await input().inputValue(),'新草稿需要保留');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isEnabled(),true);
      fixture.holdCreate=true;const createdStarted=new Promise<void>(resolve=>{fixture.createStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await createdStarted;await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().fill('同为新对话，但已经是另一份草稿');const createResponse=page.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().includes('/drafts/')&&response.url().endsWith('/send'));fixture.releaseCreate!();await createResponse;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(fixture.sends,sentBefore+1);assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await input().inputValue(),'同为新对话，但已经是另一份草稿');assert.equal(await page.getByRole('dialog',{name:'确认发送与接续范围',exact:true}).count(),0);
    });

await step('反复新建共用同一份新草稿，含权限与模型选择',async()=>{
      await input().fill('跨入口共享的草稿');await chooseOption('执行权限','完全访问');
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'跨入口共享的草稿','再次新建沿用唯一新草稿');
      await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('.ac-history').waitFor();await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'跨入口共享的草稿','历史视图新建仍是同一份草稿');
      assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','新建不丢弃未发送的权限选择');
      await chooseOption('执行权限','默认权限');
      await closeConversation();await panel().waitFor({state:'hidden'});await openDesktopConversation();await input().waitFor();assert.equal(await input().inputValue(),'跨入口共享的草稿','收起再打开草稿仍在');await input().fill('');
    });

await step('创建回执迟到时保留主动收起，接受的发送在后台继续',async()=>{
      const sentBefore=fixture.sends;await input().fill('创建后在后台执行');fixture.holdCreate=true;const creating=new Promise<void>(resolve=>{fixture.createStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await creating;await closeConversation();await panel().waitFor({state:'hidden'});const accepted=page.waitForResponse((response:any)=>response.url().endsWith('/send'));fixture.releaseCreate!();await accepted;assert.equal(fixture.sends,sentBefore+1);await assertFixed(false);await panel().waitFor({state:'hidden'});await page.getByRole('complementary',{name:'当前对话与所有对话',exact:true}).waitFor();await openDesktopConversation();await panel().locator('[data-run-status="running"]').waitFor();await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });

await step('首次创建期间继续输入，权限准确转移，切家不降级且刷新保留显式默认',async()=>{
      const sentBefore=fixture.sends;await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'默认权限','明确选回默认后，同空间新对话恢复该选择');
      await chooseAgent('Codex');await chooseOption('执行权限','完全访问');await input().fill('首次发送的固定快照');fixture.holdCreate=true;const creating=new Promise<void>(resolve=>{fixture.createStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await creating;await input().fill('创建期间继续输入的下一轮草稿');const accepted=page.waitForResponse((response:any)=>response.url().endsWith('/send'));fixture.releaseCreate!();await accepted;await panel().locator('[data-run-status="running"]').waitFor();
      assert.equal(fixture.sends,sentBefore+1);assert.equal(sentInputs.at(-1).text,'首次发送的固定快照');assert.equal(sentInputs.at(-1).permissionMode,'full-access');assert.equal(fixture.conversation.run.permissionMode,'full-access');assert.equal(await input().inputValue(),'创建期间继续输入的下一轮草稿','迁移真实会话时读取最新草稿，不覆盖创建期间的连续输入');await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
      connections[2].capabilities.permissionModes=['default'];const connectionsRead=page.waitForResponse((response:any)=>response.url().endsWith('/agent-service/connections'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await connectionsRead;await chooseAgent('Qoder');await panel().getByText('当前执行者不支持完全访问',{exact:true}).waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);await input().press('Enter');assert.equal(fixture.sends,sentBefore+1,'未支持完全访问时提示原因，不静默降级');
      await chooseAgent('Codex');await chooseOption('执行权限','默认权限');await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();assert.equal(fixture.conversation.run.permissionMode,'full-access');assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'默认权限','旧run为full但用户已选default，刷新不得恢复成full');assert.equal(await input().inputValue(),'创建期间继续输入的下一轮草稿');assert.equal(fixture.sends,sentBefore+1);
      connections[2].capabilities.permissionModes=['default','full-access'];
    });

await step('多图上传和旧发送回执只影响对应图片，不复活已删图或清空后来图片',async()=>{
      const png=(name:string)=>({name,mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
      fixture.holdUploadAt=fixture.attachmentUploads+2;const uploadingSecond=new Promise<void>(resolve=>{fixture.uploadStarted=resolve;});await panel().locator('input[type=file]').setInputFiles([png('first.png'),png('second.png')]);await uploadingSecond;assert.equal(await panel().getByRole('button',{name:'移除图片 first.png',exact:true}).isDisabled(),true,'批次上传期间材料修改入口禁用');assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),true,'完整批次接受前不发送部分材料');const secondAccepted=page.waitForResponse((response:any)=>response.url().endsWith('/attachments'));fixture.releaseUpload!();await secondAccepted;await panel().getByRole('button',{name:'移除图片 second.png',exact:true}).waitFor();await panel().locator('.ac-image-thumbnail[title="first.png"]').hover();await panel().getByRole('button',{name:'移除图片 first.png',exact:true}).click();assert.equal(await panel().getByRole('button',{name:'移除图片 first.png',exact:true}).count(),0,'批次完成后只移除用户指定的材料');await panel().getByRole('button',{name:'发送对话',exact:true}).waitFor();
      const sentBefore=fixture.sends,submittedImage='image-fixture-'+fixture.attachmentUploads;fixture.holdSend=true;const started=new Promise<void>(resolve=>{fixture.sendStarted=resolve;});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await started;assert.equal(fixture.sends,sentBefore+1);assert.deepEqual(sentInputs.at(-1).attachmentIds,[submittedImage]);assert.equal(sentInputs.at(-1).permissionMode,'default','full切回default时下一轮明确传default');assert.equal(fixture.conversation.run.permissionMode,'default');
      const activeId=fixture.conversation.id;update({title:'输入与附件竞态验证',run:run('completed','codex',{model:'fixture-model',permissionMode:'default'})});fixture.additionalConversations=[{id:'attachment-other',workspaceId:workspaceId,cwd:'/isolated/other',title:'附件验证中的另一段对话',revision:'attachment-other-r1',hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[],requests:[]}];
      await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await page.locator('.ac-history-list').getByText('附件验证中的另一段对话',{exact:true}).click();await page.locator('#agent-conversation-panel[data-conversation-id="attachment-other"]').waitFor();await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await page.locator('.ac-history-list').getByText('输入与附件竞态验证',{exact:true}).click();await page.locator('#agent-conversation-panel[data-conversation-id="'+activeId+'"]').waitFor();await panel().locator('[data-run-status="completed"]').waitFor();
      await panel().locator('input[type=file]').setInputFiles(png('later.png'));await panel().getByRole('button',{name:'移除图片 later.png',exact:true}).waitFor();await input().fill('旧发送之后新增的下一轮内容');const delayedAccepted=page.waitForResponse((response:any)=>response.url().endsWith('/send'));fixture.releaseSend!();await delayedAccepted;await panel().getByRole('button',{name:'移除图片 second.png',exact:true}).waitFor({state:'hidden'});assert.equal(await panel().getByRole('button',{name:'移除图片 later.png',exact:true}).isVisible(),true,'旧发送只移除提交ID，保留切回后新添图');assert.equal(await input().inputValue(),'旧发送之后新增的下一轮内容');await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'默认权限');await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(fixture.conversation.run.permissionMode,'default','刷新读取实际run权限');
    });
}
