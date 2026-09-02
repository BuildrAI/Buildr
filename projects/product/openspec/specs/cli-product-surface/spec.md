# Buildr CLI 产品表面

## Purpose

定义 Buildr CLI 与关联数据标识的 public、legacy compatibility、internal/maintenance 分类、可见性和兼容边界。
## Requirements

### Requirement: Canonical 输出不得推荐 legacy 形式
Buildr MUST NOT 在主帮助、主题帮助、bootstrap canonical 示例、doctor repair command 或当前使用说明中生成或推荐已删除的 Legacy CLI、Project Skill source 或旧 OpenSpec sidecar workflow。仍被其他 canonical specs 明确保留的 deprecated 参数兼容输入 MUST 与 executable command surface 分开描述，不得恢复 `legacy` command 分类。

#### Scenario: Legacy 输入仍被兼容
- **WHEN** 旧 workspace 使用仍由其他 canonical spec 明确保留的 deprecated 参数或数据输入
- **THEN** Buildr MUST 按对应 canonical spec 兼容解析或拒绝，并明确其非 canonical 状态
- **AND** Buildr MUST NOT 因输入兼容而恢复已删除 command、自动 Project Skill 迁移或 `legacy` command surface

#### Scenario: Legacy Project Skill source 不再自动迁移
- **WHEN** 旧 workspace 包含 Project Skill manifest 或用户请求 Project Skill source scope
- **THEN** Buildr MUST fail closed 并说明 workspace 是唯一 Skill source authority
- **AND** 当前 CLI MUST NOT 提供自动复制、合并、删除或迁移 Project Skill source 的 next action
- **AND** diagnostic MAY 要求用户在升级前使用旧版本完成迁移或人工审阅整理

#### Scenario: Unsupported layout is not compatibility surface
- **WHEN** 输入使用 canonical specs 已明确拒绝的 `organizations/<org>/` layout 或新的 Project Skill source scope
- **THEN** Buildr MUST 继续拒绝该输入
- **AND** 产品分类 MUST NOT 将它描述为受支持的 current source surface

#### Scenario: Canonical Skill 帮助使用新模型
- **WHEN** 用户查看 Skills add/remove/render、Project capability 或 runtime destination 帮助
- **THEN** 输出 MUST 将 workspace 说明为唯一 source authority
- **AND** MUST 将 Project 说明为 capability/applicability context
- **AND** MUST 将 user/workspace 说明为 runtime destinations

### Requirement: service create rules 参数仅作为兼容 no-op
Buildr MUST 将 `service create --rules <path>` 保留为 deprecated legacy compatibility no-op，而 Service Rule 的唯一 canonical 入口 MUST 是 Service 目录层级的 `AGENTS.md`。

#### Scenario: 旧调用携带 rules 参数
- **WHEN** Agent 调用 `buildr service create <project>/<service> <repo-ref> --rules <path>`
- **THEN** Buildr MUST 保持不带该参数时的 Service 创建和登记语义
- **AND** Buildr MUST 输出 deprecated 与迁移提示
- **AND** Buildr MUST NOT 读取、验证、复制或持久化 `<path>`，也不得向 Service manifest 写入 rule-source 字段

#### Scenario: Canonical Service help
- **WHEN** 用户查看根帮助、`service create --help`、bootstrap guide 或当前产品示例
- **THEN** canonical usage MUST NOT 包含 `--rules`
- **AND** Service 主题说明 MUST 指向目录层级 `AGENTS.md` 约定

### Requirement: Package 命令属于产品维护表面
Buildr MUST 保留 `package check` 与 `package build` 作为产品包校验、构建和发布维护命令，并 MUST NOT 将它们描述为普通 workspace 用户的日常资产管理入口。

#### Scenario: Maintainer discovers package commands
- **WHEN** 产品维护者查看根帮助的维护分区、package 主题帮助或 release checklist
- **THEN** Buildr MUST 提供 `package check` 与 `package build` 的准确用途和用法
- **AND** 两个命令 MUST 继续遵循现有 package manifest、output receipt、integrity 与安全替换契约

#### Scenario: User follows onboarding path
- **WHEN** 普通用户或 Agent 按 quick start、bootstrap 或主 workspace workflow 操作
- **THEN** Buildr MUST NOT 要求运行 `package check` 或 `package build` 才能完成 workspace onboarding 和日常维护

### Requirement: package source identity 不得成为公开资产 id
Buildr MUST 将 `package:<source-id>` 保留为 package manifest `skillSources` 与随包 Skill resolver 之间的内部 source reference，并 MUST NOT 将其作为用户创建的 Skill id、通用 source scheme 或 `skills add` 的公开参数格式推荐。

#### Scenario: Package baseline references bundled source
- **WHEN** Buildr package baseline 使用 `source: package:<source-id>` 引用已声明的 `skillSources`
- **THEN** Buildr MUST 按现有 package manifest 与 runtime 约束解析该引用
- **AND** `<source-id>` MUST 继续只标识随包 source，不改变 Skill 的用户可见 asset id

#### Scenario: Public Skill authoring guidance
- **WHEN** 用户查看 workspace Skill source、Project capability/applicability 或 user/workspace destination 的创建与安装说明
- **THEN** Buildr MUST 只推荐公开支持的 local path、remote source 或 resolved source 模型
- **AND** 说明 MUST NOT 引导用户手工构造 `package:<source-id>` 引用

### Requirement: 产品表面分类必须由验证保护
Buildr 产品验证 MUST 从同一 command metadata authority 验证 executable route、canonical leaf/aggregate help、三类 surface 和 unknown-command candidates 的一致性，防止 help、docs、spec 和实现再次漂移；验证 MUST NOT 仅以固定 command 数量或重复硬编码完整 key 清单保护存量表面。

#### Scenario: Verify retained route discoverability
- **WHEN** 产品验证遍历 command metadata 中的 executable routes
- **THEN** 每个 route MUST 具有唯一 key、合法 surface 和可查询的 canonical help topic
- **AND** 每个声明的 aggregate topic MUST 可以通过 `buildr help <topic...>` 与 `<topic...> --help` 查询

#### Scenario: Verify help and compatibility boundaries
- **WHEN** 产品验证渲染根帮助和当前 CLI Reference
- **THEN** primary、agent-machine 与 maintenance MUST 按 metadata 分区
- **AND** maintenance entries MUST NOT 被硬编码进 primary 区
- **AND** 根帮助 MUST NOT 渲染 Legacy compatibility commands 分组

#### Scenario: Verify compatibility boundaries
- **WHEN** 产品验证调用已删除的 OpenSpec baseline/check 或 Project Skill migration route
- **THEN** 验证 MUST 确认 route 不存在于 executable catalog、help topics、unknown-command candidates 或 public JSON schema registry
- **AND** 每次调用 MUST 返回标准 unknown-command 且保持目标 workspace 零写入

#### Scenario: Verify internal source identity boundary
- **WHEN** package check 或产品测试检查随包 Skill source reference
- **THEN** 验证 MUST 确认 `package:<source-id>` 只能解析 package manifest 已声明的 source
- **AND** 主用户文档与公开 Skill authoring help MUST NOT 把该引用描述为用户 asset id

### Requirement: CLI 必须公开自身版本 identity
Buildr CLI MUST 提供无需 workspace、网络或 Git 状态即可读取当前实际执行 package identity 的版本入口。

#### Scenario: 使用全局版本参数
- **WHEN** 用户运行 `buildr --version` 或 `buildr -V`
- **THEN** Buildr MUST 向 stdout 输出当前 CLI package 的 semver version
- **AND** 命令 MUST 以 0 退出且不读取或修改 workspace

#### Scenario: 使用 version 命令
- **WHEN** 用户运行 `buildr version`
- **THEN** Buildr MUST 输出与 `buildr --version` 相同的当前 package version
- **AND** checkout 与 npm tarball 入口 MUST 对相同 candidate tree 输出相同值

### Requirement: CLI 帮助入口必须支持命令式主题查询
Buildr CLI MUST 让 `help <command...>` 与既有 `<command...> --help`、`<command...> -h` 共享同一 canonical topic；所有 retained executable leaf command 及 metadata 明确声明的 aggregate command group MUST 可查询，且 topic identity MUST 来自同一 command authority。

#### Scenario: 查询一级命令帮助
- **WHEN** 用户运行 `buildr help doctor`
- **THEN** Buildr MUST 输出与 `buildr doctor --help` 相同的 canonical doctor 帮助
- **AND** 命令 MUST 以 0 退出且无 workspace 副作用

#### Scenario: 查询嵌套命令帮助
- **WHEN** 用户运行 `buildr help component install`
- **THEN** Buildr MUST 输出与 `buildr component install --help` 相同的 canonical topic
- **AND** 帮助 MUST NOT 回退到不相关的根帮助

#### Scenario: 查询聚合命令帮助
- **WHEN** 用户运行 `buildr help task finish` 或 `buildr task finish --help`
- **THEN** Buildr MUST 输出只列出 canonical `run|inspect` 的 Task Finish aggregate topic
- **AND** 命令 MUST 以 0 退出且不得创建或修改 finish run

#### Scenario: 遍历 retained leaf topics
- **WHEN** 产品验证对 command metadata 中每个 executable key 调用 `buildr help <key>`
- **THEN** 每个调用 MUST 返回该 key 的 canonical topic 并以 0 退出
- **AND** 不得存在可执行但无法通过 help 发现的 retained route

### Requirement: 未知命令必须返回简洁可操作诊断
Buildr CLI MUST 对无法匹配的命令返回稳定非零退出码、未知输入和可执行下一步，而不是默认输出完整 legacy usage。

#### Scenario: 未知命令存在相近候选
- **WHEN** 用户运行拼写接近公开命令的未知输入
- **THEN** Buildr MUST 在 stderr 标识未知命令并给出有限的相近 canonical 命令建议
- **AND** Buildr MUST 提示通过 `buildr --help` 查看完整帮助并以 2 退出

#### Scenario: 未知 help topic
- **WHEN** 用户运行 `buildr help <unknown-topic>`
- **THEN** Buildr MUST 报告未知 help topic 而不是静默显示根帮助
- **AND** diagnostics MUST 保持零 workspace 副作用

#### Scenario: 不占用小写 v
- **WHEN** 用户运行 `buildr -v`
- **THEN** Buildr MUST NOT 将其解释为 version
- **AND** Buildr MUST 以未知 option 诊断失败，为未来 verbose 语义保留该短参数

### Requirement: Skills CLI 明确区分 workspace source 与 render destination
Skills CLI MUST 将 workspace 作为唯一 source authority，并 MUST 使用 `--destination user|workspace` 表达 runtime 投射位置。Project Skill source scope MUST 被拒绝，且当前 CLI MUST NOT 提供自动迁移入口。

#### Scenario: skills add/remove canonical help
- **WHEN** 用户查看 `skills add` 或 `skills remove` 帮助
- **THEN** canonical usage MUST 只要求 Buildr workspace target
- **AND** MUST NOT 推荐 Project source scope

#### Scenario: skills render canonical help
- **WHEN** 用户查看 `skills render` 帮助
- **THEN** CLI MUST 解释 `--target` 是 source workspace
- **AND** MUST 解释 `--destination workspace` 写当前工作目录 runtime、`--destination user` 写当前 Agent 用户层
- **AND** 省略 destination 的兼容默认 MUST 为 `workspace`

#### Scenario: legacy Project scope
- **WHEN** 用户执行带 `--scope projects/<project>` 的 Skills 命令
- **THEN** CLI MUST 返回结构化 breaking diagnostic
- **AND** diagnostic MUST NOT 包含当前版本可执行的 Project Skill migration command

### Requirement: Skill 冲突输出使用稳定机器契约
Skills render、sync、runtime check 和 doctor MUST 使用稳定 diagnostics 表达 Buildr 管理 Skill 的 identity、ownership、内容和已观察冲突，并 MUST 使用独立 assurance metadata 表达 runtime inventory 的可见性上限。

#### Scenario: 同名冲突 JSON
- **WHEN** JSON mode 检测到 Buildr 管理候选 Skill 的名称冲突
- **THEN** finding MUST 包含 candidate skillId、asset/source identity、destination、observed entries、ownership、digests、inventory evidence 和 nextActions
- **AND** MUST 使用稳定 reason，例如 `name_conflict`、`foreign_owner` 或 `equivalent_external`

#### Scenario: Partial inventory JSON
- **WHEN** adapter inventory 只能部分观察 Agent Skills 集
- **THEN** runtime scope MUST 返回 `skillInventoryEvidence.evidence: partial` 和 `opaqueSources`
- **AND** doctor health summary MUST NOT 将该 assurance metadata 计为 warning、error 或 actionable finding

#### Scenario: 冲突导致零写入
- **WHEN** 任一 Buildr 管理候选 finding 为 blocking
- **THEN** command MUST 以非零状态结束并报告 `mutationApplied: false`
- **AND** MUST NOT 只更新未冲突候选

### Requirement: Commands CLI 显式表达 task context
Buildr CLI MUST 让 Commands catalog 维护与 Project requirement/machine check context 在帮助、参数和 JSON 中可区分。

#### Scenario: Commands help
- **WHEN** 用户查看根帮助或 Commands 主题帮助
- **THEN** CLI MUST 将 `commands add/remove` 描述为 workspace catalog 维护
- **AND** MUST 将 Project requirement 维护描述为引用管理
- **AND** MUST 将 `commands check --project <id>` 描述为 context-aware machine check

#### Scenario: Commands check JSON
- **WHEN** Agent 请求 Commands JSON 输出
- **THEN** JSON MUST 分离 `catalog`、`requirements`、`effectiveConstraints`、`observations` 和 `findings`
- **AND** 每项 MUST 提供稳定 ID、provenance 和 reason code

#### Scenario: 无效 Project context
- **WHEN** 用户提供未登记、重复或不安全的 Project id
- **THEN** CLI MUST 在执行 version probe 前失败
- **AND** MUST 输出可操作诊断且不得修改任何 source 或 machine state

#### Scenario: Legacy version constraint guidance
- **WHEN** CLI 读取把 requirement version constraint 保存在旧 catalog definition 的兼容输入
- **THEN** canonical 输出 MUST 说明其 workspace default requirement 语义或迁移路径
- **AND** MUST NOT 将其静默复制到每个 Project

### Requirement: Project CLI 必须使用 canonical Domain 术语
Buildr CLI MUST expose Project creation and diagnostics using `code`, `name`, source and integration branch terminology while preserving explicit legacy input compatibility.

#### Scenario: Project create help
- **WHEN** 用户运行 `buildr project create --help`
- **THEN** help MUST document `--name`, `--description`, `--repo`, `--remote` and `--integration-branch`
- **AND** help MUST explain workspace versus Git source and MUST NOT call integration branch the current branch

#### Scenario: Legacy title input
- **WHEN** an existing automation uses `--title`
- **THEN** CLI MUST accept it as compatibility input and map it to Project `name`
- **AND** canonical output and examples MUST use `--name`

#### Scenario: App help includes Project boundary
- **WHEN** 用户运行 `buildr web --help`
- **THEN** help MUST mention Project list/detail and low-risk name/description edits
- **AND** help MUST state that Project creation is prompt-only and Git state changes are not performed by the UI

### Requirement: Project JSON 输出必须区分声明与观察
Buildr CLI and doctor JSON MUST expose canonical Project identity, declared source and observed Git state as separate objects.

#### Scenario: Canonical Project JSON
- **WHEN** Agent requests JSON diagnostics for a v2 registry
- **THEN** each Project MUST expose id, workspaceId, code, name, description and source
- **AND** observed Git fields MUST NOT appear inside source or persisted Domain fields

#### Scenario: Compatibility Project JSON
- **WHEN** Agent requests diagnostics for a readable v1 registry
- **THEN** output MUST mark migration required and expose a canonical next action
- **AND** MUST NOT claim that generated compatibility identity has been persisted

### Requirement: Service CLI 必须使用 canonical Domain 术语
Service CLI MUST 使用 `code`、`name`、`description`、`type`、`source` 与 `integrationBranch` 表达 canonical Domain，并兼容旧参数。

#### Scenario: 查看 service create 帮助
- **WHEN** 用户查询 `service create` 帮助
- **THEN** canonical usage MUST 展示 `--name`、`--description`、`--type` 与 `--integration-branch`
- **AND** `--branch` MUST 只作为兼容别名说明

#### Scenario: 创建 Service JSON 输出
- **WHEN** Agent 使用 JSON 输出创建或登记 Service
- **THEN** 输出 MUST 包含稳定 Domain、registry revision 与 declared/observed 分离结果

### Requirement: Worktree CLI 必须与 Task Environment CLI 分离

Buildr MUST只保留`buildr worktree create|inspect|cleanup`作为Git位置和删除安全公共命令。CLI MUST NOT提供`task environment`、Plan、Receipt、ready、恢复、资源登记或总cleanup动作。

#### Scenario: 用户明确管理 Git worktree
- **WHEN** 用户运行`worktree create|inspect|cleanup`
- **THEN** CLI MUST只返回`buildr.git-worktree-result/v1`
- **AND** MUST NOT要求或生成Task Environment记录

#### Scenario: 调用已删除的环境路由
- **WHEN** 调用方运行`task environment *`、`worktree context|adopt`或旧Environment参数
- **THEN** CLI MUST作为不存在或不支持的命令拒绝

### Requirement: CLI 必须提供最小 Task Review Result 管理入口
Buildr CLI MUST 公开 `buildr task review inspect <task-id>` 与 `buildr task review record <task-id>`，并 MUST 只把解析后的 canonical target、current target identity 或完整语义字段交给 Task Review Application。CLI MUST NOT 执行 Review、生成 plan/Candidate identity、接受 caller path 或写完整 next-state YAML。

#### Scenario: 查看两个 current slots
- **WHEN** 用户运行 `buildr task review inspect <task-id> --target <canonical-workspace> --json`
- **THEN** CLI MUST 返回 Planning/Completion 两个可选 slot 的 Application read model
- **AND** 未提供 current target identity 时已存在 Result 的 applicability MUST 为 unknown

#### Scenario: 记录完整 Review Result
- **WHEN** 用户运行 `buildr task review record` 并提供 type、target identity、method、reviewed、uncovered、findings、outcome 与 summary
- **THEN** CLI MUST 调用 Application record，并返回 recorded 或 blocked 的结构化结果
- **AND** CLI MUST 不接受 schemaVersion、taskId、completedAt、revision、current 或 applicability 作为 caller-authored字段

#### Scenario: 查看 Task Review help
- **WHEN** 用户运行根帮助、`buildr task --help`、`buildr task review --help` 或具体 action help
- **THEN** help MUST 说明 CLI 只管理完成 Result、两种类型均可选、record 需要明确 target identity、中断不写入且适用性由 identity 比较派生
- **AND** help MUST 不把命令描述为 Review engine、Development gate 或 Candidate generator

### Requirement: Task CLI 必须在既有 action 中管理 Parent Task
`buildr task create` MUST 接受可选 Parent Task ID，`buildr task update` MUST 提供互斥的 set-parent 与 clear-parent 参数；inspect/list MUST 返回 Parent/Child read model。CLI MUST NOT 新增独立 graph、board 或 relation 顶层 action。

#### Scenario: CLI 创建 Child Task
- **WHEN** Agent 使用 `task create` 并提供 Parent Task ID
- **THEN** CLI MUST 调用同一 Task Record Application 创建关系
- **AND** JSON result MUST 返回 Child 的 Parent 与 Parent 可查询的直接 Child

#### Scenario: CLI reparent 或 clear
- **WHEN** Agent 对 active Task 使用 set-parent 或 clear-parent
- **THEN** CLI MUST 提交单一明确 mutation
- **AND** 同时提供、缺失参数或非法 identity MUST 在写入前失败

#### Scenario: CLI help 描述独立生命周期
- **WHEN** 用户查看 Task CLI 帮助
- **THEN** help MUST 说明 Parent/Child 只表达层级关系
- **AND** MUST NOT 暗示 Parent 自动调度、完成或验证 Child

### Requirement: CLI command metadata 必须成为唯一产品表面 authority
Buildr MUST 通过一个封闭、可验证的 command metadata catalog 同时声明每个 executable command 的 canonical key、surface、summary、help topic、dispatch match 和执行 adapter；根帮助、主题帮助、unknown-command candidates 与表面验证 MUST 从该 catalog 派生，不得维护可独立漂移的完整 route/help key 清单。

#### Scenario: 登记新 command
- **WHEN** 产品新增一个 executable CLI command
- **THEN** 维护者 MUST 在同一 command descriptor 中提供 key、surface、summary、canonical help、match 和 run adapter
- **AND** dispatch、help 与 verification MUST 无需在第二份完整 key map 中重复登记即可发现该 command

#### Scenario: 删除 command
- **WHEN** 产品删除一个 executable CLI command descriptor
- **THEN** 该 command MUST 同时从 dispatch、root/topic help、unknown-command candidates 与 surface verification 中消失
- **AND** 删除操作 MUST NOT 要求继续修改另一份硬编码 supported-key 清单

#### Scenario: Metadata schema 非法
- **WHEN** command descriptor 缺少必需 metadata、使用未知 surface、重复 key 或声明 executable leaf 但没有 canonical help
- **THEN** 产品验证 MUST fail closed 并给出具体 command identity 与字段诊断

### Requirement: 零消费者的 OpenSpec 分阶段 CLI 必须退役
Buildr MUST 不再注册、执行或发布 `buildr openspec baseline create`、`buildr openspec check`、`buildr openspec sync-plan` 与 `buildr openspec sync-apply`；旧 baseline、pre-sync/post-sync stage 与 sidecar workflow MUST 不再拥有 current writer 或 reader。确定性 expected tree、冲突检查、隔离验证、条件式 canonical 应用与写后确认 MUST 只由 `buildr openspec converge` 单一事务持有。

#### Scenario: 调用已删除的 sync-plan
- **WHEN** 调用方运行 `buildr openspec sync-plan <change> ...`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 写 plan、baseline、pre-sync receipt、canonical spec、convergence receipt 或 archive 状态

#### Scenario: 调用已删除的 sync-apply
- **WHEN** 调用方运行 `buildr openspec sync-apply <change> ...`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 读取旧 plan 作为授权、修改 canonical spec 或创建 convergence receipt

#### Scenario: 使用当前收敛事务
- **WHEN** OpenSpec Contract Guard 需要确定性收敛 active Change
- **THEN** 它 MUST 只调用 `buildr openspec converge`
- **AND** converge MUST 在单一 operation 中完成冲突检查、规划、projected strict validation、条件式应用、写后确认和 archive

#### Scenario: Fresh Change 进入 apply
- **WHEN** 一个没有旧 baseline sidecar 的新 Change 完成 apply-required artifacts
- **THEN** OpenSpec consumer MUST 使用 upstream strict validation 与 Planning Review 进入实现
- **AND** MUST NOT 创建、刷新、读取或要求旧 contract baseline

#### Scenario: 保留仍有消费者的兼容入口
- **WHEN** 当前或旧 consumer 调用 `openspec baseline create`、proposal `openspec check` 或 `skills migrate-project-assets`
- **THEN** Buildr MUST 返回标准 unknown-command，不保留兼容行为或 replacement route
- **AND** MUST NOT 读取或写入旧 sidecar、Project Skill source 或 capability context

### Requirement: Legacy Project Skill 自动迁移必须退役
Buildr MUST 不再注册、执行或发布 `buildr skills migrate-project-assets`，并 MUST 删除扫描、复制、合并或删除 Project Skill source 的自动迁移能力。workspace Skill registry MUST 继续作为唯一 source authority，Project MUST 只表达 capability context。

#### Scenario: 调用已删除迁移命令
- **WHEN** 调用方运行 `buildr skills migrate-project-assets --check` 或 `--apply`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 读取、复制、写入或删除 workspace/Project Skill source、manifest、contract 或 capability context

#### Scenario: Doctor 遇到旧 Project Skill source
- **WHEN** Doctor 观察到 Project 下仍存在旧 Skill manifest 或 source
- **THEN** Doctor MUST 报告 unsupported/fail-closed diagnostic
- **AND** MUST NOT 推荐当前版本不存在的 migration command 或执行自动修复

### Requirement: OpenSpec Convergence Inspect必须提供唯一公共JSON契约
Buildr CLI MUST让`buildr openspec convergence inspect <change> --project <project> --target <workspace> --json`返回`buildr.openspec-convergence-inspect/v1`，并以`passed|not-applicable|recovery-unprovable`表达当前恢复检查结果。Command catalog、topic help、dispatch、unknown-command candidates、JSON registry与验证 MUST从同一当前入口收敛，不得保留`openspecAudit`或`buildr.openspec-convergence-audit/v1`当前注册。

#### Scenario: Inspect适用于当前恢复现场
- **WHEN** active Change存在可读取的当前事务Receipt
- **THEN** CLI MUST返回逐文件分类、disposition、diagnostic和唯一next action
- **AND** status为`recovery-unprovable`时 MUST以非零状态退出

#### Scenario: Inspect不适用于未开始或已终结事务
- **WHEN** active Change尚未写Receipt或Change已经archived
- **THEN** CLI MUST返回`not-applicable`、稳定reason code和空files
- **AND** 该结果 MUST以成功状态退出且不得创建Receipt

### Requirement: Task Record 必须提供六个明确 CLI action
Buildr CLI MUST公开 `buildr task create <task-id>`、`inspect`、`update`、`activate`、`complete` 和 `abandon`，并 MUST在帮助中将它们描述为 Task Manager 的确定性记录动作。CLI interface MUST只拥有参数解析、Application 调用、输出和退出码；Task Record Application MUST NOT解析 argv、打印 stdout/stderr、修改 process exit state 或向客户端暴露 SQL/storage internals。现有 `buildr task finish run|inspect` MUST保持当前专业语义，直到 Task Finish 模块被替换。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST展示精确 usage、canonical Workspace target、required/repeatable/exclusive flags、副作用与停止条件
- **AND** MUST说明 todo 只写 SQLite、activate 不执行 Git/Environment，且 Task Manager 不管理专业阶段或自动 publication

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI interface MUST将结构化 action input 交给共享 Application，并把 result 映射为人类或 JSON 输出
- **AND** Application MUST保持可由 Buildr Web 直接复用，不依赖 argv、stdout/stderr、CLI process state 或客户端 SQL

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行 `buildr task create <task-id> --title <text> --intent <text>`，按需提供 `--status todo|active`、scope/Change 或重复 `--retrospective-source <task-id>`
- **THEN** CLI MUST将明确参数交给 create Application，并只在 SQLite authority 中记录不存在且校验通过时原子创建
- **AND** status 省略时 MUST 保持 active 默认；todo MUST 拒绝 Change 且不得隐式创建任何外部或专业资产

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行 `buildr task inspect <task-id>`
- **THEN** CLI MUST只读返回 canonical logical Task Record、复盘来源与 response-level digest
- **AND** MUST NOT创建数据库、更新 `updatedAt`、status、result 或任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行 `buildr task update <task-id>` 并提供至少一个登记的 set/add/remove flag，包括复盘来源 flag
- **THEN** CLI MUST由 Application 对 transaction 内最新 todo/active record 应用明确 mutation并验证最终完整记录
- **AND** MUST NOT接受完整 next-state document、SQL 或任意 JSON/YAML patch

#### Scenario: 激活 Task Record
- **WHEN** 调用方运行 `buildr task activate <task-id>`
- **THEN** CLI MUST只允许 Application 执行 todo-to-active transition
- **AND** MUST NOT执行 Git baseline、Environment、Change、Development、commit 或 push

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行 `complete` 或 `abandon`
- **THEN** CLI MUST由 Application 执行合法 todo/active-to-terminal transition
- **AND** MUST NOT从专业 records 推断结果或自动执行 Finish、cleanup、commit 或 push

#### Scenario: 已知业务冲突
- **WHEN** action 遇到重复 Task ID、非法状态/来源/scope/Change、终态改写、database/schema failure 或 canonical Workspace 冲突
- **THEN** CLI MUST返回当前 Task Record result family 的 structured blocked result并以非零状态退出
- **AND** MUST包含稳定 code、未发生 effects 与唯一恢复 next action

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行现有 `buildr task finish run|inspect` 或对应帮助
- **THEN** CLI MUST继续匹配现有三段式 command key 与当前 Task Finish 契约
- **AND** 新增 `task activate` MUST NOT遮蔽或误解析 `task finish` actions

### Requirement: CLI 产品表面必须显式分层并采用 Buildr Web 主入口
Buildr MUST 将当前可执行命令区分为 `primary`、`agent-machine` 与 `maintenance` 三类产品表面，并在 command metadata、help、产品文档、current-state knowledge 和验证中保持同一分类。该分类只控制可发现性与支持承诺，不改变命令自身的授权、安全契约或可执行 effects。Buildr MUST NOT 注册 `legacy` command surface。

#### Scenario: Public workspace surface
- **WHEN** 用户或 Agent 查看 Buildr 根帮助与主产品文档
- **THEN** Buildr MUST 在 primary 区展示普通工作路径需要的 workspace 初始化、核心范围维护、诊断、恢复、同步和 Buildr Web 入口
- **AND** `buildr web --target <workspace>` MUST 继续作为人查看 Workspace 并执行受控 metadata 修改的主产品入口
- **AND** primary 区 MUST NOT 混入产品构建、开发预览或 OpenSpec workflow internals

#### Scenario: Agent machine surface
- **WHEN** Agent、Skill、doctor repair 或 bootstrap 需要低频但正式支持的确定性命令
- **THEN** 对应 command MUST 保持可执行、具有 canonical help 和稳定契约
- **AND** 根帮助 MUST 将其置于独立 agent-machine 区，而不能仅因底层或高级而标为 unsupported/internal

#### Scenario: Internal maintenance surface
- **WHEN** 根帮助或产品文档提及产品构建、开发预览、自举或 workflow 编排命令
- **THEN** Buildr MUST 将这些入口与普通 workspace 用户主路径分区并标明 maintenance 用途
- **AND** `buildr web preview start|list|stop` MUST 作为 Agent 并行验收 task worktree 的 maintenance 开发入口继续可用

#### Scenario: Legacy surface
- **WHEN** 调用方使用已退役 command
- **THEN** Buildr MUST 返回标准 unknown-command，而不是注册 legacy surface、alias 或隐藏入口
- **AND** canonical 根帮助与新使用说明 MUST NOT 展示 Legacy compatibility commands 分组

#### Scenario: Buildr Web help
- **WHEN** 用户运行 `buildr web --help`、`buildr help web` 或 preview 子命令帮助
- **THEN** Buildr MUST 说明默认 Buildr Web 与 task preview 的边界、target、loopback、port、实例身份、页面修改白名单和 prompt-only 新增边界
- **AND** help MUST 明确 preview 不安装或替换 `Buildr Web Dev.app`
- **AND** help MUST NOT 声称 Buildr Web 提供数据库、远程服务或 Agent session connector

#### Scenario: Workspace init description help
- **WHEN** 用户运行 `buildr init --help`
- **THEN** Buildr MUST 展示可选 `--description <description>` 参数
- **AND** help MUST 说明未提供说明时会产生待补全提示，而不是静默编造 Workspace 说明

### Requirement: Buildr Web 命令族必须是唯一当前本机 Web 产品入口
Buildr CLI MUST 只将 `web` 注册为当前本机 Web 产品的 executable domain。`buildr web`、`buildr web launcher install|status|uninstall` 与 `buildr web preview start|list|stop` MUST 分别复用现有 Runtime、Launcher 与 preview Application；CLI MUST NOT 注册 `app` domain、隐藏 alias、legacy surface 或第二套路由。

#### Scenario: 根帮助展示主入口
- **WHEN** 用户运行 `buildr --help`
- **THEN** primary 产品表面 MUST 展示 `buildr web`
- **AND** executable catalog、帮助主题和 examples MUST NOT 包含 `buildr app`

#### Scenario: Web 主题帮助一致
- **WHEN** 用户分别运行 `buildr web --help` 与 `buildr help web`
- **THEN** 两个入口 MUST 返回完整且一致的 Buildr Web 帮助
- **AND** help MUST 包含 launcher、preview maintenance surface、loopback、按需启动与 `--no-open` 边界

#### Scenario: 旧 app domain 按标准 unknown command 处理
- **WHEN** 调用方运行 `buildr app`、`buildr help app` 或任一 `buildr app ...` 子命令
- **THEN** CLI MUST 使用现有标准 unknown-command diagnostic 和非零退出码
- **AND** suggestion、candidate、Doctor repair、bootstrap 或 Skill 指引 MUST NOT 推荐 `app` domain

#### Scenario: 普通 CLI 不启动 Web Runtime
- **WHEN** 调用方运行不属于 `web` domain 的普通 CLI 命令
- **THEN** CLI MUST NOT 启动 loopback HTTP 服务或创建 Buildr Web instance state
- **AND** Buildr Web Runtime MUST 只在 `buildr web` 或其明确 preview/Launcher 启动路径中按需启动

### Requirement: OpenSpec Semantic Readiness Preflight必须提供公共CLI与JSON契约
Buildr CLI MUST让`buildr openspec convergence preflight <change> --project <project> --target <task-execution-root> --json`返回`buildr.openspec-convergence-preflight/v1`，并以`ready|blocked`表达当前语义就绪结果。Command catalog、topic help、dispatch、unknown-command candidates、JSON registry与验证 MUST从同一command descriptor发现该入口。

#### Scenario: Preflight ready
- **WHEN** 当前delta、canonical、active Changes和executable可形成唯一且strict有效的expected Project
- **THEN** JSON MUST包含change、project、status、readinessIdentity、convergence/plan identity、delta/executable/algorithm identity、activeChange observations、operations、validation、duration、commandCount、`effects: []`和nextActions
- **AND**命令 MUST以成功状态退出

#### Scenario: Preflight blocked
- **WHEN** planner、active conflict scan或projected strict validation返回blocker
- **THEN** JSON MUST返回`blocked`、稳定category、底层code、最小identity引用和`effects: []`
- **AND**命令 MUST以非零状态退出且不得创建Receipt、修改canonical或archive Change

#### Scenario: Planning root或Change无效
- **WHEN** Project、Task execution root、OpenSpec executable或active Change不能安全解析
- **THEN** CLI MUST在任何持久写入前返回具体diagnostic和matching Environment execution root提示
- **AND** MUST不扫描或猜测其他worktree

### Requirement: Parent Coordination CLI必须公开planning refresh
Buildr CLI MUST公开`task parent refresh-planning <task-id>`，并只接收Task identity、canonical target与输出模式；该命令MUST不接收planning JSON、Review digest、gate正文或Child状态。

#### Scenario: 查看refresh帮助
- **WHEN** 用户运行Parent Coordination topic help或`task parent refresh-planning --help`
- **THEN** help MUST展示命令用途、必需Task ID和canonical target
- **AND** MUST明确该动作消费saved Parent Plan与current Planning Review

#### Scenario: candidate CLI尝试写canonical Workspace
- **WHEN** refresh由Task worktree candidate CLI指向retained canonical Workspace
- **THEN** writer provenance guard MUST保持零写入并返回retained controller route
- **AND** CLI MUST不绕过Development writer authority

### Requirement: Parent Plan CLI必须提供输入discoverability
Parent Plan record/reconcile CLI MUST为closed输入提供机器可读schema与example发现方式，并与实际Application validation保持同步。

#### Scenario: Agent发现Parent Plan输入
- **WHEN** Agent请求Parent Plan record或reconcile的schema/example
- **THEN** CLI MUST返回outcome、architectureDecisions、包含完整实施指令与边界的contributions、finalAcceptance的v2 closed shape及最小合法样例
- **AND** Agent MUST不需要读取产品源码、测试或SQLite来构造输入

### Requirement: CLI 必须登记每日演进 Agent-machine 命令
Buildr CLI MUST 将 Project 每日演进的 `record`、`inspect` 与 `list` 登记为 `agent-machine` 产品表面，并 MUST 要求显式 Project。`record` MUST 接受 closed payload 或等价结构化输入，覆盖日摘要、提交列表、变更文件与可选 Task 关联；他人提交带 Task 时 MUST 失败。`inspect`/`list` MUST 只读。这些命令 MUST NOT 被描述为 primary 人类主路径，也 MUST NOT 提供定时调度或现场 Git 扫描。

#### Scenario: 根帮助列出每日演进
- **WHEN** 用户或 Agent 查看 CLI 帮助中的 Agent-machine 命令
- **THEN** 帮助 MUST 能发现每日演进 record/inspect/list
- **AND** MUST 说明它们写本机文件、可选关联本机 Task，不进入 Git 或 Task SQLite

### Requirement: Parent Plan CLI 必须发现 v2 并稳定区分计划与运行事实
`task parent record|reconcile --schema|--example` MUST 只公开 v2 input；`record` MUST 拒绝 v1 新写入，`reconcile` MUST 允许以 current v1 identity 显式提交完整 v2 完成升级。`inspect` JSON MUST 分别返回 stored Plan schema、rich work-item projection、expected Child、eligibility 与 actual Child binding/delivery facts。

#### Scenario: 发现 v2 schema
- **WHEN** Agent 调用 `task parent record --schema` 或 `--example`
- **THEN** CLI MUST 返回包含 priority/title/objective/directions/boundaries/expectedChild/dependencies 的 v2 closed input
- **AND** MUST 不再推荐 `plannedChildTaskId`

#### Scenario: inspect expected 与 actual
- **WHEN** 一个 work item 同时具有 expected Child 文本和真实 active Child binding
- **THEN** JSON MUST 在不同字段返回预计信息与 actual Child identity/status
- **AND** MUST 不用 `plannedChildTaskId` 或 UI 推导真实状态

### Requirement: Parent coordination CLI 必须只输出v3 canonical字段
`task parent inspect|record|refresh-planning|bind-child|reconcile|accept --json` MUST只输出Parent Coordination v3，并 MUST让业务blocked路径使用同一v3 envelope。非JSON人类可读行为可以保持不变。

#### Scenario: inspect成功
- **WHEN** Agent运行`task parent inspect <task-id> --json`
- **THEN** stdout MUST是单一v3对象且stderr为空
- **AND** MUST不包含任何已删除v2字段

#### Scenario: mutation被拒绝
- **WHEN** Parent action因identity、状态或输入冲突被拒绝
- **THEN** stdout MUST仍是单一v3 blocked对象并保持非零退出
- **AND** diagnostic与effects MUST保持准确

### Requirement: Project CLI必须提供测试地图维护入口
Buildr MUST提供`project verification inspect|validate|update <project>`。`validate`和`update` MUST接收Agent生成的候选文件；`update` MUST要求expected identity并在冲突时零写入。CLI MUST不扫描项目自动生成地图或执行测试。

#### Scenario: 校验候选测试地图
- **WHEN** Agent调用`project verification validate <project> --file <candidate>`
- **THEN** CLI MUST只调用Project Verification Application并返回closed diagnostics
- **AND** 当前`verification.yml` MUST保持不变

### Requirement: Task CLI必须只提供任务验证报告入口
Buildr MUST只提供`task verification record <task-id> --report <json-file>`与`task verification inspect <task-id> [--content-identity <identity>]`。CLI MUST不提供`verification plan|run|cleanup`或`task verification reconcile`。

#### Scenario: 保存完成报告
- **WHEN** Agent调用`task verification record`
- **THEN** CLI MUST只解析报告文件并委托Task Verification Application
- **AND** MUST不启动测试或创建Execution Record

### Requirement: CLI 不得保留旧 Development、Planning Identity 或 Finish history入口
CLI registry与internal workflow router MUST不登记`__internal task-development`、`__internal task-planning-identity`、`task finish inspect`或`task delivery inspect`。调用旧命令 MUST返回标准unknown command且零副作用。

#### Scenario: 调用旧命令
- **WHEN** Agent调用任一已删除CLI或internal route
- **THEN** CLI MUST返回非零unknown command/route诊断
- **AND** Task Record、SQLite、Git和文件 MUST保持不变
