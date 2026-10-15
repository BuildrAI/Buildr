import path from 'node:path';

const previewTimingPhase = '(?:workspace-first|workspace-second|start-first|fetch-first|start-second|reject-collision|list-both|stop-first|list-remaining|stop-second|confirm-second-exit)';
const previewTimingDiagnostic = new RegExp(`^\\[preview-isolation-timing\\] current=(?:setup|completed|${previewTimingPhase})(?: (?:cleanup|${previewTimingPhase})=\\d+ms)+$`, 'u');
const taskReviewPrefix = '[task-review-http] ';
const taskReviewBase = '/api/v1/workspaces/:workspaceId';
const taskReviewRequests: Record<string, [string, string]> = {
  'empty-slots': ['GET', `${taskReviewBase}/tasks/review-task/reviews`],
  'target-query-refused': ['GET', `${taskReviewBase}/tasks/review-task/reviews`],
  'missing-task': ['GET', `${taskReviewBase}/tasks/missing-task/reviews`],
  'result-writer-refused': ['POST', `${taskReviewBase}/tasks/review-task/reviews`],
  'recorded-planning': ['GET', `${taskReviewBase}/tasks/review-task/reviews`],
  'prompt-writer-refused': ['POST', `${taskReviewBase}/prompts/task-review`],
};
const taskReviewErrorNames = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError', 'AggregateError', 'SocketError', 'ConnectTimeoutError', 'HeadersTimeoutError', 'BodyTimeoutError', 'RequestAbortedError', 'ClientDestroyedError', 'ClientClosedError', 'InvalidArgumentError', 'RequestContentLengthMismatchError', 'ResponseContentLengthMismatchError']);
const taskReviewErrorCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ABORT_ERR', 'ERR_INVALID_URL', 'ERR_INVALID_STATE', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_DESTROYED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_ABORTED', 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH', 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH', 'UND_ERR_DESTROYED', 'UND_ERR_CLOSED', 'UND_ERR_INVALID_ARG']);
const taskReviewSyscalls = new Set(['read', 'write', 'connect', 'getaddrinfo', 'getnameinfo', 'recv', 'send', 'recvfrom', 'sendto', 'socket', 'shutdown']);

function taskReviewError(value: any): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, unknown> = {};
  for (const [key, allowed] of [['name', taskReviewErrorNames], ['code', taskReviewErrorCodes], ['syscall', taskReviewSyscalls]] as const) {
    if (!Object.hasOwn(value, key)) continue;
    if (typeof value[key] !== 'string' || !allowed.has(value[key])) return null;
    result[key] = value[key];
  }
  if (Object.hasOwn(value, 'errno')) {
    if (!Number.isSafeInteger(value.errno) || value.errno < -2147483648 || value.errno > 2147483647) return null;
    result.errno = value.errno;
  }
  // Even a native error message can contain a response snippet. Never forward it.
  if (Object.hasOwn(value, 'message') && (typeof value.message !== 'string' || value.message.length > 400 || /[\u0000-\u001f\u007f]/u.test(value.message))) return null;
  return result;
}

function projectTaskReviewDiagnostic(message: string): Record<string, unknown> | null {
  if (!message.startsWith(taskReviewPrefix) || Buffer.byteLength(message, 'utf8') > 2048 || /[\r\n]/u.test(message)) return null;
  let value: any;
  try { value = JSON.parse(message.slice(taskReviewPrefix.length)); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.phase !== 'string' || !Object.hasOwn(taskReviewRequests, value.phase)) return null;
  const [method, pathname] = taskReviewRequests[value.phase];
  if (value.method !== method || value.pathname !== pathname || !['started', 'passed', 'failed'].includes(value.status)
    || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0) return null;
  const result: Record<string, unknown> = { phase: value.phase, method, pathname, status: value.status, durationMs: value.durationMs };
  const hasHttpStatus = Object.hasOwn(value, 'httpStatus');
  if (hasHttpStatus && (!Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599)) return null;
  if (value.status === 'failed') {
    if (!['fetch', 'body-json'].includes(value.stage) || hasHttpStatus !== (value.stage === 'body-json')) return null;
    result.stage = value.stage;
    for (const field of ['error', 'cause']) {
      if (!Object.hasOwn(value, field)) continue;
      const projected = taskReviewError(value[field]);
      if (!projected) return null;
      result[field] = projected;
    }
  } else if (hasHttpStatus !== (value.status === 'passed') || Object.hasOwn(value, 'stage')) return null;
  if (hasHttpStatus) result.httpStatus = value.httpStatus;
  return result;
}

function isFileCompletion(event: any): any  {
  if (event?.type !== 'test:complete') return false;
  const { data }: any = event;
  if (!data?.file || !data?.name || !Number.isFinite(data.details?.duration_ms)) return false;
  return path.resolve(data.name) === path.resolve(data.file);
}

function caseIdentity(data: any): { file: string; key: string } | null {
  if (typeof data?.file !== 'string' || !data.file || typeof data.name !== 'string'
    || !Number.isInteger(data.line) || data.line < 1 || !Number.isInteger(data.column) || data.column < 1
    || (data.type ?? data.details?.type) === 'suite'
    || path.resolve(data.name) === path.resolve(data.file)) return null;
  const key = Number.isSafeInteger(data.testId) ? `test:${data.testId}`
    : JSON.stringify([data.line, data.column, data.nesting ?? 0, data.name]);
  return { file: data.file, key };
}

export function formatSystemFileTiming(files: any): any  {
  const ordered: any = [...files].sort((left: any, right: any) => right.durationMs - left.durationMs || left.file.localeCompare(right.file));
  const details: any = ordered.map(({ file, durationMs, passed }: any) => `${path.basename(file)}:${Math.round(durationMs)}ms:${passed ? 'passed' : 'failed'}`);
  return `[buildr-system-file-timing] scope=transient files=${ordered.length} slowest-first=${details.join(',')}`;
}

export default async function* systemFileTimingReporter(source: any): Promise<any>  {
  const files: any[] = [];
  let taskReviewDiagnostics = 0;
  const cases = new Map<string, { count: number; pending: Map<string, number[]> }>();
  for await (const event of source) {
    if (['test:dequeue', 'test:pass', 'test:fail'].includes(event?.type)) {
      const identity = caseIdentity(event.data);
      if (identity) {
        let file = cases.get(identity.file);
        let ordinal: number | undefined;
        if (event.type === 'test:dequeue') {
          if (!file) { file = { count: 0, pending: new Map() }; cases.set(identity.file, file); }
          const queue = file.pending.get(identity.key) ?? [];
          ordinal = ++file.count; queue.push(ordinal); file.pending.set(identity.key, queue);
        }
        const queue = file?.pending.get(identity.key);
        ordinal ??= queue?.[0];
        if (ordinal !== undefined) {
          const status = event.type === 'test:dequeue' ? 'started' : event.type === 'test:pass' ? 'passed' : 'failed';
          yield `[buildr-system-progress] ${JSON.stringify({ file: path.basename(identity.file.replaceAll('\\', '/')), case: ordinal, status })}\n`;
          if (event.type !== 'test:dequeue') { queue!.shift(); if (!queue!.length) file!.pending.delete(identity.key); }
        }
      }
    }
    if (['test:stdout', 'test:stderr'].includes(event?.type) && event.data?.message?.includes('[buildr-golden-journey-timing]')) {
      yield event.data.message;
    }
    if (event?.type === 'test:diagnostic' && typeof event.data?.message === 'string') {
      const message = event.data.message.replace(/\r?\n$/u, '');
      if (previewTimingDiagnostic.test(message)) yield `${message}\n`;
      else if (taskReviewDiagnostics < 24) {
        const projected = projectTaskReviewDiagnostic(message);
        if (projected) { taskReviewDiagnostics++; yield `${taskReviewPrefix}${JSON.stringify(projected)}\n`; }
      }
    }
    if (!isFileCompletion(event)) continue;
    files.push({
      file: event.data.file,
      durationMs: event.data.details.duration_ms,
      passed: event.data.details.passed === true,
    });
  }
  yield `${formatSystemFileTiming(files)}\n`;
}
