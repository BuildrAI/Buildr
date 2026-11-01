#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA = 'buildr.self-bootstrap-closeout-result/v1';
export const SELF_BOOTSTRAP_SYNC_RESUME_SCHEMA = 'buildr.self-bootstrap-sync-resume/v1';
export const LONG_RUNNING_OPERATION_SUMMARY_SCHEMA = 'buildr.long-running-operation-summary/v1';
const LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES = 16 * 1024;
export const SELF_BOOTSTRAP_CLOSEOUT_PHASES = Object.freeze([
  'preflight',
  'plan',
  'sync',
  'commit',
  'push',
  'install-buildr-web',
  'verify-development-entry',
  'finalize',
]);

const PRODUCT_ROOT = 'projects/product';
const SERVICE_ROOT = `${PRODUCT_ROOT}/services/buildr`;
const COMPONENT_PATH = 'components/workspace/buildr-self-bootstrap/component.yml';
const DEVELOPMENT_WEB_CONTINUITY_SCRIPT = 'skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
function developmentSourceBinding(root, instance) {
  // Projected callers load policy from the explicitly verified retained checkout.
  const file = path.join(root, DEVELOPMENT_WEB_CONTINUITY_SCRIPT);
  const shared = createRequire(file)(file);
  if (typeof shared.developmentSourceBinding !== 'function') throw closeoutError('self-bootstrap-closeout.development-web-inspection-invalid', '当前开发更新来源定义不可用。');
  return shared.developmentSourceBinding(instance);
}
const DEFAULT_DEVELOPMENT_WEB_PORT = 4458;

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

function compactText(value, maxBytes = 512) {
  const text = typeof value === 'string' && value ? value : null;
  if (!text || Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const suffix = '…';
  const budget = maxBytes - Buffer.byteLength(suffix, 'utf8');
  let output = '';
  let bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > budget) break;
    output += character;
    bytes += size;
  }
  return `${output}${suffix}`;
}

export function compactSelfBootstrapCloseout(result) {
  const status = ['passed', 'blocked', 'not-applicable'].includes(result?.status) ? result.status : 'blocked';
  const stages = (result?.phases || []).slice(0, 12).map((stage) => ({ id: String(stage.id || 'unknown'), status: String(stage.status || 'unknown') }));
  const maintenanceEvidence = result?.maintenance?.selfBootstrap || null;
  const summary = {
    schemaVersion: LONG_RUNNING_OPERATION_SUMMARY_SCHEMA,
    operation: 'self-bootstrap.closeout',
    detail: 'compact',
    terminal: true,
    status,
    taskId: result?.taskId || null,
    runId: result?.runId || null,
    resultIdentity: maintenanceEvidence?.resultIdentity || null,
    stages,
    primaryFailure: result?.diagnostic ? {
      stage: (result.phases || []).find((stage) => stage.status === 'blocked')?.id || null,
      code: result.diagnostic.code || 'self-bootstrap-closeout.failed',
      message: compactText(result.diagnostic.message),
    } : null,
    cleanup: { status: result?.maintenance?.environmentCleanup === 'cleaned' ? 'passed' : result?.maintenance?.environmentCleanup === 'attention' ? 'failed' : 'pending' },
    output: { maxBytes: LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES, bytes: 0, truncated: Boolean(result?.phases?.some((stage) => stage.operations?.length || stage.effects?.length) || result?.effects?.length) },
    recovery: result?.taskId && result?.runId ? { owner: 'task-finish', operation: 'inspect', taskId: result.taskId, runId: result.runId, recordId: null } : null,
  };
  for (let attempt = 0; attempt < 4; attempt += 1) summary.output.bytes = Buffer.byteLength(`${JSON.stringify(summary)}\n`, 'utf8');
  if (summary.output.bytes > LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES) throw closeoutError('self-bootstrap-closeout.compact-output-overflow', 'Self-bootstrap compact summary超过固定输出上限。');
  return summary;
}

function matches(pathname, exact, prefixes = []) {
  return exact.includes(pathname) || prefixes.some((prefix) => pathname.startsWith(prefix));
}

function classifications(changedPaths, workspaceRoot) {
  // A projected Skill resolves the single product-owned policy from the verified root.
  const { isDevelopmentRuntimeInput } = createRequire(import.meta.url)(path.join(workspaceRoot, SERVICE_ROOT, 'src/modules/installation/infrastructure/development-runtime-inputs.ts'));
  const sync = [];
  const cli = [];
  const buildrWeb = [];
  for (const pathname of changedPaths) {
    if (/^projects\/.*\/AGENTS\.md$/.test(pathname) || matches(pathname, ['AGENTS.md', `${SERVICE_ROOT}/resources/manifest.yml`], [
      'skills/',
      'rules/',
      'components/',
      'commands/',
      `${SERVICE_ROOT}/resources/workspace/`,
      `${SERVICE_ROOT}/resources/runtime/skills/buildr/`,
    ])) sync.push(pathname);
    if (matches(pathname, [
      `${PRODUCT_ROOT}/buildr`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/scripts/install-buildr-cli`,
      `${SERVICE_ROOT}/tools/development/run-development-cli`,
      `${SERVICE_ROOT}/scripts/uninstall-buildr-cli`,
    ], [`${SERVICE_ROOT}/bin/`, `${SERVICE_ROOT}/src/`])) cli.push(pathname);
    if (isDevelopmentRuntimeInput(pathname)) buildrWeb.push(pathname);
  }
  return {
    'sync-retained-workspace': [...new Set(sync)].sort(),
    'install-development-buildr-web': [...new Set(buildrWeb)].sort(),
    'verify-development-entry': [...new Set([...sync, ...cli, ...buildrWeb])].sort(),
  };
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
  const result = spawnSync(executable, args, { cwd: options.cwd, encoding: options.binary ? null : 'utf8', env: options.env || process.env });
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

function belongsToUntrackedRoot(pathname, root) {
  const normalized = String(pathname || '').replaceAll('\\', '/').replace(/\/+$/, '');
  return normalized === root || normalized.startsWith(`${root}/`);
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
    || identity.checkout?.head !== successor
    || identity.webPort !== DEFAULT_DEVELOPMENT_WEB_PORT) {
    throw closeoutError('self-bootstrap-closeout.local-app-identity-mismatch', 'Development Launcher没有绑定当前retained checkout与retained Node。', {
      expected: { sourceRoot: expectedSourceRoot, nodeExecutable, checkoutHead: successor, webPort: DEFAULT_DEVELOPMENT_WEB_PORT },
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
    const instance = payload.instance, source = developmentSourceBinding(root, instance);
    if (!Number.isInteger(instance?.port) || instance.port <= 0 || instance.port > 65535
      || !Number.isInteger(instance?.pid) || instance.pid <= 0
      || source?.channel !== 'development') {
      throw closeoutError('self-bootstrap-closeout.development-web-inspection-invalid', '健康Development Web实例缺少可证明的port、PID或开发来源身份。', { payload });
    }
    if (!sameFilesystemPath(source.sourceRoot, path.join(root, SERVICE_ROOT))
      || !sameFilesystemPath(source.developmentRuntime?.executable, nodeExecutable)) {
      return { ...payload, status: 'different-owner', reason: 'development-source-mismatch' };
    }
  }
  return payload;
}

function developmentLauncherIdentityPath(payload) {
  return payload.platform === 'darwin'
    ? path.join(payload.target, 'Contents', 'Resources', 'launcher-identity.json')
    : path.join(payload.target, 'launcher-identity.json');
}

function recoverDevelopmentWebContinuity({ execute, root, nodeExecutable, successor, launcher, continuity, environment, phaseResult, forceRestart = false }) {
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
  const { readDevelopmentRuntimeIdentity } = createRequire(import.meta.url)(path.join(root, SERVICE_ROOT, 'src/modules/installation/infrastructure/development-runtime-inputs.ts'));
  const runtimeIdentity = readDevelopmentRuntimeIdentity(expectedSourceRoot, root);
  if (!runtimeIdentity) throw closeoutError('self-bootstrap-closeout.development-runtime-unavailable', '无法核验开发应用的当前运行输入。');
  const previous = continuity.instance;
  const args = [
    script,
    'restart',
    '--project-bridge', projectBridge,
    '--port', String(DEFAULT_DEVELOPMENT_WEB_PORT),
    '--previous-port', String(previous.port),
    '--launcher-identity', developmentLauncherIdentityPath(launcher),
    '--expected-source-root', expectedSourceRoot,
    '--expected-head', successor,
    '--expected-runtime-identity', runtimeIdentity,
    '--node-executable', nodeExecutable,
    '--previous-pid', String(previous.pid),
  ];
  if (forceRestart) args.push('--force-restart', 'true');
  const restarted = command(execute, nodeExecutable, args, root, 'restart-development-web-continuity', phaseResult, {
    kind: 'development-web-continuity',
    script,
    args: args.slice(1),
    action: 'restart',
    previousPort: previous.port,
    currentPort: DEFAULT_DEVELOPMENT_WEB_PORT,
  }, environment);
  requirePassed(restarted, 'self-bootstrap-closeout.development-web-restart-failed', `Development Web未能迁移到固定端口 ${DEFAULT_DEVELOPMENT_WEB_PORT}。`);
  const payload = parseJson(restarted, 'self-bootstrap-closeout.development-web-restart-invalid', 'Development Web恢复结果不是合法JSON。');
  const identity = payload?.launcherIdentity;
  if (payload?.schemaVersion !== 'buildr.development-web-continuity/v1'
    || payload.action !== 'restart'
    || payload.status !== 'passed'
    || payload.previous?.pid !== previous.pid
    || payload.previous?.port !== previous.port
    || payload.instance?.port !== DEFAULT_DEVELOPMENT_WEB_PORT
    || !Number.isInteger(payload.instance?.pid)
    || payload.instance.pid <= 0
    || !runtimeIdentity
    || payload.instance?.productIdentity?.developmentRuntimeIdentity !== runtimeIdentity
    || identity?.channel !== 'development'
    || !sameFilesystemPath(identity.sourceRoot, expectedSourceRoot)
    || !sameFilesystemPath(identity.developmentRuntime?.executable, nodeExecutable)
    || identity.checkout?.head !== successor) {
    throw closeoutError('self-bootstrap-closeout.development-web-restart-identity-mismatch', '恢复后的Development Web没有迁移到固定端口或绑定retained successor identity。', {
      expected: { previousPort: previous.port, currentPort: DEFAULT_DEVELOPMENT_WEB_PORT, previousPid: previous.pid, sourceRoot: expectedSourceRoot, nodeExecutable, checkoutHead: successor },
      actual: payload || null,
    });
  }
  return payload;
}

// This is a local obligation to restore a previously running app, not a delivery
// receipt. Keep it across failed invocations until authenticated health confirms
// that the app is available again.
function developmentWebRecoveryFile(root) {
  return path.join(root, '.buildr/local/self-bootstrap-development-web-recovery.json');
}

function developmentWebRecoveryDataRoot(root, environment) {
  const { developmentWebDataRoot } = createRequire(import.meta.url)(path.join(root, DEVELOPMENT_WEB_CONTINUITY_SCRIPT));
  return developmentWebDataRoot(environment);
}

function readDevelopmentWebRecovery(root, nodeExecutable) {
  const file = developmentWebRecoveryFile(root);
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw closeoutError('self-bootstrap-closeout.development-web-recovery-invalid', '开发应用待恢复信息无法读取，已保留。', { file });
  }
  const source = developmentSourceBinding(root, state?.continuity?.instance);
  if (state?.schemaVersion !== 'buildr.development-web-recovery/v1'
    || !sameFilesystemPath(state.workspaceRoot, root)
    || !sameFilesystemPath(state.nodeExecutable, nodeExecutable)
    || state.continuity?.status !== 'healthy-development'
    || !Number.isInteger(state.continuity.instance?.pid) || state.continuity.instance.pid <= 0
    || !Number.isInteger(state.continuity.instance.port) || state.continuity.instance.port <= 0 || state.continuity.instance.port > 65535
    || source?.channel !== 'development'
    || !sameFilesystemPath(source.sourceRoot, path.join(root, SERVICE_ROOT))
    || !sameFilesystemPath(source.developmentRuntime?.executable, nodeExecutable)) {
    throw closeoutError('self-bootstrap-closeout.development-web-recovery-invalid', '开发应用待恢复信息与当前来源不匹配，已保留。', { file });
  }
  return state;
}

function rememberDevelopmentWebRecovery(root, nodeExecutable, continuity, environment) {
  const file = developmentWebRecoveryFile(root);
  const state = { schemaVersion: 'buildr.development-web-recovery/v1', workspaceRoot: root, nodeExecutable,
    appDataRoot: developmentWebRecoveryDataRoot(root, environment), continuity };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return state;
}

function clearDevelopmentWebRecovery(root, recovery) {
  const current = readDevelopmentWebRecovery(root, recovery.nodeExecutable);
  if (!current || digest(current) !== digest(recovery)) throw closeoutError('self-bootstrap-closeout.development-web-recovery-changed', '开发应用待恢复信息已变化，未删除其他恢复请求。');
  fs.unlinkSync(developmentWebRecoveryFile(root));
}

function recoveryEnvironment(state, environment) {
  const currentRoot = developmentWebRecoveryDataRoot(state.workspaceRoot, environment);
  if (state.appDataRoot !== currentRoot) throw closeoutError('self-bootstrap-closeout.development-web-recovery-root-mismatch', '开发应用待恢复信息属于不同的数据目录，已保留。');
  return environment;
}

function restoreDevelopmentWebAfterFailure({ execute, root, nodeExecutable, recovery, environment, phaseResult }) {
  recoveryEnvironment(recovery, environment);
  const observed = inspectDevelopmentWebContinuity(execute, root, nodeExecutable, environment, phaseResult);
  if (observed.status === 'healthy-development') {
    const identity = developmentSourceBinding(root, observed.instance);
    if (!sameFilesystemPath(identity.sourceRoot, path.join(root, SERVICE_ROOT))
      || !sameFilesystemPath(identity.developmentRuntime?.executable, nodeExecutable)) {
      throw closeoutError('self-bootstrap-closeout.development-web-recovery-owner-mismatch', '当前开发应用来源不同，未替换该实例。');
    }
    return { status: 'passed', disposition: 'preserved', instance: observed.instance };
  }
  if (observed.status === 'different-owner') throw closeoutError('self-bootstrap-closeout.development-web-recovery-owner-mismatch', '当前应用不属于开发版，未替换该实例。');
  const status = command(execute, nodeExecutable, [path.join(root, SERVICE_ROOT, 'tools/build/launcher/manage.ts'), 'status', '--channel', 'development'], root, 'inspect-recovery-launcher', phaseResult);
  requirePassed(status, 'self-bootstrap-closeout.development-web-recovery-launcher-unavailable', '无法读取用于恢复的开发启动器。');
  const launcher = parseJson(status, 'self-bootstrap-closeout.development-web-recovery-launcher-invalid', '恢复启动器信息无效。');
  const installedHead = launcher.identity?.checkout?.head;
  if (!/^[a-f0-9]{40,64}$/.test(installedHead || '')) throw closeoutError('self-bootstrap-closeout.development-web-recovery-launcher-invalid', '恢复启动器缺少来源提交。');
  validateDevelopmentLauncherResult(launcher, root, nodeExecutable, installedHead);
  return recoverDevelopmentWebContinuity({ execute, root, nodeExecutable, successor: installedHead, launcher,
    continuity: recovery.continuity, environment, phaseResult });
}

function developmentEntryFailure(evidence, code, message, details = null) {
  evidence.status = 'blocked';
  throw closeoutError(code, message, { developmentEntryIdentity: evidence, ...details });
}

function verifyDevelopmentEntryIdentity({ execute, root, nodeExecutable, successor, environment, phaseResult }) {
  const projectBridge = path.join(root, PRODUCT_ROOT, 'buildr');
  const expectedLauncher = path.join(root, SERVICE_ROOT, 'tools', 'development', 'run-development-cli');
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

function contentDigest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function readSyncResumeInput(filename, expected) {
  let input;
  try { input = JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { throw closeoutError('self-bootstrap-closeout.resume-input-invalid', '同步恢复输入不是可读取的 JSON。', { error: error.message }); }
  if (input?.schemaVersion !== SELF_BOOTSTRAP_SYNC_RESUME_SCHEMA || !sameFilesystemPath(input.workspaceRoot, expected.workspaceRoot)
    || !/^[a-f0-9]{40,64}$/.test(input.expectedHead || '') || !Array.isArray(input.files) || !input.files.length || !Array.isArray(input.stagedPaths)) {
    throw closeoutError('self-bootstrap-closeout.resume-input-invalid', '同步恢复输入缺少明确的工作空间、HEAD 或文件快照。');
  }
  for (const key of ['baseRef', 'deliveredRef', 'targetBranch', 'remote', 'agent']) {
    if (input[key] !== expected[key]) throw closeoutError('self-bootstrap-closeout.resume-input-mismatch', `同步恢复输入的 ${key} 与本次激活不一致。`);
  }
  const paths = [];
  for (const file of input.files) {
    const pathname = file?.path;
    if (typeof pathname !== 'string' || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git')
      || !matches(pathname, ['AGENTS.md', '.buildr/builtin-receipts.json', 'rules/manifest.yml', 'skills/manifest.yml', 'commands/manifest.yml', 'components/manifest.yml'],
        ['rules/buildr/', 'skills/buildr/', 'skills/openspec/', 'commands/buildr/', 'components/buildr/'])
      || !/^sha256-[a-f0-9]{64}$/.test(file.sha256 || '')) {
      throw closeoutError('self-bootstrap-closeout.resume-input-invalid', '同步恢复文件必须是同步源资产区内的普通文件及精确 SHA-256 摘要。', { path: pathname || null });
    }
    paths.push(pathname);
  }
  if (new Set(paths).size !== paths.length || new Set(input.stagedPaths).size !== input.stagedPaths.length || input.stagedPaths.some((pathname) => !paths.includes(pathname))) {
    throw closeoutError('self-bootstrap-closeout.resume-input-invalid', '同步恢复文件或暂存集合重复或超出声明范围。');
  }
  return { ...input, files: [...input.files].sort((a, b) => a.path.localeCompare(b.path)), paths: paths.sort(), stagedPaths: [...input.stagedPaths].sort(), inputIdentity: contentDigest(fs.readFileSync(filename)) };
}

function verifySyncResumeSnapshot({ resume, root, execute, phaseResult, expectedStaged, id }) {
  const dirty = changedPaths(execute, root, phaseResult, `${id}-dirty`);
  const staged = zeroList(gitText(execute, root, ['diff', '--cached', '--name-only', '-z'], `${id}-staged`, phaseResult, 'self-bootstrap-closeout.git-diff-failed'));
  const unstaged = zeroList(gitText(execute, root, ['diff', '--name-only', '-z'], `${id}-unstaged`, phaseResult, 'self-bootstrap-closeout.git-diff-failed'));
  if (JSON.stringify(dirty) !== JSON.stringify(resume.paths) || JSON.stringify(staged) !== JSON.stringify(expectedStaged) || staged.some((pathname) => unstaged.includes(pathname))) {
    throw closeoutError('self-bootstrap-closeout.resume-scope-drift', '同步恢复的未提交或暂存集合已变化，未创建提交。', { expected: resume.paths, dirty, expectedStaged, staged });
  }
  for (const file of resume.files) {
    let target = root;
    try {
      for (const part of file.path.split('/')) {
        target = path.join(target, part);
        if (fs.lstatSync(target).isSymbolicLink()) throw new Error('symbolic link');
      }
      if (!fs.lstatSync(target).isFile() || contentDigest(fs.readFileSync(target)) !== file.sha256) throw new Error('content or file type changed');
    } catch (error) {
      throw closeoutError('self-bootstrap-closeout.resume-content-drift', '同步恢复文件的类型或内容已变化，未创建提交。', { path: file.path, error: error.message });
    }
  }
}

function verifySyncResumeIndex({ resume, root, execute, phaseResult }) {
  for (const file of resume.files) {
    const observed = execute('git', ['show', `:${file.path}`], { cwd: root, binary: true });
    const sha256 = observed.status === 0 ? contentDigest(observed.stdout) : null;
    phaseResult.operations.push(operation('verify-resumed-index-blob', { ...observed, stdout: '' }, { kind: 'git', path: file.path, sha256 }));
    if (sha256 !== file.sha256) throw closeoutError('self-bootstrap-closeout.resume-content-drift', '同步恢复的暂存内容与已核验快照不一致，未创建提交。', { path: file.path, expected: file.sha256, actual: sha256 });
  }
}

function markPassed(stage, inputIdentity, outputIdentity, effects = []) {
  stage.status = 'passed';
  stage.inputIdentity = inputIdentity || null;
  stage.outputIdentity = outputIdentity || null;
  stage.effects.push(...effects);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw closeoutError('self-bootstrap-closeout.option-value-missing', `Missing value for ${name}`);
  return value;
}

/**
 * @param {{workspaceRoot: string, taskId?: string|null, baseRef: string, deliveredRef: string,
 * targetBranch: string, remote: string, agent: string, nodeExecutable: string,
 * resumeSync?: string|null, restartDevelopmentWeb?: boolean, execute?: typeof defaultExecute, environment?: NodeJS.ProcessEnv}} options
 */
export function runDirectSelfBootstrapCloseout({ workspaceRoot, taskId = null, baseRef, deliveredRef, targetBranch, remote, agent, nodeExecutable, resumeSync = null, restartDevelopmentWeb = false, execute = defaultExecute, environment = process.env }) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const phases = [];
  let active = null;
  let lock = null;
  let ownsLock = false;
  let delivered = false;
  let successor = null;
  let developmentWebRecovery = null;
  const activationIdentity = digest({ baseRef, deliveredRef, targetBranch, remote, agent });
  /** @param {string} status @param {{code: string, message: string, details: object|null}|null} diagnostic */
  const result = (status, diagnostic = null) => ({ schemaVersion: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA, status, taskId, runId: null, delivery: { observed: delivered, ref: deliveredRef, remote, targetBranch }, phases, successor, diagnostic });
  const start = (id) => { active = phase(id); phases.push(active); return active; };
  const read = (args, id) => gitText(execute, root, args, id, active, 'self-bootstrap-closeout.git-observation-failed');
  const assertHead = (expected) => {
    if (read(['symbolic-ref', '--quiet', '--short', 'HEAD'], 'current-branch') !== targetBranch || read(['rev-parse', 'HEAD'], 'current-head') !== expected) throw closeoutError('self-bootstrap-closeout.target-drift', '保留分支或提交已变化，停止当前激活动作。');
  };
  try {
    start('preflight');
    if (!fs.existsSync(path.join(root, 'components/workspace/buildr-self-bootstrap/component.yml'))) return result('not-applicable');
    if ((taskId !== null && !/^[a-z0-9][a-z0-9._-]*$/.test(taskId)) || !/^[a-f0-9]{40,64}$/.test(baseRef || '') || !/^[a-f0-9]{40,64}$/.test(deliveredRef || '') || !targetBranch || !remote || !agent) throw closeoutError('self-bootstrap-closeout.direct-input-invalid', '需要明确的基线和交付提交、分支、远端及宿主；任务编号可选。');
    if (remote.startsWith('-') || targetBranch.startsWith('-')) throw closeoutError('self-bootstrap-closeout.direct-input-invalid', '分支和远端不能是命令选项。');
    const resume = resumeSync === null ? null : readSyncResumeInput(resumeSync, { workspaceRoot: root, baseRef, deliveredRef, targetBranch, remote, agent });
    requirePassed(git(execute, root, ['check-ref-format', `refs/heads/${targetBranch}`], 'target-ref', active), 'self-bootstrap-closeout.target-invalid', '目标分支无效。');
    if (!sameFilesystemPath(read(['rev-parse', '--show-toplevel'], 'workspace-root'), root)) throw closeoutError('self-bootstrap-closeout.workspace-mismatch', '目标必须是工作空间的真实 Git 根。');
    const scopedPaths = zeroList(read(['diff', '--name-only', '-z', baseRef, deliveredRef, '--'], 'activation-paths'));
    const actions = classifications(scopedPaths, root);
    if (resume && !actions['sync-retained-workspace'].length) throw closeoutError('self-bootstrap-closeout.resume-input-mismatch', '本次交付范围不包含可恢复的同步动作。');
    if (!restartDevelopmentWeb && !Object.values(actions).some((paths) => paths.length) && !fs.existsSync(developmentWebRecoveryFile(root))) return result('not-applicable');
    // A short-lived lock belongs to this runner; it is not delivery evidence.
    const common = read(['rev-parse', '--path-format=absolute', '--git-common-dir'], 'git-common-directory');
    const lockParent = path.join(common, 'buildr');
    fs.mkdirSync(lockParent, { recursive: true });
    lock = path.join(lockParent, 'self-bootstrap-direct.lock');
    try { fs.mkdirSync(lock); ownsLock = true; fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, taskId, deliveredRef })); }
    catch { throw closeoutError('self-bootstrap-closeout.activation-busy', '已有自举激活占用；保留现场并核对锁的进程，不自动夺锁。', { lock }); }
    developmentWebRecovery = readDevelopmentWebRecovery(root, nodeExecutable);
    if (developmentWebRecovery) recoveryEnvironment(developmentWebRecovery, environment);
    if (!resume && changedPaths(execute, root, active, 'before-activation').length) throw closeoutError('self-bootstrap-closeout.workspace-dirty', '保留工作空间有未提交内容，不能把它们混入激活。');
    const head = read(['rev-parse', 'HEAD'], 'head');
    assertHead(head);
    if (resume) {
      if (head !== resume.expectedHead) throw closeoutError('self-bootstrap-closeout.target-drift', '当前 HEAD 与同步恢复输入不一致，未创建提交。');
      verifySyncResumeSnapshot({ resume, root, execute, phaseResult: active, expectedStaged: resume.stagedPaths, id: 'resume-preflight' });
    }
    requirePassed(git(execute, root, ['merge-base', '--is-ancestor', baseRef, deliveredRef], 'base-ancestry', active), 'self-bootstrap-closeout.base-mismatch', '基线不是交付提交的祖先。');
    requirePassed(git(execute, root, ['merge-base', '--is-ancestor', deliveredRef, head], 'delivery-ancestry', active), 'self-bootstrap-closeout.delivery-mismatch', '当前工作空间不包含交付提交。');
    const beforeRemote = remoteRef(execute, root, remote, targetBranch, active);
    requirePassed(git(execute, root, ['merge-base', '--is-ancestor', deliveredRef, beforeRemote], 'remote-containment', active), 'self-bootstrap-closeout.delivery-unconfirmed', '当前远端未证明包含交付提交。');
    delivered = true;
    if (resume && head !== beforeRemote) throw closeoutError('self-bootstrap-closeout.remote-drift', '同步恢复要求当前 HEAD 与已观察远端一致，未创建提交。');
    let pendingSuccessor = false;
    if (head !== beforeRemote) {
      const parents = read(['rev-list', '--parents', '-n', '1', 'HEAD'], 'successor-parents').split(/\s+/);
      const message = read(['log', '-1', '--format=%B'], 'successor-message');
      const trailers = message.split(/\r?\n/);
      const matchesIdentity = trailers.includes(`Buildr-Activation-Identity: ${activationIdentity}`);
      const matchesLegacyTask = taskId !== null && !trailers.some((line) => line.startsWith('Buildr-Activation-Identity:')) && trailers.includes(`Buildr-Activation-Task: ${taskId}`);
      pendingSuccessor = parents.length === 2 && parents[1] === beforeRemote && (matchesIdentity || matchesLegacyTask) && trailers.includes(`Buildr-Activation-Delivery: ${deliveredRef}`);
      if (!pendingSuccessor) throw closeoutError('self-bootstrap-closeout.remote-drift', '保留分支与远端不同，且不是本次激活尚未推送的后继提交。');
    }
    // The first Product CLI import already consumes the private Agent package.
    // Prepare it before sync, not only during the later application install:
    // newly delivered HTTP declarations may require a newly added Agent schema.
    const preparation = path.join(root, SERVICE_ROOT, 'tools/development/prepare-development-agent.ts');
    requirePassed(command(execute, nodeExecutable, [preparation], root, 'prepare-agent-package', active,
      { kind: 'product-preparation', script: preparation }), 'self-bootstrap-closeout.agent-preparation-failed',
    '产品命令入口的智能体服务包准备失败；尚未同步或停止开发应用。');
    assertHead(head);
    markPassed(active, deliveredRef, head, resume ? [{ type: 'workspace-sync-resume', inputIdentity: resume.inputIdentity, paths: resume.paths, expectedHead: resume.expectedHead }] : []);
    successor = head;
    let ownedPaths = resume?.paths || [];
    if (actions['sync-retained-workspace'].length && !pendingSuccessor && !resume) {
      start('sync'); assertHead(successor);
      requirePassed(productCommand(execute, root, nodeExecutable, ['sync', agent, '--publish-resources', '--target', root, '--json'], 'workspace-sync', active), 'self-bootstrap-closeout.sync-failed', '工作空间同步失败；保留已发生变更。');
      assertHead(successor);
      ownedPaths = changedPaths(execute, root, active, 'after-sync');
      markPassed(active, deliveredRef, successor, [{ type: 'workspace-sync', paths: ownedPaths }]);
    }
    if (ownedPaths.length) {
        start('commit'); assertHead(successor);
        if (resume) verifySyncResumeSnapshot({ resume, root, execute, phaseResult: active, expectedStaged: resume.stagedPaths, id: 'resume-before-stage' });
        requirePassed(git(execute, root, ['add', '--', ...ownedPaths], 'stage-sync', active), 'self-bootstrap-closeout.stage-failed', '精确暂存同步结果失败。');
        const staged = zeroList(read(['diff', '--cached', '--name-only', '-z'], 'staged-paths')).sort();
        if (JSON.stringify(staged) !== JSON.stringify(ownedPaths)) throw closeoutError('self-bootstrap-closeout.scope-drift', '暂存集合发生变化，未创建提交。');
        if (resume) {
          verifySyncResumeSnapshot({ resume, root, execute, phaseResult: active, expectedStaged: resume.paths, id: 'resume-after-stage' });
          verifySyncResumeIndex({ resume, root, execute, phaseResult: active });
          assertHead(successor);
        }
        const message = `收敛 Buildr 自举工作空间\n\nBuildr-Activation-Identity: ${activationIdentity}\nBuildr-Activation-Delivery: ${deliveredRef}${taskId === null ? '' : `\nBuildr-Activation-Task: ${taskId}\nBuildr-Task: ${taskId}`}`;
        requirePassed(git(execute, root, ['commit', '-m', message], 'sync-commit', active), 'self-bootstrap-closeout.commit-failed', '同步结果提交失败。');
        const next = read(['rev-parse', 'HEAD'], 'successor');
        if (read(['rev-parse', 'HEAD^'], 'parent') !== successor) throw closeoutError('self-bootstrap-closeout.target-drift', '同步提交的父提交不匹配。');
        markPassed(active, successor, next, [{ type: 'git-commit', paths: ownedPaths, ref: next }]); successor = next;
    }
    if (successor !== beforeRemote) {
      start('push'); assertHead(successor);
      const currentRemote = remoteRef(execute, root, remote, targetBranch, active);
      if (currentRemote !== successor && currentRemote !== beforeRemote) throw closeoutError('self-bootstrap-closeout.remote-drift', '远端已变化，保留本地激活提交。');
      if (currentRemote !== successor) requirePassed(git(execute, root, ['push', remote, `HEAD:refs/heads/${targetBranch}`], 'sync-push', active), 'self-bootstrap-closeout.push-failed', '同步提交推送失败；使用同一基线、交付提交、目标和宿主重试可继续。');
      const after = remoteRef(execute, root, remote, targetBranch, active, 'remote-after-push');
      if (after !== successor) throw closeoutError('self-bootstrap-closeout.remote-readback-mismatch', '推送后远端提交不匹配。');
      markPassed(active, beforeRemote, after);
    }
    if (actions['install-development-buildr-web'].length || developmentWebRecovery || restartDevelopmentWeb) {
      start('install-buildr-web'); assertHead(successor);
      const continuity = inspectDevelopmentWebContinuity(execute, root, nodeExecutable, environment, active);
      if (restartDevelopmentWeb && continuity.status !== 'healthy-development') throw closeoutError('self-bootstrap-closeout.restart-instance-unavailable', '显式重启要求存在可核验的健康开发实例，未停止或替换其他实例。');
      if (continuity.status === 'different-owner' && developmentWebRecovery) throw closeoutError('self-bootstrap-closeout.development-web-recovery-owner-mismatch', '待恢复的开发应用数据目录已有其他实例，未执行替换。');
      if (continuity.status === 'healthy-development') developmentWebRecovery = rememberDevelopmentWebRecovery(root, nodeExecutable, continuity, environment);
      const installed = command(execute, nodeExecutable, [path.join(root, SERVICE_ROOT, 'tools/build/launcher/manage.ts'), 'install', '--channel', 'development', '--no-stop-instance'], root, 'install-development-buildr-web', active);
      requirePassed(installed, 'self-bootstrap-closeout.local-app-install-failed', '开发应用更新失败。');
      const launcher = validateDevelopmentLauncherResult(parseJson(installed, 'self-bootstrap-closeout.local-app-result-invalid', '安装结果无效。'), root, nodeExecutable, successor);
      assertHead(successor);
      const continuityAfter = recoverDevelopmentWebContinuity({ execute, root, nodeExecutable, successor, launcher, continuity: developmentWebRecovery?.continuity || continuity, environment, phaseResult: active, forceRestart: restartDevelopmentWeb });
      if (developmentWebRecovery) {
        clearDevelopmentWebRecovery(root, developmentWebRecovery);
        developmentWebRecovery = null;
      }
      markPassed(active, deliveredRef, successor, [{ type: 'development-web-continuity', status: continuityAfter.status }]);
    }
    start('verify-development-entry'); assertHead(successor);
    const identity = verifyDevelopmentEntryIdentity({ execute, root, nodeExecutable, successor, environment, phaseResult: active });
    markPassed(active, successor, digest(identity));
    start('finalize'); assertHead(successor);
    const doctor = developmentEntryCommand(execute, identity, environment, root, ['doctor', '--agent', agent, '--target', root, '--json'], 'final-doctor', active);
    requirePassed(doctor, 'self-bootstrap-closeout.doctor-failed', '最终诊断命令失败。');
    const health = parseJson(doctor, 'self-bootstrap-closeout.doctor-invalid', '最终诊断结果无效。');
    if (health.health?.ready !== true) throw closeoutError('self-bootstrap-closeout.doctor-not-ready', '最终工作空间诊断未就绪。', { findings: health.findings });
    markPassed(active, successor, successor);
    return result('passed');
  } catch (error) {
    if (active) active.status = 'blocked';
    let recoveryResult = null;
    if (developmentWebRecovery && delivered && ownsLock) {
      try {
        recoveryResult = restoreDevelopmentWebAfterFailure({ execute, root, nodeExecutable, recovery: developmentWebRecovery, environment, phaseResult: active });
        try { clearDevelopmentWebRecovery(root, developmentWebRecovery); }
        catch (cleanupError) {
          recoveryResult = { ...recoveryResult, pending: developmentWebRecoveryFile(root),
            cleanup: { status: 'failed', code: cleanupError.code, message: cleanupError.message } };
        }
      } catch (recoveryError) {
        recoveryResult = { status: 'failed', code: recoveryError.code || 'self-bootstrap-closeout.development-web-recovery-failed', message: recoveryError.message, details: recoveryError.details || null, pending: developmentWebRecoveryFile(root) };
      }
      active.effects.push({ type: 'development-web-recovery', ...recoveryResult });
    }
    const recoveryMessage = !recoveryResult ? '' : recoveryResult.status === 'passed'
      ? ' 开发应用已确认运行。' : ' 开发应用尚未恢复，已保留待恢复信息；重试会继续恢复。';
    return result('blocked', { code: error.code || 'self-bootstrap-closeout.direct-failed', message: `${error.message}${recoveryMessage}`,
      details: recoveryResult ? { ...(error.details || {}), developmentWebRecovery: recoveryResult } : error.details || null });
  } finally {
    if (ownsLock) { fs.unlinkSync(path.join(lock, 'owner.json')); fs.rmdirSync(lock); }
  }
}

export function runSelfBootstrapCloseoutCommand({ args = process.argv.slice(2), actualNodeExecutable = process.execPath, execute = defaultExecute, environment = process.env } = {}) {
  const allowed = new Set(['--target', '--node-executable', '--detail', '--task', '--base-ref', '--delivered-ref', '--branch', '--remote', '--agent', '--resume-sync', '--restart-development-web']);
  if (args.length % 2 !== 0) throw closeoutError('self-bootstrap-closeout.arguments-invalid', '参数必须是选项和值。');
  for (let index = 0; index < args.length; index += 2) if (!allowed.has(args[index])) throw closeoutError('self-bootstrap-closeout.option-unknown', `不支持的选项：${args[index]}。`);
  const nodeExecutable = option(args, '--node-executable');
  if (!nodeExecutable || !sameFilesystemPath(actualNodeExecutable, nodeExecutable)) throw closeoutError('self-bootstrap-closeout.node-identity-mismatch', '必须使用保留环境声明的 Node。');
  const detail = option(args, '--detail') || 'compact';
  if (!['compact', 'full'].includes(detail)) throw closeoutError('self-bootstrap-closeout.detail-invalid', 'detail 只支持 compact 或 full。');
  const restart = option(args, '--restart-development-web') || 'false';
  if (!['true', 'false'].includes(restart)) throw closeoutError('self-bootstrap-closeout.restart-value-invalid', 'restart-development-web 只支持 true 或 false。');
  const workspaceRoot = option(args, '--target');
  if (!workspaceRoot) throw closeoutError('self-bootstrap-closeout.arguments-incomplete', '需要明确的工作空间。');
  return runDirectSelfBootstrapCloseout({ workspaceRoot, taskId: option(args, '--task'), baseRef: option(args, '--base-ref'), deliveredRef: option(args, '--delivered-ref'), targetBranch: option(args, '--branch'), remote: option(args, '--remote'), agent: option(args, '--agent'), nodeExecutable, resumeSync: option(args, '--resume-sync'), restartDevelopmentWeb: restart === 'true', execute, environment });
}

async function main() {
  try {
    const { runDetachedCloseout } = await import('./detached-execution.mjs');
    const result = await runDetachedCloseout({
      args: process.argv.slice(2),
      onHandoff(evidence) { console.error(JSON.stringify(evidence)); },
    });
    const detail = option(process.argv.slice(2), '--detail') || 'compact';
    console.log(JSON.stringify(detail === 'full' ? result : compactSelfBootstrapCloseout(result), null, 2));
    if (result.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    const result = {
      schemaVersion: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA,
      status: 'blocked',
      diagnostic: { code: error.code || 'self-bootstrap-closeout.driver-failed', message: error.message, details: error.details || null },
    };
    let full = false;
    try { full = option(process.argv.slice(2), '--detail') === 'full'; } catch {}
    console.error(JSON.stringify(full ? result : compactSelfBootstrapCloseout(result), null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) await main();
