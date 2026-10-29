import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** history 场景使用独立准备的对话现场。 */
export async function runHistoryScenarios(fixture:AgentConversationFixture){
  const {capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,supplementaryInputs,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;
await step('指定答复分叉为独立对话，刷新保留来源并可返回原对话',async()=>{
  const original=structuredClone(fixture.conversation),additional=[...fixture.additionalConversations],sends=fixture.sends;
  try{
    const at=new Date().toISOString(),source=update({title:'分叉来源对话',requests:[],run:run('completed'),entries:[
      {id:'fork-user',sequence:1,runId:'fork-first',kind:'message',role:'user',text:'分叉前的问题',createdAt:at},
      {id:'fork-answer',sequence:2,runId:'fork-first',kind:'message',role:'assistant',text:'从这一轮分叉',status:'completed',createdAt:at},
      {id:'fork-later-user',sequence:3,runId:'run-fixture',kind:'message',role:'user',text:'不要带入的后续消息',createdAt:at},
      {id:'fork-later-answer',sequence:4,runId:'run-fixture',kind:'message',role:'assistant',text:'后续答复',status:'completed',createdAt:at},
    ]});
    await page.reload();await input().waitFor();
    await panel().locator('[data-entry-id="fork-answer"]').getByRole('button',{name:'分支到新对话',exact:true}).click();
    const origin=panel().locator('[data-forked-from="'+source.id+'"]');await origin.waitFor();
    await panel().getByRole('button',{name:'对话信息',exact:true}).filter({hasText:'新对话'}).waitFor();
    assert.equal(await panel().getByText('不要带入的后续消息',{exact:true}).count(),0);
    assert.equal(await input().inputValue(),'');assert.equal(fixture.sends,sends,'创建分支不发送工作指令');
    await page.reload();await origin.waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.ok(await panel().evaluate((node:HTMLElement)=>node.scrollWidth-node.clientWidth<=1),'窄屏来源提示不造成横向溢出');
    await capture(page,'agent-conversation-fork-origin.png');
    await origin.getByRole('button',{name:'分叉来源对话',exact:true}).click();
    await panel().getByText('不要带入的后续消息',{exact:true}).waitFor();
    assert.equal(fixture.conversation.id,source.id);assert.equal(fixture.sends,sends);
  }finally{
    fixture.conversation=original;fixture.additionalConversations=additional;
    await page.setViewportSize({width:1600,height:1000});await page.reload();await input().waitFor();
  }
});
await step('顶部正文输入与列表共用最大宽度，宽屏居中且窄屏自适应',async()=>{
  const sends=fixture.sends;
  const toggleFull=async(label:string)=>{await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});};
  const checkConversation=async(label:string)=>{
    const geometry=await panel().evaluate((node:HTMLElement)=>{
      const rect=(item:Element)=>{const r=item.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width};};
      const content=(item:Element)=>{const r=rect(item),style=getComputedStyle(item);return{left:r.left+parseFloat(style.paddingLeft),right:r.right-parseFloat(style.paddingRight)};};
      return{host:rect(node),header:rect(node.querySelector('.ac-thread-header')!),title:content(node.querySelector('.ac-thread-header')!),participants:content(node.querySelector('.ac-participants')!),messages:content(node.querySelector('.ac-message-list')!),composer:rect(node.querySelector('.ac-composer')!),max:parseFloat(getComputedStyle(node).getPropertyValue('--ac-content-width'))};
    });
    for(const edge of ['left','right'] as const){for(const area of ['title','participants','messages'] as const)assert.ok(Math.abs(geometry[area][edge]-geometry.composer[edge])<1,label+' '+area+' '+edge+' '+JSON.stringify(geometry));}
    assert.equal(geometry.header.width,geometry.host.width,'顶部背景保持铺满');assert.equal(geometry.max,800);
    await capture(page,'conversation-shared-width-'+label+'.png');
  };
  const checkHistory=async(label:string)=>{
    await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('.ac-history-row').first().waitFor();
    const geometry=await panel().locator('.ac-history').evaluate((node:HTMLElement)=>{
      const rect=(item:Element)=>{const r=item.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width};};
      const body=node.querySelector<HTMLElement>('.ac-history-body')!;return{host:rect(node),body:rect(body),header:rect(node.querySelector('.ac-thread-header')!),toolbar:rect(node.querySelector('.ac-history-toolbar')!),stats:rect(node.querySelector('.ac-execution-summary')!),group:rect(node.querySelector('.ac-history-group')!),overflow:body.scrollWidth-body.clientWidth};
    });
    assert.ok(Math.abs(geometry.body.width-Math.min(800,geometry.host.width))<1,label+'列表宽度封顶');
    assert.ok(Math.abs((geometry.body.left-geometry.host.left)-(geometry.host.right-geometry.body.right))<1,label+'居中');
    for(const area of ['stats','group'] as const){assert.ok(Math.abs(geometry[area].left-geometry.toolbar.left)<1);assert.ok(Math.abs(geometry[area].right-geometry.toolbar.right)<1);}
    assert.equal(geometry.header.width,geometry.host.width);assert.ok(geometry.overflow<=1,label+'无横向溢出');
    await capture(page,'conversation-history-width-'+label+'.png');await panel().getByRole('button',{name:'返回当前对话',exact:true}).click();
  };
  try{
    await checkConversation('sidebar');await checkHistory('sidebar');await toggleFull('专注对话');
    for(const [label,width,height] of [['wide',2048,1152],['desktop',1280,900],['mobile',375,844]] as const){await page.setViewportSize({width,height});await checkConversation(label);await checkHistory(label);}
    assert.equal(fixture.sends,sends,'调整布局和查看列表不发送工作');
  }finally{
    await page.setViewportSize({width:1600,height:1000});const back=panel().getByRole('button',{name:'返回当前对话',exact:true});if(await back.isVisible())await back.click();
    if((await panel().getAttribute('class'))?.includes('is-full'))await toggleFull('恢复分屏');
  }
});

await step('列表手动从末条加载，整行折叠与拖动互不干扰',async()=>{
  const original=fixture.additionalConversations,requests:Array<{workspaceId:string|null;query:string|null;limit:number;cursor:string|null}>=[];
  let fail=false,stale=false,release:(()=>void)|undefined,started:(()=>void)|undefined;
  const held=new Promise<void>(resolve=>{started=resolve;});
  const matcher='**/api/v1/app/agent-service/conversations?*';
  const intercept=async(route:any)=>{
    const url=new URL(route.request().url()),space=url.searchParams.get('workspaceId'),limit=Number(url.searchParams.get('limit'));
    requests.push({workspaceId:space,query:url.searchParams.get('query'),limit,cursor:url.searchParams.get('cursor')});
    if(url.searchParams.get('query')==='迟到现场'&&space===workspaceId){started?.();await new Promise<void>(resolve=>{release=resolve;});}
    if((fail||stale)&&space===workspaceId&&limit===10)return route.fulfill({status:stale?409:503,json:{error:{code:stale?'agent_cursor_stale':'fixture_unavailable',message:stale?'列表位置已变化，请刷新后继续。':'分组暂不可用'}}});
    await route.fallback();
  };
  await page.route(matcher,intercept);
  try{
    const make=(id:string,space:string)=>({...fixture.conversation,id,workspaceId:space,title:'分批现场 '+id,entries:[],participants:[],run:undefined,activity:undefined});
    const registry=await (await page.request.get(new URL('/api/v1/workspaces',workspaceUrl).href)).json();
    const otherId=registry.workspaces.find((entry:any)=>entry.workspace?.id&&entry.workspace.id!==workspaceId)?.workspace.id;assert.ok(otherId);
    fixture.additionalConversations=[make('other-batch',otherId),...Array.from({length:26},(_,i)=>make('batch-'+i,workspaceId)),...Array.from({length:8},(_,i)=>make('default-batch-'+i,'@default'))];
    await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();
    const search=panel().getByRole('textbox',{name:'搜索对话',exact:true});await search.fill('分批现场');
    await panel().locator('.ac-history-toolbar .ant-select-selector').click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^全部工作空间$/}).click();
    const group=panel().locator('[data-history-workspace="'+workspaceId+'"]'),defaults=panel().locator('[data-history-workspace="@default"]'),header=group.locator('.ac-history-group-toggle');
    const count=async(n:number)=>{await page.waitForFunction(({id,n}:any)=>document.querySelectorAll('[data-history-workspace="'+id+'"] .ac-history-row').length===n,{id:workspaceId,n});};
    const groupCalls=()=>requests.filter(row=>row.workspaceId===workspaceId&&row.query==='分批现场');
    await count(5);await defaults.locator('.ac-history-row').first().waitFor();assert.equal(await defaults.locator('.ac-history-row').count(),5);
    const other=panel().locator('[data-history-workspace="'+otherId+'"]'),otherHeader=other.locator('.ac-history-group-toggle');await other.locator('.ac-history-row').waitFor();
    const order=()=>panel().locator('[data-history-workspace]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.dataset.historyWorkspace));
    assert.equal(await group.locator('.ac-history-group-handle').count(),0);
    await header.dragTo(otherHeader,{targetPosition:{x:20,y:2}});assert.deepEqual(await order(),[workspaceId,otherId,'@default']);await count(5);
    const box=await otherHeader.boundingBox();await header.dragTo(otherHeader,{targetPosition:{x:20,y:box!.height-2}});assert.deepEqual(await order(),[otherId,workspaceId,'@default']);await count(5);
    await header.press('Alt+ArrowUp');assert.deepEqual(await order(),[workspaceId,otherId,'@default']);assert.equal(await header.getAttribute('aria-expanded'),'true');
    const callsBefore=groupCalls().length;await page.waitForTimeout(5300);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);assert.equal(groupCalls().length,callsBefore,'等待和窗口焦点不重读列表');
    assert.equal(await group.getByRole('button',{name:'收起',exact:true}).count(),0);
    for(const n of [15,25,26]){await group.getByRole('button',{name:'加载更多',exact:true}).click();await count(n);}
    assert.deepEqual(groupCalls().slice(-3).map(row=>({limit:row.limit,cursor:row.cursor})),[{limit:10,cursor:'5'},{limit:10,cursor:'15'},{limit:10,cursor:'25'}]);assert.equal(await group.getByRole('button',{name:'加载更多',exact:true}).count(),0);
    await header.click();await count(0);assert.equal(await header.getAttribute('aria-expanded'),'false');await header.press('Enter');await count(5);assert.equal(groupCalls().at(-1)!.limit,5);assert.equal(groupCalls().at(-1)!.cursor,null);
    await defaults.getByRole('button',{name:'加载更多',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-history-workspace="@default"] .ac-history-row').length===8);
    fixture.expectedBrowserErrors.add('503');fixture.expectedBrowserErrors.add('Service Unavailable');fail=true;await group.getByRole('button',{name:'加载更多',exact:true}).click();await group.getByText('分组暂不可用',{exact:true}).waitFor();await count(5);fail=false;await group.getByRole('button',{name:/重\s*试/}).click();await count(15);
    fixture.expectedBrowserErrors.add('409');fixture.expectedBrowserErrors.add('Conflict');stale=true;await group.getByRole('button',{name:'加载更多',exact:true}).click();await group.getByText('列表位置已变化，请刷新后继续。',{exact:true}).waitFor();await count(15);stale=false;await group.getByRole('button',{name:'刷新列表',exact:true}).click();await count(5);
    await search.fill('迟到现场');await held;await search.fill('分批现场');await count(5);release?.();await page.waitForTimeout(100);await count(5);
    await capture(page,'conversation-history-manual-controls.png');
  }finally{
    release?.();fail=false;stale=false;fixture.additionalConversations=original;await page.unroute(matcher,intercept);
    const back=panel().getByRole('button',{name:'返回当前对话',exact:true});if(await back.isVisible())await back.click();await input().waitFor();
  }
});

await step('首个回复前使用本轮实际智能体和模型，切换草稿或刷新不改写历史',async()=>{
      const previous=structuredClone(fixture.conversation),createdAt=new Date().toISOString();
      const participants=[{id:'participant-dsh',connectionId:'dsh',provider:'dsh',label:'DSH',model:'fixture-fast',contextId:'old',deliveredThrough:0},{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-fast',contextId:'current',deliveredThrough:0}];
      const entries=[{id:'old-prompt',sequence:1,kind:'message',role:'user',text:'上一轮',runId:'old-run',createdAt},{id:'old-answer',sequence:2,kind:'message',role:'assistant',text:'上一轮回复',runId:'old-run',participantId:'participant-dsh',provider:'dsh',createdAt},{id:'awaiting-prompt',sequence:3,kind:'message',role:'user',text:'新一轮等待回复',runId:'run-fixture',status:'sending',createdAt}];
      update({participants,entries,run:run('starting','codex',{accepted:false,model:'fixture-model'}),requests:[]});await page.reload();await input().waitFor();
      const current=()=>panel().locator('[data-turn-id="awaiting-prompt"] .ac-turn-identity-link');
      const old=()=>panel().locator('[data-turn-id="old-prompt"] .ac-turn-identity-link');
      assert.equal(await current().innerText(),'Codex · Fixture model','启动中按执行编号识别没有参与方字段的用户输入');
      assert.equal(await old().innerText(),'DSH · Fast model','历史名称来自历史参与方而非当前执行');
      update({run:run('running','codex',{model:'fixture-model'})});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator('.ac-turn.is-executing').waitFor();assert.equal(await current().innerText(),'Codex · Fixture model');
      await chooseAgent('Qoder');await chooseModel('Fast model');await closeModelSettings();assert.equal(await current().innerText(),'Codex · Fixture model','输入区下一轮选择不能重标当前执行');assert.equal(await old().innerText(),'DSH · Fast model');
      await page.reload();await input().waitFor();assert.equal(await current().innerText(),'Codex · Fixture model','刷新后仍从执行记录恢复名称');
      update({entries:[...entries,{id:'first-reply',sequence:4,kind:'message',role:'assistant',text:'开始处理',runId:'run-fixture',participantId:'participant-codex',provider:'codex',createdAt}]});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator('[data-entry-id="first-reply"]').waitFor();assert.equal(await current().innerText(),'Codex · Fixture model','首条回复到达前后名称一致');
      const streamForPin=panel().locator('.ac-stream');
      await streamForPin.evaluate((node:HTMLElement)=>{node.scrollTop=node.scrollHeight;const grow=document.createElement('div');grow.id='late-growth';grow.style.height='240px';document.querySelector('.ac-compose-wrap')?.appendChild(grow);});
      await page.waitForTimeout(300);
      const pinned=await streamForPin.evaluate((node:HTMLElement)=>({distance:node.scrollHeight-node.clientHeight-node.scrollTop,button:document.querySelectorAll('.ac-scroll-latest').length}));
      assert.ok(pinned.distance<24,'底部布局增高后应重新贴底 '+JSON.stringify(pinned));assert.equal(pinned.button,0,'贴底时布局变化不弹出到底按钮');
      await streamForPin.evaluate((node:HTMLElement)=>{document.querySelector('#late-growth')?.remove();});
      await streamForPin.evaluate((node:HTMLElement)=>{const grow=document.createElement('div');grow.id='late-growth-2';grow.style.height='120px';document.querySelector('.ac-compose-wrap')?.appendChild(grow);node.dispatchEvent(new Event('scroll'));});
      await page.waitForTimeout(250);
      const pinned2=await streamForPin.evaluate((node:HTMLElement)=>({distance:Math.round(node.scrollHeight-node.clientHeight-node.scrollTop),button:document.querySelectorAll('.ac-scroll-latest').length}));
      assert.ok(pinned2.distance<24,'贴底时视口收缩伴随滚动事件不应丢失贴底态 '+JSON.stringify(pinned2));assert.equal(pinned2.button,0,'贴底态丢失会误弹到底按钮');
      await streamForPin.evaluate((node:HTMLElement)=>{document.querySelector('#late-growth-2')?.remove();});
      fixture.conversation=previous;await page.reload();await input().waitFor();
    });

await step('历史两行展示完整标识，标题可复制同一标识且保留导航',async()=>{
      const identity='a63c0c92-c53d-4d8a-8a37-73f0169b282f',originalId=fixture.conversation.id,viewport=page.viewportSize();
      fixture.additionalConversations.push({...fixture.conversation,id:identity,workspaceId:workspaceId,title:'用于验证长标题不会挤出第三行的对话，标题超出时应保持在一行内',entries:[],participants:[],run:undefined,activity:undefined});
      const history=async()=>{await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('.ac-history-list button[data-conversation-id="'+identity+'"]').waitFor();};
      const assertTwoLines=async()=>{
        const row=panel().locator('.ac-history-list button[data-conversation-id="'+identity+'"]');assert.equal(await row.locator('.ac-history-id').innerText(),identity);
        const copyOrder=await row.evaluate((node:HTMLElement)=>{const parent=node.parentElement!,copy=parent.querySelector('.ac-history-row-copy')!,id=node.querySelector('.ac-history-id')!;const a=copy.getBoundingClientRect(),b=id.getBoundingClientRect();return{copyLeft:a.left,copyRight:a.right,idLeft:b.left,copyMid:a.top+a.height/2,idMid:b.top+b.height/2};});
        assert.ok(copyOrder.copyRight<=copyOrder.idLeft&&Math.abs(copyOrder.copyMid-copyOrder.idMid)<4,JSON.stringify(copyOrder));
        const geometry=await row.evaluate((node:HTMLElement)=>{const title=node.querySelector('strong')!,meta=node.querySelector('small')!;return{height:node.getBoundingClientRect().height,title:title.getBoundingClientRect().height,meta:meta.getBoundingClientRect().height,overflow:node.scrollWidth>node.clientWidth};});
        assert.ok(geometry.height<=60&&geometry.title<=21&&geometry.meta<=19&&!geometry.overflow,JSON.stringify(geometry));
      };
      await history();await assertTwoLines();
      const toolbar=panel().locator('.ac-history-toolbar');assert.equal(await toolbar.locator(':scope > :first-child').getAttribute('class').then((value:string)=>value.includes('ant-input')),true,'搜索在前');assert.equal(await toolbar.locator('.ant-select-selection-item').innerText().then((value:string)=>value==='browser-e2e'),true,'默认当前工作空间');
      const toolbarSizes=await toolbar.evaluate((node:HTMLElement)=>({search:node.querySelector('.ant-input-affix-wrapper')!.getBoundingClientRect().width,workspace:node.querySelector('.ant-select')!.getBoundingClientRect().width}));assert.ok(toolbarSizes.workspace<=128&&toolbarSizes.search>toolbarSizes.workspace,JSON.stringify(toolbarSizes));
      await capture(page,'agent-conversation-history-desktop.png');
      await panel().locator('.ac-history-list button[data-conversation-id="'+identity+'"]').click();await panel().locator('.ac-thread-identity').waitFor();assert.equal(await panel().locator('.ac-thread-identity>span').innerText(),identity);
      await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__conversationCopiedId=text;}}});});
      await panel().getByRole('button',{name:'复制对话 ID',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).__conversationCopiedId),identity);const copiedButton=panel().getByRole('button',{name:'已复制',exact:true});await copiedButton.waitFor();assert.equal(await copiedButton.isDisabled(),true,'复制成功后图标切换且不可重复点击');assert.equal(await panel().getByText('对话 ID 已复制。',{exact:true}).count(),0);await panel().getByRole('button',{name:'复制对话 ID',exact:true}).waitFor({timeout:6000});const heading=await panel().locator('.ac-thread-header').boundingBox(),titleBox=await panel().locator('.ac-thread-title').boundingBox(),identityBox=await panel().locator('.ac-thread-identity').boundingBox();assert.ok(heading!.height<=43&&identityBox!.x>=titleBox!.x+titleBox!.width&&Math.abs((titleBox!.y+titleBox!.height/2)-(identityBox!.y+identityBox!.height/2))<3,'标题和ID同一行');assert.equal(await panel().locator('.ac-thread-identity>:first-child').getAttribute('aria-label'),'复制对话 ID');
      await page.evaluate(()=>{delete (navigator as any).clipboard;delete (window as any).__conversationCopiedId;});await capture(page,'agent-conversation-identity-desktop.png');
      await page.setViewportSize({width:390,height:844});await panel().locator('.ac-thread-identity').waitFor();assert.ok(await panel().getByRole('button',{name:'复制对话 ID',exact:true}).isVisible());await capture(page,'agent-conversation-identity-mobile.png');
      await history();await assertTwoLines();await capture(page,'agent-conversation-history-mobile.png');await panel().locator('.ac-history-list button[data-conversation-id="'+originalId+'"]').click();await input().waitFor();fixture.additionalConversations=fixture.additionalConversations.filter(item=>item.id!==identity);await page.setViewportSize(viewport);
    });

await step('连续工具默认汇总折叠，明确展开在追加时保持，结束折叠且展开后失败提醒靠右',async()=>{
      const previous=structuredClone(fixture.conversation);
      const tool=(id:string,status='completed')=>({id,sequence:id==='single-tool'?1:2,kind:'tool',role:'system',name:'command',text:'echo verify\ncommand output',status,runId:'run-fixture',createdAt:new Date().toISOString()});
      update({entries:[tool('single-tool')],run:run('running')});await page.reload();
      const initialGroup=panel().locator('.ac-step-group');await initialGroup.locator(':scope>summary').waitFor();assert.equal(await initialGroup.getAttribute('open'),null);assert.equal(await panel().locator('.ac-step').count(),0,'工具默认只显示汇总');
      assert.equal(await initialGroup.locator(':scope>summary .ac-execution-light').count(),1,'执行中工具行显示呼吸光点');const light=initialGroup.locator(':scope>summary>.ac-execution-light');assert.equal(await light.evaluate((node:HTMLElement)=>node===node.parentElement?.firstElementChild),true,'光点在工具图标之前');const color=await light.evaluate((node:HTMLElement)=>getComputedStyle(node).color);const identityColor=await panel().locator('.ac-execution-indicator').first().evaluate((node:HTMLElement)=>getComputedStyle(node).color);assert.equal(color,identityColor,'工具光点使用标识行相同主题色');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await light.evaluate((node:HTMLElement)=>getComputedStyle(node).animationName),'none');assert.equal(await panel().locator('.ac-execution-indicator .ac-execution-light').first().evaluate((node:HTMLElement)=>getComputedStyle(node).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});assert.equal(await initialGroup.locator(':scope>summary .ac-step-action').count(),0,'执行中工具行不显示调用统计');assert.equal(await initialGroup.locator(':scope>summary .ac-step-chevron').count(),0,'执行中工具行尾部无其他内容');await initialGroup.locator(':scope>summary').click();
      const first=panel().locator('[data-entry-id="single-tool"]');await first.locator(':scope>summary').waitFor();
      const handle=await first.elementHandle();await first.locator(':scope>summary').click();await first.locator('.ac-tool-detail').waitFor();
      update({entries:[tool('single-tool'),tool('second-tool','failed')]});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await panel().locator('[data-entry-id="second-tool"]').waitFor();assert.equal(await first.evaluate((node:HTMLElement,old:HTMLElement)=>node===old,handle),true);assert.equal(await first.getAttribute('open'),'');
      await panel().locator('[data-entry-id="second-tool"]>summary').click();assert.match(await panel().locator('[data-entry-id="second-tool"]').innerText(),/失败/);
      update({run:run('completed')});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator('.ac-process[data-process-state="settled"]').waitFor({state:'attached'});assert.equal(await panel().locator('.ac-process[open]').count(),0);
      await panel().getByRole('button',{name:'展开处理过程',exact:true}).click();assert.equal(await panel().locator('.ac-process-timeline').evaluate((node:HTMLElement)=>getComputedStyle(node).borderLeftWidth),'0px');assert.match(await panel().locator('.ac-step-group').first().innerText(),/1 项失败/,'失败数在工具组汇总靠右展示');
      const caretOrder=await panel().locator('.ac-turn-identity-toggle').first().evaluate((node:HTMLElement)=>{const kids=[...node.children].map(child=>child.className.toString());return {name:kids.findIndex(cls=>cls.includes('ac-turn-identity-name')),indicator:kids.findIndex(cls=>cls.includes('ac-execution-indicator')),caret:kids.findIndex(cls=>cls.includes('ac-turn-identity-caret'))};});assert.ok(caretOrder.name<caretOrder.indicator&&caretOrder.indicator<caretOrder.caret,'折叠图标放在时间后面');
      await capture(page,'conversation-live-process-flat.png');await handle?.dispose();fixture.conversation=previous;await page.reload();await input().waitFor();
    });

await step('执行中图文普通发送、固定上下文和长输入，失败未知与独立停止',async()=>{
      const previous=structuredClone(fixture.conversation),previousUploads=fixture.attachmentUploads,startedAt=new Date(Date.now()-125000).toISOString();
      const entry=(id:string,sequence:number,role:string,text:string)=>({id,sequence,kind:'message',role,text,provider:'codex',participantId:'participant-codex',runId:'run-fixture',createdAt:new Date().toISOString(),status:'completed'});
      const long=Array.from({length:25},(_,i)=>`${i+1}. 保留完整用户要求，展开后在固定区域阅读。`).join('\n');
      update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[entry('long-user',1,'user',long),entry('live-narration',2,'assistant',Array.from({length:40},(_,i)=>'自然执行过程 '+i).join('\n\n'))],run:run('running','codex',{startedAt,model:'fixture-model'}),requests:[]});await page.reload();await input().fill('');
      assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),true);assert.equal(await panel().locator('.ac-compose-wrap').getByRole('button',{name:'停止本次执行',exact:true}).count(),1);assert.equal(await panel().locator('.ac-thread-actions').getByRole('button',{name:'停止本次执行',exact:true}).count(),0);
      const stream=panel().locator('.ac-stream');await stream.evaluate((node:HTMLElement)=>node.scrollTop=300);const stickyHead=panel().locator('.ac-turn.is-executing>.ac-turn-head');const sticky=await stickyHead.evaluate((node:HTMLElement)=>({top:node.getBoundingClientRect().top,stream:node.closest('.ac-stream')!.getBoundingClientRect().top,position:getComputedStyle(node).position}));assert.equal(sticky.position,'sticky');assert.ok(Math.abs(sticky.top-sticky.stream)<2,JSON.stringify(sticky));assert.equal(await panel().locator('.ac-turn.is-executing>.ac-turn-head>.ac-turn-context').evaluate((node:HTMLElement)=>getComputedStyle(node).position),'static','气泡自身不吸顶，随吸顶头一起固定');
      await panel().getByRole('button',{name:'展开内容',exact:true}).first().click();assert.equal(await panel().locator('.ac-turn-prompt-content').first().evaluate((node:HTMLElement)=>getComputedStyle(node).overflowY),'auto');await panel().getByRole('button',{name:'收起内容',exact:true}).click();assert.match(await panel().locator('.ac-turn-identity').first().innerText(),/Codex · Fixture model/);assert.ok(await panel().locator('.ac-turn-identity .ac-execution-indicator').first().innerText()!=='0:00');
      const png={name:'live.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')};await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles(png);await panel().getByRole('button',{name:'移除图片 live.png',exact:true}).waitFor();await input().fill('执行中补充图文');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('.ac-turn-prompt').filter({hasText:'执行中补充图文'}).waitFor();assert.equal(await input().inputValue(),'');assert.deepEqual(supplementaryInputs.at(-1).attachmentIds,['image-fixture-'+(previousUploads+1)]);
      fixture.supplementaryDelivery='rejected';await input().fill('保留失败草稿');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().getByText('这条消息未发送成功，文字与图片已保留。',{exact:true}).waitFor();assert.equal(await input().inputValue(),'保留失败草稿');
      fixture.supplementaryDelivery='unknown';await input().fill('接收待确认');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().getByText('这条消息是否接收尚待确认，请先核对原执行，不要重复发送。',{exact:true}).waitFor();assert.equal(await input().inputValue(),'');
      fixture.supplementaryDelivery='accepted';fixture.holdSupplement=true;const waiting=new Promise<void>(resolve=>{fixture.supplementStarted=resolve;});await input().fill('发送等待时可以停止');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await waiting;await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();const admitted=page.waitForResponse((r:any)=>r.url().endsWith('/supplement'));fixture.releaseSupplement!();await admitted;assert.equal(fixture.supplementaryCalls,4);await panel().getByRole('button',{name:'发送对话',exact:true}).waitFor();
      fixture.conversation=previous;fixture.attachmentUploads=previousUploads;await page.reload();await input().fill('下一轮仍是草稿');
    });

await step('历史无卡片且自然滚动，智能体标识可展开折叠，长过程可就近收起',async()=>{
      const previous=structuredClone(fixture.conversation),viewport=page.viewportSize();
      const item=(id:string,sequence:number,kind:string,role:string,text:string)=>({id,sequence,kind,role,text,name:kind==='tool'?'command':undefined,provider:'codex',participantId:'participant-codex',runId:'run-fixture',status:'completed',createdAt:new Date().toISOString()});
      const entries=[item('controls-user',1,'message','user','检查长过程时，输入和助手必须可以就近定位与收起。'),...Array.from({length:18},(_,i)=>[
        item('controls-note-'+i,i*3+2,'message','assistant',`检查第 ${i+1} 项：保留用户上下文、工具汇总和原阅读位置。`),
        item('controls-tool-'+i+'-a',i*3+3,'tool','system','echo first\noutput'),item('controls-tool-'+i+'-b',i*3+4,'tool','system','echo second\noutput')
      ]).flat(),item('controls-answer',60,'message','assistant',Array.from({length:30},(_,i)=>'最终答复内容 '+i).join('\n\n'))];
      update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries,nextEntryCursor:undefined,run:run('completed','codex',{model:'fixture-model'}),requests:[]});await page.reload();await input().waitFor();
      const stream=panel().locator('.ac-stream'),context=panel().locator('.ac-turn-context'),identity=panel().locator('.ac-turn-identity'),process=panel().locator('.ac-process');
      const settle=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await stream.evaluate((node:HTMLElement)=>node.scrollTop=0);await identity.getByRole('button',{name:'展开处理过程',exact:true}).click();await identity.getByRole('button',{name:'收起处理过程',exact:true}).waitFor();await stream.evaluate((node:HTMLElement)=>node.scrollTop=550);await settle();
      const bounds=await context.evaluate((node:HTMLElement)=>{const style=getComputedStyle(node),r=node.getBoundingClientRect(),s=node.closest('.ac-stream')!.getBoundingClientRect();return{top:r.top,stream:s.top,position:style.position,border:style.borderTopWidth,shadow:style.boxShadow};});
      assert.ok(bounds.top<bounds.stream-100,JSON.stringify(bounds));assert.equal(bounds.position,'static');assert.equal(bounds.border,'0px');assert.equal(bounds.shadow,'none');
      const outer=await page.evaluate(()=>window.scrollY);assert.equal(await context.getByRole('button',{name:'定位用户输入',exact:true}).count(),0);assert.equal(await context.locator('.ac-turn-locate-icon').count(),0);
      await stream.evaluate((node:HTMLElement)=>node.scrollTop=550);await identity.getByRole('button',{name:'收起处理过程',exact:true}).click();await settle();assert.equal(await process.getAttribute('data-expanded'),'false','再次点击智能体标识折叠处理过程');assert.ok(await stream.evaluate((node:HTMLElement)=>node.scrollTop<60));
      assert.equal(await page.evaluate(()=>window.scrollY),outer);
      await stream.evaluate((node:HTMLElement)=>node.scrollTop=550);await identity.getByRole('button',{name:'展开处理过程',exact:true}).click();await settle();assert.equal(await process.getAttribute('data-expanded'),'true');
      await identity.getByRole('button',{name:'收起处理过程',exact:true}).click();await settle();assert.equal(await process.getAttribute('data-expanded'),'false');
      const collapsed=await identity.getByRole('button',{name:'展开处理过程',exact:true}).evaluate((node:HTMLElement)=>({top:node.getBoundingClientRect().top,stream:node.closest('.ac-stream')!.getBoundingClientRect().top}));assert.ok(collapsed.top>=collapsed.stream-2,JSON.stringify(collapsed));
      await identity.getByRole('button',{name:'展开处理过程',exact:true}).click();const group=process.locator('.ac-step-group').first();await group.locator(':scope>summary').click();assert.equal(await group.locator('.ac-step-group-items').evaluate((node:HTMLElement)=>getComputedStyle(node).borderLeftWidth),'0px');await group.locator(':scope>.ac-process-collapse').click();assert.equal(await group.getAttribute('open'),null);
      await page.setViewportSize({width:390,height:844});await stream.evaluate((node:HTMLElement)=>node.scrollTop=400);await settle();assert.ok(await identity.getByRole('button',{name:'收起处理过程',exact:true}).isVisible());assert.ok(await panel().evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth));await capture(page,'conversation-flow-controls-narrow.png');
      await page.setViewportSize(viewport);await capture(page,'conversation-flow-controls-desktop.png');fixture.conversation=previous;await page.reload();await input().waitFor();
    });

await step('仅当前运行段悬浮，历史无嵌套卡片，结束失败停止和待回应立即恢复自然排版',async()=>{
      const previous=structuredClone(fixture.conversation),viewport=page.viewportSize();
      const entry=(id:string,sequence:number,role:string,text:string,runId:string)=>({id,sequence,kind:'message',role,text,provider:'codex',participantId:'participant-codex',runId,status:'completed',createdAt:new Date().toISOString()});
      const entries=[entry('past-user',1,'user','此前已经完成的要求。','past-run'),entry('past-answer',2,'assistant',Array.from({length:25},(_,i)=>'已完成的历史答复 '+i).join('\n\n'),'past-run'),entry('current-user',3,'user','只在这次执行期间固定当前要求。','run-fixture'),entry('current-narration',4,'assistant',Array.from({length:35},(_,i)=>'当前执行过程 '+i).join('\n\n'),'run-fixture')];
      const startedAt=new Date(Date.now()-125000).toISOString();
      update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries,nextEntryCursor:undefined,run:run('running','codex',{model:'fixture-model',startedAt}),requests:[]});await page.reload();await input().waitFor();
      const stream=panel().locator('.ac-stream'),current=panel().locator('.ac-turn.is-executing'),past=panel().locator('[data-turn-id="past-user"]');
      await current.waitFor();assert.equal(await current.count(),1);assert.equal(await past.locator('.ac-turn-context').evaluate((node:HTMLElement)=>getComputedStyle(node).position),'static');
      await stream.evaluate((node:HTMLElement)=>{const turn=node.querySelector<HTMLElement>('.ac-turn.is-executing')!;node.scrollTop+=turn.getBoundingClientRect().top-node.getBoundingClientRect().top+220;});
      const style=await current.locator('.ac-turn-head').evaluate((node:HTMLElement)=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return{top:r.top,stream:node.closest('.ac-stream')!.getBoundingClientRect().top,position:s.position,side:s.borderLeftWidth,radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor,contextInside:Boolean(node.querySelector(':scope>.ac-turn-context')),identityInside:Boolean(node.querySelector(':scope>.ac-turn-identity'))};});
      assert.ok(Math.abs(style.top-style.stream)<2,JSON.stringify(style));assert.equal(style.position,'sticky');assert.equal(style.side,'0px');assert.equal(style.radius,'0px');assert.notEqual(style.shadow,'none');assert.notEqual(style.background,'rgba(0, 0, 0, 0)');assert.ok(style.contextInside&&style.identityInside,'气泡与标识行一同进入吸顶头');
      assert.equal(await current.locator('.ac-turn-identity').evaluate((node:HTMLElement)=>getComputedStyle(node).borderBottomWidth),'1px');
      const name=await current.locator('.ac-turn-identity-link').evaluate((node:HTMLElement)=>({font:getComputedStyle(node).fontSize,underline:getComputedStyle(node).textDecorationLine}));assert.equal(name.font,'12px');assert.equal(name.underline,'none');assert.equal(await panel().locator('.ac-execution-indicator.is-active').count(),1);
      assert.equal(await current.locator('.markdown-body p').first().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'15px');
      assert.equal(await input().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'15px');
      await page.setViewportSize({width:390,height:844});assert.ok(await panel().evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth));await capture(page,'conversation-running-context-narrow.png');await page.setViewportSize(viewport);
      for(const status of ['completed','failed','stopped','waiting-approval','unknown']){
        update({run:run(status,'codex',{model:'fixture-model',startedAt})});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator(status==='waiting-approval'?'[data-execution-state="'+status+'"]':'[data-run-status="'+status+'"]').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.ac-turn.is-executing').length===0);
        assert.equal(await panel().locator('.ac-execution-indicator.is-active').count(),0);
        const styles=await panel().locator('.ac-turn-context').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({position:getComputedStyle(node).position,border:getComputedStyle(node).borderTopWidth,shadow:getComputedStyle(node).boxShadow})));for(const s of styles){assert.equal(s.position,'static',status);assert.equal(s.border,'0px',status);assert.equal(s.shadow,'none',status);}
        const lineStyles=await panel().locator('.ac-turn-identity').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({position:getComputedStyle(node).position,shadow:getComputedStyle(node).boxShadow})));for(const s of lineStyles){assert.equal(s.position,'static',status);assert.equal(s.shadow,'none',status);}
        const headStyles=await panel().locator('.ac-turn-head').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({position:getComputedStyle(node).position,shadow:getComputedStyle(node).boxShadow})));for(const s of headStyles){assert.equal(s.position,'static',status);assert.equal(s.shadow,'none',status);}
      }
      await capture(page,'conversation-running-context-history.png');fixture.conversation=previous;await page.reload();await input().waitFor();
    });

await step('向上接近历史自动单批加载，阅读定位与展开保持，键盘触摸及失败重试隔离',async()=>{
      const previous=structuredClone(fixture.conversation),oldViewport=page.viewportSize(),readsBefore=fixture.entryReads;
      const entry=(sequence:number,kind:string,role:string,round:number)=>({id:'history-'+sequence,sequence,kind,role,runId:'history-round-'+round,name:kind==='tool'?'read':undefined,text:kind==='tool'?'读取 a.ts':role==='user'?'更早的用户要求 '+sequence:Array.from({length:10},(_,i)=>`第 ${round} 轮答复的阅读内容 ${i}`).join('\n\n'),input:kind==='tool'?'{}':undefined,status:'completed',createdAt:new Date().toISOString()});
      const rounds=(start:number)=>Array.from({length:5},(_,i)=>{const first=start+i*4;return [entry(first,'message','user',first),entry(first+1,'tool','system',first),entry(first+2,'tool','system',first),entry(first+3,'message','assistant',first)];}).flat();
      const current=rounds(201);current.at(-1)!.text=Array.from({length:40},(_,i)=>'用于保持阅读位置的最后答复 '+i).join('\n\n');
      update({entries:current,nextEntryCursor:201,run:run('completed')});
      for(const before of [201,181,161,141,121])historyPages.set(before,{...fixture.conversation,entries:rounds(before-20),nextEntryCursor:before-20});
      const settle=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const stream=panel().locator('.ac-stream');
      const moveTo=async(top:number)=>{await stream.evaluate((node:HTMLElement,value:number)=>node.scrollTop=value,top);await settle();};
      const wheelUp=async()=>{const box=await stream.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+80);await page.mouse.wheel(0,-120);};
      const touch=async(type:string,y?:number)=>stream.evaluate((node:HTMLElement,value:{type:string;y?:number})=>{const point=value.y===undefined?undefined:new Touch({identifier:1,target:node,clientX:40,clientY:value.y});node.dispatchEvent(new TouchEvent(value.type,{bubbles:true,touches:point?[point]:[],changedTouches:point?[point]:[]}));},{type,y});
      try{
        await page.reload();await panel().locator('[data-entry-id="history-220"]').waitFor();await settle();
        assert.equal(fixture.entryReads,readsBefore,'打开历史不会自动翻页');
        assert.equal(await panel().getByRole('button',{name:'加载更早的记录',exact:true}).count(),0);assert.equal(await panel().locator('.ac-pull-history').count(),0);
        assert.equal(await panel().locator('.ac-compose-wrap>.ac-run-status').count(),0);assert.equal(await panel().locator('.ac-stream>.ac-run-status').count(),0);
        const process=panel().locator('[data-run-id="history-round-217"] .ac-process'),group=process.locator('.ac-step-group').first();
        await panel().locator('[data-run-id="history-round-217"]').getByRole('button',{name:'展开处理过程',exact:true}).evaluate((node:HTMLElement)=>node.click());await group.locator(':scope>summary').evaluate((node:HTMLElement)=>node.click());await group.locator('.ac-step>summary').first().evaluate((node:HTMLElement)=>node.click());
        assert.equal(await process.getAttribute('data-expanded'),'true');assert.equal(await group.getAttribute('open'),'');
        await moveTo(1200);assert.equal(fixture.entryReads,readsBefore,'距离顶部大于800像素不预取');
        const scrollLatest=panel().getByRole('button',{name:'向下到底',exact:true});
        await scrollLatest.waitFor();
        assert.ok(await stream.evaluate((node:HTMLElement)=>node.scrollHeight-node.scrollTop-node.clientHeight>80));
        await scrollLatest.click();
        await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollHeight-node.scrollTop-node.clientHeight<2);});
        await settle();assert.equal(await scrollLatest.count(),0,'回到底部后按钮隐藏');
        fixture.holdEntryRead=true;const started=new Promise<void>(resolve=>{fixture.entryReadStarted=resolve;});await moveTo(700);await started;
        assert.equal(fixture.entryReads,readsBefore+1,'尚未到顶时提前读取一批');assert.equal(await stream.getAttribute('aria-busy'),'true');
        const anchor=await stream.evaluate((node:HTMLElement)=>{const top=node.getBoundingClientRect().top;const item=[...node.querySelectorAll<HTMLElement>('[data-entry-id]')].find(item=>{const rect=item.getBoundingClientRect();return !item.closest('.ac-turn-context')&&rect.height>0&&rect.bottom>top+4;})!;return{id:item.dataset.entryId!,y:item.getBoundingClientRect().y};});
        for(let i=0;i<4;i++)await stream.dispatchEvent('wheel',{deltaY:-20});
        assert.equal(fixture.entryReads,readsBefore+1,'同一批加载中重复滚动不重入');
        fixture.releaseEntryRead!();await panel().locator('[data-entry-id="history-181"]').waitFor({state:'attached'});await settle();
        await page.waitForFunction(({id,y}:{id:string;y:number})=>Math.abs(document.querySelector(`[data-entry-id="${id}"]`)!.getBoundingClientRect().y-y)<3,anchor);
        assert.equal(await process.getAttribute('data-expanded'),'true');assert.equal(await group.getAttribute('open'),'');assert.equal(fixture.entryReads,readsBefore+1,'定位恢复不会额外触发分页');
        await capture(page,'conversation-history-scroll-desktop.png');
        await moveTo(700);await panel().locator('[data-entry-id="history-161"]').waitFor({state:'attached'});await settle();assert.equal(fixture.entryReads,readsBefore+2,'持续向上滚动可继续下一批');
        fixture.holdEntryRead=true;const keyboardStarted=new Promise<void>(resolve=>{fixture.entryReadStarted=resolve;});await stream.focus();await stream.press('Home');await keyboardStarted;
        // 等待键盘原生滚动结束，再在请求仍挂起时确定远离顶部的阅读位置，避免迟到的滚动事件重入。
        await stream.evaluate((node:HTMLElement)=>new Promise<void>((resolve,reject)=>{let last=node.scrollTop,stable=0,frames=0;const tick=()=>{const next=node.scrollTop;stable=Math.abs(next-last)<1?stable+1:0;last=next;if(stable>=4)return resolve();if(++frames>90)return reject(new Error('键盘滚动未稳定'));requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
        await moveTo(1200);assert.equal(fixture.entryReads,readsBefore+3,'键盘向上阅读触发加载且滚动期间不重入');
        fixture.releaseEntryRead!();await panel().locator('[data-entry-id="history-141"]').waitFor({state:'attached'});await settle();assert.equal(fixture.entryReads,readsBefore+3,'定位恢复不会额外读取');
        await moveTo(1200);assert.equal(fixture.entryReads,readsBefore+3,'远离顶部时不会读取下一批');
        fixture.failEntryRead=true;await moveTo(700);await panel().getByText('更早记录暂时不可用',{exact:true}).waitFor();await settle();
        assert.equal(fixture.entryReads,readsBefore+4);assert.equal(await panel().locator('[data-entry-id="history-121"]').count(),0,'失败保留现有记录');
        await wheelUp();await panel().locator('[data-entry-id="history-121"]').waitFor({state:'attached'});await settle();assert.equal(fixture.entryReads,readsBefore+5,'下次向上滚动可重试失败页');assert.equal(await panel().getByText('更早记录暂时不可用',{exact:true}).count(),0,'重试成功清除本次历史读取警告');
        await page.setViewportSize({width:390,height:844});await moveTo(900);
        const mobileScrollLatest=panel().getByRole('button',{name:'向下到底',exact:true});await mobileScrollLatest.waitFor();assert.ok(await mobileScrollLatest.isVisible());
        const mobileLatestBox=await mobileScrollLatest.boundingBox();assert.ok(mobileLatestBox&&mobileLatestBox.y>0&&mobileLatestBox.y+mobileLatestBox.height<844,JSON.stringify(mobileLatestBox));
        await mobileScrollLatest.click();await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollHeight-node.scrollTop-node.clientHeight<2);});await settle();assert.equal(await mobileScrollLatest.count(),0,'窄屏回到底部后按钮隐藏');
        await moveTo(900);
        fixture.holdEntryRead=true;const requested=page.waitForRequest((value:any)=>new URL(value.url()).pathname.endsWith('/entries'));const touchStarted=new Promise<void>(resolve=>{fixture.entryReadStarted=resolve;});await touch('touchstart',100);await stream.evaluate((node:HTMLElement)=>node.scrollTop=700);await touch('touchmove',145);await touchStarted;
        assert.equal(fixture.entryReads,readsBefore+6,'触摸阅读更早内容时直接加载，无需松手');assert.equal(await panel().locator('.ac-pull-history').count(),0);await touch('touchmove',190);await touch('touchend');assert.equal(fixture.entryReads,readsBefore+6,'触摸加载中不重入');
        await capture(page,'conversation-history-scroll-mobile.png');
        const heldRequest=await requested;const settled=new Promise<void>(resolve=>{const finish=(request:any)=>{if(request!==heldRequest)return;page.off('requestfinished',finish);page.off('requestfailed',finish);resolve();};page.on('requestfinished',finish);page.on('requestfailed',finish);});
        const other={...previous,id:'history-other',title:'历史加载中的另一段对话',entries:[],participants:[],run:undefined};fixture.additionalConversations.push(other);
        await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('.ac-history-list button[data-conversation-id="history-other"]').click();await page.locator('#agent-conversation-panel[data-conversation-id="history-other"]').waitFor();
        fixture.releaseEntryRead!();await settled;await settle();
        assert.equal(await panel().locator('[data-entry-id="history-101"]').count(),0,'迟到页不进入另一段对话');
      }finally{
        fixture.releaseEntryRead?.();fixture.holdEntryRead=false;fixture.failEntryRead=false;fixture.conversation=previous;historyPages.clear();fixture.additionalConversations=fixture.additionalConversations.filter(item=>item.id!=='history-other');await page.setViewportSize(oldViewport);
        await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('.ac-history-list button[data-conversation-id="'+previous.id+'"]').click();await input().waitFor();
        await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();
      }
    });

await step('不足一屏不自动耗尽历史，滚轮触摸与键盘可自然向上续读',async()=>{
      const previous=structuredClone(fixture.conversation),stream=panel().locator('.ac-stream');
      const entry=(sequence:number,role:string)=>({id:'short-'+sequence,sequence,kind:'message',role,text:role==='user'?'更早的用户要求':'短答复',runId:'short-run-'+sequence,createdAt:new Date().toISOString()});
      try{
        for(const gesture of ['wheel','touch','keyboard']){
          const readsBefore=fixture.entryReads;update({entries:[entry(201,'assistant')],nextEntryCursor:201});historyPages.set(201,{...fixture.conversation,entries:[entry(180,'user')],nextEntryCursor:180});historyPages.set(180,{...fixture.conversation,entries:[entry(160,'user')],nextEntryCursor:undefined});
          await page.reload();await panel().locator('[data-entry-id="short-201"]').waitFor();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
          assert.ok(await stream.evaluate((node:HTMLElement)=>node.scrollHeight<=node.clientHeight+1));assert.equal(fixture.entryReads,readsBefore,'不足一屏也等待阅读动作');
          if(gesture==='wheel'){const box=await stream.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+80);await page.mouse.wheel(0,-120);}
          else if(gesture==='keyboard'){await stream.focus();await stream.press('PageUp');}
          else await stream.evaluate((node:HTMLElement)=>{for(const [type,y] of [['touchstart',100],['touchmove',140],['touchend',undefined]] as const){const point=y===undefined?undefined:new Touch({identifier:1,target:node,clientX:40,clientY:y});node.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:point?[point]:[],changedTouches:point?[point]:[]}));}});
          await panel().locator('[data-entry-id="short-180"]').waitFor();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
          assert.equal(await stream.evaluate((node:HTMLElement)=>node.scrollTop),0,'不足一屏补页保留顶部');assert.equal(fixture.entryReads,readsBefore+1,gesture+'只加载所需一批');assert.equal(await panel().locator('[data-entry-id="short-160"]').count(),0,'不自动继续耗尽历史');
        }
      }finally{historyPages.clear();fixture.conversation=previous;await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();}
    });
await step('临时截图链接使用认证预览，文件错误提示不跨对话或草稿残留',async()=>{
  const previous=structuredClone(fixture.conversation),otherId='file-warning-other';
  const base=fs.realpathSync(path.dirname(workspaceRoot)),imagePath=path.join(base,'验收 截图.png'),missingPath=path.join(base,'恢复图片.png');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  let delay=false,release:(()=>void)|undefined,started:(()=>void)|undefined;
  const held=new Promise<void>(resolve=>{started=resolve;}),matcher='**/api/v1/workspaces/*/code/repositories*';
  const intercept=async(route:any)=>{if(!delay)return route.fallback();delay=false;started?.();await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({status:503,json:{error:{code:'fixture_unavailable',message:'旧对话迟到的文件读取失败'}}});};
  const switchTo=async(id:string)=>{await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('button[data-conversation-id="'+id+'"]').click();await page.locator('#agent-conversation-panel[data-conversation-id="'+id+'"]').waitFor();};
  const preview=()=>page.getByRole('dialog',{name:'图片预览',exact:true});
  const closePreview=async()=>{await preview().getByRole('button',{name:'关闭预览',exact:true}).click();await preview().waitFor({state:'hidden'});};
  const assertImage=async()=>{await preview().waitFor();await page.waitForFunction(()=>{const image=document.querySelector<HTMLImageElement>('.ac-linked-image-preview img');return Boolean(image?.complete&&image.naturalWidth>0);});};
  fs.writeFileSync(imagePath,png,{flag:'wx'});await page.route(matcher,intercept);
  try{
    fixture.additionalConversations.push({...previous,id:otherId,title:'另一段对话',entries:[{id:'other-entry',sequence:1,kind:'message',role:'user',text:'其他对话正文',createdAt:new Date().toISOString()}],run:undefined,participants:[]});
    update({cwd:base,entries:[{id:'screenshot-reference',sequence:1,kind:'message',role:'assistant',runId:'run-fixture',text:`[查看验收截图](${encodeURI(imagePath)}) [相对截图](验收%20截图.png) [暂不可用截图](${encodeURI(missingPath)}) [无法定位的文件](/outside/not-authorized.md) [延迟文件](/outside/delayed.md)`,createdAt:new Date().toISOString()}],run:run('completed','codex')});
    await page.reload();await panel().getByRole('link',{name:'查看验收截图',exact:true}).waitFor();
    const loaded=page.waitForResponse((response:any)=>new URL(response.url()).pathname==='/api/v1/conversation-image');
    await panel().getByRole('link',{name:'查看验收截图',exact:true}).click();assert.equal((await loaded).status(),200);await assertImage();assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'临时图片不进入源码定位');await preview().evaluate(async(node:HTMLElement)=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});await capture(page,'conversation-local-screenshot-preview.png');await closePreview();
    await panel().getByRole('link',{name:'相对截图',exact:true}).click();await assertImage();await closePreview();
    fixture.expectedBrowserErrors.add('conversation-image');await panel().getByRole('link',{name:'暂不可用截图',exact:true}).click();await preview().getByText('图片暂时无法读取，可能已被移动、删除或超过大小限制。',{exact:true}).waitFor();
    fs.writeFileSync(missingPath,png,{flag:'wx'});await preview().getByRole('button',{name:'重新加载',exact:true}).click();await assertImage();await closePreview();
    await panel().getByRole('link',{name:'无法定位的文件',exact:true}).click();await panel().getByRole('button',{name:'复制来源路径',exact:true}).waitFor();
    await switchTo(otherId);assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'其他对话没有旧提醒');await switchTo(previous.id);assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'返回原对话也不恢复过期提醒');
    await panel().getByRole('link',{name:'无法定位的文件',exact:true}).click();await panel().getByRole('button',{name:'复制来源路径',exact:true}).waitFor();await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'新草稿也没有旧提醒');
    await switchTo(previous.id);fixture.expectedBrowserErrors.add('503');delay=true;await panel().getByRole('link',{name:'延迟文件',exact:true}).click();await held;await switchTo(otherId);const late=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/repositories')&&response.status()===503);release?.();await late;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'旧请求迟到失败不能给新对话添加提醒');
  }finally{
    release?.();await page.unroute(matcher,intercept);fixture.additionalConversations=fixture.additionalConversations.filter(item=>item.id!==otherId);fixture.conversation=previous;
    for(const file of [imagePath,missingPath])if(fs.existsSync(file))fs.unlinkSync(file);
    await page.reload();await input().waitFor();await switchTo(previous.id);await input().waitFor();
  }
});

await step('file citations render labels and open the observed source with its line number',async()=>{
      const response=await page.request.get(workspaceUrl.replace('/workspaces/','/api/v1/workspaces/')+'/code/repositories');assert.equal(response.status(),200);
      const catalog=await response.json(),member=catalog.worktrees.find((item:any)=>item.available);assert.ok(member,'fixture has an observed source');
      const fixtureBase=fs.realpathSync(path.dirname(workspaceRoot)),sourceRoot=fs.realpathSync(member.path);
      assert.ok(sourceRoot===fixtureBase||sourceRoot.startsWith(fixtureBase+path.sep),'only write inside this isolated test fixture');
      const previous=structuredClone(fixture.conversation);
      const filePath='conversation-citation.md',createdFile=path.join(sourceRoot,filePath);fs.writeFileSync(createdFile,'# Conversation citation\n\nVerified local source.\n',{flag:'wx'});
      try {
      update({workspaceId,cwd:member.path,entries:[{id:'file-citation',sequence:1,kind:'message',role:'assistant',runId:'run-fixture',text:`Sources: [Readable source](${filePath}:1), [Unavailable source](/outside/not-authorized.md:1), [Parent source](../outside.md:1), [Task note](@task/task-one)`,createdAt:new Date().toISOString()}],run:run('completed','codex')});
      await panel().getByRole('button',{name:'查看对话列表',exact:true}).click();await panel().locator('.ac-history-list button[data-conversation-id="'+fixture.conversation.id+'"]').click();await input().waitFor();const source=panel().getByRole('link',{name:'Readable source',exact:true});await source.waitFor();assert.equal(await source.getAttribute('data-markdown-href'),filePath+':1');assert.equal(await source.innerText(),'Readable source');assert.equal(await panel().getByRole('link',{name:'Task note',exact:true}).getAttribute('href'),'/workspaces/'+workspaceId+'/tasks/task-one');await panel().getByRole('link',{name:'Parent source',exact:true}).waitFor();
      await capture(page,'agent-file-citation-labels.png');
      await panel().getByRole('link',{name:'Unavailable source',exact:true}).click();await panel().getByRole('button',{name:'复制来源路径',exact:true}).waitFor();
      const reading=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/editor-file')&&url.searchParams.get('filePath')===filePath;});
      await source.click();const fileResponse=await reading;assert.equal(fileResponse.status(),200);const snapshot=await fileResponse.json();assert.equal(new URL(fileResponse.url()).searchParams.get('checkoutId'),member.id);await page.waitForURL('**/code/explorer');const reader=page.locator('.code-explorer-stage .file-editing-pane');await reader.waitFor();await reader.getByText('Verified local source.',{exact:true}).waitFor();assert.ok(snapshot.content.includes('Verified local source.'));await page.locator('.code-explorer-stage').getByText(/已选择第 1 行/).waitFor();
      const state=await page.evaluate(()=>history.state?.usr?.codeEntry);if(state?.file)assert.equal(state.file.line,1);
      await capture(page,'agent-file-citation-open.png');
      } finally { fs.unlinkSync(createdFile);fixture.conversation=previous;await page.goto(workspaceUrl+'/overview');await input().waitFor(); }
    });

}
