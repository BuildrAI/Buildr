---
name: task-finish
description: 用户要求“收尾”、完成任务或自动完成已验证 Change 的归档、集成、推送与安全本地清理时使用；通过持久化 finish run 渐进执行并支持跨 session 恢复。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口。“收尾”的一次性授权只覆盖 delivery closeout；候选修复不属于收尾。

## 开始

确认 task/change、目标分支、远端和排除动作，默认只 push 已集成目标分支。创建或继续 run id，使用明确 target/workdir 与 receipt-bound CLI。

用 `buildr task finish inspect|advance|resume|renew|run|recover` 持久化推进；`actions` 只读查询 action registry。先查 action resolution，再提交结构化事实。

## 推进

Registry 自动执行 `product-executable`；按 handoff 调用 selected providers；只补 `input-required`。只有登记外语义分支交给 Agent，显式 plan 仅作兼容恢复。

每步保存非空 fingerprint、effects、evidence、attempt timing 和失效依赖。`resume` 只重跑 blocked/stale 及其下游；语义冲突和状态无法证明必须等待可验证的新输入，重要集成冲突还可使用绑定阻塞身份的显式授权，正式保证失败只能使用修复授权与类型化恢复。不得用普通 `resume` 或调用方自报 passed 覆盖产品阻塞，也不得重复已证明的验证、push 或清理前动作。

Identity 变化用 recovery manifest 一次提交 before/after facts 与 proof；未知变化 fail closed。正式保证只在 canonical、target、runtime 收敛后执行，并由 task-verification provider 持有。

<!-- buildr:skill-contributions pre-verification -->

<!-- buildr:skill-contributions pre-spec-sync -->

<!-- buildr:skill-contributions post-spec-sync -->

确定性 OpenSpec 收敛由产品 action 内部完成并只返回 passed、blocked 或 recovery-unprovable。Agent 只处理语义冲突或人工事实核对；需要解释状态无法证明时只读取产品返回的逐文件 before、expected、actual 摘要，不恢复 canonical、不刷新 baseline、不选择内部 stage。

共享写使用 holder/token/expiry fencing 短 lease，不创建 Workspace 全局锁。Running step 失效时终结 attempt，并只释放仍由当前 token 持有的 lease。

Integration-push 必须保留 expected/observed target ref。随后以 retained root、绝对 CLI、Agent 和完整 changed paths 运行 retained-convergence；它始终 doctor，只在 runtime 资产受影响时 sync，且不重跑 Candidate。

## 授权与停止

收尾授权归档、提交、目标分支集成/push、入口迁移和安全清理；不授权候选修复、远端任务分支操作、force push、丢弃改动、改写共享历史或语义冲突决策。

Formal assurance 失败先报告主缺陷；只有匹配 failure identity 和 allowed scopes 的 repair authorization 才能修复重验。范围扩大、证据陈旧或状态无法证明时停止。

asset review 返回 `awaiting-human` 时在 cleanup 前等待；revision 变化执行 late review。optional provider 不可用则记录降级，不得删除其他任务状态。

## 完成

Cleanup 先在 task environment 内 prepare，把 completion receipt 写入 canonical Workspace；实际删除 task-owned process、worktree 和 branch 后，从 retained checkout finalize。Prepare 不得表述为 complete。

最终报告验证、交付、retained convergence、runtime、清理、receipt 和风险；分别计量 verification、repair、re-verification、closeout-only 与 end-to-end。正式验证时间只消费产品实测或候选身份匹配的验证器摘要，检查点等待和不可观察区间单列，不从中推断 token、调用数或验证执行时间。
