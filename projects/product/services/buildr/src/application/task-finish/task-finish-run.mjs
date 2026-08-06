import crypto from 'node:crypto';
import fs from 'node:fs';
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

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function canonicalFinishWorkspaceRoot(root) {
  const resolved = path.resolve(root);
  const marker = `${path.sep}.worktrees${path.sep}`;
  const index = resolved.indexOf(marker);
  return index >= 0 ? resolved.slice(0, index) : resolved;
}

export function finishRunRoot(root) {
  return path.join(canonicalFinishWorkspaceRoot(root), '.buildr', 'task-finish', 'runs');
}

export function finishRunFile(root, runId) {
  if (!RUN_ID_PATTERN.test(String(runId || ''))) throw new Error('Task Finish run id must use lowercase letters, numbers, dots, underscores, or hyphens.');
  const directory = finishRunRoot(root);
  const file = path.resolve(directory, `${runId}.json`);
  if (path.dirname(file) !== directory) throw new Error('Task Finish run path escapes the canonical run root.');
  return file;
}

export function acquireFinishTargetLease({ file, run, root = null, runtime = null, targetIdentity = null, clock = Date.now }) {
  if (runtime?.acquireTaskFinishTargetLease) {
    return runtime.acquireTaskFinishTargetLease(root || run.identity.workspaceRoot, { run, targetIdentity: targetIdentity || run.identity.targetBranch, clock });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = crypto.randomUUID();
  const currentTime = clock();
  const value = {
    schemaVersion: 'buildr.task-finish-target-lease/v1',
    runId: run.runId,
    task: run.identity.task,
    targetBranch: run.identity.targetBranch,
    token,
    acquiredAt: new Date(currentTime).toISOString(),
    expiresAt: new Date(currentTime + 60_000).toISOString(),
  };
  try {
    const descriptor = fs.openSync(file, 'wx');
    try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); } finally { fs.closeSync(descriptor); }
    return { file, token, value };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* malformed is still occupied */ }
    if (existing && Date.parse(existing.expiresAt) <= currentTime) {
      fs.unlinkSync(file);
      return acquireFinishTargetLease({ file, run, clock });
    }
    return { blocked: true, file, existing };
  }
}

export function releaseFinishTargetLease(lease, { root = null, runtime = null } = {}) {
  if (runtime?.releaseTaskFinishTargetLease) {
    runtime.releaseTaskFinishTargetLease(root || lease?.value?.workspaceRoot || process.cwd(), lease);
    return;
  }
  if (!lease?.file || !lease.token || !fs.existsSync(lease.file)) return;
  try {
    const current = JSON.parse(fs.readFileSync(lease.file, 'utf8'));
    if (current.token === lease.token) fs.unlinkSync(lease.file);
  } catch { /* retain malformed or replaced lease */ }
}

export function finishCompletionFile(root, runId) {
  if (!RUN_ID_PATTERN.test(String(runId || ''))) throw new Error('Task Finish completion run id is invalid.');
  const directory = path.join(canonicalFinishWorkspaceRoot(root), '.buildr', 'task-finish', 'completed');
  const file = path.resolve(directory, `${runId}.json`);
  if (path.dirname(file) !== directory) throw new Error('Task Finish completion path escapes the canonical completion root.');
  return file;
}

export function writeFinishCompletion({ root, runId, completion, runtime = null }) {
  if (runtime?.writeTaskFinishCompletionPersistence) {
    const persisted = runtime.writeTaskFinishCompletionPersistence(root, {
      taskId: completion?.task || completion?.identity?.task,
      runId,
      result: completion,
      status: completion?.status === 'complete' ? 'complete' : 'cleanup_pending',
    });
    return persisted?.file || persisted;
  }
  const file = finishCompletionFile(root, runId);
  atomicWriteJson(file, completion);
  return file;
}

export function readFinishCompletion({ root, runId, runtime = null }) {
  if (runtime?.readTaskFinishCompletionPersistence) {
    return runtime.readTaskFinishCompletionPersistence(root, { runId }, { optional: true })?.completion || null;
  }
  const file = finishCompletionFile(root, runId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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
  if (runtime?.readTaskFinishRunPersistence) {
    const current = runtime.readTaskFinishRunPersistence(root, { taskId: normalized.task }, { optional: true });
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
  const file = finishRunFile(root, actualRunId);
  if (fs.existsSync(file)) return readFinishRun({ root, runId: actualRunId });
  const createdAt = now(clock);
  const run = {
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
  };
  atomicWriteJson(file, run);
  return clone(run);
}

export function readFinishRun({ root, runId, runtime = null }) {
  if (runtime?.readTaskFinishRunPersistence) {
    const current = runtime.readTaskFinishRunPersistence(root, { runId }, { optional: true });
    if (!current) throw new Error(`Unknown Task Finish run: ${runId}`);
    return current.run;
  }
  const file = finishRunFile(root, runId);
  if (!fs.existsSync(file)) throw new Error(`Unknown Task Finish run: ${runId}`);
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (run.schemaVersion !== FINISH_RUN_SCHEMA) throw new Error(`Unsupported Task Finish run schema: ${run.schemaVersion}`);
  if (!Array.isArray(run.phases) || FINISH_PHASES.some((id) => !run.phases.some((item) => item.id === id))) {
    throw new Error(`Task Finish run has an invalid phase model: ${runId}`);
  }
  for (const field of ['handoffIdentity', 'candidateIdentity', 'contentTargetIdentity']) if (typeof run.identity?.[field] !== 'string' || !run.identity[field]) throw new Error(`Task Finish run has an invalid Development handoff identity: ${runId}`);
  if (!Number.isInteger(run.identity?.candidateGeneration) || run.identity.candidateGeneration < 1) throw new Error(`Task Finish run has an invalid Candidate generation: ${runId}`);
  return run;
}

function writeRun(root, run, clock, runtime = null) {
  run.updatedAt = now(clock);
  if (runtime?.writeTaskFinishRunPersistence) {
    runtime.writeTaskFinishRunPersistence(root, run);
    return;
  }
  atomicWriteJson(finishRunFile(root, run.runId), run);
}

function resumableRunCandidates(root, identity, runtime = null) {
  if (runtime?.readTaskFinishRunPersistence) {
    const current = runtime.readTaskFinishRunPersistence(root, { taskId: identity.task }, { optional: true });
    return ['blocked', 'cleanup_pending'].includes(current?.run?.status) && current.run.identityDigest === sha256(normalizeIdentity(identity)) ? [current.run] : [];
  }
  const directory = finishRunRoot(root);
  if (!fs.existsSync(directory)) return [];
  const expected = sha256(normalizeIdentity(identity));
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        const value = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
        return value.schemaVersion === FINISH_RUN_SCHEMA && value.identityDigest === expected && value.status === 'blocked' ? [value] : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
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
  const current = runtime?.readTaskFinishRunPersistence?.(root, { runId }, { optional: true });
  if (current) return finishResult(current.run, clock);
  const completed = runtime?.readTaskFinishCompletionPersistence?.(root, { runId }, { optional: true });
  if (completed?.completion?.result) return completed.completion.result;
  if (runtime) throw new Error(`Unknown Task Finish run: ${runId}`);
  return finishResult(readFinishRun({ root, runId }), clock);
}

function regularJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name));
}

function completionDiagnostic(file, code, message) {
  return { code, message, file: path.basename(file) };
}

function validateCompletion(value, taskId, file) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('completion 必须是对象。');
  if (value.schemaVersion !== 'buildr.task-finish-completion/v1') throw new Error(`completion schemaVersion 不受支持：${value.schemaVersion || 'missing'}。`);
  if (value.task !== taskId) throw new Error(`completion Task identity 不匹配：${value.task || 'missing'}。`);
  if (value.status !== 'complete') throw new Error(`completion status 不是 complete：${value.status || 'missing'}。`);
  for (const field of ['runId', 'handoffIdentity', 'candidateIdentity', 'contentTargetIdentity', 'carrierIdentity', 'carrierRef', 'completedAt']) {
    if (typeof value[field] !== 'string' || !value[field]) throw new Error(`completion 缺少 ${field}。`);
  }
  if (value.finalRemoteRef !== undefined && (typeof value.finalRemoteRef !== 'string' || !value.finalRemoteRef)) throw new Error('completion finalRemoteRef 无效。');
  if (!Number.isInteger(value.candidateGeneration) || value.candidateGeneration < 1) throw new Error('completion candidateGeneration 无效。');
  if (Number.isNaN(Date.parse(value.completedAt))) throw new Error('completion completedAt 无效。');
  if (path.basename(file) !== `${value.runId}.json`) throw new Error('completion 文件名与 runId 不匹配。');
  return value;
}

export function readTaskFinishResults({ root, taskId, clock = Date.now, runtime = null }) {
  if (!RUN_ID_PATTERN.test(String(taskId || ''))) throw new Error('Task Finish query requires a valid Task ID.');
  if (runtime?.readTaskFinishResultsPersistence) return runtime.readTaskFinishResultsPersistence(root, taskId);
  const completionRoot = path.join(canonicalFinishWorkspaceRoot(root), '.buildr', 'task-finish', 'completed');
  const results = [];
  const diagnostics = [];
  for (const file of regularJsonFiles(completionRoot)) {
    const name = path.basename(file, '.json');
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      if (name.startsWith(`${taskId}-`)) diagnostics.push(completionDiagnostic(file, 'task_finish_completion_invalid', `Finish completion 无法解析：${error.message}`));
      continue;
    }
    if (value?.task !== taskId) continue;
    try {
      const completion = validateCompletion(value, taskId, file);
      const run = readFinishRun({ root, runId: completion.runId });
      if (run.status !== 'complete' || run.completion?.status !== 'complete') throw new Error('matching Finish run 未完整完成 cleanup。');
      const result = finishResult(run, clock);
      for (const [left, right, label] of [
        [result.identity.task, completion.task, 'task'],
        [result.handoff.identity, completion.handoffIdentity, 'handoff'],
        [result.candidate.identity, completion.candidateIdentity, 'candidate'],
        [result.candidate.generation, completion.candidateGeneration, 'candidate generation'],
        [result.candidate.contentTargetIdentity, completion.contentTargetIdentity, 'content target'],
        [result.carrier?.identity, completion.carrierIdentity, 'carrier'],
        [result.delivery?.finalRemoteRef, completion.finalRemoteRef || completion.carrierRef, 'final remote ref'],
      ]) if (left !== right) throw new Error(`Finish run 与 completion 的 ${label} identity 不匹配。`);
      results.push({ result, completion });
    } catch (error) {
      diagnostics.push(completionDiagnostic(file, 'task_finish_completion_invalid', error.message));
    }
  }
  results.sort((left, right) => Date.parse(right.result.completedAt) - Date.parse(left.result.completedAt));
  return { taskId, results, diagnostics };
}
