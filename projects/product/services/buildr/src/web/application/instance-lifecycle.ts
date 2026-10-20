import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type http from 'node:http';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import { assertLauncherWebProfile, resolveWebProfile, sameWebProfile } from '../../modules/installation/contracts/web-profile.ts';
import { developmentInstanceMatchesInstallation } from '../../modules/installation/module.ts';
import {
  clearBuildrWebInstance,
  acquireBuildrWebStartLock,
  healthyBuildrWebInstance,
  matchesNpmLauncherBinding,
  npmLauncherInstanceDisposition,
  openDefaultBrowser,
  readBuildrWebInstance,
  requestBuildrWebInstanceShutdown,
  releaseBuildrWebStartLock,
  waitForBuildrWebInstance,
  waitForBuildrWebInstanceExit,
  writeBuildrWebInstance,
  readLauncherIdentityFromEnvironment,
  buildrWebInstanceObservationDigest,
  sameNpmProductIdentity,
  assertUpdateHandoffInstanceAddress,
  buildrWebInstancePath,
} from '../infrastructure/instance-runtime.ts';
import {
  listPreviews,
  readPreviewIdentityFromEnvironment,
  resolveTaskPreviewWorktree,
  startPreview,
  stopPreview,
  type PreviewOwner,
  type PreviewRuntime,
} from './preview-lifecycle.ts';

type ProductIdentity = {
  protocolIdentity: string;
  channel?: string;
  runtime?: { role?: string };
  [key: string]: unknown;
};
type LauncherIdentity = { protocolIdentity?: string; protocolVersion?: number; [key: string]: unknown };
type WebProfile = {
  schemaVersion: string;
  profile: string;
  channel: string;
  runtimeRole: string;
  dataRoot: string;
  identity: string;
  [key: string]: unknown;
};
type WebInstance = {
  url: string;
  secret: string;
  pid: number;
  launcherIdentity: LauncherIdentity | null;
  productIdentity: ProductIdentity | null;
  webProfile: WebProfile | null;
  [key: string]: unknown;
};
type LauncherBinding = LauncherIdentity & {
  webPort: { preferred: number };
  bindingIdentity?: string;
};
type StartLock = { file: string; owner: boolean };
type ServerReady = { url: string; initialWorkspaceId: string | null };
type ServerInstance = { server: http.Server; ready: Promise<ServerReady>; shutdown?: () => Promise<void> };
type ServerOptions = {
  port: number;
  instanceSecret: string;
  launcherIdentity: LauncherIdentity | null;
  productIdentity: ProductIdentity;
  webProfile: WebProfile;
  previewIdentity: PreviewOwner | null;
  httpContributions: unknown[];
  ensureRegisteredTarget(root: string | null): string | null;
  resolveRegisteredWorkspace?: (workspaceId: string, options: { touch: boolean }) => { rootPath: string };
  onShutdown(cleanupError?: unknown): void;
  beforeShutdown?: () => Promise<void>;
};
type WebRuntime = PreviewRuntime & {
  prepareWorkspaceStructuredStore(root: string): unknown;
  __bootstrapContributions?(kind: string): unknown[];
  startBuildrWeb(args: string[]): Promise<unknown>;
  manageBuildrWebPreview(action: string, args: string[]): Promise<unknown>;
};
export type WebInstanceLifecycleRuntime = WebRuntime;
export type WebLifecycleOptions = {
  httpContributions?: unknown[];
  closeResources?: () => Promise<void>;
  createLocalWorkspaceServer(runtime: WebRuntime, options: ServerOptions): ServerInstance;
  ensureRegisteredTarget(root: string | null): string | null;
  resolveRegisteredWorkspace?: (workspaceId: string, options: { touch: boolean }) => { rootPath: string };
  readProductIdentity(): ProductIdentity;
  assertNpmLauncherBinding(file: string, productIdentity: ProductIdentity): LauncherBinding;
  assertNpmUpdateHandoffTarget?(instance: WebInstance): unknown;
};

type BuildrError = Error & { code?: string; status?: number; details?: unknown };
type InstanceDisposition = { disposition: string; code: string | null };

const resolveProfile: (identity: ProductIdentity, options?: { dataRoot?: string }) => WebProfile = resolveWebProfile;
const profilesMatch: (left: WebProfile | null, right: WebProfile) => boolean = sameWebProfile;
const assertProfile: (launcher: LauncherIdentity | null, profile: WebProfile, options: { productIdentity: ProductIdentity; productRoot: string }) => void = assertLauncherWebProfile;
const readInstance = (profile?: WebProfile): WebInstance | null => Reflect.apply(readBuildrWebInstance, undefined, [profile]);
const healthyInstance: (instance: WebInstance | null, options?: { strictIdentity: boolean }) => Promise<WebInstance | null> = healthyBuildrWebInstance;
const acquireLock = (profile: WebProfile): StartLock => Reflect.apply(acquireBuildrWebStartLock, undefined, [profile]);
const releaseLock: (lock: StartLock | null) => void = releaseBuildrWebStartLock;
const clearInstance = (expected: WebInstance | null, profile: WebProfile): boolean => Reflect.apply(clearBuildrWebInstance, undefined, [expected, profile]);
const instanceDisposition: (instance: WebInstance, binding: LauncherBinding) => InstanceDisposition = npmLauncherInstanceDisposition;
const matchesBinding: (instance: WebInstance, binding: LauncherBinding) => boolean = matchesNpmLauncherBinding;
const shutdownInstance: (instance: WebInstance) => Promise<unknown> = requestBuildrWebInstanceShutdown;
const waitForExit: (instance: WebInstance, options: { profile: WebProfile; attempts?: number; intervalMs?: number }) => Promise<{ status: string }> = waitForBuildrWebInstanceExit;
const waitForInstance = (options: { profile: WebProfile; match: ((instance: WebInstance) => boolean) | null; attempts?: number; intervalMs?: number }): Promise<WebInstance | null> => Reflect.apply(waitForBuildrWebInstance, undefined, [options]);
const writeInstance: (runtime: WebRuntime, instance: WebInstance) => string = writeBuildrWebInstance;
const launcherFromEnvironment: () => LauncherIdentity | null = readLauncherIdentityFromEnvironment;
const openBrowser: (url: string) => void = openDefaultBrowser;

function errorDetails(error: unknown): BuildrError {
  return error instanceof Error ? error : new Error(String(error));
}

function codedError(message: string, code: string, status?: number, details?: unknown): BuildrError {
  return Object.assign(new Error(message), { code, status, details });
}

// Launcher handoff waits for an old instance to exit and a concurrent one to
// become healthy. The local default is intentionally tight (2s) so a real hang
// surfaces fast with a clear error; loaded CI runners need a larger budget for
// the same graceful shutdown, so widen only there (or via explicit override).
const HANDOFF_WAIT_INTERVAL_MS = 50;
const HANDOFF_WAIT_LOCAL_ATTEMPTS = 40;
const HANDOFF_WAIT_CI_ATTEMPTS = 1200;
const HANDOFF_WAIT_OVERRIDE_ENV = 'BUILDR_LAUNCHER_HANDOFF_WAIT_MS';

export function handoffWaitBudget(env: Record<string, string | undefined> = process.env): { attempts: number; intervalMs: number } {
  const raw = env[HANDOFF_WAIT_OVERRIDE_ENV];
  const overrideMs = raw === undefined || raw === '' ? Number.NaN : Number(raw);
  if (Number.isFinite(overrideMs) && overrideMs > 0) {
    return { attempts: Math.max(1, Math.ceil(overrideMs / HANDOFF_WAIT_INTERVAL_MS)), intervalMs: HANDOFF_WAIT_INTERVAL_MS };
  }
  return { attempts: env.CI ? HANDOFF_WAIT_CI_ATTEMPTS : HANDOFF_WAIT_LOCAL_ATTEMPTS, intervalMs: HANDOFF_WAIT_INTERVAL_MS };
}

export function prepareTaskPreviewStructuredStore(runtime: Pick<WebRuntime, 'prepareWorkspaceStructuredStore'>, targetRoot: string | null, previewIdentity: PreviewOwner | null): void {
  if (previewIdentity?.taskStore && previewIdentity.identityMode === 'task-worktree-v1' && targetRoot
    && fs.realpathSync(targetRoot) === fs.realpathSync(previewIdentity.worktree)
    && previewIdentity.workspaceRoot && fs.realpathSync(previewIdentity.workspaceRoot) !== fs.realpathSync(targetRoot)) {
    runtime.prepareWorkspaceStructuredStore(targetRoot);
  }
}

export function registerWebInstanceLifecycle(runtime: WebRuntime, options: WebLifecycleOptions): WebRuntime {
  const httpContributions = options.httpContributions || runtime.__bootstrapContributions?.('http') || [];

  async function startBuildrWeb(args: string[]): Promise<unknown> {
    runtime.assertNoUnknownOptions(args, new Set(['--target', '--port', '--no-open', '--launcher-binding', '--update-handoff', '--restart']), new Set(['--no-open']));
    const updateObservation = runtime.optionValue(args, '--update-handoff', null);
    const restartObservation = runtime.optionValue(args, '--restart', null);
    const observationPattern = /^sha256-[a-f0-9]{64}$/;
    if (args.includes('--update-handoff') && (typeof updateObservation !== 'string' || !observationPattern.test(updateObservation) || args.includes('--target') || args.includes('--restart'))) throw new Error('更新交接需要准确的实例观察摘要，且不能改变工作空间登记。');
    if (args.includes('--restart') && (typeof restartObservation !== 'string' || !observationPattern.test(restartObservation) || args.includes('--target'))) throw new Error('同身份重启需要准确的实例观察摘要，且不能改变工作空间登记。');
    const handoffObservation = updateObservation || restartObservation;
    const handoffMode: 'update' | 'restart' | null = updateObservation ? 'update' : restartObservation ? 'restart' : null;
    const observeInstance = async (instance: WebInstance | null): Promise<WebInstance | null> => {
      if (handoffObservation && instance) {
        assertUpdateHandoffInstanceAddress(instance);
        if (!profilesMatch(instance.webProfile, webProfile)) throw codedError('交接实例属于其他网页配置范围，已保留现场。', 'web_update_profile_conflict');
      }
      const ready = await healthyInstance(instance, { strictIdentity: Boolean(handoffObservation) });
      return handoffObservation && instance && ready && buildrWebInstanceObservationDigest(ready) !== buildrWebInstanceObservationDigest(instance) ? null : ready;
    };
    const targetValue = runtime.optionValue(args, '--target', null);
    const targetRoot = targetValue ? path.resolve(targetValue) : null;
    const rawPort = runtime.optionValue(args, '--port', '0') || '0';
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
    const launcherBindingPath = runtime.optionValue(args, '--launcher-binding', null);
    if (launcherBindingPath && args.includes('--port') && !handoffObservation) throw new Error('--port cannot be combined with --launcher-binding; the npm Launcher binding owns its port policy.');
    const noOpen = Boolean(handoffObservation) || args.includes('--no-open') || Boolean(launcherBindingPath && process.env.BUILDR_LAUNCHER_NO_OPEN === '1');
    const productIdentity = options.readProductIdentity();
    const npmLauncherBinding = launcherBindingPath ? options.assertNpmLauncherBinding(path.resolve(launcherBindingPath), productIdentity) : null;
    const launcherIdentity = npmLauncherBinding || (handoffObservation ? null : launcherFromEnvironment());
    const previewIdentity = handoffObservation ? null : readPreviewIdentityFromEnvironment();
    const webProfile = resolveProfile(productIdentity);
    const handoffWait = handoffWaitBudget();
    assertProfile(launcherIdentity, webProfile, { productIdentity, productRoot: runtime.productRoot() });
    if (handoffMode === 'update' && (productIdentity.channel !== 'npm' || productIdentity.runtime?.role !== 'host')) throw codedError('更新交接只适用于 npm 安装。', 'web_update_channel_conflict');
    prepareTaskPreviewStructuredStore(runtime, targetRoot, previewIdentity);
    const initialWorkspaceId = targetRoot ? options.ensureRegisteredTarget(targetRoot) : null;

    const assertCompatibleInstance = (healthy: WebInstance): WebInstance => {
      let observedProfile = healthy.webProfile;
      if (!observedProfile && healthy.productIdentity) {
        try { observedProfile = resolveProfile(healthy.productIdentity, { dataRoot: webProfile.dataRoot }); } catch { observedProfile = null; }
      }
      if (!profilesMatch(observedProfile, webProfile)) {
        throw codedError(`当前Data Root中的健康Buildr Web属于另一产品身份；请先通过旧实例公开退出动作停止，再启动${webProfile.profile}实例。`, 'web_instance_profile_conflict', 409, { expected: webProfile, actual: observedProfile });
      }
      const healthyProtocol = healthy.productIdentity?.protocolIdentity
        || healthy.launcherIdentity?.protocolIdentity
        || (healthy.launcherIdentity?.protocolVersion ? `buildr.web-protocol/v${healthy.launcherIdentity.protocolVersion}` : null);
      if (healthyProtocol && productIdentity.protocolIdentity !== healthyProtocol) throw new Error(`已运行 Buildr Web protocol ${healthyProtocol} 与当前产品 ${productIdentity.protocolIdentity} 不兼容，请先退出旧实例。`);
      const launcherProtocol = launcherIdentity?.protocolIdentity || (launcherIdentity?.protocolVersion ? `buildr.web-protocol/v${launcherIdentity.protocolVersion}` : null);
      const healthyLauncherProtocol = healthy.launcherIdentity?.protocolIdentity || (healthy.launcherIdentity?.protocolVersion ? `buildr.web-protocol/v${healthy.launcherIdentity.protocolVersion}` : null);
      if (launcherProtocol && healthyLauncherProtocol && launcherProtocol !== healthyLauncherProtocol) throw new Error(`已运行 Buildr Web protocol ${healthyLauncherProtocol} 与当前 Launcher ${launcherProtocol} 不兼容，请先退出旧实例。`);
      if (webProfile.profile === 'development' && developmentInstanceMatchesInstallation(productIdentity, healthy.productIdentity) !== true) {
        throw codedError('正在运行的 Buildr 开发版与当前来源不同，或旧记录缺少来源证明；请通过现有 Buildr 入口正常退出旧实例，再重新启动。', 'web_instance_development_source_conflict', 409, {
          expectedInstallationIdentity: productIdentity.installationIdentity || null,
          runningInstallationIdentity: healthy.productIdentity?.installationIdentity || null,
        });
      }
      return healthy;
    };

    const reuseInstance = (healthy: WebInstance, startLock: StartLock | null = null): { reused: true; url: string } => {
      releaseLock(startLock);
      const pageUrl = initialWorkspaceId ? `${healthy.url}/workspaces/${initialWorkspaceId}/` : healthy.url;
      if (!noOpen) openBrowser(pageUrl);
      console.log(`Buildr Web 已运行：${pageUrl}`);
      return { reused: true, url: pageUrl };
    };

    const launcherConflict = (disposition: InstanceDisposition, healthy: WebInstance): BuildrError => codedError(
      '已运行 Buildr Web 无法证明由当前 npm Launcher 安全接管；请先通过现有实例的公开退出动作停止，再重试 Launcher。',
      disposition.code || 'launcher_handoff_ownership_conflict',
      409,
      { pid: healthy.pid, disposition: disposition.disposition },
    );

    const matchesHandoffOwner = (instance: WebInstance, ownState: WebInstance | null = null): boolean => {
      if (handoffMode === 'restart') {
        // Same-identity takeover: the successor is identified only by its exact
        // own receipt observation; update-specific npm assertions do not apply.
        return Boolean(ownState?.pid === process.pid && instance.pid === process.pid
          && profilesMatch(instance.webProfile, webProfile)
          && buildrWebInstanceObservationDigest(instance) === buildrWebInstanceObservationDigest(ownState));
      }
      if (!profilesMatch(instance.webProfile, webProfile) || !sameNpmProductIdentity(instance.productIdentity, productIdentity)) return false;
      if (ownState?.pid === process.pid && instance.pid === process.pid && buildrWebInstanceObservationDigest(instance) === buildrWebInstanceObservationDigest(ownState)) return true;
      if (!options.assertNpmUpdateHandoffTarget) throw codedError('更新交接缺少安装归属核验能力。', 'web_update_ownership_port_unavailable');
      options.assertNpmUpdateHandoffTarget(instance);
      return true;
    };
    const assertHandoffTarget = (instance: WebInstance): void => {
      assertUpdateHandoffInstanceAddress(instance);
      if (buildrWebInstanceObservationDigest(instance) !== handoffObservation) throw codedError('交接期间实例已变化，未停止后来出现的实例。', 'web_update_instance_changed');
      if (handoffMode === 'update') {
        if (!options.assertNpmUpdateHandoffTarget) throw codedError('更新交接缺少安装归属核验能力。', 'web_update_ownership_port_unavailable');
        options.assertNpmUpdateHandoffTarget(instance);
      }
    };

    const recorded = readInstance(webProfile);
    if (handoffObservation && !recorded && fs.existsSync(buildrWebInstancePath(webProfile))) throw codedError('交接实例记录无法解析，已保留现场。', 'web_update_instance_invalid');
    if (handoffObservation && recorded) assertUpdateHandoffInstanceAddress(recorded);
    const healthy = await observeInstance(recorded);
    if (healthy) {
      assertCompatibleInstance(healthy);
      if (handoffObservation) {
        if (matchesHandoffOwner(healthy)) return reuseInstance(healthy);
        assertHandoffTarget(healthy);
      } else {
        if (!npmLauncherBinding) return reuseInstance(healthy);
        const disposition = instanceDisposition(healthy, npmLauncherBinding);
        if (disposition.disposition === 'reuse') return reuseInstance(healthy);
      }
    } else if (handoffObservation && recorded) {
      throw codedError('交接无法确认旧实例健康，已保留实例记录。', 'web_update_instance_unconfirmed');
    }
    if (recorded?.webProfile && !profilesMatch(recorded.webProfile, webProfile)) {
      throw codedError('当前Data Root中的Buildr Web receipt属于另一产品身份，已保留现场；请先确认并退出旧实例。', 'web_instance_profile_conflict', 409, { expected: webProfile, actual: recorded.webProfile });
    }

    let startLock = acquireLock(webProfile);
    if (!startLock.owner) {
      let started: WebInstance | null = null;
      if (npmLauncherBinding || handoffObservation) {
        // The lock may still belong to a CLI that has published its receipt.
        // After it releases, one waiting Launcher must become the handoff owner.
        for (let attempt = 0; attempt < handoffWait.attempts; attempt += 1) {
          const observed = await observeInstance(readInstance(webProfile));
          if (observed && (handoffObservation ? matchesHandoffOwner(observed) : matchesBinding(observed, npmLauncherBinding!))) {
            started = observed;
            break;
          }
          startLock = acquireLock(webProfile);
          if (startLock.owner) break;
          await new Promise<void>((resolve) => setTimeout(resolve, handoffWait.intervalMs));
        }
      } else {
        started = await waitForInstance({ profile: webProfile, match: null, ...handoffWait });
      }
      if (started) {
        assertCompatibleInstance(started);
        return reuseInstance(started);
      }
      if (!startLock.owner) throw codedError(npmLauncherBinding ? '并发 Launcher 没有在预期时间内启动当前 binding 的健康 Buildr Web；未把旧实例视为托管成功。' : '另一个 Buildr 启动进程没有在预期时间内就绪，请稍后重试。', npmLauncherBinding ? 'launcher_handoff_concurrent_wait_timeout' : 'web_start_wait_timeout');
    }

    const secret = crypto.randomBytes(32).toString('hex');
    let state: WebInstance | null = null;
    let instance: ServerInstance | null = null;
    let fallbackPort: number | null = null;
    try {
      const currentRecorded = readInstance(webProfile);
      if (handoffObservation && !currentRecorded && fs.existsSync(buildrWebInstancePath(webProfile))) throw codedError('启动锁内实例记录无法解析，已保留现场。', 'web_update_instance_invalid');
      const currentHealthy = await observeInstance(currentRecorded);
      if (currentHealthy) {
        assertCompatibleInstance(currentHealthy);
        if (handoffObservation) {
          if (matchesHandoffOwner(currentHealthy)) return reuseInstance(currentHealthy, startLock);
          assertHandoffTarget(currentHealthy);
        } else {
          if (!npmLauncherBinding) return reuseInstance(currentHealthy, startLock);
          const disposition = instanceDisposition(currentHealthy, npmLauncherBinding);
          if (disposition.disposition === 'reuse') return reuseInstance(currentHealthy, startLock);
          if (!['handoff-cli', 'handoff-launcher'].includes(disposition.disposition)) throw launcherConflict(disposition, currentHealthy);
        }
        await shutdownInstance(currentHealthy);
        const exit = await waitForExit(currentHealthy, { profile: webProfile, ...handoffWait });
        if (exit.status !== 'exited') throw codedError(
          exit.status === 'replaced' ? 'Launcher 交接期间实例 receipt 被另一实例替换，已保留现场并停止启动。' : '旧 Buildr Web 未在预期时间内完成认证退出，已保留现场并停止启动。',
          exit.status === 'replaced' ? 'launcher_handoff_receipt_replaced' : 'launcher_handoff_shutdown_timeout',
          undefined,
          { pid: currentHealthy.pid, status: exit.status },
        );
      } else if (handoffObservation && currentRecorded) {
        throw codedError('启动锁内无法确认旧实例健康，未清理其他实例记录。', 'web_update_instance_unconfirmed');
      } else if (currentRecorded?.webProfile && !profilesMatch(currentRecorded.webProfile, webProfile)) {
        throw codedError('当前Data Root中的Buildr Web receipt属于另一产品身份，已保留现场；请先确认并退出旧实例。', 'web_instance_profile_conflict', 409, { expected: webProfile, actual: currentRecorded.webProfile });
      } else if (currentRecorded) clearInstance(currentRecorded, webProfile);

      const preferredPort = handoffObservation ? port : npmLauncherBinding ? npmLauncherBinding.webPort.preferred : port;
      const attempts = (npmLauncherBinding || handoffObservation) && preferredPort > 0 ? [preferredPort, 0] : [preferredPort];
      let ready: ServerReady | null = null;
      for (const [attemptIndex, attemptPort] of attempts.entries()) {
        try {
          instance = options.createLocalWorkspaceServer(runtime, {
            port: attemptPort,
            instanceSecret: secret,
            launcherIdentity,
            productIdentity,
            webProfile,
            previewIdentity,
            httpContributions,
            ensureRegisteredTarget: options.ensureRegisteredTarget,
            resolveRegisteredWorkspace: options.resolveRegisteredWorkspace,
            beforeShutdown: options.closeResources,
            onShutdown: (cleanupError?: unknown) => {
              if (state) clearInstance(state, webProfile);
              if (cleanupError) {
                console.error('Buildr Web owned resources did not confirm shutdown:', errorDetails(cleanupError).message);
                process.exit(1);
              }
              if (previewIdentity) process.exit(0);
            },
          });
          ready = await instance.ready;
          break;
        } catch (error) {
          instance?.server.close();
          instance = null;
          const details = errorDetails(error);
          const canFallback = attemptIndex === 0 && attempts.length === 2 && details.code === 'EADDRINUSE';
          if (!canFallback) throw error;
          fallbackPort = preferredPort;
          console.warn(`Buildr Web ${handoffObservation ? '交接原端口' : 'Launcher 首选端口'} ${preferredPort} 已被占用，回退到随机 loopback 端口。`);
        }
      }
      if (!ready || !instance) throw new Error('Buildr Web server did not become ready.');
      state = { url: ready.url, secret, pid: process.pid, launcherIdentity, productIdentity, webProfile };
      writeInstance(runtime, state);
      if (npmLauncherBinding || handoffObservation) {
        const verified = await observeInstance(state);
        if (!verified || (handoffObservation ? !matchesHandoffOwner(verified, state) : !matchesBinding(verified, npmLauncherBinding!))) throw codedError('新 Buildr Web health 未返回当前安装身份，已停止启动。', 'launcher_handoff_readiness_identity_mismatch');
      }
      const cleanupReceipt = (): void => { if (state) clearInstance(state, webProfile); };
      const closeForSignal = (): void => {
        void (async () => {
          cleanupReceipt();
          if (instance?.shutdown) await instance.shutdown();
          else await new Promise<void>(resolve => instance?.server.close(() => resolve()));
          process.exit(0);
        })().catch(error => {
          console.error('Buildr Web resource shutdown failed:', error);
          process.exit(1);
        });
      };
      const signalNames: NodeJS.Signals[] = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
      const detachLifecycleListeners = (): void => {
        cleanupReceipt();
        process.removeListener('exit', cleanupReceipt);
        for (const signal of signalNames) process.removeListener(signal, closeForSignal);
      };
      process.once('exit', cleanupReceipt);
      for (const signal of signalNames) process.once(signal, closeForSignal);
      instance.server.once('close', detachLifecycleListeners);
      releaseLock(startLock);
      const pageUrl = initialWorkspaceId ? `${ready.url}/workspaces/${initialWorkspaceId}/` : ready.url;
      if (!noOpen) openBrowser(pageUrl);
      if (fallbackPort !== null) console.log(`Buildr Web Launcher 已从端口 ${fallbackPort} 回退，实际地址：${ready.url}`);
      console.log(`Buildr Web：${pageUrl}`);
      console.log('仅限本机访问；关闭浏览器不会退出服务，请在页面中选择“退出 Buildr”。');
      return { ...instance, reused: false, url: pageUrl };
    } catch (error) {
      releaseLock(startLock);
      if (state) clearInstance(state, webProfile);
      instance?.server.close();
      const details = errorDetails(error);
      throw codedError(`Buildr Web 启动失败：${details.message}`, details.code || 'web_start_failed', details.status, details.details);
    }
  }

  async function manageBuildrWebPreview(action: string, args: string[]): Promise<unknown> {
    if (action === 'start') {
      const [name, ...commandOptions] = args;
      if (!name) throw new Error('Usage: buildr web preview start <instance> [--task <task-id> --target <canonical-workspace>] [--port <port>] [--no-open] [--json]');
      const result = await startPreview(runtime, name, commandOptions);
      if (commandOptions.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else console.log(`Buildr Web 开发预览已${result.status === 'reused' ? '复用' : '启动'}：${result.url}\n实例：${result.owner.instance}\nworktree：${result.owner.worktree}\n分支：${result.owner.branch}\nHEAD：${result.owner.head}${result.owner.dirty ? '（有未提交修改）' : ''}${result.owner.taskStore ? `\n任务库：${result.owner.taskStore.seeded ? '已按启动时点从 canonical 播种快照' : '复用工作树本地副本'}` : ''}`);
      return result;
    }
    if (action === 'list') {
      runtime.assertNoUnknownOptions(args, new Set(['--json']), new Set(['--json']));
      const result = await listPreviews();
      if (args.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else if (!result.previews.length) console.log('没有运行中的 Buildr Web 开发预览。');
      else result.previews.forEach((preview) => console.log(`${preview.instance}\t${preview.status}\t${preview.url || '-'}\t${preview.owner.worktree}`));
      return result;
    }
    if (action === 'stop') {
      const [name, ...commandOptions] = args;
      if (!name) throw new Error('Usage: buildr web preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--json]');
      runtime.assertNoUnknownOptions(commandOptions, new Set(['--target', '--task', '--json']), new Set(['--json']));
      const target = runtime.optionValue(commandOptions, '--target', null);
      const taskId = runtime.optionValue(commandOptions, '--task', null);
      let caller = null;
      if (target || taskId) {
        if (!target || !taskId) throw new Error('Task preview stop requires --target and --task together.');
        const context = resolveTaskPreviewWorktree(runtime, fs.realpathSync(path.resolve(target)), taskId);
        caller = { taskId: context.taskId, workspaceRoot: context.workspaceRoot, worktree: context.worktree, worktreeEvidencePath: context.evidencePath, worktreePlanDigest: context.planDigest };
      }
      const result = await stopPreview(name, { caller });
      if (commandOptions.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else console.log(`Buildr Web 开发预览已停止：${result.instance}`);
      return result;
    }
    throw new Error(`未知 preview 操作：${action}`);
  }

  Object.assign(runtime, { startBuildrWeb, manageBuildrWebPreview });
  return runtime;
}
