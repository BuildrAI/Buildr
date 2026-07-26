import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  step('cleanup', '清理 task-owned transient evidence 与本地 environment', ['runtime-install'], 'canonical-checkout'),
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
      startedAt: null, completedAt: null, lease: null,
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
  return run;
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

function invalidate(run, stepId, reason, includeSelf = true) {
  const ids = descendants(run, stepId);
  if (includeSelf) ids.add(stepId);
  for (const id of ids) {
    const item = run.steps.find((candidate) => candidate.id === id);
    if (item.status === 'passed' || item.status === 'blocked' || item.status === 'running') {
      item.status = 'stale';
      item.blocked = { code: 'input-changed', reason, invalidatedBy: stepId };
      item.attemptToken = null; item.lease = null;
    }
  }
}

export function refreshFinishInputs(run, fingerprints = {}) {
  for (const [stepId, fingerprint] of Object.entries(fingerprints)) {
    const item = run.steps.find((candidate) => candidate.id === stepId);
    if (!item) throw new Error(`Unknown Task Finish step: ${stepId}`);
    if (item.inputFingerprint && item.inputFingerprint !== fingerprint) invalidate(run, stepId, `input fingerprint changed from ${item.inputFingerprint} to ${fingerprint}`);
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
  return run.steps.find((item) => ['pending', 'stale', 'blocked', 'running'].includes(item.status));
}

export function inspectFinishRun(run) {
  const current = nextStep(run) || null;
  return {
    schemaVersion: 'buildr.task-finish-checkpoint/v1', runId: run.runId, task: run.task, change: run.change,
    status: run.status, currentStep: current?.id || null,
    completedEffects: run.steps.flatMap((item) => item.effects.map((effect) => ({ step: item.id, ...effect }))),
    validEvidence: run.steps.filter((item) => item.status === 'passed').flatMap((item) => item.evidence.map((evidence) => ({ step: item.id, ...evidence }))),
    blocked: run.steps.filter((item) => item.status === 'blocked').map((item) => ({ step: item.id, ...item.blocked })),
    staleSteps: run.steps.filter((item) => item.status === 'stale').map((item) => item.id),
    nextAction: current ? { step: current.id, status: current.status, action: current.action, attemptToken: current.status === 'running' ? current.attemptToken : null, retryPolicy: current.retryPolicy } : null,
    steps: run.steps.map(({ id, status, attempt, inputFingerprint, effects, evidence, blocked, dependsOn }) => ({ id, status, attempt, inputFingerprint, effects, evidence, blocked, dependsOn })),
  };
}

export function advanceFinishRun({ root, runId, fingerprints = {}, outcome = null, attemptToken = null, effect = null, evidence = null, blocked = null, session = null, expectedTargetRef = null, observedTargetRef = null, clock = Date.now, leaseTtlMs = 600_000 }) {
  const run = refreshFinishInputs(readFinishRun({ root, runId }), fingerprints);
  if (session && !run.sessions.some((item) => item.handle === session.handle)) run.sessions.push(session);
  let item = nextStep(run);
  if (!item) return inspectFinishRun(run);

  if (outcome) {
    if (!['passed', 'blocked'].includes(outcome)) throw new Error(`Unsupported Task Finish outcome: ${outcome}`);
    const completedAttempt = run.steps.find((candidate) => candidate.status === 'passed' && candidate.lastAttemptToken === attemptToken);
    if (completedAttempt) {
      const repeatedFingerprint = fingerprints[completedAttempt.id] ?? completedAttempt.inputFingerprint;
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
    const submittedFingerprint = fingerprints[item.id] ?? item.inputFingerprint;
    if (submittedFingerprint !== item.inputFingerprint) throw new Error(`Input fingerprint mismatch for step ${item.id}`);
    if (outcome === 'passed') {
      if (typeof item.inputFingerprint !== 'string' || !item.inputFingerprint.trim()) throw new Error(`Step ${item.id} requires a non-empty input fingerprint before it can pass.`);
      assertEvidence(evidence, 'evidence');
      if (effect) assertEvidence(effect, 'effect');
      if (item.id === 'integration-push' && (!expectedTargetRef || !observedTargetRef)) throw new Error('integration-push requires expectedTargetRef and observedTargetRef observations.');
    }
    const leaseResult = consumeLease(item, clock);
    if (!leaseResult.ok) {
      clearLease(item);
      item.status = 'blocked';
      item.blocked = { code: leaseResult.code, reason: leaseResult.reason, currentLease: leaseResult.current || null };
      item.lastAttemptToken = item.attemptToken; item.attemptToken = null; item.completedAt = now(clock);
      run.updatedAt = now(clock);
      atomicWriteJson(runFile(root, runId), run);
      return inspectFinishRun(run);
    }
    clearLease(item);
    if (item.id === 'integration-push' && expectedTargetRef !== observedTargetRef) {
      invalidate(run, 'target-convergence', `target-race: expected ${expectedTargetRef}, observed ${observedTargetRef}`);
      item.status = 'blocked';
      item.blocked = { code: 'target-race', reason: 'Remote target ref changed after convergence', expectedTargetRef, observedTargetRef };
      item.lastAttemptToken = item.attemptToken; item.attemptToken = null; item.completedAt = now(clock);
      run.updatedAt = now(clock);
      atomicWriteJson(runFile(root, runId), run);
      return inspectFinishRun(run);
    }
    if (effect && !item.effects.some((entry) => entry.id === effect.id)) item.effects.push(effect);
    if (evidence && !item.evidence.some((entry) => entry.id === evidence.id)) item.evidence.push(evidence);
    item.completedAt = now(clock);
    item.lastAttemptToken = item.attemptToken;
    item.lastCompletion = completionIdentity({ item, fingerprint: submittedFingerprint, effect, evidence, outcome });
    item.attemptToken = null;
    if (outcome === 'passed') { item.status = 'passed'; item.blocked = null; }
    else if (outcome === 'blocked') { item.status = 'blocked'; item.blocked = blocked || { code: 'provider-blocked', reason: 'Provider action blocked' }; }
  } else {
    if (item.status === 'running') return inspectFinishRun(run);
    if (item.status === 'blocked') return inspectFinishRun(run);
    if (!item.dependsOn.every((dependency) => run.steps.find((candidate) => candidate.id === dependency)?.status === 'passed')) return inspectFinishRun(run);
    if (item.status === 'stale') item.status = 'pending';
    item.attempt += 1;
    item.attemptToken = crypto.randomUUID();
    item.lease = acquireLease({ root, run, item, token: item.attemptToken, clock, leaseTtlMs });
    item.status = 'running'; item.startedAt = now(clock); item.blocked = null;
  }
  run.status = run.steps.every((candidate) => candidate.status === 'passed') ? 'complete' : 'active';
  run.updatedAt = now(clock);
  atomicWriteJson(runFile(root, runId), run);
  return inspectFinishRun(run);
}

export function resumeFinishRun(options) {
  const run = refreshFinishInputs(readFinishRun(options), options.fingerprints || {});
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
