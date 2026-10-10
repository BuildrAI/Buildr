import { spawn } from 'node:child_process';
import type { CodeSource } from './code-file-reader.ts';

export type GitMutationProcessResult = { ok: boolean; timedOut: boolean; stdout: string; stderr: string; code: number | null };
/** Keep repository hooks, filters, signing and transport configuration effective. */
export function runCodeGitMutation(source: CodeSource, args: string[], options: { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number; outputLimit?: number } = {}): Promise<GitMutationProcessResult> {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  return new Promise(resolve => {
    const child = spawn('git', ['--literal-pathspecs', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', source.location, ...args], {
      env: { ...inherited, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', ...options.env }, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    });
    const limit = options.outputLimit ?? 1024 * 1024;
    let stdout = '', stderr = '', timedOut = false, settled = false;
    const append = (previous: string, value: Buffer) => (previous + value.toString('utf8')).slice(0, limit);
    child.stdout.on('data', (value: Buffer) => { stdout = append(stdout, value); });
    child.stderr.on('data', (value: Buffer) => { stderr = append(stderr, value); });
    let force: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* The process already exited. */ } };
    const timeout = setTimeout(() => { timedOut = true; kill('SIGTERM'); force = setTimeout(() => kill('SIGKILL'), 1000); }, options.timeoutMs ?? 30_000);
    const finish = (code: number | null, error?: Error) => { if (settled) return; settled = true; clearTimeout(timeout); if (force) clearTimeout(force); resolve({ ok: code === 0 && !error && !timedOut, timedOut, stdout, stderr: error ? (stderr + '\n' + error.message).trim() : stderr, code }); };
    child.once('error', error => finish(null, error));
    child.once('close', code => finish(code));
    child.stdin.on('error', () => {});
    child.stdin.end(options.input);
  });
}
