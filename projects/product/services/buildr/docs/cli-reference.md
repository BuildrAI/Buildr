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

```bash
buildr installation status --json
buildr runtime list --json
buildr init --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <workspace> --name <name> --description <description> --profile <personal|team|company>
```

用户要求Agent“安装Buildr”时，只从npm Registry安装`@buildr-ai/buildr`；它包含完整CLI与`buildr web`并使用满足`engines.node`的Host Node。普通安装默认不修改Applications或Start Menu；只有用户显式执行`buildr web launcher install`才创建绑定同一npm安装的本机图形入口。全局安装不写Agent runtime Skill；`init --agent`在目标Workspace首次投射Buildr Skill，`sync`/`render`负责后续收敛。

`init --agent` 是默认首次 onboarding 入口：它先初始化源资产，再复用完整 `sync` 执行 source update、产品 Buildr Skill 安装、workspace destination 投射和最终 doctor。`init`/`sync` 不隐式写用户级 Skills。

Skill 文件仍写入目标 Agent 的原生 Skills root。Buildr 为这些文件保存的所有权回执属于 `.buildr/agent-runtime/<workspace|user>/<adapter>/skill-projection-ownership-receipts/` 本机控制状态，并由 `init`、`sync`、`skills render` 和 Doctor 统一维护；`/.buildr/agent-runtime/` 默认忽略 Git。旧 runtime-root 回执只作为一次性迁移输入，有效且能证明当前文件时自动迁移，冲突或漂移时零写入停止。

`buildr update`只更新receipt证明的当前安装渠道：development checkout使用Git安全更新，npm使用同一package/prefix，platform只协调匹配架构、摘要与签名的完整installer；unknown来源fail closed。它不接收`--target`、不读取workspace，也不修改Workspace Node。用户要求“更新workspace”或“同步workspace”时，Agent先判断workspace root是否由Git管理：Git workspace解析 `buildr.git-operations/v1` binding，并向selected provider提供明确 workspace、upstream 和 update operation，成功后执行`buildr sync <agent> --target <workspace>`；非 Git workspace 直接 sync。required provider blocked或Git决策点会阻止后续sync，Agent 不自动 stash、reset、rebase、merge 或覆盖；Git更新成功后不重复询问 sync。`buildr sync`自身不隐式执行 Git 更新，只按`.buildr/workspace.yml`恢复Workspace Node与runtime assets，不更新Buildr产品渠道。

## Workspace 与资产

| 命令 | 用途 |
|---|---|
| `buildr init [--agent <agent>]` | 初始化 Organization/Root，写入当前受支持 CLI 的精确 Workspace Node version 并准备受管 runtime；传入 `--agent` 时一次完成 Agent runtime 与最终 doctor。 |
| `buildr web [--target <workspace>] [--no-open]` | 启动或复用只监听 `127.0.0.1` 的默认本机 Web 应用；默认打开浏览器，登记和切换多个 Workspace，`--target` 登记并打开指定 Workspace。 |
| `buildr web preview start|list|stop` | 启动、查看或停止隔离的开发预览。带 `--task <task-id> --target <canonical-workspace>` 时，Preview 使用 ready Task Environment 的任务验证工作区，健康后登记为动态资源，停止确认后释放；不带 Task 时保持独立 checkout preview。 |
| `buildr installation status [--json]` | 分别报告receipt证明的npm CLI、Buildr Web Launcher、Buildr Web Dev、当前安装与当前Web实例的版本、路径、runtime role、protocol、payload和ownership identity；不扫描PATH。 |
| `buildr web launcher install/status/repair/uninstall` | 从verified formal npm安装显式创建、诊断、修复或卸载本机Buildr Web Launcher；wrapper只执行binding中的Host Node和同一package entry。Development checkout使用隔离的Buildr Web Dev入口。 |
| `buildr project create <code>` | 创建或登记 Project；`--name`/`--description` 设置 metadata，`--repo`、`--remote`、`--integration-branch` 声明独立 Git source，并补齐空 `commands.yml` requirement context。 |
| `buildr project daily-progress record\|inspect\|list --project <code>` | Agent-machine 本机每日演进。`record` 把已构造的四问摘要、提交与变更文件写入 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`；Task 关联可选，他人提交禁止挂 Task，存在的 Task ID 仍须本机已有。`inspect`/`list` 只读。JSON 使用 `buildr.project-daily-progress-*-result/v1`。不进入 Git 或 Task SQLite，读取路径不扫描 Git，也不提供定时调度。 |
| `buildr service create <project>/<service> <repo-ref>` | 接入本地目录或 Git Service；用 `--name`、`--description`、`--type` 描述 Domain，Git 来源可用 `--remote`、`--integration-branch` 声明稳定来源。 |
| `buildr task environment plan record\|inspect <task-id>` | Agent登记或只读查看覆盖全部Task Service scope的Environment Preparation Plan；`record --input <json-file>`不执行Step。 |
| `buildr task environment prepare\|inspect\|cleanup <task-id>` | `prepare`必须带`--agent <adapter>`，可选`--plan <json-file>`幂等执行或恢复Plan；省略`--agent`失败且不默认为 Codex。未给`--branch`时默认任务分支为`<adapter>/<task-id>`。`inspect`只读观察；`cleanup`清理正式Task环境。Environment Receipt独占Plan、ready、恢复、资源和总cleanup。 |
| `buildr worktree create\|inspect\|cleanup <task-id>` | 窄 Git worktree provider。`create` 接受 branch/start point 与显式 Project/Service selectors；`inspect` 复核 checkout/branch/HEAD/clean/registration；`cleanup` 要求每仓 integrated ref。它不判断 Environment ready，也不准备 Runtime、CLI、依赖、projection 或动态资源。 |
| `buildr verification run --project <code> --capability <id> ... --target-identity <identity>` | 使用 Workspace 受管 Node 执行 Project `verification.yml` v2 中显式选择的 command capabilities。需要绑定正式环境时同时传 `--environment <task-id> --workspace <canonical-workspace>`；Receipt 固定的 retained controller 编排正式 execution 与 canonical record，capability 仍在候选 execution root 执行。正式Task的exact invocation已有active或terminal record时默认零执行复用，只有显式`--retry`创建同identity独立run/record。返回`buildr.verification-execution/v1`，不选择applicability、不写current Result。`--declaration-root`只属于`task verification record`。 |
| `buildr task create\|inspect\|update\|activate\|complete\|abandon` | 在 canonical Workspace 的 SQLite 中维护 Task Record v2。`create --status todo` 只保存意向，不接受 Change；`activate` 显式转为 active。`--retrospective-source` 及 update add/remove flags 只关联已有 current 复盘的终态来源 Task，不创建行动项。todo 只能以 `--no-change` 完成；todo/active 都可 abandon，终态不可重开。Parent/Child 仍只表达协调层级。 |
| `buildr task delivery inspect <task-id>` | 仅凭 Task ID 只读返回 `buildr.task-terminal-delivery/v1`。已交付时包含 Finish run ID、final remote ref 与 cleanup 摘要；current Finish run 返回 run ID、phase 与产品生成的 next action；尚无 run 或交付关联不可证明时保持既有保守状态和 diagnostic。该命令不执行 resume、cleanup 或 Finish，不扩展只查询 Task Record 的 `task inspect`，也不替代按 run identity 查询完整明细的 `task finish inspect --run`。 |
| `buildr task next <task-id>` | 只读返回closed `buildr.task-entry-snapshot/v1`：Task、matching Environment、Development compact identity/applicability、execution roots、retained controller、blockers与唯一typed next。`required`是authority/identity恢复前置，`recommended`可由用户调整；不自动执行、不展开完整capability graph。`--execution-target`只做receipt核验，`--profile`只增加本次调用耗时/owner read事实。 |
| `buildr task parent inspect\|record\|bind-child\|reconcile\|accept` | 管理opt-in Parent Plan与Contribution协调。新writer只接受`buildr.parent-plan/v2`；旧v1保持原identity双读并通过显式`reconcile`升级。`inspect`以`buildr.parent-coordination-result/v3`返回紧凑Plan摘要、唯一顶层Contribution Map及expected、eligibility、actual三轴；Child delivery和Planning Review只返回协调所需摘要。`bind-child`只接受真实Child Development binding；`accept`只记录显式最终集成验收，不完成Parent。不扫描文件系统、backfill历史Task、复制Child状态或创建progress/lifecycle authority。 |
| `buildr task verification inspect\|record <task-id>` | 通过Application读取或事务整值记录Workspace SQLite中的current Verification Result。`inspect`只读保存Result/查询字段，可带当前`--target-identity`做纯值比较，不接受路径或重新观察声明；`record`接收完整能力事实、coverage gaps和结论，并在目标声明尚在Task Environment时可带`--declaration-root <task-environment-root>`完成正式写入观察。Application只接受该Task当前ready Environment的精确根，且不把路径写入Result。 |
| `buildr task finish run\|inspect` | 首次 `run` 接收 `--task <task-id> --commit-message <message>` 并要求 ready Environment 与当前研发交接（Development Handoff）。Agent根据最终内容提供符合仓库约定的subject/可选body；产品规范化、加入`Buildr-Task` trailer并冻结identity，已有run/resume不接受覆盖，公开Result只返回subject/identity。JSON缺省或`--detail compact`返回closed compact schema，保留恢复所需identity、failure、resume、refs和timing；完整phase checks、operations、diagnostics、carrier与completion事实必须显式使用`--detail full`。detail只影响CLI序列化，不改变Finish执行或SQLite authority。可显式给出与 Environment adapter 一致的 agent、target branch/remote；省略 `--agent` 时使用 Environment 已绑定宿主，但不接受 Project/Change、Candidate/generation 或 Verification authority 输入。Git-backed run默认冻结retained checkout当前符号分支，显式target必须与其一致，Environment `startPoint`不作为交付分支；再按显式值、Environment、target branch upstream、唯一配置remote解析真实remote，缺失、歧义或不一致时停止。每次真实run/resume先open独立`task-finish/finish-diagnostics`record并预留容量，backpressure时不启动Finish副作用。随后固定执行 `preflight → prepare → verify → deliver → cleanup`：使用冻结message在隔离Delivery Carrier机械复用或保留Delivery Adaptation现场、校验实际commit message identity、fast-forward/普通push与carrier回读，再按Task Contribution选择`none`或Workspace根runtime source的`render-runtime`。invocation timeline、diagnostics与受控output在record retained后清理精确transient；Carrier与恢复资源仍由Finish owner管理。record attention不改变已成立的Finish终态，`inspect`不列records。formal Verification次数固定为0。Workspace专属维护可由Component使用`task-finish@append`交接给Agent，不要求通用Skill提供slot，也不属于产品五阶段。P0.5 不公开 `task development` CLI，bundled `task-development` Skill 通过内部 driver调用唯一Application；Buildr Web仅提供`inspect`只读投影。 |

Task Finish current、target lease、Carrier/resume/cleanup与compact terminal Result继续由Workspace SQLite/Finish owner管理；每次invocation的完整诊断、timeline和受控output通过独立Execution Record保留，record retained后只清理对应diagnostics transient。`task_finish_current`不保存record关联或attempt history。`.buildr/task-finish`是已退役的旧文件协议；`task complete`只表达Task Record terminal status。
| `buildr rules add/remove` | 维护 root Rules manifest 和文件生命周期。 |
| `buildr skills add/remove` | 只维护 workspace `skills/` 中的 Skill source；旧 `--scope .` 仅兼容并警告，Project scope 被拒绝。 |
| `buildr skills bind/unbind` | 维护 workspace 默认 binding，或在 `projects/<project>/capabilities.yml` 维护 Project context binding。 |
| `buildr skills render <agent> --destination workspace\|user` | 从 `--target <workspace>` 读取 source，显式投射到当前工作目录或个人用户层；默认 workspace。 |
| `buildr commands add/remove` | 维护 workspace Command catalog definitions；最后一个 definition 仍被 requirement 引用时零写入。 |
| `buildr commands check [--project <project> ...]` | 按显式 Project task context 合并 requirements 并观察本机环境；无 Project 时只检查 workspace defaults。 |
| `buildr component list/check/install/uninstall` | 管理 workspace 级 Rules、Skills、Command collections 与声明式 Skill Contribution。 |
| `buildr builtin list/uninstall/restore` | 查看或维护 Buildr 内置能力；required 能力不能卸载。`restore` 表示明确放弃该 Builtin 的本地修改；replacement 只接管可证明为 Buildr-managed 的 predecessor，恢复 source 后再运行 `sync <agent>` 收敛 runtime。 |
| `buildr update [check]` | 按installation receipt检查或更新当前npm/platform/development渠道；不维护workspace或Workspace Node。 |

新 Workspace 使用 `.buildr/workspace.yml` 的 `buildr.workspace/v1` schema，并与 `skills/manifest.yml.workspaceId` 共享同一 UUID。旧 metadata 可以在 `buildr web` 中只读查看；`buildr sync <agent>` 通过同一 source transaction 显式迁移两份 Manifest，identity 冲突时零写入失败。页面修改使用 revision compare-and-swap，不自动覆盖 Agent、Git 或编辑器已经产生的外部变化。

Task Record 使用 closed `buildr.task-record/v2` schema。顶层状态为 `todo|active|completed|abandoned`，查询态 `open` 派生为 todo + active。复盘来源使用独立多对多关系表，只保存 source Task ID；多个复盘可指向同一 Task，一个复盘也可形成多个后续 Task。Task Record 不保存 Environment、Development 或 action item。Parent/Child、Change resolver、`recordDigest` 与旧 `task.yml` inert 语义保持不变。

Task Record、Task Development current Receipt、Task Verification current Result与Planning/Completion Review current Results全部以`.buildr/local/workspace.sqlite`作为单机唯一持久化authority。各专业CLI/Skill/Buildr Web仍调用对应Application；interface不直接打开数据库。旧Task-scoped YAML不读取、不迁移、不双写，Task current records不进入Git或跨机器同步。Git Operations只处理用户或其他consumer明确选择的普通Git内容；产品不再提供Task Metadata Publication入口、contract或runtime Skill。Environment与Finish继续保存各自本机运行/交付事实。

默认 App 的用户级登记文件只保存规范化 Workspace root 和最近使用项；Workspace 名称、说明、Project、Service 与全局 Change 列表始终从 retained Workspace 实时读取。Task 详情固定为“概览、研发、证据、环境”四个一级视图：研发调用 Task Development Application `inspect`，证据分别调用 Review/Verification reader，环境调用 Environment reader；打开、窗口聚焦或手动刷新时执行有界读取。Development/Review/Verification/Environment 专业区块均不提供 writer；审查和验证仍可生成受限 Agent prompt。Task 关联 Change 的详情通过同一 Task-scoped Resolver 读取任务执行根与 retained baseline；全局 Change 列表仍保持 retained-only。

Project registry 使用 `buildr.projects/v2`：每个 Project 保存 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`。`source.path` 是文件系统物化位置；Git source 另外保存 URL、remote 和稳定的 `integrationBranch`。`currentBranch`、HEAD、dirty、upstream 与 ahead/behind 是实时观察状态，不写入 Domain。v1 registry 可只读查询，`buildr sync <agent>` 显式迁移；页面不会静默迁移、切分支、stash 或改写 remote。

`service create --integration-branch` 只适用于 Git 来源，`--branch` 仅为兼容别名。Canonical Service Domain 保存 UUID `id`、`workspaceId`、`projectId`、`code`、`name`、`description`、`type` 和 `source`；`source.path` 定位文件系统中的实际 Service，Git source 保存 URL、remote 与稳定 integration branch。当前分支、HEAD、dirty、upstream 与 ahead/behind 只实时观察，不写回 Domain。

Project根可选`preparation.yml`（`buildr.project-environment-preparation/v1`），长期声明Project-wide或Service-scoped Recipe。Agent按Task完整Project/Service scope提交closed`buildr.task-environment-plan-request/v1`；Application解析声明identity并把resolved`buildr.task-environment-plan/v2`与Receipt v5保存到canonical Workspace SQLite唯一`task_environment_current`。`task environment plan record|inspect`管理saved Plan，`prepare --plan <file>`可一次选择并准备。Recipe Step只接受无shellexecutable、args、所属Project/Service相对cwd、inputs、expected outputs、required和timeout；核心不枚举package manager、不扫描manifest。Receipt分别保存Declaration、Scope、Recipe与Step current/prepared identity、状态、诊断和本次是否执行。任一required Recipe/Step缺失、漂移或失败都会阻断整体ready。`inspect`只读实时观察且不执行Step、不创建输出、不升级Plan、不回写；Buildr Web GET只读取saved current。旧Receipt只读兼容，必须显式提供Plan Request才能升级。

`project create`、`service create`及Buildr Web对应Agent prompt会返回`declaration-intake` next action；首次Task prompt、Environment declaration/Recipe gap与Verification coverage gap也使用同一入口。该入口只让Agent检查`preparation.yml`/`verification.yml`候选或diff，注册事务和所有GET/inspect都不写声明。用户确认精确长期变更后，仍由`task-environment`或`task-verification`各自owner维护。

Git provider evidence 使用 `buildr.git-worktree-evidence/v1`，保存在 Git common-dir 的 `buildr/task-worktrees/<task-id>.json`。它只包含 repository selector、source/checkout、branch/start point、HEAD、clean、registration、remote 和 Git effects。Environment cleanup 先停止已登记资源，再把每仓 delivery identity 交给 provider；明确 abandon 时可以清理可证明属于该 Task 的 dirty checkout。provider 不删除远端分支，也不执行交付、验证或总 cleanup 判断。

## Runtime 与诊断

| 命令 | 用途 |
|---|---|
| `buildr runtime list` | 查看 supported adapters、capabilities 和推荐命令。 |
| `buildr doctor` | 只读聚合workspace、npm/platform/development/current instance安装身份、main process runtime role、独立Workspace Node声明/runtime、registries、Components和Commands；不要求main process Node等于Workspace Node。 |
| `buildr render <agent>` | 组合投射 Rules entry 与 workspace Skills 到 workspace destination，不安装产品入口 Skill。 |
| `buildr sync <agent>` | 同步当前本地 workspace checkout 中的产品源能力、按既有精确声明恢复 Workspace Node runtime，并准备当前 Agent runtime；不扫描或迁移旧 Task Environment 文件。 |
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

`projects/<project>/verification.yml` 使用 closed `buildr.project-verification/v2`。每项 capability 声明稳定 id、明确 Project/Service scope、command 或 bounded Agent invocation、path/条件 applicability、能够证明的事实和 `requiredForDelivery`；只有确有需要时才增加 environment、effects、authorization、resources 与 `resourceClaims`。旧 mode、maturity、stages、enforcement、coverage、sources、dependsOn 和 supersedes 不再读取。它是 Project 测试能力事实，不是 `capabilities.yml` 中的 Skill binding，也不会被投射到 Service repo。

`buildr verification run` 不推导固定层级或声明级 DAG，只执行调用方显式选择的 command capabilities。`effects.authorization: explicit` 必须逐项传入 `--authorize-capability <id>`；声明为 explicit 的资源必须逐项传入 `--authorize-resource <id>`。实际 claim 的 `coordinated` 资源才通过有界 coordinator 排队。正式Task对相同Task/target/Project/declaration/capability set生成exact invocation identity；默认在同一repository transaction中active优先、随后terminal，并按`opened_at DESC, record_id DESC`复用latest record。active/terminal复用均不取得resource、不观察target、不启动process或创建transient evidence；terminal负向outcome及`attention`保持非零。只有显式`--retry`创建同identity独立run/record，identity输入变化正常创建首次执行。完整命令输出、耗时、授权与资源诊断属于 transient execution evidence。命令不创建任务、不调度 Agent，也不写Workspace SQLite current Result。

没有声明或没有适用能力时，doctor 不产生 finding，Task Verification 在具体 Result 中报告 coverage gap，不自动开发测试。文件存在时 doctor 只做 closed schema、路径、scope 与资源引用校验，不运行命令或探测测试环境。用户通过 Agent 说“初始化测试声明”或“更新测试声明”时，Agent 只从真实 build scripts、CI、文档和已有测试发现候选，并由用户确认 Project policy。

current Task Result使用`buildr.task-verification-result/v1`，只保存Task/stable Content Target/declaration identity、实际能力的`passed / failed`精炼事实、coverage gaps、`passed / not-passed`结论与完成时间。Task Verification Application是唯一writer/reader，record做完整原子替换，inspect按当前Content Target和declarations派生`current / stale / unknown`。Task Development只消费Application read model，Finish不直接消费Result。Result不保存stdout/stderr、临时路径、Environment Receipt、风险接受、任务推进状态、history或Candidate generation。

## Skill capability contracts

`buildr.skills/v3` 为每个 workspace Skill 保存稳定 `assetIdentity`/`sourceIdentity`，并支持 versioned contract、provider `provides`、consumer `requires` 和 workspace 默认 binding。Project context 使用 `buildr.project-capabilities/v1`。安装 provider 本身不会静默改绑。

Contract 格式、scope 规则、替换示例以及 `ready` 的边界见 [Skill Capability Contracts](skill-capability-contracts.md)。

## Product maintenance / workflow internal

- `buildr package check/build`：产品 package 维护和构建，不是普通 workspace 日常命令。
- `buildr openspec converge <change> --project <project> --target <task-execution-root> --json`：Buildr OpenSpec单一收敛事务；target取自matching Task Environment Receipt的`execution.workdir`，不是canonical Workspace。内部完成规划、隔离strict validation、条件式canonical应用、写后确认与`archive --skip-specs`，正常archive后释放本次事务Receipt，结果为`passed|blocked|recovery-unprovable`。
- `buildr openspec convergence inspect <change> --project <project> --target <workspace> --json`：只读检查仍存在的未决事务Receipt及before/expected/actual；active Change未开始或Change已归档时返回`not-applicable`。它不写canonical、Receipt或archive，也不用于环境清理后的长期审计。
- `openspec audit`、`openspec baseline create`、阶段型`openspec check`、`openspec sync-plan`与`openspec sync-apply`均已删除；旧调用返回标准unknown-command。
- `openspec baseline create`、阶段型 `openspec check`、`openspec sync-plan` 与 `openspec sync-apply` 均已删除；旧调用返回标准 unknown-command 且不会读取或写入旧 sidecar。确定性 planning/apply 只保留为 `converge` 单一事务的内部步骤。
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
