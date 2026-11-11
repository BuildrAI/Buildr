import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** Stop needs an existing execution, not a working model picker or another send. */
export async function runStopAllScenarios(fixture:AgentConversationFixture){
  const {page,panel,input,run,step,update}=fixture;
  await step('停止固定在输入框上方右侧，桌面和窄屏的草稿均不改变入口',async()=>{
    const saved=structuredClone(fixture.conversation),viewport=page.viewportSize();
    try{
      update({run:run('running','codex',{id:'stop-placement'}),retainedRuns:[],requests:[],pendingSend:undefined});
      await fixture.reopen();
      for(const width of [1600,390]){
        await page.setViewportSize({width,height:1000});await page.reload();await input().waitFor();
        const button=panel().getByRole('button',{name:'停止对话',exact:true});
        await button.waitFor();assert.equal(await button.innerText(),'停止');
        const glyph=await button.locator('.ac-stop-glyph').evaluate((node:HTMLElement)=>{const rect=node.getBoundingClientRect();return {width:rect.width,height:rect.height,background:getComputedStyle(node).backgroundColor};});
        assert.equal(glyph.width,10);assert.equal(glyph.height,10);assert.notEqual(glyph.background,'rgba(0, 0, 0, 0)','停止图形是实心方块，而不是禁止符号');
        for(const text of ['', '运行中仍可编辑追加草稿']){
          await input().fill(text);
          const stop=await button.boundingBox(),composer=await panel().locator('.ac-composer').boundingBox(),send=await panel().getByRole('button',{name:'发送对话',exact:true}).boundingBox();
          assert.ok(stop&&composer&&send);
          assert.ok(stop.y+stop.height<=composer.y+1,'停止必须在输入框外的上方，不在统计/发送工具栏');
          assert.ok(Math.abs(stop.x+stop.width-composer.x-composer.width)<=2,'停止与输入框右边缘对齐');
          assert.ok(stop.y<send.y);assert.ok(stop.width>=70&&stop.height>=32,'独立文字按钮有足够点击区域');
          assert.equal(await button.isEnabled(),true);assert.equal(await input().inputValue(),text);
          assert.equal(await panel().locator('.ac-compose-execution .ac-stop-button,.ac-thread-actions .ac-stop-button').count(),0);
        }
        await fixture.capture(page,'stop-input-upper-right-'+width+'.png');
      }
    }finally{fixture.conversation=saved;await page.setViewportSize(viewport);await page.reload();await input().waitFor();}
  });
  await step('主停止覆盖已结束当前轮之外的旧执行与排队输入，不影响另一对话',async()=>{
    const saved=structuredClone(fixture.conversation),additional=fixture.additionalConversations;
    try{
      const old=run('running','qoder-cn',{id:'retained-stop-all'}),brother={...structuredClone(saved),id:'independent-stop-all',run:run('running','codex',{id:'independent-run'})};
      fixture.additionalConversations=[...additional,brother];
      update({run:run('stopped'),retainedRuns:[old],requests:[],pendingSend:{id:'cancel-with-stop',revision:'pending-stop-all',state:'waiting',draft:{expectedRevision:'r',connectionId:'qoder-cn',text:'排队输入应取消'},reason:'等待投递',createdAt:'now',updatedAt:'now'}});
      await fixture.reopen();await input().waitFor();await input().fill('未提交草稿必须保留');
      const before=fixture.sends,stopBefore=fixture.stops;
      await panel().getByRole('button',{name:'停止对话',exact:true}).click();
      await panel().locator('[data-cancelled-send]').waitFor();
      assert.equal(fixture.stops,stopBefore+1);assert.equal(fixture.sends,before);
      assert.equal(fixture.conversation.retainedRuns[0].status,'stopped');assert.equal(fixture.conversation.pendingSend,undefined);
      assert.equal(brother.run.status,'running');assert.equal(await input().inputValue(),'未提交草稿必须保留');
      await page.reload();await input().waitFor();await panel().locator('[data-cancelled-send]').waitFor();
      assert.equal(await panel().getByRole('button',{name:'停止对话',exact:true}).count(),0);
      assert.equal(await input().inputValue(),'未提交草稿必须保留');assert.equal(fixture.sends,before);
    }finally{fixture.additionalConversations=additional;fixture.conversation=saved;await page.reload();await input().waitFor();}
  });
  await step('对话停止冻结旧轮迟到输出，不冻结随后显式开始的新轮',async()=>{
    const saved=structuredClone(fixture.conversation);let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;}),pattern='**/agent-conversations/'+saved.id+'/stop-all';
    const handler=async(route:any)=>{await gate;update({run:{...fixture.conversation.run,status:'stopped',executionState:'ended'},entries:fixture.conversation.entries.map((entry:any)=>({...entry,status:'unknown'})),stopRequest:{id:route.request().postDataJSON().clientRequestId,runIds:['stop-output-run'],createdAt:new Date().toISOString()}});await route.fulfill({json:fixture.conversation});};
    try{
      const owner=run('running','codex',{id:'stop-output-run'}),entry={id:'stop-all-output',sequence:100,kind:'message',role:'assistant',text:'点击时的输出',runId:owner.id,participantId:owner.participantId,status:'running',createdAt:new Date().toISOString()};
      update({run:owner,retainedRuns:[],requests:[],pendingSend:undefined,entries:[entry]});await fixture.reopen();await panel().getByText(entry.text,{exact:true}).waitFor();await page.route(pattern,handler);
      const sending=page.waitForRequest((request:any)=>request.url().endsWith('/stop-all'));
      await panel().getByRole('button',{name:'停止对话',exact:true}).click();await sending;
      update({entries:[{...entry,text:'迟到的输出'}]});
      const pendingStop=panel().getByRole('button',{name:'停止对话',exact:true});
      assert.equal(await pendingStop.count(),1);assert.equal(await pendingStop.isDisabled(),true);assert.equal(await pendingStop.innerText(),'停止中');
      const response=page.waitForResponse((response:any)=>response.url().endsWith('/stop-all'));release();await response;
      await panel().getByText(entry.text,{exact:true}).waitFor();assert.equal(await panel().getByText('迟到的输出',{exact:true}).count(),0);
      const next=run('running','codex',{id:'new-explicit-run'});update({run:next,retainedRuns:[{...owner,status:'stopped'}],entries:[...fixture.conversation.entries,{...entry,id:'new-explicit-output',sequence:101,runId:next.id,text:'新一轮输出'}]});
      await fixture.reopen();
      await panel().getByText('新一轮输出',{exact:true}).waitFor();await panel().getByRole('button',{name:'停止对话',exact:true}).waitFor();
    }finally{release();await page.unroute(pattern,handler);fixture.conversation=saved;await page.reload();await input().waitFor();}
  });
}
