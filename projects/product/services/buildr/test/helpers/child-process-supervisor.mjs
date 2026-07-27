import { spawn } from 'node:child_process';

function bounded(value, limit = 8_192) {
  const text = String(value || '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated ${text.length - limit} bytes]`;
}

export function spawnSupervised(command, args, { cwd, env = process.env, owner, timeoutMs = 30_000 } = {}) {
  const startedAt = Date.now();
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, timeoutMs);
  timeout.unref();
  const completed = new Promise((resolve) => child.once('close', (exitCode, signal) => {
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
      stdout: bounded(stdout),
      stderr: bounded(stderr),
    });
  }));
  return { child, completed, owner: owner || null, startedAt };
}

export function parseSuccessfulJson(result, label = 'child process') {
  if (result.timedOut || result.exitCode !== 0 || result.signal) {
    const error = new Error(`${label} failed: exit=${result.exitCode} signal=${result.signal || 'none'} timeout=${result.timedOut}; ${result.stderr || result.stdout}`);
    error.diagnostic = result;
    throw error;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    const error = new Error(`${label} did not return complete JSON: ${result.stdout || '(empty stdout)'}; ${result.stderr || '(empty stderr)'}`);
    error.diagnostic = result;
    throw error;
  }
}

export function processesOverlap(left, right) {
  return Math.max(left.startedAt, right.startedAt) < Math.min(left.finishedAt, right.finishedAt);
}
