import path from 'node:path';

function isFileCompletion(event) {
  if (event?.type !== 'test:complete') return false;
  const { data } = event;
  if (!data?.file || !data?.name || !Number.isFinite(data.details?.duration_ms)) return false;
  return path.resolve(data.name) === path.resolve(data.file);
}

export function formatSystemFileTiming(files) {
  const ordered = [...files].sort((left, right) => right.durationMs - left.durationMs || left.file.localeCompare(right.file));
  const details = ordered.map(({ file, durationMs, passed }) => `${path.basename(file)}:${Math.round(durationMs)}ms:${passed ? 'passed' : 'failed'}`);
  return `[buildr-system-file-timing] scope=transient files=${ordered.length} slowest-first=${details.join(',')}`;
}

export default async function* systemFileTimingReporter(source) {
  const files = [];
  for await (const event of source) {
    if (!isFileCompletion(event)) continue;
    files.push({
      file: event.data.file,
      durationMs: event.data.details.duration_ms,
      passed: event.data.details.passed === true,
    });
  }
  yield `${formatSystemFileTiming(files)}\n`;
}
