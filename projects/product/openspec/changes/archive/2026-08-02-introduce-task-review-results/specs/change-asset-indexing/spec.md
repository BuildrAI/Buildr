## ADDED Requirements

### Requirement: Task-scoped Change 审查必须路由到 Planning Review
Buildr MUST 根据是否存在明确 Task context 区分正式 Task Planning Review 与普通 Change review。Task-scoped Change detail 的审查 action MUST 携带 Task ID、限定 `project/change` 与 `reviewType: planning` 路由到 `task-review`；Workspace 全局 Change collection/detail MUST 继续只生成普通只读 Change review prompt。

#### Scenario: 从 Task 详情审查关联 Change
- **WHEN** 用户从 `/tasks/:taskId/changes/:project/:change` 发起审查
- **THEN** Agent action MUST 要求先恢复正式 Task、使用 Task-scoped Resolver 读取该 Change、确认明确 plan target identity并执行 Planning Review
- **AND** 完整结束后 MUST 只通过 Task Review Application 记录 Planning Result

#### Scenario: 从全局 Change 目录审查
- **WHEN** 用户从 retained-only Workspace Change list/detail 发起审查且没有 Task context
- **THEN** 现有普通 Change review prompt MUST 保持只读且不创建 Task Review Result
- **AND** 全局 Change collection MUST 不扫描 Task Environments

#### Scenario: task-environment Change 暂时不可用
- **WHEN** Task-scoped Resolver 返回 unavailable 或 identity conflict
- **THEN** Planning Review action MUST fail closed 并报告 Resolver diagnostic
- **AND** MUST 不回退到同名 retained/global Change 或由请求 path 选择副本
