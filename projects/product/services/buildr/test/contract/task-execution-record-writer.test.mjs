import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repository = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/task/persistence/task-execution-record-repository.mjs'), 'utf8');
const workspaceSqlite = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/infrastructure/sqlite/workspace-sqlite.mjs'), 'utf8');

test('Task Execution Record writer不以调用方声明的role绕过checkout provenance', () => {
  const writableCalls = [...repository.matchAll(/openWorkspaceStructuredStore\(task\.root, \{ writable: true \}\)/gu)];
  assert.equal(writableCalls.length, 2);
  assert.doesNotMatch(repository, /writerRole|retained-task-state/u);
  assert.doesNotMatch(workspaceSqlite, /writerRole|retained-task-state|task-finish-retained/u);
});
