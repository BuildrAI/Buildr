# agent-readable-doctor Specification

## Purpose
定义 Buildr doctor 的 Agent-readable 诊断行为，包括 workspace 层级、Service registry、Git 忽略和 runtime 状态。
## Requirements

### Requirement: doctor 提供 Agent-readable 诊断
Buildr MVP MUST 支持 `buildr doctor --json` 输出 Agent-readable 的结构化诊断结果。

#### Scenario: Agent 请求结构化诊断
- **WHEN** Agent 调用 `buildr doctor --json`
- **THEN** Buildr MUST 输出可被 Agent 稳定解析的 JSON 诊断结果

#### Scenario: 人类查看诊断
- **WHEN** 用户直接调用 `buildr doctor`
- **THEN** Buildr MAY 输出人类可读诊断文本

#### Scenario: Agent 默认事实入口
- **WHEN** Agent 需要判断 Buildr workspace、源资产或 Agent runtime 的当前状态
- **THEN** 面向 Agent 的引导 MUST 要求先识别当前 runtime adapter，并将 `buildr doctor --agent <agent> --json` 作为默认结构化事实入口
- **AND** doctor 输出 MUST 提供足够的下一步上下文，帮助 Agent 判断应编辑源资产、运行 render，还是使用专项检查

#### Scenario: 专项检查作为后续诊断
- **WHEN** doctor 输出识别出 runtime adapter、render、命令清单或其他需要深入检查的专项问题
- **THEN** 面向 Agent 的引导 MAY 指向对应的专项检查命令
- **AND** 专项检查命令 MUST NOT 取代 `doctor --json` 在 Buildr Skill 或 bootstrap 引导中的默认入口地位

### Requirement: doctor 检查 workspace 和层级状态
Buildr MVP MUST 诊断 workspace、Organization、Project 和 Service 的基础状态。

#### Scenario: workspace 未初始化
- **WHEN** 当前目录不是有效 Buildr workspace
- **THEN** `doctor` MUST 报告 workspace 未初始化并提供初始化建议

#### Scenario: 项目资产缺失
- **WHEN** Organization 或 Project 资产目录缺失
- **THEN** `doctor` MUST 报告缺失层级和建议的创建动作

#### Scenario: root shared 不作为默认层级
- **WHEN** `doctor` 在 Buildr root 发现 `shared/`
- **THEN** `doctor` MUST 报告该目录不是默认 service 入口，并建议迁移到某个 Project

### Requirement: doctor 检查 service metadata 和 repo 状态
Buildr MVP MUST 诊断项目级 service metadata 与本地 service repo 的一致性。

#### Scenario: metadata 声明的 repo 缺失
- **WHEN** project service metadata 声明某个 Git repo 但本地路径不存在
- **THEN** `doctor --json` MUST 报告该 service repo 缺失，并给出可供 Agent 引导 clone 的建议

#### Scenario: repo remote 不匹配
- **WHEN** 本地 service repo 的 remote 与 metadata 记录不一致
- **THEN** `doctor --json` MUST 报告不一致状态和修复建议

#### Scenario: 外部本地路径不可访问
- **WHEN** project service metadata 记录的外部本地路径不可访问
- **THEN** `doctor --json` MUST 报告路径不可访问并提示用户确认新路径

### Requirement: doctor 检查 Git 忽略和 runtime 状态
Buildr MVP MUST 诊断 workspace Git 忽略关系和 Agent runtime 投射状态。

#### Scenario: 嵌套 repo 未被忽略
- **WHEN** service repo 嵌套在 workspace 中但未被 workspace `.gitignore` 忽略
- **THEN** `doctor` MUST 报告该风险并建议更新忽略规则

#### Scenario: runtime bridge stale
- **WHEN** Agent runtime 桥接文件存在但已过期或不是 Buildr 管理产物
- **THEN** `doctor` MUST 报告 runtime 状态并建议重新 render 或迁移资产源

#### Scenario: reference bridge metadata stale
- **WHEN** Agent runtime reference bridge 可正常读取规则但只有 hash 元数据过期
- **THEN** `doctor` 默认输出 MUST NOT 将该状态报告为 warning 或 next step
- **AND** `doctor --verbose` MAY 在文本输出中展示该 info
- **AND** `doctor --json --include-info` MUST 在 JSON 中输出该 info
- **AND** 该 info MUST 标记 `userActionRequired` 为 false

### Requirement: doctor 聚合命令行工具清单状态
Buildr doctor MUST 区分 Command catalog、Project requirements 和 machine observation，并 MUST 根据明确 scope 决定当前 readiness。

#### Scenario: root doctor 校验 Commands source
- **WHEN** Agent 在 workspace root 运行 doctor
- **THEN** doctor MUST 校验全部 catalog definitions、Project requirement schemas 和 references
- **AND** machine readiness MUST 只检查 workspace default requirements
- **AND** MUST NOT 因无关 Project binary 缺失而产生 root task warning

#### Scenario: Project doctor 检查有效 requirements
- **WHEN** Agent 使用 Project scope 运行 doctor
- **THEN** doctor MUST 解析该 Project requirements 和 workspace defaults
- **AND** MUST 输出 definition provenance、requirement provenance、合并约束和 machine observation

#### Scenario: Commands source 或 context 无效
- **WHEN** catalog definition 冲突、Project 引用缺失或跨 Project约束不兼容
- **THEN** doctor MUST 报告 error 和稳定 reason code
- **AND** repair plan MUST 指向对应 workspace catalog 或 Project requirement source

#### Scenario: Machine environment 不满足要求
- **WHEN** binary 缺失、版本不满足或版本不可解析
- **THEN** doctor MUST 报告 warning
- **AND** repair plan MAY 展示 catalog install hint
- **AND** MUST NOT 将该 warning 描述为 Buildr 源资产冲突

#### Scenario: 未配置 Commands
- **WHEN** workspace catalog、workspace defaults 和当前 Project requirements 均为空
- **THEN** doctor MUST 将 Commands 状态视为健康空集
- **AND** MUST NOT 报告缺失、warning 或 error

### Requirement: doctor checks Project registry state
Buildr doctor MUST 诊断 root Project registry state 及其与已 materialize Project directories 的一致性。

#### Scenario: Project registry missing
- **WHEN** `buildr doctor --target <root> --json` runs in an initialized workspace without `projects/manifest.yml`
- **THEN** doctor MUST report a warning that the Project registry is missing
- **AND** doctor MUST suggest creating or repairing `projects/manifest.yml`

#### Scenario: registry Project directory missing
- **WHEN** `projects/manifest.yml` declares Project `<project>` but `<root>/projects/<project>/` is missing
- **THEN** doctor MUST report the Project as missing
- **AND** if the registry records a Git URL, doctor MUST include a suggestion that allows Agent to ask whether to clone the Project repo

#### Scenario: orphan Project directory
- **WHEN** `<root>/projects/<project>/` exists but `projects/manifest.yml` does not declare `<project>`
- **THEN** doctor MUST report the directory as an unregistered Project
- **AND** doctor MUST suggest repairing it through `buildr project create <project>` or removing the directory if it is not a Project

#### Scenario: Project title missing
- **WHEN** `projects/manifest.yml` declares Project `<project>` without a title
- **THEN** doctor MUST report that Project navigation metadata is incomplete
- **AND** doctor MUST suggest adding a title or repairing the registry through Buildr CLI

#### Scenario: Project baseline incomplete
- **WHEN** a registered Project directory exists but lacks required Project baseline assets
- **THEN** doctor MUST report the missing Project baseline assets
- **AND** doctor MUST suggest repairing the Project baseline through Buildr CLI

#### Scenario: Project Git metadata inconsistent
- **WHEN** a Project registry entry has `repo.kind: git` and the materialized directory is missing Git metadata or has a mismatched remote
- **THEN** doctor MUST report the Project repo inconsistency
- **AND** doctor MUST include a repair suggestion based on the registry metadata

#### Scenario: Git-managed Project not ignored by root Git
- **WHEN** a Project registry entry has `repo.kind: git` and root `.gitignore` does not ignore `projects/<project>/`
- **THEN** doctor MUST report the nested Project repo ignore risk
- **AND** doctor MUST suggest updating root `.gitignore`

### Requirement: doctor 报告内置能力状态
Buildr doctor MUST 在 Agent-readable 诊断中报告产品内置能力状态。

#### Scenario: 内置能力诊断
- **WHEN** Agent 运行 `buildr doctor --target <dir> --json`
- **THEN** doctor MUST 报告内置能力状态，包括 installed、modified、uninstalled 和 missing 项
- **AND** 每个 finding MUST 包含 severity、userActionRequired 和建议的下一步动作

#### Scenario: 已卸载内置能力作为 info
- **WHEN** 某个内置能力已被显式卸载
- **THEN** doctor SHOULD 将其报告为 info
- **AND** doctor MUST NOT 仅因为显式卸载状态导致 workspace 整体诊断失败

#### Scenario: 期望安装的内置能力缺失
- **WHEN** 某个期望 installed 的内置能力文件缺失
- **THEN** doctor MUST 报告 warning
- **AND** required 能力 MUST 建议 update 或 sync 恢复
- **AND** optional 能力 MUST 建议 restore 或保留卸载状态

#### Scenario: 内置能力被修改
- **WHEN** 某个声明了 version 或 hash 的内置能力与当前 package 版本或 hash 不一致
- **THEN** 除非用户已显式接受或卸载该项，否则 doctor MUST 报告 warning
- **AND** doctor MUST NOT 建议静默覆盖

### Requirement: doctor 报告 manifest 对齐
Buildr doctor MUST 报告 Rules 和 Skills 源资产与 manifest 的对齐状态。

#### Scenario: Rules manifest 不对齐
- **WHEN** `rules/` 下存在未登记的 `.md` 文件，或 `rules/manifest.yml` 登记的文件缺失
- **THEN** doctor MUST 报告 warning
- **AND** `rules/buildr/` 下未登记文件 MUST 使用更高优先级 warning
- **AND** doctor MUST suggest `rules add/remove` or manual manifest repair for user-managed root Rules when applicable
- **AND** doctor MUST report a Rule file kept by `rules remove --keep-file` as unregistered until it is re-registered, moved, or deleted

#### Scenario: Rule metadata 缺失
- **WHEN** `rules/manifest.yml` 中的规则 entry 缺少 `description` 或 description 为空
- **THEN** doctor MUST 报告 warning
- **AND** doctor MUST 提示 Agent 补充该规则的语义边界和用途
- **AND** doctor MUST describe description as metadata for Agent relevance judgment rather than as a structured routing rule

#### Scenario: Skills manifest 不对齐
- **WHEN** `skills/` 下存在未登记的 Skill 目录，或 `skills/manifest.yml` 登记的目录缺失
- **THEN** doctor MUST 报告 warning
- **AND** `skills/buildr/` 下未登记目录 MUST 使用更高优先级 warning

### Requirement: doctor 报告 AGENTS required block
Buildr doctor MUST 报告根 `AGENTS.md` 是否保留 Buildr required block。

#### Scenario: required block 缺失或损坏
- **WHEN** 根 `AGENTS.md` 缺少或破坏 Buildr required block
- **THEN** doctor MUST 报告 warning
- **AND** doctor MUST 说明 update/sync 会只恢复 required block，不覆盖用户正文

#### Scenario: Codex runtime 当前有效
- **WHEN** 根 `AGENTS.md` 的 required block 有效且 Codex Skills runtime 投射为最新
- **THEN** doctor MUST 报告 Codex runtime 为 up to date

### Requirement: doctor filters runtime checks by Agent
Buildr doctor MUST 支持 Agent-readable 诊断按当前 Agent runtime 过滤 runtime checks。

#### Scenario: Supported Agent-specific doctor
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent codex --json`
- **THEN** doctor MUST 对适用 scopes 运行 Codex runtime diagnostics
- **AND** doctor MUST NOT 在 top-level findings 或 nextSteps 中报告 Claude Code runtime missing、stale、warning 或 conflict findings

#### Scenario: Another supported Agent-specific doctor
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent claude-code --json`
- **THEN** doctor MUST 对适用 scopes 运行 Claude Code runtime diagnostics
- **AND** doctor MUST NOT 在 top-level findings 或 nextSteps 中报告 Codex runtime missing、stale、warning 或 conflict findings

#### Scenario: Doctor reports selected Agent
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent <agent> --json`
- **THEN** doctor JSON MUST 包含 requested Agent runtime id
- **AND** doctor JSON MUST 包含 requested Agent runtime 是否 supported
- **AND** runtime findings MUST 能归因到 selected Agent runtime

#### Scenario: Agent filter does not change scope discovery
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent <agent> --json` 且不传 `--scope`
- **THEN** doctor MUST 保持现有 workspace root 和已发现 Project scopes 的 scope discovery 行为
- **AND** `--agent` MUST 只过滤 diagnostics 使用的 runtime adapter

#### Scenario: Scoped runtime repair command
- **WHEN** doctor 针对某个 Buildr scope 报告 runtime render finding
- **THEN** repair commands MUST 包含修复该 finding 所需的 scope
- **AND** Project scope finding MUST NOT 通过只 render workspace root scope 的命令修复

### Requirement: doctor handles unsupported Agent runtimes
Buildr doctor MUST 将 unsupported Agent runtime 视为 unsupported adapter，而不是缺失 runtime 文件。

#### Scenario: Unsupported Agent-specific doctor
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent unsupported-agent --json`
- **THEN** doctor MUST NOT 运行任何 concrete runtime adapter checker
- **AND** doctor MUST 输出 finding 说明 Buildr 不支持 `unsupported-agent`
- **AND** 该 finding MUST 具有 warning severity，并递增 warning summary
- **AND** 该 finding MUST 设置 `userActionRequired` 为 true
- **AND** 该 finding MUST 包含 `mustNotUseFallbackAdapter: true`
- **AND** 该 finding MUST 告诉用户联系 Buildr 作者反馈该 Agent
- **AND** doctor MUST 继续检查不依赖 runtime adapter 的 workspace source assets
- **AND** 除非发现非 runtime-check 的 source asset error，doctor MUST 成功退出

#### Scenario: Unsupported Agent does not create adapter missing noise
- **WHEN** doctor 收到 unsupported Agent runtime id
- **THEN** doctor MUST NOT 仅因为该 Agent 没有 adapter 而报告 `.claude/`、`.agents/`、`CLAUDE.md` 或其他 adapter-specific 文件缺失
- **AND** doctor MUST NOT 为该 unsupported Agent render 或 export bootstrap files

### Requirement: doctor validates Agent id format
Buildr doctor MUST 在 runtime adapter selection 前拒绝非法 Agent id。

#### Scenario: Invalid Agent id
- **WHEN** Agent 运行 `buildr doctor --agent "Cursor Agent" --target <root> --json`
- **THEN** doctor MUST 拒绝该参数
- **AND** error MUST 说明 Agent ids 只能包含 letters、digits、dots、underscores 或 dashes

#### Scenario: Case-sensitive unsupported Agent id
- **WHEN** Agent 运行 `buildr doctor --agent Codex --target <root> --json`
- **THEN** doctor MUST 将 `Codex` 视为 unsupported
- **AND** doctor MUST NOT 将它归一化为 `codex`

### Requirement: doctor remains backward compatible without Agent filter
Buildr doctor MUST 保持未传 Agent runtime filter 的公开调用兼容性，但 MUST NOT 将全部 supported adapters 解释为当前 workspace 已安装或必须维护的 runtime。

#### Scenario: Doctor without Agent filter
- **WHEN** 调用方运行 `buildr doctor --target <root> --json` 且不传 `--agent`
- **THEN** doctor MUST 从 Buildr managed marker、projection receipt 或等价受管证据发现当前 workspace 的 present runtime inventory
- **AND** doctor MUST 只运行 present adapters 的 runtime diagnostics
- **AND** doctor JSON MUST 报告实际 `detectedAgents` 和 `checkedAgents`
- **AND** Buildr onboarding guidance MUST 在 Agent identity 已知后优先传入 `--agent <agent>`

#### Scenario: Supported adapter 在 workspace 中不存在
- **WHEN** 一个 adapter 位于 supported registry，但 workspace 没有该 adapter 的受管投射证据
- **THEN** 默认 doctor MUST NOT 对该 adapter 运行 checker
- **AND** MUST NOT 为该 adapter 生成 missing、stale、warning、repair plan 或 nextSteps

#### Scenario: Present runtime 未被选为当前 Agent
- **WHEN** 默认 doctor 发现一个 present runtime 的投射 drift，但调用方没有显式选择该 adapter
- **THEN** doctor MAY 在 runtime inventory 中保留该 drift evidence
- **AND** 顶层聚合 finding MUST 设置 `userActionRequired: false`
- **AND** 该 drift MUST NOT 单独降低通用 workspace `health.ready`

### Requirement: doctor 诊断递归 AGENTS runtime 投射
Buildr doctor and runtime check MUST diagnose the canonical scope's ancestor Rules chain and recursively discovered `AGENTS.md` subtree using the selected adapter's projection behavior.

#### Scenario: Codex recursive Rules diagnostics
- **WHEN** Agent runs Codex runtime diagnostics for a Project or Service canonical scope
- **THEN** diagnostics MUST report every applicable and recursively discovered `AGENTS.md` as a native Rules source
- **AND** diagnostics MUST NOT report missing Codex bridge files

#### Scenario: Rendered adapter recursive diagnostics
- **WHEN** Agent runs runtime diagnostics for an adapter whose `rules-entry` is rendered
- **THEN** diagnostics MUST compare every discovered `AGENTS.md` with its expected same-directory runtime bridge
- **AND** diagnostics MUST report missing、stale、conflict and orphan managed bridge states

#### Scenario: Canonical repair commands
- **WHEN** diagnostics report a Rules projection finding for a Service or deeper scope
- **THEN** every suggested repair command MUST use the canonical workspace-relative scope
- **AND** repair commands MUST NOT use the legacy Service scope shorthand

#### Scenario: Doctor deduplicates recursive findings
- **WHEN** doctor aggregates workspace and Project diagnostics that discover the same Rules source or target
- **THEN** doctor MUST emit one finding per adapter、canonical source and target identity
- **AND** summary counts and next steps MUST NOT duplicate that finding

#### Scenario: Recursive scope boundary finding
- **WHEN** discovery encounters an unregistered nested Git repo or excluded runtime/dependency/build directory
- **THEN** diagnostics MUST NOT treat skipped descendant `AGENTS.md` as missing runtime sources
- **AND** verbose or structured diagnostic metadata MUST make the applied discovery boundary identifiable

### Requirement: Doctor 聚合 Component 状态
Buildr doctor MUST 诊断 workspace Component registry、已安装定义、成员完整性、ownership 和当前 Agent runtime 对齐状态。

#### Scenario: Component registry 缺失或非法
- **WHEN** 已初始化 workspace 缺少 `components/manifest.yml` 或 schema 非法
- **THEN** doctor MUST 报告 error 或可迁移 warning
- **AND** doctor MUST 提供 update 或修复 registry 的下一步

#### Scenario: Component 成员完整
- **WHEN** enabled Component 定义有效、全部成员匹配 integrity 且没有 ownership conflict
- **THEN** doctor MUST 将 Component 报告为 installed
- **AND** doctor JSON MUST 列出 Component version、source 和成员摘要

#### Scenario: Component 修改或缺失
- **WHEN** enabled Component 的成员内容不同于 installed definition 或成员缺失
- **THEN** doctor MUST 报告 modified 或 missing 状态
- **AND** doctor MUST 标识具体成员、预期 integrity、实际差异和安全下一步

#### Scenario: Component 已卸载
- **WHEN** Component registry entry 为 disabled 且 uninstalled
- **THEN** doctor 默认 MUST NOT 将其报告为 warning
- **AND** `--include-info` 时 doctor MUST 输出该显式状态和可用的 install 动作

#### Scenario: Component runtime 过期
- **WHEN** Component 源资产已更新或卸载但指定 Agent runtime 仍缺失、过期或残留成员投射
- **THEN** doctor MUST 报告 runtime warning
- **AND** doctor MUST 提供对应 adapter 的 reconcile 动作

### Requirement: doctor 报告 mutation transaction 状态
Buildr doctor MUST 检查 workspace mutation lock、transaction metadata、staging 和 backup，并以 Agent-readable finding 报告无法证明完成的操作。

#### Scenario: Workspace 没有残留 mutation
- **WHEN** workspace 不存在 active 或 incomplete mutation artifacts
- **THEN** doctor MUST NOT 报告 transaction error

#### Scenario: 发现不完整 transaction
- **WHEN** doctor 发现 lock、journal、staging 或 backup 表明 source mutation 未完整结束
- **THEN** doctor MUST 报告 error 和稳定 finding code
- **AND** finding MUST 包含 transaction id、operation、受影响路径、已知 phase 和不破坏 backup 的 next action

#### Scenario: 后续 mutation 被阻塞
- **WHEN** incomplete transaction 尚未恢复或明确清理
- **THEN** doctor MUST 标记 workspace source mutation 为 blocked
- **AND** runtime 只读诊断 MUST 仍可运行

### Requirement: doctor 严格验证 canonical workspace identity
Buildr doctor MUST 使用 canonical workspace 必要资产判断 workspace validity，并区分有效、不完整与不存在。

#### Scenario: canonical workspace identity 有效
- **WHEN** 根 `AGENTS.md`、`.buildr/workspace.yml` 和 `projects/` 均存在
- **THEN** doctor MUST 将 workspace identity 报告为 `valid`
- **AND** `workspace.initialized` MUST 为 true

#### Scenario: workspace identity 不完整
- **WHEN** 目标目录存在部分但不是全部 canonical workspace 必要资产
- **THEN** doctor MUST 将 workspace identity 报告为 `incomplete`
- **AND** `workspace.initialized` MUST 为 false
- **AND** doctor MUST 报告缺失的必要资产和可执行的初始化或恢复建议

#### Scenario: workspace identity 不存在
- **WHEN** 目标目录不存在任何 canonical Buildr workspace 痕迹
- **THEN** doctor MUST 将 workspace identity 报告为 `absent`
- **AND** doctor MUST 报告 workspace 未初始化

### Requirement: doctor 分离兼容成功状态与 readiness
Buildr doctor MUST 保留 `ok` 的既有无 error 语义，并独立报告 workspace validity、readiness 与 action requirement；聚合 finding MUST 保留其来源 findings 的 actionability，且只有通用 workspace/source 检查或显式 selected runtime 的 actionable finding 能降低当前 readiness。

#### Scenario: Selected runtime 存在 actionable warning
- **WHEN** doctor 显式选择 runtime，且该 runtime 没有 error 但存在至少一个需要用户行动的 warning
- **THEN** `ok` MUST 为 true
- **AND** `health.workspaceValid` MUST 反映 canonical workspace identity
- **AND** `health.ready` MUST 为 false
- **AND** `health.actionRequired` MUST 为 true
- **AND** `health.actionableCount` MUST 包含该 warning

#### Scenario: workspace 可直接继续工作
- **WHEN** canonical workspace identity 有效且通用检查及 selected runtime 不存在需要用户行动的 warning 或 error
- **THEN** `health.workspaceValid` MUST 为 true
- **AND** `health.ready` MUST 为 true
- **AND** `health.actionRequired` MUST 为 false

#### Scenario: 非行动信息不降低 readiness
- **WHEN** finding 明确设置 `userActionRequired: false`
- **THEN** 该 finding MUST NOT 计入 `health.actionableCount`
- **AND** 该 finding MUST NOT 单独使 `health.ready` 变为 false

#### Scenario: 聚合全部非行动型 runtime warnings
- **WHEN** 某个 scope/adapter 的全部 runtime warnings 都明确设置 `userActionRequired: false`
- **THEN** 顶层 runtime warning MUST 保留 warning severity 和来源诊断摘要
- **AND** 顶层 runtime warning MUST 设置 `userActionRequired: false`
- **AND** `health.ready` MUST NOT 因该聚合 warning 变为 false
- **AND** `repairPlan` 和 `nextSteps` MUST NOT 为该聚合 warning 生成修复动作

#### Scenario: Selected runtime 聚合混合 warnings
- **WHEN** selected runtime 的某个 scope 同时包含行动型与非行动型 runtime warnings
- **THEN** 顶层 runtime warning MUST 设置 `userActionRequired: true`
- **AND** 顶层 finding MUST 保留全部来源 warning codes
- **AND** `health.actionRequired` MUST 为 true

#### Scenario: 未选中 runtime 聚合混合 warnings
- **WHEN** 默认 inventory diagnostics 在未选中 runtime 中发现行动型与非行动型 runtime warnings
- **THEN** 顶层 inventory warning MUST 设置 `userActionRequired: false`
- **AND** MUST NOT 进入 `repairPlan` 或 `nextSteps`
- **AND** `health.ready` MUST NOT 因该 runtime 变为 false

### Requirement: doctor 声明默认与专项诊断层级
Buildr doctor MUST 在 Agent-readable 结果中声明默认核心、条件通用和显式专项诊断边界。

#### Scenario: 默认 doctor 输出诊断 profile
- **WHEN** Agent 运行 `buildr doctor --json`
- **THEN** JSON MUST 区分 `core`、`conditional` 和 `specialty` 诊断层级
- **AND** 条件通用检查 MUST 仅在相关资产、scope 或 runtime adapter 适用时执行

#### Scenario: 默认 doctor 保持轻量
- **WHEN** 用户没有显式进入专项诊断
- **THEN** doctor MUST NOT 检查 Git dirty、ahead 或 behind 状态
- **AND** doctor MUST NOT 深检 OpenSpec active change
- **AND** doctor MUST NOT 运行 build 或 test

#### Scenario: finding 需要专项检查
- **WHEN** 默认 doctor 只能识别某类问题而不能完成场景化验证
- **THEN** diagnostic profile 或 repair guidance MUST 指向适用的已有专项命令或明确的专项场景
- **AND** doctor MUST NOT 为不存在的统一命令生成虚假命令

### Requirement: doctor 输出根因化 repair plan
Buildr doctor MUST 从 actionable findings 生成有优先级、去重且 Agent-readable 的 repair plan，并保留兼容的 `nextSteps`。

#### Scenario: 多个 findings 共享修复动作
- **WHEN** 多个 actionable findings 具有相同 commands 集合或相同 suggestion
- **THEN** `repairPlan` MUST 合并为一个 repair step
- **AND** repair step MUST 保留所有关联 finding codes
- **AND** `nextSteps` MUST NOT 重复该动作

#### Scenario: error 与 warning 同时存在
- **WHEN** actionable error 和 warning 同时存在
- **THEN** error 对应 repair step MUST 排在 warning 对应步骤之前
- **AND** 每个 repair step MUST 标识其 priority

#### Scenario: finding 不要求用户行动
- **WHEN** finding 的 `userActionRequired` 为 false 或没有可执行 suggestion/commands
- **THEN** 该 finding MUST NOT 产生 repair step

### Requirement: doctor 抑制未登记 Project 的派生噪音
Buildr doctor MUST 将 Project registry 作为 Project baseline 和 Service metadata 诊断的前置事实。

#### Scenario: orphan Project directory 只有登记根因
- **WHEN** materialized Project directory 未在 `projects/manifest.yml` 登记
- **THEN** doctor MUST 报告 `projects.unregistered` 根因
- **AND** doctor MUST NOT 同时为该目录报告 Project baseline incomplete
- **AND** doctor MUST NOT 同时为该目录报告 Service manifest missing

#### Scenario: Project 登记后继续下游诊断
- **WHEN** Project directory 已在 registry 登记
- **THEN** doctor MUST 按现有契约继续检查 Project baseline 和 Service metadata

### Requirement: doctor 必须只读诊断 Workspace Node toolchain
`buildr doctor` MUST 分别检查当前 Buildr 主进程 runtime role 与 Workspace Node 声明/受管 runtime。npm 主进程 MUST 匹配其 formal Host Node identity 与 `engines.node`，development 主进程 MUST 匹配其 checkout runtime identity，Workspace-owned npm、验证、Finish adapter 和项目执行环境 MUST 匹配 Workspace Node identity；Doctor MUST 保持只读，不得要求这些 role 解析为同一 Node，也不得报告当前不存在的 Product Node/platform role。

#### Scenario: Node toolchain 健康
- **WHEN** 当前 npm/development installation runtime identity 有效，Workspace 声明有效、受管 runtime probe 成功且 Workspace-owned execution environment 匹配声明
- **THEN** doctor MUST 分字段报告 Host/development main runtime 与 Workspace Node identity、role 和健康状态
- **AND** MUST NOT 修改 metadata、下载 runtime、重写 PATH 或因版本相同合并两个 identity

#### Scenario: runtime 缺失
- **WHEN** Workspace 声明有效但对应受管 Workspace Node runtime 不存在
- **THEN** doctor MUST 保留当前 Host/development main runtime 健康结论，并为 Workspace-owned execution 返回稳定 warning/error finding 与 `buildr sync <agent> --target <workspace>` 修复建议
- **AND** MUST NOT 直接安装 runtime 或建议 npm package/Launcher update 修复 Workspace Node

#### Scenario: CLI 或 npm 漂移
- **WHEN** 当前 npm 主进程不满足 formal Host Node identity/engines、development runtime 与 checkout identity 不符，或 Workspace-owned npm/验证环境不匹配 Workspace Node
- **THEN** doctor MUST 按 runtime role 报告每个实际 executable/version 与期望 identity
- **AND** MUST NOT 因另一个 role 的 Node 满足 `engines.node`、版本相同或可从 PATH 发现而把漂移视为健康

### Requirement: Doctor JSON 默认提供紧凑诊断
Buildr MUST 让 `doctor --json` 默认返回紧凑、稳定且足以判断健康状态和后续动作的结构化结果，并 MUST 仅在调用方显式请求时返回完整诊断 inventory。

#### Scenario: 默认 JSON 使用 compact detail
- **WHEN** Agent 运行 `buildr doctor --target <root> --json` 且没有传入 `--detail`
- **THEN** Doctor JSON MUST 包含 schema identity、目标、scope、Agent runtime、`ok`、summary、health、findings、repair plan 和 next steps
- **AND** 默认结果 MUST NOT 包含完整 capability graph、Component ownership、Builtin inventory、Command inventory 或 runtime inventory

#### Scenario: 显式请求完整诊断
- **WHEN** Agent 运行 `buildr doctor --target <root> --json --detail full`
- **THEN** Doctor MUST 返回完整诊断 read model
- **AND** 完整结果 MUST 保持与相同检查产生的 compact 结果一致的 `ok`、summary、health、findings、repair plan 和 next steps

#### Scenario: 显式请求紧凑诊断
- **WHEN** Agent 运行 `buildr doctor --target <root> --json --detail compact`
- **THEN** Doctor MUST 返回与默认 `doctor --json` 相同的紧凑字段集合

#### Scenario: 完整结果超过进程默认缓冲区
- **WHEN** 一个健康 Workspace 的 full Doctor JSON 超过 1 MiB
- **THEN** 默认 compact Doctor JSON MUST 仍可完整输出并保持健康判定
- **AND** Buildr MUST NOT 通过截断 JSON 来缩小结果

### Requirement: Doctor 从 canonical ownership receipt 发现 Agent runtime
Buildr Doctor MUST 从 `.buildr/agent-runtime/<destination>/<adapter>/skill-projection-ownership-receipts/` 发现和诊断当前 Workspace 的受管 Skill runtime，并 MUST 把旧 runtime-root receipt 仅作为迁移诊断输入。

#### Scenario: 未指定 Agent 时发现 canonical runtime
- **WHEN** Doctor 未传 `--agent` 且某 adapter 的 canonical workspace receipt root 含有效回执
- **THEN** Doctor MUST 将该 adapter 纳入 `detectedAgents` 和 `checkedAgents`
- **AND** MUST 使用 canonical receipt 诊断 runtime Skill 文件

#### Scenario: 只发现 legacy runtime receipt
- **WHEN** canonical receipt root 为空但旧 adapter runtime root 含有效 receipt
- **THEN** Doctor MUST 识别该 adapter 并报告需要运行适用 sync、render 或 Skill install 完成迁移
- **AND** Doctor MUST 保持只读且不得把 legacy 状态报告为 canonical healthy

#### Scenario: Canonical 与 legacy receipt 冲突
- **WHEN** Doctor 发现同一 adapter/runtime path 的 canonical 与 legacy receipt 不等价
- **THEN** Doctor MUST 报告 actionable ownership conflict
- **AND** repair plan MUST 要求保留现场并核对两份 identity，不能建议直接删除任一侧

### Requirement: Doctor 与 status 必须投影 npm 安装、Launcher 与运行时身份
Doctor 与 installation/Launcher status MUST 从 formal npm installation registry、development identity、Launcher bindings 与当前 instance receipt 分别投影 npm、development、当前运行实例和本地图形 Launcher。每项 MUST 显示版本、路径、runtime role/source、protocol、payload 与 ownership identity；不得扫描 PATH、根据文件名猜来源或报告当前不存在的 platform channel。

#### Scenario: npm 与 development 并存
- **WHEN** 同一用户登记了 npm installation、npm-owned Launcher 与 development launcher
- **THEN** Doctor/status MUST 分别展示 npm package/prefix/Host Node、npm Launcher binding、development checkout/runtime 与当前 instance
- **AND** 版本相同 MUST NOT 合并 installation 或 ownership lifecycle

#### Scenario: Launcher binding 漂移
- **WHEN** binding 的 Host Node、entry、package root、prefix、payload 或 ownership receipt 与文件事实不符
- **THEN** Doctor/status MUST 将 Launcher 标记为 stale 或 invalid 并提供 `launcher repair|uninstall` 下一步
- **AND** MUST NOT 用 PATH 中可运行的另一个 Buildr 将状态修正为 ready

#### Scenario: 当前 Web instance
- **WHEN** current instance receipt 指向 canonical loopback 并能通过 secret-protected health probe
- **THEN** status MUST 展示 readiness、PID、npm/development channel、Host/development runtime 与完整 product identity
- **AND** MUST NOT 泄露 instance secret
