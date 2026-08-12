import crypto from 'node:crypto';

export const TASK_FINISH_EXECUTION_RECORD_OWNER = 'task-finish';
export const TASK_FINISH_EXECUTION_RECORD_KIND = 'finish-diagnostics';
export const TASK_FINISH_EXECUTION_RECORD_PRODUCER = 'buildr.task-finish-runner/v1';
export const TASK_FINISH_RAW_COMMAND_OUTPUT = Symbol.for('buildr.task-finish.raw-command-output');

const PUBLIC_STATUSES = new Set(['not-opened', 'retained', 'blocked', 'attention']);
const OUTCOMES = new Set(['passed', 'blocked', 'failed', 'cancelled']);
const PHASES = new Set(['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
const MAPPER_FIELDS = new Set([
  'invocationId', 'run', 'invocationOrdinal', 'outcome', 'startedAt', 'finishedAt', 'durationMs',
  'timeline', 'phaseResults', 'stdout', 'stderr', 'failure',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function portableFailure(value) {
  if (!value) return null;
  const diagnostic = value.diagnostic == null ? null : {
    digest: value.diagnostic?.digest || digest(value.diagnostic),
  };
  return {
    phase: PHASES.has(value.phase) ? value.phase : null,
    operation: value.operation || value.check || null,
    check: value.check || null,
    failureClass: value.failureClass || 'product-execution-failure',
    code: value.code || 'task-finish.phase-failed',
    status: value.status || 'failed',
    exitCode: Number.isInteger(value.exitCode) ? value.exitCode : null,
    message: value.message || 'Task Finish execution stopped.',
    diagnostic,
  };
}

function portableOperation(value) {
  const stdout = value?.stdout || null;
  const stderr = value?.stderr || null;
  return {
    kind: value?.kind || 'product',
    id: value?.id || value?.operation || null,
    status: value?.status ?? null,
    signal: value?.signal || null,
    exitCode: Number.isInteger(value?.exitCode) ? value.exitCode : Number.isInteger(value?.status) ? value.status : null,
    startedAt: value?.startedAt || null,
    durationMs: Math.round(value?.durationMs || 0),
    stdout: stdout ? { bytes: stdout.bytes || 0, digest: stdout.digest || null, truncated: stdout.truncated === true } : null,
    stderr: stderr ? { bytes: stderr.bytes || 0, digest: stderr.digest || null, truncated: stderr.truncated === true } : null,
  };
}

function portablePhase(value) {
  if (!PHASES.has(value?.id)) throw new Error(`Unsupported Task Finish execution record phase: ${value?.id || '<missing>'}`);
  return {
    id: value.id,
    status: value.status,
    attempt: value.attempt,
    startedAt: value.startedAt || null,
    completedAt: value.completedAt || null,
    durationMs: Math.round(value.durationMs || 0),
    inputIdentity: value.inputIdentity || null,
    outputIdentity: value.outputIdentity || null,
    checks: (value.checks || []).map((check) => ({
      id: check.check || check.id || null,
      severity: check.severity || null,
      code: check.code || null,
      status: check.status || null,
    })),
    operations: (value.operations || []).map(portableOperation),
    failure: portableFailure(value.failure),
  };
}

function portableRun(run) {
  const identity = run?.identity || {};
  const carrier = run?.deliveryCarrier || null;
  const delivery = run?.delivery || null;
  const completion = run?.completion || null;
  return {
    id: run?.runId || null,
    invocationOrdinal: run?.invocations || null,
    taskId: identity.task || null,
    handoffIdentity: identity.handoffIdentity || null,
    candidateIdentity: identity.candidateIdentity || null,
    candidateGeneration: identity.candidateGeneration || null,
    contentTargetIdentity: identity.contentTargetIdentity || null,
    deliveryCommit: run?.deliveryCommit ? {
      subject: run.deliveryCommit.subject || null,
      identity: run.deliveryCommit.identity || null,
    } : null,
    agent: identity.agent || null,
    target: {
      branch: identity.targetBranch || null,
      remote: identity.remote || null,
      expectedRef: carrier?.expectedTargetRef || null,
      carrierRef: carrier?.head || delivery?.carrierRef || null,
      remoteAfterRef: delivery?.remoteAfterRef || null,
      finalRemoteRef: delivery?.finalRemoteRef || completion?.finalRemoteRef || null,
      disposition: delivery?.targetDisposition || null,
    },
    carrier: carrier ? {
      identity: carrier.identity || null,
      kind: carrier.kind || null,
      status: carrier.status || null,
      reuseMode: carrier.reuseMode || null,
      head: carrier.head || null,
      tree: carrier.tree || null,
      taskContributionIdentity: carrier.taskContribution?.identity || null,
      deliveryBaselineIdentity: carrier.deliveryBaseline ? digest(carrier.deliveryBaseline) : null,
    } : null,
    cleanup: completion?.cleanup ? {
      status: completion.cleanup.status || null,
      completedAt: completion.cleanup.completedAt || null,
    } : null,
    status: run?.status || null,
  };
}

export function taskFinishExecutionRecordOutcome(result) {
  if (result?.cancelled === true) return 'cancelled';
  if (result?.status === 'complete') return 'passed';
  if (['blocked', 'cleanup_pending'].includes(result?.status)) return 'blocked';
  return 'failed';
}

export function compactTaskFinishFailure(value, phase = null) {
  if (!value) return null;
  return portableFailure({ ...value, phase: value.phase || phase });
}

export function createTaskFinishExecutionRecordFiles(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Task Finish execution record input must be an object.');
  for (const field of Object.keys(input)) if (!MAPPER_FIELDS.has(field)) throw new Error(`Unsupported Task Finish execution record field: ${field}`);
  if (typeof input.invocationId !== 'string' || !input.invocationId) throw new Error('Task Finish execution record requires invocationId.');
  if (!OUTCOMES.has(input.outcome)) throw new Error(`Unsupported Task Finish execution record outcome: ${input.outcome}`);
  const phases = (input.phaseResults || []).map(portablePhase);
  const run = portableRun(input.run);
  const summary = {
    schemaVersion: 'buildr.task-finish-execution-record-summary/v1',
    invocationId: input.invocationId,
    finishRunId: run.id,
    invocationOrdinal: input.invocationOrdinal || run.invocationOrdinal,
    taskId: run.taskId,
    handoffIdentity: run.handoffIdentity,
    candidate: {
      identity: run.candidateIdentity,
      generation: run.candidateGeneration,
      contentTargetIdentity: run.contentTargetIdentity,
    },
    agent: run.agent,
    target: run.target,
    carrier: run.carrier,
    deliveryCommit: run.deliveryCommit,
    phases,
    outcome: input.outcome,
    finishStatus: run.status,
    cleanup: run.cleanup,
    durationMs: Math.round(input.durationMs || 0),
    timingSource: 'wrapper-measured',
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
  const timeline = {
    schemaVersion: 'buildr.task-finish-execution-record-timeline/v1',
    invocationId: input.invocationId,
    finishRunId: run.id,
    events: (input.timeline || []).map((event) => ({
      milestone: event.milestone,
      phase: PHASES.has(event.phase) ? event.phase : null,
      status: event.status || null,
      at: event.at,
    })),
  };
  const failure = portableFailure(input.failure);
  const diagnostics = {
    schemaVersion: 'buildr.task-finish-execution-record-diagnostics/v1',
    invocationId: input.invocationId,
    finishRunId: run.id,
    outcome: input.outcome,
    failure,
    blockedPhase: input.outcome === 'blocked' ? failure?.phase || null : null,
    target: {
      expectedRef: run.target.expectedRef,
      carrierRef: run.target.carrierRef,
      remoteAfterRef: run.target.remoteAfterRef,
      finalRemoteRef: run.target.finalRemoteRef,
      disposition: run.target.disposition,
    },
  };
  return [
    { name: 'summary.json', content: summary },
    { name: 'stdout.txt', content: String(input.stdout || '') },
    { name: 'stderr.txt', content: String(input.stderr || '') },
    { name: 'timeline.json', content: timeline },
    { name: 'diagnostics.json', content: diagnostics },
  ];
}

export function publicTaskFinishExecutionRecord(status, options = {}) {
  if (!PUBLIC_STATUSES.has(status)) throw new Error(`Unsupported Task Finish execution record status: ${status}`);
  const record = options.record || null;
  return {
    status,
    recordId: record?.recordId || options.recordId || null,
    outcome: record?.outcome || options.outcome || null,
    lifecycleStatus: record?.lifecycleStatus || options.lifecycleStatus || null,
    body: record ? {
      digest: record.body.digest,
      storedSizeBytes: record.body.storedSizeBytes,
      originalSizeBytes: record.body.originalSizeBytes,
      truncated: record.body.truncated,
    } : null,
    transientCleanup: options.transientCleanup ? {
      status: options.transientCleanup.status,
      code: options.transientCleanup.code,
    } : null,
    diagnostic: options.diagnostic ? {
      code: options.diagnostic.code || 'task-finish.execution-record-failed',
      message: options.diagnostic.message,
    } : null,
    nextActions: options.nextActions || [],
  };
}
