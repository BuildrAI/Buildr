#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../../projects/product/services/buildr/src/infrastructure/filesystem/filesystem-path-identity.mjs';

export const SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA = 'buildr.self-bootstrap-closeout-result/v1';
export const SELF_BOOTSTRAP_CLOSEOUT_PHASES = Object.freeze([
  'preflight',
  'plan',
  'sync',
  'commit',
  'push',
  'install-cli',
  'install-local-app',
  'finalize',
]);

const PRODUCT_ROOT = 'projects/product';
const SERVICE_ROOT = `${PRODUCT_ROOT}/services/buildr`;
const COMPONENT_PATH = 'components/workspace/buildr-self-bootstrap/component.yml';
const FINISH_RUN_TRAILER = 'Buildr-Finish-Run';
const PLAN_TRAILER = 'Buildr-Closeout-Plan';

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
    if (matches(pathname, [`${SERVICE_ROOT}/package/manifest.yml`], [`${SERVICE_ROOT}/package/targets/workspace/`])) sync.push(pathname);
    if (matches(pathname, [
      `${PRODUCT_ROOT}/buildr`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/scripts/install-buildr-cli`,
      `${SERVICE_ROOT}/scripts/uninstall-buildr-cli`,
    ], [`${SERVICE_ROOT}/bin/`, `${SERVICE_ROOT}/src/`])) cli.push(pathname);
    if (matches(pathname, [
      `${SERVICE_ROOT}/src/interfaces/cli/launcher.mjs`,
      `${SERVICE_ROOT}/package.json`,
      `${SERVICE_ROOT}/package-lock.json`,
      `${SERVICE_ROOT}/LICENSE`,
    ], [`${SERVICE_ROOT}/src/interfaces/local-app/`, `${SERVICE_ROOT}/package/launchers/`])) localApp.push(pathname);
  }
  if (localApp.length && !cli.length) cli.push(...localApp);
  return {
    'sync-retained-workspace': [...new Set(sync)].sort(),
    'install-development-cli': [...new Set(cli)].sort(),
    'install-development-local-app': [...new Set(localApp)].sort(),
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

export function createSelfBootstrapCloseoutPlan(finishResult) {
  const mode = finishMode(finishResult);
  if (!mode) throw closeoutError('self-bootstrap-closeout.finish-result-ineligible', 'Finish Result不是complete或唯一retained Doctor blocked模式。');
  const changedPaths = [...new Set((finishResult.carrier?.changedPaths || []).map(portable))].filter(Boolean).sort();
  if (changedPaths.length !== (finishResult.carrier?.changedPaths || []).length) throw closeoutError('self-bootstrap-closeout.frozen-path-invalid', 'Finish Result包含不安全或重复的frozen path。');
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
  const result = spawnSync(executable, args, { cwd: options.cwd, encoding: 'utf8', env: process.env });
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

function command(execute, executable, args, cwd, id, phaseResult, extra = {}) {
  const result = execute(executable, args, { cwd });
  phaseResult.operations.push(operation(id, result, extra));
  return result;
}

function productCommand(execute, root, nodeExecutable, args, id, phaseResult) {
  const script = path.join(root, SERVICE_ROOT, 'bin', 'buildr.mjs');
  return command(execute, nodeExecutable, [script, ...args], root, id, phaseResult, { kind: 'product', script, args });
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
  const observed = requirePassed(git(execute, workspaceRoot, ['ls-remote', '--heads', remote, branch], id, phaseResult), 'self-bootstrap-closeout.remote-readback-failed', '无法读取目标remote ref。');
  return observed.stdout.trim().split(/\s+/)[0] || null;
}

function changedPaths(execute, workspaceRoot, phaseResult, idPrefix) {
  const tracked = zeroList(gitText(execute, workspaceRoot, ['diff', '--name-only', '-z'], `${idPrefix}-tracked`, phaseResult, 'self-bootstrap-closeout.git-diff-failed'));
  const staged = zeroList(gitText(execute, workspaceRoot, ['diff', '--cached', '--name-only', '-z'], `${idPrefix}-staged`, phaseResult, 'self-bootstrap-closeout.git-diff-failed'));
  const untracked = zeroList(gitText(execute, workspaceRoot, ['ls-files', '--others', '--exclude-standard', '-z'], `${idPrefix}-untracked`, phaseResult, 'self-bootstrap-closeout.git-status-failed'));
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

function closeoutResult(result, plan, stages, status, diagnostic = null) {
  return {
    schemaVersion: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA,
    status,
    runId: result?.runId || null,
    taskId: result?.identity?.task || null,
    mode: plan?.mode || null,
    plan: plan || null,
    phases: SELF_BOOTSTRAP_CLOSEOUT_PHASES.map((id) => stages.get(id)),
    effects: SELF_BOOTSTRAP_CLOSEOUT_PHASES.flatMap((id) => stages.get(id).effects),
    diagnostic,
  };
}

export function runSelfBootstrapCloseout({ finishResult, workspaceRoot, nodeExecutable, execute = defaultExecute }) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const stages = new Map(SELF_BOOTSTRAP_CLOSEOUT_PHASES.map((id) => [id, phase(id)]));
  let plan = null;
  let active = stages.get('preflight');
  try {
    const componentFile = path.join(root, COMPONENT_PATH);
    if (!fs.existsSync(componentFile) || !/^id:\s*buildr-self-bootstrap\s*$/m.test(fs.readFileSync(componentFile, 'utf8'))) {
      markNotApplicable(active, 'canonical Workspace没有buildr-self-bootstrap Component。');
      for (const id of SELF_BOOTSTRAP_CLOSEOUT_PHASES.slice(1)) markNotApplicable(stages.get(id), 'Workspace不适用self-bootstrap closeout。');
      return closeoutResult(finishResult, null, stages, 'not-applicable');
    }
    if (finishResult?.schemaVersion !== 'buildr.task-finish-result/v2') throw closeoutError('self-bootstrap-closeout.finish-result-schema-invalid', 'Runner只消费buildr.task-finish-result/v2。');
    if (finishResult.resolvedContext?.capability?.id !== 'buildr.task-finish' || finishResult.resolvedContext?.capability?.version !== 1) {
      throw closeoutError('self-bootstrap-closeout.capability-binding-missing', 'Finish Result没有已解析的buildr.task-finish/v1 capability binding。');
    }
    const finishWorkspaceRoot = finishResult.identity?.workspaceRoot ? fs.realpathSync(path.resolve(finishResult.identity.workspaceRoot)) : null;
    if (!finishWorkspaceRoot || !sameFilesystemPath(finishWorkspaceRoot, root)) throw closeoutError('self-bootstrap-closeout.workspace-mismatch', 'Finish Result绑定的canonical Workspace与runner target不一致。');
    plan = createSelfBootstrapCloseoutPlan(finishResult);
    if (!plan.runId || !plan.taskId || !plan.agent || !plan.targetBranch || !plan.remote || !plan.baseRef) throw closeoutError('self-bootstrap-closeout.identity-incomplete', 'Finish Result缺少run、Task、Agent、target、remote或final ref。');
    const applicable = Object.values(plan.actions).some((paths) => paths.length);
    if (!applicable) {
      markNotApplicable(active, 'frozen Task Contribution未命中self-bootstrap动作。');
      active = stages.get('plan');
      markPassed(active, finishResult.resolvedContext.identity, plan.identity);
      for (const id of SELF_BOOTSTRAP_CLOSEOUT_PHASES.slice(2)) markNotApplicable(stages.get(id), '当前plan没有适用动作。');
      return closeoutResult(finishResult, plan, stages, 'not-applicable');
    }

    const actualRoot = gitText(execute, root, ['rev-parse', '--show-toplevel'], 'workspace-root', active, 'self-bootstrap-closeout.git-root-unavailable');
    if (!sameFilesystemPath(actualRoot, root)) throw closeoutError('self-bootstrap-closeout.git-root-mismatch', 'Runner target不是retained Git根目录。', { actualRoot });
    const branch = gitText(execute, root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'target-branch', active, 'self-bootstrap-closeout.detached-head');
    if (branch !== plan.targetBranch) throw closeoutError('self-bootstrap-closeout.target-branch-mismatch', 'Retained checkout不在Finish绑定的target branch。', { expected: plan.targetBranch, actual: branch });
    const initialChanges = changedPaths(execute, root, active, 'preflight');
    if (initialChanges.length) throw closeoutError('self-bootstrap-closeout.workspace-dirty', 'Retained Workspace在runner启动前不clean。', { changedPaths: initialChanges });
    const head = gitText(execute, root, ['rev-parse', 'HEAD^{commit}'], 'head', active, 'self-bootstrap-closeout.head-unavailable');
    const remote = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-before');
    let recovery = 'fresh';
    if (head === plan.baseRef) {
      if (remote !== plan.baseRef) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Remote已偏离Finish final ref。', { expected: plan.baseRef, actual: remote });
    } else {
      const parent = gitText(execute, root, ['rev-parse', 'HEAD^'], 'successor-parent', active, 'self-bootstrap-closeout.successor-parent-unavailable');
      const count = gitText(execute, root, ['rev-list', '--count', `${plan.baseRef}..HEAD`], 'successor-count', active, 'self-bootstrap-closeout.successor-count-unavailable');
      const message = gitText(execute, root, ['show', '-s', '--format=%B', 'HEAD'], 'successor-message', active, 'self-bootstrap-closeout.successor-message-unavailable');
      const trailers = commitTrailers(message);
      if (parent !== plan.baseRef || count !== '1' || trailers[FINISH_RUN_TRAILER] !== plan.runId || trailers[PLAN_TRAILER] !== plan.identity) {
        throw closeoutError('self-bootstrap-closeout.successor-identity-unprovable', 'HEAD不是当前run/plan绑定的单一successor。', { head, parent, count, trailers });
      }
      if (![plan.baseRef, head].includes(remote)) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Remote既不是Finish final ref，也不是当前合法successor。', { baseRef: plan.baseRef, head, remote });
      recovery = remote === head ? 'already-complete' : 'resume-after-commit';
    }
    markPassed(active, finishResult.resolvedContext.identity, head);

    active = stages.get('plan');
    markPassed(active, finishResult.resolvedContext.identity, plan.identity);

    const syncRequired = plan.actions['sync-retained-workspace'].length > 0;
    let successor = head;
    if (syncRequired) {
      active = stages.get('sync');
      const synced = productCommand(execute, root, nodeExecutable, ['sync', plan.agent, '--target', root, '--json'], 'workspace-sync', active);
      requirePassed(synced, 'self-bootstrap-closeout.sync-failed', 'Retained Workspace sync失败。');
      const ownedPaths = changedPaths(execute, root, active, 'post-sync');
      if (recovery !== 'fresh' && ownedPaths.length) throw closeoutError('self-bootstrap-closeout.successor-sync-drift', '合法successor存在，但重算sync仍产生delta。', { changedPaths: ownedPaths });
      markPassed(active, plan.identity, digest({ ownedPaths }), ownedPaths.length ? [{ type: 'workspace-sync', paths: ownedPaths }] : []);

      active = stages.get('commit');
      if (recovery === 'fresh' && ownedPaths.length) {
        const added = git(execute, root, ['add', '--', ...ownedPaths], 'stage-owned-paths', active);
        requirePassed(added, 'self-bootstrap-closeout.stage-failed', '精确stage sync delta失败。', { ownedPaths });
        const staged = zeroList(gitText(execute, root, ['diff', '--cached', '--name-only', '-z'], 'staged-readback', active, 'self-bootstrap-closeout.staged-readback-failed'));
        const remaining = changedPaths(execute, root, active, 'post-stage');
        if (JSON.stringify(staged) !== JSON.stringify(ownedPaths) || remaining.some((item) => !staged.includes(item))) {
          throw closeoutError('self-bootstrap-closeout.owned-path-mismatch', 'staged set与sync owned paths不一致。', { ownedPaths, staged, remaining });
        }
        const message = `收敛 Buildr 自举 Workspace\n\n${FINISH_RUN_TRAILER}: ${plan.runId}\n${PLAN_TRAILER}: ${plan.identity}`;
        const committed = git(execute, root, ['commit', '-m', message], 'successor-commit', active);
        requirePassed(committed, 'self-bootstrap-closeout.commit-failed', '创建独立successor commit失败。');
        successor = gitText(execute, root, ['rev-parse', 'HEAD^{commit}'], 'successor-head', active, 'self-bootstrap-closeout.successor-head-unavailable');
        const parent = gitText(execute, root, ['rev-parse', 'HEAD^'], 'successor-parent-readback', active, 'self-bootstrap-closeout.successor-parent-unavailable');
        if (parent !== plan.baseRef) throw closeoutError('self-bootstrap-closeout.successor-parent-mismatch', 'successor commit不是Finish final ref的单一后继。', { expected: plan.baseRef, actual: parent });
        markPassed(active, plan.baseRef, successor, [{ type: 'git-commit', ref: successor, paths: ownedPaths }]);
      } else {
        successor = head;
        markPassed(active, plan.baseRef, successor);
      }

      active = stages.get('push');
      const beforePush = remoteRef(execute, root, plan.remote, plan.targetBranch, active, 'remote-before-push');
      if (beforePush !== successor) {
        if (beforePush !== plan.baseRef) throw closeoutError('self-bootstrap-closeout.remote-drift', 'Push前remote不再等于Finish final ref。', { expected: plan.baseRef, actual: beforePush });
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

    active = stages.get('install-cli');
    if (plan.actions['install-development-cli'].length) {
      const installer = path.join(root, SERVICE_ROOT, 'scripts/install-buildr-cli');
      const installed = command(execute, installer, ['--node-executable', nodeExecutable], root, 'install-development-cli', active, { kind: 'installer', nodeExecutable });
      requirePassed(installed, 'self-bootstrap-closeout.cli-install-failed', 'Development CLI安装失败。');
      markPassed(active, plan.identity, successor, [{ type: 'install-development-cli', ref: successor }]);
    } else markNotApplicable(active, 'frozen paths未命中Development CLI输入。');

    active = stages.get('install-local-app');
    if (plan.actions['install-development-local-app'].length) {
      const installed = productCommand(execute, root, nodeExecutable, ['app', 'launcher', 'install', '--channel', 'development', '--json'], 'install-development-local-app', active);
      requirePassed(installed, 'self-bootstrap-closeout.local-app-install-failed', 'Development Local App安装失败。');
      const payload = parseJson(installed, 'self-bootstrap-closeout.local-app-result-invalid', 'Development Local App installer没有返回JSON。');
      markPassed(active, plan.identity, digest(payload), [{ type: 'install-development-local-app', ref: successor, channel: 'development' }]);
    } else markNotApplicable(active, 'frozen paths未命中Development Local App输入。');

    active = stages.get('finalize');
    if (plan.mode === 'complete') {
      const doctor = productCommand(execute, root, nodeExecutable, ['doctor', '--agent', plan.agent, '--target', root, '--json'], 'final-doctor', active);
      requirePassed(doctor, 'self-bootstrap-closeout.doctor-failed', '最终Doctor命令失败。');
      const payload = parseJson(doctor, 'self-bootstrap-closeout.doctor-result-invalid', '最终Doctor没有返回JSON。');
      if (payload.health?.ready !== true) throw closeoutError('self-bootstrap-closeout.doctor-not-ready', '最终Doctor未ready。', { findings: payload.findings || [] });
      markPassed(active, successor, digest(payload));
    } else {
      const resumed = productCommand(execute, root, nodeExecutable, ['task', 'finish', 'run', '--task', plan.taskId, '--run', plan.runId, '--resume', finishResult.resume.token, '--target', root, '--detail', 'full', '--json'], 'resume-finish-run', active);
      requirePassed(resumed, 'self-bootstrap-closeout.finish-resume-failed', '同一Finish run恢复命令失败。');
      const payload = parseJson(resumed, 'self-bootstrap-closeout.finish-resume-result-invalid', 'Finish resume没有返回JSON。');
      if (payload.status !== 'complete') throw closeoutError('self-bootstrap-closeout.finish-resume-incomplete', '同一Finish run恢复后仍未complete。', { status: payload.status, resume: payload.resume || null });
      markPassed(active, finishResult.resume.token, payload.resolvedContext?.identity || payload.runId);
    }
    return closeoutResult(finishResult, plan, stages, 'passed');
  } catch (error) {
    active.status = 'blocked';
    active.diagnostic = { code: error.code || 'self-bootstrap-closeout.failed', message: error.message, details: error.details || null };
    for (const id of SELF_BOOTSTRAP_CLOSEOUT_PHASES) {
      const item = stages.get(id);
      if (item.status === 'pending') markNotApplicable(item, '前序阶段已停止。');
    }
    return closeoutResult(finishResult, plan, stages, 'blocked', active.diagnostic);
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

export function runSelfBootstrapCloseoutCommand({ args = process.argv.slice(2), actualNodeExecutable = process.execPath, execute = defaultExecute } = {}) {
  const allowed = new Set(['--run', '--target', '--node-executable']);
  if (args.length % 2 !== 0) throw closeoutError('self-bootstrap-closeout.arguments-invalid', 'Runner参数必须为成对的option和值。');
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index])) throw closeoutError('self-bootstrap-closeout.option-unknown', `Unknown option: ${args[index]}`);
  }
  const runId = option(args, '--run');
  const targetRoot = option(args, '--target');
  const nodeExecutable = option(args, '--node-executable');
  if (!runId || !targetRoot || !nodeExecutable) {
    throw closeoutError('self-bootstrap-closeout.arguments-incomplete', 'Usage: node closeout.mjs --run <finish-run-id> --target <canonical-workspace> --node-executable <retained-node>');
  }
  if (!sameFilesystemPath(actualNodeExecutable, nodeExecutable)) {
    throw closeoutError('self-bootstrap-closeout.node-identity-mismatch', 'Runner必须由Environment绑定的retained Node启动。', { expected: nodeExecutable, actual: actualNodeExecutable });
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
  return runSelfBootstrapCloseout({ finishResult, workspaceRoot: root, nodeExecutable, execute });
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
