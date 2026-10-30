import type { PendingRequestView, SendDraft } from '../contracts.ts';
import { fail, nonempty, type StoredConversation } from './agent-state.ts';

import { isMaterialAnswer, answerAttachmentIds, questionAnswerDisplay } from './question-answer.ts';

type Intent = NonNullable<SendDraft['waitingHandoff']>;
export function normalizeWaitingHandoff(value: Intent | undefined): Intent | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || !Array.isArray(value.requestIds) || !value.requestIds.length || value.requestIds.length > 64) fail('agent_handoff_invalid', '交接的原问题身份无效。', 409);
  const requestIds = value.requestIds.map(id => nonempty(id, '原问题身份', 200));
  if (new Set(requestIds).size !== requestIds.length) fail('agent_handoff_invalid', '交接包含重复问题。', 409);
  const answers = value.answers;
  if (value.intent !== undefined && value.intent !== 'discussion') fail('agent_handoff_invalid', '等待交互意图无效。', 409);
  if (value.intent === 'discussion' && answers?.length) fail('agent_handoff_invalid', '先讨论不能同时提交问题答案。', 409);
  if (answers !== undefined && (!Array.isArray(answers) || !answers.length || answers.length > requestIds.length || answers.some(item => !item || !requestIds.includes(item.requestId)) || new Set(answers.map(item => item.requestId)).size !== answers.length)) fail('agent_handoff_invalid', '交接回答未匹配原问题。', 409);
  if (Buffer.byteLength(JSON.stringify(answers ?? [])) > 64 * 1024) fail('agent_reply_too_large', '交接回答过长，请缩小后重试。', 413);
  return { ...(value.intent ? { intent: value.intent } : {}), runId: nonempty(value.runId, '原执行身份', 200), participantId: nonempty(value.participantId, '原参与者身份', 200), generation: nonempty(value.generation, '原后台身份', 200), requestIds, ...(answers ? { answers: structuredClone(answers) } : {}) };
}

function validAnswer(request: PendingRequestView, answer: unknown): boolean {
  const validText = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
  if (!request.questions?.length) return validText(answer) || isMaterialAnswer(answer);
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  const supplied = answer as Record<string, unknown>;
  return Object.keys(supplied).every(id => request.questions!.some(question => question.id === id)) && request.questions.every(question => {
    const raw = supplied[question.id];
    if (isMaterialAnswer(raw)) return !question.multiple && (!question.options?.length || Boolean(question.allowOther));
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.length || values.some(value => !validText(value)) || !question.multiple && values.length !== 1) return false;
    return !question.options?.length || question.allowOther || values.every(value => question.options!.some(option => option.id === value));
  });
}

/** Validate the same original wait before stopping and again before dispatch. */
export function waitingHandoffQuestions(record: StoredConversation, draft: SendDraft, saved?: PendingRequestView[]): PendingRequestView[] {
  const intent = draft.waitingHandoff!;
  const run = record.view.run;
  if (!run || run.id !== intent.runId || run.participantId !== intent.participantId || run.generation !== intent.generation || draft.continueRunId && draft.continueRunId !== run.id) fail('agent_handoff_stale', '原执行身份已变化，交接内容保留，请核对后重新提交。', 409);
  const participant = record.participants.find(item => item.id === run.participantId);
  const sameSelection = participant?.connectionId === draft.connectionId && run.model === draft.model && run.modelAccountId === draft.modelAccountId && run.serviceTier === draft.serviceTier && (run.permissionMode ?? 'default') === (draft.permissionMode ?? 'default') && run.reasoningEffort === draft.reasoningEffort;
  if (intent.intent === 'discussion') {
    if (!sameSelection || !draft.text.trim() || draft.continueRunId) fail('agent_discussion_invalid', '先讨论需保持原执行组合并填写要讨论的内容。', 409);
  } else if (participant?.connectionId === draft.connectionId && run.model === draft.model && run.modelAccountId === draft.modelAccountId && run.serviceTier === draft.serviceTier) fail('agent_handoff_unchanged', '当前仍选择原执行组合，请直接回答原问题，或选择其他模型后交接。', 409);
  if (record.view.entries.some(entry => intent.requestIds.some(id => entry.id === 'reply-' + id || entry.id.startsWith('reply-' + id + '-')))) fail('agent_handoff_answered', '原问题已有答复或答复结果待确认，交接内容保留，请先核对原执行。', 409);
  const requests = record.view.requests;
  const questions = saved ?? requests;
  if (!questions.length || questions.length !== intent.requestIds.length || questions.some(question => question.kind !== 'question' || !intent.requestIds.includes(question.id) || question.runId !== run.id || question.participantId !== run.participantId || question.generation !== run.generation)) fail('agent_handoff_stale', '原问题集合已变化，不能交接此旧请求，内容已保留。', 409);
  if (run.status === 'waiting-question') {
    if (requests.length !== intent.requestIds.length || requests.some(question => question.kind !== 'question' || !intent.requestIds.includes(question.id))) fail('agent_handoff_stale', '原问题已变化，请核对后重新交接。', 409);
  } else if (!saved || !['stopping', 'unknown', 'tools-active', 'stopped', 'failed', 'completed'].includes(run.status) || requests.some(question => question.kind !== 'question' || !intent.requestIds.includes(question.id))) fail('agent_handoff_stale', '原轮已不处于该问题的等待或停止过程，交接内容保留。', 409);
  for (const answer of intent.answers ?? []) if (!validAnswer(questions.find(question => question.id === answer.requestId)!, answer.answer)) fail('agent_question_answer_invalid', '请先为交接问题填写有效回答。', 409);
  return structuredClone(questions);
}

export function waitingQuestionText(question: PendingRequestView, intent: Intent, resolve: (answer: unknown) => unknown = answer => answer): { text: string; answered: boolean } {
  const supplied = intent.answers?.find(answer => answer.requestId === question.id);
  return { answered: Boolean(supplied), text: JSON.stringify({
    请求标识: question.id, 问题: question.title, 说明: question.description, 问题列表: question.questions, 选项: question.options,
    状态: supplied ? '用户已提交回答，随交接交给新执行方；未回应旧原生执行' : intent.intent === 'discussion' ? '未回答；用户要求先讨论。仅解释和调查，不继续依赖该答案的动作，不把讨论视为同意。' : '未回答，用户选择交接并继续或提出新要求',
    ...(supplied ? { 回答: resolve(supplied.answer) } : {}),
    ...(supplied && answerAttachmentIds(supplied.answer).length ? { 显示回答: questionAnswerDisplay(supplied.answer) } : {}),
    授权性质: '仅实际提交的业务回答具有其明确语义；交接和停止本身不构成验收、选项答复或工具授权。仍缺必要决定时须重新询问，不得代选。'
  }) };
}
