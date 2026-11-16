import { spawn } from 'node:child_process';

export interface AntigravityUsageWindow {
  id: string;
  groupLabel: string;
  label: string;
  remainingPercent: number;
  resetsAt: string;
}

const MAX_STDOUT = 64 * 1024;
const MAX_STDERR = 16 * 1024;
const ANSI = /\u001b\[[0-9;]*m/g;

function usageGroup(value: string): { id: string; label: string } | undefined {
  if (/^gemini\b/i.test(value)) return { id: 'gemini', label: 'Gemini 模型' };
  if (/claude|gpt/i.test(value)) return { id: '3p', label: 'Claude 与 GPT 模型' };
  return undefined;
}

function usageWindow(value: string): { id: string; label: string } | undefined {
  if (/weekly|per\s+week/i.test(value)) return { id: 'weekly', label: '每周限额' };
  if (/five\s*hour|5\s*h(?:our)?/i.test(value)) return { id: '5h', label: '5 小时限额' };
  return undefined;
}

/** Parse the official `agy -p '/usage'` table. Unknown or incomplete lines are ignored. */
export function parseAntigravityUsage(output: string): AntigravityUsageWindow[] {
  const windows = new Map<string, AntigravityUsageWindow>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(ANSI, '').trim();
    if (!line) continue;
    const fields = line.split('\t').map(value => value.trim());
    if (fields.length !== 4) continue;
    const group = usageGroup(fields[0]!), window = usageWindow(fields[1]!);
    const percent = /^(\d+(?:\.\d+)?)%$/.exec(fields[2]!), resetsAt = fields[3]!;
    if (!group || !window || !percent || !Number.isFinite(Date.parse(resetsAt))) continue;
    const remaining = Number(percent[1]);
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > 100) continue;
    const id = `${group.id}-${window.id}`;
    windows.set(id, {
      id,
      groupLabel: group.label,
      label: window.label,
      remainingPercent: Number(remaining.toFixed(2)),
      resetsAt,
    });
  }
  return [...windows.values()];
}

/** Run the managed CLI's own usage command; the child accesses the host keyring without Buildr reading it. */
export async function readAntigravityUsage(input: {
  executable: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<AntigravityUsageWindow[]> {
  const timeoutMs = input.timeoutMs ?? 15_000;
  return await new Promise((resolve, reject) => {
    const child = spawn(input.executable, ['-p', '/usage'], {
      cwd: input.cwd,
      env: input.environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '', stderr = '', settled = false, killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 1_000);
      killTimer.unref?.();
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(parseAntigravityUsage(stdout));
    };
    const abort = () => {
      stop();
      finish(new Error('antigravity_usage_aborted'));
    };
    const timer = setTimeout(() => {
      stop();
      finish(new Error('antigravity_usage_timeout'));
    }, timeoutMs);
    input.signal?.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', chunk => {
      if (stdout.length < MAX_STDOUT) stdout += String(chunk);
    });
    child.stderr?.on('data', chunk => {
      if (stderr.length < MAX_STDERR) stderr += String(chunk);
    });
    child.once('error', error => finish(error));
    child.once('exit', (code, signal) => {
      if (settled) return;
      if (code === 0) finish();
      else finish(new Error(`antigravity_usage_exit:${code ?? signal ?? 'unknown'}`));
    });
  });
}
