# Buildr CLI Reference

本文列出 Buildr 0.1.x 的公开命令和稳定用途。以 `buildr <topic> --help` / `buildr help <topic>`、`buildr runtime list --json` 和 `buildr doctor --agent <agent> --json` 的当前输出为最终参数事实。

支持 `--json` 的命令在顶层输出 `schemaVersion`。该字段及兼容规则见 [公开 JSON 契约](json-contracts.md)；消费者应按 schema identity 判断格式，而不是依赖未声明的内部实现。

根帮助从同一 command catalog 按四层显示：`primary` 是普通工作主路径，`agent-machine` 是 Agent/Skill 依赖的稳定机器接口，`maintenance` 是产品构建、开发预览和 workflow，`legacy` 是兼容窗口内仍保留且带 replacement 的入口。Surface 不是授权边界；每个 retained executable route 都可通过 canonical topic 查询帮助。

## CLI identity、帮助与错误

- `buildr --version`、`buildr -V` 和 `buildr version` 输出当前实际执行 package 的版本；`buildr version --json` 输出 `buildr.version/v1`。
- `buildr help <command...>` 与 `buildr <command...> --help` / `-h` 使用同一 canonical 帮助主题。
- 未知命令默认向 stderr 输出简洁错误、有限建议和 `buildr --help` 提示，并以 2 退出；携带 `--json` 时 stdout 只输出 `buildr.cli-error/v1`，stderr 为空。
- `-v` 不作为版本别名，为未来 verbose 语义保留；本 change 不提供 Shell completion。

## 首次使用

以下命令由智能体（Agent）执行，或供选择手动操作的人参考。先检查已有安装，并使用满足安装包 `engines.node` 要求的 Node.js；已有工作内容应保留，不重复初始化或擅自覆盖。

### 安装 Buildr

首次安装从 npm 官方仓库获取 `@buildr-ai/buildr`，可用版本与 `next` 指向以该仓库为准：

```bash
npm install --global @buildr-ai/buildr@next
buildr --version
buildr installation status --json
buildr bootstrap guide
```

安装包包含命令行工具（CLI）与 Buildr Web。用户明确需要 macOS 或 Windows 的本机图形入口时，再安装 Buildr Web 启动器（Launcher），将其绑定到同一 npm 安装：

```bash
buildr web launcher install
```

其他平台通过下文的 `buildr web --target "<dir>"` 打开 Buildr Web。

全局安装与启动器（Launcher）不会向尚未确认的工作空间（Workspace）写入内容，也不会安装智能体（Agent）的技能（Skill）；这些在确认目录并初始化时完成。

### 确认目录并初始化

安装后读取 `buildr bootstrap guide` 的当前说明，向用户确认目标目录；用户也可以在智能体（Agent）工具中打开目录后要求初始化。核对当前智能体（Agent）的身份与支持情况：

```bash
buildr runtime list --json
```

将下面的占位内容替换为已确认的值；`<agent>` 使用当前工具对应的标识，`<profile>` 选择 `personal`、`team` 或 `company`，`<dir>` 是工作空间（Workspace）根目录：

```bash
buildr init --agent "<agent>" --target "<dir>" --name "<name>" --description "<description>" --profile "<profile>"
```

`init --agent` 会先初始化源资产，再复用完整 `sync`，为当前智能体（Agent）安装或更新 Buildr 技能（Skill）、投射当前工作空间（Workspace）的内容，并给出最终诊断。根据实际结果确认准备状态，再引导用户维护项目（Project）、按需关联服务（Service），开始第一项工作。`init` 与 `sync` 不隐式安装用户级技能（Skill）。

### 打开 Buildr Web

打开已初始化的工作空间（Workspace）：

```bash
buildr web --target "<dir>"
```

启动器（Launcher）的状态检查、修复或卸载使用 `buildr web launcher status|repair|uninstall`。

工具支持情况与使用注意事项见[运行时适配参考](agent-runtime-adapters.md)。

### 后续维护

已有安装与工作空间（Workspace）的更新，按当前 Buildr 技能（Skill）处理。更新产品与更新工作空间（Workspace）是不同动作，不能以其中一项代替另一项；不要自行切换已选版本轨道或降级。

Skill 文件仍写入目标 Agent 的原生 Skills root。Buildr 为这些文件保存的所有权回执属于 `.buildr/agent-runtime/<workspace|user>/<adapter>/skill-projection-ownership-receipts/` 本机控制状态，并由 `init`、`sync`、`skills render` 和 Doctor 统一维护；`/.buildr/agent-runtime/` 默认忽略 Git。旧 runtime-root 回执只作为一次性迁移输入，有效且能证明当前文件时自动迁移，冲突或漂移时零写入停止。

`buildr update` 只更新安装回执（Installation Receipt）证明的当前 npm 安装或开发检出（Development Checkout）：前者更新同一安装位置中的软件包，后者按 Git 状态更新源码；来源不明时停止。它不接收 `--target`，不负责同步工作空间（Workspace）。

用户要求“更新工作空间”或“同步工作空间”时，智能体（Agent）先判断根目录是否由 Git 管理：受 Git 管理时，按 `buildr.git-operations/v1` 能力绑定（Capability Binding）选择提供者（Provider），明确目标目录、上游和更新动作，成功后执行 `buildr sync <agent> --target <workspace>`；不受 Git 管理时直接同步。所需提供者（Provider）不可用，或遇到本地改动、分叉、冲突等需要决定的情况时，停止相关更新与同步并保留现场，不自动执行 `stash`、`reset`、`rebase`、`merge` 或覆盖文件。Git 更新成功后不重复询问同步。

`buildr sync` 同步当前本地工作空间（Workspace）的产品源能力，安装产品入口技能（Skill），投射当前智能体运行时（Agent Runtime）并执行最终诊断（Doctor）；它不隐式更新 Git 或 Buildr 产品安装。

## Workspace 与资产

`buildr assets project-candidates --target <workspace> --json` 只读列出 `projects/` 内尚未登记的直接子目录及目录观察版本。使用 `buildr assets register project --target <workspace> --input <json-file> --json` 登记选择结果；输入包含 `revision`、`code`、`name`、`observation`，可选 `description` 和 `serviceIds`。写入重验清单与目录身份，只保存登记和明确选择的服务，不补写目录文件，也不自动恢复已移除项目的身份和历史关系。

`buildr assets service-candidates` 与 `repository-candidates` 分别列出服务目录和真实代码库根的未登记候选。服务创建输入可用 `directoryMode: existing`、`directoryPath`、`directoryObservation` 登记原目录，或 `directoryMode: create`、`projectCode` 在项目 services/ 下新建；旧 repositoryId/modulePath 输入保持兼容。代码库候选用 path/observation 提交。

`buildr assets remove <project|service|repository> <id> --target <workspace> --input <json-file> --json` 只取消登记，保留文件；代码库仍被服务引用时拒绝移除。旧 `assets delete` 是相同的兼容入口，不删除文件。`skills remove` 同样保留源目录；组件成员沿既有组件维护边界处理。

| 命令 | 用途 |
|---|---|
| `buildr init [--agent <agent>]` | 初始化工作空间（Workspace）源资产；传入 `--agent` 时继续完整同步，安装产品入口技能（Skill）、投射智能体运行时（Agent Runtime）并执行最终诊断（Doctor）。 |
| `buildr web [--target <workspace>] [--no-open]` | 启动或复用只监听 `127.0.0.1` 的默认本机 Web 应用；默认打开浏览器，登记和切换多个 Workspace，`--target` 登记并打开指定 Workspace。 |
| `buildr web preview start|list|stop` | 启动、查看或停止隔离的开发预览。带 `--task <task-id> --target <canonical-workspace>` 时，Preview使用matching Task Worktree并保存精确owner；停止时复核Worktree evidence与进程secret。不带Task时保持独立checkout preview。 |
| `buildr installation status [--json]` | 分别报告receipt证明的npm CLI、Buildr Web Launcher、Buildr Web Dev、当前安装与当前Web实例的版本、路径、runtime role、protocol、payload和ownership identity；不扫描PATH。 |
| `buildr web launcher install/status/repair/uninstall` | 从verified formal npm安装显式创建、诊断、修复或卸载本机Buildr Web Launcher；wrapper只执行binding中的Host Node和同一package entry。Development checkout使用隔离的Buildr Web Dev入口。 |
| `buildr project create <code>` | 创建或登记 Project；`--name`/`--description` 设置 metadata，`--repo`、`--remote`、`--integration-branch` 声明独立 Git source，并补齐空 `commands.yml` requirement context。 |
| `buildr project daily-progress record\|inspect\|list --project <code>` | Agent-machine 本机每日演进。`record` 把已构造的四问摘要、提交与变更文件写入 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`；Task 关联可选，他人提交禁止挂 Task，存在的 Task ID 仍须本机已有。`inspect`/`list` 只读。JSON 使用 `buildr.project-daily-progress-*-result/v1`。不进入 Git 或 Task SQLite，读取路径不扫描 Git，也不提供定时调度。 |
| `buildr service create <project>/<service> <repo-ref>` | 接入本地目录或 Git Service；用 `--name`、`--description`、`--type` 描述 Domain，Git 来源可用 `--remote`、`--integration-branch` 声明稳定来源。 |
| `buildr worktree create\|inspect\|cleanup <task-id>` | 窄Git worktree provider。`create`接受branch/start point与显式Project/Service selectors；`inspect`复核checkout/branch/HEAD/clean/registration；`cleanup`要求每仓成对提供expected source与delivered完整提交。它不判断Task完成，也不准备Runtime、CLI、依赖、projection或动态资源。 |
| `buildr project verification inspect|validate|update` | 读取、校验或按expected identity更新Project测试地图。候选由Agent从真实测试、构建脚本、CI和说明形成，Application不生成内容。 |
| `buildr task verification record|inspect` | 保存或读取开发完成后的Task验证报告。Agent直接调用项目测试工具；Buildr不生成计划或代跑测试。 |
| `buildr task create\|inspect\|update\|activate\|complete\|abandon` | 在canonical Workspace的SQLite中维护Task Record v3。除`create`外的写动作都必须提交刚观察到的`--expected-record <digest>`。完成只保存真实结果摘要，不保存`noChange`、Git、验证、环境或发布事实。终态Task可通过`update`登记固定本机复盘文档或显式更正业务事实。 |
| `buildr task work-context inspect\|record\|respond <task-id>` | 独立工作摘要与显式待处理事项。`record` 使用 `--expected-current <absent\|digest>`、`--progress`、`--next-step`；可明确登记或清除事项。`respond` 以当前版本、事项身份和真实用户意见保存答复，不改变任务状态或完成结果。 |
| `buildr task parent inspect` | 只读查看整体目标、真实子任务及结果、完成观察身份和历史父计划。旧 record、reconcile、bind-child、refresh-planning、reconcile-child-delivery、accept 写入口已退役。父任务通过已有 task complete 提交当前版本、验收和明确用户授权。 |
| `buildr task verification inspect\|record <task-id>` | 读取或整值保存Workspace SQLite中的current任务验证报告。`record --report <json-file>`接收Agent在开发完成后形成的实际检查、选择范围、目标、结果、未覆盖项和结论；`inspect`可带当前内容identity判断报告是否仍适用。命令不生成计划、不执行测试、不绑定Candidate。 |
| `buildr rules add/remove` | 维护 root Rules manifest 和文件生命周期。 |
| `buildr skills add/remove` | 只维护 workspace `skills/` 中的 Skill source；旧 `--scope .` 仅兼容并警告，Project scope 被拒绝。 |
| `buildr skills bind/unbind` | 维护 workspace 默认 binding，或在 `projects/<project>/capabilities.yml` 维护 Project context binding。 |
| `buildr skills render <agent> --destination workspace\|user` | 从 `--target <workspace>` 读取 source，显式投射到当前工作目录或个人用户层；默认 workspace。 |
| `buildr commands add/remove` | 维护 workspace Command catalog definitions；最后一个 definition 仍被 requirement 引用时零写入。 |
| `buildr commands check [--project <project> ...]` | 按显式 Project task context 合并 requirements 并观察本机环境；无 Project 时只检查 workspace defaults。 |
| `buildr component list/check/install/uninstall` | 管理 workspace 级 Rules、Skills、Command collections 与声明式 Skill Contribution。 |
| `buildr builtin list/uninstall/restore` | 查看或维护 Buildr 内置能力；required 能力不能卸载。`restore` 表示明确放弃该 Builtin 的本地修改；replacement 只接管可证明为 Buildr-managed 的 predecessor，恢复 source 后再运行 `sync <agent>` 收敛 runtime。 |
| `buildr update [check]` | 按安装回执（Installation Receipt）检查或更新当前 npm 安装或开发检出（Development Checkout）；不负责工作空间（Workspace）同步。 |

新 Workspace 使用 `.buildr/workspace.yml` 的 `buildr.workspace/v1` schema，并与 `skills/manifest.yml.workspaceId` 共享同一 UUID。旧 metadata 可以在 `buildr web` 中只读查看；`buildr sync <agent>` 通过同一 source transaction 显式迁移两份 Manifest，identity 冲突时零写入失败。页面修改使用 revision compare-and-swap，不自动覆盖 Agent、Git 或编辑器已经产生的外部变化。

Task Record 使用closed `buildr.task-record/v3` schema。顶层状态为`todo|active|completed|abandoned`，查询态`open`派生为todo + active。可选`retrospective`只保存本机Markdown的SHA-256与`pending-decision|decided`；不保存正文、处置说明或后续Task关系。只保存Child的`parentTaskId`，反向Children由查询派生；`isParent`保存明确父任务身份。所有非创建写动作都比较当前`recordDigest`。

工作台（Workbench）默认展示工作概览，并提供任务（Task）与动态入口；文章位于工作空间（Workspace）区域。最近进展、下一步和显式待处理事项由独立工作摘要维护，人的答复按事项身份和已观察版本保护。置顶、接下来、关注、收藏和最近访问是本机偏好，与任务四态独立；查看概览不扫描 Git 或自动生成每日演进。旧任务深链继续可用。

Task Record、Task Verification与Planning/Completion Review以`.buildr/local/workspace.sqlite`作为单机持久化authority。复盘正文保存在被Git忽略的`.buildr/local/task-retrospectives/`，SQLite只保留Task上的文档摘要和决定状态。旧复盘current/source表、研发、旧收尾和统一Task Environment current表已删除，不建立history或双读。

默认 App 的用户级登记文件只保存规范化 Workspace root 和最近使用项；Workspace 名称、说明、Project、Service 与全局 Change 列表始终从 retained Workspace 实时读取。Task详情固定为“概览、原型、证据”三个一级视图；概览包含本机复盘文档轻量卡片，证据分别调用Review/Verification reader。页面没有独立复盘工作台、研发页签或旧机器交付历史。

Project registry 使用 `buildr.projects/v2`：每个 Project 保存 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`。`source.path` 是文件系统物化位置；Git source 另外保存 URL、remote 和稳定的 `integrationBranch`。`currentBranch`、HEAD、dirty、upstream 与 ahead/behind 是实时观察状态，不写入 Domain。v1 registry 可只读查询，`buildr sync <agent>` 显式迁移；页面不会静默迁移、切分支、stash 或改写 remote。

`service create --integration-branch` 只适用于 Git 来源，`--branch` 仅为兼容别名。Canonical Service Domain 保存 UUID `id`、`workspaceId`、`projectId`、`code`、`name`、`description`、`type` 和 `source`；`source.path` 定位文件系统中的实际 Service，Git source 保存 URL、remote 与稳定 integration branch。当前分支、HEAD、dirty、upstream 与 ahead/behind 只实时观察，不写回 Domain。

Project根可选`preparation.yml`，长期说明Project-wide或Service-scoped真实准备入口。Agent只在当前动作需要时，从matching Project或Service根直接调用对应wrapper；没有额外准备的Project无需声明空步骤。Buildr不生成Task Plan、不保存选择和执行结果，也不把局部准备失败扩大为统一工作许可。

`project create`、`service create`及Buildr Web对应Agent prompt会返回`declaration-intake` next action；首次Task prompt、准备入口缺口与Verification coverage gap也使用同一入口。该入口只让Agent检查`preparation.yml`/`verification.yml`候选或diff，注册事务和所有GET/inspect都不写声明。用户确认精确长期变更后，Agent直接维护Project拥有的准备入口；`task-verification`继续维护验证声明。

Git provider evidence使用`buildr.git-worktree-evidence/v1`，保存在Git common-dir的`buildr/task-worktrees/<task-id>.json`。它只包含repository selector、source/checkout、branch/start point、HEAD、clean、registration、remote和Git effects。成果交付后，Agent把已核对的逐仓source与delivered完整提交直接交给provider；provider复核source版本、dirty、registration和retained ref后才删除。provider不删除远端分支，也不执行交付或验证判断。

## Runtime 与诊断

| 命令 | 用途 |
|---|---|
| `buildr runtime list` | 查看 supported adapters、capabilities 和推荐命令。 |
| `buildr doctor` | 只读检查工作空间（Workspace）资产、当前产品安装、智能体运行时（Agent Runtime）投射及已声明的外部命令（Command），报告问题与修复建议。 |
| `buildr render <agent>` | 组合投射 Rules entry 与 workspace Skills 到 workspace destination，不安装产品入口 Skill。 |
| `buildr sync <agent>` | 同步本地工作空间（Workspace）的产品源能力，安装产品入口技能（Skill）、投射智能体运行时（Agent Runtime）并执行最终诊断（Doctor）。 |
| `buildr runtime check <agent>` | 专项比较某个 scope 的 runtime 期望状态。 |
| `buildr skill install <agent>` | 只安装产品入口 Buildr Skill。 |
| `buildr mutation recover <id>` | 从完整 transaction journal/backup 恢复未完成 source mutation。 |

`doctor` 的 `ok` 为兼容字段，只表示没有 error，不表示 workspace 已无需处理。Agent 应同时读取 `health.workspaceValid`、`health.ready`、`health.actionRequired` 和 `repairPlan`：例如只有 actionable warning 时，结果可以是 `ok: true` 但 `ready: false`。canonical workspace identity 要求根 `AGENTS.md`、`.buildr/workspace.yml` 和 `projects/` 同时存在；只存在其中一部分时报告 `incomplete`，不会误判为已初始化。

默认 doctor 分三层声明诊断边界：`core` 每次检查 workspace identity、mutation recovery 和 root registries；`conditional` 只在相关 scope、资产或 selected Agent 适用时检查 Project/Service、Rules/Skills、package assets、Commands 与 runtime；`specialty` 是显式场景。对已声明的独立 Git Project，doctor 会比较 remote、`integrationBranch` 和本地实时状态，但不会执行 Git 修改；它不深检 OpenSpec active change，也不运行 build/test。需要更多细节时进入对应 Git、OpenSpec、验证工作流。

当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`。其他 runtime 不使用 fallback adapter；各 adapter 的文件路径、刷新方式和证据状态见 [Agent Runtime Adapters](agent-runtime-adapters.md)。

## Commands 三层模型

- workspace `commands/manifest.yml` 与 `commands/**/manifest.yml` 是唯一 catalog definition source，保存 `id`、`executable`、version probe 和最小 `installHint`。
- `projects/<project>/commands.yml` 使用 `buildr.project-commands/v1`，只保存 `id`、required/optional、可选版本约束和用途；它不复制 definition。
- `commands check` 的 `catalog`、`requirements`、`effectiveConstraints`、`observations` 和 `findings` 分别表达源定义、业务要求、合并结果、本机观察和诊断。重复 `--project` 表达跨 Project task context；不兼容版本约束在 probe 前以 `command_requirement_conflict` 失败。

Buildr 不 render 或安装 Commands，不保存 binary、token、cookie、登录态、license 或个人配置。machine warning 只说明当前环境与有效 requirement 的差异；安装、升级或登录仍需要用户单独授权。

## Project 测试能力声明

`projects/<project>/verification.yml` 只接受closed `buildr.project-verification/v4`测试地图。每项testing family声明稳定id、Project/Service scope、purpose、sourcePaths、testRoots、完整command或Agent入口、选择指导与requirements，不列举具体测试文件，也不保存一次性计划或运行结果。

Task Verification Skill指导Agent在开发中直接调用Maven、npm、Playwright、Browser、HTTP或Project自有runner；开发完成后扩大到任务相关功能测试和受影响Service完整低成本回归，并将有意义报告通过Application保存。测试失败先修复或如实报告，不生成统一流程状态。

没有声明或没有适用能力时，doctor 不产生 finding，Task Verification 在具体 Result 中报告 coverage gap，不自动开发测试。文件存在时 doctor 只做 closed schema、路径、scope 与资源引用校验，不运行命令或探测测试环境。用户通过 Agent 说“初始化测试声明”或“更新测试声明”时，Agent 只从真实 build scripts、CI、文档和已有测试发现候选，并由用户确认 Project policy。

current Task报告使用`buildr.task-verification-report/v1`，绑定Task scope、Agent提交的实际内容版本和current Project测试地图identity，保存实际checks、选择范围、targets、结果、gaps与结论。Task Verification Application只提供`record|inspect`并整体替换current报告；`inspect`按调用方内容identity与current测试地图派生`current|stale|unknown`。它不创建Execution Record，不保存stdout/stderr或临时路径，也不决定Task完成或交付。

## Skill capability contracts

`buildr.skills/v3` 为每个 workspace Skill 保存稳定 `assetIdentity`/`sourceIdentity`，并支持 versioned contract、provider `provides`、consumer `requires` 和 workspace 默认 binding。Project context 使用 `buildr.project-capabilities/v1`。安装 provider 本身不会静默改绑。

Contract 格式、scope 规则、替换示例以及 `ready` 的边界见 [Skill Capability Contracts](skill-capability-contracts.md)。

## Product maintenance / workflow internal

- `buildr package check/build`：产品 package 维护和构建，不是普通 workspace 日常命令。
- `buildr openspec converge <change> --project <project> --target <actual-work-root> --json`：Buildr OpenSpec单一收敛事务；target是Agent已确认的当前Workspace或matching Worktree。内部检查相关变更冲突，使用锁定 OpenSpec 1.13.0 完成规范写入与归档，并保留必要的文件观察与中断恢复；仅恢复时已确认规范全部写入才使用`archive --skip-specs`，结果为`passed|blocked|recovery-unprovable`。
- `buildr openspec convergence inspect <change> --project <project> --target <workspace> --json`：只读检查仍存在的未决事务Receipt及before/expected/actual；active Change未开始或Change已归档时返回`not-applicable`。它不写canonical、Receipt或archive，也不用于环境清理后的长期审计。
- `openspec audit`、`openspec baseline create`、阶段型`openspec check`、`openspec sync-plan`与`openspec sync-apply`均已删除；旧调用返回标准unknown-command。
- `openspec baseline create`、阶段型 `openspec check`、`openspec sync-plan` 与 `openspec sync-apply` 均已删除；旧调用返回标准 unknown-command 且不会读取或写入旧 sidecar。标准规范解析、重建和正常写入由锁定上游负责，Buildr 不另行实现同一算法。
- `skills migrate-project-assets` 已删除。legacy Project Skill source 继续 fail closed，当前 Buildr 不复制、合并、改写或删除其 bytes；升级前需使用旧版本完成迁移，或人工审阅后整理到 workspace `skills/`。
- `buildr bootstrap guide`：产品 Skill 不可用时的纯文本兜底说明。

这些命令可执行，但不构成普通用户需要记忆的 public asset API。

## 内部实现边界

`bin/buildr.mjs` 是稳定 npm bin 路径，实际命令通过内部 `src/` runtime 和唯一 command registry 执行。该模块树随 tarball 发布以保证命令可运行，但不是公开 JavaScript API，不承诺文件级 import 兼容；维护约定见 [CLI 内部架构](cli-architecture.md)。

## 远端 Skill 请求

resolved `skill-url` 默认具有有限请求时间。维护者可设置：

- `BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS`
- `BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS`

值必须是 `1..120000` 的整数毫秒。生产环境建议为 resolved source 提供 `sha256-<hex>` integrity。

父任务使用 `task create --parent-task` 或 `task update --parent-task` 明确标记；`--parent <id>` 表示子任务归属。完成父任务时提供 `--expected-record <recordDigest>` 与 `--parent-completion <json-file>`，输入格式由随包 `task-manager` 说明。子任务完成不自动完成父任务。
