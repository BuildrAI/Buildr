## MODIFIED Requirements

### Requirement: Product 当前态模型必须位于 Product 根 knowledge
Buildr Product MUST 将已经由 canonical specs、当前实现、registries 或已确认 evidence 证明的项目当前态模型维护在 Product 根 `knowledge/`；该目录 MUST 承载 `code-map/` 代码地图、`archify/` 技术图与 `docs/` 解释文档三类成果；`README.md` MUST 为统一入口，各类成果依据规范、代码、登记配置和已确认决定维护。

#### Scenario: 读取 Product 当前态入口
- **WHEN** Agent 或维护者需要了解 Buildr 当前已经实现的产品、架构、流程或 Service 事实
- **THEN** Product MUST 从 `knowledge/README.md` 及其明确导航进入当前态模型
- **AND** 当前态入口 MUST NOT 要求先阅读完整 OpenSpec Change 历史

#### Scenario: 维护当前架构模型
- **WHEN** 已确认实现或规范改变产品架构、技术架构、流程、Service 或术语事实
- **THEN** 对应内容 MUST 更新 `knowledge/` 下的职责目标
- **AND** MUST NOT 把同一当前事实另建为 `docs/` 或 `openspec/changes/` 的第二个 current authority

### Requirement: Project docs、OpenSpec 与 knowledge 必须保持职责边界
Buildr Product MUST 将当前产品与技术解释的唯一维护位置收敛到 `knowledge/docs/`；`docs/` MUST 按用途保留历史审计、历史记录、未来规划、对外文章和导航；MUST 将 `openspec/specs/` 作为规范性行为契约；MUST 将 `openspec/changes/` 作为单次变更过程；这些区域 MUST 通过导航互相链接但不得互相替代。

#### Scenario: 记录当前事实与解释
- **WHEN** 一项内容既需要当前事实又需要面向人的解释
- **THEN** 事实依据 MUST 为规范、当前代码、登记配置和已确认决定，当前解释 MUST 在 `knowledge/docs/` 维护
- **AND** 当前解释 MUST 可以直接引用事实依据、代码地图和技术图；规划、设想与设计理由 MUST 明确与当前事实区分，不固定为地图到图再到文档的生成顺序

#### Scenario: 记录规范性行为
- **WHEN** 内容表达 MUST、SHALL、SHOULD 或其他可观察产品承诺
- **THEN** 规范 MUST 位于 `openspec/specs/` 或对应 active Change delta spec
- **AND** `knowledge/` 与 `docs/` MUST NOT 替代该规范

### Requirement: 必要技术图必须引用同一当前态事实
`knowledge/archify/` 中的系统和关键调用技术图 MUST依据所覆盖的当前模块、调用、数据与副作用事实编写，并 MUST保存 Archify JSON、交付 HTML 与视觉检查证据。技术图 MUST与代码地图和技术架构互相导航，但 MUST不复制完整规范正文或建立自动同步产品机制。

#### Scenario: 交付技术图
- **WHEN** 本次架构迁移完成并生成 Archify 图
- **THEN** 图源 MUST通过 showcase validation 与 deliver
- **AND** HTML MUST在声明的桌面尺寸无溢出并经真实截图检查
- **AND** 图中的路径、模块、调用和数据 owner MUST与最终候选 tree 一致
