import type { SendDraft } from '../contracts.ts';
import { fail, type StoredConversation } from './agent-state.ts';

/** Resolve the exact failed work from saved facts, never from a fresh user message. */
export function continuationDraft(record: StoredConversation, input: SendDraft): SendDraft {
  if (!input.continueRunId) return input;
  const run = record.view.run;
  if (!run || run.id !== input.continueRunId) fail('agent_continue_stale', '原执行已变化，请重新读取后继续。', 409);
  if (!['failed', 'stopped', 'completed'].includes(run.status) || record.view.requests.length || run.tools.some(tool => tool.status !== 'completed')) fail('agent_continue_unavailable', '请先核对原执行及工具已结束，并处理待回答或待授权的问题。', 409);
  const replied = record.view.entries.some(entry => entry.role === 'assistant' && entry.kind === 'message' && entry.text.trim() && (entry.runId === run.id || !entry.runId && entry.createdAt >= run.startedAt));
  if (run.status === 'completed' && replied) fail('agent_continue_unavailable', '本轮已正常答复，可以直接提出新的要求。', 409);
  const attempt = record.attempts.find(value => value.runId === run.id);
  const original = record.view.entries.findLast(entry => entry.role === 'user' && entry.kind === 'message' && entry.sequence <= (attempt?.through ?? 0));
  if (!original) fail('agent_continue_unavailable', '尚未找到可恢复的原用户要求，工作记录已保留。', 409);
  return { ...input, text: run.accepted
    ? '用户请求继续上次未正常答复的执行。请核对已有对话、尚未完成的目标、当前成果和工具结果，接着完成原目标并给出明确答复。不要逐条重放历史命令，不扩大原有授权；无法继续时说明具体原因。'
    : original.text, attachmentIds: run.accepted ? [] : original.attachments ?? [] };
}
