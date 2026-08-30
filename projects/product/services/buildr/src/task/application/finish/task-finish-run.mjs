import crypto from 'node:crypto';
import { publicTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';
import { withTaskFinishCurrentFacts } from './task-finish-current-facts.mjs';
import { singletonTaskFinishRepositoryState, taskFinishCarrierSetIdentity, taskFinishDeliverySetIdentity } from './task-finish-repository-set.mjs';
export const LEGACY_FINISH_RUN_SCHEMA = 'buildr.task-finish-run/v2';
export const FINISH_RUN_SCHEMA = 'buildr.task-finish-run/v3';
export const FINISH_RESULT_SCHEMA = 'buildr.task-finish-result/v3';
export const FINISH_PHASES = Object.freeze(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
export const FINISH_PHASE_STATUSES = Object.freeze(['pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable']);
const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function sha256(value) { return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

export function readFinishCompletion({ root, runId, runtime = null }) {
  return requireTaskFinishRuntime(runtime, 'completion persistence').readTaskFinishCompletionPersistence(root, { runId }, { optional: true })?.completion || null;
}

export function readFinishRun({ root, runId, runtime = null }) {
  const current = requireTaskFinishRuntime(runtime, 'run persistence').readTaskFinishRunPersistence(root, { runId }, { optional: true });
  if (!current) throw new Error(`Unknown Task Finish run: ${runId}`);
  return current.run;
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
  const adaptationBlocked = run.status === 'blocked' && run.primaryFailure?.operation === 'delivery-adaptation';
  const deliveryAdaptation = run.status === 'blocked'
    && adaptationBlocked
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
    resume: null,
    nextWorkflow: null,
    nextAction: '旧运行只读保留；依据当前成果和资源事实使用独立收尾。',
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
  return withTaskFinishCurrentFacts(result, { taskId: run.identity.task, operation: 'inspect' });
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
