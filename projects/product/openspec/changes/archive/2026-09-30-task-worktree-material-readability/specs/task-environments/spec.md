## ADDED Requirements

### Requirement: 工作树证据身份必须归一 linked checkout 目标

Git Worktree provider 在解析任务工作树证据与检查身份时，MUST 把作为目标传入的 linked task worktree 根归一到其 canonical checkout 身份，使 canonical workspace 根与工作树根产生一致的证据解析结果。非 Git 或无证据的目标 MUST 保持既有 `git_worktree_evidence_missing` 类诊断；归一 MUST NOT 改变 evidence 中登记的 workspaceRoot、checkoutPath 或 repository selector 语义，MUST NOT 凭 `.worktrees/` 目录名猜测归属。

#### Scenario: 以工作树根执行 inspect

- **WHEN** `worktree inspect`（或依赖同一 provider 的读取方）的 target 是某任务的 linked worktree 根
- **THEN** provider MUST 按该 checkout 所属的 canonical evidence 解析并返回同一仓库集合
- **AND** MUST NOT 因目标拼写差异返回身份不匹配或证据缺失

#### Scenario: 目标不属于任何登记的 checkout

- **WHEN** target 是 Git 管理的普通目录但不是 canonical 根也不是登记的 task worktree
- **THEN** provider MUST 沿用既有缺证据诊断
- **AND** MUST NOT 猜测任务归属或读取其他任务的 checkout
