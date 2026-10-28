import test from 'node:test';
import assert from 'node:assert/strict';
import {transientFailure} from '../../src/domain/transient-failure.ts';

test('temporary service errors are distinguished from quota, permission and identity failures', () => {
  for (const message of ['Selected model is at capacity.', 'server_error', 'service_unavailable', 'HTTP 503', 'agent_native_timeout', 'agent_native_process_closed', 'connection reset']) assert.equal(transientFailure(message), true, message);
  for (const message of ['at capacity; quota exhausted', 'temporary authentication failure', '503 permission denied', 'insufficient credits', 'model_identity_conflict', 'agent_native_request_failed', 'codex_execution_observation_lost', 'random vendor error']) assert.equal(transientFailure(message), false, message);
});
