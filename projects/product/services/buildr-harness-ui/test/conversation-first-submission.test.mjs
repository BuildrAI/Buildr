import test from 'node:test';
import assert from 'node:assert/strict';
import {draftMaterialIds,firstConversationSubmissions} from '../src/features/agent-conversations/conversation-first-submission.ts';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

registerHooks({load(url,context,next){
  if(url.endsWith('/ConversationFirstSubmissionNotice.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
  return next(url,context);
}});
const {ConversationFirstSubmissionNotice}=await import('../src/features/agent-conversations/ConversationFirstSubmissionNotice.tsx');
test('首次发送身份和准确输入在刷新后恢复，不被其他提交的迟到清理覆盖',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const manager=firstConversationSubmissions(storage,'profile');
  const one={draftId:'draft-one',workspaceId:'workspace-one',input:{text:'first',connectionId:'codex',clientRequestId:'request-one',expectedDraftRevision:'images-one',attachmentIds:['image-one']}};
  manager.save(one);assert.deepEqual(firstConversationSubmissions(storage,'profile').read(),one);
  manager.clear('different-request');assert.deepEqual(manager.read(),one);
  const next={...one,input:{...one.input,text:'next',clientRequestId:'request-two'}};manager.save(next);manager.clear('request-one');assert.deepEqual(manager.read(),next);
  manager.clear('request-two');assert.equal(manager.read(),undefined);assert.equal(firstConversationSubmissions(storage,'profile').read(),undefined);
});
test('浏览器存储被拒绝仍保存同页提交身份，不自动重放网络',()=>{
  const unavailable=()=>{throw Error('denied');};const manager=firstConversationSubmissions({getItem:unavailable,setItem:unavailable,removeItem:unavailable});
  const value={draftId:'draft',workspaceId:'workspace',input:{text:'first',connectionId:'codex',clientRequestId:'request',expectedDraftRevision:'empty'}};
  manager.save(value);assert.deepEqual(manager.read(),value);manager.clear('request');assert.equal(manager.read(),undefined);
});

test('真实对话各自保存图片成员，刷新恢复不复制文件字节或混入共享草稿',async()=>{
  const {readConversationImages,writeConversationImages}=await import('../src/features/agent-conversations/useConversationAttachments.ts');
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const image={id:'image-a',name:'one.png',mimeType:'image/png',size:8,revision:'r1',file:new File(['bytes'],'one.png')};
  assert.equal(writeConversationImages(storage,'profile',{a:[image],b:[{...image,id:'image-b'}]}),true);
  const restored=readConversationImages(storage,'profile');assert.equal(restored.a[0].id,'image-a');assert.equal(restored.b[0].id,'image-b');assert.equal(restored.new,undefined);assert.equal(restored.a[0].file,undefined);
});

test('first-send comparison ignores derived video frames but keeps original membership and order',()=>{
  assert.deepEqual(draftMaterialIds([{id:'frame',frame:true},{id:'recording'},{id:'photo'}]),['recording','photo']);
  assert.deepEqual(draftMaterialIds([{id:'photo'}]),['photo']);
});

test('升级明确未受理保存原提交，刷新后仍与未知结果区分',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const manager=firstConversationSubmissions(storage),original={draftId:'draft',workspaceId:'workspace',input:{text:'original',connectionId:'codex',clientRequestId:'request',expectedDraftRevision:'images',attachmentIds:['image']}};
  manager.save(original);
  manager.recordFailure('request',{status:503,code:'agent_process_switching'});
  const restored=firstConversationSubmissions(storage).read();
  assert.equal(restored.failureReason,'backend-updating');assert.deepEqual(restored.input,original.input);
  const html=renderToStaticMarkup(React.createElement(ConversationFirstSubmissionNotice,{submission:restored,busy:false,onRetry(){assert.fail('render must never resend');}}));
  assert.match(html,/ant-alert-info/);assert.match(html,/尚未受理/);assert.match(html,/原文字和附件已保留/);assert.match(html,/检查升级并重试原提交/);assert.doesNotMatch(html,/结果待核对/);
});

test('同次提交重试后结果未知不能沿用升级未受理结论',()=>{
  const manager=firstConversationSubmissions(),original={draftId:'draft',workspaceId:'workspace',input:{text:'original',connectionId:'codex',clientRequestId:'request',expectedDraftRevision:'images'}};
  manager.save(original);manager.recordFailure('request',{status:503,code:'agent_process_switching'});
  for(const error of [new Error('connection lost'),{status:503,code:'internal_error'},{code:'agent_process_switching'}]){
    const pending=manager.recordFailure('request',error);assert.equal(pending.failureReason,undefined);assert.deepEqual(pending.input,original.input);
    const html=renderToStaticMarkup(React.createElement(ConversationFirstSubmissionNotice,{submission:pending,busy:true,onRetry(){}}));
    assert.match(html,/ant-alert-warning/);assert.match(html,/结果待核对/);assert.doesNotMatch(html,/尚未受理|检查升级/);
  }
});

test('迟到失败不改写另一次提交，也不复活已受理并清理的提交',()=>{
  const manager=firstConversationSubmissions(),original={draftId:'draft',workspaceId:'workspace',input:{text:'original',connectionId:'codex',clientRequestId:'request',expectedDraftRevision:'images'}};
  manager.save(original);const next={...original,input:{...original.input,text:'new text',clientRequestId:'next'}};manager.save(next);
  assert.equal(manager.recordFailure('request',{status:503,code:'agent_process_switching'}),undefined);assert.deepEqual(manager.read(),next);
  manager.clear('next');assert.equal(manager.recordFailure('next',{status:503,code:'agent_process_switching'}),undefined);assert.equal(manager.read(),undefined);
});
