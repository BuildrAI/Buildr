---
name: task-finish
description: 用户要求“收尾”、完成任务或自动完成已验证 Change 的归档、集成、推送与安全本地清理时使用；通过持久化 finish run 渐进执行并支持跨 session 恢复。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口；“收尾”的一次性授权仅覆盖delivery closeout。用 `buildr task finish inspect|advance|resume|renew|run|recover` 持久化进度并调用 selected providers；候选修复不属于收尾。

## 开始与采用

确认 task/change、目标分支、远端与排除动作；默认只 push 已集成目标分支。创建或继续 run id。

使用明确 target/workdir 与 receipt-bound CLI。Rule/Skill 修改不要求新 session。

## 推进

优先用完整 `--execution-plans` manifest 调用 `run`，连续推进确定性步骤；语义冲突、授权缺口或未登记动作停回 checkpoint。默认用 compact JSON，诊断时使用 `--detail full`。

identity变化时提交含before/after identities、fingerprints、transition proof与plans的`buildr.task-finish-recovery/v1`；未知变化fail closed，runtime-only须有digest/path证明。formal assurance失败先报告主缺陷、影响、repair scope与重验成本；只有`--repair-authorization`绑定当前failure identity且全部changed paths位于allowed scopes，才能进入re-verification。

OpenSpec convergence 使用 Component 贡献的产品 orchestrator；返回 `semantic-resolution-required` 时才由 Agent 处理最小语义上下文。Skill 不直接编辑 canonical 或拼接验证 duration。正式保证只在 canonical、target、runtime 收敛后执行，由 task-verification provider 持有；identity 匹配的 evidence 不重跑。

每步提交非空 fingerprint、effects 与 evidence；自动化不绕过状态机证据。

push 使用 `--ref-transition` 提交 before/after expected/observed refs，保留 expected/observed target ref 兼容语义；自身成功推进和远端已等于 candidate 是成功，只有 push 前外部漂移才是 `target-race`。

<!-- buildr:skill-contributions pre-verification -->

<!-- buildr:skill-contributions pre-spec-sync -->

<!-- buildr:skill-contributions post-spec-sync -->

`resume` 只重跑 blocked/stale 及其下游；共享写使用 holder/token/expiry fencing 短 lease，可 `renew`，不创建 Workspace 全局锁。running step失效时同时终结 attempt与自有lease。

含 delta 时由产品执行 rehearsal → pre-sync → deterministic apply → strict → post-sync；identity 变化返回 pre-sync，禁止事后 baseline。

## 授权与停止

“收尾”授权归档、提交、目标分支集成/push、入口迁移和安全清理；不授权候选修复、force push、远端任务分支操作、丢弃改动、改写共享历史或语义冲突。failure identity变化、scope扩大或授权缺失时停止。

asset review 返回 `awaiting-human` 时在 cleanup 前等待；revision 变化执行 late review。optional provider 不可用则记录降级。不得删除其他任务状态。

## 完成

cleanup 先在task environment内执行 `cleanup-prepare`，把prepared completion receipt写入canonical Workspace；实际删除task-owned process、worktree和branch后，从retained checkout执行 `cleanup-finalize`。prepare不得表述为complete，cleanup失败不得重做远端动作。

完成后报告验证、effects、交付、runtime、清理、receipt与风险；分别计量initial verification、repair、re-verification、最后有效assurance后的closeout-only和end-to-end。ledger只计Buildr-owned invocation/raw bytes；不可观察间隔如实声明，不推断token。compact先给primary failure/repair decision，再列warning；必要时打开digest diagnostic。
