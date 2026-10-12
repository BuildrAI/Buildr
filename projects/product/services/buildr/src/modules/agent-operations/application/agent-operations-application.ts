import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.ts';
import { agentFailure, readAgentExecutionConfig, type AgentExecutionConfig, type AgentExecutionProvider, type AgentGenerationExecution, type AgentGenerationInput, type AgentRegistration, type AgentRegistryView, type AgentRunView, type CodexAgentRegistration, type CodexConnectInput, type CodexConnectResult, type CodexDesktopConnectionView, type CodexDesktopInstallation, type CodexDiscoveryView, type CodexRemoveResult } from '../domain/agent-operations.ts';
import { AgentRegistrationRepository, registrationRevision } from '../persistence/agent-registration-repository.ts';
import { codexEntryAvailable, inspectCodexEntry } from '../infrastructure/codex-entry.ts';
import { CodexAppServer } from '../infrastructure/codex-app-server.ts';
import { dshEntryAvailable, inspectDshEntry } from '../infrastructure/dsh-entry.ts';
import { DshAcpServer } from '../infrastructure/dsh-acp-server.ts';
import { resolveAgentGenerationEnvironment } from '../infrastructure/agent-generation-environment.ts';
import { codexDiscoveryRevision, discoverCodexInstallations, type DiscoveredCodex } from '../infrastructure/codex-discovery.ts';

export type { AgentExecutionProvider } from '../domain/agent-operations.ts';
export type AgentOperationsOptions = {
  dataRoot: string;
  inspectEntry?: typeof inspectCodexEntry;
  inspectDshEntry?: typeof inspectDshEntry;
  available?: (record: AgentRegistration) => boolean;
  providerFactory?: (record: AgentRegistration) => AgentExecutionProvider;
  idleMs?: number;
  maxRuns?: number;
  closeWaitMs?: number;
  discoverCodex?: (registrations: readonly CodexAgentRegistration[]) => DiscoveredCodex[];
};
export type CodexDesktopConnector = { connect(registration: CodexAgentRegistration, installation: CodexDesktopInstallation): Promise<CodexDesktopConnectionView>; disconnect(agentId: string): void };
type Pool = { registration: AgentRegistration; client: AgentExecutionProvider | null; activeRunId: string | null; lastExecutionConfig: AgentExecutionConfig | null; activity: number; started: boolean; stopping: boolean; stopFailure: unknown; tail: Promise<unknown>; idleTimer: NodeJS.Timeout | null };
type Run = { view: AgentRunView; controller: AbortController; job: Promise<unknown> | null; settled: boolean };
const final = (view: AgentRunView) => ['succeeded', 'failed', 'cancelled'].includes(view.status);
const entryAvailable = (record: AgentRegistration) => record.kind === 'codex' ? codexEntryAvailable(record) : dshEntryAvailable(record);
const executionProvider = (record: AgentRegistration): AgentExecutionProvider => record.kind === 'codex' ? new CodexAppServer(record) : new DshAcpServer(record);
const codexEntryKey = (record: Pick<CodexAgentRegistration, 'executable' | 'codexHome'>) => JSON.stringify([record.executable, record.codexHome]);
function captureExecution(input?: AgentGenerationExecution): AgentGenerationExecution | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['reasoningEffort', 'timeoutMs'].includes(key)) || input.reasoningEffort !== undefined && input.reasoningEffort !== 'low' || input.timeoutMs !== undefined && (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 300_000)) throw agentFailure('agent_execution_input_invalid', '本次生成执行参数无效。');
  return { ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}), ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) };
}

export class AgentOperationsApplication {
  private repository: AgentRegistrationRepository;
  private pools = new Map<string, Pool>();
  private runs = new Map<string, Run>();
  private closed = false;
  private closing: Promise<void> | null = null;
  private options: AgentOperationsOptions;
  private desktopConnector: CodexDesktopConnector | null = null;
  private codexRemovals = new Set<string>();
  private codexConnectionsPreparing = new Map<string, number>();
  constructor(options: AgentOperationsOptions) { this.options = options; this.repository = new AgentRegistrationRepository(options.dataRoot); }
  listRegistry(): AgentRegistryView {
    const { registry, revision } = this.repository.read();
    return { revision, defaultAgentId: registry.defaultAgentId, agents: registry.agents.map(record => {
      const pool = this.pools.get(record.id);
      const available = (this.options.available || entryAvailable)(record);
      const runtimeStatus = pool?.stopping ? 'stopping' : !pool?.client?.alive ? pool?.activity ? 'starting' : 'stopped' : pool.activity ? pool.started ? 'running' : 'starting' : 'idle';
      return { id: record.id, kind: record.kind, label: record.kind === 'codex' && record.label === 'Codex（ChatGPT）' ? 'Codex' : record.label, capabilities: ['structured-generation'], availability: available ? 'available' : 'unavailable', runtimeStatus, lastExecutionConfig: structuredClone(pool?.lastExecutionConfig ?? null), safeReason: record.kind === 'codex' && pool?.stopFailure ? '专用生成实例尚未确认退出，本项生成暂不可复用；已生成结果保留。' : available ? null : '已登记的本机入口当前不可用，请由智能体（Agent）重新核对接入。' };
    }) };
  }
  bindCodexDesktopConnector(connector: CodexDesktopConnector): void { this.desktopConnector = connector; }
  hasCodexRegistration(agentId: string): boolean { return this.repository.read().registry.agents.some(record => record.id === agentId && record.kind === 'codex'); }
  private assertCodexNotRemoving(record: Pick<CodexAgentRegistration, 'executable' | 'codexHome'>) {
    if (this.codexRemovals.has(codexEntryKey(record))) throw agentFailure('agent_removal_in_progress', '此 Codex 正在移除接入，请等待结果并刷新登记。', 409);
  }
  private discoverCodex(): DiscoveredCodex[] {
    const registrations = this.repository.read().registry.agents.filter((record): record is CodexAgentRegistration => record.kind === 'codex');
    return this.options.discoverCodex ? this.options.discoverCodex(registrations) : discoverCodexInstallations({ registrations, inspectEntry: this.options.inspectEntry });
  }
  listCodexDiscovery(): CodexDiscoveryView {
    const candidates = this.discoverCodex();
    return { revision: codexDiscoveryRevision(candidates), candidates: candidates.map(candidate => structuredClone(candidate.view)) };
  }
  async connectCodex(input: CodexConnectInput): Promise<CodexConnectResult> {
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能接入 Codex。', 503);
    if (typeof input.candidateId !== 'string' || !input.candidateId || typeof input.expectedDiscoveryRevision !== 'string' || !input.expectedDiscoveryRevision || input.makeDefault !== undefined && typeof input.makeDefault !== 'boolean' || input.existingAgentId !== undefined && (typeof input.existingAgentId !== 'string' || !input.existingAgentId.trim() || input.makeDefault === true)) throw agentFailure('agent_request_invalid', 'Codex 接入需要已观察的候选与版本；已有连接维护不能改变默认项。');
    const candidates = this.discoverCodex();
    if (codexDiscoveryRevision(candidates) !== input.expectedDiscoveryRevision) throw agentFailure('agent_discovery_changed', '本机 Codex 安装或配置来源已变化，请刷新候选后确认。', 409);
    const candidate = candidates.find(record => record.view.id === input.candidateId);
    if (!candidate) throw agentFailure('agent_candidate_not_found', '所选 Codex 候选已不可用，请刷新候选。', 404);
    if (!candidate.entry) throw agentFailure('agent_entry_unavailable', candidate.view.safeReason || '所选 Codex 程序或配置来源当前不可用。', 503);
    if (input.existingAgentId !== undefined && !candidate.installation) throw agentFailure('agent_desktop_unavailable', '此接入未发现可重新准备的 Codex 桌面安装；现有独立生成仍可使用。', 503);
    const agentId = this.saveCodexConnection({ kind: 'codex', ...candidate.entry }, candidate.view.registeredAgentId, input);
    let desktop: CodexDesktopConnectionView | null = null, desktopError: CodexConnectResult['desktopError'] = null;
    if (candidate.installation && this.desktopConnector) {
      this.codexConnectionsPreparing.set(agentId, (this.codexConnectionsPreparing.get(agentId) ?? 0) + 1);
      try {
        const registration = this.repository.read().registry.agents.find((record): record is CodexAgentRegistration => record.kind === 'codex' && record.id === agentId)!;
        desktop = await this.desktopConnector.connect(structuredClone(registration), structuredClone(candidate.installation));
      } catch (error) {
        const known = error as { code?: string; message?: string };
        desktopError = { code: known.code?.startsWith('codex_') || known.code?.startsWith('agent_') ? known.code : 'agent_desktop_prepare_failed', message: '生成来源已保存；Codex 桌面连接准备未完成，请重新检查桌面连接状态。' };
      } finally {
        const remaining = this.codexConnectionsPreparing.get(agentId)! - 1;
        if (remaining) this.codexConnectionsPreparing.set(agentId, remaining); else this.codexConnectionsPreparing.delete(agentId);
      }
    }
    return { registry: this.listRegistry(), agentId, desktop, desktopError };
  }
  private saveCodexConnection(entry: Omit<CodexAgentRegistration, 'id'>, registeredAgentId: string | null, input: CodexConnectInput): string {
    this.assertCodexNotRemoving(entry);
    let agentId: string;
    this.repository.mutate(input.expectedRevision, registry => {
      if (input.existingAgentId !== undefined) {
        const target = registry.agents.find(record => record.id === input.existingAgentId);
        if (!target || target.kind !== 'codex') throw agentFailure('agent_codex_connection_target_changed', '要维护的 Codex 接入已不存在或发生变化，请刷新后核对。', 409);
        if (registeredAgentId !== target.id || target.executable !== entry.executable || target.codexHome !== entry.codexHome) throw agentFailure('agent_codex_connection_mismatch', '所选候选不属于这项 Codex 接入，不能替换程序或配置来源。', 409);
        Object.assign(target, entry); agentId = target.id;
      } else {
        if (registry.agents.some(record => record.kind === 'codex')) throw agentFailure('agent_codex_already_connected', 'Codex 已接入，请使用已有条目；如需更换，请先移除接入。', 409);
        if (registry.agents.length >= 32) throw agentFailure('agent_registry_limit', '本机接入数量已达到上限。', 409);
        agentId = 'agent-' + crypto.randomUUID();
        registry.agents.push({ id: agentId, ...entry });
        if (input.makeDefault === true || registry.defaultAgentId === null) registry.defaultAgentId = agentId;
      }
      return registry;
    });
    return agentId!;
  }
  registerCodex(input: { executable: string; codexHome?: string; label?: string; expectedRevision: string }): AgentRegistryView {
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能接入智能体（Agent）。', 503);
    const entry = (this.options.inspectEntry || inspectCodexEntry)(input);
    return this.register({ kind: 'codex', ...entry }, input.expectedRevision);
  }
  registerDsh(input: { executable: string; dshHome?: string; label?: string; expectedRevision: string }): AgentRegistryView {
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能接入智能体（Agent）。', 503);
    const entry = (this.options.inspectDshEntry || inspectDshEntry)(input);
    return this.register({ kind: 'dsh', ...entry }, input.expectedRevision);
  }
  private register(entry: Omit<Extract<AgentRegistration, { kind: 'codex' }>, 'id'> | Omit<Extract<AgentRegistration, { kind: 'dsh' }>, 'id'>, expectedRevision: string, makeDefault = false): AgentRegistryView {
    if (entry.kind === 'codex') this.assertCodexNotRemoving(entry);
    this.repository.mutate(expectedRevision, registry => {
      const existing = registry.agents.find(record => record.executable === entry.executable && (record.kind === 'codex' && entry.kind === 'codex' && record.codexHome === entry.codexHome || record.kind === 'dsh' && entry.kind === 'dsh' && record.dshHome === entry.dshHome));
      if (existing) Object.assign(existing, entry);
      else {
        if (registry.agents.length >= 32) throw agentFailure('agent_registry_limit', '本机接入数量已达到上限。', 409);
        const record: AgentRegistration = { id: 'agent-' + crypto.randomUUID(), ...entry };
        registry.agents.push(record); registry.defaultAgentId ??= record.id;
      }
      if (makeDefault) registry.defaultAgentId = registry.agents.find(record => record.executable === entry.executable && record.kind === entry.kind && (record.kind === 'codex' && entry.kind === 'codex' && record.codexHome === entry.codexHome || record.kind === 'dsh' && entry.kind === 'dsh' && record.dshHome === entry.dshHome))!.id;
      return registry;
    });
    return this.listRegistry();
  }
  selectAgent(input: { agentId: string; expectedRevision: string }): AgentRegistryView {
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能修改默认选择。', 503);
    this.repository.mutate(input.expectedRevision, registry => {
      const selected = registry.agents.find(record => record.id === input.agentId);
      if (!selected) throw agentFailure('agent_not_registered', '所选智能体（Agent）尚未接入。', 404);
      if (selected.kind === 'codex') this.assertCodexNotRemoving(selected);
      registry.defaultAgentId = input.agentId; return registry;
    });
    return this.listRegistry();
  }
  async removeCodex(input: { agentId: string; expectedRevision: string }): Promise<CodexRemoveResult> {
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能移除接入。', 503);
    if (typeof input.agentId !== 'string' || !input.agentId || typeof input.expectedRevision !== 'string' || !input.expectedRevision) throw agentFailure('agent_request_invalid', '移除接入需要明确 Codex 及已观察登记版本。');
    const observed = this.repository.read();
    if (observed.revision !== input.expectedRevision) throw agentFailure('agent_registry_changed', '智能体（Agent）登记或默认选择已变化，请刷新后重试。', 409);
    const registration = observed.registry.agents.find(record => record.id === input.agentId);
    if (!registration) throw agentFailure('agent_not_registered', '此接入已不存在，请刷新登记核对，不重复移除。', 404);
    if (registration.kind !== 'codex') throw agentFailure('agent_kind_unsupported', '本次仅支持移除 Codex 接入，其他智能体（Agent）保持。');
    this.assertCodexNotRemoving(registration);
    const pool = this.pools.get(registration.id);
    if (pool?.activity || this.codexConnectionsPreparing.get(registration.id) || [...this.runs.values()].some(run => run.view.agentId === registration.id && !final(run.view))) throw agentFailure('agent_codex_busy', '此 Codex 仍有生成或桌面连接准备，请先等待结束或取消已有生成，再移除接入。', 409);
    const key = codexEntryKey(registration);
    this.codexRemovals.add(key);
    let removed = false;
    try {
      if (pool) {
        if (pool.idleTimer) { clearTimeout(pool.idleTimer); pool.idleTimer = null; }
        pool.stopping = true;
        try {
          // An idle close may already be pending. Its completion precedes the
          // removal's own exit confirmation; no new work can enter this scope.
          const client = pool.client, tail = pool.tail;
          let timer: NodeJS.Timeout | undefined;
          const closing = (async () => {
            await tail.catch(error => { pool.stopFailure = error; });
            if (client) {
              await client.close();
              if (client.alive) throw agentFailure('agent_close_timeout', 'Codex 自有服务仍在运行。', 503);
            } else if (pool.stopFailure) throw pool.stopFailure;
          })();
          try {
            await Promise.race([closing, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(agentFailure('agent_close_timeout', 'Codex 自有服务退出确认超时。', 503)), this.options.closeWaitMs ?? 2000); })]);
          } finally { if (timer) clearTimeout(timer); }
          pool.client = null; pool.started = false; pool.stopFailure = null;
        } catch (error) {
          pool.stopFailure = error;
          throw agentFailure('agent_close_timeout', 'Codex 自有生成服务尚未确认退出，接入已保留；本项暂不能复用或启动替代服务。', 503);
        } finally { pool.stopping = false; }
      }
      if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，接入登记已保留，请下次打开后核对。', 503);
      this.repository.mutate(input.expectedRevision, registry => {
        registry.agents = registry.agents.filter(record => record.id !== registration.id);
        if (registry.defaultAgentId === registration.id) registry.defaultAgentId = null;
        return registry;
      });
      removed = true; this.pools.delete(registration.id);
      let desktopWarning: CodexRemoveResult['desktopWarning'] = null;
      try { this.desktopConnector?.disconnect(registration.id); }
      catch { desktopWarning = { code: 'agent_desktop_disconnect_unconfirmed', message: '接入登记已移除，桌面业务调用已停用；断开状态未能保存，原聊天与任务关联保留。' }; }
      return { registry: this.listRegistry(), removedAgentId: registration.id, desktopWarning };
    } finally {
      this.codexRemovals.delete(key);
      if (!removed && pool && !pool.stopping) this.scheduleIdle(pool);
    }
  }
  private pool(record: AgentRegistration): Pool {
    const key = record.id;
    let pool = this.pools.get(key);
    if (!pool) { pool = { registration: structuredClone(record), client: null, activeRunId: null, lastExecutionConfig: null, activity: 0, started: false, stopping: false, stopFailure: null, tail: Promise.resolve(), idleTimer: null }; this.pools.set(key, pool); }
    return pool;
  }
  private scheduleIdle(pool: Pool) {
    if (this.closed || pool.activity || !pool.client || pool.registration.kind === 'codex' && pool.stopFailure) return;
    pool.idleTimer = setTimeout(() => {
      pool.idleTimer = null;
      if (pool.activity || !pool.client) return;
      const client = pool.client; pool.stopping = true;
      pool.tail = client.close().then(() => { if (pool.client === client) { pool.client = null; pool.started = false; } }).catch(error => { pool.stopFailure = error; throw error; }).finally(() => { pool.stopping = false; });
      // Retain a failed close: a new run must not spawn beside a process whose exit is unproved.
      void pool.tail.catch(() => {});
    }, this.options.idleMs ?? 30 * 60 * 1000);
    pool.idleTimer.unref();
  }
  async startGeneration(input: AgentGenerationInput): Promise<AgentRunView> {
    const invokedAt = Date.now();
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能开始生成。', 503);
    if (!path.isAbsolute(input.cwd || '') || typeof input.prompt !== 'string' || !input.prompt.trim() || Buffer.byteLength(input.prompt) > 1024 * 1024 || !input.outputSchema || typeof input.outputSchema !== 'object' || Array.isArray(input.outputSchema)) throw agentFailure('agent_generation_input_invalid', '生成需要明确工作位置、完整有界输入和输出结构。');
    try { if (!fs.statSync(input.cwd).isDirectory()) throw new Error('not directory'); } catch { throw agentFailure('agent_working_directory_unavailable', '本次生成的工作位置当前不可用。', 409); }
    const cwd = fs.realpathSync(input.cwd), prompt = input.prompt, validateResult = input.validateResult;
    const environment = resolveAgentGenerationEnvironment(cwd, input.environment);
    const execution = captureExecution(input.execution);
    const { registry } = this.repository.read(), agentId = input.agentId ?? registry.defaultAgentId;
    const registration = registry.agents.find(record => record.id === agentId);
    if (!registration) throw agentFailure('agent_not_registered', '尚未接入可用于本次生成的智能体（Agent）。', 409);
    if (registration.kind === 'codex') this.assertCodexNotRemoving(registration);
    if (!(this.options.available || entryAvailable)(registration)) throw agentFailure('agent_entry_unavailable', '所选智能体（Agent）的本机入口当前不可用。', 503);
    const outputSchema = structuredClone(input.outputSchema) as Record<string, unknown>;
    let validators: ReturnType<typeof compileJsonSchemaCatalog>;
    const outputSchemaId = 'https://schemas.buildr.ai/internal/agent-generation-output';
    try { validators = compileJsonSchemaCatalog([{ ...outputSchema, $id: outputSchemaId }]); } catch { throw agentFailure('agent_output_schema_invalid', '本次生成的输出结构无效。'); }
    const maxRuns = this.options.maxRuns ?? 128;
    for (const [id, existing] of this.runs) if (this.runs.size >= maxRuns && existing.settled && final(existing.view)) this.runs.delete(id);
    if (this.runs.size >= maxRuns) throw agentFailure('agent_run_capacity', '当前生成数量已达到上限，请等待已有执行结束。', 429);
    const run: Run = { view: { id: 'run-' + crypto.randomUUID(), agentId: registration.id, registrationRevision: registrationRevision(registration), executionConfig: null, status: 'queued', output: null, error: null }, controller: new AbortController(), job: null, settled: false };
    const pool = this.pool(registration); pool.activity++;
    if (pool.idleTimer) { clearTimeout(pool.idleTimer); pool.idleTimer = null; }
    this.runs.set(run.view.id, run);
    const deadline = execution?.timeoutMs === undefined ? null : invokedAt + execution.timeoutMs;
    let deadlineTimer: NodeJS.Timeout | undefined;
    const expire = () => {
      if (final(run.view)) return;
      run.view.status = 'failed'; run.view.error = { code: 'agent_generation_timeout', message: '生成超时，已有说明保持。' };
      run.controller.abort();
    };
    const active = () => {
      if (deadline !== null && Date.now() >= deadline) expire();
      return !run.controller.signal.aborted && !this.closed && !final(run.view);
    };
    const waitForRun = <T>(pending: Promise<T>): Promise<T> => {
      if (deadline === null) return pending;
      return new Promise<T>((resolve, reject) => {
        const abort = () => { run.controller.signal.removeEventListener('abort', abort); reject(agentFailure('agent_run_cancelled', '本次生成已结束。', 409)); };
        run.controller.signal.addEventListener('abort', abort, { once: true });
        pending.then(value => { run.controller.signal.removeEventListener('abort', abort); resolve(value); }, error => { run.controller.signal.removeEventListener('abort', abort); reject(error); });
        if (!active()) abort();
      });
    };
    if (deadline !== null) { deadlineTimer = setTimeout(expire, Math.max(0, deadline - Date.now())); deadlineTimer.unref(); }
    run.job = pool.tail.then(async () => {
      if (!active()) return;
      if (pool.stopFailure) throw pool.stopFailure;
      if (registrationRevision(pool.registration) !== registrationRevision(registration)) {
        // Re-registration shares the identity's queue. Replace only after the
        // previous owned process has actually exited, never beside an old run.
        pool.stopping = true;
        try { if (pool.client) await pool.client.close(); }
        catch (error) { pool.stopFailure = error; throw error; }
        finally { pool.stopping = false; }
        pool.client = null; pool.started = false;
        pool.registration = structuredClone(registration);
        if (!active()) return;
      }
      pool.activeRunId = run.view.id;
      run.view.status = 'starting';
      if (!pool.client?.alive) {
        // A dead transport is not proof that its owned OS process has exited.
        // Prove disposal before replacing any previous provider.
        if (pool.client) await pool.client.close();
        if (!active()) return;
        if (pool.registration.kind === 'codex') {
          const observed = (this.options.inspectEntry || inspectCodexEntry)({ executable: pool.registration.executable, codexHome: pool.registration.codexHome, label: pool.registration.label });
          if (observed.executable !== pool.registration.executable || observed.codexHome !== pool.registration.codexHome || observed.version !== pool.registration.version) throw agentFailure('agent_entry_changed', 'Codex 安装或配置来源与已确认接入不同，请重新发现并确认；现有登记与默认选择保留。', 409);
          if (!active()) return;
        }
        pool.client = (this.options.providerFactory || executionProvider)(pool.registration); pool.started = false;
      }
      await waitForRun(pool.client.start()); pool.started = true;
      if (!active()) return;
      const output = await waitForRun(pool.client.generate({
        cwd, prompt, outputSchema, environment, execution: execution && { ...execution, ...(deadline === null ? {} : { timeoutMs: Math.max(1, deadline - Date.now()) }) }, signal: run.controller.signal,
        onConfigured: config => {
          if (run.controller.signal.aborted || this.closed || final(run.view) || run.view.executionConfig !== null) return;
          run.view.executionConfig = readAgentExecutionConfig(config);
          pool.lastExecutionConfig = structuredClone(run.view.executionConfig);
        },
        onRunning: () => { if (!final(run.view)) run.view.status = 'running'; },
      }));
      const cleanupWarning = registration.kind === 'codex' ? pool.client.cleanupWarning : null;
      if (cleanupWarning) pool.stopFailure = agentFailure(cleanupWarning.code, cleanupWarning.message, 503);
      if (!active()) return;
      if (!validators.validate(outputSchemaId, output).valid) throw agentFailure('agent_output_invalid', '生成结果不符合本次功能要求，已有说明保持。', 502);
      await waitForRun(Promise.resolve(validateResult?.(output)));
      if (!active()) return;
      run.view.output = output; run.view.status = 'succeeded';
      if (cleanupWarning && registration.kind === 'codex') run.view.cleanupWarning = structuredClone(cleanupWarning);
    }).catch(async error => {
      if (pool.client && !pool.client.alive) {
        try { await pool.client.close(); }
        catch (closeError) { pool.stopFailure = closeError; error = closeError; }
      }
      if (run.controller.signal.aborted || this.closed) { if (!final(run.view)) run.view.status = 'cancelled'; return; }
      if (final(run.view)) return;
      const known = error as { code?: string; message?: string };
      if (known.code === 'agent_close_timeout') pool.stopFailure = error;
      run.view.status = 'failed'; run.view.error = { code: known.code || 'agent_generation_failed', message: known.code?.startsWith('agent_') || known.code?.startsWith('code_') ? known.message || '生成未完成。' : '生成未完成，已有说明保持。' };
    }).finally(async () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (deadline !== null && run.controller.signal.aborted && pool.activeRunId === run.view.id && pool.client) {
        try { await pool.client.close(); }
        catch (closeError) { pool.stopFailure = closeError; }
      }
      if (pool.activeRunId === run.view.id) pool.activeRunId = null;
      run.settled = true; pool.activity--; this.scheduleIdle(pool);
    });
    pool.tail = run.job;
    return structuredClone(run.view);
  }
  getRun(id: string): AgentRunView {
    const run = this.runs.get(id);
    if (!run) throw agentFailure('agent_run_not_found', '本次生成不存在或已超过保留范围。', 404);
    return structuredClone(run.view);
  }
  cancelRun(id: string): AgentRunView {
    const run = this.runs.get(id);
    if (!run) throw agentFailure('agent_run_not_found', '本次生成不存在或已超过保留范围。', 404);
    if (!final(run.view)) { run.view.status = 'cancelled'; run.controller.abort(); }
    return structuredClone(run.view);
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      for (const run of this.runs.values()) if (!final(run.view)) { run.view.status = 'cancelled'; run.controller.abort(); }
      const closes: Promise<void>[] = [];
      for (const pool of this.pools.values()) { if (pool.idleTimer) clearTimeout(pool.idleTimer); pool.stopping = true; if (pool.client) closes.push(pool.client.close()); }
      const results = await Promise.allSettled(closes);
      // Business result validation may be awaiting an independent read. Once
      // providers are closed and views cancelled it cannot publish a late result
      // or hold application shutdown indefinitely.
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([Promise.allSettled([...this.runs.values()].map(run => run.job)), new Promise<void>(resolve => { timer = setTimeout(resolve, this.options.closeWaitMs ?? 2000); })]);
      if (timer) clearTimeout(timer);
      if (results.some(result => result.status === 'rejected')) throw agentFailure('agent_close_incomplete', '一个智能体（Agent）专用实例尚未确认退出。', 503);
    })();
    return this.closing;
  }
}
export function createAgentOperationsApplication(options: AgentOperationsOptions) { return new AgentOperationsApplication(options); }
