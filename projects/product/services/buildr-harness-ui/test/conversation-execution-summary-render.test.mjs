import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({load(url,context,next){
  if(url.endsWith('/ConversationExecutionSummary.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const {ConversationExecutionSummary}=await import('../src/features/agent-conversations/ConversationExecutionSummary.tsx');
const {conversationModelSourceLabel,conversationModelLabel}=await import('../src/features/agent-conversations/conversation-model-label.ts');
const render=(stats={agents:[{label:'codex',count:2}],models:[{label:'gpt-6.1-sol',count:2}],executions:[],modelExecutions:[{accountId:'native-codex',accountLabel:'ChatGPT',model:'gpt-6.1-sol',count:1},{accountId:'unknown:conversation',accountLabel:'供应商未记录',model:'gpt-6.1-sol',count:1}]})=>renderToStaticMarkup(React.createElement(ConversationExecutionSummary,{
  stats,
  sourceLabel:id=>conversationModelSourceLabel(id,[{accountId:'native-codex',provider:'native-codex'}]),
  modelLabel:(id,accountId)=>conversationModelLabel(id,[], [{accountId:'native-codex',modelId:'gpt-6.1-sol',label:'GPT-6.1-Sol'}],{modelAccountId:accountId}),
  filter:null,
  onFilter(){},
}));

test('执行中模型按供应商与模型组合展示，缺失供应商明示供应商未记录',()=>{
  const html=render();
  assert.match(html,/ChatGPT · GPT-6\.1-Sol/);
  assert.match(html,/供应商未记录 · GPT-6\.1-Sol/);
  assert.doesNotMatch(html,/来源未记录/);
  assert.equal((html.match(/class="ac-execution-chip"/g)??[]).length,2);
});
test('没有模型明细时不伪造供应商来源，总数仍来自执行统计',()=>{
  assert.match(render({agents:[{label:'codex',count:1}],models:[]}),/供应商与模型明细尚未读取/);
});
