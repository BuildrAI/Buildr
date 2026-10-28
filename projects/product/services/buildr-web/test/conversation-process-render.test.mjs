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
const renderEntries=(entries,{active=false,open=true}={})=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries,active,open,onToggle(){},onOpenFile(){}}));
test('历史未知结果继续提示，执行中的工具直接可见且不重复显示运行文案',()=>{
 const settled=render(false);assert.match(settled,/查看处理过程/);assert.match(settled,/结果待核对/);assert.doesNotMatch(settled,/正在处理|执行中|is-running/);
 const live=render(true);assert.match(live,/data-process-state="live"/);assert.match(live,/echo check/);assert.doesNotMatch(live,/正在处理|执行中|ac-step-group|查看处理过程/);
});
test('连续工具逐条平铺，结束后只有一个可折叠过程且失败摘要保留',()=>{
 const html=renderEntries([narration('n1'),tool('t1'),tool('t2'),{...tool('t3'),status:'failed'},narration('n2'),tool('t4','read')]);
 assert.doesNotMatch(html,/ac-step-group|个步骤/);assert.equal((html.match(/ac-step ac-step-tool/g)||[]).length,4);
 assert.equal((html.match(/ac-process-narration/g)||[]).length,2);assert.match(html,/1 项失败/);assert.match(html,/data-process-state="settled" open/);
});
test('尚未展开的历史过程只呈现数量和失败，不挂载说明与工具内容',()=>{
  const html=renderEntries([narration('n1'),{...tool('t1'),status:'failed'},tool('t2')],{open:false});
  assert.match(html,/2 次工具调用/);assert.match(html,/1 项失败/);
  assert.doesNotMatch(html,/ac-process-timeline|ac-process-narration|ac-step-group|ac-step ac-step-tool|data-entry-id=/);
});

test('未展开的历史过程不挂载正文，执行中的过程仍直接可见',()=>{
 const entries=[narration('large'),tool('t1')];const closed=renderEntries(entries,{open:false});
 assert.doesNotMatch(closed,/ac-process-narration|ac-step ac-step-tool|ac-tool-detail/);assert.match(closed,/查看处理过程/);
 const live=renderEntries(entries,{active:true,open:false});assert.match(live,/ac-process-narration/);assert.match(live,/ac-step ac-step-tool/);assert.doesNotMatch(live,/ac-tool-detail/);
});
