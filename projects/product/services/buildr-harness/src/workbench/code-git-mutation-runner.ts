import { parentPort, workerData } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import type { CodeSource } from './code-file-reader.ts';
import { codeGitEnvironment } from './code-git-environment.ts';

export type GitMutationProcessResult = { ok: boolean; timedOut: boolean; stdout: string; stderr: string; code: number | null };
type MutationOptions = { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number; outputLimit?: number };
let requestSequence = 0;
const pending = new Map<number, (result: GitMutationProcessResult) => void>();
if (parentPort && workerData?.buildrGitMutationBroker === true) {
  parentPort.on('message', message => {
    if (message?.type !== 'git-mutation-result') return;
    const resolve = pending.get(message.requestId);
    if (!resolve) return;
    pending.delete(message.requestId);
    resolve(message.result);
  });
}
/** Keep repository hooks, filters, signing and transport configuration effective. */
export function runCodeGitMutation(source: CodeSource, args: string[], options: MutationOptions = {}): Promise<GitMutationProcessResult> {
  // The host owns process handles and timers even if this Worker terminates.
  if (parentPort && workerData?.buildrGitMutationBroker === true) {
    return new Promise(resolve => {
      const requestId = ++requestSequence;
      pending.set(requestId, resolve);
      parentPort!.postMessage({ type: 'git-mutation', requestId, location: source.location, args, options });
    });
  }
  const inherited = codeGitEnvironment();
  return new Promise(resolve => {
    const child = spawn('git', ['--literal-pathspecs', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', source.location, ...args], {
      env: { ...inherited, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
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
    let processError: Error | undefined;
    child.once('error', error => { processError = error; });
    child.once('close', code => finish(code, processError));
    child.stdin.on('error', () => {});
    child.stdin.end(options.input);
  });
}
