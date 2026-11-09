import crypto from 'node:crypto';

/** The maintainer's explicit, recorded decision about this Candidate round.
 * A declaration can only remove checks from execution; it never manufactures
 * a pass. Missing evidence that was not declared here still fails the round. */
export const CANDIDATE_DECLARED_SCOPE_ENV = 'BUILDR_CANDIDATE_VERIFICATION_SCOPE';
export const CANDIDATE_DECLARED_SCOPE_SCHEMA = 'buildr.candidate-declared-scope/v1';
export const CANDIDATE_SCOPE_BOUNDARIES = Object.freeze(['Static', 'Unit', 'Integration', 'E2E'] as const);

const digest = (value: unknown): string => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const EVIDENCE_ID = /^[a-z0-9][a-z0-9-]*$/u;

export function parseCandidateDeclaredScope(encoded: string | null | undefined): any {
  if (!encoded?.trim()) return null;
  let input: any;
  try { input = JSON.parse(encoded); }
  catch { throw new Error('Candidate verification scope must be a JSON object.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Candidate verification scope must be a JSON object.');
  const boundaries = input.excludedBoundaries ?? [];
  const evidence = input.excludedEvidenceIds ?? [];
  const steps = input.excludedStepIds ?? [];
  if (!Array.isArray(boundaries) || boundaries.some((value: any) => !(CANDIDATE_SCOPE_BOUNDARIES as readonly string[]).includes(value))) {
    throw new Error(`Candidate verification scope names an unknown execution boundary. Known boundaries: ${CANDIDATE_SCOPE_BOUNDARIES.join(', ')}.`);
  }
  if (!Array.isArray(evidence) || evidence.some((value: any) => typeof value !== 'string' || !EVIDENCE_ID.test(value))) {
    throw new Error('Candidate verification scope has an invalid evidence id.');
  }
  if (!Array.isArray(steps) || steps.some((value: any) => typeof value !== 'string' || !/^[a-z0-9][a-z0-9:-]*$/u.test(value))) {
    throw new Error('Candidate verification scope has an invalid step id.');
  }
  const statement = typeof input.statement === 'string' ? input.statement.trim() : '';
  if (!statement) throw new Error('Candidate verification scope requires the user instruction statement.');
  const body = {
    schemaVersion: CANDIDATE_DECLARED_SCOPE_SCHEMA,
    declaredBy: 'user-instruction',
    statement,
    excludedBoundaries: [...new Set<string>(boundaries)].sort(),
    excludedEvidenceIds: [...new Set<string>(evidence)].sort(),
    excludedStepIds: [...new Set<string>(steps)].sort(),
  };
  return { ...body, identity: digest(body) };
}

/** Exclusions are applied per registered step. Candidate shard steps have no
 * intra-shard prerequisites, so a shard can run its remaining steps while the
 * declared checks stay unexecuted and are recorded as such. A shard with no
 * remaining steps is not scheduled at all. */
export function applyCandidateDeclaredScope(input: {
  scope: any;
  shards: readonly any[];
  hostNodeTuples: readonly any[];
  executionBoundaryOf: (stepId: string) => string | undefined;
}): {
  shards: any[];
  hostNodeTuples: any[];
  notRun: { evidenceIds: string[]; stepIds: string[]; declaredExcludedStepIds: string[]; collateralStepIds: string[] };
} {
  const { scope } = input;
  if (!scope) return {
    shards: [...input.shards],
    hostNodeTuples: [...input.hostNodeTuples],
    notRun: { evidenceIds: [], stepIds: [], declaredExcludedStepIds: [], collateralStepIds: [] },
  };
  const known = new Set([...input.shards.map((item: any) => item.id), ...input.hostNodeTuples.map((item: any) => item.id)]);
  const unknown = scope.excludedEvidenceIds.filter((id: string) => !known.has(id));
  if (unknown.length) throw new Error(`Candidate verification scope names unknown evidence: ${unknown.sort().join(', ')}.`);
  const excludedBoundaries = new Set<string>(scope.excludedBoundaries);
  const explicitSteps = new Set<string>(scope.excludedStepIds);
  const declaredEvidence = new Set<string>(scope.excludedEvidenceIds);
  const evidenceIds: string[] = [];
  const stepIds: string[] = [];
  const declaredExcludedStepIds: string[] = [];
  const collateralStepIds: string[] = [];
  const shards: any[] = [];
  for (const shard of input.shards) {
    const excludedSteps = shard.stepIds.filter((stepId: string) => explicitSteps.has(stepId)
      || excludedBoundaries.has(input.executionBoundaryOf(stepId) ?? ''));
    if (declaredEvidence.has(shard.id)) {
      evidenceIds.push(shard.id);
      stepIds.push(...shard.stepIds);
      declaredExcludedStepIds.push(...shard.stepIds);
      continue;
    }
    const remaining = shard.stepIds.filter((stepId: string) => !excludedSteps.includes(stepId));
    if (remaining.length === 0) {
      evidenceIds.push(shard.id);
      stepIds.push(...shard.stepIds);
      declaredExcludedStepIds.push(...shard.stepIds);
      continue;
    }
    if (excludedSteps.length > 0) {
      stepIds.push(...excludedSteps);
      declaredExcludedStepIds.push(...excludedSteps);
    }
    shards.push(remaining.length === shard.stepIds.length ? shard : { ...shard, stepIds: remaining });
  }
  const hostNodeTuples = input.hostNodeTuples.filter((tuple: any) => {
    if (!declaredEvidence.has(tuple.id)) return true;
    evidenceIds.push(tuple.id);
    return false;
  });
  return {
    shards,
    hostNodeTuples,
    notRun: {
      evidenceIds: [...new Set(evidenceIds)].sort(),
      stepIds: [...new Set(stepIds)].sort(),
      declaredExcludedStepIds: [...new Set(declaredExcludedStepIds)].sort(),
      collateralStepIds: [...new Set(collateralStepIds)].sort(),
    },
  };
}
