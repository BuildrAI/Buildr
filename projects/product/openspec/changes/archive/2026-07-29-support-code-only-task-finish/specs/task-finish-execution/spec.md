## ADDED Requirements

### Requirement: Task Finish 必须支持无 Change 的 code-only 候选
Task Finish MUST 以 receipt-bound task identity 作为所有 run 的主身份，并 MUST 允许调用方在不提供 OpenSpec Change 时创建 `candidateKind: code-only` 的 run。`project`、task environment、目标分支、Workspace Node identity 和 finish-ready candidate 保证 MUST 保持必需；产品 MUST NOT 为无 Change 候选创建、推断或选择虚假 Change。

#### Scenario: Code-only task environment 进入收尾
- **WHEN** 一个 `code-only + implementation` 任务在 receipt-bound canonical task environment 中达到 finish-ready，且调用方提供 Project 但不提供 Change
- **THEN** `task finish run` MUST 创建绑定 receipt task identity 的 `code-only` run
- **AND** MUST 继续执行候选提交、冻结、正式验证、目标分支交付、retained convergence 与 task-owned cleanup

#### Scenario: Change 候选保持兼容
- **WHEN** 调用方在 receipt-bound task environment 中同时提供 Project 与 Change
- **THEN** `task finish run` MUST 创建 `candidateKind: change` 的 run 并保持现有 Change 收敛语义
- **AND** 现有调用方 MUST NOT 被要求新增 caller task、fingerprint 或 execution plan

#### Scenario: 非 task environment 调用产品执行器
- **WHEN** 调用方直接从 retained canonical Workspace 启动产品 `task finish run`
- **THEN** 产品执行器 MUST 继续以稳定 `not_task_environment` 诊断拒绝
- **AND** MUST NOT 因 code-only 支持而在 dirty retained tree 中 stage、commit、verify 或移动用户改动

### Requirement: Code-only run 必须明确记录 Change 动作不适用
Task Finish MUST 对 code-only run 的 Change tasks、knowledge impact、OpenSpec strict/pure plan 和 convergence operation 返回稳定 `not-applicable` evidence，并 MUST 让其余适用门禁继续生效。结果、冻结身份和 completion receipt MUST 包含 task、`candidateKind`、可空 Change 与 Workspace Node identity。

#### Scenario: Code-only preflight
- **WHEN** preflight 处理 `candidateKind: code-only`
- **THEN** environment/CLI、Node、Project verification policy、Git/target 与 retained readiness MUST 正常检查
- **AND** Change/OpenSpec 专属 checks MUST 返回 `not-applicable`，不得执行 OpenSpec 命令或报告缺少 Change

#### Scenario: Code-only prepare
- **WHEN** code-only run 进入 prepare
- **THEN** prepare MUST 跳过 `openspec converge`，并继续 runtime sync、candidate commit、target convergence、fixed point 与 freeze
- **AND** command observations MUST 证明没有向 OpenSpec executable 传入空或推断的 Change identity

#### Scenario: Code-only completion
- **WHEN** code-only run 完成 deliver 与 cleanup
- **THEN** durable completion MUST 记录 `candidateKind: code-only`、task、`change: null`、candidate ref 和目标分支
- **AND** Change consumers MUST 能以 `candidateKind` 区分 not-applicable，而不是把 null Change 误报为丢失数据
