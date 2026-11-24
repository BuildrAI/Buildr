import type { ExecutorItem, SubagentDispatch } from '../../contracts.ts';
import { nativePreview } from '../native-process.ts';

export function claudeSubagent(tool: ExecutorItem, previous?: ExecutorItem, info?: {
  label?: unknown; prompt?: unknown; parent?: string; status: SubagentDispatch['status']; result?: string; returned?: boolean;
}): ExecutorItem {
  let input: { description?: unknown; prompt?: unknown } = {};
  try { input = JSON.parse(tool.input || '{}') ?? {}; } catch { /* partial frame */ }
  const label = info?.label ?? input.description;
  const prompt = info?.prompt ?? input.prompt;
  return {
    id: `claude-subagent:${tool.id}`, kind: 'notice', role: 'system', executionId: tool.executionId,
    parentToolId: info?.parent ?? tool.parentToolId ?? previous?.parentToolId,
    text: info?.result === undefined ? previous?.text ?? '' : nativePreview(info.result),
    subagent: {
      key: tool.id,
      label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 140) : previous?.subagent?.label ?? '子智能体',
      prompt: typeof prompt === 'string' ? nativePreview(prompt) : previous?.subagent?.prompt,
      status: info?.status ?? previous?.subagent?.status ?? 'unknown',
      returned: info?.returned ?? previous?.subagent?.returned,
    },
  };
}

export function isClaudeAgentTool(item: ExecutorItem) {
  return item.kind === 'tool' && (item.name === 'Agent' || item.name === 'Task');
}

export function claudeWaitingSubagents<T extends { active: boolean; background?: boolean; kind?: string; toolId?: string; parentTaskId?: string; ambient?: boolean }>(
  tasks: Iterable<T>, nativePhase: string | undefined, promptEnded: boolean,
) {
  if (nativePhase === 'idle') return [];
  return [...tasks].filter(task => task.active && task.kind === 'local_agent' && !task.ambient && !task.parentTaskId &&
    (task.background === false || promptEnded && nativePhase === 'running')).flatMap(task => task.toolId ? [task.toolId] : []);
}

/** Notification identity is model-independent; never parse task IDs out of XML/text. */
export function claudeReturnedTool(tasks: Iterable<{runId?:string;kind?:string;toolId?:string}>, origin: {kind?:string;runId?:string} | undefined) {
  if (origin?.kind !== 'task-notification' || typeof origin.runId !== 'string' || !origin.runId) return;
  const matches=[...tasks].filter(task=>task.runId===origin.runId);
  return matches.length===1 && matches[0].kind==='local_agent' ? matches[0].toolId : undefined;
}
