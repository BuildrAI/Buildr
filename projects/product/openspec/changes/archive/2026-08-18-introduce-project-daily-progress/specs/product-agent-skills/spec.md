## ADDED Requirements

### Requirement: 产品内置 Skill 必须能发现并执行项目每日演进
Buildr package MUST 提供可投射的产品 Skill，使 Agent 能发现「展示或生成项目每日演进」意图，并 MUST 引导 Agent：先同步最新代码，再根据本机 Task 总结推进项，最后通过 Daily Progress Application/CLI 写入 `.buildr/daily-progress/<project-code>/` 当天文件。该 Skill MUST NOT 让 Buildr 产品扫描 Git 或自动撰写摘要，MUST NOT 把每日演进写入 Task Record，也 MUST NOT 要求产品 cron。

#### Scenario: 用户要求生成今天的项目每日演进
- **WHEN** 用户要求展示、生成或重跑某 Project 的每日演进
- **THEN** Skill MUST 先执行写入前代码同步门禁
- **AND** 成功后 MUST 调用 Daily Progress record，而不是手写 YAML 或写入 SQLite

#### Scenario: 用户问能否每天自动跑
- **WHEN** 用户询问每日演进是否自动执行
- **THEN** Skill MUST 说明这取决于 Agent 宿主定时器
- **AND** MUST NOT 引导实现 Buildr 产品 cron
