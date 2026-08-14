import process from 'node:process';
import { createRuntime } from '../../application/compose-runtime.mjs';
import { registerCommandHelp } from './help.mjs';
import { isVersionRequest, printVersion } from './identity.mjs';
import { printCliError } from './diagnostics.mjs';
import { registerLocalWorkspaceAppInterface } from '../local-app/http/server.mjs';
import { registerLauncherInterface } from './launcher.mjs';
import { taskRecordCommand } from './task-record.mjs';
import { taskReviewCommand } from './task-review.mjs';
import { taskVerificationCommand } from './task-verification.mjs';
import { taskEnvironmentCommand, taskEnvironmentPlanCommand } from './task-environment.mjs';
import { gitWorktreeCommand } from './git-worktree.mjs';
import { parentCoordinationCommand } from './parent-coordination.mjs';
import { taskExecutionRecordGcCommand, taskExecutionRecordInspectCommand, taskExecutionRecordListCommand } from './task-execution-record.mjs';

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
    key: "web launcher install",
    surface: "primary",
    summary: "从当前已验证的 npm installation 显式生成不复制 Node 或 package 的 Buildr Web Launcher。",
    help: [
      "Usage: buildr web launcher install [--target <path>] [--json]",
      "",
      "macOS 生成本机 Buildr Web.app，Windows 生成 Start Menu shortcut；两者只绑定已登记的 Host Node、package entry、npm prefix 与 installation identity。",
      "普通 npm install 不会创建图形入口；已有同 ownership Launcher 才会在 npm 更新后刷新 binding。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'launcher' && runtimeId === 'install',
    run: (r, c) => r.manageLocalAppLauncher('install', c.argv.slice(5)),
  },
  {
    key: "web launcher status",
    surface: "primary",
    summary: "只读验证 npm Buildr Web Launcher 的 binding、Host Node、package entry、prefix 与 ownership。",
    help: [
      "Usage: buildr web launcher status [--target <path>] [--json]",
      "",
      "任何路径或摘要漂移都会 fail closed；不会从 PATH 查找替代 Buildr。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'launcher' && runtimeId === 'status',
    run: (r, c) => r.manageLocalAppLauncher('status', c.argv.slice(5)),
  },
  {
    key: "web launcher repair",
    surface: "primary",
    summary: "从同一已登记 npm installation 原子重建当前 owned Launcher binding。",
    help: [
      "Usage: buildr web launcher repair [--target <path>] [--json]",
      "",
      "repair 只接受同一 installation slot 拥有的现有 Launcher；不会接管 foreign target 或改绑到 PATH 中的其他 Buildr。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'launcher' && runtimeId === 'repair',
    run: (r, c) => r.manageLocalAppLauncher('repair', c.argv.slice(5)),
  },
  {
    key: "web launcher uninstall",
    surface: "primary",
    summary: "只移除 ownership 精确匹配的 npm Buildr Web Launcher，保留 npm package 与 Workspace 数据。",
    help: [
      "Usage: buildr web launcher uninstall [--target <path>] [--json]",
      "",
      "foreign target 或 binding 会被保留并 fail closed；本命令不卸载 npm Buildr、Workspace Registry、SQLite、日志或 Workspace data。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'launcher' && runtimeId === 'uninstall',
    run: (r, c) => r.manageLocalAppLauncher('uninstall', c.argv.slice(5)),
  },
  {
    key: "web preview start",
    surface: "maintenance",
    summary: "提供 --task 时，从该 Task Environment 的任务验证工作区启动，并在健康后登记为 Environment 动态资源；登记失败会认证停止刚创建的实例。",
    help: [
      "Usage: buildr web preview start <instance> [--task <task-id> --target <canonical-workspace>] [--port <port>] [--no-open] [--json]",
      "",
      "提供 --task 时，从该 Task Environment 的任务验证工作区启动，并在健康后登记为 Environment 动态资源；登记失败会认证停止刚创建的实例。",
      "不提供 --task 时保留独立 checkout 预览。实例名不能接管其他健康预览，也不会替换默认 Buildr Web Runtime。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'start',
    run: (r, c) => r.manageLocalAppPreview('start', c.argv.slice(5)),
  },
  {
    key: "web preview list",
    surface: "maintenance",
    summary: "列出 Buildr 管理的开发预览及其 owner、URL、PID 与健康状态；不会扫描或管理其他系统进程。",
    help: [
      "Usage: buildr web preview list [--json]",
      "",
      "列出 Buildr 管理的开发预览及其 owner、URL、PID 与健康状态；不会扫描或管理其他系统进程。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'list',
    run: (r, c) => r.manageLocalAppPreview('list', c.argv.slice(5)),
  },
  {
    key: "web preview stop",
    surface: "maintenance",
    summary: "Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Environment resource、preview metadata 和进程 secret 完全匹配；停止后释放同一资源。独立 preview 保持实例级停止。",
    help: [
      "Usage: buildr web preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--json]",
      "",
      "Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Environment resource、preview metadata 和进程 secret 完全匹配；停止后释放同一资源。独立 preview 保持实例级停止。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'stop',
    run: (r, c) => r.manageLocalAppPreview('stop', c.argv.slice(5)),
  },
  {
    key: "web",
    surface: "primary",
    summary: "启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。",
    help: [
      "Usage: buildr web [--target <workspace>] [--port <port>] [--no-open]",
      "",
      "启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。",
      "--target 验证并登记指定 Workspace，然后打开该 Workspace；不提供时显示本机已登记 Workspace。",
      "关闭浏览器不会退出服务；通过页面“退出 Buildr”或终止进程停止服务。",
      "Workspace 页面帮助理解 Workspace → Project → Service 工作范围，只允许修改 name 和 description；创建、迁移和修复只生成可复制 Agent 指令。",
      "Project 与 Service 页面保持独立目录、详情和编辑；页面可生成范围明确的开始工作指令，但不会启动或管理 Agent 会话。",
      "页面不会 checkout、stash、merge 或改写 Project Git source。",
      "旧 Workspace metadata 可以只读查看，完成 canonical sync 迁移后才能从页面保存。",
      "本机登记列表只保存 Workspace root；事实仍来自各 Workspace，应用不提供远程服务或 Agent session connector。",
      "任务验证工作区的并行验收可使用 web preview；每个 preview 具有独立状态和 loopback URL，不会改变默认 Buildr Web 或 Buildr Web Dev.app。"
    ],
    match: ({ domain }) => domain === 'web',
    run: (r, c) => r.startLocalWorkspaceApp(c.argv.slice(3)),
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
  {
    key: "package check",
    surface: "maintenance",
    summary: "供 Buildr 产品维护者检查产品包发布边界和基础行为；不是 workspace onboarding 必需步骤。",
    help: [
      "Usage: buildr package check",
      "",
      "供 Buildr 产品维护者检查产品包发布边界和基础行为；不是 workspace onboarding 必需步骤。"
    ],
    match: ({ domain, action }) => domain === 'package' && action === 'check',
    run: (r) => r.packageCheck(),
  },
  {
    key: "package build",
    surface: "maintenance",
    summary: "供 Buildr 产品维护者构建产品包文件；不是 workspace onboarding 必需步骤。",
    help: [
      "Usage: buildr package build [--out <dir>]",
      "",
      "供 Buildr 产品维护者构建产品包文件；不是 workspace onboarding 必需步骤。"
    ],
    match: ({ domain, action }) => domain === 'package' && action === 'build',
    run: (r, c) => r.packageBuild(c.argv.slice(4)),
  },
  {
    key: "project create",
    surface: "primary",
    summary: "创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。",
    help: [
      "Usage: buildr project create <code> [--target <dir>] [--name <text>] [--description <text>] [--repo <git-url>] [--remote <name>] [--integration-branch <branch>]",
      "",
      "创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。",
      "不传 --repo 时 Project 跟随 root Workspace Git；传入 --repo 时 remote 与 integration branch 是稳定声明，不是当前 checkout 状态。",
      "--title 继续作为 --name 的 legacy compatibility 输入，但 canonical help 和输出统一使用 --name。",
      "Project baseline 包含 commands.yml；它只引用 workspace Command catalog，不复制 executable、probe 或 install hint。"
    ],
    match: ({ domain, action }) => domain === 'project' && action === 'create',
    run: (r, c) => r.createProject(c.argv.slice(4)),
  },
  {
    key: "service create",
    surface: "primary",
    summary: "创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。",
    help: [
      "Usage: buildr service create <project>/<service> <repo-ref> [--target <dir>] [--name <text>] [--description <text>] [--type <type>] [--remote <name>] [--integration-branch <branch>] [--json]",
      "",
      "创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。",
      "Git remote 与 integration branch 是稳定声明；current branch、HEAD、dirty 和 upstream 状态只实时观察。",
      "--title 和 --branch 继续作为 --name、--integration-branch 的 legacy compatibility 输入。",
      "Service 规则入口是 Service 目录中的 AGENTS.md，不在 Service registry 中记录规则路径。"
    ],
    match: ({ domain, action }) => domain === 'service' && action === 'create',
    run: (r, c) => r.createService(c.argv.slice(4)),
  },
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
    key: "task execution-record list",
    surface: "agent-machine",
    summary: "按 Task 返回紧凑、可移植的 Execution Record 列表。",
    help: ["Usage: buildr task execution-record list --task <task-id> [--view <all|verification|finish>] [--target <canonical-workspace>] [--json]", "", "原终端不可用时按Task恢复同一次execution identity；只读取Execution Record，不写Verification Result或Finish current。"],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'list',
    run: (r, c) => taskExecutionRecordListCommand(r, c.argv.slice(5)),
  },
  {
    key: "task execution-record inspect",
    surface: "agent-machine",
    summary: "按 Task 与 record identity 回读状态、耗时、失败和证据摘要。",
    help: ["Usage: buildr task execution-record inspect --task <task-id> --record <record-id> [--target <canonical-workspace>] [--json]", "", "回读同一record的lifecycle、timing、failure与evidence摘要；只读且不写Verification Result或Finish current。"],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'inspect',
    run: (r, c) => taskExecutionRecordInspectCommand(r, c.argv.slice(5)),
  },
  {
    key: "task execution-record gc",
    surface: "maintenance",
    summary: "按固定 retention、resolution 与 recent-count 规则执行 bounded Workspace ExecRecord GC；支持 dry-run，不扫描文件系统或清理执行资源。",
    help: [
      "Usage: buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]",
      "",
      "按固定 retention、resolution 与 recent-count 规则选择 eligible records，复用单记录 cleanup，并删除到期 cleaned tombstone。",
      "不接受 Task/owner/path、force、retention override 或 failure disposition；不调用 Workspace Doctor。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'gc',
    run: (r, c) => taskExecutionRecordGcCommand(r, c.argv.slice(5)),
  },
  {
    key: "task parent inspect",
    surface: "primary",
    summary: "只读返回Parent Plan、Child Contribution交付事实与最终验收前置条件；历史Task保持legacy模式。",
    help: ["Usage: buildr task parent inspect <task-id> [--target <canonical-workspace>] [--json]", "", "只组合Task Record与已保存专业事实，不扫描文件系统或回填Parent。"],
    match: ({ domain, action, runtimeId, operation }) => domain === 'task' && action === 'parent' && runtimeId === 'inspect' && !operation,
    run: (r, c) => parentCoordinationCommand(r, 'inspect', c.argv.slice(5)),
  },
  {
    key: "task parent record",
    surface: "agent-machine",
    summary: "为active Parent首次记录closed Parent Plan。",
    help: ["Usage: buildr task parent record <task-id> --input <parent-plan.json> [--target <canonical-workspace>] [--json]"],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'parent' && runtimeId === 'record',
    run: (r, c) => parentCoordinationCommand(r, 'record', c.argv.slice(5)),
  },
  {
    key: "task parent reconcile",
    surface: "agent-machine",
    summary: "以expected Parent Plan identity显式收敛Contribution、依赖或最终验收变化。",
    help: ["Usage: buildr task parent reconcile <task-id> --expected-plan <identity> --input <parent-plan.json> --reason <text> [--target <canonical-workspace>] [--json]"],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'parent' && runtimeId === 'reconcile',
    run: (r, c) => parentCoordinationCommand(r, 'reconcile', c.argv.slice(5)),
  },
  {
    key: "task parent bind-child",
    surface: "agent-machine",
    summary: "把已有Child Development明确绑定到Parent Plan的一个或多个Contribution。",
    help: ["Usage: buildr task parent bind-child <child-task-id> --parent <parent-task-id> --contribution <id> ... [--target <canonical-workspace>] [--json]"],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'parent' && runtimeId === 'bind-child',
    run: (r, c) => parentCoordinationCommand(r, 'bind', c.argv.slice(5)),
  },
  {
    key: "task parent accept",
    surface: "agent-machine",
    summary: "在全部Contribution得到可证明处置后显式记录Parent最终集成验收；不会自动完成Task。",
    help: ["Usage: buildr task parent accept <task-id> --expected-plan <identity> --summary <text> [--target <canonical-workspace>] [--json]"],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'parent' && runtimeId === 'accept',
    run: (r, c) => parentCoordinationCommand(r, 'accept', c.argv.slice(5)),
  },
  {
    key: "task create",
    surface: "primary",
    summary: "创建 active 正式 Task，或以 --status todo 只保存待办意向；复盘来源可重复。",
    help: [
      "Usage: buildr task create <task-id> --title <text> --intent <text> [--status <todo|active>] [--retrospective-source <task-id> ...] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]",
      "",
      "省略 --status 时创建 active；--status todo 只写 SQLite，拒绝 Change，不创建 Environment、Git 或专业记录。",
      "--retrospective-source 只接受已有 current 复盘的 completed/abandoned Task，可重复且仅保存 source Task ID。",
      "--parent 只接受当前 Workspace 中已存在且 active 的 Task；副作用是在本地 structured store 中原子创建 Task 及其直接 Parent 关系。",
      "不创建 Environment、Change、branch、commit 或专业记录，也不自动改变 Parent/Child 的状态。"
    ],
    match: ({ domain, action }) => domain === 'task' && action === 'create',
    run: (r, c) => taskRecordCommand(r, 'create', c.argv.slice(4)),
  },
  {
    key: "task inspect",
    surface: "primary",
    summary: "只读返回 Task Record、直接 Parent/Children 摘要和响应级 recordDigest，不递归展开整棵树，不暴露数据库路径；数据库尚未初始化时保持零写入。",
    help: [
      "Usage: buildr task inspect <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "只读返回 Task Record、直接 Parent/Children 摘要和响应级 recordDigest，不递归展开整棵树，不暴露数据库路径；数据库尚未初始化时保持零写入。"
    ],
    match: ({ domain, action }) => domain === 'task' && action === 'inspect',
    run: (r, c) => taskRecordCommand(r, 'inspect', c.argv.slice(4)),
  },
  {
    key: "task update",
    surface: "primary",
    summary: "至少提供一个明确 setter/add/remove；只允许修改 todo 或 active Task。",
    help: [
      "Usage: buildr task update <task-id> [--title <text>] [--intent <text>] [--parent <task-id> | --clear-parent] [--add-retrospective-source <task-id> ...] [--remove-retrospective-source <task-id> ...] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]",
      "",
      "至少提供一个明确 setter/add/remove；同一引用不能同时 add/remove。只允许修改 todo 或 active Task，todo 拒绝 Change。",
      "--parent 与 --clear-parent 互斥；拒绝不存在或 terminal Parent、自引用和任何祖先循环。Child 列表是只读派生结果。",
      "不接受 --input、patch、完整 next-state、expected revision 或专业模块字段。"
    ],
    match: ({ domain, action }) => domain === 'task' && action === 'update',
    run: (r, c) => taskRecordCommand(r, 'update', c.argv.slice(4)),
  },
  {
    key: "task activate",
    surface: "primary",
    summary: "把 todo Task 单向激活为 active；该动作自身不执行 Git、Environment 或研发阶段。",
    help: [
      "Usage: buildr task activate <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "只执行 todo -> active。Agent 必须在调用前通过 Task Triage 完成当前事实确认与 Git 基线门禁。"
    ],
    match: ({ domain, action }) => domain === 'task' && action === 'activate',
    run: (r, c) => taskRecordCommand(r, 'activate', c.argv.slice(4)),
  },
  {
    key: "task complete",
    surface: "primary",
    summary: "完成 todo/active Task；todo 只允许 --no-change。",
    help: [
      "Usage: buildr task complete <task-id> --summary <text> [--no-change] [--target <canonical-workspace>] [--json]",
      "",
      "active 可正常完成；todo 只允许 --no-change，否则必须先 activate。",
      "该动作只更新顶层 Task Record，不执行 Finish、Verification、Git、publication 或 cleanup。"
    ],
    match: ({ domain, action }) => domain === 'task' && action === 'complete',
    run: (r, c) => taskRecordCommand(r, 'complete', c.argv.slice(4)),
  },
  {
    key: "task abandon",
    surface: "primary",
    summary: "把 todo 或 active Task 单向标记为 abandoned；终态不可重开或继续修改。",
    help: [
      "Usage: buildr task abandon <task-id> --reason <text> [--target <canonical-workspace>] [--json]",
      "",
      "把 todo 或 active Task 单向标记为 abandoned；终态不可重开或继续修改。",
      "该动作只更新顶层 Task Record，不执行 Environment cleanup、Git 或其他专业动作。"
    ],
    match: ({ domain, action }) => domain === 'task' && action === 'abandon',
    run: (r, c) => taskRecordCommand(r, 'abandon', c.argv.slice(4)),
  },
  {
    key: "task review inspect",
    surface: "agent-machine",
    summary: "只读返回 Planning/Completion 两个可选槽位、response-only resultDigest 与派生 applicability；未提供 current target 时已有 Result 显示 unknown。",
    help: [
      "Usage: buildr task review inspect <task-id> [--planning-target <identity>] [--completion-target <identity>] [--target <canonical-workspace>] [--json]",
      "",
      "只读返回 Planning/Completion 两个可选槽位、response-only resultDigest 与派生 applicability；未提供 current target 时已有 Result 显示 unknown。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'inspect',
    run: (r, c) => taskReviewCommand(r, 'inspect', c.argv.slice(5)),
  },
  {
    key: "task review record",
    surface: "agent-machine",
    summary: "只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。",
    help: [
      "Usage: buildr task review record <task-id> --type <planning|completion> --target-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <ready|changes-required> --summary <text> [--target <canonical-workspace>] [--json]",
      "",
      "只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。",
      "中断、缺少 target identity、覆盖或结论不完整时不写入；Completion identity 必须由真实 Candidate producer 提供。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'record',
    run: (r, c) => taskReviewCommand(r, 'record', c.argv.slice(5)),
  },
  {
    key: "task verification inspect",
    surface: "agent-machine",
    summary: "只读返回单一 current slot、response-only resultDigest 与 target/declaration 派生 applicability；未提供 current target 时 target 轴为 unknown。",
    help: [
      "Usage: buildr task verification inspect <task-id> [--target-identity <identity>] [--target <canonical-workspace>] [--json]",
      "",
      "只读返回单一 current slot、response-only resultDigest 与 target/declaration 派生 applicability；未提供 current target 时 target 轴为 unknown。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'verification' && runtimeId === 'inspect',
    run: (r, c) => taskVerificationCommand(r, 'inspect', c.argv.slice(5)),
  },
  {
    key: "task verification record",
    surface: "agent-machine",
    summary: "只接收完整 current facts 并原子整值替换 current；declaration identities 由 Application 从 Task scope 与 Project registry 读取，调用方不能提交。",
    help: [
      "Usage: buildr task verification record <task-id> --target-identity <identity> --target-summary <text> [--capability <project>/<capability>::<passed|failed>::<fact> ...] [--coverage-gap <scope>::<summary> ...] --outcome <passed|not-passed> --summary <text> [--declaration-root <task-environment-root>] [--target <canonical-workspace>] [--json]",
      "",
      "只接收完整 current facts 并原子整值替换 current；declaration identities 由 Application 从 Task scope 与 Project registry 读取，调用方不能提交。",
      "完整 stdout/stderr、耗时、临时路径、Environment Receipt、applicability、revision、proceed/blocked 或 Task status 不属于 Result。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'verification' && runtimeId === 'record',
    run: (r, c) => taskVerificationCommand(r, 'record', c.argv.slice(5)),
  },
  {
    key: "task environment prepare",
    surface: "agent-machine",
    summary: "按Project Preparation Declaration与Agent选择的Task Plan幂等准备Project/Service执行环境。",
    help: [
      "Usage: buildr task environment prepare <task-id> [--plan <json-file>] [--agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy>] [--branch <branch>] [--start-point <ref>] [--shared] [--target <canonical-workspace>] [--json]",
      "",
      "Plan Request必须恰好覆盖Task Record中的全部Project/Service scope，可引用Project preparation.yml的Recipe或显式task-inline Recipe。",
      "默认使用Git worktree；inspect严格只读，不执行Step或回写current。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'prepare',
    run: (r, c) => taskEnvironmentCommand(r, 'prepare', c.argv.slice(5)),
  },
  {
    key: "task environment plan record",
    surface: "agent-machine",
    summary: "解析Project Preparation Declaration并原子保存当前Task的Plan执行快照，不执行任何准备Step。",
    help: [
      "Usage: buildr task environment plan record <task-id> --input <json-file> [--target <canonical-workspace>] [--json]",
      "",
      "输入必须是closed buildr.task-environment-plan-request/v1；新current保存resolved buildr.task-environment-plan/v2。"
    ],
    match: ({ domain, action, runtimeId, args }) => domain === 'task' && action === 'environment' && runtimeId === 'plan' && args[0] === 'record',
    run: (r, c) => taskEnvironmentPlanCommand(r, 'record', c.args.slice(1)),
  },
  {
    key: "task environment plan inspect",
    surface: "agent-machine",
    summary: "只读返回Environment current中保存的Preparation Plan，不探测或修复环境。",
    help: [
      "Usage: buildr task environment plan inspect <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "只读取Workspace SQLite current；缺少Plan时返回unavailable。"
    ],
    match: ({ domain, action, runtimeId, args }) => domain === 'task' && action === 'environment' && runtimeId === 'plan' && args[0] === 'inspect',
    run: (r, c) => taskEnvironmentPlanCommand(r, 'inspect', c.args.slice(1)),
  },
  {
    key: "task environment inspect",
    surface: "agent-machine",
    summary: "只读返回当前机器的 Environment Receipt availability、observedAt、scope/root、执行基础、provider、资源和 cleanup 摘要。",
    help: [
      "Usage: buildr task environment inspect <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "只读返回当前机器的 Environment Receipt availability、observedAt、scope/root、执行基础、provider、资源和 cleanup 摘要。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'inspect',
    run: (r, c) => taskEnvironmentCommand(r, 'inspect', c.argv.slice(5)),
  },
  {
    key: "task environment cleanup",
    surface: "agent-machine",
    summary: "按 provider 依赖先停止 Task-owned 资源，再清理可证明属于该 Task 的 Git checkout；成功后保留最小处置摘要。",
    help: [
      "Usage: buildr task environment cleanup <task-id> [--target <canonical-workspace>] [--json]",
      "",
      "按 provider 依赖先停止 Task-owned 资源，再清理可证明属于该 Task 的 Git checkout；成功后保留最小处置摘要。",
      "公共 CLI 只允许已持久化的 abandoned Task；正常完成由 Task Finish 内部提交交付 identity。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'cleanup',
    run: (r, c) => taskEnvironmentCommand(r, 'cleanup', c.argv.slice(5)),
  },
  {
    key: "task finish inspect",
    surface: "agent-machine",
    summary: "必需参数：--run。",
    help: [
      "Usage: buildr task finish inspect --run <id> [--target <canonical-workspace>] [--detail <compact|full>] [--json]",
      "",
      "必需参数：--run。",
      "互斥参数：无。",
      "Execution surface：canonical Workspace 中的 durable finish run，只读。",
      "安全副作用：无；JSON默认返回closed compact投影，显式--detail full返回完整诊断Result；两者均保留恢复所需identity、primaryFailure与resume token。",
      "新协议不接受 caller evidence、fingerprint、execution plan、repair authorization 或手写 recovery manifest；新客户端不读取、转换或处理旧协议状态。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'inspect',
    run: (r, c) => r.taskFinish('inspect', c.argv.slice(5)),
  },
  {
    key: "task finish run",
    surface: "agent-machine",
    summary: "必需参数：首次运行需要 --task、--commit-message、current formal Development handoff 与 ready Task Environment；resume复用已冻结message。",
    help: [
      "Usage: buildr task finish run --task <task-id> --commit-message <message> [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--target <canonical-workspace>] [--detail <compact|full>] [--json]",
      "Resume: buildr task finish run --task <task-id> --run <id> --resume <token> [--accept-zero-delta-adaptation] [--target <canonical-workspace>] [--detail <compact|full>] [--json]",
      "Bootstrap recovery: buildr task finish run --run <id> [--resume <token>] --bootstrap-recovery --target <canonical-workspace> [--detail <compact|full>] [--json]",
      "",
      "必需参数：首次运行需要 --task、--commit-message、current formal Development handoff 与 ready Task Environment；Agent根据最终内容和仓库约定提供完整message，产品规范化并追加Buildr-Task trailer。target branch 默认使用 retained canonical Workspace 的当前符号分支，Environment startPoint 不提供交付分支 authority。",
      "互斥参数：已有run/resume不接受--commit-message覆盖；--resume只接受产品为当前blocked run生成的令牌；不接受--project/--change或调用方Candidate/Result。",
      "零差异适配：--accept-zero-delta-adaptation只用于已有adaptation-required run的matching resume，表示Agent已审查clean baseline carrier无需新增差异；它不创建commit、不替代resume token，也不表示Buildr证明语义等价。",
      "受控自修复：--bootstrap-recovery只用于已有run在无交付副作用的preflight/prepare Product provider缺陷；必须另行明确授权。retained Application仍是writer，只从冻结clean Task Environment HEAD派生并加载run-owned provider capsule；不接受source/module/tarball/manifest输入。",
      "Execution surface：Development handoff、Task Environment carrier 执行根、retained canonical Workspace 与产品解析的 delivery remote。",
      "安全副作用：产品顺序执行 handoff preflight、隔离 Delivery Carrier 的机械复用或 Delivery Adaptation、deliver 和 cleanup；不收敛 Change、不生成 Candidate、不运行 Verification/Review，也不修改 Development Receipt。",
      "提交信息：新run拒绝缺失、空subject或精确“交付 + 当前Task ID”的占位主题；同一run的prepare、adaptation与resume复用冻结message，公开Result只返回subject和identity。",
      "deliver使用首次run绑定的指定Agent Doctor；Doctor未ready时保留已完成的remote readback、partial delivery与精确resume token，普通Workspace保持blocked并且不cleanup。",
      "每次真正执行的run/resume先预留独立finish-diagnostics execution record容量；retained后只清理invocation diagnostics transient。record attention不改变已成立的Finish delivery、cleanup或Task终态，Carrier与恢复资源继续由Finish owner管理。",
      "JSON输出默认使用closed compact投影；完整phase checks、operations、diagnostics、carrier与completion事实必须显式使用--detail full。",
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
  {
    key: "runtime list",
    surface: "primary",
    summary: "列出 Buildr 支持的 Agent runtime adapter；不要求当前目录是 Buildr workspace。",
    help: [
      "Usage: buildr runtime list [--json]",
      "",
      "列出 Buildr 支持的 Agent runtime adapter；不要求当前目录是 Buildr workspace。"
    ],
    match: ({ domain, action }) => domain === 'runtime' && action === 'list',
    run: (r, c) => r.runtimeList(c.argv.slice(4)),
  },
  {
    key: "commands check",
    surface: "primary",
    summary: "不传 --project 时只检查 workspace defaults；重复 --project 可表达跨 Project task context。",
    help: [
      "Usage: buildr commands check [--project <project> ...] [--target <dir>] [--json]",
      "",
      "不传 --project 时只检查 workspace defaults；重复 --project 可表达跨 Project task context。",
      "Project requirements 维护在 projects/<project>/commands.yml，只允许 id、required、version 和 purpose 引用字段。",
      "输出分离 catalog、requirements、effectiveConstraints、observations 和 findings；Buildr 不 render 或安装 Commands。"
    ],
    match: ({ domain, action }) => domain === 'commands' && action === 'check',
    run: (r, c) => r.commandsCheck(c.argv.slice(4)),
  },
  {
    key: "commands add",
    surface: "primary",
    summary: "新增或替换 workspace Command catalog definition；不会修改 Project requirements 或安装 binary。",
    help: [
      "Usage: buildr commands add <id> --purpose <text> [--target <dir>] [--collection <path>] [--executable <name>] [--name <text>] [--description <text>] [--version-constraint <constraint>] [--version-args <args>] [--install-hint <text>] [--replace]",
      "",
      "新增或替换 workspace Command catalog definition；不会修改 Project requirements 或安装 binary。"
    ],
    match: ({ domain, action }) => domain === 'commands' && action === 'add',
    run: (r, c) => r.commandsAdd(c.argv.slice(4)),
  },
  {
    key: "commands remove",
    surface: "primary",
    summary: "删除 workspace Command catalog definition；最后一个 definition 仍被 workspace default 或 Project requirement 引用时整次零写入。",
    help: [
      "Usage: buildr commands remove <id> [--target <dir>] [--collection <path>]",
      "",
      "删除 workspace Command catalog definition；最后一个 definition 仍被 workspace default 或 Project requirement 引用时整次零写入。"
    ],
    match: ({ domain, action }) => domain === 'commands' && action === 'remove',
    run: (r, c) => r.commandsRemove(c.argv.slice(4)),
  },
  {
    key: "openspec converge",
    surface: "maintenance",
    summary: "产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。",
    help: [
      "Usage: buildr openspec converge <change> --project <project> [--target <dir>] [--json]",
      "",
      "产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。"
    ],
    match: ({ domain, action }) => domain === 'openspec' && action === 'converge',
    run: (r, c) => r.openspecConverge(c.argv.slice(4)),
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
  {
    key: "component list",
    surface: "primary",
    summary: "列出 workspace Components。当前不支持 Project 或 Service scope。",
    help: [
      "Usage: buildr component list [--target <dir>] [--json]",
      "",
      "列出 workspace Components。当前不支持 Project 或 Service scope。"
    ],
    match: ({ domain, action }) => domain === 'component' && action === 'list',
    run: (r, c) => r.componentListOrCheck(c.argv.slice(4), false),
  },
  {
    key: "component check",
    surface: "primary",
    summary: "检查 Component definition、成员 integrity 和唯一所有权。",
    help: [
      "Usage: buildr component check [<id>] [--target <dir>] [--json]",
      "",
      "检查 Component definition、成员 integrity 和唯一所有权。"
    ],
    match: ({ domain, action }) => domain === 'component' && action === 'check',
    run: (r, c) => r.componentListOrCheck(c.argv.slice(4), true),
  },
  {
    key: "component install",
    surface: "primary",
    summary: "安装 workspace Component，reconcile 指定 Agent runtime，并运行 doctor。",
    help: [
      "Usage: buildr component install <id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--target <dir>]",
      "",
      "安装 workspace Component，reconcile 指定 Agent runtime，并运行 doctor。"
    ],
    match: ({ domain, action }) => domain === 'component' && action === 'install',
    run: (r, c) => r.componentInstall(c.argv.slice(4)),
  },
  {
    key: "component uninstall",
    surface: "primary",
    summary: "卸载 workspace Component 及其受管源资产；不会卸载外部 CLI，也不会删除 Project 内容。",
    help: [
      "Usage: buildr component uninstall <id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--target <dir>] [--reason <text>]",
      "",
      "卸载 workspace Component 及其受管源资产；不会卸载外部 CLI，也不会删除 Project 内容。"
    ],
    match: ({ domain, action }) => domain === 'component' && action === 'uninstall',
    run: (r, c) => r.componentUninstall(c.argv.slice(4)),
  },
  {
    key: "rules add",
    surface: "primary",
    summary: "注册已存在的 root Rule 文件到 rules/manifest.yml。未传 --path 时默认使用 rules/<id>.md。",
    help: [
      "Usage: buildr rules add <id> [--path <rules/file.md>] --description <text> [--target <dir>] [--replace]",
      "",
      "注册已存在的 root Rule 文件到 rules/manifest.yml。未传 --path 时默认使用 rules/<id>.md。"
    ],
    match: ({ domain, action }) => domain === 'rules' && action === 'add',
    run: (r, c) => r.rulesAdd(c.argv.slice(4)),
  },
  {
    key: "rules remove",
    surface: "primary",
    summary: "删除 root Rule 登记和规则文件。传入 --keep-file 时只取消注册并保留文件。",
    help: [
      "Usage: buildr rules remove <id> [--target <dir>] [--keep-file]",
      "",
      "删除 root Rule 登记和规则文件。传入 --keep-file 时只取消注册并保留文件。"
    ],
    match: ({ domain, action }) => domain === 'rules' && action === 'remove',
    run: (r, c) => r.rulesRemove(c.argv.slice(4)),
  },
  {
    key: "builtin list",
    surface: "primary",
    summary: "列出 Buildr 内置能力状态。",
    help: [
      "Usage: buildr builtin list [--target <dir>] [--json]",
      "",
      "列出 Buildr 内置能力状态。"
    ],
    match: ({ domain, action }) => domain === 'builtin' && action === 'list',
    run: (r, c) => r.builtinList(c.argv.slice(4)),
  },
  {
    key: "builtin uninstall",
    surface: "primary",
    summary: "卸载 optional Buildr 内置能力。required 内置能力不能卸载。",
    help: [
      "Usage: buildr builtin uninstall <id> --target <dir> [--reason <text>]",
      "",
      "卸载 optional Buildr 内置能力。required 内置能力不能卸载。"
    ],
    match: ({ domain, action }) => domain === 'builtin' && action === 'uninstall',
    run: (r, c) => r.builtinUninstall(c.argv.slice(4)),
  },
  {
    key: "builtin restore",
    surface: "primary",
    summary: "恢复 optional Buildr 内置能力；该命令表示明确放弃此 Builtin 的本地修改。",
    help: [
      "Usage: buildr builtin restore <id> --target <dir>",
      "",
      "恢复 optional Buildr 内置能力；该命令表示明确放弃此 Builtin 的本地修改。",
      "当当前 Builtin 声明 predecessor 时，只接管 manifest 可证明为 Buildr-managed 的旧 identity；随后运行 sync 收敛 Agent runtime。"
    ],
    match: ({ domain, action }) => domain === 'builtin' && action === 'restore',
    run: (r, c) => r.builtinRestore(c.argv.slice(4)),
  },
  {
    key: "installation status",
    surface: "primary",
    summary: "分别报告 npm、development、本机 Launcher 与当前运行实例的可信身份。",
    help: [
      "Usage: buildr installation status [--json]",
      "",
      "只读取 embedded identity 与 ownership receipt；不会扫描 PATH 或按文件名猜测来源。"
    ],
    match: ({ domain, action }) => domain === 'installation' && action === 'status',
    run: (r, c) => r.installationStatus(c.argv.slice(4)),
  },
  {
    key: "update check",
    surface: "primary",
    summary: "检查 Buildr CLI 来源、远端版本和安全更新状态；不读取 workspace。",
    help: [
      "Usage: buildr update check [--json]",
      "",
      "检查 Buildr CLI 来源、远端版本和安全更新状态；不读取 workspace。"
    ],
    match: ({ domain, action }) => domain === 'update' && action === 'check',
    run: (r, c) => r.updateCheck(c.argv.slice(4)),
  },
  {
    key: "update",
    surface: "primary",
    summary: "根据当前命令来源更新 Buildr CLI 自身；不读取或同步 workspace。",
    help: [
      "Usage: buildr update [--json]",
      "",
      "根据当前命令来源更新 Buildr CLI 自身；不读取或同步 workspace。",
      "同步 workspace 请使用 buildr sync <agent> --target <dir>。"
    ],
    match: ({ domain }) => domain === 'update',
    run: (r, c) => r.updateBuildr(c.argv.slice(3)),
  },
  {
    key: "render",
    surface: "agent-machine",
    summary: "组合渲染 rules entry 和 workspace Skills 到 workspace destination；不安装产品入口 Buildr Skill。",
    help: [
      "Usage: buildr render <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir> [--scope <scope>]",
      "",
      "组合渲染 rules entry 和 workspace Skills 到 workspace destination；不安装产品入口 Buildr Skill。"
    ],
    match: ({ domain }) => domain === 'render',
    run: (r, c) => {
    const { targetRoot, files, rulesActions, warnings } = r.renderRuntime(c.action, c.argv.slice(4));
    for (const warning of warnings) console.error(`Warning: ${warning}`);
    const ruleTargets = new Set(rulesActions.map((item) => item.targetFile));
    for (const item of rulesActions) console.log(`[${item.action}] ${r.toPosixRelative(targetRoot, item.targetFile)}`);
    for (const file of files) if (!ruleTargets.has(file)) console.log(r.toPosixRelative(targetRoot, file));
  },
  },
  {
    key: "sync",
    surface: "primary",
    summary: "同步 Buildr 产品能力，安装产品入口 Buildr Skill，并准备当前 Agent 的 workspace 入口 runtime。不是 Project scope 同步工具。",
    help: [
      "Usage: buildr sync <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir> [--scope <scope>]",
      "",
      "同步 Buildr 产品能力，安装产品入口 Buildr Skill，并准备当前 Agent 的 workspace 入口 runtime。不是 Project scope 同步工具。"
    ],
    match: ({ domain }) => domain === 'sync',
    run: (r, c) => r.syncRuntime(c.action, c.argv.slice(4)),
  },
  {
    key: "skills add",
    surface: "primary",
    summary: "只维护 workspace Skills 源资产；Project 使用 capabilities.yml 引用 workspace Skill。",
    help: [
      "Usage: buildr skills add [<id>] --source <skill-dir> [--target <workspace>] [--replace] [--ignore-unsupported] [--provides <capability>@<version>] [--requires <capability>@<version>:<required|optional>]",
      "Usage: buildr skills add <id> --remote-source <url> [--target <workspace>] [--source-kind <kind>] [--description <text>] [--replace]",
      "Usage: buildr skills add <id> --resolved-source <url> [--target <workspace>] [--resolved-kind <kind>] [--remote-source <url>] [--source-kind <kind>] [--version <version>] [--integrity <hash>] [--description <text>] [--replace]",
      "",
      "只维护 workspace Skills 源资产；Project 使用 capabilities.yml 引用 workspace Skill。"
    ],
    match: ({ domain, action }) => domain === 'skills' && action === 'add',
    run: (r, c) => r.skillsAdd(c.argv.slice(4)),
  },
  {
    key: "skills remove",
    surface: "primary",
    summary: "删除 workspace Skills 源资产登记。",
    help: [
      "Usage: buildr skills remove <id> [--target <workspace>]",
      "",
      "删除 workspace Skills 源资产登记。"
    ],
    match: ({ domain, action }) => domain === 'skills' && action === 'remove',
    run: (r, c) => r.skillsRemove(c.argv.slice(4)),
  },
  {
    key: "skills bind",
    surface: "primary",
    summary: "显式选择当前 scope 的 capability provider；不会安装 Skill 或证明其行为正确。",
    help: [
      "Usage: buildr skills bind <capability>@<version> --provider <skill-id> --scope <.|projects/project> [--target <dir>]",
      "",
      "显式选择当前 scope 的 capability provider；不会安装 Skill 或证明其行为正确。"
    ],
    match: ({ domain, action }) => domain === 'skills' && action === 'bind',
    run: (r, c) => r.skillsBind(c.argv.slice(4)),
  },
  {
    key: "skills unbind",
    surface: "primary",
    summary: "删除当前 scope 的显式 binding，由 resolver 重新判断唯一 provider、歧义或缺失。",
    help: [
      "Usage: buildr skills unbind <capability>@<version> --scope <.|projects/project> [--target <dir>]",
      "",
      "删除当前 scope 的显式 binding，由 resolver 重新判断唯一 provider、歧义或缺失。"
    ],
    match: ({ domain, action }) => domain === 'skills' && action === 'unbind',
    run: (r, c) => r.skillsUnbind(c.argv.slice(4)),
  },
  {
    key: "skill install",
    surface: "agent-machine",
    summary: "只安装或修复产品入口 Buildr Skill。",
    help: [
      "Usage: buildr skill install <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir>",
      "",
      "只安装或修复产品入口 Buildr Skill。"
    ],
    requiresAgent: true,
    match: ({ domain, action }) => domain === 'skill' && action === 'install',
    run: (r, c) => {
    const command = r.withResolvedTarget(c.args);
    const adapter = r.getRuntimeAdapter(c.runtimeId);
    const { targetRoot, files } = r.installProductRuntimeSkill(adapter.id, command.args, { repoRoot: command.targetRoot, command: `buildr skill install ${c.runtimeId}` });
    for (const file of files) console.log(r.path.relative(targetRoot, file).split(r.path.sep).join('/'));
  },
  },
  {
    key: "runtime check",
    surface: "agent-machine",
    summary: "专项检查某个 Agent runtime render 状态。",
    help: [
      "Usage: buildr runtime check <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --scope <.|projects/project[/services/service[/path...]]> --target <dir>",
      "",
      "专项检查某个 Agent runtime render 状态。"
    ],
    requiresAgent: true,
    match: ({ domain, action }) => domain === 'runtime' && action === 'check',
    run: (r, c) => {
    const command = r.withResolvedTarget(c.args);
    const adapter = r.getRuntimeAdapter(c.runtimeId);
    const checker = r.runtimeImplementation(adapter, 'checker', r.RUNTIME_CHECKERS);
    const printer = r.runtimeImplementation(adapter, 'checker', r.RUNTIME_CHECK_PRINTERS);
    const result = checker(command.args, { repoRoot: command.targetRoot, adapterId: adapter.id, command: `buildr runtime check ${c.runtimeId}` });
    printer(result); process.exit(result.exitCode);
  },
  },
  {
    key: "skills render",
    surface: "agent-machine",
    summary: "--target 始终是 Skill source workspace；workspace destination 写当前工作目录 runtime，user destination 写当前 Agent 用户层。默认 workspace。",
    help: [
      "Usage: buildr skills render <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--destination workspace|user] --target <workspace> [--json]",
      "",
      "--target 始终是 Skill source workspace；workspace destination 写当前工作目录 runtime，user destination 写当前 Agent 用户层。默认 workspace。"
    ],
    requiresAgent: true,
    match: ({ domain, action }) => domain === 'skills' && action === 'render',
    run: (r, c) => runScopedRender(r, c),
  },
  {
    key: "rules render",
    surface: "agent-machine",
    summary: "递归发现 canonical workspace scope 的祖先链和子树，并按 adapter reconcile rules bridge 或 vendor rule files。原生消费 AGENTS.md 的 adapter 不执行 rules render。",
    help: [
      "Usage: buildr rules render <claude-code|cursor|qoder|trae|trae-work|workbuddy> --scope <.|projects/project[/services/service[/path...]]> --target <dir>",
      "",
      "递归发现 canonical workspace scope 的祖先链和子树，并按 adapter reconcile rules bridge 或 vendor rule files。原生消费 AGENTS.md 的 adapter 不执行 rules render。"
    ],
    requiresAgent: true,
    match: ({ domain, action }) => domain === 'rules' && action === 'render',
    run: (r, c) => runScopedRender(r, c),
  }
];

const COMMAND_GROUPS = [
  {
    key: "web preview",
    surface: "maintenance",
    summary: "预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和 cleanup 事实由 Environment Receipt 管理。",
    help: [
      "Usage: buildr web preview <start|list|stop> ...",
      "",
      "预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和 cleanup 事实由 Environment Receipt 管理。"
    ],
    executable: false,
  },
  {
    key: "task execution-record",
    surface: "maintenance",
    summary: "读取Task-scoped Execution Record，或执行Workspace级bounded GC。",
    help: [
      "Usage: buildr task execution-record <list|inspect|gc> ...",
      "",
      "list/inspect用于原终端不可用后的只读恢复；gc执行bounded维护。不提供文件系统 discovery、failure 自动处置或执行资源 cleanup。"
    ],
    executable: false,
  },
  {
    key: "task",
    surface: "primary",
    summary: "Task Manager 只管理 canonical Workspace 中的 Task Record：创建、查看、明确更新、设置或清除 Parent Task、完成或放弃。",
    help: [
      "Usage: buildr task <create|inspect|update|complete|abandon> <task-id> ... [--target <canonical-workspace>] [--json]",
      "",
      "Task Manager 只管理 canonical Workspace 中的 Task Record：创建、查看、明确更新、设置或清除 Parent Task、完成或放弃。",
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
      "Agent登记Plan；prepare幂等执行与恢复；inspect只读复核；cleanup只接受Task Finish handoff或已持久化的abandon终态。"
    ],
    executable: false,
  },
  {
    key: "task finish",
    surface: "agent-machine",
    summary: "run 消费 current formal Development handoff 并执行 prepare → verify → deliver → cleanup；inspect 只读查看 durable finish run。",
    help: [
      "Usage: buildr task finish <run|inspect> ...",
      "",
      "run 消费 current formal Development handoff 并执行 prepare → verify → deliver → cleanup；inspect 只读查看 durable finish run。",
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
      process.exit(printCliError(context.rawArgs, { candidates: commandCandidates(), helpTopic: context.rawArgs[0] === 'help' }));
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

export const COMMAND_REGISTRY = Object.freeze([
  ...SPECIAL_COMMANDS,
  ...COMMAND_ROUTES.map(executableCommand),
]);

export const COMMAND_CATALOG = Object.freeze([
  ...COMMAND_REGISTRY,
  ...COMMAND_GROUPS.map(Object.freeze),
]);

function commandCandidates() {
  return COMMAND_REGISTRY.map((item) => item.key);
}

function runScopedRender(r, context) {
  const adapter = r.getRuntimeAdapter(context.runtimeId);
  const renderer = context.domain === 'skills'
    ? (args) => r.renderSkillsRuntime(context.runtimeId, args)
    : context.domain === 'rules' && adapter.renderCapabilities['rules-entry'].writesFiles
      ? (args) => r.renderRulesRuntime(context.runtimeId, args)
      : null;
  if (!renderer) { r.usage(); process.exit(2); }
  const command = r.withResolvedTarget(context.args);
  const result = renderer(command.args, { repoRoot: command.targetRoot, command: `buildr ${context.domain} render ${context.runtimeId}` });
  const { targetRoot, files } = result;
  for (const warning of result.warnings || []) console.error(`Warning: ${warning}`);
  if (result.jsonReported) return;
  if (context.domain === 'skills' && files.length === 0) {
    const scope = r.optionValue(command.args, '--scope');
    console.log('No workspace Skills declared.');
    return;
  }
  if (context.domain === 'rules' && result.actions) {
    for (const item of result.actions) console.log(`[${item.action}] ${r.toPosixRelative(targetRoot, item.targetFile)}`);
    return;
  }
  for (const file of files) console.log(r.toPosixRelative(targetRoot, file));
}

export function dispatch(argv = process.argv) {
  const runtime = createRuntime();
  registerLocalWorkspaceAppInterface(runtime);
  registerLauncherInterface(runtime);
  registerCommandHelp(runtime, COMMAND_CATALOG);
  const rawArgs = argv.slice(2);
  const [domain, action, runtimeId, ...args] = rawArgs;
  const context = { argv, rawArgs, domain, action, runtimeId, args, runtime };
  const direct = COMMAND_REGISTRY.find((item) => !item.requiresAgent && item.match(context));
  if (direct) return direct.run(runtime, context);
  const agent = COMMAND_REGISTRY.find((item) => item.requiresAgent && item.match(context));
  if (agent && runtime.isSupportedAgent(runtimeId)) return agent.run(runtime, context);
  process.exit(printCliError(rawArgs, { candidates: commandCandidates() }));
}
