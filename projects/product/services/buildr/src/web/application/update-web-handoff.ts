import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import type { NpmWebUpdateInput, NpmWebUpdateResult } from '../../modules/installation/module.ts';
import { resolveWebProfile, sameWebProfile } from '../../modules/installation/contracts/web-profile.ts';
import {
  assertUpdateHandoffInstanceAddress, buildrWebInstanceObservationDigest, buildrWebInstancePath,
  healthyBuildrWebInstance, readBuildrWebInstance, sameNpmProductIdentity,
} from '../infrastructure/instance-runtime.ts';
import { openWebHandoffSuccessorLog, releaseWebHandoffSuccessorLog } from './web-handoff-successor-log.ts';

type HandoffDependencies = {
  readNpmUpdateHandoffInstallation(input: NpmWebUpdateInput): any;
  assertNpmUpdateHandoffTarget(instance: any, options?: any): unknown;
  assertNpmLauncherBinding?(file: string, identity: any): any;
  spawnProcess?: typeof spawn;
  openLog?: (file: string) => number;
  readInstance?: typeof readBuildrWebInstance;
  instanceRecordExists?: (profile: ReturnType<typeof resolveWebProfile>) => boolean;
  healthyInstance?: typeof healthyBuildrWebInstance;
  waitMs?: number;
  intervalMs?: number;
};

export function updatedWebEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...environment };
  for (const name of ['BUILDR_INSTALLATION_IDENTITY', 'BUILDR_APPLICATION_PAYLOAD_ROOT', 'BUILDR_NPM_ENTRY_PATH', 'BUILDR_INTERNAL_PRODUCT_REENTRY', 'BUILDR_LOCAL_APP_PREVIEW', 'BUILDR_LAUNCHER_IDENTITY', 'BUILDR_LAUNCHER_NO_OPEN', 'BUILDR_LAUNCHER_NO_NOTIFY']) delete env[name];
  return env;
}

function handoffError(code: string, message: string) { return Object.assign(new Error(message), { code }); }

/** The Web owner starts and observes a new process; installation only invokes this port. */
export async function handoffUpdatedBuildrWeb(input: NpmWebUpdateInput, dependencies: HandoffDependencies): Promise<NpmWebUpdateResult> {
  let previousPid: number | undefined;
  let child: ChildProcess | undefined;
  const read = dependencies.readInstance || readBuildrWebInstance;
  const exists = dependencies.instanceRecordExists || (profile => fs.existsSync(buildrWebInstancePath(profile)));
  const healthy = dependencies.healthyInstance || healthyBuildrWebInstance;
  try {
    const { entry } = dependencies.readNpmUpdateHandoffInstallation(input);
    const identity = { ...entry.origin, installationIdentity: entry.origin.ownershipIdentity, runtime: entry.runtime };
    const profile = resolveWebProfile(identity);
    const recorded = read(profile);
    if (!recorded) {
      if (exists(profile)) throw handoffError('web_update_instance_invalid', '实例记录无法核实，未启动或接管网页。');
      return { status: 'not-running' };
    }
    previousPid = recorded.pid;
    const address = assertUpdateHandoffInstanceAddress(recorded);
    if (!sameWebProfile(recorded.webProfile, profile)) throw handoffError('web_update_profile_conflict', '实例属于其他网页配置范围，已保留现场。');
    const observed = await healthy(recorded, { strictIdentity: true });
    if (!observed || buildrWebInstanceObservationDigest(observed) !== buildrWebInstanceObservationDigest(recorded)) {
      throw handoffError('web_update_instance_unconfirmed', '旧实例的健康身份无法确认，未请求退出。');
    }
    dependencies.assertNpmUpdateHandoffTarget(observed, { productRoot: input.productRoot, productIdentity: identity });
    if (sameNpmProductIdentity(observed.productIdentity, identity)) return { status: 'current', version: identity.version, pid: observed.pid, url: observed.url };
    const args = [entry.entryPath, 'web', '--update-handoff', buildrWebInstanceObservationDigest(observed), '--no-open', '--port', address.port];
    if (observed.launcherIdentity?.bindingPath && dependencies.assertNpmLauncherBinding) {
      try {
        dependencies.assertNpmLauncherBinding(observed.launcherIdentity.bindingPath, identity);
        args.push('--launcher-binding', observed.launcherIdentity.bindingPath);
      } catch { /* A missing or stale desktop binding does not prevent an owned CLI handoff. */ }
    }
    const logFd = openWebHandoffSuccessorLog(profile, `update successor argv=web --update-handoff ${args[3]} --no-open --port ${address.port}`, dependencies.openLog);
    try {
      child = (dependencies.spawnProcess || spawn)(entry.runtime.executable, args, {
        cwd: path.dirname(entry.entryPath), env: updatedWebEnvironment(), detached: true,
        stdio: logFd === null ? ['ignore', 'ignore', 'ignore', 'ipc'] : ['ignore', logFd, logFd, 'ipc'], windowsHide: true,
      });
    } catch (error) {
      if (logFd !== null) try { fs.closeSync(logFd); } catch { /* Best-effort close on synchronous spawn failure. */ }
      throw error;
    }
    releaseWebHandoffSuccessorLog(child, logFd);
    const diagnostic: { failure: { code: string; message: string } | null } = { failure: null };
    child.on('message', (message: any) => {
      if (message?.type === 'buildr.web-update-handoff-failed' && typeof message.code === 'string' && typeof message.message === 'string') {
        diagnostic.failure = { code: message.code.slice(0, 200), message: message.message.slice(0, 4096) };
      }
    });
    child.on('error', error => { diagnostic.failure ||= { code: 'web_update_process_failed', message: error.message }; });
    child.on('exit', (code, signal) => { diagnostic.failure ||= { code: 'web_update_process_failed', message: `新版进程已退出（${signal || code}）。` }; });
    child.channel?.unref();
    child.unref();
    const deadline = Date.now() + (dependencies.waitMs ?? 15_000);
    do {
      const current = read(profile);
      if (current) {
        assertUpdateHandoffInstanceAddress(current);
        if (!sameWebProfile(current.webProfile, profile)) throw handoffError('web_update_profile_conflict', '交接期间出现另一网页配置范围，已保留现场。');
        const ready = await healthy(current, { strictIdentity: true });
        if (ready && sameNpmProductIdentity(ready.productIdentity, identity) && ready.pid === current.pid
            && buildrWebInstanceObservationDigest(ready) === buildrWebInstanceObservationDigest(current)) {
          const exactChild = ready.pid === child.pid && child.exitCode === null && child.signalCode === null && !child.killed && !diagnostic.failure;
          if (!exactChild) dependencies.assertNpmUpdateHandoffTarget(ready, { productRoot: input.productRoot, productIdentity: identity });
          return { status: 'restarted', version: identity.version, pid: ready.pid, url: ready.url, previousPid };
        }
        if (buildrWebInstanceObservationDigest(current) !== buildrWebInstanceObservationDigest(recorded) && !sameNpmProductIdentity(current.productIdentity, identity)) {
          throw handoffError('web_update_instance_changed', '交接期间实例记录已被其他实例替换，未确认新版就绪。');
        }
      } else if (exists(profile)) throw handoffError('web_update_instance_invalid', '交接期间实例记录无法解析，已保留现场。');
      if (diagnostic.failure) throw handoffError(diagnostic.failure.code, diagnostic.failure.message);
      await new Promise(resolve => setTimeout(resolve, dependencies.intervalMs ?? 100));
    } while (Date.now() < deadline);
    throw handoffError('web_update_readiness_timeout', '软件包已更新，但未在预期时间内确认新版网页就绪；再次运行 buildr update 可恢复交接。');
  } catch (error: any) {
    return { status: 'failed', code: error.code || 'web_update_failed', message: error.message, ...(previousPid ? { previousPid } : {}) };
  } finally {
    // The server must outlive an update caller, including one hosted by the old
    // server itself. Disconnect only this diagnostic channel, never the child.
    if (child?.connected) child.disconnect();
    child?.channel?.unref();
    child?.unref();
  }
}
