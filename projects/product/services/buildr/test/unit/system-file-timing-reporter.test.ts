import assert from 'node:assert/strict';
import test from 'node:test';

import systemFileTimingReporter, { formatSystemFileTiming } from '../../test/verification/system-file-timing-reporter.ts';

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
