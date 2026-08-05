# Task Finish 后完成顶层任务状态

## 一句话摘要

Formal Task Finish 在交付与全部 cleanup 成功后，通过唯一 Task Record Application 自动把顶层 Task 更新为 `completed`，让 Task 列表与 terminal delivery projection 和真实交付结果一致。

## 背景与问题

当前 Finish 可以完成远端交付、runtime activation、Environment cleanup 和隔离 carrier cleanup，但不会更新 Task Record。成功任务因此仍显示 `active`，而 Local App terminal delivery projection 又要求 Task 已 completed，最终只能显示未交付或继续进行中。

## 目标与非目标

目标是补齐成功 Finish 到 Task Record 的单向终态提交，保持失败不改状态、恢复幂等和冲突终态 fail closed。非目标是新增 store、状态机、公共 CLI、Parent/Child 状态传播，或让 Finish 直接写 SQLite。

## 受影响用户或角色

通过 Agent 或 Local App 执行和查看 Formal Task 的维护者，以及消费 Task Record/terminal delivery Application read model 的客户端。

## 核心流程

Finish 先完成远端交付、retained activation/Doctor、Environment cleanup 和 run-owned carrier cleanup，再调用 Task Record Application。Application 原子完成 active Task；等价 completed 作为幂等成功；`noChange` 或 `abandoned` 冲突保持原样并阻塞 Finish。Task 提交成功后才写 complete Finish completion。

## 关键变化

- Task Record Application 增加 Finish 专用内部终态动作，不改变公共 CLI。
- Task Finish cleanup 增加最后的顶层 Task 提交与类型化 operation evidence。
- system/integration 回归覆盖成功、失败、幂等和冲突终态。

## 影响、风险与兼容性

Task Record schema、SQLite migration、Finish result schema 与 Local App API 均保持兼容。Task Record 提交失败时 Environment/carrier 可能已完成 cleanup，Finish 通过 prepared completion 保留恢复边界；冲突终态绝不覆盖。

## 验收摘要

自动化证明完整 Finish 后 Task 为 `completed/noChange=false`，任一早期失败保持 active，等价终态恢复零写入，`noChange`/`abandoned` 冲突被保留并阻塞，terminal delivery 可组合出 delivered。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`

