import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentProgramManager, ProgramCandidate, ProgramCatalog } from '../contracts.ts';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import { safeStoragePath } from '../storage/files.ts';
import { runtimeFileHash } from '../storage/runtime-objects.ts';
import { recordSharedCacheUse } from '../storage/shared-cache.ts';
import { sharedToolchainEnvironment } from '../storage/toolchain-environment.ts';
import { executableIdentity, findExecutable, inspectVersion, isolatedEnvironment, nativeCommand, privateDirectories } from './native-process.ts';
import {
  MAX_ARCHIVE_EXTRACTED_BYTES,
  downloadManifestPayload,
  extractTarGzSingleMember,
  finalizeManifestExecutable,
  type ManifestInstallLimits,
} from './program-archive.ts';
import { ProgramInstallDiagnostics } from './program-install-diagnostics.ts';
import {
  isCompatibleProgram,
  isProgramReleaseVersion,
  isStrictManifestVersion,
  isSupportedProgramPlatform,
  nativeProgramPolicies,
  nativeProgramPolicy,
  type NativeProgramPolicy,
} from './program-policy.ts';
import {
  ManifestReleaseIncompatibleError,
  readManifestRelease,
  readProgramLatestRelease,
} from './program-release.ts';

const sourceLabels = {
  configured: '原接入程序',
  selected: '指定程序',
  path: '本机命令行',
  managed: 'Buildr 独立安装',
  application: '桌面应用内程序',
  sdk: '配套程序',
};

export interface NativeProgramManagerOptions {
  policies?: Readonly<Record<string, NativeProgramPolicy>>;
  fetchImpl?: typeof fetch;
  platform?: NodeJS.Platform;
  arch?: string;
  limits?: ManifestInstallLimits;
  beforeAtomicSwitch?: (context: { provider: string; version: string; staging: string; destination: string }) => Promise<void> | void;
}

interface ActiveInstall {
  targetKey: string;
  attemptToken: string;
  sharedController: AbortController;
  attachedSignals: Set<AbortSignal>;
  progressListeners: Set<(message: string) => void>;
  lastProgress?: string;
  work: Promise<string>;
  settled: Promise<void>;
}

function sanitizeAttemptToken(attemptId?: string): string {
  const cleaned = (attemptId ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 48);
  return cleaned || randomUUID().replace(/-/g, '');
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** Native programs only. Browser/tool installation stays with the Agent and its skills. */
export class NativeProgramManager implements AgentProgramManager {
  private readonly root: string;
  private readonly environment: Record<string, string>;
  private readonly latestRelease: typeof readProgramLatestRelease;
  private readonly policies: Readonly<Record<string, NativeProgramPolicy>>;
  private readonly fetchImpl?: typeof fetch;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly limits?: ManifestInstallLimits;
  private readonly beforeAtomicSwitch?: NativeProgramManagerOptions['beforeAtomicSwitch'];
  private readonly activePrepares = new Map<string, ActiveInstall>();
  private readonly activeStaging = new Set<string>();

  constructor(
    root: string,
    environment: Record<string, string>,
    latestRelease = readProgramLatestRelease,
    options: NativeProgramManagerOptions = {},
  ) {
    this.root = root;
    this.environment = environment;
    this.latestRelease = latestRelease;
    this.policies = options.policies ?? nativeProgramPolicies;
    this.fetchImpl = options.fetchImpl;
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.limits = options.limits;
    this.beforeAtomicSwitch = options.beforeAtomicSwitch;
    this.cleanupOrphanStagingSync();
  }

  private destination(provider: string, version: string): string {
    return path.join(this.root, 'programs', provider, `package-${version}-${this.platform}-${this.arch}`);
  }

  /** Remove leftover `.prepare-*` staging directories that have no active in-process owner. */
  cleanupOrphanStagingSync(onlyProvider?: string): void {
    const programsRoot = path.join(this.root, 'programs');
    if (!existsSync(programsRoot) || !safeStoragePath(this.root, programsRoot)) return;
    const providers = onlyProvider ? [onlyProvider] : Object.keys(this.policies);
    for (const provider of providers) {
      if (!Object.hasOwn(this.policies, provider)) continue;
      const base = path.join(programsRoot, provider);
      if (!existsSync(base) || !safeStoragePath(this.root, base)) continue;
      let entries: string[];
      try {
        entries = readdirSync(base);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!name.startsWith('.prepare-')) continue;
        const candidate = path.join(base, name);
        if (this.activeStaging.has(path.resolve(candidate))) continue;
        try {
          const stat = lstatSync(candidate);
          if (stat.isSymbolicLink()) {
            rmSync(candidate, { force: true });
          } else if (stat.isDirectory() && safeStoragePath(this.root, candidate)) {
            rmSync(candidate, { recursive: true, force: true });
          }
        } catch { /* Concurrent removal or unreadable orphan is deferred to storage maintenance. */ }
      }
    }
  }

  private async createStagingDirectory(parent: string, attemptToken: string): Promise<string> {
    await privateDirectories(parent);
    const primary = path.join(parent, `.prepare-${attemptToken}`);
    try {
      await fs.mkdir(primary, { mode: 0o700 });
      return primary;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const fallbackToken = `${attemptToken.slice(0, 32)}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const fallback = path.join(parent, `.prepare-${fallbackToken}`);
    await fs.mkdir(fallback, { mode: 0o700 });
    return fallback;
  }

  private async preparedExecutable(provider: string): Promise<string | undefined> {
    const marker = path.join(this.root, 'programs', provider, 'prepared.json');
    try {
      const info = await fs.lstat(marker);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) return undefined;
      const prepared = JSON.parse(await fs.readFile(marker, 'utf8'));
      if (typeof prepared.version !== 'string' || !isProgramReleaseVersion(prepared.version) || typeof prepared.executable !== 'string') return undefined;
      const policy = nativeProgramPolicy(provider, this.policies);
      const expected = path.join(this.destination(provider, prepared.version), policy.entry);
      if (path.resolve(prepared.executable) !== path.resolve(expected)) return undefined;
      const actual = await fs.realpath(expected);
      return this.isManaged(provider, actual) ? actual : undefined;
    } catch {
      return undefined;
    }
  }

  private async retainPrepared(provider: string, version: string, executable: string): Promise<void> {
    const directory = path.join(this.root, 'programs', provider);
    const marker = path.join(directory, 'prepared.json');
    const temporary = `${marker}.${randomUUID()}`;
    await privateDirectories(directory);
    try {
      await fs.writeFile(temporary, `${JSON.stringify({ version, executable })}\n`, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, marker);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    const policy = nativeProgramPolicy(provider, this.policies);
    if (policy.prepareConnectionConfig) {
      await policy.prepareConnectionConfig(path.join(this.root, 'connections', provider));
    }
  }

  isManaged(provider: string, executable: string): boolean {
    let root = path.resolve(this.root);
    let actual = path.resolve(executable);
    try { root = realpathSync(root); } catch { /* A new private root has not been created yet. */ }
    try {
      actual = realpathSync(actual);
    } catch {
      const relative = path.relative(path.resolve(this.root), actual);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) actual = path.join(root, relative);
    }
    const relative = path.relative(path.join(root, 'programs', provider), actual);
    return Boolean(relative) && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
  }

  private async probeEnvironment(): Promise<NodeJS.ProcessEnv> {
    const home = path.join(this.root, 'program-probes', 'home');
    const temporary = path.join(this.root, 'program-probes', 'tmp');
    await privateDirectories(home, temporary);
    const shared = sharedToolchainEnvironment(this.root, this.environment);
    return isolatedEnvironment(shared.environment, home, temporary, {}, shared.cacheRoot);
  }

  async discover(input: Parameters<AgentProgramManager['discover']>[0]): Promise<ProgramCatalog> {
    const policy = nativeProgramPolicy(input.provider, this.policies);
    const env = await this.probeEnvironment();
    const candidates: ProgramCandidate[] = [];
    const seen = new Set<string>();
    const paths: Array<{ executable: string; source: ProgramCandidate['source']; bundle?: string }> = [];
    const explicit = input.executable ?? input.boundExecutable;
    let installVersion: string = policy.version;
    let releaseDiagnostic: string | undefined;

    if (explicit) {
      if (!path.isAbsolute(explicit)) fail('agent_executable_invalid', '请指定程序的准确绝对路径。');
      paths.push({ executable: explicit, source: input.boundExecutable ? 'configured' : 'selected' });
      if (!input.boundExecutable && !this.isManaged(input.provider, explicit)) {
        fail('agent_program_not_managed', '新接入仅使用 Buildr 独立程序，请选择准备独立程序。');
      }
    } else {
      const addFallback = async () => {
        const prepared = await this.preparedExecutable(input.provider);
        if (prepared) {
          paths.push({ executable: prepared, source: 'managed' });
          return;
        }
        const legacy = path.join(this.root, 'programs', input.provider, `${policy.version}-${this.platform}-${this.arch}`, policy.entry);
        const fallback = await fs.realpath(legacy).catch(() => undefined);
        if (fallback && this.isManaged(input.provider, fallback)) paths.push({ executable: fallback, source: 'managed' });
      };
      try {
        const release = await this.latestRelease(input.provider, input.signal, {
          policies: this.policies,
          platform: this.platform,
          arch: this.arch,
          fetchImpl: this.fetchImpl,
        });
        installVersion = release.latestVersion;
        const validVersion = policy.distribution.kind === 'manifest'
          ? isStrictManifestVersion(installVersion)
          : isProgramReleaseVersion(installVersion);
        if (!validVersion) throw new Error('agent_release_invalid');
        if (!isCompatibleProgram(input.provider, installVersion, this.policies)) {
          releaseDiagnostic = `官方最新版本 ${installVersion} 不在兼容范围 ${policy.compatibility} 内，已停止下载；不会回退安装旧版本。`;
          await addFallback();
        } else {
          paths.push({ executable: path.join(this.destination(input.provider, installVersion), policy.entry), source: 'managed' });
          if (!await fs.stat(paths[0]!.executable).then(item => item.isFile(), () => false)) await addFallback();
        }
      } catch (error) {
        input.signal.throwIfAborted();
        if (error instanceof ManifestReleaseIncompatibleError) {
          installVersion = error.version;
          releaseDiagnostic = `官方最新版本 ${error.version} 不在兼容范围 ${policy.compatibility} 内，已停止下载；不会回退安装旧版本。`;
        } else {
          installVersion = policy.version;
          const code = error instanceof Error ? error.message : '';
          if (code === 'agent_release_invalid') {
            releaseDiagnostic = '官方最新版本格式无效，已停止下载。';
          } else if (code === 'agent_release_redirect_disallowed' || code === 'agent_release_redirect_exceeded') {
            releaseDiagnostic = '官方发布源地址校验未通过，已停止下载；不会改用其他来源。';
          } else if (code === 'agent_release_too_large') {
            releaseDiagnostic = '官方发布清单超出大小上限，已停止下载。';
          } else if (code === 'agent_release_platform_unsupported') {
            releaseDiagnostic = '此系统或架构尚无可用的自动准备方式，请查看官方安装说明。';
          } else {
            releaseDiagnostic = '无法读取官方最新版本，请检查网络后重新检查；不会回退安装旧版本。';
          }
        }
        await addFallback();
      }
    }

    for (const candidate of paths) {
      input.signal.throwIfAborted();
      const exists = await fs.stat(candidate.executable).then(item => item.isFile(), () => false);
      if (!exists && !explicit) continue;
      const actual = exists ? await fs.realpath(candidate.executable) : candidate.executable;
      if (!input.boundExecutable && !this.isManaged(input.provider, actual)) continue;
      if (seen.has(actual)) continue;
      seen.add(actual);
      const item: ProgramCandidate = { executable: actual, source: candidate.source, label: sourceLabels[candidate.source], compatible: false };
      if (policy.managedOnly && !this.isManaged(input.provider, actual)) {
        item.diagnostic = '该接入仅允许使用 Buildr 独立受管程序，不接管外部程序。';
        candidates.push(item);
        continue;
      }
      try {
        await executableIdentity(actual);
        item.version = await inspectVersion(actual, env, input.signal);
        item.compatible = isCompatibleProgram(input.provider, item.version, this.policies);
        if (!item.compatible) item.diagnostic = `版本 ${item.version} 不在兼容范围 ${policy.compatibility} 内（包含该系列预发布版本）。`;
      } catch {
        input.signal.throwIfAborted();
        item.diagnostic = exists ? '程序无法运行，或应用身份、签名检查未通过。' : '原指定程序已不存在；不会自动改用其他来源。';
      }
      candidates.push(item);
    }

    const supported = isSupportedProgramPlatform(policy, this.platform, this.arch);
    return {
      candidates,
      installation: {
        label: policy.label,
        version: installVersion,
        url: policy.url,
        guidance: policy.guidance,
        canInstall: supported && !input.boundExecutable && !releaseDiagnostic,
        ...(!supported
          ? { diagnostic: '此系统或架构尚无可用的自动准备方式，请查看官方安装说明。' }
          : input.boundExecutable
            ? { diagnostic: '已有接入已绑定原程序；请恢复该程序，不会自动安装并改绑。' }
            : releaseDiagnostic
              ? { diagnostic: releaseDiagnostic }
              : {}),
      },
    };
  }

  async install(input: Parameters<AgentProgramManager['install']>[0]): Promise<string> {
    input.signal.throwIfAborted();
    nativeProgramPolicy(input.provider, this.policies);
    const targetKey = `${input.provider}:${input.version ?? 'latest'}`;

    while (true) {
      const existing = this.activePrepares.get(input.provider);
      if (!existing) break;
      if (existing.sharedController.signal.aborted) {
        await Promise.race([
          existing.settled,
          new Promise<never>((_, reject) => {
            if (input.signal.aborted) {
              reject(abortReason(input.signal));
              return;
            }
            input.signal.addEventListener('abort', () => reject(abortReason(input.signal)), { once: true });
          }),
        ]);
        input.signal.throwIfAborted();
        continue;
      }
      if (existing.targetKey !== targetKey) {
        fail('agent_preparation_busy', '同一程序的另一准备任务正在进行，请稍后重试。', 409);
      }
      return await this.joinActiveInstall(existing, input.signal, input.progress);
    }

    const sharedController = new AbortController();
    const attachedSignals = new Set<AbortSignal>();
    const progressListeners = new Set<(message: string) => void>();
    const attemptToken = sanitizeAttemptToken(input.attemptId);
    let resolveSettled!: () => void;
    const settled = new Promise<void>(resolve => { resolveSettled = resolve; });

    const active: ActiveInstall = {
      targetKey,
      attemptToken,
      sharedController,
      attachedSignals,
      progressListeners,
      work: Promise.resolve(''),
      settled,
    };

    const emitProgress = (message: string) => {
      if (sharedController.signal.aborted) return;
      active.lastProgress = message;
      for (const listener of progressListeners) {
        try { listener(message); } catch { /* Listener failure never aborts installation. */ }
      }
    };

    active.work = this.installExclusive(
      { provider: input.provider, version: input.version, attemptToken },
      sharedController.signal,
      emitProgress,
    ).finally(() => {
      if (this.activePrepares.get(input.provider) === active) {
        this.activePrepares.delete(input.provider);
      }
      resolveSettled();
    });
    // Prevent unhandled rejection when all attached callers detach early on abort.
    active.work.catch(() => {});

    this.activePrepares.set(input.provider, active);
    return await this.joinActiveInstall(active, input.signal, input.progress);
  }

  private async joinActiveInstall(
    active: ActiveInstall,
    callerSignal: AbortSignal,
    callerProgress: (message: string) => void,
  ): Promise<string> {
    callerSignal.throwIfAborted();
    active.attachedSignals.add(callerSignal);
    active.progressListeners.add(callerProgress);
    if (active.lastProgress) {
      try { callerProgress(active.lastProgress); } catch { /* Ignore caller progress errors. */ }
    }

    let rejectCallerAbort!: (reason: unknown) => void;
    const callerAborted = new Promise<never>((_, reject) => { rejectCallerAbort = reject; });
    const onAbort = () => {
      active.attachedSignals.delete(callerSignal);
      active.progressListeners.delete(callerProgress);
      const reason = abortReason(callerSignal);
      if (active.attachedSignals.size === 0) {
        if (!active.sharedController.signal.aborted) {
          active.sharedController.abort(callerSignal.reason);
        }
        void active.settled.then(() => rejectCallerAbort(reason));
        return;
      }
      rejectCallerAbort(reason);
    };
    callerSignal.addEventListener('abort', onAbort, { once: true });
    if (callerSignal.aborted) onAbort();

    try {
      return await Promise.race([active.work, callerAborted]);
    } finally {
      callerSignal.removeEventListener('abort', onAbort);
      active.attachedSignals.delete(callerSignal);
      active.progressListeners.delete(callerProgress);
    }
  }

  private async shareStagedFiles(staging: string): Promise<void> {
    if (!/^programs\/[a-z][a-z0-9-]*\/\.prepare-[A-Za-z0-9]+$/.test(path.relative(this.root, staging).split(path.sep).join('/'))) {
      return;
    }
    const worker = new Worker(
      new URL(import.meta.url.endsWith('.ts') ? '../process/storage-maintenance.ts' : '../process/storage-maintenance.js', import.meta.url),
      { workerData: { kind: 'agent-storage-program', dataRoot: path.dirname(this.root), root: this.root, directory: staging } },
    );
    await new Promise<void>((resolve, reject) => {
      worker.once('error', reject);
      worker.once('exit', code => (code === 0 ? resolve() : reject(new Error('agent_program_sharing_failed'))));
    });
  }

  private async commitStagedDestination(
    provider: string,
    staging: string,
    stagedExecutable: string,
    destination: string,
    executable: string,
    expectedVersion: string,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
    allowIndependentBinaryVersion = false,
  ): Promise<void> {
    try {
      await fs.rename(staging, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error;
    }

    const destStat = await fs.lstat(destination);
    const execStat = await fs.lstat(executable).catch(() => undefined);
    if (destStat.isSymbolicLink() || !execStat?.isFile() || execStat.isSymbolicLink() || !this.isManaged(provider, await fs.realpath(executable))) {
      fail('agent_install_existing_invalid', '独立安装目录不能引用外部程序。');
    }
    const stagedDigest = runtimeFileHash(stagedExecutable);
    const existingDigest = runtimeFileHash(executable);
    const existingVersion = await inspectVersion(executable, env, signal);
    const versionMatches = isCompatibleProgram(provider, existingVersion, this.policies)
      && (allowIndependentBinaryVersion || existingVersion === expectedVersion);
    if (stagedDigest !== existingDigest || !versionMatches) {
      fail('agent_install_existing_invalid', '已有受管程序与当前校验结果不一致；保留原目录。');
    }
  }

  private async installExclusive(
    input: { provider: string; version?: string; attemptToken: string },
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<string> {
    this.cleanupOrphanStagingSync(input.provider);
    const policy = nativeProgramPolicy(input.provider, this.policies);
    if (policy.distribution.kind === 'manifest') {
      return await this.installFromManifest(input, policy, policy.distribution, signal, progress);
    }
    return await this.installFromNpm(input, policy, policy.distribution, signal, progress);
  }

  private async verifyExistingManagedManifest(
    provider: string,
    version: string,
    destination: string,
    executable: string,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
  ): Promise<string> {
    const destStat = await fs.lstat(destination);
    const execStat = await fs.lstat(executable).catch(() => undefined);
    if (destStat.isSymbolicLink() || !execStat?.isFile() || execStat.isSymbolicLink() || !this.isManaged(provider, await fs.realpath(executable))) {
      fail('agent_install_existing_invalid', '独立安装目录不能引用外部程序。');
    }
    const actualVersion = await inspectVersion(executable, env, signal);
    if (actualVersion === version && isCompatibleProgram(provider, actualVersion, this.policies)) {
      await this.retainPrepared(provider, version, executable);
      return executable;
    }
    fail('agent_install_existing_invalid', '已有受管程序需要检查；不会覆盖该目录。');
  }

  private async installFromManifest(
    input: { provider: string; version?: string; attemptToken: string },
    policy: NativeProgramPolicy,
    distribution: Extract<NativeProgramPolicy['distribution'], { kind: 'manifest' }>,
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<string> {
    if (!isSupportedProgramPlatform(policy, this.platform, this.arch)) {
      fail('agent_install_platform_unsupported', '此系统或架构尚无可用的自动准备方式。');
    }
    const env = await this.probeEnvironment();

    if (input.version !== undefined) {
      if (!isStrictManifestVersion(input.version) || !isCompatibleProgram(input.provider, input.version, this.policies)) {
        fail('agent_install_version_invalid', '更新版本无效或不在兼容范围内。');
      }
      const existingDest = this.destination(input.provider, input.version);
      if (await fs.lstat(existingDest).then(() => true, () => false)) {
        return await this.verifyExistingManagedManifest(
          input.provider,
          input.version,
          existingDest,
          path.join(existingDest, distribution.entry),
          env,
          signal,
        );
      }
    }

    const latest = await this.latestRelease(input.provider, signal, {
      policies: this.policies,
      platform: this.platform,
      arch: this.arch,
      fetchImpl: this.fetchImpl,
    });
    const manifest = latest.manifest ?? await readManifestRelease(input.provider, signal, {
      policies: this.policies,
      platform: this.platform,
      arch: this.arch,
      fetchImpl: this.fetchImpl,
    });

    const releaseVersion = manifest.version;
    if (!isStrictManifestVersion(releaseVersion) || !isCompatibleProgram(input.provider, releaseVersion, this.policies)) {
      fail('agent_install_version_invalid', '官方清单版本无效或不在兼容范围内。');
    }
    if (input.version !== undefined && input.version !== releaseVersion) {
      fail('agent_install_version_mismatch', '官方当前发布版本已变化，请重新检查后再准备。');
    }

    const destination = this.destination(input.provider, releaseVersion);
    const executable = path.join(destination, distribution.entry);
    if (await fs.lstat(destination).then(() => true, () => false)) {
      return await this.verifyExistingManagedManifest(input.provider, releaseVersion, destination, executable, env, signal);
    }

    signal.throwIfAborted();
    const parent = path.dirname(destination);
    const staging = await this.createStagingDirectory(parent, input.attemptToken);
    const resolvedStaging = path.resolve(staging);
    this.activeStaging.add(resolvedStaging);

    try {
      const archivePath = path.join(staging, '.download');
      const stagedExecutable = path.join(staging, distribution.entry);
      progress(`正在下载并校验官方独立程序 ${releaseVersion}。`);
      await downloadManifestPayload(manifest, distribution, archivePath, signal, {
        fetchImpl: this.fetchImpl,
        limits: this.limits,
      });

      signal.throwIfAborted();
      progress('下载校验完成，正在解出并核验程序。');
      if (this.platform === 'win32' && distribution.payload.binary) {
        const stat = await fs.lstat(archivePath);
        const maxExtracted = this.limits?.maxExtractedBytes ?? MAX_ARCHIVE_EXTRACTED_BYTES;
        if (stat.size > maxExtracted) {
          fail('agent_install_archive_too_large', '程序二进制超出大小上限，已中止准备。');
        }
        await privateDirectories(path.dirname(stagedExecutable));
        await fs.rename(archivePath, stagedExecutable);
      } else if (distribution.payload['tar.gz']) {
        await extractTarGzSingleMember(
          archivePath,
          staging,
          distribution.payload['tar.gz'].member,
          stagedExecutable,
          signal,
          this.limits,
        );
        await fs.rm(archivePath, { force: true });
      } else {
        fail('agent_install_platform_unsupported', '当前平台未配置可用的官方归档格式。');
      }

      const stagedStat = await fs.lstat(stagedExecutable);
      if (!stagedStat.isFile() || stagedStat.isSymbolicLink()) {
        fail('agent_install_existing_invalid', '独立程序不能引用链接或非常规文件。');
      }
      const stagedRelative = path.relative(await fs.realpath(staging), await fs.realpath(stagedExecutable));
      if (!stagedRelative || stagedRelative === '..' || stagedRelative.startsWith('..' + path.sep) || path.isAbsolute(stagedRelative)) {
        fail('agent_install_existing_invalid', '独立程序不能引用安装目录外的文件。');
      }

      await finalizeManifestExecutable(stagedExecutable, this.platform);
      const observedVersion = await inspectVersion(stagedExecutable, env, signal);
      if (observedVersion !== releaseVersion || !isCompatibleProgram(input.provider, observedVersion, this.policies)) {
        fail('agent_install_version_mismatch', '下载程序报告版本与官方清单不一致，未启用该程序。');
      }

      signal.throwIfAborted();
      await this.shareStagedFiles(staging);
      signal.throwIfAborted();
      const postShareVersion = await inspectVersion(stagedExecutable, env, signal);
      if (postShareVersion !== releaseVersion) {
        fail('agent_install_version_mismatch', '受管程序校验未通过，未启用该程序。');
      }

      await this.beforeAtomicSwitch?.({ provider: input.provider, version: releaseVersion, staging, destination });
      signal.throwIfAborted();
      await this.commitStagedDestination(input.provider, staging, stagedExecutable, destination, executable, releaseVersion, env, signal, false);
      await this.retainPrepared(input.provider, releaseVersion, executable);
      return executable;
    } finally {
      this.activeStaging.delete(resolvedStaging);
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  private async installFromNpm(
    input: { provider: string; version?: string; attemptToken: string },
    policy: NativeProgramPolicy,
    distribution: Extract<NativeProgramPolicy['distribution'], { kind: 'npm' }>,
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<string> {
    const releaseVersion = input.version ?? (await this.latestRelease(input.provider, signal, {
      policies: this.policies,
      platform: this.platform,
      arch: this.arch,
      fetchImpl: this.fetchImpl,
    })).latestVersion;
    if (!isProgramReleaseVersion(releaseVersion) || !isCompatibleProgram(input.provider, releaseVersion, this.policies)) {
      fail('agent_install_version_invalid', '更新版本无效或不在兼容范围内。');
    }

    const packageName = distribution.package.replace(/@[^@]+$/, '');
    const packageSpec = `${packageName}@${releaseVersion}`;
    const destination = this.destination(input.provider, releaseVersion);
    const executable = path.join(destination, distribution.entry);
    const env = await this.probeEnvironment();

    if (await fs.lstat(destination).then(() => true, () => false)) {
      if ((await fs.lstat(destination)).isSymbolicLink() || !this.isManaged(input.provider, await fs.realpath(executable))) {
        fail('agent_install_existing_invalid', '独立安装目录不能引用外部程序。');
      }
      const installed = JSON.parse(await fs.readFile(path.join(destination, 'node_modules', packageName, 'package.json'), 'utf8'));
      const version = await inspectVersion(executable, env, signal);
      if (
        installed.name === packageName
        && installed.version === releaseVersion
        && isCompatibleProgram(input.provider, version, this.policies)
        && (Boolean(distribution.allowIndependentBinaryVersion) || version === releaseVersion)
      ) {
        await this.retainPrepared(input.provider, releaseVersion, executable);
        return executable;
      }
      fail('agent_install_existing_invalid', '已有受管程序需要检查；不会覆盖该目录。');
    }

    signal.throwIfAborted();
    const parent = path.dirname(destination);
    const staging = await this.createStagingDirectory(parent, input.attemptToken);
    const resolvedStaging = path.resolve(staging);
    this.activeStaging.add(resolvedStaging);

    try {
      const home = path.join(staging, '.home');
      const temporary = path.join(staging, '.tmp');
      const npmCache = path.join(staging, '.cache', 'npm');
      await privateDirectories(home, temporary, npmCache);
      const installEnv = isolatedEnvironment(
        env,
        home,
        temporary,
        {
          npm_config_cache: npmCache,
          NPM_CONFIG_CACHE: npmCache,
          npm_config_update_notifier: 'false',
          npm_config_registry: 'https://registry.npmjs.org/',
          ...(distribution.installEnv ?? {}),
        },
        path.join(this.root, 'toolchains/cache'),
      );
      let npm: string | undefined;
      try {
        npm = await findExecutable(undefined, ['npm-cli.js', 'npm'], this.environment);
      } catch { /* Try the npm shipped with the current Node runtime. */ }
      if (!npm || (this.platform === 'win32' && !/\.[cm]?js$/i.test(npm))) {
        for (const relative of ['node_modules/npm/bin/npm-cli.js', '../lib/node_modules/npm/bin/npm-cli.js']) {
          const candidate = path.resolve(path.dirname(process.execPath), relative);
          if (await fs.stat(candidate).then(item => item.isFile(), () => false)) {
            npm = await fs.realpath(candidate);
            break;
          }
        }
      }
      if (!npm) fail('agent_install_npm_missing', '独立安装需要 npm。可先安装官方 Node.js 后重新检查。');

      progress(`正在下载并准备 ${packageSpec}，首次准备可能需要几分钟。`);
      try { recordSharedCacheUse(this.root, Date.now(), ['npm-download']); } catch { /* Optional cache observation. */ }
      await installPackage(npm, ['install', '--prefix', staging, '--no-audit', '--no-fund', '--save-exact', '--registry=https://registry.npmjs.org/', packageSpec], installEnv, signal);
      try { recordSharedCacheUse(this.root, Date.now(), ['npm-download']); } catch { /* Optional cache observation. */ }

      progress('下载完成，正在检查程序与兼容版本。');
      const stagedExecutable = path.join(staging, distribution.entry);
      const stagedRelative = path.relative(await fs.realpath(staging), await fs.realpath(stagedExecutable));
      if (!stagedRelative || stagedRelative === '..' || stagedRelative.startsWith('..' + path.sep) || path.isAbsolute(stagedRelative)) {
        fail('agent_install_existing_invalid', '独立程序不能引用安装目录外的文件。');
      }
      const installed = JSON.parse(await fs.readFile(path.join(staging, 'node_modules', packageName, 'package.json'), 'utf8'));
      const version = await inspectVersion(stagedExecutable, env, signal);
      if (
        installed.name !== packageName
        || installed.version !== releaseVersion
        || !isCompatibleProgram(input.provider, version, this.policies)
        || (!distribution.allowIndependentBinaryVersion && version !== releaseVersion)
      ) {
        fail('agent_install_version_mismatch', '下载软件包或程序版本不匹配或不兼容，未启用该程序。');
      }

      signal.throwIfAborted();
      for (const directory of ['.home', '.tmp', '.cache']) {
        await fs.rm(path.join(staging, directory), { recursive: true, force: true });
      }
      await this.shareStagedFiles(staging);
      signal.throwIfAborted();
      await inspectVersion(stagedExecutable, env, signal);

      await this.beforeAtomicSwitch?.({ provider: input.provider, version: releaseVersion, staging, destination });
      signal.throwIfAborted();
      await this.commitStagedDestination(
        input.provider,
        staging,
        stagedExecutable,
        destination,
        executable,
        releaseVersion,
        env,
        signal,
        Boolean(distribution.allowIndependentBinaryVersion),
      );
      await this.retainPrepared(input.provider, releaseVersion, executable);
      return executable;
    } finally {
      this.activeStaging.delete(resolvedStaging);
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}

async function installPackage(executable: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const command = nativeCommand(executable);
  const diagnostics = new ProgramInstallDiagnostics(env);
  const child = spawn(command.command, [...command.prefix, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  child.stdout.on('data', chunk => diagnostics.append('stdout', chunk));
  child.stderr.on('data', chunk => diagnostics.append('stderr', chunk));
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const force = () => {
    if (process.platform !== 'win32' && child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Own process group is gone. */ }
    }
  };
  const terminate = () => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn(path.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.on('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Own group already exited. */ }
    }
    forceTimer ??= setTimeout(force, 2000);
  };
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; terminate(); }, 10 * 60_000);
  timer.unref();
  signal.addEventListener('abort', terminate, { once: true });
  if (signal.aborted) terminate();
  try {
    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      // close follows stdio draining, so a final error fragment is not lost after exit.
      child.once('close', (status, signal) => resolve({ status, signal }));
      child.once('error', (error: NodeJS.ErrnoException) => reject(new AgentServiceError('agent_install_start_failed', diagnostics.startFailure(error))));
    });
    signal.throwIfAborted();
    if (timedOut) fail('agent_install_timeout', diagnostics.failure(result.status, result.signal, true));
    if (result.status !== 0) fail('agent_install_failed', diagnostics.failure(result.status, result.signal));
  } finally {
    if (signal.aborted || timedOut) force();
    clearTimeout(forceTimer);
    clearTimeout(timer);
    signal.removeEventListener('abort', terminate);
  }
}
