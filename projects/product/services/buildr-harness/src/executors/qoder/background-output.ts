import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const maxBytes = 8 * 1024;

/** Read only the per-session task file supplied by an owned native launch receipt. */
export async function qoderBackgroundOutput(file: string, contextId: string, taskId: string): Promise<string | undefined> {
  const uid = process.getuid?.();
  if (uid === undefined || !isAbsolute(file) || !/^[a-z0-9-]+$/i.test(taskId) || !/^[a-z0-9-]+$/i.test(contextId)) return;
  const temp = await realpath(tmpdir());
  const lexical = relative(resolve(tmpdir()), resolve(file)).split(sep);
  const parts = lexical[0] === '..' ? relative(temp, resolve(file)).split(sep) : lexical;
  if (parts.length !== 5 || parts[0] !== `qoder-cli-${uid}` || parts[2] !== contextId ||
      parts[3] !== 'tasks' || parts[4] !== `${taskId}.output`) return;
  const path = join(temp, ...parts);
  if (await realpath(path) !== path) return;
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const { size, uid: owner } = await handle.stat().then(stat => stat.isFile() ? stat : {size: 0, uid: -1});
    if (owner !== uid || size === 0) return;
    const buffer = Buffer.alloc(Math.min(size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, size - buffer.length);
    const text = buffer.toString('utf8', 0, bytesRead).replace(/^\uFFFD+/, '');
    return text && (size > maxBytes ? '[显示最近 8 KiB 输出]\n' + text : text);
  } finally {
    await handle.close();
  }
}
