import path from 'node:path';
import {
  parseRuntimeDefinition,
  RuntimeDefinitionError,
  type ServiceRuntimeDefinition,
} from '../domain/runtime-definition.ts';
import { ServiceRuntimeError } from '../domain/errors.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import {
  createReadinessMatcher,
  isActiveRun,
  nextAvailablePort,
  type ManagedRunRecord,
} from '../domain/runs.ts';
import {
  processAlive,
  probeHttpStatus,
  probePortAvailable,
  startManagedProcess,
  type ManagedProcess,
} from '../infrastructure/managed-process.ts';
import {
  readRuntimeDefinition,
  writeRuntimeDefinition,
} from '../persistence/runtime-definition-repository.ts';
import {
  appendRunLog,
  listRunRecords,
  readRunLogTail,
  readRunRecord,
  runLogPath,
  writeRunRecord,
} from '../persistence/runs-repository.ts';

export { ServiceRuntimeError };

export type ServiceRuntimeDeps = {
  resolveService(targetRoot: string, serviceCode: string): { id: string; code: string } | null;
  listWorktrees(targetRoot: string, serviceCode: string): ServiceWorktree[];
  now?(): string;
  newId?(): string;
};

const DEFAULT_LOG_TAIL_BYTES = 256 * 1024;
const MAX_LOG_TAIL_BYTES = 4 * 1024 * 1024;

export function createServiceRuntimeApplication(deps: ServiceRuntimeDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const owned = new Map<string, ManagedProcess>();
  const readinessTimers = new Map<string, NodeJS.Timeout>();
  const stopping = new Set<string>();
  const settling = new Set<string>();

  function assertService(targetRoot: string, serviceCode: string) {
    const service = deps.resolveService(targetRoot, serviceCode);
    if (!service) throw new ServiceRuntimeError('service_runtime_service_unknown', `服务未登记：${serviceCode}`);
    return service;
  }

  function clearReadinessTimer(runId: string) {
    const timer = readinessTimers.get(runId);
    if (timer) {
      clearTimeout(timer);
      readinessTimers.delete(runId);
    }
  }

  async function reconcile(targetRoot: string): Promise<ManagedRunRecord[]> {
    const records = listRunRecords(targetRoot);
    for (const record of records) {
      if (!isActiveRun(record)) continue;
      if (owned.has(record.id)) continue;
      if (processAlive(record.pid)) continue;
      const settled: ManagedRunRecord = { ...record, status: 'stopped', stoppedAt: now(), failure: record.status === 'starting' ? '进程在未就绪前退出（对账发现）' : null };
      await writeRunRecord(targetRoot, settled);
    }
    return listRunRecords(targetRoot);
  }

  async function markFailed(targetRoot: string, record: ManagedRunRecord, failure: string) {
    clearReadinessTimer(record.id);
    settling.delete(record.id);
    const settled: ManagedRunRecord = { ...record, status: 'failed', stoppedAt: now(), failure };
    await writeRunRecord(targetRoot, settled);
    await appendRunLog(targetRoot, record.id, `[buildr] ${failure}\n`);
    return settled;
  }

  function watchReadiness(targetRoot: string, record: ManagedRunRecord, definition: ServiceRuntimeDefinition, managed: ManagedProcess) {
    const matcher = createReadinessMatcher(definition.local.readiness);
    const deadline = Date.now() + definition.local.timeoutSeconds * 1000;
    const fail = (failure: string) => {
      settling.add(record.id);
      void managed.kill().then(async () => {
        await markFailed(targetRoot, record, failure);
      });
    };
    if (matcher.kind === 'log') {
      const timer = setInterval(() => {
        if (Date.now() > deadline) {
          clearReadinessTimer(record.id);
          fail(`就绪检查超时（${definition.local.timeoutSeconds}s 内日志未出现 ${definition.local.readiness.kind === 'log' ? definition.local.readiness.pattern : ''}）`);
        }
      }, 500);
      timer.unref?.();
      readinessTimers.set(record.id, timer);
      return (line: string) => {
        if (matcher.testLine?.(line)) {
          clearReadinessTimer(record.id);
          void writeRunRecord(targetRoot, { ...record, status: 'running' });
        }
      };
    }
    const timer = setInterval(() => {
      if (Date.now() > deadline) {
        clearReadinessTimer(record.id);
        fail(`就绪检查超时（${definition.local.timeoutSeconds}s 内 ${(definition.local.readiness as { path: string }).path} 未返回成功状态）`);
        return;
      }
      void probeHttpStatus(record.actualPort, (definition.local.readiness as { path: string }).path).then(status => {
        if (status !== null && matcher.testHttp?.(status)) {
          clearReadinessTimer(record.id);
          void writeRunRecord(targetRoot, { ...record, status: 'running' });
        }
      });
    }, 1000);
    timer.unref?.();
    readinessTimers.set(record.id, timer);
    return () => undefined;
  }

  return Object.freeze({
    readDefinition(targetRoot: string, serviceCode: string) {
      assertService(targetRoot, serviceCode);
      return readRuntimeDefinition(targetRoot, serviceCode);
    },

    async writeDefinition(targetRoot: string, serviceCode: string, content: string) {
      const service = assertService(targetRoot, serviceCode);
      const definition = parseRuntimeDefinition(content);
      const file = await writeRuntimeDefinition(targetRoot, serviceCode, definition);
      return { service, definition, path: file };
    },

    listWorktrees(targetRoot: string, serviceCode: string) {
      assertService(targetRoot, serviceCode);
      return deps.listWorktrees(targetRoot, serviceCode);
    },

    async listRuns(targetRoot: string, serviceCode?: string) {
      const records = await reconcile(targetRoot);
      return serviceCode ? records.filter(record => record.serviceCode === serviceCode) : records;
    },

    async startRun(targetRoot: string, input: { serviceCode: string; worktreeId: string }) {
      const service = assertService(targetRoot, input.serviceCode);
      const worktree = deps.listWorktrees(targetRoot, input.serviceCode).find(item => item.id === input.worktreeId);
      if (!worktree) throw new ServiceRuntimeError('service_runtime_worktree_unknown', `服务 ${input.serviceCode} 的检出目录不可用，请刷新后重新选择。`);
      const existing = readRuntimeDefinition(targetRoot, input.serviceCode);
      if (!existing) throw new ServiceRuntimeError('service_runtime_definition_missing', `服务 ${input.serviceCode} 尚无运行定义，先由智能体识别并验证。`);
      const definition = existing.definition;
      await reconcile(targetRoot);
      const records = listRunRecords(targetRoot);
      const duplicate = records.find(record => record.serviceCode === input.serviceCode && record.worktreePath === worktree.path && isActiveRun(record));
      if (duplicate) throw new ServiceRuntimeError('service_runtime_worktree_busy', `工作树 ${worktree.label} 已有受管运行实例（:${duplicate.actualPort}）。`);
      const used = new Set(records.filter(isActiveRun).map(record => record.actualPort));
      let actualPort = nextAvailablePort(definition.local.preferredPort, used);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (await probePortAvailable(actualPort)) break;
        used.add(actualPort);
        actualPort = nextAvailablePort(actualPort + 1, used);
      }
      if (!(await probePortAvailable(actualPort))) throw new ServiceRuntimeError('service_runtime_port_unavailable', `无法为 ${input.serviceCode} 分配可用端口。`);
      const portNote = actualPort === definition.local.preferredPort
        ? '使用首选端口'
        : `首选 ${definition.local.preferredPort} 被占用，已避让`;
      const record: ManagedRunRecord = {
        id: newId(),
        serviceId: service.id,
        serviceCode: service.code,
        worktreeId: worktree.id,
        worktreePath: worktree.path,
        worktreeLabel: worktree.label,
        branch: worktree.branch,
        head: worktree.head,
        pid: -1,
        preferredPort: definition.local.preferredPort,
        actualPort,
        portNote,
        status: 'starting',
        startedAt: now(),
        stoppedAt: null,
        failure: null,
        logPath: '',
      };
      record.logPath = runLogPath(targetRoot, record.id);
      const command = [...definition.local.command];
      if (definition.local.portOverride) command.push(`${definition.local.portOverride}=${actualPort}`);
      let onLine: (line: string) => void = () => undefined;
      const managed = startManagedProcess({
        command,
        cwd: path.resolve(worktree.path, definition.local.cwd),
        onOutput: chunk => {
          void appendRunLog(targetRoot, record.id, chunk);
          onLine(chunk);
        },
      });
      onLine = watchReadiness(targetRoot, record, definition, managed);
      record.pid = managed.pid;
      await writeRunRecord(targetRoot, record);
      owned.set(record.id, managed);
      void managed.exited.then(async ({ code, signal }) => {
        owned.delete(record.id);
        clearReadinessTimer(record.id);
        if (stopping.has(record.id)) {
          stopping.delete(record.id);
          return;
        }
        if (settling.has(record.id)) return;
        const current = readRunRecord(targetRoot, record.id);
        if (!current || !isActiveRun(current)) return;
        const stopped: ManagedRunRecord = {
          ...current,
          status: code === 0 ? 'stopped' : 'failed',
          stoppedAt: now(),
          failure: code === 0 ? null : `进程退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`,
        };
        await writeRunRecord(targetRoot, stopped);
      });
      return record;
    },

    async stopRun(targetRoot: string, runId: string) {
      const record = readRunRecord(targetRoot, runId);
      if (!record) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
      if (!isActiveRun(record)) return record;
      stopping.add(runId);
      const managed = owned.get(runId);
      if (managed) {
        await managed.kill();
      } else if (processAlive(record.pid)) {
        process.kill(record.pid, 'SIGTERM');
      }
      owned.delete(runId);
      clearReadinessTimer(runId);
      const stopped: ManagedRunRecord = { ...record, status: 'stopped', stoppedAt: now(), failure: null };
      await writeRunRecord(targetRoot, stopped);
      return stopped;
    },

    readLog(targetRoot: string, runId: string, options: { maxBytes?: number } = {}) {
      const record = readRunRecord(targetRoot, runId);
      if (!record) throw new ServiceRuntimeError('service_runtime_run_unknown', `运行记录不存在：${runId}`);
      const tail = readRunLogTail(targetRoot, runId, Math.min(Math.max(options.maxBytes ?? DEFAULT_LOG_TAIL_BYTES, 1024), MAX_LOG_TAIL_BYTES));
      return { record, log: tail.log, truncated: tail.truncated, size: tail.size, maxBytes: Math.min(Math.max(options.maxBytes ?? DEFAULT_LOG_TAIL_BYTES, 1024), MAX_LOG_TAIL_BYTES) };
    },

    reconcile,
  });
}

export type ServiceRuntimeApplication = ReturnType<typeof createServiceRuntimeApplication>;
export { RuntimeDefinitionError };
