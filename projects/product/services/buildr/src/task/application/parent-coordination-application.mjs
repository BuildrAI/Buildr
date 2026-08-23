import crypto from 'node:crypto';

import { createParentPlan, parentCoordinationError, projectParentPlan, validateContributionHandoffAgainstPlan } from '../domain/parent-coordination.mjs';
import { normalizeTerminalContributionReconciliation, terminalAssociationFromHandoff } from '../domain/terminal-contribution-reconciliation.mjs';
import { normalizeTaskDevelopmentReceipt } from '../domain/task-development.mjs';
import { normalizeTaskReviewResult } from '../domain/task-review.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function developmentReadModel(row, prefix = '') {
  const serialized = row[`${prefix}development_json`];
  if (serialized == null) return { development: null };
  const receipt = normalizeTaskDevelopmentReceipt(JSON.parse(serialized), { expectedTaskId: prefix ? row.parent_task_id : row.task_id });
  const applicabilityJson = row[`${prefix}development_applicability_json`];
  return {
    development: {
      receipt,
      applicability: applicabilityJson == null ? null : JSON.parse(applicabilityJson),
      observedAt: row[`${prefix}development_observed_at`] ?? null,
    },
  };
}

function planningReviewSlot(row, targetIdentity) {
  const serialized = row.planning_review_json;
  if (serialized == null) return { path: `workspace-sqlite:task-review/${row.task_id}/planning`, present: false, result: null, resultDigest: null, applicability: null };
  const result = normalizeTaskReviewResult(JSON.parse(serialized), { expectedTaskId: row.task_id, expectedReviewType: 'planning' });
  if (row.planning_review_target_identity !== result.targetIdentity || row.planning_review_outcome !== result.conclusion.outcome || row.planning_review_updated_at !== result.completedAt) {
    throw parentCoordinationError('parent_coordination_planning_review_inconsistent', 'Parent Planning Review查询字段与Result不一致。', 409, { taskId: row.task_id });
  }
  return {
    path: `workspace-sqlite:task-review/${row.task_id}/planning`,
    present: true,
    result,
    resultDigest: digest(serialized),
    applicability: result.targetIdentity === targetIdentity ? 'current' : 'stale',
    observedAt: result.completedAt,
  };
}

function savedContributionProof(row, receipt, parentTaskId, parentPlan) {
  if (row.status !== 'completed' || row.result_no_change === 1 || row.finish?.kind !== 'terminal') return { handoff: null, proof: null, diagnostic: null };
  const completion = row.finish.completion;
  const handoff = receipt?.handoffs?.find((item) => item.identity === completion.association?.handoffIdentity) || null;
  if (!handoff) return { handoff: null, proof: null, diagnostic: { code: 'parent_contribution_delivery_unproven', message: 'terminal Finish没有matching immutable Development handoff。' } };
  try { terminalAssociationFromHandoff(completion.association, handoff); }
  catch (error) { return { handoff: null, proof: null, diagnostic: { code: error.code, message: error.message } }; }
  if (handoff.contributionHandoff) return { handoff: handoff.contributionHandoff, proof: { kind: 'native-handoff', reconciliationIdentity: null }, diagnostic: null };
  if (row.reconciliation_json == null) return { handoff: null, proof: null, diagnostic: { code: 'parent_contribution_delivery_unproven', message: 'Child已completed，但没有matching saved Contribution Handoff或terminal reconciliation。' } };
  try {
    const reconciliation = normalizeTerminalContributionReconciliation(JSON.parse(row.reconciliation_json));
    if (reconciliation.childTaskId !== row.task_id || reconciliation.parentTaskId !== parentTaskId) throw parentCoordinationError('terminal_contribution_reconciliation_relation_mismatch', '恢复evidence与当前Parent/Child关系不一致。', 409);
    if (!parentPlan || reconciliation.parentPlanIdentity !== parentPlan.identity) throw parentCoordinationError('terminal_contribution_reconciliation_plan_stale', '恢复evidence绑定的Parent Plan已不是current。', 409, { current: parentPlan?.identity || null, evidence: reconciliation.parentPlanIdentity });
    const association = terminalAssociationFromHandoff(completion.association, handoff);
    if (JSON.stringify(association) !== JSON.stringify(reconciliation.finishAssociation)) throw parentCoordinationError('terminal_contribution_reconciliation_finish_mismatch', '恢复evidence与current terminal Finish association不一致。', 409);
    const contributionHandoff = validateContributionHandoffAgainstPlan(reconciliation.contributionHandoff, parentPlan, reconciliation.contributionHandoff.planned);
    return { handoff: contributionHandoff, proof: { kind: 'terminal-reconciliation', reconciliationIdentity: reconciliation.identity }, diagnostic: null };
  } catch (error) {
    return { handoff: null, proof: null, diagnostic: { code: error.code || 'terminal_contribution_reconciliation_invalid', message: error.message } };
  }
}

function planSummary(plan) {
  return {
    sourceSchemaVersion: plan.sourceSchemaVersion,
    identity: plan.identity,
    outcome: plan.outcome,
    architectureDecisions: plan.architectureDecisions,
    finalAcceptance: plan.finalAcceptance,
  };
}

function planningReviewSummary(slot) {
  return {
    present: slot.present,
    applicability: slot.applicability,
    resultDigest: slot.resultDigest,
    outcome: slot.result?.conclusion?.outcome ?? null,
    summary: slot.result?.conclusion?.summary ?? null,
    completedAt: slot.result?.completedAt ?? null,
  };
}

function deliverySummary(handoff, proof) {
  if (!handoff) return null;
  return {
    proof,
    handoffIdentity: handoff.identity,
    delivered: [...handoff.delivered],
    extra: handoff.extra.map((item) => item.contributionId),
    residual: handoff.residual.map((item) => item.contributionId),
    superseded: handoff.superseded.map((item) => ({ contributionId: item.contributionId, deliveredByContributionId: item.deliveredByContributionId })),
    affected: handoff.affected.map((item) => item.contributionId),
    nextAction: handoff.nextAction,
  };
}

function childSummary(child) {
  return {
    taskId: child.taskId,
    title: child.title,
    status: child.status,
    boundContributions: child.boundContributions,
    deliveryProven: child.deliveryProven,
    delivery: deliverySummary(child.contributionHandoff, child.proof),
    proof: child.proof,
    diagnostic: child.diagnostic,
  };
}

function assertFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw parentCoordinationError('parent_coordination_input_invalid', `${label} 必须是对象。`);
  for (const field of Object.keys(value)) if (!fields.has(field)) throw parentCoordinationError('parent_coordination_field_forbidden', `${label}.${field} 不受支持。`, 400, { field });
}

function actualStatus(child, contributionId) {
  const handoff = child.contributionHandoff;
  if (child.status === 'completed' && child.boundContributions.includes(contributionId) && !handoff) return 'unproven';
  if (handoff?.residual.some((item) => item.contributionId === contributionId)) return 'residual';
  if (handoff?.superseded.some((item) => item.contributionId === contributionId)) return 'superseded';
  if (handoff?.delivered.includes(contributionId) || handoff?.extra.some((item) => item.contributionId === contributionId)) return 'delivered';
  if (child.boundContributions.includes(contributionId)) return child.status === 'active' ? 'active' : 'bound';
  return 'unassigned';
}

export function registerParentCoordinationApplication(runtime) {
  function projectParentCoordinationChild(row, parentTaskId, parentReceipt = null) {
    const receipt = row.development_json == null ? null : normalizeTaskDevelopmentReceipt(JSON.parse(row.development_json), { expectedTaskId: row.task_id });
    const proof = savedContributionProof(row, receipt, parentTaskId, parentReceipt?.parentPlan || null);
    const savedBindings = (receipt?.plannedContributions || []).filter((item) => item.parentTaskId === parentTaskId).map((item) => item.contributionId);
    const boundContributions = savedBindings.length ? savedBindings : proof.handoff?.planned || [];
    const contributionHandoff = proof.handoff;
    return {
      taskId: row.task_id, title: row.title, status: row.status,
      boundContributions,
      deliveryProven: Boolean(contributionHandoff), contributionHandoff, proof: proof.proof,
      diagnostic: proof.diagnostic || (row.status === 'completed' && boundContributions.length && !contributionHandoff
        ? { code: 'parent_contribution_delivery_unproven', message: 'Child已completed，但没有matching saved Contribution Handoff。' }
        : null),
    };
  }

  function aggregate(plan, contributors) {
    const contributions = plan.contributions.map((item) => {
      const candidates = contributors.map((child) => ({ child, status: actualStatus(child, item.id) })).filter(({ status }) => status !== 'unassigned');
      const selected = candidates.find(({ status }) => ['delivered', 'residual', 'superseded', 'unproven'].includes(status)) || candidates[0] || null;
      const status = selected?.status || 'unassigned';
      const handoff = selected?.child.contributionHandoff || null;
      const deliveredBy = handoff && (handoff.delivered.includes(item.id) || handoff.extra.some((entry) => entry.contributionId === item.id))
        ? { taskId: selected.child.taskId, kind: handoff.delivered.includes(item.id) ? 'planned' : 'extra' }
        : null;
      const residual = handoff?.residual.find((entry) => entry.contributionId === item.id) || null;
      const superseded = handoff?.superseded.find((entry) => entry.contributionId === item.id) || null;
      const { expectedChild, ...canonicalItem } = item;
      return {
        ...canonicalItem,
        expectation: expectedChild ? { status: 'expected', child: expectedChild } : { status: 'none', child: null },
        eligibility: { status: 'eligible', blockers: [] },
        actual: { status },
        actualChild: selected ? { taskId: selected.child.taskId, title: selected.child.title, status: selected.child.status } : null,
        deliveredBy,
        residual: residual ? { taskId: selected.child.taskId, summary: residual.summary } : null,
        superseded: superseded ? { taskId: selected.child.taskId, deliveredByContributionId: superseded.deliveredByContributionId, reason: superseded.reason } : null,
      };
    });
    const completed = new Set(contributions.filter((item) => ['delivered', 'superseded'].includes(item.actual.status)).map((item) => item.id));
    const byId = new Map(contributions.map((item) => [item.id, item]));
    for (const item of contributions) {
      if (item.actual.status !== 'unassigned') { item.eligibility = { status: 'not-eligible', blockers: [] }; continue; }
      const blockers = item.dependencies.filter((id) => !completed.has(id)).map((id) => ({ contributionId: id, title: byId.get(id)?.title || id }));
      item.eligibility = blockers.length ? { status: 'waiting-dependency', blockers } : { status: 'eligible', blockers: [] };
    }
    const prerequisitesSatisfied = contributions.every((item) => ['delivered', 'superseded'].includes(item.actual.status));
    return {
      contributions, prerequisitesSatisfied,
      blockers: contributions.filter((item) => !['delivered', 'superseded'].includes(item.actual.status)).map((item) => ({ contributionId: item.id, actualStatus: item.actual.status, eligibilityStatus: item.eligibility.status })),
    };
  }

  function startupReadiness(task, execution, development, plan, planningReview, progress) {
    const receipt = development.development?.receipt || null;
    const planningGate = development.development?.applicability?.gates?.planning || null;
    const eligibleContributions = progress.contributions.filter((item) => item.eligibility.status === 'eligible').map((item) => item.id);
    const dependencyBlockers = progress.contributions.filter((item) => item.eligibility.status === 'waiting-dependency').map((item) => ({ contributionId: item.id, dependsOn: item.eligibility.blockers.map((blocker) => blocker.contributionId) }));
    const reviewCurrent = planningReview?.present && planningReview.applicability === 'current';
    const reviewReady = reviewCurrent && planningReview.result?.conclusion?.outcome === 'ready';
    const gateCurrent = Boolean(reviewReady && planningGate?.applicability === 'current' && planningGate.targetIdentity === plan.identity && planningGate.resultDigest === planningReview.resultDigest && planningGate.outcome === 'ready');
    const checks = {
      task: task.record.status === 'active' ? 'ready' : 'blocked', environment: execution?.ready ? 'ready' : 'blocked', development: receipt ? 'ready' : 'blocked', parentPlan: 'ready',
      planningReview: reviewReady ? 'ready' : reviewCurrent ? 'changes-required' : planningReview?.present ? 'stale' : 'missing', planningGate: gateCurrent ? 'ready' : 'missing',
    };
    const blockers = [];
    if (checks.task !== 'ready') blockers.push({ axis: 'task', code: 'parent_startup_task_not_active' });
    else if (checks.environment !== 'ready') blockers.push({ axis: 'environment', code: 'parent_startup_environment_not_ready' });
    else if (checks.development !== 'ready') blockers.push({ axis: 'development', code: 'parent_startup_development_missing' });
    else if (checks.planningReview !== 'ready') blockers.push({ axis: 'planning-review', code: checks.planningReview === 'changes-required' ? 'parent_startup_review_changes_required' : 'parent_startup_review_not_current' });
    else if (checks.planningGate !== 'ready') blockers.push({ axis: 'planning-gate', code: 'parent_startup_review_not_consumed' });
    if (gateCurrent && !eligibleContributions.length) blockers.push(...dependencyBlockers.map((item) => ({ axis: 'contribution-dependency', code: 'parent_startup_contribution_dependency_incomplete', ...item })));
    let next;
    if (checks.task !== 'ready') next = { mode: 'required', owner: 'task-manager', action: 'inspect', summary: 'Parent Task必须保持active。' };
    else if (checks.environment !== 'ready') next = { mode: 'required', owner: 'task-environment', action: 'prepare', summary: '准备或恢复matching Parent Environment。' };
    else if (checks.development !== 'ready') next = { mode: 'required', owner: 'task-development', action: 'begin', summary: '建立Parent Development Receipt。' };
    else if (checks.planningReview !== 'ready') next = { mode: 'recommended', owner: 'task-review', action: 'planning-review', summary: '对current Parent Plan完成Planning Review。' };
    else if (checks.planningGate !== 'ready') next = { mode: 'recommended', owner: 'task-development', action: 'refresh-parent-planning', summary: '消费current Parent Planning Review并刷新Development planning gate。' };
    else if (eligibleContributions.length) next = { mode: 'recommended', owner: 'task-triage', action: 'start-child-contribution', contributionIds: eligibleContributions, summary: '选择一个依赖已满足的Contribution并启动独立Child Task。' };
    else if (progress.prerequisitesSatisfied) next = { mode: 'recommended', owner: 'task-development', action: 'accept-parent', summary: '全部Contribution已有明确处置；执行Parent最终集成验收。' };
    else next = { mode: 'recommended', owner: 'agent', action: 'wait-contribution-dependencies', summary: '当前没有可启动Contribution；等待既有Child handoff或显式reconcile。' };
    return { status: gateCurrent && (eligibleContributions.length || progress.prerequisitesSatisfied) ? 'ready' : 'blocked', checks, blockers, eligibleContributions, next };
  }

  function absentResult(task, children, receipt, parentDevelopment) {
    const mode = task.record.parentTaskId ? 'child' : children.length ? 'legacy' : 'ordinary';
    let parentSource = null;
    if (mode === 'child') {
      const parentTaskId = task.record.parentTaskId;
      const boundContributions = (receipt?.plannedContributions || []).filter((item) => item.parentTaskId === parentTaskId).map((item) => item.contributionId);
      const parentStoredPlan = parentDevelopment.development?.receipt?.parentPlan || null;
      const parentPlan = parentStoredPlan ? projectParentPlan(parentStoredPlan) : null;
      parentSource = {
        taskId: task.taskRelations.parent?.taskId || parentTaskId,
        title: task.taskRelations.parent?.title || parentTaskId,
        status: task.taskRelations.parent?.status || 'unknown',
        boundContributions,
        contributions: parentPlan?.contributions.filter((item) => boundContributions.includes(item.id)).map((item) => ({
          id: item.id, priority: item.priority, title: item.title, objective: item.objective, directions: item.directions, boundaries: item.boundaries,
          bindingStatus: task.record.status === 'active' ? 'active' : 'bound',
        })) || [],
      };
    }
    return {
      mode, plan: null, parentSource,
      children, contributions: [], prerequisitesSatisfied: false,
      startup: { status: 'not-applicable', checks: {}, blockers: [], eligibleContributions: [], next: null },
      diagnostic: mode === 'legacy' ? {
        code: 'parent_plan_absent',
        message: '该Parent Task尚未显式采用Parent Plan；历史Task继续使用兼容读模型。',
        nextAction: '仅在明确采用新模型时record Parent Plan；不要自动backfill。',
      } : null,
    };
  }

  function inspectParentCoordination(targetRoot, taskId, options = {}) {
    const persistence = runtime.readParentCoordinationPersistence(targetRoot, taskId);
    const row = persistence.task;
    const task = options.task || {
      record: { taskId: row.task_id, title: row.title, status: row.status, parentTaskId: row.parent_task_id, result: row.status === 'completed' ? { noChange: row.result_no_change === 1 } : null },
      taskRelations: {
        parent: row.parent_task_id ? { taskId: row.parent_task_id, title: row.parent_title, status: row.parent_status } : null,
        children: persistence.children.map((child) => ({ taskId: child.task_id, title: child.title, status: child.status })),
      },
    };
    const development = options.development || developmentReadModel(row);
    const receipt = development.development?.receipt || null;
    const storedPlan = receipt?.parentPlan || null;
    const contributors = persistence.children.map((child) => runtime.projectParentCoordinationChild(child, taskId, receipt));
    const children = contributors.map(childSummary);
    const parentDevelopment = row.parent_development_json == null
      ? { development: null }
      : { development: { receipt: normalizeTaskDevelopmentReceipt(JSON.parse(row.parent_development_json), { expectedTaskId: row.parent_task_id }) } };
    if (!storedPlan) return withJsonSchema(PUBLIC_JSON_SCHEMAS.parentCoordinationResult, { operation: 'inspect', status: 'inspected', taskId, parentStatus: task.record.status, parentAcceptance: null, planningReview: null, blockers: [], effects: [], ...absentResult(task, children, receipt, parentDevelopment) });
    const plan = projectParentPlan(storedPlan);
    const handoff = development.development?.applicability?.handoff === 'current' ? [...(receipt.handoffs || [])].reverse().find((item) => item.contributionHandoff?.parentTaskId === taskId)?.contributionHandoff || null : null;
    const parentContributor = handoff ? { taskId, title: task.record.title, status: task.record.status, boundContributions: handoff.planned, deliveryProven: true, contributionHandoff: handoff, proof: { kind: 'native-handoff', reconciliationIdentity: null }, diagnostic: null } : null;
    const progress = aggregate(plan, parentContributor ? [...contributors, parentContributor] : contributors);
    const planningReview = planningReviewSlot(row, plan.identity);
    const execution = options.execution || { ready: row.environment_status === 'ready' };
    const startup = startupReadiness(task, execution, development, plan, planningReview, progress);
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.parentCoordinationResult, {
      operation: 'inspect', status: 'inspected', taskId, mode: 'parent-plan', parentStatus: task.record.status, plan: planSummary(plan),
      parentAcceptance: receipt.parentAcceptance || null,
      parentDelivery: parentContributor ? childSummary(parentContributor) : null,
      planningReview: planningReviewSummary(planningReview), startup, children, ...progress,
      effects: [], diagnostic: null,
    });
  }

  function inspectParentStartupReadiness(targetRoot, taskId, options = {}) {
    const inspected = inspectParentCoordination(targetRoot, taskId, options);
    const dependencyBlockers = inspected.contributions
      .filter((item) => item.eligibility.status === 'waiting-dependency')
      .map((item) => ({ contributionId: item.id, dependsOn: item.eligibility.blockers.map((blocker) => blocker.contributionId) }));
    return { schemaVersion: PUBLIC_JSON_SCHEMAS.parentStartupReadiness, operation: 'inspect-startup', status: inspected.startup.status, taskId, mode: inspected.mode, ...inspected.startup, dependencyBlockers, effects: [] };
  }

  function refreshParentPlanning(targetRoot, taskId) {
    const current = inspectParentCoordination(targetRoot, taskId);
    if (!current.plan) throw parentCoordinationError('parent_plan_missing', 'Parent planning refresh需要current Parent Plan。', 409, null, '先记录Parent Plan。');
    if (!current.planningReview.present || current.planningReview.applicability !== 'current' || current.planningReview.outcome !== 'ready') throw parentCoordinationError('parent_planning_review_not_ready', 'Parent planning refresh需要绑定current Plan identity且outcome为ready的Planning Review。', 409);
    const receipt = runtime.inspectTaskDevelopment(targetRoot, taskId).development?.receipt;
    if (!receipt || receipt.planning.targetIdentity !== current.plan.identity) throw parentCoordinationError('parent_planning_snapshot_stale', 'Development planning snapshot与current Parent Plan不一致。', 409);
    const result = runtime.recordTaskDevelopmentPlanning(targetRoot, taskId, { changeDispositions: receipt.taskContext.changes, planning: { targetIdentity: receipt.planning.targetIdentity, nodes: receipt.planning.nodes } });
    return { ...inspectParentCoordination(targetRoot, taskId), operation: 'refresh-planning', status: 'refreshed', effects: result.effects };
  }

  function recordParentPlan(targetRoot, taskId, input) {
    assertFields(input, new Set(['plan']), 'Parent Plan record');
    const current = inspectParentCoordination(targetRoot, taskId);
    if (current.plan) throw parentCoordinationError('parent_plan_already_exists', 'Parent Plan已存在；使用reconcile并提供expected identity。', 409, { identity: current.plan.identity });
    const result = runtime.recordTaskParentPlan(targetRoot, taskId, { plan: createParentPlan(input.plan) });
    return { ...inspectParentCoordination(targetRoot, taskId), operation: 'record', status: 'recorded', effects: result.effects };
  }

  function reconcileParentPlan(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedPlanIdentity', 'plan', 'reason']), 'Parent Plan reconcile');
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw parentCoordinationError('parent_plan_reconciliation_reason_required', 'reconcile必须包含非空reason。', 400);
    const current = inspectParentCoordination(targetRoot, taskId);
    const plan = createParentPlan(input.plan);
    const nextIds = new Set(plan.contributions.map((item) => item.id));
    const referenced = new Set();
    for (const child of current.children) {
      for (const id of child.boundContributions) referenced.add(id);
      const delivery = child.delivery;
      if (!delivery) continue;
      for (const id of [
        ...delivery.delivered,
        ...delivery.extra,
        ...delivery.residual,
        ...delivery.superseded.flatMap((item) => [item.contributionId, item.deliveredByContributionId]),
        ...delivery.affected,
      ]) referenced.add(id);
    }
    const removedReferences = [...referenced].filter((id) => !nextIds.has(id)).sort();
    if (removedReferences.length) throw parentCoordinationError('parent_plan_referenced_contribution_removed', 'reconcile不能删除仍被Child binding引用的Contribution。', 409, { contributionIds: removedReferences });
    const result = runtime.recordTaskParentPlan(targetRoot, taskId, { plan, expectedPlanIdentity: input.expectedPlanIdentity, reason: input.reason.trim() });
    return { ...inspectParentCoordination(targetRoot, taskId), operation: 'reconcile', status: result.status, effects: result.effects };
  }

  function bindChildContributions(targetRoot, childTaskId, input) {
    assertFields(input, new Set(['parentTaskId', 'contributionIds']), 'Child Contribution binding');
    const result = runtime.bindTaskPlannedContributions(targetRoot, childTaskId, input);
    return { ...inspectParentCoordination(targetRoot, input.parentTaskId), operation: 'bind-child', status: result.status, effects: result.effects };
  }

  function reconcileChildDelivery(targetRoot, childTaskId, input) {
    assertFields(input, new Set(['parentTaskId', 'expectedPlanIdentity', 'contributionHandoff', 'reason', 'source']), 'Terminal Child Contribution reconciliation');
    const result = runtime.reconcileTerminalChildContributionDelivery(targetRoot, childTaskId, input);
    return {
      ...inspectParentCoordination(targetRoot, input.parentTaskId),
      operation: 'reconcile-child-delivery', status: result.status,
      reconciliation: result.reconciliation,
      proof: result.proof,
      effects: result.effects,
    };
  }

  function acceptParentCoordination(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedPlanIdentity', 'summary']), 'Parent final acceptance');
    const current = inspectParentCoordination(targetRoot, taskId);
    if (!current.plan || current.plan.identity !== input.expectedPlanIdentity) throw parentCoordinationError('parent_plan_conflict', 'Parent final acceptance expected identity已陈旧。', 409, { current: current.plan?.identity ?? null, expected: input.expectedPlanIdentity });
    if (!current.prerequisitesSatisfied) throw parentCoordinationError('parent_acceptance_prerequisites_incomplete', 'Parent final acceptance前置条件尚未满足。', 409, { blockers: current.blockers });
    const result = runtime.recordTaskParentAcceptance(targetRoot, taskId, input);
    return { ...inspectParentCoordination(targetRoot, taskId), operation: 'accept', status: result.status, effects: result.effects };
  }

  Object.assign(runtime, { projectParentCoordinationChild, inspectParentCoordination, inspectParentStartupReadiness, refreshParentPlanning, recordParentPlan, reconcileParentPlan, bindChildContributions, reconcileChildDelivery, acceptParentCoordination });
  return runtime;
}
