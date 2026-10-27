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
test('historical stale tool status cannot keep a stopped process spinning',()=>{
  const html=render(false);assert.doesNotMatch(html,/正在处理|执行中|ac-process-running-dot|is-running/);assert.match(html,/执行了 1 次工具调用/);assert.match(html,/结果待核对/);
});
test('the current active process still shows live execution',()=>{
  const html=render(true);assert.match(html,/正在处理/);assert.match(html,/执行中/);assert.doesNotMatch(html,/结果待核对/);
});
