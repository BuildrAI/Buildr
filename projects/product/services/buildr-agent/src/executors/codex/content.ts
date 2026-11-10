import path from 'node:path';
import type { NativeContentContext, NativeContentInventory } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';

export function codexContent(input: NativeContentContext): NativeContentInventory | undefined {
  if (!/^[a-f0-9-]{36}$/.test(input.contextId)) return;
  const files = nativeContentFiles(input, path.join(input.configRoot, 'codex-home/sessions'), file => path.basename(file).endsWith(input.contextId + '.jsonl'));
  if (files.length !== 1) return;
  const rows = nativeContentRows(input, 'codex', files[0]!);
  const meta = rows[0]?.value;
  if (meta?.type !== 'session_meta' || meta.payload?.id !== input.contextId || meta.payload.cwd !== input.cwd) return;
  let executionId:string|undefined;
  return { sourcePaths: files, records: rows.flatMap(row => {
    const value = row.value.payload;
    if(row.value.type==='turn_context'||row.value.type==='event_msg'&&value?.type==='task_started')executionId=value?.turn_id;
    if (!['response_item', 'event_msg'].includes(row.value.type) || typeof value?.call_id !== 'string') return [];
    return [{ ...row, toolIds: [value.call_id],executionId,input:['function_call','custom_tool_call','exec_command_begin'].includes(value.type) }];
  }), images: rows.filter(row => row.value.type === 'response_item' && row.value.payload?.type === 'message')
    .flatMap(row => nativeContentImages(row, ['payload', 'content'], row.value.payload.content)) };
}
