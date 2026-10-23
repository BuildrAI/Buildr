import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseRuntimeDefinition, RuntimeDefinitionError, type ServiceRuntimeDefinition, type RuntimeDiscoveryBackend } from '../domain/runtime-definition.ts';
import { ServiceRuntimeError } from '../domain/errors.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import { createReadinessMatcher, isActiveRun, nextAvailablePort, type ManagedRunRecord, type RunConnection, type RunDiscoveryConnection } from '../domain/runs.ts';
import { localRoutingHostId, readLocalRoutingObservation, writeLocalRoutingContext, type RoutingStartPlan } from '../infrastructure/local-routing-context.ts';
import { matchesProcessIdentity, processAlive, probeHttpStatus, probePortAvailable, startManagedProcess, terminateVerifiedProcess, type ManagedProcess } from '../infrastructure/managed-process.ts';
import { withRuntimeLock } from '../infrastructure/runtime-lock.ts';
import { readRuntimeDefinition, writeRuntimeDefinition } from '../persistence/runtime-definition-repository.ts';
import { appendRunLog, listRunRecords, readRunLogTail, readRunRecord, runLogPath, writeRunRecord } from '../persistence/runs-repository.ts';

export { ServiceRuntimeError, RuntimeDefinitionError };
export type ExpectedWorktree = { path: string; branch: string | null; head: string | null; dirty: boolean | null };
export type BackendTarget = { serviceCode: string; target: 'auto' | 'remote' | 'run'; runId?: string; expectedRunId?: string | null };
export type StartRunInput = {
  serviceCode: string;
  worktreeId: string;
  origin?: 'human' | 'agent';
  taskId?: string;
  connection?: 'local' | 'remote';
  backendTargets?: BackendTarget[];
  expectedWorktree?: ExpectedWorktree;
  expectedBackendRunId?: string;
  expectedRoutingDigest?: string;
};
export type BackendCandidate = { runId: string; url: string; worktreeLabel: string; branch: string | null; sameScope: boolean };
export type LocalBackendAvailability = {
  serviceCode: string;
  kind?: 'direct-url' | 'service-discovery';
  serviceId?: string;
  state?: 'ready' | 'missing' | 'pending' | 'ambiguous';
  environmentVariable: string | null;
  remoteUrl: string | null;
  candidates: BackendCandidate[];
  target: { runId: string; serviceCode: string; url: string; worktreeLabel: string; branch: string | null } | null;
  reason: string | null;
};
export type RestartRunInput = Pick<StartRunInput, 'connection' | 'backendTargets' | 'expectedWorktree' | 'expectedBackendRunId' | 'expectedRoutingDigest' | 'origin'>;
export type ServiceRuntimeDeps = {
  resolveService(targetRoot: string, serviceCode: string): { id: string; code: string; workspaceId?: string } | null;
  listWorktrees(targetRoot: string, serviceCode: string, taskId?: string): ServiceWorktree[];
  startProcess?: typeof startManagedProcess;
  assertTaskScope?(targetRoot: string, taskId: string, serviceCode: string): void;
  now?(): string;
  newId?(): string;
};

const DEFAULT_LOG_TAIL_BYTES = 256 * 1024;
const MAX_LOG_TAIL_BYTES = 4 * 1024 * 1024;

function serviceDirectory(worktree: ServiceWorktree, relative: string): string {
  try {
    const root = fs.realpathSync(worktree.path);
    const cwd = fs.realpathSync(path.resolve(root, relative));
    const difference = path.relative(root, cwd);
    if (difference.startsWith('..' + path.sep) || difference === '..' || path.isAbsolute(difference) || !fs.statSync(cwd).isDirectory()) throw new Error('目录越界');
    return cwd;
  } catch { throw new ServiceRuntimeError('service_runtime_directory_invalid', '运行目录不可用或真实路径超出所选服务目录，请重新核对配置。'); }
}

function checkObservation(worktree: ServiceWorktree, expected: ExpectedWorktree | undefined) {
  if (expected && (path.resolve(expected.path) !== path.resolve(worktree.path) || expected.branch !== worktree.branch || expected.head !== worktree.head || expected.dirty !== worktree.dirty)) {
    throw new ServiceRuntimeError('service_runtime_source_changed', '代码来源、分支、提交或未提交状态已变化，请刷新后重新启动。');
  }
}

export function createServiceRuntimeApplication(deps: ServiceRuntimeDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const startProcess = deps.startProcess ?? startManagedProcess;
  const owned = new Map<string, ManagedProcess>();
  const timers = new Map<string, NodeJS.Timeout>();
  const refreshing = new Set<string>();
  const key = (root: string, id: string) => `${path.resolve(root)}:${id}`;

  function assertService(root: string, code: string) {
    const service = deps.resolveService(root, code);
    if (!service) throw new ServiceRuntimeError('service_runtime_service_unknown', `服务未登记：${code}`);
    return service;
  }
  function clearWatch(root: string, id: string) {
    const identity = key(root, id);
    const timer = timers.get(identity);
    if (timer) clearInterval(timer);
    timers.delete(identity);
  }
  async function updateActive(root: string, id: string, update: (current: ManagedRunRecord) => ManagedRunRecord | Promise<ManagedRunRecord>) {
    return withRuntimeLock(root, async () => {
      const current = readRunRecord(root, id);
      if (!current || !isActiveRun(current)) return current;
      const next = await update(current);
      await writeRunRecord(root, next);
      if (next.status !== 'starting') clearWatch(root, id);
      return next;
    });
  }
  async function terminate(root: string, record: ManagedRunRecord) {
    const managed = owned.get(key(root, record.id));
    if (managed) await managed.kill();
    else if (matchesProcessIdentity(record.processIdentity)) await terminateVerifiedProcess(record.processIdentity!);
    else if (processAlive(record.pid)) throw new ServiceRuntimeError('service_runtime_process_unverified', '不能证明该进程属于此运行，未发送终止信号；请核对实际服务进程。');
  }

  async function observe(root: string, id: string): Promise<void> {
    const record = readRunRecord(root, id);
    if (!record || !isActiveRun(record)) { clearWatch(root, id); return; }
    if (!processAlive(record.pid)) {
      await updateActive(root, id, current => processAlive(current.pid) ? current : ({ ...current, status: current.status === 'failed' || current.status === 'starting' ? 'failed' : 'stopped', stoppedAt: now(), failure: current.status === 'failed' ? current.failure : current.status === 'starting' ? '进程在就绪前退出。' : null }));
      return;
    }
    if (!record.processIdentity) {
      await updateActive(root, id, current => current.processIdentity ? current : ({ ...current, failure: current.failure || '旧记录缺少可验证进程身份，当前状态与终止操作需要重新核对；未接管其他进程。' }));
      return;
    }
    if (!matchesProcessIdentity(record.processIdentity)) {
      await updateActive(root, id, current => matchesProcessIdentity(current.processIdentity) ? current : ({ ...current, status: 'failed', stoppedAt: now(), failure: '受管进程身份已变化；未接管或终止当前同号进程。' }));
      return;
    }
    if (record.status !== 'starting' || !record.launch) return;
    const launch = record.launch;
    const matcher = createReadinessMatcher(launch.readiness);
    const expired = Date.now() > Date.parse(record.startedAt) + launch.timeoutSeconds * 1000;
    if (expired) {
      await updateActive(root, id, async current => {
        if (current.status !== 'starting') return current;
        await terminate(root, current);
        const failure = `就绪检查超时（${launch.timeoutSeconds}s），已停止受管进程。`;
        await appendRunLog(root, id, `[buildr] ${failure}\n`);
        return { ...current, status: 'failed', stoppedAt: now(), failure };
      });
      return;
    }
    const status = matcher.kind === 'http' ? await probeHttpStatus(record.actualPort, launch.readiness.kind === 'http' ? launch.readiness.path : '/') : null;
    const ready = matcher.kind === 'log'
      ? Boolean(matcher.testLine?.(readRunLogTail(root, id, MAX_LOG_TAIL_BYTES).log))
      : status !== null && matcher.testHttp?.(status) === true;
    if (ready) await updateActive(root, id, current => current.status === 'starting' && matchesProcessIdentity(current.processIdentity) ? { ...current, status: 'running', failure: null } : current);
  }

  function watch(root: string, id: string) {
    const identity = key(root, id);
    if (timers.has(identity)) return;
    const timer = setInterval(() => {
      if (refreshing.has(identity)) return;
      refreshing.add(identity);
      void observe(root, id).catch(error => appendRunLog(root, id, `[buildr] 状态检查失败：${(error as Error).message}\n`).catch(() => undefined)).finally(() => refreshing.delete(identity));
    }, 300);
    timer.unref?.();
    timers.set(identity, timer);
  }

  async function reconcile(root: string): Promise<ManagedRunRecord[]> {
    for (const record of listRunRecords(root)) {
      if (!isActiveRun(record)) continue;
      await observe(root, record.id);
      const current = readRunRecord(root, record.id);
      if (current?.status === 'starting' && current.processIdentity && current.launch) watch(root, current.id);
    }
    return listRunRecords(root);
  }

  function readyBackendRuns(root: string, serviceCode: string): ManagedRunRecord[] {
    return listRunRecords(root).filter(run => run.serviceCode === serviceCode && run.status === 'running' && matchesProcessIdentity(run.processIdentity));
  }

  function routingIdentity(root: string, worktree: ServiceWorktree, serviceCode: string): RoutingStartPlan {
    if (!worktree.taskId || worktree.main) throw new ServiceRuntimeError('service_runtime_lane_task_required', '服务发现泳道只支持明确任务的本地工作树。');
    const workspaceId = assertService(root, serviceCode).workspaceId;
    if (!workspaceId) throw new ServiceRuntimeError('service_runtime_lane_workspace_unknown', '服务的工作空间身份未知，不能生成泳道上下文。');
    const hostId = localRoutingHostId();
    const active = listRunRecords(root).filter(run => run.taskId === worktree.taskId && isActiveRun(run) && run.routing);
    const lanes = new Set(active.map(run => run.routing!.laneId));
    if (lanes.size > 1 || active.some(run => run.routing!.workspaceId !== workspaceId || run.routing!.hostId !== hostId)) throw new ServiceRuntimeError('service_runtime_lane_ambiguous', '同任务活跃泳道身份存在冲突，请核对当前运行。');
    return { laneId: [...lanes][0] ?? randomUUID(), workspaceId, hostId, taskId: worktree.taskId, members: {} };
  }

  function sameConnections(left: RunConnection[] | null, right: RunConnection[] | null) {
    const identity = (items: RunConnection[] | null) => (items ?? []).map(item => item.kind === 'service-discovery' ? { ...item, reason: undefined } : item);
    return JSON.stringify(identity(left)) === JSON.stringify(identity(right));
  }

  function sameScope(run: ManagedRunRecord, worktree: ServiceWorktree): boolean {
    return worktree.taskId ? run.main === false && run.taskId === worktree.taskId : worktree.main && run.main === true && !run.taskId;
  }

  function localBackendAvailabilities(root: string, worktree: ServiceWorktree, definition: ServiceRuntimeDefinition): LocalBackendAvailability[] {
    return (definition.local.backends ?? []).map(backend => {
      const discovery = backend.kind === 'service-discovery';
      const runs = readyBackendRuns(root, backend.serviceCode).filter(run => !discovery || sameScope(run, worktree) && run.routing?.serviceId === backend.serviceId && run.routing.hostId === localRoutingHostId());
      const scoped = runs.filter(run => sameScope(run, worktree));
      const activeCount = discovery ? listRunRecords(root).filter(run => run.serviceCode === backend.serviceCode && sameScope(run, worktree) && isActiveRun(run)).length : 0;
      const candidates = [...runs].sort((left, right) => Number(sameScope(right, worktree)) - Number(sameScope(left, worktree)) || left.startedAt.localeCompare(right.startedAt))
        .map(run => ({ runId: run.id, url: run.url, worktreeLabel: run.worktreeLabel, branch: run.branch, sameScope: sameScope(run, worktree) }));
      const target = scoped.length === 1 && (!discovery || activeCount === 1) ? scoped[0]! : null;
      return {
        serviceCode: backend.serviceCode,
        ...(discovery ? { kind: 'service-discovery' as const, serviceId: backend.serviceId, state: target ? 'ready' as const : activeCount > 1 ? 'ambiguous' as const : activeCount ? 'pending' as const : 'missing' as const } : {}),
        environmentVariable: discovery ? null : backend.environmentVariable,
        remoteUrl: discovery ? null : backend.remoteUrl,
        candidates,
        target: target ? { runId: target.id, serviceCode: backend.serviceCode, url: target.url, worktreeLabel: target.worktreeLabel, branch: target.branch } : null,
        reason: target ? null : scoped.length > 1 ? '同范围存在多个本地后端实例，请显式选择目标。' : '同任务或主工作库没有已就绪的本地后端，请先启动后端。',
      };
    });
  }

  function resolveDiscovery(root: string, worktree: ServiceWorktree, backend: RuntimeDiscoveryBackend,
    input: Pick<StartRunInput, 'connection'>, selected: BackendTarget | undefined, plan: RoutingStartPlan | undefined): RunDiscoveryConnection {
    if (!plan || worktree.main || worktree.taskId !== plan.taskId) throw new ServiceRuntimeError('service_runtime_lane_task_required', '发现目标需要已核实的任务泳道。');
    assertService(root, backend.serviceCode);
    const qa = (reason: string): RunDiscoveryConnection => ({ kind: 'service-discovery', mode: 'remote', serviceCode: backend.serviceCode,
      serviceId: backend.serviceId, url: null, runId: null, context: 'qa', reason });
    if (selected?.target === 'remote' || !selected && input.connection === 'remote') return qa('明确使用既有 QA 上下文。');
    if (selected?.target === 'auto' && selected.expectedRunId === null) {
      if (input.connection === 'local') throw new ServiceRuntimeError('service_runtime_backend_unavailable', '已观察到本地目标缺失，严格本地模式不采用后来实例或回落 QA。');
      return qa('本次观察没有本地目标，按声明回落 QA。');
    }
    const active = listRunRecords(root).filter(run => run.serviceCode === backend.serviceCode && sameScope(run, worktree) && isActiveRun(run));
    const planned = plan.members[backend.serviceCode];
    if (selected?.target !== 'run' && !selected?.expectedRunId && !planned && active.length > 1) throw new ServiceRuntimeError('service_runtime_backend_ambiguous', `同任务的 ${backend.serviceCode} 存在多个活跃运行，请显式选择。`);
    const runId = selected?.target === 'run' ? selected.runId : selected?.expectedRunId ?? planned?.runId ?? active[0]?.id;
    if (!runId) {
      if (input.connection === 'local') throw new ServiceRuntimeError('service_runtime_backend_unavailable', `本任务没有已就绪的 ${backend.serviceCode}，严格本地模式不回落 QA。`);
      return qa('本任务未选择该服务的本地运行，按声明回落 QA。');
    }
    const record = readRunRecord(root, runId);
    const member = planned?.runId === runId ? planned : null;
    if (record) {
      if (record.serviceCode !== backend.serviceCode || !sameScope(record, worktree) || !record.routing
        || record.routing.laneId !== plan.laneId || record.routing.workspaceId !== plan.workspaceId || record.routing.hostId !== plan.hostId
        || record.routing.serviceId !== backend.serviceId || !matchesProcessIdentity(record.processIdentity)
        || record.status !== 'running' && !(member && !member.existing && record.status === 'starting')) {
        throw new ServiceRuntimeError('service_runtime_backend_changed', `发现目标 ${backend.serviceCode} 的所选运行已变化、未就绪或不属于本任务泳道。`);
      }
    } else if (!member || member.existing || member.serviceId !== backend.serviceId
      || readRuntimeDefinition(root, backend.serviceCode)?.definition.local.routing?.serviceId !== backend.serviceId) {
      throw new ServiceRuntimeError('service_runtime_backend_changed', `发现目标 ${backend.serviceCode} 的所选运行不存在，未采用后来出现的实例。`);
    }
    if (assertService(root, backend.serviceCode).workspaceId !== plan.workspaceId) throw new ServiceRuntimeError('service_runtime_lane_scope_invalid', '发现目标的工作空间身份不匹配。');
    return { kind: 'service-discovery', mode: 'local', serviceCode: backend.serviceCode, serviceId: backend.serviceId,
      url: null, runId, context: null, reason: `已选择本任务运行 ${runId}；发现和实际调用状态另行观察。` };
  }

  function resolveConnections(root: string, worktree: ServiceWorktree, definition: ServiceRuntimeDefinition, input: Pick<StartRunInput, 'connection' | 'backendTargets' | 'expectedBackendRunId'>, plan?: RoutingStartPlan): RunConnection[] | null {
    const backends = definition.local.backends ?? [];
    if (!backends.length) {
      if (input.connection || input.backendTargets?.length || input.expectedBackendRunId) throw new ServiceRuntimeError('service_runtime_connection_undefined', '该服务尚未声明前端连接方式，请先由智能体（Agent）验证配置。');
      return null;
    }
    const explicit = new Map<string, BackendTarget>();
    for (const target of input.backendTargets ?? []) {
      if (!backends.some(backend => backend.serviceCode === target.serviceCode)) throw new ServiceRuntimeError('service_runtime_backend_undeclared', `目标 ${target.serviceCode} 未在运行定义中声明。`);
      explicit.set(target.serviceCode, target);
    }
    // 旧的 expectedBackendRunId 观察映射为所属声明后端的显式实例目标；显式目标已覆盖该后端时让位，观察不到已就绪实例则拒绝。
    if (input.expectedBackendRunId) {
      const owner = backends.find(backend => readyBackendRuns(root, backend.serviceCode).some(run => run.id === input.expectedBackendRunId));
      if (!owner) throw new ServiceRuntimeError('service_runtime_backend_changed', '已观察的本地后端实例已变化，请刷新后重新选择。');
      if (!explicit.has(owner.serviceCode)) explicit.set(owner.serviceCode, { serviceCode: owner.serviceCode, target: 'run', runId: input.expectedBackendRunId });
    }
    const availabilities = localBackendAvailabilities(root, worktree, definition);
    return backends.map((backend, index): RunConnection => {
      const selected = explicit.get(backend.serviceCode);
      const availability = availabilities[index]!;
      if (backend.kind === 'service-discovery') return resolveDiscovery(root, worktree, backend, input, selected, plan);
      if (selected?.expectedRunId !== undefined) throw new ServiceRuntimeError('service_runtime_input_invalid', '逐项目标观察只适用于发现类型。');
      if (selected?.target === 'run') {
        const run = readyBackendRuns(root, backend.serviceCode).find(item => item.id === selected.runId);
        if (!run) throw new ServiceRuntimeError('service_runtime_backend_changed', `本地后端 ${backend.serviceCode} 的所选实例已变化或不可用，请刷新后重新选择。`);
        return { mode: 'local', url: run.url, serviceCode: backend.serviceCode, runId: run.id };
      }
      if (selected?.target === 'remote' || (!selected && input.connection === 'remote')) return { mode: 'remote', url: backend.remoteUrl, serviceCode: backend.serviceCode, runId: null };
      if (input.connection === 'local' && !selected) {
        if (!availability.target) throw new ServiceRuntimeError('service_runtime_backend_unavailable', availability.reason!);
        return { mode: 'local', url: availability.target.url, serviceCode: backend.serviceCode, runId: availability.target.runId };
      }
      return availability.target
        ? { mode: 'local', url: availability.target.url, serviceCode: backend.serviceCode, runId: availability.target.runId }
        : { mode: 'remote', url: backend.remoteUrl, serviceCode: backend.serviceCode, runId: null };
    });
  }

  function revalidateConnections(root: string, worktree: ServiceWorktree, definition: ServiceRuntimeDefinition, resolved: RunConnection[] | null, plan?: RoutingStartPlan) {
    if (!resolved) return;
    const backendTargets: BackendTarget[] = resolved.map(connection => connection.mode === 'local'
      ? { serviceCode: connection.serviceCode, target: 'run', runId: connection.runId! }
      : { serviceCode: connection.serviceCode, target: 'remote' });
    const again = resolveConnections(root, worktree, definition, { backendTargets }, plan);
    if (!sameConnections(again, resolved)) throw new ServiceRuntimeError('service_runtime_backend_changed', '本地后端实例已变化，请刷新后重新选择。');
  }

  function validateInput(input: Pick<StartRunInput, 'origin' | 'connection' | 'backendTargets' | 'expectedBackendRunId' | 'expectedRoutingDigest'>) {
    if (input.origin !== undefined && input.origin !== 'human' && input.origin !== 'agent') throw new ServiceRuntimeError('service_runtime_input_invalid', '启动入口必须为 human 或 agent。');
    if (input.expectedBackendRunId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.expectedBackendRunId)) throw new ServiceRuntimeError('service_runtime_input_invalid', '已观察的本地后端编号无效。');
    if (input.expectedRoutingDigest !== undefined && !/^sha256-[a-f0-9]{64}$/.test(input.expectedRoutingDigest)) throw new ServiceRuntimeError('service_runtime_input_invalid', '已观察的泳道上下文摘要无效。');
    if (input.connection !== undefined && input.connection !== 'local' && input.connection !== 'remote') throw new ServiceRuntimeError('service_runtime_input_invalid', '前端连接必须单选 local 或 remote。');
    if (input.backendTargets !== undefined) {
      if (!Array.isArray(input.backendTargets)) throw new ServiceRuntimeError('service_runtime_input_invalid', '后端目标必须是数组。');
      const seen = new Set<string>();
      for (const target of input.backendTargets) {
        if (!target || typeof target !== 'object' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(target.serviceCode ?? '')) throw new ServiceRuntimeError('service_runtime_input_invalid', '后端目标的服务编码无效。');
        if (Object.keys(target).some(field => !['serviceCode', 'target', 'runId', 'expectedRunId'].includes(field))) throw new ServiceRuntimeError('service_runtime_input_invalid', '后端目标不接受任意地址或注入字段。');
        if (target.expectedRunId !== undefined && (target.target !== 'auto' || target.expectedRunId !== null && (typeof target.expectedRunId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(target.expectedRunId)))) throw new ServiceRuntimeError('service_runtime_input_invalid', '自动发现目标观察无效。');
        if (seen.has(target.serviceCode)) throw new ServiceRuntimeError('service_runtime_input_invalid', `后端目标重复：${target.serviceCode}。`);
        seen.add(target.serviceCode);
        if (!['auto', 'remote', 'run'].includes(target.target)) throw new ServiceRuntimeError('service_runtime_input_invalid', `后端 ${target.serviceCode} 的目标方式无效。`);
        if (target.target === 'run' && (typeof target.runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(target.runId))) throw new ServiceRuntimeError('service_runtime_input_invalid', `后端 ${target.serviceCode} 的所选实例编号无效。`);
        if (target.target !== 'run' && target.runId !== undefined) throw new ServiceRuntimeError('service_runtime_input_invalid', `后端 ${target.serviceCode} 未选择实例时不能携带实例编号。`);
      }
    }
  }

  function prepareStart(root: string, input: StartRunInput) {
    const service = assertService(root, input.serviceCode);
    const worktree = deps.listWorktrees(root, input.serviceCode, input.taskId).find(item => item.id === input.worktreeId);
    if (!worktree) throw new ServiceRuntimeError('service_runtime_worktree_unknown', `服务 ${input.serviceCode} 的代码目录不可用，请刷新后重新选择。`);
    checkObservation(worktree, input.expectedWorktree);
    if (input.taskId && (worktree.main || worktree.taskId !== input.taskId)) throw new ServiceRuntimeError('service_runtime_task_mismatch', '所选工作树不属于当前任务，未启动其他目录。');
    const existing = readRuntimeDefinition(root, input.serviceCode);
    if (!existing) throw new ServiceRuntimeError('service_runtime_definition_missing', `服务 ${input.serviceCode} 尚无运行定义，先由智能体（Agent）识别并验证。`);
    return { service, worktree, existing, cwd: serviceDirectory(worktree, existing.definition.local.cwd) };
  }

  async function stopRunLocked(root: string, runId: string): Promise<ManagedRunRecord> {
    const current = readRunRecord(root, runId);
    if (!current) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
    if (!isActiveRun(current) && !(current.status === 'failed' && owned.has(key(root, runId)))) return current;
    clearWatch(root, runId);
    await terminate(root, current);
    owned.delete(key(root, runId));
    const stopped: ManagedRunRecord = { ...current, status: 'stopped', stoppedAt: now(), failure: null };
    await writeRunRecord(root, stopped);
    return stopped;
  }

  // Callers hold the workspace runtime lock through preflight, stop and replacement launch.
  async function startRunLocked(root: string, input: StartRunInput, expectedConnections?: RunConnection[] | null, expectedDefinition?: ServiceRuntimeDefinition, preparedRouting?: RoutingStartPlan): Promise<ManagedRunRecord> {
    const prepared = prepareStart(root, input);
    const { service, existing, cwd } = prepared;
    let { worktree } = prepared;
    const { definition } = existing;
    if (expectedDefinition && JSON.stringify(definition) !== JSON.stringify(expectedDefinition)) throw new ServiceRuntimeError('service_runtime_source_changed', '启动与连接配置已变化，请刷新后重新核对。');
    const selectedPath = path.resolve(worktree.path);
    const records = listRunRecords(root);
    const duplicate = records.find(record => record.serviceCode === input.serviceCode && path.resolve(record.worktreePath) === selectedPath && isActiveRun(record));
    if (duplicate) throw new ServiceRuntimeError('service_runtime_worktree_busy', `所选目录已有受管运行实例（:${duplicate.actualPort}）。`);
    let routingPlan: RoutingStartPlan | undefined;
    if (definition.local.routing) {
      const identity = routingIdentity(root, worktree, service.code);
      const activeLane = records.find(run => run.taskId === worktree.taskId && isActiveRun(run) && run.routing)?.routing?.laneId;
      if (preparedRouting) {
        const member = preparedRouting.members[service.code];
        if (!member || member.worktreeId !== worktree.id || member.serviceId !== definition.local.routing.serviceId
          || preparedRouting.workspaceId !== identity.workspaceId || preparedRouting.hostId !== identity.hostId || preparedRouting.taskId !== worktree.taskId
          || activeLane && activeLane !== preparedRouting.laneId) throw new ServiceRuntimeError('service_runtime_lane_changed', '预分配的任务泳道或服务声明已变化，请重新观察。');
        routingPlan = preparedRouting;
      } else {
        routingPlan = identity;
        routingPlan.members[service.code] = { runId: newId(), worktreeId: worktree.id, serviceId: definition.local.routing.serviceId, existing: false };
      }
    }
    const connections = resolveConnections(root, worktree, definition, input, routingPlan);
    if (expectedConnections && !sameConnections(connections, expectedConnections)) throw new ServiceRuntimeError('service_runtime_backend_changed', '本地后端实例已变化，请刷新后重新选择。');
    const used = new Set(records.filter(isActiveRun).map(record => record.actualPort));
    const preferred = definition.local.preferredPort;
    let actualPort = nextAvailablePort(preferred, used);
    while (actualPort <= 65535 && actualPort < preferred + 50 && !(await probePortAvailable(actualPort))) { used.add(actualPort); actualPort = nextAvailablePort(actualPort + 1, used); }
    if (actualPort > 65535 || actualPort >= preferred + 50) throw new ServiceRuntimeError('service_runtime_port_unavailable', '无法分配可用本地端口。');
    if (actualPort !== preferred && !definition.local.portOverride) throw new ServiceRuntimeError('service_runtime_port_override_missing', `首选端口 ${preferred} 被占用，运行定义未声明可生效的端口覆盖方式；未启动服务。`);
    // 等待端口探测后再次核对目录和代码观察，不能用过期来源继续启动。
    const current = deps.listWorktrees(root, input.serviceCode, input.taskId).find(item => item.id === input.worktreeId);
    if (!current) throw new ServiceRuntimeError('service_runtime_worktree_unknown', '启动前代码目录已不可用。');
    checkObservation(current, { path: worktree.path, branch: worktree.branch, head: worktree.head, dirty: worktree.dirty });
    worktree = current;
    if (assertService(root, input.serviceCode).id !== service.id) throw new ServiceRuntimeError('service_runtime_source_changed', '启动前服务身份已变化，请刷新。');
    if (serviceDirectory(worktree, definition.local.cwd) !== cwd) throw new ServiceRuntimeError('service_runtime_source_changed', '启动前真实目录已变化，请刷新。');
    // Port probing yielded to other processes; the selected local targets must still be the same ready instances.
    revalidateConnections(root, worktree, definition, connections, routingPlan);
    const command = [...definition.local.command];
    if (definition.local.portOverride) command.push(`${definition.local.portOverride}=${actualPort}`);
    let record: ManagedRunRecord = {
      id: routingPlan?.members[service.code]?.runId ?? newId(), serviceId: service.id, serviceCode: service.code,
      worktreeId: worktree.id, worktreePath: worktree.path, worktreeLabel: worktree.label,
      branch: worktree.branch, head: worktree.head, main: worktree.main, dirty: worktree.dirty,
      taskId: worktree.taskId, taskTitle: worktree.taskTitle, origin: input.origin ?? 'human',
      pid: -1, processIdentity: null, preferredPort: preferred, actualPort,
      portNote: actualPort === preferred ? '使用首选端口' : `首选 ${preferred} 被占用，已避让`,
      status: 'starting', startedAt: now(), stoppedAt: null, failure: null, logPath: '',
      url: `http://127.0.0.1:${actualPort}`, connection: connections?.find(connection => connection.kind !== 'service-discovery') ?? null, connections: connections ?? [],
      launch: { command, cwd, profile: definition.local.profile, readiness: definition.local.readiness, timeoutSeconds: definition.local.timeoutSeconds, definitionPath: existing.path, verifiedAt: definition.verifiedAt },
    };
    record.logPath = runLogPath(root, record.id);
    await writeRunRecord(root, record);
    try {
      if (definition.local.routing && routingPlan) {
        record = { ...record, routing: await writeLocalRoutingContext(root, record, definition.local.routing, routingPlan,
          (connections ?? []).filter((connection): connection is RunDiscoveryConnection => connection.kind === 'service-discovery')) };
        await writeRunRecord(root, record);
      }
      if (input.taskId) deps.assertTaskScope?.(root, input.taskId, input.serviceCode);
      const env: Record<string, string> = {};
      for (const connection of connections ?? []) {
        const declaration = (definition.local.backends ?? []).find(backend => backend.serviceCode === connection.serviceCode);
        if (declaration && declaration.kind !== 'service-discovery' && connection.kind !== 'service-discovery') env[declaration.environmentVariable] = connection.url;
      }
      if (definition.local.routing && record.routing) env[definition.local.routing.environmentVariable] = record.routing.contextPath;
      const managed = await startProcess({ command, cwd, logPath: record.logPath, ...(Object.keys(env).length ? { env } : {}) });
      owned.set(key(root, record.id), managed);
      record = { ...record, pid: managed.pid, processIdentity: managed.identity };
      // 即使身份观察失败，也先保留确切进程号；清理错误不能丢掉已经发生的启动。
      await writeRunRecord(root, record);
      if (!managed.identity) {
        let cleanupFailure: string | null = null;
        try { await managed.kill(); owned.delete(key(root, record.id)); }
        catch (error) { cleanupFailure = (error as Error).message; }
        record = { ...record, status: 'failed', stoppedAt: cleanupFailure ? null : now(), failure: `启动后无法读取可信进程身份；${cleanupFailure ? `清理未完成，启动进程可能仍在运行：${cleanupFailure}` : '本次自有启动进程已退出。'}` };
        await appendRunLog(root, record.id, `[buildr] ${record.failure}\n`);
      }
      await writeRunRecord(root, record);
      void managed.exited.then(async ({ code, signal }) => {
        // 启动器退出后清理仍留在独立组内的派生进程。
        await managed.kill();
        owned.delete(key(root, record.id));
        await updateActive(root, record.id, current => ({ ...current, status: current.status === 'failed' || current.status === 'starting' || code !== 0 ? 'failed' : 'stopped', stoppedAt: now(), failure: current.status === 'failed' ? current.failure : current.status === 'starting' || code !== 0 ? `进程退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）` : null }));
      }).catch(() => undefined);
      if (isActiveRun(record)) watch(root, record.id);
    } catch (error) {
      const managed = owned.get(key(root, record.id));
      let cleanupFailure: string | null = null;
      if (managed) {
        try { await managed.kill(); owned.delete(key(root, record.id)); }
        catch (cleanupError) { cleanupFailure = (cleanupError as Error).message; }
      }
      record = { ...record, status: 'failed', stoppedAt: cleanupFailure ? null : now(), failure: `启动失败：${(error as Error).message}${cleanupFailure ? `；清理未完成，启动进程可能仍在运行：${cleanupFailure}` : ''}` };
      await appendRunLog(root, record.id, `[buildr] ${record.failure}\n`);
      await writeRunRecord(root, record);
    }
    return record;
  }

  return Object.freeze({
    readDefinition(root: string, code: string) { assertService(root, code); return readRuntimeDefinition(root, code); },
    async writeDefinition(root: string, code: string, content: string) {
      const service = assertService(root, code);
      const definition = parseRuntimeDefinition(content);
      return { service, definition, path: await writeRuntimeDefinition(root, code, definition) };
    },
    listWorktrees(root: string, code: string, taskId?: string) { assertService(root, code); return deps.listWorktrees(root, code, taskId); },
    async listRuns(root: string, code?: string) {
      const records = (await reconcile(root)).filter(record => !code || record.serviceCode === code);
      return Promise.all(records.map(async record => record.routing
        ? { ...record, routing: { ...record.routing, observation: await readLocalRoutingObservation(record) } } : record));
    },
    connectionTarget(root: string, code: string, worktree: ServiceWorktree): LocalBackendAvailability[] | null {
      assertService(root, code);
      const existing = readRuntimeDefinition(root, code);
      const availabilities = existing ? localBackendAvailabilities(root, worktree, existing.definition) : [];
      return availabilities.length ? availabilities : null;
    },
    async startRun(root: string, input: StartRunInput): Promise<ManagedRunRecord> {
      validateInput(input);
      assertService(root, input.serviceCode);
      await reconcile(root);
      return withRuntimeLock(root, () => startRunLocked(root, input));
    },
    assertRunConnections(root: string, run: ManagedRunRecord, input: StartRunInput, plan?: RoutingStartPlan) {
      const prepared = prepareStart(root, input);
      const current = readRunRecord(root, run.id);
      if (!current || current.status !== 'running' || !matchesProcessIdentity(current.processIdentity)) throw new ServiceRuntimeError('service_runtime_existing_run_failed', '已有运行已停止或身份发生变化。');
      const wanted = resolveConnections(root, prepared.worktree, prepared.existing.definition, input, plan);
      if (!sameConnections(current.connections, wanted)) throw new ServiceRuntimeError('service_runtime_connection_conflict', '已有运行的发现目标不同，请明确切换连接后重试。');
    },
    /** 仅由任务组合装配调用，HTTP/CLI 不接受预分配身份。 */
    async prepareTaskRouting(root: string, inputs: StartRunInput[]): Promise<RoutingStartPlan | null> {
      return withRuntimeLock(root, () => {
        const prepared = inputs.map(input => ({ input, ...prepareStart(root, input) })).filter(item => item.existing.definition.local.routing);
        if (!prepared.length) return null;
        const first = prepared[0]!;
        const plan = routingIdentity(root, first.worktree, first.service.code);
        const records = listRunRecords(root);
        for (const item of prepared) {
          const identity = routingIdentity(root, item.worktree, item.service.code);
          if (identity.taskId !== plan.taskId || identity.workspaceId !== plan.workspaceId || identity.hostId !== plan.hostId) throw new ServiceRuntimeError('service_runtime_lane_scope_invalid', '组合发现只允许同任务、同工作空间和同本机。');
          if (item.input.taskId) deps.assertTaskScope?.(root, item.input.taskId, item.service.code);
          const existing = records.find(run => run.serviceCode === item.service.code && run.worktreeId === item.worktree.id && isActiveRun(run));
          plan.members[item.service.code] = { runId: existing?.id ?? newId(), worktreeId: item.worktree.id,
            serviceId: item.existing.definition.local.routing!.serviceId, existing: Boolean(existing) };
        }
        return plan;
      });
    },
    async startRunWithRoutingPlan(root: string, input: StartRunInput, plan: RoutingStartPlan): Promise<ManagedRunRecord> {
      validateInput(input);
      await reconcile(root);
      return withRuntimeLock(root, () => startRunLocked(root, input, undefined, undefined, plan));
    },
    async restartRun(root: string, runId: string, input: RestartRunInput): Promise<ManagedRunRecord> {
      validateInput(input);
      await reconcile(root);
      return withRuntimeLock(root, async () => {
        const current = readRunRecord(root, runId);
        if (!current) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
        if (!isActiveRun(current) || !matchesProcessIdentity(current.processIdentity)) throw new ServiceRuntimeError('service_runtime_run_not_active', '当前实例已停止或进程身份已变化，请刷新后重新启动。');
        if (current.routing && input.expectedRoutingDigest !== current.routing.contextDigest) throw new ServiceRuntimeError('service_runtime_lane_observation_changed', '缺少当前泳道上下文观察，或观察已经变化；原实例保持运行。');
        // 未显式给连接时按当前逐后端连接原样承接，保持各后端原有目标语义。
        const carry: BackendTarget[] | undefined = !input.connection && !input.backendTargets?.length && current.connections.length
          ? current.connections.map(connection => ({ serviceCode: connection.serviceCode, target: connection.mode === 'local' ? 'run' : 'remote', ...(connection.runId ? { runId: connection.runId } : {}) }))
          : input.backendTargets;
        const start: StartRunInput = { serviceCode: current.serviceCode, worktreeId: current.worktreeId, origin: input.origin ?? 'human',
          ...(current.taskId ? { taskId: current.taskId } : {}), connection: input.connection ?? (carry ? undefined : current.connection?.mode),
          backendTargets: carry,
          expectedBackendRunId: input.expectedBackendRunId,
          expectedWorktree: input.expectedWorktree ?? { path: current.worktreePath, branch: current.branch, head: current.head, dirty: current.dirty } };
        const prepared = prepareStart(root, start);
        if (start.taskId) deps.assertTaskScope?.(root, start.taskId, start.serviceCode);
        if (prepared.service.id !== current.serviceId || prepared.worktree.path !== current.worktreePath) throw new ServiceRuntimeError('service_runtime_source_changed', '当前运行的服务或代码目录身份已变化，请刷新后核对。');
        const routingPlan = prepared.existing.definition.local.routing ? routingIdentity(root, prepared.worktree, current.serviceCode) : undefined;
        if (routingPlan) routingPlan.members[current.serviceCode] = { runId: newId(), worktreeId: current.worktreeId, serviceId: prepared.existing.definition.local.routing!.serviceId, existing: false };
        const connections = resolveConnections(root, prepared.worktree, prepared.existing.definition, start, routingPlan);
        // Everything above is read-only: invalid targets and stale source observations preserve the current frontend.
        await stopRunLocked(root, runId);
        try {
          const replacement = await startRunLocked(root, start, connections, prepared.existing.definition, routingPlan);
          if (replacement.status === 'failed') {
            const failed = { ...replacement, failure: `原实例已停止；${replacement.failure || '新实例启动失败，请查看日志。'}` };
            await writeRunRecord(root, failed);
            return failed;
          }
          return replacement;
        } catch (cause) {
          throw new ServiceRuntimeError('service_runtime_restart_failed', `原实例已停止，新实例未启动：${(cause as Error).message}`);
        }
      });
    },
    async waitForRun(root: string, runId: string): Promise<ManagedRunRecord> {
      while (true) {
        await observe(root, runId);
        const current = readRunRecord(root, runId);
        if (!current) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
        if (current.status !== 'starting' || !current.launch || !current.processIdentity) return current;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
    async stopRun(root: string, runId: string): Promise<ManagedRunRecord> {
      return withRuntimeLock(root, () => stopRunLocked(root, runId));
    },
    readLog(root: string, runId: string, options: { maxBytes?: number } = {}) {
      const record = readRunRecord(root, runId);
      if (!record) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
      const maxBytes = Math.min(Math.max(options.maxBytes ?? DEFAULT_LOG_TAIL_BYTES, 1024), MAX_LOG_TAIL_BYTES);
      return { record, ...readRunLogTail(root, runId, maxBytes), maxBytes };
    },
    reconcile,
  });
}

export type ServiceRuntimeApplication = ReturnType<typeof createServiceRuntimeApplication>;
