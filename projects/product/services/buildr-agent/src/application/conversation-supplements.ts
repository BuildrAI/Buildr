import { createHash, randomUUID } from 'node:crypto';
import { ExecutorInputRejected, type AgentRuntime, type ConversationView, type ExecutorImage, type SupplementInput, type SupplementResult } from '../contracts.ts';
import { fail, nonempty, type StoredConversation, type StoredParticipant } from '../domain/agent-state.ts';

type Ports = {
  generation: string;
  closing(): boolean;
  now(): string;
  load(workspaceId: string, id: string): StoredConversation;
  save(record: StoredConversation): void;
  view(record: StoredConversation): ConversationView;
  runtime(record: StoredConversation, participant: StoredParticipant): Promise<AgentRuntime>;
  materials(record: StoredConversation, participant: StoredParticipant, ids: string[]): { images: ExecutorImage[]; description: string };
};

/** Owns only supplementary admission. The conversation remains the single record authority. */
export class ConversationSupplements {
  private readonly pending = new Map<string, { digest: string; work: Promise<SupplementResult> }>();
  private readonly ports: Ports;
  constructor(ports: Ports) { this.ports = ports; }
  get size() { return this.pending.size; }
  private current(record: StoredConversation, input: SupplementInput) {
    const run = record.view.run;
    if (this.ports.closing()) fail('agent_service_closing', '智能体服务正在退出，输入已保留。', 503);
    if (!run || run.id !== input.runId || run.participantId !== input.participantId || run.generation !== input.generation || run.generation !== this.ports.generation) fail('agent_supplement_stale', '原执行已变化，请核对后再发送；输入已保留。', 409);
    if (!run.accepted || !['running', 'waiting-approval', 'waiting-question'].includes(run.status)) fail('agent_supplement_unavailable', '当前执行尚不能接收新消息，请核对执行状态；输入已保留。', 409);
    const participant = record.participants.find(item => item.id === input.participantId);
    const execution = record.attempts.find(item => item.runId === input.runId && !item.supplement)?.executionRef;
    if (!participant?.contextRef || !execution) fail('agent_supplement_unavailable', '尚未确认原生执行身份，输入已保留。', 409);
    return { participant, execution };
  }
  send(workspaceId: string, id: string, raw: SupplementInput): Promise<SupplementResult> {
    const input: SupplementInput = { runId: nonempty(raw.runId, '执行身份'), participantId: nonempty(raw.participantId, '参与者身份'), generation: nonempty(raw.generation, '服务代次'), clientRequestId: nonempty(raw.clientRequestId, '请求身份', 200), text: raw.text, attachmentIds: raw.attachmentIds ?? [] };
    if (typeof input.text !== 'string' || Buffer.byteLength(input.text) > 64 * 1024) fail('agent_input_too_large', '输入过长，请缩小本次指令。', 413);
    if (!Array.isArray(input.attachmentIds) || input.attachmentIds.length > 4 || input.attachmentIds.some(value => typeof value !== 'string')) fail('agent_attachments_invalid', '每次最多添加4份图片或视频。');
    if (!input.text.trim() && !input.attachmentIds.length) fail('agent_input_empty', '请填写内容或添加图片、视频。');
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const record = this.ports.load(workspaceId, id), previous = record.attempts.find(item => item.clientRequestId === input.clientRequestId);
    if (previous && (!previous.supplement || previous.inputDigest !== digest)) fail('agent_request_conflict', '相同请求身份对应不同输入，已拒绝重复执行。', 409);
    const key = JSON.stringify([workspaceId, id, input.clientRequestId]);
    const pending = this.pending.get(key);
    if (pending) {
      if (pending.digest !== digest) fail('agent_request_conflict', '相同请求身份对应不同输入，已拒绝重复执行。', 409);
      return pending.work;
    }
    if (previous) {
      const entry = record.view.entries.find(item => item.id === previous.userEntryId);
      return Promise.resolve({ conversation: this.ports.view(record), delivery: previous.accepted ? 'accepted' : entry?.status === 'failed' ? 'rejected' : 'unknown' });
    }
    const work = this.execute(workspaceId, id, input, digest).finally(() => { if (this.pending.get(key)?.work === work) this.pending.delete(key); });
    this.pending.set(key, { digest, work }); return work;
  }
  private async execute(workspaceId: string, id: string, input: SupplementInput, digest: string): Promise<SupplementResult> {
    let record = this.ports.load(workspaceId, id);
    const initial = this.current(record, input);
    const runtime = await this.ports.runtime(record, initial.participant);
    if (!runtime.capabilities.supplement || !runtime.supplement) fail('agent_supplement_unsupported', '当前接入尚不支持执行中发送，输入已保留。', 409);
    record = this.ports.load(workspaceId, id);
    const { participant, execution } = this.current(record, input);
    if (participant.bindingIdentity !== runtime.bindingIdentity) fail('agent_binding_changed', '原连接身份已变化，输入已保留。', 409);
    const { images, description } = this.ports.materials(record, participant, input.attachmentIds!);
    const text = input.text + description;
    if (Buffer.byteLength(text) > runtime.capabilities.maxInputBytes || images.length && !runtime.capabilities.images) fail('agent_capability_unavailable', '当前执行不能接收这些内容，文字与附件已保留。', 413);
    const sequence = (record.view.entries.at(-1)?.sequence ?? 0) + 1, userEntryId = randomUUID();
    record.view.entries.push({ id: userEntryId, sequence, createdAt: this.ports.now(), kind: 'message', role: 'user', text: input.text, attachments: input.attachmentIds, runId: input.runId, participantId: participant.id, provider: participant.provider, status: 'sending' });
    record.attempts.push({ clientRequestId: input.clientRequestId, inputDigest: digest, runId: input.runId, participantId: participant.id, through: sequence, userEntryId, executionRef: execution, accepted: false, supplement: true });
    this.ports.save(record);
    let delivery: SupplementResult['delivery'] = 'accepted', nativeId: string | undefined;
    try {
      const receipt = await runtime.supplement({ contextRef: participant.contextRef!, executionRef: execution, cwd: record.view.cwd, text, images, clientRequestId: input.clientRequestId });
      if (receipt.executionRef.id !== execution.id) throw new Error('agent_supplement_receipt_mismatch');
      nativeId = receipt.inputItemId;
    } catch (error) { delivery = error instanceof ExecutorInputRejected ? 'rejected' : 'unknown'; }
    // Native events, stop or a new run can advance while admission waits. Update only this input.
    record = this.ports.load(workspaceId, id);
    const attempt = record.attempts.find(item => item.clientRequestId === input.clientRequestId)!;
    const entry = record.view.entries.find(item => item.id === userEntryId)!;
    if (attempt.accepted) delivery = 'accepted';
    if (delivery === 'accepted') {
      attempt.accepted = true; attempt.nativeInputItemId ??= nativeId; entry.status = 'accepted'; delete entry.deliveryDiagnostic;
      if (nativeId) record.sources[`${participant.id}:message:${nativeId}`] = entry.id;
      const currentParticipant = record.participants.find(item => item.id === participant.id)!;
      currentParticipant.deliveredThrough = Math.max(currentParticipant.deliveredThrough, attempt.through);
    } else {
      entry.status = delivery === 'rejected' ? 'failed' : 'unknown';
      entry.deliveryDiagnostic = delivery === 'rejected' ? '这条消息未发送成功，文字与附件仍保留在输入框。' : '这条消息是否接收尚待确认，请先核对原执行，不要重复发送。';
    }
    this.ports.save(record);
    return { conversation: this.ports.view(record), delivery };
  }
}
