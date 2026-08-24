import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseTaskExecutionRecordGcCli, parseTaskExecutionRecordRecoverCli } from '../../src/task/interfaces/cli/task-execution-record.mjs';

test('ExecRecord GC CLI parser只接受closed参数', () => {
  const targetRoot = path.join(os.tmpdir(), 'buildr-task-execution-record-gc', 'workspace');
  const parsed = parseTaskExecutionRecordGcCli(['--target', targetRoot, '--dry-run', '--limit', '25', '--json']);
  assert.equal(parsed.targetRoot, path.resolve(targetRoot));
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.json, true);
  assert.throws(() => parseTaskExecutionRecordGcCli(['--force']), (error) => error.code === 'task_execution_record_gc_cli.syntax');
  assert.throws(() => parseTaskExecutionRecordGcCli(['--limit', '1.5']), (error) => error.code === 'task_execution_record_gc_cli.syntax');
  assert.throws(() => parseTaskExecutionRecordGcCli(['--path', path.join(os.tmpdir(), 'body')]), (error) => error.code === 'task_execution_record_gc_cli.syntax');
});

test('Execution Record recover CLI parser保持closed mode与显式unknown授权', () => {
  const terminal = parseTaskExecutionRecordRecoverCli(['--task', 'task-a', '--record', 'record-a', '--summary', './summary.json', '--json']);
  assert.equal(terminal.taskId, 'task-a');
  assert.equal(terminal.recordId, 'record-a');
  assert.equal(terminal.summaryPath, path.resolve('./summary.json'));
  assert.equal(terminal.authorizeUnknownOutcome, false);
  const unknown = parseTaskExecutionRecordRecoverCli(['--task', 'task-a', '--record', 'record-a', '--authorize-unknown-outcome']);
  assert.equal(unknown.summaryPath, null);
  assert.equal(unknown.authorizeUnknownOutcome, true);
  assert.throws(() => parseTaskExecutionRecordRecoverCli(['--task', 'task-a', '--record', 'record-a', '--summary', './summary.json', '--authorize-unknown-outcome']));
  assert.throws(() => parseTaskExecutionRecordRecoverCli(['--task', 'task-a', '--record', 'record-a', '--outcome', 'passed']));
});
