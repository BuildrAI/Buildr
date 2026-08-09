import crypto from 'node:crypto';

import { createContributionHandoff, normalizeContributionHandoff, normalizeParentPlan, normalizePlannedContributionBindings } from '../parent-coordination/parent-coordination.mjs';

export const TASK_DEVELOPMENT_RECEIPT_SCHEMA = 'buildr.task-development-receipt/v3';
export const LEGACY_TASK_DEVELOPMENT_RECEIPT_SCHEMAS = Object.freeze(['buildr.task-development-receipt/v1', 'buildr.task-development-receipt/v2']);
export const TASK_DEVELOPMENT_DECISIONS = Object.freeze(['proceed', 'blocked']);
export const TASK_DEVELOPMENT_CHANGE_DISPOSITIONS = Object.freeze(['pending', 'converged', 'not-applicable']);
export const TASK_DEVELOPMENT_PLANNING_DISPOSITIONS = Object.freeze(['pending', 'current', 'stale', 'not-applicable', 'waived']);

const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/;
const DIGEST = /^sha256-[a-f0-9]{64}$/;
const SCOPE_KINDS = new Set(['workspace', 'project', 'service']);

export function taskDevelopmentError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.taskDevelopmentBusiness = true;
  return error;
}

export function taskDevelopmentDigest(value) {
  const content = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskDevelopmentError('task_development_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      const name = field ? `${field}.${key}` : key;
      throw taskDevelopmentError('task_development_field_forbidden', `Development Receipt 不支持字段：${name}。`, 400, { field: name });
    }
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskDevelopmentError('task_development_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

function portableText(value, field) {
  const normalized = text(value, field);
  if (ABSOLUTE_PATH.test(normalized)) {
    throw taskDevelopmentError('task_development_reference_not_portable', `${field} 不能使用本机绝对路径。`, 400, { field });
  }
  return normalized;
}

function relativePath(value, field) {
  const normalized = portableText(value, field).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.endsWith('/..')) {
    throw taskDevelopmentError('task_development_reference_not_portable', `${field} 必须是可移植相对路径。`, 400, { field });
  }
  return normalized;
}

function digestIdentity(value, field) {
  const normalized = text(value, field);
  if (!DIGEST.test(normalized)) throw taskDevelopmentError('task_development_identity_invalid', `${field} 必须是 sha256 identity。`, 400, { field, value });
  return normalized;
}

function timestamp(value, field) {
  const normalized = text(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw taskDevelopmentError('task_development_timestamp_invalid', `${field} 必须是 ISO 时间。`, 400, { field });
  return new Date(normalized).toISOString();
}

function uniqueStrings(value, field) {
  if (!Array.isArray(value)) throw taskDevelopmentError('task_development_field_invalid', `${field} 必须是数组。`, 400, { field });
  const normalized = value.map((item, index) => portableText(item, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw taskDevelopmentError('task_development_value_duplicate', `${field} 不能包含重复项。`, 400, { field });
  return normalized.sort((left, right) => left.localeCompare(right));
}

function assertDerivedIdentity(actual, expected, field) {
  const identity = digestIdentity(actual, field);
  if (identity !== expected) {
    throw taskDevelopmentError('task_development_identity_mismatch', `${field} 与其内容不一致。`, 409, { field, expected, actual: identity });
  }
  return identity;
}

function normalizedScope(value) {
  const scope = object(value, 'taskContext.scope');
  closed(scope, new Set(['projects', 'services']), 'taskContext.scope');
  const projects = uniqueStrings(scope.projects, 'taskContext.scope.projects');
  if (!Array.isArray(scope.services)) throw taskDevelopmentError('task_development_field_invalid', 'taskContext.scope.services 必须是数组。', 400, { field: 'taskContext.scope.services' });
  const services = scope.services.map((item, index) => {
    const field = `taskContext.scope.services[${index}]`;
    const service = object(item, field);
    closed(service, new Set(['project', 'service']), field);
    return { project: portableText(service.project, `${field}.project`), service: portableText(service.service, `${field}.service`) };
  }).sort((left, right) => `${left.project}/${left.service}`.localeCompare(`${right.project}/${right.service}`));
  const keys = services.map((item) => `${item.project}/${item.service}`);
  if (new Set(keys).size !== keys.length) throw taskDevelopmentError('task_development_value_duplicate', 'taskContext.scope.services 不能包含重复项。', 400, { field: 'taskContext.scope.services' });
  return { projects, services };
}

function normalizeEnvironmentReference(value) {
  const reference = object(value, 'environment');
  closed(reference, new Set(['taskId', 'receiptSchema']), 'environment');
  return {
    taskId: portableText(reference.taskId, 'environment.taskId'),
    receiptSchema: portableText(reference.receiptSchema, 'environment.receiptSchema'),
  };
}

function optionalPortableText(value, field) {
  return value === null || value === undefined ? null : portableText(value, field);
}

function optionalDigestIdentity(value, field) {
  return value === null || value === undefined ? null : digestIdentity(value, field);
}

export function normalizeTaskDevelopmentPlanning(value) {
  const planning = object(value, 'planning');
  closed(planning, new Set(['identity', 'targetIdentity', 'nodes']), 'planning');
  if (!Array.isArray(planning.nodes)) throw taskDevelopmentError('task_development_field_invalid', 'planning.nodes 必须是数组。', 400, { field: 'planning.nodes' });
  const nodes = planning.nodes.map((item, index) => {
    const field = `planning.nodes[${index}]`;
    const node = object(item, field);
    closed(node, new Set(['id', 'kind', 'authority', 'reference', 'identity', 'disposition', 'summary', 'source']), field);
    if (!TASK_DEVELOPMENT_PLANNING_DISPOSITIONS.includes(node.disposition)) throw taskDevelopmentError('task_development_planning_disposition_invalid', `${field}.disposition 不受支持。`, 400, { field: `${field}.disposition`, value: node.disposition });
    const normalized = {
      id: portableText(node.id, `${field}.id`),
      kind: portableText(node.kind, `${field}.kind`),
      authority: portableText(node.authority, `${field}.authority`),
      reference: optionalPortableText(node.reference, `${field}.reference`),
      identity: optionalDigestIdentity(node.identity, `${field}.identity`),
      disposition: node.disposition,
      summary: portableText(node.summary, `${field}.summary`),
      source: optionalPortableText(node.source, `${field}.source`),
    };
    if (['current', 'stale'].includes(normalized.disposition) && (!normalized.reference || !normalized.identity)) throw taskDevelopmentError('task_development_planning_evidence_required', `${field} 的 current/stale disposition 必须包含 reference 与 identity。`, 409, { field });
    if (normalized.disposition === 'waived' && !normalized.source) throw taskDevelopmentError('task_development_planning_waiver_source_required', `${field} 的 waived disposition 必须包含明确授权 source。`, 409, { field });
    return normalized;
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(nodes.map((item) => item.id)).size !== nodes.length) throw taskDevelopmentError('task_development_value_duplicate', 'planning.nodes id 不能重复。', 400, { field: 'planning.nodes' });
  const targetIdentity = optionalPortableText(planning.targetIdentity, 'planning.targetIdentity');
  const identity = taskDevelopmentDigest({ targetIdentity, nodes });
  assertDerivedIdentity(planning.identity, identity, 'planning.identity');
  return { identity, targetIdentity, nodes };
}

export function createTaskDevelopmentPlanning({ targetIdentity = null, nodes = [] } = {}) {
  const payload = { targetIdentity, nodes };
  return normalizeTaskDevelopmentPlanning({ identity: taskDevelopmentDigest({ targetIdentity, nodes: [...nodes].sort((left, right) => left.id.localeCompare(right.id)) }), ...payload });
}

export function normalizeTaskDevelopmentContext(value) {
  const context = object(value, 'taskContext');
  closed(context, new Set(['identity', 'taskId', 'intent', 'scope', 'changes']), 'taskContext');
  if (!Array.isArray(context.changes)) throw taskDevelopmentError('task_development_field_invalid', 'taskContext.changes 必须是数组。', 400, { field: 'taskContext.changes' });
  const changes = context.changes.map((item, index) => {
    const field = `taskContext.changes[${index}]`;
    const change = object(item, field);
    closed(change, new Set(['project', 'change', 'disposition', 'summary']), field);
    if (!TASK_DEVELOPMENT_CHANGE_DISPOSITIONS.includes(change.disposition)) {
      throw taskDevelopmentError('task_development_change_disposition_invalid', `${field}.disposition 不受支持。`, 400, { field: `${field}.disposition`, value: change.disposition });
    }
    return {
      project: portableText(change.project, `${field}.project`),
      change: portableText(change.change, `${field}.change`),
      disposition: change.disposition,
      summary: portableText(change.summary, `${field}.summary`),
    };
  }).sort((left, right) => `${left.project}/${left.change}`.localeCompare(`${right.project}/${right.change}`));
  const keys = changes.map((item) => `${item.project}/${item.change}`);
  if (new Set(keys).size !== keys.length) throw taskDevelopmentError('task_development_value_duplicate', 'taskContext.changes 不能包含重复项。', 400, { field: 'taskContext.changes' });
  const payload = { taskId: portableText(context.taskId, 'taskContext.taskId'), intent: portableText(context.intent, 'taskContext.intent'), scope: normalizedScope(context.scope), changes };
  const identity = taskDevelopmentDigest(payload);
  assertDerivedIdentity(context.identity, identity, 'taskContext.identity');
  return { identity, ...payload };
}

function normalizeContentComponent(value, index) {
  const field = `contentTarget.components[${index}]`;
  const component = object(value, field);
  closed(component, new Set(['selector', 'kind', 'sourcePath', 'observer', 'identity']), field);
  if (!SCOPE_KINDS.has(component.kind)) throw taskDevelopmentError('task_development_scope_kind_invalid', `${field}.kind 不受支持。`, 400, { field: `${field}.kind`, value: component.kind });
  return {
    selector: portableText(component.selector, `${field}.selector`),
    kind: component.kind,
    sourcePath: relativePath(component.sourcePath, `${field}.sourcePath`),
    observer: portableText(component.observer, `${field}.observer`),
    identity: digestIdentity(component.identity, `${field}.identity`),
  };
}

export function normalizeTaskContentTarget(value) {
  const target = object(value, 'contentTarget');
  closed(target, new Set(['identity', 'components']), 'contentTarget');
  if (!Array.isArray(target.components) || target.components.length === 0) throw taskDevelopmentError('task_development_content_target_empty', 'contentTarget.components 必须是非空数组。', 400, { field: 'contentTarget.components' });
  const components = target.components.map(normalizeContentComponent).sort((left, right) => left.selector.localeCompare(right.selector));
  if (new Set(components.map((item) => item.selector)).size !== components.length) throw taskDevelopmentError('task_development_value_duplicate', 'contentTarget.components selector 不能重复。', 400, { field: 'contentTarget.components' });
  const identity = taskDevelopmentDigest({ components });
  assertDerivedIdentity(target.identity, identity, 'contentTarget.identity');
  return { identity, components };
}

function normalizePolicyDeclaration(value, index) {
  const field = `verificationPolicy.declarations[${index}]`;
  const declaration = object(value, field);
  closed(declaration, new Set(['project', 'path', 'identity']), field);
  const identity = text(declaration.identity, `${field}.identity`);
  if (identity !== 'absent' && !DIGEST.test(identity)) throw taskDevelopmentError('task_development_identity_invalid', `${field}.identity 必须是 absent 或 sha256 identity。`, 400, { field: `${field}.identity` });
  return { project: portableText(declaration.project, `${field}.project`), path: relativePath(declaration.path, `${field}.path`), identity };
}

export function normalizeTaskVerificationPolicy(value) {
  const policy = object(value, 'verificationPolicy');
  closed(policy, new Set(['identity', 'declarations', 'capabilities', 'coverageGaps', 'overrides']), 'verificationPolicy');
  if (!Array.isArray(policy.declarations) || policy.declarations.length === 0) throw taskDevelopmentError('task_development_policy_declarations_empty', 'verificationPolicy.declarations 必须是非空数组。', 400, { field: 'verificationPolicy.declarations' });
  const declarations = policy.declarations.map(normalizePolicyDeclaration).sort((left, right) => left.project.localeCompare(right.project));
  if (new Set(declarations.map((item) => item.project)).size !== declarations.length) throw taskDevelopmentError('task_development_value_duplicate', 'verificationPolicy.declarations Project 不能重复。', 400, { field: 'verificationPolicy.declarations' });
  if (!Array.isArray(policy.capabilities)) throw taskDevelopmentError('task_development_field_invalid', 'verificationPolicy.capabilities 必须是数组。', 400, { field: 'verificationPolicy.capabilities' });
  const capabilities = policy.capabilities.map((item, index) => {
    const field = `verificationPolicy.capabilities[${index}]`;
    const capability = object(item, field);
    closed(capability, new Set(['project', 'capability', 'required']), field);
    if (typeof capability.required !== 'boolean') throw taskDevelopmentError('task_development_field_invalid', `${field}.required 必须是 boolean。`, 400, { field: `${field}.required` });
    return { project: portableText(capability.project, `${field}.project`), capability: portableText(capability.capability, `${field}.capability`), required: capability.required };
  }).sort((left, right) => `${left.project}/${left.capability}`.localeCompare(`${right.project}/${right.capability}`));
  if (new Set(capabilities.map((item) => `${item.project}/${item.capability}`)).size !== capabilities.length) throw taskDevelopmentError('task_development_value_duplicate', 'verificationPolicy.capabilities 不能重复。', 400, { field: 'verificationPolicy.capabilities' });
  if (!Array.isArray(policy.coverageGaps)) throw taskDevelopmentError('task_development_field_invalid', 'verificationPolicy.coverageGaps 必须是数组。', 400, { field: 'verificationPolicy.coverageGaps' });
  const coverageGaps = policy.coverageGaps.map((item, index) => {
    const field = `verificationPolicy.coverageGaps[${index}]`;
    const gap = object(item, field);
    closed(gap, new Set(['scope', 'summary']), field);
    return { scope: portableText(gap.scope, `${field}.scope`), summary: portableText(gap.summary, `${field}.summary`) };
  }).sort((left, right) => `${left.scope}/${left.summary}`.localeCompare(`${right.scope}/${right.summary}`));
  if (!Array.isArray(policy.overrides)) throw taskDevelopmentError('task_development_field_invalid', 'verificationPolicy.overrides 必须是数组。', 400, { field: 'verificationPolicy.overrides' });
  const overrides = policy.overrides.map((item, index) => {
    const field = `verificationPolicy.overrides[${index}]`;
    const override = object(item, field);
    closed(override, new Set(['project', 'capability', 'required', 'scope', 'basis', 'source']), field);
    if (typeof override.required !== 'boolean') throw taskDevelopmentError('task_development_field_invalid', `${field}.required 必须是 boolean。`, 400, { field: `${field}.required` });
    return {
      project: portableText(override.project, `${field}.project`),
      capability: portableText(override.capability, `${field}.capability`),
      required: override.required,
      scope: portableText(override.scope, `${field}.scope`),
      basis: portableText(override.basis, `${field}.basis`),
      source: portableText(override.source, `${field}.source`),
    };
  }).sort((left, right) => `${left.project}/${left.capability}/${left.scope}`.localeCompare(`${right.project}/${right.capability}/${right.scope}`));
  if (new Set(overrides.map((item) => `${item.project}/${item.capability}/${item.scope}`)).size !== overrides.length) throw taskDevelopmentError('task_development_value_duplicate', 'verificationPolicy.overrides 不能重复。', 400, { field: 'verificationPolicy.overrides' });
  const payload = { declarations, capabilities, coverageGaps, overrides };
  const identity = taskDevelopmentDigest(payload);
  assertDerivedIdentity(policy.identity, identity, 'verificationPolicy.identity');
  return { identity, ...payload };
}

function normalizeGate(value, field, outcomes) {
  if (value === null) return null;
  const gate = object(value, field);
  const disposition = gate.disposition || 'current';
  if (!['current', 'not-applicable', 'waived'].includes(disposition)) throw taskDevelopmentError('task_development_gate_disposition_invalid', `${field}.disposition 不受支持。`, 400, { field: `${field}.disposition`, value: disposition });
  if (disposition !== 'current') {
    closed(gate, new Set(['disposition', 'targetIdentity', 'summary', 'source']), field);
    const targetIdentity = optionalPortableText(gate.targetIdentity, `${field}.targetIdentity`);
    const summary = portableText(gate.summary, `${field}.summary`);
    const source = optionalPortableText(gate.source, `${field}.source`);
    if (disposition === 'waived' && (!targetIdentity || !source)) throw taskDevelopmentError('task_development_gate_waiver_source_required', `${field} waived 必须绑定target identity与明确授权source。`, 409, { field });
    return { disposition, targetIdentity, summary, source };
  }
  closed(gate, new Set(['disposition', 'resultDigest', 'targetIdentity', 'outcome', 'applicability']), field);
  if (!outcomes.includes(gate.outcome)) throw taskDevelopmentError('task_development_gate_outcome_invalid', `${field}.outcome 不受支持。`, 400, { field: `${field}.outcome`, value: gate.outcome });
  if (gate.applicability !== 'current') throw taskDevelopmentError('task_development_gate_applicability_invalid', `${field}.applicability 只能保存 current snapshot。`, 400, { field: `${field}.applicability`, value: gate.applicability });
  return { resultDigest: digestIdentity(gate.resultDigest, `${field}.resultDigest`), targetIdentity: portableText(gate.targetIdentity, `${field}.targetIdentity`), outcome: gate.outcome, applicability: 'current' };
}

function normalizeGates(value) {
  const gates = object(value, 'gates');
  closed(gates, new Set(['planning', 'verification', 'completion']), 'gates');
  return {
    planning: normalizeGate(gates.planning, 'gates.planning', ['ready', 'changes-required']),
    verification: normalizeGate(gates.verification, 'gates.verification', ['passed', 'not-passed']),
    completion: normalizeGate(gates.completion, 'gates.completion', ['ready', 'changes-required']),
  };
}

export function createTaskCandidate({ generation, contentTargetIdentity, taskContextIdentity, policyIdentity }) {
  if (!Number.isInteger(generation) || generation < 1) throw taskDevelopmentError('task_development_generation_invalid', 'Candidate generation 必须是正整数。', 400, { field: 'generation' });
  const payload = {
    generation,
    contentTargetIdentity: digestIdentity(contentTargetIdentity, 'candidate.contentTargetIdentity'),
    taskContextIdentity: digestIdentity(taskContextIdentity, 'candidate.taskContextIdentity'),
    policyIdentity: digestIdentity(policyIdentity, 'candidate.policyIdentity'),
  };
  return { identity: taskDevelopmentDigest(payload), ...payload };
}

export function normalizeTaskCandidate(value) {
  const candidate = object(value, 'candidate');
  closed(candidate, new Set(['identity', 'generation', 'contentTargetIdentity', 'taskContextIdentity', 'policyIdentity']), 'candidate');
  const normalized = createTaskCandidate(candidate);
  assertDerivedIdentity(candidate.identity, normalized.identity, 'candidate.identity');
  return normalized;
}

function normalizeRisk(value, index) {
  const field = `decision.risks[${index}]`;
  const risk = object(value, field);
  closed(risk, new Set(['gate', 'resultDigest', 'scope', 'summary', 'source']), field);
  if (!['verification', 'completion'].includes(risk.gate)) throw taskDevelopmentError('task_development_risk_gate_invalid', `${field}.gate 必须是 verification 或 completion。`, 400, { field: `${field}.gate` });
  return {
    gate: risk.gate,
    resultDigest: digestIdentity(risk.resultDigest, `${field}.resultDigest`),
    scope: portableText(risk.scope, `${field}.scope`),
    summary: portableText(risk.summary, `${field}.summary`),
    source: portableText(risk.source, `${field}.source`),
  };
}

function normalizeDecision(value) {
  if (value === null) return null;
  const decision = object(value, 'decision');
  closed(decision, new Set(['outcome', 'candidateIdentity', 'summary', 'risks']), 'decision');
  if (!TASK_DEVELOPMENT_DECISIONS.includes(decision.outcome)) throw taskDevelopmentError('task_development_decision_invalid', 'decision.outcome 必须是 proceed 或 blocked。', 400, { field: 'decision.outcome', value: decision.outcome });
  if (!Array.isArray(decision.risks)) throw taskDevelopmentError('task_development_field_invalid', 'decision.risks 必须是数组。', 400, { field: 'decision.risks' });
  const candidateIdentity = decision.candidateIdentity === null ? null : digestIdentity(decision.candidateIdentity, 'decision.candidateIdentity');
  if (decision.outcome === 'proceed' && !candidateIdentity) throw taskDevelopmentError('task_development_decision_candidate_required', 'proceed decision 必须绑定 current Candidate。', 409);
  return { outcome: decision.outcome, candidateIdentity, summary: portableText(decision.summary, 'decision.summary'), risks: decision.risks.map(normalizeRisk) };
}

export function createTaskFinishHandoff({ candidate, changes, gates, decision, contributionHandoff = null, createdAt }) {
  const normalizedCandidate = normalizeTaskCandidate(candidate);
  if (!Array.isArray(changes)) throw taskDevelopmentError('task_development_handoff_changes_invalid', 'handoff.changes 必须是数组。', 400);
  const canonicalChanges = changes.map((item, index) => {
    const field = `handoff.changes[${index}]`;
    const change = object(item, field);
    closed(change, new Set(['project', 'change', 'disposition', 'summary']), field);
    if (!TASK_DEVELOPMENT_CHANGE_DISPOSITIONS.includes(change.disposition)) throw taskDevelopmentError('task_development_change_disposition_invalid', `${field}.disposition 不受支持。`, 400, { field: `${field}.disposition` });
    return {
      project: portableText(change.project, `${field}.project`),
      change: portableText(change.change, `${field}.change`),
      disposition: change.disposition,
      summary: portableText(change.summary, `${field}.summary`),
    };
  }).sort((left, right) => `${left.project}/${left.change}`.localeCompare(`${right.project}/${right.change}`));
  const normalizedChanges = normalizeTaskDevelopmentContext({
    identity: taskDevelopmentDigest({ taskId: 'handoff', intent: 'handoff', scope: { projects: [], services: [] }, changes: canonicalChanges }),
    taskId: 'handoff', intent: 'handoff', scope: { projects: [], services: [] }, changes: canonicalChanges,
  }).changes;
  const normalizedGates = normalizeGates(gates);
  const normalizedDecision = normalizeDecision(decision);
  const resolved = (gate, positive) => Boolean(gate) && (gate.disposition === 'waived' || gate.disposition === 'not-applicable' || positive.includes(gate.outcome));
  if (!resolved(normalizedGates.planning, ['ready']) || !resolved(normalizedGates.verification, ['passed', 'not-passed']) || !resolved(normalizedGates.completion, ['ready', 'changes-required'])) {
    throw taskDevelopmentError('task_development_handoff_gates_incomplete', 'Finish handoff 需要 current专业Result或合法not-applicable/waived gate。', 409);
  }
  if (normalizedDecision?.outcome !== 'proceed' || normalizedDecision.candidateIdentity !== normalizedCandidate.identity) throw taskDevelopmentError('task_development_handoff_decision_blocked', 'Finish handoff 需要绑定 current Candidate 的 proceed decision。', 409);
  for (const risk of normalizedDecision.risks) {
    const gate = normalizedGates[risk.gate];
    if (!gate || gate.disposition || risk.resultDigest !== gate.resultDigest) throw taskDevelopmentError('task_development_risk_result_mismatch', `风险接受必须绑定current ${risk.gate} Result digest。`, 409, { gate: risk.gate, expected: gate?.resultDigest || null, actual: risk.resultDigest });
  }
  const adverse = [
    ...(normalizedGates.verification.disposition || normalizedGates.verification.outcome === 'passed' ? [] : [{ gate: 'verification', digest: normalizedGates.verification.resultDigest }]),
    ...(normalizedGates.completion.disposition || normalizedGates.completion.outcome === 'ready' ? [] : [{ gate: 'completion', digest: normalizedGates.completion.resultDigest }]),
  ];
  for (const item of adverse) {
    if (!normalizedDecision.risks.some((risk) => risk.gate === item.gate && risk.resultDigest === item.digest)) throw taskDevelopmentError('task_development_risk_acceptance_required', `proceed 必须显式接受 ${item.gate} gate 风险。`, 409, item);
  }
  const normalizedContributionHandoff = contributionHandoff === null ? null : (contributionHandoff.identity ? normalizeContributionHandoff(contributionHandoff) : createContributionHandoff(contributionHandoff));
  const payload = { candidate: normalizedCandidate, changes: normalizedChanges, gates: normalizedGates, decision: normalizedDecision, ...(normalizedContributionHandoff ? { contributionHandoff: normalizedContributionHandoff } : {}) };
  return { identity: taskDevelopmentDigest(payload), ...payload, createdAt: timestamp(createdAt, 'handoff.createdAt') };
}

function normalizeHandoff(value, index) {
  const field = `handoffs[${index}]`;
  const handoff = object(value, 'handoff');
  closed(handoff, new Set(['identity', 'candidate', 'changes', 'gates', 'decision', 'contributionHandoff', 'createdAt']), field);
  const normalized = createTaskFinishHandoff(handoff);
  assertDerivedIdentity(handoff.identity, normalized.identity, `${field}.identity`);
  return normalized;
}

export function normalizeTaskDevelopmentReceipt(value, { expectedTaskId = null } = {}) {
  let receipt = object(value, 'Development Receipt');
  const legacy = LEGACY_TASK_DEVELOPMENT_RECEIPT_SCHEMAS.includes(receipt.schemaVersion);
  closed(receipt, new Set(['schemaVersion', 'taskId', 'environment', 'taskContext', 'planning', 'parentPlan', 'plannedContributions', 'parentAcceptance', 'contentTarget', 'verificationPolicy', 'generation', 'candidate', 'gates', 'decision', 'handoffs', 'createdAt', 'updatedAt']), '');
  if (!legacy && receipt.schemaVersion !== TASK_DEVELOPMENT_RECEIPT_SCHEMA) throw taskDevelopmentError('task_development_schema_unsupported', `Development Receipt schemaVersion 必须是 ${TASK_DEVELOPMENT_RECEIPT_SCHEMA}。`, 409, { actual: receipt.schemaVersion });
  if (receipt.schemaVersion === 'buildr.task-development-receipt/v1') {
    const targetIdentity = receipt.gates?.planning?.targetIdentity || null;
    receipt = { ...receipt, planning: createTaskDevelopmentPlanning({ targetIdentity, nodes: [] }) };
  }
  if (legacy) receipt = { ...receipt, schemaVersion: TASK_DEVELOPMENT_RECEIPT_SCHEMA, parentPlan: null, plannedContributions: [], parentAcceptance: null };
  const taskId = portableText(receipt.taskId, 'taskId');
  if (expectedTaskId && taskId !== expectedTaskId) throw taskDevelopmentError('task_development_task_identity_mismatch', `Development Receipt taskId 与目录不一致：${expectedTaskId} != ${taskId}。`, 409, { expectedTaskId, taskId });
  const environment = normalizeEnvironmentReference(receipt.environment);
  if (environment.taskId !== taskId) throw taskDevelopmentError('task_development_task_identity_mismatch', 'environment.taskId 与 Receipt taskId 不一致。', 409);
  if (!Number.isInteger(receipt.generation) || receipt.generation < 0) throw taskDevelopmentError('task_development_generation_invalid', 'generation 必须是非负整数。', 400, { field: 'generation' });
  const taskContext = normalizeTaskDevelopmentContext(receipt.taskContext);
  if (taskContext.taskId !== taskId) throw taskDevelopmentError('task_development_task_identity_mismatch', 'taskContext.taskId 与 Receipt taskId 不一致。', 409, { taskId, contextTaskId: taskContext.taskId });
  const planning = normalizeTaskDevelopmentPlanning(receipt.planning);
  const parentPlan = receipt.parentPlan == null ? null : normalizeParentPlan(receipt.parentPlan);
  const plannedContributions = normalizePlannedContributionBindings(receipt.plannedContributions ?? []);
  let parentAcceptance = receipt.parentAcceptance ?? null;
  if (parentAcceptance !== null) {
    const acceptance = object(parentAcceptance, 'parentAcceptance');
    closed(acceptance, new Set(['planIdentity', 'summary', 'acceptedAt']), 'parentAcceptance');
    parentAcceptance = { planIdentity: digestIdentity(acceptance.planIdentity, 'parentAcceptance.planIdentity'), summary: portableText(acceptance.summary, 'parentAcceptance.summary'), acceptedAt: timestamp(acceptance.acceptedAt, 'parentAcceptance.acceptedAt') };
    if (!parentPlan || parentAcceptance.planIdentity !== parentPlan.identity) throw taskDevelopmentError('task_development_parent_acceptance_stale', 'Parent final acceptance必须绑定current Parent Plan。', 409);
  }
  const contentTarget = receipt.contentTarget === null ? null : normalizeTaskContentTarget(receipt.contentTarget);
  const verificationPolicy = receipt.verificationPolicy === null ? null : normalizeTaskVerificationPolicy(receipt.verificationPolicy);
  const candidate = receipt.candidate === null ? null : normalizeTaskCandidate(receipt.candidate);
  const gates = normalizeGates(receipt.gates);
  const decision = normalizeDecision(receipt.decision);
  if (!Array.isArray(receipt.handoffs)) throw taskDevelopmentError('task_development_field_invalid', 'handoffs 必须是数组。', 400, { field: 'handoffs' });
  const handoffs = receipt.handoffs.map(normalizeHandoff);
  if (new Set(handoffs.map((item) => item.identity)).size !== handoffs.length) throw taskDevelopmentError('task_development_value_duplicate', 'handoffs identity 不能重复。', 400, { field: 'handoffs' });
  if (candidate && candidate.generation !== receipt.generation) throw taskDevelopmentError('task_development_generation_mismatch', 'current Candidate generation 必须等于 Receipt generation。', 409);
  if (candidate && (!contentTarget || candidate.contentTargetIdentity !== contentTarget.identity || candidate.taskContextIdentity !== taskContext.identity || candidate.policyIdentity !== verificationPolicy?.identity)) throw taskDevelopmentError('task_development_candidate_inputs_mismatch', 'current Candidate 与 Receipt current inputs 不一致。', 409);
  if (!contentTarget && (verificationPolicy || candidate || gates.verification || gates.completion || decision || handoffs.length)) throw taskDevelopmentError('task_development_content_target_required', 'Content Target形成前不能保存policy、Candidate、Verification/Completion gate、decision或handoff。', 409);
  if (!candidate && gates.completion) throw taskDevelopmentError('task_development_completion_without_candidate', '没有 current Candidate 时不能保存 Completion gate。', 409);
  if (decision?.candidateIdentity && decision.candidateIdentity !== candidate?.identity) throw taskDevelopmentError('task_development_decision_candidate_mismatch', 'decision 与 current Candidate 不一致。', 409);
  const createdAt = timestamp(receipt.createdAt, 'createdAt');
  const updatedAt = timestamp(receipt.updatedAt, 'updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw taskDevelopmentError('task_development_timestamp_invalid', 'updatedAt 不能早于 createdAt。', 400, { field: 'updatedAt' });
  return { schemaVersion: TASK_DEVELOPMENT_RECEIPT_SCHEMA, taskId, environment, taskContext, planning, parentPlan, plannedContributions, parentAcceptance, contentTarget, verificationPolicy, generation: receipt.generation, candidate, gates, decision, handoffs, createdAt, updatedAt };
}
