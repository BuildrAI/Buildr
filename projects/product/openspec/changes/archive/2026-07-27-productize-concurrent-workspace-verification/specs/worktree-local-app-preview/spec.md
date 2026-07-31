## ADDED Requirements

### Requirement: Preview stop 必须绑定 task environment 所有权
对 task worktree 创建的 Local App preview，`app preview stop` MUST 要求并核对调用方提供的 task、environment、owner 与 receipt identity，并 MUST 仅停止完全匹配且 secret 有效的实例；独立 retained Workspace preview MAY 保持既有实例级停止语义。

#### Scenario: 正确 owner 停止 task preview
- **WHEN** 调用方使用 receipt 绑定 CLI 并提供与实例 metadata 一致的 task、environment、owner 和 receipt
- **THEN** Buildr MUST 停止该 preview、确认进程终止并删除本实例状态
- **AND** JSON 结果 MUST 记录已核对的 ownership identity

#### Scenario: 错误 owner 尝试停止 preview
- **WHEN** 调用方的 task、environment、owner 或 receipt 任一项与实例 metadata 不一致
- **THEN** Buildr MUST fail closed 且不得向进程发送停止信号
- **AND** 实例 MUST 继续可被真实 owner 检查和停止
