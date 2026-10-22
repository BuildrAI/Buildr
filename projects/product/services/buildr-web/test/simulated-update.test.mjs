import assert from 'node:assert/strict';
import test from 'node:test';

const { simulatedTargetVersion } = await import('../src/features/installation/lib/simulated-update.ts');

test('开发模拟更新目标：提升版本号末尾数字段，不触碰 registry', () => {
  assert.equal(simulatedTargetVersion('1.2.3'), '1.2.4');
  assert.equal(simulatedTargetVersion('0.1.0-rc.47'), '0.1.0-rc.48');
  assert.equal(simulatedTargetVersion('2.0.0-next.9'), '2.0.0-next.10');
  assert.equal(simulatedTargetVersion('0.0.9'), '0.0.10');
});

test('开发模拟更新目标：无数字段或空版本返回 null', () => {
  assert.equal(simulatedTargetVersion(''), null);
  assert.equal(simulatedTargetVersion(null), null);
  assert.equal(simulatedTargetVersion(undefined), null);
  assert.equal(simulatedTargetVersion('dev'), null);
});
