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

test('已释放疑点的继续与关闭使用独立动作，关闭后仍说明未知结果保留',()=>{
 const base={resourcesReleased:true,observing:false,stopping:false,onObserve(){},onStop(){},onContinue(){},onClose(){}};
 const open=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,base));
 assert.match(open,/>继续工作</);assert.match(open,/>关闭对话</);assert.match(open,/关闭对话只结束关注/);assert.doesNotMatch(open,/>停止</);
 const closed=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{...base,closed:true}));
 assert.match(closed,/对话已关闭，原记录及待确认结果保留/);assert.doesNotMatch(closed,/>关闭对话</);assert.match(closed,/>继续工作</);
 const pending=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{...base,closing:true}));
 assert.equal((pending.match(/disabled=""/g)||[]).length,2,'closing disables observation and continuation');
});
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
 assert.match(html,/本轮结束状态待确认，原记录保留/);assert.match(html,/>重新读取</);assert.match(html,/title="后台连接已释放/);assert.doesNotMatch(html,/<details|<small|查看原因/);
 assert.doesNotMatch(html,/>停止<|正在停止|已确认停止|执行成功/);
});

test('缺少明确释放证明时保留停止，不把未知当作已释放',()=>{
 for(const resourcesReleased of [undefined,false]){
  const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased,stopRequested:false,observing:false,stopping:false,onObserve(){},onStop(){}}));
  assert.match(html,/>停止</);assert.doesNotMatch(html,/后台已释放/);
 }
});

test('停止请求已提交时明确结束动作，不重复保留停止按钮',()=>{
 const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased:false,stopRequested:true,observing:false,stopping:false,onObserve(){},onStop(){}}));
 assert.match(html,/停止已请求，结束状态待确认/);
 assert.match(html,/停止请求已提交，尚未确认旧执行结束/);
 assert.doesNotMatch(html,/>停止<\/button>|正在执行|执行成功/);
});

test('核对未得到新结果时在原行给出结论，不新增说明行或展开块',()=>{
 const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased:true,feedback:'读取完成：未读到结束记录。',observing:false,stopping:false,onObserve(){},onStop(){}}));
 assert.match(html,/>读取完成：未读到结束记录。<\/span>/);assert.match(html,/title="[^"]*未读到结束记录/);
 assert.doesNotMatch(html,/<small|<details|>停止</);
});

test('停止期间说明整轮范围，返回后直接显示真实停止结果',()=>{
 const base={resourcesReleased:false,observing:false,onObserve(){},onStop(){}};
 const busy=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{...base,stopping:true}));
 assert.match(busy,/正在停止本轮及派生工作/);
 const feedback='已终止本轮独占控制资源；原操作结果仍待核对。';
 const done=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{...base,resourcesReleased:true,stopping:false,feedback}));
 assert.match(done,/>已终止本轮独占控制资源；原操作结果仍待核对。<\/span>/);
 assert.doesNotMatch(done,/>停止<\/button>|执行成功/);
});

test('停止未确认的显式继续保留未知说明，不提供虚假的彻底停止',()=>{
 const html=renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{resourcesReleased:false,stopRequested:true,observing:false,stopping:false,onObserve(){},onStop(){},onContinue(){}}));
 assert.match(html,/>结束等待并继续</);
 assert.match(html,/独立上下文继续/);
 assert.doesNotMatch(html,/>停止<|已确认停止|彻底停止/);
});
