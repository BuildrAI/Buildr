## MODIFIED Requirements

### Requirement: 任务看板使用稳定的 Project knowledge 路径
任务看板 MUST 保存在拥有该任务的 Project 位于 retained Workspace checkout 的 `openspec/knowledge/task-boards/` 下，并 MUST 使用 `yyyy-MM-dd-<task-id>.html` 文件名；日期 MUST 取首次创建时 retained Workspace 所在环境的本地日期，后续更新 MUST 通过完整文件名结构和内嵌 `meta.taskId` 解析唯一既有看板并保持同一路径。关联 OpenSpec Change 的 task environment MUST 只作为事实来源，MUST NOT 创建、复制、更新或持有任务看板。

#### Scenario: 创建 Project 任务看板
- **WHEN** Agent 首次为 Project task id `fund-system-integration` 创建任务看板，且 retained Workspace 所在环境的本地日期为 2026-07-20
- **THEN** retained Workspace checkout 中的文件路径 MUST 以 `openspec/knowledge/task-boards/2026-07-20-fund-system-integration.html` 结尾
- **AND** 后续批次或 change 变化 MUST 更新该文件而不是按更新时间创建新文件

#### Scenario: 任务看板跨越多个 change
- **WHEN** 一个任务包含已归档 change、当前 active change、code-only 工作或未来批次
- **THEN** 任务看板 MUST 在 retained Workspace checkout 保持稳定路径并关联这些批次
- **AND** OpenSpec change archive 或任一关联 task environment 清理 MUST NOT 使任务看板入口消失、被移动或产生副本

#### Scenario: 从关联 task environment 维护看板
- **WHEN** Agent 从关联 Change 的 task environment 核实任务事实并请求创建或更新任务看板
- **THEN** Agent MUST 从 environment receipt 或显式 Workspace identity 解析 retained Workspace checkout，并只更新其中的唯一看板
- **AND** Agent MUST NOT 在当前 task environment 的 Project checkout 中创建、复制或更新任务看板

#### Scenario: 解析唯一既有任务看板
- **WHEN** Agent 为已有 task id 创建或更新任务看板
- **THEN** Agent MUST 在 retained Workspace checkout 同时核对完整文件名结构和内嵌 `meta.taskId`
- **AND** 只有唯一一致的候选可以被更新

#### Scenario: 既有看板身份存在歧义
- **WHEN** retained Workspace checkout 中候选文件超过一个、文件名与内嵌 task identity 不一致或目标路径已被其他任务占用
- **THEN** Agent MUST 返回 `blocked`、冲突路径和 next actions
- **AND** Agent MUST NOT 按更新时间、后缀相似或任意顺序选择文件
