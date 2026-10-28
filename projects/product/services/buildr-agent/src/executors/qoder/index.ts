import {generateQoderTitle} from './title.ts';
import { NativeObservationError } from '../../domain/error-diagnostic.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AccountObservation, AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { NativeRpc, nativeBinding, bounded, closeOwnedProcess, findExecutable, inspectVersion, isolatedEnvironment, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories } from '../native-process.ts';
import {readQoderIdentity,requestQoderModel} from '../../model-access/providers/qoder.ts';
import { ExecutorInputRejected, type ExecutorSupplementInput, type ExecutorInputReceipt } from '../../contracts.ts';
import { checkedGateway, consumerBinding, gatewayModel, qoderGatewayPolicy, type ExecutorGateway } from '../model-gateway.ts';
const capabilities = { supplement: true, permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
export function createQoderExecutor(): AgentExecutor { return { descriptor: { id: 'qoder', label: 'Qoder', capabilities }, open: options => QoderRuntime.open(options) }; }
class QoderRuntime implements AgentRuntime {
  readonly capabilities = capabilities;
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  private rpc: NativeRpc;
  get closed(): boolean { return this.rpc.closed; }
  private observationWaits = new Map<string, (error: Error) => void>();
  private projectionFailures = new Set<string>();
  private executable: string;
  private environment: NodeJS.ProcessEnv;
  private configRoot: string;
  private contexts = new Map<string, string>();
  private handlers = new Map<string, ExecutorSendInput['onEvent']>();
  private observations = new Map<string, ExecutorObservation>();
  private login?: { child: ChildProcessWithoutNullStreams; cancelled: boolean; update: (value: LoginObservation) => void };
  private gateway?: ExecutorGateway;
  private constructor(bindingIdentity: string, rpc: NativeRpc, executable: string, environment: NodeJS.ProcessEnv, configRoot: string) {
    this.bindingIdentity = bindingIdentity; this.rpc = rpc; this.executable = executable; this.environment = environment; this.configRoot = configRoot;
    rpc.onMessage(message => {
      if (message.method === 'buildr/transportClosed') {
        for (const contextId of this.handlers.keys()) this.observationFailed(contextId, 'qoder_execution_observation_lost', message.params?.code);
        return;
      }
      if (message.method === 'event') {
        const { contextId, event } = message.params;
        if (event.type === 'accepted') this.observations.set(contextId, { status: 'running', executionRef: event.executionRef, tools: [] });
        if (event.type === 'observation') this.observations.set(contextId, event.observation);
        try { this.handlers.get(contextId)?.(event); }
        catch (error) { this.observationFailed(contextId, 'qoder_event_observation_lost', error); }
        if (event.type === 'observation' && ['idle', 'stopped'].includes(event.observation.status)) { this.handlers.delete(contextId); this.projectionFailures.delete(contextId); }
      }
    });
  }
  private observationFailed(contextId: string, code: string, cause: unknown): void {
    this.projectionFailures.add(contextId);
    const error = new NativeObservationError(code, cause, this.gateway ? [this.gateway.apiKey] : []);
    this.observationWaits.get(contextId)?.(error);
    const prior = this.observations.get(contextId);
    try { this.handlers.get(contextId)?.({ type: 'observation', observation: { status: 'unknown', executionRef: prior?.executionRef, tools: prior?.tools ?? [], diagnostic: error.diagnostic } }); } catch { /* The original worker and exact controls remain alive. */ }
  }

  static async open(options: ExecutorOpenOptions): Promise<QoderRuntime> {
    options.signal?.throwIfAborted();
    const gateway = checkedGateway(options.gateway);
    const { home, temporary } = nativeHome(options.configRoot);
    // qodercliAuth owns this one Buildr login; model leases isolate execution, not credentials.
    const config = join(options.nativeAccountConfigRoot ?? options.configRoot, 'qoder-config');
    await privateDirectories(options.configRoot, home, temporary, config);
    const env = isolatedEnvironment(options.environment, home, temporary, { QODER_CONFIG_DIR: config, ...(gateway && !gateway.nativeModel ? { QODER_SDK_CUSTOM_BASE_URL_BYOK: '1', BUILDR_MODEL_GATEWAY_KEY: gateway.apiKey, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' } : {}) });
    const executable = await findExecutable(options.executable, ['qodercli', 'qoder', 'qodercli.exe'], env); const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('qoder', version)) throw new Error(`qoder_version_unsupported: requires ${nativeProgramPolicy('qoder').compatibility}`);
    const binding = await consumerBinding('qoder', executable, version, config, options);
    const rpc = new NativeRpc(process.execPath, [fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url))], { cwd: options.configRoot, env });
    const runtime = new QoderRuntime(binding.identity, rpc, executable, env, options.configRoot);
    runtime.bindingData = binding.data;
    runtime.gateway = gateway;
    let abortedClose: Promise<void> | undefined; const abort = () => { abortedClose ??= rpc.close(); };
    options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
    try {
      await rpc.call('initialize', { executable, ...(gateway ? { gateway } : {}) });
      if (gateway) {
        await runtime.assertNativeAccount();
        // The platform login starts Qoder itself; paid native model access is unrelated.
        const account: AccountObservation = await rpc.call('account', { cwd: options.configRoot }, 40000);
        if (account.status !== 'ready') throw new Error(account.status === 'expired' ? 'qoder_platform_login_expired' : account.status === 'not-authenticated' ? 'qoder_platform_login_required' : 'qoder_platform_auth_unavailable');
      }
      options.signal?.throwIfAborted(); return runtime;
    } catch (error) { await (abortedClose ?? rpc.close()); throw error; }
    finally { options.signal?.removeEventListener('abort', abort); }
  }
  private reference(context: ContextRef, cwd?: string): string {
    const saved = this.contexts.get(context.id) ?? (typeof context.data?.cwd === 'string' ? context.data.cwd : undefined);
    if (!saved || cwd && saved !== cwd) throw new Error('agent_context_binding_mismatch');
    if (parseReference(String(context.data?.native ?? ''), 'qoder', saved, this.bindingIdentity).nativeSessionId !== context.id) throw new Error('agent_context_binding_mismatch');
    this.contexts.set(context.id, saved); return saved;
  }
  async inspectAccount(): Promise<AccountObservation> {
    try { return await this.rpc.call('account', { cwd: this.configRoot }, 40000); }
    catch { return { status: 'failed', diagnostic: 'qoder_account_not_observed' }; }
  }
  async modelIdentity():Promise<string> {return 'qoder:'+(await readQoderIdentity(join(this.configRoot,'qoder-config'))).userID;}
  async requestModel(path:string,init:RequestInit={},expectedIdentity?:string):Promise<Response> {
    if(this.gateway)throw new Error('qoder_native_account_required');
    return requestQoderModel(join(this.configRoot,'qoder-config'),path,init,fetch,expectedIdentity);
  }
  async models() { return this.gateway ? structuredClone(this.gateway.models) : await this.rpc.call('models', { cwd: this.configRoot }, 40000); }
  async generateTitle(input: ExecutorTitleInput): Promise<string | undefined> {
    this.reference(input.contextRef, input.cwd); input.signal.throwIfAborted();
    await this.assertNativeAccount();
    return await generateQoderTitle(this.rpc,input.description,input.signal);
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
        if ((url.hostname === 'qoder.com' || url.hostname.endsWith('.qoder.com')) && value !== currentUrl) { currentUrl = value; update({ state: 'waiting-browser', url: url.href }); }
      }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    try {
      const status = await bounded(new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', () => reject(new Error('qoder_login_failed'))); }), 15 * 60 * 1000);
      if (this.login !== login || login.cancelled) return;
      if (status !== 0) { update({ state: 'failed', diagnostic: 'qoder_login_failed' }); return; }
      update({ state: 'checking' }); const account = await this.inspectAccount();
      if (this.login !== login) return;
      if (account.status === 'ready' && (await this.models()).length) update({ state: 'completed' }); else update({ state: 'failed', diagnostic: 'qoder_account_not_ready' });
    } catch { if (this.login === login) { await closeOwnedProcess(child); update({ state: 'expired' }); } }
    finally { text = ''; if (this.login === login) this.login = undefined; }
  }
  async cancelLogin(): Promise<void> { const login = this.login; if (!login) return; this.login = undefined; login.cancelled = true; await closeOwnedProcess(login.child); login.update({ state: 'cancelled' }); }
  async createContext({ cwd }: { cwd: string }): Promise<ContextRef> { const id = randomUUID(); this.contexts.set(id, cwd); return { id, data: { cwd, native: opaqueReference('qoder', id, cwd, this.bindingIdentity) } }; }
  async resumeContext({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<void> { this.reference(contextRef, cwd); await this.rpc.call('resume', { contextId: contextRef.id, cwd }); }
  async readHistory({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> { this.reference(contextRef, cwd); return await this.rpc.call('history', { contextId: contextRef.id, cwd }); }
  async send(input: ExecutorSendInput): Promise<void> {
    this.reference(input.contextRef, input.cwd);
    await this.assertNativeAccount();
    if (this.gateway) input = { ...input, model: gatewayModel(this.gateway, input.model).id, reasoningEffort: qoderGatewayPolicy(this.gateway, input.model, input.reasoningEffort).parameters.reasoningEffort };
    this.handlers.set(input.contextRef.id, input.onEvent);
    this.projectionFailures.delete(input.contextRef.id);
    const observationFailed = new Promise<never>((_, reject) => this.observationWaits.set(input.contextRef.id, reject));
    try {
      await Promise.race([this.rpc.call('send', { contextId: input.contextRef.id, cwd: input.cwd, text: input.text, images: input.images, model: input.model, reasoningEffort: input.reasoningEffort, permissionMode: input.permissionMode, clientRequestId: input.clientRequestId }, 24 * 60 * 60 * 1000), observationFailed]);
    } catch (error) {
      if (this.closed) throw new NativeObservationError('qoder_execution_observation_lost', error, this.gateway ? [this.gateway.apiKey] : []);
      throw error;
    } finally {
      this.observationWaits.delete(input.contextRef.id);
      if (this.closed || !this.projectionFailures.has(input.contextRef.id)) this.handlers.delete(input.contextRef.id);
    }
  }

  private async assertNativeAccount(): Promise<void> {
    if (!this.gateway?.nativeModel) return;
    const identity = await readQoderIdentity(this.environment.QODER_CONFIG_DIR!);
    if (createHash('sha256').update('qoder:' + identity.userID).digest('hex') !== this.gateway.nativeModel.accountIdentity) throw new Error('qoder_native_account_changed');
  }
  async observe({ contextRef, executionRef }: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation> {
    this.reference(contextRef);
    try { return await this.rpc.call('observe', { contextId: contextRef.id, executionId: executionRef?.id }, 5000); }
    catch { return { status: 'unknown', tools: this.observations.get(contextRef.id)?.tools ?? [], diagnostic: 'qoder_exact_execution_not_observed' }; }
  }
  async supplement(input: ExecutorSupplementInput): Promise<ExecutorInputReceipt> {
    this.reference(input.contextRef, input.cwd);
    try { return await this.rpc.call('supplement', { contextId: input.contextRef.id, executionId: input.executionRef.id, clientRequestId: input.clientRequestId, text: input.text, images: input.images }, 15000); }
    catch (error) { if (error instanceof Error && error.message === 'agent_supplement_rejected') throw new ExecutorInputRejected(error.message); throw error; }
  }
  async reply({ contextRef, executionRef, requestId, answer }: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void> { this.reference(contextRef); await this.rpc.call('reply', { contextId: contextRef.id, executionId: executionRef.id, requestId, answer }); }
  async stop({ contextRef, executionRef, toolId }: { contextRef: ContextRef; executionRef: ExecutionRef; toolId?: string }): Promise<ExecutorObservation> { this.reference(contextRef); return await this.rpc.call('stop', { contextId: contextRef.id, executionId: executionRef.id, toolId }, 7000); }
  async close(): Promise<void> { await this.cancelLogin(); await this.rpc.call('close', {}, 5000).catch(() => {}); await this.rpc.close(); }
}
