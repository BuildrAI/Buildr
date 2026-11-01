import test from 'node:test';
import assert from 'node:assert/strict';
import { qoderLoggedFailure } from '../../src/executors/qoder/failure-diagnostic.ts';
import { transientFailure } from '../../src/domain/transient-failure.ts';

const generic = 'Sorry, something went wrong. Please try again. Report Issue (input /feedback)';
const at = Date.parse('2026-11-01T10:38:00Z');
const failed = { ts: new Date(at).toISOString(), turn_id: 'exact-turn', request_id: 'last-attempt', type: 'model.request.attempt_failed', data: { will_retry: false, retryable: true, error_message: 'Network attempt failed at response_headers', error_cause_chain: [{ code: 'ECONNRESET', message: 'Client network socket disconnected before secure TLS connection was established' }] } };
const terminal = { ...failed, type: 'turn.finished', data: { reason: 'error', error: generic } };
const diagnostic = (records: unknown[], errors: unknown = [generic], start = at - 1000) => qoderLoggedFailure(records.map(record => JSON.stringify(record)).join('\n'), start, at + 1000, errors);

test('Qoder terminal model errors keep the exact network cause and redact private values', () => {
  const reason = diagnostic([failed, terminal]);
  assert.match(reason!, /ECONNRESET.*before secure TLS/);
  assert.equal(transientFailure(reason!), true);
  const privateFailure = { ...failed, data: { ...failed.data, error_message: 'HTTP 503 api_key="private-key" Bearer private-token https://private.invalid/path' } };
  assert.doesNotMatch(diagnostic([privateFailure, terminal])!, /private-key|private-token|private.invalid/);
  const quota = { ...failed, data: { ...failed.data, error_message: 'quota exhausted' } };
  assert.equal(transientFailure(diagnostic([quota, terminal])!), false);
});

test('Qoder never infers a retry from generic text, stale turns, tools or recovered attempts', () => {
  for (const records of [[], [failed], [terminal], [{ ...failed, turn_id: 'another-turn' }, terminal], [{ ...failed, request_id: 'earlier-attempt' }, terminal], [{ ...failed, type: 'tool.execution.finished' }, terminal], [{ ...failed, data: { ...failed.data, will_retry: true } }, terminal], [failed, { ...terminal, data: { reason: 'success', error: generic } }], [failed, terminal, { ...terminal, data: { reason: 'success' } }]]) {
    assert.equal(diagnostic(records), undefined);
  }
  assert.equal(diagnostic([failed, terminal], [generic], at + 1), undefined);
  for (const errors of [[], ['quota exhausted'], [generic, 'permission denied']]) assert.equal(diagnostic([failed, terminal], errors), undefined);
  assert.equal(qoderLoggedFailure('broken\n' + JSON.stringify(failed) + '\n' + JSON.stringify(terminal) + '\nincomplete', at - 1, at + 1, [generic])?.includes('ECONNRESET'), true);
});
