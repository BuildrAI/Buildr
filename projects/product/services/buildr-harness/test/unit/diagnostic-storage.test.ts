import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnosticUnreferenced } from '../../src/storage/diagnostics.ts';
import type { StorageCandidate } from '../../src/storage/files.ts';

const item = (contextId?: string): StorageCandidate => ({ kind: 'diagnostic', path: '/private/log', ownerRoot: '/private/log', sizeBytes: 1,
  eligible: true, reason: 'unused_diagnostic', diagnostic: { provider: 'qoder', producerPid: 2_000_000_000, contextId } });

test('diagnostic dependency decisions are scoped to the exact provider/context and fail closed for missing evidence', () => {
  assert.equal(diagnosticUnreferenced(item('one'), { complete: true, contexts: ['qoder:one'] }), false);
  assert.equal(diagnosticUnreferenced(item('one'), { complete: true, contexts: ['dsh:one', 'qoder:other'] }), true);
  assert.equal(diagnosticUnreferenced(item('one'), { complete: false, contexts: [] }), false);
  assert.equal(diagnosticUnreferenced(item(), { complete: false, contexts: [] }), true, 'independent debug logs do not need a session proof');
  const missing = item(); delete missing.diagnostic!.producerPid;
  assert.equal(diagnosticUnreferenced(missing, { complete: true, contexts: [] }), false);
  const live = item(); live.diagnostic!.producerPid = process.pid;
  assert.equal(diagnosticUnreferenced(live, { complete: true, contexts: [] }), false);
  for (const producerPid of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = item(); invalid.diagnostic!.producerPid = producerPid;
    assert.equal(diagnosticUnreferenced(invalid, { complete: true, contexts: [] }), false, 'invalid native PID is unknown, not an exited process');
  }
});
