## Context

Parent Coordination Application 当前直接构造 `buildr.parent-coordination-result/v2`。对 v2 Parent，`parentPlan` 与 `plan` 几乎完整重复，`plan.contributions` 又与顶层 rich `contributions` 重复静态 work item 内容；此外还保留多个同义 alias。P1 已把数据库读取固定为两条参数化查询，热态 Application 约 12–14 ms，因此剩余收益主要来自 Agent 可读 JSON 体积、协议清晰度和专业 Result 边界。

本次同时影响 buildr Service 的 Application/CLI/HTTP/package assets 与 buildr-web Service 的 TypeScript consumer，但不改变 Parent Plan、Task Development、Review、Finish 或 SQLite authority。

## Goals / Non-Goals

**Goals:**

- 让 v3 对同一长期或派生事实只返回一份 canonical 表达。
- 保留 Parent/Child/ordinary/legacy 四种 mode、三个 work item 状态轴、启动就绪与最终验收语义。
- 让大型现有 Parent fixture 的紧凑 HTTP JSON 相对 v2 至少减少 50%。
- 让 CLI、HTTP、Web、Agent Skills 和 package 三入口只认同一 v3。

**Non-Goals:**

- 不保留 v2 adapter、detail mode、feature flag或协议协商。
- 不改变 Parent Plan v1/v2 的持久 schema 或显式 reconcile 流程。
- 不增加缓存、压缩、物化表、migration、后台预取或新的 writer。
- 不改变 UI 信息架构或视觉样式。

## Decisions

### 1. 直接发布单一 v3

所有 Parent coordination action、业务错误和 HTTP response 同时切换到 `buildr.parent-coordination-result/v3`。v2 在本版本终止，迁移只需按字段映射更新消费者。选择直接切换而不是双投影，是因为仓内消费者可原子更新，保留 v2 会继续维持重复结构与额外测试面。

### 2. Plan 与进度只各出现一次

顶层 `plan` 只包含 `sourceSchemaVersion`、`identity`、`outcome`、`architectureDecisions` 和 `finalAcceptance`。顶层 `contributions` 是唯一 work item 集合，包含静态计划字段和 `expectation`、`eligibility`、`actual`、`actualChild`、delivery disposition。删除 raw `parentPlan` 与 `plan.contributions`。

对于持久 v1 Parent，`sourceSchemaVersion` 与原 identity 继续证明来源，rich work item projection 继续提供完整升级输入；不再通过 coordination v3 回传完整 raw v1 object。完整 Development authority 仍可由专业 Application 读取。

### 3. 删除 alias，不删除语义

- `prerequisitesSatisfied` 取代 `finalAcceptanceReady`。
- `startup.next` 取代 `nextActions`。
- `boundContributions` 取代 `plannedContributions`。
- `expectation.child` 取代 work item 的重复 `expectedChild`。
- work item 的 `eligibility.blockers` 取代 `startup.dependencyBlockers`。

`effects`、`diagnostic`、`parentAcceptance`、`startup`、最终验收 blockers 与 mode 继续保留。

### 4. 专业 Result 只返回协调摘要

Planning Review 只返回 presence、applicability、digest、outcome、summary 和 completed time，不再嵌入完整 Review Result。Child 只返回 identity/status、binding、delivery proof 与 Contribution Handoff 的协调摘要；完整 Review/Handoff 仍由专业 Application 拥有。Application 可以在内部先完成完整一致性校验，再投影摘要。

### 5. 使用结构与体积双重回归保护

测试不对任意合法 128-item Plan 设置全局字节上限，而是对两个真实大型 fixture 设置不超过 25 KiB 的基准，并用字段缺失/唯一性断言防止同一长文本再次复制。这样既保护本次目标，也不把合法业务内容长度误当性能错误。

## Risks / Trade-offs

- [外部 v2 脚本立即失效] → schema identity 明确升级，文档给出字段迁移表；本次按用户决定不提供兼容期。
- [移除 raw v1 Plan 降低低层审计便利] → v3 保留来源 schema 与 identity；需要 raw Development authority 时使用专业 Application，而不是协调聚合结果。
- [Handoff 摘要遗漏未来协调字段] → 摘要保留 stable IDs、证明状态和 disposition 集；新增协调语义时按 v3 additive rule扩展。
- [fixture 字节预算脆弱] → 只约束固定大型 fixture，并同时验证结构唯一性。

## Migration Plan

1. 修改 Application v3 shape 与 schema registry，并同步业务错误 envelope。
2. 同步 CLI/HTTP tests、Buildr Web types/consumer 和随包 Agent workflow。
3. 构建正式 `web-dist`，更新 package/docs/current knowledge。
4. 运行大型 fixture、affected verification 和 package parity。
5. 发布说明声明 v2 终止及字段映射；回滚只能回滚整个产品版本，不能让新 Web 与旧 CLI 混用。

## Open Questions

无。用户已明确选择直接升级且不保留兼容层。
