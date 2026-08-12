## MODIFIED Requirements

### Requirement: Buildr 必须提供任务看板维护能力契约
Buildr MUST 提供 `buildr.task-board-maintenance/v1` capability contract 和默认 `task-board` provider；contract MUST 定义 retained Workspace/Project/task identity、事实来源、create/update operation、写入授权、稳定路径、task environment context 绑定、失败语义和 result evidence。

#### Scenario: Consumer 创建任务看板
- **WHEN** consumer 请求 `create` 并提供 retained Workspace、Project、task id、任务事实和授权范围
- **THEN** selected provider MUST 在 retained Workspace checkout 解析稳定路径、创建自包含看板并返回 changed path、status 和 source identities
- **AND** provider MUST NOT 要求至少存在一个 OpenSpec change

#### Scenario: Consumer 更新既有任务看板
- **WHEN** consumer 请求 `update` 并提供既有 task identity 与已核实事实
- **THEN** selected provider MUST 更新 retained Workspace checkout 中的同一路径并返回 `updated | aligned | blocked`
- **AND** provider MUST NOT 根据更新时间或关联 task environment 创建第二份看板

#### Scenario: Consumer 从 task environment 调用 provider
- **WHEN** consumer 在关联 Change 的 task environment 中调用 provider
- **THEN** consumer MUST 提供成功的 `buildr worktree context` result，provider MUST 只消费其中的 `workspaceRoot` 作为 retained Workspace identity
- **AND** consumer/provider MUST NOT 读取 receipt 结构、扫描路径或使用显式 Workspace identity 作为 environment 内 fallback

#### Scenario: Provider 无法确认事实或位置
- **WHEN** context 未返回有效 `workspaceRoot`，或 retained Workspace、Project、task identity、事实来源、写入授权或稳定路径无法确认
- **THEN** provider MUST 返回 `blocked`、未决项和 next actions
- **AND** consumer MUST NOT 声称看板已创建或更新
