## MODIFIED Requirements

### Requirement: Project 当前认知必须按信息职责组织
Buildr Project MUST 允许在 Product 根 `knowledge/` 按 `overview.md`、`glossary.md`、`architecture/index.md`、`architecture/product.md`、`architecture/technical.md`、`flows/<flow-id>.md`、`services/<service-code>.md` 和职责清晰的 `archify/` 组织当前认知；文件 MUST 只在存在已确认真实内容或当前 Change 真实影响时创建或更新，MUST NOT 机械生成空文档。

#### Scenario: Change 首次影响技术架构
- **WHEN** 已确认 Change 改变 Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全事实，且技术架构文档尚不存在
- **THEN** Agent MUST 创建 `knowledge/architecture/technical.md` 并写入本次影响对应的当前事实
- **AND** MUST NOT 同时为空白产品架构、流程或 Service 创建占位文件

#### Scenario: 产品与技术架构同时存在
- **WHEN** Project 已有产品架构和技术架构文档
- **THEN** `knowledge/architecture/index.md` MUST 提供面向人的架构摘要和两个稳定入口
- **AND** 产品架构 MUST 负责用户、角色、业务能力、领域模块、产品边界和信息架构，技术架构 MUST 负责系统、Service、模块、数据、接口依赖和运行边界

#### Scenario: 核心流程横跨产品与技术视角
- **WHEN** 当前事实描述跨角色、模块或 Service 的关键顺序、状态或异常路径
- **THEN** Agent MUST 优先在 `knowledge/flows/<flow-id>.md` 维护该流程并由相关架构文档引用
- **AND** MUST NOT 在产品架构和技术架构中复制两份完整流程作为并列事实源

### Requirement: 当前认知必须保持事实来源边界
Current knowledge MUST 解释 Product 根 `knowledge/` 中的当前事实但 MUST NOT 替代 canonical specs；发生冲突时 MUST 依次核对 canonical specs、当前实现与 registries、active Change artifacts、已确认 evidence，并只能将 archived Changes 与既有历史任务页面作为历史来源线索。

#### Scenario: knowledge 与 canonical spec 冲突
- **WHEN** 当前认知陈述与 canonical Requirement 不一致
- **THEN** Agent MUST 先确认规范或实现哪一方需要修正
- **AND** MUST NOT 通过只改 `knowledge/` 掩盖规范冲突

#### Scenario: archive 包含旧行为
- **WHEN** archived Change 描述的行为已被后续 canonical spec 或实现替代
- **THEN** current knowledge MUST 表达当前行为
- **AND** MUST NOT 因历史 Change 存在而继续把旧行为当作当前事实

#### Scenario: task board 表达任务认知
- **WHEN** `openspec/knowledge/task-boards/` 或 `openspec/knowledge/task-cockpits/` 历史页面与 `knowledge/` 当前认知同时存在
- **THEN** current knowledge maintenance MUST 将这些页面仅作为历史旁证，不得继续维护其工作状态
- **AND** `knowledge/overview`、`knowledge/architecture`、`knowledge/flows`、`knowledge/services`、`knowledge/glossary`、canonical specs 与各专业 read model MUST 保持各自当前事实职责
