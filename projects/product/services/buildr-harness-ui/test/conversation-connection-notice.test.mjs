import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({load(url,context,next){if(url.endsWith('/ConversationConnectionNotice.tsx'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);}});
const {ConversationConnectionNotice}=await import('../src/features/agent-conversations/ConversationConnectionNotice.tsx');
const render=props=>renderToStaticMarkup(React.createElement(ConversationConnectionNotice,{onSettings(){},...props}));
test('normal discovery and handoff gaps never pretend the user has not configured an agent',()=>{
 assert.equal(render({ready:false,loading:true}),'');assert.equal(render({ready:false}),'');
 assert.ok(!render({ready:false,error:'正在自动恢复连接。'}).includes('请先接入智能体'));
 assert.equal(render({ready:true,error:'offline',connection:{enabled:true}}),'');
 assert.ok(render({ready:true}).includes('请先接入智能体'));
});
