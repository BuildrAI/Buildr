import crypto from 'node:crypto';

type JsonObject = Record<string, unknown>;

type OverviewRow = {
  task_id: string;
  title: string;
  intent: string;
  status: 'todo' | 'active' | 'completed' | 'abandoned';
  result_summary: string | null;
  result_no_change: number | null;
  parent_task_id: string | null;
  parent_title: string | null;
  parent_status: string | null;
  children_json: string | null;
  created_at: string;
  updated_at: string;
  planning_json: string | null;
  planning_subject_identity: string | null;
  planning_outcome: string | null;
  planning_updated_at: string | null;
  completion_review_json: string | null;
  completion_review_subject_identity: string | null;
  completion_review_outcome: string | null;
  completion_review_updated_at: string | null;
  verification_json: string | null;
  verification_target_identity: string | null;
  verification_outcome: string | null;
  verification_updated_at: string | null;
};

type TaskOverviewRuntime = {
  readTaskOverviewPersistence(targetRoot: string, taskId: string): { row: OverviewRow };
  inspectTaskOverview?: (targetRoot: string, taskId: string) => JsonObject;
};

function digest(value: string | null): string | null {
  return value == null ? null : `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parsed(value: string | null): unknown {
  return value == null ? null : JSON.parse(value);
}

function userSummary(row: OverviewRow): JsonObject {
  const result = row.status === 'completed'
    ? {
        status: row.result_no_change === 1 ? 'not-applicable' : 'completed',
        summary: row.result_no_change === 1 ? '任务已完成且没有产生变更。' : '任务结果已保存。',
        source: 'task-record',
      }
    : row.status === 'abandoned'
      ? { status: 'abandoned', summary: row.result_summary ?? '任务已放弃。', source: 'task-record' }
      : row.status === 'active'
        ? { status: 'in-progress', summary: '任务正在进行。', source: 'task-record' }
        : { status: 'not-started', summary: '任务尚未开始。', source: 'task-record' };
  return {
    goal: { status: 'available', title: row.title, intent: row.intent },
    result,
    attention: [],
  };
}

function resultSlot(serialized: string | null, identityField: 'subject' | 'target', identityValue: string | null, outcome: string | null, updatedAt: string | null) {
  return {
    present: serialized != null,
    [`${identityField}Identity`]: identityValue,
    outcome,
    updatedAt,
    resultDigest: digest(serialized),
  };
}

export function registerTaskOverviewApplication(runtime: TaskOverviewRuntime): TaskOverviewRuntime {
  function inspectTaskOverview(targetRoot: string, taskId: string): JsonObject {
    const row = runtime.readTaskOverviewPersistence(targetRoot, taskId).row;
    return {
      schemaVersion: 'buildr.task-overview/v2',
      taskId: row.task_id,
      task: {
        title: row.title,
        intent: row.intent,
        status: row.status,
        result: row.status === 'active' || row.status === 'todo'
          ? null
          : { summary: row.result_summary, ...(row.status === 'completed' ? { noChange: row.result_no_change === 1 } : {}) },
        parent: row.parent_task_id ? { taskId: row.parent_task_id, title: row.parent_title, status: row.parent_status } : null,
        children: parsed(row.children_json) ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      reviews: {
        planning: resultSlot(row.planning_json, 'subject', row.planning_subject_identity, row.planning_outcome, row.planning_updated_at),
        completion: resultSlot(row.completion_review_json, 'subject', row.completion_review_subject_identity, row.completion_review_outcome, row.completion_review_updated_at),
      },
      verification: resultSlot(row.verification_json, 'target', row.verification_target_identity, row.verification_outcome, row.verification_updated_at),
      userSummary: userSummary(row),
      diagnostics: [],
    };
  }

  Object.assign(runtime, { inspectTaskOverview });
  return runtime;
}
