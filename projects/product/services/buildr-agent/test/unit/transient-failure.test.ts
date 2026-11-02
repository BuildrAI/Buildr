import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_CREDENTIAL_RETRIES,RETRY_DELAYS,localCredentialFailure,transientFailure} from '../../src/domain/transient-failure.ts';

test('temporary service errors are distinguished from quota, permission and identity failures', () => {
  for (const message of ['Selected model is at capacity.', 'server_error', 'service_unavailable', 'HTTP 503', 'agent_native_timeout', 'agent_native_process_closed', 'connection reset']) assert.equal(transientFailure(message), true, message);
  for (const message of ['at capacity; quota exhausted', 'temporary authentication failure', '503 permission denied', 'insufficient credits', 'model_identity_conflict', 'agent_native_request_failed', 'codex_execution_observation_lost', 'random vendor error']) assert.equal(transientFailure(message), false, message);
});

test('a rejected local gateway credential is its own recoverable failure, not an account authentication failure', () => {
  for (const message of ['模型调用的本机凭据已失效。', 'model_gateway_unauthorized']) assert.equal(localCredentialFailure(message), true, message);
  for (const message of ['temporary authentication failure', 'unauthorized: temporary failure', '503 permission denied', 'insufficient credits', 'model_identity_conflict', 'service temporarily unavailable']) assert.equal(localCredentialFailure(message), false, message);
  assert.equal(transientFailure('模型调用的本机凭据已失效。'), false, 'the bounded gate must not treat it as a generic transient fault');
});

test('a reissued local credential is retried exactly once', () => {
  assert.equal(LOCAL_CREDENTIAL_RETRIES, 1);
  assert.ok(RETRY_DELAYS[0] > 0, 'the reissue wait uses the first configured delay');
});
