import path from 'node:path';

const previewTimingPhase = '(?:workspace-first|workspace-second|start-first|fetch-first|start-second|reject-collision|list-both|stop-first|list-remaining|stop-second|confirm-second-exit)';
const previewTimingDiagnostic = new RegExp(`^\\[preview-isolation-timing\\] current=(?:setup|completed|${previewTimingPhase})(?: (?:cleanup|${previewTimingPhase})=\\d+ms)+$`, 'u');

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
