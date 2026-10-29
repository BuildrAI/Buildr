import test from 'node:test';
import assert from 'node:assert/strict';
import { errorDiagnostic } from '../../src/domain/error-diagnostic.ts';
import { modelFailure } from '../../src/model-access/errors.ts';

test('public diagnostics retain the reason while redacting credentials and URLs before bounding', () => {
  const message = errorDiagnostic('permission_denied: configuration issue\nAuthorization: Bearer bearer-value api_key="private-key" devin-session-token$private-token https://user:pass@example.invalid/?token=secret exact-secret', ['exact-secret']);
  assert.match(message!, /permission_denied: configuration issue/);
  for (const secret of ['bearer-value', 'private-key', 'private-token', 'user:pass', '?token=secret', 'exact-secret', '\n']) assert.ok(!message!.includes(secret), secret);
  assert.ok(errorDiagnostic('x'.repeat(2000))!.length <= 1200);
  assert.equal(errorDiagnostic({ headers: 'private' }), undefined);
  assert.ok(!errorDiagnostic('password="a secret with spaces" api_key=\'another secret\'')!.includes('secret'));
  assert.ok(!errorDiagnostic('permission_denied\nCookie: session=private-cookie; refresh=another-cookie')!.includes('private-cookie'));
  assert.ok(!modelFailure(new Error('private opaque vendor body')).message.includes('private'));
  assert.equal(modelFailure(new Error('model_devin_stream_truncated')).code, 'model_devin_stream_truncated');
});

test('native RPC rejection preserves sanitized cause without claiming login failure', async () => {
  const {NativeRequestError} = await import('../../src/domain/error-diagnostic.ts');
  const {safeDiagnostic} = await import('../../src/domain/agent-state.ts');
  const rejection = new NativeRequestError('Selected model is at capacity. Authorization: Bearer secret-value https://internal.invalid/request');
  assert.equal(rejection.message, 'agent_native_request_failed');
  assert.match(safeDiagnostic(rejection), /Selected model is at capacity/);
  assert.doesNotMatch(safeDiagnostic(rejection), /secret-value|internal.invalid|登录/);
  assert.doesNotMatch(safeDiagnostic(new Error('opaque internal failure')), /登录|opaque internal/);
});

test('observation failures identify the affected executor and preserve only the safe cause',async()=>{
  const {NativeObservationError}=await import('../../src/domain/error-diagnostic.ts');
  const {safeDiagnostic}=await import('../../src/domain/agent-state.ts');
  for(const provider of ['codex','dsh','qoder']){
    const error=new NativeObservationError(provider+'_event_observation_lost',new Error('database is locked; Authorization: Bearer secret-value https://internal.invalid/request'));
    const message=safeDiagnostic(error);
    assert.match(message,/database is locked/);assert.doesNotMatch(message,/secret-value|internal.invalid/);
    assert.match(message,/核对原执行/);
  }
});
