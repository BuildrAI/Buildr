# 任务收尾的收敛恢复闭环

一句话摘要：Task Finish 在旧 `post-sync` 后发生合法实现变化时，由产品从可证明的 `pre-sync` 事实恢复并重新完成 OpenSpec 收敛，不再要求 Agent 手工处理 canonical、baseline 或 receipt。

## 背景与问题

当前 Task Finish 能按身份变化使旧证据失效，也能在 OpenSpec 收敛凭证与新 delta 不一致时安全停止，但没有产品持有的恢复动作。真实收尾因此会停在 `receipt stale`，安全门禁成为没有下一步的终点。

## 目标与非目标

- 目标：从旧 baseline、sync plan、receipt 和 canonical 摘要证明并恢复真实 `pre-sync` 文件。
- 目标：恢复后为新 delta 建立基线并重新执行完整 convergence。
- 目标：让每个可预期 blocker 都有产品动作、语义交接或明确终止结论。
- 目标：用真实 Task Finish 和 OpenSpec handler 验证完整恢复旅程。
- 非目标：不自动解决语义冲突，不放宽 guard，不改变验证或 Git 授权。

## 核心流程

1. Task Finish 接收 `implementation-changed` 类型化恢复并使旧 convergence evidence 失效。
2. OpenSpec handler 核对旧 baseline、sync plan、receipt、executable 与当前 canonical。
3. 当前 canonical 精确匹配旧同步结果时，在隔离 Project surface 验证旧 `before` 树。
4. 验证通过后原子恢复 canonical，从真实 `pre-sync` 事实为新 delta 重建 baseline。
5. 重新执行 rehearsal、pre-sync、deterministic sync、strict validation 与 post-sync。
6. 无法证明或存在语义冲突时零写入并返回明确交接。

## 关键变化

- 版本化 convergence recovery result/receipt 与 checkpoint。
- stale receipt 的稳定分类和动作注册表入口。
- 基于旧确定性同步计划的可证明恢复，不采用事后 baseline。
- 真实跨模块收尾恢复流程测试。

## 影响、风险与兼容性

旧 finish run 和正常首次 convergence 保持兼容。只有证明链完整且 canonical 精确匹配旧同步结果时自动恢复；其他状态保留现场。恢复验证或原子替换失败不产生部分 canonical 写入，也不启动归档、Git 或正式验证。

## 验收摘要

- `post-sync` 后修改 delta 可以由产品自动恢复并重新收敛。
- canonical 外部漂移或证据缺失时保持零写入并返回准确原因。
- 重复恢复不重复 baseline、文件替换或已通过 effects。
- 真实 journey 测试经过 action registry 和 OpenSpec application service，不使用通用成功进程替代。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
