import type { SendDraft } from '../contracts.ts';
import { fail, nonempty } from './agent-state.ts';
import { resolvePermissionMode } from './permission-mode.ts';
const MAX_TEXT_BYTES = 64 * 1024;

export function normalizeSendDraft(input: SendDraft): SendDraft {
    if (typeof input.text !== 'string' || Buffer.byteLength(input.text) > MAX_TEXT_BYTES) fail('agent_input_too_large', '输入过长，请缩小本次指令。', 413);
    const continueRunId = input.continueRunId === undefined ? undefined : nonempty(input.continueRunId, '原执行身份', 200);
    if (continueRunId && (input.text.trim() || input.attachmentIds?.length || input.handoffSummary !== undefined)) fail('agent_continue_input_conflict', '恢复动作与新要求需分别提交，草稿已保留。');
    if (!continueRunId && !input.text.trim() && !input.attachmentIds?.length) fail('agent_input_empty', '请填写内容或添加图片、视频。');
    if (input.attachmentIds && (!Array.isArray(input.attachmentIds) || input.attachmentIds.length > 4 || input.attachmentIds.some(id => typeof id !== 'string'))) fail('agent_attachments_invalid', '每次最多添加4份图片或视频。');
    if (input.handoffSummary !== undefined && (typeof input.handoffSummary !== 'string' || !input.handoffSummary.trim() || Buffer.byteLength(input.handoffSummary) > MAX_TEXT_BYTES)) fail('agent_handoff_invalid', '补充的交接说明无效。');
    if(input.skipHandoffSummary!==undefined&&typeof input.skipHandoffSummary!=='boolean')fail('agent_input_invalid','整理方式无效。');
    return { ...(continueRunId ? {continueRunId} : {}), skipHandoffSummary:input.skipHandoffSummary, expectedRevision: nonempty(input.expectedRevision, '对话版本'), connectionId: nonempty(input.connectionId, '接入身份'), text: input.text, modelAccountId: input.modelAccountId === undefined ? undefined : nonempty(input.modelAccountId, '套餐账号'), modelAccountRevision: input.modelAccountRevision, modelAccountIdentity: input.modelAccountIdentity, permissionMode: resolvePermissionMode(input.permissionMode), model: input.model === undefined ? undefined : nonempty(input.model, '模型', 256), serviceTier:input.serviceTier===undefined?undefined:nonempty(input.serviceTier,'服务档位',256),reasoningEffort: input.reasoningEffort === undefined ? undefined : nonempty(input.reasoningEffort, '思考深度', 80), attachmentIds: input.attachmentIds ?? [], handoffSummary: input.handoffSummary };
  }
