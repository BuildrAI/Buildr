export const PROJECT_DAILY_PROGRESS_SCHEMA = 'buildr.project-daily-progress/v2';
export const PROJECT_DAILY_PROGRESS_SCHEMA_V1 = 'buildr.project-daily-progress/v1';
export const DAILY_PROGRESS_GROUPS = Object.freeze(['day', 'person', 'task']);
export const COMMIT_AUTHORSHIP = Object.freeze(['self', 'other']);
export const FILE_CHANGE_KINDS = Object.freeze(['added', 'modified', 'deleted']);
export const UNLINKED_TASK_LABEL = '未关联任务';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TASK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const RELATIVE_PATH_PATTERN = /^(?!\.\.(?:\/|$))(?!\/)(?![A-Za-z]:)(?!\\)[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
const DOCUMENT_FIELDS = Object.freeze(['schemaVersion', 'project', 'date', 'recordedAt', 'daySummary', 'commits', 'files']);
const SUMMARY_FIELDS = Object.freeze(['added', 'updated', 'deleted', 'drawbacks']);
const COMMIT_FIELDS = Object.freeze(['sha', 'subject', 'authorName', 'authorEmail', 'authorship', 'taskIds']);
const FILE_FIELDS = Object.freeze(['path', 'kind']);
const PAYLOAD_FIELDS = Object.freeze(['daySummary', 'commits', 'files']);

export function dailyProgressError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.dailyProgressBusiness = true;
  return error;
}

export function localCalendarDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDailyProgressDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [, yearText, monthText, dayText] = value.match(DATE_PATTERN);
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      const name = field ? `${field}.${key}` : key;
      throw dailyProgressError('daily_progress_field_forbidden', `每日演进不支持字段：${name}。`, 400, { field: name });
    }
  }
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw dailyProgressError('daily_progress_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function nonEmptyText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw dailyProgressError('daily_progress_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

function identity(value, field, pattern = IDENTITY_PATTERN) {
  const normalized = nonEmptyText(value, field);
  if (!pattern.test(normalized)) {
    throw dailyProgressError('daily_progress_identity_invalid', `${field} 不是合法 identity。`, 400, { field, value: normalized });
  }
  return normalized;
}

function unique(values, key, field) {
  const seen = new Set();
  for (const value of values) {
    const identityKey = key(value);
    if (seen.has(identityKey)) {
      throw dailyProgressError('daily_progress_reference_duplicate', `${field} 包含重复引用：${identityKey}。`, 409, { field, identity: identityKey });
    }
    seen.add(identityKey);
  }
  return values;
}

export function normalizeDailyProgressDate(value, field = 'date') {
  const date = nonEmptyText(value, field);
  if (!isDailyProgressDate(date)) {
    throw dailyProgressError('daily_progress_date_invalid', `${field} 必须是合法 YYYY-MM-DD 日历日。`, 400, { field, value: date });
  }
  return date;
}

export function normalizeDailyProgressGroup(value) {
  if (value === undefined || value === null || value === '') return 'day';
  const group = nonEmptyText(value, 'group');
  if (!DAILY_PROGRESS_GROUPS.includes(group)) {
    throw dailyProgressError('daily_progress_group_invalid', 'group 必须是 day、person 或 task。', 400, { field: 'group', value: group });
  }
  return group;
}

function normalizeDaySummary(value) {
  const summary = object(value, 'daySummary');
  closed(summary, new Set(SUMMARY_FIELDS), 'daySummary');
  return {
    added: nonEmptyText(summary.added, 'daySummary.added'),
    updated: nonEmptyText(summary.updated, 'daySummary.updated'),
    deleted: nonEmptyText(summary.deleted, 'daySummary.deleted'),
    drawbacks: nonEmptyText(summary.drawbacks, 'daySummary.drawbacks'),
  };
}

function normalizeTaskIds(value, field, authorship) {
  if (!Array.isArray(value)) {
    throw dailyProgressError('daily_progress_field_invalid', `${field} 必须是数组。`, 400, { field });
  }
  const taskIds = unique(value.map((taskId, index) => identity(taskId, `${field}[${index}]`, TASK_ID_PATTERN)), (taskId) => taskId, field);
  if (authorship === 'other' && taskIds.length) {
    throw dailyProgressError('daily_progress_foreign_task_forbidden', `${field}：他人提交不得关联 Task。`, 400, { field });
  }
  return taskIds;
}

function normalizeCommit(value, index) {
  const field = `commits[${index}]`;
  const commit = object(value, field);
  closed(commit, new Set(COMMIT_FIELDS), field);
  const authorship = nonEmptyText(commit.authorship, `${field}.authorship`);
  if (!COMMIT_AUTHORSHIP.includes(authorship)) {
    throw dailyProgressError('daily_progress_authorship_invalid', `${field}.authorship 必须是 self 或 other。`, 400, { field: `${field}.authorship`, value: authorship });
  }
  return {
    sha: identity(commit.sha, `${field}.sha`, SHA_PATTERN).toLowerCase(),
    subject: nonEmptyText(commit.subject, `${field}.subject`),
    authorName: nonEmptyText(commit.authorName, `${field}.authorName`),
    authorEmail: nonEmptyText(commit.authorEmail, `${field}.authorEmail`),
    authorship,
    taskIds: normalizeTaskIds(commit.taskIds === undefined ? [] : commit.taskIds, `${field}.taskIds`, authorship),
  };
}

function normalizeFile(value, index) {
  const field = `files[${index}]`;
  const file = object(value, field);
  closed(file, new Set(FILE_FIELDS), field);
  const kind = nonEmptyText(file.kind, `${field}.kind`);
  if (!FILE_CHANGE_KINDS.includes(kind)) {
    throw dailyProgressError('daily_progress_file_kind_invalid', `${field}.kind 必须是 added、modified 或 deleted。`, 400, { field: `${field}.kind`, value: kind });
  }
  const filePath = nonEmptyText(file.path, `${field}.path`);
  if (!RELATIVE_PATH_PATTERN.test(filePath) || filePath.includes('..')) {
    throw dailyProgressError('daily_progress_path_invalid', `${field}.path 必须是相对路径，且不得暴露本机绝对路径。`, 400, { field: `${field}.path` });
  }
  return { path: filePath, kind };
}

export function normalizeDailyProgressPayload(input) {
  const payload = object(input, 'payload');
  closed(payload, new Set(PAYLOAD_FIELDS), 'payload');
  if (!Array.isArray(payload.commits)) {
    throw dailyProgressError('daily_progress_field_invalid', 'payload.commits 必须是数组。', 400, { field: 'commits' });
  }
  if (!Array.isArray(payload.files)) {
    throw dailyProgressError('daily_progress_field_invalid', 'payload.files 必须是数组。', 400, { field: 'files' });
  }
  const commits = payload.commits.map((commit, index) => normalizeCommit(commit, index));
  unique(commits, (commit) => commit.sha, 'commits');
  const files = payload.files.map((file, index) => normalizeFile(file, index));
  unique(files, (file) => file.path, 'files');
  return {
    daySummary: normalizeDaySummary(payload.daySummary),
    commits,
    files,
  };
}

export function isLegacyDailyProgressDocument(input) {
  return Boolean(input && typeof input === 'object' && !Array.isArray(input) && input.schemaVersion === PROJECT_DAILY_PROGRESS_SCHEMA_V1);
}

export function normalizeDailyProgressDocument(input, expected = {}) {
  const document = object(input, 'document');
  if (isLegacyDailyProgressDocument(document)) {
    throw dailyProgressError(
      'daily_progress_schema_incompatible',
      '当天文件仍是 v1 推进项形状，需要 Agent 按 Git 提交重跑覆盖。',
      409,
      { schemaVersion: document.schemaVersion },
      '交给 Agent 收集当日 Git 后重新 record。',
    );
  }
  closed(document, new Set(DOCUMENT_FIELDS), 'document');
  if (document.schemaVersion !== PROJECT_DAILY_PROGRESS_SCHEMA) {
    throw dailyProgressError('daily_progress_schema_unsupported', `不支持的每日演进 schema：${document.schemaVersion || '<missing>'}。`, 400, { schemaVersion: document.schemaVersion });
  }
  const project = identity(document.project, 'project');
  const date = normalizeDailyProgressDate(document.date);
  if (expected.project && expected.project !== project) {
    throw dailyProgressError('daily_progress_project_mismatch', '文件中的 Project 与请求不一致。', 409, { project, expected: expected.project });
  }
  if (expected.date && expected.date !== date) {
    throw dailyProgressError('daily_progress_date_mismatch', '文件中的日期与请求不一致。', 409, { date, expected: expected.date });
  }
  const payload = normalizeDailyProgressPayload({
    daySummary: document.daySummary,
    commits: document.commits,
    files: document.files,
  });
  return {
    schemaVersion: PROJECT_DAILY_PROGRESS_SCHEMA,
    project,
    date,
    recordedAt: nonEmptyText(document.recordedAt, 'recordedAt'),
    ...payload,
  };
}

export function createDailyProgressDocument({ project, date, daySummary, commits, files, recordedAt }) {
  return normalizeDailyProgressDocument({
    schemaVersion: PROJECT_DAILY_PROGRESS_SCHEMA,
    project,
    date,
    recordedAt,
    daySummary,
    commits,
    files,
  });
}

export function groupDailyProgressCommits(commits, group) {
  const mode = normalizeDailyProgressGroup(group);
  if (mode === 'day') {
    return [{ key: 'day', label: '按日', commits }];
  }
  if (mode === 'person') {
    const groups = new Map();
    for (const commit of commits) {
      const key = commit.authorEmail;
      const label = `${commit.authorName} · ${commit.authorEmail}`;
      if (!groups.has(key)) groups.set(key, { key, label, commits: [] });
      groups.get(key).commits.push(commit);
    }
    return [...groups.values()];
  }
  const groups = new Map();
  for (const commit of commits) {
    if (commit.authorship !== 'self') continue;
    const refs = commit.tasks || commit.taskIds.map((taskId) => ({ taskId }));
    if (!refs.length) {
      if (!groups.has('unlinked')) groups.set('unlinked', { key: 'unlinked', label: UNLINKED_TASK_LABEL, commits: [] });
      groups.get('unlinked').commits.push(commit);
      continue;
    }
    for (const task of refs) {
      const key = task.taskId;
      const label = task.resolved === false ? `${task.taskId}（未解析）` : (task.title || task.taskId);
      if (!groups.has(key)) groups.set(key, { key, label, commits: [] });
      groups.get(key).commits.push(commit);
    }
  }
  return [...groups.values()];
}
