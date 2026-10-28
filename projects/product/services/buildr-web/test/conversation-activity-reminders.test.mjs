import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {activityReminder,activityState} from '../src/features/agent-conversations/conversation-activity.ts';
import {conversationTierChoice} from '../src/features/agent-conversations/conversation-options.ts';

registerHooks({
  resolve(specifier,context,next){
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
const counts={active:8,running:3,waiting:2,unseen:2,unknown:1,attention:5};
const render=(props={})=>renderToStaticMarkup(React.createElement(ConversationActivityEntry,{items:[],workspaces:[],total:8,counts,onOpen(){},onHistory(){},...props}));

test('入口分别显示活动与需关注，说明中准确区分分类，不从已加载条目推算',()=>{
  const html=render();
  assert.match(html,/8 个活动对话/);assert.match(html,/5 个需关注对话/);
  assert.match(html,/待处理 2、待查看 2、状态待确认 1、执行中 3/);
  assert.match(html,/data-count-kind="active"/);assert.match(html,/data-count-kind="attention"/);
  assert.equal(activityState({run:{status:'running'},activity:{version:2,seenThrough:0}}),'running');
  assert.equal(activityState({run:{status:'waiting-question'},activity:{version:2,seenThrough:2}}),'waiting');
});
test('零值、大数、首次未知与刷新失败不冒充已更新或零',()=>{
  assert.doesNotMatch(render({counts:{...counts,attention:0}}),/data-count-kind="attention"/);
  const html=render({total:120,counts:{...counts,active:120,attention:111},error:'读取失败'});
  assert.match(html,/120 个活动对话/);assert.match(html,/111 个需关注对话/);
  assert.match(html,/99\+/);assert.match(html,/未更新/);
  assert.equal(activityReminder(undefined),'活动分类尚未读取');
  assert.doesNotMatch(render({total:0,counts:undefined}),/0 个活动对话|data-count-kind/);
});
test('浮窗与列表共享分类，提供准确数量、键盘按钮及选中反馈',()=>{
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
