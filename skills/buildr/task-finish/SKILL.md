---
name: task-finish
description: 用户要求“收尾”、完成任务或自动完成已验证 Change 的归档、集成、推送与安全本地清理时使用；通过持久化 finish run 渐进执行并支持跨 session 恢复。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口；“收尾”的一次性授权只覆盖delivery closeout。用 `buildr task finish inspect|advance|resume|renew|run|recover` 持久化进度并调用 selected providers；`actions`只读查询产品action registry。候选修复不属于收尾。

## 开始与采用

确认 task/change、目标分支、远端与排除动作；默认只 push 已集成目标分支。创建或继续 run id。

使用明确 target/workdir 与 receipt-bound CLI。Rule/Skill 修改不要求新 session。

## 推进

先查询`actions --run <id> --json`，再用`run --action-context <json>`提交结构化事实。registry自动执行`product-executable`；按handoff处理`agent-provider-required`；只补`input-required`。仅`agent-reasoning-required`需要Agent推理。显式plans仅兼容/恢复并标记`caller-supplied`。

identity变化用 recovery manifest 一次提交 before/after identity、fingerprint 与 proof；未知变化 fail closed。formal assurance 失败先报告主缺陷，只有匹配 failure identity 与 allowed scopes 的 repair authorization 才能修复重验。

OpenSpec 收敛由产品执行。`post-sync` 后 delta 变化时，核验 receipt、baseline、sync plan、canonical 与 executable；可证明则恢复 `pre-sync` 并重跑，禁止 Agent 手工还原。`recoverable-stale-receipt` 自动执行，`semantic-resolution-required` 交给 Agent，`recovery-unprovable` 补证。正式保证只在 canonical、target、runtime 收敛后执行，由 task-verification provider 持有。每步提交非空 fingerprint、effects 与 evidence；push 保留 expected/observed target ref。

integration-push 后提供 retained root、retained 绝对 `cliInvocation`、Agent 和完整 `changedPaths`。`retained-convergence` 始终 doctor，仅在 runtime 资产受影响时 sync；CLI/Local App impact 才交给 `runtime-install`，否则 not-applicable。不得从 cwd 或 task checkout 猜输入，不重跑 Candidate；失败只恢复本步骤及下游。

<!-- buildr:skill-contributions pre-verification -->

<!-- buildr:skill-contributions pre-spec-sync -->

<!-- buildr:skill-contributions post-spec-sync -->

`resume` 只重跑 blocked/stale 及其下游；共享写使用 holder/token/expiry fencing 短 lease，可 `renew`，不创建 Workspace 全局锁。running step失效时同时终结 attempt与自有lease。

## 授权与停止

“收尾”授权归档、提交、目标分支集成/push、入口迁移和安全清理；不授权候选修复、force push、远端任务分支操作、丢弃改动、改写共享历史或语义冲突。failure identity变化、scope扩大或授权缺失时停止。

asset review 返回 `awaiting-human` 时在 cleanup 前等待；revision 变化执行 late review。optional provider 不可用则记录降级。不得删除其他任务状态。

## 完成

cleanup 先在task environment内执行 `cleanup-prepare`，把prepared completion receipt写入canonical Workspace；实际删除task-owned process、worktree和branch后，从retained checkout执行 `cleanup-finalize`。prepare不得表述为complete，cleanup失败不得重做远端动作。

完成后报告验证、交付、retained convergence、runtime、清理、receipt与风险；说明 sync、CLI/Local App 的 executed/not-applicable，分开计量verification、repair、re-verification、closeout-only和end-to-end。不可观察间隔不推断token。
