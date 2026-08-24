# 精简 Parent Coordination v3 协议

## 一句话摘要

将 Parent Coordination 直接升级为单一紧凑 v3，删除重复 Plan、work item、alias 和专业 Result 正文，同时保持现有 Parent/Child 协调语义与界面。

## 背景与问题

P1 已把 coordination 的只读数据库访问固定为两条查询并降到毫秒级，但 v2 对同一 Parent Plan 和 Contribution 静态内容重复序列化，还保留多组兼容字段。大型 Parent 的紧凑 JSON 仍有约 45–52 KB，CLI pretty JSON 更大，主要浪费 Agent context，而不是造成新的数据库延迟。

## 目标与非目标

目标是让一个事实只有一个公开表达，将真实大型 fixture 的响应减少至少 50%，并让 CLI、HTTP、Web、Agent Skills 与 package 使用同一 v3。非目标包括保留 v2、增加detail模式、改变UI、修改SQLite、增加cache或改变Parent Plan与专业Result authority。

## 受影响用户或角色

- 通过 Agent 规划、启动和验收 Parent/Child Task 的人；
- 消费 `task parent ... --json` 的 Agent 和自动化；
- 在 Buildr Web 查看 Parent Overview 或 Child Parent来源的人；
- 维护 Buildr package、CLI、HTTP 与 Web parity 的开发者。

## 核心流程

Agent或Web读取Parent coordination时，Application先从同一两条只读查询验证Task、Development、Review、Environment与Finish事实，再只返回一个Plan摘要、一份rich Contributions、紧凑Review/Child delivery摘要、startup与最终验收前置条件。所有action和错误路径均使用v3，消费者一次性迁移，不存在v2 fallback。

## 关键变化

- 删除`parentPlan`与`plan.contributions`，只保留顶层`plan`摘要和`contributions`。
- 删除`finalAcceptanceReady`、`nextActions`、`plannedContributions`、重复`expectedChild`与`startup.dependencyBlockers`。
- Planning Review和Contribution Handoff只返回协调摘要，不再复制完整专业Result。
- Buildr Web、Agent Skills、CLI/HTTP测试、文档与`web-dist`同步切换v3。
- 两个真实大型Parent fixture增加25 KiB与至少50%减重回归。

## 影响、风险与兼容性

这是明确breaking change；所有v2消费者必须同版本迁移，产品不保留compatibility adapter。数据和SQLite不变化，回滚只能回滚整个产品版本，不能混用新Web与旧CLI。完整Review/Handoff仍可从专业Application读取，协调语义不丢失。

## 验收摘要

全部Parent action和blocked envelope声明v3；四种mode、三个work item状态轴、Plan identity、eligible next与最终验收语义保持；仓内不再有v2公开identity或已删除字段消费；大型fixture响应不超过25 KiB且较v2至少减少50%；checkout、npm、HTTP和web-dist parity通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
