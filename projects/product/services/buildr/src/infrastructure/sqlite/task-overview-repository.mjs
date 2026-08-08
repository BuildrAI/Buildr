function error(code, message, status = 409, details = undefined) {
  const failure = new Error(message);
  Object.assign(failure, { code, status, details, taskOverviewBusiness: true });
  return failure;
}

export function registerTaskOverviewRepository(runtime) {
  function readTaskOverviewPersistence(targetRoot, taskId) {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw error('task_overview_not_found', `Task不存在：${taskId}。`, 404, { taskId });
      const row = opened.database.prepare(`SELECT
        task.*,
        parent.title AS parent_title,
        parent.status AS parent_status,
        (SELECT json_group_array(json_object('taskId', child.task_id, 'title', child.title, 'status', child.status)) FROM tasks child WHERE child.parent_task_id = task.task_id ORDER BY child.task_id) AS children_json,
        development.record_json AS development_json,
        development.applicability_status AS development_status,
        development.applicability_json AS development_applicability_json,
        development.observed_at AS development_observed_at,
        planning.result_json AS planning_json,
        planning.target_identity AS planning_target_identity,
        planning.outcome AS planning_outcome,
        planning.updated_at AS planning_updated_at,
        completion_review.result_json AS completion_review_json,
        completion_review.target_identity AS completion_review_target_identity,
        completion_review.outcome AS completion_review_outcome,
        completion_review.updated_at AS completion_review_updated_at,
        verification.result_json AS verification_json,
        verification.target_identity AS verification_target_identity,
        verification.outcome AS verification_outcome,
        verification.updated_at AS verification_updated_at,
        environment.status AS environment_status,
        environment.updated_at AS environment_updated_at,
        finish_run.run_id AS finish_run_id,
        finish_run.status AS finish_run_status,
        finish_run.updated_at AS finish_run_updated_at,
        finish_completion.run_id AS finish_completion_run_id,
        finish_completion.status AS finish_completion_status,
        finish_completion.result_json AS finish_completion_json,
        finish_completion.completed_at AS finish_completed_at,
        finish_completion.updated_at AS finish_completion_updated_at
      FROM tasks task
      LEFT JOIN tasks parent ON parent.task_id = task.parent_task_id
      LEFT JOIN task_development_current development ON development.task_id = task.task_id
      LEFT JOIN task_review_current planning ON planning.task_id = task.task_id AND planning.review_type = 'planning'
      LEFT JOIN task_review_current completion_review ON completion_review.task_id = task.task_id AND completion_review.review_type = 'completion'
      LEFT JOIN task_verification_current verification ON verification.task_id = task.task_id
      LEFT JOIN task_environment_current environment ON environment.task_id = task.task_id
      LEFT JOIN task_finish_runs finish_run ON finish_run.task_id = task.task_id
      LEFT JOIN task_finish_completions finish_completion ON finish_completion.task_id = task.task_id
      WHERE task.task_id = ?`).get(taskId);
      if (!row) throw error('task_overview_not_found', `Task不存在：${taskId}。`, 404, { taskId });
      return { root, row, queryCount: 1 };
    } catch (cause) {
      if (cause.taskOverviewBusiness || cause.structuredStoreBusiness || cause.taskRecordBusiness) throw cause;
      throw error('task_overview_read_failed', `Task Overview读取失败：${cause.message}`, 500, { taskId });
    } finally { try { opened?.database?.close(); } catch {} }
  }

  Object.assign(runtime, { readTaskOverviewPersistence });
  return runtime;
}
