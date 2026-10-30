import type { PendingRequestView, ExecutorImage } from '../contracts.ts';
import { fail } from './agent-state.ts';

export type MaterialAnswer = { text: string; attachmentIds: string[] };
export function isMaterialAnswer(value: unknown): value is MaterialAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return Object.keys(raw).every(key => key === 'text' || key === 'attachmentIds') && typeof raw.text === 'string' && Array.isArray(raw.attachmentIds) && raw.attachmentIds.length <= 4 && raw.attachmentIds.every(id => typeof id === 'string' && Boolean(id)) && Boolean(raw.text.trim() || raw.attachmentIds.length);
}
export function answerAttachmentIds(answer: unknown): string[] {
  if (isMaterialAnswer(answer)) return answer.attachmentIds;
  return answer && typeof answer === 'object' && !Array.isArray(answer) ? Object.values(answer).flatMap(value => isMaterialAnswer(value) ? value.attachmentIds : []) : [];
}
/** Human-authored answer only; native delivery separately keeps resolved material locations. */
export function questionAnswerDisplay(answer: unknown): unknown {
  if (isMaterialAnswer(answer)) return answer.text;
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    return Object.fromEntries(Object.entries(answer).map(([id, value]) => [id, isMaterialAnswer(value) ? value.text : value]));
  }
  return answer;
}

/** Native question protocols remain text-only. Resolve private image sources on the host, never trust client paths. */
export function resolveQuestionAnswer(request: PendingRequestView, answer: unknown, expand: (ids: string[]) => {images: ExecutorImage[]; description: string}): { answer: unknown; attachmentIds: string[]; images: ExecutorImage[] } {
  const ids = [...new Set(answerAttachmentIds(answer))];
  if (ids.length > 4) fail('agent_question_answer_invalid', '每次回答最多添加4份图片或视频。');
  if (ids.length && request.kind !== 'question') fail('agent_question_answer_invalid', '授权回答不能包含附件。');
  const images: ExecutorImage[] = [];
  const resolve = (value: unknown, free: boolean): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    if (!free || !isMaterialAnswer(value)) fail('agent_question_answer_invalid', '请填写有效自由回答或选择已有选项。');
    const materials = expand(value.attachmentIds); images.push(...materials.images);
    return value.text + (value.attachmentIds.length ? '\n\n用户随此问题回答附加的材料（请按需读取以下准确本机来源，未读取不能声称看过）：\n' + JSON.stringify(materials.images) + materials.description : '');
  };
  if (!request.questions?.length) return { answer: resolve(answer, request.kind === 'question'), attachmentIds: ids, images: [...new Map(images.map(image=>[image.id,image])).values()] };
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return { answer, attachmentIds: ids, images: [...new Map(images.map(image=>[image.id,image])).values()] };
  const provided = answer as Record<string, unknown>;
  const resolved = Object.fromEntries(Object.entries(provided).map(([id, value]) => {
    const question = request.questions!.find(item => item.id === id);
    if (!question) fail('agent_question_answer_invalid', '回答包含其他问题。');
    return [id, resolve(value, !question.options?.length || Boolean(question.allowOther) && !question.multiple)];
  }));
  return { answer: resolved, attachmentIds: ids, images: [...new Map(images.map(image=>[image.id,image])).values()] };
}
