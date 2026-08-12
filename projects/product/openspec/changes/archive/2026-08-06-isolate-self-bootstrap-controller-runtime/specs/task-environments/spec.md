## ADDED Requirements

### Requirement: 自举 Task Validation Workspace 必须隔离候选 Structured Store
自举 Task Environment MUST 为 candidate runtime 的 migration、CLI、HTTP 和 Local App 验证提供 receipt-bound Task Validation Workspace 与独立 Workspace Structured Store。候选验证产生的 schema、ledger、Task 和测试数据 MUST 只存在于该验证边界；真实 Task lifecycle metadata MUST 继续由 receipt-pinned retained controller 写入 canonical Workspace。Environment cleanup 或 abandon MUST 只回收精确 Task-owned validation resources。

#### Scenario: candidate 验证 Task 功能
- **WHEN** candidate Buildr 在其 Task Validation Workspace 中创建 Task、运行 migration 或执行本地 smoke 测试
- **THEN** candidate MUST 使用验证 Workspace 的独立 Structured Store
- **AND** canonical Task Record、Development、Review、Verification、Retrospective、Environment 与 Finish state MUST 不受候选测试数据影响

#### Scenario: candidate Local App 启动 smoke
- **WHEN** Task Environment 为候选 Local App 启动验证服务
- **THEN** 服务 MUST 绑定 Task Validation Workspace，并将端口/进程作为 Task-owned resource 登记
- **AND** retained Local App MUST 继续绑定 canonical Workspace，且两者不得共享数据 store identity

#### Scenario: 清理 validation Workspace
- **WHEN** self-bootstrap Task 正常 cleanup 或按明确 abandon authorization cleanup
- **THEN** Environment MUST 只删除可证明属于该 Task Validation Workspace 的 store、sidecar 与服务资源
- **AND** MUST NOT 对 canonical Workspace database 执行 schema rollback、ledger rewrite 或数据删除

### Requirement: 真实 Task 写入必须使用 receipt-pinned retained controller
在 self-bootstrap topology 中，任何会改变 canonical Task lifecycle/structured data 的操作 MUST 使用 matching Environment Receipt 绑定的 retained controller executable 与 identity；调用方 MUST NOT 从候选 worktree cwd、shell PATH 或 candidate CLI 推断写入 authority。

#### Scenario: worktree 中请求真实 Task 更新
- **WHEN** Agent 或候选测试上下文需要创建、更新或记录 canonical Task lifecycle facts
- **THEN** dispatch MUST 调用 receipt-pinned retained controller
- **AND** candidate runtime MUST 只作为被测对象或 validation Workspace writer，不得成为 canonical writer
