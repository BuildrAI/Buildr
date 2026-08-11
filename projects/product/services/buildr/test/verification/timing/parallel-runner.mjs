import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

function diagnosticBaseName(step) {
  return String(step.diagnosticId ?? step.name ?? 'verification-step')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'verification-step';
}

export function writeVerificationDiagnostics(step, stdout, stderr) {
  if (!step.diagnosticsDirectory) return {};
  const directory = path.resolve(step.diagnosticsDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const base = diagnosticBaseName(step);
  const stdoutPath = path.join(directory, `${base}.stdout.log`);
  const stderrPath = path.join(directory, `${base}.stderr.log`);
  fs.writeFileSync(stdoutPath, stdout || '', 'utf8');
  fs.writeFileSync(stderrPath, stderr || '', 'utf8');
  return { stdoutPath, stderrPath };
}

export function cleanupOwnedProcessGroup(pid, { platform = process.platform, kill = process.kill, killTree = spawnSync } = {}) {
  if (!Number.isInteger(pid)) return { status: 'not-applicable', ownership: 'unavailable' };
  if (platform === 'win32') {
    const result = killTree('taskkill', ['/pid', String(pid), '/t', '/f'], { encoding: 'utf8' });
    if (result.status === 0) return { status: 'clean', ownership: `pid-tree-${pid}`, terminated: true };
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (/not found|no running instance/i.test(output)) return { status: 'clean', ownership: `pid-tree-${pid}`, terminated: false };
    return { status: 'failed', ownership: `pid-tree-${pid}`, error: output.trim() || `taskkill exited ${result.status}` };
  }
  try {
    kill(-pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return { status: 'clean', ownership: `pgid-${pid}`, terminated: false };
    return { status: 'failed', ownership: `pgid-${pid}`, error: error.message };
  }
  try {
    kill(-pid, 'SIGTERM');
    return { status: 'clean', ownership: `pgid-${pid}`, terminated: true };
  } catch (error) {
    return { status: 'failed', ownership: `pgid-${pid}`, error: error.message };
  }
}

export function parseProcessLineage(output) {
  return String(output ?? '').split('\n').flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)(?:\s+(.+))?$/);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), startedAt: match[3]?.trim() || null }] : [];
  });
}

function defaultListProcesses() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `ps exited ${result.status}`);
  return parseProcessLineage(result.stdout);
}

let sharedProcessSnapshot = null;
let sharedProcessSnapshotAt = 0;

function sharedListProcesses() {
  const now = Date.now();
  if (sharedProcessSnapshot && now - sharedProcessSnapshotAt < 40) return sharedProcessSnapshot;
  sharedProcessSnapshot = defaultListProcesses();
  sharedProcessSnapshotAt = now;
  return sharedProcessSnapshot;
}

function processInstanceKey(processInfo) {
  return `${processInfo.pid}:${processInfo.startedAt ?? 'unknown'}`;
}

function isSameProcessInstance(expected, current) {
  return expected.startedAt === null || expected.startedAt === undefined
    || current.startedAt === null || current.startedAt === undefined
    || expected.startedAt === current.startedAt;
}

export function createOwnedDescendantTracker(rootPid, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  const ownedProcesses = new Map();
  if (Number.isInteger(rootPid)) ownedProcesses.set(rootPid, { pid: rootPid, startedAt: null });
  const listProcesses = runtime.listProcesses ?? sharedListProcesses;
  const listFreshProcesses = runtime.listProcesses ?? defaultListProcesses;
  const intervalMs = runtime.lineageSampleIntervalMs ?? 50;
  let timer = null;
  let sampleError = null;

  const sample = (fresh = false) => {
    if (platform === 'win32' || ownedProcesses.size === 0) return;
    try {
      const rows = (fresh ? listFreshProcesses : listProcesses)();
      const byPid = new Map(rows.map((row) => [row.pid, row]));
      const activeOwnedProcesses = new Map();
      for (const processInfo of ownedProcesses.values()) {
        const current = byPid.get(processInfo.pid);
        if (!current || !isSameProcessInstance(processInfo, current)) continue;
        activeOwnedProcesses.set(current.pid, { pid: current.pid, startedAt: current.startedAt ?? processInfo.startedAt ?? null });
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) {
          if (!activeOwnedProcesses.has(row.pid) && activeOwnedProcesses.has(row.ppid)) {
            activeOwnedProcesses.set(row.pid, { pid: row.pid, startedAt: row.startedAt ?? null });
            changed = true;
          }
        }
      }
      ownedProcesses.clear();
      for (const [pid, processInfo] of activeOwnedProcesses) ownedProcesses.set(pid, processInfo);
    } catch (error) {
      sampleError = error.message;
    }
  };

  if (platform !== 'win32' && ownedProcesses.size > 0) {
    sample(true);
    timer = (runtime.setInterval ?? setInterval)(sample, intervalMs);
    timer?.unref?.();
  }

  return {
    sample: () => sample(true),
    stop() {
      if (timer !== null) (runtime.clearInterval ?? clearInterval)(timer);
      timer = null;
      sample(true);
      const processes = [...ownedProcesses.values()];
      return { ownedPids: [...new Set([rootPid, ...processes.map((item) => item.pid)].filter(Number.isInteger))], ownedProcesses: processes, sampleError };
    },
  };
}

export function cleanupTrackedDescendants(rootPid, ownedProcesses, { platform = process.platform, kill = process.kill, listProcesses = defaultListProcesses } = {}) {
  if (platform === 'win32') return { status: 'not-applicable', ownership: 'taskkill-tree' };
  const tracked = [...new Map(ownedProcesses
    .map((item) => typeof item === 'number' ? { pid: item, startedAt: null } : { pid: item.pid, startedAt: item.startedAt ?? null })
    .filter((item) => Number.isInteger(item.pid) && item.pid > 0 && item.pid !== rootPid)
    .map((item) => [processInstanceKey(item), item])).values()];
  const terminated = [];
  const alreadyExited = [];
  const reused = [];
  const failures = [];
  let currentByPid = null;
  if (tracked.some((item) => item.startedAt !== null)) {
    try {
      currentByPid = new Map(listProcesses().map((item) => [item.pid, item]));
    } catch (error) {
      return {
        status: 'failed', ownership: `observed-lineage-${rootPid}`, observed: [...new Set(tracked.map((item) => item.pid))],
        terminated, alreadyExited, reused, failures: [{ pid: null, error: `process identity inspection failed: ${error.message}` }],
      };
    }
  }
  for (const processInfo of tracked) {
    const { pid } = processInfo;
    if (processInfo.startedAt !== null) {
      const current = currentByPid.get(pid);
      if (!current) {
        alreadyExited.push(pid);
        continue;
      }
      if (!isSameProcessInstance(processInfo, current)) {
        reused.push(pid);
        continue;
      }
    }
    try {
      kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alreadyExited.push(pid);
      else failures.push({ pid, error: error.message });
      continue;
    }
    try {
      kill(pid, 'SIGTERM');
      terminated.push(pid);
    } catch (error) {
      if (error.code === 'ESRCH') alreadyExited.push(pid);
      else failures.push({ pid, error: error.message });
    }
  }
  return {
    status: failures.length === 0 ? 'clean' : 'failed',
    ownership: `observed-lineage-${rootPid}`,
    observed: [...new Set(tracked.map((item) => item.pid))],
    terminated,
    alreadyExited,
    reused,
    failures,
  };
}

export async function runVerificationStep(step, runtime = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let processCleanup = { status: 'pending', ownership: 'unavailable' };
    let lineageTracker = null;
    let cleanupCompleted = false;
    let exitCloseTimer = null;
    let exitResult = null;
    const requestedExitCloseGraceMs = runtime.exitCloseGraceMs ?? 10_000;
    const exitCloseGraceMs = Number.isFinite(requestedExitCloseGraceMs) && requestedExitCloseGraceMs >= 0 ? requestedExitCloseGraceMs : 10_000;
    const scheduleTimeout = runtime.setTimeout ?? setTimeout;
    const cancelTimeout = runtime.clearTimeout ?? clearTimeout;
    const cleanup = () => {
      if (cleanupCompleted) return processCleanup;
      cleanupCompleted = true;
      const lineage = lineageTracker?.stop() ?? { ownedPids: [], ownedProcesses: [], sampleError: null };
      const processGroup = cleanupOwnedProcessGroup(child?.pid, runtime);
      const descendants = cleanupTrackedDescendants(child?.pid, lineage.ownedProcesses ?? lineage.ownedPids, runtime);
      processCleanup = {
        status: processGroup.status === 'failed' || descendants.status === 'failed' ? 'failed' : 'clean',
        ownership: 'runner-observed-lineage',
        processGroup,
        descendants,
        ...(lineage.sampleError ? { sampleError: lineage.sampleError } : {}),
      };
      return processCleanup;
    };
    const finish = (exitCode, error = null, failureCode = null) => {
      if (settled) return;
      settled = true;
      if (exitCloseTimer !== null) cancelTimeout(exitCloseTimer);
      exitCloseTimer = null;
      cleanup();
      if (error) stderr += `${error.message}\n`;
      if (processCleanup.status === 'failed' && exitCode === 0) {
        exitCode = 1;
        failureCode ??= 'process-cleanup-failed';
        stderr += 'Verification process cleanup did not preserve runner ownership.\n';
      }
      const durationMs = Date.now() - startedAt;
      const budgetMs = Number.isFinite(step.budgetMs) ? step.budgetMs : undefined;
      const diagnosticPaths = writeVerificationDiagnostics(step, stdout, stderr);
      resolve({
        name: step.name,
        status: exitCode === 0 ? 'passed' : 'failed',
        exitCode,
        durationMs,
        stdout,
        stderr,
        processCleanup,
        ...(failureCode ? { failureCode } : {}),
        ...diagnosticPaths,
        ...(budgetMs === undefined ? {} : { budgetMs, budgetStatus: durationMs <= budgetMs ? 'within' : 'over' }),
      });
    };
    const spawnProcess = runtime.spawnProcess || spawn;
    let child;
    child = spawnProcess(step.command, step.args ?? [], {
      cwd: step.cwd,
      env: step.env ?? process.env,
      shell: step.shell ?? false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    lineageTracker = createOwnedDescendantTracker(child.pid, runtime);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(1, error));
    child.on('exit', (code, signal) => {
      if (settled || exitResult) return;
      exitResult = { code: Number.isInteger(code) ? code : 1, signal };
      cleanup();
      exitCloseTimer = scheduleTimeout(() => {
        stderr += `process-close-timeout: verification stdio did not close within ${exitCloseGraceMs} ms after child exit.\n`;
        finish(1, null, 'process-close-timeout');
      }, exitCloseGraceMs);
    });
    child.on('close', (code, signal) => {
      const finalSignal = signal ?? exitResult?.signal;
      if (finalSignal) stderr += `terminated by signal ${finalSignal}\n`;
      finish(Number.isInteger(code) ? code : exitResult?.code ?? 1);
    });
  });
}

export async function runVerificationBatch(steps, options = {}) {
  for (const step of steps) options.onStart?.(step);
  const results = await Promise.all(steps.map((step) => runVerificationStep(step)));
  for (let index = 0; index < results.length; index += 1) options.onComplete?.(results[index], steps[index]);
  return results;
}
