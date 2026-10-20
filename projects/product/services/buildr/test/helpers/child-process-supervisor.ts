import { spawn } from 'node:child_process';
import process from 'node:process';
import { createOwnedDescendantTracker, terminateOwnedProcess } from '../verification/support/owned-process.ts';

function bounded(value: any, limit: any = 8_192): any  {
  const text: any = String(value || '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated ${text.length - limit} bytes]`;
}

function boundedCapture(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('outputLimit must be a positive integer.');
  const headLimit = Math.ceil(limit / 2), tailLimit = Math.floor(limit / 2);
  let head = Buffer.alloc(0), tail = Buffer.alloc(0), total = 0;
  return {
    append(chunk: Buffer) {
      total += chunk.length;
      const take = Math.min(headLimit - head.length, chunk.length);
      if (take > 0) head = Buffer.concat([head, chunk.subarray(0, take)]);
      if (tailLimit && chunk.length > take) {
        tail = Buffer.from(Buffer.concat([tail, chunk.subarray(take)]).subarray(-tailLimit));
      }
    },
    text() {
      if (total <= limit) return Buffer.concat([head, tail]).toString('utf8');
      return `${head.toString('utf8')}\n...[truncated ${total - limit} bytes]...\n${tail.toString('utf8')}`;
    },
  };
}

export function spawnSupervised(command: any, args: any, {
  cwd, env = process.env, owner, timeoutMs = 30_000, readiness = null,
  readinessTimeoutMs = timeoutMs, outputLimit = 8_192, signal, inheritOutput = false,
  terminationGraceMs = 2_000, terminationConfirmMs = 1_000,
}: any = {}): any  {
  signal?.throwIfAborted();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  const stdout = boundedCapture(outputLimit), stderr = boundedCapture(outputLimit);
  const startedAt: any = Date.now();
  const child: any = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  const tracker = Number.isInteger(child.pid) ? createOwnedDescendantTracker(child.pid) : null;
  let timedOut = false, cancelled = false, ready = readiness === null, closed = false;
  let exitCode: number | null = null, exitSignal: string | null = null, spawnError: any = null;
  let finishing: Promise<void> | undefined;
  let resolveCompleted: (result: any) => void;
  const completed = new Promise(resolve => { resolveCompleted = resolve; });
  let resolveClosed: () => void;
  const close = new Promise<void>(resolve => { resolveClosed = resolve; });
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
  const timeout = setTimeout(() => { timedOut = true; void finish(); }, timeoutMs);
  timeout.unref();
  const cancel = () => { cancelled = true; void finish(); };

  function finish(): Promise<void> {
    return finishing ??= (async () => {
      clearTimeout(timeout);
      if (readinessTimer) clearTimeout(readinessTimer);
      signal?.removeEventListener('abort', cancel);
      let processCleanup: any;
      try {
        const observed = tracker?.stop();
        processCleanup = Number.isInteger(child.pid)
          ? await terminateOwnedProcess({ pid: child.pid, processes: observed?.processes, graceMs: terminationGraceMs, confirmMs: terminationConfirmMs })
          : { status: 'not-applicable', ownership: 'unavailable' };
      } catch (error: any) {
        processCleanup = { status: 'failed', ownership: 'runner-owned', error: error.message };
      }
      if (!closed) {
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([close, new Promise<void>(resolve => { closeTimer = setTimeout(resolve, terminationConfirmMs); })]); }
        finally { if (closeTimer) clearTimeout(closeTimer); }
      }
      if (!closed) {
        processCleanup = { ...processCleanup, status: 'failed', reason: 'stdio-close-timeout' };
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
      }
      resolveCompleted({
        owner: owner || null, pid: child.pid, command, args, startedAt, finishedAt: Date.now(),
        durationMs: Date.now() - startedAt, exitCode, signal: exitSignal, timedOut, cancelled, ready,
        stdout: stdout.text(), stderr: stderr.text(), processCleanup,
        ...(spawnError ? { error: spawnError.message } : {}),
      });
    })();
  }

  child.stdout.on('data', (chunk: Buffer) => {
    stdout.append(chunk);
    if (!ready && typeof readiness === 'function' && readiness(stdout.text(), stderr.text())) {
      ready = true;
      if (readinessTimer) clearTimeout(readinessTimer);
    }
  });
  child.stderr.on('data', (chunk: Buffer) => stderr.append(chunk));
  if (inheritOutput) { child.stdout.pipe(process.stdout, { end: false }); child.stderr.pipe(process.stderr, { end: false }); }
  child.once('error', (error: any) => { spawnError = error; });
  child.once('exit', (code: any, value: any) => {
    exitCode = code; exitSignal = value;
    // Exit can precede close when descendants still hold inherited pipes.
    void finish();
  });
  child.once('close', (code: any, value: any) => {
    closed = true; exitCode = code; exitSignal = value; resolveClosed(); void finish();
  });
  if (readiness !== null) {
    readinessTimer = setTimeout(() => { timedOut = true; void finish(); }, readinessTimeoutMs);
    readinessTimer.unref();
  }
  signal?.addEventListener('abort', cancel, { once: true });
  return { child, completed, owner: owner || null, startedAt, stop: () => { cancel(); return completed; } };
}

export function parseSuccessfulJson(result: any, label: any = 'child process'): any  {
  if (result.timedOut || result.cancelled || result.error || result.exitCode !== 0 || result.signal || result.processCleanup?.status === 'failed') {
    const error: Error & Record<string, any> = new Error(`${label} failed: exit=${result.exitCode} signal=${result.signal || 'none'} timeout=${result.timedOut}; ${result.stderr || result.stdout}`);
    error.diagnostic = result;
    throw error;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    const error: Error & Record<string, any> = new Error(`${label} did not return complete JSON: ${result.stdout || '(empty stdout)'}; ${result.stderr || '(empty stderr)'}`);
    error.diagnostic = result;
    throw error;
  }
}

export function processesOverlap(left: any, right: any): any  {
  return Math.max(left.startedAt, right.startedAt) < Math.min(left.finishedAt, right.finishedAt);
}
