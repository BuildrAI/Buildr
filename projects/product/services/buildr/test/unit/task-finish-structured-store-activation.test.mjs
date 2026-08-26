import assert from 'node:assert/strict';
import test from 'node:test';

import { activateWorkspaceStructuredStore } from '../../src/task/application/finish/task-finish-product-executor.mjs';

function opened({ version, targetVersion, migrationRequired }) {
  let closed = false;
  return {
    present: true,
    version,
    migrationRequired,
    scripts: Array.from({ length: targetVersion + 1 }, (_, index) => ({ version: index })),
    database: { close() { closed = true; } },
    get closed() { return closed; },
  };
}

test('pending Structured Store migration由writable Activation在Doctor前应用', () => {
  const read = opened({ version: 18, targetVersion: 19, migrationRequired: true });
  const write = opened({ version: 19, targetVersion: 19, migrationRequired: false });
  const calls = [];
  const result = activateWorkspaceStructuredStore({
    openWorkspaceStructuredStore(_root, options) {
      calls.push(options);
      return options.writable ? write : read;
    },
  }, '/workspace');

  assert.deepEqual(calls, [
    { writable: false, allowPendingRead: true },
    { writable: true },
  ]);
  assert.deepEqual(result, { status: 'passed', beforeVersion: 18, afterVersion: 19, targetVersion: 19, appliedCount: 1 });
  assert.equal(read.closed, true);
  assert.equal(write.closed, true);
});

test('无pending migration时Activation为not-applicable且不打开writer', () => {
  const read = opened({ version: 19, targetVersion: 19, migrationRequired: false });
  const calls = [];
  const result = activateWorkspaceStructuredStore({
    openWorkspaceStructuredStore(_root, options) { calls.push(options); return read; },
  }, '/workspace');

  assert.deepEqual(calls, [{ writable: false, allowPendingRead: true }]);
  assert.deepEqual(result, { status: 'not-applicable', beforeVersion: 19, afterVersion: 19, targetVersion: 19, appliedCount: 0 });
});

test('migration writer失败形成Activation blocker并保留原版本', () => {
  const read = opened({ version: 18, targetVersion: 19, migrationRequired: true });
  const result = activateWorkspaceStructuredStore({
    openWorkspaceStructuredStore(_root, options) {
      if (options.writable) throw Object.assign(new Error('writer failed'), { code: 'workspace_store_database_failed', details: { currentVersion: 18, targetVersion: 19 } });
      return read;
    },
  }, '/workspace');

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'workspace_store_database_failed');
  assert.equal(result.beforeVersion, 18);
  assert.equal(read.closed, true);
});
