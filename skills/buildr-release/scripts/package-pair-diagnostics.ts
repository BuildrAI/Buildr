import { containsCredentialMaterial } from './release-authority.ts';

/** Informational diagnostics only; these fields never establish compatibility. */
export interface PairExecutionDiagnostic {
  stage: string;
  code: string;
  exitCode?: number | null;
  signal?: string | null;
  errorCode?: string;
  message?: string;
  stderr?: string;
}

function safeText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim();
  // Check the complete text before truncation, including credentials crossing the limit.
  if (containsCredentialMaterial(text) || /(?:npm_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|(?:authorization|password|secret|(?:_auth)?token|_auth)\s*[=:]|https?:\/\/[^/\s:@]+:[^/\s@]+@|\bBearer\s+[A-Za-z0-9._~+/-]{8,})/i.test(text)) return '[sensitive diagnostic omitted]';
  return text.slice(0, limit);
}

export function pairExecutionDiagnostic(stage: string, code: string, value: any = {}): PairExecutionDiagnostic {
  value = value && typeof value === 'object' ? value : typeof value === 'string' ? { message: value } : {};
  const result: PairExecutionDiagnostic = {
    stage: /^[a-z][a-z0-9-]{0,63}$/.test(stage) ? stage : 'pair-verification',
    code: /^[a-z][a-z0-9-]{0,95}$/.test(code) ? code : 'pair-verification-error',
  };
  const exitCode = value.exitCode ?? value.status;
  if (Number.isSafeInteger(exitCode) || value.exitCode === null || value.status === null) result.exitCode = exitCode ?? null;
  if (value.signal === null || /^SIG[A-Z0-9]{1,16}$/.test(value.signal ?? '')) result.signal = value.signal;
  const errorCode = value.errorCode ?? value.error?.code ?? (value.stage ? undefined : value.code);
  if (typeof errorCode === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(errorCode) && safeText(errorCode, 64) === errorCode) result.errorCode = errorCode;
  const message = safeText(value.error?.message ?? value.message, 1024), stderr = safeText(value.stderr, 2048);
  if (message) result.message = message;
  if (stderr) result.stderr = stderr;
  return result;
}
