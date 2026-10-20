import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import { currentProductInvocation, productInvocationArgs } from '../../infrastructure/product-invocation/index.ts';
import { buildrWebInstanceObservationDigest } from '../infrastructure/instance-runtime.ts';
import { updatedWebEnvironment } from './update-web-handoff.ts';

type SpawnSuccessorDependencies = {
  spawnProcess?: typeof spawn;
  buildInvocation?: () => { command: string; argsPrefix: string[] };
  environment?: NodeJS.ProcessEnv;
  onSpawned?: (child: ChildProcess) => void;
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
): ChildProcess {
  const observed = buildrWebInstanceObservationDigest(state);
  const port = new URL(state.url).port;
  const [command, argsPrefix] = productInvocationArgs(
    dependencies.buildInvocation ? dependencies.buildInvocation() : currentProductInvocation({ cliPath: process.argv[1] }),
    ['web', '--restart', observed, '--no-open', '--port', port],
  );
  const child = (dependencies.spawnProcess || spawn)(command, argsPrefix, {
    env: updatedWebEnvironment(dependencies.environment),
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  const report = (code: string, message: string): void => {
    console.error(`Buildr Web restart handoff failed: ${message}`, code !== 'web_restart_process_failed' ? `(${code})` : '');
  };
  child.on('message', (message: any) => {
    if (message?.type === 'buildr.web-update-handoff-failed' && typeof message.message === 'string') {
      report(typeof message.code === 'string' ? message.code : 'web_restart_process_failed', message.message.slice(0, 4096));
    }
  });
  child.on('error', (error: Error) => report('web_restart_process_failed', error.message));
  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    if (code !== 0 || signal) report('web_restart_process_failed', `Buildr Web 重启后继进程已退出（${signal || code}）。`);
  });
  child.channel?.unref();
  child.unref();
  dependencies.onSpawned?.(child);
  return child;
}
