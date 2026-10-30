import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** handoff 场景使用独立准备的对话现场。 */
export async function runHandoffScenarios(fixture:AgentConversationFixture){
  const {assertFixed,assertModelSummary,capture,chooseAgent,chooseModel,closeConversation,closeModelSettings,connections,input,modelSettings,page,panel,preparedInputs,reopen,run,sentInputs,step,update,workspaceId}=fixture;
await step('后台版本漂移自动恢复一次，真实变化与未知送达保留草稿',async()=>{
  const saved=structuredClone(fixture.conversation),savedSends=fixture.sends,savedPrepares=fixture.prepares,savedInputs=sentInputs.length;
  const matcher=/\/agent-conversations\/[^/]+\/(?:prepare-send|send)$/;
  try{
    for(const scene of ['prepare','send','changed','twice','unknown']){
      fixture.conversation=structuredClone(saved);
      update({run:run('completed','codex',{model:'fixture-model'}),requests:[]});
      await page.reload();await input().waitFor();
      const text='版本恢复测试 '+scene;await input().fill(text);
      const calls:Array<{action:string;body:any}>=[];let rejected=0;
      const intercept=async(route:any)=>{
        const request=route.request(),action=new URL(request.url()).pathname.split('/').at(-1)!;
        calls.push({action,body:request.postDataJSON()});
        if(scene==='unknown'&&action==='send'){
          fixture.expectedBrowserErrors.add(request.url());return route.abort('failed');
        }
        if(scene!=='unknown'&&action===(scene==='send'?'send':'prepare-send')&&(rejected===0||scene==='twice')){
          rejected++;fixture.expectedBrowserErrors.add('409');fixture.expectedBrowserErrors.add('Conflict');
          update({title:'后台生成标题 '+rejected,run:{...fixture.conversation.run,contextUsage:{usedTokens:rejected*100}},
            ...(scene==='changed'?{entries:fixture.conversation.entries.map((entry:any,index:number)=>index===0?{...entry,text:entry.text+' 已更改'}:entry)}:{})});
          return route.fulfill({status:409,json:{error:{code:'agent_revision_conflict',message:'内容已变化，请刷新后重试。'}}});
        }
        return route.fallback();
      };
      await page.route(matcher,intercept);
      try{
        await panel().getByRole('button',{name:'发送对话',exact:true}).click();
        if(scene==='prepare'||scene==='send'){
          await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('#agent-conversation-input')?.value==='');
          assert.equal(calls.filter(call=>call.action==='prepare-send').length,2);
          const sends=calls.filter(call=>call.action==='send');
          assert.equal(sends.length,scene==='send'?2:1);
          if(scene==='send')assert.equal(sends[0].body.clientRequestId,sends[1].body.clientRequestId);
          assert.equal(fixture.conversation.entries.filter((entry:any)=>entry.role==='user'&&entry.text===text).length,1);
          assert.equal(await panel().getByText(/请刷新后重试/).count(),0);
        }else{
          if(scene==='unknown')await panel().getByText(/Failed to fetch|送达|Load failed/).first().waitFor();
          else await panel().getByText('对话状态已更新，请核对后重新发送。草稿保留。',{exact:true}).waitFor();
          assert.equal(await input().inputValue(),text);
          assert.equal(calls.filter(call=>call.action==='prepare-send').length,scene==='twice'?2:1);
          assert.equal(calls.filter(call=>call.action==='send').length,scene==='unknown'?1:0);
          if(scene==='changed')await capture(page,'conversation-real-conflict-draft-retained.png');
        }
      }finally{await page.unroute(matcher,intercept);}
    }
  }finally{
    fixture.conversation=saved;fixture.sends=savedSends;fixture.prepares=savedPrepares;sentInputs.splice(savedInputs);
    await page.reload();await input().waitFor();await input().fill('');
  }
});
await step('同一会话选下一位不发送，可查看实际原文并直接发送',async()=>{
      await chooseAgent('DSH');await panel().locator('#agent-conversation-input').fill('');assert.equal(fixture.sends,1);assert.equal(await panel().locator('.ac-permission-select .ant-select-selection-item').innerText(),'完全访问','同一对话换执行者保留权限意图');
      await panel().getByRole('button',{name:'交接内容',exact:true}).click();const preview=panel().locator('.ac-handoff-drawer');await preview.waitFor();assert.equal(fixture.sends,1);assert.equal(preparedInputs.at(-1).continueRunId,fixture.conversation.run.id);assert.equal(preparedInputs.at(-1).text,'');assert.equal(await panel().getByText('请填写内容或添加图片。',{exact:true}).count(),0);assert.equal(await preview.locator('.ac-hd-send-body').isVisible(),false);await preview.locator('.ac-hd-material-more>summary').click();assert.match(await preview.locator('.ac-hd-send-body>pre').innerText(),/第一轮/);await preview.locator('.ant-drawer-content-wrapper').evaluate((node:HTMLElement)=>node.getBoundingClientRect());await capture(page,'agent-handoff-details-desktop.png');await preview.getByRole('button',{name:'继续',exact:true}).click();await preview.waitFor({state:'hidden'});await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,2);assert.equal(sentInputs[1].reasoningEffort,undefined);assert.equal(sentInputs[1].permissionMode,'full-access');assert.equal(fixture.conversation.run.permissionMode,'full-access');assert.ok(fixture.prepares>=2);assert.equal(fixture.conversation.participants.length,2);assert.equal(fixture.conversation.entries[0].provider,'codex');
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
      fixture.conversation.participants.push({id:'participant-qoder',connectionId:'qoder',provider:'qoder',label:'Qoder',deliveredThrough:0,contextId:'native-qoder'});update({entries:[...fixture.conversation.entries,{id:'assistant-fixture',sequence:fixture.conversation.entries.length+1,kind:'message',role:'assistant',text:'已检查服务停止范围和失败重试。\n\n'+Array.from({length:30},(_,index)=>`检查项 ${index+1}：运行目录、任务范围与恢复结果均保留当前事实。`).join('\n\n'),provider:'codex',createdAt:new Date().toISOString()}],run:run('completed','codex',{model:'fixture-model',reasoningEffort:'high',permissionMode:'full-access'})});await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(await panel().locator('.ac-provider-select .ant-select-selection-item').innerText(),'Codex','换回Codex后刷新仍默认最近执行方');await assertModelSummary('Fixture model','高');assert.equal(fixture.sends,2);
      assert.equal(fixture.titleGenerations,0,'恢复会话不会自动另发标题生成');const messageCount=fixture.conversation.entries.length;fixture.holdTitle=true;const titleRead=new Promise<void>(resolve=>{fixture.titleStarted=resolve;});await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:'生成简短标题',exact:true}).click();await titleRead;await panel().getByText('正在生成简短标题…',{exact:true}).waitFor();await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'正在生成标题…',exact:true}).getAttribute('aria-disabled'),'true');fixture.releaseTitle!();await panel().getByRole('button',{name:'对话信息',exact:true}).filter({hasText:'服务停止与重试'}).waitFor();assert.equal(fixture.titleGenerations,1);assert.equal(fixture.conversation.entries.length,messageCount,'标题生成不添加对话消息');assert.equal(fixture.sends,2);await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});
      const readsBefore=fixture.connectionReads;update({run:{...fixture.conversation.run,executionState:'active'}});connections[1].models=connections[1].models.map(item=>({...item,isDefault:item.id==='fixture-fast'}));fixture.connectionProbeBarrier=new Promise<void>(resolve=>{fixture.releaseConnectionProbe=resolve;});fixture.connectionEventProbe=true;await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();await chooseAgent('DSH');await assertModelSummary('Fast model');const eventRead=page.waitForResponse((response:any)=>response.url().endsWith('/agent-service/connections'));fixture.releaseConnectionProbe!();await eventRead;fixture.connectionProbeBarrier=undefined;update({run:{...fixture.conversation.run,executionState:'ended'}});assert.equal(fixture.connectionReads,readsBefore+2,'初始化与合法connection事件各读取一次；重复游标、旧代次和其他会话不触发读取');assert.equal(fixture.sends,2,'connection事件只核对模型目录，不发送消息');
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
          assert.equal(await action.getByText('上次执行未正常答复。',{exact:true}).count(),0,'已有异常原因时不重复追加通用失败提示');
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
      update({run:run('waiting-question','dsh'),requests:[{id:'native-question',conversationId:fixture.conversation.id,workspaceId:workspaceId,participantId:'participant-dsh',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'需要明确范围',questions:[{id:'scope',label:'这次处理范围'}]}]});await page.reload();await input().waitFor();await panel().getByRole('textbox',{name:'这次处理范围',exact:true}).fill('只调整本次目标');await panel().getByRole('button',{name:'回答并继续',exact:true}).click();assert.equal(fixture.replies,2);await panel().locator('.ac-message.is-user').filter({hasText:'这次处理范围：只调整本次目标'}).waitFor();
      update({run:run('unknown','dsh'),requests:[]});await reopen();await input().fill('未知时保留输入');await input().press('Enter');await panel().getByText('等待上一轮结束后自动发送',{exact:true}).waitFor();assert.equal(fixture.sends,2);assert.equal(await input().inputValue(),'');assert.equal(fixture.conversation.pendingSend.draft.text,'未知时保留输入');await capture(page,'agent-conversation-unknown.png');await panel().getByRole('button',{name:'取消待发送',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
    });

await step('问题卡片在专注、分屏和窄屏与输入内容列对齐，长说明不溢出',async()=>{
      const saved=structuredClone(fixture.conversation),before=fixture.replies;
      try{
        const request={id:'question-card-layout',conversationId:saved.id,workspaceId,participantId:'participant-codex',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'需要你的回复',questions:[{id:'layout',label:'是否同步更新现有说明，使其与新的行为保持一致？',allowOther:true,options:[{id:'yes',label:'同步更新（推荐）',description:'修正现有说明，然后完成登记与清理。'},{id:'later',label:'暂不更新',description:'保留当前结果。长来源标识：'+('source-reference-without-spaces-'.repeat(12))}]}]};
        update({run:run('waiting-question','codex'),requests:[request]});await page.reload();await input().waitFor();
        const card=panel().locator('[data-agent-request="question-card-layout"]');await card.waitFor();
        const focus=async(label:string)=>{await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
        const geometry=async()=>{
          await card.scrollIntoViewIfNeeded();const box=await card.boundingBox(),composer=await panel().locator('.ac-compose-wrap>.ac-composer').boundingBox(),pane=await panel().boundingBox();
          assert.ok(box&&composer&&pane);assert.ok(Math.abs(box.x-composer.x)<=10&&Math.abs(box.width-composer.width)<=10,'问题卡片跟随输入内容列：'+JSON.stringify({box,composer}));
          assert.ok(box.x>=pane.x+10&&box.x+box.width<=pane.x+pane.width-10,'卡片保留两侧留白');
          assert.equal(await card.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1),true,'长问题与说明不撑出卡片');
          const submit=await card.getByRole('button',{name:'回答并继续',exact:true}).boundingBox();assert.ok(submit&&submit.x+submit.width<=box.x+box.width-8,'提交按钮留在卡片内容区');
          if(box.width>600){
            const note=await card.locator('.ac-request-submit>small').boundingBox();
            assert.ok(note&&submit&&Math.abs(note.y+note.height/2-submit.y-submit.height/2)<2,'桌面确认与说明同行');
          }
        };
        await page.setViewportSize({width:2048,height:1100});await focus('专注对话');await panel().locator('.ac-request').waitFor();await geometry();assert.ok((await card.boundingBox())!.width<800,'宽屏问题卡片不铺满整页');await capture(page,'agent-question-card-focused.png');
        await focus('恢复分屏');await page.setViewportSize({width:1600,height:1000});await geometry();
        await page.setViewportSize({width:390,height:844});await geometry();await card.getByRole('radio',{name:'其他',exact:true}).check();
        const confirmVisible=async()=>{
          await page.waitForFunction(()=>{
            const card=document.querySelector('.ac-request'),stream=document.querySelector('.ac-stream'),footer=card?.querySelector('.ac-request-submit');
            if(!stream||!footer)return false;
            const available=stream.getBoundingClientRect(),action=footer.getBoundingClientRect();
            return action.top>=available.top-1&&action.bottom<=available.bottom+1;
          });
        };
        await confirmVisible();
        const answer=card.getByRole('textbox',{name:'是否同步更新现有说明，使其与新的行为保持一致？：其他回答',exact:true});await answer.fill('保留这份回答草稿');await geometry();assert.equal(await answer.inputValue(),'保留这份回答草稿');assert.equal(fixture.replies,before);await capture(page,'agent-question-card-mobile.png');
        await answer.fill('保留这份回答草稿\n'+Array.from({length:6},(_,index)=>'补充说明 '+index).join('\n'));await confirmVisible();
        const stream=panel().locator('.ac-stream');
        await stream.evaluate((node:HTMLElement)=>{node.scrollTop=10;});
        await page.waitForFunction(()=>document.querySelector('.ac-scroll-latest')!==null);
        const position=await stream.evaluate((node:HTMLElement)=>node.scrollTop);
        await card.evaluate((node:HTMLElement)=>{node.style.paddingBottom='100px';});
        await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
        assert.equal(await stream.evaluate((node:HTMLElement)=>node.scrollTop),position,'阅读旧记录时高度变化不拉回底部');
        await card.evaluate((node:HTMLElement)=>{node.style.paddingBottom='';});
      }finally{fixture.conversation=saved;await page.setViewportSize({width:1280,height:900});await page.reload();await input().waitFor();}
    });

await step('用户决定复用问题卡片，选项说明与其他回答可用且回答后接续原轮',async()=>{
      const decision=(id:string)=>({id,conversationId:fixture.conversation.id,workspaceId,participantId:'participant-codex',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'需要你的回复',questions:[{id:'direction',label:'接下来选择哪个方向？',allowOther:true,options:[{id:'preview',label:'先看效果',description:'先查看交互效果再决定。'},{id:'implement',label:'直接修改',description:'按已确认方向继续。'}]}]});
      const before=fixture.replies;
      update({run:run('waiting-question','codex',{permissionMode:'full-access'}),requests:[decision('decision-choice')]});
      await page.reload();await input().waitFor();
      let card=panel().locator('[data-agent-request="decision-choice"]');await card.waitFor();
      await panel().locator('[data-execution-state="waiting-question"]').waitFor();
      assert.equal(await card.getByRole('button',{name:'回答并继续',exact:true}).isDisabled(),true);
      await card.getByText('先查看交互效果再决定。',{exact:true}).waitFor();
      assert.equal(fixture.replies,before,'等待与刷新都不自动选择');
      await card.getByRole('radio',{name:/先看效果/}).check();
      await card.getByRole('button',{name:'回答并继续',exact:true}).click();await card.waitFor({state:'hidden'});
      assert.equal(fixture.replies,before+1);assert.equal(fixture.conversation.run.id,'run-fixture');assert.equal(fixture.conversation.run.status,'running');
      assert.deepEqual(JSON.parse(fixture.conversation.entries.at(-1).text).回答,{direction:'preview'});

      update({run:run('waiting-question','codex',{permissionMode:'full-access'}),requests:[decision('decision-other')]});
      await page.reload();await input().waitFor();card=panel().locator('[data-agent-request="decision-other"]');await card.waitFor();
      await card.getByRole('radio',{name:'其他',exact:true}).check();
      const submit=card.getByRole('button',{name:'回答并继续',exact:true}),other=card.getByRole('textbox',{name:'接下来选择哪个方向？：其他回答',exact:true});
      assert.equal(await other.getAttribute('placeholder'),'输入你的回答');
      for(const width of [1280,390]){
        await page.setViewportSize({width,height:900});await submit.scrollIntoViewIfNeeded();
        assert.equal(await card.getByRole('button',{name:'回答并继续',exact:true}).count(),1,'问题卡片只有一个提交按钮');
        const toolbar=other.locator('..').locator('.ac-compose-toolbar');
        const addBox=await toolbar.getByRole('button',{name:'添加回答图片或视频',exact:true}).boundingBox(),submitBox=await submit.boundingBox();
        assert.ok(addBox&&submitBox&&Math.abs((addBox.y+addBox.height)-(submitBox.y+submitBox.height))<6,'回答提交与附件加号共用同一操作行');
        assert.equal(await card.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1),true,'窄屏问题卡片不横向溢出');
        await capture(page,`agent-question-toolbar-${width}.png`);
      }
      await page.setViewportSize({width:1280,height:900});
      assert.equal(await submit.isDisabled(),true);await other.fill('先说明影响，暂不修改');
      await card.getByRole('radio',{name:/直接修改/}).check();await other.waitFor({state:'hidden'});
      await card.getByRole('radio',{name:'其他',exact:true}).check();assert.equal(await other.inputValue(),'先说明影响，暂不修改');
      await capture(page,'agent-conversation-user-decision.png');
      await submit.click();await card.waitFor({state:'hidden'});
      assert.equal(fixture.replies,before+2);assert.deepEqual(JSON.parse(fixture.conversation.entries.at(-1).text).回答,{direction:'先说明影响，暂不修改'});
      assert.equal(fixture.conversation.run.id,'run-fixture');
      update({run:run('waiting-question','codex',{permissionMode:'full-access'}),requests:[decision('decision-images')]});
      await page.reload();await input().waitFor();await input().fill('底部未发送草稿，不能夹带');
      card=panel().locator('[data-agent-request="decision-images"]');await card.getByRole('radio',{name:'其他',exact:true}).check();
      const imageAnswer=card.getByRole('textbox',{name:'接下来选择哪个方向？：其他回答',exact:true});
      await imageAnswer.fill('按截图说明');
      await imageAnswer.evaluate((node:HTMLElement)=>{
        const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII='),character=>character.charCodeAt(0))],'问题截图.png',{type:'image/png'}));
        node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
      });
      await card.getByRole('button',{name:'移除图片 问题截图.png',exact:true}).waitFor();
      assert.equal(await input().inputValue(),'底部未发送草稿，不能夹带');
      assert.equal(await panel().locator('.ac-compose-wrap .ac-image-thumbnail').count(),0,'回答图片不会混入底部草稿');
      await card.getByRole('radio',{name:/直接修改/}).check();await card.getByRole('radio',{name:'其他',exact:true}).check();
      await card.getByRole('button',{name:'移除图片 问题截图.png',exact:true}).waitFor();
      await imageAnswer.fill('按截图核对后继续');
      await card.getByRole('button',{name:'回答并继续',exact:true}).click();await card.waitFor({state:'hidden'});
      assert.equal(fixture.replies,before+3);const imageReply=JSON.parse(fixture.conversation.entries.at(-1).text);
      assert.equal(imageReply.显示回答.direction,'按截图核对后继续');assert.match(imageReply.回答.direction,/\/fixture\/attachments\//);
      const materialMessage=panel().locator('[data-entry-id="reply-decision-images"]');await materialMessage.locator('.ac-image-thumbnail').waitFor();assert.match(await materialMessage.innerText(),/按截图核对后继续/);assert.doesNotMatch(await materialMessage.innerText(),/fixture\/attachments|未读取不能声称|attachmentIds/);await capture(page,'agent-question-answer-materials-display.png');
      const legacy={...imageReply};delete legacy.显示回答;fixture.conversation.entries.at(-1).text=JSON.stringify(legacy);update({entries:[...fixture.conversation.entries]});await page.reload();await input().waitFor();await materialMessage.locator('.ac-image-thumbnail').waitFor();assert.doesNotMatch(await materialMessage.innerText(),/fixture\/attachments|未读取不能声称/);
      assert.equal(await input().inputValue(),'底部未发送草稿，不能夹带');await input().fill('');
      update({run:run('running','codex',{id:'new-run-after-instruction'}),requests:[decision('stale-old-question')]});await page.reload();await input().waitFor();
      assert.equal(await panel().locator('[data-agent-request]').count(),0,'新一轮不显示旧轮可答卡片');
      assert.equal(fixture.replies,before+3,'新指令不自动回答旧问题');
      update({run:run('running','codex'),requests:[]});await page.reload();await input().waitFor();
      assert.doesNotMatch(await input().getAttribute('placeholder')||'',/粘贴截图|粘贴图片|粘贴.*视频/);
    });
await step('问题自由回答共享完整视频输入，失败保留文字和已上传材料',async()=>{
      const saved=structuredClone(fixture.conversation),before=fixture.replies;
      try{
        const request={id:'video-answer',conversationId:saved.id,workspaceId,participantId:'participant-codex',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'请补充材料',questions:[{id:'scope',label:'说明修改范围'}]};
        update({run:run('waiting-question','codex'),requests:[request],pendingSend:undefined});await page.reload();await input().waitFor();await input().fill('底部文字保留');
        const card=panel().locator('[data-agent-request="video-answer"]'),answer=card.getByRole('textbox',{name:'说明修改范围',exact:true});await answer.fill('录屏说明');
        const recording=await page.evaluate(async()=>{
          const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;canvas.getContext('2d')!.fillRect(0,0,160,90);
          const stream=canvas.captureStream(12),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks:Blob[]=[];
          recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};const stopped=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});recorder.start(50);await new Promise(resolve=>setTimeout(resolve,150));canvas.getContext('2d')!.fillStyle='#ebaa43';canvas.getContext('2d')!.fillRect(40,20,80,50);await new Promise(resolve=>setTimeout(resolve,150));recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
          return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));
        });
        for(const method of ['file','paste','drop']){
          if(method==='file')await card.locator('input[type=file]').setInputFiles({name:'回答录屏.webm',mimeType:'video/webm',buffer:Buffer.from(recording)});
          else await answer.evaluate((node:HTMLElement,detail:{method:string;bytes:number[]})=>{
            const data=new DataTransfer();data.items.add(new File([new Uint8Array(detail.bytes)],'回答录屏.webm',{type:'video/webm'}));
            node.dispatchEvent(detail.method==='paste'?new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}):new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
          },{method,bytes:recording});
          const remove=card.getByRole('button',{name:'移除视频 回答录屏.webm',exact:true});await remove.waitFor().catch(async (error:unknown)=>{console.log('[question-video-failure]',method,await card.innerText());throw error;});
          await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('[data-agent-request="video-answer"] video');return Boolean(video&&video.readyState>=2&&video.videoWidth===160);});
          const stored=fixture.uploadedMedia.get('image-fixture-'+fixture.attachmentUploads)!;assert.equal(stored.mimeType,'video/webm');assert.deepEqual(stored.bytes,Buffer.from(recording));assert.ok(stored.video.frames.length>0&&stored.video.frames.length<=8);
          assert.equal(await input().inputValue(),'底部文字保留');assert.equal(await panel().locator('.ac-compose-wrap video').count(),0);
          if(method!=='drop'){await card.locator('.ac-video-thumbnail').hover();await remove.click();await remove.waitFor({state:'hidden'});}
        }
        const originalId='image-fixture-'+fixture.attachmentUploads;
        await card.locator('input[type=file]').setInputFiles([{name:'补充截图.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64')},{name:'损坏.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid video')}]);
        await card.getByText('视频编码无法解码，请换用浏览器可播放的 MP4 或 WebM。',{exact:true}).waitFor();
        assert.equal(await answer.inputValue(),'录屏说明');await card.getByRole('button',{name:'移除视频 回答录屏.webm',exact:true}).waitFor();assert.equal(fixture.replies,before);
        await capture(page,'agent-question-video-answer.png');await card.getByRole('button',{name:'回答并继续',exact:true}).click();await card.waitFor({state:'hidden'});
        const replyEntry=fixture.conversation.entries.at(-1),reply=JSON.parse(replyEntry.text);assert.equal(reply.显示回答.scope,'录屏说明');assert.deepEqual(replyEntry.attachments,[originalId,'image-fixture-'+fixture.attachmentUploads]);assert.match(reply.回答.scope,/\/fixture\/attachments\//);assert.equal(fixture.conversation.run.id,'run-fixture');assert.equal(await input().inputValue(),'底部文字保留');assert.equal(fixture.replies,before+1);
      }finally{fixture.conversation=saved;await page.reload();await input().waitFor();await input().fill('');}
    });
await step('等待问题时普通发送禁用，定位回答保留草稿；停止确认后才可发送新轮',async()=>{
      const saved=structuredClone(fixture.conversation),before=fixture.replies,supplements=fixture.supplementaryCalls,sends=fixture.sends,stops=fixture.stops,prepares=fixture.prepares;
      try{
        const request={id:'waiting-send-boundary',conversationId:saved.id,workspaceId,participantId:'participant-codex',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'当前问题',questions:[{id:'scope',label:'具体处理范围？'},{id:'confirm',label:'是否继续？',options:[{id:'yes',label:'继续处理'}]}]};
        update({run:run('waiting-question','codex',{model:'fixture-model',permissionMode:'full-access'}),requests:[request],pendingSend:undefined});
        await page.reload();await input().waitFor();await input().fill('保留底部独立草稿');
        const card=panel().locator('[data-agent-request="waiting-send-boundary"]'),send=panel().getByRole('button',{name:'发送对话',exact:true});
        assert.equal(await send.isDisabled(),true);await panel().getByText('等待回答',{exact:true}).waitFor();assert.equal(await panel().locator('.ac-question-send-notice').count(),0);
        await input().press('Enter');assert.equal(await card.getByRole('textbox',{name:'具体处理范围？',exact:true}).evaluate((node:HTMLElement)=>node===document.activeElement),true);
        assert.equal(await input().inputValue(),'保留底部独立草稿');assert.equal(fixture.prepares,prepares);assert.equal(fixture.sends,sends);assert.equal(fixture.supplementaryCalls,supplements);assert.equal(fixture.stops,stops);assert.equal(fixture.replies,before);assert.equal(fixture.conversation.pendingSend,undefined);
        await page.setViewportSize({width:520,height:800});await panel().getByRole('button',{name:'前往回答',exact:true}).click();
        assert.equal(await card.getByRole('textbox',{name:'具体处理范围？',exact:true}).evaluate((node:HTMLElement)=>node===document.activeElement),true);
        await card.getByRole('textbox',{name:'具体处理范围？',exact:true}).fill('先处理输入问题');assert.equal(await card.getByRole('button',{name:'回答并继续',exact:true}).isDisabled(),true,'多个问题不自动选择');
        fixture.unknownStop=true;await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="unknown"]').waitFor();
        await card.waitFor();assert.equal(await send.isDisabled(),true);await input().press('Enter');assert.equal(fixture.sends,sends);assert.equal(fixture.conversation.pendingSend,undefined);assert.equal(fixture.replies,before);
        fixture.unknownStop=false;await panel().locator('.ac-execution-uncertain').getByRole('button',{name:'停止',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();await card.waitFor({state:'hidden'});
        assert.equal(await input().inputValue(),'保留底部独立草稿');assert.equal(await send.isDisabled(),false);
        await send.click();await panel().locator('[data-run-status="running"]').waitFor();assert.equal(fixture.sends,sends+1);assert.equal(sentInputs.at(-1).continueRunId,undefined);assert.equal(sentInputs.at(-1).waitingHandoff,undefined);assert.equal(fixture.replies,before);
      }finally{fixture.unknownStop=false;fixture.conversation=saved;fixture.sends=sends;fixture.stops=stops;await page.setViewportSize({width:1280,height:900});await page.reload();await input().waitFor();await input().fill('');}
    });
await step('统一非阻塞问题不锁住执行；先讨论只提交原组合的明确意图',async()=>{
      const saved=structuredClone(fixture.conversation),beforeReplies=fixture.replies,beforeStops=fixture.stops;
      try{
        const request={id:'interaction-question',conversationId:saved.id,workspaceId,participantId:'participant-codex',runId:'run-fixture',generation:'generation-fixture',kind:'question',blocking:false,title:'需要补充信息',questions:[{id:'scope',label:'需要补充的范围'}]};
        update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],run:run('running','codex',{model:'fixture-model',permissionMode:'full-access'}),requests:[request],pendingSend:undefined});
        await page.reload();await input().waitFor();await chooseAgent('Codex');await chooseModel('Fixture model');await closeModelSettings();
        const card=panel().locator('[data-agent-request="interaction-question"]');
        await card.getByText(/待回答，执行仍在进行/).waitFor();
        await input().fill('补充独立资料');
        assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),false);
        await card.getByRole('button',{name:'提交回答',exact:true}).waitFor();
        update({run:run('unknown','codex',{model:'fixture-model'}),requests:[request]});
        await page.reload();await input().waitFor();await card.getByText(/执行状态待确认/).waitFor();
        assert.doesNotMatch(await card.innerText(),/执行仍在进行/);
        update({run:run('waiting-question','codex',{model:'fixture-model',permissionMode:'full-access'}),requests:[{...request,blocking:true}]});
        await page.reload();await input().waitFor();
        await panel().getByRole('button',{name:'先讨论',exact:true}).waitFor();
        await input().fill('为什么推荐 A？请先解释依据。');
        await capture(page,'agent-interaction-discussion.png');
        await panel().getByRole('button',{name:'先讨论',exact:true}).click();
        await panel().locator('[data-pending-send-state="waiting"]').waitFor();
        const pending=fixture.conversation.pendingSend;
        assert.equal(pending.draft.connectionId,'codex');assert.equal(pending.draft.model,'fixture-model');
        assert.equal(pending.draft.text,'为什么推荐 A？请先解释依据。');
        assert.equal(pending.draft.waitingHandoff.intent,'discussion');
        assert.deepEqual(pending.draft.waitingHandoff.requestIds,[request.id]);
        assert.equal(pending.draft.waitingHandoff.answers,undefined);
        assert.equal(fixture.replies,beforeReplies);assert.equal(fixture.stops,beforeStops);
        await panel().getByRole('button',{name:'取消待发送',exact:true}).click();
        await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
        assert.equal(await input().inputValue(),'为什么推荐 A？请先解释依据。');
        await card.waitFor();
      }finally{fixture.conversation=saved;await page.reload();await input().waitFor();await input().fill('');}
    });
await step('等待问题时可以回答后交接，也可以只发送新要求；预览与取消保持原问题',async()=>{
      const saved=structuredClone(fixture.conversation),beforeSends=fixture.sends,beforeReplies=fixture.replies,beforeStops=fixture.stops;
      try{
        for(const mode of ['answer','other','instruction','continue']){
          const request={id:'handoff-question-'+mode,conversationId:saved.id,workspaceId,participantId:'participant-codex',runId:'run-fixture',generation:'generation-fixture',kind:'question',title:'需要你的回复',questions:[{id:'decision',label:'当前成果是否符合预期？',allowOther:true,options:[{id:'later',label:'稍后确认',description:'保留验收，不影响其他工作。'},{id:'yes',label:'符合预期'}]}]};
          fixture.conversation=structuredClone(saved);update({run:run('waiting-question','codex',{model:'fixture-model',permissionMode:'full-access'}),requests:[request],pendingSend:undefined});
          await page.reload();await input().waitFor();await input().fill(mode==='answer'||mode==='other'?'保留输入框的独立草稿':mode==='instruction'?'先处理新的交互问题':'');
          if(mode==='instruction'){await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles({name:'handoff.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});await panel().getByRole('button',{name:'移除图片 handoff.png',exact:true}).waitFor();}
          await chooseModel('Fast model');await closeModelSettings();
          const card=panel().locator('[data-agent-request="'+request.id+'"]');
          await card.getByRole('button',{name:'回答并交接',exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:'回答并交接',exact:true}).isDisabled(),true);
          await panel().locator('.ac-waiting-handoff').getByRole('button',{name:'交接内容',exact:true}).click();
          const drawer=panel().locator('.ac-handoff-drawer');await drawer.waitFor();assert.equal(fixture.sends,beforeSends);assert.equal(fixture.stops,beforeStops);assert.equal(fixture.replies,beforeReplies);
          if(mode==='continue')await drawer.getByRole('button',{name:'交接并继续',exact:true}).click();
          else{
            await drawer.getByRole('button',{name:'关闭交接内容',exact:true}).click();
            if(mode==='other'){await card.getByRole('radio',{name:'其他',exact:true}).check();await card.getByRole('textbox',{name:'当前成果是否符合预期？：其他回答',exact:true}).fill('验收稍后处理，先看新问题');}
            else await card.getByRole('radio',{name:/稍后确认/}).check();
            await capture(page,'agent-waiting-handoff-'+mode+'.png');
            if(mode==='instruction')await panel().locator('.ac-waiting-handoff').getByRole('button',{name:'交接并发送',exact:true}).click();else await card.getByRole('button',{name:'回答并交接',exact:true}).click();
          }
          await panel().locator('[data-pending-send-state="waiting"]').waitFor();
          const pending=fixture.conversation.pendingSend,marker=pending.draft.waitingHandoff;
          assert.equal(marker.runId,'run-fixture');assert.deepEqual(marker.requestIds,[request.id]);assert.equal(pending.draft.model,'fixture-fast');
          if(mode==='answer'||mode==='other'){
            assert.deepEqual(marker.answers,[{requestId:request.id,answer:{decision:mode==='answer'?'later':'验收稍后处理，先看新问题'}}]);
            assert.equal(pending.draft.text,'');assert.equal(await input().inputValue(),'保留输入框的独立草稿');
            await panel().getByText(/随交接提交的回答/).waitFor();
          }else{assert.equal(marker.answers,undefined);assert.equal(pending.draft.text,mode==='instruction'?'先处理新的交互问题':'');}
          assert.equal(fixture.sends,beforeSends);assert.equal(fixture.replies,beforeReplies);assert.equal(fixture.stops,beforeStops,'页面只提交持久意图，后端负责准确停止');
          if(mode==='instruction'){await page.reload();await input().waitFor();await panel().locator('[data-pending-send-state="waiting"]').waitFor();}
          await panel().getByRole('button',{name:'取消待发送',exact:true}).click();await panel().locator('[data-pending-send-state]').waitFor({state:'hidden'});
          if(mode==='instruction'){await panel().getByRole('button',{name:'移除图片 handoff.png',exact:true}).waitFor();await chooseModel('Fast model');await closeModelSettings();}
          assert.equal(fixture.conversation.requests.length,1);await card.getByRole('button',{name:'回答并交接',exact:true}).waitFor();
          if(mode==='instruction')assert.equal(await input().inputValue(),'先处理新的交互问题');
          if(mode==='answer'||mode==='other')assert.equal(await input().inputValue(),'保留输入框的独立草稿');
          if(mode==='instruction'){await panel().locator('.ac-image-thumbnail[title=\"handoff.png\"]').hover();await panel().getByRole('button',{name:'移除图片 handoff.png',exact:true}).click();}
          await input().fill('');
        }
      }finally{fixture.conversation=saved;await page.reload();await input().waitFor();await input().fill('');}
    });
}
