import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTaskExecutionRecordGcCli } from '../../src/interfaces/cli/task-execution-record.mjs';

test('ExecRecord GC CLI parser只接受closed参数', () => {
  const parsed = parseTaskExecutionRecordGcCli(['--target', '/tmp/workspace', '--dry-run', '--limit', '25', '--json']);
  assert.equal(parsed.targetRoot, '/tmp/workspace');
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.json, true);
  assert.throws(() => parseTaskExecutionRecordGcCli(['--force']), (error) => error.code === 'task_execution_record_gc_cli.syntax');
  assert.throws(() => parseTaskExecutionRecordGcCli(['--limit', '1.5']), (error) => error.code === 'task_execution_record_gc_cli.syntax');
  assert.throws(() => parseTaskExecutionRecordGcCli(['--path', '/tmp/body']), (error) => error.code === 'task_execution_record_gc_cli.syntax');
});
