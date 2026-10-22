import assert from 'node:assert/strict';
import test from 'node:test';
import { tabFocusTarget, tabAfterClose, tabElementId, tabPanelId, activateTabKey, tabsInOrder } from '../src/lib/tab-navigation.ts';

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

test('activation promotes only its own identity and keeps the remaining order stable across owners', () => {
  const a={key:'page-A:doc'}, b={key:'page-A:service'}, c={key:'page-A:change'}, other={key:'page-B:doc'};
  let order=activateTabKey([],a.key);
  order=activateTabKey(order,b.key);
  order=activateTabKey(order,other.key);
  order=activateTabKey(order,c.key);
  assert.deepEqual(tabsInOrder([a,b,c],order),[c,b,a]);
  assert.deepEqual(tabsInOrder([other],order),[other]);
  order=activateTabKey(order,a.key);
  assert.deepEqual(tabsInOrder([a,b,c],order),[a,c,b]);
  assert.equal(activateTabKey(order,a.key),order,'repeating the active choice does not churn order state');
  assert.deepEqual(tabsInOrder([b,c],order),[c,b],'closed keys cannot resurrect a tab');
  const fresh={key:'page-A:new'};
  assert.deepEqual(tabsInOrder([a,b,c,fresh],activateTabKey(order,fresh.key)),[fresh,a,c,b]);
  assert.equal(tabsInOrder([a,b,c],order)[0],a,'the content objects retain their identity');
});
