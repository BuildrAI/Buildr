#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA = 'buildr.self-bootstrap-closeout-result/v1';
export const SELF_BOOTSTRAP_RECOVERY_PLAN_SCHEMA = 'buildr.self-bootstrap-recovery-plan/v1';
export const SELF_BOOTSTRAP_CLOSEOUT_PHASES = Object.freeze([
  'preflight',
  'plan',
  'sync',
  'commit',
  'push',
  'install-local-app',
  'verify-development-entry',
  'finalize',
]);

const PRODUCT_ROOT = 'projects/product';
const SERVICE_ROOT = `${PRODUCT_ROOT}/services/buildr`;
const COMPONENT_PATH = 'components/workspace/buildr-self-bootstrap/component.yml';
const FINISH_CARRIER_ROOT = '.buildr/transient/task-finish/carriers';
const TASK_TRAILER = 'Buildr-Task';
const FINISH_RUN_TRAILER = 'Buildr-Finish-Run';
const PLAN_TRAILER = 'Buildr-Closeout-Plan';
const DEVELOPMENT_WEB_CONTINUITY_SCRIPT = 'skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
const TARGET_LEASE_DRIVER = `${SERVICE_ROOT}/src/interfaces/internal/task-finish-target-lease-driver.mjs`;
const TARGET_LEASE_DURATION_MS = 15 * 60_000;

// This runner must remain executable after the Skill is projected under an
// Agent runtime, where Product source modules are not available by relative path.
function normalizeFilesystemPath(value, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  let normalized = String(value);
  if (platform === 'win32') {
    normalized = normalized
      .replace(/^\\\\\?\\UNC\\/i, '\\\\')
      .replace(/^\\\\\?\\/i, '');
  }
  normalized = pathApi.normalize(normalized);
  const root = pathApi.parse(normalized).root;
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) normalized = normalized.slice(0, -1);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function filesystemPathCandidates(value) {
  const candidates = [path.resolve(value)];
  for (const realpath of [fs.realpathSync, fs.realpathSync.native]) {
    try { candidates.push(realpath(value)); } catch { /* retain the other observable forms */ }
  }
  return new Set(candidates.map((candidate) => normalizeFilesystemPath(candidate)));
}

function sameFilesystemPath(left, right) {
  try {
    const leftCandidates = filesystemPathCandidates(left);
    const rightCandidates = filesystemPathCandidates(right);
    if ([...leftCandidates].some((candidate) => rightCandidates.has(candidate))) return true;
    const leftStat = fs.statSync(left, { bigint: true });
    const rightStat = fs.statSync(right, { bigint: true });
    return leftStat.ino !== 0n && rightStat.ino !== 0n && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function portable(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return normalized;
}

function matches(pathname, exact, prefixes = []) {
  return exact.includes(pathname) || prefixes.some((prefix) => pathname.startsWith(prefix));
}

function classifications(changedPaths) {
  const sync = [];
  const cli = [];
  const localApp = [];
  for (const pathname of changedPaths) {
    if (matches(pathname, [`${SERVICE_ROOT}/package/manifest.yml`], [
      `${SERVICE_ROOT}/package/targets/workspace/`,
      `${SERVICE_ROOT}/package/targets/runtime/skills/buildr/`,
    ])) sync.push(pathname);
    if (matches(pathname, [
      `${PRODUCT_ROOT}/buildr`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/scripts/install-buildr-cli`,
      `${SERVICE_ROOT}/scripts/run-development-cli`,
      `${SERVICE_ROOT}/scripts/uninstall-buildr-cli`,
    ], [`${SERVICE_ROOT}/bin/`, `${SERVICE_ROOT}/src/`])) cli.push(pathname);
    if (matches(pathname, [
      `${SERVICE_ROOT}/src/interfaces/cli/launcher.mjs`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/LICENSE`,
    ], [`${SERVICE_ROOT}/src/interfaces/local-app/`, `${SERVICE_ROOT}/package/launchers/`])) localApp.push(pathname);
  }
  return {
    'sync-retained-workspace': [...new Set(sync)].sort(),
    'install-development-local-app': [...new Set(localApp)].sort(),
    'verify-development-entry': [...new Set([...sync, ...cli, ...localApp])].sort(),
  };
}

function finishMode(result) {
  if (result?.status === 'complete') return 'complete';
  const doctorBlocked = result?.status === 'blocked'
    && result.primaryFailure?.phase === 'deliver'
    && result.primaryFailure?.operation === 'retained-doctor'
    && result.delivery?.status === 'activation-blocked'
    && result.delivery?.remoteAfterRef
    && result.resume?.phase === 'deliver'
    && result.resume?.token;
  return doctorBlocked ? 'doctor-blocked' : null;
}

function targetRaceResumeToken(result, runId) {
  const matches = result?.runId === runId
    && result?.status === 'blocked'
    && result.primaryFailure?.phase === 'deliver'
    && result.primaryFailure?.code === 'task-finish.target-race'
    && result.resume?.phase === 'deliver'
    && result.resume?.token;
  return matches ? result.resume.token : null;
}

function deliveryAdaptationRequired(result, runId) {
  return Boolean(result?.runId === runId
    && result?.status === 'blocked'
    && result.primaryFailure?.phase === 'prepare'
    && result.primaryFailure?.code === 'task-finish.delivery-adaptation-required'
    && result.carrier?.root
    && result.carrier?.identity
    && result.resume?.phase === 'prepare'
    && result.resume?.carrierIdentity === result.carrier.identity
    && result.resume?.token);
}

export function createSelfBootstrapCloseoutPlan(finishResult) {
  const mode = finishMode(finishResult);
  if (!mode) throw closeoutError('self-bootstrap-closeout.finish-result-ineligible', 'Finish Result不是complete或唯一retained Doctor blocked模式。');
  const frozenCarrierPaths = finishResult.carrier?.activationPaths || finishResult.carrier?.changedPaths || [];
  const changedPaths = [...new Set(frozenCarrierPaths.map(portable))].filter(Boolean).sort();
  if (changedPaths.length !== frozenCarrierPaths.length) throw closeoutError('self-bootstrap-closeout.frozen-path-invalid', 'Finish Result包含不安全或重复的frozen path。');
  const actions = classifications(changedPaths);
  const baseRef = mode === 'complete'
    ? finishResult.delivery?.finalRemoteRef || finishResult.completion?.finalRemoteRef
    : finishResult.delivery?.remoteAfterRef;
  const plan = {
    schemaVersion: 'buildr.self-bootstrap-closeout-plan/v1',
    runId: finishResult.runId,
    taskId: finishResult.identity?.task,
    mode,
    agent: finishResult.identity?.agent,
    targetBranch: finishResult.identity?.targetBranch,
    remote: finishResult.identity?.remote,
    baseRef: baseRef || null,
    frozenPaths: changedPaths,
    actions,
  };
  return { ...plan, identity: digest(plan) };
}

function closeoutError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, { code, details });
  return error;
}

function phase(id) {
  return { id, status: 'pending', inputIdentity: null, outputIdentity: null, operations: [], effects: [], diagnostic: null };
}

function operation(id, result, extra = {}) {
  return {
    id,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    stdout: String(result.stdout || '').trim().slice(0, 2000),
    stderr: String(result.stderr || '').trim().slice(0, 2000),
    ...extra,
  };
}

function defaultExecute(executable, args, options) {
  const result = spawnSync(executable, args, { cwd: options.cwd, encoding: 'utf8', env: options.env || process.env });
  return { status: Number.isInteger(result.status) ? result.status : 1, stdout: result.stdout || '', stderr: result.stderr || result.error?.message || '' };
}

function parseJson(result, code, message) {
  try { return JSON.parse(result.stdout); } catch (error) {
    throw closeoutError(code, message, { parseError: error.message, stdout: String(result.stdout || '').slice(0, 2000) });
  }
}

function zeroList(value) {
  return String(value || '').split('\0').filter(Boolean).sort();
}

function ownedFinishCarrierPath(finishResult, workspaceRoot) {
  if (finishMode(finishResult) !== 'doctor-blocked') return null;
  const runId = portable(finishResult.runId);
  if (!runId || runId === '.' || runId.includes('/')) throw closeoutError('self-bootstrap-closeout.carrier-run-invalid', 'Doctor blocked Finish Result的run identity不能安全定位Delivery Carrier。');
  const relativeRoot = `${FINISH_CARRIER_ROOT}/${runId}`;
  const expectedRoot = path.resolve(workspaceRoot, ...relativeRoot.split('/'));
  const declaredRoot = finishResult.carrier?.root;
  if (!declaredRoot || !sameFilesystemPath(declaredRoot, expectedRoot)) {
    throw closeoutError('self-bootstrap-closeout.carrier-root-mismatch', 'Doctor blocked Finish Result声明的Delivery Carrier不属于当前run。', {
      expectedRoot,
      declaredRoot: declaredRoot || null,
    });
  }
  let carrierStat;
  try { carrierStat = fs.lstatSync(expectedRoot); } catch {
    throw closeoutError('self-bootstrap-closeout.carrier-root-missing', 'Doctor blocked Finish Result声明的Delivery Carrier不存在。', { expectedRoot });
  }
  if (!carrierStat.isDirectory() || carrierStat.isSymbolicLink()) {
    throw closeoutError('self-bootstrap-closeout.carrier-root-invalid', 'Doctor blocked Finish Result声明的Delivery Carrier必须是真实目录且不能是symlink。', { expectedRoot });
  }
  const realWorkspaceRoot = fs.realpathSync(workspaceRoot);
  const realCarrierRoot = fs.realpathSync(expectedRoot);
  const realRelative = path.relative(realWorkspaceRoot, realCarrierRoot);
  if (!realRelative || path.isAbsolute(realRelative) || realRelative.split(path.sep).includes('..')) {
    throw closeoutError('self-bootstrap-closeout.carrier-root-invalid', 'Doctor blocked Finish Result声明的Delivery Carrier越出canonical Workspace。', { expectedRoot });
  }
  return relativeRoot;
}

function safeRunId(value) {
  const runId = portable(value);
  return runId && runId !== '.' && !runId.includes('/') ? runId : null;
}

function carrierRootPath(workspaceRoot, runId) {
  return path.resolve(workspaceRoot, ...`${FINISH_CARRIER_ROOT}/${runId}`.split('/'));
}

function carrierObservationDiagnostic(code, message, details = null) {
  return { code, message, details };
}

export function discoverFinishCarrierEntries(workspaceRoot) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const carrierRoot = path.join(root, ...FINISH_CARRIER_ROOT.split('/'));
  let carrierRootStat;
  try { carrierRootStat = fs.lstatSync(carrierRoot); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    return [{
      runId: null,
      path: carrierRoot,
      realPath: null,
      diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-inventory-unreadable', 'Finish carrier根无法读取。', { error: error.message }),
    }];
  }
  if (!carrierRootStat.isDirectory() || carrierRootStat.isSymbolicLink()) {
    return [{
      runId: null,
      path: carrierRoot,
      realPath: null,
      diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-inventory-root-invalid', 'Finish carrier根必须是真实目录且不能是symlink。'),
    }];
  }
  const realRoot = fs.realpathSync(root);
  const realCarrierRoot = fs.realpathSync(carrierRoot);
  const carrierRootRelative = path.relative(realRoot, realCarrierRoot);
  if (!carrierRootRelative || path.isAbsolute(carrierRootRelative) || carrierRootRelative.split(path.sep).includes('..')) {
    return [{
      runId: null,
      path: carrierRoot,
      realPath: realCarrierRoot,
      diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-inventory-root-invalid', 'Finish carrier根越出canonical Workspace。'),
    }];
  }

  let entries;
  try { entries = fs.readdirSync(carrierRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)); } catch (error) {
    return [{
      runId: null,
      path: carrierRoot,
      realPath: realCarrierRoot,
      diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-inventory-unreadable', 'Finish carrier根无法枚举。', { error: error.message }),
    }];
  }
  const realPaths = new Map();
  return entries.map((entry) => {
    const entryPath = path.join(carrierRoot, entry.name);
    const runId = safeRunId(entry.name);
    if (!runId || runId !== entry.name) {
      return {
        runId: entry.name,
        path: entryPath,
        realPath: null,
        diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-entry-name-invalid', 'Finish carrier目录名不是安全run identity。'),
      };
    }
    let entryStat;
    try { entryStat = fs.lstatSync(entryPath); } catch (error) {
      return {
        runId,
        path: entryPath,
        realPath: null,
        diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-entry-unreadable', 'Finish carrier条目无法读取。', { error: error.message }),
      };
    }
    if (!entryStat.isDirectory() || entryStat.isSymbolicLink()) {
      return {
        runId,
        path: entryPath,
        realPath: null,
        diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-entry-invalid', 'Finish carrier条目必须是真实目录且不能是symlink。'),
      };
    }
    let realPath;
    try { realPath = fs.realpathSync(entryPath); } catch (error) {
      return {
        runId,
        path: entryPath,
        realPath: null,
        diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-entry-unreadable', 'Finish carrier条目realpath无法读取。', { error: error.message }),
      };
    }
    const relative = path.relative(realCarrierRoot, realPath);
    if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes('..') || relative.includes(path.sep)) {
      return {
        runId,
        path: entryPath,
        realPath,
        diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-entry-outside-root', 'Finish carrier条目不是固定根下的真实直接目录。'),
      };
    }
    const realIdentity = normalizeFilesystemPath(realPath);
    if (realPaths.has(realIdentity)) {
      return {
        runId,
        path: entryPath,
        realPath,
        diagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.carrier-entry-realpath-duplicate', '多个Finish carrier条目解析为同一realpath。', { duplicateOf: realPaths.get(realIdentity) }),
      };
    }
    realPaths.set(realIdentity, runId);
    return { runId, path: entryPath, realPath, diagnostic: null };
  });
}

function validateForeignFinishCarrier(entry, finishResult, workspaceRoot) {
  if (finishResult?.schemaVersion !== 'buildr.task-finish-result/v2') {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-finish-schema-invalid', 'Foreign carrier的Finish Result schema不受支持。');
  }
  if (finishResult.runId !== entry.runId) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-run-mismatch', 'Foreign Finish Result的run identity与carrier目录不一致。', { expected: entry.runId, actual: finishResult.runId || null });
  }
  if (!finishResult.identity?.task) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-owner-missing', 'Foreign Finish Result缺少owning Task identity。');
  }
  if (!finishResult.identity?.workspaceRoot || !sameFilesystemPath(finishResult.identity.workspaceRoot, workspaceRoot)) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-workspace-mismatch', 'Foreign Finish Result不属于当前canonical Workspace。');
  }
  if (!finishResult.carrier?.root || !sameFilesystemPath(finishResult.carrier.root, entry.path)) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-carrier-root-mismatch', 'Foreign Finish Result声明的carrier root与观察目录不一致。', { expected: entry.path, actual: finishResult.carrier?.root || null });
  }
  if (!finishResult.carrier?.identity) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-carrier-identity-missing', 'Foreign Finish Result缺少carrier identity。');
  }
  if (finishResult.resume && finishResult.resume.carrierIdentity !== finishResult.carrier.identity) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-resume-carrier-mismatch', 'Foreign Finish Result的resume identity与carrier identity不一致。', { carrierIdentity: finishResult.carrier.identity, resumeCarrierIdentity: finishResult.resume?.carrierIdentity || null });
  }
  if (finishResult.status === 'cleanup_pending'
    && (finishResult.primaryFailure?.phase !== 'cleanup' || finishResult.resume?.phase !== 'cleanup' || !finishResult.resume?.token)) {
    return carrierObservationDiagnostic('self-bootstrap-closeout.foreign-cleanup-resume-invalid', 'cleanup_pending foreign Finish Result缺少matching cleanup resume事实。', {
      failurePhase: finishResult.primaryFailure?.phase || null,
      resumePhase: finishResult.resume?.phase || null,
      hasResumeToken: Boolean(finishResult.resume?.token),
    });
  }
  return null;
}

function successfulDelivery(finishResult) {
  return finishResult?.delivery?.status === 'delivered'
    || Boolean(finishResult?.delivery?.remoteAfterRef)
    || Boolean(finishResult?.delivery?.finalRemoteRef)
    || Boolean(finishResult?.completion?.finalRemoteRef);
}

function occupancyReleasable(finishResult, taskRecord) {
  return taskRecord?.status === 'abandoned'
    && Boolean(finishResult?.identity?.task)
    && finishResult?.occupancy?.status !== 'released'
    && !successfulDelivery(finishResult);
}

function ownerFacts(finishResult, runId) {
  return {
    kind: 'task-finish-owner',
    taskId: finishResult?.identity?.task || null,
    runId,
    agent: finishResult?.identity?.agent || null,
  };
}

export function createSelfBootstrapRecoveryPlan({ currentFinishResult, carrierEntries, workspaceRoot, nodeExecutable, runnerPath }) {
  const currentRunId = currentFinishResult.runId;
  const observations = carrierEntries.map((entry) => {
    if (entry.runId === currentRunId && !entry.diagnostic) {
      return {
        runId: entry.runId,
        path: entry.path,
        classification: 'current',
        owner: ownerFacts(currentFinishResult, entry.runId),
        status: currentFinishResult.status || null,
        diagnostic: null,
      };
    }
    if (entry.diagnostic) {
      return { runId: entry.runId, path: entry.path, classification: 'unprovable', owner: null, status: null, diagnostic: entry.diagnostic };
    }
    if (entry.inspectDiagnostic) {
      return { runId: entry.runId, path: entry.path, classification: 'unprovable', owner: null, status: null, diagnostic: entry.inspectDiagnostic };
    }
    const finishResult = entry.finishResult;
    const diagnostic = validateForeignFinishCarrier(entry, finishResult, workspaceRoot);
    if (diagnostic) {
      return { runId: entry.runId, path: entry.path, classification: 'unprovable', owner: null, status: finishResult?.status || null, diagnostic };
    }
    const cleanupPending = finishResult.status === 'cleanup_pending' && Boolean(finishResult.identity?.task);
    const occupancyRelease = !cleanupPending && occupancyReleasable(finishResult, entry.taskRecord);
    return {
      runId: entry.runId,
      path: entry.path,
      classification: 'isolated-coexisting',
      owner: ownerFacts(finishResult, entry.runId),
      status: finishResult.status || null,
      diagnostic: null,
      ownerAction: cleanupPending ? {
        action: 'resume-owner-cleanup',
        resumeToken: finishResult.resume.token,
      } : occupancyRelease ? {
        action: 'resume-owner-release-occupancy',
        resumeToken: null,
      } : null,
    };
  });
  const foreign = observations.filter((item) => item.runId !== currentRunId || item.classification !== 'current');
  if (!foreign.length) return null;
  const cleanupPending = foreign.filter((item) => item.ownerAction?.action === 'resume-owner-cleanup')
    .sort((left, right) => `${left.owner.taskId}\0${left.runId}`.localeCompare(`${right.owner.taskId}\0${right.runId}`));
  const occupancyRelease = foreign.filter((item) => item.ownerAction?.action === 'resume-owner-release-occupancy')
    .sort((left, right) => `${left.owner.taskId}\0${left.runId}`.localeCompare(`${right.owner.taskId}\0${right.runId}`));
  const status = foreign.some((item) => item.classification === 'unprovable') ? 'blocked' : 'advisory';
  const orderedSteps = [
    ...cleanupPending.map((item, index) => ({
      order: index + 1,
      action: 'resume-owner-cleanup',
      owner: item.owner,
      authorization: { required: true, scope: `仅恢复Finish run ${item.runId}的owner cleanup` },
      command: {
        executable: nodeExecutable,
        args: [path.join(workspaceRoot, SERVICE_ROOT, 'bin', 'buildr.mjs'), 'task', 'finish', 'run', '--task', item.owner.taskId, '--run', item.runId, '--resume', item.ownerAction.resumeToken, '--target', workspaceRoot, '--detail', 'full', '--json'],
      },
      expectedEffects: ['cleanup-owned-task-environment', 'delete-owned-finish-carrier', 'complete-owning-task'],
    })),
    ...occupancyRelease.map((item, index) => ({
      order: cleanupPending.length + index + 1,
      action: 'resume-owner-release-occupancy',
      owner: item.owner,
      authorization: { required: true, scope: `仅释放Finish run ${item.runId}的abandoned未交付隔离载体占用` },
      command: {
        executable: nodeExecutable,
        args: [path.join(workspaceRoot, SERVICE_ROOT, 'bin', 'buildr.mjs'), 'task', 'finish', 'run', '--task', item.owner.taskId, '--run', item.runId, '--release-occupancy', '--target', workspaceRoot, '--detail', 'full', '--json'],
      },
      expectedEffects: ['delete-owned-finish-carrier'],
    })),
  ];
  const plan = {
    schemaVersion: SELF_BOOTSTRAP_RECOVERY_PLAN_SCHEMA,
    status,
    current: { taskId: currentFinishResult.identity?.task || null, runId: currentRunId },
    observations,
    orderedSteps,
  };
  return { ...plan, identity: digest(plan) };
}

function belongsToUntrackedRoot(pathname, root) {
  const normalized = String(pathname || '').replaceAll('\\', '/').replace(/\/+$/, '');
  return normalized === root || normalized.startsWith(`${root}/`);
}

function provenForeignCarrierRoots(recoveryPlan, workspaceRoot) {
  return (recoveryPlan?.observations || [])
    .filter((item) => item.classification === 'isolated-coexisting' && item.path)
    .map((item) => path.relative(workspaceRoot, item.path).split(path.sep).join('/'))
    .filter((item) => portable(item));
}

function command(execute, executable, args, cwd, id, phaseResult, extra = {}, environment = process.env) {
  const result = execute(executable, args, { cwd, env: environment });
  phaseResult.operations.push(operation(id, result, extra));
  return result;
}

function productCommand(execute, root, nodeExecutable, args, id, phaseResult) {
  const script = path.join(root, SERVICE_ROOT, 'bin', 'buildr.mjs');
  return command(execute, nodeExecutable, [script, ...args], root, id, phaseResult, { kind: 'product', script, args });
}

function targetLeaseCommand(execute, root, nodeExecutable, plan, action, token, id, phaseResult) {
  const script = path.join(root, TARGET_LEASE_DRIVER);
  const args = [script, action, '--task', plan.taskId, '--run', plan.runId, '--target-identity', `${plan.remote}:${plan.targetBranch}`, '--target', root];
  if (action === 'release') args.push('--lease-token', token);
  else args.push('--duration-ms', String(TARGET_LEASE_DURATION_MS));
  const result = command(execute, nodeExecutable, args, root, id, phaseResult, { kind: 'task-finish-target-lease', script, action });
  let payload;
  try { payload = JSON.parse(result.stdout || result.stderr); } catch (error) {
    throw closeoutError('self-bootstrap-closeout.target-lease-result-invalid', 'Target lease driver没有返回合法JSON。', { action, exitCode: result.status, parseError: error.message });
  }
  if (payload?.schemaVersion !== 'buildr.task-finish-target-lease-driver-result/v1'
    || payload.operation !== action
    || payload.taskId !== plan.taskId
    || payload.runId !== plan.runId
    || payload.targetIdentity !== `${plan.remote}:${plan.targetBranch}`) {
    throw closeoutError('self-bootstrap-closeout.target-lease-identity-mismatch', 'Target lease driver Result identity不匹配。', { action, payload });
  }
  if (payload.status === 'blocked' && payload.existing) {
    throw closeoutError('self-bootstrap-closeout.target-lease-held', '同一target正在由另一个Finish或self-bootstrap owner使用。', { existing: payload.existing });
  }
  if (result.status !== 0 || payload.status !== 'passed') {
    throw closeoutError(payload?.diagnostic?.code || 'self-bootstrap-closeout.target-lease-operation-failed', payload?.diagnostic?.message || `Target lease ${action}失败。`, payload?.diagnostic?.details || { exitCode: result.status });
  }
  return payload;
}

function validateDevelopmentLauncherResult(payload, root, nodeExecutable, successor) {
  const expectedSourceRoot = path.join(root, SERVICE_ROOT);
  const identity = payload?.identity;
  if (payload?.schemaVersion !== 'buildr.launcher-status/v1'
    || payload.channel !== 'development'
    || payload.installed !== true
    || identity?.schemaVersion !== 'buildr.launcher-identity/v1'
    || identity.channel !== 'development'
    || identity.source !== 'checkout'
    || !sameFilesystemPath(identity.sourceRoot, expectedSourceRoot)
    || !sameFilesystemPath(identity.developmentRuntime?.executable, nodeExecutable)
    || identity.checkout?.head !== successor) {
    throw closeoutError('self-bootstrap-closeout.local-app-identity-mismatch', 'Development Launcher没有绑定当前retained checkout与retained Node。', {
      expected: { sourceRoot: expectedSourceRoot, nodeExecutable, checkoutHead: successor },
      actual: identity || null,
    });
  }
  return payload;
}

function inspectDevelopmentWebContinuity(execute, root, nodeExecutable, environment, phaseResult) {
  const script = path.join(root, DEVELOPMENT_WEB_CONTINUITY_SCRIPT);
  const inspected = command(execute, nodeExecutable, [script, 'inspect'], root, 'inspect-development-web-continuity', phaseResult, {
    kind: 'development-web-continuity',
    script,
    action: 'inspect',
  }, environment);
  requirePassed(inspected, 'self-bootstrap-closeout.development-web-inspection-failed', '无法认证Development Web安装前实例状态。');
  const payload = parseJson(inspected, 'self-bootstrap-closeout.development-web-inspection-invalid', 'Development Web安装前状态不是合法JSON。');
  const allowed = new Set(['healthy-development', 'not-running', 'stale', 'different-owner']);
  if (payload?.schemaVersion !== 'buildr.development-web-continuity/v1' || payload.action !== 'inspect' || !allowed.has(payload.status)) {
    throw closeoutError('self-bootstrap-closeout.development-web-inspection-invalid', 'Development Web安装前状态不符合closed continuity contract。', { payload });
  }
  if (payload.status === 'healthy-development') {
    const instance = payload.instance;
    if (!Number.isInteger(instance?.port) || instance.port <= 0 || instance.port > 65535
      || !Number.isInteger(instance?.pid) || instance.pid <= 0
      || instance.launcherIdentity?.channel !== 'development') {
      throw closeoutError('self-bootstrap-closeout.development-web-inspection-invalid', '健康Development Web实例缺少可证明的port、PID或Launcher identity。', { payload });
    }
  }
  return payload;
}

function developmentLauncherIdentityPath(payload) {
  return payload.platform === 'darwin'
    ? path.join(payload.target, 'Contents', 'Resources', 'launcher-identity.json')
    : path.join(payload.target, 'launcher-identity.json');
}

function recoverDevelopmentWebContinuity({ execute, root, nodeExecutable, successor, launcher, continuity, environment, phaseResult }) {
  if (continuity.status !== 'healthy-development') {
    return {
      schemaVersion: 'buildr.development-web-continuity/v1',
      action: 'restart',
      status: 'not-applicable',
      reason: continuity.status,
      previous: continuity.instance || null,
      instance: null,
    };
  }
  const script = path.join(root, DEVELOPMENT_WEB_CONTINUITY_SCRIPT);
  const projectBridge = path.join(root, PRODUCT_ROOT, 'buildr');
  const expectedSourceRoot = path.join(root, SERVICE_ROOT);
  const previous = continuity.instance;
  const args = [
    script,
    'restart',
    '--project-bridge', projectBridge,
    '--port', String(previous.port),
    '--launcher-identity', developmentLauncherIdentityPath(launcher),
    '--expected-source-root', expectedSourceRoot,
    '--expected-head', successor,
    '--node-executable', nodeExecutable,
    '--previous-pid', String(previous.pid),
  ];
  const restarted = command(execute, nodeExecutable, args, root, 'restart-development-web-continuity', phaseResult, {
    kind: 'development-web-continuity',
    script,
    action: 'restart',
    port: previous.port,
  }, environment);
  requirePassed(restarted, 'self-bootstrap-closeout.development-web-restart-failed', 'Development Web未能在原端口恢复。');
  const payload = parseJson(restarted, 'self-bootstrap-closeout.development-web-restart-invalid', 'Development Web恢复结果不是合法JSON。');
  const identity = payload?.launcherIdentity;
  if (payload?.schemaVersion !== 'buildr.development-web-continuity/v1'
    || payload.action !== 'restart'
    || payload.status !== 'passed'
    || payload.previous?.pid !== previous.pid
    || payload.previous?.port !== previous.port
    || payload.instance?.port !== previous.port
    || !Number.isInteger(payload.instance?.pid)
    || payload.instance.pid <= 0
    || payload.instance.pid === previous.pid
    || identity?.channel !== 'development'
    || !sameFilesystemPath(identity.sourceRoot, expectedSourceRoot)
    || !sameFilesystemPath(identity.developmentRuntime?.executable, nodeExecutable)
    || identity.checkout?.head !== successor) {
    throw closeoutError('self-bootstrap-closeout.development-web-restart-identity-mismatch', '恢复后的Development Web没有保持原端口或绑定retained successor identity。', {
      expected: { port: previous.port, previousPid: previous.pid, sourceRoot: expectedSourceRoot, nodeExecutable, checkoutHead: successor },
      actual: payload || null,
    });
  }
  return payload;
}

function developmentEntryFailure(evidence, code, message, details = null) {
  evidence.status = 'blocked';
  throw closeoutError(code, message, { developmentEntryIdentity: evidence, ...details });
}

function verifyDevelopmentEntryIdentity({ execute, root, nodeExecutable, successor, environment, phaseResult }) {
  const projectBridge = path.join(root, PRODUCT_ROOT, 'buildr');
  const expectedLauncher = path.join(root, SERVICE_ROOT, 'scripts', 'run-development-cli');
  const expectedCliEntry = path.join(root, SERVICE_ROOT, 'bin', 'buildr.mjs');
  const packageFile = path.join(root, SERVICE_ROOT, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const evidence = {
    status: 'pending',
    command: `${PRODUCT_ROOT}/buildr`,
    projectBridge,
    launcher: { expected: expectedLauncher, observed: null },
    cliEntry: { expected: expectedCliEntry, observed: null },
    nodeExecutable: { expected: nodeExecutable, observed: null },
    package: { expected: packageJson.name, observed: null },
    version: { expected: packageJson.version, observed: null },
    channel: { expected: 'development', observed: null },
    sourceCommit: { expected: successor, observed: null },
  };

  try {
    if (!fs.statSync(projectBridge).isFile()) throw new Error('not a file');
    if (process.platform !== 'win32') fs.accessSync(projectBridge, fs.constants.X_OK);
  } catch (error) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-missing', 'Retained projects/product/buildr不存在或不可执行。', {
      projectBridge,
      error: error.message,
    });
  }
  const developmentEnvironment = { ...environment, BUILDR_NODE: nodeExecutable };
  const inspected = execute(projectBridge, [], {
    cwd: root,
    env: { ...developmentEnvironment, BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1' },
  });
  phaseResult.operations.push(operation('inspect-development-entry-identity', inspected, {
    kind: 'development-entry',
    executable: projectBridge,
    args: [],
  }));
  if (inspected.status !== 0) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-inspection-failed', 'Retained projects/product/buildr无法返回development entry identity。', {
      exitCode: inspected.status,
      stderr: String(inspected.stderr || '').trim(),
    });
  }
  let inspectedIdentity;
  try { inspectedIdentity = JSON.parse(inspected.stdout); } catch (error) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-inspection-invalid', 'Retained projects/product/buildr返回的development entry identity不是合法JSON。', {
      parseError: error.message,
      stdout: String(inspected.stdout || '').slice(0, 2000),
    });
  }
  if (inspectedIdentity.schemaVersion !== 'buildr.development-cli-identity/v1') {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-inspection-schema-invalid', 'Retained projects/product/buildr返回了未知的development entry identity schema。', {
      schemaVersion: inspectedIdentity.schemaVersion || null,
    });
  }
  evidence.launcher.observed = inspectedIdentity.launcher || null;
  evidence.cliEntry.observed = inspectedIdentity.cliEntry || null;
  evidence.nodeExecutable.observed = inspectedIdentity.nodeExecutable || null;
  if (!sameFilesystemPath(evidence.launcher.observed, expectedLauncher)) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-launcher-mismatch', 'Retained Project bridge运行时launcher与本次checkout不一致。');
  }
  if (!sameFilesystemPath(evidence.cliEntry.observed, expectedCliEntry)) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-cli-mismatch', 'Retained Project bridge运行时CLI entry与本次checkout不一致。');
  }
  if (!sameFilesystemPath(evidence.nodeExecutable.observed, nodeExecutable)) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-node-mismatch', 'Retained Project bridge没有使用Environment绑定的retained Node。');
  }

  const versioned = execute(projectBridge, ['version', '--json'], { cwd: root, env: developmentEnvironment });
  phaseResult.operations.push(operation('development-entry-version', versioned, {
    kind: 'development-entry',
    executable: projectBridge,
    args: ['version', '--json'],
  }));
  if (versioned.status !== 0) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-version-failed', 'Retained projects/product/buildr无法执行version --json。', {
      exitCode: versioned.status,
      stderr: String(versioned.stderr || '').trim(),
    });
  }
  let versionPayload;
  try { versionPayload = JSON.parse(versioned.stdout); } catch (error) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-version-invalid', 'Retained projects/product/buildr version --json没有返回合法JSON。', {
      parseError: error.message,
      stdout: String(versioned.stdout || '').slice(0, 2000),
    });
  }
  evidence.package.observed = versionPayload.package || null;
  evidence.version.observed = versionPayload.version || null;
  evidence.channel.observed = versionPayload.channel || null;
  evidence.sourceCommit.observed = versionPayload.sourceCommit || null;
  evidence.nodeExecutable.observed = versionPayload.runtime?.executable || evidence.nodeExecutable.observed;
  if (evidence.package.observed !== evidence.package.expected
    || evidence.version.observed !== evidence.version.expected
    || evidence.channel.observed !== evidence.channel.expected
    || evidence.sourceCommit.observed !== evidence.sourceCommit.expected
    || !sameFilesystemPath(evidence.nodeExecutable.observed, nodeExecutable)) {
    developmentEntryFailure(evidence, 'self-bootstrap-closeout.development-entry-version-mismatch', 'Retained Project bridge的package/version/channel/source或Node与本次checkout不一致。');
  }
  evidence.status = 'passed';
  return evidence;
}

function developmentEntryCommand(execute, evidence, environment, root, args, id, phaseResult) {
  return command(execute, evidence.projectBridge, args, root, id, phaseResult, {
    kind: 'development-entry',
    executable: evidence.projectBridge,
    args,
  }, { ...environment, BUILDR_NODE: evidence.nodeExecutable.expected });
}

function requirePassed(result, code, message, details = null) {
  if (result.status !== 0) throw closeoutError(code, message, { ...details, exitCode: result.status, stderr: String(result.stderr || '').trim() });
  return result;
}

function git(execute, workspaceRoot, args, id, phaseResult) {
  return command(execute, 'git', args, workspaceRoot, id, phaseResult, { kind: 'git', args });
}

function gitText(execute, workspaceRoot, args, id, phaseResult, code) {
  return requirePassed(git(execute, workspaceRoot, args, id, phaseResult), code, `Git observation failed: ${id}`).stdout.trim();
}

function remoteRef(execute, workspaceRoot, remote, branch, phaseResult, id = 'remote-readback') {
  let observed;
  const attempts = id === 'remote-after-push' ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const operationId = attempt === 1 ? id : `${id}-${attempt}`;
    observed = git(execute, workspaceRoot, ['ls-remote', '--heads', remote, branch], operationId, phaseResult);
    if (observed.status === 0) break;
    if (attempt < attempts) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  requirePassed(observed, 'self-bootstrap-closeout.remote-readback-failed', '无法读取目标remote ref。');
  return observed.stdout.trim().split(/\s+/)[0] || null;
}

function changedPaths(execute, workspaceRoot, phaseResult, idPrefix, { ignoredUntrackedRoots = [] } = {}) {
  const tracked = zeroList(gitText(execute, workspaceRoot, ['diff', '--name-only', '-z'], `${idPrefix}-tracked`, phaseResult, 'self-bootstrap-closeout.git-diff-failed'));
  const staged = zeroList(gitText(execute, workspaceRoot, ['diff', '--cached', '--name-only', '-z'], `${idPrefix}-staged`, phaseResult, 'self-bootstrap-closeout.git-diff-failed'));
  const untracked = zeroList(gitText(execute, workspaceRoot, ['ls-files', '--others', '--exclude-standard', '-z'], `${idPrefix}-untracked`, phaseResult, 'self-bootstrap-closeout.git-status-failed'))
    .filter((pathname) => !ignoredUntrackedRoots.some((ownedRoot) => belongsToUntrackedRoot(pathname, ownedRoot)));
  return [...new Set([...tracked, ...staged, ...untracked])].sort();
}

function commitTrailers(message) {
  const trailers = {};
  for (const line of String(message || '').split('\n')) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) trailers[match[1]] = match[2].trim();
  }
  return trailers;
}

function inspectBuildrDescendantChain(execute, workspaceRoot, baseRef, targetRef, phaseResult) {
  const ancestor = git(execute, workspaceRoot, ['merge-base', '--is-ancestor', baseRef, targetRef], 'descendant-ancestor', phaseResult);
  if (ancestor.status !== 0) {
    throw closeoutError(
      ancestor.status === 1 ? 'self-bootstrap-closeout.descendant-not-ancestor' : 'self-bootstrap-closeout.descendant-ancestry-unreadable',
      '当前HEAD不是Finish final ref的可证明后继。',
      { baseRef, targetRef, exitCode: ancestor.status, stderr: String(ancestor.stderr || '').trim() },
    );
  }
  const merges = gitText(execute, workspaceRoot, ['rev-list', '--merges', `${baseRef}..${targetRef}`], 'descendant-merges', phaseResult, 'self-bootstrap-closeout.descendant-history-unreadable');
  if (merges) {
    throw closeoutError('self-bootstrap-closeout.descendant-merge-unprovable', 'Finish final ref之后的Buildr后继链包含merge commit。', {
      baseRef,
      targetRef,
      merges: merges.split('\n').filter(Boolean),
    });
  }
  const commits = gitText(execute, workspaceRoot, ['rev-list', '--reverse', '--first-parent', `${baseRef}..${targetRef}`], 'descendant-commits', phaseResult, 'self-bootstrap-closeout.descendant-history-unreadable')
    .split('\n').filter(Boolean);
  const provenance = [];
  for (const commit of commits) {
    const message = gitText(execute, workspaceRoot, ['show', '-s', '--format=%B', commit], `descendant-message-${commit.slice(0, 12)}`, phaseResult, 'self-bootstrap-closeout.descendant-message-unreadable');
    const trailers = commitTrailers(message);
    const taskOwned = Boolean(trailers[TASK_TRAILER]);
    const closeoutOwned = Boolean(trailers[FINISH_RUN_TRAILER] && trailers[PLAN_TRAILER]);
    if (!taskOwned && !closeoutOwned) {
      throw closeoutError('self-bootstrap-closeout.successor-identity-unprovable', 'Finish final ref之后存在无法证明由Buildr拥有的commit。', {
        baseRef,
        targetRef,
        commit,
        trailers,
      });
    }
    provenance.push({
      commit,
      owner: taskOwned ? 'task-finish' : 'self-bootstrap-closeout',
      taskId: trailers[TASK_TRAILER] || null,
      finishRunId: trailers[FINISH_RUN_TRAILER] || null,
      closeoutPlanIdentity: trailers[PLAN_TRAILER] || null,
    });
  }
  return provenance;
}

function markNotApplicable(stage, reason) {
  stage.status = 'not-applicable';
  stage.diagnostic = { code: 'self-bootstrap-closeout.not-applicable', message: reason };
}

function markPassed(stage, inputIdentity, outputIdentity, effects = []) {
  stage.status = 'passed';
  stage.inputIdentity = inputIdentity || null;
  stage.outputIdentity = outputIdentity || null;
  stage.effects.push(...effects);
}

function closeoutResult(result, plan, stages, status, diagnostic = null, developmentEntryIdentity = null, recoveryPlan = null) {
  return {
    schemaVersion: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA,
    status,
    runId: result?.runId || null,
    taskId: result?.identity?.task || null,
    mode: plan?.mode || null,
    plan: plan || null,
    recoveryPlan,
    developmentEntryIdentity,
    phases: SELF_BOOTSTRAP_CLOSEOUT_PHASES.map((id) => stages.get(id)),
    effects: SELF_BOOTSTRAP_CLOSEOUT_PHASES.flatMap((id) => stages.get(id).effects),
    diagnostic,
  };
}

export function runSelfBootstrapCloseout({ finishResult, workspaceRoot, nodeExecutable, recoveryPlan = null, allowLatestRemoteFastForward = false, execute = defaultExecute, environment = process.env }) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const stages = new Map(SELF_BOOTSTRAP_CLOSEOUT_PHASES.map((id) => [id, phase(id)]));
  let plan = null;
  let currentFinishResult = finishResult;
  let developmentEntryIdentity = null;
  let activationLeaseToken = null;
  let active = stages.get('preflight');
  const holdTargetLease = (id) => {
    const payload = targetLeaseCommand(execute, root, nodeExecutable, plan, activationLeaseToken ? 'refresh' : 'acquire', activationLeaseToken, id, active);
    if (!payload.lease?.token) throw closeoutError('self-bootstrap-closeout.target-lease-token-missing', 'Target lease driver通过但没有返回token。');
    if (activationLeaseToken && activationLeaseToken !== payload.lease.token) throw closeoutError('self-bootstrap-closeout.target-lease-token-drift', 'Target lease refresh改变了owner token。');
    activationLeaseToken = payload.lease.token;
  };
  const releaseTargetLease = (id) => {
    if (!activationLeaseToken) return;
    targetLeaseCommand(execute, root, nodeExecutable, plan, 'release', activationLeaseToken, id, active);
    activationLeaseToken = null;
  };
  try {
    const componentFile = path.join(root, COMPONENT_PATH);
    if (!fs.existsSync(componentFile) || !/^id:\s*buildr-self-bootstrap\s*$/m.test(fs.readFileSync(componentFile, 'utf8'))) {
      markNotApplicable(active, 'canonical Workspace没有buildr-self-bootstrap Component。');
      for (const id of SELF_BOOTSTRAP_CLOSEOUT_PHASES.slice(1)) markNotApplicable(stages.get(id), 'Workspace不适用self-bootstrap closeout。');
      return closeoutResult(finishResult, null, stages, 'not-applicable', null, developmentEntryIdentity, recoveryPlan);
    }
    if (currentFinishResult?.schemaVersion !== 'buildr.task-finish-result/v2') throw closeoutError('self-bootstrap-closeout.finish-result-schema-invalid', 'Runner只消费buildr.task-finish-result/v2。');
    if (currentFinishResult.resolvedContext?.capability?.id !== 'buildr.task-finish' || currentFinishResult.resolvedContext?.capability?.version !== 1) {
      throw closeoutError('self-bootstrap-closeout.capability-binding-missing', 'Finish Result没有已解析的buildr.task-finish/v1 capability binding。');
    }
    const finishWorkspaceRoot = currentFinishResult.identity?.workspaceRoot ? fs.realpathSync(path.resolve(currentFinishResult.identity.workspaceRoot)) : null;
    if (!finishWorkspaceRoot || !sameFilesystemPath(finishWorkspaceRoot, root)) throw closeoutError('self-bootstrap-closeout.workspace-mismatch', 'Finish Result绑定的canonical Workspace与runner target不一致。');
    plan = createSelfBootstrapCloseoutPlan(currentFinishResult);
    if (!plan.runId || !plan.taskId || !plan.agent || !plan.targetBranch || !plan.remote || !plan.baseRef) throw closeoutError('self-bootstrap-closeout.identity-incomplete', 'Finish Result缺少run、Task、Agent、target、remote或final ref。');
    if (recoveryPlan?.status === 'blocked') {
      throw closeoutError('self-bootstrap-closeout.foreign-carriers-require-owner-recovery', '检测到foreign Finish carrier；当前runner必须等待原owner按recovery plan恢复。', {
        recoveryPlanIdentity: recoveryPlan.identity,
        recoveryPlanStatus: recoveryPlan.status,
      });
    }
    const applicable = Object.values(plan.actions).some((paths) => paths.length);
    if (!applicable) {
      markNotApplicable(active, 'frozen Task Contribution未命中self-bootstrap动作。');
      active = stages.get('plan');
      markPassed(active, currentFinishResult.resolvedContext.identity, plan.identity);
      for (const id of SELF_BOOTSTRAP_CLOSEOUT_PHASES.slice(2)) markNotApplicable(stages.get(id), '当前plan没有适用动作。');
      return closeoutResult(currentFinishResult, plan, stages, 'not-applicable', null, developmentEntryIdentity, recoveryPlan);
    }
    const actualRoot = gitText(execute, root, ['rev-parse', '--show-toplevel'], 'workspace-root', active, 'self-bootstrap-closeout.git-root-unavailable');
    if (!sameFilesystemPath(actualRoot, root)) throw closeoutError('self-bootstrap-closeout.git-root-mismatch', 'Runner target不是retained Git根目录。', { actualRoot });
    const branch = gitText(execute, root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'target-branch', active, 'self-bootstrap-closeout.detached-head');
    if (branch !== plan.targetBranch) throw closeoutError('self-bootstrap-closeout.target-branch-mismatch', 'Retained checkout不在Finish绑定的target branch。', { expected: plan.targetBranch, actual: branch });
    const ownedCarrierPath = ownedFinishCarrierPath(currentFinishResult, root);
    const ignoredUntrackedRoots = [...new Set([
      ...(ownedCarrierPath ? [ownedCarrierPath] : []),
      ...provenForeignCarrierRoots(recoveryPlan, root),
    ])].sort();
    const changeObservation = ignoredUntrackedRoots.length ? { ignoredUntrackedRoots } : {};
    const initialChanges = changedPaths(execute, root, active, 'preflight', changeObservation);
    if (initialChanges.length) throw closeoutError('self-bootstrap-closeout.workspace-dirty', 'Retained Workspace在runner启动前不clean。', { changedPaths: initialChanges });
    holdTargetLease('acquire-target-lease');
    let head = gitText(execute, root, ['rev-parse', 'HEAD^{commit}'], 'head', active, 'self-bootstrap-closeout.head-unavailable');
    let remote = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-before');
    let prevalidatedProvenance = null;
    if (remote !== head) {
      requirePassed(
        git(execute, root, ['fetch', '--no-tags', '--no-write-fetch-head', plan.remote, `refs/heads/${plan.targetBranch}`], 'latest-target-fetch', active),
        'self-bootstrap-closeout.latest-dev-fetch-failed',
        '无法读取latest remote target以准备安全fast-forward。',
        { remote: plan.remote, targetBranch: plan.targetBranch },
      );
      const fetched = gitText(execute, root, ['rev-parse', `${remote}^{commit}`], 'latest-target-object', active, 'self-bootstrap-closeout.latest-dev-fetch-identity-mismatch');
      if (fetched !== remote) {
        throw closeoutError('self-bootstrap-closeout.latest-dev-fetch-identity-mismatch', 'Fetch后的latest remote target identity不匹配。', { expected: remote, actual: fetched });
      }
      const remoteAfterFetch = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-after-latest-fetch');
      if (remoteAfterFetch !== remote) {
        throw closeoutError('self-bootstrap-closeout.remote-drift', 'Latest remote target在fast-forward准备期间再次变化。', { before: remote, after: remoteAfterFetch });
      }
      const fastForwardable = git(execute, root, ['merge-base', '--is-ancestor', head, remote], 'latest-target-fast-forwardable', active);
      if (fastForwardable.status === 0) {
        prevalidatedProvenance = inspectBuildrDescendantChain(execute, root, plan.baseRef, remote, active);
        requirePassed(
          git(execute, root, ['merge', '--ff-only', remote], 'latest-target-fast-forward', active),
          'self-bootstrap-closeout.latest-dev-fast-forward-failed',
          'Retained target未能fast-forward到已验证的latest remote target。',
          { head, remote },
        );
        const fastForwardedHead = gitText(execute, root, ['rev-parse', 'HEAD^{commit}'], 'latest-target-head-readback', active, 'self-bootstrap-closeout.head-unavailable');
        if (fastForwardedHead !== remote) {
          throw closeoutError('self-bootstrap-closeout.latest-dev-fast-forward-readback-mismatch', 'Fast-forward后的retained HEAD与latest remote target不一致。', { expected: remote, actual: fastForwardedHead });
        }
        active.effects.push({ type: 'retained-target-fast-forward', branch: plan.targetBranch, before: head, after: fastForwardedHead, remote: plan.remote });
        head = fastForwardedHead;
      } else if (fastForwardable.status !== 1) {
        throw closeoutError('self-bootstrap-closeout.latest-dev-fast-forward-unavailable', '无法判断retained target是否可fast-forward到latest remote target。', {
          head,
          remote,
          exitCode: fastForwardable.status,
          stderr: String(fastForwardable.stderr || '').trim(),
        });
      }
    }
    if (plan.mode === 'doctor-blocked' && head !== plan.baseRef && remote === head) {
      const earlyResume = (resumeToken, id) => {
        const resumed = productCommand(execute, root, nodeExecutable, ['task', 'finish', 'run', '--task', plan.taskId, '--run', plan.runId, '--resume', resumeToken, '--target', root, '--detail', 'full', '--json'], id, active);
        requirePassed(resumed, 'self-bootstrap-closeout.early-finish-resume-failed', 'Activation前同一Finish run恢复命令失败。');
        return parseJson(resumed, 'self-bootstrap-closeout.early-finish-resume-result-invalid', 'Activation前Finish resume没有返回JSON。');
      };
      let payload = earlyResume(currentFinishResult.resume.token, 'resume-finish-before-activation');
      activationLeaseToken = null;
      if (deliveryAdaptationRequired(payload, plan.runId)) {
        throw closeoutError('self-bootstrap-closeout.target-race-adaptation-required', '最新Delivery Baseline需要Agent审核并适配同一Finish carrier。', {
          runId: payload.runId,
          primaryFailure: payload.primaryFailure,
          carrier: payload.carrier,
          resume: payload.resume,
          deliveryAdaptation: payload.deliveryAdaptation || null,
        });
      }
      const targetRaceToken = targetRaceResumeToken(payload, plan.runId);
      if (targetRaceToken) {
        holdTargetLease('reacquire-target-lease-before-target-race-resume');
        payload = earlyResume(targetRaceToken, 'resume-finish-target-race-before-activation');
        activationLeaseToken = null;
        if (deliveryAdaptationRequired(payload, plan.runId)) {
          throw closeoutError('self-bootstrap-closeout.target-race-adaptation-required', '最新Delivery Baseline需要Agent审核并适配同一Finish carrier。', {
            runId: payload.runId,
            primaryFailure: payload.primaryFailure,
            carrier: payload.carrier,
            resume: payload.resume,
            deliveryAdaptation: payload.deliveryAdaptation || null,
          });
        }
      }
      if (payload.runId !== plan.runId || !finishMode(payload)) {
        throw closeoutError('self-bootstrap-closeout.early-finish-resume-incomplete', 'Activation前同一Finish run仍未收敛到complete或retained Doctor blocked。', { payload });
      }
      currentFinishResult = payload;
      const nextPlan = createSelfBootstrapCloseoutPlan(currentFinishResult);
      if (nextPlan.taskId !== plan.taskId || nextPlan.targetBranch !== plan.targetBranch || nextPlan.remote !== plan.remote) {
        throw closeoutError('self-bootstrap-closeout.early-finish-result-identity-mismatch', 'Activation前Finish Result改变了Task或target identity。', { before: plan, after: nextPlan });
      }
      plan = nextPlan;
      holdTargetLease('reacquire-target-lease-after-early-finish');
      head = gitText(execute, root, ['rev-parse', 'HEAD^{commit}'], 'head-after-early-finish', active, 'self-bootstrap-closeout.head-unavailable');
      remote = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-after-early-finish');
      if (head !== remote) throw closeoutError('self-bootstrap-closeout.early-finish-target-mismatch', 'Activation前Finish收敛后retained HEAD与remote不一致。', { head, remote });
      prevalidatedProvenance = null;
    }
    let recovery = 'fresh';
    let activationBaseRef = plan.baseRef;
    if (head === plan.baseRef) {
      if (remote !== plan.baseRef) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Remote已偏离Finish final ref。', { expected: plan.baseRef, actual: remote });
    } else {
      const provenance = prevalidatedProvenance || inspectBuildrDescendantChain(execute, root, plan.baseRef, head, active);
      const parent = gitText(execute, root, ['rev-parse', 'HEAD^'], 'successor-parent', active, 'self-bootstrap-closeout.successor-parent-unavailable');
      const message = gitText(execute, root, ['show', '-s', '--format=%B', 'HEAD'], 'successor-message', active, 'self-bootstrap-closeout.successor-message-unavailable');
      const trailers = commitTrailers(message);
      const currentRunSuccessor = trailers[FINISH_RUN_TRAILER] === plan.runId && trailers[PLAN_TRAILER] === plan.identity;
      if (currentRunSuccessor) {
        if (![parent, head].includes(remote)) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Remote既不是当前activation base，也不是当前run的合法successor。', { baseRef: plan.baseRef, activationBaseRef: parent, head, remote });
        activationBaseRef = parent;
        recovery = remote === head ? 'already-complete' : 'resume-after-commit';
      } else {
        if (remote !== head) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Buildr后继链尚未完整发布到目标remote。', { baseRef: plan.baseRef, head, remote });
        activationBaseRef = head;
        recovery = 'fresh-descendant';
      }
      active.effects.push({ type: 'buildr-descendant-chain', baseRef: plan.baseRef, head, provenance });
    }
    markPassed(active, currentFinishResult.resolvedContext.identity, head, [{
      type: 'activation-base-selected',
      frozenRef: plan.baseRef,
      activationBaseRef,
      recovery,
    }]);

    active = stages.get('plan');
    markPassed(active, currentFinishResult.resolvedContext.identity, plan.identity);

    const syncRequired = plan.actions['sync-retained-workspace'].length > 0;
    let successor = head;
    if (syncRequired) {
      active = stages.get('sync');
      holdTargetLease('refresh-target-lease-before-sync');
      const synced = productCommand(execute, root, nodeExecutable, ['sync', plan.agent, '--target', root, '--json'], 'workspace-sync', active);
      requirePassed(synced, 'self-bootstrap-closeout.sync-failed', 'Retained Workspace sync失败。');
      const ownedPaths = changedPaths(execute, root, active, 'post-sync', changeObservation);
      if (['resume-after-commit', 'already-complete'].includes(recovery) && ownedPaths.length) throw closeoutError('self-bootstrap-closeout.successor-sync-drift', '当前run的合法successor存在，但重算sync仍产生delta。', { changedPaths: ownedPaths });
      markPassed(active, plan.identity, digest({ ownedPaths }), ownedPaths.length ? [{ type: 'workspace-sync', paths: ownedPaths }] : []);

      active = stages.get('commit');
      holdTargetLease('refresh-target-lease-before-commit');
      if (['fresh', 'fresh-descendant'].includes(recovery) && ownedPaths.length) {
        const added = git(execute, root, ['add', '--', ...ownedPaths], 'stage-owned-paths', active);
        requirePassed(added, 'self-bootstrap-closeout.stage-failed', '精确stage sync delta失败。', { ownedPaths });
        const staged = zeroList(gitText(execute, root, ['diff', '--cached', '--name-only', '-z'], 'staged-readback', active, 'self-bootstrap-closeout.staged-readback-failed'));
        const remaining = changedPaths(execute, root, active, 'post-stage', changeObservation);
        if (JSON.stringify(staged) !== JSON.stringify(ownedPaths) || remaining.some((item) => !staged.includes(item))) {
          throw closeoutError('self-bootstrap-closeout.owned-path-mismatch', 'staged set与sync owned paths不一致。', { ownedPaths, staged, remaining });
        }
        const message = `收敛 Buildr 自举 Workspace\n\n${FINISH_RUN_TRAILER}: ${plan.runId}\n${PLAN_TRAILER}: ${plan.identity}`;
        const committed = git(execute, root, ['commit', '-m', message], 'successor-commit', active);
        requirePassed(committed, 'self-bootstrap-closeout.commit-failed', '创建独立successor commit失败。');
        successor = gitText(execute, root, ['rev-parse', 'HEAD^{commit}'], 'successor-head', active, 'self-bootstrap-closeout.successor-head-unavailable');
        const parent = gitText(execute, root, ['rev-parse', 'HEAD^'], 'successor-parent-readback', active, 'self-bootstrap-closeout.successor-parent-unavailable');
        if (parent !== activationBaseRef) throw closeoutError('self-bootstrap-closeout.successor-parent-mismatch', 'successor commit不是当前activation base的单一后继。', { expected: activationBaseRef, actual: parent, frozenRef: plan.baseRef });
        markPassed(active, activationBaseRef, successor, [{ type: 'git-commit', ref: successor, paths: ownedPaths }]);
      } else {
        successor = head;
        markPassed(active, activationBaseRef, successor);
      }

      active = stages.get('push');
      holdTargetLease('refresh-target-lease-before-push');
      const beforePush = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-before-push');
      if (beforePush !== successor) {
        if (beforePush !== activationBaseRef) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Push前remote不再等于当前activation base。', { expected: activationBaseRef, actual: beforePush, frozenRef: plan.baseRef });
        const pushed = git(execute, root, ['push', plan.remote, `HEAD:${plan.targetBranch}`], 'successor-push', active);
        requirePassed(pushed, 'self-bootstrap-closeout.push-failed', '普通push失败；本地successor commit已保留。', { successor, remoteBefore: beforePush });
        active.effects.push({ type: 'git-push', remote: plan.remote, branch: plan.targetBranch, ref: successor });
      }
      const afterPush = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-after-push');
      if (afterPush !== successor) throw closeoutError('self-bootstrap-closeout.remote-readback-mismatch', 'Push后remote readback与successor不一致。', { expected: successor, actual: afterPush });
      markPassed(active, beforePush, afterPush);
    } else {
      markNotApplicable(stages.get('sync'), 'frozen paths未命中Workspace package输入。');
      markNotApplicable(stages.get('commit'), '没有Workspace sync delta。');
      markNotApplicable(stages.get('push'), '没有successor commit需要发布。');
    }

    active = stages.get('install-local-app');
    holdTargetLease('refresh-target-lease-before-local-app');
    if (plan.actions['install-development-local-app'].length) {
      const continuityBefore = inspectDevelopmentWebContinuity(execute, root, nodeExecutable, environment, active);
      const manager = path.join(root, SERVICE_ROOT, 'package', 'launchers', 'manage.mjs');
      const args = [manager, 'install', '--channel', 'development'];
      const installed = command(execute, nodeExecutable, args, root, 'install-development-local-app', active, { kind: 'development-launcher-manager', script: manager, args: args.slice(1) });
      requirePassed(installed, 'self-bootstrap-closeout.local-app-install-failed', 'Development Local App安装失败。');
      const payload = validateDevelopmentLauncherResult(
        parseJson(installed, 'self-bootstrap-closeout.local-app-result-invalid', 'Development Local App installer没有返回JSON。'),
        root,
        nodeExecutable,
        successor,
      );
      const continuityAfter = recoverDevelopmentWebContinuity({
        execute,
        root,
        nodeExecutable,
        successor,
        launcher: payload,
        continuity: continuityBefore,
        environment,
        phaseResult: active,
      });
      markPassed(active, plan.identity, digest({ launcher: payload, continuityBefore, continuityAfter }), [
        { type: 'install-development-local-app', ref: successor, channel: 'development', target: payload.target },
        {
          type: 'development-web-continuity',
          status: continuityAfter.status,
          reason: continuityAfter.reason || null,
          previousPid: continuityBefore.instance?.pid || null,
          currentPid: continuityAfter.instance?.pid || null,
          port: continuityBefore.instance?.port || null,
        },
      ]);
    } else markNotApplicable(active, 'frozen paths未命中Development Local App输入。');

    active = stages.get('verify-development-entry');
    holdTargetLease('refresh-target-lease-before-development-entry');
    developmentEntryIdentity = verifyDevelopmentEntryIdentity({ execute, root, nodeExecutable, successor, environment, phaseResult: active });
    markPassed(active, plan.identity, digest(developmentEntryIdentity), [{ type: 'verify-development-entry', path: developmentEntryIdentity.projectBridge }]);

    active = stages.get('finalize');
    holdTargetLease('refresh-target-lease-before-finalize');
    if (plan.mode === 'complete') {
      const doctor = developmentEntryCommand(execute, developmentEntryIdentity, environment, root, ['doctor', '--agent', plan.agent, '--target', root, '--json'], 'final-doctor', active);
      requirePassed(doctor, 'self-bootstrap-closeout.doctor-failed', '最终Doctor命令失败。');
      const payload = parseJson(doctor, 'self-bootstrap-closeout.doctor-result-invalid', '最终Doctor没有返回JSON。');
      if (payload.health?.ready !== true) throw closeoutError('self-bootstrap-closeout.doctor-not-ready', '最终Doctor未ready。', { findings: payload.findings || [] });
      markPassed(active, successor, digest(payload));
    } else {
      const resumed = developmentEntryCommand(execute, developmentEntryIdentity, environment, root, ['task', 'finish', 'run', '--task', plan.taskId, '--run', plan.runId, '--resume', currentFinishResult.resume.token, '--target', root, '--detail', 'full', '--json'], 'resume-finish-run', active);
      requirePassed(resumed, 'self-bootstrap-closeout.finish-resume-failed', '同一Finish run恢复命令失败。');
      let payload = parseJson(resumed, 'self-bootstrap-closeout.finish-resume-result-invalid', 'Finish resume没有返回JSON。');
      activationLeaseToken = null;
      const targetRaceToken = targetRaceResumeToken(payload, plan.runId);
      if (targetRaceToken) {
        holdTargetLease('reacquire-target-lease-before-final-target-race');
        const recovered = developmentEntryCommand(execute, developmentEntryIdentity, environment, root, ['task', 'finish', 'run', '--task', plan.taskId, '--run', plan.runId, '--resume', targetRaceToken, '--target', root, '--detail', 'full', '--json'], 'resume-finish-target-race', active);
        requirePassed(recovered, 'self-bootstrap-closeout.target-race-resume-failed', '同一Finish run的target-race恢复命令失败。');
        payload = parseJson(recovered, 'self-bootstrap-closeout.target-race-resume-result-invalid', 'target-race恢复没有返回JSON。');
        activationLeaseToken = null;
        if (deliveryAdaptationRequired(payload, plan.runId)) {
          throw closeoutError('self-bootstrap-closeout.target-race-adaptation-required', '最新Delivery Baseline需要Agent审核并适配同一Finish carrier；Agent无法安全处理时请求用户授权。', {
            runId: payload.runId,
            primaryFailure: payload.primaryFailure,
            carrier: payload.carrier,
            resume: payload.resume,
            deliveryAdaptation: payload.deliveryAdaptation || null,
          });
        }
      }
      if (payload.status !== 'complete') throw closeoutError('self-bootstrap-closeout.finish-resume-incomplete', '同一Finish run恢复后仍未complete。', { status: payload.status, resume: payload.resume || null });
      markPassed(active, currentFinishResult.resume.token, payload.resolvedContext?.identity || payload.runId);
    }
    releaseTargetLease('release-target-lease');
    return closeoutResult(currentFinishResult, plan, stages, 'passed', null, developmentEntryIdentity, recoveryPlan);
  } catch (error) {
    if (activationLeaseToken) {
      try { releaseTargetLease('release-target-lease-after-block'); } catch (releaseError) {
        error.details = { ...(error.details || {}), leaseRelease: { code: releaseError.code || null, message: releaseError.message } };
      }
    }
    const { developmentEntryIdentity: failedDevelopmentEntryIdentity = null, ...diagnosticDetails } = error.details || {};
    if (failedDevelopmentEntryIdentity) developmentEntryIdentity = failedDevelopmentEntryIdentity;
    active.status = 'blocked';
    active.diagnostic = {
      code: error.code || 'self-bootstrap-closeout.failed',
      message: error.message,
      details: Object.keys(diagnosticDetails).length ? diagnosticDetails : null,
    };
    for (const id of SELF_BOOTSTRAP_CLOSEOUT_PHASES) {
      const item = stages.get(id);
      if (item.status === 'pending') markNotApplicable(item, '前序阶段已停止。');
    }
    return closeoutResult(currentFinishResult, plan, stages, 'blocked', active.diagnostic, developmentEntryIdentity, recoveryPlan);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw closeoutError('self-bootstrap-closeout.option-value-missing', `Missing value for ${name}`);
  return value;
}

function commandResultError(code, message, result) {
  return closeoutError(code, message, {
    exitCode: result.status,
    stdout: String(result.stdout || '').trim().slice(0, 2000),
    stderr: String(result.stderr || '').trim().slice(0, 2000),
  });
}

export function runSelfBootstrapCloseoutCommand({ args = process.argv.slice(2), actualNodeExecutable = process.execPath, execute = defaultExecute, environment = process.env } = {}) {
  const allowed = new Set(['--run', '--target', '--node-executable', '--retry-after-foreign-clear']);
  if (args.length % 2 !== 0) throw closeoutError('self-bootstrap-closeout.arguments-invalid', 'Runner参数必须为成对的option和值。');
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index])) throw closeoutError('self-bootstrap-closeout.option-unknown', `Unknown option: ${args[index]}`);
  }
  const runId = option(args, '--run');
  const targetRoot = option(args, '--target');
  const nodeExecutable = option(args, '--node-executable');
  const retryAfterForeignClear = option(args, '--retry-after-foreign-clear');
  if (!runId || !targetRoot || !nodeExecutable) {
    throw closeoutError('self-bootstrap-closeout.arguments-incomplete', 'Usage: node closeout.mjs --run <finish-run-id> --target <canonical-workspace> --node-executable <retained-node>');
  }
  if (!sameFilesystemPath(actualNodeExecutable, nodeExecutable)) {
    throw closeoutError('self-bootstrap-closeout.node-identity-mismatch', 'Runner必须由Environment绑定的retained Node启动。', { expected: nodeExecutable, actual: actualNodeExecutable });
  }
  if (retryAfterForeignClear !== null && retryAfterForeignClear !== 'true') {
    throw closeoutError('self-bootstrap-closeout.retry-mode-invalid', '--retry-after-foreign-clear只接受true。');
  }

  const root = fs.realpathSync(path.resolve(targetRoot));
  const cli = path.join(root, SERVICE_ROOT, 'bin', 'buildr.mjs');
  const inspected = execute(nodeExecutable, [cli, 'task', 'finish', 'inspect', '--run', runId, '--target', root, '--detail', 'full', '--json'], { cwd: root });
  if (inspected.status !== 0) throw commandResultError('self-bootstrap-closeout.finish-inspect-failed', '无法通过Product CLI读取Finish Result。', inspected);
  let finishResult;
  try { finishResult = JSON.parse(inspected.stdout); } catch (error) {
    throw closeoutError('self-bootstrap-closeout.finish-inspect-result-invalid', 'Product CLI没有返回合法Finish Result JSON。', { parseError: error.message, stdout: String(inspected.stdout || '').slice(0, 2000) });
  }
  if (finishResult.runId !== runId) throw closeoutError('self-bootstrap-closeout.finish-run-mismatch', 'Product CLI返回的Finish run identity不匹配。', { expected: runId, actual: finishResult.runId || null });
  const carrierEntries = discoverFinishCarrierEntries(root).map((entry) => {
    if (entry.diagnostic || entry.runId === runId) return entry;
    const foreignInspection = execute(nodeExecutable, [cli, 'task', 'finish', 'inspect', '--run', entry.runId, '--target', root, '--detail', 'full', '--json'], { cwd: root });
    if (foreignInspection.status !== 0) {
      return {
        ...entry,
        inspectDiagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.foreign-finish-inspect-failed', '无法通过Product CLI读取foreign Finish Result。', {
          exitCode: foreignInspection.status,
          stderr: String(foreignInspection.stderr || '').trim().slice(0, 2000),
        }),
      };
    }
    try {
      const finishResult = JSON.parse(foreignInspection.stdout);
      const taskId = finishResult?.identity?.task || null;
      if (!taskId) return { ...entry, finishResult };
      const taskInspection = execute(nodeExecutable, [cli, 'task', 'inspect', taskId, '--target', root, '--json'], { cwd: root });
      if (taskInspection.status !== 0) return { ...entry, finishResult, taskRecord: null };
      try {
        const inspected = JSON.parse(taskInspection.stdout);
        return { ...entry, finishResult, taskRecord: inspected?.record || null };
      } catch {
        return { ...entry, finishResult, taskRecord: null };
      }
    } catch (error) {
      return {
        ...entry,
        inspectDiagnostic: carrierObservationDiagnostic('self-bootstrap-closeout.foreign-finish-inspect-result-invalid', 'Product CLI没有返回合法foreign Finish Result JSON。', { parseError: error.message }),
      };
    }
  });
  const recoveryPlan = createSelfBootstrapRecoveryPlan({
    currentFinishResult: finishResult,
    carrierEntries,
    workspaceRoot: root,
    nodeExecutable,
    runnerPath: fileURLToPath(import.meta.url),
  });
  return runSelfBootstrapCloseout({
    finishResult,
    workspaceRoot: root,
    nodeExecutable,
    recoveryPlan,
    allowLatestRemoteFastForward: retryAfterForeignClear === 'true',
    execute,
    environment,
  });
}

function main() {
  try {
    const result = runSelfBootstrapCloseoutCommand();
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      schemaVersion: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA,
      status: 'blocked',
      diagnostic: { code: error.code || 'self-bootstrap-closeout.driver-failed', message: error.message, details: error.details || null },
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
