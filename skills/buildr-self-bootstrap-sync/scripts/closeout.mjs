#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA = 'buildr.self-bootstrap-closeout-result/v1';
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

function classifications(changedPaths) {
  const sync = [];
  const cli = [];
  const buildrWeb = [];
  for (const pathname of changedPaths) {
    if (matches(pathname, [`${SERVICE_ROOT}/resources/manifest.yml`], [
      `${SERVICE_ROOT}/resources/workspace/`,
      `${SERVICE_ROOT}/package/targets/runtime/skills/buildr/`,
    ])) sync.push(pathname);
    if (matches(pathname, [
      `${PRODUCT_ROOT}/buildr`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/scripts/install-buildr-cli`,
      `${SERVICE_ROOT}/tools/development/run-development-cli`,
      `${SERVICE_ROOT}/scripts/uninstall-buildr-cli`,
    ], [`${SERVICE_ROOT}/bin/`, `${SERVICE_ROOT}/src/`])) cli.push(pathname);
    if (matches(pathname, [
      `${SERVICE_ROOT}/src/interfaces/cli/launcher.mjs`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/LICENSE`,
    ], [`${SERVICE_ROOT}/src/web/`, `${SERVICE_ROOT}/web-dist/`, `${PRODUCT_ROOT}/services/buildr-web/`, `${SERVICE_ROOT}/package/launchers/`])) buildrWeb.push(pathname);
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
    '--port', String(DEFAULT_DEVELOPMENT_WEB_PORT),
    '--previous-port', String(previous.port),
    '--launcher-identity', developmentLauncherIdentityPath(launcher),
    '--expected-source-root', expectedSourceRoot,
    '--expected-head', successor,
    '--node-executable', nodeExecutable,
    '--previous-pid', String(previous.pid),
  ];
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
    || payload.instance.pid === previous.pid
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

export function runDirectSelfBootstrapCloseout({ workspaceRoot, taskId, baseRef, deliveredRef, targetBranch, remote, agent, nodeExecutable, execute = defaultExecute, environment = process.env }) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const phases = [];
  let active = null;
  let lock = null;
  let ownsLock = false;
  let delivered = false;
  let successor = null;
  const result = (status, diagnostic = null) => ({ schemaVersion: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA, status, taskId, runId: null, delivery: { observed: delivered, ref: deliveredRef, remote, targetBranch }, phases, successor, diagnostic });
  const start = (id) => { active = phase(id); phases.push(active); return active; };
  const read = (args, id) => gitText(execute, root, args, id, active, 'self-bootstrap-closeout.git-observation-failed');
  const assertHead = (expected) => {
    if (read(['symbolic-ref', '--quiet', '--short', 'HEAD'], 'current-branch') !== targetBranch || read(['rev-parse', 'HEAD'], 'current-head') !== expected) throw closeoutError('self-bootstrap-closeout.target-drift', '保留分支或提交已变化，停止当前激活动作。');
  };
  try {
    start('preflight');
    if (!fs.existsSync(path.join(root, 'components/workspace/buildr-self-bootstrap/component.yml'))) return result('not-applicable');
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(taskId || '') || !/^[a-f0-9]{40,64}$/.test(baseRef || '') || !/^[a-f0-9]{40,64}$/.test(deliveredRef || '') || !targetBranch || !remote || !agent) throw closeoutError('self-bootstrap-closeout.direct-input-invalid', '需要明确的任务、基线和交付提交、分支、远端及宿主。');
    if (remote.startsWith('-') || targetBranch.startsWith('-')) throw closeoutError('self-bootstrap-closeout.direct-input-invalid', '分支和远端不能是命令选项。');
    requirePassed(git(execute, root, ['check-ref-format', `refs/heads/${targetBranch}`], 'target-ref', active), 'self-bootstrap-closeout.target-invalid', '目标分支无效。');
    if (!sameFilesystemPath(read(['rev-parse', '--show-toplevel'], 'workspace-root'), root)) throw closeoutError('self-bootstrap-closeout.workspace-mismatch', '目标必须是工作空间的真实 Git 根。');
    const task = parseJson(productCommand(execute, root, nodeExecutable, ['task', 'inspect', taskId, '--target', root, '--json'], 'task-inspect', active), 'self-bootstrap-closeout.task-invalid', '无法读取任务。');
    if (task.record?.taskId !== taskId || task.record.status !== 'completed' || !task.record.scope?.projects?.includes('product')) throw closeoutError('self-bootstrap-closeout.task-not-completed', '自举只接受该工作空间中已经完成的产品任务；实际交付由明确提交和远端Git事实证明。');
    const scopedPaths = zeroList(read(['diff', '--name-only', '-z', baseRef, deliveredRef, '--'], 'activation-paths'));
    const actions = classifications(scopedPaths);
    if (!Object.values(actions).some((paths) => paths.length)) return result('not-applicable');
    // A short-lived lock belongs to this runner; it is not delivery evidence.
    const common = read(['rev-parse', '--path-format=absolute', '--git-common-dir'], 'git-common-directory');
    const lockParent = path.join(common, 'buildr');
    fs.mkdirSync(lockParent, { recursive: true });
    lock = path.join(lockParent, 'self-bootstrap-direct.lock');
    try { fs.mkdirSync(lock); ownsLock = true; fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, taskId, deliveredRef })); }
    catch { throw closeoutError('self-bootstrap-closeout.activation-busy', '已有自举激活占用；保留现场并核对锁的进程，不自动夺锁。', { lock }); }
    if (changedPaths(execute, root, active, 'before-activation').length) throw closeoutError('self-bootstrap-closeout.workspace-dirty', '保留工作空间有未提交内容，不能把它们混入激活。');
    const head = read(['rev-parse', 'HEAD'], 'head');
    assertHead(head);
    requirePassed(git(execute, root, ['merge-base', '--is-ancestor', baseRef, deliveredRef], 'base-ancestry', active), 'self-bootstrap-closeout.base-mismatch', '基线不是交付提交的祖先。');
    requirePassed(git(execute, root, ['merge-base', '--is-ancestor', deliveredRef, head], 'delivery-ancestry', active), 'self-bootstrap-closeout.delivery-mismatch', '当前工作空间不包含交付提交。');
    const beforeRemote = remoteRef(execute, root, remote, targetBranch, active);
    requirePassed(git(execute, root, ['merge-base', '--is-ancestor', deliveredRef, beforeRemote], 'remote-containment', active), 'self-bootstrap-closeout.delivery-unconfirmed', '当前远端未证明包含交付提交。');
    delivered = true;
    let pendingSuccessor = false;
    if (head !== beforeRemote) {
      const parents = read(['rev-list', '--parents', '-n', '1', 'HEAD'], 'successor-parents').split(/\s+/);
      const message = read(['log', '-1', '--format=%B'], 'successor-message');
      pendingSuccessor = parents.length === 2 && parents[1] === beforeRemote && message.includes(`Buildr-Activation-Task: ${taskId}`) && message.includes(`Buildr-Activation-Delivery: ${deliveredRef}`);
      if (!pendingSuccessor) throw closeoutError('self-bootstrap-closeout.remote-drift', '保留分支与远端不同，且不是本次激活尚未推送的后继提交。');
    }
    markPassed(active, deliveredRef, head);
    successor = head;
    if (actions['sync-retained-workspace'].length && !pendingSuccessor) {
      start('sync'); assertHead(successor);
      requirePassed(productCommand(execute, root, nodeExecutable, ['sync', agent, '--target', root, '--json'], 'workspace-sync', active), 'self-bootstrap-closeout.sync-failed', '工作空间同步失败；保留已发生变更。');
      assertHead(successor);
      const ownedPaths = changedPaths(execute, root, active, 'after-sync');
      markPassed(active, deliveredRef, successor, [{ type: 'workspace-sync', paths: ownedPaths }]);
      if (ownedPaths.length) {
        start('commit'); assertHead(successor);
        requirePassed(git(execute, root, ['add', '--', ...ownedPaths], 'stage-sync', active), 'self-bootstrap-closeout.stage-failed', '精确暂存同步结果失败。');
        const staged = zeroList(read(['diff', '--cached', '--name-only', '-z'], 'staged-paths')).sort();
        if (JSON.stringify(staged) !== JSON.stringify(ownedPaths)) throw closeoutError('self-bootstrap-closeout.scope-drift', '暂存集合发生变化，未创建提交。');
        const message = `收敛 Buildr 自举工作空间\n\nBuildr-Activation-Task: ${taskId}\nBuildr-Activation-Delivery: ${deliveredRef}`;
        requirePassed(git(execute, root, ['commit', '-m', message], 'sync-commit', active), 'self-bootstrap-closeout.commit-failed', '同步结果提交失败。');
        const next = read(['rev-parse', 'HEAD'], 'successor');
        if (read(['rev-parse', 'HEAD^'], 'parent') !== successor) throw closeoutError('self-bootstrap-closeout.target-drift', '同步提交的父提交不匹配。');
        markPassed(active, successor, next, [{ type: 'git-commit', paths: ownedPaths, ref: next }]); successor = next;
      }
    }
    if (successor !== beforeRemote) {
      start('push'); assertHead(successor);
      const currentRemote = remoteRef(execute, root, remote, targetBranch, active);
      if (currentRemote !== successor && currentRemote !== beforeRemote) throw closeoutError('self-bootstrap-closeout.remote-drift', '远端已变化，保留本地激活提交。');
      if (currentRemote !== successor) requirePassed(git(execute, root, ['push', remote, `HEAD:refs/heads/${targetBranch}`], 'sync-push', active), 'self-bootstrap-closeout.push-failed', '同步提交推送失败；重试同一任务和交付提交可继续。');
      const after = remoteRef(execute, root, remote, targetBranch, active, 'remote-after-push');
      if (after !== successor) throw closeoutError('self-bootstrap-closeout.remote-readback-mismatch', '推送后远端提交不匹配。');
      markPassed(active, beforeRemote, after);
    }
    if (actions['install-development-buildr-web'].length) {
      start('install-buildr-web'); assertHead(successor);
      const continuity = inspectDevelopmentWebContinuity(execute, root, nodeExecutable, environment, active);
      const installed = command(execute, nodeExecutable, [path.join(root, SERVICE_ROOT, 'package/launchers/manage.mjs'), 'install', '--channel', 'development'], root, 'install-development-buildr-web', active);
      requirePassed(installed, 'self-bootstrap-closeout.local-app-install-failed', '开发应用更新失败。');
      const launcher = validateDevelopmentLauncherResult(parseJson(installed, 'self-bootstrap-closeout.local-app-result-invalid', '安装结果无效。'), root, nodeExecutable, successor);
      const continuityAfter = recoverDevelopmentWebContinuity({ execute, root, nodeExecutable, successor, launcher, continuity, environment, phaseResult: active });
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
    return result('blocked', { code: error.code || 'self-bootstrap-closeout.direct-failed', message: error.message, details: error.details || null });
  } finally {
    if (ownsLock) { fs.unlinkSync(path.join(lock, 'owner.json')); fs.rmdirSync(lock); }
  }
}

export function runSelfBootstrapCloseoutCommand({ args = process.argv.slice(2), actualNodeExecutable = process.execPath, execute = defaultExecute, environment = process.env } = {}) {
  const allowed = new Set(['--target', '--node-executable', '--detail', '--task', '--base-ref', '--delivered-ref', '--branch', '--remote', '--agent']);
  if (args.length % 2 !== 0) throw closeoutError('self-bootstrap-closeout.arguments-invalid', '参数必须是选项和值。');
  for (let index = 0; index < args.length; index += 2) if (!allowed.has(args[index])) throw closeoutError('self-bootstrap-closeout.option-unknown', `不支持的选项：${args[index]}。`);
  const nodeExecutable = option(args, '--node-executable');
  if (!nodeExecutable || !sameFilesystemPath(actualNodeExecutable, nodeExecutable)) throw closeoutError('self-bootstrap-closeout.node-identity-mismatch', '必须使用保留环境声明的 Node。');
  const detail = option(args, '--detail') || 'compact';
  if (!['compact', 'full'].includes(detail)) throw closeoutError('self-bootstrap-closeout.detail-invalid', 'detail 只支持 compact 或 full。');
  const workspaceRoot = option(args, '--target');
  if (!workspaceRoot || !option(args, '--task')) throw closeoutError('self-bootstrap-closeout.arguments-incomplete', '需要明确的任务和工作空间。');
  return runDirectSelfBootstrapCloseout({ workspaceRoot, taskId: option(args, '--task'), baseRef: option(args, '--base-ref'), deliveredRef: option(args, '--delivered-ref'), targetBranch: option(args, '--branch'), remote: option(args, '--remote'), agent: option(args, '--agent'), nodeExecutable, execute, environment });
}

function main() {
  try {
    const result = runSelfBootstrapCloseoutCommand();
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

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
