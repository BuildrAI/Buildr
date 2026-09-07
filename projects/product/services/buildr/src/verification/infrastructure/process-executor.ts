import { spawn } from 'node:child_process';
import process from 'node:process';
import { createOwnedDescendantTracker, terminateOwnedProcess } from './owned-process.ts';
import { resolveVerificationCommandTimeout } from '../domain/verification-deadline.ts';

const OUTPUT_LIMIT = 256 * 1024;
const EXIT_CLOSE_GRACE_MS = 10_000;

function appendBounded(current: any, chunk: any) {
  const value = `${current}${chunk}`;
  if (value.length <= OUTPUT_LIMIT) return value;
  const half = Math.floor(OUTPUT_LIMIT / 2);
  return `${value.slice(0, half)}\n...[truncated ${value.length - OUTPUT_LIMIT} bytes]...\n${value.slice(-half)}`;
}

export function executeVerificationCommand(step: any, options: any = {}) {
  const [command, ...args] = step.command.argv;
  const timeoutMs = resolveVerificationCommandTimeout(step.command.timeoutMs);
  const started = Date.now();
  return new Promise((resolve: any) => {
    let child: any;
    let tracker: any;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let terminating = false;
    let exitResult: any = null;
    let timeout: any = null;
    let closeTimeout: any = null;

    const finish = (status: any, exitCode: any, signal: any = null, failureCode: any = null, processCleanup: any = null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (closeTimeout) clearTimeout(closeTimeout);
      resolve({
        status,
        exitCode,
        signal,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        process: child?.pid ? { pid: child.pid, processGroupId: process.platform === 'win32' ? null : child.pid } : null,
        processCleanup: processCleanup || { status: 'not-applicable', ownership: 'unavailable' },
        timeoutMs,
        ...(failureCode ? { failureCode } : {}),
      });
    };

    const cleanup = async () => {
      const observed = tracker?.stop() || { processes: [] };
      if (!child?.pid) return { status: 'not-applicable', ownership: 'unavailable', observed: [] };
      return terminateOwnedProcess({
        pid: child.pid,
        processes: observed.processes,
        graceMs: options.terminationGraceMs ?? 2_000,
        confirmMs: options.terminationConfirmMs ?? 1_000,
        wait: options.wait,
      });
    };

    const terminate = async (status: any, failureCode: any, message: any) => {
      if (settled || terminating) return;
      terminating = true;
      stderr = appendBounded(stderr, `${message}\n`);
      const processCleanup = await cleanup();
      finish(status, status === 'timed-out' ? 124 : 130, null, failureCode, processCleanup);
    };

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
      tracker = createOwnedDescendantTracker(child.pid, { intervalMs: 50 });
      options.onSpawn?.({ pid: child.pid, processGroupId: process.platform === 'win32' ? null : child.pid });
    } catch (error: any) {
      finish('failed', 1, null, 'spawn-failed', { status: 'failed', ownership: 'unavailable', error: error.message });
      return;
    }
    child.stdout.on('data', (chunk: any) => { stdout = appendBounded(stdout, chunk.toString()); });
    child.stderr.on('data', (chunk: any) => { stderr = appendBounded(stderr, chunk.toString()); });
    child.on('error', (error: any) => finish('failed', 1, null, 'spawn-failed', { status: 'failed', ownership: 'runner-owned', error: error.message }));
    child.on('exit', (code: any, signal: any) => {
      exitResult = { code, signal };
      closeTimeout = setTimeout(() => finish('failed', 1, signal, 'process-close-timeout', { status: 'failed', ownership: 'runner-owned', reason: 'stdio-close-timeout' }), EXIT_CLOSE_GRACE_MS);
      closeTimeout.unref?.();
    });
    child.on('close', async (code: any, signal: any) => {
      if (terminating || settled) return;
      const processCleanup = await cleanup();
      const finalCode = Number.isInteger(code) ? code : exitResult?.code ?? 1;
      const finalSignal = signal ?? exitResult?.signal ?? null;
      const status = finalCode === 0 && !finalSignal && processCleanup.status === 'clean' ? 'passed' : 'failed';
      finish(status, finalCode, finalSignal, processCleanup.status === 'failed' ? 'process-cleanup-failed' : null, processCleanup);
    });
    timeout = setTimeout(() => {
      void terminate('timed-out', 'capability-timeout', `capability-timeout: ${step.name || command} exceeded ${timeoutMs} ms (pid=${child.pid}).`);
    }, timeoutMs);
    timeout.unref?.();
    if (options.signal) {
      const cancel = () => { void terminate('cancelled', 'capability-cancelled', `capability-cancelled: ${step.name || command} was cancelled.`); };
      if (options.signal.aborted) cancel();
      else options.signal.addEventListener('abort', cancel, { once: true });
    }
  });
}
