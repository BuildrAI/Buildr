import crypto from 'node:crypto';

export const releasePhaseTimelineSchema: any = 'buildr.release-phase-timeline/v1';
export const releasePhaseTimelineSummarySchema: any = 'buildr.release-phase-timeline-summary/v1';

const VERSION: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST: any = /^sha256-[a-f0-9]{64}$/u;
const WAIT_TYPES: any = new Set(['machine-execution', 'platform-queue', 'environment-approval', 'human-decision', 'unknown']);
const STATUSES: any = new Set(['pending', 'running', 'passed', 'failed', 'blocked', 'cancelled', 'reused', 'unknown']);

function digest(value: any): any  {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function requiredText(value: any, label: any): any  {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('file:')) throw new Error(`${label} must be portable.`);
  return value;
}

function optionalTime(value: any, label: any): any  {
  if (value == null) return null;
  const timestamp: any = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) throw new Error(`${label} must be a canonical ISO timestamp.`);
  return value;
}

function timing(startedAt: any, finishedAt: any, label: any): any  {
  const start: any = optionalTime(startedAt, `${label}.startedAt`);
  const finish: any = optionalTime(finishedAt, `${label}.finishedAt`);
  if (start && finish && Date.parse(finish) < Date.parse(start)) throw new Error(`${label} finishes before it starts.`);
  return {
    startedAt: start,
    finishedAt: finish,
    durationMs: start && finish ? Date.parse(finish) - Date.parse(start) : null,
    precision: start && finish ? 'complete' : 'unknown',
  };
}

function owner(value: any, label: any): any  {
  return {
    id: requiredText(value?.id, `${label}.id`),
    identity: value?.identity == null ? null : requiredText(value.identity, `${label}.identity`),
  };
}

function attempt(value: any, label: any): any  {
  if (value == null) return null;
  const runId: any = requiredText(String(value.runId ?? ''), `${label}.runId`);
  if (!Number.isSafeInteger(value.runAttempt) || value.runAttempt < 1) throw new Error(`${label}.runAttempt must be a positive integer.`);
  const rerunScope: any = [...(value.rerunScope ?? [])].map((item: any, index: any) => requiredText(item, `${label}.rerunScope[${index}]`)).sort();
  const evidence: any = [...(value.evidence ?? [])].map((item: any, index: any) => {
    const disposition: any = item?.disposition;
    if (!['executed', 'reused'].includes(disposition)) throw new Error(`${label}.evidence[${index}].disposition is invalid.`);
    const originRunId: any = requiredText(String(item.originRunId ?? ''), `${label}.evidence[${index}].originRunId`);
    if (!Number.isSafeInteger(item.originRunAttempt) || item.originRunAttempt < 1) throw new Error(`${label}.evidence[${index}].originRunAttempt must be a positive integer.`);
    return {
      id: requiredText(item.id, `${label}.evidence[${index}].id`),
      disposition,
      origin: { runId: originRunId, runAttempt: item.originRunAttempt },
      identity: item.identity == null ? null : requiredText(item.identity, `${label}.evidence[${index}].identity`),
    };
  }).sort((left: any, right: any) => left.id.localeCompare(right.id));
  const aggregateIdentity: any = value.aggregateIdentity == null ? null : requiredText(value.aggregateIdentity, `${label}.aggregateIdentity`);
  if (aggregateIdentity !== null && !DIGEST.test(aggregateIdentity)) throw new Error(`${label}.aggregateIdentity must be a sha256 identity.`);
  return { runId, runAttempt: value.runAttempt, rerunScope, evidence, aggregateIdentity };
}

function entry(value: any, index: any): any  {
  const label: any = `phases[${index}]`;
  const waitType: any = value?.waitType ?? 'unknown';
  if (!WAIT_TYPES.has(waitType)) throw new Error(`${label}.waitType is invalid.`);
  if (!STATUSES.has(value?.status)) throw new Error(`${label}.status is invalid.`);
  return {
    id: requiredText(value.id, `${label}.id`),
    phase: requiredText(value.phase, `${label}.phase`),
    status: value.status,
    owner: owner(value.owner, `${label}.owner`),
    timing: timing(value.startedAt, value.finishedAt, label),
    waitType,
    attempt: attempt(value.attempt, `${label}.attempt`),
  };
}

export function createReleasePhaseTimeline(input: any): any  {
  if (!VERSION.test(input?.version ?? '')) throw new Error('version is invalid.');
  if (!Number.isSafeInteger(input?.generation) || input.generation < 0) throw new Error('generation must be a non-negative integer.');
  const phases: any = [...(input.phases ?? [])].map(entry);
  if (new Set(phases.map((item: any) => item.id)).size !== phases.length) throw new Error('Timeline phase ids must be unique.');
  const terminalStatus: any = input.terminalStatus ?? 'active';
  if (!['active', 'closed', 'blocked'].includes(terminalStatus)) throw new Error('terminalStatus is invalid.');
  const normalized: any = {
    version: input.version,
    generation: input.generation,
    terminalStatus,
    phases,
  };
  return { schemaVersion: releasePhaseTimelineSchema, ...normalized, identity: digest(normalized) };
}

export function projectCandidateAttempts(attempts: any = []): any  {
  return attempts.flatMap((value: any, index: any) => {
    const runId: any = String(value.runId);
    const runAttempt: any = value.runAttempt;
    const common: any = { runId, runAttempt, rerunScope: value.rerunScope ?? [], evidence: value.evidence ?? [], aggregateIdentity: value.aggregateIdentity ?? null };
    return [
      {
        id: `candidate-queue:${runId}:${runAttempt}`,
        phase: 'candidate-queue',
        status: value.queueStatus ?? (value.startedAt ? 'passed' : value.status ?? 'unknown'),
        owner: value.owner ?? { id: 'github-actions', identity: value.runIdentity ?? null },
        startedAt: value.queuedAt ?? null,
        finishedAt: value.startedAt ?? null,
        waitType: 'platform-queue',
        attempt: common,
      },
      {
        id: `candidate-attempt:${runId}:${runAttempt}`,
        phase: 'candidate',
        status: value.status ?? 'unknown',
        owner: value.owner ?? { id: 'candidate-verification', identity: value.runIdentity ?? null },
        startedAt: value.startedAt ?? null,
        finishedAt: value.finishedAt ?? null,
        waitType: 'machine-execution',
        attempt: common,
      },
    ];
  });
}

export function projectCandidateRetryAttempts(input: any = {}): any  {
  const retryResults: any = [...(input.retryResults ?? [])].sort((left: any, right: any) => Number(left.runAttempt) - Number(right.runAttempt));
  const workflow: any = input.aggregate?.workflow;
  const runId: any = requiredText(String(workflow?.runId ?? ''), 'aggregate.workflow.runId');
  const aggregateAttempt: any = Number(workflow?.aggregateAttempt);
  if (!Number.isSafeInteger(aggregateAttempt) || aggregateAttempt < 1) throw new Error('aggregate.workflow.aggregateAttempt must be a positive integer.');
  const rerunScopes: any = new Map();
  const attempts: any = new Map();
  for (const [index, result] of retryResults.entries()) {
    const label: any = `retryResults[${index}]`;
    if (result?.schemaVersion !== 'buildr.candidate-failed-shard-retry-result/v1') throw new Error(`${label} is not a Candidate failed-shard retry Result.`);
    if (!['ready', 'dispatched'].includes(result.status)) throw new Error(`${label}.status is not reusable.`);
    if (String(result.runId) !== runId) throw new Error(`${label}.runId does not match the aggregate run.`);
    const runAttempt: any = Number(result.runAttempt);
    if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt >= aggregateAttempt) throw new Error(`${label}.runAttempt does not precede the aggregate attempt.`);
    const failedShards: any = [...(result.failedShards ?? [])].map((item: any, shardIndex: any) => requiredText(item, `${label}.failedShards[${shardIndex}]`)).sort();
    if (failedShards.length === 0) throw new Error(`${label}.failedShards must not be empty.`);
    if (attempts.has(runAttempt)) throw new Error(`${label}.runAttempt is duplicated.`);
    attempts.set(runAttempt, { runId, runAttempt, status: 'failed', rerunScope: rerunScopes.get(runAttempt) ?? [], evidence: [] });
    rerunScopes.set(runAttempt + 1, failedShards);
  }
  const evidence: any = [...(workflow?.evidenceAttempts ?? [])].map((item: any, index: any) => {
    const originRunAttempt: any = Number(item?.runAttempt);
    if (!Number.isSafeInteger(originRunAttempt) || originRunAttempt < 1 || originRunAttempt > aggregateAttempt) throw new Error(`aggregate.workflow.evidenceAttempts[${index}].runAttempt is invalid.`);
    return {
      id: requiredText(item.id, `aggregate.workflow.evidenceAttempts[${index}].id`),
      disposition: originRunAttempt === aggregateAttempt ? 'executed' : 'reused',
      originRunId: runId,
      originRunAttempt,
      identity: item.identity ?? null,
    };
  });
  attempts.set(aggregateAttempt, {
    runId,
    runAttempt: aggregateAttempt,
    status: input.aggregate?.status === 'passed' ? 'passed' : 'failed',
    rerunScope: rerunScopes.get(aggregateAttempt) ?? [],
    evidence,
    aggregateIdentity: input.aggregateIdentity ?? null,
  });
  return [...attempts.values()].sort((left: any, right: any) => left.runAttempt - right.runAttempt);
}

export function compactReleasePhaseTimeline(timeline: any): any  {
  if (timeline?.schemaVersion !== releasePhaseTimelineSchema || !DIGEST.test(timeline.identity ?? '')) throw new Error('Release Phase Timeline is invalid.');
  const keyPhases: any = timeline.phases.filter((item: any) => item.status !== 'unknown').map((item: any) => ({ id: item.id, phase: item.phase, status: item.status, durationMs: item.timing.durationMs }));
  return {
    schemaVersion: releasePhaseTimelineSummarySchema,
    status: timeline.terminalStatus,
    version: timeline.version,
    generation: timeline.generation,
    timelineIdentity: timeline.identity,
    keyPhases,
    inspect: { owner: 'release-orchestration', operation: 'inspect', timelineIdentity: timeline.identity },
  };
}
