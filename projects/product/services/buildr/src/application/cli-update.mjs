import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../infrastructure/process.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from './json-contracts.mjs';
import {
  readCurrentInstallationOrigin,
  validateFormalInstallationOriginPayloadBinding,
  validateInstallationOrigin,
} from '../infrastructure/product-identity/installation-origin.mjs';
import {
  findRegisteredProductInstallation,
  inspectProductUpdateAuthority,
} from '../infrastructure/product-identity/installation-registry.mjs';
import { readApplicationPayloadManifest, resolveApplicationPayloadRoot } from '../infrastructure/product-resources/index.mjs';

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

export function identifyCliSource(productRoot, options = {}) {
  const root = fs.realpathSync(path.resolve(productRoot));
  const packageFile = path.join(root, 'package.json');
  const manifest = readPackage(packageFile);
  const payloadRoot = options.payloadRoot || resolveApplicationPayloadRoot();
  let origin;
  try {
    if (options.origin) {
      origin = validateInstallationOrigin(options.origin);
      if (origin.channel === 'npm') {
        const payloadManifest = options.payloadManifest || (payloadRoot ? readApplicationPayloadManifest(payloadRoot) : null);
        validateFormalInstallationOriginPayloadBinding(origin, payloadManifest);
      }
    } else {
      origin = readCurrentInstallationOrigin(root, { payloadRoot, ...options });
    }
  } catch (error) {
    origin = {
      channel: 'unknown',
      runtimeRole: 'unknown',
      ownershipIdentity: null,
      applicationPayloadDigest: null,
      protocolIdentity: null,
      blockingReasons: [`正式安装来源与 application payload 无法交叉验证：${error.message}`],
    };
  }
  const registration = options.registration === undefined
    ? findRegisteredProductInstallation(origin, {
      file: options.installationRegistryFile,
      dataRoot: options.installationRegistryDataRoot,
      productRoot: root,
      envelopePath: origin.receipt?.file,
      entryPath: options.entryPath || process.env.BUILDR_NPM_ENTRY_PATH,
    })
    : options.registration;
  const base = {
    productRoot: root,
    packageRoot: root,
    package: manifest?.name || null,
    version: manifest?.version || null,
    channel: origin.channel,
    runtimeRole: origin.runtimeRole,
    installationIdentity: origin.ownershipIdentity,
    applicationPayloadDigest: origin.applicationPayloadDigest,
    protocolIdentity: origin.protocolIdentity,
  };
  if (manifest?.name !== '@buildr-ai/buildr') {
    return { ...base, mode: 'unknown', installPrefix: null, blockingReasons: ['当前 executable 的产品根没有声明 @buildr-ai/buildr package identity。'] };
  }
  if (origin.channel === 'development') {
    return {
      ...base,
      mode: 'development',
      gitRoot: origin.gitRoot,
      projectRoot: path.join(origin.gitRoot, 'projects', 'product'),
      service: { projectCode: 'product', code: 'buildr' },
      installPrefix: null,
      blockingReasons: [],
    };
  }
  if (origin.channel === 'npm') {
    const updateAuthority = registration?.status === 'installed' ? registration.entry.updateAuthority : null;
    return {
      ...base,
      mode: 'npm',
      installPrefix: updateAuthority?.prefix || null,
      installUnit: origin.installUnit,
      updateAuthority,
      registrationStatus: registration?.status || 'absent',
      registrationReason: registration?.reason || null,
      blockingReasons: [],
    };
  }
  return { ...base, mode: 'unknown', installPrefix: null, blockingReasons: origin.blockingReasons || ['无法从 installation identity 与 ownership receipt 证明当前 Buildr 来源。'] };
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
    channel: source.channel,
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

function registryUpdatePlan(source, options = {}) {
  const blockingReasons = [];
  let availableVersion = null;
  const authority = inspectProductUpdateAuthority(source.updateAuthority, { productRoot: source.productRoot });
  if (authority.status !== 'ready') {
    blockingReasons.push(`当前 npm package 缺少可用的 receipt registry update authority：${authority.reason}；Buildr 不会根据 PATH、文件名或目录布局猜测更新命令。`);
  } else {
    const result = run(authority.authority.nodeExecutable, [
      authority.authority.npmCliPath,
      'view', source.package, 'version', '--json',
    ], options.registryCommandOptions);
    if (!result.ok) blockingReasons.push(`无法通过登记的 npm authority 查询 registry：${result.stderr || result.error || 'unknown error'}`);
    else {
      try { availableVersion = JSON.parse(result.stdout); } catch { blockingReasons.push('npm registry 返回了无法解析的版本。'); }
    }
  }
  const updateAvailable = availableVersion && compareVersions(availableVersion, source.version) > 0;
  return {
    mode: source.mode,
    channel: source.channel,
    current: { package: source.package, version: source.version, productRoot: source.productRoot, installPrefix: source.installPrefix, installationIdentity: source.installationIdentity, hostNode: process.versions.node, updateAuthority: source.updateAuthority },
    available: { version: availableVersion },
    status: blockingReasons.length ? 'blocked' : updateAvailable ? 'update-available' : 'up-to-date',
    strategy: updateAvailable && source.updateAuthority ? 'npm-install' : 'none',
    blockingReasons,
    nextActions: blockingReasons.length
      ? [authority.status !== 'ready'
        ? '通过原 package manager 重装该全局 npm package 以建立可信 channel envelope；--ignore-scripts 安装将继续安全阻塞自更新。'
        : '检查当前 npm registry、网络和登记的安装 prefix 后重试。']
      : updateAvailable && source.updateAuthority
        ? ['运行 buildr update 更新同一 npm package/prefix；Workspace Node 不会随之改变。']
        : updateAvailable
          ? ['当前 npm package identity 有效，但缺少可证明的 install prefix；请通过原 package manager 更新，不要让 Buildr 猜测 PATH 或目录。']
        : [],
  };
}

export function buildCliUpdatePlan(productRoot, options = {}) {
  const source = identifyCliSource(productRoot, options);
  if (source.mode === 'development') return gitUpdatePlan(source, options);
  if (source.mode === 'npm') return registryUpdatePlan(source, options);
  return {
    mode: 'unknown',
    channel: 'unknown',
    current: { package: source.package, version: source.version, productRoot: source.productRoot },
    available: null,
    status: 'blocked',
    strategy: 'none',
    blockingReasons: source.blockingReasons,
    nextActions: ['使用 Buildr 开发 checkout 安装脚本或受支持的 npm registry package 重新安装 CLI。'],
  };
}

export function executeCliUpdatePlan(plan, options = {}) {
  if (plan.status !== 'update-available') return { ok: ['up-to-date', 'version-stale', 'manual-check-required'].includes(plan.status), status: ['up-to-date', 'version-stale', 'manual-check-required'].includes(plan.status) ? 0 : 1, stdout: '', stderr: '', error: null };
  if (plan.mode === 'npm' && (!plan.current.updateAuthority || plan.strategy !== 'npm-install')) {
    return { ok: false, status: 1, stdout: '', stderr: 'npm update authority is not receipt-registry-proven.', error: 'npm-update-authority-required' };
  }
  if (plan.mode === 'development') {
    return run('git', ['-C', plan.current.gitRoot, plan.strategy === 'fast-forward' ? 'merge' : 'rebase', ...(plan.strategy === 'fast-forward' ? ['--ff-only'] : []), plan.current.upstream], options);
  }
  const authority = plan.current.updateAuthority;
  const authorityInspection = inspectProductUpdateAuthority(authority, { productRoot: plan.current.productRoot });
  if (authorityInspection.status !== 'ready') {
    return { ok: false, status: 1, stdout: '', stderr: authorityInspection.reason, error: 'npm-update-authority-invalid' };
  }
  return run(authority.nodeExecutable, [
    authority.npmCliPath,
    'install', '--global', '--prefix', authority.prefix,
    `${plan.current.package}@${plan.available.version}`,
  ], options);
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
      const failed = { ...plan, status: 'blocked', blockingReasons: [`CLI 更新失败：${result.stderr || result.error || 'unknown error'}`], nextActions: plan.mode === 'development' && plan.strategy === 'rebase' ? ['检查 Git rebase 状态并决定继续或中止；Buildr 不会自动解决冲突。'] : ['处理安装错误后重新运行 buildr update。'] };
      if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, failed), null, 2)}\n`);
      else printPlan(failed, 'Buildr CLI update');
      process.exitCode = 1;
      return failed;
    }
    const completed = { ...plan, status: 'updated', blockingReasons: [], nextActions: ['CLI 已更新；已存在的同 ownership Buildr Web Launcher 会由 npm lifecycle 刷新。Workspace Node 不会随之改变。'] };
    if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, completed), null, 2)}\n`);
    else printPlan(completed, 'Buildr CLI update');
    return completed;
  }

  Object.assign(runtime, { updateCheck, updateBuildr });
  return runtime;
}
