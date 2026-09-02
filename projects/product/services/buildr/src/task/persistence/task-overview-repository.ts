type StructuredDatabase = {
  prepare(sql: string): { get(taskId: string): unknown };
  close(): void;
};

type TaskOverviewRuntime = {
  assertCanonicalTaskWorkspace(targetRoot: string): string;
  openWorkspaceStructuredStore(root: string, options: { writable: false }): { present: boolean; database: StructuredDatabase };
  readTaskOverviewPersistence?: (targetRoot: string, taskId: string) => { root: string; row: object; queryCount: 1 };
};

function overviewError(code: string, message: string, status = 409, details?: object): Error {
  return Object.assign(new Error(message), { code, status, details, taskOverviewBusiness: true });
}

function isKnownError(cause: unknown): cause is Error & { taskOverviewBusiness?: boolean; structuredStoreBusiness?: boolean; taskRecordBusiness?: boolean } {
  return cause instanceof Error;
}

export function registerTaskOverviewRepository(runtime: TaskOverviewRuntime): TaskOverviewRuntime {
  function readTaskOverviewPersistence(targetRoot: string, taskId: string): { root: string; row: object; queryCount: 1 } {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    let opened: ReturnType<TaskOverviewRuntime['openWorkspaceStructuredStore']> | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw overviewError('task_overview_not_found', `Task不存在：${taskId}。`, 404, { taskId });
      const row = opened.database.prepare(`SELECT
        task.*,
        parent.title AS parent_title,
        parent.status AS parent_status,
        (SELECT json_group_array(json_object('taskId', child.task_id, 'title', child.title, 'status', child.status)) FROM tasks child WHERE child.parent_task_id = task.task_id ORDER BY child.task_id) AS children_json,
        planning.result_json AS planning_json,
        planning.subject_identity AS planning_subject_identity,
        planning.outcome AS planning_outcome,
        planning.updated_at AS planning_updated_at,
        completion_review.result_json AS completion_review_json,
        completion_review.subject_identity AS completion_review_subject_identity,
        completion_review.outcome AS completion_review_outcome,
        completion_review.updated_at AS completion_review_updated_at,
        verification.result_json AS verification_json,
        verification.target_identity AS verification_target_identity,
        verification.outcome AS verification_outcome,
        verification.updated_at AS verification_updated_at
      FROM tasks task
      LEFT JOIN tasks parent ON parent.task_id = task.parent_task_id
      LEFT JOIN task_review_current planning ON planning.task_id = task.task_id AND planning.review_type = 'planning'
      LEFT JOIN task_review_current completion_review ON completion_review.task_id = task.task_id AND completion_review.review_type = 'completion'
      LEFT JOIN task_verification_current verification ON verification.task_id = task.task_id
      WHERE task.task_id = ?`).get(taskId);
      if (row === undefined) throw overviewError('task_overview_not_found', `Task不存在：${taskId}。`, 404, { taskId });
      if (row === null || typeof row !== 'object' || Array.isArray(row)) throw overviewError('task_overview_read_failed', `Task Overview读取失败：${taskId}。`, 500, { taskId });
      return { root, row, queryCount: 1 };
    } catch (cause) {
      if (isKnownError(cause) && (cause.taskOverviewBusiness || cause.structuredStoreBusiness || cause.taskRecordBusiness)) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw overviewError('task_overview_read_failed', `Task Overview读取失败：${message}`, 500, { taskId });
    } finally {
      try { opened?.database.close(); } catch { /* close failure cannot change the read result */ }
    }
  }

  Object.assign(runtime, { readTaskOverviewPersistence });
  return runtime;
}
