## MODIFIED Requirements

### Requirement: Buildr Web 必须只读展示每日演进
Buildr Web 项目详情 MUST 提供「每日演进」视图，默认展示本机今天，并 MUST 支持按日、按人、按任务切换。按日 MUST 展示日摘要四问与提交列表，MUST NOT 展示变更文件列表。自己的、已关联 Task 的提交 MUST 提供可导航 Task 芯片；自己的未关联提交 MUST 展示且无 Task 芯片；他人提交 MUST 展示作者且无 Task 芯片。Task 详情 MUST 只展示引用了该 Task 的条目。页面 MUST NOT 提供写入、删除或编辑控件；生成或重跑 MUST 交给 Agent。本机 HTTP API MUST 只读、Project-scoped 或 Task-scoped，MUST NOT 接受文件系统路径。

#### Scenario: 项目页按日查看
- **WHEN** 用户打开已有当天 v2 文件的 Project 每日演进视图
- **THEN** 页面 MUST 展示四问摘要与提交列表
- **AND** 页面 MUST NOT 展示变更文件列表或「变更文件」标题
- **AND** MUST NOT 修改文件或现场扫描 Git

#### Scenario: 项目页按人查看
- **WHEN** 用户在同一天切换到按人分组
- **THEN** 页面 MUST 按 commit author 分组提交
- **AND** MUST NOT 为他人提交显示 Task 芯片
- **AND** MUST NOT 展示变更文件列表

#### Scenario: Task 详情反查
- **WHEN** 某 Task 被当天一或多条自己的提交引用
- **THEN** Task 详情 MUST 展示这些条目的日期、摘要与所属 Project
- **AND** MUST NOT 把条目当作 Task 状态或进度 authority

#### Scenario: 当天尚无文件
- **WHEN** 用户打开没有当天文件的 Project 每日演进视图
- **THEN** 页面 MUST 展示空态并说明需要 Agent 生成
- **AND** MUST NOT 根据 Git 或 Task 列表自动填充
