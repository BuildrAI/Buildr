import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** Real hosted components; only transport is replaced, background correctness is tested in the service. */
export async function runChildConversationScenarios(fixture:AgentConversationFixture) {
  const {page,panel,input,step}=fixture;
  const children=new Map<string,any>(),requests=new Map<string,any>(),forked=new Map<string,any>(),forkResults=new Map<string,any>();
  let childSends=0,childReplies=0,childStops=0,version=0;
  let holdFork=false,releaseFork:(()=>void)|undefined,startedFork:(()=>void)|undefined,forkCalls=0;
  const update=(row:any,values:any)=>Object.assign(row,values,{revision:'child-'+(++version),updatedAt:new Date().toISOString()});
  const route=async(route:any)=>{
    const request=route.request(),url=new URL(request.url());
    const matched=url.pathname.match(/\/(?:agent-conversations|conversations)\/([^/]+)(?:\/(.*))?$/);
    if(!matched)return route.fallback();
    const [,id,action]=matched;
    if(action==='children') {
      if(request.method()==='GET'){
        const rows=[...children.values()].filter(row=>row.childOf.conversationId===id),offset=Number(url.searchParams.get('cursor')??0);
        return route.fulfill({json:{conversations:rows.slice(offset,offset+30),nextCursor:rows.length>offset+30?String(offset+30):undefined}});
      }
      const body=request.postDataJSON(),known=requests.get(body.clientRequestId);
      if(known)return route.fulfill({status:201,json:known});
      assert.equal(body.expectedRevision,fixture.conversation.revision);
      const child={id:randomUUID(),workspaceId:fixture.conversation.workspaceId,cwd:fixture.conversation.cwd,title:'新对话',titleState:{status:'pending'},
        revision:'child-'+(++version),hidden:false,updatedAt:new Date().toISOString(),participants:[],entries:[],requests:[],
        childOf:{conversationId:id,workspaceId:fixture.conversation.workspaceId,title:fixture.conversation.title,sourceRevision:body.expectedRevision,
          throughSequence:fixture.conversation.entries.at(-1)?.sequence??0,createdAt:new Date().toISOString(),state:fixture.conversation.run?.status}};
      children.set(child.id,child);requests.set(body.clientRequestId,child);return route.fulfill({status:201,json:child});
    }
    const row=children.get(id)??forked.get(id);if(!row)return route.fallback();
    if(!action)return route.fulfill({json:row});
    if(action==='fork'){
      const body=request.postDataJSON(),key=id+':'+body.clientRequestId;
      assert.equal(body.expectedRevision,row.revision);
      let result=forkResults.get(key);
      if(!result){
        const entry=row.entries.find((value:any)=>value.id===body.entryId);assert.ok(entry);
        result={...structuredClone(row),id:randomUUID(),title:'新对话',revision:'fork-'+(++version),run:undefined,requests:[],childOf:undefined,
          entries:row.entries.filter((value:any)=>value.sequence<=entry.sequence),forkState:{status:'ready'},
          forkedFrom:{conversationId:id,workspaceId:row.workspaceId,entryId:entry.id,runId:entry.runId,throughSequence:entry.sequence,title:row.title,forkedAt:new Date().toISOString()}};
        forkCalls++;forkResults.set(key,result);forked.set(result.id,result);fixture.additionalConversations.push(result);
      }
      if(holdFork){holdFork=false;startedFork?.();await new Promise<void>(resolve=>{releaseFork=resolve;});}
      return route.fulfill({status:201,json:result});
    }
    if(action==='events')return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'snapshot',cursor:++version,generation:'child-stream',workspaceId:row.workspaceId,conversationId:id,revision:row.revision,payload:{conversation:row}})+'\n\n'});
    if(action==='prepare-send'){
      const body=request.postDataJSON();
      return route.fulfill({json:{token:'child-preview',conversationId:id,revision:row.revision,connectionId:body.connectionId,permissionMode:body.permissionMode,model:body.model??'fixture-model',cwd:row.cwd,text:body.text,history:[],sourceThrough:row.entries.at(-1)?.sequence??0,inputBytes:body.text.length,maxInputBytes:65536,fits:true,switching:false}});
    }
    if(action==='send'){
      const body=request.postDataJSON();assert.equal(body.expectedRevision,row.revision);childSends++;
      const runId=randomUUID(),participantId='child-participant-'+id;
      const waiting=body.text.includes('需要问我'),running=body.text.includes('持续工作');
      const run={...fixture.run(waiting?'waiting-question':running?'running':'completed'),id:runId,participantId,model:body.model??'fixture-model',reasoningEffort:body.reasoningEffort,permissionMode:body.permissionMode};
      const entries=[...row.entries,{id:randomUUID(),sequence:(row.entries.at(-1)?.sequence??row.childOf.throughSequence)+1,kind:'message',role:'user',text:body.text,runId,participantId,createdAt:new Date().toISOString()},
        {id:randomUUID(),sequence:(row.entries.at(-1)?.sequence??row.childOf.throughSequence)+2,kind:'message',role:'assistant',text:waiting?'需要你的决定。':Array.from({length:30},(_,i)=>`支线答复第 ${i+1} 段：这里只是子对话的说明，不属于主对话。`).join('\n\n'),status:'completed',runId,participantId,provider:'codex',createdAt:new Date().toISOString()}];
      const pending=waiting?[{id:'child-question',kind:'question',title:'子对话范围确认',questions:[{id:'scope',label:'只处理支线',options:[{id:'yes',label:'仅此支线'}]}],conversationId:id,workspaceId:row.workspaceId,runId,participantId,generation:run.generation}]:[];
      update(row,{run,entries,requests:pending,participants:[{id:participantId,provider:'codex',connectionId:body.connectionId,label:'Codex',model:body.model??'fixture-model',deliveredThrough:entries.at(-1).sequence,contextId:'context-'+id}]});
      return route.fulfill({status:202,json:{conversation:row}});
    }
    if(action==='stop'){childStops++;update(row,{run:{...row.run,status:'stopped'},requests:[]});return route.fulfill({json:row});}
    if(action==='requests/child-question/reply'){childReplies++;assert.equal(request.postDataJSON().answer.scope,'yes');update(row,{run:{...row.run,status:'completed'},requests:[]});return route.fulfill({json:row});}
    if(action==='seen')return route.fulfill({json:{activity:{version:0,seenThrough:0,active:false,updatedAt:row.updatedAt}}});
    if(action==='observe')return route.fulfill({json:row});
    return route.fallback();
  };
  const patterns=['**/api/v1/workspaces/*/agent-conversations/**','**/api/v1/app/agent-service/conversations/**'];
  for(const pattern of patterns)await page.route(pattern,route);
  const window=()=>page.locator('.ac-child-window:not([hidden])');
  let firstId='',secondId='';
  try{
    await step('创建多个子浮窗不替换主对话，切换保留各自草稿和阅读位置',async()=>{
      await input().fill('主对话保持原来的工作');await panel().getByRole('button',{name:'发送对话',exact:true}).click();
      await panel().locator(':scope > .ac-thread-header[data-run-status="running"]').waitFor();
      const parentId=fixture.conversation.id;
      fixture.update({entries:[...fixture.conversation.entries,{id:'long-parent-answer',sequence:100,kind:'message',role:'assistant',text:Array.from({length:30},(_,i)=>`主线记录 ${i}，主对话应保持原阅读位置。`).join('\n\n'),status:'completed',createdAt:new Date().toISOString()}]});
      await page.reload();await input().waitFor();await input().fill('主对话未发送的文字');
      const stream=panel().locator(':scope > .ac-stream');
      await stream.evaluate((node:HTMLElement)=>{node.scrollTop=120;node.dispatchEvent(new Event('scroll'));});
      const top=await stream.evaluate((node:HTMLElement)=>node.scrollTop),before=JSON.stringify(fixture.conversation);
      await panel().getByRole('button',{name:'创建子对话',exact:true}).click();
      await window().getByRole('textbox',{name:'子对话输入',exact:true}).waitFor();firstId=await window().getAttribute('data-child-window');
      assert.equal(fixture.sends,1);assert.equal(childSends,0);assert.equal(JSON.stringify(fixture.conversation),before);
      await window().getByRole('textbox',{name:'子对话输入',exact:true}).fill('解释支线问题');
      await window().getByRole('button',{name:'发送对话',exact:true}).click();await window().getByText('支线答复第 30 段：这里只是子对话的说明，不属于主对话。',{exact:false}).waitFor();
      await window().getByRole('textbox',{name:'子对话输入',exact:true}).fill('第一条子对话草稿');
      const childStream=window().locator('.ac-stream');
      await childStream.evaluate((node:HTMLElement)=>{node.scrollTop=90;node.dispatchEvent(new Event('scroll'));});
      const childTop=await childStream.evaluate((node:HTMLElement)=>node.scrollTop);
      const created=page.waitForResponse((response:any)=>response.url().endsWith('/children')&&response.request().method()==='POST');
      await panel().getByRole('button',{name:'创建子对话',exact:true}).click();
      secondId=(await (await created).json()).id;
      await page.locator('[data-child-window="'+secondId+'"]:not([hidden])').getByRole('textbox',{name:'子对话输入',exact:true}).waitFor();assert.notEqual(firstId,secondId);
      await window().getByRole('textbox',{name:'子对话输入',exact:true}).fill('第二条子对话草稿');
      await page.locator('[data-child-entry="'+firstId+'"]').click();
      assert.equal(await window().getByRole('textbox',{name:'子对话输入',exact:true}).inputValue(),'第一条子对话草稿');
      assert.ok(Math.abs(await window().locator('.ac-stream').evaluate((node:HTMLElement)=>node.scrollTop)-childTop)<2);
      assert.equal(await input().inputValue(),'主对话未发送的文字');assert.equal(await panel().getAttribute('data-conversation-id'),parentId);
      assert.ok(Math.abs(await stream.evaluate((node:HTMLElement)=>node.scrollTop)-top)<2);assert.equal(await page.locator('.ac-child-window:not([hidden])').count(),1);
      await fixture.capture(page,'agent-conversation-child-windows.png');
    });
    await step('收起保留真实执行和待回应状态，子对话独立回答和停止',async()=>{
      await window().getByRole('textbox',{name:'子对话输入',exact:true}).fill('需要问我');await window().getByRole('button',{name:'发送对话',exact:true}).click();
      await window().getByText('子对话范围确认',{exact:true}).waitFor();await window().getByRole('button',{name:'收起子对话',exact:true}).click();
      await page.locator('[data-child-entry="'+firstId+'"]').getByText('等待回答',{exact:true}).waitFor();assert.equal(await window().count(),0);assert.equal(childReplies,0);
      await page.locator('[data-child-entry="'+firstId+'"]').click();await window().getByRole('radio',{name:'仅此支线',exact:true}).check();
      await window().getByRole('button',{name:'回答并继续',exact:true}).click();await window().getByText('子对话范围确认',{exact:true}).waitFor({state:'hidden'});assert.equal(childReplies,1);
      await page.locator('[data-child-entry="'+secondId+'"]').click();assert.equal(await window().getByRole('textbox',{name:'子对话输入',exact:true}).inputValue(),'第二条子对话草稿');
      await window().getByRole('textbox',{name:'子对话输入',exact:true}).fill('持续工作');await window().getByRole('button',{name:'发送对话',exact:true}).click();
      await window().getByRole('button',{name:'停止本次执行',exact:true}).waitFor();await window().getByRole('button',{name:'收起子对话',exact:true}).click();
      await page.locator('[data-child-entry="'+secondId+'"]').getByText('正在处理',{exact:true}).waitFor();assert.equal(childStops,0);
      await page.locator('[data-child-entry="'+secondId+'"]').click();await window().getByRole('button',{name:'停止本次执行',exact:true}).click();
      await page.locator('[data-child-entry="'+secondId+'"]').getByText('已停止',{exact:true}).waitFor();assert.equal(childStops,1);assert.equal(fixture.stops,0);assert.equal(fixture.conversation.run.status,'running');
      await page.reload();await input().waitFor();await page.locator('[data-child-entry="'+firstId+'"]').waitFor();await page.locator('[data-child-entry="'+secondId+'"]').waitFor();
      assert.equal(await input().inputValue(),'主对话未发送的文字');assert.equal(await window().count(),0);
    });
    await step('窄屏浮窗仍有独立输入和收起入口',async()=>{
      await page.setViewportSize({width:600,height:800});await page.locator('[data-child-entry="'+firstId+'"]').click();await window().getByRole('textbox',{name:'子对话输入',exact:true}).waitFor();
      const box=await window().boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=601&&box.y+box.height<=801,JSON.stringify(box));
      await window().getByRole('button',{name:'收起子对话',exact:true}).click();assert.equal(await window().count(),0);
    });
    await step('子对话分页不会被后台刷新重置',async()=>{
      await page.setViewportSize({width:1600,height:1000});
      let lastId='';
      for(let n=children.size;n<65;n++){
        lastId=randomUUID();
        const row={...structuredClone(children.get(firstId)),id:lastId,title:'分页子对话 '+n,entries:[],participants:[],requests:[]};
        delete row.run;children.set(lastId,row);
      }
      await panel().getByRole('button',{name:'更多子对话',exact:true}).waitFor();
      await panel().getByRole('button',{name:'更多子对话',exact:true}).click();
      await page.locator('[data-child-entry="'+[...children.keys()][59]+'"]').waitFor();
      const polled=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/children')&&response.request().method()==='GET'&&!new URL(response.url()).searchParams.has('cursor'));
      await polled;
      await panel().getByRole('button',{name:'更多子对话',exact:true}).click();
      await page.locator('[data-child-entry="'+lastId+'"]').waitFor();
      assert.equal(await page.locator('[data-child-entry]').count(),65);
      await panel().getByRole('button',{name:'更多子对话',exact:true}).waitFor({state:'hidden'});
    });
    await step('从子浮窗答复分叉按主动操作打开，收起后的迟到结果不切换主对话',async()=>{
      await page.locator('[data-child-entry="'+firstId+'"]').click();
      await window().getByRole('button',{name:'分支到新对话',exact:true}).last().waitFor();
      const parentId=fixture.conversation.id,started=new Promise<void>(resolve=>{startedFork=resolve;});holdFork=true;
      await window().getByRole('button',{name:'分支到新对话',exact:true}).last().click();await started;
      await window().getByRole('button',{name:'收起子对话',exact:true}).click();
      const response=page.waitForResponse((value:any)=>value.url().endsWith('/fork')&&value.request().method()==='POST');
      releaseFork?.();const branch=await (await response).json();
      await page.waitForFunction(()=>!document.querySelector('.ac-child-window .ac-fork-action .ant-btn-loading'));
      assert.equal(await panel().getAttribute('data-conversation-id'),parentId);assert.equal(await input().inputValue(),'主对话未发送的文字');assert.equal(await window().count(),0);
      await page.locator('[data-child-entry="'+firstId+'"]').click();
      await window().getByRole('button',{name:'分支到新对话',exact:true}).last().click();
      await page.locator('#agent-conversation-panel[data-conversation-id="'+branch.id+'"]').waitFor();
      assert.equal(await panel().locator('.ac-fork-origin').getAttribute('data-forked-from'),firstId);
      assert.equal(forkCalls,1);assert.equal(fixture.sends,1);assert.equal(fixture.stops,0);assert.equal(await window().count(),0);
    });
  }finally{releaseFork?.();for(const pattern of patterns)await page.unroute(pattern,route);}
}
