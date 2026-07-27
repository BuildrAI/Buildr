## MODIFIED Requirements

### Requirement: Task environment 清理必须保护全部成员和其他任务
Buildr MUST 提供 receipt-bound 的本地 task environment 清理入口，并 MUST 只在当前 environment 的全部 repository changes 已安全集成、checkouts 干净且任务拥有的本机资源已停止后清理。清理 MUST 在任何删除前统一核对 task、owner、receipt、repository identity、每仓 integrated ref 和其他 environment ownership，按 nested repositories 后 root 的顺序执行，并 MUST NOT 修改其他 task environments 或远端分支。

#### Scenario: 多仓环境安全清理
- **WHEN** 调用方提供匹配 receipt owner 的 Agent 和每个成员 repository 的 integrated ref，且全部任务分支已被对应 ref 包含、checkouts 干净并且没有阻塞本机资源
- **THEN** Buildr MUST 先移除 nested repository worktrees，再移除 root worktree、本地任务分支、adoption receipt 和 environment receipt
- **AND** MUST 返回每个 repository、branch、receipt 与 environment 的 removed evidence

#### Scenario: 一个成员 repository 仍未完成
- **WHEN** 任一 repository dirty、未被声明 integrated ref 包含、branch identity 不明或仍被 task-owned process 使用
- **THEN** Buildr MUST 在任何删除前保留整个 task environment
- **AND** MUST 报告阻塞 repository/resource，且不得部分删除其他仍用于恢复的成员

#### Scenario: owner 或 receipt 不匹配
- **WHEN** 调用方 Agent 与 receipt owner 不一致、task receipt 缺失或 integrated ref selector 与 receipt repository set 不一致
- **THEN** Buildr MUST fail closed 并保持所有 checkout、branch 和本地 receipt 不变
- **AND** result MUST 返回确定性的 blocked code 和未执行清理项

#### Scenario: 存在其他并发 task environment
- **WHEN** 同一 Workspace 或任一 source repository 还拥有其他 task worktrees
- **THEN** Buildr MUST 只删除当前 receipt 精确登记的 checkout 和 branch
- **AND** MUST 保持其他任务的 checkouts、branches、receipts、preview、ports 和状态目录不变

#### Scenario: 请求删除远端或放弃未集成工作
- **WHEN** 清理需要删除远端任务分支、强制移除 dirty checkout 或放弃未被目标 ref 包含的提交
- **THEN** 本地 task environment 清理入口 MUST 拒绝该请求
- **AND** MUST NOT 将普通 cleanup 授权扩大为远端删除、强制删除或丢弃工作授权
