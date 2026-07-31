## Why

Task Finish 的原始目标是把开发完成后的固定动作收敛为低推理、低往返的确定性工作流，但当前实现已膨胀为 13 个步骤、9 个维护子命令和大量由 Agent 手工组装的 evidence、fingerprint、execution plan 与 recovery 协议。它能够阻塞、记账和恢复，却没有稳定做到一次预检、一次正式验证和单命令交付，因此继续局部加门禁只会扩大状态空间，无法解决用户持续感知到的收尾耗时与重复试错。

## What Changes

- **BREAKING**：以 `preflight → prepare → verify → deliver → cleanup` 五阶段执行器替换现有逐 checkpoint Agent 编排模型，并发布 `buildr.task-finish-run/v1` 结果契约。
- 让 `buildr task finish run` 成为正常路径唯一入口；产品自行解析 execution context、生成运行身份、执行确定性动作、持久化阶段结果并从真实状态恢复，不再要求调用方手写 evidence、fingerprint、execution plan、attempt token 或 recovery JSON。
- 在 `preflight` 一次性执行全部无副作用廉价检查并聚合 findings；任何语义决定、授权缺口或环境不可执行问题都在候选 mutation 前返回。
- 在 `prepare` 完成 OpenSpec/current knowledge 检查后的全部候选 mutation、目标分支收敛和 runtime 生成物收敛，然后冻结唯一 candidate identity；freeze 后不允许修复实现或继续产生候选内容变化。
- `verify` 对冻结候选执行且最多执行一次 required assurance；任何产品缺陷、语义冲突或验证失败都证明研发、审查或前序测试验证尚未交付 finish-ready candidate，必须退出 Finish 并回到研发流程修正当前实现，不在同一 run 内吸收 repair/re-verification 循环。
- `deliver` 与 `cleanup` 只消费冻结候选及明确授权，完成目标 ref transition、retained convergence、入口安装、task environment 清理和 durable completion；确定性失败由产品依据真实状态生成 resume token，Agent 不再编写 recovery manifest。
- 删除 `actions|advance|resume|renew|recover|cleanup-prepare|cleanup-finalize` 及其旧协议实现；当前客户端只提供 `run|inspect`，直接复用唯一 canonical run store，不创建版本化目录、兼容 reader 或状态迁移模块。
- 把正常路径零 Agent provider completion、零手写恢复、一次正式验证、一次 CLI 调用，以及阶段/工具往返/wall-clock/具体失败投射纳入正式验收。
- Task environment 的 `executionReady` 必须通过 receipt-bound CLI 可执行探针，而不只核对路径和 digest。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 用五阶段确定性执行器、沿用的 run identity、新 result identity、唯一 canonical run store、产品生成恢复和硬效率验收替换当前逐步骤 checkpoint 协议。
- `agent-task-workflows`: 把收尾 Skill 的职责收窄为授权披露、单命令调用和语义失败交接，移除正常路径中的 Agent provider/evidence 编排。
- `cli-product-surface`: 将 `task finish run|inspect` 设为唯一 workflow 表面，移除旧维护子命令，并要求失败结果可直接定位。
- `task-verification`: 正式验证只对 frozen candidate 执行一次；失败返回研发流程 handoff，而不是在同一 Finish run 中 repair/re-verify。
- `task-environments`: `executionReady` 增加 receipt-bound CLI 真实可执行探针，避免声明 ready 后首次命令立即失败。

## Impact

- 重构 `services/buildr/src/application/task-finish/`、CLI bootstrap/registry/help、Git/OpenSpec/verification/worktree application service 组合和相关 JSON schema。
- 调整随包 `task-finish` Skill、`buildr.task-finish` capability contract、Buildr 产品 Skill routing evidence 与 current knowledge。
- 替换以旧 13-step 状态和 Agent completion 为中心的单元、CLI、provider journey 与 concurrent task acceptance fixtures；验证当前客户端不保留旧 action/reader/executor、不创建并行版本目录，并拒绝恢复旧 run shape。
- 影响 Task Finish、Task Verification、Task Environment 与 retained Workspace runtime/CLI 安装的组合验收，不改变 force push、远端任务分支删除、丢弃改动和语义冲突仍需明确授权的安全边界。
- 收尾 timing 与效率证据只计量 finish-ready candidate 的门禁、交付和清理；产品缺陷修复、审查返工和重新验证属于研发流程，不计入 Finish workflow。
