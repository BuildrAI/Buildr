import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {groupConversationWorkspaces,orderActivityItems,activityBadge,activityReminder,activityState,pendingSendReason,isExecuting,isActiveConversation,conversationMetadata,reminderFallbackRows,completeActivitySnapshot} from '../src/features/agent-conversations/conversation-activity.ts';
import {conversationTierChoice} from '../src/features/agent-conversations/conversation-options.ts';

registerHooks({
  resolve(specifier,context,next){
    if(specifier.endsWith('/components/CopyButton'))return {url:'data:text/javascript,'+encodeURIComponent('export const CopyButton=()=>null;'),shortCircuit:true};
    if(context.parentURL?.includes('/features/agent-conversations/')&&specifier.startsWith('./')&&!/\.\w+$/.test(specifier)){
      for(const ext of ['.tsx','.ts']){
        const url=new URL(specifier+ext,context.parentURL);
        if(existsSync(url))return next(url.href,context);
      }
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};
    if(url.endsWith('.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
    return next(url,context);
  }
});
const {ConversationActivityEntry}=await import('../src/features/agent-conversations/ConversationActivityEntry.tsx');
const {ConversationActivityStatus}=await import('../src/features/agent-conversations/ConversationActivityStatus.tsx');
const {ConversationExecutionSummary}=await import('../src/features/agent-conversations/ConversationExecutionSummary.tsx');
const counts={active:8,running:3,waiting:2,unseen:2,unknown:1,attention:5};
const render=(props={})=>renderToStaticMarkup(React.createElement(ConversationActivityEntry,{items:[],workspaces:[],total:8,counts,onOpen(){},onHistory(){},...props}));

test('单角标优先待决策加待查看，不从一页条目推算，也不计未知执行',()=>{
  const html=render();
  assert.match(html,/4 个待处理对话/);assert.match(html,/待处理 4（待决策 2、待查看 2），执行中 3/);
  assert.equal((html.match(/data-count-kind=/g)||[]).length,1);assert.match(html,/data-count-kind="attention"/);
  assert.deepEqual(activityBadge(counts),{kind:'attention',count:4,label:'待处理'});
  assert.equal(activityState({run:{status:'running'},activity:{version:2,seenThrough:0}}),'running');
  assert.equal(activityState({run:{status:'waiting-question'},activity:{version:2,seenThrough:2}}),'waiting');
});
test('非阻塞问题在运行时仍为待决策，列表和提醒只展示待决策且保留执行统计',()=>{
  const row={run:{status:'running'},activity:{version:2,seenThrough:2,pendingDecisionCount:1}};
  assert.equal(activityState(row),'waiting');
  const status=renderToStaticMarkup(React.createElement(ConversationActivityStatus,{state:activityState(row),executing:true}));
  assert.match(status,/待决策/);assert.doesNotMatch(status,/执行中/);
  const running=renderToStaticMarkup(React.createElement(ConversationActivityStatus,{state:'running'}));
  assert.match(running,/执行中/);assert.doesNotMatch(running,/待决策/);
  const html=render({items:[{id:'question',workspaceId:'a',title:'等待决定',state:'waiting',executing:true,meta:'模型'}],workspaces:[{id:'a',name:'空间'}],counts:{active:1,running:1,waiting:1,unseen:0,unknown:0,attention:1}});
  assert.match(html,/1 个待处理对话/);assert.match(html,/待决策 1、待查看 0），执行中 1/);
  assert.equal(activityState({...row,activity:{...row.activity,pendingDecisionCount:0}}),'running');
  assert.equal(activityState({run:{status:'running'},requests:[{blocking:false}]}),'waiting','legacy full views retain their question');
});
test('未受理停止且无在途工作退出提醒组，未读、待决定仍保留',()=>{
 const settled={id:'settled',workspaceId:'w',run:{status:'unknown',accepted:false,stopRequested:true,executionState:'unknown',resourcesReleased:false,tools:[]},activity:{version:4,seenThrough:4,active:false,pendingDecisionCount:0}};
 assert.equal(activityState(settled),null);assert.equal(isActiveConversation(settled),false);
 assert.deepEqual(reminderFallbackRows([settled]),{pending:[],running:[]});
 const unread={...settled,activity:{...settled.activity,active:true,seenThrough:3}};
 assert.equal(activityState(unread),'unknown');assert.equal(isActiveConversation(unread),true);
 const decision={...settled,activity:{...settled.activity,active:true,pendingDecisionCount:1}};
 assert.equal(activityState(decision),'waiting');assert.deepEqual(reminderFallbackRows([decision]).pending,[decision]);
});
test('提醒组内按用户输入而非后台回复排序，待决策仍优先',()=>{
  const items=[
    {id:'older-input',workspaceId:'a',title:'刚收到回复',state:'running',meta:'模型',userInputAt:'2026-11-01',updatedAt:'2026-11-03'},
    {id:'newer-input',workspaceId:'a',title:'之前的对话',state:'running',meta:'模型',userInputAt:'2026-11-02',updatedAt:'2026-11-02'},
    {id:'pending',workspaceId:'a',title:'需要回答',state:'waiting',meta:'模型',updatedAt:'2026-11-01'}
  ];
  assert.deepEqual(orderActivityItems(items).map(item=>item.id),['pending','newer-input','older-input']);
  assert.equal(items[0].id,'older-input','sorting does not mutate shared rows');
});
test('没有待处理时显示执行中，静默与未知执行都不产生角标',()=>{
  const running={...counts,waiting:0,unseen:0};
  assert.match(render({counts:running}),/3 个执行中对话/);
  assert.match(render({counts:running}),/data-count-kind="running"/);
  assert.equal(activityBadge({...running,running:0}),null);
  assert.doesNotMatch(render({counts:{...running,running:0}}),/data-count-kind/);
  assert.match(activityReminder({...running,running:0}),/1 个执行状态需确认/);
});
test('大数与读取失败保留准确数量，首次未知不冒充零',()=>{
  const html=render({total:120,counts:{...counts,active:120,waiting:111,unseen:0},error:'读取失败'});
  assert.match(html,/111 个待处理对话/);assert.match(html,/99\+/);assert.match(html,/未更新/);
  assert.equal(activityReminder(undefined),'对话提醒尚未读取');
  assert.doesNotMatch(render({total:120,counts:undefined}),/data-count-kind/);
});
test('快速档位显式绑定原生来源，保留合法强度并不修改原选择',()=>{
  const source={modelId:'sol',accountId:'native-codex',accountIdentity:'i',accountRevision:'r',reasoningEfforts:[{id:'high'}],serviceTiers:[{id:'default'},{id:'priority'}]};
  const original={connectionId:'codex',model:'sol',reasoningEffort:'high'};
  const fast=conversationTierChoice(original,source,'priority');
  assert.equal(fast.modelAccountId,'native-codex');assert.equal(fast.serviceTier,'priority');assert.equal(fast.reasoningEffort,'high');
  assert.equal(conversationTierChoice(fast,source,'default').serviceTier,'default');
  assert.equal(original.modelAccountId,undefined);
});

test('浮窗显示真实账号与模型，旧响应不猜账号，失败保留观察',()=>{
  const stats={agents:[{label:'codex',count:3}],models:[{label:'m',count:3}],executions:[{provider:'codex',model:'m',count:3}],modelExecutions:[{accountId:'one',accountLabel:'账号甲',model:'m',count:2},{accountId:'two',accountLabel:'账号乙',model:'m',count:1}]};
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionSummary,{stats,stale:true,modelLabel:()=> '完整模型名',sourceLabel:id=>id==='one'?'Devin':'ChatGPT'}));
  assert.match(html,/执行中模型/);assert.match(html,/>Devin · 完整模型名<\/span>/);assert.match(html,/>ChatGPT · 完整模型名<\/span>/);assert.match(html,/未更新/);assert.doesNotMatch(html,/账号甲|账号乙|title=/);
  assert.doesNotMatch(html,/Codex|Qoder|按智能体|按模型|<button/);
  const legacy=renderToStaticMarkup(React.createElement(ConversationExecutionSummary,{stats:{agents:stats.agents,models:stats.models,executions:stats.executions},modelLabel:()=> '完整模型名',sourceLabel:id=>id==='one'?'Devin':'ChatGPT'}));
  assert.match(legacy,/账号与模型明细尚未读取/);assert.doesNotMatch(legacy,/Codex ·/);
});

test('工作空间只分一组，混合状态保留组内优先顺序',()=>{
  const items=[{workspaceId:'a',id:'unseen',state:'unseen'},{workspaceId:'b',id:'waiting',state:'waiting'},{workspaceId:'a',id:'running',state:'running'}];
  const groups=groupConversationWorkspaces(items);
  assert.deepEqual([...groups.keys()],['a','b']);
  assert.deepEqual(groups.get('a').map(item=>item.id),['unseen','running']);
  assert.deepEqual(groupConversationWorkspaces([]).size,0);
  assert.equal(items.length,3);
});
test('浮窗首帧只选提醒分组内的行，历史未知保留执行以待确认可见',()=>{
  const running={id:'running',title:'执行中',run:{status:'running'},activity:{version:4,seenThrough:4}};
  const decided={id:'decided',title:'待决策',run:{status:'running'},activity:{version:2,seenThrough:2,pendingDecisionCount:1}};
  const unseen={id:'unseen',title:'待查看',run:{status:'completed'},activity:{version:6,seenThrough:5}};
  const unknown={id:'unknown',title:'未知执行',run:{status:'unknown'},activity:{version:3,seenThrough:3}};
  const stale={id:'stale',title:'历史未知保留执行',run:{status:'completed'},retainedRuns:[{id:'old',status:'unknown'}],activity:{version:7,seenThrough:7,active:true}};
  assert.equal(activityState(stale),'unknown','仅因历史未知保留执行而活跃的行必须可见为状态待确认');
  const fallback=reminderFallbackRows([stale,unseen,decided,running,unknown]);
  assert.deepEqual(fallback.running.map(row=>row.id),['decided','running']);
  assert.deepEqual(fallback.pending.map(row=>row.id),['stale','unseen','decided','unknown']);
  assert.equal(fallback.running.some(row=>row.id==='stale'),false,'待确认行不冒充执行中');
});
test('入口悬停提示固定，未知执行只保留条目徽标与入口说明',()=>{
  assert.match(render({active:true}),/title="对话列表"/);
  assert.match(render({counts:undefined}),/title="对话列表"/);
  const html=render();
  assert.match(html,/1 个执行状态需确认/);
  assert.doesNotMatch(html,/个对话的执行状态需确认|暂时无法确认|查看对话|返回全部/);
  const status=renderToStaticMarkup(React.createElement(ConversationActivityStatus,{state:'unknown'}));
  assert.match(status,/状态待确认/);
});

test('完整快照覆盖提醒组，截断、重复和失败快照不能替代独立分页',()=>{
  const rows=[{id:'a',workspaceId:'one',run:{status:'running'},activity:{pendingDecisionCount:1}},{id:'b',workspaceId:'two',activity:{version:2,seenThrough:0}}];
  assert.equal(completeActivitySnapshot(rows,2,undefined,counts,''),true);
  const groups=reminderFallbackRows(rows);
  assert.deepEqual(groups.pending.map(row=>row.id),['a','b']);assert.deepEqual(groups.running.map(row=>row.id),['a']);
  assert.equal(completeActivitySnapshot(rows,101,'more',counts,''),false);
  assert.equal(completeActivitySnapshot(rows,3,undefined,counts,''),false);
  assert.equal(completeActivitySnapshot([rows[0],rows[0]],2,undefined,counts,''),false);
  assert.equal(completeActivitySnapshot(rows,2,undefined,counts,'failed'),false);
  assert.equal(completeActivitySnapshot([],0,undefined,undefined,''),false);
  assert.equal(completeActivitySnapshot([],0,undefined,{...counts,active:0},''),true);
});

test('模型结束仅后台作业时不显示执行中，历史仍可辨认后台工作且未读继续提醒',()=>{
 const row={id:'bg',workspaceId:'w',run:{status:'tools-active',provider:'dsh',model:'m'},activity:{active:false,version:2,seenThrough:2}};
 assert.equal(isExecuting(row),false);assert.equal(activityState(row),null);assert.match(conversationMetadata(row),/后台作业运行中/);
 assert.equal(activityState({...row,activity:{...row.activity,version:3}}),'unseen');assert.equal(isExecuting({...row,run:{...row.run,status:'running'}}),true);
 const html=renderToStaticMarkup(React.createElement(ConversationActivityStatus,{state:activityState(row),executing:isExecuting(row)}));assert.doesNotMatch(html,/执行中/);
});


test('waiting and failed submissions remain active without pretending to execute or need a decision',()=>{
 const pending={state:'waiting',reason:'Waiting for backend',updatedAt:'2026-11-03'};
 const row={id:'send',workspaceId:'w',activity:{active:true,version:1,seenThrough:1,pendingDecisionCount:0,pendingSend:pending}};
 assert.equal(activityState(row),'send-waiting');assert.equal(isExecuting(row),false);
 assert.deepEqual(reminderFallbackRows([row]).pending,[row]);assert.deepEqual(reminderFallbackRows([row]).running,[]);
 const failed={...row,activity:{...row.activity,pendingSend:{...pending,state:'failed'}}};assert.equal(activityState(failed),'send-failed');
 for(const [item,label] of [[row,'等待发送'],[failed,'发送失败']]){
  const html=renderToStaticMarkup(React.createElement(ConversationActivityStatus,{state:activityState(item),executing:false}));
  assert.match(html,new RegExp(label));assert.doesNotMatch(html,/执行中|待决策|正在发送/);
 }
 assert.equal(activityState({pendingSend:{...pending,state:'dispatching'}}),'send-waiting');
 assert.equal(pendingSendReason({...pending,state:'dispatching'}),'正在投递，尚未确认受理。');
 assert.equal(pendingSendReason({...pending,state:'failed'}),pending.reason);
 assert.equal(activityState({...row,pendingSend:{...pending,state:'failed'}}),'send-failed','current full view overrides an older display snapshot');
 assert.equal(activityState({...row,activity:{...row.activity,pendingSend:undefined}}),'unknown','残余活跃行保持可解释，不无声置顶');
 assert.equal(activityState({...row,run:{status:'running'},activity:{...row.activity,pendingSend:undefined}}),'running');
 assert.deepEqual(activityBadge({active:1,running:0,waiting:0,unseen:0,unknown:0,attention:0,pendingSend:1}),{kind:'active',count:1,label:'活动中'});
});

test('残余活跃行归为状态待确认，结算入口只放行无在途工作的保留未知轮',async()=>{
 assert.equal(activityState({run:{status:'completed'},activity:{version:2,seenThrough:2,active:true}}),'unknown');
 assert.equal(activityState({run:{status:'completed'},activity:{version:2,seenThrough:2,active:false}}),null);
 assert.equal(activityState({run:{status:'completed'},activity:{version:2,seenThrough:1,active:true}}),'unseen','未读仍优先于残余待确认');
 const {canSettleRetainedRun}=await import('../src/features/agent-conversations/conversation-state.ts');
 const run={id:'old',status:'unknown',executionState:'unknown',tools:[{id:'t',status:'unknown'}]};
 const conversation={run:{id:'current',status:'completed',tools:[]},retainedRuns:[run],requests:[]};
 assert.equal(canSettleRetainedRun(conversation,run),true);
 assert.equal(canSettleRetainedRun(conversation,{...run,tools:[{id:'t',status:'running'}]}),false,'running 工具不可结算');
 assert.equal(canSettleRetainedRun(conversation,{...run,executionState:'active'}),false,'active 执行不可结算');
 assert.equal(canSettleRetainedRun(conversation,{...run,attentionSettled:true}),false,'已结算不重复入口');
 assert.equal(canSettleRetainedRun(conversation,{...run,supersededBy:'new'}),false,'被替代轮不属保留入口');
 assert.equal(canSettleRetainedRun({...conversation,requests:[{id:'q',runId:'old'}]},run),false,'有效问题不可结算');
 assert.equal(canSettleRetainedRun(conversation,conversation.run),false,'当前轮不走保留结算');
 assert.equal(canSettleRetainedRun(null,run),false);
});
