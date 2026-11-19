import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import { currentProductInvocation, productInvocationArgs } from '../../infrastructure/product-invocation/index.ts';
import { buildrWebInstanceObservationDigest } from '../infrastructure/instance-runtime.ts';
import { updatedWebEnvironment } from './update-web-handoff.ts';
import {
  appendWebHandoffSuccessorLogHeader,
  clearWebHandoffFailureFile,
  createWebHandoffFailureFilePath,
  openWebHandoffSuccessorLog,
  readWebHandoffFailureFile,
  releaseWebHandoffSuccessorLog,
  WEB_HANDOFF_FAILURE_FILE_ENV,
} from './web-handoff-successor-log.ts';
import type { WebRestartFailure } from './restart-control.ts';
import { WEB_RESTART_ATTEMPT_ENV } from '../startup-context.ts';
import { launchDetachedProcess, shouldUsePlatformIsolation } from '../../infrastructure/detached-launch.ts';

type SpawnSuccessorDependencies = {
  spawnProcess?: typeof spawn;
  buildInvocation?: () => { command: string; argsPrefix: string[] };
  environment?: NodeJS.ProcessEnv;
  openLog?: (file: string) => number;
  onSpawned?: (child: ChildProcess) => void;
  attemptToken?: string;
  onFailure?: (error: WebRestartFailure) => void;
};

/**
 * A running default instance launches its same-entry successor for a
 * same-identity restart. The successor re-verifies the recorded instance in
 * the start lock before asking it to quit, so a failed restart leaves the old
 * instance alive. Failures here are logged only: the 202 restart response is
 * already established and the page falls back to timeout/retry.
 */
export function spawnBuildrWebRestartSuccessor(
  state: { url: string; secret: string; pid: number; productIdentity?: unknown; launcherIdentity?: unknown; webProfile?: unknown },
  dependencies: SpawnSuccessorDependencies = {},
): ChildProcess | undefined {
  const observed = buildrWebInstanceObservationDigest(state);
  const port = new URL(state.url).port;
  const [command, argsPrefix] = productInvocationArgs(
    dependencies.buildInvocation ? dependencies.buildInvocation() : currentProductInvocation({ cliPath: process.argv[1] }),
    ['web', '--restart', observed, '--no-open', '--port', port],
  );
  const webProfile = state.webProfile as { dataRoot?: unknown } | null;
  const label = `restart successor argv=web --restart ${observed} --no-open --port ${port}`;
  const env: NodeJS.ProcessEnv = {
    ...updatedWebEnvironment(dependencies.environment),
    ...(dependencies.attemptToken ? { [WEB_RESTART_ATTEMPT_ENV]: dependencies.attemptToken } : {}),
  };
  const report = (code: string, message: string): void => {
    console.error(`Buildr Web restart handoff failed: ${message}`, code !== 'web_restart_process_failed' ? `(${code})` : '');
    dependencies.onFailure?.({ code, message });
  };
  const useIsolated = !dependencies.spawnProcess && shouldUsePlatformIsolation(env) !== 'direct';
  if (useIsolated) {
    const failureFile = createWebHandoffFailureFilePath(webProfile);
    const logPath = appendWebHandoffSuccessorLogHeader(webProfile, label);
    const dataRoot = typeof webProfile?.dataRoot === 'string' && webProfile.dataRoot ? webProfile.dataRoot : null;
    const handle = launchDetachedProcess({
      command,
      args: argsPrefix,
      env: { ...env, [WEB_HANDOFF_FAILURE_FILE_ENV]: failureFile },
      labelPrefix: 'web-restart-handoff',
      stateDir: dataRoot ? path.join(dataRoot, 'launchd-jobs') : undefined,
      standardOutPath: logPath ?? undefined,
      standardErrorPath: logPath ?? undefined,
    });
    let reported = false;
    const finishFailure = (timer: NodeJS.Timeout, code: string, message: string, useReport = true) => {
      if (reported) return;
      reported = true;
      clearInterval(timer);
      clearWebHandoffFailureFile(failureFile);
      if (useReport) report(code, message);
      else dependencies.onFailure?.({ code, message });
    };
    const deadline = Date.now() + 30_000;
    const timer = setInterval(() => {
      const failure = readWebHandoffFailureFile(failureFile);
      if (failure) {
        finishFailure(timer, failure.code, failure.message);
        return;
      }
      const status = handle.pollStatus();
      if (!status.running) {
        const message = `Buildr Web 重启后继进程已退出（${status.signal || status.exitCode}）。`;
        finishFailure(timer, 'web_restart_process_failed', message, Boolean((status.exitCode !== null && status.exitCode !== 0) || status.signal));
        return;
      }
      if (Date.now() >= deadline) {
        clearInterval(timer);
        clearWebHandoffFailureFile(failureFile);
      }
    }, 250);
    timer.unref();
    handle.child?.once('error', (error: Error) => finishFailure(timer, 'web_restart_process_failed', error.message));
    if (handle.child) dependencies.onSpawned?.(handle.child);
    return handle.child;
  }
  const logFd = openWebHandoffSuccessorLog(webProfile, label, dependencies.openLog);
  let child: ChildProcess;
  try {
    child = (dependencies.spawnProcess || spawn)(command, argsPrefix, {
      env,
      detached: true,
      stdio: logFd === null ? ['ignore', 'ignore', 'ignore', 'ipc'] : ['ignore', logFd, logFd, 'ipc'],
      windowsHide: true,
    });
  } catch (error) {
    if (logFd !== null) try { fs.closeSync(logFd); } catch { /* Best-effort close on synchronous spawn failure. */ }
    throw error;
  }
  releaseWebHandoffSuccessorLog(child, logFd);
  child.on('message', (message: any) => {
    if (message?.type === 'buildr.web-update-handoff-failed' && typeof message.message === 'string') {
      report(typeof message.code === 'string' ? message.code : 'web_restart_process_failed', message.message.slice(0, 4096));
    }
  });
  child.on('error', (error: Error) => report('web_restart_process_failed', error.message));
  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    const message = `Buildr Web 重启后继进程已退出（${signal || code}）。`;
    if (code !== 0 || signal) report('web_restart_process_failed', message);
    else dependencies.onFailure?.({ code: 'web_restart_process_failed', message });
  });
  child.channel?.unref();
  child.unref();
  dependencies.onSpawned?.(child);
  return child;
}
