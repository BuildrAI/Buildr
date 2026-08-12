# Task Finish 第一阶段耗时优化

## 一句话摘要

在保留 Task Finish 持久化编排架构的前提下，消除 OpenSpec、lease、执行上下文、验证进程和资产审查造成的可避免返工，使正常收尾进入 5–7 分钟级目标。

## 背景与问题

Task Finish 已能安全恢复和防止重复副作用，但正常收尾仍可能因确定性步骤由 Agent 手工拼装而出现长时间返工。最近暴露的主要问题包括 OpenSpec delta 逐个失败、sync 顺序错误、lease 过期、错误 cwd/入口/selector、验证遗留进程和 archive 后信号未进入 asset review。

## 目标与非目标

目标是增加安全 helper、执行计划预检、lease 续租、owned process cleanup、完整 timing 和 late finalize。非目标是建设完整自动 executor、强制新 session、激进并行化或直接达到约 3 分钟。

## 受影响用户或角色

主要影响通过 Agent 完成 Buildr Workspace 任务收尾的维护者与并发任务执行者。

## 核心流程

Agent 在同一 task environment 中领取 finish step；Buildr 预检 execution plan，按 receipt 固定推进 OpenSpec convergence，在共享写临界区使用可续租 lease，验证 runner 清理 owned descendants，并在晚期 observation 变化时于 cleanup 前再次 finalize。

## 关键变化

- OpenSpec convergence 顺序与 receipt identity 固化。
- execution plan 在执行前验证 cwd、入口、script 和 selector。
- lease 支持安全 renew，timing 保留全部 attempts。
- verification cleanup 与 late asset review 成为正式 evidence。

## 影响、风险与兼容性

现有 `inspect|advance|resume` 保持兼容；新增字段和动作按兼容默认值读取。主要风险是错误清理进程或续租覆盖 owner，分别通过 runner-owned process group 和 fencing identity 限制。

## 验收摘要

相关 unit、contract、integration 与 affected verification 通过；功能测试证明多问题聚合、严格 convergence 顺序、续租 fencing、执行计划 fail-fast、owned process cleanup、完整 timing 与 late finalize。实际收尾报告观察 5–7 分钟目标，不设置机器相关硬阈值。

## 技术 Artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
