import { spawn } from 'node:child_process';
import { failure } from '../domain/instance.ts';
import { connectionProgramEnvironment, type ResolvedProgram } from './program.ts';

const failures = {
  'interaction-required': ['interaction_required', '需要本人扫码或确认，请使用browserMode=interactive继续授权；未替换个人认证。'],
  'dependency-unavailable': ['dependency_unavailable', '授权所需浏览器或依赖不可用，请检查接入方法的安装说明；未替换个人认证。'],
  'browser-closed': ['browser_closed', '授权浏览器已关闭；未替换个人认证，可重新发起授权。'],
  'session-invalid': ['session_invalid', '外部登录尚未产生有效会话；未替换个人认证，请重新完成授权。'],
  cancelled: ['cancelled', '本次授权已取消；未替换个人认证。'],
  timeout: ['timeout', '等待授权超时；未替换个人认证。'],
  'authorization-failed': ['failed', '外部授权未完成；未替换个人认证，请重新检查授权页面。'],
} as const;

/** Only IPC carries the new group. Never retain or expose either output stream. */
export function runAuthorizationProgram(program: ResolvedProgram, args: string[], context: Record<string, unknown>, options: { signal?: AbortSignal; timeoutMs: number; browser?: { request(method: string, params?: unknown, sessionId?: string): Promise<unknown> } }): Promise<unknown> {
  if (options.signal?.aborted) return Promise.reject(failure('connection_skill_authorization_cancelled', '本次授权已取消；未替换个人认证。', 409));
  return new Promise((resolve, reject) => {
    const child = spawn(program.executable, [...program.args, ...args], { cwd: program.cwd, env: connectionProgramEnvironment(), shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let finished = false, resultCount = 0, candidate: unknown, invalid = false, outputBytes = 0, failureReason: keyof typeof failures | undefined;
    const browserRequests = new Set<string>();
    let stopped: 'cancelled' | 'timeout' | 'output-limit' | undefined, killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ }
    };
    const stop = (reason: typeof stopped) => {
      if (finished || stopped) return;
      stopped = reason;
      if (child.connected) child.send({ type: 'buildr.connection-authorization-cancel', callId: context.callId }, () => {});
      kill('SIGTERM');
      killTimer = setTimeout(() => { kill('SIGKILL'); child.stdout?.destroy(); child.stderr?.destroy(); if (child.connected) child.disconnect(); finish(null); }, 3000);
    };
    const abort = () => stop('cancelled');
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs);
    const finish = (exitCode: number | null, spawnFailed = false) => {
      if (finished) return;
      finished = true; clearTimeout(timer); if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', abort);
      if (options.signal?.aborted || stopped === 'cancelled') reject(failure('connection_skill_authorization_cancelled', '本次授权已取消；未替换个人认证。'));
      else if (stopped === 'timeout') reject(failure('connection_skill_authorization_timeout', '等待授权超时；未替换个人认证。'));
      else if (!stopped && !spawnFailed && !invalid && resultCount === 1 && failureReason) { const [code, message] = failures[failureReason]; reject(failure('connection_skill_authorization_' + code, message)); }
      else if (stopped || spawnFailed || exitCode !== 0 || invalid || resultCount !== 1) reject(failure('connection_skill_authorization_failed', '授权程序未返回唯一有效结果；未替换个人认证，请检查本机程序或重新授权。'));
      else resolve(candidate);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const discard = (chunk: Buffer) => { outputBytes += chunk.length; if (outputBytes > 2 * 1024 * 1024) stop('output-limit'); };
    child.stdout!.on('data', discard); child.stderr!.on('data', discard);
    child.on('message', message => {
      if (stopped || finished) return;
      if (!message || typeof message !== 'object') { invalid = true; return; }
      const result = message as Record<string, unknown>;
      if (result.type === 'buildr.browser-request') {
        if (!options.browser || result.callId !== context.callId || typeof result.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(result.requestId) || typeof result.method !== 'string' || browserRequests.has(result.requestId) || browserRequests.size >= 32 || Buffer.byteLength(JSON.stringify(result)) > 256 * 1024 || result.sessionId !== undefined && typeof result.sessionId !== 'string' || Object.keys(result).some(key => !['type', 'callId', 'requestId', 'method', 'params', 'sessionId'].includes(key))) { invalid = true; stop('output-limit'); return; }
        const requestId = result.requestId;
        browserRequests.add(requestId);
        void options.browser.request(result.method, result.params, result.sessionId as string | undefined)
          .then(value => { if (!finished && !stopped && child.connected) child.send({ type: 'buildr.browser-result', callId: context.callId, requestId, result: value }, () => {}); })
          .catch((error: any) => { if (!finished && !stopped && child.connected) child.send({ type: 'buildr.browser-result', callId: context.callId, requestId, error: /^browser_authorization_[a-z_]+$/.test(error?.code) ? error.code : 'browser_request_failed' }, () => {}); })
          .finally(() => browserRequests.delete(requestId));
        return;
      }
      if (result.type !== 'buildr.connection-auth-result') { invalid = true; return; }
      resultCount++;
      if (resultCount !== 1 || result.callId !== context.callId) { invalid = true; return; }
      if (result.status === 'failure') {
        if (typeof result.reason !== 'string' || !Object.hasOwn(failures, result.reason) || Object.keys(result).some(key => !['type', 'callId', 'status', 'reason'].includes(key))) invalid = true;
        else failureReason = result.reason as keyof typeof failures;
        return;
      }
      if (result.status !== 'success' || Object.keys(result).some(key => !['type', 'callId', 'status', 'values'].includes(key))) { invalid = true; return; }
      try { if (Buffer.byteLength(JSON.stringify(result.values)) > 32 * 1024) { invalid = true; return; } }
      catch { invalid = true; return; }
      candidate = result.values;
    });
    child.once('spawn', () => { if (!stopped) child.send({ type: 'buildr.connection-authorization-context', context }, error => { if (error) { invalid = true; stop('output-limit'); } }); });
    child.once('error', () => finish(null, true));
    child.once('close', code => finish(code));
  });
}
