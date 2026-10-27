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
