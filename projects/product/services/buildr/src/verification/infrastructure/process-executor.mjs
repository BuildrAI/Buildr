import { spawn } from 'node:child_process';

export function executeVerificationCommand(step, options = {}) {
  const [command, ...args] = step.command.argv;
  const started = process.hrtime.bigint();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      resolve({ status: 'failed', exitCode: 1, signal: null, durationMs: Number(process.hrtime.bigint() - started) / 1e6, stdout, stderr: `${stderr}${error.stack || error.message}\n` });
    });
    child.on('close', (code, signal) => {
      resolve({ status: code === 0 && !signal ? 'passed' : 'failed', exitCode: code, signal, durationMs: Number(process.hrtime.bigint() - started) / 1e6, stdout, stderr });
    });
  });
}
