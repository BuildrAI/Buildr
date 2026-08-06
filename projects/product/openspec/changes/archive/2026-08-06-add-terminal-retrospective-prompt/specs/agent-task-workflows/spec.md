## ADDED Requirements

### Requirement: 终态 Task 提供非阻塞任务复盘提示
Buildr MUST 在正式 Task 成功进入 `completed` 或 `abandoned` 终态后，让结束任务的 Agent 使用稳定名称“任务复盘”询问用户是否复盘；该提示 MUST 发生在终态结果成立之后，且 MUST NOT 自动运行复盘或改变终态结果。

#### Scenario: Task Record 完成后提示复盘
- **WHEN** Task Record Application 成功完成 active Task
- **THEN** terminal operation result MUST 提供非阻塞“任务复盘”建议
- **AND** `task-manager` MUST 要求 Agent 在用户可见终态响应中询问是否进行任务复盘
- **AND** 用户未同意复盘时 MUST NOT 调用 `task-retrospective`

#### Scenario: Task Record 放弃后提示复盘
- **WHEN** Task Record Application 成功放弃 active Task
- **THEN** terminal operation result MUST 提供非阻塞“任务复盘”建议
- **AND** 复盘缺失或用户拒绝 MUST NOT 改变 `abandoned` 状态

#### Scenario: Formal Finish 成功后提示复盘
- **WHEN** Task Finish 成功完成 retained Task Record 与 cleanup
- **THEN** complete result MUST 提供非阻塞“任务复盘”建议
- **AND** `task-finish` MUST 要求 Agent 在最终响应中询问是否进行任务复盘
- **AND** 该建议 MUST NOT成为 Finish operation、cleanup 或 Task terminal transition 的门禁

#### Scenario: 终态操作失败或阻塞
- **WHEN** Task Record terminal transition 或 Task Finish 未成功到达目标终态
- **THEN** Agent MUST NOT提示当前 Task 已可进行终态复盘
- **AND** blocked result MUST 继续优先提供其确定性恢复动作

#### Scenario: 任务复盘提示说明当前重点
- **WHEN** Agent 展示终态任务复盘提示
- **THEN** 提示 MUST 使用长期名称“任务复盘”
- **AND** MUST 说明当前重点包括 Agent 执行耗时、Token 消耗、重复尝试和人机协作效率
- **AND** MUST 说明 Token 数据仅在 Agent 可取得时记录且缺失不影响复盘

