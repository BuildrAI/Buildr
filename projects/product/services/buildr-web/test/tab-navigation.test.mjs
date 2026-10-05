import assert from 'node:assert/strict';
import test from 'node:test';
import { tabFocusTarget, tabAfterClose, tabElementId, tabPanelId } from '../src/lib/tab-navigation.ts';

test('manual tab focus wraps, reaches endpoints and leaves unrelated keys alone', () => {
  const keys = ['a', 'b', 'c'];
  assert.equal(tabFocusTarget(keys, 'a', 'ArrowLeft'), 'c');
  assert.equal(tabFocusTarget(keys, 'c', 'ArrowRight'), 'a');
  assert.equal(tabFocusTarget(keys, 'b', 'Home'), 'a');
  assert.equal(tabFocusTarget(keys, 'b', 'End'), 'c');
  for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ']) assert.equal(tabFocusTarget(keys, 'b', key), null);
  assert.equal(tabFocusTarget([], 'a', 'Home'), null);
});

test('closing focuses the next tab or previous last tab and distinguishes the final close', () => {
  assert.equal(tabAfterClose(['a', 'b', 'c'], 'b'), 'c');
  assert.equal(tabAfterClose(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(tabAfterClose(['a'], 'a'), null);
  assert.equal(tabAfterClose(['a'], 'missing'), null);
});

test('tab and panel identities remain distinct for paths and object keys', () => {
  assert.notEqual(tabPanelId('w', '/projects/a'), tabPanelId('w', '/knowledge/project/a'));
  assert.notEqual(tabElementId('w', 'a/b'), tabElementId('w', 'a%2Fb'));
  assert.notEqual(tabElementId('w1', 'a'), tabElementId('w2', 'a'));
});
