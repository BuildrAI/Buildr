import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';
import { assertLauncherWebProfile, resolveWebProfile, sameWebProfile } from '../infrastructure/web-profile.mjs';
import {
  clearLocalAppInstance,
  acquireLocalAppStartLock,
  healthyLocalAppInstance,
  matchesNpmLauncherBinding,
  npmLauncherInstanceDisposition,
  openDefaultBrowser,
  readLocalAppInstance,
  requestLocalAppInstanceShutdown,
  releaseLocalAppStartLock,
  waitForLocalAppInstance,
  waitForLocalAppInstanceExit,
  writeLocalAppInstance,
  readLauncherIdentityFromEnvironment,
} from '../infrastructure/instance-runtime.mjs';
import {
  listPreviews,
  readPreviewIdentityFromEnvironment,
  registerLocalAppPreviewResourceProvider,
  startPreview,
  stopPreview,
} from './preview-lifecycle.mjs';
import { createLocalAppScheduledMaintenance } from './scheduled-maintenance.mjs';

export function registerWebInstanceLifecycle(runtime, options = {}) {
  const httpContributions = options.httpContributions || runtime.__bootstrapContributions?.('http') || [];
  const createLocalWorkspaceServer = options.createLocalWorkspaceServer;
  const ensureRegisteredTarget = options.ensureRegisteredTarget;
  if (typeof createLocalWorkspaceServer !== 'function' || typeof ensureRegisteredTarget !== 'function') {
    throw new Error('Web instance lifecycle requires an HTTP Host server factory and target resolver.');
  }
  if (typeof options.readProductIdentity !== 'function' || typeof options.assertNpmLauncherBinding !== 'function') {
    throw new Error('Web instance lifecycle requires the System Installation identity and Launcher binding ports.');
  }
  registerLocalAppPreviewResourceProvider(runtime);
  async function startLocalWorkspaceApp(args) {
    runtime.assertNoUnknownOptions(args, new Set(['--target', '--port', '--no-open', '--launcher-binding']), new Set(['--no-open']));
    const targetValue = runtime.optionValue(args, '--target', null);
    const targetRoot = targetValue ? path.resolve(targetValue) : null;
    const rawPort = runtime.optionValue(args, '--port', '0');
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
    const launcherBindingPath = runtime.optionValue(args, '--launcher-binding', null);
    if (launcherBindingPath && args.includes('--port')) throw new Error('--port cannot be combined with --launcher-binding; the npm Launcher binding owns its port policy.');
    const noOpen = args.includes('--no-open') || (launcherBindingPath && process.env.BUILDR_LAUNCHER_NO_OPEN === '1');
    const productIdentity = options.readProductIdentity();
    const npmLauncherBinding = launcherBindingPath ? options.assertNpmLauncherBinding(path.resolve(launcherBindingPath), productIdentity) : null;
    const launcherIdentity = npmLauncherBinding || readLauncherIdentityFromEnvironment();
    const previewIdentity = readPreviewIdentityFromEnvironment();
    const webProfile = resolveWebProfile(productIdentity);
    assertLauncherWebProfile(launcherIdentity, webProfile, { productIdentity, productRoot: runtime.productRoot() });
    let initialWorkspaceId = null;
    if (targetRoot) initialWorkspaceId = ensureRegisteredTarget(targetRoot);
    const assertCompatibleInstance = (healthy) => {
      let observedProfile = healthy.webProfile;
      if (!observedProfile && healthy.productIdentity) {
        try { observedProfile = resolveWebProfile(healthy.productIdentity, { dataRoot: webProfile.dataRoot }); } catch { observedProfile = null; }
      }
      if (!sameWebProfile(observedProfile, webProfile)) {
        const error = new Error(`当前Data Root中的健康Buildr Web属于另一产品身份；请先通过旧实例公开退出动作停止，再启动${webProfile.profile}实例。`);
        error.code = 'web_instance_profile_conflict';
        error.status = 409;
        error.details = { expected: webProfile, actual: observedProfile };
        throw error;
      }
      const healthyProtocol = healthy.productIdentity?.protocolIdentity
        || (healthy.launcherIdentity?.protocolIdentity ?? (healthy.launcherIdentity?.protocolVersion ? `buildr.web-protocol/v${healthy.launcherIdentity.protocolVersion}` : null));
      if (healthyProtocol && productIdentity.protocolIdentity !== healthyProtocol) {
        throw new Error(`已运行 Buildr Web protocol ${healthyProtocol} 与当前产品 ${productIdentity.protocolIdentity} 不兼容，请先退出旧实例。`);
      }
      const launcherProtocol = launcherIdentity?.protocolIdentity || (launcherIdentity?.protocolVersion ? `buildr.web-protocol/v${launcherIdentity.protocolVersion}` : null);
      const healthyLauncherProtocol = healthy.launcherIdentity?.protocolIdentity || (healthy.launcherIdentity?.protocolVersion ? `buildr.web-protocol/v${healthy.launcherIdentity.protocolVersion}` : null);
      if (launcherProtocol && healthyLauncherProtocol && launcherProtocol !== healthyLauncherProtocol) {
        throw new Error(`已运行 Buildr Web protocol ${healthyLauncherProtocol} 与当前 Launcher ${launcherProtocol} 不兼容，请先退出旧实例。`);
      }
      return healthy;
    };
    const reuseInstance = (healthy, startLock = null) => {
      releaseLocalAppStartLock(startLock);
      const pageUrl = initialWorkspaceId ? `${healthy.url}/workspaces/${initialWorkspaceId}/` : healthy.url;
      if (!noOpen) openDefaultBrowser(pageUrl);
      console.log(`Buildr Web 已运行：${pageUrl}`);
      return { reused: true, url: pageUrl };
    };
    const launcherConflict = (disposition, healthy) => {
      const error = new Error('已运行 Buildr Web 无法证明由当前 npm Launcher 安全接管；请先通过现有实例的公开退出动作停止，再重试 Launcher。');
      error.code = disposition.code || 'launcher_handoff_ownership_conflict';
      error.status = 409;
      error.details = { pid: healthy.pid, disposition: disposition.disposition };
      return error;
    };
    const recorded = readLocalAppInstance(webProfile);
    const healthy = await healthyLocalAppInstance(recorded);
    if (healthy) {
      assertCompatibleInstance(healthy);
      if (!npmLauncherBinding) return reuseInstance(healthy);
      const disposition = npmLauncherInstanceDisposition(healthy, npmLauncherBinding);
      if (disposition.disposition === 'reuse') return reuseInstance(healthy);
    }
    if (recorded?.webProfile && !sameWebProfile(recorded.webProfile, webProfile)) {
      const error = new Error('当前Data Root中的Buildr Web receipt属于另一产品身份，已保留现场；请先确认并退出旧实例。');
      error.code = 'web_instance_profile_conflict';
      error.status = 409;
      error.details = { expected: webProfile, actual: recorded.webProfile };
      throw error;
    }
    const startLock = acquireLocalAppStartLock(webProfile);
    if (!startLock.owner) {
      const started = await waitForLocalAppInstance({
        profile: webProfile,
        match: npmLauncherBinding ? (instanceValue) => matchesNpmLauncherBinding(instanceValue, npmLauncherBinding) : null,
      });
      if (!started) {
        const error = new Error(npmLauncherBinding
          ? '并发 Launcher 没有在预期时间内启动当前 binding 的健康 Buildr Web；未把旧实例视为托管成功。'
          : '另一个 Buildr 启动进程没有在预期时间内就绪，请稍后重试。');
        error.code = npmLauncherBinding ? 'launcher_handoff_concurrent_wait_timeout' : 'web_start_wait_timeout';
        throw error;
      }
      assertCompatibleInstance(started);
      return reuseInstance(started);
    }
    const secret = crypto.randomBytes(32).toString('hex');
    let state = null;
    let instance = null;
    let scheduledMaintenance = null;
    let fallbackPort = null;
    try {
      const currentRecorded = readLocalAppInstance(webProfile);
      const currentHealthy = await healthyLocalAppInstance(currentRecorded);
      if (currentHealthy) {
        assertCompatibleInstance(currentHealthy);
        if (!npmLauncherBinding) return reuseInstance(currentHealthy, startLock);
        const disposition = npmLauncherInstanceDisposition(currentHealthy, npmLauncherBinding);
        if (disposition.disposition === 'reuse') return reuseInstance(currentHealthy, startLock);
        if (!['handoff-cli', 'handoff-launcher'].includes(disposition.disposition)) {
          throw launcherConflict(disposition, currentHealthy);
        }
        await requestLocalAppInstanceShutdown(currentHealthy);
        const exit = await waitForLocalAppInstanceExit(currentHealthy, { profile: webProfile });
        if (exit.status !== 'exited') {
          const error = new Error(exit.status === 'replaced'
            ? 'Launcher 交接期间实例 receipt 被另一实例替换，已保留现场并停止启动。'
            : '旧 Buildr Web 未在预期时间内完成认证退出，已保留现场并停止启动。');
          error.code = exit.status === 'replaced' ? 'launcher_handoff_receipt_replaced' : 'launcher_handoff_shutdown_timeout';
          error.details = { pid: currentHealthy.pid, status: exit.status };
          throw error;
        }
      } else if (currentRecorded?.webProfile && !sameWebProfile(currentRecorded.webProfile, webProfile)) {
        const error = new Error('当前Data Root中的Buildr Web receipt属于另一产品身份，已保留现场；请先确认并退出旧实例。');
        error.code = 'web_instance_profile_conflict';
        error.status = 409;
        error.details = { expected: webProfile, actual: currentRecorded.webProfile };
        throw error;
      } else if (currentRecorded) {
        clearLocalAppInstance(currentRecorded, webProfile);
      }
      const preferredPort = npmLauncherBinding ? npmLauncherBinding.webPort.preferred : port;
      const attempts = npmLauncherBinding && preferredPort > 0 ? [preferredPort, 0] : [preferredPort];
      let ready = null;
      for (const [attemptIndex, attemptPort] of attempts.entries()) {
        try {
          instance = createLocalWorkspaceServer(runtime, {
            port: attemptPort,
            instanceSecret: secret,
            launcherIdentity,
            productIdentity,
            webProfile,
            previewIdentity,
            httpContributions,
            ensureRegisteredTarget,
            onShutdown: () => {
              if (state) clearLocalAppInstance(state, webProfile);
              if (previewIdentity) process.exit(0);
            },
          });
          ready = await instance.ready;
          if (!previewIdentity) {
            scheduledMaintenance = (options.scheduledMaintenanceFactory || createLocalAppScheduledMaintenance)(runtime);
            scheduledMaintenance.start();
            instance.server.once('close', () => scheduledMaintenance?.stop());
          }
          break;
        } catch (error) {
          instance?.server.close();
          instance = null;
          const canFallback = attemptIndex === 0 && attempts.length === 2 && error.code === 'EADDRINUSE';
          if (!canFallback) throw error;
          fallbackPort = preferredPort;
          console.warn(`Buildr Web Launcher 首选端口 ${preferredPort} 已被占用，回退到随机 loopback 端口。`);
        }
      }
      if (!ready || !instance) throw new Error('Buildr Web server did not become ready.');
      state = { url: ready.url, secret, pid: process.pid, launcherIdentity, productIdentity, webProfile };
      writeLocalAppInstance(runtime, state);
      if (npmLauncherBinding) {
        const verified = await healthyLocalAppInstance(state);
        if (!verified || !matchesNpmLauncherBinding(verified, npmLauncherBinding)) {
          const error = new Error('新 Buildr Web health 未返回当前 Launcher binding identity，已停止启动。');
          error.code = 'launcher_handoff_readiness_identity_mismatch';
          throw error;
        }
      }
      const cleanupReceipt = () => { clearLocalAppInstance(state, webProfile); };
      const closeForSignal = () => {
        cleanupReceipt();
        instance.server.close(() => process.exit(0));
      };
      const signalNames = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
      const detachLifecycleListeners = () => {
        cleanupReceipt();
        process.removeListener('exit', cleanupReceipt);
        for (const signal of signalNames) process.removeListener(signal, closeForSignal);
      };
      process.once('exit', cleanupReceipt);
      for (const signal of signalNames) process.once(signal, closeForSignal);
      instance.server.once('close', detachLifecycleListeners);
      releaseLocalAppStartLock(startLock);
      const pageUrl = initialWorkspaceId ? `${ready.url}/workspaces/${initialWorkspaceId}/` : ready.url;
      if (!noOpen) openDefaultBrowser(pageUrl);
      if (fallbackPort !== null) console.log(`Buildr Web Launcher 已从端口 ${fallbackPort} 回退，实际地址：${ready.url}`);
      console.log(`Buildr Web：${pageUrl}`);
      console.log('仅限本机访问；关闭浏览器不会退出服务，请在页面中选择“退出 Buildr”。');
      return { ...instance, reused: false, url: pageUrl };
    } catch (error) {
      releaseLocalAppStartLock(startLock);
      if (state) clearLocalAppInstance(state, webProfile);
      instance?.server.close();
      scheduledMaintenance?.stop();
      const wrapped = new Error(`Buildr Web 启动失败：${error.message}`, { cause: error });
      wrapped.code = error.code || 'web_start_failed';
      wrapped.status = error.status;
      wrapped.details = error.details;
      throw wrapped;
    }
  }

  async function manageLocalAppPreview(action, args) {
    if (action === 'start') {
      const [name, ...options] = args;
      if (!name) throw new Error('Usage: buildr web preview start <instance> [--task <task-id> --target <canonical-workspace>] [--port <port>] [--no-open] [--json]');
      const result = await startPreview(runtime, name, options);
      if (options.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
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
      const [name, ...options] = args;
      if (!name) throw new Error('Usage: buildr web preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--json]');
      runtime.assertNoUnknownOptions(options, new Set(['--target', '--task', '--json']), new Set(['--json']));
      const target = runtime.optionValue(options, '--target', null);
      const taskId = runtime.optionValue(options, '--task', null);
      let caller = null;
      let environmentResource = null;
      if (target || taskId) {
        if (!target || !taskId) throw new Error('Task preview stop requires --target and --task together.');
        const workspaceRoot = path.resolve(target);
        const context = runtime.resolveTaskEnvironmentExecution(workspaceRoot, taskId);
        if (!context?.ready) throw new Error(context?.blocked?.message || 'Task preview stop requires a ready Task Environment.');
        runtime.assertTaskEnvironmentController(workspaceRoot, taskId);
        environmentResource = context.resources.find((resource) => resource.provider === 'local-app-preview' && resource.handle?.instance === name && resource.status !== 'released');
        if (!environmentResource) { const error = new Error(`Environment 没有 matching preview resource：${name}。`); error.code = 'preview_environment_resource_missing'; throw error; }
        caller = {
          taskId,
          workspaceRoot: context.workspaceRoot,
          environmentRoot: context.validationRoot,
          resourceId: environmentResource.id,
          resourceProvider: environmentResource.provider,
          resourceHandle: environmentResource.handle,
          resourceProviderIdentity: environmentResource.identity.providerIdentity,
        };
      }
      const result = await stopPreview(name, { caller, retainOwner: Boolean(environmentResource) });
      if (environmentResource) {
        result.environmentResource = runtime.releaseTaskEnvironmentResource(path.resolve(target), taskId, { id: environmentResource.id, provider: 'local-app-preview', probe: { status: 'blocked', identity: environmentResource.identity.providerIdentity, observedAt: new Date().toISOString(), diagnostic: 'Preview 已由 provider 认证停止。' } }).resource;
        await stopPreview(name, { caller });
      }
      if (options.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else console.log(`Buildr Web 开发预览已停止：${result.instance}`);
      return result;
    }
    throw new Error(`未知 preview 操作：${action}`);
  }

  Object.assign(runtime, { startLocalWorkspaceApp, manageLocalAppPreview });
  return runtime;
}
