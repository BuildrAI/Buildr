# Task Finish 身份与计时事实优化

## 摘要

收紧 Task Finish 当前有效 evidence、effect 和 execution timing 的事实来源，避免候选身份变化后旧证据继续进入完成回执，也避免把 Agent claim/complete 往返误报为正式验证执行时间。

## 核心变化

- checkpoint 和 completion receipt 只投射最后一次成功 completion identity 引用的 evidence/effect。
- Buildr 自动执行动作以 attempt-bound observation 计算 execution duration，并把其余 wall-clock 单列为 orchestration 或 unobserved。
- formal assurance 阶段指标消费产品 observation，而不是调用者自行填写的时间。
- 已解决故障退出 current diagnostic，历史完整输出仍由 observation ledger 的 artifact 引用保留。
- OpenSpec candidate audit 相对目标基线检查完整候选并核验当前 convergence receipt，已提交的 canonical 回退不再被漏检。
- OpenSpec convergence 先按自洽的旧 delta/plan 与唯一同步 transition identity 观察 canonical；当前 delta 已变化时只接受旧 expected 的严格 append-only 扩展并重新规划，否则保持 fail closed。

## 边界

本轮不实现 provider action 连续执行，不处理 detached process、selector 或 compact output 优化，也不扩大 Candidate 的验证能力集合；只修复既有 OpenSpec candidate audit 的候选身份观察范围，并补齐可证明旧 v2 receipt 的兼容迁移。

## 验收

身份失效后旧 evidence/effect 不再可见；并行 formal assurance 不重复累计命令耗时；外部 provider 的 passed/failed/incomplete summary 与 completion outcome 一致；恢复成功后 compact/full checkpoint 不显示旧诊断；已提交 canonical 回退没有匹配 convergence receipt 时 candidate audit 失败；旧 v2 receipt 的 transition-only plan identity 与旧 delta 仅在证明链自洽时完成迁移，当前 delta 变化后安全重规划。
