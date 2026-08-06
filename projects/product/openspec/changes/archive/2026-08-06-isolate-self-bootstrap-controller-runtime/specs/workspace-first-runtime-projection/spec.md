## ADDED Requirements

### Requirement: candidate runtime identity 必须同时约束 runtime projection 与 Structured Store mutation
自举 candidate source 的 runtime identity guard MUST 一致约束 runtime projection 和 Workspace Structured Store mutation。候选 source 只可向 receipt-bound Task Validation Workspace 投射及写入其独立验证 store；同一 Git common-dir 的 retained Workspace、peer task worktree、canonical Structured Store 与验证根外共享 runtime MUST 在任何写入前被拒绝。

#### Scenario: candidate runtime 使用验证根
- **WHEN** candidate source 对 matching Task Validation Workspace 执行 sync/render、migration 或候选功能验证
- **THEN** runtime guard MUST 允许该隔离 target 并返回候选验证 provenance evidence
- **AND** evidence MUST NOT 宣称 retained runtime 或 canonical data 已生效

#### Scenario: candidate runtime 目标越界
- **WHEN** candidate source 请求写入 retained Workspace runtime、canonical Structured Store、peer task worktree 或验证根外共享 user runtime
- **THEN** guard MUST 在首个相关 mutation 前 fail closed
- **AND** diagnostic MUST 区分 caller identity、允许 validation boundary 与被拒绝 target identity
