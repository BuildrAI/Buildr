import crypto from 'node:crypto';

export type WebRestartFailure = { code: string; message: string };
export type WebRestartStatus = { status: 'idle' | 'restarting' } | { status: 'failed'; error: WebRestartFailure };

/** The old host owns one private restart attempt until it starts shutting down. */
export function createWebRestartControl(isClosing: () => boolean, {
  timeoutMs = 30_000,
  schedule = (expire: () => void, milliseconds: number): (() => void) => {
    const timer = setTimeout(expire, milliseconds);
    timer.unref();
    return () => clearTimeout(timer);
  },
}: { timeoutMs?: number; schedule?: (expire: () => void, milliseconds: number) => () => void } = {}) {
  let attempt: string | null = null;
  let failure: WebRestartFailure | null = null;
  let cancelTimeout: (() => void) | null = null;
  const fail = (token: string, error: WebRestartFailure): boolean => {
    if (attempt !== token || isClosing()) return false;
    cancelTimeout?.();
    cancelTimeout = null;
    failure = { code: (error.code || 'web_restart_process_failed').slice(0, 200), message: (error.message || 'Buildr Web 重启后继启动失败。').slice(0, 4096) };
    attempt = null;
    return true;
  };
  return {
    inProgress: () => attempt !== null,
    status: (): WebRestartStatus => attempt ? { status: 'restarting' } : failure ? { status: 'failed', error: { ...failure } } : { status: 'idle' },
    begin(): string {
      if (attempt) throw Object.assign(new Error('Buildr Web 重启已在进行。'), { code: 'restart_in_progress', status: 409 });
      attempt = crypto.randomBytes(32).toString('hex');
      failure = null;
      const token = attempt;
      cancelTimeout = schedule(() => fail(token, { code: 'web_restart_readiness_timeout', message: '重启后继未在预期时间内完成交接，当前实例仍在运行，可以重新发起重启。' }), timeoutMs);
      return attempt;
    },
    permitsShutdown(token: unknown): boolean {
      if (token !== undefined && token !== null) return typeof token === 'string' && attempt !== null && token === attempt;
      return attempt === null;
    },
    fail,
    dispose(): void { cancelTimeout?.(); cancelTimeout = null; },
  };
}
