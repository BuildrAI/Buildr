import { parentCoordinationError } from '../../domain/parent-coordination/parent-coordination.mjs';
import { decodeTaskFinishCurrentRow } from './task-finish-repository.mjs';

function asError(cause, taskId) {
  if (cause.parentCoordinationBusiness || cause.structuredStoreBusiness || cause.taskRecordBusiness) return cause;
  return parentCoordinationError('parent_coordination_read_failed', `Parent Coordination读取失败：${cause.message}`, 500, { taskId });
}

export function registerParentCoordinationRepository(runtime) {
  function readParentCoordinationPersistence(targetRoot, taskId) {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw parentCoordinationError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId });
      const task = opened.database.prepare(`SELECT
        current.task_id,
        current.title,
        current.status,
        current.result_no_change,
        current.parent_task_id,
        parent.title AS parent_title,
        parent.status AS parent_status,
        development.record_json AS development_json,
        development.applicability_json AS development_applicability_json,
        development.observed_at AS development_observed_at,
        parent_development.record_json AS parent_development_json,
        planning.result_json AS planning_review_json,
        planning.target_identity AS planning_review_target_identity,
        planning.outcome AS planning_review_outcome,
        planning.updated_at AS planning_review_updated_at,
        environment.status AS environment_status
      FROM tasks current
      LEFT JOIN tasks parent ON parent.task_id = current.parent_task_id
      LEFT JOIN task_development_current development ON development.task_id = current.task_id
      LEFT JOIN task_development_current parent_development ON parent_development.task_id = current.parent_task_id
      LEFT JOIN task_review_current planning ON planning.task_id = current.task_id AND planning.review_type = 'planning'
      LEFT JOIN task_environment_current environment ON environment.task_id = current.task_id
      WHERE current.task_id = ?`).get(taskId);
      if (!task) throw parentCoordinationError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId });
      const childRows = opened.database.prepare(`SELECT
        child.task_id AS child_task_id,
        child.title AS child_title,
        child.status AS child_status,
        child.result_no_change AS child_result_no_change,
        development.record_json AS development_json,
        finish.*
      FROM tasks child
      LEFT JOIN task_development_current development ON development.task_id = child.task_id
      LEFT JOIN task_finish_current finish ON finish.task_id = child.task_id
      WHERE child.parent_task_id = ?
      ORDER BY child.task_id`).all(taskId);
      const children = childRows.map((row) => {
        let finish = null;
        try { finish = row.run_id == null ? null : decodeTaskFinishCurrentRow(row); } catch { finish = { kind: 'invalid' }; }
        return {
          task_id: row.child_task_id,
          title: row.child_title,
          status: row.child_status,
          result_no_change: row.child_result_no_change,
          development_json: row.development_json,
          finish,
        };
      });
      return { root, task, children, queryCount: 2 };
    } catch (cause) {
      throw asError(cause, taskId);
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  Object.assign(runtime, { readParentCoordinationPersistence });
  return runtime;
}
