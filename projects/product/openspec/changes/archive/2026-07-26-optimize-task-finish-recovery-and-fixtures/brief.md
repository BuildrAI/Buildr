# 优化 Task Finish 恢复与 OpenSpec 验证成本

## 一句话摘要

在不降低正式保证的前提下，让 Task Finish 一次恢复候选身份变化后的确定性步骤，把 OpenSpec contract fixtures 从约 90 秒降到 20 秒预算，并提供可信的失败诊断和完成计量。

## 背景与问题

上一轮 deterministic convergence 已消除 Agent 手工同步 11 个 Requirements，但真实收尾仍耗时 22 分 13 秒。两个新 capability 骨架问题分别在正式 affected assurance 才暴露，导致三次约 100 秒验证；候选修订后还需逐步重建 context 到 runtime 的证据。最终通过的 affected run 中，OpenSpec contract fixtures 单项耗时 90.174 秒。completion receipt 又只统计到 3 次 observation，无法代表真实工具往返和输出成本。

## 目标与非目标

目标是提交前验证完整 expected OpenSpec Project、提供原子 identity recovery、复用同一验证 run 的 fixture preparation、改善 compact diagnostics，并让完成计量明确可观察 coverage。非目标是自动解决语义冲突、跨 candidate 复用可变 fixture、统计 Agent 内部 token或跳过 affected/Candidate assurance。

## 受影响用户或角色

- 使用 Buildr Task Finish 收尾的 Agent：减少逐步恢复命令和大段失败诊断解析。
- 维护 Buildr 产品的开发者：更早发现 deterministic sync 结构错误，并获得可归因的验证耗时。
- 审查交付质量的用户：completion receipt 能区分产品执行、编排间隔和不可观察部分。

## 核心流程

Agent 提交版本化 identity transition；Task Finish 原子计算真正失效范围并自动推进安全步骤。Deterministic apply 在 temporary Project 中严格验证 expected tree后才写 canonical。Affected verification只准备一次 identity-bound OpenSpec基础fixture，各assertion使用只读共享或隔离副本。失败和完成均写入有界diagnostic/observation ledger。

## 关键变化

- 新增 Task Finish recovery manifest与CLI动作。
- 新增 expected-tree strict validation提交前门禁。
- 重构OpenSpec contract fixture preparation与scheduler artifact dependency。
- completion metrics增加coverage、orchestration gap和真实output bytes。
- 增加约3分钟正常finish与20秒fixtures性能目标的真实benchmark。

## 影响、风险与兼容性

原有`advance|resume|run`继续兼容。Recovery分类不明时按implementation change失效，优先保证正确性。Fixture cache默认仅在单次verification run内使用，避免跨run污染。预算超限只产生质量warning，不改变验证结果。

## 验收摘要

- 不合法的新 capability expected tree在canonical写入前被阻塞且零写入。
- Candidate修订后一次recovery调用到达formal assurance边界，不重复有效副作用。
- OpenSpec contract fixtures保留完整coverage并接近20秒预算。
- Compact结果可直接看到失败stage/code/next action；completion receipt不再把部分观察冒充完整往返。
- 真实正常Task Finish样本接近3分钟，异常样本明确分离retry waste。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/openspec-deterministic-sync/spec.md`
- `specs/task-finish-execution/spec.md`
- `specs/task-verification/spec.md`
- `tasks.md`
