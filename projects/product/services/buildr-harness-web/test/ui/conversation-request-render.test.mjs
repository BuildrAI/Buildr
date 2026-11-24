import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

registerHooks({load(url,context,next){
  if(/\/src\/features\/agent-conversations\/[^/]+\.tsx$/.test(url))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});

const {ConversationAnswerInput,handleAnswerKeyDown}=await import('../../src/features/agent-conversations/ConversationAnswerInput.tsx');
const {ConversationRequest}=await import('../../src/features/agent-conversations/ConversationRequest.tsx');

test('handleAnswerKeyDown 统一遵循 Enter 发送、Shift+Enter 换行及输入法保护',()=>{
  let submits=0,prevented=0;
  const event=(over={})=>({key:'Enter',shiftKey:false,isComposing:false,keyCode:13,preventDefault(){prevented++;},...over});

  assert.equal(handleAnswerKeyDown(event(),{busy:false,uploading:false}),false);
  assert.equal(prevented,0);

  assert.equal(handleAnswerKeyDown(event(),{busy:false,uploading:false,onSubmit:()=>{submits++;}}),true);
  assert.equal(submits,1);
  assert.equal(prevented,1);

  assert.equal(handleAnswerKeyDown(event({shiftKey:true}),{busy:false,uploading:false,onSubmit:()=>{submits++;}}),false);
  assert.equal(handleAnswerKeyDown(event({isComposing:true}),{busy:false,uploading:false,onSubmit:()=>{submits++;}}),false);
  assert.equal(handleAnswerKeyDown(event({keyCode:229}),{busy:false,uploading:false,onSubmit:()=>{submits++;}}),false);
  assert.equal(submits,1);
  assert.equal(prevented,1);

  assert.equal(handleAnswerKeyDown(event(),{busy:true,uploading:false,onSubmit:()=>{submits++;}}),true);
  assert.equal(handleAnswerKeyDown(event(),{busy:false,uploading:true,onSubmit:()=>{submits++;}}),true);
  assert.equal(submits,1);
  assert.equal(prevented,3);
});

test('ConversationAnswerInput 无上传能力时隐藏加号，并在下方单独展示快捷键提示',()=>{
  const html=renderToStaticMarkup(React.createElement(ConversationAnswerInput,{
    label:'多选其他',
    value:'',
    busy:false,
    onChange(){},
    onSubmit(){},
    note:React.createElement('small',null,'仅提交此卡片的回答'),
    actions:React.createElement('button',{type:'button'},'回答并继续'),
  }));
  assert.doesNotMatch(html,/添加回答图片、视频或文档/);
  assert.doesNotMatch(html,/ac-compose-access/);
  assert.match(html,/ac-answer-meta/);
  assert.match(html,/仅提交此卡片的回答/);
  assert.match(html,/Enter 发送 · Shift\+Enter 换行/);
});

test('ConversationRequest 自由回答和带选项问题保持唯一提交按钮与独立提示行',()=>{
  const freeForm=renderToStaticMarkup(React.createElement(ConversationRequest,{
    request:{id:'q1',runId:'r1',participantId:'p1',generation:'g1',kind:'question',title:'补充说明'},
    run:{id:'r1',participantId:'p1',generation:'g1',status:'waiting-question',tools:[]},
    provider:'codex',
    busy:false,
    onUpload:async()=>{},
    onReply(){},
  }));
  assert.equal((freeForm.match(/aria-label="回答并继续"/g)||[]).length,1);
  assert.equal((freeForm.match(/仅提交此卡片的回答/g)||[]).length,1);
  assert.match(freeForm,/添加回答图片、视频或文档/);
  assert.match(freeForm,/Enter 发送 · Shift\+Enter 换行/);
  assert.match(freeForm,/<div class="ac-answer-meta">.*?仅提交此卡片的回答.*?Enter 发送 · Shift\+Enter 换行<\/small><\/div>/);

  const singleWithOther=renderToStaticMarkup(React.createElement(ConversationRequest,{
    request:{
      id:'q2',runId:'r1',participantId:'p1',generation:'g1',kind:'question',title:'选择处理方式',
      questions:[{id:'way',label:'处理方式',allowOther:true,options:[{id:'a',label:'方案 A'}]}],
    },
    run:{id:'r1',participantId:'p1',generation:'g1',status:'waiting-question',tools:[]},
    provider:'codex',
    busy:false,
    onUpload:async()=>{},
    onReply(){},
  }));
  assert.equal((singleWithOther.match(/aria-label="回答并继续"/g)||[]).length,1);
  assert.equal((singleWithOther.match(/仅提交此卡片的回答/g)||[]).length,1);
  assert.match(singleWithOther,/Enter 发送 · Shift\+Enter 换行/);
});
