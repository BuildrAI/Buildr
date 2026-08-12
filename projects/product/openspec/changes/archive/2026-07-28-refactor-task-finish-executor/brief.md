# Task Finish 五阶段执行器重构

## 一句话摘要

把当前以 checkpoint、Agent completion 和 recovery 协议为中心的 Task Finish，重构为一次调用完成的五阶段确定性收尾执行器。

## 背景与问题

Task Finish 最初用于封装开发完成后的固定结尾动作，目标是减少 Agent 重复推理、工具试错、耗时和 token。当前实现虽然具备 candidate identity、OpenSpec convergence、target fencing、验证 evidence、retained convergence 和 cleanup 安全机制，却将它们组合成 13 个步骤、9 个维护子命令和大量手工 evidence/recovery 协议；正常路径仍经常在 Agent 与产品之间往返，局部安全加固反而持续扩大状态空间。

## 目标与非目标

目标是以 `preflight → prepare → verify → deliver → cleanup` 固定五阶段连续完成收尾；一次聚合廉价门禁、在所有候选 mutation 后 freeze、最多一次正式验证、产品生成恢复，并用一次 CLI、零 Agent provider completion、零手写恢复作为正常路径硬验收。

本 Change 不在 Task Finish 中修复任何产品缺陷。缺陷意味着研发、审查或前序测试验证没有产生 finish-ready candidate，必须退出当前 Finish 并回到研发流程修正当前实现。也不新增 force push、远端任务分支删除、丢弃改动或语义冲突自动决策。

## 受影响用户与角色

- 使用 Agent 完成 Buildr 开发任务并要求“收尾”的维护者；
- 调用 Task Finish 的 Agent runtime 与随包 Skill；
- 提供 OpenSpec、verification、Git、runtime 和 worktree 确定性能力的 Buildr application services。

## 核心流程

1. Agent 披露一次收尾授权；存在 task asset observation 时先完成独立人工决定。
2. 单次 `buildr task finish run` 聚合 preflight findings。
3. prepare 收敛所有候选变化并冻结 candidate identity。
4. verify 复用匹配 evidence 或执行一次 required assurance；失败退出 Finish 并回到研发流程。
5. deliver 完成 target ref transition、push、retained convergence 与入口安装。
6. cleanup 写 durable completion 并删除可证明 task-owned 的本地资源。

## 关键变化

- v2 不再公开 step completion、attempt、fingerprint、execution plan、repair authorization 和 recovery manifest。
- 当前客户端不保留旧 action 或旧协议 reader，直接复用唯一 canonical run store，不创建版本化运行目录。
- Task environment `executionReady` 增加 receipt-bound CLI 真实启动 probe。
- Compact failure 直接投射具体 phase/check 与研发流程 handoff 或 product-generated resume。

## 影响、风险与兼容性

公共 JSON run schema 直接更新为当前五阶段 shape，继续使用唯一 canonical store；旧 run shape 不可继续，自动选择时跳过、显式 inspect 时 fail closed，不创建版本化目录或状态迁移模块。执行器将直接组合多个 application service，必须用真实 task environment journey 证明没有扩大 Git、runtime、安装和 cleanup 授权。

## 验收摘要

- 正常路径 `canonicalCliInvocations = 1`；
- `agentProviderCompletions = 0`；
- `manualRecoveryManifests = 0`；
- `formalVerificationExecutions <= 1`；
- 产品缺陷一次返回具体 `upstream-candidate-defect`，修复与重新验证不进入 Finish timing；
- commit、OpenSpec convergence、push、retained actions 和 cleanup 均由真实副作用而不是字段形状证明。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Finish execution delta](specs/task-finish-execution/spec.md)
- [Tasks](tasks.md)
