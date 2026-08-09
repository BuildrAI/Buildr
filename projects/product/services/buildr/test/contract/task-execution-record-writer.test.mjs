import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repository = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/infrastructure/sqlite/task-execution-record-repository.mjs'), 'utf8');

test('Task Execution Record writer使用受限retained-task-state provenance role', () => {
  const writableCalls = [...repository.matchAll(/openWorkspaceStructuredStore\(task\.root, \{ writable: true, writerRole: 'retained-task-state' \}\)/gu)];
  assert.equal(writableCalls.length, 2);
  assert.equal(repository.includes('openWorkspaceStructuredStore(task.root, { writable: true })'), false);
});
