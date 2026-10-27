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
