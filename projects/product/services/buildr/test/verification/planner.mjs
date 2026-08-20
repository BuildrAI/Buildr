import path from 'node:path';
import {
  CANDIDATE_CI_HOST_NODE_TUPLES,
  CANDIDATE_CI_PLATFORM_REPEATS,
  CANDIDATE_CI_SHARDS,
  VERIFICATION_CONCURRENCY,
  VERIFICATION_DELEGATED_INPUTS,
  VERIFICATION_ENVIRONMENT_FOOTPRINTS,
  VERIFICATION_ENVIRONMENT_ISOLATIONS,
  VERIFICATION_DEVELOPMENT_RUNNERS,
  VERIFICATION_EXECUTION_BOUNDARIES,
  VERIFICATION_EXECUTORS,
  VERIFICATION_FULL_SCOPE_INPUTS,
  VERIFICATION_GOVERNED_REPOSITORY_INPUTS,
  VERIFICATION_GROUPS,
  VERIFICATION_IGNORED_INPUTS,
  VERIFICATION_PROFILES,
  VERIFICATION_PRODUCTION_OWNER_ALLOWLIST,
  VERIFICATION_RESET_BURDENS,
  VERIFICATION_TEST_INTENTS,
  verificationSteps,
} from './registry.mjs';

const PRODUCTION_OWNER_GOVERNED_INPUTS = Object.freeze([
  'src/application/**/*.mjs',
  'src/infrastructure/**/*.mjs',
  'src/*/application/**/*.mjs',
  'src/*/persistence/**/*.mjs',
]);
const PRODUCTION_OWNER_BROAD_STEPS = new Set([
  'unit',
  'candidate-tarball',
  'application-payload-release',
]);
const PRODUCTION_OWNER_BOUNDARIES = new Set(['Static', 'Integration', 'System']);

const CANDIDATE_CI_RUNNERS = Object.freeze(['macos', 'windows']);
const CANDIDATE_CI_PHASES = Object.freeze(['preflight', 'artifact', 'verification']);

export function validateCandidateCiCoverage(
  steps = verificationSteps,
  shards = CANDIDATE_CI_SHARDS,
  hostNodeTuples = CANDIDATE_CI_HOST_NODE_TUPLES,
  platformRepeats = CANDIDATE_CI_PLATFORM_REPEATS,
) {
  const findings = [];
  const byId = new Map(steps.map((item) => [item.id, item]));
  const candidateIds = new Set(steps.filter((item) => item.profiles.includes('candidate')).map((item) => item.id));
  const shardIds = new Set();
  const owners = new Map();
  let artifactProducers = 0;
  for (const shard of shards) {
    if (!shard.id || shardIds.has(shard.id)) findings.push({ step: shard.id || '<candidate-shard>', code: 'candidate_shard_duplicate_or_missing_id' });
    shardIds.add(shard.id);
    if (!CANDIDATE_CI_RUNNERS.includes(shard.runner)) findings.push({ step: shard.id, code: 'candidate_shard_runner_invalid', value: shard.runner });
    if (!CANDIDATE_CI_PHASES.includes(shard.phase)) findings.push({ step: shard.id, code: 'candidate_shard_phase_invalid', value: shard.phase });
    if (!Array.isArray(shard.stepIds) || shard.stepIds.length === 0 || new Set(shard.stepIds).size !== shard.stepIds.length) {
      findings.push({ step: shard.id, code: 'candidate_shard_steps_invalid' });
      continue;
    }
    if (shard.producesArtifact) artifactProducers += 1;
    if (shard.producesArtifact && (shard.phase !== 'artifact' || shard.stepIds.length !== 1 || shard.stepIds[0] !== 'candidate-tarball')) {
      findings.push({ step: shard.id, code: 'candidate_artifact_shard_invalid' });
    }
    for (const id of shard.stepIds) {
      if (!byId.has(id)) findings.push({ step: shard.id, code: 'candidate_shard_unknown_step', value: id });
      else if (!candidateIds.has(id)) findings.push({ step: shard.id, code: 'candidate_shard_non_candidate_step', value: id });
      owners.set(id, [...(owners.get(id) ?? []), shard.id]);
      if (byId.get(id)?.executor?.consumesArtifact && !shard.requiresArtifact) {
        findings.push({ step: shard.id, code: 'candidate_shard_artifact_requirement_missing', value: id });
      }
    }
  }
  if (artifactProducers !== 1) findings.push({ step: '<candidate-shards>', code: 'candidate_artifact_shard_count', value: artifactProducers });
  for (const id of candidateIds) {
    const actual = owners.get(id) ?? [];
    const allowed = platformRepeats[id];
    if (allowed) {
      if (JSON.stringify([...actual].sort()) !== JSON.stringify([...allowed].sort())) {
        findings.push({ step: id, code: 'candidate_platform_repeat_mismatch', value: actual.join(',') });
      }
    } else if (actual.length !== 1) findings.push({ step: id, code: actual.length === 0 ? 'candidate_step_unowned' : 'candidate_step_duplicated', value: actual.join(',') });
  }
  for (const [id, allowed] of Object.entries(platformRepeats)) {
    if (!candidateIds.has(id) || !Array.isArray(allowed) || allowed.length < 2 || new Set(allowed).size !== allowed.length) {
      findings.push({ step: id, code: 'candidate_platform_repeat_invalid' });
    }
    for (const shardId of allowed ?? []) if (!shardIds.has(shardId)) findings.push({ step: id, code: 'candidate_platform_repeat_unknown_shard', value: shardId });
  }
  const tupleIds = new Set();
  const expectedTuples = new Set(['minimum:macos', 'minimum:windows', 'current:macos', 'current:windows']);
  for (const tuple of hostNodeTuples) {
    if (!tuple.id || tupleIds.has(tuple.id)) findings.push({ step: tuple.id || '<host-node-tuple>', code: 'candidate_host_tuple_duplicate_or_missing_id' });
    tupleIds.add(tuple.id);
    if (!CANDIDATE_CI_RUNNERS.includes(tuple.runner) || !['minimum', 'current'].includes(tuple.expectation)) {
      findings.push({ step: tuple.id, code: 'candidate_host_tuple_invalid' });
    }
    expectedTuples.delete(`${tuple.expectation}:${tuple.runner}`);
  }
  for (const tuple of expectedTuples) findings.push({ step: '<host-node-tuples>', code: 'candidate_host_tuple_missing', value: tuple });
  return { ok: findings.length === 0, findings };
}

export function normalizeProductPath(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) throw new Error(`Invalid Product path: ${value}`);
  const normalized = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error(`Product path escapes root: ${value}`);
  if (normalized.startsWith('.github/') && !VERIFICATION_GOVERNED_REPOSITORY_INPUTS.includes(normalized)) {
    throw new Error(`Ungoverned repository path is outside Product verification ownership: ${value}`);
  }
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

function matchedStepInput(step, productPath) {
  if (step.selection === 'explicit-only') return null;
  const matched = step.inputs.find((pattern) => matchesInput(productPath, pattern));
  if (!matched) return null;
  if ((step.inputExclusions ?? []).some((pattern) => matchesInput(productPath, pattern))) return null;
  return matched;
}

export function validateVerificationRegistry(steps = verificationSteps) {
  const findings = [];
  const ids = new Set();
  for (const item of steps) {
    if (!item.id || ids.has(item.id)) findings.push({ step: item.id || '<missing>', code: 'duplicate_or_missing_id' });
    ids.add(item.id);
    if (!item.name) findings.push({ step: item.id, code: 'missing_name' });
    if (!Array.isArray(item.inputs) || item.inputs.length === 0) findings.push({ step: item.id, code: 'missing_inputs' });
    if (item.selection != null && item.selection !== 'explicit-only') findings.push({ step: item.id, code: 'invalid_selection', value: item.selection });
    if (!Array.isArray(item.developmentRunners)) findings.push({ step: item.id, code: 'invalid_development_runners' });
    else {
      if (new Set(item.developmentRunners).size !== item.developmentRunners.length) findings.push({ step: item.id, code: 'duplicate_development_runner' });
      for (const runner of item.developmentRunners) if (!VERIFICATION_DEVELOPMENT_RUNNERS.includes(runner)) {
        findings.push({ step: item.id, code: 'unknown_development_runner', value: runner });
      }
      if (item.developmentRunners.length > 0 && item.selection !== 'explicit-only') findings.push({ step: item.id, code: 'development_runner_owner_not_explicit' });
    }
    if (item.inputExclusions != null && !Array.isArray(item.inputExclusions)) findings.push({ step: item.id, code: 'invalid_input_exclusions' });
    else for (const pattern of item.inputExclusions ?? []) {
      try { normalizeProductPath(pattern); } catch { findings.push({ step: item.id, code: 'invalid_input_exclusion', value: pattern }); }
    }
    const classification = item.testing;
    if (!classification || typeof classification !== 'object') findings.push({ step: item.id, code: 'missing_testing_classification' });
    else {
      if (!/^(?:project:[a-z0-9-]+|service:[a-z0-9-]+\/[a-z0-9-]+)$/.test(classification.ownerScope ?? '')) {
        findings.push({ step: item.id, code: 'invalid_testing_owner', value: classification.ownerScope });
      }
      if (!VERIFICATION_TEST_INTENTS.includes(classification.primaryIntent)) {
        findings.push({ step: item.id, code: 'invalid_testing_intent', value: classification.primaryIntent });
      }
      if (!VERIFICATION_EXECUTION_BOUNDARIES.includes(classification.executionBoundary)) {
        findings.push({ step: item.id, code: 'invalid_testing_boundary', value: classification.executionBoundary });
      }
      const quick = (item.profiles ?? []).includes('fast');
      if (quick && classification.executionBoundary === 'System') findings.push({ step: item.id, code: 'quick_system_boundary' });
      if (quick && classification.targetDurationMs > 15000) findings.push({ step: item.id, code: 'quick_target_too_slow', value: classification.targetDurationMs });
      if (!Number.isInteger(classification.targetDurationMs) || classification.targetDurationMs < 1) {
        findings.push({ step: item.id, code: 'invalid_testing_target_duration', value: classification.targetDurationMs });
      }
      if (typeof classification.proves !== 'string' || classification.proves.trim().length === 0) {
        findings.push({ step: item.id, code: 'missing_testing_proves' });
      }
      if (typeof classification.primaryEvidenceOwner !== 'string' || classification.primaryEvidenceOwner.length === 0) {
        findings.push({ step: item.id, code: 'missing_primary_evidence_owner' });
      }
      const executionEnvironment = classification.environment;
      if (!executionEnvironment || typeof executionEnvironment !== 'object') findings.push({ step: item.id, code: 'missing_testing_environment' });
      else {
        if (!Array.isArray(executionEnvironment.footprints)) findings.push({ step: item.id, code: 'invalid_environment_footprints' });
        else {
          const uniqueFootprints = new Set(executionEnvironment.footprints);
          if (uniqueFootprints.size !== executionEnvironment.footprints.length) findings.push({ step: item.id, code: 'duplicate_environment_footprint' });
          for (const footprint of uniqueFootprints) if (!VERIFICATION_ENVIRONMENT_FOOTPRINTS.includes(footprint)) {
            findings.push({ step: item.id, code: 'unknown_environment_footprint', value: footprint });
          }
        }
        if (!VERIFICATION_ENVIRONMENT_ISOLATIONS.includes(executionEnvironment.isolation)) {
          findings.push({ step: item.id, code: 'invalid_environment_isolation', value: executionEnvironment.isolation });
        }
      }
      if (!VERIFICATION_RESET_BURDENS.includes(classification.resetBurden)) {
        findings.push({ step: item.id, code: 'invalid_reset_burden', value: classification.resetBurden });
      }
      if (classification.executionBoundary === 'Component' && (
        (executionEnvironment?.footprints?.length ?? 0) > 0
        || executionEnvironment?.isolation !== 'none'
        || classification.resetBurden !== 'none'
      )) findings.push({ step: item.id, code: 'component_environment_boundary' });
      if (quick && ['repeated-cleanup', 'lifecycle'].includes(classification.resetBurden)) {
        findings.push({ step: item.id, code: 'quick_reset_burden', value: classification.resetBurden });
      }
      if (quick && executionEnvironment?.isolation === 'shared') findings.push({ step: item.id, code: 'quick_shared_environment' });
      if (quick && classification.executionBoundary === 'Integration') {
        const forbidden = executionEnvironment?.footprints?.filter((footprint) => ['git', 'network', 'workspace-lifecycle'].includes(footprint)) ?? [];
        if (!['read-only', 'unique-temporary-root'].includes(executionEnvironment?.isolation)
          || classification.resetBurden !== 'none'
          || forbidden.length > 0) {
          findings.push({ step: item.id, code: 'quick_integration_not_isolated', value: forbidden.join(',') || executionEnvironment?.isolation });
        }
      }
      if (item.budgetMs != null && item.budgetMs !== classification.targetDurationMs) {
        findings.push({ step: item.id, code: 'testing_target_budget_mismatch', value: item.budgetMs });
      }
    }
    if (!VERIFICATION_EXECUTORS.includes(item.executor?.type)) findings.push({ step: item.id, code: 'unknown_executor', value: item.executor?.type });
    if (item.executor?.type === 'node-test' && (!Array.isArray(item.executor.files) || item.executor.files.length === 0)) {
      findings.push({ step: item.id, code: 'node_test_files_missing' });
    } else if (item.executor?.type === 'node-test') {
      for (const file of item.executor.files) {
        try { normalizeProductPath(file); } catch { findings.push({ step: item.id, code: 'node_test_file_invalid', value: file }); }
      }
    }
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
  for (const item of steps) {
    const owner = item.testing?.primaryEvidenceOwner;
    if (owner && !ids.has(owner)) findings.push({ step: item.id, code: 'unknown_primary_evidence_owner', value: owner });
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
  if (steps === verificationSteps) findings.push(...validateCandidateCiCoverage(steps).findings);
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
  const delegated = [];
  const ignored = [];
  const unmapped = [];
  for (const rawPath of paths) {
    const productPath = normalizeProductPath(rawPath);
    const owners = steps.filter((item) => matchedStepInput(item, productPath)).map((item) => item.id);
    const delegatedOwners = VERIFICATION_DELEGATED_INPUTS
      .filter((item) => item.inputs.some((pattern) => matchesInput(productPath, pattern)))
      .map((item) => item.owner);
    if (owners.length > 0) mapped.push({ path: productPath, owners });
    else if (delegatedOwners.length > 0) delegated.push({ path: productPath, owners: delegatedOwners });
    else if (VERIFICATION_IGNORED_INPUTS.some((pattern) => matchesInput(productPath, pattern))) ignored.push(productPath);
    else unmapped.push(productPath);
  }
  return Object.freeze({
    ok: unmapped.length === 0,
    mapped: Object.freeze(mapped),
    delegated: Object.freeze(delegated),
    ignored: Object.freeze(ignored),
    unmapped: Object.freeze(unmapped),
  });
}

export function auditProductionOwnerCoverage(paths, steps = verificationSteps) {
  const mapped = [];
  const allowlisted = [];
  const gaps = [];
  for (const rawPath of paths) {
    const productPath = normalizeProductPath(rawPath);
    if (!PRODUCTION_OWNER_GOVERNED_INPUTS.some((pattern) => matchesInput(productPath, pattern))) continue;
    const owners = steps
      .filter((item) => matchedStepInput(item, productPath))
      .map((item) => item.id);
    const directOwners = steps
      .filter((item) => owners.includes(item.id))
      .filter((item) => !PRODUCTION_OWNER_BROAD_STEPS.has(item.id))
      .filter((item) => PRODUCTION_OWNER_BOUNDARIES.has(item.testing?.executionBoundary))
      .map((item) => item.id);
    if (directOwners.length > 0) {
      mapped.push(Object.freeze({ path: productPath, owners: Object.freeze(directOwners) }));
      continue;
    }
    const exception = VERIFICATION_PRODUCTION_OWNER_ALLOWLIST.find((item) => item.path === productPath);
    if (exception && owners.includes(exception.owner)) {
      allowlisted.push(exception);
      continue;
    }
    gaps.push(Object.freeze({ path: productPath, broadOwners: Object.freeze(owners) }));
  }
  return Object.freeze({
    ok: gaps.length === 0,
    mapped: Object.freeze(mapped),
    allowlisted: Object.freeze(allowlisted),
    gaps: Object.freeze(gaps),
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
  const productionOwnerAudit = auditProductionOwnerCoverage(paths, steps);
  if (!productionOwnerAudit.ok) {
    throw new Error(`Production source owner coverage gap:\n${productionOwnerAudit.gaps.map((item) => `- ${item.path}`).join('\n')}`);
  }
  const profiles = [...new Set(request.profiles ?? [])];
  const groups = [...new Set(request.groups ?? [])];
  const stepIds = [...new Set(request.stepIds ?? [])];
  const fullScopeExemptPaths = new Set((request.fullScopeExemptPaths ?? []).map(normalizeProductPath));
  const fullScopeMatches = paths.filter((productPath) => !fullScopeExemptPaths.has(productPath)).flatMap((productPath) => VERIFICATION_FULL_SCOPE_INPUTS
    .filter((pattern) => matchesInput(productPath, pattern))
    .map((pattern) => ({ productPath, pattern })));
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
  if (fullScopeMatches.length > 0) {
    for (const item of steps) if (item.profiles.includes('candidate')) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), ...fullScopeMatches.map(({ productPath, pattern }) => (
        ['package.json', 'package-lock.json'].includes(productPath)
          ? `${productPath} contains unverified or non-version package metadata changes; matches full-scope owner ${pattern}`
          : `${productPath} matches full-scope owner ${pattern}`
      ))]);
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
  const delegatedPaths = [];
  for (const productPath of paths) {
    const matched = steps.filter((item) => matchedStepInput(item, productPath));
    const delegatedOwners = VERIFICATION_DELEGATED_INPUTS
      .filter((item) => item.inputs.some((pattern) => matchesInput(productPath, pattern)))
      .map((item) => item.owner);
    if (matched.length === 0 && delegatedOwners.length > 0) delegatedPaths.push(Object.freeze({ path: productPath, owners: Object.freeze(delegatedOwners) }));
    else if (matched.length === 0 && !VERIFICATION_IGNORED_INPUTS.some((pattern) => matchesInput(productPath, pattern))) unmatchedPaths.push(productPath);
    for (const item of matched) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), `${productPath} matches ${matchedStepInput(item, productPath)}`]);
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
    delegated: Object.freeze(delegatedPaths),
    steps: Object.freeze(orderedIds.map((id) => Object.freeze({ ...byId.get(id), reasons: Object.freeze(reasons.get(id) ?? []) }))),
  });
}

export function createDevelopmentPlatformPlan(request = {}, steps = verificationSteps) {
  const validation = validateVerificationRegistry(steps);
  if (!validation.ok) throw new Error(`Invalid verification registry:\n${validation.findings.map((item) => `${item.step}: ${item.code}`).join('\n')}`);
  const runner = request.runner;
  if (!VERIFICATION_DEVELOPMENT_RUNNERS.includes(runner)) throw new Error(`Unknown development verification runner: ${runner}`);
  const paths = [...new Set((request.paths ?? []).map(normalizeProductPath))];
  const matchedReasons = new Map();
  for (const item of steps) {
    if (!item.developmentRunners.includes(runner)) continue;
    const matched = paths.filter((productPath) => item.inputs.some((pattern) => matchesInput(productPath, pattern))
      && !(item.inputExclusions ?? []).some((pattern) => matchesInput(productPath, pattern)));
    if (matched.length > 0) matchedReasons.set(item.id, matched.map((productPath) => `${productPath} matches ${runner} development owner ${item.id}`));
  }
  const base = createVerificationPlan({ stepIds: [...matchedReasons.keys()] }, steps);
  return Object.freeze({
    ...base,
    source: 'development-platform',
    runner,
    paths: Object.freeze(paths),
    steps: Object.freeze(base.steps.map((item) => Object.freeze({
      ...item,
      reasons: Object.freeze([...(item.reasons ?? []), ...(matchedReasons.get(item.id) ?? [])]),
    }))),
  });
}

export function createVerificationAdmissionPlan(plan, steps = verificationSteps) {
  if (plan.steps.length === 0) return Object.freeze({ ...plan, admissionStepIds: Object.freeze([]) });
  const fastPlan = createVerificationPlan({ profiles: ['fast'] }, steps);
  const admissionStepIds = [...new Set([
    ...fastPlan.steps.map((item) => item.id),
    ...plan.steps.filter((item) => item.admission === true).map((item) => item.id),
  ])];
  const admissionIds = new Set(admissionStepIds);
  const merged = new Map();
  for (const item of [...fastPlan.steps, ...plan.steps]) {
    const existing = merged.get(item.id);
    merged.set(item.id, Object.freeze({
      ...(existing ?? item),
      ...item,
      reasons: Object.freeze([...new Set([...(existing?.reasons ?? []), ...(item.reasons ?? [])])]),
    }));
  }
  const orderedIds = [
    ...admissionStepIds,
    ...plan.steps.map((item) => item.id).filter((id) => !admissionIds.has(id)),
  ];
  const composedSteps = orderedIds.map((id) => {
    const item = merged.get(id);
    if (admissionIds.has(id)) return item;
    return Object.freeze({
      ...item,
      dependsOn: Object.freeze([...new Set([...(item.dependsOn ?? []), ...admissionStepIds])]),
    });
  });
  return Object.freeze({
    ...plan,
    admissionStepIds: Object.freeze(admissionStepIds),
    steps: Object.freeze(composedSteps),
  });
}

export function createCandidateCiShardPlan(shardId, options = {}, steps = verificationSteps) {
  const validation = validateCandidateCiCoverage(steps);
  if (!validation.ok) throw new Error(`Invalid Candidate CI coverage:\n${validation.findings.map((item) => `${item.step}: ${item.code}`).join('\n')}`);
  const shard = CANDIDATE_CI_SHARDS.find((item) => item.id === shardId);
  if (!shard) throw new Error(`Unknown Candidate CI shard: ${shardId}`);
  if (shard.requiresArtifact && options.externalArtifact !== true) throw new Error(`Candidate CI shard ${shardId} requires an external candidate artifact`);
  const plan = createVerificationPlan({ stepIds: shard.stepIds }, steps);
  const primary = new Set(shard.stepIds);
  const projectedSteps = [];
  for (const item of plan.steps) {
    if (!primary.has(item.id) && item.id !== 'candidate-tarball') {
      throw new Error(`Candidate CI shard ${shardId} has an undeclared cross-shard dependency: ${item.id}`);
    }
    if (item.id === 'candidate-tarball' && !primary.has(item.id) && options.externalArtifact === true) continue;
    projectedSteps.push(Object.freeze({
      ...item,
      dependsOn: Object.freeze((item.dependsOn ?? []).filter((dependency) => !(dependency === 'candidate-tarball' && options.externalArtifact === true))),
    }));
  }
  return Object.freeze({
    ...plan,
    source: 'candidate-ci-shard',
    shard,
    primaryStepIds: shard.stepIds,
    steps: Object.freeze(projectedSteps),
  });
}
