export type Worktree = {
  id: string;
  label: string;
  path: string;
  branch: string;
  head: string;
  dirty: boolean;
};

export type LocalRun = {
  id: string;
  worktreeId: string;
  actualPort: number;
  startedAt: string;
  portNote: string;
  logs: string[];
};

export type QaDeployment = {
  state: 'success' | 'submitted' | 'failed' | 'unknown';
  version: string;
  at: string;
};

export type LocalRuntime = {
  command: string[];
  cwd: string;
  profile: string;
  preferredPort: number;
  portOverride: string;
  readiness: string;
  timeoutSeconds: number;
  notes: string[];
};

export type QaRuntime = {
  connection: string;
  target: string;
  targetRef: string;
  lastDeploy?: QaDeployment;
};

export type ServiceRuntime = {
  source: 'agent' | 'manual';
  verifiedAt: string;
  local: LocalRuntime;
  qa?: QaRuntime;
};

export type RemoteBranch = {
  branch: string;
  commit: string;
};

export type Service = {
  id: string;
  code: string;
  name: string;
  description: string;
  repository: string;
  projects: string[];
  worktrees: Worktree[];
  remoteBranches: RemoteBranch[];
  runs: LocalRun[];
  runtime?: ServiceRuntime;
};

export type QaPlan = {
  serviceName: string;
  target: string;
  targetRef: string;
  connection: string;
  branch: string;
  integration: boolean;
  remoteCommit: string;
  localHead: string;
  dirty: boolean;
  expiresAt: string;
};

const freshxLogs = (worktree: Worktree, port: number): string[] => [
  `[14:02:08] worktree: ${worktree.path}`,
  '[14:02:10] The following profiles are active: local',
  `[14:02:12] Tomcat initialized with port(s): ${port} (http)`,
  '[14:02:15] Nacos registry: local instance registered, weight=0',
  '[14:02:21] Started FreshXApplication in 13.284 seconds (JVM running for 15.107)',
];

const frontendLogs = (worktree: Worktree, port: number): string[] => [
  `[13:40:01] worktree: ${worktree.path}`,
  '[13:40:02] VITE v6.4.3 ready in 820 ms',
  `[13:40:02] Local: http://localhost:${port}`,
  '[13:40:02] press h + enter to show help',
];

export function createServices(state = ''): Service[] {
  const freshxRuns: LocalRun[] = [
    {
      id: 'run-main',
      worktreeId: 'main',
      actualPort: 8081,
      startedAt: '今天 14:02',
      portNote: '首选 8080 被其他进程占用，已避让',
      logs: freshxLogs(
        { id: 'main', label: '主检出', path: 'repositories/freshx-pigs', branch: 'dev-pigs', head: '3f2a1c9', dirty: true },
        8081,
      ),
    },
    {
      id: 'run-fix-order',
      worktreeId: 'fix-order',
      actualPort: 8082,
      startedAt: '今天 14:10',
      portNote: '工作树独立实例',
      logs: freshxLogs(
        { id: 'fix-order', label: '任务 fix-order-price', path: '.buildr/worktrees/fix-order-price', branch: 'task/fix-order-price', head: 'a18c2f0', dirty: false },
        8082,
      ),
    },
  ];

  const freshxQa: QaRuntime = {
    connection: '集鲜云雀',
    target: '农牧后端业务服务',
    targetRef: 'JX-FRESHX-PIGS-QA',
    lastDeploy: state === 'qa-submitted'
      ? { state: 'submitted', version: 'dev-pigs@3f2a1c9', at: '刚刚' }
      : { state: 'success', version: 'dev-pigs@3f2a1c9', at: '今天 12:34' },
  };

  return [
    {
      id: 'freshx-pigs',
      code: 'freshx-pigs',
      name: '农牧后端业务服务',
      description: '生猪和鸡蛋共用的 FreshX 后端服务线，承载采购、销售、库存、竞拍、合同、履约和财务等核心逻辑。',
      repository: 'freshx-pigs',
      projects: ['生猪业务', '鸡蛋业务', '农贸'],
      remoteBranches: [
        { branch: 'dev-pigs', commit: '3f2a1c9' },
        { branch: 'task/fix-order-price', commit: 'a18c2f0' },
        { branch: 'task/add-report', commit: '7b1e4d2' },
        { branch: 'feature/supplier-onboard', commit: '9c41e07' },
      ],
      worktrees: [
        { id: 'main', label: '主检出', path: 'repositories/freshx-pigs', branch: 'dev-pigs', head: '3f2a1c9', dirty: true },
        { id: 'fix-order', label: '任务 fix-order-price', path: '.buildr/worktrees/fix-order-price', branch: 'task/fix-order-price', head: 'a18c2f0', dirty: false },
        { id: 'add-report', label: '任务 add-report', path: '.buildr/worktrees/add-report', branch: 'task/add-report', head: '7b1e4d2', dirty: false },
      ],
      runs: freshxRuns,
      runtime: {
        source: 'agent',
        verifiedAt: '今天 14:02',
        local: {
          command: ['mvnd', '-pl', 'saas-freshx-biz', '-am', 'spring-boot:run', '-Dspring-boot.run.profiles=local'],
          cwd: 'saas-freshx-biz',
          profile: 'local',
          preferredPort: 8080,
          portOverride: '--server.port',
          readiness: '日志出现 Started FreshXApplication',
          timeoutSeconds: 180,
          notes: ['local profile 注册 QA Nacos，权重 0', 'MQ 消费边界未确认'],
        },
        qa: freshxQa,
      },
    },
    {
      id: 'fe-pork-operation',
      code: 'fe-pork-operation',
      name: '猪肉运营前端',
      description: '猪肉业务的运营后台前端，包含商品、订单、价格和供应商页面。',
      repository: 'fe-pork-operation',
      projects: ['猪肉业务'],
      remoteBranches: [
        { branch: 'dev', commit: '5e7c1b2' },
        { branch: 'task/pricing-page', commit: 'c31d8a4' },
      ],
      worktrees: [
        { id: 'main', label: '主检出', path: 'repositories/fe-pork-operation', branch: 'dev', head: '5e7c1b2', dirty: false },
        { id: 'pricing', label: '任务 pricing-page', path: '.buildr/worktrees/pricing-page', branch: 'task/pricing-page', head: 'c31d8a4', dirty: false },
      ],
      runs: [
        {
          id: 'run-fe-main',
          worktreeId: 'main',
          actualPort: 3301,
          startedAt: '今天 13:40',
          portNote: '使用首选端口',
          logs: frontendLogs(
            { id: 'main', label: '主检出', path: 'repositories/fe-pork-operation', branch: 'dev', head: '5e7c1b2', dirty: false },
            3301,
          ),
        },
      ],
      runtime: {
        source: 'agent',
        verifiedAt: '今天 13:35',
        local: {
          command: ['yarn', 'dev:qa'],
          cwd: '.',
          profile: 'qa',
          preferredPort: 3301,
          portOverride: '--port',
          readiness: '日志出现 Local:',
          timeoutSeconds: 120,
          notes: ['前端开发服务器', '不涉及 Nacos 注册'],
        },
        qa: {
          connection: '集鲜云雀',
          target: '猪肉运营前端',
          targetRef: 'JX-PORK-OPERATION-QA',
        },
      },
    },
    {
      id: 'freshx-nm',
      code: 'freshx-nm',
      name: '消息通知服务',
      description: '统一消息与通知服务，负责站内信、短信和供应商消息。',
      repository: 'freshx-nm',
      projects: ['基础服务'],
      remoteBranches: [
        { branch: 'dev', commit: '897d97ae' },
      ],
      worktrees: [
        { id: 'main', label: '主检出', path: 'repositories/freshx-nm', branch: 'dev', head: '897d97ae', dirty: false },
      ],
      runs: [],
    },
  ];
}

export function worktreeOf(service: Service, run: LocalRun): Worktree {
  return service.worktrees.find(worktree => worktree.id === run.worktreeId) ?? service.worktrees[0];
}

export function nextAvailablePort(services: Service[], service: Service): number {
  const used = new Set<number>([8080, ...services.flatMap(item => item.runs.map(run => run.actualPort))]);
  let port = service.runtime?.local.preferredPort ?? 8080;
  while (used.has(port)) port += 1;
  return port;
}

export function qaPlanFor(service: Service, branch?: string): QaPlan | null {
  const qa = service.runtime?.qa;
  if (!qa) return null;
  const integration = integrationBranchOf(service);
  const remote = service.remoteBranches.find(item => item.branch === (branch || integration)) ?? service.remoteBranches[0];
  const local = service.worktrees.find(worktree => worktree.branch === remote.branch);
  return {
    serviceName: service.name,
    target: qa.target,
    targetRef: qa.targetRef,
    connection: qa.connection,
    branch: remote.branch,
    integration: remote.branch === integration,
    remoteCommit: remote.commit,
    localHead: local ? local.head : '无本地检出',
    dirty: local?.dirty ?? false,
    expiresAt: '10 分钟',
  };
}

export function integrationBranchOf(service: Service): string {
  return (service.worktrees.find(worktree => worktree.id === 'main') ?? service.worktrees[0]).branch;
}

export function createRunLogs(service: Service, worktree: Worktree, port: number): string[] {
  return service.id === 'fe-pork-operation' ? frontendLogs(worktree, port) : freshxLogs(worktree, port);
}
