import fs from 'node:fs';
import path from 'node:path';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createFinishRun } from '../../src/task/application/finish/task-finish-run.mjs';

export function initializeTaskFinishSqliteWorkspace(root) {
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Finish SQLite test fixture\n');
  if (!fs.existsSync(path.join(root, 'projects', 'manifest.yml'))) fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  if (!fs.existsSync(path.join(root, '.buildr', 'workspace.yml'))) fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174004\nname: Finish SQLite test fixture\ndescription: Finish SQLite test fixture\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
}

export function createTaskFinishSqliteRuntime(root, task) {
  initializeTaskFinishSqliteWorkspace(root);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: task, title: `Finish ${task}`, intent: 'SQLite-only Finish fixture.', projects: [], services: [], changes: [] });
  const persistenceMethods = [
    'acquireTaskFinishTargetLease',
    'discardFailedTaskFinishRunPersistence',
    'finalizeTaskFinishPersistence',
    'replaceTaskFinishRunPersistence',
    'readTaskFinishCompletionPersistence',
    'readTaskFinishResultsPersistence',
    'readTaskFinishRunPersistence',
    'releaseTaskFinishTargetLease',
    'writeTaskFinishCompletionPersistence',
    'writeTaskFinishTerminalCleanupPersistence',
    'writeTaskFinishRunPersistence',
    'openTaskExecutionRecord',
    'sealTaskExecutionRecord',
    'inspectTaskExecutionRecord',
    'listTaskExecutionRecords',
    'atomicWriteFile',
    'removePath',
  ];
  return Object.fromEntries(persistenceMethods.map((name) => [name, runtime[name]]));
}

export function persistTaskFinishRun(runtime, root, identity, runId) {
  const run = createFinishRun({ root, identity, runId, runtime });
  runtime.writeTaskFinishRunPersistence(root, run);
  return run;
}
