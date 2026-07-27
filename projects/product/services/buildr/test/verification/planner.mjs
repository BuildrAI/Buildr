import path from 'node:path';
import {
  VERIFICATION_CONCURRENCY,
  VERIFICATION_EXECUTORS,
  VERIFICATION_GROUPS,
  VERIFICATION_IGNORED_INPUTS,
  VERIFICATION_PROFILES,
  verificationSteps,
} from './registry.mjs';

export function normalizeProductPath(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) throw new Error(`Invalid Product path: ${value}`);
  const normalized = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error(`Product path escapes root: ${value}`);
  return normalized;
}

export function globToRegExp(pattern) {
  const normalized = normalizeProductPath(pattern);
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*' && normalized[index + 1] === '*') {
      index += 1;
      if (normalized[index + 1] === '/') {
        index += 1;
        source += '(?:.*/)?';
      } else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

export function matchesInput(productPath, pattern) {
  return globToRegExp(pattern).test(normalizeProductPath(productPath));
}

export function validateVerificationRegistry(steps = verificationSteps) {
  const findings = [];
  const ids = new Set();
  for (const item of steps) {
    if (!item.id || ids.has(item.id)) findings.push({ step: item.id || '<missing>', code: 'duplicate_or_missing_id' });
    ids.add(item.id);
    if (!item.name) findings.push({ step: item.id, code: 'missing_name' });
    if (!Array.isArray(item.inputs) || item.inputs.length === 0) findings.push({ step: item.id, code: 'missing_inputs' });
    if (!VERIFICATION_EXECUTORS.includes(item.executor?.type)) findings.push({ step: item.id, code: 'unknown_executor', value: item.executor?.type });
    if (!VERIFICATION_CONCURRENCY.classes[item.concurrencyClass]) findings.push({ step: item.id, code: 'unknown_concurrency_class', value: item.concurrencyClass });
    for (const resource of item.resources ?? []) {
      if (!VERIFICATION_CONCURRENCY.resources?.[resource]) findings.push({ step: item.id, code: 'unknown_concurrency_resource', value: resource });
    }
    if (item.schedulingCostMs != null && (!Number.isInteger(item.schedulingCostMs) || item.schedulingCostMs < 1)) {
      findings.push({ step: item.id, code: 'invalid_scheduling_cost', value: item.schedulingCostMs });
    }
    if (item.preflight) {
      if (!Array.isArray(item.preflight.inputs) || item.preflight.inputs.length === 0) findings.push({ step: item.id, code: 'preflight_inputs_missing' });
      if (!VERIFICATION_EXECUTORS.includes(item.preflight.executor?.type)) findings.push({ step: item.id, code: 'preflight_executor_unknown', value: item.preflight.executor?.type });
      if (item.preflight.sideEffects !== 'none') findings.push({ step: item.id, code: 'preflight_side_effects_unsafe', value: item.preflight.sideEffects });
      if (!Number.isInteger(item.preflight.budgetMs) || item.preflight.budgetMs < 1) findings.push({ step: item.id, code: 'preflight_budget_invalid', value: item.preflight.budgetMs });
    }
    for (const profile of item.profiles ?? []) if (!VERIFICATION_PROFILES.includes(profile)) findings.push({ step: item.id, code: 'unknown_profile', value: profile });
    for (const group of item.groups ?? []) if (!VERIFICATION_GROUPS.includes(group)) findings.push({ step: item.id, code: 'unknown_group', value: group });
  }
  for (const item of steps) for (const dependency of item.dependsOn ?? []) {
    if (!ids.has(dependency)) findings.push({ step: item.id, code: 'unknown_dependency', value: dependency });
  }
  const artifactProducers = steps.filter((item) => item.executor?.type === 'candidate-artifact');
  const artifactConsumers = steps.filter((item) => item.executor?.consumesArtifact === true);
  if (artifactConsumers.length > 0 && artifactProducers.length !== 1) {
    findings.push({ step: '<registry>', code: 'candidate_artifact_count', value: artifactProducers.length });
  } else if (artifactProducers.length === 1) {
    const producer = artifactProducers[0].id;
    for (const item of artifactConsumers) {
      if (!item.dependsOn.includes(producer)) findings.push({ step: item.id, code: 'missing_artifact_dependency', value: producer });
    }
  }
  const byId = new Map(steps.map((item) => [item.id, item]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id, trail = []) => {
    if (visiting.has(id)) {
      findings.push({ step: id, code: 'dependency_cycle', value: [...trail, id].join(' -> ') });
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const item of steps) visit(item.id);
  return { ok: findings.length === 0, findings };
}

export function createVerificationPreflightPlan(request = {}, steps = verificationSteps) {
  const validation = validateVerificationRegistry(steps);
  if (!validation.ok) throw new Error(`Invalid verification registry:\n${validation.findings.map((item) => `${item.step}: ${item.code}`).join('\n')}`);
  const paths = [...new Set((request.paths ?? []).map(normalizeProductPath))];
  const selected = [];
  for (const item of steps) {
    if (!item.preflight) continue;
    const matched = paths.filter((productPath) => item.preflight.inputs.some((pattern) => matchesInput(productPath, pattern)));
    if (matched.length) selected.push(Object.freeze({
      id: `preflight-${item.id}`, name: `${item.name} preflight`, executor: item.preflight.executor,
      dependsOn: [], profiles: [], groups: [], inputs: item.preflight.inputs, concurrencyClass: 'default', resources: [],
      budgetMs: item.preflight.budgetMs, reasons: Object.freeze(matched.map((entry) => `${entry} matches candidate-aware preflight`)),
      assures: item.id,
    }));
  }
  return Object.freeze({ paths: Object.freeze(paths), profiles: Object.freeze([]), groups: Object.freeze([]), stepIds: Object.freeze([]), steps: Object.freeze(selected) });
}

export function auditVerificationInputCoverage(paths, steps = verificationSteps) {
  const mapped = [];
  const ignored = [];
  const unmapped = [];
  for (const rawPath of paths) {
    const productPath = normalizeProductPath(rawPath);
    const owners = steps.filter((item) => item.inputs.some((pattern) => matchesInput(productPath, pattern))).map((item) => item.id);
    if (owners.length > 0) mapped.push({ path: productPath, owners });
    else if (VERIFICATION_IGNORED_INPUTS.some((pattern) => matchesInput(productPath, pattern))) ignored.push(productPath);
    else unmapped.push(productPath);
  }
  return Object.freeze({
    ok: unmapped.length === 0,
    mapped: Object.freeze(mapped),
    ignored: Object.freeze(ignored),
    unmapped: Object.freeze(unmapped),
  });
}

function expandDependencies(selected, byId, reasons) {
  const visit = (id, parent = null) => {
    if (selected.has(id)) return;
    selected.add(id);
    if (parent) reasons.set(id, [...(reasons.get(id) ?? []), `dependency of ${parent}`]);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency, id);
  };
  for (const id of [...selected]) for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency, id);
}

function topologicalOrder(selected, steps) {
  const order = [];
  const visited = new Set();
  const byId = new Map(steps.map((item) => [item.id, item]));
  const visit = (id) => {
    if (visited.has(id)) return;
    for (const dependency of byId.get(id).dependsOn ?? []) if (selected.has(dependency)) visit(dependency);
    visited.add(id);
    order.push(id);
  };
  for (const item of steps) if (selected.has(item.id)) visit(item.id);
  return order;
}

export function createVerificationPlan(request = {}, steps = verificationSteps) {
  const validation = validateVerificationRegistry(steps);
  if (!validation.ok) throw new Error(`Invalid verification registry:\n${validation.findings.map((item) => `${item.step}: ${item.code}${item.value ? ` (${item.value})` : ''}`).join('\n')}`);
  const byId = new Map(steps.map((item) => [item.id, item]));
  const selected = new Set();
  const reasons = new Map();
  const paths = [...new Set((request.paths ?? []).map(normalizeProductPath))];
  const profiles = [...new Set(request.profiles ?? [])];
  const groups = [...new Set(request.groups ?? [])];
  const stepIds = [...new Set(request.stepIds ?? [])];
  for (const id of stepIds) {
    if (!byId.has(id)) throw new Error(`Unknown verification step: ${id}`);
    selected.add(id);
    reasons.set(id, [...(reasons.get(id) ?? []), `step ${id}`]);
  }
  for (const profile of profiles) {
    if (!VERIFICATION_PROFILES.includes(profile)) throw new Error(`Unknown verification profile: ${profile}`);
    for (const item of steps) if (item.profiles.includes(profile)) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), `profile ${profile}`]);
    }
  }
  for (const group of groups) {
    if (!VERIFICATION_GROUPS.includes(group)) throw new Error(`Unknown verification group: ${group}`);
    for (const item of steps) if (item.groups.includes(group)) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), `group ${group}`]);
    }
  }
  const unmatchedPaths = [];
  for (const productPath of paths) {
    const matched = steps.filter((item) => item.inputs.some((pattern) => matchesInput(productPath, pattern)));
    if (matched.length === 0 && !VERIFICATION_IGNORED_INPUTS.some((pattern) => matchesInput(productPath, pattern))) unmatchedPaths.push(productPath);
    for (const item of matched) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), `${productPath} matches ${item.inputs.find((pattern) => matchesInput(productPath, pattern))}`]);
    }
  }
  if (unmatchedPaths.length > 0) throw new Error(`Unmapped Product paths:\n${unmatchedPaths.map((item) => `- ${item}`).join('\n')}`);
  expandDependencies(selected, byId, reasons);
  const orderedIds = topologicalOrder(selected, steps);
  return Object.freeze({
    paths: Object.freeze(paths),
    profiles: Object.freeze(profiles),
    groups: Object.freeze(groups),
    stepIds: Object.freeze(stepIds),
    steps: Object.freeze(orderedIds.map((id) => Object.freeze({ ...byId.get(id), reasons: Object.freeze(reasons.get(id) ?? []) }))),
  });
}
