import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { WORKSPACE_ROOT_GITIGNORE_ENTRIES } from '../../src/application/workspace/workspace-root-gitignore-entries.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-daily-progress-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previousLog = console.log;
  console.log = () => {};
  const runtime = createRuntime();
  try {
    runtime.initBuildr(['--target', root, '--name', 'Daily', '--description', 'Daily progress fixture', '--profile', 'team']);
    runtime.createProject(['demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  } finally {
    console.log = previousLog;
  }
  runtime.createTaskRecord(root, { taskId: 'task-one', title: 'First', intent: 'First intent', projects: ['demo'], services: [], changes: [] });
  runtime.createTaskRecord(root, { taskId: 'task-two', title: 'Second', intent: 'Second intent', projects: ['demo'], services: [], changes: [] });
  return { root: fs.realpathSync(root), runtime };
}

function payload(overrides = {}) {
  return {
    daySummary: {
      added: '新增提交列表。',
      updated: '更新 schema。',
      deleted: '删除必填 Task。',
      drawbacks: '未提交不进日报。',
    },
    commits: [
      {
        sha: 'c3a91f2',
        subject: '一条提交关联两个 Task。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['task-one', 'task-two'],
      },
      {
        sha: '8e12b44',
        subject: '同一 Task 出现在第二条提交。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['task-one'],
      },
    ],
    files: [{ path: 'README.md', kind: 'modified' }],
    ...overrides,
  };
}

test('init 写入每日演进 ignore，且不得忽略整个 .buildr', (t) => {
  const { root } = fixture(t);
  const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line) => line === '/.buildr/daily-progress/').length, 1);
  assert.equal(lines.includes('/.buildr/'), false);
  assert.ok(WORKSPACE_ROOT_GITIGNORE_ENTRIES.includes('/.buildr/daily-progress/'));
});

test('未登记 Project 与非法日期 fail closed 且不创建目录', (t) => {
  const { root, runtime } = fixture(t);
  const before = fs.existsSync(path.join(root, '.buildr', 'daily-progress'));
  assert.throws(() => runtime.recordProjectDailyProgress(root, {
    project: 'missing',
    date: '2026-08-18',
    payload: payload(),
  }), (error) => error.code === 'daily_progress_project_unknown');
  assert.throws(() => runtime.recordProjectDailyProgress(root, {
    project: 'demo',
    date: '2026-02-30',
    payload: payload(),
  }), (error) => error.code === 'daily_progress_date_invalid');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'daily-progress')), before);
});

test('合法 record 写入 v2 YAML、覆盖重跑，且不写 Task Record', (t) => {
  const { root, runtime } = fixture(t);
  const before = runtime.inspectTaskRecord(root, 'task-one').recordDigest;
  const recorded = runtime.recordProjectDailyProgress(root, {
    project: 'demo',
    date: '2026-08-18',
    payload: payload(),
  });
  assert.equal(recorded.status, 'recorded');
  assert.equal(recorded.itemCount, 2);
  assert.equal(recorded.taskReferenceCount, 2);
  assert.equal(Object.hasOwn(recorded, 'file'), false);
  assert.doesNotMatch(JSON.stringify(recorded), /\/Users\/|workspace\.sqlite/);
  const file = path.join(root, '.buildr', 'daily-progress', 'demo', '2026-08-18.yml');
  const other = path.join(root, '.buildr', 'daily-progress', 'demo', '2026-08-17.yml');
  fs.writeFileSync(other, 'keep\n');
  const document = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(document.schemaVersion, 'buildr.project-daily-progress/v2');
  assert.equal(document.project, 'demo');
  assert.equal(document.commits[0].taskIds.length, 2);
  const overwritten = runtime.recordProjectDailyProgress(root, {
    project: 'demo',
    date: '2026-08-18',
    payload: payload({
      commits: [{
        sha: 'def5678',
        subject: '覆盖后的提交。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['task-two'],
      }],
    }),
  });
  assert.equal(overwritten.itemCount, 1);
  assert.equal(YAML.parse(fs.readFileSync(file, 'utf8')).commits[0].sha, 'def5678');
  assert.equal(fs.readFileSync(other, 'utf8'), 'keep\n');
  assert.equal(runtime.inspectTaskRecord(root, 'task-one').recordDigest, before);
});

test('缺失 Task 或他人提交挂 Task 整次失败且不覆盖已有文件', (t) => {
  const { root, runtime } = fixture(t);
  runtime.recordProjectDailyProgress(root, { project: 'demo', date: '2026-08-18', payload: payload() });
  const file = path.join(root, '.buildr', 'daily-progress', 'demo', '2026-08-18.yml');
  const previous = fs.readFileSync(file, 'utf8');
  assert.throws(() => runtime.recordProjectDailyProgress(root, {
    project: 'demo',
    date: '2026-08-18',
    payload: payload({
      commits: [{
        sha: 'aaa1111',
        subject: '引用不存在 Task。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['missing-task'],
      }],
    }),
  }), (error) => error.code === 'daily_progress_task_missing');
  assert.throws(() => runtime.recordProjectDailyProgress(root, {
    project: 'demo',
    date: '2026-08-18',
    payload: payload({
      commits: [{
        sha: 'bbb2222',
        subject: '他人提交带 Task。',
        authorName: '李四',
        authorEmail: 'li.si@example.com',
        authorship: 'other',
        taskIds: ['task-one'],
      }],
    }),
  }), (error) => error.code === 'daily_progress_foreign_task_forbidden');
  assert.equal(fs.readFileSync(file, 'utf8'), previous);
});

test('inspect 投影、v1 incompatible、未解析 Task 不改文件', (t) => {
  const { root, runtime } = fixture(t);
  runtime.recordProjectDailyProgress(root, { project: 'demo', date: '2026-08-18', payload: payload() });
  const file = path.join(root, '.buildr', 'daily-progress', 'demo', '2026-08-18.yml');
  const previous = fs.readFileSync(file, 'utf8');
  const document = YAML.parse(previous);
  document.commits[0].taskIds = ['task-one', 'gone-task'];
  fs.writeFileSync(file, YAML.stringify(document));
  const inspected = runtime.inspectProjectDailyProgress(root, { project: 'demo', date: '2026-08-18', group: 'task' });
  assert.equal(inspected.status, 'inspected');
  assert.equal(inspected.unresolvedTaskCount > 0, true);
  const unresolved = inspected.commits[0].tasks.find((task) => task.taskId === 'gone-task');
  assert.equal(unresolved.resolved, false);
  const byPerson = runtime.inspectProjectDailyProgress(root, { project: 'demo', date: '2026-08-18', group: 'person' });
  assert.ok(byPerson.groups.some((group) => group.label.includes('王志宏')));
  const listed = runtime.listProjectDailyProgress(root, { project: 'demo' });
  assert.deepEqual(listed.dates, ['2026-08-18']);
  const missing = runtime.inspectProjectDailyProgress(root, { project: 'demo', date: '2026-08-01' });
  assert.equal(missing.status, 'not-found');
  const v1 = path.join(root, '.buildr', 'daily-progress', 'demo', '2026-08-17.yml');
  fs.writeFileSync(v1, YAML.stringify({
    schemaVersion: 'buildr.project-daily-progress/v1',
    project: 'demo',
    date: '2026-08-17',
    recordedAt: '2026-08-17T10:00:00.000Z',
    items: [{ id: 'item-old', summary: '旧推进项', taskIds: ['task-one'] }],
  }));
  const incompatible = runtime.inspectProjectDailyProgress(root, { project: 'demo', date: '2026-08-17' });
  assert.equal(incompatible.status, 'incompatible');
  const reverse = runtime.inspectTaskDailyProgress(root, 'task-one');
  assert.equal(reverse.itemCount, 2);
  assert.equal(fs.readFileSync(file, 'utf8').includes('gone-task'), true);
});

test('CLI record/inspect/list 使用稳定 JSON schema 且 discovery 可用', (t) => {
  const { root, runtime } = fixture(t);
  const buildr = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const input = path.join(root, 'payload.json');
  fs.writeFileSync(input, JSON.stringify(payload({
    commits: [{
      sha: 'c3a91f2',
      subject: 'CLI 写入提交。',
      authorName: '王志宏',
      authorEmail: 'wangzhihong@example.com',
      authorship: 'self',
      taskIds: ['task-one'],
    }],
  })));
  const record = spawnSync(process.execPath, [buildr, 'project', 'daily-progress', 'record', '--project', 'demo', '--date', '2026-08-18', '--input', input, '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(record.status, 0, record.stderr);
  const recorded = JSON.parse(record.stdout);
  assert.equal(recorded.schemaVersion, 'buildr.project-daily-progress-record-result/v1');
  assert.equal(recorded.itemCount, 1);
  const inspect = spawnSync(process.execPath, [buildr, 'project', 'daily-progress', 'inspect', '--project', 'demo', '--date', '2026-08-18', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).schemaVersion, 'buildr.project-daily-progress-inspect-result/v1');
  const list = spawnSync(process.execPath, [buildr, 'project', 'daily-progress', 'list', '--project', 'demo', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).schemaVersion, 'buildr.project-daily-progress-list-result/v1');
  const schema = spawnSync(process.execPath, [buildr, 'project', 'daily-progress', 'record', '--schema', '--json'], { encoding: 'utf8' });
  assert.equal(schema.status, 0, schema.stderr);
  assert.equal(JSON.parse(schema.stdout).schemaVersion, 'buildr.project-daily-progress-input-schema/v1');
  assert.equal(runtime.inspectTaskRecord(root, 'task-one').record.taskId, 'task-one');
});
