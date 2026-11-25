import assert from 'node:assert/strict';
import test from 'node:test';
import { canShowOverlay, createOverlayDelay, createMouseMoveIntent } from '../../src/lib/overlay-intent.ts';

test('只有新的鼠标移动可触发悬停，静止命中、拖动和触屏不能触发', () => {
  const moved = createMouseMoveIntent();
  const first = { pointerType: 'mouse', buttons: 0, clientX: 10, clientY: 10, movementX: 0, movementY: 0 };
  assert.equal(moved(first), true);
  assert.equal(moved(first), false);
  assert.equal(moved({ ...first, movementX: 5 }), true);
  assert.equal(moved({ ...first, clientX: 12, buttons: 1 }), false);
  assert.equal(moved({ ...first, clientX: 12 }), false);
  assert.equal(moved({ ...first, clientX: 15, pointerType: 'touch' }), false);
  assert.equal(moved({ ...first, clientX: 15 }), true);
});

test('标签页隐藏或窗口未取得焦点时不会显示提示', () => {
  assert.equal(canShowOverlay({ hidden: true, hasFocus: () => true }), false);
  assert.equal(canShowOverlay({ hidden: false, hasFocus: () => false }), false);
  assert.equal(canShowOverlay({ hidden: false, hasFocus: () => true }), true);
});

test('取消待显示提示后不会在恢复时补弹，新停留仍能触发', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dwell = createOverlayDelay();
  const calls = [];
  dwell.start(350, () => calls.push('stale'));
  t.mock.timers.tick(200);
  dwell.cancel();
  t.mock.timers.tick(350);
  assert.deepEqual(calls, []);
  dwell.start(350, () => calls.push('fresh'));
  t.mock.timers.tick(250);
  dwell.start(350, () => calls.push('repeat'));
  t.mock.timers.tick(100);
  assert.deepEqual(calls, ['fresh']);
});
