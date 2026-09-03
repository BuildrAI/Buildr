import { spawn } from 'node:child_process';

function bounded(value: any, limit: any = 8_192): any  {
  const text: any = String(value || '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated ${text.length - limit} bytes]`;
}

export function spawnSupervised(command: any, args: any, { cwd, env = process.env, owner, timeoutMs = 30_000, readiness = null, readinessTimeoutMs = timeoutMs, outputLimit = 8_192 }: any = {}): any  {
  const startedAt: any = Date.now();
  const child: any = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout: any = '';
  let stderr: any = '';
  let timedOut: any = false;
  let ready: any = readiness === null;
  child.stdout.on('data', (chunk: any) => {
    stdout += chunk;
    if (!ready && typeof readiness === 'function') ready = readiness(stdout, stderr);
  });
  child.stderr.on('data', (chunk: any) => { stderr += chunk; });
  const timeout: any = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, readiness === null ? timeoutMs : readinessTimeoutMs);
  timeout.unref();
  const completed: any = new Promise((resolve: any) => child.once('close', (exitCode: any, signal: any) => {
    clearTimeout(timeout);
    resolve({
      owner: owner || null,
      pid: child.pid,
      command,
      args,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      exitCode,
      signal,
      timedOut,
      ready,
      stdout: bounded(stdout, outputLimit),
      stderr: bounded(stderr, outputLimit),
    });
  }));
  return { child, completed, owner: owner || null, startedAt };
}

export function parseSuccessfulJson(result: any, label: any = 'child process'): any  {
  if (result.timedOut || result.exitCode !== 0 || result.signal) {
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
