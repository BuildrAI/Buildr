## ADDED Requirements

### Requirement: Task 轻量查询必须组合复盘来源关系
Task 列表与详情的 SQLite read model MUST 从 Task Record owner tables 读取 `retrospectiveSourceTaskIds`，并 MAY 对单个 source Task 派生承接 Task 的 ID、title 与 status。查询 MUST 保持只读、固定数量 SQL，不得读取复盘 Markdown、专业 currentness 或建立关系缓存。

#### Scenario: 查看目标 Task 来源
- **WHEN** Local App 读取一个具有多个复盘来源的 todo 或 active Task
- **THEN** read model MUST 返回去重后的 source Task 摘要
- **AND** MUST NOT调用 Task Retrospective writer 或复制原始报告

#### Scenario: 查看源 Task 承接列表
- **WHEN** Local App 打开 terminal source Task 的复盘页
- **THEN** read model MUST 返回全部当前承接 Task 摘要
- **AND** 目标状态变化 MUST 由下一次查询直接反映
