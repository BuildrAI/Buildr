## MODIFIED Requirements

### Requirement: 项目详情必须提供每日演进视图
Buildr Web 项目详情 MUST 提供“项目动态”入口并打开已筛选该项目的统一动态页面。完整每日演进 MUST 在动态页面按所选项目与日期展示，并 MUST 支持按日、按人、按任务切换。旧项目每日演进地址 MUST 转入统一动态页，有日期时保留该日期，无日期时沿用本机今天。视图 MUST 列出日摘要四问与提交列表，MUST NOT 列出变更文件；自己的已关联提交 MUST 提供可导航 Task，自己的未关联提交与他人提交 MUST 展示且无 Task 芯片。页面 MUST NOT 提供写入或编辑控件，生成或重跑 MUST 交给 Agent。日期控件 MUST 使用 DatePicker（`#progress-date`），MUST NOT 在 `#progress-body` 内放置 `input`/`textarea`。

#### Scenario: 打开有当天文件的项目
- **WHEN** 用户打开某 Project 的每日演进视图且当天 v2 文件存在
- **THEN** 页面 MUST 展示四问摘要与提交
- **AND** 页面 MUST NOT 展示变更文件列表或「变更文件」标题
- **AND** 切换按人/按任务 MUST 只改变分组，不修改文件、不扫描 Git

#### Scenario: 打开没有当天文件的项目
- **WHEN** 当天文件不存在
- **THEN** 页面 MUST 展示空态并说明由 Agent 生成
- **AND** MUST NOT 根据 Git 提交或任务列表自动填充

#### Scenario: 旧项目每日演进地址
- **WHEN** 用户打开旧项目每日演进链接
- **THEN** 页面 MUST 转到动态页中的同一项目与日期，且不再打开项目资料副屏
