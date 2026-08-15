import path from 'node:path';

import {
  createTaskDevelopmentPlanning,
  createTaskCandidate,
  createTaskFinishHandoff,
  normalizeTaskContentTarget,
  normalizeTaskDevelopmentContext,
  normalizeTaskDevelopmentReceipt,
  normalizeTaskVerificationPolicy,
  taskDevelopmentDigest,
  taskDevelopmentError,
} from '../../domain/task-development/task-development.mjs';
import { createContributionHandoff, createParentPlan, normalizeContributionHandoff, normalizePlannedContributionBindings, parentCoordinationError, validateContributionHandoffAgainstPlan } from '../../domain/parent-coordination/parent-coordination.mjs';
import { taskDevelopmentActionFields, taskDevelopmentActionRequiredFields } from './task-development-operation-contracts.mjs';
import { isWorkspaceOnlyTaskRecord, taskRecordEffectiveProjectCodes } from '../../domain/task-record/task-record.mjs';

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
      const reference = references.get(key);
      const availability = reference?.availability || 'unavailable';
      const lifecycle = reference?.workingCopy?.change?.lifecycle || null;
      if (availability !== 'available' || lifecycle !== 'archived') {
        throw taskDevelopmentError(
          'task_development_change_not_converged',
          `Change尚未由当前Task working copy证明已收敛：${key}。`,
          409,
          { project: disposition.project, change: disposition.change, availability, lifecycle },
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

  function declarations(targetRoot, taskId, environmentRoot) {
    const observed = runtime.observeTaskVerificationDeclarations(targetRoot, taskId, environmentRoot);
    const invalid = observed.find((item) => !item.valid);
    if (invalid) throw taskDevelopmentError('task_development_declaration_invalid', `Project ${invalid.project} verification declaration不可用：${invalid.diagnostic}`, 409, { project: invalid.project, path: invalid.path, identity: invalid.identity });
    return observed;
  }

  function declarationValues(observations) {
    return observations.map(({ project, path: declarationPath, identity }) => ({ project, path: declarationPath, identity })).sort((left, right) => left.project.localeCompare(right.project));
  }

  function currentPolicy(policy, observations, contentTargetCurrent = true) {
    return Boolean(policy)
      && same(policy.declarations, declarationValues(observations))
      && (policy.declarations.length > 0 || contentTargetCurrent);
  }

  function buildPolicy(inspected, observations, input) {
    assertActionFields('policy', input, 'Task Development policy');
    if (!Array.isArray(input.capabilities) || !Array.isArray(input.coverageGaps) || !Array.isArray(input.overrides || [])) throw taskDevelopmentError('task_development_policy_input_invalid', 'capabilities、coverageGaps与overrides必须是数组。', 400);
    const observationByProject = new Map(observations.map((item) => [item.project, item]));
    const effectiveProjects = taskRecordEffectiveProjectCodes(inspected.record);
    const workspaceOnly = isWorkspaceOnlyTaskRecord(inspected.record);
    if (!same([...observationByProject.keys()].sort((left, right) => left.localeCompare(right)), effectiveProjects)) {
      throw taskDevelopmentError('task_development_policy_declarations_incomplete', 'Policy declaration observations 必须精确覆盖 Task 的有效 Project 集合。', 409, { expectedProjects: effectiveProjects, observedProjects: [...observationByProject.keys()].sort((left, right) => left.localeCompare(right)) });
    }
    const capabilities = input.capabilities.map((item, index) => {
      assertFields(item, new Set(['project', 'capability', 'required']), `capabilities[${index}]`);
      const project = inputText(item.project, `capabilities[${index}].project`);
      const capability = inputText(item.capability, `capabilities[${index}].capability`);
      const observed = observationByProject.get(project);
      if (!observed) throw taskDevelopmentError('task_development_policy_project_out_of_scope', `Policy Project不属于Task：${project}。`, 400, { project });
      const declared = observed.declaration?.capabilities.find((candidate) => candidate.id === capability);
      if (!declared) throw taskDevelopmentError('task_development_policy_capability_undeclared', `Capability未在current declaration声明：${project}/${capability}。`, 400, { project, capability });
      if (typeof item.required !== 'boolean') throw taskDevelopmentError('task_development_policy_required_invalid', `capabilities[${index}].required必须是boolean。`, 400, { field: `capabilities[${index}].required` });
      return { project, capability, required: item.required };
    });
    const allowedGapScopes = new Set([
      ...effectiveProjects.map((project) => `project:${project}`),
      ...inspected.record.scope.services.map((item) => `service:${item.project}/${item.service}`),
      ...(workspaceOnly ? ['workspace'] : []),
    ]);
    const coverageGaps = input.coverageGaps.map((item, index) => {
      assertFields(item, new Set(['scope', 'summary']), `coverageGaps[${index}]`);
      const scope = inputText(item.scope, `coverageGaps[${index}].scope`);
      const summary = inputText(item.summary, `coverageGaps[${index}].summary`);
      if (!allowedGapScopes.has(scope)) throw taskDevelopmentError('task_development_policy_gap_out_of_scope', `coverage gap不属于Task scope：${scope}。`, 400, { scope });
      return { scope, summary };
    });
    if (workspaceOnly && (capabilities.length !== 0 || coverageGaps.length !== 1 || coverageGaps[0].scope !== 'workspace' || (input.overrides || []).length !== 0)) {
      throw taskDevelopmentError('task_development_policy_workspace_shape_invalid', '仅工作区 policy 必须使用空 declarations、空 capabilities、唯一 workspace coverage gap 与空 overrides。', 400);
    }
    for (const observation of observations) {
      const selected = capabilities.some((item) => item.project === observation.project);
      const gap = coverageGaps.some((item) => item.scope === `project:${observation.project}`);
      if (!selected && !gap) throw taskDevelopmentError('task_development_policy_scope_uncovered', `Project ${observation.project}必须选择capability或记录project coverage gap。`, 400, { project: observation.project });
    }
    const selected = new Set(capabilities.map((item) => `${item.project}/${item.capability}`));
    const selectedValues = new Map(capabilities.map((item) => [`${item.project}/${item.capability}`, item]));
    const overrides = (input.overrides || []).map((item, index) => {
      assertFields(item, new Set(['project', 'capability', 'required', 'scope', 'basis', 'source']), `overrides[${index}]`);
      const project = inputText(item.project, `overrides[${index}].project`);
      const capability = inputText(item.capability, `overrides[${index}].capability`);
      const key = `${project}/${capability}`;
      if (!selected.has(key)) throw taskDevelopmentError('task_development_policy_override_unselected', `override必须绑定已选择capability：${key}。`, 400, { project, capability });
      if (typeof item.required !== 'boolean') throw taskDevelopmentError('task_development_policy_required_invalid', `overrides[${index}].required必须是boolean。`, 400);
      if (item.required !== selectedValues.get(key).required) throw taskDevelopmentError('task_development_policy_override_decision_mismatch', `override required decision必须等于policy最终选择：${key}。`, 400, { project, capability, selected: selectedValues.get(key).required, override: item.required });
      const scope = inputText(item.scope, `overrides[${index}].scope`);
      if (!allowedGapScopes.has(scope)) throw taskDevelopmentError('task_development_policy_override_out_of_scope', `override scope不属于Task：${scope}。`, 400, { scope });
      return {
        project,
        capability,
        required: item.required,
        scope,
        basis: inputText(item.basis, `overrides[${index}].basis`),
        source: inputText(item.source, `overrides[${index}].source`),
      };
    });
    const overrideKeys = new Set(overrides.map((item) => `${item.project}/${item.capability}`));
    for (const capability of capabilities) {
      const observation = observationByProject.get(capability.project);
      const declaration = observation.declaration.capabilities.find((item) => item.id === capability.capability);
      if (capability.required !== declaration.requiredForDelivery && !overrideKeys.has(`${capability.project}/${capability.capability}`)) {
        throw taskDevelopmentError('task_development_policy_override_required', `Policy改变declaration requiredForDelivery时必须记录明确override：${capability.project}/${capability.capability}。`, 400, { project: capability.project, capability: capability.capability, declared: declaration.requiredForDelivery, selected: capability.required });
      }
    }
    const payload = { declarations: declarationValues(observations), capabilities, coverageGaps, overrides };
    return normalizeTaskVerificationPolicy({ identity: taskDevelopmentDigest({
      declarations: [...payload.declarations].sort((left, right) => left.project.localeCompare(right.project)),
      capabilities: [...payload.capabilities].sort((left, right) => `${left.project}/${left.capability}`.localeCompare(`${right.project}/${right.capability}`)),
      coverageGaps: [...payload.coverageGaps].sort((left, right) => `${left.scope}/${left.summary}`.localeCompare(`${right.scope}/${right.summary}`)),
      overrides: [...payload.overrides].sort((left, right) => `${left.project}/${left.capability}/${left.scope}`.localeCompare(`${right.project}/${right.capability}/${right.scope}`)),
    }), ...payload });
  }

  function reviewGate(slot) {
    if (!slot?.present || slot.applicability !== 'current') return null;
    return { resultDigest: slot.resultDigest, targetIdentity: slot.result.targetIdentity, outcome: slot.result.conclusion.outcome, applicability: 'current' };
  }

  function verificationGate(slot) {
    if (!slot?.present || slot.applicability?.status !== 'current') return null;
    return { resultDigest: slot.resultDigest, targetIdentity: slot.result.target.identity, outcome: slot.result.conclusion.outcome, applicability: 'current' };
  }

  function gateDisposition(gate) {
    return gate?.disposition || (gate ? 'current' : null);
  }

  function gateResolved(gate, positiveOutcomes) {
    const disposition = gateDisposition(gate);
    return disposition === 'waived' || disposition === 'not-applicable' || (disposition === 'current' && positiveOutcomes.includes(gate.outcome));
  }

  function planningGate(planning, saved, review) {
    const current = reviewGate(review.slots.planning);
    if (current) return current;
    const disposition = gateDisposition(saved);
    if (!['waived', 'not-applicable'].includes(disposition)) return null;
    if (saved.targetIdentity && saved.targetIdentity !== planning.targetIdentity) return null;
    return saved;
  }

  function policyCoverage(policy, slot) {
    if (!policy || !slot?.present || slot.applicability?.status !== 'current') return { complete: false, missing: [], gaps: [] };
    const facts = new Map(slot.result.capabilities.map((item) => [`${item.project}/${item.capability}`, item]));
    const resultGapScopes = new Set(slot.result.coverageGaps.map((item) => item.scope));
    const policyGapScopes = new Set(policy.coverageGaps.map((item) => item.scope));
    const missing = policy.capabilities.filter((item) => item.required).filter((item) => !facts.has(`${item.project}/${item.capability}`) && !policyGapScopes.has(`project:${item.project}`)).map((item) => `${item.project}/${item.capability}`);
    const gaps = policy.coverageGaps.filter((item) => !resultGapScopes.has(item.scope)).map((item) => item.scope);
    return { complete: missing.length === 0 && gaps.length === 0, missing, gaps };
  }

  function observeCurrent(targetRoot, taskId, receipt, options = {}) {
    const inspected = task(targetRoot, taskId);
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, options.changeDispositions || receipt.taskContext.changes);
    const planning = options.planning ? planningSnapshot(options.planning) : receipt.planning;
    const target = receipt.contentTarget ? contentTarget(execution) : null;
    const observedDeclarations = target ? declarations(targetRoot, taskId, execution.environmentRoot) : [];
    const policyIsCurrent = Boolean(target) && currentPolicy(receipt.verificationPolicy, observedDeclarations, target.identity === receipt.contentTarget?.identity);
    const planningTargetIdentity = planning.targetIdentity;
    const review = runtime.inspectTaskReview(targetRoot, taskId, {
      ...(planningTargetIdentity ? { planningTargetIdentity } : {}),
      ...(receipt.candidate ? { completionTargetIdentity: receipt.candidate.identity } : {}),
    });
    const verification = target ? runtime.inspectTaskVerification(targetRoot, taskId, { targetIdentity: target.identity, declarations: declarationValues(observedDeclarations) }) : { slot: null };
    const planningCurrent = planningGate(planning, receipt.gates.planning, review);
    const savedVerificationDisposition = gateDisposition(receipt.gates.verification);
    const verificationCurrent = policyIsCurrent
      ? verificationGate(verification.slot) || (['waived', 'not-applicable'].includes(savedVerificationDisposition) && (!receipt.gates.verification.targetIdentity || receipt.gates.verification.targetIdentity === target.identity) ? receipt.gates.verification : null)
      : null;
    const coverage = gateDisposition(verificationCurrent) === 'current' ? policyCoverage(receipt.verificationPolicy, verification.slot) : { complete: Boolean(verificationCurrent), missing: [], gaps: [] };
    const reviewedCompletion = receipt.candidate ? reviewGate(review.slots.completion) : null;
    const savedCompletionDisposition = gateDisposition(receipt.gates.completion);
    const completion = reviewedCompletion || (receipt.candidate && ['waived', 'not-applicable'].includes(savedCompletionDisposition) && (!receipt.gates.completion.targetIdentity || receipt.gates.completion.targetIdentity === receipt.candidate.identity) ? receipt.gates.completion : null);
    const inputsCurrent = context.identity === receipt.taskContext.identity && Boolean(target) && target.identity === receipt.contentTarget?.identity && policyIsCurrent;
    const candidateCurrent = Boolean(receipt.candidate)
      && inputsCurrent
      && receipt.candidate.contentTargetIdentity === target.identity
      && receipt.candidate.taskContextIdentity === context.identity
      && receipt.candidate.policyIdentity === receipt.verificationPolicy?.identity
      && gateResolved(planningCurrent, ['ready'])
      && gateResolved(verificationCurrent, ['passed', 'not-passed'])
      && coverage.complete;
    const completionCurrent = candidateCurrent && gateResolved(completion, ['ready', 'changes-required']);
    const proceedCurrent = completionCurrent && receipt.decision?.outcome === 'proceed' && receipt.decision.candidateIdentity === receipt.candidate.identity;
    const currentGates = { planning: planningCurrent, verification: verificationCurrent, completion: candidateCurrent ? completion : null };
    const currentHandoff = proceedCurrent ? [...receipt.handoffs].reverse().find((item) => item.candidate.identity === receipt.candidate.identity && same(item.gates, currentGates) && same(item.decision, receipt.decision)) || null : null;
    const handoffCurrent = Boolean(currentHandoff);
    const reasons = [];
    if (context.identity !== receipt.taskContext.identity) reasons.push({ axis: 'task-context', code: 'task-context-changed' });
    if (!receipt.contentTarget) reasons.push({ axis: 'content-target', code: 'content-target-missing' });
    else if (!target || target.identity !== receipt.contentTarget.identity) reasons.push({ axis: 'content-target', code: 'content-target-changed' });
    if (receipt.contentTarget && !policyIsCurrent) reasons.push({ axis: 'policy', code: receipt.verificationPolicy ? 'declarations-changed' : 'policy-missing' });
    if (!gateResolved(planningCurrent, ['ready'])) reasons.push({ axis: 'planning', code: planningCurrent ? 'planning-changes-required' : 'planning-missing-or-stale' });
    if (receipt.contentTarget && !verificationCurrent) reasons.push({ axis: 'verification', code: 'verification-missing-or-stale' });
    else if (gateDisposition(verificationCurrent) === 'current' && verificationCurrent.outcome !== 'passed') reasons.push({ axis: 'verification', code: 'verification-not-passed', riskAcceptable: true });
    if (receipt.contentTarget && !coverage.complete) reasons.push({ axis: 'verification-policy', code: 'required-facts-incomplete', missing: coverage.missing, gaps: coverage.gaps });
    if (receipt.candidate && !candidateCurrent) reasons.push({ axis: 'candidate', code: 'candidate-stale' });
    if (receipt.candidate && !completionCurrent) reasons.push({ axis: 'completion', code: 'completion-missing-or-stale' });
    else if (gateDisposition(completion) === 'current' && completion?.outcome === 'changes-required') reasons.push({ axis: 'completion', code: 'completion-changes-required', riskAcceptable: true });
    return { inspected, execution, context, planning, target, observedDeclarations, policyIsCurrent, review, verification, gates: currentGates, coverage, candidateCurrent, completionCurrent, proceedCurrent, handoffCurrent, currentHandoff, reasons };
  }

  function initialReceipt(taskId, execution, context, planning, content = null, planningGateValue = null) {
    const timestamp = now();
    return normalizeTaskDevelopmentReceipt({ schemaVersion: 'buildr.task-development-receipt/v3', taskId, environment: { taskId, receiptSchema: execution.receiptSchema }, taskContext: context, planning, parentPlan: null, plannedContributions: [], parentAcceptance: null, contentTarget: content, verificationPolicy: null, generation: 0, candidate: null, gates: { planning: planningGateValue, verification: null, completion: null }, decision: null, handoffs: [], createdAt: timestamp, updatedAt: timestamp }, { expectedTaskId: taskId });
  }

  function writeDevelopment(targetRoot, taskId, previous, receipt, currentObservation = null, options = {}) {
    if (previous) {
      const prefix = previous.handoffs;
      if (receipt.handoffs.length < prefix.length || !prefix.every((item, index) => same(item, receipt.handoffs[index]))) throw taskDevelopmentError('task_development_handoff_immutable', '已正式形成的 handoff snapshot 不得改写或删除。', 409);
    }
    const observed = currentObservation || observeCurrent(targetRoot, taskId, receipt, options);
    const applicability = applicabilityFromObserved(receipt, observed);
    return runtime.writeTaskDevelopmentPersistence(targetRoot, receipt, { applicability, observedAt: now() });
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
    if (applicability.taskContext === 'stale' || applicability.planning === 'stale') return { mode: 'required', owner: 'task-development', action: 'planning', capability: { id: 'buildr.task-development', version: 2 }, summary: '刷新current Task context与完整planning snapshot；专业artifact仍由对应authority维护。' };
    if (!applicability.gates?.planning || reasonCodes.has('planning-missing-or-stale') || reasonCodes.has('planning-changes-required')) return { mode: 'recommended', owner: 'task-review', action: 'planning-review', capability: { id: 'buildr.task-review', version: 1 }, summary: '通过task-review完成current Planning Review，或记录明确的not-applicable/waived disposition。' };
    if (applicability.contentTarget !== 'current') return { mode: 'recommended', owner: 'agent', action: 'develop-and-observe', capability: null, summary: '完成内容、测试开发与Change收敛后调用observe建立stable Content Target。' };
    if (applicability.policy !== 'current') return { mode: 'recommended', owner: 'task-development', action: 'policy', capability: { id: 'buildr.task-development', version: 2 }, summary: '根据current Task Verification declarations记录verification policy。' };
    if (!applicability.gates?.verification || reasonCodes.has('verification-missing-or-stale') || reasonCodes.has('required-facts-incomplete')) return { mode: 'recommended', owner: 'task-verification', action: 'verify', capability: { id: 'buildr.task-verification', version: 3 }, summary: '通过task-verification形成与current Content Target和policy匹配的正式Result。' };
    if (applicability.candidate !== 'current') return { mode: 'recommended', owner: 'task-development', action: 'freeze', capability: { id: 'buildr.task-development', version: 2 }, summary: '调用freeze形成或复用current Task Candidate；负向Verification仍需后续显式风险决定。' };
    if (!applicability.gates?.completion || reasonCodes.has('completion-missing-or-stale')) return { mode: 'recommended', owner: 'task-review', action: 'completion-review', capability: { id: 'buildr.task-review', version: 1 }, summary: '通过task-review形成current Completion Review，或记录明确的not-applicable/waived disposition。' };
    if (reasonCodes.has('completion-changes-required') && !receipt.decision) return { mode: 'recommended', owner: 'agent', action: 'remediate-or-decide', capability: null, summary: '处理Completion Review findings，或在明确授权下记录与current Result绑定的风险决定。' };
    if (!receipt.decision || receipt.decision.candidateIdentity !== receipt.candidate?.identity) return { mode: 'recommended', owner: 'task-development', action: 'decide', capability: { id: 'buildr.task-development', version: 2 }, summary: '根据current gates记录proceed或blocked；风险接受必须绑定精确Result与明确授权。' };
    if (receipt.decision.outcome === 'blocked') return { mode: 'recommended', owner: 'agent', action: 'remediate-blocker', capability: null, summary: '处理blocked原因并更新对应专业事实；Buildr不会自动推进。' };
    if (applicability.handoff !== 'current') return { mode: 'recommended', owner: 'task-development', action: 'handoff', capability: { id: 'buildr.task-development', version: 2 }, summary: '调用handoff形成immutable Finish handoff。' };
    return { mode: 'recommended', owner: 'task-finish', action: 'finish', capability: { id: 'buildr.task-finish', version: 1 }, summary: 'current Finish handoff已就绪；等待明确交付授权后进入task-finish。' };
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
      policy: !receipt.contentTarget ? 'missing' : observed.policyIsCurrent ? 'current' : receipt.verificationPolicy ? 'stale' : 'missing',
      candidate: receipt.candidate ? observed.candidateCurrent ? 'current' : 'stale' : 'missing',
      handoff: receipt.handoffs.length ? observed.handoffCurrent ? 'current' : 'stale' : 'missing',
      gates: observed.gates,
      reasons: observed.reasons,
    };
  }

  function inspectTaskDevelopmentCurrent(targetRoot, taskId) {
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    if (!persistence) return { ...result('inspect', 'missing', taskId, null, null, [], null, ['在首个正式研发动作时使用task-development begin建立current planning facts。']), next: { mode: 'required', owner: 'task-development', action: 'begin', capability: { id: 'buildr.task-development', version: 2 }, summary: '在首个正式研发动作时使用task-development begin建立current planning facts。' } };
    return result('inspect', 'inspected', taskId, persistence, persistence.applicability);
  }

  function inspectTaskDevelopment(targetRoot, taskId) {
    const inspectedTask = task(targetRoot, taskId);
    return inspectTaskDevelopmentCurrent(targetRoot, inspectedTask.taskId);
  }

  function planningMutation(operation, targetRoot, taskId, input) {
    const label = `Task Development ${operation}`;
    assertActionFields(operation, input, label);
    assertActionRequiredFields(operation, input, label);
    const inspected = task(targetRoot, taskId, { active: true, mutation: true });
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, input.changeDispositions);
    const planning = planningSnapshot(input.planning);
    const requestedGate = input.planningGate ?? null;
    if (requestedGate) {
      assertFields(requestedGate, new Set(['disposition', 'targetIdentity', 'summary', 'source']), 'planningGate');
      if (!['waived', 'not-applicable'].includes(requestedGate.disposition)) throw taskDevelopmentError('task_development_gate_disposition_invalid', 'begin/planning只接受waived或not-applicable planningGate。', 400, { field: 'planningGate.disposition' });
    }
    const review = runtime.inspectTaskReview(targetRoot, taskId, planning.targetIdentity ? { planningTargetIdentity: planning.targetIdentity } : {});
    const resolvedPlanningGate = reviewGate(review.slots.planning) || requestedGate;
    const current = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    let receipt;
    if (!current) receipt = initialReceipt(taskId, execution, context, planning, null, resolvedPlanningGate);
    else {
      const changed = context.identity !== current.receipt.taskContext.identity || planning.identity !== current.receipt.planning.identity || !same(resolvedPlanningGate, current.receipt.gates.planning);
      receipt = normalizeTaskDevelopmentReceipt({
        ...current.receipt,
        taskContext: context,
        planning,
        candidate: changed ? null : current.receipt.candidate,
        gates: { planning: resolvedPlanningGate, verification: changed ? null : current.receipt.gates.verification, completion: changed ? null : current.receipt.gates.completion },
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
    const target = contentTarget(execution);
    const current = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    const planning = current?.receipt.planning || createTaskDevelopmentPlanning({ targetIdentity: input.planningTargetIdentity || null, nodes: [] });
    if (input.planningTargetIdentity && planning.targetIdentity !== input.planningTargetIdentity) throw taskDevelopmentError('task_development_planning_target_mismatch', 'observe的planningTargetIdentity与current planning snapshot不一致；先更新planning facts。', 409, { expected: planning.targetIdentity, actual: input.planningTargetIdentity });
    const review = runtime.inspectTaskReview(targetRoot, taskId, planning.targetIdentity ? { planningTargetIdentity: planning.targetIdentity } : {});
    const currentPlanningGate = planningGate(planning, current?.receipt.gates.planning || null, review);
    let receipt = current?.receipt || initialReceipt(taskId, execution, context, planning, target, currentPlanningGate);
    if (current) {
      const observedDeclarations = declarations(targetRoot, taskId, execution.environmentRoot);
      const policy = currentPolicy(receipt.verificationPolicy, observedDeclarations, target.identity === receipt.contentTarget?.identity) ? receipt.verificationPolicy : null;
      const upstreamChanged = context.identity !== receipt.taskContext.identity || target.identity !== receipt.contentTarget?.identity || policy?.identity !== receipt.verificationPolicy?.identity || !same(currentPlanningGate, receipt.gates.planning);
      receipt = normalizeTaskDevelopmentReceipt({
        ...receipt,
        taskContext: context,
        contentTarget: target,
        verificationPolicy: policy,
        candidate: upstreamChanged ? null : receipt.candidate,
        gates: { planning: currentPlanningGate, verification: upstreamChanged ? null : receipt.gates.verification, completion: upstreamChanged ? null : receipt.gates.completion },
        decision: upstreamChanged ? null : receipt.decision,
        updatedAt: now(),
      }, { expectedTaskId: taskId });
    }
    const written = writeDevelopment(targetRoot, taskId, current?.receipt || null, receipt);
    return result('observe', current ? 'updated' : 'created', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function recordTaskDevelopmentPolicy(targetRoot, taskId, input) {
    const inspected = task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, persistence.receipt.taskContext.changes);
    const target = contentTarget(execution);
    const observedDeclarations = declarations(targetRoot, taskId, execution.environmentRoot);
    const policy = buildPolicy(inspected, observedDeclarations, input);
    const planningTarget = persistence.receipt.planning.targetIdentity;
    const review = runtime.inspectTaskReview(targetRoot, taskId, planningTarget ? { planningTargetIdentity: planningTarget } : {});
    const planning = planningGate(persistence.receipt.planning, persistence.receipt.gates.planning, review);
    const inputsChanged = context.identity !== persistence.receipt.taskContext.identity || target.identity !== persistence.receipt.contentTarget?.identity || policy.identity !== persistence.receipt.verificationPolicy?.identity || !same(planning, persistence.receipt.gates.planning);
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, taskContext: context, contentTarget: target, verificationPolicy: policy, candidate: inputsChanged ? null : persistence.receipt.candidate, gates: { planning, verification: inputsChanged ? null : persistence.receipt.gates.verification, completion: inputsChanged ? null : persistence.receipt.gates.completion }, decision: inputsChanged ? null : persistence.receipt.decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('policy', 'recorded', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function invalidateForObserved(receipt, observed) {
    const policy = observed.policyIsCurrent ? receipt.verificationPolicy : null;
    return normalizeTaskDevelopmentReceipt({ ...receipt, taskContext: observed.context, planning: observed.planning, contentTarget: observed.target || receipt.contentTarget, verificationPolicy: policy, candidate: null, gates: { planning: observed.gates.planning, verification: policy && observed.coverage.complete ? observed.gates.verification : null, completion: null }, decision: null, updatedAt: now() }, { expectedTaskId: receipt.taskId });
  }

  function recordTaskDevelopmentGate(targetRoot, taskId, input) {
    assertActionFields('gate', input, 'Task Development gate');
    if (!['planning', 'verification', 'completion'].includes(input.gate)) throw taskDevelopmentError('task_development_gate_invalid', 'gate必须是planning、verification或completion。', 400, { field: 'gate' });
    if (!['waived', 'not-applicable'].includes(input.disposition)) throw taskDevelopmentError('task_development_gate_disposition_invalid', 'gate disposition必须是waived或not-applicable。', 400, { field: 'disposition' });
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    if (input.gate !== 'planning' && !persistence.receipt.contentTarget) throw taskDevelopmentError('task_development_content_target_required', `${input.gate} disposition需要stable Content Target。`, 409);
    if (input.gate === 'completion' && !persistence.receipt.candidate) throw taskDevelopmentError('task_development_candidate_required', 'completion disposition需要current Candidate。', 409);
    const gate = { disposition: input.disposition, targetIdentity: input.targetIdentity ?? null, summary: input.summary, source: input.source ?? null };
    const gates = { ...persistence.receipt.gates, [input.gate]: gate };
    const invalidatesCandidate = input.gate !== 'completion';
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, candidate: invalidatesCandidate ? null : persistence.receipt.candidate, gates: { ...gates, completion: invalidatesCandidate ? null : gates.completion }, decision: null, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('gate', 'recorded', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function freezeTaskDevelopmentCandidate(targetRoot, taskId, input = {}) {
    assertActionFields('freeze', input, 'Task Development freeze');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt, input);
    const pendingChanges = observed.context.changes.filter((item) => item.disposition === 'pending');
    const ready = observed.policyIsCurrent && gateResolved(observed.gates.planning, ['ready']) && gateResolved(observed.gates.verification, ['passed', 'not-passed']) && observed.coverage.complete && pendingChanges.length === 0;
    if (!ready) {
      const invalidated = writeDevelopment(targetRoot, taskId, persistence.receipt, invalidateForObserved(persistence.receipt, observed));
      throw taskDevelopmentError('task_development_candidate_not_ready', 'Candidate freeze前置gate未满足。', 409, { reasons: observed.reasons, pendingChanges: pendingChanges.map((item) => `${item.project}/${item.change}`), receiptDigest: invalidated.receiptDigest }, '完成Change convergence、Planning Review与stable Content Target formal Verification后重试。');
    }
    const canReuse = observed.candidateCurrent;
    const generation = canReuse ? persistence.receipt.generation : persistence.receipt.generation + 1;
    const candidate = canReuse ? persistence.receipt.candidate : createTaskCandidate({ generation, contentTargetIdentity: observed.target.identity, taskContextIdentity: observed.context.identity, policyIdentity: persistence.receipt.verificationPolicy.identity });
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, taskContext: observed.context, contentTarget: observed.target, generation, candidate, gates: { planning: observed.gates.planning, verification: observed.gates.verification, completion: canReuse ? observed.gates.completion : null }, decision: canReuse ? persistence.receipt.decision : null, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt, null, input);
    return result('freeze', canReuse ? 'unchanged' : 'frozen', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function decideTaskDevelopment(targetRoot, taskId, input) {
    assertActionFields('decide', input, 'Task Development decide');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    const base = observed.candidateCurrent ? { ...persistence.receipt, gates: observed.gates } : invalidateForObserved(persistence.receipt, observed);
    if (input.outcome === 'proceed' && (!observed.candidateCurrent || !observed.completionCurrent)) throw taskDevelopmentError('task_development_proceed_not_ready', 'proceed需要current Candidate与current Completion Review。', 409, { reasons: observed.reasons });
    const decision = { outcome: input.outcome, candidateIdentity: observed.candidateCurrent ? persistence.receipt.candidate.identity : null, summary: input.summary, risks: input.risks };
    if (input.outcome === 'proceed') createTaskFinishHandoff({ candidate: persistence.receipt.candidate, changes: observed.context.changes, gates: observed.gates, decision, createdAt: now() });
    const receipt = normalizeTaskDevelopmentReceipt({ ...base, decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('decide', 'recorded', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  function createTaskDevelopmentHandoff(targetRoot, taskId, input = {}) {
    assertActionFields('handoff', input, 'Task Development handoff');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    if (!observed.candidateCurrent || !observed.completionCurrent || persistence.receipt.decision?.outcome !== 'proceed') throw taskDevelopmentError('task_development_handoff_not_ready', 'Finish handoff需要current Candidate、Planning/Verification/Completion gates与proceed decision。', 409, { reasons: observed.reasons });
    let contributionHandoff = null;
    if (input.contributionHandoff) {
      contributionHandoff = input.contributionHandoff.identity ? normalizeContributionHandoff(input.contributionHandoff) : createContributionHandoff(input.contributionHandoff);
      const taskRecord = runtime.inspectTaskRecord(targetRoot, taskId).record;
      const selfDelivery = contributionHandoff.parentTaskId === taskId && persistence.receipt.parentPlan;
      if (!selfDelivery && taskRecord.parentTaskId !== contributionHandoff.parentTaskId) throw parentCoordinationError('contribution_handoff_parent_mismatch', 'Contribution Handoff parentTaskId必须等于Child Task Record parent。', 409, { recordParent: taskRecord.parentTaskId, handoffParent: contributionHandoff.parentTaskId });
      const parentReceipt = selfDelivery ? persistence.receipt : runtime.inspectTaskDevelopment(targetRoot, contributionHandoff.parentTaskId).development?.receipt;
      const parentPlan = parentReceipt?.parentPlan;
      if (!parentPlan) throw parentCoordinationError('parent_plan_missing', 'Contribution Handoff必须绑定current Parent Plan。', 409, { parentTaskId: contributionHandoff.parentTaskId });
      const expectedPlanned = (selfDelivery
        ? parentPlan.contributions.filter((item) => item.plannedChildTaskId === taskId).map((item) => item.id)
        : persistence.receipt.plannedContributions.filter((item) => item.parentTaskId === contributionHandoff.parentTaskId).map((item) => item.contributionId)
      ).sort();
      contributionHandoff = validateContributionHandoffAgainstPlan(contributionHandoff, parentPlan, expectedPlanned);
    }
    const handoff = createTaskFinishHandoff({ candidate: persistence.receipt.candidate, changes: observed.context.changes, gates: observed.gates, decision: persistence.receipt.decision, contributionHandoff, createdAt: now() });
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
    const parentAcceptanceCurrent = !persistence.receipt.parentPlan
      || persistence.receipt.parentAcceptance?.planIdentity === persistence.receipt.parentPlan.identity;
    if (observed.handoffCurrent && mismatches.length === 0 && parentAcceptanceCurrent) return result('carrier', 'equivalent', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed));
    if (observed.handoffCurrent && mismatches.length === 0 && !parentAcceptanceCurrent) return result('carrier', 'stale', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed), [], { code: 'parent_final_acceptance_required', message: '采用Parent Plan的Task必须先记录绑定current Plan identity的显式最终集成验收。' }, ['调用task parent inspect确认Contribution前置条件，再执行task parent accept。']);
    return result('carrier', 'stale', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed), [], {
      code: mismatches.length ? 'task_development_carrier_identity_mismatch' : 'task_development_carrier_not_equivalent',
      message: mismatches.length ? 'Finish run冻结identity与current Development handoff不一致。' : 'Delivery carrier与current handoff Candidate不等价。',
      details: { expected, current, mismatches, reasons: observed.reasons },
    }, ['返回task-development重新建立stable target、Verification、Candidate、Completion Review与handoff。']);
  }

  function recordTaskParentPlan(targetRoot, taskId, input) {
    assertFields(input, new Set(['plan', 'expectedPlanIdentity', 'reason']), 'Task Development parent plan');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const currentIdentity = persistence.receipt.parentPlan?.identity ?? null;
    if (input.expectedPlanIdentity !== undefined && input.expectedPlanIdentity !== currentIdentity) throw parentCoordinationError('parent_plan_conflict', 'Parent Plan expected identity已陈旧。', 409, { expected: input.expectedPlanIdentity, current: currentIdentity }, '重新inspect Parent coordination后显式reconcile。');
    const plan = input.plan?.identity ? input.plan : createParentPlan(input.plan);
    if (currentIdentity === null && input.expectedPlanIdentity !== undefined) throw parentCoordinationError('parent_plan_conflict', '首次record不得提交非空expected identity。', 409);
    const planning = createTaskDevelopmentPlanning({ targetIdentity: plan.identity, nodes: [{ id: 'parent-plan', kind: 'parent-plan', authority: 'buildr.task-development/v3', reference: `workspace-sqlite:task-development/${taskId}#parent-plan`, identity: plan.identity, disposition: 'current', summary: 'Parent outcome、architecture invariants、Contribution Map、dependencies与final acceptance。', source: null }] });
    const changed = currentIdentity !== plan.identity;
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, parentPlan: plan, parentAcceptance: changed ? null : persistence.receipt.parentAcceptance, planning, candidate: changed ? null : persistence.receipt.candidate, gates: { planning: changed ? null : persistence.receipt.gates.planning, verification: changed ? null : persistence.receipt.gates.verification, completion: changed ? null : persistence.receipt.gates.completion }, decision: changed ? null : persistence.receipt.decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('parent-plan', changed ? (currentIdentity ? 'reconciled' : 'recorded') : 'unchanged', taskId, written, written.applicability, changed ? [effect(written.root, written)] : []);
  }

  function bindTaskPlannedContributions(targetRoot, taskId, input) {
    assertFields(input, new Set(['parentTaskId', 'contributionIds']), 'Task Development contribution binding');
    const child = task(targetRoot, taskId, { active: true, mutation: true });
    if (child.record.parentTaskId !== input.parentTaskId) throw parentCoordinationError('parent_contribution_parent_mismatch', 'Child Task Record parent与binding不一致。', 409, { recordParent: child.record.parentTaskId, requestedParent: input.parentTaskId });
    const parent = runtime.inspectTaskDevelopment(targetRoot, input.parentTaskId);
    const plan = parent.development?.receipt?.parentPlan;
    if (!plan) throw parentCoordinationError('parent_plan_missing', 'Parent尚未采用Parent Plan。', 409, { parentTaskId: input.parentTaskId });
    const contributionIds = [...new Set(input.contributionIds || [])].sort();
    if (!contributionIds.length || contributionIds.some((id) => !plan.contributions.some((item) => item.id === id))) throw parentCoordinationError('parent_contribution_unknown', 'binding必须引用Parent Plan中的一个或多个Contribution。', 409, { contributionIds });
    const conflictingOwner = plan.contributions.find((item) => contributionIds.includes(item.id) && item.plannedChildTaskId && item.plannedChildTaskId !== taskId);
    if (conflictingOwner) throw parentCoordinationError('parent_contribution_owner_conflict', 'Contribution已由Parent Plan分配给其他Task；必须先显式reconcile。', 409, { contributionId: conflictingOwner.id, plannedChildTaskId: conflictingOwner.plannedChildTaskId, requestedChildTaskId: taskId });
    const parentRecord = runtime.inspectTaskRecord(targetRoot, input.parentTaskId).record;
    for (const siblingTaskId of parentRecord.childTaskIds.filter((id) => id !== taskId)) {
      const siblingBindings = runtime.inspectTaskDevelopment(targetRoot, siblingTaskId).development?.receipt?.plannedContributions || [];
      const duplicate = siblingBindings.find((item) => item.parentTaskId === input.parentTaskId && contributionIds.includes(item.contributionId));
      if (duplicate) throw parentCoordinationError('parent_contribution_owner_conflict', 'Contribution已绑定其他Child；必须先显式reconcile并收敛旧Child scope。', 409, { contributionId: duplicate.contributionId, plannedChildTaskId: siblingTaskId, requestedChildTaskId: taskId });
    }
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const bindings = normalizePlannedContributionBindings(contributionIds.map((contributionId) => ({ parentTaskId: input.parentTaskId, contributionId })));
    const changed = !same(bindings, persistence.receipt.plannedContributions);
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, plannedContributions: bindings, candidate: changed ? null : persistence.receipt.candidate, gates: { ...persistence.receipt.gates, verification: changed ? null : persistence.receipt.gates.verification, completion: changed ? null : persistence.receipt.gates.completion }, decision: changed ? null : persistence.receipt.decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('contribution-bind', changed ? 'recorded' : 'unchanged', taskId, written, written.applicability, changed ? [effect(written.root, written)] : []);
  }

  function recordTaskParentAcceptance(targetRoot, taskId, input) {
    assertFields(input, new Set(['expectedPlanIdentity', 'summary']), 'Task Development parent acceptance');
    task(targetRoot, taskId, { active: true, mutation: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    if (!persistence.receipt.parentPlan || persistence.receipt.parentPlan.identity !== input.expectedPlanIdentity) throw parentCoordinationError('parent_plan_conflict', 'Parent final acceptance必须绑定current Parent Plan identity。', 409, { current: persistence.receipt.parentPlan?.identity ?? null, expected: input.expectedPlanIdentity });
    const acceptance = { planIdentity: input.expectedPlanIdentity, summary: inputText(input.summary, 'summary'), acceptedAt: now() };
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, parentAcceptance: acceptance, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, taskId, persistence.receipt, receipt);
    return result('parent-acceptance', 'recorded', taskId, written, written.applicability, [effect(written.root, written)]);
  }

  const scoped = (operation) => (targetRoot, ...args) => {
    const invoke = () => operation(targetRoot, ...args);
    if (typeof runtime.withWorkspaceStructuredStoreOperation !== 'function') return invoke();
    return runtime.withWorkspaceStructuredStoreOperation(targetRoot, invoke);
  };
  Object.assign(runtime, {
    inspectTaskDevelopment: scoped(inspectTaskDevelopment),
    inspectTaskDevelopmentCurrent: scoped(inspectTaskDevelopmentCurrent),
    beginTaskDevelopment: scoped(beginTaskDevelopment),
    recordTaskDevelopmentPlanning: scoped(recordTaskDevelopmentPlanning),
    observeTaskDevelopment: scoped(observeTaskDevelopment),
    recordTaskDevelopmentPolicy: scoped(recordTaskDevelopmentPolicy),
    recordTaskDevelopmentGate: scoped(recordTaskDevelopmentGate),
    freezeTaskDevelopmentCandidate: scoped(freezeTaskDevelopmentCandidate),
    decideTaskDevelopment: scoped(decideTaskDevelopment),
    createTaskDevelopmentHandoff: scoped(createTaskDevelopmentHandoff),
    assertTaskDevelopmentCarrier: scoped(assertTaskDevelopmentCarrier),
    recordTaskParentPlan: scoped(recordTaskParentPlan),
    bindTaskPlannedContributions: scoped(bindTaskPlannedContributions),
    recordTaskParentAcceptance: scoped(recordTaskParentAcceptance),
  });
  return runtime;
}
