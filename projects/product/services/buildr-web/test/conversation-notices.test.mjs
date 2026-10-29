import assert from 'node:assert/strict';
import test from 'node:test';
import {visibleConversationEntries, conversationModelWarning, conversationActionError} from '../src/features/agent-conversations/conversation-notices.ts';

const receipt=(id, extra={})=>({id,kind:'notice',role:'system',text:'已请求重试上次未送达的要求。',participantId:'codex',...extra});
test('连续重试仅显示最后一条，保留原始记录与后续回复',()=>{
  const entries=[receipt('one'),receipt('two'),receipt('three'),{id:'reply',kind:'message',role:'assistant',text:'继续执行'}];
  const original=structuredClone(entries);
  assert.deepEqual(visibleConversationEntries(entries).map(e=>e.id),['three','reply']);
  assert.deepEqual(entries,original);
  assert.deepEqual(visibleConversationEntries([receipt('one',{text:'已请求继续上次执行。'}),receipt('two',{text:'已请求继续上次执行。'})]).map(e=>e.id),['two']);
});
test('参与者、内容和其他工作记录形成合并边界，普通用户内容不会去重',()=>{
  for(const middle of [receipt('middle',{participantId:'dsh'}),receipt('middle',{text:'已请求继续上次执行。'}),{id:'middle',kind:'tool',role:'system',text:'检查失败'},{id:'middle',kind:'message',role:'assistant',text:'说明'}]){
    assert.deepEqual(visibleConversationEntries([receipt('one'),middle,receipt('two')]).map(e=>e.id),['one','middle','two']);
  }
  const users=[receipt('one',{kind:'message',role:'user'}),receipt('two',{kind:'message',role:'user'})];
  assert.deepEqual(visibleConversationEntries(users),users);
});
test('目录未就绪不误报模型停用，真实停用与来源不可用分别说明',()=>{
  assert.equal(conversationModelWarning(false,'account',undefined),undefined);
  assert.equal(conversationModelWarning(true,undefined,undefined),undefined);
  assert.equal(conversationModelWarning(true,'account',{available:true,enabled:true}),undefined);
  assert.match(conversationModelWarning(true,'account',{available:false,enabled:false}),/已停用/);
  assert.match(conversationModelWarning(true,'account',{available:false,enabled:true}),/账号.*登录状态/);
  assert.match(conversationModelWarning(true,'account',undefined),/账号/);
});
test('重试后的模型警告只取当前状态，恢复后去除旧错误，其他失败仍可见',()=>{
  const warning=conversationModelWarning(true,'account',{available:false});
  assert.equal(conversationActionError('所选模型暂不可用，请重新选择。',warning),undefined);
  assert.equal(conversationActionError(warning,warning),undefined);
  assert.equal(conversationActionError('所选模型暂不可用，请重新选择。',undefined),undefined);
  assert.equal(conversationActionError('图片上传失败',warning),'图片上传失败');
  assert.equal(conversationActionError('输入内容超出容量',undefined),'输入内容超出容量');
});
