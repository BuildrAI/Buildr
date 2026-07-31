## ADDED Requirements

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST 提供实现 `buildr.task-finish/v1` 的 Task Finish Skill。Skill MUST 解析用户的收尾意图、披露常规 commit/convergence/verification/integration/push/retained/cleanup 授权与明确排除项，然后调用一次 canonical `buildr task finish run`；正常路径 MUST NOT 领取或完成产品 checkpoint、调用多个 provider 后重组 evidence、构造 recovery JSON 或在对话中维护 workflow 状态。

#### Scenario: 用户要求收尾
- **WHEN** 用户在 canonical task environment 中明确要求收尾
- **THEN** Agent MUST 披露目标 task/change、目标分支、远端、常规副作用和未授权动作
- **AND** 在没有待人工语义决定时 MUST 只启动一次 canonical Task Finish executor 并消费其最终结果

#### Scenario: 产品返回完整结果
- **WHEN** current result 为 complete
- **THEN** Skill MUST 直接报告交付、验证、retained、cleanup 与效率证据
- **AND** MUST NOT 为确认已完成动作再次调用 inspect、provider completion 或同等验证命令

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
Task Finish workflow MUST 把 finish-ready candidate 作为前置条件。任何产品缺陷、规范语义错误、审查遗漏、测试失败或候选内容修复 MUST 退出收尾并回到研发、审查和测试验证流程；Skill MUST NOT 将 repair authorization、修复尝试、重新验证或新的实现编辑描述为 Task Finish 的恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Finish result 返回 `failureClass: upstream-candidate-defect`
- **THEN** Agent MUST 明确说明研发、审查或前序测试验证没有产生 finish-ready candidate
- **AND** MUST 结束当前 Finish run，只在新的实现任务/revision 中修复并重新建立验证 evidence

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** 产品缺陷已被 Task Finish 发现，而用户没有明确要求继续研发修正
- **THEN** Agent MUST NOT 在当前 Finish run 中编辑实现或重跑正式验证
- **AND** MUST 请求或使用已有授权进入独立研发 workflow

### Requirement: 任务资产审查不得扩展 Finish 执行器
Task asset review MUST 保持独立 Skill lifecycle。存在 observation 且 finalize 需要人工 accept/reject 时，Agent MUST 在启动 Task Finish executor 前完成该决定；没有 observation 或 provider 确定性 discard 时 MUST 不增加 Finish 内部 action。Task Finish 产品 run MUST NOT 读取隐藏推理、判断长期资产候选或因 late observation revision 扩展 cleanup 前步骤。

#### Scenario: 没有任务资产 observation
- **WHEN** 用户要求收尾且当前任务没有 observation
- **THEN** Agent MUST 直接进入 canonical Task Finish executor
- **AND** 产品 run MUST NOT 创建空 observation 或 asset-review checkpoint

#### Scenario: Observation 等待人工决定
- **WHEN** task-asset-review finalize 返回 `awaiting-human`
- **THEN** Agent MUST 在任何 prepare mutation 前等待 accept/reject
- **AND** 决定完成后才启动新的单命令 Task Finish run

## REMOVED Requirements

### Requirement: Task Finish 自动编排已验证任务收尾
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 在相关资产变更中先完成收尾就绪检查
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 在 OpenSpec archive 后检查空 active-change scaffold
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 归档已手动同步的 OpenSpec change 时跳过重复 spec update
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 默认不推送远端任务分支
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须报告可信的完整验证 timing 证据
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: 内置任务资产审查与任务收尾保持分层
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须把当前认知检查作为验证前门禁
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须在最终保证前收敛 delivery tree
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须在最终保证前预演 OpenSpec archive compatibility
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须在最终保证后检测目标分支竞态
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须报告验证失效链和重复执行成本
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 使用持久化执行架构
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。

### Requirement: Task Finish 必须事务式推进 OpenSpec convergence
**Reason**: 该 workflow requirement 把 Task Finish 描述为 Agent/provider 编排、repair/re-verification 或分散的 closeout 检查集合，与新的 finish-ready candidate 和单命令五阶段执行器边界冲突。
**Migration**: Task Finish Skill 直接替换为 `buildr.task-finish/v1` 的五阶段授权入口；具体门禁与动作由 `buildr task finish run` 统一表达，产品缺陷退出 Finish 并回到研发流程。
