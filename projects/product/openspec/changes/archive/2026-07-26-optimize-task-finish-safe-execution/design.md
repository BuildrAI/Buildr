## Context

现有 finish run 已持久化步骤、fingerprint、execution plan、lease 和 evidence，但 Agent 必须逐步编排。上一轮真实 run 7 分 1 秒，正式验证仅 31.63 秒，主要成本来自 contract convergence 与工具往返。

## Goals / Non-Goals

**Goals**
- 自动执行可证明安全、确定且已声明的步骤。
- 保持现有状态机为唯一 authority，异常仍可 inspect/resume。
- 并行化无依赖只读 observation，并返回准确 wall-clock。

**Non-Goals**
- 不自动解决语义冲突、Git 冲突或新增授权。
- 不降低验证、OpenSpec 或远端并发门禁。

## Decisions

### 在状态机上增加 executor，不建立第二套 workflow
safe executor 循环读取 checkpoint，仅对登记的 safe action handler 执行预检、动作和 completion。未登记、需人工判断或副作用超界的步骤停止并返回 next action。

### 只读 observation 可并行
同一 step 所需且互不写状态的 doctor input、Git ref 和 OpenSpec status 可并行收集；共享写入仍使用既有 lease 与 fencing。

### 失败保留原 checkpoint
handler 失败、identity 漂移或授权不足时提交 structured blocked，已 passed effects 不重复，恢复继续使用现有 resume。

## Risks / Trade-offs

- handler 注册错误可能扩大副作用，因此默认拒绝未登记 action，并要求 execution plan/receipt identity。
- 自动化减少 Agent 往返，但不能消除外部网络和正式验证耗时。
