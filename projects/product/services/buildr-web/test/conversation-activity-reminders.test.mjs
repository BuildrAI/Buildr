import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {activityBadge,activityReminder,activityState} from '../src/features/agent-conversations/conversation-activity.ts';
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
const {ConversationActivityFilters}=await import('../src/features/agent-conversations/ConversationActivityFilters.tsx');
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
test('完整列表保留分类数量、键盘按钮及选中反馈',()=>{
  const html=renderToStaticMarkup(React.createElement(ConversationActivityFilters,{counts,value:'waiting',onChange(){}}));
  assert.match(html,/aria-label="活动分类"/);assert.match(html,/待处理/);assert.match(html,/aria-pressed="true"/);
  assert.match(html,/需关注/);assert.match(html,/状态待确认/);
  const unknown=renderToStaticMarkup(React.createElement(ConversationActivityFilters,{value:null,onChange(){}}));
  assert.match(unknown,/分类暂不可用/);assert.doesNotMatch(unknown,/<small>0<\/small>/);
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
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionSummary,{stats,stale:true,modelLabel:()=> '完整模型名'}));
  assert.match(html,/执行中模型/);assert.match(html,/账号甲 · 完整模型名/);assert.match(html,/账号乙 · 完整模型名/);assert.match(html,/未更新/);
  assert.doesNotMatch(html,/Codex|Qoder|按智能体|按模型|<button/);
  const legacy=renderToStaticMarkup(React.createElement(ConversationExecutionSummary,{stats:{agents:stats.agents,models:stats.models,executions:stats.executions},modelLabel:()=> '完整模型名'}));
  assert.match(legacy,/账号与模型明细尚未读取/);assert.doesNotMatch(legacy,/Codex ·/);
});
