import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({load(url,context,next){
  if(url.endsWith('/ConversationExecutionStats.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const {ConversationExecutionStats}=await import('../src/features/agent-conversations/ConversationExecutionStats.tsx');
const stats={agents:[{label:'codex',count:6}],models:[{label:'actual-model',count:6}]};
const render=(props={})=>renderToStaticMarkup(React.createElement(ConversationExecutionStats,{stats,filter:null,onFilter(){},...props}));
test('正式共享统计只计一组总数，无默认解释小字，紧凑模式与选中状态明确',()=>{
  const html=render({compact:true,filter:{kind:'model',value:'actual-model'}});
  assert.match(html,/is-compact/);assert.match(html,/正在执行 <b>6<\/b>/);assert.doesNotMatch(html,/<p>|<b>12<\/b>/);
  assert.match(html,/aria-pressed="true"/);assert.match(html,/Codex/);
});
test('真正零压一行；未知或读取失败绝不伪装零或显示旧数',()=>{
  assert.match(render({stats:{agents:[],models:[]}}),/当前没有正在执行的对话/);
  for(const props of [{stats:undefined},{status:'unknown'},{status:'error'}]){
    const html=render(props);assert.doesNotMatch(html,/当前没有正在执行|<b>6<\/b>/);assert.match(html,/尚未确认|暂时无法读取/);
  }
});
