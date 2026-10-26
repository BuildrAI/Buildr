import type { ExecutorItem } from '../../contracts.ts';
import { visibleText, nativePreview } from '../native-process.ts';
/** Fold repeated native assistant snapshots by their stable message identity. */
export function qoderHistoryItems(messages: any[], contextId: string): ExecutorItem[] {
  const items: ExecutorItem[] = []; let executionId: string | undefined;
  for (const message of messages) {
    if (message.session_id !== contextId) throw new Error('qoder_context_identity_mismatch');
    const content = message.message?.content; const text = visibleText(content);
    const isOrdinaryInput = message.type === 'user' && Boolean(text) && !message.parent_tool_use_id && !(Array.isArray(content) && content.some((part: any) => part.type === 'tool_result'));
    if (isOrdinaryInput) executionId = message.uuid;
    if (text && (message.type === 'assistant' || isOrdinaryInput)) items.push({ id: message.type === 'assistant' ? `message:${message.message?.id ?? message.uuid}` : message.uuid, kind: 'message', role: message.type === 'assistant' ? 'assistant' : 'user', text, executionId, status: 'completed' });
    for (const part of Array.isArray(content) ? content : []) {
      if (part.type === 'tool_use') items.push({ id: part.id, kind: 'tool', role: 'system', name: typeof part.name === 'string' && part.name ? part.name : undefined, input: nativePreview(JSON.stringify(part.input ?? {})), text: String(part.name ?? '工具') + '\n' + nativePreview(JSON.stringify(part.input ?? {})), executionId, status: 'running' });
      if (part.type === 'tool_result') items.push({ id: part.tool_use_id, kind: 'tool', role: 'system', text: nativePreview(visibleText(part.content)), executionId, status: part.is_error ? 'failed' : 'completed' });
    }
  }
  const latest = new Map<string, ExecutorItem>(); for (const item of items) latest.set(item.id, { ...latest.get(item.id), ...item }); return [...latest.values()];
}
