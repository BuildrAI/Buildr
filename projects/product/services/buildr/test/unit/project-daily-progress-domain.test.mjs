import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDailyProgressDocument,
  dailyProgressError,
  groupDailyProgressCommits,
  isDailyProgressDate,
  isLegacyDailyProgressDocument,
  localCalendarDate,
  normalizeDailyProgressDate,
  normalizeDailyProgressDocument,
  normalizeDailyProgressPayload,
} from '../../src/domain/project-daily-progress/project-daily-progress.mjs';

function summary() {
  return {
    added: '新增提交列表。',
    updated: '更新 schema。',
    deleted: '删除必填 Task。',
    drawbacks: '未提交不进日报。',
  };
}

function payload(overrides = {}) {
  return normalizeDailyProgressPayload({
    daySummary: summary(),
    commits: [
      {
        sha: 'c3a91f2',
        subject: '完成项目每日演进提案。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['task-one', 'task-two'],
      },
    ],
    files: [{ path: 'README.md', kind: 'modified' }],
    ...overrides,
  });
}

test('日历日只接受合法 YYYY-MM-DD，省略时使用本机本地时区', () => {
  assert.equal(isDailyProgressDate('2026-08-18'), true);
  assert.equal(isDailyProgressDate('2026-02-30'), false);
  assert.equal(isDailyProgressDate('26-08-18'), false);
  assert.equal(normalizeDailyProgressDate('2026-08-18'), '2026-08-18');
  assert.match(localCalendarDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => normalizeDailyProgressDate('2026-13-01'), (error) => error.code === 'daily_progress_date_invalid');
});

test('提交允许空 Task，他人提交禁止挂 Task', () => {
  const empty = payload({
    commits: [{
      sha: '8e12b44',
      subject: '未关联任务的自己的提交。',
      authorName: '王志宏',
      authorEmail: 'wangzhihong@example.com',
      authorship: 'self',
      taskIds: [],
    }],
  });
  assert.deepEqual(empty.commits[0].taskIds, []);
  assert.throws(() => payload({
    commits: [{
      sha: '9aa1111',
      subject: '他人提交。',
      authorName: '李四',
      authorEmail: 'li.si@example.com',
      authorship: 'other',
      taskIds: ['task-one'],
    }],
  }), (error) => error.code === 'daily_progress_foreign_task_forbidden');
  assert.throws(() => normalizeDailyProgressPayload({
    daySummary: { added: 'a', updated: 'u', deleted: '', drawbacks: 'd' },
    commits: [],
    files: [],
  }), (error) => error.code === 'daily_progress_field_invalid');
  assert.throws(() => normalizeDailyProgressPayload({
    daySummary: summary(),
    commits: [],
    files: [],
    gitAuthors: [],
  }), (error) => error.code === 'daily_progress_field_forbidden');
});

test('按人按 email 分组，按任务排除他人提交', () => {
  const commits = [
    {
      sha: 'c3a91f2',
      subject: '自己的关联提交',
      authorName: '王志宏',
      authorEmail: 'wangzhihong@example.com',
      authorship: 'self',
      taskIds: ['task-one'],
    },
    {
      sha: '8e12b44',
      subject: '自己的未关联提交',
      authorName: '王志宏',
      authorEmail: 'wangzhihong@example.com',
      authorship: 'self',
      taskIds: [],
    },
    {
      sha: '9aa1111',
      subject: '他人提交',
      authorName: '李四',
      authorEmail: 'li.si@example.com',
      authorship: 'other',
      taskIds: [],
    },
  ];
  const people = groupDailyProgressCommits(commits, 'person');
  assert.equal(people.length, 2);
  const tasks = groupDailyProgressCommits(commits, 'task');
  assert.ok(tasks.some((group) => group.key === 'task-one'));
  assert.ok(tasks.some((group) => group.key === 'unlinked'));
  assert.equal(tasks.some((group) => group.commits.some((commit) => commit.authorship === 'other')), false);
});

test('创建文档使用 v2 closed schema，v1 标为 incompatible', () => {
  const document = createDailyProgressDocument({
    project: 'product',
    date: '2026-08-18',
    recordedAt: '2026-08-18T10:00:00.000Z',
    ...payload(),
  });
  assert.equal(document.schemaVersion, 'buildr.project-daily-progress/v2');
  assert.equal(isLegacyDailyProgressDocument({ schemaVersion: 'buildr.project-daily-progress/v1', items: [] }), true);
  assert.throws(() => normalizeDailyProgressDocument({
    schemaVersion: 'buildr.project-daily-progress/v1',
    project: 'product',
    date: '2026-08-18',
    recordedAt: '2026-08-18T10:00:00.000Z',
    items: [],
  }), (error) => error.code === 'daily_progress_schema_incompatible');
  assert.throws(() => normalizeDailyProgressDocument({
    schemaVersion: 'buildr.project-daily-progress/v2',
    project: 'product',
    date: '2026-08-18',
    recordedAt: '2026-08-18T10:00:00.000Z',
    ...payload(),
    file: '/tmp/secret.yml',
  }), (error) => error.code === 'daily_progress_field_forbidden');
  const error = dailyProgressError('daily_progress_task_missing', 'missing', 409);
  assert.equal(error.dailyProgressBusiness, true);
});
