import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AccountObservation, AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { NativeRpc, nativeBinding, bounded, closeOwnedProcess, findExecutable, inspectVersion, isolatedEnvironment, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories } from '../native-process.ts';
const capabilities = { permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
export function createQoderExecutor(): AgentExecutor { return { descriptor: { id: 'qoder', label: 'Qoder', capabilities }, open: options => QoderRuntime.open(options) }; }
class QoderRuntime implements AgentRuntime {
  readonly capabilities = capabilities;
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  private rpc: NativeRpc;
  private executable: string;
  private environment: NodeJS.ProcessEnv;
  private configRoot: string;
  private contexts = new Map<string, string>();
  private handlers = new Map<string, ExecutorSendInput['onEvent']>();
  private observations = new Map<string, ExecutorObservation>();
  private login?: { child: ChildProcessWithoutNullStreams; cancelled: boolean; update: (value: LoginObservation) => void };
  private constructor(bindingIdentity: string, rpc: NativeRpc, executable: string, environment: NodeJS.ProcessEnv, configRoot: string) {
    this.bindingIdentity = bindingIdentity; this.rpc = rpc; this.executable = executable; this.environment = environment; this.configRoot = configRoot;
    rpc.onMessage(message => {
      if (message.method === 'event') {
        const { contextId, event } = message.params;
        if (event.type === 'observation') this.observations.set(contextId, event.observation);
        this.handlers.get(contextId)?.(event);
      }
    });
  }
  static async open(options: ExecutorOpenOptions): Promise<QoderRuntime> {
    options.signal?.throwIfAborted();
    const { home, temporary } = nativeHome(options.configRoot); const config = join(options.configRoot, 'qoder-config');
    await privateDirectories(options.configRoot, home, temporary, config);
    const env = isolatedEnvironment(options.environment, home, temporary, { QODER_CONFIG_DIR: config });
    const executable = await findExecutable(options.executable, ['qodercli', 'qoder', 'qodercli.exe'], env); const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('qoder', version)) throw new Error(`qoder_version_unsupported: requires ${nativeProgramPolicy('qoder').compatibility}`);
    const binding = await nativeBinding('qoder', executable, version, config, options.binding);
    const rpc = new NativeRpc(process.execPath, [fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url))], { cwd: options.configRoot, env });
    const runtime = new QoderRuntime(binding.identity, rpc, executable, env, options.configRoot);
    runtime.bindingData = binding.data;
    let abortedClose: Promise<void> | undefined; const abort = () => { abortedClose ??= rpc.close(); };
    options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
    try { await rpc.call('initialize', { executable }); options.signal?.throwIfAborted(); return runtime; } catch (error) { await (abortedClose ?? rpc.close()); throw error; } finally { options.signal?.removeEventListener('abort', abort); }
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
  async models() { return await this.rpc.call('models', { cwd: this.configRoot }, 40000); }
  async generateTitle(input: ExecutorTitleInput): Promise<string | undefined> {
    this.reference(input.contextRef, input.cwd); input.signal.throwIfAborted();
    return await this.rpc.call('title', { description: input.description }, 10_000);
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
    this.handlers.set(input.contextRef.id, input.onEvent);
    try { await this.rpc.call('send', { contextId: input.contextRef.id, cwd: input.cwd, text: input.text, images: input.images, model: input.model, reasoningEffort: input.reasoningEffort, permissionMode: input.permissionMode, clientRequestId: input.clientRequestId }, 24 * 60 * 60 * 1000); }
    finally { this.handlers.delete(input.contextRef.id); }
  }
  async observe({ contextRef, executionRef }: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation> {
    this.reference(contextRef);
    try { return await this.rpc.call('observe', { contextId: contextRef.id, executionId: executionRef?.id }, 5000); }
    catch { return { status: 'unknown', tools: this.observations.get(contextRef.id)?.tools ?? [], diagnostic: 'qoder_exact_execution_not_observed' }; }
  }
  async reply({ contextRef, executionRef, requestId, answer }: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void> { this.reference(contextRef); await this.rpc.call('reply', { contextId: contextRef.id, executionId: executionRef.id, requestId, answer }); }
  async stop({ contextRef, executionRef, toolId }: { contextRef: ContextRef; executionRef: ExecutionRef; toolId?: string }): Promise<ExecutorObservation> { this.reference(contextRef); return await this.rpc.call('stop', { contextId: contextRef.id, executionId: executionRef.id, toolId }, 7000); }
  async close(): Promise<void> { await this.cancelLogin(); await this.rpc.call('close', {}, 5000).catch(() => {}); await this.rpc.close(); }
}
