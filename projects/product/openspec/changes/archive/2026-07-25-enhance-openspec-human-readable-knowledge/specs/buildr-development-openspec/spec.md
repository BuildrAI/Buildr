## MODIFIED Requirements

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

