## MODIFIED Requirements

### Requirement: Agent Skills 必须区分 todo 创建与 active 启动
Task Triage 与 Task Manager provider MUST 将 todo 创建视为尚未启动的已接受意向，将 active 创建或 todo 激活视为工作已经开始；两者 MUST 只登记已确认的任务事实，不以 Git 更新或全局诊断为前置。Task Manager Application MUST 保持不执行 Git。后续代码与环境操作 MUST 按用户目标独立判断。

#### Scenario: 复盘产生 todo
- **WHEN** 用户同意保留复盘改进意向但未要求立即研发
- **THEN** Agent MUST 通过 Task Manager 创建 todo
- **AND** MUST NOT 为此运行 Git baseline、准备环境或创建 Change

#### Scenario: 启动 todo
- **WHEN** 用户要求开始执行已有 todo，当前目标、范围、授权和记录版本有效
- **THEN** Agent MUST 调用 activate，不要求先完成 Git 基线收敛
- **AND** 后续动作的局部限制 MUST NOT 改写已成立的启动事实

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
