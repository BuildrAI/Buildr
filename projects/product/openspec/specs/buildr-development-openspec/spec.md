# Buildr 自身 OpenSpec 开发规范

## Purpose

定义 Buildr 自身开发如何使用 OpenSpec 管理计划型产品工作、长期文档和可实施变更的分工，以及 OpenSpec 自举对现有 runtime 行为的边界。
## Requirements

### Requirement: Buildr 计划型产品工作使用 OpenSpec
Buildr MUST 使用 OpenSpec change 来规划产品能力、跨领域规则、CLI 行为变更和影响架构的工作，然后再进入实现。

#### Scenario: 开始产品能力开发
- **WHEN** 维护者决定实现一个新的 Buildr 产品能力
- **THEN** 该工作 MUST 先表示为包含 proposal、design、specs 和 tasks 的 OpenSpec change，然后再开始实现

#### Scenario: 探索文档准备进入实现
- **WHEN** 设计文档描述的方向已经准备进入可执行工作
- **THEN** MUST 创建新的 OpenSpec change，引用该文档并将范围收敛为可实施的需求和任务

### Requirement: Buildr 文档和 OpenSpec artifacts 分工明确
Buildr MUST 将长期概念设计保留在 `docs/`，并使用 OpenSpec artifacts 表达具体、可实施的变更。

#### Scenario: 讨论长期产品想法
- **WHEN** 维护者记录广泛的架构、产品或治理方向
- **THEN** 信息 MUST 写入 `docs/`，而不是直接视为实施计划

#### Scenario: 具体实现准备开始
- **WHEN** 维护者决定从某个产品方向中构建具体能力
- **THEN** 该能力 MUST 被捕获为包含明确需求和任务的 OpenSpec change

### Requirement: OpenSpec 自举不改变 runtime 行为
OpenSpec 自举变更 MUST NOT 修改现有 Buildr CLI runtime check、render 或 adapter 行为。

#### Scenario: 应用自举变更
- **WHEN** OpenSpec 自举变更被实施
- **THEN** 现有 Buildr runtime 命令 MUST 保持原有行为

### Requirement: Buildr 产品文档分层
Buildr MUST 将产品入口、产品理解、当前事实、行为契约和历史参考分层维护，避免同一事实在 README、docs、knowledge 和 specs 中重复成为事实源。Project current knowledge MUST 按概览、术语、产品架构、技术架构、核心流程和 Service 说明组织真实当前事实，并 MUST 只在存在已确认内容或真实 Change 影响时逐步创建或更新对应文档。

#### Scenario: README 作为产品入口
- **WHEN** Buildr 维护根 `README.md`
- **THEN** README MUST 作为产品入口和快速开始文档
- **AND** README MUST link to 产品理解文档、current-state knowledge 和 OpenSpec specs
- **AND** README MUST NOT 承担当前实现事实全集或产品路线图职责

#### Scenario: docs 承载产品理解
- **WHEN** Buildr 维护 `docs/` 下的当前产品文档
- **THEN** 当前产品理解 SHOULD 聚合到 `docs/buildr-product.md` 或等价单一主文档
- **AND** 该文档 SHOULD 解释产品定位、核心模型、工作资产、协作方式、runtime 高层模型、MVP 边界摘要和后续方向
- **AND** 该文档 MUST NOT 作为当前实现事实的唯一来源

#### Scenario: knowledge 承载当前事实
- **WHEN** Buildr 记录已经实现的产品事实
- **THEN** facts MUST be maintained in `openspec/knowledge/overview.md`、`glossary.md`、`architecture/`、`flows/`、`services/` 或职责等价的 current-state knowledge assets
- **AND** facts MUST be written as current-state statements aligned with `openspec/specs/` and the current implementation
- **AND** knowledge MUST NOT include product value propositions, future roadmap, historical rationale, or design philosophy as current facts

#### Scenario: 产品与技术架构分开维护
- **WHEN** Buildr 同时记录产品模型和技术系统事实
- **THEN** 产品架构 MUST 维护用户、角色、业务能力、领域模块、产品边界和信息架构
- **AND** 技术架构 MUST 维护系统、Service、模块、数据所有权、接口依赖、runtime、部署和安全边界
- **AND** `architecture/index.md` MUST 在两类真实文档存在时提供统一摘要与导航

#### Scenario: Change 只影响部分当前认知
- **WHEN** current-knowledge assessment 只识别到一个或部分真实影响目标
- **THEN** Agent MUST 只创建或更新对应文档
- **AND** MUST NOT 为保持目录形式完整生成其他空文档

#### Scenario: specs 承载行为契约
- **WHEN** Buildr 记录规范性产品行为
- **THEN** MUST / SHOULD level requirements MUST be maintained in `openspec/specs/`
- **AND** specs MUST NOT be replaced by explanatory docs or knowledge notes

#### Scenario: archive 不是当前事实源
- **WHEN** Buildr moves old product docs into `docs/archive/` or archives an OpenSpec Change
- **THEN** archived assets MUST be treated as historical notes and provenance
- **AND** archived assets MUST NOT be treated as current Buildr product source of truth

### Requirement: Buildr 未来规划资产使用明确 Roadmap 语境
Buildr MUST 将尚未实现但仍保留为产品方向的详细资料维护在明确的 Roadmap 语境中，并 MUST 将其与当前事实、行为契约、可执行规则、Skills 和历史 archive 区分。

#### Scenario: 保留尚未实现的详细产品方向
- **WHEN** Buildr 维护尚未实现的角色 Agent、工作流或产品能力详细资料
- **THEN** 资料 MUST 位于 `docs/roadmap/` 或等价的明确未来规划位置
- **AND** 资料 MUST 显著说明其尚未实现且不是当前产品事实或可执行资产
- **AND** 资料 MUST NOT 使用会把未来方向表述为 Buildr 当前已提供能力的承诺性口吻

#### Scenario: 从产品入口发现未来规划
- **WHEN** 维护者从 Buildr 产品 README、产品主说明或文档索引查找后续方向
- **THEN** 文档 MUST 提供可发现的 Roadmap 入口
- **AND** 入口 MUST 说明 Roadmap 不替代 current-state knowledge、canonical specs 或 active OpenSpec change

#### Scenario: 未来方向准备进入实现
- **WHEN** Roadmap 中的某个方向准备进入具体实现
- **THEN** 维护者 MUST 为该方向创建独立 OpenSpec change 并收敛可实施范围
- **AND** Roadmap 文档本身 MUST NOT 被视为已经批准或完成的实现契约

#### Scenario: 移动未来资料不改写历史事实
- **WHEN** 维护者把误放在当前产品资产面的未来资料移动到 Roadmap
- **THEN** 当前产品入口和仍有效的文档引用 MUST 指向新位置
- **AND** historical OpenSpec archive MUST NOT 为适配新路径而被回改
- **AND** 若资料不属于 package 发布边界，移动 MUST NOT 将其隐式加入 workspace baseline 或 Agent runtime

### Requirement: Buildr 自有 OpenSpec 文档使用中文
Buildr MUST 使用中文编写自有 OpenSpec artifact 和相关用户可见说明；命令、路径、代码标识符、协议字段、YAML/frontmatter 以及 OpenSpec 格式关键字可以保留英文。

#### Scenario: Agent 采用 OpenSpec 创建或维护 artifact
- **WHEN** Agent 创建或更新 Buildr 自有的 proposal、design、spec、task 或面向用户的 OpenSpec 状态说明
- **THEN** 叙述性正文 MUST 使用中文
- **AND** Agent MUST 保留命令、路径、代码标识符和 OpenSpec 格式关键字的原文

#### Scenario: 文档来自外部 OpenSpec 生成器
- **WHEN** `openspec-*` Skill 或其他文档由 OpenSpec 上游生成并作为外部内容加载
- **THEN** Buildr MUST NOT 为本地化而修改该内容

### Requirement: Buildr 产品候选版本必须完成隔离验证
Buildr 产品开发 MUST 区分 Product Project、用户交付资产源、task worktree 和主自举 workspace，并在最终候选 Git tree 上完成隔离验证。

#### Scenario: 产品开发限制在 task worktree 的 Product Project
- **WHEN** 维护者在 task worktree 中实现 Buildr 产品能力或修改用户交付资产源
- **THEN** 正式产品源变更和 OpenSpec change artifacts MUST 只发生在该 task worktree 的 `projects/product/`
- **AND** 维护者 MUST NOT 通过同步或手工编辑主 workspace 根中的产品安装结果来代替修改 Product Project

#### Scenario: 从用户视角验证交付资产
- **WHEN** 变更影响 `package/targets/`、bootstrap、CLI 或 runtime adapter
- **THEN** 产品验证 MUST 覆盖新用户初始化、已有 workspace 更新和日常 Agent 使用路径中的相关部分
- **AND** 产品验证 MUST 使用临时用户 workspace 或 task worktree 自身，避免修改主自举 workspace

#### Scenario: 最终候选 tree 完成产品验证
- **WHEN** 维护者已经完成 rebase、冲突解决和本次任务的内容修改
- **THEN** 维护者 MUST 对准备集成的最终候选 Git tree 运行项目要求的完整验证
- **AND** 验证通过前 MUST NOT 将该 tree 作为已验证候选集成

#### Scenario: 相同 tree 完成后续 Git 动作
- **WHEN** commit、集成、push 或 worktree 清理没有改变已验证候选的 Git tree
- **THEN** 维护者 MUST 复用 worktree 中的验证结果
- **AND** 维护者 MUST NOT 在主开发分支重复运行相同产品 E2E

#### Scenario: 验证后的候选 tree 改变
- **WHEN** rebase、冲突解决、后续编辑或集成过程改变已验证候选的 Git tree
- **THEN** 维护者 MUST 将原验证结果视为失效
- **AND** 维护者 MUST 在集成前对新 tree 重新运行受影响的验证

#### Scenario: 实际自举 workspace 更新
- **WHEN** 维护者在集成后选择使用当前产品 checkout 更新实际自举 workspace
- **THEN** update/sync MUST 被视为独立的 workspace 状态变更，而不是第二轮产品 E2E
- **AND** 状态变更后 MUST 按 Buildr Core 运行当前 Agent doctor

### Requirement: OpenSpec apply 阶段批量安排验证
Buildr 产品 OpenSpec change 的 apply 阶段 MUST 以任务组为单位安排受影响范围验证，并 MUST 仅在候选冻结后执行产品级完整验证。

#### Scenario: Apply 期间完成普通实现任务
- **WHEN** Agent 在 task worktree 中完成任务组内的普通实现任务
- **THEN** Agent MUST 更新任务进度并执行必要的最小反馈检查
- **AND** Agent MUST NOT 因单个任务完成而默认执行产品级总验证或临时 workspace E2E

#### Scenario: Apply 到达任务组边界
- **WHEN** 相互关联的实现与对应测试或断言已经完成
- **THEN** Agent MUST 对该组运行一次能够覆盖受影响面的专项验证
- **AND** 验证结果 MUST 作为继续后续任务或进入候选冻结的依据

#### Scenario: 候选冻结门禁
- **WHEN** change 的实现、文档、自然语言代码、所需 runtime 同步和 review 修订全部完成
- **THEN** Agent MUST 在最终候选 tree 上运行产品要求的完整验证入口
- **AND** Agent MUST NOT 在候选仍预期发生内容修改时提前反复运行完整验证

#### Scenario: 验证失败后恢复 Apply
- **WHEN** 完整验证发现失败并导致候选内容需要修改
- **THEN** Agent MUST 退出候选冻结状态并恢复受影响范围的实现与专项验证
- **AND** 所有修复稳定后 MUST 对新的最终候选重新运行一次完整验证

#### Scenario: 外部 OpenSpec workflow 保持上游所有权
- **WHEN** Buildr 为 apply 阶段增加分层验证编排
- **THEN** 该编排 MUST 由 Buildr-owned 项目契约或任务 Skills 承载
- **AND** Buildr MUST NOT 为此直接修改 Component 管理的外部 `openspec-apply-change` Skill

### Requirement: Buildr 产品验证完成报告必须呈现耗时
Buildr 产品任务在最终候选完整验证后 MUST 向维护者汇报 timing summary 的总耗时、最慢阶段、失败阶段（如有）和文件路径，并 MUST 将该约定限制在 Product Project 而非通用 Buildr workspace Skill。

#### Scenario: 最终候选验证成功
- **WHEN** Agent 完成 Buildr 产品最终候选验证
- **THEN** Agent MUST 汇报总耗时、最慢阶段及 timing summary 路径
- **AND** Agent MUST NOT 仅因耗时高于此前运行而报告验证失败

#### Scenario: 最终候选验证失败
- **WHEN** 产品完整验证在某阶段失败
- **THEN** Agent MUST 汇报失败阶段、已记录总耗时和 timing summary 路径
- **AND** Agent MUST 按产品验证恢复流程继续修复而非隐藏失败

### Requirement: Buildr 公开文档本地化必须保持单一范围
Buildr MUST 为根 README 提供中文主文档和英文翻译，但 MUST NOT 要求其他产品、开发、OpenSpec 或治理文档为了最小开源而复制双语版本。

#### Scenario: 维护公开文档
- **WHEN** 维护者更新最小开源文档
- **THEN** `README.md` 与 `README.en.md` MUST 保持产品入口语义对齐
- **AND** 其他文档 MUST 按当前 Project 管理语言维护

### Requirement: Project knowledge 区分当前事实与任务看板
Buildr Project `openspec/knowledge/` MUST 保持 current-state knowledge、canonical specs、active changes 和历史 archive 的职责边界；既有 `task-boards/*.html` 与 `task-cockpits/*.html` MUST 仅作为历史任务页面原地保留，不得被解释为当前 Task、进度、证据或协调 authority，也不得因产品升级被迁移、重写、删除或重新接管。

#### Scenario: 记录任务看板
- **WHEN** 维护者查看 `openspec/knowledge/task-boards/*.html` 或 `task-cockpits/*.html`
- **THEN** 页面 MAY 作为历史过程与来源线索读取
- **AND** 当前状态 MUST 由 Task Record、Parent/Child、各专业 read model、canonical specs、当前实现与有效 evidence 核实

#### Scenario: 任务看板包含未来批次
- **WHEN** Agent 推进普通或 Parent-managed 正式 Task
- **THEN** Agent MUST 使用 Task Record、Parent/Child、各专业 Application/read model、Buildr Web 与对话汇报
- **AND** MUST NOT 创建新的 `task-boards/*.html` 或 `task-cockpits/*.html`

#### Scenario: 读取权威事实
- **WHEN** 历史任务页面与 canonical specs、active change、代码或验证证据存在冲突
- **THEN** Agent MUST 以对应当前 authority 核实任务事实
- **AND** Agent MUST NOT 使用历史页面覆盖或回写权威事实

#### Scenario: 旧路径保留历史页面
- **WHEN** Buildr update、sync、Doctor 或 Task Finish 处理包含历史任务页面的 Project
- **THEN** 这些文件的路径与内容 MUST 保持不变
- **AND** 产品 MUST NOT 将它们转换为 runtime、compatibility redirect 或新的 current authority

### Requirement: Product planning root 与 Service verification root 必须协同但保持所有权分离
Buildr 产品开发 MUST 以 Product Project root 维护 OpenSpec、任务与项目级验证政策，并 MUST 以 Buildr Service root 执行源码、npm package、测试和发布验证；验证编排必须显式识别两个根的所有权。

#### Scenario: 创建 Product OpenSpec change
- **WHEN** Agent 为 Buildr 可执行 Service 创建产品变更
- **THEN** proposal、design、delta specs 和 tasks MUST 位于 Product Project 的 `openspec/changes/`
- **AND** implementation MUST 位于同一 task worktree 的 Buildr Service root

#### Scenario: 运行 affected 或 Candidate
- **WHEN** Product 验证同时覆盖 OpenSpec 和 Buildr Service 实现
- **THEN** verifier MUST 从 Project root 解析 canonical specs 和任务事实
- **AND** MUST 从 Service root 解析 package scripts、运行源码、测试、package assets 和 npm identity

#### Scenario: 报告候选身份
- **WHEN** verifier 生成 Product Candidate evidence
- **THEN** evidence MUST 绑定包含 Project 与 Service 变更的同一 Git candidate fingerprint
- **AND** MUST 明确记录 Project planning root 与 Service package root，不得把其中一个伪装为另一个
