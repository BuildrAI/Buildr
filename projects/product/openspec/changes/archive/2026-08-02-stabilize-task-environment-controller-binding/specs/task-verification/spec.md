## MODIFIED Requirements

### Requirement: Task environment 验证证据必须绑定实际执行上下文
当 consumer 提供 task environment context 时，task-verification provider MUST 在启动正式验证前核对 environment owner、repository set、允许执行根和当前 candidates，并 MUST 将实际命令 cwd、multi-repository candidate identity、Runtime、candidate CLI、依赖、projection identity 与 check identity 写入 evidence。无法证明一致时 MUST 返回 `incomplete`，不得执行错误 checkout 的正式验证或复用其 evidence。Retained Environment Manager 的 controller content identity MUST NOT 单独进入 evidence applicability 或使既有 evidence 失效。

#### Scenario: 单仓 environment 验证
- **WHEN** task environment 只包含 Workspace root repository
- **THEN** evidence MUST 记录 task id、environment root、execution root、repository checkout、branch、HEAD、dirty/fingerprint、candidate CLI/projection 与 Workspace Node identity
- **AND** candidate identity MUST 来自该 environment checkout 而不是原 Workspace checkout

#### Scenario: 多仓 environment 验证
- **WHEN** 所需验证覆盖多个 environment member repositories
- **THEN** evidence MUST 记录有序 repository candidate set 及每项的 checkout root、branch、HEAD 和 tree/fingerprint
- **AND** 每个 check MUST 记录实际 cwd 或可核验的 execution root
- **AND** `reusable: true` MUST 要求当前 Environment roots、projection/check identity 与全部 required repository candidates 仍匹配

#### Scenario: retained manager 无关升级
- **WHEN** Candidate、Project policy、Environment/execution roots、candidate CLI/projection、Workspace Node 与 checks 均未变化，只有 retained Buildr controller content identity 改变
- **THEN** Verification evidence applicability MUST 保持不受影响
- **AND** provider/consumer MUST NOT 仅因 Receipt 创建指纹与当前 manager hash 不同而要求重新验证

#### Scenario: 命令 cwd 位于环境外
- **WHEN** 验证计划的 cwd 解析到原 Workspace checkout、其他 task environment 或未登记路径
- **THEN** provider MUST 在启动该命令前返回 `incomplete`
- **AND** MUST 报告错误 cwd、预期 environment roots 和修复动作

#### Scenario: Evidence 来自另一个 worktree
- **WHEN** 已有 evidence 的 repository content 与当前候选碰巧相同，但 task environment identity 或 execution root 不同
- **THEN** provider MUST NOT 将其作为当前 task environment 的执行证据复用
- **AND** consumer MAY 仅在非 task-environment policy 明确允许内容等价复用时按普通 candidate identity 重新判断，不得抹去来源差异
