import fs from 'node:fs';
import path from 'node:path';
import { nativeContentFiles } from '../native-content.ts';

const tailBudget = 2 * 1024 * 1024;

/** Native per-request/context observations only. Never use ACP's summed billing usage. */
export function readQoderCnUsage(config: string, contextId: string, cwd: string): { usedTokens?: number; usedRatio?:number; key: string } | undefined {
  if (!/^[a-f0-9-]{36}$/.test(contextId)) return;
  try {
    const root = path.dirname(config);
    if (fs.lstatSync(config).isSymbolicLink()) return;
    const input = { root, configRoot: root, contextId, cwd };
    const files = nativeContentFiles(input, path.join(config, 'projects'), file => path.basename(file) === contextId + '.jsonl', 3);
    if (files.length !== 1) return;
    const file = files[0]!, before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) return;
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let text: string;
    try {
      const opened = fs.fstatSync(fd);
      if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) return;
      const start = Math.max(0, before.size - tailBudget), buffer = Buffer.alloc(before.size - start);
      let read = 0;
      while (read < buffer.length) {
        const n = fs.readSync(fd, buffer, read, buffer.length - read, start + read);
        if (!n) return;
        read += n;
      }
      const after = fs.fstatSync(fd), current = fs.lstatSync(file);
      if (after.ino !== before.ino || after.dev !== before.dev || current.ino !== before.ino || current.dev !== before.dev ||
          current.isSymbolicLink() || after.size < before.size || after.size === before.size && after.mtimeMs !== before.mtimeMs) return;
      const first = start ? buffer.indexOf(10) + 1 : 0, last = buffer.lastIndexOf(10);
      if (last < first || start && first === 0) return;
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(first, last));
    } finally { fs.closeSync(fd); }
    const rows = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
    const primary = rows.filter(row => row.sessionId === contextId && row.cwd === cwd && row.isSidechain === false && typeof row.uuid === 'string');
    const indexed = new Map(primary.map(row => [row.uuid, row]));
    const leaf = rows.findLast(row => row.type === 'active-leaf' && row.sessionId === contextId)?.leafUuid;
    let id = leaf; const seen = new Set<string>();
    while (typeof id === 'string' && !seen.has(id)) {
      seen.add(id);
      const row = indexed.get(id);
      if (!row) return;
      if (row.type === 'system' && /compact/i.test(String(row.subtype ?? ''))) return;
      if (row.type === 'assistant') {
        const usage = row.message?.usage;
        // input_tokens is this exact native request, not a sum over iterations.
        const used = usage?.input_tokens;
        const ratio=usage?.context_usage_ratio;
        const validRatio=typeof ratio==='number'&&Number.isFinite(ratio)&&ratio>=0&&ratio<=1;
        if (Number.isSafeInteger(used) && used > 0 || validRatio)
          return {...(Number.isSafeInteger(used)&&used>0?{usedTokens:used}:{}),...(validRatio?{usedRatio:ratio}:{}),key:`${row.uuid}:${used}:${ratio}`};
      }
      id = row.parentUuid;
    }
    return;
  } catch { return; }
}
