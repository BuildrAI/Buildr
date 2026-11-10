import { executionLog,diagnosticCode } from '../storage/execution-log.ts';
import { releaseQuestionWait } from './question-wait-release.ts';
import { mergeParticipation, instructionParticipation, applyParticipationSources, participationSource, validParticipationSource, normalizeParticipation, participationGaps, PARTICIPATION_LIMITS } from '../domain/participation.ts';
import { singleParticipation, summarizeParticipation } from '../domain/participation-record.ts';
import type { ParticipationInput, ParticipationSummaryInput, ParticipationMatch } from '../participation-contracts.ts';
import { NativeObservationError } from '../domain/error-diagnostic.ts';
import { pendingConversationSummary } from '../domain/pending-summary.ts';
import {conversationTaskLinks,setConversationTaskLinks,sameTaskLink} from '../domain/conversation-task-links.ts';
import type {ConversationTaskLink} from '../contracts.ts';
import { presentedFilesForEntry, normalizePresentedFiles } from '../domain/presented-files.ts';
import { modelLeaseIdentity } from '../model-access/model-preferences.ts';
import { answerAttachmentIds, resolveQuestionAnswer, questionAnswerDisplay, normalizeQuestionCapabilities } from '../domain/question-answer.ts';
import { normalizeSendDraft } from '../domain/send-draft.ts';
import { reconcileLegacySupersededRuns } from '../domain/superseded-runs.ts';
import { blocksExecution } from '../domain/interaction-policy.ts';
import { ConversationAttachments, attachmentRevision, MAX_IMAGE_BYTES, MAX_VISUAL_INPUTS } from './conversation-attachments.ts';
import type { AttachmentInput } from '../contracts.ts';
import { continuationDraft, releasedContinuation, stoppedContinuation } from '../domain/conversation-continuation.ts';
import { waitingHandoffQuestions, waitingQuestionText } from '../domain/waiting-question-handoff.ts';
import { ConversationReadModel, type ConversationReadState } from '../persistence/conversation-read-model.ts';
import { ConversationEntryStore } from '../persistence/conversation-entry-store.ts';
import { LOCAL_CREDENTIAL_RETRIES, RETRY_DELAYS, localCredentialFailure, transientFailure } from '../domain/transient-failure.ts';
import { NativeRequestError } from '../domain/error-diagnostic.ts';
import {selectedOffering,modelConfiguration} from '../model-access/model-preferences.ts';
import type {ModelOffering} from '../model-access/contracts.ts';
import type { ModelAccess } from '../model-access/application.ts';
import { modelQuotaFailure } from '../model-access/quota.ts';
import { isQoderProvider, qoderProduct } from '../executors/qoder/product.ts';
import { qoderLoginExpiredMessage } from '../model-access/providers/qoder-auth.ts';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ExecutorInputRejected } from '../contracts.ts';
import type { AgentRuntime, AgentServiceOptions, ConversationEntry, ConversationView, ExecutorEvent, ExecutorImage, ExecutorItem, ExecutorObservation, RunView, SendDraft, SendPreview } from '../contracts.ts';
import { AgentServiceError, BUSY_STATES, conversationRuns, unfinishedRun, expected, fail, nonempty, safeDiagnostic } from '../domain/agent-state.ts';
import type { StoredConversation, StoredParticipant } from '../domain/agent-state.ts';
import type { ConversationRepository } from '../persistence/conversation-repository.ts';
import type { ConnectionApplication } from './connection-application.ts';
import type { ConversationEvents } from './conversation-events.ts';
import {HANDOFF_PROMPT,handoffEntries,organizeHandoff,displayRounds,receivingBudget,formatHandoffRounds} from '../domain/handoff-material.ts';
import {handoffSources,handoffEntry,handoffReceipt,readHandoffSource,handoffSourceEntry,type HandoffHistoryQuery} from './handoff-sources.ts';
import type { HostContext } from './host-context.ts';
import { PendingSendRepository } from '../persistence/pending-send-repository.ts';
import { ConversationSupplements } from './conversation-supplements.ts';
import type { SupplementInput } from '../contracts.ts';
import { ConversationDrafts } from './conversation-drafts.ts';
import { ConversationForks } from './conversation-forks.ts';
import type { ConversationForkInput } from '../contracts.ts';
import { ConversationChildren, type CreateChildInput } from './conversation-children.ts';

type PreparedSource = { runtime: AgentRuntime; model: string; leaseIdentity?: string };
const TITLE_TIMEOUT_MS = 45_000;
const NEUTRAL_TITLE = '新对话';
const TITLE_FAILURE_REMINDER = '生成标题错误，请手动修改';
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
      {kind:'observation',count:this.observations.size + this.releaseChecks.size + this.supersededCleanups.size + this.questionReleases.size},
      {kind:'source-resource',count:this.sourceRuntimes.size},
      {kind:'fork',count:this.forks.active},
    ].filter(value=>value.count>0);
  }
  private readonly diagnostics:ReturnType<typeof executionLog>;
  private readonly diagnosticStates=new Map<string,string>();
  private readonly idleTimer: ReturnType<typeof setInterval>;
  private milliseconds() { return Date.parse(this.options.now()); }
  private readonly previewSecret = randomUUID();
  private readonly liveTools = new Map<string, {conversationId: string; workspaceId: string; text: string; input?: string; bytes: number; ended: boolean; checks: number}>();
  private liveToolTimer?: ReturnType<typeof setInterval>;
  private rememberNativeTool(record: StoredConversation, participant: StoredParticipant, item: ExecutorItem): void {
    const id = record.sources[`${participant.id}:tool:${item.id}`];
    if (!id) return;
    const prior = this.liveTools.get(id);
    const input = item.input ?? prior?.input;
    const bytes = Buffer.byteLength(item.text) + Buffer.byteLength(input ?? '');
    this.liveTools.delete(id);
    if (bytes <= 8 * 1024 * 1024) this.liveTools.set(id, {conversationId: record.view.id, workspaceId: record.view.workspaceId,
      text: item.text, input, bytes, ended: ['completed','failed','unknown'].includes(item.status ?? ''), checks: 0});
    while(this.liveTools.size > 128 || [...this.liveTools.values()].reduce((sum,value) => sum + value.bytes,0) > 8 * 1024 * 1024)
      this.liveTools.delete(this.liveTools.keys().next().value!);
    if(!this.liveToolTimer) {
      this.liveToolTimer = setInterval(() => this.refreshNativeTools(),1000);
      this.liveToolTimer.unref();
    }
  }
  private refreshNativeTools(): void {
    let checked = 0;
    for(const [id,live] of [...this.liveTools]) {
      if(!live.ended || checked++ >= 4) continue;
      this.liveTools.delete(id);this.liveTools.set(id,live);
      let available = false;
      try {
        const record = this.options.repository.readConversation(live.conversationId);
        const entry = record?.view.entries.find(value => value.id === id);
        if(entry?.detail) available = Boolean(this.options.repository.readEntry(live.conversationId,id,entry.detail.revision));
      } catch { /* The native writer may still be publishing its completion record. */ }
      if(!available && ++live.checks < 60) continue;
      this.liveTools.delete(id);
      try { this.retryRecordUpdate(() => this.save(this.load(live.workspaceId,live.conversationId))); } catch { /* A later read observes the same native identity. */ }
    }
    if(!this.liveTools.size) {clearInterval(this.liveToolTimer);this.liveToolTimer = undefined;}
  }
  private readonly workers = new Map<string, Promise<void>>();
  // Only consecutive native text events share a record. Every reuse checks the
  // durable revision; controls and other writers keep the normal load path.
  private readonly streamingRecords = new Map<string, StoredConversation>();
  private readonly observations = new Map<string, Promise<ConversationView>>();
  private readonly questionReleases = new Map<string,Promise<void>>();
  private readonly supersededCleanups = new Map<string,Promise<void>>();
  private readonly repliesInFlight = new Set<string>();
  private readonly titleWork = new Map<string, AbortController>();
  private readonly earlyTitles = new Map<string, Promise<void>>();
  private readonly sourceConnections = new Map<string,string>();
  private readonly sourceRuntimes = new Map<string, Promise<{runtime: AgentRuntime; model: string; leaseIdentity?:string}>>();
  private readonly sourceReleasePending = new Map<AgentRuntime,()=>Promise<boolean>>();
  private readonly sourceReleases = new Map<AgentRuntime,Promise<void>>();
  private readonly sourceOwners = new Map<string, {workspaceId: string; id: string}>();
  private releasingIdleSources?: Promise<void>;
  private readonly idleReleaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly releaseChecks = new Map<string,Promise<boolean>>();
  private readonly releasedRuns = new Set<string>();
  private readonly nativeSourceOwners = new Set<string>();
  private closing = false;
  private recoveryWork?: Promise<void>;
  private readonly recoveries = new Map<string, { runId?: string; work: Promise<void> }>();
  private readonly retryWaits = new Map<string, AbortController>();
  private readonly cancelledRetries = new Set<string>();
  private readonly supplements: ConversationSupplements;
  private readonly media: ConversationAttachments;
  private readonly forks: ConversationForks;
  private readonly children: ConversationChildren;
  private readonly participationWork = new Set<string>();
  private readonly options: {
    backendChange?: AgentServiceOptions['backendChange'];
    conversationControl?: (scope:string,id:string)=>string;
    controlSupersededRun?: AgentServiceOptions['controlSupersededRun'];
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
    generationReleased?: (generation: string) => boolean;
  };
  constructor(options: ConversationApplication['options']) {
    this.options = options;
    this.diagnostics=executionLog(options.root,options.generation);
    this.idleTimer=setInterval(()=>{void this.collectIdle().catch(()=>{});},60_000);this.idleTimer.unref();
    this.media = new ConversationAttachments({ root: options.root, now: options.now, save: record => this.save(record) });
    this.forks = new ConversationForks({
      repository: options.repository, media: this.media, now: options.now,
      load: (scope, id) => this.load(scope, id), candidate: (scope, input) => this.candidate(scope, input),
      runtime: async (record, participant) => (await this.sourceRuntime(record, participant)).runtime,
      save: (record, initial) => this.save(record, initial), view: record => this.view(record),
    });
    this.children = new ConversationChildren({repository:options.repository,media:this.media,now:options.now,
      load:(scope,id)=>this.load(scope,id),candidate:(scope,input)=>this.candidate(scope,input),
      save:record=>this.save(record,true),view:record=>this.view(record)});
    this.drafts = new ConversationDrafts({
      root: options.root, repository: options.repository, source: scope => options.host.ref(scope).sourceId,
      candidate: (scope, input) => this.candidate(scope, input),
      prepare: (record, input) => this.prepare(record, input).preview,
      submit: (record, input) => this.submit(record, input, false, true),
      read: (scope, id) => this.read(scope, id,{compactTools:true}),
    });
    this.supplements = new ConversationSupplements({ generation: options.generation, now: options.now, closing: () => this.closing,
      load: (workspaceId, id) => this.load(workspaceId, id), save: record => this.save(record), view: record => this.view(record),
      observe: (record, runId, observation) => {
        const run = conversationRuns(record.view).find(value => value.id === runId);
        if (run) { this.applyObservation(record, observation, run); this.save(record); }
      },
      continue: (record, input, requestId) => {
        const run = record.view.run;
        if (!run || run.id !== input.runId || run.stopRequested || !['completed','stopped'].includes(run.status) || record.view.requests.some(request => request.runId === run.id)) fail('agent_supplement_stale', '原执行已变化，输入已保留。', 409);
        const participant = record.participants.find(value => value.id === run.participantId)!;
        const draft: SendDraft = { expectedRevision: record.view.revision, connectionId: participant.connectionId,
          model: run.model, modelAccountId: run.modelAccountId, modelAccountIdentity: run.modelAccountIdentity, serviceTier: run.serviceTier,
          reasoningEffort: run.reasoningEffort, permissionMode: run.permissionMode ?? 'default', text: input.text, attachmentIds: input.attachmentIds };
        return this.submit(record, { ...draft, clientRequestId: requestId }).conversation;
      },
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

  private async sourceRuntime(record: StoredConversation, participant: StoredParticipant): Promise<PreparedSource> {
    const sourceRun=conversationRuns(record.view).find(run=>run.participantId===participant.id);
    if (!participant.modelAccountId) {
      this.nativeSourceOwners.add(`${record.view.workspaceId}/${record.view.id}`);
      return this.options.connections.runtime(participant.connectionId).then(runtime => ({runtime, model: sourceRun?.model ?? ''}));
    }
    this.sourceOwners.set(participant.id, {workspaceId:record.view.workspaceId,id:record.view.id});
    const found = this.sourceRuntimes.get(participant.id);
    if (found) {
      const source = await found;
      const releasing = this.sourceReleases.get(source.runtime);
      if (releasing) { await releasing; return this.sourceRuntime(record, participant); }
      const pendingRelease=this.sourceReleasePending.get(source.runtime);
      if(pendingRelease){if(!await pendingRelease())fail('agent_runtime_release_unconfirmed','上一轮资源仍待释放，请稍后核对。',409);return this.sourceRuntime(record,participant);}
      if (!source.runtime.closed) return source;
      if (this.sourceRuntimes.get(participant.id) === found) this.sourceRuntimes.delete(participant.id);
      const replacement = this.sourceRuntimes.get(participant.id); if (replacement) return replacement;
    }
    const work = this.openSource(record,participant,sourceRun?.id).catch(error => { if(this.sourceRuntimes.get(participant.id)===work){this.sourceRuntimes.delete(participant.id);this.sourceOwners.delete(participant.id);this.sourceConnections.delete(participant.id);} throw error; });
    this.sourceConnections.set(participant.id, participant.connectionId); this.sourceRuntimes.set(participant.id, work); return work;
  }
  private async openSource(record:StoredConversation,participant:StoredParticipant,runId?:string):Promise<PreparedSource> {
    const access=this.options.modelAccess;if(!access)fail('agent_model_source_unavailable','模型套餐组件不可用。',409);
    const lease=await access.leases.create({ accountId: participant.modelAccountId!, expectedIdentity: participant.modelAccountIdentity, modelId: participant.modelId!,serviceTier:participant.serviceTier, conversationId: record.view.id, agentId: participant.connectionId, runId: runId ?? 'prepare' });
    try {const runtime=await this.options.connections.runtime(participant.connectionId, { identity: lease.identity, baseUrl: lease.baseUrl, apiKey: lease.apiKey,
      ...(nativeLeaseProvider(lease.provider) && participant.connectionId === nativeLeaseProvider(lease.provider) ? { nativeModel: { provider: nativeLeaseProvider(lease.provider)!, id: participant.modelId!, accountIdentity: participant.modelAccountIdentity! } } : {}),
      models: [{id: lease.model, label: lease.offering.label, isDefault: true, reasoningEfforts: lease.offering.reasoningEfforts, defaultReasoningEffort: lease.offering.defaultReasoningEffort, contextWindow: lease.offering.contextWindow, maxOutputTokens: lease.offering.maxOutputTokens, vision: lease.offering.images, tools: lease.offering.tools}] });return {runtime,model:lease.model,leaseIdentity:lease.identity};}
    catch(error){access.leases.release(lease.identity);throw error;}
  }
  /** A process keeps the gateway key it started with, so a rejected key is only replaced
   *  by releasing this participant's source. Returns false when release is unconfirmed. */
  private async retireSource(participantId:string):Promise<boolean> {
    const pending = this.sourceRuntimes.get(participantId);
    if (!pending) return true;
    const source = await pending.catch(() => undefined);
    if (!source) {
      if (this.sourceRuntimes.get(participantId) === pending) {
        this.sourceRuntimes.delete(participantId); this.sourceOwners.delete(participantId); this.sourceConnections.delete(participantId);
      }
      return true;
    }
    const releasing = this.sourceReleases.get(source.runtime); if (releasing) await releasing.catch(() => {});
    const pendingRelease = this.sourceReleasePending.get(source.runtime);
    if (pendingRelease && !await pendingRelease().catch(() => false)) return false;
    try { await this.options.connections.releaseGatewayRuntime(source.runtime); }
    catch { return false; }
    if (source.leaseIdentity) this.options.modelAccess?.leases.release(source.leaseIdentity);
    if (this.sourceRuntimes.get(participantId) === pending) {
      this.sourceRuntimes.delete(participantId); this.sourceOwners.delete(participantId); this.sourceConnections.delete(participantId);
    }
    return true;
  }
  async collectIdle():Promise<void> {
    if(this.closing)return;
    await this.releaseIdleSources();
  }
  /** Reclaim only owned sources after the caller has dropped its work marker.
   * Native/tool proof may settle later; retry the retained owner with backoff. */
  private scheduleSourceRelease(workspaceId: string, id: string, delay = 100): void {
    const key = `${workspaceId}/${id}`;
    if (this.closing || this.idleReleaseTimers.has(key) || ![...this.sourceOwners].some(([participant, owner]) => this.sourceRuntimes.has(participant) && owner.workspaceId === workspaceId && owner.id === id)) return;
    const timer = setTimeout(() => {
      this.idleReleaseTimers.delete(key);
      if (this.closing) return;
      void this.releaseIdleSources({workspaceId, id}).catch(() => {}).finally(() => {
        this.scheduleSourceRelease(workspaceId, id, Math.min(delay * 2, 5_000));
      });
    }, delay);
    timer.unref(); this.idleReleaseTimers.set(key, timer);
  }
  private sourceExecution(record: StoredConversation, participantId: string) {
    const run = conversationRuns(record.view).find(value => value.participantId === participantId);
    const attempt = [...record.attempts].reverse().find(value => value.participantId === participantId && (!run || value.runId === run.id));
    return { run, attempt, id: run?.id ?? attempt?.runId ?? '' };
  }
  /** Retiring generations release only idle, conversation-specific runtimes.
   * Native contexts keep their writer until their owning process actually exits. */
  releaseIdleSources(owner?: {workspaceId:string; id:string}): Promise<void> {
    if (this.releasingIdleSources) return this.releasingIdleSources.then(() => this.releaseIdleSources(owner));
    const work = (async () => {
      for(const finish of [...this.sourceReleasePending.values()])await finish().catch(()=>false);
      const groups = new Map<AgentRuntime, Array<{id:string; leaseIdentity?:string; source:Promise<{runtime:AgentRuntime;model:string;leaseIdentity?:string}>}>>();
      for (const [id, source] of this.sourceRuntimes) {
        // An unrelated initialization owns no ready runtime to reclaim.
        const value = await Promise.race([source.catch(() => undefined), new Promise<undefined>(resolve => setImmediate(() => resolve(undefined)))]); if (!value) continue;
        const members=groups.get(value.runtime)??[];members.push({id,source,leaseIdentity:value.leaseIdentity});groups.set(value.runtime,members);
      }
      for (const [runtime,members] of groups) {
        if(this.sourceReleasePending.has(runtime))continue;
        if(owner&&!members.some(({id})=>{const held=this.sourceOwners.get(id);return held?.workspaceId===owner.workspaceId&&held.id===owner.id;}))continue;
        const candidates:Array<{id:string;source:Promise<{runtime:AgentRuntime;model:string;leaseIdentity?:string}>;workspaceId:string;conversationId:string;runId:string;leaseIdentity?:string;proof?:()=>Promise<boolean|{executionState:'ended'|'unknown'}>;prepare?:()=>Promise<boolean|{executionState:'ended'|'unknown'}>}>=[];
        let safe=true;
        for(const member of members){
          const held=this.sourceOwners.get(member.id);
          if(!held||this.sourceRuntimes.get(member.id)!==member.source||member.leaseIdentity&&this.options.modelAccess?.leases.hasActiveRequests(member.leaseIdentity)){safe=false;break;}
          const key=`${held.workspaceId}/${held.id}`;
          const state=this.options.repository.readState(held.id);
          if(!state||state.view.workspaceId!==held.workspaceId||conversationRuns(state.view).some(run=>this.workers.has(run.id))||this.recoveries.has(key)||this.observations.has(key)||this.earlyTitles.has(held.id)||this.titleWork.has(held.id)){safe=false;break;}
          const record=this.load(held.workspaceId,held.id),{run,attempt,id:runId}=this.sourceExecution(record,member.id);
          // A finished fork has durable history but has never admitted a work
          // prompt. Its private reader/import process is idle, not an unknown run.
          if(!run&&record.view.forkState?.status==='ready'&&!record.attempts.length&&!record.view.requests.length&&!this.forks.active&&!this.titleWork.has(held.id)&&!this.earlyTitles.has(held.id)){
            candidates.push({...member,workspaceId:held.workspaceId,conversationId:held.id,runId:''});
            continue;
          }
          if(!runId||record.view.requests.some(request=>request.participantId===member.id)||this.workers.has(runId)||this.recoveries.has(runId)||this.observations.has(`${held.workspaceId}/${held.id}`)||this.earlyTitles.has(held.id)||this.titleWork.has(held.id)||this.supplements.size||this.repliesInFlight.size){safe=false;break;}
          const participant=record.participants.find(value=>value.id===member.id);
          // Older histories may no longer retain this participant's RunView.
          // Only its exact accepted native attempt can prove physical release.
          const settled=Boolean(run && (run.resourcesReleased||!this.busy(held.workspaceId,held.id)));
          if(!run&&!attempt?.accepted){safe=false;break;}
          const cancelledUnaccepted=run?.generation===this.options.generation && run.accepted===false && !attempt?.executionRef && (run.stopRequested||record.interruption?.runId===run.id && record.interruption.cancelled) && !run.tools.length && participant?.contextRef && runtime.releaseUnaccepted;
          if(cancelledUnaccepted){
            const proof=()=>runtime.releaseUnaccepted!({contextRef:participant!.contextRef!,clientRequestId:attempt!.clientRequestId}).catch(()=>false);
            if(!attempt){safe=false;break;}
            candidates.push({...member,workspaceId:held.workspaceId,conversationId:held.id,runId,prepare:proof,proof});continue;
          }
          // An unaccepted submission can only be released by its exact native
          // proof. General logical quiescence must not turn a missing receipt
          // into permission to close that source.
          if(!attempt?.accepted){safe=false;break;}
          const exactProof=participant?.contextRef&&attempt?.executionRef&&runtime.canRelease;
          const releaseInput=exactProof?{contextRef:participant!.contextRef!,executionRef:attempt!.executionRef!}:undefined;
          // A native SDK can retain an idle daemon until its runtime is closed.
          // Logical quiescence permits that close, never substitutes for the
          // physical group proof below. Legacy executors keep their old check.
          if(exactProof?!await (runtime.prepareRelease?runtime.prepareRelease(releaseInput!):runtime.canRelease!(releaseInput!)).catch(()=>false):!settled){safe=false;break;}
          candidates.push({...member,workspaceId:held.workspaceId,conversationId:held.id,runId,...(exactProof?{proof:()=>runtime.canRelease!({contextRef:participant!.contextRef!,executionRef:attempt!.executionRef!}).catch(()=>false)}:{})});
        }
        if(!safe || this.forks.active)continue;
        // Recheck after asynchronous native proof, then freeze reuse before close.
        if(this.forks.active || candidates.some(value=>value.leaseIdentity&&this.options.modelAccess?.leases.hasActiveRequests(value.leaseIdentity)||this.sourceRuntimes.get(value.id)!==value.source||this.sourceExecution(this.load(value.workspaceId,value.conversationId),value.id).id!==value.runId||this.workers.has(value.runId)||this.observations.has(`${value.workspaceId}/${value.conversationId}`)||this.recoveries.has(`${value.workspaceId}/${value.conversationId}`)||this.earlyTitles.has(value.conversationId)||this.titleWork.has(value.conversationId)||this.load(value.workspaceId,value.conversationId).view.requests.some(request=>request.participantId===value.id))||this.supplements.size||this.repliesInFlight.size)continue;
        const finish=async()=>{
          if(candidates.some(value=>value.leaseIdentity&&this.options.modelAccess?.leases.hasActiveRequests(value.leaseIdentity)))return false;
          for(const value of candidates)if(value.prepare&&!await value.prepare())return false;
          await this.options.connections.releaseGatewayRuntime(runtime);
          const facts=new Map<string,'ended'|'unknown'>();
          for(const value of candidates){const proof=value.proof?await value.proof():true;if(!proof)return false;facts.set(value.id,proof===true?'ended':proof.executionState);}
          if(candidates.some(value=>value.leaseIdentity&&this.options.modelAccess?.leases.hasActiveRequests(value.leaseIdentity)))return false;
          for(const value of candidates){
            if(value.leaseIdentity)this.options.modelAccess?.leases.release(value.leaseIdentity);
            if(this.sourceRuntimes.get(value.id)===value.source){this.sourceRuntimes.delete(value.id);this.sourceOwners.delete(value.id);this.sourceConnections.delete(value.id);}
            const record=this.load(value.workspaceId,value.conversationId),run=conversationRuns(record.view).find(run=>run.id===value.runId);
            if(!run||run.id!==value.runId||run.participantId!==value.id||run.generation!==this.options.generation)continue;
            const newlyReleased=!run.resourcesReleased;
            const executionEnded=run.executionState==='ended'&&!unfinishedRun(run);
            run.executionState=run.executionState==='ended'?'ended':facts.get(value.id)!;run.resourcesReleased=true;
            if(run.accepted===false && !record.attempts.find(attempt=>attempt.runId===run.id)?.executionRef && (run.stopRequested||record.interruption?.runId===run.id && record.interruption.cancelled) && !run.tools.length){
              run.status='stopped';run.canContinue=false;
              run.diagnostic='已停止本轮接续并释放后台连接；原输入是否送达仍未知，已有操作结果保留，不会重发。';
            }else if(BUSY_STATES.has(run.status)){
              run.status='unknown';run.interrupted=true;
              run.diagnostic=run.executionState==='ended'?'原执行已结束、后台资源已释放；操作结果仍待核对，不会自动重发。':'原生控制资源已释放；独立命令及操作结果仍待核对，不会自动重发。';
              run.tools=run.tools.map(tool=>tool.status==='running'?{...tool,status:'unknown',canStop:false}:tool);
            }
            // Resource bookkeeping is not additional execution time.
            if(!executionEnded)run.updatedAt=this.options.now();this.save(record);
            if(newlyReleased && record.view.run?.id===run.id && record.interruption?.runId===run.id && !record.interruption.cancelled && !record.interruption.attempted && this.options.autoContinueInterrupted && !this.closing) {
              queueMicrotask(()=>{void this.recoverOne(value.workspaceId,value.conversationId).catch(()=>{});});
            }
          }
          this.sourceReleasePending.delete(runtime);return true;
        };
        let finalizing:Promise<boolean>|undefined;
        const serialized=()=>finalizing??=(finish().finally(()=>{finalizing=undefined;}));
        this.sourceReleasePending.set(runtime,serialized);
        const closing=serialized().then(()=>{});
        this.sourceReleases.set(runtime,closing);
        try{await closing.catch(()=>{});}finally{if(this.sourceReleases.get(runtime)===closing)this.sourceReleases.delete(runtime);}
      }
    })();
    this.releasingIdleSources=work;
    void work.finally(()=>{if(this.releasingIdleSources===work)this.releasingIdleSources=undefined;}).catch(()=>{});
    return work;
  }
  retainsConversationSource(workspaceId:string,id:string): boolean {
    return this.nativeSourceOwners.has(`${workspaceId}/${id}`) || [...this.sourceOwners.entries()].some(([participant,owner])=>this.sourceRuntimes.has(participant)&&owner.workspaceId===workspaceId && owner.id===id);
  }
  /** A retained process acknowledges release only after the exact native round and
   * all conversation-specific work have ended. Shared writers are never closed here. */
  async observeForRelease(workspaceId:string, id:string, expectedRunId:string, generation:string): Promise<boolean> {
    const before=conversationRuns(this.load(workspaceId,id).view).find(run=>run.id===expectedRunId);
    if (!before || before.id!==expectedRunId || before.generation!==generation || generation!==this.options.generation) fail('agent_control_stale','原执行已变化，请重新核对。',409);
    if (this.releasedRuns.has(expectedRunId)) return true;
    const pending=this.releaseChecks.get(expectedRunId); if(pending)return pending;
    const work=(async()=>{
      await this.observe(workspaceId,id);
      const run=conversationRuns(this.load(workspaceId,id).view).find(run=>run.id===expectedRunId);
      if (!run || run.id!==expectedRunId || run.generation!==generation || unfinishedRun(run) || this.workers.has(run.id) || this.load(workspaceId,id).view.requests.some(request=>request.runId===run.id)) return false;
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
    setConversationTaskLinks(record.view,conversationTaskLinks(record.view));
    normalizeQuestionCapabilities(record);
    return record;
  }
  private readonly legacyPresentedFiles = new Map<string, ReturnType<typeof presentedFilesForEntry>>();
  private view(record: ConversationReadState, before?: number, limit?: number, readLegacyFiles = false, compactTools = true): ConversationView {
    setConversationTaskLinks(record.view,conversationTaskLinks(record.view));
    normalizeQuestionCapabilities(record);
    const entries = record.view.entries.filter(entry => before === undefined || entry.sequence < before).map(entry => compactTools ? ConversationEntryStore.preview(entry) : entry);
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
    const view = structuredClone({ ...record.view, entries: entries.slice(start), nextEntryCursor: start > 0 ? entries[start]!.sequence : record.view.nextEntryCursor });
    view.entries = view.entries.map(entry => {
      if(entry.input===undefined)delete entry.input;
      const live = this.liveTools.get(entry.id);
      if(!live || live.conversationId !== record.view.id) return entry;
      const result = {...entry,text:live.text,input:live.input};
      result.detail = entry.detail ? {...entry.detail,live:true} : undefined;
      return result;
    });
    view.entries=view.entries.map(entry=>{
      // Legacy compact projections may omit a large present invocation. Read only
      // this exact tool revision; never replay the native tool or rewrite history.
      let source=entry;
      if(entry.kind==='tool'&&entry.provider==='dsh'&&entry.name==='present'&&entry.status==='completed'&&entry.detail&&!entry.input&&!entry.presentedFiles){
        const key=JSON.stringify([view.id,entry.id,entry.detail.revision]);
        let files=this.legacyPresentedFiles.get(key);
        if(files===undefined&&readLegacyFiles){
          try{files=presentedFilesForEntry(this.options.repository.readEntry(view.id,entry.id,entry.detail.revision)??entry);}catch{files=[];}
          this.legacyPresentedFiles.set(key,files);
          if(this.legacyPresentedFiles.size>128)this.legacyPresentedFiles.delete(this.legacyPresentedFiles.keys().next().value!);
        }
        if(files)source={...entry,presentedFiles:files};
      }
      const presentedFiles=presentedFilesForEntry(source);
      const result={...entry};delete result.presentedFiles;
      return presentedFiles.length?{...result,presentedFiles}:result;
    });
    view.requests = view.requests.filter(request => conversationRuns(view).some(run => !run.supersededBy && !(request.kind === 'question' && run.questionsEndedBy) && request.runId === run.id && request.participantId === run.participantId && request.generation === run.generation));
    view.attachmentRevision = attachmentRevision(record.attachments ?? {});
    view.titleState??={status:'unknown'};
    view.participants = record.participants.map(participant => ({
      id: participant.id, provider: participant.provider, connectionId: participant.connectionId,
      label: participant.label, model: participant.modelId, modelAccountId:participant.modelAccountId, deliveredThrough: participant.deliveredThrough, contextId: participant.contextRef?.id ?? '',
    }));
    for (const run of conversationRuns(view)) if (run.generation !== this.options.generation && !this.options.generationAlive?.(run.generation) && BUSY_STATES.has(run.status)) {
      run.status = 'unknown'; run.interrupted = true; run.diagnostic = '服务重启后原执行尚待核对，工作记录已保留。';
    }
    view.pendingSend = this.pendingSends.view(this.pendingSends.read(view.workspaceId, view.id));
    return view;
  }
  private save(record: StoredConversation, initial = false, textOnly = false, textEntryId?:string): void {
    for (const run of conversationRuns(record.view)) if (run.stopRequested || run.supersededBy || run.resourcesReleased || !['running','waiting-approval','waiting-question'].includes(run.status)) delete run.contextCompaction;
    if(record.view.run?.status==='completed'){record.view.run.interrupted=undefined;delete record.interruption;}
    for(const observed of conversationRuns(record.view))if(['completed','failed','stopped','unknown','tools-active'].includes(observed.status)){record.runOutcomes??={};record.runOutcomes[observed.id]={status:observed.status,diagnostic:observed.diagnostic,model:observed.model,provider:observed.provider,contextUsage:observed.contextUsage,generation:observed.generation,updatedAt:observed.updatedAt};}
    const prior = record.view.revision;
    record.view.revision = randomUUID(); record.view.updatedAt = this.options.now();
    this.options.repository.saveConversation(record, initial ? undefined : prior, {participationUnchanged:textOnly,textEntryId});
    for(const run of conversationRuns(record.view)){
      const attempt=record.attempts.find(a=>a.runId===run.id),participant=record.participants.find(p=>p.id===run.participantId);
      const facts={event:'run-state',conversationId:record.view.id,workspaceId:record.view.workspaceId,runId:run.id,participantId:run.participantId,provider:run.provider,ownerGeneration:run.generation,status:run.status,accepted:run.accepted,stopRequested:run.stopRequested===true,resourcesReleased:run.resourcesReleased===true,executionId:attempt?.executionRef?.id,contextId:participant?.contextRef?.id,childPid:attempt?.executionRef?.data?.resourceGroup,runningTools:run.tools.filter(t=>t.status==='running').length,unknownTools:run.tools.filter(t=>t.status==='unknown').length};
      const signature=JSON.stringify(facts);
      if(this.diagnosticStates.get(run.id)!==signature){this.diagnostics(facts);this.diagnosticStates.delete(run.id);this.diagnosticStates.set(run.id,signature);if(this.diagnosticStates.size>512)this.diagnosticStates.delete(this.diagnosticStates.keys().next().value!);}
    }
    this.options.events.publish({ type: 'conversation', workspaceId: record.view.workspaceId, conversationId: record.view.id, revision: record.view.revision, payload: { conversation: this.view(record) } });
  }
  read(workspaceId: string, id: string, options: { before?: number; limit?: number; compactTools?: boolean } = {}): ConversationView {
    const limit=options.limit===undefined?undefined:bounded(options.limit,PAGE_SIZE,200);
    const record=this.options.repository.readPage(id,options.before,limit,options.compactTools)??this.load(workspaceId,id);
    if(record.view.workspaceId!==workspaceId)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    const result=this.view(record,options.before,limit,true,options.compactTools===true);
    if(options.compactTools)result.entries=result.entries.map(entry=>entry.detail||this.liveTools.has(entry.id)?entry:ConversationReadModel.compact(entry));
    return result;
  }
  readHistory(workspaceId:string,id:string,query:HandoffHistoryQuery) {
    const state=this.options.repository.readState(id)??this.load(workspaceId,id);
    if(state.view.workspaceId!==workspaceId)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    return readHandoffSource(this.options.root,id,query,ref=>this.options.repository.readEntry(id,ref.id,ref.revision));
  }
  readEntry(workspaceId:string,id:string,entryId:string,revision:string,sourceId?:string) {
    nonempty(entryId,'工具记录身份');
    if(typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))fail('agent_entry_revision_invalid','工具记录内容版本无效。',400);
    const current=this.options.repository.readState(id)??this.load(workspaceId,id);
    if(current.view.workspaceId!==workspaceId)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    const source=sourceId!==undefined?handoffSourceEntry(this.options.root,id,sourceId,entryId,revision):undefined;
    if(source?.native)return this.options.repository.readNativeReference(source.native,revision);
    const entry=this.options.repository.readEntry(id,entryId,revision);
    if(!entry)fail('agent_entry_missing','该对话中没有此工具记录。',404);
    return entry;
  }
  observationVersion(workspaceId:string,id:string):string {
    const current=this.options.repository.readRevision(id);
    if(!current)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    return [current.revision,current.seenThrough,this.pendingSends.read(workspaceId,id)?.revision].join(':');
  }
  list(workspaceId: string, input: { taskId?: string; workspaceIds?:string[]; cursor?: string; limit?: number; hidden?: boolean; query?: string } = {}): { conversations: ConversationView[]; nextCursor?: string } {
    const limit = bounded(input.limit, 30, 100);
    const records = this.options.repository.listConversations(workspaceId, { taskId: input.taskId, workspaceIds:input.workspaceIds, before: input.cursor, limit: limit + 1, includeHidden: input.hidden, query: input.query?.trim().slice(0, 200) });
    const chosen = records.slice(0, limit);
    return { conversations: chosen.map(record => ({ ...this.view(record, undefined, 1), entries: [] })), nextCursor: records.length > limit ? `${chosen.at(-1)!.view.updatedAt}/${chosen.at(-1)!.view.id}` : undefined };
  }
  participation(workspaceId:string,id:string,input:{runId:string}) {
    if(!input || Object.keys(input).some(key=>key!=='runId') || typeof input.runId!=='string')fail('agent_participation_query_invalid','需要准确runId。');
    return singleParticipation(this.load(workspaceId,id),input.runId);
  }
  async participationSummary(workspaceId:string,input:ParticipationSummaryInput={}) {
    await this.options.host.resolve(workspaceId);
    const {projections,incomplete}=this.options.repository.participationProjections(workspaceId);
    return summarizeParticipation(workspaceId,projections,input,this.options.now(),incomplete);
  }
  lookupRequest(workspaceId:string,id:string,clientRequestId:string) {
    const record=this.load(workspaceId,id),attempt=record.attempts.find(value=>value.clientRequestId===clientRequestId);
    return attempt ? {found:true,runId:attempt.runId,accepted:attempt.accepted,conversation:this.view(record)} : {found:false};
  }
  pendingSummary() { return { conversations: this.options.repository.listPendingStates().map(record => pendingConversationSummary(this.view(record, undefined, 1))) }; }
  pending(): { conversations: ConversationView[] } { return { conversations: this.options.repository.listPendingStates().map(record => ({ ...this.view(record, undefined, 1), entries: [] })) }; }
  listAll(workspaceIds:string[],input:{draftConversationIds?:string[];workspaceId?:string;activeOnly?:boolean;hidden?:boolean;query?:string;agent?:string;model?:string;activityState?:string;cursor?:string;limit?:number}={}) {
    if(input.workspaceId&&!workspaceIds.includes(input.workspaceId))fail('agent_workspace_missing','工作空间未登记。',404);
    const result=this.options.repository.querySummaries(workspaceIds,{...input,draftConversationIds:[...new Set(input.draftConversationIds??[])].sort(),generation:this.options.generation,query:input.query?.trim().slice(0,200),limit:bounded(input.limit,30,100)},this.options.generationAlive);
    for(const view of result.conversations){
      if(view.run&&view.run.generation!==this.options.generation&&!this.options.generationAlive?.(view.run.generation)&&BUSY_STATES.has(view.run.status)){view.run.status='unknown';view.run.interrupted=true;}
    }
    return result;
  }
  markSeen(workspaceId:string,id:string,input:{through:number}) {
    if(this.options.repository.readState(id)?.view.workspaceId!==workspaceId)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    return {activity:this.options.repository.markSeen(workspaceId,id,input.through)};
  }

  createChild(workspaceId: string,id: string,input: CreateChildInput): Promise<ConversationView> {
    return this.children.create(workspaceId,id,input);
  }
  listChildren(workspaceId: string,id: string,input: {cursor?:string;limit?:number} = {}) {
    if(this.options.repository.readState(id)?.view.workspaceId!==workspaceId)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    const limit=bounded(input.limit,30,100);
    const records=this.options.repository.listConversations(workspaceId,{parentConversationId:id,before:input.cursor,limit:limit+1});
    const chosen=records.slice(0,limit);
    return {conversations:chosen.map(record=>({...this.view(record,undefined,1),entries:[]})),nextCursor:records.length>limit?`${chosen.at(-1)!.view.updatedAt}/${chosen.at(-1)!.view.id}`:undefined};
  }
  async create(workspaceId: string, input: { cwd?: string; taskId?: string; taskLinks?:ConversationTaskLink[]; title?: string }): Promise<ConversationView> {
    const record = await this.candidate(workspaceId, input);
    this.options.repository.saveConversation(record);
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: record.view.id, revision: record.view.revision, payload: { conversation: this.view(record) } });
    return this.view(record);
  }
  fork(workspaceId: string, id: string, input: ConversationForkInput): Promise<ConversationView> {
    return this.forks.fork(workspaceId, id, input).finally(() => {
      for (const owner of this.sourceOwners.values()) this.scheduleSourceRelease(owner.workspaceId, owner.id);
    });
  }
  private async candidate(workspaceId: string, input: { cwd?: string; taskId?: string; taskLinks?:ConversationTaskLink[]; title?: string }): Promise<StoredConversation> {
    const workspace = await this.options.host.resolve(workspaceId);
    if(input.taskLinks!==undefined&&input.taskId!==undefined)fail('agent_input_invalid','不能同时提交 taskId 和 taskLinks。');
    const links=await this.verifyTaskLinks(workspaceId,input.taskLinks??(input.taskId?[{workspaceId,taskId:input.taskId}]:[]));
    const selected = input.cwd ?? workspace.rootPath;
    if (!path.isAbsolute(selected)) fail('agent_cwd_invalid', '请选择准确的绝对工作目录。');
    let cwd: string;
    try { cwd = fs.realpathSync(selected); if (!fs.statSync(cwd).isDirectory()) throw new Error(); }
    catch { fail('agent_cwd_missing', '工作目录不存在或不可访问。'); }
    const record: StoredConversation = { view: {
      id: randomUUID(), workspaceId, cwd, taskId: input.taskId, title: input.title ? nonempty(input.title, '对话标题', 160) : NEUTRAL_TITLE, titleState:{status:input.title?'manual':'pending'},
      revision: randomUUID(), hidden: false, updatedAt: this.options.now(), participants: [], entries: [], requests: [],
    }, hostScope: workspace, titleOrigin: input.title ? 'manual' : 'default', participants: [], sources: {}, attempts: [], requests: {}, attachments: {} };
    setConversationTaskLinks(record.view,links);
    return record;
  }
  private async verifyTaskLinks(workspaceId:string,values:unknown,previous:ConversationTaskLink[]=[]):Promise<ConversationTaskLink[]> {
    if(!Array.isArray(values)||values.length>100)fail('agent_input_invalid','任务关联必须为不超过100项的数组。');
    const links:ConversationTaskLink[]=[];
    for(const value of values){
      if(!value||typeof value!=='object'||Array.isArray(value))fail('agent_input_invalid','任务引用无效。');
      const link={workspaceId:nonempty(value.workspaceId,'任务工作空间'),taskId:nonempty(value.taskId,'任务身份')};
      if(links.some(item=>sameTaskLink(item,link)))continue;
      if(this.options.host.ref(workspaceId).sourceId!==this.options.host.ref(link.workspaceId).sourceId)fail('agent_input_invalid','不能跨宿主来源关联任务。');
      if(!previous.some(item=>sameTaskLink(item,link)))await this.options.host.verify(link.workspaceId,link.taskId);
      links.push(link);
    }
    return links;
  }
  async update(workspaceId: string, id: string, input: { expectedRevision: string; title?: string; hidden?: boolean; taskId?: string | null; taskIds?: string[]; taskLinks?:ConversationTaskLink[] }): Promise<ConversationView> {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (input.title !== undefined) { record.view.title = nonempty(input.title, '对话标题', 160); record.titleOrigin = 'manual'; record.view.titleState={status:'manual'}; }
    if([input.taskId,input.taskIds,input.taskLinks].filter(value=>value!==undefined).length>1)fail('agent_input_invalid','不能同时提交多种任务关联字段。');
    if(input.taskLinks!==undefined||input.taskIds!==undefined||input.taskId!==undefined){
      const previous=conversationTaskLinks(record.view);
      const local=input.taskIds??(input.taskId===null?[]:[input.taskId!]);
      if(input.taskLinks===undefined&&(!Array.isArray(local)||local.length>100))fail('agent_input_invalid','任务关联必须为不超过100项的数组。');
      const values=input.taskLinks??[...previous.filter(link=>link.workspaceId!==workspaceId),...local.map(taskId=>({workspaceId,taskId}))];
      setConversationTaskLinks(record.view,await this.verifyTaskLinks(workspaceId,values,previous));
    }
    if (input.hidden !== undefined) { if (typeof input.hidden !== 'boolean') fail('agent_input_invalid', '隐藏状态无效。'); record.view.hidden = input.hidden; }
    this.save(record); return this.view(record);
  }
  private assertAccepting(record: StoredConversation): void {
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
  }
  /** Input admission is independent of retained native resource ownership. */
  inputBusy(_workspaceId: string, _id: string): boolean { return this.closing; }
  busy(workspaceId: string, id: string): boolean {
    const record = this.load(workspaceId, id);
    return Boolean(conversationRuns(record.view).some(run => unfinishedRun(run) || this.workers.has(run.id)) || record.view.requests.length || this.titleWork.has(id) || this.earlyTitles.has(id) || this.recoveries.has(`${workspaceId}/${id}`) || this.observations.has(`${workspaceId}/${id}`));
  }
  allowsReleasedContinuation(workspaceId: string, id: string, input: SendDraft): boolean {
    const record = this.load(workspaceId, id), run = record.view.run;
    return Boolean(!this.closing && run?.generation === this.options.generation && releasedContinuation(record, input) &&
      !this.workers.has(run.id) && !this.titleWork.has(id) && !this.earlyTitles.has(id) &&
      !this.recoveries.has(`${workspaceId}/${id}`) && !this.observations.has(`${workspaceId}/${id}`) &&
      !this.supplements.size && !this.repliesInFlight.size);
  }
  async verifyNext(workspaceId: string, id: string): Promise<void> {
    const record = this.load(workspaceId, id);
    await this.options.host.resolve(workspaceId);
    if (record.view.taskId) await this.options.host.verify(workspaceId, record.view.taskId);
  }
  validatePending(workspaceId: string, id: string, input: SendDraft): SendDraft {
    if (input.continueRunId && !input.waitingHandoff) fail('agent_continue_unavailable', '恢复动作不能排队到其他执行之后，请核对当前状态再继续。', 409);
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
      return this.read(workspaceId, id,{compactTools:true});
    }
    if (this.load(workspaceId,id).view.requests.length) fail('agent_pending_response', '原轮仍在等待回答或授权，请在原卡片处理；输入已保留，不会另开会话。', 409);
    const observed = this.load(workspaceId,id).view.run;
    if (previousRunId !== undefined && observed?.id !== previousRunId) fail('agent_revision_conflict','上一轮执行已变化，请重新读取后提交；草稿保留。',409);
    const draft = this.validatePending(workspaceId, id, raw);
    const record = this.load(workspaceId, id);
    const waitingQuestions = draft.waitingHandoff ? waitingHandoffQuestions(record, draft, existing?.waitingQuestions) : undefined;
    if (waitingQuestions && waitingQuestions.some(question => this.repliesInFlight.has(question.id))) fail('agent_reply_in_flight', '原问题正在回应，请等待原结果；交接内容保留。', 409);
    if (draft.waitingHandoff && record.view.run?.status === 'waiting-question') this.prepare(record, draft);
    this.pendingSends.submit(workspaceId, id, draft, requestId, expectedPendingRevision, this.draft(raw), waitingQuestions, record.view.run?.status === 'waiting-question');
    const view = this.read(workspaceId, id,{compactTools:true});
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: id, revision: view.revision, payload: { conversation: view } });
    return view;
  }
  cancelPendingSend(workspaceId: string, id: string, input: { expectedPendingRevision: string }): ConversationView {
    this.load(workspaceId, id);
    this.pendingSends.cancel(workspaceId, id, input.expectedPendingRevision);
    const view = this.read(workspaceId, id,{compactTools:true});
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: id, revision: view.revision, payload: { conversation: view } });
    return view;
  }
  private draft(input: SendDraft): SendDraft {
    const draft = normalizeSendDraft(input);
    // Only an omitted selection may fall back; explicit full-access must never be downgraded.
    // Queued drafts may wait for a connection that is not installed yet.
    // Admission still validates it in prepare; normalization must not discard it.
    const connection = input.permissionMode === undefined ? this.options.connections.list().find(value => value.id === draft.connectionId) : undefined;
    const modes = connection?.capabilities.permissionModes ?? (connection ? ['default'] : []);
    if (input.permissionMode === undefined && !modes.includes('full-access') && modes.includes('default')) draft.permissionMode = 'default';
    return draft;
  }
  private prepare(record: StoredConversation, raw: SendDraft, answerMaterials: string[] = []): { preview: SendPreview; text: string; images: ExecutorImage[]; draft: SendDraft;configuration?:string;modelLeaseConfiguration?:string;needsCompression:boolean;fullText:string;participationSegments:ParticipationMatch[] } {
    this.options.connections.assertProgramAvailable(raw.connectionId);
    let input = this.draft(raw); expected(record.view.revision, input.expectedRevision);
    const waitingQuestions = input.waitingHandoff ? waitingHandoffQuestions(record, input) : undefined;
    if (!waitingQuestions) this.assertAccepting(record);
    if (record.view.run && !stoppedContinuation(record, input) && releasedContinuation(record, input) && !this.allowsReleasedContinuation(record.view.workspaceId, record.view.id, input)) fail('agent_continue_unavailable', '原目标仍有在途工作，请核对后再继续。', 409);
    if (stoppedContinuation(record, input) && this.pendingSends.read(record.view.workspaceId, record.view.id)) fail('agent_continue_unavailable', '已有待发送要求，请先处理后再继续。', 409);
    input = continuationDraft(record, input);
    const connection = this.options.connections.get(input.connectionId);
    if (connection.enabled && isQoderProvider(connection.provider) && connection.status === 'expired') fail('qoder_platform_login_expired', qoderProduct(connection.provider).label === 'Qoder' ? qoderLoginExpiredMessage : `${qoderProduct(connection.provider).label} 登录授权已失效，请重新登录。所选模型来源保持不变。`, 409);
    if (!connection.enabled || (!input.modelAccountId && connection.status !== 'ready')) fail('agent_account_unavailable', '请先准备智能体程序，并连接所选模型账号。', 409);
    if (input.modelAccountId && isQoderProvider(connection.provider) && connection.status === 'not-authenticated') fail('qoder_platform_login_required', `${qoderProduct(connection.provider).label} 程序需要先完成基础平台登录；所选套餐不变，不要求使用 Qoder 自有模型。`, 409);
    if (!(connection.capabilities.permissionModes ?? ['default']).includes(input.permissionMode!)) fail('agent_permission_unavailable', '此接入尚不支持所选权限模式，请明确改选后重试。', 409);
    const source = input.modelAccountId ? this.options.modelAccess?.accounts.snapshot(input.modelAccountId) : undefined;
    if (input.modelAccountId && (!source || !source.enabled || source.status !== 'ready')) fail('agent_model_source_unavailable', '所选套餐尚未连接，请检查账号。', 409);
    if (source && input.modelAccountIdentity && source.identity !== input.modelAccountIdentity) fail('agent_model_source_changed', '套餐登录来源已变化，请重新选择套餐模型。', 409);
    // Qoder resolves third-party models only through its interactive BYOK wizard,
    // which the SDK control channel used for execution does not expose. Selecting
    // another vendor here always failed after dispatch, so refuse it up front.
    if (source && isQoderProvider(connection.provider) && source.provider !== connection.provider && source.provider !== 'native-' + connection.provider) fail('agent_model_source_unsupported', `${qoderProduct(connection.provider).label} Agent 暂不支持选择其他供应商的模型，请改用 ${qoderProduct(connection.provider).label} 原生模型。`, 409);
    // The revision is an observation hint, not a selection identity. Current source,
    // identity, model availability and capability are revalidated below.
    const availableModels = source?.models ?? connection.models;
    const selectedModel = input.model ? availableModels.find(model => model.id === input.model) : source ? source.models.find(model=>model.enabled!==false) : connection.models.find(model => model.isDefault);
    if (waitingQuestions && source) { const quotaError = modelQuotaFailure(source, selectedModel as ModelOffering | undefined, Date.parse(this.options.now())); if (quotaError) throw quotaError; }
    if (input.model && !selectedModel) fail('agent_model_unavailable', '该模型不在当前接入的可用目录中。', 409);
    input.model = selectedModel?.id ?? input.model;
    if (waitingQuestions) waitingHandoffQuestions(record, input);
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
    if (record.view.forkState && record.view.forkState.status !== 'ready') fail('agent_fork_pending', '此分叉尚未完成，不能发送新指令；原对话不受影响。', 409);
    const latest = record.participants.findLast(value => !value.historical && value.connectionId === input.connectionId && value.modelAccountId === input.modelAccountId && value.modelId === input.model && (!input.modelAccountId || value.modelAccountIdentity === source?.identity && value.modelConfiguration===configuration));
    // Released historical outcomes are not native ownership. Keep the latest
    // uncertain context isolated, and never let a held context block new input:
    // the independent-participant path below preserves its exact old controls.
    // A pure question wait can continue in the same native conversation after
    // exact cancellation. Other live work keeps its independently owned context.
    const current = record.view.run;
    const replacingQuestion = Boolean(connection.capabilities.endQuestionWait && latest && current?.participantId === latest.id && current.generation === this.options.generation &&
      !record.attempts.find(attempt => attempt.runId === current.id)?.questionReleaseRequested &&
      current.accepted && (current.permissionMode ?? 'default') === input.permissionMode && current.model === input.model &&
      current.serviceTier === input.serviceTier && current.reasoningEffort === input.reasoningEffort &&
      !current.tools.some(tool => tool.status !== 'completed') &&
      record.view.requests.some(request => request.runId === current.id && request.kind === 'question') &&
      !record.view.requests.some(request => request.runId === current.id && request.kind !== 'question') &&
      !conversationRuns(record.view).some(run => run.id !== current.id && run.participantId === latest.id && unfinishedRun(run)));
    const held = latest && !replacingQuestion && (!releasedContinuation(record,input) || stoppedContinuation(record,input)) && conversationRuns(record.view).some(run => run.participantId === latest.id && (
      record.view.requests.some(request => request.runId === run.id) ||
      run.id === record.view.run?.id && unfinishedRun(run) ||
      !run.resourcesReleased && (unfinishedRun(run) || run.generation !== this.options.generation && this.options.generationAlive?.(run.generation) === true)
    ));
    const participant = held ? undefined : latest;
    const through = record.view.entries.at(-1)?.sequence ?? record.view.childOf?.throughSequence ?? 0;
    const changes = handoffEntries([...(record.inheritedContext?.entries??[]),...record.view.entries],participant?.deliveredThrough??0).map(handoffEntry);
    const previous = record.participants.find(value=>value.id===record.view.run?.participantId) ?? record.participants.at(-1);
    const previousRun = record.view.run;
    // Native context identity governs control and history, never whether the user changed execution choice.
    // Reasoning effort is a per-turn parameter of the same native session: every executor receives it with the
    // new input, so changing it alone reuses the session instead of organizing a user-visible handoff.
    const switching = Boolean(previous && (previous.connectionId!==input.connectionId || previous.modelAccountId!==input.modelAccountId ||
      previous.modelAccountIdentity!==source?.identity || previous.modelId!==input.model || previous.serviceTier!==input.serviceTier ||
      previousRun && (previousRun.permissionMode??'default')!==input.permissionMode));
    const history = changes.map(entry => ({sequence:entry.sequence,role:entry.role,provider:entry.provider,text:entry.kind==='tool'?`${entry.name??'工具'} · ${entry.status??'结果未知'}（具体内容见本地来源）`:entry.text.length>4096?entry.text.slice(0,4096)+'…（完整原文见本地来源）':entry.text}));
    const maxInputBytes=receivingBudget(connection.capabilities.maxInputBytes,boundModel&&'contextWindow' in boundModel?boundModel.contextWindow:undefined,boundModel&&'maxOutputTokens' in boundModel?boundModel.maxOutputTokens:undefined);
    const localRounds=changes.length ? organizeHandoff(changes,{...record.inheritedContext?.outcomes,...record.runOutcomes,...(record.view.run?{[record.view.run.id]:record.view.run}:{})}) : [];
    const historicalImages=[...new Set(changes.flatMap(e=>e.attachments??[]))].map(id=>{try{const image=this.media.describe(record,id);return {...image,available:true};}catch{return {id,available:false};}});
    const toolReferences=changes.some(entry=>entry.kind==='tool')?this.options.repository.readToolReferences(record.view.id):undefined;
    const sources=changes.length?handoffSources(this.options.root,record.view.id,changes,localRounds,historicalImages,entry=>toolReferences?.get(entry.id+':'+entry.detail!.revision)):undefined;
    const rounds=sources?.rounds??localRounds;
    const answerImages=(input.waitingHandoff?.answers??[]).flatMap(item=>answerAttachmentIds(item.answer));
    const currentImages=[...new Set([...(input.attachmentIds??[]),...answerImages,...answerMaterials])];
    if(currentImages.length>9)fail('agent_question_answer_invalid','每次回答最多添加9份附件。');
    const canAttachHistory=connection.capabilities.images&&(!source||Boolean(selectedModel&&'images' in selectedModel&&selectedModel.images));
    const priorImages=canAttachHistory&&currentImages.length<4?historicalImages.filter(image=>image.available&&'mimeType' in image&&image.mimeType?.startsWith('image/')&&!currentImages.includes(image.id)).slice(-Math.max(0,4-currentImages.length)).map(image=>image.id):[];
    const ids=[...new Set([...priorImages,...currentImages])];
    const materials = this.media.expand(record, ids);
    const images = materials.images;
    const context=JSON.stringify({childOf:record.view.childOf,inheritedPendingQuestions:record.inheritedContext?.pendingQuestions,conversationId:record.view.id,workspaceId:record.view.workspaceId,cwd:record.view.cwd,conversationTitle:record.view.title,taskId:record.view.taskId,taskIds:record.view.taskIds,taskLinks:conversationTaskLinks(record.view),sourceThrough:through,permissionMode:input.permissionMode,executionState:record.view.run?.status??'idle',retainedExecutions:conversationRuns(record.view).filter(unfinishedRun).map(run=>({id:run.id,participantId:run.participantId,generation:run.generation,status:run.status,executionState:run.executionState,resourcesReleased:run.resourcesReleased,toolCount:run.tools.filter(tool=>tool.status!=='completed').length})),unansweredRequests:record.view.requests.map(request=>({id:request.id,runId:request.runId,participantId:request.participantId,generation:request.generation,kind:request.kind,title:request.title.slice(0,200)})),sourceIndex:sources?.index,sourceId:sources?.sourceId,imageInputIds:ids,currentImageIds:currentImages,currentImages:images.filter(image=>currentImages.includes(image.id)),historicalImages:historicalImages.slice(-4),historicalImageCount:historicalImages.length,historicalImageNotice:historicalImages.length?'历史图片的全部准确引用见本地索引；此处只列最近四张。没有作为图像输入发送的部分须按需读取，不能假装已看到。历史视频只提供带时间点的抽样画面，不含音轨，不能声称连续观看。':undefined});
    const questionEntries = changes.filter(entry=>entry.kind==='notice'&&entry.runId===record.view.run?.id);
    const hasHandoffAnswers = questionEntries.some(entry=>entry.id.startsWith('waiting-handoff-'));
    const unanswered = questionEntries.filter(entry=>entry.role==='system'&&entry.id.startsWith(hasHandoffAnswers?'waiting-handoff-':'waiting-question-')).map(entry=>entry.text);
    const suffix=`\n\n本次用户要求：\n${input.text}${materials.description}${unanswered.length?'\n原轮保留的问题与未回答事项（答复以明确记录为准，交接不代表同意）：\n'+unanswered.join('\n'):''}${waitingQuestions?'\n原轮问题及本次明确提交的回答：\n'+waitingQuestions.map(question=>waitingQuestionText(question,input.waitingHandoff!, answer => resolveQuestionAnswer(question,answer,ids=>this.media.expand(record,ids)).answer).text).join('\n'):''}${input.handoffSummary?'\n用户补充的交接说明（不替代本地历史）：\n'+input.handoffSummary:''}`;
    const handoffPrompt=record.view.childOf?HANDOFF_PROMPT+'\n这是独立子对话。以上主对话记录只作为创建时的背景；不要继续或重复执行主对话任务、回答其问题或沿用一次性许可，只处理下方本次新要求。创建子对话只沿用起始工作位置，本身不新建或切换工作树（Worktree）；后续任务（Task）和实际工作位置仍按本次用户要求及适用规则安排，需要时使用已有能力新建任务（Task）与工作树（Worktree），不要求始终共享目录。主对话可能仍在执行，文件和外部系统必须重新核对。':HANDOFF_PROMPT;
    const controlInstruction = this.options.conversationControl?.(record.view.workspaceId,record.view.id) ?? '';
    const fullText=controlInstruction + (changes.length||switching||waitingQuestions?`${handoffPrompt}\n工作位置与来源：${context}\n按轮次组织的本地记录：\n${formatHandoffRounds(rounds)}${suffix}`:input.text+materials.description);
    const needsCompression=Buffer.byteLength(fullText)>maxInputBytes;
    const text=needsCompression&&sources?`${controlInstruction}${handoffPrompt}\n工作位置与来源：${context}\n完整历史共有 ${rounds.length} 轮，记录 #${changes[0]?.sequence??0}–#${through}，超过内联容量。请先读取本地索引 ${sources.index}，使用本对话 history ${JSON.stringify({sourceId:sources.sourceId})} 并指定roundId按轮读取用户要求、授权纠正、失败未知、成果和待办；工具详情用entry及准确修订读取。正文没有省略来源，具体内容需按引用读取。${suffix}`:fullText;
    const difference:Array<{kind:'agent'|'model';label:string;before:string;after:string}>=[];
    if(previous&&previous.connectionId!==input.connectionId)difference.push({kind:'agent',label:'智能体',before:previous.label,after:connection.label});
    if(previous&&(record.view.run?.model!==input.model||previous.modelAccountId!==input.modelAccountId))difference.push({kind:'model',label:'模型',before:record.view.run?.model??'默认模型',after:boundModel?.label??input.model??'默认模型'});
    const handoff={agent:connection.label,model:boundModel?.label??input.model??'默认模型',changes:difference,rounds:displayRounds(rounds),roundCount:rounds.length,body:text,sourceThrough:through,mode:needsCompression?'indexed' as const:'records' as const,...(sources?{sourcePath:sources.index,sourceId:sources.sourceId}:{})};
    const inputBytes = Buffer.byteLength(text);
    const imageBytes = images.reduce((total, image) => total + record.attachments[image.id]!.size, 0);
    const fits = inputBytes <= maxInputBytes && images.length <= MAX_VISUAL_INPUTS && imageBytes <= 32 * 1024 * 1024 && images.every(image => record.attachments[image.id]!.size <= (connection.capabilities.maxImageBytes ?? MAX_IMAGE_BYTES)) && (!images.length || (connection.capabilities.images && (!source || Boolean(selectedModel && 'images' in selectedModel && selectedModel.images))));
    const token = createHmac('sha256', this.previewSecret).update(JSON.stringify({ id: record.view.id, input, sourceRevision: source?.revision, through, text, ids })).digest('hex');
    return { preview: { handoff, token, conversationId: record.view.id, revision: record.view.revision, connectionId: input.connectionId, modelAccountId: input.modelAccountId, modelAccountIdentity: source?.identity, modelAccountRevision: source?.revision, modelSourceLabel: source?.accountLabel ?? source?.label, model: input.model, serviceTier:input.serviceTier,reasoningEffort: input.reasoningEffort, permissionMode: input.permissionMode!, participantId: participant?.id, cwd: record.view.cwd, taskId: record.view.taskId, text: input.text, history, sourceThrough: through, inputBytes, maxInputBytes, fits, switching, diagnostic: fits ? undefined : images.length && !canAttachHistory ? '所选执行方或模型无法接收这些图片，请选择支持图片的执行组合；草稿已保留。' : '必要交接资料仍超出接收容量，请选择容量更大的模型；草稿与本地资料保留。' }, text, images, draft: input,configuration,modelLeaseConfiguration:modelConfig,needsCompression,fullText,participationSegments:[...(controlInstruction?[instructionParticipation('conversation-control',controlInstruction)]:[]),...(changes.length||switching||waitingQuestions?[instructionParticipation('handoff-instructions',handoffPrompt)]:[])] };
  }
  prepareSend(workspaceId: string, id: string, input: SendDraft): SendPreview { return this.prepare(this.load(workspaceId, id), input).preview; }

  async prepareHandoff(workspaceId:string,id:string,input:SendDraft):Promise<SendPreview>{
    // Local records and their index are sufficient; optional model summaries must not delay submission.
    return this.prepare(this.load(workspaceId,id),input).preview;
  }

  send(workspaceId: string, id: string, raw: SendDraft & { previewToken?: string; clientRequestId: string }, systemRecovery = false): { run: RunView; conversation: ConversationView } {
    if (raw.waitingHandoff) fail('agent_handoff_queue_required', '等待回答时请保存交接内容，系统会保留原执行并投递新要求。', 409);
    return this.submit(this.load(workspaceId, id), raw, systemRecovery);
  }
  /** Called only by the current receiver after claiming the durable submission. */
  checkWaitingHandoff(workspaceId: string, id: string, requestId: string): void {
    const pending = this.pendingSends.lookup(workspaceId, id, requestId);
    if (!pending || ['cancelled','delivered'].includes(pending.state) || !pending.draft.waitingHandoff || !pending.waitingQuestions) fail('agent_handoff_stale', '交接已取消或变化。', 409);
    waitingHandoffQuestions(this.load(workspaceId, id), pending.draft, pending.waitingQuestions);
  }
  preserveWaitingQuestions(workspaceId:string,id:string,requestId:string):void {
    this.checkWaitingHandoff(workspaceId,id,requestId);
    const pending=this.pendingSends.lookup(workspaceId,id,requestId)!,record=this.load(workspaceId,id);
    let changed=false;
    for(const question of pending.waitingQuestions!){
      const entryId='waiting-question-'+question.runId+'-'+question.id;
      if(record.view.entries.some(entry=>entry.id===entryId))continue;
      record.view.entries.push({id:entryId,sequence:(record.view.entries.at(-1)?.sequence??0)+1,kind:'notice',role:'system',text:JSON.stringify({请求标识:question.id,问题:question.title,说明:question.description,问题列表:question.questions,选项:question.options,状态:'原问题；回答以用户明确提交的记录为准。',授权性质:'本记录只保留问题，不构成答复或授权。'}),runId:question.runId,participantId:question.participantId,createdAt:this.options.now()});
      changed=true;
    }
    if(changed)this.save(record);
  }
  dispatchWaitingHandoff(workspaceId: string, id: string, requestId: string): ReturnType<ConversationApplication['send']> {
    this.checkWaitingHandoff(workspaceId,id,requestId);
    const pending = this.pendingSends.lookup(workspaceId,id,requestId)!;
    if(pending.state!=='dispatching'||pending.owner!==this.options.generation)fail('agent_pending_conflict','交接领取已变化，请重新读取。',409);
    const record = this.load(workspaceId,id), run = record.view.run!;
    for (const question of pending.waitingQuestions!) {
      const entryId = 'waiting-handoff-'+requestId+'-'+question.id;
      if (record.view.entries.some(entry=>entry.id===entryId)) continue;
      const {text,answered} = waitingQuestionText(question,pending.draft.waitingHandoff!, answer => resolveQuestionAnswer(question,answer,ids=>this.media.expand(record,ids)).answer);
      record.view.entries.push({id:entryId,sequence:(record.view.entries.at(-1)?.sequence??0)+1,kind:'notice',role:answered?'user':'system',text,attachments:answerAttachmentIds(pending.draft.waitingHandoff!.answers?.find(item=>item.requestId===question.id)?.answer),runId:run.id,participantId:run.participantId,status:'accepted',createdAt:this.options.now()});
    }
    // Save explicit answers atomically with the next run. A cancelled or failed
    // handoff must not leave a business answer that a later model could adopt.
    const {waitingHandoff}=pending.draft;
    const draft={...pending.draft,expectedRevision:record.view.revision,skipHandoffSummary:true};
    const answerMaterials=(waitingHandoff!.answers??[]).flatMap(item=>answerAttachmentIds(item.answer));
    const preview=this.prepare(record,draft,answerMaterials).preview;
    return this.submit(record,{...draft,previewToken:preview.token,clientRequestId:requestId},false,false,answerMaterials);
  }
  private submit(record: StoredConversation, raw: SendDraft & { previewToken?: string; clientRequestId: string }, systemRecovery = false, initial = false, answerMaterials: string[] = []): { run: RunView; conversation: ConversationView } {
    const { workspaceId, id } = record.view;
    const clientRequestId = nonempty(raw.clientRequestId, '请求身份', 200);
    const inputDigest = hash({ ...this.draft(raw), expectedRevision: undefined });
    const repeated = record.attempts.find(attempt => attempt.clientRequestId === clientRequestId);
    if (repeated) {
      const legacyDigest = hash({ ...this.draft(raw), permissionMode: undefined, expectedRevision: undefined });
      if (repeated.inputDigest !== inputDigest && !(raw.permissionMode === 'default' && repeated.inputDigest === legacyDigest)) fail('agent_request_conflict', '相同请求身份对应不同输入，已拒绝重复执行。', 409);
      if (record.view.run?.id !== repeated.runId) fail('agent_request_already_accepted', '该请求已受理，请读取其原有历史。', 409);
      return { run: structuredClone(record.view.run), conversation: this.view(record) };
    }
    const baseline = this.prepare(record, raw, answerMaterials);
    const prepared=baseline;
    const a = Buffer.from(prepared.preview.token); const b = Buffer.from(String(raw.previewToken));
    if (raw.previewToken !== undefined && (a.length !== b.length || !timingSafeEqual(a, b))) fail('agent_preview_stale', '发送预览已变化，请重新核对后发送。', 409);
    if (!prepared.preview.fits) fail('agent_handoff_capacity', prepared.preview.diagnostic!, 413);
    // A caller-supplied preview confirms a replacement, but can never
    // silently release a pending question or approval.
    if (!initial && record.view.run) {
      const current = record.view.run;
      if (record.view.requests.some(request => request.runId === current.id))
        fail('agent_pending_response', '原轮仍在等待回答或授权，请在原卡片处理；输入已保留，不会另开会话。', 409);
      // Native supplement only exists where a live owner can still take it.
      // Unknown work whose owner is gone keeps its exact state and stays open
      // to adoption or an explicit new instruction instead of an impossible append.
      const supplementAvailable = current.resourcesReleased !== true
        && current.status !== 'tools-active' && !current.stopRequested
        && (current.generation === this.options.generation || Boolean(this.options.generationAlive?.(current.generation)));
      if (unfinishedRun(current) && supplementAvailable && !prepared.preview.switching && raw.previewToken === undefined)
        fail('agent_native_supplement_required', '原轮仍在执行，请通过原生追加发送；不会另开会话。', 409);
      if (!prepared.preview.participantId && prepared.preview.switching && raw.previewToken === undefined)
        fail('agent_session_confirmation_required', '需要新的原生会话，请先查看交接内容并明确确认；输入已保留。', 409);
    }

    let participant = record.participants.find(value=>value.id===prepared.preview.participantId);
    const connection = this.options.connections.get(prepared.draft.connectionId);
    if (!participant) {
      participant = { id: randomUUID(), connectionId: connection.id, provider: connection.provider, label: connection.label, modelAccountId: prepared.draft.modelAccountId, modelAccountIdentity: prepared.draft.modelAccountId ? this.options.modelAccess?.accounts.snapshot(prepared.draft.modelAccountId).identity : undefined, modelId: prepared.draft.model,serviceTier:prepared.draft.serviceTier,modelConfiguration:prepared.configuration,modelLeaseConfiguration:prepared.modelLeaseConfiguration, bindingIdentity: prepared.draft.modelAccountId ? '' : this.options.connections.binding(connection.id) ?? '', deliveredThrough: 0 };
      record.participants.push(participant);
    }
    participant.modelLeaseConfiguration ??= prepared.modelLeaseConfiguration;
    const run: RunView = { id: randomUUID(), participantId: participant.id, provider: participant.provider, generation: this.options.generation, status: 'starting', accepted: false, tools: [], modelAccountId: prepared.draft.modelAccountId, modelAccountIdentity: prepared.preview.modelAccountIdentity, modelSourceLabel: prepared.preview.modelSourceLabel, model: prepared.draft.model, serviceTier:prepared.draft.serviceTier,reasoningEffort: prepared.draft.reasoningEffort, permissionMode: prepared.draft.permissionMode, startedAt: this.options.now(), updatedAt: this.options.now() };
    const append = (entry: Omit<ConversationEntry, 'sequence' | 'createdAt'>) => { record.view.entries.push({ ...entry, sequence: (record.view.entries.at(-1)?.sequence ?? record.view.childOf?.throughSequence ?? 0) + 1, createdAt: this.options.now() }); };
    if (prepared.preview.switching) append({ id: randomUUID(), kind: 'handoff', role: 'system', text: `交给 ${connection.label} · ${prepared.draft.model??'默认模型'}`, participantId: participant.id, provider: participant.provider, runId:run.id, status:'sending', handoff:prepared.preview.handoff&&handoffReceipt(prepared.preview.handoff) });
    if (prepared.draft.handoffSummary !== undefined) append({ id: randomUUID(), kind: 'notice', role: 'user', text: `用户补充的交接说明：\n${prepared.draft.handoffSummary}`, participantId: participant.id,runId:run.id });
    const userEntryId = randomUUID();
    const manualRecovery = Boolean(raw.continueRunId);
    append({ id: userEntryId, kind: systemRecovery || manualRecovery ? 'notice' : 'message', role: systemRecovery || manualRecovery ? 'system' : 'user', text: manualRecovery ? record.view.run?.accepted ? '已请求继续上次执行。' : '已请求重试上次未送达的要求。' : prepared.draft.text, participantId:participant.id, provider:participant.provider, runId: run.id, status: 'sending', attachments: prepared.draft.attachmentIds });
    const questionWaits = !systemRecovery ? conversationRuns(record.view).flatMap(old => {
      const requests = record.view.requests.filter(request => request.runId === old.id && request.kind === 'question')
        .flatMap(request => record.requests[request.id] ? [{ id: request.id, nativeId: record.requests[request.id].nativeId }] : []);
      return requests.length ? [{ runId: old.id, requests, ...(old.participantId === participant!.id ? { reuse: true } : {}) }] : [];
    }) : [];
    const automaticRetry = systemRecovery ? record.attempts.find(value => value.runId === record.view.run?.id)?.automaticRetry : undefined;
    record.attempts.push({ clientRequestId, inputDigest, runId: run.id, participantId: participant.id, through: record.view.entries.at(-1)!.sequence, userEntryId, accepted: false, ...(!systemRecovery ? {questionWaits} : {}), ...(raw.continueRunId || systemRecovery && record.view.run ? {continuationOf: raw.continueRunId ?? record.view.run!.id} : {}), ...(automaticRetry ? {automaticRetry: {...automaticRetry}} : {}) });
    const previousRun=record.view.run;if(previousRun){record.runOutcomes??={};record.runOutcomes[previousRun.id]={status:previousRun.status,diagnostic:previousRun.diagnostic,model:previousRun.model,provider:previousRun.provider,contextUsage:previousRun.contextUsage,generation:previousRun.generation,updatedAt:previousRun.updatedAt};}
    if (!participant.modelAccountId) this.nativeSourceOwners.add(`${workspaceId}/${id}`);
    delete record.interruption;
    if (previousRun && (unfinishedRun(previousRun) || record.view.requests.some(request => request.runId === previousRun.id) || previousRun.participantId!==participant.id && !previousRun.resourcesReleased && (this.sourceRuntimes.has(previousRun.participantId) || this.options.generationAlive?.(previousRun.generation)===true))) {
      record.view.retainedRuns ??= [];
      record.view.retainedRuns.push(previousRun);
      if(this.workers.has(previousRun.id)||this.retryWaits.has(previousRun.id))this.cancelledRetries.add(previousRun.id);
      const retry=this.retryWaits.get(previousRun.id);
      if(retry){previousRun.status='failed';previousRun.diagnostic='新的要求已接续，已取消原轮自动重试。';retry.abort();}
    }
    record.view.run = run;
    record.view.hidden = false;
    this.save(record, initial);
    const work = this.execute(workspaceId, id, run.id, prepared).finally(() => { this.workers.delete(run.id); this.cancelledRetries.delete(run.id); this.scheduleSourceRelease(workspaceId, id); });
    this.workers.set(run.id, work);
    return { run: structuredClone(run), conversation: this.read(workspaceId, id,{compactTools:true}) };
  }

  supplement(workspaceId: string, id: string, input: SupplementInput) { return this.supplements.send(workspaceId, id, input); }

  private currentRun(workspaceId: string, id: string, runId: string): StoredConversation | undefined {
    const record = this.load(workspaceId, id);
    return record.view.run?.id === runId && record.view.run.generation === this.options.generation ? record : undefined;
  }
  private ownedRun(workspaceId: string, id: string, runId: string) {
    const record = this.load(workspaceId, id);
    const run = conversationRuns(record.view).find(run => run.id === runId && run.generation === this.options.generation);
    return run ? {record, run} : undefined;
  }
  private hasPersistedEnd(record:StoredConversation,run:RunView):boolean {
    const attempt=record.attempts.find(value=>value.runId===run.id);
    return Boolean(attempt?.persistedEnd&&attempt.persistedEnd===attempt.executionRef?.id&&run.executionState==='ended'&&!unfinishedRun(run));
  }
  private applyItem(record: StoredConversation, participant: StoredParticipant, item: ExecutorItem, runId?: string, live = false): boolean {
    const changed = this.mergeItem(record,participant,item,runId,live);
    if(changed && ['codex','dsh','qoder','qoder-cn'].includes(participant.provider) && item.kind === 'tool' && item.nativeTool) {
      const id = record.sources[`${participant.id}:tool:${item.id}`];
      const owned=(record.nativeTools ??= {});
      owned[id] = item.parentToolId ? {parentToolId:item.parentToolId} : owned[id] ?? true;
      if(live) this.rememberNativeTool(record,participant,item);
    }
    return changed;
  }
  private mergeItem(record: StoredConversation, participant: StoredParticipant, item: ExecutorItem, runId?: string, live = false): boolean {
    if (Buffer.byteLength(item.text) > MAX_ITEM_BYTES) fail('agent_native_item_too_large', '原生条目超出安全展示容量，原记录保留于准确原生会话。', 413);
    const source = `${participant.id}:${item.kind}:${item.id}`;
    if (record.sources[source] === '@inherited') return false;
    let entry = record.view.entries.find(value => value.id === record.sources[source]);
    if (!entry && item.role === 'user' && !item.parentToolId) {
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
      const nativeOwner=item.executionId?record.attempts.find(attempt=>attempt.participantId===participant.id&&attempt.accepted&&(attempt.executionRef?.id===item.executionId||attempt.clientRequestId===item.executionId)):undefined;
      const ownerChanged=Boolean(nativeOwner&&entry.role!=='user'&&entry.runId!==nativeOwner.runId);
      if(ownerChanged)entry.runId=nativeOwner!.runId;
      if (entry.parentToolId && item.parentToolId && entry.parentToolId !== item.parentToolId) fail('agent_native_item_identity_changed', '原生条目的父工具来源发生冲突，已保留原记录。', 409);
      const originChanged = ownerChanged || item.parentToolId !== undefined && entry.parentToolId !== item.parentToolId;
      if (originChanged) entry.parentToolId = item.parentToolId;
      if(originChanged&&record.participationTools?.[entry.id])record.participationTools[entry.id]!.entryRevision=createHash('sha256').update(JSON.stringify(entry)).digest('hex');
      if (entry.role === 'user' || entry.role === 'system' && entry.kind === 'notice') return originChanged;
      if (entry.kind === 'tool' && ['completed', 'failed'].includes(entry.status ?? '') && (!item.status || item.status === 'running' || entry.status==='completed'&&item.status==='unknown')) return originChanged;
      // v3 native tools persist identity and metadata only. Their body is read
      // on demand; comparing a hydrated body with the stored empty skeleton
      // would make identical history look new after every save/reload.
      const nativeBody = !live && item.nativeTool && Boolean(record.nativeTools?.[entry.id]);
      const priorParticipation=record.participationTools?.[entry.id]??entry.participation;
      const participation = entry.kind==='tool' ? mergeParticipation(item.input!==undefined&&item.input!==entry.input&&priorParticipation?{...priorParticipation,matches:[]}:priorParticipation,item.participation,item.name??entry.name,item.input??entry.input) : undefined;
      const participationChanged=JSON.stringify(participation)!==JSON.stringify(normalizeParticipation(priorParticipation));
      const nameChanged = item.name !== undefined && entry.name !== item.name;
      const inputChanged = !nativeBody && item.input !== undefined && entry.input !== item.input;
      const files=item.presentedFiles===undefined?undefined:normalizePresentedFiles(item.presentedFiles);
      const filesChanged=files!==undefined&&JSON.stringify(entry.presentedFiles)!==JSON.stringify(files);
      const thinkingChanged=Boolean(item.thinking)&&!entry.thinking;
      if ((nativeBody || entry.text === item.text) && entry.status === item.status && !nameChanged && !inputChanged && !filesChanged && !thinkingChanged && !participationChanged) return originChanged;
      if(participationChanged&&participation)(record.participationTools??={})[entry.id]={...participation,entryRevision:record.participationTools?.[entry.id]?.entryRevision};
      if (!nativeBody) entry.text = item.text;
      entry.status = item.status; if (item.thinking) entry.thinking = true; if (nameChanged) entry.name = item.name; if (inputChanged) entry.input = item.input; if(filesChanged)entry.presentedFiles=files; if(item.participation&&participation)(record.participationTools??={})[entry.id]={...participation,entryRevision:item.nativeTool?undefined:createHash('sha256').update(JSON.stringify(entry)).digest('hex')}; return true;
    }
    entry = { id: randomUUID(), sequence: (record.view.entries.at(-1)?.sequence ?? record.view.childOf?.throughSequence ?? 0) + 1, createdAt: this.options.now(), kind: item.kind, role: item.role, text: item.text, ...(item.thinking?{thinking:true}:{}), ...(item.kind==='tool'?{participation:mergeParticipation(undefined,item.participation,item.name,item.input)}:{}), name: item.name, input: item.input, ...(item.presentedFiles?{presentedFiles:normalizePresentedFiles(item.presentedFiles)}:{}), parentToolId: item.parentToolId, participantId: participant.id, provider: participant.provider, runId:runId??record.attempts.find(a=>a.participantId===participant.id&&(a.executionRef?.id===item.executionId||a.clientRequestId===item.executionId))?.runId, status: item.status };
    record.view.entries.push(entry); record.sources[source] = entry.id;
    // A late native projection is known to this participant; intervening foreign
    // work and an input still awaiting acceptance are not. Never skip that gap.
    for (const visible of record.view.entries) {
      if (visible.sequence <= participant.deliveredThrough) continue;
      if (visible.participantId !== participant.id || record.attempts.some(value => value.userEntryId === visible.id && !value.accepted)) break;
      participant.deliveredThrough = visible.sequence;
    }
    return true;
  }
  private event(workspaceId: string, id: string, runId: string, event: ExecutorEvent): void {
    this.retryRecordUpdate(()=>this.applyEvent(workspaceId,id,runId,event));
  }
  /** Reapply only a local deterministic mutation after an explicit rejected write. */
  private retryRecordUpdate<T>(apply:()=>T):T {
    for(let attempt=0;;attempt++){
      try{return apply();}catch(error){if(attempt>=2||!(error instanceof AgentServiceError)||error.code!=='agent_revision_conflict')throw error;}
    }
  }
  private applyEvent(workspaceId: string, id: string, runId: string, event: ExecutorEvent): void {
    const textOnly = event.type === 'item' && event.item.kind === 'message' && event.item.role === 'assistant';
    const cached = textOnly ? this.streamingRecords.get(id) : undefined;
    this.streamingRecords.delete(id);
    const record = cached && cached.view.workspaceId === workspaceId && cached.view.run?.id === runId &&
      this.options.repository.readRevision(id)?.revision === cached.view.revision ? cached : this.load(workspaceId, id);
    const run = conversationRuns(record.view).find(value => value.id === runId && value.generation === this.options.generation);
    if (!run) return;
    const participant = record.participants.find(value => value.id === run.participantId)!;
    const attempt = record.attempts.find(value => value.runId === runId)!;
    // The native channel may still drain buffered text after interruption. Keep
    // tool/control observations, but do not append model output after user stop.
    if(run.stopRequested&&event.type==='item'&&event.item.kind==='message')return;
    // A late transport failure cannot negate an exact settled execution.
    if(this.hasPersistedEnd(record,run)&&
      ['observation','diagnostic','completed'].includes(event.type))return;
    if (event.type === 'item' && event.item.kind === 'tool' && event.item.executionId && attempt.executionRef?.id !== event.item.executionId) {
      const owner = record.attempts.find(value => value.participantId === participant.id && value.executionRef?.id === event.item.executionId);
      if (owner && this.applyItem(record, participant, event.item, owner.runId, true)) this.save(record);
      return;
    }
    if(event.type==='context-usage'){if(Number.isSafeInteger(event.usedTokens)&&event.usedTokens>=0){run.contextUsage={usedTokens:event.usedTokens,...(Number.isSafeInteger(event.windowTokens)&&event.windowTokens!>0?{windowTokens:event.windowTokens}:{})};run.updatedAt=this.options.now();this.save(record);}return;}
    if (event.type === 'models') {
      const connection = this.options.connections.observeModels(participant.connectionId, participant.bindingIdentity, event.models);
      this.options.events.publish({ type: 'connection', workspaceId, conversationId: id, revision: connection.revision, payload: { connection } }); return;
    }
    if (event.type === 'title') { if (record.view.run?.id === runId && !record.view.forkedFrom && this.acceptTitle(record, event.title)) this.save(record); return; }
    if (run.resourcesReleased && ['accepted','request'].includes(event.type)) return;
    if (['completed', 'stopped', 'failed'].includes(run.status) && (event.type === 'accepted' || event.type === 'request')) return;
    if (event.type === 'accepted') {
      attempt.accepted = true; attempt.executionRef = event.executionRef; attempt.nativeInputItemId = event.inputItemId;
      for(const receipt of record.view.entries.filter(e=>e.kind==='handoff'&&e.runId===runId))receipt.status='accepted';
      run.accepted = true;
      run.status = run.status === 'stopping' || record.interruption?.runId === runId && record.interruption.cancelled ? 'stopping' : 'running';
      participant.deliveredThrough = Math.max(participant.deliveredThrough, attempt.through);
      const entry = record.view.entries.find(value => value.id === attempt.userEntryId)!; entry.status = 'accepted';
      if (event.inputItemId) record.sources[`${participant.id}:message:${event.inputItemId}`] = entry.id;
      this.endReplacedQuestions(record, runId);
    } else if (event.type === 'item') {
      if (!this.applyItem(record, participant, event.item, runId, true)) return;
    } else if (event.type === 'request') {
      if (run.supersededBy || event.request.kind === 'question' && run.questionsEndedBy) return;
      if (!attempt.executionRef) fail('agent_native_request_unbound', '原生交互尚未取得执行身份，不能安全回应。', 409);
      const existing = record.view.requests.find(request => record.requests[request.id]?.nativeId === event.request.id && request.runId === runId);
      if (!existing) {
        const requestId = randomUUID();
        record.requests[requestId] = { nativeId: event.request.id, executionRef: attempt.executionRef };
        record.view.requests.push({ ...event.request, id: requestId, conversationId: id, workspaceId, participantId: participant.id, runId, generation: this.options.generation });
      }
      if (blocksExecution(event.request) && run.status !== 'stopping') run.status = this.waitingStatus(record, run.id) ?? run.status;
    } else if (event.type === 'request-resolved') {
      const resolved = record.view.requests.filter(request => request.runId === runId && record.requests[request.id]?.nativeId === event.requestId);
      if (!resolved.length) return;
      this.retireQuestions(record,resolved);
      if (['waiting-approval', 'waiting-question'].includes(run.status)) run.status = this.waitingStatus(record, run.id) ?? 'running';
    } else if (event.type === 'observation') this.applyObservation(record, event.observation, run);
    else if (event.type === 'diagnostic') run.diagnostic = event.message;
    else if (event.type === 'completed') {
      delete run.contextCompaction;
      // A model terminal event alone does not prove that tools have stopped.
      if (event.status === 'failed') { run.status = 'failed'; run.fault = event.fault; run.diagnostic = event.diagnostic ?? '原生执行失败。'; }
      else { run.diagnostic = event.diagnostic; }
    }
    run.updatedAt = this.options.now();
    this.save(record, false, textOnly, record===cached&&event.type==='item'?record.sources[`${participant.id}:${event.item.kind}:${event.item.id}`]:undefined);
    if (textOnly && event.type === 'item' && event.item.status === 'running') {
      this.streamingRecords.set(id, record);
      if (this.streamingRecords.size > 8) this.streamingRecords.delete(this.streamingRecords.keys().next().value!);
    }
    if (event.type === 'accepted' || event.type === 'observation' || event.type === 'completed' || event.type === 'item' && event.item.kind === 'tool') this.scheduleQuestionWaitReleases(record);
    if(event.type==='item'&&event.item.kind==='tool')this.enrichParticipation(workspaceId,id,participant.id,event.item.id);
    if (event.type === 'accepted' && run.status === 'stopping') {
      // Stop may arrive before the vendor has returned its execution identity.
      queueMicrotask(() => {
        const current = this.ownedRun(workspaceId, id, runId);
        if (current?.run.status === 'stopping') void this.stop(workspaceId, id, { expectedRevision: current.record.view.revision, runId, participantId: run.participantId, generation: run.generation }).catch(() => {});
      });
    }
  }
  private discoverParticipation(workspaceId:string,id:string,runId:string):void {
    const observe=this.options.host.capabilities.observeParticipation;
    if(!observe)return;
    const request={ref:this.options.host.ref(workspaceId),observations:[],discover:true,provider:this.load(workspaceId,id).view.run?.provider};
    void within(Promise.resolve().then(()=>observe.call(this.options.host.capabilities,request)),PARTICIPATION_LIMITS.timeoutMs,'participation-timeout').then(result=>{
      if(this.closing||result.version!==1)return;
      this.retryRecordUpdate(()=>{const record=this.load(workspaceId,id),attempt=record.attempts.find(a=>a.runId===runId);if(!attempt?.participation)return;
        const available=result.sources.filter(validParticipationSource).map(participationSource);
        if(Buffer.byteLength(JSON.stringify(available))>PARTICIPATION_LIMITS.snapshotBytes){attempt.participation.gaps=['discovery-limit'];}
        else{attempt.participation.available=available;attempt.participation.gaps=[...participationGaps(result.gaps),'implicit-consumption-unavailable'];}
        this.save(record);
      });
    }).catch(()=>{
      if(this.closing)return;
      this.retryRecordUpdate(()=>{const current=this.load(workspaceId,id),attempt=current.attempts.find(value=>value.runId===runId);if(!attempt?.participation)return;attempt.participation.gaps=[...attempt.participation.gaps.filter(gap=>gap!=='source-discovery-pending'),'source-discovery-unavailable'];this.save(current);});
    }).catch(()=>{});
  }
  private enrichParticipation(workspaceId:string,id:string,participantId:string,nativeId:string):void {
    const observe=this.options.host.capabilities.observeParticipation;
    if(!observe)return;
    const key=id+':'+participantId+':'+nativeId;if(this.participationWork.has(key))return;
    const record=this.load(workspaceId,id),entry=record.view.entries.find(e=>e.id===record.sources[participantId+':tool:'+nativeId]);
    const observation=entry&&(record.participationTools?.[entry.id]??entry.participation);
    if(!entry||!observation?.matches.some(m=>m.status!=='confirmed'))return;
    const input=entry.input??this.liveTools.get(entry.id)?.input,entryId=entry.id;this.participationWork.add(key);
    const request={ref:this.options.host.ref(workspaceId),observations:observation.matches.map((m,i)=>({id:String(i),kind:m.kind,path:m.locator,name:m.name}))};
    void within(Promise.resolve().then(()=>observe.call(this.options.host.capabilities,request)),PARTICIPATION_LIMITS.timeoutMs,'participation-timeout').then(result=>{
      if(this.closing||result.version!==1)return;
      this.retryRecordUpdate(()=>{const current=this.load(workspaceId,id),item=current.view.entries.find(e=>e.id===entryId);const observed=item&&(current.participationTools?.[item.id]??item.participation);if(!item||!observed||(item.input??this.liveTools.get(entryId)?.input)!==input)return;
        (current.participationTools??={})[item.id]={...applyParticipationSources(observed,result),entryRevision:current.participationTools?.[item.id]?.entryRevision};this.save(current);
      });
    }).catch(()=>{}).finally(()=>this.participationWork.delete(key));
  }
  private retireQuestions(record: StoredConversation, requests = record.view.requests.filter(request => request.runId === record.view.run?.id)): void {
    for (const request of requests) {
      const id = 'retired-question-' + request.id;
      if (!record.view.entries.some(entry => entry.id === id || entry.id === 'waiting-question-'+request.runId+'-'+request.id || entry.id === 'reply-'+request.id || entry.id.startsWith('reply-'+request.id+'-'))) record.view.entries.push({id, sequence:(record.view.entries.at(-1)?.sequence ?? 0)+1, kind:'notice', role:'system', runId:request.runId, participantId:request.participantId, createdAt:this.options.now(), text:JSON.stringify({请求标识:request.id,问题:request.title,说明:request.description,问题列表:request.questions,选项:request.options,状态:'原问题等待已结束；没有通过此卡片提交的回答不构成同意。',授权性质:'只保留原问题，不补造答复或授权。'})});
    }
    const retired = new Set(requests.map(request=>request.id));
    record.view.requests = record.view.requests.filter(request=>!retired.has(request.id));
    for(const id of retired)delete record.requests[id];
  }
  private waitingStatus(record: StoredConversation, runId = record.view.run?.id): 'waiting-approval' | 'waiting-question' | undefined {
    const blocking = record.view.requests.filter(request => request.runId === runId && blocksExecution(request));
    return blocking.some(request => request.kind === 'approval') ? 'waiting-approval' : blocking.length ? 'waiting-question' : undefined;
  }
  private applyObservation(record: StoredConversation, observation: ExecutorObservation, run = record.view.run): void {
    if (!run) return;
    if(this.hasPersistedEnd(record,run))return;
    const requests = record.view.requests.filter(request => request.runId === run.id);
    if(run.resourcesReleased&&(!['idle','stopped'].includes(observation.status)||observation.tools.some(tool=>tool.status!=='completed')))return;
    const attempt=record.attempts.find(value=>value.runId===run.id);
    if(attempt?.executionRef&&observation.executionRef?.id===attempt.executionRef.id&&observation.executionRef.data){
      const prior=attempt.executionRef.data,next=observation.executionRef.data;
      if(prior?.resourceGroup===next.resourceGroup&&prior?.resourceContext===next.resourceContext&&prior?.resourceBinding===next.resourceBinding)attempt.executionRef={...attempt.executionRef,data:{...prior,...next}};
    }
    run.executionState=['idle','stopped'].includes(observation.status)&&observation.tools.every(tool=>tool.status==='completed')?'ended':['running','waiting','tools-active'].includes(observation.status)?'active':'unknown';
    run.tools = observation.tools;
    if (attempt?.executionRef && attempt.executionRef.id === observation.executionRef?.id && !['completed','failed','stopped'].includes(run.status) && observation.contextCompaction !== undefined) {
      if (observation.contextCompaction === null) delete run.contextCompaction;
      else if (observation.contextCompaction.id && Number.isFinite(Date.parse(observation.contextCompaction.startedAt))) {
        if (run.contextCompaction?.id !== observation.contextCompaction.id) run.contextCompaction = {...observation.contextCompaction};
      }
    }
    // A complete native snapshot, not "running" alone, proves request absence.
    if (observation.requests && attempt?.executionRef && observation.executionRef?.id === attempt.executionRef.id) {
      const ids = new Set(observation.requests.map(request => request.id));
      this.retireQuestions(record, record.view.requests.filter(request => request.runId === run.id && !ids.has(record.requests[request.id]?.nativeId)));
      if (attempt?.executionRef && !run.supersededBy && ['running', 'waiting'].includes(observation.status)) {
        for (const request of observation.requests) {
          if (request.kind === 'question' && run.questionsEndedBy) continue;
          const existing = record.view.requests.find(value => value.runId === run.id && record.requests[value.id]?.nativeId === request.id);
          if (existing) {
            Object.assign(existing, request, { id: existing.id, conversationId: record.view.id, workspaceId: record.view.workspaceId, participantId: run.participantId, runId: run.id, generation: run.generation });
            continue;
          }
          const id = randomUUID();
          record.requests[id] = { nativeId: request.id, executionRef: attempt.executionRef };
          record.view.requests.push({ ...request, id, conversationId: record.view.id, workspaceId: record.view.workspaceId, participantId: run.participantId, runId: run.id, generation: run.generation });
        }
      }
    }
    run.canContinue = observation.canContinue === true && run.status !== 'stopping' && !record.view.requests.some(request => request.runId === run.id);
    if (observation.fault) run.fault = observation.fault;
    if (observation.diagnostic) run.diagnostic = observation.diagnostic;
    if (observation.status === 'tools-active' || observation.tools.some(tool => tool.status === 'running') && !['running', 'waiting'].includes(observation.status)) run.status = 'tools-active';
    else if (observation.status === 'unknown' || observation.tools.some(tool => tool.status === 'unknown')) run.status = 'unknown';
    else if (observation.status === 'stopped') {
      if (run.status === 'unknown' && !record.interruption && !observation.diagnostic) run.diagnostic = '原执行已确认停止，可以继续对话。';
      run.status = 'stopped'; this.retireQuestions(record, requests);
    }
    else if (observation.status === 'idle') {
      if (!run.accepted) {
        if (run.stopRequested && !run.tools.some(tool => tool.status !== 'completed')) {
          run.status = 'stopped';
          run.executionState = 'ended';
          run.canContinue = false;
          run.diagnostic = '已结束本轮等待；原输入是否送达仍未知，已有操作结果保留，不会重发。';
        } else if (run.status !== 'starting' && run.status !== 'stopping') run.status = 'unknown';
        return;
      }
      run.status = run.status === 'stopping' ? 'stopped' : run.status === 'failed' || record.interruption?.runId === run.id && record.interruption.reason === 'execution-fault' ? 'failed' : 'completed';
      if (run.status==='completed' && !observation.diagnostic) delete run.diagnostic;
      this.retireQuestions(record, requests);
    } else if (observation.status === 'running') {
      run.status = run.status === 'stopping' ? 'stopping' : 'running';
      if (record.interruption?.runId===run.id && run.status === 'running' && !observation.diagnostic && record.interruption?.reason === 'transport') {
        delete record.interruption; delete run.interrupted; delete run.diagnostic;
      }
    } else if (observation.status === 'waiting' && run.status !== 'stopping') run.status = this.waitingStatus(record, run.id) ?? 'unknown';
    run.updatedAt = this.options.now();
    this.scheduleQuestionWaitReleases(record);
  }

  private async execute(workspaceId: string, id: string, runId: string, prepared: ReturnType<ConversationApplication['prepare']>, retryCount?: number): Promise<void> {
    const attempt = this.currentRun(workspaceId, id, runId)?.attempts.find(value => value.runId === runId);
    const request = attempt?.clientRequestId ?? '';
    const lineage = /^automatic-retry:([^:]+):(\d+)$/.exec(request);
    const internalRecovery = Boolean(attempt?.continuationOf && (request.startsWith('host-recovery:') || lineage));
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
      const transition = attempt?.questionWaits?.find(wait => wait.reuse);
      if (transition) {
        const old = conversationRuns(record.view).find(run => run.id === transition.runId);
        if (!old) fail('agent_question_transition_stale', '原问题执行已变化，新要求未向原生发送。', 409);
        await this.releaseQuestionWait(workspaceId, id, { expectedRevision: record.view.revision, runId: old.id, participantId: old.participantId, generation: old.generation });
        record = this.currentRun(workspaceId, id, runId); if (!record) return;
        const previous = conversationRuns(record.view).find(run => run.id === transition.runId);
        if (!previous || !['completed','stopped','failed'].includes(previous.status) || previous.tools.some(tool => tool.status !== 'completed'))
          fail('agent_question_transition_unconfirmed', '原生问题等待尚未安全释放，新要求未发送；原问题及未知结果保留。', 409);
        const oldWork = this.workers.get(transition.runId);
        if (oldWork) await within(oldWork, 5000, 'agent_question_transition_unconfirmed');
      }
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
        let needsReview = false;
        // Native reads are asynchronous: a retained generation may update its
        // own round meanwhile. Reapply only the observed history to fresh state;
        // never retry resumeContext/send or overwrite unrelated metadata.
        this.retryRecordUpdate(() => {
          const current = this.currentRun(workspaceId, id, runId);
          if (!current) return;
          record = current;
          const currentParticipant = current.participants.find(value => value.id === participant.id)!;
          let changed = false;
          needsReview = false;
          for (const item of history) {
            if (!this.applyItem(current, currentParticipant, item)) continue;
            changed = true;
            const sourceEntryId = current.sources[`${participant.id}:${item.kind}:${item.id}`];
            const entry = current.view.entries.find(value => value.id === sourceEntryId);
            const outcome = entry?.runId ? current.runOutcomes?.[entry.runId] : undefined;
            if (item.role === 'user' && !item.parentToolId || !outcome || !['completed', 'stopped', 'failed'].includes(outcome.status) || item.kind === 'tool' && !['completed', 'failed'].includes(item.status ?? '')) needsReview = true;
          }
          if (changed) this.save(current);
        });
        if (needsReview) fail('agent_history_changed', '原生记录有新变化，本次要求已保留；请核对后再继续。', 409);
      } else {
        creatingContext = true;
        const ref = await runtime.createContext({ cwd: record.view.cwd, permissionMode: prepared.draft.permissionMode });
        this.retryRecordUpdate(()=>{
          const current=this.currentRun(workspaceId,id,runId);if(!current)return;
          const storedParticipant=current.participants.find(value=>value.id===participant.id)!;
          storedParticipant.contextRef=ref;storedParticipant.bindingIdentity=runtime.bindingIdentity;this.save(current);
        });
        record = this.currentRun(workspaceId,id,runId);if(!record)return;
        participant.contextRef = ref;
        creatingContext = false;
      }
      const beforeDispatch = this.currentRun(workspaceId, id, runId); if (!beforeDispatch) return;
      record = beforeDispatch;
      const previousAttempt = record.attempts.findLast(value=>value.runId!==runId);
      const previousParticipant = record.participants.find(value=>value.id===previousAttempt?.participantId);
      const previousRun = conversationRuns(record.view).find(value=>value.id===previousAttempt?.runId);
      const previousGeneration = previousRun?.generation ?? (previousAttempt ? record.runOutcomes?.[previousAttempt.runId]?.generation : undefined);
      const fromContext = previousParticipant?.contextRef?.id;
      const toContext = participant.contextRef!.id;
      // Persist identity only after native resume/create succeeded. Acceptance
      // remains a separate receipt, so a failed dispatch is never called a handoff success.
      if (!internalRecovery && previousParticipant && (fromContext!==toContext || previousGeneration && previousGeneration!==this.options.generation)) {
        const reason = fromContext===toContext ? 'backend-adoption' as const : 'session-replacement' as const;
        this.retryRecordUpdate(()=>{
          const current=this.currentRun(workspaceId,id,runId);if(!current)return;
          if(current.view.entries.some(entry=>entry.id==='native-session-'+runId))return;
          current.view.entries.push({
          id:'native-session-'+runId, sequence:(current.view.entries.at(-1)?.sequence??0)+1,
          createdAt:this.options.now(), kind:'handoff', role:'system', runId, participantId:participant.id,
          provider:participant.provider, status:'sending',
          text:reason==='backend-adoption'?'后台已接管原生会话，等待本轮受理。':'执行选择或可用上下文变化，已准备新的原生会话，等待本轮受理。',
          nativeSession:{reason,...(this.options.backendChange?.fromGeneration===previousGeneration?{backendChange:this.options.backendChange}:{}),description:reason==='backend-adoption'?'原轮控制已释放，新后台复用原生会话':prepared.preview.switching?'用户执行选择变化':previousRun&&unfinishedRun(previousRun)?'原轮仍有在途工作，新要求使用独立会话':previousRun&&!previousRun.resourcesReleased&&previousGeneration!==this.options.generation?'原会话控制资源尚未释放，新要求使用独立会话':'原上下文不可复用，使用新的原生会话',from:{contextId:fromContext,generation:previousGeneration},to:{contextId:toContext,generation:this.options.generation}},
          });
          this.save(current);
        });
        const latest=this.currentRun(workspaceId,id,runId);if(!latest)return;
        record=latest;
      }
      if (beforeDispatch.view.run!.status === 'stopping') { beforeDispatch.view.run!.status = 'stopped'; this.save(beforeDispatch); return; }
      if (!this.options.connections.get(prepared.draft.connectionId).enabled) fail('agent_connection_disabled', '接入已断开，本次输入尚未交付。', 409);
      const inputAttempt=record.attempts.find(value=>value.runId===runId)!;
      const storedParticipant=record.participants.find(value=>value.id===participant.id)??participant;
      const priorContext=storedParticipant.participationContext;
      const contextId=participant.contextRef!.id;
      const instruction=runtime.participationInstruction;
      const sameContext=priorContext?.id===contextId&&priorContext?.instruction.observedVersion===instruction?.observedVersion;
      if(!sameContext && instruction)storedParticipant.participationContext={id:contextId,configuredAt:this.options.now(),instruction};
      inputAttempt.participation={version:1,submittedAt:this.options.now(),segments:[...prepared.participationSegments,...(!sameContext && instruction?[instruction]:[])],available:[],coverage:'partial',gaps:['implicit-consumption-unavailable',this.options.host.capabilities.observeParticipation?'source-discovery-pending':'source-discovery-unavailable'],context:instruction||priorContext?.instruction?{id:contextId,inherited:!!sameContext}:undefined};
      this.save(record);
      this.discoverParticipation(workspaceId,id,runId);
      dispatched = true;
      let titleStarted = false;
      const startTitle = () => {
        if (titleStarted) return;
        titleStarted = true;
        const early = this.titleAtRunStart(workspaceId, id, runId, runtime, prepared.text).catch(() => {});
        this.earlyTitles.set(id, early);
        void early.finally(() => { if (this.earlyTitles.get(id) === early) this.earlyTitles.delete(id); this.scheduleSourceRelease(workspaceId, id); });
      };
      await runtime.send({ contextRef: participant.contextRef!, cwd: record.view.cwd, text: prepared.text, images: prepared.images, model: prepared.draft.modelAccountId ? selectedRuntime.model : prepared.draft.model, reasoningEffort: prepared.draft.reasoningEffort, permissionMode: prepared.draft.permissionMode, clientRequestId: record.attempts.find(value => value.runId === runId)!.clientRequestId, onEvent: event => {
        this.event(workspaceId, id, runId, event);
        // A context can exist long before its input is admitted. Do not spend the
        // independent title budget on native startup (especially Qoder).
        if (event.type === 'accepted') startTitle();
      } });
      // An old stop may already be observing this conversation. Its snapshot
      // cannot stand in for the just-finished new execution.
      const settled=this.ownedRun(workspaceId,id,runId);
      if(settled)await this.observeRun(workspaceId,id,{expectedRevision:settled.record.view.revision,runId,participantId:settled.run.participantId,generation:settled.run.generation});
      const ended = this.currentRun(workspaceId, id, runId);
      if (ended?.view.run?.fault && ['failed','unknown'].includes(ended.view.run.status)) await this.recoverExecutionFailure(workspaceId,id,runId);
      else if (ended?.view.run?.status === 'failed') await this.retryFailure(workspaceId, id, runId, prepared, retries, rootRunId, ended.view.run.diagnostic ?? '', runtime);
      void this.generateAutomaticTitle(workspaceId, id, runId, runtime).catch(() => {});
    } catch (error) {
      this.diagnostics({event:'run-failed',workspaceId,conversationId:id,runId,code:diagnosticCode(error)});
      const record = this.currentRun(workspaceId, id, runId);
      if (!record) {
        const detached=this.ownedRun(workspaceId,id,runId);
        if(detached&&dispatched&&!['completed','stopped'].includes(detached.run.status)) {
          detached.run.status='unknown';detached.run.executionState='unknown';detached.run.diagnostic=safeDiagnostic(error);this.save(detached.record);
        }
        return;
      }
      const run = record.view.run!;
      if(run.status==='completed'&&run.executionState==='ended'&&run.tools.every(tool=>tool.status==='completed')&&!(error instanceof NativeRequestError&&error.fault))return;
      const rejectedBeforeInput = !run.accepted && (error instanceof ExecutorInputRejected || error instanceof AgentServiceError && ['agent_permission_invalid', 'agent_permission_unavailable', 'agent_permission_unverified', 'agent_reasoning_unavailable'].includes(error.code));
      const userStopping = run.status === 'stopping';
      const possiblyDelivered = dispatched && !rejectedBeforeInput;
      if (run.status !== 'stopped' && (run.status !== 'completed' || error instanceof NativeRequestError && error.fault)) run.status = possiblyDelivered ? 'unknown' : 'failed';
      run.diagnostic = this.options.modelAccess?.leases.streamFailure(id,runId)??safeDiagnostic(error); run.updatedAt = this.options.now();
      if (error instanceof NativeRequestError || error instanceof NativeObservationError) run.fault = error.fault;
      const transportLost = error instanceof Error && ['codex_execution_observation_lost', 'codex_event_observation_lost', 'dsh_execution_observation_lost', 'dsh_event_observation_lost', 'qoder_execution_observation_lost', 'qoder_event_observation_lost'].includes(error.message);
      if (!this.closing && !userStopping && transportLost && run.accepted && run.status === 'unknown' && !record.interruption?.cancelled) {
        record.interruption = { runId, reason: 'transport', awaitingUser: record.view.requests.some(request=>request.runId===runId) };
        run.interrupted = true;
      }
      const attempt = record.attempts.find(value => value.runId === runId);
      const entry = record.view.entries.find(value => value.id === attempt?.userEntryId);
      if (entry && !run.accepted) entry.status = possiblyDelivered ? 'unknown' : 'failed';
      if(!run.accepted)for(const receipt of record.view.entries.filter(e=>e.kind==='handoff'&&e.runId===runId))receipt.status=possiblyDelivered?'unknown':'failed';
      try { this.save(record); } catch { return; /* Preserve existing DB and native state. */ }
      if (record.interruption?.reason === 'transport' && !this.closing) await this.recoverOne(workspaceId, id);
      else if (!userStopping && run.accepted && run.fault) await this.recoverExecutionFailure(workspaceId,id,runId);
      else if (!dispatched && !userStopping && (!creatingContext || error instanceof NativeRequestError)) await this.retryFailure(workspaceId, id, runId, prepared, retries, rootRunId, error instanceof Error && transientFailure(error.message) ? error.message : safeDiagnostic(error), undefined);
    } finally {
      if (!dispatched) {
        const detached = this.ownedRun(workspaceId,id,runId);
        if (detached && detached.record.view.run?.id !== runId && !detached.run.accepted && !detached.record.attempts.find(attempt=>attempt.runId===runId)?.executionRef) {
          detached.run.status='stopped'; detached.run.executionState='ended'; detached.run.diagnostic='新要求已接续，本轮尚未交付原生执行。';this.save(detached.record);
        }
      }
    }
  }

  /** All executors share the existing exact-observation, release and persisted-budget path. */
  private async recoverExecutionFailure(workspaceId:string,id:string,runId:string):Promise<boolean> {
    const record=this.currentRun(workspaceId,id,runId),run=record?.view.run;
    if(!record||!run?.fault||!run.accepted||!['failed','unknown'].includes(run.status)||this.closing||record.interruption?.cancelled||this.cancelledRetries.has(runId))return false;
    record.interruption??={runId,reason:'execution-fault',awaitingUser:record.view.requests.some(request=>request.runId===runId)};
    run.interrupted=true;this.save(record);
    await this.recoverOne(workspaceId,id);return true;
  }

  private async retryFailure(workspaceId: string, id: string, runId: string, prepared: ReturnType<ConversationApplication['prepare']>, count: number, rootRunId: string, reason: string, runtime?: AgentRuntime): Promise<void> {
    if (this.closing || this.cancelledRetries.has(runId)) return;
    let record = this.currentRun(workspaceId, id, runId);
    if (!record || record.view.run?.status !== 'failed' || record.view.requests.some(request=>request.runId===runId) || record.interruption?.cancelled || record.view.run.tools.some(tool => tool.status !== 'completed')) return;
    const account=record.view.run.modelAccountId?this.options.modelAccess?.accounts.snapshot(record.view.run.modelAccountId):undefined;
    const quotaFailure=account&&account.identity===record.view.run.modelAccountIdentity&&modelQuotaFailure(account,account.models.find(model=>model.id===record!.view.run!.model),Date.parse(this.options.now()));
    if(quotaFailure){record.view.run.diagnostic=quotaFailure.message;this.save(record);return;}
    const credential = localCredentialFailure(reason);
    if(!transientFailure(reason) && !credential)return;
    if (count >= (credential ? LOCAL_CREDENTIAL_RETRIES : RETRY_DELAYS.length)) {
      record.view.run.diagnostic = credential
        ? `本机模型凭据重新签发后仍被拒绝，已停止自动接续，工作记录已保留。${record.view.run.diagnostic ?? ''}`
        : `自动重试已达上限（${RETRY_DELAYS.length} 次），工作记录已保留。${record.view.run.diagnostic ?? ''}`;
      this.save(record); return;
    }
    if (runtime) {
      const participant = record.participants.find(value => value.id === record!.view.run!.participantId)!;
      const executionRef = record.attempts.find(value => value.runId === runId)?.executionRef;
      if (!participant.contextRef || !executionRef) return;
      const observed = await runtime.observe({ contextRef: participant.contextRef, executionRef }).catch(() => undefined);
      if (!observed || observed.executionRef?.id !== executionRef.id || observed.status !== 'idle' || observed.tools.some(tool => tool.status !== 'completed')) return;
      record = this.currentRun(workspaceId, id, runId);
      if (this.cancelledRetries.has(runId) || !record || record.view.run?.status !== 'failed' || record.view.requests.some(request=>request.runId===runId) || record.interruption?.cancelled) return;
    }
    if (credential) {
      // A revoked key is only worth replacing while the account is still usable. The refresh
      // that revokes it also downgrades the row for a moment, so a stale row is re-inspected
      // once instead of being trusted as "logged out".
      const access = this.options.modelAccess;
      if (!access || !record.view.run.modelAccountId) return;
      let holder = access.accounts.snapshot(record.view.run.modelAccountId);
      if (!holder?.enabled) return;
      if (holder.status !== 'ready') {
        await access.accounts.check(holder.id).catch(() => undefined);
        record = this.currentRun(workspaceId, id, runId);
        if (this.cancelledRetries.has(runId) || !record || record.view.run?.status !== 'failed' || record.view.requests.some(request=>request.runId===runId) || record.interruption?.cancelled) return;
        holder = access.accounts.snapshot(holder.id);
        if (!holder?.enabled || holder.status !== 'ready') return;
      }
    }
    // The failed turn still holds this participant's source, so the rejected key is only
    // replaced by releasing it here; the resend then opens a fresh lease and process.
    if (credential && (!runtime || !await this.retireSource(record.view.run.participantId))) return;
    if (credential) {
      record = this.currentRun(workspaceId, id, runId);
      if (this.cancelledRetries.has(runId) || !record || record.view.run?.status !== 'failed' || record.view.requests.some(request=>request.runId===runId) || record.interruption?.cancelled) return;
    }
    const delay = credential ? RETRY_DELAYS[0] : RETRY_DELAYS[count];
    const diagnostic = record.view.run!.diagnostic;
    const attempt = record.attempts.find(value => value.runId === runId)!;
    attempt.automaticRetry = {rootRunId, count: count + 1};
    const controller = new AbortController();
    this.retryWaits.set(runId, controller);
    record.view.run!.status = 'starting';
    record.view.run!.diagnostic = credential
      ? `本机模型凭据已失效，正在重新准备执行环境，${delay / 1000} 秒后自动接续一次。${diagnostic ?? ''}`
      : `暂时未完成，${delay / 1000} 秒后自动重试（${count + 1}/${RETRY_DELAYS.length}）。${diagnostic ?? ''}`;
    this.save(record);
    try {
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, delay);
        controller.signal.addEventListener('abort', finish, { once: true });
      });
      record = this.currentRun(workspaceId, id, runId);
      if (controller.signal.aborted || this.closing || !record || record.view.run?.status !== 'starting') return;
      this.retryWaits.delete(runId);
      record.view.run.status = 'failed'; record.view.run.diagnostic = diagnostic; this.save(record);
      const latestAccount=record.view.run.modelAccountId?this.options.modelAccess?.accounts.snapshot(record.view.run.modelAccountId):undefined;
      const latestQuotaFailure=latestAccount&&latestAccount.identity===record.view.run.modelAccountIdentity&&modelQuotaFailure(latestAccount,latestAccount.models.find(model=>model.id===record!.view.run!.model),Date.parse(this.options.now()));
      if(latestQuotaFailure){record.view.run.diagnostic=latestQuotaFailure.message;this.save(record);return;}
      // Preparation rechecks source identity, current model, permission and saved revision.
      const draft: SendDraft = { ...prepared.draft, continueRunId: undefined, expectedRevision: record.view.revision, skipHandoffSummary: true,
        ...(runtime ? { text: credential ? '系统自动重试：上次执行因本机模型凭据失效而结束，已重新准备执行环境并确认没有未结束的工具。请核对原对话、当前成果及工具结果，继续完成用户尚未完成的目标；不要重放全部历史命令，不扩大原有授权。' : '系统自动重试：上次执行因临时服务故障明确结束，已确认没有未结束的工具。请核对原对话、当前成果及工具结果，继续完成用户尚未完成的目标；不要重放全部历史命令，不扩大原有授权。' } : {}) };
      if (runtime) this.send(workspaceId, id, { ...draft, clientRequestId: `automatic-retry:${rootRunId}:${count + 1}` }, true);
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
    return !this.closing && record.titleOrigin === 'default' && (record.view.title === NEUTRAL_TITLE || record.view.title === TITLE_FAILURE_REMINDER);
  }
  private titleAttempts(record:StoredConversation, participantId:string): {early?:boolean;completion?:boolean} {
    if (!record.titleAttemptsByParticipant) {
      record.titleAttemptsByParticipant={};
      // Older records consumed global flags. Keep that budget with the participant
      // that actually attempted the phase, rather than blocking every new executor.
      const owner=(phase:'early'|'completion')=>{
        const diagnostic=record.titleDiagnostics?.findLast(value=>value.phase===phase || phase==='completion' && value.phase==='manual');
        return record.attempts.find(value=>value.runId===diagnostic?.runId)?.participantId ?? record.attempts[0]?.participantId;
      };
      for (const [phase,attempted] of [['early',record.earlyTitleAttempted],['completion',record.titleAttempted]] as const) {
        const id=attempted?owner(phase):undefined;
        if(id)(record.titleAttemptsByParticipant[id]??={})[phase]=true;
      }
    }
    return record.titleAttemptsByParticipant[participantId]??={};
  }
  /** Backfill once native input is admitted; the completed-run path stays the fallback. */
  private async titleAtRunStart(workspaceId: string, id: string, runId: string, runtime: AgentRuntime, userText?: string): Promise<void> {
    const previous=this.earlyTitles.get(id);
    if (this.titleWork.has(id) && previous) await previous.catch(()=>{});
    const record = this.currentRun(workspaceId, id, runId);
    if (!record || !this.titleEligible(record) || this.titleWork.has(id)) return;
    const participant = record.participants.find(value => value.id === record.view.run!.participantId);
    const description = this.titleDescription(record, false);
    if (!participant?.contextRef || !description) return;
    const attempts=this.titleAttempts(record,participant.id);
    if(attempts.early || attempts.completion)return;
    attempts.early=true;record.earlyTitleAttempted = true;
    if (!runtime.generateTitle) { this.save(record); this.recordTitleFailure(workspaceId, id, runId, 'early', new Error('agent_title_unavailable')); return; }
    record.view.titleState={status:'generating'}; this.save(record);
    const controller = new AbortController(); this.titleWork.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS + 2_000); timeout.unref();
    try {
      let title: string | undefined;
      if (runtime.readTitle && !record.view.forkedFrom) title = await within(runtime.readTitle({contextRef:participant.contextRef,cwd:record.view.cwd}),2_000,'agent_title_timeout').catch(()=>undefined);
      const observed=this.currentRun(workspaceId,id,runId);
      if(!observed || !this.titleEligible(observed) || controller.signal.aborted)return;
      if(this.acceptTitle(observed,title)){this.save(observed);return;}
      title = await within(runtime.generateTitle({ contextRef: participant.contextRef, cwd: record.view.cwd, description, ...(userText ? { userText } : {}), model: record.view.run?.model, freshInstruction: Boolean(record.view.forkedFrom), signal: controller.signal }), TITLE_TIMEOUT_MS, 'agent_title_timeout', controller.signal);
      const current = this.currentRun(workspaceId, id, runId);
      if (!current || controller.signal.aborted) return;
      if (!this.titleEligible(current)) return;
      if (!this.acceptTitle(current, title)) throw new Error(title ? 'agent_title_invalid' : 'agent_title_empty');
      this.save(current);
    } catch (error) {
      controller.abort();
      this.recordTitleFailure(workspaceId, id, runId, 'early', error);
    }
    finally { clearTimeout(timeout); if (this.titleWork.get(id) === controller) this.titleWork.delete(id); this.scheduleSourceRelease(workspaceId, id); }
  }
  private recordTitleFailure(workspaceId: string, id: string, runId: string, phase: 'early'|'completion'|'manual', error: unknown): void {
    const current = this.currentRun(workspaceId, id, runId);
    if (!current || this.closing) return;
    const raw = error instanceof Error ? ('code' in error ? String(error.code) : error.message) : '';
    const code = /^agent_(?:title|native|revision)_[a-z_]+$/.test(raw) ? raw : 'agent_title_failed';
    const explanations: Record<string,string> = {
      agent_title_timeout: '独立标题请求超时，已中断本次生成',
      agent_title_cancelled: '独立标题请求已取消',
      agent_title_cleanup_unconfirmed: '标题请求停止尚未确认',
      agent_title_transport_closed: '生成标题时原生连接断开',
      agent_native_process_closed: '生成标题时原生进程退出',
      agent_native_request_failed: '原生程序拒绝了标题请求',
      agent_title_unavailable: '当前执行方未提供独立标题生成能力',
      agent_title_not_ready: '原生会话尚未就绪，本次标题生成未开始',
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
    if (phase === 'completion' && current.titleOrigin === 'default' && current.view.title === NEUTRAL_TITLE) current.view.title = TITLE_FAILURE_REMINDER;
    this.save(current);
  }
  private acceptTitle(record: StoredConversation, raw: string | undefined, explicit = false): boolean {
    if (!raw || this.closing || !explicit && !this.titleEligible(record)) return false;
    const title = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    if (!title || [...title].length > 64) return false;
    record.view.title = title; record.titleOrigin = 'generated'; record.view.titleState={status:'generated'}; return true;
  }
  private titleDescription(record: StoredConversation, requireAnswer = true): string | undefined {
    const visible = record.view.entries.filter(entry => !entry.parentToolId && entry.sequence > (record.view.forkedFrom?.throughSequence ?? 0) && ['user', 'assistant'].includes(entry.role) && entry.kind === 'message' && !entry.thinking && entry.status !== 'failed' && entry.text.trim());
    const users = visible.filter(entry => entry.role === 'user'); const answers = visible.filter(entry => entry.role === 'assistant');
    if (!users.length || requireAnswer && !answers.length) return;
    const selected = new Map((record.view.forkedFrom ? [users[0]] : [users[0], answers[0], users.at(-1), answers.at(-1)]).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).map(entry => [entry.id, entry]));
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
    if (!record || !this.titleEligible(record) || record.view.run?.status !== 'completed') return;
    if(this.titleAttempts(record,record.view.run.participantId).completion)return;
    await this.summarizeTitle(workspaceId, id, record.view.revision, runtime, false).catch(() => {});
  }
  async generateTitle(workspaceId: string, id: string, input: { expectedRevision: string }): Promise<ConversationView> {
    let record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision); this.assertAccepting(record);
    if (record.view.run?.status !== 'completed' || !this.titleDescription(record)) fail('agent_title_unavailable', '请在对话成功完成并有可见回复后生成标题。', 409);
    const participant = record.participants.find(value => value.id === record.view.run!.participantId)!;
    const connection = this.options.connections.get(participant.connectionId);
    if (!connection.enabled || (!participant.modelAccountId && connection.status !== 'ready')) fail('agent_account_unavailable', '请先恢复此对话的模型接入后生成标题。', 409);
    const runtime = (await this.sourceRuntime(record, participant)).runtime;
    record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (runtime.bindingIdentity !== participant.bindingIdentity) fail('agent_binding_changed', '标题对应的原生接入身份已变化。', 409);
    await this.summarizeTitle(workspaceId, id, input.expectedRevision, runtime, true);
    return this.read(workspaceId, id,{compactTools:true});
  }
  private async summarizeTitle(workspaceId: string, id: string, revision: string, runtime: AgentRuntime, explicit: boolean): Promise<void> {
    if (this.titleWork.has(id)) fail('agent_title_busy', '正在生成本段对话的标题，请稍后查看。', 409);
    let record = this.load(workspaceId, id); expected(record.view.revision, revision);
    const participant = record.participants.find(value => value.id === record.view.run?.participantId);
    const description = this.titleDescription(record);
    if (!participant?.contextRef || !description || record.view.run?.status !== 'completed' || !explicit && (!this.titleEligible(record) || this.titleAttempts(record,participant.id).completion)) return;
    const runId = record.view.run.id; const controller = new AbortController(); this.titleWork.set(id, controller);
    this.titleAttempts(record,participant.id).completion=true;
    record.titleAttempted = true; record.view.titleState={status:'generating'}; this.save(record); revision = record.view.revision;
    const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS + 2_000); timeout.unref();
    try {
      let title: string | undefined;
      if (runtime.readTitle && !record.view.forkedFrom) title = await within(runtime.readTitle({ contextRef: participant.contextRef, cwd: record.view.cwd }), 2_000, 'agent_title_timeout').catch(() => undefined);
      record = this.load(workspaceId, id); expected(record.view.revision, revision);
      if (this.acceptTitle(record, title, explicit)) { this.save(record); return; }
      if (!runtime.generateTitle) fail('agent_title_unavailable', '此执行方尚未提供可用的精短标题，原有标题已保留。', 409);
      title = await within(runtime.generateTitle({ contextRef: participant.contextRef, cwd: record.view.cwd, description, model: record.view.run?.model, freshInstruction: Boolean(record.view.forkedFrom), signal: controller.signal }), TITLE_TIMEOUT_MS, 'agent_title_timeout', controller.signal);
      const current = this.load(workspaceId, id);
      if (controller.signal.aborted || current.view.run?.id !== runId || current.view.revision !== revision) fail('agent_revision_conflict', '对话已变化，保留当前标题。', 409);
      if (!this.acceptTitle(current, title, explicit)) fail('agent_title_failed', '未生成符合长度要求的精短标题，原有标题已保留。', 502);
      this.save(current);
    } catch (error) {
      controller.abort();
      this.recordTitleFailure(workspaceId, id, runId, explicit ? 'manual' : 'completion', error);
      if (explicit) { if (error && typeof error === 'object' && 'code' in error) throw error; fail('agent_title_failed', '标题生成未完成，原有标题与工作结果已保留。', 502); }
    } finally { clearTimeout(timeout); if (this.titleWork.get(id) === controller) this.titleWork.delete(id); this.scheduleSourceRelease(workspaceId, id); }
  }

  /** Startup scans executions, never task status. No browser subscription is required. */
  recoverInterrupted(): Promise<void> {
    if(this.recoveryWork)return this.recoveryWork;
    for(const candidate of this.options.repository.listPending(true)) {
      // Backfill only durable accepted switches. The current run and its owner
      // remain untouched, including when an older backend is still executing.
      try {
        this.retryRecordUpdate(()=>{
          const record=this.load(candidate.view.workspaceId,candidate.view.id);
          const changed=reconcileLegacySupersededRuns(record);
          const requests=record.view.requests.filter(request=>record.view.retainedRuns?.some(run=>run.id===request.runId&&run.supersededBy));
          if(requests.length)this.retireQuestions(record,requests);
          if(changed||requests.length)this.save(record);
        });
        const record=this.load(candidate.view.workspaceId,candidate.view.id);
        this.scheduleQuestionWaitReleases(record);
        if(conversationRuns(record.view).some(run=>run.supersededBy))void this.cleanupSuperseded(record.view.workspaceId,record.view.id).catch(()=>{});
      } catch { /* A local conflict must not prevent recovery of unrelated work. */ }
    }
    for(const record of this.options.repository.listInterruptedTitles(this.options.generation)){
      if(record.view.run && this.options.generationAlive?.(record.view.run.generation))continue;
      if(record.titleOrigin!=='default')continue;
      record.view.titleState={status:'failed',reason:'标题生成因服务重启中断，原有回复已保留，可显式重新生成。'};
      try{this.save(record);}catch{/* A concurrent newer record wins; do not block unrelated executions. */}
    }
    for(const candidate of this.options.repository.listTitleFailureCandidates()){
      try{
        const {workspaceId,id}=candidate.view;
        const record=this.load(workspaceId,id),participantId=record.view.run?.participantId;
        if(record.titleOrigin!=='default'||record.view.title!==NEUTRAL_TITLE||!['failed','unavailable'].includes(record.view.titleState?.status??'')||!participantId)continue;
        const attempts=this.titleAttempts(record,participantId);
        if(!(attempts.early&&attempts.completion))continue;
        record.view.title=TITLE_FAILURE_REMINDER;
        this.save(record);
      }catch{/* A local conflict must not prevent recovery of unrelated records. */}
    }
    const candidates=this.options.repository.listInterrupted();
    const work=async()=>{
      let next=0;
      await Promise.all(Array.from({length:Math.min(2,candidates.length)},async()=>{
        while(next<candidates.length&&!this.closing){
          const candidate=candidates[next++]!,{workspaceId,id}=candidate.view;
          try{
            await this.reconcilePersisted(workspaceId,id);
            const current=this.load(workspaceId,id);
            if((current.view.run?.generation!==this.options.generation&&!this.options.generationAlive?.(current.view.run?.generation??''))||current.interruption?.runId===current.view.run?.id)await this.recoverOne(workspaceId,id);
          }catch{/* One unreadable or concurrently changed conversation must not block the rest. */}
        }
      }));
    };
    const recovery=work().finally(()=>{if(this.recoveryWork===recovery)this.recoveryWork=undefined;});
    this.recoveryWork=recovery;return recovery;
  }
  private recoverOne(workspaceId: string, id: string): Promise<void> {
    const key = `${workspaceId}/${id}`;
    const runId=this.load(workspaceId,id).view.run?.id;
    const existing = this.recoveries.get(key);
    if (existing) return existing.runId===runId ? existing.work : existing.work.then(()=>this.recoverOne(workspaceId,id));
    const work = this.recoverRun(workspaceId, id).finally(() => { if (this.recoveries.get(key)?.work === work) this.recoveries.delete(key); this.scheduleSourceRelease(workspaceId, id); });
    this.recoveries.set(key, {runId,work}); return work;
  }
  private async recoverRun(workspaceId:string,id:string):Promise<void>{
    let record=this.load(workspaceId,id),run=record.view.run;
    if(!run || !run.accepted || this.closing || (run.generation===this.options.generation && !record.interruption))return;
    if(!record.interruption){
      // Only an accepted active execution is attributable to an abrupt host loss.
      if (run.accepted && run.status === 'unknown') {
        // Legacy unknown states have no trustworthy system-interruption provenance.
        await this.observe(workspaceId, id); return;
      }
      if(!run.accepted||!['running','waiting-approval','waiting-question','tools-active'].includes(run.status))return;
      record.interruption={runId:run.id,awaitingUser:record.view.requests.some(request=>request.runId===run!.id)||run.status!=='running'};
      run.interrupted=true;run.diagnostic='服务重启导致执行中断，正在核对原执行。';this.save(record);
    }
    const originalId=run.id,marker=record.interruption;
    if(marker.runId!==originalId||marker.cancelled||run.status==='completed'||run.status==='failed'&&marker.reason!=='execution-fault')return;
    const requestId='host-recovery:'+originalId;
    if(record.attempts.some(attempt=>attempt.clientRequestId===requestId))return;
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
      if(this.closing||!run||run.id!==originalId||!record.interruption||record.interruption.cancelled)return;
      if(run.status==='completed'||run.status==='failed'&&marker.reason!=='execution-fault')return;
      if(run.generation===this.options.generation&&run.status==='running'){
        delete record.interruption;run.interrupted=undefined;run.diagnostic=undefined;this.save(record);return;
      }
    if(!this.options.autoContinueInterrupted){unavailable('系统中断后执行未完成。工作记录已保留，你可以发送“继续”接着处理。');return;}
      if(marker.awaitingUser){unavailable('执行未完成：中断前有待确认的问题或授权，请查看原问题后继续。');return;}
      const stopped=run.status==='stopped'&&run.tools.every(tool=>tool.status==='completed');
      const released=run.resourcesReleased===true&&run.tools.every(tool=>tool.status!=='running');
      if(run.generation!==this.options.generation||!stopped&&!released||record.view.requests.some(request=>request.runId===originalId)){unavailable('执行未完成：正在核对原执行及控制资源，已有操作结果保留，不重复操作。');return;}
      const participant=record.participants.find(value=>value.id===run!.participantId);
      if(!participant?.contextRef)throw new Error('agent_context_binding_mismatch');
      const attempt=record.attempts.find(value=>value.runId===originalId)!;
      const lineage=attempt.automaticRetry??{rootRunId:originalId,count:0};
      if(!record.interruption.attempted && lineage.count>=RETRY_DELAYS.length){unavailable(`自动恢复已达上限（${RETRY_DELAYS.length} 次），已有成果保留；请核对持续失败的原因。`);return;}
      if(!record.interruption.attempted && lineage.count>0){
        await new Promise(resolve=>setTimeout(resolve,RETRY_DELAYS[lineage.count-1]));
        record=this.load(workspaceId,id);run=record.view.run;
        if(this.closing||run?.id!==originalId||!record.interruption||record.interruption.cancelled)return;
      }
      const unknown=run.tools.filter(tool=>tool.status==='unknown').map(tool=>tool.id);
      const text='系统自动恢复：上次执行因 Buildr '+(marker.reason==='execution-fault'?'执行协议或运行通道异常':marker.reason==='transport'?'执行观察中断':'服务重启')+'而中断，'+(released?'准确原控制资源已释放，原执行及独立操作结果仍可能未知。':'现已确认原执行停止。')+'请先核对本地对话、当前工作成果与工具结果，继续完成用户尚未完成的目标。不要重新执行全部历史命令，不重发原指令；不确定已生效的操作先核对，不扩大原有授权或代答问题。未知工具引用：'+(unknown.join('、')||'见原轮记录')+'。若需要真实用户决定，请明确提出。';
      const draft:SendDraft={expectedRevision:record.view.revision,connectionId:participant.connectionId,modelAccountId:participant.modelAccountId,modelAccountIdentity:participant.modelAccountIdentity,model:run.model,serviceTier:run.serviceTier,reasoningEffort:run.reasoningEffort,permissionMode:run.permissionMode??'default',text,skipHandoffSummary:true};
      this.prepare(record,draft);
      if(!record.interruption.attempted)record.attempts.find(value=>value.runId===originalId)!.automaticRetry={rootRunId:lineage.rootRunId,count:lineage.count+1};
      record.interruption.attempted=true;this.save(record);
      draft.expectedRevision=record.view.revision;
      this.send(workspaceId,id,{...draft,clientRequestId:requestId},true);
    }catch(error){unavailable('执行未完成，未能自动接续：'+safeDiagnostic(error));}
  }

  /** Missing old process metadata and changed login do not erase exact control-resource evidence. */
  private async reconcileReleasedControls(workspaceId:string,id:string,control?:{expectedRevision:string;runId:string;participantId:string;generation:string}):Promise<void>{
    let record=this.load(workspaceId,id);
    if(control){
      expected(record.view.revision,control.expectedRevision);
      const run=conversationRuns(record.view).find(run=>run.id===control.runId);
      if(!run||run.participantId!==control.participantId||run.generation!==control.generation)fail('agent_control_stale','原执行身份已变化，请重新读取。',409);
    }
    // A stop requested before acceptance leaves no native execution identity to
    // release. Once the waiting round no longer has an owner or in-flight work,
    // apply the same unconfirmed-stop settlement as stop/finalize so a restart
    // cannot leave the conversation pending forever. Delivery stays unknown.
    let settledUnaccepted=false;
    for(const saved of conversationRuns(record.view)){
      if(control&&saved.id!==control.runId||saved.resourcesReleased||saved.accepted||saved.stopRequested!==true||
        saved.generation===this.options.generation||this.workers.has(saved.id)||
        record.view.requests.some(request=>request.runId===saved.id)||
        saved.tools.some(tool=>tool.status!=='completed')||
        record.attempts.find(attempt=>attempt.runId===saved.id)?.executionRef||
        ['completed','failed','stopped'].includes(saved.status))continue;
      saved.status='stopped';saved.executionState='unknown';saved.canContinue=false;
      saved.diagnostic='已结束本轮等待；原输入是否送达仍未知，已有操作结果保留，不会重发。';
      saved.updatedAt=this.options.now();
      if(record.view.run?.id===saved.id)record.interruption={runId:saved.id,awaitingUser:false,cancelled:true};
      settledUnaccepted=true;
    }
    if(settledUnaccepted)this.save(record);
    // A read-only reopened runtime does not own the recorded old control group.
    // Only exact group evidence and the original live owner can decide release.
    for(const saved of conversationRuns(record.view)){
      if(control&&saved.id!==control.runId||saved.resourcesReleased||!saved.accepted||saved.generation===this.options.generation||!this.options.generationAlive||this.options.generationAlive(saved.generation)||record.view.requests.some(request=>request.runId===saved.id)||this.workers.has(saved.id))continue;
      const participant=record.participants.find(p=>p.id===saved.participantId),attempt=record.attempts.find(a=>a.runId===saved.id),revision=record.view.revision;
      if(!participant?.contextRef||!participant.bindingIdentity||!attempt?.executionRef)continue;
      const released=await this.options.connections.readReleasedControl(participant.connectionId,{bindingIdentity:participant.bindingIdentity,contextRef:participant.contextRef,executionRef:attempt.executionRef,cwd:record.view.cwd}).catch(()=>false);
      record=this.load(workspaceId,id);
      if(record.view.revision!==revision)return;
      if(!released||this.options.generationAlive(saved.generation)||this.workers.has(saved.id))continue;
      const run=conversationRuns(record.view).find(run=>run.id===saved.id)!;
      run.resourcesReleased=true;
      if(run.executionState!=='ended')run.executionState='unknown';
      if(BUSY_STATES.has(run.status)){
        run.status='unknown';run.canContinue=false;
        run.tools=run.tools.map(tool=>tool.status==='running'?{...tool,status:'unknown',canStop:false}:tool);
        run.diagnostic='准确原控制进程组已退出，控制资源已释放；原操作结果仍待核对，不会重发。';
      }
      this.save(record);
    }
  }

  /** Terminal facts do not require a live vendor channel or ownership of its controls. */
  async reconcilePersisted(workspaceId:string,id:string,control?:{expectedRevision:string;runId:string;participantId:string;generation:string}):Promise<boolean>{
    let record=this.load(workspaceId,id);
    const confirmed=new Set<string>();
    if(control){
      expected(record.view.revision,control.expectedRevision);
      const run=conversationRuns(record.view).find(value=>value.id===control.runId);
      if(!run||run.participantId!==control.participantId||run.generation!==control.generation)fail('agent_control_stale','原执行身份已变化，请重新读取。',409);
    }
    for(const run of conversationRuns(record.view)){
      if(control&&control.runId!==run.id||!run.accepted)continue;
      if(this.hasPersistedEnd(record,run)){confirmed.add(run.id);continue;}
      if(!BUSY_STATES.has(run.status)&&run.status!=='completed')continue;
      const participant=record.participants.find(value=>value.id===run.participantId);
      const attempt=record.attempts.find(value=>value.runId===run.id);
      if(!participant?.contextRef||!participant.bindingIdentity||!attempt?.executionRef)continue;
      const revision=record.view.revision;
      const gatewayIdentity=participant.modelAccountId&&participant.modelAccountIdentity&&participant.modelId&&participant.modelConfiguration!==undefined
        ?modelLeaseIdentity(participant.modelAccountId,participant.modelAccountIdentity,participant.modelId,id,participant.connectionId,participant.modelLeaseConfiguration??participant.modelConfiguration):undefined;
      if(participant.modelAccountId&&!gatewayIdentity)continue;
      let evidence;
      try{evidence=await this.options.connections.readPersistedExecution(participant.connectionId,{bindingIdentity:participant.bindingIdentity,contextRef:participant.contextRef,executionRef:attempt.executionRef,cwd:record.view.cwd,gatewayIdentity});}
      catch{continue; /* Native observation remains available; unsafe evidence never overrides it. */}
      if(!evidence||!['idle','stopped'].includes(evidence.observation.status)||evidence.observation.tools.some(tool=>tool.status!=='completed')||evidence.observation.executionRef?.id!==attempt.executionRef.id)continue;
      record=this.load(workspaceId,id);
      if(record.view.revision!==revision)return false;
      const current=conversationRuns(record.view).find(value=>value.id===run.id);
      const currentParticipant=record.participants.find(value=>value.id===participant.id);
      if(!current||!currentParticipant||current.participantId!==participant.id||!BUSY_STATES.has(current.status)&&current.status!=='completed')continue;
      let changed=false;
      for(const item of evidence.items)if(item.executionId===attempt.executionRef.id)changed=this.applyItem(record,currentParticipant,item,current.id)||changed;
      if(BUSY_STATES.has(current.status)){
        this.applyObservation(record,evidence.observation,current);
        const endedAt=evidence.endedAt,now=this.options.now();
        current.updatedAt=endedAt&&Date.parse(endedAt)>=Date.parse(current.startedAt)&&Date.parse(endedAt)<=Date.parse(now)?endedAt:now;
        if(record.interruption?.runId===current.id)delete record.interruption;
        delete current.interrupted;
        changed=true;
      }
      const currentAttempt=record.attempts.find(value=>value.runId===current.id)!;
      if(currentAttempt.persistedEnd!==currentAttempt.executionRef?.id){currentAttempt.persistedEnd=currentAttempt.executionRef!.id;changed=true;}
      if(changed)this.save(record);
      confirmed.add(current.id);
    }
    const selected=control?conversationRuns(record.view).find(run=>run.id===control.runId):record.view.run;
    // No evidence is not a successful read. Other providers must retain their
    // normal history reconciliation, including legacy identity repair.
    return Boolean(selected&&confirmed.has(selected.id)&&!unfinishedRun(selected)&&
      (control||conversationRuns(record.view).every(run=>!unfinishedRun(run))));
  }

  async observe(workspaceId: string, id: string): Promise<ConversationView> {
    await this.reconcileReleasedControls(workspaceId,id);
    if(await this.reconcilePersisted(workspaceId,id))return this.read(workspaceId,id,{compactTools:true});
    const key = `${workspaceId}/${id}`;
    const current = this.observations.get(key); if (current) return current;
    const work = this.reconcile(workspaceId, id).finally(() => { this.observations.delete(key); this.scheduleSourceRelease(workspaceId, id); }).then(view => {
      const marker = this.load(workspaceId, id).interruption;
      if (!this.closing && this.options.autoContinueInterrupted && !this.recoveries.has(key) && marker && !marker.cancelled && !marker.attempted && marker.runId === view.run?.id && (view.run?.status === 'stopped' || view.run?.resourcesReleased)) {
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
    for (const saved of record.participants) {
      if (!saved.contextRef) continue;
      const savedRun = conversationRuns(record.view).find(run => run.participantId === saved.id);
      if (savedRun && !savedRun.resourcesReleased && savedRun.generation !== this.options.generation && this.options.generationAlive?.(savedRun.generation)) continue;
      try {
        const runtime = (await this.sourceRuntime(record, saved)).runtime;
        if (runtime.bindingIdentity !== saved.bindingIdentity) fail('agent_binding_changed', '参与者的程序或原配置身份已失配。', 409);
        await runtime.resumeContext({ contextRef: saved.contextRef, cwd: record.view.cwd });
        const items = await runtime.readHistory({ contextRef: saved.contextRef, cwd: record.view.cwd });
        const run = conversationRuns(this.load(workspaceId, id).view).find(run => run.participantId === saved.id);
        const attempt = run ? this.load(workspaceId, id).attempts.find(value => value.runId === run.id) : undefined;
        const needsObservation = run?.participantId === saved.id && (BUSY_STATES.has(run.status) || Boolean(run.interrupted));
        const receiptRecord = this.load(workspaceId, id), prefix = `${saved.id}:tool:`, receiptEntries = new Map(receiptRecord.view.entries.map(entry => [entry.id, entry]));
        const knownItems: ExecutorItem[] = !needsObservation ? [] : Object.entries(receiptRecord.sources).flatMap(([source, entryId]) => {
          const entry = source.startsWith(prefix) ? receiptEntries.get(entryId) : undefined;
          return entry && entry.runId === run?.id && attempt?.executionRef ? [{ id: source.slice(prefix.length), kind: 'tool', role: 'system', text: entry.text, status: entry.status === 'completed' || entry.status === 'failed' ? entry.status : undefined, executionId: attempt.executionRef.id }] : [];
        });
        const observedRequests = hash(receiptRecord.view.requests);
        const observation = needsObservation ? await runtime.observe({ contextRef: saved.contextRef, executionRef: attempt?.executionRef, knownItems }) : undefined;
        record = this.load(workspaceId, id);
        const requestsUnchanged = hash(record.view.requests) === observedRequests;
        const participant = record.participants.find(value => value.id === saved.id)!;
        let changed = false;
        for (const item of items) changed = this.applyItem(record, participant, item) || changed;
        if (run?.participantId === participant.id && needsObservation) {
          const target = conversationRuns(record.view).find(value => value.id === run.id);
          if (target) {
            if (target.generation !== this.options.generation) this.retireQuestions(record,record.view.requests.filter(request=>request.runId===target.id));
            if (attempt?.executionRef && observation?.executionRef?.id !== attempt.executionRef.id) {
              target.status = 'unknown'; target.diagnostic = '原生观察未匹配本轮执行，不能据此结束或重新发送。';
            } else if (target.generation !== this.options.generation && !observation?.executionRef) {
              target.status = 'unknown'; target.diagnostic = '尚未确认原执行的准确身份，保留记录并重新观察。';
            } else {
              if (target.generation !== this.options.generation) {
                this.retireQuestions(record, record.view.requests.filter(request => request.runId === target.id));
                target.generation = this.options.generation;
              }
              this.applyObservation(record, requestsUnchanged ? observation! : { ...observation!, requests: undefined }, target);
            }
            changed = true;
          }
        }
        if (changed) this.save(record);
      } catch (error) {
        record = this.load(workspaceId, id);
        const target = conversationRuns(record.view).find(run => run.participantId === saved.id);
        if (target && unfinishedRun(target)) { target.status = 'unknown'; target.diagnostic = safeDiagnostic(error); this.save(record); }
      }
    }
    return this.read(workspaceId, id,{compactTools:true});
  }
  private control(workspaceId: string, id: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string }): { record: StoredConversation; participant: StoredParticipant; run: RunView; executionRef?: ReturnType<ConversationApplication['load']>['attempts'][number]['executionRef'] } {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    const run = conversationRuns(record.view).find(run => run.id === input.runId);
    if (!run || run.id !== input.runId || run.participantId !== input.participantId || run.generation !== input.generation || input.generation !== this.options.generation) fail('agent_control_stale', '本轮执行或服务代次已变化，请重新观察。', 409);
    const participant = record.participants.find(value => value.id === input.participantId)!;
    return { record, participant, run, executionRef: record.attempts.find(value => value.runId === input.runId)?.executionRef };
  }
  async observeRun(workspaceId: string, id: string, input: {expectedRevision:string;runId:string;participantId:string;generation:string}): Promise<ConversationView> {
    await this.reconcileReleasedControls(workspaceId,id,input);
    const released=this.load(workspaceId,id);
    const observed=conversationRuns(released.view).find(run=>run.id===input.runId);
    if(observed?.resourcesReleased||observed&&['completed','failed','stopped'].includes(observed.status))return this.view(released);
    const control = this.control(workspaceId,id,{...input,expectedRevision:released.view.revision});
    if (!control.executionRef || !control.participant.contextRef || control.run.resourcesReleased || !unfinishedRun(control.run)) return this.view(control.record);
    const runtime = (await this.sourceRuntime(control.record,control.participant)).runtime;
    const items = await runtime.readHistory({contextRef:control.participant.contextRef,cwd:control.record.view.cwd});
    const observedRequests = hash(this.load(workspaceId,id).view.requests);
    const observation = await runtime.observe({contextRef:control.participant.contextRef,executionRef:control.executionRef});
    this.retryRecordUpdate(()=>{
      const latest = this.ownedRun(workspaceId,id,input.runId);
      if (latest) {
        if (observation.executionRef?.id !== control.executionRef!.id) fail('agent_control_stale','观察未匹配原执行，保留原状态。',409);
        for (const item of items) this.applyItem(latest.record,control.participant,item);
        this.applyObservation(latest.record,hash(latest.record.view.requests) === observedRequests ? observation : {...observation,requests:undefined},latest.run); this.save(latest.record);
      }
    });
    return this.read(workspaceId,id,{compactTools:true});
  }
  async stop(workspaceId: string, id: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string; toolId?: string }): Promise<ConversationView> {
    const facts={workspaceId,conversationId:id,runId:input.runId,participantId:input.participantId,ownerGeneration:input.generation};
    this.diagnostics({...facts,event:'stop-request',reason:input.toolId?'individual-tool':'whole-run'});
    try{const view=await this.stopOwned(workspaceId,id,input),run=conversationRuns(view).find(r=>r.id===input.runId);this.diagnostics({...facts,event:'stop-result',status:run?.status,resourcesReleased:run?.resourcesReleased===true});return view;}
    catch(error){
      this.diagnostics({...facts,event:'stop-failed',code:diagnosticCode(error)});
      if(input.toolId||error instanceof AgentServiceError&&error.code==='agent_revision_conflict')throw error;
      const view=this.finalizeUnconfirmedStop(workspaceId,id,input);
      if(!view)throw error;
      const run=conversationRuns(view).find(value=>value.id===input.runId);
      this.diagnostics({...facts,event:'stop-result',status:run?.status,resourcesReleased:run?.resourcesReleased===true});
      return view;
    }
  }
  /**
   * A whole-run stop is a user end action, not a request whose failure leaves
   * the same stop control active forever. Keep the exact outcome unknown when
   * the native end cannot be proven, while durably recording the stop intent
   * and returning the latest conversation for the client to render.
   */
  private finalizeUnconfirmedStop(workspaceId:string,id:string,input:{runId:string;participantId:string}):ConversationView|undefined{
    let found=false;
    this.retryRecordUpdate(()=>{
      const record=this.load(workspaceId,id);
      const run=conversationRuns(record.view).find(value=>value.id===input.runId&&value.participantId===input.participantId);
      if(!run)return;
      found=true;
      run.stopRequested=true;run.canContinue=false;
      if(!['completed','failed','stopped'].includes(run.status)){
        const attempt=record.attempts.find(value=>value.runId===run.id);
        const endedWithoutIdentity=!this.workers.has(run.id)&&!attempt?.executionRef&&run.accepted===false;
        run.status=endedWithoutIdentity?'stopped':'unknown';
        run.executionState='unknown';
        run.diagnostic=endedWithoutIdentity
          ?'已结束本轮等待；原输入是否送达仍未知，已有操作结果保留，不会重发。'
          :'停止已请求，但未取得原生结束确认；原工作记录已保留，不会重发。';
        run.tools=run.tools.map(tool=>tool.status==='running'?{...tool,status:'unknown',canStop:false}:tool);
      }
      if(record.view.run?.id===run.id)record.interruption={runId:run.id,awaitingUser:false,cancelled:true};
      run.updatedAt=this.options.now();
      this.save(record);
    });
    if(!found)return;
    this.scheduleSourceRelease(workspaceId,id);
    return this.read(workspaceId,id,{compactTools:true});
  }
  private async stopOwned(workspaceId: string, id: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string; toolId?: string }): Promise<ConversationView> {
    if(!input.toolId&&input.generation!==this.options.generation){
      await this.reconcileReleasedControls(workspaceId,id,input);
      const released=this.load(workspaceId,id),run=conversationRuns(released.view).find(run=>run.id===input.runId);
      if(run?.resourcesReleased){
        run.stopRequested=true;
        if(released.view.run?.id===run.id)released.interruption={runId:run.id,awaitingUser:false,cancelled:true};
        this.save(released);return this.view(released);
      }
      input={...input,expectedRevision:released.view.revision};
    }
    const pending=this.load(workspaceId,id);
    const selected=conversationRuns(pending.view).find(run=>run.id===input.runId);
    const unbound=selected?.accepted===false && !pending.attempts.find(attempt=>attempt.runId===input.runId)?.executionRef && !selected.tools.length && !pending.view.requests.some(request=>request.runId===input.runId);
    if(!this.closing&&!input.toolId&&unbound&&selected!.generation!==this.options.generation){
      // The process router uses this only after the exact retained owner has
      // returned its stop result and confirmed no in-flight send remains.
      expected(pending.view.revision,input.expectedRevision);
      const run=selected!;
      if(run.participantId!==input.participantId||run.generation!==input.generation)fail('agent_control_stale','执行已变化，请重新核对。',409);
      run.stopRequested=true;
      if(pending.view.run?.id===run.id)pending.interruption={runId:run.id,awaitingUser:false,cancelled:true};
      const released=this.options.generationReleased?.(run.generation)===true;
      run.status=released?'stopped':'unknown';run.canContinue=false;run.executionState='unknown';
      if(released)run.resourcesReleased=true;
      run.diagnostic=released?'已停止本轮接续，原后台已确认退出；原输入是否送达仍未知，已有操作结果保留，不会重发。':'已取消本轮自动接续；未能确认原生执行身份或停止结果，工作记录已保留。';
      run.updatedAt=this.options.now();this.save(pending);return this.view(pending);
    }
    if(!this.closing&&!input.toolId&&pending.interruption?.runId===input.runId&&pending.view.run?.id===input.runId&&pending.view.run?.generation!==this.options.generation){
      expected(pending.view.revision,input.expectedRevision);
      const run=pending.view.run;
      if(!run||run.id!==input.runId||run.participantId!==input.participantId||run.generation!==input.generation)fail('agent_control_stale','执行已变化，请重新核对。',409);
      pending.interruption.cancelled=true;run.diagnostic='已取消自动接续；原执行状态仍待核对。';this.save(pending);return this.view(pending);
    }
    const control = this.control(workspaceId, id, input);
    if(!input.toolId){control.run.stopRequested=true;this.save(control.record);this.options.modelAccess?.leases.stopRun(id,input.runId);}
    if (!input.toolId) this.cancelledRetries.add(input.runId);
    const retry = this.retryWaits.get(input.runId);
    if (retry && !input.toolId) {
      control.run.status = 'stopped'; control.run.diagnostic = '已停止自动重试，工作记录已保留。';
      this.save(control.record); retry.abort(); this.retryWaits.delete(input.runId); return this.view(control.record);
    }
    if(!this.closing && !input.toolId && control.record.view.run?.id===input.runId){
      // The user's stop survives a missing acceptance receipt and process restarts.
      control.record.interruption={...(control.record.interruption?.runId===input.runId?control.record.interruption:{}),runId:input.runId,awaitingUser:false,cancelled:true};
      this.save(control.record);
    }
    if (control.run.resourcesReleased || !unfinishedRun(control.run)) return this.view(control.record);
    if (input.toolId) {
      if (control.run.tools.find(tool => tool.id === input.toolId)?.canStop !== true) fail('agent_tool_stop_unavailable', '此命令尚不支持单独停止，可停止本轮剩余执行。', 409);
    } else { control.run.status = 'stopping'; this.save(control.record); }
    if (!control.executionRef || !control.participant.contextRef) {
      // An in-flight send can still return its exact identity, where accepted
      // schedules the original stop. A settled lost receipt cannot do so.
      if (!input.toolId && !this.workers.has(input.runId)) {
        const endedWithoutIdentity=control.run.accepted===false;
        control.run.status=endedWithoutIdentity?'stopped':'unknown';control.run.executionState='unknown';control.run.canContinue=false;
        control.run.diagnostic=endedWithoutIdentity
          ?'已结束本轮等待；原输入是否送达仍未知，已有操作结果保留，不会重发。'
          :'停止已请求，但未取得原生执行身份；原工作记录已保留，不会重发。';
        control.run.tools=control.run.tools.map(tool=>tool.status==='running'?{...tool,status:'unknown',canStop:false}:tool);
        control.run.updatedAt=this.options.now();this.save(control.record);
        await this.releaseIdleSources({workspaceId,id});
        this.scheduleSourceRelease(workspaceId,id);
      }
      return this.read(workspaceId, id,{compactTools:true});
    }
    let observation: ExecutorObservation;
    try {
      const runtime = (await this.sourceRuntime(control.record, control.participant)).runtime;
      observation = await runtime.stop({ contextRef: control.participant.contextRef, executionRef: control.executionRef, toolId: input.toolId });
    }
    catch (error) {
      if (input.toolId) fail('agent_tool_stop_failed', '未能确认此命令已停止，原执行状态已保留，请重新核对。', 409);
      throw error;
    }
    try{this.retryRecordUpdate(()=>{
      const record=this.ownedRun(workspaceId,id,input.runId);
      if(record){this.applyObservation(record.record,observation,record.run);this.save(record.record);}
    });}catch{fail('agent_stop_result_unknown','停止请求已发出，记录结果尚未确认；不会自动重发。',503);}
    if (observation.status === 'running' || observation.status === 'unknown' || observation.status === 'tools-active') this.pollStop(workspaceId, id, input.runId);
    return this.read(workspaceId, id,{compactTools:true});
  }
  private endReplacedQuestions(record: StoredConversation, runId: string): void {
    const next = record.attempts.find(attempt => attempt.runId === runId);
    if (!next?.accepted) return;
    for (const wait of next.questionWaits ?? []) {
      const old = conversationRuns(record.view).find(run => run.id === wait.runId);
      if (!old) continue;
      old.questionsEndedBy ??= runId;
      this.retireQuestions(record, record.view.requests.filter(request => request.runId === wait.runId && request.kind === 'question'));
    }
  }
  private scheduleQuestionWaitReleases(record: StoredConversation): void {
    for (const attempt of record.attempts.filter(value => !value.questionReleaseRequested && conversationRuns(record.view).some(run => run.id === value.runId && run.questionsEndedBy))) {
      const old = conversationRuns(record.view).find(run => run.id === attempt.runId);
      if (!old || !unfinishedRun(old) || old.tools.some(tool => tool.status !== 'completed')) continue;
      const key = record.view.id + '/' + old.id;
      if (this.questionReleases.has(key) || this.closing) continue;
      const work = Promise.resolve().then(async () => {
        const fresh = this.load(record.view.workspaceId, record.view.id);
        const input = { expectedRevision: fresh.view.revision, runId: old.id, participantId: old.participantId, generation: old.generation };
        const invoke = () => this.options.controlSupersededRun
          ? this.options.controlSupersededRun(fresh.view.workspaceId, fresh.view.id, input, 'release-question-wait')
          : this.releaseQuestionWait(fresh.view.workspaceId, fresh.view.id, input);
        try { await invoke(); }
        catch (error) {
          const latest = this.load(fresh.view.workspaceId, fresh.view.id);
          // A callback may conflict after an actual native effect. Only retry
          // version admission when the durable effect intent is still absent.
          if (error instanceof AgentServiceError && error.code === 'agent_revision_conflict' &&
              !latest.attempts.find(value => value.runId === old.id)?.questionReleaseRequested) {
            input.expectedRevision = latest.view.revision; await invoke();
          }
        }
      }).catch(() => { /* Exact owner keeps unknown results; never repeat a possible effect. */ })
        .finally(() => this.questionReleases.delete(key));
      this.questionReleases.set(key, work);
    }
  }
  /** Internal authenticated control; cannot stop tools or grant an unanswered request. */
  async releaseQuestionWait(workspaceId: string, id: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string }): Promise<ConversationView> {
    let record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    const old = conversationRuns(record.view).find(run => run.id === input.runId);
    const attempt = record.attempts.find(attempt => attempt.runId === input.runId);
    const next = record.attempts.find(value => value.questionWaits?.some(wait => wait.runId === input.runId) &&
      (value.accepted || record.view.run?.id === value.runId && value.questionWaits.some(wait => wait.runId === input.runId && wait.reuse)));
    const wait = next?.questionWaits?.find(value => value.runId === input.runId);
    if (!old || !attempt?.executionRef || !next || !wait || old.participantId !== input.participantId || old.generation !== input.generation || input.generation !== this.options.generation)
      fail('agent_question_transition_stale', '原问题接续身份已变化，未释放其他执行。', 409);
    if (attempt.questionReleaseRequested || !unfinishedRun(old) || old.tools.some(tool => tool.status !== 'completed')) return this.view(record);
    const participant = record.participants.find(value => value.id === old.participantId)!;
    if (!participant.contextRef) return this.view(record);
    const runtime = (await this.sourceRuntime(record, participant)).runtime;
    if (wait.reuse && !runtime.endQuestionWait) fail('agent_question_transition_unsupported', '当前适配器未提供已声明的问题释放能力，新要求未向原生发送。', 409);
    let observation: ExecutorObservation | undefined;
    let dispatched = false;
    try { observation = await releaseQuestionWait(runtime, { contextRef: participant.contextRef, executionRef: attempt.executionRef, requestIds: wait.requests.map(request => request.nativeId) }, () => {
      record = this.load(workspaceId, id);
      const current = record.attempts.find(value => value.runId === input.runId)!;
      const receiving = record.attempts.find(value => value.runId === next.runId);
      const run = conversationRuns(record.view).find(value => value.id === input.runId);
      if (!run || run.participantId !== input.participantId || run.generation !== input.generation || run.tools.some(tool => tool.status !== 'completed') ||
          current.questionReleaseRequested || wait.requests.some(request => this.repliesInFlight.has(request.id)) ||
          !(receiving?.accepted || record.view.run?.id === next.runId && wait.reuse))
        fail('agent_question_transition_stale', '原问题或接续请求已变化，未重复释放。', 409);
      if (record.view.requests.some(request => request.runId === input.runId && (request.kind !== 'question' || !wait.requests.some(known => known.id === request.id))))
        fail('agent_question_transition_stale', '原执行出现新的交互，未释放。', 409);
      current.questionReleaseRequested = true; this.save(record); dispatched = true;
    }); } catch (error) {
      if (dispatched) {
        record = this.load(workspaceId, id);
        const current = conversationRuns(record.view).find(value => value.id === input.runId);
        if (current && !['completed','stopped'].includes(current.status)) {
          current.status = 'unknown'; current.executionState = 'unknown'; current.diagnostic = '问题等待释放结果尚未确认：' + safeDiagnostic(error); this.save(record);
        }
      }
      throw error;
    }
    record = this.load(workspaceId, id);
    if (dispatched && !observation) { record.attempts.find(value => value.runId === input.runId)!.questionReleaseRequested = false; this.save(record); }
    const run = conversationRuns(record.view).find(value => value.id === input.runId);
    if (run && observation) {
      this.applyObservation(record, observation, run);
      if (['idle','stopped'].includes(observation.status) && !observation.backgroundWork && observation.tools.every(tool => tool.status === 'completed')) {
        run.questionsEndedBy ??= next.runId;
        this.retireQuestions(record, record.view.requests.filter(request => request.runId === input.runId && request.kind === 'question'));
      }
      this.save(record);
    }
    return this.view(record);
  }

  /** Persist intent before native effects. A restart observes an uncertain stop, never replays it. */
  private cleanupSuperseded(workspaceId:string,id:string):Promise<void> {
    const key=workspaceId+'/'+id,existing=this.supersededCleanups.get(key);
    if(existing)return existing;
    const work=(async()=>{
      const handled=new Set<string>();
      for(;;){
        if(this.closing)return;
        let record=this.load(workspaceId,id),run=conversationRuns(record.view).find(value=>value.supersededBy&&!handled.has(value.id));
        if(!run)return;
        const runId=run.id;handled.add(runId);
        const attempt=record.attempts.find(value=>value.runId===runId);
        if(!run?.supersededBy||!attempt||run.resourcesReleased||!unfinishedRun(run))continue;
        const action=attempt.supersededStopRequested||run.stopRequested?'observe':'stop';
        if(action==='stop')this.retryRecordUpdate(()=>{
          record=this.load(workspaceId,id);run=conversationRuns(record.view).find(value=>value.id===runId);
          if(!run?.supersededBy)return;
          const latestAttempt=record.attempts.find(value=>value.runId===runId)!;
          latestAttempt.supersededStopRequested=true;this.save(record);
        });
        if(!run?.supersededBy)continue;
        const control=()=>({expectedRevision:record.view.revision,runId,participantId:run!.participantId,generation:run!.generation});
        const invoke=()=>this.options.controlSupersededRun
          ?this.options.controlSupersededRun(workspaceId,id,control(),action)
          :action==='stop'?this.stop(workspaceId,id,control()):this.observeRun(workspaceId,id,control());
        try{await invoke();}
        catch(error){
          // Re-read the same owner. An admitted stop can throw a revision conflict
          // from its event consumer after the native effect; never repeat it.
          if(error instanceof AgentServiceError&&error.code==='agent_revision_conflict'){
            record=this.load(workspaceId,id);const latest=conversationRuns(record.view).find(value=>value.id===runId);
            if(latest?.participantId===run.participantId&&latest.generation===run.generation&&(action==='observe'||latest.stopRequested!==true)){run=latest;try{await invoke();}catch{/* Preserve the exact unknown; never resend a possible effect. */}}
          }
        }
      }
    })().finally(()=>{this.supersededCleanups.delete(key);this.scheduleSourceRelease(workspaceId,id);});
    this.supersededCleanups.set(key,work);return work;
  }
  private pollStop(workspaceId: string, id: string, runId: string): void {
    const deadline = Date.now() + 10_000;
    const poll = async () => {
      const current = this.ownedRun(workspaceId, id, runId);
      if (!current || !unfinishedRun(current.run) || Date.now() >= deadline || this.closing) return;
      await this.observeRun(workspaceId, id, {expectedRevision:current.record.view.revision,runId,participantId:current.run.participantId,generation:current.run.generation});
      const timer = setTimeout(() => { void poll().catch(() => {}); }, 250); timer.unref();
    };
    void poll().catch(() => {});
  }
  async reply(workspaceId: string, id: string, requestId: string, input: { expectedRevision: string; runId: string; participantId: string; generation: string; answer: unknown }): Promise<ConversationView> {
    const control = this.control(workspaceId, id, input);
    const request = control.record.view.requests.find(value => value.id === requestId);
    const binding = control.record.requests[requestId];
    if (!request || !binding || request.runId !== control.run.id || request.participantId !== control.participant.id || binding.executionRef.id !== control.executionRef?.id || !control.participant.contextRef || request.generation !== this.options.generation) fail('agent_request_stale', '此问题或授权已失效，请重新观察。', 409);
    if (control.record.attempts.find(attempt => attempt.runId === input.runId)?.questionReleaseRequested) fail('agent_question_transition_in_flight', '原问题正在结束等待，回答已保留；请核对原问题状态。', 409);
    if (this.repliesInFlight.has(requestId)) fail('agent_reply_in_flight', '此请求正在回应，请等待原结果。', 409);
    if (this.pendingSends.read(workspaceId,id)?.draft.waitingHandoff) fail('agent_handoff_pending', '已保存交接，回答将交给新模型；如要回应原轮，请先取消待发送。', 409);
    this.repliesInFlight.add(requestId);
    try {
    const runtime = (await this.sourceRuntime(control.record, control.participant)).runtime;
    // Recheck after asynchronous connection setup before causing a native effect.
    const fresh = this.load(workspaceId, id);
    if (this.pendingSends.read(workspaceId,id)?.draft.waitingHandoff) fail('agent_handoff_pending', '已保存交接，请先取消后再回应原轮。', 409);
    if (fresh.attempts.find(attempt => attempt.runId === input.runId)?.questionReleaseRequested) fail('agent_question_transition_in_flight', '原问题正在结束等待，未向原生重复提交回答。', 409);
    if (!fresh.requests[requestId] || conversationRuns(fresh.view).some(run=>run.id===input.runId&&run.supersededBy) || !conversationRuns(fresh.view).some(run => run.id === input.runId)) fail('agent_request_stale', '此交互已变化。', 409);
    const resolved = resolveQuestionAnswer(request,input.answer,ids=>this.media.expand(fresh,ids));
    if(resolved.attachmentIds.length){
      const connection=this.options.connections.get(control.participant.connectionId);
      const source=control.participant.modelAccountId?this.options.modelAccess?.accounts.snapshot(control.participant.modelAccountId):undefined;
      if(!connection.capabilities.images||source&&!source.models.find(model=>model.id===control.participant.modelId)?.images)fail('agent_capability_unavailable','当前执行的模型不支持图片，回答已保留。',409);
      if(resolved.images.length>MAX_VISUAL_INPUTS||resolved.images.some(image=>fresh.attachments[image.id]!.size>(connection.capabilities.maxImageBytes??MAX_IMAGE_BYTES))||resolved.images.reduce((sum,image)=>sum+fresh.attachments[image.id]!.size,0)>32*1024*1024)fail('agent_image_invalid','图片或视频画面超过当前接入容量，回答已保留。',413);
    }
    const answerText=JSON.stringify({请求标识:requestId,问题:request.title,说明:request.description,问题列表:request.questions,选项:request.options,回答:resolved.answer,...(resolved.attachmentIds.length?{显示回答:questionAnswerDisplay(input.answer)}:{}),授权性质:request.kind==='approval'?'仅原请求及其明确范围，不自动扩展到后续执行方或重放':'用户答复'});
    if(Buffer.byteLength(answerText)>MAX_TEXT_BYTES)fail('agent_reply_too_large','回答过长，请缩小后重试。',413);
    const baseReplyId='reply-'+requestId;const priorReply=fresh.view.entries.find(e=>e.id===baseReplyId);
    const replyId=priorReply&&priorReply.text!==answerText?baseReplyId+'-'+hash(answerText):baseReplyId;
    if(!fresh.view.entries.some(e=>e.id===replyId)){fresh.view.entries.push({id:replyId,sequence:(fresh.view.entries.at(-1)?.sequence??0)+1,kind:'notice',role:'user',text:answerText,attachments:resolved.attachmentIds,runId:input.runId,participantId:input.participantId,status:'sending',createdAt:this.options.now()});this.save(fresh);}
    try{await runtime.reply({ contextRef: control.participant.contextRef, executionRef: binding.executionRef, requestId: binding.nativeId, answer: resolved.answer });}
    catch(error){const latest=this.load(workspaceId,id);const answer=latest.view.entries.find(e=>e.id===replyId);if(answer){answer.status='unknown';this.save(latest);}throw error;}
    const owned = this.ownedRun(workspaceId, id, input.runId);
    const record = owned?.record;
    if (record && owned) { const answer=record.view.entries.find(e=>e.id===replyId);if(answer)answer.status='accepted';delete record.requests[requestId]; record.view.requests = record.view.requests.filter(value => value.id !== requestId); if (['waiting-approval', 'waiting-question'].includes(owned.run.status)) owned.run.status = this.waitingStatus(record, owned.run.id) ?? 'running'; this.save(record); }
    return this.read(workspaceId, id,{compactTools:true});
    } finally { this.repliesInFlight.delete(requestId); this.scheduleSourceRelease(workspaceId, id); }
  }

  addAttachment(workspaceId: string, id: string, input: AttachmentInput) {
    const record = this.load(workspaceId, id);
    return this.media.add(record, input, [...(this.pendingSends.read(workspaceId, id)?.draft.attachmentIds ?? []), ...(this.pendingSends.read(workspaceId,id)?.draft.waitingHandoff?.answers ?? []).flatMap(item=>answerAttachmentIds(item.answer))]);
  }
  readAttachment(workspaceId: string, id: string, attachmentId: string): { bytes: Buffer; mimeType: string; name?: string } {
    const record=this.options.repository.readState(id);
    if(!record||record.view.workspaceId!==workspaceId)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
    return this.media.read(record, attachmentId);
  }
  subscribe(workspaceId: string, id: string, options:{compactTools?:boolean}={}) {
    const conversation = this.read(workspaceId, id,options);
    return this.options.events.subscribe({ type: 'snapshot', workspaceId, conversationId: id, revision: conversation.revision, payload: { conversation } }, event => event.workspaceId === workspaceId && event.conversationId === id);
  }
  async releaseForProgramUpgrade(connectionId: string): Promise<boolean> {
    await this.releaseIdleSources();
    if ([...this.sourceConnections].some(([id, connection]) => connection === connectionId && this.sourceRuntimes.has(id))) return false;
    return !this.options.repository.listPendingStates(true).some(record => {
      return conversationRuns(record.view).some(run => {
        // A dead generation cannot still own the program: its unconfirmed record
        // stays visible, but it must not hold every future upgrade forever.
        const alive = run.generation === this.options.generation || this.options.generationAlive?.(run.generation) === true;
        const unfinished = !run.resourcesReleased && unfinishedRun(run) || record.view.requests.some(request => request.runId === run.id);
        return alive && unfinished && record.participants.some(item => item.id === run.participantId && item.connectionId === connectionId);
      });
    });
  }

  async closeConnection(connectionId: string): Promise<void> {
    for (const saved of this.options.repository.listPendingStates(true)) {
      for (const prior of conversationRuns(saved.view)) {
        const record = this.load(saved.view.workspaceId,saved.view.id);
        const run = conversationRuns(record.view).find(run=>run.id===prior.id)!;
        const participant = record.participants.find(value=>value.id===run.participantId);
        if (run.generation !== this.options.generation || participant?.connectionId !== connectionId || !unfinishedRun(run)) continue;
        try { await this.stop(record.view.workspaceId,record.view.id,{expectedRevision:record.view.revision,runId:run.id,participantId:run.participantId,generation:run.generation}); }
        catch { const latest=this.ownedRun(record.view.workspaceId,record.view.id,run.id);if(latest){latest.run.status='unknown';latest.run.diagnostic='断开时未能确认原生执行退出。';this.save(latest.record);} }
      }
    }
    for (const [id, sourceConnection] of this.sourceConnections) if (!this.closing && sourceConnection === connectionId) { this.sourceRuntimes.delete(id); this.sourceOwners.delete(id); this.sourceConnections.delete(id); }
  }
  async close(): Promise<void> {
    this.closing = true;
    this.streamingRecords.clear();
    clearInterval(this.liveToolTimer);this.liveTools.clear();
    await Promise.allSettled([...this.supersededCleanups.values(), ...this.questionReleases.values()]);
    clearInterval(this.idleTimer);
    for (const timer of this.idleReleaseTimers.values()) clearTimeout(timer);
    this.idleReleaseTimers.clear();
    for (const controller of this.retryWaits.values()) controller.abort();
    for (const record of this.options.repository.listPending(true)) if (record.view.run?.generation === this.options.generation && this.retryWaits.has(record.view.run.id)) {
      record.view.run.status = 'failed'; record.view.run.diagnostic = '宿主退出，自动重试已取消；工作记录已保留。'; this.save(record);
    }
    this.retryWaits.clear();
    for (const controller of this.titleWork.values()) controller.abort();
    // A retained unknown turn can keep the conversation in listPending even
    // after its current turn has finished. Never turn that completion into a
    // new host interruption, or reset an existing cancellation/recovery budget.
    const owned = this.options.repository.listPending(true).filter(record => record.view.run && unfinishedRun(record.view.run) && !record.view.run.resourcesReleased && (!this.options.generationAlive || record.view.run.generation === this.options.generation));
    const interrupted=owned.map(record=>({workspaceId:record.view.workspaceId,id:record.view.id,runId:record.view.run?.id}));
    for (const record of owned) {
      if (record.view.run) {
        if(record.view.run.accepted && ['running','waiting-approval','waiting-question','tools-active'].includes(record.view.run.status)){
          if(record.interruption?.runId!==record.view.run.id)record.interruption={runId:record.view.run.id,awaitingUser:record.view.requests.some(request=>request.runId===record.view.run!.id)||['waiting-approval','waiting-question'].includes(record.view.run.status)};
          record.view.run.interrupted=true;
        }
        record.view.run.status = 'unknown'; record.view.run.diagnostic = '宿主正在退出，原生执行尚待确认。'; this.save(record); }
    }
    const ids = new Set(this.options.repository.listPendingStates(true).flatMap(record => conversationRuns(record.view).filter(run=>run.generation===this.options.generation).flatMap(run=>record.participants.find(value=>value.id===run.participantId)?.connectionId??[])));
    await Promise.allSettled([...ids].map(id => this.closeConnection(id)));
    for(const item of interrupted){const record=this.load(item.workspaceId,item.id);if(record.view.run?.id===item.runId&&record.view.run&&['stopped','unknown','tools-active','stopping'].includes(record.view.run.status)){record.view.run.diagnostic=record.view.run.status==='stopped'?'宿主退出导致执行停止；这不是用户主动停止。':'宿主退出后原执行仍待核对，不能重复发送。';this.save(record);}}
  }
}

/** A native Qoder lease is only meaningful for the product that produced it. */
function nativeLeaseProvider(provider:string):'qoder'|'qoder-cn'|undefined {
  if(provider==='native-qoder')return 'qoder';
  if(provider==='native-qoder-cn')return 'qoder-cn';
  return undefined;
}
