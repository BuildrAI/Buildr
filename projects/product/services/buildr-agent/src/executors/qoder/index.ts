import { createQoderNativeContent } from './content.ts';
import { instructionParticipation } from '../../domain/participation.ts';
import { generateQoderNativeTitle } from './model-title.ts';
import { generateModelTitle } from '../model-title.ts';
import {readQoderPersistedExecution} from './durable-history.ts';
import { qoderStorage } from './storage.ts';
import {qoderSdkPair} from './sdk-pair.ts';
import { interactionPolicy } from '../../domain/interaction-policy.ts';
import { NativeObservationError, NativeRequestError } from '../../domain/error-diagnostic.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AccountObservation, AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { NativeRpc, releasedNativeControl, nativeBinding, bounded, closeOwnedProcess, findExecutable, inspectVersion, accountEnvironment, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories } from '../native-process.ts';
import {readQoderIdentity,requestQoderModel,inspectQoderLogin} from '../../model-access/providers/qoder.ts';
import {qoderLoginExpiredMessage} from '../../model-access/providers/qoder-auth.ts';
import {qoderCnModelAccountId,qoderProduct,type QoderProductId} from './product.ts';
import { ExecutorInputRejected, type ExecutorSupplementInput, type ExecutorInputReceipt } from '../../contracts.ts';
import { checkedGateway, consumerBinding, gatewayModel, type ExecutorGateway } from '../model-gateway.ts';
import { qoderGatewayPolicy } from './gateway.ts';
import type { ExecutorForkInput } from '../../contracts.ts';
const capabilities = { interaction: { policy: interactionPolicy.version, nonBlockingQuestions: false }, supplement: true, permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
export function qoderExecutorDescriptor(productId: QoderProductId) {
  const product = qoderProduct(productId);
  const isCn = productId === 'qoder-cn';
  return {
    id: productId,
    label: product.label,
    capabilities,
    modelPolicy: {
      account: 'native' as const,
      gateway: { protocol: 'chat-completions' as const },
      native: {
        sourceProviders: isCn ? ['qoder-cn', qoderCnModelAccountId] : ['qoder', 'native-qoder'],
        exclusive: true,
        binding: 'gateway-lease' as const,
        ...(isCn
          ? { defaultSourceAccountId: qoderCnModelAccountId, accountConfigScope: 'model-account' as const, readySourceSupersedesConnection: true }
          : { observeViaModelAccount: 'native-qoder' }),
        platformLogin: {
          mode: 'required-for-sources' as const,
          expiredCode: 'qoder_platform_login_expired',
          expiredMessage: isCn ? `${product.label} 登录授权已失效，请重新登录。所选模型来源保持不变。` : qoderLoginExpiredMessage,
          requiredCode: 'qoder_platform_login_required',
          requiredMessage: `${product.label} 程序需要先完成基础平台登录；所选套餐不变，不要求使用 Qoder 自有模型。`,
        },
      },
    },
    runtimeTraits: {
      upgradeVerification: (isCn ? 'account-probe' : 'runtime') as 'account-probe' | 'runtime',
      ...(!isCn ? { transientAccountProbe: true } : {}),
      isolateInterruptedContinuation: true,
    },
  };
}
export function createQoderExecutor(productId:QoderProductId='qoder'): AgentExecutor {
  return { nativeContent: createQoderNativeContent(productId), readReleasedControl: input => releasedNativeControl(productId,input), storage: qoderStorage(), descriptor: qoderExecutorDescriptor(productId), open: options => QoderRuntime.open(options,productId) };
}
class QoderRuntime implements AgentRuntime {
  participationInstruction?: import('../../participation-contracts.ts').ParticipationMatch;
  readonly capabilities = capabilities;
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  private rpc: NativeRpc;
  get closed(): boolean { return this.rpc.closed; }
  private observationWaits = new Map<string, (error: Error) => void>();
  private projectionFailures = new Set<string>();
  private historyFailures = new Map<string, Set<string>>();
  private historyRepairs = new Map<string, Promise<void>>();
  private executable: string;
  private environment: NodeJS.ProcessEnv;
  private configRoot: string;
  private product: ReturnType<typeof qoderProduct>;
  private productId: QoderProductId;
  private configDirectory: string;
  private contexts = new Map<string, string>();
  private handlers = new Map<string, ExecutorSendInput['onEvent']>();
  private readonly releaseProofs = new Set<string>();
  private releaseKey(contextRef:ContextRef,executionRef:ExecutionRef):string { return JSON.stringify([contextRef.id,executionRef.id,executionRef.data?.resourceGroup,executionRef.data?.resourceBinding]); }
  private executionHandlers = new Map<string, ExecutorSendInput['onEvent']>();
  private submissions = new Map<string, {contextId:string; settled:boolean; accepted:boolean; released?:boolean}>();
  private observations = new Map<string, ExecutorObservation>();
  private login?: { child: ChildProcessWithoutNullStreams; cancelled: boolean; update: (value: LoginObservation) => void };
  private gateway?: ExecutorGateway;
  private constructor(bindingIdentity: string, rpc: NativeRpc, executable: string, environment: NodeJS.ProcessEnv, configRoot: string, productId: QoderProductId, configDirectory: string) {
    this.bindingIdentity = bindingIdentity; this.rpc = rpc; this.executable = executable; this.environment = environment; this.configRoot = configRoot;
    this.product = qoderProduct(productId); this.productId = productId; this.configDirectory = configDirectory;
    rpc.onMessage(message => {
      if (message.method === 'buildr/transportClosed') {
        for (const contextId of this.handlers.keys()) {
          const observed = this.observations.get(contextId);
          // Closing an idle control channel cannot revoke its exact native end.
          // Unfinished tools, background work and missing history still need recovery.
          if (observed?.executionRef && ['idle', 'stopped'].includes(observed.status) && observed.backgroundWork === false &&
              observed.tools.every(tool => tool.status === 'completed') && !this.historyFailures.has(contextId) && !this.projectionFailures.has(contextId)) continue;
          this.observationFailed(contextId, 'qoder_execution_observation_lost', message.params?.code);
        }
        return;
      }
      if (message.method === 'event') {
        const { contextId, executionId, event } = message.params;
        const handler = executionId ? this.executionHandlers.get(executionId) : this.handlers.get(contextId);
        if (event.type === 'accepted') event.executionRef = this.rpc.executionRef(event.executionRef.id, contextId, this.bindingIdentity);
        if (event.type === 'observation' && event.observation.executionRef) event.observation.executionRef = this.rpc.executionRef(event.observation.executionRef.id, contextId, this.bindingIdentity, event.observation.backgroundWork === true);
        if (event.type === 'accepted') {
          const submission=this.submissions.get(executionId);if(submission)submission.accepted=true;
          if (handler) this.handlers.set(contextId, handler);
          this.observations.set(contextId, { status: 'running', executionRef: event.executionRef, tools: [] });
        }
        if (event.type === 'observation') this.observations.set(contextId, event.observation);
        if (event.type === 'observation' && ['idle', 'stopped'].includes(event.observation.status) && this.historyFailures.has(contextId)) {
          void this.repairHistory(contextId, event.observation.executionRef?.id).then(() => {
            handler?.(event);
            this.projectionFailures.delete(contextId);
          }).catch(error => this.observationFailed(contextId, 'qoder_event_observation_lost', error));
          return;
        }
        try { handler?.(event); }
        catch (error) {
          if (event.type === 'item') { const missing = this.historyFailures.get(contextId) ?? new Set<string>(); missing.add(event.item.id); this.historyFailures.set(contextId, missing); }
          this.observationFailed(contextId, 'qoder_event_observation_lost', error);
        }
        if (event.type === 'observation' && ['idle', 'stopped'].includes(event.observation.status)) { this.projectionFailures.delete(contextId); }
      }
    });
  }
  private repairHistory(contextId: string, executionId?: string): Promise<void> {
    const pending = this.historyRepairs.get(contextId); if (pending) return pending;
    const work = (async () => {
      if (!executionId) throw new Error('qoder_exact_execution_not_observed');
      const cwd = this.contexts.get(contextId);
      if (!cwd) throw new Error('qoder_context_not_found');
      const items = await this.readHistoryPages(contextId, cwd);
      const handler = this.handlers.get(contextId);
      if (!handler) throw new Error('qoder_event_observation_lost');
      const owned = items.filter(item => item.executionId === executionId);
      if ([...this.historyFailures.get(contextId) ?? []].some(id => !owned.some(item => item.id === id))) throw new Error('qoder_history_repair_incomplete');
      for (const item of owned) handler({ type: 'item', item });
      this.historyFailures.delete(contextId);
    })();
    this.historyRepairs.set(contextId, work);
    void work.finally(() => { if (this.historyRepairs.get(contextId) === work) this.historyRepairs.delete(contextId); }).catch(() => {});
    return work;
  }
  private observationFailed(contextId: string, code: string, cause: unknown): void {
    this.projectionFailures.add(contextId);
    const error = new NativeObservationError(code, cause, this.gateway ? [this.gateway.apiKey] : []);
    this.observationWaits.get(contextId)?.(error);
    const prior = this.observations.get(contextId);
    try { this.handlers.get(contextId)?.({ type: 'observation', observation: { status: 'unknown', executionRef: prior?.executionRef, tools: prior?.tools ?? [], diagnostic: error.diagnostic } }); } catch { /* The original worker and exact controls remain alive. */ }
  }

  static async open(options: ExecutorOpenOptions, productId:QoderProductId='qoder'): Promise<QoderRuntime> {
    options.signal?.throwIfAborted();
    const product=qoderProduct(productId);
    const gateway = checkedGateway(options.gateway, { executorId: productId, nativeBinding: 'gateway-lease' });
    if(gateway && productId!=='qoder') throw new Error('qoder_cn_model_source_unsupported');
    const { home, temporary } = nativeHome(options.configRoot);
    // The native CLI owns this one Buildr login; model leases isolate execution, not credentials.
    const config = join(options.nativeAccountConfigRoot ?? options.configRoot, product.configDirectory);
    const env = accountEnvironment(options.environment, home, temporary, { [product.configEnvironment]: config, ...(gateway && !gateway.nativeModel ? { QODER_SDK_CUSTOM_BASE_URL_BYOK: '1', BUILDR_MODEL_GATEWAY_KEY: gateway.apiKey, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' } : {}) }, options.cacheRoot);
    await privateDirectories(options.configRoot, config, ...(env.HOME === home ? [home] : []), ...(env.TMPDIR === temporary ? [temporary] : []));
    const executable = await findExecutable(options.executable, product.executableNames, env); const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram(productId, version)) throw new Error(`qoder_version_unsupported: requires ${nativeProgramPolicy(productId).compatibility}`);
    const binding = await consumerBinding(productId, executable, version, config, options);
    const sdkModule=await qoderSdkPair(executable,version,product);
    const rpc = new NativeRpc(process.execPath, [fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url))], { cwd: options.configRoot, env, diagnostics:options.diagnostics?event=>options.diagnostics!({...event,provider:'qoder'}):undefined });
    const runtime = new QoderRuntime(binding.identity, rpc, executable, env, options.configRoot, productId, product.configDirectory);
    runtime.participationInstruction = instructionParticipation('interaction-policy',(options.interaction ?? interactionPolicy).instructions);
    runtime.bindingData = binding.data;
    runtime.gateway = gateway;
    let abortedClose: Promise<void> | undefined; const abort = () => { abortedClose ??= rpc.close(); };
    options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
    try {
      await rpc.call('initialize', { executable, sdkModule, interaction: options.interaction ?? interactionPolicy, ...(gateway ? { gateway } : {}) });
      if (gateway) await runtime.assertNativeAccount();
      // Platform account and live model checks use the real query before its first input.
      options.signal?.throwIfAborted(); return runtime;
    } catch (error) { await (abortedClose ?? rpc.close()); throw error; }
    finally { options.signal?.removeEventListener('abort', abort); }
  }
  private reference(context: ContextRef, cwd?: string): string {
    const saved = this.contexts.get(context.id) ?? (typeof context.data?.cwd === 'string' ? context.data.cwd : undefined);
    if (!saved || cwd && saved !== cwd) throw new Error('agent_context_binding_mismatch');
    if (parseReference(String(context.data?.native ?? ''), this.productId, saved, this.bindingIdentity).nativeSessionId !== context.id) throw new Error('agent_context_binding_mismatch');
    this.contexts.set(context.id, saved); return saved;
  }
  async inspectAccount(): Promise<AccountObservation> {
    try { return await this.rpc.call('account', { cwd: this.configRoot }, 40000); }
    catch { return { status: 'failed', diagnostic: 'qoder_account_not_observed' }; }
  }
  async verifyUpgrade():Promise<void> {
    await this.rpc.call('verify-upgrade',{},60_000);
  }
  async modelIdentity():Promise<string> {return this.productId+':'+(await readQoderIdentity(join(this.configRoot,this.configDirectory))).userID;}
  async requestModel(path:string,init:RequestInit={},expectedIdentity?:string):Promise<Response> {
    if(this.gateway)throw new Error('qoder_native_account_required');
    return requestQoderModel(join(this.configRoot,this.configDirectory),path,init,fetch,expectedIdentity,this.productId);
  }
  async models() { return this.gateway ? structuredClone(this.gateway.models) : await this.rpc.call('models', { cwd: this.configRoot }, 40000); }
  async generateTitle(input: ExecutorTitleInput): Promise<string | undefined> {
    this.reference(input.contextRef, input.cwd); input.signal.throwIfAborted();
    if (this.gateway) {
      const model = gatewayModel(this.gateway);
      return generateModelTitle(input, model.id, 'chat-completions', init => fetch(this.gateway!.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: 'Bearer ' + this.gateway!.apiKey }, redirect: 'error',
      }), Math.min(128, model.maxOutputTokens ?? 128));
    }
    return await generateQoderNativeTitle(input, (path, init) => this.requestModel(path, init));
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    await this.cancelLogin(); update({ state: 'initializing' });
    const command = nativeCommand(this.executable);
    const child = spawn(command.command, [...command.prefix, 'login'], { cwd: this.configRoot, env: { ...this.environment, BROWSER: process.platform === 'win32' ? 'cmd /c exit 1' : '/usr/bin/false' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const login = { child, cancelled: false, update }; this.login = login;
    let text = ''; let currentUrl = '';
    const read = (chunk: Buffer) => {
      if (this.login !== login || login.cancelled) return;
      text = (text + chunk.toString()).slice(-65536).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const urls = text.match(/https:\/\/[^\s"'<>]+/g) ?? [];
      for (const value of urls) {
        let url: URL; try { url = new URL(value); } catch { continue; }
        if (this.product.loginHosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)) && value !== currentUrl) { currentUrl = value; update({ state: 'waiting-browser', url: url.href }); }
      }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    try {
      const status = await bounded(new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', () => reject(new Error('qoder_login_failed'))); }), 15 * 60 * 1000);
      if (this.login !== login || login.cancelled) return;
      if (status !== 0) { update({ state: 'failed', diagnostic: 'qoder_login_failed' }); return; }
      update({ state: 'checking' }); const account = await inspectQoderLogin(this.environment[this.product.configEnvironment]!, this.productId);
      if (this.login !== login) return;
      if (account.status === 'ready') update({ state: 'completed' }); else update({ state: account.status === 'expired' ? 'expired' : 'failed', diagnostic: account.diagnostic ?? 'qoder_account_not_ready' });
    } catch { if (this.login === login) { await closeOwnedProcess(child); update({ state: 'expired' }); } }
    finally { text = ''; if (this.login === login) this.login = undefined; }
  }
  async cancelLogin(): Promise<void> { const login = this.login; if (!login) return; this.login = undefined; login.cancelled = true; await closeOwnedProcess(login.child); login.update({ state: 'cancelled' }); }
  async createContext({ cwd }: { cwd: string }): Promise<ContextRef> { const id = randomUUID(); this.contexts.set(id, cwd); return { id, data: { cwd, native: opaqueReference(this.productId, id, cwd, this.bindingIdentity) } }; }
  async forkContext(input: ExecutorForkInput): Promise<ContextRef> {
    if (!(input.source instanceof QoderRuntime)) throw new Error('agent_context_binding_mismatch');
    input.source.reference(input.contextRef, input.cwd);
    const result = await this.rpc.call('fork', { contextId: input.contextRef.id, cwd: input.cwd, itemId: input.itemId, executionId: input.executionRef.id, inputItemIds: input.inputItemIds });
    if (typeof result.sessionId !== 'string' || result.sessionId === input.contextRef.id) throw new Error('agent_fork_identity_invalid');
    this.contexts.set(result.sessionId, input.cwd);
    const ref = { id: result.sessionId, data: { cwd: input.cwd, native: opaqueReference(this.productId, result.sessionId, input.cwd, this.bindingIdentity) } };
    input.onCreated(ref);
    return ref;
  }
  async prepareContext(input: {contextRef: ContextRef; cwd: string; model?: string; reasoningEffort?: string; permissionMode?: PermissionMode}): Promise<void> {
    this.reference(input.contextRef,input.cwd);
    await this.assertNativeAccount();
    await this.rpc.call('prepare', {...input, contextRef:undefined, contextId:input.contextRef.id, ...(this.gateway ? {model:gatewayModel(this.gateway,input.model).id,reasoningEffort:qoderGatewayPolicy(this.gateway,input.model,input.reasoningEffort).parameters.reasoningEffort}: {})},45000);
  }
  async resumeContext({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<void> { this.reference(contextRef, cwd); await this.rpc.call('resume', { contextId: contextRef.id, cwd }); }
  private async readHistoryPages(contextId: string, cwd: string): Promise<ExecutorItem[]> {
    const items: ExecutorItem[] = [];
    let snapshotId: string | undefined, cursor: string | undefined;
    for (let page = 0; page < 10_000; page++) {
      const result = await this.rpc.call('history', { contextId, cwd, ...(snapshotId === undefined ? {} : { snapshotId }), ...(cursor === undefined ? {} : { cursor }) });
      if (!result || !Array.isArray(result.data)) throw new Error('qoder_history_page_invalid');
      items.push(...result.data);
      if (result.nextCursor === undefined || result.nextCursor === null) return items;
      if (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor === cursor || typeof result.snapshotId !== 'string' || !result.snapshotId) throw new Error('qoder_history_pagination_invalid');
      if (snapshotId !== undefined && result.snapshotId !== snapshotId) throw new Error('qoder_history_pagination_invalid');
      snapshotId = result.snapshotId;
      cursor = result.nextCursor;
    }
    throw new Error('qoder_history_pagination_invalid');
  }
  async readHistory({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> { this.reference(contextRef, cwd); return await this.readHistoryPages(contextRef.id, cwd); }
  async send(input: ExecutorSendInput): Promise<void> {
    this.reference(input.contextRef, input.cwd);
    const submission:{contextId:string;settled:boolean;accepted:boolean;released?:boolean}={contextId:input.contextRef.id,settled:false,accepted:false};
    if(this.submissions.get(input.clientRequestId)?.settled===false)throw new Error('agent_native_turn_active');
    this.submissions.set(input.clientRequestId,submission);
    try {
      await this.assertNativeAccount();
      if (this.gateway) input = { ...input, model: gatewayModel(this.gateway, input.model).id, reasoningEffort: qoderGatewayPolicy(this.gateway, input.model, input.reasoningEffort).parameters.reasoningEffort };
      this.executionHandlers.set(input.clientRequestId, input.onEvent);
      if (!this.handlers.has(input.contextRef.id)) this.handlers.set(input.contextRef.id, input.onEvent);
      this.projectionFailures.delete(input.contextRef.id);
      const observationFailed = new Promise<never>((_, reject) => this.observationWaits.set(input.contextRef.id, reject));
      try {
        await Promise.race([this.rpc.call('send', { contextId: input.contextRef.id, cwd: input.cwd, text: input.text, images: input.images, model: input.model, reasoningEffort: input.reasoningEffort, permissionMode: input.permissionMode, clientRequestId: input.clientRequestId }, 24 * 60 * 60 * 1000), observationFailed]);
      } catch (error) {
        const code=error instanceof NativeRequestError?error.diagnostic:error instanceof Error?error.message:'';
        if(['qoder_sdk_worker_removed','qoder_initialization_failed'].includes(code))throw new ExecutorInputRejected(code);
        if (error instanceof Error && error.message === 'agent_native_turn_active') this.executionHandlers.delete(input.clientRequestId);
        if (this.closed) throw new NativeObservationError('qoder_execution_observation_lost', error, this.gateway ? [this.gateway.apiKey] : []);
        throw error;
      } finally {
        this.observationWaits.delete(input.contextRef.id);
        if (this.closed) { this.handlers.delete(input.contextRef.id); this.executionHandlers.delete(input.clientRequestId); }
      }
    } finally { submission.settled=true; }
  }

  async releaseUnaccepted({contextRef,clientRequestId}:{contextRef:ContextRef;clientRequestId:string}):Promise<false|{executionState:'unknown'}> {
    this.reference(contextRef);
    const submission=this.submissions.get(clientRequestId);
    if(!submission||submission.contextId!==contextRef.id||!submission.settled||submission.accepted||[...this.submissions.values()].some(other=>other!==submission&&!other.settled))return false;
    if(!submission.released){
      if(this.rpc.closed)return false;
      const proof=await this.rpc.call('unaccepted-release-check',{contextId:contextRef.id,clientRequestId},7000);
      if(!proof.released||submission.accepted)return false;
      submission.released=true;
    }
    const ref=this.rpc.executionRef(clientRequestId,contextRef.id,this.bindingIdentity);
    const released=await this.rpc.control.releaseExecution(ref,contextRef.id,this.bindingIdentity,{ended:true,executionState:'unknown',channelClosed:this.rpc.closed});
    return released?{executionState:'unknown'}:false;
  }

  private async assertNativeAccount(): Promise<void> {
    if (!this.gateway?.nativeModel) return;
    const identity = await readQoderIdentity(this.environment.QODER_CONFIG_DIR!);
    const nativeProvider=this.gateway.nativeModel.provider;
    if (createHash('sha256').update(nativeProvider+':' + identity.userID).digest('hex') !== this.gateway.nativeModel.accountIdentity) throw new Error('qoder_native_account_changed');
  }
  async observe({ contextRef, executionRef }: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation> {
    this.reference(contextRef);
    try {
      const observed = await this.rpc.call('observe', { contextId: contextRef.id, cwd: this.contexts.get(contextRef.id), executionId: executionRef?.id }, 5000);
      if (['idle', 'stopped'].includes(observed.status) && this.historyFailures.has(contextRef.id)) await this.repairHistory(contextRef.id, observed.executionRef?.id);
      if (executionRef && observed.executionRef?.id === executionRef.id) observed.executionRef = { ...executionRef, data: executionRef.data ? { ...executionRef.data, ...(observed.backgroundWork === undefined ? {} : { backgroundWork: observed.backgroundWork }) } : undefined };
      return observed;
    }
    catch { return { status: 'unknown', tools: this.observations.get(contextRef.id)?.tools ?? [], diagnostic: 'qoder_exact_execution_not_observed' }; }
  }
  async prepareRelease({contextRef,executionRef}:{contextRef:ContextRef;executionRef:ExecutionRef}):Promise<boolean>{
    this.reference(contextRef);
    const resource=executionRef.data;
    if(!resource || resource.resourceContext!==contextRef.id || resource.resourceBinding!==this.bindingIdentity)return false;
    // A cold history reader has no live state for the old worker. Its exact
    // process-group proof remains authoritative; never require a new-worker PID.
    if(resource.resourceGroup!==this.rpc.child.pid || this.rpc.closed)return Boolean(await this.canRelease({contextRef,executionRef}));
    const proof=await this.rpc.call('release-check',{contextId:contextRef.id,executionId:executionRef.id},5000);
    if(proof.ended&&!proof.blocked){this.releaseProofs.add(this.releaseKey(contextRef,executionRef));return true;}
    return false;
  }
  async canRelease({contextRef,executionRef}:{contextRef:ContextRef;executionRef:ExecutionRef}):Promise<boolean|{executionState:'ended'|'unknown'}>{
    this.reference(contextRef);
    let ended=false,executionState:'ended'|'unknown'='unknown';
    if (executionRef.data?.resourceGroup===this.rpc.child.pid && !this.rpc.closed) {
      const proof=await this.rpc.call('release-check',{contextId:contextRef.id,executionId:executionRef.id},5000);
      if(!proof.ended||proof.blocked)return false;
      ended=true;executionState=proof.executionState==='ended'?'ended':'unknown';
    }
    // A live release-check supersedes the historical background-work hint.
    // Cold observers still require the persisted proof and an absent group.
    const reference = (ended || this.releaseProofs.has(this.releaseKey(contextRef,executionRef))) && executionRef.data ? {...executionRef,data:{...executionRef.data,backgroundWork:false}} : executionRef;
    const released = await this.rpc.control.releaseExecution(reference,contextRef.id,this.bindingIdentity,{ended,executionState,channelClosed:this.rpc.closed});
    if (released) { this.executionHandlers.delete(executionRef.id); if (this.observations.get(contextRef.id)?.executionRef?.id === executionRef.id) this.handlers.delete(contextRef.id); }
    return released;
  }
  async supplement(input: ExecutorSupplementInput): Promise<ExecutorInputReceipt> {
    this.reference(input.contextRef, input.cwd);
    try { return await this.rpc.call('supplement', { contextId: input.contextRef.id, executionId: input.executionRef.id, clientRequestId: input.clientRequestId, text: input.text, images: input.images }, 15000); }
    catch (error) { if (error instanceof Error && error.message === 'agent_supplement_rejected') throw new ExecutorInputRejected(error.message); throw error; }
  }
  async reply({ contextRef, executionRef, requestId, answer }: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void> { this.reference(contextRef); await this.rpc.call('reply', { contextId: contextRef.id, executionId: executionRef.id, requestId, answer }); }
  async stop({ contextRef, executionRef, toolId }: { contextRef: ContextRef; executionRef: ExecutionRef; toolId?: string }): Promise<ExecutorObservation> { this.reference(contextRef); return await this.rpc.call('stop', { contextId: contextRef.id, executionId: executionRef.id, toolId }, 7000); }
  async close(): Promise<void> { await this.cancelLogin(); await this.rpc.call('close', {}, 5000).catch(() => {}); await this.rpc.close(); this.handlers.clear(); this.executionHandlers.clear(); }
}
