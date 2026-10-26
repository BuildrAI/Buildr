import test from 'node:test';
import assert from 'node:assert/strict';
import { dshHistoryItems } from '../../src/executors/dsh/protocol.ts';
import { qoderHistoryItems, qoderResultOutcome } from '../../src/executors/qoder/protocol.ts';

test('Qoder result failures retain explicit errors with credentials and URLs redacted',()=>{
  const outcome=qoderResultOutcome({type:'result',subtype:'error_during_execution',is_error:true,errors:['invalid_argument: request rejected https://qoder.invalid/?token=private-url api_key="private-key" Bearer vendor-secret raw-gateway-key','The selected provider rejected the request.']},false,['raw-gateway-key']);
  assert.equal(outcome.status,'failed');assert.match(outcome.diagnostic!,/invalid_argument: request rejected/);assert.match(outcome.diagnostic!,/selected provider rejected/);
  for(const secret of ['qoder.invalid','private-url','private-key','vendor-secret','raw-gateway-key'])assert.ok(!outcome.diagnostic!.includes(secret),secret);
});

test('Qoder result diagnostics keep the fallback and never turn success or stop into failure',()=>{
  const failed={type:'result',subtype:'error_during_execution',is_error:true};
  for(const errors of [undefined,[],['',' '],[{message:'not an explicit string'}]])assert.deepEqual(qoderResultOutcome({...failed,errors}),{status:'failed',diagnostic:'qoder_turn_failed'});
  const errors=['unused failure text'];
  assert.deepEqual(qoderResultOutcome({type:'result',subtype:'success',is_error:false,errors}),{status:'completed'});
  assert.deepEqual(qoderResultOutcome({...failed,errors},true),{status:'stopped'});
  for(const terminal_reason of ['aborted','aborted_tools'])assert.deepEqual(qoderResultOutcome({...failed,errors,terminal_reason}),{status:'stopped'});
});

test('DSH flat user event maps request identity to all corresponding turn items', () => {
  const items = dshHistoryItems([
    { type: 'turn/start', seq: 1, data: { turn: 7 } },
    { type: 'user/message', seq: 2, data: { id: 'u-native', content: [{ type: 'text', text: '同样的问题' }], source: { kind: 'user', rpcId: 'client-exact' } } },
    { type: 'request/context', seq: 3, data: { secret: 'hidden reasoning and credentials' } },
    { type: 'assistant/message', seq: 4, data: { turn: 7, step: 1, message: { content: [{ type: 'reasoning', text: 'hidden' }, { type: 'text', text: '完成' }] } } },
    { type: 'tool/call', seq: 5, data: { turn: 7, callId: 'tool-native', name: 'read', arguments: '{}' } },
    { type: 'tool/result', seq: 6, data: { turn: 7, message: { toolCallId: 'tool-native', content: [{ type: 'text', text: '文件结果' }] } } },
  ]);
  assert.equal(items.length, 3); assert.equal(items[0].id, 'u-native'); assert.equal(items[0].executionId, 'client-exact');
  assert.equal(items[1].id, 'assistant:7:1'); assert.equal(items[1].executionId, 'client-exact'); assert.equal(items[2].status, 'completed');
  assert.equal(items[2].name, 'read'); assert.equal(items[2].input, '{}');
  assert.ok(!JSON.stringify(items).includes('hidden'));
});
test('Qoder durable snapshots collapse by native message ID, preserving exact user UUIDs', () => {
  const messages = [
    { type: 'user', uuid: 'request-1', session_id: 'session-a', parent_tool_use_id: null, message: { content: [{ type: 'text', text: '继续' }] } },
    { type: 'assistant', uuid: 'snapshot-1', session_id: 'session-a', message: { id: 'message-a', content: [{ type: 'text', text: '正在' }] } },
    { type: 'assistant', uuid: 'snapshot-2', session_id: 'session-a', message: { id: 'message-a', content: [{ type: 'text', text: '正在完成' }, { type: 'tool_use', id: 'tool-a', name: 'Read', input: { path: '/file' } }] } },
    { type: 'user', uuid: 'tool-result', session_id: 'session-a', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-a', content: '读完' }] } },
    { type: 'user', uuid: 'request-2', session_id: 'session-a', message: { content: [{ type: 'text', text: '继续' }] } },
  ];
  const items = qoderHistoryItems(messages, 'session-a');
  assert.equal(items.length, 4); assert.equal(items[1].id, 'message:message-a'); assert.equal(items[1].text, '正在完成');
  assert.equal(items[1].executionId, 'request-1'); assert.equal(items[2].status, 'completed');
  assert.equal(items[2].name, 'Read'); assert.equal(items[2].input, JSON.stringify({path:'/file'}));
  assert.equal(items[3].id, 'request-2'); assert.equal(items[3].executionId, 'request-2');
  assert.throws(() => qoderHistoryItems(messages, 'different-session'), /identity_mismatch/);
});

test('DSH cold stop observation cannot borrow another completed turn as success', async () => {
  const { dshExecutionObservation } = await import('../../src/executors/dsh/protocol.ts');
  const events = [
    { type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', data: { source: { rpcId: 'old' } } }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } }, { type: 'user/message', data: { source: { rpcId: 'current' } } }, { type: 'tool/call', data: { turn: 2, callId: 'tool-2', name: 'bash' } },
  ];
  assert.equal(dshExecutionObservation(events, 'current').status, 'unknown');
  assert.equal(dshExecutionObservation(events, 'missing').status, 'unknown');
  events.push({ type: 'tool/result', data: { turn: 2, message: { toolCallId: 'tool-2' } } } as any, { type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted' } } } as any);
  assert.equal(dshExecutionObservation(events, 'current').status, 'stopped');
});
