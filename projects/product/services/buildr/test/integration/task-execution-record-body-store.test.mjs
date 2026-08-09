import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createOpenTaskExecutionRecord, TASK_EXECUTION_RECORD_LIMITS } from '../../src/domain/task-execution-record/task-execution-record.mjs';
import { registerTaskExecutionRecordBodyStore } from '../../src/infrastructure/filesystem/task-execution-record-body-store.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-execution-body-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'));
  const runtime = registerTaskExecutionRecordBodyStore({});
  const record = createOpenTaskExecutionRecord({ recordId: 'record-1', taskId: 'task-1', owner: 'task-verification', kind: 'verification-execution', runIdentity: 'run-1', targetIdentity: 'target-1', producer: 'test' });
  return { root, runtime, record };
}

test('正文先脱敏再原子发布，重试复用匹配manifest', (t) => {
  const { root, runtime, record } = fixture(t);
  const files = [
    { name: 'summary.json', content: { token: 'top-secret', workspace: `${root}/projects/product`, external: '/Users/alice/private/file' } },
    { name: 'stdout.txt', content: 'Authorization: Bearer abc.def\npassword="two word secret"\ncache=/var/folders/private/cache\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----' },
  ];
  const first = runtime.publishTaskExecutionRecordBody(root, record, files);
  const second = runtime.publishTaskExecutionRecordBody(root, record, files);
  assert.deepEqual(second, first);
  const directory = path.join(root, first.locator);
  const combined = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  assert.equal(combined.includes('top-secret'), false);
  assert.equal(combined.includes('hunter2'), false);
  assert.equal(combined.includes('abc.def'), false);
  assert.equal(combined.includes('two word secret'), false);
  assert.equal(combined.includes('/var/folders'), false);
  assert.equal(combined.includes(root), false);
  assert.equal(combined.includes('/Users/alice'), false);
  assert.match(combined, /<workspace>|<redacted>/u);
  assert.equal(fs.readdirSync(path.dirname(directory)).some((name) => name.startsWith('.staging-')), false);
});

test('单文件与record边界使用UTF-8和有效JSON安全截断', (t) => {
  const { root, runtime, record } = fixture(t);
  const huge = '好'.repeat(TASK_EXECUTION_RECORD_LIMITS.fileBytes);
  const body = runtime.publishTaskExecutionRecordBody(root, record, [
    { name: 'stdout.txt', content: huge },
    { name: 'diagnostics.json', content: { value: huge } },
    { name: 'stderr.txt', content: huge },
    { name: 'timeline.json', content: { value: huge } },
    { name: 'summary.json', content: { value: huge } },
  ]);
  assert.equal(body.truncated, true);
  assert.ok(body.storedSizeBytes <= TASK_EXECUTION_RECORD_LIMITS.recordBytes);
  const directory = path.join(root, body.locator);
  assert.ok(fs.statSync(path.join(directory, 'stdout.txt')).size <= TASK_EXECUTION_RECORD_LIMITS.fileBytes);
  JSON.parse(fs.readFileSync(path.join(directory, 'diagnostics.json'), 'utf8'));
});

test('closed文件名与symlink路径fail closed且不留下staging', (t) => {
  const { root, runtime, record } = fixture(t);
  assert.throws(() => runtime.publishTaskExecutionRecordBody(root, record, [{ name: '../secret.txt', content: 'x' }]), (error) => error.code === 'task_execution_record_body_name_forbidden');
  const local = path.join(root, '.buildr', 'local');
  fs.mkdirSync(local, { recursive: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-body-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(local, 'task-execution-records'));
  assert.throws(() => runtime.publishTaskExecutionRecordBody(root, record, [{ name: 'stdout.txt', content: 'x' }]), (error) => error.code === 'task_execution_record_body_path_unsafe');
  assert.deepEqual(fs.readdirSync(outside), []);
});
