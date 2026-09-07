import { spawnSync } from 'node:child_process';
import process from 'node:process';

function parseProcessLineage(output: any) {
  return String(output || '').split('\n').flatMap((line: any) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)(?:\s+(.+))?$/u);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), startedAt: match[3]?.trim() || null }] : [];
  });
}

function listProcesses() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `ps exited ${result.status}`);
  return parseProcessLineage(result.stdout);
}

function sameInstance(expected: any, current: any) {
  return !expected.startedAt || !current.startedAt || expected.startedAt === current.startedAt;
}

export function createOwnedDescendantTracker(rootPid: any, { intervalMs = 50, platform = process.platform }: any = {}) {
  const owned = new Map([[rootPid, { pid: rootPid, startedAt: null }]]);
  let timer: any = null;
  let sampleError: any = null;
  const sample = () => {
    if (platform === 'win32') return;
    try {
      const rows = listProcesses();
      const byPid = new Map(rows.map((row: any) => [row.pid, row]));
      const active = new Map();
      for (const item of owned.values()) {
        const current = byPid.get(item.pid);
        if (current && sameInstance(item, current)) active.set(current.pid, current);
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) {
          if (!active.has(row.pid) && active.has(row.ppid)) {
            active.set(row.pid, row);
            changed = true;
          }
        }
      }
      owned.clear();
      for (const [pid, row] of active) owned.set(pid, { pid, startedAt: row.startedAt || null });
    } catch (error: any) {
      sampleError = error.message;
    }
  };
  sample();
  if (platform !== 'win32') {
    timer = setInterval(sample, intervalMs);
    timer.unref?.();
  }
  return {
    sample,
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      sample();
      return { processes: [...owned.values()], sampleError };
    },
  };
}

function alive(pid: any, kill: any) {
  try { kill(pid, 0); return true; } catch (error: any) { return error.code !== 'ESRCH'; }
}

export async function terminateOwnedProcess({ pid, processes = [], platform = process.platform, kill = process.kill, killTree = spawnSync, wait = (ms: any) => new Promise((resolve: any) => setTimeout(resolve, ms)), graceMs = 2_000, confirmMs = 1_000 }: any = {}) {
  const descendants = processes.filter((item: any) => Number.isInteger(item.pid) && item.pid !== pid);
  const groupTarget = platform === 'win32' ? pid : -pid;
  const signal = (target: any, value: any) => {
    try { kill(target, value); return null; } catch (error: any) { return error.code === 'ESRCH' ? null : error.message; }
  };
  const groupWasAlive = alive(groupTarget, kill);
  const termError = !groupWasAlive ? null : platform === 'win32'
    ? (() => {
      const result = killTree('taskkill', ['/pid', String(pid), '/t'], { encoding: 'utf8' });
      return result.status === 0 || /not found|no running instance/i.test(`${result.stdout || ''}\n${result.stderr || ''}`) ? null : `${result.stderr || result.stdout || ''}`.trim();
    })()
    : signal(groupTarget, 'SIGTERM');
  if (groupWasAlive) await wait(graceMs);
  const forced: any[] = [];
  if (alive(groupTarget, kill)) {
    const error = platform === 'win32' ? (() => {
      const result = killTree('taskkill', ['/pid', String(pid), '/t', '/f'], { encoding: 'utf8' });
      return result.status === 0 || /not found|no running instance/i.test(`${result.stdout || ''}\n${result.stderr || ''}`) ? null : `${result.stderr || result.stdout || ''}`.trim();
    })() : signal(groupTarget, 'SIGKILL');
    if (error) forced.push({ target: groupTarget, error });
  }
  for (const item of descendants) if (alive(item.pid, kill)) {
    const error = signal(item.pid, 'SIGKILL');
    if (error) forced.push({ target: item.pid, error });
  }
  const deadline = Date.now() + confirmMs;
  const remaining: any[] = [];
  while (Date.now() < deadline && alive(groupTarget, kill)) await wait(25);
  if (alive(groupTarget, kill)) remaining.push(groupTarget);
  for (const item of descendants) if (alive(item.pid, kill)) remaining.push(item.pid);
  return {
    status: termError || forced.length || remaining.length ? 'failed' : 'clean',
    ownership: platform === 'win32' ? `pid-tree-${pid}` : `pgid-${pid}`,
    termError: termError || null,
    forced,
    remaining,
    observed: [pid, ...descendants.map((item: any) => item.pid)],
  };
}
