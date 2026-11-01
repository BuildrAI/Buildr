import type { ExecutorItem, ExecutorObservation } from '../../contracts.ts';
import { errorDiagnostic } from '../../domain/error-diagnostic.ts';
import { visibleText, nativePreview } from '../native-process.ts';

export function qoderParentTool(message: any): { parentToolId?: string } {
  return typeof message?.parent_tool_use_id === 'string' && message.parent_tool_use_id ? { parentToolId: message.parent_tool_use_id } : {};
}

/** Only native completion facts enrich the existing launch receipt. Never read or guess report files. */
export function qoderTaskResult(previous: string | undefined, message: any): string | undefined {
  const summary = typeof message.summary === 'string' && message.summary.trim() ? message.summary : undefined;
  const report = typeof message.output_file === 'string' && message.output_file.trim() ? message.output_file : undefined;
  if (!summary && !report) return undefined;
  return [previous, summary && `子任务结果\n${summary}`, report && `报告文件\n${report}`].filter(Boolean).join('\n\n');
}

export function qoderResultOutcome(message:any,stopping=false,secrets:readonly string[]=[]):{status:'completed'|'stopped'|'failed';diagnostic?:string} {
  const status=stopping||message.terminal_reason==='aborted_tools'||message.terminal_reason==='aborted'?'stopped':message.subtype==='success'&&!message.is_error?'completed':'failed';
  if(status!=='failed')return{status};
  const errors=Array.isArray(message.errors)?message.errors.filter((value:unknown)=>typeof value==='string'&&value.trim()).slice(0,3).join('\n'):undefined;
  const reason=errorDiagnostic(errors,secrets);
  return {status,diagnostic:reason?`Qoder · 本轮执行：${reason}`:'qoder_turn_failed'};
}

/** Only the exact primary-chain native receipt establishes a synthetic notification. */
export function qoderTaskNotificationIds(records: any[], contextId: string): Set<string> {
  return new Set(records.filter(record => record.sessionId === contextId && record.isSidechain === false && record.type === 'user' && record.origin?.kind === 'task-notification').map(record => record.uuid));
}

/** Fold repeated native assistant snapshots by their stable message identity. */
export function qoderHistoryItems(messages: any[], contextId: string, interruptions: ReadonlySet<string> = new Set(), records: any[] = []): ExecutorItem[] {
  // The SDK historical projection omits origin. Preserve native notification provenance by UUID.
  const notifications = qoderTaskNotificationIds(records, contextId);
  const items: ExecutorItem[] = []; let executionId: string | undefined;
  for (const message of messages) {
    if (message.session_id !== contextId) throw new Error('qoder_context_identity_mismatch');
    if (interruptions.has(message.uuid)) continue;
    if (message.type === 'user' && (message.origin?.kind === 'task-notification' || notifications.has(message.uuid))) continue;
    if (message.type === 'system' && message.subtype === 'task_notification' && typeof message.tool_use_id === 'string') {
      const previous = items.findLast(item => item.kind === 'tool' && item.id === message.tool_use_id);
      const text = qoderTaskResult(previous?.text, message);
      if (previous && text) items.push({ ...previous, text, status: message.status === 'failed' ? 'failed' : 'completed' });
      continue;
    }
    const content = message.message?.content; const text = visibleText(content), parent = qoderParentTool(message);
    const isOrdinaryInput = message.type === 'user' && (Boolean(text) || Array.isArray(content) && content.some((part: any) => part.type === 'image')) && !message.parent_tool_use_id && !(Array.isArray(content) && content.some((part: any) => part.type === 'tool_result'));
    if (isOrdinaryInput) executionId = message.uuid;
    if (text && message.type === 'assistant' || isOrdinaryInput) items.push({ id: message.type === 'assistant' ? `message:${message.message?.id ?? message.uuid}` : message.uuid, ...parent, ...(isOrdinaryInput ? { clientRequestId: message.uuid } : {}), kind: 'message', role: message.type === 'assistant' ? 'assistant' : 'user', text, executionId, status: 'completed' });
    for (const part of Array.isArray(content) ? content : []) {
      if (part.type === 'tool_use') items.push({ id: part.id, ...parent, kind: 'tool', role: 'system', name: typeof part.name === 'string' && part.name ? part.name : undefined, input: nativePreview(JSON.stringify(part.input ?? {})), text: String(part.name ?? '工具') + '\n' + nativePreview(JSON.stringify(part.input ?? {})), executionId, status: 'running' });
      if (part.type === 'tool_result') items.push({ id: part.tool_use_id, ...parent, kind: 'tool', role: 'system', text: nativePreview(visibleText(part.content)), executionId, status: part.is_error ? 'failed' : 'completed' });
    }
  }
  const latest = new Map<string, ExecutorItem>(); for (const item of items) latest.set(item.id, { ...latest.get(item.id), ...item }); return [...latest.values()];
}

/** The SDK projection omits origin metadata. Match only native primary-chain receipts, never user text alone. */
export function qoderInterruptionIds(messages: any[], records: any[], contextId: string): Set<string> {
  const raw = new Map(records.filter(record => record.sessionId === contextId && record.isSidechain === false).map(record => [record.uuid, record]));
  const ids = new Set<string>();
  for (let index = 1; index < messages.length; index++) {
    const message = messages[index], record = raw.get(message.uuid), content = message.message?.content;
    if (message.session_id === contextId && message.type === 'user' && record?.type === 'user' &&
        record.parentUuid === messages[index - 1].uuid && !record.humanInput && !record.origin && !record.promptId &&
        !message.parent_tool_use_id && Array.isArray(content) && content.length === 1 &&
        content[0].type === 'text' && content[0].text === '[Request interrupted by user]') ids.add(message.uuid);
  }
  return ids;
}

/** A cold observer can prove an interrupted turn, but cannot infer the outcome of unsettled side effects. */
export function qoderInterruptedObservation(messages: any[], records: any[], contextId: string, executionId?: string): ExecutorObservation {
  const interruptions = qoderInterruptionIds(messages, records, contextId);
  const items = qoderHistoryItems(messages, contextId, interruptions, records);
  const owned = items.filter(item => item.executionId === executionId), tools = owned.filter(item => item.kind === 'tool');
  const confirmedFailures = new Set(records.flatMap(record => typeof record.toolUseResult?.errorType === 'string' && !/interrupt|abort|cancel/i.test(record.toolUseResult.errorType) && record.sourceToolAssistantUUID && record.promptId ? (Array.isArray(record.message?.content) ? record.message.content : []).filter((part: any) => part.type === 'tool_result' && part.is_error).map((part: any) => part.tool_use_id) : []));
  const settled = (item: ExecutorItem) => item.status === 'completed' || item.status === 'failed' && confirmedFailures.has(item.id);
  const exactInput = executionId && items.some(item => item.role === 'user' && item.id === executionId) && records.some(record => record.sessionId === contextId && record.isSidechain === false && record.type === 'user' && record.uuid === executionId);
  // A known input identity survives a lost result. Physical release still requires the old control group to be gone.
  const unknown: ExecutorObservation = { status: 'unknown', ...(exactInput ? { executionRef: { id: executionId } } : {}), tools: tools.map(item => ({ id: item.id, label: item.name ?? '工具', status: settled(item) ? 'completed' : 'unknown' })), diagnostic: 'qoder_exact_execution_not_observed' };
  if (!executionId || !interruptions.has(messages.at(-1)?.uuid) || items.filter(item => item.role === 'user').at(-1)?.id !== executionId) return unknown;
  const start = messages.findIndex(message => message.uuid === executionId);
  if (start < 0 || tools.some(item => !settled(item))) return unknown;
  const tail = messages.slice(start), tailIds = new Set(tail.map(message => message.uuid));
  // Native background jobs may outlive their foreground tool result; do not release their execution from history alone.
  if (tail.some(message => message.subtype === 'task_started' ||
      message.tool_use_result?.backgroundTaskId || message.tool_use_result?.taskId ||
      (Array.isArray(message.message?.content) ? message.message.content : []).some((part: any) => part.type === 'tool_use' && part.input?.run_in_background === true)) ||
      records.some(record => tailIds.has(record.uuid) && (record.toolUseResult?.backgroundTaskId || record.toolUseResult?.taskId))) return unknown;
  return { status: 'stopped', executionRef: { id: executionId }, tools: unknown.tools, requests: [] };
}
