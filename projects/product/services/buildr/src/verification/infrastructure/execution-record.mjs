import crypto from 'node:crypto';
import path from 'node:path';

export const VERIFICATION_EXECUTION_RECORD_OWNER = 'task-verification';
export const VERIFICATION_EXECUTION_RECORD_KIND = 'verification-execution';
export const VERIFICATION_EXECUTION_RECORD_PRODUCER = 'buildr.verification-command-runner/v1';

const PUBLIC_STATUSES = new Set(['not-applicable', 'not-opened', 'active', 'retained', 'blocked', 'attention']);
const MAPPER_FIELDS = new Set([
  'runId', 'executionIdentity', 'invocationIdentity', 'context', 'targetRoot', 'targetIdentity', 'targetStable', 'targetDrift', 'before', 'after',
  'projectCode', 'declarationPath', 'declarationIdentity', 'selectedCapabilities', 'authorizedCapabilities',
  'authorizedResources', 'checks', 'outcome', 'durationMs', 'startedAt', 'finishedAt', 'diagnostic',
]);

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function verificationInvocationIdentity({ taskId, projectCode, declarationIdentity, targetIdentity, selectedCapabilities }) {
  return digest({
    taskId,
    project: projectCode,
    declarationIdentity,
    targetIdentity,
    capabilities: (selectedCapabilities || []).map((item) => typeof item === 'string' ? item : item.id).sort(),
    invocationKind: 'command',
  });
}

function relativePortable(root, value) {
  if (!value) return null;
  const relative = path.relative(root, value).split(path.sep).join('/');
  return relative && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative) ? relative : null;
}

function portableObservation(observation) {
  if (!observation) return null;
  return {
    kind: observation.kind,
    head: observation.head || null,
    tree: observation.tree || null,
    changedPaths: [...(observation.changedPaths || [])],
    fingerprint: observation.fingerprint,
    reusable: observation.reusable === true,
  };
}

function portableCoordination(value) {
  if (!value) return null;
  return {
    waitDurationMs: Math.round(value.waitDurationMs || 0),
    acquiredAt: value.acquiredAt || null,
    claims: (value.claims || []).map((claim) => ({
      resource: claim.resource,
      status: claim.status,
      strategy: claim.strategy || null,
      capacity: claim.capacity ?? null,
      slot: claim.slot ?? null,
      recovered: claim.recovered === true,
    })),
    release: (value.release || []).map((item) => ({ resource: item.resource, slot: item.slot ?? null, status: item.status })),
  };
}

function portableCheck(check) {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    exitCode: check.exitCode ?? null,
    signal: check.signal || null,
    durationMs: Math.round(check.durationMs || 0),
    queuedAt: check.queuedAt || null,
    startedAt: check.startedAt || null,
    finishedAt: check.finishedAt || null,
    queueDurationMs: Math.round(check.queueDurationMs || 0),
    resourceCoordination: portableCoordination(check.resourceCoordination),
  };
}

function outputSections(checks, field) {
  return checks
    .filter((check) => check[field])
    .map((check) => `=== capability: ${check.id} ===\n${check[field]}${check[field].endsWith('\n') ? '' : '\n'}`)
    .join('\n');
}

export function verificationExecutionRecordOutcome({ passed, checks = [], blocked = false }) {
  if (blocked) return 'blocked';
  if (checks.some((check) => ['SIGINT', 'SIGTERM'].includes(check.signal))) return 'cancelled';
  return passed ? 'passed' : 'failed';
}

export function createVerificationExecutionRecordFiles(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Verification execution record input must be an object.');
  for (const field of Object.keys(input)) if (!MAPPER_FIELDS.has(field)) throw new Error(`Unsupported Verification execution record field: ${field}`);
  const checks = (input.checks || []).map(portableCheck);
  const before = portableObservation(input.before);
  const after = portableObservation(input.after);
  const declarationPath = relativePortable(input.targetRoot, input.declarationPath);
  const scopes = (input.context?.scopes || []).map((scope) => ({
    selector: scope.selector,
    runtimeIdentity: scope.runtime?.identity || null,
    cliIdentity: scope.cli?.identity || null,
    dependenciesIdentity: (scope.preparation || scope.dependencies)?.identity || null,
    projectionIdentity: scope.projection?.identity || null,
  }));
  const summary = {
    schemaVersion: 'buildr.verification-execution-record-summary/v1',
    runId: input.runId,
    executionIdentity: input.executionIdentity || null,
    invocationIdentity: input.invocationIdentity || null,
    scopeIdentity: digest({
      project: input.projectCode,
      declarationIdentity: input.declarationIdentity,
      targetIdentity: input.targetIdentity,
      capabilities: (input.selectedCapabilities || []).map((item) => item.id).sort(),
      invocationKind: 'command',
    }),
    task: { id: input.context?.taskId || null, scopes },
    target: {
      identity: input.targetIdentity,
      stable: input.targetStable === true,
      before,
      after,
      drift: input.targetDrift || null,
    },
    project: { code: input.projectCode },
    declaration: { path: declarationPath, identity: input.declarationIdentity },
    selectedCapabilities: (input.selectedCapabilities || []).map((capability) => ({
      id: capability.id,
      scope: capability.scope,
      proves: capability.proves,
      requiredForDelivery: capability.requiredForDelivery === true,
      resourceClaims: capability.resourceClaims || [],
    })),
    authorization: {
      capabilities: [...new Set(input.authorizedCapabilities || [])],
      resources: [...new Set(input.authorizedResources || [])],
    },
    checks,
    outcome: input.outcome,
    durationMs: Math.round(input.durationMs || 0),
    timingSource: 'wrapper-measured',
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
  const timeline = {
    schemaVersion: 'buildr.verification-execution-record-timeline/v1',
    runId: input.runId,
    events: [
      { phase: 'execution', status: 'started', at: input.startedAt },
      ...checks.flatMap((check) => [
        { phase: 'capability', capabilityId: check.id, status: 'queued', at: check.queuedAt },
        { phase: 'capability', capabilityId: check.id, status: 'started', at: check.startedAt },
        { phase: 'capability', capabilityId: check.id, status: check.status, at: check.finishedAt },
      ]),
      { phase: 'execution', status: input.outcome, at: input.finishedAt },
    ].filter((event) => event.at),
  };
  const diagnostics = {
    schemaVersion: 'buildr.verification-execution-record-diagnostics/v1',
    runId: input.runId,
    failures: checks.filter((check) => check.status !== 'passed').map((check) => ({
      capabilityId: check.id,
      status: check.status,
      exitCode: check.exitCode,
      signal: check.signal,
    })),
    targetDrift: input.targetDrift || null,
    diagnostic: input.diagnostic || null,
  };
  return [
    { name: 'summary.json', content: summary },
    { name: 'stdout.txt', content: outputSections(input.checks || [], 'stdout') },
    { name: 'stderr.txt', content: outputSections(input.checks || [], 'stderr') },
    { name: 'timeline.json', content: timeline },
    { name: 'diagnostics.json', content: diagnostics },
  ];
}

export function publicVerificationExecutionRecord(status, options = {}) {
  if (!PUBLIC_STATUSES.has(status)) throw new Error(`Unsupported Verification execution record status: ${status}`);
  const record = options.record || null;
  return {
    status,
    recordId: record?.recordId || options.recordId || null,
    runIdentity: record?.runIdentity || options.runIdentity || null,
    invocationIdentity: record?.invocationIdentity || options.invocationIdentity || null,
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
      code: options.diagnostic.code || 'verification.execution_record_failed',
      message: options.diagnostic.message,
    } : null,
    nextActions: options.nextActions || [],
  };
}
