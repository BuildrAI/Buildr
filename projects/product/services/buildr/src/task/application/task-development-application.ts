// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
import path from 'node:path';

import {
  createTaskDevelopmentPlanning,
  createTaskCandidate,
  createTaskDevelopmentKnowledge,
  createTaskFinishHandoff,
  normalizeTaskContentTarget,
  normalizeTaskDevelopmentContext,
  normalizeTaskDevelopmentReceipt,
  taskDevelopmentDigest,
  taskDevelopmentError,
} from '../domain/task-development.mjs';
import { taskDevelopmentActionFields, taskDevelopmentActionRequiredFields } from './task-development-operation-contracts.ts';
import { taskRecordEffectiveProjectCodes } from '../domain/task-record.mjs';

function assertObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskDevelopmentError('task_development_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input, fields, label) {
  assertObject(input, label);
  for (const field of Object.keys(input)) if (!fields.has(field)) throw taskDevelopmentError('task_development_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
}

function assertActionFields(action, input, label) {
  assertFields(input, taskDevelopmentActionFields(action), label);
}

function assertActionRequiredFields(action, input, label) {
  for (const field of taskDevelopmentActionRequiredFields(action)) {
    if (!Object.hasOwn(input, field)) throw taskDevelopmentError('task_development_field_required', `${label} 缺少必填字段：${field}。`, 400, { field });
  }
}

function relative(root, file) {
  if (file.startsWith('workspace-sqlite:')) return file;
  return path.relative(root, file).split(path.sep).join('/');
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function now() {
  return new Date().toISOString();
}

function inputText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw taskDevelopmentError('task_development_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  return value.trim();
}

function workingCopyConvergence(reference) {
  const availability = reference?.availability || 'unavailable';
  const lifecycle = reference?.workingCopy?.change?.lifecycle || null;
  return { availability, lifecycle, proven: availability === 'available' && lifecycle === 'archived' };
}

function unprovenConvergedChanges(inspected, receipt) {
  const references = new Map((inspected.changeReferences || []).map((item) => [`${item.reference.project}/${item.reference.change}`, item]));
  return (receipt.taskContext?.changes || [])
    .filter((item) => item.disposition === 'converged')
    .flatMap((item) => {
      const proof = workingCopyConvergence(references.get(`${item.project}/${item.change}`));
      return proof.proven ? [] : [{ project: item.project, change: item.change, availability: proof.availability, lifecycle: proof.lifecycle }];
    });
}

function overlayInspectApplicability(persistence, inspected) {
  const unproven = unprovenConvergedChanges(inspected, persistence.receipt);
  if (!unproven.length) return persistence.applicability;
  const applicability = persistence.applicability;
  return {
    ...applicability,
    status: applicability.status === 'planning' ? 'planning' : 'developing',
    taskContext: 'stale',
    candidate: applicability.candidate === 'current' ? 'stale' : applicability.candidate,
    handoff: applicability.handoff === 'current' ? 'stale' : applicability.handoff,
    reasons: [
      ...(applicability.reasons || []).filter((item) => item.code !== 'change-lifecycle-unproven'),
      { axis: 'task-context', code: 'change-lifecycle-unproven', unproven },
    ],
  };
}

export function registerTaskDevelopmentApplication(runtime) {
  function task(targetRoot, taskId, { active = false, mutation = false } = {}) {
    const persistence = mutation ? runtime.prepareTaskRecordPersistence(targetRoot, taskId) : null;
    const readModel = runtime.inspectTaskRecord(targetRoot, taskId);
    const inspected = persistence ? { ...persistence, changeReferences: readModel.changeReferences } : readModel;
    if (active && inspected.record.status !== 'active') throw taskDevelopmentError('task_development_task_terminal', `Task ${taskId} 已是 ${inspected.record.status}，不能修改Development Receipt。`, 409, { status: inspected.record.status });
    return inspected;
  }

  function environment(targetRoot, taskId) {
    const context = runtime.resolveTaskEnvironmentExecution(targetRoot, taskId);
    if (!context?.ready) throw taskDevelopmentError('task_development_environment_not_ready', `Task Environment 未ready：${taskId}。`, 409, context?.blocked || context, '先通过task-environment恢复matching ready Environment。');
    return context;
  }

  function normalizedDispositions(inspected, values) {
    if (!Array.isArray(values)) throw taskDevelopmentError('task_development_change_dispositions_required', 'changeDispositions 必须是数组；code-only Task 使用空数组。', 400, { field: 'changeDispositions' });
    const input = new Map();
    for (const [index, value] of values.entries()) {
      assertFields(value, new Set(['project', 'change', 'disposition', 'summary']), `changeDispositions[${index}]`);
      const project = inputText(value.project, `changeDispositions[${index}].project`);
      const change = inputText(value.change, `changeDispositions[${index}].change`);
      const summary = inputText(value.summary, `changeDispositions[${index}].summary`);
      const key = `${project}/${change}`;
      if (input.has(key)) throw taskDevelopmentError('task_development_change_disposition_duplicate', `Change disposition重复：${key}。`, 400, { key });
      input.set(key, { project, change, disposition: value.disposition, summary });
    }
    const expected = new Set(inspected.record.changes.map((item) => `${item.project}/${item.change}`));
    for (const key of input.keys()) if (!expected.has(key)) throw taskDevelopmentError('task_development_change_out_of_scope', `Change不属于Task：${key}。`, 409, { key });
    for (const key of expected) if (!input.has(key)) throw taskDevelopmentError('task_development_change_disposition_missing', `Change缺少Development disposition：${key}。`, 409, { key });
    const references = new Map((inspected.changeReferences || []).map((item) => [`${item.reference.project}/${item.reference.change}`, item]));
    for (const [key, disposition] of input) {
      if (disposition.disposition !== 'converged') continue;
      const proof = workingCopyConvergence(references.get(key));
      if (!proof.proven) {
        throw taskDevelopmentError(
          'task_development_change_not_converged',
          `Change尚未由当前Task working copy证明已收敛：${key}。`,
          409,
          { project: disposition.project, change: disposition.change, availability: proof.availability, lifecycle: proof.lifecycle },
          '先通过关联Change的专业流程完成deterministic convergence/archive，再重试Task Development。',
        );
      }
    }
    return [...input.values()];
  }

  function taskContext(inspected, dispositions) {
    const payload = {
      taskId: inspected.record.taskId,
      intent: inspected.record.intent,
      scope: inspected.record.scope,
      changes: normalizedDispositions(inspected, dispositions),
    };
    return normalizeTaskDevelopmentContext({ identity: taskDevelopmentDigest({
      taskId: payload.taskId,
      intent: payload.intent,
      scope: {
        projects: [...payload.scope.projects].sort((left, right) => left.localeCompare(right)),
        services: [...payload.scope.services].sort((left, right) => `${left.project}/${left.service}`.localeCompare(`${right.project}/${right.service}`)),
      },
      changes: [...payload.changes].sort((left, right) => `${left.project}/${left.change}`.localeCompare(`${right.project}/${right.change}`)),
    }), ...payload });
  }

  function planningSnapshot(input = {}) {
    assertFields(input, new Set(['targetIdentity', 'nodes']), 'Task Development planning');
    if (!Array.isArray(input.nodes || [])) throw taskDevelopmentError('task_development_planning_nodes_invalid', 'planning.nodes 必须是数组。', 400, { field: 'planning.nodes' });
    const nodes = (input.nodes || []).map((node, index) => {
      assertFields(node, new Set(['id', 'kind', 'authority', 'reference', 'identity', 'disposition', 'summary', 'source']), `planning.nodes[${index}]`);
      return {
        id: node.id,
        kind: node.kind,
        authority: node.authority,
        reference: node.reference ?? null,
        identity: node.identity ?? null,
        disposition: node.disposition,
        summary: node.summary,
        source: node.source ?? null,
      };
    }).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return createTaskDevelopmentPlanning({ targetIdentity: input.targetIdentity ?? null, nodes });
  }

  function contentTarget(context) {
    const components = runtime.observeTaskContentComponents(context.scopes, { repositories: context.repositories || [] });
    return normalizeTaskContentTarget({ identity: taskDevelopmentDigest({ components }), components });
  }

  function observeCurrent(targetRoot, taskId, receipt, options = {}) {
    const inspected = task(targetRoot, taskId);
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, options.changeDispositions || receipt.taskContext.changes);
    const planning = options.planning ? planningSnapshot(options.planning) : receipt.planning;
    const target = receipt.contentTarget ? contentTarget(execution) : null;
    const inputsCurrent = context.identity === receipt.taskContext.identity && Boolean(target) && target.identity === receipt.contentTarget?.identity;
    const candidateCurrent = Boolean(receipt.candidate)
      && inputsCurrent
      && receipt.candidate.contentTargetIdentity === target.identity
      && receipt.candidate.taskContextIdentity === context.identity;
    const knowledgeCurrent = Boolean(receipt.currentKnowledge) && Boolean(target) && receipt.currentKnowledge.treeIdentity === target.identity;
    const knowledgeReady = knowledgeCurrent && receipt.currentKnowledge.status !== 'blocked';
    const completionCurrent = candidateCurrent;
    const proceedCurrent = candidateCurrent && knowledgeReady && receipt.decision?.outcome === 'proceed' && receipt.decision.candidateIdentity === receipt.candidate.identity;
    const currentGates = { planning: null, verification: null, completion: null };
    const currentHandoff = proceedCurrent ? [...receipt.handoffs].reverse().find((item) => item.candidate.identity === receipt.candidate.identity && same(item.gates?.planning, currentGates.planning) && same(item.gates?.completion, currentGates.completion) && same(item.knowledge, receipt.currentKnowledge) && same(item.decision, receipt.decision)) || null : null;
    const handoffCurrent = Boolean(currentHandoff);
    const reasons = [];
    if (context.identity !== receipt.taskContext.identity) reasons.push({ axis: 'task-context', code: 'task-context-changed' });
    if (!receipt.contentTarget) reasons.push({ axis: 'content-target', code: 'content-target-missing' });
    else if (!target || target.identity !== receipt.contentTarget.identity) reasons.push({ axis: 'content-target', code: 'content-target-changed' });
    if (receipt.candidate && !candidateCurrent) reasons.push({ axis: 'candidate', code: 'candidate-stale' });
    if (!knowledgeCurrent) reasons.push({ axis: 'current-knowledge', code: receipt.currentKnowledge ? 'current-knowledge-stale' : 'current-knowledge-missing' });
    else if (receipt.currentKnowledge.status === 'blocked') reasons.push({ axis: 'current-knowledge', code: 'current-knowledge-completion-conflict' });
    else if (receipt.currentKnowledge.status === 'attention') reasons.push({ axis: 'current-knowledge', code: 'current-knowledge-attention', blocking: false });
    return { inspected, execution, context, planning, target, gates: currentGates, candidateCurrent, knowledgeCurrent, knowledgeReady, completionCurrent, proceedCurrent, handoffCurrent, currentHandoff, reasons };
  }

  function initialReceipt(taskId, execution, context, planning, content = null) {
    const timestamp = now();
    return normalizeTaskDevelopmentReceipt({ schemaVersion: 'buildr.task-development-receipt/v3', taskId, environment: { taskId, receiptSchema: execution.receiptSchema }, taskContext: context, planning, parentPlan: null, plannedContributions: [], parentAcceptance: null, contentTarget: content, verificationPolicy: null, generation: 0, candidate: null, currentKnowledge: null, gates: { planning: null, verification: null, completion: null }, decision: null, handoffs: [], createdAt: timestamp, updatedAt: timestamp }, { expectedTaskId: taskId });
  }

  function withoutTaskVerification(receipt) {
    const candidate = receipt.candidate ? createTaskCandidate({
      generation: receipt.candidate.generation,
      contentTargetIdentity: receipt.candidate.contentTargetIdentity,
      taskContextIdentity: receipt.candidate.taskContextIdentity,
    }) : null;
    const decision = receipt.decision ? {
      ...receipt.decision,
      candidateIdentity: receipt.decision.outcome === 'proceed' ? candidate?.identity || null : null,
      risks: [],
    } : null;
    return normalizeTaskDevelopmentReceipt({
      ...receipt,
      verificationPolicy: null,
      candidate,
      gates: { planning: null, verification: null, completion: null },
      decision,
    }, { expectedTaskId: receipt.taskId });
  }

  function writeDevelopment(targetRoot, taskId, previous, receipt, currentObservation = null, options = {}) {
    if (previous) {
      const prefix = previous.handoffs;
      if (receipt.handoffs.length < prefix.length || !prefix.every((item, index) => same(item, receipt.handoffs[index]))) throw taskDevelopmentError('task_development_handoff_immutable', '已正式形成的 handoff snapshot 不得改写或删除。', 409);
    }
    const independent = withoutTaskVerification(receipt);
    const observed = currentObservation || observeCurrent(targetRoot, taskId, independent, options);
    const applicability = applicabilityFromObserved(independent, observed);
    return runtime.writeTaskDevelopmentPersistence(targetRoot, independent, { applicability, observedAt: now() });
  }

  function effect(root, written) {
    return { type: written.created ? 'created' : 'updated', path: relative(root, written.file) };
  }

  function readModel(persistence, applicability) {
    return { path: persistence.file, receiptDigest: persistence.receiptDigest, receipt: persistence.receipt, applicability, observedAt: persistence.observedAt ?? null };
  }

  function taskDevelopmentNext(persistence, applicability) {
    if (!persistence || !applicability) return null;
    const receipt = persistence.receipt;
    const reasonCodes = new Set((applicability.reasons || []).map((item) => item.code));
    if (reasonCodes.has('change-lifecycle-unproven')) return { mode: 'required', owner: 'task-development', action: 'planning', capability: { id: 'buildr.task-development', version: 4 }, summary: '当前 working copy 无法证明关联 Change 已归档；先恢复或 converge/archive，再刷新 Development。' };
    if (applicability.taskContext === 'stale' || applicability.planning === 'stale') return { mode: 'required', owner: 'task-development', action: 'planning', capability: { id: 'buildr.task-development', version: 4 }, summary: '刷新current Task context与完整planning snapshot；专业artifact仍由对应authority维护。' };
    if (applicability.contentTarget !== 'current') return { mode: 'recommended', owner: 'agent', action: 'develop-and-observe', capability: null, summary: '完成内容、测试开发与Change收敛后调用observe建立stable Content Target。' };
    if (applicability.candidate !== 'current') return { mode: 'recommended', owner: 'task-development', action: 'freeze', capability: { id: 'buildr.task-development', version: 4 }, summary: '调用freeze形成或复用current Task Candidate。' };
    if (applicability.currentKnowledge !== 'current' || reasonCodes.has('current-knowledge-completion-conflict')) return { mode: 'recommended', owner: 'current-knowledge-maintenance', action: 'inspect-or-reconcile', capability: { id: 'buildr.current-knowledge-maintenance', version: 2 }, summary: '针对current Content Target形成knowledge disposition；只有completion-critical conflict阻止handoff，解释性drift记录attention。' };
    if (!receipt.decision || receipt.decision.candidateIdentity !== receipt.candidate?.identity) return { mode: 'recommended', owner: 'task-development', action: 'decide', capability: { id: 'buildr.task-development', version: 4 }, summary: '根据current Development facts记录proceed或blocked。' };
    if (receipt.decision.outcome === 'blocked') return { mode: 'recommended', owner: 'agent', action: 'remediate-blocker', capability: null, summary: '处理blocked原因并更新对应专业事实；Buildr不会自动推进。' };
    if (applicability.handoff !== 'current') return { mode: 'recommended', owner: 'task-development', action: 'handoff', capability: { id: 'buildr.task-development', version: 4 }, summary: '调用handoff形成immutable Finish handoff。' };
    return { mode: 'recommended', owner: 'agent', action: 'report', capability: null, summary: '研发结果已就绪；报告当前成果及限制，收尾由用户目标独立触发。' };
  }

  function result(operation, status, taskId, persistence, applicability, effects = [], diagnostic = null, nextActions = null) {
    const next = taskDevelopmentNext(persistence, applicability);
    const guidance = nextActions ?? (next ? [next.summary] : []);
    return { schemaVersion: 'buildr.task-development-operation-result/v1', operation, status, taskId, development: persistence ? readModel(persistence, applicability) : null, next, diagnostic, effects, nextActions: guidance };
  }

  function applicabilityFromObserved(receipt, observed) {
    return {
      status: observed.handoffCurrent ? 'handoff-current' : observed.candidateCurrent ? 'candidate-current' : receipt.contentTarget ? 'developing' : 'planning',
      taskContext: observed.context.identity === receipt.taskContext.identity ? 'current' : 'stale',
      planning: observed.planning.identity === receipt.planning.identity ? 'current' : 'stale',
      contentTarget: !receipt.contentTarget ? 'missing' : observed.target?.identity === receipt.contentTarget.identity ? 'current' : 'stale',
      candidate: receipt.candidate ? observed.candidateCurrent ? 'current' : 'stale' : 'missing',
      currentKnowledge: receipt.currentKnowledge ? observed.knowledgeCurrent ? 'current' : 'stale' : 'missing',
      handoff: receipt.handoffs.length ? observed.handoffCurrent ? 'current' : 'stale' : 'missing',
      gates: observed.gates,
      reasons: observed.reasons,
    };
  }

  function inspectTaskDevelopmentCurrent(targetRoot, taskId, options = {}) {
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    if (!persistence) return { ...result('inspect', 'missing', taskId, null, null, [], null, ['在首个正式研发动作时使用task-development begin建立current planning facts。']), next: { mode: 'required', owner: 'task-development', action: 'begin', capability: { id: 'buildr.task-development', version: 4 }, summary: '在首个正式研发动作时使用task-development begin建立current planning facts。' } };
    const inspectedTask = options.inspectedTask || task(targetRoot, taskId);
    return result('inspect', 'inspected', taskId, persistence, overlayInspectApplicability(persistence, inspectedTask));
  }

  function inspectTaskDevelopment(targetRoot, taskId) {
    const inspectedTask = task(targetRoot, taskId);
    return inspectTaskDevelopmentCurrent(targetRoot, inspectedTask.taskId, { inspectedTask });
  }

  function discoverTaskDevelopmentInput(targetRoot, taskId, input) {
    assertActionFields('discover', input, 'Task Development discover');
    assertActionRequiredFields('discover', input, 'Task Development discover');
    if (input.action !== 'observe') throw taskDevelopmentError('task_development_discovery_action_invalid', 'discover.action 只支持 observe。', 400, { field: 'action' });
    const inspected = task(targetRoot, taskId, { active: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const context = taskContext(inspected, persistence.receipt.taskContext.changes);
    return {
      schemaVersion: 'buildr.task-development-current-input/v1', operation: 'discover', status: 'ready', taskId, action: 'observe',
      inputJson: { changeDispositions: context.changes, planningTargetIdentity: persistence.receipt.planning.targetIdentity },
      facts: { receiptDigest: persistence.receiptDigest, taskContextIdentity: context.identity, planningIdentity: persistence.receipt.planning.identity, planningTargetIdentity: persistence.receipt.planning.targetIdentity },
      diagnostic: null, effects: [],
    };
  }
  function planningMutation(operation, targetRoot, taskId, input) {
    const label = `Task Development ${operation}`;
    assertActionFields(operation, input, label);
    assertActionRequiredFields(operation, input, label);
    const inspected = task(targetRoot, taskId, { active: true, mutation: true });
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, input.changeDispositions);
    const planning = planningSnapshot(input.planning);
    const current = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    let receipt;
    if (!current) receipt = initialReceipt(taskId, execution, context, planning);
    else {
      const changed = context.identity !== current.receipt.taskContext.identity || planning.identity !== current.receipt.planning.identity;
      receipt = normalizeTaskDevelopmentReceipt({
        ...current.receipt,
        environment: { ...current.receipt.environment, taskId, receiptSchema: execution.receiptSchema },
        taskContext: context,
        planning,
        candidate: changed ? null : current.receipt.candidate,
        currentKnowledge: changed ? null : current.receipt.currentKnowledge,
        gates: { planning: null, verification: null, completion: null },
        decision: changed ? null : current.receipt.decision,
        updatedAt: now(),
      }, { expectedTaskId: taskId });
    }
    const written = writeDevelopment(targetRoot, taskId, current?.receipt || null, receipt);
    return result(operation, current ? 'updated' : 'created', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function beginTaskDevelopment(targetRoot, taskId, input) {
    return planningMutation('begin', targetRoot, taskId, input);
  }

  function recordTaskDevelopmentPlanning(targetRoot, taskId, input) {
    return planningMutation('planning', targetRoot, taskId, input);
  }

  function observeTaskDevelopment(targetRoot, taskId, input) {
    assertActionFields('observe', input, 'Task Development observe');
    const inspected = task(targetRoot, taskId, { active: true, mutation: true });
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, input.changeDispositions);
    const pendingChanges = context.changes.filter((item) => item.disposition === 'pending');
    if (pendingChanges.length) throw taskDevelopmentError(
      'task_development_change_pending_for_content_target',
      'Change仍在专业流程中，不能观察stable Content Target。',
      409,
      { pendingChanges: pendingChanges.map((item) => `${item.project}/${item.change}`) },
      '先完成Change-owned实现、current knowledge与deterministic convergence/archive，再重试observe。',
    );
    const target = contentTarget(execution);
    const current = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    const planning = current?.receipt.planning || createTaskDevelopmentPlanning({ targetIdentity: input.planningTargetIdentity || null, nodes: [] });
    if (input.planningTargetIdentity && planning.targetIdentity !== input.planningTargetIdentity) throw taskDevelopmentError('task_development_planning_target_mismatch', 'observe的planningTargetIdentity与current planning snapshot不一致；先更新planning facts。', 409, { expected: planning.targetIdentity, actual: input.planningTargetIdentity });
    let receipt = current?.receipt || initialReceipt(taskId, execution, context, planning, target);
    if (current) {
      const upstreamChanged = context.identity !== receipt.taskContext.identity || target.identity !== receipt.contentTarget?.identity;
      receipt = normalizeTaskDevelopmentReceipt({
        ...receipt,
        taskContext: context,
        contentTarget: target,
        verificationPolicy: null,
        candidate: upstreamChanged ? null : receipt.candidate,
        currentKnowledge: upstreamChanged ? null : receipt.currentKnowledge,
        gates: { planning: null, verification: null, completion: null },
        decision: upstreamChanged ? null : receipt.decision,
        updatedAt: now(),
      }, { expectedTaskId: taskId });
    }
    const written = writeDevelopment(targetRoot, taskId, current?.receipt || null, receipt);
    return result('observe', current ? 'updated' : 'created', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function recordTaskDevelopmentKnowledge(targetRoot, taskId, input) {
    assertActionFields('knowledge', input, 'Task Development knowledge');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    if (!observed.target || observed.target.identity !== persistence.receipt.contentTarget?.identity || input.treeIdentity !== observed.target.identity) throw taskDevelopmentError('task_development_knowledge_target_mismatch', 'knowledge disposition必须绑定current Content Target。', 409, { expected: observed.target?.identity || null, actual: input.treeIdentity });
    const effectiveProjects = taskRecordEffectiveProjectCodes(observed.inspected.record);
    if (effectiveProjects.length > 1 && !Array.isArray(input.projects)) throw taskDevelopmentError('task_development_knowledge_projects_required', '多Project Task的knowledge disposition必须按Project完整提交。', 409, { expectedProjects: effectiveProjects });
    if (Array.isArray(input.projects)) {
      const actualProjects = input.projects.map((item) => item?.project).sort((left, right) => String(left).localeCompare(String(right)));
      if (!same(actualProjects, effectiveProjects)) throw taskDevelopmentError('task_development_knowledge_projects_incomplete', 'Current Knowledge Project dispositions必须精确覆盖Task有效Project集合。', 409, { expectedProjects: effectiveProjects, actualProjects });
    }
    const currentKnowledge = createTaskDevelopmentKnowledge(input);
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, currentKnowledge, gates: observed.gates, decision: null, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('knowledge', 'recorded', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function invalidateForObserved(receipt, observed) {
    return normalizeTaskDevelopmentReceipt({ ...receipt, taskContext: observed.context, planning: observed.planning, contentTarget: observed.target || receipt.contentTarget, verificationPolicy: null, candidate: null, gates: { planning: observed.gates.planning, verification: null, completion: null }, decision: null, updatedAt: now() }, { expectedTaskId: receipt.taskId });
  }

  function freezeTaskDevelopmentCandidate(targetRoot, taskId, input = {}) {
    assertActionFields('freeze', input, 'Task Development freeze');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt, input);
    const pendingChanges = observed.context.changes.filter((item) => item.disposition === 'pending');
    const ready = Boolean(observed.target) && pendingChanges.length === 0;
    if (!ready) {
      const invalidated = writeDevelopment(targetRoot, taskId, persistence.receipt, invalidateForObserved(persistence.receipt, observed));
      throw taskDevelopmentError('task_development_candidate_not_ready', 'Candidate freeze前置事实未满足。', 409, { reasons: observed.reasons, pendingChanges: pendingChanges.map((item) => `${item.project}/${item.change}`), receiptDigest: invalidated.receiptDigest }, '完成Change convergence与stable Content Target后重试。');
    }
    const canReuse = observed.candidateCurrent;
    const generation = canReuse ? persistence.receipt.generation : persistence.receipt.generation + 1;
    const candidate = canReuse ? persistence.receipt.candidate : createTaskCandidate({ generation, contentTargetIdentity: observed.target.identity, taskContextIdentity: observed.context.identity });
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, verificationPolicy: null, taskContext: observed.context, contentTarget: observed.target, generation, candidate, gates: { planning: observed.gates.planning, verification: null, completion: canReuse ? observed.gates.completion : null }, decision: canReuse ? persistence.receipt.decision : null, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt, null, input);
    return result('freeze', canReuse ? 'unchanged' : 'frozen', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function decideTaskDevelopment(targetRoot, taskId, input) {
    assertActionFields('decide', input, 'Task Development decide');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    const base = observed.candidateCurrent ? { ...persistence.receipt, gates: observed.gates } : invalidateForObserved(persistence.receipt, observed);
    if (input.outcome === 'proceed' && (!observed.candidateCurrent || !observed.knowledgeReady)) throw taskDevelopmentError('task_development_proceed_not_ready', 'proceed需要current Candidate与非blocked Current Knowledge disposition。', 409, { reasons: observed.reasons });
    const decision = { outcome: input.outcome, candidateIdentity: observed.candidateCurrent ? persistence.receipt.candidate.identity : null, summary: input.summary, risks: [] };
    if (input.outcome === 'proceed') createTaskFinishHandoff({ candidate: persistence.receipt.candidate, changes: observed.context.changes, gates: observed.gates, knowledge: persistence.receipt.currentKnowledge, decision, createdAt: now() });
    const receipt = normalizeTaskDevelopmentReceipt({ ...base, decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('decide', 'recorded', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function createTaskDevelopmentHandoff(targetRoot, taskId, input = {}) {
    assertActionFields('handoff', input, 'Task Development handoff');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    if (!observed.candidateCurrent || !observed.knowledgeReady || persistence.receipt.decision?.outcome !== 'proceed') throw taskDevelopmentError('task_development_handoff_not_ready', 'Finish handoff需要current Candidate、Current Knowledge与proceed decision。', 409, { reasons: observed.reasons });
    const handoff = createTaskFinishHandoff({ candidate: persistence.receipt.candidate, changes: observed.context.changes, gates: observed.gates, knowledge: persistence.receipt.currentKnowledge, decision: persistence.receipt.decision, createdAt: now() });
    const handoffs = persistence.receipt.handoffs.some((item) => item.identity === handoff.identity) ? persistence.receipt.handoffs : [...persistence.receipt.handoffs, handoff];
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, gates: observed.gates, handoffs, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('handoff', 'ready', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function assertTaskDevelopmentCarrier(targetRoot, taskId, input = {}) {
    assertActionFields('carrier', input, 'Task Development carrier');
    const expected = {
      handoffIdentity: inputText(input.handoffIdentity, 'handoffIdentity'),
      candidateIdentity: inputText(input.candidateIdentity, 'candidateIdentity'),
      candidateGeneration: input.candidateGeneration,
      contentTargetIdentity: inputText(input.contentTargetIdentity, 'contentTargetIdentity'),
    };
    if (!Number.isInteger(expected.candidateGeneration) || expected.candidateGeneration < 1) {
      throw taskDevelopmentError('task_development_field_invalid', 'candidateGeneration 必须是大于等于1的整数。', 400, { field: 'candidateGeneration' });
    }
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    const current = observed.currentHandoff ? {
      handoffIdentity: observed.currentHandoff.identity,
      candidateIdentity: observed.currentHandoff.candidate.identity,
      candidateGeneration: observed.currentHandoff.candidate.generation,
      contentTargetIdentity: observed.currentHandoff.candidate.contentTargetIdentity,
    } : null;
    const mismatches = Object.keys(expected).filter((field) => current?.[field] !== expected[field]);
    if (observed.handoffCurrent && mismatches.length === 0) return result('carrier', 'equivalent', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed));
    return result('carrier', 'stale', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed), [], {
      code: mismatches.length ? 'task_development_carrier_identity_mismatch' : 'task_development_carrier_not_equivalent',
      message: mismatches.length ? 'Finish run冻结identity与current Development handoff不一致。' : 'Delivery carrier与current handoff Candidate不等价。',
      details: { expected, current, mismatches, reasons: observed.reasons },
    }, ['返回task-development重新建立stable target、Candidate与handoff。']);
  }


  const scoped = (operation) => (targetRoot, ...args) => {
    const invoke = () => operation(targetRoot, ...args);
    if (typeof runtime.withWorkspaceStructuredStoreOperation !== 'function') return invoke();
    return runtime.withWorkspaceStructuredStoreOperation(targetRoot, invoke);
  };
  Object.assign(runtime, {
    inspectTaskDevelopment: scoped(inspectTaskDevelopment),
    inspectTaskDevelopmentCurrent: scoped(inspectTaskDevelopmentCurrent),
    discoverTaskDevelopmentInput: scoped(discoverTaskDevelopmentInput),
    beginTaskDevelopment: scoped(beginTaskDevelopment),
    recordTaskDevelopmentPlanning: scoped(recordTaskDevelopmentPlanning),
    observeTaskDevelopment: scoped(observeTaskDevelopment),
    recordTaskDevelopmentKnowledge: scoped(recordTaskDevelopmentKnowledge),
    freezeTaskDevelopmentCandidate: scoped(freezeTaskDevelopmentCandidate),
    decideTaskDevelopment: scoped(decideTaskDevelopment),
    createTaskDevelopmentHandoff: scoped(createTaskDevelopmentHandoff),
    assertTaskDevelopmentCarrier: scoped(assertTaskDevelopmentCarrier),
  });
  return runtime;
}
