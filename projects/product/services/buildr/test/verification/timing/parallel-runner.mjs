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

export async function runVerificationStep(step, runtime = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let processCleanup = { status: 'pending', ownership: 'unavailable' };
    const finish = (exitCode, error = null) => {
      if (settled) return;
      settled = true;
      if (error) stderr += `${error.message}\n`;
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
        ...diagnosticPaths,
        ...(budgetMs === undefined ? {} : { budgetMs, budgetStatus: durationMs <= budgetMs ? 'within' : 'over' }),
      });
    };
    const spawnProcess = runtime.spawnProcess || spawn;
    const child = spawnProcess(step.command, step.args ?? [], {
      cwd: step.cwd,
      env: step.env ?? process.env,
      shell: step.shell ?? false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(1, error));
    child.on('close', (code, signal) => {
      processCleanup = cleanupOwnedProcessGroup(child.pid, runtime);
      if (signal) stderr += `terminated by signal ${signal}\n`;
      finish(Number.isInteger(code) ? code : 1);
    });
  });
}

export async function runVerificationBatch(steps, options = {}) {
  for (const step of steps) options.onStart?.(step);
  const results = await Promise.all(steps.map((step) => runVerificationStep(step)));
  for (let index = 0; index < results.length; index += 1) options.onComplete?.(results[index], steps[index]);
  return results;
}
