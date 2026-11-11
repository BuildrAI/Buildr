import test from 'node:test';
import assert from 'node:assert/strict';
import { dshExecutionObservation } from '../../src/executors/dsh/protocol.ts';

/** 一条较老的 DSH tool-jobs 通知缺少 jobId，会让追踪器保留一个归属不明的接续标记。 */
function eventsWithUncertainContinuation(end: boolean) {
  return [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { turn: 1, source: { kind: 'user', rpcId: 'req-1' } } },
    { type: 'job/registered', data: { turn: 1, jobId: 'job-1' } },
    { type: 'job/settled', data: { turn: 1, jobId: 'job-1' } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'user/message', data: { turn: 2, source: { kind: 'tool-jobs' } } },
    { type: 'user/message', data: { turn: 2, source: { kind: 'user', rpcId: 'req-1' } } },
    { type: 'tool/call', data: { turn: 2, callId: 'call-1', name: 'bash' } },
    { type: 'tool/result', data: { turn: 2, message: { toolCallId: 'call-1' } } },
    ...(end ? [{ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } }] : []),
  ];
}

test('已结束的轮次不再因为归属不明的接续标记被判定为未知', () => {
  const observation = dshExecutionObservation(eventsWithUncertainContinuation(true), 'req-1');
  assert.equal(observation.status, 'idle');
  assert.equal(observation.tools.some(tool => tool.id.startsWith('dsh-continuation:')), false);
  assert.equal(observation.tools.find(tool => tool.id === 'call-1')?.status, 'completed');
});

test('尚未结束的轮次仍保留接续标记并保持未知，避免把在途工作当作完成', () => {
  const observation = dshExecutionObservation(eventsWithUncertainContinuation(false), 'req-1');
  assert.equal(observation.status, 'unknown');
  assert.equal(observation.tools.some(tool => tool.id.startsWith('dsh-continuation:')), true);
});

test('真实的未知工具仍判为未知，结束状态只排除合成标记', () => {
  const observation = dshExecutionObservation([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { turn: 1, source: { kind: 'user', rpcId: 'req-1' } } },
    { type: 'tool/call', data: { turn: 1, callId: 'call-1', name: 'bash' } },
    { type: 'tool/result', data: { turn: 1, error: { code: 'TOOL_OUTCOME_UNKNOWN' }, message: { toolCallId: 'call-1' } } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ], 'req-1');
  assert.equal(observation.status, 'unknown');
  assert.equal(observation.tools.find(tool => tool.id === 'call-1')?.status, 'unknown');
});
