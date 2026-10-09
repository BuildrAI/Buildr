import assert from 'node:assert/strict';
import test from 'node:test';

import integrationProgressReporter, { archifyScenarioTimings, archifyWrapperTimings } from '../verification/integration-progress-reporter.ts';

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

test('Archify timeout diagnostics retain the last fixed scenario phase without copying child output', async () => {
  async function* events(): Promise<any> {
    yield { type: 'test:complete', data: {
      file: '/workspace/test/integration/archify-component.test.ts', name: 'Archify lifecycle', details: {
        duration_ms: 175_000, passed: false, error: {
          code: 'ERR_TEST_FAILURE', failureType: 'testCodeFailure', cause: {
            code: 'ERR_ASSERTION', message: [
              'spawnSync /private/fixture-tool/bin/node ETIMEDOUT',
              'secret-child-output',
              '[archify-scenario] 16: passed project create example',
              '[archify-scenario] 17: start installed renderer',
              '[archify-scenario] 18: passed secret-child-output',
              '[archify-scenario] 19: passed constructor',
              '[archify-scenario] 20: passed __proto__',
              '[archify-scenario] 99: start component uninstall archify',
            ].join('\n'),
          },
        },
      },
    } };
  }
  let output = '';
  for await (const chunk of integrationProgressReporter(events())) output += chunk;
  const diagnostic = JSON.parse(output.trim().replace('[buildr-integration-progress] ', ''));
  assert.deepEqual(diagnostic.error.lastPhase, { scope: 'archify', step: 17, status: 'started', operation: 'installed-renderer' });
  assert.equal(diagnostic.error.childErrorCode, 'ETIMEDOUT');
  assert.doesNotMatch(output, /secret-child-output|fixture-tool|spawnSync/);
});

test('Scenario-looking child output is omitted for other files and non-assertion errors', async () => {
  async function* events(): Promise<any> {
    for (const [file, code] of [['other.test.ts', 'ERR_ASSERTION'], ['archify-component.test.ts', 'EPERM']]) {
      yield { type: 'test:complete', data: { file, name: 'read boundary', details: {
        duration_ms: 1, passed: false, error: { code: 'ERR_TEST_FAILURE', cause: {
          code, message: '[archify-scenario] 17: start installed renderer\nspawnSync /private/fixture-tool/bin/node ETIMEDOUT',
        } },
      } } };
    }
  }
  let output = '';
  for await (const chunk of integrationProgressReporter(events())) output += chunk;
  assert.doesNotMatch(output, /lastPhase|childErrorCode|fixture-tool|archify-scenario/);
});

test('Archify elapsed and command durations survive the real event shapes as closed numeric records', async () => {
  const records = [
    { step: 1, operation: 'workspace-init', status: 'started', elapsedMs: 250, path: 'secret-path' },
    { step: 2, operation: 'workspace-init', status: 'completed', elapsedMs: 1_000, durationMs: 750, stdout: 'secret-output' },
    { step: 25, operation: 'runtime-sync', status: 'started', elapsedMs: 170_000 },
  ];
  const message = records.map(record => `[archify-scenario-timing] ${JSON.stringify(record)}`).join('\n');
  const expected = records.map(({ path: _path, stdout: _stdout, ...record }: any) => record);
  assert.deepEqual(archifyScenarioTimings(message), expected);
  async function* events(): Promise<any> {
    yield { type: 'test:stderr', data: { file: '/private/archify-component.test.ts', message } };
    yield { type: 'test:complete', data: { file: '/private/archify-component.test.ts', name: 'Archify lifecycle', details: {
      passed: false, duration_ms: 175_000, error: { code: 'ERR_TEST_FAILURE', cause: {
        code: 'ERR_ASSERTION', message: `[archify-scenario] 25: start sync codex --target\n${message}`,
      } },
    } } };
  }
  let output = '';
  for await (const chunk of integrationProgressReporter(events())) output += chunk;
  const lines = output.trim().split('\n').map(line => JSON.parse(line.replace(/^\[[^\]]+\] /, '')));
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.slice(0, 3).map(({ file: _file, ...record }: any) => record), expected);
  assert.deepEqual(lines[3].error.phaseTimings, expected);
  assert.deepEqual(lines[3].error.lastPhase, { scope: 'archify', step: 25, status: 'started', operation: 'runtime-sync', elapsedMs: 170_000 });
  assert.doesNotMatch(output, /secret-|\/private|stdout/);
});

test('Archify timing rejects invalid numbers, roles and phase shapes without admitting process output', async () => {
  const valid = { step: 25, operation: 'runtime-sync', status: 'started', elapsedMs: 100 };
  const invalid = [null, [], { ...valid, step: 27 }, { ...valid, operation: 'constructor' },
    { ...valid, status: 'completed', durationMs: 1 }, { ...valid, step: 24, operation: 'component-uninstall' },
    { step: 26, operation: 'runtime-sync', status: 'completed', elapsedMs: 100 },
    { step: 26, operation: 'runtime-sync', status: 'completed', elapsedMs: 100, durationMs: 101 },
    ...[-1, 300_001, 1.5, '1', null, NaN, Infinity].map(elapsedMs => ({ ...valid, elapsedMs })),
  ];
  const message = ['[archify-scenario-timing] malformed-secret-output',
    ...invalid.map(record => `[archify-scenario-timing] ${JSON.stringify(record)}`)].join('\n');
  assert.deepEqual(archifyScenarioTimings(message), []);
  async function* events(): Promise<any> {
    yield { type: 'test:stderr', data: { file: 'archify-component.test.ts', message } };
    yield { type: 'test:stderr', data: { file: 'other.test.ts', message: `[archify-scenario-timing] ${JSON.stringify(valid)}` } };
  }
  let output = '';
  for await (const chunk of integrationProgressReporter(events())) output += chunk;
  assert.equal(output, '');
});

test('Archify diagnostics distinguish scenario elapsed time from the actual outer deadline', async () => {
  const phase = { step: 23, operation: 'component-uninstall', status: 'started', elapsedMs: 173_058,
    wrapperElapsedMs: 173_490, commandTimeoutMs: 60_000 };
  const wrapper = { elapsedMs: 175_020, timeoutMs: 175_000, caseTimeoutMs: 180_000, status: 'timed-out' };
  const message = `[archify-scenario-timing] ${JSON.stringify({ ...phase, env: 'secret-value' })}\n`
    + `[archify-wrapper-timing] ${JSON.stringify({ ...wrapper, stderr: 'secret-output' })}`;
  assert.deepEqual(archifyScenarioTimings(message), [phase]);
  assert.deepEqual(archifyWrapperTimings(message), [wrapper]);
  async function* events(): Promise<any> {
    yield { type: 'test:stderr', data: { file: '/private/archify-component.test.ts', message } };
  }
  let output = '';
  for await (const chunk of integrationProgressReporter(events())) output += chunk;
  const records = output.trim().split('\n').map(line => JSON.parse(line.replace(/^\[[^\]]+\] /, '')));
  assert.deepEqual(records, [{ file: 'archify-component.test.ts', ...phase }, { file: 'archify-component.test.ts', ...wrapper }]);
  assert.doesNotMatch(output, /secret-|\/private|stderr|env/);
});

test('Archify budget diagnostics cannot admit an invented timeout or unsafe metadata', () => {
  const phase = { step: 23, operation: 'component-uninstall', status: 'started', elapsedMs: 100 };
  const invalidPhases = [-1, 300_001, 1.5, '1', null].map(wrapperElapsedMs => ({ ...phase, wrapperElapsedMs, commandTimeoutMs: 60_000 }));
  invalidPhases.push({ ...phase, wrapperElapsedMs: 100, commandTimeoutMs: 120_000 });
  for (const input of invalidPhases) {
    assert.deepEqual(archifyScenarioTimings(`[archify-scenario-timing] ${JSON.stringify(input)}`), [phase]);
  }
  const wrapper = { elapsedMs: 175_020, timeoutMs: 175_000, caseTimeoutMs: 180_000, status: 'timed-out' };
  for (const input of [null, { ...wrapper, status: 'secret-output' }, { ...wrapper, elapsedMs: -1 },
    { ...wrapper, elapsedMs: 300_001 }, { ...wrapper, elapsedMs: '1' }, { ...wrapper, timeoutMs: 300_000 },
    { ...wrapper, caseTimeoutMs: 360_000 }]) {
    assert.deepEqual(archifyWrapperTimings(`[archify-wrapper-timing] ${JSON.stringify(input)}`), []);
  }
});
