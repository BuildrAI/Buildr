import process from 'node:process';
import { createRuntime, runtimeContributions } from '../runtime.ts';
import { registerCommandHelp } from './help.ts';
import { isVersionRequest, printVersion } from './identity.ts';
import { printCliError } from './diagnostics.ts';
import { createGitWorktreeCliContributions, createTaskCliContributions, createTaskReviewCliContributions } from '../../task/module.ts';
import { createOpenSpecCliContributions } from '../../task/openspec/module.ts';
import { createWorkspaceCliContributions } from '../../workspace/module.ts';
import { createInstallationCliContributions, createLauncherCliContributions } from '../../system/installation/module.ts';
import { createAgentAssetsCliContributions } from '../../agent-assets/interfaces/cli/agent-assets.ts';
import { WEB_CLI_GROUPS } from '../../web/interfaces/cli/web.ts';

const TASK_MODULE_COMMAND_SLOT = Symbol('task-module-command-contributions');
const WORKSPACE_INIT_COMMAND_SLOT = Symbol('workspace-init-command-contribution');
const WORKSPACE_BOOTSTRAP_COMMAND_SLOT = Symbol('workspace-bootstrap-command-contribution');
const WORKSPACE_MUTATION_COMMAND_SLOT = Symbol('workspace-mutation-command-contribution');
const WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT = Symbol('workspace-daily-progress-command-contributions');
const AGENT_ASSETS_PACKAGE_COMMAND_SLOT = Symbol('agent-assets-package-command-contributions');
const AGENT_ASSETS_RUNTIME_COMMAND_SLOT = Symbol('agent-assets-runtime-command-contributions');
const AGENT_ASSETS_SOURCE_COMMAND_SLOT = Symbol('agent-assets-source-command-contributions');
const OPENSPEC_MODULE_COMMAND_SLOT = Symbol('openspec-module-command-contributions');

const AGENT_ASSETS_PACKAGE_COMMANDS: any = new Set(['package check', 'package build']);
const AGENT_ASSETS_RUNTIME_COMMANDS: any = new Set(['runtime list', 'commands check', 'commands add', 'commands remove']);
const AGENT_ASSETS_SOURCE_COMMANDS: any = new Set([
  'component list',
  'component check',
  'component install',
  'component uninstall',
  'rules add',
  'rules remove',
  'builtin list',
  'builtin uninstall',
  'builtin restore',
  'render',
  'sync',
  'skills add',
  'skills remove',
  'skills bind',
  'skills unbind',
  'skill install',
  'runtime check',
  'skills render',
  'rules render',
]);
const OPENSPEC_MODULE_COMMANDS: any = new Set([
  'openspec converge',
  'openspec convergence preflight',
  'openspec convergence inspect',
]);
const WORKSPACE_PRIMARY_COMMANDS = new Set(['init', 'bootstrap guide', 'mutation recover']);

const COMMAND_ROUTES: any[] = [
  WORKSPACE_INIT_COMMAND_SLOT,
  WORKSPACE_BOOTSTRAP_COMMAND_SLOT,
  AGENT_ASSETS_PACKAGE_COMMAND_SLOT,
  WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT,
  ...['inspect', 'validate', 'update'].map((operation: any) => ({
    key: `project verification ${operation}`,
    surface: 'agent-machine',
    summary: operation === 'inspect' ? '读取 Project 测试地图。' : operation === 'validate' ? '校验 Agent 形成的 verification.yml 候选。' : '按已观察版本更新 Project 测试地图。',
    help: [operation === 'inspect'
      ? 'Usage: buildr project verification inspect <project> [--target <workspace>] [--json]'
      : operation === 'validate'
        ? 'Usage: buildr project verification validate <project> --file <candidate.yml> [--target <workspace>] [--json]'
        : 'Usage: buildr project verification update <project> --file <candidate.yml> --expected-identity <identity|absent> [--target <workspace>] [--json]', '', 'Task Verification Skill 指导 Agent 从真实测试代码、构建脚本、CI 与说明形成候选；Application 只校验和维护测试地图。'],
    match: ({ domain, action, runtimeId }: any) => domain === 'project' && action === 'verification' && runtimeId === operation,
    run: (r: any, c: any) => r.projectVerificationCommand(operation, c.argv.slice(5)),
  })),
  TASK_MODULE_COMMAND_SLOT,
  WORKSPACE_MUTATION_COMMAND_SLOT,
  AGENT_ASSETS_RUNTIME_COMMAND_SLOT,
  OPENSPEC_MODULE_COMMAND_SLOT,
  AGENT_ASSETS_SOURCE_COMMAND_SLOT,
];

const COMMAND_GROUPS: any[] = [
  {
    key: "project daily-progress",
    surface: "agent-machine",
    summary: "记录、查看或列出 Project 本机每日演进；写本机文件，Task 关联可选，不进入 Git 或 Task SQLite。",
    help: [
      "Usage: buildr project daily-progress <record|inspect|list> --project <code> ...",
      "",
      "记录、查看或列出 Project 本机每日演进。这些命令写本机 YAML 并可关联本机 Task Record，不进入 Git 或 Task SQLite，不扫描 Git，也不是 primary 人类主路径，不提供定时调度。"
    ],
    executable: false,
  },
  {
    key: "task",
    surface: "primary",
    summary: "Task Manager只管理Task Record；专业动作由对应Skill和Interface处理。",
    help: [
      "Usage: buildr task <create|inspect|update|activate|complete|abandon> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Manager只管理canonical Workspace中的Task Record；专业事实由各自Application读取。",
      "它不执行开发、Review、Verification、Git、交付、cleanup或publication，也不接受完整next-state文档。",
      "Agent 和 Buildr Web 都调用同一个 Task Record Application；不要直接操作 Workspace SQLite，也不要把旧 task.yml 当作 Task authority。"
    ],
    executable: false,
  },
  {
    key: "task review",
    surface: "agent-machine",
    summary: "Task Review CLI 只管理已经完整形成的 Planning/Completion Result；两个槽位均可选，它不执行 Review 或设置统一门禁。",
    help: [
      "Usage: buildr task review <inspect|record> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Review CLI 只管理已经完整形成的 Planning/Completion Result；两个槽位均可选，它不执行 Review 或设置统一门禁。",
      "record 必须由调用方提供明确 target identity；Review 中断时不调用 writer，inspect 通过 identity 比较派生 current/stale/unknown。"
    ],
    executable: false,
  },
  {
    key: "task verification",
    surface: "agent-machine",
    summary: "Task Verification CLI 只管理一个已经完整形成的 current Result；它不自动选择或执行能力，也不拥有 Task 推进、Candidate 或风险接受。",
    help: [
      "Usage: buildr task verification <inspect|record> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Verification CLI 只管理一个已经完整形成的 current Result；它不自动选择或执行能力，也不拥有 Task 推进、Candidate 或风险接受。",
      "Result 绑定明确 target identity 与 Task scope 内当前 Project declaration identities；中断、结论不完整或写入失败时不覆盖 current。"
    ],
    executable: false,
  },
];

function executableCommand(descriptor: any): any  {
  return Object.freeze({ ...descriptor, executable: true, replacement: descriptor.replacement || null });
}

const SPECIAL_COMMANDS: any[] = [
  executableCommand({
    key: 'help',
    surface: 'primary',
    summary: '查询 canonical command 或 aggregate topic。',
    help: ['Usage: buildr help [command ...]', '', '查询由 command catalog 声明的 canonical command 或 aggregate topic。'],
    match: ({ runtime, rawArgs }: any) => runtime.isHelpRequest(rawArgs),
    run: (runtime: any, context: any) => {
      const helpArgs = context.rawArgs[0] === 'help' ? context.rawArgs.slice(1) : context.rawArgs;
      if (runtime.printHelp(helpArgs)) return;
      process.exit(printCliError(context.rawArgs, { candidates: commandCandidates(context.commandRegistry), helpTopic: context.rawArgs[0] === 'help' }));
    },
  }),
  executableCommand({
    key: 'version',
    surface: 'primary',
    summary: '输出当前实际执行的 Buildr CLI package identity。',
    help: [
      'Usage: buildr version [--json]',
      '',
      '输出当前实际执行的 Buildr CLI package identity。也可使用 buildr --version 或 buildr -V。',
    ],
    match: ({ rawArgs }: any) => isVersionRequest(rawArgs),
    run: (_runtime: any, context: any) => printVersion(context.rawArgs),
  }),
];

function createCommandRegistry(moduleContributions: any): any  {
  const agentAssetsPackageContributions = moduleContributions.filter((route: any) => AGENT_ASSETS_PACKAGE_COMMANDS.has(route.key));
  const agentAssetsRuntimeContributions = moduleContributions.filter((route: any) => AGENT_ASSETS_RUNTIME_COMMANDS.has(route.key));
  const agentAssetsSourceContributions = moduleContributions.filter((route: any) => AGENT_ASSETS_SOURCE_COMMANDS.has(route.key));
  const workspaceDailyProgressContributions = moduleContributions.filter((route: any) => route.key.startsWith('project daily-progress '));
  const nonAgentAssetsContributions = moduleContributions.filter((route: any) => (
    !AGENT_ASSETS_PACKAGE_COMMANDS.has(route.key)
    && !AGENT_ASSETS_RUNTIME_COMMANDS.has(route.key)
    && !AGENT_ASSETS_SOURCE_COMMANDS.has(route.key)
    && !OPENSPEC_MODULE_COMMANDS.has(route.key)
    && !WORKSPACE_PRIMARY_COMMANDS.has(route.key)
    && !route.key.startsWith('project daily-progress ')
  ));
  const routes = COMMAND_ROUTES.flatMap((route: any) => {
    if (route === WORKSPACE_INIT_COMMAND_SLOT) return moduleContributions.filter((item: any) => item.key === 'init');
    if (route === WORKSPACE_BOOTSTRAP_COMMAND_SLOT) return moduleContributions.filter((item: any) => item.key === 'bootstrap guide');
    if (route === WORKSPACE_MUTATION_COMMAND_SLOT) return moduleContributions.filter((item: any) => item.key === 'mutation recover');
    if (route === AGENT_ASSETS_PACKAGE_COMMAND_SLOT) return agentAssetsPackageContributions;
    if (route === AGENT_ASSETS_RUNTIME_COMMAND_SLOT) return agentAssetsRuntimeContributions;
    if (route === AGENT_ASSETS_SOURCE_COMMAND_SLOT) return agentAssetsSourceContributions;
    if (route === WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT) return workspaceDailyProgressContributions;
    if (route === OPENSPEC_MODULE_COMMAND_SLOT) return moduleContributions.filter((item: any) => OPENSPEC_MODULE_COMMANDS.has(item.key));
    if (route === TASK_MODULE_COMMAND_SLOT) return nonAgentAssetsContributions;
    return [route];
  });
  return Object.freeze([...SPECIAL_COMMANDS, ...routes.map(executableCommand)]);
}

function createCommandCatalog(commandRegistry: any): any  {
  return Object.freeze([...commandRegistry, ...COMMAND_GROUPS.map(Object.freeze), ...WEB_CLI_GROUPS]);
}

export const COMMAND_REGISTRY = createCommandRegistry([
  ...createWorkspaceCliContributions(),
  ...createAgentAssetsCliContributions(),
  ...createGitWorktreeCliContributions(),
  ...createTaskCliContributions(),
  ...createTaskReviewCliContributions(),
  ...createOpenSpecCliContributions(),
  ...createInstallationCliContributions(),
  ...createLauncherCliContributions(),
]);
export const COMMAND_CATALOG = createCommandCatalog(COMMAND_REGISTRY);

function commandCandidates(commandRegistry: any): any  {
  return commandRegistry.map((item: any) => item.key);
}

export function dispatch(argv: any = process.argv): any  {
  const runtime = createRuntime();
  const commandRegistry = createCommandRegistry(runtimeContributions(runtime, 'cli'));
  const commandCatalog = createCommandCatalog(commandRegistry);
  registerCommandHelp(runtime, commandCatalog);
  const rawArgs = argv.slice(2);
  const [domain, action, runtimeId, ...args] = rawArgs;
  const context: any = { argv, rawArgs, domain, action, runtimeId, args, runtime, commandRegistry, commandCatalog };
  const direct = commandRegistry.find((item: any) => !item.requiresAgent && item.match(context));
  if (direct) return direct.run(runtime, context);
  const agent = commandRegistry.find((item: any) => item.requiresAgent && item.match(context));
  if (agent && runtime.isSupportedAgent(runtimeId)) return agent.run(runtime, context);
  process.exit(printCliError(rawArgs, { candidates: commandCandidates(commandRegistry) }));
}
