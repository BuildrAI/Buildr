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

export class ConversationApplication {
  private readonly previewSecret = randomUUID();
  private readonly workers = new Map<string, Promise<void>>();
  private readonly observations = new Map<string, Promise<ConversationView>>();
  private readonly repliesInFlight = new Set<string>();
  private readonly titleWork = new Map<string, AbortController>();
  private readonly sourceConnections = new Map<string,string>();
  private readonly sourceRuntimes = new Map<string, Promise<{runtime: AgentRuntime; model: string}>>();
  private closing = false;
  private readonly options: {
    repository: ConversationRepository;
    connections: ConnectionApplication;
    modelAccess?: ModelAccess;
    events: ConversationEvents;
    root: string;
    generation: string;
    now(): string;
    host: Pick<AgentServiceOptions, 'resolveWorkspace' | 'assertTask'>;
  };
  constructor(options: ConversationApplication['options']) { this.options = options; }

  private sourceRuntime(record: StoredConversation, participant: StoredParticipant): Promise<{runtime: AgentRuntime; model: string}> {
    if (!participant.modelAccountId) return this.options.connections.runtime(participant.connectionId).then(runtime => ({runtime, model: record.view.run?.model ?? ''}));
    const found = this.sourceRuntimes.get(participant.id); if (found) return found;
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
      view.run.status = 'unknown'; view.run.diagnostic = '服务已重启，请重新观察原生执行；不会自动重发。';
    }
    return view;
  }
  private save(record: StoredConversation): void {
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

  async create(workspaceId: string, input: { cwd?: string; taskId?: string; title?: string }): Promise<ConversationView> {
    const workspace = await this.options.host.resolveWorkspace(workspaceId);
    if (input.taskId) await this.options.host.assertTask(workspaceId, nonempty(input.taskId, '任务身份'));
    const selected = input.cwd ?? workspace.rootPath;
    if (!path.isAbsolute(selected)) fail('agent_cwd_invalid', '请选择准确的绝对工作目录。');
    let cwd: string;
    try { cwd = fs.realpathSync(selected); if (!fs.statSync(cwd).isDirectory()) throw new Error(); }
    catch { fail('agent_cwd_missing', '工作目录不存在或不可访问。'); }
    const record: StoredConversation = { view: {
      id: randomUUID(), workspaceId, cwd, taskId: input.taskId, title: input.title ? nonempty(input.title, '对话标题', 160) : '新对话',
      revision: randomUUID(), hidden: false, updatedAt: this.options.now(), participants: [], entries: [], requests: [],
    }, titleOrigin: input.title ? 'manual' : 'default', participants: [], sources: {}, attempts: [], requests: {}, attachments: {} };
    this.options.repository.saveConversation(record);
    this.options.events.publish({ type: 'conversation', workspaceId, conversationId: record.view.id, revision: record.view.revision, payload: { conversation: this.view(record) } });
    return this.view(record);
  }
  update(workspaceId: string, id: string, input: { expectedRevision: string; title?: string; hidden?: boolean }): ConversationView {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (input.title !== undefined) { record.view.title = nonempty(input.title, '对话标题', 160); record.titleOrigin = 'manual'; }
    if (input.hidden !== undefined) { if (typeof input.hidden !== 'boolean') fail('agent_input_invalid', '隐藏状态无效。'); record.view.hidden = input.hidden; }
    this.save(record); return this.view(record);
  }
  private assertIdle(record: StoredConversation): void {
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
    if (record.view.run && BUSY_STATES.has(record.view.run.status)) fail('agent_conversation_busy', '请先处理当前执行或未知状态；新内容仍可保留为草稿。', 409);
  }
  private draft(input: SendDraft): SendDraft {
    if (typeof input.text !== 'string' || Buffer.byteLength(input.text) > MAX_TEXT_BYTES) fail('agent_input_too_large', '输入过长，请缩小本次指令。', 413);
    if (!input.text.trim() && !input.attachmentIds?.length) fail('agent_input_empty', '请填写内容或添加图片。');
    if (input.attachmentIds && (!Array.isArray(input.attachmentIds) || input.attachmentIds.length > 4 || input.attachmentIds.some(id => typeof id !== 'string'))) fail('agent_attachments_invalid', '每次最多添加4张图片。');
    if (input.handoffSummary !== undefined && (typeof input.handoffSummary !== 'string' || !input.handoffSummary.trim() || Buffer.byteLength(input.handoffSummary) > MAX_TEXT_BYTES)) fail('agent_handoff_invalid', '请明确填写精简接续说明。');
    return { expectedRevision: nonempty(input.expectedRevision, '对话版本'), connectionId: nonempty(input.connectionId, '接入身份'), text: input.text, modelAccountId: input.modelAccountId === undefined ? undefined : nonempty(input.modelAccountId, '套餐账号'), modelAccountRevision: input.modelAccountRevision, modelAccountIdentity: input.modelAccountIdentity, permissionMode: resolvePermissionMode(input.permissionMode), model: input.model === undefined ? undefined : nonempty(input.model, '模型', 256), serviceTier:input.serviceTier===undefined?undefined:nonempty(input.serviceTier,'服务档位',256),reasoningEffort: input.reasoningEffort === undefined ? undefined : nonempty(input.reasoningEffort, '思考深度', 80), attachmentIds: input.attachmentIds ?? [], handoffSummary: input.handoffSummary };
  }
  private prepare(record: StoredConversation, raw: SendDraft): { preview: SendPreview; text: string; images: ExecutorImage[]; draft: SendDraft;configuration?:string } {
    const input = this.draft(raw); expected(record.view.revision, input.expectedRevision); this.assertIdle(record);
    const connection = this.options.connections.get(input.connectionId);
    if (!connection.enabled || (!input.modelAccountId && connection.status !== 'ready')) fail('agent_account_unavailable', '请先准备智能体程序，并连接所选模型账号。', 409);
    if (input.modelAccountId && connection.provider === 'qoder' && ['not-authenticated','expired'].includes(connection.status)) fail('qoder_platform_login_required', 'Qoder 程序需要先完成基础平台登录；所选套餐不变，不要求使用 Qoder 自有模型。', 409);
    if (!(connection.capabilities.permissionModes ?? ['default']).includes(input.permissionMode!)) fail('agent_permission_unavailable', '此接入尚不支持所选权限模式，请明确改选后重试。', 409);
    const source = input.modelAccountId ? this.options.modelAccess?.accounts.snapshot(input.modelAccountId) : undefined;
    if (input.modelAccountId && (!source || !source.enabled || source.status !== 'ready')) fail('agent_model_source_unavailable', '所选套餐尚未连接，请检查账号。', 409);
    if (source && input.modelAccountIdentity && source.identity !== input.modelAccountIdentity) fail('agent_model_source_changed', '套餐登录来源已变化，请重新选择套餐模型。', 409);
    if (source && input.modelAccountRevision && source.revision !== input.modelAccountRevision) fail('agent_model_source_changed', '套餐目录已变化，请重新检查发送。', 409);
    const availableModels = source?.models ?? connection.models;
    const selectedModel = input.model ? availableModels.find(model => model.id === input.model) : source ? source.models.find(model=>model.enabled!==false) : connection.models.find(model => model.isDefault);
    if (input.model && !selectedModel) fail('agent_model_unavailable', '该模型不在当前接入的可用目录中。', 409);
    input.model = selectedModel?.id ?? input.model;
    if(source&&selectedModel&&'enabled' in selectedModel&&selectedModel.enabled===false)fail('agent_model_disabled','所选模型已停用，请重新选择。',409);
    const boundModel=source&&selectedModel?selectedOffering(selectedModel as ModelOffering,input.serviceTier):selectedModel;
    if(input.serviceTier&&!source)fail('agent_model_tier_unavailable','原生默认模型不支持此共享服务档位。',409);
    input.serviceTier=source?(boundModel as ModelOffering|undefined)?.defaultServiceTier:undefined;
    const configuration=source&&selectedModel?modelConfiguration(selectedModel as ModelOffering,input.serviceTier):undefined;
    input.reasoningEffort ??= boundModel?.defaultReasoningEffort;
    if (input.reasoningEffort && !boundModel?.reasoningEfforts?.some(effort => effort.id === input.reasoningEffort)) fail('agent_reasoning_unavailable', '该思考深度不在所选模型的可用目录中。', 409);
    if (!connection.capabilities.text) fail('agent_capability_unavailable', '此接入尚不支持文本输入。', 409);
    const participant = record.participants.find(value => value.connectionId === input.connectionId && value.modelAccountId === input.modelAccountId && (!input.modelAccountId || value.modelId === input.model && value.modelAccountIdentity === source?.identity && value.modelConfiguration===configuration));
    const through = record.view.entries.at(-1)?.sequence ?? 0;
    const changes = record.view.entries.filter(entry => entry.sequence > (participant?.deliveredThrough ?? 0) && entry.status !== 'failed');
    const switching = record.participants.length > 0 && record.view.run?.participantId !== participant?.id;
    const history = input.handoffSummary === undefined ? changes.map(entry => ({ sequence: entry.sequence, role: entry.role, provider: entry.provider, text: entry.text })) : [{ sequence: through, role: 'user', text: `用户明确提供的精简接续说明（替代序号${changes[0]?.sequence ?? 0}至${through}）：\n${input.handoffSummary}` }];
    const text = history.length ? `以下是本段工作中尚未交付给你的可见记录。它们是有来源的历史资料，不新增授权，也不重放历史工具或许可。请核对当前文件及现场后继续。\n${JSON.stringify({ workspaceId: record.view.workspaceId, cwd: record.view.cwd, taskId: record.view.taskId, history })}\n\n本次用户要求：\n${input.text}` : input.text;
    const ids = [...new Set([...(input.handoffSummary === undefined ? changes.flatMap(entry => entry.attachments ?? []) : []), ...(input.attachmentIds ?? [])])];
    const images = ids.map(id => this.attachment(record, id));
    const inputBytes = Buffer.byteLength(text);
    const maxInputBytes = Math.min(MAX_TEXT_BYTES, connection.capabilities.maxInputBytes);
    const imageBytes = ids.reduce((total, id) => total + record.attachments[id]!.size, 0);
    const fits = inputBytes <= maxInputBytes && images.length <= 4 && imageBytes <= 32 * 1024 * 1024 && ids.every(id => record.attachments[id]!.size <= (connection.capabilities.maxImageBytes ?? MAX_IMAGE_BYTES)) && (!images.length || (connection.capabilities.images && (!source || Boolean(selectedModel && 'images' in selectedModel && selectedModel.images))));
    const token = createHmac('sha256', this.previewSecret).update(JSON.stringify({ id: record.view.id, input, sourceRevision: source?.revision, through, text, ids })).digest('hex');
    return { preview: { token, conversationId: record.view.id, revision: record.view.revision, connectionId: input.connectionId, modelAccountId: input.modelAccountId, modelAccountIdentity: source?.identity, modelAccountRevision: source?.revision, modelSourceLabel: source?.accountLabel ?? source?.label, model: input.model, serviceTier:input.serviceTier,reasoningEffort: input.reasoningEffort, permissionMode: input.permissionMode!, participantId: participant?.id, cwd: record.view.cwd, taskId: record.view.taskId, text: input.text, history, sourceThrough: through, inputBytes, maxInputBytes, fits, switching, diagnostic: fits ? undefined : images.length && !connection.capabilities.images ? '此执行方未验收图片输入，请继续原执行方或明确提供文字接续说明。' : '接续内容超过已验收容量，请继续原执行方或明确提供精简接续说明。' }, text, images, draft: input,configuration };
  }
  prepareSend(workspaceId: string, id: string, input: SendDraft): SendPreview { return this.prepare(this.load(workspaceId, id), input).preview; }

  send(workspaceId: string, id: string, raw: SendDraft & { previewToken: string; clientRequestId: string }): { run: RunView; conversation: ConversationView } {
    const record = this.load(workspaceId, id);
    const clientRequestId = nonempty(raw.clientRequestId, '请求身份', 200);
    const inputDigest = hash({ ...this.draft(raw), expectedRevision: undefined });
    const repeated = record.attempts.find(attempt => attempt.clientRequestId === clientRequestId);
    if (repeated) {
      const legacyDigest = hash({ ...this.draft(raw), permissionMode: undefined, expectedRevision: undefined });
      if (repeated.inputDigest !== inputDigest && !(resolvePermissionMode(raw.permissionMode) === 'default' && repeated.inputDigest === legacyDigest)) fail('agent_request_conflict', '相同请求身份对应不同输入，已拒绝重复执行。', 409);
      if (record.view.run?.id !== repeated.runId) fail('agent_request_already_accepted', '该请求已受理，请读取其原有历史。', 409);
      return { run: structuredClone(record.view.run), conversation: this.view(record) };
    }
    const prepared = this.prepare(record, raw);
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
    if (prepared.preview.switching) append({ id: randomUUID(), kind: 'handoff', role: 'system', text: `由 ${connection.label} 接续本对话`, participantId: participant.id, provider: participant.provider });
    if (prepared.draft.handoffSummary !== undefined) append({ id: randomUUID(), kind: 'notice', role: 'user', text: `用户确认的精简接续说明：\n${prepared.draft.handoffSummary}`, participantId: participant.id });
    const userEntryId = randomUUID();
    append({ id: userEntryId, kind: 'message', role: 'user', text: prepared.draft.text, runId: run.id, status: 'sending', attachments: prepared.draft.attachmentIds });
    record.attempts.push({ clientRequestId, inputDigest, runId: run.id, participantId: participant.id, through: record.view.entries.at(-1)!.sequence, userEntryId, accepted: false });
    record.view.run = run;
    this.save(record);
    const work = this.execute(workspaceId, id, run.id, prepared).finally(() => this.workers.delete(run.id));
    this.workers.set(run.id, work);
    return { run: structuredClone(run), conversation: this.read(workspaceId, id) };
  }

  private currentRun(workspaceId: string, id: string, runId: string): StoredConversation | undefined {
    const record = this.load(workspaceId, id);
    return record.view.run?.id === runId && record.view.run.generation === this.options.generation ? record : undefined;
  }
  private applyItem(record: StoredConversation, participant: StoredParticipant, item: ExecutorItem, runId?: string): boolean {
    if (Buffer.byteLength(item.text) > MAX_ITEM_BYTES) fail('agent_native_item_too_large', '原生条目超出安全展示容量，原记录保留于准确原生会话。', 413);
    const source = `${participant.id}:${item.kind}:${item.id}`;
    let entry = record.view.entries.find(value => value.id === record.sources[source]);
    if (!entry && item.role === 'user') {
      const attempt = record.attempts.find(value => value.participantId === participant.id && (value.nativeInputItemId === item.id || (item.executionId && value.executionRef?.id === item.executionId)));
      if (attempt) { entry = record.view.entries.find(value => value.id === attempt.userEntryId); attempt.nativeInputItemId = item.id; }
      else fail('agent_native_user_unmapped', '原生用户输入尚不能准确映射，已保留现有记录，请重新观察。', 409);
    }
    if (entry) {
      record.sources[source] = entry.id;
      if (entry.role === 'user') return false;
      const nameChanged = item.name !== undefined && entry.name !== item.name;
      const inputChanged = item.input !== undefined && entry.input !== item.input;
      if (entry.text === item.text && entry.status === item.status && !nameChanged && !inputChanged) return false;
      entry.text = item.text; entry.status = item.status; if (nameChanged) entry.name = item.name; if (inputChanged) entry.input = item.input; return true;
    }
    entry = { id: randomUUID(), sequence: (record.view.entries.at(-1)?.sequence ?? 0) + 1, createdAt: this.options.now(), kind: item.kind, role: item.role, text: item.text, name: item.name, input: item.input, participantId: participant.id, provider: participant.provider, runId, status: item.status };
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
    else if (observation.status === 'stopped') { run.status = 'stopped'; record.view.requests = []; record.requests = {}; }
    else if (observation.status === 'idle') {
      if (!run.accepted) { if (run.status !== 'starting' && run.status !== 'stopping') run.status = 'unknown'; return; }
      run.status = run.status === 'stopping' ? 'stopped' : run.status === 'failed' ? 'failed' : 'completed';
      record.view.requests = []; record.requests = {};
    } else if (observation.status === 'running') run.status = run.status === 'stopping' ? 'stopping' : 'running';
    run.updatedAt = this.options.now();
  }

  private async execute(workspaceId: string, id: string, runId: string, prepared: ReturnType<ConversationApplication['prepare']>): Promise<void> {
    let dispatched = false;
    try {
      const workspace = await this.options.host.resolveWorkspace(workspaceId);
      if (!workspace.rootPath) fail('agent_workspace_missing', '原工作空间不可用。', 409);
      let record = this.currentRun(workspaceId, id, runId); if (!record) return;
      if (record.view.taskId) await this.options.host.assertTask(workspaceId, record.view.taskId);
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
        if (changed) { this.save(record); fail('agent_history_changed', '原生历史有新变化，请重新查看接续预览后发送。', 409); }
      } else {
        const ref = await runtime.createContext({ cwd: record.view.cwd, permissionMode: prepared.draft.permissionMode });
        record = this.currentRun(workspaceId, id, runId); if (!record) return;
        const storedParticipant = record.participants.find(value => value.id === participant.id)!;
        storedParticipant.contextRef = ref; storedParticipant.bindingIdentity = runtime.bindingIdentity;
        participant.contextRef = ref; this.save(record);
      }
      const beforeDispatch = this.currentRun(workspaceId, id, runId); if (!beforeDispatch) return;
      record = beforeDispatch;
      if (beforeDispatch.view.run!.status === 'stopping') { beforeDispatch.view.run!.status = 'stopped'; this.save(beforeDispatch); return; }
      if (!this.options.connections.get(prepared.draft.connectionId).enabled) fail('agent_connection_disabled', '接入已断开，本次输入尚未交付。', 409);
      dispatched = true;
      await runtime.send({ contextRef: participant.contextRef!, cwd: record.view.cwd, text: prepared.text, images: prepared.images, model: prepared.draft.modelAccountId ? selectedRuntime.model : prepared.draft.model, reasoningEffort: prepared.draft.reasoningEffort, permissionMode: prepared.draft.permissionMode, clientRequestId: record.attempts.find(value => value.runId === runId)!.clientRequestId, onEvent: event => this.event(workspaceId, id, runId, event) });
      await this.observe(workspaceId, id);
      void this.generateAutomaticTitle(workspaceId, id, runId, runtime).catch(() => {});
    } catch (error) {
      const record = this.currentRun(workspaceId, id, runId); if (!record) return;
      const run = record.view.run!;
      const permissionRejectedBeforeInput = !run.accepted && error instanceof AgentServiceError && ['agent_permission_invalid', 'agent_permission_unavailable', 'agent_permission_unverified'].includes(error.code);
      const possiblyDelivered = dispatched && !permissionRejectedBeforeInput;
      if (!['stopped', 'completed'].includes(run.status)) run.status = possiblyDelivered ? 'unknown' : 'failed';
      run.diagnostic = safeDiagnostic(error); run.updatedAt = this.options.now();
      const attempt = record.attempts.find(value => value.runId === runId);
      const entry = record.view.entries.find(value => value.id === attempt?.userEntryId);
      if (entry && !run.accepted) entry.status = possiblyDelivered ? 'unknown' : 'failed';
      try { this.save(record); } catch { /* Preserve existing DB and native state; never retry a possibly delivered input. */ }
    }
  }

  private titleEligible(record: StoredConversation): boolean {
    return !this.closing && record.titleOrigin === 'default' && record.view.title === '新对话';
  }
  private acceptTitle(record: StoredConversation, raw: string | undefined, explicit = false): boolean {
    if (!raw || this.closing || !explicit && !this.titleEligible(record)) return false;
    const title = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    // Chinese titles stay glanceable; English needs slightly more characters for a short phrase.
    if (!title || [...title].length > (/\p{Script=Han}/u.test(title) ? 24 : 64)) return false;
    record.view.title = title; record.titleOrigin = 'generated'; return true;
  }
  private titleDescription(record: StoredConversation): string | undefined {
    const visible = record.view.entries.filter(entry => ['user', 'assistant'].includes(entry.role) && entry.kind === 'message' && entry.status !== 'failed' && entry.text.trim());
    const users = visible.filter(entry => entry.role === 'user'); const answers = visible.filter(entry => entry.role === 'assistant');
    if (!users.length || !answers.length) return;
    const selected = new Map([users[0]!, answers[0]!, users.at(-1)!, answers.at(-1)!].map(entry => [entry.id, entry]));
    const messages = [...selected.values()].sort((a, b) => a.sequence - b.sequence).map(entry => {
      let bytes = 0; let text = ''; for (const character of entry.text) { const size = Buffer.byteLength(character); if (bytes + size > 1024) break; text += character; bytes += size; }
      return { role: entry.role, text };
    });
    return JSON.stringify({ messages });
  }
  private async generateAutomaticTitle(workspaceId: string, id: string, runId: string, runtime: AgentRuntime): Promise<void> {
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
    const timeout = setTimeout(() => controller.abort(), 12_000); timeout.unref();
    try {
      let title: string | undefined;
      if (runtime.readTitle) title = await within(runtime.readTitle({ contextRef: participant.contextRef, cwd: record.view.cwd }), 2_000, 'agent_title_timeout').catch(() => undefined);
      record = this.load(workspaceId, id); expected(record.view.revision, revision);
      if (this.acceptTitle(record, title, explicit)) { this.save(record); return; }
      if (!runtime.generateTitle) fail('agent_title_unavailable', '此执行方尚未提供可用的精短标题，原有标题已保留。', 409);
      record.titleAttempted = true; this.save(record); revision = record.view.revision;
      title = await within(runtime.generateTitle({ contextRef: participant.contextRef, cwd: record.view.cwd, description, model: record.view.run?.model, signal: controller.signal }), 10_000, 'agent_title_timeout');
      const current = this.load(workspaceId, id);
      if (controller.signal.aborted || current.view.run?.id !== runId || current.view.revision !== revision) fail('agent_revision_conflict', '对话已变化，保留当前标题。', 409);
      if (!this.acceptTitle(current, title, explicit)) fail('agent_title_failed', '未生成符合长度要求的精短标题，原有标题已保留。', 502);
      this.save(current);
    } catch (error) {
      controller.abort();
      if (explicit) { if (error && typeof error === 'object' && 'code' in error) throw error; fail('agent_title_failed', '标题生成未完成，原有标题与工作结果已保留。', 502); }
    } finally { clearTimeout(timeout); if (this.titleWork.get(id) === controller) this.titleWork.delete(id); }
  }

  async observe(workspaceId: string, id: string): Promise<ConversationView> {
    const key = `${workspaceId}/${id}`;
    const current = this.observations.get(key); if (current) return current;
    const work = this.reconcile(workspaceId, id).finally(() => this.observations.delete(key));
    this.observations.set(key, work); return work;
  }
  private async reconcile(workspaceId: string, id: string): Promise<ConversationView> {
    let record = this.load(workspaceId, id);
    for (const saved of record.participants) {
      if (!saved.contextRef) continue;
      try {
        const runtime = (await this.sourceRuntime(record, saved)).runtime;
        if (runtime.bindingIdentity !== saved.bindingIdentity) fail('agent_binding_changed', '参与者的程序或原配置身份已失配。', 409);
        await runtime.resumeContext({ contextRef: saved.contextRef, cwd: record.view.cwd });
        const items = await runtime.readHistory({ contextRef: saved.contextRef, cwd: record.view.cwd });
        const run = this.load(workspaceId, id).view.run;
        const attempt = run ? this.load(workspaceId, id).attempts.find(value => value.runId === run.id) : undefined;
        const needsObservation = run?.participantId === saved.id && BUSY_STATES.has(run.status);
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
    const control = this.control(workspaceId, id, input);
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
    await runtime.reply({ contextRef: control.participant.contextRef, executionRef: binding.executionRef, requestId: binding.nativeId, answer: input.answer });
    const record = this.currentRun(workspaceId, id, input.runId);
    if (record) { delete record.requests[requestId]; record.view.requests = record.view.requests.filter(value => value.id !== requestId); if (!record.view.requests.length && ['waiting-approval', 'waiting-question'].includes(record.view.run!.status)) record.view.run!.status = 'running'; this.save(record); }
    return this.read(workspaceId, id);
    } finally { this.repliesInFlight.delete(requestId); }
  }

  addAttachment(workspaceId: string, id: string, input: { expectedRevision: string; mimeType: string; bytes: Uint8Array }): { id: string; mimeType: string; size: number; revision: string } {
    const record = this.load(workspaceId, id); expected(record.view.revision, input.expectedRevision);
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(input.mimeType) || !(input.bytes instanceof Uint8Array)) fail('agent_image_invalid', '请选择容量不超过8 MiB的PNG、JPEG、GIF或WebP图片。');
    const bytes = Buffer.from(input.bytes);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail('agent_image_invalid', '图片内容无效或超过8 MiB。');
    const magic = input.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : input.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : input.mimeType === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!magic) fail('agent_image_invalid', '图片类型与实际内容不符。');
    const attachmentsRoot = path.join(this.options.root, 'attachments');
    fs.mkdirSync(attachmentsRoot, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(attachmentsRoot).isSymbolicLink()) fail('agent_attachment_unsafe', '附件目录来源不安全。', 409);
    const directory = path.join(attachmentsRoot, id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink()) fail('agent_attachment_unsafe', '附件目录来源不安全。', 409);
    const referenced = new Set(record.view.entries.flatMap(entry => entry.attachments ?? []));
    const expired: string[] = [];
    const now = Date.parse(this.options.now());
    let temporaryBytes = 0; let temporaryCount = 0;
    for (const [key, meta] of Object.entries(record.attachments)) {
      if (!/^[a-f0-9-]{36}$/.test(key)) fail('agent_attachment_unsafe', '附件记录来源不安全。', 409);
      if (referenced.has(key)) continue;
      const filename = path.join(this.options.root, 'attachments', id, key);
      const createdAt = meta.createdAt ? Date.parse(meta.createdAt) : fs.lstatSync(filename, { throwIfNoEntry: false })?.mtimeMs ?? 0;
      if (now - createdAt >= TEMP_IMAGE_TTL_MS) { delete record.attachments[key]; expired.push(filename); }
      else { temporaryBytes += meta.size; temporaryCount++; }
    }
    if (expired.length) {
      // Commit the loss of references before removing only our registered private files.
      this.save(record);
      for (const filename of expired) { try { fs.unlinkSync(filename); } catch { /* Retry is safe; no public reference remains. */ } }
    }
    if (temporaryCount >= 32 || temporaryBytes + bytes.length > MAX_TEMP_IMAGE_BYTES) fail('agent_attachment_capacity', '未发送图片已达32张或64 MiB；临时图片保留24小时，请稍后重试。', 413);
    const attachmentId = randomUUID();
    const filename = path.join(directory, attachmentId); fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
    record.attachments[attachmentId] = { mimeType: input.mimeType, size: bytes.length, createdAt: this.options.now() };
    try { this.save(record); } catch (error) { fs.unlinkSync(filename); throw error; }
    return { id: attachmentId, mimeType: input.mimeType, size: bytes.length, revision: record.view.revision };
  }
  private attachment(record: StoredConversation, id: string): ExecutorImage {
    const meta = record.attachments[id]; if (!meta || !/^[a-f0-9-]{36}$/.test(id)) fail('agent_attachment_missing', '图片不属于此对话。', 404);
    const filename = path.join(this.options.root, 'attachments', record.view.id, id);
    const stat = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== meta.size) fail('agent_attachment_changed', '图片来源已变化，请重新添加。', 409);
    return { id, path: filename, mimeType: meta.mimeType };
  }
  readAttachment(workspaceId: string, id: string, attachmentId: string): { bytes: Buffer; mimeType: string } {
    const attachment = this.attachment(this.load(workspaceId, id), attachmentId);
    const descriptor = fs.openSync(attachment.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try { const stat = fs.fstatSync(descriptor); if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_IMAGE_BYTES) fail('agent_attachment_changed', '图片来源已变化。', 409); return { bytes: fs.readFileSync(descriptor), mimeType: attachment.mimeType }; }
    finally { fs.closeSync(descriptor); }
  }
  subscribe(workspaceId: string, id: string) {
    const conversation = this.read(workspaceId, id);
    return this.options.events.subscribe({ type: 'snapshot', workspaceId, conversationId: id, revision: conversation.revision, payload: { conversation } }, event => event.workspaceId === workspaceId && event.conversationId === id);
  }
  async closeConnection(connectionId: string): Promise<void> {
    await Promise.allSettled(this.options.repository.listPending(true).map(async record => {
      const run = record.view.run; const participant = record.participants.find(value => value.id === run?.participantId);
      if (run && participant?.connectionId === connectionId && BUSY_STATES.has(run.status)) {
        try { await this.stop(record.view.workspaceId, record.view.id, { expectedRevision: record.view.revision, runId: run.id, participantId: participant.id, generation: run.generation }); }
        catch { const latest = this.load(record.view.workspaceId, record.view.id); latest.view.run!.status = 'unknown'; latest.view.run!.diagnostic = '断开时未能确认原生执行退出。'; this.save(latest); }
      }
    }));
    for (const [id, sourceConnection] of this.sourceConnections) if (sourceConnection === connectionId) { this.sourceRuntimes.delete(id); this.sourceConnections.delete(id); }
  }
  async close(): Promise<void> {
    this.closing = true;
    for (const controller of this.titleWork.values()) controller.abort();
    for (const record of this.options.repository.listPending(true)) {
      if (record.view.run) { record.view.run.status = 'unknown'; record.view.run.diagnostic = '宿主正在退出，原生执行尚待确认。'; this.save(record); }
    }
    const ids = new Set(this.options.repository.listPending(true).map(record => record.participants.find(value => value.id === record.view.run?.participantId)?.connectionId).filter((id): id is string => Boolean(id)));
    await Promise.allSettled([...ids].map(id => this.closeConnection(id)));
  }
}
