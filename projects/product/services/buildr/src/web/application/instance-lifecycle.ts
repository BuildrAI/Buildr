import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type http from 'node:http';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';
import { assertLauncherWebProfile, resolveWebProfile, sameWebProfile } from '../../system/installation/contracts/web-profile.mjs';
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
} from '../infrastructure/instance-runtime.mjs';
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
type ServerInstance = { server: http.Server; ready: Promise<ServerReady> };
type ServerOptions = {
  port: number;
  instanceSecret: string;
  launcherIdentity: LauncherIdentity | null;
  productIdentity: ProductIdentity;
  webProfile: WebProfile;
  previewIdentity: PreviewOwner | null;
  httpContributions: unknown[];
  ensureRegisteredTarget(root: string | null): string | null;
  onShutdown(): void;
};
type WebRuntime = PreviewRuntime & {
  __bootstrapContributions?(kind: string): unknown[];
  startBuildrWeb(args: string[]): Promise<unknown>;
  manageBuildrWebPreview(action: string, args: string[]): Promise<unknown>;
};
export type WebInstanceLifecycleRuntime = WebRuntime;
export type WebLifecycleOptions = {
  httpContributions?: unknown[];
  createLocalWorkspaceServer(runtime: WebRuntime, options: ServerOptions): ServerInstance;
  ensureRegisteredTarget(root: string | null): string | null;
  readProductIdentity(): ProductIdentity;
  assertNpmLauncherBinding(file: string, productIdentity: ProductIdentity): LauncherBinding;
};

type BuildrError = Error & { code?: string; status?: number; details?: unknown };
type InstanceDisposition = { disposition: string; code: string | null };

const resolveProfile: (identity: ProductIdentity, options?: { dataRoot?: string }) => WebProfile = resolveWebProfile;
const profilesMatch: (left: WebProfile | null, right: WebProfile) => boolean = sameWebProfile;
const assertProfile: (launcher: LauncherIdentity | null, profile: WebProfile, options: { productIdentity: ProductIdentity; productRoot: string }) => void = assertLauncherWebProfile;
const readInstance = (profile?: WebProfile): WebInstance | null => Reflect.apply(readBuildrWebInstance, undefined, [profile]);
const healthyInstance: (instance: WebInstance | null) => Promise<WebInstance | null> = healthyBuildrWebInstance;
const acquireLock = (profile: WebProfile): StartLock => Reflect.apply(acquireBuildrWebStartLock, undefined, [profile]);
const releaseLock: (lock: StartLock | null) => void = releaseBuildrWebStartLock;
const clearInstance = (expected: WebInstance | null, profile: WebProfile): boolean => Reflect.apply(clearBuildrWebInstance, undefined, [expected, profile]);
const instanceDisposition: (instance: WebInstance, binding: LauncherBinding) => InstanceDisposition = npmLauncherInstanceDisposition;
const matchesBinding: (instance: WebInstance, binding: LauncherBinding) => boolean = matchesNpmLauncherBinding;
const shutdownInstance: (instance: WebInstance) => Promise<unknown> = requestBuildrWebInstanceShutdown;
const waitForExit: (instance: WebInstance, options: { profile: WebProfile }) => Promise<{ status: string }> = waitForBuildrWebInstanceExit;
const waitForInstance = (options: { profile: WebProfile; match: ((instance: WebInstance) => boolean) | null }): Promise<WebInstance | null> => Reflect.apply(waitForBuildrWebInstance, undefined, [options]);
const writeInstance: (runtime: WebRuntime, instance: WebInstance) => string = writeBuildrWebInstance;
const launcherFromEnvironment: () => LauncherIdentity | null = readLauncherIdentityFromEnvironment;
const openBrowser: (url: string) => void = openDefaultBrowser;

function errorDetails(error: unknown): BuildrError {
  return error instanceof Error ? error : new Error(String(error));
}

function codedError(message: string, code: string, status?: number, details?: unknown): BuildrError {
  return Object.assign(new Error(message), { code, status, details });
}

export function registerWebInstanceLifecycle(runtime: WebRuntime, options: WebLifecycleOptions): WebRuntime {
  const httpContributions = options.httpContributions || runtime.__bootstrapContributions?.('http') || [];

  async function startBuildrWeb(args: string[]): Promise<unknown> {
    runtime.assertNoUnknownOptions(args, new Set(['--target', '--port', '--no-open', '--launcher-binding']), new Set(['--no-open']));
    const targetValue = runtime.optionValue(args, '--target', null);
    const targetRoot = targetValue ? path.resolve(targetValue) : null;
    const rawPort = runtime.optionValue(args, '--port', '0') || '0';
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
    const launcherBindingPath = runtime.optionValue(args, '--launcher-binding', null);
    if (launcherBindingPath && args.includes('--port')) throw new Error('--port cannot be combined with --launcher-binding; the npm Launcher binding owns its port policy.');
    const noOpen = args.includes('--no-open') || Boolean(launcherBindingPath && process.env.BUILDR_LAUNCHER_NO_OPEN === '1');
    const productIdentity = options.readProductIdentity();
    const npmLauncherBinding = launcherBindingPath ? options.assertNpmLauncherBinding(path.resolve(launcherBindingPath), productIdentity) : null;
    const launcherIdentity = npmLauncherBinding || launcherFromEnvironment();
    const previewIdentity = readPreviewIdentityFromEnvironment();
    const webProfile = resolveProfile(productIdentity);
    assertProfile(launcherIdentity, webProfile, { productIdentity, productRoot: runtime.productRoot() });
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

    const recorded = readInstance(webProfile);
    const healthy = await healthyInstance(recorded);
    if (healthy) {
      assertCompatibleInstance(healthy);
      if (!npmLauncherBinding) return reuseInstance(healthy);
      const disposition = instanceDisposition(healthy, npmLauncherBinding);
      if (disposition.disposition === 'reuse') return reuseInstance(healthy);
    }
    if (recorded?.webProfile && !profilesMatch(recorded.webProfile, webProfile)) {
      throw codedError('当前Data Root中的Buildr Web receipt属于另一产品身份，已保留现场；请先确认并退出旧实例。', 'web_instance_profile_conflict', 409, { expected: webProfile, actual: recorded.webProfile });
    }

    const startLock = acquireLock(webProfile);
    if (!startLock.owner) {
      const started = await waitForInstance({ profile: webProfile, match: npmLauncherBinding ? (value) => matchesBinding(value, npmLauncherBinding) : null });
      if (!started) throw codedError(npmLauncherBinding ? '并发 Launcher 没有在预期时间内启动当前 binding 的健康 Buildr Web；未把旧实例视为托管成功。' : '另一个 Buildr 启动进程没有在预期时间内就绪，请稍后重试。', npmLauncherBinding ? 'launcher_handoff_concurrent_wait_timeout' : 'web_start_wait_timeout');
      assertCompatibleInstance(started);
      return reuseInstance(started);
    }

    const secret = crypto.randomBytes(32).toString('hex');
    let state: WebInstance | null = null;
    let instance: ServerInstance | null = null;
    let fallbackPort: number | null = null;
    try {
      const currentRecorded = readInstance(webProfile);
      const currentHealthy = await healthyInstance(currentRecorded);
      if (currentHealthy) {
        assertCompatibleInstance(currentHealthy);
        if (!npmLauncherBinding) return reuseInstance(currentHealthy, startLock);
        const disposition = instanceDisposition(currentHealthy, npmLauncherBinding);
        if (disposition.disposition === 'reuse') return reuseInstance(currentHealthy, startLock);
        if (!['handoff-cli', 'handoff-launcher'].includes(disposition.disposition)) throw launcherConflict(disposition, currentHealthy);
        await shutdownInstance(currentHealthy);
        const exit = await waitForExit(currentHealthy, { profile: webProfile });
        if (exit.status !== 'exited') throw codedError(
          exit.status === 'replaced' ? 'Launcher 交接期间实例 receipt 被另一实例替换，已保留现场并停止启动。' : '旧 Buildr Web 未在预期时间内完成认证退出，已保留现场并停止启动。',
          exit.status === 'replaced' ? 'launcher_handoff_receipt_replaced' : 'launcher_handoff_shutdown_timeout',
          undefined,
          { pid: currentHealthy.pid, status: exit.status },
        );
      } else if (currentRecorded?.webProfile && !profilesMatch(currentRecorded.webProfile, webProfile)) {
        throw codedError('当前Data Root中的Buildr Web receipt属于另一产品身份，已保留现场；请先确认并退出旧实例。', 'web_instance_profile_conflict', 409, { expected: webProfile, actual: currentRecorded.webProfile });
      } else if (currentRecorded) clearInstance(currentRecorded, webProfile);

      const preferredPort = npmLauncherBinding ? npmLauncherBinding.webPort.preferred : port;
      const attempts = npmLauncherBinding && preferredPort > 0 ? [preferredPort, 0] : [preferredPort];
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
            onShutdown: () => {
              if (state) clearInstance(state, webProfile);
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
          console.warn(`Buildr Web Launcher 首选端口 ${preferredPort} 已被占用，回退到随机 loopback 端口。`);
        }
      }
      if (!ready || !instance) throw new Error('Buildr Web server did not become ready.');
      state = { url: ready.url, secret, pid: process.pid, launcherIdentity, productIdentity, webProfile };
      writeInstance(runtime, state);
      if (npmLauncherBinding) {
        const verified = await healthyInstance(state);
        if (!verified || !matchesBinding(verified, npmLauncherBinding)) throw codedError('新 Buildr Web health 未返回当前 Launcher binding identity，已停止启动。', 'launcher_handoff_readiness_identity_mismatch');
      }
      const cleanupReceipt = (): void => { if (state) clearInstance(state, webProfile); };
      const closeForSignal = (): void => { cleanupReceipt(); instance?.server.close(() => process.exit(0)); };
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
      else console.log(`Buildr Web 开发预览已${result.status === 'reused' ? '复用' : '启动'}：${result.url}\n实例：${result.owner.instance}\nworktree：${result.owner.worktree}\n分支：${result.owner.branch}\nHEAD：${result.owner.head}${result.owner.dirty ? '（有未提交修改）' : ''}`);
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
