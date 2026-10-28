import { normalizeSendDraft } from '../domain/send-draft.ts';
import { ConversationAttachments, MAX_IMAGE_BYTES, MAX_VISUAL_INPUTS } from './conversation-attachments.ts';
import type { AttachmentInput } from '../contracts.ts';
import { continuationDraft } from '../domain/conversation-continuation.ts';
import { RETRY_DELAYS, transientFailure } from '../domain/transient-failure.ts';
import { NativeRequestError } from '../domain/error-diagnostic.ts';
import {selectedOffering,modelConfiguration} from '../model-access/model-preferences.ts';
import type {ModelOffering} from '../model-access/contracts.ts';
import type { ModelAccess } from '../model-access/application.ts';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentRuntime, AgentServiceOptions, ConversationEntry, ConversationView, ExecutorEvent, ExecutorImage, ExecutorItem, ExecutorObservation, RunView, SendDraft, SendPreview } from '../contracts.ts';
import { AgentServiceError, BUSY_STATES, expected, fail, nonempty, safeDiagnostic } from '../domain/agent-state.ts';
import type { StoredConversation, StoredParticipant } from '../domain/agent-state.ts';
import type { ConversationRepository } from '../persistence/conversation-repository.ts';
import type { ConnectionApplication } from './connection-application.ts';
import type { ConversationEvents } from './conversation-events.ts';
import {HANDOFF_PROMPT,HANDOFF_SUMMARY_PROMPT,handoffEntries,organizeHandoff,displayRounds,receivingBudget,formatHandoffRounds} from '../domain/handoff-material.ts';
import {handoffSources} from './handoff-sources.ts';
import { resolvePermissionMode } from '../domain/permission-mode.ts';
import type { HostContext } from './host-context.ts';
import { PendingSendRepository } from '../persistence/pending-send-repository.ts';
import { ConversationSupplements } from './conversation-supplements.ts';
import type { SupplementInput } from '../contracts.ts';
import { ConversationDrafts } from './conversation-drafts.ts';

const TITLE_TIMEOUT_MS = 45_000;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_ITEM_BYTES = 1024 * 1024;
const PAGE_SIZE = 100;
const PAGE_ROUNDS = 5;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function within<T>(work: Promise<T>, milliseconds: number, code: string, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    if (!signal) return;
    cancel = () => reject(new Error('agent_title_cancelled'));
    if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, {once:true});
  });
  try { return await Promise.race([work, cancelled, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); if (cancel) signal?.removeEventListener('abort', cancel); }
}
const bounded = (value: number | undefined, fallback: number, max: number) => Math.max(1, Math.min(Number.isFinite(value) ? Math.trunc(value!) : fallback, max));

export class ConversationApplication {
  readonly drafts: ConversationDrafts;
  activity(): Array<{kind:string;count:number}> {
    return [
      {kind:'execution',count:this.workers.size},
      {kind:'input',count:this.supplements.size},
      {kind:'title',count:this.titleWork.size + this.earlyTitles.size},
      {kind:'recovery',count:this.recoveries.size},
      {kind:'reply',count:this.repliesInFlight.size},
    ].filter(value=>value.count>0);
  }
  private readonly previewSecret = randomUUID();
  private readonly workers = new Map<string, Promise<void>>();
  private readonly observations = new Map<string, Promise<ConversationView>>();
  private readonly repliesInFlight = new Set<string>();
  private readonly titleWork = new Map<string, AbortController>();
  private readonly earlyTitles = new Map<string, Promise<void>>();
  private readonly sourceConnections = new Map<string,string>();
  private readonly sourceRuntimes = new Map<string, Promise<{runtime: AgentRuntime; model: string}>>();
  private readonly sourceOwners = new Map<string, {workspaceId: string; id: string}>();
  private releasingIdleSources?: Promise<void>;
  private readonly releaseChecks = new Map<string,Promise<boolean>>();
  private readonly releasedRuns = new Set<string>();
  private sharedNativeContext = false;
  canAdoptParallel(): boolean { return !this.sharedNativeContext; }
  private closing = false;
  private recoveryWork?: Promise<void>;
  private readonly recoveries = new Map<string, Promise<void>>();
  private readonly retryWaits = new Map<string, AbortController>();
  private readonly cancelledRetries = new Set<string>();
  private readonly handoffPreviews = new Map<string,{baseToken:string;prepared:ReturnType<ConversationApplication['prepare']>}>();
  private readonly supplements: ConversationSupplements;
  private readonly media: ConversationAttachments;
  private readonly options: {
    repository: ConversationRepository;
    connections: ConnectionApplication;
    modelAccess?: ModelAccess;
    events: ConversationEvents;
    root: string;
    generation: string;
    now(): string;
    host: HostContext;
    autoContinueInterrupted?: boolean;
    generationAlive?: (generation: string) => boolean;
  };
  constructor(options: ConversationApplication['options']) {
    this.options = options;
    this.media = new ConversationAttachments({ root: options.root, now: options.now, save: record => this.save(record) });
    this.drafts = new ConversationDrafts({
      root: options.root, repository: options.repository, source: scope => options.host.ref(scope).sourceId,
      candidate: (scope, input) => this.candidate(scope, input),
      prepare: (record, input) => this.prepare(record, input).preview,
      submit: (record, input) => this.submit(record, input, false, true),
      read: (scope, id) => this.read(scope, id),
    });
    this.supplements = new ConversationSupplements({ generation: options.generation, now: options.now, closing: () => this.closing,
      load: (workspaceId, id) => this.load(workspaceId, id), save: record => this.save(record), view: record => this.view(record),
      runtime: async (record, participant) => {
        if (!options.connections.get(participant.connectionId).enabled) fail('agent_connection_disabled', '接入已断开，输入已保留。', 409);
        return (await this.sourceRuntime(record, participant)).runtime;
      }, materials: (record, participant, ids) => {
        const connection = options.connections.get(participant.connectionId);
        if (!connection.enabled) fail('agent_connection_disabled', '接入已断开，输入已保留。', 409);
        const source = participant.modelAccountId ? options.modelAccess?.accounts.snapshot(participant.modelAccountId) : undefined;
        if (participant.modelAccountId && (!source || source.identity !== participant.modelAccountIdentity)) fail('agent_model_source_changed', '原模型来源已变化，输入已保留。', 409);
        const model = source?.models.find(item => item.id === participant.modelId);
        if (ids.length && (!connection.capabilities.images || source && !model?.images)) fail('agent_capability_unavailable', '当前执行的模型不支持这些图片，输入已保留。', 409);
        const materials = this.media.expand(record, ids);
        if (materials.images.length > MAX_VISUAL_INPUTS || materials.images.some(image => record.attachments[image.id]!.size > (connection.capabilities.maxImageBytes ?? MAX_IMAGE_BYTES)) || materials.images.reduce((sum, image) => sum + record.attachments[image.id]!.size, 0) > 32 * 1024 * 1024) fail('agent_image_invalid', '图片或视频画面超过当前接入的容量，输入已保留。', 413);
        return materials;
      },
    });
  }
  private get pendingSends() { return new PendingSendRepository(this.options.root); }

  private async sourceRuntime(record: StoredConversation, participant: StoredParticipant): Promise<{runtime: AgentRuntime; model: string}> {
    if (!participant.modelAccountId) {
      this.sharedNativeContext = true;
      return this.options.connections.runtime(participant.connectionId).then(runtime => ({runtime, model: record.view.run?.model ?? ''}));
    }
    this.sourceOwners.set(participant.id, {workspaceId:record.view.workspaceId,id:record.view.id});
    const found = this.sourceRuntimes.get(participant.id);
    if (found) {
      const source = await found;
      if (!source.runtime.closed) return source;
      if (this.sourceRuntimes.get(participant.id) === found) this.sourceRuntimes.delete(participant.id);
      const replacement = this.sourceRuntimes.get(participant.id); if (replacement) return replacement;
    }
    const access = this.options.modelAccess; if (!access) fail('agent_model_source_unavailable', '模型套餐组件不可用。', 409);
    const work = access.leases.create({ accountId: participant.modelAccountId, expectedIdentity: participant.modelAccountIdentity, modelId: participant.modelId!,serviceTier:participant.serviceTier, conversationId: record.view.id, agentId: participant.connectionId, runId: record.view.run?.id ?? 'observe' }).then(async lease => ({ runtime: await this.options.connections.runtime(participant.connectionId, { identity: lease.identity, baseUrl: lease.baseUrl, apiKey: lease.apiKey, models: [{id: lease.model, label: lease.offering.label, isDefault: true, reasoningEfforts: lease.offering.reasoningEfforts, defaultReasoningEffort: lease.offering.defaultReasoningEffort, contextWindow: lease.offering.contextWindow, maxOutputTokens: lease.offering.maxOutputTokens, vision: lease.offering.images, tools: lease.offering.tools}] }), model: lease.model })).catch(error => { this.sourceRuntimes.delete(participant.id); throw error; });
    this.sourceConnections.set(participant.id, participant.connectionId); this.sourceRuntimes.set(participant.id, work); return work;
  }
  /** Retiring generations release only idle, conversation-specific runtimes.
   * Native contexts keep their writer until their owning process actually exits. */
  releaseIdleSources(owner?: {workspaceId:string; id:string}): Promise<void> {
    if (this.releasingIdleSources) return this.releasingIdleSources;
    const work = (async () => {
      const groups = new Map<AgentRuntime, Array<{id:string; source:Promise<{runtime:AgentRuntime;model:string}>}>>();
      for (const [id, source] of this.sourceRuntimes) {
        const value = await source.catch(() => undefined);
        if (!value) continue;
        const {runtime} = value;
        const members = groups.get(runtime) ?? []; members.push({id,source}); groups.set(runtime,members);
      }
      for (const [runtime, members] of groups) {
        if (owner && !members.some(({id}) => { const value=this.sourceOwners.get(id); return value?.workspaceId===owner.workspaceId && value.id===owner.id; })) continue;
        if (members.some(({id,source}) => {
          const owner = this.sourceOwners.get(id);
          return !owner || this.sourceRuntimes.get(id) !== source || this.busy(owner.workspaceId,owner.id);
        })) continue;
        await this.options.connections.releaseGatewayRuntime(runtime);
        for (const {id,source} of members) if (this.sourceRuntimes.get(id) === source) {
          this.sourceRuntimes.delete(id); this.sourceOwners.delete(id); this.sourceConnections.delete(id);
        }
      }
    })();
    this.releasingIdleSources = work;
    void work.finally(() => { if (this.releasingIdleSources === work) this.releasingIdleSources = undefined; }).catch(() => {});
    return work;
  }
  retainsConversationSource(workspaceId:string,id:string): boolean {
    return this.sharedNativeContext || [...this.sourceOwners.values()].some(owner=>owner.workspaceId===workspaceId && owner.id===id);
  }
  /** A retained process acknowledges release only after the exact native round and
   * all conversation-specific work have ended. Shared writers are never closed here. */
  async observeForRelease(workspaceId:string, id:string, expectedRunId:string, generation:string): Promise<boolean> {
    const before=this.load(workspaceId,id).view.run;
    if (!before || before.id!==expectedRunId || before.generation!==generation || generation!==this.options.generation) fail('agent_control_stale','原执行已变化，请重新核对。',409);
    if (this.releasedRuns.has(expectedRunId)) return true;
    const pending=this.releaseChecks.get(expectedRunId); if(pending)return pending;
    const work=(async()=>{
      await this.observe(workspaceId,id);
      const run=this.load(workspaceId,id).view.run;
      if (!run || run.id!==expectedRunId || run.generation!==generation || this.busy(workspaceId,id)) return false;
      await this.releaseIdleSources({workspaceId,id});
      if (this.busy(workspaceId,id) || this.retainsConversationSource(workspaceId,id)) return false;
      this.releasedRuns.add(expectedRunId);return true;
    })().finally(()=>this.releaseChecks.delete(expectedRunId));
    this.releaseChecks.set(expectedRunId,work);return work;
  }
  private load(workspaceId: string, id: string): StoredConversation {
    const record = this.options.repository.readConversation(nonempty(id, '对话身份'));
    if (!record || record.view.workspaceId !== workspaceId) fail('agent_conversation_missing', '该工作空间中没有此对话。', 404);
    record.attachments ??= {};
    return record;
  }
  private view(record: StoredConversation, before?: number, limit?: number): ConversationView {
    const entries = record.view.entries.filter(entry => before === undefined || entry.sequence < before);
    const count = limit === undefined ? undefined : bounded(limit, PAGE_SIZE, 200);
    let inferredRound = {id:'legacy:0'};
    const entryRounds = count === undefined ? entries.map(entry => {
      const identified = entry.runId ? `run:${entry.runId}` : undefined;
      if (entry.kind === 'message' && entry.role === 'user') {
        if (!identified || inferredRound.id !== identified) inferredRound = {id:identified ?? `legacy:${entry.id}`};
      } else if (identified && inferredRound.id !== identified) {
        // Recovered legacy input may acquire its run identity from a later item.
        if (inferredRound.id.startsWith('legacy:')) inferredRound.id = identified;
        else inferredRound = {id:identified};
      }
      // Untagged tools and request answers inherit their surrounding round.
      return inferredRound;
    }) : [];
    const rounds = new Set<string>();
    let pageBytes = 2, start = entries.length;
    while (start > 0) {
      const entry = entries[start - 1]!;
      const round = entryRounds[start - 1]?.id ?? '';
      if (count !== undefined ? entries.length - start >= count : !rounds.has(round) && rounds.size >= PAGE_ROUNDS) break;
      const size = Buffer.byteLength(JSON.stringify(entry)) + Number(start < entries.length);
      if (start < entries.length && pageBytes + size > MAX_PAGE_BYTES) break;
      pageBytes += size; start--; rounds.add(round);
    }
    // Historical tool output can be large; clone only the page that will be sent.
    const view = structuredClone({ ...record.view, entries: entries.slice(start), nextEntryCursor: start > 0 ? entries[start]!.sequence : undefined });
    view.attachmentRevision = hash(record.attachments ?? {});
    view.titleState??={status:'unknown'};
    view.participants = record.participants.map(participant => ({
      id: participant.id, provider: participant.provider, connectionId: participant.connectionId,
      label: participant.label, model: participant.modelId, modelAccountId:participant.modelAccountId, deliveredThrough: participant.deliveredThrough, contextId: participant.contextRef?.id ?? '',
    }));
    if (view.run && view.run.generation !== this.options.generation && !this.options.generationAlive?.(view.run.generation) && BUSY_STATES.has(view.run.status)) {
      view.run.status = 'unknown'; view.run.interrupted = true; view.run.diagnostic = '服务重启后原执行尚待核对，工作记录已保留。';
    }
    view.pendingSend = this.pendingSends.view(this.pendingSends.read(view.workspaceId, view.id));
    return view;
  }
  private save(record: StoredConversation, initial = false): void {
    if(record.view.run?.status==='completed'){record.view.run.interrupted=undefined;delete record.interruption;}
    const observed=record.view.run;if(observed&&['completed','failed','stopped','unknown','tools-active'].includes(observed.status)){record.runOutcomes??={};record.runOutcomes[observed.id]={status:observed.status,diagnostic:observed.diagnostic,model:observed.model,provider:observed.provider,updatedAt:observed.updatedAt};}
    const prior = record.view.revision;
    record.view.revision = randomUUID(); record.view.updatedAt = this.options.now();
    this.options.repository.saveConversation(record, initial ? undefined : prior);
    this.options.events.publish({ type: 'conversation', workspaceId: record.view.workspaceId, conversationId: record.view.id, revision: record.view.revision, payload: { conversation: this.view(record) } });
  }
  read(workspaceId: string, id: string, options: { before?: number; limit?: number } = {}): ConversationView {
    return this.view(this.load(workspaceId, id), options.before, options.limit);
  }
  list(workspaceId: string, input: { taskId?: string; cursor?: string; limit?: number; hidden?: boolean; query?: string } = {}): { conversations: ConversationView[]; nextCursor?: string } {
    const limit = bounded(input.limit, 30, 100);
    const records = this.options.repository.listConversations(workspaceId, { taskId: input.taskId, before: input.cursor, limit: limit + 1, includeHidden: input.hidden, query: input.query?.trim().slice(0, 200) });
    const chosen = records.slice(0, limit);
    return { conversations: chosen.map(record => ({ ...this.view(record, undefined, 1), entries: [] })), nextCursor: records.length > limit ? `${chosen.at(-1)!.view.updatedAt}/${chosen.at(-1)!.view.id}` : undefined };
  }
  lookupRequest(workspaceId:string,id:string,clientRequestId:string) {
    const record=this.load(workspaceId,id),attempt=record.attempts.find(value=>value.clientRequestId===clientRequestId);
    return attempt ? {found:true,runId:attempt.runId,accepted:attempt.accepted,conversation:this.view(record)} : {found:false};
  }
  pending(): { conversations: ConversationView[] } { return { conversations: this.options.repository.listPending().map(record => ({ ...this.view(record, undefined, 1), entries: [] })) }; }
  listAll(workspaceIds:string[],input:{workspaceId?:string;activeOnly?:boolean;hidden?:boolean;query?:string;agent?:string;model?:string;activityState?:string;cursor?:string;limit?:number}={}) {
    if(input.workspaceId&&!workspaceIds.includes(input.workspaceId))fail('agent_workspace_missing','工作空间未登记。',404);
    const result=this.options.repository.querySummaries(workspaceIds,{...input,generation:this.options.generation,query:input.query?.trim().slice(0,200),limit:bounded(input.limit,30,100)},this.options.generationAlive);
    for(const view of result.conversations){
      if(view.run&&view.run.generation!==this.options.generation&&!this.options.generationAlive?.(view.run.generation)&&BUSY_STATES.has(view.run.status)){view.run.status='unknown';view.run.interrupted=true;}
    }
    return result;
  }
  markSeen(workspaceId:string,id:string,input:{through:number}) {
    this.load(workspaceId,id);
    return {activity:this.options.repository.markSeen(workspaceId,id,input.through)};
  }

  async create(workspaceId: string, input: { cwd?: string; taskId?: string; title?: string }): Promise<ConversationView> {
    const record = await this.candidate(workspaceId, input);
    this.options.repository.saveConversation(record);
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: record.view.id, revision: record.view.revision, payload: { conversation: this.view(record) } });
    return this.view(record);
  }
  private async candidate(workspaceId: string, input: { cwd?: string; taskId?: string; title?: string }): Promise<StoredConversation> {
    const workspace = await this.options.host.resolve(workspaceId);
    if (input.taskId) await this.options.host.verify(workspaceId, nonempty(input.taskId, '任务身份'));
    const selected = input.cwd ?? workspace.rootPath;
    if (!path.isAbsolute(selected)) fail('agent_cwd_invalid', '请选择准确的绝对工作目录。');
    let cwd: string;
    try { cwd = fs.realpathSync(selected); if (!fs.statSync(cwd).isDirectory()) throw new Error(); }
    catch { fail('agent_cwd_missing', '工作目录不存在或不可访问。'); }
    const record: StoredConversation = { view: {
      id: randomUUID(), workspaceId, cwd, taskId: input.taskId, title: input.title ? nonempty(input.title, '对话标题', 160) : '新对话', titleState:{status:input.title?'manual':'pending'},
      revision: randomUUID(), hidden: false, updatedAt: this.options.now(), participants: [], entries: [], requests: [],
    }, hostScope: workspace, titleOrigin: input.title ? 'manual' : 'default', participants: [], sources: {}, attempts: [], requests: {}, attachments: {} };
    return record;
  }
  async update(workspaceId: string, id: string, input: { expectedRevision: string; title?: string; hidden?: boolean; taskId?: string | null }): Promise<ConversationView> {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (input.title !== undefined) { record.view.title = nonempty(input.title, '对话标题', 160); record.titleOrigin = 'manual'; record.view.titleState={status:'manual'}; }
    if (input.taskId !== undefined) {
      if (input.taskId === null) record.view.taskId = undefined;
      else { const taskId = nonempty(input.taskId, '任务身份'); await this.options.host.verify(workspaceId, taskId); record.view.taskId = taskId; }
    }
    if (input.hidden !== undefined) { if (typeof input.hidden !== 'boolean') fail('agent_input_invalid', '隐藏状态无效。'); record.view.hidden = input.hidden; }
    this.save(record); return this.view(record);
  }
  private assertIdle(record: StoredConversation): void {
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
    if (record.view.run && BUSY_STATES.has(record.view.run.status)) fail('agent_conversation_busy', '请先处理当前执行或未知状态；新内容仍可保留为草稿。', 409);
  }
  busy(workspaceId: string, id: string): boolean {
    const record = this.load(workspaceId, id);
    return Boolean(record.view.run && (BUSY_STATES.has(record.view.run.status) || record.view.run.tools.some(tool=>tool.status!=='completed') || this.workers.has(record.view.run.id)) || record.view.requests.length || this.titleWork.has(id) || this.earlyTitles.has(id) || this.recoveries.has(`${workspaceId}/${id}`) || this.observations.has(`${workspaceId}/${id}`));
  }
  async verifyNext(workspaceId: string, id: string): Promise<void> {
    const record = this.load(workspaceId, id);
    await this.options.host.resolve(workspaceId);
    if (record.view.taskId) await this.options.host.verify(workspaceId, record.view.taskId);
  }
  validatePending(workspaceId: string, id: string, input: SendDraft): SendDraft {
    if (input.continueRunId) fail('agent_continue_unavailable', '恢复动作不能排队到其他执行之后，请核对当前状态再继续。', 409);
    const record = this.load(workspaceId, id);
    const draft = this.draft(input);
    for (const attachment of draft.attachmentIds ?? []) this.media.get(record, attachment);
    const account = draft.modelAccountId ? this.options.modelAccess?.accounts.read(draft.modelAccountId) : undefined;
    if (draft.modelAccountId && !account) fail('agent_model_source_unavailable', '所选模型账号不可用。', 409);
    if (account && draft.modelAccountIdentity && draft.modelAccountIdentity !== account.identity) fail('agent_model_source_changed', '所选模型账号身份已变化，请重新选择。', 409);
    return { ...draft, ...(account ? { modelAccountIdentity: account.identity } : {}) };
  }
  queueSend(workspaceId: string, id: string, input: SendDraft & { clientRequestId: string; expectedPendingRevision?: string; previousRunId?: string }): ConversationView {
    const { clientRequestId, expectedPendingRevision, previousRunId, ...raw } = input;
    const requestId = nonempty(clientRequestId, '请求身份', 200);
    const existing = this.pendingSends.lookup(workspaceId, id, requestId);
    if (existing && expectedPendingRevision === undefined) {
      this.pendingSends.submit(workspaceId, id, this.draft(raw), requestId);
      return this.read(workspaceId, id);
    }
    const observed = this.load(workspaceId,id).view.run;
    if (previousRunId !== undefined && observed?.id !== previousRunId) fail('agent_revision_conflict','上一轮执行已变化，请重新读取后提交；草稿保留。',409);
    const draft = this.validatePending(workspaceId, id, raw);
    this.pendingSends.submit(workspaceId, id, draft, requestId, expectedPendingRevision, this.draft(raw));
    const view = this.read(workspaceId, id);
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: id, revision: view.revision, payload: { conversation: view } });
    return view;
  }
  cancelPendingSend(workspaceId: string, id: string, input: { expectedPendingRevision: string }): ConversationView {
    this.load(workspaceId, id);
    this.pendingSends.cancel(workspaceId, id, input.expectedPendingRevision);
    const view = this.read(workspaceId, id);
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: id, revision: view.revision, payload: { conversation: view } });
    return view;
  }
  private draft(input: SendDraft): SendDraft { return normalizeSendDraft(input); }
  private prepare(record: StoredConversation, raw: SendDraft): { preview: SendPreview; text: string; images: ExecutorImage[]; draft: SendDraft;configuration?:string;needsCompression:boolean;fullText:string } {
    let input = this.draft(raw); expected(record.view.revision, input.expectedRevision); this.assertIdle(record);
    input = continuationDraft(record, input);
    const connection = this.options.connections.get(input.connectionId);
    if (!connection.enabled || (!input.modelAccountId && connection.status !== 'ready')) fail('agent_account_unavailable', '请先准备智能体程序，并连接所选模型账号。', 409);
    if (input.modelAccountId && connection.provider === 'qoder' && ['not-authenticated','expired'].includes(connection.status)) fail('qoder_platform_login_required', 'Qoder 程序需要先完成基础平台登录；所选套餐不变，不要求使用 Qoder 自有模型。', 409);
    if (!(connection.capabilities.permissionModes ?? ['default']).includes(input.permissionMode!)) fail('agent_permission_unavailable', '此接入尚不支持所选权限模式，请明确改选后重试。', 409);
    const source = input.modelAccountId ? this.options.modelAccess?.accounts.snapshot(input.modelAccountId) : undefined;
    if (input.modelAccountId && (!source || !source.enabled || source.status !== 'ready')) fail('agent_model_source_unavailable', '所选套餐尚未连接，请检查账号。', 409);
    if (source && input.modelAccountIdentity && source.identity !== input.modelAccountIdentity) fail('agent_model_source_changed', '套餐登录来源已变化，请重新选择套餐模型。', 409);
    // The revision is an observation hint, not a selection identity. Current source,
    // identity, model availability and capability are revalidated below.
    const availableModels = source?.models ?? connection.models;
    const selectedModel = input.model ? availableModels.find(model => model.id === input.model) : source ? source.models.find(model=>model.enabled!==false) : connection.models.find(model => model.isDefault);
    if (input.model && !selectedModel) fail('agent_model_unavailable', '该模型不在当前接入的可用目录中。', 409);
    input.model = selectedModel?.id ?? input.model;
    if(source&&selectedModel&&'enabled' in selectedModel&&selectedModel.enabled===false)fail('agent_model_disabled','所选模型已停用，请重新选择。',409);
    const boundModel=source&&selectedModel?selectedOffering(selectedModel as ModelOffering,input.serviceTier):selectedModel;
    if(input.serviceTier&&!source)fail('agent_model_tier_unavailable','原生默认模型不支持此共享服务档位。',409);
    input.serviceTier=source?(boundModel as ModelOffering|undefined)?.defaultServiceTier:undefined;
    const modelConfig=source&&selectedModel?modelConfiguration(selectedModel as ModelOffering,input.serviceTier):undefined;
    // Native Codex keeps earlier permission instructions in its thread. Devin
    // rejects the default-mode block even after a later full-access turn.
    // Match a permission-bound participant and use the normal visible handoff;
    // never remove native instructions or silently raise the selected mode.
    const configuration=source?.provider==='devin'&&connection.provider==='codex'?hash({model:modelConfig,permission:input.permissionMode}):modelConfig;
    input.reasoningEffort ??= boundModel?.defaultReasoningEffort;
    if (input.reasoningEffort && !boundModel?.reasoningEfforts?.some(effort => effort.id === input.reasoningEffort)) fail('agent_reasoning_unavailable', '该思考深度不在所选模型的可用目录中。', 409);
    if (!connection.capabilities.text) fail('agent_capability_unavailable', '此接入尚不支持文本输入。', 409);
    const participant = record.participants.find(value => value.connectionId === input.connectionId && value.modelAccountId === input.modelAccountId && value.modelId === input.model && (!input.modelAccountId || value.modelAccountIdentity === source?.identity && value.modelConfiguration===configuration));
    const through = record.view.entries.at(-1)?.sequence ?? 0;
    const changes = handoffEntries(record.view.entries,participant?.deliveredThrough??0);
    const switching = record.participants.length > 0 && record.view.run?.participantId !== participant?.id;
    const history = changes.map(entry => ({sequence:entry.sequence,role:entry.role,provider:entry.provider,text:entry.kind==='tool'?`${entry.name??'工具'} · ${entry.status??'结果未知'}（具体内容见本地来源）`:entry.text.length>4096?entry.text.slice(0,4096)+'…（完整原文见本地来源）':entry.text}));
    const maxInputBytes=receivingBudget(connection.capabilities.maxInputBytes,boundModel&&'contextWindow' in boundModel?boundModel.contextWindow:undefined,boundModel&&'maxOutputTokens' in boundModel?boundModel.maxOutputTokens:undefined);
    const localRounds=organizeHandoff(changes,{...record.runOutcomes,...(record.view.run?{[record.view.run.id]:record.view.run}:{})});
    const historicalImages=[...new Set(changes.flatMap(e=>e.attachments??[]))].map(id=>{try{const image=this.media.describe(record,id);return {...image,available:true};}catch{return {id,available:false};}});
    const sources=changes.length?handoffSources(this.options.root,record.view.id,changes,localRounds,historicalImages):undefined;
    const rounds=sources?.rounds??localRounds;
    const currentImages=input.attachmentIds??[];
    const canAttachHistory=connection.capabilities.images&&(!source||Boolean(selectedModel&&'images' in selectedModel&&selectedModel.images));
    const priorImages=canAttachHistory&&currentImages.length<4?historicalImages.filter(image=>image.available&&'mimeType' in image&&image.mimeType?.startsWith('image/')&&!currentImages.includes(image.id)).slice(-Math.max(0,4-currentImages.length)).map(image=>image.id):[];
    const ids=[...new Set([...priorImages,...currentImages])];
    const materials = this.media.expand(record, ids);
    const images = materials.images;
    const context=JSON.stringify({conversationId:record.view.id,workspaceId:record.view.workspaceId,cwd:record.view.cwd,conversationTitle:record.view.title,taskId:record.view.taskId,sourceThrough:through,permissionMode:input.permissionMode,executionState:record.view.run?.status??'idle',sourceIndex:sources?.index,imageInputIds:ids,currentImageIds:currentImages,currentImages:images.filter(image=>currentImages.includes(image.id)),historicalImages:historicalImages.slice(-4),historicalImageCount:historicalImages.length,historicalImageNotice:historicalImages.length?'历史图片的全部准确引用见本地索引；此处只列最近四张。没有作为图像输入发送的部分须按需读取，不能假装已看到。':undefined});
    const suffix=`\n\n本次用户要求：\n${input.text}${materials.description}${input.handoffSummary?'\n用户补充的交接说明（不替代本地历史）：\n'+input.handoffSummary:''}`;
    const fullText=changes.length||switching?`${HANDOFF_PROMPT}\n工作位置与来源：${context}\n按轮次组织的本地记录：\n${formatHandoffRounds(rounds)}${suffix}`:input.text+materials.description;
    const needsCompression=Buffer.byteLength(fullText)>maxInputBytes;
    const text=needsCompression&&sources?`${HANDOFF_PROMPT}\n工作位置与来源：${context}\n完整历史共有 ${rounds.length} 轮，记录 #${changes[0]?.sequence??0}–#${through}，超过内联容量。请先读取本地索引 ${sources.index}，按各轮路径读取用户要求、授权纠正、失败未知、成果和待办。正文没有省略来源，具体内容需按引用读取。${suffix}`:fullText;
    const previous=record.participants.find(p=>p.id===record.view.run?.participantId);
    const difference:Array<{kind:'agent'|'model';label:string;before:string;after:string}>=[];
    if(previous&&previous.connectionId!==input.connectionId)difference.push({kind:'agent',label:'智能体',before:previous.label,after:connection.label});
    if(previous&&(record.view.run?.model!==input.model||previous.modelAccountId!==input.modelAccountId))difference.push({kind:'model',label:'模型',before:record.view.run?.model??'默认模型',after:boundModel?.label??input.model??'默认模型'});
    const handoff={agent:connection.label,model:boundModel?.label??input.model??'默认模型',changes:difference,rounds:displayRounds(rounds),roundCount:rounds.length,body:text,sourceThrough:through,mode:needsCompression?'indexed' as const:'records' as const,...(sources?{sourcePath:sources.index}:{})};
    const inputBytes = Buffer.byteLength(text);
    const imageBytes = images.reduce((total, image) => total + record.attachments[image.id]!.size, 0);
    const fits = inputBytes <= maxInputBytes && images.length <= MAX_VISUAL_INPUTS && imageBytes <= 32 * 1024 * 1024 && images.every(image => record.attachments[image.id]!.size <= (connection.capabilities.maxImageBytes ?? MAX_IMAGE_BYTES)) && (!images.length || (connection.capabilities.images && (!source || Boolean(selectedModel && 'images' in selectedModel && selectedModel.images))));
    const token = createHmac('sha256', this.previewSecret).update(JSON.stringify({ id: record.view.id, input, sourceRevision: source?.revision, through, text, ids })).digest('hex');
    return { preview: { handoff, token, conversationId: record.view.id, revision: record.view.revision, connectionId: input.connectionId, modelAccountId: input.modelAccountId, modelAccountIdentity: source?.identity, modelAccountRevision: source?.revision, modelSourceLabel: source?.accountLabel ?? source?.label, model: input.model, serviceTier:input.serviceTier,reasoningEffort: input.reasoningEffort, permissionMode: input.permissionMode!, participantId: participant?.id, cwd: record.view.cwd, taskId: record.view.taskId, text: input.text, history, sourceThrough: through, inputBytes, maxInputBytes, fits, switching, diagnostic: fits ? undefined : images.length && !canAttachHistory ? '所选执行方或模型无法接收这些图片，请选择支持图片的执行组合；草稿已保留。' : '必要交接资料仍超出接收容量，请选择容量更大的模型；草稿与本地资料保留。' }, text, images, draft: input,configuration,needsCompression,fullText };
  }
  prepareSend(workspaceId: string, id: string, input: SendDraft): SendPreview { return this.prepare(this.load(workspaceId, id), input).preview; }

  async prepareHandoff(workspaceId:string,id:string,input:SendDraft):Promise<SendPreview>{
    const record=this.load(workspaceId,id),prepared=this.prepare(record,input);
    if(input.skipHandoffSummary||!prepared.needsCompression||!prepared.preview.handoff)return prepared.preview;
    for(const cached of this.handoffPreviews.values())if(cached.baseToken===prepared.preview.token)return cached.prepared.preview;
    const previous=record.participants.find(p=>p.id===record.view.run?.participantId);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12_000);
    try{
      // The local source index always survives; an auxiliary model never replaces it.
      if(!previous) return prepared.preview;
      const selected:typeof prepared.preview.handoff.rounds=[];let size=0;
      for(const round of [...prepared.preview.handoff.rounds].reverse()){const bytes=Buffer.byteLength(JSON.stringify(round));if(size+bytes>32*1024)break;selected.unshift(round);size+=bytes;}
      if(!selected.length)return prepared.preview;
      const prompt=HANDOFF_SUMMARY_PROMPT+'\n本次摘要仅覆盖以下轮次 #'+selected[0]!.from+'–#'+selected.at(-1)!.through+'；其余历史请通过完整索引读取。\n'+JSON.stringify(selected);
      let summary:string|undefined;
      if(previous.modelAccountId&&this.options.modelAccess){
        const source=this.options.modelAccess.accounts.snapshot(previous.modelAccountId);
        const quota=source.quota;
        if(source.identity!==previous.modelAccountIdentity||!source.enabled||source.status!=='ready'||quota?.available&&quota.remainingPercent===0)return prepared.preview;
        summary=await within(this.options.modelAccess.generate({accountId:previous.modelAccountId,expectedIdentity:previous.modelAccountIdentity,modelId:previous.modelId!,serviceTier:previous.serviceTier,conversationId:id,agentId:previous.connectionId,runId:'handoff-'+randomUUID(),prompt,signal:controller.signal}),12_000,'agent_handoff_summary_timeout');
      }else if(previous.contextRef){
        const runtime=await within(this.options.connections.runtime(previous.connectionId),3_000,'agent_handoff_source_timeout');
        if(runtime.bindingIdentity!==previous.bindingIdentity||!runtime.summarizeHandoff)return prepared.preview;
        summary=await within(runtime.summarizeHandoff({contextRef:previous.contextRef,cwd:record.view.cwd,description:prompt,model:previous.modelId,signal:controller.signal}),12_000,'agent_handoff_summary_timeout');
      }
      if(!summary?.trim()||Buffer.byteLength(summary)>24*1024)return prepared.preview;
      const current=this.prepare(this.load(workspaceId,id),input);
      if(current.preview.token!==prepared.preview.token)fail('agent_preview_stale','交接来源已变化，请重新读取；草稿保留。',409);
      const text=prepared.text+'\n\n原模型整理的辅助摘要（仅覆盖提供的轮次摘录，完整资料请读取本地索引；来源截至 #'+prepared.preview.sourceThrough+'）：\n'+summary;
      if(Buffer.byteLength(text)>prepared.preview.maxInputBytes)return prepared.preview;
      const baseToken=prepared.preview.token;
      prepared.text=text;prepared.preview={...prepared.preview,token:createHmac('sha256',this.previewSecret).update(baseToken+text).digest('hex'),inputBytes:Buffer.byteLength(text),handoff:{...prepared.preview.handoff,body:text,mode:'summary'}};
      if(this.handoffPreviews.size>=32)this.handoffPreviews.delete(this.handoffPreviews.keys().next().value!);
      prepared.fullText='';this.handoffPreviews.set(prepared.preview.token,{baseToken,prepared});return prepared.preview;
    }catch(error){
      if(error instanceof AgentServiceError&&['agent_revision_conflict','agent_preview_stale','agent_model_source_changed'].includes(error.code))throw error;
      // No work input was submitted, so local-source fallback is safe after failure.
      expected(this.load(workspaceId,id).view.revision,input.expectedRevision);return prepared.preview;
    }finally{clearTimeout(timer);controller.abort();}
  }

  send(workspaceId: string, id: string, raw: SendDraft & { previewToken: string; clientRequestId: string }, systemRecovery = false): { run: RunView; conversation: ConversationView } {
    return this.submit(this.load(workspaceId, id), raw, systemRecovery);
  }
  private submit(record: StoredConversation, raw: SendDraft & { previewToken: string; clientRequestId: string }, systemRecovery = false, initial = false): { run: RunView; conversation: ConversationView } {
    const { workspaceId, id } = record.view;
    const clientRequestId = nonempty(raw.clientRequestId, '请求身份', 200);
    const inputDigest = hash({ ...this.draft(raw), expectedRevision: undefined });
    const repeated = record.attempts.find(attempt => attempt.clientRequestId === clientRequestId);
    if (repeated) {
      const legacyDigest = hash({ ...this.draft(raw), permissionMode: undefined, expectedRevision: undefined });
      if (repeated.inputDigest !== inputDigest && !(resolvePermissionMode(raw.permissionMode) === 'default' && repeated.inputDigest === legacyDigest)) fail('agent_request_conflict', '相同请求身份对应不同输入，已拒绝重复执行。', 409);
      if (record.view.run?.id !== repeated.runId) fail('agent_request_already_accepted', '该请求已受理，请读取其原有历史。', 409);
      return { run: structuredClone(record.view.run), conversation: this.view(record) };
    }
    const baseline = this.prepare(record, raw);
    const cached=this.handoffPreviews.get(raw.previewToken);
    const prepared=cached?.baseToken===baseline.preview.token?cached.prepared:baseline;
    const a = Buffer.from(prepared.preview.token); const b = Buffer.from(String(raw.previewToken));
    if (a.length !== b.length || !timingSafeEqual(a, b)) fail('agent_preview_stale', '发送预览已变化，请重新核对后发送。', 409);
    if (!prepared.preview.fits) fail('agent_handoff_capacity', prepared.preview.diagnostic!, 413);
    let participant = record.participants.find(value=>value.id===prepared.preview.participantId);
    const connection = this.options.connections.get(prepared.draft.connectionId);
    if (!participant) {
      participant = { id: randomUUID(), connectionId: connection.id, provider: connection.provider, label: connection.label, modelAccountId: prepared.draft.modelAccountId, modelAccountIdentity: prepared.draft.modelAccountId ? this.options.modelAccess?.accounts.snapshot(prepared.draft.modelAccountId).identity : undefined, modelId: prepared.draft.model,serviceTier:prepared.draft.serviceTier,modelConfiguration:prepared.configuration, bindingIdentity: prepared.draft.modelAccountId ? '' : this.options.connections.binding(connection.id) ?? '', deliveredThrough: 0 };
      record.participants.push(participant);
    }
    const run: RunView = { id: randomUUID(), participantId: participant.id, provider: participant.provider, generation: this.options.generation, status: 'starting', accepted: false, tools: [], modelAccountId: prepared.draft.modelAccountId, modelAccountIdentity: prepared.preview.modelAccountIdentity, modelSourceLabel: prepared.preview.modelSourceLabel, model: prepared.draft.model, serviceTier:prepared.draft.serviceTier,reasoningEffort: prepared.draft.reasoningEffort, permissionMode: prepared.draft.permissionMode, startedAt: this.options.now(), updatedAt: this.options.now() };
    const append = (entry: Omit<ConversationEntry, 'sequence' | 'createdAt'>) => { record.view.entries.push({ ...entry, sequence: (record.view.entries.at(-1)?.sequence ?? 0) + 1, createdAt: this.options.now() }); };
    if (prepared.preview.switching) append({ id: randomUUID(), kind: 'handoff', role: 'system', text: `交给 ${connection.label} · ${prepared.draft.model??'默认模型'}`, participantId: participant.id, provider: participant.provider, runId:run.id, status:'sending', handoff:prepared.preview.handoff });
    if (prepared.draft.handoffSummary !== undefined) append({ id: randomUUID(), kind: 'notice', role: 'user', text: `用户补充的交接说明：\n${prepared.draft.handoffSummary}`, participantId: participant.id,runId:run.id });
    const userEntryId = randomUUID();
    const manualRecovery = Boolean(raw.continueRunId);
    append({ id: userEntryId, kind: systemRecovery || manualRecovery ? 'notice' : 'message', role: systemRecovery || manualRecovery ? 'system' : 'user', text: manualRecovery ? record.view.run?.accepted ? '已请求继续上次执行。' : '已请求重试上次未送达的要求。' : prepared.draft.text, participantId:participant.id, provider:participant.provider, runId: run.id, status: 'sending', attachments: prepared.draft.attachmentIds });
    const automaticRetry = systemRecovery ? record.attempts.find(value => value.runId === record.view.run?.id)?.automaticRetry : undefined;
    record.attempts.push({ clientRequestId, inputDigest, runId: run.id, participantId: participant.id, through: record.view.entries.at(-1)!.sequence, userEntryId, accepted: false, ...(raw.continueRunId ? {continuationOf: raw.continueRunId} : {}), ...(automaticRetry ? {automaticRetry: {...automaticRetry}} : {}) });
    const previousRun=record.view.run;if(previousRun){record.runOutcomes??={};record.runOutcomes[previousRun.id]={status:previousRun.status,diagnostic:previousRun.diagnostic,model:previousRun.model,provider:previousRun.provider,updatedAt:previousRun.updatedAt};}
    if (!participant.modelAccountId) this.sharedNativeContext = true;
    delete record.interruption;
    record.view.run = run;
    this.save(record, initial);
    const work = this.execute(workspaceId, id, run.id, prepared).finally(() => { this.workers.delete(run.id); this.cancelledRetries.delete(run.id); });
    this.workers.set(run.id, work);
    return { run: structuredClone(run), conversation: this.read(workspaceId, id) };
  }

  supplement(workspaceId: string, id: string, input: SupplementInput) { return this.supplements.send(workspaceId, id, input); }

  private currentRun(workspaceId: string, id: string, runId: string): StoredConversation | undefined {
    const record = this.load(workspaceId, id);
    return record.view.run?.id === runId && record.view.run.generation === this.options.generation ? record : undefined;
  }
  private applyItem(record: StoredConversation, participant: StoredParticipant, item: ExecutorItem, runId?: string): boolean {
    if (Buffer.byteLength(item.text) > MAX_ITEM_BYTES) fail('agent_native_item_too_large', '原生条目超出安全展示容量，原记录保留于准确原生会话。', 413);
    const source = `${participant.id}:${item.kind}:${item.id}`;
    let entry = record.view.entries.find(value => value.id === record.sources[source]);
    if (!entry && item.role === 'user') {
      const candidates = record.attempts.filter(value => value.participantId === participant.id && (value.nativeInputItemId === item.id || value.clientRequestId === item.id || item.clientRequestId && value.clientRequestId === item.clientRequestId));
      const legacy = record.attempts.filter(value => value.participantId === participant.id && item.executionId && value.executionRef?.id === item.executionId);
      const attempt = candidates.length === 1 ? candidates[0] : candidates.length === 0 && legacy.length === 1 && !legacy[0].supplement ? legacy[0] : undefined;
      if (attempt) {
        entry = record.view.entries.find(value => value.id === attempt.userEntryId);
        if (!entry) fail('agent_native_user_unmapped', '原生输入记录尚不能准确映射。', 409);
        const changed = record.sources[source] !== entry.id || attempt.nativeInputItemId !== item.id || !attempt.accepted || entry.status !== 'accepted';
        record.sources[source] = entry.id; attempt.nativeInputItemId = item.id; attempt.accepted = true; entry.status = 'accepted'; delete entry.deliveryDiagnostic;
        participant.deliveredThrough = Math.max(participant.deliveredThrough, attempt.through);
        return changed;
      }
      else fail('agent_native_user_unmapped', '原生用户输入尚不能准确映射，已保留现有记录，请重新观察。', 409);
    }
    if (entry) {
      record.sources[source] = entry.id;
      if (entry.role === 'user' || entry.role === 'system' && entry.kind === 'notice') return false;
      const nameChanged = item.name !== undefined && entry.name !== item.name;
      const inputChanged = item.input !== undefined && entry.input !== item.input;
      if (entry.text === item.text && entry.status === item.status && !nameChanged && !inputChanged) return false;
      entry.text = item.text; entry.status = item.status; if (nameChanged) entry.name = item.name; if (inputChanged) entry.input = item.input; return true;
    }
    entry = { id: randomUUID(), sequence: (record.view.entries.at(-1)?.sequence ?? 0) + 1, createdAt: this.options.now(), kind: item.kind, role: item.role, text: item.text, name: item.name, input: item.input, participantId: participant.id, provider: participant.provider, runId:runId??record.attempts.find(a=>a.participantId===participant.id&&(a.executionRef?.id===item.executionId||a.clientRequestId===item.executionId))?.runId, status: item.status };
    record.view.entries.push(entry); record.sources[source] = entry.id;
    participant.deliveredThrough = Math.max(participant.deliveredThrough, entry.sequence);
    return true;
  }
  private event(workspaceId: string, id: string, runId: string, event: ExecutorEvent): void {
    const record = this.currentRun(workspaceId, id, runId); if (!record) return;
    const run = record.view.run!; const participant = record.participants.find(value => value.id === run.participantId)!;
    const attempt = record.attempts.find(value => value.runId === runId)!;
    if(event.type==='context-usage'){if(Number.isSafeInteger(event.usedTokens)&&event.usedTokens>=0){run.contextUsage={usedTokens:event.usedTokens,...(Number.isSafeInteger(event.windowTokens)&&event.windowTokens!>0?{windowTokens:event.windowTokens}:{})};run.updatedAt=this.options.now();this.save(record);}return;}
    if (event.type === 'models') {
      const connection = this.options.connections.observeModels(participant.connectionId, participant.bindingIdentity, event.models);
      this.options.events.publish({ type: 'connection', workspaceId, conversationId: id, revision: connection.revision, payload: { connection } }); return;
    }
    if (event.type === 'title') { if (this.acceptTitle(record, event.title)) this.save(record); return; }
    if (['completed', 'stopped', 'failed'].includes(run.status) && (event.type === 'accepted' || event.type === 'request')) return;
    if (event.type === 'accepted') {
      attempt.accepted = true; attempt.executionRef = event.executionRef; attempt.nativeInputItemId = event.inputItemId;
      for(const receipt of record.view.entries.filter(e=>e.kind==='handoff'&&e.runId===runId))receipt.status='accepted';
      run.accepted = true; if (run.status !== 'stopping') run.status = 'running';
      participant.deliveredThrough = Math.max(participant.deliveredThrough, attempt.through);
      const entry = record.view.entries.find(value => value.id === attempt.userEntryId)!; entry.status = 'accepted';
      if (event.inputItemId) record.sources[`${participant.id}:message:${event.inputItemId}`] = entry.id;
    } else if (event.type === 'item') {
      if (!this.applyItem(record, participant, event.item, runId)) return;
    } else if (event.type === 'request') {
      if (!attempt.executionRef) fail('agent_native_request_unbound', '原生交互尚未取得执行身份，不能安全回应。', 409);
      const existing = record.view.requests.find(request => record.requests[request.id]?.nativeId === event.request.id && request.runId === runId);
      if (!existing) {
        const requestId = randomUUID();
        record.requests[requestId] = { nativeId: event.request.id, executionRef: attempt.executionRef };
        record.view.requests.push({ ...event.request, id: requestId, conversationId: id, workspaceId, participantId: participant.id, runId, generation: this.options.generation });
      }
      run.status = event.request.kind === 'approval' ? 'waiting-approval' : 'waiting-question';
    } else if (event.type === 'request-resolved') {
      let removed = false;
      record.view.requests = record.view.requests.filter(request => {
        if (record.requests[request.id]?.nativeId !== event.requestId) return true;
        delete record.requests[request.id]; removed = true; return false;
      });
      if (!removed) return;
      if (!record.view.requests.length && ['waiting-approval', 'waiting-question'].includes(run.status)) run.status = 'running';
    } else if (event.type === 'observation') this.applyObservation(record, event.observation);
    else if (event.type === 'diagnostic') run.diagnostic = event.message;
    else if (event.type === 'completed') {
      // A model terminal event alone does not prove that tools have stopped.
      if (event.status === 'failed') { run.status = 'failed'; run.diagnostic = event.diagnostic ?? '原生执行失败。'; }
      else { run.diagnostic = event.diagnostic; }
    }
    run.updatedAt = this.options.now(); this.save(record);
    if (event.type === 'accepted' && run.status === 'stopping') {
      // Stop may arrive before the vendor has returned its execution identity.
      queueMicrotask(() => {
        const current = this.currentRun(workspaceId, id, runId);
        if (current?.view.run?.status === 'stopping') void this.stop(workspaceId, id, { expectedRevision: current.view.revision, runId, participantId: run.participantId, generation: run.generation }).catch(() => {});
      });
    }
  }
  private applyObservation(record: StoredConversation, observation: ExecutorObservation): void {
    const run = record.view.run; if (!run) return;
    run.tools = observation.tools;
    if (observation.diagnostic) run.diagnostic = observation.diagnostic;
    if (observation.status === 'tools-active' || observation.tools.some(tool => tool.status === 'running') && !['running', 'waiting'].includes(observation.status)) run.status = 'tools-active';
    else if (observation.status === 'unknown' || observation.tools.some(tool => tool.status === 'unknown')) run.status = 'unknown';
    else if (observation.status === 'stopped') {
      if (run.status === 'unknown' && !record.interruption && !observation.diagnostic) run.diagnostic = '原执行已确认停止，可以继续对话。';
      run.status = 'stopped'; record.view.requests = []; record.requests = {};
    }
    else if (observation.status === 'idle') {
      if (!run.accepted) { if (run.status !== 'starting' && run.status !== 'stopping') run.status = 'unknown'; return; }
      run.status = run.status === 'stopping' ? 'stopped' : run.status === 'failed' ? 'failed' : 'completed';
      if (run.status==='completed' && !observation.diagnostic) delete run.diagnostic;
      record.view.requests = []; record.requests = {};
    } else if (observation.status === 'running') run.status = run.status === 'stopping' ? 'stopping' : 'running';
    run.updatedAt = this.options.now();
  }

  private async execute(workspaceId: string, id: string, runId: string, prepared: ReturnType<ConversationApplication['prepare']>, retryCount?: number): Promise<void> {
    const attempt = this.currentRun(workspaceId, id, runId)?.attempts.find(value => value.runId === runId);
    const request = attempt?.clientRequestId ?? '';
    const lineage = /^automatic-retry:([^:]+):(\d+)$/.exec(request);
    const retries = retryCount ?? attempt?.automaticRetry?.count ?? Number(lineage?.[2] ?? 0);
    const rootRunId = attempt?.automaticRetry?.rootRunId ?? lineage?.[1] ?? runId;
    let dispatched = false;
    let creatingContext = false;
    try {
      let record = this.currentRun(workspaceId, id, runId); if (!record) return;
      const workspace = await this.options.host.resolve(workspaceId, record.hostScope?.revision);
      if (!workspace.rootPath) fail('agent_workspace_missing', '原工作空间不可用。', 409);
      record = this.currentRun(workspaceId, id, runId); if (!record) return;
      if(record.hostScope && (record.hostScope.ref.sourceId!==workspace.ref.sourceId || record.hostScope.ref.id!==workspace.ref.id || record.hostScope.rootPath!==workspace.rootPath))fail('agent_scope_binding_changed','执行环境身份或位置已变化，请核对原工作。',409);
      if (record.view.taskId) await this.options.host.verify(workspaceId, record.view.taskId);
      if (!fs.statSync(record.view.cwd, { throwIfNoEntry: false })?.isDirectory()) fail('agent_cwd_missing', '对话保存的工作目录已不可用。', 409);
      const startingParticipant = record.participants.find(value => value.id === record!.view.run!.participantId)!;
      if (startingParticipant.modelAccountId) await this.options.modelAccess!.leases.create({accountId:startingParticipant.modelAccountId, expectedIdentity:startingParticipant.modelAccountIdentity, modelId:startingParticipant.modelId!,serviceTier:startingParticipant.serviceTier,conversationId:record.view.id,agentId:startingParticipant.connectionId,runId});
      const selectedRuntime = await this.sourceRuntime(record, startingParticipant);
      const runtime = selectedRuntime.runtime;
      record = this.currentRun(workspaceId, id, runId); if (!record) return;
      const participant = record.participants.find(value => value.id === record!.view.run!.participantId)!;
      if (participant.bindingIdentity && participant.bindingIdentity !== runtime.bindingIdentity) fail('agent_binding_changed', '此参与者的原连接身份不匹配，不能恢复到其他配置。', 409);
      participant.bindingIdentity = runtime.bindingIdentity;
      if (record.view.run!.status === 'stopping') { record.view.run!.status = 'stopped'; this.save(record); return; }
      if (participant.contextRef) {
        await runtime.resumeContext({ contextRef: participant.contextRef, cwd: record.view.cwd, permissionMode: prepared.draft.permissionMode });
        const history = await runtime.readHistory({ contextRef: participant.contextRef, cwd: record.view.cwd });
        let changed = false;
        for (const item of history) changed = this.applyItem(record, participant, item) || changed;
        if (changed) { this.save(record); fail('agent_history_changed', '原生记录有新变化，本次要求已保留；请核对后再继续。', 409); }
      } else {
        creatingContext = true;
        const ref = await runtime.createContext({ cwd: record.view.cwd, permissionMode: prepared.draft.permissionMode });
        record = this.currentRun(workspaceId, id, runId); if (!record) return;
        const storedParticipant = record.participants.find(value => value.id === participant.id)!;
        storedParticipant.contextRef = ref; storedParticipant.bindingIdentity = runtime.bindingIdentity;
        participant.contextRef = ref; this.save(record);
        creatingContext = false;
      }
      const beforeDispatch = this.currentRun(workspaceId, id, runId); if (!beforeDispatch) return;
      record = beforeDispatch;
      if (beforeDispatch.view.run!.status === 'stopping') { beforeDispatch.view.run!.status = 'stopped'; this.save(beforeDispatch); return; }
      if (!this.options.connections.get(prepared.draft.connectionId).enabled) fail('agent_connection_disabled', '接入已断开，本次输入尚未交付。', 409);
      dispatched = true;
      if (!this.earlyTitles.has(id)) {
        const early = this.titleAtRunStart(workspaceId, id, runId, runtime).catch(() => {});
        this.earlyTitles.set(id, early);
        void early.finally(() => { if (this.earlyTitles.get(id) === early) this.earlyTitles.delete(id); });
      }
      await runtime.send({ contextRef: participant.contextRef!, cwd: record.view.cwd, text: prepared.text, images: prepared.images, model: prepared.draft.modelAccountId ? selectedRuntime.model : prepared.draft.model, reasoningEffort: prepared.draft.reasoningEffort, permissionMode: prepared.draft.permissionMode, clientRequestId: record.attempts.find(value => value.runId === runId)!.clientRequestId, onEvent: event => this.event(workspaceId, id, runId, event) });
      await this.observe(workspaceId, id);
      const ended = this.currentRun(workspaceId, id, runId);
      if (ended?.view.run?.status === 'failed') await this.retryFailure(workspaceId, id, runId, prepared, retries, rootRunId, ended.view.run.diagnostic ?? '', runtime);
      void this.generateAutomaticTitle(workspaceId, id, runId, runtime).catch(() => {});
    } catch (error) {
      const record = this.currentRun(workspaceId, id, runId); if (!record) return;
      const run = record.view.run!;
      const rejectedBeforeInput = !run.accepted && error instanceof AgentServiceError && ['agent_permission_invalid', 'agent_permission_unavailable', 'agent_permission_unverified', 'agent_reasoning_unavailable'].includes(error.code);
      const userStopping = run.status === 'stopping';
      const possiblyDelivered = dispatched && !rejectedBeforeInput;
      if (!['stopped', 'completed'].includes(run.status)) run.status = possiblyDelivered ? 'unknown' : 'failed';
      run.diagnostic = safeDiagnostic(error); run.updatedAt = this.options.now();
      const transportLost = error instanceof Error && ['codex_execution_observation_lost', 'codex_event_observation_lost'].includes(error.message);
      if (!this.closing && !userStopping && transportLost && run.accepted && run.status === 'unknown' && !record.interruption?.cancelled) {
        record.interruption = { runId, reason: 'transport', awaitingUser: record.view.requests.length > 0, attempted: record.attempts.some(attempt => attempt.runId === runId && attempt.clientRequestId.startsWith('host-recovery:')) };
        run.interrupted = true;
      }
      const attempt = record.attempts.find(value => value.runId === runId);
      const entry = record.view.entries.find(value => value.id === attempt?.userEntryId);
      if (entry && !run.accepted) entry.status = possiblyDelivered ? 'unknown' : 'failed';
      if(!run.accepted)for(const receipt of record.view.entries.filter(e=>e.kind==='handoff'&&e.runId===runId))receipt.status=possiblyDelivered?'unknown':'failed';
      try { this.save(record); } catch { return; /* Preserve existing DB and native state. */ }
      if (record.interruption?.reason === 'transport' && !this.closing) await this.recoverOne(workspaceId, id);
      else if (!dispatched && !userStopping && (!creatingContext || error instanceof NativeRequestError)) await this.retryFailure(workspaceId, id, runId, prepared, retries, rootRunId, error instanceof Error && transientFailure(error.message) ? error.message : safeDiagnostic(error), undefined);
    }
  }

  private async retryFailure(workspaceId: string, id: string, runId: string, prepared: ReturnType<ConversationApplication['prepare']>, count: number, rootRunId: string, reason: string, runtime?: AgentRuntime): Promise<void> {
    if (this.closing || this.cancelledRetries.has(runId) || !transientFailure(reason)) return;
    let record = this.currentRun(workspaceId, id, runId);
    if (!record || record.view.run?.status !== 'failed' || record.view.requests.length || record.interruption?.cancelled || record.view.run.tools.some(tool => tool.status !== 'completed')) return;
    if (count >= RETRY_DELAYS.length) { record.view.run.diagnostic = `自动重试已达上限（${RETRY_DELAYS.length} 次），工作记录已保留。${record.view.run.diagnostic ?? ''}`; this.save(record); return; }
    if (runtime) {
      const participant = record.participants.find(value => value.id === record!.view.run!.participantId)!;
      const executionRef = record.attempts.find(value => value.runId === runId)?.executionRef;
      if (!participant.contextRef || !executionRef) return;
      const observed = await runtime.observe({ contextRef: participant.contextRef, executionRef }).catch(() => undefined);
      if (!observed || observed.executionRef?.id !== executionRef.id || observed.status !== 'idle' || observed.tools.some(tool => tool.status !== 'completed')) return;
      record = this.currentRun(workspaceId, id, runId);
      if (this.cancelledRetries.has(runId) || !record || record.view.run?.status !== 'failed' || record.view.requests.length || record.interruption?.cancelled) return;
    }
    const diagnostic = record.view.run!.diagnostic;
    const attempt = record.attempts.find(value => value.runId === runId)!;
    attempt.automaticRetry = {rootRunId, count: count + 1};
    const controller = new AbortController();
    this.retryWaits.set(runId, controller);
    record.view.run!.status = 'starting';
    record.view.run!.diagnostic = `暂时未完成，${RETRY_DELAYS[count] / 1000} 秒后自动重试（${count + 1}/${RETRY_DELAYS.length}）。${diagnostic ?? ''}`;
    this.save(record);
    try {
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, RETRY_DELAYS[count]);
        controller.signal.addEventListener('abort', finish, { once: true });
      });
      record = this.currentRun(workspaceId, id, runId);
      if (controller.signal.aborted || this.closing || !record || record.view.run?.status !== 'starting') return;
      this.retryWaits.delete(runId);
      record.view.run.status = 'failed'; record.view.run.diagnostic = diagnostic; this.save(record);
      // Preparation rechecks source identity, current model, permission and saved revision.
      const draft: SendDraft = { ...prepared.draft, continueRunId: undefined, expectedRevision: record.view.revision, skipHandoffSummary: true,
        ...(runtime ? { text: '系统自动重试：上次执行因临时服务故障明确结束，已确认没有未结束的工具。请核对原对话、当前成果及工具结果，继续完成用户尚未完成的目标；不要重放全部历史命令，不扩大原有授权。' } : {}) };
      const preview = this.prepareSend(workspaceId, id, draft);
      if (runtime) this.send(workspaceId, id, { ...draft, previewToken: preview.token, clientRequestId: `automatic-retry:${rootRunId}:${count + 1}` }, true);
      else {
        const retried = { ...this.prepare(this.load(workspaceId, id), draft), text: prepared.text };
        const current = this.currentRun(workspaceId, id, runId); if (!current) return;
        current.view.run!.status = 'starting'; current.view.run!.diagnostic = undefined;
        const entry = current.view.entries.find(value => value.id === current.attempts.find(value => value.runId === runId)?.userEntryId);
        if (entry) entry.status = 'sending'; this.save(current);
        await this.execute(workspaceId, id, runId, retried, count + 1);
      }
    } catch (error) {
      const current = this.currentRun(workspaceId, id, runId);
      if (current && !controller.signal.aborted && !this.closing) { current.view.run!.status = 'failed'; current.view.run!.diagnostic = '自动重试未完成：' + safeDiagnostic(error); this.save(current); }
    } finally { if (this.retryWaits.get(runId) === controller) this.retryWaits.delete(runId); }
  }

  private titleEligible(record: StoredConversation): boolean {
    return !this.closing && record.titleOrigin === 'default' && record.view.title === '新对话';
  }
  /** Backfill the neutral name as soon as execution starts; the completed-run path stays the fallback. */
  private async titleAtRunStart(workspaceId: string, id: string, runId: string, runtime: AgentRuntime): Promise<void> {
    const record = this.currentRun(workspaceId, id, runId);
    if (!record || !this.titleEligible(record) || record.titleAttempted || record.earlyTitleAttempted || this.titleWork.has(id)) return;
    const participant = record.participants.find(value => value.id === record.view.run!.participantId);
    const description = this.titleDescription(record, false);
    if (!participant?.contextRef || !description) return;
    record.earlyTitleAttempted = true;
    if (!runtime.generateTitle) { this.recordTitleFailure(workspaceId, id, runId, 'early', new Error('agent_title_unavailable')); return; }
    record.view.titleState={status:'generating'}; this.save(record);
    const controller = new AbortController(); this.titleWork.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS + 2_000); timeout.unref();
    try {
      const title = await within(runtime.generateTitle({ contextRef: participant.contextRef, cwd: record.view.cwd, description, model: record.view.run?.model, signal: controller.signal }), TITLE_TIMEOUT_MS, 'agent_title_timeout', controller.signal);
      const current = this.currentRun(workspaceId, id, runId);
      if (!current || controller.signal.aborted) return;
      if (!this.titleEligible(current)) return;
      if (!this.acceptTitle(current, title)) throw new Error(title ? 'agent_title_invalid' : 'agent_title_empty');
      this.save(current);
    } catch (error) {
      controller.abort();
      this.recordTitleFailure(workspaceId, id, runId, 'early', error);
    }
    finally { clearTimeout(timeout); if (this.titleWork.get(id) === controller) this.titleWork.delete(id); }
  }
  private recordTitleFailure(workspaceId: string, id: string, runId: string, phase: 'early'|'completion'|'manual', error: unknown): void {
    const current = this.currentRun(workspaceId, id, runId);
    if (!current || this.closing) return;
    const raw = error instanceof Error ? ('code' in error ? String(error.code) : error.message) : '';
    const code = /^agent_(?:title|native|revision)_[a-z_]+$/.test(raw) ? raw : 'agent_title_failed';
    const explanations: Record<string,string> = {
      agent_title_timeout: '独立标题请求超时，已中断本次生成',
      agent_title_cancelled: '独立标题请求已取消',
      agent_title_transport_closed: '生成标题时原生连接断开',
      agent_native_process_closed: '生成标题时原生进程退出',
      agent_native_request_failed: '原生程序拒绝了标题请求',
      agent_title_unavailable: '当前执行方未提供独立标题生成能力',
      agent_title_isolation_unverified: '标题请求的隔离权限未能确认',
      agent_title_tools_forbidden: '标题请求尝试使用工具，已拒绝',
      agent_title_invalid: '返回的标题超出长度限制或不合格',
      agent_title_empty: '标题请求没有返回有效标题',
      agent_title_output_invalid: '标题返回内容不是有效的结构化标题',
      agent_revision_conflict: '生成期间对话已变化，未覆盖当前名称',
    };
    const reason = `[${code}] ${explanations[code] ?? '独立标题生成未完成'}；工作执行与回复不受影响。`;
    current.titleDiagnostics = [...(current.titleDiagnostics ?? []), {runId, phase, code, reason, at:this.options.now()}].slice(-8);
    if (current.titleOrigin === 'default') current.earlyTitleAttempted = true;
    if (current.titleOrigin === 'default' || current.view.titleState?.status === 'generating') {
      current.view.titleState = {status:code==='agent_title_unavailable'?'unavailable':'failed', reason};
    }
    this.save(current);
  }
  private acceptTitle(record: StoredConversation, raw: string | undefined, explicit = false): boolean {
    if (!raw || this.closing || !explicit && !this.titleEligible(record)) return false;
    const title = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    // Chinese titles stay glanceable; English needs slightly more characters for a short phrase.
    if (!title || [...title].length > (/\p{Script=Han}/u.test(title) ? 24 : 64)) return false;
    record.view.title = title; record.titleOrigin = 'generated'; record.view.titleState={status:'generated'}; return true;
  }
  private titleDescription(record: StoredConversation, requireAnswer = true): string | undefined {
    const visible = record.view.entries.filter(entry => ['user', 'assistant'].includes(entry.role) && entry.kind === 'message' && entry.status !== 'failed' && entry.text.trim());
    const users = visible.filter(entry => entry.role === 'user'); const answers = visible.filter(entry => entry.role === 'assistant');
    if (!users.length || requireAnswer && !answers.length) return;
    const selected = new Map([users[0], answers[0], users.at(-1), answers.at(-1)].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).map(entry => [entry.id, entry]));
    const messages = [...selected.values()].sort((a, b) => a.sequence - b.sequence).map(entry => {
      let bytes = 0; let text = ''; for (const character of entry.text) { const size = Buffer.byteLength(character); if (bytes + size > 1024) break; text += character; bytes += size; }
      return { role: entry.role, text };
    });
    return JSON.stringify({ messages });
  }
  private async generateAutomaticTitle(workspaceId: string, id: string, runId: string, runtime: AgentRuntime): Promise<void> {
    // Completion may race the independent early request. Wait for it to settle
    // before deciding whether the one completion fallback is still necessary.
    await this.earlyTitles.get(id);
    const record = this.currentRun(workspaceId, id, runId);
    if (!record || !this.titleEligible(record) || record.titleAttempted || record.view.run?.status !== 'completed') return;
    await this.summarizeTitle(workspaceId, id, record.view.revision, runtime, false).catch(() => {});
  }
  async generateTitle(workspaceId: string, id: string, input: { expectedRevision: string }): Promise<ConversationView> {
    let record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision); this.assertIdle(record);
    if (record.view.run?.status !== 'completed' || !this.titleDescription(record)) fail('agent_title_unavailable', '请在对话成功完成并有可见回复后生成标题。', 409);
    const participant = record.participants.find(value => value.id === record.view.run!.participantId)!;
    const connection = this.options.connections.get(participant.connectionId);
    if (!connection.enabled || (!participant.modelAccountId && connection.status !== 'ready')) fail('agent_account_unavailable', '请先恢复此对话的模型接入后生成标题。', 409);
    const runtime = (await this.sourceRuntime(record, participant)).runtime;
    record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (runtime.bindingIdentity !== participant.bindingIdentity) fail('agent_binding_changed', '标题对应的原生接入身份已变化。', 409);
    await this.summarizeTitle(workspaceId, id, input.expectedRevision, runtime, true);
    return this.read(workspaceId, id);
  }
  private async summarizeTitle(workspaceId: string, id: string, revision: string, runtime: AgentRuntime, explicit: boolean): Promise<void> {
    if (this.titleWork.has(id)) fail('agent_title_busy', '正在生成本段对话的标题，请稍后查看。', 409);
    let record = this.load(workspaceId, id); expected(record.view.revision, revision);
    const participant = record.participants.find(value => value.id === record.view.run?.participantId);
    const description = this.titleDescription(record);
    if (!participant?.contextRef || !description || record.view.run?.status !== 'completed' || !explicit && (!this.titleEligible(record) || record.titleAttempted)) return;
    const runId = record.view.run.id; const controller = new AbortController(); this.titleWork.set(id, controller);
    record.titleAttempted = true; record.view.titleState={status:'generating'}; this.save(record); revision = record.view.revision;
    const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS + 2_000); timeout.unref();
    try {
      let title: string | undefined;
      if (runtime.readTitle) title = await within(runtime.readTitle({ contextRef: participant.contextRef, cwd: record.view.cwd }), 2_000, 'agent_title_timeout').catch(() => undefined);
      record = this.load(workspaceId, id); expected(record.view.revision, revision);
      if (this.acceptTitle(record, title, explicit)) { this.save(record); return; }
      if (!runtime.generateTitle) fail('agent_title_unavailable', '此执行方尚未提供可用的精短标题，原有标题已保留。', 409);
      title = await within(runtime.generateTitle({ contextRef: participant.contextRef, cwd: record.view.cwd, description, model: record.view.run?.model, signal: controller.signal }), TITLE_TIMEOUT_MS, 'agent_title_timeout', controller.signal);
      const current = this.load(workspaceId, id);
      if (controller.signal.aborted || current.view.run?.id !== runId || current.view.revision !== revision) fail('agent_revision_conflict', '对话已变化，保留当前标题。', 409);
      if (!this.acceptTitle(current, title, explicit)) fail('agent_title_failed', '未生成符合长度要求的精短标题，原有标题已保留。', 502);
      this.save(current);
    } catch (error) {
      controller.abort();
      this.recordTitleFailure(workspaceId, id, runId, explicit ? 'manual' : 'completion', error);
      if (explicit) { if (error && typeof error === 'object' && 'code' in error) throw error; fail('agent_title_failed', '标题生成未完成，原有标题与工作结果已保留。', 502); }
    } finally { clearTimeout(timeout); if (this.titleWork.get(id) === controller) this.titleWork.delete(id); }
  }

  /** Startup scans executions, never task status. No browser subscription is required. */
  recoverInterrupted(): Promise<void> {
    if(this.recoveryWork)return this.recoveryWork;
    for(const record of this.options.repository.listInterruptedTitles(this.options.generation)){
      if(record.view.run && this.options.generationAlive?.(record.view.run.generation))continue;
      if(record.titleOrigin!=='default')continue;
      record.view.titleState={status:'failed',reason:'标题生成因服务重启中断，原有回复已保留，可显式重新生成。'};
      try{this.save(record);}catch{/* A concurrent newer record wins; do not block unrelated executions. */}
    }
    const candidates=this.options.repository.listInterrupted().filter(record=>(record.view.run?.generation!==this.options.generation && !this.options.generationAlive?.(record.view.run?.generation ?? '')) || record.interruption?.reason==='transport');
    const work=async()=>{
      let next=0;
      await Promise.all(Array.from({length:Math.min(2,candidates.length)},async()=>{
        while(next<candidates.length&&!this.closing){const candidate=candidates[next++]!;await this.recoverOne(candidate.view.workspaceId,candidate.view.id);}
      }));
    };
    this.recoveryWork=work();return this.recoveryWork;
  }
  private recoverOne(workspaceId: string, id: string): Promise<void> {
    const key = `${workspaceId}/${id}`;
    const existing = this.recoveries.get(key); if (existing) return existing;
    const work = this.recoverRun(workspaceId, id).finally(() => { if (this.recoveries.get(key) === work) this.recoveries.delete(key); });
    this.recoveries.set(key, work); return work;
  }
  private async recoverRun(workspaceId:string,id:string):Promise<void>{
    let record=this.load(workspaceId,id),run=record.view.run;
    if(!run || this.closing || (run.generation===this.options.generation && record.interruption?.reason!=='transport'))return;
    if(!record.interruption){
      // Only an accepted active execution is attributable to an abrupt host loss.
      if (run.accepted && run.status === 'unknown') {
        // Legacy unknown states have no trustworthy system-interruption provenance.
        await this.observe(workspaceId, id); return;
      }
      if(!run.accepted||!['running','waiting-approval','waiting-question','tools-active'].includes(run.status))return;
      record.interruption={runId:run.id,awaitingUser:record.view.requests.length>0||run.status!=='running'};
      run.interrupted=true;run.diagnostic='服务重启导致执行中断，正在核对原执行。';this.save(record);
    }
    const originalId=run.id,marker=record.interruption;
    if(marker.runId!==originalId||marker.cancelled||marker.attempted||['completed','failed'].includes(run.status))return;
    const unavailable=(reason:string)=>{
      if(this.closing)return;
      const current=this.load(workspaceId,id);
      if(current.view.run?.id!==originalId||!current.interruption||current.interruption.cancelled)return;
      current.view.run.interrupted=true;current.view.run.diagnostic=reason;this.save(current);
    };
    try{
      for (const delay of [0, 250, 1000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (this.closing) return;
        const current = this.load(workspaceId, id);
        if (current.view.run?.id !== originalId || current.interruption?.cancelled) return;
        await within(this.observe(workspaceId,id),15_000,'agent_native_timeout');
        if (this.load(workspaceId,id).view.run?.status !== 'unknown') break;
      }
      record=this.load(workspaceId,id);run=record.view.run;
      if(this.closing||!run||run.id!==originalId||!record.interruption||record.interruption.cancelled||record.interruption.attempted)return;
      if(run.status==='completed'||run.status==='failed')return;
      if(run.generation===this.options.generation&&run.status==='running'){
        delete record.interruption;run.interrupted=undefined;run.diagnostic=undefined;this.save(record);return;
      }
    if(!this.options.autoContinueInterrupted){unavailable('系统中断后执行未完成。工作记录已保留，你可以发送“继续”接着处理。');return;}
      if(marker.awaitingUser){unavailable('执行未完成：中断前有待确认的问题或授权，请查看原问题后继续。');return;}
      if(run.generation!==this.options.generation||run.status!=='stopped'||run.tools.some(tool=>['running','unknown'].includes(tool.status))){unavailable('执行未完成：尚不能确认原执行和工具均已停止，已保留记录，避免重复操作。');return;}
      const participant=record.participants.find(value=>value.id===run!.participantId);
      if(!participant?.contextRef)throw new Error('agent_context_binding_mismatch');
      const text='系统自动恢复：上次执行因 Buildr '+(marker.reason==='transport'?'执行观察中断':'服务重启')+'而中断，现已确认原执行停止。请先核对本地对话、当前工作成果与工具结果，继续完成用户尚未完成的目标。不要重新执行全部历史命令；不确定已生效的操作先核对，不扩大原有授权。若无法继续，请明确说明原因。';
      const draft:SendDraft={expectedRevision:record.view.revision,connectionId:participant.connectionId,modelAccountId:participant.modelAccountId,modelAccountIdentity:participant.modelAccountIdentity,model:run.model,serviceTier:run.serviceTier,reasoningEffort:run.reasoningEffort,permissionMode:run.permissionMode,text,skipHandoffSummary:true};
      this.prepare(record,draft);
      record.interruption.attempted=true;this.save(record);
      draft.expectedRevision=record.view.revision;
      const preview=this.prepareSend(workspaceId,id,draft);
      this.send(workspaceId,id,{...draft,previewToken:preview.token,clientRequestId:'host-recovery:'+originalId},true);
    }catch(error){unavailable('执行未完成，未能自动接续：'+safeDiagnostic(error));}
  }

  async observe(workspaceId: string, id: string): Promise<ConversationView> {
    const key = `${workspaceId}/${id}`;
    const current = this.observations.get(key); if (current) return current;
    const work = this.reconcile(workspaceId, id).finally(() => this.observations.delete(key)).then(view => {
      const marker = this.load(workspaceId, id).interruption;
      if (!this.closing && !this.recoveries.has(key) && marker?.reason === 'transport' && !marker.cancelled && !marker.attempted && marker.runId === view.run?.id && view.run?.status === 'stopped') {
        // A later successful observation can release a previously uncertain recovery.
        queueMicrotask(() => { void this.recoverOne(workspaceId, id).catch(() => {}); });
      }
      return view;
    });
    this.observations.set(key, work); return work;
  }
  private async reconcile(workspaceId: string, id: string): Promise<ConversationView> {
    let record = this.load(workspaceId, id);
    if (record.view.run && this.retryWaits.has(record.view.run.id)) return this.view(record);
    if (record.view.run && BUSY_STATES.has(record.view.run.status) && record.view.run.generation !== this.options.generation && this.options.generationAlive?.(record.view.run.generation)) return this.read(workspaceId, id);
    for (const saved of record.participants) {
      if (!saved.contextRef) continue;
      try {
        const runtime = (await this.sourceRuntime(record, saved)).runtime;
        if (runtime.bindingIdentity !== saved.bindingIdentity) fail('agent_binding_changed', '参与者的程序或原配置身份已失配。', 409);
        await runtime.resumeContext({ contextRef: saved.contextRef, cwd: record.view.cwd });
        const items = await runtime.readHistory({ contextRef: saved.contextRef, cwd: record.view.cwd });
        const run = this.load(workspaceId, id).view.run;
        const attempt = run ? this.load(workspaceId, id).attempts.find(value => value.runId === run.id) : undefined;
        const needsObservation = run?.participantId === saved.id && (BUSY_STATES.has(run.status) || Boolean(run.interrupted));
        const observation = needsObservation ? await runtime.observe({ contextRef: saved.contextRef, executionRef: attempt?.executionRef }) : undefined;
        record = this.load(workspaceId, id);
        const participant = record.participants.find(value => value.id === saved.id)!;
        let changed = false;
        for (const item of items) changed = this.applyItem(record, participant, item) || changed;
        if (run?.participantId === participant.id && needsObservation) {
          if (record.view.run?.id === run.id) {
            // A new host generation observes old work; old request handles cannot be reused.
            if (record.view.run.generation !== this.options.generation) {
              record.view.requests = []; record.requests = {};
              record.view.run.status = 'unknown';
              if (observation?.executionRef && observation.executionRef.id === attempt?.executionRef?.id) record.view.run.generation = this.options.generation;
              else {
                record.view.run.diagnostic = '尚未确认原本执行的准确身份，请保留当前记录并重新观察。';
                this.save(record); continue;
              }
            }
            if (attempt?.executionRef && observation?.executionRef?.id !== attempt.executionRef.id) {
              record.view.run.status = 'unknown'; record.view.run.diagnostic = '原生观察未匹配本轮执行，不能据此结束或重新发送。';
              this.save(record); continue;
            }
            this.applyObservation(record, observation!); changed = true;
          }
        }
        if (changed) this.save(record);
      } catch (error) {
        record = this.load(workspaceId, id);
        if (record.view.run?.participantId === saved.id && BUSY_STATES.has(record.view.run.status)) { record.view.run.status = 'unknown'; record.view.run.diagnostic = safeDiagnostic(error); this.save(record); }
      }
    }
    return this.read(workspaceId, id);
  }
  private control(workspaceId: string, id: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string }): { record: StoredConversation; participant: StoredParticipant; executionRef?: ReturnType<ConversationApplication['load']>['attempts'][number]['executionRef'] } {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    const run = record.view.run;
    if (!run || run.id !== input.runId || run.participantId !== input.participantId || run.generation !== input.generation || input.generation !== this.options.generation) fail('agent_control_stale', '本轮执行或服务代次已变化，请重新观察。', 409);
    const participant = record.participants.find(value => value.id === input.participantId)!;
    return { record, participant, executionRef: record.attempts.find(value => value.runId === input.runId)?.executionRef };
  }
  async stop(workspaceId: string, id: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string; toolId?: string }): Promise<ConversationView> {
    const pending=this.load(workspaceId,id);
    if(!this.closing&&!input.toolId&&pending.interruption&&pending.view.run?.generation!==this.options.generation){
      expected(pending.view.revision,input.expectedRevision);
      const run=pending.view.run;
      if(!run||run.id!==input.runId||run.participantId!==input.participantId||run.generation!==input.generation)fail('agent_control_stale','执行已变化，请重新核对。',409);
      pending.interruption.cancelled=true;run.diagnostic='已取消自动接续；原执行状态仍待核对。';this.save(pending);return this.view(pending);
    }
    const control = this.control(workspaceId, id, input);
    if (!input.toolId) this.cancelledRetries.add(input.runId);
    const retry = this.retryWaits.get(input.runId);
    if (retry && !input.toolId) {
      control.record.view.run!.status = 'stopped'; control.record.view.run!.diagnostic = '已停止自动重试，工作记录已保留。';
      this.save(control.record); retry.abort(); this.retryWaits.delete(input.runId); return this.view(control.record);
    }
    if(!this.closing && !input.toolId && control.record.interruption){control.record.interruption.cancelled=true;this.save(control.record);}
    if (!BUSY_STATES.has(control.record.view.run!.status)) return this.view(control.record);
    if (input.toolId) {
      if (control.record.view.run!.tools.find(tool => tool.id === input.toolId)?.canStop !== true) fail('agent_tool_stop_unavailable', '此命令尚不支持单独停止，可停止本轮剩余执行。', 409);
    } else { control.record.view.run!.status = 'stopping'; this.save(control.record); }
    if (!control.executionRef || !control.participant.contextRef) return this.read(workspaceId, id);
    const runtime = (await this.sourceRuntime(control.record, control.participant)).runtime;
    let observation: ExecutorObservation;
    try { observation = await runtime.stop({ contextRef: control.participant.contextRef, executionRef: control.executionRef, toolId: input.toolId }); }
    catch (error) { if (input.toolId) fail('agent_tool_stop_failed', '未能确认此命令已停止，原执行状态已保留，请重新核对。', 409); throw error; }
    const record = this.currentRun(workspaceId, id, input.runId);
    if (record) { this.applyObservation(record, observation); this.save(record); }
    if (observation.status === 'running' || observation.status === 'unknown' || observation.status === 'tools-active') this.pollStop(workspaceId, id, input.runId);
    return this.read(workspaceId, id);
  }
  private pollStop(workspaceId: string, id: string, runId: string): void {
    const deadline = Date.now() + 10_000;
    const poll = async () => {
      const current = this.currentRun(workspaceId, id, runId);
      if (!current || !BUSY_STATES.has(current.view.run!.status) || Date.now() >= deadline || this.closing) return;
      await this.observe(workspaceId, id);
      const timer = setTimeout(() => { void poll().catch(() => {}); }, 250); timer.unref();
    };
    void poll().catch(() => {});
  }
  async reply(workspaceId: string, id: string, requestId: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string; answer: unknown }): Promise<ConversationView> {
    const control = this.control(workspaceId, id, input);
    const request = control.record.view.requests.find(value => value.id === requestId);
    const binding = control.record.requests[requestId];
    if (!request || !binding || !control.participant.contextRef || request.generation !== this.options.generation) fail('agent_request_stale', '此问题或授权已失效，请重新观察。', 409);
    if (this.repliesInFlight.has(requestId)) fail('agent_reply_in_flight', '此请求正在回应，请等待原结果。', 409);
    this.repliesInFlight.add(requestId);
    try {
    const runtime = (await this.sourceRuntime(control.record, control.participant)).runtime;
    // Recheck after asynchronous connection setup before causing a native effect.
    const fresh = this.load(workspaceId, id);
    if (!fresh.requests[requestId] || fresh.view.run?.id !== input.runId) fail('agent_request_stale', '此交互已变化。', 409);
    const answerText=JSON.stringify({请求标识:requestId,问题:request.title,说明:request.description,问题列表:request.questions,选项:request.options,回答:input.answer,授权性质:request.kind==='approval'?'仅原请求及其明确范围，不自动扩展到后续执行方或重放':'用户答复'});
    if(Buffer.byteLength(answerText)>MAX_TEXT_BYTES)fail('agent_reply_too_large','回答过长，请缩小后重试。',413);
    const baseReplyId='reply-'+requestId;const priorReply=fresh.view.entries.find(e=>e.id===baseReplyId);
    const replyId=priorReply&&priorReply.text!==answerText?baseReplyId+'-'+hash(answerText):baseReplyId;
    if(!fresh.view.entries.some(e=>e.id===replyId)){fresh.view.entries.push({id:replyId,sequence:(fresh.view.entries.at(-1)?.sequence??0)+1,kind:'notice',role:'user',text:answerText,runId:input.runId,participantId:input.participantId,status:'sending',createdAt:this.options.now()});this.save(fresh);}
    try{await runtime.reply({ contextRef: control.participant.contextRef, executionRef: binding.executionRef, requestId: binding.nativeId, answer: input.answer });}
    catch(error){const latest=this.load(workspaceId,id);const answer=latest.view.entries.find(e=>e.id===replyId);if(answer){answer.status='unknown';this.save(latest);}throw error;}
    const record = this.currentRun(workspaceId, id, input.runId);
    if (record) { const answer=record.view.entries.find(e=>e.id===replyId);if(answer)answer.status='accepted';delete record.requests[requestId]; record.view.requests = record.view.requests.filter(value => value.id !== requestId); if (!record.view.requests.length && ['waiting-approval', 'waiting-question'].includes(record.view.run!.status)) record.view.run!.status = 'running'; this.save(record); }
    return this.read(workspaceId, id);
    } finally { this.repliesInFlight.delete(requestId); }
  }

  addAttachment(workspaceId: string, id: string, input: AttachmentInput) {
    const record = this.load(workspaceId, id);
    return this.media.add(record, input, this.pendingSends.read(workspaceId, id)?.draft.attachmentIds ?? []);
  }
  readAttachment(workspaceId: string, id: string, attachmentId: string): { bytes: Buffer; mimeType: string } {
    return this.media.read(this.load(workspaceId, id), attachmentId);
  }
  subscribe(workspaceId: string, id: string) {
    const conversation = this.read(workspaceId, id);
    return this.options.events.subscribe({ type: 'snapshot', workspaceId, conversationId: id, revision: conversation.revision, payload: { conversation } }, event => event.workspaceId === workspaceId && event.conversationId === id);
  }
  async closeConnection(connectionId: string): Promise<void> {
    await Promise.allSettled(this.options.repository.listPending(true).filter(record => !this.options.generationAlive || record.view.run?.generation === this.options.generation).map(async record => {
      const run = record.view.run; const participant = record.participants.find(value => value.id === run?.participantId);
      if (run && participant?.connectionId === connectionId && BUSY_STATES.has(run.status)) {
        try { await this.stop(record.view.workspaceId, record.view.id, { expectedRevision: record.view.revision, runId: run.id, participantId: participant.id, generation: run.generation }); }
        catch { const latest = this.load(record.view.workspaceId, record.view.id); latest.view.run!.status = 'unknown'; latest.view.run!.diagnostic = '断开时未能确认原生执行退出。'; this.save(latest); }
      }
    }));
    for (const [id, sourceConnection] of this.sourceConnections) if (sourceConnection === connectionId) { this.sourceRuntimes.delete(id); this.sourceOwners.delete(id); this.sourceConnections.delete(id); }
  }
  async close(): Promise<void> {
    this.closing = true;
    for (const controller of this.retryWaits.values()) controller.abort();
    for (const record of this.options.repository.listPending(true)) if (record.view.run?.generation === this.options.generation && this.retryWaits.has(record.view.run.id)) {
      record.view.run.status = 'failed'; record.view.run.diagnostic = '宿主退出，自动重试已取消；工作记录已保留。'; this.save(record);
    }
    this.retryWaits.clear();
    for (const controller of this.titleWork.values()) controller.abort();
    const owned = this.options.repository.listPending(true).filter(record => !this.options.generationAlive || record.view.run?.generation === this.options.generation);
    const interrupted=owned.map(record=>({workspaceId:record.view.workspaceId,id:record.view.id,runId:record.view.run?.id}));
    for (const record of owned) {
      if (record.view.run) {
        if(record.view.run.status!=='stopping'){record.interruption={runId:record.view.run.id,awaitingUser:record.view.requests.length>0||['waiting-approval','waiting-question'].includes(record.view.run.status)};record.view.run.interrupted=true;}
        record.view.run.status = 'unknown'; record.view.run.diagnostic = '宿主正在退出，原生执行尚待确认。'; this.save(record); }
    }
    const ids = new Set(owned.map(record => record.participants.find(value => value.id === record.view.run?.participantId)?.connectionId).filter((id): id is string => Boolean(id)));
    await Promise.allSettled([...ids].map(id => this.closeConnection(id)));
    for(const item of interrupted){const record=this.load(item.workspaceId,item.id);if(record.view.run?.id===item.runId&&record.view.run&&['stopped','unknown','tools-active','stopping'].includes(record.view.run.status)){record.view.run.diagnostic=record.view.run.status==='stopped'?'宿主退出导致执行停止；这不是用户主动停止。':'宿主退出后原执行仍待核对，不能重复发送。';this.save(record);}}
  }
}
