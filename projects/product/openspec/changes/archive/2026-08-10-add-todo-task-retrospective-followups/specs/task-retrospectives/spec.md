## ADDED Requirements

### Requirement: 处理复盘必须形成基于当前事实的完整意见
Task Retrospective provider MUST 在处置 current Retrospective Result 前返回原始复盘正文或其不可变 current digest 引用，检查原问题与建议在当前 Project 中是否仍存在或有效，并基于当前事实重新拆分行动方向。它 MUST NOT 只复述旧报告、机械沿用旧建议或生成 action item ID。

#### Scenario: 旧建议仍然有效
- **WHEN** 当前实现、规范或流程证明原问题仍存在且改进方向仍有效
- **THEN** 处理报告 MUST 说明当前证据、重新表述的改进方向及其 Task 承接结果
- **AND** MUST 将来源关系写入已有或新建的 todo/active Task

#### Scenario: 建议已失效或不再需要
- **WHEN** 当前事实证明问题已解决、建议已过时、收益不足或不再适用
- **THEN** 处理报告 MUST 说明丢弃理由与当前证据
- **AND** MUST NOT 为该事项创建 Task 或 action item

### Requirement: 有效复盘事项必须由 Task Record 承接
处理复盘时，Agent MUST 对每个仍有效的改进方向选择已有 todo/active Task 或创建新的 todo Task，并通过 Task Record 来源关系关联 source Task。多个方向 MAY 合并到一个目标 Task，一个来源 MAY 关联多个目标 Task；关系粒度 MUST 停止在 source Task ID。

#### Scenario: 已有 Task 覆盖改进方向
- **WHEN** 当前 Workspace 已有 todo 或 active Task 覆盖同一目标
- **THEN** Agent MUST 复用该 Task 并增加来源关系
- **AND** MUST NOT重复创建 Task

#### Scenario: 新建待办承接意向
- **WHEN** 有效方向尚无 Task 承接且用户同意保留该意向
- **THEN** Agent MUST 只创建带来源关系的 todo Task Record
- **AND** MUST NOT创建 Environment、Change、proposal、design 或其他任务文件

#### Scenario: 标记处理完成
- **WHEN** 所有有效方向均已关联承接 Task，且所有丢弃方向均有理由
- **THEN** Agent MUST 将 disposition 标记为 handled，并在说明中记录完整处理意见与目标 Task ID
- **AND** 若没有任何有效方向，MUST 使用 no-action 而非 handled

### Requirement: 复盘 inspect 必须展示当前承接 Task
Task Retrospective inspect 与 Local App 复盘视图 MUST 通过 Task Record 的反向轻量查询返回 source Task 当前关联的承接 Task ID、title 与 status；MUST NOT 将该投影复制进 Retrospective current row。

#### Scenario: 承接 Task 状态变化
- **WHEN** 已关联目标 Task 从 todo 激活或进入终态
- **THEN** 下一次复盘 inspect MUST 显示目标 Task 的当前状态
- **AND** MUST NOT 重写原始 Retrospective Result 或 disposition metadata
