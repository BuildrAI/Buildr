import crypto from 'node:crypto';

function digest(value) {
  return value == null ? null : `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parsed(value) {
  return value == null ? null : JSON.parse(value);
}

function resultSlot(row, prefix) {
  const serialized = row[`${prefix}_json`];
  return {
    present: serialized != null,
    targetIdentity: row[`${prefix}_target_identity`] ?? null,
    outcome: row[`${prefix}_outcome`] ?? null,
    updatedAt: row[`${prefix}_updated_at`] ?? null,
    resultDigest: digest(serialized),
  };
}

function gateMatch(gate, slot) {
  if (!gate || gate.disposition || !slot.present) return 'unknown';
  return gate.targetIdentity === slot.targetIdentity && gate.resultDigest === slot.resultDigest ? 'matched' : 'mismatched';
}

export function registerTaskOverviewApplication(runtime) {
  function inspectTaskOverview(targetRoot, taskId) {
    const persistence = runtime.readTaskOverviewPersistence(targetRoot, taskId);
    const row = persistence.row;
    const developmentReceipt = parsed(row.development_json);
    const developmentApplicability = parsed(row.development_applicability_json);
    const planning = resultSlot(row, 'planning');
    const completion = resultSlot(row, 'completion_review');
    const verification = resultSlot(row, 'verification');
    const finishTerminal = row.finish_status === 'complete';
    return {
      schemaVersion: 'buildr.task-overview/v1',
      taskId: row.task_id,
      task: {
        title: row.title,
        intent: row.intent,
        status: row.status,
        result: row.status === 'active' ? null : { summary: row.result_summary, ...(row.status === 'completed' ? { noChange: row.result_no_change === 1 } : {}) },
        parent: row.parent_task_id ? { taskId: row.parent_task_id, title: row.parent_title, status: row.parent_status } : null,
        children: parsed(row.children_json) || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      development: {
        present: row.development_json != null,
        status: row.development_status ?? 'unknown',
        observedAt: row.development_observed_at ?? null,
        receiptDigest: digest(row.development_json),
        applicability: developmentApplicability,
      },
      reviews: {
        planning: { ...planning, gateMatch: gateMatch(developmentReceipt?.gates?.planning, planning) },
        completion: { ...completion, gateMatch: gateMatch(developmentReceipt?.gates?.completion, completion) },
      },
      verification: { ...verification, gateMatch: gateMatch(developmentReceipt?.gates?.verification, verification) },
      environment: { present: row.environment_status != null, status: row.environment_status ?? 'unknown', updatedAt: row.environment_updated_at ?? null },
      finish: {
        current: { present: row.finish_run_id != null && !finishTerminal, runId: !finishTerminal ? row.finish_run_id ?? null : null, status: !finishTerminal ? row.finish_status ?? null : null, phase: !finishTerminal ? row.finish_current_phase ?? null : null, updatedAt: !finishTerminal ? row.finish_updated_at ?? null : null },
        completion: { present: row.finish_run_id != null && finishTerminal, runId: finishTerminal ? row.finish_run_id ?? null : null, status: finishTerminal ? row.finish_status : null, completedAt: finishTerminal ? row.finish_completed_at ?? null : null, updatedAt: finishTerminal ? row.finish_updated_at ?? null : null, associationPresent: finishTerminal && row.finish_association_handoff_identity != null },
      },
      diagnostics: [],
    };
  }

  Object.assign(runtime, { inspectTaskOverview });
  return runtime;
}
