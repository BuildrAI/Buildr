import {createQoderModelProvider} from '../model-access/providers/qoder.ts';
import type {ModelProvider} from '../model-access/contracts.ts';
import {createHash} from 'node:crypto';
import {ModelAccessError} from '../model-access/contracts.ts';
import {createModelAccess} from '../model-access/application.ts';
import {createDevinModelProvider} from '../model-access/providers/devin.ts';
import {createCodexModelProvider} from '../model-access/providers/codex.ts';
import {createDeepSeekModelProvider} from '../model-access/providers/deepseek.ts';
import {createDeepSeekAccountOwner} from '../executors/dsh/model-source-owner.ts';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import type { AgentServiceOptions, ConnectionView, PreparationInput, SendDraft } from '../contracts.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { ConnectionApplication } from '../application/connection-application.ts';
import { ConversationApplication } from '../application/conversation-application.ts';
import { ConversationEvents } from '../application/conversation-events.ts';
import { executorEnvironment } from '../application/executor-environment.ts';
import { createNativeExecutors } from '../executors/index.ts';
import { NativeProgramManager } from '../executors/program-manager.ts';
import { PreparationApplication } from '../application/preparation-application.ts';
import { HostContext } from '../application/host-context.ts';

/** Core composition. Process integrations enter through connectAgentProcess. */
export function createAgentService(options: AgentServiceOptions) {
  const generation = randomUUID();
  const root = path.join(options.dataRoot, 'agent-service');
  const repository = new ConversationRepository(root);
  const events = new ConversationEvents(generation);
  const now = () => (options.now?.() ?? new Date()).toISOString();
  let linkedChanged: ((connection:ConnectionView)=>void)|undefined;
  const connections = new ConnectionApplication({ repository, root, executors: options.executors ?? createNativeExecutors(), environment: executorEnvironment(options.environment ?? process.env), generation, now, changed: (connection: ConnectionView) => {events.publish({ type: 'connection', revision: connection.revision, payload: { connection } });linkedChanged?.(connection);} });
  const programManager = options.programManager ?? new NativeProgramManager(root, executorEnvironment(options.environment ?? process.env));
  const preparations = new PreparationApplication(connections, programManager, generation, now);
  const owner=(id:string)=>({
    async inspect(){if(!connections.get(id).enabled)return{status:'not-authenticated' as const};return(await connections.runtime(id)).inspectAccount();},
    async identity(){const runtime=await connections.runtime(id);if(!runtime.modelIdentity)throw new Error('native_model_identity_unavailable');return runtime.modelIdentity();},
    async request(path:string,init?:RequestInit){if(!connections.get(id).enabled)return new Response(null,{status:401});const runtime=await connections.runtime(id);if(!runtime.requestModel)throw new Error('native_model_bridge_unavailable');return runtime.requestModel(path,init,['/chat','/codex/responses','/anthropic/v1/messages'].includes(path)?models.accounts.read('native-'+id).identity:undefined);}
  });
  const dsh=owner('dsh');
  const dshProvider=createDeepSeekModelProvider({ownerFactory:()=>({...dsh,beginLogin:async()=>{throw new Error('请在DSH账号中登录。');},cancelLogin:async()=>{},close:async()=>{},request:(url,init)=>dsh.request(new URL(url).pathname,init)})});
  const nativeDsh:ModelProvider={...dshProvider,id:'native-dsh',label:'DSH / DeepSeek',connectionId:'dsh',async open(input){const runtime=await dshProvider.open(input);return{protocol:runtime.protocol,inspect:async()=>{const value=await runtime.inspect();return{...value,...(value.status==='ready'?{identity:await dsh.identity()}: {})};},beginLogin:u=>runtime.beginLogin(u),cancelLogin:()=>runtime.cancelLogin(),infer:i=>runtime.infer(i),close:()=>runtime.close()};}};
  const linkedProviders=[createCodexModelProvider({owner:owner('codex')}),nativeDsh,createQoderModelProvider(owner('qoder'))].map(provider=>({...provider,async open(input:Parameters<ModelProvider['open']>[0]){const runtime=await provider.open(input);return{protocol:runtime.protocol,inspect:()=>runtime.inspect(),beginLogin:(u:Parameters<typeof runtime.beginLogin>[0])=>runtime.beginLogin(u),cancelLogin:()=>runtime.cancelLogin(),close:()=>runtime.close(),infer:async(i:Parameters<typeof runtime.infer>[0])=>{const identity=createHash('sha256').update(await owner(provider.connectionId!).identity()).digest('hex');if(models.accounts.read(provider.id).identity!==identity)throw new ModelAccessError('model_identity_conflict','账号身份已变化，请刷新模型。');return runtime.infer(i);}};}}));
  const models = createModelAccess({root: path.join(root, 'model-access'), providers: options.modelProviders ?? [...linkedProviders,createCodexModelProvider(), createDevinModelProvider(), createDeepSeekModelProvider({ownerFactory: async input => {
    const bound = connections.get('dsh').executable;
    const catalog = await programManager.discover({provider:'dsh',...(bound?{executable:bound,boundExecutable:bound}:{}),signal:new AbortController().signal});
    const candidates = catalog.candidates.filter(candidate=>candidate.compatible);
    if(candidates.length!==1) throw new ModelAccessError('model_dsh_program_unavailable','请先在智能体程序中准备并选择准确的 DSH 程序。');
    return createDeepSeekAccountOwner({...input,executable:candidates[0]!.executable});
  }})], environment: executorEnvironment(options.environment ?? process.env)});
  let closed = false;
  let discovery:Promise<void>|undefined, discoveryDiagnostic:string|undefined;
  let discoveryTimer:ReturnType<typeof setInterval>|undefined;
  const discover=():Promise<void>=>{
    if(closed)return Promise.resolve();
    if(discovery)return discovery;
    discovery=(async()=>{
      try {
        await models.ensureLinked();
        if(closed)return;
        const results=await Promise.allSettled(models.accounts.list().accounts.filter(account=>account.enabled&&(account.connectionId||['ready','failed'].includes(account.status))&&!account.loginAttempt?.state?.match(/^(initializing|waiting-browser|checking)$/)).map(account=>models.accounts.check(account.id)));
        discoveryDiagnostic=results.some(result=>result.status==='rejected'||!!result.value.diagnostic)?'部分模型账号核对失败，已保留已有模型列表。':undefined;
      } catch(error) {
        discoveryDiagnostic='模型账号核对未完成，已保留已有模型列表。';
        throw error;
      }
    })().finally(()=>{discovery=undefined;});
    return discovery;
  };
  const refreshInBackground=()=>{void discover().catch(()=>{});};
  const startRefreshing=()=>{
    if(closed||discoveryTimer)return;
    refreshInBackground();
    discoveryTimer=setInterval(refreshInBackground,60_000);discoveryTimer.unref();
  };
  linkedChanged=connection=>{
    if(!connection.enabled||['not-authenticated','expired'].includes(connection.status)||connection.loginAttempt&&['initializing','waiting-browser'].includes(connection.loginAttempt.state))models.invalidate('native-'+connection.id);
    if(discoveryTimer)refreshInBackground();
  };
  const cachedCatalog=()=>{
    const result=models.catalog.list();
    const accounts=models.accounts.list().accounts;
    const hasSnapshot=accounts.some(account=>account.observedAt||account.models.length);
    const failed=accounts.some(account=>{
      if(!account.enabled||account.loginAttempt?.state.match(/^(initializing|waiting-browser|checking)$/))return false;
      const connection=account.connectionId?connections.get(account.connectionId):undefined;
      if(connection&&(!connection.enabled||connection.loginAttempt?.state.match(/^(initializing|waiting-browser|checking)$/)))return false;
      return account.status==='failed'||account.status==='expired'||account.status==='not-authenticated'&&!!account.observedAt;
    });
    const diagnostic=discoveryDiagnostic||(failed?'部分模型账号核对失败或登录已失效，请在智能体与模型中查看。':undefined);
    return {...result,hasSnapshot,...(diagnostic?{diagnostic}:{})};
  };
  const conversations = new ConversationApplication({ repository, connections, modelAccess: models, events, root, generation, now, host: new HostContext(options), autoContinueInterrupted: options.autoContinueInterrupted, generationAlive: options.generationAlive });
  return {
    generation,
    activity() {
      const reasons = [...conversations.activity(), ...preparations.activity(), ...connections.activity(), ...models.activity()];
      if(discovery)reasons.push({kind:'model-discovery',count:1});
      try {
        const pending = repository.listPending(true).filter(record => !options.generationAlive || record.view.run?.generation === generation);
        if(pending.length)reasons.push({kind:'unfinished-execution',count:pending.length});
      } catch { reasons.push({kind:'storage-unconfirmed',count:1}); }
      return {busy:reasons.length>0,reasons};
    },
    async freezeMetadata() {
      clearInterval(discoveryTimer); discoveryTimer = undefined;
      await discovery?.catch(() => {});
      if ([...preparations.activity(), ...connections.activity(), ...models.activity().filter(reason => reason.kind !== 'model-request')].length) {
        startRefreshing();
        const { AgentServiceError } = await import('../domain/agent-state.ts');
        throw new AgentServiceError('agent_process_busy', '仍有账号、准备或配置写入操作，尚未交接维护权。', 409);
      }
      connections.freezeMetadata(); models.freezeMetadata();
    },
    resumeMetadata() { connections.freezeMetadata(false); models.freezeMetadata(false); startRefreshing(); },
    conversationBusy: (scope: string, id: string) => conversations.busy(scope, id),
    verifyNext: (scope: string, id: string) => conversations.verifyNext(scope, id),
    validatePending: (scope: string, id: string, input: SendDraft) => conversations.validatePending(scope, id, input),
    revokeModel: (id: string) => models.invalidate(id),
    models: { startRefreshing, generate: models.generate, accounts: {...models.accounts,list:async(input:{refresh?:boolean}={})=>{if(input.refresh===true)await discover();return models.accounts.list();}}, catalog: {list:async(input:{refresh?:boolean}={})=>{if(input.refresh===true)await discover();return cachedCatalog();}} },
    connections: {
      list: () => ({ connections: connections.list() }),
      read: (id: string) => connections.get(id),
      prepare: (id: string, input: PreparationInput) => preparations.begin(id, input),
      preparation: (id: string, attemptId: string) => preparations.read(id, attemptId),
      currentPreparation: (id: string) => ({ attempt: preparations.current(id) }),
      cancelPreparation: (id: string, attemptId: string) => preparations.cancel(id, attemptId),
      connect: (id: string, input: { expectedRevision: string; executable?: string }) => connections.connect(id, input),
      check: (id: string, input: { expectedRevision?: string } = {}) => connections.check(id, input.expectedRevision),
      login: (id: string, input: { expectedRevision: string }) => connections.beginLogin(id, input.expectedRevision),
      loginAttempt: (id: string, attemptId: string) => connections.loginAttempt(id, attemptId),
      cancelLogin: (id: string, attemptId: string, input: { expectedRevision: string }) => connections.cancelLogin(id, attemptId, input.expectedRevision),
      disconnect: async (id: string, input: { expectedRevision: string }) => {
        // First validate the observed connection revision, before stopping any work.
        const current = connections.get(id);
        if (current.revision !== input.expectedRevision) {
          const { AgentServiceError } = await import('../domain/agent-state.ts');
          throw new AgentServiceError('agent_revision_conflict', '接入配置已变化，请重新检查。', 409);
        }
        connections.disable(id, input.expectedRevision);
        await conversations.closeConnection(id);
        return connections.disconnect(id, connections.get(id).revision);
      },
    },
    conversations: {
      lookupRequest: (workspaceId:string,id:string,clientRequestId:string) => conversations.lookupRequest(workspaceId,id,clientRequestId),
      recoverInterrupted: () => conversations.recoverInterrupted(),
      listAll: (workspaceIds: string[], input: Parameters<ConversationApplication['listAll']>[1] = {}) => conversations.listAll(workspaceIds, input),
      markSeen: (workspaceId: string, id: string, input: Parameters<ConversationApplication['markSeen']>[2]) => conversations.markSeen(workspaceId, id, input),
      list: (workspaceId: string, input: Parameters<ConversationApplication['list']>[1] = {}) => conversations.list(workspaceId, input),
      create: (workspaceId: string, input: Parameters<ConversationApplication['create']>[1]) => conversations.create(workspaceId, input),
      read: (workspaceId: string, id: string, input: Parameters<ConversationApplication['read']>[2] = {}) => conversations.read(workspaceId, id, input),
      update: (workspaceId: string, id: string, input: Parameters<ConversationApplication['update']>[2]) => conversations.update(workspaceId, id, input),
      generateTitle: (workspaceId: string, id: string, input: Parameters<ConversationApplication['generateTitle']>[2]) => conversations.generateTitle(workspaceId, id, input),
      prepareHandoff: (workspaceId:string,id:string,input:SendDraft) => conversations.prepareHandoff(workspaceId,id,input),
      prepareSend: (workspaceId: string, id: string, input: SendDraft) => conversations.prepareSend(workspaceId, id, input),
      send: (workspaceId: string, id: string, input: Parameters<ConversationApplication['send']>[2]) => conversations.send(workspaceId, id, input),
      queueSend: (workspaceId: string, id: string, input: Parameters<ConversationApplication['queueSend']>[2]) => conversations.queueSend(workspaceId, id, input),
      cancelPendingSend: (workspaceId: string, id: string, input: Parameters<ConversationApplication['cancelPendingSend']>[2]) => conversations.cancelPendingSend(workspaceId, id, input),
      supplement: (workspaceId: string, id: string, input: Parameters<ConversationApplication['supplement']>[2]) => conversations.supplement(workspaceId, id, input),
      observe: (workspaceId: string, id: string) => conversations.observe(workspaceId, id),
      stop: (workspaceId: string, id: string, input: Parameters<ConversationApplication['stop']>[2]) => conversations.stop(workspaceId, id, input),
      reply: (workspaceId: string, id: string, requestId: string, input: Parameters<ConversationApplication['reply']>[3]) => conversations.reply(workspaceId, id, requestId, input),
      addAttachment: (workspaceId: string, id: string, input: Parameters<ConversationApplication['addAttachment']>[2]) => conversations.addAttachment(workspaceId, id, input),
      readAttachment: (workspaceId: string, id: string, attachmentId: string) => conversations.readAttachment(workspaceId, id, attachmentId),
      subscribe: (workspaceId: string, id: string) => conversations.subscribe(workspaceId, id),
      pending: () => conversations.pending(),
    },
    async close() {
      if (closed) return; closed = true;
      clearInterval(discoveryTimer);discoveryTimer=undefined;
      const budget = Math.max(50, Math.min(options.shutdownTimeoutMs ?? 10_000, 10_000));
      const deadline = Date.now() + budget;
      const within = async (work: Promise<unknown>, milliseconds: number) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([work.catch(() => {}), new Promise<void>(resolve => { timer = setTimeout(resolve, milliseconds); })]); }
        finally { if (timer) clearTimeout(timer); }
      };
      connections.beginClosing();
      preparations.beginClosing();
      try { await within(conversations.close(), Math.max(1, Math.floor(budget * 0.7))); }
      finally {
        // Always start actual resource release, even if a vendor's stop never responds.
        await within(Promise.allSettled([discovery, preparations.close(), connections.close(), models.close()]), Math.max(1, deadline - Date.now()));
        events.close();
      }
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
