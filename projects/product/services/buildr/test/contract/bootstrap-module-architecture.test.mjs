import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRuntime, runtimeContributions, runtimeModuleSnapshot, runtimeProvide } from '../../src/bootstrap/runtime.mjs';
import { TASK_RECORD_APPLICATION, TASK_RECORD_COMPATIBILITY, TASK_RECORD_PERSISTENCE_READ } from '../../src/task/module.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Bootstrap 是唯一 composition root，bin 与公共 Host 不直连 Task 内部 Adapter', () => {
  assert.match(read('bin/buildr.mjs'), /src\/bootstrap\/cli\/main\.mjs/);
  assert.equal(fs.existsSync(path.join(root, 'src/application/compose-runtime.mjs')), false);
  const bootstrap = read('src/bootstrap/runtime.mjs');
  assert.match(bootstrap, /createModuleRegistry/);
  assert.match(bootstrap, /registerLegacyRuntime/);
  assert.doesNotMatch(bootstrap, /registerTaskRecord(?:Repository|Application)/);

  const cliHost = read('src/bootstrap/cli/registry.mjs');
  assert.match(cliHost, /from '..\/..\/task\/module\.mjs'/);
  assert.doesNotMatch(cliHost, /task\/interfaces\/(?:cli|http)/);
  assert.match(cliHost, /runtimeContributions\(runtime, 'cli'\)/);

  const httpHost = read('src/interfaces/local-app/http/server.mjs');
  assert.doesNotMatch(httpHost, /task\/interfaces\/(?:cli|http)|task-record-http/);
  assert.match(httpHost, /for \(const contribution of httpContributions\)/);
  assert.match(httpHost, /contribution\.handle\(/);
});

test('Task Record module 暴露窄 capability、唯一 contributions 与有退出条件的兼容 Facade', () => {
  const runtime = createRuntime();
  assert.deepEqual(runtimeModuleSnapshot(runtime), [{
    id: 'task-record',
    requires: ['workspace.structured-store', 'project-service.reader', 'change.resolver', 'workspace.operation-memoizer', 'task.parent-coordination-reader'],
    provides: [TASK_RECORD_APPLICATION, TASK_RECORD_PERSISTENCE_READ, TASK_RECORD_COMPATIBILITY],
    contributions: {
      cli: ['task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon'],
      http: ['task-record.http'],
      diagnostics: [],
    },
    lifecycle: 'none',
  }]);
  assert.deepEqual(runtimeContributions(runtime, 'cli').map((item) => item.key), ['task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon']);
  assert.deepEqual(runtimeContributions(runtime, 'http').map((item) => item.id), ['task-record.http']);

  const application = runtimeProvide(runtime, TASK_RECORD_APPLICATION);
  const persistenceRead = runtimeProvide(runtime, TASK_RECORD_PERSISTENCE_READ);
  assert.equal(typeof application.inspectTaskRecord, 'function');
  assert.equal(typeof application.createTaskRecord, 'function');
  assert.equal(typeof persistenceRead.readTaskRecordPersistence, 'function');
  assert.equal(persistenceRead.createTaskRecordPersistence, undefined);

  const compatibility = runtimeProvide(runtime, TASK_RECORD_COMPATIBILITY);
  assert.equal(compatibility.owner, 'bootstrap-and-module-contracts');
  assert.match(compatibility.scope, /existing runtime consumers only/);
  assert.match(compatibility.exit, /legacy-exit-and-conformance/);
  assert.deepEqual(compatibility.testSupportMethods, ['createTaskRecordPersistence', 'mutateTaskRecordPersistence', 'writeTaskRecordPersistence']);
});
