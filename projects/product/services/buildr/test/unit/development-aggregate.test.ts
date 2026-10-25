import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateDevelopmentEvidence } from '../verification/development-aggregate.ts';

const sourceCommit = 'a'.repeat(40), comparisonBase = 'b'.repeat(40);
const options = { sourceCommit, comparisonBase, jobResults: { macos: 'success', windows: 'success' } };

function check(id: string, type: string, status: string, platform: string, requiredPlatforms: string[] = []) {
  return { id, type, target: 'source', status, requiredPlatforms, availability: status === 'unavailable' ? 'unavailable' : 'ready',
    proofPlatform: status === 'passed' ? platform : null, exitCode: status === 'passed' ? 0 : null, disposition: status === 'passed' ? 'executed' : 'not-run' };
}

function evidence(runId: string, platform: string, mode: string, selection: string, selected: any[], gaps: any[] = []) {
  return { schemaVersion: 'buildr.verification-timing/v1', run: { id: runId }, source: { head: sourceCommit, dirty: false }, environment: { platform },
    coverage: { mode, selection, target: 'source', base: selection === 'explicit' ? null : comparisonBase, selected, gaps,
      conclusion: gaps.length ? 'incomplete' : 'passed', targetExclusions: [{ id: 'application-payload-release', type: 'E2E', target: 'artifact' }] },
    steps: selected.filter(item => item.status !== 'unavailable').map(item => ({ id: item.id, status: item.status, exitCode: item.status === 'passed' ? 0 : 1 })) };
}

function fixture() {
  const full = evidence('mac-check', 'darwin', 'check', 'full', [check('types', 'Static', 'passed', 'darwin')]);
  const related = evidence('mac-related', 'darwin', 'related', 'related-plus-explicit', [
    check('internal', 'Unit', 'passed', 'darwin'), check('windows-native', 'Integration', 'unavailable', '', ['win32']),
  ], [{ code: 'different-platform-required', checkId: 'windows-native', platforms: ['windows'] }]);
  const windows = evidence('win-related', 'win32', 'related', 'explicit', [check('windows-native', 'Integration', 'passed', 'win32', ['win32'])]);
  return { full, related, windows, all: [full, related, windows] };
}

test('actual Windows proof completes a macOS platform handoff without rewriting original conclusions', () => {
  const f = fixture(), before = structuredClone(f.all);
  const result = aggregateDevelopmentEvidence(f.all, options);
  assert.equal(result.conclusion, 'passed');
  assert.equal(result.checks.find(item => item.id === 'windows-native')!.proofs[0].platform, 'win32');
  assert.equal(result.originalConclusions.find(item => item.runId === 'mac-related')!.conclusion, 'incomplete');
  assert.deepEqual(f.all, before);
  assert.deepEqual(result.targetExclusions.map(item => item.id), ['application-payload-release']);
});

test('a missing native proof or an execution on the wrong platform cannot complete the handoff', () => {
  const f = fixture();
  assert.equal(aggregateDevelopmentEvidence([f.full, f.related], options).conclusion, 'incomplete');
  f.windows.coverage.selected[0].proofPlatform = 'darwin';
  const result = aggregateDevelopmentEvidence(f.all, options);
  assert.equal(result.conclusion, 'incomplete');
  assert.ok(result.gaps.some(item => item.code === 'passed-proof-invalid'));
  assert.ok(result.gaps.some(item => item.code === 'platform-proof-missing'));
});

test('an actual failure remains a failure even if another machine passed the same check', () => {
  const f = fixture();
  f.related.coverage.selected[0].status = 'failed'; f.related.steps[0].status = 'failed'; f.related.steps[0].exitCode = 1;
  const laterSuccess = evidence('win-repeat', 'win32', 'related', 'explicit', [check('internal', 'Unit', 'passed', 'win32')]);
  const result = aggregateDevelopmentEvidence([...f.all, laterSuccess], options);
  assert.equal(result.conclusion, 'not-passed');
  assert.ok(result.failures.some(item => item.checkId === 'internal'));
});

test('SDK and other nonplatform gaps cannot be waived by a successful record elsewhere', () => {
  const f = fixture();
  f.full.coverage.gaps.push({ code: 'required-environment-missing', checkId: 'types', variable: 'EXACT_SDK' });
  const other = evidence('win-types', 'win32', 'related', 'explicit', [check('types', 'Static', 'passed', 'win32')]);
  const result = aggregateDevelopmentEvidence([...f.all, other], options);
  assert.equal(result.conclusion, 'incomplete');
  assert.ok(result.gaps.some(item => item.code === 'required-environment-missing'));
});

test('source, comparison and actual execution evidence are all required', () => {
  const stale = fixture(); stale.windows.source.head = 'c'.repeat(40);
  assert.equal(aggregateDevelopmentEvidence(stale.all, options).conclusion, 'incomplete');
  const wrongBase = fixture(); wrongBase.related.coverage.base = 'd'.repeat(40);
  assert.equal(aggregateDevelopmentEvidence(wrongBase.all, options).conclusion, 'incomplete');
  const dirty = fixture(); dirty.full.source.dirty = true;
  assert.equal(aggregateDevelopmentEvidence(dirty.all, options).conclusion, 'incomplete');
  const omitted = fixture(); omitted.full.steps = [];
  assert.equal(aggregateDevelopmentEvidence(omitted.all, options).conclusion, 'incomplete');
});

test('producer failure and missing complete source or task selections are not hidden', () => {
  const f = fixture();
  assert.equal(aggregateDevelopmentEvidence(f.all, { ...options, jobResults: { macos: 'failure', windows: 'success' } }).conclusion, 'incomplete');
  assert.equal(aggregateDevelopmentEvidence([f.related, f.windows], options).conclusion, 'incomplete');
  assert.equal(aggregateDevelopmentEvidence([f.full, f.windows], options).conclusion, 'incomplete');
});
