import path from 'node:path';
import { RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS } from '../../infrastructure/runtime/adapter-contract.mjs';

const RULES_RENDER_AGENT_IDS = Object.values(RUNTIME_ADAPTERS)
  .filter((adapter) => adapter.renderCapabilities['rules-entry'].writesFiles)
  .map((adapter) => adapter.id);

export function registerCommandHelp(runtime) {
  const doctor = (...args) => runtime.doctor(...args);

  function usage() {
    const runtimeIds = SUPPORTED_AGENT_IDS.join('|');
    console.error('Usage:');
    console.error(`  buildr init [--agent <${runtimeIds}>] [--target <dir>] [--name <name>] [--description <text>] [--profile <personal|team|company>]`);
    console.error('  buildr app [--target <workspace>] [--port <port>] [--no-open]');
    console.error('  buildr app preview <start|list|stop> ...');
    console.error('  buildr app launcher <install|status|uninstall> [--channel <release|development>] [--target <dir>] [--json]');
    console.error('  buildr project create <code> [--target <dir>] [--name <text>] [--description <text>] [--repo <git-url>] [--remote <name>] [--integration-branch <branch>]');
    console.error('  buildr service create <project>/<service> <repo-ref> [--target <dir>] [--name <text>] [--description <text>] [--type <type>] [--remote <name>] [--integration-branch <branch>] [--json]');
    console.error('  buildr worktree create <task-id> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]');
    console.error('  buildr worktree cleanup <task-id> --integrated-ref <selector>=<ref> ... [--target <workspace>] [--json]');
    console.error('  buildr worktree inspect <task-id> [--target <workspace>] [--json]');
    console.error(`  buildr task environment prepare <task-id> [--agent <${runtimeIds}>] [--branch <branch>] [--start-point <ref>] [--shared] [--target <canonical-workspace>] [--json]`);
    console.error('  buildr task environment inspect|cleanup <task-id> [--target <canonical-workspace>] [--json]');
    console.error('  buildr verification run --project <code> --level <affected|candidate> [--target <execution-root>] [--environment <task-id> --workspace <canonical-workspace>] [--authorize-resource <id> ...] [--output <file>] [--json]');
    console.error('  buildr task <create|inspect|update|complete|abandon> <task-id> ... [--target <canonical-workspace>] [--json]');
    console.error('  buildr task review <inspect|record> <task-id> ... [--target <canonical-workspace>] [--json]');
    console.error('  buildr task finish run --task <task-id> --project <code> [--change <id>] [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--required-assurance <affected|candidate>] [--verification-summary <file>] [--run <id> --resume <token>] [--target <canonical-workspace>] [--json]');
    console.error('  buildr task finish inspect --run <id> [--target <canonical-workspace>] [--json]');
    console.error('  buildr openspec <converge|audit> <change> --project <project> [--target <workspace>] [--json]');
    console.error('  buildr doctor [--agent <agent>] [--target <dir>] [--scope <.|projects/project[/services/service[/path...]]>] [--json] [--detail <compact|full>] [--include-info] [--verbose]');
    console.error('  buildr mutation recover <transaction-id> [--target <dir>]');
    console.error('  buildr commands add <id> --purpose <text> [--target <dir>] [--collection <path>] [--executable <name>] [--name <text>] [--description <text>] [--version-constraint <constraint>] [--version-args <args>] [--install-hint <text>] [--replace]');
    console.error('  buildr commands remove <id> [--target <dir>] [--collection <path>]');
    console.error('  buildr commands check [--project <project> ...] [--target <dir>] [--json]');
    console.error('  buildr openspec baseline create <change> --project <project> [--target <dir>] [--adopt-current] [--update] [--json]');
    console.error('  buildr openspec check <change> --stage <proposal|pre-sync|post-sync> --project <project> [--target <dir>] [--json]');
    console.error('  buildr component list [--target <dir>] [--json]');
    console.error('  buildr component check [<id>] [--target <dir>] [--json]');
    console.error('  buildr component install <id> --agent <agent> [--target <dir>]');
    console.error('  buildr component uninstall <id> --agent <agent> [--target <dir>] [--reason <text>]');
    console.error('  buildr builtin list [--target <dir>] [--json]');
    console.error('  buildr builtin uninstall <id> --target <dir> [--reason <text>]');
    console.error('  buildr builtin restore <id> --target <dir>');
    console.error('  buildr update [--json]');
    console.error('  buildr update check [--json]');
    console.error('  buildr runtime list [--json]');
    console.error(`  buildr render <${runtimeIds}> --target <dir> [--scope <scope>]`);
    console.error(`  buildr sync <${runtimeIds}> --target <dir> [--scope <scope>]`);
    console.error('  buildr bootstrap guide');
    console.error('  buildr package check');
    console.error('  buildr package build [--out <dir>]');
    console.error(`  buildr skill install <${runtimeIds}> --target <dir>`);
    console.error('  buildr skills add [<id>] --source <skill-dir> [--target <workspace>] [--replace] [--ignore-unsupported] [--provides <capability>@<version>] [--requires <capability>@<version>:<required|optional>]');
    console.error('  buildr skills add <id> --remote-source <url> [--target <workspace>] [--source-kind <kind>] [--description <text>] [--replace]');
    console.error('  buildr skills add <id> --resolved-source <url> [--target <workspace>] [--resolved-kind <kind>] [--remote-source <url>] [--source-kind <kind>] [--version <version>] [--integrity <hash>] [--description <text>] [--replace]');
    console.error('  buildr skills remove <id> [--target <workspace>]');
    console.error('  buildr skills bind <capability>@<version> --provider <skill-id> --scope <.|projects/project> [--target <dir>]');
    console.error('  buildr skills unbind <capability>@<version> --scope <.|projects/project> [--target <dir>]');
    console.error(`  buildr skills render <${runtimeIds}> [--destination workspace|user] --target <workspace> [--json]`);
    console.error('  buildr skills migrate-project-assets --target <workspace> <--check|--apply> [--json]');
    console.error('  buildr rules add <id> [--path <rules/file.md>] --description <text> [--target <dir>] [--replace]');
    console.error('  buildr rules remove <id> [--target <dir>] [--keep-file]');
    console.error(`  buildr rules render <${RULES_RENDER_AGENT_IDS.join('|')}> --scope <.|projects/project[/services/service[/path...]]> --target <dir>`);
    console.error(`  buildr runtime check <${runtimeIds}> --scope <.|projects/project[/services/service[/path...]]> --target <dir>`);
  }

  const HELP_TOPICS = {
    root: [
      'Usage: buildr <command> [options]',
      '',
      'Public workspace commands:',
      '  init                 初始化 Buildr workspace；传入 --agent 时一次完成 runtime 与最终 doctor。',
      '  app                  启动仅限本机访问的 Buildr Workspace 可视化应用。',
      '  app preview          为 Task Environment 或独立 checkout 启动、查看和停止隔离预览。',
      '  app launcher         安装、检查或卸载当前平台的 Buildr launcher。',
      '  version              输出当前 Buildr CLI package version；支持 --json。',
      '  project create       创建或登记 Project。',
      '  service create       创建或登记 Service。',
      '  worktree create/inspect/cleanup  只管理 Git checkout、branch 和 provider evidence。',
      '  task environment     按正式 Task 准备、检查或清理唯一 Environment Receipt。',
      '  verification run     按 Project verification.yml 执行受影响或完整候选验证。',
      '  task create/inspect/update/complete/abandon  管理 canonical Workspace 的最小 Task Record。',
      '  task review          读取或记录完整 Task Review Result；不执行语义审查。',
      '  task finish          产品执行 preflight → prepare → verify → deliver → cleanup 固定收尾。',
      '  doctor               诊断 workspace、源资产和 Agent runtime render 状态。',
      '  mutation recover      从保留 backup 恢复不完整 source mutation。',
      '  runtime list         列出 Buildr 支持的 Agent runtime adapter。',
      '  runtime check        专项检查某个 Agent runtime render 状态。',
      '  render               渲染指定 Agent 的 rules entry 和 workspace Skills 到工作目录。',
      '  sync                 同步 Buildr 产品能力并准备当前 Agent 的 workspace 入口 runtime。',
      '  skill install        安装产品入口 Buildr Skill。',
      '  skills add/remove/bind/unbind/render',
      '  commands add/remove/check  维护 workspace catalog，并按显式 Project context 检查本机环境。',
      '  component list/check/install/uninstall',
      '  rules add/remove/render',
      '  builtin list/uninstall/restore',
      '  update/check',
      '  bootstrap guide',
      '',
      'Product maintenance / workflow internals:',
      '  package check/build  校验或构建 Buildr 产品包。',
      '  openspec converge/audit  执行单一收敛事务或只读审计；旧阶段命令仅作弃用兼容。',
      '',
      '表面分类说明用途与支持边界，不是权限或安全限制；以上命令仍可执行并可查看主题帮助。',
    ],
    init: [
      `Usage: buildr init [--agent <${SUPPORTED_AGENT_IDS.join('|')}>] [--target <dir>] [--name <name>] [--description <text>] [--profile <personal|team|company>]`,
      '',
      '首次 onboarding 推荐传入 --agent：初始化源资产后复用完整 sync，并以最终 doctor 通过作为技术完成条件；随后由 Agent 根据真实 Project/Service 状态完成简短首次使用交接并邀请第一项工作。',
      '不传 --agent 时只初始化源资产；已有 workspace 的日常更新继续使用 buildr sync <agent>。',
      '未提供 --description 时写入明确 TODO，并由 doctor 提示补全。',
      '--help 只输出帮助，不会写入文件。',
    ],
    app: [
      'Usage: buildr app [--target <workspace>] [--port <port>] [--no-open]',
      '',
      '启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。',
      '--target 验证并登记指定 Workspace，然后打开该 Workspace；不提供时显示本机已登记 Workspace。',
      '关闭浏览器不会退出服务；通过页面“退出 Buildr”或终止进程停止服务。',
      'Workspace 页面帮助理解 Workspace → Project → Service 工作范围，只允许修改 name 和 description；创建、迁移和修复只生成可复制 Agent 指令。',
      'Project 与 Service 页面保持独立目录、详情和编辑；页面可生成范围明确的开始工作指令，但不会启动或管理 Agent 会话。',
      '页面不会 checkout、stash、merge 或改写 Project Git source。',
      '旧 Workspace metadata 可以只读查看，完成 canonical sync 迁移后才能从页面保存。',
      '本机登记列表只保存 Workspace root；事实仍来自各 Workspace，应用不提供远程服务或 Agent session connector。',
      '任务验证工作区的并行验收可使用 app preview；每个 preview 具有独立状态和 loopback URL，不会改变默认应用或 Buildr Dev.app。',
    ],
    'app preview start': [
      'Usage: buildr app preview start <instance> [--task <task-id> --target <canonical-workspace>] [--port <port>] [--no-open] [--json]',
      '',
      '提供 --task 时，从该 Task Environment 的任务验证工作区启动，并在健康后登记为 Environment 动态资源；登记失败会认证停止刚创建的实例。',
      '不提供 --task 时保留独立 checkout 预览。实例名不能接管其他健康预览，也不会替换默认本机应用。',
    ],
    'app preview': [
      'Usage: buildr app preview <start|list|stop> ...',
      '',
      '预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和 cleanup 事实由 Environment Receipt 管理。',
    ],
    'app preview list': [
      'Usage: buildr app preview list [--json]',
      '',
      '列出 Buildr 管理的开发预览及其 owner、URL、PID 与健康状态；不会扫描或管理其他系统进程。',
    ],
    'app preview stop': [
      'Usage: buildr app preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--json]',
      '',
      'Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Environment resource、preview metadata 和进程 secret 完全匹配；停止后释放同一资源。独立 preview 保持实例级停止。',
    ],
    'app launcher install': [
      'Usage: buildr app launcher install [--channel <release|development>] [--target <dir>] [--json]',
      '',
      '构建到新的 staging、验证后安全切换 launcher；development 安装为隔离的 Buildr Dev。',
      '默认安装到用户级应用目录，不安装 Buildr Skill，也不修改 Workspace 源资产。',
    ],
    'app launcher status': [
      'Usage: buildr app launcher status [--channel <release|development>] [--target <dir>] [--json]',
      '',
      '报告 launcher 的真实安装位置、channel、版本与 checkout identity。',
    ],
    'app launcher uninstall': [
      'Usage: buildr app launcher uninstall [--channel <release|development>] [--target <dir>] [--json]',
      '',
      '只移除对应 channel 拥有的 launcher 和上一版本；保留 Workspace Registry 与 Workspace 源资产。',
    ],
    version: [
      'Usage: buildr version [--json]',
      '',
      '输出当前实际执行的 Buildr CLI package identity。也可使用 buildr --version 或 buildr -V。',
    ],
    'project create': [
      'Usage: buildr project create <code> [--target <dir>] [--name <text>] [--description <text>] [--repo <git-url>] [--remote <name>] [--integration-branch <branch>]',
      '',
      '创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。',
      '不传 --repo 时 Project 跟随 root Workspace Git；传入 --repo 时 remote 与 integration branch 是稳定声明，不是当前 checkout 状态。',
      '--title 继续作为 --name 的 legacy compatibility 输入，但 canonical help 和输出统一使用 --name。',
      'Project baseline 包含 commands.yml；它只引用 workspace Command catalog，不复制 executable、probe 或 install hint。',
    ],
    'service create': [
      'Usage: buildr service create <project>/<service> <repo-ref> [--target <dir>] [--name <text>] [--description <text>] [--type <type>] [--remote <name>] [--integration-branch <branch>] [--json]',
      '',
      '创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。',
      'Git remote 与 integration branch 是稳定声明；current branch、HEAD、dirty 和 upstream 状态只实时观察。',
      '--title 和 --branch 继续作为 --name、--integration-branch 的 legacy compatibility 输入。',
      'Service 规则入口是 Service 目录中的 AGENTS.md，不在 Service registry 中记录规则路径。',
    ],
    task: [
      'Usage: buildr task <create|inspect|update|complete|abandon> <task-id> ... [--target <canonical-workspace>] [--json]',
      '',
      'Task Manager 只管理 canonical Workspace 中的顶层 Task Record：创建、查看、明确更新、完成或放弃。',
      '它不创建或记录 Task Environment，不执行 Development、Review、Verification、Git、Finish、Board、cleanup 或 publication，也不接受完整 next-state 文档。',
      'Agent 和 Local App 都调用同一个 Task Record Application；不要直接编辑 .buildr/tasks/<task-id>/task.yml。',
    ],
    'task review': [
      'Usage: buildr task review <inspect|record> <task-id> ... [--target <canonical-workspace>] [--json]',
      '',
      'Task Review CLI 只管理已经完整形成的 Planning/Completion Result；两个槽位均可选，它不执行 Review、生成 plan/Candidate identity 或设置 Development gate。',
      'record 必须由调用方提供明确 target identity；Review 中断时不调用 writer，inspect 通过 identity 比较派生 current/stale/unknown。',
    ],
    'task review inspect': [
      'Usage: buildr task review inspect <task-id> [--planning-target <identity>] [--completion-target <identity>] [--target <canonical-workspace>] [--json]',
      '',
      '只读返回 Planning/Completion 两个可选槽位、response-only resultDigest 与派生 applicability；未提供 current target 时已有 Result 显示 unknown。',
    ],
    'task review record': [
      'Usage: buildr task review record <task-id> --type <planning|completion> --target-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <ready|changes-required> --summary <text> [--target <canonical-workspace>] [--json]',
      '',
      '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
      '中断、缺少 target identity、覆盖或结论不完整时不写入；Completion identity 必须由真实 Candidate producer 提供。',
    ],
    'task environment': [
      'Usage: buildr task environment <prepare|inspect|cleanup> <task-id> [--target <canonical-workspace>] [--json]',
      '',
      'Task Environment 独占 ready、恢复、执行投影、动态资源与 cleanup 事实。Task Record 不保存环境字段。',
      'prepare 幂等承担首次准备与恢复；inspect 只读复核当前机器；cleanup 只接受 Task Finish handoff 或已持久化的 abandon 终态。',
    ],
    'task environment prepare': [
      `Usage: buildr task environment prepare <task-id> [--agent <${SUPPORTED_AGENT_IDS.join('|')}>] [--branch <branch>] [--start-point <ref>] [--shared] [--target <canonical-workspace>] [--json]`,
      '',
      '按正式 Task scope 准备 checkout 或共享执行根、Workspace Node/CLI/依赖和 runtime projection，并在每次返回前执行真实 probe。',
      '默认使用 Git worktree；--shared 仅在明确共享根时使用。候选 Product CLI 只能准备自身任务验证工作区，不能控制 retained/peer 环境。',
    ],
    'task environment inspect': [
      'Usage: buildr task environment inspect <task-id> [--target <canonical-workspace>] [--json]',
      '',
      '只读返回当前机器的 Environment Receipt availability、observedAt、scope/root、执行基础、provider、资源和 cleanup 摘要。',
    ],
    'task environment cleanup': [
      'Usage: buildr task environment cleanup <task-id> [--target <canonical-workspace>] [--json]',
      '',
      '按 provider 依赖先停止 Task-owned 资源，再清理可证明属于该 Task 的 Git checkout；成功后保留最小处置摘要。',
      '公共 CLI 只允许已持久化的 abandoned Task；正常完成由 Task Finish 内部提交交付 identity。',
    ],
    'task create': [
      'Usage: buildr task create <task-id> --title <text> --intent <text> [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]',
      '',
      '必需参数：唯一 task-id、--title、--intent。--project、--service、--change 可重复；引用必须已登记或真实存在。',
      '副作用：仅创建 .buildr/tasks/<task-id>/task.yml；不创建 Environment、Change、branch、commit 或专业记录。',
    ],
    'task inspect': [
      'Usage: buildr task inspect <task-id> [--target <canonical-workspace>] [--json]',
      '',
      '只读返回 Task Record、canonical path 和响应级 recordDigest；不更新时间或任何字段。',
    ],
    'task update': [
      'Usage: buildr task update <task-id> [--title <text>] [--intent <text>] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]',
      '',
      '至少提供一个明确 setter/add/remove；同一引用不能同时 add/remove。只允许修改 active Task。',
      '不接受 --input、patch、完整 next-state、expected revision 或专业模块字段。',
    ],
    'task complete': [
      'Usage: buildr task complete <task-id> --summary <text> [--no-change] [--target <canonical-workspace>] [--json]',
      '',
      '把 active Task 单向标记为 completed；省略 --no-change 表示本 Task 有交付变更。',
      '该动作只更新顶层 Task Record，不执行 Finish、Verification、Git、publication 或 cleanup。',
    ],
    'task abandon': [
      'Usage: buildr task abandon <task-id> --reason <text> [--target <canonical-workspace>] [--json]',
      '',
      '把 active Task 单向标记为 abandoned；终态不可重开或继续修改。',
      '该动作只更新顶层 Task Record，不执行 Environment cleanup、Git 或其他专业动作。',
    ],
    'worktree create': [
      'Usage: buildr worktree create <task-id> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]',
      '',
      '这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。',
      '全部仓库在写入前统一预检；部分创建失败保留已创建 checkout 和 evidence，供同一计划恢复。它不判断 Environment ready，也不准备 Runtime/CLI/依赖/projection。',
    ],
    'worktree cleanup': [
      'Usage: buildr worktree cleanup <task-id> --integrated-ref <selector>=<ref> ... [--target <workspace>] [--json]',
      '',
      '只根据 Git provider evidence 核对 checkout/branch/clean/registration 与 integrated ref，再 nested-first 删除 worktree、本地任务分支和 provider evidence。',
      '它不读取 Environment Receipt、不停止动态资源、不决定总 cleanup，也不删除远端分支。正式 workflow 由 Task Environment Application 编排。',
    ],
    'worktree inspect': [
      'Usage: buildr worktree inspect <task-id> [--target <workspace>] [--json]',
      '',
      '根据窄 provider evidence 检查全部成员仓库的 checkout、branch、HEAD、clean 与 registration；不输出 Environment ready 或 runtime/session 事实。',
    ],
    'verification run': [
      'Usage: buildr verification run --project <code> --level <affected|candidate> [--target <execution-root>] [--environment <task-id> --workspace <canonical-workspace>] [--authorize-resource <id> ...] [--concurrency <n>] [--include-advisory] [--output <file>] [--candidate-fingerprint <identity>] [--json]',
      '',
      '读取已登记 Project 的 verification.yml，按依赖和显式 supersedes 构造 DAG，并发执行资源兼容的能力。',
      '采用 Task Environment 时必须同时提供 Task ID 与 canonical Workspace；Environment Application 只交接 scope、执行根、source/projection identity，不读取或写入真实 Agent session 采用证明。',
      'coordinated 资源通过 Git common-dir lease 跨 task 排队；external 资源必须逐项 --authorize-resource。该命令执行验证，不创建任务或调度 Agent。',
      '默认 evidence 为 transient；--output 指定 caller-managed summary。--json 返回 buildr.verification-run/v1。',
    ],
    'verification cleanup': [
      'Usage: buildr verification cleanup --summary <file> [--json]',
      '',
      '只清理 buildr.verification-run/v1 声明的 provider-owned transient run directory；caller-managed、identity 不匹配、越界或不可证明的 legacy evidence 一律保留。',
    ],
    doctor: [
      'Usage: buildr doctor [--agent <agent>] [--target <dir>] [--scope <.|projects/project[/services/service[/path...]]>] [--json] [--detail <compact|full>] [--include-info] [--verbose]',
      '',
      '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。',
    ],
    'mutation recover': [
      'Usage: buildr mutation recover <transaction-id> [--target <dir>]',
      '',
      '从完整 transaction journal 和 backup 恢复操作前源资产；不会猜测或接受半完成新状态。',
    ],
    'runtime list': [
      'Usage: buildr runtime list [--json]',
      '',
      '列出 Buildr 支持的 Agent runtime adapter；不要求当前目录是 Buildr workspace。',
    ],
    'runtime check': [
      `Usage: buildr runtime check <${SUPPORTED_AGENT_IDS.join('|')}> --scope <.|projects/project[/services/service[/path...]]> --target <dir>`,
      '',
      '专项检查某个 Agent runtime render 状态。',
    ],
    sync: [
      `Usage: buildr sync <${SUPPORTED_AGENT_IDS.join('|')}> --target <dir> [--scope <scope>]`,
      '',
      '同步 Buildr 产品能力，安装产品入口 Buildr Skill，并准备当前 Agent 的 workspace 入口 runtime。不是 Project scope 同步工具。',
    ],
    render: [
      `Usage: buildr render <${SUPPORTED_AGENT_IDS.join('|')}> --target <dir> [--scope <scope>]`,
      '',
      '组合渲染 rules entry 和 workspace Skills 到 workspace destination；不安装产品入口 Buildr Skill。',
    ],
    'skill install': [
      `Usage: buildr skill install <${SUPPORTED_AGENT_IDS.join('|')}> --target <dir>`,
      '',
      '只安装或修复产品入口 Buildr Skill。',
    ],
    'skills add': [
      'Usage: buildr skills add [<id>] --source <skill-dir> [--target <workspace>] [--replace] [--ignore-unsupported] [--provides <capability>@<version>] [--requires <capability>@<version>:<required|optional>]',
      'Usage: buildr skills add <id> --remote-source <url> [--target <workspace>] [--source-kind <kind>] [--description <text>] [--replace]',
      'Usage: buildr skills add <id> --resolved-source <url> [--target <workspace>] [--resolved-kind <kind>] [--remote-source <url>] [--source-kind <kind>] [--version <version>] [--integrity <hash>] [--description <text>] [--replace]',
      '',
      '只维护 workspace Skills 源资产；Project 使用 capabilities.yml 引用 workspace Skill。',
    ],
    'skills remove': [
      'Usage: buildr skills remove <id> [--target <workspace>]',
      '',
      '删除 workspace Skills 源资产登记。',
    ],
    'skills bind': [
      'Usage: buildr skills bind <capability>@<version> --provider <skill-id> --scope <.|projects/project> [--target <dir>]',
      '',
      '显式选择当前 scope 的 capability provider；不会安装 Skill 或证明其行为正确。',
    ],
    'skills unbind': [
      'Usage: buildr skills unbind <capability>@<version> --scope <.|projects/project> [--target <dir>]',
      '',
      '删除当前 scope 的显式 binding，由 resolver 重新判断唯一 provider、歧义或缺失。',
    ],
    'skills render': [
      `Usage: buildr skills render <${SUPPORTED_AGENT_IDS.join('|')}> [--destination workspace|user] --target <workspace> [--json]`,
      '',
      '--target 始终是 Skill source workspace；workspace destination 写当前工作目录 runtime，user destination 写当前 Agent 用户层。默认 workspace。',
    ],
    'skills migrate-project-assets': [
      'Usage: buildr skills migrate-project-assets --target <workspace> <--check|--apply> [--json]',
      '',
      '显式检查或事务迁移 legacy Project Skill 源到 workspace，并生成 Project capability/applicability context。',
    ],
    'commands add': [
      'Usage: buildr commands add <id> --purpose <text> [--target <dir>] [--collection <path>] [--executable <name>] [--name <text>] [--description <text>] [--version-constraint <constraint>] [--version-args <args>] [--install-hint <text>] [--replace]',
      '',
      '新增或替换 workspace Command catalog definition；不会修改 Project requirements 或安装 binary。',
    ],
    'commands remove': [
      'Usage: buildr commands remove <id> [--target <dir>] [--collection <path>]',
      '',
      '删除 workspace Command catalog definition；最后一个 definition 仍被 workspace default 或 Project requirement 引用时整次零写入。',
    ],
    'commands check': [
      'Usage: buildr commands check [--project <project> ...] [--target <dir>] [--json]',
      '',
      '不传 --project 时只检查 workspace defaults；重复 --project 可表达跨 Project task context。',
      'Project requirements 维护在 projects/<project>/commands.yml，只允许 id、required、version 和 purpose 引用字段。',
      '输出分离 catalog、requirements、effectiveConstraints、observations 和 findings；Buildr 不 render 或安装 Commands。',
    ],
    'openspec baseline create': [
      'Usage: buildr openspec baseline create <change> --project <project> [--target <dir>] [--adopt-current] [--update] [--json]',
      '',
      '弃用兼容入口：为旧 workflow 创建 Requirement 契约基线；新 Task Finish 使用 openspec converge。',
    ],
    'openspec check': [
      'Usage: buildr openspec check <change> --stage <proposal|pre-sync|post-sync> --project <project> [--target <dir>] [--json]',
      '',
      '弃用兼容入口：检查旧 proposal、基线和阶段结果；新 Task Finish 使用 openspec converge。',
    ],
    'openspec converge': [
      'Usage: buildr openspec converge <change> --project <project> [--target <dir>] [--json]',
      '',
      '产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。',
    ],
    'openspec audit': [
      'Usage: buildr openspec audit <change> --project <project> [--target <dir>] [--json]',
      '',
      '只读比较唯一收敛回执的 before/expected 与当前实际摘要；不会写 canonical、回执或归档。',
    ],
    'component list': [
      'Usage: buildr component list [--target <dir>] [--json]',
      '',
      '列出 workspace Components。当前不支持 Project 或 Service scope。',
    ],
    'component check': [
      'Usage: buildr component check [<id>] [--target <dir>] [--json]',
      '',
      '检查 Component definition、成员 integrity 和唯一所有权。',
    ],
    'component install': [
      `Usage: buildr component install <id> --agent <${SUPPORTED_AGENT_IDS.join('|')}> [--target <dir>]`,
      '',
      '安装 workspace Component，reconcile 指定 Agent runtime，并运行 doctor。',
    ],
    'component uninstall': [
      `Usage: buildr component uninstall <id> --agent <${SUPPORTED_AGENT_IDS.join('|')}> [--target <dir>] [--reason <text>]`,
      '',
      '卸载 workspace Component 及其受管源资产；不会卸载外部 CLI，也不会删除 Project 内容。',
    ],
    'rules add': [
      'Usage: buildr rules add <id> [--path <rules/file.md>] --description <text> [--target <dir>] [--replace]',
      '',
      '注册已存在的 root Rule 文件到 rules/manifest.yml。未传 --path 时默认使用 rules/<id>.md。',
    ],
    'rules remove': [
      'Usage: buildr rules remove <id> [--target <dir>] [--keep-file]',
      '',
      '删除 root Rule 登记和规则文件。传入 --keep-file 时只取消注册并保留文件。',
    ],
    'builtin list': [
      'Usage: buildr builtin list [--target <dir>] [--json]',
      '',
      '列出 Buildr 内置能力状态。',
    ],
    'builtin uninstall': [
      'Usage: buildr builtin uninstall <id> --target <dir> [--reason <text>]',
      '',
      '卸载 optional Buildr 内置能力。required 内置能力不能卸载。',
    ],
    'builtin restore': [
      'Usage: buildr builtin restore <id> --target <dir>',
      '',
      '恢复 optional Buildr 内置能力；该命令表示明确放弃此 Builtin 的本地修改。',
      '当当前 Builtin 声明 predecessor 时，只接管 manifest 可证明为 Buildr-managed 的旧 identity；随后运行 sync 收敛 Agent runtime。',
    ],
    update: [
      'Usage: buildr update [--json]',
      '',
      '根据当前命令来源更新 Buildr CLI 自身；不读取或同步 workspace。',
      '同步 workspace 请使用 buildr sync <agent> --target <dir>。',
    ],
    'update check': [
      'Usage: buildr update check [--json]',
      '',
      '检查 Buildr CLI 来源、远端版本和安全更新状态；不读取 workspace。',
    ],
    'package check': [
      'Usage: buildr package check',
      '',
      '供 Buildr 产品维护者检查产品包发布边界和基础行为；不是 workspace onboarding 必需步骤。',
    ],
    'package build': [
      'Usage: buildr package build [--out <dir>]',
      '',
      '供 Buildr 产品维护者构建产品包文件；不是 workspace onboarding 必需步骤。',
    ],
    'bootstrap guide': [
      'Usage: buildr bootstrap guide',
      '',
      '输出最小 bootstrap 指南。',
    ],
  };

  const finishHelp = {
    inspect: { usage: 'Usage: buildr task finish inspect --run <id> [--target <canonical-workspace>] [--detail <compact|full>] [--json]', required: '--run。', exclusive: '无。', surface: 'canonical Workspace 中的 durable finish run，只读。', effects: '无；返回五阶段状态、具体 primaryFailure、恢复令牌和效率指标。' },
    run: { usage: 'Usage: buildr task finish run --task <task-id> --project <code> [--change <id>] [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--required-assurance <affected|candidate>] [--verification-summary <file>] [--run <id> --resume <token>] [--target <canonical-workspace>] [--detail <compact|full>] [--json]', required: '首次运行需要 --task、--project 与 ready Task Environment；--change 只对 Change 候选必需，省略时创建 code-only 候选；target branch 默认来自 Git provider start point。', exclusive: '--resume 只接受产品为当前 blocked run 生成的令牌。', surface: 'Task Environment 执行根、retained canonical Workspace 与声明的 remote。', effects: '产品顺序执行 preflight、prepare、verify、deliver；完成交付后只向 Environment 提交 delivery identity/cleanup eligibility，并消费其 cleanup result。' },
  };
  for (const [action, help] of Object.entries(finishHelp)) HELP_TOPICS[`task finish ${action}`] = [
    help.usage,
    '',
    `必需参数：${help.required}`,
    `互斥参数：${help.exclusive}`,
    `Execution surface：${help.surface}`,
    `安全副作用：${help.effects}`,
    '新协议不接受 caller evidence、fingerprint、execution plan、repair authorization 或手写 recovery manifest；新客户端不读取、转换或处理旧协议状态。',
  ];

  function commandTopic(rawArgs) {
    const [domain, action, runtime] = rawArgs.filter((arg) => !['--help', '-h'].includes(arg));
    if (!domain) return 'root';
    if (domain === 'version') return 'version';
    if (domain === 'project' && action === 'create') return 'project create';
    if (domain === 'service' && action === 'create') return 'service create';
    if (domain === 'task' && !action) return 'task';
    if (domain === 'task' && ['create', 'inspect', 'update', 'complete', 'abandon'].includes(action)) return `task ${action}`;
    if (domain === 'task' && action === 'review' && !runtime) return 'task review';
    if (domain === 'task' && action === 'review' && ['inspect', 'record'].includes(runtime)) return `task review ${runtime}`;
    if (domain === 'task' && action === 'environment' && !runtime) return 'task environment';
    if (domain === 'task' && action === 'environment' && ['prepare', 'inspect', 'cleanup'].includes(runtime)) return `task environment ${runtime}`;
    if (domain === 'worktree' && action === 'create') return 'worktree create';
    if (domain === 'worktree' && action === 'cleanup') return 'worktree cleanup';
    if (domain === 'worktree' && action === 'inspect') return 'worktree inspect';
    if (domain === 'verification' && action === 'run') return 'verification run';
    if (domain === 'verification' && action === 'cleanup') return 'verification cleanup';
    if (domain === 'task' && action === 'finish' && Object.hasOwn(finishHelp, runtime)) return `task finish ${runtime}`;
    if (domain === 'runtime' && action === 'list') return 'runtime list';
    if (domain === 'mutation' && action === 'recover') return 'mutation recover';
    if (domain === 'runtime' && action === 'check') return 'runtime check';
    if (domain === 'skill' && action === 'install') return 'skill install';
    if (domain === 'skills' && ['add', 'remove', 'bind', 'unbind', 'migrate-project-assets'].includes(action)) return `skills ${action}`;
    if (domain === 'skills' && action === 'render') return 'skills render';
    if (domain === 'commands' && ['add', 'remove', 'check'].includes(action)) return `commands ${action}`;
    if (domain === 'openspec' && action === 'baseline' && runtime === 'create') return 'openspec baseline create';
    if (domain === 'openspec' && action === 'check') return 'openspec check';
    if (domain === 'openspec' && ['converge', 'audit'].includes(action)) return `openspec ${action}`;
    if (domain === 'component' && ['list', 'check', 'install', 'uninstall'].includes(action)) return `component ${action}`;
    if (domain === 'rules' && ['add', 'remove'].includes(action)) return `rules ${action}`;
    if (domain === 'builtin' && ['list', 'uninstall', 'restore'].includes(action)) return `builtin ${action}`;
    if (domain === 'update' && action === 'check') return 'update check';
    if (domain === 'update') return 'update';
    if (domain === 'package' && ['check', 'build'].includes(action)) return `package ${action}`;
    if (domain === 'bootstrap' && action === 'guide') return 'bootstrap guide';
    if (domain === 'render') return 'render';
    if (domain === 'sync') return 'sync';
    if (domain === 'doctor') return 'doctor';
    if (domain === 'app' && action === 'preview' && ['start', 'list', 'stop'].includes(runtime)) return `app preview ${runtime}`;
    if (domain === 'app' && action === 'preview') return 'app preview';
    if (domain === 'app') return 'app';
    if (domain === 'init') return 'init';
    if (domain === 'rules' && action === 'render') {
      return 'rules render';
    }
    return null;
  }

  HELP_TOPICS['rules render'] = [
    `Usage: buildr rules render <${RULES_RENDER_AGENT_IDS.join('|')}> --scope <.|projects/project[/services/service[/path...]]> --target <dir>`,
    '',
    '递归发现 canonical workspace scope 的祖先链和子树，并按 adapter reconcile rules bridge 或 vendor rule files。原生消费 AGENTS.md 的 adapter 不执行 rules render。',
  ];

  function printHelp(rawArgs) {
    const topic = commandTopic(rawArgs);
    if (!topic) return false;
    const lines = HELP_TOPICS[topic];
    console.log(lines.join('\n'));
    return true;
  }

  function isHelpRequest(rawArgs) {
    return rawArgs.length === 0 || rawArgs.some((arg) => arg === '--help' || arg === '-h') || rawArgs[0] === 'help';
  }

  Object.assign(runtime, { usage, commandTopic, printHelp, isHelpRequest });
  return runtime;
}
