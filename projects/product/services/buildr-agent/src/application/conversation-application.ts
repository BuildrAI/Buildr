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

const MAX_TEXT_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TEMP_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TEMP_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_ITEM_BYTES = 1024 * 1024;
const PAGE_SIZE = 100;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function within<T>(work: Promise<T>, milliseconds: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
const bounded = (value: number | undefined, fallback: number, max: number) => Math.max(1, Math.min(Number.isFinite(value) ? Math.trunc(value!) : fallback, max));
const providerNames:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder'};
/** Keep provider-specific model compatibility at the write boundary, not only in the picker. */
function modelSourceIncompatibility(sourceProvider:string,modelId:string,connectionProvider:string):string|undefined {
  if(sourceProvider!=='devin'||connectionProvider==='dsh'||connectionProvider==='codex'&&modelId==='swe-2')return;
  return `Devin 当前暂不兼容 ${providerNames[connectionProvider]??connectionProvider}，请切换到 DSH 或选择其他模型来源。`;
}

export class ConversationApplication {
  private readonly previewSecret = randomUUID();
  private readonly workers = new Map<string, Promise<void>>();
  private readonly observations = new Map<string, Promise<ConversationView>>();
  private readonly repliesInFlight = new Set<string>();
  private readonly titleWork = new Map<string, AbortController>();
  private readonly sourceConnections = new Map<string,string>();
  private readonly sourceRuntimes = new Map<string, Promise<{runtime: AgentRuntime; model: string}>>();
  private closing = false;
  private recoveryWork?: Promise<void>;
  private readonly recoveries = new Map<string, Promise<void>>();
  private readonly handoffPreviews = new Map<string,{baseToken:string;prepared:ReturnType<ConversationApplication['prepare']>}>();
  private readonly options: {
    repository: ConversationRepository;
    connections: ConnectionApplication;
    modelAccess?: ModelAccess;
    events: ConversationEvents;
    root: string;
    generation: string;
    now(): string;
    host: Pick<AgentServiceOptions, 'resolveWorkspace' | 'assertTask' | 'autoContinueInterrupted'>;
  };
  constructor(options: ConversationApplication['options']) { this.options = options; }

  private async sourceRuntime(record: StoredConversation, participant: StoredParticipant): Promise<{runtime: AgentRuntime; model: string}> {
    if (!participant.modelAccountId) return this.options.connections.runtime(participant.connectionId).then(runtime => ({runtime, model: record.view.run?.model ?? ''}));
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
  private load(workspaceId: string, id: string): StoredConversation {
    const record = this.options.repository.readConversation(nonempty(id, '对话身份'));
    if (!record || record.view.workspaceId !== workspaceId) fail('agent_conversation_missing', '该工作空间中没有此对话。', 404);
    record.attachments ??= {};
    return record;
  }
  private view(record: StoredConversation, before?: number, limit = PAGE_SIZE): ConversationView {
    const view = structuredClone(record.view);
    view.titleState??={status:'unknown'};
    view.participants = record.participants.map(participant => ({
      id: participant.id, provider: participant.provider, connectionId: participant.connectionId,
      label: participant.label, deliveredThrough: participant.deliveredThrough, contextId: participant.contextRef?.id ?? '',
    }));
    const entries = view.entries.filter(entry => before === undefined || entry.sequence < before);
    const countBounded = entries.slice(-bounded(limit, PAGE_SIZE, 200));
    let pageBytes = 0; let start = countBounded.length;
    while (start > 0) {
      const size = Buffer.byteLength(JSON.stringify(countBounded[start - 1]));
      if (start < countBounded.length && pageBytes + size > MAX_PAGE_BYTES) break;
      pageBytes += size; start--;
    }
    view.entries = countBounded.slice(start);
    if (entries.length > view.entries.length) view.nextEntryCursor = view.entries[0]!.sequence;
    if (view.run && view.run.generation !== this.options.generation && BUSY_STATES.has(view.run.status)) {
      view.run.status = 'unknown'; view.run.interrupted = true; view.run.diagnostic = '服务重启后原执行尚待核对，工作记录已保留。';
    }
    return view;
  }
  private save(record: StoredConversation): void {
    if(record.view.run?.status==='completed'){record.view.run.interrupted=undefined;delete record.interruption;}
    const observed=record.view.run;if(observed&&['completed','failed','stopped','unknown','tools-active'].includes(observed.status)){record.runOutcomes??={};record.runOutcomes[observed.id]={status:observed.status,diagnostic:observed.diagnostic,model:observed.model,provider:observed.provider,updatedAt:observed.updatedAt};}
    const prior = record.view.revision;
    record.view.revision = randomUUID(); record.view.updatedAt = this.options.now();
    this.options.repository.saveConversation(record, prior);
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
  pending(): { conversations: ConversationView[] } { return { conversations: this.options.repository.listPending().map(record => ({ ...this.view(record, undefined, 1), entries: [] })) }; }
  listAll(workspaceIds:string[],input:{workspaceId?:string;activeOnly?:boolean;hidden?:boolean;query?:string;agent?:string;model?:string;cursor?:string;limit?:number}={}) {
    if(input.workspaceId&&!workspaceIds.includes(input.workspaceId))fail('agent_workspace_missing','工作空间未登记。',404);
    const result=this.options.repository.querySummaries(workspaceIds,{...input,query:input.query?.trim().slice(0,200),limit:bounded(input.limit,30,100)});
    for(const view of result.conversations){
      if(view.run&&view.run.generation!==this.options.generation&&BUSY_STATES.has(view.run.status)){view.run.status='unknown';view.run.interrupted=true;}
    }
    return result;
  }
  markSeen(workspaceId:string,id:string,input:{through:number}) {
    this.load(workspaceId,id);
    return {activity:this.options.repository.markSeen(workspaceId,id,input.through)};
  }

  async create(workspaceId: string, input: { cwd?: string; taskId?: string; title?: string }): Promise<ConversationView> {
    const workspace = await this.options.host.resolveWorkspace(workspaceId);
    if (input.taskId) await this.options.host.assertTask(workspaceId, nonempty(input.taskId, '任务身份'));
    const selected = input.cwd ?? workspace.rootPath;
    if (!path.isAbsolute(selected)) fail('agent_cwd_invalid', '请选择准确的绝对工作目录。');
    let cwd: string;
    try { cwd = fs.realpathSync(selected); if (!fs.statSync(cwd).isDirectory()) throw new Error(); }
    catch { fail('agent_cwd_missing', '工作目录不存在或不可访问。'); }
    const record: StoredConversation = { view: {
      id: randomUUID(), workspaceId, cwd, taskId: input.taskId, title: input.title ? nonempty(input.title, '对话标题', 160) : '新对话', titleState:{status:input.title?'manual':'pending'},
      revision: randomUUID(), hidden: false, updatedAt: this.options.now(), participants: [], entries: [], requests: [],
    }, titleOrigin: input.title ? 'manual' : 'default', participants: [], sources: {}, attempts: [], requests: {}, attachments: {} };
    this.options.repository.saveConversation(record);
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: record.view.id, revision: record.view.revision, payload: { conversation: this.view(record) } });
    return this.view(record);
  }
  async update(workspaceId: string, id: string, input: { expectedRevision: string; title?: string; hidden?: boolean; taskId?: string | null }): Promise<ConversationView> {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (input.title !== undefined) { record.view.title = nonempty(input.title, '对话标题', 160); record.titleOrigin = 'manual'; record.view.titleState={status:'manual'}; }
    if (input.taskId !== undefined) {
      if (input.taskId === null) record.view.taskId = undefined;
      else { const taskId = nonempty(input.taskId, '任务身份'); await this.options.host.assertTask(workspaceId, taskId); record.view.taskId = taskId; }
    }
