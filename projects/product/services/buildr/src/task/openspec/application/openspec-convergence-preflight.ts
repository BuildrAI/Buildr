import type { ConvergenceContext } from './openspec-converge.ts';
import type { ConvergencePlan, ConvergenceBlocker, ExecutableIdentity, ExecutionEvidence, ExecutionStep } from './convergence-model.ts';
import type { CanonicalSnapshot } from './convergence-planner.ts';
export type ActiveChangeObservation = { change: string; status: string; deltaDigest: string | null; diagnosticCode: string | null };
type CanonicalObservation = { identity: string; files: { path: string; digest: string }[] };
type PreflightInput = { context: ConvergenceContext; executableIdentity: ExecutableIdentity; capabilityPurposes?: Map<string, string>; activeConflicts?: ConvergenceBlocker[]; activeChanges?: ActiveChangeObservation[]; canonicalFiles: Map<string, CanonicalSnapshot>; canonicalObservation: CanonicalObservation; validateProjected(input: { files: { path: string; content: string; exists: boolean }[] }): ExecutionEvidence; startedAt?: number; commandCountOffset?: number };
import { createConvergencePlan } from './convergence-planner.ts';
import { CONVERGENCE_ALGORITHM_VERSION, convergenceDigest } from './convergence-model.ts';

const IDENTITY_CONFLICT_CODES = new Set([
  'added-identity-conflict',
  'requirement-not-unique',
  'rename-not-unique',
]);

export function openSpecPreflightBlockerCategory(blocker: ConvergenceBlocker) {
  if (blocker.code === 'active-change-conflict' || String(blocker.code || '').startsWith('openspec_contract.active_change')) return 'active-change-conflict';
  if (blocker.reason === 'scenario-identities-omitted') return 'scenario-omission';
  if (IDENTITY_CONFLICT_CODES.has(blocker.code)) return 'identity-conflict';
  if (blocker.code === 'semantic-resolution-required' && blocker.operation !== 'CREATE_CAPABILITY') return 'identity-conflict';
  return 'semantic-resolution-required';
}

function portableActiveChanges(activeChanges: ActiveChangeObservation[]) {
  return [...activeChanges]
    .map((item) => ({
      change: item.change,
      status: item.status,
      deltaDigest: item.deltaDigest || null,
      diagnosticCode: item.diagnosticCode || null,
    }))
    .sort((left, right) => left.change.localeCompare(right.change));
}

export function openSpecReadinessIdentity({ plan, activeChanges, canonicalObservation }: { plan: ConvergencePlan; activeChanges: ActiveChangeObservation[]; canonicalObservation: CanonicalObservation }) {
  return convergenceDigest({
    schemaVersion: 'buildr.openspec-convergence-preflight-identity/v1',
    algorithmVersion: CONVERGENCE_ALGORITHM_VERSION,
    change: plan.change,
    project: plan.project,
    planIdentity: plan.planIdentity,
    deltaDigest: plan.deltaDigest,
    executableIdentity: plan.executableIdentity,
    canonicalObservationIdentity: canonicalObservation.identity,
    activeChanges: portableActiveChanges(activeChanges),
  });
}

export function runOpenSpecConvergencePreflight({
  context,
  executableIdentity,
  capabilityPurposes,
  activeConflicts = [],
  activeChanges = [],
  canonicalFiles,
  canonicalObservation,
  validateProjected,
  startedAt = Date.now(),
  commandCountOffset = 0,
}: PreflightInput) {
  const planStartedAt = Date.now();
  const plan = createConvergencePlan({
    change: context.change,
    project: context.project,
    delta: context.delta,
    canonicalFiles,
    capabilityPurposes,
    executableIdentity,
    activeConflicts,
  });
  const execution: ExecutionStep[] = commandCountOffset > 0 ? [{
    id: 'input-observation',
    status: 'passed',
    durationMs: 0,
    commandCount: commandCountOffset,
  }] : [];
  execution.push({
    id: 'plan',
    status: plan.status === 'blocked' ? 'blocked' : 'passed',
    durationMs: Date.now() - planStartedAt,
    commandCount: 0,
  });
  let validation: ExecutionEvidence | null = null;
  let blockers: (ConvergenceBlocker & { category: string; diagnostic?: unknown })[] = plan.blocked.map((item) => ({ category: openSpecPreflightBlockerCategory(item), ...item }));

  if (plan.status !== 'blocked') {
    validation = validateProjected({
      files: plan.files.map((item) => ({
        path: item.path,
        content: item.expectedContent,
        exists: item.expectedExists !== false,
      })),
    });
    execution.push({
      id: 'projected-validation',
      status: validation.status,
      code: validation.code || null,
      durationMs: validation.durationMs || 0,
      commandCount: validation.commandCount || 0,
    });
    if (validation.status !== 'passed') {
      blockers = [{
        category: 'projected-validation',
        code: validation.code || 'projected-strict-validation-failed',
        diagnostic: validation.diagnostic || null,
      }];
    }
  }

  const status = blockers.length === 0 ? 'ready' : 'blocked';
  const observedActiveChanges = portableActiveChanges(activeChanges);
  return {
    status,
    change: context.change,
    project: context.project,
    readinessIdentity: openSpecReadinessIdentity({ plan, activeChanges: observedActiveChanges, canonicalObservation }),
    convergenceIdentity: plan.convergenceIdentity,
    planIdentity: plan.planIdentity,
    deltaDigest: plan.deltaDigest,
    algorithmVersion: CONVERGENCE_ALGORITHM_VERSION,
    executableIdentity,
    activeChanges: observedActiveChanges,
    canonicalObservation: {
      identity: canonicalObservation.identity,
      fileCount: canonicalObservation.files.length,
    },
    canonicalFiles: plan.files.map((item) => ({
      path: item.path,
      beforeExists: item.beforeExists,
      beforeDigest: item.beforeDigest,
    })),
    operations: plan.operations,
    blockers,
    validation,
    durationMs: Date.now() - startedAt,
    commandCount: execution.reduce((sum, item) => sum + (item.commandCount || 0), 0),
    execution,
    effects: [],
    nextActions: status === 'ready'
      ? ['可以进入实施；是否执行方案审查由Agent按当前目标和真实OpenSpec产物独立判断。最终converge仍会按最新事实重新检查。']
      : ['由Agent处理列出的OpenSpec语义或active Change依赖后，重新运行strict validation与preflight。'],
  };
}
