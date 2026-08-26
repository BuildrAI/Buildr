import crypto from 'node:crypto';

export const releaseLifecycleSchema = 'buildr.release-lifecycle/v1';

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const TASK = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const DIGEST = /^sha256-[a-f0-9]{64}$/u;

function required(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalDigest(value, label) {
  if (value == null) return null;
  return required(value, DIGEST, label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function status(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}.status is required.`);
  return value;
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function phaseFor(facts) {
  if (facts.selection.status !== 'frozen') return 'selection';
  if (facts.candidate.status !== 'passed') return 'candidate';
  if (facts.readiness.status !== 'ready') return 'readiness';
  if (facts.publication.status === 'not-started') return 'awaiting-publication-authorization';
  if (facts.publication.status !== 'passed') return 'publishing';
  if (facts.convergence.status !== 'passed') return 'published-dev-reconciliation-pending';
  if (facts.closeout.status !== 'passed') return 'closeout';
  return 'closed';
}

export function createReleaseLifecycle(input) {
  const version = required(input?.version, VERSION, 'version');
  const releaseTask = {
    taskId: required(input?.releaseTask?.taskId, TASK, 'releaseTask.taskId'),
    status: status(input?.releaseTask?.status, 'releaseTask'),
    recordDigest: optionalDigest(input?.releaseTask?.recordDigest, 'releaseTask.recordDigest'),
    noChange: input?.releaseTask?.noChange ?? null,
  };
  if (!['active', 'completed'].includes(releaseTask.status)) throw new Error('releaseTask.status must be active or completed.');
  if (releaseTask.status === 'completed' && releaseTask.noChange !== true) throw new Error('Completed releaseTask must record noChange=true.');
  const selection = {
    status: status(input?.selection?.status, 'selection'),
    generation: positiveInteger(input?.selection?.generation, 'selection.generation'),
    identity: optionalDigest(input?.selection?.identity, 'selection.identity'),
  };
  const candidate = { status: status(input?.candidate?.status, 'candidate'), identity: optionalDigest(input?.candidate?.identity, 'candidate.identity') };
  const readiness = { status: status(input?.readiness?.status, 'readiness'), contextDigest: optionalDigest(input?.readiness?.contextDigest, 'readiness.contextDigest') };
  const publication = { status: status(input?.publication?.status, 'publication'), runId: input?.publication?.runId ?? null, evidenceIdentity: optionalDigest(input?.publication?.evidenceIdentity, 'publication.evidenceIdentity') };
  const convergence = { status: status(input?.convergence?.status, 'convergence'), recoveryIdentity: optionalDigest(input?.convergence?.recoveryIdentity, 'convergence.recoveryIdentity') };
  const closeout = { status: status(input?.closeout?.status, 'closeout'), identity: optionalDigest(input?.closeout?.identity, 'closeout.identity'), formalReleaseRef: input?.closeout?.formalReleaseRef ?? null };
  const facts = { selection, candidate, readiness, publication, convergence, closeout };
  const phase = phaseFor(facts);
  if (releaseTask.status === 'completed' && phase !== 'closed') throw new Error(`releaseTask must remain active while lifecycle phase is ${phase}.`);
  if (phase !== 'selection' && !selection.identity) throw new Error('selection.identity is required after selection.');
  if (!['selection', 'candidate'].includes(phase) && !candidate.identity) throw new Error('candidate.identity is required after Candidate.');
  if (!['selection', 'candidate', 'readiness'].includes(phase) && !readiness.contextDigest) throw new Error('readiness.contextDigest is required after readiness.');
  const recovery = {
    version,
    taskId: releaseTask.taskId,
    selectionGeneration: selection.generation,
    selectionIdentity: selection.identity,
    contextDigest: readiness.contextDigest,
    publishRun: publication.runId,
  };
  const findings = [];
  if (phase === 'closed' && closeout.formalReleaseRef?.disposition !== 'retained-and-verified') {
    findings.push({ code: 'formal-release-ref-not-verified', owner: 'release-closeout' });
  }
  if (releaseTask.status === 'completed' && findings.length) throw new Error('Completed releaseTask requires a verified retained formal release ref.');
  const statusValue = findings.length ? 'blocked' : phase === 'closed' ? 'passed' : 'active';
  return {
    schemaVersion: releaseLifecycleSchema,
    status: statusValue,
    version,
    phase,
    releaseTask,
    recoveryIdentity: digest(recovery),
    recovery,
    facts,
    findings,
    effects: [],
    nextActions: findings.length ? ['核验正式远端release ref并完成必需closeout。'] : [],
  };
}

function orchestrationAction(phase) {
  if (phase === 'awaiting-publication-authorization' || phase === 'readiness') return 'prepare-dispatch';
  if (phase === 'publishing') return 'dispatch';
  if (['published-dev-reconciliation-pending', 'closeout', 'closed'].includes(phase)) return 'closeout';
  return phase === 'candidate' ? 'candidate' : 'selection';
}

export function projectReleaseLifecycleOrchestration(lifecycle, timelineIdentity) {
  if (lifecycle?.schemaVersion !== releaseLifecycleSchema || !DIGEST.test(lifecycle.recoveryIdentity ?? '')) throw new Error('release lifecycle is invalid.');
  const currentTimeline = required(timelineIdentity, DIGEST, 'timelineIdentity');
  return {
    ...lifecycle,
    orchestration: {
      action: orchestrationAction(lifecycle.phase),
      recoveryIdentity: lifecycle.recoveryIdentity,
      timelineIdentity: currentTimeline,
    },
  };
}
