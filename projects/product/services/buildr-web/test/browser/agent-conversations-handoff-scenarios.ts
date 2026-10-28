import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** handoff 场景使用独立准备的对话现场。 */
export async function runHandoffScenarios(fixture:AgentConversationFixture){
  const {assertFixed,assertModelSummary,capture,chooseAgent,chooseModel,closeConversation,closeModelSettings,connections,input,modelSettings,page,panel,preparedInputs,reopen,run,sentInputs,step,update,workspaceId}=fixture;
await step('同一会话选下一位不发送，可查看实际原文并直接发送',async()=>{
      await chooseAgent('DSH');await panel().locator('#agent-conversation-input').fill('');assert.equal(fixture.sends,1);assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','同一对话换执行者保留权限意图');
      await panel().getByRole('button',{name:'交接内容',exact:true}).click();const preview=panel().locator('.ac-handoff-drawer');await preview.waitFor();assert.equal(fixture.sends,1);assert.equal(preparedInputs.at(-1).continueRunId,fixture.conversation.run.id);assert.equal(preparedInputs.at(-1).text,'');assert.equal(await panel().getByText('请填写内容或添加图片。',{exact:true}).count(),0);assert.equal(await preview.locator('.ac-hd-send-body').isVisible(),false);await preview.locator('.ac-hd-material-more>summary').click();assert.match(await preview.locator('.ac-hd-send-body>pre').innerText(),/第一轮/);await preview.locator('.ant-drawer-content-wrapper').evaluate((node:HTMLElement)=>node.getBoundingClientRect());await capture(page,'agent-handoff-details-desktop.png');await preview.getByRole('button',{name:'关闭交接内容',exact:true}).click();await preview.waitFor({state:'hidden'});await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,2);assert.equal(sentInputs[1].reasoningEffort,undefined);assert.equal(sentInputs[1].permissionMode,'full-access');assert.equal(fixture.conversation.run.permissionMode,'full-access');assert.ok(fixture.prepares>=2);assert.equal(fixture.conversation.participants.length,2);assert.equal(fixture.conversation.entries[0].provider,'codex');
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
      fixture.conversation.participants.push({id:'participant-qoder',connectionId:'qoder',provider:'qoder',label:'Qoder',deliveredThrough:0,contextId:'native-qoder'});update({entries:[...fixture.conversation.entries,{id:'assistant-fixture',sequence:fixture.conversation.entries.length+1,kind:'message',role:'assistant',text:'已检查服务停止范围和失败重试。\n\n'+Array.from({length:30},(_,index)=>`检查项 ${index+1}：运行目录、任务范围与恢复结果均保留当前事实。`).join('\n\n'),provider:'codex',createdAt:new Date().toISOString()}],run:run('completed','codex',{model:'fixture-model',reasoningEffort:'high',permissionMode:'full-access'})});await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(await panel().locator('.ac-provider-select .ant-select-selection-item').innerText(),'Codex','换回Codex后刷新仍默认最近执行方');await assertModelSummary('Fixture model','高');assert.equal(fixture.sends,2);
      assert.equal(fixture.titleGenerations,0,'恢复会话不会自动另发标题生成');const messageCount=fixture.conversation.entries.length;fixture.holdTitle=true;const titleRead=new Promise<void>(resolve=>{fixture.titleStarted=resolve;});await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:'生成简短标题',exact:true}).click();await titleRead;await panel().getByText('正在生成简短标题…',{exact:true}).waitFor();await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'正在生成标题…',exact:true}).getAttribute('aria-disabled'),'true');fixture.releaseTitle!();await panel().getByRole('button',{name:'对话信息',exact:true}).filter({hasText:'服务停止与重试'}).waitFor();assert.equal(fixture.titleGenerations,1);assert.equal(fixture.conversation.entries.length,messageCount,'标题生成不添加对话消息');assert.equal(fixture.sends,2);await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});
      const readsBefore=fixture.connectionReads;connections[1].models=connections[1].models.map(item=>({...item,isDefault:item.id==='fixture-fast'}));fixture.connectionProbeBarrier=new Promise<void>(resolve=>{fixture.releaseConnectionProbe=resolve;});fixture.connectionEventProbe=true;await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();await chooseAgent('DSH');await assertModelSummary('Fast model');const eventRead=page.waitForResponse((response:any)=>response.url().endsWith('/agent-service/connections'));fixture.releaseConnectionProbe!();await eventRead;fixture.connectionProbeBarrier=undefined;assert.equal(fixture.connectionReads,readsBefore+2,'初始化与合法connection事件各读取一次；重复游标、旧代次和其他会话不触发读取');assert.equal(fixture.sends,2,'connection事件只核对模型目录，不发送消息');
    });

await step('异常结束直接继续或重试，草稿保留，换模型与执行者也可恢复',async()=>{
      const saved=structuredClone(fixture.conversation),savedSends=fixture.sends,savedPrepares=fixture.prepares,savedStops=fixture.stops,savedSentLength=sentInputs.length;
      try{
        for(const mode of ['same','model','executor','undelivered']){
          update({run:run('failed','codex',{model:'fixture-model',accepted:mode!=='undelivered',diagnostic:'本轮异常中断'}),requests:[]});await page.reload();await panel().locator('[data-run-status="failed"]').waitFor();
          if(mode==='model'){await chooseModel('Fast model');await closeModelSettings();}
          if(mode==='executor')await chooseAgent('DSH');
          await input().fill('保留正在编辑的新要求');
          const action=panel().locator('.ac-recovery-action'),before=fixture.sends,users=fixture.conversation.entries.filter((entry:any)=>entry.role==='user').length;
          const label=mode==='undelivered'?'重试':'继续';await action.getByRole('button',{name:label,exact:true}).waitFor();
          assert.equal(await action.locator('.anticon-reload').count(),1);
          assert.equal(await action.locator(':scope > span').count(),0,'已有异常原因时不重复追加通用失败提示');
          const actionBox=await action.boundingBox(),buttonBox=await action.getByRole('button',{name:label,exact:true}).boundingBox();
          assert.ok(actionBox&&buttonBox&&buttonBox.x-actionBox.x<10,'恢复动作紧邻左侧异常，不漂到输入区右端');
          assert.equal(await action.getByRole('button',{name:label,exact:true}).innerText(),label,'两个字不插入额外间距');
          fixture.holdSend=true;const started=new Promise<void>(resolve=>{fixture.sendStarted=resolve;});if(mode==='same'){fixture.holdPrepare=true;const preparing=new Promise<void>(resolve=>{fixture.prepareStarted=resolve;});await action.getByRole('button',{name:label,exact:true}).click();await preparing;await panel().getByRole('button',{name:'直接交接',exact:true}).click();await started;fixture.releasePrepare!();}else{await action.getByRole('button',{name:label,exact:true}).click();await started;}
          assert.equal(fixture.sends,before+1);assert.equal(sentInputs.at(-1).continueRunId,'run-fixture');assert.equal(sentInputs.at(-1).text,'');assert.deepEqual(sentInputs.at(-1).attachmentIds,[]);
          assert.equal(fixture.conversation.entries.filter((entry:any)=>entry.role==='user').length,users);
          if(mode==='model')assert.equal(sentInputs.at(-1).model,'fixture-fast');if(mode==='executor')assert.equal(sentInputs.at(-1).connectionId,'dsh');
          fixture.releaseSend!();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(await input().inputValue(),'保留正在编辑的新要求');assert.equal(await panel().locator('.ac-recovery-action').count(),0);
        }
        update({entries:[...fixture.conversation.entries,{id:'legacy-failed-input',sequence:999,kind:'message',role:'user',text:'未送达的历史要求',createdAt:'2026-10-28T00:00:00Z',runId:'older-failed-run',status:'failed'}]});
        await page.reload();await panel().locator('.ac-turn[data-run-id="older-failed-run"]').waitFor();
        assert.equal(await panel().locator('.ac-turn[data-run-id="older-failed-run"] .ac-turn-identity').count(),0,'历史失败输入没有来源事实时不显示空智能体标题');
        update({run:run('unknown','codex'),requests:[]});await page.reload();await panel().locator('.ac-execution-uncertain').getByRole('button',{name:'核对状态',exact:true}).waitFor();
        assert.equal(await panel().locator('.ac-recovery-action').getByRole('button',{name:'继续',exact:true}).count(),0);
      }finally{fixture.holdSend=false;fixture.releaseSend?.();fixture.conversation=saved;fixture.sends=savedSends;fixture.prepares=savedPrepares;fixture.stops=savedStops;sentInputs.splice(savedSentLength);await page.reload();await input().waitFor();await input().fill('');}
    });

await step('交接准备可取消且不发送，容量问题直接引导选择模型',async()=>{
      const original=await input().inputValue(),before=fixture.sends;await input().fill('保留这份未发送草稿');
      fixture.holdPrepare=true;const started=new Promise<void>(resolve=>{fixture.prepareStarted=resolve;});
      await panel().getByRole('button',{name:'发送对话',exact:true}).click();await started;
      await panel().getByRole('button',{name:'取消发送',exact:true}).click();
      const response=page.waitForResponse((r:any)=>r.url().endsWith('/prepare-send'));fixture.releasePrepare!();await response;
      assert.equal(fixture.sends,before);assert.equal(await input().inputValue(),'保留这份未发送草稿');
      fixture.forceCapacity=true;await panel().getByRole('button',{name:'发送对话',exact:true}).click();
      const drawer=panel().locator('.ac-handoff-drawer');await drawer.getByText(/必要交接资料仍超出接收容量/).waitFor();
      assert.equal(fixture.sends,before);await drawer.getByRole('button',{name:'选择模型',exact:true}).click();
      await modelSettings().waitFor();await closeModelSettings();fixture.forceCapacity=false;await input().fill(original);
    });

await step('暂看历史与恢复不固定，对话滚动在收起、暂看、固定间保留',async()=>{
      await closeConversation();await panel().waitFor({state:'hidden'});const collapsed=page.getByRole('complementary',{name:'当前对话与所有对话',exact:true}).getByRole('button',{name:'展开当前对话',exact:true});await collapsed.hover();await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await page.locator('.ac-history-list button').first().click();await input().waitFor();await assertFixed(false,'暂看内恢复历史不固定布局');await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await assertFixed(false,'暂看内新建不固定布局');await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await page.locator('.ac-history-list button').first().click();await input().waitFor();await collapsed.click();
      const stream=panel().locator('.ac-stream');const handle=await stream.elementHandle();const top=await stream.evaluate((node:HTMLElement)=>new Promise<number>(resolve=>{const next=node.scrollTop===40?80:40;node.addEventListener('scroll',()=>resolve(node.scrollTop),{once:true});node.scrollTop=next;}));assert.ok(top>0,'用真实可滚动记录验证阅读位置');await closeConversation();await page.locator('#workbench-overview').click();await collapsed.hover();await stream.waitFor();assert.equal(await stream.evaluate((node:HTMLElement,prior:HTMLElement)=>node===prior,handle),true);assert.equal(await stream.evaluate((node:HTMLElement)=>node.scrollTop),top);await collapsed.click();assert.equal(await stream.evaluate((node:HTMLElement)=>node.scrollTop),top);await handle?.dispose();
    });

await step('原生授权与问题回复绑定原请求，未知执行只保存待发送内容',async()=>{
      update({run:run('waiting-approval','dsh'),requests:[{id:'native-approval',conversationId:fixture.conversation.id,workspaceId:workspaceId,participantId:'participant-dsh',runId:'run-fixture',generation:'generation-fixture',kind:'approval',title:'允许这次写入吗？',options:[{id:'deny',label:'拒绝'},{id:'allow-once',label:'允许本次'}]}]});await reopen();await panel().getByRole('button',{name:'允许本次',exact:true}).click();assert.equal(fixture.replies,1);
      update({run:run('waiting-question','dsh'),requests:[{id:'native-question',conversationId:fixture.conversation.id,workspaceId:workspaceId,participantId:'participant-dsh',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'需要明确范围',questions:[{id:'scope',label:'这次处理范围'}]}]});await reopen();await panel().getByRole('textbox',{name:'这次处理范围',exact:true}).fill('只调整本次目标');await panel().getByRole('button',{name:'回答并继续',exact:true}).click();assert.equal(fixture.replies,2);await panel().locator('.ac-message.is-user').filter({hasText:'这次处理范围：只调整本次目标'}).waitFor();
      update({run:run('unknown','dsh'),requests:[]});await reopen();await input().fill('未知时保留输入');await input().press('Enter');await panel().getByText('已提交，等待自动发送',{exact:true}).waitFor();assert.equal(fixture.sends,2);assert.equal(await input().inputValue(),'');assert.equal(fixture.conversation.pendingSend.draft.text,'未知时保留输入');await capture(page,'agent-conversation-unknown.png');await panel().getByRole('button',{name:'取消待发送',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
    });
}
