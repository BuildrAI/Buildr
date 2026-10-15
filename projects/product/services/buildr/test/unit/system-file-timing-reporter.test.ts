import assert from 'node:assert/strict';
import test from 'node:test';

import systemFileTimingReporter, { formatSystemFileTiming } from '../verification/system-file-timing-reporter.ts';

async function collect(reporter: any): Promise<any>  {
  let output: any = '';
  for await (const chunk of reporter) output += chunk;
  return output;
}

test('System file timing 按 worker duration 输出紧凑 transient diagnostics', async () => {
  const fileA: any = '/workspace/test/system/a.test.mjs';
  const fileB: any = '/workspace/test/system/b.test.mjs';
  async function* events(): Promise<any>  {
    yield { type: 'test:complete', data: { name: '普通用例', file: fileA, details: { duration_ms: 9, passed: true } } };
    yield { type: 'test:complete', data: { name: fileA, file: fileA, details: { duration_ms: 1200.4, passed: true } } };
    yield { type: 'test:complete', data: { name: fileB, file: fileB, details: { duration_ms: 2400.6, passed: false } } };
  }

  assert.equal(await collect(systemFileTimingReporter(events())),
    '[buildr-system-file-timing] scope=transient files=2 slowest-first=b.test.mjs:2401ms:failed,a.test.mjs:1200ms:passed\n');
});

test('System file timing 相同耗时按文件名稳定排序', () => {
  assert.equal(formatSystemFileTiming([
    { file: '/workspace/z.test.mjs', durationMs: 10, passed: true },
    { file: '/workspace/a.test.mjs', durationMs: 10, passed: true },
  ]), '[buildr-system-file-timing] scope=transient files=2 slowest-first=a.test.mjs:10ms:passed,z.test.mjs:10ms:passed');
});

test('System reporter转发黄金journey分段计时并忽略其他测试输出', async () => {
  const timing: any = '[buildr-golden-journey-timing] {"schemaVersion":"buildr.golden-journey-timing/v1"}\n';
  async function* events(): Promise<any>  {
    yield { type: 'test:stderr', data: { message: 'ordinary diagnostic\n' } };
    yield { type: 'test:stderr', data: { message: timing } };
  }

  assert.equal(await collect(systemFileTimingReporter(events())), `${timing}[buildr-system-file-timing] scope=transient files=0 slowest-first=\n`);
});

test('System reporter preserves only the bounded preview timing diagnostic', async () => {
  const timing = '[preview-isolation-timing] current=start-second workspace-first=310ms workspace-second=320ms start-first=9000ms fetch-first=2ms start-second=15015ms cleanup=20ms';
  async function* events() {
    yield { type: 'test:diagnostic', data: { message: timing } };
    yield { type: 'test:diagnostic', data: { message: '[preview-isolation-timing] current=completed cleanup=1ms\n' } };
    for (const message of ['ordinary-private-diagnostic', `${timing} private-value`, `${timing}\nprivate-value`, '[preview-isolation-timing] current=private-value cleanup=1ms', '[preview-isolation-timing] current=start-second unknown=1ms']) {
      yield { type: 'test:diagnostic', data: { message } };
    }
    yield { type: 'test:stderr', data: { message: `${timing}\nprivate-value` } };
  }
  assert.equal(await collect(systemFileTimingReporter(events())), `${timing}\n[preview-isolation-timing] current=completed cleanup=1ms\n[buildr-system-file-timing] scope=transient files=0 slowest-first=\n`);
});

test('System case progress uses per-file ordinals and never copies names or absolute paths', async () => {
  const first = { file: '/private/workspace/test/system/first.test.ts', name: 'private-title', line: 10, column: 1, nesting: 0 };
  const second = { ...first, line: 20, name: '/private/title-path' };
  const other = { file: 'D:\\private\\workspace\\test\\system\\other.test.ts', name: 'private-other-title', line: 30, column: 1, nesting: 0, testId: 8 };
  async function* events() {
    yield { type: 'test:dequeue', data: first };
    yield { type: 'test:dequeue', data: other };
    yield { type: 'test:pass', data: first };
    yield { type: 'test:dequeue', data: second };
    yield { type: 'test:fail', data: other };
    yield { type: 'test:pass', data: second };
  }
  const output = await collect(systemFileTimingReporter(events()));
  const progress = output.trim().split('\n').slice(0, -1).map((line: string) => JSON.parse(line.replace('[buildr-system-progress] ', '')));
  assert.deepEqual(progress, [
    { file: 'first.test.ts', case: 1, status: 'started' }, { file: 'other.test.ts', case: 1, status: 'started' },
    { file: 'first.test.ts', case: 1, status: 'passed' }, { file: 'first.test.ts', case: 2, status: 'started' },
    { file: 'other.test.ts', case: 1, status: 'failed' }, { file: 'first.test.ts', case: 2, status: 'passed' },
  ]);
  assert.doesNotMatch(output, /private|title|workspace|D:/u);
});

test('System progress ignores root, file containers, suites and unmatched completion events', async () => {
  const file = '/private/workspace/test/system/only.test.ts';
  const actual = { file, name: 'private-case', line: 15, column: 1, nesting: 0, testId: 7 };
  async function* events() {
    const ignored = [{ name: 'root' }, { file, name: file, line: 1, column: 1 },
      { ...actual, name: 'private-suite', type: 'suite' }, { ...actual, line: undefined }];
    for (const data of ignored) {
      yield { type: 'test:dequeue', data };
      yield { type: 'test:pass', data };
    }
    yield { type: 'test:fail', data: actual };
    yield { type: 'test:dequeue', data: actual };
    yield { type: 'test:pass', data: { ...actual, details: { type: 'suite' } } };
    yield { type: 'test:pass', data: actual };
    yield { type: 'test:fail', data: actual };
  }
  assert.equal(await collect(systemFileTimingReporter(events())), '[buildr-system-progress] {"file":"only.test.ts","case":1,"status":"started"}\n'
    + '[buildr-system-progress] {"file":"only.test.ts","case":1,"status":"passed"}\n'
    + '[buildr-system-file-timing] scope=transient files=0 slowest-first=\n');
});

test('System progress exposes a running case before its later events arrive and matches repeated names by test identity', async () => {
  let exhausted = false;
  const data = { file: '/private/repeated.test.ts', name: 'private-repeated-title', line: 10, column: 1, nesting: 0 };
  async function* events() {
    yield { type: 'test:dequeue', data: { ...data, testId: 1 } };
    yield { type: 'test:dequeue', data: { ...data, testId: 2 } };
    yield { type: 'test:fail', data: { ...data, testId: 2 } };
    yield { type: 'test:pass', data: { ...data, testId: 1 } };
    exhausted = true;
  }
  const reporter = systemFileTimingReporter(events());
  assert.equal((await reporter.next()).value, '[buildr-system-progress] {"file":"repeated.test.ts","case":1,"status":"started"}\n');
  assert.equal(exhausted, false);
  assert.equal((await reporter.next()).value, '[buildr-system-progress] {"file":"repeated.test.ts","case":2,"status":"started"}\n');
  assert.equal((await reporter.next()).value, '[buildr-system-progress] {"file":"repeated.test.ts","case":2,"status":"failed"}\n');
  assert.equal((await reporter.next()).value, '[buildr-system-progress] {"file":"repeated.test.ts","case":1,"status":"passed"}\n');
  await collect(reporter);
  assert.equal(exhausted, true);
});
