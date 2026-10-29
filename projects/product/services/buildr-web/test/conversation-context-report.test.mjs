import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {rememberContextReport,visibleContextReport,contextReportWindow,conversationUsageReport} from '../src/features/agent-conversations/conversation-state.ts';

registerHooks({load(url,context,next){
  if(url.endsWith('/ContextUsageSummary.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const {ContextUsageSummary}=await import('../src/features/agent-conversations/ContextUsageSummary.tsx');

const run=(id,usage,extra={})=>({id,participantId:'p1',provider:'codex',generation:'g1',status:'running',accepted:true,tools:[],startedAt:'t',updatedAt:'t',contextUsage:usage,...extra});
const conversation=(id,workspaceId,runView)=>({id,workspaceId,revision:'r',cwd:'/c',title:'t',hidden:false,updatedAt:'t',participants:[],entries:[],requests:[],run:runView});
const catalog=[
  {id:'a',label:'Alpha',modelId:'m',accountId:'acc-1',accountIdentity:'id-1',accountRevision:'r1',provider:'shared-x',accountLabel:'One',available:true,images:false,tools:true,contextWindow:100000,serviceTiers:[{id:'fast',label:'F',contextWindow:64000}],defaultServiceTier:'fast'},
  {id:'b',label:'Alpha',modelId:'m',accountId:'acc-2',accountIdentity:'id-2',accountRevision:'r1',provider:'shared-y',accountLabel:'Two',available:true,images:false,tools:true,contextWindow:200000},
];

test('发送新一轮未报告时保留最近真实报告，新一轮到达后整体替换',()=>{
  const chat=conversation('c1','w1',run('r1',{usedTokens:50000,windowTokens:200000}));
  const remembered=rememberContextReport(null,chat);
  assert.equal(remembered.usedTokens,50000);
  assert.equal(rememberContextReport(remembered,chat),remembered,'同一数据保持引用');
  const next=conversation('c1','w1',run('r2',undefined));
  assert.equal(rememberContextReport(remembered,next),remembered,'新一轮未报告不清空');
  assert.equal(conversationUsageReport(remembered,next),remembered,'展示继续消费保留报告');
  const reported=conversation('c1','w1',run('r2',{usedTokens:1000,windowTokens:100000}));
  const replaced=rememberContextReport(remembered,reported);
  assert.equal(replaced.runId,'r2');assert.equal(replaced.usedTokens,1000);
});

test('合法零用量与下降值也是新数据，直接替换旧报告',()=>{
  const kept=rememberContextReport(null,conversation('c1','w1',run('r1',{usedTokens:90000})));
  const zero=rememberContextReport(kept,conversation('c1','w1',run('r1',{usedTokens:0})));
  assert.equal(zero.usedTokens,0);assert.notEqual(zero,kept);
  assert.equal(conversationUsageReport(kept,conversation('c1','w1',run('r1',{usedTokens:0}))).usedTokens,0);
});

test('保留报告只在本对话可见，新对话和其他对话不沿用',()=>{
  const kept=rememberContextReport(null,conversation('c1','w1',run('r1',{usedTokens:10})));
  assert.equal(visibleContextReport(kept,conversation('c1','w1',run('r2',undefined))),kept);
  assert.equal(visibleContextReport(kept,conversation('c2','w1',null)),null);
  assert.equal(visibleContextReport(kept,conversation('c1','w2',null)),null);
  assert.equal(conversationUsageReport(kept,null),null,'新对话无旧值');
  assert.equal(conversationUsageReport(kept,conversation('c2','w1',run('r9',{usedTokens:1,windowTokens:10}))).runId,'r9','其他对话用自己的实时报告');
});

test('窗口优先取报告，缺失时只补同一来源同档位的目录窗口',()=>{
  const report={workspaceId:'w1',conversationId:'c1',runId:'r1',usedTokens:32000,model:'m',modelAccountId:'acc-1',modelAccountIdentity:'id-1',serviceTier:'fast'};
  assert.equal(contextReportWindow({...report,windowTokens:128000},catalog),128000,'报告窗口优先');
  assert.equal(contextReportWindow(report,catalog),64000,'档位窗口');
  assert.equal(contextReportWindow({...report,serviceTier:undefined},catalog),64000,'默认档位');
  assert.equal(contextReportWindow({...report,modelAccountId:'acc-2',modelAccountIdentity:'id-2'},catalog),200000,'同名模型按账号区分');
  assert.equal(contextReportWindow({...report,modelAccountIdentity:'rotated'},catalog),undefined,'账号身份不同不借用窗口');
  assert.equal(contextReportWindow({...report,modelAccountId:'missing'},catalog),undefined,'没有可信窗口不伪造');
  const overridden=contextReportWindow({...report,windowTokens:undefined},[{...catalog[0],contextWindowOverride:50000}]);
  assert.equal(overridden,50000,'覆盖窗口按来源生效');
});

test('摘要区分当前配置与报告来源，无报告明确未知，无窗口不伪造百分比',()=>{
  const render=props=>renderToStaticMarkup(React.createElement(ContextUsageSummary,props)).replace(/<!-- -->/g,'');
  const full=render({configuredWindow:200000,report:{usedTokens:64000,windowTokens:128000},reportWindow:128000,reportLabel:'Codex / Alpha'});
  assert.match(full,/配置窗口：200K/);assert.match(full,/已用：64K · 50%（剩余 50%）/);assert.match(full,/运行窗口：128K/);assert.match(full,/Codex \/ Alpha 最近一次报告，非累计计费用量/);
  const noWindow=render({configuredWindow:200000,report:{usedTokens:64000},reportWindow:undefined});
  assert.match(noWindow,/已用：64K<\/div>/);assert.doesNotMatch(noWindow,/运行窗口|剩余|·/);
  const inferredWindow=render({configuredWindow:200000,report:{usedTokens:64000},reportWindow:128000,reportLabel:'Codex / Alpha'});
  assert.match(inferredWindow,/已用：64K · 50%（剩余 50%）/);assert.match(inferredWindow,/运行窗口：128K/);
  const empty=render({configuredWindow:undefined,report:null});
  assert.match(empty,/配置窗口：未知/);assert.match(empty,/尚未收到执行智能体报告/);
  const zero=render({report:{usedTokens:0,windowTokens:100000},reportWindow:100000});
  assert.match(zero,/已用：0K · 0%（剩余 100%）/);
});
