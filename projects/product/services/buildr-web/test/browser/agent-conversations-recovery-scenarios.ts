import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** recovery 场景使用独立准备的对话现场，不调用真实模型。 */
export async function runRecoveryScenarios(fixture:AgentConversationFixture){
  const {page,panel,run,step,update,input}=fixture;
  const notice=()=>panel().locator('.ac-stream-disconnect');
  const completed=()=>run('completed','codex',{executionState:'ended'});
  await step('同组合内部恢复无交接，已释放历史不常驻输入区；真正切换与未知工具仍可核对',async()=>{
    const saved=structuredClone(fixture.conversation),sends=fixture.sends;
    try{
      const handoff={agent:'Codex',model:'Fixture model',changes:[],rounds:[],body:'internal recovery source',sourceThrough:0,mode:'records'};
      const recovery={id:'automatic-recovery',sequence:saved.entries.length+1,kind:'notice',role:'system',text:'系统自动恢复：准确原控制资源已释放，未知工具引用：previous。',status:'accepted',createdAt:new Date().toISOString()};
      const entry={id:'internal-context',sequence:saved.entries.length+2,kind:'handoff',role:'system',text:'交接已接收',status:'accepted',handoff,createdAt:new Date().toISOString()};
      const reply={id:'recovered-answer',sequence:saved.entries.length+3,kind:'message',role:'assistant',text:'原目标已核对并自动接续完成。',provider:'codex',runId:saved.run.id,status:'completed',createdAt:new Date().toISOString()};
      update({run:{...saved.run,status:'completed',executionState:'ended'},requests:[],retainedRuns:[run('unknown','codex',{id:'released-history',resourcesReleased:true,tools:[]})],entries:[...saved.entries,recovery,entry,reply]});
      await page.reload();await input().waitFor();await panel().locator('[data-run-status="completed"]').waitFor();
      assert.equal(await panel().locator('[data-retained-work]').count(),0);
      await panel().getByText('已自动接续上次工作。',{exact:true}).waitFor();
      assert.doesNotMatch(await panel().innerText(),/准确原控制资源|未知工具引用/);
      assert.equal(await panel().locator('.ac-handoff-receipt').count(),0);
      assert.equal(await panel().getByRole('button',{name:'交接内容',exact:true}).count(),0);
      await fixture.capture(page,'agent-transparent-recovery-completed.png');
      update({retainedRuns:[run('unknown','codex',{id:'released-history',resourcesReleased:true,tools:[{id:'unknown-tool',label:'unknown operation',status:'unknown'}]})],entries:[...saved.entries,{...entry,handoff:{...handoff,changes:[{kind:'agent',label:'智能体',before:'Qoder',after:'Codex'}]}},reply]});
      await page.reload();await input().waitFor();
      await panel().locator('[data-retained-work]>summary').click();
      await panel().locator('[data-retained-run="released-history"]').waitFor();
      await panel().locator('.ac-handoff-receipt').getByRole('button',{name:'交接内容',exact:true}).waitFor();
      assert.equal(fixture.sends,sends,'仅核对历史和恢复呈现不发送工作');
      await fixture.capture(page,'agent-transparent-recovery-and-real-risk.png');
    }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  });
  await step('状态未知时自动核对原执行，不重新发送工作',async()=>{
    const beforeSends=fixture.sends,beforeObserves=fixture.observes;fixture.recoverNextObserve=true;update({run:run('unknown')});await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();assert.ok(fixture.observes>beforeObserves);assert.equal(fixture.sends,beforeSends,'自动恢复观察不创建新的执行');
  });
  await step('已释放的中断回复只显示一行；重新读取没有新结果也明确反馈且不重发',async()=>{
    const saved=structuredClone(fixture.conversation),viewport=page.viewportSize(),beforeSends=fixture.sends,beforeStops=fixture.stops;
    try{
      update({run:run('unknown','codex',{resourcesReleased:true,executionState:'unknown',interrupted:true,diagnostic:'未取得本轮结束记录'}),requests:[]});
      await page.reload();await input().waitFor();
      const state=panel().locator('.ac-execution-uncertain');
      await state.getByText('回复已中断，可继续发送',{exact:true}).waitFor();
      assert.equal(await state.getByRole('button',{name:'停止',exact:true}).count(),0);assert.equal(await state.locator('small,details').count(),0);
      for(let attempt=0;attempt<2;attempt++){
        const before=fixture.observes;
        await state.getByRole('button',{name:/重新读取/}).click();
        await state.getByText('未读到结束记录，可继续发送',{exact:true}).waitFor();
        assert.ok(fixture.observes>before);assert.equal(fixture.sends,beforeSends);assert.equal(fixture.stops,beforeStops);assert.equal(fixture.conversation.run.status,'unknown');
        assert.equal(await panel().locator('.ac-compose-wrap>small[role="status"]').count(),0,'反馈保留在同一行');
      }
      await page.setViewportSize({width:390,height:844});
      const geometry=await state.evaluate((node:HTMLElement)=>{const row=node.querySelector('.ac-execution-uncertain-summary')!,label=row.querySelector('span')!,actions=row.querySelector('.ac-execution-uncertain-actions')!;return {height:row.getBoundingClientRect().height,overflow:node.scrollWidth-node.clientWidth,label:label.getBoundingClientRect().top,actions:actions.getBoundingClientRect().top};});
      assert.ok(geometry.height<=36&&geometry.overflow<=1,JSON.stringify(geometry));
      await fixture.capture(page,'agent-interrupted-reply-one-line.png');
      update({run:run('unknown','codex',{resourcesReleased:false})});await page.reload();await input().waitFor();await state.getByRole('button',{name:'停止',exact:true}).waitFor();
    }catch(error){
      process.stderr.write('[interrupted-reply-state] '+JSON.stringify({run:fixture.conversation.run,observes:fixture.observes,panel:await panel().innerText()})+'\n');throw error;
    }finally{fixture.conversation=saved;await page.setViewportSize(viewport);await page.reload();await input().waitFor();}
  });
  await step('已结束轮次打开只读取记录，后台刷新不订阅或轮询该轮',async()=>{
    for(const status of ['completed','stopped','failed']){
      update({run:run(status,'codex',{executionState:'ended'})});const streams=fixture.eventStreams;
      await page.reload();await panel().locator(`[data-run-status="${status}"]`).waitFor();
      const reads=fixture.conversationReads,observes=fixture.observes;
      await page.waitForTimeout(status==='completed'?5500:650);
      assert.equal(fixture.eventStreams,streams,status+'不订阅');assert.equal(fixture.conversationReads,reads,status+'不轮询执行');assert.equal(fixture.observes,observes);assert.equal(await notice().count(),0);
    }
    assert.equal(await input().inputValue(),'下一轮仍是草稿');
  });
  await step('收到完成事件立即取消连接，后续断流不重试也不报警',async()=>{
    const streams=fixture.eventStreams;update({run:run('running')});
    fixture.eventStreamHook=()=>{fixture.eventStreamHook=undefined;update({run:completed()});};
    await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();await page.waitForTimeout(800);
    assert.equal(fixture.eventStreams,streams+1);assert.equal(await notice().count(),0);
  });
  await step('丢失完成事件时先读当前事实，确认结束便停止重连',async()=>{
    const streams=fixture.eventStreams,beforeSends=fixture.sends;update({run:run('running')});fixture.dropEventStreams=1;
    fixture.eventStreamHook=()=>{fixture.eventStreamHook=undefined;update({run:completed()});};
    await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();await page.waitForTimeout(800);
    assert.equal(fixture.eventStreams,streams+1);assert.equal(await notice().count(),0);assert.equal(fixture.sends,beforeSends);
  });
  await step('执行中短暂断联自动恢复，只有快照再关闭仍保持有界重试',async()=>{
    let attempts=0;const streams=fixture.eventStreams;update({run:run('running')});fixture.dropEventStreams=1;
    fixture.eventStreamHook=()=>{if(++attempts===3){fixture.eventStreamHook=undefined;update({run:completed()});}};
    await page.reload();await panel().locator('[data-run-status="running"]').waitFor();await page.waitForTimeout(200);assert.equal(await notice().count(),0,'首次断线不告警');
    await panel().locator('[data-run-status="completed"]').waitFor();assert.equal(fixture.eventStreams,streams+3);assert.equal(await notice().count(),0);
  });
  await step('未结束轮次重试五次耗尽才提示连接问题，不宣称工作失败或重发',async()=>{
    update({run:run('running')});fixture.dropEventStreams=20;const streams=fixture.eventStreams,sends=fixture.sends;
    await page.reload();await panel().locator('[data-run-status="running"]').waitFor();await page.waitForTimeout(1000);assert.equal(await notice().count(),0);
    await notice().waitFor({timeout:20000});assert.equal(fixture.eventStreams,streams+6,'首次连接加五次退避重试');assert.equal(fixture.sends,sends);
    assert.match(await notice().innerText(),/暂时无法同步最新进展/);assert.doesNotMatch(await notice().innerText(),/原执行状态尚未确认/);assert.equal(await panel().locator('[data-run-status="running"]').count(),1);
    // Reproduce the two independent warnings together; changing selection never sends work.
    const previousModels=fixture.sharedModels;
    const offering={id:'alignment-offering',modelId:'alignment-model',label:'对齐检查模型',accountId:'alignment-account',accountIdentity:'alignment-identity',accountRevision:'alignment-r1',accountLabel:'对齐检查账号',provider:'fixture',available:true,enabled:true,images:true,tools:true,contextWindow:128000};
    fixture.sharedModels=[...previousModels,offering];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await fixture.chooseModel('对齐检查模型');await fixture.closeModelSettings();
    fixture.sharedModels=[...previousModels,{...offering,available:false}];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const accountWarning=panel().locator('.ac-compose-wrap>.ant-alert').filter({hasText:'所选模型账号当前不可用'});await accountWarning.waitFor();
    const assertAligned=async(label:string)=>{
      const geometry=await notice().evaluate((node:HTMLElement)=>{
        const compose=node.closest('.ac-compose-wrap')!,account=[...compose.querySelectorAll<HTMLElement>(':scope>.ant-alert')].find(item=>item.textContent?.includes('所选模型账号当前不可用'))!;
        const rect=(item:Element)=>{const box=item.getBoundingClientRect();return{x:box.x,right:box.right,top:box.top,bottom:box.bottom};};
        return{connection:rect(node),account:rect(account),composer:rect(compose.querySelector('.ac-composer')!),icons:[rect(node.querySelector('.ant-alert-icon')!),rect(account.querySelector('.ant-alert-icon')!)],messages:[rect(node.querySelector('.ant-alert-message')!),rect(account.querySelector('.ant-alert-message')!)],description:rect(node.querySelector('.ant-alert-description')!),action:rect(node.querySelector('.ant-alert-action')!),overflow:node.scrollWidth-node.clientWidth};
      });
      const aligned=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1,label+': '+a+' vs '+b);
      aligned(geometry.connection.x,geometry.account.x);aligned(geometry.connection.right,geometry.account.right);
      aligned(geometry.connection.x,geometry.composer.x);aligned(geometry.connection.right,geometry.composer.right);
      aligned(geometry.icons[0].x,geometry.icons[1].x);aligned(geometry.messages[0].x,geometry.messages[1].x);aligned(geometry.description.x,geometry.messages[0].x);
      assert.ok(geometry.account.top>=geometry.connection.bottom&&geometry.account.top-geometry.connection.bottom<=12,label+'警告间距一致');
      assert.ok(geometry.action.x>=geometry.connection.x&&geometry.action.right<=geometry.connection.right&&geometry.overflow<=1,label+'按钮不溢出');
      if(label==='mobile'){aligned(geometry.action.x,geometry.messages[0].x);assert.ok(geometry.action.top>=geometry.description.bottom-1,'窄屏按钮在正文下方');}
      await fixture.capture(page,'conversation-notices-aligned-'+label+'.png');
    };
    try{
      await assertAligned('sidebar');
      await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:'专注对话',exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});await assertAligned('full');
      await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:'恢复分屏',exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});
      await page.setViewportSize({width:375,height:800});await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth);await assertAligned('mobile');
      assert.equal(fixture.sends,sends,'查看警告与切换布局不发送工作');
    }finally{
      await page.setViewportSize({width:1600,height:1000});fixture.sharedModels=previousModels;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await fixture.chooseModel('Fixture model');await fixture.closeModelSettings();
    }
    fixture.dropEventStreams=0;const reads=fixture.conversationReads;update({run:completed()});await panel().locator('[data-run-status="completed"]').waitFor({timeout:10000});assert.ok(fixture.conversationReads>reads,'重试耗尽后全局活动仍可发现完成');assert.equal(await notice().count(),0);
  });
  await step('已结束对话收到下一轮受理后重新建立连接，不复用旧告警',async()=>{
    const streams=fixture.eventStreams,sends=fixture.sends;const subscribed=page.waitForRequest((request:any)=>new URL(request.url()).pathname.endsWith('/events'));await input().fill('下一轮');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();
    await subscribed;
    assert.equal(fixture.sends,sends+1);assert.ok(fixture.eventStreams>streams);assert.equal(await notice().count(),0);
    await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
  });
  await step('既有全局活动发现其他入口新轮，按当前身份读一次并恢复观察',async()=>{
    update({run:completed()});await page.reload();await panel().locator('[data-run-status="completed"]').waitFor();const streams=fixture.eventStreams,sends=fixture.sends;
    update({run:run('running','codex',{id:'external-run',generation:'external-generation'})});
    await panel().locator('[data-run-status="running"]').waitFor({timeout:10000});assert.ok(fixture.eventStreams>streams);assert.equal(fixture.sends,sends);
    await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
  });
  await step('切换新草稿后旧连接迟到关闭，不污染新对话也不继续重试',async()=>{
    let release:(()=>void)|undefined,started:(()=>void)|undefined;
    const held=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    update({run:run('running')});const streams=fixture.eventStreams,sends=fixture.sends;
    fixture.eventStreamHook=async()=>{fixture.eventStreamHook=undefined;started?.();await gate;};
    try{
      await page.reload();await held;await panel().locator('[data-run-status="running"]').waitFor();
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().fill('新草稿保留');release?.();
      await page.waitForTimeout(800);assert.equal(fixture.eventStreams,streams+1);assert.equal(await notice().count(),0);assert.equal(await input().inputValue(),'新草稿保留');assert.equal(fixture.sends,sends);
    }finally{release?.();fixture.eventStreamHook=undefined;}
  });
}
