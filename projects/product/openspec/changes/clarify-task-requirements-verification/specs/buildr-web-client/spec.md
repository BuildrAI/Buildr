## MODIFIED Requirements

### Requirement: 任务详情必须按工作路径直接组织已有内容

默认页面 MUST在列表旁的现有副屏紧凑展示标题、编码、目标和状态，再以紧凑标签连接任务说明、方案设计、开发实现和任务收尾；方案审查 MUST在方案设计内，实现审查和开发验证 MUST在开发实现内；任务收尾不再提供常驻的「用户确认」目录项，验收设计另行决定。任务说明节点 MUST 以任务说明正文（`brief.md`）优先展示；无说明材料时如实表达空态，不把 intent 当作说明正文。

#### Scenario: 读取完整任务

- **WHEN** Task拥有 brief.md、proposal.md、design.md、tasks.md、规范文件及专业结果
- **THEN** 说明节点 MUST默认展示说明正文；设计节点 MUST默认显示 proposal 正文并可切换 design/specs，实施清单 MUST在非模态浮窗中按需显示，实施节点 MUST显示实现审查与开发验证摘要，设计与实现内部的审查 MUST默认显示最新结论并可切换历次记录，开发实现内的验证 MUST直接展示当前结果及检查依据，收尾 MUST集中展示交付记录与适用的协同、复盘内容
- **AND** 多个关联变更 MUST标识材料来源，原始正文保持其自身权威

#### Scenario: 简单任务与空内容

- **WHEN** Task没有方案材料或部分节点没有记录
- **THEN** 页面 MUST保持四个主节点并如实显示空内容；MUST NOT强制创建文档、报告、子任务或错误状态
- **AND** 没有说明材料时说明节点 MUST如实表达空态，不把 intent 或旧正文冒充说明

#### Scenario: 收尾不出现常驻用户确认

- **WHEN** 任务没有验收事项或答复记录
- **THEN** 收尾目录 MUST NOT提供「用户确认」目录项
- **AND** 页面其余目录与内容展示保持不变

#### Scenario: 当前工作与阅读选择不同

- **WHEN** 智能体记录 implementation 表示验证失败后的修复，而用户在方案设计内选择方案审查
- **THEN** 页面 MUST同时保留实现处的当前标记与方案设计及其内部方案审查的阅读选中态，显示保存的失败结果与当前实现标记
- **AND** 没有明确 stage 时 MUST不标记当前节点；MUST NOT从文件存在、清单数量或 active 状态推断当前节点、自动执行或通过

## ADDED Requirements

### Requirement: intent 的产品定位是短目标而非完整需求

Buildr 面向用户的目标字段（`intent`）MUST 表达一句话级别的任务目标与入口定位；多目标、复合背景、边界与验收等完整说明内容 MUST 由关联变更的说明文档（`brief.md`）承载。Task Record、列表与详情展示 MUST 基于该定位呈现，不通过拉长 intent 充当说明正文。

#### Scenario: intent 保持短目标定位

- **WHEN** Agent 为用户任务编写 intent，且任务需求包含多个目标、复杂边界或验收条件
- **THEN** intent MUST 保持一句话级概括并把完整需求交给 `brief.md`
- **AND** Agent MUST NOT 把实现步骤、逐条验收或长篇正文写入 intent 替代需求文档

## MODIFIED Requirements

### Requirement: 节点阅读必须连续且内容按判断需要取舍
页面 MUST记住每个节点选中的文档、审查记录与阅读位置，关联阅读返回 MUST恢复原上下文；打开新任务 MUST默认需求。页面 MUST优先呈现实际阶段、结论、问题及未覆盖范围，MUST NOT堆叠重复标题、无内容栏目或内部结果摘要值。历史通过 MUST明确表达为最近保存的结论，不能推导当前版本通过。

#### Scenario: 对照方案与实现
- **WHEN** 用户选择设计文档，切到开发实现，再返回方案设计
- **THEN** 页面 MUST保持所选设计文档和阅读位置，不退回默认提案

#### Scenario: 多份需求名称相同
- **WHEN** 任务关联多个变更且均有 brief
- **THEN** 需求内容选项 MUST用关联变更名称区分；单文件 MUST直接显示正文

#### Scenario: 收尾中确认成果
- **WHEN** 任务具有验收事项或答复记录
- **THEN** 历史答复数据仍可由记录面读取；任务收尾目录 MUST NOT提供常驻「用户确认」阅读项
- **AND** 保存意见与任务完成动作的既有约束不因本项调整而改变
