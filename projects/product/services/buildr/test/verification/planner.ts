import path from 'node:path';
import {
  CANDIDATE_CI_HOST_NODE_TUPLES,
  CANDIDATE_CI_PLATFORM_REPEATS,
  CANDIDATE_CI_SHARDS,
  VERIFICATION_CONCURRENCY,
  VERIFICATION_CONTEXT_KEYS,
  VERIFICATION_DAILY_CORE_EXCLUSIONS,
  VERIFICATION_ENVIRONMENT_FOOTPRINTS,
  VERIFICATION_ENVIRONMENT_ISOLATIONS,
  VERIFICATION_DEVELOPMENT_RUNNERS,
  VERIFICATION_EXECUTION_BOUNDARIES,
  VERIFICATION_EXECUTORS,
  VERIFICATION_GROUPS,
  VERIFICATION_ISOLATION_MODES,
  VERIFICATION_PARALLEL_SAFETY,
  VERIFICATION_PROFILES,
  VERIFICATION_RESOURCE_CONTRACTS,
  VERIFICATION_RESOURCE_DEMANDS,
  VERIFICATION_RESET_BURDENS,
  VERIFICATION_RESET_STRATEGIES,
  VERIFICATION_SLOW_EVIDENCE_THRESHOLD_MS,
  VERIFICATION_TEST_INTENTS,
  verificationSteps,
} from './registry.ts';
import {
  VERIFICATION_DELEGATED_INPUTS,
  VERIFICATION_FULL_SCOPE_AUTHORITIES,
  VERIFICATION_FULL_SCOPE_INPUTS,
  VERIFICATION_GOVERNED_REPOSITORY_INPUTS,
  VERIFICATION_IGNORED_INPUTS,
  VERIFICATION_PRODUCTION_OWNER_ALLOWLIST,
  VERIFICATION_SELECTION_METADATA_INPUTS,
  validateVerificationStepOwnership,
} from './ownership.ts';

const PRODUCTION_OWNER_GOVERNED_INPUTS: any = Object.freeze([
  'src/infrastructure/**/*.ts',
  'src/*/application/**/*.ts',
  'src/*/persistence/**/*.ts',
]);
const PRODUCTION_OWNER_BROAD_STEPS: any = new Set([
  'unit',
  'candidate-tarball',
  'application-payload-release',
  'cli-architecture',
]);
const PRODUCTION_OWNER_BOUNDARIES: any = new Set(['Static', 'Integration', 'System']);

const CANDIDATE_CI_RUNNERS: any = Object.freeze(['macos', 'windows']);
const CANDIDATE_CI_PHASES: any = Object.freeze(['preflight', 'artifact', 'verification']);

export function createVerificationEvidenceMap(steps: any = verificationSteps, options: any = {}): any  {
  const thresholdMs: any = options.thresholdMs ?? VERIFICATION_SLOW_EVIDENCE_THRESHOLD_MS;
  const byId: any = new Map(steps.map((item: any) => [item.id, item]));
  const slowOwners: any = steps.filter((item: any) => (
    item.profiles.includes('core')
    && ['Integration', 'System'].includes(item.testing?.executionBoundary)
    && item.testing.targetDurationMs >= thresholdMs
  ));
  const includedIds: any = new Set(slowOwners.map((item: any) => item.id));
  for (const item of slowOwners) includedIds.add(item.testing.primaryEvidenceOwner);
  const entries: any = [...includedIds].map((id: any) => {
    const item: any = byId.get(id);
    if (!item) return Object.freeze({ id, missing: true });
    const primaryEvidenceOwner: any = item.testing?.primaryEvidenceOwner;
    const evidence: any = item.testing?.evidence;
    return Object.freeze({
      id,
      executionBoundary: item.testing?.executionBoundary ?? null,
      targetDurationMs: item.testing?.targetDurationMs ?? null,
      publicOutcome: evidence?.publicOutcome ?? null,
      counterexample: evidence?.counterexample ?? null,
      retainedBoundary: evidence?.retainedBoundary ?? null,
      decision: evidence?.decision ?? null,
      primaryEvidenceOwner,
      evidenceRole: id === primaryEvidenceOwner ? 'primary' : 'supporting',
    });
  });
  const findings: any[] = [];
  const entryById: any = new Map(entries.map((item: any) => [item.id, item]));
  for (const owner of slowOwners) {
    const entry: any = entryById.get(owner.id);
    if (!entry || entry.missing) findings.push({ step: owner.id, code: 'slow_evidence_owner_missing' });
    else {
      for (const field of ['publicOutcome', 'counterexample', 'retainedBoundary', 'decision']) {
        if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) findings.push({ step: owner.id, code: `slow_evidence_${field}_missing` });
      }
    }
    const primary: any = entryById.get(owner.testing.primaryEvidenceOwner);
    if (!primary || primary.missing) findings.push({ step: owner.id, code: 'slow_evidence_primary_owner_missing', value: owner.testing.primaryEvidenceOwner });
    else if (primary.evidenceRole !== 'primary') findings.push({ step: owner.id, code: 'slow_evidence_primary_owner_not_primary', value: owner.testing.primaryEvidenceOwner });
  }
  const primaryClaims: any = new Map();
  for (const entry of entries.filter((item: any) => !item.missing && item.evidenceRole === 'primary')) {
    primaryClaims.set(entry.primaryEvidenceOwner, [...(primaryClaims.get(entry.primaryEvidenceOwner) ?? []), entry.id]);
  }
  for (const owner of new Set(entries.filter((item: any) => !item.missing).map((item: any) => item.primaryEvidenceOwner))) {
    const claims: any = primaryClaims.get(owner) ?? [];
    if (claims.length !== 1) findings.push({ step: owner, code: 'slow_evidence_primary_claim_count', value: claims.length });
  }
  return Object.freeze({
    schemaVersion: 'buildr.verification-primary-evidence-map/v1',
    thresholdMs,
    ok: findings.length === 0,
    entries: Object.freeze(entries),
    findings: Object.freeze(findings),
  });
}

export function auditDailyCoreReleaseEvidence(steps: any = verificationSteps): any  {
  const releaseOnly: any = steps.filter((item: any) => item.testing?.primaryIntent === 'Delivery / Release');
  const findings: any[] = [];
  for (const item of releaseOnly) {
    if (item.profiles.includes('core')) findings.push({ step: item.id, code: 'release_only_step_in_daily_core' });
    if (item.profiles.includes('candidate') && !Object.hasOwn(VERIFICATION_DAILY_CORE_EXCLUSIONS, item.id)) {
      findings.push({ step: item.id, code: 'release_only_candidate_exclusion_missing' });
    }
  }
  return Object.freeze({
    schemaVersion: 'buildr.verification-release-evidence-audit/v1',
    ok: findings.length === 0,
    dailyProfile: 'core',
    candidateShardPrefixIsDailyProfile: false,
    releaseOnlyStepIds: Object.freeze(releaseOnly.map((item: any) => item.id)),
    findings: Object.freeze(findings),
  });
}

export function createVerificationSelectionAudit(plan: any): any  {
  const scopeMappings: any = (plan.scope?.reasons ?? []).filter((item: any) => item.code === 'affected-owner');
  const directMappings: any = scopeMappings.length > 0 ? scopeMappings : (plan.paths ?? []).flatMap((productPath: any) => {
    const owners: any = (plan.steps ?? [])
      .filter((item: any) => (item.reasons ?? []).some((reason: any) => reason.startsWith(`${productPath} matches `) && !reason.includes('full-scope owner')))
      .map((item: any) => item.id);
    return owners.length === 0 ? [] : [Object.freeze({ code: 'direct-owner', path: productPath, owners: Object.freeze(owners) })];
  });
  const directOwnerIds: any[] = [...new Set(directMappings.flatMap((item: any) => item.owners ?? []))];
  const selectedStepIds: any = (plan.steps ?? []).map((item: any) => item.id);
  const dependencyStepIds: any = (plan.steps ?? [])
    .filter((item: any) => !directOwnerIds.includes(item.id) && (item.reasons ?? []).some((reason: any) => reason.startsWith('dependency of ')))
    .map((item: any) => item.id);
  const heavySelectedStepIds: any = (plan.steps ?? [])
    .filter((item: any) => ['Integration', 'System'].includes(item.testing?.executionBoundary))
    .map((item: any) => item.id);
  const directHeavyOwnerIds: any = directOwnerIds.filter((id: any) => {
    const boundary: any = plan.steps?.find((item: any) => item.id === id)?.testing?.executionBoundary;
    return ['Integration', 'System'].includes(boundary);
  });
  const fullReasons: any = (plan.scope?.reasons ?? []).filter((item: any) => item.code !== 'affected-owner');
  const stepSelections: any = (plan.steps ?? []).map((item: any) => {
    const triggers: any[] = [];
    for (const mapping of directMappings.filter((entry: any) => entry.owners?.includes(item.id))) {
      triggers.push(Object.freeze({ kind: 'direct-owner', path: mapping.path }));
    }
    if (fullReasons.length > 0 && item.profiles?.includes('core')) {
      triggers.push(Object.freeze({
        kind: 'full-scope',
        reasons: Object.freeze(fullReasons.map((reason: any) => Object.freeze({
          code: reason.code,
          path: reason.path ?? null,
          pattern: reason.pattern ?? reason.owners?.[0] ?? null,
          explanation: reason.explanation ?? null,
        }))),
      }));
    }
    for (const reason of item.reasons ?? []) {
      const dependency: any = /^dependency of (.+)$/u.exec(reason);
      if (dependency) triggers.push(Object.freeze({ kind: 'dependency-closure', parentStepId: dependency[1] }));
      else if (reason.startsWith('profile ')) triggers.push(Object.freeze({ kind: 'profile', profile: reason.slice('profile '.length) }));
      else if (reason.startsWith('group ')) triggers.push(Object.freeze({ kind: 'group', group: reason.slice('group '.length) }));
      else if (reason.startsWith('step ')) triggers.push(Object.freeze({ kind: 'explicit-step', stepId: reason.slice('step '.length) }));
    }
    if ((plan.admissionStepIds ?? []).includes(item.id)) triggers.push(Object.freeze({ kind: 'admission' }));
    return Object.freeze({
      stepId: item.id,
      selectionKinds: Object.freeze([...new Set(triggers.map((trigger: any) => trigger.kind))]),
      triggers: Object.freeze(triggers),
      executionBoundary: item.testing?.executionBoundary ?? null,
      primaryEvidenceOwner: item.testing?.primaryEvidenceOwner ?? null,
      publicOutcome: item.testing?.evidence?.publicOutcome ?? item.testing?.proves ?? null,
      targetDurationMs: item.testing?.targetDurationMs ?? null,
    });
  });
  const layerCounts: any = Object.freeze(Object.fromEntries(
    ['Static', 'Unit', 'Component', 'Integration', 'System'].map((boundary: any) => [
      boundary,
      stepSelections.filter((item: any) => item.executionBoundary === boundary).length,
    ]),
  ));
  return Object.freeze({
    schemaVersion: 'buildr.verification-selection-audit/v1',
    status: plan.status,
    scope: plan.scope,
    changedPathCount: plan.paths?.length ?? 0,
    directMappings: Object.freeze(directMappings),
    directOwnerIds: Object.freeze(directOwnerIds),
    dependencyStepIds: Object.freeze(dependencyStepIds),
    selectedStepIds: Object.freeze(selectedStepIds),
    heavySelectedStepIds: Object.freeze(heavySelectedStepIds),
    stepSelections: Object.freeze(stepSelections),
    layerCounts,
    counts: Object.freeze({
      directOwners: directOwnerIds.length,
      directHeavyOwners: directHeavyOwnerIds.length,
      dependencies: dependencyStepIds.length,
      selectedSteps: selectedStepIds.length,
      selectedHeavySteps: heavySelectedStepIds.length,
    }),
    selectionAmplification: directOwnerIds.length === 0 ? null : selectedStepIds.length / directOwnerIds.length,
    heavySelectionAmplification: directHeavyOwnerIds.length === 0 ? null : heavySelectedStepIds.length / directHeavyOwnerIds.length,
  });
}

export function validateCandidateCiCoverage(
  steps: any = verificationSteps,
  shards: any = CANDIDATE_CI_SHARDS,
  hostNodeTuples: any = CANDIDATE_CI_HOST_NODE_TUPLES,
  platformRepeats: any = CANDIDATE_CI_PLATFORM_REPEATS,
): any  {
  const findings: any[] = [];
  const byId: any = new Map(steps.map((item: any) => [item.id, item]));
  const candidateIds: any = new Set(steps.filter((item: any) => item.profiles.includes('candidate')).map((item: any) => item.id));
  const shardIds: any = new Set();
  const owners: any = new Map();
  let artifactProducers: any = 0;
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
    const actual: any = owners.get(id) ?? [];
    const allowed: any = platformRepeats[id];
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
  const tupleIds: any = new Set();
  const expectedTuples: any = new Set(['minimum:macos', 'minimum:windows', 'current:macos', 'current:windows']);
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

export function normalizeProductPath(value: any): any  {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) throw new Error(`Invalid Product path: ${value}`);
  const normalized: any = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error(`Product path escapes root: ${value}`);
  if (normalized.startsWith('.github/') && !VERIFICATION_GOVERNED_REPOSITORY_INPUTS.includes(normalized)) {
    throw new Error(`Ungoverned repository path is outside Product verification ownership: ${value}`);
  }
  return normalized;
}

export function globToRegExp(pattern: any): any  {
  const normalized: any = normalizeProductPath(pattern);
  let source: any = '^';
  for (let index: any = 0; index < normalized.length; index += 1) {
    const char: any = normalized[index];
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

export function matchesInput(productPath: any, pattern: any): any  {
  return globToRegExp(pattern).test(normalizeProductPath(productPath));
}

function ownedStepInput(step: any, productPath: any): any  {
  if (step.selection === 'explicit-only') return null;
  const matched: any = step.inputs.find((pattern: any) => matchesInput(productPath, pattern));
  if (!matched) return null;
  if ((step.inputExclusions ?? []).some((pattern: any) => matchesInput(productPath, pattern))) return null;
  return matched;
}

function matchedStepInput(step: any, productPath: any): any  {
  if (step.testing?.primaryIntent === 'Delivery / Release') return null;
  return ownedStepInput(step, productPath);
}

export function validateVerificationRegistry(steps: any = verificationSteps): any  {
  const ownershipValidation: any = steps === verificationSteps
    ? validateVerificationStepOwnership(steps.map((item: any) => item.id))
    : { findings: [] };
  const findings: any[] = [...ownershipValidation.findings];
  const ids: any = new Set();
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
    const classification: any = item.testing;
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
      const quick: any = (item.profiles ?? []).includes('fast');
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
      const executionEnvironment: any = classification.environment;
      if (!executionEnvironment || typeof executionEnvironment !== 'object') findings.push({ step: item.id, code: 'missing_testing_environment' });
      else {
        if (!Array.isArray(executionEnvironment.footprints)) findings.push({ step: item.id, code: 'invalid_environment_footprints' });
        else {
          const uniqueFootprints: any = new Set(executionEnvironment.footprints);
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
        const forbidden: any = executionEnvironment?.footprints?.filter((footprint: any) => ['git', 'network', 'workspace-lifecycle'].includes(footprint)) ?? [];
        if (!['read-only', 'unique-temporary-root'].includes(executionEnvironment?.isolation)
          || classification.resetBurden !== 'none'
          || forbidden.length > 0) {
          findings.push({ step: item.id, code: 'quick_integration_not_isolated', value: forbidden.join(',') || executionEnvironment?.isolation });
        }
      }
      if (item.admission === true && classification.targetDurationMs > 15000) {
        findings.push({ step: item.id, code: 'admission_target_too_slow', value: classification.targetDurationMs });
      }
      if (item.admission === true && executionEnvironment?.footprints?.includes('workspace-lifecycle')) {
        findings.push({ step: item.id, code: 'admission_workspace_lifecycle' });
      }
      if (item.admission === true && (item.resources?.length ?? 0) > 0) {
        findings.push({ step: item.id, code: 'admission_resource_claim', value: item.resources.join(',') });
      }
      if (item.budgetMs != null && item.budgetMs !== classification.targetDurationMs) {
        findings.push({ step: item.id, code: 'testing_target_budget_mismatch', value: item.budgetMs });
      }
    }
    if (!VERIFICATION_EXECUTORS.includes(item.executor?.type)) findings.push({ step: item.id, code: 'unknown_executor', value: item.executor?.type });
    if (['node-test', 'node-context-test'].includes(item.executor?.type) && (!Array.isArray(item.executor.files) || item.executor.files.length === 0)) {
      findings.push({ step: item.id, code: 'node_test_files_missing' });
    } else if (['node-test', 'node-context-test'].includes(item.executor?.type)) {
      if (item.testing?.primaryEvidenceOwner !== item.id) {
        findings.push({ step: item.id, code: 'node_test_primary_evidence_owner_mismatch', value: item.testing?.primaryEvidenceOwner });
      }
      for (const file of item.executor.files) {
        try { normalizeProductPath(file); } catch { findings.push({ step: item.id, code: 'node_test_file_invalid', value: file }); }
      }
    }
    if (!VERIFICATION_CONCURRENCY.classes[item.concurrencyClass]) findings.push({ step: item.id, code: 'unknown_concurrency_class', value: item.concurrencyClass });
    if (!Array.isArray(item.contexts) || new Set(item.contexts ?? []).size !== (item.contexts?.length ?? -1)) {
      findings.push({ step: item.id, code: 'invalid_contexts' });
    } else for (const context of item.contexts) if (!VERIFICATION_CONTEXT_KEYS.includes(context)) {
      findings.push({ step: item.id, code: 'unknown_context', value: context });
    }
    if (!VERIFICATION_ISOLATION_MODES.includes(item.isolationMode)) findings.push({ step: item.id, code: 'invalid_isolation_mode', value: item.isolationMode });
    if (!VERIFICATION_RESET_STRATEGIES.includes(item.resetStrategy)) findings.push({ step: item.id, code: 'invalid_reset_strategy', value: item.resetStrategy });
    if (!VERIFICATION_PARALLEL_SAFETY.includes(item.parallelSafety)) findings.push({ step: item.id, code: 'invalid_parallel_safety', value: item.parallelSafety });
    if (!item.resourceDemand || typeof item.resourceDemand !== 'object' || Array.isArray(item.resourceDemand)) {
      findings.push({ step: item.id, code: 'invalid_resource_demand' });
    } else {
      const demandEntries: any = Object.entries(item.resourceDemand);
      if (!Object.hasOwn(item.resourceDemand, 'workers') || !Object.hasOwn(item.resourceDemand, 'processes')) findings.push({ step: item.id, code: 'resource_demand_required_dimension_missing' });
      for (const [dimension, value] of demandEntries) {
        if (!VERIFICATION_RESOURCE_DEMANDS.includes(dimension)) findings.push({ step: item.id, code: 'unknown_resource_demand', value: dimension });
        else if (!Number.isInteger(value) || value < 1) findings.push({ step: item.id, code: 'invalid_resource_demand', value: `${dimension}:${value}` });
        else if (value > (VERIFICATION_CONCURRENCY.capacities?.[dimension] ?? 0)) findings.push({ step: item.id, code: 'unsatisfied_resource_demand', value: `${dimension}:${value}>${VERIFICATION_CONCURRENCY.capacities?.[dimension] ?? 0}` });
      }
    }
    for (const resource of item.resources ?? []) {
      if (!VERIFICATION_CONCURRENCY.resources?.[resource]) {
        findings.push({ step: item.id, code: 'unknown_concurrency_resource', value: resource });
        continue;
      }
      const contract: any = VERIFICATION_RESOURCE_CONTRACTS[resource];
      if (!contract) {
        findings.push({ step: item.id, code: 'resource_contract_missing', value: resource });
        continue;
      }
      const environment: any = item.testing?.environment;
      if (contract.requiredFootprints.some((footprint: any) => !environment?.footprints?.includes(footprint))) {
        findings.push({ step: item.id, code: 'resource_footprint_mismatch', value: resource });
      }
      if (environment?.isolation !== contract.isolation) {
        findings.push({ step: item.id, code: 'resource_isolation_mismatch', value: resource });
      }
      if (!contract.resetBurdens.includes(item.testing?.resetBurden)) {
        findings.push({ step: item.id, code: 'resource_cleanup_mismatch', value: resource });
      }
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
  if (steps === verificationSteps) {
    const coreIds: any = new Set(steps.filter((item: any) => item.profiles.includes('core')).map((item: any) => item.id));
    const candidateIds: any = new Set(steps.filter((item: any) => item.profiles.includes('candidate')).map((item: any) => item.id));
    for (const id of coreIds) if (!candidateIds.has(id)) findings.push({ step: id, code: 'core_step_not_candidate' });
    for (const [id, reason] of Object.entries(VERIFICATION_DAILY_CORE_EXCLUSIONS)) {
      if (!candidateIds.has(id)) findings.push({ step: id, code: 'core_exclusion_not_candidate' });
      if (coreIds.has(id)) findings.push({ step: id, code: 'core_exclusion_in_core' });
      if (typeof reason !== 'string' || reason.trim().length === 0) findings.push({ step: id, code: 'core_exclusion_reason_missing' });
    }
    for (const id of candidateIds) {
      if (!coreIds.has(id) && !Object.hasOwn(VERIFICATION_DAILY_CORE_EXCLUSIONS, id)) findings.push({ step: id, code: 'candidate_step_core_disposition_missing' });
    }
  }
  for (const item of steps) for (const dependency of item.dependsOn ?? []) {
    if (!ids.has(dependency)) findings.push({ step: item.id, code: 'unknown_dependency', value: dependency });
  }
  for (const item of steps) {
    const owner: any = item.testing?.primaryEvidenceOwner;
    if (owner && !ids.has(owner)) findings.push({ step: item.id, code: 'unknown_primary_evidence_owner', value: owner });
  }
  const artifactProducers: any = steps.filter((item: any) => item.executor?.type === 'candidate-artifact');
  const artifactConsumers: any = steps.filter((item: any) => item.executor?.consumesArtifact === true);
  if (artifactConsumers.length > 0 && artifactProducers.length !== 1) {
    findings.push({ step: '<registry>', code: 'candidate_artifact_count', value: artifactProducers.length });
  } else if (artifactProducers.length === 1) {
    const producer: any = artifactProducers[0].id;
    for (const item of artifactConsumers) {
      if (!item.dependsOn.includes(producer)) findings.push({ step: item.id, code: 'missing_artifact_dependency', value: producer });
    }
  }
  const byId: any = new Map(steps.map((item: any) => [item.id, item]));
  const visiting: any = new Set();
  const visited: any = new Set();
  const visit: any = (id: any, trail: any = []) => {
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
  findings.push(...createVerificationEvidenceMap(steps).findings);
  findings.push(...auditDailyCoreReleaseEvidence(steps).findings);
  if (steps === verificationSteps) findings.push(...validateCandidateCiCoverage(steps).findings);
  return { ok: findings.length === 0, findings };
}

export function createVerificationPreflightPlan(request: any = {}, steps: any = verificationSteps): any  {
  const validation: any = validateVerificationRegistry(steps);
  if (!validation.ok) throw new Error(`Invalid verification registry:\n${validation.findings.map((item: any) => `${item.step}: ${item.code}`).join('\n')}`);
  const paths: any[] = [...new Set((request.paths ?? []).map(normalizeProductPath))];
  const selected: any[] = [];
  for (const item of steps) {
    if (!item.preflight) continue;
    const matched: any = paths.filter((productPath: any) => item.preflight.inputs.some((pattern: any) => matchesInput(productPath, pattern)));
    if (matched.length) selected.push(Object.freeze({
      id: `preflight-${item.id}`, name: `${item.name} preflight`, executor: item.preflight.executor,
      dependsOn: [], profiles: [], groups: [], inputs: item.preflight.inputs, concurrencyClass: 'default', resources: [],
      budgetMs: item.preflight.budgetMs, reasons: Object.freeze(matched.map((entry: any) => `${entry} matches candidate-aware preflight`)),
      assures: item.id,
    }));
  }
  return Object.freeze({ paths: Object.freeze(paths), profiles: Object.freeze([]), groups: Object.freeze([]), stepIds: Object.freeze([]), steps: Object.freeze(selected) });
}

export function auditVerificationInputCoverage(paths: any, steps: any = verificationSteps): any  {
  const mapped: any[] = [];
  const delegated: any[] = [];
  const ignored: any[] = [];
  const unmapped: any[] = [];
  for (const rawPath of paths) {
    const productPath: any = normalizeProductPath(rawPath);
    const owners: any = steps.filter((item: any) => ownedStepInput(item, productPath)).map((item: any) => item.id);
    const delegatedOwners: any = VERIFICATION_DELEGATED_INPUTS
      .filter((item: any) => item.inputs.some((pattern: any) => matchesInput(productPath, pattern)))
      .map((item: any) => item.owner);
    if (owners.length > 0) mapped.push({ path: productPath, owners });
    else if (delegatedOwners.length > 0) delegated.push({ path: productPath, owners: delegatedOwners });
    else if (VERIFICATION_IGNORED_INPUTS.some((pattern: any) => matchesInput(productPath, pattern))) ignored.push(productPath);
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

export function auditProductionOwnerCoverage(paths: any, steps: any = verificationSteps): any  {
  const mapped: any[] = [];
  const allowlisted: any[] = [];
  const gaps: any[] = [];
  for (const rawPath of paths) {
    const productPath: any = normalizeProductPath(rawPath);
    if (!PRODUCTION_OWNER_GOVERNED_INPUTS.some((pattern: any) => matchesInput(productPath, pattern))) continue;
    const owners: any = steps
      .filter((item: any) => matchedStepInput(item, productPath))
      .map((item: any) => item.id);
    const directOwners: any = steps
      .filter((item: any) => owners.includes(item.id))
      .filter((item: any) => !PRODUCTION_OWNER_BROAD_STEPS.has(item.id))
      .filter((item: any) => PRODUCTION_OWNER_BOUNDARIES.has(item.testing?.executionBoundary))
      .map((item: any) => item.id);
    if (directOwners.length > 0) {
      mapped.push(Object.freeze({ path: productPath, owners: Object.freeze(directOwners) }));
      continue;
    }
    const exception: any = VERIFICATION_PRODUCTION_OWNER_ALLOWLIST.find((item: any) => item.path === productPath);
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

function expandDependencies(selected: any, byId: any, reasons: any): any  {
  const visit: any = (id: any, parent: any = null) => {
    if (selected.has(id)) return;
    selected.add(id);
    if (parent) reasons.set(id, [...(reasons.get(id) ?? []), `dependency of ${parent}`]);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency, id);
  };
  for (const id of [...selected]) for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency, id);
}

function topologicalOrder(selected: any, steps: any): any  {
  const order: any[] = [];
  const visited: any = new Set();
  const byId: any = new Map(steps.map((item: any) => [item.id, item]));
  const visit: any = (id: any) => {
    if (visited.has(id)) return;
    for (const dependency of byId.get(id).dependsOn ?? []) if (selected.has(dependency)) visit(dependency);
    visited.add(id);
    order.push(id);
  };
  for (const item of steps) if (selected.has(item.id)) visit(item.id);
  return order;
}

export function estimateVerificationPlan(plan: any, options: any = {}): any  {
  const concurrency: any = options.concurrency ?? VERIFICATION_CONCURRENCY;
  const declaredBudgetMs: any = options.declaredBudgetMs ?? null;
  const missingStepBudgets: any = plan.steps.filter((step: any) => !Number.isFinite(step.budgetMs) || step.budgetMs < 0).map((step: any) => step.id);
  const totalTargetDurationMs: any = plan.steps.reduce((total: any, step: any) => total + (Number.isFinite(step.budgetMs) ? step.budgetMs : 0), 0);
  const globalCapacity: any = concurrency.global;
  const globalCapacityLowerBoundMs: any = globalCapacity > 0 ? Math.ceil(totalTargetDurationMs / globalCapacity) : Number.POSITIVE_INFINITY;
  const criticalPaths: any = new Map();
  for (const step of plan.steps) {
    const dependencies: any = (step.dependsOn ?? []).map((id: any) => criticalPaths.get(id)).filter(Boolean);
    const longest: any = dependencies.sort((left: any, right: any) => right.durationMs - left.durationMs)[0] ?? { durationMs: 0, stepIds: [] };
    criticalPaths.set(step.id, Object.freeze({
      durationMs: longest.durationMs + (Number.isFinite(step.budgetMs) ? step.budgetMs : 0),
      stepIds: Object.freeze([...longest.stepIds, step.id]),
    }));
  }
  const dependencyCriticalPath: any = [...criticalPaths.values()].sort((left: any, right: any) => right.durationMs - left.durationMs)[0]
    ?? Object.freeze({ durationMs: 0, stepIds: Object.freeze([]) });
  const resourceCapacityLowerBounds: any = Object.freeze(Object.entries(concurrency.resources ?? {}).map(([resource, capacity]: any) => {
    const resourceSteps: any = plan.steps.filter((step: any) => (step.resources ?? []).includes(resource));
    const stepIds: any = resourceSteps.map((step: any) => step.id);
    const targetDurationMs: any = resourceSteps.reduce((total: any, step: any) => total + (Number.isFinite(step.budgetMs) ? step.budgetMs : 0), 0);
    return Object.freeze({
      resource,
      capacity,
      stepIds: Object.freeze(stepIds),
      targetDurationMs,
      lowerBoundMs: capacity > 0 ? Math.ceil(targetDurationMs / capacity) : Number.POSITIVE_INFINITY,
    });
  }));
  const constraints: any[] = [
    Object.freeze({ kind: 'global-capacity', id: 'global', lowerBoundMs: globalCapacityLowerBoundMs, capacity: globalCapacity }),
    Object.freeze({ kind: 'dependency-critical-path', id: dependencyCriticalPath.stepIds.join(' -> ') || 'none', lowerBoundMs: dependencyCriticalPath.durationMs, stepIds: dependencyCriticalPath.stepIds }),
    ...resourceCapacityLowerBounds.map((item: any) => Object.freeze({ kind: 'resource-capacity', id: item.resource, lowerBoundMs: item.lowerBoundMs, capacity: item.capacity, stepIds: item.stepIds })),
  ];
  const minimumFeasibleDurationMs: any = constraints.reduce((maximum: any, item: any) => Math.max(maximum, item.lowerBoundMs), 0);
  const limitingConstraints: any = Object.freeze(constraints.filter((item: any) => item.lowerBoundMs === minimumFeasibleDurationMs));
  const feasible: any = declaredBudgetMs == null
    ? null
    : missingStepBudgets.length === 0 && declaredBudgetMs >= minimumFeasibleDurationMs;
  return Object.freeze({
    stepCount: plan.steps.length,
    totalTargetDurationMs,
    missingStepBudgets: Object.freeze(missingStepBudgets),
    globalCapacity: Object.freeze({ capacity: globalCapacity, lowerBoundMs: globalCapacityLowerBoundMs }),
    dependencyCriticalPath,
    resourceCapacityLowerBounds,
    minimumFeasibleDurationMs,
    limitingConstraints,
    declaredBudgetMs,
    feasible,
  });
}

export function admitVerificationPlanBudget(plan: any, options: any = {}): any  {
  const estimate: any = estimateVerificationPlan(plan, options);
  if (plan.status === 'blocked' || estimate.feasible !== false) return Object.freeze({ ...plan, estimate });
  return Object.freeze({
    ...plan,
    status: 'blocked',
    diagnostic: Object.freeze({
      code: estimate.missingStepBudgets.length > 0 ? 'verification-step-budget-missing' : 'verification-budget-infeasible',
      message: estimate.missingStepBudgets.length > 0
        ? 'Verification plan contains executable steps without target budgets.'
        : `Verification plan lower bound ${estimate.minimumFeasibleDurationMs}ms exceeds declared budget ${estimate.declaredBudgetMs}ms.`,
      missingStepBudgets: estimate.missingStepBudgets,
      limitingConstraints: estimate.limitingConstraints,
      nextActions: Object.freeze(['Adjust the declared budget or the required execution graph before running verification.']),
    }),
    estimate,
  });
}

export function createVerificationPlan(request: any = {}, steps: any = verificationSteps): any  {
  const validation: any = validateVerificationRegistry(steps);
  if (!validation.ok) throw new Error(`Invalid verification registry:\n${validation.findings.map((item: any) => `${item.step}: ${item.code}${item.value ? ` (${item.value})` : ''}`).join('\n')}`);
  const byId: any = new Map(steps.map((item: any) => [item.id, item]));
  const selected: any = new Set();
  const reasons: any = new Map();
  const paths: any[] = [...new Set((request.paths ?? []).map(normalizeProductPath))];
  const productionOwnerAudit: any = auditProductionOwnerCoverage(paths, steps);
  const profiles: any[] = [...new Set(request.profiles ?? [])];
  const groups: any[] = [...new Set(request.groups ?? [])];
  const stepIds: any[] = [...new Set(request.stepIds ?? [])];
  const versionOnlyPackagePaths: any = new Set((request.versionOnlyPackagePaths ?? []).map(normalizeProductPath));
  const selectionOnlyPaths: any = new Set([
    ...versionOnlyPackagePaths,
    ...(request.selectionOnlyPaths ?? []).map(normalizeProductPath),
  ]);
  const selectionReasons: any = new Map((request.selectionReasons ?? []).map((item: any) => [normalizeProductPath(item.path), item.code]));
  for (const productPath of versionOnlyPackagePaths) {
    if (!paths.includes(productPath)) throw new Error(`Version-only package path is not part of the changed paths: ${productPath}`);
    if (!['package.json', 'package-lock.json'].includes(productPath)) throw new Error(`Invalid version-only package path: ${productPath}`);
  }
  for (const productPath of selectionOnlyPaths) {
    if (!paths.includes(productPath)) throw new Error(`Selection-only metadata path is not part of the changed paths: ${productPath}`);
    if (!VERIFICATION_SELECTION_METADATA_INPUTS.includes(productPath)) throw new Error(`Invalid selection-only metadata path: ${productPath}`);
  }
  for (const [productPath, code] of selectionReasons) {
    if (!selectionOnlyPaths.has(productPath)) throw new Error(`Selection reason path is not classified as selection-only: ${productPath}`);
    if (typeof code !== 'string' || code.length === 0) throw new Error(`Invalid selection reason code for path: ${productPath}`);
  }
  const fullScopeMatches: any = paths.filter((productPath: any) => !selectionOnlyPaths.has(productPath)).flatMap((productPath: any) => VERIFICATION_FULL_SCOPE_AUTHORITIES
    .filter((authority: any) => matchesInput(productPath, authority.pattern))
    .map((authority: any) => ({ productPath, authority })));
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
  const unmatchedPaths: any[] = [];
  const delegatedPaths: any[] = [];
  const mappedPaths: any[] = [];
  const ignoredPaths: any[] = [];
  for (const productPath of paths) {
    const matched: any = steps.filter((item: any) => matchedStepInput(item, productPath));
    const releaseOwners: any = steps
      .filter((item: any) => item.testing?.primaryIntent === 'Delivery / Release' && ownedStepInput(item, productPath))
      .map((item: any) => item.id);
    const delegatedOwners: any = VERIFICATION_DELEGATED_INPUTS
      .filter((item: any) => item.inputs.some((pattern: any) => matchesInput(productPath, pattern)))
      .map((item: any) => item.owner);
    if (matched.length > 0) mappedPaths.push(Object.freeze({ path: productPath, owners: Object.freeze(matched.map((item: any) => item.id)) }));
    else if (releaseOwners.length > 0) delegatedPaths.push(Object.freeze({ path: productPath, owners: Object.freeze(['product.candidate-release']) }));
    else if (delegatedOwners.length > 0) delegatedPaths.push(Object.freeze({ path: productPath, owners: Object.freeze(delegatedOwners) }));
    else if (VERIFICATION_IGNORED_INPUTS.some((pattern: any) => matchesInput(productPath, pattern))) ignoredPaths.push(productPath);
    else unmatchedPaths.push(productPath);
    for (const item of matched) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), `${productPath} matches ${matchedStepInput(item, productPath)}`]);
    }
  }
  const fallbackPaths: any = [...new Set([...unmatchedPaths, ...productionOwnerAudit.gaps.map((item: any) => item.path)])].sort();
  const fullScopeReasons: any[] = [
    ...fullScopeMatches.map(({ productPath, authority }: any) => ({
      code: authority.code,
      path: productPath,
      pattern: authority.pattern,
      explanation: authority.explanation,
      owners: Object.freeze([authority.pattern]),
      message: `${productPath} matches full-scope owner ${authority.pattern}: ${authority.explanation}`,
    })),
  ];
  if (fullScopeReasons.length > 0) {
    for (const item of steps) if (item.profiles.includes('core')) {
      selected.add(item.id);
      reasons.set(item.id, [...(reasons.get(item.id) ?? []), ...fullScopeReasons.map((reason: any) => reason.message)]);
    }
  }
  expandDependencies(selected, byId, reasons);
  const orderedIds: any = topologicalOrder(selected, steps);
  const scopeMode: any = fullScopeReasons.length > 0 || profiles.some((profile: any) => ['core', 'candidate'].includes(profile))
    ? 'full'
    : (mappedPaths.length > 0 || selectionOnlyPaths.size > 0)
      ? 'affected'
      : (profiles.length > 0 || groups.length > 0 || stepIds.length > 0)
        ? 'explicit'
        : 'not-applicable';
  const scopeReasons: any[] = [
    ...fullScopeReasons.map(({ message: _message, ...reason }: any) => Object.freeze(reason)),
    ...(scopeMode === 'affected' ? mappedPaths
      .filter((item: any) => !selectionOnlyPaths.has(item.path))
      .map((item: any) => Object.freeze({ code: 'affected-owner', path: item.path, owners: item.owners })) : []),
    ...[...selectionOnlyPaths].map((productPath: any) => Object.freeze({
      code: selectionReasons.get(productPath) ?? (versionOnlyPackagePaths.has(productPath) ? 'version-only-package-metadata' : 'selection-metadata-change'),
      path: productPath,
      owners: Object.freeze(mappedPaths.find((item: any) => item.path === productPath)?.owners ?? []),
    })),
  ];
  if (fallbackPaths.length > 0) {
    return Object.freeze({
      status: 'blocked',
      diagnostic: Object.freeze({
        code: 'verification-owner-gap',
        message: 'Product changed paths require explicit verification ownership before execution.',
        unmapped: Object.freeze([...unmatchedPaths].sort()),
        productionOwnerGaps: productionOwnerAudit.gaps,
        nextActions: Object.freeze(['Add or repair ownership declarations for every reported path, then regenerate the plan.']),
      }),
      paths: Object.freeze(paths),
      profiles: Object.freeze(profiles),
      groups: Object.freeze(groups),
      stepIds: Object.freeze(stepIds),
      scope: Object.freeze({ mode: 'blocked', reasons: Object.freeze(scopeReasons) }),
      delegated: Object.freeze(delegatedPaths),
      ignored: Object.freeze(ignoredPaths),
      unmapped: Object.freeze(unmatchedPaths),
      productionOwnerGaps: productionOwnerAudit.gaps,
      steps: Object.freeze([]),
    });
  }
  return Object.freeze({
    status: 'ready',
    diagnostic: null,
    paths: Object.freeze(paths),
    profiles: Object.freeze(profiles),
    groups: Object.freeze(groups),
    stepIds: Object.freeze(stepIds),
    scope: Object.freeze({ mode: scopeMode, reasons: Object.freeze(scopeReasons) }),
    delegated: Object.freeze(delegatedPaths),
    ignored: Object.freeze(ignoredPaths),
    unmapped: Object.freeze(unmatchedPaths),
    productionOwnerGaps: productionOwnerAudit.gaps,
    steps: Object.freeze(orderedIds.map((id: any) => Object.freeze({ ...byId.get(id), reasons: Object.freeze(reasons.get(id) ?? []) }))),
  });
}

export function createDevelopmentPlatformPlan(request: any = {}, steps: any = verificationSteps): any  {
  const validation: any = validateVerificationRegistry(steps);
  if (!validation.ok) throw new Error(`Invalid verification registry:\n${validation.findings.map((item: any) => `${item.step}: ${item.code}`).join('\n')}`);
  const runner: any = request.runner;
  if (!VERIFICATION_DEVELOPMENT_RUNNERS.includes(runner)) throw new Error(`Unknown development verification runner: ${runner}`);
  const paths: any[] = [...new Set((request.paths ?? []).map(normalizeProductPath))];
  const matchedReasons: any = new Map();
  for (const item of steps) {
    if (!item.developmentRunners.includes(runner)) continue;
    const matched: any = paths.filter((productPath: any) => item.inputs.some((pattern: any) => matchesInput(productPath, pattern))
      && !(item.inputExclusions ?? []).some((pattern: any) => matchesInput(productPath, pattern)));
    if (matched.length > 0) matchedReasons.set(item.id, matched.map((productPath: any) => `${productPath} matches ${runner} development owner ${item.id}`));
  }
  const base: any = createVerificationPlan({ stepIds: [...matchedReasons.keys()] }, steps);
  return Object.freeze({
    ...base,
    source: 'development-platform',
    runner,
    paths: Object.freeze(paths),
    steps: Object.freeze(base.steps.map((item: any) => Object.freeze({
      ...item,
      reasons: Object.freeze([...(item.reasons ?? []), ...(matchedReasons.get(item.id) ?? [])]),
    }))),
  });
}

export function createVerificationAdmissionPlan(plan: any, steps: any = verificationSteps): any  {
  if (plan.steps.length === 0) return Object.freeze({ ...plan, admissionStepIds: Object.freeze([]) });
  const fastPlan: any = createVerificationPlan({ profiles: ['fast'] }, steps);
  const admissionStepIds: any[] = [...new Set([
    ...fastPlan.steps.map((item: any) => item.id),
    ...plan.steps.filter((item: any) => item.admission === true).map((item: any) => item.id),
  ])];
  const admissionIds: any = new Set(admissionStepIds);
  const merged: any = new Map();
  for (const item of [...fastPlan.steps, ...plan.steps]) {
    const existing: any = merged.get(item.id);
    merged.set(item.id, Object.freeze({
      ...(existing ?? item),
      ...item,
      reasons: Object.freeze([...new Set([...(existing?.reasons ?? []), ...(item.reasons ?? [])])]),
    }));
  }
  const orderedIds: any[] = [
    ...admissionStepIds,
    ...plan.steps.map((item: any) => item.id).filter((id: any) => !admissionIds.has(id)),
  ];
  const composedSteps: any = orderedIds.map((id: any) => {
    const item: any = merged.get(id);
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

export function createCandidateCiShardPlan(shardId: any, options: any = {}, steps: any = verificationSteps): any  {
  const validation: any = validateCandidateCiCoverage(steps);
  if (!validation.ok) throw new Error(`Invalid Candidate CI coverage:\n${validation.findings.map((item: any) => `${item.step}: ${item.code}`).join('\n')}`);
  const shard: any = CANDIDATE_CI_SHARDS.find((item: any) => item.id === shardId);
  if (!shard) throw new Error(`Unknown Candidate CI shard: ${shardId}`);
  if (shard.requiresArtifact && options.externalArtifact !== true) throw new Error(`Candidate CI shard ${shardId} requires an external candidate artifact`);
  const plan: any = createVerificationPlan({ stepIds: shard.stepIds }, steps);
  const primary: any = new Set(shard.stepIds);
  const projectedSteps: any[] = [];
  for (const item of plan.steps) {
    if (!primary.has(item.id) && item.id !== 'candidate-tarball') {
      throw new Error(`Candidate CI shard ${shardId} has an undeclared cross-shard dependency: ${item.id}`);
    }
    if (item.id === 'candidate-tarball' && !primary.has(item.id) && options.externalArtifact === true) continue;
    projectedSteps.push(Object.freeze({
      ...item,
      dependsOn: Object.freeze((item.dependsOn ?? []).filter((dependency: any) => !(dependency === 'candidate-tarball' && options.externalArtifact === true))),
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
