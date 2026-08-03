# 恢复 Task Finish 的 target-race 候选流程

## 一句话摘要

当目标分支在候选冻结后前进时，让持有产品生成 token 的 Task Finish 安全重建候选并重新验证，而不是重复交付已过期候选。

## 背景与问题

`deliver` 已能识别目标 ref 与 freeze record 不一致并返回 `task-finish.target-race`，保护新目标不被覆盖。现有 resume 却只重跑 deliver，仍比较相同的旧 expected ref，因此同一个 blocked run 没有恢复路径。

## 目标与非目标

目标是保持唯一的 run、token、target lease 和 Task Verification Result writer，由产品在 qualified target-race 后从 prepare 重建当前目标上的候选，再验证和交付。

非目标是新增通用 restart、调用方恢复参数、手写 manifest、target 覆盖、自动 merge 或 force push；其他候选未变的暂态阻塞继续从原 blocked phase 恢复。

## 受影响用户或角色

- 并行完成 Buildr Task、遇到目标分支前进的 Agent 与维护者。
- 消费 canonical Task Finish run/inspect 结果的 Local App 与自动化入口。

## 核心流程

1. `deliver` 观察到目标 ref 前进后释放 lease，持久化 `task-finish.target-race` 与当前产品生成的 resume token。
2. 同一 token 恢复时，产品保留 preflight，失效旧 candidate、verification、delivery/completion 与 prepare 下游 phase state。
3. 既有 prepare rebase 并冻结当前目标上的候选；既有 verify 只复用匹配新候选的 Result，否则执行新的 required verification。
4. deliver 仅在新 freeze 的 expected ref 仍匹配时 fast-forward；再次漂移则再次安全 blocked。

## 关键变化

- 恢复判定严格绑定 `blocked + deliver + task-finish.target-race + exact current token`。
- 重置范围只覆盖 candidate 依赖阶段，保留 attempts/duration 与仍有效的 preflight。
- 不新增 CLI action、schema migration、第二 Result writer 或人工恢复协议。

## 影响、风险与兼容性

恢复会重新执行 Candidate verification；这是新 candidate identity 不能复用旧 evidence 的必要成本。已有 v1 run shape 无需迁移，升级后的 executor 可直接消费旧 blocked run 和其仍然匹配的 token。目标再次前进会重复安全阻塞，不会覆盖 target。

## 验收摘要

- 无 token 或非 qualified blocked run 不能触发重置。
- target-race 恢复重新执行 `prepare → verify → deliver → cleanup`，并使用新的 frozen candidate/verification output。
- cleanup 等其他暂态恢复仍只重跑最早 blocked phase。
- OpenSpec strict、proposal contract、受影响测试和正式 Candidate 通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Finish execution delta](specs/task-finish-execution/spec.md)
- [Tasks](tasks.md)
