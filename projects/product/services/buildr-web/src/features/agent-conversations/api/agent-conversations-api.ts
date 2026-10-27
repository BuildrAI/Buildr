import { createApiClient, LocalSessionAdapter } from '../../../api';
import type { ApiClient, ApiError, SessionAdapter } from '../../../api';
import { parseEventFrame } from '../conversation-state';
import type { ModelAccount, CatalogModel, AttachmentView, ConnectionView, ConversationEvent, ConversationSummary, ConversationView, PendingConversation, PreparationView, ProviderId, SendInput, SendPreview } from '../types';

const appPath = '/api/v1/app/agent-service';
const path = (workspaceId: string, conversationId?: string) => `${workspaceId === '@default' ? appPath + '/conversations' : '/api/v1/workspaces/' + encodeURIComponent(workspaceId) + '/agent-conversations'}${conversationId ? '/' + encodeURIComponent(conversationId) : ''}`;
const post = (body: unknown): RequestInit => ({method: 'POST', body: JSON.stringify(body)});
export function createAgentConversationsClient(client: ApiClient, session: SessionAdapter, fetcher: typeof fetch = fetch) {
  const request = async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    const send = () => client(url, { ...init, headers: {...session.writeHeaders(), ...Object.fromEntries(new Headers(init.headers))} }) as Promise<T>;
    try { return await send(); } catch (failure) {
      if ((failure as ApiError)?.code !== 'session_forbidden' || !session.refreshSession || !await session.refreshSession()) throw failure;
      return send();
    }
  };
  return {
    defaultWorkspace(signal?: AbortSignal) { return request<{rootPath: string}>(appPath+'/default-workspace', {signal}); },
    modelAccounts(signal?:AbortSignal) {return request<{accounts:ModelAccount[];providers:Array<{id:string;label:string}>}>(appPath+'/model-accounts',{signal});},
    modelCatalog(signal?:AbortSignal) {return request<{models:CatalogModel[]}>(appPath+'/model-catalog',{signal});},
    addModelAccount(provider:string) {return request<ModelAccount>(appPath+'/model-accounts',post({provider}));},
    modelPreferences(account:ModelAccount,models:Array<{id:string;enabled?:boolean;contextWindow?:number|null}>) {return request<ModelAccount>(appPath+'/model-accounts/'+account.id+'/preferences',post({expectedRevision:account.revision,models}));},
    modelAccountAction(account:ModelAccount,action:'check'|'disconnect'|'login-attempts') {return request<ModelAccount>(appPath+'/model-accounts/'+account.id+'/'+action,post({expectedRevision:account.revision}));},
    modelLoginAttempt(accountId:string,attemptId:string,signal?:AbortSignal) {return request<ModelAccount>(appPath+'/model-accounts/'+accountId+'/login-attempts/'+attemptId,{signal});},
    cancelModelLogin(account:ModelAccount) {return request<ModelAccount>(appPath+'/model-accounts/'+account.id+'/login-attempts/'+account.loginAttempt!.id+'/cancel',post({expectedRevision:account.revision}));},
    connections(signal?: AbortSignal) { return request<{connections: ConnectionView[]}>(appPath + '/connections', {signal}); },
    prepareConnection(connection: ConnectionView, options: {executable?: string; install?: boolean} = {}) { return request<PreparationView>(`${appPath}/connections/${encodeURIComponent(connection.id)}/preparation-attempts`, post({expectedRevision: connection.revision, ...options})); },
    currentPreparation(connectionId: string, signal?: AbortSignal) { return request<{attempt: PreparationView|null}>(`${appPath}/connections/${encodeURIComponent(connectionId)}/preparation-attempts`, {signal}); },
    preparation(connectionId: string, attemptId: string, signal?: AbortSignal) { return request<PreparationView>(`${appPath}/connections/${encodeURIComponent(connectionId)}/preparation-attempts/${encodeURIComponent(attemptId)}`, {signal}); },
    cancelPreparation(connectionId: string, attemptId: string) { return request<PreparationView>(`${appPath}/connections/${encodeURIComponent(connectionId)}/preparation-attempts/${encodeURIComponent(attemptId)}/cancel`, post({})); },
    connect(provider: ProviderId, expectedRevision?: string) { return request<ConnectionView>(`${appPath}/connections/${encodeURIComponent(provider)}/connect`, post({expectedRevision})); },
    check(connection: ConnectionView) { return request<ConnectionView>(`${appPath}/connections/${encodeURIComponent(connection.id)}/check`, post({expectedRevision: connection.revision})); },
    disconnect(connection: ConnectionView) { return request<ConnectionView>(`${appPath}/connections/${encodeURIComponent(connection.id)}/disconnect`, post({expectedRevision: connection.revision})); },
    login(connection: ConnectionView) { return request<ConnectionView>(`${appPath}/connections/${encodeURIComponent(connection.id)}/login-attempts`, post({expectedRevision: connection.revision})); },
    loginAttempt(connectionId: string, id: string, signal?: AbortSignal) { return request<ConnectionView>(`${appPath}/connections/${encodeURIComponent(connectionId)}/login-attempts/${encodeURIComponent(id)}`, {signal}); },
    cancelLogin(connection: ConnectionView, id: string) { return request<ConnectionView>(`${appPath}/connections/${encodeURIComponent(connection.id)}/login-attempts/${encodeURIComponent(id)}/cancel`, post({expectedRevision:connection.revision})); },
    pending(signal?: AbortSignal) { return request<{conversations: ConversationView[]}>(appPath + '/pending-requests', {signal}).then(result => ({conversations: result.conversations.map(item => ({conversationId:item.id,workspaceId:item.workspaceId,title:item.title,status:item.run?.status || 'unknown',count:item.requests.length}) as PendingConversation)})); },
    list(workspaceId: string, options: {taskId?: string; cursor?: string; hidden?: boolean; query?: string; signal?: AbortSignal} = {}) { const params = new URLSearchParams(); if (options.taskId) params.set('taskId', options.taskId); if (options.cursor) params.set('cursor', options.cursor); if (options.hidden) params.set('hidden', 'true'); if (options.query) params.set('query', options.query); return request<{conversations: ConversationSummary[]; nextCursor?: string}>(path(workspaceId) + (params.size ? '?' + params : ''), {signal: options.signal}); },
    create(input: {workspaceId: string; cwd?: string; taskId?: string}) { return request<ConversationView>(path(input.workspaceId), post({cwd: input.cwd, taskId: input.taskId})); },
    read(workspaceId: string, id: string, signal?: AbortSignal) { return request<ConversationView>(path(workspaceId, id), {signal}); },
    entries(workspaceId: string, id: string, cursor: number, signal?: AbortSignal) { return request<ConversationView>(path(workspaceId, id) + '/entries?' + new URLSearchParams({before: String(cursor),limit:'100'}), {signal}); },
    update(conversation: ConversationView, input: {title?: string; hidden?: boolean; taskId?: string | null}) { return request<ConversationView>(path(conversation.workspaceId, conversation.id), {method: 'PATCH', body: JSON.stringify({...input, expectedRevision: conversation.revision})}); },
    generateTitle(conversation:ConversationView) {return request<ConversationView>(path(conversation.workspaceId,conversation.id)+'/generate-title',post({expectedRevision:conversation.revision}));},
    prepare(conversation: ConversationView, input: SendInput) { return request<SendPreview>(path(conversation.workspaceId, conversation.id) + '/prepare-send', post(input)); },
    send(conversation: ConversationView, input: SendInput & {previewToken: string; clientRequestId: string}) { return request<{conversation: ConversationView}>(path(conversation.workspaceId, conversation.id) + '/send', post(input)); },
    stop(conversation: ConversationView, toolId?: string) { const run = conversation.run; if (!run) return Promise.reject(new Error('没有可以停止的执行。')); return request<ConversationView>(path(conversation.workspaceId, conversation.id) + '/stop', post({expectedRevision: conversation.revision, runId: run.id, participantId: run.participantId, generation: run.generation, toolId})); },
    observe(conversation: ConversationView) { return request<ConversationView>(path(conversation.workspaceId, conversation.id) + '/observe', post({})); },
    reply(conversation: ConversationView, requestId: string, input: {answer: unknown}) { const pending = conversation.requests.find(item => item.id === requestId); if (!pending) return Promise.reject(new Error('原请求已经变化，请重新读取。')); return request<ConversationView>(path(conversation.workspaceId, conversation.id) + `/requests/${encodeURIComponent(requestId)}/reply`, post({...input, expectedRevision: conversation.revision, runId: pending.runId, participantId: pending.participantId, generation: pending.generation})); },
    async upload(conversation: ConversationView, file: File) {
      const bytes = await file.arrayBuffer();
      const send = () => fetcher(path(conversation.workspaceId,conversation.id) + '/attachments', {method:'POST',cache:'no-store',headers:{...session.writeHeaders(),'content-type':file.type,'x-buildr-conversation-revision':conversation.revision},body:bytes});
      let response = await send();
      if(response.status===403 && session.refreshSession){const body=await response.clone().json().catch(()=>null);if(body?.error?.code==='session_forbidden' && await session.refreshSession())response=await send();}
      const body=await response.json();
      if(!response.ok){const error:ApiError=new Error(body.error?.message||'图片上传失败。');error.status=response.status;error.code=body.error?.code;error.details=body.error?.details;throw error;}
      return body as AttachmentView;
    },
    async readImage(conversation: ConversationView, id: string, signal?: AbortSignal): Promise<Blob> {
      const send = () => fetcher(path(conversation.workspaceId, conversation.id) + '/attachments/' + encodeURIComponent(id), { cache: 'no-store', signal, headers: session.writeHeaders() });
      let response = await send();
      if (response.status === 403 && session.refreshSession) {
        const body = await response.clone().json().catch(() => null);
        if (body?.error?.code === 'session_forbidden' && await session.refreshSession()) response = await send();
      }
      if (!response.ok) throw new Error('图片读取失败，请重新加载。');
      return response.blob();
    },
    async subscribe(workspaceId: string, id: string, signal: AbortSignal, onEvent: (event: ConversationEvent) => void, cursor?: number) {
      const headers = {...session.writeHeaders(), accept:'text/event-stream', ...(cursor ? {'last-event-id':String(cursor)} : {})};
      const response = await fetcher(path(workspaceId, id) + '/events', {cache:'no-store', signal, headers});
      if (!response.ok || !response.body) { const error: ApiError = new Error('对话事件连接未建立，请重新核对执行状态。'); error.status = response.status; throw error; }
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      try { while (!signal.aborted) { const {value, done} = await reader.read(); if (done) break; buffer = (buffer + decoder.decode(value, {stream:true})).replace(/\r\n/g, '\n'); if (buffer.length > 8 * 1024 * 1024) throw new Error('事件缓冲超限，需要重新读取对话。'); let boundary; while ((boundary = buffer.indexOf('\n\n')) >= 0) { const frame = parseEventFrame(buffer.slice(0,boundary)); buffer = buffer.slice(boundary + 2); if (frame.data) onEvent(JSON.parse(frame.data) as ConversationEvent); } } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!signal.aborted) throw new Error('对话连接已中断；原执行状态尚未确认。');
    },
  };
}
const session = new LocalSessionAdapter();
export const agentConversationsApi = createAgentConversationsClient(createApiClient({sessionAdapter: {writeHeaders: () => session.writeHeaders()}, getWorkspaceId: () => null}), session);
export type AgentConversationsClient = ReturnType<typeof createAgentConversationsClient>;
