# Local App terminal Task 交付与证据视图

## 一句话摘要

Local App 通过既有 Task、Development、Review、Verification 与 Formal Finish authority 的只读组合，为 terminal Task 展示可证明的交付时事实，同时保持 active Task 的实时 currentness 语义不变。

## 背景与问题

Formal Task Finish 成功交付并清理 Environment 后，Development 无法再实时观察 Content Target，Review/Verification API 也没有 current target identity，导致 Local App 把已交付任务统一显示为 unknown。该行为隐藏了已经存在于 immutable handoff 与 Finish Result 中的交付证据。

## 目标与非目标

目标是派生 terminal delivery status、展示交付时研发/证据快照并优化中文信息层级。非目标是迁移 Finish Result、增加 store/writer、恢复 Environment 或把历史 Candidate/Result 重新标记为 current。

## 受影响用户或角色

通过 Local App 查看正式 Task 研发与交付证据的人类维护者，以及消费同一 Application read model 的 Agent。

## 核心流程

Application 读取 Task Record 与 Development immutable handoff，按 Task 查询既有 Finish JSON，严格匹配 Task/handoff/Candidate/Content Target/carrier/remote/cleanup，再用 handoff digest/target identity 关联 Review 与 Verification slots；HTTP/Web 只展示组合结果。

## 关键变化

- terminal 状态为 delivered、completed-no-change、completed-unproven、abandoned 或 unavailable。
- live applicability 与 delivery snapshot 分离。
- Local App 四页签不变，交付结论与时间优先，技术 identity 下沉。

## 影响、风险与兼容性

不迁移数据且不改变 writer；风险主要来自历史 Finish JSON 损坏与多 run 选择，均 fail closed。active Task 现有 current/stale/unknown/missing 行为保持兼容。

## 验收摘要

自动化覆盖 active ready/unavailable/stale、completed delivered/noChange/unproven、identity mismatch、多 run、planning gate missing、abandoned、HTTP 安全和 Browser Smoke。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
