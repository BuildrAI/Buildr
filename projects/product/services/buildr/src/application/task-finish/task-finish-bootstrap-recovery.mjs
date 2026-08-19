import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TASK_FINISH_BOOTSTRAP_RECOVERY_SCHEMA = 'buildr.task-finish-bootstrap-recovery/v1';

const MANIFEST_SCHEMA = 'buildr.task-finish-bootstrap-recovery-manifest/v1';
const REVOCATION_SCHEMA = 'buildr.task-finish-bootstrap-recovery-revocation/v1';
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const EXECUTOR_RELATIVE_PATH = 'projects/product/services/buildr/src/application/task-finish/task-finish-product-executor.mjs';
const PROVIDER_FAILURE_ORIGIN = 'product-phase-provider';
const RUNTIME_METHODS = Object.freeze([
  'assertTaskDevelopmentCarrier',
  'cleanupTaskEnvironmentThroughRetainedController',
  'completeTaskRecordFromFinish',
  'resolveTaskEnvironmentCleanupContext',
  'resolveTaskEnvironmentExecution',
  'runTaskFinishCarrierCompatibility',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')}`;
}

function recoveryError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, {
    code,
    details,
    usage: 'buildr task finish run --run <run-id> [--resume <token>] --bootstrap-recovery --target <canonical-workspace>',
    nextAction: 'Inspect the retained Finish run and request explicit bootstrap recovery only for a closed preflight/prepare provider defect.',
  });
  return error;
}

function atomicWriteFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

function realDirectory(root, label) {
  const resolved = path.resolve(root);
  let stat;
  try { stat = fs.lstatSync(resolved); } catch (error) {
    throw recoveryError('task_finish.bootstrap_recovery_source_invalid', `${label} is unavailable.`, { root: resolved, cause: error.message });
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw recoveryError('task_finish.bootstrap_recovery_source_invalid', `${label} must be a real directory.`, { root: resolved });
  return fs.realpathSync(resolved);
}

function inside(root, value) {
  const relative = path.relative(root, value);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sameRealDirectory(value, expected) {
  try { return realDirectory(value, 'authority path') === expected; } catch { return false; }
}

function git(root, args, label) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  if (result.status !== 0) throw recoveryError('task_finish.bootstrap_recovery_git_failed', `${label} failed.`, { args, exitCode: result.status, stderr: result.stderr.trim() });
  return result.stdout.trim();
}

function fileDigest(file) {
  return digest(fs.readFileSync(file));
}

function untouched(phase) {
  return Boolean(phase && phase.status === 'pending' && phase.attempts === 0);
}

function failurePhase(run) {
  return run?.primaryFailure?.phase || run?.phases?.find((phase) => ['blocked', 'failed'].includes(phase.status))?.id || null;
}

function providerException(run, phaseId) {
  const phase = run?.phases?.find((item) => item.id === phaseId);
  return run?.primaryFailure?.origin === PROVIDER_FAILURE_ORIGIN && phase?.failure?.origin === PROVIDER_FAILURE_ORIGIN;
}

function safeInitialBoundary(run, persistence = null) {
  const phaseId = failurePhase(run);
  const preflight = run?.phases?.find((phase) => phase.id === 'preflight');
  const prepare = run?.phases?.find((phase) => phase.id === 'prepare');
  const later = (run?.phases || []).filter((phase) => ['verify', 'deliver', 'cleanup'].includes(phase.id));
  const phaseShape = phaseId === 'preflight'
    ? ['blocked', 'failed'].includes(preflight?.status) && [prepare, ...later].every(untouched)
    : phaseId === 'prepare'
      ? preflight?.status === 'passed' && ['blocked', 'failed'].includes(prepare?.status) && later.every(untouched)
      : false;
  const sideEffects = {
    carrier: Boolean(run?.deliveryCarrier || run?.repositories?.some((repository) => repository.deliveryCarrier)),
    lease: Boolean(persistence?.lease),
    equivalence: Boolean(run?.equivalence || run?.repositories?.some((repository) => repository.equivalence)),
    delivery: Boolean(run?.delivery || run?.repositories?.some((repository) => repository.delivery)),
    preparedCompletion: Boolean(persistence?.preparedCompletion),
    completion: Boolean(run?.completion),
  };
  return {
    ready: Boolean(run
      && ['blocked', 'failed'].includes(run.status)
      && phaseShape
      && providerException(run, phaseId)
      && !Object.values(sideEffects).some(Boolean)),
    phaseId,
    sideEffects,
    origin: run?.primaryFailure?.origin || null,
  };
}

export function taskFinishBootstrapRecoveryTerminalOnly(run) {
  return Boolean(run?.bootstrapRecovery
    && run.status === 'cleanup_pending'
    && run.resume?.phase === 'cleanup'
    && (run.phases || []).every((phase) => ['passed', 'not-applicable'].includes(phase.status)));
}

export function inspectTaskFinishBootstrapRecoveryQualification(persistence) {
  const run = persistence?.run || null;
  if (!run) return { ready: false, code: 'task_finish.bootstrap_recovery_run_missing', message: 'Bootstrap recovery requires an existing current Finish run.' };
  if (run.bootstrapRecovery) {
    const terminalOnly = taskFinishBootstrapRecoveryTerminalOnly(run);
    const retryable = ['blocked', 'cleanup_pending'].includes(run.status) || safeInitialBoundary(run, persistence).ready;
    return {
      ready: terminalOnly || retryable,
      reuse: true,
      terminalOnly,
      phaseId: failurePhase(run),
      recovery: clone(run.bootstrapRecovery),
      code: terminalOnly || retryable ? null : 'task_finish.bootstrap_recovery_terminal',
      message: terminalOnly || retryable ? null : 'This bootstrap recovery run has no resumable retained state.',
    };
  }
  const observed = safeInitialBoundary(run, persistence);
  if (!observed.ready) {
    return {
      ready: false,
      reuse: false,
      phaseId: observed.phaseId,
      sideEffects: observed.sideEffects,
      origin: observed.origin,
      code: 'task_finish.bootstrap_recovery_not_qualified',
      message: 'Bootstrap recovery only supports a no-side-effect preflight/prepare Product provider exception.',
    };
  }
  return { ready: true, reuse: false, terminalOnly: false, phaseId: observed.phaseId, sideEffects: observed.sideEffects, code: null, message: null };
}

function originalAttempt(run, phaseId) {
  const phase = run.phases.find((item) => item.id === phaseId);
  return { runStatus: run.status, primaryFailure: clone(run.primaryFailure), phase: clone(phase), resume: clone(run.resume) };
}

function resetFailedPhase(run, phaseId) {
  const phase = run.phases.find((item) => item.id === phaseId);
  phase.status = 'pending';
  phase.startedAt = null;
  phase.completedAt = null;
  phase.inputIdentity = null;
  phase.outputIdentity = null;
  phase.checks = [];
  phase.operations = [];
  phase.observations = [];
  phase.output = null;
  phase.failure = null;
  run.status = 'active';
  run.primaryFailure = null;
  run.resume = null;
}

export function activateTaskFinishBootstrapRecovery(run, context, persistence = null) {
  const next = clone(run);
  if (next.runId !== context.runId || next.identity?.task !== context.taskId) throw recoveryError('task_finish.bootstrap_recovery_run_mismatch', 'Bootstrap recovery context does not match the frozen Finish run.');
  const qualification = inspectTaskFinishBootstrapRecoveryQualification({ ...persistence, run: next });
  if (!qualification.ready) throw recoveryError(qualification.code, qualification.message, qualification);
  if (next.bootstrapRecovery) {
    if (next.bootstrapRecovery.identity !== context.identity) throw recoveryError('task_finish.bootstrap_recovery_identity_drift', 'Existing bootstrap recovery is bound to a different executor capsule.');
    if (next.status === 'failed') resetFailedPhase(next, qualification.phaseId);
    return next;
  }
  const original = originalAttempt(next, qualification.phaseId);
  if (next.status === 'failed') resetFailedPhase(next, qualification.phaseId);
  next.bootstrapRecovery = {
    schemaVersion: TASK_FINISH_BOOTSTRAP_RECOVERY_SCHEMA,
    identity: context.identity,
    mode: 'retained-writer-candidate-phase-provider',
    retainedSourceRoot: context.retainedSourceRoot,
    retainedSourceCommit: context.retainedSourceCommit,
    sourceCommit: context.sourceCommit,
    sourceTree: context.sourceTree,
    executorDigest: context.executorDigest,
    capsule: {
      root: context.capsuleRoot,
      manifest: context.manifestPath,
      source: context.sourceRoot,
      revocation: { status: 'active', tombstone: context.revocationPath, completedAt: null, residualCleanup: null },
    },
    authorization: clone(context.authorization),
    originalAttempt: original,
  };
  return next;
}

function manifestIdentity(manifest) {
  const value = clone(manifest);
  delete value.identity;
  return digest(value);
}

function revocationIdentity(tombstone) {
  const value = clone(tombstone);
  delete value.identity;
  return digest(value);
}

function frozenIdentityMatches(manifest, run) {
  return manifest.runId === run.runId
    && manifest.taskId === run.identity.task
    && manifest.handoffIdentity === run.identity.handoffIdentity
    && manifest.candidateIdentity === run.identity.candidateIdentity
    && manifest.candidateGeneration === run.identity.candidateGeneration
    && manifest.contentTargetIdentity === run.identity.contentTargetIdentity;
}

function verifyCapsuleSource(manifest) {
  const sourceRoot = realDirectory(manifest.sourceRoot, 'bootstrap recovery capsule source');
  const status = git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all'], 'bootstrap capsule cleanliness');
  const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD^{commit}'], 'bootstrap capsule HEAD');
  const sourceTree = git(sourceRoot, ['rev-parse', 'HEAD^{tree}'], 'bootstrap capsule tree');
  const executorModule = path.join(sourceRoot, EXECUTOR_RELATIVE_PATH);
  if (status || sourceCommit !== manifest.sourceCommit || sourceTree !== manifest.sourceTree || !fs.existsSync(executorModule) || fileDigest(executorModule) !== manifest.executorDigest) {
    throw recoveryError('task_finish.bootstrap_recovery_capsule_drift', 'Bootstrap recovery capsule HEAD, tree, cleanliness, or provider digest changed.', {
      status: status ? status.split('\n').slice(0, 50) : [],
      sourceCommit,
      sourceTree,
    });
  }
  return { sourceRoot, executorModule };
}

function readRevocation(file, manifest) {
  if (!fs.existsSync(file)) return null;
  if (fs.lstatSync(file).isSymbolicLink()) throw recoveryError('task_finish.bootstrap_recovery_revocation_invalid', 'Bootstrap recovery revocation tombstone must not be a symlink.');
  const tombstone = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (tombstone.schemaVersion !== REVOCATION_SCHEMA
    || tombstone.identity !== revocationIdentity(tombstone)
    || tombstone.manifestIdentity !== manifest.identity
    || tombstone.runId !== manifest.runId
    || tombstone.sourceCommit !== manifest.sourceCommit
    || tombstone.sourceTree !== manifest.sourceTree) {
    throw recoveryError('task_finish.bootstrap_recovery_revocation_invalid', 'Bootstrap recovery revocation tombstone does not match the frozen authority.');
  }
  return tombstone;
}

function contextFromManifest(manifestPath, run, targetRoot, expectedIdentity = null) {
  const target = realDirectory(targetRoot, 'canonical Workspace');
  const baseRoot = path.join(target, '.buildr', 'transient', 'task-finish', 'bootstrap-recovery');
  const file = path.resolve(manifestPath);
  const capsuleRoot = path.dirname(file);
  if (!inside(baseRoot, capsuleRoot) || path.basename(file) !== 'authority.json') throw recoveryError('task_finish.bootstrap_recovery_manifest_scope_invalid', 'Bootstrap recovery authority is outside the run-owned root.');
  realDirectory(capsuleRoot, 'bootstrap recovery capsule');
  if (fs.lstatSync(file).isSymbolicLink()) throw recoveryError('task_finish.bootstrap_recovery_manifest_drift', 'Bootstrap recovery authority must not be a symlink.');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sourceRoot = path.join(capsuleRoot, 'source');
  const executorModule = path.join(sourceRoot, EXECUTOR_RELATIVE_PATH);
  const revocationPath = path.join(capsuleRoot, 'revocation.json');
  const quarantineRoot = path.join(capsuleRoot, `source.revoked-${manifest.identity?.slice('sha256-'.length, 'sha256-'.length + 12)}`);
  if (manifest.schemaVersion !== MANIFEST_SCHEMA
    || manifest.identity !== manifestIdentity(manifest)
    || (expectedIdentity && manifest.identity !== expectedIdentity)
    || !frozenIdentityMatches(manifest, run)
    || fs.realpathSync(path.resolve(manifest.targetRoot)) !== target
    || path.resolve(manifest.environmentRoot || '') !== path.resolve(run.identity.environmentRoot)
    || path.resolve(manifest.capsuleRoot) !== capsuleRoot
    || path.resolve(manifest.sourceRoot) !== sourceRoot
    || path.resolve(manifest.executorModule) !== executorModule
    || path.resolve(manifest.revocationPath) !== revocationPath
    || manifest.authorization?.kind !== 'explicit-cli-flag'
    || typeof manifest.authorization?.identity !== 'string') {
    throw recoveryError('task_finish.bootstrap_recovery_manifest_drift', 'Bootstrap recovery authority no longer matches the frozen run and owned paths.');
  }
  const revocation = readRevocation(revocationPath, manifest);
  if (revocation) return { ...manifest, manifestPath: file, sourceRoot, executorModule, revocationPath, quarantineRoot, state: 'revoked', revocation };
  if (fs.existsSync(sourceRoot)) {
    verifyCapsuleSource(manifest);
    return { ...manifest, manifestPath: file, sourceRoot, executorModule, revocationPath, quarantineRoot, state: 'active', revocation: null };
  }
  if (fs.existsSync(quarantineRoot)) {
    realDirectory(quarantineRoot, 'bootstrap recovery revoked source');
    return { ...manifest, manifestPath: file, sourceRoot, executorModule, revocationPath, quarantineRoot, state: 'revocation-pending', revocation: null };
  }
  throw recoveryError('task_finish.bootstrap_recovery_capsule_missing', 'Bootstrap recovery source disappeared without a valid revocation tombstone.');
}

function sourceFacts(run, targetRoot, runtime) {
  if (typeof runtime.inspectTaskEnvironment !== 'function' || typeof runtime.assertTaskDevelopmentCarrier !== 'function') {
    throw recoveryError('task_finish.bootstrap_recovery_authority_unavailable', 'Retained Environment or Development authority is unavailable.');
  }
  const target = realDirectory(targetRoot, 'canonical Workspace');
  const environment = runtime.inspectTaskEnvironment(target, run.identity.task);
  const workspaceScope = environment?.environment?.scopes?.find((scope) => scope.selector === 'workspace');
  if (environment?.status !== 'ready'
    || !sameRealDirectory(environment?.environment?.workspace?.root || '', target)
    || !workspaceScope?.validationRoot
    || !sameRealDirectory(workspaceScope.validationRoot, realDirectory(run.identity.environmentRoot, 'frozen Task Environment root'))) {
    throw recoveryError('task_finish.bootstrap_recovery_environment_not_current', 'Bootstrap recovery source is not the current ready frozen Task Environment.', { status: environment?.status || null });
  }
  const development = runtime.assertTaskDevelopmentCarrier(target, run.identity.task, {
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
  });
  if (development.status !== 'equivalent') throw recoveryError('task_finish.bootstrap_recovery_development_not_current', 'Bootstrap recovery source is not the current frozen Development Candidate.', { status: development.status, diagnostic: development.diagnostic || null });
  const source = realDirectory(workspaceScope.validationRoot, 'Task Environment source');
  if (source === target) throw recoveryError('task_finish.bootstrap_recovery_source_retained', 'Bootstrap recovery requires a distinct Task Environment checkout.');
  const sourceCommon = path.resolve(source, git(source, ['rev-parse', '--git-common-dir'], 'Task source common-dir'));
  const targetCommon = path.resolve(target, git(target, ['rev-parse', '--git-common-dir'], 'retained common-dir'));
  if (fs.realpathSync(sourceCommon) !== fs.realpathSync(targetCommon)) throw recoveryError('task_finish.bootstrap_recovery_repository_mismatch', 'Task Environment and canonical Workspace do not share the same Git repository.');
  const status = git(source, ['status', '--porcelain=v1', '--untracked-files=all'], 'Task source cleanliness');
  if (status) throw recoveryError('task_finish.bootstrap_recovery_source_dirty', 'Bootstrap recovery requires a clean committed Task Environment checkout.', { status: status.split('\n').slice(0, 50) });
  const sourceCommit = git(source, ['rev-parse', 'HEAD^{commit}'], 'Task source HEAD');
  const sourceTree = git(source, ['rev-parse', 'HEAD^{tree}'], 'Task source tree');
  const retainedSourceCommit = git(target, ['rev-parse', 'HEAD^{commit}'], 'retained HEAD');
  if (sourceCommit === retainedSourceCommit) throw recoveryError('task_finish.bootstrap_recovery_source_not_new', 'Task Environment does not contain a distinct committed repair.');
  const executorSource = path.join(source, EXECUTOR_RELATIVE_PATH);
  if (!fs.existsSync(executorSource)) throw recoveryError('task_finish.bootstrap_recovery_executor_missing', `Task Environment is missing ${EXECUTOR_RELATIVE_PATH}.`);
  return { source, environmentRoot: path.resolve(run.identity.environmentRoot), target, sourceCommit, sourceTree, retainedSourceCommit, executorDigest: fileDigest(executorSource) };
}

export function prepareTaskFinishBootstrapRecoveryContext({ run, targetRoot, runtime }) {
  if (run.bootstrapRecovery) return contextFromManifest(run.bootstrapRecovery.capsule.manifest, run, targetRoot, run.bootstrapRecovery.identity);
  const facts = sourceFacts(run, targetRoot, runtime);
  const seed = digest({
    runId: run.runId,
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    sourceCommit: facts.sourceCommit,
    sourceTree: facts.sourceTree,
    executorDigest: facts.executorDigest,
  });
  const capsuleRoot = path.join(facts.target, '.buildr', 'transient', 'task-finish', 'bootstrap-recovery', run.runId, seed.slice('sha256-'.length, 'sha256-'.length + 16));
  const sourceRoot = path.join(capsuleRoot, 'source');
  const manifestPath = path.join(capsuleRoot, 'authority.json');
  if (fs.existsSync(capsuleRoot)) {
    const existing = contextFromManifest(manifestPath, run, targetRoot);
    if (existing.sourceCommit !== facts.sourceCommit || existing.sourceTree !== facts.sourceTree || existing.executorDigest !== facts.executorDigest) {
      throw recoveryError('task_finish.bootstrap_recovery_capsule_identity_mismatch', 'Existing deterministic capsule does not match the current frozen source facts.');
    }
    return existing;
  }
  fs.mkdirSync(capsuleRoot, { recursive: true });
  try {
    git(facts.target, ['clone', '--shared', '--no-checkout', '--', facts.source, sourceRoot], 'bootstrap capsule clone');
    git(sourceRoot, ['checkout', '--detach', facts.sourceCommit], 'bootstrap capsule checkout');
    const authorizedAt = new Date().toISOString();
    const authorization = {
      kind: 'explicit-cli-flag',
      identity: digest({ kind: 'explicit-cli-flag', runId: run.runId, sourceCommit: facts.sourceCommit, authorizedAt }),
      authorizedAt,
    };
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA,
      runId: run.runId,
      taskId: run.identity.task,
      targetRoot: facts.target,
      environmentRoot: facts.environmentRoot,
      retainedSourceRoot: path.join(facts.target, 'projects', 'product', 'services', 'buildr'),
      retainedSourceCommit: facts.retainedSourceCommit,
      capsuleRoot,
      sourceRoot,
      sourceCommit: facts.sourceCommit,
      sourceTree: facts.sourceTree,
      executorModule: path.join(sourceRoot, EXECUTOR_RELATIVE_PATH),
      executorDigest: facts.executorDigest,
      revocationPath: path.join(capsuleRoot, 'revocation.json'),
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
      authorization,
    };
    manifest.identity = manifestIdentity(manifest);
    verifyCapsuleSource(manifest);
    atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return contextFromManifest(manifestPath, run, targetRoot, manifest.identity);
  } catch (error) {
    try { fs.rmSync(capsuleRoot, { recursive: true, force: true }); } catch {}
    throw error;
  }
}

export function createTaskFinishBootstrapRecoveryRuntimeFacade(runtime, context) {
  if (context.state !== 'active') throw recoveryError('task_finish.bootstrap_recovery_authority_revoked', 'Revoked bootstrap recovery code cannot be executed.');
  const facade = {};
  for (const method of RUNTIME_METHODS) {
    if (typeof runtime[method] !== 'function') throw recoveryError('task_finish.bootstrap_recovery_runtime_incomplete', `Retained runtime is missing allowlisted method ${method}.`);
    facade[method] = (...args) => runtime[method](...args);
  }
  return Object.freeze(facade);
}

export async function importTaskFinishBootstrapRecoveryProvider(context) {
  if (context.state !== 'active') throw recoveryError('task_finish.bootstrap_recovery_authority_revoked', 'Revoked bootstrap recovery code cannot be imported.');
  verifyCapsuleSource(context);
  const module = await import(`${pathToFileURL(context.executorModule).href}?authority=${encodeURIComponent(context.identity)}`);
  if (typeof module.createTaskFinishProductHandlers !== 'function') throw recoveryError('task_finish.bootstrap_recovery_executor_invalid', 'Bootstrap recovery provider does not export createTaskFinishProductHandlers.');
  return module.createTaskFinishProductHandlers;
}

export function finalizeTaskFinishBootstrapRecovery(run, options = {}) {
  const recovery = run?.bootstrapRecovery;
  if (!recovery) return null;
  const removePath = options.removePath || ((root) => fs.rmSync(root, { recursive: true, force: false }));
  const context = contextFromManifest(recovery.capsule.manifest, run, run.identity.workspaceRoot, recovery.identity);
  if (context.state === 'revoked') {
    let tombstone = context.revocation;
    if (fs.existsSync(context.quarantineRoot) || tombstone.residualCleanup?.status === 'pending') {
      try {
        if (fs.existsSync(context.quarantineRoot)) removePath(context.quarantineRoot);
        tombstone = { ...tombstone, residualCleanup: null };
      } catch (error) {
        tombstone = { ...tombstone, residualCleanup: { status: 'attention', code: error.code || 'task_finish.bootstrap_recovery_residual_cleanup_failed', message: error.message } };
      }
      delete tombstone.identity;
      tombstone.identity = revocationIdentity(tombstone);
      atomicWriteFile(context.revocationPath, `${JSON.stringify(tombstone, null, 2)}\n`);
    }
    return {
      ...clone(recovery),
      capsule: {
        ...clone(recovery.capsule),
        revocation: { status: 'revoked', tombstone: context.revocationPath, completedAt: tombstone.revokedAt, residualCleanup: tombstone.residualCleanup || null },
      },
    };
  }
  if (context.state === 'active') {
    if (fs.existsSync(context.quarantineRoot)) throw recoveryError('task_finish.bootstrap_recovery_revocation_conflict', 'Bootstrap recovery revocation quarantine already exists.');
    fs.renameSync(context.sourceRoot, context.quarantineRoot);
  }
  const revokedAt = new Date().toISOString();
  let tombstone = {
    schemaVersion: REVOCATION_SCHEMA,
    manifestIdentity: context.identity,
    runId: context.runId,
    sourceCommit: context.sourceCommit,
    sourceTree: context.sourceTree,
    revokedAt,
    residualCleanup: { status: 'pending' },
  };
  tombstone.identity = revocationIdentity(tombstone);
  atomicWriteFile(context.revocationPath, `${JSON.stringify(tombstone, null, 2)}\n`);
  try {
    removePath(context.quarantineRoot);
    tombstone = { ...tombstone, residualCleanup: null };
  } catch (error) {
    tombstone = {
      ...tombstone,
      residualCleanup: { status: 'attention', code: error.code || 'task_finish.bootstrap_recovery_residual_cleanup_failed', message: error.message },
    };
  }
  delete tombstone.identity;
  tombstone.identity = revocationIdentity(tombstone);
  atomicWriteFile(context.revocationPath, `${JSON.stringify(tombstone, null, 2)}\n`);
  return {
    ...clone(recovery),
    capsule: {
      ...clone(recovery.capsule),
      revocation: { status: 'revoked', tombstone: context.revocationPath, completedAt: revokedAt, residualCleanup: tombstone.residualCleanup },
    },
  };
}

export function taskFinishBootstrapRecoveryManifestIdentity(manifest) {
  return manifestIdentity(manifest);
}

export function taskFinishBootstrapRecoveryError(code, message, details = null) {
  return recoveryError(code, message, details);
}
