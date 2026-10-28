import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({load(url,context,next){
  if(url.endsWith('/ConversationExecutionNotice.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const {ConversationExecutionNotice}=await import('../src/features/agent-conversations/ConversationExecutionNotice.tsx');
test('待确认只保留一个紧凑状态，诊断默认折叠且不宣称失败或恢复',()=>{
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{diagnostic:'原生用户输入尚不能准确映射',observing:false,stopping:false,onObserve(){},onStop(){}}));
  assert.equal((html.match(/执行状态待确认/g)??[]).length,1);
  assert.equal((html.match(/核对状态/g)??[]).length,1);
  assert.match(html,/<details><summary>查看原因<\/summary>/);
  assert.doesNotMatch(html,/<details open|ant-alert|执行失败|恢复执行/);
});
