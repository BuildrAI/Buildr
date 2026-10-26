import type { ExecutorItem } from '../../contracts.ts';
import { visibleText, nativePreview } from '../native-process.ts';
export function dshItem(event: any): ExecutorItem[] {
  const data = event?.data ?? {}; const id = `event:${event?.seq}`;
  if (event?.type === 'assistant/message') { const text = visibleText(data.message?.content); return text ? [{ id: `assistant:${data.turn}:${data.step}`, kind: 'message', role: 'assistant', text, status: 'completed' }] : []; }
  if (event?.type === 'user/message') { const text = visibleText(data.content); return text ? [{ id: data.id ?? id, kind: 'message', role: 'user', text, executionId: data.source?.rpcId, status: 'completed' }] : []; }
  if (event?.type === 'tool/call') return [{ id: data.callId, kind: 'tool', role: 'system', name: typeof data.name === 'string' && data.name ? data.name : undefined, input: nativePreview(String(data.arguments ?? '')), text: String(data.name ?? '工具') + '\n' + nativePreview(String(data.arguments ?? '')), status: 'running' }];
  if (event?.type === 'tool/result') return [{ id: data.message?.toolCallId ?? id, kind: 'tool', role: 'system', text: nativePreview(visibleText(data.message?.content)), status: data.message?.isError ? 'failed' : 'completed' }];
  return [];
}

/** Native request UUIDs provide exact source identity across cold history reads. */
export function dshHistoryItems(events: any[]): ExecutorItem[] {
  const turnRequests = new Map<number, string>(); let currentTurn: number | undefined;
  for (const event of events) {
    if (event.type === 'turn/start') currentTurn = event.data.turn;
    if (event.type === 'user/message' && currentTurn !== undefined && typeof event.data?.source?.rpcId === 'string') turnRequests.set(currentTurn, event.data.source.rpcId);
  }
  currentTurn = undefined; const result: ExecutorItem[] = [];
  for (const event of events) {
    if (event.type === 'turn/start') currentTurn = event.data.turn;
    for (const item of dshItem(event)) result.push({ ...item, executionId: event.data?.source?.rpcId ?? turnRequests.get(event.data?.turn ?? currentTurn) });
  }
  const latest = new Map<string, ExecutorItem>();
  for (const item of result) latest.set(item.id, { ...latest.get(item.id), ...item });
  return [...latest.values()];
}

/** A cold read answers only for the turn containing this exact client request. */
export function dshExecutionObservation(events: any[], requestId: string): import('../../contracts.ts').ExecutorObservation {
  let currentTurn: number | undefined; let targetTurn: number | undefined;
  for (const event of events) {
    if (event.type === 'turn/start') currentTurn = event.data.turn;
    if (event.type === 'user/message' && event.data?.source?.rpcId === requestId) targetTurn = currentTurn;
  }
  if (targetTurn === undefined) return { status: 'unknown', tools: [], diagnostic: 'dsh_exact_execution_not_found' };
  const tools = new Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>(); let end: string | undefined;
  for (const event of events) {
    if (event.data?.turn !== targetTurn) continue;
    if (event.type === 'tool/call') tools.set(event.data.callId, { id: event.data.callId, label: String(event.data.name ?? '工具'), status: 'unknown' });
    if (event.type === 'tool/result' && tools.has(event.data.message?.toolCallId)) tools.get(event.data.message.toolCallId)!.status = 'completed';
    if (event.type === 'turn/end') end = event.data.reason?.kind;
  }
  return { status: [...tools.values()].some(tool => tool.status === 'unknown') ? 'unknown' : !end ? 'unknown' : ['aborted', 'cancelled', 'interrupted'].includes(end) ? 'stopped' : 'idle', executionRef: { id: requestId }, tools: [...tools.values()] };
}
