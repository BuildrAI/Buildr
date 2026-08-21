import process from 'node:process';
import { createRuntime, runtimeContributions } from '../runtime.mjs';
import { registerCommandHelp } from './help.mjs';
import { isVersionRequest, printVersion } from './identity.ts';
import { printCliError } from './diagnostics.mjs';
import { createTaskRecordCliContributions, createTaskReviewCliContributions } from '../../task/module.mjs';
import { createWorkspaceCliContributions } from '../../workspace/module.mjs';
import { createInstallationCliContributions, createLauncherCliContributions } from '../../system/installation/module.mjs';
import { createAgentAssetsCliContributions } from '../../agent-assets/interfaces/cli/agent-assets.mjs';
import { gitWorktreeCommand } from '../../interfaces/cli/git-worktree.mjs';
import { taskTerminalDeliveryInspectCommand } from '../../interfaces/cli/task-terminal-delivery.mjs';
import { WEB_CLI_GROUPS } from '../../web/interfaces/cli/web.mjs';

const TASK_MODULE_COMMAND_SLOT = Symbol('task-module-command-contributions');
const WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT = Symbol('workspace-daily-progress-command-contributions');
const AGENT_ASSETS_PACKAGE_COMMAND_SLOT = Symbol('agent-assets-package-command-contributions');
const AGENT_ASSETS_RUNTIME_COMMAND_SLOT = Symbol('agent-assets-runtime-command-contributions');
const AGENT_ASSETS_SOURCE_COMMAND_SLOT = Symbol('agent-assets-source-command-contributions');

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
  {
    key: "worktree create",
    surface: "agent-machine",
    summary: "这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。",
    help: [
      "Usage: buildr worktree create <task-id> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]",
      "",
      "这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。",
      "全部仓库在写入前统一预检；部分创建失败保留已创建 checkout 和 evidence，供同一计划恢复。它不判断 Environment ready，也不准备 Runtime/CLI/依赖/projection。"
    ],
    match: ({ domain, action }) => domain === 'worktree' && action === 'create',
    run: (r, c) => gitWorktreeCommand(r, 'create', c.argv.slice(4)),
  },
  {
    key: "worktree cleanup",
    surface: "agent-machine",
    summary: "只根据 Git provider evidence 核对 checkout/branch/clean/registration 与 integrated ref，再 nested-first 删除 worktree、本地任务分支和 provider evidence。",
    help: [
      "Usage: buildr worktree cleanup <task-id> --integrated-ref <selector>=<ref> ... [--target <workspace>] [--json]",
      "",
      "只根据 Git provider evidence 核对 checkout/branch/clean/registration 与 integrated ref，再 nested-first 删除 worktree、本地任务分支和 provider evidence。",
      "它不读取 Environment Receipt、不停止动态资源、不决定总 cleanup，也不删除远端分支。正式 workflow 由 Task Environment Application 编排。"
    ],
    match: ({ domain, action }) => domain === 'worktree' && action === 'cleanup',
    run: (r, c) => gitWorktreeCommand(r, 'cleanup', c.argv.slice(4)),
  },
  {
    key: "worktree inspect",
    surface: "agent-machine",
    summary: "根据窄 provider evidence 检查全部成员仓库的 checkout、branch、HEAD、clean 与 registration；不输出 Environment ready 或 runtime/session 事实。",
    help: [
      "Usage: buildr worktree inspect <task-id> [--target <workspace>] [--json]",
      "",
      "根据窄 provider evidence 检查全部成员仓库的 checkout、branch、HEAD、clean 与 registration；不输出 Environment ready 或 runtime/session 事实。"
    ],
    match: ({ domain, action }) => domain === 'worktree' && action === 'inspect',
    run: (r, c) => gitWorktreeCommand(r, 'inspect', c.argv.slice(4)),
  },
  {
    key: "verification run",
    surface: "agent-machine",
    summary: "读取已登记 Project 的 verification.yml v2，只执行调用方显式选择的 command capabilities；正式 Task execution 会保留受控 execution record。",
    help: [
      "Usage: buildr verification run --project <code> --capability <id> ... --target-identity <identity> [--target <execution-root>] [--environment <task-id> --workspace <canonical-workspace>] [--authorize-capability <id> ...] [--authorize-resource <id> ...] [--concurrency <n>] [--retry] [--json]",
      "",
      "读取已登记 Project 的 verification.yml v2，只执行调用方显式选择的 command capabilities；applicability 选择与 bounded Agent operation 由 task-verification Skill 负责。",
      "--declaration-root 只属于 task verification record；verification run 与 task verification inspect 都不读取 declaration source。",
      "采用 Task Environment 时必须同时提供 Task ID 与 canonical Workspace；正式 execution 由 Receipt 固定的 retained controller 编排，capability 仍在候选 execution root 执行，候选 runtime 不获得 canonical writer authority。Environment Application 只交接 scope、执行根、source/projection identity，不读取或写入真实 Agent session 采用证明。",
      "effects.authorization: explicit 必须逐项 --authorize-capability；显式授权资源必须逐项 --authorize-resource。被实际 claim 的 coordinated 资源通过 Git common-dir lease 跨 Task 排队。该命令不创建任务、调度 Agent 或写 current Result。",
      "Task外execution只写provider-owned transient evidence。正式Task execution先申请execution record容量；相同Task/target/declaration/capability集合已有active或terminal record时，默认按active优先及openedAt/recordId降序选择latest并零执行返回原record/run identity。只有显式--retry创建同invocation的独立run/record；identity输入变化仍创建首次执行。完成后seal受控正文，再精确清理transient evidence；容量不足时不启动capability。--json 返回buildr.verification-execution/v1及portable executionRecord摘要。"
    ],
    match: ({ domain, action }) => domain === 'verification' && action === 'run',
    run: (r, c) => r.verificationRun(c.argv.slice(4)),
  },
  {
    key: "verification cleanup",
    surface: "agent-machine",
    summary: "只清理 buildr.verification-execution/v1 声明的 provider-owned transient run directory；非 transient、identity 不匹配、越界或不可证明的 evidence 一律保留。",
    help: [
      "Usage: buildr verification cleanup --summary <file> [--json]",
      "",
      "只清理 buildr.verification-execution/v1 声明的 provider-owned transient run directory；非 transient、identity 不匹配、越界或不可证明的 evidence 一律保留。"
    ],
    match: ({ domain, action }) => domain === 'verification' && action === 'cleanup',
    run: (r, c) => r.verificationCleanup(c.argv.slice(4)),
  },
  {
    key: "task delivery inspect",
    surface: "agent-machine",
    summary: "仅凭 Task ID 回读既有 Terminal Delivery 状态、Finish run ID、最终远端引用、清理事实与可用恢复动作。",
    help: [
      "Usage: buildr task delivery inspect <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "调用既有 Terminal Delivery Application，返回 buildr.task-terminal-delivery/v1；只读且不执行 resume、cleanup 或 Finish。",
      "task inspect 继续只查询 Task Record；task finish inspect --run 继续按 run identity 查询完整 Finish 明细。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'delivery' && runtimeId === 'inspect',
    run: (r, c) => taskTerminalDeliveryInspectCommand(r, c.argv.slice(5)),
  },
  TASK_MODULE_COMMAND_SLOT,
  {
    key: "task finish inspect",
    surface: "agent-machine",
    summary: "必需参数：--run。",
    help: [
      "Usage: buildr task finish inspect --run <id> [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]",
      "",
      "必需参数：--run。",
      "互斥参数：无。",
      "Execution surface：canonical Workspace 中的 durable finish run，只读。",
      "安全副作用：无；JSON默认返回closed compact投影，显式--detail full返回完整诊断Result；--detail self-bootstrap返回Product-owned稳定自举输入。",
      "新协议不接受 caller evidence、fingerprint、execution plan、repair authorization 或手写 recovery manifest；新客户端不读取、转换或处理旧协议状态。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'inspect',
    run: (r, c) => r.taskFinish('inspect', c.argv.slice(5)),
  },
  {
    key: "task finish reconcile",
    surface: "agent-machine",
    summary: "观察 current Task Contribution 与真实远端结果，收敛由 Agent、PR 或其他已授权路径完成的交付。",
    help: [
      "Usage: buildr task finish reconcile --task <task-id> [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]",
      "",
      "从 current Development handoff 与 Task Environment repository set解析交付身份，读取并fetch真实远端ref，逐仓库验证Task Contribution包含关系。",
      "不接受success、evidence、commit message、run token或手写proof；不会push、force push、改写共享历史或创建Delivery Carrier。",
      "全部适用repository交付成立后提交Task交付终态；activation、Environment cleanup与diagnostics作为独立maintenance事实交给Agent继续处理。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'reconcile',
    run: (r, c) => r.taskFinish('reconcile', c.argv.slice(5)),
  },
  {
    key: "task finish run",
    surface: "agent-machine",
    summary: "必需参数：首次运行需要 --task、--commit-message、current formal Development handoff 与 ready Task Environment；resume复用已冻结message。",
    help: [
      "Usage: buildr task finish run --task <task-id> --commit-message <message> [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]",
      "Resume: buildr task finish run --task <task-id> --run <id> --resume <token> [--accept-zero-delta-adaptation] [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]",
      "Bootstrap recovery: buildr task finish run --run <id> [--resume <token>] --bootstrap-recovery --target <canonical-workspace> [--detail <compact|full|self-bootstrap>] [--json]",
      "Occupancy release: buildr task finish run --task <task-id> --run <id> --release-occupancy --target <canonical-workspace> [--detail <compact|full|self-bootstrap>] [--json]",
      "",
      "必需参数：首次运行需要 --task、--commit-message、current formal Development handoff 与 ready Task Environment；Agent根据最终内容和仓库约定提供完整message，产品规范化并追加Buildr-Task trailer。target branch 默认使用 retained canonical Workspace 的当前符号分支，Environment startPoint 不提供交付分支 authority。",
      "可选 --agent：省略时使用 Task Environment 已绑定 adapter，不得猜测当前聊天宿主或默认为 Codex；传入值必须与 Environment adapter 一致。",
      "互斥参数：已有run/resume不接受--commit-message覆盖；--resume只接受产品为当前blocked run生成的令牌；--release-occupancy与--resume、--bootstrap-recovery、--accept-zero-delta-adaptation互斥，且必须同时提供--run与--task；不接受--project/--change或调用方Candidate/Result。",
      "零差异适配：--accept-zero-delta-adaptation只用于已有adaptation-required run的matching resume，表示Agent已审查clean baseline carrier无需新增差异；它不创建commit、不替代resume token，也不表示Buildr证明语义等价。",
      "受控自修复：--bootstrap-recovery只用于已有run在无交付副作用的preflight/prepare Product provider缺陷；必须另行明确授权。retained Application仍是writer，只从冻结clean Task Environment HEAD派生并加载run-owned provider capsule；不接受source/module/tarball/manifest输入。",
      "占用释放：--release-occupancy只用于Task已放弃且该run从未成功交付时，释放run-owned隔离载体占用；不是普通resume、不是作废已推送交付，也不把abandoned Task改成completed。",
      "Execution surface：Development handoff、Task Environment carrier 执行根、retained canonical Workspace 与产品解析的 delivery remote。",
      "安全副作用：产品顺序执行 handoff preflight、隔离 Delivery Carrier 的机械复用或 Delivery Adaptation、deliver 和 cleanup；不收敛 Change、不生成 Candidate、不运行 Verification/Review，也不修改 Development Receipt。",
      "提交信息：新run拒绝缺失、空subject或精确“交付 + 当前Task ID”的占位主题；同一run的prepare、adaptation与resume复用冻结message，公开Result只返回subject和identity。",
      "deliver使用Environment adapter冻结的run agent尝试retained Doctor；Doctor未ready时保留已完成remote readback并把Activation标记为attention，不撤销Delivery。",
      "每次真正执行的run/resume尝试打开独立finish-diagnostics Execution Record；open、seal、capacity或transient cleanup失败只形成Diagnostics attention，不阻止安全Delivery。",
      "JSON输出默认使用closed compact投影；完整phase checks、operations、diagnostics、carrier与completion事实必须显式使用--detail full；跨模块自举只消费--detail self-bootstrap稳定投影。",
      "新协议不接受 caller evidence、fingerprint、execution plan、repair authorization 或手写 recovery manifest；新客户端不读取、转换或处理旧协议状态。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'run',
    run: (r, c) => r.taskFinish('run', c.argv.slice(5)),
  },
  {
    key: "doctor",
    surface: "primary",
    summary: "诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。",
    help: [
      "Usage: buildr doctor [--agent <agent>] [--target <dir>] [--scope <.|projects/project[/services/service[/path...]]>] [--json] [--detail <compact|full>] [--include-info] [--verbose]",
      "",
      "诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。JSON 默认输出 compact；完整 inventory 使用 --detail full。"
    ],
    match: ({ domain }) => domain === 'doctor',
    run: (r, c) => r.doctor(c.argv.slice(3)),
  },
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
  {
    key: "openspec converge",
    surface: "maintenance",
    summary: "产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。",
    help: [
      "Usage: buildr openspec converge <change> --project <project> [--target <task-execution-root>] [--json]",
      "",
      "--target 使用matching Task Environment Receipt的execution.workdir，不是canonical Workspace；不会自动搜索或选择其他worktree。",
      "产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。"
    ],
    match: ({ domain, action }) => domain === 'openspec' && action === 'converge',
    run: (r, c) => r.openspecConverge(c.argv.slice(4)),
  },
  {
    key: "openspec convergence preflight",
    surface: "maintenance",
    summary: "只读检查Change能否按当前delta、canonical、active Changes与executable形成唯一且strict有效的收敛计划。",
    help: [
      "Usage: buildr openspec convergence preflight <change> --project <project> [--target <task-execution-root>] [--json]",
      "",
      "--target 使用matching Task Environment Receipt的execution.workdir，不是canonical Workspace；不会自动搜索或选择其他worktree。",
      "只读检查当前语义就绪性；不会写canonical、Receipt或archive。ready会在delta、canonical、active Changes或executable变化后失效，最终converge始终重新检查。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'openspec' && action === 'convergence' && runtimeId === 'preflight',
    run: (r, c) => r.openspecConvergencePreflight(c.argv.slice(5)),
  },
  {
    key: "openspec convergence inspect",
    surface: "maintenance",
    summary: "只读检查未终结收敛事务的 before/expected 与当前实际摘要；未开始或已归档时不适用。",
    help: [
      "Usage: buildr openspec convergence inspect <change> --project <project> [--target <dir>] [--json]",
      "",
      "只读检查当前事务 Receipt；不会写 canonical、Receipt 或 archive，也不用于归档后的长期审计。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'openspec' && action === 'convergence' && runtimeId === 'inspect',
    run: (r, c) => r.openspecConvergenceInspect(c.argv.slice(5)),
  },
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
    key: "task delivery",
    surface: "agent-machine",
    summary: "按 Task ID 只读回读 Terminal Delivery，不替代 Task Record 或按 run 的 Finish 明细查询。",
    help: [
      "Usage: buildr task delivery inspect <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "按 Task ID 只读回读 Terminal Delivery；使用 task finish inspect --run 查询完整 Finish run 明细。"
    ],
    executable: false,
  },
  {
    key: "task execution-record",
    surface: "maintenance",
    summary: "读取Task-scoped Execution Record，或执行Workspace级bounded GC。",
    help: [
      "Usage: buildr task execution-record <list|inspect|recover|gc> ...",
      "",
      "list/inspect用于只读回查；recover补seal原Verification record或在明确授权后保留unknown；gc执行bounded维护。不提供自动retry、timeout或执行资源cleanup。"
    ],
    executable: false,
  },
  {
    key: "task",
    surface: "primary",
    summary: "Task Manager管理Task Record；task next另提供只读Formal Task compact入口。",
    help: [
      "Usage: buildr task <next|create|inspect|update|complete|abandon> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Manager只管理canonical Workspace中的Task Record；task next是组合既有owner的只读compact projection。",
      "它不创建或记录 Task Environment，不执行 Development、Review、Verification、Git、Finish、Board、cleanup 或 publication，也不接受完整 next-state 文档。",
      "Agent 和 Buildr Web 都调用同一个 Task Record Application；不要直接操作 Workspace SQLite，也不要把旧 task.yml 当作 Task authority。"
    ],
    executable: false,
  },
  {
    key: "task review",
    surface: "agent-machine",
    summary: "Task Review CLI 只管理已经完整形成的 Planning/Completion Result；两个槽位均可选，它不执行 Review、生成 plan/Candidate identity 或设置 Development gate。",
    help: [
      "Usage: buildr task review <inspect|record> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Review CLI 只管理已经完整形成的 Planning/Completion Result；两个槽位均可选，它不执行 Review、生成 plan/Candidate identity 或设置 Development gate。",
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
      "",
      "Task Environment 独占 ready、恢复、执行投影、动态资源与 cleanup 事实。Task Record 不保存环境字段。",
      "Agent登记Plan；prepare幂等执行与恢复；inspect只读复核；cleanup只接受可重新验证的Delivery evidence或已持久化的abandon终态。"
    ],
    executable: false,
  },
  {
    key: "task finish",
    surface: "agent-machine",
    summary: "run 提供可选自动交付；reconcile 收敛 Agent 或外部路径已形成的远端事实；inspect 只读查看 durable result。",
    help: [
      "Usage: buildr task finish <run|reconcile|inspect> ...",
      "",
      "run 消费 current formal Development handoff 并自动执行交付；reconcile独立观察远端交付结果；inspect只读查看durable result。",
      "该聚合入口不创建 Candidate、不执行 formal Verification/Review，也不收敛 OpenSpec Change。"
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
    && !route.key.startsWith('project daily-progress ')
  ));
  const routes = COMMAND_ROUTES.flatMap((route) => {
    if (route === AGENT_ASSETS_PACKAGE_COMMAND_SLOT) return agentAssetsPackageContributions;
    if (route === AGENT_ASSETS_RUNTIME_COMMAND_SLOT) return agentAssetsRuntimeContributions;
    if (route === AGENT_ASSETS_SOURCE_COMMAND_SLOT) return agentAssetsSourceContributions;
    if (route === WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT) return workspaceDailyProgressContributions;
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
  ...createTaskRecordCliContributions(),
  ...createTaskReviewCliContributions(),
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
