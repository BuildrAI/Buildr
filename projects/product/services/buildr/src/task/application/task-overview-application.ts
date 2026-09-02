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
  environment_status: string | null;
  environment_receipt_json: string | null;
  environment_updated_at: string | null;
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

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function object(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanupStatus(row: OverviewRow): string {
  const receipt = object(parsed(row.environment_receipt_json));
  const latest = object(receipt?.latest);
  const cleanup = object(latest?.cleanup);
  return text(cleanup?.status) ?? (row.environment_status == null ? 'not-applicable' : 'pending');
}

function userSummary(row: OverviewRow): JsonObject {
  const cleanup = cleanupStatus(row);
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
  const cleanupFact = {
    status: cleanup,
    summary: cleanup === 'cleaned'
      ? '任务环境已清理。'
      : cleanup === 'not-applicable'
        ? '本次任务没有适用的环境清理。'
        : cleanup === 'pending'
          ? '环境清理尚待完成。'
          : '环境清理需要局部关注。',
    source: 'task-environment',
  };
  const attention = ['attention', 'blocked', 'failed'].includes(cleanup)
    ? [{ owner: 'task-environment', scope: 'cleanup', summary: cleanupFact.summary }]
    : row.environment_status === 'blocked'
      ? [{ owner: 'task-environment', scope: 'environment', summary: '任务环境当前存在局部阻塞。' }]
      : [];
  return {
    goal: { status: 'available', title: row.title, intent: row.intent },
    result,
    cleanup: cleanupFact,
    attention,
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
      environment: {
        present: row.environment_status != null,
        status: row.environment_status ?? 'unknown',
        updatedAt: row.environment_updated_at ?? null,
      },
      userSummary: userSummary(row),
      diagnostics: [],
    };
  }

  Object.assign(runtime, { inspectTaskOverview });
  return runtime;
}
