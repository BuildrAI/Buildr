/** An explicit RPC rejection, distinct from a transport failure with unknown delivery. */
export class NativeRequestError extends Error {
  readonly diagnostic: string;
  constructor(message?: string, secrets: readonly string[] = []) {
    super('agent_native_request_failed');
    this.diagnostic = errorDiagnostic(message, secrets) ?? '原生程序拒绝本次请求。';
  }
}
/** Observation can fail while the exact native execution continues. */
export class NativeObservationError extends Error {
  readonly diagnostic?: string;
  constructor(code: string, cause?: unknown, secrets: readonly string[] = []) {
    super(code);
    this.diagnostic = cause instanceof NativeObservationError ? cause.diagnostic
      : errorDiagnostic(cause instanceof Error ? cause.message : cause, secrets);
  }
}
/** Only explicit error messages cross the public boundary, never headers or whole responses. */
export function errorDiagnostic(value: unknown, secrets: readonly string[] = []): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  let message = value;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) message = message.split(secret).join('[已隐藏]');
  message = message
    .replace(/\b(?:set-cookie|cookie)\s*:\s*[^\r\n]*/gi, '[会话凭据已隐藏]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=$-]+/gi, '[认证已隐藏]')
    .replace(/\b(?:devin-session-token\$|sk-)[A-Za-z0-9_.-]+/g, '[凭据已隐藏]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[凭据已隐藏]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|password|client[_-]?secret)\s*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*')/gi, '$1[已隐藏]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|password|client[_-]?secret)\s*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi, '$1[已隐藏]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[地址已隐藏]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return message.slice(0, 1200) || undefined;
}
