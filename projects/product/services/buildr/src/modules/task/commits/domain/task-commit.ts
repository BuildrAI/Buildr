import { isTaskRecordId } from '../../domain/task.ts';

export type TaskTrailer = { taskId: string | null; values: string[]; diagnostic: 'invalid' | 'conflict' | null };

/** Only a terminal trailer paragraph is authoritative; prose and quoted examples are not. */
export function parseTaskCommitTrailer(message: string): TaskTrailer {
  const paragraphs = message.replace(/\r\n/g, '\n').trimEnd().split(/\n[ \t]*\n/);
  const empty: TaskTrailer = { taskId: null, values: [], diagnostic: null };
  if (paragraphs.length < 2) return empty;
  const trailers: Array<{ key: string; value: string }> = [];
  for (const line of paragraphs[paragraphs.length - 1].split('\n')) {
    const match = /^([A-Za-z0-9-]+):[ \t]*(.*)$/.exec(line);
    if (match) trailers.push({ key: match[1].toLowerCase(), value: match[2].trim() });
    else if (/^[ \t]+\S/.test(line) && trailers.length) trailers[trailers.length - 1].value += `\n${line.trim()}`;
    else return empty;
  }
  const values = [...new Set(trailers.filter(item => item.key === 'buildr-task').map(item => item.value))];
  if (!values.length) return empty;
  if (values.some(value => !isTaskRecordId(value))) return { taskId: null, values, diagnostic: 'invalid' };
  if (values.length > 1) return { taskId: null, values, diagnostic: 'conflict' };
  return { taskId: values[0], values, diagnostic: null };
}

export { parseGitCommitObject, type GitCommit } from '@buildr-ai/buildr-harness/workbench';
