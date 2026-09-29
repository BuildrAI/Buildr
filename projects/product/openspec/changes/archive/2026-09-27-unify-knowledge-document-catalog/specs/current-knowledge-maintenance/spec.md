## MODIFIED Requirements

### Requirement: Project 当前认知必须按信息职责组织
Buildr Project MUST 允许在 Product 根 `knowledge/` 按 `docs/overview.md`、`docs/glossary.md`、`docs/architecture/index.md`、`docs/architecture/product.md`、`docs/architecture/technical.md`、`docs/flows/<flow-id>.md`、`docs/services/<service-code>.md` 和职责清晰的 `archify/` 组织当前认知，`code-map/` 表达实现映射、`archify/` 保存技术图、`docs/` 保存解释文档；文件 MUST 只在存在已确认真实内容或当前 Change 真实影响时创建或更新，MUST NOT 机械生成空文档。

#### Scenario: Change 首次影响技术架构
- **WHEN** 已确认 Change 改变 Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全事实，且技术架构文档尚不存在
- **THEN** Agent MUST 根据理解、维护与协作价值判断建设范围，并在已有建设授权内创建 `knowledge/docs/architecture/technical.md`；尚未授权时 MUST 提出具体建设建议，不阻止无关实施
- **AND** MUST NOT 同时为空白产品架构、流程或 Service 创建占位文件

#### Scenario: 产品与技术架构同时存在
- **WHEN** Project 已有产品架构和技术架构文档
- **THEN** `knowledge/README.md` 或职责等价的统一知识入口 MUST 提供面向人的产品与技术理解入口；内容重复或仅作跳转的文件 MAY 合并，不要求单独维护架构目录文件
- **AND** 产品架构 MUST 负责用户、角色、业务能力、领域模块、产品边界和信息架构，技术架构 MUST 负责系统、Service、模块、数据、接口依赖和运行边界

#### Scenario: 核心流程横跨产品与技术视角
- **WHEN** 当前事实描述跨角色、模块或 Service 的关键顺序、状态或异常路径
- **THEN** Agent MUST 优先在 `knowledge/docs/flows/<flow-id>.md` 维护该流程并由相关架构文档引用
- **AND** MUST NOT 在产品架构和技术架构中复制两份完整流程作为并列事实源
