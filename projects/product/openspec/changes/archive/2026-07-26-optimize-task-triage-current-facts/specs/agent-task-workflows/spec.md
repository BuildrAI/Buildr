## ADDED Requirements

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` Skill MUST 先核对任务相关事实，再分别判断语义治理、执行形态和任务跟踪；输出 MUST 包含选择、repository set、task environment、最小依据、未决冲突和 next provider/action，并 MUST 只在适用时追加 OpenSpec 或任务看板状态。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec 已定义目标行为且任务需要代码修改、构建、测试或长期实现上下文
- **THEN** triage MUST 选择 `code-only + implementation`
- **AND** MUST 解析完整 repository set 并通过 selected task-worktree provider 创建或复用 task environment

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与 registries 已能确认现行事实，任务只让 current knowledge 追上该事实且不进入代码、构建或测试
- **THEN** triage MUST 选择 `spec-maintenance + metadata-only`
- **AND** MUST 使用 selected current-knowledge provider 的 `maintain` operation，不得为既有事实补造 OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set 无法确认或是否进入实现无法判断
- **THEN** triage MUST 返回 `blocked` 或 `unknown` 并提出改变长期语义所需的最少问题
- **AND** MUST NOT 预先写入 change artifacts、current knowledge 或 task environment 内容

### Requirement: task-triage 必须通过条件能力依赖交接专业动作
`task-triage` MUST optional 依赖 `buildr.current-knowledge-maintenance/v2`、`buildr.task-worktree-lifecycle/v2` 和 `buildr.task-board-maintenance/v1`，并 MUST 只在相应决策分支执行前读取 contract 与 selected provider；任何 provider 不 ready MUST 只阻塞或降级对应分支，不得使无关 triage 结论不可用。

#### Scenario: Implementation 分支缺少 worktree provider
- **WHEN** triage 已确认 `implementation` 但 `buildr.task-worktree-lifecycle/v2` 未 ready
- **THEN** execution 分支 MUST fail closed 并报告 capability readiness 与 next action
- **AND** semantic decision MUST 保持可见

#### Scenario: 当前事实 maintain provider 不可用
- **WHEN** triage 选择独立 `spec-maintenance` 但 `buildr.current-knowledge-maintenance/v2` 未 ready
- **THEN** current knowledge 写入 MUST 停止
- **AND** triage MUST NOT 回退为无 evidence 的直接文档编辑或伪造 Change

#### Scenario: Verification provider 暂时不可用
- **WHEN** triage 只为实现任务规划验证节点
- **THEN** triage MUST NOT 因 `buildr.task-verification/v2` 暂时不可用而阻塞语义和位置判断
- **AND** 实际验证开始前仍 MUST 由相应 consumer 解析 selected verification provider

## MODIFIED Requirements

### Requirement: task-triage 路由任务看板
Buildr 的 task-triage Skill MUST 在理解任务意图和影响范围后判断任务看板是“不需要”“创建”还是“继续维护”，并 MUST 在需要看板时通过 selected `buildr.task-board-maintenance/v1` provider 执行，而不是在 task-triage 中复制完整可视化流程；OpenSpec change MUST 作为可选真实关联，MUST NOT 成为创建任务看板的前置条件。

#### Scenario: 复杂任务需要任务看板
- **WHEN** task triage 发现任务跨批次、跨 change、跨服务或团队，存在交叉依赖、长期跟踪或多次用户判断
- **THEN** task triage MUST 将任务看板判定为“创建”或“继续维护”
- **AND** Agent MUST 使用 selected task-board provider 执行创建或维护

#### Scenario: 看板需要先建立 change 锚点
- **WHEN** task triage 判定复杂任务需要创建任务看板但尚无已创建的 OpenSpec change
- **THEN** task triage MUST 基于任务语义保持 `code-only`、`spec-maintenance` 或 `change-flow` 决策，并以稳定 task identity 创建或维护看板
- **AND** Agent MUST NOT 用未来 change 名称、普通计划或虚假 change 代替真实关联

#### Scenario: 复杂 code-only 任务没有 change
- **WHEN** 复杂任务需要任务看板但当前工作不改变业务语义且没有 OpenSpec change
- **THEN** task triage MUST 保持 `code-only` 并允许以稳定 task identity 创建看板
- **AND** MUST NOT 为满足看板格式而创建虚假 change 或 planned change 关联

#### Scenario: task triage 输出看板状态
- **WHEN** task triage 选择创建或继续维护任务看板
- **THEN** 面向用户的路径判定 MUST 在可确认时包含 task id、看板路径、真实 change 关联或 `none`、当前状态和 provider result
- **AND** task triage MUST NOT 猜测尚未解析的 Project、change 或文件路径
