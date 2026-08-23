import crypto from 'node:crypto';

import { parentCoordinationError } from '../domain/parent-coordination.mjs';
import { normalizeTerminalContributionReconciliation } from '../domain/terminal-contribution-reconciliation.mjs';
import { decodeTaskFinishCurrentRow } from './task-finish-repository.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function decodeFinish(row) {
  if (row.run_id == null) return null;
  try { return decodeTaskFinishCurrentRow(row); }
  catch { return { kind: 'invalid' }; }
}

function decodeReconciliation(serialized, childTaskId) {
  if (serialized == null) return null;
  const record = normalizeTerminalContributionReconciliation(JSON.parse(serialized));
  if (record.childTaskId !== childTaskId) throw parentCoordinationError('terminal_contribution_reconciliation_child_mismatch', '恢复evidence与Child Task不一致。', 409, { childTaskId, actual: record.childTaskId });
  return record;
}

function readContext(database, childTaskId) {
  const row = database.prepare(`SELECT
    child.task_id AS child_task_id,
    child.title AS child_title,
    child.status AS child_status,
    child.result_no_change AS child_result_no_change,
    child.parent_task_id AS parent_task_id,
    parent.status AS parent_status,
    child_development.record_json AS child_development_json,
    parent_development.record_json AS parent_development_json,
    reconciliation.record_json AS reconciliation_json,
    finish.*
  FROM tasks child
  LEFT JOIN tasks parent ON parent.task_id = child.parent_task_id
  LEFT JOIN task_development_current child_development ON child_development.task_id = child.task_id
  LEFT JOIN task_development_current parent_development ON parent_development.task_id = child.parent_task_id
  LEFT JOIN task_finish_current finish ON finish.task_id = child.task_id
  LEFT JOIN terminal_contribution_reconciliations reconciliation ON reconciliation.child_task_id = child.task_id
  WHERE child.task_id = ?`).get(childTaskId);
  if (!row) throw parentCoordinationError('task_record_not_found', `Task Record 不存在：${childTaskId}。`, 404, { taskId: childTaskId });
  const siblingRows = row.parent_task_id == null ? [] : database.prepare(`SELECT
    sibling.task_id AS sibling_task_id,
    sibling.status AS sibling_status,
    sibling.result_no_change AS sibling_result_no_change,
    development.record_json AS development_json,
    reconciliation.record_json AS reconciliation_json,
    finish.*
  FROM tasks sibling
  LEFT JOIN task_development_current development ON development.task_id = sibling.task_id
  LEFT JOIN task_finish_current finish ON finish.task_id = sibling.task_id
  LEFT JOIN terminal_contribution_reconciliations reconciliation ON reconciliation.child_task_id = sibling.task_id
  WHERE sibling.parent_task_id = ? AND sibling.task_id <> ?
  ORDER BY sibling.task_id`).all(row.parent_task_id, childTaskId);
  const context = {
    child: {
      taskId: row.child_task_id,
      title: row.child_title,
      status: row.child_status,
      resultNoChange: row.child_result_no_change === 1,
      parentTaskId: row.parent_task_id,
      developmentJson: row.child_development_json,
      finish: decodeFinish(row),
      reconciliation: decodeReconciliation(row.reconciliation_json, childTaskId),
    },
    parent: { taskId: row.parent_task_id, status: row.parent_status, developmentJson: row.parent_development_json },
    siblings: siblingRows.map((sibling) => ({
      taskId: sibling.sibling_task_id,
      status: sibling.sibling_status,
      resultNoChange: sibling.sibling_result_no_change === 1,
      developmentJson: sibling.development_json,
      finish: decodeFinish(sibling),
      reconciliation: decodeReconciliation(sibling.reconciliation_json, sibling.sibling_task_id),
    })),
  };
  return { ...context, identity: digest(context) };
}

function asError(error, childTaskId, stage = null) {
  if (error.parentCoordinationBusiness || error.taskDevelopmentBusiness || error.structuredStoreBusiness) return error;
  return parentCoordinationError('terminal_contribution_reconciliation_write_failed', `terminal contribution reconciliation写入失败：${error.message}`, 500, { childTaskId, ...(stage ? { stage, rollback: { status: 'restored' } } : {}) });
}

export function registerTerminalContributionReconciliationRepository(runtime) {
  function readTerminalContributionReconciliationContext(targetRoot, childTaskId) {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw parentCoordinationError('task_record_not_found', `Task Record 不存在：${childTaskId}。`, 404, { taskId: childTaskId });
      return { root, ...readContext(opened.database, childTaskId) };
    } catch (error) { throw asError(error, childTaskId); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function writeTerminalContributionReconciliationPersistence(targetRoot, recordValue, expectedContextIdentity) {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    const record = normalizeTerminalContributionReconciliation(recordValue);
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      opened.database.exec('BEGIN IMMEDIATE');
      const current = readContext(opened.database, record.childTaskId);
      if (current.identity !== expectedContextIdentity) throw parentCoordinationError('terminal_contribution_reconciliation_context_conflict', 'Parent Plan、Task、handoff、Finish或ownership事实已变化。', 409, { expected: expectedContextIdentity, current: current.identity });
      if (current.child.reconciliation) {
        if (current.child.reconciliation.identity !== record.identity) throw parentCoordinationError('terminal_contribution_reconciliation_conflict', '该Child已有不同的terminal contribution reconciliation。', 409, { current: current.child.reconciliation.identity, requested: record.identity });
        opened.database.exec('COMMIT');
        return { root, status: 'unchanged', record: current.child.reconciliation, created: false };
      }
      const serialized = JSON.stringify(record);
      opened.database.prepare(`INSERT INTO terminal_contribution_reconciliations(
        child_task_id, parent_task_id, parent_plan_identity, reconciliation_identity, record_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(record.childTaskId, record.parentTaskId, record.parentPlanIdentity, record.identity, serialized, record.createdAt);
      stage = 'post-read';
      const row = opened.database.prepare('SELECT record_json FROM terminal_contribution_reconciliations WHERE child_task_id = ?').get(record.childTaskId);
      const written = decodeReconciliation(row?.record_json, record.childTaskId);
      if (!written || JSON.stringify(written) !== serialized) throw parentCoordinationError('terminal_contribution_reconciliation_post_read_mismatch', '恢复evidence写后读取不一致。', 500, { childTaskId: record.childTaskId });
      opened.database.exec('COMMIT');
      return { root, status: 'recorded', record: written, created: true };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, record.childTaskId, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }

  Object.assign(runtime, { readTerminalContributionReconciliationContext, writeTerminalContributionReconciliationPersistence });
  return runtime;
}
