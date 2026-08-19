## MODIFIED Requirements

### Requirement: 项目详情必须提供每日演进视图
Buildr Web 项目详情 MUST 提供「每日演进」视图，默认展示本机今天的文件，并 MUST 支持按日、按人、按任务切换。视图 MUST 列出日摘要四问、提交列表与变更文件；自己的已关联提交 MUST 提供可导航 Task，自己的未关联提交与他人提交 MUST 展示且无 Task 芯片。页面 MUST NOT 提供写入或编辑控件，生成或重跑 MUST 交给 Agent。日期控件 MUST 使用 DatePicker（`#progress-date`），MUST NOT 在 `#progress-body` 内放置 `input`/`textarea`。

#### Scenario: 打开有当天文件的项目
- **WHEN** 用户打开某 Project 的每日演进视图且当天 v2 文件存在
- **THEN** 页面 MUST 展示四问摘要、提交与变更文件
- **AND** 切换按人/按任务 MUST 只改变分组，不修改文件、不扫描 Git

#### Scenario: 打开没有当天文件的项目
- **WHEN** 当天文件不存在
- **THEN** 页面 MUST 展示空态并说明由 Agent 生成
- **AND** MUST NOT 根据 Git 提交或任务列表自动填充

### Requirement: Task 详情必须展示每日演进反向关联
Buildr Web Task 详情 MUST 展示引用该 Task 的本机每日演进条目，至少包括日期、所属 Project 与摘要。缺失文件或没有引用时 MUST 展示空态，MUST NOT 把每日演进当作 Task 状态、进度或 Verification 结果，MUST NOT 列出未引用该 Task 的他人提交。

#### Scenario: Task 被当天推进项引用
- **WHEN** 只读 API 返回该 Task 的一条或多条每日演进条目
- **THEN** Task 详情 MUST 展示这些条目并可导航到所属 Project 日期视图
