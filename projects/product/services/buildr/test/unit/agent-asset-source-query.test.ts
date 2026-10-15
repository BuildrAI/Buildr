import assert from 'node:assert/strict';
import test from 'node:test';
import { boundSourceResult, parseObservation, parseSourceInput, sourceMemberIdentity, SOURCE_OBSERVATIONS_SCHEMA, SOURCE_RESULT_SCHEMA, SOURCE_LIMITS, type SourceResult } from '../../src/modules/agent-assets/domain/source-observations.ts';

test('source input is versioned, closed and bounded without reading any locator', () => {
 assert.deepEqual(parseSourceInput({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [] }), { scope: '.', observations: [], mode: 'content' });
 assert.equal(parseSourceInput({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [], mode: 'metadata' }).mode, 'metadata');
 assert.throws(() => parseSourceInput({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [], mode: 'unexpected' }));
 assert.throws(() => parseSourceInput({ schemaVersion: 'other', observations: [] }));
 assert.throws(() => parseSourceInput({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [], extra: true }));
 assert.throws(() => parseSourceInput({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: Array(SOURCE_LIMITS.items + 1).fill({}) }));
});
test('observations preserve actual locator and historical body independently of name/provider', () => {
 const input = { id: 'same-name', type: 'skill', locator: { path: '/explicit/actual/SKILL.md', resourceBase: '/explicit/actual', provider: 'external' }, observedContent: '你好' };
 assert.deepEqual(parseObservation(input), input);
 assert.throws(() => parseObservation({ ...input, observedDigest: 'sha256-short' }));
 assert.throws(() => parseObservation({ ...input, observedContent: 'x'.repeat(SOURCE_LIMITS.textBytes + 1) }));
 assert.throws(() => parseObservation({ ...input, extra: true }));
});
test('member identity is stable data and never depends on digest or workspace path', () => {
 assert.equal(sourceMemberIdentity('asset:review', 'SKILL.md'), 'asset:review');
 assert.equal(sourceMemberIdentity('asset:review', 'references/rule.md'), 'asset:review:member:references/rule.md');
 assert.notEqual(sourceMemberIdentity('asset:review', 'SKILL.md'), sourceMemberIdentity('asset:review', 'references/rule.md'));
});
test('complete output cap counts UTF-8, wrappers and final newline', () => {
 const result: SourceResult = { schemaVersion: SOURCE_RESULT_SCHEMA, workspace: { id: 'id', scope: '.' }, effects: [], items: [{ id: '你好', status: 'detected', diagnostic: null, objects: [{ identity: 'asset', kind: 'skill', workspaceId: 'id', scope: '.', providedBy: 'workspace', managedBy: 'buildr', selector: { skillId: 'review' }, current: { content: '你好'.repeat(80), digest: 'sha256-current' }, observed: {}, historical: 'unknown', evidence: [] }] }] };
 const exact = Buffer.byteLength(JSON.stringify(result)) + 1;
 assert.deepEqual(boundSourceResult(result, exact), result);
 const limited = boundSourceResult(result, exact - 1);
 assert.equal(limited.items[0].status, 'error'); assert.ok(Buffer.byteLength(JSON.stringify(limited)) + 1 <= exact - 1);
 assert.throws(() => boundSourceResult(result, 1));
});
