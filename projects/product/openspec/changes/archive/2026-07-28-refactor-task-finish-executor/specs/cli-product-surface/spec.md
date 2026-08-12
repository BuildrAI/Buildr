## ADDED Requirements

### Requirement: Task Finish canonical CLI 必须只有 run 与 inspect
Buildr CLI MUST 只提供 `task finish run` 和 `task finish inspect`：`run` 从 task environment/change/Project context 解析执行所需 identity 并连续执行五阶段，`inspect` 只读返回当前 run 状态。当前客户端 MUST NOT 注册、加载或执行 `actions|advance|resume|renew|recover|cleanup-prepare|cleanup-finalize`，也 MUST NOT 接受调用方提供的 evidence/fingerprint/execution-plan/recovery 参数。

#### Scenario: 查询 canonical Task Finish 帮助
- **WHEN** 用户运行 `buildr help task finish`、`buildr task finish run --help` 或 `buildr task finish inspect --help`
- **THEN** 输出 MUST 只把 run/inspect 表述为 canonical actions，并列出 task/change/project/agent/target 与可选产品 resume token
- **AND** MUST NOT 要求调用方理解 step、attempt、lease、action registry 或 recovery manifest

#### Scenario: 调用旧 action
- **WHEN** 调用方使用旧 maintenance action
- **THEN** CLI MUST 作为不存在或不支持的 action 拒绝
- **AND** MUST NOT 加载旧 reader/executor 或创建旧 run

#### Scenario: Canonical store 中存在旧 run shape
- **WHEN** 当前客户端运行或检查 Task Finish 且 canonical store 中仍有旧 checkpoint、lease 或 completion shape
- **THEN** 自动选择 MUST 跳过旧 shape，显式 inspect MUST fail closed
- **AND** MUST NOT 加载旧 reader、生成迁移 receipt 或把旧 passed evidence 映射为新 phase

### Requirement: Task Finish CLI 失败必须直接定位并给出唯一 workflow
Task Finish JSON error/result MUST 优先返回真实 `phase`、`operation|check`、`failureClass`、`code|status|exit`、bounded diagnostic identity 和唯一 `nextWorkflow|nextAction`。产品缺陷 MUST 指向 `task-development`，同一 frozen candidate 可恢复的暂态阻塞 MUST 返回产品生成的 resume token；未知参数与缺失 context MUST 返回 canonical run/inspect help topic。

#### Scenario: Verification 子检查失败
- **WHEN** 正式 verification executor 的具体 check 非零退出
- **THEN** Task Finish compact JSON MUST 直接投射该 check/stage 和 diagnostic
- **AND** MUST NOT 只返回顶层 `verifier.nonzero-exit`、`primaryFailure: null` 或让 Agent搜索日志猜测原因

#### Scenario: Target race 可恢复
- **WHEN** frozen candidate 未变但目标 ref 在 push 前漂移
- **THEN** CLI MUST 返回 `phase: deliver`、`code: target-race` 和产品生成的 resume token
- **AND** nextAction MUST 是重复 canonical run/resume，而不是手写 recovery JSON

## REMOVED Requirements

### Requirement: Workflow internal 命令必须提供完整主题帮助
**Reason**: 该 requirement 把全部 v1 action 当成 canonical topic，扩大了公共维护协议。
**Migration**: 当前客户端直接替换为 task finish run/inspect，继续使用唯一 canonical store；旧 run shape 不可恢复。

### Requirement: Workflow diagnostic 必须返回可直接执行的下一动作
**Reason**: 旧诊断围绕 advance/inspect 参数修正，未要求五阶段 primary failure 和 upstream revision 边界。
**Migration**: 直接使用当前 phase/check/failureClass/nextWorkflow 诊断；未知 action 只建议 canonical run/inspect，不保留旧 action compatibility。
