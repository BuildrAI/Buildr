## MODIFIED Requirements

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` Skill MUST 先核对任务相关事实，再分别判断语义治理和执行形态；输出 MUST 包含选择、repository set、task environment、最小依据、未决冲突和 next provider/action，并 MUST 只在适用时追加 OpenSpec 或正式 Task 状态。任务进度 MUST 由对话、Task Record、Parent/Child 与各专业公开 read model 表达，不得创建第二份 Board authority。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec 已定义目标行为且任务需要代码修改、构建、测试或长期实现上下文
- **THEN** triage MUST 选择 `code-only + implementation`
- **AND** MUST 解析完整 repository set 并通过 selected task-environment provider 创建或复用 task environment

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与 registries 已能确认现行事实，任务只让 current knowledge 追上该事实且不进入代码、构建或测试
- **THEN** triage MUST 选择 `spec-maintenance + metadata-only`
- **AND** MUST 使用 selected current-knowledge provider 的 `maintain` operation，不得为既有事实补造 OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set 无法确认或是否进入实现无法判断
- **THEN** triage MUST 返回 `blocked` 或 `unknown` 并提出改变长期语义所需的最少问题
- **AND** MUST NOT 预先写入 change artifacts、current knowledge 或 task environment 内容

### Requirement: task-triage 必须通过条件能力依赖交接专业动作
`task-triage` MUST optional 依赖 `buildr.current-knowledge-maintenance/v2` 和 `buildr.task-worktree-lifecycle/v2`，并 MUST 只在相应决策分支执行前读取 contract 与 selected provider；任何 provider 不 ready MUST 只阻塞或降级对应分支，不得使无关 triage 结论不可用。

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

## REMOVED Requirements

### Requirement: task-triage 路由任务看板
**Reason**: 静态 Task Board 没有真实不可替代 consumer，并会复制 Task、进度与协调事实。

**Migration**: 使用正式 Task Record、Parent/Child、各专业公开 read model、Local App 动态投影与对话汇报，不创建或继续维护静态任务看板。

### Requirement: 任务进展回复保持任务看板可发现
**Reason**: 当前工作流不再发布或维护静态 Task Board。

**Migration**: 进展回复直接引用 current Task、Parent/Child、Review、Verification、Development 或 OpenSpec 状态；历史 HTML 只作为历史旁证。
