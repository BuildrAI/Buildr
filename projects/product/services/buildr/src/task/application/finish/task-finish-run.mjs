import crypto from 'node:crypto';
import path from 'node:path';

import { TASK_RETROSPECTIVE_PROMPT } from '../task-retrospective-application.mjs';
import { compactTaskFinishFailure } from './execution-record.mjs';
import { publicTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';
import {
  createTaskFinishRepositoryStates,
  normalizeTaskFinishRepositorySet,
  singletonApplicableTaskFinishRepository,
  singletonTaskFinishRepositoryState,
  taskFinishCarrierSetIdentity,
  taskFinishDeliverySetIdentity,
  taskFinishRepositorySetIdentity,
} from './task-finish-repository-set.mjs';

export const LEGACY_FINISH_RUN_SCHEMA = 'buildr.task-finish-run/v2';
export const FINISH_RUN_SCHEMA = 'buildr.task-finish-run/v3';
export const FINISH_RESULT_SCHEMA = 'buildr.task-finish-result/v3';
export const FINISH_PHASES = Object.freeze(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
export const FINISH_PHASE_STATUSES = Object.freeze(['pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable']);

const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now(clock) {
  return new Date(clock()).toISOString();
}

function sha256(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

export function resolvedFinishContext(identity) {
  const repositories = (identity.repositories || []).map((repository) => ({
    selector: repository.selector,
    disposition: repository.disposition,
    targetBranch: repository.targetBranch,
    remote: repository.remote,
    repositoryIdentity: repository.repositoryIdentity,
    leaseTargetIdentity: repository.leaseTargetIdentity,
  }));
  const context = {
    capability: { id: 'buildr.task-finish', version: 1 },
    task: { taskId: identity.task },
    handoff: { identity: identity.handoffIdentity },
    candidate: {
      identity: identity.candidateIdentity,
      generation: identity.candidateGeneration,
      contentTargetIdentity: identity.contentTargetIdentity,
    },
    delivery: {
      agent: identity.agent,
      targetBranch: identity.targetBranch,
      remote: identity.remote || null,
      repositorySetIdentity: identity.repositorySetIdentity || null,
      repositories,
    },
  };
  return { ...context, identity: sha256(context) };
}

function requireTaskFinishRuntime(runtime, operation) {
  if (!runtime) throw new Error(`Task Finish ${operation} requires the Workspace SQLite runtime.`);
  return runtime;
}

export function acquireFinishTargetLease({ run, root = null, runtime = null, targetIdentity = null, clock = Date.now }) {
  return requireTaskFinishRuntime(runtime, 'target lease').acquireTaskFinishTargetLease(
    root || run.identity.workspaceRoot,
    { run, targetIdentity: targetIdentity || run.identity.targetBranch, clock },
  );
}

export function releaseFinishTargetLease(lease, { root = null, runtime = null } = {}) {
  if (!lease?.token) return;
  requireTaskFinishRuntime(runtime, 'target lease').releaseTaskFinishTargetLease(root || lease?.value?.workspaceRoot || process.cwd(), lease);
}

export function writeFinishCompletion({ root, runId, completion, runtime = null }) {
  const persisted = requireTaskFinishRuntime(runtime, 'completion persistence').writeTaskFinishCompletionPersistence(root, {
    taskId: completion?.task || completion?.identity?.task,
    runId,
    result: completion,
    status: completion?.status === 'complete' ? 'complete' : 'cleanup_pending',
  });
  return persisted?.file || persisted;
}

export function readFinishCompletion({ root, runId, runtime = null }) {
  return requireTaskFinishRuntime(runtime, 'completion persistence').readTaskFinishCompletionPersistence(root, { runId }, { optional: true })?.completion || null;
}

function phase(id) {
  return {
    id,
    status: 'pending',
    attempts: 0,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    inputIdentity: null,
    outputIdentity: null,
    checks: [],
    operations: [],
    observations: [],
    output: null,
    failure: null,
  };
}

function normalizeIdentity(input) {
  const required = ['task', 'handoffIdentity', 'candidateIdentity', 'contentTargetIdentity', 'agent', 'environmentRoot', 'workspaceRoot'];
  for (const field of required) {
    if (typeof input?.[field] !== 'string' || !input[field].trim()) throw new Error(`Task Finish requires ${field}.`);
  }
  if (!Number.isInteger(input.candidateGeneration) || input.candidateGeneration < 1) throw new Error('Task Finish requires candidateGeneration.');
  const repositories = Array.isArray(input.repositories) && input.repositories.length
    ? normalizeTaskFinishRepositorySet(input.repositories)
    : [];
  const singleton = repositories.length ? singletonApplicableTaskFinishRepository({ repositories }) : null;
  const repositorySetIdentity = repositories.length ? taskFinishRepositorySetIdentity(repositories) : null;
  if (input.repositorySetIdentity && input.repositorySetIdentity !== repositorySetIdentity) throw new Error('Task Finish repository set identity does not match its repositories.');
  return {
    task: input.task,
    handoffIdentity: input.handoffIdentity,
    candidateIdentity: input.candidateIdentity,
    candidateGeneration: input.candidateGeneration,
    contentTargetIdentity: input.contentTargetIdentity,
    agent: input.agent,
    targetBranch: singleton?.targetBranch || (typeof input.targetBranch === 'string' && input.targetBranch.trim() ? input.targetBranch : null),
    remote: singleton?.remote || (typeof input.remote === 'string' && input.remote.trim() ? input.remote : null),
    repositories,
    repositorySetIdentity,
    environmentRoot: path.resolve(input.environmentRoot),
    workspaceRoot: path.resolve(input.workspaceRoot),
    deliveryCommitIdentity: typeof input.deliveryCommitIdentity === 'string' && input.deliveryCommitIdentity ? input.deliveryCommitIdentity : null,
  };
}

function generateRunId(identity, clock) {
  const stamp = new Date(clock()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${identity.task}-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeDevelopmentHandoff(handoff, identity) {
  if (handoff == null) return null;
  const matches = handoff?.identity === identity.handoffIdentity
    && handoff?.candidate?.identity === identity.candidateIdentity
    && handoff?.candidate?.generation === identity.candidateGeneration
    && handoff?.candidate?.contentTargetIdentity === identity.contentTargetIdentity;
  if (!matches) {
    const error = new Error('Task Finish Development handoff snapshot does not match the run identity.');
    Object.assign(error, { code: 'task_finish.development_handoff_identity_mismatch' });
    throw error;
  }
  return clone(handoff);
}

function currentRunIdentityConflict(current, normalized) {
  const error = new Error(`Task ${normalized.task} already has a current Finish run with a different identity.`);
  Object.assign(error, {
    code: 'task_finish.current_run_identity_conflict',
    details: {
      taskId: normalized.task,
      currentRunId: current.run.runId,
      currentIdentityDigest: current.run.identityDigest,
      requestedIdentityDigest: sha256(normalized),
    },
  });
  return error;
}

export function createFinishRun({ root, identity, deliveryCommit = null, developmentHandoff = null, runId = null, clock = Date.now, runtime = null }) {
  if (deliveryCommit?.identity && identity?.deliveryCommitIdentity && deliveryCommit.identity !== identity.deliveryCommitIdentity) throw new Error('Task Finish delivery commit identity does not match the run identity.');
  const normalized = normalizeIdentity({
    ...identity,
    deliveryCommitIdentity: deliveryCommit?.identity || identity?.deliveryCommitIdentity || null,
  });
  const actualRunId = runId || generateRunId(normalized, clock);
  const sqlite = requireTaskFinishRuntime(runtime, 'run persistence');
  const current = sqlite.readTaskFinishRunPersistence(root, { taskId: normalized.task }, { optional: true });
  if (current) {
    if (current.run.identityDigest !== sha256(normalized)) throw currentRunIdentityConflict(current, normalized);
    return current.run;
  }
  const createdAt = now(clock);
  return clone({
    schemaVersion: FINISH_RUN_SCHEMA,
    runId: actualRunId,
    status: 'active',
    identity: normalized,
    identityDigest: sha256(normalized),
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    invocations: 0,
    productCommandObservations: 0,
    deliveryCommit: clone(deliveryCommit),
    developmentHandoff: normalizeDevelopmentHandoff(developmentHandoff, normalized),
    repositories: normalized.repositories.length ? createTaskFinishRepositoryStates(normalized.repositories) : [],
    deliveryCarrier: null,
    equivalence: null,
    delivery: null,
    completion: null,
    resume: null,
    primaryFailure: null,
    phases: FINISH_PHASES.map(phase),
  });
}

export function readFinishRun({ root, runId, runtime = null }) {
  const current = requireTaskFinishRuntime(runtime, 'run persistence').readTaskFinishRunPersistence(root, { runId }, { optional: true });
  if (!current) throw new Error(`Unknown Task Finish run: ${runId}`);
  return current.run;
}

function writeRun(root, run, clock, runtime = null) {
  run.updatedAt = now(clock);
  requireTaskFinishRuntime(runtime, 'run persistence').writeTaskFinishRunPersistence(root, run);
}

function resumableRunCandidates(root, identity, runtime = null) {
  const current = requireTaskFinishRuntime(runtime, 'run persistence').readTaskFinishRunPersistence(root, { taskId: identity.task }, { optional: true });
  return ['blocked', 'cleanup_pending'].includes(current?.run?.status) && current.run.identityDigest === sha256(normalizeIdentity(identity)) ? [current.run] : [];
}

export function resolveFinishRun({ root, identity, deliveryCommit = null, developmentHandoff = null, runId = null, resumeToken = null, clock = Date.now, runtime = null }) {
  if (runId) {
    const run = readFinishRun({ root, runId, runtime });
    if (run.identityDigest !== sha256(normalizeIdentity(identity))) throw currentRunIdentityConflict({ run }, normalizeIdentity(identity));
    if (resumeToken && run.resume?.token !== resumeToken) throw new Error('Task Finish resume token does not match the current blocked state.');
    return run;
  }
  const reusable = resumableRunCandidates(root, identity, runtime).find((run) => !resumeToken || run.resume?.token === resumeToken);
  return reusable || createFinishRun({ root, identity, deliveryCommit, developmentHandoff, clock, runtime });
}

function normalizeFailure(value, phaseId, fallbackCode = 'task-finish.phase-failed') {
  const failure = value && typeof value === 'object' ? clone(value) : {};
  return {
    phase: phaseId,
    origin: failure.origin || null,
    operation: failure.operation || failure.check || null,
    check: failure.check || null,
    failureClass: failure.failureClass || 'product-execution-failure',
    code: failure.code || fallbackCode,
    status: failure.status || 'failed',
    exitCode: Number.isInteger(failure.exitCode) ? failure.exitCode : null,
    message: failure.message || 'Task Finish phase failed.',
    findings: Array.isArray(failure.findings) ? failure.findings.slice(0, 20) : [],
    diagnostic: failure.diagnostic || null,
  };
}

function normalizePhaseResult(result, phaseId) {
  const value = result && typeof result === 'object' ? result : {};
  const status = FINISH_PHASE_STATUSES.includes(value.status) ? value.status : 'failed';
  return {
    status,
    checks: Array.isArray(value.checks) ? value.checks : [],
    operations: Array.isArray(value.operations) ? value.operations : [],
    observations: Array.isArray(value.observations) ? value.observations : [],
    output: value.output ?? null,
    inputIdentity: value.inputIdentity || null,
    outputIdentity: value.outputIdentity || null,
    failure: ['blocked', 'failed'].includes(status)
      ? normalizeFailure(value.failure, phaseId, status === 'blocked' ? 'task-finish.phase-blocked' : 'task-finish.phase-failed')
      : null,
  };
}

function resumeTokenFor(run, phaseId, failure) {
  return sha256({
    schemaVersion: FINISH_RUN_SCHEMA,
    runId: run.runId,
    identity: run.identityDigest,
    carrier: taskFinishCarrierSetIdentity(run.repositories) || run.deliveryCarrier?.identity || null,
    activationPlan: run.deliveryCarrier?.activationPlan?.identity || run.delivery?.activation?.plan?.identity || null,
    phase: phaseId,
    failure: { code: failure.code, operation: failure.operation, diagnostic: failure.diagnostic?.digest || null },
  });
}

function applyPhaseOutput(run, phaseId, output) {
  if (Array.isArray(output?.repositories)) {
    const expected = new Set((run.identity.repositories || []).map((repository) => repository.selector));
    const received = new Set(output.repositories.map((repository) => repository.selector));
    if (expected.size !== received.size || [...expected].some((selector) => !received.has(selector))) {
      throw new Error('Task Finish phase repository output does not match the frozen repository set.');
    }
    run.repositories = clone(output.repositories).sort((left, right) => left.selector.localeCompare(right.selector));
    const singleton = singletonTaskFinishRepositoryState(run);
    run.deliveryCarrier = singleton?.deliveryCarrier || null;
    run.equivalence = singleton?.equivalence || null;
    run.delivery = singleton?.delivery || null;
  }
  if (phaseId === 'prepare' && output?.deliveryCarrier) run.deliveryCarrier = clone(output.deliveryCarrier);
  if (phaseId === 'verify' && output?.equivalence) run.equivalence = clone(output.equivalence);
  if (phaseId === 'deliver' && output?.delivery) run.delivery = clone(output.delivery);
  if (phaseId === 'cleanup' && output?.completion) run.completion = clone(output.completion);
}

function resetTargetRaceCarrierPhases(run) {
  const targetRace = run.status === 'blocked'
    && run.primaryFailure?.code === 'task-finish.target-race';
  if (!targetRace) return false;
  const reset = new Set(['prepare', 'verify', 'deliver', 'cleanup']);
  for (const item of run.phases) {
    if (!reset.has(item.id)) continue;
    item.status = 'pending';
    item.startedAt = null;
    item.completedAt = null;
    item.inputIdentity = null;
    item.outputIdentity = null;
    item.checks = [];
    item.operations = [];
    item.observations = [];
    item.output = null;
    item.failure = null;
  }
  for (const repository of run.repositories || []) {
    repository.deliveryCarrier = null;
    repository.equivalence = null;
    repository.delivery = null;
    repository.cleanupProof = null;
  }
  run.deliveryCarrier = null;
  run.equivalence = null;
  run.delivery = null;
  run.completion = null;
  return true;
}

function compactStoredPhaseDiagnostics(run) {
  for (const item of run.phases) {
    item.checks = [];
    item.operations = [];
    item.observations = [];
    item.output = null;
    item.failure = compactTaskFinishFailure(item.failure, item.id);
  }
}

function failureRepositorySelector(failure) {
  return (failure?.findings || []).find((finding) => typeof finding?.selector === 'string')?.selector || null;
}

function selectedRepositoryState(run, failure = run.primaryFailure) {
  const applicable = (run.identity.repositories || []).filter((repository) => repository.disposition === 'applicable');
  const failureSelector = failureRepositorySelector(failure);
  if (failureSelector) return (run.repositories || []).find((repository) => repository.selector === failureSelector) || null;
  const workspace = applicable.find((repository) => repository.selector === 'workspace');
  if (workspace) return (run.repositories || []).find((repository) => repository.selector === 'workspace') || null;
  return applicable.length === 1
    ? (run.repositories || []).find((repository) => repository.selector === applicable[0].selector) || null
    : null;
}

function resumeCarrierIdentity(run, failure) {
  return selectedRepositoryState(run, failure)?.deliveryCarrier?.identity
    || taskFinishCarrierSetIdentity(run.repositories)
    || run.deliveryCarrier?.identity
    || null;
}

export async function executeFinishRun({ root, run, handlers, resumeToken = null, clock = Date.now, runtime = null, observer = null, bootstrapRecoveryFinalizer = null }) {
  if (![LEGACY_FINISH_RUN_SCHEMA, FINISH_RUN_SCHEMA].includes(run.schemaVersion)) throw new Error('Task Finish executor requires a supported run.');
  if (['failed', 'complete'].includes(run.status)) return finishResult(run, clock);
  if (['blocked', 'cleanup_pending'].includes(run.status) && (!resumeToken || resumeToken !== run.resume?.token)) {
    throw new Error('Task Finish blocked run requires its current product-generated resume token.');
  }
  resetTargetRaceCarrierPhases(run);
  compactStoredPhaseDiagnostics(run);
  run.invocations += 1;
  run.status = 'active';
  run.primaryFailure = null;
  run.resume = null;
  observer?.runOpened?.(clone(run));
  writeRun(root, run, clock, runtime);

  for (const phaseId of FINISH_PHASES) {
    const item = run.phases.find((candidate) => candidate.id === phaseId);
    if (['passed', 'not-applicable'].includes(item.status)) continue;
    if (typeof handlers?.[phaseId] !== 'function') throw new Error(`Task Finish handler is missing: ${phaseId}`);
    item.status = 'running';
    item.attempts += 1;
    item.startedAt = now(clock);
    item.completedAt = null;
    item.failure = null;
    const started = clock();
    observer?.phaseStarted?.({ phase: phaseId, attempt: item.attempts, at: item.startedAt });
    writeRun(root, run, clock, runtime);
    let normalized;
    try {
      normalized = normalizePhaseResult(await handlers[phaseId]({
        root,
        run: clone(run),
        phase: clone(item),
        checkpoint: ({ output = null, inputIdentity = null, outputIdentity = null } = {}) => {
          applyPhaseOutput(run, phaseId, output);
          item.inputIdentity = inputIdentity || item.inputIdentity;
          item.outputIdentity = outputIdentity || item.outputIdentity;
          writeRun(root, run, clock, runtime);
          return clone(run);
        },
      }), phaseId);
    } catch (error) {
      normalized = normalizePhaseResult({
        status: error?.resumable === true ? 'blocked' : 'failed',
        failure: {
          origin: 'product-phase-provider',
          operation: error?.operation || null,
          check: error?.check || null,
          failureClass: error?.failureClass || 'product-execution-failure',
          code: error?.code || 'task-finish.unhandled-error',
          status: 'failed',
          exitCode: error?.exitCode,
          message: error?.message || String(error),
          findings: error?.findings || [],
          diagnostic: error?.diagnostic || null,
        },
      }, phaseId);
    }
    item.status = normalized.status;
    item.completedAt = now(clock);
    const phaseDurationMs = Math.max(0, clock() - started);
    item.durationMs += phaseDurationMs;
    observer?.phaseFinished?.({
      phase: phaseId,
      attempt: item.attempts,
      result: normalized,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      durationMs: phaseDurationMs,
    });
    run.productCommandObservations = (run.productCommandObservations || 0)
      + normalized.operations.filter((entry) => entry?.kind === 'command').length;
    item.inputIdentity = normalized.inputIdentity;
    item.outputIdentity = normalized.outputIdentity;
    applyPhaseOutput(run, phaseId, normalized.output);
    item.checks = [];
    item.operations = [];
    item.observations = [];
    item.output = null;
    item.failure = compactTaskFinishFailure(normalized.failure, phaseId);
    if (normalized.status === 'blocked') {
      run.status = phaseId === 'cleanup' ? 'cleanup_pending' : 'blocked';
      run.primaryFailure = compactTaskFinishFailure(normalized.failure, phaseId);
      run.resume = {
        phase: phaseId,
        token: resumeTokenFor(run, phaseId, normalized.failure),
        generatedAt: now(clock),
        carrierIdentity: resumeCarrierIdentity(run, normalized.failure),
      };
      writeRun(root, run, clock, runtime);
      observer?.finishStopped?.({ status: run.status, at: run.updatedAt });
      return finishResult(run, clock);
    }
    if (normalized.status === 'failed') {
      run.status = 'failed';
      run.primaryFailure = compactTaskFinishFailure(normalized.failure, phaseId);
      run.resume = null;
      writeRun(root, run, clock, runtime);
      observer?.finishStopped?.({ status: run.status, at: run.updatedAt });
      return finishResult(run, clock);
    }
    writeRun(root, run, clock, runtime);
  }
  if (run.bootstrapRecovery && typeof bootstrapRecoveryFinalizer === 'function') {
    try {
      run.bootstrapRecovery = bootstrapRecoveryFinalizer(run);
      writeRun(root, run, clock, runtime);
    } catch (error) {
      run.status = 'cleanup_pending';
      run.completedAt = null;
      run.primaryFailure = normalizeFailure({
        operation: 'bootstrap-recovery-revocation',
        failureClass: 'transient-external-condition',
        code: error.code || 'task-finish.bootstrap-recovery-revocation-failed',
        status: 'blocked',
        message: error.message,
        diagnostic: error.details || null,
      }, 'cleanup');
      run.resume = { phase: 'cleanup', token: resumeTokenFor(run, 'cleanup', run.primaryFailure), generatedAt: now(clock), carrierIdentity: resumeCarrierIdentity(run, run.primaryFailure) };
      writeRun(root, run, clock, runtime);
      observer?.finishStopped?.({ status: run.status, at: run.updatedAt });
      return finishResult(run, clock);
    }
  }
  run.status = 'complete';
  run.completedAt = now(clock);
  run.primaryFailure = null;
  run.resume = null;
  const result = finishResult(run, clock);
  if (runtime?.finalizeTaskFinishPersistence) {
    try {
      runtime.finalizeTaskFinishPersistence(root, { run, result, completion: run.completion });
    } catch (error) {
      run.status = 'complete';
      run.primaryFailure = null;
      run.resume = null;
      run.completion = {
        ...run.completion,
        persistence: { status: 'attention', code: error.code || 'task-finish.finalize-failed', message: error.message, diagnostic: error.details || null },
        maintenance: { ...run.completion?.maintenance, diagnostics: 'attention' },
      };
      try { writeRun(root, run, clock, runtime); } catch { /* return authoritative delivery even when internal persistence remains unavailable */ }
      observer?.finishStopped?.({ status: run.status, at: run.updatedAt });
      return finishResult(run, clock);
    }
    observer?.finishStopped?.({ status: run.status, at: result.completedAt || run.updatedAt });
    return result;
  }
  writeRun(root, run, clock, runtime);
  observer?.finishStopped?.({ status: run.status, at: run.updatedAt });
  return result;
}

function publicPhase(item) {
  return {
    id: item.id,
    status: item.status,
    attempts: item.attempts,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    durationMs: item.durationMs,
    inputIdentity: item.inputIdentity,
    outputIdentity: item.outputIdentity,
    checks: item.checks || [],
    operations: item.operations || [],
    failure: item.failure,
  };
}

export function finishResult(run, clock = Date.now) {
  const phaseDurationMs = run.phases.reduce((total, item) => total + (item.durationMs || 0), 0);
  const commandObservations = run.productCommandObservations || 0;
  const formalVerificationExecutions = 0;
  const retainedOnlyBootstrapResume = Boolean(run.bootstrapRecovery
    && run.status === 'cleanup_pending'
    && run.resume?.phase === 'cleanup'
    && run.phases.every((phase) => ['passed', 'not-applicable'].includes(phase.status)));
  const repositoryResults = clone(run.repositories || []);
  const singletonState = singletonTaskFinishRepositoryState(run);
  const projectedState = selectedRepositoryState(run) || singletonState;
  const workspacePlan = (run.identity.repositories || []).find((repository) => repository.selector === 'workspace' && repository.disposition === 'applicable') || null;
  const projectedIdentity = clone(run.identity);
  if (workspacePlan) {
    projectedIdentity.targetBranch ||= workspacePlan.targetBranch;
    projectedIdentity.remote ||= workspacePlan.remote;
  }
  const carrier = clone(projectedState?.deliveryCarrier || run.deliveryCarrier);
  const adaptationGuidance = carrier?.adaptationGuidance || null;
  if (carrier) delete carrier.adaptationGuidance;
  const deliveryAdaptation = run.status === 'blocked'
    && run.primaryFailure?.code === 'task-finish.delivery-adaptation-required'
    && run.deliveryCommit?.message
    ? {
        expectedCommitMessage: run.deliveryCommit.message,
        preparationHints: clone(adaptationGuidance?.preparationHints || { schemaVersion: 'buildr.task-finish-preparation-hints/v1', steps: [], unavailable: [] }),
      }
    : null;
  const result = {
    schemaVersion: FINISH_RESULT_SCHEMA,
    runId: run.runId,
    status: run.status,
    identity: projectedIdentity,
    resolvedContext: resolvedFinishContext(projectedIdentity),
    handoff: { identity: run.identity.handoffIdentity },
    candidate: { identity: run.identity.candidateIdentity, generation: run.identity.candidateGeneration, contentTargetIdentity: run.identity.contentTargetIdentity },
    deliveryCommit: publicTaskFinishDeliveryCommit(run.deliveryCommit),
    repositorySetIdentity: run.identity.repositorySetIdentity || null,
    carrierSetIdentity: taskFinishCarrierSetIdentity(run.repositories),
    deliverySetIdentity: taskFinishDeliverySetIdentity(run.repositories),
    repositories: repositoryResults,
    carrier,
    phases: run.phases.map(publicPhase),
    primaryFailure: clone(run.primaryFailure),
    resume: clone(run.resume),
    nextWorkflow: run.occupancy?.status === 'released'
      ? null
      : run.status === 'failed'
      ? (run.primaryFailure?.failureClass === 'upstream-candidate-defect' ? 'task-development' : 'task-finish-investigation')
      : null,
    nextAction: run.occupancy?.status === 'released'
      ? null
      : ['blocked', 'cleanup_pending'].includes(run.status)
      ? (retainedOnlyBootstrapResume
        ? 'repeat-task-finish-run-with-bootstrap-recovery-and-resume-token'
        : run.primaryFailure?.code === 'task-finish.delivery-adaptation-required'
        ? 'adapt-run-owned-delivery-carrier-and-repeat-task-finish-run-with-resume-token'
        : 'repeat-task-finish-run-with-resume-token')
      : run.status === 'complete' ? TASK_RETROSPECTIVE_PROMPT : null,
    reuseMode: projectedState?.equivalence?.reuseMode || projectedState?.deliveryCarrier?.reuseMode || run.equivalence?.reuseMode || run.deliveryCarrier?.reuseMode || null,
    deliveryAdaptation,
    equivalence: clone(projectedState?.equivalence || run.equivalence),
    delivery: clone(projectedState?.delivery || run.delivery),
    completion: clone(run.completion),
    maintenance: clone(run.completion?.maintenance || run.maintenance || null),
    occupancy: run.occupancy ? clone(run.occupancy) : null,
    bootstrapRecovery: run.bootstrapRecovery ? clone(run.bootstrapRecovery) : null,
    metrics: {
      canonicalCliInvocations: run.invocations,
      agentProviderCompletions: 0,
      manualRecoveryManifests: 0,
      bootstrapRecoveryExecutions: run.bootstrapRecovery ? 1 : 0,
      formalVerificationExecutions,
      productCommandObservations: commandObservations,
      productExecutionMs: phaseDurationMs,
      wallClockMs: Math.max(0, clock() - Date.parse(run.createdAt)),
      coverage: 'product-complete',
    },
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
  return result;
}

export function inspectFinishRun({ root, runId, clock = Date.now, runtime = null }) {
  const sqlite = requireTaskFinishRuntime(runtime, 'read model');
  const current = sqlite.readTaskFinishRunPersistence(root, { runId }, { optional: true });
  if (current) return finishResult(current.run, clock);
  const completed = sqlite.readTaskFinishCompletionPersistence(root, { runId }, { optional: true });
  if (completed?.completion?.result) {
    const result = completed.completion.result;
    return Object.hasOwn(result, 'resolvedContext') ? result : { ...result, resolvedContext: null };
  }
  throw new Error(`Unknown Task Finish run: ${runId}`);
}

export function readTaskFinishResults({ root, taskId, clock = Date.now, runtime = null }) {
  if (!RUN_ID_PATTERN.test(String(taskId || ''))) throw new Error('Task Finish query requires a valid Task ID.');
  const read = requireTaskFinishRuntime(runtime, 'read model').readTaskFinishResultsPersistence(root, taskId, { clock });
  return {
    ...read,
    results: (read.results || []).map((entry) => ({
      ...entry,
      result: Object.hasOwn(entry.result || {}, 'resolvedContext') ? entry.result : { ...entry.result, resolvedContext: null },
    })),
  };
}
