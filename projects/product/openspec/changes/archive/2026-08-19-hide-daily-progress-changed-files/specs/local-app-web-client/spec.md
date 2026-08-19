## MODIFIED Requirements

### Requirement: 项目详情必须提供每日演进视图
Buildr Web 项目详情 MUST 提供「每日演进」视图，默认展示本机今天的文件，并 MUST 支持按日、按人、按任务切换。视图 MUST 列出日摘要四问与提交列表，MUST NOT 列出变更文件；自己的已关联提交 MUST 提供可导航 Task，自己的未关联提交与他人提交 MUST 展示且无 Task 芯片。页面 MUST NOT 提供写入或编辑控件，生成或重跑 MUST 交给 Agent。日期控件 MUST 使用 DatePicker（`#progress-date`），MUST NOT 在 `#progress-body` 内放置 `input`/`textarea`。

#### Scenario: 打开有当天文件的项目
- **WHEN** 用户打开某 Project 的每日演进视图且当天 v2 文件存在
- **THEN** 页面 MUST 展示四问摘要与提交
- **AND** 页面 MUST NOT 展示变更文件列表或「变更文件」标题
- **AND** 切换按人/按任务 MUST 只改变分组，不修改文件、不扫描 Git

#### Scenario: 打开没有当天文件的项目
- **WHEN** 当天文件不存在
- **THEN** 页面 MUST 展示空态并说明由 Agent 生成
- **AND** MUST NOT 根据 Git 提交或任务列表自动填充
