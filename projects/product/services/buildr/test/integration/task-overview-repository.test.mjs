import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-overview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  const record = (taskId, parentTaskId = null) => ({
    schemaVersion: 'buildr.task-record/v2', taskId, title: taskId, intent: 'Verify one-query overview', scope: { projects: [], services: [] }, changes: [], parentTaskId, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null, createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
  });
  runtime.createTaskRecordPersistence(root, record('overview-task'));
  runtime.createTaskRecordPersistence(root, record('overview-child', 'overview-task'));
  return { root: fs.realpathSync(root), runtime };
}

test('Task Overview以一条SQLite查询组合专业最小保存事实', (t) => {
  const { root, runtime } = fixture(t);
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  const database = opened.database;
  const planningJson = JSON.stringify({ targetIdentity: 'sha256-plan', conclusion: { outcome: 'ready' }, completedAt: '2026-08-08T00:01:00.000Z' });
  const developmentJson = JSON.stringify({ gates: { planning: { targetIdentity: 'sha256-plan', resultDigest: `sha256-${'0'.repeat(64)}`, outcome: 'ready' }, completion: null, verification: null } });
  database.prepare("INSERT INTO task_development_current(task_id, record_json, applicability_status, applicability_json, observed_at) VALUES ('overview-task', ?, 'planning', ?, '2026-08-08T00:02:00.000Z')").run(developmentJson, JSON.stringify({ status: 'planning', reasons: [] }));
  database.prepare("INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES ('overview-task', 'planning', ?, 'sha256-plan', 'ready', '2026-08-08T00:01:00.000Z')").run(planningJson);
  database.prepare("INSERT INTO task_environment_current(task_id, status, receipt_json, updated_at) VALUES ('overview-task', 'ready', '{}', '2026-08-08T00:03:00.000Z')").run();
  database.close();

  const persistence = runtime.readTaskOverviewPersistence(root, 'overview-task');
  assert.equal(persistence.queryCount, 1);
  const overview = runtime.inspectTaskOverview(root, 'overview-task');
  assert.equal(overview.task.status, 'active');
  assert.deepEqual(overview.task.children.map((child) => child.taskId), ['overview-child']);
  assert.equal(overview.development.status, 'planning');
  assert.equal(overview.reviews.planning.present, true);
  assert.equal(overview.verification.present, false);
  assert.equal(overview.environment.status, 'ready');
  assert.equal(overview.finish.current.present, false);
  assert.equal(overview.finish.completion.present, false);
  assert.equal(JSON.stringify(overview).includes('result_json'), false);
});

test('Task Overview缺失专业rows时返回稳定missing语义且不写数据库', (t) => {
  const { root, runtime } = fixture(t);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.statSync(file).mtimeMs;
  const overview = runtime.inspectTaskOverview(root, 'overview-child');
  assert.equal(overview.development.present, false);
  assert.equal(overview.development.status, 'unknown');
  assert.equal(overview.reviews.planning.present, false);
  assert.equal(overview.verification.present, false);
  assert.equal(overview.environment.present, false);
  assert.equal(fs.statSync(file).mtimeMs, before);
});
