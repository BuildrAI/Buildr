## MODIFIED Requirements

### Requirement: 双任务并发组合验收
Buildr MUST 提供可重复的双正式 Task 组合验收，在同一临时 canonical Workspace 中使用两个 Task Environment，覆盖 Environment Receipt 绑定 CLI 的实际执行、包含嵌套独立仓库的完整 scope、Local App Preview 并发启动、验证资源协调、目标分支竞态、可恢复收尾和 Environment cleanup，并 MUST 输出可归因到两个 Task 的结构化证据。

#### Scenario: 两个任务从不同执行目录运行专属 CLI
- **WHEN** Candidate 验收创建两个正式 Task、分别准备 ready Task Environment，并从 canonical Workspace 或其中一个 Project 执行根调用 Environment Receipt 返回的绝对 CLI invocation
- **THEN** 每个 invocation MUST 实际执行成功，并通过 `task environment inspect <task-id> --target <canonical-workspace>` 绑定自己的 Task、scope、controller identity 和允许执行范围
- **AND** 调用 MUST 不依赖 cwd、`worktree context` 或 caller/session adoption，也不得解析或误用另一 Task 的执行根

#### Scenario: 多仓任务环境保持完整成员边界
- **WHEN** 临时 Workspace 登记入口仓库和至少一个嵌套独立仓库，并为两个 Task 准备相同 scope plan 的环境
- **THEN** 每个环境 MUST 在 canonical `source.path` 包含各自的嵌套 checkout
- **AND** Environment Receipt 与 CLI 执行证据 MUST 列出完整且互不串扰的 scope、Git provider evidence 和 allowed execution roots

#### Scenario: 两个任务并发运行且互不串扰
- **WHEN** Candidate 验收并发启动两个 Task 各自的 Preview 和正式 `verification run`
- **THEN** 两个 Task MUST 使用各自 Environment Receipt 绑定的执行根与绝对 CLI invocation，并使用不同的状态目录、实例身份和端口
- **AND** 普通消费 Workspace MAY 共享同一稳定 controller identity，但 environment binding MUST 通过 Task ID 和 canonical Workspace 明确区分，且不得依赖 cwd
- **AND** 可并行资源 MUST 同时执行，共享容量资源 MUST 按声明排队并记录 Task 归属和等待证据

#### Scenario: 目标分支发生竞态
- **WHEN** 一个 Task 完成目标 ref observation 后另一个 Task 推进同一目标分支
- **THEN** 前一个 Task MUST 返回 `target-race` 并停止覆盖新的目标 ref
- **AND** 通过正式收尾恢复入口继续时，MUST 只重跑失效步骤及其下游，并保留已通过且仍有效的步骤证据

#### Scenario: 整体验收完成清理
- **WHEN** 双 Task 场景成功或失败后进入清理
- **THEN** Buildr MUST 先通过产品资源入口停止或释放各 Task 拥有的 Preview 与验证资源，再在 Task 完成或明确放弃后调用 `task environment cleanup`
- **AND** Environment cleanup MUST 编排 provider cleanup；验收脚本不得绕过 Environment Receipt 直接删除 checkout、任务分支或其他 Task 的资源
- **AND** 清理任一 Task 后，另一 Task 的环境 MUST 仍可检查，retained checkout MUST 保持健康且不得残留任务运行状态

### Requirement: 双任务验收必须覆盖 runtime 所有权负向清理
Candidate 双任务组合验收 MUST 证明错误 Task 无法停止另一 Task 的 Preview，且 active Task 未取得完成或明确放弃资格时无法执行 Environment cleanup；最终清理 MUST 由 Task Environment 通过已登记的资源与 provider evidence 完成。

#### Scenario: 错误 owner 与提前清理均被拒绝
- **WHEN** Task A 尝试停止 Task B 的 Preview，或 active Task B 在 Preview 存活时请求 `task environment cleanup`
- **THEN** 两个动作 MUST 在不改变 Task B 资源、Environment Receipt 或 checkout 的情况下失败
- **AND** Task B 使用正确 Task identity 停止 Preview，并完成或明确放弃后，Environment cleanup MUST 成功且 retained Workspace 保持健康
