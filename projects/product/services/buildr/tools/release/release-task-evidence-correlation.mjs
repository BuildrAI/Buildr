import crypto from 'node:crypto';

export const RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA = 'buildr.release-task-evidence-correlation/v1';

const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const TASK = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const SHA = /^[a-f0-9]{40}$/u;
const SUCCESS = new Set(['complete', 'completed', 'delivered', 'passed', 'ready', 'current', 'cleaned']);
const BLOCKED = new Set(['blocked', 'failed', 'cancelled', 'error']);
const ALLOWED_ENTRY_FIELDS = new Set(['taskId', 'environment', 'development', 'finish', 'selfBootstrap']);
const ALLOWED_TASK_FIELDS = new Set(['taskId', 'title', 'status', 'recordDigest']);
const ALLOWED_ENVIRONMENT_FIELDS = new Set(['taskId', 'status', 'identity', 'receiptIdentity', 'receiptDigest', 'declarationIdentity', 'executionIdentity', 'reason', 'diagnosticRef']);
const ALLOWED_DEVELOPMENT_FIELDS = new Set(['taskId', 'status', 'identity', 'receiptIdentity', 'handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity', 'taskContextIdentity', 'contributionIdentity', 'reason', 'diagnosticRef']);
const ALLOWED_FINISH_FIELDS = new Set(['taskId', 'status', 'runId', 'identity', 'resultIdentity', 'handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity', 'deliveryStatus', 'deliveryRef', 'sourceTree', 'repositories', 'executionRecord', 'activation', 'environmentCleanup', 'diagnostics', 'reason', 'diagnosticRef']);
const ALLOWED_REPOSITORY_FIELDS = new Set(['selector', 'disposition', 'carrierIdentity', 'carrierRef', 'remote', 'targetBranch', 'deliveryStatus', 'finalRemoteRef']);
const ALLOWED_EXECUTION_FIELDS = new Set(['recordId', 'identity', 'status', 'outcome', 'lifecycleStatus', 'evidenceIdentity']);
const ALLOWED_SELF_BOOTSTRAP_FIELDS = new Set(['schemaVersion', 'status', 'taskId', 'runId', 'identity', 'resultIdentity', 'activationIdentity', 'planIdentity', 'carrierIdentity', 'deliveredRef', 'sourceTree', 'diagnosticRef', 'reason']);

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const field of Object.keys(value)) if (!fields.has(field)) throw new Error(`${label}.${field} is not supported.`);
  return value;
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function identity(value, label) {
  if (value == null) return null;
  if (!DIGEST.test(value)) throw new Error(`${label} must be a sha256 digest.`);
  return value;
}

function taskId(value, label) {
  if (!TASK.test(value || '')) throw new Error(`${label} must be a Task ID.`);
  return value;
}

function optionalSha(value, label) {
  if (value == null) return null;
  if (!SHA.test(value)) throw new Error(`${label} must be a full Git SHA.`);
  return value;
}

function optionalPositiveInteger(value, label) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function optionalRunIdentity(value, label) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) return value;
  return optionalPositiveInteger(value, label);
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function finding(owner, code, summary, severity = 'blocked') {
  return { owner, code, severity, summary };
}

function roleStatus(value, missingStatus = 'unknown') {
  if (!value) return missingStatus;
  const status = optionalText(value.status);
  if (BLOCKED.has(status)) return 'blocked';
  if (status === 'attention' || status === 'pending') return 'attention';
  if (SUCCESS.has(status)) return 'passed';
  return status ? 'unknown' : missingStatus;
}

function taskProjection(value, label, expectedStatus = 'completed') {
  closed(value, ALLOWED_TASK_FIELDS, label);
  const task = taskId(value.taskId, `${label}.taskId`);
  if (value.status !== expectedStatus) throw new Error(`${label} must be ${expectedStatus}.`);
  return { taskId: task, title: String(value.title || ''), status: value.status, recordDigest: identity(value.recordDigest, `${label}.recordDigest`) };
}

function normalizeEnvironment(value, expectedTaskId, label) {
  if (!value) return { status: 'unknown', taskId: expectedTaskId, identity: null, receiptDigest: null, declarationIdentity: null, executionIdentity: null, reason: 'environment-evidence-missing', diagnosticRef: null };
  closed(value, ALLOWED_ENVIRONMENT_FIELDS, label);
  if (value.taskId != null && value.taskId !== expectedTaskId) throw new Error(`${label}.taskId does not match task entry.`);
  const status = roleStatus(value);
  return {
    status,
    taskId: expectedTaskId,
    identity: identity(value.identity || value.receiptIdentity, `${label}.identity`),
    receiptDigest: identity(value.receiptDigest, `${label}.receiptDigest`),
    declarationIdentity: identity(value.declarationIdentity, `${label}.declarationIdentity`),
    executionIdentity: identity(value.executionIdentity, `${label}.executionIdentity`),
    reason: optionalText(value.reason),
    diagnosticRef: optionalText(value.diagnosticRef),
  };
}

function normalizeDevelopment(value, expectedTaskId, label) {
  if (!value) return { status: 'unknown', taskId: expectedTaskId, identity: null, handoffIdentity: null, candidateIdentity: null, candidateGeneration: null, contentTargetIdentity: null, taskContextIdentity: null, contributionIdentity: null, reason: 'development-evidence-missing', diagnosticRef: null };
  closed(value, ALLOWED_DEVELOPMENT_FIELDS, label);
  if (value.taskId != null && value.taskId !== expectedTaskId) throw new Error(`${label}.taskId does not match task entry.`);
  return {
    status: roleStatus(value),
    taskId: expectedTaskId,
    identity: identity(value.identity || value.receiptIdentity, `${label}.identity`),
    handoffIdentity: identity(value.handoffIdentity, `${label}.handoffIdentity`),
    candidateIdentity: identity(value.candidateIdentity, `${label}.candidateIdentity`),
    candidateGeneration: value.candidateGeneration == null ? null : optionalPositiveInteger(value.candidateGeneration, `${label}.candidateGeneration`),
    contentTargetIdentity: identity(value.contentTargetIdentity, `${label}.contentTargetIdentity`),
    taskContextIdentity: identity(value.taskContextIdentity, `${label}.taskContextIdentity`),
    contributionIdentity: identity(value.contributionIdentity, `${label}.contributionIdentity`),
    reason: optionalText(value.reason),
    diagnosticRef: optionalText(value.diagnosticRef),
  };
}

function normalizeExecution(value, label) {
  if (!value) return null;
  closed(value, ALLOWED_EXECUTION_FIELDS, label);
  return {
    recordId: optionalText(value.recordId),
    identity: identity(value.identity, `${label}.identity`),
    status: optionalText(value.status),
    outcome: optionalText(value.outcome),
    lifecycleStatus: optionalText(value.lifecycleStatus),
    evidenceIdentity: identity(value.evidenceIdentity, `${label}.evidenceIdentity`),
  };
}

function normalizeRepositories(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => {
    closed(item, ALLOWED_REPOSITORY_FIELDS, `${label}[${index}]`);
    const selector = optionalText(item.selector);
    if (!selector) throw new Error(`${label}[${index}].selector is required.`);
    return {
      selector,
      disposition: optionalText(item.disposition),
      carrierIdentity: identity(item.carrierIdentity, `${label}[${index}].carrierIdentity`),
      carrierRef: optionalSha(item.carrierRef, `${label}[${index}].carrierRef`),
      remote: optionalText(item.remote),
      targetBranch: optionalText(item.targetBranch),
      deliveryStatus: optionalText(item.deliveryStatus),
      finalRemoteRef: optionalSha(item.finalRemoteRef, `${label}[${index}].finalRemoteRef`),
    };
  }).sort((left, right) => left.selector.localeCompare(right.selector));
}

function normalizeFinish(value, expectedTaskId, label) {
  if (!value) return { status: 'unknown', taskId: expectedTaskId, runId: null, identity: null, resultIdentity: null, handoffIdentity: null, candidateIdentity: null, candidateGeneration: null, contentTargetIdentity: null, deliveryStatus: null, deliveryRef: null, sourceTree: null, repositories: [], executionRecord: null, activation: 'unknown', environmentCleanup: 'unknown', diagnostics: 'unknown', reason: 'finish-evidence-missing', diagnosticRef: null };
  closed(value, ALLOWED_FINISH_FIELDS, label);
  if (value.taskId != null && value.taskId !== expectedTaskId) throw new Error(`${label}.taskId does not match task entry.`);
  const resultIdentity = identity(value.resultIdentity || value.identity, `${label}.resultIdentity`);
  return {
    status: roleStatus(value),
    taskId: expectedTaskId,
    runId: optionalRunIdentity(value.runId, `${label}.runId`),
    identity: resultIdentity,
    resultIdentity,
    handoffIdentity: identity(value.handoffIdentity, `${label}.handoffIdentity`),
    candidateIdentity: identity(value.candidateIdentity, `${label}.candidateIdentity`),
    candidateGeneration: value.candidateGeneration == null ? null : optionalPositiveInteger(value.candidateGeneration, `${label}.candidateGeneration`),
    contentTargetIdentity: identity(value.contentTargetIdentity, `${label}.contentTargetIdentity`),
    deliveryStatus: optionalText(value.deliveryStatus),
    deliveryRef: optionalSha(value.deliveryRef, `${label}.deliveryRef`),
    sourceTree: optionalSha(value.sourceTree, `${label}.sourceTree`),
    repositories: normalizeRepositories(value.repositories, `${label}.repositories`),
    executionRecord: normalizeExecution(value.executionRecord, `${label}.executionRecord`),
    activation: optionalText(value.activation) || 'unknown',
    environmentCleanup: optionalText(value.environmentCleanup) || 'unknown',
    diagnostics: optionalText(value.diagnostics) || 'unknown',
    reason: optionalText(value.reason),
    diagnosticRef: optionalText(value.diagnosticRef),
  };
}

function normalizeSelfBootstrap(value, expectedTaskId, expectedRunId, label) {
  if (!value) return { status: 'unknown', taskId: expectedTaskId, runId: null, runIdMismatch: false, resultIdentity: null, activationIdentity: null, planIdentity: null, carrierIdentity: null, deliveredRef: null, sourceTree: null, diagnosticRef: null, reason: 'self-bootstrap-evidence-missing' };
  closed(value, ALLOWED_SELF_BOOTSTRAP_FIELDS, label);
  if (value.taskId != null && value.taskId !== expectedTaskId) throw new Error(`${label}.taskId does not match task entry.`);
  const runId = optionalRunIdentity(value.runId, `${label}.runId`);
  const runIdMismatch = expectedRunId != null && runId != null && runId !== expectedRunId;
  if (!['passed', 'not-applicable', 'blocked', 'failed'].includes(value.status)) throw new Error(`${label}.status is not supported.`);
  const resultIdentity = identity(value.resultIdentity || value.identity, `${label}.resultIdentity`);
  return {
    status: value.status === 'passed' || value.status === 'not-applicable' ? value.status : 'blocked',
    taskId: expectedTaskId,
    runId,
    runIdMismatch,
    resultIdentity,
    activationIdentity: identity(value.activationIdentity, `${label}.activationIdentity`),
    planIdentity: identity(value.planIdentity, `${label}.planIdentity`),
    carrierIdentity: identity(value.carrierIdentity, `${label}.carrierIdentity`),
    deliveredRef: optionalSha(value.deliveredRef, `${label}.deliveredRef`),
    sourceTree: optionalSha(value.sourceTree, `${label}.sourceTree`),
    diagnosticRef: optionalText(value.diagnosticRef),
    reason: optionalText(value.reason),
  };
}

function correlateEntry(entry, expectedTaskId) {
  const environment = normalizeEnvironment(entry.environment, expectedTaskId, `${expectedTaskId}.environment`);
  const development = normalizeDevelopment(entry.development, expectedTaskId, `${expectedTaskId}.development`);
  const finish = normalizeFinish(entry.finish, expectedTaskId, `${expectedTaskId}.finish`);
  const selfBootstrap = normalizeSelfBootstrap(entry.selfBootstrap, expectedTaskId, finish.runId, `${expectedTaskId}.selfBootstrap`);
  const findings = [];
  if (finish.status === 'unknown' || finish.status === 'blocked') findings.push(finding('task-finish', finish.status === 'unknown' ? 'finish-evidence-missing' : 'finish-evidence-blocked', finish.reason || 'Finish delivery evidence is not current.'));
  if (development.status !== 'passed') findings.push(finding('task-development', 'development-not-current', development.reason || 'Task Development handoff is not current.'));
  if (environment.status !== 'passed') findings.push(finding('task-environment', 'environment-not-ready', environment.reason || 'Task Environment evidence is not ready.'));
  if (selfBootstrap.status === 'unknown') findings.push(finding('self-bootstrap', 'activation-evidence-missing', selfBootstrap.reason || 'Matching self-bootstrap evidence is missing.', 'unknown'));
  if (selfBootstrap.status === 'blocked') findings.push(finding('self-bootstrap', 'activation-blocked', selfBootstrap.reason || 'Matching self-bootstrap is blocked.'));
  if (selfBootstrap.runIdMismatch) findings.push(finding('self-bootstrap', 'run-identity-mismatch', 'Self-bootstrap run does not match Finish run.'));
  if (finish.handoffIdentity && development.handoffIdentity && finish.handoffIdentity !== development.handoffIdentity) findings.push(finding('task-finish', 'handoff-identity-mismatch', 'Finish handoff identity does not match current Development handoff.'));
  if (finish.candidateIdentity && development.candidateIdentity && finish.candidateIdentity !== development.candidateIdentity) findings.push(finding('task-finish', 'candidate-identity-mismatch', 'Finish Candidate identity does not match current Development Candidate.'));
  if (finish.candidateGeneration != null && development.candidateGeneration != null && finish.candidateGeneration !== development.candidateGeneration) findings.push(finding('task-finish', 'candidate-generation-mismatch', 'Finish Candidate generation does not match current Development generation.'));
  if (finish.contentTargetIdentity && development.contentTargetIdentity && finish.contentTargetIdentity !== development.contentTargetIdentity) findings.push(finding('task-finish', 'content-target-mismatch', 'Finish Content Target identity does not match current Development target.'));
  const finishCarrierIdentities = new Set(finish.repositories.map((repository) => repository.carrierIdentity).filter(Boolean));
  if (selfBootstrap.carrierIdentity && finishCarrierIdentities.size && !finishCarrierIdentities.has(selfBootstrap.carrierIdentity)) findings.push(finding('self-bootstrap', 'carrier-identity-mismatch', 'Self-bootstrap carrier does not match Finish delivery carrier.'));
  if (selfBootstrap.deliveredRef && finish.deliveryRef && selfBootstrap.deliveredRef !== finish.deliveryRef) findings.push(finding('self-bootstrap', 'delivered-ref-mismatch', 'Self-bootstrap delivered ref does not match Finish delivery ref.'));
  if (selfBootstrap.sourceTree && finish.sourceTree && selfBootstrap.sourceTree !== finish.sourceTree) findings.push(finding('self-bootstrap', 'source-tree-mismatch', 'Self-bootstrap source tree does not match Finish source tree.'));
  const status = findings.some((item) => item.severity === 'blocked') ? 'blocked' : findings.some((item) => item.severity === 'unknown') ? 'unknown' : findings.some((item) => item.severity === 'attention') ? 'attention' : 'passed';
  return { taskId: expectedTaskId, status, environment, development, finish, selfBootstrap, findings };
}

function correlateReleaseEntry(entry, expectedTaskId) {
  const environment = normalizeEnvironment(entry.environment, expectedTaskId, `${expectedTaskId}.environment`);
  const development = normalizeDevelopment(entry.development, expectedTaskId, `${expectedTaskId}.development`);
  const finish = normalizeFinish(entry.finish, expectedTaskId, `${expectedTaskId}.finish`);
  const selfBootstrap = normalizeSelfBootstrap(entry.selfBootstrap, expectedTaskId, finish.runId, `${expectedTaskId}.selfBootstrap`);
  const findings = [];
  if (environment.status !== 'passed') findings.push(finding('task-environment', 'environment-not-ready', environment.reason || 'Release coordination Task Environment evidence is not ready.'));
  const status = findings.some((item) => item.severity === 'blocked') ? 'blocked' : 'passed';
  return { taskId: expectedTaskId, status, environment, development, finish, selfBootstrap, findings };
}

function taskSet(releaseTask, supportTasks) {
  const items = [releaseTask, ...supportTasks];
  const ids = items.map((item) => item.taskId);
  if (new Set(ids).size !== ids.length) throw new Error('Release/support Task IDs must be unique.');
  return ids;
}

function normalizeTaskEvidence(value, expectedIds, releaseTaskId) {
  if (!Array.isArray(value)) throw new Error('taskEvidence must be an array.');
  const entries = value.map((item, index) => {
    closed(item, ALLOWED_ENTRY_FIELDS, `taskEvidence[${index}]`);
    const id = taskId(item.taskId, `taskEvidence[${index}].taskId`);
    return id === releaseTaskId ? correlateReleaseEntry(item, id) : correlateEntry(item, id);
  }).sort((left, right) => left.taskId.localeCompare(right.taskId));
  const actual = entries.map((item) => item.taskId);
  if (new Set(actual).size !== actual.length) throw new Error('taskEvidence Task IDs must be unique.');
  if (actual.length !== expectedIds.length || actual.some((id, index) => id !== [...expectedIds].sort()[index])) throw new Error('taskEvidence must contain exactly the release/support Task IDs.');
  return entries;
}

export function createReleaseTaskEvidenceCorrelation(input) {
  closed(input, new Set(['releaseTask', 'releaseTaskStatus', 'retrospectiveSources', 'supportTasks', 'taskEvidence', 'source']), 'release task evidence correlation input');
  const releaseTaskStatus = input.releaseTaskStatus || 'active';
  if (!['active', 'completed'].includes(releaseTaskStatus)) throw new Error('releaseTaskStatus must be active or completed.');
  const releaseTask = taskProjection(input.releaseTask, 'releaseTask', releaseTaskStatus);
  const supportTasks = [...(input.supportTasks || [])].map((item, index) => taskProjection(item, `supportTasks[${index}]`)).sort((left, right) => left.taskId.localeCompare(right.taskId));
  const retrospectiveSources = [...(input.retrospectiveSources || [])].map((item, index) => taskProjection(item, `retrospectiveSources[${index}]`)).sort((left, right) => left.taskId.localeCompare(right.taskId));
  const ids = taskSet(releaseTask, supportTasks);
  const entries = normalizeTaskEvidence(input.taskEvidence, ids, releaseTask.taskId);
  const source = input.source == null ? null : (() => {
    closed(input.source, new Set(['sourceCommit', 'sourceTree', 'remoteRef']), 'source');
    return {
      sourceCommit: optionalSha(input.source.sourceCommit, 'source.sourceCommit'),
      sourceTree: optionalSha(input.source.sourceTree, 'source.sourceTree'),
      remoteRef: optionalSha(input.source.remoteRef, 'source.remoteRef'),
    };
  })();
  const status = entries.some((item) => item.status === 'blocked') ? 'blocked' : entries.some((item) => item.status === 'unknown') ? 'unknown' : entries.some((item) => item.status === 'attention') ? 'attention' : 'passed';
  const value = {
    schemaVersion: RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA,
    status,
    releaseTask,
    retrospectiveSources,
    supportTasks,
    source,
    entries,
  };
  value.identity = digest(value);
  return value;
}

export function validateReleaseTaskEvidenceCorrelation(value) {
  closed(value, new Set(['schemaVersion', 'status', 'releaseTask', 'retrospectiveSources', 'supportTasks', 'source', 'entries', 'identity']), 'release task evidence correlation');
  if (value.schemaVersion !== RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA || !DIGEST.test(value.identity || '')) throw new Error('Release task evidence correlation schema/identity is invalid.');
  const recreated = createReleaseTaskEvidenceCorrelation({ releaseTask: value.releaseTask, releaseTaskStatus: value.releaseTask.status, retrospectiveSources: value.retrospectiveSources, supportTasks: value.supportTasks, source: value.source, taskEvidence: value.entries.map((entry) => ({
    taskId: entry.taskId,
    environment: entry.environment,
    development: entry.development,
    finish: entry.finish,
    selfBootstrap: entry.selfBootstrap ? {
      schemaVersion: entry.selfBootstrap.schemaVersion,
      status: entry.selfBootstrap.status,
      taskId: entry.selfBootstrap.taskId,
      runId: entry.selfBootstrap.runId,
      resultIdentity: entry.selfBootstrap.resultIdentity,
      activationIdentity: entry.selfBootstrap.activationIdentity,
      planIdentity: entry.selfBootstrap.planIdentity,
      carrierIdentity: entry.selfBootstrap.carrierIdentity,
      deliveredRef: entry.selfBootstrap.deliveredRef,
      sourceTree: entry.selfBootstrap.sourceTree,
      diagnosticRef: entry.selfBootstrap.diagnosticRef,
      reason: entry.selfBootstrap.reason,
    } : null,
  })) });
  if (recreated.status !== value.status) throw new Error('Release task evidence correlation status mismatch.');
  if (recreated.identity !== value.identity) throw new Error(`Release task evidence correlation identity mismatch: ${value.identity} != ${recreated.identity}.`);
  return recreated;
}

export function inspectReleaseTaskEvidenceCorrelation(value) {
  const validated = validateReleaseTaskEvidenceCorrelation(value);
  return {
    schemaVersion: `${RELEASE_TASK_EVIDENCE_CORRELATION_SCHEMA}-inspect`,
    status: validated.status,
    identity: validated.identity,
    releaseTaskId: validated.releaseTask.taskId,
    supportTaskIds: validated.supportTasks.map((item) => item.taskId),
    entries: validated.entries.map((entry) => ({ taskId: entry.taskId, status: entry.status, findings: entry.findings })),
  };
}

function runtimeTaskProjection(runtime, root, taskId) {
  const observed = runtime.inspectTaskRecord(root, taskId);
  const record = observed?.record;
  return { taskId: record?.taskId || taskId, title: record?.title || '', status: record?.status || 'unknown', recordDigest: observed?.recordDigest || null };
}

function runtimeEnvironmentProjection(runtime, root, taskId) {
  const observed = runtime.readTaskEnvironmentCurrent?.(root, taskId) || runtime.inspectTaskEnvironment?.(root, taskId) || null;
  const environment = observed?.environment || observed?.receipt || {};
  return observed ? {
    taskId,
    status: observed.status || 'unknown',
    receiptIdentity: environment.identity || environment.receiptIdentity || observed.receiptDigest || null,
    receiptDigest: observed.receiptDigest || null,
    declarationIdentity: environment.preparationDeclarations?.find((item) => item.project === 'product')?.preparedIdentity || null,
    executionIdentity: environment.runtime?.executionIdentity || environment.node?.executionIdentity || null,
    reason: observed.diagnostic?.message || null,
    diagnosticRef: observed.diagnostic?.code || null,
  } : null;
}

function runtimeDevelopmentProjection(runtime, root, taskId) {
  const observed = runtime.inspectTaskDevelopment?.(root, taskId) || null;
  const development = observed?.development || observed;
  const receipt = development?.receipt || {};
  const applicability = development?.applicability || {};
  const handoff = applicability.handoff === 'current' ? receipt.handoffs?.at(-1) || null : null;
  return development ? {
    taskId,
    status: handoff ? 'current' : applicability.status || 'unknown',
    receiptIdentity: observed?.development?.receiptDigest || observed?.receiptDigest || null,
    handoffIdentity: handoff?.identity || null,
    candidateIdentity: handoff?.candidate?.identity || receipt.candidate?.identity || null,
    candidateGeneration: handoff?.candidate?.generation ?? receipt.candidate?.generation ?? null,
    contentTargetIdentity: handoff?.candidate?.contentTargetIdentity || receipt.contentTarget?.identity || null,
    taskContextIdentity: receipt.taskContext?.identity || null,
    contributionIdentity: handoff?.contributionHandoff?.identity || null,
    reason: (applicability.reasons || [])[0]?.code || null,
    diagnosticRef: null,
  } : null;
}

function runtimeFinishProjection(runtime, root, taskId) {
  const observed = runtime.inspectTaskFinishReadModel?.({ root, taskId }) || null;
  const result = observed?.result || null;
  if (!result) return null;
  const resultIdentity = result.identity?.run || result.resultIdentity || digest(result);
  const repositories = (result.identity?.repositories || result.repositories || []).map((item) => ({
    selector: item.selector,
    disposition: item.disposition,
    carrierIdentity: item.deliveryCarrier?.identity || item.carrierIdentity || null,
    carrierRef: item.deliveryCarrier?.head || item.carrierRef || null,
    remote: item.remote || null,
    targetBranch: item.targetBranch || null,
    deliveryStatus: item.delivery?.status || item.status || null,
    finalRemoteRef: item.delivery?.finalRemoteRef || item.finalRemoteRef || null,
  }));
  return {
    taskId,
    status: result.status,
    runId: result.runId || null,
    resultIdentity,
    handoffIdentity: result.identity?.handoffIdentity || result.handoff?.identity || null,
    candidateIdentity: result.identity?.candidateIdentity || result.candidate?.identity || null,
    candidateGeneration: result.identity?.candidateGeneration || result.candidate?.generation || null,
    contentTargetIdentity: result.identity?.contentTargetIdentity || result.candidate?.contentTargetIdentity || null,
    deliveryStatus: result.delivery?.status || (result.status === 'complete' ? 'delivered' : null),
    deliveryRef: result.delivery?.finalRemoteRef || result.delivery?.remoteAfterRef || null,
    sourceTree: result.delivery?.carrierTree || result.carrier?.tree || null,
    repositories,
    executionRecord: result.executionRecord ? {
      recordId: result.executionRecord.recordId,
      identity: result.executionRecord.identity || null,
      status: result.executionRecord.status,
      outcome: result.executionRecord.outcome,
      lifecycleStatus: result.executionRecord.lifecycleStatus,
      evidenceIdentity: result.executionRecord.evidenceIdentity || null,
    } : null,
    activation: result.maintenance?.activation || result.delivery?.activation?.status || null,
    environmentCleanup: result.maintenance?.environmentCleanup || result.completion?.cleanup?.status || null,
    diagnostics: result.maintenance?.diagnostics || result.executionRecord?.status || null,
    diagnosticRef: result.primaryFailure?.code || null,
  };
}

function runtimeSelfBootstrapProjection(runtime, root, taskId) {
  const observed = runtime.inspectTaskFinishReadModel?.({ root, taskId }) || null;
  const result = observed?.result || null;
  const evidence = result?.maintenance?.selfBootstrap || null;
  if (!evidence) return null;
  return {
    schemaVersion: evidence.schemaVersion,
    status: evidence.status,
    taskId: evidence.taskId || taskId,
    runId: evidence.runId ?? result.runId ?? null,
    resultIdentity: evidence.resultIdentity || null,
    reason: evidence.status === 'blocked' ? 'matching-self-bootstrap-blocked' : null,
  };
}

export function createReleaseTaskEvidenceCorrelationFromRuntime({ runtime, root, releaseTask, releaseTaskStatus = 'active', supportTasks = [], retrospectiveSources = [], selfBootstrapResults = {}, source = null }) {
  const taskIds = [releaseTask, ...supportTasks].map((item) => typeof item === 'string' ? item : item.taskId);
  const taskEvidence = taskIds.map((taskId) => ({
    taskId,
    environment: runtimeEnvironmentProjection(runtime, root, taskId),
    development: runtimeDevelopmentProjection(runtime, root, taskId),
    finish: runtimeFinishProjection(runtime, root, taskId),
    selfBootstrap: selfBootstrapResults[taskId] || runtimeSelfBootstrapProjection(runtime, root, taskId),
  }));
  return createReleaseTaskEvidenceCorrelation({
    releaseTask: typeof releaseTask === 'string' ? runtimeTaskProjection(runtime, root, releaseTask) : releaseTask,
    releaseTaskStatus,
    supportTasks: supportTasks.map((item) => typeof item === 'string' ? runtimeTaskProjection(runtime, root, item) : item),
    retrospectiveSources: retrospectiveSources.map((item) => typeof item === 'string' ? runtimeTaskProjection(runtime, root, item) : item),
    taskEvidence,
    source,
  });
}
