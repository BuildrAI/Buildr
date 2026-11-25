/** Bounded retry classification for strictly read-only GitHub CLI calls. */
export function isRetryableReadOnlyGhArgs(args: readonly string[]): boolean {
  if (!Array.isArray(args) || args.length === 0) return false;
  if (args[0] === 'api') {
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]!;
      if (['-X', '-f', '-F'].includes(arg) || /^--(?:method|raw-field|field|input)(?:=|$)/u.test(arg)) {
        if ((arg === '-X' || arg === '--method') && args[index + 1]?.toUpperCase() === 'GET') {
          index += 1;
          continue;
        }
        if (arg === '--method=GET') continue;
        return false;
      }
    }
    return true;
  }
  if (args[0] === 'run' && (args[1] === 'view' || args[1] === 'list')) return true;
  if (args[0] === 'pr' && args[1] === 'view') return true;
  if (args[0] === 'pr' && args[1] === 'checks' && !args.includes('--watch')) return true;
  if (args[0] === 'release' && (args[1] === 'view' || args[1] === 'list')) return true;
  return false;
}

export function isTransientGhNetworkFailure(value: unknown): boolean {
  const record = (value ?? {}) as { error?: { code?: unknown; message?: unknown }; stderr?: unknown; message?: unknown };
  const text = [record.error?.code, record.error?.message, record.stderr, record.message]
    .filter(item => typeof item === 'string' && item.length > 0)
    .join('\n');
  if (!text) return false;
  return /\b(?:ECONNRESET|EPIPE|connection reset by peer|TLS handshake timeout|unexpected EOF|bad gateway|gateway timeout)\b|:\s*EOF(?:\s|$)|\bHTTP\s+50[24]\b/iu.test(text);
}

export function pauseSync(milliseconds: number): void {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
