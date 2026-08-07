import crypto from 'node:crypto';
import path from 'node:path';

import { TASK_RETROSPECTIVE_PROMPT } from '../task-retrospective-prompt.mjs';

export const FINISH_RUN_SCHEMA = 'buildr.task-finish-run/v2';
export const FINISH_RESULT_SCHEMA = 'buildr.task-finish-result/v2';
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
  const required = ['task', 'handoffIdentity', 'candidateIdentity', 'contentTargetIdentity', 'agent', 'targetBranch', 'environmentRoot', 'workspaceRoot'];
  for (const field of required) {
    if (typeof input?.[field] !== 'string' || !input[field].trim()) throw new Error(`Task Finish requires ${field}.`);
  }
  if (!Number.isInteger(input.candidateGeneration) || input.candidateGeneration < 1) throw new Error('Task Finish requires candidateGeneration.');
  return {
    task: input.task,
    handoffIdentity: input.handoffIdentity,
    candidateIdentity: input.candidateIdentity,
    candidateGeneration: input.candidateGeneration,
    contentTargetIdentity: input.contentTargetIdentity,
    agent: input.agent,
    targetBranch: input.targetBranch,
    remote: typeof input.remote === 'string' && input.remote.trim() ? input.remote : null,
    environmentRoot: path.resolve(input.environmentRoot),
    workspaceRoot: path.resolve(input.workspaceRoot),
    workspaceNodeIdentity: typeof input.workspaceNodeIdentity === 'string' && input.workspaceNodeIdentity ? input.workspaceNodeIdentity : null,
  };
}

function generateRunId(identity, clock) {
  const stamp = new Date(clock()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${identity.task}-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

export function createFinishRun({ root, identity, runId = null, clock = Date.now, runtime = null }) {
  const normalized = normalizeIdentity(identity);
  const actualRunId = runId || generateRunId(normalized, clock);
  const sqlite = requireTaskFinishRuntime(runtime, 'run persistence');
  const current = sqlite.readTaskFinishRunPersistence(root, { taskId: normalized.task }, { optional: true });
  if (current) return current.run;
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

export function resolveFinishRun({ root, identity, runId = null, resumeToken = null, clock = Date.now, runtime = null }) {
  if (runId) {
    const run = readFinishRun({ root, runId, runtime });
    if (run.identityDigest !== sha256(normalizeIdentity(identity))) throw new Error('Task Finish run identity does not match the requested task/candidate/target.');
    if (resumeToken && run.resume?.token !== resumeToken) throw new Error('Task Finish resume token does not match the current blocked state.');
    return run;
  }
  const reusable = resumableRunCandidates(root, identity, runtime).find((run) => !resumeToken || run.resume?.token === resumeToken);
  return reusable || createFinishRun({ root, identity, clock, runtime });
}

function normalizeFailure(value, phaseId, fallbackCode = 'task-finish.phase-failed') {
  const failure = value && typeof value === 'object' ? clone(value) : {};
  return {
    phase: phaseId,
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
    carrier: run.deliveryCarrier?.identity || null,
    activationPlan: run.deliveryCarrier?.activationPlan?.identity || run.delivery?.activation?.plan?.identity || null,
    phase: phaseId,
    failure: { code: failure.code, operation: failure.operation, diagnostic: failure.diagnostic?.digest || null },
  });
}

function applyPhaseOutput(run, phaseId, output) {
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
  run.deliveryCarrier = null;
  run.equivalence = null;
  run.delivery = null;
  run.completion = null;
  return true;
}

export async function executeFinishRun({ root, run, handlers, resumeToken = null, clock = Date.now, runtime = null }) {
  if (run.schemaVersion !== FINISH_RUN_SCHEMA) throw new Error('Task Finish executor requires a current run.');
  if (['failed', 'complete'].includes(run.status)) return finishResult(run, clock);
  if (['blocked', 'cleanup_pending'].includes(run.status) && (!resumeToken || resumeToken !== run.resume?.token)) {
    throw new Error('Task Finish blocked run requires its current product-generated resume token.');
  }
  resetTargetRaceCarrierPhases(run);
  run.invocations += 1;
  run.status = 'active';
  run.primaryFailure = null;
  run.resume = null;
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
    writeRun(root, run, clock, runtime);
    let normalized;
    try {
      normalized = normalizePhaseResult(await handlers[phaseId]({ root, run: clone(run), phase: clone(item) }), phaseId);
    } catch (error) {
      normalized = normalizePhaseResult({
        status: error?.resumable === true ? 'blocked' : 'failed',
        failure: {
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
    item.durationMs += Math.max(0, clock() - started);
    item.inputIdentity = normalized.inputIdentity;
    item.outputIdentity = normalized.outputIdentity;
    item.checks = clone(normalized.checks);
    item.operations = clone(normalized.operations);
    item.observations = clone(normalized.observations);
    item.output = clone(normalized.output);
    item.failure = normalized.failure;
    applyPhaseOutput(run, phaseId, normalized.output);
    if (normalized.status === 'blocked') {
      run.status = phaseId === 'cleanup' ? 'cleanup_pending' : 'blocked';
      run.primaryFailure = clone(normalized.failure);
      run.resume = {
        phase: phaseId,
        token: resumeTokenFor(run, phaseId, normalized.failure),
        generatedAt: now(clock),
        carrierIdentity: run.deliveryCarrier?.identity || null,
      };
      writeRun(root, run, clock, runtime);
      return finishResult(run, clock);
    }
    if (normalized.status === 'failed') {
      run.status = 'failed';
      run.primaryFailure = clone(normalized.failure);
      run.resume = null;
      writeRun(root, run, clock, runtime);
      return finishResult(run, clock);
    }
    writeRun(root, run, clock, runtime);
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
      run.status = 'cleanup_pending';
      run.completedAt = null;
      run.primaryFailure = normalizeFailure({
        operation: 'finish-persistence',
        failureClass: 'transient-external-condition',
        code: error.code || 'task-finish.finalize-failed',
        status: 'blocked',
        message: error.message,
        diagnostic: error.details || null,
      }, 'cleanup');
      run.resume = { phase: 'cleanup', token: resumeTokenFor(run, 'cleanup', run.primaryFailure), generatedAt: now(clock), carrierIdentity: run.deliveryCarrier?.identity || null };
      writeRun(root, run, clock, runtime);
      return finishResult(run, clock);
    }
    return result;
  }
  writeRun(root, run, clock, runtime);
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
    checks: item.checks,
    operations: item.operations,
    failure: item.failure,
  };
}

export function finishResult(run, clock = Date.now) {
  const phaseDurationMs = run.phases.reduce((total, item) => total + (item.durationMs || 0), 0);
  const commandObservations = run.phases.reduce((total, item) => total + (item.operations || []).filter((entry) => entry.kind === 'command').length, 0);
  const formalVerificationExecutions = 0;
  const result = {
    schemaVersion: FINISH_RESULT_SCHEMA,
    runId: run.runId,
    status: run.status,
    identity: clone(run.identity),
    handoff: { identity: run.identity.handoffIdentity },
    candidate: { identity: run.identity.candidateIdentity, generation: run.identity.candidateGeneration, contentTargetIdentity: run.identity.contentTargetIdentity },
    carrier: clone(run.deliveryCarrier),
    phases: run.phases.map(publicPhase),
    primaryFailure: clone(run.primaryFailure),
    resume: clone(run.resume),
    nextWorkflow: run.status === 'failed'
      ? (run.primaryFailure?.failureClass === 'upstream-candidate-defect' ? 'task-development' : 'task-finish-investigation')
      : null,
    nextAction: ['blocked', 'cleanup_pending'].includes(run.status)
      ? (run.primaryFailure?.code === 'task-finish.delivery-adaptation-required'
        ? 'adapt-run-owned-delivery-carrier-and-repeat-task-finish-run-with-resume-token'
        : 'repeat-task-finish-run-with-resume-token')
      : run.status === 'complete' ? TASK_RETROSPECTIVE_PROMPT : null,
    reuseMode: run.equivalence?.reuseMode || run.deliveryCarrier?.reuseMode || null,
    equivalence: clone(run.equivalence),
    delivery: clone(run.delivery),
    completion: clone(run.completion),
    metrics: {
      canonicalCliInvocations: run.invocations,
      agentProviderCompletions: 0,
      manualRecoveryManifests: 0,
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
  if (completed?.completion?.result) return completed.completion.result;
  throw new Error(`Unknown Task Finish run: ${runId}`);
}

export function readTaskFinishResults({ root, taskId, clock = Date.now, runtime = null }) {
  if (!RUN_ID_PATTERN.test(String(taskId || ''))) throw new Error('Task Finish query requires a valid Task ID.');
  return requireTaskFinishRuntime(runtime, 'read model').readTaskFinishResultsPersistence(root, taskId, { clock });
}
