## ADDED Requirements

### Requirement: Local App Task 列表必须支持复盘处置状态过滤
Task query projection MUST 支持闭合 `retrospectiveState=missing|pending|handled|no-action|all` 参数化过滤，并 MUST 直接消费 `task_retrospective_current` 的 current row 与处置状态；Task Record MUST NOT复制或改写 Retrospective 专业事实。现有 `hasRetrospective=yes|no|all` 查询 MUST 保持兼容。

#### Scenario: 筛选未复盘
- **WHEN** collection GET 使用 `retrospectiveState=missing`
- **THEN** repository MUST 只返回不存在 `task_retrospective_current` row 的 Task
- **AND** MUST NOT创建空复盘或从 Task status 推断复盘存在

#### Scenario: 筛选处置状态
- **WHEN** collection GET 使用 `retrospectiveState=pending|handled|no-action`
- **THEN** repository MUST 只返回存在 current row 且处置状态匹配的 Task
- **AND** MUST 使用参数绑定，不执行 filesystem、Agent 或其他专业 reader

#### Scenario: Web 选择复盘状态
- **WHEN** 用户在 Task 列表选择未复盘、待处理、已处理或无需处理
- **THEN** Web feature MUST 使用单一“复盘状态”控件提交对应 `retrospectiveState`
- **AND** 若当前仍是页面默认 `status=active`，Web feature MUST 显式切换为 `status=all`，避免用不可能组合隐藏 terminal 结果

#### Scenario: 保留是否复盘兼容查询
- **WHEN** 既有客户端继续提交 `hasRetrospective=yes|no|all`
- **THEN** HTTP/Application/repository MUST 保持原有存在性过滤语义
- **AND** 新 Web feature MUST NOT同时暴露第二个 `hasRetrospective` 控件

#### Scenario: 非法复盘状态
- **WHEN** collection GET 提交未知 `retrospectiveState` 或其他未知 query 字段
- **THEN** HTTP interface MUST 在查询 SQLite 前返回稳定字段诊断
- **AND** MUST NOT把未知值降级为 `all`
