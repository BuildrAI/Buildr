import assert from 'node:assert/strict';
import {HISTORY_SCENARIO_CATALOG,type HistoryScenarioId} from './agent-conversation-history-catalog.ts';
import fs from 'node:fs';
import path from 'node:path';
import {createAgentConversationFixture,type AgentConversationFixture} from './agent-conversation-fixture.ts';

type ConversationScrollSample={at:number;top:number;height:number;viewport:number;visible:boolean;entries:number;listBottom:number|null;streamBottom:number|null;listTop:number|null;streamTop:number|null};

/** history 场景使用独立准备的对话现场。 */
const historyRuns = {
  'history/workspace-switch': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const registry=await (await page.request.get(new URL('/api/v1/workspaces',workspaceUrl).href)).json();
  const other=registry.workspaces.find((entry:any)=>entry.workspace?.id&&entry.workspace.id!==workspaceId);
  assert.ok(other?.workspace);
  await input().fill('切换空间保留的草稿');
  await panel().evaluate((node:HTMLElement)=>{(window as any).__retainedConversationPanel=node;});
  const switcher=page.locator('.workspace-switcher').first();
  await switcher.click();
  await page.locator('.ant-dropdown:visible').getByText(other.workspace.name,{exact:true}).click();
  await page.waitForURL('**/workspaces/'+other.workspace.id+'/**');
  await input().waitFor();
  assert.equal(await input().inputValue(),'切换空间保留的草稿');
  assert.equal(await panel().evaluate((node:HTMLElement)=>node===(window as any).__retainedConversationPanel),true);
  await fixture.openHistoryList();
  await panel().locator('.ac-history-toolbar').getByText('全部工作空间',{exact:true}).waitFor();
  await capture(page,'conversation-workspace-switch-preserved.png');
  await fixture.backToConversation();
  await input().fill('');
  },
  'history/handoff-source': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

 const saved=structuredClone(fixture.conversation),sourceId='index-'+'a'.repeat(64)+'.json',at=new Date().toISOString();let histories=0,details=0,missing=false;
 const tool={id:'source-tool',sequence:2,runId:'source-round',kind:'tool',role:'system',text:'',createdAt:at,name:'command',provider:'codex',status:'completed',detail:{revision:'b'.repeat(64)}};
 const sourceEntries=[{id:'source-user',sequence:1,runId:'source-round',kind:'message',role:'user',text:'原始要求',createdAt:at},tool,{id:'source-append',sequence:3,runId:'source-round',kind:'message',role:'user',text:'追加：保留未知结果',createdAt:at},{id:'source-final',sequence:4,runId:'source-round',kind:'message',role:'assistant',text:'来源中的最终答复',createdAt:at}];
 const historyRoute=async(route:any)=>{histories++;if(missing)expectedBrowserErrors?.add(route.request().url());await route.fulfill({status:missing?409:200,contentType:'application/json',body:JSON.stringify(missing?{error:{code:'agent_handoff_source_unavailable',message:'交接来源缺失，不能重放工作。'}}:{entries:sourceEntries,truncatedIds:[],unavailable:[]})});};
 const entryRoute=async(route:any)=>{details++;await route.fulfill({contentType:'application/json',body:JSON.stringify({...tool,text:'NATIVE_HANDOFF_TOOL_DETAIL',input:'read-only-command'})});};
 await page.route('**/history-source?**',historyRoute);await page.route('**/entry-detail/source-tool?**',entryRoute);
 const material={agent:'Qoder',model:'fixture-model',changes:[{kind:'agent',label:'智能体',before:'Codex',after:'Qoder'}],rounds:[{id:'source-round',title:'第1轮',from:1,through:4,state:'completed',userInputs:[],assistantNotes:[],execution:[],artifacts:[],executionCount:1,finalReplyId:'source-final'}],body:'按来源读取',sourceThrough:4,sourceId,sourceOnly:true,mode:'indexed'};
 try{
  update({run:run('completed'),requests:[],entries:[{id:'outer-user',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'本轮交接',createdAt:at},{id:'source-receipt',sequence:2,runId:'run-fixture',kind:'handoff',role:'system',text:'已交给Qoder',createdAt:at,status:'accepted',provider:'qoder',handoff:material},{id:'outer-final',sequence:3,runId:'run-fixture',kind:'message',role:'assistant',text:'接手完成',createdAt:at,status:'completed'}]});
  await page.reload();await input().waitFor();
  await panel().locator('.ac-handoff-receipt').getByRole('button',{name:'交接内容',exact:true}).click();
  const drawer=page.locator('.ac-handoff-drawer:visible');await drawer.locator('.ac-hd-round').waitFor();assert.equal(histories,0);assert.equal(details,0);
  await drawer.locator('details.ac-hd-round > summary').click();await drawer.getByText('追加：保留未知结果',{exact:true}).waitFor();assert.equal(histories,1);assert.equal(details,0);await drawer.getByRole('heading',{name:'最终答复 · #4',exact:true}).waitFor();
  await drawer.locator('details.ac-step-tool > summary').click();await drawer.getByText('NATIVE_HANDOFF_TOOL_DETAIL',{exact:false}).waitFor();assert.equal(details,1);
  await capture(page,'agent-handoff-reference-source.png');
  await drawer.getByRole('button',{name:'关闭交接内容',exact:true}).click();missing=true;
  await panel().locator('.ac-handoff-receipt').getByRole('button',{name:'交接内容',exact:true}).click();await drawer.locator('details.ac-hd-round > summary').click();await drawer.getByRole('alert').filter({hasText:'交接来源缺失'}).waitFor();
 }finally{
  const close=page.getByRole('button',{name:'关闭交接内容',exact:true});if(await close.isVisible())await close.click();
  await page.unroute('**/history-source?**',historyRoute);await page.unroute('**/entry-detail/source-tool?**',entryRoute);update(saved);
 }
  },
  'history/seen-summary': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString(),version=910003;
  const summaryReads:number[]=[];
  const observe=(request:any)=>{if(request.url().includes('/activity-summary'))summaryReads.push(Date.now());};
  page.on('request',observe);
  try{
    update({run:run('completed'),requests:[],retainedRuns:[],activity:{version,seenThrough:version-1,active:false,pendingDecisionCount:0,updatedAt:at},entries:[
      {id:'seen-list-user',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'核对查看状态',createdAt:at},
      {id:'seen-list-answer',sequence:2,runId:'run-fixture',kind:'message',role:'assistant',text:'查看后应当立即同步统计',status:'completed',createdAt:at},
    ]});
    await fixture.openHistoryList();
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    const row=panel().locator('[data-conversation-id="'+fixture.conversation.id+'"]');
    await row.getByText('待查看',{exact:true}).waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label^="所有对话，"]')].some(node=>node.getAttribute('aria-label')?.includes('待查看 1')));
    const before=summaryReads.length;
    const seen=page.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().endsWith('/seen')&&response.request().postDataJSON().through===version);
    await row.click();assert.equal((await seen).status(),200);
    await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label^="所有对话，"]')].some(node=>node.getAttribute('aria-label')?.includes('待查看 0')),null,{timeout:1500});
    assert.ok(summaryReads.length>before,'查看确认触发摘要，不依赖5秒或30秒轮询');
    assert.ok(summaryReads.length<=before+2,'一次查看不产生请求风暴');
    await fixture.openHistoryList();
    const refreshed=panel().locator('[data-conversation-id="'+fixture.conversation.id+'"]');await refreshed.waitFor();
    await refreshed.getByText('待查看',{exact:true}).waitFor({state:'hidden',timeout:1500});
    assert.equal(await refreshed.getByText('待查看',{exact:true}).count(),0,'列表状态与全局统计一致');
  }finally{page.off('request',observe);fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/hidden-observer': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),beforeSends=fixture.sends;
  const otherPage=await page.context().newPage();
  const other=await createAgentConversationFixture({page:otherPage,workspaceUrl,workspaceRoot,otherWorkspaceId:fixture.otherWorkspaceId,capture,expectedBrowserErrors:fixture.expectedBrowserErrors});
  let otherHidden=0,otherSends=0;
  const visibility=async(value:string)=>page.evaluate((value:string)=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>value});document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
    await other.step('隐藏对话释放观察连接—第二页签',async()=>{
      await other.initialize('history');other.update({run:other.run('running'),requests:[]});await otherPage.reload();await other.input().waitFor();
      await otherPage.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
      await otherPage.waitForTimeout(1800);otherHidden=other.eventStreams;otherSends=other.sends;
    });
    await page.bringToFront();update({run:run('running'),requests:[]});await page.reload();await input().waitFor();
    const before=fixture.eventStreams;await visibility('hidden');
    await page.waitForTimeout(1800);const hidden=fixture.eventStreams;await page.waitForTimeout(1800);assert.equal(fixture.eventStreams,hidden,'隐藏时不重连');
    const reads=fixture.conversationReads;update({run:run('completed')});await visibility('visible');
    await page.waitForFunction(()=>document.querySelector('[data-run-status="completed"]')!==null);assert.ok(fixture.conversationReads>reads,'恢复先核对当前事实');
    assert.ok(hidden>=before);assert.equal(fixture.sends,beforeSends,'观察不发送工作输入');
    await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles({name:'connection-probe.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
    await panel().getByRole('button',{name:'移除图片 connection-probe.png',exact:true}).waitFor();
    assert.equal(other.eventStreams,otherHidden,'第二页签保持暂停且前台完成上传');assert.equal(other.sends,otherSends);
    const spans=await page.evaluate(()=>performance.getEntriesByType('measure').filter(e=>e.name.startsWith('buildr.attachment.')).map(e=>({name:e.name,duration:e.duration})));
    assert.ok(spans.some((e:{name:string;duration:number})=>e.name==='buildr.attachment.read-file'));assert.ok(spans.some((e:{name:string;duration:number})=>e.name==='buildr.attachment.request'));assert.ok(spans.every((e:{name:string;duration:number})=>e.duration>=0));
    await capture(page,'conversation-upload-after-visibility.png');await panel().getByRole('button',{name:'移除图片 connection-probe.png',exact:true}).dispatchEvent('click');
  }finally{await other.dispose();await otherPage.close();await page.evaluate(()=>{delete (document as any).visibilityState;document.dispatchEvent(new Event('visibilitychange'));});fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/workspace-order': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=fixture.additionalConversations,at=new Date().toISOString();
  const registry=await (await page.request.get(new URL('/api/v1/workspaces',workspaceUrl).href)).json();
  const otherId=registry.workspaces.find((entry:any)=>entry.workspace?.id&&entry.workspace.id!==workspaceId)?.workspace.id;assert.ok(otherId);
  const make=(id:string,space:string)=>({...fixture.conversation,id,workspaceId:space,title:id,entries:[],requests:[],retainedRuns:[],run:run('running'),activity:{active:true,version:1,seenThrough:1,pendingDecisionCount:0,userInputAt:at,updatedAt:at}});
  const rows=[make('排序当前',workspaceId),make('排序其他',otherId),make('排序默认','@default')];
  const pattern='**/api/v1/app/agent-service/activity-summary*';
  const route=async(route:any)=>route.fulfill({status:200,json:{revision:'popup-order',conversations:rows,pending:[],total:3,activityCounts:{active:3,running:3,waiting:0,unseen:0,unknown:0,attention:0},stats:{agents:[],models:[],executions:[],modelExecutions:[]}}});
  try{
    fixture.additionalConversations=rows;await page.route(pattern,route);await page.reload();await input().waitFor();
    const entry=page.locator('button[aria-label^="所有对话，"]:visible').last();
    for(const direction of ['Alt+ArrowUp','Alt+ArrowDown']){
      await fixture.openHistoryList();
      await panel().locator('.ac-history-toolbar .ant-select-selector').click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^全部工作空间$/}).click();
      const header=panel().locator('[data-history-workspace="'+workspaceId+'"] .ac-history-group-toggle');await header.waitFor();await header.press(direction);
      const expected=await panel().locator('[data-history-workspace]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.dataset.historyWorkspace));
      await fixture.backToConversation();await entry.hover();
      const menu=page.locator('.ac-activity-menu:visible');await menu.waitFor();await menu.locator('[data-activity-workspace="@default"]').waitFor();
      assert.deepEqual(await menu.locator('[data-activity-workspace]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.dataset.activityWorkspace)),expected.filter((id:string|undefined)=>[workspaceId,otherId,'@default'].includes(id!)));
      await capture(page,'conversation-popup-shared-order-'+direction.slice(4)+'.png');await page.mouse.move(0,0);await input().focus();await page.keyboard.press('Escape');
    }
  }finally{fixture.additionalConversations=saved;await page.unroute(pattern,route);await page.reload();await input().waitFor();}
  },
  'history/participation-hidden': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString();
  let reads=0;
  const intercept=async(route:any)=>{reads++;await route.fulfill({status:500,json:{message:'隐藏时不应请求'}});};
  const patterns=['**/participation?*','**/participation-summary?*'];
  try{
    for(const pattern of patterns)await page.route(pattern,intercept);
    update({run:run('completed'),requests:[],entries:[{id:'participation-user',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'观察参与',createdAt:at},{id:'participation-answer',sequence:2,runId:'run-fixture',kind:'message',role:'assistant',text:'已完成',status:'completed',createdAt:at}]});
    await page.reload();await input().waitFor();
    assert.equal(await panel().getByRole('button',{name:'Buildr 参与',exact:true}).count(),0);
    await fixture.openHistoryList();
    await panel().locator('.ac-history-toolbar').waitFor();
    assert.equal(await panel().getByRole('button',{name:'Buildr 参与汇总',exact:true}).count(),0);
    assert.equal(reads,0,'隐藏入口不得请求参与查询');
    await capture(page,'buildr-participation-entries-hidden.png');
  }finally{for(const pattern of patterns)await page.unroute(pattern,intercept);update(saved);}
  },
  'history/ownership-grouping': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString();
  const entry=(id:string,sequence:number,runId:string,kind:string,role:string,text:string,extra:any={})=>({id,sequence,runId,kind,role,text,status:'completed',createdAt:at,...extra});
  try{
    update({run:run('running'),retainedRuns:[run('running','codex',{id:'older-unified-run'})],requests:[],entries:[
      entry('unified-old-user',1,'older-unified-run','message','user','旧执行要求'),
      entry('unified-old-one',2,'older-unified-run','tool','system','旧工具一',{name:'Read'}),
      entry('unified-handoff',3,'run-fixture','handoff','system','旧接手文案',{status:'accepted',handoff:{agent:'Codex',model:'fixture-model',changes:[],rounds:[],body:'接续已有记录',sourceThrough:2,mode:'records'}}),
      entry('unified-user',4,'run-fixture','message','user','新执行要求'),
      entry('unified-current-one',5,'run-fixture','tool','system','当前工具一',{name:'Read',status:'running'}),
      entry('unified-old-two',6,'older-unified-run','tool','system','旧工具二',{name:'Bash'}),
      entry('unified-current-two',7,'run-fixture','tool','system','当前工具二',{name:'Grep'}),
      entry('unified-extra',8,'run-fixture','message','user','同一执行的补充要求'),
      entry('unified-current-last',9,'run-fixture','tool','system','可从父工具查看的报告',{name:'Agent',status:'running'}),
      entry('retired-question-unified',10,'older-unified-run','notice','system','{"请求标识":"internal","问题":"原问题","状态":"未回答"}'),
      entry('unified-child-report',11,'run-fixture','message','assistant','子任务独立报告不应重复出现',{parentToolId:'unified-current-last'}),
    ]});
    await page.reload();await input().waitFor();
    const older=panel().locator('[data-turn-id="unified-old-user"]'),beforeExtra=panel().locator('[data-turn-id="unified-user"]');
    await beforeExtra.locator('[data-entry-id="unified-extra"]').waitFor();
    assert.equal(await panel().locator('[data-turn-id="unified-extra"]').count(),0,'补充沿用原轮起点');
    assert.equal(await older.locator('.ac-step-group').count(),1,'另一执行插入的工具与接续回执不切碎旧工具组');
    assert.equal(await beforeExtra.locator('.ac-step-group').count(),2,'用户补充前后保留两个工具分段');
    assert.equal(await panel().locator('.ac-step-group.is-live').count(),1);assert.equal(await beforeExtra.locator('.ac-step-group.is-live').count(),1);
    assert.equal(await panel().locator('.ac-handoff-receipt').count(),0,'相同选择的已接收回执遵循现有静默呈现');
    assert.equal(await panel().locator('[data-entry-id="retired-question-unified"],[data-entry-id="unified-child-report"]').count(),0);
    await older.locator('.ac-step-group>summary').click();
    await older.locator('[data-entry-id="unified-old-two"]').waitFor();
    assert.equal(await older.locator('.ac-step-tool').count(),2);await capture(page,'conversation-unified-interleaved-work.png');
  }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/supplement-grouping': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString();
  const entry=(id:string,sequence:number,role:string,text:string)=>({id,sequence,kind:'message',role,text,runId:'run-fixture',participantId:'participant-codex',createdAt:at,status:'completed'});
  try{
    update({entries:[entry('fold-user',1,'user','最初要求'),entry('fold-before',2,'assistant','补充前的处理'),entry('fold-extra',3,'user','补充说明'),entry('fold-after',4,'assistant','补充后的处理'),entry('fold-extra-two',5,'user','第二条补充'),entry('fold-answer',6,'assistant','最终答复')],run:run('completed'),requests:[]});
    await page.reload();await input().waitFor();
    const turn=panel().locator('[data-turn-id="fold-user"]'),extra=turn.locator('[data-entry-id="fold-extra"]');
    assert.equal(await panel().locator('.ac-turn').count(),1);await turn.locator('[data-entry-id="fold-answer"]').waitFor();assert.equal(await extra.count(),0);
    await turn.getByRole('button',{name:'展开处理过程',exact:true}).click();await extra.waitFor();
    assert.deepEqual(await turn.locator('[data-entry-id]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.dataset.entryId)),['fold-user','fold-before','fold-extra','fold-after','fold-extra-two','fold-answer']);
    await capture(page,'conversation-supplement-expanded.png');
    await turn.getByRole('button',{name:'收起处理过程',exact:true}).click();assert.equal(await extra.count(),0);await turn.locator('[data-entry-id="fold-answer"]').waitFor();
    await page.reload();await turn.waitFor();assert.equal(await extra.count(),0);await turn.getByRole('button',{name:'展开处理过程',exact:true}).click();await extra.waitFor();
    await turn.getByRole('button',{name:'收起处理过程',exact:true}).click();update({entries:[entry('fold-earlier',0,'user','更早的原始要求'),...fixture.conversation!.entries]});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const earlier=panel().locator('[data-turn-id="fold-earlier"]');await earlier.waitFor();assert.equal(await earlier.locator('[data-entry-id="fold-extra"]').count(),0,'补回更早输入后保留同一执行的明确折叠选择');
  }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/send-latest': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const previous=structuredClone(fixture.conversation),at=new Date().toISOString();
  const entry=(id:string,sequence:number,role:string,text:string)=>({id,sequence,kind:'message',role,text,provider:'codex',participantId:'participant-codex',runId:'run-fixture',status:'completed',createdAt:at});
  const settle=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const readingAnswer=(prefix:string,count:number,repeat:number)=>Array.from({length:count},(_,i)=>`${prefix} ${i}：`+'这是一段用于验证信息流贴底与向上翻阅行为的较长说明。'.repeat(repeat)).join('\n\n');
  try{
    update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[entry('latest-pin-user',1,'user','检查发送后的最新信息'),entry('latest-pin-answer',2,'assistant',readingAnswer('用于保持阅读位置的历史答复',12,5))],nextEntryCursor:undefined,run:run('completed','codex',{model:'fixture-model'}),requests:[]});
    await page.reload();await input().waitFor();
    const stream=panel().locator('.ac-stream'),distance=()=>stream.evaluate((node:HTMLElement)=>Math.round(node.scrollHeight-node.scrollTop-node.clientHeight));
    await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollHeight-node.scrollTop-node.clientHeight<2);});
    await stream.evaluate((node:HTMLElement)=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));node.scrollTop=0;node.dispatchEvent(new Event('scroll'));node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});await settle();
    const reading=await stream.evaluate((node:HTMLElement)=>({top:node.scrollTop,max:Math.round(node.scrollHeight-node.clientHeight)}));assert.ok(reading.max>80&&await distance()>24,'先离开最新位置阅读旧内容 '+JSON.stringify(reading));
    await input().fill('发送后应看到这条最新指令');await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('.ac-turn-prompt').filter({hasText:'发送后应看到这条最新指令'}).waitFor();
    await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollHeight-node.scrollTop-node.clientHeight<2);});
    assert.equal(await panel().getByRole('button',{name:'向下到底',exact:true}).count(),0,'本地发送后回到最新信息');
    update({entries:[entry('clamp-user',1,'user','输入区收缩时的贴底'),entry('clamp-answer',2,'assistant',readingAnswer('输入区收缩时的答复',10,3))],nextEntryCursor:1,run:run('completed','codex',{model:'fixture-model'}),requests:[]});
    historyPages.set(1,{...fixture.conversation,entries:[entry('latest-pin-older',0,'user','更早的历史要求')],nextEntryCursor:undefined});
    await page.reload();await input().waitFor();
    await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollHeight-node.scrollTop-node.clientHeight<2);});
    const scrollable=await stream.evaluate((node:HTMLElement)=>Math.round(node.scrollHeight-node.clientHeight));
    assert.ok(scrollable>24&&scrollable<=800,'夹具内容应形成可测试的贴底距离 '+scrollable);
    const readsBefore=fixture.entryReads;
    await stream.evaluate((node:HTMLElement)=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
    await stream.evaluate((node:HTMLElement)=>{node.scrollTop=Math.max(0,node.scrollTop-8);node.dispatchEvent(new Event('scroll'));});await settle();
    assert.equal(fixture.entryReads,readsBefore,'输入区收缩造成的贴底滚动不读取更早记录');
    assert.equal(await panel().getByRole('button',{name:'向下到底',exact:true}).count(),0,'贴底滚动事件不弹出到底按钮');
    assert.ok(await distance()<24,'布局滚动后仍保持贴底');
    await stream.evaluate((node:HTMLElement)=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));node.scrollTop=0;node.dispatchEvent(new Event('scroll'));node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
    await panel().locator('[data-entry-id="latest-pin-older"]').waitFor({state:'attached'});
    assert.ok(fixture.entryReads>readsBefore,'用户继续向上翻阅仍加载更早记录');
  }finally{fixture.conversation=previous;historyPages.delete(1);await page.reload();await input().waitFor();}
  },
  'history/initial-page-alignment': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const previous=structuredClone(fixture.conversation),additional=fixture.additionalConversations,at=new Date().toISOString();
  const targetId='first-paint-target';
  const answer='打开后先只读取到这一条最新答复。';
  const older=Array.from({length:12},(_,i)=>[
    {id:'first-paint-older-'+i+'-user',sequence:i*2+1,runId:'first-paint-older-'+i,kind:'message',role:'user',text:`更早要求 ${i}`,status:'completed',createdAt:at},
    {id:'first-paint-older-'+i+'-answer',sequence:i*2+2,runId:'first-paint-older-'+i,kind:'message',role:'assistant',text:Array.from({length:8},(_,paragraph)=>`更早记录 ${i}-${paragraph}：用于确认首屏补页期间最新答复仍然稳定停在底部。`).join('\n\n'),status:'completed',createdAt:at},
  ]).flat();
  const target={...structuredClone(previous),id:targetId,title:'首帧定位验证',revision:'first-paint-r1',hidden:false,updatedAt:at,participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[
    {id:'first-paint-user',sequence:101,runId:'first-paint-run',kind:'message',role:'user',text:'打开后应该直接看到最新答复',status:'completed',createdAt:at},
    {id:'first-paint-answer',sequence:102,runId:'first-paint-run',kind:'message',role:'assistant',text:answer,status:'completed',createdAt:at},
  ],nextEntryCursor:100,run:run('completed','codex',{id:'first-paint-run',model:'fixture-model'}),requests:[],pendingSend:undefined};
  historyPages.set(100,{...target,entries:older,nextEntryCursor:undefined});
  try{
    fixture.additionalConversations=[target];
    await page.reload();await input().waitFor();
    await fixture.openHistoryList();
    const row=panel().locator('.ac-history-list button[data-conversation-id="'+targetId+'"]');
    await row.waitFor();
    fixture.holdEntryRead=true;
    const entryReadStarted=new Promise<void>(resolve=>{fixture.entryReadStarted=resolve;});
    await page.evaluate(()=>{
      const trace:ConversationScrollSample[]=[];
      (window as any).__conversationScrollTrace=trace;
      let frames=0;
      const sample=()=>{
        const stream=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');
        const list=stream?.querySelector<HTMLElement>('.ac-message-list');
        const entries=stream?[...stream.querySelectorAll<HTMLElement>('[data-entry-id]')].filter(node=>node.getClientRects().length).length:0;
        trace.push({at:performance.now(),top:stream?.scrollTop??0,height:stream?.scrollHeight??0,viewport:stream?.clientHeight??0,visible:Boolean(stream?.getClientRects().length&&list),entries,listBottom:list?.getBoundingClientRect().bottom??null,streamBottom:stream?.getBoundingClientRect().bottom??null,listTop:list?.getBoundingClientRect().top??null,streamTop:stream?.getBoundingClientRect().top??null});
        if(++frames<240)requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await row.click();
    await page.locator('#agent-conversation-panel[data-conversation-id="'+targetId+'"]').waitFor();
    await panel().locator('[data-entry-id="first-paint-answer"]').waitFor();
    await entryReadStarted;
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const beforeFill:ConversationScrollSample[]=await page.evaluate(()=>(window as any).__conversationScrollTrace as ConversationScrollSample[]);
    const visible=beforeFill.filter(sample=>sample.visible&&sample.entries>0);
    assert.ok(visible.length,'首批最新记录应在补页请求挂起时可见');
    const misplaced=visible.find(sample=>sample.listTop===null||sample.streamTop===null||Math.abs(sample.listTop-sample.streamTop)>1||sample.top!==0);
    assert.equal(misplaced,undefined,'补页期间不足一屏的内容必须顶对齐，不能撑高或产生滚动：'+JSON.stringify(visible.slice(-8)));
    fixture.releaseEntryRead!();
    await panel().locator('[data-entry-id="first-paint-older-11-answer"]').waitFor({state:'attached'});
    await panel().locator('[data-entry-id="first-paint-older-11-answer"] .markdown-body').waitFor();
    await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollHeight-node.scrollTop-node.clientHeight<2);});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const samples:ConversationScrollSample[]=await page.evaluate(()=>(window as any).__conversationScrollTrace as ConversationScrollSample[]);
    const afterFill=samples.filter(sample=>sample.visible&&sample.entries>0);
    const afterFirstScrollable=afterFill.findIndex(sample=>sample.height>sample.viewport+1);
    const geometry=await panel().locator('.ac-stream').evaluate((node:HTMLElement)=>({scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,scrollTop:node.scrollTop,contentHeight:node.querySelector<HTMLElement>('.ac-stream-content')?.getBoundingClientRect().height,listHeight:node.querySelector<HTMLElement>('.ac-message-list')?.getBoundingClientRect().height,entryCount:node.querySelectorAll('[data-entry-id]').length}));
    assert.ok(afterFirstScrollable>=0,'补页后应形成可滚动信息流：'+JSON.stringify({geometry,samples:afterFill.slice(-8)}));
    const jump=afterFill.slice(afterFirstScrollable).find(sample=>sample.height-sample.top-sample.viewport>=2);
    assert.equal(jump,undefined,'补页后不能先停在旧位置再跳到底部：'+JSON.stringify(afterFill.slice(Math.max(0,afterFirstScrollable-2),afterFirstScrollable+8)));
  }finally{
    fixture.releaseEntryRead?.();fixture.holdEntryRead=false;fixture.entryReadStarted=undefined;historyPages.delete(100);
    fixture.additionalConversations=additional;fixture.conversation=previous;
    await fixture.openHistoryList();
    await panel().locator('.ac-history-list button[data-conversation-id="'+previous.id+'"]').click();
    await page.locator('#agent-conversation-panel[data-conversation-id="'+previous.id+'"]').waitFor();
    await page.reload();await input().waitFor();
  }
  },
  'history/short-page-alignment': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const previous=structuredClone(fixture.conversation),additional=fixture.additionalConversations,at=new Date().toISOString();
  const targetId='short-history-first-paint';
  const target={...structuredClone(previous),id:targetId,title:'短历史首帧验证',revision:'short-history-r1',hidden:false,updatedAt:at,participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[
    {id:'short-history-user',sequence:11,runId:'short-history-run',kind:'message',role:'user',text:'打开后应该仍看到最新答复',status:'completed',createdAt:at},
    {id:'short-history-answer',sequence:12,runId:'short-history-run',kind:'message',role:'assistant',text:'补完更早记录后，这段短对话仍从信息流顶部开始。',status:'completed',createdAt:at},
  ],nextEntryCursor:10,run:run('completed','codex',{id:'short-history-run',model:'fixture-model'}),requests:[],pendingSend:undefined};
  historyPages.set(10,{...target,entries:[
    {id:'short-history-older',sequence:1,runId:'short-history-older-run',kind:'message',role:'user',text:'一条更早的短要求',status:'completed',createdAt:at},
  ],nextEntryCursor:undefined});
  try{
    fixture.additionalConversations=[target];
    await page.reload();await input().waitFor();
    await fixture.openHistoryList();
    const row=panel().locator('.ac-history-list button[data-conversation-id="'+targetId+'"]');
    await row.waitFor();await row.click();
    await page.locator('#agent-conversation-panel[data-conversation-id="'+targetId+'"]').waitFor();
    await panel().locator('[data-entry-id="short-history-older"]').waitFor({state:'attached'});
    await panel().locator('[data-entry-id="short-history-answer"] .markdown-body').waitFor();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const geometry=await panel().locator('.ac-stream').evaluate((node:HTMLElement)=>{
      const list=node.querySelector<HTMLElement>('.ac-message-list')!;
      return {scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,streamBottom:node.getBoundingClientRect().bottom,listBottom:list.getBoundingClientRect().bottom,streamTop:node.getBoundingClientRect().top,listTop:list.getBoundingClientRect().top};
    });
    assert.ok(geometry.scrollHeight<=geometry.clientHeight+1,'短历史补完后不应形成滚动区域：'+JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.listTop-geometry.streamTop)<=1&&geometry.scrollTop===0,'短历史补完后应保持顶对齐：'+JSON.stringify(geometry));
  }finally{
    historyPages.delete(10);fixture.additionalConversations=additional;fixture.conversation=previous;
    await fixture.openHistoryList();
    await panel().locator('.ac-history-list button[data-conversation-id="'+previous.id+'"]').click();
    await page.locator('#agent-conversation-panel[data-conversation-id="'+previous.id+'"]').waitFor();
    await page.reload();await input().waitFor();
  }
  },
  'history/send-reflow': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

 const saved=structuredClone(fixture.conversation),at=new Date().toISOString();
 const narration=Array.from({length:70},(_,i)=>`过程段落 ${i}：正在检查并保留用户的阅读现场。`).join('\n\n');
 const entry=(id:string,sequence:number,kind:string,text:string)=>({id,sequence,runId:'run-fixture',kind,role:kind==='tool'?'system':sequence===1?'user':'assistant',text,status:'completed',createdAt:at});
 const stream=panel().locator('.ac-stream');
 const settle=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 try{
  update({run:run('running'),retainedRuns:[],requests:[],nextEntryCursor:undefined,entries:[entry('reading-user',1,'message','检查阅读位置'),entry('reading-process',2,'message',narration),{...entry('reading-tool',3,'tool','工具记录'),name:'Read'}]});
  await page.reload();await input().waitFor();await panel().locator('[data-entry-id="reading-process"]').waitFor();
  await page.waitForFunction(()=>{const n=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return n&&n.scrollHeight-n.scrollTop-n.clientHeight<2;});
  await stream.evaluate((node:HTMLElement)=>{
   const content=node.querySelector<HTMLElement>('.ac-stream-content')!;
   content.style.height='900px';content.style.overflow='hidden';void node.scrollHeight;
   node.scrollTop=Math.min(node.scrollTop,900-node.clientHeight);
   content.style.removeProperty('height');content.style.removeProperty('overflow');
   // Native scrolling is queued after the mutation microtask checkpoint.
   content.append(document.createElement('span'));
  });await settle();
  assert.ok(await stream.evaluate((n:HTMLElement)=>n.scrollHeight-n.scrollTop-n.clientHeight<2),'连续钳制再增长保持底部');
  await stream.evaluate((node:HTMLElement)=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));node.scrollTop=1000;node.dispatchEvent(new Event('scroll'));node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});await settle();
  const before=await stream.evaluate((n:HTMLElement)=>n.scrollTop);
  update({run:run('completed'),activity:{version:900002,seenThrough:900001,active:false,updatedAt:at},entries:[...fixture.conversation.entries,entry('reading-final',4,'message',Array.from({length:40},(_,i)=>`最终答复 ${i}：已完成检查，正在阅读不要求先滚到底。`).join('\n\n'))]});
  await panel().locator('[data-entry-id="reading-final"]').waitFor({state:'attached'});await settle();
  assert.ok(await panel().locator('[data-entry-id="reading-process"]').isVisible(),'完成后不收起正在阅读的过程');
  assert.ok(Math.abs(await stream.evaluate((n:HTMLElement)=>n.scrollTop)-before)<2,'完成后保留中间阅读位置');
  assert.equal(fixture.conversation.activity.seenThrough,900001,'不可见的新答复仍待查看');
  const seen=page.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().endsWith('/seen')&&response.request().postDataJSON().through===900002);
  await stream.evaluate((node:HTMLElement)=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));const answer=node.querySelector<HTMLElement>('[data-entry-id="reading-final"]')!;node.scrollTop+=answer.getBoundingClientRect().top-node.getBoundingClientRect().top-100;node.dispatchEvent(new Event('scroll'));node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
  assert.ok(await stream.evaluate((n:HTMLElement)=>n.scrollHeight-n.scrollTop-n.clientHeight>24),'只阅读长答复开头，尚未贴底');
  assert.equal((await seen).status(),200);
  assert.equal(fixture.conversation.activity.seenThrough,900002,'可见的完成答复不残留待查看');
 }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/hidden-child-seen': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString(),version=900001;
  try{
    update({run:run('completed'),retainedRuns:[],requests:[],activity:{version,seenThrough:version-1,active:false,updatedAt:at},entries:[
      {id:'seen-primary-user',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'只查看主答复',status:'accepted',createdAt:at},
      {id:'seen-primary-answer',sequence:2,runId:'run-fixture',kind:'message',role:'assistant',text:'主答复已经可以阅读',status:'completed',createdAt:at},
      {id:'seen-child-input',sequence:3,runId:'run-fixture',kind:'message',role:'user',parentToolId:'parent-agent',text:'内部子任务输入',status:'completed',createdAt:at},
      {id:'seen-child-answer',sequence:4,runId:'run-fixture',kind:'message',role:'assistant',parentToolId:'parent-agent',text:'内部子任务报告',status:'completed',createdAt:at},
      {id:'retired-question-seen',sequence:5,runId:'run-fixture',kind:'notice',role:'system',text:'内部问题存档',createdAt:at},
    ]});
    const seen=page.waitForResponse((response:any)=>response.request().method()==='POST'&&response.url().endsWith('/seen')&&response.request().postDataJSON().through===version);
    await page.reload();await input().waitFor();await panel().locator('[data-entry-id="seen-primary-answer"]').waitFor();
    const jump=panel().getByRole('button',{name:'向下到底',exact:true});if(await jump.isVisible())await jump.click();
    await panel().locator('.ac-stream').evaluate((node:HTMLElement)=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
    assert.equal((await seen).status(),200);assert.equal(fixture.conversation.activity.seenThrough,version);
    assert.equal(await panel().locator('[data-entry-id="seen-child-input"],[data-entry-id="seen-child-answer"],[data-entry-id="retired-question-seen"]').count(),0);
  }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/scroll-anchor': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString();
  const entry=(id:string,sequence:number,text:string)=>({id,sequence,kind:'message',role:'assistant',text,runId:'scroll-'+id,status:'completed',createdAt:at});
  const long=Array.from({length:60},(_,i)=>`第 ${i} 段，用于核对可见阅读位置。`).join('\n\n');
  const settle=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
  const stream=panel().locator('.ac-stream');
  try{
    update({entries:[entry('scroll-current',100,long)],nextEntryCursor:100,run:run('completed'),requests:[]});
    historyPages.set(100,{...fixture.conversation,entries:[entry('scroll-earlier',50,long)],nextEntryCursor:undefined});
    await page.reload();await input().waitFor();
    // The input mounts before MarkdownHost's effect and font layout finish.
    await panel().locator('[data-entry-id="scroll-current"]').getByText(/第 59 段，用于核对可见阅读位置。/).waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await settle();
    await page.waitForFunction(()=>{const n=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(n&&n.scrollTop>100&&n.scrollHeight-n.scrollTop-n.clientHeight<2);});
    const reads=fixture.entryReads;
    // Content growth can queue a scroll event before the resize observer.
    await stream.evaluate((node:HTMLElement)=>{
      // Clicking the background alone is not a request to leave latest.
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      const spacer=document.createElement('div');spacer.id='scroll-layout-spacer';spacer.style.height='120px';node.querySelector('.ac-stream-content')!.append(spacer);
      // Growth preserves the old top (a viewport enlargement may clamp it).
      // An arbitrary move away from that position is reader intent, not layout.
      node.dispatchEvent(new Event('scroll'));
    });
    await settle();
    assert.ok(await stream.evaluate((n:HTMLElement)=>n.scrollHeight-n.scrollTop-n.clientHeight<2),'布局变化不能取消刷新后的最新跟随');
    assert.equal(fixture.entryReads,reads,'布局变化不是向前续读');
    // A scrollbar drag must win even if latest-follow was active before it.
    await stream.evaluate((node:HTMLElement)=>{
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      node.scrollTop-=160;node.dispatchEvent(new Event('scroll'));
      node.scrollTop+=40;node.dispatchEvent(new Event('scroll'));
      (window as any).__scrollExpected=node.scrollTop;
    });
    await settle();
    assert.ok(await stream.evaluate((n:HTMLElement)=>Math.abs(n.scrollTop-(window as any).__scrollExpected)<2),'向下拖动以当前可见位置为准，不强制到底');
    await panel().getByRole('button',{name:'向下到底',exact:true}).click();await settle();
    assert.ok(await stream.evaluate((n:HTMLElement)=>n.scrollHeight-n.scrollTop-n.clientHeight<2),'显式回到最新仍有效');
    fixture.holdEntryRead=true;
    const started=new Promise<void>(resolve=>{fixture.entryReadStarted=resolve;});
    await stream.evaluate((node:HTMLElement)=>{node.scrollTop=600;node.dispatchEvent(new Event('scroll'));});await started;
    await stream.evaluate((node:HTMLElement)=>{
      const observer=new MutationObserver(()=>{
        if(!node.querySelector('[data-entry-id="scroll-earlier"]'))return;
        observer.disconnect();
        queueMicrotask(()=>{
          // Move after the first compensation but before its animation frames.
          node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
          node.scrollTop+=160;node.dispatchEvent(new Event('scroll'));
          (window as any).__scrollExpected=node.scrollTop;
        });
      });
      observer.observe(node,{childList:true,subtree:true});
    });
    fixture.releaseEntryRead!();await panel().locator('[data-entry-id="scroll-earlier"]').waitFor();await settle();
    assert.ok(await stream.evaluate((n:HTMLElement)=>Math.abs(n.scrollTop-(window as any).__scrollExpected)<2),'补页期间继续向下滚动，不被旧锚点重新定位');
    await capture(page,'conversation-scroll-stable.png');
  }finally{
    fixture.releaseEntryRead?.();fixture.holdEntryRead=false;historyPages.delete(100);fixture.conversation=saved;
    await page.evaluate(()=>{delete (window as any).__scrollExpected;});await page.reload();await input().waitFor();
  }
  },
  'history/tool-detail-cache': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation);let reads=0,release:(()=>void)|undefined;
  const matcher='**/entry-detail/**';
  const full={id:'lazy-large-tool',sequence:2,kind:'tool',role:'system',name:'command',input:JSON.stringify({cmd:'read large result'}),text:'完整工具输出\n'+'x'.repeat(100000)+'\n完整输出结束',status:'completed',runId:'run-fixture',createdAt:new Date().toISOString()};
  const route=async(intercept:any)=>{reads++;const url=new URL(intercept.request().url());assert.equal(url.searchParams.get('revision'),'a'.repeat(64));await new Promise<void>(resolve=>{release=resolve;});await intercept.fulfill({json:full});};
  await page.route(matcher,route);
  try{
    update({run:run('completed'),requests:[],nextEntryCursor:undefined,entries:[{id:'lazy-user',sequence:1,kind:'message',role:'user',text:'检查大工具结果',runId:'run-fixture',createdAt:full.createdAt},{...full,text:'工具输出预览',detail:{revision:'a'.repeat(64)}},{id:'lazy-answer',sequence:3,kind:'message',role:'assistant',text:'检查完成',runId:'run-fixture',createdAt:full.createdAt}]});
    await page.reload();await input().waitFor();assert.equal(reads,0);
    await panel().getByRole('button',{name:'展开处理过程',exact:true}).click();
    await panel().locator('.ac-step-group>summary').first().click();assert.equal(reads,0,'展开分组不读取工具全文');
    const tool=panel().locator('[data-entry-id="lazy-large-tool"]');await tool.locator(':scope>summary').click();
    await tool.getByText('正在读取完整工具记录…',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-entry-id="lazy-large-tool"] [role="status"]'));
    assert.equal(reads,1);release?.();
    await page.waitForFunction(()=>document.querySelector('[data-entry-id="lazy-large-tool"] .ac-tool-detail')?.textContent?.includes('完整输出结束'));
    assert.equal(await tool.locator('.ac-tool-detail pre').last().textContent(),full.text);
    await tool.locator(':scope>summary').click();await tool.locator(':scope>summary').click();assert.equal(reads,1,'相同版本再次展开复用已读取内容');
  }finally{release?.();await page.unroute(matcher,route);fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/attention-priority': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),additional=fixture.additionalConversations;
  const rows=[
    {id:'priority-running',status:'running',at:'2026-10-30T08:00:00Z'},
    {id:'priority-waiting',status:'waiting-question',at:'2026-10-29T08:00:00Z'},
    {id:'priority-unseen',status:'completed',at:'2026-10-29T09:00:00Z'},
  ];
  try{
    update({run:run('completed'),activity:{version:1,seenThrough:1,active:false,userInputAt:'2026-10-28T08:00:00Z'}});
    fixture.additionalConversations=rows.map(row=>({...structuredClone(saved),id:row.id,title:row.id,workspaceId,
      revision:row.id,updatedAt:row.at,requests:[],run:run(row.status),activity:{version:1,seenThrough:0,active:true,userInputAt:row.at}}));
    await page.reload();await input().waitFor();
    const open=async()=>{await fixture.openHistoryList();await panel().locator('[data-conversation-id="priority-running"]').waitFor();};
    const order=()=>panel().locator(`[data-history-workspace="${workspaceId}"] .ac-history-row-main`).evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.dataset.conversationId).filter(id=>id?.startsWith('priority-')));
    await open();assert.deepEqual(await order(),['priority-unseen','priority-waiting','priority-running']);
    await fixture.backToConversation();
    fixture.additionalConversations[0].activity.userInputAt='2026-10-31T08:00:00Z';
    fixture.additionalConversations[0].revision='newer-input';
    await open();assert.deepEqual(await order(),['priority-unseen','priority-waiting','priority-running']);
    await capture(page,'conversation-attention-priority.png');
  }finally{
    fixture.additionalConversations=additional;fixture.conversation=saved;await page.reload();await input().waitFor();
  }
  },
  'history/fork-conversation': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

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
    await panel().getByRole('button',{name:'重命名对话',exact:true}).filter({hasText:'新对话'}).waitFor();
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
  },
  'history/responsive-width': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const sends=fixture.sends;
  const toggleFull=async(label:string)=>{await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});};
  const checkConversation=async(label:string)=>{
    const geometry=await panel().evaluate((node:HTMLElement)=>{
      const rect=(item:Element)=>{const r=item.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width};};
      const content=(item:Element)=>{const r=rect(item),style=getComputedStyle(item);return{left:r.left+parseFloat(style.paddingLeft),right:r.right-parseFloat(style.paddingRight)};};
      return{host:rect(node),header:rect(node.querySelector('.ac-thread-header')!),title:content(node.querySelector('.ac-thread-header')!),messages:content(node.querySelector('.ac-message-list')!),composer:rect(node.querySelector('.ac-composer')!),max:parseFloat(getComputedStyle(node).getPropertyValue('--ac-content-width'))};
    });
    for(const edge of ['left','right'] as const){for(const area of ['title','messages'] as const)assert.ok(Math.abs(geometry[area][edge]-geometry.composer[edge])<1,label+' '+area+' '+edge+' '+JSON.stringify(geometry));}
    assert.equal(geometry.header.width,geometry.host.width,'顶部背景保持铺满');assert.equal(geometry.max,800);
    await capture(page,'conversation-shared-width-'+label+'.png');
  };
  const checkHistory=async(label:string)=>{
    await fixture.openHistoryList();await panel().locator('.ac-history-row').first().waitFor();
    const geometry=await panel().locator('.ac-history').evaluate((node:HTMLElement)=>{
      const rect=(item:Element)=>{const r=item.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width};};
      const body=node.querySelector<HTMLElement>('.ac-history-body')!;return{host:rect(node),body:rect(body),header:rect(node.querySelector('.ac-thread-header')!),toolbar:rect(node.querySelector('.ac-history-toolbar')!),stats:rect(node.querySelector('.ac-execution-summary')!),group:rect(node.querySelector('.ac-history-group')!),overflow:body.scrollWidth-body.clientWidth};
    });
    assert.ok(Math.abs(geometry.body.width-Math.min(800,geometry.host.width))<1,label+'列表宽度封顶');
    assert.ok(Math.abs((geometry.body.left-geometry.host.left)-(geometry.host.right-geometry.body.right))<1,label+'居中');
    for(const area of ['stats','group'] as const){assert.ok(Math.abs(geometry[area].left-geometry.toolbar.left)<1);assert.ok(Math.abs(geometry[area].right-geometry.toolbar.right)<1);}
    assert.equal(geometry.header.width,geometry.host.width);assert.ok(geometry.overflow<=1,label+'无横向溢出');
    await capture(page,'conversation-history-width-'+label+'.png');await fixture.backToConversation();
  };
  try{
    await checkConversation('sidebar');await checkHistory('sidebar');await toggleFull('专注对话');
    for(const [label,width,height] of [['wide',2048,1152],['desktop',1280,900],['mobile',375,844]] as const){await page.setViewportSize({width,height});await checkConversation(label);await checkHistory(label);}
    assert.equal(fixture.sends,sends,'调整布局和查看列表不发送工作');
  }finally{
    await page.setViewportSize({width:1600,height:1000});if(await panel().locator('.ac-history').count())await fixture.backToConversation();
    if((await panel().getAttribute('class'))?.includes('is-full'))await toggleFull('恢复分屏');
  }
  },
  'history/focus-mode-drawer': async (fixture: AgentConversationFixture) => {
  const {capture,input,page,panel,run,update}=fixture;
  const saved=structuredClone(fixture.conversation);
  const toggleFull=async(label:string)=>{await panel().getByRole('button',{name:'更多对话操作',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();await page.locator('.ant-dropdown:visible').waitFor({state:'hidden'});};
  const rail=page.getByRole('complementary',{name:'当前对话与所有对话',exact:true}),listEntry=rail.locator('.ac-all-conversations'),drawer=panel().locator('.ac-history-drawer');
  try{
    update({title:'专注列表现场',requests:[],run:run('completed'),entries:[{id:'focus-user',sequence:1,kind:'message',role:'user',text:'专注列表不替换对话',createdAt:new Date().toISOString()}]});
    await page.reload();await input().waitFor();
    await toggleFull('专注对话');
    await listEntry.click();await drawer.waitFor();await drawer.locator('.ac-history-row').first().waitFor();
    assert.ok(await input().isVisible(),'专注模式打开列表栏后对话输入保持可见');
    assert.ok(await panel().getByText('专注列表不替换对话',{exact:true}).isVisible(),'对话正文不被历史替换');
    const geometry=await page.evaluate(()=>{const host=document.querySelector('#agent-conversation-panel')!.getBoundingClientRect(),bar=document.querySelector('.ac-history-drawer')!.getBoundingClientRect();return{hostLeft:host.left,hostWidth:host.width,barLeft:bar.left,barWidth:bar.width};});
    assert.ok(Math.abs(geometry.barLeft-geometry.hostLeft)<1,'列表栏贴近面板左侧');
    assert.ok(geometry.barWidth<=421&&geometry.barWidth<geometry.hostWidth,'列表栏宽度有界且不占满面板');
    await capture(page,'conversation-focus-history-drawer.png');
    await listEntry.click();await drawer.waitFor({state:'hidden'});
    assert.ok((await panel().getAttribute('class'))?.includes('is-full'),'再次点击入口不退出专注模式');
    await listEntry.click();await drawer.waitFor();
    await fixture.backToConversation();await drawer.waitFor({state:'hidden'});
    await listEntry.click();await drawer.waitFor();await drawer.locator('.ac-history-row').first().waitFor();
    await drawer.locator('.ac-history-row-main').first().click();await drawer.waitFor({state:'hidden'});await input().waitFor();
    assert.ok(await input().isVisible(),'选择对话后关闭列表栏并保留对话');
    await toggleFull('恢复分屏');
    await listEntry.click();await panel().locator('.ac-history').waitFor();
    assert.equal(await panel().locator('.ac-history-drawer').count(),0,'分屏模式不渲染临时栏');
    assert.equal(await input().isVisible(),false,'分屏模式历史仍在面板内替换对话');
    await fixture.backToConversation();await input().waitFor();
  }finally{
    fixture.conversation=saved;
    if((await panel().getAttribute('class'))?.includes('is-full'))await toggleFull('恢复分屏');
    await page.reload();await input().waitFor();
  }
  },
  'history/history-pagination': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const original=fixture.additionalConversations,requests:Array<{workspaceId:string|null;query:string|null;limit:number;cursor:string|null}>=[];
  let fail=false,stale=false,release:(()=>void)|undefined,started:(()=>void)|undefined,holdExpand=false,releaseExpand:(()=>void)|undefined,expandStarted:(()=>void)|undefined;
  const held=new Promise<void>(resolve=>{started=resolve;});
  const expandHeld=new Promise<void>(resolve=>{expandStarted=resolve;});
  const matcher='**/api/v1/app/agent-service/conversations?*';
  const intercept=async(route:any)=>{
    const url=new URL(route.request().url()),space=url.searchParams.get('workspaceId'),limit=Number(url.searchParams.get('limit'));
    requests.push({workspaceId:space,query:url.searchParams.get('query'),limit,cursor:url.searchParams.get('cursor')});
    if(url.searchParams.get('query')==='迟到现场'&&space===workspaceId){started?.();await new Promise<void>(resolve=>{release=resolve;});}
    if(holdExpand&&space===workspaceId&&limit===5){holdExpand=false;expandStarted?.();await new Promise<void>(resolve=>{releaseExpand=resolve;});}
    if((fail||stale)&&space===workspaceId&&limit===10)return route.fulfill({status:stale?409:503,json:{error:{code:stale?'agent_cursor_stale':'fixture_unavailable',message:stale?'列表位置已变化，请刷新后继续。':'分组暂不可用'}}});
    await route.fallback();
  };
  await page.route(matcher,intercept);
  try{
    const make=(id:string,space:string)=>({...fixture.conversation,id,workspaceId:space,title:'分批现场 '+id,entries:[],participants:[],run:undefined,activity:undefined});
    const registry=await (await page.request.get(new URL('/api/v1/workspaces',workspaceUrl).href)).json();
    const otherId=registry.workspaces.find((entry:any)=>entry.workspace?.id&&entry.workspace.id!==workspaceId)?.workspace.id;assert.ok(otherId);
    fixture.additionalConversations=[make('other-batch',otherId),...Array.from({length:26},(_,i)=>make('batch-'+i,workspaceId)),...Array.from({length:8},(_,i)=>make('default-batch-'+i,'@default'))];
    await fixture.openHistoryList();
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
    for(const n of [15,25,26]){await group.getByRole('button',{name:/加载更多/}).click();await count(n);}
    assert.deepEqual(groupCalls().slice(-3).map(row=>({limit:row.limit,cursor:row.cursor})),[{limit:10,cursor:'5'},{limit:10,cursor:'15'},{limit:10,cursor:'25'}]);assert.equal(await group.getByRole('button',{name:/加载更多/}).count(),0);
    await header.click();await count(0);assert.equal(await header.getAttribute('aria-expanded'),'false');assert.equal(await panel().getByText('没有匹配的对话',{exact:true}).count(),0,'折叠的单个分组不产生假空态');
    holdExpand=true;await header.press('Enter');await count(5);
    const expandMore=group.getByRole('button',{name:/加载更多/});await expandMore.waitFor();
    assert.equal(await expandMore.isDisabled(),true,'折叠后重新展开的首帧就显示加载更多，游标返回前不可点');
    await expandHeld;assert.deepEqual({limit:groupCalls().at(-1)!.limit,cursor:groupCalls().at(-1)!.cursor},{limit:5,cursor:null});releaseExpand?.();releaseExpand=undefined;
    await page.waitForFunction(({id}:any)=>{const button=[...document.querySelectorAll('[data-history-workspace="'+id+'"] button')].find(node=>node.textContent?.includes('加载更多')) as HTMLButtonElement|undefined;return Boolean(button&&!button.disabled);},{id:workspaceId});
    assert.equal(await expandMore.isDisabled(),false,'续读游标返回后按钮可继续加载');
    await defaults.getByRole('button',{name:/加载更多/}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-history-workspace="@default"] .ac-history-row').length===8);
    fixture.expectedBrowserErrors.add('503');fixture.expectedBrowserErrors.add('Service Unavailable');fail=true;await group.getByRole('button',{name:/加载更多/}).click();await group.getByText('分组暂不可用',{exact:true}).waitFor();await count(5);fail=false;await group.getByRole('button',{name:/重\s*试/}).click();await count(15);
    fixture.expectedBrowserErrors.add('409');fixture.expectedBrowserErrors.add('Conflict');stale=true;await group.getByRole('button',{name:/加载更多/}).click();await group.getByText('列表位置已变化，请刷新后继续。',{exact:true}).waitFor();await count(15);stale=false;await group.getByRole('button',{name:'刷新列表',exact:true}).click();await count(15);
    await search.fill('迟到现场');await held;await search.fill('分批现场');await count(15);release?.();await page.waitForTimeout(100);await count(15);
    await capture(page,'conversation-history-manual-controls.png');
  }finally{
    release?.();releaseExpand?.();fail=false;stale=false;fixture.additionalConversations=original;await page.unroute(matcher,intercept);
    if(await panel().locator('.ac-history').count())await fixture.backToConversation();await input().waitFor();
  }
  },
  'history/search': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),additional=fixture.additionalConversations,at=new Date().toISOString();
  const requests:Array<{limit:number;query:string|null}>=[];
  const matcher='**/api/v1/app/agent-service/conversations?*';
  const intercept=async(route:any)=>{const url=new URL(route.request().url());requests.push({limit:Number(url.searchParams.get('limit')),query:url.searchParams.get('query')});await route.fallback();};
  try{
    fixture.additionalConversations=[
      {...structuredClone(saved),id:'search-message',title:'普通历史',revision:'search-message',updatedAt:at,entries:[{id:'search-message',sequence:1,kind:'message',role:'assistant',text:'这里有片段关键词和上下文',status:'completed',createdAt:at}],participants:[],run:run('completed'),requests:[],activity:undefined},
      {...structuredClone(saved),id:'search-tool',title:'工具现场',revision:'search-tool',updatedAt:at,entries:[{id:'search-tool',sequence:1,kind:'tool',role:'system',text:'工具输出包含片段关键词',status:'completed',createdAt:at,name:'Bash'}],participants:[],run:run('completed'),requests:[],activity:undefined},
    ];
    update({title:'当前对话',run:run('completed'),requests:[],entries:[]});
    await page.route(matcher,intercept);
    await page.reload();await input().waitFor();
    await fixture.openHistoryList();
    const search=panel().getByRole('textbox',{name:'搜索对话',exact:true});await search.fill('片段关键词');
    await panel().locator('[data-conversation-id="search-message"] .ac-history-row-snippet').waitFor();
    await page.waitForFunction(()=>!document.querySelector('[data-conversation-id="search-tool"]'));
    assert.equal(await panel().locator('[data-conversation-id="search-tool"]').count(),0,'工具日志不参与搜索');
    assert.ok((await panel().locator('[data-conversation-id="search-message"] .ac-history-row-snippet').textContent())?.includes('片段关键词'));
    assert.equal(requests.filter(row=>row.limit===1&&row.query==='片段关键词').length,0,'统计读取不随搜索关键词重发');
    await search.fill('完全不存在的关键词');
    await panel().getByText('没有匹配的对话',{exact:true}).waitFor();
  }finally{await page.unroute(matcher,intercept);fixture.additionalConversations=additional;fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/model-filter': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),additional=fixture.additionalConversations,models:string[]=[];
  let filteredStarted!:(()=>void);const filtered=new Promise<void>(resolve=>filteredStarted=resolve);
  const matcher='**/api/v1/app/agent-service/conversations?*';
  const intercept=async(route:any)=>{const model=new URL(route.request().url()).searchParams.get('model');if(model){models.push(model);if(model==='filter-model')filteredStarted();}await route.fallback();};
  try{
    fixture.additionalConversations=[];
    update({title:'筛选现场',run:run('running','qoder',{model:'filter-model',modelAccountId:'filter-account'}),requests:[],entries:[]});
    await page.route(matcher,intercept);
    await page.reload();await input().waitFor();
    await fixture.openHistoryList();
    const chip=panel().locator('.ac-execution-summary button').first();await chip.waitFor();
    await chip.click();
    await filtered;
    await page.waitForFunction(()=>document.querySelector('.ac-execution-summary button')?.getAttribute('aria-pressed')==='true');
    assert.ok(models.includes('filter-model'),'点击模型统计项应带模型条件读取列表');
    await chip.click();
    await page.waitForFunction(()=>!document.querySelector('.ac-execution-filter'));
    await page.waitForFunction(()=>document.querySelector('.ac-execution-summary button')?.getAttribute('aria-pressed')==='false');
  }finally{await page.unroute(matcher,intercept);fixture.additionalConversations=additional;fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/historical-model': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const previous=structuredClone(fixture.conversation),createdAt=new Date().toISOString();
      const participants=[{id:'participant-dsh',connectionId:'dsh',provider:'dsh',label:'DSH',model:'fixture-fast',contextId:'old',deliveredThrough:0},{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-fast',contextId:'current',deliveredThrough:0}];
      const entries=[{id:'old-prompt',sequence:1,kind:'message',role:'user',text:'上一轮',runId:'old-run',createdAt},{id:'old-answer',sequence:2,kind:'message',role:'assistant',text:'上一轮回复',runId:'old-run',participantId:'participant-dsh',provider:'dsh',createdAt},{id:'awaiting-prompt',sequence:3,kind:'message',role:'user',text:'新一轮等待回复',runId:'run-fixture',status:'sending',createdAt}];
      update({participants,entries,run:run('starting','codex',{accepted:false,model:'fixture-model'}),requests:[]});await page.reload();await input().waitFor();
      const current=()=>panel().locator('[data-turn-id="awaiting-prompt"] .ac-turn-identity-link');
      const old=()=>panel().locator('[data-turn-id="old-prompt"] .ac-turn-identity-link');
      assert.equal((await current().innerText()).split('\n')[0],'Codex · Fixture model','启动中按执行编号识别没有参与方字段的用户输入');
      assert.equal(await old().innerText(),'DSH · Fast model','历史名称来自历史参与方而非当前执行');
      update({run:run('running','codex',{model:'fixture-model'})});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator('.ac-turn.is-executing').waitFor();assert.equal((await current().innerText()).split('\n')[0],'Codex · Fixture model');
      await chooseAgent('Qoder');await chooseModel('Fast model');await closeModelSettings();assert.equal((await current().innerText()).split('\n')[0],'Codex · Fixture model','输入区下一轮选择不能重标当前执行');assert.equal(await old().innerText(),'DSH · Fast model');
      await page.reload();await input().waitFor();assert.equal((await current().innerText()).split('\n')[0],'Codex · Fixture model','刷新后仍从执行记录恢复名称');
      update({entries:[...entries,{id:'first-reply',sequence:4,kind:'message',role:'assistant',text:'开始处理',runId:'run-fixture',participantId:'participant-codex',provider:'codex',createdAt}]});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator('[data-entry-id="first-reply"]').waitFor();assert.equal((await current().innerText()).split('\n')[0],'Codex · Fixture model','首条回复到达前后名称一致');
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
  },
  'history/history-identity': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const identity='a63c0c92-c53d-4d8a-8a37-73f0169b282f',originalId=fixture.conversation.id,viewport=page.viewportSize();
      fixture.additionalConversations.push({...fixture.conversation,id:identity,workspaceId:workspaceId,title:'用于验证长标题不会挤出第三行的对话，标题超出时应保持在一行内',entries:[],participants:[],run:undefined,activity:undefined});
      const history=async()=>{await fixture.openHistoryList();await panel().locator('.ac-history-list button[data-conversation-id="'+identity+'"]').waitFor();};
      const assertTwoLines=async()=>{
        const row=panel().locator('.ac-history-list button[data-conversation-id="'+identity+'"]');assert.equal(await row.locator('.ac-history-id').innerText(),identity);
        const copyOrder=await row.evaluate((node:HTMLElement)=>{const parent=node.parentElement!,copy=parent.querySelector('.ac-history-row-copy')!,id=node.querySelector('.ac-history-id')!;const a=copy.getBoundingClientRect(),b=id.getBoundingClientRect();return{copyLeft:a.left,copyRight:a.right,idLeft:b.left,copyMid:a.top+a.height/2,idMid:b.top+b.height/2};});
        assert.ok(copyOrder.copyRight<=copyOrder.idLeft&&Math.abs(copyOrder.copyMid-copyOrder.idMid)<4,JSON.stringify(copyOrder));
        const geometry=await row.evaluate((node:HTMLElement)=>{const title=node.querySelector('strong')!,meta=node.querySelector('small')!;return{height:node.getBoundingClientRect().height,title:title.getBoundingClientRect().height,meta:meta.getBoundingClientRect().height,overflow:node.scrollWidth>node.clientWidth};});
        assert.ok(geometry.height<=60&&geometry.title<=21&&geometry.meta<=19&&!geometry.overflow,JSON.stringify(geometry));
      };
      await history();await assertTwoLines();
      const toolbar=panel().locator('.ac-history-toolbar');assert.equal(await toolbar.locator(':scope > :first-child').getAttribute('class').then((value:string)=>value.includes('ant-input')),true,'搜索在前');assert.equal(await toolbar.locator('.ant-select-selection-item').innerText(),'全部工作空间','列表入口默认全部工作空间');
      const toolbarSizes=await toolbar.evaluate((node:HTMLElement)=>({search:node.querySelector('.ant-input-affix-wrapper')!.getBoundingClientRect().width,workspace:node.querySelector('.ant-select')!.getBoundingClientRect().width}));assert.ok(toolbarSizes.workspace<=128&&toolbarSizes.search>toolbarSizes.workspace,JSON.stringify(toolbarSizes));
      await capture(page,'agent-conversation-history-desktop.png');
      await panel().locator('.ac-history-list button[data-conversation-id="'+identity+'"]').click();await panel().locator('.ac-thread-identity').waitFor();assert.equal(await panel().locator('.ac-thread-identity>span').innerText(),identity);
      await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__conversationCopiedId=text;}}});});
      await panel().getByRole('button',{name:'复制对话 ID',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).__conversationCopiedId),identity);const copiedButton=panel().getByRole('button',{name:'已复制',exact:true});await copiedButton.waitFor();assert.equal(await copiedButton.isDisabled(),true,'复制成功后图标切换且不可重复点击');assert.equal(await panel().getByText('对话 ID 已复制。',{exact:true}).count(),0);await panel().getByRole('button',{name:'复制对话 ID',exact:true}).waitFor({timeout:6000});const heading=await panel().locator('.ac-thread-header').boundingBox(),titleBox=await panel().locator('.ac-thread-title').boundingBox(),identityBox=await panel().locator('.ac-thread-identity').boundingBox();assert.ok(heading!.height<=43&&identityBox!.x>=titleBox!.x+titleBox!.width&&Math.abs((titleBox!.y+titleBox!.height/2)-(identityBox!.y+identityBox!.height/2))<3,'标题和ID同一行');assert.equal(await panel().locator('.ac-thread-identity>:first-child').getAttribute('aria-label'),'复制对话 ID');
      await page.evaluate(()=>{delete (navigator as any).clipboard;delete (window as any).__conversationCopiedId;});await capture(page,'agent-conversation-identity-desktop.png');
      await page.setViewportSize({width:390,height:844});await panel().locator('.ac-thread-identity').waitFor();assert.ok(await panel().getByRole('button',{name:'复制对话 ID',exact:true}).isVisible());await capture(page,'agent-conversation-identity-mobile.png');
      await history();await assertTwoLines();await capture(page,'agent-conversation-history-mobile.png');await panel().locator('.ac-history-list button[data-conversation-id="'+originalId+'"]').click();await input().waitFor();fixture.additionalConversations=fixture.additionalConversations.filter(item=>item.id!==identity);await page.setViewportSize(viewport);
  },
  'history/historical-tool-failure': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString();
  const tool=(id:string,name:string,status:string,sequence:number)=>({id,name,status,sequence,kind:'tool',role:'system',text:id,runId:'run-fixture',createdAt:at});
  try{
    for(const [name,status] of [['Agent','running'],['command','running'],['read','running'],['Agent','completed'],['Agent','unknown'],['Agent','failed']]){
      update({entries:[tool('earlier-failed','command','completed',1),tool('earlier-ok','read','completed',2),tool('current-tool',name,status,3)],run:run('running'),requests:[]});
      await page.reload();
      const group=panel().locator('.ac-step-group.is-live'),summary=group.locator(':scope>summary');
      await summary.waitFor();assert.equal(await summary.getAttribute('data-current-tool-status'),status);
      await summary.click();
      const color=(locator:any)=>locator.evaluate((node:HTMLElement)=>getComputedStyle(node).color);
      const groupColor=await color(summary.locator(':scope>.ac-step-node'));
      const toolColor=await color(group.locator('[data-entry-id="current-tool"]>summary>.ac-step-node'));
      // Compare each role with its own baseline; groups and tool rows have
      // deliberately different hierarchy colors in the current contract.
      update({entries:[tool('earlier-failed','command','failed',1),tool('earlier-ok','read','completed',2),tool('current-tool',name,status,3)]});
      await group.locator('[data-entry-id="earlier-failed"].is-failed').waitFor();
      const currentColor=await color(group.locator('[data-entry-id="current-tool"]>summary>.ac-step-node'));
      const failedColor=await color(group.locator('[data-entry-id="earlier-failed"]>summary>.ac-step-node'));
      assert.equal(await summary.getAttribute('data-current-tool-status'),status,'历史失败不能改写当前工具状态');
      assert.equal(await color(summary.locator(':scope>.ac-step-node')),groupColor,'历史失败不能改变工具组原图标颜色');
      assert.equal(currentColor,toolColor,'历史失败不能改变当前工具原图标颜色');
      assert.notEqual(groupColor,failedColor,'工具组保持正常图标，失败由具体工具表达');
      if(status==='failed')assert.equal(currentColor,failedColor);
      else assert.notEqual(currentColor,failedColor,'历史失败不能给正常执行的图形染色');
      assert.match(await group.locator('[data-entry-id="earlier-failed"]>summary').innerText(),/失败/);
      if(name==='Agent'&&status==='running')await capture(page,'conversation-live-status-isolated.png');
    }
    update({run:run('completed')});await page.reload();
    await panel().getByRole('button',{name:'展开处理过程',exact:true}).click();
    const settled=panel().locator('.ac-step-group:not(.is-live)');
    assert.match(await settled.locator(':scope>summary').innerText(),/2 项失败/);
    await settled.locator(':scope>summary').click();
    assert.notEqual(await settled.locator(':scope>summary>.ac-step-node').evaluate((node:HTMLElement)=>getComputedStyle(node).color),
      await settled.locator('[data-entry-id="earlier-failed"]>summary>.ac-step-node').evaluate((node:HTMLElement)=>getComputedStyle(node).color),'折叠组保持正常工具图标，失败仍由右侧计数提示');
  }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/turn-timing': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation);
  try{
    const startedAt='2026-11-02T05:11:24.000Z',updatedAt='2026-11-02T05:17:21.000Z';
    const entries=[
      {id:'timed-input',sequence:1,kind:'message',role:'user',runId:'run-fixture',text:'排查对话搜索',createdAt:startedAt},
      {id:'timed-narration',sequence:2,kind:'message',role:'assistant',runId:'run-fixture',text:'开始排查',createdAt:'2026-11-02T05:11:32.000Z',status:'completed'},
      {id:'timed-tool',sequence:3,kind:'tool',role:'system',runId:'run-fixture',name:'command',text:'已核对实现',createdAt:'2026-11-02T05:16:56.000Z',status:'completed'},
      {id:'timed-answer',sequence:4,kind:'message',role:'assistant',runId:'run-fixture',text:'排查结论已保存',createdAt:'2026-11-02T05:17:14.000Z',status:'completed'},
    ];
    for(const status of ['completed','unknown']){
      update({entries,run:run(status,'qoder',{startedAt,updatedAt,resourcesReleased:true,executionState:status==='completed'?'ended':'unknown'}),requests:[]});
      await page.reload();await input().waitFor();
      assert.equal(await panel().locator('.ac-execution-indicator time').first().innerText(),'00:05:57');
      const initial=panel().locator('.ac-turn-identity-toggle');
      if(await initial.getAttribute('aria-expanded')==='true')await initial.click();
      const expand=panel().getByRole('button',{name:'展开处理过程',exact:true});
      await expand.waitFor();assert.equal(await expand.locator('.ac-turn-identity-caret svg').getAttribute('data-icon'),'right');
      await expand.click();
      const collapse=panel().getByRole('button',{name:'收起处理过程',exact:true});
      assert.equal(await collapse.locator('.ac-turn-identity-caret svg').getAttribute('data-icon'),'down');
      await collapse.click();assert.equal(await expand.locator('.ac-turn-identity-caret svg').getAttribute('data-icon'),'right');
      if(status==='completed')await capture(page,'conversation-whole-turn-time.png');
    }
  }finally{fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/tool-folding': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const previous=structuredClone(fixture.conversation);
      const tool=(id:string,status='completed')=>({id,sequence:id==='single-tool'?1:2,kind:'tool',role:'system',name:'command',text:'echo verify\ncommand output',status,runId:'run-fixture',createdAt:new Date().toISOString()});
      update({entries:[tool('single-tool')],run:run('running')});await page.reload();
      const initialGroup=panel().locator('.ac-step-group');await initialGroup.locator(':scope>summary').waitFor();assert.equal(await initialGroup.getAttribute('open'),null);assert.equal(await panel().locator('.ac-step').count(),0,'工具默认只显示汇总');
      assert.equal(await initialGroup.locator(':scope>summary .ac-execution-light').count(),0,'执行中的工具组不再显示行前光点');assert.match((await initialGroup.getAttribute('class'))??'',/is-live/,'工具组保留实时状态');assert.equal(await initialGroup.locator(':scope>summary').evaluate((node:HTMLElement)=>getComputedStyle(node).animationName),'ac-live-row','整行保持呼吸动画');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await initialGroup.locator(':scope>summary').evaluate((node:HTMLElement)=>getComputedStyle(node).animationName),'none');assert.equal(await panel().locator('.ac-execution-indicator .ac-execution-light').first().evaluate((node:HTMLElement)=>getComputedStyle(node).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});assert.equal(await initialGroup.locator(':scope>summary .ac-step-action').count(),0,'执行中工具行不显示调用统计');assert.equal(await initialGroup.locator(':scope>summary .ac-step-chevron').count(),1,'执行中工具行保留展开折叠图标');assert.equal(await initialGroup.locator(':scope>summary .ac-step-chevron').getAttribute('aria-hidden'),'true');await initialGroup.locator(':scope>summary').click();
      const first=panel().locator('[data-entry-id="single-tool"]');await first.locator(':scope>summary').waitFor();
      const handle=await first.elementHandle();await first.locator(':scope>summary').click();await first.locator('.ac-tool-detail').waitFor();
      update({entries:[tool('single-tool'),tool('second-tool','failed')]});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await panel().locator('[data-entry-id="second-tool"]').waitFor();assert.equal(await first.evaluate((node:HTMLElement,old:HTMLElement)=>node===old,handle),true);assert.equal(await first.getAttribute('open'),'');
      await panel().locator('[data-entry-id="second-tool"]>summary').click();assert.match(await panel().locator('[data-entry-id="second-tool"]').innerText(),/失败/);
      update({run:run('completed')});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator('.ac-process[data-process-state="settled"]').waitFor({state:'attached'});assert.equal(await panel().locator('.ac-process[open]').count(),0);
      await panel().getByRole('button',{name:'展开处理过程',exact:true}).click();assert.equal(await panel().locator('.ac-process-timeline').evaluate((node:HTMLElement)=>getComputedStyle(node).borderLeftWidth),'0px');assert.match(await panel().locator('.ac-step-group').first().innerText(),/1 项失败/,'失败数在工具组汇总靠右展示');
      const caretOrder=await panel().locator('.ac-turn-identity-toggle').first().evaluate((node:HTMLElement)=>{const kids=[...node.children].map(child=>child.className.toString());return {name:kids.findIndex(cls=>cls.includes('ac-turn-identity-name')),indicator:kids.findIndex(cls=>cls.includes('ac-execution-indicator')),caret:kids.findIndex(cls=>cls.includes('ac-turn-identity-caret'))};});assert.ok(caretOrder.name<caretOrder.indicator&&caretOrder.indicator<caretOrder.caret,'折叠图标放在时间后面');
      const scrollingTools=Array.from({length:24},(_,index)=>tool('scroll-tool-'+index));
      const longAnswer={id:'scroll-answer',sequence:99,kind:'message',role:'assistant',runId:'run-fixture',text:Array.from({length:80},(_,index)=>'信息流第 '+(index+1)+' 行').join('\n'),status:'completed',createdAt:new Date().toISOString()};
      update({entries:[...scrollingTools,longAnswer],run:run('running')});await page.reload();await input().waitFor();
      const scrollingGroup=panel().locator('.ac-step-group').first();await scrollingGroup.locator(':scope>summary').waitFor();
      if(await scrollingGroup.getAttribute('open')===null)await scrollingGroup.locator(':scope>summary').click();
      const scrollingItems=scrollingGroup.locator(':scope>.ac-step-group-items');await scrollingItems.waitFor();
      const stream=panel().locator('.ac-stream');
      const scrollGeometry=await scrollingItems.evaluate((node:HTMLElement)=>({scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}));
      assert.ok(scrollGeometry.scrollHeight>scrollGeometry.clientHeight+4,'工具组内容形成内部滚动条');
      await stream.evaluate((node:HTMLElement)=>node.scrollTop=0);await scrollingItems.evaluate((node:HTMLElement)=>node.scrollTop=0);
      await scrollingItems.hover();await page.mouse.wheel(0,160);
      await page.waitForFunction(()=>{const node=document.querySelector<HTMLElement>('.ac-step-group[open]>.ac-step-group-items');return Boolean(node&&node.scrollTop>0);});
      assert.equal(await stream.evaluate((node:HTMLElement)=>node.scrollTop),0,'工具组内未到底时外层信息流不抢先滚动');
      await scrollingItems.evaluate((node:HTMLElement)=>node.scrollTop=node.scrollHeight);
      const outerBefore=await stream.evaluate((node:HTMLElement)=>node.scrollTop);
      await page.mouse.wheel(0,160);
      await page.waitForFunction((before:number)=>{const node=document.querySelector<HTMLElement>('#agent-conversation-panel .ac-stream');return Boolean(node&&node.scrollTop>before);},outerBefore);
      await capture(page,'conversation-tool-group-scroll-chain.png');
      await capture(page,'conversation-live-process-flat.png');await handle?.dispose();fixture.conversation=previous;await page.reload();await input().waitFor();
  },
  'history/new-input-with-question': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString(),beforeReplies=fixture.replies,beforeSupplements=fixture.supplementaryCalls;
  const pattern='**/agent-conversations/*/send';let received:any;
  const admit=async(route:any)=>{
    received=route.request().postDataJSON();const previous=fixture.conversation.run;
    update({requests:[],retainedRuns:[{...previous,supersededBy:'new-input-turn'}],run:run('running','codex',{id:'new-input-turn',model:'fixture-model'}),entries:[...fixture.conversation.entries,{id:'new-input-entry',sequence:2,runId:'new-input-turn',kind:'message',role:'user',text:received.text,status:'accepted',createdAt:at}]});
    await route.fulfill({json:{conversation:fixture.conversation,run:fixture.conversation.run}});
  };
  try{
    update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[{id:'old-input-entry',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'原要求',createdAt:at}],run:run('running','codex',{model:'fixture-model',reasoningEffort:'high',permissionMode:'full-access'}),requests:[{id:'question-for-new-input',runId:'run-fixture',participantId:'participant-codex',generation:'generation-fixture',kind:'question',blocking:false,title:'是否允许重启？',questions:[{id:'restart',label:'是否允许重启？',options:[{id:'yes',label:'允许'},{id:'no',label:'不允许'}]}]}]});
    await page.route(pattern,admit);await page.reload();await input().waitFor();
    await input().fill('先讨论配置文件，不回答重启问题');await panel().getByRole('button',{name:'发送对话',exact:true}).click();
    await panel().locator('.ac-turn[data-run-id="new-input-turn"] .ac-turn-prompt').filter({hasText:'先讨论配置文件'}).waitFor();
    assert.equal(received.text,'先讨论配置文件，不回答重启问题');assert.equal(await input().inputValue(),'');
    assert.equal(fixture.replies,beforeReplies);assert.equal(fixture.supplementaryCalls,beforeSupplements);assert.equal(fixture.conversation.requests.length,0);
    await capture(page,'question-new-input-turn.png');
  }finally{await page.unroute(pattern,admit);fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/failed-new-input': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),at=new Date().toISOString(),beforeReplies=fixture.replies;
  const request={id:'preserved-old-question',runId:'run-fixture',participantId:'participant-codex',generation:'generation-fixture',kind:'question',title:'是否重启？',questions:[{id:'restart',label:'是否重启？',options:[{id:'yes',label:'允许'}]}]};
  const pattern='**/agent-conversations/*/send';
  const submit=async(route:any)=>{
    const body=route.request().postDataJSON(),old=fixture.conversation.run;
    update({run:run('starting','codex',{id:'not-native-accepted',accepted:false,model:'fixture-model'}),retainedRuns:[old],requests:[request],entries:[...fixture.conversation.entries,{id:'not-accepted-input',sequence:2,runId:'not-native-accepted',kind:'message',role:'user',text:body.text,createdAt:at,status:'sending'}]});
    await route.fulfill({json:{conversation:fixture.conversation,run:fixture.conversation.run}});
  };
  try{
    update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[{id:'preserved-old-input',sequence:1,runId:'run-fixture',kind:'message',role:'user',text:'原目标',createdAt:at}],run:run('waiting-question','codex',{model:'fixture-model',permissionMode:'full-access'}),requests:[request],pendingSend:undefined});
    await page.route(pattern,submit);await page.reload();await input().waitFor();await input().fill('先讨论新要求');await panel().getByRole('button',{name:'发送对话',exact:true}).click();
    await panel().locator('.ac-turn[data-run-id="not-native-accepted"]').waitFor();
    const card=panel().locator('[data-agent-request="'+request.id+'"]');await card.waitFor();
    update({run:{...fixture.conversation.run,status:'failed',diagnostic:'新轮未被原生受理'}});await page.reload();await input().waitFor();
    await card.getByRole('radio',{name:'允许',exact:true}).check();assert.equal(await card.getByRole('button',{name:'回答并继续',exact:true}).isEnabled(),true);
    assert.equal(fixture.replies,beforeReplies);assert.equal(fixture.conversation.run.accepted,false);assert.equal(fixture.conversation.requests[0].id,request.id);
    await capture(page,'new-input-failure-preserves-old-question.png');
  }finally{await page.unroute(pattern,submit);fixture.conversation=saved;await page.reload();await input().waitFor();}
  },
  'history/running-supplement': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const previous=structuredClone(fixture.conversation),previousUploads=fixture.attachmentUploads,previousSupplementCalls=fixture.supplementaryCalls,startedAt=new Date(Date.now()-125000).toISOString();
      const entry=(id:string,sequence:number,role:string,text:string)=>({id,sequence,kind:'message',role,text,provider:'codex',participantId:'participant-codex',runId:'run-fixture',createdAt:new Date().toISOString(),status:'completed'});
      const long=Array.from({length:25},(_,i)=>`${i+1}. 保留完整用户要求，展开后在固定区域阅读。`).join('\n');
      update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries:[entry('long-user',1,'user',long),entry('live-narration',2,'assistant',Array.from({length:40},(_,i)=>'自然执行过程 '+i).join('\n\n'))],run:run('running','codex',{startedAt,model:'fixture-model'}),requests:[]});await page.reload();await input().fill('');
      assert.equal(await panel().getByRole('button',{name:'发送对话',exact:true}).isDisabled(),true);assert.equal(await panel().locator('.ac-compose-wrap').getByRole('button',{name:'停止本次执行',exact:true}).count(),1);assert.equal(await panel().locator('.ac-thread-actions').getByRole('button',{name:'停止本次执行',exact:true}).count(),0);
      const stream=panel().locator('.ac-stream');await stream.evaluate((node:HTMLElement)=>node.scrollTop=300);const stickyHead=panel().locator('.ac-turn.is-executing>.ac-turn-head');const sticky=await stickyHead.evaluate((node:HTMLElement)=>({top:node.getBoundingClientRect().top,stream:node.closest('.ac-stream')!.getBoundingClientRect().top,position:getComputedStyle(node).position}));assert.equal(sticky.position,'sticky');assert.ok(Math.abs(sticky.top-sticky.stream)<2,JSON.stringify(sticky));assert.equal(await panel().locator('.ac-turn.is-executing>.ac-turn-head>.ac-turn-context').evaluate((node:HTMLElement)=>getComputedStyle(node).position),'static','气泡自身不吸顶，随吸顶头一起固定');
      await panel().getByRole('button',{name:'展开内容',exact:true}).first().click();assert.equal(await panel().locator('.ac-turn-prompt-content').first().evaluate((node:HTMLElement)=>getComputedStyle(node).overflowY),'auto');await panel().getByRole('button',{name:'收起内容',exact:true}).click();assert.match(await panel().locator('.ac-turn-identity').first().innerText(),/Codex · Fixture model/);assert.ok(await panel().locator('.ac-turn-identity .ac-execution-indicator').first().innerText()!=='0:00');
      // Legacy supplementary entries remain readable; new input no longer creates them.
      update({entries:[...fixture.conversation.entries,{...entry('legacy-supplement',3,'user','执行中补充图文'),attachments:[]}]});
      await page.reload();await input().waitFor();
      await panel().getByRole('button',{name:'收起处理过程',exact:true}).waitFor();
      assert.equal(await panel().getByRole('button',{name:'收起处理过程',exact:true}).getAttribute('aria-expanded'),'true','执行中的过程默认展开');
      const supplement=panel().locator('.ac-turn-content .ac-message.is-user').filter({hasText:'执行中补充图文'});
      await supplement.waitFor();assert.equal(await panel().locator('.ac-turn').count(),1,'历史同轮补充仍在原轮展示');
      assert.equal(fixture.supplementaryCalls,previousSupplementCalls);
      fixture.conversation=previous;fixture.attachmentUploads=previousUploads;await page.reload();await input().fill('下一轮仍是草稿');
  },
  'history/flow-controls': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

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
      await identity.getByRole('button',{name:'展开处理过程',exact:true}).click();const group=process.locator('.ac-step-group').first();await group.locator(':scope>summary').click();assert.equal(await group.locator('.ac-step-group-items').evaluate((node:HTMLElement)=>getComputedStyle(node).borderLeftWidth),'0px');assert.equal(await group.locator(':scope>.ac-process-collapse').count(),0,'工具组不重复提供底部收起按钮');await group.locator(':scope>summary').click();assert.equal(await group.getAttribute('open'),null);
      await page.setViewportSize({width:390,height:844});await stream.evaluate((node:HTMLElement)=>node.scrollTop=400);await settle();assert.ok(await identity.getByRole('button',{name:'收起处理过程',exact:true}).isVisible());assert.ok(await panel().evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth));await capture(page,'conversation-flow-controls-narrow.png');
      await page.setViewportSize(viewport);await capture(page,'conversation-flow-controls-desktop.png');fixture.conversation=previous;await page.reload();await input().waitFor();
  },
  'history/running-header': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const previous=structuredClone(fixture.conversation),viewport=page.viewportSize();
      const entry=(id:string,sequence:number,role:string,text:string,runId:string)=>({id,sequence,kind:'message',role,text,provider:'codex',participantId:'participant-codex',runId,status:'completed',createdAt:new Date().toISOString()});
      const entries=[entry('past-user',1,'user','此前已经完成的要求。','past-run'),entry('past-answer',2,'assistant',Array.from({length:25},(_,i)=>'已完成的历史答复 '+i).join('\n\n'),'past-run'),entry('current-user',3,'user','只在这次执行期间固定当前要求。','run-fixture'),entry('current-narration',4,'assistant',Array.from({length:35},(_,i)=>'当前执行过程 '+i).join('\n\n'),'run-fixture')];
      const startedAt=new Date(Date.now()-125000).toISOString();
      update({participants:[{id:'participant-codex',connectionId:'codex',provider:'codex',label:'Codex',model:'fixture-model',contextId:'native',deliveredThrough:0}],entries,nextEntryCursor:undefined,run:run('running','codex',{model:'fixture-model',startedAt}),requests:[]});await page.reload();await input().waitFor();
      const stream=panel().locator('.ac-stream'),current=panel().locator('.ac-turn.is-executing'),past=panel().locator('[data-turn-id="past-user"]');
      await current.waitFor();assert.equal(await current.count(),1);assert.equal(await past.locator('.ac-turn-context').evaluate((node:HTMLElement)=>getComputedStyle(node).position),'static');
      await stream.evaluate((node:HTMLElement)=>{const turn=node.querySelector<HTMLElement>('.ac-turn.is-executing')!;node.scrollTop+=turn.getBoundingClientRect().top-node.getBoundingClientRect().top+220;});
      const style=await current.locator('.ac-turn-head').evaluate((node:HTMLElement)=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return{top:r.top,stream:node.closest('.ac-stream')!.getBoundingClientRect().top,position:s.position,side:s.borderLeftWidth,radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor,contextInside:Boolean(node.querySelector(':scope>.ac-turn-context')),identityInside:Boolean(node.querySelector(':scope>.ac-turn-identity'))};});
      assert.ok(Math.abs(style.top-style.stream)<2,JSON.stringify(style));assert.equal(style.position,'sticky');assert.equal(style.side,'0px');assert.equal(style.radius,'0px');const separator=await current.locator('.ac-turn-identity').evaluate((node:HTMLElement)=>{const s=getComputedStyle(node,'::after');return{background:s.backgroundImage,height:s.height};});assert.notEqual(separator.background,'none');assert.ok(parseFloat(separator.height)>0);assert.notEqual(style.background,'rgba(0, 0, 0, 0)');assert.ok(style.contextInside&&style.identityInside,'气泡与标识行一同进入吸顶头');
      assert.equal(await current.locator('.ac-turn-identity').evaluate((node:HTMLElement)=>getComputedStyle(node).borderBottomWidth),'1px');
      const name=await current.locator('.ac-turn-identity-link').evaluate((node:HTMLElement)=>({font:getComputedStyle(node).fontSize,underline:getComputedStyle(node).textDecorationLine}));assert.equal(name.font,'12px');assert.equal(name.underline,'none');assert.equal(await panel().locator('.ac-execution-indicator.is-active').count(),1);
      assert.equal(await current.locator('.markdown-body p').first().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'15px');
      assert.equal(await input().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'15px');
      await page.setViewportSize({width:390,height:844});assert.ok(await panel().evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth));await capture(page,'conversation-running-context-narrow.png');await page.setViewportSize(viewport);
      for(const status of ['completed','failed','stopped','waiting-approval','unknown']){
        update({run:run(status,'codex',{model:'fixture-model',startedAt})});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel().locator(status==='waiting-approval'?'[data-execution-state="'+status+'"]':'[data-run-status="'+status+'"]').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.ac-turn.is-executing').length===0);
        assert.equal(await panel().locator('.ac-execution-indicator.is-active').count(),0);
        const styles=await panel().locator('.ac-turn-context').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({position:getComputedStyle(node).position,border:getComputedStyle(node).borderTopWidth,shadow:getComputedStyle(node).boxShadow})));for(const s of styles){assert.equal(s.position,'static',status);assert.equal(s.border,'0px',status);assert.equal(s.shadow,'none',status);}
        const lineStyles=await panel().locator('.ac-turn-identity').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({position:getComputedStyle(node).position,shadow:getComputedStyle(node).boxShadow,separator:getComputedStyle(node,'::after').backgroundImage})));for(const s of lineStyles){assert.notEqual(s.position,'sticky',status);assert.equal(s.shadow,'none',status);assert.equal(s.separator,'none',status);}
        const headStyles=await panel().locator('.ac-turn-head').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({position:getComputedStyle(node).position,shadow:getComputedStyle(node).boxShadow})));for(const s of headStyles){assert.equal(s.position,'static',status);assert.equal(s.shadow,'none',status);}
      }
      await capture(page,'conversation-running-context-history.png');fixture.conversation=previous;await page.reload();await input().waitFor();
  },
  'history/reading-position': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),viewport=page.viewportSize();
  const stream=panel().locator('.ac-stream'),latest=panel().getByRole('button',{name:'向下到底',exact:true});
  const settle=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
  const assertPinned=async()=>{
    await settle();
    const gap=await stream.evaluate((node:HTMLElement)=>node.scrollHeight-node.scrollTop-node.clientHeight);
    assert.ok(gap<2,'应准确贴底：'+gap);assert.equal(await latest.count(),0,'跟随最新时不显示向下到底按钮');
  };
  try{
    update({entries:[{id:'pin-user',sequence:1,kind:'message',role:'user',text:'检查贴底',createdAt:new Date().toISOString()},
      {id:'pin-answer',sequence:2,kind:'message',role:'assistant',text:Array.from({length:48},(_,i)=>'刷新后应能完整看到最新内容 '+i).join('\n\n'),status:'completed',createdAt:new Date().toISOString()}],nextEntryCursor:undefined,run:run('completed')});
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});await page.reload();await panel().locator('[data-entry-id="pin-answer"]').waitFor();await assertPinned();
      // A late markdown/image layout pass after the initial scroll.
      await panel().locator('[data-entry-id="pin-answer"]').evaluate((node:HTMLElement)=>{node.style.paddingBottom='47px';});await assertPinned();
      const before=await stream.evaluate((node:HTMLElement)=>node.clientHeight);
      await input().fill(Array.from({length:7},(_,i)=>'输入框增高 '+i).join('\n'));await assertPinned();
      assert.ok(await stream.evaluate((node:HTMLElement)=>node.clientHeight)<before,'输入框实际占用了信息流可视高度');
      await input().fill('');await assertPinned();
      await stream.hover();await page.mouse.wheel(0,-240);await latest.waitFor();await settle();
      const reading=await stream.evaluate((node:HTMLElement)=>node.scrollTop);
      await input().fill('阅读历史时\n继续编辑\n不拉回底部');await settle();
      assert.ok(Math.abs(await stream.evaluate((node:HTMLElement)=>node.scrollTop)-reading)<2,'编辑输入框不抢走历史阅读位置');
      await input().fill('');await latest.click();await assertPinned();
    }
  }finally{fixture.conversation=saved;await input().fill('');await page.setViewportSize(viewport);await page.reload();await input().waitFor();}
  },
  'history/fill-viewport': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const saved=structuredClone(fixture.conversation),reads=fixture.entryReads;
  const entry=(sequence:number,runId:string,kind:string,role:string,text:string)=>({id:'fill-'+sequence,sequence,runId,kind,role,text,status:'completed',createdAt:new Date().toISOString()});
  try{
    update({entries:[entry(201,'fill-latest','tool','system','最后的工具'),entry(202,'fill-latest','message','assistant','最终答复')],nextEntryCursor:201,run:run('completed','codex',{id:'fill-latest'})});
    historyPages.set(201,{...fixture.conversation,entries:[entry(180,'fill-latest','tool','system','仍属于折叠过程')],nextEntryCursor:180});
    historyPages.set(180,{...fixture.conversation,entries:[entry(160,'fill-previous','message','user','之前的要求'),entry(161,'fill-previous','message','assistant',Array.from({length:36},(_,i)=>'上一轮可阅读的答复内容 '+i).join('\n\n')),entry(170,'fill-latest','message','user','最新要求')],nextEntryCursor:160});
    historyPages.set(160,{...fixture.conversation,entries:[entry(140,'fill-earlier','message','user','不应自动读到这里')],nextEntryCursor:140});
    for(let opened=1;opened<=2;opened++){
      await page.reload();
      try{await panel().locator('[data-entry-id="fill-161"]').waitFor();}
      catch(failure){
        const state=await page.evaluate(()=>{const stream=document.querySelector<HTMLElement>('.ac-stream');return{entries:[...document.querySelectorAll<HTMLElement>('[data-entry-id]')].map(node=>node.getAttribute('data-entry-id')),stream:stream?{scrollTop:stream.scrollTop,scrollHeight:stream.scrollHeight,clientHeight:stream.clientHeight,text:stream.textContent?.slice(0,2000)}:null};}).catch(()=>({closed:true}));
        throw new Error('首屏补页未到达 fill-161：opened='+opened+' reads='+(fixture.entryReads-reads)+' state='+JSON.stringify(state),{cause:failure});
      }
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
      const view=await panel().locator('.ac-stream').evaluate((node:HTMLElement)=>({height:node.scrollHeight,viewport:node.clientHeight,gap:node.scrollHeight-node.scrollTop-node.clientHeight}));
      assert.ok(view.height>view.viewport,JSON.stringify(view));assert.ok(view.gap<2,JSON.stringify(view));
      assert.equal(fixture.entryReads,reads+opened*2,'只补两批，不读取已经足够一屏之外的历史');
      assert.equal(await panel().locator('[data-run-id="fill-latest"] .ac-turn-identity-toggle').getAttribute('aria-expanded'),'false');
    }
    await capture(page,'conversation-viewport-filled.png');
  }finally{fixture.conversation=saved;historyPages.clear();await page.reload();await input().waitFor();}
  },
  'history/earlier-pagination': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

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
        assert.equal(await stream.locator('.ac-welcome').count(),0,'普通长消息不再使用欢迎布局');
        const beforeScroll=await stream.evaluate((node:HTMLElement)=>({top:node.scrollTop,height:node.clientHeight,total:node.scrollHeight,listTop:node.querySelector('.ac-message-list')!.getBoundingClientRect().top}));
        assert.ok(beforeScroll.height>0&&beforeScroll.total>beforeScroll.height+1200,'长答复应保留受约束且可滚动的消息视口：'+JSON.stringify(beforeScroll));
        await moveTo(1200);assert.equal(fixture.entryReads,readsBefore,'距离顶部大于800像素不预取');
        const afterScroll=await stream.evaluate((node:HTMLElement)=>({top:node.scrollTop,listTop:node.querySelector('.ac-message-list')!.getBoundingClientRect().top}));
        assert.ok(Math.abs(afterScroll.top-1200)<=1,'消息视口可实际滚动到指定阅读位置：'+JSON.stringify(afterScroll));
        assert.ok(Math.abs((afterScroll.listTop-beforeScroll.listTop)+(afterScroll.top-beforeScroll.top))<=2,'长消息随外层视口滚动，不被欢迎布局固定或截断');
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
        await fixture.openHistoryList();await panel().locator('.ac-history-list button[data-conversation-id="history-other"]').click();await page.locator('#agent-conversation-panel[data-conversation-id="history-other"]').waitFor();
        fixture.releaseEntryRead!();await settled;await settle();
        assert.equal(await panel().locator('[data-entry-id="history-101"]').count(),0,'迟到页不进入另一段对话');
      }finally{
        fixture.releaseEntryRead?.();fixture.holdEntryRead=false;fixture.failEntryRead=false;fixture.conversation=previous;historyPages.clear();fixture.additionalConversations=fixture.additionalConversations.filter(item=>item.id!=='history-other');await page.setViewportSize(oldViewport);
        await fixture.openHistoryList();await panel().locator('.ac-history-list button[data-conversation-id="'+previous.id+'"]').click();await input().waitFor();
        await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();
      }
  },
  'history/pagination-budget': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const previous=structuredClone(fixture.conversation),stream=panel().locator('.ac-stream');
      const entry=(sequence:number,role:string)=>({id:'short-'+sequence,sequence,kind:'message',role,text:role==='user'?'更早的用户要求':'短答复',runId:'short-run-'+sequence,createdAt:new Date().toISOString()});
      try{
        for(const gesture of ['wheel','touch','keyboard']){
          const readsBefore=fixture.entryReads;update({entries:[entry(201,'assistant')],nextEntryCursor:201});
          for(const [before,after] of [[201,180],[180,160],[160,140],[140,120]])historyPages.set(before,{...fixture.conversation,entries:[{...entry(after,'system'),kind:'tool',runId:'short-run-201'}],nextEntryCursor:after});
          historyPages.set(120,{...fixture.conversation,entries:[entry(100,'user')],nextEntryCursor:100});historyPages.set(100,{...fixture.conversation,entries:[entry(80,'user')],nextEntryCursor:undefined});
          const filled=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/entries')&&url.searchParams.get('before')==='140';});
          await page.reload();await filled;await panel().locator('[data-entry-id="short-201"]').waitFor();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
          assert.ok(await stream.evaluate((node:HTMLElement)=>node.scrollHeight<=node.clientHeight+1));assert.equal(fixture.entryReads,readsBefore+4,'首屏填充预算有界');
          const shortLayout=await stream.evaluate((node:HTMLElement)=>{const list=node.querySelector<HTMLElement>('.ac-message-list')!;return {top:list.getBoundingClientRect().top-node.getBoundingClientRect().top,height:list.getBoundingClientRect().height,viewport:node.clientHeight};});
          assert.ok(shortLayout.height<shortLayout.viewport,'该用例确实不足一屏');assert.ok(Math.abs(shortLayout.top)<2,'不足一屏且仍有历史时从顶部显示：'+JSON.stringify(shortLayout));
          if(gesture==='wheel'){const box=await stream.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+80);await page.mouse.wheel(0,-120);}
          else if(gesture==='keyboard'){await stream.focus();await stream.press('PageUp');}
          else await stream.evaluate((node:HTMLElement)=>{for(const [type,y] of [['touchstart',100],['touchmove',140],['touchend',undefined]] as const){const point=y===undefined?undefined:new Touch({identifier:1,target:node,clientX:40,clientY:y});node.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:point?[point]:[],changedTouches:point?[point]:[]}));}});
          await panel().locator('[data-entry-id="short-100"]').waitFor();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
          assert.equal(await stream.evaluate((node:HTMLElement)=>node.scrollTop),0,'不足一屏补页保留顶部');assert.equal(fixture.entryReads,readsBefore+5,gesture+'只加载所需一批');assert.equal(await panel().locator('[data-entry-id="short-80"]').count(),0,'不自动继续耗尽历史');
        }
      }finally{historyPages.clear();fixture.conversation=previous;await page.reload();await panel().locator('[data-run-status="stopped"]').waitFor();}
  },
  'history/screenshot-links': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

  const previous=structuredClone(fixture.conversation),otherId='file-warning-other';
  const base=fs.realpathSync(path.dirname(workspaceRoot)),imagePath=path.join(base,'验收 截图.png'),missingPath=path.join(base,'恢复图片.png');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  let delay=false,release:(()=>void)|undefined,started:(()=>void)|undefined;
  const held=new Promise<void>(resolve=>{started=resolve;}),matcher='**/api/v1/workspaces/*/code/repositories*';
  const intercept=async(route:any)=>{if(!delay)return route.fallback();delay=false;started?.();await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({status:503,json:{error:{code:'fixture_unavailable',message:'旧对话迟到的文件读取失败'}}});};
  const switchTo=async(id:string)=>{await fixture.openHistoryList();await panel().locator('button[data-conversation-id="'+id+'"]').click();await page.locator('#agent-conversation-panel[data-conversation-id="'+id+'"]').waitFor();};
  const preview=()=>page.getByRole('dialog',{name:'图片预览',exact:true});
  const closePreview=async()=>{await preview().getByRole('button',{name:'关闭预览',exact:true}).click();await preview().waitFor({state:'hidden'});};
  const assertImage=async()=>{await preview().waitFor();await page.waitForFunction(()=>{const image=document.querySelector<HTMLImageElement>('.ac-linked-image-preview img');return Boolean(image?.complete&&image.naturalWidth>0);});};
  fs.writeFileSync(imagePath,png,{flag:'wx'});await page.route(matcher,intercept);
  try{
    fixture.additionalConversations.push({...previous,id:otherId,title:'另一段对话',entries:[{id:'other-entry',sequence:1,kind:'message',role:'user',text:'其他对话正文',createdAt:new Date().toISOString()}],run:undefined,participants:[]});
    update({cwd:base,entries:[{id:'screenshot-reference',sequence:1,kind:'message',role:'assistant',runId:'run-fixture',text:`![验收截图](${encodeURI(imagePath)}) [查看验收截图](${encodeURI(imagePath)}) [相对截图](验收%20截图.png) [暂不可用截图](${encodeURI(missingPath)}) [无法定位的文件](/outside/not-authorized.md) [延迟文件](/outside/delayed.md)`,createdAt:new Date().toISOString()}],run:run('completed','codex')});
    await page.reload();await panel().getByRole('link',{name:'查看验收截图',exact:true}).waitFor();
    // 内联图片同样可放大：实际像素、新窗口入口与切换对话关闭。
    const inlineImage=panel().getByRole('button',{name:'查看大图：验收截图',exact:true});
    await inlineImage.waitFor();await inlineImage.scrollIntoViewIfNeeded();
    const inlineLoaded=page.waitForResponse((response:any)=>new URL(response.url()).pathname==='/api/v1/conversation-image');
    await inlineImage.click();assert.equal((await inlineLoaded).status(),200);await assertImage();
    assert.equal(await preview().locator('.ac-linked-image-preview').getAttribute('data-actual-size'),null);
    await preview().getByRole('button',{name:'实际大小',exact:true}).click();
    assert.equal(await preview().locator('.ac-linked-image-preview').getAttribute('data-actual-size'),'true','实际像素模式可滚动查看原图');
    assert.equal(await preview().getByRole('button',{name:'适应窗口',exact:true}).count(),1);
    assert.match((await preview().getByRole('link',{name:'新窗口打开',exact:true}).getAttribute('href'))||'',/^\/api\/v1\/conversation-image\?path=/);
    await closePreview();
    const loaded=page.waitForResponse((response:any)=>new URL(response.url()).pathname==='/api/v1/conversation-image');
    await panel().getByRole('link',{name:'查看验收截图',exact:true}).click();assert.equal((await loaded).status(),200);await assertImage();assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'临时图片不进入源码定位');await preview().evaluate(async(node:HTMLElement)=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});await capture(page,'conversation-local-screenshot-preview.png');await closePreview();
    await panel().getByRole('link',{name:'相对截图',exact:true}).click();await assertImage();await closePreview();
    fixture.expectedBrowserErrors.add('conversation-image');await panel().getByRole('link',{name:'暂不可用截图',exact:true}).click();await preview().getByText('图片暂时无法读取，可能已被移动、删除或超过大小限制。',{exact:true}).waitFor();
    fs.writeFileSync(missingPath,png,{flag:'wx'});await preview().getByRole('button',{name:'重新加载',exact:true}).click();await assertImage();await closePreview();
    await panel().getByRole('link',{name:'无法定位的文件',exact:true}).click();await panel().getByRole('button',{name:'复制来源路径',exact:true}).waitFor();
    await switchTo(otherId);assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'其他对话没有旧提醒');await switchTo(previous.id);assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'返回原对话也不恢复过期提醒');
    await panel().getByRole('link',{name:'无法定位的文件',exact:true}).click();await panel().getByRole('button',{name:'复制来源路径',exact:true}).waitFor();await fixture.startNewConversation();await input().waitFor();assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'新草稿也没有旧提醒');
    await switchTo(previous.id);fixture.expectedBrowserErrors.add('503');delay=true;await panel().getByRole('link',{name:'延迟文件',exact:true}).click();await held;await switchTo(otherId);const late=page.waitForResponse((response:any)=>new URL(response.url()).pathname.endsWith('/code/repositories')&&response.status()===503);release?.();await late;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));assert.equal(await panel().getByRole('button',{name:'复制来源路径',exact:true}).count(),0,'旧请求迟到失败不能给新对话添加提醒');
  }finally{
    release?.();await page.unroute(matcher,intercept);fixture.additionalConversations=fixture.additionalConversations.filter(item=>item.id!==otherId);fixture.conversation=previous;
    for(const file of [imagePath,missingPath])if(fs.existsSync(file))fs.unlinkSync(file);
    await page.reload();await input().waitFor();await switchTo(previous.id);await input().waitFor();
  }
  },
  'history/file-citations': async (fixture: AgentConversationFixture) => {
  const {expectedBrowserErrors,capture,chooseAgent,chooseModel,closeModelSettings,historyPages,input,page,panel,run,step,update,workspaceId,workspaceRoot,workspaceUrl}=fixture;

      const response=await page.request.get(workspaceUrl.replace('/workspaces/','/api/v1/workspaces/')+'/code/repositories');assert.equal(response.status(),200);
      const catalog=await response.json(),member=catalog.worktrees.find((item:any)=>item.available);assert.ok(member,'fixture has an observed source');
      const fixtureBase=fs.realpathSync(path.dirname(workspaceRoot)),sourceRoot=fs.realpathSync(member.path);
      assert.ok(sourceRoot===fixtureBase||sourceRoot.startsWith(fixtureBase+path.sep),'only write inside this isolated test fixture');
      const previous=structuredClone(fixture.conversation);
      const filePath='conversation-citation.md',createdFile=path.join(sourceRoot,filePath);fs.writeFileSync(createdFile,'# Conversation citation\n\nVerified local source.\n',{flag:'wx'});
      try {
      update({workspaceId,cwd:member.path,entries:[{id:'file-citation',sequence:1,kind:'message',role:'assistant',runId:'run-fixture',text:`Sources: [Readable source](${filePath}:1), [Unavailable source](/outside/not-authorized.md:1), [Parent source](../outside.md:1), [Task note](@task/task-one)`,createdAt:new Date().toISOString()}],run:run('completed','codex')});
      await page.reload();await input().waitFor();const source=panel().getByRole('link',{name:'Readable source',exact:true});await source.waitFor();assert.equal(await source.getAttribute('data-markdown-href'),filePath+':1');assert.equal(await source.innerText(),'Readable source');assert.equal(await panel().getByRole('link',{name:'Task note',exact:true}).getAttribute('href'),'/workspaces/'+workspaceId+'/tasks/task-one');await panel().getByRole('link',{name:'Parent source',exact:true}).waitFor();
      await capture(page,'agent-file-citation-labels.png');
      await panel().getByRole('link',{name:'Unavailable source',exact:true}).click();await panel().getByRole('button',{name:'复制来源路径',exact:true}).waitFor();
      const reading=page.waitForResponse((response:any)=>{const url=new URL(response.url());return url.pathname.endsWith('/code/editor-file')&&url.searchParams.get('filePath')===filePath;});
      await source.click();const fileResponse=await reading;assert.equal(fileResponse.status(),200);const snapshot=await fileResponse.json();assert.equal(new URL(fileResponse.url()).searchParams.get('checkoutId'),member.id);await page.waitForURL('**/code/explorer');const reader=page.locator('.code-explorer-stage .file-editing-pane');await reader.waitFor();await reader.getByText('Verified local source.',{exact:true}).waitFor();assert.ok(snapshot.content.includes('Verified local source.'));await page.locator('.code-explorer-stage').getByText(/已选择第 1 行/).waitFor();
      const state=await page.evaluate(()=>history.state?.usr?.codeEntry);if(state?.file)assert.equal(state.file.line,1);
      await capture(page,'agent-file-citation-open.png');
      } finally { fs.unlinkSync(createdFile);fixture.conversation=previous;await page.goto(workspaceUrl+'/overview');await input().waitFor(); }
  },
} satisfies Record<HistoryScenarioId, (fixture: AgentConversationFixture) => Promise<void>>;

export const HISTORY_SCENARIOS = HISTORY_SCENARIO_CATALOG.map(item => ({...item,run:historyRuns[item.id]}));

/** 兼容组调用；独立执行使用同一成员源。 */
export async function runHistoryScenarios(fixture: AgentConversationFixture) {
  for (const scenario of HISTORY_SCENARIOS) await fixture.step(scenario.name, () => scenario.run(fixture));
}
