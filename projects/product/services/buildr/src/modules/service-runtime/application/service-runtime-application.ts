import fs from 'node:fs';
import path from 'node:path';
import { parseRuntimeDefinition, RuntimeDefinitionError, type ServiceRuntimeDefinition } from '../domain/runtime-definition.ts';
import { ServiceRuntimeError } from '../domain/errors.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import { createReadinessMatcher, isActiveRun, nextAvailablePort, type ManagedRunRecord, type RunConnection } from '../domain/runs.ts';
import { matchesProcessIdentity, processAlive, probeHttpStatus, probePortAvailable, startManagedProcess, terminateVerifiedProcess, type ManagedProcess } from '../infrastructure/managed-process.ts';
import { withRuntimeLock } from '../infrastructure/runtime-lock.ts';
import { readRuntimeDefinition, writeRuntimeDefinition } from '../persistence/runtime-definition-repository.ts';
import { appendRunLog, listRunRecords, readRunLogTail, readRunRecord, runLogPath, writeRunRecord } from '../persistence/runs-repository.ts';

export { ServiceRuntimeError, RuntimeDefinitionError };
export type ExpectedWorktree = { path: string; branch: string | null; head: string | null; dirty: boolean | null };
export type BackendTarget = { serviceCode: string; target: 'auto' | 'remote' | 'run'; runId?: string };
export type StartRunInput = {
  serviceCode: string;
  worktreeId: string;
  origin?: 'human' | 'agent';
  taskId?: string;
  connection?: 'local' | 'remote';
  backendTargets?: BackendTarget[];
  expectedWorktree?: ExpectedWorktree;
  expectedBackendRunId?: string;
};
export type BackendCandidate = { runId: string; url: string; worktreeLabel: string; branch: string | null; sameScope: boolean };
export type LocalBackendAvailability = {
  serviceCode: string;
  environmentVariable: string;
  remoteUrl: string;
  candidates: BackendCandidate[];
  target: { runId: string; serviceCode: string; url: string; worktreeLabel: string; branch: string | null } | null;
  reason: string | null;
};
export type RestartRunInput = Pick<StartRunInput, 'connection' | 'backendTargets' | 'expectedWorktree' | 'expectedBackendRunId' | 'origin'>;
export type ServiceRuntimeDeps = {
  resolveService(targetRoot: string, serviceCode: string): { id: string; code: string } | null;
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

  function sameScope(run: ManagedRunRecord, worktree: ServiceWorktree): boolean {
    return worktree.taskId ? run.main === false && run.taskId === worktree.taskId : worktree.main && run.main === true && !run.taskId;
  }

  function localBackendAvailabilities(root: string, worktree: ServiceWorktree, definition: ServiceRuntimeDefinition): LocalBackendAvailability[] {
    return (definition.local.backends ?? []).map(backend => {
      const runs = readyBackendRuns(root, backend.serviceCode);
      const scoped = runs.filter(run => sameScope(run, worktree));
      const candidates = [...runs].sort((left, right) => Number(sameScope(right, worktree)) - Number(sameScope(left, worktree)) || left.startedAt.localeCompare(right.startedAt))
        .map(run => ({ runId: run.id, url: run.url, worktreeLabel: run.worktreeLabel, branch: run.branch, sameScope: sameScope(run, worktree) }));
      const target = scoped.length === 1 ? scoped[0]! : null;
      return {
        serviceCode: backend.serviceCode,
        environmentVariable: backend.environmentVariable,
        remoteUrl: backend.remoteUrl,
        candidates,
        target: target ? { runId: target.id, serviceCode: backend.serviceCode, url: target.url, worktreeLabel: target.worktreeLabel, branch: target.branch } : null,
        reason: target ? null : scoped.length > 1 ? '同范围存在多个本地后端实例，请显式选择目标。' : '同任务或主工作库没有已就绪的本地后端，请先启动后端。',
      };
    });
  }

  function resolveConnections(root: string, worktree: ServiceWorktree, definition: ServiceRuntimeDefinition, input: Pick<StartRunInput, 'connection' | 'backendTargets' | 'expectedBackendRunId'>): RunConnection[] | null {
    const backends = definition.local.backends ?? [];
    if (!backends.length) {
      if (input.connection || input.backendTargets?.length || input.expectedBackendRunId) throw new ServiceRuntimeError('service_runtime_connection_undefined', '该服务尚未声明前端连接方式，请先由智能体（Agent）验证配置。');
      return null;
    }
    const explicit = new Map<string, BackendTarget>();
    for (const target of input.backendTargets ?? []) explicit.set(target.serviceCode, target);
    // 旧的 expectedBackendRunId 观察映射为所属声明后端的显式实例目标；显式目标已覆盖该后端时让位，观察不到已就绪实例则拒绝。
    if (input.expectedBackendRunId) {
      const owner = backends.find(backend => readyBackendRuns(root, backend.serviceCode).some(run => run.id === input.expectedBackendRunId));
      if (!owner) throw new ServiceRuntimeError('service_runtime_backend_changed', '已观察的本地后端实例已变化，请刷新后重新选择。');
      if (!explicit.has(owner.serviceCode)) explicit.set(owner.serviceCode, { serviceCode: owner.serviceCode, target: 'run', runId: input.expectedBackendRunId });
    }
    const availabilities = localBackendAvailabilities(root, worktree, definition);
    return backends.map((backend, index) => {
      const selected = explicit.get(backend.serviceCode);
      const availability = availabilities[index]!;
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

  function revalidateConnections(root: string, worktree: ServiceWorktree, definition: ServiceRuntimeDefinition, resolved: RunConnection[] | null) {
    if (!resolved) return;
    const backendTargets: BackendTarget[] = resolved.map(connection => connection.mode === 'local'
      ? { serviceCode: connection.serviceCode, target: 'run', runId: connection.runId! }
      : { serviceCode: connection.serviceCode, target: 'remote' });
    const again = resolveConnections(root, worktree, definition, { backendTargets });
    if (JSON.stringify(again) !== JSON.stringify(resolved)) throw new ServiceRuntimeError('service_runtime_backend_changed', '本地后端实例已变化，请刷新后重新选择。');
  }

  function validateInput(input: Pick<StartRunInput, 'origin' | 'connection' | 'backendTargets' | 'expectedBackendRunId'>) {
    if (input.origin !== undefined && input.origin !== 'human' && input.origin !== 'agent') throw new ServiceRuntimeError('service_runtime_input_invalid', '启动入口必须为 human 或 agent。');
    if (input.expectedBackendRunId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.expectedBackendRunId)) throw new ServiceRuntimeError('service_runtime_input_invalid', '已观察的本地后端编号无效。');
    if (input.connection !== undefined && input.connection !== 'local' && input.connection !== 'remote') throw new ServiceRuntimeError('service_runtime_input_invalid', '前端连接必须单选 local 或 remote。');
    if (input.backendTargets !== undefined) {
      if (!Array.isArray(input.backendTargets)) throw new ServiceRuntimeError('service_runtime_input_invalid', '后端目标必须是数组。');
      const seen = new Set<string>();
      for (const target of input.backendTargets) {
        if (!target || typeof target !== 'object' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(target.serviceCode ?? '')) throw new ServiceRuntimeError('service_runtime_input_invalid', '后端目标的服务编码无效。');
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
  async function startRunLocked(root: string, input: StartRunInput, expectedConnections?: RunConnection[] | null, expectedDefinition?: ServiceRuntimeDefinition): Promise<ManagedRunRecord> {
    const prepared = prepareStart(root, input);
    const { service, existing, cwd } = prepared;
    let { worktree } = prepared;
    const { definition } = existing;
    if (expectedDefinition && JSON.stringify(definition) !== JSON.stringify(expectedDefinition)) throw new ServiceRuntimeError('service_runtime_source_changed', '启动与连接配置已变化，请刷新后重新核对。');
    const selectedPath = path.resolve(worktree.path);
    const records = listRunRecords(root);
    const duplicate = records.find(record => record.serviceCode === input.serviceCode && path.resolve(record.worktreePath) === selectedPath && isActiveRun(record));
    if (duplicate) throw new ServiceRuntimeError('service_runtime_worktree_busy', `所选目录已有受管运行实例（:${duplicate.actualPort}）。`);
    const connections = resolveConnections(root, worktree, definition, input);
    if (expectedConnections && JSON.stringify(connections) !== JSON.stringify(expectedConnections)) throw new ServiceRuntimeError('service_runtime_backend_changed', '本地后端实例已变化，请刷新后重新选择。');
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
    revalidateConnections(root, worktree, definition, connections);
    const command = [...definition.local.command];
    if (definition.local.portOverride) command.push(`${definition.local.portOverride}=${actualPort}`);
    let record: ManagedRunRecord = {
      id: newId(), serviceId: service.id, serviceCode: service.code,
      worktreeId: worktree.id, worktreePath: worktree.path, worktreeLabel: worktree.label,
      branch: worktree.branch, head: worktree.head, main: worktree.main, dirty: worktree.dirty,
      taskId: worktree.taskId, taskTitle: worktree.taskTitle, origin: input.origin ?? 'human',
      pid: -1, processIdentity: null, preferredPort: preferred, actualPort,
      portNote: actualPort === preferred ? '使用首选端口' : `首选 ${preferred} 被占用，已避让`,
      status: 'starting', startedAt: now(), stoppedAt: null, failure: null, logPath: '',
      url: `http://127.0.0.1:${actualPort}`, connection: connections?.[0] ?? null, connections: connections ?? [],
      launch: { command, cwd, profile: definition.local.profile, readiness: definition.local.readiness, timeoutSeconds: definition.local.timeoutSeconds, definitionPath: existing.path, verifiedAt: definition.verifiedAt },
    };
    record.logPath = runLogPath(root, record.id);
    await writeRunRecord(root, record);
    try {
      if (input.taskId) deps.assertTaskScope?.(root, input.taskId, input.serviceCode);
      const env: Record<string, string> = {};
      for (const connection of connections ?? []) {
        const declaration = (definition.local.backends ?? []).find(backend => backend.serviceCode === connection.serviceCode);
        if (declaration) env[declaration.environmentVariable] = connection.url;
      }
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
    async listRuns(root: string, code?: string) { const records = await reconcile(root); return code ? records.filter(record => record.serviceCode === code) : records; },
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
    async restartRun(root: string, runId: string, input: RestartRunInput): Promise<ManagedRunRecord> {
      validateInput(input);
      await reconcile(root);
      return withRuntimeLock(root, async () => {
        const current = readRunRecord(root, runId);
        if (!current) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
        if (!isActiveRun(current) || !matchesProcessIdentity(current.processIdentity)) throw new ServiceRuntimeError('service_runtime_run_not_active', '当前实例已停止或进程身份已变化，请刷新后重新启动。');
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
        const connections = resolveConnections(root, prepared.worktree, prepared.existing.definition, start);
        // Everything above is read-only: invalid targets and stale source observations preserve the current frontend.
        await stopRunLocked(root, runId);
        try {
          const replacement = await startRunLocked(root, start, connections, prepared.existing.definition);
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
