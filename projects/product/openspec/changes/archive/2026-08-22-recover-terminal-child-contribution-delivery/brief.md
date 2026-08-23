# 恢复终态 Child Contribution 交付对账

一句话：当 Child 已经通过正式 Finish 真实交付，却因历史编排遗漏而缺少 Contribution Handoff 时，Buildr 可以基于既有 immutable handoff 与 terminal Finish association 追加一条严格、可审计的恢复证据，让 Parent 继续推进而不重做交付或手改数据库。

## 背景与问题

Parent Coordination 正确地拒绝用 Child completed、Git commit 或 archived Change代替Contribution Handoff。但当前 normal writer 都要求 active Task；一旦已经 completed 的 Child 遗漏 binding 或 handoff，Parent 会永久停在 unassigned / unproven，即使 Candidate、Verification、Completion Review、handoff、Finish 与 canonical delivery 都能被正式 authority 证明。

## 目标 / 非目标

目标是增加一次性、append-only 的终态贡献交付对账（Terminal Contribution Delivery Reconciliation），严格绑定 current Parent Plan、真实 Parent/Child、既有 immutable handoff、Candidate/generation、三个 gate、archived Change 与 terminal Finish association。

不重新开放终态 Task，不修改旧 handoff 或 Finish，不从 Git/文件自动推断，不替代 normal Child 的 bind → handoff → Finish 路径，也不建立通用进度、事件或审计框架。

## 受影响用户或角色

- 使用 Parent/Child 协作推进长期交付的用户与 Agent；
- 维护 Task Development、Parent Coordination 与 Task Finish 的 Buildr 开发者。

## 核心流程

1. Agent 发现 completed Child 缺少原生 Contribution Handoff。
2. 恢复入口核验 current Parent Plan、Child terminal delivery 与 immutable handoff 全链路。
3. Agent 显式提交完整 Contribution Handoff、reason 与 source。
4. Task Development append 一条恢复 evidence，不修改历史事实。
5. Parent Coordination 动态消费该 evidence，并标明 terminal-reconciliation proof。

## 关键变化

- 新增 terminal reconciliation Domain / Persistence / Application writer。
- 新增 task parent reconcile-child-delivery 机器接口。
- Parent Coordination read model 支持 native-handoff 与 terminal-reconciliation 两类 proof。
- Agent Skill 明确恢复只用于历史遗漏，normal Child 仍必须在正式 handoff 中提交 Contribution Handoff。

## 影响 / 风险 / 兼容性

该能力是 additive、非破坏性变化。主要风险是恢复入口被当作常规捷径，或错误映射 Contribution；通过 terminal-only、matching Finish、current Plan、显式 reason/source、archived Change 与 owner conflict 校验关闭风险。旧 Workspace 由 SQLite migration 增加空 evidence 表，既有 Task 与 normal flow 不变。

## 验收摘要

- 合法历史缺口可以幂等恢复，Parent 从 unassigned / unproven 变为 delivered。
- 缺少 terminal Finish、immutable handoff、archived Change、current Plan 或存在 owner conflict 时零写入。
- 旧 handoff、Development Receipt、Task Record、Finish terminal 与 Parent Plan bytes保持不变。
- CLI discovery、contract、Skill、架构知识与测试同步。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Parent/Child coordination delta](specs/parent-child-task-coordination/spec.md)
- [Task Development delta](specs/task-development/spec.md)
- [Implementation tasks](tasks.md)
