import path from 'node:path';

function isFileCompletion(event: any): any  {
  if (event?.type !== 'test:complete') return false;
  const { data }: any = event;
  if (!data?.file || !data?.name || !Number.isFinite(data.details?.duration_ms)) return false;
  return path.resolve(data.name) === path.resolve(data.file);
}

export function formatSystemFileTiming(files: any): any  {
  const ordered: any = [...files].sort((left: any, right: any) => right.durationMs - left.durationMs || left.file.localeCompare(right.file));
  const details: any = ordered.map(({ file, durationMs, passed }: any) => `${path.basename(file)}:${Math.round(durationMs)}ms:${passed ? 'passed' : 'failed'}`);
  return `[buildr-system-file-timing] scope=transient files=${ordered.length} slowest-first=${details.join(',')}`;
}

export default async function* systemFileTimingReporter(source: any): Promise<any>  {
  const files: any[] = [];
  for await (const event of source) {
    if (['test:stdout', 'test:stderr'].includes(event?.type) && event.data?.message?.includes('[buildr-golden-journey-timing]')) {
      yield event.data.message;
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
