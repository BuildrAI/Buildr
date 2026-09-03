import {
  createDailyProgressDocument,
  dailyProgressError,
  groupDailyProgressCommits,
  localCalendarDate,
  normalizeDailyProgressDate,
  normalizeDailyProgressGroup,
  normalizeDailyProgressPayload,
} from '../domain/project-daily-progress.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';

function assertObject(value: any, label: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw dailyProgressError('daily_progress_input_invalid', `${label} 必须是对象。`);
  }
}

function assertFields(value: any, fields: any, label: any) {
  assertObject(value, label);
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) throw dailyProgressError('daily_progress_field_forbidden', `${label}.${field} 不受支持。`, 400, { field });
  }
}

function identity(value: any, field: any) {
  if (typeof value !== 'string' || !value.trim()) {
    throw dailyProgressError('daily_progress_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

export function registerProjectDailyProgressApplication(runtime: any) {
  function registeredProject(targetRoot: any, projectCode: any) {
    const code = identity(projectCode, 'project');
    const record = runtime.readProjectRegistryRecord(targetRoot);
    const project = record.projects[code];
    if (!project) {
      throw dailyProgressError('daily_progress_project_unknown', `Project 未登记：${code}。`, 404, { project: code }, '先登记 Project，再记录每日演进。');
    }
    return project;
  }

  function resolveTask(targetRoot: any, taskId: any) {
    try {
      const inspected = runtime.inspectTaskRecord(targetRoot, taskId);
      return { taskId, title: inspected.record.title, status: inspected.record.status, resolved: true };
    } catch (error: any) {
      if (error.code === 'task_record_not_found') {
        return { taskId, title: null, status: null, resolved: false };
      }
      throw error;
    }
  }

  function hydrateCommits(targetRoot: any, commits: any) {
    return commits.map((commit: any) => ({
      ...commit,
      tasks: commit.taskIds.map((taskId: any) => resolveTask(targetRoot, taskId)),
    }));
  }

  function assertExistingTasks(targetRoot: any, commits: any) {
    const missing: any[] = [];
    const seen = new Set();
    for (const commit of commits) {
      for (const taskId of commit.taskIds) {
        if (seen.has(taskId)) continue;
        seen.add(taskId);
        const resolved = resolveTask(targetRoot, taskId);
        if (!resolved.resolved) missing.push(taskId);
      }
    }
    if (missing.length) {
      throw dailyProgressError(
        'daily_progress_task_missing',
        `每日演进引用了不存在的 Task：${missing.join('、')}。`,
        409,
        { taskIds: missing },
        '只关联当前 Workspace 已有 Task ID，整次 record 不会写入。',
      );
    }
    return seen.size;
  }

  function publicCommits(commits: any) {
    return commits.map((commit: any) => ({
      sha: commit.sha,
      subject: commit.subject,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authorship: commit.authorship,
      taskIds: commit.taskIds,
      tasks: commit.tasks,
    }));
  }

  function inspectPayload(project: any, date: any, group: any, document: any, commits: any, incompatible: any) {
    const present = Boolean(document);
    const status = incompatible ? 'incompatible' : present ? 'inspected' : 'not-found';
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.dailyProgressInspectResult, {
      operation: 'inspect',
      status,
      project: project.code,
      projectName: project.name,
      date,
      group,
      recordedAt: document?.recordedAt || null,
      daySummary: document?.daySummary || null,
      itemCount: commits.length,
      commitCount: commits.length,
      taskReferenceCount: new Set(commits.flatMap((commit: any) => commit.taskIds)).size,
      unresolvedTaskCount: commits.reduce((count: any, commit: any) => count + commit.tasks.filter((task: any) => !task.resolved).length, 0),
      commits: publicCommits(commits),
      files: document?.files || [],
      groups: groupDailyProgressCommits(commits, group).map((section: any) => ({
        key: section.key,
        label: section.label,
        commits: publicCommits(section.commits),
      })),
      diagnostic: incompatible
        ? { code: 'daily_progress_schema_incompatible', message: '当天文件仍是 v1 形状，需要 Agent 按 Git 提交重跑覆盖。' }
        : present ? null : { code: 'daily_progress_not_found', message: '当天还没有每日演进文件。' },
      effects: [],
      nextActions: present && !incompatible ? [] : ['交给 Agent 先同步最新代码，再收集当日 Git 并生成当天每日演进。'],
    });
  }

  function recordProjectDailyProgress(targetRoot: any, input: any) {
    assertFields(input, new Set(['project', 'date', 'payload', 'recordedAt']), '每日演进 record');
    const project = registeredProject(targetRoot, input.project);
    const date = input.date === undefined || input.date === null || input.date === ''
      ? localCalendarDate()
      : normalizeDailyProgressDate(input.date);
    const payload = normalizeDailyProgressPayload(input.payload);
    const taskReferenceCount = assertExistingTasks(targetRoot, payload.commits);
    const recordedAt = typeof input.recordedAt === 'string' && input.recordedAt.trim()
      ? input.recordedAt.trim()
      : new Date().toISOString();
    const document = createDailyProgressDocument({
      project: project.code,
      date,
      daySummary: payload.daySummary,
      commits: payload.commits,
      files: payload.files,
      recordedAt,
    });
    const written = runtime.writeDailyProgressDocument(targetRoot, document);
    const commits = hydrateCommits(targetRoot, written.document.commits);
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.dailyProgressRecordResult, {
      operation: 'record',
      status: 'recorded',
      project: project.code,
      projectName: project.name,
      date,
      recordedAt: written.document.recordedAt,
      itemCount: commits.length,
      commitCount: commits.length,
      taskReferenceCount,
      daySummary: written.document.daySummary,
      commits: publicCommits(commits),
      files: written.document.files,
      diagnostic: null,
      effects: [{ type: 'recorded', project: project.code, date }],
      nextActions: [],
    });
  }

  function inspectProjectDailyProgress(targetRoot: any, input: any = {}) {
    assertFields(input, new Set(['project', 'date', 'group']), '每日演进 inspect');
    const project = registeredProject(targetRoot, input.project);
    const date = input.date === undefined || input.date === null || input.date === ''
      ? localCalendarDate()
      : normalizeDailyProgressDate(input.date);
    const group = normalizeDailyProgressGroup(input.group);
    const read = runtime.readDailyProgressDocument(targetRoot, project.code, date);
    const commits = read.document ? hydrateCommits(targetRoot, read.document.commits) : [];
    return inspectPayload(project, date, group, read.document, commits, Boolean(read.incompatible));
  }

  function listProjectDailyProgress(targetRoot: any, input: any = {}) {
    assertFields(input, new Set(['project']), '每日演进 list');
    const project = registeredProject(targetRoot, input.project);
    const dates = runtime.listDailyProgressDates(targetRoot, project.code);
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.dailyProgressListResult, {
      operation: 'list',
      status: 'listed',
      project: project.code,
      projectName: project.name,
      dates,
      itemCount: dates.length,
      diagnostic: null,
      effects: [],
      nextActions: dates.length ? [] : ['交给 Agent 先同步最新代码，再收集当日 Git 并生成当天每日演进。'],
    });
  }

  function inspectTaskDailyProgress(targetRoot: any, taskIdValue: any) {
    const taskId = identity(taskIdValue, 'taskId');
    const task = runtime.inspectTaskRecord(targetRoot, taskId);
    const registry = runtime.readProjectRegistryRecord(targetRoot);
    const items: any[] = [];
    for (const document of runtime.listDailyProgressDocuments(targetRoot)) {
      const project = registry.projects[document.project];
      if (!project) continue;
      const hydrated = hydrateCommits(targetRoot, document.commits);
      for (const commit of hydrated) {
        if (!commit.taskIds.includes(taskId)) continue;
        items.push({
          project: project.code,
          projectName: project.name,
          date: document.date,
          recordedAt: document.recordedAt,
          item: {
            id: commit.sha,
            summary: commit.subject,
            author: commit.authorName,
            sha: commit.sha,
            authorship: commit.authorship,
          },
        });
      }
    }
    items.sort((left: any, right: any) => right.date.localeCompare(left.date) || left.item.id.localeCompare(right.item.id));
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.dailyProgressTaskView, {
      operation: 'inspect-task',
      status: 'inspected',
      taskId,
      taskTitle: task.record.title,
      itemCount: items.length,
      items,
      diagnostic: null,
      effects: [],
      nextActions: [],
    });
  }

  Object.assign(runtime, {
    recordProjectDailyProgress,
    inspectProjectDailyProgress,
    listProjectDailyProgress,
    inspectTaskDailyProgress,
  });
  return runtime;
}
