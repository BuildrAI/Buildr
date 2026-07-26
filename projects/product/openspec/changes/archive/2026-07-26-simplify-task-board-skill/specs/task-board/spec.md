## ADDED Requirements

### Requirement: 任务看板 Skill 必须简洁且职责分层
`task-board` 的 routing description MUST 只表达适用意图与简单任务排除条件，并 MUST 在 package builtin、workspace Skill manifest 和 runtime frontmatter 中保持一致；Skill 正文 MUST 按适用范围、输入与事实、定位与操作、内容模型、更新与验证、结果组织专业动作，且 MUST NOT 重复 capability contract 或模板已经拥有的完整定义。

#### Scenario: Agent 发现任务看板 Skill
- **WHEN** Agent runtime 读取 `task-board` frontmatter 或 Buildr 生成 workspace Skill manifest
- **THEN** 两处 description MUST 使用相同的简洁 routing 语义
- **AND** description MUST NOT 复制 create/update 流程、字段 schema 或结果契约

#### Scenario: Agent 加载任务看板正文
- **WHEN** Agent 因复杂任务或用户明确要求而加载 `task-board`
- **THEN** 正文 MUST 按一次 create/update 的执行顺序提供非重复步骤
- **AND** capability 协作字段与模板展示字段 MUST 继续分别由 contract 和模板拥有

### Requirement: 任务看板候选必须先验证再替换
Agent MUST 在创建或更新任务看板前验证候选 HTML 的 task identity、内嵌 JSON、change/batch 关联、离线依赖和只读行为；候选未通过验证或写入失败时 MUST 保留既有文件并返回 `blocked`，候选与既有内容一致时 MUST 返回 `aligned` 且不得制造无意义写入。

#### Scenario: 更新候选验证失败
- **WHEN** 候选 HTML 的 JSON 无法解析、identity 不一致、关系无效、包含外部网络依赖或提供任务状态写回
- **THEN** Agent MUST 返回 `blocked` 和未决事项
- **AND** 既有任务看板 MUST 保持原内容

#### Scenario: 候选与现有看板一致
- **WHEN** 已核实事实生成的候选与现有任务看板语义一致
- **THEN** Agent MUST 返回 `aligned`
- **AND** Agent MUST NOT 把文件存在或无意义重写报告为 `updated`

## MODIFIED Requirements

### Requirement: 任务看板使用稳定的 Project knowledge 路径
任务看板 MUST 保存在拥有该任务的 Project `openspec/knowledge/task-boards/` 下，并 MUST 使用 `yyyy-MM-dd-<task-id>.html` 文件名；日期 MUST 取首次创建时的本地日期，后续更新 MUST 通过完整文件名结构和内嵌 `meta.taskId` 解析唯一既有看板并保持同一路径。

#### Scenario: 创建 Project 任务看板
- **WHEN** Agent 首次为 Project task id `fund-system-integration` 创建任务看板，且本地日期为 2026-07-20
- **THEN** 文件路径 MUST 以 `openspec/knowledge/task-boards/2026-07-20-fund-system-integration.html` 结尾
- **AND** 后续批次或 change 变化 MUST 更新该文件而不是按更新时间创建新文件

#### Scenario: 任务看板跨越多个 change
- **WHEN** 一个任务包含已归档 change、当前 active change、code-only 工作或未来批次
- **THEN** 任务看板 MUST 保持稳定路径并关联这些批次
- **AND** OpenSpec change archive MUST NOT 使任务看板入口消失或被移动

#### Scenario: 解析唯一既有任务看板
- **WHEN** Agent 为已有 task id 创建或更新任务看板
- **THEN** Agent MUST 同时核对完整文件名结构和内嵌 `meta.taskId`
- **AND** 只有唯一一致的候选可以被更新

#### Scenario: 既有看板身份存在歧义
- **WHEN** 候选文件超过一个、文件名与内嵌 task identity 不一致或目标路径已被其他任务占用
- **THEN** Agent MUST 返回 `blocked`、冲突路径和 next actions
- **AND** Agent MUST NOT 按更新时间、后缀相似或任意顺序选择文件
