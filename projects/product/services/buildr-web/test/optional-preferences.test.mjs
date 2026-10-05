import assert from 'node:assert/strict';
import test from 'node:test';
import { readOptionalPreference, writeOptionalPreference } from '../src/lib/optional-preferences.ts';

test('denied optional storage access, reads and writes retain the fallback path', () => {
  const denied = () => { throw new Error('storage denied'); };
  const failing = () => ({ getItem() { throw new Error('read denied'); }, setItem() { throw new Error('write denied'); } });
  for (const storage of [denied, failing]) {
    assert.equal(readOptionalPreference('sidebar', storage), null);
    assert.doesNotThrow(() => writeOptionalPreference('sidebar', '256', storage));
  }
  const values = new Map();
  const available = () => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  writeOptionalPreference('sidebar', '200', available);
  assert.equal(readOptionalPreference('sidebar', available), '200');
});
