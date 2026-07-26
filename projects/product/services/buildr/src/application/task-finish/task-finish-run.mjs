import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const FINISH_RUN_SCHEMA = 'buildr.task-finish-run/v1';
export const FINISH_PLAN_VERSION = 1;
const FINISH_RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export const FINISH_STEPS = Object.freeze([
  step('context', '核对 task environment execution binding 与 provider readiness'),
  step('current-knowledge', '收敛并检查 current knowledge', ['context']),
  step('contract-convergence', '完成 managed assets、OpenSpec 与 canonical convergence', ['current-knowledge']),
  step('candidate-commit', '建立 convergence candidate commit', ['contract-convergence']),
  step('target-convergence', 'fetch/rebase 目标分支并记录远端 observation', ['candidate-commit'], 'target-branch'),
  step('runtime-convergence', '执行 tree transition doctor 与 runtime sync', ['target-convergence'], 'runtime-sync'),
  step('formal-assurance', '调用 selected task-verification provider 执行 required assurance', ['runtime-convergence']),
  step('asset-review', '调用 selected task-asset-review provider finalize', ['formal-assurance']),
  step('archive', '归档 Change 并完成 closeout-only checks', ['asset-review'], 'canonical-checkout'),
  step('integration-push', '乐观核对目标 ref，集成并 push 目标分支', ['archive'], 'target-branch'),
  step('runtime-install', '从保留 checkout 迁移默认 CLI/Local App 入口', ['integration-push'], 'runtime-install'),
  step('asset-review-late', '仅在首次 finalize 后 observation revision 变化时再次调用 asset-review provider', ['runtime-install']),
  step('cleanup', '清理 task-owned transient evidence 与本地 environment', ['asset-review-late'], 'canonical-checkout'),
]);

function step(id, action, dependsOn = [], sharedResource = null) {
  return { id, action, dependsOn, sharedResource, invalidates: [], retryPolicy: { strategy: 'resume', maxAttempts: null } };
}

function now(clock) { return new Date(clock()).toISOString(); }
function digest(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24); }
function runRoot(root) { return path.resolve(root, '.buildr', 'task-finish', 'runs'); }
function runFile(root, runId) {
  if (!FINISH_RUN_ID_PATTERN.test(String(runId || ''))) throw new Error('Task Finish run id must use lowercase letters, numbers, dots, underscores, or hyphens.');
  const directory = runRoot(root);
  const file = path.resolve(directory, `${runId}.json`);
  if (path.dirname(file) !== directory) throw new Error('Task Finish run path escapes the canonical runs root.');
  return file;
}
function leaseRoot(root) { return path.join(root, '.buildr', 'task-finish', 'leases'); }
function completionRoot(root) {
  const marker = `${path.sep}.worktrees${path.sep}`;
  const index = path.resolve(root).indexOf(marker);
  const workspace = index >= 0 ? path.resolve(root).slice(0, index) : path.resolve(root);
  return path.join(workspace, '.buildr', 'task-finish', 'completed');
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function createFinishRun({ root, runId, task, change = null, targetBranch, remote = 'origin', session = null, clock = Date.now }) {
  if (!runId || !task || !targetBranch) throw new Error('runId, task and targetBranch are required');
  const file = runFile(root, runId);
  if (fs.existsSync(file)) return readFinishRun({ root, runId });
  const createdAt = now(clock);
  const run = {
    schemaVersion: FINISH_RUN_SCHEMA,
    planVersion: FINISH_PLAN_VERSION,
    runId, task, change, target: { branch: targetBranch, remote },
    status: 'active', createdAt, updatedAt: createdAt,
    sessions: session ? [session] : [],
    steps: FINISH_STEPS.map((definition) => ({
      ...clone(definition), status: 'pending', attempt: 0, attemptToken: null,
      inputFingerprint: null, effects: [], evidence: [], blocked: null,
      startedAt: null, completedAt: null, lease: null, executionPlan: null, attempts: [],
    })),
  };
  atomicWriteJson(file, run);
  return run;
}

export function readFinishRun({ root, runId }) {
  const file = runFile(root, runId);
  if (!fs.existsSync(file)) throw new Error(`Unknown Task Finish run: ${runId}`);
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (run.schemaVersion !== FINISH_RUN_SCHEMA) throw new Error(`Unsupported Task Finish run schema: ${run.schemaVersion}`);
  if (run.status !== 'complete') {
    for (const definition of FINISH_STEPS) {
      if (!run.steps.some((item) => item.id === definition.id)) {
        run.steps.splice(FINISH_STEPS.findIndex((item) => item.id === definition.id), 0, {
          ...clone(definition), status: 'pending', attempt: 0, attemptToken: null, inputFingerprint: null,
          effects: [], evidence: [], blocked: null, startedAt: null, completedAt: null, lease: null, executionPlan: null, attempts: [],
        });
      }
    }
    for (const definition of FINISH_STEPS) run.steps.find((item) => item.id === definition.id).dependsOn = [...definition.dependsOn];
  }
  for (const item of run.steps) {
    item.executionPlan ??= null;
    item.attempts ??= [];
  }
  return run;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function validateFinishExecutionPlan({ root, plan }) {
  if (plan == null) return null;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('execution plan must be an object.');
  const cwd = path.resolve(plan.cwd || root);
  if (!isWithin(root, cwd)) throw new Error(`execution plan cwd is outside the allowed execution root: ${cwd}`);
  const command = plan.command ? path.resolve(plan.command) : null;
  if (command && (!path.isAbsolute(plan.command) || !fs.existsSync(command))) throw new Error(`execution plan command must be an existing absolute path: ${plan.command}`);
  const commandSource = plan.commandSource || 'environment-local';
  if (command && commandSource === 'environment-local' && !isWithin(root, command)) throw new Error(`execution plan command is outside the receipt-bound environment: ${command}`);
  if (!['environment-local', 'external-declared'].includes(commandSource)) throw new Error(`execution plan command source is unsupported: ${commandSource}`);
  const args = Array.isArray(plan.args) && plan.args.every((value) => typeof value === 'string') ? [...plan.args] : [];
  if (plan.args && args.length !== plan.args.length) throw new Error('execution plan args must be strings.');
  let packageRoot = null;
  if (plan.npmScript) {
    packageRoot = path.resolve(plan.packageRoot || cwd);
    if (!isWithin(root, packageRoot)) throw new Error(`execution plan package root is outside the allowed execution root: ${packageRoot}`);
    const manifestPath = path.join(packageRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`execution plan package manifest does not exist: ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.scripts?.[plan.npmScript]) {
      const available = Object.keys(manifest.scripts || {}).sort().join(', ') || 'none';
      throw new Error(`execution plan npm script does not exist: ${plan.npmScript}; available: ${available}`);
    }
  }
  if (plan.verificationSelector && (!Array.isArray(plan.availableSelectors) || !plan.availableSelectors.includes(plan.verificationSelector))) {
    throw new Error(`execution plan verification selector is not declared: ${plan.verificationSelector}`);
  }
  return {
    cwd, command, commandSource, args, packageRoot, npmScript: plan.npmScript || null,
    verificationSelector: plan.verificationSelector || null,
    availableSelectors: Array.isArray(plan.availableSelectors) ? [...plan.availableSelectors] : null,
    sharedMutation: plan.sharedMutation !== false,
    safeAuto: plan.safeAuto === true,
    safeHandler: typeof plan.safeHandler === 'string' ? plan.safeHandler : null,
    evidenceId: typeof plan.evidenceId === 'string' ? plan.evidenceId : null,
    jsonAssertion: plan.jsonAssertion && typeof plan.jsonAssertion.path === 'string'
      ? { path: plan.jsonAssertion.path, equals: plan.jsonAssertion.equals }
      : null,
    observations: Array.isArray(plan.observations) ? plan.observations.map((entry) => validateFinishExecutionPlan({ root, plan: { ...entry, sharedMutation: false, safeAuto: true } })) : [],
    stages: Array.isArray(plan.stages) ? plan.stages.map((entry) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : null,
      parallel: entry.parallel === true,
      commands: Array.isArray(entry.commands)
        ? entry.commands.map((commandPlan) => validateFinishExecutionPlan({ root, plan: { ...commandPlan, sharedMutation: false, safeAuto: true } }))
        : [],
    })) : [],
  };
}

function effectiveFingerprint(fingerprint, plan) {
  if (!plan) return fingerprint;
  return `${fingerprint || ''}:plan-${digest(JSON.stringify(plan))}`;
}

function descendants(run, stepId) {
  const result = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of run.steps) {
      if (!result.has(candidate.id) && candidate.dependsOn.some((dependency) => dependency === stepId || result.has(dependency))) {
        result.add(candidate.id); changed = true;
      }
    }
  }
  return result;
}

function finishAttempt(item, outcome, attribution, clock) {
  const token = item.attemptToken;
  const attempt = item.attempts?.find((entry) => entry.token === token && entry.finishedAt == null);
  const finishedAt = now(clock);
  if (attempt) Object.assign(attempt, { finishedAt, durationMs: Math.max(0, clock() - Date.parse(attempt.startedAt)), outcome, attribution });
  item.lastAttemptToken = token || item.lastAttemptToken;
  item.attemptToken = null;
  item.completedAt = finishedAt;
}

function releaseOwnedLease(item) {
  if (!item.lease?.directory) { item.lease = null; return; }
  const file = path.join(item.lease.directory, 'lease.json');
  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (leaseIdentityMatches(existing, item)) removeLeasePath(item.lease.directory);
  item.lease = null;
}

function invalidate(run, stepId, reason, includeSelf = true, clock = Date.now) {
  const ids = descendants(run, stepId);
  if (includeSelf) ids.add(stepId);
  for (const id of ids) {
    const item = run.steps.find((candidate) => candidate.id === id);
    if (item.status === 'passed' || item.status === 'blocked' || item.status === 'running') {
      if (item.status === 'running') {
        releaseOwnedLease(item);
        finishAttempt(item, 'stale', 'input-changed', clock);
      }
      item.status = 'stale';
      item.blocked = { code: 'input-changed', reason, invalidatedBy: stepId };
      item.attemptToken = null; item.lease = null;
    }
  }
}

export function refreshFinishInputs(run, fingerprints = {}, clock = Date.now) {
  for (const [stepId, fingerprint] of Object.entries(fingerprints)) {
    const item = run.steps.find((candidate) => candidate.id === stepId);
    if (!item) throw new Error(`Unknown Task Finish step: ${stepId}`);
    if (item.inputFingerprint && item.inputFingerprint !== fingerprint) invalidate(run, stepId, `input fingerprint changed from ${item.inputFingerprint} to ${fingerprint}`, true, clock);
    item.inputFingerprint = fingerprint;
  }
  return run;
}

function leaseKey(run, item) {
  if (item.sharedResource === 'target-branch') return `${item.sharedResource}:${run.target.remote}/${run.target.branch}`;
  if (item.sharedResource === 'canonical-checkout') return `${item.sharedResource}:${run.target.branch}`;
  return item.sharedResource ? `${item.sharedResource}:workspace` : null;
}

function removeLeasePath(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function withLeaseMutationLock(directory, callback) {
  const lock = `${directory}.lock`;
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const busy = new Error('Shared resource lease metadata is being updated by another run.');
    busy.code = 'task_finish.lease_busy';
    throw busy;
  }
  try { return callback(); }
  finally { removeLeasePath(lock); }
}

function leaseIdentityMatches(existing, item) {
  return Boolean(existing
    && existing.key === item.lease?.key
    && existing.runId === item.lease?.runId
    && existing.step === item.lease?.step
    && existing.token === item.lease?.token);
}

function acquireLease({ root, run, item, token, clock, leaseTtlMs }) {
  const key = leaseKey(run, item);
  if (!key) return null;
  const directory = path.join(leaseRoot(root), digest(key));
  const file = path.join(directory, 'lease.json');
  const timestamp = clock();
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  return withLeaseMutationLock(directory, () => {
    if (fs.existsSync(directory)) {
      let existing = null;
      try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      if (existing && Date.parse(existing.expiresAt) > timestamp) {
        const blocked = new Error(`Shared resource lease is held by run ${existing.runId} until ${existing.expiresAt}`);
        blocked.code = 'task_finish.lease_held'; blocked.lease = existing; throw blocked;
      }
      removeLeasePath(directory);
    }
    fs.mkdirSync(directory);
    const lease = { schemaVersion: 'buildr.task-finish-lease/v1', key, runId: run.runId, step: item.id, token, acquiredAt: now(clock), expiresAt: new Date(timestamp + leaseTtlMs).toISOString() };
    atomicWriteJson(file, lease);
    return { ...lease, directory };
  });
}

function consumeLease(item, clock) {
  if (!item.lease?.directory) return { ok: true };
  const directory = item.lease.directory;
  return withLeaseMutationLock(directory, () => {
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(path.join(directory, 'lease.json'), 'utf8')); } catch {}
    if (!leaseIdentityMatches(existing, item)) return { ok: false, code: 'lease-lost', reason: 'Shared resource lease is no longer owned by this attempt.', current: existing };
    if (Date.parse(existing.expiresAt) <= clock()) return { ok: false, code: 'lease-expired', reason: `Shared resource lease expired at ${existing.expiresAt}.`, current: existing };
    removeLeasePath(directory);
    return { ok: true };
  });
}

function clearLease(item) {
  item.lease = null;
}

export function renewFinishLease({ root, runId, attemptToken, clock = Date.now, leaseTtlMs = 600_000 }) {
  const run = readFinishRun({ root, runId });
  const item = nextStep(run);
  if (!item || item.status !== 'running' || item.attemptToken !== attemptToken || !item.lease?.directory) throw new Error('Current running attempt does not own a renewable lease.');
  const directory = item.lease.directory;
  const result = withLeaseMutationLock(directory, () => {
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(path.join(directory, 'lease.json'), 'utf8')); } catch {}
    if (!leaseIdentityMatches(existing, item)) return { ok: false, code: 'lease-lost', current: existing };
    if (Date.parse(existing.expiresAt) <= clock()) return { ok: false, code: 'lease-expired', current: existing };
    const renewed = { ...existing, expiresAt: new Date(clock() + leaseTtlMs).toISOString(), renewalCount: (existing.renewalCount || 0) + 1, renewedAt: now(clock) };
    atomicWriteJson(path.join(directory, 'lease.json'), renewed);
    return { ok: true, lease: renewed };
  });
  if (!result.ok) {
    const error = new Error(result.code === 'lease-expired' ? 'Shared resource lease has expired.' : 'Shared resource lease is no longer owned by this attempt.');
    error.code = `task_finish.${result.code}`;
    error.lease = result.current || null;
    throw error;
  }
  item.lease = { ...item.lease, ...result.lease };
  item.evidence.push({ id: `lease-renewal-${item.id}-${result.lease.renewalCount}`, type: 'lease-renewal', expiresAt: result.lease.expiresAt });
  run.updatedAt = now(clock);
  atomicWriteJson(runFile(root, runId), run);
  return inspectFinishRun(run);
}

function assertEvidence(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !value.id.trim()) throw new Error(`${label} must be an object with a stable non-empty id.`);
}

function completionIdentity({ item, fingerprint, effect, evidence, outcome }) {
  return {
    attemptToken: item.attemptToken,
    inputFingerprint: fingerprint,
    effectIds: effect ? [effect.id] : [],
    evidenceIds: evidence ? [evidence.id] : [],
    outcome,
  };
}

function sameCompletion(left, right) {
  return Boolean(left && right
    && left.attemptToken === right.attemptToken
    && left.inputFingerprint === right.inputFingerprint
    && left.outcome === right.outcome
    && JSON.stringify(left.effectIds) === JSON.stringify(right.effectIds)
    && JSON.stringify(left.evidenceIds) === JSON.stringify(right.evidenceIds));
}

function nextStep(run) {
  return run.steps.find((item) => ['pending', 'stale', 'blocked', 'running', 'prepared'].includes(item.status));
}

export function inspectFinishRun(run) {
  const current = nextStep(run) || null;
  const attempts = run.steps.flatMap((item) => (item.attempts || []).map((attempt) => ({ step: item.id, ...attempt })));
  const completedDurations = attempts.filter((attempt) => Number.isFinite(attempt.durationMs));
  const retryAttempts = completedDurations.filter((attempt) => attempt.number > 1);
  const wastedAttempts = completedDurations.filter((attempt) => attempt.outcome === 'blocked' || attempt.outcome === 'failed');
  const started = Date.parse(run.createdAt);
  const finished = run.status === 'complete' ? Date.parse(run.updatedAt) : Date.now();
  return {
    schemaVersion: 'buildr.task-finish-checkpoint/v1', runId: run.runId, task: run.task, change: run.change,
    status: run.status, currentStep: current?.id || null,
    completedEffects: run.steps.flatMap((item) => item.effects.map((effect) => ({ step: item.id, ...effect }))),
    validEvidence: run.steps.filter((item) => item.status === 'passed').flatMap((item) => item.evidence.map((evidence) => ({ step: item.id, ...evidence }))),
    blocked: run.steps.filter((item) => item.status === 'blocked').map((item) => ({ step: item.id, ...item.blocked })),
    staleSteps: run.steps.filter((item) => item.status === 'stale').map((item) => item.id),
    timing: {
      wallClockMs: Math.max(0, finished - started),
      attemptCount: attempts.length,
      retryCount: retryAttempts.length,
      attributableWasteMs: wastedAttempts.reduce((total, attempt) => total + attempt.durationMs, 0),
      attempts,
    },
    nextAction: current ? { step: current.id, status: current.status, action: current.action, attemptToken: current.status === 'running' ? current.attemptToken : null, retryPolicy: current.retryPolicy, lease: current.lease } : null,
    steps: run.steps.map(({ id, status, attempt, inputFingerprint, effects, evidence, blocked, dependsOn, lease, executionPlan }) => ({ id, status, attempt, inputFingerprint, effects, evidence, blocked, dependsOn, lease, executionPlan })),
  };
}

function completionFile(root, runId) {
  if (!FINISH_RUN_ID_PATTERN.test(String(runId || ''))) throw new Error('Task Finish run id is invalid.');
  return path.join(completionRoot(root), `${runId}.json`);
}

export function prepareFinishCleanup({ root, runId, attemptToken, evidence, clock = Date.now }) {
  assertEvidence(evidence, 'evidence');
  const run = readFinishRun({ root, runId });
  const item = nextStep(run);
  if (!item || item.id !== 'cleanup' || item.status !== 'running' || item.attemptToken !== attemptToken) throw new Error('cleanup prepare requires the current running cleanup attempt.');
  const receiptFile = completionFile(root, runId);
  const preparedAt = now(clock);
  releaseOwnedLease(item);
  finishAttempt(item, 'prepared', 'none', clock);
  item.status = 'prepared';
  item.blocked = { code: 'cleanup-finalize-required', reason: 'Cleanup is prepared; finalize from the retained canonical Workspace after task-owned deletion succeeds.' };
  item.evidence.push(evidence);
  const receipt = {
    schemaVersion: 'buildr.task-finish-completion/v1', status: 'prepared', runId, task: run.task, change: run.change,
    target: run.target, preparedAt, environmentRoot: path.resolve(root), cleanupEvidence: evidence,
    effects: run.steps.flatMap((candidate) => candidate.effects.map((entry) => ({ step: candidate.id, id: entry.id }))),
    verificationEvidence: run.steps.find((candidate) => candidate.id === 'formal-assurance')?.evidence || [],
    archiveEvidence: run.steps.find((candidate) => candidate.id === 'archive')?.evidence || [],
  };
  atomicWriteJson(receiptFile, receipt);
  run.completionReceipt = receiptFile;
  run.updatedAt = preparedAt;
  atomicWriteJson(runFile(root, runId), run);
  return { ...compactFinishCheckpoint(inspectFinishRun(run)), completionReceipt: receiptFile, cleanup: { status: 'prepared' } };
}

export function finalizeFinishCleanup({ root, runId, evidence, clock = Date.now }) {
  assertEvidence(evidence, 'evidence');
  const receiptFile = completionFile(root, runId);
  if (!fs.existsSync(receiptFile)) throw new Error(`Prepared Task Finish completion receipt not found: ${runId}`);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  if (receipt.schemaVersion !== 'buildr.task-finish-completion/v1' || receipt.status !== 'prepared') throw new Error('Task Finish completion receipt is not prepared.');
  if (evidence.environmentRemoved !== true && evidence.environmentRetained !== true) throw new Error('cleanup finalize evidence must confirm environmentRemoved or environmentRetained.');
  const completed = { ...receipt, status: 'complete', completedAt: now(clock), finalCleanupEvidence: evidence };
  atomicWriteJson(receiptFile, completed);
  return { schemaVersion: 'buildr.task-finish-completion-result/v1', runId, status: 'complete', completionReceipt: receiptFile, cleanup: evidence };
}

export function compactFinishCheckpoint(checkpoint) {
  return {
    schemaVersion: 'buildr.task-finish-checkpoint-summary/v1',
    runId: checkpoint.runId, task: checkpoint.task, change: checkpoint.change,
    status: checkpoint.status, currentStep: checkpoint.currentStep,
    completedEffectCount: checkpoint.completedEffects.length,
    validEvidenceCount: checkpoint.validEvidence.length,
    blocked: checkpoint.blocked,
    staleSteps: checkpoint.staleSteps,
    timing: { ...checkpoint.timing, attempts: undefined },
    nextAction: checkpoint.nextAction,
    ...(checkpoint.safeExecution ? { safeExecution: checkpoint.safeExecution } : {}),
  };
}

export function advanceFinishRun({ root, runId, fingerprints = {}, outcome = null, attemptToken = null, effect = null, evidence = null, blocked = null, session = null, expectedTargetRef = null, observedTargetRef = null, refTransition = null, executionPlan = null, clock = Date.now, leaseTtlMs = 600_000 }) {
  const run = readFinishRun({ root, runId });
  const plannedItem = nextStep(run);
  let normalizedPlan;
  try { normalizedPlan = validateFinishExecutionPlan({ root, plan: executionPlan ?? plannedItem?.executionPlan }); }
  catch (error) {
    if (outcome || !plannedItem || plannedItem.status === 'running') throw error;
    plannedItem.status = 'blocked';
    plannedItem.blocked = { code: 'execution-plan-invalid', reason: error.message };
    plannedItem.completedAt = now(clock);
    run.updatedAt = plannedItem.completedAt;
    atomicWriteJson(runFile(root, runId), run);
    return inspectFinishRun(run);
  }
  const normalizedFingerprints = { ...fingerprints };
  if (plannedItem && Object.hasOwn(normalizedFingerprints, plannedItem.id) && normalizedFingerprints[plannedItem.id] !== plannedItem.inputFingerprint) normalizedFingerprints[plannedItem.id] = effectiveFingerprint(normalizedFingerprints[plannedItem.id], normalizedPlan);
  refreshFinishInputs(run, normalizedFingerprints, clock);
  if (session && !run.sessions.some((item) => item.handle === session.handle)) run.sessions.push(session);
  let item = nextStep(run);
  if (!item) return inspectFinishRun(run);

  if (outcome) {
    if (!['passed', 'blocked'].includes(outcome)) throw new Error(`Unsupported Task Finish outcome: ${outcome}`);
    const completedAttempt = run.steps.find((candidate) => candidate.status === 'passed' && candidate.lastAttemptToken === attemptToken);
    if (completedAttempt) {
      const repeatedFingerprint = normalizedFingerprints[completedAttempt.id] ?? completedAttempt.inputFingerprint;
      if (effect) assertEvidence(effect, 'effect');
      if (evidence) assertEvidence(evidence, 'evidence');
      const repeated = { attemptToken, inputFingerprint: repeatedFingerprint, effectIds: effect ? [effect.id] : [], evidenceIds: evidence ? [evidence.id] : [], outcome };
      if (!sameCompletion(completedAttempt.lastCompletion, repeated)) throw new Error(`Repeated completion for step ${completedAttempt.id} does not match the recorded result identity.`);
      return inspectFinishRun(run);
    }
    if (item.status !== 'running') {
      if (item.status === 'passed' && item.attemptToken === attemptToken) return inspectFinishRun(run);
      throw new Error(`Step ${item.id} is ${item.status}; no running attempt can accept ${outcome}`);
    }
    if (!attemptToken || item.attemptToken !== attemptToken) throw new Error(`Attempt token mismatch for step ${item.id}`);
    const submittedFingerprint = normalizedFingerprints[item.id] ?? item.inputFingerprint;
    if (submittedFingerprint !== item.inputFingerprint) throw new Error(`Input fingerprint mismatch for step ${item.id}`);
    if (outcome === 'passed') {
      if (typeof item.inputFingerprint !== 'string' || !item.inputFingerprint.trim()) throw new Error(`Step ${item.id} requires a non-empty input fingerprint before it can pass.`);
      assertEvidence(evidence, 'evidence');
      if (effect) assertEvidence(effect, 'effect');
      if (item.id === 'integration-push' && !refTransition && (!expectedTargetRef || !observedTargetRef)) throw new Error('integration-push requires refTransition or legacy expectedTargetRef/observedTargetRef observations.');
    }
    const leaseResult = consumeLease(item, clock);
    if (!leaseResult.ok) {
      clearLease(item);
      item.status = 'blocked';
      item.blocked = { code: leaseResult.code, reason: leaseResult.reason, currentLease: leaseResult.current || null };
      item.lastAttemptToken = item.attemptToken; item.attemptToken = null; item.completedAt = now(clock);
      const attempt = item.attempts.find((entry) => entry.token === attemptToken);
      if (attempt) Object.assign(attempt, { finishedAt: item.completedAt, durationMs: Math.max(0, clock() - Date.parse(attempt.startedAt)), outcome: 'blocked', attribution: leaseResult.code });
      run.updatedAt = now(clock);
      atomicWriteJson(runFile(root, runId), run);
      return inspectFinishRun(run);
    }
    clearLease(item);
    const transition = item.id === 'integration-push' ? refTransition : null;
    if (transition) {
      for (const key of ['expectedBeforePush', 'observedBeforePush', 'expectedAfterPush', 'observedAfterPush']) {
        if (typeof transition[key] !== 'string' || !transition[key]) throw new Error(`integration-push ref transition requires ${key}.`);
      }
    }
    const beforeRace = transition
      ? transition.observedBeforePush !== transition.expectedBeforePush && transition.observedBeforePush !== transition.expectedAfterPush
      : item.id === 'integration-push' && expectedTargetRef !== observedTargetRef;
    const afterMismatch = transition && transition.observedAfterPush !== transition.expectedAfterPush;
    if (item.id === 'integration-push' && (beforeRace || afterMismatch)) {
      const expected = transition ? (beforeRace ? transition.expectedBeforePush : transition.expectedAfterPush) : expectedTargetRef;
      const observed = transition ? (beforeRace ? transition.observedBeforePush : transition.observedAfterPush) : observedTargetRef;
      invalidate(run, 'target-convergence', `target-race: expected ${expected}, observed ${observed}`, true, clock);
      item.status = 'blocked';
      item.blocked = { code: 'target-race', reason: 'Remote target ref changed outside the declared transition', expectedTargetRef: expected, observedTargetRef: observed, refTransition: transition };
      item.lastAttemptToken = item.attemptToken; item.attemptToken = null; item.completedAt = now(clock);
      const attempt = item.attempts.find((entry) => entry.token === attemptToken);
      if (attempt) Object.assign(attempt, { finishedAt: item.completedAt, durationMs: Math.max(0, clock() - Date.parse(attempt.startedAt)), outcome: 'blocked', attribution: 'target-race' });
      run.updatedAt = now(clock);
      atomicWriteJson(runFile(root, runId), run);
      return inspectFinishRun(run);
    }
    if (effect && !item.effects.some((entry) => entry.id === effect.id)) item.effects.push(effect);
    const completedEvidence = transition ? { ...evidence, refTransition: transition, idempotent: transition.observedBeforePush === transition.expectedAfterPush } : evidence;
    if (completedEvidence && !item.evidence.some((entry) => entry.id === completedEvidence.id)) item.evidence.push(completedEvidence);
    item.completedAt = now(clock);
    const attempt = item.attempts.find((entry) => entry.token === attemptToken);
    if (attempt) Object.assign(attempt, { finishedAt: item.completedAt, durationMs: Math.max(0, clock() - Date.parse(attempt.startedAt)), outcome, attribution: outcome === 'blocked' ? (blocked?.code || 'provider-blocked') : 'none' });
    item.lastAttemptToken = item.attemptToken;
    item.lastCompletion = completionIdentity({ item, fingerprint: submittedFingerprint, effect, evidence: completedEvidence, outcome });
    item.attemptToken = null;
    if (outcome === 'passed') { item.status = 'passed'; item.blocked = null; }
    else if (outcome === 'blocked') { item.status = 'blocked'; item.blocked = blocked || { code: 'provider-blocked', reason: 'Provider action blocked' }; }
  } else {
    if (item.status === 'running') return inspectFinishRun(run);
    if (item.status === 'blocked') return inspectFinishRun(run);
    if (!item.dependsOn.every((dependency) => run.steps.find((candidate) => candidate.id === dependency)?.status === 'passed')) return inspectFinishRun(run);
    if (item.status === 'stale') item.status = 'pending';
    item.executionPlan = normalizedPlan;
    item.attempt += 1;
    item.attemptToken = crypto.randomUUID();
    item.lease = normalizedPlan?.sharedMutation === false ? null : acquireLease({ root, run, item, token: item.attemptToken, clock, leaseTtlMs });
    item.status = 'running'; item.startedAt = now(clock); item.blocked = null;
    item.attempts.push({ number: item.attempt, token: item.attemptToken, startedAt: item.startedAt, finishedAt: null, durationMs: null, outcome: 'running', attribution: item.attempt > 1 ? 'retry' : 'none', executionPlan: normalizedPlan });
  }
  const wouldComplete = run.steps.every((candidate) => candidate.status === 'passed');
  if (wouldComplete) {
    const unfinished = run.steps.flatMap((candidate) => candidate.attempts || []).filter((attempt) => attempt.finishedAt == null);
    const retainedLease = run.steps.find((candidate) => candidate.lease);
    if (unfinished.length || retainedLease) {
      item.status = 'blocked';
      item.blocked = { code: 'finish-invariant-failed', reason: `Cannot complete with ${unfinished.length} unfinished attempt(s)${retainedLease ? ` or retained lease on ${retainedLease.id}` : ''}.` };
      run.status = 'active';
    } else {
      run.status = 'complete';
      const receipt = {
        schemaVersion: 'buildr.task-finish-completion/v1', runId: run.runId, task: run.task, change: run.change,
        target: run.target, completedAt: now(clock),
        effects: run.steps.flatMap((candidate) => candidate.effects.map((entry) => ({ step: candidate.id, id: entry.id }))),
        evidence: run.steps.filter((candidate) => candidate.status === 'passed').flatMap((candidate) => candidate.evidence.map((entry) => ({ step: candidate.id, id: entry.id }))),
        timing: (() => { const timing = inspectFinishRun({ ...run, updatedAt: now(clock) }).timing; return { ...timing, attempts: undefined }; })(),
      };
      const receiptFile = path.join(completionRoot(root), `${run.runId}.json`);
      atomicWriteJson(receiptFile, receipt);
      run.completionReceipt = receiptFile;
    }
  } else run.status = 'active';
  run.updatedAt = now(clock);
  atomicWriteJson(runFile(root, runId), run);
  return inspectFinishRun(run);
}

export function resumeFinishRun(options) {
  const run = refreshFinishInputs(readFinishRun(options), options.fingerprints || {}, options.clock || Date.now);
  const current = nextStep(run);
  if (current?.status === 'blocked') { current.status = 'pending'; current.blocked = null; }
  for (const item of run.steps) {
    if (item.status === 'stale' && item.dependsOn.every((dependency) => run.steps.find((candidate) => candidate.id === dependency)?.status === 'passed')) {
      item.status = 'pending'; item.blocked = null;
    }
  }
  run.updatedAt = now(options.clock || Date.now);
  atomicWriteJson(runFile(options.root, options.runId), run);
  return advanceFinishRun(options);
}

async function defaultSafeCommand(command, args, options) {
  try { const result = await execFileAsync(command, args, options); return { status: 0, ...result }; }
  catch (error) { return { status: Number.isInteger(error.code) ? error.code : 1, stdout: error.stdout || '', stderr: error.stderr || error.message }; }
}

function registeredSafeHandler(plan, root) {
  const executable = path.basename(plan.command || '');
  if (plan.safeHandler === 'process-probe') return ['true', 'false'].includes(executable) && plan.args.length === 0;
  if (plan.safeHandler === 'verification-capability') return ['node', 'npm'].includes(executable) && (plan.npmScript || plan.args[0] === '--test');
  if (plan.safeHandler === 'git-observation') return executable === 'git' && ['status', 'rev-parse', 'merge-base', 'diff', 'ls-remote'].includes(plan.args[0]);
  const localBuildr = path.resolve(root, 'projects/product/buildr');
  if (plan.command !== localBuildr) return false;
  if (plan.safeHandler === 'buildr-doctor') return plan.args[0] === 'doctor' && plan.args.includes('--json');
  if (plan.safeHandler === 'buildr-openspec-check') return plan.args[0] === 'openspec' && plan.args[1] === 'check' && plan.args.includes('--json');
  if (plan.safeHandler === 'buildr-runtime-sync') return plan.args[0] === 'sync' && plan.args.includes('--target');
  if (['openspec-convergence', 'formal-verification'].includes(plan.safeHandler)) return plan.stages.length > 0 && plan.stages.every((stage) => stage.id && stage.commands.length > 0 && stage.commands.every((entry) => registeredSafeHandler(entry, root)));
  return false;
}

export async function executeSafeFinishRun({ root, runId, fingerprints = {}, executionPlans = {}, runCommand = defaultSafeCommand, clock = Date.now }) {
  const startedAt = clock();
  const executedSteps = [];
  while (true) {
    const checkpoint = inspectFinishRun(readFinishRun({ root, runId }));
    if (checkpoint.status === 'complete' || !checkpoint.nextAction) return { ...checkpoint, safeExecution: { status: 'complete', executedSteps, durationMs: clock() - startedAt } };
    const step = checkpoint.nextAction.step;
    if (checkpoint.nextAction.status === 'running' || checkpoint.nextAction.status === 'blocked') return { ...checkpoint, safeExecution: { status: 'stopped', reason: checkpoint.nextAction.status === 'blocked' ? 'resume-required' : 'step-already-running', step, executedSteps, durationMs: clock() - startedAt } };
    const plan = validateFinishExecutionPlan({ root, plan: executionPlans[step] });
    const commands = plan?.observations.length ? plan.observations : plan?.stages.length ? [] : plan ? [plan] : [];
    const allowedSharedMutation = (commands.length === 1 && plan?.safeHandler === 'buildr-runtime-sync') || ['openspec-convergence', 'formal-verification'].includes(plan?.safeHandler);
    if (!plan?.safeAuto || (plan.sharedMutation && !allowedSharedMutation) || !plan.evidenceId || commands.some((entry) => !registeredSafeHandler(entry, root))) {
      return { ...checkpoint, safeExecution: { status: 'stopped', reason: 'safe-plan-unavailable', step, executedSteps, durationMs: clock() - startedAt } };
    }
    const fingerprint = fingerprints[step];
    if (!fingerprint) return { ...checkpoint, safeExecution: { status: 'stopped', reason: 'fingerprint-missing', step, executedSteps, durationMs: clock() - startedAt } };
    const claimed = advanceFinishRun({ root, runId, fingerprints: { [step]: fingerprint }, executionPlan: plan, clock });
    const stageResults = [];
    const runOne = (entry) => runCommand(entry.command, entry.args, { cwd: entry.cwd, encoding: 'utf8' });
    if (plan.stages.length) {
      for (const stage of plan.stages) {
        const stageStarted = clock();
        const results = stage.parallel ? await Promise.all(stage.commands.map(runOne)) : [];
        if (!stage.parallel) for (const command of stage.commands) results.push(await runOne(command));
        stageResults.push({ id: stage.id, durationMs: clock() - stageStarted, results });
        if (results.some((result) => result.status !== 0)) break;
      }
    }
    const results = plan.stages.length ? stageResults.flatMap((stage) => stage.results) : await Promise.all(commands.map(runOne));
    const commandDescriptors = plan.stages.length ? plan.stages.flatMap((stage) => stage.commands) : commands;
    const assessed = results.map((result, index) => {
      const descriptor = commandDescriptors[index];
      const stdout = String(result.stdout || '').trim();
      const stderr = String(result.stderr || '').trim();
      let assertionPassed = true;
      if (result.status === 0 && descriptor.jsonAssertion) {
        try {
          const payload = JSON.parse(stdout);
          const actual = descriptor.jsonAssertion.path.split('.').filter(Boolean).reduce((value, key) => value?.[key], payload);
          assertionPassed = Object.is(actual, descriptor.jsonAssertion.equals);
        } catch { assertionPassed = false; }
      }
      return { ...result, stdout, stderr, assertionPassed };
    });
    const result = assessed.find((entry) => entry.status !== 0 || !entry.assertionPassed) || assessed[0];
    const passed = assessed.every((entry) => entry.status === 0 && entry.assertionPassed);
    const summarize = (value) => ({ preview: value.slice(0, 1000), truncated: value.length > 1000, sha256: crypto.createHash('sha256').update(value).digest('hex') });
    const evidence = { id: plan.evidenceId, exitCode: result.status, assertionPassed: result.assertionPassed, observationCount: assessed.length, stages: stageResults.map(({ id, durationMs, results }) => ({ id, durationMs, status: results.every((entry) => entry.status === 0) ? 'passed' : 'blocked' })), observations: assessed.map((entry, index) => ({ index, exitCode: entry.status, assertionPassed: entry.assertionPassed, command: commandDescriptors[index]?.command, stdout: summarize(entry.stdout), stderr: summarize(entry.stderr) })) };
    const completed = advanceFinishRun({
      root, runId, fingerprints: { [step]: fingerprint }, outcome: passed ? 'passed' : 'blocked',
      attemptToken: claimed.nextAction.attemptToken, evidence,
      blocked: passed ? null : { code: 'safe-action-failed', reason: result.stderr || (result.assertionPassed ? `command exited ${result.status}` : 'structured success assertion failed') }, clock,
    });
    executedSteps.push({ step, status: passed ? 'passed' : 'blocked', durationMs: completed.timing.attempts.at(-1)?.durationMs ?? null });
    if (!passed) return { ...completed, safeExecution: { status: 'stopped', reason: 'safe-action-failed', step, executedSteps, durationMs: clock() - startedAt } };
  }
}
