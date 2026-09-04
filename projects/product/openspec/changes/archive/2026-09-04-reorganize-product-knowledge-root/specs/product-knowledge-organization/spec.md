## ADDED Requirements

### Requirement: Product 当前态模型必须位于 Product 根 knowledge
Buildr Product MUST 将已经由 canonical specs、当前实现、registries 或已确认 evidence 证明的项目当前态模型维护在 Product 根 `knowledge/`；该目录 MUST 承载 overview、glossary、architecture、flows、services 和 Archify visual projection 等职责清晰的当前态资产。

#### Scenario: 读取 Product 当前态入口
- **WHEN** Agent 或维护者需要了解 Buildr 当前已经实现的产品、架构、流程或 Service 事实
- **THEN** Product MUST 从 `knowledge/overview.md` 或其明确导航进入当前态模型
- **AND** 当前态入口 MUST NOT 要求先阅读完整 OpenSpec Change 历史

#### Scenario: 维护当前架构模型
- **WHEN** 已确认实现或规范改变产品架构、技术架构、流程、Service 或术语事实
- **THEN** 对应内容 MUST 更新 `knowledge/` 下的职责目标
- **AND** MUST NOT 把同一当前事实另建为 `docs/` 或 `openspec/changes/` 的第二个 current authority

### Requirement: Project docs、OpenSpec 与 knowledge 必须保持职责边界
Buildr Product MUST 将 `docs/` 作为面向人的解释、使用、维护、设计理由和未来展望；MUST 将 `openspec/specs/` 作为规范性行为契约；MUST 将 `openspec/changes/` 作为单次变更过程；这些区域 MUST 通过导航互相链接但不得互相替代。

#### Scenario: 记录当前事实与解释
- **WHEN** 一项内容既需要当前事实又需要面向人的解释
- **THEN** 当前事实 MUST 以 `knowledge/` 为主
- **AND** `docs/` MAY 保留理解、维护或设计理由，并链接到对应 current knowledge

#### Scenario: 记录规范性行为
- **WHEN** 内容表达 MUST、SHALL、SHOULD 或其他可观察产品承诺
- **THEN** 规范 MUST 位于 `openspec/specs/` 或对应 active Change delta spec
- **AND** `knowledge/` 与 `docs/` MUST NOT 替代该规范

### Requirement: Archify 必须作为 knowledge 下的可视化产物区
Buildr Product MUST 将当前态 Archify JSON 源码和由其生成的 HTML 维护在 `knowledge/archify/`；每个图表 MUST 以稳定语义文件名保存源码和产物，MUST NOT 将 HTML、图片或渲染结果提升为 OpenSpec 或代码事实源。

#### Scenario: 维护系统全景图
- **WHEN** Product 创建或更新当前 Buildr 系统全景图
- **THEN** Archify JSON 和 HTML MUST 位于 `knowledge/archify/system/`
- **AND** 图表 MUST 链接或声明其 OpenSpec、代码和结构登记来源

#### Scenario: 未来图表维度
- **WHEN** 未来需要产品、应用、数据、技术或流程维度的 Archify 图表
- **THEN** 图表 MAY 位于 `knowledge/archify/<dimension>/`
- **AND** Product MUST NOT 为没有真实图表内容的维度创建空文档或虚假 current fact

### Requirement: 历史任务页面必须保留原路径
Buildr Product MUST 保留既有 `openspec/knowledge/task-boards/` 与 `openspec/knowledge/task-cockpits/` 文件的原路径和内容；它们只能作为历史旁证，不得被迁移为新的 current knowledge、runtime、compatibility redirect 或任务状态 authority。

#### Scenario: 读取历史任务页面
- **WHEN** 维护者访问既有 task board 或 task cockpit
- **THEN** Product MAY 读取其历史过程和来源线索
- **AND** 当前 Task、进度、验证和完成事实 MUST 从对应 current authority 重新核实

#### Scenario: 更新 Product 知识主干
- **WHEN** Product 将 current knowledge 迁移到 `knowledge/`
- **THEN** 迁移 MUST NOT 删除、改写或移动既有 task board、task cockpit 或 archived Change
