import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../../../infrastructure/process.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import {
  RELEASE_TRACKS,
  buildReleaseAwareness,
  compareVersions,
  defaultReleaseTrack,
} from './release-awareness.ts';
import {
  readCurrentInstallationOrigin,
  validateFormalInstallationOriginPayloadBinding,
  validateInstallationOrigin,
} from '../infrastructure/installation-origin.ts';
import {
  findRegisteredProductInstallation,
  inspectProductUpdateAuthority,
} from '../infrastructure/installation-registry.ts';
import { readApplicationPayloadManifest, resolveApplicationPayloadRoot } from '../../../infrastructure/product-resources/index.mjs';

function run(command: any, args: any, options: any = {}) {
  const result = spawnCommandSync(command, args, { encoding: 'utf8', ...options });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error?.message || null,
  };
}

function readPackage(file: any) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export { compareVersions } from './release-awareness.ts';

export function identifyCliSource(productRoot: any, options: any = {}) {
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
  } catch (error: any) {
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

function gitValue(root: any, args: any) {
  const result = run('git', ['-C', root, ...args]);
  return result.ok ? result.stdout : null;
}

function gitUpdatePlan(source: any, { fetch = true, registryLookup = null, ...options }: any = {}) {
  const root = source.gitRoot;
  const blockingReasons: any[] = [];
  const branch = gitValue(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = gitValue(root, ['rev-parse', 'HEAD']);
  const upstream = gitValue(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const dirty = Boolean(gitValue(root, ['status', '--porcelain=v1', '--untracked-files=normal']));
  if (!branch) blockingReasons.push('当前 checkout 处于 detached HEAD。');
  if (!upstream) blockingReasons.push('当前 branch 没有 upstream。');
  if (dirty) blockingReasons.push('当前 checkout 存在未提交改动。');
  let fetchResult: any = null;
  if (fetch && upstream && !dirty) {
    fetchResult = run('git', ['-C', root, 'fetch', '--quiet']);
    if (!fetchResult.ok) blockingReasons.push(`无法 fetch 远端：${fetchResult.stderr || fetchResult.error || 'unknown error'}`);
  }
  let ahead: any = null;
  let behind: any = null;
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
  const awareness = buildReleaseAwareness(source, { ...options, registryLookup });
  const releaseTrack = defaultReleaseTrack(source.version);
  const releasedTrack = awareness.tracks[releaseTrack];
  const released = {
    tag: RELEASE_TRACKS[releaseTrack].tag,
    version: releasedTrack.version,
    error: awareness.freshness.status === 'fresh' ? null : awareness.blockingReasons.join(' ') || 'unknown error',
  };
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
  const { schemaVersion: _schemaVersion, current: _releaseCurrent, status: _releaseStatus, ...releaseProjection } = awareness;
  return {
    ...releaseProjection,
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

function registryUpdatePlan(source: any, options: any = {}) {
  const awareness = buildReleaseAwareness(source, options);
  const selected = awareness.tracks[awareness.selectedTrack];
  const blockingReasons = [...awareness.blockingReasons];
  let status = awareness.status;
  let strategy = 'none';
  if (options.purpose !== 'check' && blockingReasons.length === 0) {
    if (selected.status === 'update-available') {
      status = 'update-available';
      strategy = 'npm-install';
    } else if (selected.status === 'behind-current') {
      status = 'blocked';
      blockingReasons.push(`${selected.label} ${selected.version} 低于当前安装 ${source.version}；Buildr 不会自动降级。`);
    } else if (selected.status === 'current') {
      status = 'up-to-date';
    } else {
      status = 'blocked';
      blockingReasons.push(`${selected.label}当前不可安装，请先处理 ${selected.tag} 发布状态。`);
    }
  } else if (options.purpose === 'check') {
    strategy = selected.status === 'update-available' ? 'npm-install' : 'none';
  }
  const { schemaVersion: _schemaVersion, ...projection } = awareness;
  return {
    ...projection,
    available: { version: selected.version },
    target: { track: awareness.selectedTrack, tag: selected.tag, version: selected.version },
    status,
    strategy,
    blockingReasons,
    nextActions: blockingReasons.length ? ['检查当前 npm 安装、Registry 与所选发布轨道后重试。'] : awareness.nextActions,
  };
}

export function buildCliUpdatePlan(productRoot: any, options: any = {}) {
  const source = identifyCliSource(productRoot, options);
  if (source.mode === 'development') return gitUpdatePlan(source, options);
  if (source.mode === 'npm') return registryUpdatePlan(source, options);
  const awareness = buildReleaseAwareness(source, options);
  const { schemaVersion: _schemaVersion, ...projection } = awareness;
  return {
    ...projection,
    mode: 'unknown',
    channel: 'unknown',
    available: null,
    status: 'blocked',
    strategy: 'none',
    blockingReasons: source.blockingReasons,
    nextActions: ['使用 Buildr 开发 checkout 安装脚本或受支持的 npm registry package 重新安装 CLI。'],
  };
}

export function executeCliUpdatePlan(plan: any, options: any = {}) {
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
    `${plan.current.package}@${plan.target?.version || plan.available?.version}`,
  ], options);
}

function printPlan(plan: any, label: any) {
  if (plan.tracks && plan.current?.version) {
    console.log(`当前安装：${plan.current.version}`);
    const candidate = plan.tracks.candidate;
    const stable = plan.tracks.stable;
    const trackText = (track: any) => {
      if (track.status === 'update-available') return `${track.version} 可更新`;
      if (track.status === 'current') return `${track.version}（当前版本）`;
      if (track.status === 'behind-current') return `${track.version}（低于当前版本，不自动降级）`;
      if (track.status === 'not-published') return '尚未发布';
      return track.observedVersion ? `配置异常（${track.observedVersion}）` : '配置异常';
    };
    console.log(`RC 候选版：${trackText(candidate)}`);
    console.log(`GA 正式版：${trackText(stable)}`);
    for (const notice of plan.notices || []) if (!notice.command) console.log(`提示：${notice.message}`);
    for (const action of plan.nextActions || []) console.log(`下一步：${action}`);
    return;
  }
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

export function registerApplicationCliUpdate(runtime: any) {
  const productRoot = (...args: any[]) => runtime.productRoot(...args);
  const assertNoUnknownOptions = (...args: any[]) => runtime.assertNoUnknownOptions(...args);
  const hasFlag = (...args: any[]) => runtime.hasFlag(...args);
  const optionValue = (...args: any[]) => runtime.optionValue(...args);

  function selectedTrack(args: any) {
    const track = optionValue(args, '--track', null);
    if (track !== null && !(RELEASE_TRACKS as Record<string, any>)[track]) throw new Error('--track must be stable or candidate.');
    return track;
  }

  function releaseAwareness(options: any = {}) {
    const source = options.source || identifyCliSource(productRoot(), options);
    return buildReleaseAwareness(source, options);
  }

  function updateCheck(args: any) {
    if (args.includes('--target')) throw new Error('buildr update 不接收 workspace --target；请使用 buildr sync <agent> --target <dir> 同步 workspace。');
    assertNoUnknownOptions(args, new Set(['--json']), new Set(['--json']));
    const plan = buildCliUpdatePlan(productRoot(), { purpose: 'check', persistState: true, notify: true });
    if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.updateCheck, plan), null, 2)}\n`);
    else printPlan(plan, 'Buildr CLI update check');
    if (plan.status === 'blocked') process.exitCode = 1;
    return plan;
  }

  function updateBuildr(args: any) {
    if (args.includes('--target')) throw new Error('buildr update 不接收 workspace --target；请使用 buildr sync <agent> --target <dir> 同步 workspace。');
    assertNoUnknownOptions(args, new Set(['--json', '--track']), new Set(['--json']));
    const json = hasFlag(args, '--json');
    const track = selectedTrack(args);
    const source = identifyCliSource(productRoot());
    if (track && source.mode === 'development') throw new Error('release track 只适用于 npm installation；development checkout 更新不接受 --track。');
    const plan = buildCliUpdatePlan(productRoot(), { track, purpose: 'update', persistState: true, notify: true });
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
    const completed = { ...plan, status: 'updated', blockingReasons: [], nextActions: ['CLI 已更新；已存在的同 ownership Buildr Web Launcher 会由 npm lifecycle 刷新。'] };
    if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.update, completed), null, 2)}\n`);
    else printPlan(completed, 'Buildr CLI update');
    return completed;
  }

  Object.assign(runtime, { releaseAwareness, updateCheck, updateBuildr });
  return runtime;
}
