## REMOVED Requirements

### Requirement: 产品内置 Skill 必须能发现并执行项目每日演进
Buildr package MUST 提供可投射的产品 Skill，使 Agent 能发现展示、生成或重跑项目每日演进的意图。查看 MUST 只读取已保存内容；生成 MUST 先明确日期、时区、相关仓库与提交范围，默认从当前本地引用收集当日 Git 提交与更改文件，按本机用户邮箱判断作者并构造四问摘要，通过 Daily Progress Application/CLI 写入。Skill MUST 披露引用、观察时间和未覆盖范围，MUST NOT 把资产同步或全局诊断作为生成前置。产品读取路径 MUST NOT 扫描 Git、写 Task Record、自动撰写摘要或提供 cron，他人提交 MUST NOT 关联 Task。

#### Scenario: 用户要求生成今天的项目每日演进
- **WHEN** 用户要求生成或重跑日报且本地提交可读取
- **THEN** Skill MUST 基于明确的本地提交范围构造合法输入并 record，不先更新代码或同步资产
- **AND** 摘要 MUST 说明观察范围与截至时间，未确认远端时不得宣称远端最新

#### Scenario: 用户只要求查看
- **WHEN** 用户只要求查看已有日报
- **THEN** Skill MUST inspect 或 list，不自动获取提交、生成或同步

#### Scenario: 用户要求远端最新数据
- **WHEN** 用户明确要求基于远端最新引用生成日报
- **THEN** Skill MUST 按授权独立获取目标远端引用并说明结果，不要求检出或变基
- **AND** 获取失败且用户只接受远端最新数据时 MUST 保留旧日报并报告缺口

#### Scenario: 用户问能否每天自动跑
- **WHEN** 用户询问每日演进是否自动执行
- **THEN** Skill MUST 说明这取决于 Agent 宿主定时器
- **AND** MUST NOT 引导实现 Buildr 产品 cron

**Reason:** 用户确认每日演进功能无实际用处，明确删除；未来需求将重新设计。

**Migration:** 相关命令、API、界面入口与 Skill 一并移除；`.buildr/daily-progress/` 既有本机文件保留在用户机器上但不再被产品读写。
