import { agentActivitySummary } from './agent-activity-summary.ts';
import type { AgentService, AgentOperations } from '@buildr-ai/buildr-agent';
import { conversationEventEncoder, AgentServiceError } from '@buildr-ai/buildr-agent';
import { AGENT_SERVICE_HTTP_OPERATIONS, AGENT_SERVICE_HTTP_SCHEMAS as SCHEMAS, AGENT_SERVICE_HTTP_VALIDATORS } from './agent-service-http-contracts.ts';

const inputError = () => new AgentServiceError('agent_http_input_invalid', '智能体服务请求字段无效。');
function toWireValue(input: unknown): unknown {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (Array.isArray(input)) {
    return input.map((item) => (item === undefined || typeof item === 'function' || typeof item === 'symbol' ? null : toWireValue(item)));
  }
  if (typeof input === 'object') {
    const withToJson = input as { toJSON?: unknown };
    if (typeof withToJson.toJSON === 'function') return toWireValue((withToJson as { toJSON(): unknown }).toJSON());
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue;
      out[key] = toWireValue(value);
    }
    return out;
  }
  return JSON.parse(JSON.stringify(input));
}
function validate(name: keyof typeof SCHEMAS, input: unknown, response = false): any {
  // The wire representation excludes optional undefined fields before validation.
  const value = toWireValue(input);
  if (!AGENT_SERVICE_HTTP_VALIDATORS.validate(SCHEMAS[name].$id, value).valid) throw response ? new AgentServiceError('agent_http_response_invalid', '智能体服务返回结果不符合契约。', 500) : inputError();
  return value;
}
const result = (name: keyof typeof SCHEMAS, body: unknown, status = 200) => ({ status, body: validate(name, body, true) });
function query(input: URLSearchParams, allowed: string[]): void {
  for (const key of input.keys()) if (!allowed.includes(key) || input.getAll(key).length !== 1) throw inputError();
}
function numberQuery(value: string | null): number | undefined { if (value === null) return; if (!/^\d+$/.test(value)) throw inputError(); const number = Number(value); if (!Number.isSafeInteger(number)) throw inputError(); return number; }

export function createAgentServiceHttpContribution(resolve: () => AgentService | AgentOperations | Promise<AgentService | AgentOperations>, options: { defaultWorkspace?: () => { rootPath: string }; registeredWorkspaceIds?: () => string[]; runtimeStatus?: () => Promise<unknown>; restartRuntime?: (input: {expectedGeneration:string}) => Promise<unknown>; runtimeAligning?: () => Promise<boolean>; prepareDefaultWorkspace?: () => void } = {}) {
  const { defaultWorkspace, registeredWorkspaceIds = () => [] } = options;
  // Stable-epoch reuse: when the compact change key is unchanged the overview
  // projection cannot differ, so polling skips the full aggregate entirely.
  let activitySummaryCache: { key: string; value: ReturnType<typeof agentActivitySummary> } | undefined;
  const contribution = {
    id: 'agent-service.http', schemas: SCHEMAS, operations: AGENT_SERVICE_HTTP_OPERATIONS,
    async handleTopLevel(context: any) {
      const { request, pathname, searchParams, authorizeRead, authorizeWrite, readJsonBody } = context;
      const prefix = '/api/v1/app/agent-service';
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
      if(pathname===prefix+'/conversations'&&request.method==='GET'&&!searchParams.has('taskId')){
        authorizeRead();
        query(searchParams,['workspaceId','cursor','limit','hidden','query','activeOnly','agent','model','activityState','draftConversationIds']);
        for(const key of ['activeOnly','hidden'])if(searchParams.has(key)&&!['true','false'].includes(searchParams.get(key)!))throw inputError();
        if(searchParams.has('activityState')&&!['running','waiting','unseen','unknown','attention'].includes(searchParams.get('activityState')!))throw inputError();
        let draftConversationIds:string[]|undefined;
        if(searchParams.has('draftConversationIds')){
          try{draftConversationIds=JSON.parse(searchParams.get('draftConversationIds')!);}catch{throw inputError();}
          if(!Array.isArray(draftConversationIds)||draftConversationIds.some(id=>typeof id!=='string'||!id||id.length>200))throw inputError();
          draftConversationIds=[...new Set(draftConversationIds)].sort();
        }
        return result('conversations',await (await resolve()).conversations.listAll(registeredWorkspaceIds(),{draftConversationIds,workspaceId:searchParams.get('workspaceId')??undefined,cursor:searchParams.get('cursor')??undefined,limit:numberQuery(searchParams.get('limit')),hidden:searchParams.get('hidden')==='true',activeOnly:searchParams.get('activeOnly')==='true',query:searchParams.get('query')??undefined,agent:searchParams.get('agent')??undefined,model:searchParams.get('model')??undefined,activityState:searchParams.get('activityState')??undefined}));
      }
      if (pathname === prefix + '/activity-summary' && request.method === 'GET') {
        authorizeRead(); query(searchParams, ['revision']);
        const revision = searchParams.get('revision') ?? undefined;
        if (revision !== undefined && !/^[a-f0-9]{64}$/.test(revision)) throw inputError();
        const service = await resolve();
        const workspaceIds = registeredWorkspaceIds();
        const epoch = typeof service.conversations.activityEpoch === 'function' ? await service.conversations.activityEpoch(workspaceIds) : undefined;
        const cacheKey = epoch === undefined ? undefined : JSON.stringify([workspaceIds, epoch]);
        let summary: ReturnType<typeof agentActivitySummary>;
        if (cacheKey !== undefined && activitySummaryCache?.key === cacheKey) summary = activitySummaryCache.value;
        else {
          const [page, pending] = await Promise.all([
            service.conversations.listAll(workspaceIds, {activeOnly:true,limit:100}),
            service.conversations.pendingSummary(),
          ]);
          summary = agentActivitySummary(page, pending.conversations);
          if (cacheKey !== undefined) activitySummaryCache = { key: cacheKey, value: summary };
        }
        return result('activitySummary', revision === summary.revision ? { revision, unchanged: true as const } : summary);
      }
      // 任务按空间的默认工作空间列表沿用单空间入口；其余默认工作空间对话操作同样委派。
      if (pathname === `${prefix}/conversations` || pathname.startsWith(`${prefix}/conversations/`)) {
        return this.handle({ ...context, workspaceId: '@default', suffix: '/agent-conversations' + pathname.slice(`${prefix}/conversations`.length) });
      }
      if (request.method === 'GET') authorizeRead(); else authorizeWrite();
      const modelAccountsRead = pathname === `${prefix}/model-accounts` && request.method === 'GET';
      query(searchParams, modelAccountsRead ? ['includeDisabled'] : []);
      if (modelAccountsRead && searchParams.has('includeDisabled') && !['true','false'].includes(searchParams.get('includeDisabled')!)) throw inputError();
      if (pathname === `${prefix}/default-workspace` && request.method === 'GET' && defaultWorkspace) return result('defaultWorkspace', defaultWorkspace());
      if (pathname === `${prefix}/runtime` && request.method === 'GET' && options.runtimeStatus) return result('runtimeStatus', await options.runtimeStatus());
      if (pathname === `${prefix}/runtime/restart` && request.method === 'POST' && options.restartRuntime) return result('runtimeStatus', await options.restartRuntime(validate('runtimeRestart', await readJsonBody())));
      const service = await resolve();
      if (pathname === `${prefix}/model-accounts`) {
        if (request.method === 'GET') return result('modelAccounts', await service.models.accounts.list({refresh:false,includeDisabled:searchParams.get('includeDisabled')==='true'}));
        if (request.method === 'POST') return result('modelAccount', await service.models.accounts.add(validate('addModelAccount', await readJsonBody())), 201);
      }
      if (pathname === `${prefix}/model-custom/discovery` && request.method === 'POST') return result('modelCustomDiscoveryResult', await service.models.accounts.discoverCustom(validate('modelCustomDiscovery', await readJsonBody())));
      if (pathname === `${prefix}/model-catalog` && request.method === 'GET') return result('modelCatalog', await service.models.catalog.list({refresh:false}));
      const accountRoute = pathname.slice(prefix.length).match(/^\/model-accounts\/([a-zA-Z0-9_-]{1,100})(?:\/(check|disconnect|login-attempts|preferences|api-key|custom|usage)(?:\/([a-f0-9-]{36})(?:\/(cancel))?)?)?$/);
      if (accountRoute) {
        const [, accountId, action, attemptId, cancel] = accountRoute;
        if (request.method === 'GET' && !action) return result('modelAccount', await service.models.accounts.read(accountId));
        if (request.method === 'GET' && action === 'usage' && !attemptId) {
          const references = await service.conversations.modelAccountReferences([accountId]);
          return result('modelAccountUsage', { references: references[accountId] ?? 0 });
        }
        if (request.method === 'GET' && action === 'login-attempts' && attemptId && !cancel) return result('modelAccount', await service.models.accounts.attempt(accountId, attemptId));
        if (request.method === 'DELETE' && !action) return result('modelAccounts', await service.models.accounts.remove(accountId, validate('revision', await readJsonBody())));
        if (request.method !== 'POST') return null;
        if(action==='preferences'&&!attemptId&&!cancel)return result('modelAccount',await service.models.accounts.preferences(accountId,validate('modelPreferences',await readJsonBody())));
        if(action==='api-key'&&!attemptId&&!cancel)return result('modelAccount',await service.models.accounts.configure(accountId,validate('modelApiKey',await readJsonBody())));
        if(action==='custom'&&!attemptId&&!cancel)return result('modelAccount',await service.models.accounts.configureCustom(accountId,validate('modelCustomConfigure',await readJsonBody())));
        const body = validate('revision', await readJsonBody());
        if (action === 'check') return result('modelAccount', await service.models.accounts.check(accountId, body));
        if (action === 'disconnect') return result('modelAccount', await service.models.accounts.disconnect(accountId, body));
        if (action === 'login-attempts' && !attemptId) return result('modelAccount', await service.models.accounts.login(accountId, body), 202);
        if (action === 'login-attempts' && attemptId && cancel) return result('modelAccount', await service.models.accounts.cancelLogin(accountId, attemptId, body));
        return null;
      }
      if (pathname === `${prefix}/program-updates` && request.method === 'GET') return result('programUpdates', await service.connections.programUpdates());
      if (pathname === `${prefix}/program-updates/check` && request.method === 'POST') return result('programUpdates', await service.connections.checkProgramUpdates(validate('programUpdateCheck', await readJsonBody())));
      if (pathname === `${prefix}/connections` && request.method === 'GET') return result('connections', await service.connections.list());
      if (pathname === `${prefix}/pending-summary` && request.method === 'GET') return result('pendingSummary', await service.conversations.pendingSummary());
      if (pathname === `${prefix}/pending-requests` && request.method === 'GET') return result('conversations', await service.conversations.pending());
      const match = pathname.slice(prefix.length).match(/^\/connections\/([a-z][a-z0-9-]*)(?:\/(connect|check|disconnect|login-attempts|preparation-attempts|program-upgrades)(?:\/([a-f0-9-]{36})(?:\/(cancel))?)?)?$/);
      if (!match) return null;
      const [, id, action, attemptId, cancel] = match;
      if (request.method === 'GET' && !action) return result('connection', await service.connections.read(id));
      if (request.method === 'GET' && action === 'preparation-attempts' && !attemptId) return result('currentPreparation', await service.connections.currentPreparation(id));
      if (request.method === 'GET' && action === 'preparation-attempts' && attemptId && !cancel) return result('preparation', await service.connections.preparation(id, attemptId));
      if (request.method === 'GET' && action === 'login-attempts' && attemptId && !cancel) return result('connection', await service.connections.loginAttempt(id, attemptId));
      if (request.method !== 'POST') return null;
      const body = await readJsonBody();
      if (action === 'program-upgrades' && !attemptId) return result('programUpgrade', await service.connections.upgradeProgram(id, validate('programUpgradeInput', body)), 202);
      if (action === 'preparation-attempts' && !attemptId) return result('preparation', await service.connections.prepare(id, validate('prepare', body)), 202);
      if (action === 'preparation-attempts' && attemptId && cancel) { validate('empty', body); return result('preparation', await service.connections.cancelPreparation(id, attemptId)); }
      if (action === 'connect' && !attemptId) return result('connection', await service.connections.connect(id, validate('connect', body)));
      if (action === 'check' && !attemptId) return result('connection', await service.connections.check(id, validate('check', body)));
      if (action === 'disconnect' && !attemptId) return result('connection', await service.connections.disconnect(id, validate('revision', body)));
      if (action === 'login-attempts' && !attemptId) return result('connection', await service.connections.login(id, validate('revision', body)), 202);
      if (action === 'login-attempts' && attemptId && cancel) return result('connection', await service.connections.cancelLogin(id, attemptId, validate('revision', body)));
      return null;
    },
    async handle(context: any) {
      const { request, suffix, workspaceId, searchParams, authorizeRead, authorizeWrite, authorizeMutation, readJsonBody, readBinaryBody, respond } = context;
      if (suffix !== '/agent-conversations' && !suffix.startsWith('/agent-conversations/')) return null;
      const isImageUpload = request.method === 'POST' && /^\/agent-conversations\/(?:drafts\/)?[a-f0-9-]{36}\/attachments$/.test(suffix);
      if (request.method === 'GET') authorizeRead(); else if (isImageUpload) authorizeMutation(); else authorizeWrite();
      const service = await resolve();
      const draftRoute = suffix.match(/^\/agent-conversations\/drafts\/([a-f0-9-]{36})(?:\/(attachments|send|submissions)(?:\/([a-f0-9-]{36}))?)?$/);
      if (draftRoute) {
        query(searchParams, []);
        const [, draftId, action, childId] = draftRoute;
        if (request.method === 'GET' && !action) return result('draftImages', await service.conversations.readDraft(workspaceId, draftId));
        if (request.method === 'GET' && action === 'submissions' && childId) return result('draftLookup', await service.conversations.lookupDraft(workspaceId, draftId, childId));
        if (request.method === 'GET' && action === 'attachments' && childId) {
          const image = await service.conversations.readDraftImage(workspaceId, draftId, childId);
          respond.binary(image.bytes, image.mimeType, { disposition: /^(image|video)\//.test(image.mimeType) ? 'inline' : 'attachment', filename: image.name || childId }); return true;
        }
        if (request.method === 'POST' && action === 'attachments' && !childId) {
          let name: string; try { name = decodeURIComponent(request.headers['x-buildr-image-name'] ?? '图片'); } catch { throw inputError(); }
          let video: unknown;try {if(request.headers['x-buildr-video'])video=JSON.parse(request.headers['x-buildr-video']);}catch{throw inputError();}
          const metadata = validate('draftImage', { expectedRevision: request.headers['x-buildr-draft-revision'], name, mimeType: request.headers['content-type'], ...(request.headers['x-buildr-frame']==='true'?{frame:true}:{}), ...(video!==undefined?{video}:{}) });
          return result('draftImages', await service.conversations.addDraftImage(workspaceId, draftId, { ...metadata, bytes: await readBinaryBody((metadata.mimeType.startsWith('image/')?8:32) * 1024 * 1024) }), 201);
        }
        if (request.method === 'DELETE' && action === 'attachments' && childId) return result('draftImages', await service.conversations.removeDraftImage(workspaceId, draftId, validate('removeDraftImage', { ...await readJsonBody(), attachmentId: childId })));
        if (request.method === 'POST' && action === 'send' && !childId) {
          const input = validate('startDraft', await readJsonBody(128 * 1024));
          if (workspaceId === '@default' && (input.cwd !== undefined || input.taskId !== undefined)) throw inputError();
          if (workspaceId === '@default') options.prepareDefaultWorkspace?.();
          return result('draftStarted', await service.conversations.startDraft(workspaceId, draftId, input), 202);
        }
        return null;
      }
      if (suffix === '/agent-conversations') {
        if (request.method === 'GET') {
          query(searchParams, ['taskId', 'cursor', 'limit', 'hidden', 'query', 'active', 'attention', 'fields']);
          for (const key of ['hidden', 'active', 'attention']) if (searchParams.has(key) && !['true', 'false'].includes(searchParams.get(key)!)) throw inputError();
          if (searchParams.has('fields') && searchParams.get('fields') !== 'summary') throw inputError();
          return result('conversations', await service.conversations.list(workspaceId, { taskId: searchParams.get('taskId') ?? undefined, workspaceIds:[...new Set([...registeredWorkspaceIds(),workspaceId])], cursor: searchParams.get('cursor') ?? undefined, limit: numberQuery(searchParams.get('limit')), hidden: searchParams.get('hidden') === 'true', query: searchParams.get('query') ?? undefined, active: searchParams.get('active') === 'true', attention: searchParams.get('attention') === 'true', fields: searchParams.get('fields') === 'summary' ? 'summary' : undefined }));
        }
        query(searchParams, []);
        if (request.method === 'POST') {
          const input = validate('create', await readJsonBody());
          if (workspaceId === '@default' && (input.cwd !== undefined || input.taskId !== undefined)) throw inputError();
          if (workspaceId === '@default') options.prepareDefaultWorkspace?.();
          return result('conversation', await service.conversations.create(workspaceId, input), 201);
        }
        return null;
      }
      if (suffix==='/agent-conversations/participation-summary' && request.method==='GET') {
        query(searchParams,['from','to','provider','model','kind','identity','version','cursor','limit']);
        const input:Record<string,unknown>=Object.fromEntries(searchParams);
        if(searchParams.has('limit'))input.limit=numberQuery(searchParams.get('limit'));
        return result('participationSummary',await service.conversations.participationSummary(workspaceId,validate('participationSummaryQuery',input)));
      }
      const participationMatch=suffix.match(/^\/agent-conversations\/([a-f0-9-]{36})\/participation$/);
      if (participationMatch && request.method==='GET') {
        query(searchParams,['runId']);
        return result('participation',await service.conversations.participation(workspaceId,participationMatch[1],validate('participationQuery',{runId:searchParams.get('runId')})));
      }
      const historyMatch=suffix.match(/^\/agent-conversations\/([a-f0-9-]{36})\/history-source$/);
      if(historyMatch&&request.method==='GET'){
        query(searchParams,['sourceId','roundId','cursor','limit','view']);
        return result('historyPage',await service.conversations.readHistory(workspaceId,historyMatch[1],validate('historyQuery',{sourceId:searchParams.get('sourceId'),roundId:searchParams.get('roundId')??undefined,cursor:numberQuery(searchParams.get('cursor')),limit:numberQuery(searchParams.get('limit')),view:searchParams.get('view')??undefined})));
      }
      const detailMatch=suffix.match(/^\/agent-conversations\/([a-f0-9-]{36})\/entry-detail\/([^/]+)$/);
      if(detailMatch&&request.method==='GET'){query(searchParams,['revision','sourceId']);const revision=searchParams.get('revision');if(!revision||!(/^[a-f0-9]{64}$/).test(revision))throw inputError();let entryId:string;try{entryId=decodeURIComponent(detailMatch[2]);}catch{throw inputError();}if(!entryId||entryId.length>1024)throw inputError();return result('entry',await service.conversations.readEntry(workspaceId,detailMatch[1],entryId,revision,searchParams.get('sourceId')??undefined));}
      const match = suffix.match(/^\/agent-conversations\/([a-f0-9-]{36})(?:\/(fork|prepare-send|send|messages|supplement|pending-send|cancel-pending-send|generate-title|children|seen|observe|observe-run|settle-retained-run|stop|stop-all|events|entries|attachments|requests)(?:\/([a-f0-9-]{36})(?:\/(reply))?)?)?$/);
      if (!match) return null;
      const [, id, action, childId, reply] = match;
      if (request.method === 'GET') {
        if (action === 'children' && !childId) {
          query(searchParams,['cursor','limit']);
          return result('conversations',await service.conversations.listChildren(workspaceId,id,{cursor:searchParams.get('cursor')??undefined,limit:numberQuery(searchParams.get('limit'))}));
        }
        if (!action || action === 'entries') {
          query(searchParams, ['before', 'limit']);
          return result('conversation', await service.conversations.read(workspaceId, id, { before: numberQuery(searchParams.get('before')), limit: numberQuery(searchParams.get('limit')), compactTools:true }));
        }
        if (action === 'events') {
          query(searchParams, ['cursor', 'generation']);
          const transfer = request.headers['x-buildr-conversation-transfer'];
          if (transfer !== undefined && transfer !== 'delta-v1' && transfer !== 'delta-v2') throw inputError();
          numberQuery(searchParams.get('cursor'));
          const subscription = await service.conversations.subscribe(workspaceId, id);
          const encode = conversationEventEncoder(transfer==='delta-v2'?'delta-v2':'delta-v1');
          return respond.stream(subscription, (event: any) => validate('event', transfer !== undefined ? encode(event) : event, true));
        }
        if (action === 'attachments' && childId) {
          query(searchParams, []);
          const attachment = await service.conversations.readAttachment(workspaceId, id, childId);
          respond.binary(attachment.bytes, attachment.mimeType, { disposition: /^(image|video)\//.test(attachment.mimeType) ? 'inline' : 'attachment', filename: attachment.name || childId }); return true;
        }
        return null;
      }
      query(searchParams, []);
      if (request.method === 'PATCH' && !action) {
        const input = validate('update', await readJsonBody());
        if (workspaceId === '@default' && (input.taskId !== undefined || input.taskIds !== undefined)) throw inputError();
        return result('conversation', await service.conversations.update(workspaceId, id, input));
      }
      if (request.method !== 'POST') return null;
      if (action === 'children' && !childId) return result('conversation',await service.conversations.createChild(workspaceId,id,validate('createChild',await readJsonBody())),201);
      if (action === 'prepare-send') return result('preview', await service.conversations.prepareHandoff(workspaceId, id, validate('draft', await readJsonBody(128 * 1024))));
      if (action === 'send') return result('sent', await service.conversations.send(workspaceId, id, validate('send', await readJsonBody(128 * 1024))), 202);
      if (action === 'messages') {
        const input = validate('messages', await readJsonBody(128 * 1024));
        const view = await service.conversations.read(workspaceId, id);
        const lastRun = view.run ?? view.retainedRuns?.at(-1);
        const participant = lastRun ? view.participants.find(item => item.id === lastRun.participantId) : undefined;
        if (!lastRun || !participant) throw new AgentServiceError('agent_conversation_idle', '对话尚无可复用的执行选择，请先发送首条消息。', 409);
        const expectedRevision = input.expectedRevision ?? view.revision;
        // A single-step continuation inherits the latest run's authorization
        // unless the caller explicitly selects a mode for this round.
        const permissionMode: 'default' | 'full-access' = input.permissionMode ?? lastRun.permissionMode ?? 'default';
        const selection = { connectionId: participant.connectionId, permissionMode,
          ...(lastRun.modelAccountId ? { modelAccountId: lastRun.modelAccountId } : {}), ...(lastRun.model ? { model: lastRun.model } : {}), ...(lastRun.serviceTier ? { serviceTier: lastRun.serviceTier } : {}), ...(lastRun.reasoningEffort ? { reasoningEffort: lastRun.reasoningEffort } : {}) };
        // send() re-runs prepare atomically. Omitting the preview token keeps
        // the running-conflict check (agent_native_supplement_required) intact;
        // a separate prepare would only duplicate work and race the send.
        return result('sent', await service.conversations.send(workspaceId, id, { text: input.text, expectedRevision, ...selection, clientRequestId: input.clientRequestId }), 202);
      }
      if (action === 'pending-send') return result('conversation', await service.conversations.queueSend(workspaceId, id, validate('queueSend', await readJsonBody(128 * 1024))), 202);
      if (action === 'cancel-pending-send') return result('conversation', await service.conversations.cancelPendingSend(workspaceId, id, validate('cancelPendingSend', await readJsonBody())));
      if (action === 'supplement') return result('supplemented', await service.conversations.supplement(workspaceId, id, validate('supplement', await readJsonBody(128 * 1024))), 202);
      if (action === 'seen') return result('seenResult',await service.conversations.markSeen(workspaceId,id,validate('seen',await readJsonBody())));
      if (action === 'observe') { validate('empty', await readJsonBody()); return result('conversation', await service.conversations.observe(workspaceId, id)); }
      if (action === 'observe-run') return result('conversation',await service.conversations.observeRun(workspaceId,id,validate('control',await readJsonBody())));
      if (action === 'settle-retained-run') return result('conversation',await service.conversations.settleRetainedRun(workspaceId,id,validate('control',await readJsonBody())));
      if (action === 'fork') return result('conversation', await service.conversations.fork(workspaceId, id, validate('fork', await readJsonBody())), 201);
      if (action === 'generate-title') return result('conversation', await service.conversations.generateTitle(workspaceId, id, validate('revision', await readJsonBody())));
      if (action === 'stop-all') return result('conversation', await service.conversations.stopAll(workspaceId,id,validate('stopAll',await readJsonBody())));
      if (action === 'stop') return result('conversation', await service.conversations.stop(workspaceId, id, validate('stop', await readJsonBody())));
      if (action === 'requests' && childId && reply) return result('conversation', await service.conversations.reply(workspaceId, id, childId, validate('reply', await readJsonBody())));
      if (action === 'attachments' && !childId) {
        let video: unknown;
        try { if (request.headers['x-buildr-video']) video = JSON.parse(request.headers['x-buildr-video']); } catch { throw inputError(); }
        let name: string | undefined; try { if (request.headers['x-buildr-image-name']) name = decodeURIComponent(request.headers['x-buildr-image-name']); } catch { throw inputError(); }
        const metadata = validate('attachment', { ...(name ? {name} : {}), expectedRevision: request.headers['x-buildr-conversation-revision'], expectedAttachmentRevision: request.headers['x-buildr-attachment-revision'], mimeType: request.headers['content-type'], ...(video !== undefined ? { video } : {}) });
        return result('attachmentResult', await service.conversations.addAttachment(workspaceId, id, { ...metadata, bytes: await readBinaryBody((metadata.mimeType.startsWith('image/') ? 8 : 32) * 1024 * 1024) }), 201);
      }
      return null;
    },
  };
  // This service owns these public diagnostics; the host still masks unknown errors.
  const handle = (method: 'handle' | 'handleTopLevel') => async (context: any) => {
    try { return await contribution[method](context); }
    catch (error) {
      if (error instanceof AgentServiceError) {
        // 运行单元不同的后台与本宿主校验的契约不同，属于版本对齐窗口而非违约；
        // 真正与宿主同版本的违约仍按 500 暴露，避免掩盖缺陷。
        if (error.code === 'agent_http_response_invalid' && options.runtimeAligning && await options.runtimeAligning().catch(() => false))
          return { status: 503, body: { error: { code: 'agent_service_aligning', message: '执行后台正在切换版本，连接状态暂不可用。' } } };
        return { status: error.status, body: { error: { code: error.code, message: error.message } } };
      }
      throw error;
    }
  };
  return { ...contribution, handle: handle('handle'), handleTopLevel: handle('handleTopLevel') };
}
