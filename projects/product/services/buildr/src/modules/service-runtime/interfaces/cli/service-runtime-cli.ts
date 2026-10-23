import path from 'node:path';
import type { ServiceTaskRuntimeApplication } from '../../application/service-task-runtime-application.ts';
import type { ServiceRuntimeApplication } from '../../application/service-runtime-application.ts';
import type { ServiceRuntimeView } from '../../application/service-runtime-view.ts';

const FLAGS = ['--target', '--json', '--service', '--worktree', '--run', '--max-bytes', '--task', '--origin', '--connection', '--services', '--expected-backend-run', '--backend-target', '--expected-routing-digest'];
const ACTIONS = ['overview', 'show', 'worktrees', 'start', 'restart', 'stop', 'log', 'task-show', 'task-start'];
export function createServiceRuntimeCliContributions(deps: { view: ServiceRuntimeView; runtime: ServiceRuntimeApplication; taskRuntime?: ServiceTaskRuntimeApplication }) {
  return [Object.freeze({
    key: 'service-runtime', surface: 'agent-machine',
    summary: '查看服务本地运行与代码来源，启动、切换连接或停止指定实例并读取日志。',
    help: [
      'Usage: buildr service-runtime <overview|show|worktrees|start|restart|stop|log|task-show|task-start> [--service <code>] [--services <code,code>] [--worktree <id>] [--run <id>] [--task <id>] [--origin agent|human] [--connection local|remote] [--expected-backend-run <id>] [--backend-target <code>:<runId>] [--expected-routing-digest <sha256>] [--max-bytes <n>] [--target <workspace>] [--json]',
      '',
      'start 需要 --service 与 --worktree，默认记录为智能体（Agent）启动，等待就绪或失败后返回；服务独立运行。',
      '--connection 适用于已有下游声明的服务；直接地址的 local 连接同范围唯一就绪实例，发现类型的 local 只连接同任务；声明多个后端时可对每个后端用 --backend-target <code>:<runId> 显式指定实例（可重复）。',
      '--expected-backend-run 可在 local 启动或切换时传入已观察的后端实例编号；实例变化时拒绝操作。',
      '发现类型仅使用同任务泳道；切换时必须提供 --expected-routing-digest <sha256>，从当前运行 routing.contextDigest 读取，不接受任意地址、文件或注入字段。',
      'restart 需要精确 --run，可用 --connection local|remote 切换；先校验新连接与代码来源，再停止并重启，等待就绪后返回。',
      'stop/log 需要精确 --run；overview/show/worktrees 不会更新代码或切换分支。',
      'task-show 需要 --task；task-start 需要 --task 和 --services，按任务实际目录逐项启动并返回成功/复用/错误，不启动未选服务。',
    ],
    match: ({ domain }: any) => domain === 'service-runtime',
    run: async (_runtime: unknown, context: any) => {
      const [action = 'overview', ...args] = context.argv.slice(3);
      if (!ACTIONS.includes(action)) throw new Error(`Unknown service-runtime action: ${action}`);
      const values = new Map<string, string>();
      const backendTargetArgs: string[] = [];
      for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        if (!FLAGS.includes(flag) || flag !== '--backend-target' && values.has(flag)) throw new Error(`Unknown or duplicate argument: ${flag}`);
        if (flag === '--json') { values.set(flag, 'true'); continue; }
        const value = args[++index]; if (value === undefined) throw new Error(`Missing value: ${flag}`);
        if (flag === '--backend-target') { backendTargetArgs.push(value); continue; }
        values.set(flag, value);
      }
      const backendTargets = backendTargetArgs.map(item => {
        const split = item.indexOf(':');
        const serviceCode = split > 0 ? item.slice(0, split) : '';
        const runId = split > 0 ? item.slice(split + 1) : '';
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(serviceCode) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) throw new Error(`--backend-target 必须是 <serviceCode>:<runId>，得到：${item}`);
        return { serviceCode, target: 'run' as const, runId };
      });
      const root = path.resolve(values.get('--target') || process.cwd());
      const required = (...flags: string[]) => { for (const flag of flags) if (!values.has(flag)) throw new Error(`${action} 需要 ${flag}。`); };
      let result: unknown;
      if (action === 'task-show' || action === 'task-start') {
        required('--task');
        if (!deps.taskRuntime) throw new Error('任务本地运行入口当前不可用。');
        const taskId = values.get('--task')!;
        if (action === 'task-show') result = await deps.taskRuntime.detail(root, taskId);
        else {
          required('--services');
          const origin = values.get('--origin') ?? 'agent';
          const connection = values.get('--connection');
          if (origin !== 'agent' && origin !== 'human') throw new Error('--origin 必须为 agent 或 human。');
          if (connection !== undefined && connection !== 'local' && connection !== 'remote') throw new Error('--connection 必须单选 local 或 remote。');
          const codes = values.get('--services')!.split(',').map(code => code.trim());
          if (codes.some(code => !code) || new Set(codes).size !== codes.length) throw new Error('--services 必须是非空且不重复的服务编码列表。');
          const observed = await deps.taskRuntime.detail(root, taskId);
          const declaredTargets = new Set(observed.services.filter(item => codes.includes(item.service.code)).flatMap(item => (item.service.definition?.local.backends ?? []).map(backend => backend.serviceCode)));
          if (backendTargets.some(target => !declaredTargets.has(target.serviceCode))) throw new Error('目标未在所选服务的运行定义中声明。');
          const selected = codes.map(serviceCode => {
            const item = observed.services.find(item => item.service.code === serviceCode);
            const declared = new Set((item?.service.definition?.local.backends ?? []).map(backend => backend.serviceCode));
            const explicitTargets = backendTargets.filter(target => declared.has(target.serviceCode) && (!codes.includes(target.serviceCode) || item?.service.definition?.local.backends?.some(backend => backend.serviceCode === target.serviceCode && backend.kind === 'service-discovery')));
            const observedTargets = connection !== 'remote'
              ? (item?.connectionTarget ?? []).filter(availability => availability.target && !codes.includes(availability.serviceCode) && !explicitTargets.some(target => target.serviceCode === availability.serviceCode))
                  .map(availability => ({ serviceCode: availability.serviceCode, target: 'run' as const, runId: availability.target!.runId }))
              : [];
            const selectionTargets = [...explicitTargets, ...observedTargets];
            return { serviceCode, worktreeId: item?.worktree?.id ?? '', ...(selectionTargets.length ? { backendTargets: selectionTargets } : {}), ...(item?.worktree ? { expectedWorktree: { path: item.worktree.path, branch: item.worktree.branch, head: item.worktree.head, dirty: item.worktree.dirty } } : {}) };
          });
          result = await deps.taskRuntime.start(root, { taskId, selected, origin, ...(connection ? { connection } : {}) });
        }
      } else if (action === 'overview') result = await deps.view.overview(root);
      else if (action === 'show') { required('--service'); result = await deps.view.detail(root, values.get('--service')!); }
      else if (action === 'worktrees') { required('--service'); result = deps.runtime.listWorktrees(root, values.get('--service')!, values.get('--task')); }
      else if (action === 'start') {
        required('--service', '--worktree');
        const origin = values.get('--origin') ?? 'agent';
        const connection = values.get('--connection');
        if (origin !== 'agent' && origin !== 'human') throw new Error('--origin 必须为 agent 或 human。');
        if (connection !== undefined && connection !== 'local' && connection !== 'remote') throw new Error('--connection 必须单选 local 或 remote。');
        const started = await deps.runtime.startRun(root, { serviceCode: values.get('--service')!, worktreeId: values.get('--worktree')!, origin, ...(connection ? { connection } : {}), ...(backendTargets.length ? { backendTargets } : {}), ...(values.has('--expected-backend-run') ? { expectedBackendRunId: values.get('--expected-backend-run')! } : {}), ...(values.has('--task') ? { taskId: values.get('--task')! } : {}) });
        result = await deps.runtime.waitForRun(root, started.id);
      } else if (action === 'restart') {
        required('--run');
        for (const flag of values.keys()) if (!['--run', '--connection', '--expected-backend-run', '--backend-target', '--expected-routing-digest', '--target', '--json'].includes(flag)) throw new Error(`restart 不接受 ${flag}，代码来源由当前实例确定。`);
        const connection = values.get('--connection');
        if (connection !== undefined && connection !== 'local' && connection !== 'remote') throw new Error('--connection 必须单选 local 或 remote。');
        const started = await deps.runtime.restartRun(root, values.get('--run')!, { origin: 'agent', ...(connection ? { connection } : {}), ...(backendTargets.length ? { backendTargets } : {}), ...(values.has('--expected-backend-run') ? { expectedBackendRunId: values.get('--expected-backend-run')! } : {}), ...(values.has('--expected-routing-digest') ? { expectedRoutingDigest: values.get('--expected-routing-digest')! } : {}) });
        result = await deps.runtime.waitForRun(root, started.id);
      } else if (action === 'stop') { required('--run'); result = await deps.runtime.stopRun(root, values.get('--run')!); }
      else {
        required('--run');
        const maxBytes = values.has('--max-bytes') ? Number(values.get('--max-bytes')) : undefined;
        if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes < 1024)) throw new Error('--max-bytes 必须是不小于 1024 的整数。');
        result = deps.runtime.readLog(root, values.get('--run')!, maxBytes === undefined ? {} : { maxBytes });
      }
      console.log(JSON.stringify(result, null, 2));
      return result;
    },
  })];
}
