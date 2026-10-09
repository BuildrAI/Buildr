import assert from 'node:assert/strict';
import test from 'node:test';

import integrationProgressReporter from '../verification/integration-progress-reporter.ts';

test('Integration failure and completed file diagnostics arrive before the remaining event stream ends', async () => {
  const file = '/workspace/test/integration/http.test.ts';
  let exhausted = false;
  async function* events(): Promise<any> {
    yield { type: 'test:complete', data: { file, name: 'HTTP read boundary', details: {
      duration_ms: 10.6, passed: false,
      error: { code: 'ERR_TEST_FAILURE', failureType: 'testCodeFailure', cause: { code: 'ERR_ASSERTION' } },
    } } };
    yield { type: 'test:complete', data: { file, name: file, details: { duration_ms: 19.6, passed: false } } };
    exhausted = true;
  }
  const reporter = integrationProgressReporter(events());
  const failed = await reporter.next();
  assert.match(failed.value, /"name":"HTTP read boundary","status":"failed","durationMs":11/);
  assert.match(failed.value, /"causeCode":"ERR_ASSERTION"/);
  assert.equal(exhausted, false);
  const completed = await reporter.next();
  assert.match(completed.value, /"file":"http.test.ts","name":"http.test.ts","status":"failed","durationMs":20/);
  assert.equal(exhausted, false);
  assert.equal((await reporter.next()).done, true);
});

test('Integration progress keeps only test identity and safe error metadata', async () => {
  const file = '/private/workspace/test/integration/http.test.ts';
  async function* events(): Promise<any> {
    yield { type: 'test:stderr', data: { file, name: 'HTTP', message: 'secret-process-output' } };
    yield { type: 'test:complete', data: { file, name: 'successful test', details: { duration_ms: 1, passed: true } } };
    yield { type: 'test:complete', data: { file, name: 'HTTP\nread', details: {
      duration_ms: 4, passed: false,
      error: {
        code: 'ERR_TEST_FAILURE', failureType: 'testCodeFailure', message: 'secret-message', stack: 'secret-stack',
        cause: { code: 'ERR_ASSERTION', actual: 'secret-actual', expected: 'secret-expected' },
        exitCode: 1, signal: 'SIGTERM',
      },
    } } };
  }
  let output = '';
  for await (const chunk of integrationProgressReporter(events())) output += chunk;
  assert.doesNotMatch(output, /secret-|\/private\/workspace|successful test/);
  assert.match(output, /"name":"HTTP read"/);
  assert.match(output, /"exitCode":1,"signal":"SIGTERM"/);
  assert.equal(output.split('\n').filter(Boolean).length, 1);
});
