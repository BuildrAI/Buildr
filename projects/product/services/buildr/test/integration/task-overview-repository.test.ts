import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const test = createBuildrApplicationTest('integration-task-overview-repository');

type OverviewResult = {
  schemaVersion: string;
  task: { status: string; children: Array<{ taskId: string }> };
  reviews: { planning: { present: boolean } };
  verification: { present: boolean };
  userSummary: { result: { status: string }; attention: Array<{ owner: string; scope: string; summary: string }> };
};

type TestRuntime = {
  createTaskRecordPersistence(root: string, record: object): unknown;
  openWorkspaceStructuredStore(root: string, options: { writable: true }): {
    database: { prepare(sql: string): { run(...values: Array<string>): unknown }; close(): void };
  };
  readTaskOverviewPersistence(root: string, taskId: string): { queryCount: number };
  inspectTaskOverview(root: string, taskId: string): OverviewResult;
};

type BuildrTestContext = TestContext & { buildrContexts: { application: TestRuntime } };

function fixture(t: BuildrTestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-overview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = t.buildrContexts.application;
  const record = (taskId: string, parentTaskId: string | null = null) => ({
    schemaVersion: 'buildr.task-record/v2', taskId, title: taskId, intent: 'Verify one-query overview', scope: { projects: [], services: [] }, changes: [], parentTaskId, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null, createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
  });
  runtime.createTaskRecordPersistence(root, record('overview-task'));
  runtime.createTaskRecordPersistence(root, record('overview-child', 'overview-task'));
  return { root: fs.realpathSync(root), runtime };
}

test('Task Overview以一条SQLite查询组合保留的专业事实', (t: BuildrTestContext) => {
  const { root, runtime } = fixture(t);
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  const planning = JSON.stringify({ schemaVersion: 'buildr.task-review-result/v2', taskId: 'overview-task', reviewType: 'planning', subjectIdentity: 'sha256-plan', method: 'self', reviewed: ['plan'], uncovered: [], findings: [], conclusion: { outcome: 'accepted', summary: 'accepted' }, completedAt: '2026-08-08T00:01:00.000Z' });
  opened.database.prepare("INSERT INTO task_review_current(task_id, review_type, result_json, subject_identity, outcome, updated_at) VALUES ('overview-task', 'planning', ?, 'sha256-plan', 'accepted', '2026-08-08T00:01:00.000Z')").run(planning);
  opened.database.close();

  assert.equal(runtime.readTaskOverviewPersistence(root, 'overview-task').queryCount, 1);
  const overview = runtime.inspectTaskOverview(root, 'overview-task');
  assert.equal(overview.schemaVersion, 'buildr.task-overview/v2');
  assert.equal(overview.task.status, 'active');
  assert.deepEqual(overview.task.children.map((child) => child.taskId), ['overview-child']);
  assert.equal(overview.reviews.planning.present, true);
  assert.equal(overview.verification.present, false);
  assert.equal(overview.userSummary.result.status, 'in-progress');
  assert.equal('environment' in overview, false);
  assert.equal('cleanup' in overview.userSummary, false);
  assert.equal('development' in overview, false);
  assert.equal('finish' in overview, false);
  assert.equal('authorization' in overview.userSummary, false);
});

test('Task Overview缺失专业rows时正常返回且不写数据库', (t: BuildrTestContext) => {
  const { root, runtime } = fixture(t);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.statSync(file).mtimeMs;
  const overview = runtime.inspectTaskOverview(root, 'overview-child');
  assert.equal(overview.reviews.planning.present, false);
  assert.equal(overview.verification.present, false);
  assert.equal(overview.userSummary.result.status, 'in-progress');
  assert.equal('environment' in overview, false);
  assert.equal('cleanup' in overview.userSummary, false);
  assert.equal(fs.statSync(file).mtimeMs, before);
});

test('Task Overview不把资源清理编造成Task结果的一部分', (t: BuildrTestContext) => {
  const { root, runtime } = fixture(t);
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.prepare("UPDATE tasks SET status = 'completed', result_summary = '已完成', result_no_change = 0 WHERE task_id = 'overview-task'").run();
  opened.database.close();

  const overview = runtime.inspectTaskOverview(root, 'overview-task');
  assert.equal(overview.userSummary.result.status, 'completed');
  assert.equal('cleanup' in overview.userSummary, false);
  assert.deepEqual(overview.userSummary.attention, []);
});
