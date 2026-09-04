## MODIFIED Requirements

### Requirement: Buildr 产品文档分层
Buildr MUST 将产品入口、产品理解、当前事实、行为契约和历史参考分层维护，避免同一事实在 README、docs、knowledge 和 specs 中重复成为事实源。Project current knowledge MUST 按 Product 根 `knowledge/` 下的概览、术语、产品架构、技术架构、核心流程和 Service 说明组织真实当前事实；Archify 当前态视觉投影 MUST 位于 `knowledge/archify/`，并 MUST 只在存在已确认内容或真实 Change 影响时逐步创建或更新对应资产。

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
- **THEN** facts MUST be maintained in `knowledge/overview.md`、`knowledge/glossary.md`、`knowledge/architecture/`、`knowledge/flows/`、`knowledge/services/`、`knowledge/archify/` 或职责等价的 Product current-state knowledge assets
- **AND** facts MUST be written as current-state statements aligned with `openspec/specs/` and the current implementation
- **AND** knowledge MUST NOT include product value propositions, future roadmap, historical rationale, or design philosophy as current facts

#### Scenario: 产品与技术架构分开维护
- **WHEN** Buildr 同时记录产品模型和技术系统事实
- **THEN** 产品架构 MUST 维护用户、角色、业务能力、领域模块、产品边界和信息架构
- **AND** 技术架构 MUST 维护系统、Service、模块、数据所有权、接口依赖、runtime、部署和安全边界
- **AND** `knowledge/architecture/index.md` MUST 在两类真实文档存在时提供统一摘要与导航

#### Scenario: Change 只影响部分当前认知
- **WHEN** current-knowledge assessment 只识别到一个或部分真实影响目标
- **THEN** Agent MUST 只创建或更新对应 `knowledge/` 文档或 Archify 产物
- **AND** MUST NOT 为保持目录形式完整生成其他空文档

#### Scenario: specs 承载行为契约
- **WHEN** Buildr 记录规范性产品行为
- **THEN** MUST / SHOULD level requirements MUST be maintained in `openspec/specs/`
- **AND** specs MUST NOT be replaced by explanatory docs or knowledge notes

#### Scenario: archive 不是当前事实源
- **WHEN** Buildr moves old product docs into `docs/archive/` or archives an OpenSpec Change
- **THEN** archived assets MUST be treated as historical notes and provenance
- **AND** archived assets MUST NOT be treated as current Buildr product source of truth

### Requirement: Project knowledge 区分当前事实与任务看板
Buildr Project MUST 将 Product 根 `knowledge/` 作为 current-state knowledge 主干；既有 `openspec/knowledge/task-boards/*.html` 与 `task-cockpits/*.html` MUST 仅作为历史任务页面原地保留，不得被解释为当前 Task、进度、证据或协调 authority，也不得因产品升级被迁移、重写、删除或重新接管。

#### Scenario: 记录任务看板
- **WHEN** 维护者查看既有 `openspec/knowledge/task-boards/*.html` 或 `task-cockpits/*.html`
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
