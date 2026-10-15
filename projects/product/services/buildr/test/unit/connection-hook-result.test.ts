import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHookOutput } from '../../src/modules/connection-skills/domain/hook-result.ts';
test('connection hooks preserve unknown and only render bounded option data', () => {
  const result = normalizeHookOutput({ status: 'unknown', diagnostics: ['Pending observation'], options: Array.from({ length: 1001 }, (_, index) => ({ value: String(index), label: 'Name' })), arbitraryHtml: '<script>bad</script>' });
  assert.equal(result.status, 'unknown'); assert.equal(result.truncated, true); assert.equal((result.options as unknown[]).length, 1000); assert.equal(result.arbitraryHtml, undefined);
  assert.throws(() => normalizeHookOutput({ status: 'success', options: [{ value: 'id', label: { html: 'x' } }] }));
  assert.throws(() => normalizeHookOutput({ status: 'success', warnings: 'not-an-array' }));
  for (const value of [42, false, NaN, Infinity]) assert.throws(() => normalizeHookOutput({ status: 'success', options: [{ value, label: '编号' }] }), { code: 'connection_skill_hook_result_invalid' });
});
