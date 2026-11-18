import test from 'node:test';
import assert from 'node:assert/strict';
import { dshFinishedTurnStatus, withoutDshContinuationMarkers } from '../../src/executors/dsh/protocol.ts';

test('合成标记不参与结束状态：运行中优先，正常结束为 idle，停止为 stopped', () => {
  assert.equal(dshFinishedTurnStatus([{ status: 'running' }], false), 'tools-active');
  assert.equal(dshFinishedTurnStatus([{ status: 'completed' }], false), 'idle');
  assert.equal(dshFinishedTurnStatus([{ status: 'completed' }], true), 'stopped');
  assert.equal(dshFinishedTurnStatus([{ status: 'unknown' }], false), 'unknown');
});

test('结束投影只排除合成接续标记，真实工具原样保留', () => {
  assert.deepEqual(withoutDshContinuationMarkers([{ id: 'call-1' }, { id: 'dsh-continuation:req-1' }]), [{ id: 'call-1' }]);
  assert.deepEqual(withoutDshContinuationMarkers([{ id: 'dsh-continuation:req-1' }]), []);
});
