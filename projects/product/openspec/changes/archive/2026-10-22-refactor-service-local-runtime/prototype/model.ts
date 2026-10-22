export type ServiceId = 'backend' | 'frontend' | 'platform';
export type RunStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
export type SourceKind = 'main' | 'task';

export interface Worktree {
  id: string;
  kind: SourceKind;
  label: string;
  path: string;
  branch: string;
  commit: string;
  dirty: boolean;
  taskTitle?: string;
}

export interface RuntimeService {
  id: ServiceId;
  name: string;
  code: string;
  kind: 'frontend' | 'backend';
  description: string;
  preferredPort: number;
  configured: boolean;
  worktrees: Worktree[];
}

export interface Run {
  id: string;
  serviceId: ServiceId;
  worktreeId: string;
  status: RunStatus;
  port: number;
  startedAt: string;
  dirtyAtStart: boolean;
  origin: 'human' | 'agent';
  backendRunId?: string;
  connection: 'local' | 'remote';
  failure?: string;
}

export const services: RuntimeService[] = [
  {
    id: 'backend',
    name: '生猪和鸡蛋后端业务服务',
    code: 'freshx-pigs',
    kind: 'backend',
    description: '生猪业务接口，为运营端提供订单、客户与结算能力。',
    preferredPort: 8080,
    configured: true,
    worktrees: [
      {
        id: 'backend-main',
        kind: 'main',
        label: '主工作库',
        path: '/Users/chenjun/workspaces/jixian/repositories/freshx-pigs',
        branch: 'dev-pigs',
        commit: '07756f8',
        dirty: false,
      },
      {
        id: 'backend-task',
        kind: 'task',
        label: '生猪订单流程验证',
        path: '/Users/chenjun/workspaces/jixian/.buildr/worktrees/pig-order-validation/freshx-pigs',
        branch: 'codex/pig-order-validation',
        commit: '07756f8',
        dirty: false,
        taskTitle: '生猪订单流程验证',
      },
    ],
  },
  {
    id: 'frontend',
    name: '生猪运营端前端',
    code: 'fe-freshx-customer',
    kind: 'frontend',
    description: '生猪运营端宿主前端；通过 /wj_platform 路由复用 fe-freshx-platform 共用页面',
    preferredPort: 3000,
    configured: true,
    worktrees: [
      {
        id: 'frontend-main',
        kind: 'main',
        label: '主工作库',
        path: '/Users/chenjun/workspaces/jixian/repositories/fe-freshx-customer',
        branch: 'qa',
        commit: '482c07d',
        dirty: false,
      },
      {
        id: 'frontend-task',
        kind: 'task',
        label: '生猪订单流程验证',
        path: '/Users/chenjun/workspaces/jixian/.buildr/worktrees/pig-order-validation/fe-freshx-customer',
        branch: 'codex/pig-order-validation',
        commit: '482c07d',
        dirty: true,
        taskTitle: '生猪订单流程验证',
      },
    ],
  },
  {
    id: 'platform',
    name: '生猪平台端前端',
    code: 'fe-freshx-platform',
    kind: 'backend',
    description: '尚未配置本地启动方式，可交给智能体（Agent）准备。',
    preferredPort: 8090,
    configured: false,
    worktrees: [],
  },
];

export function seedRuns(mode = 'default'): Run[] {
  if (mode === 'empty') return [];
  const runs: Run[] = [
    {
      id: 'run-backend-main',
      serviceId: 'backend',
      worktreeId: 'backend-main',
      status: 'running',
      port: 8080,
      startedAt: '2026-10-22T14:02:00+08:00',
      dirtyAtStart: false,
      origin: 'human',
      connection: 'remote',
    },
    {
      id: 'run-backend-task',
      serviceId: 'backend',
      worktreeId: 'backend-task',
      status: 'running',
      port: 8081,
      startedAt: '2026-10-22T14:18:00+08:00',
      dirtyAtStart: false,
      origin: 'agent',
      connection: 'remote',
    },
    {
      id: 'run-frontend-task',
      serviceId: 'frontend',
      worktreeId: 'frontend-task',
      status: mode === 'failure' || mode === 'failed' ? 'failed' : mode === 'starting' || mode === 'startup' ? 'starting' : 'running',
      port: 3001,
      startedAt: '2026-10-22T14:18:25+08:00',
      dirtyAtStart: true,
      origin: 'agent',
      backendRunId: 'run-backend-task',
      connection: 'local',
      ...(mode === 'failure' || mode === 'failed' ? { failure: '启动超时：90 秒内未获得页面响应。' } : {}),
    },
  ];
  return runs.map((run) => ({ ...run }));
}

export function logLines(run: Run, service: RuntimeService): string[] {
  const worktree = service.worktrees.find((item) => item.id === run.worktreeId);
  const branch = worktree?.branch ?? '未知分支';
  const header = [
    `[14:18:25] 启动 ${service.name}`,
    `[14:18:25] 来源：${worktree?.label ?? '工作目录'} · ${branch}`,
    `[14:18:25] 代码：${worktree?.commit ?? '—'}${run.dirtyAtStart ? ' · 含未提交改动' : ' · 无未提交改动'}`,
    `[14:18:25] 端口：${run.port}`,
  ];
  if (run.status === 'failed') {
    return [
      ...header,
      '[14:18:26] > yarn dev',
      '[14:18:27] 开发服务进程已启动，等待页面响应…',
      '[14:19:57] ERROR 就绪检查超时：90 秒内未获得页面响应',
      '[14:19:57] 启动超时：90 秒内未获得页面响应。',
      '[14:19:57] 同一任务的后端仍在运行，可继续查看或单独停止。',
    ];
  }
  if (run.status === 'stopped') {
    return [...header, '[14:18:30] 就绪检查通过', '[14:29:02] 收到停止请求', '[14:29:03] 服务已停止，端口已释放'];
  }
  if (run.status === 'stopping') {
    return [...header, '[14:18:30] 就绪检查通过', '[14:29:02] 收到停止请求', '[14:29:02] 正在等待进程退出…'];
  }
  if (service.kind === 'frontend') {
    const startup = [
      ...header,
      '[14:18:26] > yarn dev',
      '[14:18:27] 正在启动开发服务…',
      `[14:18:28] 业务后端：${run.connection === 'local' ? `http://localhost:8081 · ${worktree?.kind==='main'?'主工作库':'同一任务'}` : 'https://qa-gateway.example.com · 远程环境'}`,
    ];
    return run.status === 'starting' ? [...startup, '[14:18:29] 正在检查访问入口…'] : [...startup, `[14:18:30] Local: http://localhost:${run.port}/`, '[14:18:30] 就绪检查通过', '[14:19:12] GET / 200', '[14:19:13] GET /api/pigs/orders 200'];
  }
  const startup = [...header, '[14:18:26] > mvn spring-boot:run', '[14:18:27] 正在加载服务配置…', '[14:18:28] 正在建立数据库连接…'];
  return run.status === 'starting' ? [...startup, '[14:18:29] 等待健康检查…'] : [...startup, `[14:18:30] Tomcat started on port ${run.port}`, '[14:18:31] GET /actuator/health 200', '[14:18:31] 就绪检查通过'];
}
