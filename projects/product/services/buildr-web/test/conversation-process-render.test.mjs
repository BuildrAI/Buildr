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
const render=active=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries:[entry],active,open:true,onToggle(){},onOpenFile(){}}));
const tool=(id,name='command')=>({id,sequence:0,kind:'tool',role:'system',name,text:'echo '+id,status:'completed',createdAt:'2026-10-27T00:00:00Z'});
const narration=(id)=>({id,sequence:0,kind:'message',role:'assistant',text:'说明 '+id,createdAt:'2026-10-27T00:00:00Z'});
const renderEntries=entries=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries,active:false,open:true,onToggle(){},onOpenFile(){}}));
test('historical stale tool status cannot keep a stopped process spinning',()=>{
  const html=render(false);assert.doesNotMatch(html,/正在处理|执行中|ac-process-running-dot|is-running/);assert.match(html,/执行了 1 次工具调用/);assert.match(html,/结果待核对/);
});
test('the current active process still shows live execution',()=>{
  const html=render(true);assert.match(html,/正在处理/);assert.match(html,/执行中/);assert.doesNotMatch(html,/结果待核对/);
});
test('连续工具调用默认折叠为一个分组，助手说明保持可见',()=>{
  const html=renderEntries([narration('n1'),tool('t1'),tool('t2'),tool('t3'),narration('n2'),tool('t4'),tool('t5')]);
  assert.equal((html.match(/class="ac-step-group"/g)||[]).length,2);
  assert.match(html,/3 个步骤/);assert.match(html,/2 个步骤/);
  assert.equal((html.match(/ac-process-narration/g)||[]).length,2);
  assert.doesNotMatch(html,/class="ac-step-group" open/);
  assert.equal((html.match(/ac-step ac-step-tool/g)||[]).length,5);
});
test('单个工具调用不套分组，仍独占一行',()=>{
  const html=renderEntries([tool('t1'),narration('n1'),tool('t2','read')]);
  assert.doesNotMatch(html,/ac-step-group/);
  assert.equal((html.match(/ac-step ac-step-tool/g)||[]).length,2);
});
test('分组行汇总步骤类型并标记失败',()=>{
  const html=renderEntries([tool('t1'),tool('t2'),{...tool('t3'),status:'failed'},tool('t4','read')]);
  assert.match(html,/4 个步骤/);assert.match(html,/运行命令 ×3 · 读取文件/);
  assert.match(html,/ac-step-group is-failed/);assert.match(html,/1 项失败/);
});
