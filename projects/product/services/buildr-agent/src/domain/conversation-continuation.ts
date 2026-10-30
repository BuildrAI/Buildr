import type { SendDraft } from '../contracts.ts';
import { fail, type StoredConversation } from './agent-state.ts';

/** Explicitly continue the goal, never reinterpret an uncertain operation as finished. */
export function releasedContinuation(record: StoredConversation, input: SendDraft): boolean {
  const run = record.view.run, participant = record.participants.find(value => value.id === run?.participantId);
  return Boolean(run && input.continueRunId === run.id && run.accepted && run.status === 'unknown' && run.resourcesReleased === true &&
    participant?.contextRef && !record.view.requests.length && !record.interruption?.awaitingUser &&
    run.tools.every(tool => tool.status !== 'running') && input.connectionId === participant.connectionId &&
    input.modelAccountId === run.modelAccountId && input.modelAccountIdentity === run.modelAccountIdentity && input.model === run.model &&
    input.serviceTier === run.serviceTier && input.reasoningEffort === run.reasoningEffort &&
    (input.permissionMode ?? 'default') === (run.permissionMode ?? 'default'));
}

/** Resolve the exact failed work from saved facts, never from a fresh user message. */
export function continuationDraft(record: StoredConversation, input: SendDraft): SendDraft {
  if (!input.continueRunId) return input;
  const run = record.view.run;
  if (!run || run.id !== input.continueRunId) fail('agent_continue_stale', '原执行已变化，请重新读取后继续。', 409);
  if (input.waitingHandoff && run.status === 'waiting-question') return { ...input, text: '用户明确请求切换执行组合并接续原目标。请核对已有成果与随交接提交的问题回答；未回答的问题不构成同意，仍需决定时重新询问。不要逐条重放历史命令，不扩大原有授权。' };
  const released = releasedContinuation(record, input);
  if (!released && (!['failed', 'stopped', 'completed'].includes(run.status) || record.view.requests.length || run.tools.some(tool => tool.status !== 'completed'))) fail('agent_continue_unavailable', '请先核对原执行及工具已结束，并处理待回答或待授权的问题。', 409);
  const replied = record.view.entries.some(entry => entry.role === 'assistant' && entry.kind === 'message' && entry.text.trim() && (entry.runId === run.id || !entry.runId && entry.createdAt >= run.startedAt));
  if (run.status === 'completed' && replied) fail('agent_continue_unavailable', '本轮已正常答复，可以直接提出新的要求。', 409);
  const attempt = record.attempts.find(value => value.runId === run.id);
  const original = record.view.entries.findLast(entry => entry.role === 'user' && entry.kind === 'message' && entry.sequence <= (attempt?.through ?? 0));
  if (!original) fail('agent_continue_unavailable', '尚未找到可恢复的原用户要求，工作记录已保留。', 409);
  if (released) return { ...input, attachmentIds: [], text: '用户明确请求恢复原对话并接续原目标。旧原生控制资源已核验释放，但旧轮及独立命令的操作结果仍未知；这不证明命令退出或工作成功。请先读取原对话与当前成果，核对未知工具及可能仍在运行的命令，确认哪些工作已经生效，再继续尚未完成的目标。不要逐条重放历史命令，不重发原指令，不覆盖已有成果，不扩大原权限或代答待决定。未知工具引用：' + run.tools.filter(tool => tool.status === 'unknown').map(tool => tool.id).join('、') };
  return { ...input, text: run.accepted
    ? '用户请求继续上次未正常答复的执行。请核对已有对话、尚未完成的目标、当前成果和工具结果，接着完成原目标并给出明确答复。不要逐条重放历史命令，不扩大原有授权；无法继续时说明具体原因。'
    : original.text, attachmentIds: run.accepted ? [] : original.attachments ?? [] };
}
