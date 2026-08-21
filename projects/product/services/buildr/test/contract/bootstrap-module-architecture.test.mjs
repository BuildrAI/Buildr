import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRuntime, runtimeContributions, runtimeModuleSnapshot, runtimeProvide } from '../../src/bootstrap/runtime.mjs';
import {
  TASK_RECORD_APPLICATION,
  TASK_RECORD_COMPATIBILITY,
  TASK_RECORD_PERSISTENCE_READ,
  TASK_REVIEW_APPLICATION,
  TASK_REVIEW_COMPATIBILITY,
  TASK_REVIEW_PERSISTENCE_READ,
} from '../../src/task/module.mjs';
import { WEB_INSTANCE_LIFECYCLE } from '../../src/web/module.mjs';

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
  assert.doesNotMatch(httpHost, /task\/interfaces\/(?:cli|http)|task-(?:record|review)-http/);
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
  }, {
    id: 'task-review',
    requires: [TASK_RECORD_PERSISTENCE_READ, 'workspace.structured-store', 'change.resolver'],
    provides: [TASK_REVIEW_APPLICATION, TASK_REVIEW_PERSISTENCE_READ, TASK_REVIEW_COMPATIBILITY],
    contributions: {
      cli: ['task review inspect', 'task review record'],
      http: ['task-review.http'],
      diagnostics: [],
    },
    lifecycle: 'none',
  }, {
    id: 'web-instance-lifecycle',
    requires: [],
    provides: [WEB_INSTANCE_LIFECYCLE],
    contributions: {
      cli: ['web preview start', 'web preview list', 'web preview stop', 'web'],
      http: [],
      diagnostics: [],
    },
    lifecycle: 'none',
  }]);
  assert.deepEqual(runtimeContributions(runtime, 'cli').map((item) => item.key), [
    'task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon',
    'task review inspect', 'task review record',
    'web preview start', 'web preview list', 'web preview stop', 'web',
  ]);
  assert.deepEqual(runtimeContributions(runtime, 'http').map((item) => item.id), ['task-record.http', 'task-review.http']);

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

  const webLifecycle = runtimeProvide(runtime, WEB_INSTANCE_LIFECYCLE);
  assert.equal(typeof webLifecycle.startLocalWorkspaceApp, 'function');
  assert.equal(typeof webLifecycle.manageLocalAppPreview, 'function');
});

test('Task Review module 只公开共享 Application、只读 Persistence 与有退出条件的兼容 Facade', () => {
  const runtime = createRuntime();
  const application = runtimeProvide(runtime, TASK_REVIEW_APPLICATION);
  assert.deepEqual(Object.keys(application), ['inspectTaskReview', 'recordTaskReview', 'generateTaskReviewPrompt']);

  const persistenceRead = runtimeProvide(runtime, TASK_REVIEW_PERSISTENCE_READ);
  assert.equal(typeof persistenceRead.readTaskReviewResultPersistence, 'function');
  assert.equal(persistenceRead.writeTaskReviewResultPersistence, undefined);

  const compatibility = runtimeProvide(runtime, TASK_REVIEW_COMPATIBILITY);
  assert.equal(compatibility.owner, 'task-capabilities');
  assert.match(compatibility.scope, /existing runtime consumers only/);
  assert.match(compatibility.exit, /legacy-exit-and-conformance/);
  assert.deepEqual(Object.keys(compatibility.testSupportProperties), ['taskReviewSerialize']);
});

test('Task Review 旧全局技术层路径已经退出', () => {
  for (const relative of [
    'src/domain/task-review/task-review.mjs',
    'src/application/task-review/task-review-application.mjs',
    'src/interfaces/cli/task-review.mjs',
    'src/task/persistence/review/task-review-repository.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
});
