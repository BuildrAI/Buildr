import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.ts';
import { agentFailure, readAgentExecutionConfig, type AgentExecutionConfig, type AgentExecutionProvider, type AgentGenerationExecution, type AgentGenerationInput, type AgentRegistration, type AgentRegistryView, type AgentRunView } from '../domain/agent-operations.ts';
import { AgentRegistrationRepository, registrationRevision } from '../persistence/agent-registration-repository.ts';
import { codexEntryAvailable, inspectCodexEntry } from '../infrastructure/codex-entry.ts';
import { CodexAppServer } from '../infrastructure/codex-app-server.ts';
import { dshEntryAvailable, inspectDshEntry } from '../infrastructure/dsh-entry.ts';
import { DshAcpServer } from '../infrastructure/dsh-acp-server.ts';
import { resolveAgentGenerationEnvironment } from '../infrastructure/agent-generation-environment.ts';

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
};
type Pool = { registration: AgentRegistration; client: AgentExecutionProvider | null; activeRunId: string | null; lastExecutionConfig: AgentExecutionConfig | null; activity: number; started: boolean; stopping: boolean; stopFailure: unknown; tail: Promise<unknown>; idleTimer: NodeJS.Timeout | null };
type Run = { view: AgentRunView; controller: AbortController; job: Promise<unknown> | null; settled: boolean };
const final = (view: AgentRunView) => ['succeeded', 'failed', 'cancelled'].includes(view.status);
const entryAvailable = (record: AgentRegistration) => record.kind === 'codex' ? codexEntryAvailable(record) : dshEntryAvailable(record);
const executionProvider = (record: AgentRegistration): AgentExecutionProvider => record.kind === 'codex' ? new CodexAppServer(record) : new DshAcpServer(record);
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
  constructor(options: AgentOperationsOptions) { this.options = options; this.repository = new AgentRegistrationRepository(options.dataRoot); }
  listRegistry(): AgentRegistryView {
    const { registry, revision } = this.repository.read();
    return { revision, defaultAgentId: registry.defaultAgentId, agents: registry.agents.map(record => {
      const pool = this.pools.get(record.id);
      const available = (this.options.available || entryAvailable)(record);
      const runtimeStatus = pool?.stopping ? 'stopping' : !pool?.client?.alive ? pool?.activity ? 'starting' : 'stopped' : pool.activity ? pool.started ? 'running' : 'starting' : 'idle';
      return { id: record.id, kind: record.kind, label: record.label, capabilities: ['structured-generation'], availability: available ? 'available' : 'unavailable', runtimeStatus, lastExecutionConfig: structuredClone(pool?.lastExecutionConfig ?? null), safeReason: available ? null : '已登记的本机入口当前不可用，请由智能体（Agent）重新核对接入。' };
    }) };
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
  private register(entry: Omit<Extract<AgentRegistration, { kind: 'codex' }>, 'id'> | Omit<Extract<AgentRegistration, { kind: 'dsh' }>, 'id'>, expectedRevision: string): AgentRegistryView {
    this.repository.mutate(expectedRevision, registry => {
      const existing = registry.agents.find(record => record.executable === entry.executable && (record.kind === 'codex' && entry.kind === 'codex' && record.codexHome === entry.codexHome || record.kind === 'dsh' && entry.kind === 'dsh' && record.dshHome === entry.dshHome));
      if (existing) Object.assign(existing, entry);
      else {
        if (registry.agents.length >= 32) throw agentFailure('agent_registry_limit', '本机接入数量已达到上限。', 409);
        const record: AgentRegistration = { id: 'agent-' + crypto.randomUUID(), ...entry };
        registry.agents.push(record); registry.defaultAgentId ??= record.id;
      }
      return registry;
    });
    return this.listRegistry();
  }
  selectAgent(input: { agentId: string; expectedRevision: string }): AgentRegistryView {
    if (this.closed) throw agentFailure('agent_operations_closed', 'Buildr 正在退出，不能修改默认选择。', 503);
    this.repository.mutate(input.expectedRevision, registry => {
      if (!registry.agents.some(record => record.id === input.agentId)) throw agentFailure('agent_not_registered', '所选智能体（Agent）尚未接入。', 404);
      registry.defaultAgentId = input.agentId; return registry;
    });
    return this.listRegistry();
  }
  private pool(record: AgentRegistration): Pool {
    const key = record.id;
    let pool = this.pools.get(key);
    if (!pool) { pool = { registration: structuredClone(record), client: null, activeRunId: null, lastExecutionConfig: null, activity: 0, started: false, stopping: false, stopFailure: null, tail: Promise.resolve(), idleTimer: null }; this.pools.set(key, pool); }
    return pool;
  }
  private scheduleIdle(pool: Pool) {
    if (this.closed || pool.activity || !pool.client) return;
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
      if (!active()) return;
      if (!validators.validate(outputSchemaId, output).valid) throw agentFailure('agent_output_invalid', '生成结果不符合本次功能要求，已有说明保持。', 502);
      await waitForRun(Promise.resolve(validateResult?.(output)));
      if (!active()) return;
      run.view.output = output; run.view.status = 'succeeded';
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
