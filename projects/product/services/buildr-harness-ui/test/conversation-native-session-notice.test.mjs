import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationNativeSessionDiagnostic,conversationNativeSessionIssue,conversationNativeSessionSummary} from '../src/features/agent-conversations/conversation-notices.ts';

const replacement={reason:'session-replacement',description:'原会话控制资源尚未释放，新要求使用独立会话',from:{contextId:'session-old',generation:'generation-old'},to:{contextId:'session-new',generation:'generation-new'}};
const adoption={reason:'backend-adoption',description:'原轮控制已释放，新后台复用原生会话',from:{contextId:'session-one',generation:'generation-old'},to:{contextId:'session-one',generation:'generation-new'},backendChange:{reason:'runtime-content-changed',detectedAt:'2026-11-02T08:02:01.033Z',fromGeneration:'generation-old',fromDigest:'a'.repeat(64),toDigest:'b'.repeat(64)}};
const fields=(entry)=>Object.fromEntries(conversationNativeSessionDiagnostic(entry).map(field=>[field.label,field.value]));

test('主对话摘要说明情况，不展开会话编号、后台代次与变化依据',()=>{
  const entry={nativeSession:replacement,status:'accepted'};
  const summary=conversationNativeSessionSummary(entry);
  assert.equal(summary,'原后台尚未释放原会话，本轮改在新的原生会话中继续。原执行与历史记录保留。');
  assert.doesNotMatch(summary,/session-|generation-|运行内容/);
  assert.equal(conversationNativeSessionIssue(entry),undefined);
});

test('折叠诊断按字段给出身份、依据、原因与状态，便于逐项核对',()=>{
  const diagnostic=fields({nativeSession:replacement,status:'accepted'});
  assert.deepEqual(Object.keys(diagnostic),['类型','原生会话','后台代次','变化依据','原因','本轮状态']);
  assert.deepEqual(diagnostic,{
    类型:'原生会话替换',原生会话:'session-old → session-new',后台代次:'generation-old → generation-new',
    变化依据:'后台变化来源：历史未记录',原因:'原会话控制资源尚未释放，新要求使用独立会话',本轮状态:'已受理',
  });
});

test('后台内容变化时摘要说明程序已更新，诊断带上检测时间与前后运行内容',()=>{
  assert.equal(conversationNativeSessionSummary({nativeSession:adoption}),'后台程序内容已更新，本轮仍在原原生会话中继续。原执行与历史记录保留。');
  assert.equal(conversationNativeSessionSummary({nativeSession:{...replacement,backendChange:adoption.backendChange}}),'后台程序内容已更新，本轮改在新的原生会话中继续。原执行与历史记录保留。');
  const diagnostic=fields({nativeSession:adoption,status:'accepted'});
  assert.equal(diagnostic.类型,'后台接管，原生会话保留');
  assert.match(diagnostic.变化依据,/检测到后台运行内容变化.*2026-11-02T08:02:01.033Z.*a{64} → b{64}/);
  assert.equal(diagnostic.本轮状态,'已受理');
  assert.match(fields({nativeSession:{...replacement,backendChange:{...adoption.backendChange,reason:'process-restarted'}},status:'accepted'}).变化依据,/同一运行内容的后台进程重启/);
});

test('缺后台依据时诚实降级，未送达与送达待确认留在可见摘要',()=>{
  assert.equal(fields({nativeSession:replacement,status:'sending'}).变化依据,'后台变化来源：历史未记录');
  assert.equal(fields({nativeSession:replacement,status:'sending'}).本轮状态,'等待受理');
  assert.equal(conversationNativeSessionIssue({status:'failed'}),'本轮未送达');
  assert.equal(conversationNativeSessionIssue({status:'unknown'}),'本轮送达待确认');
  assert.equal(conversationNativeSessionIssue({status:'sending'}),undefined);
  assert.equal(fields({nativeSession:replacement,status:'failed'}).本轮状态,'未送达');
  assert.match(conversationNativeSessionSummary({nativeSession:{...replacement,description:'未登记的原因'}}),/^原会话无法继续，/);
});
