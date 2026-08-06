# Local App 三个专业页签直接读取

## 一句话摘要

让 development、reviews、verification 三个 Local App 页签分别读取自身专业记录与 Finish 已写入的终态交付关联，移除对完整 terminal 聚合投影的依赖。

## 背景与问题

终态交付关联已经由 Finish 持久化到 lifecycle read model，但三个页签仍通过 `inspectTaskTerminalDelivery` 聚合读取，导致单个 GET 触达其他专业 current record，并让页面读取承担不属于当前页签的组合责任。

## 目标与非目标

目标是收窄三个页签的读取边界、保持公开响应和终态文案兼容，并用调用次数与隔离测试证明读取不会随其他专业 Result 增长。非目标是改变 writer authority、structured store 边界、Finish 关联写入或非阻塞执行器。

## 受影响角色

- 使用 Local App 查看 Task 研发、审查和验证事实的人。
- 维护 Task Development、Review、Verification 与 Finish 读取边界的 Buildr 维护者。

## 核心流程

每个页签先调用自身 Application 的 current read model，再通过共享窄 helper 读取 Task Record 与 lifecycle 中已保存的 terminal association。active、no-change、abandoned、completed-unproven 和 delivered 语义继续由已保存事实决定；旧的完整聚合入口保留为兼容接口。

## 关键变化

- 三个 GET view 不再调用 `inspectTaskTerminalDelivery`。
- Development 保留自身 Development snapshot；Reviews 与 Verification 保留自身 Result 正文。
- 增加单页签调用计数、跨专业隔离和浏览器/system 回归证据。

## 影响、风险与兼容性

无需数据迁移或新增数据库表。主要风险是各页签 terminal 字段组合发生分叉，统一窄 helper 与既有 response 测试控制该风险；完整 terminal Application 保留给既有兼容消费者。

## 验收摘要

Unit、System、Browser Smoke 与 Product changed verification 通过；每个页签只读取自身专业节点、Task Record 和已写交付关联，不读取其他专业节点或完整聚合器。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [local-workspace-application spec](specs/local-workspace-application/spec.md)
- [tasks.md](tasks.md)
