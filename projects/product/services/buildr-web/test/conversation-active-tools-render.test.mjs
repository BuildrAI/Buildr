import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

registerHooks({resolve(specifier,context,next){
  if(specifier==='./conversation-state'&&/\/Conversation(?:ActiveToolsNotice|RetainedWork)\.tsx$/.test(context.parentURL??''))return next(new URL('./conversation-state.ts',context.parentURL).href,context);
  if(specifier==='./ConversationActiveToolsNotice'&&context.parentURL?.endsWith('/ConversationRetainedWork.tsx'))return next(new URL('./ConversationActiveToolsNotice.tsx',context.parentURL).href,context);
  return next(specifier,context);
},load(url,context,next){
  if(/\/Conversation(?:ActiveToolsNotice|RetainedWork)\.tsx$/.test(url))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const {ConversationActiveToolsNotice}=await import('../src/features/agent-conversations/ConversationActiveToolsNotice.tsx');
const render=props=>renderToStaticMarkup(React.createElement(ConversationActiveToolsNotice,{observing:false,stopping:false,onObserve(){},onStop(){},...props}));

test('正常答完后保留命令明确允许继续，不误报模型中断',()=>{
  const html=render({canContinue:true,tools:[{id:'browser',status:'running',label:'browser helper',canStop:true}]});
  assert.match(html,/仍有 1 项命令运行，可继续对话/);
  assert.doesNotMatch(html,/中断|等待上一轮|恢复执行/);
});

test('命令默认只显示紧凑摘要，排除完成项，长原文不铺入页面',()=>{
  const html=render({tools:[{id:'done',status:'completed',label:'completed private command'},{id:'running',status:'running',label:'long raw command '.repeat(500),canStop:true},{id:'unknown',status:'unknown',label:'unknown command'}]});
  assert.match(html,/仍有 2 项命令未结束/);
  assert.match(html,/aria-expanded="false"/);assert.match(html,/查看命令/);
  assert.equal((html.match(/核对状态/g)??[]).length,1);
  assert.equal((html.match(/停止剩余执行/g)??[]).length,2,'可访问名称与按钮文案对应同一个动作');
  assert.doesNotMatch(html,/long raw command|completed private command|unknown command|<pre|ant-alert|模型已中断|已确认停止/);
});

test('缺少可核对命令时保持未知，不把空列表当成已停止；诊断默认折叠',()=>{
  const html=render({tools:[],diagnostic:'原始退出结果尚未确认'});
  assert.match(html,/命令结束状态待确认/);assert.doesNotMatch(html,/查看命令|0 项|已停止/);
  assert.match(html,/<details class="ac-active-tools-diagnostic"><summary>查看原因<\/summary>/);
  assert.doesNotMatch(html,/<details[^>]* open/);
});

test('停止与核对期间保留准确操作，不提供重复恢复执行',()=>{
  const html=render({tools:[{id:'x',status:'unknown',label:'raw'}],stopping:true});
  assert.match(html,/正在停止/);assert.match(html,/disabled/);
  assert.doesNotMatch(html,/恢复执行|恢复成功|已停止/);
});

const {ConversationRetainedWork}=await import('../src/features/agent-conversations/ConversationRetainedWork.tsx');
test('原执行和未答问题保持原归属且不阻止继续对话',()=>{
  const conversation={participants:[{id:'p',label:'原执行方'}],requests:[{id:'q',runId:'old-question',participantId:'p',title:'确认发布吗？'}],retainedRuns:[
    {id:'old-tool',participantId:'p',status:'tools-active',tools:[{id:'tool',status:'unknown',label:'private command'}]},
    {id:'old-question',participantId:'p',status:'waiting-question',tools:[]},
    {id:'settled',participantId:'p',status:'completed',tools:[]},
  ]};
  const html=renderToStaticMarkup(React.createElement(ConversationRetainedWork,{conversation,busy(){return false;},onObserve(){},onStop(){}}));
  assert.match(html,/保留了 2 项原执行，不影响继续对话/);assert.match(html,/命令待核对，可继续对话/);
  assert.match(html,/未回答：确认发布吗/);assert.match(html,/新的要求不算回答/);assert.match(html,/data-retained-run="old-tool"/);
  assert.doesNotMatch(html,/data-retained-run="settled"|模型已中断|private command/);
});
