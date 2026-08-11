import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../infrastructure/process.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from './json-contracts.mjs';

function run(command, args, options = {}) {
  const result = spawnCommandSync(command, args, { encoding: 'utf8', ...options });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error?.message || null,
  };
}

function readPackage(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function registryPrefixForProductRoot(root) {
  const normalized = path.resolve(root);
  const marker = process.platform === 'win32'
    ? `${path.sep}node_modules${path.sep}`
    : `${path.sep}lib${path.sep}node_modules${path.sep}`;
  const index = normalized.lastIndexOf(marker);
  return index > 0 ? normalized.slice(0, index) : null;
}

export function compareVersions(left, right) {
  const parse = (value) => {
    const [core, prerelease = null] = String(value || '').replace(/^v/, '').split('+', 1)[0].split('-', 2);
    return {
      core: core.split('.').map((part) => Number(part)),
      prerelease: prerelease === null ? null : prerelease.split('.').flatMap((part) => part.match(/[A-Za-z]+|\d+/g) || [part]),
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index += 1) {
    const delta = (a.core[index] || 0) - (b.core[index] || 0);
    if (delta !== 0) return delta;
  }
  if (a.prerelease === null || b.prerelease === null) {
    if (a.prerelease === b.prerelease) return 0;
    return a.prerelease === null ? 1 : -1;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    if (leftNumber !== null || rightNumber !== null) return leftNumber !== null ? -1 : 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

export function identifyCliSource(productRoot) {
  const root = fs.realpathSync(path.resolve(productRoot));
  const packageFile = path.join(root, 'package.json');
  const manifest = readPackage(packageFile);
  const base = {
    productRoot: root,
    packageRoot: root,
    package: manifest?.name || null,
    version: manifest?.version || null,
  };
  if (manifest?.name !== '@buildr-ai/buildr') {
    return { ...base, mode: 'unknown', installPrefix: null, blockingReasons: ['当前 executable 的产品根没有声明 @buildr-ai/buildr package identity。'] };
  }
  const gitRoot = run('git', ['-C', root, 'rev-parse', '--show-toplevel']);
  if (gitRoot.ok) {
    const resolvedGitRoot = fs.realpathSync(path.resolve(gitRoot.stdout));
    const expectedServiceRoot = path.join(resolvedGitRoot, 'projects', 'product', 'services', 'buildr');
    const canonicalService = path.resolve(root) === path.resolve(expectedServiceRoot);
    return {
      ...base,
      mode: 'development-checkout',
      gitRoot: resolvedGitRoot,
      projectRoot: canonicalService ? path.join(resolvedGitRoot, 'projects', 'product') : null,
      service: canonicalService ? { projectCode: 'product', code: 'buildr' } : null,
      installPrefix: null,
      blockingReasons: [],
    };
  }
  const installPrefix = registryPrefixForProductRoot(root);
  if (installPrefix) {
    return { ...base, mode: 'registry-package', installPrefix, blockingReasons: [] };
  }
  return { ...base, mode: 'unknown', installPrefix: null, blockingReasons: ['无法证明当前 executable 来自 Buildr Git checkout 或支持的 npm global prefix。'] };
}

function gitValue(root, args) {
  const result = run('git', ['-C', root, ...args]);
  return result.ok ? result.stdout : null;
}

function releasedVersionForDevelopment(source, registryLookup) {
  const tag = String(source.version || '').includes('-') ? 'next' : 'latest';
  try {
    if (registryLookup) return { tag, version: registryLookup(source.package, tag), error: null };
    const result = run('npm', ['view', source.package, `dist-tags.${tag}`, '--json']);
    if (!result.ok) return { tag, version: null, error: result.stderr || result.error || 'unknown error' };
    return { tag, version: JSON.parse(result.stdout), error: null };
  } catch (error) {
    return { tag, version: null, error: error.message };
  }
}

function gitUpdatePlan(source, { fetch = true, registryLookup = null } = {}) {
  const root = source.gitRoot;
  const blockingReasons = [];
  const branch = gitValue(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = gitValue(root, ['rev-parse', 'HEAD']);
  const upstream = gitValue(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const dirty = Boolean(gitValue(root, ['status', '--porcelain=v1', '--untracked-files=normal']));
  if (!branch) blockingReasons.push('当前 checkout 处于 detached HEAD。');
  if (!upstream) blockingReasons.push('当前 branch 没有 upstream。');
  if (dirty) blockingReasons.push('当前 checkout 存在未提交改动。');
  let fetchResult = null;
  if (fetch && upstream && !dirty) {
    fetchResult = run('git', ['-C', root, 'fetch', '--quiet']);
    if (!fetchResult.ok) blockingReasons.push(`无法 fetch 远端：${fetchResult.stderr || fetchResult.error || 'unknown error'}`);
  }
  let ahead = null;
  let behind = null;
  if (upstream && (!fetchResult || fetchResult.ok)) {
    const counts = gitValue(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
    if (counts) [ahead, behind] = counts.split(/\s+/).map(Number);
  }
  let strategy = 'none';
  if (blockingReasons.length === 0 && ahead === 0 && behind > 0) strategy = 'fast-forward';
  else if (blockingReasons.length === 0 && ahead > 0 && behind > 0) {
    const remoteContainsHead = run('git', ['-C', root, 'branch', '-r', '--contains', 'HEAD']);
    if (remoteContainsHead.ok && remoteContainsHead.stdout) blockingReasons.push('当前 HEAD 已存在于远端分支，无法证明这些提交未共享。');
    else strategy = 'rebase';
  }
  const sourceStatus = blockingReasons.length ? 'blocked' : strategy === 'none' ? 'up-to-date' : 'update-available';
  const released = releasedVersionForDevelopment(source, registryLookup);
  const versionStatus = released.version === null
    ? 'unknown'
    : compareVersions(source.version, released.version) < 0
      ? 'stale'
      : compareVersions(source.version, released.version) > 0
        ? 'ahead'
        : 'current';
  const status = sourceStatus === 'blocked'
    ? 'blocked'
    : sourceStatus === 'update-available'
      ? 'update-available'
      : versionStatus === 'stale'
        ? 'version-stale'
        : 'up-to-date';
  return {
    mode: source.mode,
    current: { version: source.version, productRoot: source.productRoot, gitRoot: root, branch, head, upstream, ahead, behind, dirty },
    available: { upstream, commitsBehind: behind, releasedVersion: released.version, releaseTag: released.tag, releaseVersionError: released.error },
    status,
    sourceStatus,
    versionStatus,
    strategy,
    blockingReasons,
    nextActions: blockingReasons.length
      ? ['处理上述 Git 状态后重新运行 buildr update check --json。']
      : strategy === 'none'
        ? versionStatus === 'stale'
          ? ['当前开发 checkout 的 package version 低于已发布版本；先修复 release facts 与 dev 收敛，不自动安装 registry package。']
          : []
        : ['运行 buildr update 更新 Buildr CLI；成功后由 Agent 按用户意图决定是否执行 buildr sync <agent>。'],
  };
}

function registryUpdatePlan(source) {
  const blockingReasons = [];
  const result = run('npm', ['view', source.package, 'version', '--json']);
  let availableVersion = null;
  if (!result.ok) blockingReasons.push(`无法查询 npm registry：${result.stderr || result.error || 'unknown error'}`);
  else {
    try { availableVersion = JSON.parse(result.stdout); } catch { blockingReasons.push('npm registry 返回了无法解析的版本。'); }
  }
  const updateAvailable = availableVersion && compareVersions(availableVersion, source.version) > 0;
  return {
    mode: source.mode,
    current: { package: source.package, version: source.version, productRoot: source.productRoot, installPrefix: source.installPrefix },
    available: { version: availableVersion },
    status: blockingReasons.length ? 'blocked' : updateAvailable ? 'update-available' : 'up-to-date',
    strategy: updateAvailable ? 'npm-install' : 'none',
    blockingReasons,
    nextActions: blockingReasons.length
      ? ['检查当前 npm registry、网络和安装 prefix 后重试。']
      : updateAvailable
        ? ['运行 buildr update 更新 Buildr CLI；成功后由 Agent 按用户意图决定是否执行 buildr sync <agent>。']
        : [],
  };
}

export function buildCliUpdatePlan(productRoot, options = {}) {
  const source = identifyCliSource(productRoot);
  if (source.mode === 'development-checkout') return gitUpdatePlan(source, options);
  if (source.mode === 'registry-package') return registryUpdatePlan(source);
  return {
    mode: 'unknown',
    current: { package: source.package, version: source.version, productRoot: source.productRoot },
    available: null,
    status: 'blocked',
    strategy: 'none',
    blockingReasons: source.blockingReasons,
    nextActions: ['使用 Buildr 开发 checkout 安装脚本或受支持的 npm registry package 重新安装 CLI。'],
  };
}

export function executeCliUpdatePlan(plan, options = {}) {
  if (plan.status !== 'update-available') return { ok: ['up-to-date', 'version-stale'].includes(plan.status), status: ['up-to-date', 'version-stale'].includes(plan.status) ? 0 : 1, stdout: '', stderr: '', error: null };
  return plan.mode === 'development-checkout'
    ? run('git', ['-C', plan.current.gitRoot, plan.strategy === 'fast-forward' ? 'merge' : 'rebase', ...(plan.strategy === 'fast-forward' ? ['--ff-only'] : []), plan.current.upstream], options)
    : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--global', '--prefix', plan.current.installPrefix, `${plan.current.package}@${plan.available.version}`], options);
}

function printPlan(plan, label) {
  console.log(`${label}: ${plan.status}`);
  console.log(`mode: ${plan.mode}`);
  if (plan.current?.version) console.log(`current: ${plan.current.version}`);
  if (plan.available?.version) console.log(`available: ${plan.available.version}`);
  if (plan.available?.releasedVersion) console.log(`released: ${plan.available.releasedVersion}`);
  if (plan.current?.branch) console.log(`branch: ${plan.current.branch}`);
  if (plan.current?.upstream) console.log(`upstream: ${plan.current.upstream}`);
  for (const reason of plan.blockingReasons) console.log(`blocked: ${reason}`);
  for (const action of plan.nextActions) console.log(`next: ${action}`);
}

export function registerApplicationCliUpdate(runtime) {
  const productRoot = (...args) => runtime.productRoot(...args);
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);

  function updateCheck(args) {
    if (args.includes('--target')) throw new Error('buildr update 不接收 workspace --target；请使用 buildr sync <agent> --target <dir> 同步 workspace。');
    assertNoUnknownOptions(args, new Set(['--json']));
    const plan = buildCliUpdatePlan(productRoot());
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.updateCheck, plan), null, 2)}\n`);
    else printPlan(plan, 'Buildr CLI update check');
    if (plan.status === 'blocked') process.exitCode = 1;
    return plan;
  }

  function updateBuildr(args) {
    if (args.includes('--target')) throw new Error('buildr update 不接收 workspace --target；请使用 buildr sync <agent> --target <dir> 同步 workspace。');
    assertNoUnknownOptions(args, new Set(['--json']));
    const json = hasFlag(args, '--json');
    const plan = buildCliUpdatePlan(productRoot());
    if (plan.status === 'blocked') {
      if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, plan), null, 2)}\n`);
      else printPlan(plan, 'Buildr CLI update');
      process.exitCode = 1;
      return plan;
    }
    if (plan.strategy === 'none') {
      if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, plan), null, 2)}\n`);
      else printPlan(plan, 'Buildr CLI update');
      return plan;
    }
    const result = executeCliUpdatePlan(plan);
    if (!result.ok) {
      const failed = { ...plan, status: 'blocked', blockingReasons: [`CLI 更新失败：${result.stderr || result.error || 'unknown error'}`], nextActions: plan.mode === 'development-checkout' && plan.strategy === 'rebase' ? ['检查 Git rebase 状态并决定继续或中止；Buildr 不会自动解决冲突。'] : ['处理安装错误后重新运行 buildr update。'] };
      if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, failed), null, 2)}\n`);
      else printPlan(failed, 'Buildr CLI update');
      process.exitCode = 1;
      return failed;
    }
    const completed = { ...plan, status: 'updated', blockingReasons: [], nextActions: ['CLI 已更新。若用户要求完整更新 Buildr，重新解析 buildr 入口并运行 buildr sync <agent> --target <workspace>。'] };
    if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, completed), null, 2)}\n`);
    else printPlan(completed, 'Buildr CLI update');
    return completed;
  }

  Object.assign(runtime, { updateCheck, updateBuildr });
  return runtime;
}
