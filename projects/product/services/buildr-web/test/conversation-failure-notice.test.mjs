import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {conversationFailureReason} from '../src/features/agent-conversations/conversation-notices.ts';

registerHooks({
  resolve(specifier,context,next){
    if(specifier==='./conversation-notices'&&context.parentURL?.endsWith('/ConversationFailureNotice.tsx'))return next(new URL('./conversation-notices.ts',context.parentURL).href,context);
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('/ConversationFailureNotice.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    return next(url,context);
  }
});
const {ConversationFailureNotice}=await import('../src/features/agent-conversations/ConversationFailureNotice.tsx');

test('模型调用限流显示排队原因与重试建议',()=>{
  const reason=conversationFailureReason('stream disconnected before completion: 403: {"code":"10605","message":"{\\"isQueued\\":true,\\"modelKey\\":\\"lmodel\\",\\"retryAfterSeconds\\":30}","subCode":"CALL_COUNT_LIMIT"}');
  assert.match(reason.summary,/模型调用达到当前上限/);
  assert.match(reason.action,/30 秒后重试/);
  assert.match(reason.action,/其他模型\/账号/);
  assert.doesNotMatch(reason.summary,/CALL_COUNT_LIMIT|isQueued/);
});

test('常见失败分别给出可理解原因，未知诊断安全回退',()=>{
  assert.match(conversationFailureReason('model_quota_exhausted：账号额度用尽').summary,/额度不足/);
  assert.match(conversationFailureReason('qoder_platform_login_expired').summary,/登录失效/);
  assert.match(conversationFailureReason('所选模型已停用').summary,/不可用/);
  assert.match(conversationFailureReason('request timed out after 30s').summary,/超时/);
  assert.match(conversationFailureReason('fetch failed: ECONNRESET').summary,/连接中断/);
  assert.match(conversationFailureReason('',{kind:'process'}).summary,/执行进程/);
  assert.match(conversationFailureReason('',{kind:'protocol'}).summary,/工具调用格式异常/);
  assert.match(conversationFailureReason('',{kind:'transport'}).summary,/状态观察中断/);
  const unknown=conversationFailureReason('internal token=secret-value');
  assert.match(unknown.summary,/未识别/);
  assert.doesNotMatch(unknown.summary,/secret-value/);
  assert.match(unknown.action,/技术详情/);
});

test('失败组件直接显示原因和下一步，技术详情默认折叠',()=>{
  const diagnostic='stream disconnected before completion: 403: {"code":"10605","subCode":"CALL_COUNT_LIMIT","message":"{\\"retryAfterSeconds\\":30}"}';
  const html=renderToStaticMarkup(React.createElement(ConversationFailureNotice,{run:{status:'failed',accepted:true,tools:[],diagnostic}}));
  const summary=html.split('<details')[0];
  assert.match(summary,/失败原因/);
  assert.match(summary,/模型调用达到当前上限/);
  assert.match(summary,/约 30 秒后重试/);
  assert.match(summary,/已受理，但未完成/);
  assert.doesNotMatch(summary,/CALL_COUNT_LIMIT/);
  assert.match(html,/<details[^>]*><summary>技术详情<\/summary><p>.*CALL_COUNT_LIMIT/);
});

test('非失败轮次不渲染失败提示',()=>{
  assert.equal(renderToStaticMarkup(React.createElement(ConversationFailureNotice,{run:{status:'completed',accepted:true,tools:[]}})),'');
});
