import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({resolve(specifier,context,next){
 if(specifier==='./ConversationExecutionIndicator')return next(specifier+'.tsx',context);
 return next(specifier,context);
},load(url,context,next){
 if(/\/Conversation(CompactionNotice|ExecutionIndicator)\.tsx$/.test(url))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
 return next(url,context);
}});
const {ConversationCompactionNotice}=await import('../src/features/agent-conversations/ConversationCompactionNotice.tsx');
const run={status:'running',contextCompaction:{id:'compact',startedAt:new Date(Date.now()-42000).toISOString()}};
const render=value=>renderToStaticMarkup(React.createElement(ConversationCompactionNotice,{run:value}));
test('native phase renders waiting feedback and persisted elapsed time without introducing an action',()=>{
 const html=render(run);assert.match(html,/正在压缩上下文，请等待/);assert.match(html,/data-context-compaction="compact"/);assert.match(html,/00:00:4[23]/);assert.doesNotMatch(html,/<button/);
});
test('silence, token usage, terminal, unknown and stopped work never display active compaction',()=>{
 for(const value of [undefined,{status:'running',contextUsage:{usedTokens:10}},...['completed','failed','stopped','stopping','unknown','tools-active'].map(status=>({...run,status})),...['stopRequested','resourcesReleased','supersededBy'].map(key=>({...run,[key]:true}))])assert.equal(render(value),'');
});
