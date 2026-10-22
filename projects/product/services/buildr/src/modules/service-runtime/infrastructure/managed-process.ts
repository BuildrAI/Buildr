import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import type { ProcessIdentity } from '../domain/runs.ts';

export type ManagedProcess = {
  pid: number;
  identity: ProcessIdentity | null;
  kill(): Promise<void>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

export function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** 进程号不是身份：启动时间与独立进程组共同防止宿主重启后的进程号复用。 */
export function readProcessIdentity(pid: number): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (fields[0] === 'Z') return null;
      const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      return { pid, groupId: Number(fields[2]), startTime: `${boot}:${fields[19]}` };
    }
    if (process.platform === 'win32') {
      const startTime = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return startTime ? { pid, groupId: pid, startTime } : null;
    }
    const observed = execFileSync('ps', ['-p', String(pid), '-o', 'pid=', '-o', 'pgid=', '-o', 'lstart='], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const match = observed.match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return match ? { pid: Number(match[1]), groupId: Number(match[2]), startTime: match[3]!.trim().replace(/\s+/g, ' ') } : null;
  } catch { return null; }
}

export function matchesProcessIdentity(identity: ProcessIdentity | null): boolean {
  if (!identity || !Number.isSafeInteger(identity.pid) || identity.pid <= 0 || identity.groupId !== identity.pid) return false;
  const current = readProcessIdentity(identity.pid);
  return current?.pid === identity.pid && current.groupId === identity.groupId && current.startTime === identity.startTime;
}

function groupAlive(groupId: number): boolean {
  if (!Number.isSafeInteger(groupId) || groupId <= 0) return false;
  if (process.platform === 'win32') return processAlive(groupId);
  try { process.kill(-groupId, 0); return true; } catch { return false; }
}

async function terminateGroup(pid: number, identity: ProcessIdentity | null): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('拒绝终止非正进程号。');
  const assertLeader = () => {
    if (processAlive(pid) && !matchesProcessIdentity(identity)) throw new Error('进程组首进程身份已变化或无法核实，拒绝终止。');
  };
  assertLeader();
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 6000, stdio: 'ignore' }); }
    catch (error) { if (processAlive(pid)) throw error; }
    return;
  }
  const signal = (name: NodeJS.Signals) => {
    assertLeader();
    try { process.kill(-pid, name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  const deadline = Date.now() + 5000;
  while (groupAlive(pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (groupAlive(pid)) signal('SIGKILL');
}

export async function terminateVerifiedProcess(identity: ProcessIdentity): Promise<void> {
  if (!matchesProcessIdentity(identity)) throw new Error('进程身份已变化，拒绝终止。');
  await terminateGroup(identity.pid, identity);
}

async function terminateOwnedChild(child: ReturnType<typeof spawn>, exited: ManagedProcess['exited']): Promise<void> {
  // 仅用于本次创建且尚未报告退出的句柄，不适用于从磁盘读回的进程号。
  const live = () => child.exitCode === null && child.signalCode === null;
  if (!live()) return;
  const wait = async (timeout: number) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([exited.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeout); })]);
    } finally { if (timer) clearTimeout(timer); }
  };
  if (!child.kill('SIGTERM') && live()) throw new Error('无法向本次自有启动进程发送终止信号。');
  if (await wait(5000)) return;
  if (live() && !child.kill('SIGKILL')) throw new Error('无法强制终止本次自有启动进程。');
  if (!(await wait(1000))) throw new Error('本次自有启动进程仍未退出。');
}

/** 输出直接写入实例日志，独立服务不依附启动命令的管道与生命周期。 */
export async function startManagedProcess(options: { command: string[]; cwd: string; logPath: string; env?: Record<string, string>; readIdentity?(pid: number): ProcessIdentity | null }): Promise<ManagedProcess> {
  fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
  const descriptor = fs.openSync(options.logPath, 'a', 0o600);
  let child: ReturnType<typeof spawn>;
  try {
    const [binary, ...args] = options.command;
    child = spawn(binary!, args, { cwd: options.cwd, detached: true, stdio: ['ignore', descriptor, descriptor], env: { ...process.env, ...options.env } });
  } finally { fs.closeSync(descriptor); }
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', () => resolve({ code: null, signal: null }));
  });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  const pid = child.pid;
  if (!pid || pid <= 0) throw new Error('启动未返回有效进程号。');
  child.unref();
  let identity: ProcessIdentity | null = null;
  try { identity = (options.readIdentity ?? readProcessIdentity)(pid); } catch {}
  return { pid, identity, exited, kill: () => identity ? terminateGroup(pid, identity) : terminateOwnedChild(child, exited) };
}

export function probePortAvailable(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve(false);
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

export function probeHttpStatus(port: number, requestPath: string): Promise<number | null> {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path: requestPath, timeout: 2000 }, response => {
      resolve(response.statusCode ?? null);
      response.resume();
    });
    request.on('error', () => resolve(null));
    request.on('timeout', () => { request.destroy(); resolve(null); });
  });
}
