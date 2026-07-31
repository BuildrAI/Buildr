## ADDED Requirements

### Requirement: Task environment 清理必须证明 owned runtime 已停止
Buildr MUST 在删除任何 task environment checkout、receipt 或本地任务分支前，枚举并核对该 environment 拥有的本机 preview、受管进程和验证租约；任一运行中资源存在、无法证明归属或 cleanup token 不匹配时 MUST fail closed，并 MUST 保留全部环境内容用于恢复。

#### Scenario: 运行中 preview 阻止 worktree cleanup
- **WHEN** `worktree cleanup` 发现 receipt 所属 environment 仍有存活 preview 或受管进程
- **THEN** 命令 MUST 在删除任何 repository worktree 前失败
- **AND** 诊断 MUST 返回资源 identity、owner、environment 与正确的产品化停止动作

#### Scenario: 环境资源已经清理
- **WHEN** 所有 task-owned preview、进程与 lease 都已通过归属检查停止或释放
- **THEN** `worktree cleanup` MAY 继续既有 clean、integrated-ref 与 repository membership 门禁
- **AND** cleanup evidence MUST 记录 runtime preflight 已通过
