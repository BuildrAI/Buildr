import process from 'node:process';
import { createRuntime, runtimeContributions } from '../runtime.mjs';
import { registerCommandHelp } from './help.mjs';
import { isVersionRequest, printVersion } from './identity.ts';
import { printCliError } from './diagnostics.mjs';
import { createGitWorktreeCliContributions, createTaskRecordCliContributions, createTaskReviewCliContributions } from '../../task/module.mjs';
import { createOpenSpecCliContributions } from '../../task/openspec/module.mjs';
import { createWorkspaceCliContributions } from '../../workspace/module.mjs';
import { createInstallationCliContributions, createLauncherCliContributions } from '../../system/installation/module.mjs';
import { createAgentAssetsCliContributions } from '../../agent-assets/interfaces/cli/agent-assets.mjs';
import { WEB_CLI_GROUPS } from '../../web/interfaces/cli/web.ts';

const TASK_MODULE_COMMAND_SLOT = Symbol('task-module-command-contributions');
const WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT = Symbol('workspace-daily-progress-command-contributions');
const AGENT_ASSETS_PACKAGE_COMMAND_SLOT = Symbol('agent-assets-package-command-contributions');
const AGENT_ASSETS_RUNTIME_COMMAND_SLOT = Symbol('agent-assets-runtime-command-contributions');
const AGENT_ASSETS_SOURCE_COMMAND_SLOT = Symbol('agent-assets-source-command-contributions');
const OPENSPEC_MODULE_COMMAND_SLOT = Symbol('openspec-module-command-contributions');

const AGENT_ASSETS_PACKAGE_COMMANDS = new Set(['package check', 'package build']);
const AGENT_ASSETS_RUNTIME_COMMANDS = new Set(['runtime list', 'commands check', 'commands add', 'commands remove']);
const AGENT_ASSETS_SOURCE_COMMANDS = new Set([
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
const OPENSPEC_MODULE_COMMANDS = new Set([
  'openspec converge',
  'openspec convergence preflight',
  'openspec convergence inspect',
]);

const COMMAND_ROUTES = [
  {
    key: "init",
    surface: "primary",
    summary: "首次 onboarding 推荐传入 --agent：初始化源资产后复用完整 sync，并以最终 doctor 通过作为技术完成条件；随后由 Agent 根据真实 Project/Service 状态完成简短首次使用交接并邀请第一项工作。",
    help: [
      "Usage: buildr init [--agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy>] [--target <dir>] [--name <name>] [--description <text>] [--profile <personal|team|company>]",
      "",
      "首次 onboarding 推荐传入 --agent：初始化源资产后复用完整 sync，并以最终 doctor 通过作为技术完成条件；随后由 Agent 根据真实 Project/Service 状态完成简短首次使用交接并邀请第一项工作。",
      "不传 --agent 时只初始化源资产；已有 workspace 的日常更新继续使用 buildr sync <agent>。",
      "未提供 --description 时写入明确 TODO，并由 doctor 提示补全。",
      "--help 只输出帮助，不会写入文件。"
    ],
    match: ({ domain }) => domain === 'init',
    run: (r, c) => r.initBuildr(c.argv.slice(3)),
  },
  {
    key: "bootstrap guide",
    surface: "primary",
    summary: "输出最小 bootstrap 指南。",
    help: [
      "Usage: buildr bootstrap guide",
      "",
      "输出最小 bootstrap 指南。"
    ],
    match: ({ domain, action }) => domain === 'bootstrap' && action === 'guide',
    run: (r) => r.bootstrapGuide(),
  },
  AGENT_ASSETS_PACKAGE_COMMAND_SLOT,
  WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT,
  ...['inspect', 'validate', 'update'].map((operation) => ({
    key: `project verification ${operation}`,
    surface: 'agent-machine',
    summary: operation === 'inspect' ? '读取 Project 测试地图。' : operation === 'validate' ? '校验 Agent 形成的 verification.yml 候选。' : '按已观察版本更新 Project 测试地图。',
    help: [operation === 'inspect'
      ? 'Usage: buildr project verification inspect <project> [--target <workspace>] [--json]'
      : operation === 'validate'
        ? 'Usage: buildr project verification validate <project> --file <candidate.yml> [--target <workspace>] [--json]'
        : 'Usage: buildr project verification update <project> --file <candidate.yml> --expected-identity <identity|absent> [--target <workspace>] [--json]', '', 'Task Verification Skill 指导 Agent 从真实测试代码、构建脚本、CI 与说明形成候选；Application 只校验和维护测试地图。'],
    match: ({ domain, action, runtimeId }) => domain === 'project' && action === 'verification' && runtimeId === operation,
    run: (r, c) => r.projectVerificationCommand(operation, c.argv.slice(5)),
  })),
  TASK_MODULE_COMMAND_SLOT,
  {
    key: "mutation recover",
    surface: "agent-machine",
    summary: "从完整 transaction journal 和 backup 恢复操作前源资产；不会猜测或接受半完成新状态。",
    help: [
      "Usage: buildr mutation recover <transaction-id> [--target <dir>]",
      "",
      "从完整 transaction journal 和 backup 恢复操作前源资产；不会猜测或接受半完成新状态。"
    ],
    match: ({ domain, action }) => domain === 'mutation' && action === 'recover',
    run: (r, c) => r.mutationRecover(c.argv.slice(4)),
  },
  AGENT_ASSETS_RUNTIME_COMMAND_SLOT,
  OPENSPEC_MODULE_COMMAND_SLOT,
  AGENT_ASSETS_SOURCE_COMMAND_SLOT,
];

const COMMAND_GROUPS = [
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
      "Usage: buildr task <create|inspect|update|complete|abandon> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Manager只管理canonical Workspace中的Task Record；专业事实由各自Application读取。",
      "它不创建或记录 Task Environment，不执行开发、Review、Verification、Git、交付、Board、cleanup 或 publication，也不接受完整 next-state 文档。",
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
  {
    key: "task environment",
    surface: "agent-machine",
    summary: "Task Environment 独占 ready、恢复、执行投影、动态资源与 cleanup 事实。Task Record 不保存环境字段。",
    help: [
      "Usage: buildr task environment <plan record|plan inspect|prepare|inspect|cleanup> <task-id> [--target <canonical-workspace>] [--json]",
      "       buildr task environment plan record --schema|--example [--json]",
      "",
      "Task Environment 独占 ready、恢复、执行投影、动态资源与 cleanup 事实。Task Record 不保存环境字段。",
      "Agent登记Plan；prepare幂等执行与恢复；inspect只读复核；cleanup只接受可重新验证的Delivery evidence或已持久化的abandon终态。"
    ],
    executable: false,
  }
];

function executableCommand(descriptor) {
  return Object.freeze({ ...descriptor, executable: true, replacement: descriptor.replacement || null });
}

const SPECIAL_COMMANDS = [
  executableCommand({
    key: 'help',
    surface: 'primary',
    summary: '查询 canonical command 或 aggregate topic。',
    help: ['Usage: buildr help [command ...]', '', '查询由 command catalog 声明的 canonical command 或 aggregate topic。'],
    match: ({ runtime, rawArgs }) => runtime.isHelpRequest(rawArgs),
    run: (runtime, context) => {
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
    match: ({ rawArgs }) => isVersionRequest(rawArgs),
    run: (_runtime, context) => printVersion(context.rawArgs),
  }),
];

function createCommandRegistry(moduleContributions) {
  const agentAssetsPackageContributions = moduleContributions.filter((route) => AGENT_ASSETS_PACKAGE_COMMANDS.has(route.key));
  const agentAssetsRuntimeContributions = moduleContributions.filter((route) => AGENT_ASSETS_RUNTIME_COMMANDS.has(route.key));
  const agentAssetsSourceContributions = moduleContributions.filter((route) => AGENT_ASSETS_SOURCE_COMMANDS.has(route.key));
  const workspaceDailyProgressContributions = moduleContributions.filter((route) => route.key.startsWith('project daily-progress '));
  const nonAgentAssetsContributions = moduleContributions.filter((route) => (
    !AGENT_ASSETS_PACKAGE_COMMANDS.has(route.key)
    && !AGENT_ASSETS_RUNTIME_COMMANDS.has(route.key)
    && !AGENT_ASSETS_SOURCE_COMMANDS.has(route.key)
    && !OPENSPEC_MODULE_COMMANDS.has(route.key)
    && !route.key.startsWith('project daily-progress ')
  ));
  const routes = COMMAND_ROUTES.flatMap((route) => {
    if (route === AGENT_ASSETS_PACKAGE_COMMAND_SLOT) return agentAssetsPackageContributions;
    if (route === AGENT_ASSETS_RUNTIME_COMMAND_SLOT) return agentAssetsRuntimeContributions;
    if (route === AGENT_ASSETS_SOURCE_COMMAND_SLOT) return agentAssetsSourceContributions;
    if (route === WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT) return workspaceDailyProgressContributions;
    if (route === OPENSPEC_MODULE_COMMAND_SLOT) return moduleContributions.filter((item) => OPENSPEC_MODULE_COMMANDS.has(item.key));
    if (route === TASK_MODULE_COMMAND_SLOT) return nonAgentAssetsContributions;
    return [route];
  });
  return Object.freeze([...SPECIAL_COMMANDS, ...routes.map(executableCommand)]);
}

function createCommandCatalog(commandRegistry) {
  return Object.freeze([...commandRegistry, ...COMMAND_GROUPS.map(Object.freeze), ...WEB_CLI_GROUPS]);
}

export const COMMAND_REGISTRY = createCommandRegistry([
  ...createWorkspaceCliContributions(),
  ...createAgentAssetsCliContributions(),
  ...createGitWorktreeCliContributions(),
  ...createTaskRecordCliContributions(),
  ...createTaskReviewCliContributions(),
  ...createOpenSpecCliContributions(),
  ...createInstallationCliContributions(),
  ...createLauncherCliContributions(),
]);
export const COMMAND_CATALOG = createCommandCatalog(COMMAND_REGISTRY);

function commandCandidates(commandRegistry) {
  return commandRegistry.map((item) => item.key);
}

export function dispatch(argv = process.argv) {
  const runtime = createRuntime();
  const commandRegistry = createCommandRegistry(runtimeContributions(runtime, 'cli'));
  const commandCatalog = createCommandCatalog(commandRegistry);
  registerCommandHelp(runtime, commandCatalog);
  const rawArgs = argv.slice(2);
  const [domain, action, runtimeId, ...args] = rawArgs;
  const context = { argv, rawArgs, domain, action, runtimeId, args, runtime, commandRegistry, commandCatalog };
  const direct = commandRegistry.find((item) => !item.requiresAgent && item.match(context));
  if (direct) return direct.run(runtime, context);
  const agent = commandRegistry.find((item) => item.requiresAgent && item.match(context));
  if (agent && runtime.isSupportedAgent(runtimeId)) return agent.run(runtime, context);
  process.exit(printCliError(rawArgs, { candidates: commandCandidates(commandRegistry) }));
}
