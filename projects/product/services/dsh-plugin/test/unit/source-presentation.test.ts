import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceObjects, sourceDiagnosticKey, sourceDiagnosticGroup, sourceResultDiagnostics, isBuildrMethod, sourceObjectName, isBuildrRecord, sourceOutcomeKey } from '../../plugin/src/source-presentation.ts';
import type { SourceObject, SourceQueryResult } from '../../plugin/src/source-types.ts';
const object:SourceObject={identity:'asset-rule',kind:'rule',workspaceId:'workspace',scope:'.',providedBy:'external',managedBy:'buildr',selector:{b:2,a:'one'},current:{content:'now',digest:`sha256-${'a'.repeat(64)}`},observed:{content:'then'},historical:'different',evidence:[{authority:'manifest',locator:'AGENTS.md'}],selection:{startOffset:2,endOffset:12,unit:'utf16'}};
const result=(objects:SourceObject[]):SourceQueryResult=>({schemaVersion:'buildr.agent-asset-source-result/v1',workspace:{id:'workspace',scope:'.'},items:objects.map((object,index)=>({id:'observation-'+index,status:'detected',objects:[object],diagnostic:null})),effects:[]});
test('a successful unknown response from the real source contract is not a read fault', () => {
 const query = result([]); query.items.push({ id: 'ordinary-file', status: 'unknown', objects: [], diagnostic: { code: 'source_not_proven', message: 'not a Buildr asset' } });
 assert.equal(sourceDiagnosticKey('source_not_proven'), 'sourceNotProven');
 assert.equal(sourceDiagnosticGroup('source_not_proven'), 'none');
 assert.deepEqual(sourceResultDiagnostics({ ready: true, recordId: 'ordinary', result: query }), []);
 assert.equal(sourceDiagnosticKey('source_receipt_conflict'), 'sourceEvidenceConflict');
 assert.equal(sourceDiagnosticGroup('source_receipt_conflict'), 'evidence');
});
test('Buildr method participation excludes managed user brief and material bodies', () => {
 assert.equal(isBuildrMethod(object), false);
 assert.equal(isBuildrMethod({ ...object, providedBy: 'buildr' }), true);
 assert.equal(isBuildrMethod({ ...object, kind: 'task-brief', providedBy: 'workspace' }), false);
 assert.equal(isBuildrMethod({ ...object, kind: 'task-material', providedBy: 'workspace' }), false);
 assert.equal(isBuildrMethod({ ...object, providedBy: 'external', managedBy: null }), false);
 assert.equal(sourceObjectName({ ...object, kind: 'rule', identity: 'workspace:uuid:managed-block:buildr:required', selector: {} }), 'Buildr 核心规则');
 assert.equal(sourceObjectName({ ...object, kind: 'skill', selector: { skillId: 'task-review' } }), 'task-review');
});
test('identical object versions combine unique evidence without overwriting provider or original data',()=>{const a=result([object,{...object,evidence:[{authority:'receipt',locator:'receipt.json'}]}]);const values=sourceObjects(a);assert.equal(values.length,1);assert.equal(values[0]!.object.evidence.length,2);assert.equal(object.evidence.length,1);assert.equal(values[0]!.object.providedBy,'external');assert.equal(values[0]!.object.managedBy,'buildr');});
test('different observed text, current digest and fragment boundaries retain separate stable selectors',()=>{const values=sourceObjects(result([object,{...object,observed:{content:'another historical version'}},{...object,selection:{startOffset:3,endOffset:12,unit:'utf16'}},{...object,current:{content:'changed',digest:`sha256-${'b'.repeat(64)}`}}]));assert.equal(values.length,4);assert.equal(new Set(values.map(value=>value.key)).size,4);});
test('object presentation keys do not depend on observation order or selector insertion order',()=>{const a=sourceObjects(result([object]))[0]!.key,b=sourceObjects(result([{...object,selector:{a:'one',b:2}}]))[0]!.key;assert.equal(a,b);});
test('recorded completeness keeps a partial method and a body-free observation distinct', () => {
 const values = sourceObjects(result([{ ...object, capturedCompleteness: 'partial' }, { ...object, capturedCompleteness: 'none' }])); assert.equal(values.length, 2); assert.notEqual(values[0]!.key, values[1]!.key);
});
test('missing source and skill evidence remain distinct from read service faults',()=>{assert.equal(sourceDiagnosticKey('source-locator-missing'),'sourceEvidenceMissing');assert.equal(sourceDiagnosticKey('source-skill-locator-missing'),'sourceSkillEvidenceMissing');assert.equal(sourceDiagnosticKey('source-history-unproven'),'sourceHistoricalUnknown');assert.equal(sourceDiagnosticKey('source-no-durable-record'),'sourceTransient');assert.equal(sourceDiagnosticKey('transport-internal-code'),'sourceUnavailable');});
test('no-asset and transient statuses are omitted from limitation and error groups', () => {
 assert.equal(sourceDiagnosticKey('source-not-applicable'), 'sourceNotApplicable');
 assert.equal(sourceDiagnosticGroup('source-not-applicable'), 'none');
 assert.equal(sourceDiagnosticGroup('source-no-durable-record'), 'pending');
 assert.deepEqual(sourceResultDiagnostics({ ready: false, code: 'source-not-applicable', message: 'private' }), []);
 assert.deepEqual(sourceResultDiagnostics({ ready: false, code: 'source-no-durable-event', message: 'private' }), []);
});
test('actual missing asset evidence and true read failures stay in distinct visible groups', () => {
 assert.deepEqual(sourceResultDiagnostics({ ready: false, code: 'source-skill-locator-missing', message: 'private path' }), [{ code: 'source-skill-locator-missing', group: 'evidence' }]);
 assert.deepEqual(sourceResultDiagnostics({ ready: false, code: 'source-transport-failed', message: 'internal JSON' }), [{ code: 'source-transport-failed', group: 'error' }]);
 const query = result([object]);
 query.items.push({ id: 'failure', status: 'error', objects: [], diagnostic: { code: 'io-failure', message: 'sensitive full error' } }, { id: 'unlabelled-failure', status: 'error', objects: [], diagnostic: null }, { id: 'conflicting', status: 'conflict', objects: [], diagnostic: null });
 const diagnostics = sourceResultDiagnostics({ ready: true, recordId: 'internal-id', result: query, diagnostics: [{ code: 'source-history-unproven', message: 'private' }, { code: 'source-history-unproven', message: 'duplicate' }, { code: 'source-not-applicable', message: '' }] });
 assert.deepEqual(diagnostics, [{ code: 'source-history-unproven', group: 'evidence' }, { code: 'io-failure', group: 'error' }, { code: 'source-query-failed', group: 'error' }, { code: 'source-query-conflict', group: 'error' }]);
 assert.equal(JSON.stringify(diagnostics).includes('private'), false); assert.equal(JSON.stringify(diagnostics).includes('internal-id'), false);
});
test('an explicit item error is still shown when its evidence diagnostic alone is not a fault', () => {
 const query = result([]); query.items.push({ id: 'actual-error', status: 'error', objects: [], diagnostic: { code: 'source-history-unproven', message: '' } });
 assert.deepEqual(sourceResultDiagnostics({ ready: true, recordId: 'record', result: query }), [{ code: 'source-history-unproven', group: 'evidence' }, { code: 'source-query-failed', group: 'error' }]);
});

test('only a recorded source mark confirms a Buildr record; current ownership and versions never do', () => {
 const current = { ...object, providedBy: 'buildr' as const };
 assert.equal(isBuildrRecord({ ready: true, recordId: 'current', result: result([current]) }), false);
 assert.equal(isBuildrRecord({ ready: true, recordId: 'current', result: result([current]), marker: { status: 'confirmed', basis: 'current-buildr-object' } }), false);
 assert.equal(isBuildrRecord({ ready: true, recordId: 'recorded', result: result([current]), marker: { status: 'confirmed', basis: 'recorded-source' } }), true);
 assert.equal(isBuildrRecord({ ready: false, code: 'failed', message: '', marker: { status: 'unknown' }, participation: [{ kind: 'capability-call', title: 'Buildr named command', source: 'bound-buildr-entry', outcome: 'failed', eventRefs: [] }] }), false);
});
test('uncaptured, invalid metadata and content failures remain distinct', () => {
 assert.equal(sourceDiagnosticKey('source-not-captured'), 'sourceNotCaptured'); assert.equal(sourceDiagnosticGroup('source-not-captured'), 'none');
 assert.equal(sourceDiagnosticKey('source-metadata-invalid'), 'sourceMetadataInvalid'); assert.equal(sourceDiagnosticGroup('source-metadata-invalid'), 'evidence');
 assert.equal(sourceDiagnosticKey('source-content-unavailable'), 'sourceContentUnavailable'); assert.equal(sourceDiagnosticGroup('source-content-unavailable'), 'error');
});
test('immutable result presentation reuses parsed versions while a new body result keeps its own identity', () => {
 const saved = result([object]); assert.equal(sourceObjects(saved), sourceObjects(saved));
 const changed = result([{ ...object, observed: { content: 'a new captured fragment' } }]);
 assert.notEqual(sourceObjects(changed), sourceObjects(saved)); assert.notEqual(sourceObjects(changed)[0]!.key, sourceObjects(saved)[0]!.key);
});
test('result labels describe loading, reading, removal and actual execution without claiming adoption', () => {
 assert.equal(sourceOutcomeKey({ kind: 'rule-load', action: 'load', outcome: 'succeeded' }), 'sourceLoadedOutcome');
 assert.equal(sourceOutcomeKey({ kind: 'content-read', action: 'read', outcome: 'succeeded' }), 'sourceReadOutcome');
 assert.equal(sourceOutcomeKey({ kind: 'rule-load', action: 'remove', outcome: 'succeeded' }), 'sourceRemovedOutcome');
 assert.equal(sourceOutcomeKey({ kind: 'capability-call', action: 'call', outcome: 'failed' }), 'sourceExecutionFailed');
 assert.equal(sourceOutcomeKey({ kind: 'capability-call', action: 'call', outcome: 'succeeded' }), 'sourceExecutionSucceeded');
 assert.equal(sourceOutcomeKey(undefined), 'sourceOutcomeUnknown');
});
