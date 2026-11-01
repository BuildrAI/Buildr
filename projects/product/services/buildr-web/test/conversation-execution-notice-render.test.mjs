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
test('待确认只占一行，详细原因使用悬停提示，不宣称失败或恢复',()=>{
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{diagnostic:'原生用户输入尚不能准确映射',observing:false,stopping:false,onObserve(){},onStop(){}}));
  assert.equal((html.match(/暂时无法读取执行状态/g)??[]).length,1);
  assert.equal((html.match(/>重新读取</g)??[]).length,1);
  assert.match(html,/title="[^"]*原生用户输入尚不能准确映射/);
  assert.doesNotMatch(html,/<details|<small|ant-alert|执行失败|恢复执行/);
});

test('核对期间只说明正在读取执行记录，不把查询说成恢复连接',()=>{
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{observing:true,stopping:false,onObserve(){},onStop(){}}));
  assert.match(html,/正在读取执行记录/);assert.doesNotMatch(html,/正在恢复连接|暂时无法读取执行状态|恢复成功|正在执行/);
});

test('后台已释放时说明结果仍未知，保留核对并撤下无效停止按钮',()=>{
 const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased:true,observing:false,stopping:false,onObserve(){},onStop(){}}));
 assert.match(html,/回复已中断，可继续发送/);assert.match(html,/>重新读取</);assert.match(html,/title="后台连接已释放/);assert.doesNotMatch(html,/<details|<small|查看原因/);
 assert.doesNotMatch(html,/>停止<|正在停止|已确认停止|执行成功/);
});

test('缺少明确释放证明时保留停止，不把未知当作已释放',()=>{
 for(const resourcesReleased of [undefined,false]){
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased,observing:false,stopping:false,onObserve(){},onStop(){}}));
  assert.match(html,/>停止</);assert.doesNotMatch(html,/后台已释放/);
 }
});

test('核对未得到新结果时在原行给出结论，不新增说明行或展开块',()=>{
 const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased:true,feedback:'读取完成：未读到结束记录。',observing:false,stopping:false,onObserve(){},onStop(){}}));
 assert.match(html,/未读到结束记录，可继续发送/);assert.match(html,/title="[^"]*未读到结束记录/);
 assert.doesNotMatch(html,/<small|<details|>停止</);
});
