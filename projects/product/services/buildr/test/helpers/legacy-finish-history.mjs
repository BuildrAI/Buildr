import { currentRecord, terminalRecord } from '../../src/task/persistence/task-finish-repository.mjs';
// Test-only legacy history fixtures. No production execution imports this module.
import crypto from 'node:crypto';
import path from 'node:path';
import { normalizeTaskFinishRepositorySet, singletonApplicableTaskFinishRepository, taskFinishRepositorySetIdentity, createTaskFinishRepositoryStates } from '../../src/task/application/finish/task-finish-repository-set.mjs';
import { FINISH_RUN_SCHEMA, FINISH_PHASES } from '../../src/task/application/finish/task-finish-run.mjs';
const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
function requireTaskFinishRuntime(runtime) { return runtime; }

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now(clock) {
  return new Date(clock()).toISOString();
}

function sha256(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
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


export function writeFinishCompletion({ root, runId, completion, runtime }) {
  return runtime.writeTaskFinishCompletionPersistence(root, { taskId: completion.task, runId, result: completion });
}

// Seed historical SQLite rows explicitly. These helpers cannot be called by product code.
export function legacyFinishRuntime(runtime) {
  const seed = (root, record) => {
    const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
    try {
      const columns = Object.keys(record);
      opened.database.prepare(`INSERT INTO task_finish_current(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(task_id) DO UPDATE SET ${columns.filter((key) => key !== 'task_id').map((key) => `${key}=excluded.${key}`).join(',')}`).run(...columns.map((key) => record[key] ?? null));
    } finally { opened.database.close(); }
  };
  runtime.writeTaskFinishRunPersistence = (root, run) => {
    const old = runtime.readTaskFinishRunPersistence(root, { taskId: run.identity.task }, { optional: true });
    seed(root, currentRecord(run, { preparedCompletion: old?.preparedCompletion || null, lease: old?.lease || null }));
    return runtime.readTaskFinishRunPersistence(root, { runId: run.runId });
  };
  runtime.writeTaskFinishCompletionPersistence = (root, { taskId, runId, result }) => {
    const old = runtime.readTaskFinishRunPersistence(root, { taskId, runId });
    seed(root, currentRecord(old.run, { preparedCompletion: result, lease: old.lease || null }));
    return { completion: result };
  };
  runtime.finalizeTaskFinishPersistence = (root, { run, result, completion }) => {
    const terminal = terminalRecord(run, result, completion);
    seed(root, terminal.record);
    return { completion: terminal.completion, status: 'complete' };
  };
  return runtime;
}
