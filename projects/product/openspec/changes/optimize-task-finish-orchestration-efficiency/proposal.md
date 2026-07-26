## Why

`task finish run` 已能安全执行单个确定性步骤，但真实收尾仍耗时 7–10 分钟，并消耗大量 Agent 工具往返与上下文 Token。最近一次实测还暴露了 push ref 语义歧义、stale attempt 与 lease 残留、验证计时失真、cleanup 先完成后删除以及 finish run 随 worktree 消失等问题，需要把“安全执行步骤”进一步收敛为可信、低往返的完整编排。

## What Changes

- 提供受状态机约束的 OpenSpec convergence 与 formal verification 聚合 handler，产品负责中间 receipt、并行 capability、计时和结构化结果，Agent 只处理语义冲突或未授权动作。
- 允许一次 safe execution 请求携带完整步骤计划，并以 compact result 默认返回必要 checkpoint delta；完整 inspect 保留为显式诊断入口。
- 重新定义 integration push 的 before/after ref evidence，区分外部 target race、自身成功 push 和已到达 candidate 的幂等重试。
- 修复 stale/blocked attempt 与共享 lease 的原子终结和同 run 恢复，确保 complete run 不残留 running attempt。
- 将 cleanup readiness 与真实 cleanup completion 分离，并在删除 task environment 前把 durable completion receipt 保存到 canonical Workspace。
- 让 formal assurance attempt 覆盖真实 verifier execution，准确报告命令、Agent 编排、blocked recovery、waste 和端到端 wall-clock。
- 增加 summary-only doctor/checkpoint 输出和结构化 process cleanup evidence，减少无关成功项输出与自匹配误判。
- 无破坏性命令移除；现有 `inspect|advance|resume|run` 保持兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 增加多阶段安全编排、ref transition、lease 恢复、durable completion、真实 cleanup 与 compact evidence 契约。
- `task-verification`: 增加由 provider 聚合并行 required capabilities、绑定 attempt 生命周期和返回可审计 wall-clock summary 的要求。

## Impact

- 影响 `task-finish` application/run、CLI 参数与 JSON 输出、OpenSpec convergence helper、Git integration evidence、task environment cleanup 和验证 provider 编排。
- 影响 unit、contract、integration-fast、archive lifecycle 与真实 finish timing 验收。
- 需要更新现有 Task Finish 耗时优化任务看板；不降低 affected/Candidate 覆盖，不扩大 Git 或外部系统授权。
