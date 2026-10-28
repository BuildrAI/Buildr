import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentExecutor, AgentRuntime, ConnectionView, LoginObservation, ModelGatewayConfiguration } from '../contracts.ts';
import { expected, fail, nonempty, safeDiagnostic } from '../domain/agent-state.ts';
import type { StoredConnection } from '../domain/agent-state.ts';
import type { ConversationRepository } from '../persistence/conversation-repository.ts';

export class ConnectionApplication {
  private readonly executors: Map<string, AgentExecutor>;
  private readonly gatewayRuntimes = new Map<string, Promise<AgentRuntime>>();
  private readonly runtimes = new Map<string, Promise<AgentRuntime>>();
  private readonly loginUrls = new Map<string, { attemptId: string; url: string }>();
  private readonly loginTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly checking = new Map<string, Promise<ConnectionView>>();
  private readonly opening = new Map<string, AbortController>();
  private readonly lifecycles = new Map<string, number>();
  private readonly modelEpochs = new Map<string, number>();
  private closing = false;

  private readonly options: {
    repository: ConversationRepository;
    root: string;
    executors: AgentExecutor[];
    environment: Record<string, string>;
    generation: string;
    now(): string;
    changed(connection: ConnectionView): void;
  };
  constructor(options: ConnectionApplication['options']) {
    this.options = options;
    this.executors = new Map(options.executors.map(executor => {
      if (!/^[a-z][a-z0-9-]*$/.test(executor.descriptor.id)) fail('agent_provider_invalid', '执行者标识无效。');
      return [executor.descriptor.id, executor];
    }));
    if (this.executors.size !== options.executors.length) fail('agent_provider_duplicate', '执行者标识重复。');
  }

  private stored(id: string): StoredConnection {
    const executor = this.executors.get(id);
    if (!executor) fail('agent_provider_unavailable', '该执行者尚未装配。', 404);
    return this.options.repository.readConnection(id) ?? { view: {
      id, provider: id, label: executor.descriptor.label, revision: 'unconfigured', enabled: false,
      status: 'disconnected', models: [], capabilities: executor.descriptor.capabilities,
    } };
  }
  private save(record: StoredConnection): ConnectionView {
    const prior = record.view.revision === 'unconfigured' ? undefined : record.view.revision;
    record.view.revision = randomUUID();
    // Auth URLs live only in the current login attempt, never in persistent records or event diagnostics.
    if (record.view.loginAttempt) delete record.view.loginAttempt.url;
    this.options.repository.saveConnection(record, prior);
    this.options.changed(structuredClone(record.view));
    return this.get(record.view.id);
  }
  get(id: string, includeLoginUrl = false): ConnectionView {
    const view = structuredClone(this.stored(id).view);
    view.capabilities.maxInputBytes = Math.min(view.capabilities.maxInputBytes, 64 * 1024);
    if (view.capabilities.images) view.capabilities.maxImageBytes = Math.min(view.capabilities.maxImageBytes ?? 8 * 1024 * 1024, 8 * 1024 * 1024);
    if (view.loginAttempt && view.loginAttempt.generation !== this.options.generation && ['initializing', 'waiting-browser', 'checking'].includes(view.loginAttempt.state)) {
      view.loginAttempt.state = 'expired'; view.loginAttempt.diagnostic = '服务已重启，请重新发起官方登录。';
    }
    if (includeLoginUrl && view.loginAttempt) {
      const navigation = this.loginUrls.get(id);
      if (navigation?.attemptId === view.loginAttempt.id) view.loginAttempt.url = navigation.url;
    }
    return view;
  }
  list(): ConnectionView[] { return [...this.executors.keys()].map(id => this.get(id)); }
  programUnavailable(id: string, revision: string, diagnostic: string): ConnectionView {
    const record = this.stored(id); expected(record.view.revision, revision);
    record.view.status = 'failed'; record.view.diagnostic = diagnostic;
    return this.save(record);
  }

  async connect(id: string, input: { expectedRevision: string; executable?: string; programOnly?: boolean }): Promise<ConnectionView> {
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
    const record = this.stored(id); expected(record.view.revision, input.expectedRevision);
    if (input.executable !== undefined) {
      const executable = nonempty(input.executable, '程序路径', 4096);
      if (!path.isAbsolute(executable)) fail('agent_executable_invalid', '请指定真实程序的绝对路径。');
      const stat = fs.statSync(executable, { throwIfNoEntry: false });
      if (!stat?.isFile()) fail('agent_executable_missing', '指定的原生程序不存在。');
      if (record.view.executable && record.view.executable !== executable) fail('agent_configuration_bound', '已有接入不能静默改绑程序，请保留原配置并核对版本。', 409);
      record.view.executable = executable;
    }
    const previousStatus=record.view.status;
    record.view.enabled = true; record.view.status = input.programOnly?(['disconnected','connecting'].includes(previousStatus)?'not-authenticated':previousStatus):'connecting'; delete record.view.diagnostic;
    this.save(record);
    if(input.programOnly){await this.runtime(id);return this.get(id);}
    return this.check(id);
  }
  async runtime(id: string, gateway?: ModelGatewayConfiguration): Promise<AgentRuntime> {
    if (gateway) return this.gatewayRuntime(id, gateway);
    const record = this.stored(id);
    const existing = this.runtimes.get(id);
    if (existing) {
      const runtime = await existing;
      if (!runtime.closed) return runtime; // A healthy owned runtime remains available to stop/reply.
      if (this.runtimes.get(id) === existing) this.runtimes.delete(id);
    }
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
    if (!record.view.enabled) fail('agent_connection_disabled', '请先连接此独立接入。', 409);
    let promise = this.runtimes.get(id);
    if (!promise) {
      const configRoot = path.join(this.options.root, 'connections', id);
      fs.mkdirSync(configRoot, { recursive: true, mode: 0o700 });
      if (fs.lstatSync(configRoot).isSymbolicLink()) fail('agent_configuration_unsafe', '独立配置不能指向符号链接。', 409);
      const executor = this.executors.get(id)!;
      const lifecycle = this.lifecycles.get(id);
      const opening = new AbortController(); this.opening.set(id, opening);
      promise = executor.open({ connectionId: id, configRoot, executable: record.view.executable, environment: this.options.environment, signal: opening.signal,
        ...(record.bindingIdentity ? { binding: { identity: record.bindingIdentity, data: record.bindingData, executable: record.view.executable, configRoot: record.view.configPath } } : {}),
      }).then(async runtime => {
        if (this.closing || opening.signal.aborted || this.lifecycles.get(id) !== lifecycle) { await runtime.close(); fail('agent_service_closing', '接入已断开或智能体服务正在退出。', 503); }
        const current = this.stored(id);
        if (current.bindingIdentity && current.bindingIdentity !== runtime.bindingIdentity) {
          void runtime.close(); fail('agent_binding_changed', '原生程序或独立配置身份已变化，原上下文已保留，请核对兼容来源。', 409);
        }
        current.bindingIdentity = runtime.bindingIdentity;
        current.bindingData = runtime.bindingData;
        current.view.configPath = configRoot;
        current.view.capabilities = runtime.capabilities;
        this.save(current);
        return runtime;
      }).catch(error => { if (this.runtimes.get(id) === promise) this.runtimes.delete(id); throw error; }).finally(() => { if (this.opening.get(id) === opening) this.opening.delete(id); });
      this.runtimes.set(id, promise);
    }
    return promise;
  }
  private async gatewayRuntime(id: string, gateway: ModelGatewayConfiguration): Promise<AgentRuntime> {
    const key = `${id}:${gateway.identity}`;
    const existing = this.gatewayRuntimes.get(key);
    if (existing) {
      const runtime = await existing;
      if (!runtime.closed) return runtime;
      if (this.gatewayRuntimes.get(key) === existing) this.gatewayRuntimes.delete(key);
      // Another observer may already have replaced this exact closed instance.
      const replacement = this.gatewayRuntimes.get(key); if (replacement) return replacement;
    }
    const record = this.stored(id);
    if (!record.view.enabled || this.closing) fail('agent_connection_disabled', '请先准备此智能体程序。', 409);
    const configRoot = path.join(this.options.root, 'connections', id, 'model-bindings', createHash('sha256').update(gateway.identity).digest('hex'));
    const lifecycle = this.lifecycles.get(id);
    const opening = new AbortController(); this.opening.set(key, opening);
    const promise = this.executors.get(id)!.open({ connectionId: id, configRoot, executable: record.view.executable, environment: this.options.environment, signal: opening.signal, gateway, nativeAccountConfigRoot: record.view.configPath ?? path.join(this.options.root, 'connections', id) }).then(async runtime => {
      if (this.closing || opening.signal.aborted || this.lifecycles.get(id) !== lifecycle) { await runtime.close(); fail('agent_connection_disabled', '接入已断开。', 409); }
      return runtime;
    }).catch(error => { if (this.gatewayRuntimes.get(key) === promise) this.gatewayRuntimes.delete(key); throw error; }).finally(() => { this.opening.delete(key); });
    this.gatewayRuntimes.set(key, promise); return promise;
  }
  binding(id: string): string | undefined { return this.stored(id).bindingIdentity; }
  observeModels(id: string, bindingIdentity: string, models: ConnectionView['models']): ConnectionView {
    const record = this.stored(id);
    if (!this.closing && record.view.enabled && record.bindingIdentity === bindingIdentity) {
      record.view.models = structuredClone(models);
      const view = this.save(record); this.modelEpochs.set(id, (this.modelEpochs.get(id) ?? 0) + 1); return view;
    }
    return this.get(id);
  }
  disable(id: string, revision: string): void {
    const record = this.stored(id); expected(record.view.revision, revision);
    record.view.enabled = false; record.view.status = 'disconnected'; this.save(record);
    this.lifecycles.set(id, (this.lifecycles.get(id) ?? 0) + 1);
    this.checking.delete(id); this.opening.get(id)?.abort();
    for (const [key, opening] of this.opening) if (key.startsWith(`${id}:`)) opening.abort();
  }

  async check(id: string, expectedRevision?: string): Promise<ConnectionView> {
    if (expectedRevision !== undefined) expected(this.stored(id).view.revision, expectedRevision);
    const pending = this.checking.get(id); if (pending) return pending;
    const lifecycle = this.lifecycles.get(id);
    const work = (async () => {
      try {
        const runtime = await this.runtime(id);
        const account = await runtime.inspectAccount();
        let models: ConnectionView['models'] = [];
        let diagnostic = account.diagnostic;
        const modelEpoch = this.modelEpochs.get(id) ?? 0;
        if (account.status === 'ready') {
          try { models = await runtime.models(); }
          catch { diagnostic = '账号可用，但模型目录尚不可读，请重新检查。'; }
        }
        // Login and disconnect can finish while the model directory is being read.
        const record = this.stored(id);
        if (!record.view.enabled || this.closing || this.lifecycles.get(id) !== lifecycle) return this.get(id);
        record.view.status = account.status;
        record.view.account = { label: account.label, loginMethod: account.loginMethod };
        // A native selection can publish a newer catalog while this older check is waiting.
        // Account observations remain useful; stale catalog results (including failures) do not.
        const currentModels = (this.modelEpochs.get(id) ?? 0) === modelEpoch;
        record.view.diagnostic = currentModels ? diagnostic : account.diagnostic;
        if (currentModels) record.view.models = models;
        if (record.view.status === 'ready' && !record.view.models.length) {
          record.view.status = 'failed'; record.view.diagnostic = diagnostic ?? '账号可用，但没有读取到可用模型，请重新检查。';
        }
        return this.save(record);
      } catch (error) {
        const record = this.stored(id);
        if (!record.view.enabled || this.closing || this.lifecycles.get(id) !== lifecycle) return this.get(id);
        record.view.status = 'failed'; record.view.diagnostic = safeDiagnostic(error);
        return this.save(record);
      }
    })().finally(() => { if (this.checking.get(id) === work) this.checking.delete(id); });
    this.checking.set(id, work); return work;
  }

  beginLogin(id: string, expectedRevision: string): ConnectionView {
    if (this.closing) fail('agent_service_closing', '智能体服务正在退出。', 503);
    const record = this.stored(id); expected(record.view.revision, expectedRevision);
    if (!record.view.enabled) fail('agent_connection_disabled', '请先连接此独立接入。', 409);
    if (record.view.loginAttempt && ['initializing', 'waiting-browser', 'checking'].includes(record.view.loginAttempt.state) && record.view.loginAttempt.generation === this.options.generation) return this.get(id, true);
    const attemptId = randomUUID();
    record.view.loginAttempt = { id: attemptId, generation: this.options.generation, state: 'initializing', updatedAt: this.options.now() };
    this.save(record);
    const update = (observation: LoginObservation) => {
      const current = this.stored(id);
      if (current.view.loginAttempt?.id !== attemptId || current.view.loginAttempt.generation !== this.options.generation || ['cancelled', 'expired', 'failed'].includes(current.view.loginAttempt.state)) return;
      if (observation.url) {
        try { const url = new URL(observation.url); if (url.protocol === 'https:') this.loginUrls.set(id, { attemptId, url: url.href }); }
        catch { /* Invalid navigation is not exposed. */ }
      }
      current.view.loginAttempt = { id: attemptId, generation: this.options.generation, state: observation.state, diagnostic: observation.diagnostic, updatedAt: this.options.now() };
      this.save(current);
      if (['completed', 'cancelled', 'expired', 'failed'].includes(observation.state)) {
        clearTimeout(this.loginTimers.get(id)); this.loginTimers.delete(id); this.loginUrls.delete(id);
      }
      if (observation.state === 'completed') void this.check(id);
    };
    const timer = setTimeout(() => {
      update({ state: 'expired', diagnostic: '登录等待已超时，请重新发起。' });
      void this.runtimes.get(id)?.then(runtime => runtime.cancelLogin()).catch(() => {});
    }, 15 * 60_000); timer.unref(); this.loginTimers.set(id, timer);
    void this.runtime(id).then(runtime => runtime.beginLogin(update)).catch(error => update({ state: 'failed', diagnostic: safeDiagnostic(error) }));
    return this.get(id, true);
  }
  loginAttempt(id: string, attemptId: string): ConnectionView {
    const view = this.get(id, true); if (view.loginAttempt?.id !== attemptId) fail('agent_login_attempt_missing', '登录尝试已变化。', 404); return view;
  }
  async cancelLogin(id: string, attemptId: string, revision: string): Promise<ConnectionView> {
    const record = this.stored(id); expected(record.view.revision, revision);
    if (record.view.loginAttempt?.id !== attemptId) fail('agent_login_attempt_missing', '登录尝试已变化。', 404);
    record.view.loginAttempt.state = 'cancelled'; record.view.loginAttempt.updatedAt = this.options.now();
    this.loginUrls.delete(id); clearTimeout(this.loginTimers.get(id)); this.loginTimers.delete(id);
    this.save(record);
    await this.runtimes.get(id)?.then(runtime => runtime.cancelLogin());
    return this.get(id);
  }
  async disconnect(id: string, revision: string): Promise<ConnectionView> {
    const record = this.stored(id); expected(record.view.revision, revision);
    record.view.enabled = false; record.view.status = 'disconnected';
    this.save(record);
    clearTimeout(this.loginTimers.get(id)); this.loginTimers.delete(id); this.loginUrls.delete(id);
    const runtime = this.runtimes.get(id); this.runtimes.delete(id);
    if (runtime) await runtime.then(item => item.close());
    const shared = [...this.gatewayRuntimes].filter(([key]) => key.startsWith(`${id}:`));
    for (const [key] of shared) this.gatewayRuntimes.delete(key);
    await Promise.allSettled(shared.map(async ([, item]) => (await item).close()));
    return this.get(id);
  }
  async close(): Promise<void> {
    this.closing = true;
    for (const controller of this.opening.values()) controller.abort();
    for (const timer of this.loginTimers.values()) clearTimeout(timer);
    this.loginTimers.clear(); this.loginUrls.clear();
    const runtimes = [...this.runtimes.values(), ...this.gatewayRuntimes.values()]; this.runtimes.clear(); this.gatewayRuntimes.clear();
    await Promise.allSettled(runtimes.map(async runtime => (await runtime).close()));
  }
  activity() { return [{kind:'connection-operation',count:this.opening.size+this.checking.size},{kind:'native-login',count:this.list().filter(value=>['initializing','waiting-browser','checking'].includes(value.loginAttempt?.state??'')).length}].filter(value=>value.count>0); }
  beginClosing(): void { this.closing = true; }
}
