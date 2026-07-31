# concurrent-task-acceptance Specification

## Purpose

定义两个任务并发开发与验证的组合验收、结构化证据和隔离边界，确保入口、预览、共享验证资源、目标分支竞态及清理在同一场景中可重复核验。

## Requirements

### Requirement: 双任务并发组合验收
Buildr MUST 提供可重复的双任务并发组合验收，在同一临时 Workspace 中使用两个真实 task environment 覆盖 receipt 绑定 CLI 的实际执行、包含嵌套独立仓库的完整 repository membership、Local App 预览并发启动、验证资源协调、目标分支竞态、可恢复收尾和产品化归属清理，并 MUST 输出可归因到两个任务的结构化证据。

#### Scenario: 两个任务从不同执行目录运行专属 CLI
- **WHEN** Candidate 验收创建两个任务环境，并分别从 Workspace、Product 或 Service cwd 调用 receipt 返回的绝对 CLI invocation
- **THEN** 每个 invocation MUST 实际执行成功并绑定自己的 task environment、checkout、CLI identity 和允许执行范围
- **AND** 调用 MUST 不依赖 cwd，也不得解析或误用另一任务的 checkout

#### Scenario: 多仓任务环境保持完整成员边界
- **WHEN** 临时 Workspace 登记入口仓库和至少一个嵌套独立仓库，并为两个任务创建相同 repository plan 的环境
- **THEN** 每个环境 MUST 在 canonical source path 包含各自的嵌套 checkout
- **AND** receipt、context 与 CLI 执行证据 MUST 列出完整且互不串扰的 repository membership 和 allowed execution roots

#### Scenario: 两个任务并发运行且互不串扰
- **WHEN** Candidate 验收并发启动两个任务各自的预览和验证 run
- **THEN** 两个任务 MUST 使用各自 receipt 绑定的 checkout 与绝对 CLI invocation，并使用不同的状态目录、实例身份和端口
- **AND** 普通消费 Workspace MAY 共享同一外部产品 CLI identity，但 invocation 的 environment binding MUST 可区分且不得依赖 cwd
- **AND** 可并行资源 MUST 同时执行，共享容量资源 MUST 按声明排队并记录归属和等待证据

#### Scenario: 目标分支发生竞态
- **WHEN** 一个任务完成目标 ref observation 后另一个任务推进同一目标分支
- **THEN** 前一个任务 MUST 返回 `target-race` 并停止覆盖新的目标 ref
- **AND** 通过正式收尾恢复入口继续时，MUST 只重跑失效步骤及其下游，并保留已通过且仍有效的步骤证据

#### Scenario: 整体验收完成清理
- **WHEN** 双任务场景成功或失败后进入清理
- **THEN** Buildr MUST 通过产品清理入口只停止和删除各任务拥有的预览、租约、worktree 与本地任务分支
- **AND** 对不匹配的 owner、environment 或 receipt MUST fail closed，不得由验收脚本绕过产品归属检查直接删除
- **AND** retained checkout MUST 保持健康且不得残留任务运行状态

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
Candidate 双任务组合验收 MUST 在普通临时 Buildr Workspace 中使用 checkout 或已安装 CLI 的 `verification run`，以两个 canonical task environment 并发执行 Project 声明，而不得直接把 `test/verification` 内部模块作为通用能力的替代证据。

#### Scenario: 两个 task 并发验证普通 Project
- **WHEN** 验收在两个 task environment 中同时运行包含 isolated/namespaced 与 coordinated 资源的 Project 验证计划
- **THEN** 可并行 worker MUST 有真实执行重叠，共享 coordinated resource MUST 排队
- **AND** 两份摘要 MUST 分别绑定自己的 environment、candidate 与非空 `evidenceIdentity`

### Requirement: 双任务验收必须覆盖 runtime 所有权负向清理
Candidate 双任务组合验收 MUST 证明错误 owner 无法停止另一 task 的 preview，且运行中 task-owned preview/process 会阻止 worktree cleanup；最终清理 MUST 通过产品入口由真实 owner 完成。

#### Scenario: 错误 owner 与提前清理均被拒绝
- **WHEN** task A 尝试停止 task B 的 preview，或 task B 在 preview 存活时请求 cleanup environment
- **THEN** 两个动作 MUST 在不改变 task B 运行状态或 checkout 的情况下失败
- **AND** task B 使用正确 receipt 停止 preview 后，正式 cleanup MUST 成功且 retained Workspace 保持健康
