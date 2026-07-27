# concurrent-task-acceptance Specification

## Purpose

定义两个任务并发开发与验证的组合验收、结构化证据和隔离边界，确保入口、预览、共享验证资源、目标分支竞态及清理在同一场景中可重复核验。

## Requirements

### Requirement: 双任务并发组合验收
Buildr MUST 提供可重复的双任务并发组合验收，在同一临时 Workspace 中使用两个真实 task environment 覆盖各自 CLI invocation、Local App 预览、验证资源协调、目标分支竞态和归属清理，并 MUST 输出可归因到两个任务的结构化证据。

#### Scenario: 两个任务并发运行且互不串扰
- **WHEN** Candidate 验收创建两个任务环境并同时启动各自预览和验证 run
- **THEN** 两个任务 MUST 使用各自 receipt 绑定的 checkout 与绝对 CLI invocation，并使用不同的状态目录、实例身份和端口
- **AND** 普通消费 Workspace MAY 共享同一外部产品 CLI identity，但 invocation 的 environment binding MUST 可区分且不得依赖 cwd
- **AND** 可并行资源 MUST 并行执行，共享容量资源 MUST 按声明排队并记录归属和等待证据

#### Scenario: 目标分支发生竞态
- **WHEN** 一个任务完成目标 ref observation 后另一个任务推进同一目标分支
- **THEN** 前一个任务 MUST 返回 `target-race` 并停止覆盖新的目标 ref
- **AND** 恢复 MUST 只重跑失效步骤及其下游

#### Scenario: 整体验收完成清理
- **WHEN** 双任务场景成功或失败后进入清理
- **THEN** Buildr MUST 只停止和删除各任务拥有的预览、租约、worktree 与本地任务分支
- **AND** retained checkout MUST 保持健康且不得残留任务运行状态

### Requirement: 并发验收证据
整体验收 MUST 返回版本化摘要，记录两个任务的环境与 CLI identity、预览端口、资源协调、目标竞态、清理结果、retained doctor 和真实 wall-clock；任一必需阶段缺失时 MUST 失败而非推断通过。

#### Scenario: Candidate 消费验收结果
- **WHEN** Product Candidate 执行双任务并发整体验收
- **THEN** Candidate MUST 把该步骤作为 required gate
- **AND** 摘要 MUST 明确列出通过、失败、跳过阶段和精确清理状态
