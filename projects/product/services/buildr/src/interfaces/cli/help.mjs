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
    console.error(`  buildr worktree create <task-id> --agent <${runtimeIds}> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]`);
    console.error(`  buildr worktree cleanup <task-id> --agent <${runtimeIds}> --integrated-ref <selector>=<ref> ... [--target <workspace>] [--json]`);
    console.error('  buildr worktree inspect <task-id> [--target <workspace>] [--json]');
    console.error('  buildr worktree context [--target <path>] [--json]');
    console.error('  buildr worktree adopt --agent <agent> --session-root <path> --session-handle <id> --root-evidence-source <host-context|runtime-host> --mode <new-session|reentered|reload> --started-at <iso-time> [--target <path>] [--json]');
    console.error('  buildr task finish <actions|inspect|advance|resume|renew|run|recover|cleanup-prepare|cleanup-finalize> [--run <id>] [--task <id> --change <id> --target-branch <branch>] [--action-context <json>] [--fingerprint <step>=<value> ...] [--execution-plan <json> | --execution-plans <json>] [--recovery <json>] [--repair-authorization <json>] [--ref-transition <json>] [--detail <compact|full>] [--json]');
    console.error('  buildr openspec <sync-plan|sync-apply|converge> <change> --project <project> [--target <workspace>] [--json]');
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
      '  app preview          为 task worktree 启动、查看或停止隔离的开发预览。',
      '  app launcher         安装、检查或卸载当前平台的 Buildr launcher。',
      '  version              输出当前 Buildr CLI package version；支持 --json。',
      '  project create       创建或登记 Project。',
      '  service create       创建或登记 Service。',
      '  worktree create      创建或复用单仓或多仓 canonical task environment。',
      '  worktree cleanup     按 receipt、owner 和 integrated ref 安全清理本地任务环境。',
      '  worktree inspect     检查 task environment 的仓库集合、身份和隔离边界。',
      '  worktree context     判断当前路径是否属于可执行的 task environment。',
      '  worktree adopt       核验并记录 Agent session 对 task environment runtime 的采用证据。',
      '  task finish          持久化检查、推进或恢复可重入的任务收尾 run。',
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
      '  openspec baseline/check  供 Buildr OpenSpec workflow 管理契约基线与同步门禁。',
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
      'task worktree 的并行验收使用 app preview；每个 preview 具有独立状态和 loopback URL，不会改变默认应用或 Buildr Dev.app。',
    ],
    'app preview start': [
      'Usage: buildr app preview start <instance> [--target <workspace>] [--port <port>] [--no-open] [--json]',
      '',
      '从当前 task worktree 启动或复用独立的 Buildr 开发预览。输出实例名、URL、worktree、分支、HEAD 与 dirty 身份，供 Agent 交接验收链接。',
      '实例名不能被其他 worktree 的健康预览接管；该命令不会安装、替换或停止 Buildr Dev.app、全局开发 CLI 或默认本机应用。',
    ],
    'app preview': [
      'Usage: buildr app preview <start|list|stop> ...',
      '',
      'task worktree 的开发预览以实例名隔离本地状态与 loopback URL；使用 start 获取验收链接，使用 list 查看归属，使用 stop 只停止指定实例。',
    ],
    'app preview list': [
      'Usage: buildr app preview list [--json]',
      '',
      '列出 Buildr 管理的开发预览及其 owner、URL、PID 与健康状态；不会扫描或管理其他系统进程。',
    ],
    'app preview stop': [
      'Usage: buildr app preview stop <instance> [--json]',
      '',
      '使用该 preview 的实例 secret 安全停止它，或仅清理其陈旧记录；不会停止默认本机应用或其他 preview。',
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
    'worktree create': [
      `Usage: buildr worktree create <task-id> --agent <${SUPPORTED_AGENT_IDS.join('|')}> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]`,
      '',
      '默认只包含 Workspace 根仓库；重复 --include 可显式加入独立 Git Project 或 Service，并按 canonical source.path 嵌套到同一环境根。',
      '全部仓库在写入前统一预检；registry、路径、remote、branch 或 worktree identity 冲突都会 fail closed。部分创建失败时保留现场并记录 receipt。',
      '新建根 checkout 一定运行 doctor；仅当 actionable findings 都是当前 Agent runtime stale、checkout clean 且 identity 未变化时自动 sync，并以最终 doctor 收敛。',
      '复用同一 repository set/branch 的既有环境时返回 reused，不重复 doctor 或 sync。',
      'working tree/index 可隔离；Git objects/refs 仍共享。外部依赖沿用 Project 既有环境；只有多个任务会修改同一共享状态时才需要既有租户、账号、数据前缀、串行化或显式授权边界。',
      '该命令不承担任务理解、OpenSpec 选择、merge、rebase、push 或 cleanup policy。',
    ],
    'worktree cleanup': [
      `Usage: buildr worktree cleanup <task-id> --agent <${SUPPORTED_AGENT_IDS.join('|')}> --integrated-ref <selector>=<ref> ... [--target <workspace>] [--json]`,
      '',
      '根据 task environment receipt 在写入前统一核对 owner、全部成员 checkout/branch/clean identity，以及每仓任务 HEAD 已被声明的 integrated ref 包含。',
      '每个 receipt repository selector 必须恰好提供一个 --integrated-ref；通过后按 nested-first 删除本地 worktree，再以精确旧 HEAD 删除已集成的本地任务分支和 receipts。',
      '该命令不停止 task-owned 进程、不删除远端分支、不强制删除 dirty checkout，也不授权放弃未集成提交；调用前必须先完成资源停止与集成。',
    ],
    'worktree inspect': [
      'Usage: buildr worktree inspect <task-id> [--target <workspace>] [--json]',
      '',
      '根据 receipt 检查全部成员仓库的 checkout、branch 和 identity；任一成员不匹配即 fail closed。',
    ],
    'worktree context': [
      'Usage: buildr worktree context [--target <path>] [--session-root <path>] [--session-handle <id>] [--json]',
      '',
      '判断明确 target/workdir 是否位于 task environment 的允许执行根内，并报告成员仓库、receipt-bound CLI、runtime projection、可选 activation evidence 和隔离边界。',
      'executionReady 由 environment binding 决定；Agent session root 不要求等于 environment root。',
    ],
    'worktree adopt': [
      'Usage: buildr worktree adopt --agent <agent> --session-root <path> --session-handle <id> --root-evidence-source <host-context|runtime-host> --mode <new-session|reentered|reload> --started-at <iso-time> [--target <path>] [--json]',
      '',
      '仅为 runtime 发现、加载或激活机制变更且专项验收明确要求时，记录 Agent/runtime host 提供的 activation evidence。普通 Rule/Skill 内容修改不需要。',
      'Buildr 直接核验 environment evidence；session evidence 标记为 agent-attested，不表示 Buildr 内省或密码学认证 Agent session。',
      '该 evidence 不参与普通 executionReady，也不表示 Buildr 能自动 reload、启动或 handoff Agent session。',
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
      '供 Buildr OpenSpec workflow 为 active change 显式创建或更新 Requirement 契约基线。不会安装或升级外部 OpenSpec CLI。',
    ],
    'openspec check': [
      'Usage: buildr openspec check <change> --stage <proposal|pre-sync|post-sync> --project <project> [--target <dir>] [--json]',
      '',
      '供 Buildr OpenSpec workflow 检查 proposal、基线、活动 change 冲突和同步结果。',
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

  function commandTopic(rawArgs) {
    const [domain, action, runtime] = rawArgs.filter((arg) => !['--help', '-h'].includes(arg));
    if (!domain) return 'root';
    if (domain === 'version') return 'version';
    if (domain === 'project' && action === 'create') return 'project create';
    if (domain === 'service' && action === 'create') return 'service create';
    if (domain === 'worktree' && action === 'create') return 'worktree create';
    if (domain === 'worktree' && action === 'cleanup') return 'worktree cleanup';
    if (domain === 'worktree' && action === 'inspect') return 'worktree inspect';
    if (domain === 'worktree' && action === 'context') return 'worktree context';
    if (domain === 'runtime' && action === 'list') return 'runtime list';
    if (domain === 'mutation' && action === 'recover') return 'mutation recover';
    if (domain === 'runtime' && action === 'check') return 'runtime check';
    if (domain === 'skill' && action === 'install') return 'skill install';
    if (domain === 'skills' && ['add', 'remove', 'bind', 'unbind', 'migrate-project-assets'].includes(action)) return `skills ${action}`;
    if (domain === 'skills' && action === 'render') return 'skills render';
    if (domain === 'commands' && ['add', 'remove', 'check'].includes(action)) return `commands ${action}`;
    if (domain === 'openspec' && action === 'baseline' && runtime === 'create') return 'openspec baseline create';
    if (domain === 'openspec' && action === 'check') return 'openspec check';
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
