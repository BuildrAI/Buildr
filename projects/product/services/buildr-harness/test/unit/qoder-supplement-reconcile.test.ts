import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileUnknownSupplements, qoderUserEchoIds } from '../../src/executors/qoder/protocol.ts';

test('without native evidence every unknown supplement stays protected', () => {
  assert.deepEqual(reconcileUnknownSupplements(['a', 'b'], {}), new Set(['a', 'b']));
  assert.deepEqual(reconcileUnknownSupplements(['a'], { delivered: [], discarded: [] }), new Set(['a']));
});

test('a delivered user echo resolves only that supplement', () => {
  assert.deepEqual(reconcileUnknownSupplements(['a', 'b'], { delivered: ['a'] }), new Set(['b']));
});

test('a confirmed native queue removal resolves only that supplement', () => {
  assert.deepEqual(reconcileUnknownSupplements(['a', 'b'], { discarded: ['b'] }), new Set(['a']));
});

test('delivered and discarded evidence together clear their inputs and leave the rest unknown', () => {
  assert.deepEqual(reconcileUnknownSupplements(['a', 'b', 'c'], { delivered: ['a'], discarded: ['b'] }), new Set(['c']));
});

test('a fully resolved set unblocks the next send', () => {
  assert.deepEqual(reconcileUnknownSupplements(['a'], { discarded: ['a'] }), new Set());
  assert.deepEqual(reconcileUnknownSupplements([], { discarded: ['a'] }), new Set());
});

test('evidence about unrelated inputs never adds new unknowns', () => {
  assert.deepEqual(reconcileUnknownSupplements(['a'], { delivered: ['x'], discarded: ['y'] }), new Set(['a']));
});

test('the input set is not mutated', () => {
  const unknown = new Set(['a', 'b']);
  reconcileUnknownSupplements(unknown, { discarded: ['a'] });
  assert.deepEqual(unknown, new Set(['a', 'b']));
});

test('only primary-thread user echoes count as delivery proof', () => {
  const messages = [
    { type: 'user', uuid: 'a', message: { content: [{ type: 'text', text: 'hi' }] } },
    { type: 'user', uuid: 'b', message: { content: [{ type: 'image', source: {} }] } },
    { type: 'user', uuid: 'c', message: { content: [{ type: 'tool_result', tool_use_id: 't' }] } },
    { type: 'user', uuid: 'd', parent_tool_use_id: 'p', message: { content: [{ type: 'text', text: 'sub' }] } },
    { type: 'user', uuid: 'e', message: { content: [{ type: 'text', text: '   ' }] } },
    { type: 'system', subtype: 'queued_command', uuid: 'f' },
    { type: 'assistant', uuid: 'g', message: { content: [{ type: 'text', text: 'reply' }] } },
  ];
  assert.deepEqual(qoderUserEchoIds(messages), new Set(['a', 'b']));
});

test('dead-process settlement keeps delivered inputs proven and discards the rest', () => {
  const unknown = new Set(['a', 'b']);
  const delivered = qoderUserEchoIds([{ type: 'user', uuid: 'a', message: { content: [{ type: 'text', text: 'hi' }] } }]);
  const discarded = reconcileUnknownSupplements(unknown, { delivered });
  assert.deepEqual(discarded, new Set(['b']));
  assert.deepEqual(reconcileUnknownSupplements(unknown, { delivered, discarded }), new Set());
});
