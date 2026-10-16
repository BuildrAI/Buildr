import assert from 'node:assert/strict';
import test from 'node:test';
import { pairExecutionDiagnostic } from '../../tools/release/package-pair-diagnostics.ts';

test('pair diagnostics retain failed child facts without misclassifying a timeout as incompatibility', () => {
  const timeout = pairExecutionDiagnostic('provider-install', 'isolated-npm-operation-failed', {
    status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawn timed out'), { code: 'ETIMEDOUT' }),
    stderr: 'npm error code ECONNRESET\nconnection reset',
  });
  assert.deepEqual(timeout, { stage: 'provider-install', code: 'isolated-npm-operation-failed', exitCode: null,
    signal: 'SIGTERM', errorCode: 'ETIMEDOUT', message: 'spawn timed out', stderr: 'npm error code ECONNRESET\nconnection reset' });
  assert.equal(pairExecutionDiagnostic('plugin-install', 'plugin-dependencies-unavailable', { status: 1 }).exitCode, 1);
  assert.doesNotThrow(() => pairExecutionDiagnostic('pair-runtime', 'pair-runtime-unavailable', null));
});

test('diagnostics omit credentials before truncating and bound ordinary process output', () => {
  for (const credential of ['npm_' + 'a'.repeat(30), 'npm_\x1b[0m' + 'a'.repeat(30), 'ghp_' + 'b'.repeat(30), 'Authorization: Bearer private', '_authToken=private', 'password=private', 'https://user:private@example.invalid', '_auth=private']) {
    const result = pairExecutionDiagnostic('plugin-install', 'plugin-dependencies-unavailable', {
      message: credential, stderr: 'x'.repeat(2047) + credential,
    });
    assert.equal(result.message, '[sensitive diagnostic omitted]');
    assert.equal(result.stderr, '[sensitive diagnostic omitted]');
    assert.ok(!JSON.stringify(result).includes(credential));
  }
  const ordinary = pairExecutionDiagnostic('plugin-install', 'plugin-dependencies-unavailable', { message: 'm'.repeat(2000), stderr: '\x1b[31m' + 'x'.repeat(5000) });
  assert.equal(ordinary.message?.length, 1024); assert.equal(ordinary.stderr?.length, 2048);
  assert.ok(!ordinary.stderr?.includes('\x1b'));
});
