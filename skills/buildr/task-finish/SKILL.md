---
name: task-finish
description: 用户要求“收尾”、完成任务或自动完成已验证 Change 的归档、集成、推送与安全本地清理时使用；通过持久化 finish run 渐进执行并支持跨 session 恢复。
---

# Task Finish

本 Skill 是 `buildr.task-finish/v1` 的薄入口，把“收尾”作为一次性授权，用 `buildr task finish inspect|advance|resume|renew` 持久化进度并调用 selected providers。

## 开始与采用

确认 task/change、目标分支、远端、提交范围与排除动作；默认只 push 已集成目标分支。创建或继续稳定 run id。

同一对话用明确 target/workdir 与 receipt-bound CLI 操作。session 只是可选载体；普通 Rule/Skill 修改不要求新 session。

## 推进

读取 checkpoint；`--execution-plan` 预检 executable、cwd、script 与 selector，再由 Agent/provider 执行。用同一 attempt、非空 fingerprint、稳定 evidence/effects 提交结果；重复 identity 必须相同。push 还提交 expected/observed target ref。正式保证只在 canonical、target、runtime 收敛后执行，由 task-verification provider 定级。

<!-- buildr:skill-contributions pre-verification -->

<!-- buildr:skill-contributions pre-spec-sync -->

<!-- buildr:skill-contributions post-spec-sync -->

`resume` 只重跑 blocked/stale 及其下游，passed effects 不重复。共享写临界区使用 holder/token/expiry fencing 短 lease；未过期可 `renew`。不创建 Workspace 全局锁。

含 delta 时聚合 findings 并生成 receipt；严格执行 rehearsal → pre-sync → canonical sync → post-sync。identity 变化返回 pre-sync，禁止事后 baseline。

## 授权与停止

“收尾”授权归档、提交、目标分支集成/push、入口迁移和安全清理；不授权 force push、远端任务分支操作、丢弃改动、改写共享历史或语义冲突。

asset review 返回 `awaiting-human` 时在 cleanup 前等待；revision 变化执行 late review。optional provider 不可用则记录降级。不得删除其他任务状态。

## 完成

完成前 `inspect` 核对全部 passed。报告 identity、验证、attempt timing、retry/waste、effects、archive/integration/push、runtime/doctor、asset/process/environment cleanup 与风险。cleanup 失败不得重做远端动作。
