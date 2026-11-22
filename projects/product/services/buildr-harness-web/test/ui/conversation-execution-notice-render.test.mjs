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
const {ConversationExecutionNotice}=await import('../../src/features/agent-conversations/ConversationExecutionNotice.tsx');

const live=(over={})=>({status:'unknown',stopRequested:false,resourcesReleased:false,tools:[],...over});
const render=(props)=>renderToStaticMarkup(React.createElement(ConversationExecutionNotice,{observing:false,stopping:false,onObserve(){},onStop(){},...props}));

test('服务重启中断只显示原因与继续原任务，不再提供关闭、读取或停止',()=>{
 const run=live({diagnostic:'服务退休中断了本轮执行；已有结果保留，可以继续。',stopRequested:true,resourcesReleased:true,tools:[{id:'background-command',label:'command',status:'unknown'}]});
 const html=render({run,onContinue(){}});
 assert.match(html,/服务重启中断了本轮，结果未能确认。/);
 assert.match(html,/记录和已完成的操作都保留。/);
 assert.match(html,/1 条后台命令的结束记录缺失，可能仍在运行/);
 assert.equal((html.match(/>继续原任务</g)||[]).length,1);
 assert.doesNotMatch(html,/>关闭对话<|>重新读取<|>停止</);
 assert.doesNotMatch(html,/执行成功|已确认停止|彻底停止/);
});

test('已请求停止但未确认结束时说明真实状态，不替用户认领系统动作',()=>{
 const html=render({run:live({diagnostic:'停止已请求，但未取得原生结束确认；原工作记录已保留，不会重发。',stopRequested:true}),onContinue(){}});
 assert.match(html,/已请求停止，但尚未确认结束。/);
 assert.doesNotMatch(html,/服务重启中断/);
 assert.equal((html.match(/>继续原任务</g)||[]).length,1);
 assert.doesNotMatch(html,/>重新读取<|>停止</);
});

test('无法归因的已释放中断不猜测具体原因',()=>{
 const html=render({run:live({resourcesReleased:true}),onContinue(){}});
 assert.match(html,/本轮执行中断，结果未能确认。/);
 assert.match(html,/记录和已完成的操作都保留。/);
 assert.doesNotMatch(html,/服务重启|已请求停止/);
});

test('仍有活动工作的未知轮保留重新读取与停止，不提供继续',()=>{
 const html=render({run:live(),onContinue(){}});
 assert.match(html,/暂时无法读取执行状态/);
 assert.equal((html.match(/>重新读取</g)||[]).length,1);
 assert.equal((html.match(/>停止</g)||[]).length,1);
 assert.doesNotMatch(html,/>继续原任务</);
});

test('核对期间只说明正在读取执行记录',()=>{
 const html=render({run:live(),observing:true,onContinue(){}});
 assert.match(html,/正在读取执行记录/);
 assert.doesNotMatch(html,/恢复连接|暂时无法读取执行状态/);
});

test('停止期间说明整轮范围并禁用重复动作',()=>{
 const html=render({run:live(),stopping:true});
 assert.match(html,/正在停止本轮及派生工作/);
 assert.doesNotMatch(html,/读取完成|继续原任务/);
});

test('没有可用继续动作时只说明原因，不发明按钮',()=>{
 const html=render({run:live({resourcesReleased:true,diagnostic:'服务退休中断了本轮执行；已有结果保留，可以继续。'})});
 assert.match(html,/服务重启中断了本轮，结果未能确认。/);
 assert.doesNotMatch(html,/<button|继续原任务/);
});

test('核对结论保留在同一行的可见文案',()=>{
 const html=render({run:live({resourcesReleased:false}),feedback:'读取完成：仍无法读取原执行状态，记录已保留。',onContinue(){}});
 assert.match(html,/>读取完成：仍无法读取原执行状态，记录已保留。<\/span>/);
 assert.match(html,/title="[^"]*仍无法读取原执行状态/);
 assert.doesNotMatch(html,/<details|>继续原任务</);
});

test('后台自动续行达到上限暂停且已释放资源时显示原因与唯一继续原任务按钮',()=>{
 const run=live({diagnostic:'后台结果已取得，但自动续行次数已达上限；未报告为完成。',resourcesReleased:true,tools:[{id:'cmd-1',label:'command',status:'completed'}]});
 const html=render({run,onContinue(){}});
 assert.match(html,/后台自动续行已达上限，本轮已暂停。/);
 assert.match(html,/后台结果已取得，记录和已完成的操作都保留/);
 assert.equal((html.match(/>继续原任务</g)||[]).length,1);
 assert.doesNotMatch(html,/>关闭对话<|>重新读取<|>停止</);
 assert.doesNotMatch(html,/服务重启中断/);
});
