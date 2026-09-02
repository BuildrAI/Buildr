// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
import crypto from 'node:crypto';

export const LEGACY_PARENT_PLAN_SCHEMA = 'buildr.parent-plan/v1';
export const PARENT_PLAN_SCHEMA = 'buildr.parent-plan/v2';
export const CONTRIBUTION_HANDOFF_SCHEMA = 'buildr.contribution-handoff/v1';

const ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const MAX_ITEMS = 128;
const MAX_TEXT = 4000;

export function parentCoordinationError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  Object.assign(error, { code, status, details, nextAction, parentCoordinationBusiness: true });
  return error;
}

export function parentCoordinationDigest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw parentCoordinationError('parent_coordination_field_invalid', `${field} 必须是对象。`, 400, { field });
  return value;
}

function closed(value, allowed, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw parentCoordinationError('parent_coordination_field_forbidden', `${field}.${key} 不受支持。`, 400, { field: `${field}.${key}` });
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_TEXT) throw parentCoordinationError('parent_coordination_field_invalid', `${field} 必须是1..${MAX_TEXT}字符的非空字符串。`, 400, { field });
  return value.trim();
}

function id(value, field) {
  const normalized = text(value, field);
  if (!ID.test(normalized)) throw parentCoordinationError('parent_coordination_identity_invalid', `${field} 必须是小写稳定identity。`, 400, { field, value });
  return normalized;
}

function list(value, field, normalize, key = (item) => item) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw parentCoordinationError('parent_coordination_field_invalid', `${field} 必须是最多${MAX_ITEMS}项的数组。`, 400, { field });
  const normalized = value.map((item, index) => normalize(item, `${field}[${index}]`));
  const keys = normalized.map(key);
  if (new Set(keys).size !== keys.length) throw parentCoordinationError('parent_coordination_value_duplicate', `${field} 不能包含重复项。`, 409, { field });
  return normalized.sort((left, right) => String(key(left)).localeCompare(String(key(right))));
}

function strings(value, field) { return list(value, field, text); }

function legacyContribution(value, field) {
  const item = object(value, field);
  closed(item, new Set(['id', 'summary', 'plannedChildTaskId']), field);
  return { id: id(item.id, `${field}.id`), summary: text(item.summary, `${field}.summary`), plannedChildTaskId: item.plannedChildTaskId == null ? null : id(item.plannedChildTaskId, `${field}.plannedChildTaskId`) };
}

function dependency(value, field) {
  const item = object(value, field);
  closed(item, new Set(['contributionId', 'dependsOn']), field);
  return { contributionId: id(item.contributionId, `${field}.contributionId`), dependsOn: id(item.dependsOn, `${field}.dependsOn`) };
}

function assertAcyclic(contributions, dependencies) {
  const known = new Set(contributions.map((item) => item.id));
  for (const edge of dependencies) {
    if (!known.has(edge.contributionId) || !known.has(edge.dependsOn) || edge.contributionId === edge.dependsOn) throw parentCoordinationError('parent_plan_dependency_invalid', 'Parent Plan dependency必须引用两个不同的已声明Contribution。', 409, edge);
  }
  const graph = new Map(contributions.map((item) => [item.id, []]));
  for (const edge of dependencies) graph.get(edge.contributionId).push(edge.dependsOn);
  const visiting = new Set(); const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) throw parentCoordinationError('parent_plan_dependency_cycle', 'Parent Plan dependency graph不能包含循环。', 409, { contributionId: node });
    if (visited.has(node)) return;
    visiting.add(node); for (const next of graph.get(node)) visit(next); visiting.delete(node); visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
}

function contribution(value, field) {
  const item = object(value, field);
  closed(item, new Set(['id', 'priority', 'title', 'objective', 'directions', 'boundaries', 'expectedChild', 'dependencies']), field);
  return {
    id: id(item.id, `${field}.id`),
    priority: text(item.priority, `${field}.priority`),
    title: text(item.title, `${field}.title`),
    objective: text(item.objective, `${field}.objective`),
    directions: strings(item.directions, `${field}.directions`),
    boundaries: strings(item.boundaries, `${field}.boundaries`),
    expectedChild: item.expectedChild == null ? null : text(item.expectedChild, `${field}.expectedChild`),
    dependencies: referenceList(item.dependencies, `${field}.dependencies`),
  };
}

function dependencyEdges(contributions) {
  return contributions.flatMap((item) => item.dependencies.map((dependsOn) => ({ contributionId: item.id, dependsOn })));
}

function normalizeLegacyParentPlan(plan) {
  closed(plan, new Set(['schemaVersion', 'identity', 'outcome', 'architectureInvariants', 'contributions', 'dependencies', 'finalAcceptance']), 'parentPlan');
  const contributions = list(plan.contributions, 'parentPlan.contributions', legacyContribution, (item) => item.id);
  if (!contributions.length) throw parentCoordinationError('parent_plan_contributions_empty', 'Parent Plan至少需要一个Contribution。', 409);
  const dependencies = list(plan.dependencies, 'parentPlan.dependencies', dependency, (item) => `${item.contributionId}/${item.dependsOn}`);
  assertAcyclic(contributions, dependencies);
  const payload = { schemaVersion: LEGACY_PARENT_PLAN_SCHEMA, outcome: text(plan.outcome, 'parentPlan.outcome'), architectureInvariants: strings(plan.architectureInvariants, 'parentPlan.architectureInvariants'), contributions, dependencies, finalAcceptance: strings(plan.finalAcceptance, 'parentPlan.finalAcceptance') };
  if (!payload.architectureInvariants.length || !payload.finalAcceptance.length) throw parentCoordinationError('parent_plan_sections_empty', 'Parent Plan architectureInvariants与finalAcceptance不能为空。', 409);
  const identity = parentCoordinationDigest(payload);
  if (plan.identity !== identity) throw parentCoordinationError('parent_plan_identity_mismatch', 'Parent Plan identity与内容不一致。', 409, { expected: identity, actual: plan.identity });
  return { identity, ...payload };
}

function normalizeCurrentParentPlan(plan) {
  closed(plan, new Set(['schemaVersion', 'identity', 'outcome', 'architectureDecisions', 'contributions', 'finalAcceptance']), 'parentPlan');
  const contributions = list(plan.contributions, 'parentPlan.contributions', contribution, (item) => item.id)
    .sort((left, right) => `${left.priority}/${left.id}`.localeCompare(`${right.priority}/${right.id}`));
  if (!contributions.length) throw parentCoordinationError('parent_plan_contributions_empty', 'Parent Plan至少需要一个Contribution。', 409);
  assertAcyclic(contributions, dependencyEdges(contributions));
  const payload = { schemaVersion: PARENT_PLAN_SCHEMA, outcome: text(plan.outcome, 'parentPlan.outcome'), architectureDecisions: strings(plan.architectureDecisions, 'parentPlan.architectureDecisions'), contributions, finalAcceptance: strings(plan.finalAcceptance, 'parentPlan.finalAcceptance') };
  if (!payload.architectureDecisions.length || !payload.finalAcceptance.length) throw parentCoordinationError('parent_plan_sections_empty', 'Parent Plan architectureDecisions与finalAcceptance不能为空。', 409);
  const identity = parentCoordinationDigest(payload);
  if (plan.identity !== identity) throw parentCoordinationError('parent_plan_identity_mismatch', 'Parent Plan identity与内容不一致。', 409, { expected: identity, actual: plan.identity });
  return { identity, ...payload };
}

export function normalizeParentPlan(value) {
  const plan = object(value, 'parentPlan');
  if (plan.schemaVersion === LEGACY_PARENT_PLAN_SCHEMA) return normalizeLegacyParentPlan(plan);
  if (plan.schemaVersion === PARENT_PLAN_SCHEMA) return normalizeCurrentParentPlan(plan);
  throw parentCoordinationError('parent_plan_schema_unsupported', `parentPlan.schemaVersion 必须是 ${LEGACY_PARENT_PLAN_SCHEMA} 或 ${PARENT_PLAN_SCHEMA}。`, 409);
}

export function projectParentPlan(value) {
  const plan = normalizeParentPlan(value);
  if (plan.schemaVersion === PARENT_PLAN_SCHEMA) return {
    sourceSchemaVersion: plan.schemaVersion,
    identity: plan.identity,
    outcome: plan.outcome,
    architectureDecisions: plan.architectureDecisions,
    contributions: plan.contributions,
    finalAcceptance: plan.finalAcceptance,
  };
  const dependencies = new Map(plan.contributions.map((item) => [item.id, []]));
  for (const edge of plan.dependencies) dependencies.get(edge.contributionId).push(edge.dependsOn);
  return {
    sourceSchemaVersion: plan.schemaVersion,
    identity: plan.identity,
    outcome: plan.outcome,
    architectureDecisions: plan.architectureInvariants,
    contributions: plan.contributions.map((item) => ({
      id: item.id,
      priority: 'legacy',
      title: item.summary,
      objective: item.summary,
      directions: [],
      boundaries: [],
      expectedChild: item.plannedChildTaskId,
      dependencies: dependencies.get(item.id).sort(),
    })),
    finalAcceptance: plan.finalAcceptance,
  };
}

export function normalizePlannedContributionBindings(value) {
  return list(value ?? [], 'plannedContributions', (item, field) => {
    const binding = object(item, field); closed(binding, new Set(['parentTaskId', 'contributionId']), field);
    return { parentTaskId: id(binding.parentTaskId, `${field}.parentTaskId`), contributionId: id(binding.contributionId, `${field}.contributionId`) };
  }, (item) => `${item.parentTaskId}/${item.contributionId}`);
}

function referenceList(value, field) { return list(value ?? [], field, id); }
function summaryList(value, field) {
  return list(value ?? [], field, (item, itemField) => { const entry = object(item, itemField); closed(entry, new Set(['contributionId', 'summary']), itemField); return { contributionId: id(entry.contributionId, `${itemField}.contributionId`), summary: text(entry.summary, `${itemField}.summary`) }; }, (item) => item.contributionId);
}
function supersededList(value, field) {
  return list(value ?? [], field, (item, itemField) => { const entry = object(item, itemField); closed(entry, new Set(['contributionId', 'deliveredByContributionId', 'reason']), itemField); return { contributionId: id(entry.contributionId, `${itemField}.contributionId`), deliveredByContributionId: id(entry.deliveredByContributionId, `${itemField}.deliveredByContributionId`), reason: text(entry.reason, `${itemField}.reason`) }; }, (item) => item.contributionId);
}

export function normalizeContributionHandoff(value) {
  const handoff = object(value, 'contributionHandoff');
  closed(handoff, new Set(['schemaVersion', 'identity', 'parentTaskId', 'planned', 'delivered', 'extra', 'residual', 'superseded', 'affected', 'nextAction']), 'contributionHandoff');
  if (handoff.schemaVersion !== CONTRIBUTION_HANDOFF_SCHEMA) throw parentCoordinationError('contribution_handoff_schema_unsupported', `contributionHandoff.schemaVersion 必须是 ${CONTRIBUTION_HANDOFF_SCHEMA}。`, 409);
  const payload = { schemaVersion: CONTRIBUTION_HANDOFF_SCHEMA, parentTaskId: id(handoff.parentTaskId, 'contributionHandoff.parentTaskId'), planned: referenceList(handoff.planned, 'contributionHandoff.planned'), delivered: referenceList(handoff.delivered, 'contributionHandoff.delivered'), extra: summaryList(handoff.extra, 'contributionHandoff.extra'), residual: summaryList(handoff.residual, 'contributionHandoff.residual'), superseded: supersededList(handoff.superseded, 'contributionHandoff.superseded'), affected: summaryList(handoff.affected, 'contributionHandoff.affected'), nextAction: text(handoff.nextAction, 'contributionHandoff.nextAction') };
  const planned = new Set(payload.planned);
  for (const delivered of payload.delivered) if (!planned.has(delivered)) throw parentCoordinationError('contribution_handoff_delivered_not_planned', 'delivered必须属于planned；跨计划交付使用extra。', 409, { contributionId: delivered });
  const identity = parentCoordinationDigest(payload);
  if (handoff.identity !== identity) throw parentCoordinationError('contribution_handoff_identity_mismatch', 'Contribution Handoff identity与内容不一致。', 409, { expected: identity, actual: handoff.identity });
  return { identity, ...payload };
}
