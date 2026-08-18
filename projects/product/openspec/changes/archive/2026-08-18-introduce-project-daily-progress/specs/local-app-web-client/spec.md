## ADDED Requirements

### Requirement: 项目详情必须提供每日演进视图
Buildr Web 项目详情 MUST 提供「每日演进」视图，默认展示本机今天的文件，并 MUST 支持按日、按人、按任务切换。视图 MUST 列出推进项摘要、署名与可导航 Task。页面 MUST NOT 提供写入或编辑控件，生成或重跑 MUST 交给 Agent。

#### Scenario: 打开有当天文件的项目
- **WHEN** 用户打开某 Project 的每日演进视图且当天文件存在
- **THEN** 页面 MUST 展示当天推进项及其关联 Task
- **AND** 切换按人/按任务 MUST 只改变分组，不修改文件

#### Scenario: 打开没有当天文件的项目
- **WHEN** 当天文件不存在
- **THEN** 页面 MUST 展示空态并说明由 Agent 生成
- **AND** MUST NOT 根据任务列表自动填充

### Requirement: Task 详情必须展示每日演进反向关联
Buildr Web Task 详情 MUST 展示引用该 Task 的本机每日演进推进项，至少包括日期、所属 Project 与摘要。缺失文件或没有引用时 MUST 展示空态，MUST NOT 把推进项当作 Task 状态、进度或 Verification 结果。

#### Scenario: Task 被当天推进项引用
- **WHEN** 只读 API 返回该 Task 的一条或多条推进项
- **THEN** Task 详情 MUST 展示这些推进项并可导航到所属 Project 日期视图
