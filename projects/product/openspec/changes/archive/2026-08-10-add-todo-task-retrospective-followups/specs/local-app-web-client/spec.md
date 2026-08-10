## ADDED Requirements

### Requirement: Local App 必须区分待办与正式执行 Task
Local App Task 列表 MUST 默认使用 `open` 过滤，并 MUST 提供 `open`、`todo`、`active`、`completed`、`abandoned`、`all` 封闭选项及明确中文标签。页面 MUST 显示每条记录的真实 status，且 MUST NOT提供 todo 创建或激活入口。

#### Scenario: 默认进入 Task 列表
- **WHEN** 用户打开 Workspace Task 页面且未提供 status query
- **THEN** 页面 MUST 请求并显示 todo 与 active Task
- **AND** completed 与 abandoned MUST 仅在用户选择对应过滤时显示

#### Scenario: 查看 todo Task
- **WHEN** 用户打开 todo Task 详情
- **THEN** 页面 MUST 允许编辑顶层字段、无变更完成或放弃，并说明尚未进入正式执行
- **AND** Environment、Development 与 Finish 视图 MUST 不伪造任何占位事实

### Requirement: Local App 必须展示复盘来源与承接关系
Task 概览 MUST 展示当前 Task 的复盘来源摘要；复盘 Tab MUST 展示以当前 Task 为来源的承接 Task 摘要及当前 status。展示 MUST 使用 Task Record/Retrospective Application read model，不得由 Web 客户端拼接全量 Task 列表。

#### Scenario: 查看复盘来源
- **WHEN** todo/active Task 具有一个或多个 retrospective source
- **THEN** 概览 MUST 显示可导航的 source Task ID、title 与 terminal status

#### Scenario: 查看复盘承接结果
- **WHEN** terminal Task 的复盘已关联一个或多个承接 Task
- **THEN** 复盘 Tab MUST 在原始报告和处置意见附近显示目标 Task ID、title 与当前 status
- **AND** 无承接关系时 MUST 显示明确空态而非隐藏原始复盘
