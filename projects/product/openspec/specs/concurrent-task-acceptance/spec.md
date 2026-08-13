# concurrent-task-acceptance Specification

## Purpose

定义两个任务并发开发与验证的组合验收、结构化证据和隔离边界，确保入口、预览、共享验证资源、目标分支竞态及清理在同一场景中可重复核验。

## Requirements

### Requirement: 双任务并发组合验收
Buildr MUST 提供可重复的双正式 Task 组合验收，在同一临时 canonical Workspace 中使用两个 Task Environment，覆盖 Environment Receipt 绑定 CLI 的实际执行、包含嵌套独立仓库的完整 scope、Buildr Web Preview 并发启动、验证资源协调、目标分支竞态、可恢复收尾和 Environment cleanup，并 MUST 输出可归因到两个 Task 的结构化证据。

#### Scenario: 两个任务从不同执行目录运行专属 CLI
- **WHEN** Candidate 验收创建两个正式 Task、分别准备 ready Task Environment，并从 canonical Workspace 或其中一个 Project 执行根调用 Environment Receipt 返回的绝对 CLI invocation
- **THEN** 每个 invocation MUST 实际执行成功，并通过 `task environment inspect <task-id> --target <canonical-workspace>` 绑定自己的 Task、Workspace、scope、Task checkout/provider evidence 和允许执行范围
- **AND** 调用 MUST 不依赖 retained controller content hash、cwd、`worktree context` 或 caller/session adoption，也不得解析或误用另一 Task 的执行根

#### Scenario: 多仓任务环境保持完整成员边界
- **WHEN** 临时 Workspace 登记入口仓库和至少一个嵌套独立仓库，并为两个 Task 准备相同 scope plan 的环境
- **THEN** 每个环境 MUST 在 canonical `source.path` 包含各自的嵌套 checkout
- **AND** Environment Receipt 与 CLI 执行证据 MUST 列出完整且互不串扰的 scope、Git provider evidence 和 allowed execution roots

#### Scenario: 两个任务并发运行且互不串扰
- **WHEN** Candidate 验收并发启动两个 Task 各自的 Preview 和正式 `verification run`
- **THEN** 两个 Task MUST 使用各自 Environment Receipt 绑定的执行根与绝对 CLI invocation，并使用不同的状态目录、实例身份和端口
- **AND** 普通消费 Workspace MAY 共享同一 retained Environment Manager，但 environment binding MUST 通过 Task ID、canonical Workspace、scope/provider 与 Environment root 明确区分，且不得依赖 manager content hash 或 cwd
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

### Requirement: 并发验收证据
整体验收 MUST 返回版本化摘要，记录两个任务的环境、实际 CLI 执行与 identity、多仓 membership、预览并发与端口、资源协调、目标竞态和恢复、产品清理结果、retained doctor 和真实 wall-clock；任一必需阶段缺失、子进程无完整终态或结构化输出不可解析时 MUST 失败并提供确定性诊断，而非推断通过。

#### Scenario: Candidate 消费验收结果
- **WHEN** Product Candidate 执行双任务并发整体验收
- **THEN** Candidate MUST 把该步骤作为 required gate
- **AND** 摘要 MUST 明确列出通过、失败、跳过阶段和精确清理状态
- **AND** 每个阶段的证据 MUST 对应真实执行动作，不得仅以路径存在、字段形状或底层原语调用冒充端到端通过

#### Scenario: 并发 worker 异常退出
- **WHEN** 预览或验证资源 worker 超时、异常退出、关闭事件与输出到达顺序发生竞争，或者没有产生完整结构化输出
- **THEN** 验收 MUST 收集退出码、信号、stdout、stderr 和 owner 信息后确定性失败
- **AND** 清理 MUST 释放已取得的任务资源，且不得留下孤儿进程或租约

### Requirement: 双任务验收必须消费正式 Workspace 验证入口
Candidate 双任务组合验收 MUST 在普通临时 Buildr Workspace 中使用 checkout 或 installed CLI，以两个 canonical Task Environments 并发调用显式 capability 的 `verification run`，再分别通过 Task Verification Application record/inspect 各自 current Result；不得直接把 `test/verification` 内部 module 当作通用执行或 Result authority。

#### Scenario: 两个 task 并发验证普通 Project
- **WHEN** 验收在两个 Task Environments 中同时执行 claim 同一 coordinated resource 的 Project v2 command capability
- **THEN** 共享 resource MUST 排队且两个 transient summaries MUST 分别绑定自己的 Environment、target identity 与 declaration identity
- **AND** 两个Task的current Results MUST位于各自SQLite current slot、互不覆盖，并在匹配target/declaration时均为current

#### Scenario: 一个 execution 中断
- **WHEN** 一个 worker 异常退出且未形成完整 Task 结论，另一个 worker 正常完成
- **THEN** 中断 Task 的已有 current Result MUST 保持不变，正常 Task MUST 可 record/inspect 新 Result
- **AND** transient cleanup 与 coordinated lease release MUST 精确按 run owner 完成

### Requirement: 双任务验收必须覆盖 runtime 所有权负向清理
Candidate 双任务组合验收 MUST 证明错误 Task 无法停止另一 Task 的 Preview，且 active Task 未取得完成或明确放弃资格时无法执行 Environment cleanup；最终清理 MUST 由 Task Environment 通过已登记的资源与 provider evidence 完成。

#### Scenario: 错误 owner 与提前清理均被拒绝
- **WHEN** Task A 尝试停止 Task B 的 Preview，或 active Task B 在 Preview 存活时请求 `task environment cleanup`
- **THEN** 两个动作 MUST 在不改变 Task B 资源、Environment Receipt 或 checkout 的情况下失败
- **AND** Task B 使用正确 Task identity 停止 Preview，并完成或明确放弃后，Environment cleanup MUST 成功且 retained Workspace 保持健康
