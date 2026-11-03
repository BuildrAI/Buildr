import path from 'node:path';
import type { NativeContentContext, NativeContentInventory } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';

export function qoderContent(input: NativeContentContext): NativeContentInventory | undefined {
  if (!/^[a-f0-9-]{36}$/.test(input.contextId)) return;
  const files = nativeContentFiles(input, path.join(input.configRoot, 'qoder-config/projects'), file => path.basename(file) === input.contextId + '.jsonl', 3);
  if (files.length !== 1) return;
  const rows = nativeContentRows(input, 'qoder', files[0]!);
  const messages=rows.filter(row=>['user','assistant'].includes(row.value.type));
  if (!messages.length || rows.some(row=>row.value.sessionId!==undefined && row.value.sessionId!==input.contextId) ||
    messages.some(row=>row.value.cwd!==input.cwd || row.value.sessionId!==input.contextId || row.value.isSidechain!==false)) return;
  return { sourcePaths: files, records: rows.flatMap(row => {
    const content = row.value.message?.content;
    const toolIds = (Array.isArray(content) ? content : []).flatMap((part: any) => part.type === 'tool_use' && typeof part.id === 'string' ? [part.id]
      : part.type === 'tool_result' && typeof part.tool_use_id === 'string' ? [part.tool_use_id] : []);
    return toolIds.length ? [{ ...row, toolIds }] : [];
  }), images: rows.filter(row => row.value.type === 'user')
    .flatMap(row => nativeContentImages(row, ['message', 'content'], row.value.message?.content)) };
}
