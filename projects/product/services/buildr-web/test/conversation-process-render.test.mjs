import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({
  resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/ConversationProcessBlock.tsx')){
      if(specifier.endsWith('/MarkdownHost'))return {url:'data:text/javascript,export const MarkdownHost=()=>null;',shortCircuit:true};
      if(specifier.startsWith('./'))return next(new URL(specifier+'.ts',context.parentURL).href,context);
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('/ConversationProcessBlock.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    return next(url,context);
  },
});
const {ConversationProcessBlock}=await import('../src/features/agent-conversations/ConversationProcessBlock.tsx');
const entry={id:'tool',sequence:1,kind:'tool',role:'system',name:'command',text:'echo check',status:'running',createdAt:'2026-10-27T00:00:00Z'};
const tool=(id,name='command')=>({id,sequence:0,kind:'tool',role:'system',name,text:'echo '+id,status:'completed',createdAt:'2026-10-27T00:00:00Z'});
const narration=(id)=>({id,sequence:0,kind:'message',role:'assistant',text:'说明 '+id,createdAt:'2026-10-27T00:00:00Z'});
const render=active=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries:[entry],active,open:true,onToggle(){},onOpenFile(){}}));
const renderEntries=(entries,{active=false,open=true,groupsOpen={}}={})=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries,active,open,groupsOpen,onToggle(){},onOpenFile(){}}));
test('折叠工具组也保留失败和未知，运行时不重复状态文案',()=>{
 const settled=render(false);assert.match(settled,/查看处理过程/);assert.match(settled,/1 项结果待核对/);assert.doesNotMatch(settled,/正在处理|执行中|is-running/);
 const live=render(true);assert.match(live,/data-process-state="live"/);assert.match(live,/ac-step-group/);assert.doesNotMatch(live,/正在处理|执行中|查看处理过程|ac-tool-detail/);
});
test('连续工具默认成组折叠，助手说明按原位置独立展示',()=>{
 const html=renderEntries([narration('n1'),tool('t1'),tool('t2'),{...tool('t3'),status:'failed'},narration('n2'),tool('t4','read')]);
 assert.equal((html.match(/class="ac-step-group(?: is-failed)?"/g)||[]).length,2);assert.match(html,/3 次工具调用/);
 assert.equal((html.match(/ac-process-narration/g)||[]).length,2);assert.match(html,/1 项失败/);assert.doesNotMatch(html,/ac-step ac-step-tool|ac-tool-detail/);
});
test('按已有成员接续展开选择，明细保持顺序且提供底部收起',()=>{
 const html=renderEntries([tool('prepended'),tool('t1'),tool('t2')],{groupsOpen:{'tool-group:t1':true}});
 assert.match(html,/class="ac-step-group" open/);assert.equal((html.match(/ac-step ac-step-tool/g)||[]).length,3);
 assert.ok(html.indexOf('data-entry-id="prepended"')<html.indexOf('data-entry-id="t1"'));assert.match(html,/收起工具调用/);assert.match(html,/收起处理过程/);
});
test('未展开的历史过程不挂载正文，执行中的说明与工具汇总可见',()=>{
 const entries=[narration('large'),tool('t1')];const closed=renderEntries(entries,{open:false});
 assert.doesNotMatch(closed,/ac-process-narration|ac-step ac-step-tool|ac-tool-detail/);assert.match(closed,/查看处理过程/);
 const live=renderEntries(entries,{active:true,open:false});assert.match(live,/ac-process-narration/);assert.match(live,/ac-step-group/);assert.doesNotMatch(live,/ac-tool-detail|ac-step-group-items/);
});
