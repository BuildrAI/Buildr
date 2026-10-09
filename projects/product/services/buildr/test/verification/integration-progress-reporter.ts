import path from 'node:path';

function isFileEvent(data: any): boolean {
  return typeof data?.file === 'string' && typeof data.name === 'string'
    && path.resolve(data.name) === path.resolve(data.file);
}

function safeCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value) ? value : null;
}

function failureIdentity(error: any): any {
  return {
    code: safeCode(error?.code),
    failureType: safeCode(error?.failureType),
    causeCode: safeCode(error?.cause?.code),
    exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
    signal: typeof error?.signal === 'string' && /^SIG[A-Z0-9]+$/.test(error.signal) ? error.signal : null,
  };
}

function label(data: any): any {
  return {
    file: path.basename(data.file),
    name: isFileEvent(data) ? path.basename(data.file) : String(data.name).replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 240),
  };
}

/**
 * File completion remains visible when Node buffers a later file's individual test events.
 * Diagnostics never copy assertion values or process output; individual names can still be delayed.
 */
export default async function* integrationProgressReporter(source: any): Promise<any> {
  for await (const event of source) {
    const data = event?.data;
    if (typeof data?.file !== 'string' || typeof data.name !== 'string') continue;
    if (event.type === 'test:dequeue' && isFileEvent(data)) {
      yield `[buildr-integration-progress] ${JSON.stringify({ ...label(data), status: 'started' })}\n`;
      continue;
    }
    if (event.type !== 'test:complete' || !Number.isFinite(data.details?.duration_ms)) continue;
    if (!isFileEvent(data) && data.details.passed !== false) continue;
    yield `[buildr-integration-progress] ${JSON.stringify({
      ...label(data),
      status: data.details.passed === true ? 'passed' : 'failed',
      durationMs: Math.round(data.details.duration_ms),
      ...(data.details.passed === false ? { error: failureIdentity(data.details.error) } : {}),
    })}\n`;
  }
}
