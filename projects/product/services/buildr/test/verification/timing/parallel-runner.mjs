import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { parseVerificationPhaseTimings } from './phases.mjs';

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
  const digest = (value) => `sha256-${crypto.createHash('sha256').update(value || '').digest('hex')}`;
  return {
    stdoutPath,
    stderrPath,
    diagnosticDigests: { stdout: digest(stdout), stderr: digest(stderr) },
  };
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
let sharedProcessSamplingMetrics = { requests: 0, snapshots: 0 };

function sharedListProcesses() {
  sharedProcessSamplingMetrics.requests += 1;
  const now = Date.now();
  if (sharedProcessSnapshot && now - sharedProcessSnapshotAt < 40) return sharedProcessSnapshot;
  sharedProcessSamplingMetrics.snapshots += 1;
  sharedProcessSnapshot = defaultListProcesses();
  sharedProcessSnapshotAt = now;
  return sharedProcessSnapshot;
}

export function resetProcessLineageSamplingMetrics() {
  sharedProcessSnapshot = null;
  sharedProcessSnapshotAt = 0;
  sharedProcessSamplingMetrics = { requests: 0, snapshots: 0 };
}

export function readProcessLineageSamplingMetrics() {
  return { ...sharedProcessSamplingMetrics };
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
  const platform = runtime.platform ?? process.platform;
  const phaseOutputPath = step.diagnosticsDirectory
    ? path.join(path.resolve(step.diagnosticsDirectory), `${diagnosticBaseName(step)}.phases.jsonl`)
    : null;
  if (phaseOutputPath) {
    fs.mkdirSync(path.dirname(phaseOutputPath), { recursive: true });
    fs.rmSync(phaseOutputPath, { force: true });
  }
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let processCleanup = { status: 'pending', ownership: 'unavailable' };
    let lineageTracker = null;
    let cleanupCompleted = false;
    let terminating = false;
    let exitCloseTimer = null;
    let wallTimer = null;
    let abortListener = null;
    let exitResult = null;
    const requestedExitCloseGraceMs = runtime.exitCloseGraceMs ?? 10_000;
    const exitCloseGraceMs = Number.isFinite(requestedExitCloseGraceMs) && requestedExitCloseGraceMs >= 0 ? requestedExitCloseGraceMs : 10_000;
    const scheduleTimeout = runtime.setTimeout ?? setTimeout;
    const cancelTimeout = runtime.clearTimeout ?? clearTimeout;
    const wait = runtime.wait ?? ((delayMs) => new Promise((resolveWait) => setTimeout(resolveWait, delayMs)));
    const timeoutMs = Number.isFinite(step.timeoutMs) && step.timeoutMs > 0 ? step.timeoutMs : null;
    const terminationGraceMs = Number.isFinite(runtime.terminationGraceMs) && runtime.terminationGraceMs >= 0 ? runtime.terminationGraceMs : 2_000;
    const terminationConfirmMs = Number.isFinite(runtime.terminationConfirmMs) && runtime.terminationConfirmMs >= 0 ? runtime.terminationConfirmMs : 1_000;
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
    const finish = (exitCode, error = null, failureCode = null, statusOverride = null) => {
      if (settled) return;
      settled = true;
      if (exitCloseTimer !== null) cancelTimeout(exitCloseTimer);
      exitCloseTimer = null;
      if (wallTimer !== null) cancelTimeout(wallTimer);
      wallTimer = null;
      if (abortListener && runtime.signal) runtime.signal.removeEventListener('abort', abortListener);
      abortListener = null;
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
      const phaseOutput = phaseOutputPath && fs.existsSync(phaseOutputPath)
        ? fs.readFileSync(phaseOutputPath, 'utf8')
        : '';
      resolve({
        name: step.name,
        status: statusOverride ?? (exitCode === 0 ? 'passed' : 'failed'),
        exitCode,
        durationMs,
        process: Number.isInteger(child?.pid) ? { pid: child.pid, processGroupId: platform === 'win32' ? null : child.pid } : null,
        stdout,
        stderr,
        processCleanup,
        phases: parseVerificationPhaseTimings(phaseOutput || `${stdout}\n${stderr}`),
        ...(failureCode ? { failureCode } : {}),
        ...diagnosticPaths,
        ...(budgetMs === undefined ? {} : { budgetMs, budgetStatus: durationMs <= budgetMs ? 'within' : 'over' }),
      });
    };
    const spawnProcess = runtime.spawnProcess || spawn;
    let child;
    child = spawnProcess(step.command, step.args ?? [], {
      cwd: step.cwd,
      env: phaseOutputPath
        ? { ...(step.env ?? process.env), BUILDR_VERIFICATION_PHASE_OUTPUT: phaseOutputPath }
        : step.env ?? process.env,
      shell: step.shell ?? false,
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    lineageTracker = createOwnedDescendantTracker(child.pid, runtime);
    const processGroupId = platform === 'win32' ? null : child.pid;
    runtime.onSpawn?.({ pid: child.pid, processGroupId, startedAt });
    const terminate = async (failureCode, status, message) => {
      if (settled || terminating) return;
      terminating = true;
      if (wallTimer !== null) cancelTimeout(wallTimer);
      wallTimer = null;
      stderr += `${message}\n`;
      cleanup();
      await wait(terminationGraceMs);
      const forced = { processGroup: [], descendants: [] };
      if (platform === 'win32') {
        const result = (runtime.killTree ?? spawnSync)('taskkill', ['/pid', String(child.pid), '/t', '/f'], { encoding: 'utf8' });
        if (result.status !== 0 && !/not found|no running instance/i.test(`${result.stdout || ''}\n${result.stderr || ''}`)) {
          forced.processGroup.push({ pid: child.pid, error: `${result.stdout || ''}\n${result.stderr || ''}`.trim() || `taskkill exited ${result.status}` });
        }
      } else {
        try {
          (runtime.kill ?? process.kill)(-child.pid, 0);
          (runtime.kill ?? process.kill)(-child.pid, 'SIGKILL');
          forced.processGroup.push({ pid: child.pid, signal: 'SIGKILL' });
        } catch (error) {
          if (error.code !== 'ESRCH') forced.processGroup.push({ pid: child.pid, error: error.message });
        }
        const owned = processCleanup.descendants?.observed ?? [];
        for (const pid of owned) {
          try {
            (runtime.kill ?? process.kill)(pid, 0);
            (runtime.kill ?? process.kill)(pid, 'SIGKILL');
            forced.descendants.push({ pid, signal: 'SIGKILL' });
          } catch (error) {
            if (error.code !== 'ESRCH') forced.descendants.push({ pid, error: error.message });
          }
        }
      }
      const kill = runtime.kill ?? process.kill;
      const confirmationTargets = platform === 'win32'
        ? [{ pid: child.pid, target: child.pid, kind: 'pid-tree' }]
        : [{ pid: child.pid, target: -child.pid, kind: 'process-group' }, ...(processCleanup.descendants?.observed ?? []).map((pid) => ({ pid, target: pid, kind: 'descendant' }))];
      const deadline = Date.now() + terminationConfirmMs;
      let remaining = confirmationTargets;
      while (remaining.length > 0) {
        const next = [];
        for (const target of remaining) {
          try {
            kill(target.target, 0);
            next.push(target);
          } catch (error) {
            if (error.code !== 'ESRCH') forced.descendants.push({ pid: target.pid, error: `exit confirmation failed: ${error.message}` });
          }
        }
        remaining = next;
        if (remaining.length === 0 || Date.now() >= deadline) break;
        await wait(Math.min(25, Math.max(1, deadline - Date.now())));
      }
      for (const target of remaining) forced.descendants.push({ pid: target.pid, error: `${target.kind} remained alive after ${terminationConfirmMs} ms exit confirmation` });
      const forceFailures = [...forced.processGroup, ...forced.descendants].filter((item) => item.error);
      processCleanup = {
        ...processCleanup,
        status: processCleanup.status === 'failed' || forceFailures.length > 0 ? 'failed' : 'clean',
        escalation: { graceMs: terminationGraceMs, confirmationMs: terminationConfirmMs, forced },
      };
      finish(status === 'timed-out' ? 124 : 130, null, failureCode, status);
    };
    if (timeoutMs !== null) {
      wallTimer = scheduleTimeout(() => {
        void terminate('capability-timeout', 'timed-out', `capability-timeout: ${step.id ?? step.name} exceeded ${timeoutMs} ms (pid=${child.pid}, pgid=${processGroupId ?? 'n/a'}).`);
      }, timeoutMs);
      wallTimer?.unref?.();
    }
    if (runtime.signal) {
      if (runtime.signal.aborted) void terminate('capability-cancelled', 'cancelled', `capability-cancelled: ${step.id ?? step.name} was cancelled.`);
      else {
        abortListener = () => void terminate('capability-cancelled', 'cancelled', `capability-cancelled: ${step.id ?? step.name} was cancelled.`);
        runtime.signal.addEventListener('abort', abortListener, { once: true });
      }
    }
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(1, error));
    child.on('exit', (code, signal) => {
      if (settled || terminating || exitResult) return;
      exitResult = { code: Number.isInteger(code) ? code : 1, signal };
      cleanup();
      exitCloseTimer = scheduleTimeout(() => {
        stderr += `process-close-timeout: verification stdio did not close within ${exitCloseGraceMs} ms after child exit.\n`;
        finish(1, null, 'process-close-timeout');
      }, exitCloseGraceMs);
    });
    child.on('close', (code, signal) => {
      if (terminating) return;
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
