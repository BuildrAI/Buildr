import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { agentFailure, readAgentExecutionConfig, type AgentExecutionProvider, type AgentProviderGenerationInput, type DshAgentRegistration } from '../domain/agent-operations.ts';
import { dshRuntimeInvocation } from './dsh-entry.ts';

type Message = { jsonrpc?: string; id?: number | string; method?: string; params?: any; result?: any; error?: unknown };
type Pending = { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout };
export type DshObservation = { kind: 'process-start'; pid: number | undefined } | { kind: 'model-request'; sessionId: string; count: number; toolCount: number } | { kind: 'session-released'; sessionId: string; remaining: number };
export type DshAcpServerOptions = { spawnProcess?: typeof spawn; requestTimeoutMs?: number; generationTimeoutMs?: number; closeTimeoutMs?: number; onObservation?: (event: DshObservation) => void };
const cancelled = () => agentFailure('agent_run_cancelled', '生成已取消。', 409);
const transportClosed = () => agentFailure('agent_transport_closed', 'DSH 专用连接已关闭。', 503);
const plain = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const choices = (option: any): { value: string; name?: string }[] => Array.isArray(option?.options) ? option.options.flatMap((item: any) => Array.isArray(item.options) ? choices(item) : typeof item.value === 'string' ? [item] : []) : [];

/** ACP over one owned DSH process, with an installed-native ephemeral composition. */
export class DshAcpServer implements AgentExecutionProvider {
  readonly instanceId = crypto.randomUUID();
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private dead = false;
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(message: Message) => void>();
  private runtime: any = null;
  private directory: string | null = null;
  private fingerprint: string | null = null;
  private configurationFiles: string[] = [];
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private registration: DshAgentRegistration;
  private options: DshAcpServerOptions;
  constructor(registration: DshAgentRegistration, options: DshAcpServerOptions = {}) { this.registration = registration; this.options = options; }
  get alive() { return this.child !== null && !this.dead && !this.closing; }
  private observe(event: DshObservation) { try { this.options.onObservation?.(event); } catch { /* Observations do not change execution. */ } }
  private currentFingerprint(): string {
    const hash = crypto.createHash('sha256');
    const known = ['profiles/desktop/package.json', 'profiles/desktop/cordis.patch.yml', 'cordis.patch.yml', '.env'].map(file => path.join(this.registration.dshHome, file));
    for (const file of [...new Set([...known, ...this.configurationFiles])].sort()) {
      hash.update(file);
      try {
        const archiveEnd = file.indexOf('.asar' + path.sep);
        if (archiveEnd >= 0) {
          // The host cannot read Electron's virtual ASAR paths. The carrier
          // archive's observed version covers changes to its bundled layers.
          const stat = fs.statSync(file.slice(0, archiveEnd + 5)); hash.update(String(stat.size) + ':' + String(stat.mtimeMs));
        } else hash.update(fs.readFileSync(file));
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw agentFailure('agent_native_config_unavailable', 'DSH 原生配置无法读取，未发送生成内容。', 422); }
    }
    return hash.digest('hex');
  }
  private fail(error: Error) {
    if (this.dead) return;
    this.dead = true; this.rejectReady?.(error);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
    for (const listener of this.listeners) listener({ method: '$buildr/closed', error });
  }
  private write(message: Message) {
    if (!this.child || this.dead) throw transportClosed();
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n', error => { if (error) this.fail(transportClosed()); });
  }
  private receive(line: string) {
    if (this.dead) return;
    let message: Message;
    try { message = JSON.parse(line); if (!plain(message)) throw new Error(); }
    catch { this.fail(agentFailure('agent_protocol_invalid', 'DSH 返回了无效协议数据。', 502)); void this.close(); return; }
    if (message.method && message.id !== undefined) {
      this.write({ id: message.id, error: { code: -32601, message: 'Buildr generation does not authorize client tools or permissions.' } });
      this.fail(agentFailure('agent_unexpected_tool_execution', 'DSH 请求了未授权的工具或权限；已有说明保持。', 502)); void this.close(); return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error !== undefined) pending.reject(agentFailure('agent_protocol_request_failed', 'DSH 未接受本次请求，请核对原生模型路由、登录状态或接入版本。', 502));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === '$buildr/ready') {
      if (message.params?.version !== this.registration.version || message.params?.ephemeral !== true || message.params?.toolCount !== 0 || message.params?.automaticContext !== false || message.params?.conversationLogUpload !== false) {
        this.fail(agentFailure('agent_generation_permissions_unconfirmed', 'DSH 未确认临时生成和工具限制，未发送生成内容。', 502)); void this.close(); return;
      }
      this.runtime = message.params;
      let unchanged = false;
      try { unchanged = this.currentFingerprint() === this.fingerprint; } catch (error) { this.fail(error as Error); void this.close(); return; }
      if (!unchanged) {
        this.fail(agentFailure('agent_native_configuration_changed', 'DSH 原生配置在准备期间发生变化，未发送生成内容；请重试。', 409)); void this.close(); return;
      }
      if (Array.isArray(message.params.configurationFiles) && message.params.configurationFiles.length > 0 && message.params.configurationFiles.length <= 256 && typeof message.params.configurationFingerprint === 'string' && /^[a-f0-9]{64}$/.test(message.params.configurationFingerprint) && message.params.configurationFiles.every((file: unknown) => typeof file === 'string' && path.isAbsolute(file) && !/[\0\r\n]/.test(file))) {
        this.configurationFiles = message.params.configurationFiles;
        let observed: string;
        try { observed = this.currentFingerprint(); } catch (error) { this.fail(error as Error); void this.close(); return; }
        if (observed !== message.params.configurationFingerprint) { this.fail(agentFailure('agent_native_configuration_changed', 'DSH 原生配置在准备期间发生变化，未发送生成内容；请重试。', 409)); void this.close(); return; }
        this.fingerprint = observed;
      } else {
        this.fail(agentFailure('agent_native_configuration_unconfirmed', 'DSH 未确认本次实际加载的配置来源，未发送生成内容。', 502)); void this.close(); return;
      }
      this.resolveReady?.();
    }
    if (message.method === '$buildr/start-failed') {
      const reasons: Record<string, string> = {
        agent_native_inline_credentials_unsupported: 'DSH 路由包含内联凭据，当前不能安全桥接；请使用原生凭据引用。',
        agent_native_model_unconfirmed: 'DSH 桌面默认模型无法确认。',
        agent_native_route_unconfirmed: 'DSH 桌面模型路由无法确认。',
        agent_generation_permissions_unconfirmed: 'DSH 本次工具禁用无法确认。',
        agent_native_configuration_changed: 'DSH 原生配置在准备期间发生变化，请重试。',
      };
      const code = Object.hasOwn(reasons, message.params?.reason || '') ? message.params.reason : 'agent_native_composition_unavailable';
      this.fail(agentFailure(code, (reasons[code] || 'DSH 原生临时服务组合无法准备。') + ' 未发送生成内容。', 422));
    }
    if (message.method === '$buildr/model-request') this.observe({ kind: 'model-request', sessionId: message.params?.sessionId, count: message.params?.count, toolCount: message.params?.toolCount });
    if (message.method === '$buildr/session-released') this.observe({ kind: 'session-released', sessionId: message.params?.sessionId, remaining: message.params?.remaining });
    if (message.method) for (const listener of this.listeners) listener(message);
  }
  private request(method: string, params: unknown, timeoutMs = this.options.requestTimeoutMs ?? 10_000): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(agentFailure('agent_protocol_timeout', 'DSH 协议请求超时。', 504)); }, timeoutMs);
      timer.unref(); this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      if (this.dead || this.closing) throw transportClosed();
      const invocation = dshRuntimeInvocation(this.registration.executable);
      this.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-'));
      this.fingerprint = this.currentFingerprint();
      const prepared = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
      void prepared.catch(() => {});
      const env = { ...process.env, DSH_HOME: this.registration.dshHome, DSH_TELEMETRY_DISABLED: '1', BUILDR_DSH_INSTALL_ANCHOR: invocation.anchor, BUILDR_DSH_TEMP_DIR: this.directory };
      if (invocation.electron) Object.assign(env, { ELECTRON_RUN_AS_NODE: '1' });
      for (const key of ['CODEX_APP_TOOLS_PIPE_PATH', 'CODEX_MCP_NODE_PATH', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID']) delete (env as NodeJS.ProcessEnv)[key];
      this.child = (this.options.spawnProcess || spawn)(invocation.executable, invocation.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env }) as ChildProcessWithoutNullStreams;
      const child = this.child;
      child.stderr.resume();
      child.stdin.on('error', () => this.fail(transportClosed()));
      child.once('error', () => this.fail(agentFailure('agent_start_failed', '无法启动 DSH 专用实例。', 503)));
      child.once('exit', () => this.fail(agentFailure('agent_process_exited', 'DSH 专用实例已退出。', 503)));
      this.observe({ kind: 'process-start', pid: child.pid });
      let bytes = 0;
      child.stdout.on('data', (chunk: Buffer) => { for (const byte of chunk) { bytes = byte === 10 ? 0 : bytes + 1; if (bytes > 1024 * 1024) { this.fail(agentFailure('agent_protocol_invalid', 'DSH 返回数据超过限制。', 502)); void this.close(); break; } } });
      const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on('line', line => this.receive(line)); child.once('close', () => lines.close());
      const timer = setTimeout(() => this.rejectReady?.(agentFailure('agent_start_timeout', 'DSH 专用实例准备超时。', 504)), this.options.requestTimeoutMs ?? 10_000);
      timer.unref();
      try { await prepared; } finally { clearTimeout(timer); this.resolveReady = null; this.rejectReady = null; }
      const initialized = await this.request('initialize', { protocolVersion: 1, clientInfo: { name: 'buildr', version: '1' }, clientCapabilities: {} });
      if (initialized?.protocolVersion !== 1 || !plain(initialized.agentCapabilities?.sessionCapabilities?.close)) throw agentFailure('agent_handshake_invalid', 'DSH ACP 版本或关闭能力无法确认。', 502);
    })().catch(async error => { await this.close(); throw error; });
    return this.ready;
  }
  async generate(input: AgentProviderGenerationInput): Promise<unknown> {
    if (input.environment) throw agentFailure('agent_environment_unsupported', 'DSH 当前仅支持使用已提供材料生成。', 422);
    const startedAt = Date.now();
    if (this.fingerprint !== null && this.currentFingerprint() !== this.fingerprint) {
      await this.close(); this.child = null; this.dead = false; this.closing = null; this.ready = null; this.runtime = null;
    }
    await this.start();
    if (input.signal.aborted) throw cancelled();
    const deadline = startedAt + (input.execution?.timeoutMs ?? this.options.generationTimeoutMs ?? 60_000);
    const budget = Math.max(1, deadline - Date.now());
    let sessionId: string | null = null;
    let output = '', requestCount = 0, unsafe = false, released = false;
    const listener = (message: Message) => {
      if (message.method === '$buildr/unsafe-tool') { unsafe = true; void this.close(); }
      if (!sessionId || message.params?.sessionId !== sessionId) return;
      if (message.method === '$buildr/model-request') { requestCount++; if (message.params.count !== 1 || message.params.toolCount !== 0) { unsafe = true; void this.close(); } }
      if (message.method === '$buildr/session-released') released = message.params.remaining === 0;
      if (message.method === 'session/update') {
        const update = message.params.update;
        if (['tool_call', 'tool_call_update'].includes(update?.sessionUpdate)) { unsafe = true; void this.close(); }
        if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
          output += update.content.text;
          if (Buffer.byteLength(output) > 128 * 1024) { unsafe = true; void this.close(); }
        }
      }
    };
    this.listeners.add(listener);
    let cancelTimer: NodeJS.Timeout | undefined;
    const abort = () => {
      try { if (sessionId && this.alive) this.write({ method: 'session/cancel', params: { sessionId } }); } catch { void this.close(); }
      cancelTimer ??= setTimeout(() => { void this.close(); }, 2000); cancelTimer.unref();
    };
    input.signal.addEventListener('abort', abort);
    const timer = setTimeout(() => { void this.close(); }, budget); timer.unref();
    try {
      const created = await this.request('session/new', { cwd: input.cwd, mcpServers: [] });
      if (typeof created?.sessionId !== 'string' || !Array.isArray(created.configOptions)) throw agentFailure('agent_protocol_invalid', 'DSH 未返回临时上下文身份或实际配置。', 502);
      sessionId = created.sessionId;
      let configOptions = created.configOptions;
      const expectedModel = JSON.stringify([this.runtime.modelProvider, this.runtime.model]);
      const model = configOptions.find((option: any) => option.id === 'model');
      if (model?.currentValue !== expectedModel) throw agentFailure('agent_execution_config_unconfirmed', 'DSH 未确认原生默认模型，未发送生成内容。', 502);
      if (input.execution?.reasoningEffort) {
        const reasoning = configOptions.find((option: any) => option.id === 'reasoning_effort');
        const available = choices(reasoning);
        const low = ['low', 'minimal'].find(id => available.some(option => option.value === id));
        if (!low) throw agentFailure('agent_execution_config_unconfirmed', 'DSH 本次模型未提供可确认的低推理级别，未发送生成内容。', 422);
        configOptions = (await this.request('session/set_config_option', { sessionId, configId: 'reasoning_effort', value: low }))?.configOptions;
        if (!Array.isArray(configOptions) || configOptions.find((option: any) => option.id === 'reasoning_effort')?.currentValue !== low || configOptions.find((option: any) => option.id === 'model')?.currentValue !== expectedModel) throw agentFailure('agent_execution_config_unconfirmed', 'DSH 未确认本次低推理级别，未发送生成内容。', 502);
      } else if (typeof this.runtime.nativeReasoningEffort === 'string') {
        configOptions = (await this.request('session/set_config_option', { sessionId, configId: 'reasoning_effort', value: this.runtime.nativeReasoningEffort }))?.configOptions;
        if (configOptions?.find((option: any) => option.id === 'reasoning_effort')?.currentValue !== this.runtime.nativeReasoningEffort) throw agentFailure('agent_execution_config_unconfirmed', 'DSH 未确认原生推理配置。', 502);
      }
      const reasoning = configOptions.find((option: any) => option.id === 'reasoning_effort');
      input.onConfigured(readAgentExecutionConfig({ model: this.runtime.model, modelProvider: this.runtime.modelProvider, reasoningEffort: reasoning?.currentValue || null }));
      if (input.signal.aborted) throw cancelled();
      input.onRunning();
      if (input.signal.aborted) throw cancelled();
      const prompt = input.prompt + '\n\nReturn only one JSON object satisfying this JSON Schema. No Markdown fences, commentary, tools, or additional requests.\n' + JSON.stringify(input.outputSchema);
      const settled = await this.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, budget);
      if (input.signal.aborted || settled?.stopReason === 'cancelled') throw cancelled();
      if (unsafe || requestCount !== 1) throw agentFailure('agent_unexpected_tool_execution', 'DSH 未兑现一次无工具生成；已有说明保持。', 502);
      if (settled?.stopReason !== 'end_turn') throw agentFailure('agent_generation_failed', 'DSH 生成未正常完成；已有说明保持。', 502);
      let parsed: unknown;
      try { parsed = JSON.parse(output); } catch { throw agentFailure('agent_output_invalid', 'DSH 未返回合规 JSON 结果；已有说明保持。', 502); }
      return parsed;
    } catch (error) {
      if (input.signal.aborted) throw cancelled();
      if (unsafe) throw agentFailure('agent_unexpected_tool_execution', 'DSH 返回了未授权工具或重复请求；已有说明保持。', 502);
      if (!this.alive && Date.now() >= deadline) throw agentFailure('agent_generation_timeout', 'DSH 生成超时；已有说明保持。', 504);
      throw error;
    } finally {
      clearTimeout(timer); if (cancelTimer) clearTimeout(cancelTimer);
      input.signal.removeEventListener('abort', abort);
      if (sessionId && this.alive) {
        await this.request('session/close', { sessionId }, 2000).catch(async () => this.close());
        if (!released) await this.close();
      }
      this.listeners.delete(listener);
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      const child = this.child;
      if (child) {
        const exited = () => child.pid === undefined || child.exitCode !== null || child.signalCode !== null;
        const wait = (ms: number) => new Promise<void>(resolve => {
          if (exited()) { resolve(); return; }
          const listener = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(() => { child.removeListener('exit', listener); resolve(); }, ms); child.once('exit', listener);
        });
        child.stdin.end(); await wait(this.options.closeTimeoutMs ?? 500);
        if (!exited()) { child.kill('SIGTERM'); await wait(this.options.closeTimeoutMs ?? 500); }
        if (!exited()) { child.kill('SIGKILL'); await wait(this.options.closeTimeoutMs ?? 500); }
        this.fail(transportClosed());
        if (!exited()) throw agentFailure('agent_close_timeout', 'DSH 专用实例未确认退出。', 503);
      } else this.fail(transportClosed());
      if (this.directory) { fs.rmSync(this.directory, { recursive: true, force: true }); this.directory = null; }
    })();
    return this.closing;
  }
}
