import path from 'node:path';

import {
  createTaskCandidate,
  createTaskFinishHandoff,
  normalizeTaskContentTarget,
  normalizeTaskDevelopmentContext,
  normalizeTaskDevelopmentReceipt,
  normalizeTaskVerificationPolicy,
  taskDevelopmentDigest,
  taskDevelopmentError,
} from '../../domain/task-development/task-development.mjs';

function assertObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskDevelopmentError('task_development_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input, fields, label) {
  assertObject(input, label);
  for (const field of Object.keys(input)) if (!fields.has(field)) throw taskDevelopmentError('task_development_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
}

function relative(root, file) {
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
  function task(targetRoot, taskId, { active = false } = {}) {
    const inspected = runtime.inspectTaskRecord(targetRoot, taskId);
    if (active && inspected.record.status !== 'active') throw taskDevelopmentError('task_development_task_terminal', `Task ${taskId} 已是 ${inspected.record.status}，不能修改Development Receipt。`, 409, { status: inspected.record.status });
    return inspected;
  }

  function environment(targetRoot, taskId) {
    const context = runtime.resolveTaskEnvironmentExecution(targetRoot, taskId);
    if (!context?.ready) throw taskDevelopmentError('task_development_environment_not_ready', `Task Environment 未ready：${taskId}。`, 409, context?.blocked || context, '先通过task-environment恢复matching ready Environment。');
    return context;
  }

  function normalizedDispositions(record, values) {
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
    const expected = new Set(record.changes.map((item) => `${item.project}/${item.change}`));
    for (const key of input.keys()) if (!expected.has(key)) throw taskDevelopmentError('task_development_change_out_of_scope', `Change不属于Task：${key}。`, 409, { key });
    for (const key of expected) if (!input.has(key)) throw taskDevelopmentError('task_development_change_disposition_missing', `Change缺少Development disposition：${key}。`, 409, { key });
    return [...input.values()];
  }

  function taskContext(inspected, dispositions) {
    const payload = {
      taskId: inspected.record.taskId,
      intent: inspected.record.intent,
      scope: inspected.record.scope,
      changes: normalizedDispositions(inspected.record, dispositions),
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

  function contentTarget(context) {
    const components = runtime.observeTaskContentComponents(context.scopes);
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

  function currentPolicy(policy, observations) {
    return Boolean(policy) && same(policy.declarations, declarationValues(observations));
  }

  function buildPolicy(inspected, observations, input) {
    assertFields(input, new Set(['capabilities', 'coverageGaps', 'overrides']), 'Task Development policy');
    if (!Array.isArray(input.capabilities) || !Array.isArray(input.coverageGaps) || !Array.isArray(input.overrides || [])) throw taskDevelopmentError('task_development_policy_input_invalid', 'capabilities、coverageGaps与overrides必须是数组。', 400);
    const observationByProject = new Map(observations.map((item) => [item.project, item]));
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
      ...inspected.record.scope.projects.map((project) => `project:${project}`),
      ...inspected.record.scope.services.map((item) => `service:${item.project}/${item.service}`),
    ]);
    const coverageGaps = input.coverageGaps.map((item, index) => {
      assertFields(item, new Set(['scope', 'summary']), `coverageGaps[${index}]`);
      const scope = inputText(item.scope, `coverageGaps[${index}].scope`);
      const summary = inputText(item.summary, `coverageGaps[${index}].summary`);
      if (!allowedGapScopes.has(scope)) throw taskDevelopmentError('task_development_policy_gap_out_of_scope', `coverage gap不属于Task scope：${scope}。`, 400, { scope });
      return { scope, summary };
    });
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
    const target = contentTarget(execution);
    const observedDeclarations = declarations(targetRoot, taskId, execution.environmentRoot);
    const policyIsCurrent = currentPolicy(receipt.verificationPolicy, observedDeclarations);
    const planningTargetIdentity = options.planningTargetIdentity || receipt.gates.planning?.targetIdentity;
    const review = runtime.inspectTaskReview(targetRoot, taskId, {
      ...(planningTargetIdentity ? { planningTargetIdentity } : {}),
      ...(receipt.candidate ? { completionTargetIdentity: receipt.candidate.identity } : {}),
    });
    const verification = runtime.inspectTaskVerification(targetRoot, taskId, { targetIdentity: target.identity, declarationRoot: execution.environmentRoot });
    const planning = reviewGate(review.slots.planning);
    const verificationCurrent = policyIsCurrent ? verificationGate(verification.slot) : null;
    const coverage = policyCoverage(policyIsCurrent ? receipt.verificationPolicy : null, verification.slot);
    const completion = receipt.candidate ? reviewGate(review.slots.completion) : null;
    const inputsCurrent = context.identity === receipt.taskContext.identity && target.identity === receipt.contentTarget.identity && policyIsCurrent;
    const candidateCurrent = Boolean(receipt.candidate)
      && inputsCurrent
      && receipt.candidate.contentTargetIdentity === target.identity
      && receipt.candidate.taskContextIdentity === context.identity
      && receipt.candidate.policyIdentity === receipt.verificationPolicy?.identity
      && planning?.outcome === 'ready'
      && Boolean(verificationCurrent)
      && coverage.complete;
    const completionCurrent = candidateCurrent && Boolean(completion);
    const proceedCurrent = completionCurrent && receipt.decision?.outcome === 'proceed' && receipt.decision.candidateIdentity === receipt.candidate.identity;
    const currentGates = { planning, verification: verificationCurrent, completion: candidateCurrent ? completion : null };
    const currentHandoff = proceedCurrent ? [...receipt.handoffs].reverse().find((item) => item.candidate.identity === receipt.candidate.identity && same(item.gates, currentGates) && same(item.decision, receipt.decision)) || null : null;
    const handoffCurrent = Boolean(currentHandoff);
    const reasons = [];
    if (context.identity !== receipt.taskContext.identity) reasons.push({ axis: 'task-context', code: 'task-context-changed' });
    if (target.identity !== receipt.contentTarget.identity) reasons.push({ axis: 'content-target', code: 'content-target-changed' });
    if (!policyIsCurrent) reasons.push({ axis: 'policy', code: receipt.verificationPolicy ? 'declarations-changed' : 'policy-missing' });
    if (!planning || planning.outcome !== 'ready') reasons.push({ axis: 'planning', code: planning ? 'planning-changes-required' : 'planning-missing-or-stale' });
    if (!verificationCurrent) reasons.push({ axis: 'verification', code: 'verification-missing-or-stale' });
    else if (verificationCurrent.outcome !== 'passed') reasons.push({ axis: 'verification', code: 'verification-not-passed', riskAcceptable: true });
    if (!coverage.complete) reasons.push({ axis: 'verification-policy', code: 'required-facts-incomplete', missing: coverage.missing, gaps: coverage.gaps });
    if (receipt.candidate && !candidateCurrent) reasons.push({ axis: 'candidate', code: 'candidate-stale' });
    if (receipt.candidate && !completionCurrent) reasons.push({ axis: 'completion', code: 'completion-missing-or-stale' });
    else if (completion?.outcome === 'changes-required') reasons.push({ axis: 'completion', code: 'completion-changes-required', riskAcceptable: true });
    return { inspected, execution, context, target, observedDeclarations, policyIsCurrent, review, verification, gates: currentGates, coverage, candidateCurrent, completionCurrent, proceedCurrent, handoffCurrent, currentHandoff, reasons };
  }

  function initialReceipt(taskId, execution, context, target, planning) {
    const timestamp = now();
    return normalizeTaskDevelopmentReceipt({ schemaVersion: 'buildr.task-development-receipt/v1', taskId, environment: { taskId, receiptSchema: execution.receiptSchema }, taskContext: context, contentTarget: target, verificationPolicy: null, generation: 0, candidate: null, gates: { planning, verification: null, completion: null }, decision: null, handoffs: [], createdAt: timestamp, updatedAt: timestamp }, { expectedTaskId: taskId });
  }

  function writeDevelopment(targetRoot, previous, receipt) {
    if (previous) {
      const prefix = previous.handoffs;
      if (receipt.handoffs.length < prefix.length || !prefix.every((item, index) => same(item, receipt.handoffs[index]))) throw taskDevelopmentError('task_development_handoff_immutable', '已正式形成的 handoff snapshot 不得改写或删除。', 409);
    }
    return runtime.writeTaskDevelopmentPersistence(targetRoot, receipt);
  }

  function effect(root, written) {
    return { type: written.created ? 'created' : 'updated', path: relative(root, written.file) };
  }

  function readModel(persistence, applicability) {
    return { path: persistence.file, receiptDigest: persistence.receiptDigest, receipt: persistence.receipt, applicability };
  }

  function result(operation, status, taskId, persistence, applicability, effects = [], diagnostic = null, nextActions = []) {
    return { schemaVersion: 'buildr.task-development-operation-result/v1', operation, status, taskId, development: persistence ? readModel(persistence, applicability) : null, diagnostic, effects, nextActions };
  }

  function applicabilityFromObserved(receipt, observed) {
    return {
      status: observed.handoffCurrent ? 'handoff-current' : observed.candidateCurrent ? 'candidate-current' : 'developing',
      taskContext: observed.context.identity === receipt.taskContext.identity ? 'current' : 'stale',
      contentTarget: observed.target.identity === receipt.contentTarget.identity ? 'current' : 'stale',
      policy: observed.policyIsCurrent ? 'current' : receipt.verificationPolicy ? 'stale' : 'missing',
      candidate: receipt.candidate ? observed.candidateCurrent ? 'current' : 'stale' : 'missing',
      handoff: receipt.handoffs.length ? observed.handoffCurrent ? 'current' : 'stale' : 'missing',
      gates: observed.gates,
      reasons: observed.reasons,
    };
  }

  function inspectTaskDevelopment(targetRoot, taskId) {
    const inspectedTask = task(targetRoot, taskId);
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    if (!persistence) return result('inspect', 'missing', inspectedTask.taskId, null, null, [], null, ['使用task-development在ready Environment中observe current context。']);
    try {
      const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
      return result('inspect', 'inspected', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed));
    } catch (error) {
      return result('inspect', 'inspected', taskId, persistence, { status: 'unknown', reasons: [{ axis: 'observation', code: error.code || 'unavailable', message: error.message }] }, [], null, []);
    }
  }

  function observeTaskDevelopment(targetRoot, taskId, input) {
    assertFields(input, new Set(['changeDispositions', 'planningTargetIdentity']), 'Task Development observe');
    const inspected = task(targetRoot, taskId, { active: true });
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, input.changeDispositions);
    const target = contentTarget(execution);
    const review = runtime.inspectTaskReview(targetRoot, taskId, input.planningTargetIdentity ? { planningTargetIdentity: input.planningTargetIdentity } : {});
    const planning = reviewGate(review.slots.planning);
    const current = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: true });
    let receipt = current?.receipt || initialReceipt(taskId, execution, context, target, planning);
    if (current) {
      const observedDeclarations = declarations(targetRoot, taskId, execution.environmentRoot);
      const policy = currentPolicy(receipt.verificationPolicy, observedDeclarations) ? receipt.verificationPolicy : null;
      const upstreamChanged = context.identity !== receipt.taskContext.identity || target.identity !== receipt.contentTarget.identity || policy?.identity !== receipt.verificationPolicy?.identity || !same(planning, receipt.gates.planning);
      receipt = normalizeTaskDevelopmentReceipt({
        ...receipt,
        taskContext: context,
        contentTarget: target,
        verificationPolicy: policy,
        candidate: upstreamChanged ? null : receipt.candidate,
        gates: { planning, verification: upstreamChanged ? null : receipt.gates.verification, completion: upstreamChanged ? null : receipt.gates.completion },
        decision: upstreamChanged ? null : receipt.decision,
        updatedAt: now(),
      }, { expectedTaskId: taskId });
    }
    const written = writeDevelopment(targetRoot, current?.receipt || null, receipt);
    const observed = observeCurrent(targetRoot, taskId, written.receipt, { planningTargetIdentity: input.planningTargetIdentity });
    return result('observe', current ? 'updated' : 'created', taskId, written, applicabilityFromObserved(written.receipt, observed), [effect(written.root, written)]);
  }

  function recordTaskDevelopmentPolicy(targetRoot, taskId, input) {
    const inspected = task(targetRoot, taskId, { active: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const execution = environment(targetRoot, taskId);
    const context = taskContext(inspected, persistence.receipt.taskContext.changes);
    const target = contentTarget(execution);
    const observedDeclarations = declarations(targetRoot, taskId, execution.environmentRoot);
    const policy = buildPolicy(inspected, observedDeclarations, input);
    const planningTarget = persistence.receipt.gates.planning?.targetIdentity;
    const review = runtime.inspectTaskReview(targetRoot, taskId, planningTarget ? { planningTargetIdentity: planningTarget } : {});
    const planning = reviewGate(review.slots.planning);
    const inputsChanged = context.identity !== persistence.receipt.taskContext.identity || target.identity !== persistence.receipt.contentTarget.identity || policy.identity !== persistence.receipt.verificationPolicy?.identity || !same(planning, persistence.receipt.gates.planning);
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, taskContext: context, contentTarget: target, verificationPolicy: policy, candidate: inputsChanged ? null : persistence.receipt.candidate, gates: { planning, verification: inputsChanged ? null : persistence.receipt.gates.verification, completion: inputsChanged ? null : persistence.receipt.gates.completion }, decision: inputsChanged ? null : persistence.receipt.decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, persistence.receipt, receipt);
    const observed = observeCurrent(targetRoot, taskId, written.receipt);
    return result('policy', 'recorded', taskId, written, applicabilityFromObserved(written.receipt, observed), [effect(written.root, written)]);
  }

  function invalidateForObserved(receipt, observed) {
    const policy = observed.policyIsCurrent ? receipt.verificationPolicy : null;
    return normalizeTaskDevelopmentReceipt({ ...receipt, taskContext: observed.context, contentTarget: observed.target, verificationPolicy: policy, candidate: null, gates: { planning: observed.gates.planning, verification: policy && observed.coverage.complete ? observed.gates.verification : null, completion: null }, decision: null, updatedAt: now() }, { expectedTaskId: receipt.taskId });
  }

  function freezeTaskDevelopmentCandidate(targetRoot, taskId, input = {}) {
    assertFields(input, new Set(['planningTargetIdentity']), 'Task Development freeze');
    task(targetRoot, taskId, { active: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt, input);
    const pendingChanges = observed.context.changes.filter((item) => item.disposition === 'pending');
    const ready = observed.policyIsCurrent && observed.gates.planning?.outcome === 'ready' && Boolean(observed.gates.verification) && observed.coverage.complete && pendingChanges.length === 0;
    if (!ready) {
      const invalidated = writeDevelopment(targetRoot, persistence.receipt, invalidateForObserved(persistence.receipt, observed));
      throw taskDevelopmentError('task_development_candidate_not_ready', 'Candidate freeze前置gate未满足。', 409, { reasons: observed.reasons, pendingChanges: pendingChanges.map((item) => `${item.project}/${item.change}`), receiptDigest: invalidated.receiptDigest }, '完成Change convergence、Planning Review与stable Content Target formal Verification后重试。');
    }
    const canReuse = observed.candidateCurrent;
    const generation = canReuse ? persistence.receipt.generation : persistence.receipt.generation + 1;
    const candidate = canReuse ? persistence.receipt.candidate : createTaskCandidate({ generation, contentTargetIdentity: observed.target.identity, taskContextIdentity: observed.context.identity, policyIdentity: persistence.receipt.verificationPolicy.identity });
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, taskContext: observed.context, contentTarget: observed.target, generation, candidate, gates: { planning: observed.gates.planning, verification: observed.gates.verification, completion: canReuse ? observed.gates.completion : null }, decision: canReuse ? persistence.receipt.decision : null, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, persistence.receipt, receipt);
    const refreshed = observeCurrent(targetRoot, taskId, written.receipt, input);
    return result('freeze', canReuse ? 'unchanged' : 'frozen', taskId, written, applicabilityFromObserved(written.receipt, refreshed), [effect(written.root, written)]);
  }

  function decideTaskDevelopment(targetRoot, taskId, input) {
    assertFields(input, new Set(['outcome', 'summary', 'risks']), 'Task Development decide');
    task(targetRoot, taskId, { active: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    const base = observed.candidateCurrent ? { ...persistence.receipt, gates: observed.gates } : invalidateForObserved(persistence.receipt, observed);
    if (input.outcome === 'proceed' && (!observed.candidateCurrent || !observed.completionCurrent)) throw taskDevelopmentError('task_development_proceed_not_ready', 'proceed需要current Candidate与current Completion Review。', 409, { reasons: observed.reasons });
    const decision = { outcome: input.outcome, candidateIdentity: observed.candidateCurrent ? persistence.receipt.candidate.identity : null, summary: input.summary, risks: input.risks };
    if (input.outcome === 'proceed') createTaskFinishHandoff({ candidate: persistence.receipt.candidate, changes: observed.context.changes, gates: observed.gates, decision, createdAt: now() });
    const receipt = normalizeTaskDevelopmentReceipt({ ...base, decision, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, persistence.receipt, receipt);
    const refreshed = observeCurrent(targetRoot, taskId, written.receipt);
    return result('decide', 'recorded', taskId, written, applicabilityFromObserved(written.receipt, refreshed), [effect(written.root, written)]);
  }

  function createTaskDevelopmentHandoff(targetRoot, taskId, input = {}) {
    assertFields(input, new Set(), 'Task Development handoff');
    task(targetRoot, taskId, { active: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    if (!observed.candidateCurrent || !observed.completionCurrent || persistence.receipt.decision?.outcome !== 'proceed') throw taskDevelopmentError('task_development_handoff_not_ready', 'Finish handoff需要current Candidate、Planning/Verification/Completion gates与proceed decision。', 409, { reasons: observed.reasons });
    const handoff = createTaskFinishHandoff({ candidate: persistence.receipt.candidate, changes: observed.context.changes, gates: observed.gates, decision: persistence.receipt.decision, createdAt: now() });
    const handoffs = persistence.receipt.handoffs.some((item) => item.identity === handoff.identity) ? persistence.receipt.handoffs : [...persistence.receipt.handoffs, handoff];
    const receipt = normalizeTaskDevelopmentReceipt({ ...persistence.receipt, gates: observed.gates, handoffs, updatedAt: now() }, { expectedTaskId: taskId });
    const written = writeDevelopment(targetRoot, persistence.receipt, receipt);
    const refreshed = observeCurrent(targetRoot, taskId, written.receipt);
    return result('handoff', 'ready', taskId, written, applicabilityFromObserved(written.receipt, refreshed), [effect(written.root, written)]);
  }

  function assertTaskDevelopmentCarrier(targetRoot, taskId, input = {}) {
    assertFields(input, new Set(), 'Task Development carrier');
    task(targetRoot, taskId, { active: true });
    const persistence = runtime.readTaskDevelopmentPersistence(targetRoot, taskId, { optional: false });
    const observed = observeCurrent(targetRoot, taskId, persistence.receipt);
    if (observed.handoffCurrent) return result('carrier', 'equivalent', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed));
    return result('carrier', 'stale', taskId, persistence, applicabilityFromObserved(persistence.receipt, observed), [], { code: 'task_development_carrier_not_equivalent', message: 'Delivery carrier与current handoff Candidate不等价。', details: observed.reasons }, ['返回task-development重新建立stable target、Verification、Candidate、Completion Review与handoff。']);
  }

  Object.assign(runtime, { inspectTaskDevelopment, observeTaskDevelopment, recordTaskDevelopmentPolicy, freezeTaskDevelopmentCandidate, decideTaskDevelopment, createTaskDevelopmentHandoff, assertTaskDevelopmentCarrier });
  return runtime;
}
