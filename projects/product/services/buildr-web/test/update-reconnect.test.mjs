import assert from 'node:assert/strict';
import test from 'node:test';

const { observesInstalledJob, reconnectTrigger } = await import('../src/features/installation/lib/update-reconnect.ts');

test('安装中的任务重新武装重启预期；未安装与模拟任务不武装', () => {
  for (const status of ['applying', 'partial', 'completed']) {
    assert.equal(observesInstalledJob({ installedVersion: '0.2.0', status }), true, status);
  }
  assert.equal(observesInstalledJob({ installedVersion: null, status: 'applying' }), false);
  assert.equal(observesInstalledJob({ installedVersion: '0.2.0', status: 'ready' }), false);
  assert.equal(observesInstalledJob({ installedVersion: '0.2.0', status: 'completed', simulated: true }), false);
});

test('旧后端仍在应答进入令牌观察；新后端应答做单次核对', () => {
  assert.equal(reconnectTrigger({ installedVersion: '0.2.0', status: 'partial', runningVersion: '0.1.0', version: '0.2.0' }), 'watch');
  // 交接顺利时轮询直接命中新后端：仍须核对页面令牌，否则旧页面永不刷新。
  assert.equal(reconnectTrigger({ installedVersion: '0.2.0', status: 'completed', runningVersion: '0.2.0', version: '0.2.0' }), 'confirm-current');
  assert.equal(reconnectTrigger({ installedVersion: '0.2.0', status: 'partial', runningVersion: '0.2.0', version: '0.2.0' }), 'confirm-current');
});

test('未安装完成、进行中和模拟任务不触发重连', () => {
  assert.equal(reconnectTrigger({ installedVersion: null, status: 'partial', runningVersion: '0.1.0', version: '0.2.0' }), 'none');
  assert.equal(reconnectTrigger({ installedVersion: '0.2.0', status: 'applying', runningVersion: '0.1.0', version: '0.2.0' }), 'none');
  assert.equal(reconnectTrigger({ installedVersion: '0.2.0', status: 'failed', runningVersion: '0.1.0', version: '0.2.0' }), 'none');
  assert.equal(reconnectTrigger({ installedVersion: '0.2.0', status: 'completed', runningVersion: '0.1.0', version: '0.2.0', simulated: true }), 'none');
});
