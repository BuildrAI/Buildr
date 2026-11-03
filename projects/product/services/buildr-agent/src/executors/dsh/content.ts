import path from 'node:path';
import type { NativeContentContext, NativeContentInventory } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';

export function dshContent(input: NativeContentContext): NativeContentInventory | undefined {
  if (!/^session-[a-f0-9-]{36}$/.test(input.contextId)) return;
  const files = nativeContentFiles(input, path.join(input.configRoot, 'dsh-home/sessions'), file => path.basename(path.dirname(file)) === input.contextId && /^session\.v4\.jsonl(?:\.zstd)?$/.test(path.basename(file)), 4);
  if (files.length !== 1) return;
  const rows = nativeContentRows(input, 'dsh', files[0]!), header = rows[0]?.value;
  if (header?.type !== 'session' || header.version !== 4 || header.id !== input.contextId || header.cwd !== input.cwd ||
    rows.slice(1).some((row, index) => row.value.seq !== index)) return;
  return { sourcePaths: files, records: rows.flatMap(row => {
    const id = row.value.type === 'tool/call' ? row.value.data?.callId : row.value.type === 'tool/result' ? row.value.data?.message?.toolCallId : undefined;
    return typeof id === 'string' ? [{ ...row, toolIds: [id] }] : [];
  }), images: rows.filter(row => row.value.type === 'user/message')
    .flatMap(row => nativeContentImages(row, ['data', 'content'], row.value.data?.content)) };
}
