## ADDED Requirements

### Requirement: task-environment Skill 必须作为环境生命周期入口
Buildr MUST 交付名为 `task-environment` 的 workspace Skill，并 MUST 用精确 routing description 将它限制在正式 Task 的环境准备、检查、串行恢复和 cleanup。Skill MUST 通过公共 `buildr task environment prepare|inspect|cleanup` CLI 消费 selected `buildr.task-environment/v1`；它 MUST NOT 成为 Task dispatcher、Git 集成入口、验证执行器，也 MUST NOT 指导 Agent 手写 Receipt 或调用内部资源动作。

#### Scenario: 正式 Task 请求准备或恢复环境
- **WHEN** 用户或上游 Skill 要求为已有 Task 准备、检查、恢复或清理执行环境
- **THEN** Agent MUST 使用 `task-environment` 调用对应公共 CLI，并报告 Task ID、`ready / blocked`、实际执行位置、关键 resources/effects 与 next action
- **AND** MUST NOT 直接手写 Environment Receipt 或把 `task-worktree` 结果当作最终环境结论

#### Scenario: 用户明确管理 Git worktree
- **WHEN** 用户只要求创建、检查、保留或删除特定 Git worktree/本地任务分支
- **THEN** `task-worktree` MAY 作为窄 Git provider Skill 处理该意图
- **AND** MUST NOT 抢占 Task Environment 的 Runtime、依赖、projection、资源、恢复或总 cleanup authority

#### Scenario: Task 外临时操作
- **WHEN** 请求只是纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** `task-environment` MUST NOT 仅因存在本机执行效果而自动创建正式 Task/receipt
- **AND** 适用入口 MUST 保持原有语义

### Requirement: 正式持久交付必须经过 Task Environment ready 门槛
Buildr task triage、OpenSpec propose contribution 与已知正式执行入口 MUST 在首次修改交付物、构建、测试或创建 Task-owned 持久资源前取得 matching `ready` Environment Receipt。任务位置判断 MUST 与 change-flow/code-only 语义判断正交；采用环境后，proposal、design、specs、tasks、实现和候选验证 MUST 只写入 receipt 允许的执行根。

#### Scenario: Triage 选择 Change Flow
- **WHEN** Task Record 已建立，task-triage 选择 change-flow 且即将创建首份预计进入实现的 OpenSpec artifact
- **THEN** Agent MUST 先通过 Task Environment 准备或恢复实际执行位置
- **AND** 只有 `ready` 后才 MUST 在该允许根创建 Change artifacts

#### Scenario: 直接命中 OpenSpec propose
- **WHEN** 用户意图直接命中 installed `openspec-propose`，且任务预计修改代码、构建、测试或保留长期实现上下文
- **THEN** Buildr-owned contribution MUST 在 `openspec new change` 前核对正式 Task 与 `ready` Environment Receipt
- **AND** MUST 通过 `task-environment` 而不是直接调用 Git worktree provider

#### Scenario: Code-only 实现
- **WHEN** 正式 Task 不需要 OpenSpec Change 但即将进入代码修改、构建或测试
- **THEN** Agent MUST 取得同样的 `ready` Environment Receipt
- **AND** MUST NOT 因没有 Change 而跳过实际执行根、依赖与资源边界

#### Scenario: 只有 lifecycle metadata 写入
- **WHEN** 已有 Task 的 Environment/Development/Verification/Finish/Retrospective Skill 只在 canonical Workspace 维护自己的 receipt/result，且不触发新的执行环境效果
- **THEN** workflow MUST NOT 为该 metadata 写入重新准备或恢复已清理环境
- **AND** MUST 保持各专业 writer 的 canonical metadata authority

#### Scenario: Candidate 交给 Task Verification
- **WHEN** Environment 中的内容修改结束并形成待验证候选
- **THEN** Task Environment MUST 提供 Task、工作范围、执行根、provider evidence refs 与 runtime source/projection identity
- **AND** Task Verification MUST 独占 Candidate identity、验证政策、实际执行和 evidence，包括适用的 Agent session proof

### Requirement: 任务 Skills 必须消费新的 Environment capability topology
Buildr package/runtime capability graph MUST 让 `task-environment` 提供 `buildr.task-environment/v1`，让 `task-worktree` 只提供 `buildr.git-worktree-provider/v1`，并 MUST 将所有正式 Environment consumers 从 `buildr.task-worktree-lifecycle@2` 切到新契约。Git provider dependency MAY 对无需 Git 的 Task Environment 降级，但在请求 Git isolation 时 MUST 成为该次 prepare 的硬前置条件。

#### Scenario: task-triage 进入正式执行
- **WHEN** `task-triage` 已确认 formal execution 分支
- **THEN** 它 MUST optional 消费 `buildr.task-environment/v1` 并在该分支要求 selected provider ready
- **AND** 纯讨论、只读或 Task 外分支 MUST 不因 Environment provider 缺失而阻塞

#### Scenario: Task Environment 选择 Git isolation
- **WHEN** receipt plan 需要一个或多个 Git worktrees
- **THEN** `task-environment` MUST 解析 selected `buildr.git-worktree-provider/v1` 并只消费其 Git evidence
- **AND** provider missing/ambiguous/blocked MUST 使该次 environment prepare 返回 `blocked`

#### Scenario: Task Finish 清理环境
- **WHEN** Task Finish 已完成适用交付并进入 cleanup
- **THEN** Task Finish MUST 调用 selected `buildr.task-environment/v1` 交接 delivery/cleanup eligibility
- **AND** MUST NOT 直接依赖 `buildr.task-worktree-lifecycle@2`、扫描环境资源或调用 provider cleanup

#### Scenario: provider 替换
- **WHEN** compatible internal providers 替换默认 `task-environment` 或 `task-worktree`
- **THEN** consumers MUST 按 capability identity 与 binding 继续工作
- **AND** MUST NOT 根据默认 Skill id、目录名或旧 receipt schema 硬编码调用

## MODIFIED Requirements

### Requirement: 实现型 workflow 必须绑定 task execution context
Buildr 的 task triage、Task Environment 与 OpenSpec Skills MUST 在写入前核对 matching Environment Receipt、实际 execution binding 和稳定 controller identity。普通 workflow MUST NOT 以 session root 等于 environment root 或 Agent session adoption receipt 作为执行前置条件。

#### Scenario: Triage 准备 Environment 后在原对话继续
- **WHEN** task triage 取得 matching `ready` Environment Receipt，且当前 Agent 能使用结果中的明确 target/workdir 与执行 CLI
- **THEN** Task Environment MUST 返回 task、Workspace、工作范围、允许执行根、controller/CLI 与 runtime projection identity
- **AND** 当前用户对话 MUST 能在 binding 通过后继续写入，不要求迁移 Agent session

#### Scenario: 明确工作目录绑定 Environment
- **WHEN** 命令 target、workdir、scope membership、执行 CLI、Runtime/依赖和 projection identity 匹配 Environment Receipt 的最新真实 probe
- **THEN** workflow MUST 将其视为有效 execution binding
- **AND** MUST NOT 因 Agent session 从 canonical Workspace 启动而阻塞 proposal、实现、构建、测试或验证

#### Scenario: Execution binding 漂移
- **WHEN** target、workdir、scope/provider identity、Runtime/CLI、依赖或 runtime projection 不再匹配 receipt
- **THEN** workflow MUST fail closed 并报告精确差异
- **AND** MUST NOT 通过直接调用 worktree provider、创建第二份 checkout 或沿用旧 `ready` 规避 mismatch

## REMOVED Requirements

### Requirement: Task worktree 提供 change 单写入与验证证据边界
**Reason**: 该 requirement 把 task worktree 当作 canonical Task Environment 和 execution context authority，与 P0.2 的 provider 分层冲突。
**Migration**: 正式 workflow 先消费 `buildr.task-environment/v1`；Git checkout/branch evidence 由 `buildr.git-worktree-provider/v1` 提供，Candidate verification 继续由 Task Verification 独占。
