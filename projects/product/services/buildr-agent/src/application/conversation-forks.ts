import { createHash, randomUUID } from 'node:crypto';
import type { AgentRuntime, ConversationForkInput, ConversationView } from '../contracts.ts';
import { expected, fail, nonempty, safeDiagnostic, type StoredConversation, type StoredParticipant } from '../domain/agent-state.ts';
import type { ConversationRepository } from '../persistence/conversation-repository.ts';
import type { ConversationAttachments } from './conversation-attachments.ts';

/** One independent destination, with the source kept read-only throughout. */
export class ConversationForks {
  active = 0;
  private readonly options: {
    repository: ConversationRepository;
    media: ConversationAttachments;
    now(): string;
    load(scope: string, id: string): StoredConversation;
    candidate(scope: string, input: { cwd: string; taskId?: string }): Promise<StoredConversation>;
    runtime(record: StoredConversation, participant: StoredParticipant): Promise<AgentRuntime>;
    save(record: StoredConversation, initial?: boolean): void;
    view(record: StoredConversation): ConversationView;
  };
  constructor(options: ConversationForks['options']) { this.options = options; }

  async fork(scope: string, id: string, input: ConversationForkInput): Promise<ConversationView> {
    this.active++;
    try { return await this.create(scope, id, input); }
    finally { this.active--; }
  }
  private async create(scope: string, id: string, input: ConversationForkInput): Promise<ConversationView> {
    const requestId = nonempty(input.clientRequestId, '请求身份', 200);
    const digest = createHash('sha256').update(JSON.stringify([scope, id, input.entryId])).digest('hex');
    // Deterministic identity plus repository CAS arbitrates across backend processes.
    const hex = createHash('sha256').update(JSON.stringify(['conversation-fork/v1', scope, id, requestId])).digest('hex');
    const childId = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const existing = this.options.repository.readConversation(childId);
    if (existing) return this.previous(existing, digest);
    let source = this.options.load(scope, id);
    expected(source.view.revision, input.expectedRevision);
    if (source.view.forkState && source.view.forkState.status !== 'ready') fail('agent_fork_unavailable', '此分叉尚未完成，不能继续分叉。', 409);
    const entry = source.view.entries.find(value => value.id === input.entryId && value.role === 'assistant' && value.kind === 'message');
    const runId = entry?.runId;
    const outcome = runId === source.view.run?.id ? source.view.run : runId ? source.runOutcomes?.[runId] : undefined;
    const round = source.view.entries.filter(value => value.runId === runId);
    if (!entry || entry.status === 'running' || !runId || !outcome || !['completed','stopped','failed'].includes(outcome.status) ||
        round.filter(value => value.role === 'assistant' && value.kind === 'message').at(-1)?.id !== entry.id)
      fail('agent_fork_boundary_unavailable', '请选择已结束轮次的最后一条答复；旧记录缺少准确轮次时不能安全分叉。', 409);
    let nativeSource = source;
    const visited = new Set([id]);
    while (!nativeSource.attempts.some(value => value.runId === runId) && nativeSource.view.forkedFrom && entry.sequence <= nativeSource.view.forkedFrom.throughSequence) {
      const origin = nativeSource.view.forkedFrom;
      if (visited.has(origin.conversationId)) fail('agent_fork_boundary_unavailable', '分叉来源关系无法准确解析。', 409);
      visited.add(origin.conversationId);
      nativeSource = this.options.load(origin.workspaceId, origin.conversationId);
    }
    const participant = nativeSource.participants.find(value => value.id === entry.participantId);
    const attempt = nativeSource.attempts.find(value => value.runId === runId && value.participantId === participant?.id && !value.supplement);
    const sourceKey = Object.entries(nativeSource.sources).find(([key, value]) => value === entry.id && key.startsWith(participant?.id + ':message:'))?.[0];
    if (!participant?.contextRef || !attempt?.executionRef || !sourceKey) fail('agent_fork_boundary_unavailable', '此答复缺少准确的原生上下文或来源位置，原对话已保留。', 409);
    // A late repair can append an old round's tool result after newer work.
    // Never let that pull the intervening later rounds into the visible prefix.
    let through = entry.sequence;
    for (const following of source.view.entries.filter(value => value.sequence > entry.sequence)) {
      if (following.runId && following.runId !== runId) break;
      through = following.sequence;
    }
    const child = await this.options.candidate(scope, { cwd: source.view.cwd, taskId: source.view.taskId });
    child.view.id = childId;
    child.view.forkedFrom = { conversationId: id, workspaceId: scope, entryId: entry.id, runId, throughSequence: through, title: source.view.title, forkedAt: this.options.now() };
    child.view.entries = structuredClone(source.view.entries.filter(value => value.sequence <= through));
    child.runOutcomes = structuredClone(Object.fromEntries(Object.entries(source.runOutcomes ?? {}).filter(([key]) => child.view.entries.some(value => value.runId === key))));
    // Historical identities remain visible, but no original context can be resumed or controlled.
    child.participants = source.participants.filter(value => child.view.entries.some(entry => entry.participantId === value.id))
      .map(value => ({ ...structuredClone(value), historical: true, contextRef: undefined, deliveredThrough: 0 }));
    const receiving: StoredParticipant = { ...structuredClone(participant), id: randomUUID(), contextRef: undefined, deliveredThrough: through };
    child.participants.push(receiving);
    const sourceRuntime = await this.options.runtime(nativeSource, participant);
    const targetRuntime = await this.options.runtime(child, receiving);
    if (!targetRuntime.forkContext || sourceRuntime.bindingIdentity !== participant.bindingIdentity) fail('agent_fork_unavailable', '当前程序或接入身份不支持准确分叉，请核对程序版本与原接入。', 409);
    receiving.bindingIdentity = targetRuntime.bindingIdentity;
    // Check the observed source again after async setup, before any native side effect.
    source = this.options.load(scope, id);
    expected(source.view.revision, input.expectedRevision);
    child.forkRequest = { digest, clientRequestId: requestId };
    child.view.forkState = { status: 'creating' };
    try { this.options.save(child, true); }
    catch (error) {
      const winner = this.options.repository.readConversation(childId);
      if (winner) return this.previous(winner, digest);
      throw error;
    }
    try {
      this.options.media.inherit(source, child);
      const contextRef = await targetRuntime.forkContext({
        source: sourceRuntime, contextRef: participant.contextRef, cwd: child.view.cwd,
        executionRef: attempt.executionRef, itemId: sourceKey.slice(participant.id.length + ':message:'.length),
        inputItemIds: [...new Set(nativeSource.attempts.filter(value => value.runId === runId && value.participantId === participant.id && value.accepted).flatMap(value => [value.clientRequestId, ...(value.nativeInputItemId ? [value.nativeInputItemId] : [])]))],
        onCreated: ref => { receiving.contextRef = ref; this.checkpoint(child); },
      });
      if (!contextRef.id || contextRef.id === participant.contextRef.id) fail('agent_fork_identity_invalid', '分叉没有返回独立的原生身份，不能继续使用。', 409);
      receiving.contextRef = contextRef;
      this.checkpoint(child);
      // Native fork APIs may remap all message IDs. Freeze the exact inherited projection.
      for (const item of await targetRuntime.readHistory({ contextRef, cwd: child.view.cwd }))
        child.sources[`${receiving.id}:${item.kind}:${item.id}`] = '@inherited';
      child.view.forkState = { status: 'ready' };
      this.checkpoint(child);
      return this.options.view(child);
    } catch (error) {
      child.view.forkState = { status: 'failed', reason: '分叉未完成，已保留此次请求和已知原生身份；不会自动重复创建。' + safeDiagnostic(error) };
      this.checkpoint(child);
      fail('agent_fork_failed', child.view.forkState.reason!, 409);
    }
  }
  private checkpoint(record: StoredConversation): void {
    // A user can rename or hide the in-progress child from another page. Merge
    // only those independent fields; never lose a known native identity to a stale CAS.
    for (let retry = 0; retry < 3; retry++) {
      const current = this.options.repository.readConversation(record.view.id);
      if (current && current.view.revision !== record.view.revision) {
        if (current.view.run || current.forkRequest?.digest !== record.forkRequest?.digest) fail('agent_revision_conflict', '分叉记录已变化，已保留当前内容。', 409);
        record.view.revision = current.view.revision;
        record.view.title = current.view.title;
        record.view.titleState = current.view.titleState;
        record.view.hidden = current.view.hidden;
        record.view.taskId = current.view.taskId;
        record.titleOrigin = current.titleOrigin;
        record.attachments = { ...current.attachments, ...record.attachments };
      }
      try { this.options.save(record); return; }
      catch (error) { if (retry === 2 || !(error && typeof error === 'object' && 'code' in error && error.code === 'agent_revision_conflict')) throw error; }
    }
  }
  private previous(record: StoredConversation, digest: string): ConversationView {
    if (record.forkRequest?.digest !== digest) fail('agent_fork_request_conflict', '同一分叉请求不能用于其他答复。', 409);
    if (record.view.forkState?.status !== 'ready') fail('agent_fork_pending', record.view.forkState?.reason ?? '此次分叉仍在创建或结果待核对；不会再次创建，请稍后查看。', 409);
    return this.options.view(record);
  }
}
