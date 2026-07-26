## 摘要

把 Task Finish 从依赖单个 Agent 会话记忆的长 Skill，重构为薄入口加持久化、可恢复、可并发的 finish run。

## 背景与问题

旧流程虽有正确 provider 分层，但步骤、失效和副作用进度只存在于会话。后半程失败或 session handoff 容易重复验证、push，多个任务也无法安全共享 target branch 与本机入口。

## 目标与非目标

目标是渐进 checkpoint、精确失效、幂等恢复和短 lease；不在 Buildr 中实现第二个 Agent、Git/验证 provider 或 Codex worktree 管理器。

## 核心流程

Agent 在同一用户对话和 task environment 中创建 finish run，按 `nextAction` 调用 selected provider，再提交 fingerprint、effects 和 evidence。正式验证位于 canonical/target/runtime convergence 后；blocked/stale 只重跑自身和下游。后台 session 只是可选执行载体，同一 task/change/run identity 保持不变；Buildr 不声称能自动 handoff Agent host。

## 风险与验收

以行为测试覆盖恢复、失效、幂等、并发与 lease；Task Finish Skill 保持 30–50 行、约 1,500–2,500 Unicode 字符。不得使用 Workspace 全局锁或伪造 Codex/Buildr worktree adoption evidence。
