import { errorDiagnostic } from '../domain/error-diagnostic.ts';
import { ModelAccessError } from './contracts.ts';

/** Unexpected exceptions stay private; typed model failures retain their safe diagnosis. */
export function modelFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ModelAccessError) return { code: error.code, message: errorDiagnostic(error.message) ?? '模型请求未完成。' };
  const code = error instanceof Error && /^model_[a-z0-9_]{1,100}$/.test(error.message) ? error.message : 'model_upstream_failed';
  return { code, message: `模型响应流未完成（${code}）。` };
}

export function upstreamFailure(value: unknown, status = 502): ModelAccessError {
  const error = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const code = typeof error.code === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(error.code) ? error.code : 'model_upstream_failed';
  const message = errorDiagnostic(error.message);
  return new ModelAccessError(code, message ? `${code}: ${message}` : `模型请求响应失败（HTTP ${status}，${code}）。`, status);
}
