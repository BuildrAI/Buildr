import { createHash, randomUUID } from 'node:crypto';
import { ExecutorInputRejected, type AgentRuntime, type ConversationView, type ExecutorImage, type ExecutorObservation, type SupplementInput, type SupplementResult } from '../contracts.ts';
import { AgentServiceError, fail, nonempty, type StoredConversation, type StoredParticipant } from '../domain/agent-state.ts';

/** A supplemental input is admitted on the exact run identity, not on a fresh
 * native snapshot alone. A snapshot that cannot answer promptly is recorded and
 * skipped: the executor's own exact-turn admission remains authoritative. */
const ADMISSION_OBSERVATION_TIMEOUT_MS = 8_000;

function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('agent_supplement_observation_timeout')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
function errorCode(error: unknown): string {
  if (error instanceof AgentServiceError) return error.code;
  return error instanceof Error && error.message ? error.message : 'agent_supplement_admission_failed';
}
/** Never claim "not sent" without a reason, and never blame the user's input
 * for a transient bookkeeping or observation failure. */
function admissionMessage(error: unknown): string {
  if (error instanceof AgentServiceError) return error.message;
  if (error instanceof ExecutorInputRejected) return '原执行已结束或暂不能接收追加消息；输入已保留，可继续对话。';
  return '未能核对原执行状态，这条追加尚未发送；输入已保留，可重试。';
}

type Ports = {
  generation: string;
  closing(): boolean;
  now(): string;
  load(workspaceId: string, id: string): StoredConversation;
  save(record: StoredConversation): void;
  view(record: StoredConversation): ConversationView;
  observe(record: StoredConversation, runId: string, observation: ExecutorObservation): void;
  continue(record: StoredConversation, input: SupplementInput, requestId: string): ConversationView;
  runtime(record: StoredConversation, participant: StoredParticipant): Promise<AgentRuntime>;
  materials(record: StoredConversation, participant: StoredParticipant, ids: string[]): { images: ExecutorImage[]; description: string };
  /** Private diagnostics only; never part of the public conversation view. */
  diagnostic?(event: { workspaceId: string; conversationId: string; clientRequestId: string; stage: 'observe' | 'admission' | 'dispatch'; code: string }): void;
};

/** Owns only supplementary admission. The conversation remains the single record authority. */
export class ConversationSupplements {
  private readonly pending = new Map<string, { workspaceId: string; conversationId: string; digest: string; work: Promise<SupplementResult> }>();
  private readonly ports: Ports;
  constructor(ports: Ports) { this.ports = ports; }
  get size() { return this.pending.size; }
  hasPending(workspaceId: string, id: string): boolean {
    return [...this.pending.values()].some(item => item.workspaceId === workspaceId && item.conversationId === id);
  }
  private current(record: StoredConversation, input: SupplementInput, allowEnded = false) {
    const run = record.view.run;
    if (this.ports.closing()) fail('agent_service_closing', '智能体服务正在退出，输入已保留。', 503);
    if (!run || run.id !== input.runId || run.participantId !== input.participantId || run.generation !== input.generation || run.generation !== this.ports.generation) fail('agent_supplement_stale', '原执行已变化，请核对后再发送；输入已保留。', 409);
    if (record.view.requests.some(request => request.runId === run.id && request.kind === 'question')) fail('agent_supplement_unavailable', '原执行仍有待回答问题或授权，请在原卡片处理；输入已保留，不会另开会话。', 409);
    if (!run.accepted || (!allowEnded && run.stopRequested) || !(allowEnded ? ['running', 'waiting-approval', 'waiting-question','unknown','completed','stopped','failed'] : ['running', 'waiting-approval', 'waiting-question','unknown']).includes(run.status)) fail('agent_supplement_unavailable', '当前执行尚不能接收新消息，请核对执行状态；输入已保留。', 409);
    const participant = record.participants.find(item => item.id === input.participantId);
    const execution = record.attempts.find(item => item.runId === input.runId && !item.supplement)?.executionRef;
    if (!participant?.contextRef || !execution) fail('agent_supplement_unavailable', '尚未确认原生执行身份，输入已保留。', 409);
    return { participant, execution };
  }
  send(workspaceId: string, id: string, raw: SupplementInput): Promise<SupplementResult> {
    const input: SupplementInput = { ...(raw.sameRunOnly !== undefined ? {sameRunOnly:raw.sameRunOnly} : {}), runId: nonempty(raw.runId, '执行身份'), participantId: nonempty(raw.participantId, '参与者身份'), generation: nonempty(raw.generation, '服务代次'), clientRequestId: nonempty(raw.clientRequestId, '请求身份', 200), text: raw.text, attachmentIds: raw.attachmentIds ?? [] };
    if (typeof input.text !== 'string' || Buffer.byteLength(input.text) > 64 * 1024) fail('agent_input_too_large', '输入过长，请缩小本次指令。', 413);
    if (!Array.isArray(input.attachmentIds) || input.attachmentIds.length > 9 || input.attachmentIds.some(value => typeof value !== 'string')) fail('agent_attachments_invalid', '每次最多添加9份附件。');
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
    const work = (previous ? this.reconcile(workspaceId, id, input.clientRequestId) : this.execute(workspaceId, id, input, digest)).finally(() => { if (this.pending.get(key)?.work === work) this.pending.delete(key); });
    this.pending.set(key, { workspaceId, conversationId:id, digest, work }); return work;
  }
  private async reconcile(workspaceId: string, id: string, requestId: string): Promise<SupplementResult> {
    let record = this.ports.load(workspaceId, id);
    let attempt = record.attempts.find(item => item.clientRequestId === requestId)!;
    let entry = record.view.entries.find(item => item.id === attempt.userEntryId)!;
    if (attempt.continuedBy && record.attempts.some(item => item.clientRequestId === attempt.continuedBy)) return { conversation: this.ports.view(record), delivery: 'continued' };
    if (attempt.accepted || entry.status === 'failed') return { conversation: this.ports.view(record), delivery: attempt.accepted ? 'accepted' : 'rejected' };
    try {
      const participant = record.participants.find(item => item.id === attempt.participantId)!;
      const runtime = await this.ports.runtime(record, participant);
      if (!participant.contextRef || participant.bindingIdentity !== runtime.bindingIdentity) throw new Error('agent_binding_changed');
      const receipt = (await runtime.readHistory({ contextRef: participant.contextRef, cwd: record.view.cwd })).find(item => item.role === 'user' && item.kind === 'message' && item.status !== 'failed' && !item.parentToolId && item.clientRequestId === requestId);
      record = this.ports.load(workspaceId, id); attempt = record.attempts.find(item => item.clientRequestId === requestId)!;
      entry = record.view.entries.find(item => item.id === attempt.userEntryId)!;
      if (receipt) {
        attempt.accepted = true; attempt.nativeInputItemId = receipt.id; entry.status = 'accepted'; delete entry.deliveryDiagnostic;
        record.sources[`${participant.id}:message:${receipt.id}`] = entry.id;
        const current = record.participants.find(item => item.id === participant.id)!;
        current.deliveredThrough = Math.max(current.deliveredThrough, attempt.through);
        this.ports.save(record);
      }
    } catch { record = this.ports.load(workspaceId, id); }
    const current = record.attempts.find(item => item.clientRequestId === requestId)!;
    return { conversation: this.ports.view(record), delivery: current.accepted ? 'accepted' : 'unknown' };
  }
  /** Persisting a native snapshot is bookkeeping; it never decides delivery. */
  private recordObservation(workspaceId: string, id: string, input: SupplementInput, observation: ExecutorObservation): void {
    try { this.ports.observe(this.ports.load(workspaceId, id), input.runId, observation); }
    catch (error) { this.report(workspaceId, id, input, 'observe', error); }
  }
  private report(workspaceId: string, id: string, input: SupplementInput, stage: 'observe' | 'admission' | 'dispatch', error: unknown): void {
    try { this.ports.diagnostic?.({ workspaceId, conversationId: id, clientRequestId: input.clientRequestId, stage, code: errorCode(error) }); }
    catch { /* Diagnostics never affect admission. */ }
  }
  private async execute(workspaceId: string, id: string, input: SupplementInput, digest: string): Promise<SupplementResult> {
    let record = this.ports.load(workspaceId, id);
    const initial = this.current(record, input, true);
    const runtime = await this.ports.runtime(record, initial.participant);
    if (!runtime.capabilities.supplement || !runtime.supplement) fail('agent_supplement_unsupported', '当前接入尚不支持执行中发送，输入已保留。', 409);
    record = this.ports.load(workspaceId, id);
    const { participant, execution } = this.current(record, input, true);
    if (participant.bindingIdentity !== runtime.bindingIdentity) fail('agent_binding_changed', '原连接身份已变化，输入已保留。', 409);
    const { images, description } = this.ports.materials(record, participant, input.attachmentIds!);
    const text = input.text + description;
    if (Buffer.byteLength(text) > runtime.capabilities.maxInputBytes || images.length && !runtime.capabilities.images) fail('agent_capability_unavailable', '当前执行不能接收这些内容，文字与附件已保留。', 413);
    const sequence = (record.view.entries.at(-1)?.sequence ?? 0) + 1, userEntryId = randomUUID();
    record.view.entries.push({ id: userEntryId, sequence, createdAt: this.ports.now(), kind: 'message', role: 'user', text: input.text, attachments: input.attachmentIds, runId: input.runId, participantId: participant.id, provider: participant.provider, status: 'sending' });
    record.attempts.push({ clientRequestId: input.clientRequestId, inputDigest: digest, runId: input.runId, participantId: participant.id, through: sequence, userEntryId, executionRef: execution, accepted: false, supplement: true });
    this.ports.save(record);
    let delivery: SupplementResult['delivery'] = 'accepted', nativeId: string | undefined, dispatched = false, ended = false, refusal: string | undefined;
    const observe = async () => {
      const observed = await runtime.observe({ contextRef: participant.contextRef!, executionRef: execution });
      const exact = observed.executionRef?.id === execution.id;
      if (exact && ['idle','stopped'].includes(observed.status) && !observed.backgroundWork && !observed.requests?.length && observed.tools.every(tool => tool.status === 'completed')) {
        ended = true; this.recordObservation(workspaceId, id, input, observed);
      } else if (observed.status === 'unknown' && (!observed.executionRef || exact)) {
        this.recordObservation(workspaceId, id, input, observed);
      }
      return observed;
    };
    try {
      let observed: ExecutorObservation | undefined;
      try { observed = await bounded(observe(), ADMISSION_OBSERVATION_TIMEOUT_MS); }
      catch (error) { this.report(workspaceId, id, input, 'observe', error); }
      if (observed) {
        if (ended || observed.requests?.some(request => request.kind === 'question') || !['running','waiting'].includes(observed.status) || observed.executionRef?.id !== execution.id) {
          refusal = ended ? '原轮已结束，这条追加尚未发送；输入已保留，不会自动另开会话。'
            : observed.requests?.some(request => request.kind === 'question') ? '原轮仍有待回答问题，请在原卡片处理；追加内容已保留。'
            : observed.executionRef?.id !== execution.id ? '尚未核对到准确的原生执行身份，追加内容未发送。'
            : '已自动核对，但原生执行状态仍无法确认；追加内容未发送，不会另开会话。';
          throw new ExecutorInputRejected('agent_supplement_unavailable');
        }
        // The observation itself is asynchronous; never target a superseded input.
        this.current(this.ports.load(workspaceId, id), input);
        const verified = this.ports.load(workspaceId, id);
        // A native running snapshot must not erase a concurrently pending approval.
        if (!verified.view.requests.some(request => request.runId === input.runId))
          this.recordObservation(workspaceId, id, input, { ...observed, requests: undefined });
      } else {
        // A slow or failed native snapshot is not a native refusal. Re-verify
        // only the durable run identity and let the executor's exact-turn
        // admission decide; a busy event stream must not cost the user's input.
        this.current(this.ports.load(workspaceId, id), input);
      }
      dispatched = true;
      const receipt = await runtime.supplement({ contextRef: participant.contextRef!, executionRef: execution, cwd: record.view.cwd, text, images, clientRequestId: input.clientRequestId });
      if (receipt.executionRef.id !== execution.id) throw new Error('agent_supplement_receipt_mismatch');
      nativeId = receipt.inputItemId;
    } catch (error) {
      delivery = error instanceof ExecutorInputRejected || !dispatched ? 'rejected' : 'unknown';
      if (delivery === 'rejected') {
        refusal ??= admissionMessage(error);
        this.report(workspaceId, id, input, dispatched ? 'dispatch' : 'admission', error);
      }
      if (dispatched && delivery === 'unknown') {
        // Absence from history proves nothing. Only this exact native user receipt confirms acceptance.
        try {
          const receipt = (await runtime.readHistory({ contextRef: participant.contextRef!, cwd: record.view.cwd })).find(item => item.role === 'user' && item.kind === 'message' && item.status !== 'failed' && !item.parentToolId && item.clientRequestId === input.clientRequestId);
          if (receipt) { delivery = 'accepted'; nativeId = receipt.id; }
        } catch { /* Keep the original unknown result; do not retry the native input. */ }
      } else if (dispatched && delivery === 'rejected') { try { await observe(); } catch { /* A rejected input stays retained when the old execution cannot be observed. */ } }
    }
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
      entry.deliveryDiagnostic = delivery === 'rejected' ? refusal ?? '这条消息未发送成功，文字与附件仍保留在输入框。' : '消息已保存，是否送达仍待确认，请勿重复发送。';
    }
    this.ports.save(record);
    if (!input.sameRunOnly && delivery === 'rejected' && ended && record.view.run?.id === input.runId && !record.view.run.stopRequested && !record.view.requests.some(request => request.runId === input.runId)) {
      const requestId = attempt.continuedBy ?? randomUUID();
      attempt.continuedBy = requestId; this.ports.save(record);
      try {
        this.ports.continue(record, input, requestId);
        record = this.ports.load(workspaceId, id);
        record.view.entries.find(item => item.id === userEntryId)!.deliveryDiagnostic = '原轮已结束，这条要求已接续到新一轮。';
        this.ports.save(record);
        return { conversation: this.ports.view(record), delivery: 'continued' };
      } catch {
        record = this.ports.load(workspaceId, id);
        if (record.attempts.some(item => item.clientRequestId === requestId)) return { conversation: this.ports.view(record), delivery: 'continued' };
        // Normal send validation still applies. The original failed input and draft remain.
      }
    }
    return { conversation: this.ports.view(record), delivery };
  }
}
