# 收敛正式任务准入与收尾契约

## 一句话摘要

让 Buildr 只在实际消费受管环境或正式交付证据时阻断危险动作，同时允许 Agent 通过明确仓库和真实远端事实完成合法工作与交付对账。

## 背景与问题

Formal Task、Task Environment 与自动 Finish 当前仍被部分实现和 Skill 扩大为通用工作许可。即使 Agent 已经能够核验 repository、scope、授权和真实 remote，缺少 Plan、Receipt 或内部阶段也可能阻止无关工作或要求重复走自动路径。

## 目标

- Environment 只治理 Buildr-managed checkout、Preparation、runtime projection、持久资源、正式环境证据和安全 cleanup。
- 自动 Finish、直接 Git、PR 与 Delivery Reconciliation 消费同一不可变研发交接并形成一致 Delivery。
- Delivery、Activation、Environment Cleanup 与 Diagnostics 分别表达，局部 attention 不撤销交付。

## 非目标

- 不导入外部 Verification 或无 Development handoff 的完成声明。
- 不补造 Environment Receipt、Candidate、Review 或 Verification。
- 不放宽 remote identity、共享历史、Task Contribution containment 与安全删除门禁。

## 受影响用户或角色

- 使用 Buildr 正式 Task 但希望由 Agent 直接编辑、构建或测试的研发人员。
- 通过 Git Operations、PR 或其他授权路径完成交付后需要 Buildr 登记结果的 Agent。
- 维护 Task Environment、Task Development 与 Task Finish 的产品开发者。

## 核心流程

1. Agent 创建或恢复 Formal Task，Task Entry Snapshot 提供受管 Environment 的推荐入口。
2. Agent选择直接工作时按真实repository、scope与副作用边界推进，不声称ready Environment或正式Result。
3. 需要Buildr-managed执行或正式证据时，进入Task Environment并遵守matching execution roots。
4. 研发交接完成后，Agent选择自动Finish或直接Git/PR；直接交付后由reconciliation读取真实remote并登记同形Delivery。
5. Delivery成立后Task保持completed；Activation、Cleanup和Diagnostics分别继续或形成attention。

## 关键变化

- Environment缺失从Formal Task全局前置降为动作局部建议或门禁。
- `task finish reconcile`可在Environment不可用但交付上下文可独立证明时继续。
- 多repository逐项保存Delivery，未证明部分不撤销已成立事实。

## 影响、风险与兼容性

- 旧Environment Receipt和Finish Result继续兼容读取，无SQLite迁移。
- 直接工作不能冒充正式Evidence；各专业writer仍核验current identity。
- 无Environment的reconciliation必须从Task scope、registry、Git topology和remote唯一解析目标，否则保持未证明。

## 验收摘要

- 无Environment的新active Task可继续明确的直接工作，同时收到可选prepare建议。
- Buildr-managed动作仍在Environment identity缺失或漂移时fail closed。
- 自动Finish和外部交付对账产生一致逐repositoryDelivery与Task终态。
- Doctor、Activation、Cleanup或Diagnostics失败不会撤销已确认Delivery。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Implementation Tasks](tasks.md)
- [Task Environment delta](specs/task-environments/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Task Finish delta](specs/task-finish-execution/spec.md)
