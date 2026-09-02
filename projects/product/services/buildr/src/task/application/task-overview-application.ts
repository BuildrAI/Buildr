// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
import crypto from 'node:crypto';

function digest(value) {
  return value == null ? null : `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parsed(value) {
  return value == null ? null : JSON.parse(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finishDetail(payload) {
  if (payload?.kind === 'terminal') return payload.completion || null;
  if (payload?.kind === 'run') return payload.preparedCompletion || payload.run || null;
  return null;
}

function finishMaintenance(detail) {
  return detail?.maintenance || detail?.result?.maintenance || detail?.result?.completion?.maintenance || null;
}

function authorizationFacts(...sources) {
  const facts = [];
  for (const source of sources) {
    const candidates = Array.isArray(source?.requiredAuthorizations)
      ? source.requiredAuthorizations
      : Array.isArray(source?.authorizations)
        ? source.authorizations
        : source?.authorizationRequired && typeof source.authorizationRequired === 'object'
          ? [source.authorizationRequired]
          : [];
    for (const candidate of candidates) {
      const owner = text(candidate?.owner);
      const action = text(candidate?.action);
      const summary = text(candidate?.summary);
      if (owner && action && summary) facts.push({ owner, action, summary });
    }
  }
  return facts.filter((fact, index) => facts.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(fact)) === index);
}

function userSummary(row) {
  const environment = parsed(row.environment_receipt_json);
  const payload = parsed(row.finish_payload_json);
  const detail = finishDetail(payload);
  const maintenance = finishMaintenance(detail);
  const terminal = row.finish_status === 'complete';
  const delivery = terminal
      ? { status: 'delivered', summary: '已读取历史机器交付记录。', source: 'task-finish-history' }
      : row.finish_run_id != null
        ? { status: 'historical-run', summary: '存在未终结的旧收尾运行记录。', source: 'task-finish-history' }
        : row.status === 'completed'
          ? { status: row.result_no_change === 1 ? 'not-applicable' : 'completed', summary: row.result_no_change === 1 ? '任务已完成且无需交付变更。' : '任务结果已保存；没有可用的旧机器交付历史。', source: 'task-record' }
          : { status: 'not-started', summary: '尚未形成交付事实。', source: 'task-record' };
  const activationStatus = text(maintenance?.activation) || (terminal ? 'unknown' : 'not-applicable');
  const activation = {
    status: activationStatus,
    summary: activationStatus === 'passed'
      ? '激活已通过。'
      : activationStatus === 'not-applicable'
        ? '本次交付无需激活。'
        : activationStatus === 'unknown'
          ? '尚无可读取的激活结果。'
          : '激活需要局部关注。',
    source: 'task-finish-maintenance',
  };
  const cleanupStatus = text(environment?.latest?.cleanup?.status)
    || text(maintenance?.environmentCleanup)
    || text(row.finish_cleanup_status)
    || text(detail?.cleanup?.status)
    || (row.environment_status == null ? 'not-applicable' : 'pending');
  const cleanup = {
    status: cleanupStatus,
    summary: cleanupStatus === 'cleaned'
      ? '任务环境已清理。'
      : cleanupStatus === 'not-applicable'
        ? '本次任务没有适用的环境清理。'
        : cleanupStatus === 'pending'
          ? '环境清理尚待专业 owner 完成。'
          : '环境清理需要局部关注。',
    source: environment?.latest?.cleanup ? 'task-environment' : 'task-finish-maintenance',
  };
  const attention = [];
  if (['attention', 'blocked', 'failed'].includes(activation.status)) attention.push({ owner: 'task-finish', scope: 'activation', summary: activation.summary });
  if (['attention', 'blocked', 'failed'].includes(cleanup.status)) attention.push({ owner: 'task-environment', scope: 'cleanup', summary: cleanup.summary });
  if (['blocked', 'failed'].includes(row.finish_status) && row.finish_primary_failure_code) {
    attention.push({ owner: 'task-finish', scope: 'diagnostics', summary: `交付诊断：${row.finish_primary_failure_code}` });
  } else if (row.environment_status === 'blocked' && !attention.some((item) => item.owner === 'task-environment')) {
    attention.push({ owner: 'task-environment', scope: 'environment', summary: '任务环境当前存在局部阻塞。' });
  }
  return {
    goal: { status: 'available', title: row.title, intent: row.intent },
    delivery,
    activation,
    cleanup,
    attention,
    authorization: authorizationFacts(detail, maintenance),
  };
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

export function registerTaskOverviewApplication(runtime) {
  function inspectTaskOverview(targetRoot, taskId) {
    const persistence = runtime.readTaskOverviewPersistence(targetRoot, taskId);
    const row = persistence.row;
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
      },
      reviews: {
        planning,
        completion,
      },
      verification,
      environment: { present: row.environment_status != null, status: row.environment_status ?? 'unknown', updatedAt: row.environment_updated_at ?? null },
      finish: {
        current: { present: row.finish_run_id != null && !finishTerminal, runId: !finishTerminal ? row.finish_run_id ?? null : null, status: !finishTerminal ? row.finish_status ?? null : null, phase: !finishTerminal ? row.finish_current_phase ?? null : null, updatedAt: !finishTerminal ? row.finish_updated_at ?? null : null },
        completion: { present: row.finish_run_id != null && finishTerminal, runId: finishTerminal ? row.finish_run_id ?? null : null, status: finishTerminal ? row.finish_status : null, completedAt: finishTerminal ? row.finish_completed_at ?? null : null, updatedAt: finishTerminal ? row.finish_updated_at ?? null : null },
      },
      userSummary: userSummary(row),
      diagnostics: [],
    };
  }

  Object.assign(runtime, { inspectTaskOverview });
  return runtime;
}
