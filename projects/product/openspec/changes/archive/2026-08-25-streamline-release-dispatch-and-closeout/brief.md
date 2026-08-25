# 收敛发布派发与收尾编排

一句话摘要：用可恢复的 release orchestration runner 收敛 PR 合并后的 readiness、显式授权 dispatch 与 Publication 后 closeout，并从既有 owner facts 生成可验证的 Release Phase Timeline。

## 背景与问题

Buildr 已分别拥有 selection、Candidate、release→main、protected Publication、dev provenance reconciliation、Git closeout、Task、Environment 与 Doctor owner，但发布 Agent 仍需手工传递多段 identity、逐步恢复失败并在事后反推阶段耗时。rc.23 暴露了 merge 后等待、重复拼装 context、closeout 漏步和 timeline 统计不准的成本。

## 目标与非目标

- 目标：提供 `prepare-dispatch`、`dispatch`、`closeout` 三个幂等恢复动作。
- 目标：保留 publication 与 cleanup 的显式授权，以及所有既有 owner 的独立成功事实。
- 目标：生成 portable `buildr.release-phase-timeline/v1`，区分执行、平台排队、环境审批与人工决定，并表达多次 Candidate attempt 和 evidence 复用。
- 非目标：不新增 release 状态库、通用工作流引擎或跨 owner 原子事务。
- 非目标：不实现 failed-shard retry；只消费其最终 closed facts。

## 受影响角色

- Buildr release maintainer：readiness 后只需确认 current frozen context 的一次 publication 授权，授权不会从历史状态推断。
- Buildr release Agent：使用统一 result 恢复唯一未完成 owner，不再靠聊天摘要重建状态。
- 发布复盘与维护者：直接消费 owner-backed timeline 统计各阶段耗时，不估算缺失边界。

## 核心流程

PR merge → `prepare-dispatch` 重读 current facts并冻结 context → 等待维护者显式授权 → `dispatch` 重验 digest并调用 protected transaction → hosted evidence成立 → `closeout` 依次完成 dev reconciliation、Git closeout、lifecycle closed、Task no-change completion、Environment cleanup 与 Doctor。

任一步失败时保留已成立 effects；再次调用只重验并恢复尚未完成的 owner。Task 已 terminal 但 Environment cleanup 或 Doctor 失败时，不重跑 Publication、Git cleanup或 Task completion。

## 关键变化

- 新增 release phase timeline domain、closed schema、identity 与 compact/full projection。
- 新增 release orchestration runner 与 CLI/JSON 入口，复用 transaction、evidence、Git convergence、Task Environment 与 Doctor owner。
- canonical mutation 只通过 Environment Receipt 指向的 retained controller 执行。
- `buildr-release` Skill 与 release checklist 改为消费统一编排结果。

## 影响、风险与兼容性

编排无法回滚跨 owner 部分成功，因此采用前向恢复并暴露 precise next action。cleanup 授权保持逐次显式，正式远端 release ref 默认保留。原 transaction、evidence 与 Git convergence 入口继续存在，便于诊断和兼容恢复。

## 验收摘要

- `prepare-dispatch` 零副作用；`dispatch` 缺授权或 context 漂移时在远端写入前失败。
- `closeout` 能在任一 owner 失败后只恢复未完成步骤，并在 terminal Task 后继续 cleanup/Doctor。
- Timeline 对多 attempt、reused evidence、rerun scope、aggregate identity 与四类等待形成稳定投影。
- 真实 failed-shard retry Result 已按 `runId`、`runAttempt`、`failedShards` 与 aggregate `evidenceAttempts` 完成 Timeline 联合验收；merge 后 readiness/dispatch 与 Publication 后 closeout 中断恢复链也已通过端到端 fixture。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/agent-task-workflows/spec.md`
- `specs/open-source-release-governance/spec.md`
- `specs/release-collection-model/spec.md`
- `tasks.md`
