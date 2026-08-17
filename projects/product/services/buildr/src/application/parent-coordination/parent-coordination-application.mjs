import { createParentPlan, parentCoordinationError } from '../../domain/parent-coordination/parent-coordination.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw parentCoordinationError('parent_coordination_input_invalid', `${label} 必须是对象。`);
}
function assertFields(value, fields, label) { assertObject(value, label); for (const field of Object.keys(value)) if (!fields.has(field)) throw parentCoordinationError('parent_coordination_field_forbidden', `${label}.${field} 不受支持。`, 400, { field }); }

export function registerParentCoordinationApplication(runtime) {
  function childReadModel(targetRoot, relation, parentTaskId) {
    const development = runtime.inspectTaskDevelopment(targetRoot, relation.taskId);
    const receipt = development.development?.receipt || null;
    const planned = (receipt?.plannedContributions || []).filter((item) => item.parentTaskId === parentTaskId).map((item) => item.contributionId);
    const terminal = runtime.inspectTaskTerminalDelivery(targetRoot, relation.taskId);
    const contributionHandoff = terminal.delivered ? terminal.snapshot?.handoff?.contributionHandoff || null : null;
    return { taskId: relation.taskId, title: relation.title, status: relation.status, plannedContributions: planned, deliveryProven: Boolean(contributionHandoff), contributionHandoff, diagnostic: relation.status === 'completed' && planned.length && !contributionHandoff ? { code: 'parent_contribution_delivery_unproven', message: 'Child已completed，但没有matching saved Contribution Handoff。' } : null };
  }

  function aggregate(plan, contributors) {
    const delivered = new Map(); const residual = new Map(); const superseded = new Map(); const planned = new Map(); const unproven = new Set();
    for (const child of contributors) {
      for (const id of child.plannedContributions) planned.set(id, child.taskId);
      if (child.status === 'completed' && child.plannedContributions.length && !child.deliveryProven) for (const id of child.plannedContributions) unproven.add(id);
      const handoff = child.contributionHandoff;
      if (!handoff) continue;
      for (const id of handoff.delivered) delivered.set(id, { taskId: child.taskId, kind: 'planned' });
      for (const item of handoff.extra) delivered.set(item.contributionId, { taskId: child.taskId, kind: 'extra', summary: item.summary });
      for (const item of handoff.residual) residual.set(item.contributionId, { taskId: child.taskId, summary: item.summary });
      for (const item of handoff.superseded) superseded.set(item.contributionId, { taskId: child.taskId, deliveredByContributionId: item.deliveredByContributionId, reason: item.reason });
    }
    const contributions = plan.contributions.map((item) => {
      let disposition = 'unassigned';
      if (unproven.has(item.id)) disposition = 'unproven';
      else if (residual.has(item.id)) disposition = 'residual';
      else if (delivered.has(item.id)) disposition = 'delivered';
      else if (superseded.has(item.id)) disposition = 'superseded';
      else if (planned.has(item.id) || item.plannedChildTaskId) disposition = 'planned';
      return { ...item, disposition, plannedChildTaskId: planned.get(item.id) || item.plannedChildTaskId, deliveredBy: delivered.get(item.id) || null, residual: residual.get(item.id) || null, superseded: superseded.get(item.id) || null };
    });
    const prerequisitesSatisfied = contributions.every((item) => ['delivered', 'superseded'].includes(item.disposition));
    return { contributions, prerequisitesSatisfied, blockers: contributions.filter((item) => !['delivered', 'superseded'].includes(item.disposition)).map((item) => ({ contributionId: item.id, disposition: item.disposition })) };
  }

  function startupReadiness(task, execution, development, plan, planningReview, progress) {
    const receipt = development.development?.receipt || null;
    const planningGate = development.development?.applicability?.gates?.planning || null;
    const completed = new Set(progress.contributions.filter((item) => ['delivered', 'superseded'].includes(item.disposition)).map((item) => item.id));
    const dependencyBlockers = [];
    const eligibleContributions = [];
    if (plan) {
      for (const contribution of progress.contributions) {
        if (contribution.disposition !== 'unassigned') continue;
        const missing = plan.dependencies.filter((item) => item.contributionId === contribution.id && !completed.has(item.dependsOn)).map((item) => item.dependsOn).sort();
        if (missing.length) dependencyBlockers.push({ contributionId: contribution.id, dependsOn: missing });
        else eligibleContributions.push(contribution.id);
      }
    }
    const reviewCurrent = planningReview?.present && planningReview.applicability === 'current';
    const reviewReady = reviewCurrent && planningReview.result?.conclusion?.outcome === 'ready';
    const gateCurrent = Boolean(reviewReady && planningGate?.applicability === 'current' && planningGate.targetIdentity === plan?.identity && planningGate.resultDigest === planningReview.resultDigest && planningGate.outcome === 'ready');
    const checks = {
      task: task.record.status === 'active' ? 'ready' : 'blocked',
      environment: execution?.ready ? 'ready' : 'blocked',
      development: receipt ? 'ready' : 'blocked',
      parentPlan: plan ? 'ready' : 'blocked',
      planningReview: reviewReady ? 'ready' : reviewCurrent ? 'changes-required' : planningReview?.present ? 'stale' : 'missing',
      planningGate: gateCurrent ? 'ready' : 'missing',
    };
    const blockers = [];
    if (checks.task !== 'ready') blockers.push({ axis: 'task', code: 'parent_startup_task_not_active' });
    else if (checks.environment !== 'ready') blockers.push({ axis: 'environment', code: 'parent_startup_environment_not_ready' });
    else if (checks.development !== 'ready') blockers.push({ axis: 'development', code: 'parent_startup_development_missing' });
    else if (checks.parentPlan !== 'ready') blockers.push({ axis: 'parent-plan', code: 'parent_startup_plan_missing' });
    else if (checks.planningReview !== 'ready') blockers.push({ axis: 'planning-review', code: checks.planningReview === 'changes-required' ? 'parent_startup_review_changes_required' : 'parent_startup_review_not_current' });
    else if (checks.planningGate !== 'ready') blockers.push({ axis: 'planning-gate', code: 'parent_startup_review_not_consumed' });
    if (gateCurrent && !eligibleContributions.length) blockers.push(...dependencyBlockers.map((item) => ({ axis: 'contribution-dependency', code: 'parent_startup_contribution_dependency_incomplete', ...item })));
    let next = null;
    if (checks.task !== 'ready') next = { mode: 'required', owner: 'task-manager', action: 'inspect', summary: 'Parent Task必须保持active。' };
    else if (checks.environment !== 'ready') next = { mode: 'required', owner: 'task-environment', action: 'prepare', summary: '准备或恢复matching Parent Environment。' };
    else if (checks.development !== 'ready') next = { mode: 'required', owner: 'task-development', action: 'begin', summary: '建立Parent Development Receipt。' };
    else if (checks.parentPlan !== 'ready') next = { mode: 'recommended', owner: 'task-development', action: 'record-parent-plan', summary: '记录Parent Plan。' };
    else if (checks.planningReview !== 'ready') next = { mode: 'recommended', owner: 'task-review', action: 'planning-review', summary: '对current Parent Plan完成Planning Review。' };
    else if (checks.planningGate !== 'ready') next = { mode: 'recommended', owner: 'task-development', action: 'refresh-parent-planning', summary: '消费current Parent Planning Review并刷新Development planning gate。' };
    else if (eligibleContributions.length) next = { mode: 'recommended', owner: 'task-triage', action: 'start-child-contribution', contributionIds: eligibleContributions, summary: '选择一个依赖已满足的Contribution并启动独立Child Task。' };
    else if (progress.prerequisitesSatisfied) next = { mode: 'recommended', owner: 'task-development', action: 'accept-parent', summary: '全部Contribution已有明确处置；执行Parent最终集成验收。' };
    else next = { mode: 'recommended', owner: 'agent', action: 'wait-contribution-dependencies', summary: '当前没有可启动Contribution；等待既有Child handoff或显式reconcile。' };
    return { status: gateCurrent && (eligibleContributions.length || progress.prerequisitesSatisfied) ? 'ready' : 'blocked', checks, blockers, eligibleContributions, next };
  }

  function inspectParentCoordination(targetRoot, taskId, options = {}) {
    const task = options.task || runtime.inspectTaskRecord(targetRoot, taskId);
    const development = options.development || runtime.inspectTaskDevelopment(targetRoot, taskId);
    const receipt = development.development?.receipt || null;
    const plan = receipt?.parentPlan || null;
    const children = task.taskRelations.children.map((relation) => childReadModel(targetRoot, relation, taskId));
    const parentContributionHandoff = plan && development.development?.applicability?.handoff === 'current'
      ? [...(receipt?.handoffs || [])].reverse().find((item) => item.contributionHandoff?.parentTaskId === taskId)?.contributionHandoff || null
      : null;
    const parentDelivery = parentContributionHandoff ? { taskId, title: task.record.title, status: task.record.status, plannedContributions: parentContributionHandoff.planned, deliveryProven: true, contributionHandoff: parentContributionHandoff, diagnostic: null } : null;
    const progress = plan ? aggregate(plan, parentDelivery ? [...children, parentDelivery] : children) : { contributions: [], prerequisitesSatisfied: false, blockers: [] };
    const planningReview = runtime.inspectTaskReview(targetRoot, taskId, plan ? { planningTargetIdentity: plan.identity } : {}).slots.planning;
    let execution = options.execution || null;
    if (plan) {
      try { execution ||= runtime.resolveTaskEnvironmentExecution(targetRoot, taskId); }
      catch (error) { execution = { ready: false, blocked: { code: error.code || 'task_environment_not_ready', message: error.message } }; }
    }
    const startup = plan
      ? startupReadiness(task, execution, development, plan, planningReview, progress)
      : { status: 'not-applicable', checks: {}, blockers: [], eligibleContributions: [], next: null };
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.parentCoordinationResult, {
      operation: 'inspect', status: 'inspected', taskId, mode: plan ? 'parent-plan' : 'legacy', parentStatus: task.record.status, parentPlan: plan, parentAcceptance: receipt?.parentAcceptance || null, parentDelivery, planningReview, startup, children, ...progress, finalAcceptanceReady: Boolean(plan && progress.prerequisitesSatisfied), effects: [], diagnostic: plan ? null : { code: 'parent_plan_absent', message: '该Task尚未显式采用Parent Plan；历史Task继续使用既有模型。' }, nextActions: plan ? (startup.next ? [startup.next.summary] : []) : ['仅在明确采用新模型时record Parent Plan；不要自动backfill。']
    });
  }

  function inspectParentStartupReadiness(targetRoot, taskId, options = {}) {
    const inspected = inspectParentCoordination(targetRoot, taskId, options);
    return { schemaVersion: PUBLIC_JSON_SCHEMAS.parentStartupReadiness, operation: 'inspect-startup', status: inspected.startup.status, taskId, mode: inspected.mode, ...inspected.startup, effects: [] };
  }

  function refreshParentPlanning(targetRoot, taskId) {
    const current = inspectParentCoordination(targetRoot, taskId);
    if (!current.parentPlan) throw parentCoordinationError('parent_plan_missing', 'Parent planning refresh需要current Parent Plan。', 409, null, '先记录Parent Plan。');
    if (!current.planningReview.present || current.planningReview.applicability !== 'current' || current.planningReview.result?.conclusion?.outcome !== 'ready') throw parentCoordinationError('parent_planning_review_not_ready', 'Parent planning refresh需要绑定current Plan identity且outcome为ready的Planning Review。', 409, { planIdentity: current.parentPlan.identity, reviewApplicability: current.planningReview.applicability, reviewOutcome: current.planningReview.result?.conclusion?.outcome || null }, '先完成current Parent Planning Review。');
    const development = runtime.inspectTaskDevelopment(targetRoot, taskId);
    const receipt = development.development?.receipt;
    if (!receipt || receipt.planning.targetIdentity !== current.parentPlan.identity) throw parentCoordinationError('parent_planning_snapshot_stale', 'Development planning snapshot与current Parent Plan不一致。', 409, { planIdentity: current.parentPlan.identity, planningTargetIdentity: receipt?.planning?.targetIdentity || null }, '重新inspect Parent coordination并恢复current planning facts。');
    const result = runtime.recordTaskDevelopmentPlanning(targetRoot, taskId, { changeDispositions: receipt.taskContext.changes, planning: { targetIdentity: receipt.planning.targetIdentity, nodes: receipt.planning.nodes } });
    const inspected = inspectParentCoordination(targetRoot, taskId);
    return { ...inspected, operation: 'refresh-planning', status: 'refreshed', effects: result.effects };
  }

  function recordParentPlan(targetRoot, taskId, input) {
    assertFields(input, new Set(['plan']), 'Parent Plan record');
    const current = inspectParentCoordination(targetRoot, taskId);
    if (current.parentPlan) throw parentCoordinationError('parent_plan_already_exists', 'Parent Plan已存在；使用reconcile并提供expected identity。', 409, { identity: current.parentPlan.identity });
    const result = runtime.recordTaskParentPlan(targetRoot, taskId, { plan: createParentPlan(input.plan) });
    const inspected = inspectParentCoordination(targetRoot, taskId);
    return { ...inspected, operation: 'record', status: 'recorded', effects: result.effects };
  }

  function reconcileParentPlan(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedPlanIdentity', 'plan', 'reason']), 'Parent Plan reconcile');
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw parentCoordinationError('parent_plan_reconciliation_reason_required', 'reconcile必须包含非空reason。', 400);
    const current = inspectParentCoordination(targetRoot, taskId);
    const plan = createParentPlan(input.plan);
    const nextIds = new Set(plan.contributions.map((item) => item.id));
    const referenced = new Set();
    for (const child of current.children) {
      for (const id of child.plannedContributions) referenced.add(id);
      const handoff = child.contributionHandoff;
      if (!handoff) continue;
      for (const id of [...handoff.planned, ...handoff.delivered, ...handoff.extra.map((item) => item.contributionId), ...handoff.residual.map((item) => item.contributionId), ...handoff.superseded.flatMap((item) => [item.contributionId, item.deliveredByContributionId]), ...handoff.affected.map((item) => item.contributionId)]) referenced.add(id);
    }
    const removedReferences = [...referenced].filter((id) => !nextIds.has(id)).sort();
    if (removedReferences.length) throw parentCoordinationError('parent_plan_referenced_contribution_removed', 'reconcile不能删除仍被Child binding或saved handoff引用的Contribution；保留并表达residual/superseded处置。', 409, { contributionIds: removedReferences });
    const result = runtime.recordTaskParentPlan(targetRoot, taskId, { plan, expectedPlanIdentity: input.expectedPlanIdentity, reason: input.reason.trim() });
    const inspected = inspectParentCoordination(targetRoot, taskId);
    return { ...inspected, operation: 'reconcile', status: result.status, effects: result.effects };
  }

  function bindChildContributions(targetRoot, childTaskId, input) {
    assertFields(input, new Set(['parentTaskId', 'contributionIds']), 'Child Contribution binding');
    const result = runtime.bindTaskPlannedContributions(targetRoot, childTaskId, input);
    const inspected = inspectParentCoordination(targetRoot, input.parentTaskId);
    return { ...inspected, operation: 'bind-child', status: result.status, effects: result.effects };
  }

  function acceptParentCoordination(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedPlanIdentity', 'summary']), 'Parent final acceptance');
    const current = inspectParentCoordination(targetRoot, taskId);
    if (!current.parentPlan || current.parentPlan.identity !== input.expectedPlanIdentity) throw parentCoordinationError('parent_plan_conflict', 'Parent final acceptance expected identity已陈旧。', 409, { current: current.parentPlan?.identity ?? null, expected: input.expectedPlanIdentity });
    if (!current.prerequisitesSatisfied) throw parentCoordinationError('parent_acceptance_prerequisites_incomplete', 'Parent final acceptance前置条件尚未满足。', 409, { blockers: current.blockers });
    const result = runtime.recordTaskParentAcceptance(targetRoot, taskId, input);
    const inspected = inspectParentCoordination(targetRoot, taskId);
    return { ...inspected, operation: 'accept', status: result.status, effects: result.effects };
  }

  Object.assign(runtime, { inspectParentCoordination, inspectParentStartupReadiness, refreshParentPlanning, recordParentPlan, reconcileParentPlan, bindChildContributions, acceptParentCoordination });
  return runtime;
}
