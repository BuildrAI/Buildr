import {test} from 'node:test';import assert from 'node:assert/strict';
import {conversationReplyText} from '../src/features/agent-conversations/conversation-reply.ts';
test('response display resolves labels while source text is unchanged',()=>{const text=JSON.stringify({请求标识:'request',问题:'允许修改？',选项:[{id:'allow',label:'允许本次'}],回答:'allow',授权性质:'原请求范围'});assert.equal(conversationReplyText(text),'允许修改？\n答复：允许本次');assert.equal(JSON.parse(text).回答,'allow');});
test('multiple question responses preserve order and selected option labels',()=>{const text=JSON.stringify({请求标识:'request',问题:'补充',问题列表:[{id:'scope',label:'范围',options:[{id:'local',label:'本地'}]}],回答:{scope:['local']}});assert.equal(conversationReplyText(text),'范围：本地');});
test('ordinary prose and unrelated JSON are never reinterpreted',()=>{for(const text of ['ordinary input','{"问题":"sample","回答":"x"}','{"请求标识":"id","问题":"q","回答":"a","extra":"user data"}'])assert.equal(conversationReplyText(text),text);});
test('malformed response-like user JSON remains readable and cannot break the renderer',()=>{const text=JSON.stringify({请求标识:'id',问题:'q',回答:'a',选项:'unexpected'});assert.equal(conversationReplyText(text),text);});
test('handoff question snapshots show their actual status and explicit answers keep option labels',()=>{
  const base={请求标识:'id',问题:'是否完成？',问题列表:[{id:'result',label:'验收结果',options:[{id:'later',label:'稍后确认'}]}]};
  assert.match(conversationReplyText(JSON.stringify({...base,状态:'原问题；回答以用户明确提交的记录为准。'})),/原问题；回答以用户明确提交/);
  assert.match(conversationReplyText(JSON.stringify({...base,状态:'未回答，已交接'})),/未回答；交接不代表同意/);
  assert.equal(conversationReplyText(JSON.stringify({...base,状态:'已提交交接回答',回答:{result:'later'}})),'验收结果：稍后确认');
});
